// src/components/kyc/assessment-hero.tsx
"use client";

import {
  FileText,
  ShieldCheck,
  UserCheck,
  CheckCircle2,
  AlertTriangle,
  XCircle,
  type LucideIcon,
} from "lucide-react";

import { cn } from "@/lib/utils";
import type {
  CustomerAssessmentResult,
  FaceMatchResult,
} from "@/lib/types";

type Decision = CustomerAssessmentResult["decision"];

interface Contributor {
  key: string;
  icon: LucideIcon;
  label: string;
  score: number;
  weight: number;
  detail: string;
  veto: boolean;
}

const DECISION_META: Record<Decision, {
  label: string;
  Icon: LucideIcon;
  ring: string;
  fg: string;
  bg: string;
  border: string;
}> = {
  APPROVED: {
    label: "Approved",
    Icon: CheckCircle2,
    ring: "stroke-[var(--success)]",
    fg: "text-[var(--success)]",
    bg: "bg-[var(--success-soft)]",
    border: "border-[var(--success-border)]",
  },
  MANUAL_REVIEW: {
    label: "Manual review",
    Icon: AlertTriangle,
    ring: "stroke-[var(--warning)]",
    fg: "text-[var(--warning)]",
    bg: "bg-[var(--warning-soft)]",
    border: "border-[var(--warning-border)]",
  },
  REJECTED: {
    label: "Rejected",
    Icon: XCircle,
    ring: "stroke-[var(--danger)]",
    fg: "text-[var(--danger)]",
    bg: "bg-[var(--danger-soft)]",
    border: "border-[var(--danger-border)]",
  },
};

function TrustRing({ score, decision }: { score: number; decision: Decision }) {
  const meta = DECISION_META[decision];
  const pct = Math.max(0, Math.min(100, score));
  const circumference = 2 * Math.PI * 54;
  const offset = circumference - (pct / 100) * circumference;

  return (
    <div className="relative grid size-32 shrink-0 place-items-center">
      <svg className="absolute -rotate-90" viewBox="0 0 128 128" aria-hidden>
        <circle cx="64" cy="64" r="54" fill="none" stroke="var(--surface-hi)" strokeWidth="10" />
        <circle
          cx="64" cy="64" r="54"
          fill="none"
          strokeWidth="10"
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          className={cn(meta.ring, "transition-all duration-700")}
        />
      </svg>
      <div className="text-center">
        <p className={cn("font-mono text-3xl font-extrabold tabular-nums leading-none", meta.fg)}>
          {Math.round(score)}
        </p>
        <p className="mt-1 text-[10px] font-extrabold uppercase tracking-[0.14em] text-[var(--muted-2)]">
          Trust
        </p>
      </div>
    </div>
  );
}

function ContributorRow({ c }: { c: Contributor }) {
  const Icon = c.icon;
  const contribution = c.score * c.weight;
  const pct = Math.max(0, Math.min(100, c.score));
  const barTone = c.veto
    ? "bg-[var(--danger)]"
    : c.score >= 80
    ? "bg-[var(--success)]"
    : c.score >= 40
    ? "bg-[var(--warning)]"
    : "bg-[var(--danger)]";

  return (
    <div
      className={cn(
        "grid grid-cols-[auto_1fr_auto] items-center gap-3 rounded-lg border px-4 py-3",
        c.veto
          ? "border-[var(--danger-border)] bg-[var(--danger-soft)]/40"
          : "border-[var(--border)] bg-white",
      )}
    >
      <div className="flex items-center gap-2">
        <span
          className={cn(
            "grid size-7 shrink-0 place-items-center rounded-full",
            c.veto
              ? "bg-[var(--danger)] text-white"
              : "bg-[var(--surface-2)] text-[var(--muted)]",
          )}
        >
          <Icon className="size-3.5" />
        </span>
        <div className="min-w-0">
          <p className="text-xs font-bold leading-tight">{c.label}</p>
          <p className="text-[10px] text-[var(--muted)] leading-tight">{c.detail}</p>
        </div>
      </div>

      <div className="min-w-0">
        <div className="flex items-center justify-between text-[10px] font-mono tabular-nums">
          <span className="text-[var(--muted)]">
            {Math.round(c.score)}/100 × {Math.round(c.weight * 100)}%
          </span>
          <span className={cn("font-bold", c.veto ? "text-[var(--danger)]" : "text-[var(--fg)]")}>
            {contribution.toFixed(1)} pts
          </span>
        </div>
        <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-[var(--surface-hi)]">
          <div className={cn("h-full rounded-full transition-all", barTone)} style={{ width: `${pct}%` }} />
        </div>
      </div>

      <span
        className={cn(
          "shrink-0 rounded-full px-2 py-0.5 text-[10px] font-extrabold uppercase tracking-wider",
          c.veto
            ? "bg-[var(--danger)] text-white"
            : c.score >= 80
            ? "bg-[var(--success-soft)] text-[var(--success)]"
            : c.score >= 40
            ? "bg-[var(--warning-soft)] text-[var(--warning)]"
            : "bg-[var(--danger-soft)] text-[var(--danger)]",
        )}
      >
        {c.veto ? "Veto" : c.score >= 80 ? "OK" : c.score >= 40 ? "Weak" : "Fail"}
      </span>
    </div>
  );
}

