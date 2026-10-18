// src/pages/customer/index.tsx
"use client";

import Link from "next/link";
import { useRouter } from "next/router";
import {
  ArrowRight,
  CheckCircle2,
  Clock,
  FilePlus2,
  FileStack,
  XCircle,
  type LucideIcon,
} from "lucide-react";

import { ROUTES } from "@/lib/constants";
import { useMe, useOutstandingMoreInfo, useWorkflows } from "@/lib/hooks";
import { useQueryErrorToast } from "@/lib/use-error-handler";
import { friendlyFailure } from "@/lib/friendly-errors";
import { formatDateTime, cn } from "@/lib/utils";
import type { WorkflowListItem } from "@/lib/types";
import { Button, WorkflowStatusPill } from "@/components/ui/primitives";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  EmptyState,
} from "@/components/ui/surfaces";
import { EmptyApplicationsArt } from "@/components/illustrations";
import { OutstandingBanners } from "@/components/kyc/outstanding-banner";

// ---------------------------------------------------------------------------
// Step labels — customer-facing, no backend jargon
// ---------------------------------------------------------------------------

const PIPELINE_STEPS = [
  "preprocess_document",
  "run_ocr_task",
  "create_parsed_document",
  "run_vlm_extraction",
  "compare_extractions",
  "run_face_match",
  "compute_evidence_score",
  "run_sanctions_screening",
  "classify_risk",
  "log_audit_summary",
] as const;

const STEP_LABELS: Record<string, string> = {
  created: "Created",
  preprocess_document: "Preparing document",
  run_ocr_task: "Reading your document",
  create_parsed_document: "Reading document",
  run_vlm_extraction: "Confirming details",
  compare_extractions: "Verifying results",
  run_face_match: "Checking your selfie",
  compute_evidence_score: "Quality check",
  run_sanctions_screening: "Completing your assessment",
  classify_risk: "Finalising",
  log_audit_summary: "Wrapping up",
  done: "Completed",
  dispatch_failed: "Couldn't start",
};

const DISPLAY_STEPS = ["Uploaded", "Processing", "Under review", "Completed"];

// ---------------------------------------------------------------------------

