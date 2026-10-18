// src/pages/officer/screening/[id].tsx
"use client";

import Link from "next/link";
import { useRouter } from "next/router";
import { ArrowLeft, AlertTriangle, ScanFace } from "lucide-react";

import { ROUTES } from "@/lib/constants";
import { useScreening } from "@/lib/hooks";
import { formatDateTime } from "@/lib/utils";
import type { OpenSanctionsMatch, ScreeningResult } from "@/lib/types";
import {
  Button,
  ScreeningStatusPill,
  StatusPill,
} from "@/components/ui/primitives";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  EmptyState,
  Skeleton,
} from "@/components/ui/surfaces";

export default function OfficerScreeningDetailPage() {
  const router = useRouter();
  const { id } = router.query as { id?: string };

  const numericId = id ? Number(id) : NaN;
  const validId = Number.isFinite(numericId) && numericId > 0 ? numericId : null;

  const query = useScreening(validId);

  if (!id) return <DetailSkeleton />;
  if (query.isLoading) return <DetailSkeleton />;

  if (query.isError || !query.data) {
    return (
      <div className="space-y-6">
        <BackLink />
        <EmptyState
          icon={AlertTriangle}
          title="Screening not found"
          description={
            query.error instanceof Error
              ? query.error.message
              : "This screening doesn't exist, or you don't have access to it."
          }
          action={
            <Button asChild size="sm" variant="outline">
              <Link href={ROUTES.officer.screening}>Back to screenings</Link>
            </Button>
          }
        />
      </div>
    );
  }

  const screening: ScreeningResult = query.data;
  const details = screening.details ?? {};
  const matches = details.matches ?? [];
  const providers = details.providers ?? [];

  return (
    <div className="space-y-6">
      <BackLink />

      {/* Header */}
      <div className="rounded-xl border border-[var(--border)] bg-white p-6 shadow-[var(--shadow-xs)]">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0">
            <p className="text-xs font-medium uppercase tracking-wider text-[var(--muted)]">
              Screening
            </p>
            <h1 className="mt-1 font-mono text-lg font-semibold tracking-tight">
              #{screening.id}
            </h1>
            <p className="mt-1 text-xs text-[var(--muted)]">
              Generated {formatDateTime(screening.created_at)}
            </p>
            {providers.length > 0 && (
              <p className="mt-1 text-xs text-[var(--muted)]">
                Via {providers.join(" + ")}
              </p>
            )}
          </div>
          <ScreeningStatusPill status={screening.status} />
        </div>

        {details.error && (
          <p className="mt-4 rounded-lg border border-[var(--warning-border)] bg-[var(--warning-soft)] p-3 text-xs text-[var(--warning)]">
            Provider error: {details.error}
          </p>
        )}
      </div>

      {/* Matches */}
      <Card>
        <CardHeader className="flex-row items-center justify-between gap-2 space-y-0">
          <CardTitle>Matches</CardTitle>
          <span className="font-mono text-xs text-[var(--muted)]">
            {matches.length} {matches.length === 1 ? "hit" : "hits"}
          </span>
        </CardHeader>
        <CardContent className="space-y-3">
          {matches.length === 0 ? (
            <p className="text-sm text-[var(--muted)]">
              No entities matched above the configured confidence threshold.
            </p>
          ) : (
            matches.map((match, i) => (
              <MatchRow key={`${match.entity_id}-${i}`} match={match} />
            ))
          )}
        </CardContent>
      </Card>

      {/* Raw payloads */}
      {details.parsed_query && (
        <details className="rounded-xl border border-[var(--border)] bg-white p-4">
          <summary className="cursor-pointer text-[10px] font-extrabold uppercase tracking-[0.14em] text-[var(--muted-2)]">
            Query sent to provider
          </summary>
          <pre className="mt-2 max-h-64 overflow-auto rounded-lg bg-[var(--surface-2)] p-3 font-mono text-[10px] leading-relaxed">
            {JSON.stringify(details.parsed_query, null, 2)}
          </pre>
        </details>
      )}
    </div>
  );
}

function MatchRow({ match }: { match: OpenSanctionsMatch }) {
  const pct = Math.round(match.score * 100);
  const tone = match.score >= 0.95 ? "danger" : match.score >= 0.85 ? "warning" : "info";

  return (
    <div className="rounded-xl border border-[var(--border)] p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-bold">
            {match.caption || "(unnamed entity)"}
          </p>
          <p className="mt-0.5 font-mono text-[10px] text-[var(--muted-2)]">
            {match.entity_id}
          </p>
        </div>
        <StatusPill tone={tone} size="sm">
          {pct}% match
        </StatusPill>
      </div>

      {match.topics.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-1.5">
          {match.topics.map((t) => (
            <StatusPill key={t} tone="neutral" size="sm">
              {t}
            </StatusPill>
          ))}
        </div>
      )}
    </div>
  );
}

function BackLink() {
  return (
    <Link
      href={ROUTES.officer.screening}
      className="inline-flex items-center gap-1.5 text-sm text-[var(--muted)] transition-colors hover:text-[var(--fg)]"
    >
      <ArrowLeft className="size-3.5" />
      All screenings
    </Link>
  );
}

function DetailSkeleton() {
  return (
    <div className="space-y-6">
      <Skeleton className="h-4 w-32" />
      <Skeleton className="h-32 w-full" />
      <Skeleton className="h-64 w-full" />
    </div>
  );
}
