//! The durable store for conversations.
//!
//! On the desktop the conversations are the app's own data: they belong in the
//! app-data directory, written by Rust, and they survive the webview's storage
//! being cleared. The website has no such directory and keeps them in browser
//! storage instead — the shape is the same either way, and the TypeScript side
//! is what tells the two apart.
//!
//! One file holds both collections. A chat and a code session are the same kind
//! of thing, written by the same app at the same time, so they belong in one
//! place: two files would be two things to keep in step, and a backup of one
//! would be a backup of half the history.
//!
//! The write is atomic — a temporary file, then a move into place — and the
//! previous file is kept beside it. A crash halfway through leaves the last
//! good file rather than half a file, and a file that is somehow unreadable
//! can be recovered from the copy.

use std::fs;
use std::path::{Path, PathBuf};

use serde::{Deserialize, Serialize};
use serde_json::Value;
use tauri::{AppHandle, Manager, State};

const FILE_NAME: &str = "threads.json";
const BACKUP_NAME: &str = "threads.json.bak";
const TEMP_NAME: &str = "threads.json.tmp";

/// The version of the file's shape.
///
/// A build that finds a file it does not understand leaves it alone rather than
/// overwriting it: that file is somebody's history, and overwriting it is the
/// one thing here that could not be undone.
const FILE_VERSION: u32 = 1;

/// The file on disk.
///
/// The records themselves are opaque to Rust. This side knows where they live
/// and that they are a list; what a turn is, and what a chat is allowed to
/// carry, is the frontend's business, and a shape it grows does not need a
/// change over here.
#[derive(Serialize, Deserialize)]
struct ThreadFile {
    version: u32,
    #[serde(default = "empty_array")]
    chats: Value,
    #[serde(default = "empty_array")]
    sessions: Value,
}

fn empty_array() -> Value {
    Value::Array(Vec::new())
}

fn empty_file() -> ThreadFile {
    ThreadFile {
        version: FILE_VERSION,
        chats: empty_array(),
        sessions: empty_array(),
    }
}

/// Which collection a record belongs to.
#[derive(Clone, Copy, PartialEq, Eq)]
pub enum Kind {
    Chats,
    Sessions,
}

impl Kind {
    fn parse(value: &str) -> Result<Self, String> {
        match value {
            "chats" => Ok(Kind::Chats),
            "sessions" => Ok(Kind::Sessions),
            other => Err(format!("Unknown thread collection: {other}")),
        }
    }

    fn slot<'a>(&self, file: &'a mut ThreadFile) -> &'a mut Value {
        match self {
            Kind::Chats => &mut file.chats,
            Kind::Sessions => &mut file.sessions,
        }
    }
}

/// The conversations, as they are on disk.
///
/// The lock is here because the two collections share one file: a chat being
/// written and a session being written at the same moment must not each read
/// the file and then each write their own version of it back.
#[derive(Default)]
pub struct Threads {
    lock: std::sync::Mutex<()>,
}

fn file_path(app: &AppHandle) -> Option<PathBuf> {
    Some(app.path().app_data_dir().ok()?.join(FILE_NAME))
}

/// Read the file, or the backup beside it.
///
/// `Ok(None)` means there is nothing stored yet, which is a normal state for an
/// app that has never been used. `Err` means there is something stored that
/// cannot be read, and writing over it would destroy it.
fn read_at(path: &Path) -> Result<Option<ThreadFile>, String> {
    match fs::read_to_string(path) {
        Ok(raw) => match serde_json::from_str::<ThreadFile>(&raw) {
            Ok(file) if file.version == FILE_VERSION => Ok(Some(file)),
            Ok(_) => Err(
                "The conversations were written by another version of the app. They have been left alone."
                    .to_string(),
            ),
            Err(_) => Err("The conversations file could not be read. It has been left alone.".to_string()),
        },
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => {
            // The file is not there. The backup might be, from a write that was
            // interrupted after the copy and before the move.
            let backup = path.with_file_name(BACKUP_NAME);
            match fs::read_to_string(&backup) {
                Ok(raw) => match serde_json::from_str::<ThreadFile>(&raw) {
                    Ok(file) if file.version == FILE_VERSION => Ok(Some(file)),
                    _ => Ok(None),
                },
                Err(_) => Ok(None),
            }
        }
        Err(error) => Err(format!(
            "The conversations file could not be read: {error}"
        )),
    }
}

