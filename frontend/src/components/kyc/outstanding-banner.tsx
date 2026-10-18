// src/components/kyc/outstanding-banner.tsx
"use client";

import Link from "next/link";
import {
  AlertTriangle,
  ArrowRight,
  FilePlus2,
  MessageSquare,
} from "lucide-react";

import { ROUTES } from "@/lib/constants";
import type { WorkflowListItem } from "@/lib/types";
import { formatDateTime } from "@/lib/utils";
import { Button } from "@/components/ui/primitives";

/**
 * Shown at the top of the customer dashboard for every workflow whose
 * officer decision is MORE_INFO and which the customer hasn't yet
 * answered.
 *
 * "Answered" is derived server-side: as soon as a newer workflow exists
 * against the same document, the request stops appearing here. No
 * dismiss button, no acknowledgement state — uploading a new document
 * is the acknowledgement.
 */
export function OutstandingBanner({
  workflow,
}: {
  workflow: WorkflowListItem;
}) {
  return (
    <div className="overflow-hidden rounded-2xl border-2 border-[var(--warning-border)] bg-white shadow-[var(--shadow-sm)]">
      <div className="h-1.5 w-full bg-[var(--warning)]" />
      <div className="flex flex-wrap items-start gap-4 p-5 sm:p-6">
        <span className="grid size-12 shrink-0 place-items-center rounded-xl bg-[var(--warning-soft)] text-[var(--warning)]">
          <AlertTriangle className="size-6" strokeWidth={2.5} />
        </span>

        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="inline-flex items-center rounded-full bg-[var(--warning-soft)] px-2.5 py-0.5 text-[10px] font-extrabold uppercase tracking-[0.14em] text-[var(--warning)]">
              Action needed
            </span>
            <span className="font-mono text-[11px] font-bold text-[var(--muted)]">
              {workflow.reference}
            </span>
            {workflow.decided_at && (
              <span className="text-[11px] text-[var(--muted)]">
                · requested {formatDateTime(workflow.decided_at)}
              </span>
            )}
          </div>

          <h2 className="mt-2 text-lg font-extrabold tracking-tight">
            We need more information from you
          </h2>

          {workflow.decision_note && (
            <div className="mt-3 flex items-start gap-2 rounded-lg border border-[var(--border)] bg-[var(--surface-2)] p-3">
              <MessageSquare className="mt-0.5 size-3.5 shrink-0 text-[var(--muted)]" />
              <p className="whitespace-pre-wrap text-sm text-[var(--fg)]">
                {workflow.decision_note}
              </p>
            </div>
          )}

          <div className="mt-4 flex flex-wrap gap-2">
            <Button asChild>
              <Link href={ROUTES.customer.apply}>
                <FilePlus2 className="size-3.5" />
                Upload a new document
              </Link>
            </Button>
            <Button asChild variant="outline">
              <Link href={ROUTES.kycStatus(workflow.tracking_id)}>
                View this application
                <ArrowRight className="size-3.5" />
              </Link>
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}

export function OutstandingBanners({
  workflows,
}: {
  workflows: WorkflowListItem[];
}) {
  if (workflows.length === 0) return null;

  return (
    <div className="space-y-4">
      {workflows.map((wf) => (
        <OutstandingBanner key={wf.id} workflow={wf} />
      ))}
    </div>
  );
}