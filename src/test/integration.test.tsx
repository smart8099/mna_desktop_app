import { beforeEach, describe, expect, it, vi } from "vitest";
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Route, Routes } from "react-router-dom";
import { db, renderWithProviders, tauri } from "@/test/harness";

vi.mock("@/lib/db", async () => (await import("@/test/harness")).db.module);
vi.mock("@tauri-apps/api/core", async () => (await import("@/test/harness")).tauri.core);
vi.mock("@tauri-apps/plugin-dialog", async () => (await import("@/test/harness")).tauri.dialog);

const CLASSES = [
  { id: 1, name: "Class 1", sort_order: 1 },
  { id: 2, name: "Class 2", sort_order: 2 },
];
const SUBJECTS = [{ id: 10, name: "Quran", sort_order: 1 }];
const SETTINGS = {
  id: 1,
  school_name: "MNA",
  currency: "GH₵",
  weekend_rate: 5,
  vacation_rate: 3,
  exam_fee: 40,
  default_ca_weight: 0.3,
  default_exam_weight: 0.7,
};
const YEAR = { id: 1, hijri_label: "1448", gregorian_label: "2026/2027", is_current: 1 };

function baseFixtures() {
  db.on(/FROM classes ORDER BY sort_order/i, () => CLASSES);
  db.on(/SELECT \* FROM classes/i, () => CLASSES);
  db.on(/SELECT id, name FROM subjects/i, () => SUBJECTS);
  db.on(/FROM subjects ORDER BY sort_order/i, () => SUBJECTS);
  // useSubjectsForClass() / the gradebook's per-class subject list — every
  // fixture subject applies to every class by default, matching how a fresh
  // subject_classes table would look right after the migration seeds it.
  db.on(/subjects s\s+JOIN subject_classes sc/i, () => SUBJECTS);
  db.on(/SELECT \* FROM settings WHERE id = 1/i, () => [SETTINGS]);
  db.on(/FROM academic_years WHERE is_current = 1/i, () => [YEAR]);
  // useYearFilter() resolves the selected year's label etc. by looking it up
  // in this plain list, not just the "current" query above — needed even
  // when a test never switches years, since ExamFeesPage/ReportCardPage
  // gate their whole render on that lookup succeeding.
  db.on(/FROM academic_years ORDER BY is_current DESC/i, () => [YEAR]);
  db.on(/FROM weight_overrides/i, () => []);
}

beforeEach(() => {
  db.reset();
  tauri.reset();
  vi.clearAllMocks();
  // sessionStorage survives across tests within this one jsdom window —
  // clear it so useSessionState-backed filters (and the auth session,
  // which renderWithProviders re-seeds per call anyway) never leak between
  // unrelated tests.
  sessionStorage.clear();
  // Batched writes go through invoke("execute_transaction", { statements }) rather
  // than db.execute() directly — bridge it back into the db fake so assertions on
  // db.executed() keep seeing each statement, unchanged from before batching.
  tauri.onInvoke("execute_transaction", async (args) => {
    const { statements } = (args ?? {}) as {
      statements: { sql: string; params?: unknown[] }[];
    };
    for (const s of statements) await db.execute(s.sql, s.params ?? []);
    return statements.length;
  });
});

// ── Students ─────────────────────────────────────────────────────────────────

