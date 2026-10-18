// src/pages/officer/applications/index.tsx
"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/router";
import { useQuery } from "@tanstack/react-query";
import type { ColumnDef, SortingState } from "@tanstack/react-table";
import { ExternalLink, FileStack, RefreshCw } from "lucide-react";

import { DEFAULT_PAGE_SIZE, ROUTES, WORKFLOW_STATUS_OPTIONS } from "@/lib/constants";
import { apiMap } from "@/lib/endpoints";
import { qk, useDebounce } from "@/lib/hooks";
import { friendlyFailure } from "@/lib/friendly-errors";
import { cn, formatDateTime, truncate } from "@/lib/utils";
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

// ---------------------------------------------------------------------------
// Tabs — labels come straight from the backend enum so a new status can
// only ever appear here by being added to WORKFLOW_STATUS_OPTIONS.
// ---------------------------------------------------------------------------

type TabValue = WorkflowStatus | "all";

const TABS: { value: TabValue; label: string }[] = [
  { value: "all", label: "All" },
  ...WORKFLOW_STATUS_OPTIONS.map((o) => ({
    value: o.value as TabValue,
    label: o.label,
  })),
];

const STEP_LABELS: Record<string, string> = {
  created: "Created",
  preprocess_document: "Preprocessing",
  run_ocr_task: "OCR",
  create_parsed_document: "Reading document",
  run_vlm_extraction: "Confirming details",
  compare_extractions: "Reconciling",
  run_face_match: "Face match",
  compute_evidence_score: "Evidence scoring",
  run_sanctions_screening: "Customer Assessment",
  classify_risk: "Risk classification",
  log_audit_summary: "Finalising",
  done: "Completed",
  dispatch_failed: "Dispatch failed",
};

export default function OfficerApplicationsPage() {
  const router = useRouter();

  // Tab derived from the URL, not from local state.
  //
  // The sidebar links to /officer/applications?status=X. Client-side
  // navigation does not remount this component, so a useState holding
  // the initial tab would freeze and ignore subsequent URL changes —
  // clicking "Approved" updated the URL but the table kept showing
  // every status. Deriving from router.query fixes that: any query
  // change re-renders with the correct tab.
  const tab: TabValue = useMemo(() => {
    const status = router.query.status;
    if (typeof status !== "string") return "all";
    const valid = WORKFLOW_STATUS_OPTIONS.some((o) => o.value === status);
    return valid ? (status as WorkflowStatus) : "all";
  }, [router.query.status]);

  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(DEFAULT_PAGE_SIZE);
  const [search, setSearch] = useState("");
  const [sorting, setSorting] = useState<SortingState>([
    { id: "created_at", desc: true },
  ]);

  const debouncedSearch = useDebounce(search, 300);

  const params = useMemo(
    () => ({
      page,
      page_size: pageSize,
      search: debouncedSearch || undefined,
      status: tab === "all" ? undefined : tab,
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
    [page, pageSize, debouncedSearch, tab, sorting],
  );

  const workflowsQuery = useQuery({
    queryKey: qk.workflows.list(params),
    queryFn: () => apiMap.workflows.list(params),
    staleTime: 10_000,
    placeholderData: (prev) => prev,
  });

  const rows = workflowsQuery.data?.results ?? [];
  const total = workflowsQuery.data?.count ?? 0;

  function selectTab(next: TabValue) {
    // No setTab — the URL is the source of truth. Changing the query
    // re-renders this component with the new `tab` above.
    setPage(1);
    // Keep the URL in sync so the tab is shareable and refresh-stable.
    const query: Record<string, string> = {};
    if (next !== "all") query.status = next;
    router.replace(
      { pathname: router.pathname, query },
      undefined,
      { shallow: true },
    );
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
          const live =
            wf.status === "PENDING" || wf.status === "IN_PROGRESS";
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
                className="truncate font-mono text-xs"
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
        header: "Current step",
        cell: ({ row }) => {
          const wf = row.original;

          // Failed workflows: short summary in the cell, full error
          // string in the tooltip. A 400-char exception dumped into a
          // table cell is unreadable and doesn't help scan the list;
          // hovering on any row gives an officer the full detail, and
          // the workflow detail page shows it uncut in a monospace
          // panel.
          if (wf.status === "FAILED") {
            const failure = friendlyFailure(wf.current_step, wf.last_error);
            const shortLabel =
              failure.title.length > 44
                ? failure.title.slice(0, 43).trimEnd() + "…"
                : failure.title;
            return (
              <span
                className="block max-w-[280px] truncate text-xs font-bold text-[var(--danger)]"
                title={`${failure.title}\n\n${wf.last_error}`}
              >
                {shortLabel}
              </span>
            );
          }

          const step = wf.current_step?.replace(/^failed_/, "") ?? "";
          return (
            <span className="text-xs font-semibold text-[var(--muted)]">
              {step ? STEP_LABELS[step] ?? "Processing" : "—"}
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
          <span className="whitespace-nowrap text-xs text-[var(--muted)]">
            {formatDateTime(row.original.created_at)}
          </span>
        ),
      },
      {
        accessorKey: "updated_at",
        header: ({ column }) => (
          <ColumnHeader column={column}>Updated</ColumnHeader>
        ),
        cell: ({ row }) => (
          <span className="whitespace-nowrap text-xs text-[var(--muted)]">
            {formatDateTime(row.original.updated_at)}
          </span>
        ),
      },
      {
        id: "actions",
        header: "",
        cell: ({ row }) => (
          <IconButton
            asChild
            aria-label="Open review"
            onClick={(e) => e.stopPropagation()}
          >
            <Link
              href={ROUTES.officer.applicationDetail(row.original.tracking_id)}
            >
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
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">
          Applications
        </h1>
        <p className="mt-1 text-sm text-[var(--muted)]">
          Every KYC workflow across all customers.
        </p>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 overflow-x-auto border-b border-[var(--border)]">
        {TABS.map(({ value, label }) => {
          const active = tab === value;
          return (
            <button
              key={value}
              type="button"
              onClick={() => selectTab(value)}
              className={cn(
                "relative shrink-0 border-b-2 px-4 py-3 text-sm font-medium transition-colors",
                active
                  ? "border-[var(--primary)] text-[var(--primary)]"
                  : "border-transparent text-[var(--muted)] hover:text-[var(--fg)]",
              )}
            >
              {label}
            </button>
          );
        })}
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
        onRowClick={(wf) =>
          router.push(ROUTES.officer.applicationDetail(wf.tracking_id))
        }
        toolbar={
          <>
            <ToolbarSearch
              value={search}
              onChange={(v) => {
                setSearch(v);
                setPage(1);
              }}
              placeholder="Search by tracking ID…"
            />
            <ToolbarSpacer />
            <span className="hidden text-xs text-[var(--muted)] sm:inline">
              {total} {total === 1 ? "result" : "results"}
            </span>
            <IconButton
              onClick={() => workflowsQuery.refetch()}
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
          <EmptyState
            icon={FileStack}
            title={
              tab === "all"
                ? "No applications yet"
                : `No ${tab.toLowerCase()} applications`
            }
            description={
              tab === "all"
                ? "New submissions will appear here."
                : "Try a different tab or clear your search."
            }
          />
        }
      />
    </div>
  );
}