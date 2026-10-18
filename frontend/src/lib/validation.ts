// src/lib/validation.ts
/**
 * Input validation and sanitization shared across auth screens.
 *
 * Sanitize → Validate → Submit, in that order. Sanitization strips
 * characters that can never be legitimate (Unicode control codes,
 * zero-width joiners, RTL overrides, null bytes) and caps length.
 * Validation then rejects whatever still fails the field's rules.
 *
 * Password sanitization deliberately does NOT trim or normalize —
 * those would change the exact bytes the server hashes against.
 * We only strip invisible junk that a paste from a PDF or chat client
 * can insert silently, and cap length to prevent oversized POSTs.
 */

// ===========================================================================
// Sanitizers
// ===========================================================================

const CONTROL_AND_INVISIBLE =
  /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F\u200B-\u200F\u202A-\u202E\u2060-\u2064\uFEFF]/g;

const USERNAME_ALLOWED = /^[A-Za-z0-9._@+-]+$/;

/** Trim, drop control chars, cap length. Never throws. */
export function sanitizeUsername(input: string): string {
  return input
    .normalize("NFKC")
    .replace(CONTROL_AND_INVISIBLE, "")
    .trim()
    .slice(0, 50);
}

/**
 * Preserve exact password bytes; only strip invisible junk and cap
 * length. No trim, no NFKC.
 */
export function sanitizePassword(input: string): string {
  return input
    .replace(/[\u0000\u200B-\u200F\u202A-\u202E\u2060-\u2064\uFEFF]/g, "")
    .slice(0, 200);
}

/**
 * Guard against open redirects via ?next=.
 *
 * A malicious link could be `/login?next=https://evil.example` or
 * `?next=//evil.example` — both would pass a naive `startsWith("/")`
 * check and drop the freshly-signed-in user on an attacker's page.
 * Only same-origin absolute paths are allowed.
 */
export function safeRedirect(target: unknown, fallback: string): string {
  if (typeof target !== "string") return fallback;
  if (!target.startsWith("/")) return fallback;
  if (target.startsWith("//")) return fallback;
  if (target.startsWith("/\\")) return fallback;
  return target;
}

// ===========================================================================
// Validators — return null when valid, a message when not
// ===========================================================================

export function validateUsername(value: string): string | null {
  const v = sanitizeUsername(value);
  if (!v) return "Username is required.";
  if (v.length < 3) return "Username must be at least 3 characters.";
  if (v.length > 50) return "Username cannot exceed 50 characters.";
  if (!USERNAME_ALLOWED.test(v)) {
    return "Use letters, digits, and . _ @ + - only.";
  }
  return null;
}

export function validatePassword(value: string): string | null {
  const v = sanitizePassword(value);
  if (!v) return "Password is required.";
  if (v.length < 8) return "Password must be at least 8 characters.";
  if (v.length > 200) return "Password is too long.";
  return null;
}

// ===========================================================================
// Registration-specific validators and sanitizers
// ===========================================================================

const EMAIL_RE =
  /^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$/;

const NAME_RE = /^[A-Za-z][A-Za-z'’\- ]{0,59}$/;

// ---------------------------------------------------------------------------
// Sanitizers
// ---------------------------------------------------------------------------

/** Lowercase, trim, strip control chars, cap length. */
export function sanitizeEmail(input: string): string {
  return input
    .normalize("NFKC")
    .replace(CONTROL_AND_INVISIBLE, "")
    .trim()
    .toLowerCase()
    .slice(0, 254);
}

/**
 * Preserve legitimate name punctuation (apostrophes, hyphens, spaces).
 * Only strip invisible junk and cap length.
 */
export function sanitizeName(input: string): string {
  return input
    .normalize("NFKC")
    .replace(CONTROL_AND_INVISIBLE, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 60);
}

/**
 * ISO 3166-1 alpha-2 country code. Uppercase, letters only.
 * Free-text ("Zimbabwe") is also accepted at the field level; the
 * sanitizer just strips garbage so the classifier can decide.
 */
export function sanitizeNationality(input: string): string {
  return input
    .normalize("NFKC")
    .replace(CONTROL_AND_INVISIBLE, "")
    .trim()
    .slice(0, 50);
}

/** ISO date (YYYY-MM-DD) from a native date input; anything else → "". */
export function sanitizeDateOfBirth(input: string): string {
  const s = input.trim().slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : "";
}

// ---------------------------------------------------------------------------
// Validators
// ---------------------------------------------------------------------------

export function validateEmail(value: string): string | null {
  const v = sanitizeEmail(value);
  if (!v) return "Email is required.";
  if (v.length > 254) return "Email is too long.";
  if (!EMAIL_RE.test(v)) return "Enter a valid email address.";
  return null;
}

export function validateFirstName(value: string): string | null {
  const v = sanitizeName(value);
  if (!v) return null; // optional
  if (v.length < 2) return "Name must be at least 2 characters.";
  if (!NAME_RE.test(v)) return "Use letters, spaces, hyphens, or apostrophes.";
  return null;
}

export function validateLastName(value: string): string | null {
  return validateFirstName(value);
}

export function validateDateOfBirth(value: string): string | null {
  const v = sanitizeDateOfBirth(value);
  if (!v) return null; // optional
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return "Enter a valid date.";
  const today = new Date();
  const ageYears = (today.getTime() - d.getTime()) / (365.25 * 86400_000);
  if (ageYears < 0) return "Date of birth cannot be in the future.";
  if (ageYears > 120) return "Please check the date of birth.";
  return null;
}

export function validateNationality(value: string): string | null {
  const v = sanitizeNationality(value);
  if (!v) return null; // optional
  if (v.length < 2) return "Country code must be at least 2 characters.";
  return null;
}

/** Does not receive the primary password — pass it in explicitly. */
export function validatePasswordConfirm(
  confirm: string,
  password: string,
): string | null {
  const v = sanitizePassword(confirm);
  if (!v) return "Please confirm your password.";
  if (v !== password) return "Passwords do not match.";
  return null;
}

// ---------------------------------------------------------------------------
// Password strength
// ---------------------------------------------------------------------------

export type PasswordRule = {
  id: "len" | "case" | "num" | "sym";
  label: string;
  pass: boolean;
};

export function passwordStrength(password: string): {
  rules: PasswordRule[];
  score: 0 | 1 | 2 | 3 | 4;
  label: "Too weak" | "Weak" | "Fair" | "Strong" | "Elite";
} {
  const rules: PasswordRule[] = [
    { id: "len",  label: "8+ characters",    pass: password.length >= 8 },
    { id: "case", label: "Upper & lowercase", pass: /[a-z]/.test(password) && /[A-Z]/.test(password) },
    { id: "num",  label: "Number",            pass: /\d/.test(password) },
    { id: "sym",  label: "Symbol",            pass: /[^A-Za-z0-9]/.test(password) },
  ];
  const score = rules.filter((r) => r.pass).length as 0 | 1 | 2 | 3 | 4;
  const label =
    score === 0 ? "Too weak"
    : score === 1 ? "Weak"
    : score === 2 ? "Fair"
    : score === 3 ? "Strong"
    : "Elite";
  return { rules, score, label };
}
