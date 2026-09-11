/**
 * Ghana phone numbers are stored canonically as `+233` followed by the 9-digit
 * local number (no leading zero). The UI shows a fixed `+233` prefix and the
 * user types the rest; a leading `0` (or a pasted `233` / `00233`) is stripped.
 */
export const GH_PREFIX = "+233";

export function normalizeGhanaPhone(raw: string | null | undefined): string | null {
  if (raw == null) return null;
  let digits = String(raw).replace(/\D/g, "");
  if (digits.startsWith("00233")) digits = digits.slice(5);
  else if (digits.startsWith("233")) digits = digits.slice(3);
  digits = digits.replace(/^0+/, "");
  return digits ? GH_PREFIX + digits : null;
}

/** The part the user edits, i.e. the canonical value without the `+233` prefix. */
export function ghanaLocalPart(stored: string | null | undefined): string {
  const normalized = normalizeGhanaPhone(stored);
  return normalized ? normalized.slice(GH_PREFIX.length) : "";
}
