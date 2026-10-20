//! Cloned projects on this machine.
//!
//! Cloning runs `git` against this machine's filesystem, so it belongs on the
//! Rust side of the app: the key, the provider request and the folder grants
//! are all here, and the clone is the same kind of thing.
//!
//! Nothing here is simulated. If `git` is missing or the clone fails, the
//! caller gets the real error rather than a directory that looks like it
//! worked — and a clone that failed part way through is removed, so the
//! projects folder holds projects rather than debris.

use std::io::Read;
use std::path::{Path, PathBuf};
use std::process::{Command, Stdio};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex};
use std::time::Duration;

use serde::Serialize;
use tauri::ipc::Channel;
use tauri::{AppHandle, State};

/// How long a clone may take.
const MAX_CLONE_SECS: u64 = 10 * 60;

/// The name of the file the app writes its own state into, for the record.
const _UNUSED: &str = "";

/// Where cloned repositories go.
///
/// Precedence: an explicit `TAVI_PROJECTS_DIR`, then a per-user default. The
/// same rule as the website's server, so a clone lands in the same place
/// whichever target made it.
pub fn projects_root() -> PathBuf {
    if let Some(override_) = std::env::var("TAVI_PROJECTS_DIR")
        .ok()
        .map(|value| value.trim().to_string())
        .filter(|value| !value.is_empty())
    {
        return PathBuf::from(override_);
    }
    let home = std::env::var("HOME")
        .or_else(|_| std::env::var("USERPROFILE"))
        .unwrap_or_default();
    PathBuf::from(home)
        .join("Documents")
        .join("Tavi")
        .join("projects")
}

/// A project that has been cloned.
#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ProjectSummary {
    /// Directory name inside the projects root. */
    pub name: String,
    pub path: String,
    /// When it was last changed, in milliseconds since the epoch. */
    pub modified_at: u64,
}

/// What a clone did.
#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CloneResult {
    pub ok: bool,
    /// The folder's name, when it worked. */
    #[serde(skip_serializing_if = "Option::is_none")]
    pub name: Option<String>,
    /// Where it landed, when it worked. */
    #[serde(skip_serializing_if = "Option::is_none")]
    pub path: Option<String>,
    /// What went wrong, when it did not work. */
    #[serde(skip_serializing_if = "Option::is_none")]
    pub error: Option<String>,
}

impl CloneResult {
    fn failed(error: impl Into<String>) -> Self {
        CloneResult {
            ok: false,
            name: None,
            path: None,
            error: Some(error.into()),
        }
    }
}

/// What the clone is doing, as it does it.
#[derive(Clone, Debug, Serialize)]
#[serde(tag = "type", rename_all = "camelCase")]
pub enum CloneEvent {
    /// How far along it is. The percentage is missing when git does not say.
    #[serde(rename = "progress")]
    Progress {
        #[serde(rename = "percent", skip_serializing_if = "Option::is_none")]
        percent: Option<u8>,
        message: String,
    },
    /// The clone has been stopped.
    #[serde(rename = "cancelled")]
    Cancelled,
}

/// The clone in flight, so it can be stopped.
#[derive(Default)]
pub struct Clones {
    current: Mutex<Option<Arc<AtomicBool>>>,
}

impl Clones {
    fn begin(&self) -> Arc<AtomicBool> {
        let flag = Arc::new(AtomicBool::new(false));
        if let Ok(mut current) = self.current.lock() {
            *current = Some(flag.clone());
        }
        flag
    }

    fn end(&self) {
        if let Ok(mut current) = self.current.lock() {
            *current = None;
        }
    }

    fn cancel(&self) -> bool {
        match self.current.lock() {
            Ok(current) => match current.as_ref() {
                Some(flag) => {
                    flag.store(true, Ordering::SeqCst);
                    true
                }
                None => false,
            },
            Err(_) => false,
        }
    }
}

/// Stops a clone that is in flight.
#[tauri::command]
pub async fn cancel_clone(clones: State<'_, Clones>) -> Result<(), String> {
    clones.cancel();
    Ok(())
}

/// Creates the projects root if it is missing. Idempotent.
fn ensure_root() -> Result<PathBuf, String> {
    let root = projects_root();
    std::fs::create_dir_all(&root)
        .map_err(|e| format!("Could not create {}: {e}", root.display()))?;
    Ok(root)
}

/// Where the projects are, and which they are.
#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ProjectsListing {
    /// The folder clones land in. */
    pub root: String,
    pub projects: Vec<ProjectSummary>,
}

