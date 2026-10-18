// src/components/kyc/officer-review.tsx
"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import {
  AlertTriangle,
  Check,
  CheckCircle2,
  ExternalLink,
  FileText,
  Loader2,
  PlayCircle,
  ScanFace,
  Send,
  ShieldAlert,
  User,
  UserCheck,
  XCircle,
  type LucideIcon,
} from "lucide-react";

import { ROUTES } from "@/lib/constants";
import {
  useDecideWorkflow,
  useDocument,
  useWorkflowStatus,
} from "@/lib/hooks";
import { friendlyFailure } from "@/lib/friendly-errors";
import { cn, formatDateTime } from "@/lib/utils";
import type {
  EvidenceScoreDetail,
  ExtractionDetail,
  OpenSanctionsMatch,
  PerProviderSummary,
  RiskClassificationDetail,
  ScreeningEvidence,
  WorkflowStatusResponse,
} from "@/lib/types";
import {
  Button,
  CheckStatusPill,
  StatusPill,
  WorkflowStatusPill,
} from "@/components/ui/primitives";
import {
  Alert,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  EmptyState,
  Skeleton,
} from "@/components/ui/surfaces";
import { Textarea } from "@/components/ui/form";
import { useToast } from "@/components/ui/toast";
import { EvidenceTable } from "@/components/kyc/evidence-table";
import { BiometricMatchCard } from "@/components/kyc/biometric-match-card";
import { AssessmentHero } from "@/components/kyc/assessment-hero";
import {
  PIPELINE_STEPS,
  ProcessingModal,
  stepIndex,
} from "@/components/kyc/processing-modal";

// ---------------------------------------------------------------------------
// Provider metadata
// ---------------------------------------------------------------------------

const PROVIDER_META: Record<string, { label: string; coverage: string }> = {
  opensanctions: {
    label: "OpenSanctions",
    coverage: "Sanctions · PEPs · RCAs",
  },
  dilisense: {
    label: "Dilisense",
    coverage: "Sanctions · PEPs · Adverse media",
  },
};

function providerLabel(key: string): string {
  return (
    PROVIDER_META[key]?.label ??
    key.charAt(0).toUpperCase() + key.slice(1)
  );
}

function providerCoverage(key: string): string | null {
  return PROVIDER_META[key]?.coverage ?? null;
}

function statusTone(status: string) {
  if (status === "MATCH") return "danger" as const;
  if (status === "FLAGGED") return "warning" as const;
  return "success" as const;
}

function matchesForProvider(
  evidence: ScreeningEvidence,
  providerKey: string,
): OpenSanctionsMatch[] {
  return (evidence.matches || []).filter((m) => {
    const tagged = (m.raw as Record<string, unknown> | undefined)?._provider;
    return tagged === providerKey;
  });
}

// ---------------------------------------------------------------------------
// Topic bucketing for category rows
// ---------------------------------------------------------------------------

const SANCTIONS_TOPICS = new Set(["sanction", "sanction.linked"]);
const PEP_TOPICS = new Set(["role.pep", "role.rca"]);
const ADVERSE_TOPICS = new Set(["adverse_media"]);

interface TopicBucket {
  key: string;
  label: string;
  matches: OpenSanctionsMatch[];
}

function bucketMatches(matches: OpenSanctionsMatch[]): TopicBucket[] {
  const buckets: TopicBucket[] = [
    { key: "sanctions", label: "Sanctions Lists", matches: [] },
    { key: "pep", label: "PEP Lists", matches: [] },
    { key: "adverse", label: "Adverse Media", matches: [] },
    { key: "other", label: "Other", matches: [] },
  ];

  for (const m of matches) {
    const topics = new Set(m.topics ?? []);
    let placed = false;
    if ([...topics].some((t) => SANCTIONS_TOPICS.has(t))) {
      buckets[0].matches.push(m);
      placed = true;
    }
    if ([...topics].some((t) => PEP_TOPICS.has(t))) {
      buckets[1].matches.push(m);
      placed = true;
    }
    if ([...topics].some((t) => ADVERSE_TOPICS.has(t))) {
      buckets[2].matches.push(m);
      placed = true;
    }
    if (!placed) buckets[3].matches.push(m);
  }

  return buckets.filter((b) => b.matches.length > 0 || b.key !== "other");
}

// ---------------------------------------------------------------------------
// Tabs
// ---------------------------------------------------------------------------

type TabId =
  | "overview"
  | "documents"
  | "identity"
  | "screening"
  | "biometrics"
  | "risk"
  | "decision";

const TABS: { id: TabId; label: string; icon: LucideIcon }[] = [
  { id: "overview",  label: "Overview",  icon: CheckCircle2 },
  { id: "documents", label: "Document",  icon: FileText },
  { id: "identity",  label: "Identity",  icon: User },
  { id: "screening", label: "Customer Assessment", icon: ScanFace },
  { id: "biometrics", label: "Biometrics", icon: UserCheck },
  { id: "risk",      label: "Risk",      icon: ShieldAlert },
  { id: "decision",  label: "Decision",  icon: Send },
];

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

