//! Git: what the app can see and do about a repository.
//!
//! A repository is a folder the user has given the app, and git is the
//! thing that knows what is in it. So this runs `git` against the user's own
//! filesystem, and it belongs on the Rust side of the app for the same reason
//! the clone does: the key, the provider request and the folder grants are
//! all here, and a repository is the same kind of thing.
//!
//! ## What the app may and may not do
//!
//! **The app runs `git` itself.** Every call is a fixed argument list, run
//! without a shell, so a repository name or a commit message reaches git as
//! data and never as a command line. The model cannot run git: it cannot
//! choose an argument, and it cannot see a path the app has not been given.
//!
//! **The app never stores credentials.** `GIT_TERMINAL_PROMPT=0` is set on
//! every call, so git never asks for a password on a terminal the app does
//! not have — it fails instead, and the failure is reported as it happened.
//! A push therefore works with whatever the machine already has: a
//! credential helper, an SSH agent, a token in the environment. A private
//! repository over SSH works for the same reason, and only for that reason:
//! the host was configured outside the app, and the app has no part in it.
//!
//! **The app does not write the user's git configuration.** An identity, if
//! the reader has set one in the app's own settings, is passed to git with
//! `-c` for that one commit and is not written into the repository or into
//! the machine's global configuration. Where there is no such identity, git's
//! own configuration is used, and where git has none either, git refuses and
//! the refusal is reported rather than papered over.
//!
//! ## What the app does not do
//!
//! **It does not write.** A repository copy per conversation exists to
//! isolate *writes*, and the app cannot write yet, so there is nothing for
//! one to isolate. The write path is deliberately not built, and this module
//! does not pretend otherwise.

use std::path::{Path, PathBuf};
use std::process::{Command, Stdio};
use std::time::Duration;

use serde::Serialize;
use tauri::AppHandle;

use crate::workspace;

/// The longest a git call may take.
///
/// A status is instant and a fetch is not. Ten minutes is longer than a
/// person will wait and short enough that a hung call is not a hung app.
const MAX_GIT_SECS: u64 = 10 * 60;

/// One file's state, as git reports it.
#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ChangedFile {
    /// The path, relative to the repository's root, with forward slashes.
    pub path: String,
    /// What happened to it, in git's own words: `M`, `A`, `D`, `R`, `?`.
    pub status: String,
    /// Whether it is staged, and so would be part of a commit as it stands.
    pub staged: bool,
}

/// What a repository looks like right now.
#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GitStatus {
    /// The workspace the repository is in.
    pub id: String,
    /// Whether the folder is a repository at all.
    ///
    /// A folder that is not one is not a failure and not an error: it is
    /// what most folders are, and the reader is told so rather than being
    /// shown a complaint.
    pub repository: bool,
    /// The branch that is checked out, or an empty string when the
    /// repository has none — which is what a fresh repository has until its
    /// first commit.
    pub branch: String,
    /// Whether the working tree has nothing changed in it.
    pub clean: bool,
    /// The files that are changed, staged or not.
    pub changed: Vec<ChangedFile>,
    /// How many commits the branch is ahead of the one it tracks.
    pub ahead: u32,
    /// How many commits the branch is behind the one it tracks.
    pub behind: u32,
    /// The branch this one tracks, when it tracks one.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub upstream: Option<String>,
    /// Whether the repository has a remote to push to.
    pub has_remote: bool,
}

/// A branch in the repository.
#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GitBranch {
    pub name: String,
    /// Whether it is the one that is checked out.
    pub current: bool,
    /// Whether it tracks a remote branch.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub upstream: Option<String>,
}

/// The branches the repository has.
#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GitBranches {
    /// The workspace the repository is in.
    pub id: String,
    pub branches: Vec<GitBranch>,
}

/// What a git call did.
#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GitOutcome {
    pub ok: bool,
    /// What git said, in its own words, when it had something to say.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub message: Option<String>,
    /// What went wrong, when it did not work.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub error: Option<String>,
}

