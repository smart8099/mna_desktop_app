import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { execute, select } from "@/lib/db";
import { currentYearId, useCurrentYear, useSettings } from "@/features/settings/api";
import { nextCode } from "@/features/students/logic";

const FEE_PREFIX = "F-";
const FEE_CODE_WIDTH = 4;

export interface FeeRow {
  id: number;
  student_code: string;
  full_name: string;
  class_name: string | null;
  due: number;
  paid: number;
}

export interface ChargeLine {
  date: string;
  rate: number;
  dow: number;
}

export interface PaymentLine {
  id: number;
  date: string;
  amount: number;
  note: string | null;
  receipt_no: string | null;
}

/**
 * SQL expression for the tuition rate of one Present attendance row `a`.
 * `weekend` and `vacation` are numbers pulled from settings, so interpolation
 * is safe.
 */
export function rateCase(weekend: number, vacation: number): string {
  return `CASE
    WHEN CAST(strftime('%w', a.date) AS INTEGER) IN (0, 6) THEN ${weekend}
    WHEN CAST(strftime('%w', a.date) AS INTEGER) IN (1, 2, 3)
      AND EXISTS (
        SELECT 1 FROM academic_calendar c
        WHERE c.type = 'vacation' AND a.date BETWEEN c.start_date AND c.end_date
      ) THEN ${vacation}
    ELSE 0 END`;
}

function num(v: unknown): number {
  return Number(v) || 0;
}

export function useFeeSummary(classId: number | "all") {
  const { data: settings } = useSettings();
  const { data: year } = useCurrentYear();
  const weekend = num(settings?.weekend_rate);
  const vacation = num(settings?.vacation_rate);

  return useQuery({
    queryKey: ["fee-summary", classId, weekend, vacation, year?.id ?? null],
    enabled: !!settings,
    queryFn: () => {
      const rc = rateCase(weekend, vacation);
      const yf = year ? `AND a.year_id = ${Number(year.id)}` : "";
      const pf = year ? `AND p.year_id = ${Number(year.id)}` : "";
      const cf = classId !== "all" ? `AND s.class_id = ${Number(classId)}` : "";
      return select<FeeRow>(
        `SELECT s.id, s.student_code, s.full_name, cl.name AS class_name,
                COALESCE((SELECT SUM(${rc}) FROM attendance a
                          WHERE a.student_id = s.id AND a.status = 'Present' ${yf}), 0) AS due,
                COALESCE((SELECT SUM(p.amount) FROM fee_payments p
                          WHERE p.student_id = s.id ${pf}), 0) AS paid
         FROM students s
         LEFT JOIN classes cl ON cl.id = s.class_id
         WHERE s.status = 'Active' ${cf}
         ORDER BY s.full_name COLLATE NOCASE`,
      );
    },
  });
}

/**
 * `yearId` is optional: pass it to scope the ledger to a specific academic
 * year (e.g. a page-local `useYearFilter()`). Omit it to keep the historic
 * default of following the global current year — that's still what the
 * Fees page's LedgerDrawer relies on.
 */
export function useStudentLedger(studentId: number | null, yearId?: number | null) {
  const { data: settings } = useSettings();
  const { data: currentYear } = useCurrentYear();
  const effectiveYearId = yearId !== undefined ? yearId : (currentYear?.id ?? null);
  const weekend = num(settings?.weekend_rate);
  const vacation = num(settings?.vacation_rate);

  return useQuery({
    queryKey: ["student-ledger", studentId, weekend, vacation, effectiveYearId],
    enabled: studentId != null && !!settings,
    queryFn: async () => {
      const rc = rateCase(weekend, vacation);
      const yf = effectiveYearId ? `AND a.year_id = ${Number(effectiveYearId)}` : "";
      const pf = effectiveYearId ? `AND year_id = ${Number(effectiveYearId)}` : "";
      const charges = await select<ChargeLine>(
        `SELECT date, rate, dow FROM (
           SELECT a.date AS date, ${rc} AS rate,
                  CAST(strftime('%w', a.date) AS INTEGER) AS dow
           FROM attendance a
           WHERE a.student_id = ${Number(studentId)} AND a.status = 'Present' ${yf}
         ) WHERE rate > 0
         ORDER BY date DESC`,
      );
      const payments = await select<PaymentLine>(
        `SELECT id, date, amount, note, receipt_no FROM fee_payments
         WHERE student_id = ${Number(studentId)} ${pf}
         ORDER BY date DESC, id DESC`,
      );
      const due = charges.reduce((t, c) => t + c.rate, 0);
      const paid = payments.reduce((t, p) => t + p.amount, 0);
      return { charges, payments, due, paid };
    },
  });
}

export function useRecordPayment() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (p: {
      studentId: number;
      amount: number;
      date: string;
      note: string | null;
    }) => {
      const yearId = await currentYearId();
      const existing = await select<{ receipt_no: string | null }>(
        "SELECT receipt_no FROM fee_payments",
      );
      const receipt = nextCode(
        existing.map((r) => r.receipt_no ?? "").filter(Boolean),
        FEE_PREFIX,
        FEE_CODE_WIDTH,
      );
      await execute(
        `INSERT INTO fee_payments (student_id, date, amount, note, receipt_no, year_id)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [p.studentId, p.date, p.amount, p.note, receipt, yearId],
      );
      return receipt;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["fee-summary"] });
      qc.invalidateQueries({ queryKey: ["student-ledger"] });
    },
  });
}

export function useDeletePayment() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => execute("DELETE FROM fee_payments WHERE id = ?", [id]),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["fee-summary"] });
      qc.invalidateQueries({ queryKey: ["student-ledger"] });
    },
  });
}