/// The projects that have been cloned, newest first.
///
/// The folder is not created here. A folder that exists because the app was
/// opened is a folder nobody asked for; it is made when a clone is started.
#[tauri::command]
pub async fn list_projects() -> Result<ProjectsListing, String> {
    let root = projects_root();
    let mut projects: Vec<ProjectSummary> = Vec::new();

    if !root.is_dir() {
        return Ok(ProjectsListing {
            root: root.to_string_lossy().to_string(),
            projects,
        });
    }

    let entries = std::fs::read_dir(&root)
        .map_err(|e| format!("Could not read {}: {e}", root.display()))?;
    for entry in entries.flatten() {
        let name = entry.file_name().to_string_lossy().to_string();
        if name.starts_with('.') || !entry.path().is_dir() {
            continue;
        }
        let modified = entry
            .metadata()
            .and_then(|metadata| metadata.modified())
            .ok()
            .and_then(|when| when.duration_since(std::time::UNIX_EPOCH).ok())
            .map(|since| since.as_millis() as u64)
            .unwrap_or(0);
        projects.push(ProjectSummary {
            name,
            path: entry.path().to_string_lossy().to_string(),
            modified_at: modified,
        });
    }

    projects.sort_by(|a, b| b.modified_at.cmp(&a.modified_at));
    Ok(ProjectsListing {
        root: root.to_string_lossy().to_string(),
        projects,
    })
}

/**
 * Repository URL forms this will clone.
 *
 * `https://` covers GitHub, GitLab and self-hosted servers. `git@host:path` is
 * SSH, which only works if the user already has that host set up for `git`; the
 * error is reported as-is rather than hidden.
 *
 * Everything else is refused. Notably `file://` and bare local paths are not
 * accepted: cloning them would copy arbitrary local directories, and a
 * filesystem path pasted into a "repository URL" field is nearly always a
 * mistake.
 */
fn allowed_url(url: &str) -> bool {
    if let Some(rest) = url.strip_prefix("https://") {
        // A host, a dot, and something after it.
        return match rest.split_once('/') {
            Some((host, _)) => host.contains('.') && !host.is_empty(),
            None => rest.contains('.') && !rest.is_empty(),
        };
    }
    if let Some(rest) = url.strip_prefix("git@") {
        return match rest.split_once(':') {
            Some((host, path)) => {
                !host.is_empty()
                    && !path.is_empty()
                    && host
                        .chars()
                        .all(|c| c.is_ascii_alphanumeric() || c == '.' || c == '-')
            }
            None => false,
        };
    }
    false
}

/// A conservative directory name derived from the URL.
fn project_name_from(url: &str) -> String {
    let without_scheme = if let Some(rest) = url.strip_prefix("https://") {
        rest.to_string()
    } else if let Some(rest) = url.split_once('@').map(|(_, rest)| rest) {
        rest.split_once(':')
            .map(|(_, path)| path.to_string())
            .unwrap_or_else(|| rest.to_string())
    } else {
        url.to_string()
    };

    let without_suffix = without_scheme
        .strip_suffix(".git")
        .unwrap_or(&without_scheme)
        .to_string();

    let last = without_suffix
        .split(['/', ':'])
        .filter(|segment| !segment.is_empty())
        .next_back()
        .unwrap_or("repository")
        .to_string();

    let cleaned: String = last
        .chars()
        .map(|c| {
            if c.is_ascii_alphanumeric() || c == '.' || c == '_' || c == '-' {
                c
            } else {
                '-'
            }
        })
        .collect();
    let trimmed = cleaned.trim_start_matches(['-', '.']).to_string();
    if trimmed.is_empty() {
        "repository".to_string()
    } else {
        trimmed
    }
}

/// The progress git reported, if it reported any.
///
/// Git writes its progress to stderr, in lines like
/// `Receiving objects:  45% (450/1000)`. The percentage is what a person
/// wants to see; the rest of the line is noise.
fn parse_progress(line: &str) -> Option<(Option<u8>, String)> {
    let trimmed = line.trim();
    if trimmed.is_empty() {
        return None;
    }
    let percent = trimmed
        .split_whitespace()
        .find_map(|word| {
            let digits = word.trim_end_matches('%');
            digits.parse::<u8>().ok().filter(|value| *value <= 100)
        });
    let message = trimmed
        .split_once(':')
        .map(|(head, _)| head.trim().to_string())
        .unwrap_or_else(|| trimmed.to_string());
    Some((percent, message))
}

/// The last line of git's complaints worth repeating.
fn error_detail(stderr: &str) -> Option<String> {
    stderr
        .lines()
        .rev()
        .map(str::trim)
        .find(|line| {
            !line.is_empty()
                && (line.to_lowercase().contains("error")
                    || line.to_lowercase().contains("fatal")
                    || line.to_lowercase().contains("denied")
                    || line.to_lowercase().contains("not found")
                    || line.to_lowercase().contains("could not"))
        })
        .map(str::to_string)
}

