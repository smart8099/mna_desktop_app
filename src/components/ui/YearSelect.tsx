import { Select } from "./Input";
import type { AcademicYear } from "@/features/settings/api";

/**
 * A year picker for the `useYearFilter()` hook — pairs with it on reporting
 * pages that let you look at a past academic year without touching the
 * global current-year setting.
 */
export function YearSelect({
  years,
  value,
  onChange,
  className,
}: {
  years: AcademicYear[];
  value: number | null;
  onChange: (yearId: number) => void;
  className?: string;
}) {
  return (
    <Select
      className={className ?? "w-auto"}
      value={value ?? ""}
      onChange={(e) => onChange(Number(e.target.value))}
      aria-label="Academic year"
    >
      {years.map((y) => (
        <option key={y.id} value={y.id}>
          {y.hijri_label} AH · {y.gregorian_label}
          {y.is_current ? " — current" : ""}
        </option>
      ))}
    </Select>
  );
}
