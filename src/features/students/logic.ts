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
