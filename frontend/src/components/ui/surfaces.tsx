// src/components/ui/surfaces.tsx
"use client";

import * as React from "react";
import {
  AlertCircle,
  AlertTriangle,
  CheckCircle2,
  Info,
  Inbox,
  type LucideIcon,
} from "lucide-react";

import { cn } from "@/lib/utils";
import type { CheckStatus } from "@/lib/types";

// ---------------------------------------------------------------------------
// Card
// ---------------------------------------------------------------------------

export const Card = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement> & { interactive?: boolean }
>(({ className, interactive, ...props }, ref) => (
  <div
    ref={ref}
    className={cn(
      "rounded-xl border border-[var(--border)] bg-white shadow-[var(--shadow-xs)]",
      interactive &&
        "cursor-pointer transition-colors hover:border-[var(--primary)] hover:bg-[var(--surface-2)]",
      className,
    )}
    {...props}
  />
));
Card.displayName = "Card";

export const CardHeader = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(({ className, ...props }, ref) => (
  <div ref={ref} className={cn("flex flex-col gap-1 p-6", className)} {...props} />
));
CardHeader.displayName = "CardHeader";

export const CardTitle = React.forwardRef<
  HTMLHeadingElement,
  React.HTMLAttributes<HTMLHeadingElement>
>(({ className, ...props }, ref) => (
  <h3
    ref={ref}
    className={cn("text-base font-semibold tracking-tight", className)}
    {...props}
  />
));
CardTitle.displayName = "CardTitle";

export const CardDescription = React.forwardRef<
  HTMLParagraphElement,
  React.HTMLAttributes<HTMLParagraphElement>
>(({ className, ...props }, ref) => (
  <p ref={ref} className={cn("text-sm text-[var(--muted)]", className)} {...props} />
));
CardDescription.displayName = "CardDescription";

export const CardContent = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(({ className, ...props }, ref) => (
  <div ref={ref} className={cn("px-6 pb-6", className)} {...props} />
));
CardContent.displayName = "CardContent";

export const CardFooter = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(({ className, ...props }, ref) => (
  <div
    ref={ref}
    className={cn(
      "flex items-center gap-3 border-t border-[var(--border)] px-6 py-4",
      className,
    )}
    {...props}
  />
));
CardFooter.displayName = "CardFooter";

// ---------------------------------------------------------------------------
// Alert
// ---------------------------------------------------------------------------

type AlertTone = "info" | "success" | "warning" | "danger";

const ALERT_TONE: Record<AlertTone, { bg: string; fg: string; border: string }> = {
  info:    { bg: "var(--info-soft)",    fg: "var(--info)",    border: "var(--info-border)" },
  success: { bg: "var(--success-soft)", fg: "var(--success)", border: "var(--success-border)" },
  warning: { bg: "var(--warning-soft)", fg: "var(--warning)", border: "var(--warning-border)" },
  danger:  { bg: "var(--danger-soft)",  fg: "var(--danger)",  border: "var(--danger-border)" },
};

// LucideIcon, not React.ComponentType<{ strokeWidth?: number }>.
// Lucide types strokeWidth as `string | number`; narrowing it here
// makes every Lucide icon (Info, CheckCircle2, …) structurally
// incompatible with the alias. LucideIcon is what those icons
// actually are — use it everywhere an icon slot is declared.
const ALERT_ICON: Record<AlertTone, LucideIcon> = {
  info: Info,
  success: CheckCircle2,
  warning: AlertTriangle,
  danger: AlertCircle,
};

export interface AlertProps
  extends Omit<React.HTMLAttributes<HTMLDivElement>, "title"> {
  tone?: AlertTone;
  title?: React.ReactNode;
}

