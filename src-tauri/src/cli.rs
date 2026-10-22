//! The CLI providers: programs on this machine that can answer a message.
//!
//! An API provider is an address and a key. A CLI provider is a program the
//! user has already installed — OpenCode, Claude Code, Codex and the rest —
//! and the app talks to it by starting it and reading what it says.
//!
//! Everything here stays on this side of the boundary. The webview is told
//! what a provider is and what state it is in; it is never handed a
//! command line, and it never runs anything itself.
//!
//! Three things are kept apart, because they are three different questions:
//!
//! - **is it installed** — is there a program on this machine, and is it the
//!   one we were looking for;
//! - **is it enabled** — has the user said the app may offer it;
//! - **is it ready** — is it signed in and able to answer.
//!
//! An installed program is not an enabled one, and neither is a ready one.
//! Disabling a provider never removes it.

use std::collections::BTreeMap;
use std::io::Read;
use std::path::{Path, PathBuf};
use std::process::{Command, Stdio};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex};
use std::time::{Duration, Instant};

use serde::{Deserialize, Serialize};
use tauri::ipc::Channel;
use tauri::{AppHandle, State};

use crate::provider::ChatEvent;

/// The prefix a CLI provider's id carries.
///
/// One string says both what kind of provider it is and which one it is, so
/// the composer has one place to read the choice from and the request has
/// one field to carry it in. The same prefix is used by the website's
/// server, which has no CLI providers and says so.
pub const CLI_PREFIX: &str = "cli:";

/// The file the app's own CLI preferences are kept in.
const PREFS_FILE: &str = "cli-providers.json";

/// The version of that file's shape.
const PREFS_VERSION: u32 = 1;

/// How long a version check may take.
///
/// A program that is installed and broken can hang on `--version` for as long
/// as it likes, and the settings pane must not hang with it.
const VERSION_TIMEOUT: Duration = Duration::from_secs(10);

/// How long a lifecycle operation may take.
const LIFECYCLE_TIMEOUT: Duration = Duration::from_secs(10 * 60);

/// How many providers are looked at at once.
///
/// Each one is a process, and a machine that is busy does not get faster by
/// being asked more questions at the same time.
const DETECT_CONCURRENCY: usize = 4;

// --------------------------------------------------------------------------
// What a CLI provider is
// --------------------------------------------------------------------------

/// How the app talks to a CLI.
#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize)]
#[serde(rename_all = "kebab-case")]
pub enum CliMode {
    /// A documented agent protocol over standard input and output.
    Protocol,
    /// A documented headless mode whose output the app can read.
    Structured,
    /// A real terminal, for a program that needs one.
    Terminal,
}

/// Where a CLI's install came from.
#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize)]
#[serde(rename_all = "kebab-case")]
pub enum CliSource {
    /// Somebody else did, and the app does not own it.
    External,
    /// A package manager owns it.
    PackageManager,
    /// Nobody has said, and the app will not guess.
    Unknown,
}

/// Whether a CLI is still being worked on.
#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize)]
#[serde(rename_all = "kebab-case")]
pub enum Maintenance {
    Active,
    /// Kept working, but not being added to.
    Legacy,
    /// Nobody has said.
    Unknown,
}

/// How a CLI is put on this machine, and taken off it again.
///
/// Only the sources the tool's own documentation names are declared. A tool
/// with no declaration is one the app will not install, and says so — which
/// is better than a button that runs something nobody checked.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum CliInstall {
    /// A package on the npm registry.
    Npm { package: &'static str },
    /// A package on PyPI.
    Pip { package: &'static str },
    /// The tool updates and removes itself.
    Builtin {
        /// The command that updates it.
        update: &'static [&'static str],
        /// The command that removes it.
        uninstall: &'static [&'static str],
    },
}

/// The event format a program speaks when it is run without a terminal.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum RunFormat {
    /// Newline-delimited JSON. Each line is an event with a `type` and a
    /// `part`, and the part is what the event is about.
    OpenCodeJson,
}

/// How a CLI is run when it is asked for an answer.
///
/// Only the programs whose own documentation says how to run them without a
/// terminal are here. A program with no recipe is one the app can find and
/// enable but cannot yet ask, and the settings pane says so rather than
/// offering a button that would fail.
#[derive(Clone, Copy, Debug)]
pub struct CliRun {    /// The arguments that put the program in its non-interactive mode.
    pub args: &'static [&'static str],
    /// Whether the message goes in on standard input.
    ///
    /// When it does, nothing the user typed is ever part of the command
    /// line, which is what keeps a message full of quotation marks and
    /// punctuation from being read as a command.
    pub prompt_on_stdin: bool,
    /// The event format the program speaks.
    pub format: RunFormat,
    /// The flag that names the model, when the program has one.
    pub model_flag: Option<&'static str>,
}

/// One CLI provider, as the app knows it.
pub struct CliProviderInfo {
    /// The app's own id for it. Stable.
    pub id: &'static str,
    /// The name the app shows.
    pub label: &'static str,
    /// One line about what it is.
    pub description: &'static str,
    /// Where it documents itself.
    pub docs_url: &'static str,
    /// The names the program may be found under, in the order they are tried.
    pub executables: &'static [&'static str],
    /// How the app can talk to it.
    pub modes: &'static [CliMode],
    /// How it is installed, when the app knows.
    pub install: Option<CliInstall>,
    /// How it is run, when the app knows.
    pub run: Option<CliRun>,
    /// Whether it publishes a list of models.
    ///
    /// A CLI is not a model. One that publishes a list of them can be asked
    /// for the list; one that does not is asked for nothing, and the app does
    /// not show a model picker for it.
    pub models: bool,
    /// Whether it is still being worked on.
    pub maintenance: Maintenance,
}

