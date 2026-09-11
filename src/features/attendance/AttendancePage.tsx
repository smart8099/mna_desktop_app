import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { CalendarCheck, Check, CheckCheck, X } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Input, Select } from "@/components/ui/Input";
import { SearchInput } from "@/components/ui/SearchInput";
import { Field } from "@/components/ui/Field";
import { Badge } from "@/components/ui/Badge";
import { Pagination } from "@/components/ui/Pagination";
import { LoadingBlock, ErrorBlock, EmptyRow } from "@/components/ui/State";
import { cn } from "@/lib/cn";
import { todayISO } from "@/lib/format";
import { useDebounce } from "@/lib/useDebounce";
import { usePagination } from "@/lib/usePagination";
import { useCurrentYear, useNamedList } from "@/features/settings/api";
import {
  useAttendanceSummary,
  useRoster,
  useSaveAttendance,
  type Mark,
} from "./api";

export function AttendancePage() {
  const [tab, setTab] = useState<"register" | "summary">("register");
  const { data: classes = [] } = useNamedList("classes");
  const [classId, setClassId] = useState<number | "all">("all");

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-xl font-semibold text-text">Attendance</h2>
        <p className="mt-1 text-sm text-text-muted">
          Daily Present / Absent register. Present days on weekends and vacation Mon–Wed drive tuition.
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <Field label="Class" className="w-48">
          <Select
            value={classId}
            onChange={(e) => setClassId(e.target.value === "all" ? "all" : Number(e.target.value))}
          >
            <option value="all">All classes</option>
            {classes.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </Select>
        </Field>
        <div className="ml-auto flex gap-1 self-end rounded-lg border border-border p-1">
          {(["register", "summary"] as const).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={cn(
                "rounded-md px-3 py-1.5 text-sm font-medium capitalize transition-colors",
                tab === t ? "bg-accent-soft text-primary" : "text-text-muted hover:text-text",
              )}
            >
              {t}
            </button>
          ))}
        </div>
      </div>

      {classes.length === 0 ? (
        <EmptyRow>Add a class in Settings first.</EmptyRow>
      ) : tab === "register" ? (
        <RegisterTab classId={classId} />
      ) : (
        <SummaryTab classId={classId} />
      )}
    </div>
  );
}

