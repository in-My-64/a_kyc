// src/lib/hooks.ts
"use client";

import {
  useMutation,
  useQuery,
  useQueryClient,
  type UseMutationOptions,
  type UseQueryOptions,
} from "@tanstack/react-query";
import { useEffect, useState } from "react";

import { ApiError } from "./api";
import { apiMap } from "./endpoints";
import type {
  AuditListParams,
  CustomerListParams,
  CustomerRead,
  CustomerRegisterInput,
  CustomerUpdateInput,
  DocType,
  DocumentListParams,
        LoginInput,
  ParsedDocumentListParams,
  PasswordChangeInput,
  StartKycInput,
  WorkflowListParams,
} from "./types";

// ---------------------------------------------------------------------------
// Query keys
// ---------------------------------------------------------------------------

export const qk = {
  me: ["customers", "me"] as const,
  selfies: {
    all: ["selfies"] as const,
    detail: (id: number) => ["selfies", "detail", id] as const,
  },
  customers: {
    all: ["customers"] as const,
    list: (p: CustomerListParams) => ["customers", "list", p] as const,
    detail: (id: number) => ["customers", "detail", id] as const,
    cleared: (p: CustomerListParams) => ["customers", "cleared", p] as const,
    flagged: (p: CustomerListParams) => ["customers", "flagged", p] as const,
    overview: (id: number) => ["customers", "overview", id] as const,
  },
  documents: {
    all: ["documents"] as const,
    list: (p: DocumentListParams) => ["documents", "list", p] as const,
    detail: (id: number) => ["documents", "detail", id] as const,
  },
  parsedDocuments: {
    all: ["parsed-documents"] as const,
    list: (p: ParsedDocumentListParams) =>
      ["parsed-documents", "list", p] as const,
    detail: (id: number) => ["parsed-documents", "detail", id] as const,
  },
  screenings: {
    all: ["screenings"] as const,
    list: (p: Record<string, unknown>) => ["screenings", "list", p] as const,
    detail: (id: number) => ["screenings", "detail", id] as const,
  },
  risk: {
    all: ["risk"] as const,
    list: (p: Record<string, unknown>) => ["risk", "list", p] as const,
    detail: (id: number) => ["risk", "detail", id] as const,
  },
  evidence: {
    all: ["evidence"] as const,
    list: (p: Record<string, unknown>) => ["evidence", "list", p] as const,
    detail: (id: number) => ["evidence", "detail", id] as const,
  },
  audit: {
    all: ["audit"] as const,
    list: (p: AuditListParams) => ["audit", "list", p] as const,
    detail: (id: number) => ["audit", "detail", id] as const,
  },
  workflows: {
    all: ["workflows"] as const,
    list: (p: WorkflowListParams) => ["workflows", "list", p] as const,
    status: (trackingId: string) =>
      ["workflows", "status", trackingId] as const,
    health: ["workflows", "health"] as const,
    outstandingMoreInfo: ["workflows", "outstanding-more-info"] as const,
  },
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

export function useDebounce<T>(value: T, ms = 300): T {
  const [v, setV] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setV(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return v;
}

type QueryOpts<T> = Omit<UseQueryOptions<T, Error>, "queryKey" | "queryFn">;
type MutOpts<TData, TVars> = Omit<
  UseMutationOptions<TData, Error, TVars>,
  "mutationFn"
>;

// ---------------------------------------------------------------------------
// Customers
// ---------------------------------------------------------------------------

export function useMe(opts: QueryOpts<Awaited<ReturnType<typeof apiMap.customers.me>>> = {}) {
  return useQuery({
    queryKey: qk.me,
    queryFn: () => apiMap.customers.me(),
    ...opts,
  });
}

export function useCustomers(params: CustomerListParams, opts: QueryOpts<Awaited<ReturnType<typeof apiMap.customers.list>>> = {}) {
  return useQuery({
    queryKey: qk.customers.list(params),
    queryFn: () => apiMap.customers.list(params),
    placeholderData: (prev) => prev,
    ...opts,
  });
}

export function useCustomer(id: number | null | undefined, opts: QueryOpts<Awaited<ReturnType<typeof apiMap.customers.detail>>> = {}) {
  return useQuery({
    queryKey: qk.customers.detail(id ?? 0),
    queryFn: () => apiMap.customers.detail(id!),
    enabled: typeof id === "number" && id > 0,
    ...opts,
  });
}

export function useCustomerOverview(id: number | null | undefined, opts: QueryOpts<Awaited<ReturnType<typeof apiMap.customers.overview>>> = {}) {
  return useQuery({
    queryKey: qk.customers.overview(id ?? 0),
    queryFn: () => apiMap.customers.overview(id!),
    enabled: typeof id === "number" && id > 0,
    ...opts,
  });
}

export function useClearedCustomers(params: CustomerListParams = {}, opts: QueryOpts<Awaited<ReturnType<typeof apiMap.customers.cleared>>> = {}) {
  return useQuery({
    queryKey: qk.customers.cleared(params),
    queryFn: () => apiMap.customers.cleared(params),
    placeholderData: (prev) => prev,
    ...opts,
  });
}

export function useFlaggedCustomers(params: CustomerListParams = {}, opts: QueryOpts<Awaited<ReturnType<typeof apiMap.customers.flagged>>> = {}) {
  return useQuery({
    queryKey: qk.customers.flagged(params),
    queryFn: () => apiMap.customers.flagged(params),
    placeholderData: (prev) => prev,
    ...opts,
  });
}

export function useRegisterCustomer(opts: MutOpts<Awaited<ReturnType<typeof apiMap.customers.register>>, CustomerRegisterInput> = {}) {
  return useMutation({
    mutationFn: (input: CustomerRegisterInput) => apiMap.customers.register(input),
    ...opts,
  });
}

export function useUpdateCustomer(id: number, opts: MutOpts<Awaited<ReturnType<typeof apiMap.customers.update>>, CustomerUpdateInput> = {}) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (patch: CustomerUpdateInput) => apiMap.customers.update(id, patch),
    onSuccess: (data, vars, ctx, mutation) => {
      qc.invalidateQueries({ queryKey: qk.customers.detail(id) });
      qc.invalidateQueries({ queryKey: qk.me });
      opts.onSuccess?.(data, vars, ctx, mutation);
    },
    ...opts,
  });
}

