import { describe, expect, it } from "vitest";
import { suggestGregorianLabel, suggestHijriYear } from "./hijri";

describe("suggestHijriYear", () => {
  it("returns a plausible Hijri year for a 2026 date", () => {
    const y = Number(suggestHijriYear(new Date(2026, 8, 10)));
    expect(y).toBeGreaterThanOrEqual(1447);
    expect(y).toBeLessThanOrEqual(1449);
  });
  it("always returns a 4-digit numeric string", () => {
    expect(suggestHijriYear(new Date(2030, 0, 1))).toMatch(/^\d{4}$/);
  });
});

describe("suggestGregorianLabel", () => {
  it("rolls to the next school year from August onwards", () => {
    expect(suggestGregorianLabel(new Date(2026, 8, 10))).toBe("2026/2027");
  });
  it("stays in the previous span earlier in the year", () => {
    expect(suggestGregorianLabel(new Date(2026, 2, 10))).toBe("2025/2026");
  });
});
