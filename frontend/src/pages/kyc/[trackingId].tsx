// src/pages/kyc/[trackingId].tsx
"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/router";
import {
  AlertTriangle,
  ArrowLeft,
  Check,
  CheckCircle2,
  Copy,
  Loader2,
  RefreshCw,
  ScanFace,
  ShieldAlert,
  XCircle,
} from "lucide-react";;

import { ROUTES } from "@/lib/constants";
import { useHealth, useStartKyc, useWorkflowStatus } from "@/lib/hooks";
import { friendlyFailure } from "@/lib/friendly-errors";
import { cn, formatDateTime } from "@/lib/utils";
import type {
  FaceMatchDecision,
  WorkflowStatusResponse,
} from "@/lib/types";
import {
  Button,
  StatusPill,
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
import { useToast } from "@/components/ui/toast";
import { useErrorModal } from "@/components/ui/error-modal";
import { ChatThread } from "@/components/kyc/chat-thread";
import { AssessmentHero } from "@/components/kyc/assessment-hero";
import {
  CUSTOMER_PIPELINE_STEPS,
  ProcessingModal,
  stepIndex,
} from "@/components/kyc/processing-modal";

const POLL_INTERVAL_MS = 1500;
const STALL_SOFT_MS = 60_000;
const STALL_HARD_MS = 180_000;
const STALL_TICK_MS = 5_000;

type StepState = "done" | "active" | "pending" | "failed";

export default function KYCStatusPage() {
  const router = useRouter();
  const toast = useToast();
  const errorModal = useErrorModal();
  const { trackingId } = router.query as { trackingId?: string };

  const query = useWorkflowStatus(trackingId, {
    refetchInterval: (q) => {
      const data = q.state.data;
      if (!data) return POLL_INTERVAL_MS;
      if (data.status === "COMPLETED" || data.status === "FAILED") return false;
      return POLL_INTERVAL_MS;
    },
  });

  const workflow = query.data;

  const [modalOpen, setModalOpen] = useState(true);
  const userMinimizedRef = useRef(false);

  useEffect(() => {
    if (!workflow) return;
    if (workflow.status === "COMPLETED" || workflow.status === "FAILED") {
      setModalOpen(false);
    } else if (!userMinimizedRef.current) {
      setModalOpen(true);
    }
  }, [workflow]);

  function minimize() {
    userMinimizedRef.current = true;
    setModalOpen(false);
  }

  function reopen() {
    userMinimizedRef.current = false;
    setModalOpen(true);
  }

  const failureModalShownRef = useRef<string | null>(null);

  useEffect(() => {
    if (!workflow || !trackingId) return;
    if (workflow.status !== "FAILED") return;
    if (failureModalShownRef.current === trackingId) return;

    failureModalShownRef.current = trackingId;
    const failure = friendlyFailure(workflow.current_step, workflow.last_error);

    errorModal.show({
      severity: "danger",
      title: failure.title,
      message: failure.message,
      details: [
        failure.action,
        "Your document is saved. You don't need to upload it again.",
      ],
      reference: workflow.reference,
      actions: [
        ...(failure.retryable && workflow.document_id !== null
          ? [
              {
                label: "Retry verification",
                variant: "primary" as const,
                onClick: () => {
                  if (workflow.document_id === null) return;
                  retry.mutate({ documentId: workflow.document_id, selfieId: workflow.selfie_id ?? undefined });
                },
              },
            ]
          : []),
        {
          label: "Upload a different document",
          variant: "outline" as const,
          onClick: () => router.push(ROUTES.customer.apply),
        },
        {
          label: "Back to applications",
          variant: "ghost" as const,
          onClick: () => router.push(ROUTES.customer.applications),
        },
      ],
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [workflow?.status, trackingId]);

  const [now, setNow] = useState(() => Date.now());
  const lastMovementRef = useRef(Date.now());

  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), STALL_TICK_MS);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    if (workflow?.updated_at) lastMovementRef.current = Date.now();
  }, [workflow?.updated_at]);

  const isTerminal =
    workflow?.status === "COMPLETED" || workflow?.status === "FAILED";
  const stalledFor = isTerminal ? 0 : now - lastMovementRef.current;
  const softStalled = !isTerminal && stalledFor >= STALL_SOFT_MS;
  const hardStalled = !isTerminal && stalledFor >= STALL_HARD_MS;

  const health = useHealth({ enabled: softStalled, refetchInterval: 10_000 });

  const retry = useStartKyc({
    onSuccess: (data) => {
      toast.push({
        severity: "success",
        title: "Verification restarted",
        message: "We're running the review again on your document.",
      });
      router.replace(ROUTES.kycStatus(data.tracking_id));
    },
    onError: (err) => {
      const message =
        err instanceof Error
          ? err.message
          : "We couldn't restart the verification. Please try again.";
      toast.push({
        severity: "danger",
        title: "Couldn't restart verification",
        message,
      });
    },
  });

  if (!trackingId || query.isLoading) return <StatusSkeleton />;

  if (query.isError || !workflow) {
    return (
      <EmptyState
        icon={AlertTriangle}
        title="Couldn't load this verification"
        description={
          query.error instanceof Error
            ? query.error.message
            : "The link may be wrong, or the application may no longer exist."
        }
        action={
          <Button asChild variant="outline" size="sm">
            <Link href={ROUTES.customer.applications}>
              <ArrowLeft className="size-3.5" />
              Back to my applications
            </Link>
          </Button>
        }
      />
    );
  }

  const documentId = workflow.document_id;
  const canRerun = workflow.status === "COMPLETED" && documentId !== null;

  return (
    // No max-width. The page fills whatever the shell gives it — the
    // sidebar and topbar already frame the content, an extra inner
    // constraint just makes the layout feel boxed in.
    <div className="w-full space-y-6">
      <Link
        href={ROUTES.customer.applications}
        className="inline-flex items-center gap-1.5 text-sm font-bold text-[var(--muted)] transition-colors hover:text-[var(--fg)]"
      >
        <ArrowLeft className="size-3.5" />
        All applications
      </Link>

      {/* Header + outcome + live progress. On wide screens, header
          takes the left column and the outcome card sits on the
          right. On narrow, they stack. */}
      <div className="grid gap-6 lg:grid-cols-[1fr_360px]">
        <WorkflowHeader workflow={workflow} />

        <div className="space-y-6">
          {workflow.status === "COMPLETED" && (
            <ResultCard workflow={workflow} />
          )}
          {workflow.status === "FAILED" && (
            <FailureCard
              workflow={workflow}
              onRetry={() => {
                if (documentId === null) return;
                retry.mutate({ documentId, selfieId: workflow.selfie_id ?? undefined });
              }}
              retrying={retry.isPending}
            />
          )}
          {!isTerminal && <ProgressHero workflow={workflow} />}
          {workflow.customer_assessment && (
            <AssessmentHero
              assessment={workflow.customer_assessment}
              faceMatch={workflow.face_match}
              variant="customer"
            />
          )}
        </div>
      </div>

      {softStalled && (
        <StallWarning
          stalledFor={stalledFor}
          hardStalled={hardStalled}
          health={health}
        />
      )}

      {canRerun && (
        <div className="flex justify-end">
          <Button
            variant="outline"
            size="sm"
            loading={retry.isPending}
            disabled={retry.isPending}
            onClick={() => {
              if (documentId === null) return;
              const id: number = documentId;
              errorModal.show({
                severity: "warning",
                title: "Start a new verification?",
                message:
                  "A new review will run against this document. Your previous result stays on record.",
                actions: [
                  {
                    label: "Cancel",
                    variant: "outline",
                    onClick: () => {
                      /* no-op; modal closes itself */
                    },
                  },
                  {
                    label: "Start re-run",
                    variant: "primary",
                    onClick: () => retry.mutate({ documentId: id, selfieId: workflow.selfie_id ?? undefined }),
                  },
                ],
              });
            }}
          >
            {!retry.isPending && <RefreshCw className="size-3.5" />}
            Re-run verification
          </Button>
        </div>
      )}

      {!isTerminal && (
        <div className="flex justify-center">
          <Button variant="outline" size="sm" onClick={reopen}>
            <Loader2 className="size-3.5 animate-spin" />
            Show live progress
          </Button>
        </div>
      )}

      {/* Stages on the left, details on the right. On wide screens the
          stage list gets the bulk of the width — it's the thing a
          customer actually reads. */}
      <div className="grid gap-6 lg:grid-cols-[1fr_360px]">
        <StagesCard workflow={workflow} />
        <DetailsCard workflow={workflow} />
      </div>

      <ProcessingModal
        open={modalOpen}
        workflow={workflow}
        onMinimize={minimize}
        variant="customer"
      />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Header
// ---------------------------------------------------------------------------

function WorkflowHeader({ workflow }: { workflow: WorkflowStatusResponse }) {
  const isCompleted = workflow.status === "COMPLETED";
  const isFailed = workflow.status === "FAILED";
  const isLive = !isCompleted && !isFailed;

  return (
    <div className="overflow-hidden rounded-2xl border border-[var(--border)] bg-white shadow-[var(--shadow-sm)]">
      <div
        className={cn(
          "h-1.5 w-full",
          isCompleted && "bg-[var(--success)]",
          isFailed && "bg-[var(--danger)]",
          isLive && "bg-[var(--primary)]",
        )}
      />
      <div className="p-6 sm:p-7">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-[10px] font-extrabold uppercase tracking-[0.18em] text-[var(--muted-2)]">
            Verification
          </p>
          <div className="flex items-center gap-2">
            {isLive && (
              <span className="inline-flex items-center gap-1.5 rounded-full border border-[var(--primary-border)] bg-[var(--primary-soft)] px-2.5 py-0.5 text-[10px] font-extrabold uppercase tracking-wider text-[var(--primary)]">
                <span className="relative flex size-1.5">
                  <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-[var(--primary)] opacity-75" />
                  <span className="relative inline-flex size-1.5 rounded-full bg-[var(--primary)]" />
                </span>
                Live
              </span>
            )}
            <WorkflowStatusPill status={workflow.status} />
          </div>
        </div>

        <div className="mt-3 flex items-center gap-3">
          <h1 className="font-mono text-2xl font-extrabold tracking-tight text-[var(--fg)] sm:text-3xl">
            {workflow.reference}
          </h1>
          <CopyReference reference={workflow.reference} />
        </div>

        <div className="my-6 h-px w-full bg-[var(--border)]" />

        <dl className="grid gap-x-8 gap-y-4 sm:grid-cols-3">
          <MetaCell
            label="Submitted"
            value={formatDateTime(workflow.created_at)}
          />
          <MetaCell
            label="Last update"
            value={formatDateTime(workflow.updated_at)}
          />
          <MetaCell
            label="Document"
            value={
              workflow.document_id !== null
                ? `#${workflow.document_id}`
                : "Not linked"
            }
          />
        </dl>
      </div>
    </div>
  );
}

function MetaCell({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <dt className="text-[10px] font-extrabold uppercase tracking-[0.14em] text-[var(--muted-2)]">
        {label}
      </dt>
      <dd className="mt-1 truncate text-sm font-bold text-[var(--fg)]">
        {value}
      </dd>
    </div>
  );
}

function CopyReference({ reference }: { reference: string }) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(reference);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* clipboard unavailable */
    }
  }

  return (
    <button
      type="button"
      onClick={copy}
      aria-label="Copy reference"
      title={copied ? "Copied" : "Copy reference"}
      className="grid size-7 shrink-0 place-items-center rounded-lg border border-[var(--border)] text-[var(--muted-2)] transition-colors hover:bg-[var(--surface-2)] hover:text-[var(--fg)]"
    >
      {copied ? (
        <Check className="size-3.5 text-[var(--success)]" strokeWidth={3} />
      ) : (
        <Copy className="size-3.5" />
      )}
    </button>
  );
}

