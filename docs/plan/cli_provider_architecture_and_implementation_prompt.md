# CLI Provider Management and Agent Runtime — Architecture Decision + Implementation Prompt

**Target stack:** Rust, Tauri 2, Vite, pnpm  
**Feature:** CLI providers alongside existing API providers  
**Primary constraint:** Preserve all existing code and uncommitted work in the current Git worktree.

---

# Part I — Architecture Decision

## 1. Product direction

Build a desktop **agent host / agent harness**, not merely a GUI wrapper around terminal windows.

The app should let users choose between direct API-backed models and locally installed CLI agents. Where an agent exposes a reliable structured protocol, the app should use it to render a cohesive native experience. Where an agent exposes a documented headless/JSON interface, the app should adapt that output. Where neither is sufficient, the app should host the tool inside a real PTY and display a terminal pane.

**A PTY is one supported execution mode, not the universal abstraction for all providers.**

This hybrid approach provides:

- A consistent application UI for messages, tasks, permissions, progress, and session management where the agent exposes sufficient information.
- Compatibility with command-line tools whose behavior is still primarily terminal-oriented.
- Access to each CLI's native authentication, model/provider choices, tools, instructions, and configuration whenever the official integration mode supports them.
- A gradual implementation path: start with the shared runtime and a small number of rich integrations, then improve adapters without rewriting the provider UI.

## 2. What analogous applications demonstrate

T3 Code describes itself as an agent-harness control surface. Its public repository describes provider CLIs as subprocesses and provider-specific adapters translating native protocols into application orchestration events. Its ACP provider docs let users add compatible local commands and Registry agents, while its architecture docs describe the machine owning the workspace as the owner of provider processes, terminals, Git, and project files.

Useful references:

- T3 Code repository and architecture notes: https://github.com/pingdotgg/t3code
- T3 Code provider/ACP docs: https://github.com/pingdotgg/t3code/blob/main/docs/user/providers-acp.md
- T3 Code architecture overview: https://github.com/pingdotgg/t3code/blob/main/docs/internals/overview.md
- Agent Client Protocol: https://agentclientprotocol.com/

The lesson is not to copy another app's entire stack. It is to separate the **frontend presentation**, **local agent runtime**, **provider-specific adapter**, and **workspace ownership**. In this app, Rust and Tauri already provide a natural local runtime boundary; do not add a Node server solely because another application uses one.

## 3. The three execution modes

Implement one internal provider/session model with multiple adapter modes. Do not force every provider through a PTY or pretend every provider provides structured events.

### Mode A — Protocol-native integration (preferred for a rich custom UI)

If a CLI offers a documented agent protocol or application server, use it where the interface is appropriate and its maturity is understood.

Potential interfaces include:

- **Agent Client Protocol (ACP):** a standard for editor/client-to-agent communication. The public ACP organization lists official Rust and TypeScript libraries. OpenCode documents `opencode acp`, which launches an ACP agent over JSON-RPC on standard input/output.
- **Codex app-server:** a bidirectional JSON-RPC interface intended to embed Codex in rich clients. Assess maturity/version compatibility carefully and keep this adapter isolated. Use a documented non-interactive fallback if the native server protocol is unsuitable for a given release.
- **OpenCode server API:** OpenCode also provides `opencode serve`; use it only if its HTTP/server lifecycle fits the product better than ACP.
- Other officially supported agent APIs/SDKs, but only after verifying the current official docs, runtime requirements, license, and support level.

Important: ACP is not an assumption about every listed CLI. Discover support from each tool's current official docs/capabilities. Support protocol version negotiation where the library and agents require it. Do not couple the app's internal domain model to an ACP version or to one vendor's event names.

References:

- ACP project: https://github.com/agentclientprotocol/
- ACP Rust SDK: https://docs.rs/agent-client-protocol/latest/agent_client_protocol/
- OpenCode ACP: https://docs.opencode.ai/docs/acp/
- OpenCode server: https://docs.opencode.ai/docs/server/
- Codex app-server: https://learn.chatgpt.com/docs/app-server

### Mode B — Structured/headless CLI integration

Launch a CLI as a child process without a TTY when its documented headless mode can return reliable machine-readable output. Use the provider's own documented flags, stdin behavior, event schema, session IDs, and exit codes.

Examples of documented interfaces to investigate:

- Claude Code print mode supports output formats including JSON and streaming JSON.
- Gemini CLI headless mode supports JSON and streaming JSONL output.
- Codex provides `codex exec` for bounded non-interactive jobs and may offer richer app-server/SDK interfaces depending on the use case.

Do not scrape pretty-printed terminal text if a structured output mode is available. Do not assume JSON schemas, flags, or session semantics are the same across providers. Version-gate parsing when necessary and preserve unknown events for diagnostics without crashing.