/// Clones a repository.
///
/// The destination is checked first, so an existing project is never
/// overwritten. The clone is spawned without a shell and with an argument
/// array, so a URL containing shell metacharacters reaches `git` as data
/// rather than as a command line.
#[tauri::command]
pub async fn clone_repository(
    app: AppHandle,
    clones: State<'_, Clones>,
    url: String,
    // Where to put it. The projects folder when this is absent.
    parent: Option<String>,
    on_event: Channel<CloneEvent>,
) -> Result<CloneResult, String> {
    let trimmed = url.trim().to_string();
    if trimmed.is_empty() {
        return Ok(CloneResult::failed("Enter a repository URL."));
    }
    if !allowed_url(&trimmed) {
        return Ok(CloneResult::failed(
            "That does not look like a repository URL. Use https://host/owner/repo or git@host:owner/repo.",
        ));
    }

    let root = match parent.as_deref().map(str::trim).filter(|p| !p.is_empty()) {
        Some(parent) => PathBuf::from(parent),
        None => ensure_root()?,
    };
    if !root.is_dir() {
        return Ok(CloneResult::failed(format!(
            "{} is not a folder.",
            root.display()
        )));
    }

    let name = project_name_from(&trimmed);
    let destination = root.join(&name);
    if destination.exists() {
        return Ok(CloneResult::failed(format!(
            "\"{name}\" already exists in your projects folder."
        )));
    }

    let cancelled = clones.begin();
    let progress = Some(on_event.clone());
    let url_for_thread = trimmed.clone();
    let destination_for_thread = destination.clone();
    let cancelled_for_thread = cancelled.clone();

    /* `git` blocks, and the app must not. */
    let outcome = tauri::async_runtime::spawn_blocking(move || {
        run_git_clone(
            &url_for_thread,
            &destination_for_thread,
            &cancelled_for_thread,
            progress,
        )
    })
    .await
    .map_err(|e| format!("The clone did not finish: {e}"))?;

    clones.end();

    match outcome {
        Ok(()) => Ok(CloneResult {
            ok: true,
            name: Some(name),
            path: Some(destination.to_string_lossy().to_string()),
            error: None,
        }),
        Err(CloneFailure::Cancelled) => {
            let _ = on_event.send(CloneEvent::Cancelled);
            let _ = app;
            Ok(CloneResult::failed("The clone was stopped."))
        }
        Err(CloneFailure::Failed { message, cleanup }) => {
            if cleanup {
                let _ = std::fs::remove_dir_all(&destination);
            }
            let _ = app;
            Ok(CloneResult::failed(message))
        }
    }
}

/// Why a clone did not finish.
enum CloneFailure {
    /// The user stopped it.
    Cancelled,
    /// It failed. `cleanup` says whether the half-made folder should go.
    Failed { message: String, cleanup: bool },
}

