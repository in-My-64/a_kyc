// src/components/kyc/processing-modal.tsx
"use client";

import * as React from "react";
import {
  Check,
  ChevronDown,
  Loader2,
  Minimize2,
  ShieldCheck,
} from "lucide-react";

import { cn } from "@/lib/utils";
import type { WorkflowStatusResponse } from "@/lib/types";

// ---------------------------------------------------------------------------
// Pipeline definitions
//
// matchKeys reference the actual Celery task names and the workflow
// `current_step` values. They are integration identifiers, not labels
// — do not rename them to match UI copy.
//
// `providers` is informational: it names the third-party platforms
// the step is capable of calling. It does not reflect which providers
// were configured for a specific run. Officer view only.
// ---------------------------------------------------------------------------

export interface PipelineStep {
  key: string;
  matchKeys: string[];
  label: string;
  description: string;
  providers?: string[];
}

export const PIPELINE_STEPS: PipelineStep[] = [
  {
    key: "customer_registration",
    matchKeys: ["created"],
    label: "Customer Registration & Document Upload",
    description: "Application received with the required document.",
  },
  {
    key: "preprocess_document",
    matchKeys: ["preprocess_document"],
    label: "Image Preprocessing",
    description: "Cleaning, deskewing, and normalising the uploaded image.",
  },
  {
    key: "ocr_extraction",
    matchKeys: [
      "run_ocr_task",
      "create_parsed_document",
      "run_vlm_extraction",
    ],
    label: "Information Extraction",
    description:
      "Reading the required fields from the document image.",
  },
  {
    key: "rule_validation",
    matchKeys: ["compare_extractions"],
    label: "Rule Validation & Classification",
    description:
      "Validating extracted fields against format rules and classifying the document.",
  },
  {
    key: "face_match",
    matchKeys: ["run_face_match"],
    label: "Biometric Face Match",
    description:
      "Comparing the selfie with the photo on the uploaded document.",
  },
  {
    key: "evidence_scoring",
    matchKeys: ["compute_evidence_score"],
    label: "Weighted Evidence Scoring",
    description:
      "Scoring the completeness and quality of the extracted evidence.",
  },
  {
    key: "screening",
    matchKeys: ["run_sanctions_screening"],
    label: "Customer Assessment",
    description:
      "Checking against sanctions, politically exposed persons, and adverse media lists.",
    // Hardcoded list of the platforms this step can call. Update here
    // when a provider is added or removed from the aggregate client.
    providers: ["OpenSanctions", "Dilisense"],
  },
  {
    key: "risk_classification",
    matchKeys: ["classify_risk"],
    label: "Risk Classification",
    description: "Assigning the final risk tier for the application.",
  },
  {
    key: "audit_logging",
    matchKeys: ["log_audit_summary"],
    label: "Audit Logging",
    description: "Recording the outcome to the audit trail.",
  },
];

export const CUSTOMER_PIPELINE_STEPS: PipelineStep[] = [
  {
    key: "customer_registration",
    matchKeys: ["created"],
    label: "Receiving your application",
    description: "We've got your document and we're starting your review.",
  },
  {
    key: "preprocess_document",
    matchKeys: ["preprocess_document"],
    label: "Getting your document ready",
    description: "We're preparing everything so we can read it clearly.",
  },
  {
    key: "ocr_extraction",
    matchKeys: [
      "run_ocr_task",
      "create_parsed_document",
      "run_vlm_extraction",
    ],
    label: "Reading the details on your document",
    description: "We're carefully reading the information you submitted.",
  },
  {
    key: "rule_validation",
    matchKeys: ["compare_extractions"],
    label: "Checking your details",
    description: "We're making sure everything we've read is correct.",
  },
  {
    key: "face_match",
    matchKeys: ["run_face_match"],
    label: "Checking your selfie",
    description: "We're comparing your selfie with your document photo.",
  },
  {
    key: "evidence_scoring",
    matchKeys: ["compute_evidence_score"],
    label: "Verifying your document",
    description: "We're checking that your document meets our standards.",
  },
  {
    key: "screening",
    matchKeys: ["run_sanctions_screening"],
    label: "Completing your assessment",
    description:
      "We're completing the checks we're required to do before we decide.",
    // Deliberately no providers on the customer view.
  },
  {
    key: "risk_classification",
    matchKeys: ["classify_risk"],
    label: "Making a decision",
    description: "We're finalising the outcome of your application.",
  },
  {
    key: "audit_logging",
    matchKeys: ["log_audit_summary"],
    label: "Finishing up",
    description: "We're almost there — thank you for your patience.",
  },
];

