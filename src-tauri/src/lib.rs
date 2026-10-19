use std::fs;
use std::path::{Component, Path, PathBuf};

use serde::Serialize;

/// Filesystem commands backing the `list_directory` and `read_text_file` tools.
///
/// Model-authored input is untrusted, so every path is confined to a single
/// allowed root. Set `AI_APP_FS_ROOT` to narrow this further; it defaults to the
/// user's home directory.
#[derive(Debug, Serialize)]
pub struct DirEntry {
    name: String,
    path: String,
    is_directory: bool,
    size: Option<u64>,
}

#[derive(Debug, Serialize)]
pub struct ReadFileResult {
    path: String,
    text: String,
    truncated: bool,
    bytes: u64,
}

/// The one directory tree these commands may touch.
fn fs_root() -> Result<PathBuf, String> {
    let root = std::env::var("AI_APP_FS_ROOT")
        .map(PathBuf::from)
        .unwrap_or_else(|_| {
            std::env::var("HOME")
                .or_else(|_| std::env::var("USERPROFILE"))
                .map(PathBuf::from)
                .unwrap_or_else(|_| PathBuf::from("."))
        });

    // Canonicalise once so later comparisons are against real, symlink-resolved
    // paths rather than whatever the caller spelled.
    root.canonicalize()
        .map_err(|e| format!("Filesystem root is unavailable: {e}"))
}

/// Resolve a caller-supplied path and prove it stays inside the root.
///
/// `canonicalize` resolves symlinks and `..`, so this rejects traversal
/// sequences and symlinks that point outside the root.
fn resolve_within_root(input: &str) -> Result<PathBuf, String> {
    if input.trim().is_empty() {
        return Err("Path must not be empty.".to_string());
    }

    let root = fs_root()?;
    let candidate = Path::new(input);

    // A relative path is interpreted relative to the root; an absolute one must
    // already be inside it.
    let joined = if candidate.is_absolute() {
        candidate.to_path_buf()
    } else {
        root.join(candidate)
    };

    let resolved = joined
        .canonicalize()
        .map_err(|e| format!("Cannot open {}: {e}", joined.display()))?;

    if !resolved.starts_with(&root) {
        return Err(format!(
            "{} is outside the permitted directory.",
            resolved.display()
        ));
    }

    // Defence in depth: reject a resolved path that still contains parent hops.
    if resolved
        .components()
        .any(|c| matches!(c, Component::ParentDir))
    {
        return Err("Path escapes the permitted directory.".to_string());
    }

    Ok(resolved)
}

#[tauri::command]
fn list_directory(path: String) -> Result<Vec<DirEntry>, String> {
    let resolved = resolve_within_root(&path)?;

    let metadata = fs::metadata(&resolved)
        .map_err(|e| format!("Cannot read {}: {e}", resolved.display()))?;
    if !metadata.is_dir() {
        return Err(format!("{} is not a directory.", resolved.display()));
    }

    let entries = fs::read_dir(&resolved)
        .map_err(|e| format!("Cannot list {}: {e}", resolved.display()))?
        .filter_map(|entry| {
            let entry = entry.ok()?;
            let metadata = entry.metadata().ok()?;
            Some(DirEntry {
                name: entry.file_name().to_string_lossy().to_string(),
                path: entry.path().to_string_lossy().to_string(),
                is_directory: metadata.is_dir(),
                size: if metadata.is_dir() {
                    None
                } else {
                    Some(metadata.len())
                },
            })
        })
        .collect::<Vec<_>>();

    // Stable, human-friendly ordering: folders first, then names.
    let mut entries = entries;
    entries.sort_by(|a, b| {
        b.is_directory
            .cmp(&a.is_directory)
            .then_with(|| a.name.to_lowercase().cmp(&b.name.to_lowercase()))
    });
    Ok(entries)
}

#[tauri::command]
fn read_text_file(path: String, max_bytes: Option<u64>) -> Result<ReadFileResult, String> {
    const DEFAULT_CAP: u64 = 256 * 1024;
    const HARD_CAP: u64 = 2_000_000;

    let resolved = resolve_within_root(&path)?;

    let metadata = fs::metadata(&resolved)
        .map_err(|e| format!("Cannot read {}: {e}", resolved.display()))?;
    if metadata.is_dir() {
        return Err(format!("{} is a directory, not a file.", resolved.display()));
    }

    let cap = max_bytes
        .unwrap_or(DEFAULT_CAP)
        .clamp(1, HARD_CAP);

    let bytes = fs::read(&resolved)
        .map_err(|e| format!("Cannot read {}: {e}", resolved.display()))?;
    let total = bytes.len() as u64;
    let truncated = total > cap;
    let slice = if truncated { &bytes[..cap as usize] } else { &bytes[..] };

    // Lossy rather than failing outright: a stray byte should not break a read.
    let text = String::from_utf8_lossy(slice).to_string();

    Ok(ReadFileResult {
        path: resolved.to_string_lossy().to_string(),
        text,
        truncated,
        bytes: total,
    })
}

