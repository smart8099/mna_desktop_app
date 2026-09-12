import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { invoke } from "@tauri-apps/api/core";
import { execute, executeBatch, select, selectOne, type BatchStatement } from "@/lib/db";
import { normalizeGhanaPhone } from "@/lib/phone";
import { currentYearId, useSettings, type NamedRow } from "@/features/settings/api";
import { rateCase } from "@/features/fees/api";
import {
  admissionFromCode,
  allocateCodes,
  computeYearBalances,
  nextCode,
  planImport,
  promotionTarget,
  STUDENT_CODE_WIDTH,
  STUDENT_PREFIX,
  type YearFeeTotals,
} from "./logic";
import type { ImportedStudent, StudentInput, StudentRow } from "./types";

const LIST_SQL = `
  SELECT s.*, c.name AS class_name
  FROM students s
  LEFT JOIN classes c ON c.id = s.class_id
  ORDER BY s.full_name COLLATE NOCASE`;

export function useStudents() {
  return useQuery({
    queryKey: ["students"],
    queryFn: () => select<StudentRow>(LIST_SQL),
  });
}

// ── single student profile ────────────────────────────────────────────────

export function useStudent(id: number | null) {
  return useQuery({
    queryKey: ["student", id],
    enabled: id != null,
    queryFn: () =>
      selectOne<StudentRow>(
        `SELECT s.*, c.name AS class_name
         FROM students s LEFT JOIN classes c ON c.id = s.class_id
         WHERE s.id = ?`,
        [id],
      ),
  });
}

export interface StudentAttendance {
  present: number;
  absent: number;
  recent: { date: string; status: string }[];
}

export function useStudentAttendance(id: number | null, yearId: number | null) {
  return useQuery({
    queryKey: ["student-attendance", id, yearId],
    enabled: id != null,
    queryFn: async (): Promise<StudentAttendance> => {
      const yf = yearId != null ? "AND year_id = ?" : "";
      const params = yearId != null ? [id, yearId] : [id];
      const agg = await selectOne<{ present: number; absent: number }>(
        `SELECT COALESCE(SUM(status = 'Present'), 0) AS present,
                COALESCE(SUM(status = 'Absent'), 0) AS absent
         FROM attendance WHERE student_id = ? ${yf}`,
        params,
      );
      const recent = await select<{ date: string; status: string }>(
        `SELECT date, status FROM attendance WHERE student_id = ? ${yf}
         ORDER BY date DESC LIMIT 14`,
        params,
      );
      return { present: agg?.present ?? 0, absent: agg?.absent ?? 0, recent };
    },
  });
}

export interface EnrollmentRow {
  hijri_label: string;
  gregorian_label: string;
  is_current: number;
  class_name: string;
}

export function useStudentEnrollments(id: number | null) {
  return useQuery({
    queryKey: ["student-enrollments", id],
    enabled: id != null,
    queryFn: () =>
      select<EnrollmentRow>(
        `SELECT ay.hijri_label, ay.gregorian_label, ay.is_current, c.name AS class_name
         FROM student_enrollments e
         JOIN academic_years ay ON ay.id = e.year_id
         JOIN classes c ON c.id = e.class_id
         WHERE e.student_id = ?
         ORDER BY ay.gregorian_label DESC`,
        [id],
      ),
  });
}

export interface StudentExamFee {
  amount_due: number;
  amount_paid: number;
  receipt_no: string | null;
  notes: string | null;
}

export function useStudentExamFee(id: number | null, yearId: number | null) {
  return useQuery({
    queryKey: ["student-exam-fee", id, yearId],
    enabled: id != null && yearId != null,
    queryFn: () =>
      selectOne<StudentExamFee>(
        "SELECT amount_due, amount_paid, receipt_no, notes FROM exam_fees WHERE student_id = ? AND year_id = ?",
        [id, yearId],
      ),
  });
}

/**
 * Every academic year's tuition and exam-fee balance for this student, in
 * one pass — so a balance carried from a past (or into a future) year shows
 * up here even while some other page is scoped to just one year.
 */
