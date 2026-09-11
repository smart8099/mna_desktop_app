-- MNA Management System — initial schema (v1)
-- All derived values (grades, positions, balances, dashboard totals) are computed
-- in queries at read time and are never stored here.

PRAGMA foreign_keys = ON;

-- ── meta ─────────────────────────────────────────────────────────────────────
-- Used to validate uploaded database files during restore.
CREATE TABLE meta (
  key   TEXT PRIMARY KEY,
  value TEXT NOT NULL
);
INSERT INTO meta (key, value) VALUES
  ('app', 'mna-management-system'),
  ('schema_version', '1'),
  ('created_at', datetime('now'));

-- ── settings (single row) ────────────────────────────────────────────────────
CREATE TABLE settings (
  id                   INTEGER PRIMARY KEY CHECK (id = 1),
  school_name          TEXT    NOT NULL DEFAULT 'Madrasatul Nurul Absar',
  system_name          TEXT    NOT NULL DEFAULT 'MNA Management System',
  country              TEXT    NOT NULL DEFAULT 'Ghana',
  currency             TEXT    NOT NULL DEFAULT 'GH₵',
  weekend_rate         REAL    NOT NULL DEFAULT 5,   -- Sat/Sun tuition per present day
  vacation_rate        REAL    NOT NULL DEFAULT 3,   -- Mon–Wed tuition per present day, vacation only
  default_ca_weight    REAL    NOT NULL DEFAULT 0.30,
  default_exam_weight  REAL    NOT NULL DEFAULT 0.70,
  updated_at           TEXT    NOT NULL DEFAULT (datetime('now'))
);
INSERT INTO settings (id) VALUES (1);

