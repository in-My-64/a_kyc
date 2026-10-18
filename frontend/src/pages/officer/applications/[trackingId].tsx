// src/pages/officer/applications/[trackingId].tsx
"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/router";
import {
  AlertTriangle,
  ArrowLeft,
  Check,
  Clock,
  Copy,
  ExternalLink,
  FileText,
  RefreshCw,
  User as UserIcon,
} from "lucide-react";

import { ROUTES } from "@/lib/constants";
import { useStartKyc, useWorkflowStatus } from "@/lib/hooks";
import { cn } from "@/lib/utils";
import type { WorkflowStatusResponse } from "@/lib/types";
import { Button, WorkflowStatusPill } from "@/components/ui/primitives";
import { EmptyState, Skeleton } from "@/components/ui/surfaces";
import { useToast } from "@/components/ui/toast";
import { useErrorModal } from "@/components/ui/error-modal";
import { OfficerReview } from "@/components/kyc/officer-review";
import { BiometricMatchCard } from "@/components/kyc/biometric-match-card";

/**
 * Officer detail view for a single workflow.
 *
 * A re-run creates a NEW workflow against the same document — the
 * current one stays on the customer's history unchanged. The new
 * workflow is owned by the customer, not the officer; the officer's
 * initiating action is captured by AuditMiddleware.
 */
