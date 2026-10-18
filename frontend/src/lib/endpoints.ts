// src/lib/endpoints.ts
/**
 * Typed endpoint map. One function per real backend URL.
 */

import { api } from "./api";
import type {
  AuditListParams,
  AuditLogEntry,
  CustomerListParams,
  CustomerOverview,
  CustomerRead,
  CustomerRegisterInput,
  CustomerUpdateInput,
  Document,
  DocumentListParams,
  DocType,
  EvidenceScore,
              LoginInput,
  Page,
  ParsedDocument,
  ParsedDocumentListParams,
  PasswordChangeInput,
  RiskClassification,
  ScreeningResult,
  StartKYCResponse,
  TokenResponse,
  Selfie,
  StartKycInput,
  WorkflowDecision,
  WorkflowListItem,
  WorkflowListParams,
  WorkflowStatusResponse,
} from "./types";

// ---------------------------------------------------------------------------
// Auth
// ---------------------------------------------------------------------------

export const auth = {
  login: (input: LoginInput) =>
    api.post<TokenResponse>("auth/token", input),
};

// ---------------------------------------------------------------------------
// Customers
// ---------------------------------------------------------------------------

export const customers = {
  register: (input: CustomerRegisterInput) =>
    api.post<CustomerRead>("customers", input),

  me: () => api.get<CustomerRead>("customers/me"),

  list: (params: CustomerListParams = {}) =>
    api.get<Page<CustomerRead>>("customers", { query: params }),

  detail: (id: number) => api.get<CustomerRead>(`customers/${id}`),

  update: (id: number, patch: CustomerUpdateInput) =>
    api.patch<CustomerRead>(`customers/${id}`, patch),

  remove: (id: number) => api.del<void>(`customers/${id}`),

  setPassword: (input: PasswordChangeInput) =>
    api.post<{ ok: true }>("customers/set-password", input),

  cleared: (params: CustomerListParams = {}) =>
    api.get<Page<CustomerRead>>("customers/cleared", { query: params }),

  flagged: (params: CustomerListParams = {}) =>
    api.get<Page<CustomerRead>>("customers/flagged", { query: params }),

  overview: (id: number) =>
    api.get<CustomerOverview>(`customers/${id}/overview`),
};

// ---------------------------------------------------------------------------
// Documents
// ---------------------------------------------------------------------------

export const documents = {
  list: (params: DocumentListParams = {}) =>
    api.get<Page<Document>>("documents", { query: params }),

  detail: (id: number) => api.get<Document>(`documents/${id}`),

  upload: (file: File, docType: DocType) => {
    const fd = new FormData();
    fd.append("file", file);
    fd.append("doc_type", docType);
    return api.post<Document>("documents", fd);
  },

  update: (id: number, patch: { doc_type?: DocType }) =>
    api.patch<Document>(`documents/${id}`, patch),

  remove: (id: number) => api.del<void>(`documents/${id}`),

  previewUrl: (id: number) => `/api/proxy/documents/${id}/preview`,
};

// ---------------------------------------------------------------------------
// Parsed documents
// ---------------------------------------------------------------------------

export const parsedDocuments = {
  list: (params: ParsedDocumentListParams = {}) =>
    api.get<Page<ParsedDocument>>("parsed-documents", { query: params }),

  detail: (id: number) =>
    api.get<ParsedDocument>(`parsed-documents/${id}`),
};

// ---------------------------------------------------------------------------
// Screening
// ---------------------------------------------------------------------------

export const screenings = {
  list: (params: { page?: number; page_size?: number; status?: string } = {}) =>
    api.get<Page<ScreeningResult>>("screenings", { query: params }),

  detail: (id: number) => api.get<ScreeningResult>(`screenings/${id}`),
};

// ---------------------------------------------------------------------------
// Risk + Evidence
// ---------------------------------------------------------------------------

export const risk = {
  list: (params: { page?: number; page_size?: number; tier?: string } = {}) =>
    api.get<Page<RiskClassification>>("risk", { query: params }),

  detail: (id: number) => api.get<RiskClassification>(`risk/${id}`),
};

export const evidence = {
  list: (params: { page?: number; page_size?: number } = {}) =>
    api.get<Page<EvidenceScore>>("evidence", { query: params }),

  detail: (id: number) => api.get<EvidenceScore>(`evidence/${id}`),
};

// ---------------------------------------------------------------------------
// Audit
// ---------------------------------------------------------------------------

export const audit = {
  list: (params: AuditListParams = {}) =>
    api.get<Page<AuditLogEntry>>("audit", { query: params }),

  detail: (id: number) => api.get<AuditLogEntry>(`audit/${id}`),
};

// ---------------------------------------------------------------------------
// KYC workflows
// ---------------------------------------------------------------------------

export const workflows = {
  list: (params: WorkflowListParams = {}) =>
    api.get<Page<WorkflowListItem>>("workflows", { query: params }),

  start: (documentId: number, selfieId?: number, reason?: string) =>
    api.post<StartKYCResponse>("start-kyc", {
      document_id: documentId,
      ...(selfieId !== undefined ? { selfie_id: selfieId } : {}),
      ...(reason ? { reason } : {}),
    }),

  status: (trackingId: string) =>
    api.get<WorkflowStatusResponse>(`status/${trackingId}`),

  health: () =>
    api.get<{
      status: "ok" | "degraded";
      db: { ok: boolean; message: string };
      broker: { ok: boolean; message: string };
    }>("healthz"),

  decide: (
    trackingId: string,
    input: {
      decision: "APPROVED" | "REJECTED" | "MORE_INFO";
      note?: string;
    },
  ) =>
    api.post<{
      decision: WorkflowDecision;
      decision_note: string;
      decided_at: string;
      decided_by: { id: number; username: string };
    }>(`workflows/${trackingId}/decision`, input),

  /**
   * MORE_INFO workflows that the customer hasn't yet answered.
   * A request drops off this list the moment a newer workflow
   * exists against the same document.
   */
  outstandingMoreInfo: () =>
    api.get<WorkflowListItem[]>("workflows/outstanding-more-info"),
};

// ---------------------------------------------------------------------------
// Simulation — FBC screening
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Namespaced aggregate
// ---------------------------------------------------------------------------

export const selfies = {
  upload: (file: File) => {
    const fd = new FormData();
    fd.append("file", file);
    return api.post<Selfie>("selfies", fd);
  },
};

export const apiMap = {
  auth,
  customers,
  documents,
  selfies,
  parsedDocuments,
  screenings,
  risk,
  evidence,
  audit,
  workflows,
} as const;