describe("Students page", () => {
  const STUDENTS = [
    { id: 1, student_code: "MNA-0001", admission_no: "MNA1", full_name: "Amina Yakubu", class_id: 2, class_name: "Class 2", status: "Active", guardian: "Yakubu", contact: "+233244000001", gender: "Female", photo_path: null },
    { id: 2, student_code: "MNA-0002", admission_no: "MNA2", full_name: "Bilal Osei", class_id: 1, class_name: "Class 1", status: "Active", guardian: "Osei", contact: null, gender: "Male", photo_path: null },
    { id: 3, student_code: "MNA-0003", admission_no: "MNA3", full_name: "Zainab Adam", class_id: 2, class_name: "Class 2", status: "Inactive", guardian: null, contact: null, gender: "Female", photo_path: null },
  ];

  beforeEach(() => {
    baseFixtures();
    db.on(/FROM students s LEFT JOIN classes c/i, () => STUDENTS);
    db.on(/SELECT student_code FROM students/i, () => STUDENTS.map((s) => ({ student_code: s.student_code })));
  });

  it("lists students and filters by search", async () => {
    const { StudentsPage } = await import("@/features/students/StudentsPage");
    renderWithProviders(<StudentsPage />);

    // the page renders both a table and a card list (media queries don't apply in jsdom)
    expect((await screen.findAllByText("Amina Yakubu")).length).toBeGreaterThan(0);
    expect(screen.getAllByText("Bilal Osei").length).toBeGreaterThan(0);

    await userEvent.type(screen.getByPlaceholderText(/search name/i), "bilal");
    await waitFor(() => expect(screen.queryAllByText("Amina Yakubu")).toHaveLength(0));
    expect(screen.getAllByText("Bilal Osei").length).toBeGreaterThan(0);
  });

  it("adds a student, writing an INSERT with the generated code", async () => {
    const { StudentsPage } = await import("@/features/students/StudentsPage");
    renderWithProviders(<StudentsPage />);
    await screen.findAllByText("Amina Yakubu");

    await userEvent.click(screen.getByRole("button", { name: /add student/i }));
    const dialog = await screen.findByRole("dialog");
    await userEvent.type(within(dialog).getByLabelText(/full name/i), "New Pupil");
    await userEvent.click(within(dialog).getByRole("button", { name: /add student/i }));

    await waitFor(() => {
      const insert = db.executed().find((s) => s.startsWith("INSERT INTO students"));
      expect(insert).toBeTruthy();
      expect(insert).toContain("student_code");
    });
    // admission number is derived from the next code (MNA-0004 -> MNA4)
    const insertCall = db.execute.mock.calls.find((c) => String(c[0]).includes("INSERT INTO students"));
    expect(insertCall?.[1]).toContain("MNA-0004");
    expect(insertCall?.[1]).toContain("MNA4");
  });

  function decodeCsv(b64: string): string {
    const binary = atob(b64);
    const bytes = Uint8Array.from(binary, (c) => c.charCodeAt(0));
    return new TextDecoder("utf-8", { ignoreBOM: true }).decode(bytes);
  }

  it("prints a register scoped to the active class filter, as CSV", async () => {
    const { StudentsPage } = await import("@/features/students/StudentsPage");
    renderWithProviders(<StudentsPage />);
    await screen.findAllByText("Amina Yakubu");

    // narrow to Class 1, which only Bilal belongs to
    const [classFilter] = screen.getAllByRole("combobox");
    await userEvent.selectOptions(classFilter, "1");
    await waitFor(() => expect(screen.queryAllByText("Amina Yakubu")).toHaveLength(0));

    await userEvent.click(screen.getByRole("button", { name: /print register/i }));
    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).getByText("Class 1 · 1 student")).toBeInTheDocument();

    tauri.dialog.save.mockResolvedValueOnce("/tmp/register.csv");
    await userEvent.click(within(dialog).getByRole("button", { name: "CSV" }));
    await userEvent.click(within(dialog).getByRole("button", { name: /^export$/i }));

    await waitFor(() => expect(tauri.core.invoke).toHaveBeenCalledWith(
      "save_binary_file",
      expect.objectContaining({ destPath: "/tmp/register.csv" }),
    ));
    const [, args] = tauri.core.invoke.mock.calls.find((c) => c[0] === "save_binary_file") as [
      string,
      { dataB64: string },
    ];
    const csv = decodeCsv(args.dataB64);
    expect(csv).toContain("Bilal Osei");
    expect(csv).not.toContain("Amina Yakubu"); // filtered out by class
    expect(csv).not.toContain("Zainab Adam");

    // dialog closes and confirms on success
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
  });

  it("only exports the fields left checked, in whichever format is chosen", async () => {
    const { StudentsPage } = await import("@/features/students/StudentsPage");
    renderWithProviders(<StudentsPage />);
    await screen.findAllByText("Amina Yakubu");

    await userEvent.click(screen.getByRole("button", { name: /print register/i }));
    const dialog = await screen.findByRole("dialog");

    // Class is checked by default — uncheck it before exporting
    await userEvent.click(within(dialog).getByLabelText("Class"));
    await userEvent.click(within(dialog).getByRole("button", { name: "Excel" }));

    tauri.dialog.save.mockResolvedValueOnce("/tmp/register.xlsx");
    await userEvent.click(within(dialog).getByRole("button", { name: /^export$/i }));

    await waitFor(() => expect(tauri.core.invoke).toHaveBeenCalledWith(
      "save_binary_file",
      expect.objectContaining({ destPath: "/tmp/register.xlsx" }),
    ));
    const [, args] = tauri.core.invoke.mock.calls.find((c) => c[0] === "save_binary_file") as [
      string,
      { dataB64: string },
    ];
    const XLSX = await import("xlsx");
    const book = XLSX.read(args.dataB64, { type: "base64" });
    const [header] = XLSX.utils.sheet_to_json(book.Sheets[book.SheetNames[0]], {
      header: 1,
    }) as string[][];
    expect(header).not.toContain("Class");
    expect(header).toContain("Full Name");
  });

  it("does nothing if the save dialog is cancelled", async () => {
    const { StudentsPage } = await import("@/features/students/StudentsPage");
    renderWithProviders(<StudentsPage />);
    await screen.findAllByText("Amina Yakubu");

    await userEvent.click(screen.getByRole("button", { name: /print register/i }));
    const dialog = await screen.findByRole("dialog");

    tauri.dialog.save.mockResolvedValueOnce(null); // user cancels the native dialog
    await userEvent.click(within(dialog).getByRole("button", { name: /^export$/i }));

    await waitFor(() => expect(tauri.dialog.save).toHaveBeenCalled());
    expect(tauri.core.invoke).not.toHaveBeenCalledWith("save_binary_file", expect.anything());
    expect(screen.getByRole("dialog")).toBeInTheDocument(); // stays open
  });

  it("hides the delete action for a teacher account", async () => {
    const { StudentsPage } = await import("@/features/students/StudentsPage");
    renderWithProviders(<StudentsPage />, { authUser: { id: 2, username: "obed", role: "teacher" } });

    await screen.findAllByText("Amina Yakubu");
    expect(screen.queryByRole("button", { name: /^delete$/i })).not.toBeInTheDocument();
    expect(screen.queryAllByLabelText("Delete")).toHaveLength(0);
    // still allowed: add/edit
    expect(screen.getByRole("button", { name: /add student/i })).toBeInTheDocument();
    expect(screen.getAllByLabelText("Edit").length).toBeGreaterThan(0);
  });

  it("remembers the search filter across a navigate-away-and-back", async () => {
    const { StudentsPage } = await import("@/features/students/StudentsPage");
    const first = renderWithProviders(<StudentsPage />);
    await screen.findAllByText("Amina Yakubu");

    await userEvent.type(screen.getByPlaceholderText(/search name/i), "bilal");
    await waitFor(() => expect(screen.queryAllByText("Amina Yakubu")).toHaveLength(0));

    // simulate leaving the page (e.g. clicking a different sidebar item)
    // and coming back to it, which fully unmounts and remounts the page
    first.unmount();
    renderWithProviders(<StudentsPage />);

    await screen.findAllByText("Bilal Osei");
    expect(screen.queryAllByText("Amina Yakubu")).toHaveLength(0); // filter still applied
    expect(screen.getByPlaceholderText(/search name/i)).toHaveValue("bilal");
  });
});

// ── Attendance ───────────────────────────────────────────────────────────────

