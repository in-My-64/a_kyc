// src/pages/customer/applications/index.tsx
"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/router";
import { useQuery } from "@tanstack/react-query";
import type { ColumnDef, SortingState } from "@tanstack/react-table";
import { FilePlus2, FileStack, ExternalLink, RefreshCw } from "lucide-react";

import {
  ROUTES,
  WORKFLOW_STATUS_OPTIONS,
  DEFAULT_PAGE_SIZE,
} from "@/lib/constants";
import { apiMap } from "@/lib/endpoints";
import { qk, useDebounce } from "@/lib/hooks";
import { useQueryErrorToast, useErrorHandler } from "@/lib/use-error-handler";
import { friendlyFailure } from "@/lib/friendly-errors";
import { cn, formatDateTime } from "@/lib/utils";
import type { WorkflowListItem, WorkflowStatus } from "@/lib/types";
import {
  Button,
  IconButton,
  StatusDot,
  WorkflowStatusPill,
} from "@/components/ui/primitives";
import { EmptyState } from "@/components/ui/surfaces";
import {
  ColumnHeader,
  DataTable,
  ToolbarSearch,
  ToolbarSpacer,
} from "@/components/ui/data";
import { NoSearchResultsArt } from "@/components/illustrations";

// ---------------------------------------------------------------------------
// Customer-facing step labels — no backend keys ever surface.
//
// run_ocr_task and create_parsed_document share a label so the
// customer sees one "Reading your document" step, not two.
// ---------------------------------------------------------------------------

