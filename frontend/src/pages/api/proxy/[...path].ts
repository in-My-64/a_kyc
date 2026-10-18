// src/pages/api/proxy/[...path].ts
/**
 * Authenticated passthrough to the Django backend.
 *
 * Every call from `src/lib/api.ts` arrives here as
 *   /api/proxy/<django-path>
 * and is forwarded to `${API_URL}/api/<django-path>/` with the session
 * token attached as `Authorization: Token <token>`.
 *
 * The token lives in an httpOnly cookie, so client JavaScript never
 * sees it. That is the whole reason this proxy exists — the browser
 * cannot send the Authorization header to Django directly without the
 * token being exposed to any XSS that lands in the page.
 *
 * The trailing slash is appended unconditionally because Django's
 * DefaultRouter generates URLs with it, and `APPEND_SLASH = False` in
 * base.py means Django will not add it for us.
 */

import type { NextApiRequest, NextApiResponse } from "next";

const API_URL = process.env.API_URL ?? "http://localhost:8000";
const SESSION_COOKIE = "kyc_session";

// Headers that survive the round trip. `content-type` is critical: the
// document preview endpoint returns image/png and the browser refuses
// to render an <img> whose response has no MIME type.
const PASSTHROUGH_HEADERS = [
  "content-type",
  "content-disposition",
  "content-length",
  "x-total-count",
  "link",
] as const;

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
) {
  const segments = req.query.path;
  const path = Array.isArray(segments) ? segments.join("/") : segments ?? "";

  // Forward every query param except Next's catch-all `path`.
  const forwardedQuery = new URLSearchParams();
  for (const [key, value] of Object.entries(req.query)) {
    if (key === "path" || value === undefined) continue;
    if (Array.isArray(value)) {
      for (const item of value) forwardedQuery.append(key, item);
    } else {
      forwardedQuery.append(key, value);
    }
  }

  const queryString = forwardedQuery.toString();
  const target = `${API_URL}/api/${path}/${queryString ? `?${queryString}` : ""}`;

  // Build upstream headers.
  const upstreamHeaders: Record<string, string> = {
    Accept: (req.headers.accept as string) ?? "application/json",
  };
  if (req.headers["content-type"]) {
    upstreamHeaders["Content-Type"] = req.headers["content-type"] as string;
  }
  const token = req.cookies[SESSION_COOKIE];
  if (token) {
    upstreamHeaders.Authorization = `Token ${token}`;
  }
  const forwardedFor = req.headers["x-forwarded-for"];
  if (typeof forwardedFor === "string") {
    upstreamHeaders["X-Forwarded-For"] = forwardedFor;
  }

  const method = (req.method ?? "GET").toUpperCase();
  const hasBody = method !== "GET" && method !== "HEAD";

  try {
    const upstream = await fetch(target, {
      method,
      headers: upstreamHeaders,
      body: hasBody ? await readBody(req) : undefined,
      cache: "no-store",
      redirect: "manual",
    });

    // Copy the response through. We do NOT try to parse JSON here —
    // the client (`src/lib/api.ts`) does that. This handler moves bytes.
    for (const name of PASSTHROUGH_HEADERS) {
      const value = upstream.headers.get(name);
      if (value) res.setHeader(name, value);
    }

    // A 401 means the token is dead (expired, revoked, wrong). Clear
    // the cookie so the client stops retrying with it.
    if (upstream.status === 401) {
      res.setHeader(
        "Set-Cookie",
        `${SESSION_COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`,
      );
    }

    const buffer = Buffer.from(await upstream.arrayBuffer());
    return res.status(upstream.status).send(buffer);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return res.status(502).json({
      error: "service_unavailable",
      message: "Upstream service unavailable.",
      detail: { upstream_error: message },
    });
  }
}

/**
 * Read the request body as a Buffer, except for multipart requests.
 *
 * For multipart, Next.js has already buffered the file into memory
 * (and `bodyParser` handles the encoding), so we pass the raw stream
 * straight through. For JSON and anything else, read the whole body.
 */
async function readBody(req: NextApiRequest): Promise<BodyInit | undefined> {
  const contentType = (req.headers["content-type"] ?? "").toLowerCase();

  if (contentType.startsWith("multipart/form-data")) {
    return new Promise((resolve, reject) => {
      const chunks: Buffer[] = [];
      req.on("data", (chunk: Buffer) => chunks.push(chunk));
      req.on("end", () => resolve(Buffer.concat(chunks)));
      req.on("error", reject);
    });
  }

  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on("data", (chunk: Buffer) => chunks.push(chunk));
    req.on("end", () => resolve(Buffer.concat(chunks)));
    req.on("error", reject);
  });
}

/**
 * Next.js route config. We disable the default body parser so large
 * multipart uploads stream through intact instead of being rejected
 * by Next's 1 MB limit (which is lower than our own 10 MB limit).
 */
export const config = {
  api: {
    bodyParser: false,
    sizeLimit: "10mb",
  },
};