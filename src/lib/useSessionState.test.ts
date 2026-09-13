import { beforeEach, describe, expect, it } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useSessionState } from "./useSessionState";

beforeEach(() => {
  sessionStorage.clear();
});

describe("useSessionState", () => {
  it("starts at the given initial value when nothing is stored yet", () => {
    const { result } = renderHook(() => useSessionState("k", "all"));
    expect(result.current[0]).toBe("all");
  });

  it("persists updates to sessionStorage and reflects them immediately", () => {
    const { result } = renderHook(() => useSessionState("k", "all"));
    act(() => result.current[1]("bilal"));
    expect(result.current[0]).toBe("bilal");
    expect(sessionStorage.getItem("k")).toBe(JSON.stringify("bilal"));
  });

  it("a fresh mount picks up the previously stored value (survives a remount)", () => {
    const first = renderHook(() => useSessionState("k", "all"));
    act(() => first.result.current[1]("bilal"));
    first.unmount();

    const second = renderHook(() => useSessionState("k", "all"));
    expect(second.result.current[0]).toBe("bilal");
  });

  it("supports a functional updater like useState does", () => {
    const { result } = renderHook(() => useSessionState<number>("count", 1));
    act(() => result.current[1]((prev) => prev + 1));
    expect(result.current[0]).toBe(2);
    expect(sessionStorage.getItem("count")).toBe("2");
  });

  it("different keys don't collide", () => {
    const a = renderHook(() => useSessionState("a", "x"));
    const b = renderHook(() => useSessionState("b", "y"));
    act(() => a.result.current[1]("changed"));
    expect(b.result.current[0]).toBe("y");
  });
});
