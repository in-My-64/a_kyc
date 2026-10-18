// src/pages/customer/apply.tsx
"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/router";
import {
  ArrowLeft,
  ArrowRight,
  Check,
  FileText,
  ShieldCheck,
  UploadCloud,
  X,
} from "lucide-react";

import {
  ACCEPTED_FILE_INPUT,
  DOC_TYPE_OPTIONS,
  MAX_UPLOAD_BYTES,
  ROUTES,
} from "@/lib/constants";
import { useStartKyc, useUploadDocument, useUploadSelfie } from "@/lib/hooks";
import { cn, formatBytes, truncate } from "@/lib/utils";
import { ApiError } from "@/lib/api";
import type { DocType, Document as DocumentType } from "@/lib/types";
import { Button } from "@/components/ui/primitives";
import { Alert, Card, CardContent } from "@/components/ui/surfaces";
import { useErrorModal } from "@/components/ui/error-modal";
import { SelfieCapture } from "@/components/kyc/selfie-capture";
import {
  DriversLicenseArt,
  NationalIdArt,
  PassportArt,
} from "@/components/documents/doc-illustrations";

// ===========================================================================
// Types + constants
// ===========================================================================

type WizardStep = 1 | 2 | 3 | 4;

const STEPS: { id: WizardStep; label: string }[] = [
  { id: 1, label: "Choose Document" },
  { id: 2, label: "Upload ID" },
  { id: 3, label: "Take Selfie" },
  { id: 4, label: "Confirm & Submit" },
];

const DOC_ART: Record<
  Exclude<DocType, "unknown">,
  React.ComponentType<{ className?: string; strokeWidth?: number }>
> = {
  national_id: NationalIdArt,
  passport: PassportArt,
  licence: DriversLicenseArt,
};

const DOCUMENT_REQUIREMENTS: { label: string; hint?: string }[] = [
  { label: "Clear and readable image or scan" },
  { label: "All corners visible" },
  { label: "No glare or blur" },
  { label: "File size less than", hint: formatBytes(MAX_UPLOAD_BYTES) },
  { label: "Accepted formats", hint: "JPG, PNG, TIFF, HEIC, PDF" },
];

// ===========================================================================
// Page
// ===========================================================================

