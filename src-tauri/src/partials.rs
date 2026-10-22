//! The journal of answers that are still being written.
//!
//! An answer that is being written exists in memory until it ends. If the app
//! dies while it is being written, the answer is gone — there was nothing on
//! disk between the message being sent and the answer finishing.
//!
//! This is the journal that closes that window. Each conversation gets a file
//! of its own, and the file is **appended to**: a line is added as the answer
//! grows, and nothing already written is ever rewritten. That makes a write
//! cheap enough to do often, and it makes a crash able to lose only the last
//! line rather than the whole answer.
//!
//! One file per conversation, rather than one file for all of them, because
//! two answers being written at once must not be able to overwrite each
//! other. The conversations themselves live in one file — see `threads.rs` —
//! and that file is written as a whole, which is fine for conversations that
//! are finished and not fine for ones that are not.
//!
//! **The format of a line is the frontend's business.** This side knows where
//! the file lives, that it is a list of lines, and that it only grows. What a
//! line says is decided above this line, the same way `threads.rs` treats the
//! records it stores: as opaque text.
//!
//! The journal is temporary. When the answer ends it is written to the
//! conversation file, and the journal is removed. A journal left behind is a
//! journal whose answer was cut off, and it is found again on the next launch.

use std::fs::{self, OpenOptions};
use std::io::Write;
use std::path::{Path, PathBuf};

use tauri::AppHandle;

use crate::appfile;

/// The directory the journals live in, inside the app's own data folder.
const DIR_NAME: &str = "partials";

/// The extension a journal has. A file without it is not a journal.
const EXTENSION: &str = "jsonl";

/// The names Windows refuses to use for a file.
///
/// A file with one of these names cannot be written on that platform at all,
/// so an id that names one is refused everywhere rather than only where it
/// would fail.
const RESERVED: [&str; 22] = [
    "con", "prn", "aux", "nul", "com1", "com2", "com3", "com4", "com5", "com6", "com7", "com8",
    "com9", "lpt1", "lpt2", "lpt3", "lpt4", "lpt5", "lpt6", "lpt7", "lpt8", "lpt9",
];

fn dir(app: &AppHandle) -> Option<PathBuf> {
    appfile::data_path(app, DIR_NAME)
}

/// The file one conversation's journal is in.
fn file_for(app: &AppHandle, thread_id: &str) -> Result<PathBuf, String> {
    if !valid_id(thread_id) {
        return Err("That is not a conversation id.".to_string());
    }
    let dir = dir(&app).ok_or("The app data folder is unavailable.")?;
    Ok(dir.join(format!("{thread_id}.{EXTENSION}")))
}

/// Whether an id may be used as a file name.
///
/// The id crosses a command boundary, and a path built from an unchecked
/// string is a path traversal: an id of `../../whatever` would put the write
/// somewhere else entirely. So the id is checked here rather than trusted.
///
/// The names Windows refuses are refused too — `con`, `prn`, `aux`, `nul` and
/// the numbered `com` and `lpt` devices — because a file with one of those
/// names cannot be written on that platform at all, and a rule that is only
/// true on some of them is a rule that fails in the worst place.
fn valid_id(id: &str) -> bool {
    if id.is_empty() || id.len() > 64 {
        return false;
    }
    if !id
        .bytes()
        .all(|b| b.is_ascii_alphanumeric() || b == b'-' || b == b'_')
    {
        return false;
    }
    let stem = id.to_ascii_lowercase();
    !RESERVED.contains(&stem.as_str())
}

/// Adds one line to a file.
///
/// The line is written as it is given, with a newline after it. It is not
/// parsed, and not checked: the format belongs to the frontend, and a line
/// that cannot be parsed is the frontend's to notice.
///
/// The file is opened for appending, so nothing already in it is rewritten and
/// a write can only ever add.
fn append_to(path: &Path, line: &str) -> Result<(), String> {
    if let Some(parent) = path.parent() {
        appfile::private_dir(parent)?;
    }

    let mut file = OpenOptions::new()
        .create(true)
        .append(true)
        .open(path)
        .map_err(|e| format!("Could not write the answer in flight: {e}"))?;
    appfile::keep_private(path);

    file.write_all(line.as_bytes())
        .and_then(|_| file.write_all(b"\n"))
        .and_then(|_| file.flush())
        .map_err(|e| format!("Could not write the answer in flight: {e}"))?;

    Ok(())
}

