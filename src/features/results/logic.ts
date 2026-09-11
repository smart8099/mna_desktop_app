import { round2 } from "@/lib/money";

/** Weights as fractions that sum to 1 (e.g. { ca: 0.3, exam: 0.7 }). */
export interface Weights {
  ca: number;
  exam: number;
}

export const GRADE_BANDS: ReadonlyArray<readonly [number, string]> = [
  [80, "A"],
  [70, "B"],
  [60, "C"],
  [50, "D"],
];

export function gradeFor(total: number | null): string {
  if (total == null) return "—";
  for (const [min, letter] of GRADE_BANDS) if (total >= min) return letter;
  return "F";
}

/** Weighted subject total, or null if either mark is missing. */
export function weightedTotal(
  ca: number | null,
  exam: number | null,
  w: Weights,
): number | null {
  if (ca == null || exam == null) return null;
  return round2(ca * w.ca + exam * w.exam);
}

export interface WeightOverride {
  scope: "class" | "subject";
  ref_id: number;
  ca_weight: number;
  exam_weight: number;
}

/** Subject override beats class override beats the global default. */
export function resolveWeights(
  classId: number | null | undefined,
  subjectId: number | null | undefined,
  defaults: Weights,
  overrides: WeightOverride[],
): Weights {
  const bySubject =
    subjectId != null &&
    overrides.find((o) => o.scope === "subject" && o.ref_id === subjectId);
  if (bySubject) return { ca: bySubject.ca_weight, exam: bySubject.exam_weight };

  const byClass =
    classId != null && overrides.find((o) => o.scope === "class" && o.ref_id === classId);
  if (byClass) return { ca: byClass.ca_weight, exam: byClass.exam_weight };

  return defaults;
}

/**
 * 1-based competition ranking by `total` descending. Ties share a rank;
 * rows with a null total get position null.
 */
export function rankByTotal<T extends { total: number | null }>(
  rows: T[],
): (T & { position: number | null })[] {
  const graded = rows
    .map((row, index) => ({ row, index }))
    .filter((x) => x.row.total != null)
    .sort((a, b) => b.row.total! - a.row.total! || a.index - b.index);

  const position = new Map<number, number>();
  graded.forEach((x, i) => {
    const prev = graded[i - 1];
    position.set(
      x.index,
      prev && prev.row.total === x.row.total ? position.get(prev.index)! : i + 1,
    );
  });

  return rows.map((row, index) => ({ ...row, position: position.get(index) ?? null }));
}

export function overallAverage(totals: (number | null)[]): number | null {
  const values = totals.filter((t): t is number => t != null);
  if (!values.length) return null;
  return round2(values.reduce((a, b) => a + b, 0) / values.length);
}

export function clampMark(raw: string): number | null {
  const cleaned = raw.replace(/[^0-9.]/g, "");
  if (!cleaned) return null;
  const n = Number(cleaned);
  if (!Number.isFinite(n)) return null;
  return Math.min(100, Math.max(0, round2(n)));
}

// ── whole-class gradebook (report cards) ───────────────────────────────────

export interface GradebookInputs {
  students: { student_id: number; student_code: string; full_name: string }[];
  subjects: { id: number; name: string }[];
  results: {
    student_id: number;
    subject_id: number;
    ca_mark: number | null;
    exam_mark: number | null;
    teacher_remark: string | null;
  }[];
  classId: number | null;
  defaults: Weights;
  overrides: WeightOverride[];
}

export interface SubjectCell {
  subject_id: number;
  name: string;
  ca: number | null;
  exam: number | null;
  total: number | null;
  grade: string;
  position: number | null;
  remark: string | null;
}

export interface GradebookStudent {
  student_id: number;
  student_code: string;
  full_name: string;
  cells: SubjectCell[];
  average: number | null;
  overall_grade: string;
  overall_position: number | null;
}

export function computeGradebook(input: GradebookInputs): GradebookStudent[] {
  const byStudentSubject = new Map<string, GradebookInputs["results"][number]>();
  for (const r of input.results) {
    byStudentSubject.set(`${r.student_id}:${r.subject_id}`, r);
  }

  // Index overrides once (O(overrides)) instead of re-scanning the whole list
  // for every student x subject cell (O(students * subjects * overrides)) —
  // matters once a class has 30-40 students across 7+ subjects.
  const subjectOverrides = new Map(
    input.overrides.filter((o) => o.scope === "subject").map((o) => [o.ref_id, o]),
  );
  const classOverride =
    input.classId != null
      ? input.overrides.find((o) => o.scope === "class" && o.ref_id === input.classId)
      : undefined;
  const weightsForSubject = (subjectId: number): Weights => {
    const bySubject = subjectOverrides.get(subjectId);
    if (bySubject) return { ca: bySubject.ca_weight, exam: bySubject.exam_weight };
    if (classOverride) return { ca: classOverride.ca_weight, exam: classOverride.exam_weight };
    return input.defaults;
  };

  // Per-subject totals for every student.
  const rows: GradebookStudent[] = input.students.map((s) => ({
    student_id: s.student_id,
    student_code: s.student_code,
    full_name: s.full_name,
    cells: input.subjects.map((subject) => {
      const w = weightsForSubject(subject.id);
      const raw = byStudentSubject.get(`${s.student_id}:${subject.id}`);
      const ca = raw?.ca_mark ?? null;
      const exam = raw?.exam_mark ?? null;
      const total = weightedTotal(ca, exam, w);
      return {
        subject_id: subject.id,
        name: subject.name,
        ca,
        exam,
        total,
        grade: gradeFor(total),
        position: null as number | null,
        remark: raw?.teacher_remark ?? null,
      };
    }),
    average: null,
    overall_grade: "—",
    overall_position: null,
  }));

  // Subject positions: rank each subject column across students.
  input.subjects.forEach((_subject, colIndex) => {
    const ranked = rankByTotal(rows.map((r) => ({ total: r.cells[colIndex].total })));
    ranked.forEach((rk, i) => {
      rows[i].cells[colIndex].position = rk.position;
    });
  });

  // Overall average + grade, then overall position.
  rows.forEach((r) => {
    r.average = overallAverage(r.cells.map((c) => c.total));
    r.overall_grade = gradeFor(r.average);
  });
  const overallRanked = rankByTotal(rows.map((r) => ({ total: r.average })));
  overallRanked.forEach((rk, i) => {
    rows[i].overall_position = rk.position;
  });

  return rows;
}
