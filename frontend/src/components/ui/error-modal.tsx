"use client";

import * as React from "react";
import {
  AlertCircle,
  AlertTriangle,
  ArrowLeft,
  ArrowRight,
  Check,
  Copy,
  Info,
  LogIn,
  RefreshCw,
  Upload,
  X,
  type LucideIcon,
} from "lucide-react";

import { cn } from "@/lib/utils";
import { Button } from "./primitives";
import type { ErrorSeverity } from "@/lib/errors";

// ===========================================================================
// Types
// ===========================================================================

export interface ErrorModalAction {
  label: string;
  onClick: () => void;
  variant?: "primary" | "outline" | "ghost" | "danger";
  /**
   * LucideIcon, not a hand-rolled ComponentType. Lucide's own type is
   * what the imported icons actually have; assigning `typeof RefreshCw`
   * to a narrower `ComponentType<{ strokeWidth?: number }>` alias fails
   * because Lucide types strokeWidth as `string | number`.
   */
  icon?: LucideIcon;
}

export interface ErrorModalMeta {
  label: string;
  value: string;
  mono?: boolean;
}

export interface ErrorModalPayload {
  severity: ErrorSeverity;
  title: string;
  message: string;
  reference?: string;
  details?: string[];
  meta?: ErrorModalMeta[];
  onRetry?: () => void;
  actions?: ErrorModalAction[];
}

interface ErrorModalContextValue {
  show: (payload: ErrorModalPayload) => void;
  close: () => void;
}

const ErrorModalContext = React.createContext<ErrorModalContextValue | null>(null);

// ===========================================================================
// Provider
// ===========================================================================

export function ErrorModalProvider({ children }: { children: React.ReactNode }) {
  const [payload, setPayload] = React.useState<ErrorModalPayload | null>(null);

  const show = React.useCallback((p: ErrorModalPayload) => setPayload(p), []);
  const close = React.useCallback(() => setPayload(null), []);

  const value = React.useMemo(() => ({ show, close }), [show, close]);

  return (
    <ErrorModalContext.Provider value={value}>
      {children}
      {payload && <ErrorModal payload={payload} onClose={close} />}
    </ErrorModalContext.Provider>
  );
}

export function useErrorModal() {
  const ctx = React.useContext(ErrorModalContext);
  if (!ctx) {
    throw new Error("useErrorModal must be used inside <ErrorModalProvider>");
  }
  return ctx;
}

// ===========================================================================
// Tone
// ===========================================================================

const TONE: Record<
  ErrorSeverity,
  {
    icon: LucideIcon;
    iconFg: string;
    iconBg: string;
    iconBorder: string;
    accentBar: string;
    glow: string;
    chipBg: string;
    chipFg: string;
    bulletFg: string;
    label: string;
  }
> = {
  info: {
    icon: Info,
    iconFg: "text-[var(--info)]",
    iconBg: "bg-[var(--info-soft)]",
    iconBorder: "border-[var(--info-border)]",
    accentBar: "bg-[var(--info)]",
    glow: "radial-gradient(800px 240px at 50% 0%, color-mix(in oklch, var(--info) 10%, transparent), transparent 70%)",
    chipBg: "bg-[var(--info-soft)]",
    chipFg: "text-[var(--info)]",
    bulletFg: "bg-[var(--info)]",
    label: "Notice",
  },
  warning: {
    icon: AlertTriangle,
    iconFg: "text-[var(--warning)]",
    iconBg: "bg-[var(--warning-soft)]",
    iconBorder: "border-[var(--warning-border)]",
    accentBar: "bg-[var(--warning)]",
    glow: "radial-gradient(800px 240px at 50% 0%, color-mix(in oklch, var(--warning) 12%, transparent), transparent 70%)",
    chipBg: "bg-[var(--warning-soft)]",
    chipFg: "text-[var(--warning)]",
    bulletFg: "bg-[var(--warning)]",
    label: "Warning",
  },
  danger: {
    icon: AlertCircle,
    iconFg: "text-[var(--danger)]",
    iconBg: "bg-[var(--danger-soft)]",
    iconBorder: "border-[var(--danger-border)]",
    accentBar: "bg-[var(--danger)]",
    glow: "radial-gradient(800px 240px at 50% 0%, color-mix(in oklch, var(--danger) 12%, transparent), transparent 70%)",
    chipBg: "bg-[var(--danger-soft)]",
    chipFg: "text-[var(--danger)]",
    bulletFg: "bg-[var(--danger)]",
    label: "Error",
  },
};

// ===========================================================================
// Default action icons
// ===========================================================================

