/**
 * Suggest the Hijri year for a given Gregorian date. Used only to pre-fill the
 * academic-year field — the admin can always override it.
 */
export function suggestHijriYear(date: Date = new Date()): string {
  try {
    const formatted = new Intl.DateTimeFormat("en-u-ca-islamic-umalqura", {
      year: "numeric",
    }).format(date);
    const n = parseInt(formatted.replace(/\D/g, ""), 10);
    if (n > 1000 && n < 2000) return String(n);
  } catch {
    /* fall through to arithmetic approximation */
  }
  const g = date.getFullYear();
  return String(Math.floor(((g - 622) * 33) / 32));
}

/** Default Gregorian label for a new academic year, e.g. "2026/2027". */
export function suggestGregorianLabel(date: Date = new Date()): string {
  const y = date.getFullYear();
  // School year is assumed to start around September.
  const startYear = date.getMonth() >= 7 ? y : y - 1;
  return `${startYear}/${startYear + 1}`;
}
