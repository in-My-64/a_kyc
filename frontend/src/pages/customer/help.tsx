// src/pages/customer/help.tsx
"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import {
  BookOpen,
  ChevronDown,
  FileCheck2,
  FileText,
  LifeBuoy,
  Mail,
  MessageSquare,
  Search,
  Shield,
  Upload,
  type LucideIcon,
} from "lucide-react";

import {
  ACCEPTED_FILE_INPUT,
  DOC_TYPE_OPTIONS,
  MAX_UPLOAD_BYTES,
  ROUTES,
} from "@/lib/constants";
import { formatBytes, cn } from "@/lib/utils";
import { Button } from "@/components/ui/primitives";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/surfaces";
import { SupportHeroArt } from "@/components/illustrations";

// ---------------------------------------------------------------------------
// Derived content — no strings drift from the backend
// ---------------------------------------------------------------------------

const ACCEPTED_FORMATS = ACCEPTED_FILE_INPUT.split(",")
  .map((m) => m.replace("image/", "").replace("application/", "").toUpperCase())
  .join(", ");

const DOCUMENT_TYPES = DOC_TYPE_OPTIONS.filter((d) => d.value !== "unknown").map(
  (d) => d.label,
);

/**
 * Customer-facing summary of what happens during review.
 *
 * Every line describes what the customer experiences, never the
 * mechanism we use to produce it. No engine names, no "watchlist",
 * no "risk tier", no "pipeline" — those are internal vocabulary and
 * must not surface here. If a step in the backend chain is renamed
 * or added, update this list by describing the customer-visible
 * effect, not the task name.
 */
const PIPELINE_SUMMARY = [
  "We prepare your upload for review.",
  "We read the information from your document.",
  "We confirm the details we've captured.",
  "We check the quality of your document.",
  "We review your account and history.",
  "We complete our required checks.",
  "We finalise the outcome of your application.",
  "We record the result on your account.",
];

// ---------------------------------------------------------------------------
// FAQ data
// ---------------------------------------------------------------------------

interface FaqItem {
  q: string;
  a: React.ReactNode;
}

