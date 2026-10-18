// src/pages/404.tsx
import Link from "next/link";
import { Compass, Home, LayoutDashboard } from "lucide-react";

import { ROUTES } from "@/lib/constants";
import { Button } from "@/components/ui/primitives";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/surfaces";

export default function NotFoundPage() {
  return (
    <div className="grid min-h-screen place-items-center bg-[var(--bg)] p-6">
      <Card className="w-full max-w-md">
        <CardHeader className="items-center text-center">
          <div className="mx-auto mb-2 grid size-12 place-items-center rounded-xl bg-[var(--primary-soft)] text-[var(--primary)]">
            <Compass className="size-6" />
          </div>
          <CardTitle className="text-xl">Page not found</CardTitle>
          <p className="mt-1 text-sm text-[var(--muted)]">
            We couldn&apos;t find what you were looking for. The link may
            be broken, or the page may have moved.
          </p>
        </CardHeader>

        <CardContent className="flex flex-col gap-2">
          <Button asChild size="lg">
            <Link href={ROUTES.customer.dashboard}>
              <LayoutDashboard className="size-3.5" />
              Go to dashboard
            </Link>
          </Button>
          <Button asChild variant="outline" size="lg">
            <Link href={ROUTES.login}>
              <Home className="size-3.5" />
              Back to sign in
            </Link>
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}