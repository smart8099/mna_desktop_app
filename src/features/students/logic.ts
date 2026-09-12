import { round2 } from "@/lib/money";
import type { NamedRow } from "@/features/settings/api";
import type { ImportedStudent, StudentRow } from "./types";

export const STUDENT_PREFIX = "MNA-";
export const STUDENT_CODE_WIDTH = 4;
export const TEACHER_PREFIX = "MNA-T";
export const TEACHER_CODE_WIDTH = 3;

/** Highest numeric suffix among codes that use exactly `prefix`. */
export function maxCodeNumber(codes: string[], prefix: string): number {
  return codes.reduce((max, code) => {
    if (!code.startsWith(prefix)) return max;
    const rest = code.slice(prefix.length);
    if (!/^\d+$/.test(rest)) return max; // e.g. "MNA-T001" is not a student code
    const n = parseInt(rest, 10);
    return n > max ? n : max;
  }, 0);
}

export function nextCode(codes: string[], prefix: string, width: number): string {
  return prefix + String(maxCodeNumber(codes, prefix) + 1).padStart(width, "0");
}

/** `count` fresh sequential codes that do not collide with `codes`. */
export function allocateCodes(
  codes: string[],
  prefix: string,
  width: number,
  count: number,
): string[] {
  const start = maxCodeNumber(codes, prefix) + 1;
  return Array.from({ length: count }, (_, i) =>
    prefix + String(start + i).padStart(width, "0"),
  );
}

/** Admission number is the Student ID stripped of its dash and zero-padding, e.g. MNA-0042 -> MNA42. */
export function admissionFromCode(studentCode: string): string {
  const n = parseInt(studentCode.replace(/\D/g, ""), 10);
  return Number.isFinite(n) ? `MNA${n}` : "";
}

/** The admission number the next new student will get. */
export function suggestedAdmissionNo(existingStudentCodes: string[]): string {
  return admissionFromCode(
    nextCode(existingStudentCodes, STUDENT_PREFIX, STUDENT_CODE_WIDTH),
  );
}

/** The class a student moves into on promotion, or null if already at the top. */
export function promotionTarget(
  currentClassId: number | null,
  classes: NamedRow[],
): NamedRow | null {
  if (currentClassId == null) return null;
  const sorted = [...classes].sort(
    (a, b) => a.sort_order - b.sort_order || a.name.localeCompare(b.name),
  );
  const idx = sorted.findIndex((c) => c.id === currentClassId);
  if (idx === -1 || idx === sorted.length - 1) return null;
  return sorted[idx + 1];
}

export interface StudentFilter {
  q: string;
  classId: number | "all";
  status: string | "all";
}

export function filterStudents(rows: StudentRow[], f: StudentFilter): StudentRow[] {
  const q = f.q.trim().toLowerCase();
  return rows.filter((r) => {
    if (f.classId !== "all" && r.class_id !== f.classId) return false;
    if (f.status !== "all" && r.status !== f.status) return false;
    if (!q) return true;
    return [r.full_name, r.student_code, r.admission_no, r.guardian, r.contact]
      .filter(Boolean)
      .some((v) => (v as string).toLowerCase().includes(q));
  });
}

export function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return "?";
  return (parts[0][0] + (parts.length > 1 ? parts[parts.length - 1][0] : "")).toUpperCase();
}

/** Whole years between an ISO date of birth and today, or null if unparseable. */
export function ageFromDob(dob: string | null | undefined, now: Date = new Date()): number | null {
  if (!dob) return null;
  const d = new Date(dob);
  if (Number.isNaN(d.getTime())) return null;
  let age = now.getFullYear() - d.getFullYear();
  const monthDiff = now.getMonth() - d.getMonth();
  if (monthDiff < 0 || (monthDiff === 0 && now.getDate() < d.getDate())) age -= 1;
  return age >= 0 && age < 130 ? age : null;
}

// ── fee balances across every academic year ─────────────────────────────────

export interface YearFeeTotals {
  year_id: number;
  hijri_label: string;
  gregorian_label: string;
  is_current: number;
  tuition_due: number;
  tuition_paid: number;
  exam_due: number;
  exam_paid: number;
}

export interface YearBalanceRow extends YearFeeTotals {
  tuition_balance: number; // > 0 owing, < 0 overpaid
  exam_balance: number;
  total_balance: number;
}

/**
 * Adds computed balances and drops any year with no fee activity at all
 * (e.g. a year before the student was enrolled). Kept separate from the
 * query so it's cheaply unit-testable.
 */
export function computeYearBalances(rows: YearFeeTotals[]): YearBalanceRow[] {
  return rows
    .map((r) => ({
      ...r,
      tuition_balance: round2(r.tuition_due - r.tuition_paid),
      exam_balance: round2(r.exam_due - r.exam_paid),
      total_balance: round2(r.tuition_due - r.tuition_paid + (r.exam_due - r.exam_paid)),
    }))
    .filter((r) => r.tuition_due || r.tuition_paid || r.exam_due || r.exam_paid);
}

/**
 * The year to carry an overpayment into: the next one chronologically after
 * `fromYearId`, by gregorian_label — not by id, since ids aren't necessarily
 * assigned in year order (e.g. a future year can be created before the one
 * that precedes it). Null if `fromYearId` is already the most recent.
 */
export function nextYearAfter<T extends { id: number; gregorian_label: string }>(
  years: T[],
  fromYearId: number,
): T | null {
  const sorted = [...years].sort((a, b) => a.gregorian_label.localeCompare(b.gregorian_label));
  const idx = sorted.findIndex((y) => y.id === fromYearId);
  if (idx === -1 || idx === sorted.length - 1) return null;
  return sorted[idx + 1];
}

export interface ImportPlanRow {
  student: ImportedStudent;
  action: "import" | "skip-duplicate";
  classId: number | null;
  classUnknown: boolean;
}

/** Decide, per parsed row, whether it will be imported and which class it maps to. */
export function planImport(
  parsed: ImportedStudent[],
  existingAdmissionNos: string[],
  existingNames: string[],
  classes: NamedRow[],
): ImportPlanRow[] {
  const admSet = new Set(existingAdmissionNos.map((a) => a.trim().toLowerCase()));
  const nameSet = new Set(existingNames.map((n) => n.trim().toLowerCase()));
  const classByName = new Map(classes.map((c) => [c.name.trim().toLowerCase(), c.id]));

  return parsed.map((student) => {
    const adm = student.admission_no?.trim().toLowerCase();
    const duplicate = adm
      ? admSet.has(adm)
      : nameSet.has(student.full_name.trim().toLowerCase());
    const mappedClass = student.class_name
      ? classByName.get(student.class_name.trim().toLowerCase()) ?? null
      : null;
    return {
      student,
      action: duplicate ? "skip-duplicate" : "import",
      classId: mappedClass,
      classUnknown: !!student.class_name && mappedClass == null,
    };
  });
}
