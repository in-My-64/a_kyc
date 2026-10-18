// src/components/kyc/biometric-match-card.tsx
"use client";

import {
  AlertTriangle,
  CheckCircle2,
  ChevronDown,
  HelpCircle,
  ScanFace,
  XCircle,
} from "lucide-react";

import type { FaceMatchDecision, FaceMatchResult } from "@/lib/types";
import { cn } from "@/lib/utils";
import { StatusPill } from "@/components/ui/primitives";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/surfaces";

// ---------------------------------------------------------------------------
// Human-readable copy, split from the raw math
// ---------------------------------------------------------------------------

interface Verdict {
  label: string;
  headline: string;
  explanation: string;
  action: string;
  pill: "success" | "warning" | "danger";
  bar: string;
  ring: string;
  fg: string;
  bg: string;
  border: string;
  Icon: typeof CheckCircle2;
}

function verdictFor(result: FaceMatchResult): Verdict {
  const similarity = result.similarity ?? 0;
  const threshold = result.threshold ?? 0.45;
  const floor = threshold * 0.75;

  if (result.decision === "MATCH" || similarity >= threshold) {
    return {
      label: "Same person",
      headline: "Photos match",
      explanation:
        "The face in the selfie matches the photo on the ID document.",
      action: "No further biometric action needed.",
      pill: "success",
      bar: "bg-[var(--success)]",
      ring: "stroke-[var(--success)]",
      fg: "text-[var(--success)]",
      bg: "bg-[var(--success-soft)]",
      border: "border-[var(--success-border)]",
      Icon: CheckCircle2,
    };
  }

  if (similarity >= floor) {
    return {
      label: "Needs review",
      headline: "Possible match — needs your review",
      explanation:
        "The two faces are similar, but not similar enough to verify automatically. Inspect the crops below and decide.",
      action:
        "Compare the two photos yourself. Approve only if you're confident they're the same person.",
      pill: "warning",
      bar: "bg-[var(--warning)]",
      ring: "stroke-[var(--warning)]",
      fg: "text-[var(--warning)]",
      bg: "bg-[var(--warning-soft)]",
      border: "border-[var(--warning-border)]",
      Icon: AlertTriangle,
    };
  }

  return {
    label: "Different people",
    headline: "The selfie does not match the ID photo",
    explanation:
      "The face in the selfie is distinctly different from the photo on the ID document. This usually means the customer uploaded a photo of someone else, or the selfie was taken under conditions the model couldn't compare.",
    action:
      "Ask the customer to retake their selfie in good lighting, facing the camera. If it still doesn't match, treat this as a failed identity verification.",
    pill: "danger",
    bar: "bg-[var(--danger)]",
    ring: "stroke-[var(--danger)]",
    fg: "text-[var(--danger)]",
    bg: "bg-[var(--danger-soft)]",
    border: "border-[var(--danger-border)]",
    Icon: XCircle,
  };
}

// ---------------------------------------------------------------------------

