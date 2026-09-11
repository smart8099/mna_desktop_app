export const STUDENT_STATUSES = [
  "Active",
  "Inactive",
  "Graduated",
  "Withdrawn",
] as const;
export type StudentStatus = (typeof STUDENT_STATUSES)[number];

export interface Student {
  id: number;
  student_code: string;
  admission_no: string | null;
  full_name: string;
  gender: "Male" | "Female" | null;
  dob: string | null;
  address: string | null;
  contact: string | null;
  guardian: string | null;
  emergency_contact: string | null;
  date_admitted: string | null;
  class_id: number | null;
  status: string;
  photo_path: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

/** A student row with the class name joined in. */
export interface StudentRow extends Student {
  class_name: string | null;
}

export type StudentInput = Omit<
  Student,
  "id" | "student_code" | "created_at" | "updated_at"
>;

export interface ImportedStudent {
  admission_no: string | null;
  full_name: string;
  gender: string | null;
  dob: string | null;
  address: string | null;
  contact: string | null;
  guardian: string | null;
  emergency_contact: string | null;
  date_admitted: string | null;
  class_name: string | null;
  status: string | null;
  notes: string | null;
}
