import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { toast } from "sonner";
import { GraduationCap, Pencil, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Dialog } from "@/components/ui/Dialog";
import { StatusBadge } from "@/components/ui/Badge";
import { Pagination } from "@/components/ui/Pagination";
import { SearchInput } from "@/components/ui/SearchInput";
import { LoadingBlock, ErrorBlock } from "@/components/ui/State";
import { useDebounce } from "@/lib/useDebounce";
import { usePagination } from "@/lib/usePagination";
import {
  useAllAssignments,
  useDeleteTeacher,
  useTeachers,
  type Teacher,
} from "./api";
import { TeacherFormDrawer } from "./TeacherFormDrawer";

export function TeachersPage() {
  const { data: teachers, isLoading, error } = useTeachers();
  const { data: assignments = [] } = useAllAssignments();
  const del = useDeleteTeacher();

  const [drawer, setDrawer] = useState<Teacher | null | "create">(null);
  const [confirmDelete, setConfirmDelete] = useState<Teacher | null>(null);
  const [q, setQ] = useState("");
  const debouncedQ = useDebounce(q, 200);

  const byTeacher = useMemo(() => {
    const map = new Map<number, string[]>();
    for (const a of assignments) {
      const list = map.get(a.teacher_id) ?? [];
      list.push(`${a.class_name} · ${a.subject_name}`);
      map.set(a.teacher_id, list);
    }
    return map;
  }, [assignments]);

  const filtered = useMemo(() => {
    const needle = debouncedQ.trim().toLowerCase();
    if (!needle) return teachers ?? [];
    return (teachers ?? []).filter((t) =>
      [t.name, t.teacher_code, t.contact, ...(byTeacher.get(t.id) ?? [])]
        .filter(Boolean)
        .some((v) => (v as string).toLowerCase().includes(needle)),
    );
  }, [teachers, debouncedQ, byTeacher]);

  const { page, setPage, pageSize, setPageSize, pageItems, total } = usePagination(filtered, {
    storageKey: "mna.teachers.pageSize",
    resetKey: debouncedQ,
  });

  if (isLoading) return <LoadingBlock />;
  if (error) return <ErrorBlock error={error} />;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-xl font-semibold text-text">Teachers &amp; staff</h2>
          <p className="mt-1 text-sm text-text-muted">
            {teachers!.length} on record{filtered.length !== teachers!.length ? ` · ${filtered.length} shown` : ""}
          </p>
        </div>
        <Button onClick={() => setDrawer("create")}>
          <Plus className="h-4 w-4" />
          Add teacher
        </Button>
      </div>

      <SearchInput value={q} onChange={setQ} placeholder="Search name, ID, contact, assignment…" />

      {teachers!.length === 0 ? (
        <div className="rounded-xl border border-border bg-surface px-6 py-16 text-center">
          <GraduationCap className="mx-auto h-8 w-8 text-text-muted" />
          <p className="mt-3 text-sm text-text-muted">No teachers yet.</p>
        </div>
      ) : (
        <div className="overflow-hidden rounded-xl border border-border">
          <table className="w-full text-sm">
            <thead className="border-b border-border bg-surface-muted text-left text-xs text-text-muted">
              <tr>
                <th className="px-3 py-2.5 font-medium">Name</th>
                <th className="px-3 py-2.5 font-medium">Assignments</th>
                <th className="px-3 py-2.5 font-medium">Contact</th>
                <th className="px-3 py-2.5 font-medium">Joined</th>
                <th className="px-3 py-2.5 font-medium">Status</th>
                <th className="px-3 py-2.5" />
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {pageItems.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-4 py-8 text-center text-sm text-text-muted">
                    No teachers match “{debouncedQ}”.
                  </td>
                </tr>
              )}
              {pageItems.map((t) => {
                const a = byTeacher.get(t.id) ?? [];
                return (
                  <tr key={t.id} className="hover:bg-surface-muted/50">
                    <td className="px-3 py-2.5">
                      <Link
                        to={`/teachers/${t.id}`}
                        className="font-medium text-text hover:text-primary hover:underline"
                      >
                        {t.name}
                      </Link>
                      <div className="text-xs text-text-muted">{t.teacher_code}</div>
                    </td>
                    <td className="px-3 py-2.5 text-text-muted">
                      {a.length === 0
                        ? "—"
                        : a.slice(0, 2).join(", ") + (a.length > 2 ? ` +${a.length - 2}` : "")}
                    </td>
                    <td className="px-3 py-2.5 text-text-muted">{t.contact ?? "—"}</td>
                    <td className="px-3 py-2.5 text-text-muted">{t.date_joined ?? "—"}</td>
                    <td className="px-3 py-2.5">
                      <StatusBadge status={t.status} />
                    </td>
                    <td className="px-3 py-2.5">
                      <div className="flex justify-end gap-1">
                        <Button
                          variant="ghost"
                          size="icon"
                          aria-label="Edit"
                          onClick={() => setDrawer(t)}
                        >
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          aria-label="Delete"
                          onClick={() => setConfirmDelete(t)}
                        >
                          <Trash2 className="h-4 w-4 text-danger" />
                        </Button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          <div className="border-t border-border px-3 py-2.5">
            <Pagination
              page={page}
              pageSize={pageSize}
              total={total}
              onPageChange={setPage}
              onPageSizeChange={setPageSize}
            />
          </div>
        </div>
      )}

      <TeacherFormDrawer
        open={drawer != null}
        teacher={drawer === "create" || drawer == null ? null : drawer}
        onClose={() => setDrawer(null)}
        onCreated={(t) => setDrawer(t)}
      />

      <Dialog
        open={confirmDelete != null}
        onClose={() => setConfirmDelete(null)}
        title="Delete teacher?"
        description={
          confirmDelete
            ? `${confirmDelete.name} (${confirmDelete.teacher_code}) and their teaching assignments will be removed.`
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
                  await del.mutateAsync(confirmDelete.id);
                  toast.success("Teacher deleted.");
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
    </div>
  );
}
