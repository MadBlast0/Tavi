//! The provider's own files.
//!
//! Everything the app owns on disk lives in one directory, resolved from the
//! app's identifier rather than from a path anybody typed. The files are
//! written the same way: a temporary file, then a move into place, so a crash
//! halfway through leaves the last good file rather than half a file.

use std::fs;
use std::path::{Path, PathBuf};

use tauri::{AppHandle, Manager};

/// Where a file of the app's own lives.
pub fn data_path(app: &AppHandle, name: &str) -> Option<PathBuf> {
    Some(app.path().app_data_dir().ok()?.join(name))
}

/// Reads a file, if it is there.
pub fn read_string(path: &Path) -> Option<String> {
    fs::read_to_string(path).ok()
}

/// Writes a file, atomically.
///
/// The previous file is kept beside it, so a file that turns out to be
/// unreadable can still be recovered from the copy.
pub fn write_atomic(path: &Path, contents: &str) -> Result<(), String> {
    let dir = path
        .parent()
        .ok_or("The app data folder is unavailable.")?;
    fs::create_dir_all(dir).map_err(|e| format!("Could not create {}: {e}", dir.display()))?;

    if path.exists() {
        let _ = fs::copy(path, backup_path(path));
    }

    let temp = path.with_extension("tmp");
    fs::write(&temp, contents).map_err(|e| format!("Could not write {}: {e}", temp.display()))?;
    fs::rename(&temp, path).map_err(|e| format!("Could not replace {}: {e}", path.display()))?;
    Ok(())
}

/// Writes a file, atomically, and keeps it to its owner.
///
/// A file of the app's own that holds something identifying — a masked key, an
/// account name — is a fingerprint: the last four characters of a key are
/// four characters of the key. The mode is set explicitly, because the
/// default is `0644` and a umask can only ever take bits away, so a file
/// created without one is world-readable.
///
/// On Windows the mode is a no-op — the platform has no such bit — and the
/// file inherits the directory's ACL, which is the user's alone. Setting
/// anything there would be pretending.
pub fn write_private(path: &Path, contents: &str) -> Result<(), String> {
    write_atomic(path, contents)?;

    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;

        if let Some(dir) = path.parent() {
            let _ = fs::set_permissions(
                dir,
                fs::Permissions::from_mode(0o700),
            );
        }
        let _ = fs::set_permissions(path, fs::Permissions::from_mode(0o600));
    }

    Ok(())
}

/// The copy kept beside a file.
pub fn backup_path(path: &Path) -> PathBuf {
    path.with_extension("json.bak")
}

#[cfg(test)]
mod tests {
    use super::{backup_path, read_string, write_atomic, write_private};
    use std::fs;
    use std::path::PathBuf;

    fn scratch(name: &str) -> PathBuf {
        let dir = std::env::temp_dir().join(format!("tavi-appfile-{name}"));
        let _ = fs::remove_dir_all(&dir);
        fs::create_dir_all(&dir).expect("the scratch directory should be creatable");
        dir.join("thing.json")
    }

    #[test]
    fn a_file_is_written_and_read_back() {
        let path = scratch("round-trip");
        write_atomic(&path, "hello").expect("the write should work");
        assert_eq!(read_string(&path).as_deref(), Some("hello"));
        let _ = fs::remove_dir_all(path.parent().unwrap());
    }

    #[test]
    fn the_previous_file_is_kept_beside_the_new_one() {
        let path = scratch("backup");
        write_atomic(&path, "first").expect("the first write should work");
        write_atomic(&path, "second").expect("the second write should work");

        let backup = backup_path(&path);
        assert_eq!(read_string(&backup).as_deref(), Some("first"));
        assert_eq!(read_string(&path).as_deref(), Some("second"));
        let _ = fs::remove_dir_all(path.parent().unwrap());
    }

    /// A file that is not there reads as nothing rather than as an error.
    #[test]
    fn an_absent_file_reads_as_nothing() {
        let path = scratch("absent");
        assert_eq!(read_string(&path), None);
        let _ = fs::remove_dir_all(path.parent().unwrap());
    }

    /// A private file is written and read back like any other, and — on the
    /// platforms that have such a thing — is kept to its owner.
    #[test]
    fn a_private_file_is_written_and_read_back() {
        let path = scratch("private");
        write_private(&path, "hello").expect("the write should work");
        assert_eq!(read_string(&path).as_deref(), Some("hello"));

        #[cfg(unix)]
        {
            use std::os::unix::fs::PermissionsExt;
            let mode = fs::metadata(&path).unwrap().permissions().mode() & 0o777;
            assert_eq!(mode, 0o600, "the file should be readable only by its owner");
        }

        let _ = fs::remove_dir_all(path.parent().unwrap());
    }
}