export default function CustomerDashboardPage() {
  const router = useRouter();
  const { data: user } = useMe();

  const workflows = useWorkflows(
    { page_size: 10, ordering: "-created_at" },
    { enabled: Boolean(user) },
  );

  // Outstanding MORE_INFO requests. These render above everything else
  // so the customer can't miss them. The backend excludes any that the
  // customer has already answered by starting a newer workflow.
  const outstanding = useOutstandingMoreInfo({
    enabled: Boolean(user),
  });

  useQueryErrorToast(workflows);

  const all: WorkflowListItem[] = workflows.data?.results ?? [];
  const total = workflows.data?.count ?? 0;
  const inProgress = all.filter(
    (w) => w.status === "IN_PROGRESS" || w.status === "PENDING",
  ).length;
  const approved = all.filter((w) => w.status === "COMPLETED").length;
  const rejected = all.filter((w) => w.status === "FAILED").length;
  const latest = all[0];

  const greeting = timeGreeting(user?.first_name || user?.username);

  return (
    <div className="space-y-6">
      {/* Outstanding requests — top of the page, above the fold */}
      <OutstandingBanners workflows={outstanding.data ?? []} />

      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl font-extrabold tracking-tight">{greeting}</h1>
          <p className="mt-1 text-sm font-bold text-[var(--muted)]">
            Track your KYC applications at a glance.
          </p>
        </div>
        <Button asChild>
          <Link href={ROUTES.customer.apply}>
            <FilePlus2 className="size-3.5" />
            New application
          </Link>
        </Button>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          label="Total"
          value={total}
          icon={FileStack}
          tone="info"
          loading={workflows.isLoading}
        />
        <StatCard
          label="In Progress"
          value={inProgress}
          icon={Clock}
          tone="warning"
          loading={workflows.isLoading}
        />
        <StatCard
          label="Approved"
          value={approved}
          icon={CheckCircle2}
          tone="success"
          loading={workflows.isLoading}
        />
        <StatCard
          label="Rejected"
          value={rejected}
          icon={XCircle}
          tone="danger"
          loading={workflows.isLoading}
        />
      </div>

      <Card>
        <CardHeader className="flex-row items-center justify-between gap-2 space-y-0">
          <CardTitle>Latest application</CardTitle>
          {latest && <WorkflowStatusPill status={latest.status} />}
        </CardHeader>

        <CardContent>
          {workflows.isLoading ? (
            <div className="h-40 animate-pulse rounded-md bg-[var(--surface-hi)]" />
          ) : !latest ? (
            <EmptyState
              icon={FileStack}
              title="No applications yet"
              description="Start your first verification to see progress here."
              action={
                <Button
                  onClick={() => router.push(ROUTES.customer.apply)}
                  size="sm"
                >
                  <FilePlus2 className="size-3.5" />
                  Start application
                </Button>
              }
              className="border-none bg-transparent"
              illustration={<EmptyApplicationsArt className="h-32 w-auto" />}
            />
          ) : (
            <LatestApplication workflow={latest} />
          )}
        </CardContent>
      </Card>

      {all.length > 1 && (
        <Card>
          <CardHeader className="flex-row items-center justify-between gap-2 space-y-0">
            <CardTitle>Recent activity</CardTitle>
            <Button asChild variant="ghost" size="sm">
              <Link href={ROUTES.customer.applications}>
                View all
                <ArrowRight className="size-3.5" />
              </Link>
            </Button>
          </CardHeader>
          <CardContent className="p-0">
            <ul className="divide-y divide-[var(--border)]">
              {all.slice(1, 6).map((w) => {
                const stepKey = (w.current_step ?? "").replace(/^failed_/, "");
                const label = STEP_LABELS[stepKey] ?? "Processing";
                return (
                  <li key={w.id}>
                    <Link
                      href={ROUTES.kycStatus(w.tracking_id)}
                      className="flex items-center gap-4 px-6 py-4 transition-colors hover:bg-[var(--surface-2)]"
                    >
                      <div className="min-w-0 flex-1">
                        <p className="truncate font-mono text-xs font-bold">
                          {w.reference}
                        </p>
                        <p className="mt-0.5 truncate text-xs text-[var(--muted)]">
                          {label} · {formatDateTime(w.updated_at)}
                        </p>
                      </div>
                      <WorkflowStatusPill status={w.status} />
                      <ArrowRight className="size-4 shrink-0 text-[var(--muted-2)]" />
                    </Link>
                  </li>
                );
              })}
            </ul>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function LatestApplication({ workflow }: { workflow: WorkflowListItem }) {
  const stage = stageForStep(workflow.current_step);
  const failure =
    workflow.status === "FAILED"
      ? friendlyFailure(workflow.current_step, workflow.last_error)
      : null;

  return (
    <>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <span className="font-mono text-xs font-bold text-[var(--muted)]">
          {workflow.reference}
        </span>
        <span className="text-xs text-[var(--muted)]">·</span>
        <span className="text-xs text-[var(--muted)]">
          Submitted {formatDateTime(workflow.created_at)}
        </span>
      </div>

      <ol className="relative mt-8 grid grid-cols-4 gap-3">
        {DISPLAY_STEPS.map((label, i) => {
          const state =
            workflow.status === "COMPLETED"
              ? "done"
              : workflow.status === "FAILED"
              ? i < stage
                ? "done"
                : i === stage
                ? "failed"
                : "pending"
              : i < stage
              ? "done"
              : i === stage
              ? "active"
              : "pending";

          return (
            <li
              key={label}
              className="flex flex-col items-center gap-2 sm:flex-row sm:items-center"
            >
              <StepBubble state={state} index={i + 1} />
              {i < DISPLAY_STEPS.length - 1 && (
                <span
                  aria-hidden
                  className={cn(
                    "h-0.5 flex-1 transition-colors",
                    state === "done"
                      ? "bg-[var(--primary)]"
                      : "bg-[var(--border)]",
                  )}
                />
              )}
              <span
                className={cn(
                  "text-[11px] sm:absolute sm:top-12",
                  state === "pending"
                    ? "font-semibold text-[var(--muted)]"
                    : "font-bold text-[var(--fg)]",
                )}
              >
                {label}
              </span>
            </li>
          );
        })}
      </ol>

      {failure && (
        <div className="mt-12 rounded-xl border border-[var(--danger-border)] bg-[var(--danger-soft)] p-4 sm:mt-14">
          <div className="flex items-start gap-3">
            <XCircle
              className="mt-0.5 size-5 shrink-0 text-[var(--danger)]"
              strokeWidth={2.5}
            />
            <div className="min-w-0 flex-1">
              <p className="text-sm font-extrabold text-[var(--danger)]">
                {failure.title}
              </p>
              <p className="mt-1 text-xs leading-relaxed text-[var(--fg)]">
                {failure.message}
              </p>
              <p className="mt-2 text-xs font-bold text-[var(--fg)]">
                {failure.action}
              </p>
            </div>
          </div>
        </div>
      )}

      <div className="mt-6 flex justify-end">
        <Button asChild>
          <Link href={ROUTES.kycStatus(workflow.tracking_id)}>
            View details
            <ArrowRight className="size-3.5" />
          </Link>
        </Button>
      </div>
    </>
  );
}

function StepBubble({
  state,
  index,
}: {
  state: "done" | "active" | "pending" | "failed";
  index: number;
}) {
  const base =
    "grid size-9 shrink-0 place-items-center rounded-full text-xs font-bold transition-colors";

  if (state === "done") {
    return (
      <span className={cn(base, "bg-[var(--primary)] text-white")}>
        <CheckCircle2 className="size-4" strokeWidth={3} />
      </span>
    );
  }
  if (state === "failed") {
    return (
      <span className={cn(base, "bg-[var(--danger)] text-white")}>
        <XCircle className="size-4" strokeWidth={3} />
      </span>
    );
  }
  if (state === "active") {
    return (
      <span
        className={cn(
          base,
          "border-2 border-[var(--primary)] bg-white text-[var(--primary)]",
        )}
      >
        {index}
      </span>
    );
  }
  return (
    <span
      className={cn(
        base,
        "border border-[var(--border)] bg-white text-[var(--muted)]",
      )}
    >
      {index}
    </span>
  );
}

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
        className={cn(
          "grid size-12 shrink-0 place-items-center rounded-xl",
          t.bg,
          t.fg,
        )}
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
        <p className="mt-1.5 text-xs font-bold text-[var(--muted)]">{label}</p>
      </div>
    </Card>
  );
}

function timeGreeting(name?: string): string {
  const hour = new Date().getHours();
  const prefix =
    hour < 12 ? "Good morning" : hour < 18 ? "Good afternoon" : "Good evening";
  return name ? `${prefix}, ${name}` : prefix;
}

function stageForStep(step: string | null): number {
  if (!step) return 0;
  const clean = step.replace(/^failed_/, "");
  const i = PIPELINE_STEPS.indexOf(clean as (typeof PIPELINE_STEPS)[number]);
  if (i === -1) return DISPLAY_STEPS.length - 1;
  if (i <= 2) return 0;
  if (i <= 4) return 1;
  if (i <= 6) return 2;
  return 3;
}