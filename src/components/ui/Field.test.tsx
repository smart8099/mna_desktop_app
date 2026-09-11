import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { Field } from "./Field";

describe("Field", () => {
  it("renders the label, hint and children and links the label to the control", () => {
    render(
      <Field label="Weekend rate" hint="Applied every weekend" htmlFor="wr">
        <input id="wr" defaultValue="5" />
      </Field>,
    );
    expect(screen.getByText("Weekend rate")).toBeInTheDocument();
    expect(screen.getByText("Applied every weekend")).toBeInTheDocument();
    const input = screen.getByDisplayValue("5");
    expect(screen.getByText("Weekend rate")).toHaveAttribute("for", "wr");
    expect(input).toHaveAttribute("id", "wr");
  });

  it("omits the hint when not provided", () => {
    render(
      <Field label="Only label">
        <input />
      </Field>,
    );
    expect(screen.queryByText("Applied every weekend")).not.toBeInTheDocument();
  });
});
