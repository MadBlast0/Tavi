# Architecture

Where Tavi's parts are, what each one is responsible for, and what has been
changed. This is the map the implementation plan asked for: current behaviour,
intended behaviour, and the gaps between them, kept apart. It began as the map
for the brief the durable storage, the workspace grants and the Rust provider
path were built from; that brief is gone, and this is what it left behind,
together with [`storage.md`](storage.md) for where the data lives and
[`plan/later-on.md`](plan/later-on.md) for what is still deferred.

---

## 1. The shape of the app

```
┌──────────────────────────────────────────────────────────────┐
│ Webview (React 19)                                          │
│                                                              │
│  src/App.tsx                                                │
│    └─ PromptBlock            src/blocks/prompt-input/       │
│         └─ the whole app surface                            │
│    └─ Shell                  src/blocks/shell/              │
│         └─ the rail, the title bar, the tray bridge         │
│                                                              │
│  Storage: the app's own file (desktop) or localStorage (web) │
│           + IndexedDB (folder handles)                      │
└───────────────┬──────────────────────────────┬───────────────┘
                │ Tauri IPC                    │ HTTP /api/*
                ▼                              ▼
┌───────────────────────────────┐  ┌──────────────────────────┐
│ Rust (src-tauri)              │  │ Node server              │
│  · the provider request       │  │  server/main.ts          │
│  · the conversations file     │  │  · system prompt         │
│  · the workspace grants       │  │  · model catalogue       │
│  · git, for the clones        │  │  · clone                 │
│  · the OS credential store    │  └────────────┬─────────────┘
│  · window state, tray, fonts  │               │ HTTPS
└───────────────────────────────┘               ▼
                                        OpenRouter
```

**The app is one surface.** `src/App.tsx` renders `PromptBlock` directly. The
assistant-ui scaffolding next to it — `src/assistant.tsx`,
`src/components/thread.aui.tsx`, `src/toolkit.tsx`,
`src/components/AssistantSurface.tsx` — is **not mounted**: nothing imports
`AssistantSurface`. It is a second chat path that the live app does not take.

**There is one live chat request.** `src/blocks/prompt-input/prompt-block.tsx`
posts to the server with `fetch` and reads the reply itself: a stream of
`data:` lines carrying `text-delta`, `message-metadata`, `finish` and `error`
events. It does not use the AI SDK's message-stream protocol, and it sends no
tools. `src/lib/api.ts` chooses between the two servers — the Node one for the
website, the Rust one for the desktop — and the composer does not know which.

**The folder is a grant, and which kind depends on the target.** On the
website, a folder is a **browser grant**: the File System Access API's handle,
kept in IndexedDB, and the browser enforces it. On the desktop, a folder is a
**Rust grant**: a canonical path the user chose, kept in the app's own file,
and the native tools are confined to it. `src/lib/workspace.ts` is the one
place that knows the difference, and the rules about which files are worth
walking for live in `src/lib/file-rules.ts` and are read by both, so the model
is shown the same files on each.

**The native tools are bounded by a grant.** The Rust file commands take a
workspace and a path inside it. A path the model names is not a permission, so
there is no default root and no fallback to the home directory.

---

## 2. The storage layer

| Data | Where | Key |
|---|---|---|
| Chats | the app's own file on the desktop, `localStorage` on the web | `tavi.chats.v1` / `threads.json` |
| Code sessions | the same file, the same way | `tavi.code-sessions.v1` / `threads.json` |
| Preferences (model, effort per side; mode per folder) | `localStorage` | `tavi.model.<side>`, `tavi.effort.<side>`, `tavi.mode.<folderId>` |
| Composer drafts | `localStorage` | `prompt-draft:<side>` (not namespaced) |
| Folder handles | IndexedDB `tavi-fs` | stores `handles`, `recent-folders` |
| Workspace grants | the app's own file | `workspaces.json` |
| API key | OS credential store | service `tavi`, user `api-key:<provider>`. A development build also reads `.env.local` |
| Window geometry | app-data file | `window-state.json` |

`src/lib/threads.ts` holds the vocabulary both thread stores share and the
factory that builds them, so a chat and a code session cannot drift apart.
Each store is capped at 50 records.

`src/lib/thread-repository.ts` is where the two stores meet the world: the
browser's storage on the website, and the app's own file on the desktop. The
conversations that were in the webview's storage are brought across the first
time the app runs on the desktop, and the old copy is only removed once the
durable one has been read back.

**What this means on the desktop:** the conversations are in the app's data
directory, written by Rust, with the previous file kept beside it. Clearing
site data, or a browser under pressure, cannot take them.

---

## 3. The boundaries, settled

These are the decisions the plan's Step 2 asks to be settled before
implementing. Two of them are the owner's; the rest follow from the plan's own
proposals or from what the code already does.

