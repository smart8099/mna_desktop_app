import { describe, expect, it } from "vitest";
import { cn } from "./cn";

describe("cn", () => {
  it("joins truthy class names", () => {
    expect(cn("a", "b")).toBe("a b");
  });
  it("drops falsy values and flattens arrays", () => {
    expect(cn("x", false && "y", undefined, null, ["z"])).toBe("x z");
  });
  it("resolves conflicting Tailwind utilities (last wins)", () => {
    expect(cn("p-2", "p-4")).toBe("p-4");
    expect(cn("px-2 py-1", "px-4")).toBe("py-1 px-4");
  });
});