impl GitOutcome {
    fn failed(error: impl Into<String>) -> Self {
        GitOutcome {
            ok: false,
            message: None,
            error: Some(error.into()),
        }
    }
}

/// The `git` to run.
fn git_binary() -> &'static str {
    if cfg!(windows) {
        "git.exe"
    } else {
        "git"
    }
}

/// Runs git in a folder, and reads what it said.
///
/// **No shell, and an argument array.** The arguments reach git as data, so a
/// repository name or a commit message cannot become a command line. The
/// prompt is turned off, so git never waits for a password on a terminal the
/// app does not have.
///
/// **It is bounded.** A pull or a push talks to a remote, and a remote can
/// stop answering; a git that never finishes must not be a window that never
/// finishes, so the call is killed and the refusal is reported.
fn run_git(path: &Path, args: &[&str]) -> Result<(String, String), String> {
    let mut child = Command::new(git_binary())
        .args(args)
        .current_dir(path)
        .stdin(Stdio::null())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .env("GIT_TERMINAL_PROMPT", "0")
        .env("GIT_OPTIONAL_LOCKS", "0")
        .spawn()
        .map_err(|error| {
            if error.kind() == std::io::ErrorKind::NotFound {
                "git is not installed or not on PATH.".to_string()
            } else {
                format!("Could not start git: {error}")
            }
        })?;

    /* Both streams are read on their own threads, so a git that says a great
       deal cannot fill a pipe and wait for someone to read it. */
    let stdout_reader = child.stdout.take().map(|mut reader| {
        std::thread::spawn(move || {
            let mut text = String::new();
            let _ = std::io::Read::read_to_string(&mut reader, &mut text);
            text
        })
    });
    let stderr_reader = child.stderr.take().map(|mut reader| {
        std::thread::spawn(move || {
            let mut text = String::new();
            let _ = std::io::Read::read_to_string(&mut reader, &mut text);
            text
        })
    });

    let start = std::time::Instant::now();
    let status = loop {
        match child.try_wait() {
            Ok(Some(finished)) => break Some(finished),
            Ok(None) => {}
            Err(error) => {
                return Err(format!("git could not be waited for: {error}"));
            }
        }
        if start.elapsed() > Duration::from_secs(MAX_GIT_SECS) {
            let _ = child.kill();
            let _ = child.wait();
            return Err("git took too long and was stopped.".to_string());
        }
        std::thread::sleep(Duration::from_millis(50));
    };

    let stdout = stdout_reader
        .and_then(|reader| reader.join().ok())
        .unwrap_or_default();
    let stderr = stderr_reader
        .and_then(|reader| reader.join().ok())
        .unwrap_or_default();

    match status {
        Some(status) if status.success() => Ok((stdout, stderr)),
        Some(_status) => Err(complaint(&stderr, &stdout)),
        None => Err("git could not be waited for.".to_string()),
    }
}

/// The line of git's complaints worth repeating.
///
/// Git says a great deal that is not a problem — progress, hints, the
/// identity it would like to use — and the one line that says what went
/// wrong is the one worth repeating.
fn complaint(stderr: &str, stdout: &str) -> String {
    let find = |text: &str| {
        text.lines()
            .rev()
            .map(str::trim)
            .find(|line| {
                !line.is_empty()
                    && (line.to_lowercase().contains("error")
                        || line.to_lowercase().contains("fatal")
                        || line.to_lowercase().contains("denied")
                        || line.to_lowercase().contains("not found")
                        || line.to_lowercase().contains("could not")
                        || line.to_lowercase().contains("refused")
                        || line.to_lowercase().contains("unknown"))
            })
            .map(str::to_string)
    };
    find(stderr)
        .or_else(|| find(stdout))
        .unwrap_or_else(|| "git could not do that.".to_string())
}

