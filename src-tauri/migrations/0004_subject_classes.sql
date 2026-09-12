-- Phase: per-class subject applicability.
--
-- subjects.applies_to existed since v1 but was never read anywhere in the
-- app — every subject applied to every class unconditionally. Replacing it
-- with a proper many-to-many join so a subject can apply to any specific
-- set of classes (e.g. Class 1 has fewer subjects than Class 6).

CREATE TABLE subject_classes (
  subject_id INTEGER NOT NULL REFERENCES subjects(id) ON DELETE CASCADE,
  class_id   INTEGER NOT NULL REFERENCES classes(id) ON DELETE CASCADE,
  PRIMARY KEY (subject_id, class_id)
);
CREATE INDEX idx_subject_classes_class ON subject_classes(class_id);

-- Preserve today's behaviour exactly (every subject applies to every class)
-- before dropping the column that used to (nominally) say so.
INSERT INTO subject_classes (subject_id, class_id)
SELECT s.id, c.id FROM subjects s CROSS JOIN classes c;

ALTER TABLE subjects DROP COLUMN applies_to;

UPDATE meta SET value = '4' WHERE key = 'schema_version';
