//! Contract tests for the SQLite schema and the exact SQL the frontend issues.
//!
//! These run against an in-memory database seeded with the real migration, so a
//! change that would break `src/features/**/api.ts` fails here first.

use rusqlite::{params, Connection};

const INIT_SQL: &str = include_str!("../migrations/0001_init.sql");
const PHASE2_SQL: &str = include_str!("../migrations/0002_phase2.sql");
const PHASE3_SQL: &str = include_str!("../migrations/0003_indexes.sql");
const PHASE4_SQL: &str = include_str!("../migrations/0004_subject_classes.sql");

fn db() -> Connection {
    let conn = Connection::open_in_memory().unwrap();
    conn.execute_batch(INIT_SQL).unwrap();
    conn.execute_batch(PHASE2_SQL).unwrap();
    conn.execute_batch(PHASE3_SQL).unwrap();
    conn.execute_batch(PHASE4_SQL).unwrap();
    conn.pragma_update(None, "foreign_keys", true).unwrap();
    conn
}

fn scalar_i64(conn: &Connection, sql: &str) -> i64 {
    conn.query_row(sql, [], |r| r.get(0)).unwrap()
}

// ── migration & seed data ────────────────────────────────────────────────

#[test]
fn migration_creates_every_expected_table() {
    let conn = db();
    let expected = [
        "meta", "settings", "academic_years", "academic_calendar", "classes",
        "subjects", "subject_classes", "weight_overrides", "students", "student_enrollments",
        "teachers", "teacher_assignments", "attendance", "fee_charges", "fee_payments",
        "exam_fees", "results", "report_card_remarks", "users", "audit_log",
    ];
    for t in expected {
        let n = scalar_i64(
            &conn,
            &format!("SELECT COUNT(*) FROM sqlite_master WHERE type='table' AND name='{t}'"),
        );
        assert_eq!(n, 1, "table `{t}` should exist");
    }
}

#[test]
fn seed_data_matches_the_spreadsheet() {
    let conn = db();
    assert_eq!(scalar_i64(&conn, "SELECT COUNT(*) FROM classes"), 6);
    assert_eq!(scalar_i64(&conn, "SELECT COUNT(*) FROM subjects"), 7);
    assert_eq!(scalar_i64(&conn, "SELECT COUNT(*) FROM settings"), 1);

    let subjects: Vec<String> = {
        let mut stmt = conn
            .prepare("SELECT name FROM subjects ORDER BY sort_order")
            .unwrap();
        let rows = stmt.query_map([], |r| r.get::<_, String>(0)).unwrap();
        rows.map(|r| r.unwrap()).collect()
    };
    assert_eq!(
        subjects,
        [
            "Arabic Alphabet", "Quran", "Arabic Language", "Hadith", "Seerat",
            "Tajweed", "Fiqh"
        ]
    );

    let app: String = conn
        .query_row("SELECT value FROM meta WHERE key='app'", [], |r| r.get(0))
        .unwrap();
    assert_eq!(app, "mna-management-system");
    assert_eq!(
        conn.query_row::<String, _, _>(
            "SELECT value FROM meta WHERE key='schema_version'",
            [],
            |r| r.get(0)
        )
        .unwrap(),
        "4"
    );
}

#[test]
fn phase_4_migration_seeds_every_subject_against_every_class() {
    let conn = db();
    let classes = scalar_i64(&conn, "SELECT COUNT(*) FROM classes");
    let subjects = scalar_i64(&conn, "SELECT COUNT(*) FROM subjects");
    let links = scalar_i64(&conn, "SELECT COUNT(*) FROM subject_classes");
    assert_eq!(links, classes * subjects, "every subject should start applying to every class");
}

#[test]
fn a_subject_can_be_restricted_to_a_specific_set_of_classes() {
    let conn = db();
    conn.execute("DELETE FROM subject_classes WHERE subject_id = 1", [])
        .unwrap();
    conn.execute(
        "INSERT INTO subject_classes (subject_id, class_id) VALUES (1, 3)",
        [],
    )
    .unwrap();
    let n = scalar_i64(
        &conn,
        "SELECT COUNT(*) FROM subject_classes WHERE subject_id = 1",
    );
    assert_eq!(n, 1);
}

