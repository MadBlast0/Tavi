# The build plan

Everything the app does not do yet, arranged as a stack: the foundation at the
bottom, the features on top of it. The layers are in dependency order, so the
plan is worked **bottom-up** — a layer is finished when its own acceptance
criteria pass, and the layer above it starts only when that one is done.

This document is the map. It says what each layer is, what it costs in
front-end and back-end work, and what it unblocks.

| | What it means |
|---|---|
| ✅ | Built and working |
| 🟡 | Partly built — say which half |
| ⬜ | Not built |

## How this sits with the other documents

| Document | What it covers |
|---|---|
| [`../architecture.md`](../architecture.md) | How the app is put together **today** |
| [`../storage.md`](../storage.md) | Where every piece of data lives, on each platform |
| [`later-on.md`](later-on.md) | What was deliberately deferred, and why |
| [`api-keys-and-parity.md`](api-keys-and-parity.md) | The API keys screen and the desktop/web parity audit |
| [`in-flight-answers.md`](in-flight-answers.md) | The design for writing an answer down while it is still being written |
| **This one** | **What to build next, bottom-up** |

## Where the ideas come from

Several of the behaviours below — several conversations visible at once, each
streaming on its own; panes inside one conversation; an OS notification when a
conversation you are not looking at finishes; an isolated copy of a repository
per conversation; a cleanup policy for that copy — are drawn from comparable
desktop coding applications.

**Every name in this document is Tavi's own description of what a thing
does.** No product name appears in a file name, a feature name, an identifier,
a comment or a string. The behaviours are the reference; the wording is ours.

Three things were taken from that research as warnings rather than as designs:

- **Do not copy the modifier-click gesture.** In the apps it was copied from,
  it regressed, and on Windows it opened a stuck popup or a separate window
  instead of a second pane. We use the context menu, which the rail already
  has on every thread row.
- **Do not publish a cap on how many conversations may be visible** unless we
  enforce one. The number people quote elsewhere was a recollection, not a
  contract.
- **Distinguish "a reply ended" from "the task is finished."** A notification
  on every turn-end overstates how much work is actually done.

---

# The stack

## Layer 0 — Storage ✅

Conversations, preferences, folder grants, the provider key index, the window
state. On the desktop these live in the app's own file, written by Rust; in a
browser they live in browser storage.

**Nothing to do.** Everything above this layer already has somewhere to put
its things.

---

## Layer 1 — The seam between the app and its two back-ends ✅

`src/lib/api.ts` is the one place the app talks to a server. It holds the
vocabulary both servers agree on, and one operation per thing the app can do,
each picking the adapter that can do it:

- `src/lib/desktop.ts` — the only file that touches `@tauri-apps/*`
- `src/lib/web.ts` — the only file that calls `fetch("/api/…")`

The operation that matters most here is `streamChat(request, onEvent, signal)`:
one call, either back-end, already taking an `AbortSignal`.

**Nothing to do.** This layer was going to be the hard part and is not.

---

## Layer 2 — A conversation runtime ⬜ ← **the next piece**

**What it is.** The lifecycle of a reply, owned by something that outlives any
component.

**Why it is the next piece.** Today the composer *is* the runtime. In
`src/blocks/prompt-input/prompt-block.tsx` — about 1,900 lines — the turns,
the status, the abort handle, the folder, the agent mode and the error are all
component state. So:

> Switch to another thread, and the composer re-renders for a different
> thread. The reply in flight is aborted and its partial text kept, marked
> stopped. The comment in the code says it plainly: *"One composer, one
> stream."*

That single rule is what stands between the app and every parallel feature.
It has to go first, because panes, notifications, per-thread badges and
restoring a running conversation all assume a reply can outlive the thing
showing it.

### Front-end work

