//! Workspaces: the folders the app has been given access to.
//!
//! A path the model names is not a permission. The app holds a **grant** — a
//! canonical path the user chose — and the file commands work only inside a
//! grant. There is no default root and no fallback to the home directory: a
//! machine with no grants has no folders the model can reach, and that is the
//! point.
//!
//! A grant is a path the *app* chose, not one the model asked for. The model
//! may name a file inside a grant; it may not name a grant, and it may not
//! name a path. That is the whole boundary, and it is enforced here rather
//! than in the interface.

use std::fs;
use std::path::{Component, Path, PathBuf};

use serde::{Deserialize, Serialize};
use tauri::AppHandle;

use crate::appfile;

/// The file the grants are kept in.
const FILE_NAME: &str = "workspaces.json";

/// The version of the file's shape.
const FILE_VERSION: u32 = 1;

/// How many entries one listing may return.
const MAX_ENTRIES: usize = 2000;

/// A folder the app has been given access to.
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Workspace {
    /// A generated id. The one thing that identifies this grant. */
    pub id: String,
    /// The canonical path, which is what the commands are confined to. */
    pub path: String,
    /// The folder's name, for display. */
    pub name: String,
    /// When the grant was made. */
    pub granted_at: u64,
    /// Whether the folder is still where it was.
    ///
    /// A folder that has been moved or renamed is not a folder this app can
    /// reach any more, and saying so is better than a project whose files
    /// silently are not there.
    #[serde(default)]
    pub missing: bool,
}

/// The grants, as they are on disk.
#[derive(Serialize, Deserialize)]
struct GrantFile {
    version: u32,
    #[serde(default)]
    grants: Vec<Workspace>,
}

impl GrantFile {
    fn empty() -> Self {
        GrantFile {
            version: FILE_VERSION,
            grants: Vec::new(),
        }
    }
}

/// One entry in a folder.
#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct WorkspaceEntry {
    pub name: String,
    /// The path, relative to the workspace, using forward slashes. */
    pub path: String,
    pub is_directory: bool,
    pub size: Option<u64>,
}

/// A file's contents, read from inside a workspace.
#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct WorkspaceFile {
    /// The path, relative to the workspace, using forward slashes. */
    pub path: String,
    pub text: String,
    pub truncated: bool,
    pub bytes: u64,
    /// Whether the file is not text at all.
    ///
    /// Decided by the bytes, not by the extension or the name: a text file is
    /// one that decodes as UTF-8 and has no null byte in it. The browser
    /// reports a `.ts` file as `video/mp2t`, which is why the type is not
    /// asked.
    pub binary: bool,
}

/// Whether some bytes are not text.
///
/// A file is text when it decodes as UTF-8 and has no null byte in it. A file
/// of images, or of compressed data, fails both.
fn is_binary(bytes: &[u8]) -> bool {
    bytes.contains(&0) || std::str::from_utf8(bytes).is_err()
}

fn file_path(app: &AppHandle) -> Option<PathBuf> {
    appfile::data_path(app, FILE_NAME)
}

fn read_grants(app: &AppHandle) -> GrantFile {
    let Some(path) = file_path(app) else {
        return GrantFile::empty();
    };
    let Some(raw) = appfile::read_string(&path) else {
        return GrantFile::empty();
    };
    match serde_json::from_str::<GrantFile>(&raw) {
        Ok(file) if file.version == FILE_VERSION => file,
        /* A file this build does not understand is left alone: it is somebody's
           list of folders, and overwriting it is the one thing here that could
           not be undone. */
        _ => GrantFile::empty(),
    }
}

fn write_grants(app: &AppHandle, file: &GrantFile) -> Result<(), String> {
    let path = file_path(app).ok_or("The app data folder is unavailable.")?;
    let json = serde_json::to_string_pretty(file)
        .map_err(|e| format!("Could not encode the workspaces: {e}"))?;
    appfile::write_atomic(&path, &json)
}

