# Tavi: Chat sessions, workspaces, and local data

## Curated product and engineering prompt

## Read this repository's storage design first

Before following this brief, read `AGENTS.md` and the storage/session/provider files named in the repository-specific review below. Appendix A below incorporates the existing `docs/storage.md` architecture document. It describes current storage behavior and proposals; it is reference context, not a command to overwrite the current implementation.

Use this priority order:

1. `AGENTS.md` and actual code determine current repository constraints and observed behavior.
2. Appendix A, merged from the existing `docs/storage.md`, is the reference for current storage decisions and storage migration rationale.
3. The **Repository-specific review** section of this prompt corrects or supplements those references where it records newer inspected facts.
4. The generic product recommendations earlier in this prompt describe possible target behavior. Do not mistake them for existing Tavi behavior. Where they conflict with repository facts, follow the repo-specific facts and state the proposed change as a proposal.

Do not duplicate the storage architecture in a second document. If implementation changes storage behavior, update the storage reference in Appendix A of this prompt and the README in the same implementation task so they describe the resulting code accurately.


You are designing **Tavi**, a desktop AI chat and coding application. Specify and implement a clear, privacy-conscious lifecycle for messages, sessions, workspace folders, and locally stored data. The design must work whether the user has selected a project folder or not. Treat chat sessions and project folders as different things: a session is a conversation record; a workspace is a place the assistant may read or change files when the user grants access.

Produce a concrete product/engineering design and implementation plan. State any assumptions, identify platform-specific paths, and keep storage paths configurable. Do not silently create, rename, move, or write into a user project folder. Do not expose the user's account name in normal UI, logs, telemetry, or documentation examples.

## Core behavior

### When the user sends a message with no folder selected

1. Accept and save the message as a new or continuing chat session. A selected project folder must not be required for ordinary chat.
2. Create a session record in Tavi's application-data area, not in an arbitrary project directory. Use the platform's standard per-user application-data location (for example, the OS app-data directory), and derive the application subdirectory from Tavi's stable app identifier. Do not hard-code a particular user's home path.
3. Do not create a workspace folder merely because a message was sent. The session can exist without a workspace. If the user later asks for coding or file work, explain that a workspace is needed and offer clear choices: choose an existing folder, create a new project folder, or continue with an explicitly supported scratch workspace. Do not write files elsewhere by guesswork.
4. If Tavi supports scratch workspaces, create them only when needed and make the location and lifecycle explicit. Keep scratch files separate from session metadata, identify them in the UI, and offer a way to open, export, or delete them. Do not automatically treat the chat-session storage directory as a project workspace.
5. If the request is answer-only and needs no local files, keep the session data in app storage and create no project directory.

### When the user has selected a folder

1. Save the session record in Tavi's application-data area, just as in the no-folder case. Store a reference to the selected workspace; do not put the canonical session database inside the project by default.
2. Treat the selected folder as the working directory only for operations covered by the app's permissions and user-visible behavior. Show the selected folder's display name and, where useful, a privacy-conscious shortened path. Let the user inspect or change the selection.
3. Do not create a second project folder or silently copy the project. Only create files or subfolders inside the selected workspace when the user's request calls for them. Before meaningful writes, show the target or provide an understandable review/undo mechanism.
4. Persist a workspace reference (canonical path or stable platform reference, depending on platform), last-used time, and optional display label. Handle missing, moved, renamed, inaccessible, or revoked folders gracefully; ask the user to relink rather than silently switching to another directory.
5. Make clear that selecting a folder grants workspace access, not blanket permission to upload all its contents. Read only files needed for the task, respect exclusions and ignore rules, and explain when files are sent to a remote model or service.

## Session lifecycle and storage model

Define these as separate entities:

- **Session:** one conversation, with a stable opaque ID, creation/update timestamps, title, message sequence, and optional settings or model metadata needed to reopen it.
- **Workspace:** an optional project-folder association, with a stable local reference, display label, and last-known status. A workspace can be used by multiple sessions; sessions can have no workspace.
- **Attachment/artifact:** a file explicitly attached, generated, or imported, with metadata linking it to its session and a clearly defined storage location.

Use a stable opaque session ID, not a person's name or message text, as the storage key. A readable session title is for display and may be edited; it must not be trusted as a filesystem path. If folders are used for individual session records, use a generated ID and safe filesystem encoding. Avoid putting sensitive prompt text into filenames.

Choose and document a persistence format appropriate to the app (for example, SQLite for structured session/message data, with separate files for binary attachments). Specify transaction behavior, schema migrations, backups, recovery after a crash, and how concurrent UI components avoid overwriting newer messages. Explain how data is indexed and how search works without leaking content through filenames or logs.

The design must answer explicitly:

- What is created on the first message, and what is not created?
- Where are sessions, messages, attachments, settings, indexes, logs, caches, and generated files stored?
- Which data is local-only, and which data may be sent to a model provider or another service?
- What happens when the app closes, restarts, loses network, or crashes during a write?
- How do users export, delete one session, delete all sessions, and clear local data?
- What is retained after logout or account changes, if accounts exist?
- How do retention, backups, encryption, and OS-level access work?

## Suggested local data inventory

Document a data map with purpose, storage location, sensitivity, retention, and deletion behavior for at least:

- Session metadata and titles.
- User and assistant messages, timestamps, and tool-call records.
- Attachments and imported files, including whether Tavi copies them or keeps references.
- Generated artifacts and scratch-workspace files.
- Workspace references and recent-folder history.
- App preferences, model/provider configuration, and UI state.
- Search indexes, thumbnails, temporary files, and caches.
- Diagnostic logs and crash reports.
- Credentials, tokens, or API keys, if supported.

Prefer OS credential storage for secrets. Do not store API keys in plaintext settings files, session records, logs, or crash reports. Minimize diagnostic data and redact message content, local paths, tokens, and filenames by default. If the app sends diagnostics, make that behavior discoverable and controllable.

Use the platform's standard application-data directory and an app identifier, not a hard-coded username path. On Windows this is typically under the user's application-data area; on macOS under the user's Library/Application Support area; on Linux under the XDG data/config/cache locations as appropriate. Show paths in documentation with placeholders such as `<user data directory>/Tavi/`, not real usernames. Distinguish data, configuration, cache, logs, and user-selected project files.

## Privacy, permissions, and user experience

- Explain in plain language that chat history is stored locally and identify any provider-side retention that applies. Do not claim local-only behavior if requests are sent to a remote model.
- Before sending context to a provider, make the scope understandable: current message, selected context, attached files, and any retrieved workspace files. Send the minimum needed.
- Provide controls to clear recent folders, forget a workspace reference, delete sessions and attachments, and configure retention where feasible.
- Deleting a session should remove or clearly account for its messages, attachments, indexes, and caches. State separately what deletion cannot erase, such as provider-side records governed by provider policy or backups that expire later.
- Avoid surprising automatic folder creation, recursive indexing, hidden file writes, or silent workspace changes.
- Protect against path traversal, symlink surprises, unsafe filenames, and accidental writes outside the selected workspace. Canonicalize and validate paths before file operations; explain any platform limitations.
- Do not store secrets in source control or generated project files. Keep app-owned session storage outside user project repositories by default.