// --- System font discovery ----------------------------------------------------
//
// The Appearance settings offer a font picker listing what is actually installed
// on this machine, which is a question only the operating system can answer:
// Windows keeps a DirectWrite registry, macOS a Core Text one, Linux a
// Fontconfig database. font-kit fronts all three, so there is one call here
// rather than three platform modules.
//
// Enumeration is deliberately not a hardcoded list. The families installed on a
// given machine differ by OS version, by user account and by whatever font
// packages are present, so a list written into the binary would be a fiction
// that looks authoritative — and would name fonts that do not render.

// The brief notes that `Source` must be in scope for `all_families()`. In
// font-kit 0.14 it is an inherent method on `SystemSource`, and importing the
// trait is a warning rather than a requirement — so it is left out.
use font_kit::source::SystemSource;

/// Trim, drop blanks, dedupe case-insensitively, sort.
///
/// Kept separate from the backend call so it can be tested without a machine
/// that happens to have the developer's fonts on it — which is the only way a
/// test of this can be worth running on anyone else's machine.
///
/// The first spelling of a name wins, so the one the OS reports first is the
/// one shown; a backend that reports both "Arial" and "arial" gives one entry,
/// not two that differ only in case.
///
/// Ordering is by lowercase name, with the exact name as a tiebreak so that two
/// names differing only in case cannot swap places between runs.
fn normalize_families(names: Vec<String>) -> Vec<String> {
    let mut seen: Vec<String> = Vec::new();
    let mut folded: Vec<String> = Vec::new();

    for name in names {
        let trimmed = name.trim();
        if trimmed.is_empty() {
            continue;
        }
        let key = trimmed.to_lowercase();
        if folded.iter().any(|existing| *existing == key) {
            continue;
        }
        folded.push(key);
        seen.push(trimmed.to_string());
    }

    seen.sort_by(|a, b| {
        a.to_lowercase()
            .cmp(&b.to_lowercase())
            .then_with(|| a.cmp(b))
    });
    seen
}

/// The font families installed for this user, alphabetically.
///
/// Returns an empty list rather than an error when the platform reports no
/// families: a machine with no fonts is a strange machine, not a broken one,
/// and the UI distinguishes "nothing found" from "discovery failed".
///
/// Enumeration scans a system database and can take a moment, so it runs on the
/// blocking pool rather than on the async runtime's own threads — an `async fn`
/// does not make synchronous work non-blocking.
#[tauri::command]
async fn list_installed_fonts() -> Result<Vec<String>, String> {
    let families = tauri::async_runtime::spawn_blocking(|| {
        let source = SystemSource::new();
        source
            .all_families()
            .map_err(|error| format!("System font discovery failed: {error}"))
    })
    .await
    .map_err(|e| format!("Font discovery did not finish: {e}"))??;

    Ok(normalize_families(families))
}

// Learn more about Tauri commands at https://tauri.app/develop/calling-rust/
#[tauri::command]
fn greet(name: &str) -> String {
    format!("Hello, {}! You've been greeted from Rust!", name)
}

// --- Provider API key, held in the OS credential store -----------------------
//
// The key never touches disk in plaintext and never reaches a log. The webview
// asks for it per request and attaches it as a bearer header to the loopback
// chat server, which forwards it upstream. See docs/plan §9.2 for the residual
// risk this accepts.

const KEY_SERVICE: &str = "ai-app";
const KEY_USER: &str = "openrouter-api-key";

fn entry() -> Result<keyring::Entry, String> {
    keyring::Entry::new(KEY_SERVICE, KEY_USER)
        .map_err(|e| format!("Credential store unavailable: {e}"))
}

#[tauri::command]
fn set_api_key(key: String) -> Result<(), String> {
    let key = key.trim().to_string();
    if key.is_empty() {
        return Err("Key must not be empty.".to_string());
    }
    entry()?.set_password(&key).map_err(|e| format!("Could not store key: {e}"))
}

