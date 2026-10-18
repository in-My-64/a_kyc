// src/pages/index.tsx
/**
 * Landing route.
 *
 * Middleware already redirects unauthenticated traffic to /login, and
 * signed-in users away from /login|/register. What it can't do is read
 * the user object (the cookie is httpOnly), so it can't pick a portal
 * by role. That job lands here.
 *
 * The page itself is a redirect surface. Anything visible is a fallback
 * for the split second before `router.replace` fires.
 */

import { useEffect } from "react";
import { useRouter } from "next/router";

import { ROUTES } from "@/lib/constants";
import { useMe } from "@/lib/hooks";
import { Spinner } from "@/components/ui/primitives";

export default function LandingPage() {
  const router = useRouter();
  const { data: user, isLoading, isError } = useMe();

  useEffect(() => {
    if (isLoading) return;

    if (isError || !user) {
      router.replace(ROUTES.login);
      return;
    }

    router.replace(
      user.is_staff ? ROUTES.officer.dashboard : ROUTES.customer.dashboard,
    );
  }, [user, isLoading, isError, router]);

  return (
    <div className="grid min-h-screen place-items-center bg-[var(--bg)]">
      <div className="flex flex-col items-center gap-3 text-[var(--muted)]">
        <Spinner className="size-5 text-[var(--primary)]" />
        <p className="text-sm">Redirecting…</p>
      </div>
    </div>
  );
}