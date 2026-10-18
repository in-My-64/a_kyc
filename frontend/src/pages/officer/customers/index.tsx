// src/pages/officer/customers/index.tsx
"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/router";
import { useQuery } from "@tanstack/react-query";
import type { ColumnDef, SortingState } from "@tanstack/react-table";
import {
  ExternalLink,
  RefreshCw,
  UserCheck,
  UserX,
  Users,
} from "lucide-react";

import { DEFAULT_PAGE_SIZE, ROUTES } from "@/lib/constants";
import { apiMap } from "@/lib/endpoints";
import { qk, useDebounce } from "@/lib/hooks";
import { useQueryErrorToast } from "@/lib/use-error-handler";
import { cn, formatDate } from "@/lib/utils";
import type { CustomerRead, ScreeningStatus } from "@/lib/types";
import {
  Button,
  IconButton,
  ScreeningStatusPill,
  StatusPill,
} from "@/components/ui/primitives";
import { EmptyState } from "@/components/ui/surfaces";
import {
  ColumnHeader,
  DataTable,
  ToolbarSearch,
  ToolbarSpacer,
} from "@/components/ui/data";
import { NoSearchResultsArt } from "@/components/illustrations";

type ActiveFilter = "all" | "active" | "inactive";

export default function OfficerCustomersPage() {
  const router = useRouter();

  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(DEFAULT_PAGE_SIZE);
  const [search, setSearch] = useState("");
  const [activeFilter, setActiveFilter] = useState<ActiveFilter>("all");
  const [sorting, setSorting] = useState<SortingState>([
    { id: "date_joined", desc: true },
  ]);

  const debouncedSearch = useDebounce(search, 300);

  const params = useMemo(
    () => ({
      page,
      page_size: pageSize,
      search: debouncedSearch || undefined,
      ordering:
        sorting[0]?.id === "date_joined"
          ? sorting[0].desc
            ? ("-date_joined" as const)
            : ("date_joined" as const)
          : sorting[0]?.id === "username"
          ? sorting[0].desc
            ? ("-username" as const)
            : ("username" as const)
          : undefined,
    }),
    [page, pageSize, debouncedSearch, sorting],
  );

  const customersQuery = useQuery({
    queryKey: qk.customers.list(params),
    queryFn: () => apiMap.customers.list(params),
    staleTime: 15_000,
    placeholderData: (prev) => prev,
  });

  useQueryErrorToast(customersQuery);

  const all: CustomerRead[] = customersQuery.data?.results ?? [];

  const rows = useMemo(() => {
    if (activeFilter === "all") return all;
    if (activeFilter === "active") return all.filter((c) => c.is_active);
    return all.filter((c) => !c.is_active);
  }, [all, activeFilter]);

  const counts = useMemo(
    () => ({
      all: all.length,
      active: all.filter((c) => c.is_active).length,
      inactive: all.filter((c) => !c.is_active).length,
    }),
    [all],
  );

  const total = customersQuery.data?.count ?? 0;
  const hasActiveFilters =
    Boolean(debouncedSearch) || activeFilter !== "all";

  function clearFilters() {
    setSearch("");
    setActiveFilter("all");
    setPage(1);
  }

  const columns = useMemo<ColumnDef<CustomerRead, unknown>[]>(
    () => [
      {
        id: "customer",
        header: "Customer",
        cell: ({ row }) => {
          const c = row.original;
          const display =
            [c.first_name, c.last_name].filter(Boolean).join(" ").trim() ||
            c.username;

          return (
            <div className="flex min-w-0 items-center gap-2">
              <span className="grid size-7 shrink-0 place-items-center rounded-full bg-[var(--primary-soft)] text-[10px] font-extrabold text-[var(--primary)]">
                {(c.first_name?.[0] ?? c.username?.[0] ?? "?").toUpperCase()}
                {(c.last_name?.[0] ?? "").toUpperCase()}
              </span>
              <div className="min-w-0">
                <p className="truncate text-sm font-bold">{display}</p>
                <p className="truncate text-[11px] text-[var(--muted)]">
                  @{c.username}
                </p>
              </div>
            </div>
          );
        },
      },
      {
        accessorKey: "email",
        header: "Email",
        cell: ({ row }) => (
          <span className="truncate text-xs text-[var(--muted)]">
            {row.original.email}
          </span>
        ),
      },
      {
        accessorKey: "nationality",
        header: "Nationality",
        cell: ({ row }) => (
          <span className="text-xs font-semibold text-[var(--muted)]">
            {row.original.nationality || "—"}
          </span>
        ),
      },
      {
        id: "screening",
        header: "Assessment",
        cell: ({ row }) => {
          const status: ScreeningStatus | null =
            row.original.latest_screening_status;
          if (!status) {
            return (
              <span className="text-xs text-[var(--muted)]">Not run</span>
            );
          }
          return <ScreeningStatusPill status={status} />;
        },
      },
      {
        id: "role",
        header: "Role",
        cell: ({ row }) => {
          const c = row.original;
          if (c.is_staff) {
            return <StatusPill tone="warning" size="sm">Staff</StatusPill>;
          }
          if (c.is_active) {
            return <StatusPill tone="success" size="sm">Active</StatusPill>;
          }
          return <StatusPill tone="danger" size="sm">Inactive</StatusPill>;
        },
      },
      {
        accessorKey: "date_joined",
        header: ({ column }) => (
          <ColumnHeader column={column}>Joined</ColumnHeader>
        ),
        cell: ({ row }) => (
          <span className="whitespace-nowrap text-xs font-bold text-[var(--muted)]">
            {formatDate(row.original.date_joined)}
          </span>
        ),
      },
      {
        id: "actions",
        header: "",
        cell: ({ row }) => (
          <IconButton
            asChild
            aria-label="Open customer"
            onClick={(e) => e.stopPropagation()}
          >
            <Link href={ROUTES.officer.customerDetail(row.original.id)}>
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
        <h1 className="text-3xl font-extrabold tracking-tight">Customers</h1>
        <p className="mt-1 text-sm font-bold text-[var(--muted)]">
          Every account on the platform.
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <FilterChip
          label="All"
          count={counts.all}
          active={activeFilter === "all"}
          onClick={() => {
            setActiveFilter("all");
            setPage(1);
          }}
        />
        <FilterChip
          label="Active"
          count={counts.active}
          active={activeFilter === "active"}
          onClick={() => {
            setActiveFilter("active");
            setPage(1);
          }}
        />
        <FilterChip
          label="Inactive"
          count={counts.inactive}
          active={activeFilter === "inactive"}
          onClick={() => {
            setActiveFilter("inactive");
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
        loading={customersQuery.isLoading || customersQuery.isFetching}
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
        onRowClick={(c) => router.push(ROUTES.officer.customerDetail(c.id))}
        toolbar={
          <>
            <ToolbarSearch
              value={search}
              onChange={(v) => {
                setSearch(v);
                setPage(1);
              }}
              placeholder="Search by name, email, or username…"
            />
            <ToolbarSpacer />
            <span className="hidden text-xs font-bold text-[var(--muted)] sm:inline">
              {total} {total === 1 ? "customer" : "customers"}
            </span>
            <IconButton
              onClick={() => customersQuery.refetch()}
              disabled={customersQuery.isFetching}
              aria-label="Refresh"
            >
              <RefreshCw
                className={cn(
                  "size-4",
                  customersQuery.isFetching && "animate-spin",
                )}
              />
            </IconButton>
          </>
        }
        emptyState={
          hasActiveFilters ? (
            <EmptyState
              icon={Users}
              title="No matching customers"
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
              icon={Users}
              title="No customers yet"
              description="Accounts will appear here as they register."
            />
          )
        }
      />
    </div>
  );
}

// ---------------------------------------------------------------------------

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