export function useSetPassword(opts: MutOpts<Awaited<ReturnType<typeof apiMap.customers.setPassword>>, PasswordChangeInput> = {}) {
  return useMutation({
    mutationFn: (input: PasswordChangeInput) => apiMap.customers.setPassword(input),
    ...opts,
  });
}

export function useLogin(
  opts: MutOpts<{ user: CustomerRead }, LoginInput> = {},
) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: LoginInput) => {
      const res = await fetch("/api/session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify(input),
      });

      const body = (await res.json().catch(() => ({}))) as {
        user?: CustomerRead;
        message?: string;
        error?: string;
      };

      if (!res.ok || !body.user) {
        throw new ApiError(
          res.status,
          body.message ?? body.error ?? `Sign-in failed (HTTP ${res.status})`,
          body,
        );
      }

      return { user: body.user };
    },
    onSuccess: (data, vars, ctx, mutation) => {
      qc.setQueryData(qk.me, data.user);
      qc.invalidateQueries({ queryKey: qk.me });
      opts.onSuccess?.(data, vars, ctx, mutation);
    },
    ...opts,
  });
}

// ---------------------------------------------------------------------------
// Documents
// ---------------------------------------------------------------------------

export function useDocuments(params: DocumentListParams, opts: QueryOpts<Awaited<ReturnType<typeof apiMap.documents.list>>> = {}) {
  return useQuery({
    queryKey: qk.documents.list(params),
    queryFn: () => apiMap.documents.list(params),
    placeholderData: (prev) => prev,
    ...opts,
  });
}

