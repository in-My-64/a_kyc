// src/lib/types.ts
/**
 * Wire types — mirror DRF serializers exactly.
 */

export interface Page<T> {
  count: number;
  next: string | null;
  previous: string | null;
  results: T[];
}

export type WorkflowStatus = "PENDING" | "IN_PROGRESS" | "COMPLETED" | "FAILED";
export type WorkflowDecision = "PENDING" | "APPROVED" | "REJECTED" | "MORE_INFO";
export type DocType = "national_id" | "passport" | "licence" | "unknown";
export type ScreeningStatus = "MATCH" | "FLAGGED" | "CLEAR";
export type CheckStatus = "PASS" | "REVIEW" | "FAIL";
export type SignalTone = "positive" | "neutral" | "warning" | "danger";
export type RiskTier = "LOW" | "MEDIUM" | "HIGH";

export interface LoginInput {
  username: string;
  password: string;
}

export interface TokenResponse {
  token: string;
  user_id: number;
  username: string;
}

export interface CustomerRead {
  id: number;
  username: string;
  email: string;
  first_name: string;
  last_name: string;
  date_of_birth: string | null;
  nationality: string;
  is_active: boolean;
  is_staff: boolean;
  date_joined: string;
  updated_at: string;
  latest_screening_status: ScreeningStatus | null;
}

export interface CustomerRegisterInput {
  username: string;
  email: string;
  password: string;
  password_confirm: string;
  first_name?: string;
  last_name?: string;
  date_of_birth?: string;
  nationality?: string;
}

export interface CustomerUpdateInput {
  email?: string;
  first_name?: string;
  last_name?: string;
  date_of_birth?: string | null;
  nationality?: string;
}

export interface PasswordChangeInput {
  current_password: string;
  new_password: string;
  new_password_confirm: string;
}

export interface CustomerListParams {
  page?: number;
  page_size?: number;
  search?: string;
  ordering?: "date_joined" | "-date_joined" | "username" | "-username";
}

export interface OverviewWorkflow {
  id: number;
  tracking_id: string;
  reference: string;
  document_id: number | null;
  status: WorkflowStatus;
  current_step: string | null;
  last_error: string;
  created_at: string;
  updated_at: string;
}

export interface OverviewScreening {
  id: number;
  status: ScreeningStatus;
  provider: string;
  match_count: number;
  created_at: string;
}

export interface CustomerOverview {
  customer: CustomerRead;
  counts: {
    documents: number;
    workflows: number;
    screenings: number;
  };
  workflows: OverviewWorkflow[];
  screenings: OverviewScreening[];
}

export interface DocumentPreprocessingMeta {
  blur_variance?: number;
  brightness?: number;
  warnings?: string[];
  source_kind?: "pdf" | "heic" | "image";
  pages_ignored?: number;
  is_scanned_pdf?: boolean | null;
  was_downscaled?: boolean;
  was_deskewed?: boolean;
  deskew_angle_deg?: number;
  was_cropped?: boolean;
  denoised?: boolean;
  working_edge?: number;
  output_shape?: [number, number];
}

export interface Document {
  id: number;
  customer: number;
  file: string;
  file_hash: string;
  processed_file: string | null;
  doc_type: DocType;
  preprocessing_meta: DocumentPreprocessingMeta;
  uploaded_at: string;
}

export interface DocumentListParams {
  page?: number;
  page_size?: number;
  search?: string;
  doc_type?: DocType;
  ordering?: "uploaded_at" | "-uploaded_at" | "id" | "-id";
}

export interface ParsedDocument {
  id: number;
  ocr_result: number;
  doc_type: DocType;
  id_number: string | null;
  name: string | null;
  dob: string | null;
  expiry: string | null;
  nationality: string | null;
  corrections: Record<string, unknown>;
  mrz_data: Record<string, unknown>;
  verification_issues: string[];
  created_at: string;
  updated_at: string;
}

export interface ParsedDocumentListParams {
  page?: number;
  page_size?: number;
  search?: string;
  doc_type?: DocType;
  ordering?: "created_at" | "-created_at" | "id" | "-id";
}

// ---------------------------------------------------------------------------
// Screening
// ---------------------------------------------------------------------------

export interface OpenSanctionsMatch {
  entity_id: string;
  caption: string;
  score: number;
  schema: string;
  topics: string[];
  datasets: string[];
  explanations?: Record<string, unknown>;
  raw?: Record<string, unknown> & { _provider?: string };
}

export interface PerProviderSummary {
  status: ScreeningStatus;
  match_count: number;
  error?: string | null;
  parsed_query?: Record<string, unknown> | null;
  raw_response?: Record<string, unknown> | null;
}

export interface ScreeningDetails {
  provider?: string;
  providers?: string[];
  dataset?: string;
  status?: ScreeningStatus;
  match_count?: number;
  matches: OpenSanctionsMatch[];
  parsed_query?: Record<string, unknown> | null;
  per_provider?: Record<string, PerProviderSummary>;
  error?: string;
  reason?: string;
  message?: string;
}

