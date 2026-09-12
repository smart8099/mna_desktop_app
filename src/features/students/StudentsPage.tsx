import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { convertFileSrc } from "@tauri-apps/api/core";
import { useIsAdmin } from "@/features/auth/AuthContext";
import { toast } from "sonner";
import {
  ArrowUpFromLine,
  Pencil,
  Plus,
  Printer,
  Trash2,
  Upload,
  UserRound,
} from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Select } from "@/components/ui/Input";
import { SearchInput } from "@/components/ui/SearchInput";
import { Dialog } from "@/components/ui/Dialog";
import { StatusBadge } from "@/components/ui/Badge";
import { Pagination } from "@/components/ui/Pagination";
import { LoadingBlock, ErrorBlock } from "@/components/ui/State";
import { useDebounce } from "@/lib/useDebounce";
import { usePagination } from "@/lib/usePagination";
import { useNamedList } from "@/features/settings/api";
import { useDeleteStudent, usePromoteStudents, useStudents } from "./api";
import { filterStudents, initials, promotionTarget, suggestedAdmissionNo } from "./logic";
import { STUDENT_STATUSES, type StudentRow } from "./types";
import { StudentFormDrawer } from "./StudentFormDrawer";
import { ImportDrawer } from "./ImportDrawer";
import { PrintRegisterDialog } from "./PrintRegisterDialog";

function Avatar({ row }: { row: StudentRow }) {
  return (
    <div className="grid h-9 w-9 shrink-0 place-items-center overflow-hidden rounded-full border border-border bg-surface-muted text-xs font-semibold text-text-muted">
      {row.photo_path ? (
        <img src={convertFileSrc(row.photo_path)} alt="" className="h-full w-full object-cover" />
      ) : (
        initials(row.full_name)
      )}
    </div>
  );
}