/**
 * The folder a git call is about.
 *
 * **The front end names the grant, not the path.** A path on the machine is
 * not something the app's own half should be carrying around, and the model
 * must never be able to name one: the grant is the permission, and the path
 * is what the permission resolves to.
 */
fn folder_of(app: &AppHandle, id: &str) -> Result<PathBuf, String> {
    workspace::grant_of(app, id).map(|(path, _)| path)
}

/**
 * Whether a folder is a repository at all.
 *
 * `git rev-parse` inside a repository answers with the repository's root; in
 * a folder that is not one it answers with an error, which is the answer we
 * want.
 */
pub fn is_repository(path: &Path) -> bool {
    Command::new(git_binary())
        .args(["rev-parse", "--is-inside-work-tree"])
        .current_dir(path)
        .stdin(Stdio::null())
        .stdout(Stdio::null())
        .stderr(Stdio::null())
        .env("GIT_TERMINAL_PROMPT", "0")
        .output()
        .map(|output| output.status.success())
        .unwrap_or(false)
}

/// What the repository looks like right now.
///
/// One call, and it asks for git's machine-readable form, so nothing here
/// depends on how git happens to word its output in this version.
#[tauri::command]
pub async fn git_status(app: AppHandle, id: String) -> Result<GitStatus, String> {
    let folder = folder_of(&app, &id)?;
    if !is_repository(&folder) {
        /* A folder that is not a repository is not an error. It is what most
           folders are, and the reader is told so rather than shown a
           complaint. */
        return Ok(GitStatus {
            id: id.clone(),
            repository: false,
            branch: String::new(),
            clean: true,
            changed: Vec::new(),
            ahead: 0,
            behind: 0,
            upstream: None,
            has_remote: false,
        });
    }

    let (stdout, _stderr) = tauri::async_runtime::spawn_blocking(move || {
        run_git(
            &folder,
            &["status", "--porcelain=v2", "--branch", "--untracked-files=all"],
        )
    })
    .await
    .map_err(|e| format!("The status did not finish: {e}"))??;

    Ok(parse_status(&id, &stdout))
}

/**
 * Reads git's machine-readable status.
 *
 * The format is documented and stable, and it is read by field count rather
 * than by guessing where the path starts — a path may contain spaces, and
 * the fields before it never do.
 *
 * | Line | What it is |
 * |---|---|
 * | `1 <XY> <sub> <mH> <mI> <mW> <hH> <hI> <path>` | a file that changed |
 * | `2 <XY> <sub> <mH> <mI> <mW> <hH> <hI> <X><score> <path>	<from>` | a file that was renamed or copied |
 * | `u <XY> <sub> <m1> <m2> <m3> <mW> <h1> <h2> <h3> <path>` | a file with a conflict |
 * | `? <path>` | a file git is not tracking |
 *
 * `<XY>` is two letters: the first is the state in the index — what would be
 * committed — and the second is the state in the working tree — what is on
 * the disk. A file is staged when the first is not `.`.
 */
