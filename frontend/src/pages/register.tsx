import { useCallback, useEffect, useRef, useState } from "react";
import {
  BarChart3,
  CheckCircle2,
  Menu,
  ScanLine,
  ShieldCheck,
  X,
} from "lucide-react";

import { APP_NAME, APP_TAGLINE } from "@/lib/constants";
import { RegisterForm } from "@/components/auth/register-form";

const FEATURES = [
  {
    icon: ShieldCheck,
    label: "Bank-grade encryption",
    detail: "TLS 1.3 in transit · AES-256 at rest",
  },
  {
    icon: ScanLine,
    label: "Multi-signal KYC",
    detail: "Your information is encrypted end to end.",
  },
  {
    icon: BarChart3,
    label: "Full audit trail",
    detail: "Every action logged, PII redacted",
  },
];

const SPLIT_MS = 500;

export default function RegisterPage() {
  const [open, setOpen] = useState(false);
  const toggleRef = useRef<HTMLButtonElement>(null);

  const toggle = useCallback(() => setOpen((v) => !v), []);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setOpen(false);
        toggleRef.current?.focus();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  return (
    <div className="relative min-h-screen bg-[var(--bg)]">
      <div
        aria-hidden
        className="pointer-events-none fixed inset-0"
        style={{
          background:
            "radial-gradient(50% 40% at 20% 0%, color-mix(in oklch, var(--primary) 8%, transparent), transparent 60%), " +
            "radial-gradient(40% 30% at 100% 100%, color-mix(in oklch, var(--primary) 5%, transparent), transparent 60%)",
        }}
      />

      {/*
        Register form is taller and has more fields, so the split is
        40% brand / 60% form — the opposite of login.
      */}
      <div
        className="relative grid min-h-screen transition-[grid-template-columns] ease-out"
        style={{
          gridTemplateColumns: open ? "40% 60%" : "0% 100%",
          transitionDuration: `${SPLIT_MS}ms`,
        }}
      >
        {/* Brand panel */}
        <aside
          aria-hidden={!open}
          className="relative min-w-0 overflow-hidden bg-[var(--navy)]"
        >
          <div
            className="flex h-full flex-col p-12 text-white"
            style={{
              width: "40vw",
              opacity: open ? 1 : 0,
              transition: open
                ? `opacity 260ms ease-out ${SPLIT_MS - 240}ms`
                : "opacity 120ms ease-in",
            }}
          >
            <div
              aria-hidden
              className="pointer-events-none absolute inset-0"
              style={{
                background:
                  "radial-gradient(60% 50% at 15% 0%, rgba(37,99,235,0.30), transparent 60%), " +
                  "radial-gradient(50% 40% at 90% 90%, rgba(37,99,235,0.18), transparent 60%)",
              }}
            />
            <div
              aria-hidden
              className="pointer-events-none absolute inset-0 opacity-[0.04]"
              style={{
                backgroundImage:
                  "linear-gradient(to right, #fff 1px, transparent 1px), " +
                  "linear-gradient(to bottom, #fff 1px, transparent 1px)",
                backgroundSize: "48px 48px",
              }}
            />

            <div className="relative">
              <span className="grid size-10 place-items-center rounded-xl bg-[var(--primary)] text-white shadow-[0_8px_32px_-8px_rgba(37,99,235,0.7)]">
                <ShieldCheck className="size-5" />
              </span>
              <p className="mt-4 text-base font-extrabold tracking-tight">
                {APP_NAME}
              </p>
              <p className="mt-0.5 text-[10px] uppercase tracking-widest text-white/50">
                {APP_TAGLINE}
              </p>
            </div>

            <div className="relative mt-auto mb-auto">
              <h2 className="text-3xl font-extrabold leading-tight tracking-tight">
                Get verified
                <br />
                in a single upload.
              </h2>
              <p className="mt-4 text-sm leading-relaxed text-white/60">
                Create your account, upload an ID, and let the pipeline
                do the rest — extraction, screening, and risk
                classification, typically in under ten seconds.
              </p>

              <ul className="mt-8 space-y-4">
                {FEATURES.map(({ icon: Icon, label, detail }) => (
                  <li key={label} className="flex items-start gap-3">
                    <span className="mt-0.5 grid size-8 shrink-0 place-items-center rounded-lg bg-white/10">
                      <Icon className="size-4 text-white" />
                    </span>
                    <div>
                      <p className="text-sm font-semibold">{label}</p>
                      <p className="text-xs text-white/50">{detail}</p>
                    </div>
                  </li>
                ))}
              </ul>
            </div>

            <div className="relative flex items-center gap-2 text-xs text-white/40">
              <CheckCircle2 className="size-3.5" />
              <span>
                © {new Date().getFullYear()} {APP_NAME} · Sandbox environment
              </span>
            </div>
          </div>
        </aside>

        {/* Form column */}
        <main className="relative flex items-center justify-center px-6 py-12">
          <div className="w-full max-w-[520px]">
            <div className="relative rounded-2xl border border-[var(--border)] bg-white p-8 shadow-[var(--shadow-lg)]">
              <button
                ref={toggleRef}
                type="button"
                onClick={toggle}
                aria-label={open ? "Hide product information" : "Show product information"}
                aria-expanded={open}
                className="absolute right-3 top-3 grid size-9 place-items-center rounded-lg text-[var(--muted)] transition-colors hover:bg-[var(--surface-hi)] hover:text-[var(--fg)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color-mix(in_oklch,var(--primary)_30%,transparent)]"
              >
                {open ? (
                  <X className="size-4" />
                ) : (
                  <Menu className="size-4" />
                )}
              </button>

              <div className="flex flex-col items-center text-center">
                <span className="grid size-12 place-items-center rounded-xl bg-[var(--primary)] text-white shadow-[0_8px_24px_-8px_rgba(37,99,235,0.6)]">
                  <ShieldCheck className="size-6" />
                </span>
                <h1 className="mt-4 text-xl font-extrabold tracking-tight">
                  Create your account
                </h1>
                <p className="mt-1 text-sm text-[var(--muted)]">
                  Sign up to start your KYC verification.
                </p>
              </div>

              <div className="mt-8">
                <RegisterForm />
              </div>
            </div>

            <p className="mt-6 text-center text-xs text-[var(--muted)]">
              © {new Date().getFullYear()} {APP_NAME} · Sandbox environment
            </p>
          </div>
        </main>
      </div>
    </div>
  );
}
