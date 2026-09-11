export function formatBytes(n: number): string {
  if (!n) return "0 B";
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(2)} MB`;
}

export function todayISO(): string {
  return new Date().toISOString().slice(0, 10);
}

export function pctToWeight(pct: number): number {
  return Math.round(pct) / 100;
}

export function weightToPct(w: number): number {
  return Math.round(w * 100);
}
