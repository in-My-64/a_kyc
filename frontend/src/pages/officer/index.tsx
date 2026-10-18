// src/pages/officer/index.tsx
"use client";

import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import {
  CheckCircle2,
  Clock,
  ExternalLink,
  FileStack,
  XCircle,
  type LucideIcon,
} from "lucide-react";

import { ROUTES } from "@/lib/constants";
import { apiMap } from "@/lib/endpoints";
import { qk, useMe } from "@/lib/hooks";
import { formatDateTime } from "@/lib/utils";
import type { WorkflowListItem } from "@/lib/types";
import {
  Button,
  IconButton,
  StatusDot,
  WorkflowStatusPill,
} from "@/components/ui/primitives";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  EmptyState,
  TableSkeleton,
} from "@/components/ui/surfaces";

const STEP_LABELS: Record<string, string> = {
  created: "Created",
  preprocess_document: "Preprocessing",
  run_ocr_task: "OCR",
  create_parsed_document: "Reading document",
  run_vlm_extraction: "Confirming details",
  compare_extractions: "Confirming",
  run_face_match: "Face match",
  compute_evidence_score: "Evidence scoring",
  run_sanctions_screening: "Customer Assessment",
  classify_risk: "Risk classification",
  log_audit_summary: "Finalising",
  done: "Completed",
  dispatch_failed: "Dispatch failed",
};

// ---------------------------------------------------------------------------
// Stat card
// ---------------------------------------------------------------------------

interface StatCardProps {
  label: string;
  value: number;
  icon: LucideIcon;
  tone: "info" | "warning" | "success" | "danger";
  loading?: boolean;
}

const STAT_TONE: Record<
  StatCardProps["tone"],
  { bg: string; fg: string }
> = {
  info:    { bg: "bg-[var(--info-soft)]",    fg: "text-[var(--info)]" },
  warning: { bg: "bg-[var(--warning-soft)]", fg: "text-[var(--warning)]" },
  success: { bg: "bg-[var(--success-soft)]", fg: "text-[var(--success)]" },
  danger:  { bg: "bg-[var(--danger-soft)]",  fg: "text-[var(--danger)]" },
};

function StatCard({ label, value, icon: Icon, tone, loading }: StatCardProps) {
  const t = STAT_TONE[tone];

  return (
    <Card className="flex items-center gap-4 p-5">
      <span
        className={`grid size-12 shrink-0 place-items-center rounded-xl ${t.bg} ${t.fg}`}
      >
        <Icon className="size-6" strokeWidth={2.5} />
      </span>

      <div className="min-w-0 flex-1">
        {loading ? (
          <div className="h-8 w-16 animate-pulse rounded bg-[var(--surface-hi)]" />
        ) : (
          <p className="text-3xl font-extrabold leading-none tabular-nums text-[var(--fg)]">
            {value}
          </p>
        )}
        <p className="mt-1.5 text-xs font-bold text-[var(--muted)]">
          {label}
        </p>
      </div>
    </Card>
  );
}

// ---------------------------------------------------------------------------

