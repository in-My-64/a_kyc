// src/pages/api/session.ts
/**
 * Session endpoints for the customer/officer portals.
 *
 * POST   /api/session           → login (sets httpOnly cookie)
 * GET    /api/session           → current user, or 401 if no session
 * DELETE /api/session           → logout (clears cookie)
 *
 * The token itself never reaches the browser: it is stored in an
 * httpOnly cookie and forwarded to Django from `proxy/[...path].ts`.
 * Login is the ONLY place token auth happens client-side, because the
 * browser has to ask us for one before it can hold a cookie.
 *
 * The `next` query on redirects (login → dashboard) is handled by the
 * page components, not here. This file only knows about cookies and
 * the two upstream calls.
 */

import type { NextApiRequest, NextApiResponse } from "next";

import type { CustomerRead, TokenResponse } from "@/lib/types";

const API_URL = process.env.API_URL ?? "http://localhost:8000";
const SESSION_COOKIE = "kyc_session";
const SESSION_MAX_AGE = 60 * 60 * 24 * 7; // 7 days
const IS_PROD = process.env.NODE_ENV === "production";

interface UpstreamResult<T> {
  ok: boolean;
  status: number;
  data: T | null;
}

async function fetchUpstream<T>(
  path: string,
  init: RequestInit = {},
): Promise<UpstreamResult<T>> {
  try {
    const res = await fetch(`${API_URL}${path}`, {
      ...init,
      headers: {
        Accept: "application/json",
        ...(init.headers ?? {}),
      },
      cache: "no-store",
    });

    const contentType = res.headers.get("content-type") ?? "";
    const data = contentType.includes("application/json")
      ? ((await res.json()) as T)
      : null;

    return { ok: res.ok, status: res.status, data };
  } catch {
    return { ok: false, status: 0, data: null };
  }
}

function buildCookie(value: string, maxAge: number): string {
  const parts = [
    `${SESSION_COOKIE}=${value}`,
    "Path=/",
    "HttpOnly",
    "SameSite=Lax",
    `Max-Age=${maxAge}`,
  ];
  if (IS_PROD) parts.push("Secure");
  return parts.join("; ");
}

// ---------------------------------------------------------------------------
// POST — login
// ---------------------------------------------------------------------------

async function handleLogin(req: NextApiRequest, res: NextApiResponse) {
  const { username, password } = (req.body ?? {}) as {
    username?: string;
    password?: string;
  };

  if (!username || !password) {
    return res.status(400).json({
      error: "bad_request",
      message: "Username and password are required.",
    });
  }

  const tokenRes = await fetchUpstream<TokenResponse>("/api/auth/token/", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username, password }),
  });

  if (!tokenRes.ok || !tokenRes.data?.token) {
    const detail = tokenRes.data as unknown as {
      detail?: string;
      non_field_errors?: string[];
    } | null;

    const message =
      detail?.detail ??
      detail?.non_field_errors?.[0] ??
      (tokenRes.status === 429
        ? "Too many login attempts. Please try again later."
        : "Invalid username or password.");

    return res.status(tokenRes.status || 401).json({
      error: tokenRes.status === 429 ? "rate_limited" : "unauthorized",
      message,
    });
  }

  // Fetch the profile now so the client gets it in one round trip.
  const meRes = await fetchUpstream<CustomerRead>("/api/customers/me/", {
    headers: { Authorization: `Token ${tokenRes.data.token}` },
  });

  if (!meRes.ok || !meRes.data) {
    return res.status(502).json({
      error: "bad_gateway",
      message: "Could not load user profile after login.",
    });
  }

  res.setHeader(
    "Set-Cookie",
    buildCookie(tokenRes.data.token, SESSION_MAX_AGE),
  );
  return res.status(200).json({ user: meRes.data });
}

// ---------------------------------------------------------------------------
// GET — current user
// ---------------------------------------------------------------------------

async function handleGet(req: NextApiRequest, res: NextApiResponse) {
  const token = req.cookies[SESSION_COOKIE];

  if (!token) {
    return res.status(401).json({
      error: "unauthorized",
      message: "Not authenticated.",
    });
  }

  const meRes = await fetchUpstream<CustomerRead>("/api/customers/me/", {
    headers: { Authorization: `Token ${token}` },
  });

  if (!meRes.ok || !meRes.data) {
    // Token is dead. Clear it so the browser stops sending it and the
    // client stops retrying.
    res.setHeader("Set-Cookie", buildCookie("", 0));
    return res.status(401).json({
      error: "unauthorized",
      message: "Session expired.",
    });
  }

  return res.status(200).json({ user: meRes.data });
}

// ---------------------------------------------------------------------------
// DELETE — logout
// ---------------------------------------------------------------------------

function handleDelete(_req: NextApiRequest, res: NextApiResponse) {
  res.setHeader("Set-Cookie", buildCookie("", 0));
  return res.status(200).json({ ok: true });
}

// ---------------------------------------------------------------------------
// Dispatch
// ---------------------------------------------------------------------------

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
) {
  switch (req.method) {
    case "POST":
      return handleLogin(req, res);
    case "GET":
      return handleGet(req, res);
    case "DELETE":
      return handleDelete(req, res);
    default:
      res.setHeader("Allow", "GET, POST, DELETE");
      return res.status(405).json({
        error: "method_not_allowed",
        message: "Method not allowed.",
      });
  }
}