/// The CLIs the app knows about.
///
/// Every one of them is here, whether or not it is installed and whether or
/// not the app can do anything with it yet. A tool that is listed and cannot
/// be used is shown as such; a tool that is missing from the list is a tool
/// the app does not know exists.
///
/// The install sources are the ones each tool's own documentation names, and
/// only those. A tool whose install method has not been verified is listed
/// without one, and the app shows the documentation instead of a button.
pub const CLI_PROVIDERS: &[CliProviderInfo] = &[
    CliProviderInfo {
        id: "claude-code",
        label: "Claude Code",
        description: "Anthropic's coding agent, in the terminal.",
        docs_url: "https://code.claude.com/docs/en/setup",
        executables: &["claude"],
        modes: &[CliMode::Structured, CliMode::Terminal],
        install: Some(CliInstall::Npm {
            package: "@anthropic-ai/claude-code",
        }),
        run: None,
        models: false,
        maintenance: Maintenance::Active,
    },
    CliProviderInfo {
        id: "codex",
        label: "Codex CLI",
        description: "OpenAI's coding agent, in the terminal.",
        docs_url: "https://learn.chatgpt.com/docs/codex/cli",
        executables: &["codex"],
        modes: &[CliMode::Protocol, CliMode::Structured, CliMode::Terminal],
        install: Some(CliInstall::Npm {
            package: "@openai/codex",
        }),
        run: None,
        models: false,
        maintenance: Maintenance::Active,
    },
    CliProviderInfo {
        id: "opencode",
        label: "OpenCode",
        description: "An open coding agent that speaks a structured protocol.",
        docs_url: "https://opencode.ai/docs/",
        executables: &["opencode"],
        modes: &[CliMode::Protocol, CliMode::Structured, CliMode::Terminal],
        install: Some(CliInstall::Builtin {
            update: &["upgrade"],
            uninstall: &["uninstall"],
        }),
        run: Some(CliRun {
            args: &["run", "--format", "json"],
            prompt_on_stdin: true,
            format: RunFormat::OpenCodeJson,
            model_flag: Some("--model"),
        }),
        models: true,
        maintenance: Maintenance::Active,
    },
    CliProviderInfo {
        id: "gemini",
        label: "Gemini CLI",
        description: "Google's coding agent, in the terminal.",
        docs_url: "https://geminicli.com/docs/get-started/installation/",
        executables: &["gemini"],
        modes: &[CliMode::Structured, CliMode::Terminal],
        install: Some(CliInstall::Npm {
            package: "@google/gemini-cli",
        }),
        run: None,
        models: false,
        maintenance: Maintenance::Active,
    },
    CliProviderInfo {
        id: "copilot",
        label: "Copilot CLI",
        description: "GitHub's coding agent, in the terminal.",
        docs_url: "https://docs.github.com/en/copilot/copilot-cli",
        executables: &["copilot"],
        modes: &[CliMode::Structured, CliMode::Terminal],
        install: Some(CliInstall::Npm {
            package: "@github/copilot",
        }),
        run: None,
        models: false,
        maintenance: Maintenance::Active,
    },
    CliProviderInfo {
        id: "cline",
        label: "Cline CLI",
        description: "Cline's coding agent, in the terminal.",
        docs_url: "https://github.com/cline/cline",
        executables: &["cline"],
        modes: &[CliMode::Terminal],
        /* The npm package called `@cline/cli` installs a different program,
           with a different name. The app will not offer to install a tool by
           a name that turns out to belong to something else. */
        install: None,
        run: None,
        models: false,
        maintenance: Maintenance::Active,
    },
    CliProviderInfo {
        id: "pi",
        label: "Pi Coding Agent",
        description: "A coding agent with read, shell, edit and write tools.",
        docs_url: "https://pi.dev/docs/latest",
        executables: &["pi"],
        modes: &[CliMode::Structured, CliMode::Terminal],
        install: Some(CliInstall::Npm {
            package: "@mariozechner/pi-coding-agent",
        }),
        run: None,
        models: false,
        maintenance: Maintenance::Active,
    },
    CliProviderInfo {
        id: "kilo",
        label: "Kilo Code CLI",
        description: "The Kilo coding agent, in the terminal.",
        docs_url: "https://kilo.ai/docs/code-with-ai/platforms/cli",
        executables: &["kilo", "kilocode"],
        modes: &[CliMode::Structured, CliMode::Terminal],
        install: Some(CliInstall::Npm {
            package: "@kilocode/cli",
        }),
        run: None,
        models: false,
        maintenance: Maintenance::Active,
    },
    CliProviderInfo {
        id: "qwen",
        label: "Qwen Code",
        description: "Alibaba's coding agent, in the terminal.",
        docs_url: "https://qwenlm.github.io/qwen-code-docs/en/",
        executables: &["qwen"],
        modes: &[CliMode::Structured, CliMode::Terminal],
        install: Some(CliInstall::Npm {
            package: "@qwen-code/qwen-code",
        }),
        run: None,
        models: false,
        maintenance: Maintenance::Active,
    },
    CliProviderInfo {
        id: "kimi",
        label: "Kimi Code CLI",
        description: "Moonshot AI's coding agent, in the terminal.",
        docs_url: "https://www.kimi.com/code/docs/en/",
        executables: &["kimi"],
        modes: &[CliMode::Structured, CliMode::Terminal],
        install: Some(CliInstall::Npm {
            package: "@moonshot-ai/kimi-code",
        }),
        run: None,
        models: false,
        maintenance: Maintenance::Active,
    },
    CliProviderInfo {
        id: "goose",
        label: "Goose",
        description: "Block's open-source agent, in the terminal.",
        docs_url: "https://block.github.io/goose/",
        executables: &["goose"],
        modes: &[CliMode::Terminal],
        /* Goose is installed by its own script or by a package manager, and
           the app does not run scripts it has not read. */
        install: None,
        run: None,
        models: false,
        maintenance: Maintenance::Active,
    },
    CliProviderInfo {
        id: "vibe",
        label: "Mistral Vibe CLI",
        description: "Mistral's coding agent, in the terminal.",
        docs_url: "https://docs.mistral.ai/vibe/code/overview",
        executables: &["vibe"],
        modes: &[CliMode::Structured, CliMode::Terminal],
        install: Some(CliInstall::Npm {
            package: "vibe-cli",
        }),
        run: None,
        models: false,
        maintenance: Maintenance::Active,
    },
    CliProviderInfo {
        id: "kiro-cli",
        label: "Kiro CLI",
        description: "AWS's coding agent, in the terminal.",
        docs_url: "https://kiro.dev/docs/cli/quick-start/",
        executables: &["kiro-cli", "kiro"],
        modes: &[CliMode::Terminal],
        /* The npm package of this name is a placeholder that installs a
           program called something else. */
        install: None,
        run: None,
        models: false,
        maintenance: Maintenance::Active,
    },
    CliProviderInfo {
        id: "openhands",
        label: "OpenHands CLI",
        description: "An open-source software development agent.",
        docs_url: "https://github.com/All-Hands-AI/OpenHands",
        executables: &["openhands"],
        modes: &[CliMode::Structured, CliMode::Terminal],
        install: Some(CliInstall::Pip {
            package: "openhands-ai",
        }),
        run: None,
        models: false,
        maintenance: Maintenance::Active,
    },
    CliProviderInfo {
        id: "aider",
        label: "Aider",
        description: "An AI pair programmer in the terminal.",
        docs_url: "https://aider.chat/",
        executables: &["aider"],
        modes: &[CliMode::Structured, CliMode::Terminal],
        install: Some(CliInstall::Pip {
            package: "aider-chat",
        }),
        run: None,
        models: false,
        maintenance: Maintenance::Active,
    },
    CliProviderInfo {
        id: "amp",
        label: "Amp",
        description: "Sourcegraph's coding agent, in the terminal.",
        docs_url: "https://ampcode.app/docs/cli",
        executables: &["amp"],
        modes: &[CliMode::Structured, CliMode::Terminal],
        install: Some(CliInstall::Npm {
            package: "@ampcode/cli",
        }),
        run: None,
        models: false,
        maintenance: Maintenance::Active,
    },
    CliProviderInfo {
        id: "crush",
        label: "Crush",
        description: "Charm's coding agent, in the terminal.",
        docs_url: "https://github.com/charmbracelet/crush",
        executables: &["crush"],
        modes: &[CliMode::Structured, CliMode::Terminal],
        /* The npm package of this name is a media tool. Crush is a Go program
           and is installed with Go or a package manager. */
        install: None,
        run: None,
        models: false,
        maintenance: Maintenance::Active,
    },
    CliProviderInfo {
        id: "open-interpreter",
        label: "Open Interpreter",
        description: "Runs language models against a computer.",
        docs_url: "https://github.com/openinterpreter/openinterpreter",
        executables: &["interpreter", "open-interpreter"],
        modes: &[CliMode::Structured, CliMode::Terminal],
        install: Some(CliInstall::Pip {
            package: "open-interpreter",
        }),
        run: None,
        models: false,
        maintenance: Maintenance::Unknown,
    },
    CliProviderInfo {
        id: "continue",
        label: "Continue CLI",
        description: "Continue's agent, in the terminal.",
        docs_url: "https://github.com/continuedev/continue",
        executables: &["cn"],
        modes: &[CliMode::Structured, CliMode::Terminal],
        install: Some(CliInstall::Npm {
            package: "@continuedev/cli",
        }),
        run: None,
        models: false,
        maintenance: Maintenance::Legacy,
    },
];

