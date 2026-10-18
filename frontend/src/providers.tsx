// src/providers.tsx
"use client";

import {
  QueryClient,
  QueryClientProvider,
  type DefaultOptions,
} from "@tanstack/react-query";
import { useState, type ReactNode } from "react";

import { ApiError } from "@/lib/api";
import { ErrorBoundary } from "@/components/layout/error-boundary";
import { ToastProvider } from "@/components/ui/toast";
import { ErrorModalProvider } from "@/components/ui/error-modal";

const defaultOptions: DefaultOptions = {
  queries: {
    staleTime: 30_000,
    refetchOnWindowFocus: false,
    retry: (failureCount, error) => {
      // Never retry on auth/permission/not-found — those don't get
      // better by repeating the request.
      if (error instanceof ApiError) {
        if (error.status === 401 || error.status === 403 || error.status === 404) {
          return false;
        }
      }
      return failureCount < 2;
    },
  },
  mutations: {
    retry: false,
  },
};

/**
 * Provider stack, outermost → innermost:
 *
 *   ErrorBoundary      catches render crashes anywhere below
 *   QueryClient        caches server state
 *   ErrorModalProvider provides the global alert dialog
 *   ToastProvider      provides the non-blocking notification queue
 *
 * The error-modal context sits above toast so that a modal-triggering
 * component can also push a toast without ordering issues.
 */
export function Providers({ children }: { children: ReactNode }) {
  const [client] = useState(() => new QueryClient({ defaultOptions }));

  return (
    <ErrorBoundary>
      <QueryClientProvider client={client}>
        <ErrorModalProvider>
          <ToastProvider>{children}</ToastProvider>
        </ErrorModalProvider>
      </QueryClientProvider>
    </ErrorBoundary>
  );
}
