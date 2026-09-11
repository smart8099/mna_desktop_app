import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { PlaceholderPage } from "./PlaceholderPage";

describe("PlaceholderPage", () => {
  it("shows the module name, blurb and its phase", () => {
    render(
      <PlaceholderPage
        title="Students"
        phase={1}
        blurb="The master student register."
      />,
    );
    expect(screen.getByRole("heading", { name: "Students" })).toBeInTheDocument();
    expect(screen.getByText("The master student register.")).toBeInTheDocument();
    expect(screen.getByText("Arrives in Phase 1")).toBeInTheDocument();
  });
});