/// The provider with this id, if there is one.
pub fn provider_for(id: &str) -> Option<&'static CliProviderInfo> {
    CLI_PROVIDERS.iter().find(|provider| provider.id == id)
}

// --------------------------------------------------------------------------
// What the app remembers about them
// --------------------------------------------------------------------------

/// What the app remembers about the CLI providers.
///
/// The file holds what the user has said, not what the app has found. An
/// installed program is found again on every scan, because it can be removed
/// between two visits; whether the user wants it is a different thing, and it
/// does not change on its own.
#[derive(Debug, Clone, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct CliPrefs {
    pub version: u32,
    /// The providers the user has turned on.
    #[serde(default)]
    pub enabled: BTreeMap<String, bool>,
    /// A path the user has pointed at, for a program the app could not find.
    #[serde(default)]
    pub paths: BTreeMap<String, String>,
    /// The providers that may update themselves.
    #[serde(default)]
    pub auto_update: BTreeMap<String, bool>,
    /// Whether any provider may update itself without being asked.
    #[serde(default)]
    pub auto_update_all: bool,
    /// When the app last looked.
    #[serde(default)]
    pub last_scan: Option<u64>,
}

impl CliPrefs {
    fn read(app: &AppHandle) -> CliPrefs {
        let Some(path) = crate::appfile::data_path(app, PREFS_FILE) else {
            return CliPrefs::default();
        };
        let Some(text) = crate::appfile::read_string(&path) else {
            return CliPrefs::default();
        };
        serde_json::from_str(&text).unwrap_or_default()
    }

    fn write(&self, app: &AppHandle) -> Result<(), String> {
        let path = crate::appfile::data_path(app, PREFS_FILE)
            .ok_or("The app data folder is unavailable.")?;
        let mut file = self.clone();
        file.version = PREFS_VERSION;
        let text = serde_json::to_string_pretty(&file).map_err(|e| e.to_string())?;
        crate::appfile::write_atomic(&path, &format!("{text}\n"))
    }

    /// Whether the user has turned this provider on.
    ///
    /// A provider nobody has said anything about is on: the app offers the
    /// tools the user has already gone to the trouble of installing, and
    /// turning one off is a thing the user does rather than a thing they have
    /// to do first.
    fn is_enabled(&self, id: &str) -> bool {
        self.enabled.get(id).copied().unwrap_or(true)
    }
}

// --------------------------------------------------------------------------
// Finding a program
// --------------------------------------------------------------------------

/// The names a program may be found under, on this platform.
///
/// On Windows a program installed by a package manager is a `.cmd` beside
/// the real `.exe`, and the `.exe` is what the app wants to run. Both are
/// looked for; the `.exe` first.
fn file_names(executable: &str) -> Vec<String> {
    if cfg!(windows) {
        vec![
            format!("{executable}.exe"),
            format!("{executable}.cmd"),
            format!("{executable}.bat"),
            executable.to_string(),
        ]
    } else {
        vec![executable.to_string()]
    }
}

/// The folders a program is looked in, besides the ones on PATH.
///
/// The PATH a program is started with is not always the PATH a person sees
/// in a terminal, so the places the tools document are looked in as well.
fn known_locations() -> Vec<PathBuf> {
    let mut places: Vec<PathBuf> = Vec::new();
    let home = std::env::var("HOME")
        .or_else(|_| std::env::var("USERPROFILE"))
        .ok();

    if cfg!(windows) {
        if let Some(home) = home.as_ref() {
            places.push(PathBuf::from(home).join("AppData/Roaming/npm"));
            places.push(PathBuf::from(home).join(".local/bin"));
            places.push(PathBuf::from(home).join("scoop/shims"));
        }
        if let Ok(program_files) = std::env::var("ProgramFiles") {
            places.push(PathBuf::from(program_files).join("npm"));
        }
    } else {
        if let Some(home) = home.as_ref() {
            places.push(PathBuf::from(home).join(".local/bin"));
            places.push(PathBuf::from(home).join(".npm-global/bin"));
            places.push(PathBuf::from(home).join(".bun/bin"));
            places.push(PathBuf::from(home).join(".cargo/bin"));
            places.push(PathBuf::from(home).join(".local/share/pipx/venvs"));
        }
        places.push(PathBuf::from("/usr/local/bin"));
        places.push(PathBuf::from("/opt/homebrew/bin"));
    }
    places
}

/// Finds a program by the names it may be found under.
///
/// The PATH a program is started with is not always the PATH a person sees
/// in a terminal, so the places the tools document are looked in as well.
fn find_by_names(names: &[&str]) -> Option<PathBuf> {
    let mut folders: Vec<PathBuf> = Vec::new();
    if let Some(path) = std::env::var_os("PATH") {
        for folder in std::env::split_paths(&path) {
            folders.push(folder);
        }
    }
    folders.extend(known_locations());

    for executable in names {
        for name in file_names(executable) {
            for folder in &folders {
                let candidate = folder.join(&name);
                if candidate.is_file() {
                    return Some(candidate);
                }
            }
        }
    }
    None
}

/// Finds a provider's program, if it is on this machine.
///
/// The path a user has pointed at is tried first: they know where their
/// program is, and the app does not.
fn resolve(info: &CliProviderInfo, chosen: Option<&str>) -> Option<PathBuf> {
    if let Some(chosen) = chosen {
        let path = PathBuf::from(chosen.trim());
        if path.is_file() {
            return Some(path);
        }
    }
    find_by_names(info.executables)
}

/// The program to run, when the thing that was found is a shim.
///
/// A program installed by npm on Windows is a `.cmd` beside the real `.exe`,
/// and the `.cmd` names the `.exe` it stands for. That name is read out of
/// the shim, so the app runs the program itself rather than a script that
/// a command interpreter has to interpret.
fn real_program(path: &Path) -> PathBuf {
    let extension = path
        .extension()
        .and_then(|e| e.to_str())
        .unwrap_or("")
        .to_ascii_lowercase();

    if extension != "cmd" && extension != "bat" {
        return path.to_path_buf();
    }

    let Some(folder) = path.parent() else {
        return path.to_path_buf();
    };
    let Ok(text) = std::fs::read_to_string(path) else {
        return path.to_path_buf();
    };

    /* npm's shim ends with the program it stands for, in quotes, with the
       folder it lives in written as a variable. */
    let mut found: Option<String> = None;
    let mut rest = text.as_str();
    while let Some(start) = rest.find('"') {
        let after = &rest[start + 1..];
        let Some(end) = after.find('"') else { break };
        let token = &after[..end];
        if token.to_ascii_lowercase().ends_with(".exe") {
            found = Some(token.to_string());
            break;
        }
        rest = &after[end + 1..];
    }

    let Some(found) = found else {
        return path.to_path_buf();
    };
    let resolved = found
        .replace("%~dp0", &folder.to_string_lossy())
        .replace("%dp0%", &folder.to_string_lossy())
        .replace('%', "");
    let candidate = PathBuf::from(resolved);
    if candidate.is_file() {
        candidate
    } else {
        path.to_path_buf()
    }
}

