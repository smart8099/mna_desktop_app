import { describe, expect, it } from "vitest";
import {
  clampMark,
  computeGradebook,
  gradeFor,
  overallAverage,
  rankByTotal,
  resolveWeights,
  toneForGrade,
  weightedTotal,
  type WeightOverride,
} from "./logic";

const DEFAULT = { ca: 0.3, exam: 0.7 };

describe("gradeFor", () => {
  it("maps totals to grade bands", () => {
    expect(gradeFor(85)).toBe("A");
    expect(gradeFor(80)).toBe("A");
    expect(gradeFor(70)).toBe("B");
    expect(gradeFor(60)).toBe("C");
    expect(gradeFor(50)).toBe("D");
    expect(gradeFor(49.9)).toBe("F");
  });
  it("shows a dash when there is no total", () => {
    expect(gradeFor(null)).toBe("—");
  });
});

describe("toneForGrade", () => {
  it("greens A and B, ambers C and D, reds F, and mutes anything else", () => {
    expect(toneForGrade("A")).toBe("primary");
    expect(toneForGrade("B")).toBe("primary");
    expect(toneForGrade("C")).toBe("amber");
    expect(toneForGrade("D")).toBe("amber");
    expect(toneForGrade("F")).toBe("red");
    expect(toneForGrade("—")).toBe("muted");
  });
});

describe("weightedTotal", () => {
  it("applies CA and exam weights", () => {
    expect(weightedTotal(50, 90, DEFAULT)).toBe(78); // 15 + 63
  });
  it("is null unless both marks are present", () => {
    expect(weightedTotal(50, null, DEFAULT)).toBeNull();
    expect(weightedTotal(null, 90, DEFAULT)).toBeNull();
  });
});

describe("resolveWeights", () => {
  const overrides: WeightOverride[] = [
    { scope: "class", ref_id: 4, ca_weight: 0.4, exam_weight: 0.6 },
    { scope: "subject", ref_id: 2, ca_weight: 0.5, exam_weight: 0.5 },
  ];
  it("prefers a subject override over a class override", () => {
    expect(resolveWeights(4, 2, DEFAULT, overrides)).toEqual({ ca: 0.5, exam: 0.5 });
  });
  it("falls back to the class override, then the default", () => {
    expect(resolveWeights(4, 9, DEFAULT, overrides)).toEqual({ ca: 0.4, exam: 0.6 });
    expect(resolveWeights(1, 9, DEFAULT, overrides)).toEqual(DEFAULT);
  });
});

describe("rankByTotal", () => {
  it("ranks highest total first and shares ties", () => {
    const ranked = rankByTotal([
      { id: "a", total: 70 },
      { id: "b", total: 90 },
      { id: "c", total: 70 },
      { id: "d", total: null },
    ]);
    const pos = Object.fromEntries(ranked.map((r) => [r.id, r.position]));
    expect(pos).toEqual({ b: 1, a: 2, c: 2, d: null });
  });
});

describe("overallAverage", () => {
  it("averages the present subject totals", () => {
    expect(overallAverage([60, 80, null, 70])).toBe(70);
    expect(overallAverage([null, null])).toBeNull();
  });
});

describe("clampMark", () => {
  it("clamps to 0–100 and rejects junk", () => {
    expect(clampMark("120")).toBe(100);
    expect(clampMark("-5")).toBe(5); // stripped to "5"
    expect(clampMark("87.5")).toBe(87.5);
    expect(clampMark("")).toBeNull();
    expect(clampMark("abc")).toBeNull();
  });
});

describe("computeGradebook", () => {
  const book = computeGradebook({
    students: [
      { student_id: 1, student_code: "MNA-0001", full_name: "Amina" },
      { student_id: 2, student_code: "MNA-0002", full_name: "Bilal" },
      { student_id: 3, student_code: "MNA-0003", full_name: "Zaid" },
    ],
    subjects: [
      { id: 10, name: "Quran" },
      { id: 20, name: "Fiqh" },
    ],
    results: [
      { student_id: 1, subject_id: 10, ca_mark: 90, exam_mark: 90, teacher_remark: "Excellent" },
      { student_id: 1, subject_id: 20, ca_mark: 60, exam_mark: 60, teacher_remark: null },
      { student_id: 2, subject_id: 10, ca_mark: 50, exam_mark: 50, teacher_remark: null },
      { student_id: 2, subject_id: 20, ca_mark: 80, exam_mark: 80, teacher_remark: null },
      // Zaid has no results
    ],
    classId: 4,
    defaults: DEFAULT,
    overrides: [],
  });

  it("computes per-subject totals, grades and positions", () => {
    const amina = book.find((s) => s.student_id === 1)!;
    expect(amina.cells[0]).toMatchObject({ total: 90, grade: "A", position: 1, remark: "Excellent" });
    const bilal = book.find((s) => s.student_id === 2)!;
    expect(bilal.cells[0]).toMatchObject({ total: 50, grade: "D", position: 2 });
  });

  it("computes overall average, grade and class position", () => {
    const amina = book.find((s) => s.student_id === 1)!;
    expect(amina.average).toBe(75);
    expect(amina.overall_grade).toBe("B");
    expect(amina.overall_position).toBe(1);
    const bilal = book.find((s) => s.student_id === 2)!;
    expect(bilal.average).toBe(65);
    expect(bilal.overall_position).toBe(2);
  });

  it("leaves students with no marks unranked", () => {
    const zaid = book.find((s) => s.student_id === 3)!;
    expect(zaid.average).toBeNull();
    expect(zaid.overall_position).toBeNull();
    expect(zaid.cells.every((c) => c.total == null && c.position == null)).toBe(true);
  });
});
