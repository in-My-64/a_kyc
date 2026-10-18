// src/pages/500.tsx
import Link from "next/link";
import { AlertTriangle, Home, RefreshCw } from "lucide-react";

import { ROUTES } from "@/lib/constants";
import { Button } from "@/components/ui/primitives";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/surfaces";

/**
 * Static 500 surface.
 *
 * Pages Router does not have a per-render `reset()` callback the way
 * App Router's `error.tsx` does, so this page is intentionally a
 * navigational fallback: retry = navigate back to the last safe place,
 * reload = hard refresh of the current URL. Both are one click.
 */
export default function ServerErrorPage() {
  return (
    <div className="grid min-h-screen place-items-center bg-[var(--bg)] p-6">
      <Card className="w-full max-w-md">
        <CardHeader className="items-center text-center">
          <div className="mx-auto mb-2 grid size-12 place-items-center rounded-xl bg-[var(--danger-soft)] text-[var(--danger)]">
            <AlertTriangle className="size-6" />
          </div>
          <CardTitle className="text-xl">Something went wrong</CardTitle>
          <p className="mt-1 text-sm text-[var(--muted)]">
            An unexpected error interrupted the page. You can retry, or
            head back to the dashboard.
          </p>
        </CardHeader>

        <CardContent className="flex flex-col gap-2">
          <Button
            size="lg"
            onClick={() => window.location.reload()}
          >
            <RefreshCw className="size-3.5" />
            Reload page
          </Button>
          <Button asChild variant="outline" size="lg">
            <Link href={ROUTES.customer.dashboard}>
              <Home className="size-3.5" />
              Back to dashboard
            </Link>
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}