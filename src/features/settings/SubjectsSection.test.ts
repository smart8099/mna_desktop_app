import { describe, expect, it } from "vitest";
import { classesSummary } from "./SubjectsSection";
import type { SubjectWithClasses } from "./api";

function subject(class_ids: number[]): SubjectWithClasses {
  return { id: 1, name: "Quran", sort_order: 1, class_ids };
}

describe("classesSummary", () => {
  it("says 'All classes' when every class is checked", () => {
    expect(classesSummary(subject([1, 2, 3]), 3)).toBe("All classes");
  });

  it("says 'No classes yet' when none are checked", () => {
    expect(classesSummary(subject([]), 6)).toBe("No classes yet");
  });

  it("counts a partial selection", () => {
    expect(classesSummary(subject([1, 3]), 6)).toBe("2 of 6 classes");
  });

  it("isn't fooled by zero classes existing at all", () => {
    // classCount = 0 and class_ids = [] must not read as "all classes"
    expect(classesSummary(subject([]), 0)).toBe("No classes yet");
  });
});
