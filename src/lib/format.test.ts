import { describe, expect, it } from "vitest";
import { formatBytes, pctToWeight, todayISO, weightToPct } from "./format";

describe("formatBytes", () => {
  it("handles zero and small byte counts", () => {
    expect(formatBytes(0)).toBe("0 B");
    expect(formatBytes(512)).toBe("512 B");
  });
  it("switches to KB and MB", () => {
    expect(formatBytes(1536)).toBe("1.5 KB");
    expect(formatBytes(5 * 1024 * 1024)).toBe("5.00 MB");
  });
});

describe("grading weight conversions", () => {
  it("converts between percent and fraction", () => {
    expect(weightToPct(0.3)).toBe(30);
    expect(pctToWeight(30)).toBe(0.3);
  });
  it("round-trips an arbitrary split", () => {
    expect(weightToPct(pctToWeight(45))).toBe(45);
  });
});

describe("todayISO", () => {
  it("returns a yyyy-mm-dd string", () => {
    expect(todayISO()).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});