export function BiometricMatchCard({ result }: { result: FaceMatchResult }) {
  const verdict = verdictFor(result);
  const Icon = verdict.Icon;

  const similarity = result.similarity ?? 0;
  const threshold = result.threshold ?? 0.45;
  const floor = threshold * 0.75;

  // Confidence bucket for the human reader
  const confidence =
    similarity >= threshold ? "high"
    : similarity >= floor ? "borderline"
    : "low";

  const confidencePct = Math.round(Math.max(0, similarity) * 100);
  const thresholdPct = Math.round(threshold * 100);

  return (
    <Card className={cn("overflow-hidden border-2", verdict.border)}>
      {/* Top accent bar in the verdict color */}
      <div className={cn("h-1 w-full", verdict.bar)} />

      <CardHeader className="flex-row items-center justify-between gap-2 space-y-0">
        <div className="flex items-center gap-2">
          <ScanFace className="size-4 text-[var(--muted)]" />
          <CardTitle>Biometric match</CardTitle>
        </div>
        <StatusPill tone={verdict.pill}>
          <Icon className="size-3" />
          {verdict.label}
        </StatusPill>
      </CardHeader>

      <CardContent className="space-y-5">
        {/* Human verdict banner — replaces the old "Biometric check failed" */}
        <div
          className={cn(
            "flex items-start gap-3 rounded-lg border p-4",
            verdict.border,
            verdict.bg,
          )}
        >
          <span
            className={cn(
              "grid size-9 shrink-0 place-items-center rounded-full bg-white",
              verdict.fg,
            )}
          >
            <Icon className="size-5" strokeWidth={2.5} />
          </span>
          <div className="min-w-0 flex-1">
            <p className={cn("font-extrabold", verdict.fg)}>{verdict.headline}</p>
            <p className="mt-1 text-sm text-[var(--fg)]">
              {verdict.explanation}
            </p>
            <p className={cn("mt-2 text-xs font-bold", verdict.fg)}>
              {verdict.action}
            </p>
          </div>
        </div>

        {/* Side-by-side crops */}
        <div className="grid grid-cols-2 gap-4">
          <CropCell label="ID photo" url={result.id_crop_url} />
          <CropCell label="Selfie" url={result.selfie_crop_url} />
        </div>

        {/* Match confidence */}
        <div>
          <div className="mb-2 flex items-center justify-between text-xs">
            <span className="font-bold text-[var(--muted)]">Match confidence</span>
            <span className="font-mono tabular-nums capitalize text-[var(--fg)]">
              {confidence}
            </span>
          </div>
          <div className="relative h-2 overflow-hidden rounded-full bg-[var(--surface-hi)]">
            <div
              className={cn("h-full rounded-full", verdict.bar)}
              style={{ width: `${confidencePct}%` }}
            />
            <div
              aria-hidden
              className="absolute top-0 h-full w-0.5 bg-[var(--fg)]"
              style={{ left: `${thresholdPct}%` }}
            />
          </div>
          <p className="mt-1 text-[11px] text-[var(--muted)]">
            {similarity < floor &&
              "Well below the acceptance threshold — most likely different people."}
            {similarity >= floor && similarity < threshold &&
              "Below the acceptance threshold — needs human review."}
            {similarity >= threshold &&
              "Above the acceptance threshold — confidently the same person."}
          </p>
        </div>

        {/* Liveness + model */}
        <dl className="grid gap-3 sm:grid-cols-3">
          <Cell
            label="Liveness"
            value={result.liveness_passed ? "Passed" : "Failed"}
            tone={result.liveness_passed ? "success" : "danger"}
            sub={
              result.liveness_score !== null
                ? result.liveness_score.toFixed(2)
                : undefined
            }
          />
          <Cell label="Model" value={result.model_name} />
          <Cell label="Version" value={result.model_version} mono />
        </dl>

        {/* Technical disclosure */}
        <details className="rounded-lg border border-[var(--border)] bg-[var(--surface-2)] px-4 py-3">
          <summary className="flex cursor-pointer items-center gap-2 text-[10px] font-extrabold uppercase tracking-[0.14em] text-[var(--muted-2)] hover:text-[var(--fg)]">
            <ChevronDown className="size-3" />
            Technical details
          </summary>
          <dl className="mt-3 space-y-1 font-mono text-[11px]">
            <div className="flex justify-between gap-3">
              <dt className="text-[var(--muted)]">Decision</dt>
              <dd>{result.decision}</dd>
            </div>
            <div className="flex justify-between gap-3">
              <dt className="text-[var(--muted)]">Cosine similarity</dt>
              <dd>{similarity.toFixed(4)}</dd>
            </div>
            <div className="flex justify-between gap-3">
              <dt className="text-[var(--muted)]">Acceptance threshold</dt>
              <dd>{threshold.toFixed(4)}</dd>
            </div>
            <div className="flex justify-between gap-3">
              <dt className="text-[var(--muted)]">Review floor</dt>
              <dd>{floor.toFixed(4)}</dd>
            </div>
            <div className="flex justify-between gap-3">
              <dt className="text-[var(--muted)]">FMR target</dt>
              <dd>{result.fmr_target}</dd>
            </div>
            {typeof result.details?.reason === "string" && (
              <div className="mt-2 border-t border-[var(--border)] pt-2">
                <dt className="text-[var(--muted)]">Backend reason</dt>
                <dd className="break-words">{String(result.details.reason)}</dd>
              </div>
            )}
          </dl>
        </details>
      </CardContent>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function CropCell({ label, url }: { label: string; url: string | null }) {
  return (
    <div>
      <p className="mb-1 text-[10px] font-extrabold uppercase tracking-[0.14em] text-[var(--muted-2)]">
        {label}
      </p>
      <div className="overflow-hidden rounded-lg border border-[var(--border)] bg-[var(--surface-2)]">
        {url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={url}
            alt={label}
            className="aspect-square w-full object-cover"
          />
        ) : (
          <div className="grid aspect-square w-full place-items-center text-[var(--muted)]">
            <HelpCircle className="size-8" strokeWidth={1.5} />
            <span className="mt-2 px-2 text-center text-[10px] font-bold">
              No face detected
            </span>
          </div>
        )}
      </div>
    </div>
  );
}

function Cell({
  label,
  value,
  tone = "neutral",
  sub,
  mono,
}: {
  label: string;
  value: string;
  tone?: "neutral" | "success" | "danger";
  sub?: string;
  mono?: boolean;
}) {
  return (
    <div className="rounded-lg border border-[var(--border)] px-3 py-2">
      <dt className="text-[10px] font-extrabold uppercase tracking-[0.14em] text-[var(--muted-2)]">
        {label}
      </dt>
      <dd
        className={cn(
          "mt-0.5 text-sm font-bold",
          mono && "font-mono text-xs",
          tone === "success" && "text-[var(--success)]",
          tone === "danger" && "text-[var(--danger)]",
        )}
      >
        {value}
        {sub && (
          <span className="ml-1 text-xs font-normal text-[var(--muted)]">
            {sub}
          </span>
        )}
      </dd>
    </div>
  );
}
