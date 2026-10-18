// src/lib/use-error-handler.ts
"use client";

import { useCallback, useEffect, useRef } from "react";
import { useRouter } from "next/router";

import { classifyError, errorKey } from "./errors";
import { useToast } from "@/components/ui/toast";
import { useErrorModal } from "@/components/ui/error-modal";

/**
 * Single place every page uses to turn a thrown error into a
 * user-facing toast, modal, or redirect.
 *
 * Policy:
 *   · session expired          → redirect to /login, no other UI
 *   · severity === "danger"    → error modal (blocking, needs ack)
 *   · everything else          → toast (non-blocking, auto-dismiss)
 *   · retry callback provided  → "Try again" button appears
 *
 * The hook also exposes `reportQueryError`, which is meant to be
 * called from a useEffect on any query's `error` value. It dedupes
 * by message so a re-rendering query doesn't fire the same toast on
 * every render.
 */
export function useErrorHandler() {
  const toast = useToast();
  const modal = useErrorModal();
  const router = useRouter();

  // Per-hook dedup. Keyed by title+message so the same underlying
  // failure doesn't spam the toast stack.
  const lastReportedRef = useRef<string | null>(null);

  const report = useCallback(
    (
      err: unknown,
      opts: {
        retry?: () => void;
        /** Force the toast path even for danger-severity errors. */
        preferToast?: boolean;
      } = {},
    ) => {
      const classified = classifyError(err);

      // Aborted requests are not errors — user navigated away.
      if (classified.title === "Request cancelled") return;

      if (classified.sessionExpired) {
        router.replace("/login");
        return;
      }

      const wantsModal = classified.severity === "danger" && !opts.preferToast;

      if (wantsModal) {
        modal.show({
          severity: classified.severity,
          title: classified.title,
          message: classified.message,
          reference: classified.reference,
          onRetry: opts.retry && classified.retryable ? opts.retry : undefined,
        });
      } else {
        toast.push({
          severity: classified.severity,
          title: classified.title,
          message: classified.message,
          action:
            opts.retry && classified.retryable
              ? { label: "Retry", onClick: opts.retry }
              : undefined,
        });
      }
    },
    [toast, modal, router],
  );

  /**
   * Convenience for query error effects. Call from a useEffect that
   * watches a query's `error` value; it fires at most once per unique
   * error message per mount.
   */
  const reportQueryError = useCallback(
    (err: unknown, retry?: () => void) => {
      if (!err) return;
      const classified = classifyError(err);
      const key = errorKey(classified);
      if (key === lastReportedRef.current) return;
      lastReportedRef.current = key;
      report(err, { retry, preferToast: true });
    },
    [report],
  );

  /** Reset the dedupe key — call this when the user takes an action that
   *  should allow the same error to surface again. */
  const reset = useCallback(() => {
    lastReportedRef.current = null;
  }, []);

  return { report, reportQueryError, reset };
}

/**
 * Run `reportQueryError` automatically for a React Query result.
 * Wraps the common pattern:
 *
 *     const query = useQuery(...)
 *     useQueryErrorToast(query, () => query.refetch())
 */
export function useQueryErrorToast(
  query: { error: unknown; refetch: () => void },
  retry?: () => void,
) {
  const { reportQueryError } = useErrorHandler();
  useEffect(() => {
    if (query.error) {
      reportQueryError(query.error, retry ?? query.refetch);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query.error]);
}
