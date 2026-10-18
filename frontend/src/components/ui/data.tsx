// src/components/ui/data.tsx
"use client";

import * as React from "react";
import {
  flexRender,
  getCoreRowModel,
  getSortedRowModel,
  useReactTable,
  type ColumnDef,
  type SortingState,
} from "@tanstack/react-table";
import {
  ArrowDown,
  ArrowUp,
  ArrowUpDown,
  ChevronLeft,
  ChevronRight,
  Search,
} from "lucide-react";

import { cn } from "@/lib/utils";

// ---------------------------------------------------------------------------
// Low-level table primitives
// ---------------------------------------------------------------------------

export function Table({
  className,
  ...props
}: React.HTMLAttributes<HTMLTableElement>) {
  return (
    <div className="w-full overflow-x-auto">
      <table
        className={cn(
          "w-full caption-bottom border-collapse text-sm",
          className,
        )}
        {...props}
      />
    </div>
  );
}

export function TableHeader({
  className,
  ...props
}: React.HTMLAttributes<HTMLTableSectionElement>) {
  return (
    <thead
      className={cn(
        "bg-[var(--surface-2)] text-left text-xs uppercase tracking-wider text-[var(--muted)]",
        "[&_tr]:border-b [&_tr]:border-[var(--border)]",
        className,
      )}
      {...props}
    />
  );
}

export function TableBody({
  className,
  ...props
}: React.HTMLAttributes<HTMLTableSectionElement>) {
  return (
    <tbody
      className={cn(
        "[&_tr:last-child]:border-0 [&_tr]:border-b [&_tr]:border-[var(--border)]",
        className,
      )}
      {...props}
    />
  );
}

export function TableRow({
  className,
  ...props
}: React.HTMLAttributes<HTMLTableRowElement>) {
  return (
    <tr
      className={cn(
        "transition-colors hover:bg-[var(--surface-2)]",
        className,
      )}
      {...props}
    />
  );
}

export function TableHead({
  className,
  ...props
}: React.ThHTMLAttributes<HTMLTableCellElement>) {
  return (
    <th
      className={cn(
        "h-10 px-6 py-3 align-middle text-xs font-medium",
        className,
      )}
      {...props}
    />
  );
}

export function TableCell({
  className,
  ...props
}: React.TdHTMLAttributes<HTMLTableCellElement>) {
  return <td className={cn("px-6 py-3 align-middle", className)} {...props} />;
}

// ---------------------------------------------------------------------------
// Column header with sort toggle
// ---------------------------------------------------------------------------

export interface ColumnHeaderProps {
  column: {
    getIsSorted: () => false | "asc" | "desc";
    toggleSorting: (desc?: boolean) => void;
    getCanSort: () => boolean;
  };
  children: React.ReactNode;
  align?: "left" | "right" | "center";
}

export function ColumnHeader({
  column,
  children,
  align = "left",
}: ColumnHeaderProps) {
  if (!column.getCanSort()) {
    return <span>{children}</span>;
  }

  const sorted = column.getIsSorted();
  const Icon =
    sorted === "asc" ? ArrowUp : sorted === "desc" ? ArrowDown : ArrowUpDown;

  return (
    <button
      type="button"
      onClick={() => column.toggleSorting(sorted === "asc")}
      className={cn(
        "inline-flex items-center gap-1.5 text-left uppercase tracking-wider transition-colors hover:text-[var(--fg)]",
        align === "right" && "flex-row-reverse",
        sorted && "text-[var(--fg)]",
      )}
    >
      <span>{children}</span>
      <Icon className="size-3 opacity-60" />
    </button>
  );
}

// ---------------------------------------------------------------------------
// Toolbar — search + spacer
// ---------------------------------------------------------------------------

export function ToolbarSearch({
  value,
  onChange,
  placeholder = "Search…",
  className,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  className?: string;
}) {
  return (
    <div className={cn("relative min-w-[200px] flex-1", className)}>
      <Search className="pointer-events-none absolute left-3 top-1/2 size-3.5 -translate-y-1/2 text-[var(--muted)]" />
      <input
        type="search"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="h-9 w-full rounded-lg border border-[var(--border)] bg-white pl-9 pr-3 text-sm placeholder:text-[var(--muted-2)] focus-visible:border-[var(--primary)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color-mix(in_oklch,var(--primary)_25%,transparent)]"
      />
    </div>
  );
}

export function ToolbarSpacer() {
  return <div className="flex-1" />;
}

// ---------------------------------------------------------------------------
// Pagination
// ---------------------------------------------------------------------------

export interface PaginationProps {
  page: number;
  pageSize: number;
  total: number;
  onPageChange: (page: number) => void;
  onPageSizeChange?: (size: number) => void;
  className?: string;
}

const PAGE_SIZE_OPTIONS = [10, 20, 50, 100];