| # | Task | Where | Notes |
|---|---|---|---|
| F1 | A store holding one entry per thread | new `src/lib/conversation.ts` | `{ status, partial, error, usage, model, startedAt }` |
| F2 | `start(threadId, request)` | same | calls `api.streamChat`, feeds the events in, registers the abort controller |
| F3 | `stop(threadId)` | same | aborts **that** thread's controller, and no other |
| F4 | A way for views to subscribe | same | a view re-renders when its own thread's state changes |
| F5 | Move `turns` and `status` out of the composer | `prompt-block.tsx` | the composer reads the store instead of owning it |
| F6 | Move `abortRef` out | `prompt-block.tsx` | one controller per thread, held by the store |
| F7 | Stop aborting when the view changes | `prompt-block.tsx`, in `loadThread` | the *"one composer, one stream"* rule goes |
| F8 | Persist the partial while it streams | `prompt-block.tsx` / `src/lib/threads.ts` | ✅ **done** — the journal, written by `src/lib/partials.ts`, so a reply is not lost if the app is closed mid-stream |
| F9 | Per-thread error and compaction | `prompt-block.tsx` | `saveError` and `compacting` are single-valued today |
| F10 | The rail's badge reads per-thread status | `sidebar-nav.tsx` | replaces the single `bridge.runningId` |
| F11 | A draft belongs to a thread | `prompt-block.tsx` | today a draft belongs to a side |
| F12 | Drop the "still here" check | `prompt-block.tsx` (`replyMayTouchComposer`) | turns belong to the thread, not to the composer |
| F13 | Drop the cross-checking `activeRef` | `prompt-block.tsx` | it exists only to stop one side's reply landing in the other |

### Back-end work

Almost none, and that is the useful finding.

| # | Task | Where | Status |
|---|---|---|---|
| B1 | Two requests at once | `src-tauri/src/provider.rs` | ✅ already works — `Cancellations` is a map of per-request flags |
| B2 | Cancel one request, leave the others | `provider.rs`, `cancel_chat` | ✅ already works |
| B3 | The abort signal reaches Rust | `src/lib/desktop.ts` | ✅ already works — a `requestId` per call, and `cancel_chat` names it |
| B4 | The website's server handles concurrent requests | `server/main.ts` | ✅ a Node HTTP server — concurrent by nature |
| B5 | Two conversations finishing at once | `src-tauri/src/threads.rs` | ✅ the lock covers the read **and** the write, so the file cannot be half-written |
| B6 | Write the partial to disk during a stream | `src-tauri/src/partials.rs` | ✅ **done** — a journal per conversation, appended to, so a crash mid-stream does not lose the answer. Designed and built in [`in-flight-answers.md`](in-flight-answers.md) |
| B7 | The notification plugin | `src-tauri/Cargo.toml` | ⬜ **new** — there is no notification plugin at all |

**So: about 95% of the conversation runtime is front-end work.** The back-end
was already built for this and has simply never been asked to do it.

### Done when

- ✅ **Closing the app mid-stream keeps the partial text.** *B6 — done.* The
  answer is written to a journal as it arrives, and a cut-off answer is put
  back into its conversation on the next launch, marked as one that did not
  finish, and the model is told so on the next turn.
- ⬜ A reply keeps streaming after you switch to another thread or another side.
- ⬜ Two threads can stream at the same time.
- ⬜ Stopping one thread leaves the others running.
- ⬜ The rail shows which thread is running, per thread.

**What is left of Layer 2 is the runtime itself** — the thirteen front-end
tasks above, `F1` to `F13`. The journal was written by the composer, because
that is what holds the stream today; when the runtime arrives it becomes the
writer and the composer becomes a reader, which is a change of one call site
and nothing else.

---

## Layer 3 — A view, not a thread ⬜

**What it is.** A *view* is a conversation as the user sees it: the thread, the
side it belongs to, its runtime state, and which pane holds it.

**Why.** The thread bridge has exactly one `activeId`. With several
conversations open at once there must be a set of views with one focused.
The three verbs are `open`, `close` and `focus`.

| | Task | Where |
|---|---|---|
| ⬜ | The bridge holds a set of views, not one active id | `src/blocks/prompt-input/thread-bridge.tsx` |
| ⬜ | `open`, `close`, `focus` | same |
| ⬜ | The composer becomes one view among several | `prompt-block.tsx` |
| ⬜ | The tray's "New chat" and "New session" still work | `thread-bridge.tsx` |

**Done when** two conversations can be open at once and either can be brought
to the front.

---

## Layer 4 — The work area becomes a layout ⬜

