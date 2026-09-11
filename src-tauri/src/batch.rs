//! Atomic multi-statement writes.
//!
//! Several mutations (attendance, results, promotions, imports) previously
//! issued one `execute()` IPC call per row, which meant one round-trip and one
//! implicit transaction per row for a save that could touch dozens of
//! students. `execute_transaction` takes the whole batch, runs it on a single
//! connection inside one transaction, and commits once — one round-trip,
//! atomic (a failure rolls back everything, since a dropped `rusqlite`
//! transaction that was never committed rolls back automatically).

use std::path::{Path, PathBuf};

use rusqlite::{Connection, ToSql};
use serde::Deserialize;
use serde_json::Value as Json;
use tauri::{AppHandle, Manager};

#[derive(Deserialize, Debug, Clone)]
pub struct BatchStatement {
    pub sql: String,
    #[serde(default)]
    pub params: Vec<Json>,
}

fn db_path(app: &AppHandle) -> Result<PathBuf, String> {
    Ok(app
        .path()
        .app_config_dir()
        .map_err(|e| e.to_string())?
        .join("mna.db"))
}

fn json_to_sql(v: &Json) -> Box<dyn ToSql> {
    match v {
        Json::Null => Box::new(Option::<i64>::None),
        Json::Bool(b) => Box::new(*b),
        Json::Number(n) => {
            if let Some(i) = n.as_i64() {
                Box::new(i)
            } else {
                Box::new(n.as_f64().unwrap_or(0.0))
            }
        }
        Json::String(s) => Box::new(s.clone()),
        other => Box::new(other.to_string()),
    }
}

/// Run every statement against `path` inside one transaction. Rolls back
/// entirely if any statement fails. Returns the total rows affected.
fn run_transaction(path: &Path, statements: &[BatchStatement]) -> Result<usize, String> {
    if statements.is_empty() {
        return Ok(0);
    }
    let mut conn = Connection::open(path).map_err(|e| e.to_string())?;
    // Wait rather than fail if tauri-plugin-sql's pool briefly holds the write lock.
    conn.execute_batch("PRAGMA busy_timeout = 5000; PRAGMA foreign_keys = ON;")
        .map_err(|e| e.to_string())?;

    let tx = conn.transaction().map_err(|e| e.to_string())?;
    let mut affected = 0usize;
    for (i, stmt) in statements.iter().enumerate() {
        let bound: Vec<Box<dyn ToSql>> = stmt.params.iter().map(json_to_sql).collect();
        let refs: Vec<&dyn ToSql> = bound.iter().map(|b| b.as_ref()).collect();
        affected += tx
            .execute(&stmt.sql, refs.as_slice())
            .map_err(|e| format!("statement {i} failed ({e}): {}", stmt.sql))?;
    }
    tx.commit().map_err(|e| e.to_string())?;
    Ok(affected)
}

#[tauri::command]
pub fn execute_transaction(app: AppHandle, statements: Vec<BatchStatement>) -> Result<usize, String> {
    run_transaction(&db_path(&app)?, &statements)
}

#[cfg(test)]
mod tests {
    use super::*;

    const INIT_SQL: &str = include_str!("../migrations/0001_init.sql");
    const PHASE2_SQL: &str = include_str!("../migrations/0002_phase2.sql");
    const PHASE3_SQL: &str = include_str!("../migrations/0003_indexes.sql");

    fn seeded_db() -> (tempfile::TempDir, PathBuf) {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("mna.db");
        let conn = Connection::open(&path).unwrap();
        conn.execute_batch(INIT_SQL).unwrap();
        conn.execute_batch(PHASE2_SQL).unwrap();
        conn.execute_batch(PHASE3_SQL).unwrap();
        (dir, path)
    }

    fn stmt(sql: &str, params: Vec<Json>) -> BatchStatement {
        BatchStatement { sql: sql.to_string(), params }
    }

    #[test]
    fn runs_every_statement_and_commits_once() {
        let (_dir, path) = seeded_db();
        let statements = vec![
            stmt(
                "INSERT INTO students (student_code, full_name) VALUES (?, ?)",
                vec![Json::String("MNA-0001".into()), Json::String("Amina".into())],
            ),
            stmt(
                "INSERT INTO students (student_code, full_name) VALUES (?, ?)",
                vec![Json::String("MNA-0002".into()), Json::String("Bilal".into())],
            ),
        ];
        let affected = run_transaction(&path, &statements).unwrap();
        assert_eq!(affected, 2);

        let conn = Connection::open(&path).unwrap();
        let n: i64 = conn.query_row("SELECT COUNT(*) FROM students", [], |r| r.get(0)).unwrap();
        assert_eq!(n, 2);
    }

    #[test]
    fn chains_statements_via_last_insert_rowid() {
        // Mirrors the student-import flow: insert a student, then an
        // enrollment row that references the row just inserted.
        let (_dir, path) = seeded_db();
        let statements = vec![
            stmt(
                "INSERT INTO academic_years (id, gregorian_label, hijri_label, is_current) VALUES (1, '2026/2027', '1448', 1)",
                vec![],
            ),
            stmt(
                "INSERT INTO students (student_code, full_name, class_id) VALUES (?, ?, 1)",
                vec![Json::String("MNA-0001".into()), Json::String("Amina".into())],
            ),
            stmt(
                "INSERT INTO student_enrollments (student_id, year_id, class_id) VALUES (last_insert_rowid(), 1, 1)",
                vec![],
            ),
        ];
        run_transaction(&path, &statements).unwrap();

        let conn = Connection::open(&path).unwrap();
        let (sid, eid): (i64, i64) = conn
            .query_row(
                "SELECT s.id, e.student_id FROM students s JOIN student_enrollments e ON e.student_id = s.id",
                [],
                |r| Ok((r.get(0)?, r.get(1)?)),
            )
            .unwrap();
        assert_eq!(sid, eid);
    }

    #[test]
    fn rolls_back_everything_on_a_failing_statement() {
        let (_dir, path) = seeded_db();
        let statements = vec![
            stmt(
                "INSERT INTO students (student_code, full_name) VALUES (?, ?)",
                vec![Json::String("MNA-0001".into()), Json::String("Amina".into())],
            ),
            // duplicate student_code -> UNIQUE violation
            stmt(
                "INSERT INTO students (student_code, full_name) VALUES (?, ?)",
                vec![Json::String("MNA-0001".into()), Json::String("Bilal".into())],
            ),
        ];
        let err = run_transaction(&path, &statements);
        assert!(err.is_err());

        let conn = Connection::open(&path).unwrap();
        let n: i64 = conn.query_row("SELECT COUNT(*) FROM students", [], |r| r.get(0)).unwrap();
        assert_eq!(n, 0, "the first insert must be rolled back too");
    }

    #[test]
    fn an_empty_batch_is_a_harmless_no_op() {
        let (_dir, path) = seeded_db();
        assert_eq!(run_transaction(&path, &[]).unwrap(), 0);
    }

    #[test]
    fn null_json_binds_as_sql_null() {
        let (_dir, path) = seeded_db();
        let statements = vec![stmt(
            "INSERT INTO students (student_code, full_name, class_id) VALUES (?, ?, ?)",
            vec![Json::String("MNA-0001".into()), Json::String("Amina".into()), Json::Null],
        )];
        run_transaction(&path, &statements).unwrap();
        let conn = Connection::open(&path).unwrap();
        let class_id: Option<i64> = conn
            .query_row("SELECT class_id FROM students WHERE student_code = 'MNA-0001'", [], |r| r.get(0))
            .unwrap();
        assert_eq!(class_id, None);
    }
}
