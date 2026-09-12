-- Phase: login + role-based access (admin / teacher) + critical-action
-- step-up confirmation.
--
-- `users` has existed since v1, reserved and completely unused (0 rows,
-- never written to by the app) — safe to rebuild rather than migrate data.
-- Adds a recovery-code hash (shown once at setup, used to reset a forgotten
-- password) and constrains role to the two supported values.

DROP TABLE users;
CREATE TABLE users (
  id                 INTEGER PRIMARY KEY AUTOINCREMENT,
  username           TEXT NOT NULL UNIQUE,
  password_hash      TEXT NOT NULL,
  role               TEXT NOT NULL DEFAULT 'admin' CHECK (role IN ('admin', 'teacher')),
  recovery_code_hash TEXT,
  created_at         TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Which destructive/financial actions require re-entering the current
-- user's password to confirm, beyond the usual "are you sure?" dialog.
-- Seeded with sensible defaults; toggled from Settings -> Security.
CREATE TABLE critical_actions (
  action_key       TEXT PRIMARY KEY,
  label            TEXT NOT NULL,
  require_password INTEGER NOT NULL DEFAULT 0
);
INSERT INTO critical_actions (action_key, label, require_password) VALUES
  ('delete_student', 'Delete a student', 1),
  ('delete_teacher', 'Delete a teacher', 1),
  ('delete_payment', 'Delete a fee payment', 1),
  ('delete_academic_year', 'Delete an academic year', 1),
  ('delete_class', 'Delete a class', 0),
  ('delete_subject', 'Delete a subject', 0),
  ('restore_database', 'Restore the database from a backup file', 1),
  ('apply_exam_credit', 'Apply an exam-fee credit to another year', 1);

UPDATE meta SET value = '5' WHERE key = 'schema_version';
