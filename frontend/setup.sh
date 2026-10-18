#!/usr/bin/env bash
# ============================================================================
# KYC Frontend — in-place scaffold for ~/a_kyc/frontend/
# ============================================================================
set -euo pipefail

# ---- Preflight -------------------------------------------------------------
if ! command -v node >/dev/null; then
  echo "✖  Node.js not found. Install it first:"
  echo "     curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -"
  echo "     sudo apt install -y nodejs"
  echo "   Or use nvm: curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.1/install.sh | bash"
  exit 1
fi

NODE_MAJOR=$(node -p "process.versions.node.split('.')[0]")
if [ "$NODE_MAJOR" -lt 20 ]; then
  echo "✖  Node 20+ required (found $(node -v))"; exit 1
fi

if [ -f package.json ]; then
  echo "✖  package.json already exists here. Refusing to overwrite."
  echo "   Remove it first, or run in a clean directory."
  exit 1
fi

echo ""
echo "▶  Scaffolding into: $(pwd)"
echo ""

# ---- package.json ----------------------------------------------------------
echo "▶  Writing package.json…"
cat > package.json <<'EOF'
{
  "name": "kyc-frontend",
  "version": "0.1.0",
  "private": true,
  "scripts": {
    "dev": "next dev",
    "build": "next build",
    "start": "next start",
    "lint": "next lint",
    "typecheck": "tsc --noEmit"
  },
  "dependencies": {
    "@hookform/resolvers": "^3.10.0",
    "@tanstack/react-query": "^5.62.0",
    "@tanstack/react-table": "^8.20.0",
    "class-variance-authority": "^0.7.1",
    "clsx": "^2.1.1",
    "lucide-react": "^0.460.0",
    "next": "^15.1.0",
    "react": "^18.3.1",
    "react-dom": "^18.3.1",
    "react-hook-form": "^7.54.0",
    "recharts": "^2.13.0",
    "tailwind-merge": "^2.5.5",
    "zod": "^3.23.8",
    "zustand": "^5.0.2"
  },
  "devDependencies": {
    "@tailwindcss/postcss": "^4.0.0",
    "@types/node": "^20.17.0",
    "@types/react": "^18.3.12",
    "@types/react-dom": "^18.3.1",
    "eslint": "^9.15.0",
    "eslint-config-next": "^15.1.0",
    "tailwindcss": "^4.0.0",
    "typescript": "^5.7.0"
  }
}
EOF

# ---- Install ---------------------------------------------------------------
echo "▶  Installing dependencies… (this takes ~60–90s)"
npm install --silent

# ---- Folders ---------------------------------------------------------------
echo "▶  Creating folder tree…"
mkdir -p \
  src/pages/customer/applications \
  src/pages/officer/applications \
  src/pages/api/proxy \
  src/components/ui \
  src/components/shells \
  src/components/kyc \
  src/lib \
  src/styles \
  public

# ---- Config ----------------------------------------------------------------
echo "▶  Writing config…"

cat > tsconfig.json <<'EOF'
{
  "compilerOptions": {
    "target": "ES2022",
    "lib": ["dom", "dom.iterable", "esnext"],
    "allowJs": false,
    "skipLibCheck": true,
    "strict": true,
    "noEmit": true,
    "esModuleInterop": true,
    "module": "esnext",
    "moduleResolution": "bundler",
    "resolveJsonModule": true,
    "isolatedModules": true,
    "jsx": "preserve",
    "incremental": true,
    "paths": { "@/*": ["./src/*"] }
  },
  "include": ["next-env.d.ts", "**/*.ts", "**/*.tsx", ".next/types/**/*.ts"],
  "exclude": ["node_modules"]
}
EOF

cat > next.config.mjs <<'EOF'
/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
};
export default nextConfig;
EOF

cat > postcss.config.mjs <<'EOF'
const config = { plugins: { "@tailwindcss/postcss": {} } };
export default config;
EOF

cat > eslint.config.mjs <<'EOF'
import { FlatCompat } from "@eslint/eslintrc";
const compat = new FlatCompat({ baseDirectory: import.meta.dirname });
export default [
  ...compat.extends("next/core-web-vitals", "next/typescript"),
  { ignores: [".next/**", "out/**", "build/**", "next-env.d.ts"] },
];
EOF

cat > .gitignore <<'EOF'
node_modules/
.next/
out/
build/
.env
.env.local
.DS_Store
*.log
next-env.d.ts
EOF