export function Pagination({
  page,
  pageSize,
  total,
  onPageChange,
  onPageSizeChange,
  className,
}: PaginationProps) {
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const from = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const to = Math.min(page * pageSize, total);

  return (
    <div
      className={cn(
        "flex flex-wrap items-center justify-between gap-3 border-t border-[var(--border)] px-6 py-3 text-sm",
        className,
      )}
    >
      <div className="flex items-center gap-3">
        <span className="text-[var(--muted)]">
          {from}–{to} of {total}
        </span>
        {onPageSizeChange && (
          <select
            value={pageSize}
            onChange={(e) => onPageSizeChange(Number(e.target.value))}
            className="rounded-md border border-[var(--border)] bg-white px-2 py-1 text-xs"
            aria-label="Rows per page"
          >
            {PAGE_SIZE_OPTIONS.map((n) => (
              <option key={n} value={n}>
                {n} / page
              </option>
            ))}
          </select>
        )}
      </div>

      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={() => onPageChange(page - 1)}
          disabled={page <= 1}
          className="inline-flex items-center gap-1 rounded-md border border-[var(--border)] bg-white px-3 py-1.5 text-xs font-medium transition-colors hover:bg-[var(--surface-2)] disabled:opacity-40 disabled:hover:bg-white"
        >
          <ChevronLeft className="size-3.5" />
          Prev
        </button>
        <span className="text-xs text-[var(--muted)]">
          {page} / {totalPages}
        </span>
        <button
          type="button"
          onClick={() => onPageChange(page + 1)}
          disabled={page >= totalPages}
          className="inline-flex items-center gap-1 rounded-md border border-[var(--border)] bg-white px-3 py-1.5 text-xs font-medium transition-colors hover:bg-[var(--surface-2)] disabled:opacity-40 disabled:hover:bg-white"
        >
          Next
          <ChevronRight className="size-3.5" />
        </button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// DataTable
// ---------------------------------------------------------------------------

export interface DataTableProps<T> {
  columns: ColumnDef<T, unknown>[];
  data: T[];
  loading?: boolean;
  toolbar?: React.ReactNode;
  emptyState?: React.ReactNode;
  onRowClick?: (row: T) => void;
  sorting?: SortingState;
  onSortingChange?: (sorting: SortingState) => void;
  page?: number;
  pageSize?: number;
  total?: number;
  onPageChange?: (page: number) => void;
  onPageSizeChange?: (size: number) => void;
  compact?: boolean;
  className?: string;
}

export function DataTable<T>({
  columns,
  data,
  loading,
  toolbar,
  emptyState,
  onRowClick,
  sorting,
  onSortingChange,
  page,
  pageSize,
  total,
  onPageChange,
  onPageSizeChange,
  compact,
  className,
}: DataTableProps<T>) {
  const hasPagination =
    page !== undefined &&
    pageSize !== undefined &&
    total !== undefined &&
    onPageChange !== undefined;

  const table = useReactTable({
    data,
    columns,
    state: { sorting: sorting ?? [] },
    onSortingChange: onSortingChange
      ? (updater) => {
          const next =
            typeof updater === "function" ? updater(sorting ?? []) : updater;
          onSortingChange(next);
        }
      : undefined,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    manualSorting: !!onSortingChange,
    manualPagination: hasPagination,
    rowCount: hasPagination ? total : undefined,
  });

  const showEmpty = !loading && data.length === 0;
  const showTable = data.length > 0;

  return (
    <div
      className={cn(
        "overflow-hidden rounded-xl border border-[var(--border)] bg-white shadow-[var(--shadow-xs)]",
        className,
      )}
    >
      {toolbar && (
        <div className="flex flex-wrap items-center gap-3 border-b border-[var(--border)] px-6 py-4">
          {toolbar}
        </div>
      )}

      {showEmpty ? (
        <div className="p-6">{emptyState}</div>
      ) : showTable ? (
        <Table>
          <TableHeader>
            {table.getHeaderGroups().map((hg) => (
              <tr key={hg.id}>
                {hg.headers.map((h) => (
                  <TableHead key={h.id} className={cn(compact && "h-9 py-2")}>
                    {h.isPlaceholder
                      ? null
                      : flexRender(h.column.columnDef.header, h.getContext())}
                  </TableHead>
                ))}
              </tr>
            ))}
          </TableHeader>
          <TableBody>
            {table.getRowModel().rows.map((row) => (
              <TableRow
                key={row.id}
                onClick={onRowClick ? () => onRowClick(row.original) : undefined}
                className={cn(
                  onRowClick && "cursor-pointer",
                  compact && "text-[13px]",
                )}
              >
                {row.getVisibleCells().map((cell) => (
                  <TableCell key={cell.id} className={cn(compact && "py-2")}>
                    {flexRender(cell.column.columnDef.cell, cell.getContext())}
                  </TableCell>
                ))}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      ) : loading ? (
        <div className="space-y-3 p-6">
          {Array.from({ length: 5 }).map((_, i) => (
            <div
              key={i}
              className="grid gap-4"
              style={{ gridTemplateColumns: `repeat(${columns.length}, minmax(0, 1fr))` }}
            >
              {Array.from({ length: columns.length }).map((__, c) => (
                <div
                  key={c}
                  className="h-4 animate-pulse rounded bg-[var(--surface-hi)]"
                />
              ))}
            </div>
          ))}
        </div>
      ) : null}

      {hasPagination && (
        <Pagination
          page={page}
          pageSize={pageSize}
          total={total}
          onPageChange={onPageChange}
          onPageSizeChange={onPageSizeChange}
        />
      )}
    </div>
  );
}