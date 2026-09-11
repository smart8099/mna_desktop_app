import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { execute, select, selectOne } from "@/lib/db";
import { normalizeGhanaPhone } from "@/lib/phone";
import { nextCode, TEACHER_CODE_WIDTH, TEACHER_PREFIX } from "@/features/students/logic";

export const TEACHER_STATUSES = ["Active", "Inactive"] as const;

export interface Teacher {
  id: number;
  teacher_code: string;
  name: string;
  contact: string | null;
  status: string;
  date_joined: string | null;
  notes: string | null;
}

export type TeacherInput = Omit<Teacher, "id" | "teacher_code">;

export interface Assignment {
  id: number;
  teacher_id: number;
  class_id: number;
  subject_id: number;
  class_name: string;
  subject_name: string;
}

export function useTeachers() {
  return useQuery({
    queryKey: ["teachers"],
    queryFn: () =>
      select<Teacher>("SELECT * FROM teachers ORDER BY name COLLATE NOCASE"),
  });
}

export function useTeacher(id: number | null) {
  return useQuery({
    queryKey: ["teacher", id],
    enabled: id != null,
    queryFn: () => selectOne<Teacher>("SELECT * FROM teachers WHERE id = ?", [id]),
  });
}

export interface TeacherClassLoad {
  class_id: number;
  class_name: string;
  subjects: string;
  students: number;
}

export function useTeacherClassLoad(id: number | null) {
  return useQuery({
    queryKey: ["teacher-class-load", id],
    enabled: id != null,
    queryFn: () =>
      select<TeacherClassLoad>(
        `SELECT c.id AS class_id, c.name AS class_name,
                GROUP_CONCAT(DISTINCT sub.name) AS subjects,
                (SELECT COUNT(*) FROM students s WHERE s.class_id = c.id AND s.status = 'Active') AS students
         FROM teacher_assignments ta
         JOIN classes c ON c.id = ta.class_id
         JOIN subjects sub ON sub.id = ta.subject_id
         WHERE ta.teacher_id = ?
         GROUP BY c.id
         ORDER BY c.sort_order`,
        [id],
      ),
  });
}

export function useAllAssignments() {
  return useQuery({
    queryKey: ["teacher_assignments"],
    queryFn: () =>
      select<Assignment>(`
        SELECT ta.id, ta.teacher_id, ta.class_id, ta.subject_id,
               c.name AS class_name, s.name AS subject_name
        FROM teacher_assignments ta
        JOIN classes c ON c.id = ta.class_id
        JOIN subjects s ON s.id = ta.subject_id
        ORDER BY c.sort_order, s.sort_order`),
  });
}

async function allTeacherCodes(): Promise<string[]> {
  const rows = await select<{ teacher_code: string }>("SELECT teacher_code FROM teachers");
  return rows.map((r) => r.teacher_code);
}

export function useCreateTeacher() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: TeacherInput) => {
      const code = nextCode(await allTeacherCodes(), TEACHER_PREFIX, TEACHER_CODE_WIDTH);
      const res = await execute(
        `INSERT INTO teachers (teacher_code, name, contact, status, date_joined, notes)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [
          code,
          input.name,
          normalizeGhanaPhone(input.contact),
          input.status,
          input.date_joined,
          input.notes,
        ],
      );
      return { id: Number(res.lastInsertId), code };
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["teachers"] }),
  });
}

export function useUpdateTeacher() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, input }: { id: number; input: TeacherInput }) =>
      execute(
        `UPDATE teachers SET name = ?, contact = ?, status = ?, date_joined = ?, notes = ? WHERE id = ?`,
        [
          input.name,
          normalizeGhanaPhone(input.contact),
          input.status,
          input.date_joined,
          input.notes,
          id,
        ],
      ),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["teachers"] }),
  });
}

export function useDeleteTeacher() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => execute("DELETE FROM teachers WHERE id = ?", [id]),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["teachers"] });
      qc.invalidateQueries({ queryKey: ["teacher_assignments"] });
    },
  });
}

export function useAddAssignment() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (a: { teacher_id: number; class_id: number; subject_id: number }) => {
      const yr = await select<{ id: number }>(
        "SELECT id FROM academic_years WHERE is_current = 1 LIMIT 1",
      );
      // Guard here too: the UNIQUE index doesn't catch duplicates when year_id is NULL.
      const existing = await select<{ n: number }>(
        `SELECT COUNT(*) AS n FROM teacher_assignments
         WHERE teacher_id = ? AND class_id = ? AND subject_id = ?`,
        [a.teacher_id, a.class_id, a.subject_id],
      );
      if ((existing[0]?.n ?? 0) > 0) {
        throw new Error("That class and subject is already assigned to this teacher.");
      }
      await execute(
        `INSERT INTO teacher_assignments (teacher_id, class_id, subject_id, year_id)
         VALUES (?, ?, ?, ?)`,
        [a.teacher_id, a.class_id, a.subject_id, yr[0]?.id ?? null],
      );
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["teacher_assignments"] }),
  });
}

export function useRemoveAssignment() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => execute("DELETE FROM teacher_assignments WHERE id = ?", [id]),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["teacher_assignments"] }),
  });
}