export function Alert({
  tone = "info",
  title,
  children,
  className,
  ...props
}: AlertProps) {
  const t = ALERT_TONE[tone];
  const Icon = ALERT_ICON[tone];
  return (
    <div
      role="alert"
      className={cn("flex gap-3 rounded-lg border p-4 text-sm", className)}
      style={{ background: t.bg, borderColor: t.border }}
      {...props}
    >
      <Icon className="mt-0.5 size-4 shrink-0" />
      <div className="min-w-0 flex-1">
        {title && <p className="font-medium">{title}</p>}
        {children && (
          <div className={cn("text-[var(--fg)]", title && "mt-1")}>{children}</div>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Empty state
// ---------------------------------------------------------------------------

export function EmptyState({
  icon: Icon = Inbox,
  title,
  description,
  action,
  illustration,
  className,
}: {
  icon?: LucideIcon;
  title: string;
  description?: string;
  action?: React.ReactNode;
  /** When provided, replaces the default icon circle with an SVG illustration. */
  illustration?: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center gap-4 rounded-xl border border-dashed border-[var(--border)] bg-white px-6 py-14 text-center",
        className,
      )}
    >
      {illustration ?? (
        <div className="grid size-12 place-items-center rounded-full bg-[var(--surface-hi)]">
          <Icon className="size-5 text-[var(--muted)]" />
        </div>
      )}
      <div className="max-w-sm">
        <p className="text-base font-medium">{title}</p>
        {description && (
          <p className="mt-1 text-sm text-[var(--muted)]">{description}</p>
        )}
      </div>
      {action && <div className="mt-1">{action}</div>}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Skeletons
// ---------------------------------------------------------------------------

export function Skeleton({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      aria-hidden
      className={cn("animate-pulse rounded-md bg-[var(--surface-hi)]", className)}
      {...props}
    />
  );
}

export function CardSkeleton({ className }: { className?: string }) {
  return (
    <Card className={className}>
      <CardHeader>
        <Skeleton className="h-4 w-32" />
        <Skeleton className="mt-2 h-3 w-48" />
      </CardHeader>
      <CardContent className="space-y-3">
        <Skeleton className="h-3 w-full" />
        <Skeleton className="h-3 w-5/6" />
        <Skeleton className="h-3 w-3/4" />
      </CardContent>
    </Card>
  );
}

export function TableSkeleton({
  rows = 5,
  cols = 4,
}: {
  rows?: number;
  cols?: number;
}) {
  return (
    <div className="overflow-hidden rounded-xl border border-[var(--border)] bg-white">
      <div className="divide-y divide-[var(--border)]">
        {Array.from({ length: rows }).map((_, r) => (
          <div
            key={r}
            className="grid gap-4 px-6 py-4"
            style={{ gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))` }}
          >
            {Array.from({ length: cols }).map((__, c) => (
              <Skeleton key={c} className="h-4" />
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Error surface
// ---------------------------------------------------------------------------

export function ErrorSurface({
  title = "Something went wrong",
  description,
  retry,
  children,
  className,
}: {
  title?: string;
  description?: string;
  retry?: () => void;
  children?: React.ReactNode;
  className?: string;
}) {
  return (
    <Card className={cn("p-8", className)}>
      <div className="flex flex-col items-center gap-3 text-center">
        <AlertCircle className="size-8 text-[var(--danger)]" />
        <p className="text-base font-medium">{title}</p>
        {description && (
          <p className="max-w-md text-sm text-[var(--muted)]">{description}</p>
        )}
        {retry && (
          <button
            onClick={retry}
            className="mt-2 rounded-lg border border-[var(--border)] bg-white px-4 py-2 text-sm font-medium hover:bg-[var(--surface-2)]"
          >
            Try again
          </button>
        )}
        {children}
      </div>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Stat tile — used by dashboards
// ---------------------------------------------------------------------------

export function StatTile({
  label,
  value,
  hint,
  icon: Icon,
  tone = "neutral",
  loading,
}: {
  label: string;
  value: number | string;
  hint?: string;
  icon?: LucideIcon;
  tone?: "neutral" | "info" | "warning" | "success" | "danger";
  loading?: boolean;
}) {
  const TONE: Record<string, { bg: string; fg: string }> = {
    neutral: { bg: "var(--surface-hi)",   fg: "var(--muted)" },
    info:    { bg: "var(--info-soft)",    fg: "var(--info)" },
    warning: { bg: "var(--warning-soft)", fg: "var(--warning)" },
    success: { bg: "var(--success-soft)", fg: "var(--success)" },
    danger:  { bg: "var(--danger-soft)",  fg: "var(--danger)" },
  };
  const t = TONE[tone];
  return (
    <Card className="flex items-start justify-between gap-3 p-5">
      <div className="min-w-0">
        <p className="text-xs font-medium uppercase tracking-wider text-[var(--muted)]">
          {label}
        </p>
        <div className="mt-2">
          {loading ? (
            <Skeleton className="h-8 w-16" />
          ) : (
            <p className="text-3xl font-semibold tabular-nums">
              {typeof value === "number"
                ? new Intl.NumberFormat("en-GB").format(value)
                : value}
            </p>
          )}
        </div>
        {hint && (
          <p className="mt-1 text-xs text-[var(--muted)]">{hint}</p>
        )}
      </div>
      {Icon && (
        <span
          className="grid size-10 shrink-0 place-items-center rounded-lg"
          style={{ background: t.bg, color: t.fg }}
        >
          <Icon className="size-5" />
        </span>
      )}
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Check-status icon (PASS / REVIEW / FAIL)
// ---------------------------------------------------------------------------

export function CheckStatusIcon({
  status,
  className,
}: {
  status: CheckStatus;
  className?: string;
}) {
  const Icon =
    status === "PASS" ? CheckCircle2 : status === "REVIEW" ? AlertTriangle : AlertCircle;
  const color =
    status === "PASS"
      ? "text-[var(--success)]"
      : status === "REVIEW"
      ? "text-[var(--warning)]"
      : "text-[var(--danger)]";
  return <Icon className={cn("size-4 shrink-0", color, className)} />;
}