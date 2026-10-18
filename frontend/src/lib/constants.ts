// src/lib/constants.ts
/**
 * Route table and shared constants.
 *
 * Static routes live as plain strings. Dynamic routes are exposed as
 * functions so a typo like `/applications/undefined` becomes a compile
 * error rather than a 404 in production.
 */

export const SESSION_COOKIE = "kyc_session";

/** Product identity — single source of truth for every branded string. */
export const APP_NAME = "Z-KYC";
export const APP_TAGLINE = "Secure Identity Verification";
export const APP_DESCRIPTION =
  "Enterprise identity verification and KYC workflow platform.";
export const DEFAULT_PAGE_SIZE = 20;

export const ROUTES = {
  login: "/login",
  register: "/register",

  customer: {
    dashboard: "/customer",
    apply: "/customer/apply",
    applications: "/customer/applications",
    applicationDetail: (id: number | string) =>
      `/customer/applications/${id}`,
    profile: "/customer/profile",
    help: "/customer/help",
  },

  officer: {
    dashboard: "/officer",
    applications: "/officer/applications",
    applicationDetail: (trackingId: string) =>
      `/officer/applications/${trackingId}`,

    // Customer list + detail for staff browsing.
    customers: "/officer/customers",
    customerDetail: (id: number | string) => `/officer/customers/${id}`,

    screening: "/officer/screening",
    screeningDetail: (id: number | string) => `/officer/screening/${id}`,
    reports: "/officer/reports",
    audit: "/officer/audit",
    settings: "/officer/settings",
  },

  kycStatus: (trackingId: string) => `/kyc/${trackingId}`,
} as const;

export const DOC_TYPE_OPTIONS = [
  { value: "national_id", label: "National ID" },
  { value: "passport",    label: "Passport" },
  { value: "licence",     label: "Driver's Licence" },
  { value: "unknown",     label: "Unknown" },
] as const;

export const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;
export const ACCEPTED_FILE_INPUT = [
  "image/png",
  "image/jpeg",
  "image/jpg",
  "image/tiff",
  "image/heic",
  "image/heif",
  "application/pdf",
].join(",");

export const WORKFLOW_STATUS_OPTIONS = [
  { value: "PENDING",     label: "Pending" },
  { value: "IN_PROGRESS", label: "In Progress" },
  { value: "COMPLETED",   label: "Completed" },
  { value: "FAILED",      label: "Failed" },
] as const;

export const RISK_TIER_OPTIONS = [
  { value: "LOW",    label: "Low" },
  { value: "MEDIUM", label: "Medium" },
  { value: "HIGH",   label: "High" },
] as const;

export const SCREENING_STATUS_OPTIONS = [
  { value: "CLEAR",   label: "Clear" },
  { value: "FLAGGED", label: "Flagged" },
  { value: "MATCH",   label: "Match" },
] as const;

export type PillTone = "neutral" | "info" | "warning" | "success" | "danger";