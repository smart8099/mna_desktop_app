import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Pagination } from "./Pagination";

describe("Pagination", () => {
  it("reports the visible range and page count", () => {
    render(
      <Pagination page={2} pageSize={25} total={112} onPageChange={() => {}} onPageSizeChange={() => {}} />,
    );
    expect(screen.getByText("26–50 of 112")).toBeInTheDocument();
    expect(screen.getByText("2 / 5")).toBeInTheDocument();
  });

  it("moves to the next page", async () => {
    const onPageChange = vi.fn();
    render(
      <Pagination page={1} pageSize={25} total={60} onPageChange={onPageChange} onPageSizeChange={() => {}} />,
    );
    await userEvent.click(screen.getByRole("button", { name: "Next page" }));
    expect(onPageChange).toHaveBeenCalledWith(2);
  });

  it("disables Previous on the first page and Next on the last", () => {
    const { rerender } = render(
      <Pagination page={1} pageSize={25} total={30} onPageChange={() => {}} onPageSizeChange={() => {}} />,
    );
    expect(screen.getByRole("button", { name: "Previous page" })).toBeDisabled();
    rerender(
      <Pagination page={2} pageSize={25} total={30} onPageChange={() => {}} onPageSizeChange={() => {}} />,
    );
    expect(screen.getByRole("button", { name: "Next page" })).toBeDisabled();
  });
});
