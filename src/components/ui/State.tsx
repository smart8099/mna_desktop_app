import type { ReactNode } from "react";
import { Loader2 } from "lucide-react";

export function LoadingBlock({ label = "Loading…" }: { label?: string }) {
  return (
    <div className="flex items-center gap-2 p-6 text-sm text-text-muted">
      <Loader2 className="h-4 w-4 animate-spin" />
      {label}
    </div>
  );
}

export function ErrorBlock({ error }: { error: unknown }) {
  const message = error instanceof Error ? error.message : String(error);
  return (
    <div className="m-4 rounded-lg border border-danger/40 bg-danger-soft p-4 text-sm text-danger">
      {message}
    </div>
  );
}

export function EmptyRow({ children }: { children: ReactNode }) {
  return (
    <div className="px-4 py-8 text-center text-sm text-text-muted">{children}</div>
  );
}
