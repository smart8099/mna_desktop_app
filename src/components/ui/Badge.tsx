import type { ReactNode } from "react";
import { cn } from "@/lib/cn";

type Tone = "green" | "muted" | "blue" | "amber" | "red";

const tones: Record<Tone, string> = {
  green: "bg-accent-soft text-primary",
  muted: "bg-surface-muted text-text-muted",
  blue: "bg-blue-500/15 text-blue-600 dark:text-blue-300",
  amber: "bg-warning/15 text-warning",
  red: "bg-danger-soft text-danger",
};

export function Badge({
  tone = "muted",
  className,
  children,
}: {
  tone?: Tone;
  className?: string;
  children: ReactNode;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium",
        tones[tone],
        className,
      )}
    >
      {children}
    </span>
  );
}

const STATUS_TONE: Record<string, Tone> = {
  Active: "green",
  Inactive: "muted",
  Graduated: "blue",
  Withdrawn: "red",
};

export function StatusBadge({ status }: { status: string }) {
  return <Badge tone={STATUS_TONE[status] ?? "muted"}>{status}</Badge>;
}