References:

- Claude Code CLI usage: https://docs.anthropic.com/en/docs/claude-code/cli-usage
- Gemini CLI headless mode: https://geminicli.com/docs/cli/headless/
- Codex product integration overview: https://developers.openai.com/blog/codex-as-a-platform

### Mode C — Interactive PTY fallback

If a CLI requires terminal interaction or lacks a dependable structured interface, start it in a real pseudo-terminal and present a terminal panel in the app.

A PTY is more than redirecting stdout/stderr: some tools inspect whether stdin/stdout are a TTY, use ANSI control sequences, handle resize signals, or prompt for interactive input. A process spawned with ordinary pipes may behave differently from one launched inside a terminal.

Recommended approach in this Tauri app:

- Keep PTY creation and process ownership in Rust.
- Evaluate a maintained cross-platform Rust PTY library such as `portable-pty` (part of the WezTerm ecosystem) if a true PTY is needed.
- Render the terminal in the Vite frontend with an appropriate terminal emulator such as xterm.js if the project does not already have one.
- Support stdin writes, terminal resize, scrollback, cancellation/termination, exit status, and terminal cleanup.
- Separate raw terminal output from the app's normalized agent events.
- Use this mode for terminal-native UX, interactive login, troubleshooting, and compatibility fallbacks—not as a pretend structured-chat interface.

Reference: https://docs.rs/portable-pty/latest/portable_pty/

## 4. Recommended Rust + Tauri 2 architecture

### Frontend (Vite + existing UI framework)

Responsible for:

- Provider catalog/settings screens.
- Provider selector and session UI.
- Rendering normalized agent messages and events.
- Showing permission/approval prompts when the integration provides them.
- Terminal pane for PTY-based sessions.
- Displaying progress, errors, install/update status, diagnostics, and update preferences.

The webview should not execute arbitrary shell commands. Do not move process control into React/Vite or the renderer for convenience.

### Tauri IPC boundary

Use typed Tauri commands for discrete requests, for example:

- `list_cli_providers`
- `scan_cli_providers`
- `get_cli_provider_details`
- `set_cli_provider_enabled`
- `install_cli_provider`
- `update_cli_provider`
- `uninstall_cli_provider`
- `start_agent_session`
- `send_agent_input`
- `respond_to_agent_permission`
- `cancel_agent_session`
- `resize_agent_terminal`
- `get_agent_session_history`

These names are illustrative; match the existing project's conventions. Do not create one Tauri command per vendor if the operation belongs to a shared service.

Use typed Tauri IPC **Channels** for ordered/high-volume session streaming (agent event deltas, process output, PTY data, install logs/progress). Use Tauri events for occasional low-volume app-wide state notifications. The Tauri docs explicitly distinguish the general event system from Channels designed for ordered streaming operations such as child-process output.

Reference: https://v2.tauri.app/develop/calling-frontend/

### Rust core

Use existing abstractions when they exist. Otherwise consider distinct responsibilities:

- `CliProviderRegistry`: stable metadata, executable candidates, documentation URLs, OS availability, declared capabilities.
- `CliDetectionService`: executable resolution, version detection, installation-source hints.
- `CliProviderAdapter`: one per CLI/protocol family where needed.
- `AgentSessionManager`: start/resume/interrupt/stop sessions, lifecycle state, working directory, process handles.
- `AgentEventNormalizer`: translate native protocol/CLI events into app-owned event types.
- `ProcessRunner`: safe direct process execution, timeouts, cancellation, exit status.
- `PtyManager`: PTY lifecycle, read/write, resize, cleanup.
- `CliLifecycleService`: install/update/uninstall with per-tool strategies.
- `CliPreferencesStore`: persisted app-specific enablement and update preferences.
- `CliDiagnosticsService`: sanitized troubleshooting data.

Avoid over-abstraction. If the codebase already has process, task, agent, provider, or persistence services, extend those instead of creating parallel systems.

### Local process ownership

For the first local-only version, Rust can spawn and supervise the installed CLI subprocesses directly. A second server process is unnecessary unless a concrete requirement justifies it (for example remote clients, background service semantics, or shared multi-window orchestration).

If a background service is later required, define a narrow authenticated RPC contract and retain the same provider/session model. Do not introduce an unauthenticated localhost WebSocket listener, broad CORS, or a general command-execution server as a shortcut.

## 5. Internal event model

Normalize supported information into app-owned event types, without pretending that every agent emits every kind of event. For example:

- `SessionStarted`
- `SessionResumed`
- `AssistantMessageStarted`
- `AssistantMessageDelta`
- `AssistantMessageCompleted`
- `PlanUpdated`
- `ToolStarted`
- `ToolOutput`
- `ToolCompleted`
- `PermissionRequested`
- `PermissionResolved`
- `TerminalOutput`
- `FileChanged` (only when reliably reported or independently detected)
- `UsageUpdated` (only if supplied by the provider)
- `SessionCompleted`
- `SessionInterrupted`
- `SessionFailed`
- `ProviderNotice`
- `UnknownProviderEvent`