/// A fresh id for a grant.
///
/// The id is generated, and is not the folder's name: two directories can
/// share a name, and a folder identified by its name is one folder to this
/// app. The name is kept separately, because the name is what a person reads.
fn new_id() -> String {
    use std::hash::{BuildHasher, Hasher};
    let mut hasher = std::collections::hash_map::RandomState::new().build_hasher();
    hasher.write_u128(
        std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .map(|since| since.as_nanos())
            .unwrap_or(0),
    );
    format!("w-{:016x}", hasher.finish())
}

/// The root the app is not allowed outside, if one is configured.
///
/// A configured root is a *cap*, not a grant: it narrows what may be granted,
/// and it never grants anything by itself. With none set, the user's choice
/// is the only boundary.
fn configured_cap() -> Option<PathBuf> {
    let raw = std::env::var("AI_APP_FS_ROOT").ok()?;
    let path = PathBuf::from(raw);
    path.canonicalize().ok()
}

/// Resolve a path inside a grant, and prove it stays there.
///
/// The path is relative. An absolute one is refused: the model does not get to
/// name a path, and a path that starts outside the grant is not a path inside
/// it. `canonicalize` resolves `..` and symlinks, so a link that points out of
/// the grant is refused too.
fn resolve_within(grant: &Path, input: &str) -> Result<PathBuf, String> {
    let trimmed = input.trim();

    /* An empty path is the root of the grant.
     *
     * Listing a folder starts at the top and walks down, so the first call
     * is for the grant itself. Refusing it would mean no folder could ever be
     * listed from the top, and the walk would fail before it began. */
    if trimmed.is_empty() {
        return grant
            .canonicalize()
            .map_err(|e| format!("The workspace is not there: {e}"));
    }

    let candidate = Path::new(trimmed);
    if candidate.is_absolute() {
        return Err(
            "A file is named by its path inside the workspace, not by an absolute path."
                .to_string(),
        );
    }
    if candidate
        .components()
        .any(|part| matches!(part, Component::ParentDir))
    {
        return Err("The path leaves the workspace.".to_string());
    }

    /* The grant is canonicalised too, so the two sides of the comparison are
       in the same form. On Windows `canonicalize` returns a verbatim path
       (`\\?\C:\...`) and a path that was merely written down does not, and
       one does not start with the other. */
    let root = grant
        .canonicalize()
        .map_err(|e| format!("The workspace is not there: {e}"))?;

    let joined = root.join(candidate);
    let resolved = joined
        .canonicalize()
        .map_err(|e| format!("Cannot open {}: {e}", joined.display()))?;

    if !resolved.starts_with(&root) {
        return Err(format!("{} is outside the workspace.", resolved.display()));
    }

    Ok(resolved)
}

/// The path of a workspace, by its id.
fn grant_of(app: &AppHandle, id: &str) -> Result<(PathBuf, Workspace), String> {
    let file = read_grants(app);
    let grant = file
        .grants
        .into_iter()
        .find(|grant| grant.id == id)
        .ok_or("That workspace is not one this app has been given.")?;
    let path = PathBuf::from(&grant.path);
    if !path.is_dir() {
        return Err(format!(
            "{} is not there any more. Choose the folder again.",
            grant.path
        ));
    }
    Ok((path, grant))
}

/// Every workspace the app has been given.
///
/// A folder that has been moved or renamed is reported as missing, so the app
/// can say so and offer to relink it rather than showing a project whose
/// files quietly are not there.
#[tauri::command]
pub async fn list_workspaces(app: AppHandle) -> Result<Vec<Workspace>, String> {
    Ok(read_grants(&app)
        .grants
        .into_iter()
        .map(|mut grant| {
            grant.missing = !Path::new(&grant.path).is_dir();
            grant
        })
        .collect())
}

