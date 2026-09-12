import { useEffect, useState } from "react";
import { toast } from "sonner";
import { ArrowDown, ArrowUp, Check, Pencil, Plus, Trash2, X } from "lucide-react";
import { Card, CardBody, CardHeader } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Dialog } from "@/components/ui/Dialog";
import { LoadingBlock, ErrorBlock, EmptyRow } from "@/components/ui/State";
import {
  useAddNamed,
  useDeleteNamed,
  useNamedList,
  useRenameNamed,
  useReorderNamed,
  useSetSubjectClasses,
  useSubjectsWithClasses,
  type NamedRow,
  type SubjectWithClasses,
} from "./api";

export function classesSummary(subject: SubjectWithClasses, classCount: number): string {
  if (classCount > 0 && subject.class_ids.length === classCount) return "All classes";
  if (subject.class_ids.length === 0) return "No classes yet";
  return `${subject.class_ids.length} of ${classCount} classes`;
}

export function SubjectsSection() {
  const { data: subjects, isLoading, error } = useSubjectsWithClasses();
  const { data: classes = [] } = useNamedList("classes");
  const addNamed = useAddNamed("subjects");
  const renameNamed = useRenameNamed("subjects");
  const reorder = useReorderNamed("subjects");
  const deleteNamed = useDeleteNamed("subjects");

  const [newName, setNewName] = useState("");
  const [editId, setEditId] = useState<number | null>(null);
  const [editValue, setEditValue] = useState("");
  const [confirmDelete, setConfirmDelete] = useState<NamedRow | null>(null);
  const [classesFor, setClassesFor] = useState<SubjectWithClasses | null>(null);

  async function add() {
    const name = newName.trim();
    if (!name) return;
    try {
      await addNamed.mutateAsync(name);
      setNewName("");
      toast.success("Subject added — pick which classes it applies to next.");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not add.");
    }
  }

  async function saveRename() {
    if (editId == null) return;
    const name = editValue.trim();
    if (!name) return;
    try {
      await renameNamed.mutateAsync({ id: editId, name });
      setEditId(null);
      toast.success("Renamed.");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not rename.");
    }
  }

  async function move(index: number, dir: -1 | 1) {
    if (!subjects) return;
    const a = subjects[index];
    const b = subjects[index + dir];
    if (!a || !b) return;
    try {
      await reorder.mutateAsync({ a, b });
    } catch (e) {
      toast.error(String(e));
    }
  }

  return (
    <Card>
      <CardHeader
        title="Subjects"
        description="Subjects taught across classes. Each one can apply to any set of classes — a subject doesn't have to be taught everywhere."
      />
      <CardBody className="space-y-4">
        <div className="overflow-hidden rounded-lg border border-border">
          {isLoading ? (
            <LoadingBlock />
          ) : error ? (
            <ErrorBlock error={error} />
          ) : !subjects?.length ? (
            <EmptyRow>Nothing here yet.</EmptyRow>
          ) : (
            <ul className="divide-y divide-border">
              {subjects.map((row, i) => (
                <li key={row.id} className="flex items-center gap-2 px-3 py-2.5">
                  <span className="w-6 text-center text-xs text-text-muted">{i + 1}</span>
                  {editId === row.id ? (
                    <>
                      <Input
                        autoFocus
                        value={editValue}
                        onChange={(e) => setEditValue(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") saveRename();
                          if (e.key === "Escape") setEditId(null);
                        }}
                        className="h-8 flex-1"
                      />
                      <Button variant="ghost" size="icon" aria-label="Save" onClick={saveRename}>
                        <Check className="h-4 w-4 text-primary" />
                      </Button>
                      <Button variant="ghost" size="icon" aria-label="Cancel" onClick={() => setEditId(null)}>
                        <X className="h-4 w-4" />
                      </Button>
                    </>
                  ) : (
                    <>
                      <span className="flex-1 truncate text-sm text-text">{row.name}</span>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setClassesFor(row)}
                        className="shrink-0"
                      >
                        {classesSummary(row, classes.length)}
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        aria-label="Move up"
                        disabled={i === 0}
                        onClick={() => move(i, -1)}
                      >
                        <ArrowUp className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        aria-label="Move down"
                        disabled={i === subjects.length - 1}
                        onClick={() => move(i, 1)}
                      >
                        <ArrowDown className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        aria-label="Rename"
                        onClick={() => {
                          setEditId(row.id);
                          setEditValue(row.name);
                        }}
                      >
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        aria-label="Delete"
                        onClick={() => setConfirmDelete(row)}
                      >
                        <Trash2 className="h-4 w-4 text-danger" />
                      </Button>
                    </>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="flex gap-2">
          <Input
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && add()}
            placeholder="Add a subject…"
          />
          <Button onClick={add} loading={addNamed.isPending}>
            <Plus className="h-4 w-4" />
            Add
          </Button>
        </div>
      </CardBody>

      <SubjectClassesDialog
        subject={classesFor}
        classes={classes}
        onClose={() => setClassesFor(null)}
      />

      <Dialog
        open={confirmDelete != null}
        onClose={() => setConfirmDelete(null)}
        title="Delete subject?"
        description={
          confirmDelete
            ? `"${confirmDelete.name}" will be removed. This is blocked if results already reference it.`
            : ""
        }
        footer={
          <>
            <Button variant="outline" onClick={() => setConfirmDelete(null)}>
              Cancel
            </Button>
            <Button
              variant="danger"
              loading={deleteNamed.isPending}
              onClick={async () => {
                if (!confirmDelete) return;
                try {
                  await deleteNamed.mutateAsync(confirmDelete.id);
                  toast.success("Deleted.");
                  setConfirmDelete(null);
                } catch (e) {
                  toast.error(
                    e instanceof Error && /FOREIGN KEY/i.test(e.message)
                      ? `Cannot delete "${confirmDelete.name}" — it is already in use.`
                      : e instanceof Error
                        ? e.message
                        : "Could not delete.",
                  );
                }
              }}
            >
              Delete
            </Button>
          </>
        }
      />
    </Card>
  );
}

function SubjectClassesDialog({
  subject,
  classes,
  onClose,
}: {
  subject: SubjectWithClasses | null;
  classes: NamedRow[];
  onClose: () => void;
}) {
  const setClasses = useSetSubjectClasses();
  const [selected, setSelected] = useState<Set<number>>(new Set());

  useEffect(() => {
    if (subject) setSelected(new Set(subject.class_ids));
  }, [subject]);

  function toggle(id: number) {
    setSelected((s) => {
      const next = new Set(s);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function save() {
    if (!subject) return;
    try {
      await setClasses.mutateAsync({ subjectId: subject.id, classIds: [...selected] });
      toast.success("Classes updated.");
      onClose();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not save.");
    }
  }

  return (
    <Dialog
      open={subject != null}
      onClose={onClose}
      title={subject ? `Classes for ${subject.name}` : ""}
      description="Results entry and report cards only show this subject for the classes checked here."
      footer={
        <>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={save} loading={setClasses.isPending}>
            Save
          </Button>
        </>
      }
    >
      {classes.length === 0 ? (
        <p className="text-sm text-text-muted">Add a class first, in Settings → Classes.</p>
      ) : (
        <div className="grid grid-cols-2 gap-x-4 gap-y-2 sm:grid-cols-3">
          {classes.map((c) => (
            <label key={c.id} className="flex items-center gap-2 text-sm text-text">
              <input
                type="checkbox"
                className="h-4 w-4 accent-[var(--color-primary)]"
                checked={selected.has(c.id)}
                onChange={() => toggle(c.id)}
              />
              {c.name}
            </label>
          ))}
        </div>
      )}
    </Dialog>
  );
}