Each event should carry appropriate metadata such as session ID, provider ID, timestamp/sequence number, payload, and origin. Keep raw provider payloads only when useful for troubleshooting and ensure secrets are redacted. Unknown events should not crash a session; record them safely for diagnostics and preserve forward compatibility where reasonable.

## 6. Session persistence and recovery

Persist app-owned session metadata, not live process handles. A live OS process handle is runtime state and cannot be restored from ordinary settings data after restart.

Track as applicable:

- App session ID and provider ID.
- Adapter/mode selected.
- Project/workspace ID and validated working directory.
- Native agent session/thread ID if provided.
- Start/end times and terminal exit status.
- Runtime state: starting, running, waiting for approval/input, completed, failed, interrupted.
- Safe event/transcript references consistent with the app's retention and privacy rules.
- Whether the provider supports resume/reconnect.

On app restart, reconcile persisted sessions with reality. Do not claim an old process is still running merely because the database says its status was `running`. Reconnect to a documented service where supported; otherwise mark it as interrupted/unknown and offer a safe recovery path.

## 7. Permission and safety model

Do not reduce the provider's security merely to make the integration easier.

- Preserve the CLI's existing approval/sandbox behavior by default.
- Where a native protocol exposes permission requests, show them in the app UI and send the user's decision through the supported protocol.
- In PTY mode, let the CLI's own interactive permissions display normally.
- Never silently enable unrestricted filesystem/shell access.
- If the app also has project-level permissions, define how they coexist with native agent permissions; do not pretend a prompt from one layer controls the other unless the implementation actually enforces that policy.
- Show the working directory and project scope before starting a potentially modifying task.
- Cancellation must stop or interrupt the agent using the provider's supported mechanism; if termination is needed, manage child/descendant processes and PTY cleanup carefully.

## 8. API providers and CLI providers are distinct provider types

Keep existing API provider functionality intact. The provider domain should represent two types, not force both into the same implementation:

- **API provider:** endpoint, API credential/secret reference, model catalog, API capabilities.
- **CLI provider:** executable, detected version/source, installation ownership, native auth status (sometimes unknown), supported interaction modes, model/configuration capabilities, app enablement.

A CLI is not necessarily a single model. It may own a model chooser or route requests through its own provider ecosystem. Do not fabricate a model list for CLI agents that do not expose one.

---

# Part II — Copy/Paste Implementation Prompt for the Coding Agent

## Mission

You are a senior Rust/Tauri engineer and desktop-agent architect. Implement a production-quality CLI Provider Management System in this existing application.

The app already supports API providers. Add first-class local CLI agents so users can discover, install (where safely supported), configure, update, enable/disable, and launch supported CLIs from the app. Integrate agents into the existing task/chat/project workflow where possible.

This is an implementation task. Inspect the repository, plan, and then implement incrementally. Do not stop after producing an architecture proposal unless a genuine blocker makes implementation impossible.

## 0. Absolute repository and worktree protection

I am actively working in a separate Git branch and worktree. This repository may contain important uncommitted changes, untracked files, unfinished work, and changes made by other tools.

Before editing:

1. Inspect current directory, Git top-level directory, branch, worktree list, and complete `git status --short`.
2. Record existing modified, staged, untracked, and ignored files that might be relevant.
3. Inspect the existing architecture, package scripts, workspace structure, Rust crates, frontend components, persistence, provider system, terminal/process handling, tests, and Tauri capability/security configuration.
4. Establish a clear baseline so your changes can be distinguished from prior developer work.

Rules:

- Stay in the current worktree and branch.
- Do not create/switch branches or worktrees.
- Do not run `git reset --hard`, `git clean`, destructive checkout/restore commands, or anything that can discard local work.
- Do not stash, revert, overwrite, delete, or auto-format unrelated developer changes.
- Do not commit changes.
- Do not modify unrelated features just to make this task easier.
- Do not replace entire existing modules where targeted additions are sufficient.
- Do not expose secrets or move credentials into logs/source/control output.
- If a potentially necessary edit intersects with unfinished work, understand that work and preserve it.

After the initial inspection, outline the implementation plan briefly, then continue implementation.

## 1. Architecture-first implementation

Before deciding the final integration mode for any CLI, verify current official documentation and the actual executable/version behavior. The registry should declare supported capabilities, and the UI must be driven by actual capabilities rather than assumptions.

Use this priority when choosing an integration mode:

1. Documented agent protocol/native app-server suitable for rich integration.
2. Documented structured/headless CLI interface with machine-readable output.
3. PTY-backed interactive terminal fallback.
4. Documentation-only/limited support when none of the above can be implemented safely.

Do not write a universal terminal-output parser to mimic a structured API. Do not falsely claim every CLI exposes tool events, usage, session resume, model selection, approvals, or structured messages.

## 2. Complete CLI catalog — include all 19 entries

Create a typed registry containing every CLI below. All entries must appear in Settings even if some lifecycle or rich-integration actions are unavailable. Correct executable candidates, official names, installation paths, update commands, authentication methods, maintenance status, platform restrictions, and protocols against current official documentation before implementing.

### Primary tools

1. **Claude Code** — executable `claude`  
   Docs: https://code.claude.com/docs/en/getting-started
2. **OpenAI Codex CLI** — executable `codex`  
   Repo: https://github.com/openai/codex
3. **OpenCode** — executable `opencode`  
   Docs: https://opencode.ai/docs/
4. **Gemini CLI** — executable `gemini`  
   Repo: https://github.com/google-gemini/gemini-cli
5. **GitHub Copilot CLI** — executable `copilot`  
   Docs: https://docs.github.com/en/copilot/get-started/cli-quickstart
6. **Cline CLI** — executable `cline`  
   Repo: https://github.com/cline/cline
7. **Pi Coding Agent** — executable `pi`  
   Docs: https://pi.dev/docs/latest
8. **Kilo Code CLI** — executable `kilo`  
   Docs: https://kilo.ai/docs/code-with-ai/platforms/cli

### Additional tools

9. **Qwen Code** — executable `qwen`  
   Repo: https://github.com/QwenLM/qwen-code
10. **Kimi Code CLI** — executable `kimi`  
    Docs: https://www.kimi.com/code/docs/en/kimi-code-cli/guides/getting-started
11. **Goose** — executable `goose`  
    Docs: https://block.github.io/goose/
12. **Mistral Vibe CLI** — executable `vibe`  
    Docs: https://docs.mistral.ai/vibe/code/overview
13. **Kiro CLI** — executable `kiro-cli`  
    Docs: https://kiro.dev/docs/cli/quick-start/
14. **OpenHands CLI** — verify executable and install details  
    Repo: https://github.com/All-Hands-AI/OpenHands
15. **Aider** — executable `aider`  
    Docs: https://aider.chat/
16. **Amp** — verify executable and install details  
    Docs: https://ampcode.app/docs/cli
17. **Crush** — executable `crush`  
    Repo: https://github.com/charmbracelet/crush
18. **Open Interpreter** — typically `interpreter`; verify current CLI  
    Repo: https://github.com/openinterpreter/openinterpreter
19. **Continue CLI** — historically associated with `cn`; verify current status and command  
    Repo: https://github.com/continuedev/continue

Catalog accuracy rules:

- Target the current Kimi Code CLI, not an archived legacy Kimi CLI.
- Kilo Code CLI and Kiro CLI are distinct products.
- Represent Continue as legacy/compatibility-only if its maintenance status requires it.
- Never claim a legacy, archived, or unmaintained CLI is actively maintained.
- Distinguish CLI executables from similarly named desktop apps, IDE extensions, or unrelated commands.
- Every listed provider must have a registry entry and UI card even if support is limited.
- Only show lifecycle actions that are truly implemented and safe for that tool and installation source.

## 3. Provider domain and registry

Extend the existing provider model carefully rather than breaking API providers.

Represent API and CLI provider types separately while sharing common UI concepts (display name, enablement, status, docs, errors).

For each CLI entry, define typed metadata as appropriate:

- Stable provider ID and official display name.
- Description, category, icon source or app icon key, official docs URL.
- Executable candidates and resolution rules.
- Supported operating systems and prerequisites.
- Version-detection strategy.
- Installation source/strategy definitions.
- Update/uninstall capabilities and source ownership requirements.
- Authentication/readiness detection capabilities.
- Supported interaction modes: protocol, structured CLI, PTY.
- Supported protocols/API modes and supported protocol versions.
- Model selection capabilities only if truly supported.
- Session resume/reconnect support only if truly supported.
- Limitations and migration/maintenance notes.

Use a typed capability model instead of many fragile booleans where feasible. The UI should derive actions from declared capabilities and current detected state.

Do not hard-code all provider-specific behavior in React components.

## 4. Settings UX

Under the existing Settings > Providers area, preserve the API Providers screen and add a distinct CLI Providers section/tab using the established design system.

Build a polished management UI with:

