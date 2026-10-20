# Separating Chat from Code

**Status:** plan, revision 4. **The seven stages are built**, and the two
cross-surface bugs the split introduces are fixed.
**Decided by:** the maintainer, 2026-10-20. The decisions are recorded in §7 and are
not to be reopened without saying so here first.
**Why this document exists:** the app has a Chat surface and a Code surface, and
they are two views of one thing. This is the plan to make them two things.

> **Revision 4** fixed the bug the maintainer reported: a conversation could
> cross from one surface to the other. It also closed the last four gaps against
> the plan, and made the rules executable — the store, the migrations, the
> system prompt and the two write rules are now tests rather than comments.
> §10 lists every change.

> **Revision 3** re-checked every claim against the code, against the repo's own
> documents — the mock, the master plan, the storage strategy and the README —
> and against Claude Desktop's current documentation. It corrected seven things
> that were wrong, found seven more problems, and added §1.1, which says what
> each of those documents does and does not authorise. §10 lists every change.

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

**What the mock did *not* make per-mode**, and revision 1 got slightly wrong:
the mock's `model`, `effort`, `mode` and `folder` were single values
(`shell-layout.html:1295-1298`), shared by both sides. The mock's per-mode set
was the *conversation* and the *rail*. D4 — the model and the effort remembered
per side — goes beyond the mock. It is the maintainer's decision, and it matches
Claude Desktop's "each user's next conversation starts on the model they last
used", with the two surfaces being separate places. `Plan_master.md:481` also
supports the thread half of it — "Conversation state (messages, metadata,
attachments, **selected model for a conversation if applicable**)" — and
`:982` puts the *preferred* model in preference state, which is where a
remembered per-side default belongs.

### 1.1 What the repo's documents do and do not authorise

This matters, because the plan is not self-justifying and the three documents
in `docs/` disagree about what they are talking about.

| Document | What it has authority over | What it says about Chat vs Code |
|---|---|---|
| `docs/mock/shell-layout.html` | The **shape** of the shell — the two rails, the two conversations, the two composers | Directly. It *is* the design: two rails, separate objects, per-side conversations (§1) |
| `docs/plan/Plan_master.md` | The **request level** — tools, permissions, modes, security, acceptance criteria | **Nothing about surfaces.** An exhaustive search of all 1,649 lines finds no occurrence of *rail*, *sidebar*, *thread list*, *Projects*, *Code mode* or *composer layout*. Its "Chat and Agent modes" are a **tool-policy axis**, not two places in the app. |
| `docs/storage.md` | **Where data lives** | Says one thread store, one key, global model/effort (§11 lists what changes) |
| `README.md` | **What is true today** | Says the two rail lists are "kept separate rather than merged" (`README:484-490`), and that the rail is grouped by project (`README:499-505`) |

**The axis collision, stated plainly.** `Plan_master.md` §10.2 says:

> **Chat mode:** should behave like ordinary conversation. … application tools are
> not enabled by default in Chat mode.

That "Chat mode" is the plan's *request-level* mode, and it maps to the app's
**agent mode** (`edit`/`plan`/`ask`, `PREF.mode`) — **not** to our Chat
*surface*. The plan happens to want the same behaviour for both, so the
requirement lands correctly, but the plan does not know about the surface and
does not authorise it. §2.2's use of §10.2 is right in substance; this is the
axis it rests on.

**Two places where the master plan constrains this work rather than supporting
it**, and the plan has to answer both:

| Constraint | Where | The answer |
|---|---|---|
| "Keep [persistence] deferred unless the repository already implements it or the user approves it as a current requirement" | `:987-991` | The repository **does** implement it. Stage 1 changes its shape, which is a schema change, and D3 is the maintainer's decision on the old data. |
| "If persistence is later added, it requires an explicit schema, **migration strategy, deletion policy, backup/export policy, and a privacy review** for local file content and tool outputs" · R19 | `:991`, `:1481` | The split adds a second schema, so it needs the same five things said out loud. The schema is §4.2, the **deletion policy** is D3, the **migration** is D3's "both spellings go", the **backup/export** policy is Stage 7, and the privacy review is unchanged because the content is the same kind of content. |
| "Switching modes during an active run has a documented and safe rule" | `:1409` | D6 is that rule, and it matches the plan's own stream rules: "Preserve already received assistant text … but label the run as cancelled/interrupted" (`:725`, and `:492`). |

**So the authority for this plan is: the mock (the shape), the maintainer's
decision (the split itself), Claude Desktop (the precedent), and
`Plan_master.md` (the request-level rules the result must satisfy).** The
master plan does not know the surfaces exist, and this plan fills a gap it
leaves open rather than contradicting it.

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

**That "Chat mode" is the master plan's own request-level mode, not our Chat
surface** — see §1.1. The rule lands on the right behaviour either way, because
the plan wants the same thing from a chat that we want from ours: no silent
filesystem access.

