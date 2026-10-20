# Separating Chat from Code

**Status:** plan, revision 2. Nothing in it is built yet.
**Decided by:** the maintainer, 2026-10-20. The decisions are recorded in §7 and are
not to be reopened without saying so here first.
**Why this document exists:** the app has a Chat surface and a Code surface, and
they are two views of one thing. This is the plan to make them two things.

> **Revision 2** re-checked every claim in revision 1 against the code and against
> Claude Desktop's current documentation, and corrected four things that were
> wrong or incomplete. §10 lists what changed and why.

---

## 0. Glossary

Three words get confused in this codebase, and the confusion is the source of
half the bugs in §3. They are fixed here and used consistently throughout.

| Word | Means | Values | Lives in |
|---|---|---|---|
| **variant** | Which of the two surfaces you are on | `"chat"` \| `"code"` | `ComposerVariant` — `composer-variant.tsx:12` |
| **mode** | Which agent behaviour a code session runs in | `"edit"` \| `"plan"` \| `"ask"` | `MODES` — `prompt-block.tsx:219-263` |
| **folder** | The repository a code session is pointed at | a `RecentFolder` | `fs-access.ts:60-64` |

The repository already has this collision — `StoredSession.mode` is the **agent
mode**, not the variant — and the app's own comment at `prompt-block.tsx:220-222`
resigns itself to it ("*'edit', not 'code': the Code layout already owns that
word*"). This document never uses "mode" for the chat/code choice and never uses
"variant" for the agent mode.

---

## 1. The rule

> **A chat is not a code session. They are two surfaces that share a window, a
> component library, a provider connection and a model catalogue — and nothing
> else.**

The rail, the composer and the request are all shared *chrome*. The **data** is
not shared: a chat is a chat, a session is a session, and neither can appear in
the other's list, or in the other's context.

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
activeByMode  { chat: null, code: null }    // each side keeps its open thread
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
| **The surfaces are top-level places** | Chat and Cowork merged into **Home**; **Code is a separate tab beside it**. Earlier versions had three tabs. Each tab has its own sidebar. | An `IconSwitch` in the rail header. The rail's *rows* change with it; the rail's chrome does not. |
| The chat/code choice is **not** a composer control | Claude's *Home* offers Chat vs Cowork **in the message box**, because those two are the same job. Chat vs Code is a **tab**, because a code session has a folder and a working tree. | Our switch is in the rail — app chrome, not the composer. **This is the right placement** and it is worth knowing why it is right. |
| A Code thread is a session | "each conversation is a **session**: it has its own chat history, project folder, and code changes, **independent of any other session**" | A thread has turns and a folder. Nothing says which surface it belongs to. |
| **Chat has no file access** | "**Chat: General conversation with no file access**, similar to claude.ai." Its tool surface is: web search and fetch, **files attached to the conversation**, project memory, project folders (read-only), a scratch directory of its own — "and nothing else on the machine". | A chat can inherit Code's folder, Code's mode and Code's system prompt. See §3.3. |
| **The restrictions are enforced, not hidden** | "These restrictions are **enforced in the app's main process, not just hidden in the UI**." A Chat conversation cannot read the filesystem, cannot run code on the host, cannot escalate into an agentic session, and **cannot read other conversations**. | The server has no idea which surface a request came from. See §3.3. |
| The two surfaces have **separate stores** | Chat and Cowork conversations live under `local-agent-mode-sessions/`; Code session records live under `claude-code-sessions/`. Claude Code's own transcripts live in `~/.claude/projects/`. | One `sessions.v1` array. |
| Sessions are stored **per project** | Claude Code writes `~/.claude/projects/<project>/<session-id>.jsonl`, where `<project>` is the working directory path with non-alphanumerics replaced by `-`. **The grouping is the storage layout.** | One flat array with a `folder` field on each record. |
| "Each conversation is isolated to its own directory" | A Chat conversation has no tools for listing or reading other sessions' transcripts. | Nothing stops a chat's context from being a session's context today, because there is only one list. |
| Chat's list | Flat, under "recent chats", with "Projects" above it. | "Chats", flat — but the rows are the same rows. |
| Code's list | "group sessions by project", filterable by status, project or environment. | Grouped by folder — but over chats too. |
| Code's setup row | "choose the environment, project folder, permission mode, and model **in the row under the prompt box**" | Environment, folder, mode and model are already in the Code composer. |
| Chat's setup | The model picker at the bottom right of the message box. Nothing else. | Model picker in the chat meta row. Nothing else. |
| Model and effort | "each user's next conversation starts on the model they last used"; "The session continues on the model it was using." A permission mode you pick is **remembered per folder**. | One model and one effort for the whole app; one mode for the whole app. |
| Context usage | "Context usage is **per session**; plan usage is shared across all your Claude Code surfaces." | One `usage` state for the whole app, reset on open. See §3.2. |
| A session row shows | name or generated title, time since last activity, **git branch**, file size | title and timestamp only |
| Fork | "Sessions created with `/branch` or `--fork-session` get their own session IDs and appear as separate rows." | A fork stays in the same store. Correct — and it is already Code-only. |
| A side chat | reads the session's context but adds nothing back; "the desktop app doesn't save side chats to disk, so you can't return to one after you close the app" | Not built. §11. |

### 2.2 The lesson worth taking, and the one not

**Take this:** chat and code stay apart, because one of them owns a project, a
workspace, tools and a permission model, and the other owns none of those.
Their histories, their lists, their context and their **storage** are separate
objects. Their restrictions are enforced in the backend, not merely hidden in
the UI.

**Do not take this:** Claude *merged* Chat and Cowork on 2026-09-16 ("these are
merged into a single conversation, so you don't need to decide which option
better suits your task before getting started"). Two surfaces that do the same
job with the same tools should be one surface. Chat and Code are not that pair —
a code session has a folder and a working tree; a chat does not. Merging them
would mean every conversation could edit your files, which is exactly what
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
| Row | `:337-367` | Title + timestamp only. No folder, no model, no pin mark, no sign of which surface a thread belongs to | ⚠️ |
| "New" row | `:407-409` | Calls `bridge.functions.current?.reset()` directly — **not** `useNewThread`. Does not set the variant, does not drain a queued tray intent | ❌ |
| Account row | `sidebar-account.tsx:109` | One row, showing the provider key's plan badge | ✅ **correctly global** — one provider connection and one plan tier serve both surfaces ("Code sessions use the same provider, endpoint, and credentials"). The mock's differing account values were placeholder data. |

### 3.2 The composer — `src/blocks/prompt-input/prompt-block.tsx`

`PromptBlock` holds **one** set of state for both sides. The variant is read in
exactly four places (`:884`), and in all four it is cosmetic.

| State | Line | Shared? | Should be |
|---|---|---|---|
| `turns`, `history` | `:871` | one set | per thread |
| `status`, `busy` | `:872`, `:977` | one | per thread |
| `usage` | `:897` | one | per thread — the dial shows the wrong numbers after a switch |
| `activeSessionId` / `activeSessionRef` | `:919`, `:972` | one | **per side** |
| `abortRef` | `:968` | one | per side |
| `model`, `effort` | `:875`, `:880` | one, one pref each | **per side** (D4) |
| `mode` (Edit/Plan/Ask) | `:885` | one, global pref | **Code only**, per session; default remembered per folder |
| `folderId`, `projectFiles` | `:902`, `:903` | one | **Code only**, per session |
| `starterOffset` | `:908` | one counter over two pools | per side |
| `sessions` | `:918` | one list | two lists |
| `servedModel` | `:899` | written, never read | — (dead) |
| `cloneOpen`, `cloneState`, `projectsRoot` | `:924`, `:926`, `:927` | one, Code-only trigger | Code only |
| Composer **text** | `prompt-input.tsx:249` (`ownText`) | one | per side |
| Composer **attachments** | `prompt-input.tsx:282` (`usePromptFiles`) | one | per side |
| Composer **mentions** | `prompt-input.tsx:255` | one | per side |
| Composer **queue** (messages sent while busy) | `prompt-input.tsx:256` | one | per side |
| `context.textareaRef`, `context.groupRef` | `prompt-input.tsx:261`, `:262` | one slot, two mounted textareas/bodies | stays one — the dance in `prompt-input.tsx:698-724` is what makes it safe |

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
| **And a chat sent while a folder is attached carries the folder paragraph** — "The user has opened the local folder X" — because the folder is global and `newSession` (`:1404-1418`) never clears it. | `:643-649` |
| **The server does not know either.** `server/chat.ts` accepts `{messages, system, tools, config}` and branches on none of it. There is no `variant` anywhere in `server/`. | `server/chat.ts:48-56` |
| **No tools are sent at all.** The live app hand-rolls its `fetch`; the assistant-ui stack that carries the toolkit is not mounted (§9, B2). | `:1223-1238`; `src/assistant.tsx:41` |
| The Mode picker and the folder picker are rendered **only** in the Code region. | `:1719-1725`, `:1747-1770` |
| A chat's attachments *are* inlined as text, honestly — a binary file says "[Attached file is not text and was not sent.]" rather than vanishing. | `:621-634`, `:726-728` |

### 3.4 Storage and preferences

| Thing | Today | Key |
|---|---|---|
| Threads | One array, one type, one cap (50), one change signal. **No `variant` field.** `mode` on the record is the *agent* mode — a red herring. | `tavi.sessions.v1` (`src/lib/sessions.ts:60`) |
| `model` | One global value | `tavi.model` |
| `effort` | One global value | `tavi.effort` |
| `mode` | One global value, used by Code only | `tavi.mode` |
| `sidebar`, `font` | One global value each — genuinely global | `tavi.sidebar`, `tavi.font` |
| Composer draft | One slot for both composers | `prompt-draft:acme-prompt-input-demo` |

**Two traps in the storage layer, both of which the plan must handle:**

| Trap | Detail | Consequence |
|---|---|---|
| The legacy namespace can resurrect a deleted key | `readStorage` (`storage.ts:41-61`) reads `tavi.<name>`, and if that is absent it reads `ai-app.<name>`, **moves it across, and deletes the legacy one**. | Deleting `tavi.sessions.v1` is not enough: the next read of that name would move `ai-app.sessions.v1` straight back. **Both spellings have to go.** |
| A folder's identity is its **directory name** | `RecentFolder.id` and `.name` are both `handle.name` (`fs-access.ts:112`), and the IndexedDB handle store is keyed by it too (`:115`). | Two folders called `app` on different drives are **the same folder** to this app — the second pick overwrites the first's handle, and the Code rail merges their sessions into one group. A session cannot be re-attached to a folder it has been confused with. See B9 and D9. |

### 3.5 Every entry point that can start or open a thread

| # | Entry point | Sets the variant? | Notes |
|---|---|---|---|
| 1 | Rail "New" row (`sidebar-nav.tsx:407`) | **No** | Bypasses `useNewThread`; does not drain a queued tray intent |
| 2 | App menu → New chat (`app-menu.tsx`) | Yes → chat | Forces Chat even from Code. No "New session" counterpart |
| 3 | Tray → New chat (`tray-bridge.tsx:51`) | Yes → chat | |
| 4 | Tray → New session (`tray-bridge.tsx:52`) | Yes → code | |
| 5 | Composer sessions menu → "New chat" (`prompt-block.tsx:314`) | **No** | A chat-labelled action inside the **code-only** composer footer |
| 6 | Rail row click (`sidebar-nav.tsx:412`) | **No** | Opens a session while staying in the Chat composer |
| 7 | Composer sessions menu row (`prompt-block.tsx:326`) | **No** | Same |

Three of the seven set the variant; four do not. The two that do it correctly
(`useNewThread`, `thread-bridge.tsx:78-94`) are also the only ones that drain a
pending tray intent.

### 3.6 The leaks, ranked

| # | Leak | What you see |
|---|---|---|
| 1 | `buildSystem` ignores the variant (`:1229`) | A chat is answered as if it were a repository task. |
| 2 | One thread store, no variant field | Your chat is re-labelled "Sessions" and filed under "No folder". |
| 3 | One open thread, one `turns`, one `abortRef` | You keep chatting *in Code*, in a thread that has no folder and was never a session. |
| 4 | `openSession` (`:1420-1437`) never sets the variant | Opening a session from the Sessions list leaves you in the Chat composer. |
| 5 | `model`, `effort`, `mode`, `folder` all global | A chat inherits Code's model, effort and folder. |
| 6 | One draft slot, and the swap is **actively wrong** | See B10 — the outgoing side's text overwrites the incoming side's draft. |
| 7 | Shared attachments, mentions and queue | A code session's attached files and `@` mentions follow you into a chat. |

---

## 4. The target

### 4.1 What each side owns

| | **Chat** | **Code** |
|---|---|---|
| A thread is called | a chat | a session |
| Owns a project folder | no | yes |
| Owns an agent mode (Edit / Plan / Ask) | no | yes |
| Files in context | attachments only, inlined as text | folder files + `@` mentions, inlined at send time |
| Tools | none — enforced in the server | the toolkit, scoped to the folder (not built) |
| Rail list | flat, sorted | grouped by project folder |
| Composer | body + model row beneath | inset shell, tools row, footer row |
| Setup row under the box | model only | environment, folder, mode, model |
| System prompt | its own instruction | the mode's instruction + the folder paragraph |
| Model and effort | remembered for the Chat side | remembered for the Code side |
| May read the other side's transcripts | **no** | **no** |

### 4.2 Two stores

Two separate objects, two separate keys, two separate types — Claude's model
(`local-agent-mode-sessions/` vs `claude-code-sessions/`), and the mock's
"separate objects, not one list filtered by mode".

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
  mode?: string          // edit | plan | ask
  folder?: string        // the folder's stable id (D9)
  folderName?: string    // the folder's display name, for the group heading
  pinnedAt?: number
}
```

The absence of `folder` and `mode` on `StoredChat` is the point: a chat has no
folder and no agent mode, so it cannot be given one by accident.

**Why not one store per project**, the way Claude Code stores transcripts under
`~/.claude/projects/<project>/`? Because `localStorage` has no directories, and
because a session's folder can be changed — a dynamic key per project would make
"list every session" a scan of unknown keys and would leave the records
scattered the first time a session moved. A `folder` field on the record is the
honest equivalent, and it is the field the rail already groups by.

### 4.3 Per-side state

| State | Where it lives | Key |
|---|---|---|
| Open thread | Composer, one per side | — |
| Thread content (turns, model, effort, mode, folder, last usage) | The thread record | the store |
| Model and effort | One per side | `tavi.model.chat`, `tavi.model.code`, `tavi.effort.chat`, `tavi.effort.code` |
| Agent mode (Code only) | The session record; the **default for a new session is remembered per folder** | `tavi.mode.<folderId>` |
| Folder (Code only) | The session record | — |
| Composer text, attachments, mentions, queue | One per side | in memory; the text is persisted per side |
| Sort order | Rail, one per side (already) | in memory |
| Rail row order and hidden set | Rail, one per side | future (§11) |
| Rail open/closed, width, font, theme, palette | Global | as today |

### 4.4 The switch

```
switchVariant(next):
  variant       = next
  thread        = lastOpen[next]        // remembered per side
  if thread:    openThread(thread)       // restores that side's turns, model, effort, mode, folder
  else:         resetThread()            // an empty composer for that side
  swapComposerState(next)                // text, attachments, mentions, queue
  // the other side's thread is untouched — it is exactly where you left it
```

and the other direction:

```
openThread(id):
  thread   = id
  variant  = the thread's side           // a session opens in Code; a chat opens in Chat
  lastOpen[variant] = id
  restore the thread's turns, model, effort, and (in Code) its mode and folder
```

### 4.5 The composer stays one shell with two regions

The morph is not the problem and it does not change. `PromptInput` keeps one
context, and the two `VariantRegion`s keep collapsing and expanding. What
changes is that the **shared chrome is bound to the active side's values**:

| Shared element | Today | Becomes |
|---|---|---|
| `PromptInput` context (`:1674-1692`) | one | one — but its **text, files, mentions and queue** are per side |
| `composerModel` (`:1478-1488`) | one element, bound to one `model`/`effort` | one element, bound to the **active side's** model and effort. Still rendered in both regions, so the morph still carries it across |
| `contextDial` (`:1589-1604`) | one element, one `usage` | one element; the usage belongs to the thread being shown, and is read from that thread's record |
| `context.textareaRef` | one slot, two textareas | unchanged — the dance in `prompt-input.tsx:698-724` already handles it |
| Draft | one slot, and the swap is wrong (B10) | one slot per side, swapped explicitly by the app |
| `PromptInputSelect` (Mode / Environment / Folder) | Code only | Code only — and Code-only *state*, so a chat can never inherit a folder |
| `PromptInputMeter` | Chat only | Chat only |

---

## 5. The work, stage by stage

Each stage ends with the app working and `pnpm typecheck` clean. They are
ordered so the visible behaviour improves at every step.

### Stage 1 — Two stores, and a folder that knows its own name

**Goal:** chats and code sessions are different objects in different places.

- New `src/lib/threads.ts` — the shared turn types, `titleFor`, `formatWhen`, and
  a small store factory (read, write, subscribe, cap).
- New `src/lib/chats.ts` — `StoredChat` and the chat store, key `chats.v1`.
- `src/lib/sessions.ts` — becomes the **code session** store, key `code-sessions.v1`.
- **The old store is deleted, both spellings.** `tavi.sessions.v1` *and*
  `ai-app.sessions.v1`, because `readStorage` would otherwise move the legacy
  one straight back (`storage.ts:41-61`). The deletion is explicit, once, at
  startup — and after it, the name `sessions.v1` is never read again.
- **A folder gets a real identity.** `RecentFolder.id` becomes a generated id
  rather than the directory name; the IndexedDB handle store is keyed by it;
  `name` stays the display label. `browse()` sets the id, not the name
  (`prompt-block.tsx:1391` currently sets the name, which happens to work only
  because `id === name` today). A session records **both** `folder` (the id) and
  `folderName` (the label). The Code rail groups by `folder` and labels the group
  with `folderName`.
- `prompt-block.tsx` picks the store by variant: a chat writes to the chat
  store, a session to the session store. `persist` (`:1347`) takes the store as
  an argument.
- The rail reads the store for the active variant. "Chats" lists chats, flat;
  "Sessions" lists code sessions, grouped by folder.
- The composer's own sessions menu (`:277`, mounted at `:1776`) lists code
  sessions. It says "Sessions", and it is Code-only, so that is now true.

**Checked by:** send a message in Chat → it appears under "Chats" and not under
"Sessions"; send one in Code → the reverse. A chat record has no folder and no
mode. Two folders with the same directory name stay apart.

### Stage 2 — Each side keeps its own open thread

**Goal:** flipping the switch takes you to the other side's thread, and opening
a thread takes you to that thread's side.

- The composer holds `lastOpen: { chat: string | null; code: string | null }`
  and reads the active thread's content out of its store.
- `switchVariant` / `openThread` as in §4.4.
- **The composer's own state is swapped explicitly.** The block owns the
  composer's text (the `PromptInput` root already supports a controlled
  `value`), and on a switch it saves the outgoing side's text, attachments,
  mentions and queue and loads the incoming side's. Changing `draftKey` alone
  is not enough and is actively harmful — see B10.
- The rail's "New" row uses `useNewThread(variant)` (`thread-bridge.tsx:78`) so
  all seven entry points in §3.5 behave the same way.
- The composer's "New chat" item inside the Code footer becomes "New session",
  and calls the same thing.
- The app menu gets a "New session" beside "New chat".
- The context menu's Fork stays on the Code side (it is already keyed on the
  rail's variant, which is now correct by construction) and the fork stays in
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
  (Claude: "The session continues on the model it was using"), and updates the
  side's remembered value at the same time.
- The agent mode's **default for a new session is remembered per folder**, the
  way Claude remembers a permission mode per folder. Plan mode, which is a
  decision about one piece of work, applies to the session only.
- The dormant `src/components/model-picker.tsx` writes the same pref keys from
  a second place; it is taken out of the picture in Stage 7 (B2).

**Checked by:** pick Opus in Chat, switch to Code, pick Sonnet, switch back —
Chat still says Opus. Click "New chat" in Chat — still Opus. Click "New session"
in Code — still Sonnet. Pick "Plan" in one project, start a session in another
— that one starts on the app default.

### Stage 4 — The request is honest about which surface it came from

**Goal:** a chat is answered as a chat.

- `buildSystem(variant, mode, folderName)`:
  - **Chat** gets its own instruction — a conversation, no tools, only the text
    and the attachments that were sent with it. It says plainly that the model
    cannot read the machine, so it never implies that it read a file it did not.
  - **Code** gets the mode's instruction (Edit / Plan / Ask) and, when a folder
    is attached, the folder paragraph.
- The body carries `variant: "chat" | "code"`.
- The server (`server/chat.ts`) validates it: an unknown variant is a `400`,
  and **a chat request that carries tools is a `400`** — the enforcement of
  `Plan_master.md` §10.2 and of Claude's "enforced in the app's main process,
  not just hidden in the UI", where the enforcement belongs. The variant is
  written into the existing log line; the body is never logged.
- The compaction request (`:1515-1534`) carries the variant too, so a summary is
  written with the same framing as the conversation it summarises.

**Checked by:** a chat request's system prompt says nothing about a repository;
a code request's does. The server refuses a chat request with tools.

### Stage 5 — Code-only concepts stay in Code

**Goal:** nothing that belongs to Code can reach a chat.

- The folder and the mode are not global. They live on the session record, and
  the composer reads them from the session it has open.
- `newSession` clears everything it should and nothing it should not: a new chat
  has no folder and no mode; a new session starts with the folder's remembered
  mode and no folder until one is chosen.
- The `@` menu, the file inlining (`expandUserTurn`, `:698-731`) and the code
  starters only ever run in Code.
- A chat's attachments stay a chat's attachments: the composer swaps them on a
  switch, and a chat record never carries a mention path.

**Checked by:** attach a folder in Code, switch to Chat, send a message — the
request has no folder paragraph, no inlined files, and the chat record has no
folder.

### Stage 6 — The small stuff

**Goal:** the seams stop showing.

- The rail's sort control says "Sort chats" / "Sort sessions".
- The rail's empty state says something on each side — "No chats yet" /
  "No sessions yet" — rather than rendering an empty padded group in Chat and
  nothing at all in Code.
- The conversation's empty state is per side: Chat asks a different question
  than Code. ("What are we working on?" is a code question.)
- The rail row shows what differs: the project is already the group heading, so
  the row shows the model instead.
- The pin indicator is visible, not only felt through ordering.
- The Rename dialog's copy stops promising "the composer's own session list"
  for a chat, which has none.
- The composer's sessions menu subscribes to the store's change signal, so a
  rename or a fork done in the rail appears in it (it does not today).
- The group order in Code follows the sort the user chose, not insertion order.
- Pinned threads rise to the top of the list in both surfaces.

### Stage 7 — Documentation, and the dead code

- `README.md` — a section on the two surfaces, what each one is, what each one
  owns, and the per-side model/effort memory.
- `docs/storage.md` — the two keys, the two record shapes, and the fact that
  the old `sessions.v1` key is gone.
- `src/lib/prefs.ts` — its scope note says "anything larger belongs in
  `sessions.ts`"; it now belongs in `chats.ts` or `sessions.ts`.
- The dormant assistant-ui stack (B2) is either brought to life or removed. It
  is not left half-alive writing the same preference keys from a second place.

---

## 6. What is deliberately not in this plan

| Item | Why not now |
|---|---|
| Parallel sessions — several running at once, each with its own panes | Needs a per-thread runtime, not just per-thread data. D6 is the small version of this. |
| Restoring the last open thread per side across a reload | The app opens in Chat today with nothing open. A small follow-up once D1 has settled. |
| The rail's per-side row order and hidden set (the mock's `Customize` panel) | The rows are already two sets; the panel behind them is not built. |
| The command palette | Not built. When it is, it must list the active side's threads only (mock `:1146`). |
| Search over threads | Claude's session picker has it. It would need to search one store at a time. |
| Archive | Deliberately absent today (README). It needs somewhere to read archived threads and a way back out, which would be a third state per store. |
| Diff, terminal, file and browser panes for Code | Claude's Code tab is built around them. A much larger piece of work than the split itself. |
| Chat tools | D7 forbids them. When they arrive, the server is where that is enforced. |
| Side chats | Claude's side chat reads a session's context and adds nothing back, and is not saved to disk. A future idea for Code. |
| Bringing the assistant-ui stack to life | B2. A decision about which runtime the app uses, not about Chat and Code. |

---

## 7. Decisions

Taken 2026-10-20. Each one is a choice, and the reason is recorded so it is not
quietly reversed later.

| # | Decision | Reason |
|---|---|---|
| **D1** | **Each side keeps its own open thread.** Flipping Chat ⇄ Code shows that side's last open thread, or an empty composer if it has none. The other side's thread is untouched. | Claude Desktop. "A Chat is not a Code session, so opening one must not close the other" (mock `:1303`). |
| **D2** | **Two separate stores.** `tavi.chats.v1` and `tavi.code-sessions.v1`, two types, two caps. | Claude keeps `local-agent-mode-sessions/` and `claude-code-sessions/` apart; the mock says "separate objects, not one list filtered by mode" (`:263`). |
| **D3** | **The existing threads are deleted.** They were test data; no migration. **Both key spellings go** — `tavi.sessions.v1` and `ai-app.sessions.v1` — because `readStorage` would otherwise move the legacy one back. | The maintainer's call, plus the migration trap in §3.4. |
| **D4** | **Model and effort are remembered per side.** Chat keeps its own, Code keeps its own; "New chat" and "New session" keep that side's; a thread still records what it used, and opening it restores that. | Claude: "each user's next conversation starts on the model they last used"; "The session continues on the model it was using." |
| **D5** | **One composer, two animated regions.** The morph does not change. | The maintainer's call, and the mock's structure (`:888-891`). What changes is that the shared chrome is bound to the active side's values. |
| **D6** | **Switching variants while a reply is streaming aborts it** and keeps the partial reply, marked stopped. | One composer, one stream. Parallel streams need a per-thread runtime, which is a much larger change; recorded in §6. |
| **D7** | **The Chat surface gets its own system instruction**, and no tools — enforced in the server, not only hidden in the composer. | `Plan_master.md` §10.2, and Claude's "enforced in the app's main process, not just hidden in the UI". |
| **D8** | **The agent mode (Edit / Plan / Ask) and the folder are Code-only**, living on the session record. The default mode for a new session is remembered **per folder**. | A chat has no repository and no permission model. Claude remembers a permission mode per folder; Plan applies to the session only. |
| **D9** | **A folder's identity is a generated id, not its directory name.** The session records the id and the display name separately. | Two folders with the same directory name currently collide: the second pick overwrites the first's handle and the Code rail merges their sessions. Claude's project identity is the directory path. The grouping becomes permanent once the two surfaces are apart, so it has to be right. |
| **D10** | **The switch stays in the rail**, not in the composer. | Claude puts Chat-vs-Cowork in the message box because they are the same job, and makes Code a tab because a code session owns a folder and a working tree. Ours is a tab-equivalent switch, so app chrome is the right place. |

---

## 8. Edge cases

| Case | Rule |
|---|---|
| Switch while streaming | Abort, keep the partial reply, mark it stopped (D6). |
| Switch while the composer has text | The draft belongs to the side it was typed in. The block swaps it explicitly; `draftKey` alone is not enough (B10). |
| Switch while the composer has attachments | Same rule. Attachments belong to the side they were added in. |
| Open a thread | The variant moves to that thread's side. |
| Delete the open thread | That side opens empty. The other side is untouched. |
| Delete a thread from the rail's context menu | Removes it from its own store only. |
| Fork | Stays on its side, in the same store, and is not opened. |
| Rename from the rail | The composer's sessions menu refreshes. |
| Pin | Per store. A pinned thread rises to the top of the list in both surfaces. |
| Storage quota | Each store has its own cap and its own drop-the-oldest fallback. |
| Reload the app | Both sides open empty, as the app opens in Chat today. Restoring the last open thread per side is future work (§6). |
| Tray "New chat" / "New session" | Switches to that side and starts a new thread there, draining any queued intent. |
| A queued tray intent | Drained by every "new thread" path, including the rail's. |
| A folder is renamed on disk | Its id does not change, so the session stays attached; the group heading is refreshed from the recents list. |
| Two folders with the same name | Two ids, two groups, two sets of sessions (D9). |
| The old `tavi.sessions.v1` / `ai-app.sessions.v1` keys | Deleted once, at startup, and never read again (D3). |

---

## 9. Bugs found on the way

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
| **B9** | **A folder's identity is its directory name.** `RecentFolder.id` and `.name` are both `handle.name`, and the IndexedDB handle store is keyed by it. Two folders with the same directory name are the same folder to this app: the second pick **overwrites the first's handle**, and the Code rail merges their sessions into one group. | `fs-access.ts:60-64`, `:112`, `:115` | **High**, and it becomes permanent once the grouping is permanent. Fixed by D9. |
| **B10** | **Changing the draft key leaks the draft sideways.** `PromptInput` restores from `draftKey` in one effect and writes to `draftKey` in the next. On a key change the write effect runs with the *old* text and the *new* key, so the outgoing side's text is written over the incoming side's saved draft. | `prompt-input.tsx:293-301` | Medium — and the split would trip it immediately. |
| **B11** | **The composer's attachments, mentions and queued messages are shared** between the two surfaces, in the `PromptInput` context. | `prompt-input.tsx:255-256`, `:282` | Medium |
| **B12** | **The context dial shows the wrong thread's usage after a switch.** `usage` is one piece of state, reset on open and on new, and it is not stored on the thread — so the dial's numbers belong to whichever thread answered last, not to the one on screen. Claude's rule is "context usage is per session". | `prompt-block.tsx:897`, `:1589-1596` | Medium |

---

## 10. What changed in revision 2

| Change | Why |
|---|---|
| **The draft swap is now explicit and owned by the app** (§4.4, §5 Stage 2), instead of "change the draft key". | B10: changing the key alone overwrites the other side's draft. The `PromptInput` root supports a controlled `value`, so the block can own the text. |
| **Attachments, mentions and the queue are called out as per-side state** (§3.2, §4.5). | B11: they live in the shared `PromptInput` context and leak today. |
| **A folder gets a real identity** — D9, and Stage 1. | B9: the folder's id *is* its directory name, so same-named folders collide and merge. The grouping becomes permanent under D2, so it has to be right first. |
| **The old store's deletion now covers both key spellings** — D3, §3.4. | `readStorage` moves the legacy `ai-app.sessions.v1` across on read, so deleting only the current spelling would resurrect it. |
| **The account row is recorded as correctly global.** | Revision 1 listed it as a gap because the mock has one per mode. The mock's values were placeholder data; there is one provider connection and one plan tier. |
| **The context dial's usage is per thread** (§4.3, B12). | Claude: "context usage is per session". |
| **The agent mode's default is remembered per folder** — D8. | Claude remembers a permission mode per folder; Plan applies to the session only. |
| **The switch's placement is now argued, not assumed** — D10. | Claude puts Chat-vs-Cowork in the message box (same job) and makes Code a tab (different job). Ours is a tab-equivalent, so the rail is the right place. |
| **The reference table gained the storage layout, the enforcement rule, the session-row metadata and the per-folder mode memory.** | Claude's `local-agent-mode-sessions/` vs `claude-code-sessions/`, "enforced in the app's main process, not just hidden in the UI", the git branch on a session row, and `~/.claude/projects/<project>/`. |
| **New decisions D9 and D10; new bugs B9–B12; new edge cases.** | |
| **§4.2 explains why we do *not* store one store per project,** even though Claude does. | `localStorage` has no directories and a session's folder can change. A `folder` field is the honest equivalent. |

---

## 11. Where this lands

Stage by stage, each one committed on its own, each one ending with the app
working and `pnpm typecheck` clean. The order is the one in §5, because it is
the order in which each stage can be checked by hand.

**The check for the whole plan is one sentence:** a chat never appears in the
Sessions list, a session never appears in the Chats list, and switching between
them never shows you a conversation that belongs to the other one.
