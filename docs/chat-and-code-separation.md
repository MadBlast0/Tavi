# Separating Chat from Code

**Status:** plan. Nothing in it is built yet.
**Decided by:** the maintainer, 2026-10-20. The decisions are recorded in §6 and are
not to be reopened without saying so here first.
**Why this document exists:** the app has a Chat surface and a Code surface, and
they are two views of one thing. This is the plan to make them two things.

---

## 1. The rule

> **A chat is not a code session. They are two surfaces that share a window, a
> component library and a model connection — and nothing else.**

The rail, the composer and the request are all shared *chrome*. The **data** is
not shared: a chat is a chat, a session is a session, and neither can appear in
the other's list.

This rule is not new. It was written down before the app was built, in
`docs/mock/shell-layout.html`, and the app drifted away from it:

| Mock | Verbatim | Where the app went |
|---|---|---|
| `:263` | "Chat and Code are two products sharing one window, so the rail is **two rails**. Every row, every session and the account row belong to the mode that is selected — the sets are separate objects, not one list filtered by mode." | One list. |
| `:299` | "Chat and Code keep their own row order, their own hidden set and their own sessions. **One shared list would make them two views of the same thing, which is exactly what they are not.**" | One list. |
| `:1303` | "Chat and Code each keep their own open conversation. **A Chat is not a Code session, so opening one must not close the other, and New in one mode must not reset the other.**" | One conversation. |
| `:1146` | "The list is the current mode's sessions, so the palette cannot offer a Chat thread while Code is selected." | Not built yet. |

The mock's own state shape is the target, and this plan adopts it:

```js
activeByMode  { chat: null, code: null }   // each side keeps its open thread
navByMode     { chat: {...},   code: {...} } // each side keeps its back/forward history
turnsByMode   { chat: [],       code: [] }   // each side keeps what was said
runningByMode { chat: false,    code: false }// each side keeps its streaming state
rail          { chat: {...},    code: {...} } // each side keeps its row order and hidden set
```

---

## 2. The reference: Claude Desktop

Claude Desktop is the reference because it solved this problem, in public, with
the same three pieces we have: a chat surface, a code surface, and one window.

### 2.1 What Claude does