function ReasonLine({ text }: { text: string }) {
  const lower = text.toLowerCase();
  const tone = lower.includes("veto") || lower.includes("reject") || lower.includes("match")
    ? "danger"
    : lower.includes("review") || lower.includes("borderline") || lower.includes("warn")
    ? "warning"
    : "info";

  const glyph = tone === "danger" ? "▼" : tone === "warning" ? "⚠" : "·";
  const color =
    tone === "danger" ? "text-[var(--danger)]"
    : tone === "warning" ? "text-[var(--warning)]"
    : "text-[var(--muted)]";

  return (
    <div className={cn("flex items-start gap-2 font-mono text-[11px] leading-relaxed", color)}>
      <span className="shrink-0">{glyph}</span>
      <span>{text}</span>
    </div>
  );
}

export function AssessmentHero({
  assessment,
  faceMatch,
  variant = "officer",
}: {
  assessment: CustomerAssessmentResult;
  faceMatch?: FaceMatchResult | null;
  variant?: "officer" | "customer";
}) {
  const meta = DECISION_META[assessment.decision];

  const threshold = faceMatch?.threshold ?? 0.45;
  const reviewFloor = threshold * 0.75;
  const similarity = assessment.biometric_similarity;

  const bioScore = similarity !== null ? Math.max(0, similarity) * 100 : 0;
  const sanctionsScore =
    assessment.sanctions_status === "CLEAR" ? 100
    : assessment.sanctions_status === "FLAGGED" ? 50
    : 0;

  const biometricVeto =
    similarity !== null && similarity < reviewFloor;
  const sanctionsVeto = assessment.sanctions_status === "MATCH";

  const contributors: Contributor[] = [
    {
      key: "extraction",
      icon: FileText,
      label: "Document extraction",
      score: assessment.extraction_score,
      weight: 0.20,
      detail:
        assessment.extraction_score >= 80
          ? "All key fields extracted cleanly"
          : assessment.extraction_score >= 50
          ? "Some fields missing or unclear"
          : "Most fields missing — poor image quality",
      veto: false,
    },
    {
      key: "biometric",
      icon: UserCheck,
      label: "Biometric match",
      score: bioScore,
      weight: 0.40,
      detail:
        similarity === null
          ? "No face detected in one of the photos"
          : similarity < reviewFloor
          ? "The selfie and ID photo are different people"
          : similarity < threshold
          ? "Similar, but not similar enough to auto-verify"
          : "Selfie matches the ID photo",
      veto: biometricVeto,
    },
    {
      key: "sanctions",
      icon: ShieldCheck,
      label: "Sanctions screening",
      score: sanctionsScore,
      weight: 0.40,
      detail:
        assessment.sanctions_status === "CLEAR"
          ? "No matches on any list"
          : assessment.sanctions_status === "FLAGGED"
          ? "Possible match — needs manual verification"
          : "Sanctions list match — hard rejection",
      veto: sanctionsVeto,
    },
  ];

  if (variant === "customer") {
    return (
      <div className={cn("overflow-hidden rounded-2xl border-2 bg-white", meta.border)}>
        <div className={cn("h-1 w-full", meta.fg.replace("text-", "bg-"))} />
        <div className="p-6">
          <div className="flex items-center gap-4">
            <TrustRing score={assessment.trust_score} decision={assessment.decision} />
            <div className="min-w-0">
              <span className={cn("inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[10px] font-extrabold uppercase tracking-wider", meta.bg, meta.fg)}>
                <meta.Icon className="size-3" />
                {meta.label}
              </span>
              <h2 className="mt-2 text-lg font-extrabold tracking-tight">
                {assessment.decision === "APPROVED" && "Your identity has been verified"}
                {assessment.decision === "MANUAL_REVIEW" && "A team member is reviewing your application"}
                {assessment.decision === "REJECTED" && "We couldn't verify your identity"}
              </h2>
              <p className="mt-1 text-sm text-[var(--muted)]">
                {assessment.decision === "APPROVED" && "All checks passed. No further action needed."}
                {assessment.decision === "MANUAL_REVIEW" && "We'll be in touch if we need anything else."}
                {assessment.decision === "REJECTED" && "You can retry with clearer documents, or contact support."}
              </p>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className={cn("overflow-hidden rounded-2xl border-2 bg-white", meta.border)}>
        <div className={cn("h-1 w-full", meta.fg.replace("text-", "bg-"))} />
        <div className="flex items-center gap-6 p-6">
          <TrustRing score={assessment.trust_score} decision={assessment.decision} />
          <div className="min-w-0 flex-1">
            <p className="text-[10px] font-extrabold uppercase tracking-[0.18em] text-[var(--muted-2)]">
              Algorithm recommendation
            </p>
            <p className={cn("mt-1 text-2xl font-extrabold tracking-tight", meta.fg)}>
              {meta.label}
            </p>
            <p className="mt-1 text-sm text-[var(--muted)]">
              {assessment.decision === "APPROVED" && "All signals passed. Safe to auto-approve."}
              {assessment.decision === "MANUAL_REVIEW" && "One or more signals need an officer decision."}
              {assessment.decision === "REJECTED" && "A hard veto fired — do not override without biometric evidence."}
            </p>
          </div>
        </div>

        <div className="space-y-2 border-t border-[var(--border)] bg-[var(--surface-2)]/40 px-6 py-4">
          {contributors.map((c) => (
            <ContributorRow key={c.key} c={c} />
          ))}
        </div>

        <div className="border-t border-[var(--border)] px-6 py-4">
          <p className="mb-2 text-[10px] font-extrabold uppercase tracking-[0.14em] text-[var(--muted-2)]">
            Why this decision
          </p>
          <div className="space-y-1">
            {assessment.decision === "REJECTED" && (
              <ReasonLine text="A hard veto fired — one or more signals failed." />
            )}
            {assessment.decision === "MANUAL_REVIEW" && (
              <ReasonLine text="Some signals need an officer to inspect them before we can decide." />
            )}
            {assessment.decision === "APPROVED" && (
              <ReasonLine text="Every signal passed cleanly. Safe to auto-approve." />
            )}
            {similarity !== null && similarity < reviewFloor && (
              <ReasonLine text={`The selfie does not resemble the ID photo — likely a different person.`} />
            )}
            {similarity !== null && similarity >= reviewFloor && similarity < threshold && (
              <ReasonLine text="The two faces are similar but not close enough to verify automatically." />
            )}
            {assessment.sanctions_status === "MATCH" && (
              <ReasonLine text="The customer is on a sanctions list — must be rejected." />
            )}
            {assessment.sanctions_status === "FLAGGED" && (
              <ReasonLine text="One or more sanctions-list hits need manual verification." />
            )}
            {assessment.extraction_score < 50 && (
              <ReasonLine text="The ID document was too unclear to extract reliable data." />
            )}
          </div>

          <details className="mt-3">
            <summary className="cursor-pointer text-[10px] font-extrabold uppercase tracking-[0.14em] text-[var(--muted-2)] hover:text-[var(--fg)]">
              Show technical audit trail
            </summary>
            <div className="mt-2 space-y-1 rounded-lg border border-[var(--border)] bg-[var(--surface-2)] p-3">
              {assessment.reasons.map((r, i) => (
                <div key={i} className="font-mono text-[10px] leading-relaxed text-[var(--muted)]">
                  · {r}
                </div>
              ))}
            </div>
          </details>
        </div>
      </div>
    </div>
  );
}
