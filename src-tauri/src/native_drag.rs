use std::{env, fs, path::Path};

const DRAG_PAYLOAD_FILE_PREFIX: &str = "qow3ciuh";

fn is_drag_payload_file(path: &Path, temp_dir: &Path) -> bool {
    path.parent() == Some(temp_dir)
        && path
            .file_name()
            .and_then(|name| name.to_str())
            .is_some_and(|name| name.starts_with(DRAG_PAYLOAD_FILE_PREFIX))
}

/// Reads the short-lived JSON file used by CrabNebula's native window drag.
///
/// Native file drops continue through Tauri's normal file-drop path. This
/// command only accepts the plugin's prefixed payload file directly inside
/// the operating system temporary directory.
#[tauri::command]
pub fn read_workspace_drag_payload(path: String) -> Result<Option<serde_json::Value>, String> {
    let requested = std::path::PathBuf::from(path);
    let temp_dir = env::temp_dir()
        .canonicalize()
        .map_err(|error| format!("Could not resolve the temporary directory: {error}"))?;
    let resolved = requested
        .canonicalize()
        .map_err(|error| format!("Could not resolve the drag payload: {error}"))?;

    if !is_drag_payload_file(&resolved, &temp_dir) {
        return Ok(None);
    }

    let bytes = fs::read(resolved).map_err(|error| format!("Could not read the drag payload: {error}"))?;
    serde_json::from_slice(&bytes)
        .map(Some)
        .map_err(|error| format!("Could not parse the drag payload: {error}"))
}

#[cfg(test)]
mod tests {
    use super::is_drag_payload_file;
    use std::path::Path;

    #[test]
    fn accepts_only_plugin_payload_files_in_the_temp_root() {
        let temp = Path::new(r"C:\Temp");
        assert!(is_drag_payload_file(
            Path::new(r"C:\Temp\qow3ciuhabcd.tmp"),
            temp
        ));
        assert!(!is_drag_payload_file(
            Path::new(r"C:\Temp\other.tmp"),
            temp
        ));
        assert!(!is_drag_payload_file(
            Path::new(r"C:\Temp\nested\qow3ciuhabcd.tmp"),
            temp
        ));
    }
}
