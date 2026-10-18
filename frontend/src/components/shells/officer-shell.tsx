// src/components/shells/officer-shell.tsx
"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/router";
import {
  BarChart3,
  Bell,
  CheckCircle2,
  Clock,
  FileStack,
  LayoutDashboard,
  LogOut,
  Menu,
  ScanFace,
  ScrollText,
  Search,
  Settings,
  ShieldCheck,
  Users,
  XCircle,
  type LucideIcon,
} from "lucide-react";

import { cn } from "@/lib/utils";
import { APP_NAME, ROUTES } from "@/lib/constants";
import { useMe } from "@/lib/hooks";

interface NavItem {
  label: string;
  href: string;
  icon: LucideIcon;
}

interface NavGroup {
  label: string;
  items: NavItem[];
}

const NAV_GROUPS: NavGroup[] = [
  {
    label: "Overview",
    items: [
      {
        label: "Dashboard",
        href: ROUTES.officer.dashboard,
        icon: LayoutDashboard,
      },
    ],
  },
  {
    label: "Customers",
    items: [
      {
        label: "All Customers",
        href: ROUTES.officer.customers,
        icon: Users,
      },
    ],
  },
  {
    label: "Applications",
    items: [
      {
        label: "All",
        href: ROUTES.officer.applications,
        icon: FileStack,
      },
      {
        label: "Under Review",
        href: `${ROUTES.officer.applications}?status=IN_PROGRESS`,
        icon: Clock,
      },
      {
        label: "Approved",
        href: `${ROUTES.officer.applications}?status=COMPLETED`,
        icon: CheckCircle2,
      },
      {
        label: "Rejected",
        href: `${ROUTES.officer.applications}?status=FAILED`,
        icon: XCircle,
      },
    ],
  },
  {
    label: "Compliance",
    items: [
      {
        label: "Screening",
        href: ROUTES.officer.screening,
        icon: ScanFace,
      },
    ],
  },
  {
    label: "Admin",
    items: [
      {
        label: "Reports",
        href: ROUTES.officer.reports,
        icon: BarChart3,
      },
      {
        label: "Audit Logs",
        href: ROUTES.officer.audit,
        icon: ScrollText,
      },
      {
        label: "Settings",
        href: ROUTES.officer.settings,
        icon: Settings,
      },
    ],
  },
];

// ---------------------------------------------------------------------------
// Active-state resolution
// ---------------------------------------------------------------------------

function isActive(
  href: string,
  pathname: string,
  currentStatus: string,
): boolean {
  if (typeof href !== "string" || href.length === 0) return false;

  const [path, qs] = href.split("?");

  if (path === "/officer/applications") {
    const expectedStatus = qs
      ? new URLSearchParams(qs).get("status") ?? ""
      : "";

    if (pathname === path) {
      return currentStatus === expectedStatus;
    }
    if (pathname.startsWith(`${path}/`)) {
      return expectedStatus === "";
    }
    return false;
  }

  if (path === "/officer") {
    return pathname === path;
  }

  // /officer/customers must match its list page exactly, and only the
  // detail page startsWith its prefix. Otherwise the list item would
  // also light up on /officer/customers/<id>, which we DO want, so
  // startWith is correct here.
  return pathname === path || pathname.startsWith(`${path}/`);
}

// ---------------------------------------------------------------------------

export function OfficerShell({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const { data: user } = useMe();
  const [mobileOpen, setMobileOpen] = useState(false);

  const initials =
    (user?.first_name?.[0] ?? user?.username?.[0] ?? "?").toUpperCase() +
    (user?.last_name?.[0] ?? "").toUpperCase();

  const currentStatus =
    typeof router.query.status === "string" ? router.query.status : "";

  async function handleLogout() {
    await fetch("/api/session", { method: "DELETE" });
    router.replace(ROUTES.login);
  }

  return (
    <div className="flex min-h-screen w-full bg-[var(--bg)]">
      <aside className="navy-scope sticky top-0 hidden h-screen w-64 shrink-0 flex-col bg-[var(--navy)] lg:flex">
        <SidebarBody
          pathname={router.pathname}
          currentStatus={currentStatus}
          initials={initials}
          user={user ?? null}
          onLogout={handleLogout}
        />
      </aside>

      {mobileOpen && (
        <div
          className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm lg:hidden"
          onClick={() => setMobileOpen(false)}
        >
          <div
            className="navy-scope flex h-full w-72 max-w-[80vw] flex-col bg-[var(--navy)]"
            onClick={(e) => e.stopPropagation()}
          >
            <SidebarBody
              pathname={router.pathname}
              currentStatus={currentStatus}
              initials={initials}
              user={user ?? null}
              onLogout={handleLogout}
              onNavigate={() => setMobileOpen(false)}
            />
          </div>
        </div>
      )}

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
              placeholder="Search applications, customers…"
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
                  {user?.is_staff ? "KYC Officer" : "Customer"}
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

function SidebarBody({
  pathname,
  currentStatus,
  initials,
  user,
  onLogout,
  onNavigate,
}: {
  pathname: string;
  currentStatus: string;
  initials: string;
  user: {
    first_name?: string;
    last_name?: string;
    username?: string;
    is_staff?: boolean;
  } | null;
  onLogout: () => void;
  onNavigate?: () => void;
}) {
  return (
    <>
      <div className="flex h-16 shrink-0 items-center gap-2.5 border-b border-[var(--navy-2)] px-5">
        <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-[var(--primary)] text-white">
          <ShieldCheck className="size-4" />
        </span>
        <div className="min-w-0">
          <p className="truncate text-sm font-extrabold tracking-tight text-white">
            {APP_NAME}
          </p>
          <p className="truncate text-[10px] uppercase tracking-widest text-[var(--navy-muted)]">
            Officer Portal
          </p>
        </div>
      </div>

      <nav className="flex-1 space-y-5 overflow-y-auto p-3">
        {NAV_GROUPS.map((group) => (
          <div key={group.label}>
            <p className="mb-1.5 px-3 text-[10px] font-extrabold uppercase tracking-[0.18em] text-[var(--navy-muted)]">
              {group.label}
            </p>
            <ul className="space-y-0.5">
              {group.items.map(({ label, href, icon: Icon }) => {
                const active = isActive(href, pathname, currentStatus);
                return (
                  <li key={href}>
                    <Link
                      href={href}
                      onClick={onNavigate}
                      aria-current={active ? "page" : undefined}
                      className={cn(
                        "flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors",
                        active
                          ? "bg-[var(--navy-3)] font-semibold text-white"
                          : "text-[var(--navy-muted)] hover:bg-[var(--navy-2)] hover:text-white",
                      )}
                    >
                      <Icon className="size-4 shrink-0" />
                      <span>{label}</span>
                    </Link>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </nav>

      <div className="shrink-0 border-t border-[var(--navy-2)] p-3">
        <div className="flex items-center gap-2 rounded-lg px-3 py-2">
          <span className="grid size-8 shrink-0 place-items-center rounded-full bg-[var(--navy-3)] text-xs font-bold text-white">
            {initials}
          </span>
          <div className="min-w-0 flex-1">
            <p className="truncate text-xs font-bold text-white">
              {user?.first_name || user?.username || "—"}
            </p>
            <p className="truncate text-[10px] text-[var(--navy-muted)]">
              {user?.is_staff ? "KYC Officer" : "Customer"}
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={onLogout}
          className="mt-1 flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm text-[var(--navy-muted)] transition-colors hover:bg-[var(--navy-2)] hover:text-white"
        >
          <LogOut className="size-4" />
          <span>Sign out</span>
        </button>
      </div>
    </>
  );
}