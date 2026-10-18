import type { AppProps } from "next/app";
import { useRouter } from "next/router";
import { Raleway } from "next/font/google";

import "@/styles/globals.css";
import { Providers } from "@/providers";
import { CustomerShell } from "@/components/shells/customer-shell";
import { OfficerShell } from "@/components/shells/officer-shell";

const raleway = Raleway({
  variable: "--font-raleway",
  subsets: ["latin"],
  display: "swap",
  weight: ["400", "500", "600", "700", "800", "900"],
});

const BARE_ROUTES = new Set(["/", "/login", "/register"]);

export default function App({ Component, pageProps }: AppProps) {
  const { pathname } = useRouter();

  const isBare = BARE_ROUTES.has(pathname);
  const isOfficer = pathname.startsWith("/officer");
  // /kyc/* is a customer-facing workflow status view. Treat it as a
  // customer route so it renders inside the same sidebar/topbar shell
  // as the rest of the dashboard.
  const isCustomer =
    pathname.startsWith("/customer") || pathname.startsWith("/kyc");

  const page = <Component {...pageProps} />;

  return (
    <div
      className={raleway.variable}
      style={{ fontFamily: "var(--font-raleway), Raleway, system-ui, sans-serif" }}
    >
      <Providers>
        <div className="app-shell min-h-dvh bg-[var(--bg)] text-[var(--fg)] antialiased">
          {isBare && page}
          {isCustomer && !isOfficer && <CustomerShell>{page}</CustomerShell>}
          {isOfficer && <OfficerShell>{page}</OfficerShell>}
          {!isBare && !isCustomer && !isOfficer && page}
        </div>
      </Providers>
    </div>
  );
}