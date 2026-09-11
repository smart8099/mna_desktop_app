import { Hammer } from "lucide-react";
import { Card } from "@/components/ui/Card";

export function PlaceholderPage({
  title,
  phase,
  blurb,
}: {
  title: string;
  phase: number;
  blurb: string;
}) {
  return (
    <Card className="mx-auto max-w-xl">
      <div className="flex flex-col items-center gap-3 px-6 py-14 text-center">
        <div className="grid h-12 w-12 place-items-center rounded-xl bg-accent-soft text-primary">
          <Hammer className="h-6 w-6" />
        </div>
        <h2 className="text-lg font-semibold text-text">{title}</h2>
        <p className="max-w-sm text-sm text-text-muted">{blurb}</p>
        <span className="rounded-full border border-border bg-surface-muted px-3 py-1 text-xs font-medium text-text-muted">
          Arrives in Phase {phase}
        </span>
      </div>
    </Card>
  );
}
