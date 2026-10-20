# Architecture

Where Tavi's parts are, what each one is responsible for, and what is being
changed. This is the map the implementation plan in
`docs/tavi-implementation-prompt.md` asks for: current behaviour, intended
behaviour, and the gaps between them, kept apart.

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
│  Storage: localStorage (threads, prefs) + IndexedDB         │
│           (folder handles)                                   │
└───────────────┬──────────────────────────────┬───────────────┘
                │ Tauri IPC                    │ HTTP /api/*
                ▼                              ▼
┌───────────────────────────────┐  ┌──────────────────────────┐
│ Rust (src-tauri)              │  │ Node chat server         │
│  · window state, tray         │  │  server/chat.ts          │
│  · OS credential store        │  │  · system prompt         │
│  · fonts                     │  │  · model catalogue       │
│  · file reads (tools)        │  │  · clone                 │
└───────────────────────────────┘  └────────────┬─────────────┘
                                               │ HTTPS
                                               ▼
                                        OpenRouter
```

**The app is one surface.** `src/App.tsx` renders `PromptBlock` directly. The
assistant-ui scaffolding next to it — `src/assistant.tsx`,
`src/components/thread.aui.tsx`, `src/toolkit.tsx`,
`src/components/AssistantSurface.tsx` — is **not mounted**: nothing imports
`AssistantSurface`. It is a second chat path that the live app does not take.

**There is one live chat request.** `src/blocks/prompt-input/prompt-block.tsx`
posts to `/api/chat` with `fetch` and reads the reply itself: a stream of
`data:` lines carrying `text-delta`, `message-metadata`, `finish` and `error`
events. It does not use the AI SDK's message-stream protocol, and it sends no
tools.

**The folder is a browser grant.** `src/lib/fs-access.ts` uses the File System
Access API and keeps directory handles in IndexedDB (`tavi-fs`). This is how
folders are picked and read, on the website and in the Tauri webview alike,
because WebView2 exposes the same API.

**The Rust file commands are not on the live path.** `list_directory` and
`read_text_file` are called only by `src/toolkit.tsx`, which is dead code. The
running app reads a folder through the browser handle.

---

## 2. The storage layer

| Data | Where | Key |
|---|---|---|
| Chats | `localStorage` | `tavi.chats.v1` |
| Code sessions | `localStorage` | `tavi.code-sessions.v1` |
| Preferences (model, effort per side; mode per folder) | `localStorage` | `tavi.model.<side>`, `tavi.effort.<side>`, `tavi.mode.<folderId>` |
| Composer drafts | `localStorage` | `prompt-draft:<side>` (not namespaced) |
| Folder handles | IndexedDB `tavi-fs` | stores `handles`, `recent-folders` |
| API key | OS credential store | service `tavi`, user `openrouter-api-key` |
| Window geometry | app-data file | `window-state.json` |

`src/lib/threads.ts` holds the vocabulary both thread stores share and the
factory that builds them, so a chat and a code session cannot drift apart.
Each store is capped at 50 records; a write that fails on quota is retried with
the newest 5.

**What this means on the desktop:** the conversations are in the *webview's*
storage, not in the app's data directory. Clearing site data, or a browser
under pressure, takes them. That is the first gap below.

---

## 3. The boundaries, settled

These are the decisions the plan's Step 2 asks to be settled before
implementing. Two of them are the owner's; the rest follow from the plan's own
proposals or from what the code already does.

| | Decision | Why |
|---|---|---|
| B1 | **A chat is workspace-free.** A chat has no folder, no tools, and the server refuses a request that carries either. | Already the rule in `server/system.ts` and `server/chat.ts`. The plan keeps it. |
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
| G1 | **Desktop conversations are not durable.** | They live in the webview's `localStorage`. Clearing site data, or eviction, takes them. The app-data directory does not contain the conversations. | Stage 2 |
| G2 | **The Rust file commands default to the whole home directory.** | `AI_APP_FS_ROOT` is unset, so `fs_root()` falls back to `$HOME`. There is no per-workspace grant. | Stage 3 |
| G3 | **The packaged desktop app cannot chat.** | The Tauri bundle loads a static Vite build; the chat server is a development process. | Stage 4 |
| G4 | **The provider key reaches JavaScript.** | `get_api_key` returns the key to the webview, which sends it as a bearer header to the loopback server. | Stage 4 |
| G5 | **The chat route is unauthenticated and binds every interface.** | `server.listen(PORT)` with no host, no secret. Another machine on the network can post to it. | Stage 4 (desktop: the route does not exist) and Stage 5 (web: loopback by default) |
| G6 | **The clone flow is minimal.** | A URL, a fixed destination, no progress, no cancel, no retry, and a half-finished clone is left on disk. | Stage 5 |
| G7 | **The model id is never checked against the catalogue.** | Whatever string arrives is sent to the provider and fails there. | Stage 4 |

---

## 5. The stages

Each stage leaves the app working, and each is a commit.

| Stage | What it does | Closes |
|---|---|---|
| 1 | This map, and the boundaries above. | — |
| 2 | **Durable desktop storage.** Rust owns an app-data file of threads; the frontend talks to a repository instead of to `localStorage`; the existing `localStorage` threads are imported once and only removed after the durable write is verified. | G1 |
| 3 | **Workspace grants.** Rust keeps a grant store; the file commands require a grant and fail closed without one; the grant is what a folder *is* on the desktop. | G2 |
| 4 | **Rust owns the provider call.** The model catalogue, the system prompt, the chat request and the stream all move into Rust for the desktop. The key never enters JavaScript. The web server is hardened. | G3, G4, G5, G7 |
| 5 | **A professional clone flow.** The destination is shown and editable, progress is reported, a clone can be cancelled, a failure cleans up after itself, and the result can be attached as a grant. | G6 |
| 6 | **The UI that goes with it.** Storage and privacy settings, export and import, the no-workspace empty state, and honest error and cancel states. | — |
| 7 | **The tests, the docs, and the README.** | — |

---

## 6. What is deliberately not being built

- **Writing files.** B3. The app reads a folder and talks about it.
- **Shell commands.** Not built, not planned, and not in the model`'s hands.
- **A hosted API.** There are no accounts.
- **Several provider connections.** OpenRouter only, for now; the other adapters stay in the web path.
- **A database.** B6.