const STEP_LABELS: Record<string, string> = {
  created: "Created",
  preprocess_document: "Preparing document",
  run_ocr_task: "Reading your document",
  create_parsed_document: "Reading your document",
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

// ---------------------------------------------------------------------------

export default function CustomerApplicationsPage() {
  const router = useRouter();
  const errorHandler = useErrorHandler();

  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(DEFAULT_PAGE_SIZE);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<WorkflowStatus | "all">("all");
  const [sorting, setSorting] = useState<SortingState>([
    { id: "created_at", desc: true },
  ]);

  const debouncedSearch = useDebounce(search, 300);

  const params = useMemo(
    () => ({
      page,
      page_size: pageSize,
      search: debouncedSearch || undefined,
      status: statusFilter === "all" ? undefined : statusFilter,
      ordering:
        sorting[0]?.id === "created_at"
          ? sorting[0].desc
            ? ("-created_at" as const)
            : ("created_at" as const)
          : sorting[0]?.id === "updated_at"
          ? sorting[0].desc
            ? ("-updated_at" as const)
            : ("updated_at" as const)
          : undefined,
    }),
    [page, pageSize, debouncedSearch, statusFilter, sorting],
  );

  const workflowsQuery = useQuery({
    queryKey: qk.workflows.list(params),
    queryFn: () => apiMap.workflows.list(params),
    staleTime: 15_000,
    placeholderData: (prev) => prev,
  });

  useQueryErrorToast(workflowsQuery);

  const rows: WorkflowListItem[] = workflowsQuery.data?.results ?? [];
  const total = workflowsQuery.data?.count ?? 0;
  const hasActiveFilters = Boolean(debouncedSearch) || statusFilter !== "all";

  function handleRefresh() {
    errorHandler.reset();
    workflowsQuery.refetch();
  }

  function clearFilters() {
    setSearch("");
    setStatusFilter("all");
    setPage(1);
  }

  const columns = useMemo<ColumnDef<WorkflowListItem, unknown>[]>(
    () => [
      {
        accessorKey: "tracking_id",
        header: ({ column }) => (
          <ColumnHeader column={column}>Reference</ColumnHeader>
        ),
        cell: ({ row }) => {
          const wf = row.original;
          const live = wf.status === "PENDING" || wf.status === "IN_PROGRESS";
          return (
            <div className="flex min-w-0 items-center gap-2">
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
              <span
                className="truncate font-mono text-xs font-bold"
                title={wf.tracking_id}
              >
                {wf.reference}
              </span>
            </div>
          );
        },
      },
      {
        accessorKey: "status",
        header: "Status",
        cell: ({ row }) => <WorkflowStatusPill status={row.original.status} />,
      },
      {
        id: "step",
        header: "Step",
        cell: ({ row }) => {
          const wf = row.original;
          const step = wf.current_step?.replace(/^failed_/, "") ?? "";
          const label = step ? STEP_LABELS[step] ?? "Processing" : "—";

          const isFailed = wf.status === "FAILED";
          const failure = isFailed
            ? friendlyFailure(wf.current_step, wf.last_error)
            : null;

          return (
            <span
              className={cn(
                "block max-w-[280px] truncate text-xs font-semibold",
                isFailed ? "text-[var(--danger)]" : "text-[var(--muted)]",
              )}
              title={failure ? `${label} — ${failure.title}` : undefined}
            >
              {label}
            </span>
          );
        },
      },
      {
        accessorKey: "created_at",
        header: ({ column }) => (
          <ColumnHeader column={column}>Submitted</ColumnHeader>
        ),
        cell: ({ row }) => (
          <span className="whitespace-nowrap text-xs font-bold text-[var(--muted)]">
            {formatDateTime(row.original.created_at)}
          </span>
        ),
      },
      {
        id: "actions",
        header: "",
        cell: ({ row }) => (
          <IconButton
            asChild
            aria-label="Open"
            onClick={(e) => e.stopPropagation()}
          >
            <Link href={ROUTES.kycStatus(row.original.tracking_id)}>
              <ExternalLink className="size-3.5" />
            </Link>
          </IconButton>
        ),
      },
    ],
    [],
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl font-extrabold tracking-tight">
            My Applications
          </h1>
          <p className="mt-1 text-sm font-bold text-[var(--muted)]">
            Every KYC verification you&apos;ve started.
          </p>
        </div>
        <Button asChild>
          <Link href={ROUTES.customer.apply}>
            <FilePlus2 className="size-3.5" />
            New application
          </Link>
        </Button>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <FilterChip
          label="All"
          count={statusFilter === "all" ? total : undefined}
          active={statusFilter === "all"}
          onClick={() => {
            setStatusFilter("all");
            setPage(1);
          }}
        />
        {WORKFLOW_STATUS_OPTIONS.map((o) => (
          <FilterChip
            key={o.value}
            label={o.label}
            active={statusFilter === o.value}
            onClick={() => {
              setStatusFilter(o.value as WorkflowStatus);
              setPage(1);
            }}
          />
        ))}
        {hasActiveFilters && (
          <button
            type="button"
            onClick={clearFilters}
            className="ml-1 text-xs font-bold text-[var(--primary)] hover:underline"
          >
            Clear filters
          </button>
        )}
      </div>

      <DataTable
        columns={columns}
        data={rows}
        loading={workflowsQuery.isLoading || workflowsQuery.isFetching}
        sorting={sorting}
        onSortingChange={setSorting}
        page={page}
        pageSize={pageSize}
        total={total}
        onPageChange={setPage}
        onPageSizeChange={(size) => {
          setPageSize(size);
          setPage(1);
        }}
        onRowClick={(wf) => router.push(ROUTES.kycStatus(wf.tracking_id))}
        toolbar={
          <>
            <ToolbarSearch
              value={search}
              onChange={(v) => {
                setSearch(v);
                setPage(1);
              }}
              placeholder="Search by reference…"
            />
            <ToolbarSpacer />
            <span className="hidden text-xs font-bold text-[var(--muted)] sm:inline">
              {total} {total === 1 ? "result" : "results"}
            </span>
            <IconButton
              onClick={handleRefresh}
              disabled={workflowsQuery.isFetching}
              aria-label="Refresh"
            >
              <RefreshCw
                className={cn(
                  "size-4",
                  workflowsQuery.isFetching && "animate-spin",
                )}
              />
            </IconButton>
          </>
        }
        emptyState={
          hasActiveFilters ? (
            <EmptyState
              icon={FileStack}
              title="No matching applications"
              description="Try a different search term or clear the filters."
              action={
                <Button variant="outline" size="sm" onClick={clearFilters}>
                  Clear filters
                </Button>
              }
              className="border-none bg-transparent"
              illustration={<NoSearchResultsArt className="h-32 w-auto" />}
            />
          ) : (
            <EmptyState
              icon={FileStack}
              title="No applications yet"
              description="Start your first KYC verification to see it tracked here."
              action={
                <Button asChild size="sm">
                  <Link href={ROUTES.customer.apply}>
                    <FilePlus2 className="size-3.5" />
                    Start application
                  </Link>
                </Button>
              }
            />
          )
        }
      />
    </div>
  );
}

function FilterChip({
  label,
  count,
  active,
  onClick,
}: {
  label: string;
  count?: number;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-bold transition-colors",
        active
          ? "border-[var(--primary)] bg-[var(--primary)] text-white"
          : "border-[var(--border)] bg-white text-[var(--muted)] hover:border-[var(--border-hi)] hover:text-[var(--fg)]",
      )}
    >
      {label}
      {count !== undefined && (
        <span
          className={cn(
            "rounded-full px-1.5 py-0 text-[10px] font-extrabold",
            active ? "bg-white/20" : "bg-[var(--surface-hi)]",
          )}
        >
          {count}
        </span>
      )}
    </button>
  );
}