export default function OfficerApplicationDetailPage() {
  const router = useRouter();
  const { trackingId } = router.query as { trackingId?: string };

  const statusQuery = useWorkflowStatus(trackingId);

  if (!trackingId) {
    return <DetailSkeleton />;
  }

  if (statusQuery.isLoading) {
    return <DetailSkeleton />;
  }

  if (statusQuery.isError || !statusQuery.data) {
    return (
      <div className="space-y-6">
        <BackLink />
        <EmptyState
          icon={AlertTriangle}
          title="Application not found"
          description={
            statusQuery.error instanceof Error
              ? statusQuery.error.message
              : "This workflow doesn't exist, or it belongs to another customer."
          }
          action={
            <Button asChild size="sm" variant="outline">
              <Link href={ROUTES.officer.applications}>
                Back to applications
              </Link>
            </Button>
          }
        />
      </div>
    );
  }

  const workflow = statusQuery.data;

  return (
    <div className="space-y-6">
      <BackLink />
      <WorkflowHeader workflow={workflow} />
      {workflow.face_match && (
        <BiometricMatchCard result={workflow.face_match} />
      )}
      <OfficerReview trackingId={trackingId} initialWorkflow={workflow} />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Header card
// ---------------------------------------------------------------------------

const STATUS_ACCENT: Record<WorkflowStatusResponse["status"], string> = {
  COMPLETED: "bg-[var(--success)]",
  FAILED: "bg-[var(--danger)]",
  IN_PROGRESS: "bg-[var(--primary)]",
  PENDING: "bg-[var(--muted-2)]",
};

function WorkflowHeader({ workflow }: { workflow: WorkflowStatusResponse }) {
  const isTerminal =
    workflow.status === "COMPLETED" || workflow.status === "FAILED";
  const canRerun = isTerminal && workflow.document_id !== null;
  const isLive =
    workflow.status === "PENDING" || workflow.status === "IN_PROGRESS";

  const durationEnd = isTerminal
    ? workflow.updated_at
    : new Date().toISOString();
  const duration = formatDuration(workflow.created_at, durationEnd);

  return (
    /* OUTER CARD — this is the container. Border, background, rounded
       corners, shadow, and overflow-hidden so the accent bar hugs the
       top corners. If you see the header floating on the page bg, this
       div is the one that isn't rendering. */
    <div className="overflow-hidden rounded-2xl border border-[var(--border)] bg-white shadow-[var(--shadow-sm)]">
      {/* Accent bar — first child, so it sits at the very top of the card */}
      <div className={cn("h-1.5 w-full", STATUS_ACCENT[workflow.status])} />

      {/* Inner padded region */}
      <div className="p-6 sm:p-8">
        {/* Eyebrow row: label + status controls */}
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
            {canRerun && (
              <RerunButton
                selfieId={workflow.selfie_id ?? 0}
                documentId={workflow.document_id!}
                isCompleted={workflow.status === "COMPLETED"}
              />
            )}
          </div>
        </div>

        {/* Hero: reference in mono */}
        <h1 className="mt-3 font-mono text-2xl font-extrabold tracking-tight text-[var(--fg)] sm:text-3xl">
          {workflow.reference}
        </h1>

        {/* Divider */}
        <div className="my-6 h-px w-full bg-[var(--border)]" />

        {/* Metadata grid */}
        <dl className="grid gap-x-8 gap-y-5 sm:grid-cols-2 lg:grid-cols-4">
          <MetaCell
            icon={UserIcon}
            label="Customer"
            primary={workflow.customer_name}
            link={{
              href: ROUTES.officer.customerDetail(workflow.customer_id),
              label: "View customer",
            }}
          />

          <MetaCell
            icon={FileText}
            label="Document"
            primary={
              workflow.document_id !== null
                ? `#${workflow.document_id}`
                : "Not linked"
            }
            link={
              workflow.document_id !== null
                ? {
                    href: `/api/proxy/documents/${workflow.document_id}/preview`,
                    label: "Open preview",
                    external: true,
                  }
                : undefined
            }
          />

          <MetaCell
            icon={Clock}
            label="Submitted"
            primary={formatDate(workflow.created_at)}
            secondary={formatTime(workflow.created_at)}
          />

          <MetaCell
            icon={Clock}
            label={isTerminal ? "Duration" : "Elapsed"}
            primary={duration}
            secondary={isTerminal ? "End-to-end" : "Still running"}
          />
        </dl>

        {/* Internal ID row — inside the same card, at the bottom */}
        <InternalIdRow id={workflow.tracking_id} />
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------

function MetaCell({
  icon: Icon,
  label,
  primary,
  secondary,
  link,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  primary: string;
  secondary?: string;
  link?: { href: string; label: string; external?: boolean };
}) {
  return (
    <div className="min-w-0">
      <dt className="flex items-center gap-1.5 text-[10px] font-extrabold uppercase tracking-[0.14em] text-[var(--muted-2)]">
        <Icon className="size-3" />
        {label}
      </dt>
      <dd className="mt-1.5">
        <p className="truncate text-sm font-bold text-[var(--fg)]">{primary}</p>
        {secondary && (
          <p className="mt-0.5 text-[11px] text-[var(--muted)]">{secondary}</p>
        )}
        {link && (
          <Link
            href={link.href}
            target={link.external ? "_blank" : undefined}
            rel={link.external ? "noopener noreferrer" : undefined}
            className="mt-1 inline-flex items-center gap-1 text-[11px] font-bold text-[var(--primary)] hover:underline"
          >
            {link.label}
            {link.external && <ExternalLink className="size-2.5" />}
          </Link>
        )}
      </dd>
    </div>
  );
}

function InternalIdRow({ id }: { id: string }) {
  const toast = useToast();
  const [copied, setCopied] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(id);
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
    <div className="mt-6 flex items-center gap-3 rounded-lg border border-dashed border-[var(--border)] bg-[var(--surface-2)] px-3 py-2">
      <span className="shrink-0 text-[10px] font-extrabold uppercase tracking-[0.14em] text-[var(--muted-2)]">
        Internal ID
      </span>
      <code className="min-w-0 flex-1 truncate font-mono text-[11px] text-[var(--muted)]">
        {id}
      </code>
      <button
        type="button"
        onClick={copy}
        aria-label="Copy internal ID"
        className="grid size-6 shrink-0 place-items-center rounded text-[var(--muted-2)] transition-colors hover:bg-white hover:text-[var(--fg)]"
      >
        {copied ? (
          <Check className="size-3 text-[var(--success)]" strokeWidth={3} />
        ) : (
          <Copy className="size-3" />
        )}
      </button>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Re-run action
// ---------------------------------------------------------------------------

function RerunButton({
  documentId,
  selfieId,
  isCompleted,
}: {
  documentId: number;
  selfieId: number;
  isCompleted: boolean;
}) {
  const router = useRouter();
  const toast = useToast();
  const errorModal = useErrorModal();

  const rerun = useStartKyc({
    onSuccess: (data) => {
      toast.push({
        severity: "success",
        title: "Re-run started",
        message:
          "A new verification has been dispatched. It will appear on the " +
          "customer's application history.",
      });
      router.replace(ROUTES.officer.applicationDetail(data.tracking_id));
    },
    onError: (err) => {
      const message =
        err instanceof Error ? err.message : "Something went wrong.";
      if (message.toLowerCase().includes("already running")) {
        toast.push({
          severity: "info",
          title: "Already in progress",
          message: "A verification is already running for this document.",
        });
        router.replace(ROUTES.officer.applications);
        return;
      }
      toast.push({
        severity: "danger",
        title: "Couldn't start re-run",
        message,
      });
    },
  });

  function confirm() {
    errorModal.show({
      severity: "warning",
      title: isCompleted ? "Start a new verification?" : "Retry verification?",
      message: isCompleted
        ? "A new verification will run against this document. The current completed review stays on record."
        : "A new verification will run against this document.",
      actions: [
        {
          label: "Cancel",
          variant: "outline",
          onClick: () => {
            /* no-op; modal closes itself */
          },
        },
        {
          label: isCompleted ? "Start re-run" : "Retry",
          variant: "primary",
          onClick: () => rerun.mutate({ documentId, selfieId }),
        },
      ],
    });
  }

  return (
    <Button
      variant="outline"
      size="sm"
      loading={rerun.isPending}
      disabled={rerun.isPending}
      onClick={confirm}
    >
      {!rerun.isPending && <RefreshCw className="size-3.5" />}
      {isCompleted ? "Re-run" : "Retry"}
    </Button>
  );
}

// ---------------------------------------------------------------------------
// Small pieces
// ---------------------------------------------------------------------------

function BackLink() {
  return (
    <Link
      href={ROUTES.officer.applications}
      className="inline-flex items-center gap-1.5 text-sm text-[var(--muted)] transition-colors hover:text-[var(--fg)]"
    >
      <ArrowLeft className="size-3.5" />
      All applications
    </Link>
  );
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString("en-GB", {
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatDuration(fromIso: string, toIso: string): string {
  const ms = new Date(toIso).getTime() - new Date(fromIso).getTime();
  const s = Math.max(0, Math.round(ms / 1000));
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  const rem = s % 60;
  if (m < 60) return rem ? `${m}m ${rem}s` : `${m}m`;
  const h = Math.floor(m / 60);
  return `${h}h ${m % 60}m`;
}

function DetailSkeleton() {
  return (
    <div className="space-y-6">
      <Skeleton className="h-4 w-32" />
      <Skeleton className="h-56 w-full" />
      <Skeleton className="h-12 w-full" />
      <Skeleton className="h-96 w-full" />
    </div>
  );
}