import { useMemo } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { execute, select } from "@/lib/db";
import { computeGradebook } from "@/features/results/logic";
import { useGradingConfig } from "@/features/results/api";

export interface ClassStudent {
  student_id: number;
  student_code: string;
  full_name: string;
  gender: string | null;
  class_name: string | null;
}

interface RawResult {
  student_id: number;
  subject_id: number;
  ca_mark: number | null;
  exam_mark: number | null;
  teacher_remark: string | null;
}

interface AttRow {
  student_id: number;
  present: number;
  absent: number;
}

interface RemarkRow {
  student_id: number;
  general_remark: string | null;
}

/**
 * `includeAttendance` gates the attendance-by-class and remarks-by-class
 * queries. Report cards need every classmate's attendance/remark; the
 * student-detail page only needs one student's (fetched separately there) so
 * it passes `false` to skip two round-trips' worth of the whole class.
 */
export function useClassGradebook(
  classId: number | null,
  yearId: number | null,
  { includeAttendance = true }: { includeAttendance?: boolean } = {},
) {
  const enabled = classId != null && yearId != null;
  const grading = useGradingConfig();

  const students = useQuery({
    queryKey: ["class-students", classId],
    enabled: classId != null,
    queryFn: () =>
      select<ClassStudent>(
        `SELECT s.id AS student_id, s.student_code, s.full_name, s.gender, cl.name AS class_name
         FROM students s LEFT JOIN classes cl ON cl.id = s.class_id
         WHERE s.class_id = ? AND s.status = 'Active'
         ORDER BY s.full_name COLLATE NOCASE`,
        [classId],
      ),
  });

  const subjects = useQuery({
    queryKey: ["subjects"],
    queryFn: () => select<{ id: number; name: string }>("SELECT id, name FROM subjects ORDER BY sort_order, name"),
  });

  const results = useQuery({
    queryKey: ["class-gradebook", "results", classId, yearId],
    enabled,
    queryFn: () =>
      select<RawResult>(
        `SELECT r.student_id, r.subject_id, r.ca_mark, r.exam_mark, r.teacher_remark
         FROM results r JOIN students s ON s.id = r.student_id
         WHERE s.class_id = ? AND r.year_id = ?`,
        [classId, yearId],
      ),
  });

  const attendance = useQuery({
    queryKey: ["class-gradebook", "attendance", classId, yearId],
    enabled: enabled && includeAttendance,
    queryFn: () =>
      select<AttRow>(
        `SELECT s.id AS student_id,
                COALESCE(SUM(CASE WHEN a.status = 'Present' THEN 1 END), 0) AS present,
                COALESCE(SUM(CASE WHEN a.status = 'Absent' THEN 1 END), 0) AS absent
         FROM students s
         LEFT JOIN attendance a ON a.student_id = s.id AND a.year_id = ?
         WHERE s.class_id = ? AND s.status = 'Active'
         GROUP BY s.id`,
        [yearId, classId],
      ),
  });

  const remarks = useQuery({
    queryKey: ["class-gradebook", "remarks", classId, yearId],
    enabled: enabled && includeAttendance,
    queryFn: () =>
      select<RemarkRow>(
        `SELECT rc.student_id, rc.general_remark
         FROM report_card_remarks rc JOIN students s ON s.id = rc.student_id
         WHERE s.class_id = ? AND rc.year_id = ?`,
        [classId, yearId],
      ),
  });

  const gradebook = useMemo(() => {
    if (!students.data || !subjects.data || !results.data) return [];
    return computeGradebook({
      students: students.data.map((s) => ({
        student_id: s.student_id,
        student_code: s.student_code,
        full_name: s.full_name,
      })),
      subjects: subjects.data,
      results: results.data,
      classId,
      defaults: grading.defaults,
      overrides: grading.overrides,
    });
  }, [students.data, subjects.data, results.data, classId, grading.defaults, grading.overrides]);

  const attendanceMap = useMemo(() => {
    const m = new Map<number, { present: number; absent: number; pct: number | null }>();
    for (const a of attendance.data ?? []) {
      const total = a.present + a.absent;
      m.set(a.student_id, {
        present: a.present,
        absent: a.absent,
        pct: total ? Math.round((a.present / total) * 100) : null,
      });
    }
    return m;
  }, [attendance.data]);

  const remarkMap = useMemo(() => {
    const m = new Map<number, string>();
    for (const r of remarks.data ?? []) if (r.general_remark) m.set(r.student_id, r.general_remark);
    return m;
  }, [remarks.data]);

  return {
    students: students.data ?? [],
    subjects: subjects.data ?? [],
    gradebook,
    attendanceMap,
    remarkMap,
    isLoading:
      grading.isLoading ||
      students.isLoading ||
      subjects.isLoading ||
      (enabled &&
        (results.isLoading || (includeAttendance && (attendance.isLoading || remarks.isLoading)))),
  };
}

export function useSaveGeneralRemark() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      studentId,
      yearId,
      remark,
    }: {
      studentId: number;
      yearId: number;
      remark: string | null;
    }) => {
      if (!remark) {
        return execute(
          "DELETE FROM report_card_remarks WHERE student_id = ? AND year_id = ?",
          [studentId, yearId],
        );
      }
      return execute(
        `INSERT INTO report_card_remarks (student_id, year_id, general_remark)
         VALUES (?, ?, ?)
         ON CONFLICT(student_id, year_id) DO UPDATE SET general_remark = excluded.general_remark`,
        [studentId, yearId, remark],
      );
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["class-gradebook", "remarks"] }),
  });
}
