// src/lib/api.ts
/**
 * HTTP client for the Django backend.
 *
 * Every call goes through the Next.js proxy at /api/proxy/*, which reads
 * the session token from the httpOnly cookie and attaches it as
 * `Authorization: Token <token>` before forwarding to Django. The token
 * never reaches client JavaScript.
 */

export type QueryValue = string | number | boolean | null | undefined;
export type Query = Record<string, QueryValue | QueryValue[]>;

export interface RequestOptions {
  query?: object;
  signal?: AbortSignal;
  headers?: Record<string, string>;
}

export class ApiError extends Error {
  readonly status: number;
  readonly body: unknown;

  constructor(status: number, message: string, body: unknown) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.body = body;
  }

  get isUnauthorized() { return this.status === 401; }
  get isForbidden()    { return this.status === 403; }
  get isNotFound()     { return this.status === 404; }
  get isConflict()     { return this.status === 409; }

  fieldErrors(): Record<string, string[]> | null {
    if (!this.body || typeof this.body !== "object" || Array.isArray(this.body)) {
      return null;
    }
    const out: Record<string, string[]> = {};
    for (const [key, value] of Object.entries(this.body as Record<string, unknown>)) {
      if (Array.isArray(value) && value.every((v) => typeof v === "string")) {
        out[key] = value as string[];
      } else if (typeof value === "string") {
        out[key] = [value];
      }
    }
    return Object.keys(out).length ? out : null;
  }
}

const PROXY = "/api/proxy";

function buildQuery(query?: object): string {
  if (!query) return "";
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    if (value === undefined || value === null || value === "") continue;
    if (Array.isArray(value)) {
      for (const item of value) {
        if (item !== undefined && item !== null && item !== "") {
          params.append(key, String(item));
        }
      }
    } else {
      params.append(key, String(value));
    }
  }
  const qs = params.toString();
  return qs ? `?${qs}` : "";
}

/**
 * Turn whatever the backend sent into a human-readable message.
 *
 * The envelope the backend actually emits is
 * `{ error: "snake_case_code", message: "human text", detail?: ... }`.
 * So the prose lives under `message`, not `error` — reading `error`
 * first used to surface the code ("conflict", "unauthorized") to the
 * user instead of the sentence written for them. `detail` comes first
 * because DRF's own failure mode is a bare `{"detail": "..."}`.
 */
function extractMessage(status: number, body: unknown): string {
  if (typeof body === "string" && body.trim()) return body.trim();
  if (body && typeof body === "object") {
    const b = body as Record<string, unknown>;
    if (typeof b.detail === "string") return b.detail;
    if (typeof b.message === "string") return b.message;
    if (typeof b.error === "string") return b.error;
    if (Array.isArray(b.non_field_errors) && b.non_field_errors.length) {
      return String(b.non_field_errors[0]);
    }
  }
  return `Request failed with status ${status}`;
}

async function send<T>(
  method: string,
  path: string,
  body: unknown,
  options: RequestOptions,
): Promise<T> {
  const cleanPath = path.replace(/^\/+|\/+$/g, "");
  const url = `${PROXY}/${cleanPath}${buildQuery(options.query)}`;

  const headers: Record<string, string> = {
    Accept: "application/json",
    ...options.headers,
  };

  let payload: BodyInit | undefined;
  if (body !== undefined && body !== null) {
    if (typeof FormData !== "undefined" && body instanceof FormData) {
      payload = body;
    } else {
      headers["Content-Type"] = "application/json";
      payload = JSON.stringify(body);
    }
  }

  const res = await fetch(url, {
    method,
    headers,
    body: payload,
    credentials: "same-origin",
    signal: options.signal,
  });

  if (res.status === 204) return undefined as T;

  const contentType = res.headers.get("content-type") ?? "";
  const parsed = contentType.includes("application/json")
    ? await res.json().catch(() => null)
    : await res.text().catch(() => "");

  if (!res.ok) {
    throw new ApiError(res.status, extractMessage(res.status, parsed), parsed);
  }

  return parsed as T;
}

export const api = {
  get:   <T>(path: string, options: RequestOptions = {}) =>
           send<T>("GET", path, undefined, options),
  post:  <T>(path: string, body?: unknown, options: RequestOptions = {}) =>
           send<T>("POST", path, body, options),
  patch: <T>(path: string, body?: unknown, options: RequestOptions = {}) =>
           send<T>("PATCH", path, body, options),
  del:   <T>(path: string, options: RequestOptions = {}) =>
           send<T>("DELETE", path, undefined, options),
};