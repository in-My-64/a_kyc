// src/pages/officer/audit.tsx
"use client";

import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import type { ColumnDef, SortingState } from "@tanstack/react-table";
import {
  AlertCircle,
  CheckCircle2,
  Eye,
  RefreshCw,
  ScrollText,
} from "lucide-react";

import { DEFAULT_PAGE_SIZE } from "@/lib/constants";
import { apiMap } from "@/lib/endpoints";
import { qk, useDebounce } from "@/lib/hooks";
import { cn, formatDateTime } from "@/lib/utils";
import type { AuditLogEntry } from "@/lib/types";
import {
  Button,
  IconButton,
  StatusPill,
} from "@/components/ui/primitives";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  EmptyState,
} from "@/components/ui/surfaces";
import {
  ColumnHeader,
  DataTable,
  ToolbarSearch,
  ToolbarSpacer,
} from "@/components/ui/data";
import { Select } from "@/components/ui/form";

// ---------------------------------------------------------------------------
// Action labels — maps every action the backend can emit onto a
// human-readable label. Adding a new action on the server requires
// adding a label here, but the table falls back to the raw code so
// nothing is ever hidden.
// ---------------------------------------------------------------------------

const ACTION_LABELS: Record<string, string> = {
  customer_created: "Customer created",
  document_uploaded: "Document uploaded",
  ocr_started: "OCR started",
  ocr_completed: "OCR completed",
  document_parsed: "Fields extracted",
  screening_completed: "Screening completed",
  evidence_scored: "Evidence scored",
  risk_assigned: "Risk assigned",
  kyc_workflow_completed: "Workflow completed",
  http_post: "HTTP POST",
  http_put: "HTTP PUT",
  http_patch: "HTTP PATCH",
};

function actionLabel(action: string): string {
  return ACTION_LABELS[action] ?? action;
}

