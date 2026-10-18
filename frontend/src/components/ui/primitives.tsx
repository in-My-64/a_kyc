// src/components/ui/primitives.tsx
"use client";

import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";
import type {
  CheckStatus,
  RiskTier,
  ScreeningStatus,
  WorkflowStatus,
} from "@/lib/types";

// ---------------------------------------------------------------------------
// Spinner
// ---------------------------------------------------------------------------

export function Spinner({
  className,
  ...props
}: React.HTMLAttributes<HTMLSpanElement>) {
  return (
    <span
      role="status"
      aria-label="Loading"
      className={cn(
        "inline-block size-4 animate-spin rounded-full border-2 border-current border-t-transparent",
        className,
      )}
      {...props}
    />
  );
}

// ---------------------------------------------------------------------------
// Button
// ---------------------------------------------------------------------------

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-lg text-sm font-bold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color-mix(in_oklch,var(--primary)_30%,transparent)] disabled:pointer-events-none disabled:opacity-50 [&_svg]:size-4 [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        primary: "bg-[var(--primary)] text-white hover:bg-[var(--primary-hover)]",
        outline:
          "border border-[var(--border-hi)] bg-white text-[var(--fg)] hover:border-[var(--primary)] hover:bg-[var(--surface-2)]",
        ghost: "text-[var(--fg)] hover:bg-[var(--surface-hi)]",
        danger:
          "border border-[var(--danger)] bg-white text-[var(--danger)] hover:bg-[var(--danger-soft)]",
        success: "bg-[var(--success)] text-white hover:brightness-110",
        link: "text-[var(--primary)] underline-offset-4 hover:underline",
      },
      size: {
        sm: "h-8 px-3 text-xs",
        md: "h-10 px-4",
        lg: "h-11 px-6",
        icon: "size-9",
      },
    },
    defaultVariants: { variant: "primary", size: "md" },
  },
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  loading?: boolean;
  asChild?: boolean;
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  (
    {
      className,
      variant,
      size,
      loading,
      disabled,
      children,
      asChild,
      ...props
    },
    ref,
  ) => {
    const classes = cn(buttonVariants({ variant, size }), className);

    if (asChild) {
      return (
        <Slot ref={ref} className={classes} {...props}>
          {children}
        </Slot>
      );
    }

    return (
      <button
        ref={ref}
        disabled={disabled || loading}
        className={classes}
        {...props}
      >
        {loading ? <Spinner className="size-3.5" /> : null}
        {children}
      </button>
    );
  },
);
Button.displayName = "Button";

export const IconButton = React.forwardRef<
  HTMLButtonElement,
  Omit<ButtonProps, "size">
>(({ className, variant = "ghost", ...props }, ref) => (
  <Button
    ref={ref}
    variant={variant}
    size="icon"
    className={cn("shrink-0", className)}
    {...props}
  />
));
IconButton.displayName = "IconButton";

// ---------------------------------------------------------------------------
// Status pills
// ---------------------------------------------------------------------------

type PillTone = "neutral" | "info" | "warning" | "success" | "danger";

const PILL_TONE: Record<PillTone, { bg: string; fg: string; border: string }> = {
  neutral: { bg: "var(--surface-hi)",   fg: "var(--muted)",   border: "var(--border)" },
  info:    { bg: "var(--info-soft)",    fg: "var(--info)",    border: "var(--info-border)" },
  warning: { bg: "var(--warning-soft)", fg: "var(--warning)", border: "var(--warning-border)" },
  success: { bg: "var(--success-soft)", fg: "var(--success)", border: "var(--success-border)" },
  danger:  { bg: "var(--danger-soft)",  fg: "var(--danger)",  border: "var(--danger-border)" },
};

export interface StatusPillProps extends React.HTMLAttributes<HTMLSpanElement> {
  tone?: PillTone;
  size?: "sm" | "md";
}

