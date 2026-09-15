//! Authentication: login, two roles (admin / teacher), and password
//! re-verification for critical-action step-up confirmation.
//!
//! Passwords and recovery codes are hashed with Argon2id and the hash never
//! leaves this module — the frontend has broad direct SQL access to the rest
//! of the database (by design, for this single-user offline app) but must
//! never select `password_hash` / `recovery_code_hash`; every comparison
//! happens here, not in JavaScript.
//!
//! Like `backup.rs`, real logic lives in path-based helpers (testable
//! without a running app) behind thin `#[tauri::command]` wrappers.

use argon2::password_hash::rand_core::OsRng;
use argon2::password_hash::{PasswordHash, PasswordHasher, PasswordVerifier, SaltString};
use argon2::Argon2;
use rand::Rng;
use rusqlite::{params, Connection};
use serde::Serialize;
use std::path::{Path, PathBuf};
use tauri::{AppHandle, Manager};

const MIN_PASSWORD_LEN: usize = 4;

fn db_path(app: &AppHandle) -> Result<PathBuf, String> {
    Ok(app.path().app_config_dir().map_err(|e| e.to_string())?.join("mna.db"))
}

fn hash_secret(secret: &str) -> Result<String, String> {
    let salt = SaltString::generate(&mut OsRng);
    Argon2::default()
        .hash_password(secret.as_bytes(), &salt)
        .map(|h| h.to_string())
        .map_err(|e| e.to_string())
}

fn verify_secret(secret: &str, hash: &str) -> bool {
    let Ok(parsed) = PasswordHash::new(hash) else {
        return false;
    };
    Argon2::default().verify_password(secret.as_bytes(), &parsed).is_ok()
}

/// A readable, typeable recovery code, e.g. "K7QX-9F2M-3RTL" — excludes
/// characters easily confused when handwritten (0/O, 1/I).
fn generate_recovery_code() -> String {
    const CHARS: &[u8] = b"ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
    let mut rng = rand::thread_rng();
    (0..3)
        .map(|_| (0..4).map(|_| CHARS[rng.gen_range(0..CHARS.len())] as char).collect::<String>())
        .collect::<Vec<_>>()
        .join("-")
}

#[derive(Serialize)]
pub struct PublicUser {
    pub id: i64,
    pub username: String,
    pub role: String,
}

// ── path-based core (testable) ──────────────────────────────────────────────

fn has_any_users_at(path: &Path) -> Result<bool, String> {
    let conn = Connection::open(path).map_err(|e| e.to_string())?;
    match conn.query_row("SELECT COUNT(*) FROM users", [], |r| r.get::<_, i64>(0)) {
        Ok(n) => Ok(n > 0),
        // A brand-new database file — before the frontend's plugin-sql
        // connection has had a chance to run its migrations — has no
        // `users` table at all yet. That unambiguously means no account
        // exists, not a real error to fail safe on (the caller otherwise
        // treats any error here as "assume an account exists", which would
        // strand a fresh install at the login screen with nothing to log
        // into).
        Err(e) if e.to_string().contains("no such table") => Ok(false),
        Err(e) => Err(e.to_string()),
    }
}

fn validate_credentials(username: &str, password: &str) -> Result<(), String> {
    if username.trim().is_empty() {
        return Err("Username cannot be empty.".to_string());
    }
    if password.len() < MIN_PASSWORD_LEN {
        return Err(format!("Password must be at least {MIN_PASSWORD_LEN} characters."));
    }
    Ok(())
}

/// Creates the very first account (always admin) and returns its one-time
/// recovery code — the only time it's ever available in plain text. Refuses
/// if any account already exists.
fn create_first_admin_at(path: &Path, username: &str, password: &str) -> Result<String, String> {
    validate_credentials(username, password)?;
    let conn = Connection::open(path).map_err(|e| e.to_string())?;
    let n: i64 = conn
        .query_row("SELECT COUNT(*) FROM users", [], |r| r.get(0))
        .map_err(|e| e.to_string())?;
    if n > 0 {
        return Err("An account already exists.".to_string());
    }
    let password_hash = hash_secret(password)?;
    let recovery_code = generate_recovery_code();
    let recovery_hash = hash_secret(&recovery_code)?;
    conn.execute(
        "INSERT INTO users (username, password_hash, role, recovery_code_hash)
         VALUES (?1, ?2, 'admin', ?3)",
        params![username.trim(), password_hash, recovery_hash],
    )
    .map_err(|e| e.to_string())?;
    Ok(recovery_code)
}

