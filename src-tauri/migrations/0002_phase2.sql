-- Phase 2 — daily operations.

-- A single standard examination fee, applied per student per academic year.
ALTER TABLE settings ADD COLUMN exam_fee REAL NOT NULL DEFAULT 0;

-- One examination-fee record per student per year.
CREATE UNIQUE INDEX idx_exam_fees_student_year ON exam_fees (student_id, year_id);

UPDATE meta SET value = '2' WHERE key = 'schema_version';