const FAQS: FaqItem[] = [
  {
    q: "Which documents can I upload?",
    a: (
      <p>
        Any of: <strong>{DOCUMENT_TYPES.join(", ")}</strong>. The document
        must be readable and ideally a flat, well-lit photograph or a PDF
        scan.
      </p>
    ),
  },
  {
    q: "What file types and sizes are accepted?",
    a: (
      <p>
        {ACCEPTED_FORMATS}. Maximum file size is{" "}
        <strong>{formatBytes(MAX_UPLOAD_BYTES)}</strong>. Larger files are
        rejected before upload — compress them first if needed.
      </p>
    ),
  },
  {
    q: "Why was my upload rejected?",
    a: (
      <>
        <p>Two common reasons:</p>
        <ul className="mt-2 list-disc space-y-1 pl-5">
          <li>
            <strong>Duplicate:</strong> the exact same file is already on
            your account. Open it from your applications list instead of
            uploading it again.
          </li>
          <li>
            <strong>Image quality:</strong> the image is either almost
            entirely white (overexposed) or almost entirely black
            (underexposed). Retake the photo with even lighting.
          </li>
        </ul>
        <p className="mt-2">
          A blurry image is accepted but may be flagged — we&apos;ll still
          try to read it.
        </p>
      </>
    ),
  },
  {
    q: "What happens during review?",
    a: (
      <>
        <p>Every application goes through the same steps:</p>
        <ol className="mt-2 list-decimal space-y-1 pl-5">
          {PIPELINE_SUMMARY.map((line, i) => (
            <li key={i}>{line}</li>
          ))}
        </ol>
      </>
    ),
  },
  {
    q: "How long does it take?",
    a: (
      <p>
        Most applications finish in under a minute. If our systems are
        busy, it can take a little longer on the first attempt. You can
        close the page and come back — your application continues on our
        side.
      </p>
    ),
  },
  {
    q: "What do the application statuses mean?",
    a: (
      <ul className="space-y-1">
        <li>
          <strong>In progress</strong> — we&apos;re still reviewing your
          document.
        </li>
        <li>
          <strong>Approved</strong> — your identity is verified. No
          further action is needed.
        </li>
        <li>
          <strong>Under review</strong> — a team member is looking at
          your application and will follow up if anything else is needed.
        </li>
        <li>
          <strong>Not approved</strong> — we couldn&apos;t verify your
          details this time. You can try again or contact support.
        </li>
      </ul>
    ),
  },
  {
    q: "Why is my application taking longer than usual?",
    a: (
      <p>
        Either a team member is looking at it, or a step in the review
        didn&apos;t complete on the first try. Open the application for
        more details, or contact support with your reference number.
      </p>
    ),
  },
  {
    q: "Can I delete a document?",
    a: (
      <p>
        Yes — from the document detail page. Deleting a document also
        removes any applications that used it. This cannot be undone.
      </p>
    ),
  },
];

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function CustomerHelpPage() {
  const [query, setQuery] = useState("");
  const [openFaq, setOpenFaq] = useState<string | null>(FAQS[0].q);

  const filteredFaqs = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return FAQS;
    return FAQS.filter((f) => {
      const text = f.q.toLowerCase();
      return text.includes(q);
    });
  }, [query]);

  return (
    <div className="space-y-6">
      {/* Hero */}
      <Card className="relative overflow-hidden">
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0"
          style={{
            background:
              "radial-gradient(60% 60% at 100% 0%, color-mix(in oklch, var(--primary) 8%, transparent), transparent 60%)",
          }}
        />
        <CardContent className="relative grid items-center gap-6 p-8 sm:grid-cols-[1fr_auto]">
          <div>
            <h1 className="text-3xl font-extrabold tracking-tight">Help centre</h1>
            <p className="mt-2 max-w-md text-sm text-[var(--muted)]">
              Answers to the questions we see most often, plus how to reach
              us when you need a hand.
            </p>
            <div className="relative mt-5 max-w-md">
              <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-[var(--muted)]" />
              <input
                type="search"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search FAQs…"
                className="h-11 w-full rounded-lg border border-[var(--border)] bg-white pl-10 pr-3 text-sm placeholder:text-[var(--muted-2)] focus-visible:border-[var(--primary)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color-mix(in_oklch,var(--primary)_25%,transparent)]"
              />
            </div>
          </div>
          <SupportHeroArt className="hidden h-40 w-auto sm:block" />
        </CardContent>
      </Card>

      {/* Quick links */}
      <div className="grid gap-4 sm:grid-cols-3">
        <QuickCard
          icon={Upload}
          title="Start an application"
          description="Upload a document and begin your review."
          href={ROUTES.customer.apply}
        />
        <QuickCard
          icon={FileCheck2}
          title="Check applications"
          description="See live status for every run."
          href={ROUTES.customer.applications}
        />
        <QuickCard
          icon={Shield}
          title="Review your profile"
          description="Keep your account details current."
          href={ROUTES.customer.profile}
        />
      </div>

      {/* FAQs */}
      <Card>
        <CardHeader className="flex-row items-center justify-between gap-2 space-y-0">
          <div className="flex items-center gap-2">
            <BookOpen className="size-4 text-[var(--muted)]" />
            <CardTitle>Frequently asked questions</CardTitle>
          </div>
          <span className="text-xs text-[var(--muted)]">
            {filteredFaqs.length} of {FAQS.length}
          </span>
        </CardHeader>
        <CardContent className="p-0">
          {filteredFaqs.length === 0 ? (
            <div className="px-6 py-12 text-center">
              <MessageSquare className="mx-auto size-8 text-[var(--muted-2)]" />
              <p className="mt-3 text-sm font-bold">No matches for “{query}”</p>
              <p className="mt-1 text-xs text-[var(--muted)]">
                Try a different search term, or reach out to support below.
              </p>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setQuery("")}
                className="mt-4"
              >
                Clear search
              </Button>
            </div>
          ) : (
            <ul className="divide-y divide-[var(--border)]">
              {filteredFaqs.map((f) => {
                const open = openFaq === f.q;
                return (
                  <li key={f.q}>
                    <button
                      type="button"
                      onClick={() => setOpenFaq(open ? null : f.q)}
                      aria-expanded={open}
                      className="flex w-full items-center gap-3 px-6 py-4 text-left transition-colors hover:bg-[var(--surface-2)]"
                    >
                      <span className="flex-1 text-sm font-bold">{f.q}</span>
                      <ChevronDown
                        className={cn(
                          "size-4 shrink-0 text-[var(--muted)] transition-transform",
                          open && "rotate-180",
                        )}
                      />
                    </button>
                    {open && (
                      <div className="animate-in slide-in-from-top-1 fade-in px-6 pb-4 pl-12 text-sm text-[var(--muted)] duration-150">
                        {f.a}
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </CardContent>
      </Card>

      {/* Support */}
      <Card>
        <CardHeader className="flex-row items-center gap-2 space-y-0">
          <LifeBuoy className="size-4 text-[var(--muted)]" />
          <CardTitle>Still need help?</CardTitle>
        </CardHeader>
        <CardContent className="space-y-5">
          <p className="text-sm text-[var(--muted)]">
            Send us the reference number from your application page — it
            starts with <span className="font-mono font-bold">#KYC-</span>.
            We can trace the exact request on our side.
          </p>

          <div className="grid gap-3 sm:grid-cols-3">
            <ContactCard
              icon={Mail}
              label="Email"
              value="support@kyc.example"
              href="mailto:support@kyc.example"
            />
            <ContactCard
              icon={MessageSquare}
              label="Live chat"
              value="Mon–Fri · 08:00–17:00"
            />
            <ContactCard
              icon={FileText}
              label="Documentation"
              value="Full API reference"
              href="#"
            />
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Small pieces
// ---------------------------------------------------------------------------

function QuickCard({
  icon: Icon,
  title,
  description,
  href,
}: {
  icon: LucideIcon;
  title: string;
  description: string;
  href: string;
}) {
  return (
    <Link href={href}>
      <Card interactive className="h-full p-5">
        <div className="flex items-start gap-3">
          <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-[var(--primary-soft)] text-[var(--primary)]">
            <Icon className="size-5" />
          </span>
          <div className="min-w-0">
            <p className="font-bold">{title}</p>
            <p className="mt-0.5 text-xs text-[var(--muted)]">{description}</p>
          </div>
        </div>
      </Card>
    </Link>
  );
}

function ContactCard({
  icon: Icon,
  label,
  value,
  href,
}: {
  icon: LucideIcon;
  label: string;
  value: string;
  href?: string;
}) {
  const content = (
    <div className="rounded-lg border border-[var(--border)] bg-white p-4 transition-colors hover:border-[var(--primary)] hover:bg-[var(--primary-soft)]/30">
      <Icon className="size-4 text-[var(--primary)]" />
      <p className="mt-2 text-xs font-bold uppercase tracking-wider text-[var(--muted)]">
        {label}
      </p>
      <p className="mt-0.5 text-sm font-semibold">{value}</p>
    </div>
  );

  if (href) return <a href={href}>{content}</a>;
  return content;
}