fn parse_status(id: &str, stdout: &str) -> GitStatus {
    let mut status = GitStatus {
        id: id.to_string(),
        repository: true,
        branch: String::new(),
        clean: true,
        changed: Vec::new(),
        ahead: 0,
        behind: 0,
        upstream: None,
        has_remote: false,
    };

    for line in stdout.lines() {
        if let Some(rest) = line.strip_prefix("# branch.head ") {
            /* A repository whose HEAD is detached has no branch, and git says
               so with a name of its own. Showing that name would be showing
               git's internal word for "nothing here". */
            let name = rest.trim();
            status.branch = if name == "(detached)" {
                String::new()
            } else {
                name.to_string()
            };
            continue;
        }
        if let Some(rest) = line.strip_prefix("# branch.upstream ") {
            status.upstream = Some(rest.trim().to_string());
            status.has_remote = true;
            continue;
        }
        if let Some(rest) = line.strip_prefix("# branch.ab ") {
            /* "+<ahead> -<behind>" — the two numbers git tracks separately. */
            for word in rest.split_whitespace() {
                if let Some(ahead) = word.strip_prefix('+') {
                    status.ahead = ahead.parse().unwrap_or(0);
                } else if let Some(behind) = word.strip_prefix('-') {
                    status.behind = behind.parse().unwrap_or(0);
                }
            }
            continue;
        }
        if let Some(rest) = line.strip_prefix("? ") {
            status.clean = false;
            status.changed.push(ChangedFile {
                path: rest.trim().to_string(),
                status: "?".to_string(),
                staged: false,
            });
            continue;
        }
        /* An ordinary change: nine fields, the last of which is the path. */
        if let Some(rest) = line.strip_prefix("1 ") {
            let mut fields = rest.splitn(8, ' ');
            let states = fields.next().unwrap_or("");
            for _ in 0..6 {
                fields.next();
            }
            let path = fields.next().unwrap_or("").trim();
            if path.is_empty() {
                continue;
            }
            status.clean = false;
            status.changed.push(changed_file(states, path));
            continue;
        }
        /* A renamed or copied file: ten fields, the last of which is the path
           and where it came from, separated by a tab. */
        if let Some(rest) = line.strip_prefix("2 ") {
            let mut fields = rest.splitn(9, ' ');
            let states = fields.next().unwrap_or("");
            for _ in 0..7 {
                fields.next();
            }
            let last = fields.next().unwrap_or("");
            let path = last.split('\t').next().unwrap_or("").trim();
            if path.is_empty() {
                continue;
            }
            status.clean = false;
            status.changed.push(changed_file(states, path));
            continue;
        }
        /* A file with a conflict: eleven fields, the last of which is the
           path. */
        if let Some(rest) = line.strip_prefix("u ") {
            let mut fields = rest.splitn(10, ' ');
            let states = fields.next().unwrap_or("");
            for _ in 0..8 {
                fields.next();
            }
            let path = fields.next().unwrap_or("").trim();
            if path.is_empty() {
                continue;
            }
            status.clean = false;
            status.changed.push(changed_file(states, path));
            continue;
        }
    }

    status
}

/**
 * One file's state, from git's two letters.
 *
 * The first letter is the state in the index and the second is the state in
 * the working tree. The letter shown is the working tree's when it changed
 * and the index's when it did not, because the working tree is what the
 * reader is looking at.
 */
fn changed_file(states: &str, path: &str) -> ChangedFile {
    let mut letters = states.chars();
    let index = letters.next().unwrap_or('.');
    let working = letters.next().unwrap_or('.');
    let status = if working != '.' { working } else { index };
    ChangedFile {
        path: path.to_string(),
        status: status.to_string(),
        staged: index != '.' && index != '?',
    }
}

/// The branches the repository has, and which one is checked out.
#[tauri::command]
pub async fn git_branches(app: AppHandle, id: String) -> Result<GitBranches, String> {
    let folder = folder_of(&app, &id)?;
    if !is_repository(&folder) {
        return Err("That folder is not a git repository.".to_string());
    }

    let (stdout, _stderr) = tauri::async_runtime::spawn_blocking(move || {
        run_git(
            &folder,
            &[
                "for-each-ref",
                "--format=%(refname:short)%09%(HEAD)%09%(upstream:short)",
                "refs/heads",
            ],
        )
    })
    .await
    .map_err(|e| format!("The branches did not come: {e}"))??;

    let mut branches = Vec::new();
    for line in stdout.lines() {
        let mut parts = line.split('\t');
        let name = parts.next().unwrap_or("").trim().to_string();
        if name.is_empty() {
            continue;
        }
        let current = parts.next().unwrap_or("").trim() == "*";
        let upstream = parts.next().unwrap_or("").trim();
        branches.push(GitBranch {
            name,
            current,
            upstream: if upstream.is_empty() {
                None
            } else {
                Some(upstream.to_string())
            },
        });
    }

    Ok(GitBranches {
        id: id.clone(),
        branches,
    })
}