#[tauri::command]
fn get_api_key() -> Result<Option<String>, String> {
    match entry()?.get_password() {
        Ok(key) => Ok(Some(key)),
        // Absent is a normal state, not a failure.
        Err(keyring::Error::NoEntry) => Ok(None),
        Err(e) => Err(format!("Could not read key: {e}")),
    }
}

#[tauri::command]
fn clear_api_key() -> Result<(), String> {
    match entry()?.delete_credential() {
        Ok(()) | Err(keyring::Error::NoEntry) => Ok(()),
        Err(e) => Err(format!("Could not clear key: {e}")),
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .invoke_handler(tauri::generate_handler![
            greet,
            list_directory,
            read_text_file,
            set_api_key,
            get_api_key,
            clear_api_key,
            list_installed_fonts
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

#[cfg(test)]
mod tests {
    use super::{SystemSource, normalize_families};

    fn names(input: &[&str]) -> Vec<String> {
        normalize_families(input.iter().map(|s| s.to_string()).collect())
    }

    #[test]
    fn trims_surrounding_whitespace() {
        assert_eq!(names(&["  Inter  ", "\tRoboto\n"]), ["Inter", "Roboto"]);
    }

    #[test]
    fn discards_empty_and_whitespace_only() {
        assert_eq!(names(&["", "   ", "Inter", "\t\n"]), ["Inter"]);
    }

    #[test]
    fn dedupes_case_insensitively_keeping_the_first_spelling() {
        assert_eq!(names(&["arial", "Arial", "ARIAL"]), ["arial"]);
    }

    #[test]
    fn sorts_case_insensitively() {
        assert_eq!(
            names(&["roboto", "Inter", "arial", "Zapfino"]),
            ["arial", "Inter", "roboto", "Zapfino"]
        );
    }

    #[test]
    fn keeps_the_first_spelling_when_names_differ_only_in_case() {
        // Dedupe runs before sort, so whichever spelling the backend reported
        // first is the one shown. The point is that the pair collapses to one
        // entry rather than appearing twice in different cases.
        assert_eq!(names(&["Inter", "inter"]), ["Inter"]);
        assert_eq!(names(&["inter", "Inter"]), ["inter"]);
    }

    #[test]
    fn ordering_is_stable_across_runs() {
        // The same input must come out in the same order every time.
        let input = ["Zapfino", "arial", "Inter", "noto sans", "Arial"];
        assert_eq!(names(&input), names(&input));
        assert_eq!(names(&input), ["arial", "Inter", "noto sans", "Zapfino"]);
    }

    #[test]
    fn keeps_spaces_punctuation_and_unicode() {
        // A name is not split on its spaces or commas: both are legitimate.
        // Ordering is by lowercased name, so fullwidth Latin sorts after ASCII
        // rather than where its narrow counterpart would.
        assert_eq!(
            names(&["Noto Sans, Devanagari", "Gill Sans", "ＭＳ ゴシック"]),
            ["Gill Sans", "Noto Sans, Devanagari", "ＭＳ ゴシック"]
        );
    }

    #[test]
    fn empty_backend_result_is_not_an_error() {
        assert!(names(&[]).is_empty());
    }

    /// Exercises the real backend once, so a broken native path is caught here
    /// rather than by whoever opens the settings card next.
    ///
    /// Deliberately asserts nothing about *which* fonts exist. This machine's
    /// catalogue is not any other machine's, and a test that pinned a name
    /// would pass on one developer and fail on the next. What is worth
    /// asserting is that the backend answers at all, and that whatever it
    /// answered survives normalisation: sorted, and with no case-insensitive
    /// duplicates. Both hold on a machine with no fonts installed too.
    #[test]
    fn discovery_answers_and_its_result_is_normalised() {
        let raw: Vec<String> = SystemSource::new()
            .all_families()
            .expect("the system font source should answer on a desktop target");

        let families = normalize_families(raw);

        for pair in families.windows(2) {
            assert!(
                pair[0].to_lowercase() <= pair[1].to_lowercase(),
                "not sorted: {:?} before {:?}",
                pair[0],
                pair[1]
            );
        }

        let lowered: Vec<String> = families.iter().map(|f| f.to_lowercase()).collect();
        let mut unique = lowered.clone();
        unique.sort();
        unique.dedup();
        assert_eq!(unique.len(), lowered.len(), "case-insensitive duplicates survived");

        for family in &families {
            assert_eq!(family.trim(), family, "family name has surrounding whitespace");
            assert!(!family.is_empty());
        }
    }
}