import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { executeBatch, select, type BatchStatement } from "@/lib/db";
import { currentYearId } from "@/features/settings/api";

export type Mark = "Present" | "Absent";

export interface RosterRow {
  id: number;
  student_code: string;
  full_name: string;
  class_name: string | null;
  mark: Mark | null;
}

export interface SummaryRow {
  id: number;
  student_code: string;
  full_name: string;
  class_name: string | null;
  present: number;
  absent: number;
}

export function useRoster(classId: number | "all", date: string) {
  return useQuery({
    queryKey: ["roster", classId, date],
    enabled: !!date,
    queryFn: () => {
      const classFilter = classId === "all" ? "" : `AND s.class_id = ${Number(classId)}`;
      return select<RosterRow>(
        `SELECT s.id, s.student_code, s.full_name, cl.name AS class_name, a.status AS mark
         FROM students s
         LEFT JOIN classes cl ON cl.id = s.class_id
         LEFT JOIN attendance a ON a.student_id = s.id AND a.date = ?
         WHERE s.status = 'Active' ${classFilter}
         ORDER BY cl.sort_order, s.full_name COLLATE NOCASE`,
        [date],
      );
    },
  });
}

export function useSaveAttendance() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      date,
      marks,
    }: {
      date: string;
      marks: { studentId: number; mark: Mark | null }[];
    }) => {
      const yearId = await currentYearId();
      const statements: BatchStatement[] = marks.map(({ studentId, mark }) =>
        mark
          ? {
              sql: `INSERT INTO attendance (student_id, date, status, year_id)
                    VALUES (?, ?, ?, ?)
                    ON CONFLICT(student_id, date)
                    DO UPDATE SET status = excluded.status, year_id = excluded.year_id`,
              params: [studentId, date, mark, yearId],
            }
          : {
              sql: "DELETE FROM attendance WHERE student_id = ? AND date = ?",
              params: [studentId, date],
            },
      );
      await executeBatch(statements);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["roster"] });
      qc.invalidateQueries({ queryKey: ["attendance-summary"] });
      qc.invalidateQueries({ queryKey: ["fee-summary"] });
      qc.invalidateQueries({ queryKey: ["student-ledger"] });
    },
  });
}

export function useAttendanceSummary(classId: number | "all", yearId: number | null) {
  return useQuery({
    queryKey: ["attendance-summary", classId, yearId],
    queryFn: () => {
      const classFilter = classId === "all" ? "" : `AND s.class_id = ${Number(classId)}`;
      return select<SummaryRow>(
        `SELECT s.id, s.student_code, s.full_name, cl.name AS class_name,
                COALESCE(SUM(CASE WHEN a.status = 'Present' THEN 1 END), 0) AS present,
                COALESCE(SUM(CASE WHEN a.status = 'Absent' THEN 1 END), 0) AS absent
         FROM students s
         LEFT JOIN classes cl ON cl.id = s.class_id
         LEFT JOIN attendance a
           ON a.student_id = s.id
           ${yearId != null ? "AND a.year_id = ?" : ""}
         WHERE s.status = 'Active' ${classFilter}
         GROUP BY s.id
         ORDER BY cl.sort_order, s.full_name COLLATE NOCASE`,
        yearId != null ? [yearId] : [],
      );
    },
  });
}
