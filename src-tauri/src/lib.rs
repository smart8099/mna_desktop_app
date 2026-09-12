mod auth;
mod backup;
mod batch;
mod importer;
mod media;

use tauri::Manager;
use tauri_plugin_sql::{Migration, MigrationKind};

const DB_URL: &str = "sqlite:mna.db";

fn migrations() -> Vec<Migration> {
    vec![
        Migration {
            version: 1,
            description: "initial schema",
            sql: include_str!("../migrations/0001_init.sql"),
            kind: MigrationKind::Up,
        },
        Migration {
            version: 2,
            description: "phase 2: daily operations",
            sql: include_str!("../migrations/0002_phase2.sql"),
            kind: MigrationKind::Up,
        },
        Migration {
            version: 3,
            description: "performance indexes",
            sql: include_str!("../migrations/0003_indexes.sql"),
            kind: MigrationKind::Up,
        },
        Migration {
            version: 4,
            description: "per-class subject applicability",
            sql: include_str!("../migrations/0004_subject_classes.sql"),
            kind: MigrationKind::Up,
        },
        Migration {
            version: 5,
            description: "login, roles and critical-action confirmation",
            sql: include_str!("../migrations/0005_auth.sql"),
            kind: MigrationKind::Up,
        },
    ]
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(
            tauri_plugin_sql::Builder::default()
                .add_migrations(DB_URL, migrations())
                .build(),
        )
        .setup(|app| {
            // Apply a staged restore before anything opens the database.
            if let Ok(dir) = app.handle().path().app_config_dir() {
                let _ = std::fs::create_dir_all(&dir);
                backup::apply_pending_restore(&dir);
            }
            Ok(())
        })
        .on_window_event(|window, event| {
            if let tauri::WindowEvent::CloseRequested { .. } = event {
                backup::auto_backup(window.app_handle());
            }
        })
        .invoke_handler(tauri::generate_handler![
            backup::database_info,
            backup::backup_database,
            backup::validate_db_file,
            backup::restore_database,
            backup::list_backups,
            backup::relaunch,
            importer::parse_students_xlsx,
            media::save_student_photo,
            media::delete_student_photo,
            media::save_binary_file,
            batch::execute_transaction,
            auth::has_any_users,
            auth::create_first_admin,
            auth::create_user,
            auth::verify_login,
            auth::verify_current_password,
            auth::change_password,
            auth::reset_password_with_recovery_code,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
