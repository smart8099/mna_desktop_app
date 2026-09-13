import { round2 } from "@/lib/money";
import type { NamedRow } from "@/features/settings/api";
import type { ImportedStudent, StudentRow } from "./types";

/** Pre-2026 student code format, e.g. "MNA-0042" — still recognized when
 * computing the next number so the running count carries on from students
 * created before the year-prefixed format below, but no longer generated. */
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

// ── student codes: year-prefixed, e.g. "26MNA0092" in 2026 ─────────────────
//
// The running number never resets per year — it's the school's all-time
// admission count, and the leading two digits just record which year a
// student was actually admitted in. Existing students keep whatever code
// they already have (old "MNA-0042" format); only new codes use this.

/** The two-digit year prefix for a code generated right now, e.g. "26" in 2026. */
function yearPrefix(now: Date): string {
  return String(now.getFullYear()).slice(-2);
}

/**
 * The sequence number embedded in a student code, recognizing both the
 * legacy "MNA-0042" format and the current year-prefixed "26MNA0042" one —
 * so the running count carries on correctly across the format change. Null
 * for anything else (e.g. a teacher code).
 */
export function studentSequenceNumber(code: string): number | null {
  const legacy = code.match(/^MNA-(\d+)$/);
  if (legacy) return parseInt(legacy[1], 10);
  const current = code.match(/^\d{2}MNA(\d+)$/);
  if (current) return parseInt(current[1], 10);
  return null;
}

/** The highest sequence number used by any existing student code, old or new format. */
export function maxStudentSequenceNumber(codes: string[]): number {
  return codes.reduce((max, code) => {
    const n = studentSequenceNumber(code);
    return n != null && n > max ? n : max;
  }, 0);
}

/** The code a new student gets today, e.g. "26MNA0092". */
export function nextStudentCode(codes: string[], now: Date = new Date()): string {
  const n = maxStudentSequenceNumber(codes) + 1;
  return `${yearPrefix(now)}MNA${String(n).padStart(STUDENT_CODE_WIDTH, "0")}`;
}

/** `count` fresh sequential student codes for right now, e.g. "26MNA0092".."26MNA0095". */
export function allocateStudentCodes(
  codes: string[],
  count: number,
  now: Date = new Date(),
): string[] {
  const start = maxStudentSequenceNumber(codes) + 1;
  const yp = yearPrefix(now);
  return Array.from({ length: count }, (_, i) =>
    `${yp}MNA${String(start + i).padStart(STUDENT_CODE_WIDTH, "0")}`,
  );
}

/**
 * Admission number is the Student ID stripped of its zero-padding (and, for
 * the legacy format, its dash) — e.g. "MNA-0042" -> "MNA42",
 * "26MNA0042" -> "26MNA42".
 */
export function admissionFromCode(studentCode: string): string {
  const legacy = studentCode.match(/^MNA-(\d+)$/);
  if (legacy) return `MNA${parseInt(legacy[1], 10)}`;
  const current = studentCode.match(/^(\d{2})MNA(\d+)$/);
  if (current) return `${current[1]}MNA${parseInt(current[2], 10)}`;
  return "";
}

/** The admission number the next new student will get. */
export function suggestedAdmissionNo(existingStudentCodes: string[], now: Date = new Date()): string {
  return admissionFromCode(nextStudentCode(existingStudentCodes, now));
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
