# In-flight answers

The detailed design for **B6** in [`build-plan.md`](build-plan.md): *write the
partial to disk during a stream, so a crash mid-stream does not lose the
answer.*

---

## 1. What this is

A conversation is written to disk when the user sends a message, when the
answer ends, and when it is stopped. **Nothing is written while the answer is
being written.** So the window between "the request went out" and "the answer
ended" is a window in which the answer exists only in memory — and if the app
dies in it, the answer is gone.

This closes that window. An answer in flight is written down as it arrives,
and found again on the next launch.

---

## 2. Doing it the same way

The behaviour to match, and what each part means here:

| Behaviour | What it means in this app |
|---|---|
| **A conversation has its own file** | Each answer in flight gets its own file, so two conversations answering at once cannot touch each other's |
| **Append-only** | New text is added to the end of the file; what is already there is never rewritten |
| **Durable as it arrives** | The text so far is on disk while the answer is still being written |
| **A truncated answer reads back as truncated** | It is visibly unfinished, and is not mistaken for a complete answer |
| **An index beside it** | The list of conversations stays where it is — the file of conversations — and the journal beside it holds only what is in flight |

### What is sourced, and what is inferred

Stated plainly, because the distinction matters when the design is wrong:

- **Sourced.** The research file cites, in passing, that a session's events live
  in their own file under a per-project directory, with a separate
  `sessions-index.json` beside it listing them for the sidebar — that is the
  `#51617` report, and it is a *warning* about that shared index being
  corrupted between concurrent sessions, not a design document.
- **Inferred.** That those files are JSON Lines, written by appending one event
  per line as it happens; that an assistant message accumulates in place while
  it streams; and that a message cut off mid-write reads back as what it was.
  This is widely known behaviour of that app, but the research file does not
  state it.
- **Not covered at all.** The research file is about docking, panes,
  notifications and worktrees. **It says nothing about mid-stream
  persistence**, so this design cannot be sourced from it, and nothing here
  should be read as a quotation of it.

So the *observable* behaviour to match is the table above. The *mechanism* is
ours.

---

## 3. Why the current write path cannot do this

Three facts about the code as it is:

1. **The store writes everything.** `src/lib/threads.ts` holds the whole
   collection in memory, and `write()` writes the whole collection as one
   JSON string.
2. **Rust rewrites the whole file.** `src-tauri/src/threads.rs` —
   `write_threads` takes the lock, **reads the file**, replaces **one**
   collection, writes the **whole file** back, and copies the previous file to
   `threads.json.bak` on the way.
3. **Nothing is written during a stream.** In
   `src/blocks/prompt-input/prompt-block.tsx` there are five calls to
   `persist()` — when the message is sent, when the answer ends, when it
   fails, when it is stopped, and one more on load. **Not one of them happens
   while the text is arriving.**

Two consequences:

- **Cost.** Every save rewrites both collections and copies the previous file
  aside. At fifty conversations a side, that is the whole history, every time.
- **A race.** The front-end writes the whole collection *from its own
  memory*. With two conversations answering at once, whichever saved last
  would overwrite the other's newer turns with what it had in memory. This is
  the failure the research file records as `#51617`, and it is why the journal
  below gives each conversation its own file rather than adding another write
  to the shared one.

---

## 4. The design

### 4.1 The shape

```
<app data>/partials/<threadId>.jsonl
```

One file per conversation, in a `partials` directory beside `threads.json`.
Each line is one event:

```json
{"kind":"begin","threadId":"c-mfz3k-8a2b1c","side":"chat","model":"...","startedAt":1750000000000}
{"kind":"delta","text":"The answer so far, "}
{"kind":"delta","text":"as it arrives."}
{"kind":"end","stopped":false,"usage":{"inputTokens":812,"outputTokens":47}}
```

- **One file per conversation.** Two answers in flight cannot touch each
  other's file, so there is no race to lose, and neither has to know the other
  exists.
- **Append-only.** A write adds a line. It never rewrites what is already
  there, so a write is cheap and a crash can only ever lose the last line.
- **Deleted when the answer ends.** The finished answer lives in
  `threads.json`; the journal is removed.

### 4.2 Why not in `threads.json`

`docs/architecture.md` B6: *"One file holds both collections... two files
would be two things to keep in step, and a backup of one would be a backup of
half the history."*

That decision is about **conversations**. An answer in flight is not a
conversation yet — it is a journal of one. Putting it in a file of its own:

- keeps the one-file decision **true** — the conversations are still in one
  file, and the backup is still a backup of all of them;
- makes the write cheap enough to do often, which is the whole point;
- makes the cleanup trivial — delete a file, rather than rewrite a collection
  without one record in it;
- and matches the reference behaviour, where the session's own file is the
  thing that is appended to and the list beside it is separate and small.

### 4.3 The website

The website has no app-data directory. A partial goes into browser storage
under its own key — `tavi.partial.<threadId>` — and is **replaced** rather
than appended, because a key/value store has nothing to append to.

The observable behaviour is the same; the mechanism cannot be, because the
mechanism is not available. The website's conversations are already
evictable, so a partial there is a kindness rather than a guarantee.

---

## 5. The write path

### 5.1 Front-end — the runtime, not the composer

The runtime (Layer 2 of the build plan) owns the stream, so the runtime owns
the journal.

- `appendPartial(threadId, text)` — called on each text delta, **buffered**.
- **The flush cadence.** A write per token is I/O the app does not need.
  Deltas are buffered and flushed when **500 ms** have passed **or** **2 KB**
  have accumulated, whichever comes first — and immediately when the answer
  ends, is stopped, or the view unmounts.
  - *Why 500 ms:* a crash costs at most half a second of text, and the file is
    opened and appended at most twice a second.
  - *Why 2 KB:* a long answer that streams quickly should not sit in a buffer
    waiting for the clock.