| Behaviour | Claude Desktop | Where we are |
|---|---|---|
| Chat vs Code are separate places | Two top-level tabs: **Chat** (conversations) and **Code** (software work). The sidebar contents change with the tab. | An `IconSwitch` in the rail header. The rail contents change with it, but the list does not. |
| A Code thread is a session | "each conversation is a **session**: it has its own chat history, project folder, and code changes, **independent of any other session**" | A thread has turns and a folder. Nothing says which surface it belongs to. |
| The two surfaces do not share a list | Chat's conversations and Code's sessions are separate, and stored separately (`claude-code-sessions/` vs the chat surface's own store). | One `sessions.v1` array. |
| Chat's list | Flat, under "recent chats", with "Projects" above it. | "Chats", flat — but the rows are the same rows. |
| Code's list | "group sessions by project", filterable by status, project or environment. | Grouped by folder — but over chats too. |
| Code's setup row | "Before you send your first message, choose the environment, project folder, permission mode, and model **in the row under the prompt box**." | Environment, folder, mode and model are already in the Code composer. |
| Chat's setup | The model picker at the bottom right of the message box. Nothing else. | Model picker in the chat meta row. Nothing else. |
| Model and effort | "each user's next conversation starts on the model they last used", and the same for effort. A session continues on the model it was using. | One model and one effort for the whole app. |
| Switching tabs | You land on that tab's own list and that tab's own open session. | You land on the same list and the same open thread, wearing different chrome. |

### 2.2 The lesson worth taking, and the one not

**Take this:** chat and code stay apart, because one of them owns a project, a
workspace, tools and a permission model, and the other owns none of those.
Their histories, their lists and their context are separate objects.

**Do not take this:** Claude *merged* Chat and Cowork on 2026-09-16
("these are merged into a single conversation, so you don't need to decide which
option better suits your task before getting started"). Two surfaces that do the
same job with the same tools should be one surface. Chat and Code are not that
pair — a code session has a folder and a working tree; a chat does not. Merging
them would mean every conversation could edit your files, which is exactly what
`docs/plan/Plan_master.md` §10.2 forbids:

> **Chat mode:** should behave like ordinary conversation. … application tools are
> not enabled by default in Chat mode. The model should not silently read local
> files or perform actions.

---

## 3. Where we are today

Every row below is verified against the code at commit `bea8de3`.

### 3.1 The rail — `src/blocks/shell/sidebar-nav.tsx`

| Element | Line | Today | Verdict |
|---|---|---|---|
| Destination rows | `:145-200` | Two separate row sets, `NAV.chat` and `NAV.code` | ✅ already separate |
| List heading | `:442` | `variant === "code" ? "Sessions" : "Chats"` | ✅ |
| Sort order | `:385-389` | `sortByMode` — already per side | ✅ |
| **List contents** | `:380`, `:448-476` | Both read the same `listSessions()` | ❌ **the same rows** |
| Grouping | `:250-259` | By folder, code only. Keyed on `session.folder \|\| "No folder"` | ⚠️ a chat has no folder, so it lands in "No folder" |
| Group order | `:449` | Map insertion order. The user's sort does **not** reorder groups, only the threads inside them | ⚠️ |
| Pin | `:247` | Pinned rises to the top of the **whole list** in chat, of **its own group** in code | ⚠️ inconsistent |
| Sort control label | `:294` | `aria-label="Sort threads"` — says "threads" in a list headed "Chats" | ⚠️ |
| Empty state | `:463-476` / `:449` | Chat renders an empty padded group; Code renders nothing at all | ⚠️ |
| Row | `:337-367` | Title + timestamp only. No folder, no model, no pin mark, no indication of which surface a thread belongs to | ⚠️ |
| "New" row | `:407-409` | Calls `bridge.functions.current?.reset()` directly — **not** `useNewThread`. Does not set the variant, does not drain a queued tray intent | ❌ |
| Account row | `sidebar-account.tsx` | One row. The mock has one per side | ⚠️ |

### 3.2 The composer — `src/blocks/prompt-input/prompt-block.tsx`

`PromptBlock` holds **one** set of state for both sides. The variant is read in
exactly four places (`:884`), and in all four it is cosmetic.

| State | Line | Shared? | Should be |
|---|---|---|---|
| `turns`, `history` | `:871` | one set | per thread |
| `status`, `busy` | `:872` | one | per thread |
| `usage` | `:897` | one | per thread |
| `activeSessionId` / `activeSessionRef` | `:919`, `:972` | one | **per side** |
| `abortRef` | `:968` | one | per side |
| `model`, `effort` | `:875`, `:880` | one, backed by one pref each | **per side** (§6, D4) |
| `mode` (Edit/Plan/Ask) | `:885` | one, global pref | **Code only**, per session |
| `folderId`, `projectFiles` | `:902`, `:903` | one | **Code only**, per session |
| `starterOffset` | `:908` | one | per side (one rotation counter over two pools) |
| `sessions` | `:918` | one list | two lists |
| `servedModel` | `:899` | written, never read | — (dead) |
| `cloneOpen`, `cloneState`, `projectsRoot` | `:924`, `:926`, `:927` | one, Code-only trigger | Code only |
| Composer draft | `prompt-input.tsx:164`, key `"acme-prompt-input-demo"` (`prompt-block.tsx:1685`) | **one draft slot** | per side |
| `context.textareaRef`, `context.groupRef` | `prompt-input.tsx:698-724`, `:628-629` | one slot, two mounted textareas/bodies | stays one — the dance in `prompt-input.tsx:698-724` is what makes it safe |

What the variant *does* control today: the layout prop (`:1689`), which of the
three `VariantRegion`s is mounted (`:1706`, `:1788`, `:1800`), and the starter
pool (`:601`).

### 3.3 The request — `prompt-block.tsx:1223-1238`

```jsonc
{
  "messages": outbound,
  "system": buildSystem(mode, folder?.name ?? null),
  "config": { "modelName": model, "reasoningEffort": effort }
}
```

| Fact | Evidence |
|---|---|
| **The body carries no surface.** No `variant`, no `mode`, no `folder`, no `tools`. | `:1227-1237` |
| **`buildSystem` takes the mode and the folder. Never the variant.** | `:641-652`, called at `:1229` |
| **So a chat conversation is sent the code system prompt** — "You are helping with a real local repository. You have no tools…" — while its composer shows "Ask anything" and offers no way to change the mode. | `:228-235` vs `:1791` |
| **And a chat conversation sent while a folder is attached carries the folder paragraph** — "The user has opened the local folder X" — because the folder is global and `newSession` (`:1404-1418`) never clears it. | `:643-649`, `:1404-1418` |
| **The server does not know either.** `server/chat.ts:48-56` accepts `{messages, system, tools, config}` and branches on none of it. | `server/chat.ts` |
| **No tools are sent at all.** The live app hand-rolls its `fetch`; the assistant-ui stack that carries the toolkit is not mounted (§8, B2). | `:1223-1238`; `src/assistant.tsx:41` |
| The Mode picker and the folder picker are rendered **only** in the Code region. | `:1719-1725`, `:1747-1770` |

### 3.4 Storage and preferences

| Thing | Today | Key |
|---|---|---|
| Threads | One array, one type, one cap (50), one change signal. **No `variant` field.** `mode` on the record is the *agent* mode (`edit`/`plan`/`ask`), not the surface — a red herring. | `tavi.sessions.v1` (`src/lib/sessions.ts:60`) |
| `model` | One global value | `tavi.model` |
| `effort` | One global value | `tavi.effort` |
| `mode` | One global value, used by Code only | `tavi.mode` |
| `sidebar` | One global value | `tavi.sidebar` |
| `font` | One global value — genuinely global | `tavi.font` |
| Composer draft | One slot for both composers | `prompt-draft:acme-prompt-input-demo` |

### 3.5 Every entry point that can start or open a thread

| # | Entry point | Sets the surface? | Notes |
|---|---|---|---|
| 1 | Rail "New" row (`sidebar-nav.tsx:407`) | **No** | Bypasses `useNewThread`; does not drain a queued tray intent |
| 2 | App menu → New chat (`app-menu.tsx:224`) | Yes → chat | Forces Chat even from Code. No "New session" counterpart |
| 3 | Tray → New chat (`tray-bridge.tsx:51`) | Yes → chat | |
| 4 | Tray → New session (`tray-bridge.tsx:52`) | Yes → code | |
| 5 | Composer sessions menu → "New chat" (`prompt-block.tsx:314`) | **No** | A chat-labelled action inside the **code-only** composer footer |
| 6 | Rail row click (`sidebar-nav.tsx:412`) | **No** | Opens a session while staying in the Chat composer |
| 7 | Composer sessions menu row (`prompt-block.tsx:326`) | **No** | Same |

Three of the seven set the surface; four do not. The two that do it correctly
(`useNewThread`, `thread-bridge.tsx:78-94`) are also the only ones that drain a
pending tray intent.

### 3.6 The leaks, ranked

| # | Leak | What you see |
|---|---|---|
| 1 | `buildSystem` ignores the surface (`:1229`) | A chat is answered as if it were a repository task. |
| 2 | One thread store, no surface field | Your chat is re-labelled "Sessions" and filed under "No folder". |
| 3 | One open thread, one `turns`, one `abortRef` | You keep chatting *in Code*, in a thread that has no folder and was never a session. |
| 4 | `openSession` (`:1420-1437`) never sets the surface | Opening a session from the Sessions list leaves you in the Chat composer. |
| 5 | `model`, `effort`, `mode`, `folder` all global | A chat inherits Code's model, effort and folder. |
| 6 | One draft slot (`draftKey`) | A half-written chat draft appears in the Code composer. |

---

## 4. The target

### 4.1 What each surface owns

| | **Chat** | **Code** |
|---|---|---|
| A thread is called | a chat | a session |
| Owns a project folder | no | yes |
| Owns an agent mode (Edit / Plan / Ask) | no | yes |
| Files in context | attachments only | folder files + `@` mentions, inlined at send time |
| Tools | none | the toolkit, scoped to the folder (not built) |
| Rail list | flat, sorted | grouped by project folder |
| Composer | body + model row beneath | inset shell, tools row, footer row |
| Setup row under the box | model only | environment, folder, mode, model |
| System prompt | its own instruction | the mode's instruction + the folder paragraph |
| Model and effort | remembered for the Chat side | remembered for the Code side |

### 4.2 Two stores

Two separate objects, two separate keys, two separate types — Claude's model,
and the mock's "separate objects, not one list filtered by mode".

```
tavi.chats.v1           → StoredChat[]
tavi.code-sessions.v1   → StoredSession[]
```

`src/lib/threads.ts` holds what is genuinely common (the turn shape, the title
rule, the timestamp format, the storage helpers). `src/lib/chats.ts` and
`src/lib/sessions.ts` hold the two stores.

```ts
// src/lib/threads.ts — shared
export type StoredFile    = { name: string; size: number; text?: string }
export type StoredMention = { label: string; path?: string }
export type StoredTurn =
  | { id: string; role: "user";      text: string; files: StoredFile[]; mentions: StoredMention[] }
  | { id: string; role: "assistant"; text: string; stopped?: boolean }
  | { id: string; role: "summary";   text: string }

// src/lib/chats.ts
export type StoredChat = {
  id: string; title: string; createdAt: number; updatedAt: number
  turns: StoredTurn[]
  model?: string; effort?: string
  pinnedAt?: number
}                                  // no folder. no mode.

// src/lib/sessions.ts — code sessions
export type StoredSession = {
  id: string; title: string; createdAt: number; updatedAt: number
  turns: StoredTurn[]
  model?: string; effort?: string
  mode?: string; folder?: string
  pinnedAt?: number
}
```

The absence of `folder` and `mode` on `StoredChat` is the point: a chat has no
folder and no agent mode, so it cannot be given one by accident.

### 4.3 Per-side state

| State | Where it lives | Key |
|---|---|---|
| Open thread | Composer, one per side | — |
| Thread content (turns, model, effort, mode, folder) | The thread record | the store |
| Model and effort | One per side | `tavi.model.chat`, `tavi.model.code`, `tavi.effort.chat`, `tavi.effort.code` |
| Agent mode (Code only) | The session record; one global default for new sessions | `tavi.mode` |
| Folder (Code only) | The session record | — |
| Composer draft | One per side | `prompt-draft:chat`, `prompt-draft:code` |
| Sort order | Rail, one per side (already) | in memory |
| Rail row order and hidden set | Rail, one per side | future (§9) |
| Rail open/closed, width, font, theme, palette | Global | as today |

### 4.4 The switch

```
switchSurface(next):
  surface       = next
  thread        = lastOpen[next]        // remembered per side
  if thread:    openThread(thread)       // restores that side's turns, model, effort, mode, folder
  else:         resetThread()            // an empty composer for that side
  // the other side's thread is untouched — it is exactly where you left it
```

and the other direction:

```
openThread(id):
  thread   = id
  surface  = thread's side                // a session opens in Code; a chat opens in Chat
  lastOpen[surface] = id
  restore the thread's turns, model, effort, and (in Code) its mode and folder
```

### 4.5 The composer stays one shell with two regions

The morph is not the problem and it does not change. `PromptInput` keeps one
context, and the two `VariantRegion`s keep collapsing and expanding. What
changes is that the **shared chrome is bound to the active side's values**:

| Shared element | Today | Becomes |
|---|---|---|
| `PromptInput` context (`:1674-1692`) | one | one — still shared; the text and files belong to whoever is typing |
| `composerModel` (`:1478-1488`) | one element, bound to one `model`/`effort` | one element, bound to the **active side's** model and effort. Still rendered in both regions, so the morph still carries it across |
| `contextDial` (`:1589-1604`) | one element | one element; the usage numbers belong to the thread being shown |
| `context.textareaRef` | one slot, two textareas | unchanged — the dance in `prompt-input.tsx:698-724` already handles it |
| Draft | one slot | one slot per side |
| `PromptInputSelect` (Mode / Environment / Folder) | Code only | Code only — and Code-only *state*, so a chat can never inherit a folder |
| `PromptInputMeter` | Chat only | Chat only |

---

## 5. The work, stage by stage

Each stage ends with the app working and `pnpm typecheck` clean. They are
ordered so the visible behaviour improves at every step.

### Stage 1 — Two stores

**Goal:** chats and code sessions are different objects in different places.

- New `src/lib/threads.ts` — the shared turn types, `titleFor`, `formatWhen`, and
  a small store factory (read, write, subscribe, cap).
- New `src/lib/chats.ts` — `StoredChat` and the chat store, key `chats.v1`.
- `src/lib/sessions.ts` — becomes the **code session** store, key `code-sessions.v1`.
  `StoredSession` keeps `mode` and `folder`; it loses nothing else.
- The old `tavi.sessions.v1` key is **deleted** on first run. The threads in it
  were test data (D3).
- `prompt-block.tsx` picks the store by surface: a chat writes to the chat
  store, a session to the session store. `persist` (`:1347`) takes the store as
  an argument.
- The rail reads the store for the active surface. "Chats" lists chats, flat;
  "Sessions" lists code sessions, grouped by folder.
- The composer's own sessions menu (`:277`, mounted at `:1776`) lists code
  sessions. It says "Sessions", and it is Code-only, so that is now true.

**Checked by:** send a message in Chat → it appears under "Chats" and not under
"Sessions"; send one in Code → the reverse. A chat record has no folder and no
mode.

### Stage 2 — Each side keeps its own open thread

**Goal:** flipping the switch takes you to the other side's thread, and opening
a thread takes you to that thread's side.

- The composer holds `lastOpen: { chat: string | null; code: string | null }`
  and reads the active thread's content out of its store.
- `switchSurface` / `openThread` as in §4.4.
- The rail's "New" row uses `useNewThread(surface)` (`thread-bridge.tsx:78`) so
  all seven entry points in §3.5 behave the same way.
- The composer's "New chat" item inside the Code footer becomes "New session",
  and calls the same thing.
- The app menu gets a "New session" beside "New chat".
- The context menu's Fork stays on the Code side (it is already keyed on the
  rail's surface, which is now correct by construction) and the fork stays in
  the session store.
- Switching while a reply is streaming aborts it and keeps the partial reply,
  marked stopped — the existing `stop()` behaviour (`:1370-1383`). One composer,
  one stream; see D6.

**Checked by:** chat, switch to Code, and you are in a Code session or an empty
Code composer — never in the chat. Switch back and the chat is exactly where
you left it, including the draft. Open a session from the Sessions list and the
composer is in Code.

### Stage 3 — Model and effort, remembered per side

**Goal:** Chat and Code each remember their own model and effort, and "New" does
not change them.

- `PREF.model` and `PREF.effort` become per side (`model.chat`, `model.code`,
  `effort.chat`, `effort.code`).
- The composer binds the shared `PromptInputModel` to the active side's values,
  so the control is one control with two memories — which is what Claude does
  ("each user's next conversation starts on the model they last used").
- Opening a thread still restores the model and effort **that thread used**
  (Claude: "The session continues on the model it was using"), and updating the
  side's remembered value at the same time.
- The dormant `src/components/model-picker.tsx` writes the same pref keys from
  a second place; it is removed from the picture in Stage 7 (B2).

**Checked by:** pick Opus in Chat, switch to Code, pick Sonnet, switch back —
Chat still says Opus. Click "New chat" in Chat — still Opus. Click "New session"
in Code — still Sonnet.

### Stage 4 — The request is honest about which surface it came from

**Goal:** a chat is answered as a chat.

- `buildSystem(surface, mode, folderName)`:
  - **Chat** gets its own instruction — a conversation, no tools, only the text
    and attachments that were sent with it.
  - **Code** gets the mode's instruction (Edit / Plan / Ask) and, when a folder
    is attached, the folder paragraph.
- The body carries `surface: "chat" | "code"`.
- The server (`server/chat.ts`) validates it: an unknown surface is a `400`,
  and **a chat request that carries tools is a `400`** — the enforcement of
  `Plan_master.md` §10.2, where the enforcement belongs. The surface is
  written into the existing log line; the body is never logged.
- The compaction request (`:1515-1534`) carries the surface too, so a summary is
  written with the same framing as the conversation it summarises.

**Checked by:** a chat request's system prompt says nothing about a repository;
a code request's does. The server refuses a chat request with tools.

### Stage 5 — Code-only concepts stay in Code

**Goal:** nothing that belongs to Code can reach a chat.

- The folder and the mode are not global. They live on the session record, and
  the composer reads them from the session it has open.
- `newSession` clears nothing it should not clear, and clears everything it
  should: a new chat has no folder and no mode; a new session starts with the
  app's default mode and no folder until one is chosen.
- The `mode` pref stays global as the **default mode for a new code session** —
  it is Code's default, and Code is the only thing that reads it.
- The `@` menu, the file inlining (`expandUserTurn`, `:698-731`) and the code
  starters only ever run in Code.

**Checked by:** attach a folder in Code, switch to Chat, send a message — the
request has no folder paragraph, no inlined files, and the chat record has no
folder.

### Stage 6 — The small stuff

**Goal:** the seams stop showing.

- The composer draft key becomes per side (`prompt-draft:chat`,
  `prompt-draft:code`).
- The rail's sort control says "Sort chats" / "Sort sessions".
- The rail's empty state says something on each side — "No chats yet" /
  "No sessions yet" — rather than rendering an empty padded group in Chat and
  nothing at all in Code.
- The conversation's empty state is per side: Chat asks a different question
  than Code. ("What are we working on?" is a code question.)
- The rail row shows what differs: the project on a session row is already the
  group heading, so the row shows the model instead.
- The pin indicator is visible, not only felt through ordering.
- The Rename dialog's copy stops promising "the composer's own session list"
  for a chat, which has none.
- The composer's sessions menu subscribes to the store's change signal, so a
  rename or a fork done in the rail appears in it (it does not today).
- The group order in Code follows the sort the user chose, not insertion order.
- Pinned threads rise to the top of the list in both surfaces.

### Stage 7 — Documentation

- `README.md` — a section on the two surfaces, what each one is, what each one
  owns, and the per-side model/effort memory.
- `docs/storage.md` — the two keys, the two record shapes, and the fact that
  the old `sessions.v1` key is gone.
- This document — the stages as they land, marked off.

---

## 6. Decisions

Taken 2026-10-20. Each one is a choice, and the reason is recorded so it is not
quietly reversed later.

| # | Decision | Reason |
|---|---|---|
| **D1** | **Each side keeps its own open thread.** Flipping Chat ⇄ Code shows that side's last open thread, or an empty composer if it has none. The other side's thread is untouched. | Claude Desktop. "A Chat is not a Code session, so opening one must not close the other" (mock `:1303`). |
| **D2** | **Two separate stores.** `tavi.chats.v1` and `tavi.code-sessions.v1`, two types, two caps. | Claude's model, and the mock's "separate objects, not one list filtered by mode" (`:263`). |
| **D3** | **The existing threads are deleted.** They were test data; no migration. | The maintainer's call. The old `tavi.sessions.v1` key is removed on first run. |
| **D4** | **Model and effort are remembered per side.** Chat keeps its own, Code keeps its own; "New chat" and "New session" keep that side's; a thread still records what it used, and opening it restores that. | Claude Desktop: "each user's next conversation starts on the model they last used"; "The session continues on the model it was using." |
| **D5** | **One composer, two animated regions.** The morph does not change. | The maintainer's call, and the mock's structure (`:888-891`). What changes is that the shared chrome is bound to the active side's values. |
| **D6** | **Switching surfaces while a reply is streaming aborts it** and keeps the partial reply, marked stopped. | One composer, one stream. Parallel streams need a per-thread runtime, which is a much larger change; recorded in §9. |
| **D7** | **The Chat surface gets its own system instruction**, and no tools — enforced in the server. | `Plan_master.md` §10.2. |
| **D8** | **The agent mode (Edit / Plan / Ask) is Code-only**, and the folder is Code-only. Both live on the session record. | A chat has no repository and no permission model. |

---

## 7. Edge cases

| Case | Rule |
|---|---|
| Switch while streaming | Abort, keep the partial reply, mark it stopped (D6). |
| Switch while the composer has text | The draft belongs to the side it was typed in. Each side keeps its own. |
| Open a thread | The surface moves to that thread's side. |
| Delete the open thread | That side opens empty. The other side is untouched. |
| Delete a thread from the rail's context menu | Removes it from its own store only. |
| Fork | Stays on its side, in the same store, and is not opened. |
| Rename from the rail | The composer's sessions menu refreshes. |
| Pin | Per store. A pinned thread rises to the top of the list in both surfaces. |
| Storage quota | Each store has its own cap and its own drop-the-oldest fallback. |
| Reload the app | Both sides open empty, as the app opens in Chat today. Restoring the last open thread per side is future work (§9). |
| Tray "New chat" / "New session" | Switches to that side and starts a new thread there, draining any queued intent. |
| A queued tray intent | Drained by every "new thread" path, including the rail's. |
| The old `tavi.sessions.v1` key | Deleted on first run (D3). |

---

## 8. Bugs found on the way

Not part of this plan. Recorded so they are not lost, and so they are not
mistaken for consequences of it.

| # | Bug | Where | Severity |
|---|---|---|---|
| **B1** | **The compaction summary is never sent.** The turn type says "sent with later requests" and the compact function's comment says "that summary is carried into later requests", but the request builder skips summary turns. Compaction therefore *loses* the summarised content instead of compressing it — the old turns are dropped from the view and the summary never reaches the model either. | `prompt-block.tsx:1206-1207` vs `:609-610` and `:1490-1493` | **High.** A real data-loss bug, independent of the split. |
| **B2** | **The assistant-ui stack is not mounted.** `src/assistant.tsx`, `src/components/thread.aui.tsx`, `src/toolkit.tsx`, `src/components/assistant-ui/**`, `src/components/model-picker.tsx`, `src/components/model-selector*.tsx`, `src/utils/model-selection.ts` and `src/components/AssistantSurface.tsx` are unreachable from `src/main.tsx`. The live app hand-rolls its `fetch` and its SSE parser, so it sends no tools, renders no reasoning and no tool cards, and has no assistant-ui message tree. Two model pickers read and write the same preference keys from separate in-process state. | `src/App.tsx:27`; `src/components/AssistantSurface.tsx:42` | **High**, and it decides where the tool policy is enforced (the server, not the toolkit). |
| **B3** | The `VariantRegion` unstick timer only runs while the region is active, so a region removed within 550 ms of entering relies on the exit animation alone. | `prompt-block.tsx:102-123` | Low |
| **B4** | The composer's sessions menu does not subscribe to the store's change signal, so a rename, pin, fork or delete done in the rail does not appear in it. | `prompt-block.tsx:918` | Medium |
| **B5** | The rail's sort reorders the threads inside a project group but not the groups themselves. | `sidebar-nav.tsx:449` | Low |
| **B6** | `servedModel` is written and never read; `createSession` is imported and never used; `c = pick(2)` is computed and never used; five exported composer primitives are used nowhere. | `prompt-block.tsx:899`, `:43`, `:529`; `prompt-controls.tsx:55`, `:120`, `:171`, `:610`, `:655` | Low |
| **B7** | A comment describes a dictation overlay that no longer exists. | `prompt-block.tsx:1711-1717` vs `prompt-controls.tsx:1689-1698` | Low |
| **B8** | The Rename dialog promises the name appears "in the rail and in the composer's own session list" — the second half is false in Chat. | `thread-context-menu.tsx:184-186` | Low |

---

## 9. Deliberately not in this plan

| Item | Why not now |
|---|---|
| Parallel sessions — several running at once, each with its own panes | Needs a per-thread runtime, not just per-thread data. D6 is the small version of this. |
| Restoring the last open thread per side across a reload | The app opens in Chat today with nothing open. A small follow-up once D1 has settled. |
| The rail's per-side row order and hidden set (the mock's `Customize` panel) | The rows are already two sets; the panel behind them is not built. |
| The command palette | Not built. When it is, it must list the active surface's threads only (mock `:1146`). |
| Diff, terminal, file and browser panes for Code | Claude's Code tab is built around them. They are a much larger piece of work than the split itself. |
| Chat tools | D7 forbids them. When they arrive, the server is where that is enforced. |
| Bringing the assistant-ui stack to life | B2. It is a decision about which runtime the app uses, not about Chat and Code. |

---

## 10. Where this lands

Stage by stage, each one committed on its own, each one ending with the app
working and `pnpm typecheck` clean. The order is the one in §5, because it is
the order in which each stage can be checked by hand.

**The check for the whole plan is one sentence:** a chat never appears in the
Sessions list, a session never appears in the Chats list, and switching between
them never shows you a conversation that belongs to the other one.
