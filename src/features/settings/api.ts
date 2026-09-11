import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { execute, select, selectOne } from "@/lib/db";

// ── types ──────────────────────────────────────────────────────────────────

export interface Settings {
  id: number;
  school_name: string;
  system_name: string;
  country: string;
  currency: string;
  weekend_rate: number;
  vacation_rate: number;
  default_ca_weight: number;
  default_exam_weight: number;
  exam_fee: number;
  updated_at: string;
}

export interface AcademicYear {
  id: number;
  gregorian_label: string;
  hijri_label: string;
  start_date: string | null;
  end_date: string | null;
  is_current: number;
}

export interface CalendarPeriod {
  id: number;
  year_id: number;
  start_date: string;
  end_date: string;
  type: "term" | "vacation";
  note: string | null;
}

export interface NamedRow {
  id: number;
  name: string;
  sort_order: number;
}

export interface WeightOverride {
  id: number;
  scope: "class" | "subject";
  ref_id: number;
  ca_weight: number;
  exam_weight: number;
}

export type ListTable = "classes" | "subjects";
const LIST_TABLES: ListTable[] = ["classes", "subjects"];
function assertTable(t: ListTable) {
  if (!LIST_TABLES.includes(t)) throw new Error(`Unknown table: ${t}`);
}

// ── settings ───────────────────────────────────────────────────────────────

export function useSettings() {
  return useQuery({
    queryKey: ["settings"],
    queryFn: () => selectOne<Settings>("SELECT * FROM settings WHERE id = 1"),
  });
}

export function useUpdateSettings() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (patch: Partial<Settings>) => {
      const fields = Object.keys(patch);
      if (!fields.length) return;
      const setSql = fields.map((f) => `${f} = ?`).join(", ");
      const values = fields.map((f) => (patch as Record<string, unknown>)[f]);
      await execute(
        `UPDATE settings SET ${setSql}, updated_at = datetime('now') WHERE id = 1`,
        values,
      );
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["settings"] }),
  });
}

// ── academic years ─────────────────────────────────────────────────────────

export function useAcademicYears() {
  return useQuery({
    queryKey: ["academic_years"],
    queryFn: () =>
      select<AcademicYear>(
        "SELECT * FROM academic_years ORDER BY is_current DESC, gregorian_label DESC",
      ),
  });
}

export function useCurrentYear() {
  return useQuery({
    queryKey: ["academic_years", "current"],
    queryFn: () =>
      selectOne<AcademicYear>(
        "SELECT * FROM academic_years WHERE is_current = 1 LIMIT 1",
      ),
  });
}

/** The current academic year's id, or null if none is set. */
export async function currentYearId(): Promise<number | null> {
  const row = await selectOne<{ id: number }>(
    "SELECT id FROM academic_years WHERE is_current = 1 LIMIT 1",
  );
  return row?.id ?? null;
}

export function useAddYear() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (y: {
      gregorian_label: string;
      hijri_label: string;
      start_date: string | null;
      end_date: string | null;
      make_current: boolean;
    }) => {
      const existing = await select<{ c: number }>(
        "SELECT COUNT(*) AS c FROM academic_years",
      );
      const first = (existing[0]?.c ?? 0) === 0;
      const makeCurrent = y.make_current || first;
      if (makeCurrent) {
        await execute("UPDATE academic_years SET is_current = 0");
      }
      await execute(
        `INSERT INTO academic_years (gregorian_label, hijri_label, start_date, end_date, is_current)
         VALUES (?, ?, ?, ?, ?)`,
        [y.gregorian_label, y.hijri_label, y.start_date, y.end_date, makeCurrent ? 1 : 0],
      );
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["academic_years"] }),
  });
}

export function useSetCurrentYear() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: number) => {
      await execute("UPDATE academic_years SET is_current = 0");
      await execute("UPDATE academic_years SET is_current = 1 WHERE id = ?", [id]);
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["academic_years"] }),
  });
}

