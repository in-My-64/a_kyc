// src/pages/officer/reports.tsx
"use client";

import { useQuery } from "@tanstack/react-query";
import {
  Activity,
  CheckCircle2,
  Clock,
  FileStack,
  ScanFace,
  ShieldAlert,
  XCircle,
  type LucideIcon,
} from "lucide-react";

import { apiMap } from "@/lib/endpoints";
import { qk } from "@/lib/hooks";
import { formatNumber } from "@/lib/utils";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  Skeleton,
  StatTile,
} from "@/components/ui/surfaces";
import {
  CheckStatusPill,
  RiskTierPill,
  ScreeningStatusPill,
} from "@/components/ui/primitives";
import type { CheckStatus, RiskTier, ScreeningStatus } from "@/lib/types";

// ---------------------------------------------------------------------------
// Aggregation helper — pulled out so every panel shares the same logic.
// ---------------------------------------------------------------------------

function countsBy<T extends string>(
  items: { [key: string]: unknown }[],
  extractor: (item: Record<string, unknown>) => T | null | undefined,
  known: readonly T[],
): Record<T, number> {
  const out = Object.fromEntries(known.map((k) => [k, 0])) as Record<T, number>;
  for (const item of items) {
    const key = extractor(item as Record<string, unknown>);
    if (key && key in out) out[key] += 1;
  }
  return out;
}