describe("Attendance register", () => {
  beforeEach(() => {
    baseFixtures();
    db.on(/a\.status AS mark FROM students s/i, () => [
      { id: 1, student_code: "MNA-0001", full_name: "Amina Yakubu", class_name: "Class 2", mark: null },
      { id: 2, student_code: "MNA-0002", full_name: "Bilal Osei", class_name: "Class 1", mark: null },
    ]);
  });

  it("marks a student present and saves an upsert", async () => {
    const { AttendancePage } = await import("@/features/attendance/AttendancePage");
    renderWithProviders(<AttendancePage />);

    const row = (await screen.findByText("Amina Yakubu")).closest("li")!;
    await userEvent.click(within(row).getByRole("button", { name: "Present" }));

    const save = screen.getByRole("button", { name: /save attendance/i });
    await waitFor(() => expect(save).toBeEnabled());
    await userEvent.click(save);

    await waitFor(() => {
      const stmts = db.executed();
      expect(stmts.some((s) => s.startsWith("INSERT INTO attendance") && s.includes("ON CONFLICT(student_id, date)"))).toBe(true);
    });
  });
});

// ── Results ──────────────────────────────────────────────────────────────────

describe("Results entry", () => {
  beforeEach(() => {
    baseFixtures();
    db.on(/FROM students s LEFT JOIN results r/i, () => [
      { student_id: 1, student_code: "MNA-0001", full_name: "Amina Yakubu", ca_mark: null, exam_mark: null, teacher_remark: null },
    ]);
  });

  it("computes a live weighted total and grade, then saves", async () => {
    const { ResultsPage } = await import("@/features/results/ResultsPage");
    renderWithProviders(<ResultsPage />);

    const row = (await screen.findByText("Amina Yakubu")).closest("tr")!;
    const inputs = within(row).getAllByRole("textbox");
    await userEvent.type(inputs[0], "50"); // CA
    await userEvent.type(inputs[1], "90"); // Exam

    // 50*0.3 + 90*0.7 = 78 -> B
    await waitFor(() => {
      expect(within(row).getByText("78")).toBeInTheDocument();
      expect(within(row).getByText("B")).toBeInTheDocument();
    });

    await userEvent.click(screen.getByRole("button", { name: /save results/i }));
    await waitFor(() => {
      const insert = db.executed().find((s) => s.startsWith("INSERT INTO results"));
      expect(insert).toContain("ON CONFLICT(student_id, year_id, subject_id)");
    });
  });

  it("is read-only for a teacher account", async () => {
    const { ResultsPage } = await import("@/features/results/ResultsPage");
    renderWithProviders(<ResultsPage />, {
      authUser: { id: 2, username: "obed", role: "teacher" },
    });

    const row = (await screen.findByText("Amina Yakubu")).closest("tr")!;
    for (const input of within(row).getAllByRole("textbox")) {
      expect(input).toHaveAttribute("readonly");
    }
    expect(screen.queryByRole("button", { name: /save results/i })).not.toBeInTheDocument();
  });

  it("only lists subjects that apply to the selected class", async () => {
    // Class 1 only has Quran; Class 2 also has Tajweed.
    db.on(/subjects s\s+JOIN subject_classes sc/i, (_sql, params) =>
      params[0] === 2
        ? [
            { id: 10, name: "Quran", sort_order: 1 },
            { id: 11, name: "Tajweed", sort_order: 2 },
          ]
        : [{ id: 10, name: "Quran", sort_order: 1 }],
    );

    const { ResultsPage } = await import("@/features/results/ResultsPage");
    renderWithProviders(<ResultsPage />);
    await screen.findByText("Amina Yakubu");

    const subjectSelect = screen.getByLabelText("Subject") as HTMLSelectElement;
    expect(within(subjectSelect).getAllByRole("option").map((o) => o.textContent)).toEqual([
      "Quran",
    ]);

    await userEvent.selectOptions(screen.getByLabelText("Class"), "2");

    await waitFor(() =>
      expect(within(subjectSelect).getAllByRole("option").map((o) => o.textContent)).toEqual([
        "Quran",
        "Tajweed",
      ]),
    );
  });
});

// ── Exam fees ────────────────────────────────────────────────────────────────

describe("Exam fees", () => {
  beforeEach(() => {
    baseFixtures();
    db.on(/FROM students s LEFT JOIN classes cl ON cl\.id = s\.class_id LEFT JOIN exam_fees ef/i, () => [
      { student_id: 1, student_code: "MNA-0001", full_name: "Amina Yakubu", class_name: "Class 2", fee_id: 7, amount_due: 40, amount_paid: 40, receipt_no: "EX-0001", notes: null },
      { student_id: 2, student_code: "MNA-0002", full_name: "Bilal Osei", class_name: "Class 1", fee_id: null, amount_due: 0, amount_paid: 0, receipt_no: null, notes: null },
    ]);
  });

  function paymentFilter() {
    return within(screen.getByText("Payment").parentElement as HTMLElement).getByRole("combobox");
  }

  it("filters by payment status", async () => {
    const { ExamFeesPage } = await import("@/features/exam-fees/ExamFeesPage");
    renderWithProviders(<ExamFeesPage />);

    expect(await screen.findByText("Amina Yakubu")).toBeInTheDocument();
    expect(screen.getByText("Bilal Osei")).toBeInTheDocument();

    await userEvent.selectOptions(paymentFilter(), "unpaid");
    await waitFor(() => expect(screen.queryByText("Amina Yakubu")).not.toBeInTheDocument());
    expect(screen.getByText("Bilal Osei")).toBeInTheDocument();
  });

  it("records a payment against the standard fee (amount due is read-only)", async () => {
    const { ExamFeesPage } = await import("@/features/exam-fees/ExamFeesPage");
    renderWithProviders(<ExamFeesPage />);

    await userEvent.click(await screen.findByText("Bilal Osei"));
    const dialog = await screen.findByRole("dialog");
    const [due, paid] = within(dialog).getAllByRole("textbox");
    expect(due).toHaveValue("GH₵ 40.00");
    expect(due).toHaveAttribute("readonly");

    await userEvent.type(paid, "40");
    await userEvent.click(within(dialog).getByRole("button", { name: /^save$/i }));

    await waitFor(() => {
      const insert = db.executed().find((s) => s.startsWith("INSERT INTO exam_fees"));
      expect(insert).toContain("ON CONFLICT(student_id, year_id)");
    });
  });

  it("makes a past year's records read-only", async () => {
    db.on(/FROM academic_years ORDER BY is_current DESC/i, () => [
      YEAR,
      { id: 2, hijri_label: "1447", gregorian_label: "2024/2025", is_current: 0 },
    ]);

    const { ExamFeesPage } = await import("@/features/exam-fees/ExamFeesPage");
    renderWithProviders(<ExamFeesPage />);
    await screen.findByText("Amina Yakubu");

    expect(screen.queryByText(/not the current academic year/i)).not.toBeInTheDocument();

    await userEvent.selectOptions(screen.getByLabelText("Academic year"), "2");
    await waitFor(() =>
      expect(screen.getByText(/not the current academic year/i)).toBeInTheDocument(),
    );

    await userEvent.click(screen.getByText("Bilal Osei"));
    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).getByText(/viewing only/i)).toBeInTheDocument();
    const [, paid] = within(dialog).getAllByRole("textbox");
    expect(paid).toHaveAttribute("readonly");
    expect(within(dialog).queryByRole("button", { name: /^save$/i })).not.toBeInTheDocument();
  });
});