- Search by CLI name, alias, executable, or ecosystem.
- Filters for All, Installed, Not installed, Enabled, Disabled, Updates available, Needs attention, and Unsupported/limited support when relevant.
- Sorting such as alphabetical, installed first, update available first.
- Summary counts for registered, installed, enabled, updates available, and needs-attention items.
- Per-CLI list/card with official name, description, installation state, installed version, latest version when verified, executable path where useful, authentication/readiness state, update state, enablement, documented capability indicators, and docs link.
- Context-appropriate actions: Detect/Rescan, Install, Enable/Disable, Configure, Authenticate/Open login, Launch, Update, Uninstall, Diagnostics, Documentation.
- Per-provider details panel or dialog explaining installed source, path, version, supported modes, and limitations.
- Clear loading, progress, success, failure, empty, unsupported, and cancellation states.
- Accessible labels, keyboard navigation, tooltips for advanced controls, and responsive layout.

Do not add nonfunctional buttons, fake progress, placeholder success states, or a cluttered row of every possible action. Prefer one main action and an overflow/context menu.

## 5. Accurate provider state model

Do not encode every condition in one `installed` flag.

Represent independent dimensions for at least:

### Discovery/installation

- Unknown/not scanned.
- Detecting.
- Not installed.
- Installed; executable verified.
- Executable found but version check failed.
- Unsupported on current OS.
- Installation in progress.
- Update in progress.
- Uninstall in progress.
- Failed operation.

### Ownership/source

- Managed by this application.
- Externally installed and user-managed.
- Recognized package-manager installation.
- Source/ownership unknown.

### App enablement

- Enabled.
- Disabled.

### Readiness/authentication

- Ready, where reliably verified.
- Authentication may be required.
- Authentication flow required.
- Readiness unknown.
- Configuration invalid or prerequisite missing.

### Updates

- Unknown/not checked.
- Up to date.
- Update available.
- Update not supported/controlled externally.
- Update check failed.

An installed executable does not prove that the CLI is authenticated. Disabling a provider must never uninstall it. A provider that is enabled but missing/broken must be shown as unavailable.

## 6. Cross-platform executable discovery

Support Windows, macOS, and Linux according to the app's established release targets.

Scan:

- The GUI process PATH.
- Standard documented executable locations.
- Common package-manager locations when reasonable.
- Official CLI install locations.
- Platform-specific executable wrappers.
- User-configured absolute paths.

On macOS/Linux, account for GUI processes receiving a different PATH than an interactive login shell. Do not silently rewrite shell profile files. On Windows, handle `.exe` and supported command wrappers carefully. Avoid launching arbitrary shell strings to resolve commands.

Discovery must:

1. Resolve candidate paths.
2. Verify the resolved command corresponds to the expected CLI where possible.
3. Run a documented version check with a strict timeout.
4. Determine the installation source when possible without invasive filesystem crawling.
5. Record capabilities and unknowns honestly.
6. Refresh state safely.

Provide initial discovery, manual rescan, refresh after lifecycle actions, and optional startup scan. Avoid scanning on every UI render. Use bounded concurrency, timeouts, and cancellation. Do not recursively search the entire disk or execute arbitrary similarly named commands.

## 7. Safe process execution and PTY runtime

Keep process execution in the Rust/native layer or existing approved backend service.

For normal child processes, use argument arrays and direct executable invocation. Avoid interpolating provider names, user input, paths, or server-supplied strings into a shell command. Resolve executables before launching.

For PTY mode:

- Evaluate a suitable maintained Rust PTY crate (for example `portable-pty`) against project MSRV, license, platform support, and current maintenance.
- Support start, stdin write, stdout/stderr-equivalent terminal output, resize, exit notification, interrupt/termination, and cleanup.
- Ensure cancellation cleans up descendants where appropriate and does not leave zombie/orphan processes.
- If the frontend has no terminal emulator, assess xterm.js plus its fit addon for terminal rendering. Keep all process control in Rust.
- Do not confuse ordinary piped stdin/stdout with a real PTY.

For structured/headless mode:

- Use each tool's documented non-interactive flags/input format.
- Parse documented JSON/JSONL or event formats incrementally.
- Handle partial lines, malformed events, unknown future event types, timeouts, process exit codes, and final result events.
- Never treat terminal styling/pretty text as a stable protocol if structured output exists.

For protocol mode:

- Prefer supported local stdio transports where available.
- Use official protocol libraries where viable and check their license, maturity, compatibility, and versioning.
- Do not expose a local network listener unless there is a concrete need. If unavoidable, bind to loopback, authenticate, constrain CORS/origins, and explain the security boundary.

## 8. Agent protocol / ACP strategy

Create a generic protocol adapter where it makes sense, but do not assume all CLIs support ACP.