#[test]
fn deleting_a_class_cascades_out_of_subject_classes() {
    let conn = db();
    conn.execute("DELETE FROM classes WHERE id = 1", []).unwrap();
    let n = scalar_i64(
        &conn,
        "SELECT COUNT(*) FROM subject_classes WHERE class_id = 1",
    );
    assert_eq!(n, 0);
}

#[test]
fn phase_3_migration_adds_the_year_scoped_indexes() {
    let conn = db();
    for idx in [
        "idx_attendance_student_year",
        "idx_attendance_year",
        "idx_fee_payments_year",
        "idx_exam_fees_year",
        "idx_results_student",
    ] {
        let n = scalar_i64(
            &conn,
            &format!("SELECT COUNT(*) FROM sqlite_master WHERE type='index' AND name='{idx}'"),
        );
        assert_eq!(n, 1, "index `{idx}` should exist");
    }
}

#[test]
fn phase_2_migration_adds_the_exam_fee_setting() {
    let conn = db();
    let exam_fee: f64 = conn
        .query_row("SELECT exam_fee FROM settings WHERE id = 1", [], |r| r.get(0))
        .unwrap();
    assert_eq!(exam_fee, 0.0);
}

#[test]
fn exam_fee_is_one_record_per_student_per_year() {
    let conn = db();
    seed_one_student_year_subject(&conn);
    conn.execute(
        "INSERT INTO exam_fees (student_id, year_id, amount_due, amount_paid) VALUES (1, 1, 40, 0)",
        [],
    )
    .unwrap();
    let dup = conn.execute(
        "INSERT INTO exam_fees (student_id, year_id, amount_due, amount_paid) VALUES (1, 1, 40, 10)",
        [],
    );
    assert!(dup.is_err(), "unique index on (student_id, year_id) must hold");
}

/// The daily-tuition engine, expressed as the SQL the Fees screen runs.
#[test]
fn tuition_due_follows_the_weekend_and_vacation_rules() {
    let conn = db();
    seed_one_student_year_subject(&conn); // student id 1, year id 1
    conn.execute(
        "INSERT INTO academic_calendar (year_id, start_date, end_date, type) VALUES (1, '2026-12-14', '2027-01-04', 'vacation')",
        [],
    )
    .unwrap();
    // 2026-12-12 = Saturday (weekend -> 5)
    // 2026-12-14 = Monday inside the vacation period (-> 3)
    // 2026-12-15 = Tuesday inside vacation (-> 3)
    // 2026-11-30 = Monday during term, not vacation (-> 0)
    // 2026-12-18 = Friday inside vacation (-> 0, Fri never charged)
    for d in ["2026-12-12", "2026-12-14", "2026-12-15", "2026-11-30", "2026-12-18"] {
        conn.execute(
            "INSERT INTO attendance (student_id, date, status, year_id) VALUES (1, ?, 'Present', 1)",
            [d],
        )
        .unwrap();
    }
    // one Absent day that would otherwise be chargeable — must not count
    conn.execute(
        "INSERT INTO attendance (student_id, date, status, year_id) VALUES (1, '2026-12-13', 'Absent', 1)",
        [],
    )
    .unwrap();

    let rate_case = "CASE
        WHEN CAST(strftime('%w', a.date) AS INTEGER) IN (0, 6) THEN 5
        WHEN CAST(strftime('%w', a.date) AS INTEGER) IN (1, 2, 3)
             AND EXISTS (SELECT 1 FROM academic_calendar c
                         WHERE c.type = 'vacation' AND a.date BETWEEN c.start_date AND c.end_date)
        THEN 3
        ELSE 0 END";
    let sql = format!(
        "SELECT COALESCE(SUM({rate_case}), 0) FROM attendance a WHERE a.student_id = 1 AND a.status = 'Present'"
    );
    let due: f64 = conn.query_row(&sql, [], |r| r.get(0)).unwrap();
    assert_eq!(due, 5.0 + 3.0 + 3.0); // Sat + vacation Mon + vacation Tue
}