export interface ScreeningResult {
  id: number;
  parsed_document: number;
  status: ScreeningStatus;
  details: ScreeningDetails;
  created_at: string;
  updated_at: string;
}

export interface ScreeningEvidence {
  id: number;
  status: ScreeningStatus;
  provider: string;
  providers?: string[];
  match_count: number;
  matches: OpenSanctionsMatch[];
  parsed_query: Record<string, unknown> | null;
  error?: string;
  per_provider?: Record<string, PerProviderSummary>;
}

export interface EvidenceScoreBreakdownEntry {
  points: number;
  weight: number;
  reason: string;
  value?: number;
}

export interface EvidenceScore {
  id: number;
  parsed_document: number;
  score: string;
  breakdown: Record<string, EvidenceScoreBreakdownEntry>;
  created_at: string;
  updated_at: string;
}

export interface RiskClassification {
  id: number;
  parsed_document: number;
  tier: RiskTier;
  reason: string[];
  created_at: string;
  updated_at: string;
}

export interface AuditLogEntry {
  id: number;
  action: string;
  user: number | null;
  timestamp: string;
  details: Record<string, unknown>;
  success: boolean;
}

export interface AuditListParams {
  page?: number;
  page_size?: number;
  search?: string;
  action?: string;
  success?: boolean;
  user?: number;
  ordering?: "timestamp" | "-timestamp" | "id" | "-id";
}

export interface WorkflowListItem {
  id: number;
  tracking_id: string;
  reference: string;
  document: number | null;
  customer_name: string;
  document_type: string;
  status: WorkflowStatus;
  current_step: string | null;
  last_error: string;
  decision: WorkflowDecision;
  decision_note: string;
  decided_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface WorkflowListParams {
  page?: number;
  page_size?: number;
  search?: string;
  status?: WorkflowStatus;
  current_step?: string;
  document?: number;
  decision?: WorkflowDecision;
  ordering?: "created_at" | "-created_at" | "updated_at" | "-updated_at";
}

export interface WorkflowTaskIds {
  preprocess: string | null;
  ocr: string | null;
  classification: string | null;
  screening: string | null;
  evidence_score: string | null;
  risk_classification: string | null;
}

export interface StartKYCResponse {
  tracking_id: string;
}

export interface RiskClassificationDetail {
  tier: RiskTier;
  reason: string[];
  created_at: string;
  updated_at: string;
}

export interface EvidenceScoreDetail {
  score: string;
  breakdown: Record<string, EvidenceScoreBreakdownEntry>;
}

export interface ExtractionDetail {
  fields: Record<string, string | null>;
  applied_at: string | null;
  pre_apply: Record<string, string | null> | null;
}

export interface WorkflowDecisionState {
  value: WorkflowDecision;
  note: string;
  decided_at: string | null;
  decided_by_username: string | null;
}

export interface ChatMessage {
  id: number;
  sender_name: string;
  is_staff: boolean;
  content: string;
  created_at: string;
}


export interface CustomerAssessmentResult {
  trust_score: number;
  decision: "APPROVED" | "MANUAL_REVIEW" | "REJECTED";
  reasons: string[];
  extraction_score: number;
  biometric_similarity: number | null;
  sanctions_status: string;
  created_at: string;
}

export interface WorkflowStatusResponse {
  messages: ChatMessage[];
  tracking_id: string;
  reference: string;
  document_id: number | null;
  customer_id: number;
  customer_name: string;
  status: WorkflowStatus;
  current_step: string | null;
  last_error: string;
  task_ids: WorkflowTaskIds;
  decision: WorkflowDecisionState;
  created_at: string;
  updated_at: string;
  screening_report: any;
  face_match: FaceMatchResult | null;
  customer_assessment: CustomerAssessmentResult | null;
  identity: any;
  risk_classification: RiskClassificationDetail | null;
  evidence_score: EvidenceScoreDetail | null;
  verification_issues: string[];
  extraction_detail: ExtractionDetail | null;
  selfie_id: number | null;

}

// ---------------------------------------------------------------------------
// Selfie + face match
// ---------------------------------------------------------------------------

export interface Selfie {
  id: number;
  uploaded_at: string;
  file_hash: string;
  width: number;
  height: number;
}

export interface SelfieUploadInput {
  file: File;
}

export type FaceMatchDecision = "MATCH" | "REVIEW" | "FAIL";

export interface FaceMatchResult {
  decision: FaceMatchDecision;
  /** Cosine similarity, typically in [-1, 1]. */
  similarity: number;
  /** The calibrated operating threshold the backend used. */
  threshold: number;
  /** Human-readable target, e.g. "1e-4" or "1e-5". */
  fmr_target: string;
  liveness_passed: boolean;
  liveness_score: number | null;
  model_name: string;
  model_version: string;
  selfie_crop_url: string | null;
  id_crop_url: string | null;
  details: Record<string, unknown>;
  duplicate_customer_id: number | null;
  duplicate_similarity: number | null;
  created_at: string;
}

export interface StartKycInput {
  documentId: number;
  selfieId?: number;
  reason?: string;
}
