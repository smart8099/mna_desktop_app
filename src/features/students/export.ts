import type { ExportColumn } from "@/lib/exportRows";
import { ageFromDob } from "./logic";
import type { StudentRow } from "./types";

export interface StudentExportField {
  key: string;
  label: string;
  value: (row: StudentRow) => string;
  defaultChecked: boolean;
}

/** Every field the register can be printed with, in display order. */
export const STUDENT_EXPORT_FIELDS: StudentExportField[] = [
  { key: "student_code", label: "Student ID", value: (r) => r.student_code, defaultChecked: true },
  {
    key: "admission_no",
    label: "Admission No.",
    value: (r) => r.admission_no ?? "",
    defaultChecked: true,
  },
  { key: "full_name", label: "Full Name", value: (r) => r.full_name, defaultChecked: true },
  { key: "gender", label: "Gender", value: (r) => r.gender ?? "", defaultChecked: true },
  { key: "dob", label: "Date of Birth", value: (r) => r.dob ?? "", defaultChecked: true },
  {
    key: "age",
    label: "Age",
    value: (r) => {
      const age = ageFromDob(r.dob);
      return age != null ? String(age) : "";
    },
    defaultChecked: false,
  },
  { key: "class_name", label: "Class", value: (r) => r.class_name ?? "", defaultChecked: true },
  { key: "status", label: "Status", value: (r) => r.status, defaultChecked: false },
  { key: "guardian", label: "Guardian", value: (r) => r.guardian ?? "", defaultChecked: false },
  { key: "contact", label: "Contact", value: (r) => r.contact ?? "", defaultChecked: false },
  {
    key: "emergency_contact",
    label: "Emergency Contact",
    value: (r) => r.emergency_contact ?? "",
    defaultChecked: false,
  },
  { key: "address", label: "Address", value: (r) => r.address ?? "", defaultChecked: false },
  {
    key: "date_admitted",
    label: "Date Admitted",
    value: (r) => r.date_admitted ?? "",
    defaultChecked: false,
  },
];

export const DEFAULT_STUDENT_EXPORT_KEYS = new Set(
  STUDENT_EXPORT_FIELDS.filter((f) => f.defaultChecked).map((f) => f.key),
);

/** The export column list for a set of chosen field keys, preserving field order. */
export function studentExportColumns(selectedKeys: Set<string>): ExportColumn<StudentRow>[] {
  return STUDENT_EXPORT_FIELDS.filter((f) => selectedKeys.has(f.key)).map(({ key, label, value }) => ({
    key,
    label,
    value,
  }));
}
