"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/router";
import {
  AlertTriangle,
  ArrowRight,
  Check,
  Loader2,
} from "lucide-react";

import { ROUTES } from "@/lib/constants";
import { useLogin, useRegisterCustomer } from "@/lib/hooks";
import { ApiError } from "@/lib/api";
import {
  sanitizeDateOfBirth,
  sanitizeEmail,
  sanitizeName,
  sanitizeNationality,
  sanitizePassword,
  sanitizeUsername,
  validateDateOfBirth,
  validateEmail,
  validateFirstName,
  validateLastName,
  validateNationality,
  validatePassword,
  validatePasswordConfirm,
  validateUsername,
} from "@/lib/validation";
import { Button, Spinner } from "@/components/ui/primitives";
import {
  Checkbox,
  Field,
  Input,
  PasswordInput,
} from "@/components/ui/form";
import { Alert } from "@/components/ui/surfaces";
import { PasswordStrengthMeter } from "./password-strength";

// ===========================================================================

interface FormState {
  first_name: string;
  last_name: string;
  username: string;
  email: string;
  date_of_birth: string;
  nationality: string;
  password: string;
  password_confirm: string;
}

type Field = keyof FormState;

const INITIAL: FormState = {
  first_name: "",
  last_name: "",
  username: "",
  email: "",
  date_of_birth: "",
  nationality: "",
  password: "",
  password_confirm: "",
};

// ===========================================================================