export function useDocument(id: number | null | undefined, opts: QueryOpts<Awaited<ReturnType<typeof apiMap.documents.detail>>> = {}) {
  return useQuery({
    queryKey: qk.documents.detail(id ?? 0),
    queryFn: () => apiMap.documents.detail(id!),
    enabled: typeof id === "number" && id > 0,
    ...opts,
  });
}

export function useUploadDocument(opts: MutOpts<Awaited<ReturnType<typeof apiMap.documents.upload>>, { file: File; docType: DocType }> = {}) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ file, docType }) => apiMap.documents.upload(file, docType),
    onSuccess: (data, vars, ctx, mutation) => {
      qc.invalidateQueries({ queryKey: qk.documents.all });
      opts.onSuccess?.(data, vars, ctx, mutation);
    },
    ...opts,
  });
}

export function useDeleteDocument(opts: MutOpts<void, number> = {}) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => apiMap.documents.remove(id),
    onSuccess: (data, vars, ctx, mutation) => {
      qc.invalidateQueries({ queryKey: qk.documents.all });
      qc.removeQueries({ queryKey: qk.documents.detail(vars) });
      opts.onSuccess?.(data, vars, ctx, mutation);
    },
    ...opts,
  });
}

// ---------------------------------------------------------------------------
// Parsed documents
// ---------------------------------------------------------------------------

export function useParsedDocuments(params: ParsedDocumentListParams = {}, opts: QueryOpts<Awaited<ReturnType<typeof apiMap.parsedDocuments.list>>> = {}) {
  return useQuery({
    queryKey: qk.parsedDocuments.list(params),
    queryFn: () => apiMap.parsedDocuments.list(params),
    placeholderData: (prev) => prev,
    ...opts,
  });
}

export function useParsedDocument(id: number | null | undefined, opts: QueryOpts<Awaited<ReturnType<typeof apiMap.parsedDocuments.detail>>> = {}) {
  return useQuery({
    queryKey: qk.parsedDocuments.detail(id ?? 0),
    queryFn: () => apiMap.parsedDocuments.detail(id!),
    enabled: typeof id === "number" && id > 0,
    ...opts,
  });
}

// ---------------------------------------------------------------------------
// Screenings
// ---------------------------------------------------------------------------

export function useScreenings(params: { page?: number; page_size?: number; status?: string } = {}, opts: QueryOpts<Awaited<ReturnType<typeof apiMap.screenings.list>>> = {}) {
  return useQuery({
    queryKey: qk.screenings.list(params),
    queryFn: () => apiMap.screenings.list(params),
    placeholderData: (prev) => prev,
    ...opts,
  });
}

export function useScreening(id: number | null | undefined, opts: QueryOpts<Awaited<ReturnType<typeof apiMap.screenings.detail>>> = {}) {
  return useQuery({
    queryKey: qk.screenings.detail(id ?? 0),
    queryFn: () => apiMap.screenings.detail(id!),
    enabled: typeof id === "number" && id > 0,
    ...opts,
  });
}

// ---------------------------------------------------------------------------
// Risk + Evidence
// ---------------------------------------------------------------------------

export function useRisk(params: { page?: number; page_size?: number; tier?: string } = {}, opts: QueryOpts<Awaited<ReturnType<typeof apiMap.risk.list>>> = {}) {
  return useQuery({
    queryKey: qk.risk.list(params),
    queryFn: () => apiMap.risk.list(params),
    placeholderData: (prev) => prev,
    ...opts,
  });
}

export function useEvidence(params: { page?: number; page_size?: number } = {}, opts: QueryOpts<Awaited<ReturnType<typeof apiMap.evidence.list>>> = {}) {
  return useQuery({
    queryKey: qk.evidence.list(params),
    queryFn: () => apiMap.evidence.list(params),
    placeholderData: (prev) => prev,
    ...opts,
  });
}

