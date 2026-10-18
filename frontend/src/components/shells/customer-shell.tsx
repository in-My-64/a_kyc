// src/components/shells/customer-shell.tsx
"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/router";
import {
  Bell,
  FilePlus2,
  Files,
  HelpCircle,
  LayoutDashboard,
  LogOut,
  Menu,
  Search,
  ShieldCheck,
  User,
} from "lucide-react";

import { cn } from "@/lib/utils";
import { APP_NAME, APP_TAGLINE, ROUTES } from "@/lib/constants";
import { useMe } from "@/lib/hooks";

const TABS = [
  { label: "Dashboard",       href: ROUTES.customer.dashboard,    icon: LayoutDashboard },
  { label: "New Application", href: ROUTES.customer.apply,        icon: FilePlus2 },
  { label: "My Applications", href: ROUTES.customer.applications, icon: Files },
  { label: "Profile",         href: ROUTES.customer.profile,      icon: User },
  { label: "Help",            href: ROUTES.customer.help,         icon: HelpCircle },
];

// ---------------------------------------------------------------------------
// Active-state resolution
//
// Dashboard's href is /customer, which is a prefix of every other tab
// in this nav. A naive startsWith lights Dashboard up on every page.
// Dashboard matches exactly; everything else matches by exact path or
// by prefix (to keep a tab highlighted on its own sub-routes).
// ---------------------------------------------------------------------------

function isActive(pathname: string, href: string): boolean {
  if (href === ROUTES.customer.dashboard) {
    return pathname === href;
  }
  return pathname === href || pathname.startsWith(`${href}/`);
}