// ── Dashboard ────────────────────────────────────────────────────────────────

describe("Dashboard", () => {
  beforeEach(() => {
    baseFixtures();
    db.on(/COUNT\(\*\) AS total, COALESCE\(SUM\(status = 'Active'\), 0\) AS active FROM students/i, () => [{ total: 48, active: 47 }]);
    db.on(/COUNT\(\*\) AS n FROM teachers/i, () => [{ n: 6 }]);
    db.on(/COUNT\(s\.id\) AS n FROM classes c/i, () => [{ name: "Class 2", n: 15 }]);
    db.on(/AS v FROM fee_payments/i, () => [{ v: 120 }]);
    db.on(/AS v FROM attendance a WHERE a\.status = 'Present'/i, () => [{ v: 300 }]);
    db.on(/AS v FROM exam_fees/i, () => [{ v: 80 }]);
    db.on(/AS present, COUNT\(\*\) AS total FROM attendance a WHERE 1 = 1/i, () => [{ present: 25, total: 35 }]);
    db.on(/COUNT\(a\.id\) AS total FROM classes c/i, () => [{ name: "Class 2", present: 25, total: 35 }]);
    db.on(/COUNT\(\*\) AS n FROM results/i, () => [{ n: 12 }]);
    db.on(/FROM results r JOIN students s ON s\.id = r\.student_id/i, () => [
      { subject_id: 10, class_id: 2, ca_mark: 80, exam_mark: 80 },
    ]);
  });

  it("shows headline figures", async () => {
    const { DashboardPage } = await import("@/features/dashboard/DashboardPage");
    renderWithProviders(<DashboardPage />);

    expect(await screen.findByText("47")).toBeInTheDocument(); // active students
    expect(screen.getByText("48 on the register")).toBeInTheDocument();
    expect(screen.getByText("GH₵ 200.00")).toBeInTheDocument(); // 120 tuition + 80 exam
    // one A grade from 80/80
    expect(screen.getByText("Grade A").closest("li")).toHaveTextContent("1");
  });
});

// ── Student detail ───────────────────────────────────────────────────────────

