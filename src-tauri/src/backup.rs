//! Database backup & recovery.
//!
//! The whole system lives in a single SQLite file (`mna.db`) in the app config
//! directory. These commands let the admin download that file (to keep on Google
//! Drive) and restore it after a crash or on a new machine.
//!
//! Restore is staged: the uploaded file is written next to the live database as
//! `pending-restore.db` and swapped in at the next startup, before any DB
//! connection is opened — see [`apply_pending_restore`].
//!
//! The `#[tauri::command]` functions are thin wrappers that resolve paths from
//! the `AppHandle`; all real logic lives in path-based helpers so it can be
//! unit-tested (see the `tests` module at the bottom of this file).

use std::fs;
use std::path::{Path, PathBuf};

use serde::Serialize;
use tauri::{AppHandle, Manager};

pub const CURRENT_SCHEMA_VERSION: i64 = 5;
const DB_FILE: &str = "mna.db";
const PENDING_FILE: &str = "pending-restore.db";
const MAX_AUTO_BACKUPS: usize = 10;
const APP_TAG: &str = "mna-management-system";

#[derive(Serialize)]
pub struct DbInfo {
    pub path: String,
    pub size_bytes: u64,
    pub schema_version: i64,
}

#[derive(Serialize, Debug, Clone)]
pub struct DbFileMeta {
    pub app: String,
    pub schema_version: i64,
    pub created_at: Option<String>,
}

#[derive(Serialize, Debug)]
pub struct BackupEntry {
    pub name: String,
    pub path: String,
    pub size_bytes: u64,
    pub modified: Option<String>,
}

// ── path helpers (AppHandle-bound) ─────────────────────────────────────────

fn config_dir(app: &AppHandle) -> Result<PathBuf, String> {
    let dir = app.path().app_config_dir().map_err(|e| e.to_string())?;
    fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    Ok(dir)
}

fn db_path(app: &AppHandle) -> Result<PathBuf, String> {
    Ok(config_dir(app)?.join(DB_FILE))
}

fn backups_dir(app: &AppHandle) -> Result<PathBuf, String> {
    let dir = config_dir(app)?.join("backups");
    fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    Ok(dir)
}

fn timestamp() -> String {
    chrono::Local::now().format("%Y-%m-%d-%H%M%S%3f").to_string()
}

// ── core helpers (path-based, testable) ────────────────────────────────────

/// Fold the WAL back into the main file so a plain copy is complete. Best effort.
fn checkpoint(db: &Path) {
    if !db.exists() {
        return;
    }
    if let Ok(conn) = rusqlite::Connection::open(db) {
        let _ = conn.execute_batch("PRAGMA wal_checkpoint(TRUNCATE);");
    }
}

/// Read and sanity-check the `meta` table of a candidate database file.
fn read_db_meta(path: &Path) -> Result<DbFileMeta, String> {
    let conn =
        rusqlite::Connection::open_with_flags(path, rusqlite::OpenFlags::SQLITE_OPEN_READ_ONLY)
            .map_err(|_| "Could not open the file as a database.".to_string())?;

    let app: String = conn
        .query_row("SELECT value FROM meta WHERE key = 'app'", [], |r| r.get(0))
        .map_err(|_| "This file is not an MNA database (no meta table).".to_string())?;
    if app != APP_TAG {
        return Err("This file is not an MNA database.".to_string());
    }

    let sv_text: String = conn
        .query_row("SELECT value FROM meta WHERE key = 'schema_version'", [], |r| r.get(0))
        .map_err(|_| "This MNA database is missing its schema version.".to_string())?;
    let schema_version: i64 = sv_text.parse().unwrap_or(0);

    let created_at: Option<String> = conn
        .query_row("SELECT value FROM meta WHERE key = 'created_at'", [], |r| r.get(0))
        .ok();

    Ok(DbFileMeta { app, schema_version, created_at })
}

/// Validate a file is a restorable MNA database (correct app + not from a newer app).
fn validate_restore_source(path: &Path) -> Result<DbFileMeta, String> {
    let meta = read_db_meta(path)?;
    if meta.schema_version > CURRENT_SCHEMA_VERSION {
        return Err(format!(
            "This database was created by a newer version of the app (format v{}). Update the app before restoring.",
            meta.schema_version
        ));
    }
    Ok(meta)
}

/// Checkpoint `db` and copy it to `dest`. Returns the byte size written.
fn copy_backup(db: &Path, dest: &Path) -> Result<u64, String> {
    if !db.exists() {
        return Err("There is no database to back up yet.".to_string());
    }
    checkpoint(db);
    fs::copy(db, dest).map_err(|e| e.to_string())?;
    fs::metadata(dest).map(|m| m.len()).map_err(|e| e.to_string())
}

