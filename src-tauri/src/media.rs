//! Student photo storage. Images are copied into `<app config>/photos/` and
//! referenced by absolute path from `students.photo_path`. The webview loads
//! them directly through Tauri's asset protocol (`convertFileSrc`) — no IPC
//! round-trip or base64 payload needed to display one.

use std::fs;
use std::path::{Path, PathBuf};

use base64::Engine;
use tauri::{AppHandle, Manager};

const MAX_BYTES: u64 = 8 * 1024 * 1024;
const ALLOWED: [&str; 6] = ["jpg", "jpeg", "png", "webp", "gif", "bmp"];

fn photos_dir(app: &AppHandle) -> Result<PathBuf, String> {
    let dir = app
        .path()
        .app_config_dir()
        .map_err(|e| e.to_string())?
        .join("photos");
    fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    Ok(dir)
}

fn ext_of(path: &str) -> String {
    Path::new(path)
        .extension()
        .and_then(|s| s.to_str())
        .unwrap_or("jpg")
        .to_lowercase()
}

#[tauri::command]
pub fn save_student_photo(
    app: AppHandle,
    src_path: String,
    student_code: String,
) -> Result<String, String> {
    let ext = ext_of(&src_path);
    if !ALLOWED.contains(&ext.as_str()) {
        return Err("Unsupported image type. Use JPG, PNG, WEBP, GIF or BMP.".to_string());
    }
    let size = fs::metadata(&src_path).map_err(|e| e.to_string())?.len();
    if size > MAX_BYTES {
        return Err("That image is larger than 8 MB.".to_string());
    }

    let safe_code: String = student_code
        .chars()
        .filter(|c| c.is_ascii_alphanumeric() || *c == '-')
        .collect();
    let stamp = chrono::Local::now().format("%Y%m%d%H%M%S");
    let dest = photos_dir(&app)?.join(format!("{safe_code}-{stamp}.{ext}"));
    fs::copy(&src_path, &dest).map_err(|e| e.to_string())?;
    Ok(dest.to_string_lossy().to_string())
}

#[tauri::command]
pub fn delete_student_photo(app: AppHandle, path: String) -> Result<(), String> {
    let dir = photos_dir(&app)?;
    let target = Path::new(&path);
    if target.starts_with(&dir) {
        let _ = fs::remove_file(target);
    }
    Ok(())
}

/// Write base64 bytes to a path the user picked in a save dialog (used for PDF export).
#[tauri::command]
pub fn save_binary_file(dest_path: String, data_b64: String) -> Result<(), String> {
    let bytes = base64::engine::general_purpose::STANDARD
        .decode(data_b64.as_bytes())
        .map_err(|e| e.to_string())?;
    fs::write(&dest_path, bytes).map_err(|e| e.to_string())
}
