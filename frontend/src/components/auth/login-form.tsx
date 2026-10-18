"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/router";
import {
  AlertTriangle,
  ArrowRight,
  Check,
  Loader2,
  X,
} from "lucide-react";

import { APP_NAME, ROUTES } from "@/lib/constants";
import { useLogin } from "@/lib/hooks";
import { ApiError } from "@/lib/api";
import {
  safeRedirect,
  sanitizePassword,
  sanitizeUsername,
  validatePassword,
  validateUsername,
} from "@/lib/validation";
import { Button, Spinner } from "@/components/ui/primitives";
import { Field, Input, PasswordInput } from "@/components/ui/form";
import { Alert } from "@/components/ui/surfaces";

// ===========================================================================
// Component
// ===========================================================================

export function LoginForm({ next }: { next?: string }) {
  const router = useRouter();

  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [touched, setTouched] = useState({ username: false, password: false });
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [capsLock, setCapsLock] = useState(false);
  const [retryIn, setRetryIn] = useState<number | null>(null);

  const usernameRef = useRef<HTMLInputElement>(null);
  const passwordRef = useRef<HTMLInputElement>(null);

  // ---- Derived field errors ----------------------------------------------

  const usernameError = touched.username ? validateUsername(username) : null;
  const passwordError = touched.password ? validatePassword(password) : null;
  const formValid = !validateUsername(username) && !validatePassword(password);

  // ---- Login mutation ----------------------------------------------------

  const login = useLogin({
    onSuccess: (data) => {
      const fallback = data.user.is_staff
        ? ROUTES.officer.dashboard
        : ROUTES.customer.dashboard;
      router.replace(safeRedirect(next, fallback));
    },
    onError: (err) => {
      setSubmitError(describeError(err));
      // If it's a rate-limit, drop into a cooldown that ticks down.
      if (err instanceof ApiError && err.status === 429) {
        startCooldown(30);
      }
    },
  });

  // ---- Cooldown timer (rate-limit) ---------------------------------------

  useEffect(() => {
    if (retryIn === null) return;
    if (retryIn <= 0) {
      setRetryIn(null);
      return;
    }
    const t = setTimeout(() => setRetryIn((n) => (n === null ? null : n - 1)), 1000);
    return () => clearTimeout(t);
  }, [retryIn]);

  function startCooldown(seconds: number) {
    setRetryIn(seconds);
  }

  // ---- Focus management --------------------------------------------------

  useEffect(() => {
    usernameRef.current?.focus();
  }, []);

  // ---- Submit ------------------------------------------------------------

  const handleSubmit = useCallback(
    (e: React.FormEvent) => {
      e.preventDefault();
      setTouched({ username: true, password: true });
      setSubmitError(null);

      const cleanUsername = sanitizeUsername(username);
      const cleanPassword = sanitizePassword(password);

      const uErr = validateUsername(cleanUsername);
      const pErr = validatePassword(cleanPassword);

      if (uErr) {
        usernameRef.current?.focus();
        return;
      }
      if (pErr) {
        passwordRef.current?.focus();
        return;
      }
      if (retryIn !== null && retryIn > 0) return;

      login.mutate({ username: cleanUsername, password: cleanPassword });
    },
    [username, password, login, retryIn],
  );

  // ---- Input handlers ----------------------------------------------------

  function handleUsernameChange(value: string) {
    setUsername(value);
    if (submitError) setSubmitError(null);
  }

  function handlePasswordChange(value: string) {
    setPassword(value);
    if (submitError) setSubmitError(null);
  }

  function handleCapsCheck(e: React.KeyboardEvent<HTMLInputElement>) {
    try {
      setCapsLock(e.getModifierState?.("CapsLock") ?? false);
    } catch {
      /* getModifierState is not universally available */
    }
  }

  const submitting = login.isPending;
  const locked = retryIn !== null && retryIn > 0;
  const canSubmit = !submitting && !locked;

  // ---- Render ------------------------------------------------------------

  return (
    <form onSubmit={handleSubmit} noValidate className="space-y-5">
      {/* Status banner (submit error or rate-limit) */}
      {submitError && (
        <Alert tone="danger" className="animate-in fade-in slide-in-from-top-1">
          <div className="flex items-start gap-2">
            <AlertTriangle className="mt-0.5 size-4 shrink-0" />
            <div className="min-w-0 flex-1">
              <p className="font-semibold">{submitError}</p>
              {locked && (
                <p className="mt-1 text-xs opacity-80">
                  Try again in {retryIn}s.
                </p>
              )}
            </div>
          </div>
        </Alert>
      )}

      {/* Username */}
      <Field
        label="Username"
        htmlFor="username"
        required
        error={usernameError ?? undefined}
      >
        <div className="relative">
          <Input
            ref={usernameRef}
            id="username"
            name="username"
            type="text"
            inputMode="text"
            autoComplete="username"
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck={false}
            placeholder="your.username"
            value={username}
            onChange={(e) => handleUsernameChange(e.target.value)}
            onBlur={() => setTouched((t) => ({ ...t, username: true }))}
            disabled={submitting}
            error={!!usernameError}
            className="h-12 pr-10 text-base"
          />
          {touched.username && username && !usernameError && (
            <Check className="pointer-events-none absolute right-3 top-1/2 size-4 -translate-y-1/2 text-[var(--success)]" />
          )}
        </div>
      </Field>

      {/* Password */}
      <Field
        label="Password"
        htmlFor="password"
        required
        error={passwordError ?? undefined}
      >
        <div className="relative">
          <PasswordInput
            ref={passwordRef}
            id="password"
            name="password"
            autoComplete="current-password"
            placeholder="••••••••"
            value={password}
            onChange={(e) => handlePasswordChange(e.target.value)}
            onBlur={() => setTouched((t) => ({ ...t, password: true }))}
            onKeyDown={handleCapsCheck}
            onKeyUp={handleCapsCheck}
            disabled={submitting}
            error={!!passwordError}
            className="h-12 text-base"
          />
        </div>
      </Field>

      {capsLock && (
        <div className="flex items-center gap-2 rounded-lg border border-[var(--warning-border)] bg-[var(--warning-soft)] px-3 py-2 text-xs">
          <AlertTriangle className="size-3.5 shrink-0 text-[var(--warning)]" />
          <span className="font-semibold text-[var(--warning)]">
            Caps Lock is on
          </span>
        </div>
      )}

      {/* Submit */}
      <Button
        type="submit"
        size="lg"
        loading={submitting}
        disabled={!canSubmit}
        className="h-12 w-full text-base"
      >
        {submitting ? (
          <>
            <Loader2 className="size-4 animate-spin" />
            Signing in…
          </>
        ) : locked ? (
          <>
            <Loader2 className="size-4 animate-spin" />
            Locked · {retryIn}s
          </>
        ) : (
          <>
            Sign in
            <ArrowRight className="size-4" />
          </>
        )}
      </Button>

      {/* Footer */}
      <p className="pt-2 text-center text-sm text-[var(--muted)]">
        Don&apos;t have an account?{" "}
        <Link
          href={ROUTES.register}
          className="font-semibold text-[var(--primary)] hover:underline"
        >
          Create one
        </Link>
      </p>
    </form>
  );
}

// ===========================================================================
// Error mapping — one place, every server failure classified
// ===========================================================================

function describeError(err: unknown): string {
  if (err instanceof ApiError) {
    switch (err.status) {
      case 400:
      case 401:
        // Never leak which field failed — enumeration defence.
        return "Invalid username or password.";
      case 403:
        return "Your account is disabled. Contact support.";
      case 429:
        return "Too many sign-in attempts.";
      case 502:
      case 503:
      case 504:
        return "Service temporarily unavailable. Try again shortly.";
      default:
        return err.message || "Sign-in failed.";
    }
  }
  if (err instanceof TypeError && err.message.includes("fetch")) {
    return "Can't reach the server. Check your connection.";
  }
  return "Sign-in failed. Please try again.";
}