function defaultActionIcon(
  label: string,
  isPrimary: boolean,
): LucideIcon | undefined {
  const l = label.toLowerCase();
  if (l.includes("retry") || l.includes("try again")) return RefreshCw;
  if (l.includes("sign in") || l.includes("log in")) return LogIn;
  if (l.includes("upload") || l.includes("different")) return Upload;
  if (l.includes("back") || l.includes("applications") || l.includes("cancel"))
    return ArrowLeft;
  if (isPrimary) return ArrowRight;
  return undefined;
}

// ===========================================================================
// Modal
// ===========================================================================

function ErrorModal({
  payload,
  onClose,
}: {
  payload: ErrorModalPayload;
  onClose: () => void;
}) {
  const [copied, setCopied] = React.useState(false);
  const dialogRef = React.useRef<HTMLDivElement>(null);
  const confirmRef = React.useRef<HTMLButtonElement>(null);
  const tone = TONE[payload.severity];
  const Icon = tone.icon;

  const hasMeta = Boolean(payload.meta && payload.meta.length > 0);
  const hasDetails = Boolean(payload.details && payload.details.length > 0);
  const hasReference = Boolean(payload.reference);

  // ---- Focus + keyboard ---------------------------------------------------

  React.useEffect(() => {
    confirmRef.current?.focus();
  }, []);

  React.useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") {
        e.preventDefault();
        onClose();
        return;
      }
      if (e.key === "Tab") {
        const focusables = dialogRef.current?.querySelectorAll<HTMLElement>(
          'button:not([disabled]), [href], input, select, textarea, [tabindex]:not([tabindex="-1"])',
        );
        if (!focusables || focusables.length === 0) return;
        const first = focusables[0];
        const last = focusables[focusables.length - 1];
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  // ---- Body scroll lock ---------------------------------------------------

  React.useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, []);

  // ---- Reference copy -----------------------------------------------------

  async function copyReference() {
    if (!payload.reference) return;
    try {
      await navigator.clipboard.writeText(payload.reference);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      /* clipboard unavailable */
    }
  }

  // ---- Actions ------------------------------------------------------------

  const actions: ErrorModalAction[] = payload.actions?.length
    ? payload.actions
    : [
        ...(payload.onRetry
          ? [
              {
                label: "Try again",
                onClick: payload.onRetry,
                variant: "outline" as const,
                icon: RefreshCw,
              },
            ]
          : []),
        {
          label: "Got it",
          onClick: () => {},
          variant: "primary" as const,
          icon: Check,
        },
      ];

  // Sort so primary lands on the right on desktop; layout order is
  // preserved so it reads left-to-right as [secondary, ..., primary].
  const primaryIndex = (() => {
    for (let i = actions.length - 1; i >= 0; i--) {
      if (actions[i].variant === "primary" || actions[i].variant === undefined) {
        return i;
      }
    }
    return actions.length - 1;
  })();

  return (
    <div className="fixed inset-0 z-[150] grid place-items-center p-4 sm:p-6">
      {/* Backdrop */}
      <div
        aria-hidden
        onClick={onClose}
        className="absolute inset-0 animate-in bg-black/60 backdrop-blur-md fade-in duration-200"
      />

      {/* Dialog — widened to 580px, max 90vh tall, internally scrollable */}
      <div
        ref={dialogRef}
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="error-modal-title"
        aria-describedby="error-modal-message"
        className={cn(
          "relative flex w-full max-w-[580px] max-h-[90vh] flex-col overflow-hidden rounded-2xl",
          "border border-[var(--border)] bg-white",
          "shadow-[0_40px_100px_-20px_rgba(15,23,42,0.45),0_12px_32px_-8px_rgba(15,23,42,0.15)]",
          "animate-in fade-in zoom-in-95 duration-200",
        )}
      >
        {/* Ambient glow — bounded to the header area */}
        <div
          aria-hidden
          className="pointer-events-none absolute inset-x-0 top-0 h-56"
          style={{ background: tone.glow }}
        />

        {/* Accent bar — full width, subtle gradient */}
        <div className="relative h-1 w-full shrink-0 overflow-hidden">
          <div className={cn("absolute inset-0", tone.accentBar)} />
          <div
            aria-hidden
            className="absolute inset-0 bg-gradient-to-r from-transparent via-white/40 to-transparent"
          />
        </div>

        {/* ---- Header ------------------------------------------------- */}
        <div className="relative flex shrink-0 items-start gap-5 px-8 pb-6 pt-7">
          <span
            className={cn(
              "grid size-14 shrink-0 place-items-center rounded-2xl border-2",
              tone.iconBg,
              tone.iconBorder,
            )}
          >
            <Icon className={cn("size-6", tone.iconFg)} strokeWidth={2.5} />
          </span>

          <div className="min-w-0 flex-1 pt-0.5">
            <div className="flex items-center gap-2">
              <span
                className={cn(
                  "inline-flex items-center rounded-full px-2.5 py-0.5 text-[10px] font-extrabold uppercase tracking-[0.14em]",
                  tone.chipBg,
                  tone.chipFg,
                )}
              >
                {tone.label}
              </span>
              {hasReference && (
                <button
                  type="button"
                  onClick={copyReference}
                  title="Copy reference"
                  className="group inline-flex items-center gap-2 rounded-full border border-[var(--border)] bg-white px-2.5 py-0.5 font-mono text-[10px] font-extrabold uppercase tracking-[0.14em] text-[var(--muted)] transition-colors hover:border-[var(--border-hi)] hover:bg-[var(--surface-2)] hover:text-[var(--fg)]"
                >
                  <span>{payload.reference}</span>
                  {copied ? (
                    <Check className="size-3 text-[var(--success)]" strokeWidth={3} />
                  ) : (
                    <Copy className="size-3 opacity-60 transition-opacity group-hover:opacity-100" />
                  )}
                </button>
              )}
            </div>

            <h2
              id="error-modal-title"
              className="mt-3 text-[22px] font-extrabold leading-[1.25] tracking-tight text-[var(--fg)]"
            >
              {payload.title}
            </h2>
          </div>

          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="grid size-8 shrink-0 place-items-center rounded-lg border border-transparent text-[var(--muted)] transition-colors hover:border-[var(--border)] hover:bg-[var(--surface-2)] hover:text-[var(--fg)]"
          >
            <X className="size-4" />
          </button>
        </div>

        {/* ---- Body --------------------------------------------------- */}
        <div className="relative min-h-0 flex-1 overflow-y-auto px-8 pb-7">
          {payload.message && (
            <p
              id="error-modal-message"
              className="text-[15px] font-medium leading-[1.6] text-[var(--fg)]"
            >
              {payload.message}
            </p>
          )}

          {/* Meta — values wrap, not truncate */}
          {hasMeta && (
            <dl
              className={cn(
                "mt-6 overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--surface-2)]",
                !payload.message && "mt-0",
              )}
            >
              {payload.meta!.map((row, i) => (
                <div
                  key={row.label}
                  className={cn(
                    "grid grid-cols-[110px_1fr] items-baseline gap-4 px-4 py-3.5",
                    i > 0 && "border-t border-[var(--border)]",
                  )}
                >
                  <dt className="text-[10px] font-extrabold uppercase tracking-[0.14em] text-[var(--muted-2)]">
                    {row.label}
                  </dt>
                  <dd
                    className={cn(
                      "min-w-0 break-words text-right text-sm font-bold leading-relaxed text-[var(--fg)]",
                      row.mono && "font-mono text-[13px] font-semibold",
                    )}
                  >
                    {row.value}
                  </dd>
                </div>
              ))}
            </dl>
          )}

          {/* Details bullets */}
          {hasDetails && (
            <ul className={cn("space-y-3", (payload.message || hasMeta) && "mt-6")}>
              {payload.details!.map((d, i) => (
                <li
                  key={`${i}-${d.slice(0, 12)}`}
                  className="flex items-start gap-3 text-[14px] leading-[1.6] text-[var(--muted)]"
                >
                  <span
                    className={cn(
                      "mt-2 size-1.5 shrink-0 rounded-full",
                      tone.bulletFg,
                    )}
                  />
                  <span className="min-w-0 flex-1">{d}</span>
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* ---- Footer ------------------------------------------------- */}
        <div className="relative shrink-0 border-t border-[var(--border)] bg-[var(--surface-2)] px-8 py-5">
          <div className="flex flex-wrap items-center justify-end gap-2">
            {actions.map((action, i) => {
              const isPrimary = i === primaryIndex;
              const ActionIcon =
                action.icon ?? defaultActionIcon(action.label, isPrimary);
              return (
                <Button
                  key={`${action.label}-${i}`}
                  ref={isPrimary ? confirmRef : undefined}
                  variant={action.variant ?? (isPrimary ? "primary" : "outline")}
                  size="md"
                  onClick={() => {
                    onClose();
                    action.onClick();
                  }}
                  className={cn(
                    "w-full justify-center sm:w-auto",
                    isPrimary && "sm:min-w-[140px]",
                  )}
                >
                  {ActionIcon && (
                    <ActionIcon
                      className={cn(
                        "size-4 shrink-0",
                        isPrimary && !action.icon && "order-last",
                      )}
                    />
                  )}
                  {action.label}
                </Button>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}