#[test]
fn settings_defaults_match_the_agreed_rules() {
    let conn = db();
    let (wr, vr, ca, ex): (f64, f64, f64, f64) = conn
        .query_row(
            "SELECT weekend_rate, vacation_rate, default_ca_weight, default_exam_weight FROM settings WHERE id=1",
            [],
            |r| Ok((r.get(0)?, r.get(1)?, r.get(2)?, r.get(3)?)),
        )
        .unwrap();
    assert_eq!(wr, 5.0);
    assert_eq!(vr, 3.0);
    assert_eq!(ca, 0.30);
    assert_eq!(ex, 0.70);
}

// ── Settings tab: useUpdateSettings ──────────────────────────────────────

#[test]
fn settings_can_be_updated_in_place() {
    let conn = db();
    conn.execute(
        "UPDATE settings SET weekend_rate = ?, vacation_rate = ?, default_ca_weight = ?, default_exam_weight = ?, updated_at = datetime('now') WHERE id = 1",
        params![6.0, 4.0, 0.4, 0.6],
    )
    .unwrap();
    let (wr, ca): (f64, f64) = conn
        .query_row(
            "SELECT weekend_rate, default_ca_weight FROM settings WHERE id=1",
            [],
            |r| Ok((r.get(0)?, r.get(1)?)),
        )
        .unwrap();
    assert_eq!(wr, 6.0);
    assert_eq!(ca, 0.4);
    assert_eq!(scalar_i64(&conn, "SELECT COUNT(*) FROM settings"), 1, "still one row");
}

// ── Academic Years tab ──────────────────────────────────────────────────

#[test]
fn setting_a_current_year_clears_the_previous_one() {
    let conn = db();
    conn.execute(
        "INSERT INTO academic_years (gregorian_label, hijri_label, start_date, end_date, is_current) VALUES ('2025/2026','1447',NULL,NULL,1)",
        [],
    )
    .unwrap();
    conn.execute(
        "INSERT INTO academic_years (gregorian_label, hijri_label, start_date, end_date, is_current) VALUES ('2026/2027','1448',NULL,NULL,0)",
        [],
    )
    .unwrap();

    // useSetCurrentYear: clear all, then set one
    conn.execute("UPDATE academic_years SET is_current = 0", []).unwrap();
    conn.execute(
        "UPDATE academic_years SET is_current = 1 WHERE id = (SELECT id FROM academic_years WHERE hijri_label='1448')",
        [],
    )
    .unwrap();

    assert_eq!(scalar_i64(&conn, "SELECT COUNT(*) FROM academic_years WHERE is_current=1"), 1);
    let current: String = conn
        .query_row("SELECT hijri_label FROM academic_years WHERE is_current=1", [], |r| r.get(0))
        .unwrap();
    assert_eq!(current, "1448");
}

#[test]
fn deleting_a_year_cascades_to_its_calendar_periods() {
    let conn = db();
    conn.execute(
        "INSERT INTO academic_years (id, gregorian_label, hijri_label, is_current) VALUES (1,'2026/2027','1448',1)",
        [],
    )
    .unwrap();
    conn.execute(
        "INSERT INTO academic_calendar (year_id, start_date, end_date, type, note) VALUES (1,'2026-12-20','2027-01-05','vacation','Xmas break')",
        [],
    )
    .unwrap();
    assert_eq!(scalar_i64(&conn, "SELECT COUNT(*) FROM academic_calendar"), 1);

    conn.execute("DELETE FROM academic_years WHERE id = 1", []).unwrap();
    assert_eq!(scalar_i64(&conn, "SELECT COUNT(*) FROM academic_calendar"), 0);
}

// ── Calendar tab ────────────────────────────────────────────────────────

#[test]
fn calendar_period_type_is_constrained() {
    let conn = db();
    conn.execute(
        "INSERT INTO academic_years (id, gregorian_label, hijri_label, is_current) VALUES (1,'2026/2027','1448',1)",
        [],
    )
    .unwrap();
    let ok = conn.execute(
        "INSERT INTO academic_calendar (year_id, start_date, end_date, type) VALUES (1,'2026-12-20','2027-01-05','vacation')",
        [],
    );
    assert!(ok.is_ok());
    let bad = conn.execute(
        "INSERT INTO academic_calendar (year_id, start_date, end_date, type) VALUES (1,'2026-12-20','2027-01-05','holiday')",
        [],
    );
    assert!(bad.is_err(), "only 'term' or 'vacation' should be accepted");
}

