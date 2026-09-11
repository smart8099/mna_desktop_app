import { describe, expect, it } from "vitest";
import { ghanaLocalPart, normalizeGhanaPhone } from "./phone";

describe("normalizeGhanaPhone", () => {
  it("prefixes +233 and drops a leading zero", () => {
    expect(normalizeGhanaPhone("0244123456")).toBe("+233244123456");
  });
  it("accepts a number with no leading zero", () => {
    expect(normalizeGhanaPhone("244123456")).toBe("+233244123456");
  });
  it("collapses an already-prefixed value instead of doubling it", () => {
    expect(normalizeGhanaPhone("+233 24 412 3456")).toBe("+233244123456");
    expect(normalizeGhanaPhone("00233244123456")).toBe("+233244123456");
  });
  it("normalises legacy plain digits from the spreadsheet import", () => {
    expect(normalizeGhanaPhone("555705878")).toBe("+233555705878");
  });
  it("returns null for empty / zero-only input", () => {
    expect(normalizeGhanaPhone("")).toBeNull();
    expect(normalizeGhanaPhone("0")).toBeNull();
    expect(normalizeGhanaPhone(null)).toBeNull();
  });
});

describe("ghanaLocalPart", () => {
  it("strips the +233 prefix for editing", () => {
    expect(ghanaLocalPart("+233244123456")).toBe("244123456");
    expect(ghanaLocalPart("0244123456")).toBe("244123456");
    expect(ghanaLocalPart(null)).toBe("");
  });
});