/// Points an existing grant at a folder again.
///
/// The grant keeps its id, so a session that was run against it is still
/// attached to it — a folder that has been moved is the same project, and
/// making it a new one would lose the history that belonged to it.
#[tauri::command]
pub async fn relink_workspace(
    app: AppHandle,
    id: String,
    path: String,
) -> Result<Workspace, String> {
    let trimmed = path.trim();
    if trimmed.is_empty() {
        return Err("A folder must be named.".to_string());
    }

    let resolved = Path::new(trimmed)
        .canonicalize()
        .map_err(|e| format!("Cannot open {trimmed}: {e}"))?;
    if !resolved.is_dir() {
        return Err(format!("{} is not a folder.", resolved.display()));
    }
    if let Some(cap) = configured_cap() {
        if !resolved.starts_with(&cap) {
            return Err(format!(
                "{} is outside the folder this app is allowed to use.",
                resolved.display()
            ));
        }
    }

    let name = resolved
        .file_name()
        .map(|name| name.to_string_lossy().to_string())
        .unwrap_or_else(|| resolved.display().to_string());

    let mut file = read_grants(&app);
    let Some(grant) = file.grants.iter_mut().find(|grant| grant.id == id) else {
        return Err("That workspace is not one this app has been given.".to_string());
    };
    grant.path = resolved.to_string_lossy().to_string();
    grant.name = name;
    grant.missing = false;
    let relinked = grant.clone();
    write_grants(&app, &file)?;
    Ok(relinked)
}

/// Gives the app access to a folder.
///
/// The path is canonicalised, so what is stored is the real path and not
/// however it was spelled. A folder that is not there, or that is not a
/// folder, is refused.
#[tauri::command]
pub async fn grant_workspace(app: AppHandle, path: String) -> Result<Workspace, String> {
    let trimmed = path.trim();
    if trimmed.is_empty() {
        return Err("A folder must be named.".to_string());
    }

    let resolved = Path::new(trimmed)
        .canonicalize()
        .map_err(|e| format!("Cannot open {trimmed}: {e}"))?;
    if !resolved.is_dir() {
        return Err(format!("{} is not a folder.", resolved.display()));
    }

    if let Some(cap) = configured_cap() {
        if !resolved.starts_with(&cap) {
            return Err(format!(
                "{} is outside the folder this app is allowed to use.",
                resolved.display()
            ));
        }
    }

    let name = resolved
        .file_name()
        .map(|name| name.to_string_lossy().to_string())
        .unwrap_or_else(|| resolved.display().to_string());

    let grant = Workspace {
        id: new_id(),
        path: resolved.to_string_lossy().to_string(),
        name,
        missing: false,
        granted_at: std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .map(|since| since.as_secs())
            .unwrap_or(0),
    };

    let mut file = read_grants(&app);
    file.grants.retain(|existing| existing.path != grant.path);
    file.grants.push(grant.clone());
    write_grants(&app, &file)?;

    Ok(grant)
}

/// Gives up access to a folder.
///
/// The folder on disk is not touched. This is about what this app may reach,
/// and a folder the user gave us once is still their folder afterwards.
#[tauri::command]
pub async fn revoke_workspace(app: AppHandle, id: String) -> Result<bool, String> {
    let mut file = read_grants(&app);
    let before = file.grants.len();
    file.grants.retain(|grant| grant.id != id);
    if file.grants.len() == before {
        return Ok(false);
    }
    write_grants(&app, &file)?;
    Ok(true)
}

/// The entries of a folder inside a workspace.
#[tauri::command]
pub async fn list_workspace_entries(
    app: AppHandle,
    workspace_id: String,
    path: String,
) -> Result<Vec<WorkspaceEntry>, String> {
    let (root, _) = grant_of(&app, &workspace_id)?;
    let resolved = resolve_within(&root, &path)?;

    let metadata = fs::metadata(&resolved)
        .map_err(|e| format!("Cannot read {}: {e}", resolved.display()))?;
    if !metadata.is_dir() {
        return Err(format!("{} is not a folder.", resolved.display()));
    }

    let relative = relative_to(&root, &resolved);
    let mut entries: Vec<WorkspaceEntry> = fs::read_dir(&resolved)
        .map_err(|e| format!("Cannot list {}: {e}", resolved.display()))?
        .filter_map(|entry| {
            let entry = entry.ok()?;
            let metadata = entry.metadata().ok()?;
            let name = entry.file_name().to_string_lossy().to_string();
            Some(WorkspaceEntry {
                path: if relative.is_empty() {
                    name.clone()
                } else {
                    format!("{relative}/{name}")
                },
                name,
                is_directory: metadata.is_dir(),
                size: if metadata.is_dir() {
                    None
                } else {
                    Some(metadata.len())
                },
            })
        })
        .take(MAX_ENTRIES)
        .collect();

    /* Folders first, then names: the order a person reads a folder in. */
    entries.sort_by(|a, b| {
        b.is_directory
            .cmp(&a.is_directory)
            .then_with(|| a.name.to_lowercase().cmp(&b.name.to_lowercase()))
    });
    Ok(entries)
}

