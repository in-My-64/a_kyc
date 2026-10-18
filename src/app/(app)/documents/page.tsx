"use client";

import Link from "next/link";
import { Upload } from "lucide-react";

import { PageHeader } from "@/components/layout/page-header";
import { Button } from "@/components/ui/primitives";
import { DocumentsList } from "@/components/documents/list";
import { ROUTES } from "@/lib/constants";

export default function DocumentsPage() {
  return (
    <div className="mx-auto w-full max-w-7xl">
      <PageHeader
        title="Documents"
        description="Identity documents you've uploaded, with their processing state."
        actions={
          <Button asChild size="sm">
            <Link href={ROUTES.documentsNew}>
              <Upload className="size-3.5" />
              Upload document
            </Link>
          </Button>
        }
      />

      <DocumentsList />
    </div>
  );
}