/// Write the file, atomically, keeping the previous one beside it.
fn write_at(path: &Path, file: &ThreadFile) -> Result<(), String> {
    let dir = path
        .parent()
        .ok_or("The app data folder is unavailable.")?;
    fs::create_dir_all(dir).map_err(|e| format!("Could not create {}: {e}", dir.display()))?;

    if path.exists() {
        // The previous file is kept, so a file that turns out to be unreadable
        // can still be recovered from the copy.
        let _ = fs::copy(path, path.with_file_name(BACKUP_NAME));
    }

    let json = serde_json::to_string_pretty(file)
        .map_err(|e| format!("Could not encode the conversations: {e}"))?;
    let temp = path.with_file_name(TEMP_NAME);
    fs::write(&temp, json).map_err(|e| format!("Could not write {}: {e}", temp.display()))?;
    fs::rename(&temp, path).map_err(|e| format!("Could not replace {}: {e}", path.display()))?;
    Ok(())
}

/// Every record in one collection, as a JSON array.
#[tauri::command]
pub async fn read_threads(
    app: AppHandle,
    threads: State<'_, Threads>,
    kind: String,
) -> Result<String, String> {
    let kind = Kind::parse(&kind)?;
    let _guard = threads
        .lock
        .lock()
        .map_err(|_| "The conversations are busy.".to_string())?;

    let path = file_path(&app).ok_or("The app data folder is unavailable.")?;
    let Some(mut file) = read_at(&path)? else {
        return Ok("[]".to_string());
    };
    let records = kind.slot(&mut file).clone();
    serde_json::to_string(&records).map_err(|e| format!("Could not encode the conversations: {e}"))
}

/// Replace one collection with the records given.
#[tauri::command]
pub async fn write_threads(
    app: AppHandle,
    threads: State<'_, Threads>,
    kind: String,
    records: String,
) -> Result<(), String> {
    let kind = Kind::parse(&kind)?;
    let parsed: Value = serde_json::from_str(&records)
        .map_err(|e| format!("The conversations could not be read: {e}"))?;
    if !parsed.is_array() {
        return Err("The conversations are not a list.".to_string());
    }

    let _guard = threads
        .lock
        .lock()
        .map_err(|_| "The conversations are busy.".to_string())?;

    let path = file_path(&app).ok_or("The app data folder is unavailable.")?;
    let mut file = read_at(&path)?.unwrap_or_else(empty_file);
    *kind.slot(&mut file) = parsed;
    write_at(&path, &file)
}

/// Remove one collection, keeping the other.
#[tauri::command]
pub async fn clear_threads(
    app: AppHandle,
    threads: State<'_, Threads>,
    kind: String,
) -> Result<(), String> {
    let kind = Kind::parse(&kind)?;

    let _guard = threads
        .lock
        .lock()
        .map_err(|_| "The conversations are busy.".to_string())?;

    let path = file_path(&app).ok_or("The app data folder is unavailable.")?;
    let mut file = read_at(&path)?.unwrap_or_else(empty_file);
    *kind.slot(&mut file) = empty_array();
    write_at(&path, &file)
}

#[cfg(test)]
mod tests {
    use super::{BACKUP_NAME, FILE_VERSION, Kind, ThreadFile, empty_array, read_at, write_at};
    use serde_json::json;
    use std::fs;
    use std::path::{Path, PathBuf};

    /// A directory of its own for each test, so they cannot see each other's
    /// files and a failure cannot leave something behind in the user's data.
    fn scratch(name: &str) -> PathBuf {
        let dir = std::env::temp_dir().join(format!("tavi-threads-{name}"));
        let _ = fs::remove_dir_all(&dir);
        fs::create_dir_all(&dir).expect("the scratch directory should be creatable");
        dir.join("threads.json")
    }

    fn file_with(chats: serde_json::Value) -> ThreadFile {
        ThreadFile {
            version: FILE_VERSION,
            chats,
            sessions: empty_array(),
        }
    }

    #[test]
    fn a_file_that_is_not_there_is_not_an_error() {
        let path = scratch("absent");
        assert!(read_at(&path).expect("an absent file is not a failure").is_none());
        let _ = fs::remove_dir_all(path.parent().unwrap());
    }