export function useStudentYearBalances(studentId: number | null) {
  const { data: settings } = useSettings();
  const weekend = Number(settings?.weekend_rate ?? 0);
  const vacation = Number(settings?.vacation_rate ?? 0);

  const query = useQuery({
    queryKey: ["student-year-balances", studentId, weekend, vacation],
    enabled: studentId != null && !!settings,
    queryFn: () => {
      const rc = rateCase(weekend, vacation);
      return select<YearFeeTotals>(
        `SELECT ay.id AS year_id, ay.hijri_label, ay.gregorian_label, ay.is_current,
                COALESCE((SELECT SUM(${rc}) FROM attendance a
                          WHERE a.student_id = ? AND a.status = 'Present' AND a.year_id = ay.id), 0) AS tuition_due,
                COALESCE((SELECT SUM(p.amount) FROM fee_payments p
                          WHERE p.student_id = ? AND p.year_id = ay.id), 0) AS tuition_paid,
                COALESCE(ef.amount_due, 0) AS exam_due,
                COALESCE(ef.amount_paid, 0) AS exam_paid
         FROM academic_years ay
         LEFT JOIN exam_fees ef ON ef.student_id = ? AND ef.year_id = ay.id
         ORDER BY ay.gregorian_label ASC`,
        [studentId, studentId, studentId],
      );
    },
  });

  return { ...query, balances: computeYearBalances(query.data ?? []) };
}

/**
 * Moves an exam-fee overpayment from one year to another: reduces the source
 * year's amount_paid by exactly the excess and adds it to the target year's
 * (creating that row if it doesn't exist yet), leaving a note on both sides
 * so the transfer is visible rather than a silent balance change.
 */
export function useApplyExamFeeCredit() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (p: {
      studentId: number;
      fromYearId: number;
      toYearId: number;
      amount: number;
      standardFee: number;
      noteAmount: string; // pre-formatted with currency, e.g. "GH₵5.00"
      fromYearLabel: string;
      toYearLabel: string;
    }) => {
      const today = new Date().toISOString().slice(0, 10);
      await executeBatch([
        {
          sql: `UPDATE exam_fees SET
                  amount_paid = amount_paid - ?,
                  notes = TRIM(COALESCE(notes || char(10), '') || ?),
                  updated_at = datetime('now')
                WHERE student_id = ? AND year_id = ?`,
          params: [
            p.amount,
            `${p.noteAmount} carried forward to ${p.toYearLabel} on ${today}.`,
            p.studentId,
            p.fromYearId,
          ],
        },
        {
          sql: `INSERT INTO exam_fees (student_id, year_id, amount_due, amount_paid, notes)
                VALUES (?, ?, ?, ?, ?)
                ON CONFLICT(student_id, year_id) DO UPDATE SET
                  amount_paid = amount_paid + excluded.amount_paid,
                  notes = TRIM(COALESCE(exam_fees.notes || char(10), '') || excluded.notes),
                  updated_at = datetime('now')`,
          params: [
            p.studentId,
            p.toYearId,
            p.standardFee,
            p.amount,
            `Includes ${p.noteAmount} credit carried forward from ${p.fromYearLabel}.`,
          ],
        },
      ]);
    },
    onSuccess: () => qc.invalidateQueries(),
  });
}

async function allStudentCodes(): Promise<string[]> {
  const rows = await select<{ student_code: string }>(
    "SELECT student_code FROM students",
  );
  return rows.map((r) => r.student_code);
}

const ENROLLMENT_UPSERT = `
  INSERT INTO student_enrollments (student_id, year_id, class_id)
  VALUES (?, ?, ?)
  ON CONFLICT(student_id, year_id) DO UPDATE SET class_id = excluded.class_id`;

/** Same upsert, but for a student inserted earlier in the same batch/transaction. */
const ENROLLMENT_UPSERT_FOR_LAST_INSERT = `
  INSERT INTO student_enrollments (student_id, year_id, class_id)
  VALUES (last_insert_rowid(), ?, ?)
  ON CONFLICT(student_id, year_id) DO UPDATE SET class_id = excluded.class_id`;

const COLUMNS: (keyof StudentInput)[] = [
  "admission_no",
  "full_name",
  "gender",
  "dob",
  "address",
  "contact",
  "guardian",
  "emergency_contact",
  "date_admitted",
  "class_id",
  "status",
  "photo_path",
  "notes",
];

// admission_no is derived from the Student ID and never changes after creation
const UPDATE_COLUMNS = COLUMNS.filter((c) => c !== "admission_no");

export function useCreateStudent() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: StudentInput) => {
      const code = nextCode(await allStudentCodes(), STUDENT_PREFIX, STUDENT_CODE_WIDTH);
      const yearId = await currentYearId();
      const filled: StudentInput = {
        ...input,
        admission_no: admissionFromCode(code), // always the stripped Student ID
        contact: normalizeGhanaPhone(input.contact),
        emergency_contact: normalizeGhanaPhone(input.emergency_contact),
      };
      const values = COLUMNS.map((c) => filled[c] ?? null);
      const statements: BatchStatement[] = [
        {
          sql: `INSERT INTO students (student_code, ${COLUMNS.join(", ")})
                VALUES (?, ${COLUMNS.map(() => "?").join(", ")})`,
          params: [code, ...values],
        },
      ];
      if (yearId != null && input.class_id != null) {
        statements.push({
          sql: ENROLLMENT_UPSERT_FOR_LAST_INSERT,
          params: [yearId, input.class_id],
        });
      }
      // one round-trip, atomic: the enrollment row can never be orphaned from its student
      await executeBatch(statements);
      return { code };
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["students"] }),
  });
}

