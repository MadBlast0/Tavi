//! Where the app's own data lives, and getting it out of there.
//!
//! A user's conversations are theirs. They can be taken out of the app in a
//! file they can read, and put back in again, and they can be removed
//! entirely. This is the Rust side of that: where the data is, and the two
//! file operations that need to happen on the machine rather than in the
//! webview.

use std::path::PathBuf;

use tauri::AppHandle;

use crate::appfile;

/// The file the conversations are kept in.
const THREADS_FILE: &str = "threads.json";

/// Where the app's data is.
///
/// The path comes from the app's identifier, not from anything anybody typed,
/// so it is the same on every machine that runs the same build.
#[tauri::command]
pub async fn data_directory(app: AppHandle) -> Result<String, String> {
    let path = appfile::data_path(&app, THREADS_FILE)
        .ok_or("The app data folder is unavailable.")?;
    let dir = path
        .parent()
        .ok_or("The app data folder is unavailable.")?;
    Ok(dir.to_string_lossy().to_string())
}

/// Writes a file the user chose.
///
/// The path comes from the system dialog, so it is a path they picked, and the
/// write is theirs to make. Nothing here is read from the app: this is the
/// escape hatch, and it does not need to know what it is writing.
#[tauri::command]
pub async fn write_file(path: String, contents: String) -> Result<(), String> {
    let target = PathBuf::from(path.trim());
    if target.as_os_str().is_empty() {
        return Err("No file was chosen.".to_string());
    }
    if let Some(dir) = target.parent() {
        std::fs::create_dir_all(dir)
            .map_err(|e| format!("Could not create {}: {e}", dir.display()))?;
    }
    std::fs::write(&target, contents)
        .map_err(|e| format!("Could not write {}: {e}", target.display()))
}

/// Reads a file the user chose.
///
/// The file is read as it is. What is in it is the caller's business, and a
/// backup that is read and then refused is still a file the user could read
/// themselves.
#[tauri::command]
pub async fn read_file(path: String) -> Result<String, String> {
    let target = PathBuf::from(path.trim());
    if target.as_os_str().is_empty() {
        return Err("No file was chosen.".to_string());
    }
    std::fs::read_to_string(&target)
        .map_err(|e| format!("Could not read {}: {e}", target.display()))
}

#[cfg(test)]
mod tests {
    use super::{read_file, write_file};
    use std::fs;
    use std::path::PathBuf;

    fn scratch(name: &str) -> PathBuf {
        let dir = std::env::temp_dir().join(format!("tavi-files-{name}"));
        let _ = fs::remove_dir_all(&dir);
        fs::create_dir_all(&dir).expect("the scratch directory should be creatable");
        dir.join("thing.json")
    }

    #[test]
    fn a_file_is_written_and_read_back() {
        let path = scratch("round-trip");
        write_file(path.to_string_lossy().to_string(), "hello".to_string())
            .expect("the write should work");
        assert_eq!(
            read_file(path.to_string_lossy().to_string()).expect("the read should work"),
            "hello"
        );
        let _ = fs::remove_dir_all(path.parent().unwrap());
    }

    #[test]
    fn an_empty_path_is_refused() {
        assert!(write_file("   ".to_string(), "hello".to_string()).is_err());
        assert!(read_file("   ".to_string()).is_err());
    }
}