| | Decision | Why |
|---|---|---|
| B1 | **A chat is workspace-free.** A chat has no folder, no tools, and the server refuses a request that carries either. | Already the rule in `server/system.ts` and `server/main.ts`. The plan keeps it. |
| B2 | **A code session may exist without a folder.** It is grouped under "No folder". | The plan requires it, and the store already carries the case. |
| B3 | **File writing is out of scope.** The app reads; it does not write. | The owner's decision, answering the plan's Step 4. The authorization gap is closed first; a write path is a separate, security-reviewed piece of work. |
| B4 | **On the desktop, Rust owns the provider call.** The key is read from the OS credential store, used in Rust, and never enters JavaScript. There is no local port and no local endpoint on the desktop. | The owner's decision, answering the plan's Step 7. It removes the unauthenticated route and the key-in-JavaScript problem in one move. |
| B5 | **The website keeps the Node server.** It is the web target's backend and the only thing that speaks the AI SDK. | The web target has no Rust and no credential store. |
| B6 | **Desktop conversations live in one app-data file, written by Rust**, with two collections in it: chats and sessions. Atomic replace, a `.bak` beside it, and a schema version. | The plan's own proposal (Appendix A, "What to change for a shipping desktop app"). A database would be a new dependency for a list of at most a hundred records. |
| B7 | **Nothing is deleted automatically.** The cap is 50 per side. Deleting is the user's, and it is a button. | The plan asks for a retention policy; the safe default is that only the user deletes. |
| B8 | **Export and import are both in.** JSON, covering both sides. | The plan lists export/import as needed once the app owns its storage. |
| B9 | **The clone destination is visible and configurable**, defaulting to the projects folder. A clone never overwrites. | The plan's Step 5, and what the current code already half-does. |
| B10 | **The system prompt is written in one place and read by both paths.** The Rust and Node implementations read the same instructions, so the two cannot say different things to the model. | The plan's "server-authored system prompts" rule, applied to two implementations. |

---

## 4. The gaps

| | Gap | What is happening | Fixed by |
|---|---|---|---|
| G1 | ~~**Desktop conversations are not durable.**~~ | They lived in the webview's `localStorage`. Clearing site data, or eviction, took them. | **Stage 2** — one app-data file, written by Rust, with the old copy brought across once and only removed once the new one has been read back. |
| G2 | ~~**The Rust file commands default to the whole home directory.**~~ | `AI_APP_FS_ROOT` was unset, so `fs_root()` fell back to `$HOME`. There was no per-workspace grant. | **Stage 3** — a grant is a canonical path the user chose; there is no default root, and the commands refuse without one. |
| G3 | ~~**The packaged desktop app cannot chat.**~~ | The Tauri bundle loads a static Vite build; the Node server was a development process. | **Stage 4** — Rust makes the provider request. There is no server behind the desktop app at all. |
| G4 | ~~**The provider key reaches JavaScript.**~~ | `get_api_key` returned the key to the webview, which sent it as a bearer header to the loopback server. | **Stage 4** — the key is read in Rust, used there, and there is no command that hands it out. |
| G5 | ~~**The chat route is unauthenticated and binds every interface.**~~ | `server.listen(PORT)` with no host and no secret. | **Stage 4** for the desktop — the route does not exist there. The website's server still has no accounts, so it is a website's own problem; see `docs/plan/later-on.md`. |
| G6 | ~~**The clone flow is minimal.**~~ | A URL, a fixed destination, no progress, no cancel, no retry, and a half-finished clone left on disk. | **Stage 5** — the destination is confirmed, progress is reported, a clone can be stopped, and a failure cleans up after itself. |
| G7 | ~~**The model id is never checked against the catalogue.**~~ | Whatever string arrived was sent to the provider and failed there. | **Stage 4** — the effort is checked against what the model publishes, and a level that cannot be verified is refused. |
| G8 | **A TypeScript file could not be read.** The browser reports `.ts` as `video/mp2t`, so every `@` mention of a TypeScript file said it could not be read. | Whether a file is text is now decided by its bytes, on both targets. |
| G9 | **A folder that had moved was silently empty.** | A project whose files could not be reached looked like a project with no files. | A grant reports that its folder has moved, and the picker offers to relink it — keeping its id, so the sessions stay attached. |

---

## 5. The stages

Each stage left the app working, and each is a commit.

| Stage | What it did | Closes |
|---|---|---|
| 1 | This map, and the boundaries above. | — |
| 2 | **Durable desktop storage.** Rust owns an app-data file of threads; the frontend talks to a repository instead of to `localStorage`; the existing `localStorage` threads are imported once and only removed after the durable write is verified. | G1 |
| 3 | **Workspace grants.** Rust keeps a grant store; the file commands require a grant and fail closed without one; the grant is what a folder *is* for the native tools. | G2 |
| 4 | **Rust owns the provider call.** The model catalogue, the system prompt, the chat request and the stream all moved into Rust for the desktop. The key never enters JavaScript. The catalogue is read by the same code on both targets. | G3, G4, G5, G7 |
| 5 | **A proper clone flow.** The destination is shown and confirmed, progress is reported, a clone can be cancelled, a failure cleans up after itself, and it runs in Rust on the desktop. | G6 |
| 6 | **The UI that goes with it.** Storage and privacy settings: where the data is, what leaves the machine, export, import, and delete. The provider key can be set from the settings. | — |
| 7 | **The tests and the docs.** | — |
| 8 | **The audit.** Unused exports, unimported files, and the three pieces of the work that were not connected to anything: the grants, the toolkit's workspace binding, and a conversation that could not be saved. Then the two bugs the audit turned up: a TypeScript file that could not be read, and a folder that had moved being silently empty. | G8, G9 |

---

## 6. What is deliberately not being built

- **Writing files.** B3. The app reads a folder and talks about it.
- **Shell commands.** Not built, not planned, and not in the model's hands.
- **A hosted API.** There are no accounts.
- **Several provider connections.** OpenRouter only, for now; the other adapters stay in the web path.
- **A database.** B6.
- **The assistant-ui surface.** `src/assistant.tsx`, `src/components/thread.aui.tsx` and the toolkit beside it are not mounted. They are the second chat path, kept for the toolkit and its native tools, and the app does not take them.