export function RegisterForm() {
  const router = useRouter();

  const [form, setForm] = useState<FormState>(INITIAL);
  const [touched, setTouched] = useState<Record<Field, boolean>>({
    first_name: false,
    last_name: false,
    username: false,
    email: false,
    date_of_birth: false,
    nationality: false,
    password: false,
    password_confirm: false,
  });
  const [serverErrors, setServerErrors] = useState<Partial<Record<Field, string>>>({});
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [termsAccepted, setTermsAccepted] = useState(false);

  const refs = {
    first_name: useRef<HTMLInputElement>(null),
    last_name: useRef<HTMLInputElement>(null),
    username: useRef<HTMLInputElement>(null),
    email: useRef<HTMLInputElement>(null),
    date_of_birth: useRef<HTMLInputElement>(null),
    nationality: useRef<HTMLInputElement>(null),
    password: useRef<HTMLInputElement>(null),
    password_confirm: useRef<HTMLInputElement>(null),
  };

  // ---- Per-field local validation ----------------------------------------

  function localError(field: Field): string | null {
    switch (field) {
      case "first_name":     return validateFirstName(form.first_name);
      case "last_name":      return validateLastName(form.last_name);
      case "username":       return validateUsername(form.username);
      case "email":          return validateEmail(form.email);
      case "date_of_birth":  return validateDateOfBirth(form.date_of_birth);
      case "nationality":    return validateNationality(form.nationality);
      case "password":       return validatePassword(form.password);
      case "password_confirm": return validatePasswordConfirm(form.password_confirm, form.password);
    }
  }

  function fieldError(field: Field): string | undefined {
    return (
      serverErrors[field] ??
      (touched[field] ? localError(field) ?? undefined : undefined)
    );
  }

  function fieldValid(field: Field): boolean {
    return touched[field] && !fieldError(field) && Boolean(form[field]);
  }

  // ---- Register mutation --------------------------------------------------

  const register = useRegisterCustomer({
    onSuccess: async (_data, variables) => {
      try {
        await login.mutateAsync({
          username: variables.username,
          password: variables.password,
        });
        router.replace(ROUTES.customer.dashboard);
      } catch {
        router.replace(`${ROUTES.login}?registered=1`);
      }
    },
    onError: (err) => {
      if (err instanceof ApiError) {
        const fe = err.fieldErrors();
        if (fe) {
          const flat: Partial<Record<Field, string>> = {};
          for (const [k, messages] of Object.entries(fe)) {
            if (k in INITIAL) flat[k as Field] = messages[0];
            else setSubmitError(messages[0]);
          }
          setServerErrors(flat);
          setTouched((t) => {
            const next = { ...t };
            for (const k of Object.keys(flat)) next[k as Field] = true;
            return next;
          });
          if (Object.keys(flat).length === 0) {
            setSubmitError(err.message);
          }
        } else {
          setSubmitError(describeRegisterError(err));
        }
      } else {
        setSubmitError("Registration failed. Please try again.");
      }
    },
  });

  const login = useLogin();

  // ---- Field handlers ----------------------------------------------------

  function setField<K extends Field>(key: K, value: FormState[K]) {
    // Sanitize as the user types for text fields. DO NOT sanitize passwords
    // while typing — moving the caret on each keystroke is a UX crime.
    let next = value;
    if (key === "email") next = sanitizeEmail(String(value)) as FormState[K];
    if (key === "username") next = sanitizeUsername(String(value)) as FormState[K];
    if (key === "first_name" || key === "last_name")
      next = sanitizeName(String(value)) as FormState[K];
    if (key === "nationality")
      next = sanitizeNationality(String(value)) as FormState[K];
    if (key === "date_of_birth")
      next = sanitizeDateOfBirth(String(value)) as FormState[K];

    setForm((f) => ({ ...f, [key]: next }));
    if (serverErrors[key]) {
      setServerErrors((se) => {
        const copy = { ...se };
        delete copy[key];
        return copy;
      });
    }
    if (submitError) setSubmitError(null);
  }

  function blur(key: Field) {
    setTouched((t) => ({ ...t, [key]: true }));
  }

  // ---- Submit ------------------------------------------------------------

  const handleSubmit = useCallback(
    (e: React.FormEvent) => {
      e.preventDefault();

      // Mark every field as touched, then check all local validators.
      const allTouched: Record<Field, boolean> = {
        first_name: true,
        last_name: true,
        username: true,
        email: true,
        date_of_birth: true,
        nationality: true,
        password: true,
        password_confirm: true,
      };
      setTouched(allTouched);
      setSubmitError(null);

      // Find the first invalid field in visual order and focus it.
      const order: Field[] = [
        "first_name",
        "last_name",
        "username",
        "email",
        "date_of_birth",
        "nationality",
        "password",
        "password_confirm",
      ];
      for (const field of order) {
        if (localError(field)) {
          refs[field].current?.focus();
          return;
        }
      }

      if (!termsAccepted) {
        setSubmitError("Please accept the terms to continue.");
        return;
      }

      register.mutate({
        username: sanitizeUsername(form.username),
        email: sanitizeEmail(form.email),
        password: sanitizePassword(form.password),
        password_confirm: sanitizePassword(form.password_confirm),
        first_name: sanitizeName(form.first_name) || undefined,
        last_name: sanitizeName(form.last_name) || undefined,
        date_of_birth: sanitizeDateOfBirth(form.date_of_birth) || undefined,
        nationality: sanitizeNationality(form.nationality) || undefined,
      });
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [form, termsAccepted],
  );

  const submitting = register.isPending || login.isPending;

  // ---- Render ------------------------------------------------------------

  return (
    <form onSubmit={handleSubmit} noValidate className="space-y-4">
      {submitError && (
        <Alert tone="danger" className="animate-in fade-in slide-in-from-top-1">
          <div className="flex items-start gap-2">
            <AlertTriangle className="mt-0.5 size-4 shrink-0" />
            <span className="font-semibold">{submitError}</span>
          </div>
        </Alert>
      )}

      {/* Name row */}
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="First name" htmlFor="first_name" error={fieldError("first_name")}>
          <div className="relative">
            <Input
              ref={refs.first_name}
              id="first_name"
              autoComplete="given-name"
              placeholder="Alice"
              value={form.first_name}
              onChange={(e) => setField("first_name", e.target.value)}
              onBlur={() => blur("first_name")}
              disabled={submitting}
              error={!!fieldError("first_name")}
              className="h-11 pr-8"
            />
            {fieldValid("first_name") && (
              <Check className="pointer-events-none absolute right-3 top-1/2 size-4 -translate-y-1/2 text-[var(--success)]" />
            )}
          </div>
        </Field>

        <Field label="Last name" htmlFor="last_name" error={fieldError("last_name")}>
          <div className="relative">
            <Input
              ref={refs.last_name}
              id="last_name"
              autoComplete="family-name"
              placeholder="Moyo"
              value={form.last_name}
              onChange={(e) => setField("last_name", e.target.value)}
              onBlur={() => blur("last_name")}
              disabled={submitting}
              error={!!fieldError("last_name")}
              className="h-11 pr-8"
            />
            {fieldValid("last_name") && (
              <Check className="pointer-events-none absolute right-3 top-1/2 size-4 -translate-y-1/2 text-[var(--success)]" />
            )}
          </div>
        </Field>
      </div>

      {/* Username */}
      <Field
        label="Username"
        htmlFor="username"
        required
        error={fieldError("username")}
        hint="Letters, digits, and . _ @ + - only."
      >
        <div className="relative">
          <Input
            ref={refs.username}
            id="username"
            autoComplete="username"
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck={false}
            placeholder="alice"
            value={form.username}
            onChange={(e) => setField("username", e.target.value)}
            onBlur={() => blur("username")}
            disabled={submitting}
            error={!!fieldError("username")}
            className="h-11 pr-8"
          />
          {fieldValid("username") && (
            <Check className="pointer-events-none absolute right-3 top-1/2 size-4 -translate-y-1/2 text-[var(--success)]" />
          )}
        </div>
      </Field>

      {/* Email */}
      <Field label="Email" htmlFor="email" required error={fieldError("email")}>
        <div className="relative">
          <Input
            ref={refs.email}
            id="email"
            type="email"
            inputMode="email"
            autoComplete="email"
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck={false}
            placeholder="alice@example.com"
            value={form.email}
            onChange={(e) => setField("email", e.target.value)}
            onBlur={() => blur("email")}
            disabled={submitting}
            error={!!fieldError("email")}
            className="h-11 pr-8"
          />
          {fieldValid("email") && (
            <Check className="pointer-events-none absolute right-3 top-1/2 size-4 -translate-y-1/2 text-[var(--success)]" />
          )}
        </div>
      </Field>

      {/* DOB + Nationality */}
      <div className="grid gap-4 sm:grid-cols-2">
        <Field
          label="Date of birth"
          htmlFor="date_of_birth"
          error={fieldError("date_of_birth")}
          hint="Optional"
        >
          <Input
            ref={refs.date_of_birth}
            id="date_of_birth"
            type="date"
            autoComplete="bday"
            value={form.date_of_birth}
            onChange={(e) => setField("date_of_birth", e.target.value)}
            onBlur={() => blur("date_of_birth")}
            disabled={submitting}
            error={!!fieldError("date_of_birth")}
            className="h-11"
          />
        </Field>

        <Field
          label="Nationality"
          htmlFor="nationality"
          error={fieldError("nationality")}
          hint="Optional, e.g. ZW"
        >
          <Input
            ref={refs.nationality}
            id="nationality"
            autoComplete="country"
            autoCapitalize="characters"
            placeholder="ZW"
            maxLength={50}
            value={form.nationality}
            onChange={(e) => setField("nationality", e.target.value)}
            onBlur={() => blur("nationality")}
            disabled={submitting}
            error={!!fieldError("nationality")}
            className="h-11"
          />
        </Field>
      </div>

      {/* Password */}
      <div>
        <Field
          label="Password"
          htmlFor="password"
          required
          error={fieldError("password")}
        >
          <PasswordInput
            ref={refs.password}
            id="password"
            autoComplete="new-password"
            placeholder="••••••••"
            value={form.password}
            onChange={(e) => setField("password", e.target.value)}
            onBlur={() => blur("password")}
            disabled={submitting}
            error={!!fieldError("password")}
            className="h-11"
          />
        </Field>
        <PasswordStrengthMeter password={form.password} />
      </div>

      {/* Confirm password */}
      <Field
        label="Confirm password"
        htmlFor="password_confirm"
        required
        error={fieldError("password_confirm")}
      >
        <PasswordInput
          ref={refs.password_confirm}
          id="password_confirm"
          autoComplete="new-password"
          placeholder="••••••••"
          value={form.password_confirm}
          onChange={(e) => setField("password_confirm", e.target.value)}
          onBlur={() => blur("password_confirm")}
          disabled={submitting}
          error={!!fieldError("password_confirm")}
          className="h-11"
        />
      </Field>

      {/* Terms */}
      <label className="flex cursor-pointer items-start gap-2 pt-1">
        <Checkbox
          checked={termsAccepted}
          onChange={(e) => setTermsAccepted(e.target.checked)}
          disabled={submitting}
          className="mt-0.5"
        />
        <span className="text-xs leading-relaxed text-[var(--muted)]">
          I agree to the{" "}
          <a href="#" className="font-semibold text-[var(--primary)] hover:underline">
            Terms of Service
          </a>{" "}
          and{" "}
          <a href="#" className="font-semibold text-[var(--primary)] hover:underline">
            Privacy Policy
          </a>
          .
        </span>
      </label>

      {/* Submit */}
      <Button
        type="submit"
        size="lg"
        loading={submitting}
        disabled={submitting || !termsAccepted}
        className="h-12 w-full text-base"
      >
        {submitting ? (
          <>
            <Loader2 className="size-4 animate-spin" />
            Creating account…
          </>
        ) : (
          <>
            Create account
            <ArrowRight className="size-4" />
          </>
        )}
      </Button>

      {/* Footer */}
      <p className="pt-2 text-center text-sm text-[var(--muted)]">
        Already have an account?{" "}
        <Link
          href={ROUTES.login}
          className="font-semibold text-[var(--primary)] hover:underline"
        >
          Sign in
        </Link>
      </p>
    </form>
  );
}

// ===========================================================================

function describeRegisterError(err: ApiError): string {
  switch (err.status) {
    case 400:
      return err.message || "Please fix the highlighted fields.";
    case 429:
      return "Too many attempts. Try again later.";
    case 502:
    case 503:
    case 504:
      return "Service temporarily unavailable. Try again shortly.";
    default:
      return err.message || "Registration failed.";
  }
}