/// Validate `src`, snapshot the current DB into `backups_dir`, and stage `src`
/// as `pending-restore.db` inside `config_dir`.
fn stage_restore(config_dir: &Path, backups_dir: &Path, src: &Path) -> Result<(), String> {
    validate_restore_source(src)?;
    let db = config_dir.join(DB_FILE);
    if db.exists() {
        checkpoint(&db);
        let snapshot = backups_dir.join(format!("pre-restore-{}.db", timestamp()));
        fs::copy(&db, &snapshot).map_err(|e| e.to_string())?;
    }
    fs::copy(src, config_dir.join(PENDING_FILE)).map_err(|e| e.to_string())?;
    Ok(())
}

/// Swap in a staged restore file, if any. Must run before the DB is opened.
pub fn apply_pending_restore(config_dir: &Path) {
    let pending = config_dir.join(PENDING_FILE);
    if !pending.exists() {
        return;
    }
    let db = config_dir.join(DB_FILE);
    let _ = fs::remove_file(config_dir.join("mna.db-wal"));
    let _ = fs::remove_file(config_dir.join("mna.db-shm"));
    let _ = fs::remove_file(&db);
    if fs::rename(&pending, &db).is_err() && fs::copy(&pending, &db).is_ok() {
        let _ = fs::remove_file(&pending);
    }
}

fn prune_auto_backups(dir: &Path) {
    let Ok(entries) = fs::read_dir(dir) else { return };
    let mut autos: Vec<(PathBuf, std::time::SystemTime)> = entries
        .flatten()
        .filter_map(|e| {
            let p = e.path();
            let name = p.file_name()?.to_string_lossy().to_string();
            if name.starts_with("auto-") && name.ends_with(".db") {
                let modified = e.metadata().ok()?.modified().ok()?;
                Some((p, modified))
            } else {
                None
            }
        })
        .collect();
    autos.sort_by(|a, b| b.1.cmp(&a.1)); // newest first
    for (path, _) in autos.into_iter().skip(MAX_AUTO_BACKUPS) {
        let _ = fs::remove_file(path);
    }
}

/// Copy `db` into `backups_dir/auto-<ts>.db` and prune to the newest [`MAX_AUTO_BACKUPS`].
fn run_auto_backup(db: &Path, backups_dir: &Path) {
    if !db.exists() {
        return;
    }
    checkpoint(db);
    let dest = backups_dir.join(format!("auto-{}.db", timestamp()));
    if fs::copy(db, &dest).is_ok() {
        prune_auto_backups(backups_dir);
    }
}

fn list_backup_entries(dir: &Path) -> Result<Vec<BackupEntry>, String> {
    let mut out: Vec<BackupEntry> = fs::read_dir(dir)
        .map_err(|e| e.to_string())?
        .flatten()
        .filter_map(|e| {
            let p = e.path();
            if p.extension().and_then(|s| s.to_str()) != Some("db") {
                return None;
            }
            let md = e.metadata().ok()?;
            let modified = md.modified().ok().map(|t| {
                let dt: chrono::DateTime<chrono::Utc> = t.into();
                dt.with_timezone(&chrono::Local).format("%Y-%m-%d %H:%M").to_string()
            });
            Some(BackupEntry {
                name: p.file_name()?.to_string_lossy().to_string(),
                path: p.to_string_lossy().to_string(),
                size_bytes: md.len(),
                modified,
            })
        })
        .collect();
    out.sort_by(|a, b| b.name.cmp(&a.name));
    Ok(out)
}

// ── startup / lifecycle hooks ─────────────────────────────────────────────

/// Copy the live DB into `backups/auto-<ts>.db` and prune old ones.
pub fn auto_backup(app: &AppHandle) {
    let (Ok(db), Ok(dir)) = (db_path(app), backups_dir(app)) else {
        return;
    };
    run_auto_backup(&db, &dir);
}

// ── commands ─────────────────────────────────────────────────────────────

#[tauri::command]
pub fn database_info(app: AppHandle) -> Result<DbInfo, String> {
    let path = db_path(&app)?;
    let size_bytes = fs::metadata(&path).map(|m| m.len()).unwrap_or(0);
    let schema_version = read_db_meta(&path).map(|m| m.schema_version).unwrap_or(0);
    Ok(DbInfo { path: path.to_string_lossy().to_string(), size_bytes, schema_version })
}