export function useUpdateYear() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (y: Pick<AcademicYear, "id" | "gregorian_label" | "hijri_label" | "start_date" | "end_date">) => {
      await execute(
        `UPDATE academic_years SET gregorian_label = ?, hijri_label = ?, start_date = ?, end_date = ? WHERE id = ?`,
        [y.gregorian_label, y.hijri_label, y.start_date, y.end_date, y.id],
      );
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["academic_years"] }),
  });
}

export function useDeleteYear() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: number) =>
      execute("DELETE FROM academic_years WHERE id = ?", [id]),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["academic_years"] });
      qc.invalidateQueries({ queryKey: ["calendar"] });
    },
  });
}

// ── academic calendar ──────────────────────────────────────────────────────

export function useCalendar(yearId: number | undefined) {
  return useQuery({
    queryKey: ["calendar", yearId],
    enabled: yearId != null,
    queryFn: () =>
      select<CalendarPeriod>(
        "SELECT * FROM academic_calendar WHERE year_id = ? ORDER BY start_date",
        [yearId],
      ),
  });
}

export function useAddCalendarPeriod() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (p: Omit<CalendarPeriod, "id">) =>
      execute(
        `INSERT INTO academic_calendar (year_id, start_date, end_date, type, note)
         VALUES (?, ?, ?, ?, ?)`,
        [p.year_id, p.start_date, p.end_date, p.type, p.note],
      ),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["calendar"] }),
  });
}

export function useDeleteCalendarPeriod() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: number) =>
      execute("DELETE FROM academic_calendar WHERE id = ?", [id]),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["calendar"] }),
  });
}

// ── classes & subjects (generic list editor) ───────────────────────────────

export function useNamedList(table: ListTable) {
  return useQuery({
    queryKey: [table],
    queryFn: () => {
      assertTable(table);
      return select<NamedRow>(
        `SELECT * FROM ${table} ORDER BY sort_order, name`,
      );
    },
  });
}

export function useAddNamed(table: ListTable) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (name: string) => {
      assertTable(table);
      const max = await select<{ m: number | null }>(
        `SELECT MAX(sort_order) AS m FROM ${table}`,
      );
      const next = (max[0]?.m ?? 0) + 1;
      await execute(`INSERT INTO ${table} (name, sort_order) VALUES (?, ?)`, [
        name,
        next,
      ]);
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: [table] }),
  });
}

export function useRenameNamed(table: ListTable) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, name }: { id: number; name: string }) => {
      assertTable(table);
      return execute(`UPDATE ${table} SET name = ? WHERE id = ?`, [name, id]);
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: [table] }),
  });
}

export function useReorderNamed(table: ListTable) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ a, b }: { a: NamedRow; b: NamedRow }) => {
      assertTable(table);
      await execute(`UPDATE ${table} SET sort_order = ? WHERE id = ?`, [
        b.sort_order,
        a.id,
      ]);
      await execute(`UPDATE ${table} SET sort_order = ? WHERE id = ?`, [
        a.sort_order,
        b.id,
      ]);
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: [table] }),
  });
}

export function useDeleteNamed(table: ListTable) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => {
      assertTable(table);
      return execute(`DELETE FROM ${table} WHERE id = ?`, [id]);
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: [table] }),
  });
}

// ── grading weight overrides (per class / per subject) ──────────────────────

export function useWeightOverrides() {
  return useQuery({
    queryKey: ["weight_overrides"],
    queryFn: () => select<WeightOverride>("SELECT * FROM weight_overrides"),
  });
}

export function useUpsertWeightOverride() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (o: Omit<WeightOverride, "id">) =>
      execute(
        `INSERT INTO weight_overrides (scope, ref_id, ca_weight, exam_weight)
         VALUES (?, ?, ?, ?)
         ON CONFLICT(scope, ref_id) DO UPDATE SET
           ca_weight = excluded.ca_weight, exam_weight = excluded.exam_weight`,
        [o.scope, o.ref_id, o.ca_weight, o.exam_weight],
      ),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["weight_overrides"] }),
  });
}

export function useDeleteWeightOverride() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => execute("DELETE FROM weight_overrides WHERE id = ?", [id]),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["weight_overrides"] }),
  });
}