export function CustomerShell({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const { data: user } = useMe();
  const [mobileOpen, setMobileOpen] = useState(false);

  const initials =
    (user?.first_name?.[0] ?? user?.username?.[0] ?? "?").toUpperCase() +
    (user?.last_name?.[0] ?? "").toUpperCase();

  async function handleLogout() {
    await fetch("/api/session", { method: "DELETE" });
    router.replace(ROUTES.login);
  }

  return (
    <div className="flex min-h-screen w-full bg-[var(--bg)]">
      {/* ---- White sidebar (desktop) ------------------------------------- */}
      <aside className="sticky top-0 hidden h-screen w-64 shrink-0 flex-col border-r border-[var(--border)] bg-white lg:flex">
        <SidebarContent
          pathname={router.pathname}
          initials={initials}
          user={user ?? null}
          onLogout={handleLogout}
        />
      </aside>

      {/* ---- Mobile drawer ---------------------------------------------- */}
      {mobileOpen && (
        <div
          className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm lg:hidden"
          onClick={() => setMobileOpen(false)}
        >
          <div
            className="flex h-full w-72 max-w-[80vw] flex-col border-r border-[var(--border)] bg-white"
            onClick={(e) => e.stopPropagation()}
          >
            <SidebarContent
              pathname={router.pathname}
              initials={initials}
              user={user ?? null}
              onLogout={handleLogout}
              onNavigate={() => setMobileOpen(false)}
            />
          </div>
        </div>
      )}

      {/* ---- Right column: top bar + main -------------------------------- */}
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-30 flex h-16 shrink-0 items-center gap-3 border-b border-[var(--border)] bg-white px-4 lg:px-8">
          <button
            type="button"
            onClick={() => setMobileOpen(true)}
            aria-label="Open navigation"
            className="grid size-9 shrink-0 place-items-center rounded-lg text-[var(--muted)] transition-colors hover:bg-[var(--surface-hi)] hover:text-[var(--fg)] lg:hidden"
          >
            <Menu className="size-4" />
          </button>

          <div className="relative hidden max-w-md flex-1 md:block">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-[var(--muted)]" />
            <input
              type="search"
              placeholder="Search applications, documents…"
              className="h-9 w-full rounded-lg border border-[var(--border)] bg-[var(--surface-2)] pl-9 pr-3 text-sm placeholder:text-[var(--muted-2)] focus-visible:border-[var(--primary)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color-mix(in_oklch,var(--primary)_25%,transparent)]"
            />
          </div>

          <div className="ml-auto flex items-center gap-2">
            <button
              type="button"
              aria-label="Notifications"
              className="grid size-9 place-items-center rounded-lg text-[var(--muted)] transition-colors hover:bg-[var(--surface-hi)] hover:text-[var(--fg)]"
            >
              <Bell className="size-4" />
            </button>

            <div className="flex items-center gap-2 rounded-lg border border-[var(--border)] bg-white py-1 pl-1 pr-3">
              <span className="grid size-7 place-items-center rounded-md bg-[var(--primary)] text-xs font-bold text-white">
                {initials}
              </span>
              <div className="hidden text-left sm:block">
                <p className="text-xs font-bold leading-tight">
                  {user?.first_name || user?.username || "—"}
                </p>
                <p className="text-[10px] leading-tight text-[var(--muted)]">
                  {user?.email ?? "Customer"}
                </p>
              </div>
            </div>
          </div>
        </header>

        <main className="w-full flex-1 px-4 py-6 lg:px-8">{children}</main>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Sidebar interior — used by desktop aside and mobile drawer
//
// Visual language matches the reference screenshot:
//   · White background, thin gray right border
//   · Blue shield brand mark at top
//   · Every label full-bold
//   · Icons at 20px, colored to match the item's state
//   · Active row: soft blue fill, blue icon, blue text
//   · Hover row: subtle slate fill
// ---------------------------------------------------------------------------

function SidebarContent({
  pathname,
  initials,
  user,
  onLogout,
  onNavigate,
}: {
  pathname: string;
  initials: string;
  user: {
    first_name?: string;
    last_name?: string;
    username?: string;
    email?: string;
  } | null;
  onLogout: () => void;
  onNavigate?: () => void;
}) {
  return (
    <>
      {/* Brand — blue shield + Z-KYC */}
      <div className="flex h-16 shrink-0 items-center gap-3 border-b border-[var(--border)] px-5">
        <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-[var(--primary)] text-white shadow-[0_4px_12px_-4px_rgba(37,99,235,0.5)]">
          <ShieldCheck className="size-[18px]" strokeWidth={2.5} />
        </span>
        <div className="min-w-0">
          <p className="truncate text-sm font-extrabold tracking-tight text-[var(--fg)]">
            {APP_NAME}
          </p>
          <p className="truncate text-[10px] font-bold uppercase tracking-widest text-[var(--muted)]">
            {APP_TAGLINE}
          </p>
        </div>
      </div>

      {/* Nav — 5 items, bold, 20px icons, blue active state */}
      <nav className="flex-1 overflow-y-auto p-3">
        <ul className="space-y-1">
          {TABS.map(({ label, href, icon: Icon }) => {
            const active = isActive(pathname, href);
            return (
              <li key={href}>
                <Link
                  href={href}
                  onClick={onNavigate}
                  aria-current={active ? "page" : undefined}
                  className={cn(
                    "group flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-bold transition-colors",
                    active
                      ? "bg-[var(--primary-soft)] text-[var(--primary)]"
                      : "text-[var(--muted)] hover:bg-[var(--surface-hi)] hover:text-[var(--fg)]",
                  )}
                >
                  <Icon
                    className={cn(
                      "size-5 shrink-0 transition-colors",
                      active
                        ? "text-[var(--primary)]"
                        : "text-[var(--muted-2)] group-hover:text-[var(--fg)]",
                    )}
                    strokeWidth={active ? 2.5 : 2}
                  />
                  <span>{label}</span>
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>

      {/* User + logout */}
      <div className="shrink-0 border-t border-[var(--border)] p-3">
        <div className="flex items-center gap-2 rounded-lg px-3 py-2">
          <span className="grid size-8 shrink-0 place-items-center rounded-full bg-[var(--surface-hi)] text-xs font-bold text-[var(--fg)]">
            {initials}
          </span>
          <div className="min-w-0 flex-1">
            <p className="truncate text-xs font-bold text-[var(--fg)]">
              {user?.first_name || user?.username || "—"}
            </p>
            <p className="truncate text-[10px] font-semibold text-[var(--muted)]">
              {user?.email ?? "Customer"}
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={onLogout}
          className="mt-1 flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm font-bold text-[var(--muted)] transition-colors hover:bg-[var(--surface-hi)] hover:text-[var(--fg)]"
        >
          <LogOut className="size-5" strokeWidth={2} />
          <span>Sign out</span>
        </button>
      </div>
    </>
  );
}
