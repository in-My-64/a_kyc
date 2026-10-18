// src/pages/officer/screening.tsx
"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import type { ColumnDef, SortingState } from "@tanstack/react-table";
import { ExternalLink, RefreshCw, ScanFace } from "lucide-react";

import { DEFAULT_PAGE_SIZE, ROUTES } from "@/lib/constants";
import { apiMap } from "@/lib/endpoints";
import { qk, useDebounce } from "@/lib/hooks";
import { useQueryErrorToast } from "@/lib/use-error-handler";
import { cn, formatDateTime } from "@/lib/utils";
import type { ScreeningResult, ScreeningStatus } from "@/lib/types";
import {
  Button,
  IconButton,
  ScreeningStatusPill,
} from "@/components/ui/primitives";
import { EmptyState } from "@/components/ui/surfaces";
import {
  ColumnHeader,
  DataTable,
  ToolbarSearch,
  ToolbarSpacer,
} from "@/components/ui/data";
import { NoSearchResultsArt } from "@/components/illustrations";

type StatusFilter = ScreeningStatus | "all";

export default function OfficerScreeningPage() {
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(DEFAULT_PAGE_SIZE);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [sorting, setSorting] = useState<SortingState>([
    { id: "created_at", desc: true },
  ]);

  const debouncedSearch = useDebounce(search, 300);

  const params = useMemo(
    () => ({ page, page_size: pageSize }),
    [page, pageSize],
  );

  const screeningsQuery = useQuery({
    queryKey: qk.screenings.list(params),
    queryFn: () => apiMap.screenings.list(params),
    staleTime: 15_000,
    placeholderData: (prev) => prev,
  });

  useQueryErrorToast(screeningsQuery);

  const all: ScreeningResult[] = screeningsQuery.data?.results ?? [];

  // Client-side filters (the ScreeningResult endpoint doesn't expose them yet)
  const rows = useMemo(() => {
    let out = all;
    if (statusFilter !== "all") {
      out = out.filter((r) => r.status === statusFilter);
    }
    if (debouncedSearch) {
      const needle = debouncedSearch.toLowerCase();
      out = out.filter((r) => {
        const caption = (r.details?.matches ?? [])
          .map((m) => m.caption ?? "")
          .join(" ")
          .toLowerCase();
        return (
          String(r.id).includes(needle) ||
          caption.includes(needle)
        );
      });
    }
    return out;
  }, [all, statusFilter, debouncedSearch]);

  const counts = useMemo(() => {
    const c: Record<ScreeningStatus, number> = { CLEAR: 0, FLAGGED: 0, MATCH: 0 };
    for (const r of all) c[r.status] += 1;
    return c;
  }, [all]);

  const total = screeningsQuery.data?.count ?? 0;
  const hasActiveFilters = Boolean(debouncedSearch) || statusFilter !== "all";

  function clearFilters() {
    setSearch("");
    setStatusFilter("all");
    setPage(1);
  }

  const columns = useMemo<ColumnDef<ScreeningResult, unknown>[]>(
    () => [
      {
        accessorKey: "id",
        header: ({ column }) => (
          <ColumnHeader column={column}>Screening</ColumnHeader>
        ),
        cell: ({ row }) => (
          <span className="font-mono text-xs font-bold">
            #{row.original.id}
          </span>
        ),
      },
      {
        accessorKey: "status",
        header: "Status",
        cell: ({ row }) => (
          <ScreeningStatusPill status={row.original.status} />
        ),
      },
      {
        id: "provider",
        header: "Provider",
        cell: ({ row }) => {
          const providers = row.original.details?.providers ?? [];
          const label =
            providers.length > 0
              ? providers.join(" + ")
              : row.original.details?.provider ?? "—";
          return (
            <span className="text-xs font-semibold text-[var(--muted)]">
              {label}
            </span>
          );
        },
      },
      {
        id: "matches",
        header: "Matches",
        cell: ({ row }) => {
          const n = row.original.details?.match_count ?? 0;
          return (
            <span className="font-mono text-xs tabular-nums">
              {n} {n === 1 ? "hit" : "hits"}
            </span>
          );
        },
      },
      {
        accessorKey: "created_at",
        header: ({ column }) => (
          <ColumnHeader column={column}>Generated</ColumnHeader>
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
            aria-label="Open screening"
            onClick={(e) => e.stopPropagation()}
          >
            <Link href={ROUTES.officer.screeningDetail(row.original.id)}>
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
        <h1 className="text-3xl font-extrabold tracking-tight">Screenings</h1>
        <p className="mt-1 text-sm font-bold text-[var(--muted)]">
          Sanctions, PEP, and adverse-media checks across all workflows.
        </p>
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
        <FilterChip
          label="Clear"
          count={counts.CLEAR}
          active={statusFilter === "CLEAR"}
          onClick={() => {
            setStatusFilter("CLEAR");
            setPage(1);
          }}
        />
        <FilterChip
          label="Flagged"
          count={counts.FLAGGED}
          active={statusFilter === "FLAGGED"}
          onClick={() => {
            setStatusFilter("FLAGGED");
            setPage(1);
          }}
        />
        <FilterChip
          label="Match"
          count={counts.MATCH}
          active={statusFilter === "MATCH"}
          onClick={() => {
            setStatusFilter("MATCH");
            setPage(1);
          }}
        />
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
        loading={screeningsQuery.isLoading || screeningsQuery.isFetching}
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
        onRowClick={(s) =>
          window.location.assign(ROUTES.officer.screeningDetail(s.id))
        }
        toolbar={
          <>
            <ToolbarSearch
              value={search}
              onChange={(v) => {
                setSearch(v);
                setPage(1);
              }}
              placeholder="Search by ID or match name…"
            />
            <ToolbarSpacer />
            <span className="hidden text-xs font-bold text-[var(--muted)] sm:inline">
              {total} {total === 1 ? "screening" : "screenings"}
            </span>
            <IconButton
              onClick={() => screeningsQuery.refetch()}
              disabled={screeningsQuery.isFetching}
              aria-label="Refresh"
            >
              <RefreshCw
                className={cn(
                  "size-4",
                  screeningsQuery.isFetching && "animate-spin",
                )}
              />
            </IconButton>
          </>
        }
        emptyState={
          hasActiveFilters ? (
            <EmptyState
              icon={ScanFace}
              title="No matching screenings"
              description="Try a different search or clear the filters."
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
              icon={ScanFace}
              title="No screenings yet"
              description="Screening results appear here as workflows are processed."
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