/// What a program said when it was asked for its version.
struct Version {
    text: Option<String>,
    error: Option<String>,
}

/// Asks a program for its version.
///
/// A program that is installed and broken can hang here, so the wait is
/// bounded, and a program that says nothing is a program whose version is
/// unknown rather than one with no version at all.
fn version_of(path: &Path) -> Version {
    let program = real_program(path);

    let mut child = match Command::new(&program)
        .arg("--version")
        .stdin(Stdio::null())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()
    {
        Ok(child) => child,
        Err(error) => {
            return Version {
                text: None,
                error: Some(format!("Could not start it: {error}")),
            }
        }
    };

    let start = Instant::now();
    loop {
        match child.try_wait() {
            Ok(Some(_)) => break,
            Ok(None) => {}
            Err(error) => {
                return Version {
                    text: None,
                    error: Some(format!("Could not wait for it: {error}")),
                }
            }
        }
        if start.elapsed() > VERSION_TIMEOUT {
            let _ = child.kill();
            let _ = child.wait();
            return Version {
                text: None,
                error: Some("It did not answer in time.".to_string()),
            };
        }
        std::thread::sleep(Duration::from_millis(50));
    }

    let output = match child.wait_with_output() {
        Ok(output) => output,
        Err(error) => {
            return Version {
                text: None,
                error: Some(format!("Could not read its answer: {error}")),
            }
        }
    };

    let text = String::from_utf8_lossy(&output.stdout).trim().to_string();
    let text = if text.is_empty() {
        String::from_utf8_lossy(&output.stderr).trim().to_string()
    } else {
        text
    };

    if text.is_empty() {
        Version {
            text: None,
            error: Some("It did not say which version it is.".to_string()),
        }
    } else {
        Version {
            text: Some(text),
            error: None,
        }
    }
}

/// Where a program came from, as far as the app can tell.
///
/// The app did not put it there — it only ever installs through a package
/// manager, which is said about rather than assumed — so an installed
/// program is somebody else's until the app installed it itself.
fn source_of(path: &Path) -> CliSource {
    let text = path.to_string_lossy().to_ascii_lowercase();
    if text.contains("npm") || text.contains("node_modules") || text.contains("pipx") {
        CliSource::PackageManager
    } else {
        CliSource::External
    }
}

// --------------------------------------------------------------------------
// The state the app shows
// --------------------------------------------------------------------------

/// What the app knows about one CLI provider right now.
#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CliProviderState {
    pub id: String,
    pub label: String,
    pub description: String,
    pub docs_url: String,
    /// Whether there is a program on this machine.
    pub installed: bool,
    /// Where it was found.
    pub path: Option<String>,
    /// What it said its version was.
    pub version: Option<String>,
    /// Why the version is not known, when it is not.
    pub version_error: Option<String>,
    /// Who owns the install.
    pub source: CliSource,
    /// Whether the user has turned it on.
    pub enabled: bool,
    /// How the app can talk to it.
    pub modes: Vec<&'static str>,
    /// Whether it publishes a list of models.
    pub models: bool,
    /// Whether it is still being worked on.
    pub maintenance: Maintenance,
    /// Whether the app can put it on this machine.
    pub can_install: bool,
    /// Whether the app can update it.
    pub can_update: bool,
    /// Whether the app can remove it.
    pub can_uninstall: bool,
    /// Whether it may update itself without being asked.
    pub auto_update: bool,
    /// Whether any provider may update itself without being asked.
    pub auto_update_all: bool,
    /// The newest version the registry knows about.
    pub latest_version: Option<String>,
    /// Whether there is an update waiting: `unknown`, `up-to-date`,
    /// `available` or `external`.
    pub update_state: String,
    /// A path the user has pointed at, when they have.
    pub chosen_path: Option<String>,
    /// When the app last looked.
    pub last_scan: Option<u64>,
}

fn mode_name(mode: &CliMode) -> &'static str {
    match mode {
        CliMode::Protocol => "protocol",
        CliMode::Structured => "structured",
        CliMode::Terminal => "terminal",
    }
}

/// Works out the state of every CLI provider.
///
/// The providers are looked at a few at a time. Each one that is installed
/// is asked for its version, and a program that hangs must not hold up the
/// rest of them.
fn scan_local(prefs: &CliPrefs) -> Vec<CliProviderState> {
    let mut states: Vec<CliProviderState> = Vec::with_capacity(CLI_PROVIDERS.len());

    for chunk in CLI_PROVIDERS.chunks(DETECT_CONCURRENCY) {
        let found: Vec<CliProviderState> = std::thread::scope(|scope| {
            let handles: Vec<_> = chunk
                .iter()
                .map(|info| {
                    let chosen = prefs.paths.get(info.id).map(String::as_str);
                    scope.spawn(move || state_of(info, chosen))
                })
                .collect();
            handles
                .into_iter()
                .filter_map(|handle| handle.join().ok())
                .collect()
        });
        states.extend(found);
    }

    /* What the user has said is applied last. The scan found what is on the
       machine; the preferences say what the user wants, and the two are
       different questions. */
    for state in &mut states {
        state.enabled = prefs.is_enabled(&state.id);
        state.auto_update = prefs.auto_update.get(&state.id).copied().unwrap_or(false);
        state.auto_update_all = prefs.auto_update_all;
        state.last_scan = prefs.last_scan;
    }

    states
}

/// Works out the state of every CLI provider, and asks the registries whether
/// anything is out of date.
///
/// The registry is only asked about a provider that is installed, and only
/// about the ones a registry owns: a tool that updates itself has no
/// registry to ask, and saying "up to date" about it would be a guess.
async fn scan_all(prefs: &CliPrefs) -> Vec<CliProviderState> {
    let prefs_for_scan = prefs.clone();
    let mut states = tauri::async_runtime::spawn_blocking(move || scan_local(&prefs_for_scan))
        .await
        .unwrap_or_default();

    let lookups: Vec<(usize, CliInstall)> = states
        .iter()
        .enumerate()
        .filter(|(_, state)| state.installed && state.can_update)
        .filter_map(|(index, state)| {
            provider_for(&state.id)
                .and_then(|info| info.install)
                .map(|install| (index, install))
        })
        .collect();

    if lookups.is_empty() {
        return states;
    }

    let answers = futures_util::future::join_all(
        lookups
            .iter()
            .map(|(_, install)| registry_latest(install)),
    )
    .await;

    for ((index, _), latest) in lookups.iter().zip(answers) {
        let state = &mut states[*index];
        state.latest_version = latest.clone();
        state.update_state = match (latest.as_deref(), state.version.as_deref()) {
            (Some(latest), Some(installed)) => {
                let here = version_number(installed);
                let there = version_number(latest);
                match (here, there) {
                    (Some(here), Some(there)) => match is_newer(&there, &here) {
                        Some(true) => "available".to_string(),
                        Some(false) => "up-to-date".to_string(),
                        None => "unknown".to_string(),
                    },
                    _ => "unknown".to_string(),
                }
            }
            (Some(_), None) => "available".to_string(),
            (None, _) => "unknown".to_string(),
        };
    }

    states
}

