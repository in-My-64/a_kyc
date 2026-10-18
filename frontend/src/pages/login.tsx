import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/router";
import {
  BarChart3,
  CheckCircle2,
  Menu,
  ScanLine,
  ShieldCheck,
  X,
} from "lucide-react";

import { APP_NAME, APP_TAGLINE } from "@/lib/constants";
import { LoginForm } from "@/components/auth/login-form";

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

export default function LoginPage() {
  const router = useRouter();
  const { next } = router.query as { next?: string };

  // The page has two layouts:
  //   closed — form only, centered, full width
  //   open   — 55% brand panel / 45% form, side by side
  //
  // Same DOM, same route. Only the grid columns and the panel's inner
  // opacity change. `transition-[grid-template-columns]` animates the
  // layout switch cleanly because both endpoints are percentages.
  const [open, setOpen] = useState(false);
  const toggleRef = useRef<HTMLButtonElement>(null);

  const toggle = useCallback(() => setOpen((v) => !v), []);

  // Escape closes the panel and returns focus to the toggle button.
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
      {/* Ambient glow — behind everything, unaffected by the split */}
      <div
        aria-hidden
        className="pointer-events-none fixed inset-0"
        style={{
          background:
            "radial-gradient(50% 40% at 20% 0%, color-mix(in oklch, var(--primary) 8%, transparent), transparent 60%), " +
            "radial-gradient(40% 30% at 100% 100%, color-mix(in oklch, var(--primary) 5%, transparent), transparent 60%)",
        }}
      />

      <div
        className="relative grid min-h-screen transition-[grid-template-columns] ease-out"
        style={{
          gridTemplateColumns: open ? "55% 45%" : "0% 100%",
          transitionDuration: `${SPLIT_MS}ms`,
        }}
      >
        {/* ---- Brand panel ------------------------------------------------
            Collapses to 0% width when closed. `overflow-hidden` stops the
            inner content from bleeding into the form column during the
            transition. `min-w-0` lets the grid cell shrink below its
            content size. */}
        <aside
          aria-hidden={!open}
          className="relative min-w-0 overflow-hidden bg-[var(--navy)]"
        >
          {/*
            Fixed-width inner wrapper. 55vw matches the grid cell at its
            open width, so text and icons never reflow while the panel
            animates. Without this, the headline would wrap-and-rewrap
            as the panel widened.
          */}
          <div
            className="flex h-full flex-col p-12 text-white"
            style={{
              width: "55vw",
              opacity: open ? 1 : 0,
              // Fade in after the panel has opened a bit; snap out instantly on close.
              transition: open
                ? `opacity 260ms ease-out ${SPLIT_MS - 240}ms`
                : "opacity 120ms ease-in",
            }}
          >
            {/* Ambient glows */}
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

            {/* Brand */}
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

            {/* Headline */}
            <div className="relative mt-auto mb-auto max-w-md">
              <h2 className="text-3xl font-extrabold leading-tight tracking-tight">
                Identity verification
                <br />
                without the paperwork.
              </h2>
              <p className="mt-4 text-sm leading-relaxed text-white/60">
                Upload a document, get back an extracted profile, an
                authenticity verdict, a screening result, and a risk
                tier — typically in under ten seconds.
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

            {/* Footer */}
            <div className="relative flex items-center gap-2 text-xs text-white/40">
              <CheckCircle2 className="size-3.5" />
              <span>
                © {new Date().getFullYear()} {APP_NAME} · Sandbox environment
              </span>
            </div>
          </div>
        </aside>

        {/* ---- Form column ----------------------------------------------- */}
        <main className="relative flex items-center justify-center px-6 py-12">
          <div className="w-full max-w-[400px]">
            <div className="relative rounded-2xl border border-[var(--border)] bg-white p-8 shadow-[var(--shadow-lg)]">
              {/* Toggle — always present, swaps icon on state */}
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

              {/* Brand header — hidden when the panel is open on lg,
                  because the aside already shows the brand. Kept visible
                  on mobile where the aside is collapsed. */}
              <div className="flex flex-col items-center text-center lg:block">
                <div className="flex flex-col items-center text-center">
                  <span className="grid size-12 place-items-center rounded-xl bg-[var(--primary)] text-white shadow-[0_8px_24px_-8px_rgba(37,99,235,0.6)]">
                    <ShieldCheck className="size-6" />
                  </span>
                  <h1 className="mt-4 text-xl font-extrabold tracking-tight">
                    {APP_NAME}
                  </h1>
                  <p className="mt-1 text-sm text-[var(--muted)]">
                    Welcome back. Sign in to continue.
                  </p>
                </div>
              </div>

              <div className="mt-8">
                <LoginForm next={next} />
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
