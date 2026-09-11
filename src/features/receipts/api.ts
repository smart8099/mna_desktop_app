import { useQuery } from "@tanstack/react-query";
import { select } from "@/lib/db";

export interface ReceiptRow {
  id: number;
  receipt_no: string | null;
  amount_due: number;
  amount_paid: number;
  notes: string | null;
  updated_at: string;
  full_name: string;
  student_code: string;
  class_name: string | null;
  hijri_label: string;
  gregorian_label: string;
}

export function useReceipts() {
  return useQuery({
    queryKey: ["receipts"],
    queryFn: () =>
      select<ReceiptRow>(
        `SELECT ef.id, ef.receipt_no, ef.amount_due, ef.amount_paid, ef.notes, ef.updated_at,
                s.full_name, s.student_code, cl.name AS class_name,
                ay.hijri_label, ay.gregorian_label
         FROM exam_fees ef
         JOIN students s ON s.id = ef.student_id
         LEFT JOIN classes cl ON cl.id = s.class_id
         JOIN academic_years ay ON ay.id = ef.year_id
         WHERE ef.amount_paid > 0
         ORDER BY ef.updated_at DESC, ef.id DESC`,
      ),
  });
}