**What it is.** The work area stops being one child and becomes a group of
resizable tiles, one per view.

`src/App.tsx` renders `<Shell><PromptBlock /></Shell>`, and `WorkArea` in
`src/blocks/shell/shell.tsx` renders `{children}`. One child, one thread.

`src/components/resizable/` — built on `react-resizable-panels` — is
**vendored and imported by nothing**. The raw material is already on disk.

| | Task | Where |
|---|---|---|
| ⬜ | The work area renders a panel group | `shell.tsx` |
| ⬜ | One tile per view | new |
| ⬜ | A tile is a conversation, with its own composer | `prompt-block.tsx` |
| ⬜ | Close a tile | new |
| ⬜ | Move focus between tiles | new |
| ⬜ | The rounded corner and the panel edge still read as one shape | `shell.tsx` |

**Done when** two conversations are visible at once, side by side, each
streaming on its own.

---

## Layer 5 — The rail becomes a list of views ⬜

| | Task | Where | Notes |
|---|---|---|---|
| ⬜ | The rail shows which conversations are open | `sidebar-nav.tsx` | |
| ⬜ | Per-side row order and a hidden set | `sidebar-nav.tsx`, `src/lib/prefs.ts` | this is the disabled **Customize** row |
| ⬜ | The **Customize** row becomes live | `sidebar-nav.tsx` | |
| ⬜ | A context-menu route to open a conversation beside the current one | `thread-context-menu.tsx` | the gesture the research says to prefer |

**Done when** the rail's own layout can be arranged per side, and a
conversation can be opened beside the current one from the rail.

---

## Layer 6 — Saying that something finished ⬜

| | Task | Where | Side |
|---|---|---|---|
| ⬜ | A notification when an unfocused conversation finishes | `src-tauri/Cargo.toml`, a Rust command | back-end |
| ⬜ | The notification says which conversation, and that a reply **ended** | new | front-end |
| ⬜ | A setting for when to be told | `src/blocks/shell/settings-*.tsx` | front-end |

**Done when** a conversation finishes while you are looking at another one, and
you are told once.

---

## Layer 7 — The workspace, and Git ⬜

The folder grants are done ✅ — a canonical path the user chose, and the
model cannot name a path. What is missing is everything that *changes* a
repository.

| | Task | Side | Notes |
|---|---|---|---|
| ⬜ | **Status** — clean or dirty, current branch, ahead or behind | Code | the cheapest and most useful of these |
| ⬜ | **Pull** | Code | needs an authenticated fetch, same as clone |
| ⬜ | **Switch or create a branch** | Code | |
| ⬜ | **Commit** | Code | needs a message editor and `user.name` / `user.email` identity configuration |
| ⬜ | **Push** | Code | needs credentials the app should never store |
| ⬜ | **Private repositories** | Code | SSH works only if the host was configured outside the app; there is no token flow |
| ⬜ | **An isolated copy of the repository per conversation** | Code | allocate by name, **never reuse an idle directory** |
| ⬜ | **The cleanup policy for that copy** | Code | clean and unnamed → remove it and its branch; named or dirty → ask first; never fall back to a destructive delete |
| ⬜ | **A settings control for the projects folder** | Code | the location is currently resolved in one place |
| ⬜ | **The write path** | Code | **deliberately not built** — see below |

**The write path is the gate.** The app reads a folder and talks about a
change; it does not write. An isolated copy of a repository exists to isolate
*writes*, so building one before the write path would be infrastructure for a
feature that is not there.

---

# The full checklist

## Both sides — Chat and Code

| | Item | Layer |
|---|---|---|
| ⬜ | **The command palette** — Ctrl/Cmd+K, listing the active side's conversations and the app's commands | 5 |
| ⬜ | **Search over conversations** — up to 50 per side | 5 |
| ⬜ | **Archive** — needs a second list and a way back out of it | 5 |
| ⬜ | **Restore the last open conversation per side** after a reload | 3 |
| ⬜ | **Artifacts** — what a conversation produced | — |
| ⬜ | **Scheduled** — things that run on their own | — |
| ⬜ | **Routines** | — |
| 🟡 | **The completion signal** — the rail pulses a dot and says "Running" today; it becomes per-conversation at Layer 2 | 2, 6 |
| 🟡 | **Non-text attachments** — images and video are accepted and shown, but only text is inlined | — |
| ⬜ | **A side conversation** — a small secondary conversation beside the main one | 4 |
| ⬜ | **The application menu** — 57 of 61 rows are inert | — |
| ⬜ | **The settings sections** — 3 of 16 built (General, Privacy, API keys) | — |
| ⬜ | **Dictation in the desktop app** — the speech API has no route in the webview; needs a local transcription back-end | — |
| 🟡 | **A third-party product name in the settings nav** — one row; being renamed to "CLI providers" | — |