describe("Student detail page", () => {
  beforeEach(() => {
    baseFixtures();
    db.on(/FROM students s LEFT JOIN classes c ON c\.id = s\.class_id WHERE s\.id/i, () => [
      { id: 1, student_code: "MNA-0001", admission_no: "MNA1", full_name: "Amina Yakubu", class_id: 2, class_name: "Class 2", status: "Active", gender: "Female", dob: "2011-03-18", contact: "+233244000001", guardian: "Yakubu", emergency_contact: null, address: null, notes: null, photo_path: null, date_admitted: "2021-09-01" },
    ]);
    db.on(/AS present, COALESCE\(SUM\(status = 'Absent'\), 0\) AS absent FROM attendance/i, () => [{ present: 10, absent: 2 }]);
    db.on(/SELECT date, status FROM attendance WHERE student_id/i, () => [{ date: "2026-09-01", status: "Present" }]);
    db.on(/FROM student_enrollments e/i, () => []);
    db.on(/FROM attendance a WHERE a\.student_id = 1/i, () => []); // ledger charges
    db.on(/FROM fee_payments WHERE student_id = 1/i, () => []);
    // Year-aware: year 1 (current, per baseFixtures) is paid in full; year 2
    // (added per-test for the year-switcher test below) is unpaid.
    db.on(/FROM exam_fees WHERE student_id = \? AND year_id = \?/i, (_sql, params) =>
      params[1] === 2
        ? [{ amount_due: 40, amount_paid: 0, receipt_no: null, notes: null }]
        : [{ amount_due: 40, amount_paid: 40, receipt_no: "EX-0001", notes: null }],
    );
    db.on(/FROM students s LEFT JOIN classes cl ON cl\.id = s\.class_id\s+WHERE s\.class_id = \?/i, () => [
      { student_id: 1, student_code: "MNA-0001", full_name: "Amina Yakubu", gender: "Female", class_name: "Class 2", photo_path: null },
    ]);
    db.on(/FROM results r JOIN students s ON s\.id = r\.student_id WHERE s\.class_id/i, () => [
      { student_id: 1, subject_id: 10, ca_mark: 80, exam_mark: 80, teacher_remark: null },
    ]);
    db.on(/AS present, .*absent FROM students s LEFT JOIN attendance a/i, () => [{ student_id: 1, present: 10, absent: 2 }]);
    db.on(/FROM report_card_remarks rc JOIN students s/i, () => []);
  });

  it("renders profile, admission number and computed performance", async () => {
    const { StudentDetailPage } = await import("@/features/students/StudentDetailPage");
    renderWithProviders(<StudentDetailPage />, { route: "/students/1", path: "/students/:id" });

    expect(await screen.findByRole("heading", { name: "Amina Yakubu" })).toBeInTheDocument();
    expect(screen.getByText("Admission no.")).toBeInTheDocument();
    expect(screen.getByText("MNA1")).toBeInTheDocument();
    // The exam-fee card resolves once the page's own year-filter state settles
    // (defaults to the current year, one tick after the year query resolves).
    expect(await screen.findByText("Paid in full")).toBeInTheDocument();

    // 80/80 with 30/70 weights -> 80, grade A, appears in the performance table
    await waitFor(() => {
      const quranRow = screen.getByText("Quran").closest("tr")!;
      const cells = within(quranRow).getAllByRole("cell");
      expect(cells[3]).toHaveTextContent("80"); // Total
      expect(cells[4]).toHaveTextContent("A"); // Grade
    });
  });

  it("switches to a past academic year without touching the global current year", async () => {
    db.on(/FROM academic_years ORDER BY is_current DESC/i, () => [
      { id: 1, hijri_label: "1448", gregorian_label: "2026/2027", is_current: 1, start_date: null, end_date: null },
      { id: 2, hijri_label: "1447", gregorian_label: "2025/2026", is_current: 0, start_date: null, end_date: null },
    ]);

    const { StudentDetailPage } = await import("@/features/students/StudentDetailPage");
    renderWithProviders(<StudentDetailPage />, { route: "/students/1", path: "/students/:id" });

    // starts on the current year, no "viewing a past year" banner
    expect(await screen.findByText("Paid in full")).toBeInTheDocument();
    expect(screen.queryByText(/not the current academic year/i)).not.toBeInTheDocument();

    await userEvent.selectOptions(screen.getByLabelText("Academic year"), "2");

    await waitFor(() =>
      expect(screen.getByText(/not the current academic year/i)).toBeInTheDocument(),
    );
    expect(await screen.findByText("Unpaid")).toBeInTheDocument();
  });

  it("shows balances across years and applies an exam-fee credit forward", async () => {
    db.on(/FROM academic_years ORDER BY is_current DESC/i, () => [
      { id: 1, hijri_label: "1448", gregorian_label: "2026/2027", is_current: 1, start_date: null, end_date: null },
      { id: 2, hijri_label: "1447", gregorian_label: "2025/2026", is_current: 0, start_date: null, end_date: null },
    ]);
    // Year 2 (older, per gregorian_label) overpaid its exam fee by 5; year 1
    // (current, the chronologically-next year) still owes its full 10.
    db.on(/ay\.id AS year_id/i, () => [
      { year_id: 2, hijri_label: "1447", gregorian_label: "2025/2026", is_current: 0, tuition_due: 0, tuition_paid: 0, exam_due: 10, exam_paid: 15 },
      { year_id: 1, hijri_label: "1448", gregorian_label: "2026/2027", is_current: 1, tuition_due: 0, tuition_paid: 0, exam_due: 10, exam_paid: 0 },
    ]);

    const { StudentDetailPage } = await import("@/features/students/StudentDetailPage");
    renderWithProviders(<StudentDetailPage />, { route: "/students/1", path: "/students/:id" });
    await screen.findAllByText("Amina Yakubu");

    const balancesHeading = await screen.findByRole("heading", { name: "Balances across years" });
    const balancesCard = balancesHeading.closest(".rounded-xl") as HTMLElement;
    // (?!\s+to) excludes the "Apply GH₵ 5.00 credit to 1448 AH" button, which
    // shares the same substring as the balance stat sitting next to it.
    const pastRow = within(balancesCard).getByText("1447 AH").closest("li") as HTMLElement;
    expect(within(pastRow).getByText(/GH₵ 5\.00 credit(?!\s+to)/)).toBeInTheDocument();
    const currentRow = within(balancesCard).getByText("1448 AH").closest("li") as HTMLElement;
    expect(within(currentRow).getByText(/GH₵ 10\.00 owing/)).toBeInTheDocument();

    await userEvent.click(
      within(pastRow).getByRole("button", { name: /apply gh₵ 5\.00 credit to 1448 ah/i }),
    );
    const dialog = await screen.findByRole("dialog");
    expect(
      within(dialog).getByText(/GH₵ 5\.00 overpaid in 1447 AH will move to 1448 AH/i),
    ).toBeInTheDocument();

    await userEvent.click(within(dialog).getByRole("button", { name: /apply credit/i }));

    await waitFor(() => {
      const update = db.executed().find((s) => s.startsWith("UPDATE exam_fees"));
      const insert = db.executed().find((s) => s.startsWith("INSERT INTO exam_fees"));
      expect(update).toBeTruthy();
      expect(insert).toContain("ON CONFLICT(student_id, year_id)");
    });
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
  });
});

// ── Teacher detail ───────────────────────────────────────────────────────────