export function StatusPill({
  tone = "neutral",
  size = "md",
  children,
  className,
  ...props
}: StatusPillProps) {
  const t = PILL_TONE[tone];
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full border font-bold",
        size === "sm" ? "px-2 py-0 text-[10px]" : "px-2.5 py-0.5 text-xs",
        className,
      )}
      style={{ background: t.bg, color: t.fg, borderColor: t.border }}
      {...props}
    >
      {children}
    </span>
  );
}

// ---------------------------------------------------------------------------
// Domain status pills
// ---------------------------------------------------------------------------

const WORKFLOW_TONE: Record<WorkflowStatus, PillTone> = {
  PENDING: "neutral",
  IN_PROGRESS: "info",
  COMPLETED: "success",
  FAILED: "danger",
};

const WORKFLOW_LABEL: Record<WorkflowStatus, string> = {
  PENDING: "Pending",
  IN_PROGRESS: "In Progress",
  COMPLETED: "Completed",
  FAILED: "Failed",
};

export function WorkflowStatusPill({ status }: { status: WorkflowStatus }) {
  return (
    <StatusPill tone={WORKFLOW_TONE[status]}>{WORKFLOW_LABEL[status]}</StatusPill>
  );
}

const SCREENING_TONE: Record<ScreeningStatus, PillTone> = {
  CLEAR: "success",
  FLAGGED: "warning",
  MATCH: "danger",
};

const SCREENING_LABEL: Record<ScreeningStatus, string> = {
  CLEAR: "Clear",
  FLAGGED: "Flagged",
  MATCH: "Match",
};

export function ScreeningStatusPill({ status }: { status: ScreeningStatus }) {
  return (
    <StatusPill tone={SCREENING_TONE[status]}>{SCREENING_LABEL[status]}</StatusPill>
  );
}

const CHECK_TONE: Record<CheckStatus, PillTone> = {
  PASS: "success",
  REVIEW: "warning",
  FAIL: "danger",
};

const CHECK_LABEL: Record<CheckStatus, string> = {
  PASS: "Pass",
  REVIEW: "Review",
  FAIL: "Fail",
};

export function CheckStatusPill({ status }: { status: CheckStatus }) {
  return <StatusPill tone={CHECK_TONE[status]}>{CHECK_LABEL[status]}</StatusPill>;
}

const RISK_TONE: Record<RiskTier, PillTone> = {
  LOW: "success",
  MEDIUM: "warning",
  HIGH: "danger",
};

export function RiskTierPill({ tier }: { tier: RiskTier }) {
  return <StatusPill tone={RISK_TONE[tier]}>{tier}</StatusPill>;
}

// ---------------------------------------------------------------------------
// Separator
// ---------------------------------------------------------------------------

export function Separator({
  className,
  orientation = "horizontal",
  ...props
}: React.HTMLAttributes<HTMLDivElement> & {
  orientation?: "horizontal" | "vertical";
}) {
  return (
    <div
      role="separator"
      aria-orientation={orientation}
      className={cn(
        "shrink-0 bg-[var(--border)]",
        orientation === "horizontal" ? "h-px w-full" : "h-full w-px",
        className,
      )}
      {...props}
    />
  );
}

// ---------------------------------------------------------------------------
// Status dot
// ---------------------------------------------------------------------------

export function StatusDot({
  tone = "neutral",
  pulse = false,
  className,
}: {
  tone?: PillTone;
  pulse?: boolean;
  className?: string;
}) {
  const colors: Record<PillTone, string> = {
    neutral: "bg-[var(--muted)]",
    info: "bg-[var(--info)]",
    warning: "bg-[var(--warning)]",
    success: "bg-[var(--success)]",
    danger: "bg-[var(--danger)]",
  };
  return (
    <span className={cn("relative inline-flex size-2", className)}>
      {pulse && (
        <span
          className={cn(
            "absolute inline-flex h-full w-full animate-ping rounded-full opacity-75",
            colors[tone],
          )}
        />
      )}
      <span
        className={cn("relative inline-flex size-2 rounded-full", colors[tone])}
      />
    </span>
  );
}