export default function OfficerAuditPage() {
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(DEFAULT_PAGE_SIZE);
  const [search, setSearch] = useState("");
  const [actionFilter, setActionFilter] = useState<string>("all");
  const [successFilter, setSuccessFilter] = useState<string>("all");
  const [sorting, setSorting] = useState<SortingState>([
    { id: "timestamp", desc: true },
  ]);
  const [detail, setDetail] = useState<AuditLogEntry | null>(null);

  const debouncedSearch = useDebounce(search, 300);

  const params = useMemo(
    () => ({
      page,
      page_size: pageSize,
      search: debouncedSearch || undefined,
      action: actionFilter === "all" ? undefined : actionFilter,
      success:
        successFilter === "all" ? undefined : successFilter === "ok",
      ordering:
        sorting[0]?.id === "timestamp"
          ? sorting[0].desc
            ? ("-timestamp" as const)
            : ("timestamp" as const)
          : undefined,
    }),
    [page, pageSize, debouncedSearch, actionFilter, successFilter, sorting],
  );

  const auditQuery = useQuery({
    queryKey: qk.audit.list(params),
    queryFn: () => apiMap.audit.list(params),
    staleTime: 15_000,
    placeholderData: (prev) => prev,
  });

  const rows = auditQuery.data?.results ?? [];
  const total = auditQuery.data?.count ?? 0;

  const columns = useMemo<ColumnDef<AuditLogEntry, unknown>[]>(
    () => [
      {
        accessorKey: "timestamp",
        header: ({ column }) => (
          <ColumnHeader column={column}>When</ColumnHeader>
        ),
        cell: ({ row }) => (
          <span className="whitespace-nowrap text-xs text-[var(--muted)]">
            {formatDateTime(row.original.timestamp)}
          </span>
        ),
      },
      {
        accessorKey: "action",
        header: ({ column }) => (
          <ColumnHeader column={column}>Action</ColumnHeader>
        ),
        cell: ({ row }) => (
          <span className="text-sm font-medium">
            {actionLabel(row.original.action)}
          </span>
        ),
      },
      {
        accessorKey: "user",
        header: "User",
        cell: ({ row }) =>
          row.original.user ? (
            <span className="font-mono text-xs">#{row.original.user}</span>
          ) : (
            <span className="text-xs text-[var(--muted)]">system</span>
          ),
      },
      {
        accessorKey: "success",
        header: "Result",
        cell: ({ row }) =>
          row.original.success ? (
            <StatusPill tone="success">
              <CheckCircle2 className="size-3" />
              OK
            </StatusPill>
          ) : (
            <StatusPill tone="danger">
              <AlertCircle className="size-3" />
              Failed
            </StatusPill>
          ),
      },
      {
        id: "details",
        header: "",
        cell: ({ row }) => {
          const hasDetails =
            row.original.details &&
            Object.keys(row.original.details).length > 0;
          if (!hasDetails) return null;
          return (
            <IconButton
              onClick={(e) => {
                e.stopPropagation();
                setDetail(row.original);
              }}
              aria-label="View details"
            >
              <Eye className="size-3.5" />
            </IconButton>
          );
        },
      },
    ],
    [],
  );

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Audit Logs</h1>
        <p className="mt-1 text-sm text-[var(--muted)]">
          Immutable trail of every significant action, with PII redacted
          before storage.
        </p>
      </div>

      <DataTable
        columns={columns}
        data={rows}
        loading={auditQuery.isLoading || auditQuery.isFetching}
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
        onRowClick={(entry) => {
          const hasDetails =
            entry.details && Object.keys(entry.details).length > 0;
          if (hasDetails) setDetail(entry);
        }}
        compact
        toolbar={
          <>
            <ToolbarSearch
              value={search}
              onChange={(v) => {
                setSearch(v);
                setPage(1);
              }}
              placeholder="Search by action…"
            />
            <Select
              value={actionFilter}
              onChange={(e) => {
                setActionFilter(e.target.value);
                setPage(1);
              }}
              className="h-9 w-[180px]"
            >
              <option value="all">All actions</option>
              {Object.entries(ACTION_LABELS).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </Select>
            <Select
              value={successFilter}
              onChange={(e) => {
                setSuccessFilter(e.target.value);
                setPage(1);
              }}
              className="h-9 w-[140px]"
            >
              <option value="all">All results</option>
              <option value="ok">Success</option>
              <option value="fail">Failure</option>
            </Select>
            <ToolbarSpacer />
            <span className="hidden text-xs text-[var(--muted)] sm:inline">
              {total} {total === 1 ? "entry" : "entries"}
            </span>
            <IconButton
              onClick={() => auditQuery.refetch()}
              disabled={auditQuery.isFetching}
              aria-label="Refresh"
            >
              <RefreshCw
                className={cn(
                  "size-4",
                  auditQuery.isFetching && "animate-spin",
                )}
              />
            </IconButton>
          </>
        }
        emptyState={
          <EmptyState
            icon={ScrollText}
            title="No audit entries"
            description="Actions from users and the system will appear here."
          />
        }
      />

      {detail && (
        <DetailDialog entry={detail} onClose={() => setDetail(null)} />
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Detail dialog
// ---------------------------------------------------------------------------

function DetailDialog({
  entry,
  onClose,
}: {
  entry: AuditLogEntry;
  onClose: () => void;
}) {
  return (
    <div
      className="fixed inset-0 z-50 grid place-items-center bg-black/50 p-4"
      onClick={onClose}
      role="presentation"
    >
      <Card
        className="w-full max-w-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <CardHeader className="flex-row items-start justify-between gap-3 space-y-0">
          <div className="min-w-0">
            <CardTitle>{actionLabel(entry.action)}</CardTitle>
            <p className="mt-1 text-xs text-[var(--muted)]">
              {formatDateTime(entry.timestamp)}
              {entry.user ? ` · user #${entry.user}` : " · system"}
              {" · "}
              {entry.success ? "succeeded" : "failed"}
            </p>
          </div>
          <Button variant="ghost" size="sm" onClick={onClose}>
            Close
          </Button>
        </CardHeader>
        <CardContent>
          <p className="mb-2 text-xs font-medium uppercase tracking-wide text-[var(--muted)]">
            Details
          </p>
          <pre className="max-h-[420px] overflow-auto rounded-lg bg-[var(--surface-2)] p-4 font-mono text-xs leading-relaxed">
            {JSON.stringify(entry.details, null, 2)}
          </pre>
          <p className="mt-3 text-xs text-[var(--muted)]">
            PII fields (email, password, ID number, file paths, extracted
            text) are redacted by the backend before being logged.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}