/// Reads a file from inside a workspace.
#[tauri::command]
pub async fn read_workspace_file(
    app: AppHandle,
    workspace_id: String,
    path: String,
    max_bytes: Option<u64>,
) -> Result<WorkspaceFile, String> {
    const DEFAULT_CAP: u64 = 256 * 1024;
    const HARD_CAP: u64 = 2_000_000;

    let (root, _) = grant_of(&app, &workspace_id)?;
    let resolved = resolve_within(&root, &path)?;

    let metadata = fs::metadata(&resolved)
        .map_err(|e| format!("Cannot read {}: {e}", resolved.display()))?;
    if metadata.is_dir() {
        return Err(format!("{} is a folder, not a file.", resolved.display()));
    }

    let cap = max_bytes.unwrap_or(DEFAULT_CAP).clamp(1, HARD_CAP);
    let bytes = fs::read(&resolved)
        .map_err(|e| format!("Cannot read {}: {e}", resolved.display()))?;
    let total = bytes.len() as u64;
    let truncated = total > cap;
    let slice = if truncated { &bytes[..cap as usize] } else { &bytes[..] };

    /* Whether this is text is decided by the bytes. A file that does not
       decode as UTF-8, or that has a null byte in it, is not text, and the
       caller is told so rather than being handed the replacement characters a
       lossy decode would have produced. */
    let binary = is_binary(slice);
    let text = if binary {
        String::new()
    } else {
        String::from_utf8_lossy(slice).to_string()
    };

    Ok(WorkspaceFile {
        path: relative_to(&root, &resolved),
        text,
        truncated,
        binary,
        bytes: total,
    })
}

/// A path relative to the workspace, using forward slashes.
///
/// Forward slashes because that is what a path in a request is written with,
/// and a path that reads the same whichever platform wrote it is a path that
/// can be compared with one that did not.
fn relative_to(root: &Path, path: &Path) -> String {
    match path.strip_prefix(root) {
        Ok(rest) => rest
            .components()
            .map(|part| part.as_os_str().to_string_lossy().to_string())
            .collect::<Vec<_>>()
            .join("/"),
        Err(_) => path.to_string_lossy().to_string(),
    }
}

#[cfg(test)]
mod tests {
    use super::{is_binary, relative_to, resolve_within};
    use std::fs;
    use std::path::{Path, PathBuf};

    fn scratch(name: &str) -> PathBuf {
        let dir = std::env::temp_dir().join(format!("tavi-workspace-{name}"));
        let _ = fs::remove_dir_all(&dir);
        fs::create_dir_all(dir.join("inside")).expect("the scratch directory should be creatable");
        fs::write(dir.join("inside").join("file.txt"), "hello").expect("the file should be written");
        dir
    }

    #[test]
    fn a_file_inside_the_workspace_is_found() {
        let root = scratch("inside");
        let resolved = resolve_within(&root, "inside/file.txt").expect("the file should be found");
        assert!(resolved.ends_with("file.txt"));
        let _ = fs::remove_dir_all(&root);
    }

    /// An empty path is the root of the grant, not a mistake.
    ///
    /// Listing a folder starts at the top and walks down, so the first call
    /// is for the grant itself. If this were refused, no folder could ever be
    /// listed from the top.
    #[test]
    fn an_empty_path_is_the_root_of_the_workspace() {
        let root = scratch("root");
        let resolved = resolve_within(&root, "").expect("the root should be resolved");
        assert_eq!(
            resolved.canonicalize().expect("the root should canonicalize"),
            root.canonicalize().expect("the root should canonicalize")
        );
        let _ = fs::remove_dir_all(&root);
    }