// ── Classes / Subjects tab: useReorderNamed & delete guard ──────────────

#[test]
fn reordering_two_classes_swaps_their_sort_order() {
    let conn = db();
    let (id1, so1): (i64, i64) = conn
        .query_row("SELECT id, sort_order FROM classes WHERE name='Class 1'", [], |r| {
            Ok((r.get(0)?, r.get(1)?))
        })
        .unwrap();
    let (id2, so2): (i64, i64) = conn
        .query_row("SELECT id, sort_order FROM classes WHERE name='Class 2'", [], |r| {
            Ok((r.get(0)?, r.get(1)?))
        })
        .unwrap();

    conn.execute("UPDATE classes SET sort_order = ? WHERE id = ?", params![so2, id1]).unwrap();
    conn.execute("UPDATE classes SET sort_order = ? WHERE id = ?", params![so1, id2]).unwrap();

    let first: String = conn
        .query_row("SELECT name FROM classes ORDER BY sort_order, name LIMIT 1", [], |r| r.get(0))
        .unwrap();
    assert_eq!(first, "Class 2");
}

#[test]
fn a_class_in_use_cannot_be_deleted() {
    let conn = db();
    let class_id: i64 =
        conn.query_row("SELECT id FROM classes WHERE name='Class 3'", [], |r| r.get(0)).unwrap();
    conn.execute(
        "INSERT INTO students (student_code, full_name, class_id) VALUES ('MNA-0001','Test Pupil', ?)",
        params![class_id],
    )
    .unwrap();

    let err = conn.execute("DELETE FROM classes WHERE id = ?", params![class_id]);
    assert!(err.is_err(), "FK from students.class_id should block the delete");
}

#[test]
fn an_unused_subject_can_be_deleted() {
    let conn = db();
    let ok = conn.execute("DELETE FROM subjects WHERE name = 'Fiqh'", []);
    assert_eq!(ok.unwrap(), 1);
}

// ── data-integrity constraints relied on by later phases ────────────────

#[test]
fn result_marks_are_bounded_to_0_100() {
    let conn = db();
    seed_one_student_year_subject(&conn);
    let bad = conn.execute(
        "INSERT INTO results (student_id, year_id, subject_id, ca_mark, exam_mark) VALUES (1,1,1,30,120)",
        [],
    );
    assert!(bad.is_err(), "exam_mark 120 must be rejected");
    let ok = conn.execute(
        "INSERT INTO results (student_id, year_id, subject_id, ca_mark, exam_mark) VALUES (1,1,1,30,95)",
        [],
    );
    assert!(ok.is_ok());
}

#[test]
fn one_result_row_per_student_year_subject() {
    let conn = db();
    seed_one_student_year_subject(&conn);
    conn.execute(
        "INSERT INTO results (student_id, year_id, subject_id, ca_mark, exam_mark) VALUES (1,1,1,10,20)",
        [],
    )
    .unwrap();
    let dup = conn.execute(
        "INSERT INTO results (student_id, year_id, subject_id, ca_mark, exam_mark) VALUES (1,1,1,40,50)",
        [],
    );
    assert!(dup.is_err(), "UNIQUE(student_id, year_id, subject_id) must hold");
}

#[test]
fn attendance_is_one_row_per_student_per_day_and_status_is_constrained() {
    let conn = db();
    seed_one_student_year_subject(&conn);
    conn.execute(
        "INSERT INTO attendance (student_id, date, status, year_id) VALUES (1,'2026-09-12','Present',1)",
        [],
    )
    .unwrap();
    let dup = conn.execute(
        "INSERT INTO attendance (student_id, date, status, year_id) VALUES (1,'2026-09-12','Absent',1)",
        [],
    );
    assert!(dup.is_err(), "UNIQUE(student_id, date) must hold");

    let bad = conn.execute(
        "INSERT INTO attendance (student_id, date, status, year_id) VALUES (1,'2026-09-13','Maybe',1)",
        [],
    );
    assert!(bad.is_err(), "status must be Present or Absent");
}