// ---------------------------------------------------------------------------

export function stepIndex(
  currentStep: string | null | undefined,
  steps: PipelineStep[] = PIPELINE_STEPS,
): number {
  if (!currentStep) return 0;
  const clean = currentStep.replace(/^failed_/, "");
  if (clean === "done") return steps.length - 1;
  for (let i = 0; i < steps.length; i++) {
    if (steps[i].matchKeys.includes(clean)) return i;
  }
  return 0;
}

type StepState = "done" | "active" | "pending";

export interface ProcessingModalProps {
  open: boolean;
  workflow: WorkflowStatusResponse;
  onMinimize: () => void;
  variant?: "officer" | "customer";
}

export function ProcessingModal({
  open,
  workflow,
  onMinimize,
  variant = "officer",
}: ProcessingModalProps) {
  const [detailsOpen, setDetailsOpen] = React.useState(false);

  const steps =
    variant === "customer" ? CUSTOMER_PIPELINE_STEPS : PIPELINE_STEPS;

  const isComplete = workflow.status === "COMPLETED";
  const currentIndex = isComplete
    ? steps.length - 1
    : stepIndex(workflow.current_step, steps);
  const total = steps.length;
  const pct = Math.round(((currentIndex + 1) / total) * 100);
  const current = steps[currentIndex];

  const states: StepState[] = steps.map((_, i) => {
    if (isComplete) return "done";
    if (i < currentIndex) return "done";
    if (i === currentIndex) return "active";
    return "pending";
  });

  if (!open) return null;

  const isCustomerView = variant === "customer";
  const showProviders = !isCustomerView;

  return (
    <div
      className="fixed inset-0 z-[140] grid place-items-center p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="processing-title"
    >
      <div
        aria-hidden
        className="absolute inset-0 animate-in bg-black/70 backdrop-blur-lg fade-in duration-300"
      />

      <div className="relative w-full max-w-[540px] animate-in fade-in zoom-in-95 overflow-hidden rounded-2xl border border-[var(--border)] bg-white shadow-[0_32px_96px_-16px_rgba(15,23,42,0.5)] duration-300">
        <div
          aria-hidden
          className="pointer-events-none absolute inset-x-0 top-0 h-48"
          style={{
            background:
              "radial-gradient(600px 200px at 50% 0%, color-mix(in oklch, var(--primary) 12%, transparent), transparent 70%)",
          }}
        />
        <div className="relative h-1 w-full bg-gradient-to-r from-transparent via-[var(--primary)] to-transparent" />

        <button
          type="button"
          onClick={onMinimize}
          aria-label="Minimize"
          className="absolute right-4 top-5 z-10 grid size-8 place-items-center rounded-lg border border-transparent text-[var(--muted)] transition-colors hover:border-[var(--border)] hover:bg-[var(--surface-2)] hover:text-[var(--fg)]"
        >
          <Minimize2 className="size-4" />
        </button>

        {/* Header */}
        <div className="relative px-7 pb-5 pt-8 text-center">
          <span className="mx-auto grid size-14 place-items-center rounded-2xl bg-[var(--primary)] text-white shadow-[0_12px_32px_-8px_rgba(37,99,235,0.6)]">
            <ShieldCheck className="size-6" strokeWidth={2.5} />
          </span>
          <h2
            id="processing-title"
            className="mt-5 text-2xl font-extrabold tracking-tight"
          >
            {isCustomerView
              ? "We're reviewing your application"
              : "Workflow running"}
          </h2>
          <p className="mx-auto mt-2 max-w-sm text-sm leading-relaxed text-[var(--muted)]">
            {isCustomerView
              ? "This usually takes under a minute. You can safely leave this page — we'll keep working in the background and let you know when we're done."
              : "Steps update live as the pipeline advances. Minimize to keep working — the workflow continues in the background."}
          </p>
        </div>

        {/* Radial progress */}
        <div className="flex justify-center px-7 pb-2">
          <div className="relative">
            <svg className="size-32 -rotate-90" viewBox="0 0 128 128" aria-hidden>
              <circle
                cx="64" cy="64" r="56"
                fill="none"
                stroke="var(--surface-hi)"
                strokeWidth="8"
              />
              <circle
                cx="64" cy="64" r="56"
                fill="none"
                stroke="var(--primary)"
                strokeWidth="8"
                strokeLinecap="round"
                strokeDasharray={`${2 * Math.PI * 56}`}
                strokeDashoffset={`${2 * Math.PI * 56 * (1 - pct / 100)}`}
                className="transition-all duration-700 ease-out"
              />
            </svg>
            <div className="absolute inset-0 grid place-items-center">
              <div className="text-center">
                <p className="font-mono text-2xl font-extrabold tabular-nums">
                  {pct}%
                </p>
                <p className="mt-0.5 text-[10px] font-extrabold uppercase tracking-[0.14em] text-[var(--muted-2)]">
                  Step {currentIndex + 1} of {total}
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* Active step card */}
        <div className="px-7 pt-3">
          <div className="rounded-xl border border-[var(--primary-border)] bg-[var(--primary-soft)] p-4">
            <div className="flex items-start gap-3">
              <Loader2 className="mt-0.5 size-4 shrink-0 animate-spin text-[var(--primary)]" />
              <div className="min-w-0 flex-1">
                <p className="text-sm font-extrabold text-[var(--primary)]">
                  {current?.label ?? (isCustomerView ? "Starting" : "Preparing")}
                </p>
                <p className="mt-1 text-xs leading-relaxed text-[var(--primary)]">
                  {current?.description ?? ""}
                </p>
                {showProviders &&
                  current?.providers &&
                  current.providers.length > 0 && (
                    <p className="mt-2 text-[10px] font-extrabold uppercase tracking-[0.14em] text-[var(--primary)] opacity-80">
                      via {current.providers.join(" · ")}
                    </p>
                  )}
              </div>
            </div>
          </div>
        </div>

        {/* Expandable full step list */}
        <div className="px-7 pt-3 pb-7">
          <button
            type="button"
            onClick={() => setDetailsOpen((v) => !v)}
            className="flex w-full items-center justify-between rounded-lg px-1 py-2 text-xs font-extrabold uppercase tracking-[0.14em] text-[var(--muted-2)] transition-colors hover:text-[var(--fg)]"
          >
            <span>
              {isCustomerView
                ? `See all ${total} stages`
                : `See all ${total} steps`}
            </span>
            <ChevronDown
              className={cn(
                "size-4 transition-transform",
                detailsOpen && "rotate-180",
              )}
            />
          </button>

          {detailsOpen && (
            <ol className="mt-2 animate-in fade-in slide-in-from-top-1 space-y-0 duration-200">
              {steps.map((step, i) => {
                const state = states[i];
                const isLast = i === total - 1;
                return (
                  <li
                    key={step.key}
                    className="relative flex items-start gap-3 py-2"
                  >
                    {!isLast && (
                      <span
                        aria-hidden
                        className={cn(
                          "absolute left-[11px] top-8 w-px",
                          state === "done"
                            ? "bg-[var(--primary)]"
                            : "bg-[var(--border)]",
                        )}
                        style={{ height: "calc(100% - 4px)" }}
                      />
                    )}
                    <MiniStepIcon state={state} />
                    <div className="min-w-0 flex-1 pt-0.5">
                      <p
                        className={cn(
                          "text-xs font-bold",
                          state === "pending" && "text-[var(--muted)]",
                        )}
                      >
                        {step.label}
                      </p>
                      {showProviders &&
                        step.providers &&
                        step.providers.length > 0 && (
                          <p className="mt-0.5 text-[9px] font-extrabold uppercase tracking-[0.14em] text-[var(--muted-2)]">
                            via {step.providers.join(" · ")}
                          </p>
                        )}
                    </div>
                  </li>
                );
              })}
            </ol>
          )}
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------

function MiniStepIcon({ state }: { state: StepState }) {
  const base =
    "relative grid size-6 shrink-0 place-items-center rounded-full border-2 bg-white";

  if (state === "done") {
    return (
      <span className={cn(base, "border-[var(--primary)] bg-[var(--primary)]")}>
        <Check className="size-3 text-white" strokeWidth={3} />
      </span>
    );
  }
  if (state === "active") {
    return (
      <span className={cn(base, "border-[var(--primary)]")}>
        <Loader2 className="size-3 animate-spin text-[var(--primary)]" />
      </span>
    );
  }
  return (
    <span className={cn(base, "border-[var(--border)]")}>
      <span className="size-1.5 rounded-full bg-[var(--muted)]" />
    </span>
  );
}