export default function OfficerReportsPage() {
  // Counts from the paginated `count` field — accurate across the full
  // table without materialising every row.
  const totalWorkflowsQ = useQuery({
    queryKey: qk.workflows.list({ page_size: 1 }),
    queryFn: () => apiMap.workflows.list({ page_size: 1 }),
    staleTime: 30_000,
  });
  const completedQ = useQuery({
    queryKey: qk.workflows.list({ page_size: 1, status: "COMPLETED" }),
    queryFn: () => apiMap.workflows.list({ page_size: 1, status: "COMPLETED" }),
    staleTime: 30_000,
  });
  const failedQ = useQuery({
    queryKey: qk.workflows.list({ page_size: 1, status: "FAILED" }),
    queryFn: () => apiMap.workflows.list({ page_size: 1, status: "FAILED" }),
    staleTime: 30_000,
  });
  const inProgressQ = useQuery({
    queryKey: qk.workflows.list({ page_size: 1, status: "IN_PROGRESS" }),
    queryFn: () =>
      apiMap.workflows.list({ page_size: 1, status: "IN_PROGRESS" }),
    staleTime: 30_000,
  });

  // Bounded sample for distribution panels. The backend caps
  // page_size at 100, so this is the practical upper bound with a
  // single request. The counts above stay exact.
  const riskSampleQ = useQuery({
    queryKey: qk.risk.list({ page_size: 100 }),
    queryFn: () => apiMap.risk.list({ page_size: 100 }),
    staleTime: 30_000,
  });
  const screeningSampleQ = useQuery({
    queryKey: qk.screenings.list({ page_size: 100 }),
    queryFn: () => apiMap.screenings.list({ page_size: 100 }),
    staleTime: 30_000,
  });
  const fbcSampleQ = useQuery({
    queryKey: qk.screenings.list({ page_size: 100 }),
    queryFn: () => apiMap.screenings.list({ page_size: 100 }),
    staleTime: 30_000,
  });

  // Customer counts
  const clearedQ = useQuery({
    queryKey: qk.customers.cleared({ page_size: 1 }),
    queryFn: () => apiMap.customers.cleared({ page_size: 1 }),
    staleTime: 30_000,
  });
  const flaggedQ = useQuery({
    queryKey: qk.customers.flagged({ page_size: 1 }),
    queryFn: () => apiMap.customers.flagged({ page_size: 1 }),
    staleTime: 30_000,
  });

  const statsLoading =
    totalWorkflowsQ.isLoading ||
    completedQ.isLoading ||
    failedQ.isLoading ||
    inProgressQ.isLoading;

  const totalWorkflows = totalWorkflowsQ.data?.count ?? 0;
  const completed = completedQ.data?.count ?? 0;
  const failed = failedQ.data?.count ?? 0;
  const inProgress = inProgressQ.data?.count ?? 0;
  const successRate =
    totalWorkflows > 0 ? (completed / totalWorkflows) * 100 : 0;

  const cleared = clearedQ.data?.count ?? 0;
  const flagged = flaggedQ.data?.count ?? 0;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Reports</h1>
        <p className="mt-1 text-sm text-[var(--muted)]">
          Aggregate view across all verification runs and customers.
        </p>
      </div>

      {/* Top-line KPIs */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatTile
          label="Total workflows"
          value={totalWorkflows}
          icon={FileStack}
          tone="info"
          loading={statsLoading}
          hint={`${inProgress} in progress · ${failed} failed`}
        />
        <StatTile
          label="Success rate"
          value={`${successRate.toFixed(1)}%`}
          icon={CheckCircle2}
          tone={
            successRate >= 95
              ? "success"
              : successRate >= 80
              ? "warning"
              : "danger"
          }
          loading={statsLoading}
          hint={`${completed} of ${totalWorkflows} completed`}
        />
        <StatTile
          label="Cleared customers"
          value={cleared}
          icon={CheckCircle2}
          tone="success"
          loading={clearedQ.isLoading}
          hint="Latest screening = CLEAR"
        />
        <StatTile
          label="Flagged customers"
          value={flagged}
          icon={ShieldAlert}
          tone="danger"
          loading={flaggedQ.isLoading}
          hint="Ever MATCH or FLAGGED"
        />
      </div>

      {/* Distribution row */}
      <div className="grid gap-6 lg:grid-cols-2">
        <DistributionCard
          title="Workflow state"
          description="Live breakdown of every tracked workflow"
          loading={statsLoading}
          empty={totalWorkflows === 0}
          emptyLabel="No workflows yet"
        >
          <div className="grid grid-cols-2 gap-4 py-2">
            <StateTile
              icon={CheckCircle2}
              label="Completed"
              value={completed}
              tone="success"
            />
            <StateTile
              icon={Clock}
              label="In progress"
              value={inProgress}
              tone="info"
            />
            <StateTile
              icon={XCircle}
              label="Failed"
              value={failed}
              tone="danger"
            />
            <StateTile
              icon={Activity}
              label="Total"
              value={totalWorkflows}
              tone="neutral"
            />
          </div>
        </DistributionCard>

        <RiskDistributionCard
          loading={riskSampleQ.isLoading}
          data={riskSampleQ.data?.results ?? []}
        />
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <ScreeningDistributionCard
          loading={screeningSampleQ.isLoading}
          data={screeningSampleQ.data?.results ?? []}
        />
        <ScreeningDistributionCard
          loading={fbcSampleQ.isLoading}
          data={fbcSampleQ.data?.results ?? []}
        />
      </div>

      <p className="text-center text-xs text-[var(--muted)]">
        Totals use paginated counts. Distribution panels sample the most
        recent 100 rows per entity — the backend caps{" "}
        <span className="font-mono">page_size</span> at 100.
      </p>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Distribution cards
// ---------------------------------------------------------------------------

function DistributionCard({
  title,
  description,
  loading,
  empty,
  emptyLabel,
  children,
}: {
  title: string;
  description: string;
  loading: boolean;
  empty: boolean;
  emptyLabel: string;
  children: React.ReactNode;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      <CardContent>
        {loading ? (
          <Skeleton className="h-40 w-full" />
        ) : empty ? (
          <p className="py-10 text-center text-sm text-[var(--muted)]">
            {emptyLabel}
          </p>
        ) : (
          children
        )}
      </CardContent>
    </Card>
  );
}

function RiskDistributionCard({
  loading,
  data,
}: {
  loading: boolean;
  data: { tier: RiskTier }[];
}) {
  const counts = countsBy(
    data,
    (item) => item.tier as RiskTier | undefined,
    ["LOW", "MEDIUM", "HIGH"] as const,
  );
  const total = counts.LOW + counts.MEDIUM + counts.HIGH;

  return (
    <DistributionCard
      title="Risk distribution"
      description="Tier assignment across the most recent classifications"
      loading={loading}
      empty={total === 0}
      emptyLabel="No classifications yet"
    >
      <ul className="space-y-4 py-2">
        {(["LOW", "MEDIUM", "HIGH"] as const).map((tier) => {
          const count = counts[tier];
          const pct = total > 0 ? (count / total) * 100 : 0;
          return (
            <li key={tier}>
              <div className="mb-1 flex items-center justify-between text-sm">
                <RiskTierPill tier={tier} />
                <div className="flex items-center gap-3">
                  <span className="text-xs text-[var(--muted)]">
                    {pct.toFixed(1)}%
                  </span>
                  <span className="w-12 text-right font-mono text-sm tabular-nums">
                    {formatNumber(count)}
                  </span>
                </div>
              </div>
              <div className="h-1.5 w-full overflow-hidden rounded-full bg-[var(--surface-hi)]">
                <div
                  className={
                    tier === "LOW"
                      ? "h-full rounded-full bg-[var(--success)]"
                      : tier === "MEDIUM"
                      ? "h-full rounded-full bg-[var(--warning)]"
                      : "h-full rounded-full bg-[var(--danger)]"
                  }
                  style={{ width: `${pct}%` }}
                />
              </div>
            </li>
          );
        })}
      </ul>
    </DistributionCard>
  );
}



// ---------------------------------------------------------------------------
// Small pieces
// ---------------------------------------------------------------------------

function StateTile({
  icon: Icon,
  label,
  value,
  tone,
}: {
  icon: LucideIcon;
  label: string;
  value: number;
  tone: "success" | "info" | "danger" | "neutral";
}) {
  const colors: Record<string, string> = {
    success: "text-[var(--success)]",
    info: "text-[var(--info)]",
    danger: "text-[var(--danger)]",
    neutral: "text-[var(--muted)]",
  };

  return (
    <div className="rounded-lg border border-[var(--border)] p-4">
      <div className="flex items-center gap-2">
        <Icon className={`size-3.5 ${colors[tone]}`} />
        <span className="text-xs text-[var(--muted)]">{label}</span>
      </div>
      <p className="mt-2 text-2xl font-semibold tabular-nums">
        {formatNumber(value)}
      </p>
    </div>
  );
}

function ScreeningDistributionCard({
  loading,
  data,
}: {
  loading: boolean;
  data: { status: ScreeningStatus }[];
}) {
  const counts = countsBy(
    data,
    (item) => item.status as ScreeningStatus | undefined,
    ["CLEAR", "FLAGGED", "MATCH"] as const,
  );
  const total = counts.CLEAR + counts.FLAGGED + counts.MATCH;

  return (
    <DistributionCard
      title="Screening outcomes"
      description="Compliance results across recent screenings"
      loading={loading}
      empty={total === 0}
      emptyLabel="No screenings yet"
    >
      <ul className="space-y-4 py-2">
        {(["CLEAR", "FLAGGED", "MATCH"] as const).map((status) => {
          const count = counts[status];
          const pct = total > 0 ? (count / total) * 100 : 0;
          return (
            <li key={status}>
              <div className="mb-1 flex items-center justify-between text-sm">
                <ScreeningStatusPill status={status} />
                <div className="flex items-center gap-3">
                  <span className="text-xs text-[var(--muted)]">
                    {pct.toFixed(1)}%
                  </span>
                  <span className="w-12 text-right font-mono text-sm tabular-nums">
                    {formatNumber(count)}
                  </span>
                </div>
              </div>
              <div className="h-1.5 w-full overflow-hidden rounded-full bg-[var(--surface-hi)]">
                <div
                  className={
                    status === "CLEAR"
                      ? "h-full rounded-full bg-[var(--success)]"
                      : status === "FLAGGED"
                      ? "h-full rounded-full bg-[var(--warning)]"
                      : "h-full rounded-full bg-[var(--danger)]"
                  }
                  style={{ width: `${pct}%` }}
                />
              </div>
            </li>
          );
        })}
      </ul>
    </DistributionCard>
  );
}