export function OfficerReview({
  trackingId,
  initialWorkflow,
}: {
  trackingId: string;
  initialWorkflow?: WorkflowStatusResponse;
}) {
  const [tab, setTab] = useState<TabId>("overview");

  const query = useWorkflowStatus(trackingId, {
    refetchInterval: (query) => {
      const data = query.state.data;
      if (!data) return 3000;
      if (data.status === "COMPLETED" || data.status === "FAILED") return false;
      return 3000;
    },
    initialData: initialWorkflow,
  });

  const workflow = query.data ?? initialWorkflow;

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

  if (!workflow) return <ReviewSkeleton />;

  const isRunning =
    workflow.status === "PENDING" || workflow.status === "IN_PROGRESS";

  return (
    <>
      <div className="space-y-6">
        {isRunning && (
          <>
            <LiveProgress workflow={workflow} />
            <div className="flex justify-center">
              <Button variant="outline" size="sm" onClick={reopen}>
                <PlayCircle className="size-3.5" />
                Show live progress
              </Button>
            </div>
          </>
        )}

        <div className="flex gap-1 overflow-x-auto border-b border-[var(--border)]">
          {TABS.map(({ id, label, icon: Icon }) => {
            const active = tab === id;
            const showsBadge =
              id === "decision" && workflow.decision.value !== "PENDING";
            return (
              <button
                key={id}
                type="button"
                onClick={() => setTab(id)}
                className={cn(
                  "relative flex shrink-0 items-center gap-2 border-b-2 px-4 py-3 text-sm font-medium transition-colors",
                  active
                    ? "border-[var(--primary)] text-[var(--primary)]"
                    : "border-transparent text-[var(--muted)] hover:text-[var(--fg)]",
                )}
              >
                <Icon className="size-3.5" />
                {label}
                {showsBadge && (
                  <span className="size-1.5 rounded-full bg-[var(--primary)]" />
                )}
              </button>
            );
          })}
        </div>

        {tab === "overview" && <OverviewTab workflow={workflow} />}
        {tab === "documents" && <DocumentTab workflow={workflow} />}
        {tab === "identity" && <IdentityTab workflow={workflow} />}
        {tab === "screening" && <ScreeningTab workflow={workflow} />}
        {tab === "biometrics" && <BiometricsTab workflow={workflow} />}
        {tab === "risk" && <RiskTab workflow={workflow} />}
        {tab === "decision" && (
          <DecisionTab workflow={workflow} trackingId={trackingId} />
        )}
      </div>

      <ProcessingModal
        open={modalOpen}
        workflow={workflow}
        onMinimize={minimize}
      />
    </>
  );
}

// ---------------------------------------------------------------------------
// Live progress
// ---------------------------------------------------------------------------

