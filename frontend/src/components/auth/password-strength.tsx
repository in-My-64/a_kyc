"use client";

import { Check, X } from "lucide-react";

import { cn } from "@/lib/utils";
import { passwordStrength } from "@/lib/validation";

const TIER_BG = [
  "bg-[var(--surface-hi)]",       // 0 — empty
  "bg-[var(--danger)]",            // 1 — weak
  "bg-[var(--warning)]",           // 2 — fair
  "bg-[var(--info)]",              // 3 — strong
  "bg-[var(--success)]",           // 4 — elite
];

const TIER_TEXT = [
  "text-[var(--muted)]",
  "text-[var(--danger)]",
  "text-[var(--warning)]",
  "text-[var(--info)]",
  "text-[var(--success)]",
];

export function PasswordStrengthMeter({ password }: { password: string }) {
  if (!password) return null;

  const { rules, score, label } = passwordStrength(password);

  return (
    <div className="mt-2 space-y-2">
      {/* Bar */}
      <div className="flex items-center gap-2">
        <div className="flex flex-1 gap-1">
          {[0, 1, 2, 3].map((i) => (
            <div
              key={i}
              className={cn(
                "h-1 flex-1 rounded-full transition-all duration-300",
                i < score ? TIER_BG[score] : "bg-[var(--surface-hi)]",
              )}
            />
          ))}
        </div>
        <span
          className={cn(
            "text-[10px] font-bold uppercase tracking-wider",
            TIER_TEXT[score],
          )}
        >
          {label}
        </span>
      </div>

      {/* Rules checklist */}
      <ul className="grid grid-cols-2 gap-x-3 gap-y-0.5">
        {rules.map((r) => (
          <li
            key={r.id}
            className="flex items-center gap-1.5 text-[11px] text-[var(--muted)]"
          >
            <span
              className={cn(
                "grid size-3.5 shrink-0 place-items-center rounded-full transition-colors",
                r.pass
                  ? "bg-[var(--success-soft)] text-[var(--success)]"
                  : "bg-[var(--surface-hi)] text-[var(--muted-2)]",
              )}
            >
              {r.pass ? (
                <Check className="size-2.5" strokeWidth={3} />
              ) : (
                <X className="size-2.5" strokeWidth={3} />
              )}
            </span>
            <span className={r.pass ? "text-[var(--fg)]" : ""}>{r.label}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
