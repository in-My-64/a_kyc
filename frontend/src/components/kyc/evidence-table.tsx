// src/components/kyc/evidence-table.tsx
"use client";

import { cn } from "@/lib/utils";
import type { EvidenceScoreDetail } from "@/lib/types";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/surfaces";

const FIELD_LABELS: Record<string, string> = {
  id_number: "ID number",
  name: "Full name",
  dob: "Date of birth",
  expiry: "Expiry date",
  nationality: "Nationality",
  ocr_confidence: "Document image quality",
  ocr_word_count: "Document completeness",
};

export function EvidenceTable({
  evidence,
}: {
  evidence: EvidenceScoreDetail;
}) {
  const total = Number(evidence.score);
  const entries = Object.entries(evidence.breakdown);

  if (entries.length === 0) return null;

  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between gap-2 space-y-0">
        <CardTitle>Weighted evidence scoring</CardTitle>
        <span className="font-mono text-sm font-bold tabular-nums">
          {total.toFixed(0)} / 100
        </span>
      </CardHeader>
      <CardContent className="p-0">
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead className="bg-[var(--surface-2)] text-left text-[10px] font-extrabold uppercase tracking-[0.14em] text-[var(--muted-2)]">
              <tr>
                <th className="px-5 py-2.5">Evidence item</th>
                <th className="w-20 px-3 py-2.5 text-right">Weight</th>
                <th className="w-28 px-3 py-2.5 text-right">Score</th>
                <th className="w-28 px-5 py-2.5 text-right">Weighted</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--border)]">
              {entries.map(([key, entry]) => {
                const weight = entry.weight ?? 0;
                const points = entry.points ?? 0;
                const pct =
                  weight > 0 ? Math.round((points / weight) * 100) : 0;
                return (
                  <tr key={key}>
                    <td className="px-5 py-2.5">
                      <p className="font-bold text-[var(--fg)]">
                        {FIELD_LABELS[key] ?? key}
                      </p>
                      <p className="mt-0.5 text-[10px] text-[var(--muted)]">
                        {entry.reason}
                      </p>
                    </td>
                    <td className="px-3 py-2.5 text-right font-mono tabular-nums text-[var(--muted)]">
                      {weight}%
                    </td>
                    <td className="px-3 py-2.5 text-right font-mono tabular-nums">
                      <span
                        className={cn(
                          pct >= 80 && "text-[var(--success)]",
                          pct >= 50 && pct < 80 && "text-[var(--warning)]",
                          pct < 50 && "text-[var(--danger)]",
                        )}
                      >
                        {points}/{weight}
                      </span>
                    </td>
                    <td className="px-5 py-2.5 text-right font-mono tabular-nums font-bold">
                      {points}
                    </td>
                  </tr>
                );
              })}
              <tr className="bg-[var(--surface-2)] font-extrabold">
                <td className="px-5 py-3">Total score</td>
                <td className="px-3 py-3 text-right font-mono">100%</td>
                <td className="px-3 py-3" />
                <td className="px-5 py-3 text-right font-mono tabular-nums text-[var(--primary)]">
                  {total.toFixed(0)} / 100
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </CardContent>
    </Card>
  );
}