#[test]
fn student_gender_and_status_are_constrained() {
    let conn = db();
    let bad_gender = conn.execute(
        "INSERT INTO students (student_code, full_name, gender) VALUES ('MNA-0002','X','Other')",
        [],
    );
    assert!(bad_gender.is_err());

    let bad_status = conn.execute(
        "INSERT INTO students (student_code, full_name, status) VALUES ('MNA-0003','Y','Enrolled')",
        [],
    );
    assert!(bad_status.is_err());

    let ok = conn.execute(
        "INSERT INTO students (student_code, full_name, gender, status) VALUES ('MNA-0004','Z','Female','Active')",
        [],
    );
    assert!(ok.is_ok());
}

#[test]
fn fee_charges_are_one_per_student_per_day() {
    let conn = db();
    seed_one_student_year_subject(&conn);
    conn.execute(
        "INSERT INTO fee_charges (student_id, date, rate, year_id) VALUES (1,'2026-09-12',5,1)",
        [],
    )
    .unwrap();
    let dup = conn.execute(
        "INSERT INTO fee_charges (student_id, date, rate, year_id) VALUES (1,'2026-09-12',5,1)",
        [],
    );
    assert!(dup.is_err());
}

// ── Phase 3 tables ────────────────────────────────────────────────────────

#[test]
fn results_carry_a_teacher_remark_and_upsert_on_conflict() {
    let conn = db();
    seed_one_student_year_subject(&conn);
    conn.execute(
        "INSERT INTO results (student_id, year_id, subject_id, ca_mark, exam_mark, teacher_remark)
         VALUES (1, 1, 1, 30, 60, 'Good effort')",
        [],
    )
    .unwrap();
    // ON CONFLICT(student_id, year_id, subject_id) DO UPDATE — used by useSaveResults
    conn.execute(
        "INSERT INTO results (student_id, year_id, subject_id, ca_mark, exam_mark, teacher_remark)
         VALUES (1, 1, 1, 40, 70, 'Improved')
         ON CONFLICT(student_id, year_id, subject_id) DO UPDATE SET
           ca_mark = excluded.ca_mark, exam_mark = excluded.exam_mark,
           teacher_remark = excluded.teacher_remark",
        [],
    )
    .unwrap();
    let (ca, remark): (f64, String) = conn
        .query_row(
            "SELECT ca_mark, teacher_remark FROM results WHERE student_id = 1",
            [],
            |r| Ok((r.get(0)?, r.get(1)?)),
        )
        .unwrap();
    assert_eq!(ca, 40.0);
    assert_eq!(remark, "Improved");
    assert_eq!(scalar_i64(&conn, "SELECT COUNT(*) FROM results"), 1);
}

#[test]
fn report_card_remark_is_one_per_student_per_year() {
    let conn = db();
    seed_one_student_year_subject(&conn);
    conn.execute(
        "INSERT INTO report_card_remarks (student_id, year_id, general_remark) VALUES (1, 1, 'A')",
        [],
    )
    .unwrap();
    conn.execute(
        "INSERT INTO report_card_remarks (student_id, year_id, general_remark) VALUES (1, 1, 'B')
         ON CONFLICT(student_id, year_id) DO UPDATE SET general_remark = excluded.general_remark",
        [],
    )
    .unwrap();
    assert_eq!(scalar_i64(&conn, "SELECT COUNT(*) FROM report_card_remarks"), 1);
    let g: String = conn
        .query_row("SELECT general_remark FROM report_card_remarks", [], |r| r.get(0))
        .unwrap();
    assert_eq!(g, "B");

    let bad = conn.execute(
        "INSERT INTO report_card_remarks (student_id, year_id, general_remark) VALUES (1, 1, 'C')",
        [],
    );
    assert!(bad.is_err(), "UNIQUE(student_id, year_id) must hold");
}