-- ── academic years (year == term; labelled by Hijri year) ────────────────────
CREATE TABLE academic_years (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  gregorian_label TEXT    NOT NULL,          -- e.g. "2026/2027"
  hijri_label     TEXT    NOT NULL,          -- e.g. "1448"
  start_date      TEXT,                      -- ISO yyyy-mm-dd
  end_date        TEXT,
  is_current      INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE academic_calendar (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  year_id    INTEGER NOT NULL REFERENCES academic_years(id) ON DELETE CASCADE,
  start_date TEXT    NOT NULL,
  end_date   TEXT    NOT NULL,
  type       TEXT    NOT NULL CHECK (type IN ('term', 'vacation')),
  note       TEXT
);
CREATE INDEX idx_calendar_year ON academic_calendar(year_id);

-- ── classes & subjects ──────────────────────────────────────────────────────
CREATE TABLE classes (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  name       TEXT    NOT NULL UNIQUE,
  sort_order INTEGER NOT NULL DEFAULT 0
);
INSERT INTO classes (name, sort_order) VALUES
  ('Class 1', 1), ('Class 2', 2), ('Class 3', 3),
  ('Class 4', 4), ('Class 5', 5), ('Class 6', 6);

CREATE TABLE subjects (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  name       TEXT    NOT NULL UNIQUE,
  sort_order INTEGER NOT NULL DEFAULT 0,
  applies_to TEXT    NOT NULL DEFAULT 'All Classes'
);
INSERT INTO subjects (name, sort_order) VALUES
  ('Arabic Alphabet', 1), ('Quran', 2), ('Arabic Language', 3),
  ('Hadith', 4), ('Seerat', 5), ('Tajweed', 6), ('Fiqh', 7);

-- ── grading weight overrides (subject wins over class wins over settings) ─────
CREATE TABLE weight_overrides (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  scope       TEXT    NOT NULL CHECK (scope IN ('class', 'subject')),
  ref_id      INTEGER NOT NULL,
  ca_weight   REAL    NOT NULL,
  exam_weight REAL    NOT NULL,
  UNIQUE (scope, ref_id)
);

-- ── students ────────────────────────────────────────────────────────────────
CREATE TABLE students (
  id                INTEGER PRIMARY KEY AUTOINCREMENT,
  student_code      TEXT    NOT NULL UNIQUE,      -- e.g. "MNA-0001"
  admission_no      TEXT,
  full_name         TEXT    NOT NULL,
  gender            TEXT    CHECK (gender IN ('Male', 'Female') OR gender IS NULL),
  dob               TEXT,
  address           TEXT,
  contact           TEXT,
  guardian          TEXT,
  emergency_contact TEXT,
  date_admitted     TEXT,
  class_id          INTEGER REFERENCES classes(id),
  status            TEXT    NOT NULL DEFAULT 'Active' CHECK (status IN ('Active', 'Inactive', 'Graduated', 'Withdrawn')),
  photo_path        TEXT,
  notes             TEXT,
  created_at        TEXT    NOT NULL DEFAULT (datetime('now')),
  updated_at        TEXT    NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX idx_students_class ON students(class_id);
CREATE INDEX idx_students_status ON students(status);

-- enrollment history (one row per student per year — survives promotions)
CREATE TABLE student_enrollments (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  student_id INTEGER NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  year_id    INTEGER NOT NULL REFERENCES academic_years(id) ON DELETE CASCADE,
  class_id   INTEGER NOT NULL REFERENCES classes(id),
  UNIQUE (student_id, year_id)
);

-- ── teachers ────────────────────────────────────────────────────────────────
CREATE TABLE teachers (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  teacher_code TEXT    NOT NULL UNIQUE,
  name         TEXT    NOT NULL,
  contact      TEXT,
  status       TEXT    NOT NULL DEFAULT 'Active',
  date_joined  TEXT,
  notes        TEXT
);

CREATE TABLE teacher_assignments (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  teacher_id INTEGER NOT NULL REFERENCES teachers(id) ON DELETE CASCADE,
  class_id   INTEGER NOT NULL REFERENCES classes(id) ON DELETE CASCADE,
  subject_id INTEGER NOT NULL REFERENCES subjects(id) ON DELETE CASCADE,
  year_id    INTEGER REFERENCES academic_years(id) ON DELETE CASCADE,
  UNIQUE (teacher_id, class_id, subject_id, year_id)
);

-- ── attendance ──────────────────────────────────────────────────────────────
CREATE TABLE attendance (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  student_id INTEGER NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  date       TEXT    NOT NULL,               -- ISO yyyy-mm-dd
  status     TEXT    NOT NULL CHECK (status IN ('Present', 'Absent')),
  year_id    INTEGER REFERENCES academic_years(id) ON DELETE SET NULL,
  UNIQUE (student_id, date)
);
CREATE INDEX idx_attendance_date ON attendance(date);

-- ── fees ────────────────────────────────────────────────────────────────────
-- fee_charges are generated from Present attendance days by the fee engine.
CREATE TABLE fee_charges (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  student_id INTEGER NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  date       TEXT    NOT NULL,
  rate       REAL    NOT NULL,
  source     TEXT    NOT NULL DEFAULT 'attendance',
  year_id    INTEGER REFERENCES academic_years(id) ON DELETE SET NULL,
  UNIQUE (student_id, date)
);
CREATE INDEX idx_fee_charges_student ON fee_charges(student_id);

CREATE TABLE fee_payments (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  student_id INTEGER NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  date       TEXT    NOT NULL,
  amount     REAL    NOT NULL,
  note       TEXT,
  receipt_no TEXT,
  year_id    INTEGER REFERENCES academic_years(id) ON DELETE SET NULL,
  created_at TEXT    NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX idx_fee_payments_student ON fee_payments(student_id);

-- ── exam fees ───────────────────────────────────────────────────────────────
CREATE TABLE exam_fees (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  student_id  INTEGER NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  year_id     INTEGER NOT NULL REFERENCES academic_years(id) ON DELETE CASCADE,
  amount_due  REAL    NOT NULL DEFAULT 0,
  amount_paid REAL    NOT NULL DEFAULT 0,
  receipt_no  TEXT,
  notes       TEXT,
  created_at  TEXT    NOT NULL DEFAULT (datetime('now')),
  updated_at  TEXT    NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX idx_exam_fees_student ON exam_fees(student_id);

-- ── results ─────────────────────────────────────────────────────────────────
CREATE TABLE results (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  student_id INTEGER NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  year_id    INTEGER NOT NULL REFERENCES academic_years(id) ON DELETE CASCADE,
  subject_id INTEGER NOT NULL REFERENCES subjects(id) ON DELETE CASCADE,
  ca_mark    REAL CHECK (ca_mark IS NULL OR (ca_mark >= 0 AND ca_mark <= 100)),
  exam_mark  REAL CHECK (exam_mark IS NULL OR (exam_mark >= 0 AND exam_mark <= 100)),
  teacher_remark TEXT,
  UNIQUE (student_id, year_id, subject_id)
);
CREATE INDEX idx_results_year_subject ON results(year_id, subject_id);

CREATE TABLE report_card_remarks (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  student_id     INTEGER NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  year_id        INTEGER NOT NULL REFERENCES academic_years(id) ON DELETE CASCADE,
  general_remark TEXT,
  UNIQUE (student_id, year_id)
);

-- ── users (reserved for Phase 5 — roles/login; unused in v1) ─────────────────
CREATE TABLE users (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  username      TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  role          TEXT NOT NULL DEFAULT 'admin',
  created_at    TEXT NOT NULL DEFAULT (datetime('now'))
);

-- ── audit log ───────────────────────────────────────────────────────────────
CREATE TABLE audit_log (
  id        INTEGER PRIMARY KEY AUTOINCREMENT,
  ts        TEXT NOT NULL DEFAULT (datetime('now')),
  action    TEXT NOT NULL,
  entity    TEXT,
  entity_id TEXT,
  detail    TEXT
);
