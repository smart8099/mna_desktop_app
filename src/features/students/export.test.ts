import { describe, expect, it } from "vitest";
import {
  DEFAULT_STUDENT_EXPORT_KEYS,
  STUDENT_EXPORT_FIELDS,
  studentExportColumns,
} from "./export";
import type { StudentRow } from "./types";

const STUDENT: StudentRow = {
  id: 1,
  student_code: "MNA-0001",
  admission_no: "MNA1",
  full_name: "Amina Yakubu",
  gender: "Female",
  dob: "2015-06-01",
  address: null,
  contact: null,
  guardian: null,
  emergency_contact: null,
  date_admitted: "2021-09-01",
  class_id: 1,
  status: "Active",
  photo_path: null,
  notes: null,
  created_at: "",
  updated_at: "",
  class_name: "Class 1",
};

describe("STUDENT_EXPORT_FIELDS", () => {
  it("has a unique key per field", () => {
    const keys = STUDENT_EXPORT_FIELDS.map((f) => f.key);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it("defaults to the identity/roster essentials, leaving contact details opt-in", () => {
    expect([...DEFAULT_STUDENT_EXPORT_KEYS].sort()).toEqual(
      ["student_code", "admission_no", "full_name", "gender", "dob", "class_name"].sort(),
    );
  });
});

describe("studentExportColumns", () => {
  it("keeps only the requested keys, in catalog order regardless of selection order", () => {
    const columns = studentExportColumns(new Set(["class_name", "full_name"]));
    expect(columns.map((c) => c.key)).toEqual(["full_name", "class_name"]);
  });

  it("returns nothing for an empty selection", () => {
    expect(studentExportColumns(new Set())).toEqual([]);
  });

  it("computes age from dob for the age column", () => {
    const [ageCol] = studentExportColumns(new Set(["age"]));
    const value = ageCol.value({ ...STUDENT, dob: "2015-06-01" });
    // whatever "today" is in CI, a 2015 birth is a plausible single/double-digit age
    expect(Number(value)).toBeGreaterThan(0);
    expect(Number(value)).toBeLessThan(30);
  });

  it("falls back to an empty string for every nullable field", () => {
    const nullable: StudentRow = {
      ...STUDENT,
      admission_no: null,
      gender: null,
      dob: null,
      guardian: null,
      contact: null,
      emergency_contact: null,
      address: null,
      date_admitted: null,
      class_name: null,
    };
    const allKeys = new Set(STUDENT_EXPORT_FIELDS.map((f) => f.key));
    const columns = studentExportColumns(allKeys);
    for (const col of columns) {
      if (col.key === "student_code" || col.key === "full_name" || col.key === "status") continue;
      expect(col.value(nullable)).toBe("");
    }
  });

  it("reads the plain string fields straight off the row", () => {
    const columns = studentExportColumns(
      new Set(["student_code", "admission_no", "full_name", "gender", "class_name", "status"]),
    );
    const values = Object.fromEntries(columns.map((c) => [c.key, c.value(STUDENT)]));
    expect(values).toEqual({
      student_code: "MNA-0001",
      admission_no: "MNA1",
      full_name: "Amina Yakubu",
      gender: "Female",
      class_name: "Class 1",
      status: "Active",
    });
  });
});
