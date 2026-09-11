import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { execute, executeBatch, select, type BatchStatement } from "@/lib/db";
import { currentYearId } from "@/features/settings/api";
import { nextCode } from "@/features/students/logic";

const EXAM_PREFIX = "EX-";
const EXAM_CODE_WIDTH = 4;

export interface ExamFeeRow {
  student_id: number;
  student_code: string;
  full_name: string;
  class_name: string | null;
  fee_id: number | null;
  amount_due: number;
  amount_paid: number;
  receipt_no: string | null;
  notes: string | null;
}

export function useExamFees(classId: number | "all", yearId: number | null) {
  return useQuery({
    queryKey: ["exam-fees", classId, yearId],
    enabled: yearId != null,
    queryFn: () => {
      const cf = classId !== "all" ? `AND s.class_id = ${Number(classId)}` : "";
      return select<ExamFeeRow>(
        `SELECT s.id AS student_id, s.student_code, s.full_name, cl.name AS class_name,
                ef.id AS fee_id,
                COALESCE(ef.amount_due, 0) AS amount_due,
                COALESCE(ef.amount_paid, 0) AS amount_paid,
                ef.receipt_no, ef.notes
         FROM students s
         LEFT JOIN classes cl ON cl.id = s.class_id
         LEFT JOIN exam_fees ef ON ef.student_id = s.id AND ef.year_id = ?
         WHERE s.status = 'Active' ${cf}
         ORDER BY s.full_name COLLATE NOCASE`,
        [yearId],
      );
    },
  });
}

async function nextReceipt(): Promise<string> {
  const rows = await select<{ receipt_no: string | null }>(
    "SELECT receipt_no FROM exam_fees WHERE receipt_no IS NOT NULL",
  );
  return nextCode(
    rows.map((r) => r.receipt_no ?? "").filter(Boolean),
    EXAM_PREFIX,
    EXAM_CODE_WIDTH,
  );
}

export function useSaveExamFee() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (row: {
      studentId: number;
      amount_due: number;
      amount_paid: number;
      notes: string | null;
      receipt_no: string | null;
    }) => {
      const yearId = await currentYearId();
      if (yearId == null) throw new Error("Set a current academic year first.");
      const receipt =
        row.receipt_no ?? (row.amount_paid > 0 ? await nextReceipt() : null);
      await execute(
        `INSERT INTO exam_fees (student_id, year_id, amount_due, amount_paid, receipt_no, notes)
         VALUES (?, ?, ?, ?, ?, ?)
         ON CONFLICT(student_id, year_id) DO UPDATE SET
           amount_due = excluded.amount_due,
           amount_paid = excluded.amount_paid,
           receipt_no = COALESCE(exam_fees.receipt_no, excluded.receipt_no),
           notes = excluded.notes,
           updated_at = datetime('now')`,
        [row.studentId, yearId, row.amount_due, row.amount_paid, receipt, row.notes],
      );
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["exam-fees"] }),
  });
}

/** Set amount_due for every active student in a class (or all classes). */
export function useApplyStandardFee() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ amount, classId }: { amount: number; classId: number | "all" }) => {
      const yearId = await currentYearId();
      if (yearId == null) throw new Error("Set a current academic year first.");
      const cf = classId !== "all" ? `AND class_id = ${Number(classId)}` : "";
      const students = await select<{ id: number }>(
        `SELECT id FROM students WHERE status = 'Active' ${cf}`,
      );
      const statements: BatchStatement[] = students.map((s) => ({
        sql: `INSERT INTO exam_fees (student_id, year_id, amount_due, amount_paid)
              VALUES (?, ?, ?, 0)
              ON CONFLICT(student_id, year_id) DO UPDATE SET
                amount_due = excluded.amount_due, updated_at = datetime('now')`,
        params: [s.id, yearId, amount],
      }));
      await executeBatch(statements);
      return students.length;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["exam-fees"] }),
  });
}
