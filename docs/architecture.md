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

## 6. The journal of answers in flight

An answer exists in memory until it ends. Without more than that, a crash in
the middle of writing one loses all of it, because the conversation file is
written when the answer ends and not before.

**So an answer in flight is written down as it grows**, in a journal of its
own: `partials/<conversation-id>.jsonl`, one file per conversation, beside
the conversation file.

| The decision | Why |
|---|---|
| **One file per conversation, not one file for all of them** | Two answers being written at once must not be able to overwrite each other. A shared file would have to be rewritten whole, and a rewrite from the frontend's memory loses the other answer's newer turns. |
| **Appended to, never rewritten** | A write adds a line, so a write is cheap enough to do often, and a crash can lose only the last line rather than the whole answer. |
| **Every line carries the whole of the answer** | A line the crash cut in half is then discarded, and the line before it still has the answer. A journal of only the new text would lose the piece the half-written line was carrying. |
| **The last line is the complete one** | The reader takes the last whole line, and it is the whole answer. A journal whose last line does not say the answer ended is one that was cut off. |
| **The journal is separate from the conversation file** | The conversation file holds conversations; a journal holds an answer that has not become one yet. They have different lifetimes, and the conversation file's own boundary — one file for both collections — is not disturbed by it. |
| **The journal is removed only once the answer is in the conversation** | A conversation write can fail, and a journal left behind is the answer, recovered on the next launch. A journal is also kept when the conversations could not be read at all: a store that cannot be read is a temporary thing, and the answer is worth more than the tidiness of having swept it away. |

**The behaviour it matches.** A comparable desktop coding application writes
its sessions as JSON Lines — one file per session, appended to, with the
lines of one assistant message sharing an id, the early ones partial and the
last one complete — and marks an interrupted tool call as cut off and tells
the model so. That is the shape here. The field names are this app's, and
the conversations themselves are still one file, which is B6.

**What it does not change.** The journal is written by the composer today,
because that is what holds the reply. When the conversation runtime arrives
it becomes the writer, and the composer becomes a reader.

---

## 7. The conversation runtime

A reply belongs to a conversation, and a conversation outlives any component.

**Why it is here.** The composer used to *be* the runtime: the turns, the
status, the abort handle and the error were all component state, so a reply
could only exist while the component that started it was mounted and showing
the same conversation. Switching threads aborted it. The comment in the code
said it plainly — *"One composer, one stream."* — and that one rule was what
stood between the app and every parallel feature.

**What it owns.** `src/lib/conversation.ts` holds a conversation's live
turns, its status, its usage, its error and whether it is being compacted;
it holds one abort handle per conversation; and it owns the reply's whole
life — the stream, the events, the journal, the conversation the answer lands
in, and the announcement.

**What it does not own.** *What is asked.* The request is prepared by the
composer, because preparing it needs the folder's files and the model's own
capabilities, and those are the viewer's facts.

**The composer reads a conversation rather than owning one.** It subscribes
to the conversation it is showing and to nothing else, because the text
arrives many times a second and a rail of fifty rows has no business
redrawing for it. The rail listens to the *status* instead, and to every
conversation's status rather than to one.

| | Before | After |
|---|---|---|
| A reply in another conversation | aborted | keeps running |
| Two conversations | one could answer | both can |
| Stopping | stopped the one | stops the one, and only the one |
| The rail's running dot | one id, for the composer | per conversation |
| A half-written message | followed the reader to the next conversation | stays in the conversation it was written in |
| A draft | belonged to the side | belongs to the conversation |
| The "may this touch the composer" check | there | gone — a reply belongs to a conversation, so the question does not arise |

**The turn vocabulary moved with it.** `src/lib/turns.ts` holds the live
shape of a turn, the stored shape, and the conversions between them, because
the runtime needs them as much as the composer does.

**Two rules that were found by running the app, and are worth writing
down.** A conversation that is answering keeps the turns it has: the answer
being written is not in the store yet, so loading the stored turns over the
top would throw it away — and the conversation would then be written back
without it. And a half-sent message says which conversation it belongs to,
because a message that was only "the last one sent" follows the reader into
the next conversation.

---

## 8. Saying that something finished

A reply that is being written is on screen, and the reader reads it as it
arrives. The moment the app is not in front, the answer is happening
somewhere the reader cannot see, and the only way they find out is by coming
back and looking.

**So the app says so, in three places, and each of them is a different fact.**

