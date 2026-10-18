// src/pages/customer/profile.tsx
"use client";

import { useState } from "react";
import { useRouter } from "next/router";
import {
  Check,
  Copy,
  KeyRound,
  LogOut,
  Mail,
  ShieldCheck,
  User as UserIcon,
  X,
} from "lucide-react";

import { ROUTES } from "@/lib/constants";
import { useMe, useSetPassword, useUpdateCustomer } from "@/lib/hooks";
import { useErrorHandler } from "@/lib/use-error-handler";
import { useToast } from "@/components/ui/toast";
import { formatDate, formatDateTime } from "@/lib/utils";
import type { CustomerUpdateInput, PasswordChangeInput } from "@/lib/types";
import { Button, StatusPill } from "@/components/ui/primitives";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Skeleton,
} from "@/components/ui/surfaces";
import { Field, Input, PasswordInput } from "@/components/ui/form";
import { PasswordStrengthMeter } from "@/components/auth/password-strength";

export default function ProfilePage() {
  const router = useRouter();
  const { data: user, isLoading, isError, error } = useMe();
  const errorHandler = useErrorHandler();

  async function handleLogout() {
    await fetch("/api/session", { method: "DELETE" });
    router.replace(ROUTES.login);
  }

  if (isLoading) return <ProfileSkeleton />;

  if (isError || !user) {
    return (
      <div className="space-y-6">
        <h1 className="text-3xl font-extrabold tracking-tight">Profile</h1>
        <Card className="border-[var(--danger-border)]">
          <CardContent className="p-6">
            <p className="text-sm font-bold text-[var(--danger)]">
              Couldn't load your profile
            </p>
            <p className="mt-1 text-sm text-[var(--muted)]">
              {error instanceof Error ? error.message : "Please refresh the page."}
            </p>
            <Button
              variant="outline"
              size="sm"
              onClick={() => router.reload()}
              className="mt-4"
            >
              Reload
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-extrabold tracking-tight">Profile</h1>
        <p className="mt-1 text-sm text-[var(--muted)]">
          Your account details and security settings.
        </p>
      </div>

      <IdentityHeader user={user} />
      <AccountCard user={user} />
      <PasswordCard />
      <SessionCard user={user} onLogout={handleLogout} />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Identity header — avatar + name + status
// ---------------------------------------------------------------------------

function IdentityHeader({
  user,
}: {
  user: NonNullable<ReturnType<typeof useMe>["data"]>;
}) {
  const initials =
    (user.first_name?.[0] ?? user.username[0] ?? "?").toUpperCase() +
    (user.last_name?.[0] ?? "").toUpperCase();

  return (
    <Card>
      <CardContent className="flex flex-wrap items-center gap-5 p-6">
        <div className="relative shrink-0">
          <div className="grid size-20 place-items-center rounded-2xl bg-gradient-to-br from-[var(--primary)] to-[color-mix(in_oklch,var(--primary)_60%,#7c3aed)] text-2xl font-extrabold text-white shadow-[0_12px_32px_-8px_rgba(37,99,235,0.5)]">
            {initials}
          </div>
          {user.is_active && (
            <span className="absolute -bottom-1 -right-1 grid size-6 place-items-center rounded-full border-4 border-white bg-[var(--success)]">
              <Check className="size-3 text-white" strokeWidth={4} />
            </span>
          )}
        </div>
        <div className="min-w-0 flex-1">
          <h2 className="text-xl font-extrabold tracking-tight">
            {[user.first_name, user.last_name].filter(Boolean).join(" ") ||
              user.username}
          </h2>
          <p className="mt-1 flex items-center gap-1.5 text-sm text-[var(--muted)]">
            <Mail className="size-3.5" />
            {user.email}
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            {user.is_active ? (
              <StatusPill tone="success">Active</StatusPill>
            ) : (
              <StatusPill tone="danger">Inactive</StatusPill>
            )}
            {user.is_staff && <StatusPill tone="warning">Staff</StatusPill>}
            {user.nationality && (
              <StatusPill tone="neutral">{user.nationality}</StatusPill>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Account card
// ---------------------------------------------------------------------------

function AccountCard({
  user,
}: {
  user: NonNullable<ReturnType<typeof useMe>["data"]>;
}) {
  const [editing, setEditing] = useState(false);

  if (editing) {
    return <AccountCardEdit user={user} onDone={() => setEditing(false)} />;
  }

  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between gap-2 space-y-0">
        <div className="flex items-center gap-2">
          <UserIcon className="size-4 text-[var(--muted)]" />
          <CardTitle>Account details</CardTitle>
        </div>
        <Button variant="outline" size="sm" onClick={() => setEditing(true)}>
          Edit
        </Button>
      </CardHeader>
      <CardContent>
        <dl className="grid gap-5 sm:grid-cols-2">
          <CopyableRow label="Username" value={user.username} mono />
          <CopyableRow label="Email" value={user.email} />
          <Row
            label="Full name"
            value={
              [user.first_name, user.last_name].filter(Boolean).join(" ") || "—"
            }
          />
          <Row
            label="Date of birth"
            value={user.date_of_birth ? formatDate(user.date_of_birth) : "—"}
          />
          <Row label="Nationality" value={user.nationality || "—"} />
          <Row label="Member since" value={formatDate(user.date_joined)} />
        </dl>
      </CardContent>
    </Card>
  );
}

function AccountCardEdit({
  user,
  onDone,
}: {
  user: NonNullable<ReturnType<typeof useMe>["data"]>;
  onDone: () => void;
}) {
  const [draft, setDraft] = useState<CustomerUpdateInput>({
    first_name: user.first_name,
    last_name: user.last_name,
    date_of_birth: user.date_of_birth ?? "",
    nationality: user.nationality ?? "",
  });
  const errorHandler = useErrorHandler();
  const toast = useToast();

  const update = useUpdateCustomer(user.id, {
    onSuccess: () => {
      toast.push({
        severity: "success",
        title: "Changes saved",
        message: "Your profile has been updated.",
      });
      onDone();
    },
    onError: (err) => {
      errorHandler.report(err, { retry: () => update.mutate(draft), preferToast: true });
    },
  });

  function handleSave() {
    const payload: CustomerUpdateInput = {};
    if (draft.first_name !== user.first_name) payload.first_name = draft.first_name;
    if (draft.last_name !== user.last_name) payload.last_name = draft.last_name;
    if ((draft.date_of_birth || null) !== user.date_of_birth)
      payload.date_of_birth = draft.date_of_birth || null;
    if ((draft.nationality || "") !== (user.nationality || ""))
      payload.nationality = draft.nationality;

    if (Object.keys(payload).length === 0) {
      onDone();
      return;
    }
    update.mutate(payload);
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Edit account details</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="First name" htmlFor="first_name">
            <Input
              id="first_name"
              value={draft.first_name ?? ""}
              onChange={(e) => setDraft((d) => ({ ...d, first_name: e.target.value }))}
              disabled={update.isPending}
            />
          </Field>
          <Field label="Last name" htmlFor="last_name">
            <Input
              id="last_name"
              value={draft.last_name ?? ""}
              onChange={(e) => setDraft((d) => ({ ...d, last_name: e.target.value }))}
              disabled={update.isPending}
            />
          </Field>
          <Field label="Date of birth" htmlFor="date_of_birth">
            <Input
              id="date_of_birth"
              type="date"
              value={draft.date_of_birth ?? ""}
              onChange={(e) => setDraft((d) => ({ ...d, date_of_birth: e.target.value }))}
              disabled={update.isPending}
            />
          </Field>
          <Field label="Nationality" htmlFor="nationality">
            <Input
              id="nationality"
              maxLength={50}
              value={draft.nationality ?? ""}
              onChange={(e) => setDraft((d) => ({ ...d, nationality: e.target.value }))}
              disabled={update.isPending}
            />
          </Field>
        </div>

        <div className="flex justify-end gap-2 pt-2">
          <Button variant="ghost" onClick={onDone} disabled={update.isPending}>
            <X className="size-3.5" />
            Cancel
          </Button>
          <Button onClick={handleSave} loading={update.isPending}>
            {!update.isPending && <Check className="size-3.5" />}
            Save changes
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Password card
// ---------------------------------------------------------------------------

function PasswordCard() {
  const [draft, setDraft] = useState<PasswordChangeInput>({
    current_password: "",
    new_password: "",
    new_password_confirm: "",
  });
  const errorHandler = useErrorHandler();
  const toast = useToast();

  const change = useSetPassword({
    onSuccess: () => {
      toast.push({
        severity: "success",
        title: "Password updated",
        message: "Use your new password the next time you sign in.",
      });
      setDraft({
        current_password: "",
        new_password: "",
        new_password_confirm: "",
      });
    },
    onError: (err) => {
      errorHandler.report(err, { retry: () => change.mutate(draft), preferToast: true });
    },
  });

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!draft.current_password || !draft.new_password) return;
    change.mutate(draft);
  }

  const mismatch =
    Boolean(draft.new_password_confirm) &&
    draft.new_password !== draft.new_password_confirm;

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
              onChange={(e) => setDraft((d) => ({ ...d, current_password: e.target.value }))}
              disabled={change.isPending}
            />
          </Field>

          <div>
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
                onChange={(e) => setDraft((d) => ({ ...d, new_password: e.target.value }))}
                disabled={change.isPending}
              />
            </Field>
            <PasswordStrengthMeter password={draft.new_password} />
          </div>

          <Field
            label="Confirm new password"
            htmlFor="new_password_confirm"
            required
            error={mismatch ? "Passwords do not match." : undefined}
          >
            <PasswordInput
              id="new_password_confirm"
              autoComplete="new-password"
              value={draft.new_password_confirm}
              onChange={(e) =>
                setDraft((d) => ({ ...d, new_password_confirm: e.target.value }))
              }
              disabled={change.isPending}
              error={mismatch}
            />
          </Field>

          <div className="flex justify-end pt-2">
            <Button
              type="submit"
              loading={change.isPending}
              disabled={
                !draft.current_password ||
                !draft.new_password ||
                mismatch
              }
            >
              {change.isPending ? "Updating…" : "Update password"}
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Session card
// ---------------------------------------------------------------------------

function SessionCard({
  user,
  onLogout,
}: {
  user: NonNullable<ReturnType<typeof useMe>["data"]>;
  onLogout: () => void;
}) {
  return (
    <Card>
      <CardHeader className="flex-row items-center gap-2 space-y-0">
        <ShieldCheck className="size-4 text-[var(--muted)]" />
        <CardTitle>Session</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <Row label="Last updated" value={formatDateTime(user.updated_at)} />
          <Row label="Signed in as" value={user.username} mono />
        </div>
        <p className="text-sm text-[var(--muted)]">
          Your session lives in an httpOnly cookie. Signing out clears it
          in this browser only — sessions on other devices stay active
          until they expire.
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
// Shared rows
// ---------------------------------------------------------------------------

function Row({
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
      <dt className="text-xs font-bold text-[var(--muted)]">{label}</dt>
      <dd className={"mt-0.5 text-sm " + (mono ? "font-mono text-xs" : "")}>
        {value}
      </dd>
    </div>
  );
}

function CopyableRow({
  label,
  value,
  mono,
}: {
  label: string;
  value: string;
  mono?: boolean;
}) {
  const [copied, setCopied] = useState(false);
  const toast = useToast();

  async function copy() {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      toast.push({
        severity: "info",
        title: "Couldn't copy",
        message: "Your browser blocked clipboard access.",
      });
    }
  }

  return (
    <div>
      <dt className="text-xs font-bold text-[var(--muted)]">{label}</dt>
      <dd className="mt-0.5 flex items-center gap-2">
        <span className={"text-sm " + (mono ? "font-mono text-xs" : "")}>
          {value}
        </span>
        <button
          type="button"
          onClick={copy}
          aria-label={`Copy ${label}`}
          className="grid size-5 shrink-0 place-items-center rounded text-[var(--muted-2)] transition-colors hover:bg-[var(--surface-hi)] hover:text-[var(--fg)]"
        >
          {copied ? (
            <Check className="size-3 text-[var(--success)]" strokeWidth={3} />
          ) : (
            <Copy className="size-3" />
          )}
        </button>
      </dd>
    </div>
  );
}

function ProfileSkeleton() {
  return (
    <div className="space-y-6">
      <Skeleton className="h-8 w-40" />
      <Skeleton className="h-32 w-full" />
      <Skeleton className="h-56 w-full" />
      <Skeleton className="h-64 w-full" />
    </div>
  );
}