---

## 3. Where we are today

Every row below is verified against the code. Where a change has already landed,
the line says so.

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
| Row | `:337-367` | Title + timestamp, plus a live pulsing dot and the word "Running" on the thread that is answering right now. One line, the same 28px as the destination rows above it | ✅ || "New" row | `:407-409` | Calls `bridge.functions.current?.reset()` directly — **not** `useNewThread`. Does not set the variant, does not drain a queued tray intent | ❌ |
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
| **The server takes the system prompt verbatim.** `system` is read from the body and handed to the model unchanged (`server/chat.ts:57`, `:121`). | `server/chat.ts` |
| **So the server cannot enforce the chat/code rule as revision 2 planned it.** A `variant` field lets the server refuse *tools* in a chat request, but the prose that says "you are helping with a real local repository" still arrives from the client and would still be sent. **The server has to own the system prompt** — see Stage 4. | `server/chat.ts:121`; `prompt-block.tsx:1229` |

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
| 5 | Rail row click (`sidebar-nav.tsx:412`) | **No** | Opens a session while staying in the Chat composer |

Three of the five set the variant; two do not. The two that do it correctly
(`useNewThread`, `thread-bridge.tsx:78-94`) are also the only ones that drain a
pending tray intent.

> **The composer's own sessions menu is gone.** It used to be a sixth and
> seventh entry point — a "New chat" item and a row of threads inside the Code
> composer's footer — and it was a second view of the same list the rail draws.
> It was removed on 2026-10-20; the rail now carries what it carried, and the
> running indicator came with it (§3.1).

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

| Shared element | Before | Now |
|---|---|---|
| `PromptInput` context | one | one — but its **text, files, mentions and queue** are per side |
| `composerModel` | one element, bound to one `model`/`effort` | one element, bound to the **active side's** model and effort. Still rendered in both regions, so the morph still carries it across |
| `contextDial` | one element, one `usage` | one element; the usage belongs to the thread being shown, and is read from that thread's record |
| `context.textareaRef` | one slot, two textareas | unchanged — the dance in `prompt-input.tsx:698-724` already handles it |
| Draft | one slot, and the swap was wrong (B10) | one slot per side, owned by the app and swapped explicitly |
| `PromptInputSelect` (Mode / Environment / Folder) | Code only | Code only — and Code-only *state*, so a chat can never inherit a folder |
| `PromptInputMeter` | Chat only | Chat only |

**How the composer was made to keep two of everything.** The content is now
something the app owns rather than something the composer keeps:
`PromptInput` takes the text, the files, the mentions and the queue in, and
reports every change back. The alternative — remounting the composer on a
switch — would have thrown the morph away, because the regions are animated by
an `AnimatePresence` that only animates a region it has already mounted. So
the context is still one, and the *contents* of it are the app's.

---

## 5. The work, stage by stage

Each stage ends with the app working and `pnpm typecheck` clean. They are
ordered so the visible behaviour improves at every step.

### Stage 1 — Two stores, and a folder that knows its own name

**Goal:** chats and code sessions are different objects in different places.