/// Works out the state of one CLI provider.
fn state_of(info: &CliProviderInfo, chosen: Option<&str>) -> CliProviderState {
    let found = resolve(info, chosen);
    let (version, version_error) = match &found {
        Some(path) => {
            let answer = version_of(path);
            (answer.text, answer.error)
        }
        None => (None, None),
    };

    let install = info.install;
    let managed = install.is_some();
    let can_update = managed;
    let can_uninstall = managed;

    CliProviderState {
        id: info.id.to_string(),
        label: info.label.to_string(),
        description: info.description.to_string(),
        docs_url: info.docs_url.to_string(),
        installed: found.is_some(),
        path: found.as_ref().map(|path| path.to_string_lossy().to_string()),
        version,
        version_error,
        source: found
            .as_ref()
            .map(|path| source_of(path))
            .unwrap_or(CliSource::Unknown),
        enabled: true,
        modes: info.modes.iter().map(|mode| mode_name(mode)).collect(),
        models: info.models,
        maintenance: info.maintenance,
        can_install: can_update,
        can_update,
        can_uninstall,
        auto_update: false,
        auto_update_all: false,
        latest_version: None,
        update_state: "unknown".to_string(),
        chosen_path: chosen.map(str::to_string),
        last_scan: None,
    }
}

/// The states, looked up once and kept until something asks again.
///
/// The scan starts four programs at a time, and it is done in the background
/// rather than on the caller's thread, so a slow program cannot hold up the
/// settings pane.
#[derive(Default)]
pub struct CliRegistry {
    cached: Mutex<Option<Vec<CliProviderState>>>,
    /// The one scan that may be running, so two callers do not start two.
    scanning: Mutex<bool>,
}
impl CliRegistry {
    fn cached(&self) -> Option<Vec<CliProviderState>> {
        self.cached.lock().ok().and_then(|guard| guard.clone())
    }

    fn store(&self, states: Vec<CliProviderState>) {
        if let Ok(mut guard) = self.cached.lock() {
            *guard = Some(states);
        }
    }
}

// --------------------------------------------------------------------------
// The commands
// --------------------------------------------------------------------------

/// Every CLI provider the app knows about, and what state it is in.
#[tauri::command]
pub async fn list_cli_providers(
    app: AppHandle,
    registry: State<'_, Arc<CliRegistry>>,
) -> Result<Vec<CliProviderState>, String> {
    if let Some(states) = registry.cached() {
        return Ok(states);
    }
    Ok(scan_and_store(&app, registry.inner()).await)
}

/// Looks again, for a provider that has just been installed or removed.
#[tauri::command]
pub async fn scan_cli_providers(
    app: AppHandle,
    registry: State<'_, Arc<CliRegistry>>,
) -> Result<Vec<CliProviderState>, String> {
    Ok(scan_and_store(&app, registry.inner()).await)
}

/// Runs the scan off the caller's thread.
async fn scan_and_store(app: &AppHandle, registry: &Arc<CliRegistry>) -> Vec<CliProviderState> {
    /* The guard is taken and let go before anything is waited for: a lock
       held across an await would make the whole command unable to move
       between threads. */
    let already_scanning = {
        let Ok(mut scanning) = registry.scanning.lock() else {
            return Vec::new();
        };
        if *scanning {
            true
        } else {
            *scanning = true;
            false
        }
    };
    if already_scanning {
        /* A scan is already running. The one that is running will finish and
           leave its answer in the cache, and this call waits for it rather
           than starting a second one. */
        loop {
            if let Some(states) = registry.cached() {
                return states;
            }
            tokio::time::sleep(Duration::from_millis(100)).await;
        }
    }
    let prefs = CliPrefs::read(app);
    let mut updated = prefs.clone();
    updated.last_scan = Some(now());
    let _ = updated.write(app);

    let states = scan_all(&prefs).await;
    registry.store(states.clone());

    if let Ok(mut scanning) = registry.scanning.lock() {
        *scanning = false;
    }

    states
}

/// Turns a provider on or off, and says when it may update itself.
///
/// The three are one command because they are one file: the app's own
/// preferences about the CLI providers, written together so that a change
/// cannot leave half of itself behind.
#[tauri::command]
pub async fn set_cli_provider_state(
    app: AppHandle,
    registry: State<'_, Arc<CliRegistry>>,
    id: String,
    enabled: Option<bool>,
    auto_update: Option<bool>,
    auto_update_all: Option<bool>,
    path: Option<String>,
) -> Result<Vec<CliProviderState>, String> {
    let Some(info) = provider_for(id.trim()) else {
        return Err(format!("\"{id}\" is not a CLI provider this app knows about."));
    };

    let mut prefs = CliPrefs::read(&app);
    if let Some(enabled) = enabled {
        prefs.enabled.insert(info.id.to_string(), enabled);
    }
    if let Some(auto_update) = auto_update {
        prefs.auto_update.insert(info.id.to_string(), auto_update);
    }
    if let Some(auto_update_all) = auto_update_all {
        prefs.auto_update_all = auto_update_all;
    }
    if let Some(path) = path {
        let trimmed = path.trim();
        if trimmed.is_empty() {
            prefs.paths.remove(info.id);
        } else {
            let candidate = PathBuf::from(trimmed);
            if !candidate.is_file() {
                return Err(format!("There is no program at {trimmed}."));
            }
            prefs.paths.insert(info.id.to_string(), trimmed.to_string());
        }
    }
    prefs.write(&app)?;

    /* The states are worked out again, because a path the user has just
       pointed at may be a program that is now on this machine. */
    let states = scan_and_store(&app, &registry).await;
    Ok(states)
}

/// What a lifecycle operation is.
#[derive(Clone, Copy, Debug, PartialEq, Eq, Deserialize)]
#[serde(rename_all = "kebab-case")]
pub enum LifecycleAction {
    Install,
    Update,
    Uninstall,
}

/// What a lifecycle operation is doing.
#[derive(Clone, Debug, Serialize)]
#[serde(tag = "type", rename_all = "camelCase")]
pub enum CliEvent {
    /// A line of what the operation said.
    #[serde(rename = "log")]
    Log { message: String },
    /// The operation is over.
    #[serde(rename = "done")]
    Done { ok: bool, message: String },
}

