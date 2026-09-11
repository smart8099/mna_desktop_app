import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { executeBatch, select, type BatchStatement } from "@/lib/db";
import { useSettings, useWeightOverrides } from "@/features/settings/api";
import type { Weights } from "./logic";

export interface ClassResultRow {
  student_id: number;
  student_code: string;
  full_name: string;
  ca_mark: number | null;
  exam_mark: number | null;
  teacher_remark: string | null;
}

/** Global default weights + all overrides, for `resolveWeights`. */
export function useGradingConfig() {
  const settings = useSettings();
  const overrides = useWeightOverrides();
  const defaults: Weights = {
    ca: Number(settings.data?.default_ca_weight ?? 0.3),
    exam: Number(settings.data?.default_exam_weight ?? 0.7),
  };
  return {
    defaults,
    overrides: overrides.data ?? [],
    isLoading: settings.isLoading || overrides.isLoading,
  };
}

export function useClassResults(
  classId: number | null,
  subjectId: number | null,
  yearId: number | null,
) {
  return useQuery({
    queryKey: ["class-results", classId, subjectId, yearId],
    enabled: classId != null && subjectId != null && yearId != null,
    queryFn: () =>
      select<ClassResultRow>(
        `SELECT s.id AS student_id, s.student_code, s.full_name,
                r.ca_mark, r.exam_mark, r.teacher_remark
         FROM students s
         LEFT JOIN results r
           ON r.student_id = s.id AND r.subject_id = ? AND r.year_id = ?
         WHERE s.class_id = ? AND s.status = 'Active'
         ORDER BY s.full_name COLLATE NOCASE`,
        [subjectId, yearId, classId],
      ),
  });
}

export interface ResultEdit {
  studentId: number;
  ca: number | null;
  exam: number | null;
  remark: string | null;
}

export function useSaveResults() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      subjectId,
      yearId,
      edits,
    }: {
      subjectId: number;
      yearId: number;
      edits: ResultEdit[];
    }) => {
      const statements: BatchStatement[] = edits.map((e) => {
        const empty = e.ca == null && e.exam == null && !e.remark;
        return empty
          ? {
              sql: "DELETE FROM results WHERE student_id = ? AND subject_id = ? AND year_id = ?",
              params: [e.studentId, subjectId, yearId],
            }
          : {
              sql: `INSERT INTO results (student_id, year_id, subject_id, ca_mark, exam_mark, teacher_remark)
                    VALUES (?, ?, ?, ?, ?, ?)
                    ON CONFLICT(student_id, year_id, subject_id) DO UPDATE SET
                      ca_mark = excluded.ca_mark,
                      exam_mark = excluded.exam_mark,
                      teacher_remark = excluded.teacher_remark`,
              params: [e.studentId, yearId, subjectId, e.ca, e.exam, e.remark],
            };
      });
      await executeBatch(statements);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["class-results"] });
      qc.invalidateQueries({ queryKey: ["class-gradebook"] });
      qc.invalidateQueries({ queryKey: ["report-card"] });
    },
  });
}
