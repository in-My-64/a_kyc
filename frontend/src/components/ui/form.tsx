// src/components/ui/form.tsx
"use client";

import * as React from "react";
import { AlertCircle } from "lucide-react";

import { cn } from "@/lib/utils";

// ---------------------------------------------------------------------------
// Label
// ---------------------------------------------------------------------------

export interface LabelProps
  extends React.LabelHTMLAttributes<HTMLLabelElement> {
  required?: boolean;
}

export function Label({
  className,
  required,
  children,
  ...props
}: LabelProps) {
  return (
    <label
      className={cn("text-sm font-medium text-[var(--fg)]", className)}
      {...props}
    >
      {children}
      {required && (
        <span aria-hidden className="ml-1 text-[var(--danger)]">
          *
        </span>
      )}
    </label>
  );
}

// ---------------------------------------------------------------------------
// Field — label + input + error/hint wrapper
// ---------------------------------------------------------------------------

export interface FieldProps {
  label?: React.ReactNode;
  hint?: React.ReactNode;
  error?: React.ReactNode;
  required?: boolean;
  htmlFor?: string;
  className?: string;
  children: React.ReactNode;
}

export function Field({
  label,
  hint,
  error,
  required,
  htmlFor,
  className,
  children,
}: FieldProps) {
  return (
    <div className={cn("flex flex-col gap-1.5", className)}>
      {label && (
        <Label htmlFor={htmlFor} required={required}>
          {label}
        </Label>
      )}
      {children}
      {error ? (
        <p className="flex items-center gap-1 text-xs text-[var(--danger)]">
          <AlertCircle className="size-3 shrink-0" />
          <span>{error}</span>
        </p>
      ) : hint ? (
        <p className="text-xs text-[var(--muted)]">{hint}</p>
      ) : null}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Base input styling
// ---------------------------------------------------------------------------

const baseInput = [
  "flex h-10 w-full rounded-lg border border-[var(--border)] bg-white px-3 py-2 text-sm",
  "text-[var(--fg)] placeholder:text-[var(--muted-2)]",
  "transition-colors",
  "focus-visible:border-[var(--primary)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color-mix(in_oklch,var(--primary)_25%,transparent)]",
  "disabled:cursor-not-allowed disabled:opacity-50",
  "aria-[invalid=true]:border-[var(--danger)] aria-[invalid=true]:focus-visible:ring-[color-mix(in_oklch,var(--danger)_25%,transparent)]",
].join(" ");

// ---------------------------------------------------------------------------
// Input
// ---------------------------------------------------------------------------

export interface InputProps
  extends React.InputHTMLAttributes<HTMLInputElement> {
  error?: boolean;
}

export const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ className, error, ...props }, ref) => (
    <input
      ref={ref}
      aria-invalid={error || undefined}
      className={cn(baseInput, className)}
      {...props}
    />
  ),
);
Input.displayName = "Input";

// ---------------------------------------------------------------------------
// Textarea
// ---------------------------------------------------------------------------

export interface TextareaProps
  extends React.TextareaHTMLAttributes<HTMLTextAreaElement> {
  error?: boolean;
}

export const Textarea = React.forwardRef<HTMLTextAreaElement, TextareaProps>(
  ({ className, error, ...props }, ref) => (
    <textarea
      ref={ref}
      aria-invalid={error || undefined}
      className={cn(baseInput, "h-auto min-h-[88px] resize-y py-2", className)}
      {...props}
    />
  ),
);
Textarea.displayName = "Textarea";

// ---------------------------------------------------------------------------
// Select — native, so it plays nicely with forms
// ---------------------------------------------------------------------------

export interface SelectProps
  extends React.SelectHTMLAttributes<HTMLSelectElement> {
  error?: boolean;
}

export const Select = React.forwardRef<HTMLSelectElement, SelectProps>(
  ({ className, error, children, ...props }, ref) => (
    <select
      ref={ref}
      aria-invalid={error || undefined}
      className={cn(baseInput, "pr-8", className)}
      {...props}
    >
      {children}
    </select>
  ),
);
Select.displayName = "Select";

// ---------------------------------------------------------------------------
// Checkbox
// ---------------------------------------------------------------------------

export interface CheckboxProps
  extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: React.ReactNode;
}

export const Checkbox = React.forwardRef<HTMLInputElement, CheckboxProps>(
  ({ className, label, id, ...props }, ref) => {
    const input = (
      <input
        ref={ref}
        id={id}
        type="checkbox"
        className={cn(
          "size-4 shrink-0 cursor-pointer rounded border-[var(--border)] text-[var(--primary)]",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color-mix(in_oklch,var(--primary)_25%,transparent)]",
          "disabled:cursor-not-allowed disabled:opacity-50",
          className,
        )}
        {...props}
      />
    );

    if (!label) return input;

    return (
      <label
        htmlFor={id}
        className="inline-flex cursor-pointer items-center gap-2 text-sm"
      >
        {input}
        <span>{label}</span>
      </label>
    );
  },
);
Checkbox.displayName = "Checkbox";

// ---------------------------------------------------------------------------
// PasswordInput — with reveal toggle
// ---------------------------------------------------------------------------

export interface PasswordInputProps
  extends React.InputHTMLAttributes<HTMLInputElement> {
  error?: boolean;
}

export const PasswordInput = React.forwardRef<
  HTMLInputElement,
  PasswordInputProps
>(({ className, error, ...props }, ref) => {
  const [visible, setVisible] = React.useState(false);

  return (
    <div className="relative">
      <input
        ref={ref}
        type={visible ? "text" : "password"}
        aria-invalid={error || undefined}
        className={cn(baseInput, "pr-10", className)}
        {...props}
      />
      <button
        type="button"
        tabIndex={-1}
        onClick={() => setVisible((v) => !v)}
        aria-label={visible ? "Hide password" : "Show password"}
        className="absolute right-2 top-1/2 grid size-7 -translate-y-1/2 place-items-center rounded-md text-[var(--muted)] transition-colors hover:bg-[var(--surface-hi)] hover:text-[var(--fg)]"
      >
        {visible ? (
          <svg
            xmlns="http://www.w3.org/2000/svg"
            width="14"
            height="14"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M9.88 9.88a3 3 0 1 0 4.24 4.24" />
            <path d="M10.73 5.08A10.43 10.43 0 0 1 12 5c7 0 10 7 10 7a13.16 13.16 0 0 1-1.67 2.68" />
            <path d="M6.61 6.61A13.526 13.526 0 0 0 2 12s3 7 10 7a9.74 9.74 0 0 0 5.39-1.61" />
            <line x1="2" x2="22" y1="2" y2="22" />
          </svg>
        ) : (
          <svg
            xmlns="http://www.w3.org/2000/svg"
            width="14"
            height="14"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z" />
            <circle cx="12" cy="12" r="3" />
          </svg>
        )}
      </button>
    </div>
  );
});
PasswordInput.displayName = "PasswordInput";