## Expected output

Return a detailed, implementation-ready specification with these sections:

1. **User-facing behavior** for first message, later messages, folder selection, folder removal, and file-related requests without a folder.
2. **Lifecycle flow** from app launch through session creation, message save, provider request, response save, close/reopen, and deletion.
3. **Storage layout examples** for Windows, macOS, and Linux using placeholders, including a clear distinction between app data, cache, logs, attachments, and project files.
4. **Data model/schema** for sessions, messages, workspaces, attachments, and settings, including IDs and key relationships.
5. **Data inventory and retention table** covering local and provider-side data.
6. **Privacy and security controls**, including secret storage, log redaction, workspace access boundaries, and provider disclosures.
7. **Failure and recovery cases**, including offline use, interrupted writes, corrupt database, unavailable workspace, and migration failure.
8. **Deletion/export behavior** and user controls.
9. **Acceptance criteria** written as observable behaviors that can guide implementation and QA.
10. **Open decisions** that genuinely depend on Tavi's chosen platform, backend, model provider, sync strategy, or product policy. Separate these from recommendations; do not invent unsupported facts about Tavi.

## Baseline acceptance criteria

- A user can start a chat and receive an answer without selecting a folder.
- Starting a chat does not create a project/workspace directory.
- A session is saved under Tavi's app-data area and can be reopened after restart.
- Selecting a folder associates it with a session without moving the session database into that folder.
- A file operation without a workspace cannot silently write into the app's install directory, current directory, home directory, or an inferred project.
- Removing a workspace association does not delete the user's project files.
- A missing workspace prompts the user to relink or continue without it.
- Session titles and message content are not used directly as filesystem paths.
- App-owned logs do not contain raw prompts, secrets, or full local paths by default.
- Users can identify what is local and what is sent to a provider, and can delete local session data.

When making implementation recommendations, label assumptions clearly. Do not promise encryption, synchronization, local inference, end-to-end privacy, or provider deletion unless the selected architecture actually provides it.

# Expanded implementation specification for Tavi

Use this section together with the preceding prompt. It resolves an important boundary: **a chat session without a selected workspace is not a coding workspace and does not grant access to a GitHub repository.** Do not claim that Tavi can work on a huge GitHub project unless the project has been explicitly made available locally or through a configured GitHub integration and then attached to a workspace.

## Product assumptions to preserve

Tavi is a polished desktop application with chat and coding workflows, inspired by the interaction quality of Claude Desktop and other professional AI desktop products. Tavi's implementation stack is:

- Rust for the native backend and Tauri commands.
- Tauri v2 for the desktop shell, native permissions, plugins, and packaging.
- Vite for the frontend development/build pipeline.
- pnpm for JavaScript/TypeScript dependency management and scripts.
- The existing frontend has `src/components/`, `src/hooks/`, and `src/blocks/`. Inspect these before adding UI. Reuse existing components, hooks, and blocks when they fit. Inspect the hooks directory and reuse its existing hooks where they fit; do not assume it is empty. Add a component or block when no suitable reusable implementation exists, and keep new code consistent with project conventions.

Do not replace the current architecture or introduce a new framework, database, state manager, or UI kit without first checking the repository and explaining why the existing choices are insufficient. Inspect the actual `package.json`, pnpm lockfile, Tauri configuration, Rust crates, and existing UI patterns before editing. Preserve existing behavior and avoid broad refactors unrelated to the feature.

## Critical distinction: session, workspace, and artifact

These concepts must not be conflated:

1. **Session**: conversation history and UI state owned by Tavi. It can exist without a project.
2. **Workspace**: a user-authorized directory (usually a local Git repository or project) that Tavi may inspect or edit under explicit rules.
3. **Artifact**: a file created or imported for a specific task. Its destination must be visible and intentional.
4. **Scratch space**: an optional app-managed workspace created for work that does not belong in a selected project. It is not the session database and is never silently treated as the user's project.
5. **Remote repository**: a GitHub or other hosted repository. It is not accessible just because the user mentions it. It requires a supported integration or explicit clone/download action, authentication where required, and an explicit local destination/workspace.

## Required behavior for coding without a selected workspace

When a user requests code changes and no workspace exists:

- If the user only asks a conceptual question or requests a self-contained snippet, answer in chat; create no file.
- If they ask for a new standalone file or document, ask for or present an explicit destination chooser. A safe default can be a clearly named Tavi-created task folder inside the user's chosen Tavi projects/workspaces location, but only after the UI communicates where it will be created and the user confirms the destination through the normal product flow. An app's export flow may instead save to a user-selected path.
- If they ask to work on a project that is already available as an attached local folder, associate that explicit folder as the workspace.
- If they mention a GitHub project that is not local, explain that Tavi needs to obtain it. Offer supported actions such as connect GitHub, choose a repository and clone it, or select an existing local clone. Show repository identity, branch/ref, clone destination, and whether the operation will create a new directory before cloning. Never infer a clone destination from the session folder.
- For large projects, do not copy the whole repository into session storage or upload it wholesale. Work against the explicitly cloned/selected workspace. Use targeted file discovery and context selection, respect ignore rules, and send only task-relevant context to the provider.
- Before applying edits, show changed paths and provide review/undo or Git diff access. Keep all project writes within the approved workspace boundary. Do not create arbitrary files in the app install directory, current working directory, home directory, session store, or a hidden temp directory.
- If the product offers a scratch workspace, make the location, persistence, export, and deletion options clear before using it. Scratch work must not be described as a selected project. Avoid deleting scratch contents on app close unless the user has been told and has a recovery/export route.

If Tavi supports agentic multi-file edits, shell commands, or tool calls, the same workspace and destination restrictions apply to every tool, not only the UI file picker. Validate paths in Rust immediately before filesystem operations; never rely only on frontend validation.

## Folders, app data, and naming

Implement a `StorageLocations`/path service on the Rust side that resolves platform locations using Tauri/OS APIs and Tavi's stable app identifier. Avoid hard-coded absolute paths or usernames. Keep these categories distinct:

- **App data**: durable session database, message history, local metadata, and user-controlled app state.
- **App config**: preferences and non-secret configuration.
- **App cache**: rebuildable indexes, previews, transient downloads, and caches.
- **App logs**: minimal, redacted diagnostics with bounded retention.
- **Attachments**: app-managed copies only when the user attaches/imports or Tavi generates a file, organized by opaque IDs and linked to sessions. If an attachment remains at its original location, store a reference and handle it becoming unavailable.
- **Workspace/project**: user-selected or user-approved destination. Keep project files in the project, under visible project-relative paths.
- **Scratch/task output**: a separately named, visible location only if this feature is implemented. It must have explicit keep/export/delete behavior.