fn create_user_at(path: &Path, username: &str, password: &str, role: &str) -> Result<(), String> {
    if role != "admin" && role != "teacher" {
        return Err("Role must be admin or teacher.".to_string());
    }
    validate_credentials(username, password)?;
    let conn = Connection::open(path).map_err(|e| e.to_string())?;
    let password_hash = hash_secret(password)?;
    conn.execute(
        "INSERT INTO users (username, password_hash, role) VALUES (?1, ?2, ?3)",
        params![username.trim(), password_hash, role],
    )
    .map_err(|e| {
        if e.to_string().contains("UNIQUE") {
            "That username is already taken.".to_string()
        } else {
            e.to_string()
        }
    })?;
    Ok(())
}

fn verify_login_at(path: &Path, username: &str, password: &str) -> Result<PublicUser, String> {
    let conn = Connection::open(path).map_err(|e| e.to_string())?;
    let row = conn.query_row(
        "SELECT id, username, password_hash, role FROM users WHERE username = ?1",
        [username.trim()],
        |r| {
            Ok((
                r.get::<_, i64>(0)?,
                r.get::<_, String>(1)?,
                r.get::<_, String>(2)?,
                r.get::<_, String>(3)?,
            ))
        },
    );
    let (id, uname, hash, role) = row.map_err(|_| "Incorrect username or password.".to_string())?;
    if !verify_secret(password, &hash) {
        return Err("Incorrect username or password.".to_string());
    }
    Ok(PublicUser { id, username: uname, role })
}

/// Re-checks a password for the already-logged-in user — the step-up check
/// before a critical action proceeds.
fn verify_current_password_at(path: &Path, user_id: i64, password: &str) -> Result<bool, String> {
    let conn = Connection::open(path).map_err(|e| e.to_string())?;
    let hash: String = conn
        .query_row("SELECT password_hash FROM users WHERE id = ?1", [user_id], |r| r.get(0))
        .map_err(|e| e.to_string())?;
    Ok(verify_secret(password, &hash))
}

fn change_password_at(
    path: &Path,
    user_id: i64,
    current_password: &str,
    new_password: &str,
) -> Result<(), String> {
    if new_password.len() < MIN_PASSWORD_LEN {
        return Err(format!("Password must be at least {MIN_PASSWORD_LEN} characters."));
    }
    let conn = Connection::open(path).map_err(|e| e.to_string())?;
    let hash: String = conn
        .query_row("SELECT password_hash FROM users WHERE id = ?1", [user_id], |r| r.get(0))
        .map_err(|e| e.to_string())?;
    if !verify_secret(current_password, &hash) {
        return Err("Current password is incorrect.".to_string());
    }
    let new_hash = hash_secret(new_password)?;
    conn.execute("UPDATE users SET password_hash = ?1 WHERE id = ?2", params![new_hash, user_id])
        .map_err(|e| e.to_string())?;
    Ok(())
}

/// Resets a forgotten password using the one-time recovery code, issuing a
/// fresh one in the same call — the old code is single-use.
fn reset_password_with_recovery_code_at(
    path: &Path,
    username: &str,
    recovery_code: &str,
    new_password: &str,
) -> Result<String, String> {
    if new_password.len() < MIN_PASSWORD_LEN {
        return Err(format!("Password must be at least {MIN_PASSWORD_LEN} characters."));
    }
    let conn = Connection::open(path).map_err(|e| e.to_string())?;
    let (id, hash): (i64, Option<String>) = conn
        .query_row(
            "SELECT id, recovery_code_hash FROM users WHERE username = ?1",
            [username.trim()],
            |r| Ok((r.get(0)?, r.get(1)?)),
        )
        .map_err(|_| "Unknown username.".to_string())?;
    let Some(hash) = hash else {
        return Err("No recovery code is set for this account.".to_string());
    };
    if !verify_secret(recovery_code.trim(), &hash) {
        return Err("Incorrect recovery code.".to_string());
    }
    let new_password_hash = hash_secret(new_password)?;
    let new_recovery_code = generate_recovery_code();
    let new_recovery_hash = hash_secret(&new_recovery_code)?;
    conn.execute(
        "UPDATE users SET password_hash = ?1, recovery_code_hash = ?2 WHERE id = ?3",
        params![new_password_hash, new_recovery_hash, id],
    )
    .map_err(|e| e.to_string())?;
    Ok(new_recovery_code)
}

