import { describe, expect, it } from "vitest";
import { act, renderHook } from "@testing-library/react";
import { usePagination } from "./usePagination";

const items = Array.from({ length: 57 }, (_, i) => i + 1);

describe("usePagination", () => {
  it("slices the current page and reports totals", () => {
    const { result } = renderHook(() => usePagination(items, { pageSize: 25 }));
    expect(result.current.pageItems).toHaveLength(25);
    expect(result.current.pageItems[0]).toBe(1);
    expect(result.current.total).toBe(57);
  });

  it("navigates pages and exposes the last partial page", () => {
    const { result } = renderHook(() => usePagination(items, { pageSize: 25 }));
    act(() => result.current.setPage(3));
    expect(result.current.page).toBe(3);
    expect(result.current.pageItems).toEqual([51, 52, 53, 54, 55, 56, 57]);
  });

  it("clamps a page that no longer exists", () => {
    const { result, rerender } = renderHook(({ data }) => usePagination(data, { pageSize: 25 }), {
      initialProps: { data: items },
    });
    act(() => result.current.setPage(3));
    rerender({ data: items.slice(0, 10) });
    expect(result.current.page).toBe(1);
    expect(result.current.pageItems).toHaveLength(10);
  });

  it("returns to page 1 when the reset key changes", () => {
    const { result, rerender } = renderHook(
      ({ key }) => usePagination(items, { pageSize: 25, resetKey: key }),
      { initialProps: { key: "a" } },
    );
    act(() => result.current.setPage(2));
    expect(result.current.page).toBe(2);
    rerender({ key: "b" });
    expect(result.current.page).toBe(1);
  });
});