cat > .env.example <<'EOF'
# Django backend base URL
API_URL=http://localhost:8000

# Public app URL
NEXT_PUBLIC_APP_URL=http://localhost:3000
EOF

cat > .env.local <<'EOF'
API_URL=http://localhost:8000
NEXT_PUBLIC_APP_URL=http://localhost:3000
EOF

# ---- globals.css -----------------------------------------------------------
echo "▶  Writing design tokens…"
cat > src/styles/globals.css <<'EOF'
@import "tailwindcss";

:root {
  --bg: #f5f7fb;
  --surface: #ffffff;
  --surface-2: #f8fafc;
  --surface-hi: #f1f5f9;
  --border: #e2e8f0;
  --border-hi: #cbd5e1;
  --fg: #0f172a;
  --muted: #64748b;
  --muted-2: #94a3b8;
  --primary: #2563eb;
  --primary-fg: #ffffff;
  --primary-hover: #1d4ed8;
  --primary-soft: #dbeafe;
  --primary-border: #93c5fd;
  --navy: #0f172a;
  --navy-2: #1e293b;
  --navy-3: #334155;
  --navy-fg: #e2e8f0;
  --navy-muted: #94a3b8;
  --success: #16a34a;  --success-soft: #dcfce7;  --success-border: #86efac;
  --warning: #f59e0b;  --warning-soft: #fef3c7;  --warning-border: #fcd34d;
  --danger:  #ef4444;  --danger-soft:  #fee2e2;  --danger-border:  #fca5a5;
  --info:    #2563eb;  --info-soft:    #dbeafe;  --info-border:    #93c5fd;
  --r-sm: 0.375rem;  --r: 0.5rem;  --r-lg: 0.75rem;
  --shadow-xs: 0 1px 2px 0 rgb(15 23 42 / .04);
  --shadow-sm: 0 1px 3px 0 rgb(15 23 42 / .06), 0 1px 2px -1px rgb(15 23 42 / .04);
  --shadow-md: 0 4px 6px -1px rgb(15 23 42 / .07), 0 2px 4px -2px rgb(15 23 42 / .04);
  --shadow-lg: 0 10px 15px -3px rgb(15 23 42 / .08), 0 4px 6px -4px rgb(15 23 42 / .04);
  --font-sans: var(--font-inter), Inter, system-ui, sans-serif;
  --font-mono: var(--font-mono-jb), ui-monospace, monospace;
}

* { box-sizing: border-box; }

html, body {
  height: 100%;
  background: var(--bg);
  color: var(--fg);
  font-family: var(--font-sans);
  -webkit-font-smoothing: antialiased;
  -moz-osx-font-smoothing: grayscale;
}

code, pre, kbd, samp, .font-mono { font-family: var(--font-mono); }
h1, h2, h3, h4, h5, h6 { font-weight: 600; letter-spacing: -0.015em; }
.tabular-nums, table td, table th { font-variant-numeric: tabular-nums; }
::selection { background: var(--primary); color: #fff; }

.navy-scope {
  --surface: var(--navy);
  --surface-2: var(--navy-2);
  --surface-hi: var(--navy-3);
  --border: var(--navy-2);
  --fg: var(--navy-fg);
  --muted: var(--navy-muted);
  color-scheme: dark;
}
EOF

# ---- Base files ------------------------------------------------------------
echo "▶  Writing base app files…"

cat > src/pages/_document.tsx <<'EOF'
import { Html, Head, Main, NextScript } from "next/document";

export default function Document() {
  return (
    <Html lang="en">
      <Head />
      <body>
        <Main />
        <NextScript />
      </body>
    </Html>
  );
}
EOF

cat > src/providers.tsx <<'EOF'
"use client";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useState, type ReactNode } from "react";

export function Providers({ children }: { children: ReactNode }) {
  const [client] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: { staleTime: 30_000, refetchOnWindowFocus: false, retry: 1 },
        },
      }),
  );
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}
EOF

cat > src/pages/_app.tsx <<'EOF'
import type { AppProps } from "next/app";
import { useRouter } from "next/router";
import { Inter, JetBrains_Mono } from "next/font/google";

import "@/styles/globals.css";
import { Providers } from "@/providers";

const inter = Inter({ variable: "--font-inter", subsets: ["latin"], display: "swap" });
const mono  = JetBrains_Mono({
  variable: "--font-mono-jb", subsets: ["latin"], display: "swap",
  weight: ["400", "500", "600"],
});