// ── #[tauri::command] wrappers ──────────────────────────────────────────────

#[tauri::command]
pub fn has_any_users(app: AppHandle) -> Result<bool, String> {
    has_any_users_at(&db_path(&app)?)
}

#[tauri::command]
pub fn create_first_admin(app: AppHandle, username: String, password: String) -> Result<String, String> {
    create_first_admin_at(&db_path(&app)?, &username, &password)
}

#[tauri::command]
pub fn create_user(app: AppHandle, username: String, password: String, role: String) -> Result<(), String> {
    create_user_at(&db_path(&app)?, &username, &password, &role)
}

#[tauri::command]
pub fn verify_login(app: AppHandle, username: String, password: String) -> Result<PublicUser, String> {
    verify_login_at(&db_path(&app)?, &username, &password)
}

#[tauri::command]
pub fn verify_current_password(app: AppHandle, user_id: i64, password: String) -> Result<bool, String> {
    verify_current_password_at(&db_path(&app)?, user_id, &password)
}

#[tauri::command]
pub fn change_password(
    app: AppHandle,
    user_id: i64,
    current_password: String,
    new_password: String,
) -> Result<(), String> {
    change_password_at(&db_path(&app)?, user_id, &current_password, &new_password)
}

#[tauri::command]
pub fn reset_password_with_recovery_code(
    app: AppHandle,
    username: String,
    recovery_code: String,
    new_password: String,
) -> Result<String, String> {
    reset_password_with_recovery_code_at(&db_path(&app)?, &username, &recovery_code, &new_password)
}

// ─────────────────────────────────────────────────────────────────────────
#[cfg(test)]
mod tests {
    use super::*;

    const INIT_SQL: &str = include_str!("../migrations/0001_init.sql");
    const PHASE2_SQL: &str = include_str!("../migrations/0002_phase2.sql");
    const PHASE3_SQL: &str = include_str!("../migrations/0003_indexes.sql");
    const PHASE4_SQL: &str = include_str!("../migrations/0004_subject_classes.sql");
    const PHASE5_SQL: &str = include_str!("../migrations/0005_auth.sql");
    const PHASE6_SQL: &str = include_str!("../migrations/0006_username_case_insensitive.sql");

    fn test_db() -> (tempfile::TempDir, PathBuf) {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("mna.db");
        let conn = Connection::open(&path).unwrap();
        conn.execute_batch(INIT_SQL).unwrap();
        conn.execute_batch(PHASE2_SQL).unwrap();
        conn.execute_batch(PHASE3_SQL).unwrap();
        conn.execute_batch(PHASE4_SQL).unwrap();
        conn.execute_batch(PHASE5_SQL).unwrap();
        conn.execute_batch(PHASE6_SQL).unwrap();
        (dir, path)
    }

    #[test]
    fn first_admin_can_be_created_only_once() {
        let (_dir, path) = test_db();
        let code = create_first_admin_at(&path, "amina", "secret1").unwrap();
        assert_eq!(code.len(), 14); // "XXXX-XXXX-XXXX"
        assert!(create_first_admin_at(&path, "someone-else", "secret2").is_err());
    }

    #[test]
    fn rejects_an_empty_username_or_a_too_short_password() {
        let (_dir, path) = test_db();
        assert!(create_first_admin_at(&path, "  ", "secret1").is_err());
        assert!(create_first_admin_at(&path, "amina", "abc").is_err());
    }

    #[test]
    fn login_succeeds_with_the_right_password_and_fails_otherwise() {
        let (_dir, path) = test_db();
        create_first_admin_at(&path, "amina", "secret1").unwrap();

        let user = verify_login_at(&path, "amina", "secret1").unwrap();
        assert_eq!(user.username, "amina");
        assert_eq!(user.role, "admin");

        assert!(verify_login_at(&path, "amina", "wrong").is_err());
        assert!(verify_login_at(&path, "nobody", "secret1").is_err());
    }