function LiveProgress({ workflow }: { workflow: WorkflowStatusResponse }) {
  const currentIndex = stepIndex(workflow.current_step);
  const total = PIPELINE_STEPS.length;
  const pct = Math.round(((currentIndex + 1) / total) * 100);
  const current = PIPELINE_STEPS[currentIndex];

  return (
    <Card className="overflow-hidden">
      <div className="relative">
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0"
          style={{
            background:
              "radial-gradient(60% 100% at 0% 0%, color-mix(in oklch, var(--primary) 8%, transparent), transparent 60%)",
          }}
        />
        <CardContent className="relative p-6">
          <div className="flex items-start gap-5">
            <span className="grid size-12 shrink-0 place-items-center rounded-xl border-2 border-[var(--primary-border)] bg-[var(--primary-soft)]">
              <Loader2 className="size-5 animate-spin text-[var(--primary)]" />
            </span>

            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h2 className="text-base font-extrabold tracking-tight">
                  Workflow running
                </h2>
                <span className="font-mono text-xs font-bold tabular-nums text-[var(--muted)]">
                  Step {currentIndex + 1} of {total} · {pct}%
                </span>
              </div>

              <p className="mt-1 flex flex-wrap items-center gap-2 text-sm text-[var(--muted)]">
                <span>{current?.label ?? "Processing"}</span>
                {current?.providers?.length
                  ? current.providers.map((p) => (
                      <span
                        key={p}
                        className="rounded-full border border-[var(--primary-border)] bg-white px-2 py-0.5 text-[10px] font-extrabold uppercase tracking-wider text-[var(--primary)]"
                      >
                        {p}
                      </span>
                    ))
                  : null}
              </p>

              <div className="mt-4 h-1.5 w-full overflow-hidden rounded-full bg-[var(--surface-hi)]">
                <div
                  className="h-full rounded-full bg-[var(--primary)] transition-all duration-700 ease-out"
                  style={{ width: `${pct}%` }}
                />
              </div>
            </div>
          </div>
        </CardContent>
      </div>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Overview
// ---------------------------------------------------------------------------

function OverviewTab({ workflow }: { workflow: WorkflowStatusResponse }) {
  const hasIssues = workflow.verification_issues.length > 0;
  const isFailed = workflow.status === "FAILED";
  const failure = isFailed
    ? friendlyFailure(workflow.current_step, workflow.last_error)
    : null;

  return (
    <div className="space-y-6">
      {hasIssues && (
        <Alert tone="warning" title="Verification issues">
          <ul className="mt-1 list-disc space-y-1 pl-5 font-mono text-xs">
            {workflow.verification_issues.map((issue, i) => (
              <li key={i}>{issue}</li>
            ))}
          </ul>
        </Alert>
      )}

      {failure && (
        <Alert tone="danger" title={failure.title}>
          <p className="text-sm">{failure.message}</p>
          <p className="mt-1 text-xs font-bold">{failure.action}</p>

          {workflow.last_error && (
            <details className="mt-3">
              <summary className="cursor-pointer text-[10px] font-extrabold uppercase tracking-[0.14em] opacity-70 hover:opacity-100">
                Technical details
              </summary>
              <pre className="mt-2 max-h-40 overflow-auto whitespace-pre-wrap break-words rounded-md border border-[var(--danger-border)] bg-white/60 p-2 font-mono text-[10px] leading-relaxed">
                {workflow.last_error}
              </pre>
              <p className="mt-1 text-[10px] opacity-70">
                Failed at step:{" "}
                <span className="font-mono">
                  {(workflow.current_step ?? "").replace(/^failed_/, "")}
                </span>
              </p>
            </details>
          )}
        </Alert>
      )}

      {workflow.customer_assessment ? (
        <AssessmentHero
          assessment={workflow.customer_assessment}
          faceMatch={workflow.face_match}
        />
      ) : (
        <div className="grid gap-4 grid-cols-2 lg:grid-cols-4">
          <SummaryTile label="Status" value={<WorkflowStatusPill status={workflow.status} />} />
          <SummaryTile
            label="Identity"
            value={workflow.identity ? <StatusPill tone="success">Extracted</StatusPill> : <span className="text-sm text-[var(--muted)]">Pending</span>}
          />
          <SummaryTile
            label="Screening"
            value={workflow.screening_report ? <StatusPill tone={workflow.screening_report.status === "CLEAR" ? "success" : workflow.screening_report.status === "FLAGGED" ? "warning" : "danger"}>{workflow.screening_report.status}</StatusPill> : <span className="text-sm text-[var(--muted)]">Pending</span>}
          />
          <SummaryTile
            label="Selfie"
            value={workflow.face_match ? <StatusPill tone={workflow.face_match.decision === "MATCH" ? "success" : workflow.face_match.decision === "REVIEW" ? "warning" : "danger"}>{workflow.face_match.decision}</StatusPill> : <span className="text-sm text-[var(--muted)]">Pending</span>}
          />
        </div>
      )}

      <TaskIdsPanel taskIds={workflow.task_ids} />
    </div>
  );
}

function isRunning(wf: WorkflowStatusResponse): boolean {
  return wf.status === "PENDING" || wf.status === "IN_PROGRESS";
}

function TaskIdsPanel({
  taskIds,
}: {
  taskIds: WorkflowStatusResponse["task_ids"];
}) {
  const rows = Object.entries(taskIds).filter(([, v]) => v);
  if (rows.length === 0) return null;

  return (
    <details className="rounded-xl border border-[var(--border)] bg-white p-4 shadow-[var(--shadow-xs)]">
      <summary className="cursor-pointer text-[10px] font-extrabold uppercase tracking-[0.14em] text-[var(--muted-2)] hover:text-[var(--muted)]">
        Celery task IDs ({rows.length})
      </summary>
      <dl className="mt-3 space-y-1 font-mono text-[11px]">
        {rows.map(([name, id]) => (
          <div key={name} className="flex items-baseline gap-3">
            <dt className="w-32 shrink-0 text-[var(--muted-2)]">{name}</dt>
            <dd className="min-w-0 flex-1 break-all text-[var(--fg)]">{id}</dd>
          </div>
        ))}
      </dl>
    </details>
  );
}

// ---------------------------------------------------------------------------
// Document tab
// ---------------------------------------------------------------------------

function DocumentTab({ workflow }: { workflow: WorkflowStatusResponse }) {
  if (workflow.document_id === null) {
    return (
      <EmptyState
        icon={FileText}
        title="No document attached"
        description="This workflow has no document linked."
      />
    );
  }
  return (
    <div className="space-y-6">
      <DocumentView documentId={workflow.document_id} />
      {workflow.extraction_detail && (
        <DocumentReadingCard detail={workflow.extraction_detail} />
      )}
    </div>
  );
}

function DocumentView({ documentId }: { documentId: number }) {
  const { data: doc, isLoading, isError, error } = useDocument(documentId);

  if (isLoading) return <Skeleton className="h-96 w-full" />;
  if (isError || !doc) {
    return (
      <Alert tone="danger" title="Couldn't load document">
        {error instanceof Error ? error.message : "Unknown error."}
      </Alert>
    );
  }

  const fileName = doc.file.split("/").pop() ?? `#${doc.id}`;
  const previewUrl = `/api/proxy/documents/${doc.id}/preview`;

  return (
    <div className="grid gap-6 lg:grid-cols-3">
      <div className="lg:col-span-2">
        <Card>
          <CardHeader className="flex-row items-center justify-between gap-2 space-y-0">
            <CardTitle>Document preview</CardTitle>
            <Button asChild variant="ghost" size="sm">
              <a href={previewUrl} target="_blank" rel="noopener noreferrer">
                <ExternalLink className="size-3.5" />
                Open in new tab
              </a>
            </Button>
          </CardHeader>
          <CardContent>
            <div className="overflow-hidden rounded-lg border border-[var(--border)] bg-[var(--surface-2)]">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={previewUrl}
                alt={fileName}
                className="mx-auto block max-h-[640px] w-auto object-contain"
              />
            </div>
          </CardContent>
        </Card>
      </div>
      <Card>
        <CardHeader>
          <CardTitle>Metadata</CardTitle>
        </CardHeader>
        <CardContent>
          <dl className="grid gap-3">
            <Field label="Document ID" value={`#${doc.id}`} mono />
            <Field label="Filename" value={fileName} />
            <Field label="Type" value={doc.doc_type} />
            <Field label="Uploaded" value={formatDateTime(doc.uploaded_at)} />
          </dl>
        </CardContent>
      </Card>
    </div>
  );
}

const FIELD_LABELS: Record<string, string> = {
  id_number: "ID number",
  first_name: "First name",
  surname: "Surname",
  dob: "Date of birth",
  village_of_origin: "Village of origin",
  place_of_birth: "Place of birth",
  date_of_issue: "Date of issue",
};

function DocumentReadingCard({ detail }: { detail: ExtractionDetail }) {
  const fields = Object.entries(detail.fields).filter(
    ([, v]) => v !== null && v !== "",
  );
  if (fields.length === 0) return null;

  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between gap-2 space-y-0">
        <CardTitle>Document reading</CardTitle>
        {detail.applied_at && (
          <span className="text-xs text-[var(--muted)]">
            Applied {formatDateTime(detail.applied_at)}
          </span>
        )}
      </CardHeader>
      <CardContent>
        <dl className="divide-y divide-[var(--border)] rounded-lg border border-[var(--border)] text-xs">
          {fields.map(([key, value]) => (
            <div
              key={key}
              className="grid grid-cols-[160px_1fr] items-baseline gap-3 px-3 py-2"
            >
              <dt className="text-[var(--muted-2)]">
                {FIELD_LABELS[key] ?? key}
              </dt>
              <dd className="break-words font-mono">{value}</dd>
            </div>
          ))}
        </dl>
      </CardContent>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Identity
// ---------------------------------------------------------------------------

function IdentityTab({ workflow }: { workflow: WorkflowStatusResponse }) {
  const identity = workflow.identity;
  if (!identity) {
    return (
      <EmptyState
        icon={User}
        title="Identity verification not run"
        description="The pipeline hasn't produced identity results for this workflow yet."
      />
    );
  }

  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between gap-2 space-y-0">
        <CardTitle>Identity verification</CardTitle>
        <StatusPill tone="success">Extracted</StatusPill>
      </CardHeader>
      <CardContent>
        <ul className="divide-y divide-[var(--border)] rounded-lg border border-[var(--border)]">
          <li className="flex items-center justify-between gap-3 px-4 py-3">
            <span className="text-sm text-[var(--muted)]">Document Type</span>
            <span className="font-mono text-xs uppercase">{identity.doc_type || "—"}</span>
          </li>
          <li className="flex items-center justify-between gap-3 px-4 py-3">
            <span className="text-sm text-[var(--muted)]">ID Number</span>
            <span className="font-mono text-xs font-bold">{identity.id_number || "—"}</span>
          </li>
          <li className="flex items-center justify-between gap-3 px-4 py-3">
            <span className="text-sm text-[var(--muted)]">Full Name</span>
            <span className="font-mono text-xs">{identity.name || "—"}</span>
          </li>
          <li className="flex items-center justify-between gap-3 px-4 py-3">
            <span className="text-sm text-[var(--muted)]">Date of Birth</span>
            <span className="font-mono text-xs">{identity.dob || "—"}</span>
          </li>
          <li className="flex items-center justify-between gap-3 px-4 py-3">
            <span className="text-sm text-[var(--muted)]">Nationality</span>
            <span className="font-mono text-xs">{identity.nationality || "—"}</span>
          </li>
        </ul>
      </CardContent>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Biometrics
// ---------------------------------------------------------------------------

function BiometricsTab({ workflow }: { workflow: WorkflowStatusResponse }) {
  if (!workflow.face_match) {
    return (
      <EmptyState
        icon={UserCheck}
        title="Biometric match not run"
        description="The pipeline hasn't produced a face-match result for this workflow yet."
      />
    );
  }
  return (
    <div className="space-y-6">
      <BiometricMatchCard result={workflow.face_match} />
      <Card>
        <CardHeader>
          <CardTitle>About this comparison</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-sm text-[var(--muted)]">
          <p>
            The similarity score is a cosine distance between face
            embeddings produced by the model named above. The decision
            threshold is calibrated to a target false-match rate (FMR) on
            our validation set.
          </p>
          <p>
            Scores are advisory. A <strong>Review</strong> decision means
            the score fell below the match threshold but above the floor
            — an officer should inspect the crops above before deciding.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Screening
// ---------------------------------------------------------------------------

function ScreeningTab({ workflow }: { workflow: WorkflowStatusResponse }) {
  const report = workflow.screening_report;
  if (!report) {
    return (
      <EmptyState
        icon={ScanFace}
        title="No customer assessment"
        description="The pipeline hasn't produced a customer assessment yet."
      />
    );
  }
  return (
    <div className="space-y-6">
      <Card>
        <CardHeader className="flex-row items-center justify-between gap-2 space-y-0">
          <CardTitle>Customer assessment</CardTitle>
          <StatusPill tone={statusTone(report.status)}>{report.status}</StatusPill>
        </CardHeader>
        <CardContent>
          <dl className="grid gap-3 sm:grid-cols-2">
            <Field label="Report ID" value={`#${report.id}`} mono />
            <Field label="Generated" value={formatDateTime(report.created_at)} />
          </dl>
        </CardContent>
      </Card>

      {report ? (
        <ScreeningBreakdown evidence={report as any} />
      ) : (
        <Card>
          <CardContent className="p-6 text-sm text-[var(--muted)]">
            No assessment evidence recorded on this report.
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function ScreeningBreakdown({ evidence }: { evidence: ScreeningEvidence }) {
  const perProvider: Record<string, PerProviderSummary> =
    evidence.per_provider ?? {};
  const providerKeys = Object.keys(perProvider);

  const derivedKeys = Array.from(
    new Set(
      (evidence.matches || [])
        .map((m) => (m.raw as Record<string, unknown> | undefined)?._provider)
        .filter((v): v is string => typeof v === "string"),
    ),
  );
  const keys = providerKeys.length > 0 ? providerKeys : derivedKeys;

  const noProviders = keys.length === 0;

  return (
    <>
      {noProviders ? (
        <Card>
          <CardContent className="p-6 text-sm text-[var(--muted)]">
            No assessment providers were configured for this report.
          </CardContent>
        </Card>
      ) : (
        keys.map((key) => (
          <ProviderResultCard
            key={key}
            providerKey={key}
            summary={perProvider[key]}
            matches={matchesForProvider(evidence, key)}
          />
        ))
      )}

      <CombinedResultCard
        evidence={evidence}
        totalHits={evidence.match_count ?? 0}
        providerKeys={keys}
      />
    </>
  );
}

function ProviderResultCard({
  providerKey,
  summary,
  matches,
}: {
  providerKey: string;
  summary: PerProviderSummary | undefined;
  matches: OpenSanctionsMatch[];
}) {
  const label = providerLabel(providerKey);
  const coverage = providerCoverage(providerKey);
  const status = summary?.status ?? (matches.length > 0 ? "FLAGGED" : "CLEAR");
  const error = summary?.error ?? null;
  const query = summary?.parsed_query ?? null;
  const rawResponse = summary?.raw_response ?? null;

  const buckets = bucketMatches(matches);
  const hasAnyMatches = matches.length > 0;

  return (
    <Card>
      <CardHeader className="flex-row items-start justify-between gap-3 space-y-0">
        <div className="min-w-0">
          <CardTitle>{label}</CardTitle>
          {coverage && (
            <p className="mt-1 text-[11px] text-[var(--muted)]">{coverage}</p>
          )}
        </div>
        <div className="flex items-center gap-2">
          <StatusPill tone={statusTone(status)} size="sm">
            {status}
          </StatusPill>
          <span className="font-mono text-xs tabular-nums text-[var(--muted)]">
            {matches.length} hit{matches.length === 1 ? "" : "s"}
          </span>
        </div>
      </CardHeader>

      <CardContent className="space-y-4">
        {error && (
          <p className="rounded-lg border border-[var(--warning-border)] bg-[var(--warning-soft)] p-3 text-xs text-[var(--warning)]">
            Provider error: {error}
          </p>
        )}

        <ul className="divide-y divide-[var(--border)] overflow-hidden rounded-lg border border-[var(--border)]">
          {buckets.map((b) => {
            const count = b.matches.length;
            return (
              <li
                key={b.key}
                className="flex items-center justify-between gap-3 px-4 py-2.5 text-xs"
              >
                <span className="font-bold">{b.label}</span>
                <span className="flex items-center gap-3">
                  <span className="font-mono tabular-nums text-[var(--muted)]">
                    {count} hit{count === 1 ? "" : "s"}
                  </span>
                  <StatusPill
                    tone={count === 0 ? "success" : "warning"}
                    size="sm"
                  >
                    {count === 0 ? "CLEAR" : "REVIEW"}
                  </StatusPill>
                </span>
              </li>
            );
          })}
        </ul>

        {hasAnyMatches &&
          matches.map((match, i) => (
            <ScreeningMatchRow
              key={`${providerKey}-${match.entity_id}-${i}`}
              match={match}
            />
          ))}

        {!hasAnyMatches && !error && (
          <p className="text-sm text-[var(--muted)]">
            No entities matched on {label}.
          </p>
        )}

        {query && (
          <section>
            <h4 className="text-[10px] font-extrabold uppercase tracking-[0.14em] text-[var(--muted-2)]">
              Query sent to {label}
            </h4>
            <pre className="mt-2 max-h-[280px] overflow-auto rounded-lg border border-[var(--border)] bg-[var(--surface-2)] p-3 font-mono text-[10px] leading-relaxed text-[var(--muted)]">
              {JSON.stringify(query, null, 2)}
            </pre>
          </section>
        )}

        {rawResponse && (
          <section>
            <h4 className="text-[10px] font-extrabold uppercase tracking-[0.14em] text-[var(--muted-2)]">
              Response from {label}
            </h4>
            <pre className="mt-2 max-h-[280px] overflow-auto rounded-lg border border-[var(--border)] bg-[var(--surface-2)] p-3 font-mono text-[10px] leading-relaxed text-[var(--muted)]">
              {JSON.stringify(rawResponse, null, 2)}
            </pre>
          </section>
        )}
      </CardContent>
    </Card>
  );
}

function CombinedResultCard({
  evidence,
  totalHits,
  providerKeys,
}: {
  evidence: ScreeningEvidence;
  totalHits: number;
  providerKeys: string[];
}) {
  const noMatches = totalHits === 0;
  const sourcesLabel =
    providerKeys.length > 0
      ? providerKeys.map(providerLabel).join(" + ")
      : null;

  return (
    <Card className="border-2 border-[var(--border-hi)]">
      <CardHeader className="flex-row items-center justify-between gap-3 space-y-0">
        <div className="min-w-0">
          <CardTitle>Combined result</CardTitle>
          {sourcesLabel && (
            <p className="mt-1 text-[11px] text-[var(--muted)]">
              Merged across {sourcesLabel}, sorted by confidence.
            </p>
          )}
        </div>
        <div className="flex items-center gap-2">
          <StatusPill tone={statusTone(evidence.status)} size="sm">
            {evidence.status}
          </StatusPill>
          <span className="font-mono text-xs tabular-nums text-[var(--muted)]">
            {totalHits} match{totalHits === 1 ? "" : "es"}
          </span>
        </div>
      </CardHeader>

      <CardContent className="space-y-4">
        {noMatches && (
          <p className="text-sm text-[var(--muted)]">
            No entities matched above the configured confidence threshold on
            any provider.
          </p>
        )}

        {(evidence.matches || []).map((match, i) => (
          <ScreeningMatchRow
            key={`combined-${match.entity_id}-${i}`}
            match={match}
            showProviderBadge
          />
        ))}
      </CardContent>
    </Card>
  );
}

function ScreeningMatchRow({
  match,
  showProviderBadge = false,
}: {
  match: OpenSanctionsMatch;
  showProviderBadge?: boolean;
}) {
  const scorePct = Math.round(match.score * 100);
  const tone =
    match.score >= 0.95 ? "danger"
    : match.score >= 0.85 ? "warning"
    : "info";

  const rawProvider = (match.raw as Record<string, unknown> | undefined)
    ?._provider;
  const source =
    typeof rawProvider === "string" ? providerLabel(rawProvider) : null;

  return (
    <div className="rounded-xl border border-[var(--border)] p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <p className="truncate text-sm font-bold">
              {match.caption || "(unnamed entity)"}
            </p>
            {showProviderBadge && source && (
              <span className="rounded-full border border-[var(--border)] bg-[var(--surface-2)] px-1.5 py-0 text-[9px] font-extrabold uppercase tracking-wider text-[var(--muted)]">
                {source}
              </span>
            )}
          </div>
          {match.entity_id && (
            <p className="mt-0.5 font-mono text-[10px] text-[var(--muted-2)]">
              {match.entity_id}
            </p>
          )}
        </div>
        <StatusPill tone={tone} size="sm">
          {scorePct}% match
        </StatusPill>
      </div>

      {match.topics && match.topics.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-1.5">
          {match.topics.map((topic) => (
            <StatusPill key={topic} tone="neutral" size="sm">
              {topic}
            </StatusPill>
          ))}
        </div>
      )}

      {match.datasets && match.datasets.length > 0 && (
        <section className="mt-3">
          <h4 className="text-[10px] font-extrabold uppercase tracking-[0.14em] text-[var(--muted-2)]">
            Listed on {match.datasets.length} source
            {match.datasets.length === 1 ? "" : "s"}
          </h4>
          <ul className="mt-1.5 space-y-1 font-mono text-[10px] text-[var(--muted)]">
            {match.datasets.map((ds) => (
              <li key={ds}>· {ds}</li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Risk
// ---------------------------------------------------------------------------

function RiskTab({ workflow }: { workflow: WorkflowStatusResponse }) {
  const risk: RiskClassificationDetail | null = workflow.risk_classification;
  const evidence: EvidenceScoreDetail | null = workflow.evidence_score;

  if (!risk) {
    return (
      <EmptyState
        icon={ShieldAlert}
        title="Risk not yet classified"
        description="The pipeline hasn't reached the risk step yet, or the workflow failed before it."
      />
    );
  }

  const tier = risk.tier;

  return (
    <div className="space-y-6">
      <Card
        className={cn(
          "border-2",
          tier === "HIGH" && "border-[var(--danger-border)]",
          tier === "MEDIUM" && "border-[var(--warning-border)]",
          tier === "LOW" && "border-[var(--success-border)]",
        )}
      >
        <CardContent className="flex items-start gap-4 p-6">
          <span
            className={cn(
              "grid size-12 shrink-0 place-items-center rounded-full",
              tier === "HIGH" && "bg-[var(--danger-soft)] text-[var(--danger)]",
              tier === "MEDIUM" &&
                "bg-[var(--warning-soft)] text-[var(--warning)]",
              tier === "LOW" && "bg-[var(--success-soft)] text-[var(--success)]",
            )}
          >
            {tier === "HIGH" ? (
              <XCircle className="size-6" />
            ) : tier === "MEDIUM" ? (
              <AlertTriangle className="size-6" />
            ) : (
              <CheckCircle2 className="size-6" />
            )}
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-xs font-medium uppercase tracking-wider text-[var(--muted)]">
              Risk tier
            </p>
            <p
              className={cn(
                "mt-1 text-2xl font-semibold",
                tier === "HIGH" && "text-[var(--danger)]",
                tier === "MEDIUM" && "text-[var(--warning)]",
                tier === "LOW" && "text-[var(--success)]",
              )}
            >
              {tier}
            </p>
            <p className="mt-1 text-sm text-[var(--muted)]">
              {tier === "HIGH" &&
                "One or more checks failed. Manual review is required."}
              {tier === "MEDIUM" &&
                "One or more checks require review before a decision."}
              {tier === "LOW" && "All checks passed. No further action needed."}
            </p>
          </div>
        </CardContent>
      </Card>

      {risk.reason.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Classification reasoning</CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="space-y-2 font-mono text-xs">
              {risk.reason.map((reason, i) => (
                <li key={i} className="flex items-start gap-2">
                  <span className="mt-1.5 size-1.5 shrink-0 rounded-full bg-[var(--warning)]" />
                  <span>{reason}</span>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}

      {evidence && <EvidenceTable evidence={evidence} />}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Decision
// ---------------------------------------------------------------------------

type DecisionValue = "APPROVED" | "REJECTED" | "MORE_INFO";

const DECISION_OPTIONS: {
  value: DecisionValue;
  label: string;
  description: string;
}[] = [
  {
    value: "APPROVED",
    label: "Approve",
    description: "Accept the customer and close the application.",
  },
  {
    value: "MORE_INFO",
    label: "Request More Information",
    description:
      "Ask the customer to supply additional documents or details.",
  },
  {
    value: "REJECTED",
    label: "Reject",
    description: "Decline the application. This is a terminal decision.",
  },
];

const DECISION_TONE: Record<
  string,
  { chip: string; chipFg: string; icon: LucideIcon }
> = {
  APPROVED: {
    chip: "bg-[var(--success-soft)]",
    chipFg: "text-[var(--success)]",
    icon: CheckCircle2,
  },
  REJECTED: {
    chip: "bg-[var(--danger-soft)]",
    chipFg: "text-[var(--danger)]",
    icon: XCircle,
  },
  MORE_INFO: {
    chip: "bg-[var(--warning-soft)]",
    chipFg: "text-[var(--warning)]",
    icon: AlertTriangle,
  },
  PENDING: {
    chip: "bg-[var(--surface-hi)]",
    chipFg: "text-[var(--muted)]",
    icon: ShieldAlert,
  },
};

function DecisionTab({
  workflow,
  trackingId,
}: {
  workflow: WorkflowStatusResponse;
  trackingId: string;
}) {
  const toast = useToast();
  const decision = workflow.decision;

  const [selected, setSelected] = useState<DecisionValue | null>(null);
  const [note, setNote] = useState("");

  const decide = useDecideWorkflow({
    onSuccess: () => {
      toast.push({
        severity: "success",
        title: "Decision recorded",
        message: "The audit trail has been updated.",
      });
      setSelected(null);
      setNote("");
    },
    onError: (err) => {
      toast.push({
        severity: "danger",
        title: "Couldn't record decision",
        message: err instanceof Error ? err.message : "Please try again.",
      });
    },
  });

  const assessment = workflow.customer_assessment;
  const isDecided = decision.value !== "PENDING";
  const isCompleted = workflow.status === "COMPLETED";

  if (isDecided) {
    const tone = DECISION_TONE[decision.value] ?? DECISION_TONE.PENDING;
    const Icon = tone.icon;
    return (
      <Card>
        <CardContent className="p-7">
          <div className="flex items-start gap-4">
            <span
              className={cn(
                "grid size-12 shrink-0 place-items-center rounded-xl",
                tone.chip,
                tone.chipFg,
              )}
            >
              <Icon className="size-6" strokeWidth={2.5} />
            </span>
            <div className="min-w-0 flex-1">
              <span
                className={cn(
                  "inline-flex items-center rounded-full px-2.5 py-0.5 text-[10px] font-extrabold uppercase tracking-[0.14em]",
                  tone.chip,
                  tone.chipFg,
                )}
              >
                Decision
              </span>
              <h2 className="mt-2 text-xl font-extrabold tracking-tight">
                {DECISION_OPTIONS.find((o) => o.value === decision.value)
                  ?.label ?? decision.value}
              </h2>
              {decision.decided_at && (
                <p className="mt-1 text-xs text-[var(--muted)]">
                  Recorded {formatDateTime(decision.decided_at)}
                  {decision.decided_by_username &&
                    ` by ${decision.decided_by_username}`}
                </p>
              )}
              {decision.note && (
                <p className="mt-4 whitespace-pre-wrap rounded-lg border border-[var(--border)] bg-[var(--surface-2)] p-3 text-sm text-[var(--fg)]">
                  {decision.note}
                </p>
              )}
            </div>
          </div>
        </CardContent>
      </Card>
    );
  }

  if (!isCompleted) {
    return (
      <EmptyState
        icon={ShieldAlert}
        title="Decision not available yet"
        description="A decision can only be recorded once the workflow has completed."
      />
    );
  }

  return (
    <div className="space-y-6">
      {assessment && (
        <AssessmentHero
          assessment={assessment}
          faceMatch={workflow.face_match}
        />
      )}

      <Card>
        <CardHeader>
          <CardTitle>Decision</CardTitle>
          <p className="mt-1 text-sm text-[var(--muted)]">
            Choose an outcome and add a note for the audit trail. This
            cannot be changed once recorded.
          </p>
        </CardHeader>
        <CardContent className="space-y-5">
          <ul className="space-y-2">
            {DECISION_OPTIONS.map((opt) => {
              const isChosen = selected === opt.value;
              return (
                <li key={opt.value}>
                  <button
                    type="button"
                    onClick={() => setSelected(opt.value)}
                    className={cn(
                      "flex w-full items-start gap-3 rounded-xl border-2 p-4 text-left transition-colors",
                      isChosen
                        ? "border-[var(--primary)] bg-[var(--primary-soft)]"
                        : "border-[var(--border)] hover:border-[var(--border-hi)] hover:bg-[var(--surface-2)]",
                    )}
                  >
                    <span
                      className={cn(
                        "mt-0.5 grid size-5 shrink-0 place-items-center rounded-full border-2",
                        isChosen
                          ? "border-[var(--primary)] bg-[var(--primary)]"
                          : "border-[var(--border-hi)]",
                      )}
                    >
                      {isChosen && (
                        <Check
                          className="size-3 text-white"
                          strokeWidth={3}
                        />
                      )}
                    </span>
                    <div className="min-w-0">
                      <p className="font-bold">{opt.label}</p>
                      <p className="mt-0.5 text-xs text-[var(--muted)]">
                        {opt.description}
                      </p>
                    </div>
                  </button>
                </li>
              );
            })}
          </ul>

          <div>
            <label
              htmlFor="decision-note"
              className="text-sm font-medium text-[var(--fg)]"
            >
              Notes for the audit trail
            </label>
            <Textarea
              id="decision-note"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Add context for this decision…"
              maxLength={2000}
              className="mt-1.5"
            />
            <p className="mt-1 text-[10px] text-[var(--muted-2)]">
              {note.length} / 2000
            </p>
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <Button
              variant="primary"
              disabled={!selected || decide.isPending}
              loading={decide.isPending}
              onClick={() => {
                if (!selected) return;
                decide.mutate({
                  trackingId,
                  decision: selected,
                  note: note.trim(),
                });
              }}
            >
              {!decide.isPending && <Send className="size-3.5" />}
              Record decision
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Small pieces
// ---------------------------------------------------------------------------

function SummaryTile({
  label,
  value,
}: {
  label: string;
  value: React.ReactNode;
}) {
  return (
    <div className="rounded-xl border border-[var(--border)] bg-white p-4">
      <p className="text-xs font-medium uppercase tracking-wider text-[var(--muted)]">
        {label}
      </p>
      <div className="mt-2">{value}</div>
    </div>
  );
}

function Field({
  label,
  value,
  mono,
}: {
  label: string;
  value: string;
  mono?: boolean;
}) {
  return (
    <div>
      <dt className="text-xs text-[var(--muted)]">{label}</dt>
      <dd
        className={cn(
          "mt-0.5 text-sm",
          mono && "break-all font-mono text-xs",
        )}
      >
        {value || "—"}
      </dd>
    </div>
  );
}

function ReviewSkeleton() {
  return (
    <div className="space-y-6">
      <Skeleton className="h-12 w-full" />
      <Skeleton className="h-32 w-full" />
      <Skeleton className="h-64 w-full" />
    </div>
  );
}
