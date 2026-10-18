// src/pages/officer/customers/[id].tsx
"use client";

import Link from "next/link";
import { useRouter } from "next/router";
import {
  AlertTriangle,
  ArrowLeft,
  ExternalLink,
  FileStack,
  Mail,
  ScanFace,
  User as UserIcon,
  type LucideIcon,
} from "lucide-react";

import { ROUTES } from "@/lib/constants";
import { useCustomerOverview } from "@/lib/hooks";
import { cn, formatDateTime, formatNumber } from "@/lib/utils";
import {
  Button,
  CheckStatusPill,
  StatusPill,
  ScreeningStatusPill,
  WorkflowStatusPill,
} from "@/components/ui/primitives";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  EmptyState,
  Skeleton,
} from "@/components/ui/surfaces";

/**
 * Officer customer overview — the one-page view of a customer.
 *
 * Backed by /api/customers/<id>/overview/, which returns the profile,
 * counts, last 20 workflows, and last 10 screenings
 * in a single response. This page is the reason that endpoint exists —
 * without it, the officer has to open each workflow individually to
 * reconstruct the customer's history.
 *
 * Staff-only by backend permission.
 */
export default function OfficerCustomerOverviewPage() {
  const router = useRouter();
  const { id } = router.query as { id?: string };

  const numericId = id ? Number(id) : NaN;
  const validId = Number.isFinite(numericId) && numericId > 0 ? numericId : null;

  const query = useCustomerOverview(validId);

  if (!id) return <OverviewSkeleton />;
  if (query.isLoading) return <OverviewSkeleton />;

  if (query.isError || !query.data) {
    return (
      <div className="space-y-6">
        <BackLink />
        <EmptyState
          icon={AlertTriangle}
          title="Customer not found"
          description={
            query.error instanceof Error
              ? query.error.message
              : "This customer doesn't exist."
          }
          action={
            <Button asChild size="sm" variant="outline">
              <Link href={ROUTES.officer.customers}>
                Back to customers
              </Link>
            </Button>
          }
        />
      </div>
    );
  }

  const data = query.data;
  const customer = data.customer;
  const display =
    [customer.first_name, customer.last_name].filter(Boolean).join(" ") ||
    customer.username;

  return (
    <div className="space-y-6">
      <BackLink />

      {/* Header */}
      <div className="overflow-hidden rounded-2xl border border-[var(--border)] bg-white shadow-[var(--shadow-sm)]">
        <div className="p-6 sm:p-7">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="flex min-w-0 items-start gap-4">
              <span className="grid size-14 shrink-0 place-items-center rounded-2xl bg-gradient-to-br from-[var(--primary)] to-[color-mix(in_oklch,var(--primary)_60%,#7c3aed)] text-xl font-extrabold text-white shadow-[0_8px_24px_-8px_rgba(37,99,235,0.5)]">
                {display.charAt(0).toUpperCase()}
              </span>
              <div className="min-w-0">
                <p className="text-[10px] font-extrabold uppercase tracking-[0.18em] text-[var(--muted-2)]">
                  Customer
                </p>
                <h1 className="mt-1 truncate text-lg font-extrabold tracking-tight">
                  {display}
                </h1>
                <p className="mt-1 flex items-center gap-1.5 text-sm text-[var(--muted)]">
                  <Mail className="size-3.5" />
                  {customer.email}
                </p>
                <p className="mt-0.5 flex items-center gap-1.5 text-xs text-[var(--muted)]">
                  <UserIcon className="size-3" />
                  @{customer.username}
                  {customer.nationality && ` · ${customer.nationality}`}
                  {" · joined "}
                  {formatDateTime(customer.date_joined)}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              {customer.is_active ? (
                <StatusPill tone="success">Active</StatusPill>
              ) : (
                <StatusPill tone="danger">Inactive</StatusPill>
              )}
              {customer.is_staff && <StatusPill tone="warning">Staff</StatusPill>}
            </div>
          </div>
        </div>
      </div>

      {/* Counts */}
      <div className="grid gap-4 sm:grid-cols-3">
        <MetricCard
          icon={FileStack}
          label="Documents"
          value={data.counts.documents}
          tone="info"
        />
        <MetricCard
          icon={ScanFace}
          label="Workflows"
          value={data.counts.workflows}
          tone="warning"
        />
        <MetricCard
          icon={ScanFace}
          label="Screenings"
          value={data.counts.screenings}
          tone="success"
        />
      </div>

      {/* Recent workflows */}
      <Card>
        <CardHeader className="flex-row items-center justify-between gap-2 space-y-0">
          <CardTitle>Recent workflows</CardTitle>
          <Button asChild variant="ghost" size="sm">
            <Link href={`${ROUTES.officer.applications}?customer=${customer.id}`}>
              View all
            </Link>
          </Button>
        </CardHeader>
        <CardContent className="p-0">
          {data.workflows.length === 0 ? (
            <div className="px-6 py-10 text-center text-sm text-[var(--muted)]">
              No workflows yet.
            </div>
          ) : (
            <ul className="divide-y divide-[var(--border)]">
              {data.workflows.map((wf) => (
                <li key={wf.id}>
                  <Link
                    href={ROUTES.officer.applicationDetail(wf.tracking_id)}
                    className="flex items-center gap-4 px-6 py-3 transition-colors hover:bg-[var(--surface-2)]"
                  >
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-mono text-xs font-bold">
                        {wf.reference}
                      </p>
                      <p className="mt-0.5 truncate text-xs text-[var(--muted)]">
                        {wf.current_step ?? "—"} ·{" "}
                        {formatDateTime(wf.created_at)}
                      </p>
                    </div>
                    <WorkflowStatusPill status={wf.status} />
                    <ExternalLink className="size-3.5 shrink-0 text-[var(--muted-2)]" />
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      {/* Recent screening reports */}
      <Card>
        <CardHeader className="flex-row items-center justify-between gap-2 space-y-0">
          <CardTitle>Recent screening reports</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {data.screenings.length === 0 ? (
            <div className="px-6 py-10 text-center text-sm text-[var(--muted)]">
              No screenings yet.
            </div>
          ) : (
            <ul className="divide-y divide-[var(--border)]">
              {data.screenings.map((report) => (
                <li key={report.id}>
                  <Link
                    href={ROUTES.officer.screeningDetail(report.id)}
                    className="flex items-center gap-4 px-6 py-3 transition-colors hover:bg-[var(--surface-2)]"
                  >
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-xs font-bold">
                        Screening #{report.id}
                      </p>
                      <p className="mt-0.5 truncate text-xs text-[var(--muted)]">
                        {formatDateTime(report.created_at)}
                      </p>
                    </div>
                    <ScreeningStatusPill status={report.status} />
                    <ExternalLink className="size-3.5 shrink-0 text-[var(--muted-2)]" />
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Small pieces
// ---------------------------------------------------------------------------

function MetricCard({
  icon: Icon,
  label,
  value,
  tone,
}: {
  icon: LucideIcon;
  label: string;
  value: number;
  tone: "info" | "warning" | "success";
}) {
  const TONE = {
    info:    { bg: "bg-[var(--info-soft)]",    fg: "text-[var(--info)]" },
    warning: { bg: "bg-[var(--warning-soft)]", fg: "text-[var(--warning)]" },
    success: { bg: "bg-[var(--success-soft)]", fg: "text-[var(--success)]" },
  } as const;
  const t = TONE[tone];

  return (
    <Card className="flex items-center gap-4 p-5">
      <span
        className={cn(
          "grid size-12 shrink-0 place-items-center rounded-xl",
          t.bg,
          t.fg,
        )}
      >
        <Icon className="size-6" strokeWidth={2.5} />
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-2xl font-extrabold leading-none tabular-nums">
          {formatNumber(value)}
        </p>
        <p className="mt-1.5 text-xs font-bold text-[var(--muted)]">{label}</p>
      </div>
    </Card>
  );
}

function BackLink() {
  return (
    <Link
      href={ROUTES.officer.customers}
      className="inline-flex items-center gap-1.5 text-sm text-[var(--muted)] transition-colors hover:text-[var(--fg)]"
    >
      <ArrowLeft className="size-3.5" />
      All customers
    </Link>
  );
}

function OverviewSkeleton() {
  return (
    <div className="space-y-6">
      <Skeleton className="h-4 w-24" />
      <Skeleton className="h-32 w-full" />
      <div className="grid gap-4 sm:grid-cols-3">
        <Skeleton className="h-24" />
        <Skeleton className="h-24" />
        <Skeleton className="h-24" />
      </div>
      <Skeleton className="h-64 w-full" />
    </div>
  );
}