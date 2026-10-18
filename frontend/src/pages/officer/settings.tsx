// src/pages/officer/settings.tsx
"use client";

import { useState } from "react";
import { useRouter } from "next/router";
import {
  Check,
  KeyRound,
  LogOut,
  Settings as SettingsIcon,
  ShieldCheck,
  X,
} from "lucide-react";

import { ROUTES } from "@/lib/constants";
import { useHealth, useMe, useSetPassword } from "@/lib/hooks";
import { formatDateTime } from "@/lib/utils";
import { ApiError } from "@/lib/api";
import type { PasswordChangeInput } from "@/lib/types";
import { Button, StatusPill } from "@/components/ui/primitives";
import {
  Alert,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Skeleton,
} from "@/components/ui/surfaces";
import { Field, PasswordInput } from "@/components/ui/form";

export default function OfficerSettingsPage() {
  const router = useRouter();
  const { data: user, isLoading, isError, error } = useMe();

  async function handleLogout() {
    await fetch("/api/session", { method: "DELETE" });
    router.replace(ROUTES.login);
  }

  if (isLoading) {
    return <SettingsSkeleton />;
  }

  if (isError || !user) {
    return (
      <Alert tone="danger" title="Couldn't load your profile">
        {error instanceof Error ? error.message : "Please refresh the page."}
      </Alert>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Settings</h1>
        <p className="mt-1 text-sm text-[var(--muted)]">
          Your officer account and console preferences.
        </p>
      </div>

      <AccountCard user={user} />
      <BackendHealthCard />
      <PasswordCard />
      <SessionCard onLogout={handleLogout} />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Account — read-only for officers. Editing account details goes through
// Django's admin; this page surfaces the current session's identity.
// ---------------------------------------------------------------------------

function AccountCard({
  user,
}: {
  user: NonNullable<ReturnType<typeof useMe>["data"]>;
}) {
  return (
    <Card>
      <CardHeader className="flex-row items-center gap-2 space-y-0">
        <SettingsIcon className="size-4 text-[var(--muted)]" />
        <CardTitle>Account</CardTitle>
      </CardHeader>
      <CardContent>
        <dl className="grid gap-4 sm:grid-cols-2">
          <InfoRow label="Username" value={user.username} mono />
          <InfoRow label="Email" value={user.email} />
          <InfoRow
            label="Full name"
            value={
              [user.first_name, user.last_name].filter(Boolean).join(" ") ||
              "—"
            }
          />
          <InfoRow label="Nationality" value={user.nationality || "—"} />
          <InfoRow label="Joined" value={formatDateTime(user.date_joined)} />
          <div>
            <dt className="text-xs text-[var(--muted)]">Role</dt>
            <dd className="mt-1 flex flex-wrap gap-1.5">
              <StatusPill tone="warning">Staff</StatusPill>
              {user.is_active ? (
                <StatusPill tone="success">Active</StatusPill>
              ) : (
                <StatusPill tone="danger">Inactive</StatusPill>
              )}
            </dd>
          </div>
        </dl>
      </CardContent>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Backend health — pulls from the workflow health endpoint
// ---------------------------------------------------------------------------

function BackendHealthCard() {
  const health = useHealth({
    refetchInterval: 30_000,
  });

  if (health.isLoading) {
    return (
      <Card>
        <CardHeader className="flex-row items-center gap-2 space-y-0">
          <ShieldCheck className="size-4 text-[var(--muted)]" />
          <CardTitle>Backend health</CardTitle>
        </CardHeader>
        <CardContent>
          <Skeleton className="h-20 w-full" />
        </CardContent>
      </Card>
    );
  }

  if (health.isError || !health.data) {
    return (
      <Card>
        <CardHeader className="flex-row items-center gap-2 space-y-0">
          <ShieldCheck className="size-4 text-[var(--muted)]" />
          <CardTitle>Backend health</CardTitle>
        </CardHeader>
        <CardContent>
          <Alert tone="danger" title="Health check failed">
            The backend did not respond to the health probe. Verify that
            the Django server is running and reachable from this host.
          </Alert>
        </CardContent>
      </Card>
    );
  }

  const { status, db, broker } = health.data;
  const overallTone =
    status === "ok"
      ? "success"
      : status === "degraded"
      ? "warning"
      : "danger";

  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between gap-2 space-y-0">
        <div className="flex items-center gap-2">
          <ShieldCheck className="size-4 text-[var(--muted)]" />
          <CardTitle>Backend health</CardTitle>
        </div>
        <StatusPill tone={overallTone}>
          {status === "ok" ? "Healthy" : status === "degraded" ? "Degraded" : "Down"}
        </StatusPill>
      </CardHeader>
      <CardContent className="space-y-3">
        <HealthRow label="Database" ok={db.ok} message={db.message} />
        <HealthRow label="Celery broker" ok={broker.ok} message={broker.message} />
        <p className="pt-2 text-xs text-[var(--muted)]">
          Probes re-run every 30 seconds.
        </p>
      </CardContent>
    </Card>
  );
}

function HealthRow({
  label,
  ok,
  message,
}: {
  label: string;
  ok: boolean;
  message: string;
}) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-lg border border-[var(--border)] px-4 py-3">
      <span className="text-sm">{label}</span>
      <div className="flex items-center gap-3">
        {message && message !== "skipped" && (
          <span className="max-w-[240px] truncate text-xs text-[var(--muted)]" title={message}>
            {message}
          </span>
        )}
        {message === "skipped" ? (
          <StatusPill tone="neutral">Skipped</StatusPill>
        ) : ok ? (
          <StatusPill tone="success">OK</StatusPill>
        ) : (
          <StatusPill tone="danger">Failed</StatusPill>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Password change
// ---------------------------------------------------------------------------

function PasswordCard() {
  const [draft, setDraft] = useState<PasswordChangeInput>({
    current_password: "",
    new_password: "",
    new_password_confirm: "",
  });
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const change = useSetPassword({
    onSuccess: () => {
      setSuccess(true);
      setError(null);
      setDraft({
        current_password: "",
        new_password: "",
        new_password_confirm: "",
      });
      setTimeout(() => setSuccess(false), 5000);
    },
    onError: (err) => {
      setSuccess(false);
      if (err instanceof ApiError) {
        const fe = err.fieldErrors();
        if (fe) {
          setError(Object.values(fe).flat().join(" "));
        } else {
          setError(err.message);
        }
      } else {
        setError("Couldn't change password.");
      }
    },
  });

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (!draft.current_password || !draft.new_password) {
      setError("All fields are required.");
      return;
    }
    if (draft.new_password.length < 8) {
      setError("New password must be at least 8 characters.");
      return;
    }
    if (draft.new_password !== draft.new_password_confirm) {
      setError("New passwords do not match.");
      return;
    }

    change.mutate(draft);
  }

  return (
    <Card>
      <CardHeader className="flex-row items-center gap-2 space-y-0">
        <KeyRound className="size-4 text-[var(--muted)]" />
        <CardTitle>Change password</CardTitle>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-4" noValidate>
          <Field label="Current password" htmlFor="current_password" required>
            <PasswordInput
              id="current_password"
              autoComplete="current-password"
              value={draft.current_password}
              onChange={(e) =>
                setDraft((d) => ({ ...d, current_password: e.target.value }))
              }
            />
          </Field>

          <div className="grid gap-4 sm:grid-cols-2">
            <Field
              label="New password"
              htmlFor="new_password"
              required
              hint="At least 8 characters."
            >
              <PasswordInput
                id="new_password"
                autoComplete="new-password"
                value={draft.new_password}
                onChange={(e) =>
                  setDraft((d) => ({ ...d, new_password: e.target.value }))
                }
              />
            </Field>
            <Field
              label="Confirm new password"
              htmlFor="new_password_confirm"
              required
            >
              <PasswordInput
                id="new_password_confirm"
                autoComplete="new-password"
                value={draft.new_password_confirm}
                onChange={(e) =>
                  setDraft((d) => ({
                    ...d,
                    new_password_confirm: e.target.value,
                  }))
                }
              />
            </Field>
          </div>

          {error && <Alert tone="danger">{error}</Alert>}
          {success && (
            <Alert tone="success">
              Password changed. Use it on your next sign-in.
            </Alert>
          )}

          <div className="flex justify-end pt-2">
            <Button type="submit" loading={change.isPending}>
              {change.isPending ? (
                "Updating…"
              ) : (
                <>
                  <Check className="size-3.5" />
                  Update password
                </>
              )}
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Session
// ---------------------------------------------------------------------------

function SessionCard({ onLogout }: { onLogout: () => void }) {
  return (
    <Card>
      <CardHeader className="flex-row items-center gap-2 space-y-0">
        <ShieldCheck className="size-4 text-[var(--muted)]" />
        <CardTitle>Session</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-sm text-[var(--muted)]">
          You&apos;re signed in with an httpOnly cookie. Signing out clears
          the cookie in this browser only — sessions on other devices stay
          active until they expire.
        </p>
        <Button variant="outline" onClick={onLogout}>
          <LogOut className="size-3.5" />
          Sign out
        </Button>
      </CardContent>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Shared bits
// ---------------------------------------------------------------------------

function InfoRow({
  label,
  value,
  mono,
}: {
  label: string;
  value: string;
  mono?: boolean;
}) {
  return (
    <div>
      <dt className="text-xs text-[var(--muted)]">{label}</dt>
      <dd className={cn("mt-0.5 text-sm", mono && "font-mono text-xs")}>
        {value || "—"}
      </dd>
    </div>
  );
}

function SettingsSkeleton() {
  return (
    <div className="space-y-6">
      <Skeleton className="h-8 w-40" />
      <Skeleton className="h-56 w-full" />
      <Skeleton className="h-40 w-full" />
      <Skeleton className="h-64 w-full" />
    </div>
  );
}

// Local import — kept at the bottom so the file reads top-down.
import { cn } from "@/lib/utils";