/// Commits everything that is changed, staged or not.
#[tauri::command]
pub async fn git_commit(
    app: AppHandle,
    id: String,
    message: String,
    identity: Option<GitIdentity>,
) -> Result<GitOutcome, String> {
    let trimmed = message.trim();
    if trimmed.is_empty() {
        return Ok(GitOutcome::failed("A commit needs a message."));
    }
    if trimmed.contains('\n') {
        return Ok(GitOutcome::failed(
            "A commit message is one line here. Write the details in the body of a message the editor takes.",
        ));
    }

    let folder = folder_of(&app, &id)?;
    if !is_repository(&folder) {
        return Err("That folder is not a git repository.".to_string());
    }

    /* The identity, if there is one, is passed to git for this commit and
       is not written into the repository or into the machine's
       configuration. */
    let identity = identity.map(|value| {
        let name = value.name.trim().to_string();
        let email = value.email.trim().to_string();
        (name, email)
    });
    let message = trimmed.to_string();

    let outcome = tauri::async_runtime::spawn_blocking(move || {
        let mut args: Vec<String> = Vec::new();
        if let Some((name, email)) = identity.as_ref() {
            if !name.is_empty() {
                args.push("-c".to_string());
                args.push(format!("user.name={name}"));
            }
            if !email.is_empty() {
                args.push("-c".to_string());
                args.push(format!("user.email={email}"));
            }
        }
        args.push("add".to_string());
        args.push("--all".to_string());
        args.push("commit".to_string());
        args.push("-m".to_string());
        args.push(message.clone());
        let borrowed: Vec<&str> = args.iter().map(String::as_str).collect();
        run_git(&folder, &borrowed)
    })
    .await
    .map_err(|e| format!("The commit did not finish: {e}"))?;

    match outcome {
        Ok((_stdout, stderr)) => Ok(GitOutcome {
            ok: true,
            message: Some(if stderr.trim().is_empty() {
                "Committed.".to_string()
            } else {
                stderr.trim().to_string()
            }),
            error: None,
        }),
        Err(error) => Ok(GitOutcome::failed(error)),
    }
}

/// Who a commit is by, when the reader has said.
#[derive(Clone, Debug, Serialize, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GitIdentity {
    pub name: String,
    pub email: String,
}

/// Fetches from the remote and merges what it fetched.
#[tauri::command]
pub async fn git_pull(app: AppHandle, id: String) -> Result<GitOutcome, String> {
    let folder = folder_of(&app, &id)?;
    if !is_repository(&folder) {
        return Err("That folder is not a git repository.".to_string());
    }
    let outcome = tauri::async_runtime::spawn_blocking(move || {
        run_git(&folder, &["pull", "--ff-only"])
    })
    .await
    .map_err(|e| format!("The pull did not finish: {e}"))?;
    Ok(match outcome {
        Ok((stdout, stderr)) => GitOutcome {
            ok: true,
            message: Some(if stdout.trim().is_empty() {
                stderr.trim().to_string()
            } else {
                stdout.trim().to_string()
            }),
            error: None,
        },
        Err(error) => GitOutcome::failed(error),
    })
}

/// Sends the branch to the remote it tracks.
#[tauri::command]
pub async fn git_push(app: AppHandle, id: String) -> Result<GitOutcome, String> {
    let folder = folder_of(&app, &id)?;
    if !is_repository(&folder) {
        return Err("That folder is not a git repository.".to_string());
    }
    let outcome =
        tauri::async_runtime::spawn_blocking(move || run_git(&folder, &["push"]))
            .await
            .map_err(|e| format!("The push did not finish: {e}"))?;
    Ok(match outcome {
        Ok((stdout, stderr)) => GitOutcome {
            ok: true,
            message: Some(if stdout.trim().is_empty() {
                stderr.trim().to_string()
            } else {
                stdout.trim().to_string()
            }),
            error: None,
        },
        Err(error) => GitOutcome::failed(error),
    })
}