    #[test]
    fn login_ignores_the_case_of_the_username() {
        let (_dir, path) = test_db();
        create_user_at(&path, "Obed", "secret1", "teacher").unwrap();

        // the actual reported bug: an account created as "Obed" couldn't
        // log in as "obed" even with the correct password
        let user = verify_login_at(&path, "obed", "secret1").unwrap();
        assert_eq!(user.username, "Obed");

        assert!(verify_login_at(&path, "OBED", "secret1").is_ok());
        assert!(create_user_at(&path, "obed", "secret2", "teacher").is_err(), "case-only duplicate");
    }

    #[test]
    fn creates_a_teacher_account_distinct_from_admin() {
        let (_dir, path) = test_db();
        create_first_admin_at(&path, "amina", "secret1").unwrap();
        create_user_at(&path, "yusuf", "secret2", "teacher").unwrap();

        let teacher = verify_login_at(&path, "yusuf", "secret2").unwrap();
        assert_eq!(teacher.role, "teacher");
    }

    #[test]
    fn rejects_an_invalid_role_and_a_duplicate_username() {
        let (_dir, path) = test_db();
        create_first_admin_at(&path, "amina", "secret1").unwrap();
        assert!(create_user_at(&path, "yusuf", "secret2", "principal").is_err());
        assert!(create_user_at(&path, "amina", "secret2", "teacher").is_err());
    }

    #[test]
    fn step_up_verification_checks_the_current_password_only() {
        let (_dir, path) = test_db();
        create_first_admin_at(&path, "amina", "secret1").unwrap();
        let user = verify_login_at(&path, "amina", "secret1").unwrap();

        assert!(verify_current_password_at(&path, user.id, "secret1").unwrap());
        assert!(!verify_current_password_at(&path, user.id, "wrong").unwrap());
    }

    #[test]
    fn changing_password_requires_the_current_one_and_takes_effect() {
        let (_dir, path) = test_db();
        create_first_admin_at(&path, "amina", "secret1").unwrap();
        let user = verify_login_at(&path, "amina", "secret1").unwrap();

        assert!(change_password_at(&path, user.id, "wrong", "newsecret").is_err());
        change_password_at(&path, user.id, "secret1", "newsecret").unwrap();

        assert!(verify_login_at(&path, "amina", "secret1").is_err());
        assert!(verify_login_at(&path, "amina", "newsecret").is_ok());
    }

    #[test]
    fn recovery_code_resets_the_password_and_then_rotates_itself() {
        let (_dir, path) = test_db();
        let code = create_first_admin_at(&path, "amina", "secret1").unwrap();

        assert!(reset_password_with_recovery_code_at(&path, "amina", "WRONG-CODE-HERE", "newsecret").is_err());

        let new_code = reset_password_with_recovery_code_at(&path, "amina", &code, "newsecret").unwrap();
        assert_ne!(code, new_code);
        assert!(verify_login_at(&path, "amina", "newsecret").is_ok());

        // the old code is single-use: it no longer works for a second reset
        assert!(reset_password_with_recovery_code_at(&path, "amina", &code, "another").is_err());
        // but the freshly issued one does
        assert!(reset_password_with_recovery_code_at(&path, "amina", &new_code, "another").is_ok());
    }

    #[test]
    fn has_any_users_reflects_whether_an_account_exists() {
        let (_dir, path) = test_db();
        assert!(!has_any_users_at(&path).unwrap());
        create_first_admin_at(&path, "amina", "secret1").unwrap();
        assert!(has_any_users_at(&path).unwrap());
    }

    #[test]
    fn has_any_users_is_false_on_a_database_with_no_tables_yet() {
        // The real bug this guards: a fresh install's database file has no
        // `users` table at all until the frontend's own connection has run
        // its migrations. That must read as "no account yet" (-> show
        // setup), not as an error (-> the caller's fail-safe wrongly shows
        // the login screen with no account in existence to log into).
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("mna.db");
        assert!(!has_any_users_at(&path).unwrap());
    }
}