/// Installs, updates or removes a CLI provider.
///
/// The operation is run by the tool's own means — a package manager, or the
/// tool's own command — and never by a script fetched from the internet. A
/// tool whose installation the app has not been told about is not installed
/// by the app; the settings pane shows where to read about it instead.
#[tauri::command]
pub async fn run_cli_lifecycle(
    app: AppHandle,
    registry: State<'_, Arc<CliRegistry>>,
    id: String,
    action: LifecycleAction,
    on_event: Channel<CliEvent>,
) -> Result<(), String> {
    let Some(info) = provider_for(id.trim()) else {
        return Err(format!("\"{id}\" is not a CLI provider this app knows about."));
    };
    let Some(install) = info.install else {
        return Err(format!(
            "Tavi does not install {}. Read how to install it: {}",
            info.label, info.docs_url
        ));
    };

    let (program, args): (&str, Vec<String>) = match (action, install) {
        (LifecycleAction::Install, CliInstall::Npm { package }) => (
            "npm",
            vec![
                "install".to_string(),
                "--global".to_string(),
                package.to_string(),
            ],
        ),
        (LifecycleAction::Install, CliInstall::Pip { package }) => {
            ("pipx", vec!["install".to_string(), package.to_string()])
        }
        (LifecycleAction::Install, CliInstall::Builtin { .. }) => {
            return Err(format!(
                "{} installs itself. Follow its own instructions: {}",
                info.label, info.docs_url
            ))
        }
        (LifecycleAction::Update, CliInstall::Npm { package }) => (
            "npm",
            vec![
                "install".to_string(),
                "--global".to_string(),
                format!("{package}@latest"),
            ],
        ),
        (LifecycleAction::Update, CliInstall::Pip { package }) => {
            ("pipx", vec!["upgrade".to_string(), package.to_string()])
        }
        (LifecycleAction::Update, CliInstall::Builtin { update, .. }) => (
            info.executables[0],
            update.iter().take(1).map(|a| a.to_string()).collect(),
        ),
        (LifecycleAction::Uninstall, CliInstall::Npm { package }) => (
            "npm",
            vec![
                "uninstall".to_string(),
                "--global".to_string(),
                package.to_string(),
            ],
        ),
        (LifecycleAction::Uninstall, CliInstall::Pip { package }) => {
            ("pipx", vec!["uninstall".to_string(), package.to_string()])
        }
        (LifecycleAction::Uninstall, CliInstall::Builtin { uninstall, .. }) => (
            info.executables[0],
            uninstall.iter().take(1).map(|a| a.to_string()).collect(),
        ),
    };

    let program = find_program(&program).ok_or_else(|| {
        format!(
            "{program} is not on this machine, so Tavi cannot use it to install {}.",
            info.label
        )
    })?;

    let label = info.label.to_string();
    let event = on_event.clone();
    let cancelled = Arc::new(AtomicBool::new(false));

    /* The registry is put in an `Arc` so the background work can refresh it
       when it is over, without the caller's borrow travelling with it. */
    let registry = registry.inner().clone();

    tauri::async_runtime::spawn_blocking(move || {
        let outcome = run_lifecycle(&program, &args, &cancelled, &event, &label);
        outcome
    })
    .await
    .map_err(|e| format!("The operation did not finish: {e}"))??;

    /* The state is worked out again, so the row that was just installed or
       removed shows what is now true rather than what was true a moment
       ago. */
    let states = scan_all(&CliPrefs::read(&app)).await;
    registry.store(states);

    Ok(())
}

/// Runs a lifecycle operation, and says what it said.
fn run_lifecycle(
    program: &Path,
    args: &[String],
    cancelled: &Arc<AtomicBool>,
    on_event: &Channel<CliEvent>,
    label: &str,
) -> Result<(), String> {
    let mut child = match Command::new(program)
        .args(args)
        .stdin(Stdio::null())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()
    {
        Ok(child) => child,
        Err(error) => return Err(format!("Could not start it: {error}")),
    };

    let stderr = child.stderr.take();
    let reader = std::thread::spawn({
        let event = on_event.clone();
        move || {
            let Some(mut reader) = stderr else {
                return String::new();
            };
            let mut text = String::new();
            let mut buffer: Vec<u8> = Vec::new();
            let mut chunk = [0u8; 4096];
            loop {
                let count = match reader.read(&mut chunk) {
                    Ok(0) | Err(_) => break,
                    Ok(count) => count,
                };
                buffer.extend_from_slice(&chunk[..count]);
                /* The lines are sent as they arrive, so a long install says
                   what it is doing rather than sitting silent. */
                while let Some(position) = buffer.iter().position(|byte| *byte == b'\n') {
                    let line = String::from_utf8_lossy(&buffer[..position]).trim().to_string();
                    buffer.drain(..=position);
                    if !line.is_empty() {
                        let _ = event.send(CliEvent::Log { message: line.clone() });
                    }
                    text.push_str(&line);
                    text.push('\n');
                }
            }
            text
        }
    });

    let start = Instant::now();
    let status = loop {
        match child.try_wait() {
            Ok(Some(finished)) => break Some(finished),
            Ok(None) => {}
            Err(error) => {
                let _ = reader.join();
                return Err(format!("Could not wait for it: {error}"));
            }
        }
        if cancelled.load(Ordering::SeqCst) {
            let _ = child.kill();
            let _ = child.wait();
            let _ = reader.join();
            return Err("The operation was stopped.".to_string());
        }
        if start.elapsed() > LIFECYCLE_TIMEOUT {
            let _ = child.kill();
            let _ = child.wait();
            let _ = reader.join();
            return Err("The operation took too long and was stopped.".to_string());
        }
        std::thread::sleep(Duration::from_millis(100));
    };

    let output = reader.join().unwrap_or_default();
    let tail: String = output
        .lines()
        .rev()
        .take(3)
        .collect::<Vec<_>>()
        .into_iter()
        .rev()
        .collect::<Vec<_>>()
        .join(" ");

    match status {
        Some(status) if status.success() => {
            let _ = on_event.send(CliEvent::Done {
                ok: true,
                message: format!("{label} is ready."),
            });
            Ok(())
        }
        Some(status) => {
            let message = format!(
                "{} exited with code {}.{}",
                label,
                status.code().unwrap_or(-1),
                if tail.is_empty() {
                    String::new()
                } else {
                    format!(" {tail}")
                }
            );
            let _ = on_event.send(CliEvent::Done {
                ok: false,
                message: message.clone(),
            });
            Err(message)
        }
        None => {
            let message = "The operation could not be waited for.".to_string();
            let _ = on_event.send(CliEvent::Done {
                ok: false,
                message: message.clone(),
            });
            Err(message)
        }
    }
}

/// Finds a program by name, for the package managers the app uses.
fn find_program(name: &str) -> Option<PathBuf> {
    find_by_names(&[name]).map(|path| real_program(&path))
}

/// The models a CLI provider publishes, if it publishes any.
///
/// A CLI is not a model. One that has a list of them is asked for the list;
/// one that has not is not asked, and the app shows no model picker for it
/// rather than an empty one.
#[tauri::command]
pub async fn list_cli_models(app: AppHandle, id: String) -> Result<Vec<String>, String> {
    let Some(info) = provider_for(id.trim()) else {
        return Err(format!("\"{id}\" is not a CLI provider this app knows about."));
    };
    if !info.models {
        return Err(format!(
            "{} does not publish a list of models. It chooses its own.",
            info.label
        ));
    }

    let prefs = CliPrefs::read(&app);
    let Some(path) = resolve(info, prefs.paths.get(info.id).map(|s| s.as_str())) else {
        return Err(format!("{} is not installed on this machine.", info.label));
    };

    let program = real_program(&path);
    let output = tauri::async_runtime::spawn_blocking(move || {
        Command::new(&program)
            .arg("models")
            .stdin(Stdio::null())
            .stdout(Stdio::piped())
            .stderr(Stdio::null())
            .output()
    })
    .await
    .map_err(|e| format!("Could not ask it: {e}"))?;

    let output = output.map_err(|e| format!("Could not ask it: {e}"))?;
    if !output.status.success() {
        return Err(format!("{} could not list its models.", info.label));
    }

    let models: Vec<String> = String::from_utf8_lossy(&output.stdout)
        .lines()
        .map(|line| line.trim().to_string())
        .filter(|line| !line.is_empty())
        .collect();

    Ok(models)
}