// ---------------------------------------------------------------------------
// Progress hero
// ---------------------------------------------------------------------------


// ---------------------------------------------------------------------------
// Stages
// ---------------------------------------------------------------------------

function StagesCard({ workflow }: { workflow: WorkflowStatusResponse }) {
  const currentIndex = stepIndex(workflow.current_step, CUSTOMER_PIPELINE_STEPS);

  return (
    <Card>
      <CardHeader className="border-b border-[var(--border)]">
        <CardTitle>What happens during your review</CardTitle>
        <p className="mt-1 text-sm text-[var(--muted)]">
          Every application goes through the same {CUSTOMER_PIPELINE_STEPS.length} stages.
        </p>
      </CardHeader>
      <CardContent className="p-7">
        <ol className="space-y-0">
          {CUSTOMER_PIPELINE_STEPS.map((step, i) => {
            const state = stepState(i, currentIndex, workflow);
            const isLast = i === CUSTOMER_PIPELINE_STEPS.length - 1;
            return (
              <li key={step.key} className="relative flex items-start gap-4">
                {!isLast && (
                  <span
                    aria-hidden
                    className={cn(
                      "absolute left-[13px] top-7 w-px",
                      state === "done"
                        ? "bg-[var(--primary)]"
                        : state === "failed"
                        ? "bg-[var(--danger)]"
                        : "bg-[var(--border)]",
                    )}
                    style={{ height: "calc(100% - 4px)" }}
                  />
                )}
                <StepIcon state={state} />
                <div className="min-w-0 flex-1 pb-6">
                  <p
                    className={cn(
                      "text-sm font-bold",
                      state === "pending" && "text-[var(--muted)]",
                      state === "failed" && "text-[var(--danger)]",
                    )}
                  >
                    {step.label}
                  </p>
                  <p className="mt-0.5 text-xs text-[var(--muted)]">
                    {step.description}
                  </p>
                </div>
              </li>
            );
          })}
        </ol>
      </CardContent>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Details
// ---------------------------------------------------------------------------

function DetailsCard({ workflow }: { workflow: WorkflowStatusResponse }) {
  const rows: { label: string; value: string; mono?: boolean }[] = [
    { label: "Reference",   value: workflow.reference, mono: true },
    { label: "Submitted",   value: formatDateTime(workflow.created_at) },
    { label: "Last update", value: formatDateTime(workflow.updated_at) },
  ];
  if (workflow.document_id !== null) {
    rows.push({
      label: "Document",
      value: `#${workflow.document_id}`,
      mono: true,
    });
  }

  return (
    <Card>
      <CardHeader className="border-b border-[var(--border)]">
        <CardTitle>Details</CardTitle>
      </CardHeader>
      <CardContent className="p-0">
        <dl>
          {rows.map((row, i) => (
            <div
              key={row.label}
              className={cn(
                "flex items-start gap-4 px-6 py-4",
                i > 0 && "border-t border-[var(--border)]",
              )}
            >
              <dt className="w-24 shrink-0 text-[10px] font-extrabold uppercase tracking-[0.14em] text-[var(--muted-2)]">
                {row.label}
              </dt>
              <dd
                className={cn(
                  "min-w-0 flex-1 break-all text-right text-sm font-bold text-[var(--fg)]",
                  row.mono && "font-mono text-xs",
                )}
              >
                {row.value}
              </dd>
            </div>
          ))}
          {workflow.face_match && (
            <div className="flex items-start gap-4 border-t border-[var(--border)] px-6 py-4">
              <dt className="w-24 shrink-0 text-[10px] font-extrabold uppercase tracking-[0.14em] text-[var(--muted-2)]">
                Selfie
              </dt>
              <dd className="min-w-0 flex-1 text-right">
                <FaceMatchCustomerPill decision={workflow.face_match.decision} />
              </dd>
            </div>
          )}
        </dl>
      </CardContent>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Result
// ---------------------------------------------------------------------------

function ResultCard({ workflow }: { workflow: WorkflowStatusResponse }) {
  const outcome = outcomeFor(workflow);
  const tone =
    outcome.tone === "danger"
      ? {
          border: "border-[var(--danger-border)]",
          accent: "bg-[var(--danger)]",
          chipBg: "bg-[var(--danger-soft)]",
          chipFg: "text-[var(--danger)]",
          iconBg: "bg-[var(--danger-soft)]",
          iconFg: "text-[var(--danger)]",
          Icon: ShieldAlert,
        }
      : outcome.tone === "warning"
      ? {
          border: "border-[var(--warning-border)]",
          accent: "bg-[var(--warning)]",
          chipBg: "bg-[var(--warning-soft)]",
          chipFg: "text-[var(--warning)]",
          iconBg: "bg-[var(--warning-soft)]",
          iconFg: "text-[var(--warning)]",
          Icon: AlertTriangle,
        }
      : {
          border: "border-[var(--success-border)]",
          accent: "bg-[var(--success)]",
          chipBg: "bg-[var(--success-soft)]",
          chipFg: "text-[var(--success)]",
          iconBg: "bg-[var(--success-soft)]",
          iconFg: "text-[var(--success)]",
          Icon: CheckCircle2,
        };

  const { Icon } = tone;

  return (
    <div
      className={cn(
        "overflow-hidden rounded-2xl border-2 bg-white shadow-[var(--shadow-sm)]",
        tone.border,
      )}
    >
      <div className={cn("h-1 w-full", tone.accent)} />
      <CardContent className="p-6">
        <div className="flex items-start gap-4">
          <span
            className={cn(
              "grid size-11 shrink-0 place-items-center rounded-xl",
              tone.iconBg,
              tone.iconFg,
            )}
          >
            <Icon className="size-5" strokeWidth={2.5} />
          </span>
          <div className="min-w-0 flex-1">
            <span
              className={cn(
                "inline-flex items-center rounded-full px-2.5 py-0.5 text-[10px] font-extrabold uppercase tracking-[0.14em]",
                tone.chipBg,
                tone.chipFg,
              )}
            >
              {outcome.label}
            </span>
            <h2 className="mt-2 text-lg font-extrabold tracking-tight">
              {outcome.title}
            </h2>
            <p className="mt-1 text-sm leading-relaxed text-[var(--muted)]">
              {outcome.summary}
            </p>
          </div>
        </div>
      </CardContent>
    </div>
  );
}

interface Outcome {
  label: string;
  title: string;
  tone: "success" | "warning" | "danger";
  summary: string;
}

function outcomeFor(workflow: WorkflowStatusResponse): Outcome {
  const report = workflow.screening_report;
  if (!report) {
    return {
      label: "Completed",
      title: "Review complete",
      tone: "warning",
      summary:
        "Your application was received. The outcome will appear here shortly.",
    };
  }
  if (report.overall_status === "FAIL") {
    return {
      label: "Not approved",
      title: "We couldn't verify your details",
      tone: "danger",
      summary:
        "We couldn't confirm the details on this application. You can try again, or contact support if you'd like us to take another look.",
    };
  }
  if (report.overall_status === "REVIEW") {
    return {
      label: "Under review",
      title: "A team member is looking at your application",
      tone: "warning",
      summary:
        "One of our colleagues is reviewing your details. We'll be in touch if anything else is needed.",
    };
  }
  return {
    label: "Approved",
    title: "Your identity has been verified",
    tone: "success",
    summary:
      "We've completed all the checks we're required to do. No further action is needed from you.",
  };
}

// ---------------------------------------------------------------------------
// Failure
// ---------------------------------------------------------------------------

function FailureCard({
  workflow,
  onRetry,
  retrying,
}: {
  workflow: WorkflowStatusResponse;
  onRetry: () => void;
  retrying: boolean;
}) {
  const failure = friendlyFailure(workflow.current_step, workflow.last_error);
  const canRetry = failure.retryable && workflow.document_id !== null;

  return (
    <div className="overflow-hidden rounded-2xl border-2 border-[var(--danger-border)] bg-white shadow-[var(--shadow-sm)]">
      <div className="h-1 w-full bg-[var(--danger)]" />
      <CardContent className="p-6">
        <div className="flex items-start gap-4">
          <span className="grid size-11 shrink-0 place-items-center rounded-xl bg-[var(--danger-soft)] text-[var(--danger)]">
            <XCircle className="size-5" strokeWidth={2.5} />
          </span>
          <div className="min-w-0 flex-1">
            <span className="inline-flex items-center rounded-full bg-[var(--danger-soft)] px-2.5 py-0.5 text-[10px] font-extrabold uppercase tracking-[0.14em] text-[var(--danger)]">
              Verification stopped
            </span>
            <h2 className="mt-2 text-lg font-extrabold tracking-tight">
              {failure.title}
            </h2>
            <p className="mt-2 text-sm leading-relaxed text-[var(--muted)]">
              {failure.message}
            </p>
            <p className="mt-3 rounded-lg border border-[var(--border)] bg-[var(--surface-2)] p-3 text-xs font-semibold text-[var(--fg)]">
              {failure.action}
            </p>

            <div className="mt-4 flex flex-wrap gap-2">
              {canRetry && (
                <Button size="sm" onClick={onRetry} loading={retrying}>
                  {!retrying && <RefreshCw className="size-3.5" />}
                  Try again
                </Button>
              )}
              {workflow.document_id !== null && (
                <Button asChild size="sm" variant="outline">
                  <Link href={ROUTES.customer.apply}>
                    Upload a different document
                  </Link>
                </Button>
              )}
            </div>
          </div>
        </div>
      </CardContent>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Stall warning
// ---------------------------------------------------------------------------

function StallWarning({
  stalledFor,
  hardStalled,
  health,
}: {
  stalledFor: number;
  hardStalled: boolean;
  health: ReturnType<typeof useHealth>;
}) {
  const seconds = Math.round(stalledFor / 1000);
  const h = health.data;
  const healthLoaded = !health.isLoading && !!h;
  const dbOk = h?.db.ok;
  const brokerChecked = h?.broker.message !== "skipped";
  const brokerOk = h?.broker.ok;

  return (
    <Card
      className={cn(
        "border-2",
        hardStalled
          ? "border-[var(--danger-border)]"
          : "border-[var(--warning-border)]",
      )}
    >
      <CardContent className="p-6">
        <div className="flex items-start gap-4">
          <span
            className={cn(
              "grid size-12 shrink-0 place-items-center rounded-xl border-2",
              hardStalled
                ? "border-[var(--danger-border)] bg-[var(--danger-soft)] text-[var(--danger)]"
                : "border-[var(--warning-border)] bg-[var(--warning-soft)] text-[var(--warning)]",
            )}
          >
            <AlertTriangle className="size-6" strokeWidth={2.5} />
          </span>

          <div className="min-w-0 flex-1">
            <span
              className={cn(
                "inline-flex items-center rounded-full px-2.5 py-0.5 text-[10px] font-extrabold uppercase tracking-[0.14em]",
                hardStalled
                  ? "bg-[var(--danger-soft)] text-[var(--danger)]"
                  : "bg-[var(--warning-soft)] text-[var(--warning)]",
              )}
            >
              {hardStalled ? "Stalled" : "Delayed"}
            </span>
            <h3 className="mt-2 text-base font-extrabold">
              {hardStalled
                ? "The verification isn't responding"
                : "This is taking longer than usual"}
            </h3>
            <p className="mt-1 text-sm text-[var(--muted)]">
              No progress recorded for{" "}
              <span className="font-bold text-[var(--fg)]">{seconds}s</span>.
              {hardStalled
                ? " Our verification service appears to be offline."
                : " If this continues, the verification may not complete."}
            </p>

            {healthLoaded && (
              <div className="mt-4 grid gap-2 text-xs sm:grid-cols-3">
                <HealthPill label="API" ok={true} />
                <HealthPill label="Database" ok={!!dbOk} />
                {brokerChecked && (
                  <HealthPill
                    label="Worker"
                    ok={!!brokerOk}
                    hint={brokerOk ? undefined : "Unreachable"}
                  />
                )}
              </div>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function HealthPill({
  label,
  ok,
  hint,
}: {
  label: string;
  ok: boolean;
  hint?: string;
}) {
  return (
    <div className="flex items-center gap-2 rounded-md border border-[var(--border)] bg-[var(--surface-2)] px-3 py-2">
      <span
        className={cn(
          "size-1.5 rounded-full",
          ok ? "bg-[var(--success)]" : "bg-[var(--danger)]",
        )}
      />
      <span className="text-xs font-bold">{label}</span>
      <span className="ml-auto text-[10px] font-bold uppercase tracking-widest text-[var(--muted-2)]">
        {hint ?? (ok ? "OK" : "Down")}
      </span>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Icons + helpers
// ---------------------------------------------------------------------------

function StepIcon({ state }: { state: StepState }) {
  const base =
    "relative grid size-7 shrink-0 place-items-center rounded-full border-2 transition-colors bg-white";

  if (state === "done") {
    return (
      <span className={cn(base, "border-[var(--primary)] bg-[var(--primary)]")}>
        <Check className="size-3.5 text-white" strokeWidth={3} />
      </span>
    );
  }
  if (state === "active") {
    return (
      <span className={cn(base, "border-[var(--primary)]")}>
        <Loader2 className="size-3.5 animate-spin text-[var(--primary)]" />
      </span>
    );
  }
  if (state === "failed") {
    return (
      <span className={cn(base, "border-[var(--danger)] bg-[var(--danger-soft)]")}>
        <XCircle className="size-3.5 text-[var(--danger)]" />
      </span>
    );
  }
  return (
    <span className={cn(base, "border-[var(--border)]")}>
      <span className="size-1.5 rounded-full bg-[var(--muted)]" />
    </span>
  );
}

function StatusSkeleton() {
  return (
    <div className="w-full space-y-6">
      <Skeleton className="h-4 w-32" />
      <div className="grid gap-6 lg:grid-cols-[1fr_360px]">
        <Skeleton className="h-48 w-full" />
        <Skeleton className="h-48 w-full" />
      </div>
      <div className="grid gap-6 lg:grid-cols-[1fr_360px]">
        <Skeleton className="h-96 w-full" />
        <Skeleton className="h-64 w-full" />
      </div>
    </div>
  );
}

function stepState(
  index: number,
  currentIndex: number,
  workflow: WorkflowStatusResponse,
): StepState {
  if (workflow.status === "COMPLETED") return "done";
  if (workflow.status === "FAILED") {
    if (index < currentIndex) return "done";
    if (index === currentIndex) return "failed";
    return "pending";
  }
  if (index < currentIndex) return "done";
  if (index === currentIndex) return "active";
  return "pending";
}

// ---------------------------------------------------------------------------
// Face match pill (customer-facing — shows the outcome, never the score)
// ---------------------------------------------------------------------------

function FaceMatchCustomerPill({ decision }: { decision: FaceMatchDecision }) {
  if (decision === "MATCH") {
    return (
      <span className="text-xs font-bold text-[var(--success)]">
        Verified
      </span>
    );
  }
  if (decision === "REVIEW") {
    return (
      <span className="text-xs font-bold text-[var(--warning)]">
        Under review
      </span>
    );
  }
  return (
    <span className="text-xs font-bold text-[var(--danger)]">
      Couldn&apos;t verify
    </span>
  );
}

function ProgressHero({ workflow }: { workflow: WorkflowStatusResponse }) {
  const currentIndex = stepIndex(workflow.current_step, CUSTOMER_PIPELINE_STEPS);
  const total = CUSTOMER_PIPELINE_STEPS.length;
  const current = CUSTOMER_PIPELINE_STEPS[currentIndex];
  const pct = Math.round(((currentIndex + 1) / total) * 100);

  return (
    <Card className="overflow-hidden border-[var(--primary-border)] shadow-[0_0_40px_-10px_var(--primary)]">
      <div className="relative p-8">
        <div 
          aria-hidden 
          className="absolute inset-0 opacity-[0.03]"
          style={{
            backgroundImage: "linear-gradient(var(--primary) 1px, transparent 1px), linear-gradient(90deg, var(--primary) 1px, transparent 1px)",
            backgroundSize: "20px 20px"
          }}
        />
        
        <div className="relative flex flex-col items-center text-center">
          <div className="radar-container mb-6">
            <div className="radar-ping" />
            <div className="radar-ping" style={{ animationDelay: "1s" }} />
            <div className="radar-sweep" />
            <ScanFace className="size-8 text-[var(--primary)] relative z-10" />
          </div>

          <h2 className="text-xl font-extrabold tracking-tight font-mono uppercase text-[var(--primary)]">
            Scanning Application
          </h2>
          
          <div className="mt-2 inline-flex items-center gap-2 rounded-full border border-[var(--primary-border)] bg-[var(--primary-soft)] px-3 py-1">
            <span className="relative flex size-2">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-[var(--primary)] opacity-75" />
              <span className="relative inline-flex size-2 rounded-full bg-[var(--primary)]" />
            </span>
            <span className="text-[11px] font-extrabold uppercase tracking-widest text-[var(--primary)]">
              Stage {currentIndex + 1} / {total}
            </span>
          </div>

          <div className="mt-8 w-full max-w-sm text-left">
            <p className="font-mono text-xs text-[var(--muted)] mb-1">&gt; TASK_RUNNING:</p>
            <p className="font-mono text-sm font-bold text-[var(--fg)]">
              {current?.label ?? "Initializing..."}
            </p>
            
            <div className="mt-4 h-1.5 w-full bg-[var(--surface-hi)] rounded-full overflow-hidden">
               <div 
                  className="h-full bg-[var(--primary)] transition-all duration-1000 ease-out"
                  style={{ width: `${pct}%` }}
               />
            </div>
            <div className="mt-2 flex justify-between font-mono text-[10px] text-[var(--muted)]">
              <span>ENCRYPTED CHANNEL</span>
              <span>{pct}% COMPLETE</span>
            </div>
          </div>
        </div>
      </div>
    </Card>
  );
}