## Chat only

| | Item | Notes |
|---|---|---|
| ⬜ | **Tools in a chat** | A chat carries no tools at all; the server refuses a request that carries any |
| ⬜ | **The "Projects" row under Chat** | **A decision, not a task** — it contradicts the settled rule that a chat is workspace-free |
| 🟡 | **Vision and audio models** | Listed in the catalogue, not usable end to end |

## Code only

| | Item |
|---|---|
| ⬜ | **A diff pane** |
| ⬜ | **A terminal pane** |
| ⬜ | **A file pane** |
| ⬜ | **A browser pane** |
| ⬜ | **Git status, pull, branch, commit, push** |
| ⬜ | **Private repositories** |
| ⬜ | **An isolated copy of the repository per conversation, and its cleanup policy** |
| ⬜ | **The write path** — deliberately out of scope |

## Deliberately not planned

Recorded so they are not lost, and not because they are easy:

| | Item | Why |
|---|---|---|
| ⬜ | **Shell commands** | Not built, not planned, and not in the model's hands |
| ⬜ | **A hosted API** | There are no accounts |

---

# The raw materials

Twenty-five vendored components are **imported by nothing**. They map onto the
list above almost one to one.

| Component | For |
|---|---|
| `command/` | The palette, and search |
| `resizable/` | The work area as a layout |
| `tabs/` | The panes inside one conversation |
| `tree/` | The file pane |
| `data-table/` | The projects list, the Git status list |
| `toast/` | Transient messages |
| `sheet/`, `drawer/` | A side conversation |
| `textarea/` | The commit message editor |
| `dialog/`, `alert-dialog/` | Confirmations — deleting a repository copy, removing a folder |
| `skeleton/`, `spinner/`, `progress/` | Loading states |
| `navigation-menu/` | The settings card's own navigation |
| `accordion/`, `collapsible/` | Grouped panels |
| `carousel/`, `chart/`, `questionnaire/`, `date-picker/`, `input-otp/`, `marker/`, `slider/`, `video-player/`, `radio-group/`, `native-select/`, `hover-card/`, `breadcrumb/`, `button-group/`, `menubar/`, `pagination/` | No use yet |

---

# Decisions to settle before building

Two of them are decisions rather than tasks, and building past them would
build the wrong thing:

1. **Does Chat get projects at all?** The rail offers a **Projects** row under
   Chat, but a settled decision says a chat is workspace-free — no folder, no
   tools, and the server refuses a request carrying either. Either the row
   goes, or the decision is revisited.
2. **Is an isolated repository copy in scope before the write path?** It
   isolates writes. The app cannot write yet.

And one that is not a decision but a constraint worth writing down:

3. **The work area's floor.** The window's floor is 600 × 338 logical pixels.
   Two conversations side by side inside that is 300 pixels each. The rail
   takes another 200. Whatever the layout turns out to be, it has to be
   usable at the floor and not only on a large display.

---

# The build order

1. **Layer 2** — the conversation runtime. Everything parallel depends on it,
   and it is the only item that changes the architecture rather than adding a
   screen.
2. **Layer 3** — views.
3. **Layer 4** — the work area as a layout. Several conversations become
   visible.
4. **Layer 6** — saying that something finished.
5. **Layer 7** — Git status, then branch, then commit, then the write path,
   then the isolated copies.
6. **The palette** — it needs nothing from Layers 3 and 4, and it would make a
   rail of fifty conversations usable immediately.
7. Everything else.

Layers 2 and 3 are one piece of work in practice: a runtime with no views
holding more than one conversation has nothing to show for itself.