export function useUpdateStudent() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, input }: { id: number; input: StudentInput }) => {
      const yearId = await currentYearId();
      const filled: StudentInput = {
        ...input,
        contact: normalizeGhanaPhone(input.contact),
        emergency_contact: normalizeGhanaPhone(input.emergency_contact),
      };
      const setSql = UPDATE_COLUMNS.map((c) => `${c} = ?`).join(", ");
      const statements: BatchStatement[] = [
        {
          sql: `UPDATE students SET ${setSql}, updated_at = datetime('now') WHERE id = ?`,
          params: [...UPDATE_COLUMNS.map((c) => filled[c] ?? null), id],
        },
      ];
      if (yearId != null && input.class_id != null) {
        statements.push({ sql: ENROLLMENT_UPSERT, params: [id, yearId, input.class_id] });
      }
      await executeBatch(statements);
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["students"] }),
  });
}

export function useDeleteStudent() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (student: StudentRow) => {
      await execute("DELETE FROM students WHERE id = ?", [student.id]);
      if (student.photo_path) {
        await invoke("delete_student_photo", { path: student.photo_path }).catch(() => {});
      }
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["students"] }),
  });
}

export function usePromoteStudents() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      students,
      classes,
    }: {
      students: StudentRow[];
      classes: NamedRow[];
    }) => {
      const yearId = await currentYearId();
      const statements: BatchStatement[] = [];
      let moved = 0;
      const skipped: string[] = [];
      for (const s of students) {
        const target = promotionTarget(s.class_id, classes);
        if (!target) {
          skipped.push(s.full_name);
          continue;
        }
        statements.push({
          sql: "UPDATE students SET class_id = ?, updated_at = datetime('now') WHERE id = ?",
          params: [target.id, s.id],
        });
        if (yearId != null) {
          statements.push({ sql: ENROLLMENT_UPSERT, params: [s.id, yearId, target.id] });
        }
        moved += 1;
      }
      await executeBatch(statements);
      return { moved, skipped };
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["students"] }),
  });
}

export function useImportStudents() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      parsed,
      classes,
    }: {
      parsed: ImportedStudent[];
      classes: NamedRow[];
    }) => {
      const existing = await select<{ admission_no: string | null; full_name: string }>(
        "SELECT admission_no, full_name FROM students",
      );
      const plan = planImport(
        parsed,
        existing.map((e) => e.admission_no ?? "").filter(Boolean),
        existing.map((e) => e.full_name),
        classes,
      );
      const toImport = plan.filter((p) => p.action === "import");
      const codes = allocateCodes(
        await allStudentCodes(),
        STUDENT_PREFIX,
        STUDENT_CODE_WIDTH,
        toImport.length,
      );
      const yearId = await currentYearId();

      // One transaction for the whole file: each enrollment statement below
      // refers to the student inserted immediately before it via
      // last_insert_rowid(), so statement order matters and must not be batched
      // out of order.
      const statements: BatchStatement[] = [];
      for (let i = 0; i < toImport.length; i += 1) {
        const { student, classId } = toImport[i];
        const status =
          student.status && ["Active", "Inactive", "Graduated", "Withdrawn"].includes(student.status)
            ? student.status
            : "Active";
        statements.push({
          sql: `INSERT INTO students
                  (student_code, admission_no, full_name, gender, dob, address, contact,
                   guardian, emergency_contact, date_admitted, class_id, status, notes)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          params: [
            codes[i],
            student.admission_no,
            student.full_name,
            student.gender === "Male" || student.gender === "Female" ? student.gender : null,
            student.dob,
            student.address,
            normalizeGhanaPhone(student.contact),
            student.guardian,
            normalizeGhanaPhone(student.emergency_contact),
            student.date_admitted,
            classId,
            status,
            student.notes,
          ],
        });
        if (yearId != null && classId != null) {
          statements.push({ sql: ENROLLMENT_UPSERT_FOR_LAST_INSERT, params: [yearId, classId] });
        }
      }
      await executeBatch(statements);
      return {
        imported: toImport.length,
        skipped: plan.length - toImport.length,
        unknownClass: toImport.filter((p) => p.classUnknown).length,
      };
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["students"] }),
  });
}

// Photos are shown directly via Tauri's asset protocol (convertFileSrc) — no
// IPC round-trip or base64 payload needed, see PhotoField/StudentsPage/
// StudentDetailPage.
