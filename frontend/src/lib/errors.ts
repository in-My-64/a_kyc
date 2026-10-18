// src/lib/errors.ts
/**
 * Single source of truth for translating anything thrown at the client
 * into a user-facing message + a severity. Everything else (toast,
 * modal, inline field error) reads from here.
 */

import { ApiError } from "./api";

export type ErrorSeverity = "info" | "warning" | "danger";

export interface UserFacingError {
  severity: ErrorSeverity;
  title: string;
  message: string;
  /** Optional reference for support — tracking IDs, HTTP codes, digests. */
  reference?: string;
  /** True when retrying the same request could plausibly succeed. */
  retryable: boolean;
  /** True when the session has expired; caller should redirect to /login. */
  sessionExpired: boolean;
}

// ---------------------------------------------------------------------------
// Classification
// ---------------------------------------------------------------------------

export function classifyError(err: unknown): UserFacingError {
  // Network failure — fetch threw before we got any HTTP status.
  if (err instanceof TypeError && /fetch|network/i.test(err.message)) {
    return {
      severity: "danger",
      title: "Can't reach the server",
      message: "Check your internet connection and try again.",
      retryable: true,
      sessionExpired: false,
    };
  }

  // Abort — user navigated away, request cancelled. Not a real error.
  if (err instanceof DOMException && err.name === "AbortError") {
    return {
      severity: "info",
      title: "Request cancelled",
      message: "",
      retryable: false,
      sessionExpired: false,
    };
  }

  // Structured API error.
  if (err instanceof ApiError) {
    return classifyApiError(err);
  }

  // Anything else — a JavaScript error we didn't anticipate.
  const message =
    err instanceof Error && err.message
      ? err.message
      : "An unexpected error occurred.";
  return {
    severity: "danger",
    title: "Something went wrong",
    message,
    retryable: true,
    sessionExpired: false,
  };
}

function classifyApiError(err: ApiError): UserFacingError {
  const status = err.status;

  // Session/auth
  if (status === 401) {
    return {
      severity: "warning",
      title: "Your session expired",
      message: "Sign in again to continue.",
      reference: `HTTP 401`,
      retryable: false,
      sessionExpired: true,
    };
  }
  if (status === 403) {
    return {
      severity: "warning",
      title: "Not authorised",
      message: "You don't have permission to do that.",
      reference: `HTTP 403`,
      retryable: false,
      sessionExpired: false,
    };
  }

  // Client-side
  if (status === 400) {
    return {
      severity: "warning",
      title: "Check your input",
      message: err.message || "Please fix the highlighted fields.",
      reference: `HTTP 400`,
      retryable: false,
      sessionExpired: false,
    };
  }
  if (status === 404) {
    return {
      severity: "info",
      title: "Not found",
      message: err.message || "The requested resource doesn't exist.",
      reference: `HTTP 404`,
      retryable: false,
      sessionExpired: false,
    };
  }
  if (status === 409) {
    return {
      severity: "warning",
      title: "Conflict",
      message: err.message || "This action conflicts with existing data.",
      reference: `HTTP 409`,
      retryable: false,
      sessionExpired: false,
    };
  }
  if (status === 413) {
    return {
      severity: "warning",
      title: "File too large",
      message: err.message || "Reduce the file size and try again.",
      reference: `HTTP 413`,
      retryable: false,
      sessionExpired: false,
    };
  }
  if (status === 422) {
    return {
      severity: "warning",
      title: "Couldn't process",
      message: err.message || "Please check your input and try again.",
      reference: `HTTP 422`,
      retryable: false,
      sessionExpired: false,
    };
  }
  if (status === 429) {
    return {
      severity: "warning",
      title: "Too many requests",
      message: "Please wait a moment and try again.",
      reference: `HTTP 429`,
      retryable: true,
      sessionExpired: false,
    };
  }

  // Server-side
  if (status >= 500) {
    return {
      severity: "danger",
      title: "Server error",
      message:
        err.message || "Something went wrong on our end. Try again shortly.",
      reference: `HTTP ${status}`,
      retryable: true,
      sessionExpired: false,
    };
  }

  // Unknown status
  return {
    severity: "danger",
    title: "Request failed",
    message: err.message || "Please try again.",
    reference: `HTTP ${status}`,
    retryable: true,
    sessionExpired: false,
  };
}

// ---------------------------------------------------------------------------
// Convenience — dedupe by title+message so identical errors don't stack
// ---------------------------------------------------------------------------

export function errorKey(e: UserFacingError): string {
  return `${e.title}::${e.message}`;
}
