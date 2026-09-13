import { describe, expect, it } from "vitest";
import type { NamedRow } from "@/features/settings/api";
import type { ImportedStudent, StudentRow } from "./types";
import {
  admissionFromCode,
  ageFromDob,
  allocateCodes,
  allocateStudentCodes,
  computeYearBalances,
  filterStudents,
  initials,
  maxCodeNumber,
  maxStudentSequenceNumber,
  nextCode,
  nextStudentCode,
  nextYearAfter,
  planImport,
  promotionTarget,
  STUDENT_CODE_WIDTH,
  STUDENT_PREFIX,
  studentSequenceNumber,
  suggestedAdmissionNo,
  TEACHER_CODE_WIDTH,
  TEACHER_PREFIX,
  type YearFeeTotals,
} from "./logic";

const classes: NamedRow[] = [
  { id: 1, name: "Class 1", sort_order: 1 },
  { id: 2, name: "Class 2", sort_order: 2 },
  { id: 3, name: "Class 3", sort_order: 3 },
];

describe("code generation", () => {
  it("finds the highest student number, ignoring teacher codes", () => {
    expect(maxCodeNumber(["MNA-0001", "MNA-0042", "MNA-T009"], STUDENT_PREFIX)).toBe(42);
  });
  it("produces the next zero-padded student code", () => {
    expect(nextCode(["MNA-0009"], STUDENT_PREFIX, STUDENT_CODE_WIDTH)).toBe("MNA-0010");
    expect(nextCode([], STUDENT_PREFIX, STUDENT_CODE_WIDTH)).toBe("MNA-0001");
  });
  it("produces the next teacher code", () => {
    expect(nextCode(["MNA-T001", "MNA-0100"], TEACHER_PREFIX, TEACHER_CODE_WIDTH)).toBe("MNA-T002");
  });
  it("allocates a contiguous block without collisions", () => {
    expect(allocateCodes(["MNA-0003"], STUDENT_PREFIX, STUDENT_CODE_WIDTH, 3)).toEqual([
      "MNA-0004",
      "MNA-0005",
      "MNA-0006",
    ]);
  });
});

describe("admission numbers", () => {
  it("strips the dash and zero padding off a legacy Student ID", () => {
    expect(admissionFromCode("MNA-0042")).toBe("MNA42");
    expect(admissionFromCode("MNA-0001")).toBe("MNA1");
  });
  it("strips the zero padding off a year-prefixed Student ID", () => {
    expect(admissionFromCode("26MNA0042")).toBe("26MNA42");
    expect(admissionFromCode("26MNA0001")).toBe("26MNA1");
  });
  it("returns empty for anything unrecognizable (e.g. a teacher code)", () => {
    expect(admissionFromCode("MNA-T003")).toBe("");
  });
});

describe("year-prefixed student codes", () => {
  // Constructed as local-time (year, monthIndex, day), not an ISO string —
  // "2027-01-01" would parse as UTC midnight, which can still be Dec 31
  // 2026 in a timezone behind UTC, flipping the year these tests check.
  const y2026 = new Date(2026, 5, 15);

  it("reads the sequence number from either format, and rejects everything else", () => {
    expect(studentSequenceNumber("MNA-0042")).toBe(42);
    expect(studentSequenceNumber("26MNA0092")).toBe(92);
    expect(studentSequenceNumber("MNA-T003")).toBeNull();
    expect(studentSequenceNumber("garbage")).toBeNull();
  });

  it("the running count carries on from legacy codes, not restarting at 1", () => {
    expect(maxStudentSequenceNumber(["MNA-0001", "MNA-0091"])).toBe(91);
    expect(nextStudentCode(["MNA-0001", "MNA-0091"], y2026)).toBe("26MNA0092");
  });

  it("the running count also carries on across a year boundary (never resets)", () => {
    expect(nextStudentCode(["26MNA0092"], new Date(2027, 0, 5))).toBe("27MNA0093");
  });

  it("prepends the current two-digit year to a fresh code", () => {
    expect(nextStudentCode([], y2026)).toBe("26MNA0001");
    expect(nextStudentCode([], new Date(2027, 0, 1))).toBe("27MNA0001");
  });

  it("allocates a contiguous block, year-prefixed, without colliding with old-format codes", () => {
    expect(allocateStudentCodes(["MNA-0091"], 3, y2026)).toEqual([
      "26MNA0092",
      "26MNA0093",
      "26MNA0094",
    ]);
  });

  it("suggests the admission number to match, continuing the same running count", () => {
    expect(suggestedAdmissionNo(["MNA-0042", "MNA-T003"], y2026)).toBe("26MNA43");
    expect(suggestedAdmissionNo([], y2026)).toBe("26MNA1");
  });
});

describe("promotionTarget", () => {
  it("returns the next class by sort order", () => {
    expect(promotionTarget(1, classes)?.name).toBe("Class 2");
  });
  it("returns null for the top class and for an unclassed student", () => {
    expect(promotionTarget(3, classes)).toBeNull();
    expect(promotionTarget(null, classes)).toBeNull();
  });
});