| | What it is |
|---|---|
| **The operating system's toast** | An interruption. The reader is elsewhere and the app cannot reach them, so the operating system is asked to. |
| **The card inside the app** | The same interruption, for when the reader *is* in the app — and the one that can be acted on, because the plugin's action API is mobile-only and a system's toast cannot open a conversation. |
| **The conversation's own mark** | A record, not an interruption. A conversation whose reply finished while the reader was elsewhere says so in the rail, until it is opened. |

**Where the reader is decides where the announcement goes.** The app is in
the background, and the operating system is the only thing that can reach
out of the app; the app is in the front, and the app itself is the thing in
front of the reader. One rule, two destinations, and no announcement that
arrives twice.

**The rule is written once**, as *"is this conversation the one being looked
at?"*, and it is answered by the thing that owns the conversation. The
composer answers it today. When the conversation runtime arrives it answers
the same question the same way, and the rule does not change.

**What the answer is.** An announcement is made when all of these are true:
the reader has asked to be told, the conversation is not muted, and the answer
was somewhere the reader could not see — unless they asked to be told either
way. "Somewhere they could not see" is two facts and not one: the app has to
be in the front, *and* the conversation has to be the one on screen. A
conversation the composer is showing is not visible while the app is behind
another window.

**What it says.** The title is the conversation's name, not the app's — a
toast that says only "a reply finished" tells the reader nothing when there
is more than one conversation, and the whole point is knowing which one to
come back to. The body is the first line of the answer, or "A reply
finished." when the preview is off. It never says the task is finished: the
app knows when the provider stopped sending text, and it knows nothing else,
because a chat cannot write files and a model cannot run commands.

**A reply that was stopped is not announced.** The reader pressed the button;
they know.

**A conversation can be muted**, from its own menu, beside **Pin**. A muted
conversation still runs, and its reply still lands in it — the reader simply
does not want to be interrupted about it, which is a different thing from not
wanting the answer. It is not marked either: the mark says "New" beside the
conversation's name, and a reader who muted it has said they do not want to
be nudged about it.

**The settings** are in Settings → General → Notifications: whether to be
told, whether to be told even when the answer is on screen, and whether the
first line of the answer is shown. The permission is asked for when the
first is turned on and not before — a permission asked for before the reader
knows what it is for is a permission asked for before the question — and a
refusal puts the setting back off. A fourth row sends a test notification,
because a notification is raised by the operating system and the operating
system may decline: on Windows only an *installed* app may raise one.

**What it cannot do.** The system's toast cannot open the conversation — the
plugin's action API is mobile-only — and the card inside the app can. A
browser tab that is closed gets no notification at all: the browser's
notification API is the tab's own, and a notification that outlived the tab
would need a push service and a service worker. And a conversation that
finished while the reader was elsewhere is recorded on the conversation
itself rather than in a history, because a second list of what the app has
announced would be a second place for a conversation to be.

---

## 9. Git

A repository is a folder the reader has given the app, and git is the thing
that knows what is in it.

**The app runs git itself**, with an argument array and no shell, so a branch
name or a commit message reaches git as data and never as a command line. The
model cannot run git: it cannot choose an argument, and it cannot name a path
the app has not been given.

**The app never stores credentials.** The prompt is turned off, so git never
waits for a password on a terminal the app does not have — it fails instead,
and the failure is reported. A push works with whatever the machine already
has.

**The app does not write the reader's git configuration.** An identity, if
there is one, is passed to git with `-c` for that one commit.

**The front end names the grant, not the path.** The grant is the permission
and the path is what the permission resolves to, and the app's own half has no
business carrying a path around.

**The status is read from git's machine-readable form**, one call, and the
lines are read by field count because a path may contain spaces and the
fields before it never do.

**Git is a desktop thing.** A browser cannot run a program on the machine, so
every call in the website refuses and says why.

The whole of it, and where it came from, is in
[`plan/git.md`](plan/git.md).

---

## 10. What is deliberately not being built

- **Writing files.** B3. The app reads a folder and talks about it.
- **Shell commands.** Not built, not planned, and not in the model's hands.
- **A hosted API.** There are no accounts.
- **Several provider connections.** OpenRouter only, for now; the other adapters stay in the web path.
- **A database.** B6.
- **The assistant-ui surface.** `src/assistant.tsx`, `src/components/thread.aui.tsx` and the toolkit beside it are not mounted. They are the second chat path, kept for the toolkit and its native tools, and the app does not take them.