- The flush is **fire-and-forget**. A write that fails is not an error the
  user is shown: the answer is still in memory, and the finished answer is
  still written to `threads.json` at the end.

> **This is why B6 waits for Layer 2.** Today the only thing holding the
> stream is the composer, and the composer is not mounted while the user is
> looking at another conversation. A journal written by the composer would
> stop the moment the user switched away — which is exactly the case the
> journal exists for.

### 5.2 Back-end — three Rust commands

| Command | What it does |
|---|---|
| `append_partial(thread_id, line)` | Appends one line to `partials/<thread_id>.jsonl`, creating the file and the directory if needed. |
| `read_partials()` | Reads every file in `partials/`, parses each into `{ threadId, side, model, startedAt, text, stopped, usage }`, and **discards a trailing line that is not whole**. |
| `clear_partial(thread_id)` | Deletes `partials/<thread_id>.jsonl`. |

**A line that is not whole is not a fact.** A crash during a write leaves a
half-written line at the end of the file. It is discarded on read, and the
text before it is kept. A reader that tried to parse it would either fail or
invent something.

**The path is built from an id, so the id is checked.** A thread id is
generated by the app — `<prefix><base36 time>-<random>` — but it crosses a
command boundary, and a path built from an unchecked string is a path
traversal. The rule: the id must match `[a-z0-9-]{1,64}` or the command
refuses it.

**Permissions.** The directory and its files are created with the app's own
private mode — `0700`/`0600` on the platforms that have such a bit, and the
app data folder's own ACL on Windows. `appfile::write_private` already does
this for a file; a matching `private_dir` helper is needed for the directory,
because `write_atomic` creates a directory without setting its mode.

---

## 6. The recovery path

On launch, before the conversations are read:

1. `read_partials()` — the journals that survived.
2. For each one, find the conversation it belongs to.
3. **The rule.**
   - The conversation already has an assistant turn with that turn's id →
     the journal is **stale** → delete it.
   - The journal's text is **longer** than the conversation's turn → the
     journal is **more complete** → fold it into the conversation and mark the
     turn unfinished.
   - Otherwise the journal is shorter → delete it.
4. A journal whose conversation no longer exists → delete it.
5. A conversation with no journal → untouched.

**Why longer wins.** The two copies can disagree in one direction only. The
journal is written first and the conversation second, so the journal is never
behind — *except* when the answer finished, was written to the conversation,
and the journal was not yet removed, in which case the conversation is the
newer copy. Comparing the two lengths settles both cases without a timestamp
that could be wrong.

---

## 7. What an unfinished answer looks like

The stored assistant turn already carries a `stopped?: boolean` flag. A
crashed answer is stored with it set, so it renders as an answer that did not
finish — the same as one the user stopped, which from the reader's side is
what it is.

> **To confirm:** whether *"stopped by the user"* and *"the app died"* should
> be distinguishable. Reusing `stopped` is the smaller change and the honest
> rendering. A separate `incomplete` flag is more precise, and costs a field
> and a rendering rule.

---

## 8. Privacy

The three removals in **Settings → Privacy** must cover the journals, because
a journal holds the same text a conversation holds:

| Removal | What it must also do |
|---|---|
| **Delete every chat** | Remove the journals of the chats |
| **Delete every code session** | Remove the journals of the sessions |
| **Delete everything** | Remove the whole `partials` directory — and leave an empty one, so the next answer has somewhere to go |

A journal must not outlive a deletion.

---

## 9. Export

An export is the conversations. A journal is an answer that never became a
conversation, so it is not in the export — except that it is recovered first,
on launch, and becomes a conversation. An export taken while an answer is in
flight would miss that answer; the finished turn arrives in `threads.json`
moments later.

---

## 10. Tests

### Rust

- A partial is appended, read back, and the text is the whole of it.
- A line that is not whole — a crash mid-write — is discarded, and the text
  before it is kept.
- Two conversations' journals do not interfere: writing one does not change
  the other.
- `clear_partial` removes the file, and reading afterwards finds nothing.
- A thread id that is not a plain id is refused.
- The file and the directory are created with the app's own private mode.

### TypeScript

- The recovery rule: a journal shorter than the conversation's turn is
  dropped; a longer one wins.
- A journal whose conversation is gone is dropped.
- The buffer flushes at the cadence, and immediately when the answer ends.

---

## 11. The work, in order

1. **Rust** — the three commands, the id rule, the private directory, and the
   tests.
2. **TypeScript** — the adapters in `src/lib/desktop.ts` and
   `src/lib/web.ts`, and the place they take in `src/lib/api.ts`.
3. **The runtime** writes to it — Layer 2 of the build plan. *This is the
   dependency that decides the order.*
4. **The recovery** on launch.
5. **The privacy removals.**
6. **The rendering** of an unfinished answer.
7. **`docs/storage.md`** — the new directory, and the platform paths.

---

## 12. Risks

| Risk | What is done about it |
|---|---|
| Two conversations answering at once | Each has its own file. Nothing is shared. |
| A crash mid-write | The last line may be partial; it is discarded on read. |
| Disk churn | Bounded by the flush cadence, and the file is deleted when the answer ends. |
| A journal outliving its conversation | Removed on recovery, and by the privacy removals. |
| A path built from an id | The id is checked against a plain pattern before it becomes a path. |
| A journal that grows without end | One file per conversation, deleted when the answer ends. |
| The journal outliving the app's own crash | That is the point of it. |