export default function OfficerDashboardPage() {
  const { data: user } = useMe();

  const totalQuery = useQuery({
    queryKey: qk.workflows.list({ page_size: 1 }),
    queryFn: () => apiMap.workflows.list({ page_size: 1 }),
    staleTime: 15_000,
  });

  const inProgressQuery = useQuery({
    queryKey: qk.workflows.list({ page_size: 1, status: "IN_PROGRESS" }),
    queryFn: () => apiMap.workflows.list({ page_size: 1, status: "IN_PROGRESS" }),
    staleTime: 15_000,
  });

  const approvedQuery = useQuery({
    queryKey: qk.workflows.list({ page_size: 1, status: "COMPLETED" }),
    queryFn: () => apiMap.workflows.list({ page_size: 1, status: "COMPLETED" }),
    staleTime: 15_000,
  });

  const rejectedQuery = useQuery({
    queryKey: qk.workflows.list({ page_size: 1, status: "FAILED" }),
    queryFn: () => apiMap.workflows.list({ page_size: 1, status: "FAILED" }),
    staleTime: 15_000,
  });

  const recentQuery = useQuery({
    queryKey: qk.workflows.list({ page_size: 5, ordering: "-created_at" }),
    queryFn: () =>
      apiMap.workflows.list({ page_size: 5, ordering: "-created_at" }),
    staleTime: 15_000,
  });

  const statsLoading =
    totalQuery.isLoading ||
    inProgressQuery.isLoading ||
    approvedQuery.isLoading ||
    rejectedQuery.isLoading;

  const greeting = user?.first_name
    ? `Welcome, ${user.first_name}`
    : user?.username
    ? `Welcome, ${user.username}`
    : "Welcome";

  // Annotated locally. `recentQuery.data.results` arrives as `any`
  // from useQuery's inference widening (see the hooks.ts note in the
  // earlier pass), so the map callback parameter would otherwise be
  // an implicit any once the icon error stops masking it.
  const recent: WorkflowListItem[] = recentQuery.data?.results ?? [];

  return (
    <div className="space-y-6">
      {/* Greeting */}
      <div>
        <h1 className="text-2xl font-extrabold tracking-tight">{greeting}</h1>
        <p className="mt-1 text-sm font-bold text-[var(--muted)]">
          KYC Officer
        </p>
      </div>

      {/* Stats grid */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          label="Total Applications"
          value={totalQuery.data?.count ?? 0}
          icon={FileStack}
          tone="info"
          loading={statsLoading}
        />
        <StatCard
          label="Under Review"
          value={inProgressQuery.data?.count ?? 0}
          icon={Clock}
          tone="warning"
          loading={statsLoading}
        />
        <StatCard
          label="Approved"
          value={approvedQuery.data?.count ?? 0}
          icon={CheckCircle2}
          tone="success"
          loading={statsLoading}
        />
        <StatCard
          label="Rejected"
          value={rejectedQuery.data?.count ?? 0}
          icon={XCircle}
          tone="danger"
          loading={statsLoading}
        />
      </div>

      {/* Recent applications */}
      <Card>
        <CardHeader className="flex-row items-center justify-between gap-2 space-y-0">
          <CardTitle>Recent Applications</CardTitle>
          <Button asChild variant="ghost" size="sm">
            <Link href={ROUTES.officer.applications}>View all</Link>
          </Button>
        </CardHeader>
        <CardContent className="p-0">
          {recentQuery.isLoading ? (
            <div className="p-6">
              <TableSkeleton rows={5} cols={5} />
            </div>
          ) : recent.length === 0 ? (
            <div className="p-6">
              <EmptyState
                icon={FileStack}
                title="No applications yet"
                description="New submissions will appear here."
              />
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-[var(--surface-2)] text-left text-xs font-extrabold uppercase tracking-wider text-[var(--muted)]">
                  <tr>
                    <th className="px-6 py-3">ID</th>
                    <th className="px-6 py-3">Name</th>
                    <th className="px-6 py-3">Document Type</th>
                    <th className="px-6 py-3">Submitted</th>
                    <th className="px-6 py-3">Status</th>
                    <th className="px-6 py-3 text-right">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[var(--border)]">
                  {recent.map((wf: WorkflowListItem) => {
                    const live =
                      wf.status === "PENDING" || wf.status === "IN_PROGRESS";
                    return (
                      <tr
                        key={wf.id}
                        className="transition-colors hover:bg-[var(--surface-2)]"
                      >
                        <td className="px-6 py-3">
                          <Link
                            href={ROUTES.officer.applicationDetail(
                              wf.tracking_id,
                            )}
                            className="flex items-center gap-2 font-mono text-xs font-bold hover:text-[var(--primary)]"
                          >
                            <StatusDot
                              tone={
                                wf.status === "COMPLETED"
                                  ? "success"
                                  : wf.status === "FAILED"
                                  ? "danger"
                                  : "info"
                              }
                              pulse={live}
                              className="shrink-0"
                            />
                            {wf.reference}
                          </Link>
                        </td>
                        <td className="px-6 py-3 font-bold">
                          {wf.customer_name}
                        </td>
                        <td className="px-6 py-3 text-[var(--muted)]">
                          {wf.document_type}
                        </td>
                        <td className="px-6 py-3 text-xs font-bold text-[var(--muted)]">
                          {formatDateTime(wf.created_at)}
                        </td>
                        <td className="px-6 py-3">
                          <WorkflowStatusPill status={wf.status} />
                        </td>
                        <td className="px-6 py-3 text-right">
                          <IconButton
                            asChild
                            aria-label="Open"
                            onClick={(e) => e.stopPropagation()}
                          >
                            <Link
                              href={ROUTES.officer.applicationDetail(
                                wf.tracking_id,
                              )}
                            >
                              <ExternalLink className="size-3.5" />
                            </Link>
                          </IconButton>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}