/// Runs `git clone`, and reads what it says.
fn run_git_clone(
    url: &str,
    destination: &Path,
    cancelled: &Arc<AtomicBool>,
    progress: Option<Channel<CloneEvent>>,
) -> Result<(), CloneFailure> {
    let bin = if cfg!(windows) { "git.exe" } else { "git" };

    let mut child = match Command::new(bin)
        .args([
            "clone",
            "--depth",
            "1",
            "--single-branch",
            "--progress",
            "--",
            url,
            &destination.to_string_lossy(),
        ])
        // No shell: the arguments reach git as data, never as a command line.
        .stdin(Stdio::null())
        .stdout(Stdio::null())
        .stderr(Stdio::piped())
        .env("GIT_TERMINAL_PROMPT", "0")
        .spawn()
    {
        Ok(child) => child,
        Err(error) => {
            let message = if error.kind() == std::io::ErrorKind::NotFound {
                "git is not installed or not on PATH, so repositories cannot be cloned.".to_string()
            } else {
                format!("Could not start git: {error}")
            };
            return Err(CloneFailure::Failed {
                message,
                cleanup: false,
            });
        }
    };

    let mut stderr = String::new();

    /* Git's output is read on its own thread, so a stop is noticed while git
       is quiet rather than only when it next says something. */
    let shared_stderr = Arc::new(Mutex::new(String::new()));
    let reader = match child.stderr.take() {
        Some(reader) => reader,
        None => {
            return Err(CloneFailure::Failed {
                message: "git gave no output to read.".to_string(),
                cleanup: false,
            })
        }
    };
    let reader_thread = std::thread::spawn({
        let shared_stderr = shared_stderr.clone();
        let progress = progress.clone();
        let cancelled = cancelled.clone();
        move || {
            let mut reader = reader;
            let mut buffer: Vec<u8> = Vec::new();
            loop {
                let mut chunk = [0u8; 4096];
                match reader.read(&mut chunk) {
                    Ok(0) | Err(_) => break,
                    Ok(count) => {
                        buffer.extend_from_slice(&chunk[..count]);
                        while let Some(position) = buffer.iter().position(|byte| *byte == b'\n') {
                            let line = String::from_utf8_lossy(&buffer[..position]).to_string();
                            buffer.drain(..=position);
                            if cancelled.load(Ordering::SeqCst) {
                                return;
                            }
                            if let Some(channel) = progress.as_ref() {
                                if let Some((percent, message)) = parse_progress(&line) {
                                    let _ = channel.send(CloneEvent::Progress { percent, message });
                                }
                            }
                            if let Ok(mut collected) = shared_stderr.lock() {
                                collected.push_str(&line);
                                collected.push('\n');
                            }
                        }
                    }
                }
            }
        }
    });

    let start = std::time::Instant::now();
    let mut status = None;

    loop {
        match child.try_wait() {
            Ok(Some(finished)) => {
                status = Some(finished);
                break;
            }
            Ok(None) => {}
            Err(_) => break,
        }

        if cancelled.load(Ordering::SeqCst) {
            let _ = child.kill();
            let _ = child.wait();
            let _ = reader_thread.join();
            let _ = std::fs::remove_dir_all(destination);
            return Err(CloneFailure::Cancelled);
        }

        if start.elapsed() > Duration::from_secs(MAX_CLONE_SECS) {
            let _ = child.kill();
            let _ = child.wait();
            let _ = reader_thread.join();
            return Err(CloneFailure::Failed {
                message:
                    "The clone timed out. Check the URL and your network, then try again."
                        .to_string(),
                cleanup: true,
            });
        }

        std::thread::sleep(Duration::from_millis(100));
    }

    let _ = reader_thread.join();
    if let Ok(collected) = shared_stderr.lock() {
        stderr = collected.clone();
    }

    let Some(status) = status else {
        return Err(CloneFailure::Failed {
            message: "git could not be waited for.".to_string(),
            cleanup: true,
        });
    };

    if status.success() {
        return Ok(());
    }

    let detail = error_detail(&stderr);
    Err(CloneFailure::Failed {
        message: match detail {
            Some(detail) => format!("git could not clone that repository. {detail}"),
            None => format!("git exited with code {}.", status.code().unwrap_or(-1)),
        },
        cleanup: true,
    })
}

#[cfg(test)]
mod tests {
    use super::{allowed_url, error_detail, parse_progress, project_name_from};

    #[test]
    fn an_https_url_is_allowed() {
        assert!(allowed_url("https://github.com/owner/repo"));
        assert!(allowed_url("https://github.com/owner/repo.git"));
        assert!(allowed_url("https://git.example.com/owner/repo"));
    }

    #[test]
    fn an_ssh_url_is_allowed() {
        assert!(allowed_url("git@github.com:owner/repo.git"));
    }

    /// A local path is nearly always a mistake in a field that asks for a
    /// repository URL, and cloning one would copy an arbitrary directory.
    #[test]
    fn a_local_path_is_not_allowed() {
        assert!(!allowed_url("file:///etc"));
        assert!(!allowed_url("/etc/passwd"));
        assert!(!allowed_url("C:\\Users\\someone"));
        assert!(!allowed_url("ssh://git@host/repo"));
        assert!(!allowed_url(""));
    }

    #[test]
    fn the_name_comes_from_the_last_segment() {
        assert_eq!(project_name_from("https://github.com/owner/repo"), "repo");
        assert_eq!(
            project_name_from("https://github.com/owner/repo.git"),
            "repo"
        );
        assert_eq!(project_name_from("git@github.com:owner/repo.git"), "repo");
    }

    #[test]
    fn a_name_is_never_a_path() {
        let name = project_name_from("https://host/owner/weird name?x=1");
        assert!(!name.contains('/'));
        assert!(!name.contains('\\'));
        assert!(!name.contains('?'));
        assert!(!name.contains(' '));
    }

    #[test]
    fn the_progress_is_read() {
        let (percent, message) = parse_progress("Receiving objects:  45% (450/1000)").unwrap();
        assert_eq!(percent, Some(45));
        assert_eq!(message, "Receiving objects");
    }

    #[test]
    fn a_line_with_no_percentage_is_still_a_line() {
        let (percent, _) = parse_progress("Cloning into 'repo'...").unwrap();
        assert_eq!(percent, None);
    }

    #[test]
    fn the_complaint_worth_repeating_is_found() {
        let stderr = "Cloning into 'repo'...\nfatal: repository not found\n";
        assert_eq!(error_detail(stderr).as_deref(), Some("fatal: repository not found"));
    }

    #[test]
    fn noise_is_not_mistaken_for_a_complaint() {
        let stderr = "Cloning into 'repo'...\nremote: Counting objects: 100\n";
        assert_eq!(error_detail(stderr), None);
    }
}