Use opaque IDs for directory names and records. Human-readable chat titles are display labels and may be duplicated, edited, or contain unsafe characters; do not use them as raw folder names. If a user-facing folder name is generated, sanitize it, avoid collisions, and retain the opaque ID as the stable identity. The UI should show friendly relative labels and avoid exposing a full home path unless the user opens a details/copy-path affordance.

Example only (resolve actual paths at runtime):

- Windows: `<OS app data>/Tavi/` for durable app data; `<OS app cache>/Tavi/` for rebuildable cache.
- macOS: `<user Library/Application Support>/Tavi/` for durable data; `<user Library/Caches>/Tavi/` for cache.
- Linux: `$XDG_DATA_HOME/tavi/` (fallback under the user's data directory) for durable data; `$XDG_CACHE_HOME/tavi/` for cache; config under `$XDG_CONFIG_HOME/tavi/` when appropriate.

Inside durable data, choose and document a structure, for example:

```text
Tavi/
  db/sessions.sqlite
  attachments/<session-id>/<attachment-id>.<safe-extension>
  exports/                 # only if explicitly part of product behavior
  migrations/              # only if required by chosen storage design
```

Do not add `work/` or `outputs/` as universal Tavi folders just because those names occur in another coding-agent environment. Those are product-specific conventions only if Tavi deliberately implements them. Explain every app-owned directory in settings/help, and provide an open-data-location control where appropriate.

## Session and message lifecycle: exact flow

Implement and document this sequence:

1. **Launch**: Rust resolves app paths; ensures required directories exist; opens/migrates the session store safely; frontend loads recent sessions and preferences. Do not scan the user's home directory or repositories at startup.
2. **Start chat**: create a session ID and minimal session row when the user starts a new chat or sends the first message, based on the existing UX. If the app has a draft state before send, keep it in memory or persist an explicit draft without creating a workspace. Define this behavior consistently.
3. **Submit message**: assign a stable message ID and monotonically ordered sequence; persist the user's message before starting a provider request. Show a pending state. Prevent duplicate sends on retries using request/idempotency IDs.
4. **Prepare context**: gather only the current conversation context and explicitly selected attachments/workspace files needed for the task. Apply file-size, token, ignore, and privacy limits. Show or make inspectable the context boundary. Do not recursively index a workspace unless the user opts in or the product clearly explains that operation.
5. **Provider request**: send through the configured model/provider path. Clearly disclose that relevant content leaves the device when using a remote provider. Avoid logging full request bodies, secrets, or file content.
6. **Stream and persist response**: render streaming output; persist safely as it arrives or commit a complete response with recoverable partial state. Distinguish canceled, failed, and completed responses. A restart must not silently mark an interrupted answer complete.
7. **Tool/file action**: authorize each action against the session's selected workspace and capabilities. Validate canonical resolved paths in Rust, reject path escape and unsupported symlink traversal, and persist a tool audit summary without secrets. Show diffs for writes and support undo/revert where feasible.
8. **Finish**: update session timestamps/title and usage metadata only if needed. A title may be generated locally or by a provider; disclose provider use if title generation sends content.
9. **Restart**: restore sessions from app data and mark unfinished requests appropriately. Restore a workspace association only if it remains available and permitted; otherwise ask the user to relink.
10. **Delete/export**: execute the documented data lifecycle consistently across database rows, attachments, indexes, caches, and any scratch area, and report limits on remote-provider deletion.

## Data model requirements

Use the project's existing data and serialization conventions where possible. If SQLite is selected, use migrations and transactions. A starting conceptual schema:

```text
sessions(
  id TEXT PRIMARY KEY, created_at, updated_at, title, status,
  workspace_id NULL, model_ref NULL, archived_at NULL
)
messages(
  id TEXT PRIMARY KEY, session_id, sequence INTEGER, role, content,
  created_at, status, parent_message_id NULL, provider_ref NULL,
  UNIQUE(session_id, sequence)
)
workspaces(
  id TEXT PRIMARY KEY, canonical_path_or_platform_ref, display_name,
  last_seen_at, status, created_at
)
attachments(
  id TEXT PRIMARY KEY, session_id, message_id NULL, kind, display_name,
  storage_kind, local_path_or_managed_key, mime_type, byte_size,
  content_hash NULL, created_at
)
tool_events(
  id TEXT PRIMARY KEY, session_id, message_id, tool_name,
  started_at, finished_at, status, redacted_summary
)
settings(key PRIMARY KEY, value, updated_at)
```

This is illustrative, not a mandate to use SQLite if the project already has a sound persistence layer. Do not store raw API secrets in `settings`; use OS keychain/credential storage. Store large blobs outside the database when appropriate, with cleanup and integrity checks. Use prepared statements, schema versioning, transactional migrations, backup-before-migration where viable, and crash-safe writes.

Specify how edits to an existing message, regeneration, branching, deletion, attachments, and streaming partials are represented. Keep provider secrets and unnecessary raw provider payloads out of the session store. Do not preserve hidden chain-of-thought; store only user-visible conversation and necessary action metadata.

## Tauri v2 and Rust implementation boundaries

- Keep filesystem, path resolution, database access, network/provider calls, secret handling, and workspace authorization in Rust commands/services. Do not expose unrestricted filesystem access to the frontend.
- Expose narrow typed Tauri commands/events such as `list_sessions`, `create_session`, `get_session`, `send_message`, `select_workspace`, `remove_workspace_association`, `list_workspace_files`, `preview_changes`, `apply_changes`, `export_session`, and `delete_session`, adjusted to existing naming conventions.
- Validate command inputs, IDs, sizes, MIME types, and paths on the Rust side. Return structured, typed errors that the UI can explain. Avoid commands that accept arbitrary paths and perform unrestricted reads/writes.
- Configure Tauri v2 capabilities and permissions with least privilege. Do not grant broad shell or filesystem access simply for convenience. If shell execution exists, make it a separately permissioned, visible feature with workspace-scoped working directory, user-visible command approval policy, timeouts, output limits, and cancellation.
- Use Tauri events for streaming/status changes with stable session/message/request IDs. Handle stale events and UI unmounts safely.
- Keep provider requests behind a backend abstraction so provider changes do not leak into UI components. Respect the current provider integration if one already exists.
- Keep frontend-to-Rust types aligned, preferably through existing generated bindings or a single shared schema approach already present in the project. Avoid duplicated ad hoc JSON contracts.
- Never trust the frontend to enforce workspace boundaries or secret protection.

## Frontend implementation in the existing Tavi structure

First inspect the actual source tree, route/layout structure, design tokens, global components, state patterns, and package scripts. Then plan small changes around existing conventions.

- `src/components/`: reusable primitives and shared UI such as buttons, dialogs, path display, loading/error states, and confirmation controls. Reuse existing global components first.
- `src/blocks/`: larger composed product sections such as session list, chat composer, workspace selector, empty state, attachment view, diff review, and storage/privacy settings. Reuse existing blocks first; create a block if one does not exist.
- `src/hooks/`: reusable frontend state/effect logic. Inspect the folder; if empty, add focused hooks only when repeated behavior justifies them (for example, session loading, streaming state, or workspace selection), following the project's TypeScript conventions.
- Keep page/screen orchestration thin and let Rust own durable state. Avoid duplicating session records in multiple frontend stores.
- Keep accessibility, keyboard navigation, focus handling, reduced motion, responsive layout, and clear loading/empty/error states consistent with the rest of Tavi.
- Preserve the existing Claude Desktop-like visual language of Tavi rather than copying another app's branding/assets. Use current design tokens and components.
- Make workspace state visible in the composer or header, and make the no-workspace state understandable. Do not imply a project is open when only a chat session exists.
- For a GitHub project, show acquisition status and destination; for a local project, show its display name and a way to inspect/change it.
- Provide explicit progress, cancellation, retry, and recovery for clone/import, indexing, long file operations, and provider streaming.

## Step-by-step repository implementation workflow

Follow this sequence and report completed steps:

### Phase 0 — Inspect and baseline

1. Inspect repository instructions (`AGENTS.md` and nested instructions), `package.json`, `pnpm-lock.yaml`, Vite config, Tauri v2 config/capabilities, Rust `Cargo.toml` files, current persistence/provider code, and existing app navigation.
2. Inspect `src/components/`, `src/hooks/`, `src/blocks/`, and current pages to identify reusable pieces. Do not assume hooks exist.
3. Trace current session/message behavior and determine what already persists. Do not introduce a competing storage system.
4. Write a concise implementation plan naming files/modules to change, migrations, user flows, and unresolved decisions. Keep unrelated refactors out of scope.

### Phase 1 — Define contracts and storage

1. Define session/workspace/attachment types and lifecycle states.
2. Define resolved storage locations through Rust/Tauri APIs and the app identifier.
3. Implement or adapt persistence using existing architecture; add versioned schema migration if needed.
4. Ensure first-message persistence works without a workspace and creates no workspace directory.
5. Add safe export/delete behavior and cleanup strategy for related attachment/cache data.

### Phase 2 — Add backend boundaries

1. Add narrow Tauri commands for session CRUD, message lifecycle, workspace association, and file operations required by the feature.
2. Add Rust-side path canonicalization, workspace boundary checks, size limits, error types, and least-privilege capability changes.
3. Add provider/context flow that sends only the selected task context and redacts diagnostics.
4. Add streaming/cancellation/retry behavior with idempotent request handling.
5. Add GitHub clone/import only if Tavi already supports or explicitly plans it; show destination and repository/ref before mutation. Otherwise provide a clear connect/select-existing-clone path without pretending GitHub access exists.

### Phase 3 — Build the UI using existing patterns

1. Reuse global components, blocks, and hooks after inspection.
2. Implement session list and chat flow, no-workspace empty state, workspace picker/association, and file-request resolution.
3. Implement explicit destination selection for creating new files or scratch workspaces.
4. Implement review of file changes, progress/error/cancel states, and settings controls for storage/privacy/deletion.
5. Ensure keyboard, screen-reader, focus, and responsive behavior.

### Phase 4 — Integrate, document, and verify

1. Wire frontend types to the Tauri commands/events and handle Rust errors cleanly.
2. Document data locations, provider data flow, retention, export/delete, and scratch behavior in Tavi's own help/settings/docs.
3. Run the repository's existing lint, typecheck, build, and Rust checks if available and appropriate; add focused tests for critical boundaries if the task scope calls for tests. Do not claim checks passed unless they were run.
4. Manually inspect all changed files, verify no session data enters project folders accidentally, verify no project writes happen without an explicit workspace/destination, and review Tauri capability changes.
5. Summarize files changed, behavior delivered, checks run, and remaining product decisions.

## Detailed acceptance criteria

### No selected workspace

- A user can start a normal chat and reopen it after restarting Tavi.
- No project folder, clone, or scratch directory appears merely because the user sent a message.
- A coding request cannot access a GitHub repository based on its name or URL alone.
- A file-creation request presents an explicit destination or a clearly disclosed, user-approved scratch option.
- The session database and app-owned message history remain outside any project repository by default.
- No operation writes to the app's install directory, process current directory, home directory, or an inferred location.

### Selected workspace

- The session remains in Tavi app data and references the workspace by a stable record.
- Tavi only reads relevant workspace content and communicates any remote sharing.
- All writes remain inside the authorized workspace, are reviewable, and do not silently alter unrelated files.
- Removing or losing a workspace does not delete project contents or conversation history.
- A project can be reused by multiple sessions without duplicating its files.

### Repository and UI quality

- Existing components/blocks/hooks and project conventions are inspected and reused.
- New components or blocks are added only where a suitable existing implementation is absent.
- Rust enforces filesystem and provider boundaries even if the UI is bypassed.
- Tauri v2 permissions remain least-privilege and are documented.
- The UI communicates whether a session has a workspace, what destination a file operation will use, whether content will be sent to a provider, and whether a request is still running.
- Error, offline, cancellation, recovery, export, and deletion states are understandable and actionable.

## Decisions to leave explicit until repository/product facts are known

Do not invent answers to these. Inspect the repository, propose a default, and mark items needing product choice:

- Exact app identifier, database library, state-management library, and provider architecture.
- Whether Tavi supports local inference, remote providers, user-supplied keys, hosted accounts, or sync.
- Whether GitHub integration exists and what OAuth/permission model it uses.
- Whether scratch workspaces are in scope and their default parent location.
- Whether conversation data is encrypted at rest beyond OS disk encryption.
- Whether session titles are generated locally or remotely.
- How backups, multi-device sync, and account logout interact with local data.
- Retention defaults and whether telemetry/crash reporting is enabled.

For every recommendation, distinguish current observed implementation from proposed behavior. Never assert that a feature exists merely because the prompt recommends it.

# Repository-specific review: Tavi as it exists today

This section was added after a read-only review of `C:\Storage\Coding\Tavi` on 2026-10-20. It is authoritative for tailoring this prompt to the current repository. It does not claim these features have been implemented; it records observed code/docs and identifies proposed work. Do not edit the repository as part of reviewing this prompt.

## Observed repository facts

- The product has two distinct surfaces, **Chat** and **Code**, rendered from `src/App.tsx` through the shell and `src/blocks/prompt-input/prompt-block.tsx`.
- Chats and code sessions already have separate typed stores (`src/lib/chats.ts`, `src/lib/sessions.ts`) built on `src/lib/threads.ts`. Chats cannot carry folder or mode fields; code sessions can carry a folder ID/name and agent mode. Code sessions without a folder are valid and are grouped as “No folder.”
- Both stores currently persist JSON arrays in namespaced `localStorage` (`tavi.chats.v1`, `tavi.code-sessions.v1`), capped at 50 each. A storage quota failure can reduce the saved list to 5; browser/webview storage can still be cleared or evicted. The README and Appendix A (merged from former `docs/storage.md`) explicitly identify durable desktop session storage as future work, not a current capability.
- Composer drafts and preferences are also browser/webview storage. Window geometry is separate and written by Rust into Tauri app data. This means “Tavi app data directory” does **not** currently contain the conversations.
- The website uses the File System Access API in `src/lib/fs-access.ts`; it stores directory handles and recent-folder metadata in IndexedDB database `tavi-fs`. The picker is read-only. The desktop path bridges to Rust using `src/lib/desktop.ts`.
- The Rust commands `list_directory` and `read_text_file` are read-only. In `src-tauri/src/lib.rs`, their allowed root is `AI_APP_FS_ROOT`, but when unset it defaults to the user's home directory. They canonicalize paths and reject resolution outside that root. This is a broad home-directory boundary, not a per-session selected-workspace boundary. The feature does not currently offer Rust write commands.
- The browser-side project walker in `src/lib/fs-access.ts` skips common generated/heavy directories, caps traversal at 4,000 entries, depth 6 by default, and reads source files up to 400 KiB. `@` mentions and folder file text are captured into the user turn when sent. Therefore selected project content can be sent to the remote model; this must be disclosed.
- Chat requests run through `server/chat.ts` and the OpenRouter provider. In development, `pnpm dev` starts Vite and the Node chat server together; Vite proxies `/api`. The built Tauri frontend is static and has no colocated chat server by itself. The repo docs identify shipping the server as a sidecar or using a hosted route as an unresolved requirement. Do not present the current dev server as a production-ready packaged backend.
- Tauri stores the OpenRouter key through the Rust `keyring` crate for desktop. The web route uses `OPENROUTER_API_KEY` from the server environment. Rust returns the desktop key to the webview so it can be attached as a bearer header to the loopback chat server; the docs identify this as a residual risk. The chat server states it does not log request bodies, headers, or the key.
- The agent modes currently change server-written system instructions; they do not implement autonomous editing or shell execution. Current tools include arithmetic, time, CORS-limited URL fetch, directory listing, and text-file reading. The README says the Code toolkit is not fully built and that models cannot write files or run commands. Do not describe current Code as a functioning repository editor.
- A repository clone flow already exists in `server/projects.ts` and `src/blocks/prompt-input/clone-dialog.tsx`: it shallow-clones HTTPS or SSH Git URLs via `git` (without a shell) into a projects root, with a 10-minute timeout, and refuses an existing destination. The default root is `<user Documents>/Tavi/projects`, overridable with `TAVI_PROJECTS_DIR`. The dialog displays this destination. After clone, the user must still choose the cloned directory through the folder picker before it is attached for Code. A project settings UI is described as planned but was not found in the reviewed files. This is not a GitHub account integration or repository browser; it is URL-based cloning.
- Tauri's identifier is `com.mad.tavi`. `src-tauri/capabilities/default.json` grants core/window permissions only; the filesystem commands are app-defined commands registered in Rust. Preserve narrow capabilities.
- The repository is a Vite + React 19 + TypeScript frontend, pnpm 12, Tauri v2 and Rust edition 2024. It uses Zustand and assistant-ui in places, and Lucide icons. Existing feature blocks are under `src/blocks/prompt-input` and `src/blocks/shell`; hooks are not empty and include both shared UI hooks and attachment hooks. `AGENTS.md` states `src/blocks/prompt-input/prompt-block.tsx` is the whole app surface, `server/chat.ts` is the chat server, no fake UI/data, no hidden model fallback, and no request-body/header/key logging.

## Replace generic/incorrect assumptions in the earlier prompt

When generating an implementation plan for this repository:

1. Do not say Tavi currently creates a durable session database under app data. It does not. The immediate plan must describe current `localStorage` behavior accurately, then propose migration to durable app-owned storage as a separate, backward-compatible feature.
2. Do not say GitHub access is absent. URL-based clone exists. Also do not claim there is OAuth, a GitHub repository picker, branch selection, authenticated private-repo access UX, or automatic workspace attachment; those were not observed.
3. Do not say the app creates no folder for a clone request. The current clone endpoint creates the projects root and clone destination once the user invokes the clone action. Ensure the UI destination remains explicit and improve it with an editable/selected destination if the product chooses that scope.
4. Do not imply Code currently edits files, runs commands, or has an autonomous coding agent. Implementing those is a major new capability and requires a separate, security-reviewed design. The current Rust filesystem tools are list/read only.
5. Do not assume selected folder means secure Rust workspace confinement. The browser picker grants read access in the web route; the desktop Rust boundary currently defaults to the home directory. If any agent/tool file operations are added, bind access to a per-session authorized workspace in Rust and enforce every operation there.
6. Do not say Tauri app-data storage is where all local data currently lives. Conversations are currently in webview storage; window state is in app data; desktop credentials are in the OS keychain; recent browser handles are in IndexedDB; cloned repos are in the projects root.
7. Do not introduce a SQLite dependency or replace the two store APIs by fiat. First compare the desired durable storage choices with the current interface, thread shapes, migrations, tests and cross-platform web target. Preserve the web target and migrate existing users' localStorage threads without losing or duplicating data.
8. Do not treat `src/hooks/` as empty. Reuse relevant hooks after inspection. Reuse existing components from `src/components/` and product blocks from `src/blocks/`; add feature components/blocks only where no fit exists.
9. Do not remove or change documented choices such as separate Chat/Code stores, per-side model settings, no default-model fallback, or server-authored system prompts unless the user explicitly asks and the implications are explained.
10. Treat repository instructions in `AGENTS.md` as applicable. In particular, no fabricated feature UI or placeholder content, keep provider logs free of request content/secrets, and run `pnpm typecheck` before any commit if a commit is in scope. No commit is needed for this prompt task.

## Repo-specific user flows the final design must specify

### A. Chat surface, no folder

- Create/continue a Chat record in the Chat store. Chat has no workspace field by design.
- The current chat surface has no filesystem tools, and the server rejects tool-carrying chat requests. A conceptual GitHub coding question remains ordinary chat; it does not clone or open a repo.
- If a user asks Chat to create a local file, clearly route them to Code or an explicit export/save flow; do not silently write the file.

### B. Code surface, no folder

- A Code session may exist without a folder; its history is still saved using the current code-session store and shown under “No folder.”
- With no folder, no repository source tree is available to the current file picker/context flow. Do not infer the repository from prompt text, current working directory, or a GitHub URL.
- If the user requests repository work, offer the existing clone-by-URL flow or choosing a local folder. For clone, show the exact destination before cloning; after clone, require the user to select the clone, matching current behavior. A mention of a GitHub repo alone does not authorize cloning.
- Since current Code has no write/command tools, say what is and is not possible truthfully. Any future editor/agent implementation must be separately scoped.

### C. Code surface, folder selected

- The folder association is stored on the code session as ID and display name. On web, folder access is a browser-granted read-only handle in IndexedDB. On desktop, file reads are through Rust and currently use the configured/global allowed root, not a workspace-specific capability.
- File candidates are bounded and filtered, and explicitly mentioned file contents are included at send time. Explain that selected files sent in prompts are transmitted to the configured remote provider.
- Current UI/system prompt must not imply the model can edit or run project files. Future edits require backend commands and strict workspace confinement, diff review, approval/undo behavior, and appropriate tests.

### D. Clone / import

- Current behavior is URL-based shallow Git clone into `<user Documents>/Tavi/projects` by default (or `TAVI_PROJECTS_DIR`), then a separate folder-picker action. Preserve the no-overwrite guard and avoid shell interpolation.
- Specify handling for private repos/SSH authentication, branch/ref choice, cancellation, partial clones, collisions, disk space, timeout, and cleanup before claiming a professional clone UX. The current flow does not provide all of these; list them as gaps only when relevant to implementation scope.
- Do not claim the cloned project is automatically available to the model before the user picks it.

## Tailored phased plan for this repository

### Step 1 — Create an accurate architecture map

Inspect and cite the actual current source paths listed above. Trace `prompt-block.tsx` send/save behavior, the `ThreadStore` data shapes and caps, the folder picker path per runtime, the Rust commands, `server/chat.ts`, provider configuration, clone route, and current documentation. Report current behavior, intended behavior, and gaps separately. Do not edit the repository during audit/planning.

### Step 2 — Decide and document product boundaries

Before implementing, settle: Should Chat always remain workspace-free? Should Code sessions without a workspace remain supported? Is local file creation/editing in scope now, or only read/context? What should the desktop chat-server deployment be (sidecar or hosted API)? What retention/backup/export guarantees should users get? Should clone destination remain fixed or become configurable? Do not silently decide policy-sensitive questions; provide safe recommendations and clearly identify decisions the owner must make.

### Step 3 — Design storage migration without data loss

If moving threads to durable desktop storage:

- Keep the web target on browser storage or provide an equivalent web persistence implementation.
- Introduce a narrow repository interface behind the existing `listChats`/`saveChat`/etc. surface, so UI changes remain bounded.
- Migrate both existing `tavi.chats.v1` and `tavi.code-sessions.v1` arrays from the webview exactly once, validate each record, preserve IDs/order/timestamps/pins/usage/modes/folder references/turns and captured attachment text, and do not delete the source until durable writes are verified.
- Define behavior for malformed records, quota failures, interrupted migration, duplicate IDs, rollback, app reinstall, export/import, and mixed-version launch. Make migration idempotent and test it.
- Keep folder handles and native credential storage in their existing appropriate stores unless the product explicitly changes their lifecycle. Do not copy API keys into the session database.
- Choose SQLite or another durable store only after comparing Rust dependencies, migration needs, concurrency, backups, and the current cross-platform web behavior. Document the choice and failure semantics.

### Step 4 — Close the workspace authorization gap before adding write tools

- Replace the broad home-directory default for desktop tools with an explicit, per-session workspace grant or a user-visible configured root. Missing authorization must fail closed.
- Bind a session's folder ID to a canonical Rust-side path/permission record. Frontend-provided arbitrary absolute paths are not authorization.
- Preserve read-only behavior unless the requested scope explicitly builds write/command capabilities. For any new write/tool feature: canonicalize before access, prevent traversal and symlink escape, account for TOCTOU where practical, allowlist/deny sensitive files, limit sizes/time/output, show a diff, require approval according to the mode, and provide cancellation/undo.
- Ensure server-created model tools cannot bypass this Rust authorization. If tools execute in Node instead, implement an equally strict workspace service there and do not trust prompt instructions as security.

### Step 5 — Make the clone flow professional and explicit

- Keep clone destination visible and create the root only after the user starts clone.
- Confirm remote, destination, default branch/shallow behavior and what files will be downloaded before starting. Provide progress/cancel/retry, useful sanitized errors, collision handling, and cleanup for failed partial clones.
- After clone, preserve the existing explicit “Choose folder” handoff or implement a secure direct grant if the platform API supports it. Never attach invisibly.
- Only add GitHub OAuth/repo discovery/private repository UI if it is actually implemented and configured; do not fake it.

### Step 6 — Build UI by extending existing product blocks

- Main changes likely belong in `src/blocks/prompt-input/` and `src/blocks/shell/`, with storage/provider logic under existing `src/lib/`, Rust commands in `src-tauri/src/`, and chat server changes in `server/` only where required.
- Inspect and reuse `src/components/`, `src/blocks/`, and `src/hooks/`; do not create parallel primitives or hooks without need. Follow `AGENTS.md`: Lucide icons, real backend for every control, no decorative fake functionality.
- Keep loading, empty, disconnected-permission, inaccessible-folder, migration, provider, clone, error, and cancellation states accessible and understandable.

### Step 7 — Production architecture for the remote model

- The current dev command starts the Node chat server, but the bundled Tauri app only loads Vite's static output. Before claiming desktop production chat works, either package a managed sidecar with lifecycle/port/auth/logging/shutdown/error handling, or use a hosted API with documented account/provider/privacy behavior.
- Do not leave an unauthenticated loopback endpoint that another local process can abuse. Use an app-specific ephemeral secret or equivalent local-origin/auth design if a sidecar is selected. Keep provider API keys in OS credential storage or server secret storage, never frontend persistent storage.
- Review the current key path carefully: the key reaches the webview for a bearer request to the loopback server. Improve this boundary if feasible so Rust/sidecar owns the credential and forwards provider requests without exposing the key to JavaScript. Document threat model and platform constraints.
- Preserve the current no-model-fallback behavior and server-authored system prompts.

### Step 8 — Verify and update docs

- Add focused tests for migration, persistence failures, workspace boundary enforcement, clone collision/partial cleanup, and per-surface behavior when those features are changed.
- Run relevant existing scripts (`pnpm typecheck`, `pnpm test`, `pnpm build`) and Rust formatting/tests/checks as the repository supports. Do not run commands that expose `.env.local` or print secrets. Do not report unrun checks as passed.
- Update the storage architecture reference in Appendix A and README storage/known-limitations sections so current behavior and future guarantees do not conflict.
- Provide a final summary listing observed facts, changes actually made, checks actually run, and remaining decisions. For this current review task, do not modify the repo; update only the separate prompt deliverable if needed.

## Highest-priority gaps surfaced by this review

1. Desktop sessions are not yet durable in Tavi's app-data store; they live in webview `localStorage` and can be cleared/evicted.
2. Rust file reads currently default to the whole user home when `AI_APP_FS_ROOT` is unset, rather than requiring an explicit selected workspace.
3. The current model integration is a development Node server; the production Tauri bundle lacks a colocated server/sidecar deployment solution.
4. Code mode currently gathers context and can read/list files, but it cannot edit files or execute commands; agent modes do not change that capability.
5. The clone flow is real but minimal: fixed/configurable-by-environment projects root, URL paste, shallow clone, then manual folder selection; no GitHub account integration.

These are not all necessarily bugs to fix in one task. Rank them by the user's requested scope, explain risks plainly, and do not promise “professional app parity” from a storage prompt alone. Treat this prompt as a detailed implementation brief that must be executed incrementally against real product requirements.


## Final accuracy correction

The desktop no-workspace Code flow must explicitly distinguish the current implementation from the desired behavior: Tavi has no *selected project context* in that state, but its registered Rust list/read tools may still access the configured filesystem root, which defaults to the user's home directory. Treat this as an existing authorization gap to fix or explicitly constrain. The browser build has different filesystem capability behavior. A future implementation must fail closed for file tools when no workspace grant exists; a system prompt alone is not a security boundary.


---

# Appendix A — Existing storage architecture reference

The following is the complete content of the former `docs/storage.md`, incorporated so this single prompt carries both the implementation instructions and Tavi's existing storage rationale. Treat statements about current behavior as observations to verify against source. Treat the final section “What to change for a shipping desktop app” as an existing proposal to evaluate, not as proof that the work is implemented. If this appendix and the repository-specific review disagree, follow the repository-specific review and inspect the code.
# Storage strategy

Where each piece of data lives, on each platform, and what survives what.

The app has two targets from one codebase: a **website** (plain browser) and a
**desktop app** (Tauri). Anything that must work on both goes through a browser
storage API, because in the desktop app the UI *is* a webview and already has
one. Only data that has to outlive the webview, or be shared with Rust, moves
behind `invoke`.

## The decision rule

| The data is… | Store it in | Because |
|---|---|---|
| A preference the user picked and could re-type | `localStorage` | Synchronous, needed on first paint |
| **Chats** | `localStorage` (small) → IndexedDB (large) | See "Threads" below |
| **Code sessions** | `localStorage` (small) → IndexedDB (large) | See "Threads" below |
| **Composer drafts** | `localStorage` | One per side, and small enough to be worth keeping |
| A folder handle the browser granted | IndexedDB | Handles cannot go in `localStorage` |
| An API key or other secret | OS credential store, via Rust | Never any web storage |
| A regenerated cache | Cache dir / temp, never persisted | Wipe is harmless |

The mistake worth avoiding is putting something in `localStorage` that the user
would be upset to lose, and then discovering the browser evicted it. The second
mistake is putting something permanent in a temp directory, and having the OS
delete it on a schedule.

---

## Preferences — `localStorage`

`src/lib/prefs.ts`. Model, effort level, agent mode, app font, and whether the
rail is open.

The model and the effort are remembered **per side**: `tavi.model.chat` and
`tavi.model.code`, `tavi.effort.chat` and `tavi.effort.code`. Chat and Code
are separate places, and the model you chat with is not the model you code
with — a cheap model for a quick question and a careful one for a change are
different choices, and "New chat" and "New session" each keep their own side's.

The agent mode's default is remembered **per folder** — `tavi.mode.<folderId>` —
the way a permission mode is remembered per folder in other tools. The way you
work in one repository is not the way you work in another. A session that is
already open keeps the mode it was run with.

- **Website:** `localStorage` for `https://your-host`. Shared across tabs,
  per-origin, per-browser-profile. Roughly 5–10 MB, but we use ~100 bytes.
- **Desktop:** the same API, backed by the webview's own profile on disk.

Why `localStorage` and not IndexedDB: the composer needs the model during its
first render, before any effect can await. IndexedDB would mean a blank or
wrong model on every cold start.

### The namespace, and the move out of the old one

Everything the app stores in the browser is under one namespace, so it cannot
collide with anything else on the origin. The namespace, and the move out of
the one the app had before it was renamed, belong to `src/lib/storage.ts`.

A value that is only in the old namespace is moved to the new one the first
time it is read, and the old one is removed afterwards. A rename is not a
reason to lose someone's chats or their choice of model, and the move never
overwrites: a value already in the new namespace is the newer one, and it
wins.

**One value is retired rather than moved.** The app used to keep one array of
threads, holding both chats and code sessions with nothing on either to say
which it was. It is gone, and it is deleted from **both** namespaces: the
namespace rule above would otherwise move the legacy copy straight back on the
next read. `src/lib/storage.ts` has `forgetStorage` for exactly this, and
`src/lib/migrations.ts` is where the one-time changes live.

The same is true of the model and the effort, which used to be one choice for
the whole app: the old value becomes the first choice on **each** side and the
old key is then removed.

### What is deliberately not stored

The **composer layout** — Chat or Code — is not stored. The app always opens
in Chat. The model, the effort and the mode are preferences about *how* to
work and are remembered; which of the two jobs the app starts on is a
question about what the user came to do, and a fresh start is the honest
answer to it. Coming back to Code is a click.

The **rail's width** is not stored either, for a different reason: a width
someone set by dragging is a fit for the window they were looking at, and
saving it would reopen the app at a width chosen for some other screen. The
rail's *open* state is stored, because that is a preference and not a fit.

### What can go wrong, and what we do about it

| Risk | Handling |
|---|---|
| Private mode / storage disabled | `readPref` returns `undefined`; app starts normally |
| Quota exceeded | `writePref` swallows; selection still applies this session |
| User clears site data | Everything non-secret is lost. Accepted — see below |
| Stored model no longer exists | Validated against the catalogue on load, replaced with a visible selection |
| Corruption | A non-string or unreadable value reads as absent |

**Eviction is the real constraint.** Browsers may clear `localStorage` under
storage pressure or with certain privacy settings, and a user clearing site data
takes it all. That is acceptable for preferences and acceptable for threads on
the web target, but it is *not* acceptable for a desktop app, where the user
installed software and expects it to remember. That is the case for moving to
an app-data file — see "What to change for desktop".

Two stores are twice the exposure: the two are evicted independently, so a
browser under pressure may take one and leave the other. They are also capped
independently, so a long run of code sessions can push a chat out of the cap
without a single chat being lost — the two lists do not compete for the same
fifty slots.

---

## Threads — two of them

`src/lib/chats.ts`, key `tavi.chats.v1`, and `src/lib/sessions.ts`, key
`tavi.code-sessions.v1`. The vocabulary they share — the turn shape, the title
rule, the timestamp format, the storage machinery — is in `src/lib/threads.ts`,
so the two cannot drift apart.

**A chat is not a code session.** They are separate objects in separate
stores, with separate shapes and separate caps:

| | Chat | Code session |
|---|---|---|
| Key | `tavi.chats.v1` | `tavi.code-sessions.v1` |
| Shape | turns, model, effort, pin | turns, model, effort, agent mode, folder, pin |
| A folder | none — there is nowhere to put one | the folder's id and its name |
| Grouped by | nothing; the list is flat | the project it was run against |
| Id prefix | `c-` | `s-` |

Both are a single JSON array in `localStorage`, capped at 50, with attachment
text captured at send time so a restored thread keeps its context.

- **Website:** fine as-is at this size. If threads grow to include full file
  contents, move to IndexedDB — the 5 MB `localStorage` ceiling would be hit
  by roughly one long thread with attachments.
- **Desktop:** same today, with the same eviction caveat. Moving to a file in
  the app-data directory is the correct end state.

**The composer's drafts are per side too**, and they are not namespaced: the
key is `prompt-draft:chat` and `prompt-draft:code`. A half-written chat is
waiting in the chat composer and a half-written session in the session
composer, and neither appears in the other.

---

## Folder handles — IndexedDB

`src/lib/fs-access.ts`, database `tavi-fs`, stores `handles` and
`recent-folders`.

`FileSystemDirectoryHandle` is structured-cloneable but **not** serialisable to
`localStorage`, so it needs IndexedDB. Metadata (the folder's id, its name and
when it was picked) lives alongside it.

**A folder's id is generated, and is not its name.** Two directories can share
a name, and a folder identified by its name is one folder to this app: the
second pick would overwrite the first's handle, and two projects would be
grouped as one. The name is kept separately, because the name is what a person
reads.

- **Website:** IndexedDB, same-origin, evicted under the same pressure as
  `localStorage`.
- **Desktop:** the desktop app does not use this path. It reads the filesystem
  through Rust (`src/lib/desktop.ts`) inside a directory the user granted.

A revoked or missing grant resolves to `null`, which clears the file list rather
than leaving stale paths on screen.

---

## Secrets — OS credential store

`src/lib/secret.ts` → `invoke("get_api_key")` → the `keyring` crate in
`src-tauri/src/lib.rs`.

The key is never written to `localStorage`, never logged, never placed in the
DOM. `server/chat.ts` logs neither headers nor request bodies.

The credential is stored under the service name `tavi`. The app was called
something else when the key was first entered, and the credential is still
under that name: it is moved to the current one the first time the app asks
for it, so the rename does not cost the user their key. The new credential is
written before the old one is removed — a key that exists in both places is
one the user has already set, and losing it would be worse than leaving a
duplicate behind.

Where the OS puts it:

| Platform | Backend |
|---|---|
| macOS | Keychain |
| Windows | Credential Manager |
| Linux | Secret Service (`libsecret`) — GNOME Keyring, KWallet |

On the **website** there is no credential store. The key comes from the
server's environment (`OPENROUTER_API_KEY`) and never reaches the browser. A
web build that needs per-user keys needs a backend session, not browser storage.

---

## Where the desktop app actually writes

Tauri resolves these through `app.path()`. The identifier is `com.mad.tavi`
(`src-tauri/tauri.conf.json`), so they are namespaced per app and a second app
with a different identifier cannot read them.

| Kind | Windows | macOS | Linux |
|---|---|---|---|
| App data (permanent) | `%APPDATA%\com.mad.tavi` | `~/Library/Application Support/com.mad.tavi` | `$XDG_DATA_HOME/com.mad.tavi`, else `~/.local/share/com.mad.tavi` |
| Cache (regenerable) | `%LOCALAPPDATA%\com.mad.tavi\cache` | `~/Library/Caches/com.mad.tavi` | `$XDG_CACHE_HOME/com.mad.tavi`, else `~/.cache/com.mad.tavi` |
| Temp (per-run) | `%TEMP%` → `…\AppData\Local\Temp` | `$TMPDIR` → `/var/folders/…` | `$TMPDIR`, else `/tmp` |

### Window state — app data

`src-tauri/src/window_state.rs` writes `window-state.json` into the app data
directory: the window's size and whether it was maximized, so the app opens as
large as it was left rather than at the size it was configured with.

It is app data and not a preference because it belongs to the installed
program rather than to the webview's profile: a window that forgets how big it
was is a window that opens at the wrong size every morning, and the state
belongs to survive the webview's storage being cleared.

The **position** is not in the file. The window always opens centred on the
screen, which is the one position that is right on every machine and every
arrangement of monitors; a remembered position is right on the machine it was
remembered on and wrong everywhere else.

The file is one small JSON object, written atomically (to a temporary file,
then moved into place), and a file that is missing, unreadable or malformed
reads as *no state* — the window then opens at its configured size, which is
the same as the first time the app is ever run. The file carries the version
of its own shape, and a file written in a shape this build does not know is
read as no state as well.

The size in the file is in **logical pixels**, so it means the same apparent
size on a 4K display at 200% as on a 1080p one at 100%. It is capped at the
work area of the screen the window opens on, so a size remembered on a large
display cannot leave the window hanging off a small one.

Rules that follow from this:

1. **Nothing the user needs goes in the cache dir.** The OS is free to delete it.
2. **Nothing permanent goes in temp.** macOS in particular may clear
   `/var/folders/…` on a schedule, and Linux clears `/tmp` on reboot on many
   distributions.
3. **Cache is keyed by content or version**, so a stale entry is replaced rather
   than needing invalidation logic.

### The webview's own storage

On the desktop target the preferences, threads and handles live in the embedded
webview's profile, not in these directories:

| Platform | Engine | Typical location |
|---|---|---|
| Windows | WebView2 | `%LOCALAPPDATA%\{identifier}\EBWebView\` |
| macOS | WKWebView | `~/Library/WebKit/com.mad.tavi/WebsiteData\` |
| Linux | WebKitGTK | `~/.local/share/webkit2/` or a per-app profile |

These paths are engine-version dependent and should not be read or written
directly — treat them as implementation detail. The practical consequences:

- They are cleared by "clear site data" in the OS, or by deleting the profile.
- They can grow without bound; there is no quota to hit but nothing prunes them
  either, so an unbounded write there is a slow leak.
- They are not portable between machines.

---

## What to change for a shipping desktop app

1. **Move threads and preferences to an app-data file**, written from Rust, so
   uninstall/reinstall is a deliberate choice rather than a side effect and
   "clear browser data" cannot silently wipe a user's work. One file with two
   collections, rather than two files, so the app-data directory does not
   become a place where half the state is and half is not.
2. **Add an export/import** for threads. Until the desktop app owns its storage,
   a user has no way to back up or move their conversations. It has to cover
   both stores, or the export is only half of somebody's work.
3. **Bound the thread stores.** The web cap is 50 threads each; the desktop
   file needs an explicit size policy instead of relying on a browser quota.
4. **Decide the upgrade story** for a schema change to the stored shape. The
   keys are versioned (`tavi.chats.v1`, `tavi.code-sessions.v1`), and the
   one-time changes that have already happened — the retired thread store, the
   model and the effort splitting per side — live in `src/lib/migrations.ts`.
   There is no general migration path yet.

None of this is needed for the web target, and none of it should block it.