/// Every journal in a directory, with the lines it holds.
///
/// The lines are given as they are on disk. A journal whose last line was cut
/// short by a crash is given whole, and the frontend is the one that knows
/// what a line means — so it is the one that can tell a half-written line from
/// a complete one.
///
/// A journal that cannot be read is left out rather than reported. It is a
/// copy of an answer that is also in memory, and a journal that cannot be
/// read is not worth stopping the app for.
fn read_all(dir: &Path) -> Vec<(String, String)> {
    let entries = match fs::read_dir(dir) {
        Ok(entries) => entries,
        // Nothing has ever been written. That is not an error.
        Err(_) => return Vec::new(),
    };

    let mut found: Vec<(String, String)> = Vec::new();
    for entry in entries.flatten() {
        let path = entry.path();
        if path.extension().and_then(|e| e.to_str()) != Some(EXTENSION) {
            continue;
        }
        let Some(id) = path.file_stem().and_then(|s| s.to_str()) else {
            continue;
        };
        if !valid_id(id) {
            continue;
        }
        let Ok(contents) = fs::read_to_string(&path) else {
            continue;
        };
        found.push((id.to_string(), contents));
    }

    found
}

/// Removes a file.
///
/// Removing one that is not there is not a failure: a journal is removed when
/// the answer ends, and the answer may never have got as far as writing one.
fn remove(path: &Path) -> Result<(), String> {
    match fs::remove_file(path) {
        Ok(()) => Ok(()),
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => Ok(()),
        Err(error) => Err(format!("Could not remove the answer in flight: {error}")),
    }
}

/// Removes every journal in a directory.
///
/// The directory is left, empty, so that the next answer has somewhere to go
/// and does not have to create it.
fn remove_all(dir: &Path) {
    let entries = match fs::read_dir(dir) {
        Ok(entries) => entries,
        Err(_) => return,
    };
    for entry in entries.flatten() {
        let path = entry.path();
        if path.extension().and_then(|e| e.to_str()) != Some(EXTENSION) {
            continue;
        }
        let _ = fs::remove_file(&path);
    }
}

/// Appends one line to a conversation's journal.
///
/// The line is written as it is given, with a newline after it. It is not
/// parsed, and not checked: the format belongs to the frontend, and a line
/// that cannot be parsed is the frontend's to notice.
#[tauri::command]
pub async fn append_partial(
    app: AppHandle,
    thread_id: String,
    line: String,
) -> Result<(), String> {
    let path = file_for(&app, &thread_id)?;
    append_to(&path, &line)
}

/// Every journal that is there, with the lines it holds.
///
/// The lines are given as they are on disk. A journal whose last line was cut
/// short by a crash is given whole, and the frontend is the one that knows
/// what a line means — so it is the one that can tell a half-written line from
/// a complete one.
///
/// A journal that cannot be read is left out rather than reported. It is a
/// copy of an answer that is also in memory, and a journal that cannot be
/// read is not worth stopping the app for.
#[tauri::command]
pub async fn read_partials(app: AppHandle) -> Result<String, String> {
    let dir = dir(&app).ok_or("The app data folder is unavailable.")?;
    let found: Vec<serde_json::Value> = read_all(&dir)
        .into_iter()
        .map(|(id, contents)| serde_json::json!({ "id": id, "contents": contents }))
        .collect();
    serde_json::to_string(&found).map_err(|e| format!("The answers in flight could not be read: {e}"))
}

/// Removes one conversation's journal.
///
/// Removing a journal that is not there is not a failure: the journal is
/// removed when the answer ends, and the answer may never have got as far as
/// writing one.
#[tauri::command]
pub async fn clear_partial(app: AppHandle, thread_id: String) -> Result<(), String> {
    let path = file_for(&app, &thread_id)?;
    remove(&path)
}