/// Checks out a branch that is already there.
#[tauri::command]
pub async fn git_switch_branch(
    app: AppHandle,
    id: String,
    branch: String,
) -> Result<GitOutcome, String> {
    let name = branch.trim().to_string();
    if name.is_empty() {
        return Ok(GitOutcome::failed("A branch needs a name."));
    }
    let folder = folder_of(&app, &id)?;
    if !is_repository(&folder) {
        return Err("That folder is not a git repository.".to_string());
    }
    let outcome = tauri::async_runtime::spawn_blocking({
        let branch = name.clone();
        move || run_git(&folder, &["checkout", "--", &branch])
    })
    .await
    .map_err(|e| format!("The branch did not change: {e}"))?;
    Ok(match outcome {
        Ok((_stdout, stderr)) => GitOutcome {
            ok: true,
            message: Some(if stderr.trim().is_empty() {
                format!("Now on {name}.")
            } else {
                stderr.trim().to_string()
            }),
            error: None,
        },
        Err(error) => GitOutcome::failed(error),
    })
}

/// Makes a branch and checks it out.
#[tauri::command]
pub async fn git_create_branch(
    app: AppHandle,
    id: String,
    branch: String,
) -> Result<GitOutcome, String> {
    let name = branch.trim().to_string();
    if name.is_empty() {
        return Ok(GitOutcome::failed("A branch needs a name."));
    }
    if name.contains(['/', '\\', ' ', '~', '^', ':', '?', '*', '[', '.', '@']) {
        return Ok(GitOutcome::failed(
            "Git will not take that as a branch name. Use letters, numbers, dashes and dots.",
        ));
    }
    let folder = folder_of(&app, &id)?;
    if !is_repository(&folder) {
        return Err("That folder is not a git repository.".to_string());
    }
    let outcome = tauri::async_runtime::spawn_blocking({
        let branch = name.clone();
        move || run_git(&folder, &["checkout", "-b", &branch])
    })
    .await
    .map_err(|e| format!("The branch was not made: {e}"))?;
    Ok(match outcome {
        Ok((_stdout, stderr)) => GitOutcome {
            ok: true,
            message: Some(if stderr.trim().is_empty() {
                format!("Now on {name}.")
            } else {
                stderr.trim().to_string()
            }),
            error: None,
        },
        Err(error) => GitOutcome::failed(error),
    })
}

#[cfg(test)]
mod tests {
    use super::{parse_status, GitOutcome};

    /// A status as git writes it, copied from a real repository.
    const A_STATUS: &str = "\
# branch.oid 418fef13756b11716b582e1b96bebd5cb1bc5f34
# branch.head master
# branch.upstream origin/master
# branch.ab +2 -1
1 .M N... 100644 100644 100644 df425ceeefaae93f4fed1782783ceffc1051cc74 df425ceeefaae93f4fed1782783ceffc1051cc74 a.txt
1 M. N... 100644 100644 100644 fd09632ea163382ad53b3a6752ce324488f2442e d87a79ebcd9a3e9ee0b77393fe8f3382cb12d22e b.txt
2 R. N... 100644 100644 100644 e5f2b441ff4ab525404217307e06d5aa91c689b2 e5f2b441ff4ab525404217307e06d5aa91c689b2 R100 d.txt\tc.txt
? untracked.txt
";

    #[test]
    fn the_branch_is_read() {
        let status = parse_status("/tmp/repo", A_STATUS);
        assert_eq!(status.branch, "master");
        assert_eq!(status.upstream.as_deref(), Some("origin/master"));
        assert!(status.has_remote);
    }

    #[test]
    fn how_far_ahead_and_behind_is_read() {
        let status = parse_status("/tmp/repo", A_STATUS);
        assert_eq!(status.ahead, 2);
        assert_eq!(status.behind, 1);
    }

