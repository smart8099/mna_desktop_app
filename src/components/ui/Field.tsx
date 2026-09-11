import { cloneElement, isValidElement, useId, type ReactElement, type ReactNode } from "react";
import { cn } from "@/lib/cn";

export function Field({
  label,
  hint,
  htmlFor,
  className,
  children,
}: {
  label: ReactNode;
  hint?: ReactNode;
  htmlFor?: string;
  className?: string;
  children: ReactNode;
}) {
  const generatedId = useId();
  const id = htmlFor ?? generatedId;

  // Auto-associate the label with a single input/select/textarea child that has
  // no id of its own — better accessibility, no per-call wiring needed.
  const child =
    !htmlFor && isValidElement(children) && (children.props as { id?: string }).id == null
      ? cloneElement(children as ReactElement<{ id?: string }>, { id })
      : children;

  return (
    <div className={cn("space-y-1.5", className)}>
      <label htmlFor={id} className="block text-sm font-medium text-text">
        {label}
      </label>
      {child}
      {hint && <p className="text-xs text-text-muted">{hint}</p>}
    </div>
  );
}
