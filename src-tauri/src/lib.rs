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
            clear_api_key
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}