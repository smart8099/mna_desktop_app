import { EmptyRow } from "./State";

export type BarTone = "primary" | "amber" | "red" | "blue" | "muted";

const barColor: Record<BarTone, string> = {
  primary: "var(--color-primary)",
  amber: "var(--color-warning)",
  red: "var(--color-danger)",
  blue: "#3b82f6",
  muted: "var(--color-text-muted)",
};

export interface BarItem {
  label: string;
  value: number;
  /** Text shown at the end of the row; defaults to the value. */
  display?: string;
  tone?: BarTone;
}

export function BarList({
  items,
  max,
  empty = "Nothing to show yet.",
}: {
  items: BarItem[];
  max?: number;
  empty?: string;
}) {
  if (!items.length) return <EmptyRow>{empty}</EmptyRow>;
  const top = Math.max(1, max ?? Math.max(...items.map((i) => i.value)));

  return (
    <ul className="space-y-3">
      {items.map((item) => (
        <li key={item.label}>
          <div className="flex items-baseline justify-between gap-3 text-sm">
            <span className="truncate text-text">{item.label}</span>
            <span className="shrink-0 tabular-nums font-medium text-text">
              {item.display ?? item.value}
            </span>
          </div>
          <div className="mt-1 h-2 overflow-hidden rounded-full bg-surface-muted">
            <div
              className="h-full rounded-full transition-[width]"
              style={{
                width: `${Math.max(0, Math.min(100, (item.value / top) * 100))}%`,
                background: barColor[item.tone ?? "primary"],
              }}
            />
          </div>
        </li>
      ))}
    </ul>
  );
}