/// Runs a CLI provider, and streams what it says.
///
/// The program is started in the folder the work is in, so the files it can
/// reach are the ones the user chose, and the message goes in on standard
/// input, so nothing the user typed is ever part of a command line.
#[tauri::command]
pub async fn run_cli_chat(
    app: AppHandle,
    cancellations: State<'_, crate::provider::Cancellations>,
    request: crate::provider::ChatRequest,
    on_event: Channel<ChatEvent>,
) -> Result<(), String> {
    let provider_id = request
        .config
        .as_ref()
        .and_then(|config| config.provider_id.as_deref())
        .map(str::trim)
        .unwrap_or_default();

    let Some(cli_id) = provider_id.strip_prefix(CLI_PREFIX) else {
        return Err("That is not a CLI provider.".to_string());
    };
    let Some(info) = provider_for(cli_id) else {
        return Err(format!(
            "\"{cli_id}\" is not a CLI provider this app knows about."
        ));
    };
    let Some(recipe) = info.run else {
        return Err(format!(
            "Tavi cannot run {} yet. Read how to use it: {}",
            info.label, info.docs_url
        ));
    };

    let prefs = CliPrefs::read(&app);
    let Some(path) = resolve(info, prefs.paths.get(info.id).map(|s| s.as_str())) else {
        return Err(format!("{} is not installed on this machine.", info.label));
    };
    let program = real_program(&path);

    /* The folder the work is in, when there is one. The program is started
       there, so the files it can reach are the ones the user chose. */
    let working_dir = match request.folder_id.as_deref().map(str::trim) {
        Some(id) if !id.is_empty() => {
            Some(crate::workspace::grant_of(&app, id)?.0)
        }
        _ => None,
    };

    let prompt = build_prompt(&request);
    let model = request
        .config
        .as_ref()
        .and_then(|config| config.model_name.as_deref())
        .map(str::trim)
        .filter(|model| !model.is_empty())
        .map(str::to_string);

    let request_id = request
        .request_id
        .clone()
        .unwrap_or_else(|| "cli-chat".to_string());
    let cancelled = cancellations.register(&request_id);

    let mut command = Command::new(&program);
    command.args(recipe.args);
    if let Some(flag) = recipe.model_flag {
        if let Some(model) = model.as_deref() {
            command.arg(flag).arg(model);
        }
    }
    command
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::null());
    if let Some(folder) = working_dir.as_ref() {
        command.current_dir(folder);
    }

    let mut child = match command.spawn() {
        Ok(child) => child,
        Err(error) => {
            cancellations.finish(&request_id);
            return Err(format!("Could not start {}: {error}", info.label));
        }
    };

    /* The message goes in on its own thread: a program that never reads its
       input would otherwise fill the pipe and wait for a reader that never
       comes. */
    if recipe.prompt_on_stdin {
        if let Some(mut input) = child.stdin.take() {
            std::thread::spawn(move || {
                use std::io::Write;
                let _ = input.write_all(prompt.as_bytes());
                let _ = input.flush();
            });
        }
    }

    let stdout = child.stdout.take();
    let event = on_event.clone();
    let format = recipe.format;
    let reader = std::thread::spawn(move || {
        let Some(mut stdout) = stdout else {
            return (None, None);
        };
        let mut buffer = String::new();
        let mut chunk = [0u8; 8192];
        let mut model_id: Option<String> = None;
        let mut usage: Option<serde_json::Value> = None;

        loop {
            let count = match stdout.read(&mut chunk) {
                Ok(0) | Err(_) => break,
                Ok(count) => count,
            };
            buffer.push_str(&String::from_utf8_lossy(&chunk[..count]));

            while let Some(position) = buffer.find('\n') {
                let line = buffer[..position].to_string();
                buffer = buffer[position + 1..].to_string();
                let line = line.trim();
                if line.is_empty() {
                    continue;
                }
                match format {
                    RunFormat::OpenCodeJson => {
                        read_opencode_event(line, &event, &mut model_id, &mut usage);
                    }
                }
            }
        }
        (model_id, usage)
    });

    let start = Instant::now();
    let status = loop {
        match child.try_wait() {
            Ok(Some(finished)) => break Some(finished),
            Ok(None) => {}
            Err(error) => {
                let _ = reader.join();
                cancellations.finish(&request_id);
                return Err(format!("Could not wait for it: {error}"));
            }
        }
        if cancelled.load(Ordering::SeqCst) {
            let _ = child.kill();
            let _ = child.wait();
            let _ = reader.join();
            cancellations.finish(&request_id);
            return Ok(());
        }
        if start.elapsed() > LIFECYCLE_TIMEOUT {
            let _ = child.kill();
            let _ = child.wait();
            let _ = reader.join();
            cancellations.finish(&request_id);
            return Err("The run took too long and was stopped.".to_string());
        }
        std::thread::sleep(Duration::from_millis(50));
    };

    let (model_id, usage) = reader.join().unwrap_or((None, None));
    cancellations.finish(&request_id);

    match status {
        Some(status) if status.success() => {
            let _ = on_event.send(ChatEvent::Finish {
                message_metadata: crate::provider::EventMetadata { model_id, usage },
            });
            Ok(())
        }
        Some(status) => {
            let _ = on_event.send(ChatEvent::Error {
                error_text: format!(
                    "{} stopped with code {}.",
                    info.label,
                    status.code().unwrap_or(-1)
                ),
            });
            Ok(())
        }
        None => {
            let _ = on_event.send(ChatEvent::Error {
                error_text: "The run could not be waited for.".to_string(),
            });
            Ok(())
        }
    }
}

/// The message a program is given.
///
/// A CLI is given the conversation as one message. What the user said last
/// is the question; what came before it is the context, marked as context so
/// it is not read as a fresh instruction.
fn build_prompt(request: &crate::provider::ChatRequest) -> String {
    let mut context: Vec<String> = Vec::new();
    let mut question = String::new();

    for message in &request.messages {
        let text = message
            .parts
            .iter()
            .filter_map(|part| part.text.as_deref())
            .collect::<Vec<_>>()
            .join("\n");
        if text.trim().is_empty() {
            continue;
        }
        if message.role == "user" {
            if question.is_empty() {
                question = text;
            } else {
                context.push(format!("You said:\n{text}"));
            }
        } else {
            context.push(format!("You said:\n{text}"));
        }
    }

    if context.is_empty() {
        return question;
    }

    let mut prompt = String::from("Here is the conversation so far.\n\n");
    for entry in &context {
        prompt.push_str(entry);
        prompt.push_str("\n\n");
    }
    prompt.push_str("Now the latest message.\n\n");
    prompt.push_str(&question);
    prompt
}

