import type { ReactNode } from "react";
import { cn } from "@/lib/cn";

type Tone = "default" | "primary" | "amber" | "red" | "blue";

const toneText: Record<Tone, string> = {
  default: "text-text",
  primary: "text-primary",
  amber: "text-warning",
  red: "text-danger",
  blue: "text-blue-600 dark:text-blue-300",
};

export function StatTile({
  label,
  value,
  hint,
  tone = "default",
  icon,
}: {
  label: string;
  value: ReactNode;
  hint?: ReactNode;
  tone?: Tone;
  icon?: ReactNode;
}) {
  return (
    <div className="rounded-xl border border-border bg-surface p-4">
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs font-medium uppercase tracking-wide text-text-muted">{label}</span>
        {icon && <span className="text-text-muted">{icon}</span>}
      </div>
      <div className={cn("mt-1.5 text-2xl font-semibold tabular-nums", toneText[tone])}>{value}</div>
      {hint && <div className="mt-0.5 text-xs text-text-muted">{hint}</div>}
    </div>
  );
}
