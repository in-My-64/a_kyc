// src/components/kyc/reference-card.tsx
"use client";

import { useState } from "react";
import { Check, Copy } from "lucide-react";

import { cn } from "@/lib/utils";
import { useToast } from "@/components/ui/toast";

/**
 * Displays the human-readable workflow reference (KYC-2026-0042).
 *
 * Never renders the tracking_id UUID. If you need the UUID visible,
 * render it separately — it belongs in the officer header only, not
 * on any customer surface.
 */
export function ReferenceCard({
  reference,
  label = "Reference",
  size = "md",
  className,
}: {
  reference: string;
  label?: string;
  size?: "sm" | "md" | "lg";
  className?: string;
}) {
  const toast = useToast();
  const [copied, setCopied] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(reference);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      toast.push({
        severity: "info",
        title: "Couldn't copy",
        message: "Your browser blocked clipboard access.",
      });
    }
  }

  const sizeClasses = {
    sm: { label: "text-[10px]", code: "text-sm" },
    md: { label: "text-[10px]", code: "text-base" },
    lg: { label: "text-xs",     code: "text-xl" },
  }[size];

  return (
    <div
      className={cn(
        "inline-flex items-center gap-3 rounded-xl border border-[var(--border)] bg-white px-4 py-2.5 shadow-[var(--shadow-xs)]",
        className,
      )}
    >
      <div className="min-w-0">
        <p
          className={cn(
            "font-extrabold uppercase tracking-[0.14em] text-[var(--muted-2)]",
            sizeClasses.label,
          )}
        >
          {label}
        </p>
        <p
          className={cn(
            "mt-0.5 font-mono font-extrabold tracking-tight text-[var(--fg)]",
            sizeClasses.code,
          )}
        >
          {reference}
        </p>
      </div>
      <button
        type="button"
        onClick={copy}
        aria-label={`Copy ${label.toLowerCase()}`}
        className="grid size-7 shrink-0 place-items-center rounded-lg text-[var(--muted-2)] transition-colors hover:bg-[var(--surface-hi)] hover:text-[var(--fg)]"
      >
        {copied ? (
          <Check className="size-3.5 text-[var(--success)]" strokeWidth={3} />
        ) : (
          <Copy className="size-3.5" />
        )}
      </button>
    </div>
  );
}