"use client";

import * as React from "react";
import { AlertOctagon, RefreshCw } from "lucide-react";

import { Button } from "@/components/ui/primitives";

interface Props {
  children: React.ReactNode;
  /** Rendered instead of the default fallback when provided. */
  fallback?: React.ReactNode;
}

interface State {
  error: Error | null;
  errorInfo: React.ErrorInfo | null;
}

/**
 * Top-level React error boundary. Catches render-phase exceptions
 * anywhere below it and shows a recoverable fallback.
 *
 * We deliberately do NOT auto-report to a backend here — sending a
 * crash payload requires auth, which may itself be broken. The digest
 * is shown to the user so they can paste it into a support ticket,
 * and the console receives the full stack in development.
 */
export class ErrorBoundary extends React.Component<Props, State> {
  state: State = { error: null, errorInfo: null };

  static getDerivedStateFromError(error: Error): Partial<State> {
    return { error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    this.setState({ errorInfo });
    // Always log to console so dev tooling / error overlay sees it.
    // In production this would forward to Sentry — wire it in the
    // `reportError` helper below.
    // eslint-disable-next-line no-console
    console.error("[ErrorBoundary]", error, errorInfo);
  }

  reset = () => {
    this.setState({ error: null, errorInfo: null });
  };

  reload = () => {
    if (typeof window !== "undefined") {
      window.location.reload();
    }
  };

  render() {
    if (!this.state.error) {
      return this.props.children;
    }

    if (this.props.fallback) {
      return this.props.fallback;
    }

    const digest = hashError(this.state.error);

    return (
      <div className="grid min-h-screen place-items-center bg-[var(--bg)] p-6">
        <div className="w-full max-w-md rounded-2xl border border-[var(--border)] bg-white p-8 shadow-[var(--shadow-lg)]">
          <div className="flex flex-col items-center text-center">
            <span className="grid size-12 place-items-center rounded-xl bg-[var(--danger-soft)] text-[var(--danger)]">
              <AlertOctagon className="size-6" />
            </span>
            <h1 className="mt-4 text-xl font-extrabold tracking-tight">
              Something went wrong
            </h1>
            <p className="mt-2 max-w-sm text-sm leading-relaxed text-[var(--muted)]">
              An unexpected error interrupted this page. Reload to
              recover, or copy the reference below if you need to
              contact support.
            </p>

            {digest && (
              <div className="mt-4 rounded-md border border-[var(--border)] bg-[var(--surface-2)] px-3 py-1.5 font-mono text-[10px] font-bold uppercase tracking-widest text-[var(--muted)]">
                {digest}
              </div>
            )}

            {process.env.NODE_ENV !== "production" && this.state.error && (
              <details className="mt-4 w-full text-left">
                <summary className="cursor-pointer text-xs text-[var(--muted)] hover:text-[var(--fg)]">
                  Show technical details
                </summary>
                <pre className="mt-2 max-h-48 overflow-auto whitespace-pre-wrap break-words rounded-md border border-[var(--border)] bg-[var(--surface-2)] p-3 font-mono text-[10px] leading-relaxed">
                  {this.state.error.stack ?? this.state.error.message}
                </pre>
              </details>
            )}
          </div>

          <div className="mt-6 flex flex-col gap-2">
            <Button onClick={this.reload} className="w-full">
              <RefreshCw className="size-3.5" />
              Reload page
            </Button>
            <Button
              onClick={this.reset}
              variant="ghost"
              className="w-full"
            >
              Try without reloading
            </Button>
          </div>
        </div>
      </div>
    );
  }
}

/**
 * Deterministic short digest from an error message + stack. Stable
 * across renders so the user sees the same reference for the same
 * crash; matches the reference format a support engineer would expect.
 */
function hashError(err: Error): string {
  const input = `${err.name}:${err.message}`;
  let h = 0;
  for (let i = 0; i < input.length; i++) {
    h = (h << 5) - h + input.charCodeAt(i);
    h |= 0;
  }
  return `ERR-${Math.abs(h).toString(16).toUpperCase().padStart(8, "0")}`;
}
