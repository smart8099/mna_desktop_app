import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { ClipboardList } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Field } from "@/components/ui/Field";
import { Input, Select } from "@/components/ui/Input";
import { SearchInput } from "@/components/ui/SearchInput";
import { Badge } from "@/components/ui/Badge";
import { Pagination } from "@/components/ui/Pagination";
import { LoadingBlock, ErrorBlock, EmptyRow } from "@/components/ui/State";
import { useDebounce } from "@/lib/useDebounce";
import { usePagination } from "@/lib/usePagination";
import { weightToPct } from "@/lib/format";
import { useCurrentYear, useNamedList, useSubjectsForClass } from "@/features/settings/api";
import {
  clampMark,
  gradeFor,
  rankByTotal,
  resolveWeights,
  weightedTotal,
} from "./logic";
import { useClassResults, useGradingConfig, useSaveResults, type ResultEdit } from "./api";

interface Draft {
  ca: string;
  exam: string;
  remark: string;
}

export function ResultsPage() {
  const { data: year } = useCurrentYear();
  const { data: classes = [] } = useNamedList("classes");
  const grading = useGradingConfig();
  const save = useSaveResults();

  const [classId, setClassId] = useState<number | null>(null);
  const [subjectId, setSubjectId] = useState<number | null>(null);
  const [q, setQ] = useState("");
  const debouncedQ = useDebounce(q, 200);
  const [drafts, setDrafts] = useState<Record<number, Draft>>({});
  const [dirty, setDirty] = useState(false);

  const { data: subjects = [] } = useSubjectsForClass(classId);

  useEffect(() => {
    if (classId == null && classes.length) setClassId(classes[0].id);
  }, [classes, classId]);
  // Re-pick a subject whenever the class changes and the current one no
  // longer applies to it (including the very first load); clear it entirely
  // if this class has no subjects assigned at all.
  useEffect(() => {
    if (!subjects.length) {
      if (subjectId != null) setSubjectId(null);
      return;
    }
    if (subjectId == null || !subjects.some((s) => s.id === subjectId)) {
      setSubjectId(subjects[0].id);
    }
  }, [subjects, subjectId]);

  const { data: rows, isLoading, error } = useClassResults(classId, subjectId, year?.id ?? null);

  useEffect(() => {
    if (rows) {
      setDrafts(
        Object.fromEntries(
          rows.map((r) => [
            r.student_id,
            {
              ca: r.ca_mark == null ? "" : String(r.ca_mark),
              exam: r.exam_mark == null ? "" : String(r.exam_mark),
              remark: r.teacher_remark ?? "",
            },
          ]),
        ),
      );
      setDirty(false);
    }
  }, [rows]);

  const weights = resolveWeights(classId, subjectId, grading.defaults, grading.overrides);

  const computed = useMemo(() => {
    const base = (rows ?? []).map((r) => {
      const d = drafts[r.student_id] ?? { ca: "", exam: "", remark: "" };
      const ca = clampMark(d.ca);
      const exam = clampMark(d.exam);
      return {
        ...r,
        ca,
        exam,
        remark: d.remark,
        total: weightedTotal(ca, exam, weights),
      };
    });
    return rankByTotal(base);
  }, [rows, drafts, weights]);

  const filtered = useMemo(() => {
    const needle = debouncedQ.trim().toLowerCase();
    if (!needle) return computed;
    return computed.filter((r) =>
      `${r.full_name} ${r.student_code}`.toLowerCase().includes(needle),
    );
  }, [computed, debouncedQ]);

  const { page, setPage, pageSize, setPageSize, pageItems } = usePagination(filtered, {
    pageSize: 50,
    storageKey: "mna.results.pageSize",
    resetKey: `${debouncedQ}|${classId}|${subjectId}`,
  });

  const entered = computed.filter((r) => r.total != null).length;

  function setDraft(id: number, patch: Partial<Draft>) {
    setDrafts((d) => ({ ...d, [id]: { ...(d[id] ?? { ca: "", exam: "", remark: "" }), ...patch } }));
    setDirty(true);
  }

  async function persist() {
    if (!subjectId || !year) return;
    const edits: ResultEdit[] = computed.map((r) => ({
      studentId: r.student_id,
      ca: r.ca,
      exam: r.exam,
      remark: r.remark.trim() || null,
    }));
    try {
      await save.mutateAsync({ subjectId, yearId: year.id, edits });
      setDirty(false);
      toast.success("Results saved.");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not save results.");
    }
  }

  if (!year) {
    return (
      <div className="rounded-xl border border-border bg-surface px-6 py-16 text-center">
        <ClipboardList className="mx-auto h-8 w-8 text-text-muted" />
        <p className="mt-3 text-sm text-text-muted">
          Set a current academic year in Settings to enter results.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-xl font-semibold text-text">Results entry</h2>
        <p className="mt-1 text-sm text-text-muted">
          {year.hijri_label} AH · CA {weightToPct(weights.ca)}% + Exam {weightToPct(weights.exam)}%.
          Grade bands: A ≥ 80 · B ≥ 70 · C ≥ 60 · D ≥ 50 · else F.
        </p>
      </div>

      <div className="flex flex-wrap items-end gap-3">
        <Field label="Class" className="w-44">
          <Select
            value={classId ?? ""}
            onChange={(e) => setClassId(e.target.value ? Number(e.target.value) : null)}
          >
            {classes.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Subject" className="w-48">
          <Select
            value={subjectId ?? ""}
            disabled={!subjects.length}
            onChange={(e) => setSubjectId(e.target.value ? Number(e.target.value) : null)}
          >
            {subjects.length === 0 && <option value="">No subjects</option>}
            {subjects.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </Select>
        </Field>
        <SearchInput value={q} onChange={setQ} placeholder="Search student…" />
        <Badge tone="muted" className="self-end">
          {entered}/{computed.length} entered
        </Badge>
      </div>

      {isLoading || grading.isLoading ? (
        <LoadingBlock />
      ) : error ? (
        <ErrorBlock error={error} />
      ) : !subjects.length ? (
        <EmptyRow>
          No subjects apply to this class yet — add some in Settings → Subjects.
        </EmptyRow>
      ) : !computed.length ? (
        <EmptyRow>No active students in this class.</EmptyRow>
      ) : (
        <>
          <div className="overflow-x-auto rounded-xl border border-border">
            <table className="w-full min-w-[720px] text-sm">
              <thead className="border-b border-border bg-surface-muted text-left text-xs text-text-muted">
                <tr>
                  <th className="px-3 py-2.5 font-medium">Student</th>
                  <th className="w-24 px-3 py-2.5 font-medium">CA /100</th>
                  <th className="w-24 px-3 py-2.5 font-medium">Exam /100</th>
                  <th className="w-20 px-3 py-2.5 text-right font-medium">Total</th>
                  <th className="w-16 px-3 py-2.5 font-medium">Grade</th>
                  <th className="w-14 px-3 py-2.5 font-medium">Pos.</th>
                  <th className="px-3 py-2.5 font-medium">Teacher remark</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {pageItems.length === 0 && (
                  <tr>
                    <td colSpan={7} className="px-3 py-8 text-center text-sm text-text-muted">
                      No students match “{debouncedQ}”.
                    </td>
                  </tr>
                )}
                {pageItems.map((r) => (
                  <tr key={r.student_id}>
                    <td className="px-3 py-2">
                      <div className="font-medium text-text">{r.full_name}</div>
                      <div className="text-xs text-text-muted">{r.student_code}</div>
                    </td>
                    <td className="px-3 py-2">
                      <Input
                        inputMode="decimal"
                        className="h-9"
                        value={drafts[r.student_id]?.ca ?? ""}
                        onChange={(e) => setDraft(r.student_id, { ca: e.target.value })}
                      />
                    </td>
                    <td className="px-3 py-2">
                      <Input
                        inputMode="decimal"
                        className="h-9"
                        value={drafts[r.student_id]?.exam ?? ""}
                        onChange={(e) => setDraft(r.student_id, { exam: e.target.value })}
                      />
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums font-medium text-text">
                      {r.total == null ? "—" : r.total}
                    </td>
                    <td className="px-3 py-2">
                      <span className="font-semibold text-text">{gradeFor(r.total)}</span>
                    </td>
                    <td className="px-3 py-2 tabular-nums text-text-muted">{r.position ?? "—"}</td>
                    <td className="px-3 py-2">
                      <Input
                        className="h-9"
                        placeholder="Optional"
                        value={drafts[r.student_id]?.remark ?? ""}
                        onChange={(e) => setDraft(r.student_id, { remark: e.target.value })}
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div className="border-t border-border px-3 py-2.5">
              <Pagination
                page={page}
                pageSize={pageSize}
                total={filtered.length}
                onPageChange={setPage}
                onPageSizeChange={setPageSize}
              />
            </div>
          </div>

          <div className="flex items-center justify-end gap-3">
            {dirty && <span className="text-xs text-text-muted">Unsaved changes</span>}
            <Button onClick={persist} loading={save.isPending} disabled={!dirty}>
              Save results
            </Button>
          </div>
        </>
      )}
    </div>
  );
}