function RegisterTab({ classId }: { classId: number | "all" }) {
  const [date, setDate] = useState(todayISO());
  const { data: roster, isLoading, error } = useRoster(classId, date);
  const save = useSaveAttendance();

  const [marks, setMarks] = useState<Record<number, Mark | null>>({});
  const [dirty, setDirty] = useState(false);
  const [q, setQ] = useState("");
  const debouncedQ = useDebounce(q, 200);

  useEffect(() => {
    if (roster) {
      setMarks(Object.fromEntries(roster.map((r) => [r.id, r.mark])));
      setDirty(false);
    }
  }, [roster]);

  const filtered = useMemo(() => {
    const needle = debouncedQ.trim().toLowerCase();
    if (!needle) return roster ?? [];
    return (roster ?? []).filter((r) =>
      `${r.full_name} ${r.student_code}`.toLowerCase().includes(needle),
    );
  }, [roster, debouncedQ]);

  const { page, setPage, pageSize, setPageSize, pageItems } = usePagination(filtered, {
    pageSize: 50,
    storageKey: "mna.attendance.pageSize",
    resetKey: `${debouncedQ}|${classId}|${date}`,
  });

  const counts = useMemo(() => {
    const values = Object.values(marks);
    return {
      present: values.filter((m) => m === "Present").length,
      absent: values.filter((m) => m === "Absent").length,
      unmarked: values.filter((m) => m == null).length,
    };
  }, [marks]);

  function setMark(id: number, next: Mark) {
    setMarks((m) => ({ ...m, [id]: m[id] === next ? null : next }));
    setDirty(true);
  }
  function markAll(next: Mark) {
    setMarks((m) => {
      const copy = { ...m };
      for (const id of Object.keys(copy)) copy[Number(id)] = next;
      return copy;
    });
    setDirty(true);
  }

  async function persist() {
    try {
      await save.mutateAsync({
        date,
        marks: Object.entries(marks).map(([id, mark]) => ({ studentId: Number(id), mark })),
      });
      setDirty(false);
      toast.success(`Attendance saved for ${date}.`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not save attendance.");
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end gap-3">
        <Field label="Date" className="w-44">
          <Input type="date" value={date} max={todayISO()} onChange={(e) => setDate(e.target.value)} />
        </Field>
        <SearchInput value={q} onChange={setQ} placeholder="Search student…" className="min-w-48" />
        <Button variant="outline" size="sm" className="self-end" onClick={() => markAll("Present")}>
          <CheckCheck className="h-4 w-4" />
          All present
        </Button>
      </div>

      <div className="flex items-center gap-2 text-xs text-text-muted">
        <Badge tone="green">{counts.present} present</Badge>
        <Badge tone="red">{counts.absent} absent</Badge>
        {counts.unmarked > 0 && <Badge tone="muted">{counts.unmarked} unmarked</Badge>}
      </div>

      {isLoading ? (
        <LoadingBlock />
      ) : error ? (
        <ErrorBlock error={error} />
      ) : !roster?.length ? (
        <div className="rounded-xl border border-border bg-surface px-6 py-16 text-center">
          <CalendarCheck className="mx-auto h-8 w-8 text-text-muted" />
          <p className="mt-3 text-sm text-text-muted">No active students in this class.</p>
        </div>
      ) : (
        <>
          <ul className="divide-y divide-border overflow-hidden rounded-xl border border-border">
            {pageItems.length === 0 && (
              <li className="px-4 py-8 text-center text-sm text-text-muted">
                No students match “{debouncedQ}”.
              </li>
            )}
            {pageItems.map((r) => {
              const mark = marks[r.id] ?? null;
              return (
                <li key={r.id} className="flex items-center gap-3 px-4 py-2.5">
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-medium text-text">{r.full_name}</div>
                    <div className="text-xs text-text-muted">
                      {r.student_code}
                      {r.class_name ? ` · ${r.class_name}` : ""}
                    </div>
                  </div>
                  <div className="flex gap-1.5">
                    <button
                      onClick={() => setMark(r.id, "Present")}
                      className={cn(
                        "inline-flex h-8 items-center gap-1 rounded-lg border px-3 text-sm font-medium transition-colors",
                        mark === "Present"
                          ? "border-primary bg-accent-soft text-primary"
                          : "border-border text-text-muted hover:bg-surface-muted",
                      )}
                    >
                      <Check className="h-4 w-4" />
                      Present
                    </button>
                    <button
                      onClick={() => setMark(r.id, "Absent")}
                      className={cn(
                        "inline-flex h-8 items-center gap-1 rounded-lg border px-3 text-sm font-medium transition-colors",
                        mark === "Absent"
                          ? "border-danger bg-danger-soft text-danger"
                          : "border-border text-text-muted hover:bg-surface-muted",
                      )}
                    >
                      <X className="h-4 w-4" />
                      Absent
                    </button>
                  </div>
                </li>
              );
            })}
          </ul>

          <Pagination
            page={page}
            pageSize={pageSize}
            total={filtered.length}
            onPageChange={setPage}
            onPageSizeChange={setPageSize}
          />

          <div className="flex items-center justify-end gap-3">
            {dirty && <span className="text-xs text-text-muted">Unsaved changes</span>}
            <Button onClick={persist} loading={save.isPending} disabled={!dirty}>
              Save attendance
            </Button>
          </div>
        </>
      )}
    </div>
  );
}

function SummaryTab({ classId }: { classId: number | "all" }) {
  const { data: year } = useCurrentYear();
  const { data: rows, isLoading, error } = useAttendanceSummary(classId, year?.id ?? null);
  const [q, setQ] = useState("");
  const debouncedQ = useDebounce(q, 200);

  const filtered = useMemo(() => {
    const needle = debouncedQ.trim().toLowerCase();
    if (!needle) return rows ?? [];
    return (rows ?? []).filter((r) =>
      `${r.full_name} ${r.student_code}`.toLowerCase().includes(needle),
    );
  }, [rows, debouncedQ]);

  const { page, setPage, pageSize, setPageSize, pageItems } = usePagination(filtered, {
    storageKey: "mna.attendance.summary.pageSize",
    resetKey: `${debouncedQ}|${classId}`,
  });

  if (isLoading) return <LoadingBlock />;
  if (error) return <ErrorBlock error={error} />;

  return (
    <div className="space-y-3">
      <p className="text-xs text-text-muted">
        {year ? `Academic year ${year.hijri_label} AH · ${year.gregorian_label}` : "All records (no current academic year set)"}
      </p>
      <SearchInput value={q} onChange={setQ} placeholder="Search student…" />
      <div className="overflow-hidden rounded-xl border border-border">
        <table className="w-full text-sm">
          <thead className="border-b border-border bg-surface-muted text-left text-xs text-text-muted">
            <tr>
              <th className="px-4 py-2.5 font-medium">Student</th>
              <th className="px-4 py-2.5 font-medium">Class</th>
              <th className="px-4 py-2.5 font-medium">Present</th>
              <th className="px-4 py-2.5 font-medium">Absent</th>
              <th className="px-4 py-2.5 font-medium">Attendance %</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {!filtered.length ? (
              <tr>
                <td colSpan={5}>
                  <EmptyRow>
                    {rows?.length ? `No students match “${debouncedQ}”.` : "No active students."}
                  </EmptyRow>
                </td>
              </tr>
            ) : (
              pageItems.map((r) => {
                const total = r.present + r.absent;
                const pct = total ? Math.round((r.present / total) * 100) : null;
                return (
                  <tr key={r.id}>
                    <td className="px-4 py-2.5">
                      <div className="font-medium text-text">{r.full_name}</div>
                      <div className="text-xs text-text-muted">{r.student_code}</div>
                    </td>
                    <td className="px-4 py-2.5 text-text-muted">{r.class_name ?? "—"}</td>
                    <td className="px-4 py-2.5 tabular-nums text-text-muted">{r.present}</td>
                    <td className="px-4 py-2.5 tabular-nums text-text-muted">{r.absent}</td>
                    <td className="px-4 py-2.5">
                      {pct == null ? (
                        <span className="text-text-muted">—</span>
                      ) : (
                        <Badge tone={pct >= 80 ? "green" : pct >= 50 ? "amber" : "red"}>{pct}%</Badge>
                      )}
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
        {filtered.length > 0 && (
          <div className="border-t border-border px-4 py-2.5">
            <Pagination
              page={page}
              pageSize={pageSize}
              total={filtered.length}
              onPageChange={setPage}
              onPageSizeChange={setPageSize}
            />
          </div>
        )}
      </div>
    </div>
  );
}