- Verify each CLI's official protocol capabilities at implementation time.
- Start with the supported version(s) exposed by the selected Rust SDK and agents; negotiate versions if supported.
- Keep ACP wire models and provider-specific details behind the adapter boundary.
- Map only available ACP events/capabilities to the app event model.
- Support session initialization, prompts, response streaming, cancellation, permission requests, terminal updates, and model/config options only where advertised by the agent/protocol implementation.
- Manage subprocess stdin/stdout framing, JSON-RPC request IDs, response correlation, notifications, errors, initialization, shutdown, timeouts, and process exit carefully.
- Store native session IDs only when supplied; do not invent resumability.
- Keep raw protocol diagnostics sanitized and bounded.

For Codex, evaluate the current documented app-server interface for deep interactive integration, but isolate it as a provider adapter and version-gate it. For bounded jobs, evaluate the supported `codex exec` interface as a fallback. For OpenCode, evaluate ACP and its server API before choosing. For each provider, select the best documented interface rather than forcing a uniform mode.

## 9. Normalized events and conversation UI

Create a provider-independent, typed event envelope that supports relevant events such as:

- session started/resumed
- assistant message started/delta/completed
- progress/status
- plan update
- tool started/output/completed
- permission requested/resolved
- terminal output
- file changes, when reliably reported or independently detected
- usage, only when supplied by the provider
- completed/interrupted/failed
- provider notice and unknown provider event

At a minimum, each event should be correlated to an application session/provider, have ordered delivery where required, and include timestamps or sequence IDs where useful. Unknown events should not crash active work.

Render an app-native conversation when the agent supplies structured events. Render a terminal view for PTY mode. If a provider supports only one-shot output, represent that honestly instead of pretending it has a full interactive/session API.

Do not force an agent's internal conversation history into the app's API-chat data model if doing so loses provider-specific meaning. Define an explicit adapter/session abstraction.

## 10. Session lifecycle and workspace association

A session should know:

- Application session ID.
- Provider ID and adapter/mode.
- Project/workspace ID and validated working directory.
- Native agent session/thread ID when available.
- Runtime status and start/end time.
- Process/PTY handles only in runtime memory.
- Persisted safe metadata/event references according to existing data/retention policy.
- Resume support and reconnect behavior if genuinely available.

Keep child-process handles out of persistent settings. On app restart, reconcile stale `running` records against real process/service state. If the old agent cannot be resumed, mark the session interrupted or unrecoverable and offer a new-session path.

Launch agents in the selected workspace, not an accidental process working directory. Validate that paths exist and are directories where required. Do not send workspace contents to external services as part of discovery.

Optionally provide Git checkpoint/diff affordances if the app already has Git support. Do not create branches, commits, resets, worktrees, or automatic rollbacks without explicit user action. Any snapshot feature must be non-destructive and opt-in or clearly explained.

## 11. Install management

Each provider declares installation sources and operations explicitly. Do not force every CLI through npm, Homebrew, winget, or one universal updater.

Verify the official procedure for each CLI and supported operating system. Prefer official package registries/installers and integrity verification where available. Avoid blindly downloading and executing arbitrary remote shell scripts.

Installation flow:

1. Show source/prerequisites and relevant permissions.
2. Require approval for material privilege escalation.
3. Run a cancellable, bounded operation using direct executable/argument APIs where possible.
4. Stream accurate progress/logs with secrets redacted.
5. Verify executable identity and version after completion.
6. Record source/ownership and refresh state.
7. Leave the tool disabled until the user chooses to enable it, unless existing product conventions justify another explicit choice.

If safe installation automation is not available, display the official setup instructions and a Rescan button. Do not fake completion.

## 12. Uninstall management

Never uninstall a CLI simply because the user disables it.

Distinguish app-managed installations from externally installed or unknown-source tools. Only offer automatic uninstall where the source and documented removal behavior are verified and the user explicitly confirms. For unknown/external installations, prefer instructions rather than deleting executable files.

Before destructive work, explain what will be removed. Never delete project files, API provider settings, native credentials, user configuration, or CLI history as a side effect. After removal, verify the expected executable is absent and rescan; report partial failures accurately.

## 13. Update management and automatic updates

Implement manual update checking and per-provider update capabilities based on the CLI and installation source.

Settings should include:

- Global automatic-update preference.
- Per-CLI automatic-update toggle.
- Check for updates now.
- Optional check-on-startup.
- Last check result/time where available.
- Update status and progress.
- Clear distinction between check-only, download, and install.

Default to conservative behavior. Do not silently change external installations or override the CLI's own update preference. Auto-update should be opt-in, and only for sources the app can safely manage. For package-manager-owned/unknown installations, provide clear instructions or ask before invoking a system package manager.

Do not update a running agent where an update could break the active task. Coordinate updates to avoid concurrent package-manager operations. Verify the installed version afterward. Do not mark success based solely on a zero exit code.

## 14. Authentication and configuration

Use the CLI's existing login/configuration system wherever possible. Do not ask the user to enter an API key into our app if the CLI can authenticate using its own documented browser/device/login flow.