describe("Teacher detail page", () => {
  beforeEach(() => {
    baseFixtures();
    db.on(/SELECT \* FROM teachers WHERE id/i, () => [
      { id: 1, teacher_code: "MNA-T001", name: "Ustadh Yusuf", contact: "+233244555000", status: "Active", date_joined: "2020-09-01", notes: "Head of Qur'an" },
    ]);
    db.on(/GROUP_CONCAT\(DISTINCT sub\.name\) AS subjects/i, () => [
      { class_id: 2, class_name: "Class 2", subjects: "Quran,Tajweed", students: 15 },
    ]);
    db.on(/FROM teacher_assignments ta JOIN classes c ON c\.id = ta\.class_id JOIN subjects s ON s\.id = ta\.subject_id/i, () => [
      { id: 1, teacher_id: 1, class_id: 2, subject_id: 10, class_name: "Class 2", subject_name: "Quran" },
      { id: 2, teacher_id: 1, class_id: 2, subject_id: 11, class_name: "Class 2", subject_name: "Tajweed" },
    ]);
  });

  it("renders the teacher profile and teaching load", async () => {
    const { TeacherDetailPage } = await import("@/features/teachers/TeacherDetailPage");
    renderWithProviders(<TeacherDetailPage />, { route: "/teachers/1", path: "/teachers/:id" });

    expect(await screen.findByRole("heading", { name: "Ustadh Yusuf" })).toBeInTheDocument();
    expect(screen.getAllByText("MNA-T001").length).toBeGreaterThan(0);
    expect(screen.getByText("Head of Qur'an")).toBeInTheDocument();

    await waitFor(() => {
      const classRow = screen.getByText("Class 2").closest("li")!;
      expect(within(classRow).getByText("Quran, Tajweed")).toBeInTheDocument();
      expect(within(classRow).getByText("15")).toBeInTheDocument();
    });
  });

  it("hides the edit action for a teacher account", async () => {
    const { TeacherDetailPage } = await import("@/features/teachers/TeacherDetailPage");
    renderWithProviders(<TeacherDetailPage />, {
      route: "/teachers/1",
      path: "/teachers/:id",
      authUser: { id: 2, username: "obed", role: "teacher" },
    });

    expect(await screen.findByRole("heading", { name: "Ustadh Yusuf" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /^edit$/i })).not.toBeInTheDocument();
  });
});

// ── Fees (tuition ledger) ────────────────────────────────────────────────────

