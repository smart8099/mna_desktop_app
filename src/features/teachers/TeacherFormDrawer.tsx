import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { Plus, X } from "lucide-react";
import { Drawer } from "@/components/ui/Drawer";
import { Button } from "@/components/ui/Button";
import { Field } from "@/components/ui/Field";
import { Input, Select, Textarea } from "@/components/ui/Input";
import { PhoneInput } from "@/components/ui/PhoneInput";
import { Badge } from "@/components/ui/Badge";
import { normalizeGhanaPhone } from "@/lib/phone";
import { useNamedList } from "@/features/settings/api";
import {
  TEACHER_STATUSES,
  useAddAssignment,
  useAllAssignments,
  useCreateTeacher,
  useRemoveAssignment,
  useUpdateTeacher,
  type Teacher,
  type TeacherInput,
} from "./api";

const BLANK: TeacherInput = {
  name: "",
  contact: null,
  status: "Active",
  date_joined: null,
  notes: null,
};

export function TeacherFormDrawer({
  open,
  teacher,
  onClose,
  onCreated,
}: {
  open: boolean;
  teacher: Teacher | null;
  onClose: () => void;
  onCreated: (t: Teacher) => void;
}) {
  const create = useCreateTeacher();
  const update = useUpdateTeacher();
  const { data: classes = [] } = useNamedList("classes");
  const { data: subjects = [] } = useNamedList("subjects");
  const { data: assignments = [] } = useAllAssignments();
  const addAssignment = useAddAssignment();
  const removeAssignment = useRemoveAssignment();

  const [form, setForm] = useState<TeacherInput>(BLANK);
  const [newClass, setNewClass] = useState<number | "">("");
  const [newSubject, setNewSubject] = useState<number | "">("");

  useEffect(() => {
    if (open) {
      setForm(
        teacher
          ? {
              name: teacher.name,
              contact: normalizeGhanaPhone(teacher.contact),
              status: teacher.status,
              date_joined: teacher.date_joined,
              notes: teacher.notes,
            }
          : BLANK,
      );
    }
  }, [open, teacher]);

  const mine = useMemo(
    () => assignments.filter((a) => a.teacher_id === teacher?.id),
    [assignments, teacher],
  );

  async function save() {
    if (!form.name.trim()) {
      toast.error("Name is required.");
      return;
    }
    try {
      if (teacher) {
        await update.mutateAsync({ id: teacher.id, input: form });
        toast.success("Teacher updated.");
        onClose();
      } else {
        const { id, code } = await create.mutateAsync(form);
        toast.success(`Teacher added as ${code}. You can now assign classes and subjects.`);
        onCreated({ id, teacher_code: code, ...form });
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not save the teacher.");
    }
  }

  async function addRow() {
    if (!teacher || newClass === "" || newSubject === "") return;
    try {
      await addAssignment.mutateAsync({
        teacher_id: teacher.id,
        class_id: Number(newClass),
        subject_id: Number(newSubject),
      });
      setNewClass("");
      setNewSubject("");
    } catch (e) {
      if (e instanceof Error && /UNIQUE/i.test(e.message)) {
        toast.error("That class and subject is already assigned to this teacher.");
      } else {
        toast.error(e instanceof Error ? e.message : "Could not add the assignment.");
      }
    }
  }

  return (
    <Drawer
      open={open}
      onClose={onClose}
      title={teacher ? `Edit ${teacher.name}` : "Add teacher"}
      description={teacher ? teacher.teacher_code : "A Teacher ID is assigned automatically on save."}
      footer={
        <>
          <Button variant="outline" onClick={onClose}>
            {teacher ? "Done" : "Cancel"}
          </Button>
          <Button onClick={save} loading={create.isPending || update.isPending}>
            {teacher ? "Save changes" : "Add teacher"}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <Field label="Name">
          <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
        </Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Contact">
            <PhoneInput
              value={form.contact}
              onChange={(v) => setForm((f) => ({ ...f, contact: v }))}
            />
          </Field>
          <Field label="Status">
            <Select
              value={form.status}
              onChange={(e) => setForm({ ...form, status: e.target.value })}
            >
              {TEACHER_STATUSES.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Date joined">
            <Input
              type="date"
              value={form.date_joined ?? ""}
              onChange={(e) => setForm({ ...form, date_joined: e.target.value || null })}
            />
          </Field>
        </div>
        <Field label="Notes">
          <Textarea
            value={form.notes ?? ""}
            onChange={(e) => setForm({ ...form, notes: e.target.value || null })}
          />
        </Field>

        <div className="border-t border-border pt-4">
          <h3 className="text-sm font-semibold text-text">Teaching assignments</h3>
          {!teacher ? (
            <p className="mt-1 text-sm text-text-muted">
              Save the teacher first, then assign classes and subjects here.
            </p>
          ) : (
            <div className="mt-3 space-y-3">
              {mine.length > 0 ? (
                <div className="flex flex-wrap gap-2">
                  {mine.map((a) => (
                    <Badge key={a.id} tone="muted" className="pr-1">
                      {a.class_name} · {a.subject_name}
                      <button
                        className="ml-1 rounded p-0.5 hover:bg-border"
                        aria-label="Remove assignment"
                        onClick={() => removeAssignment.mutate(a.id)}
                      >
                        <X className="h-3 w-3" />
                      </button>
                    </Badge>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-text-muted">No assignments yet.</p>
              )}

              <div className="flex flex-wrap items-end gap-2">
                <Select
                  className="w-auto flex-1"
                  value={newClass}
                  onChange={(e) => setNewClass(e.target.value ? Number(e.target.value) : "")}
                >
                  <option value="">Class…</option>
                  {classes.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </Select>
                <Select
                  className="w-auto flex-1"
                  value={newSubject}
                  onChange={(e) => setNewSubject(e.target.value ? Number(e.target.value) : "")}
                >
                  <option value="">Subject…</option>
                  {subjects.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
                </Select>
                <Button
                  variant="outline"
                  onClick={addRow}
                  loading={addAssignment.isPending}
                  disabled={newClass === "" || newSubject === ""}
                >
                  <Plus className="h-4 w-4" />
                  Add
                </Button>
              </div>
            </div>
          )}
        </div>
      </div>
    </Drawer>
  );
}
