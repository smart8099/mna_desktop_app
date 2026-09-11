-- Phase 4 performance pass: indexes for the year-scoped aggregate queries the
-- Dashboard, Fees and student-detail screens run (previously unindexed scans).

CREATE INDEX idx_attendance_student_year ON attendance(student_id, year_id);
CREATE INDEX idx_attendance_year ON attendance(year_id);
CREATE INDEX idx_fee_payments_year ON fee_payments(year_id);
CREATE INDEX idx_exam_fees_year ON exam_fees(year_id);
CREATE INDEX idx_results_student ON results(student_id);

UPDATE meta SET value = '3' WHERE key = 'schema_version';