#[tauri::command]
pub fn backup_database(app: AppHandle, dest_path: String) -> Result<u64, String> {
    copy_backup(&db_path(&app)?, Path::new(&dest_path))
}

#[tauri::command]
pub fn validate_db_file(path: String) -> Result<DbFileMeta, String> {
    validate_restore_source(Path::new(&path))
}

#[tauri::command]
pub fn restore_database(app: AppHandle, src_path: String) -> Result<String, String> {
    stage_restore(&config_dir(&app)?, &backups_dir(&app)?, Path::new(&src_path))?;
    Ok("Restore staged. Restart the app to load the restored database.".to_string())
}

#[tauri::command]
pub fn list_backups(app: AppHandle) -> Result<Vec<BackupEntry>, String> {
    list_backup_entries(&backups_dir(&app)?)
}

#[tauri::command]
pub fn relaunch(app: AppHandle) {
    app.restart();
}

// ─────────────────────────────────────────────────────────────────────────
#[cfg(test)]
mod tests {
    use super::*;
    use rusqlite::Connection;

    const INIT_SQL: &str = include_str!("../migrations/0001_init.sql");
    const PHASE2_SQL: &str = include_str!("../migrations/0002_phase2.sql");
    const PHASE3_SQL: &str = include_str!("../migrations/0003_indexes.sql");
    const PHASE4_SQL: &str = include_str!("../migrations/0004_subject_classes.sql");
    const PHASE5_SQL: &str = include_str!("../migrations/0005_auth.sql");

    fn make_mna_db(path: &Path) {
        let conn = Connection::open(path).unwrap();
        conn.execute_batch(INIT_SQL).unwrap();
        conn.execute_batch(PHASE2_SQL).unwrap();
        conn.execute_batch(PHASE3_SQL).unwrap();
        conn.execute_batch(PHASE4_SQL).unwrap();
        conn.execute_batch(PHASE5_SQL).unwrap();
    }

    fn tmp() -> tempfile::TempDir {
        tempfile::tempdir().unwrap()
    }

    #[test]
    fn read_db_meta_accepts_a_fresh_database() {
        let d = tmp();
        let db = d.path().join("a.db");
        make_mna_db(&db);
        let meta = read_db_meta(&db).expect("should read meta");
        assert_eq!(meta.app, APP_TAG);
        assert_eq!(meta.schema_version, 5);
        assert!(meta.created_at.is_some());
    }

    #[test]
    fn read_db_meta_rejects_a_non_database_file() {
        let d = tmp();
        let f = d.path().join("notes.db");
        fs::write(&f, b"this is not sqlite").unwrap();
        assert!(read_db_meta(&f).is_err());
    }

    #[test]
    fn read_db_meta_rejects_a_foreign_sqlite_database() {
        let d = tmp();
        let f = d.path().join("other.db");
        let conn = Connection::open(&f).unwrap();
        conn.execute_batch("CREATE TABLE x(y);").unwrap();
        let err = read_db_meta(&f).unwrap_err();
        assert!(err.contains("not an MNA database"), "{err}");
    }

    #[test]
    fn validate_restore_source_rejects_a_newer_schema() {
        let d = tmp();
        let db = d.path().join("future.db");
        make_mna_db(&db);
        Connection::open(&db)
            .unwrap()
            .execute("UPDATE meta SET value = '99' WHERE key = 'schema_version'", [])
            .unwrap();
        let err = validate_restore_source(&db).unwrap_err();
        assert!(err.contains("newer version"), "{err}");
    }

    #[test]
    fn copy_backup_produces_an_openable_copy() {
        let d = tmp();
        let db = d.path().join("live.db");
        make_mna_db(&db);
        let dest = d.path().join("backup.db");
        let size = copy_backup(&db, &dest).unwrap();
        assert!(size > 0);
        // the copy is itself a valid MNA database
        assert_eq!(read_db_meta(&dest).unwrap().schema_version, 5);
    }

    #[test]
    fn copy_backup_errors_when_there_is_no_database() {
        let d = tmp();
        let err = copy_backup(&d.path().join("missing.db"), &d.path().join("out.db")).unwrap_err();
        assert!(err.contains("no database"), "{err}");
    }

    #[test]
    fn stage_restore_snapshots_current_and_stages_the_new_file() {
        let cfg = tmp();
        let backups = tmp();
        make_mna_db(&cfg.path().join(DB_FILE)); // current live db

        let src = tmp();
        let src_db = src.path().join("incoming.db");
        make_mna_db(&src_db);

        stage_restore(cfg.path(), backups.path(), &src_db).unwrap();

        let pending = cfg.path().join(PENDING_FILE);
        assert!(pending.exists(), "pending-restore.db should be staged");
        assert_eq!(fs::read(&pending).unwrap(), fs::read(&src_db).unwrap());

        let snapshots: Vec<_> = fs::read_dir(backups.path())
            .unwrap()
            .flatten()
            .filter(|e| e.file_name().to_string_lossy().starts_with("pre-restore-"))
            .collect();
        assert_eq!(snapshots.len(), 1, "a pre-restore snapshot should exist");
    }