/// Reads one line of a program's own events, and says what it means.
///
/// A line the app does not understand is not an error. A program may add
/// events, and one the app has not heard of is kept out of the way rather
/// than ending the run.
fn read_opencode_event(
    line: &str,
    on_event: &Channel<ChatEvent>,
    model_id: &mut Option<String>,
    usage: &mut Option<serde_json::Value>,
) {
    let Ok(value) = serde_json::from_str::<serde_json::Value>(line) else {
        return;
    };
    let Some(kind) = value.get("type").and_then(|v| v.as_str()) else {
        return;
    };
    let part = value.get("part").unwrap_or(&serde_json::Value::Null);

    match kind {
        "text" => {
            if let Some(text) = part.get("text").and_then(|v| v.as_str()) {
                if !text.is_empty() {
                    let _ = on_event.send(ChatEvent::TextDelta {
                        delta: text.to_string(),
                    });
                }
            }
        }
        "tool_use" => {
            let name = part
                .get("tool")
                .and_then(|v| v.as_str())
                .unwrap_or("tool")
                .to_string();
            let state = part.get("state");
            let status = state
                .and_then(|s| s.get("status"))
                .and_then(|v| v.as_str())
                .unwrap_or("running")
                .to_string();
            let title = state
                .and_then(|s| s.get("title"))
                .and_then(|v| v.as_str())
                .unwrap_or(&name)
                .to_string();
            let input = state.and_then(|s| s.get("input")).cloned();
            let output = state
                .and_then(|s| s.get("output"))
                .and_then(|v| v.as_str())
                .map(str::to_string);
            let _ = on_event.send(ChatEvent::Tool {
                tool: crate::provider::ToolEvent {
                    name,
                    title,
                    status,
                    input,
                    output,
                },
            });
        }
        "step_finish" => {
            if let Some(model) = part.get("modelID").and_then(|v| v.as_str()) {
                *model_id = Some(model.to_string());
            }
            if let Some(tokens) = part.get("tokens") {
                let read = tokens
                    .get("cache")
                    .and_then(|c| c.get("read"))
                    .and_then(|v| v.as_i64())
                    .unwrap_or(0);
                *usage = Some(serde_json::json!({
                    "inputTokens": tokens.get("input").and_then(|v| v.as_i64()).unwrap_or(0),
                    "outputTokens": tokens.get("output").and_then(|v| v.as_i64()).unwrap_or(0),
                    "reasoningTokens": tokens.get("reasoning").and_then(|v| v.as_i64()).unwrap_or(0),
                    "cachedInputTokens": read,
                }));
            }
        }
        "error" => {
            let message = value
                .get("error")
                .and_then(|e| e.get("message"))
                .and_then(|v| v.as_str())
                .unwrap_or("The program reported an error.")
                .to_string();
            let _ = on_event.send(ChatEvent::Error { error_text: message });
        }
        _ => {}
    }
}

/// The newest version of a package, if the registry will say.
///
/// A tool installed by a package manager has a registry that knows what the
/// newest version is, and that is the only honest way to say whether an
/// update is waiting. A tool that updates itself has no such answer without
/// running it, so it is reported as unknown rather than guessed at.
async fn registry_latest(install: &CliInstall) -> Option<String> {
    let (url, field) = match install {
        CliInstall::Npm { package } => (
            format!("https://registry.npmjs.org/{package}/latest"),
            "version",
        ),
        CliInstall::Pip { package } => {
            (format!("https://pypi.org/pypi/{package}/json"), "info")
        }
        CliInstall::Builtin { .. } => return None,
    };

    let response = reqwest::get(&url).await.ok()?;
    let body: serde_json::Value = response.json().await.ok()?;

    if field == "version" {
        body.get("version")
            .and_then(|v| v.as_str())
            .map(str::to_string)
    } else {
        body.get("info")
            .and_then(|info| info.get("version"))
            .and_then(|v| v.as_str())
            .map(str::to_string)
    }
}

/// Whether one version is newer than another.
///
/// Only versions made of numbers and dots are compared. A version with
/// anything else in it — a build stamp, a pre-release tag — is not compared
/// at all, because saying "there is an update" when there is not would send
/// the user to install something they already have.
fn is_newer(latest: &str, installed: &str) -> Option<bool> {
    let parse = |value: &str| -> Option<Vec<u64>> {
        let mut parts = Vec::new();
        for part in value.split('.') {
            if part.is_empty() || !part.chars().all(|c| c.is_ascii_digit()) {
                return None;
            }
            parts.push(part.parse().ok()?);
        }
        Some(parts)
    };

    let latest = parse(latest.trim())?;
    let installed = parse(installed.trim())?;

    let width = latest.len().max(installed.len());
    for index in 0..width {
        let a = latest.get(index).copied().unwrap_or(0);
        let b = installed.get(index).copied().unwrap_or(0);
        if a != b {
            return Some(a > b);
        }
    }
    Some(false)
}

/// The version a program said, without the words around it.
///
/// A program answers with a sentence as often as with a number, so the
/// number is looked for inside it.
fn version_number(text: &str) -> Option<String> {
    let mut parts: Vec<&str> = Vec::new();
    let mut rest = text;
    while let Some(start) = rest.find(|c: char| c.is_ascii_digit()) {
        let after = &rest[start..];
        let end = after
            .find(|c: char| !c.is_ascii_digit() && c != '.')
            .unwrap_or(after.len());
        let token = &after[..end];
        if !token.is_empty() && token != "." {
            parts.push(token);
        }
        rest = &after[end..];
        if parts.len() >= 4 {
            break;
        }
    }
    if parts.is_empty() {
        return None;
    }
    Some(parts.join("."))
}

/// The time now, in seconds since the epoch.
fn now() -> u64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|since| since.as_secs())
        .unwrap_or(0)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn every_provider_has_its_own_id() {
        let mut seen = std::collections::BTreeSet::new();
        for provider in CLI_PROVIDERS {
            assert!(
                seen.insert(provider.id),
                "two providers share the id {}",
                provider.id
            );
        }
    }

    #[test]
    fn there_are_nineteen_of_them() {
        assert_eq!(CLI_PROVIDERS.len(), 19);
    }

    #[test]
    fn a_provider_says_what_it_is() {
        for provider in CLI_PROVIDERS {
            assert!(!provider.label.trim().is_empty(), "{} has no name", provider.id);
            assert!(
                !provider.description.trim().is_empty(),
                "{} has no description",
                provider.id
            );
            assert!(
                provider.docs_url.starts_with("https://"),
                "{} has no documentation link",
                provider.id
            );
            assert!(
                !provider.executables.is_empty(),
                "{} has no name to look for",
                provider.id
            );
            assert!(
                !provider.modes.is_empty(),
                "{} has no way of being talked to",
                provider.id
            );
        }
    }

    #[test]
    fn a_provider_that_can_be_run_has_a_recipe() {
        for provider in CLI_PROVIDERS {
            if let Some(run) = provider.run {
                assert!(
                    !run.args.is_empty(),
                    "{} is run with no arguments",
                    provider.id
                );
            }
        }
    }

    #[test]
    fn a_provider_that_publishes_models_says_so() {
        /* Only a tool that has been asked lists its models. A tool that does
           not is asked for nothing, rather than for a list that is not
           there. */
        for provider in CLI_PROVIDERS {
            if provider.models {
                assert!(
                    provider.run.is_some(),
                    "{} publishes models but cannot be run",
                    provider.id
                );
            }
        }
    }

    #[test]
    fn the_install_sources_are_the_documented_ones() {
        for provider in CLI_PROVIDERS {
            match provider.install {
                Some(CliInstall::Npm { package }) => {
                    assert!(package.starts_with('@') || package.contains('-'));
                }
                Some(CliInstall::Pip { package }) => {
                    assert!(!package.is_empty());
                }
                Some(CliInstall::Builtin { update, uninstall }) => {
                    assert!(!update.is_empty());
                    assert!(!uninstall.is_empty());
                }
                None => {}
            }
        }
    }

    #[test]
    fn a_provider_is_found_by_its_id() {
        for provider in CLI_PROVIDERS {
            assert_eq!(provider_for(provider.id).map(|p| p.label), Some(provider.label));
        }
        assert!(provider_for("not-a-provider").is_none());
    }

    #[test]
    fn the_prefix_marks_a_cli_provider() {
        assert_eq!("cli:opencode".strip_prefix(CLI_PREFIX), Some("opencode"));
        assert_eq!("openrouter".strip_prefix(CLI_PREFIX), None);
    }
}
