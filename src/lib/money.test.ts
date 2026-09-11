import { describe, expect, it } from "vitest";
import { formatMoney, parseMoney, round2 } from "./money";

describe("round2", () => {
  it("removes binary-float drift", () => {
    expect(round2(0.1 + 0.2)).toBe(0.3);
    expect(round2(5 - 3.3)).toBe(1.7);
  });
});

describe("formatMoney", () => {
  it("formats with the currency symbol and two decimals", () => {
    expect(formatMoney(1234.5)).toBe("GH₵ 1,234.50");
    expect(formatMoney(0)).toBe("GH₵ 0.00");
    expect(formatMoney(8, "$")).toBe("$ 8.00");
  });
});

describe("parseMoney", () => {
  it("strips symbols and returns a rounded number", () => {
    expect(parseMoney("GH₵ 1,200.5")).toBe(1200.5);
    expect(parseMoney("40")).toBe(40);
  });
  it("returns null for blank input", () => {
    expect(parseMoney("")).toBeNull();
    expect(parseMoney("  ")).toBeNull();
  });
});