describe("filterStudents", () => {
  const rows = [
    row({ id: 1, full_name: "Amina Yahaya", student_code: "MNA-0006", class_id: 2, status: "Active", guardian: "GUARDIAN" }),
    row({ id: 2, full_name: "Faruk Abubakar", student_code: "MNA-0023", class_id: 3, status: "Withdrawn", contact: "557438424" }),
  ];
  it("matches by name, code, guardian or contact", () => {
    expect(filterStudents(rows, { q: "amina", classId: "all", status: "all" })).toHaveLength(1);
    expect(filterStudents(rows, { q: "0023", classId: "all", status: "all" })).toHaveLength(1);
    expect(filterStudents(rows, { q: "5574", classId: "all", status: "all" })).toHaveLength(1);
  });
  it("filters by class and status", () => {
    expect(filterStudents(rows, { q: "", classId: 2, status: "all" })).toHaveLength(1);
    expect(filterStudents(rows, { q: "", classId: "all", status: "Active" })).toHaveLength(1);
    expect(filterStudents(rows, { q: "", classId: 3, status: "Active" })).toHaveLength(0);
  });
});

describe("initials", () => {
  it("takes the first and last initial", () => {
    expect(initials("Mariam Abdul Wasiu")).toBe("MW");
    expect(initials("Sumaila")).toBe("S");
    expect(initials("  ")).toBe("?");
  });
});

describe("ageFromDob", () => {
  const now = new Date(2026, 8, 10); // 2026-09-10
  it("counts whole years, accounting for the month/day", () => {
    expect(ageFromDob("2011-03-18", now)).toBe(15);
    expect(ageFromDob("2011-12-01", now)).toBe(14); // birthday not yet reached
  });
  it("returns null for missing or bad input", () => {
    expect(ageFromDob(null, now)).toBeNull();
    expect(ageFromDob("not-a-date", now)).toBeNull();
  });
});

describe("planImport", () => {
  const parsed: ImportedStudent[] = [
    imp({ admission_no: "NMA1", full_name: "Mariam Abdul Wasiu", class_name: "Class 5" }),
    imp({ admission_no: "NMA2", full_name: "Abdul Wahab", class_name: "Class 2" }),
    imp({ admission_no: null, full_name: "No Admission Kid", class_name: "Class 1" }),
  ];

  it("skips rows whose admission number already exists", () => {
    const plan = planImport(parsed, ["nma1"], [], classes);
    expect(plan[0].action).toBe("skip-duplicate");
    expect(plan[1].action).toBe("import");
  });
  it("skips admission-less rows whose name already exists", () => {
    const plan = planImport(parsed, [], ["no admission kid"], classes);
    expect(plan[2].action).toBe("skip-duplicate");
  });
  it("maps known class names and flags unknown ones", () => {
    const plan = planImport(parsed, [], [], classes);
    expect(plan[0].classId).toBeNull();
    expect(plan[0].classUnknown).toBe(true); // "Class 5" is not in the fixture
    expect(plan[1].classId).toBe(2);
    expect(plan[1].classUnknown).toBe(false);
  });
});

function row(partial: Partial<StudentRow>): StudentRow {
  return {
    id: 0,
    student_code: "MNA-0000",
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
    created_at: "",
    updated_at: "",
    class_name: null,
    ...partial,
  };
}

function imp(partial: Partial<ImportedStudent>): ImportedStudent {
  return {
    admission_no: null,
    full_name: "",
    gender: null,
    dob: null,
    address: null,
    contact: null,
    guardian: null,
    emergency_contact: null,
    date_admitted: null,
    class_name: null,
    status: "Active",
    notes: null,
    ...partial,
  };
}

function yearTotals(partial: Partial<YearFeeTotals>): YearFeeTotals {
  return {
    year_id: 1,
    hijri_label: "1448",
    gregorian_label: "2026/2027",
    is_current: 0,
    tuition_due: 0,
    tuition_paid: 0,
    exam_due: 0,
    exam_paid: 0,
    ...partial,
  };
}

describe("computeYearBalances", () => {
  it("computes tuition, exam and total balances", () => {
    const [row] = computeYearBalances([
      yearTotals({ tuition_due: 50, tuition_paid: 20, exam_due: 40, exam_paid: 40 }),
    ]);
    expect(row.tuition_balance).toBe(30); // owing
    expect(row.exam_balance).toBe(0); // settled
    expect(row.total_balance).toBe(30);
  });

  it("represents an overpayment as a negative balance", () => {
    const [row] = computeYearBalances([yearTotals({ exam_due: 10, exam_paid: 15 })]);
    expect(row.exam_balance).toBe(-5);
  });

  it("drops years with no fee activity at all (e.g. before enrollment)", () => {
    const rows = computeYearBalances([
      yearTotals({ year_id: 1 }), // all zero
      yearTotals({ year_id: 2, exam_due: 10 }),
    ]);
    expect(rows.map((r) => r.year_id)).toEqual([2]);
  });

  it("keeps a year with only payments and no due (fully-credited edge case)", () => {
    const rows = computeYearBalances([yearTotals({ year_id: 1, tuition_paid: 5 })]);
    expect(rows).toHaveLength(1);
    expect(rows[0].tuition_balance).toBe(-5);
  });
});

describe("nextYearAfter", () => {
  const years = [
    { id: 1, gregorian_label: "2026/2027" },
    { id: 2, gregorian_label: "2025/2026" },
    { id: 3, gregorian_label: "2024/2025" },
  ];

  it("finds the chronologically next year by label, not by id", () => {
    // id order here is deliberately NOT chronological (id 3 is the oldest)
    expect(nextYearAfter(years, 3)?.id).toBe(2);
    expect(nextYearAfter(years, 2)?.id).toBe(1);
  });

  it("returns null for the most recent year", () => {
    expect(nextYearAfter(years, 1)).toBeNull();
  });

  it("returns null for a year id that isn't in the list", () => {
    expect(nextYearAfter(years, 999)).toBeNull();
  });
});