describe("Fees page", () => {
  beforeEach(() => {
    baseFixtures();
    db.on(/COALESCE\(\(SELECT SUM\(.*\) FROM attendance a WHERE a\.student_id = s\.id/is, () => [
      { id: 1, student_code: "MNA-0001", full_name: "Amina Yakubu", class_name: "Class 2", due: 15, paid: 5 },
    ]);
    // the ledger drawer recomputes due/paid from its own queries
    db.on(/SELECT date, rate, dow FROM \(/is, () => [
      { date: "2026-09-05", rate: 5, dow: 6 },
      { date: "2026-09-06", rate: 5, dow: 0 },
      { date: "2026-09-12", rate: 5, dow: 6 },
    ]);
    db.on(/FROM fee_payments WHERE student_id = 1/i, () => [
      { id: 1, date: "2026-09-06", amount: 5, note: null, receipt_no: "F-0001" },
    ]);
    db.on(/SELECT receipt_no FROM fee_payments/i, () => [{ receipt_no: "F-0001" }]);
  });

  it("shows balances and records a payment from the ledger drawer", async () => {
    const { FeesPage } = await import("@/features/fees/FeesPage");
    renderWithProviders(<FeesPage />);

    await userEvent.click(await screen.findByText("Amina Yakubu"));
    const drawer = await screen.findByRole("dialog");
    expect(within(drawer).getByText("GH₵ 10.00")).toBeInTheDocument(); // balance = 15 - 5

    await userEvent.type(within(drawer).getByLabelText(/amount/i), "10");
    await userEvent.click(within(drawer).getByRole("button", { name: /record payment/i }));

    await waitFor(() => {
      const insert = db.executed().find((s) => s.startsWith("INSERT INTO fee_payments"));
      expect(insert).toBeTruthy();
    });
  });

  it("lets a teacher record a payment but not delete one", async () => {
    const { FeesPage } = await import("@/features/fees/FeesPage");
    renderWithProviders(<FeesPage />, {
      authUser: { id: 2, username: "obed", role: "teacher" },
    });

    await userEvent.click(await screen.findByText("Amina Yakubu"));
    const drawer = await screen.findByRole("dialog");

    expect(within(drawer).getByRole("button", { name: /record payment/i })).toBeInTheDocument();
    expect(within(drawer).queryByLabelText("Delete payment")).not.toBeInTheDocument();
  });
});

// ── Settings: academic years ─────────────────────────────────────────────────

describe("Settings — academic years", () => {
  beforeEach(() => {
    baseFixtures();
    db.on(/FROM academic_years ORDER BY is_current DESC/i, () => [
      { id: 1, gregorian_label: "2025/2026", hijri_label: "1447", start_date: null, end_date: null, is_current: 1 },
    ]);
    db.on(/SELECT COUNT\(\*\) AS c FROM academic_years/i, () => [{ c: 1 }]);
  });

  it("adds a new academic year", async () => {
    const { AcademicYearsSection } = await import("@/features/settings/AcademicYearsSection");
    renderWithProviders(<AcademicYearsSection />);

    await userEvent.click(await screen.findByRole("button", { name: /add year/i }));
    const dialog = await screen.findByRole("dialog");
    // both label fields are pre-filled with suggestions; just submit
    await userEvent.click(within(dialog).getByRole("button", { name: /add year/i }));

    await waitFor(() => {
      expect(db.executed().some((s) => s.startsWith("INSERT INTO academic_years"))).toBe(true);
    });
  });
});

// ── Settings: grading weight overrides ───────────────────────────────────────

describe("Settings — weight overrides", () => {
  beforeEach(() => {
    baseFixtures();
    db.on(/FROM weight_overrides/i, () => []);
  });

  it("adds a class override with an upsert", async () => {
    const { WeightOverridesSection } = await import("@/features/settings/WeightOverridesSection");
    renderWithProviders(<WeightOverridesSection />);

    await screen.findByRole("option", { name: "Class 1" });
    await userEvent.selectOptions(screen.getByLabelText("Class"), "1");
    await userEvent.clear(screen.getByLabelText("CA %"));
    await userEvent.type(screen.getByLabelText("CA %"), "40");
    await userEvent.clear(screen.getByLabelText("Exam %"));
    await userEvent.type(screen.getByLabelText("Exam %"), "60");
    await userEvent.click(screen.getByRole("button", { name: /^add$/i }));

    await waitFor(() => {
      const insert = db.executed().find((s) => s.startsWith("INSERT INTO weight_overrides"));
      expect(insert).toContain("ON CONFLICT(scope, ref_id)");
    });
  });
});

describe("Settings — subjects", () => {
  beforeEach(() => {
    baseFixtures();
    db.on(/SELECT \* FROM subjects ORDER BY sort_order, name/i, () => [
      { id: 10, name: "Quran", sort_order: 1 },
    ]);
    // Quran currently applies to Class 1 only (of the 2 fixture classes).
    db.on(/SELECT subject_id, class_id FROM subject_classes/i, () => [
      { subject_id: 10, class_id: 1 },
    ]);
  });

  it("updates which classes a subject applies to", async () => {
    const { SubjectsSection } = await import("@/features/settings/SubjectsSection");
    renderWithProviders(<SubjectsSection />);

    await userEvent.click(await screen.findByRole("button", { name: /1 of 2 classes/i }));
    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).getByLabelText("Class 1")).toBeChecked();
    expect(within(dialog).getByLabelText("Class 2")).not.toBeChecked();

    await userEvent.click(within(dialog).getByLabelText("Class 2"));
    await userEvent.click(within(dialog).getByRole("button", { name: /^save$/i }));

    await waitFor(() => {
      expect(db.executed()).toContain("DELETE FROM subject_classes WHERE subject_id = ?");
    });
    const inserts = db.executed().filter((s) => s.startsWith("INSERT INTO subject_classes"));
    expect(inserts).toHaveLength(2); // Class 1 (kept) + Class 2 (newly checked)
  });
});

describe("Settings — security", () => {
  beforeEach(() => {
    baseFixtures();
    db.on(/SELECT id, username, role, created_at FROM users/i, () => [
      { id: 1, username: "test-admin", role: "admin", created_at: "2026-01-01" },
    ]);
  });

  it("creates a teacher account", async () => {
    tauri.onInvoke("create_user", () => undefined);
    const { SecuritySection } = await import("@/features/settings/SecuritySection");
    renderWithProviders(<SecuritySection />);

    await screen.findByText("test-admin");
    await userEvent.type(screen.getByLabelText("Username"), "yusuf");
    await userEvent.type(screen.getByLabelText("Password"), "secret1");
    // Role select defaults to "teacher" already.
    await userEvent.click(screen.getByRole("button", { name: /add account/i }));

    await waitFor(() =>
      expect(tauri.core.invoke).toHaveBeenCalledWith("create_user", {
        username: "yusuf",
        password: "secret1",
        role: "teacher",
      }),
    );
  });

  it("changes the signed-in user's own password", async () => {
    tauri.onInvoke("change_password", () => undefined);
    const { SecuritySection } = await import("@/features/settings/SecuritySection");
    renderWithProviders(<SecuritySection />);

    await screen.findByText(/signed in as test-admin/i);
    await userEvent.type(screen.getByLabelText("Current password"), "old-pass");
    await userEvent.type(screen.getByLabelText("New password"), "new-secret");
    await userEvent.type(screen.getByLabelText("Confirm new password"), "new-secret");
    await userEvent.click(screen.getByRole("button", { name: /change password/i }));

    await waitFor(() =>
      expect(tauri.core.invoke).toHaveBeenCalledWith("change_password", {
        userId: 1,
        currentPassword: "old-pass",
        newPassword: "new-secret",
      }),
    );
  });
});

// ── Students: promotion ─────────────────────────────────────────────────────

describe("Students — promotion", () => {
  beforeEach(() => {
    baseFixtures();
    db.on(/FROM students s LEFT JOIN classes c/i, () => [
      { id: 1, student_code: "MNA-0001", admission_no: "MNA1", full_name: "Amina Yakubu", class_id: 1, class_name: "Class 1", status: "Active", guardian: null, contact: null, gender: "Female", photo_path: null },
    ]);
    db.on(/SELECT student_code FROM students/i, () => [{ student_code: "MNA-0001" }]);
  });

  it("promotes a selected student to the next class", async () => {
    const { StudentsPage } = await import("@/features/students/StudentsPage");
    renderWithProviders(<StudentsPage />);

    await screen.findAllByText("Amina Yakubu");
    await userEvent.click(screen.getAllByRole("checkbox", { name: /select amina/i })[0]);
    await userEvent.click(screen.getByRole("button", { name: /promote to next class/i }));

    const dialog = await screen.findByRole("dialog");
    await userEvent.click(within(dialog).getByRole("button", { name: /promote 1/i }));

    await waitFor(() => {
      const upd = db.executed().find((s) => s.startsWith("UPDATE students SET class_id"));
      expect(upd).toBeTruthy();
    });
  });
});

// ── Backup & Recovery ───────────────────────────────────────────────────────

describe("Backup page", () => {
  beforeEach(() => {
    tauri.onInvoke("database_info", () => ({
      path: "/data/mna.db",
      size_bytes: 40960,
      schema_version: 2,
    }));
    tauri.onInvoke("list_backups", () => []);
    tauri.onInvoke("backup_database", () => 40960);
  });

  it("shows database info and downloads a backup through the save dialog", async () => {
    const { BackupPage } = await import("@/features/backup/BackupPage");
    renderWithProviders(<BackupPage />);

    expect(await screen.findByText("/data/mna.db")).toBeInTheDocument();
    expect(screen.getByText("v2")).toBeInTheDocument();

    tauri.dialog.save.mockResolvedValueOnce("/somewhere/mna-backup.db");
    await userEvent.click(screen.getByRole("button", { name: /download database file/i }));

    await waitFor(() => {
      expect(tauri.core.invoke).toHaveBeenCalledWith("backup_database", {
        destPath: "/somewhere/mna-backup.db",
      });
    });
  });
});

// ── Report Cards ─────────────────────────────────────────────────────────────

describe("Report Cards", () => {
  beforeEach(() => {
    baseFixtures();
    // Discriminates by classId (params[0]) — a page that ever defaults to
    // the wrong class (e.g. classes[0] instead of a deep-linked one) would
    // show Zainab instead of Amina/Bilal, making that class of bug visible
    // to these tests rather than silently masked by a static fixture.
    db.on(/FROM students s LEFT JOIN classes cl ON cl\.id = s\.class_id\s+WHERE s\.class_id = \?/i, (_sql, params) =>
      params[0] === 2
        ? [
            { student_id: 1, student_code: "MNA-0001", full_name: "Amina Yakubu", gender: "Female", class_name: "Class 2", photo_path: "/photos/amina.png" },
            { student_id: 2, student_code: "MNA-0002", full_name: "Bilal Osei", gender: "Male", class_name: "Class 2", photo_path: null },
          ]
        : [
            { student_id: 3, student_code: "MNA-0003", full_name: "Zainab Adam", gender: "Female", class_name: "Class 1", photo_path: null },
          ],
    );
    db.on(/FROM results r JOIN students s ON s\.id = r\.student_id WHERE s\.class_id/i, () => [
      { student_id: 1, subject_id: 10, ca_mark: 80, exam_mark: 80, teacher_remark: null },
    ]);
    db.on(/LEFT JOIN attendance a ON a\.student_id = s\.id AND a\.year_id/i, () => [
      { student_id: 1, present: 10, absent: 2 },
    ]);
    db.on(/FROM report_card_remarks rc JOIN students s/i, () => []);
  });

  it("shows the student's photo when one exists", async () => {
    const { ReportCardPage } = await import("@/features/report-cards/ReportCardPage");
    renderWithProviders(<ReportCardPage />, { route: "/report-cards?class=2" });

    // wait for the actual rendered card, not just the name appearing in the
    // Student <select> (which populates before the heavier gradebook
    // sub-queries — results/attendance/remarks — finish resolving).
    await waitFor(() => expect(document.querySelector(".report-card")).toBeTruthy());
    const box = screen.getByTestId("student-photo-box");
    const img = box.querySelector("img");
    expect(img).toBeTruthy();
    expect(img!.src).toContain("test-asset://");
    expect(img!.src).toContain("amina.png");
  });

  it("shows a placeholder graphic when the student has no photo", async () => {
    const { ReportCardPage } = await import("@/features/report-cards/ReportCardPage");
    renderWithProviders(<ReportCardPage />, { route: "/report-cards?class=2" });

    await screen.findByText("Amina Yakubu");
    await userEvent.selectOptions(screen.getByLabelText("Student"), "2");

    await waitFor(() => {
      const card = document.querySelector(".report-card")!;
      expect(within(card as HTMLElement).getByText("Bilal Osei")).toBeInTheDocument();
    });
    const img = screen.getByTestId("student-photo-box").querySelector("img");
    expect(img).toBeTruthy();
    // the placeholder is a bundled asset, never run through convertFileSrc
    expect(img!.src).not.toContain("test-asset://");
  });

  it("lands directly on the deep-linked student, without needing to reselect", async () => {
    const { ReportCardPage } = await import("@/features/report-cards/ReportCardPage");
    renderWithProviders(<ReportCardPage />, {
      route: "/report-cards?class=2&student=2&year=1",
    });

    // Bilal (student=2) shows immediately — never Amina (the roster's first
    // student, which the "default to gb.students[0]" effect would otherwise
    // have raced to pick before the deep link applied). The Student <select>
    // legitimately lists both names as options, so scope to the rendered
    // card itself rather than the whole page.
    await waitFor(() => {
      const card = document.querySelector(".report-card") as HTMLElement;
      expect(within(card).getByText("Bilal Osei")).toBeInTheDocument();
      expect(within(card).queryByText("Amina Yakubu")).not.toBeInTheDocument();
    });
  });
});

// ── Role-based navigation ────────────────────────────────────────────────────

describe("Role-based navigation", () => {
  it("hides Settings and Backup from a teacher's sidebar", async () => {
    const { Sidebar } = await import("@/app/Sidebar");
    renderWithProviders(<Sidebar collapsed={false} />, {
      authUser: { id: 2, username: "obed", role: "teacher" },
    });
    expect(screen.queryByText("Settings")).not.toBeInTheDocument();
    expect(screen.queryByText("Backup & Recovery")).not.toBeInTheDocument();
    expect(screen.getByText("Students")).toBeInTheDocument();
  });

  it("shows Settings and Backup for an admin", async () => {
    const { Sidebar } = await import("@/app/Sidebar");
    renderWithProviders(<Sidebar collapsed={false} />);
    expect(screen.getByText("Settings")).toBeInTheDocument();
    expect(screen.getByText("Backup & Recovery")).toBeInTheDocument();
  });

  it("redirects a teacher away from an admin-only route", async () => {
    const { RequireAdmin } = await import("@/features/auth/RequireAdmin");
    renderWithProviders(
      <Routes>
        <Route
          path="/settings"
          element={
            <RequireAdmin>
              <div>SETTINGS PAGE</div>
            </RequireAdmin>
          }
        />
        <Route path="/dashboard" element={<div>DASHBOARD PAGE</div>} />
      </Routes>,
      { route: "/settings", authUser: { id: 2, username: "obed", role: "teacher" } },
    );
    expect(await screen.findByText("DASHBOARD PAGE")).toBeInTheDocument();
    expect(screen.queryByText("SETTINGS PAGE")).not.toBeInTheDocument();
  });

  it("lets an admin through to an admin-only route", async () => {
    const { RequireAdmin } = await import("@/features/auth/RequireAdmin");
    renderWithProviders(
      <Routes>
        <Route
          path="/settings"
          element={
            <RequireAdmin>
              <div>SETTINGS PAGE</div>
            </RequireAdmin>
          }
        />
        <Route path="/dashboard" element={<div>DASHBOARD PAGE</div>} />
      </Routes>,
      { route: "/settings" },
    );
    expect(await screen.findByText("SETTINGS PAGE")).toBeInTheDocument();
  });
});