/// Removes every journal.
///
/// The directory is left, empty, so that the next answer has somewhere to go
/// and does not have to create it.
#[tauri::command]
pub async fn clear_partials(app: AppHandle) -> Result<(), String> {
    let dir = dir(&app).ok_or("The app data folder is unavailable.")?;
    remove_all(&dir);
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::{EXTENSION, RESERVED, append_to, read_all, remove, remove_all, valid_id};
    use std::fs;
    use std::path::{Path, PathBuf};

    /// A scratch directory of the app's own, emptied first.
    fn scratch(name: &str) -> PathBuf {
        let dir = std::env::temp_dir().join(format!("tavi-partials-{name}"));
        let _ = fs::remove_dir_all(&dir);
        fs::create_dir_all(&dir).expect("the scratch directory should be creatable");
        dir
    }

    fn journal(dir: &Path, id: &str) -> PathBuf {
        dir.join(format!("{id}.{EXTENSION}"))
    }

    #[test]
    fn an_id_is_only_letters_digits_dashes_and_underscores() {
        assert!(valid_id("c-mfz3k-8a2b1c"));
        assert!(valid_id("s-mfz3k-8a2b1c"));
        assert!(!valid_id(""));
        assert!(!valid_id("c-mfz3k-8a2b1c/../other"));
        assert!(!valid_id("../../etc/passwd"));
        assert!(!valid_id("c mfz3k"));
        assert!(!valid_id("c\\mfz3k"));
        assert!(!valid_id(&"a".repeat(65)));
    }

    /// Windows will not write a file with one of these names, so an id that
    /// names one is refused on every platform rather than only on the one
    /// where it would fail.
    #[test]
    fn the_names_windows_refuses_are_refused() {
        for name in RESERVED {
            assert!(!valid_id(name), "{name} should be refused");
            assert!(!valid_id(&name.to_uppercase()));
        }
        assert!(valid_id("c-con"));
    }

    #[test]
    fn the_extension_is_what_a_journal_ends_in() {
        assert_eq!(EXTENSION, "jsonl");
        let path = PathBuf::from("c-mfz3k-8a2b1c.jsonl");
        assert_eq!(path.extension().and_then(|e| e.to_str()), Some("jsonl"));
    }

    /// The journal holds what was written to it, and nothing else is added.
    #[test]
    fn a_journal_holds_the_lines_written_to_it() {
        let dir = scratch("round-trip");
        let path = journal(&dir, "c-one");
        append_to(&path, "first").expect("the write should work");
        append_to(&path, "second").expect("the second write should work");
        let found = read_all(&dir);
        assert_eq!(found.len(), 1);
        assert_eq!(found[0].0, "c-one");
        assert_eq!(found[0].1, "first\nsecond\n");
        let _ = fs::remove_dir_all(&dir);
    }

    /// A journal is only ever added to. Nothing already in it is rewritten, so
    /// a write can lose at most the line that was in flight.
    #[test]
    fn a_journal_only_ever_grows() {
        let dir = scratch("grows");
        let path = journal(&dir, "c-one");
        append_to(&path, "first").expect("the write should work");
        let after_first = fs::read_to_string(&path).expect("the journal should be readable");
        append_to(&path, "second").expect("the second write should work");
        let after_second = fs::read_to_string(&path).expect("the journal should be readable");
        assert!(
            after_second.starts_with(&after_first),
            "the earlier lines should still be there"
        );
        let _ = fs::remove_dir_all(&dir);
    }

    /// Two conversations being written at once must not be able to overwrite
    /// each other. That is the whole reason there is a file per conversation.
    #[test]
    fn two_journals_do_not_interfere() {
        let dir = scratch("two");
        append_to(&journal(&dir, "c-one"), "the first answer").expect("the write should work");
        append_to(&journal(&dir, "c-two"), "the second answer").expect("the write should work");
        let found = read_all(&dir);
        assert_eq!(found.len(), 2);
        let one = found.iter().find(|(id, _)| id == "c-one").expect("the first should be there");
        let two = found.iter().find(|(id, _)| id == "c-two").expect("the second should be there");
        assert_eq!(one.1, "the first answer\n");
        assert_eq!(two.1, "the second answer\n");
        let _ = fs::remove_dir_all(&dir);
    }

    /// A journal that is removed is gone, and removing one that was never
    /// there is not a failure.
    #[test]
    fn a_journal_can_be_removed() {
        let dir = scratch("removed");
        let path = journal(&dir, "c-one");
        append_to(&path, "an answer").expect("the write should work");
        remove(&path).expect("the removal should work");
        assert!(read_all(&dir).is_empty());
        remove(&path).expect("removing it twice should not be a failure");
        let _ = fs::remove_dir_all(&dir);
    }

    /// Every journal can be removed at once, and the directory is left so
    /// that the next answer has somewhere to go.
    #[test]
    fn every_journal_can_be_removed() {
        let dir = scratch("all-removed");
        append_to(&journal(&dir, "c-one"), "one").expect("the write should work");
        append_to(&journal(&dir, "c-two"), "two").expect("the write should work");
        remove_all(&dir);
        assert!(read_all(&dir).is_empty());
        assert!(dir.exists(), "the directory should be left for the next answer");
        let _ = fs::remove_dir_all(&dir);
    }

    /// A file that is not a journal is not a journal.
    #[test]
    fn a_file_that_is_not_a_journal_is_left_out() {
        let dir = scratch("not-a-journal");
        fs::write(dir.join("notes.txt"), "hello").expect("the file should be written");
        append_to(&journal(&dir, "c-one"), "an answer").expect("the write should work");
        let found = read_all(&dir);
        assert_eq!(found.len(), 1);
        assert_eq!(found[0].0, "c-one");
        let _ = fs::remove_dir_all(&dir);
    }

    /// The journal holds a model's answers, so it belongs to its owner alone.
    #[cfg(unix)]
    #[test]
    fn the_journal_is_kept_to_its_owner() {
        use std::os::unix::fs::PermissionsExt;

        let dir = scratch("private");
        let path = journal(&dir, "c-one");
        append_to(&path, "an answer").expect("the write should work");

        let file_mode = fs::metadata(&path).expect("the journal should be there").permissions().mode();
        assert_eq!(file_mode & 0o777, 0o600, "the journal should be readable only by its owner");

        let dir_mode = fs::metadata(&dir).expect("the directory should be there").permissions().mode();
        assert_eq!(dir_mode & 0o777, 0o700, "the directory should be reachable only by its owner");

        let _ = fs::remove_dir_all(&dir);
    }
}
