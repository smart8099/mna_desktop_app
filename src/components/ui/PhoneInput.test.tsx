import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { PhoneInput } from "./PhoneInput";

describe("PhoneInput", () => {
  it("shows the +233 prefix and the local part of an existing value", () => {
    render(<PhoneInput value="+233244123456" onChange={() => {}} />);
    expect(screen.getByText("+233")).toBeInTheDocument();
    expect(screen.getByRole("textbox")).toHaveValue("244123456");
  });

  it("normalises a typed number with a leading zero to +233…", async () => {
    const onChange = vi.fn();
    render(<PhoneInput value={null} onChange={onChange} />);
    await userEvent.type(screen.getByRole("textbox"), "0244123456");
    expect(onChange).toHaveBeenLastCalledWith("+233244123456");
  });

  it("emits null when cleared", async () => {
    const onChange = vi.fn();
    render(<PhoneInput value="+233244123456" onChange={onChange} />);
    await userEvent.clear(screen.getByRole("textbox"));
    expect(onChange).toHaveBeenLastCalledWith(null);
  });
});