export function StudentsPage() {
  const isAdmin = useIsAdmin();
  const { data: rows, isLoading, error } = useStudents();
  const { data: classes = [] } = useNamedList("classes");
  const promote = usePromoteStudents();
  const del = useDeleteStudent();

  const [q, setQ] = useState("");
  const [classId, setClassId] = useState<number | "all">("all");
  const [status, setStatus] = useState<string>("all");
  const debouncedQ = useDebounce(q, 200);

  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [drawer, setDrawer] = useState<{ mode: "create" } | { mode: "edit"; row: StudentRow } | null>(
    null,
  );
  const [importOpen, setImportOpen] = useState(false);
  const [printOpen, setPrintOpen] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState<StudentRow | null>(null);
  const [confirmPromote, setConfirmPromote] = useState(false);

  const filtered = useMemo(
    () => filterStudents(rows ?? [], { q: debouncedQ, classId, status }),
    [rows, debouncedQ, classId, status],
  );

  const { page, setPage, pageSize, setPageSize, pageItems: pageRows } = usePagination(filtered, {
    storageKey: "mna.students.pageSize",
    resetKey: `${debouncedQ}|${classId}|${status}`,
  });

  const nextAdmission = useMemo(
    () => suggestedAdmissionNo((rows ?? []).map((r) => r.student_code)),
    [rows],
  );

  const selectedRows = useMemo(
    () => filtered.filter((r) => selected.has(r.id)),
    [filtered, selected],
  );

  const scopeLabel = useMemo(() => {
    const parts: string[] = [];
    parts.push(
      classId === "all" ? "All classes" : (classes.find((c) => c.id === classId)?.name ?? "Class"),
    );
    if (status !== "all") parts.push(status);
    if (debouncedQ.trim()) parts.push(`"${debouncedQ.trim()}"`);
    return parts.join(" · ");
  }, [classId, classes, status, debouncedQ]);
  const promotable = selectedRows.filter((r) => promotionTarget(r.class_id, classes)).length;

  function toggle(id: number) {
    setSelected((s) => {
      const next = new Set(s);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }
  function toggleAll() {
    setSelected((s) =>
      s.size === filtered.length ? new Set() : new Set(filtered.map((r) => r.id)),
    );
  }

  async function runPromote() {
    const res = await promote.mutateAsync({ students: selectedRows, classes });
    setConfirmPromote(false);
    setSelected(new Set());
    toast.success(
      `Promoted ${res.moved} student${res.moved === 1 ? "" : "s"}` +
        (res.skipped.length ? ` · ${res.skipped.length} already in the top class` : ""),
    );
  }

  if (isLoading) return <LoadingBlock />;
  if (error) return <ErrorBlock error={error} />;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-xl font-semibold text-text">Students</h2>
          <p className="mt-1 text-sm text-text-muted">
            {rows!.length} on the register · {filtered.length} shown
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => setPrintOpen(true)}>
            <Printer className="h-4 w-4" />
            Print register
          </Button>
          <Button variant="outline" onClick={() => setImportOpen(true)}>
            <Upload className="h-4 w-4" />
            Import
          </Button>
          <Button onClick={() => setDrawer({ mode: "create" })}>
            <Plus className="h-4 w-4" />
            Add student
          </Button>
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        <SearchInput value={q} onChange={setQ} placeholder="Search name, ID, guardian, contact…" />
        <Select
          className="w-auto"
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
        <Select className="w-auto" value={status} onChange={(e) => setStatus(e.target.value)}>
          <option value="all">All statuses</option>
          {STUDENT_STATUSES.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </Select>
      </div>

      {selected.size > 0 && (
        <div className="flex flex-wrap items-center gap-3 rounded-lg border border-border bg-surface-muted px-4 py-2.5 text-sm">
          <span className="font-medium text-text">{selected.size} selected</span>
          <Button
            size="sm"
            variant="outline"
            disabled={promotable === 0}
            onClick={() => setConfirmPromote(true)}
          >
            <ArrowUpFromLine className="h-4 w-4" />
            Promote to next class
          </Button>
          <button className="text-text-muted hover:text-text" onClick={() => setSelected(new Set())}>
            Clear
          </button>
        </div>
      )}

      {filtered.length === 0 ? (
        <div className="rounded-xl border border-border bg-surface px-6 py-16 text-center">
          <UserRound className="mx-auto h-8 w-8 text-text-muted" />
          <p className="mt-3 text-sm text-text-muted">
            {rows!.length === 0
              ? "No students yet. Add one, or import the spreadsheet."
              : "No students match these filters."}
          </p>
        </div>
      ) : (
        <>
          {/* table — medium screens and up */}
          <div className="hidden overflow-hidden rounded-xl border border-border md:block">
            <table className="w-full text-sm">
              <thead className="border-b border-border bg-surface-muted text-left text-xs text-text-muted">
                <tr>
                  <th className="w-10 px-3 py-2.5">
                    <input
                      type="checkbox"
                      className="h-4 w-4 accent-[var(--color-primary)]"
                      checked={selected.size === filtered.length && filtered.length > 0}
                      onChange={toggleAll}
                      aria-label="Select all"
                    />
                  </th>
                  <th className="px-3 py-2.5 font-medium">Student</th>
                  <th className="px-3 py-2.5 font-medium">Class</th>
                  <th className="px-3 py-2.5 font-medium">Guardian</th>
                  <th className="px-3 py-2.5 font-medium">Contact</th>
                  <th className="px-3 py-2.5 font-medium">Status</th>
                  <th className="px-3 py-2.5" />
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {pageRows.map((r) => (
                  <tr key={r.id} className="hover:bg-surface-muted/50">
                    <td className="px-3 py-2.5">
                      <input
                        type="checkbox"
                        className="h-4 w-4 accent-[var(--color-primary)]"
                        checked={selected.has(r.id)}
                        onChange={() => toggle(r.id)}
                        aria-label={`Select ${r.full_name}`}
                      />
                    </td>
                    <td className="px-3 py-2.5">
                      <div className="flex items-center gap-3">
                        <Avatar row={r} />
                        <div className="min-w-0">
                          <Link
                            to={`/students/${r.id}`}
                            className="block truncate font-medium text-text hover:text-primary hover:underline"
                          >
                            {r.full_name}
                          </Link>
                          <div className="text-xs text-text-muted">
                            {r.student_code}
                            {r.admission_no ? ` · ${r.admission_no}` : ""}
                          </div>
                        </div>
                      </div>
                    </td>
                    <td className="px-3 py-2.5 text-text-muted">{r.class_name ?? "—"}</td>
                    <td className="px-3 py-2.5 text-text-muted">{r.guardian ?? "—"}</td>
                    <td className="px-3 py-2.5 text-text-muted">{r.contact ?? "—"}</td>
                    <td className="px-3 py-2.5">
                      <StatusBadge status={r.status} />
                    </td>
                    <td className="px-3 py-2.5">
                      <div className="flex justify-end gap-1">
                        <Button
                          variant="ghost"
                          size="icon"
                          aria-label="Edit"
                          onClick={() => setDrawer({ mode: "edit", row: r })}
                        >
                          <Pencil className="h-4 w-4" />
                        </Button>
                        {isAdmin && (
                          <Button
                            variant="ghost"
                            size="icon"
                            aria-label="Delete"
                            onClick={() => setConfirmDelete(r)}
                          >
                            <Trash2 className="h-4 w-4 text-danger" />
                          </Button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* cards — small screens */}
          <div className="space-y-2 md:hidden">
            {pageRows.map((r) => (
              <div key={r.id} className="rounded-xl border border-border bg-surface p-3">
                <div className="flex items-start gap-3">
                  <input
                    type="checkbox"
                    className="mt-1 h-4 w-4 accent-[var(--color-primary)]"
                    checked={selected.has(r.id)}
                    onChange={() => toggle(r.id)}
                    aria-label={`Select ${r.full_name}`}
                  />
                  <Avatar row={r} />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between gap-2">
                      <Link
                        to={`/students/${r.id}`}
                        className="truncate font-medium text-text hover:text-primary hover:underline"
                      >
                        {r.full_name}
                      </Link>
                      <StatusBadge status={r.status} />
                    </div>
                    <div className="text-xs text-text-muted">
                      {r.student_code} · {r.class_name ?? "No class"}
                    </div>
                    {(r.guardian || r.contact) && (
                      <div className="mt-1 text-xs text-text-muted">
                        {[r.guardian, r.contact].filter(Boolean).join(" · ")}
                      </div>
                    )}
                    <div className="mt-2 flex gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setDrawer({ mode: "edit", row: r })}
                      >
                        <Pencil className="h-3.5 w-3.5" />
                        Edit
                      </Button>
                      {isAdmin && (
                        <Button variant="ghost" size="sm" onClick={() => setConfirmDelete(r)}>
                          <Trash2 className="h-3.5 w-3.5 text-danger" />
                          Delete
                        </Button>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>

          <Pagination
            page={page}
            pageSize={pageSize}
            total={filtered.length}
            onPageChange={setPage}
            onPageSizeChange={setPageSize}
          />
        </>
      )}

      <StudentFormDrawer
        open={drawer != null}
        student={drawer?.mode === "edit" ? drawer.row : null}
        classes={classes}
        suggestedAdmissionNo={nextAdmission}
        onClose={() => setDrawer(null)}
      />
      <ImportDrawer open={importOpen} onClose={() => setImportOpen(false)} />
      <PrintRegisterDialog
        open={printOpen}
        onClose={() => setPrintOpen(false)}
        rows={filtered}
        scopeLabel={scopeLabel}
      />

      <Dialog
        open={confirmDelete != null}
        onClose={() => setConfirmDelete(null)}
        title="Delete student?"
        description={
          confirmDelete
            ? `${confirmDelete.full_name} (${confirmDelete.student_code}) and all their attendance, fees and results will be permanently removed.`
            : ""
        }
        footer={
          <>
            <Button variant="outline" onClick={() => setConfirmDelete(null)}>
              Cancel
            </Button>
            <Button
              variant="danger"
              loading={del.isPending}
              onClick={async () => {
                if (!confirmDelete) return;
                try {
                  await del.mutateAsync(confirmDelete);
                  toast.success("Student deleted.");
                  setConfirmDelete(null);
                } catch (e) {
                  toast.error(e instanceof Error ? e.message : "Could not delete.");
                }
              }}
            >
              Delete
            </Button>
          </>
        }
      />

      <Dialog
        open={confirmPromote}
        onClose={() => setConfirmPromote(false)}
        title="Promote selected students?"
        description={`${promotable} of ${selected.size} selected will move up one class. Students already in the top class are left unchanged.`}
        footer={
          <>
            <Button variant="outline" onClick={() => setConfirmPromote(false)}>
              Cancel
            </Button>
            <Button onClick={runPromote} loading={promote.isPending}>
              Promote {promotable}
            </Button>
          </>
        }
      />
    </div>
  );
}