// ---------------------------------------------------------------------------
// Audit
// ---------------------------------------------------------------------------

export function useAudit(params: AuditListParams = {}, opts: QueryOpts<Awaited<ReturnType<typeof apiMap.audit.list>>> = {}) {
  return useQuery({
    queryKey: qk.audit.list(params),
    queryFn: () => apiMap.audit.list(params),
    placeholderData: (prev) => prev,
    ...opts,
  });
}

// ---------------------------------------------------------------------------
// Workflows
// ---------------------------------------------------------------------------

export function useWorkflows(params: WorkflowListParams = {}, opts: QueryOpts<Awaited<ReturnType<typeof apiMap.workflows.list>>> = {}) {
  return useQuery({
    queryKey: qk.workflows.list(params),
    queryFn: () => apiMap.workflows.list(params),
    placeholderData: (prev) => prev,
    ...opts,
  });
}

export function useWorkflowStatus(trackingId: string | null | undefined, opts: QueryOpts<Awaited<ReturnType<typeof apiMap.workflows.status>>> = {}) {
  return useQuery({
    queryKey: qk.workflows.status(trackingId ?? ""),
    queryFn: () => apiMap.workflows.status(trackingId!),
    enabled: Boolean(trackingId),
    ...opts,
  });
}

export function useStartKyc(
  opts: MutOpts<
    Awaited<ReturnType<typeof apiMap.workflows.start>>,
    StartKycInput
  > = {},
) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ documentId, selfieId, reason }) =>
      apiMap.workflows.start(documentId, selfieId, reason),
    onSuccess: (data, vars, ctx, mutation) => {
      qc.invalidateQueries({ queryKey: qk.workflows.all });
      opts.onSuccess?.(data, vars, ctx, mutation);
    },
    ...opts,
  });
}

export function useHealth(opts: QueryOpts<Awaited<ReturnType<typeof apiMap.workflows.health>>> = {}) {
  return useQuery({
    queryKey: qk.workflows.health,
    queryFn: () => apiMap.workflows.health(),
    ...opts,
  });
}

export function useDecideWorkflow(
  opts: MutOpts<
    Awaited<ReturnType<typeof apiMap.workflows.decide>>,
    {
      trackingId: string;
      decision: "APPROVED" | "REJECTED" | "MORE_INFO";
      note?: string;
    }
  > = {},
) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ trackingId, decision, note }) =>
      apiMap.workflows.decide(trackingId, { decision, note }),
    onSuccess: (data, vars, ctx, mutation) => {
      qc.invalidateQueries({
        queryKey: qk.workflows.status(vars.trackingId),
      });
      qc.invalidateQueries({ queryKey: qk.workflows.all });
      qc.invalidateQueries({ queryKey: qk.workflows.outstandingMoreInfo });
      opts.onSuccess?.(data, vars, ctx, mutation);
    },
    ...opts,
  });
}

export function useOutstandingMoreInfo(
  opts: QueryOpts<Awaited<ReturnType<typeof apiMap.workflows.outstandingMoreInfo>>> = {},
) {
  return useQuery({
    queryKey: qk.workflows.outstandingMoreInfo,
    queryFn: () => apiMap.workflows.outstandingMoreInfo(),
    staleTime: 15_000,
    ...opts,
  });
}

// ---------------------------------------------------------------------------
// FBC screening
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Selfies
// ---------------------------------------------------------------------------

export function useUploadSelfie(
  opts: MutOpts<
    Awaited<ReturnType<typeof apiMap.selfies.upload>>,
    { file: File }
  > = {},
) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ file }) => apiMap.selfies.upload(file),
    onSuccess: (data, vars, ctx, mutation) => {
      qc.setQueryData(qk.selfies.detail(data.id), data);
      opts.onSuccess?.(data, vars, ctx, mutation);
    },
    ...opts,
  });
}