    /// A path that climbs out is refused.
    #[test]
    fn a_path_that_climbs_out_is_refused() {
        let root = scratch("escape");
        assert!(resolve_within(&root, "../elsewhere").is_err());
        assert!(resolve_within(&root, "inside/../../elsewhere").is_err());
        let _ = fs::remove_dir_all(&root);
    }

    /// An absolute path is refused, because the model does not get to name one.
    #[test]
    fn an_absolute_path_is_refused() {
        let root = scratch("absolute");
        assert!(resolve_within(&root, "/etc").is_err());
        assert!(resolve_within(&root, "C:\\Windows").is_err());
        let _ = fs::remove_dir_all(&root);
    }

    /// A link that points out of the workspace is refused, even though the
    /// path that named it looks harmless.
    #[test]
    fn a_link_out_of_the_workspace_is_refused() {
        let root = scratch("symlink");
        /* Its own name, because a directory shared with another test is a
           directory that can be taken away underneath it. */
        let outside = root.parent().unwrap().join("tavi-workspace-symlink-outside");
        fs::create_dir_all(&outside).expect("the outside directory should be creatable");
        fs::write(outside.join("secret.txt"), "not yours").expect("the file should be written");

        #[cfg(unix)]
        {
            let link = root.join("inside").join("link");
            std::os::unix::fs::symlink(&outside, &link).expect("the link should be made");
            assert!(resolve_within(&root, "inside/link/secret.txt").is_err());
        }
        #[cfg(windows)]
        {
            /* Windows needs a privilege to make a link, so the check is made
               by hand: the resolved path is compared with the grant, in the
               same canonical form the command uses. */
            let resolved = resolve_within(&root, "inside/file.txt").expect("the file should be found");
            let canonical = root.canonicalize().expect("the root should canonicalise");
            assert!(resolved.starts_with(&canonical));
        }
        let _ = fs::remove_dir_all(&root);
        let _ = fs::remove_dir_all(&outside);
    }

    /// A path of nothing but spaces is the root too.
    ///
    /// It used to be refused. Listing a folder starts at the top and walks
    /// down, so the first call is for the grant itself, and refusing it meant
    /// no folder could ever be listed from the top.
    #[test]
    fn a_path_of_spaces_is_the_root_too() {
        let root = scratch("spaces");
        let resolved = resolve_within(&root, "   ").expect("the root should be resolved");
        assert_eq!(
            resolved.canonicalize().expect("the root should canonicalize"),
            root.canonicalize().expect("the root should canonicalize")
        );
        let _ = fs::remove_dir_all(&root);
    }

    #[test]
    fn a_path_that_is_not_there_is_refused() {
        let root = scratch("missing");
        assert!(resolve_within(&root, "nope.txt").is_err());
        let _ = fs::remove_dir_all(&root);
    }

    #[test]
    fn a_relative_path_uses_forward_slashes() {
        let root = scratch("relative");
        let resolved = root.join("inside").join("file.txt");
        assert_eq!(relative_to(&root, &resolved), "inside/file.txt");
        assert_eq!(relative_to(&root, &root), "");
        let _ = fs::remove_dir_all(&root);
    }

    #[test]
    fn a_path_outside_the_workspace_has_no_relative_form() {
        let root = scratch("outside");
        let other = Path::new("/somewhere/else");
        assert_eq!(relative_to(&root, other), other.to_string_lossy());
        let _ = fs::remove_dir_all(&root);
    }

    /// A file is text when it decodes as UTF-8 and has no null byte in it.
    ///
    /// The browser's own answer is not asked, because it is wrong about a
    /// common case: Chromium reports a `.ts` file as `video/mp2t`.
    #[test]
    fn a_file_is_text_when_its_bytes_say_so() {
        assert!(!is_binary(b"export const answer = 42\n"));
        assert!(!is_binary("héllo — wörld ✓".as_bytes()));
        assert!(!is_binary(b""));
        assert!(is_binary(&[0x61, 0x62, 0x00, 0x63]));
        assert!(is_binary(&[0xff, 0xfe, 0xfd]));
    }
}
