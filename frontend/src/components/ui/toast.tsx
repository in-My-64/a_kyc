"use client";

import type { LucideIcon } from "lucide-react";
import * as React from "react";
import {
  AlertCircle,
  AlertTriangle,
  CheckCircle2,
  Info,
  X,
} from "lucide-react";

import { cn } from "@/lib/utils";
import type { ErrorSeverity } from "@/lib/errors";

// ===========================================================================
// Types
// ===========================================================================

export interface ToastAction {
  label: string;
  onClick: () => void;
}

export interface ToastItem {
  id: string;
  severity: ErrorSeverity | "success";
  title: string;
  message?: string;
  /** ms; 0 = sticky (must be manually dismissed). */
  duration?: number;
  action?: ToastAction;
}

interface ToastContextValue {
  toasts: ToastItem[];
  push: (t: Omit<ToastItem, "id">) => string;
  dismiss: (id: string) => void;
  clear: () => void;
}

const ToastContext = React.createContext<ToastContextValue | null>(null);

// ===========================================================================
// Provider
// ===========================================================================

const DEFAULT_DURATION: Record<ToastItem["severity"], number> = {
  success: 4000,
  info: 4000,
  warning: 6000,
  danger: 8000,
};

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = React.useState<ToastItem[]>([]);

  const dismiss = React.useCallback((id: string) => {
    setToasts((list) => list.filter((t) => t.id !== id));
  }, []);

  const push = React.useCallback(
    (t: Omit<ToastItem, "id">) => {
      const id = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      const item: ToastItem = {
        ...t,
        id,
        duration: t.duration ?? DEFAULT_DURATION[t.severity],
      };
      setToasts((list) => [...list, item].slice(-5)); // cap stack at 5
      return id;
    },
    [],
  );

  const clear = React.useCallback(() => setToasts([]), []);

  const value = React.useMemo(
    () => ({ toasts, push, dismiss, clear }),
    [toasts, push, dismiss, clear],
  );

  return (
    <ToastContext.Provider value={value}>
      {children}
      <ToastViewport />
    </ToastContext.Provider>
  );
}

export function useToast() {
  const ctx = React.useContext(ToastContext);
  if (!ctx) throw new Error("useToast must be used inside <ToastProvider>");
  return ctx;
}

// ===========================================================================
// Viewport
// ===========================================================================

function ToastViewport() {
  const { toasts } = React.useContext(ToastContext)!;

  return (
    <div
      role="region"
      aria-label="Notifications"
      className="pointer-events-none fixed right-4 top-4 z-[200] flex w-full max-w-[380px] flex-col gap-2"
    >
      {toasts.map((t) => (
        <Toast key={t.id} toast={t} />
      ))}
    </div>
  );
}

// ===========================================================================
// Toast
// ===========================================================================

const TONE: Record<
  ToastItem["severity"],
  { fg: string; border: string; bg: string; icon: LucideIcon }
> = {
  success: {
    fg: "text-[var(--success)]",
    border: "border-[var(--success-border)]",
    bg: "bg-[var(--success-soft)]",
    icon: CheckCircle2,
  },
  info: {
    fg: "text-[var(--info)]",
    border: "border-[var(--info-border)]",
    bg: "bg-[var(--info-soft)]",
    icon: Info,
  },
  warning: {
    fg: "text-[var(--warning)]",
    border: "border-[var(--warning-border)]",
    bg: "bg-[var(--warning-soft)]",
    icon: AlertTriangle,
  },
  danger: {
    fg: "text-[var(--danger)]",
    border: "border-[var(--danger-border)]",
    bg: "bg-[var(--danger-soft)]",
    icon: AlertCircle,
  },
};

function Toast({ toast }: { toast: ToastItem }) {
  const { dismiss } = useToast();
  const [paused, setPaused] = React.useState(false);
  const [exiting, setExiting] = React.useState(false);
  const tone = TONE[toast.severity];
  const Icon = tone.icon;

  // Auto-dismiss with pause-on-hover. The timeout is re-scheduled every
  // time `paused` toggles, which restarts the countdown from the full
  // duration on un-hover — acceptable for a toast, simpler than tracking
  // elapsed time.
  React.useEffect(() => {
    if (!toast.duration || toast.duration === 0) return;
    if (paused) return;
    const timer = setTimeout(() => handleDismiss(), toast.duration);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [paused, toast.duration]);

  function handleDismiss() {
    setExiting(true);
    setTimeout(() => dismiss(toast.id), 180);
  }

  return (
    <div
      role="status"
      aria-live="polite"
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      className={cn(
        "pointer-events-auto flex items-start gap-3 rounded-xl border bg-white p-4 shadow-[var(--shadow-lg)]",
        "transition-all duration-200 ease-out",
        exiting
          ? "translate-x-2 opacity-0"
          : "animate-in slide-in-from-right-4 fade-in",
        tone.border,
      )}
    >
      <span
        className={cn(
          "mt-0.5 grid size-8 shrink-0 place-items-center rounded-lg",
          tone.bg,
          tone.fg,
        )}
      >
        <Icon className="size-4" />
      </span>

      <div className="min-w-0 flex-1">
        <p className="text-sm font-bold leading-snug">{toast.title}</p>
        {toast.message && (
          <p className="mt-0.5 text-xs leading-relaxed text-[var(--muted)]">
            {toast.message}
          </p>
        )}
        {toast.action && (
          <button
            type="button"
            onClick={() => {
              toast.action!.onClick();
              handleDismiss();
            }}
            className="mt-2 text-xs font-bold text-[var(--primary)] hover:underline"
          >
            {toast.action.label}
          </button>
        )}
      </div>

      <button
        type="button"
        onClick={handleDismiss}
        aria-label="Dismiss notification"
        className="-mr-1 -mt-1 grid size-6 shrink-0 place-items-center rounded-md text-[var(--muted)] transition-colors hover:bg-[var(--surface-hi)] hover:text-[var(--fg)]"
      >
        <X className="size-3.5" />
      </button>
    </div>
  );
}