    #[test]
    fn records_survive_a_write_and_a_read() {
        let path = scratch("round-trip");
        write_at(&path, &file_with(json!([{ "id": "c-1", "title": "hello" }]))).expect("the write should work");

        let read = read_at(&path)
            .expect("the read should work")
            .expect("the file should be there");
        assert_eq!(read.chats[0]["id"], "c-1");
        let _ = fs::remove_dir_all(path.parent().unwrap());
    }

    #[test]
    fn the_previous_file_is_kept_beside_the_new_one() {
        let path = scratch("backup");
        write_at(&path, &file_with(json!([{ "id": "c-1" }]))).expect("the first write should work");
        write_at(&path, &file_with(json!([{ "id": "c-2" }]))).expect("the second write should work");

        let backup = path.with_file_name(BACKUP_NAME);
        assert!(backup.exists(), "the previous file should have been kept");

        let kept: ThreadFile =
            serde_json::from_str(&fs::read_to_string(&backup).expect("the backup should read"))
                .expect("the backup should parse");
        assert_eq!(kept.chats[0]["id"], "c-1");
        let _ = fs::remove_dir_all(path.parent().unwrap());
    }

    /// A file this build does not understand is somebody's history. It is left
    /// where it is rather than replaced by an empty one.
    #[test]
    fn a_file_of_an_unknown_version_is_refused_rather_than_replaced() {
        let path = scratch("unknown-version");
        fs::write(&path, r#"{ "version": 99, "chats": [{ "id": "c-1" }] }"#)
            .expect("the file should be written");

        let outcome = read_at(&path);
        assert!(outcome.is_err(), "an unknown version should be refused");

        let raw = fs::read_to_string(&path).expect("the file should still be there");
        assert!(raw.contains("c-1"), "the file should not have been touched");
        let _ = fs::remove_dir_all(path.parent().unwrap());
    }

    /// A file that cannot be parsed is the same: it is not this build's to
    /// replace.
    #[test]
    fn an_unreadable_file_is_refused_rather_than_replaced() {
        let path = scratch("unreadable");
        fs::write(&path, "{ not json").expect("the file should be written");

        assert!(read_at(&path).is_err(), "an unreadable file should be refused");
        let _ = fs::remove_dir_all(path.parent().unwrap());
    }

    /// A backup left by an interrupted write is used when the file it belongs
    /// to is not there.
    #[test]
    fn a_backup_is_used_when_the_file_is_missing() {
        let path = scratch("recover");
        write_at(&path, &file_with(json!([{ "id": "c-1" }]))).expect("the write should work");
        let backup = path.with_file_name(BACKUP_NAME);
        fs::copy(&path, &backup).expect("the backup should be made");
        fs::remove_file(&path).expect("the file should be removed");

        let read = read_at(&path)
            .expect("the read should work")
            .expect("the backup should have been used");
        assert_eq!(read.chats[0]["id"], "c-1");
        let _ = fs::remove_dir_all(path.parent().unwrap());
    }

    #[test]
    fn the_two_collections_are_separate() {
        let path = scratch("collections");
        let mut file = file_with(json!([{ "id": "c-1" }]));
        *Kind::Sessions.slot(&mut file) = json!([{ "id": "s-1" }]);
        write_at(&path, &file).expect("the write should work");

        let read = read_at(&path)
            .expect("the read should work")
            .expect("the file should be there");
        assert_eq!(read.chats[0]["id"], "c-1");
        assert_eq!(read.sessions[0]["id"], "s-1");
        let _ = fs::remove_dir_all(path.parent().unwrap());
    }

    #[test]
    fn an_unknown_collection_is_refused() {
        assert!(Kind::parse("nope").is_err());
        assert!(Kind::parse("chats").is_ok());
        assert!(Kind::parse("sessions").is_ok());
    }

    /// The path a test uses is inside its own scratch directory, so a test
    /// that wrote outside it would be visible.
    #[test]
    fn the_scratch_path_is_where_it_should_be() {
        let path = scratch("path");
        assert!(path.starts_with(Path::new(&std::env::temp_dir())));
        let _ = fs::remove_dir_all(path.parent().unwrap());
    }
}
