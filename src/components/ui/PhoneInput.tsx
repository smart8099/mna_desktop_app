import { useEffect, useState } from "react";
import { GH_PREFIX, ghanaLocalPart, normalizeGhanaPhone } from "@/lib/phone";

export function PhoneInput({
  value,
  onChange,
  id,
  placeholder = "24 123 4567",
}: {
  value: string | null;
  onChange: (value: string | null) => void;
  id?: string;
  placeholder?: string;
}) {
  const [text, setText] = useState(() => ghanaLocalPart(value));

  // Re-sync when the parent swaps in a different record.
  useEffect(() => {
    if ((value ?? null) !== normalizeGhanaPhone(text)) setText(ghanaLocalPart(value));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);

  return (
    <div className="flex h-10 w-full items-center rounded-lg border border-border bg-surface focus-within:outline-2 focus-within:outline-ring">
      <span className="select-none border-r border-border px-3 text-sm text-text-muted">
        {GH_PREFIX}
      </span>
      <input
        id={id}
        inputMode="numeric"
        autoComplete="off"
        value={text}
        placeholder={placeholder}
        onChange={(e) => {
          setText(e.target.value);
          onChange(normalizeGhanaPhone(e.target.value));
        }}
        onBlur={() => setText(ghanaLocalPart(normalizeGhanaPhone(text)))}
        className="h-full flex-1 rounded-r-lg bg-transparent px-3 text-sm text-text placeholder:text-text-muted focus:outline-none"
      />
    </div>
  );
}