    #[test]
    fn stage_restore_rejects_a_bad_source_and_stages_nothing() {
        let cfg = tmp();
        let backups = tmp();
        make_mna_db(&cfg.path().join(DB_FILE));
        let bad = cfg.path().join("bad.db");
        fs::write(&bad, b"garbage").unwrap();

        assert!(stage_restore(cfg.path(), backups.path(), &bad).is_err());
        assert!(!cfg.path().join(PENDING_FILE).exists());
    }

    #[test]
    fn apply_pending_restore_swaps_the_file_and_clears_wal() {
        let cfg = tmp();
        fs::write(cfg.path().join(DB_FILE), b"OLD").unwrap();
        fs::write(cfg.path().join("mna.db-wal"), b"waldata").unwrap();
        fs::write(cfg.path().join("mna.db-shm"), b"shmdata").unwrap();
        fs::write(cfg.path().join(PENDING_FILE), b"NEW").unwrap();

        apply_pending_restore(cfg.path());

        assert_eq!(fs::read(cfg.path().join(DB_FILE)).unwrap(), b"NEW");
        assert!(!cfg.path().join(PENDING_FILE).exists());
        assert!(!cfg.path().join("mna.db-wal").exists());
        assert!(!cfg.path().join("mna.db-shm").exists());
    }

    #[test]
    fn apply_pending_restore_is_a_noop_without_a_pending_file() {
        let cfg = tmp();
        fs::write(cfg.path().join(DB_FILE), b"KEEP").unwrap();
        apply_pending_restore(cfg.path());
        assert_eq!(fs::read(cfg.path().join(DB_FILE)).unwrap(), b"KEEP");
    }

    #[test]
    fn run_auto_backup_writes_one_timestamped_copy() {
        let d = tmp();
        let db = d.path().join(DB_FILE);
        let backups = d.path().join("backups");
        fs::create_dir_all(&backups).unwrap();
        make_mna_db(&db);

        run_auto_backup(&db, &backups);

        let autos: Vec<_> = fs::read_dir(&backups)
            .unwrap()
            .flatten()
            .filter(|e| {
                let n = e.file_name().to_string_lossy().to_string();
                n.starts_with("auto-") && n.ends_with(".db")
            })
            .collect();
        assert_eq!(autos.len(), 1);
    }

    #[test]
    fn prune_auto_backups_keeps_only_the_newest_ten_and_leaves_others_alone() {
        let d = tmp();
        for i in 0..12 {
            fs::write(d.path().join(format!("auto-2026-01-{:02}.db", i + 1)), b"x").unwrap();
        }
        fs::write(d.path().join("pre-restore-a.db"), b"x").unwrap();
        fs::write(d.path().join("pre-restore-b.db"), b"x").unwrap();

        prune_auto_backups(d.path());

        let names: Vec<String> = fs::read_dir(d.path())
            .unwrap()
            .flatten()
            .map(|e| e.file_name().to_string_lossy().to_string())
            .collect();
        let autos = names.iter().filter(|n| n.starts_with("auto-")).count();
        let snaps = names.iter().filter(|n| n.starts_with("pre-restore-")).count();
        assert_eq!(autos, 10, "should keep 10 auto backups");
        assert_eq!(snaps, 2, "pre-restore snapshots must be untouched");
    }

    #[test]
    fn list_backup_entries_returns_only_db_files_newest_first() {
        let d = tmp();
        fs::write(d.path().join("auto-2026-01-01.db"), b"x").unwrap();
        fs::write(d.path().join("auto-2026-02-01.db"), b"xx").unwrap();
        fs::write(d.path().join("pre-restore-2026-01-15.db"), b"xxx").unwrap();
        fs::write(d.path().join("readme.txt"), b"ignore me").unwrap();

        let entries = list_backup_entries(d.path()).unwrap();
        assert_eq!(entries.len(), 3, "the .txt file must be ignored");
        assert_eq!(entries[0].name, "pre-restore-2026-01-15.db");
        assert_eq!(entries[1].name, "auto-2026-02-01.db");
        assert_eq!(entries[2].name, "auto-2026-01-01.db");
    }
}