    #[test]
    fn a_changed_file_is_read() {
        let status = parse_status("/tmp/repo", A_STATUS);
        let main = status
            .changed
            .iter()
            .find(|file| file.path == "a.txt")
            .expect("the changed file should be there");
        assert_eq!(main.status, "M");
        assert!(!main.staged, "a change in the working tree is not staged");
    }

    #[test]
    fn a_staged_file_is_read_as_staged() {
        let status = parse_status("/tmp/repo", A_STATUS);
        let staged = status
            .changed
            .iter()
            .find(|file| file.path == "b.txt")
            .expect("the staged file should be there");
        assert_eq!(staged.status, "M");
        assert!(staged.staged);
    }

    #[test]
    fn an_untracked_file_is_read() {
        let status = parse_status("/tmp/repo", A_STATUS);
        let untracked = status
            .changed
            .iter()
            .find(|file| file.path == "untracked.txt")
            .expect("the untracked file should be there");
        assert_eq!(untracked.status, "?");
        assert!(!untracked.staged);
    }

    #[test]
    fn a_renamed_file_is_read_by_where_it_is_now() {
        let status = parse_status("/tmp/repo", A_STATUS);
        let renamed = status
            .changed
            .iter()
            .find(|file| file.path == "d.txt")
            .expect("the renamed file should be there");
        assert_eq!(renamed.status, "R");
        assert!(renamed.staged, "a rename is staged, because git stages it");
    }

    /// A path may contain spaces, and the fields before it never do, so the
    /// path is found by counting fields rather than by splitting on the last
    /// space.
    #[test]
    fn a_path_with_spaces_in_it_is_read_whole() {
        let status = parse_status(
            "/tmp/repo",
            "1 .M N... 100644 100644 100644 df425cee df425cee my file.txt\n",
        );
        assert_eq!(status.changed.len(), 1);
        assert_eq!(status.changed[0].path, "my file.txt");
    }

    #[test]
    fn a_changed_file_means_the_tree_is_not_clean() {
        let status = parse_status("/tmp/repo", A_STATUS);
        assert!(!status.clean);
    }

    #[test]
    fn a_clean_tree_is_clean() {
        let status = parse_status(
            "/tmp/repo",
            "# branch.oid abc\n# branch.head master\n# branch.upstream origin/master\n# branch.ab +0 -0\n",
        );
        assert!(status.clean);
        assert_eq!(status.changed.len(), 0);
    }

    /// A repository whose HEAD is detached has no branch, and git says so
    /// with a name of its own. Showing that name would be showing git's
    /// internal word for "nothing here".
    #[test]
    fn a_detached_head_has_no_branch() {
        let status = parse_status("/tmp/repo", "# branch.head (detached)\n");
        assert_eq!(status.branch, "");
    }

    /// A repository with no commits still has a branch name — it is the
    /// branch the first commit will be made on — so it is shown.
    #[test]
    fn a_repository_with_no_commits_still_has_its_branch() {
        let status = parse_status(
            "/tmp/repo",
            "# branch.oid (initial)\n# branch.head main\n",
        );
        assert_eq!(status.branch, "main");
    }

    /// A file that is staged and then changed again says both, and it is
    /// staged.
    #[test]
    fn a_file_staged_and_then_changed_again_is_staged() {
        let status = parse_status(
            "/tmp/repo",
            "1 MM N... 100644 100644 100644 df425cee df425cee a.txt\n",
        );
        let file = &status.changed[0];
        assert_eq!(file.status, "M");
        assert!(file.staged);
    }

    #[test]
    fn a_failure_carries_what_went_wrong() {
        let outcome = GitOutcome::failed("nothing to commit");
        assert!(!outcome.ok);
        assert_eq!(outcome.error.as_deref(), Some("nothing to commit"));
        assert!(outcome.message.is_none());
    }
}
