// src/middleware.ts
/**
 * Route protection.
 *
 * Two rules, applied in order:
 *
 *   1. Not authenticated, hitting a protected route → redirect to
 *      /login with ?next=<original-path>. The login page honours
 *      `next` after a successful sign-in.
 *
 *   2. Authenticated, hitting /login or /register → redirect to
 *      /customer. Nobody should sit on a sign-in screen with a valid
 *      session.
 *
 * `/` is treated as public and handled by getServerSideProps on the
 * landing page (which redirects to /login when no session exists and
 * to the role-appropriate dashboard when one does).
 *
 * The session cookie is httpOnly, so its presence is all this file
 * can check. It does NOT verify the token against Django — that would
 * add a network hop to every page render. Dead-token handling lives
 * in the proxy (401 → clear cookie) and in /api/session GET.
 */

import { NextResponse, type NextRequest } from "next/server";

const SESSION_COOKIE = "kyc_session";

const AUTH_ONLY_ROUTES = new Set(["/login", "/register"]);

/** Routes reachable without a session. Everything else is protected. */
const PUBLIC_PREFIXES = [
  "/_next",
  "/api",
  "/favicon.ico",
  "/robots.txt",
];

function isPublicPath(pathname: string): boolean {
  if (pathname === "/") return true;
  if (AUTH_ONLY_ROUTES.has(pathname)) return true;
  return PUBLIC_PREFIXES.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`),
  );
}

export function middleware(request: NextRequest) {
  const { pathname, search } = request.nextUrl;
  const hasSession = Boolean(request.cookies.get(SESSION_COOKIE)?.value);

  // Authenticated user on a sign-in page → send them home.
  if (hasSession && AUTH_ONLY_ROUTES.has(pathname)) {
    return NextResponse.redirect(new URL("/customer", request.url));
  }

  // Unauthenticated user on a protected page → send them to sign in.
  if (!hasSession && !isPublicPath(pathname)) {
    const loginUrl = new URL("/login", request.url);
    loginUrl.searchParams.set("next", `${pathname}${search}`);
    return NextResponse.redirect(loginUrl);
  }

  return NextResponse.next();
}

export const config = {
  // Run on every path except static assets the browser fetches directly.
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};