export default function ApplyPage() {
  const router = useRouter();
  const errorModal = useErrorModal();

  const [step, setStep] = useState<WizardStep>(1);
  const [docType, setDocType] = useState<DocType | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [uploaded, setUploaded] = useState<DocumentType | null>(null);
  const [selfie, setSelfie] = useState<File | null>(null);
  const [uploadedSelfieId, setUploadedSelfieId] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Reset the uploaded document when the user steps back to re-pick.
  useEffect(() => {
    if (step === 2 && uploaded) setUploaded(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step]);

  function goNext() {
    if (step === 1 && docType) setStep(2);
    else if (step === 2 && file) setStep(3);
    // 3 → 4 happens after selfie upload succeeds.
  }

  function goBack() {
    setError(null);
    if (step === 4) {
      // Clear the uploaded selfie id so retaking re-uploads.
      setUploadedSelfieId(null);
    }
    if (step > 1) setStep((step - 1) as WizardStep);
  }

  const upload = useUploadDocument({
    onSuccess: (doc) => {
      setUploaded(doc);
      setStep(3);
    },
    onError: (err) => {
      if (err instanceof ApiError) {
        const body = err.body as
          | {
              detail?: {
                existing_document_id?: number;
                existing_filename?: string;
              };
              error?: string;
            }
          | undefined;

        if (body?.error === "duplicate_document") {
          const existingId = body.detail?.existing_document_id;
          const existingName = body.detail?.existing_filename;

          errorModal.show({
            severity: "warning",
            title: "This document is already on file",
            message: existingId
              ? `You've already uploaded this exact file to your account. It lives on your applications list — open it there instead of uploading a duplicate.`
              : "You've already uploaded this exact file to your account.",
            details: [
              existingId ? `Existing document ID: #${existingId}` : "",
              existingName ? `Filename: ${existingName}` : "",
              "If this is a mistake, pick a different file and try again.",
            ].filter(Boolean),
            actions: [
              {
                label: "Choose a different file",
                variant: "outline",
                onClick: () => setFile(null),
              },
              {
                label: "View in My Applications",
                variant: "primary",
                onClick: () => router.push(ROUTES.customer.applications),
              },
            ],
          });
          return;
        }

        setError(err.message);
        return;
      }
      setError("Upload failed. Please try again.");
    },
  });

  const uploadSelfie = useUploadSelfie({
    onSuccess: (data) => {
      setUploadedSelfieId(data.id);
      setStep(4);
    },
    onError: (err) => {
      setError(
        err instanceof ApiError ? err.message : "Couldn't upload your selfie.",
      );
    },
  });

  const start = useStartKyc({
    onSuccess: (data) => {
      router.replace(ROUTES.kycStatus(data.tracking_id));
    },
    onError: (err) => {
      if (err instanceof ApiError) {
        const body = err.body as
          | { detail?: { tracking_id?: string }; message?: string }
          | undefined;
        const existing = body?.detail?.tracking_id;
        if (existing) {
          router.replace(ROUTES.kycStatus(existing));
          return;
        }
        setError(err.message);
        return;
      }
      setError("Couldn't start the review. Please try again.");
    },
  });

  function handleUpload() {
    if (!file || !docType) return;
    setError(null);
    upload.mutate({ file, docType });
  }

  function handleUploadSelfie() {
    if (!selfie) return;
    setError(null);
    uploadSelfie.mutate({ file: selfie });
  }

  function handleStart() {
    if (!uploaded || uploadedSelfieId === null) return;
    setError(null);
    start.mutate({ documentId: uploaded.id, selfieId: uploadedSelfieId });
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-extrabold tracking-tight">
          New Application
        </h1>
        <p className="mt-1 text-sm text-[var(--muted)]">
          Complete the steps below to start your identity verification.
        </p>
      </div>

      <Stepper current={step} />

      {error && (
        <Alert tone="danger" title="Something went wrong">
          {error}
        </Alert>
      )}

      <Card>
        <CardContent className="p-6">
          {step === 1 && (
            <ChooseTypeStep value={docType} onChange={setDocType} />
          )}
          {step === 2 && (
            <UploadStep
              file={file}
              onFile={setFile}
              disabled={upload.isPending}
            />
          )}
          {step === 3 && (
            <SelfieStep
              selfie={selfie}
              onSelfie={setSelfie}
              uploading={uploadSelfie.isPending}
            />
          )}
          {step === 4 && uploaded && uploadedSelfieId !== null && (
            <ConfirmStep
              document={uploaded}
              selfieId={uploadedSelfieId}
              onStart={handleStart}
              starting={start.isPending}
            />
          )}
        </CardContent>
      </Card>

      <div className="flex items-center justify-between">
        {step === 1 ? (
          <Button asChild variant="outline">
            <Link href={ROUTES.customer.dashboard}>
              <ArrowLeft className="size-3.5" />
              Cancel
            </Link>
          </Button>
        ) : (
          <Button
            variant="outline"
            onClick={goBack}
            disabled={upload.isPending || uploadSelfie.isPending || start.isPending}
          >
            <ArrowLeft className="size-3.5" />
            Back
          </Button>
        )}

        {step === 1 && (
          <Button onClick={goNext} disabled={!docType}>
            Next
            <ArrowRight className="size-3.5" />
          </Button>
        )}
        {step === 2 && (
          <Button
            onClick={handleUpload}
            loading={upload.isPending}
            disabled={!file}
          >
            {upload.isPending ? "Uploading…" : "Upload"}
            {!upload.isPending && <ArrowRight className="size-3.5" />}
          </Button>
        )}
        {step === 3 && (
          <Button
            onClick={handleUploadSelfie}
            loading={uploadSelfie.isPending}
            disabled={!selfie}
          >
            {uploadSelfie.isPending ? "Uploading…" : "Continue"}
            {!uploadSelfie.isPending && <ArrowRight className="size-3.5" />}
          </Button>
        )}
      </div>
    </div>
  );
}

// ===========================================================================
// Stepper
// ===========================================================================

function Stepper({ current }: { current: WizardStep }) {
  return (
    <ol className="flex items-center gap-2 overflow-x-auto rounded-xl border border-[var(--border)] bg-white p-4 shadow-[var(--shadow-xs)]">
      {STEPS.map(({ id, label }, i) => {
        const done = id < current;
        const active = id === current;
        return (
          <li
            key={id}
            className="flex min-w-[140px] flex-1 items-center gap-2"
          >
            <span
              className={cn(
                "grid size-7 shrink-0 place-items-center rounded-full text-xs font-bold",
                done && "bg-[var(--primary)] text-white",
                active &&
                  "border-2 border-[var(--primary)] bg-white text-[var(--primary)]",
                !done &&
                  !active &&
                  "border border-[var(--border)] bg-white text-[var(--muted)]",
              )}
            >
              {done ? <Check className="size-3.5" strokeWidth={3} /> : id}
            </span>
            <span
              className={cn(
                "text-xs",
                done || active
                  ? "font-bold text-[var(--fg)]"
                  : "font-semibold text-[var(--muted)]",
              )}
            >
              {label}
            </span>
            {i < STEPS.length - 1 && (
              <span
                aria-hidden
                className={cn(
                  "ml-2 hidden h-px flex-1 sm:block",
                  done ? "bg-[var(--primary)]" : "bg-[var(--border)]",
                )}
              />
            )}
          </li>
        );
      })}
    </ol>
  );
}

// ===========================================================================
// Step 1 — Choose Document Type
// ===========================================================================

function ChooseTypeStep({
  value,
  onChange,
}: {
  value: DocType | null;
  onChange: (v: DocType) => void;
}) {
  const types = DOC_TYPE_OPTIONS.filter((o) => o.value !== "unknown");

  return (
    <div>
      <h2 className="text-base font-bold">
        Choose the type of identity document
      </h2>
      <p className="mt-1 text-sm text-[var(--muted)]">
        Pick the document you&apos;ll upload. This helps us review it
        correctly.
      </p>

      <div className="mt-6 grid gap-4 sm:grid-cols-3">
        {types.map(({ value: v, label }) => {
          const Art = DOC_ART[v as Exclude<DocType, "unknown">];
          const active = value === v;
          return (
            <button
              key={v}
              type="button"
              onClick={() => onChange(v)}
              className={cn(
                "group flex flex-col items-stretch rounded-xl border-2 p-4 text-center transition-all",
                active
                  ? "border-[var(--primary)] bg-[var(--primary-soft)]"
                  : "border-[var(--border)] hover:border-[var(--border-hi)] hover:bg-[var(--surface-2)]",
              )}
            >
              <div className="mb-4 flex items-center justify-center rounded-lg bg-white p-4">
                <Art className="h-32 w-auto max-w-full drop-shadow-sm" />
              </div>

              <p className="font-bold text-[var(--fg)]">{label}</p>
              <p className="mt-0.5 text-xs text-[var(--muted)]">
                Use your {label.toLowerCase()}
              </p>

              <span
                className={cn(
                  "mx-auto mt-3 grid size-5 place-items-center rounded-full border-2 transition-colors",
                  active
                    ? "border-[var(--primary)] bg-[var(--primary)]"
                    : "border-[var(--border-hi)] group-hover:border-[var(--primary)]",
                )}
              >
                {active && (
                  <Check className="size-3 text-white" strokeWidth={3} />
                )}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

// ===========================================================================
// Step 2 — Upload Document
// ===========================================================================

function UploadStep({
  file,
  onFile,
  disabled,
}: {
  file: File | null;
  onFile: (f: File | null) => void;
  disabled: boolean;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [isDragging, setIsDragging] = useState(false);

  const handleDrop = useCallback(
    (e: React.DragEvent<HTMLDivElement>) => {
      e.preventDefault();
      setIsDragging(false);
      const dropped = e.dataTransfer.files?.[0] ?? null;
      onFile(dropped);
    },
    [onFile],
  );

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-base font-bold">Upload your document</h2>
        <p className="mt-1 text-sm text-[var(--muted)]">
          Make sure the whole document is visible and in focus.
        </p>
      </div>

      <div
        role="button"
        tabIndex={0}
        onClick={() => !disabled && inputRef.current?.click()}
        onKeyDown={(e) => {
          if ((e.key === "Enter" || e.key === " ") && !disabled) {
            e.preventDefault();
            inputRef.current?.click();
          }
        }}
        onDrop={handleDrop}
        onDragOver={(e) => {
          e.preventDefault();
          if (!disabled) setIsDragging(true);
        }}
        onDragLeave={() => setIsDragging(false)}
        className={cn(
          "flex cursor-pointer flex-col items-center gap-3 rounded-xl border-2 border-dashed p-10 text-center transition-colors",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color-mix(in_oklch,var(--primary)_25%,transparent)]",
          disabled && "cursor-not-allowed opacity-60",
          file
            ? "border-[var(--primary)] bg-[var(--primary-soft)]"
            : isDragging
            ? "border-[var(--primary)] bg-[color-mix(in_oklch,var(--primary)_6%,transparent)]"
            : "border-[var(--border-hi)] hover:border-[var(--primary)] hover:bg-[var(--surface-2)]",
        )}
      >
        <span
          className={cn(
            "grid size-14 place-items-center rounded-full",
            file
              ? "bg-[var(--primary)] text-white"
              : "bg-[var(--surface-hi)] text-[var(--primary)]",
          )}
        >
          {file ? (
            <Check className="size-7" strokeWidth={2.5} />
          ) : (
            <UploadCloud className="size-7" />
          )}
        </span>
        <div className="min-w-0">
          <p className="text-sm font-bold">
            {file
              ? truncate(file.name, 48)
              : isDragging
              ? "Drop to upload"
              : "Click to upload or drag and drop"}
          </p>
          <p className="mt-1 text-xs text-[var(--muted)]">
            {file
              ? formatBytes(file.size)
              : "JPG, PNG, TIFF, HEIC or PDF · max 10 MB"}
          </p>
        </div>

        <input
          ref={inputRef}
          type="file"
          accept={ACCEPTED_FILE_INPUT}
          disabled={disabled}
          onChange={(e) => onFile(e.target.files?.[0] ?? null)}
          className="hidden"
        />
      </div>

      {file && (
        <div className="flex items-center justify-between gap-3 rounded-lg border border-[var(--border)] bg-[var(--surface-2)] p-3">
          <div className="flex min-w-0 items-center gap-2">
            <FileText className="size-4 shrink-0 text-[var(--primary)]" />
            <p className="min-w-0 truncate text-xs font-semibold">
              {file.name}
            </p>
          </div>
          <button
            type="button"
            onClick={() => onFile(null)}
            disabled={disabled}
            aria-label="Remove file"
            className="grid size-7 shrink-0 place-items-center rounded-md text-[var(--muted)] transition-colors hover:bg-[var(--surface-hi)] hover:text-[var(--fg)] disabled:opacity-50"
          >
            <X className="size-3.5" />
          </button>
        </div>
      )}

      <div className="rounded-xl border border-[var(--border)] bg-[var(--surface-2)] p-5">
        <h3 className="text-sm font-bold">Document requirements</h3>
        <ul className="mt-3 space-y-2">
          {DOCUMENT_REQUIREMENTS.map(({ label, hint }) => (
            <li
              key={label + (hint ?? "")}
              className="flex items-start gap-2.5 text-xs"
            >
              <span className="mt-0.5 grid size-4 shrink-0 place-items-center rounded-full bg-[var(--success-soft)] text-[var(--success)]">
                <Check className="size-2.5" strokeWidth={3.5} />
              </span>
              <span className="text-[var(--fg)]">
                {label}
                {hint && (
                  <span className="font-bold text-[var(--fg)]"> {hint}</span>
                )}
              </span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

// ===========================================================================
// Step 3 — Selfie
// ===========================================================================

function SelfieStep({
  selfie,
  onSelfie,
  uploading,
}: {
  selfie: File | null;
  onSelfie: (f: File | null) => void;
  uploading: boolean;
}) {
  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-base font-bold">Take a selfie</h2>
        <p className="mt-1 text-sm text-[var(--muted)]">
          We&apos;ll compare this photo with the one on your document to
          confirm your identity.
        </p>
      </div>

      <SelfieCapture value={selfie} onChange={onSelfie} disabled={uploading} />

      <div className="rounded-xl border border-[var(--border)] bg-[var(--surface-2)] p-5">
        <h3 className="text-sm font-bold">Tips for a good selfie</h3>
        <ul className="mt-3 space-y-2 text-xs">
          {[
            "Look directly at the camera, eyes open.",
            "Remove glasses, hats, and face coverings.",
            "Find even lighting — avoid backlight and harsh shadows.",
            "Hold still while the photo is taken.",
          ].map((tip) => (
            <li key={tip} className="flex items-start gap-2.5">
              <span className="mt-0.5 grid size-4 shrink-0 place-items-center rounded-full bg-[var(--success-soft)] text-[var(--success)]">
                <Check className="size-2.5" strokeWidth={3.5} />
              </span>
              <span>{tip}</span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

// ===========================================================================
// Step 4 — Confirm & Submit
// ===========================================================================

function ConfirmStep({
  document,
  selfieId,
  onStart,
  starting,
}: {
  document: DocumentType;
  selfieId: number;
  onStart: () => void;
  starting: boolean;
}) {
  const fileName = document.file.split("/").pop() ?? `#${document.id}`;
  const docTypeLabel =
    DOC_TYPE_OPTIONS.find((o) => o.value === document.doc_type)?.label ??
    document.doc_type;

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-base font-bold">Confirm &amp; submit</h2>
        <p className="mt-1 text-sm text-[var(--muted)]">
          We&apos;ll review your document and selfie. This usually takes
          under a minute.
        </p>
      </div>

      <div className="rounded-xl border border-[var(--border)] bg-[var(--surface-2)] p-5">
        <dl className="grid gap-4 sm:grid-cols-2">
          <Field label="File" value={truncate(fileName, 48)} mono />
          <Field label="Type" value={docTypeLabel} />
          <Field label="Document ID" value={`#${document.id}`} mono />
          <Field label="Selfie ID" value={`#${selfieId}`} mono />
          <Field
            label="Uploaded"
            value={new Date(document.uploaded_at).toLocaleString("en-GB", {
              day: "numeric",
              month: "short",
              year: "numeric",
              hour: "2-digit",
              minute: "2-digit",
            })}
          />
        </dl>
      </div>

      <div className="flex items-start gap-3 rounded-xl border border-[var(--info-border)] bg-[var(--info-soft)] p-4 text-sm">
        <ShieldCheck className="mt-0.5 size-4 shrink-0 text-[var(--info)]" />
        <p className="text-[var(--fg)]">
          Once you start, we&apos;ll review your document and selfie. This
          usually takes under a minute. You can close this tab and follow
          progress from your dashboard.
        </p>
      </div>

      <div className="flex justify-end">
        <Button size="lg" onClick={onStart} loading={starting}>
          {starting ? "Starting…" : "Start review"}
          {!starting && <ArrowRight className="size-3.5" />}
        </Button>
      </div>
    </div>
  );
}

function Field({
  label,
  value,
  mono,
}: {
  label: string;
  value: string;
  mono?: boolean;
}) {
  return (
    <div>
      <dt className="text-xs font-bold text-[var(--muted)]">{label}</dt>
      <dd className={cn("mt-0.5 text-sm", mono && "font-mono text-xs")}>
        {value}
      </dd>
    </div>
  );
}