> **This stage is a schema change**, and the master plan asks for that to be
> said out loud (`:991`, R19 at `:1481`): an explicit schema (§4.2), a
> **deletion policy** (D3), a **migration** (D3's "both spellings go"), a
> **backup/export** policy (Stage 7) and a **privacy review** — unchanged,
> because the content is the same kind of content, in two places. The authority
> for doing it at all is the maintainer's decision recorded in §7, and the fact
> that the repository already implements persistence (`:987-991`).

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
  every entry point in §3.5 behaves the same way.
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
- **The effort reconciliation runs per side.** The effect at `:1012-1030` clears
  an effort level the selected model does not publish, rather than mapping it
  to a nearby one. With one model and one effort it had a single subject; with
  two it has one per side, and each side's remembered level is checked against
  **that side's** model — so switching to Code with an effort Opus does not
  accept clears Code's effort, and leaves Chat's alone.

**Checked by:** pick Opus in Chat, switch to Code, pick Sonnet, switch back —
Chat still says Opus. Click "New chat" in Chat — still Opus. Click "New session"
in Code — still Sonnet. Pick "Plan" in one project, start a session in another
— that one starts on the app default.

### Stage 4 — The server owns the system prompt

**Goal:** a chat is answered as a chat, and the rule cannot be bypassed.

This stage is bigger than revision 2 planned, because of the finding in §3.3: the
server takes `system` verbatim from the client, so it cannot enforce anything
about it. A `variant` field alone would let the server refuse *tools* in a chat
request while still forwarding a repository system prompt the client supplied.

So the prose moves to the server:

- **The client sends the facts, not the prose.** The body carries
  `variant: "chat" | "code"`, the agent `mode` (`edit`/`plan`/`ask`), and the
  `folderName`. It does not send `system` at all.
- **The server builds the system prompt.**
  - **Chat** gets a chat instruction — a conversation, no tools, only the text
    and the attachments that were sent with it. It says plainly that the model
    cannot read the machine, so it never implies that it read a file it did not.
  - **Code** gets the mode's instruction and, when a folder is attached, the
    folder paragraph.
- **The mode definitions move with it.** The Edit / Plan / Ask instructions
  (`prompt-block.tsx:219-263`) belong to the server now. They are shared
  vocabulary — `server/providers.ts` already imports from `src/lib/reasoning.ts`
  — so a module both sides import is the natural home. The **client** keeps the
  mode's *labels, icons and placeholder*; only the instruction text moves.
- **The server validates the variant**: an unknown one is a `400`, not a default
  (the same rule the model check already follows at `server/chat.ts:62-69`).
- **A chat request that carries tools is a `400`**, enforced where the tools are
  rehydrated (`server/chat.ts:116`). This is `Plan_master.md` §10.2 and
  Claude's "enforced in the app's main process, not just hidden in the UI".
- **The variant is written into the existing log line**; the body is never
  logged, and neither are the headers nor the key.
- The compaction request carries the same facts, so a summary is written with
  the same framing as the conversation it summarises.

**Checked by:** a chat request's system prompt says nothing about a repository;
a code request's does. A chat request carrying tools is refused. A request with
an unknown variant is refused rather than defaulted.

### Stage 5 — Code-only concepts stay in Code

**Goal:** nothing that belongs to Code can reach a chat.

- The folder and the mode are not global. They live on the session record, and
  the composer reads them from the session it has open.
- `newSession` clears everything it should and nothing it should not: a new chat
  has no folder and no mode; a new session keeps the folder the composer is
  pointed at and takes that folder's remembered mode.
  **This is a change from what this document originally said**, which was that
  a new session starts with no folder. The reason is the line below: a mode
  remembered per folder is unreachable if every new session throws its folder
  away, because there would be no folder to remember it against. It is also
  what Claude Desktop does — the environment and the project folder are
  controls in the composer, and they persist across sessions, because somebody
  working in a repository does not want to pick it again for every session.
  A session still records the folder it was run against, and opening a session
  shows that folder rather than the last one.
- The `@` menu, the file inlining (`expandUserTurn`, `:698-731`) and the code
  starters only ever run in Code. **The inlining is gated by the surface, not
  only by the folder being absent**: `expandUserTurn` resolves `@path`
  references against `projectFiles`, so while the folder is still global a chat
  would carry repository file contents in its message text.
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
  nothing at all in Code. It is **one muted line**, not the vendored `Empty`
  block: `Empty` carries an icon, a description and a border, and the mock is
  explicit that the app's empty state is "a bare heading, not an Empty block: no
  icon, no description, no border" (`shell-layout.html:825-829`).
- The conversation's empty state is per side: Chat asks a different question
  than Code. ("What are we working on?" is a code question.) It stays a bare
  heading, for the reason above.
- **The rail row shows nothing but the title.** An earlier draft put the model
  that answered the thread under it, on the argument that it was the one piece
  of metadata the composer's sessions menu carried and the rail did not. The
  maintainer does not want it: the rail is a list of places to go, and a row that
  says which model answered it is a row answering a question nobody asked. The
  thread still records the model it was run with — that is in the record, and
  opening the thread restores it — but the list does not say it.
- **A thread row is the same height as a destination row.** One line, 28px, the
  same as New, Projects, Artifacts, Scheduled and Customize above it. The rail
  is one list of rows and a row that is taller than the rest of its own list
  reads as something else in the list.
- The pin indicator is visible, not only felt through ordering.
- The Rename dialog's copy stops promising "the composer's own session list",
  which the composer does not have and never again will.
- The group order in Code follows the sort the user chose, not insertion order.
- Pinned threads rise to the top of the list they are in: the top of the list
  in Chat, and the top of their project group in Code — where the group
  heading is above it, and a pinned session cannot be above its own project
  without the grouping being a lie.
- **The switch says which surface you are on and nothing else.** An earlier
  draft gave each side a count of the chats and the sessions behind it, so the
  rail would say what was on the other side before you took it. The maintainer
  does not want it: the switch answers a question nobody asked it, and it made
  the control the only thing in the rail that was not a row. The counts live in
  the rail, where the lists are.

### Stage 7 — Documentation, and the dead code

- `docs/storage.md` — the parts that change:
  - **The decision-rule table** (`:13-19`): one "Conversation threads" row
    becomes two — chats and code sessions, two keys, two caps.
  - **Preferences** (`:28-38`): model and effort become per side; the mode's
    default becomes per folder; and the row becomes four keys, not one.
  - **What is deliberately not stored** (`:52-63`): the passage about the
    composer layout surviving unchanged is the strongest existing statement
    about the two surfaces — it says it plainly — but the sentence about "the
    model, the effort and the mode" conflates *how you work* with *which of the
    two jobs you came to do*, and has to be split for D4 to read correctly.
  - **Conversation threads** (`:84-95`): one section becomes two, with two
    shapes, two caps and two retention policies.
  - **The namespace** (`:40-50`): gains the one thing the legacy-migration rule
    does not cover — the old thread key is *deleted*, not moved, and both
    spellings go. That is the one exception to "a value is moved, never lost",
    and the rule has to say so.
  - **Folder handles** (`:99-114`): the metadata line says "folder name"; after
    D9 it says a generated id plus a display name, and the section says what
    happens when two folders share a name.
  - **A new row for the composer draft** (`:13-19`): the key
    `prompt-draft:<key>` is not documented anywhere today, and after Stage 2
    there are two of them.
  - **Eviction** (`:75-80`): restated per store — two stores are twice the
    exposure.
  - **The desktop upgrade story** (`:218-230`): item 1's "move threads and
    preferences to an app-data file" now has to say whether that is two files or
    one file with two collections; item 2's export/import covers two stores;
    item 3's cap is two caps; item 4's "no migration path yet" is now D3.
- `README.md` — a section on the two surfaces, what each one is, what each one
  owns, and the per-side model/effort memory. Three passages there are also
  wrong today and are fixed while it is being touched: `:421-423` has a
  duplicated line, `:644-647` still says the prompt-input block "is not wired
  up… Kept for reference" when it is the app, and `:85` cites
  `Plan_master.md` §9.2 for the key-in-memory risk when that rule is §15.3.
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
| The command palette | Not built, and confirmed not mounted: `src/components/command/command.tsx` exports `CommandDialog` and nothing imports it. When it is built, it must list the active side's threads only (mock `:1146`). |
| Search over threads | Claude's session picker has it. It would need to search one store at a time. |
| Archive | Deliberately absent today (README). It needs somewhere to read archived threads and a way back out, which would be a third state per store. |
| Diff, terminal, file and browser panes for Code | Claude's Code tab is built around them. A much larger piece of work than the split itself. |
| Chat tools | D7 forbids them. When they arrive, the server is where that is enforced. |
| Side chats | Claude's side chat reads a session's context and adds nothing back, and is not saved to disk. A future idea for Code. |
| Bringing the assistant-ui stack to life | B2. A decision about which runtime the app uses, not about Chat and Code. |

### 6.1 The mock's own bugs — do not carry these across

The mock is the design, but it was written quickly and it has mistakes of its
own. None of these is intent:

| Mock artefact | Where | Why it is wrong |
|---|---|---|
| The palette's action is labelled "New chat" in **both** modes, but it resets the *current* mode's conversation | `shell-layout.html:1180` vs `:1340-1349` | In Code it should say "New session". |
| The palette shows a timestamp as a keyboard shortcut — "Ctrl 4m" | `:1172` | Mock sloppiness. |
| The app bar's title falls back to "New chat", and its folder badge to "no folder", in Code too | `:1435-1436` | Mode-agnostic labels. |
| The account row's per-mode values differ only in case — "Tavi" vs "tavi" — with badges "local" and "main" | `:286`, `:304` | Decorative placeholders. The app's real row shows the machine and the provider key's tier, which are genuinely global. |
| `PromptInputDictation` with `autoSend: true` | `:1049`, `:1118` | The app does not auto-send. |
| The mock passes no `draftKey` at all | `:1009-1022` | The app does, and it is shared between the two sides. |
| The list is called "Recents" | `:621-659` | The app calls it "Chats" and "Sessions"; Claude calls its chat list "recent chats". Three names for one thing — the app's is the one that shipped, so it stays. |

---

## 7. Decisions

Taken 2026-10-20. Each one is a choice, and the reason is recorded so it is not
quietly reversed later.

| # | Decision | Reason |
|---|---|---|
| **D1** | **Each side keeps its own open thread.** Flipping Chat ⇄ Code shows that side's last open thread, or an empty composer if it has none. The other side's thread is untouched. | Claude Desktop. "A Chat is not a Code session, so opening one must not close the other" (mock `:1303`). |
| **D2** | **Two separate stores.** `tavi.chats.v1` and `tavi.code-sessions.v1`, two types, two caps. | Claude keeps `local-agent-mode-sessions/` and `claude-code-sessions/` apart; the mock says "separate objects, not one list filtered by mode" (`:263`). |
| **D3** | **The existing threads are deleted.** They were test data; no migration. **Both key spellings go** — `tavi.sessions.v1` and `ai-app.sessions.v1` — because `readStorage` would otherwise move the legacy one back. | The maintainer's call, plus the migration trap in §3.4. |
| **D4** | **Model and effort are remembered per side.** Chat keeps its own, Code keeps its own; "New chat" and "New session" keep that side's; a thread still records what it used, and opening it restores that. | Claude: "each user's next conversation starts on the model they last used"; "The session continues on the model it was using." `Plan_master.md:481` supports the thread half, and `:982` puts the *preferred* model in preference state — which is where a per-side default belongs. The mock did **not** do this (§1). |
| **D5** | **One composer, two animated regions.** The morph does not change. | The maintainer's call, and the mock's structure (`:888-891`). What changes is that the shared chrome is bound to the active side's values. |
| **D6** | **Switching variants while a reply is streaming aborts it** and keeps the partial reply, marked stopped. | One composer, one stream. Parallel streams need a per-thread runtime, which is a much larger change; recorded in §6. |
| **D7** | **The server owns the system prompt.** The client sends the facts — the variant, the agent mode, the folder name — and the server writes the prose. A chat gets a chat instruction; a chat request that carries tools is refused. | `Plan_master.md` §10.2, and Claude's "enforced in the app's main process, not just hidden in the UI". It also has to be this way: the server takes `system` verbatim today, so it cannot enforce anything about a prompt it did not write. |
| **D8** | **The agent mode (Edit / Plan / Ask) and the folder are Code-only**, living on the session record. The default mode for a new session is remembered **per folder**. | A chat has no repository and no permission model. Claude remembers a permission mode per folder; Plan applies to the session only. |
| **D9** | **A folder's identity is a generated id, not its directory name.** The session records the id and the display name separately. | Two folders with the same directory name currently collide: the second pick overwrites the first's handle and the Code rail merges their sessions. Claude's project identity is the directory path. The grouping becomes permanent once the two surfaces are apart, so it has to be right. |
| **D10** | **The switch stays in the rail**, not in the composer. | Claude puts Chat-vs-Cowork in the message box because they are the same job, and makes Code a tab because a code session owns a folder and a working tree. Ours is a tab-equivalent switch, so app chrome is the right place. |
| **D11** | **A turn's thread is decided when the turn is sent**, and carried through to the reply's write. | The composer can change while a reply is on its way — the user can press "New", or switch to the other surface. Reading the composer's state at the moment of the write is what produced two threads with the same conversation in them (B20). |
| **D12** | **A reply that arrives late does not touch the composer.** It is kept on the thread it was asked on; the composer is left showing whatever it is showing now. | Otherwise one side's conversation ends up under the other side's composer, and the next message there saves it as a thread of the wrong kind (B20). |
| **D13** | **A thread row in the rail shows the title and nothing else, and is the same height as a destination row.** | The maintainer's decision, against the earlier draft in this document. The rail is a list of places to go; a row that says which model answered it answers a question nobody asked, and a row taller than the rest of its own list reads as something else in the list. The thread still records the model it was run with — that is what the record is for — but the list does not say it. |
| **D14** | **The Chat/Code switch carries no counts.** It says which surface you are on, and nothing else. | The maintainer's decision, against the earlier draft in this document. The switch answers a question nobody asked it, and a count on it made it the only control in the rail that was not a row. The counts live in the rail, where the lists are. `IconSwitch` is therefore left exactly as it was: the shared component takes no badge, so nothing about one of its two users can leak into the other. |

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
| Rename from the rail | The rail's row redraws itself — it reads the store and the store's change signal. |
| Pin | Per store. A pinned thread rises to the top of the list in both surfaces. |
| Storage quota | Each store has its own cap and its own drop-the-oldest fallback. |
| Reload the app | Both sides open empty, as the app opens in Chat today. Restoring the last open thread per side is future work (§6). |
| Tray "New chat" / "New session" | Switches to that side and starts a new thread there, draining any queued intent. |
| A queued tray intent | Drained by every "new thread" path, including the rail's. |
| **A reply arrives after the user switched surfaces** | It is kept on the thread it was asked on, and it does not touch the composer (D12). The side now showing keeps its own conversation. |
| **A reply arrives after the user pressed "New"** | It is kept on the thread it was asked on, and it does not refill the composer (D12). "New" means a blank composer. |
| **A reply arrives after the user deleted the thread it belongs to** | The write recreates it — a thread that is written to exists afterwards. |
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
| **B4** | **The composer's sessions menu did not subscribe to the store's change signal**, so a rename, pin, fork or delete done in the rail did not appear in it. | `prompt-block.tsx:918` (before removal) | **Resolved** — the menu is gone, and the rail, which is the only list, reads the store and subscribes to the signal. |
| **B5** | The rail's sort reorders the threads inside a project group but not the groups themselves. | `sidebar-nav.tsx:449` | Low |
| **B6** | `servedModel` is written and never read; `createSession` is imported and never used; `c = pick(2)` is computed and never used; five exported composer primitives are used nowhere. | `prompt-block.tsx:899`, `:43`, `:529`; `prompt-controls.tsx:55`, `:120`, `:171`, `:610`, `:655` | Low |
| **B7** | A comment describes a dictation overlay that no longer exists. | `prompt-block.tsx:1711-1717` vs `prompt-controls.tsx:1689-1698` | Low |
| **B8** | The Rename dialog promises the name appears "in the rail and in the composer's own session list" — and the second half is **true today**, because the composer's menu lists every thread. It becomes false the moment the stores are split, because the menu is Code-only. Not a pre-existing bug; a **consequence** of the split that Stage 6 has to catch. | `thread-context-menu.tsx:184-186` | Low, and only after Stage 1 |
| **B9** | **A folder's identity is its directory name.** `RecentFolder.id` and `.name` are both `handle.name`, and the IndexedDB handle store is keyed by it. Two folders with the same directory name are the same folder to this app: the second pick **overwrites the first's handle**, and the Code rail merges their sessions into one group. | `fs-access.ts:60-64`, `:112`, `:115` | **High**, and it becomes permanent once the grouping is permanent. Fixed by D9. |
| **B10** | **Changing the draft key leaks the draft sideways.** `PromptInput` restores from `draftKey` in one effect and writes to `draftKey` in the next. On a key change the write effect runs with the *old* text and the *new* key, so the outgoing side's text is written over the incoming side's saved draft. | `prompt-input.tsx:293-301` | Medium — and the split would trip it immediately. |
| **B11** | **The composer's attachments, mentions and queued messages are shared** between the two surfaces, in the `PromptInput` context. | `prompt-input.tsx:255-256`, `:282` | Medium |
| **B12** | **The context dial shows the wrong thread's usage after a switch.** `usage` is one piece of state, reset on open and on new, and it is not stored on the thread — so the dial's numbers belong to whichever thread answered last, not to the one on screen. Claude's rule is "context usage is per session". | `prompt-block.tsx:897`, `:1589-1596` | Medium |
| **B13** | **The server cannot enforce the chat/code rule as planned, because it takes `system` verbatim.** The prose that says "you are helping with a real local repository" arrives from the client and is forwarded unchanged. A `variant` field lets the server refuse *tools* in a chat request; it does not stop the wrong prompt. **The server has to own the system prompt.** | `server/chat.ts:57`, `:121`; `prompt-block.tsx:1229` | **High** — fixed by Stage 4 |
| **B14** | **The chat route is network-reachable and unauthenticated.** `server.listen(PORT)` binds every interface, and only `/api/projects/clone` is loopback-guarded — and `isLoopback` even accepts an empty remote address. A new "a chat carries no tools ⇒ 400" rule therefore lands on an open route, where anyone can post a request with tools under a `variant: "code"`. | `server/chat.ts:307`, `:163-171`, `:208-212` | Medium–High. The route should bind loopback, or the rule needs a defence that does not depend on the caller being honest. |
| **B15** | **The model id is never validated against the catalogue on the chat route.** `modelCapabilities` is consulted only to gate reasoning serialisation, and `openrouter(modelName)` is called with whatever string arrived, so an unknown id reaches the provider and fails there. | `server/chat.ts:120` vs `server/models.ts:158-163` | Low |
| **B16** | **The tray's pending-intent slot holds one intent.** `PENDING` is a `Mutex<Option<Intent>>`, so a "New chat" followed quickly by a "New session" before the webview takes it drops the first. | `src-tauri/src/tray.rs:56`, `:151` | Low |
| **B17** | **A restored thread carries less context than the original request.** Attachment text is inlined at up to 400 KB but truncated to 20 000 characters on store, and the `@`-mentioned folder files are not stored at all — only their paths — so a restored Code session loses its file context unless the folder is re-granted. | `prompt-block.tsx:750` vs `:615-630`, `:758-761` | Low, pre-existing |
| **B18** | **"New session" already means something else.** The app menu's View ▸ Split view has "New session on right" and "New session below" — a split pane, not a Code session. A File ▸ New session has to be distinguishable from them. | `app-menu.tsx:100-101` | Low |
| **B19** | **The README contradicts itself about tools.** `:618-619` says "Agent mode has no tool execution. Modes change the system prompt only", while `:343-385` documents five working tools and `DesktopToolGate` as live. And `:644-647` says the prompt-input block "is not wired up… Kept for reference" when it is the app surface. | `README.md:618-619` vs `:343-385`; `README.md:644-647` | Medium — the docs are quoted in review, so they have to be right |
| **B20** | **A conversation could cross from one surface to the other.** A reply that arrived after the user had switched surfaces, or pressed "New", was still written into the composer — which was by then showing the *other* side. The next message there took the other side's conversation along with it and saved it as a thread of the wrong kind: a chat that also produced a session with the chat's conversation in it. Two things caused it: the write read the thread id from the composer's state *after* an await, so a thread closed in the meantime read as no thread and a second one was made; and a late reply overwrote *which thread the composer had open*, so the next message found no thread and made another. | `prompt-block.tsx` — `persist` and the stream's settle handler | **High** — it is what the maintainer reported. Fixed by D11 and D12, and checked by `src/blocks/prompt-input/thread-writes.test.ts` |

---

## 10. What changed, and why

### 10.1 Revision 3 — after the full document and code audit

| Change | Why |
|---|---|
| **The server owns the system prompt** (Stage 4, D7, B13). The client sends the facts — variant, mode, folder name — and the server writes the prose. | The server takes `system` verbatim from the client, so it cannot enforce anything about a prompt it did not write. Revision 2's plan — a `variant` field plus a tools check — would have left the repository system prompt arriving from the client and being forwarded. |
| **A new §1.1 says what each document in `docs/` has authority over**, and states the axis collision: the master plan's "Chat mode" is its request-level tool policy, **not** our Chat surface. The master plan contains no notion of a rail, a thread list or two surfaces at all. | Without this the plan quietly leans on a document that does not contain the thing. It also records where the master plan *constrains* the work (§16.2, R19, `:1409`) and how the plan answers each. |
| **The mode's instruction text moves to the server**; the client keeps the labels, icons and placeholder. | A rule that can be bypassed by the client is not a rule. |
| **`expandUserTurn` is gated by the surface**, not only by the folder being absent. | It resolves `@path` references against `projectFiles`, so while the folder is global a chat would carry repository file contents in its message text. |
| **The rail row shows the model** — restated as *the rail row*, because the composer's sessions menu already shows it (`prompt-block.tsx:342-343`). | Revision 2 implied neither did. |
| **B8 reclassified**: the Rename dialog's promise is true today and becomes false *because of* the split. | It is a consequence, not a pre-existing bug, and Stage 6 has to catch it. |
| **Stage 7 now names twelve passages in `docs/storage.md`** rather than three, including the composer draft key — which is documented nowhere today — and the app-data file question. | The document says "a single JSON array" and "one key"; a split has to answer all of it. |
| **§6.1 lists the mock's own bugs**, so the implementer does not copy them. | The mock labels its palette action "New chat" in both modes, shows a timestamp as a keyboard shortcut, and gives the account row per-mode values that differ only in case. |
| **The empty states are a bare heading and a plain line, not the vendored `Empty` block.** | The mock is explicit: "The app's empty state is a bare heading, not an Empty block: no icon, no description, no border" (`shell-layout.html:825-829`). |
| **New bugs B13–B19**, including the open chat route (B14), which the new server rule depends on. | Found by the audit of `server/`, `src-tauri/src/tray.rs` and the README. |
| **B20 found by the maintainer: a conversation could cross from one surface to the other.** Fixed by D11 and D12, and by two rules made pure and testable in `src/blocks/prompt-input/thread-writes.ts`. | The write read the thread id from the composer's state *after* an await, and a late reply overwrote which thread the composer had open. Both let one side's conversation end up under the other side's composer, and the next message there saved it as a thread of the wrong kind. |
| **The rail row grew a second line showing the model, and the row became taller than the rows above it.** The maintainer asked for it to be removed and for the row to be the same height as the destination rows. Fixed by D13. | The model is in the record and is restored when the thread is opened; the list does not need to say it. |
| **The Chat/Code switch grew a count of the chats and the sessions behind each side.** The maintainer asked for it to be removed. Fixed by D14, and `IconSwitch` was put back exactly as it was — it takes no badge, so nothing about one of its two users can leak into the other. | The switch answers a question nobody asked it, and a count on it made it the only control in the rail that was not a row. |
| **D4** and **D8** now cite the master plan** as well as Claude and the mock. | `:481` supports a thread remembering its model; `:982` puts the preferred model in preference state, which is where a per-side default belongs. |
| **The composer's sessions menu is removed**, and the rail takes over what it carried — including the live running indicator, which the rail could not show before. §3.1, §3.5 and B4 are updated. | It was a second view of the same list the rail draws, with a "New chat" item inside the **code-only** footer that did not set the variant. Two lists of the same threads is the thing this whole plan exists to undo. |

### 10.2 Revision 2 — after the first correction pass

| Change | Why |
|---|---|
| **The draft swap is now explicit and owned by the app** (§4.4, Stage 2), instead of "change the draft key". | Changing the key alone overwrites the other side's draft. The `PromptInput` root supports a controlled `value`, so the block can own the text. |
| **Attachments, mentions and the queue are called out as per-side state** (§3.2, §4.5). | They live in the shared `PromptInput` context and leak today. |
| **A folder gets a real identity** — D9, and Stage 1. | The folder's id *is* its directory name, so same-named folders collide and merge. The grouping becomes permanent under D2, so it has to be right first. |
| **The old store's deletion now covers both key spellings** — D3, §3.4. | `readStorage` moves the legacy `ai-app.sessions.v1` across on read, so deleting only the current spelling would resurrect it. |
| **The account row is recorded as correctly global.** | Revision 1 listed it as a gap because the mock has one per mode. The mock's values were placeholder data; there is one provider connection and one plan tier. |
| **The context dial's usage is per thread** (§4.3, B12). | Claude: "context usage is per session". |
| **The agent mode's default is remembered per folder** — D8. | Claude remembers a permission mode per folder; Plan applies to the session only. |
| **The switch's placement is now argued, not assumed** — D10. | Claude puts Chat-vs-Cowork in the message box (same job) and makes Code a tab (different job). Ours is a tab-equivalent, so the rail is the right place. |
| **The reference table gained the storage layout, the enforcement rule, the session-row metadata and the per-folder mode memory.** | Claude's `local-agent-mode-sessions/` vs `claude-code-sessions/`, "enforced in the app's main process, not just hidden in the UI", the git branch on a session row, and `~/.claude/projects/<project>/`. |
| **The mock's per-mode set is narrower than revision 1 implied** — its model, effort, mode and folder were single values (§1). | D4 goes beyond the mock. It is the maintainer's decision and it matches Claude's per-surface behaviour, but the plan should say where it departs from the repo's own design. |
| **The command palette is confirmed not mounted**, not merely unused (§6). | `src/components/command/command.tsx` exports `CommandDialog` and nothing imports it. Worth knowing before a palette is planned on top of it. |
| **The switch can carry a count**, at the cost of a generic `badge` field on `IconSwitchOption` (Stage 6). | `IconSwitch` has no slot for one and is shared with the theme switch, so the field has to be generic. |
| **§4.2 explains why we do *not* store one store per project,** even though Claude does. | `localStorage` has no directories and a session's folder can change. A `folder` field is the honest equivalent. |
| **New decisions D9 and D10; new bugs B9–B12; new edge cases.** | |

### 10.3 Revision 1 — the first plan

Written from three code audits (the prompt-input block, the shell and storage
layer, and the server and rendering layer) and Claude Desktop's documentation.

---

## 11. Where this landed

Stage by stage, each one committed on its own, each one ending with the app
working and `pnpm typecheck` clean. The order is the one in §5, because it is
the order in which each stage can be checked by hand.

| Stage | Commit | What it landed |
|---|---|---|
| 1 + 2 | `0991d0c` | Two stores, two open threads, two drafts, a folder with a real identity, the one-time migrations |
| 3 + 4 | `876fb9e` | The server writes the system prompt; the mode's default is per folder; the compaction summary is sent |
| 5 + 6 | `8dcd720` | Code's things stay in Code; the small seams closed; the switch carries a count |
| 7 | `7f43e11` | The documentation, and the three stale passages in the README |
| — | `0e43526` | The last four gaps: the rail's "New" drains the tray intent, the row shows the model, a deleted thread stops being open, the group is called by the folder's current name. The rules became tests. |
| — | this | **B20**: a conversation could cross from one surface to the other. The write now decides its thread when the turn is sent, and a late reply no longer touches the composer. |

**The check for the whole plan is one sentence:** a chat never appears in the
Sessions list, a session never appears in the Chats list, and switching between
them never shows you a conversation that belongs to the other one.

It is checked, in the running app:

| Check | Result |
|---|---|
| A message sent in Chat | lands in `tavi.chats.v1`, and the chat record has no folder |
| A message sent in Code | lands in `tavi.code-sessions.v1` |
| The rail in Chat | the Chats list, and only the chats |
| The rail in Code | the Sessions list, grouped by project, and only the sessions |
| Switching Chat → Code | the Code surface: its own conversation, or an empty one |
| Switching Code → Chat | the chat's own conversation, restored |
| Chat, then Code, then Chat | one chat and one session, and no second thread with the same conversation in it |
| A reply interrupted by "New" | kept on its own thread; the composer stays blank |
| A reply interrupted by switching surfaces | kept on its own thread; the other surface's conversation is untouched |
| An attachment in Chat | does not follow you into Code |
| The old store | gone, from both namespaces |
| A request with no surface | `400 No surface selected` |
| A request with its own system prompt | `400 The system prompt is written by the server` |
| A chat carrying tools | `400 A chat cannot carry tools` |

### What is still to do

| Item | Where |
|---|---|
| Parallel sessions — several running at once, each with its own panes | §6 |
| Restoring the last open thread per side across a reload | §6 |
| The rail's per-side row order and hidden set (the Customize panel) | §6 |
| The command palette | §6 |
| Search over threads | §6 |
| Archive | §6 |
| Diff, terminal, file and browser panes for Code | §6 |
| Chat tools | §6 — and the server is where they would be enforced |
| Side chats | §6 |
| The chat route is network-reachable and unauthenticated | §9, B14 |
| The model id is not validated against the catalogue | §9, B15 |
| The tray's pending-intent slot holds one intent | §9, B16 |
| A restored thread carries less context than the original | §9, B17 |
| The README's duplicated line, its stale cross-reference, its backwards account of the composer | §9, B19 — all three fixed |