- Use safe documented readiness/auth checks.
- If auth cannot be reliably checked non-interactively, report “unknown” or “may require sign-in”.
- Offer a native CLI sign-in command/interactive terminal when appropriate.
- Never read or scrape tokens from configuration files.
- Never log environment variables or full configuration dumps.
- Avoid credentials in command arguments when safer channels exist.
- Do not overwrite global CLI model/provider/configuration.
- Any app-specific override must be explicit, reversible, and scoped.

## 15. Enable/disable and provider selection

App enablement is independent from installation and authentication.

- Disabled providers remain installed and keep their configuration.
- Disabled providers are excluded from new-session provider selection.
- Existing sessions should not be destructively altered when toggling enablement.
- A provider selected while missing/unavailable must present a useful error/remediation.
- Persist enablement using existing settings/persistence patterns.
- Preserve API provider selection and existing API keys/models.
- Do not imply a CLI represents one model if it manages model choice internally.

## 16. Persistence and migration

Use the application's existing persistence and migration infrastructure. Avoid creating a second database/store unless existing architecture makes it necessary.

Persist app-owned preferences/metadata such as enabled state, explicit custom executable path, update preference, ownership/source hints, and last safe scan/update metadata. Revalidate paths and versions at runtime because these values become stale.

Do not persist runtime process handles as if they survive restart. Do not erase or rewrite existing API provider records. Any schema migration must be backward-compatible, tested, and narrowly scoped.

## 17. Security requirements

Treat each CLI as a local program that may modify files and run commands with the current user's permissions.

- Never execute arbitrary shell strings from renderer/UI inputs.
- Use direct executable invocation and argument arrays where possible.
- Validate paths and executable identity.
- Use restrictive Tauri capabilities/permissions; do not expose a broad shell plugin or unrestricted command execution to the renderer.
- Keep process management and privileged filesystem work in Rust.
- Avoid unnecessary administrator/root privileges.
- Use timeouts/cancellation, bounded output buffers, and concurrency limits.
- Sanitize diagnostics and redact known sensitive fields.
- Preserve native agent permission/sandbox controls.
- Require confirmation for destructive lifecycle operations.
- Avoid local server listeners unless needed; secure them if they exist.
- Do not ship API keys, tokens, or credentials in source, logs, fixtures, or debug output.

## 18. Error states and diagnostics

Provide specific messages/remediation for: not installed, path missing in GUI environment, version timeout, unsupported OS, authentication unknown/required, prerequisite missing, network failure, install/update/uninstall failure, external package manager unavailable, unknown ownership, invalid config, unsupported mode, protocol negotiation error, malformed structured output, session interruption, and process crash.

Give concise user-facing messages with expandable sanitized diagnostics. Offer actions like retry, rescan, select executable, open official docs, launch login, or copy a sanitized diagnostic report.

Do not dump the full PATH, environment, command line, or config if it may contain secrets. Make diagnostic sharing an explicit action.

## 19. Testing strategy

Add tests following existing conventions. Prefer fake executables, mocked adapters, fixtures, temporary directories, and injected process runners. Do not install/update/uninstall real user tools in test runs.

Test at least:

### Registry and state
- All 19 entries exist with stable unique IDs.
- Executable candidates and aliases do not accidentally identify another tool.
- Capability flags control actions correctly.
- Unsupported/legacy providers render honestly.
- Installation, readiness, enablement, and update state remain independent.

### Discovery
- Installed/missing executable.
- Custom executable path.
- Version success/failure/timeout.
- GUI PATH mismatch handling.
- OS-specific candidates/wrappers.
- Scanner cancellation and concurrency limits.

### Process, protocol, and PTY
- Argument arrays do not allow command injection.
- Structured stream handles partial lines and malformed/unknown events.
- Protocol request IDs/errors/cancellation behave correctly.
- PTY input/output/resize/exit/cancellation work.
- Child processes are cleaned up.
- No UI hang on long-running jobs.

### Lifecycle
- Installation verification after completion.
- External installs are not mislabeled app-managed.
- Update follows the correct installation source.
- Uninstall requires confirmation and does not delete unrelated data.
- Failure/cancellation restores coherent UI state.

### Provider behavior/regression
- Enabled/disabled persists.
- Disabled provider is absent from new-session selection.
- Existing API provider settings and keys remain intact.
- Provider switching does not break API path.
- CLI launches in correct project directory.
- Existing application features continue working.

### Security
- No shell injection from provider names/paths/user input.
- Secrets are redacted in logs/diagnostics.
- Remote metadata cannot trigger arbitrary commands.
- Tauri permissions remain least-privilege.

