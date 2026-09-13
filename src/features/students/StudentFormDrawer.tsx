import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Drawer } from "@/components/ui/Drawer";
import { Button } from "@/components/ui/Button";
import { Field } from "@/components/ui/Field";
import { Input, Select, Textarea } from "@/components/ui/Input";
import { PhoneInput } from "@/components/ui/PhoneInput";
import { normalizeGhanaPhone } from "@/lib/phone";
import type { NamedRow } from "@/features/settings/api";
import { useCreateStudent, useUpdateStudent } from "./api";
import { PhotoField } from "./PhotoField";
import { STUDENT_STATUSES, type StudentInput, type StudentRow } from "./types";

const BLANK: StudentInput = {
  admission_no: null,
  full_name: "",
  gender: null,
  dob: null,
  address: null,
  contact: null,
  guardian: null,
  emergency_contact: null,
  date_admitted: null,
  class_id: null,
  status: "Active",
  photo_path: null,
  notes: null,
};

function fromRow(r: StudentRow): StudentInput {
  return {
    admission_no: r.admission_no,
    full_name: r.full_name,
    gender: r.gender,
    dob: r.dob,
    address: r.address,
    contact: normalizeGhanaPhone(r.contact),
    guardian: r.guardian,
    emergency_contact: normalizeGhanaPhone(r.emergency_contact),
    date_admitted: r.date_admitted,
    class_id: r.class_id,
    status: r.status,
    photo_path: r.photo_path,
    notes: r.notes,
  };
}

export function StudentFormDrawer({
  open,
  student,
  classes,
  suggestedAdmissionNo,
  onClose,
}: {
  open: boolean;
  student: StudentRow | null;
  classes: NamedRow[];
  suggestedAdmissionNo: string;
  onClose: () => void;
}) {
  const create = useCreateStudent();
  const update = useUpdateStudent();
  const [form, setForm] = useState<StudentInput>(BLANK);

  useEffect(() => {
    if (open) {
      setForm(student ? fromRow(student) : { ...BLANK, admission_no: suggestedAdmissionNo });
    }
  }, [open, student, suggestedAdmissionNo]);

  const set = (key: keyof StudentInput, value: string | number | null) =>
    setForm((f) => ({ ...f, [key]: value }));

  const str =
    (key: keyof StudentInput) =>
    (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
      set(key, e.target.value || null);

  async function save() {
    if (!form.full_name.trim()) {
      toast.error("Full name is required.");
      return;
    }
    if (!form.gender) {
      toast.error("Gender is required.");
      return;
    }
    try {
      if (student) {
        await update.mutateAsync({ id: student.id, input: form });
        toast.success("Student updated.");
      } else {
        const { code } = await create.mutateAsync(form);
        toast.success(`Student added as ${code}.`);
      }
      onClose();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not save the student.");
    }
  }

  return (
    <Drawer
      open={open}
      onClose={onClose}
      title={student ? `Edit ${student.full_name}` : "Add student"}
      description={student ? student.student_code : "A Student ID is assigned automatically on save."}
      footer={
        <>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={save} loading={create.isPending || update.isPending}>
            {student ? "Save changes" : "Add student"}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <PhotoField
          value={form.photo_path}
          studentCode={student?.student_code ?? ""}
          name={form.full_name}
          onChange={(p) => set("photo_path", p)}
        />

        <Field label={<>Full name <span className="text-danger">*</span></>}>
          <Input value={form.full_name} onChange={(e) => set("full_name", e.target.value)} />
        </Field>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Admission no." hint="Assigned automatically from the Student ID.">
            <Input
              value={form.admission_no ?? (student ? "" : suggestedAdmissionNo)}
              readOnly
              tabIndex={-1}
              className="cursor-default bg-surface-muted text-text-muted"
            />
          </Field>
          <Field label={<>Gender <span className="text-danger">*</span></>}>
            <Select
              value={form.gender ?? ""}
              onChange={(e) => set("gender", e.target.value || null)}
            >
              <option value="">—</option>
              <option value="Male">Male</option>
              <option value="Female">Female</option>
            </Select>
          </Field>
          <Field label="Date of birth">
            <Input type="date" value={form.dob ?? ""} onChange={str("dob")} />
          </Field>
          <Field label="Date admitted">
            <Input type="date" value={form.date_admitted ?? ""} onChange={str("date_admitted")} />
          </Field>
          <Field label="Class">
            <Select
              value={form.class_id ?? ""}
              onChange={(e) => set("class_id", e.target.value ? Number(e.target.value) : null)}
            >
              <option value="">Unassigned</option>
              {classes.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Status">
            <Select value={form.status} onChange={(e) => set("status", e.target.value)}>
              {STUDENT_STATUSES.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Contact">
            <PhoneInput value={form.contact} onChange={(v) => set("contact", v)} />
          </Field>
          <Field label="Parent / guardian">
            <Input value={form.guardian ?? ""} onChange={str("guardian")} />
          </Field>
          <Field label="Emergency contact">
            <PhoneInput
              value={form.emergency_contact}
              onChange={(v) => set("emergency_contact", v)}
            />
          </Field>
        </div>

        <Field label="Address">
          <Textarea value={form.address ?? ""} onChange={str("address")} />
        </Field>
        <Field label="Notes">
          <Textarea value={form.notes ?? ""} onChange={str("notes")} />
        </Field>
      </div>
    </Drawer>
  );
}
