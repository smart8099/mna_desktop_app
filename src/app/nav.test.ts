import { describe, expect, it } from "vitest";
import { NAV, titleForPath } from "./nav";

describe("titleForPath", () => {
  it("matches a top-level route", () => {
    expect(titleForPath("/settings")).toBe("Settings");
  });
  it("matches a nested route by prefix", () => {
    expect(titleForPath("/students/42")).toBe("Students");
  });
  it("falls back for an unknown route", () => {
    expect(titleForPath("/nope")).toBe("MNA Management System");
  });
});

describe("NAV", () => {
  it("marks every screen as ready", () => {
    const ready = NAV.filter((n) => n.ready).map((n) => n.to);
    expect(ready).toEqual(NAV.map((n) => n.to));
    expect(NAV.every((n) => n.ready)).toBe(true);
  });
  it("has a unique path for every entry", () => {
    const paths = NAV.map((n) => n.to);
    expect(new Set(paths).size).toBe(paths.length);
  });
});