#[test]
fn weight_override_is_unique_per_scope_and_target() {
    let conn = db();
    conn.execute(
        "INSERT INTO weight_overrides (scope, ref_id, ca_weight, exam_weight) VALUES ('class', 4, 0.4, 0.6)",
        [],
    )
    .unwrap();
    // upsert path used by useUpsertWeightOverride
    conn.execute(
        "INSERT INTO weight_overrides (scope, ref_id, ca_weight, exam_weight) VALUES ('class', 4, 0.5, 0.5)
         ON CONFLICT(scope, ref_id) DO UPDATE SET
           ca_weight = excluded.ca_weight, exam_weight = excluded.exam_weight",
        [],
    )
    .unwrap();
    let ca: f64 = conn
        .query_row("SELECT ca_weight FROM weight_overrides WHERE scope='class' AND ref_id=4", [], |r| r.get(0))
        .unwrap();
    assert_eq!(ca, 0.5);
    assert_eq!(scalar_i64(&conn, "SELECT COUNT(*) FROM weight_overrides"), 1);

    let bad_scope = conn.execute(
        "INSERT INTO weight_overrides (scope, ref_id, ca_weight, exam_weight) VALUES ('teacher', 1, 0.5, 0.5)",
        [],
    );
    assert!(bad_scope.is_err(), "scope CHECK allows only class/subject");
}

#[test]
fn student_enrollment_upserts_class_within_a_year() {
    let conn = db();
    conn.execute(
        "INSERT INTO academic_years (id, gregorian_label, hijri_label, is_current) VALUES (1,'2026/2027','1448',1)",
        [],
    )
    .unwrap();
    conn.execute("INSERT INTO students (id, student_code, full_name) VALUES (1,'MNA-0001','P')", [])
        .unwrap();
    let c3: i64 = conn.query_row("SELECT id FROM classes WHERE name='Class 3'", [], |r| r.get(0)).unwrap();
    let c4: i64 = conn.query_row("SELECT id FROM classes WHERE name='Class 4'", [], |r| r.get(0)).unwrap();

    conn.execute(
        "INSERT INTO student_enrollments (student_id, year_id, class_id) VALUES (1, 1, ?)",
        [c3],
    )
    .unwrap();
    // promotion re-runs the same insert with a new class
    conn.execute(
        "INSERT INTO student_enrollments (student_id, year_id, class_id) VALUES (1, 1, ?)
         ON CONFLICT(student_id, year_id) DO UPDATE SET class_id = excluded.class_id",
        [c4],
    )
    .unwrap();
    assert_eq!(scalar_i64(&conn, "SELECT COUNT(*) FROM student_enrollments"), 1);
    let cls: i64 = conn
        .query_row("SELECT class_id FROM student_enrollments WHERE student_id=1", [], |r| r.get(0))
        .unwrap();
    assert_eq!(cls, c4);
}

#[test]
fn teacher_assignment_is_unique_per_teacher_class_subject_year() {
    let conn = db();
    conn.execute(
        "INSERT INTO academic_years (id, gregorian_label, hijri_label, is_current) VALUES (1,'2026/2027','1448',1)",
        [],
    )
    .unwrap();
    conn.execute("INSERT INTO teachers (id, teacher_code, name) VALUES (1, 'MNA-T001', 'Ustadh')", [])
        .unwrap();
    let cid: i64 = conn.query_row("SELECT id FROM classes LIMIT 1", [], |r| r.get(0)).unwrap();
    let sid: i64 = conn.query_row("SELECT id FROM subjects LIMIT 1", [], |r| r.get(0)).unwrap();
    conn.execute(
        "INSERT INTO teacher_assignments (teacher_id, class_id, subject_id, year_id) VALUES (1, ?, ?, 1)",
        [cid, sid],
    )
    .unwrap();
    let dup = conn.execute(
        "INSERT INTO teacher_assignments (teacher_id, class_id, subject_id, year_id) VALUES (1, ?, ?, 1)",
        [cid, sid],
    );
    assert!(dup.is_err(), "UNIQUE(teacher_id, class_id, subject_id, year_id) must hold");
}

fn seed_one_student_year_subject(conn: &Connection) {
    conn.execute(
        "INSERT INTO academic_years (id, gregorian_label, hijri_label, is_current) VALUES (1,'2026/2027','1448',1)",
        [],
    )
    .unwrap();
    conn.execute(
        "INSERT INTO students (id, student_code, full_name) VALUES (1,'MNA-0001','Seed Pupil')",
        [],
    )
    .unwrap();
    // subject id 1 already exists from the seed
}