export default function App({ Component, pageProps }: AppProps) {
  const { pathname } = useRouter();
  const isBare = pathname === "/" || pathname === "/login" || pathname === "/register";

  return (
    <Providers>
      <div className={`${inter.variable} ${mono.variable} min-h-dvh bg-[var(--bg)] text-[var(--fg)]`}>
        {isBare ? (
          <Component {...pageProps} />
        ) : (
          <div className="mx-auto max-w-6xl px-6 py-8">
            <Component {...pageProps} />
          </div>
        )}
      </div>
    </Providers>
  );
}
EOF

cat > src/middleware.ts <<'EOF'
import { NextResponse, type NextRequest } from "next/server";

const SESSION_COOKIE = "kyc_session";
const PUBLIC = new Set(["/", "/login", "/register"]);

export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  const hasSession = Boolean(req.cookies.get(SESSION_COOKIE)?.value);

  if (hasSession && PUBLIC.has(pathname)) {
    return NextResponse.redirect(new URL("/customer", req.url));
  }
  if (!hasSession && !PUBLIC.has(pathname)) {
    const login = new URL("/login", req.url);
    login.searchParams.set("next", pathname);
    return NextResponse.redirect(login);
  }
  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!api|_next/static|_next/image|favicon.ico).*)"],
};
EOF

# ---- lib stubs -------------------------------------------------------------
cat > src/lib/constants.ts <<'EOF'
export const SESSION_COOKIE = "kyc_session";

export const ROUTES = {
  login: "/login",
  register: "/register",
  customer: {
    dashboard: "/customer",
    apply: "/customer/apply",
    applications: "/customer/applications",
    profile: "/customer/profile",
    help: "/customer/help",
  },
  officer: {
    dashboard: "/officer",
    applications: "/officer/applications",
    reports: "/officer/reports",
    audit: "/officer/audit",
    settings: "/officer/settings",
  },
} as const;

export type PillTone = "neutral" | "info" | "warning" | "success" | "danger";
EOF

cat > src/lib/utils.ts <<'EOF'
import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatDate(iso: string) {
  return new Intl.DateTimeFormat("en-GB", {
    day: "numeric", month: "short", year: "numeric",
  }).format(new Date(iso));
}

export function formatDateTime(iso: string) {
  return new Intl.DateTimeFormat("en-GB", {
    day: "numeric", month: "short", year: "numeric",
    hour: "2-digit", minute: "2-digit",
  }).format(new Date(iso));
}

export function formatBytes(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}
EOF

# ---- Placeholder pages -----------------------------------------------------
echo "▶  Writing placeholder pages…"

write_page() {
  local path="$1" title="$2"
  mkdir -p "$(dirname "$path")"
  cat > "$path" <<EOF
export default function Page() {
  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold tracking-tight">$title</h1>
      <p className="text-sm text-[var(--muted)]">Placeholder — replace with real UI.</p>
    </div>
  );
}
EOF
}

cat > src/pages/index.tsx <<'EOF'
export default function Home() { return null; }
export function getServerSideProps() {
  return { redirect: { destination: "/login", permanent: false } };
}
EOF

write_page src/pages/login.tsx                      "Sign in"
write_page src/pages/register.tsx                   "Create account"
write_page src/pages/customer/index.tsx             "Customer Dashboard"
write_page src/pages/customer/apply.tsx             "New Application"
write_page src/pages/customer/applications/index.tsx "My Applications"
write_page "src/pages/customer/applications/[id].tsx" "Application Detail"
write_page src/pages/customer/profile.tsx           "Profile"
write_page src/pages/customer/help.tsx              "Help"
write_page src/pages/officer/index.tsx              "Officer Dashboard"
write_page src/pages/officer/applications/index.tsx "Applications"
write_page "src/pages/officer/applications/[id].tsx" "Review Application"
write_page src/pages/officer/reports.tsx            "Reports"
write_page src/pages/officer/audit.tsx              "Audit Logs"
write_page src/pages/officer/settings.tsx           "Settings"

# ---- Sanity check ----------------------------------------------------------
echo ""
echo "▶  Type-checking…"
npx tsc --noEmit

echo ""
echo "✅  Setup complete!"
echo ""
echo "Next:"
echo "  npm run dev      # → http://localhost:3000"
echo ""
echo "Tree:"
find src -type f | sort
echo ""