Run relevant unit/integration tests, formatting, Clippy, TypeScript type checking, linting, and build checks using the repo's actual scripts/toolchains. Do not rewrite unrelated code to fix pre-existing failures.

## 20. Implementation phases

### Phase A — Inspect and baseline

Inspect repository/worktree and map settings, API provider, project/session, process, persistence, security, and test architecture. Preserve all pre-existing modifications.

### Phase B — Architecture and capability audit

Verify all listed tools against official docs. Produce a compact internal matrix of their actual detection, protocol, structured CLI, PTY, auth, install, update, uninstall, platform, and maintenance capabilities. Prefer official docs over assumptions. Keep unsupported actions disabled with explanations.

### Phase C — Shared runtime

Implement the registry, discovery, normalized state/events, safe process execution, session manager, persistence, and adapter interface.

### Phase D — UI

Implement Settings > Providers > CLI Providers and its real search/filter/status/action flows.

### Phase E — First rich integrations

Prioritize a small set with documented structured/protocol interfaces—e.g. OpenCode ACP, Claude Code structured output, Gemini headless JSONL, and Codex's best current documented integration mode. Verify mode selection against actual versions and documentation. Do not allow this phased delivery to omit the other 19 catalog entries.

### Phase F — PTY compatibility and remaining adapters

Implement PTY terminal fallback and provider-specific adapters incrementally, each with explicit capability declarations and truthful UI states.

### Phase G — Install/update/uninstall

Implement only verified source-specific lifecycle operations, with ownership detection, confirmation, verification, and opt-in auto-update.

### Phase H — Regression/security verification

Run tests and inspect all diffs. Confirm API provider workflows remain unchanged.

### Phase I — Final worktree audit

Run `git status --short` and inspect the diff. Confirm all original files/changes remain and only intended files were added/modified. Do not commit.

## 21. Definition of done

- Existing API providers remain fully functional and existing user configuration is preserved.
- Settings contains a polished CLI provider management section.
- All 19 listed CLIs appear in the registry/catalog.
- Discovery uses real path/version checking and is safe/cancellable.
- Each CLI's actual integration mode is documented in the registry.
- The runtime supports protocol, structured/headless, and PTY execution as distinct adapter modes where appropriate.
- Supported CLIs can be launched in the selected project/workspace.
- Session output is streamed without blocking the UI.
- Enablement is independent of installation and does not uninstall software.
- Install/update/uninstall/auto-update behavior is source-aware and conservative.
- Authentication is reused safely where supported and reported honestly where unknown.
- Security boundaries and Tauri capabilities remain least-privilege.
- Tests/build checks are run and results reported truthfully.
- No user work is discarded; no branch/worktree changes or commits are made.

## 22. Required final report

At completion, report:

1. The architecture found and reused.
2. The architecture implemented and why the integration mode was chosen.
3. Files/modules changed.
4. Status of each of the 19 CLI integrations, including supported modes and limitations.
5. Lifecycle capabilities implemented per tool (detect/install/update/uninstall/auth/execute).
6. Platform support and any dependencies added (with justification).
7. Persistence changes/migrations.
8. Test, lint, typecheck, and build results.
9. Any known gaps or follow-up work.
10. Confirmation that API providers and existing worktree changes were preserved.

**Start by inspecting the existing repository and Git worktree status. Preserve ongoing work first. Then implement incrementally in the current worktree.**

---

# Part III — Reference links for the implementation agent

These links are starting points for verification. Check the current official source before relying on any behavior because CLI flags, protocols, package names, and lifecycle commands can change.

- T3 Code repository/architecture: https://github.com/pingdotgg/t3code
- T3 Code ACP provider docs: https://github.com/pingdotgg/t3code/blob/main/docs/user/providers-acp.md
- T3 Code architecture overview: https://github.com/pingdotgg/t3code/blob/main/docs/internals/overview.md
- Agent Client Protocol: https://agentclientprotocol.com/
- ACP GitHub organization and SDKs: https://github.com/agentclientprotocol/
- ACP Rust SDK: https://docs.rs/agent-client-protocol/latest/agent_client_protocol/
- Tauri v2 frontend communication and Channels: https://v2.tauri.app/develop/calling-frontend/
- Tauri shell plugin/security scope: https://v2.tauri.app/reference/javascript/shell/
- Cross-platform Rust PTY crate: https://docs.rs/portable-pty/latest/portable_pty/
- Claude Code CLI reference: https://docs.anthropic.com/en/docs/claude-code/cli-usage
- Codex app-server: https://learn.chatgpt.com/docs/app-server
- Codex integration overview: https://developers.openai.com/blog/codex-as-a-platform
- OpenCode ACP: https://docs.opencode.ai/docs/acp/
- OpenCode server: https://docs.opencode.ai/docs/server/
- Gemini CLI headless mode: https://geminicli.com/docs/cli/headless/

