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

### What the reference actually does

Researched from the reference app's own documentation and the format its
transcripts are written in. These are facts, not guesses:

| | What it does |
|---|---|
| **Where** | `~/.claude/projects/<project>/<session-id>.jsonl` — one file per session, named with the session's id. The project directory is the working directory's path with every non-alphanumeric character replaced by `-`. |
| **The format** | JSON Lines: one JSON object per line, not pretty-printed. Each line is a self-contained event. |
| **Append-only** | *"Claude Code writes new lines as the session progresses; nothing is rewritten or deleted."* |
| **The index** | There is **no central index**. A session is found by its file name; the list is the directory. |
| **During a stream** | *"A single assistant message may be split across multiple JSONL lines sharing the same `requestId` and `message.id`. This happens during streaming — early lines may have `stop_reason: null` and partial content, while the final line has the complete content and `stop_reason` set."* |
| **Reading a group** | The **last** line of the group is the complete one. The early ones are partial. |
| **An interrupted thing** | *"A tool that was still running when the previous process ended, for example in a crash… Claude sees the call marked as cut off before its result was recorded, and is told to check whether it took effect before running it again."* |
| **Interrupted background work** | *"shows up in the resumed transcript as a note that it didn't finish."* |
| **Crash detection** | A separate directory holds *"one small file per running session, used to detect concurrent sessions and crashes"*, cleared on the next launch. |
| **Writing** | Continuous. Suppressible entirely with an environment variable, and suppressible for one run with a flag. |
| **Retention** | Age-based. Transcripts started in the desktop app have their own age limit, separate from the rest. |
| **Plaintext** | Not encrypted at rest. *"OS file permissions are the only protection."* |

### What that means here

| Behaviour | What it means in this app |
|---|---|
| **A conversation has its own file** | Each answer in flight gets its own file, so two conversations answering at once cannot touch each other |
| **Append-only** | New text is added to the end of the file; what is already there is never rewritten |
| **A group of lines sharing an id** | The lines of one answer share its turn id, exactly as the reference's share a request id |
| **The last line is the complete one** | Every line carries the whole of the answer as it has arrived, and the last one says the answer ended |
| **Marked as cut off** | An answer that was interrupted is stored marked as one that did not finish, and the model is told so on the next turn |
| **The directory is the index** | There is no list of journals to keep in step: the folder of them *is* the list |

### What is not copied, and why

- **Their field names.** The line format is theirs and is *"internal"* and
  *"changes between versions"*. We use our own content shape and copy the
  mechanism, not the spelling.
- **Their conversation tree.** Their lines carry a `parentUuid` chain, because
  a branch is a copy of a transcript and a subagent is a sidechain. Ours are
  linear, so a turn id is enough to match on.
- **Their per-session transcripts.** Their durable conversations are *also*
  one file per session, appended to. Ours are one file for both collections,
  written as a whole — a settled decision in `docs/architecture.md`. B6 is
  about the answer in flight, and the journal is a separate thing with a
  separate lifetime, so the decision stands.

  It is worth naming, though, because it is the thing that has to change next:
  a whole-collection rewrite from the frontend's memory loses turns when two
  conversations answer at once, and the next layer of the build plan —
  several conversations at once — is exactly when that starts to bite.
- **Their crash-detection directory.** They keep a small file per running
  session, to tell a crash from a clean exit. Ours does not need one: a
  journal with no last line saying the answer ended *is* the marker.

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

---

## 13. What was built

| | Where |
|---|---|
| The journal on disk | `src-tauri/src/partials.rs` — `append_partial`, `read_partials`, `clear_partial`, `clear_partials` |
| A private directory of the app's own | `src-tauri/src/appfile.rs` — `private_dir`, `keep_private` |
| The operations, whichever build this is | `src/lib/api.ts` |
| The desktop adapter | `src/lib/desktop.ts` |
| The browser adapter | `src/lib/web.ts`, and `storageKeys` in `src/lib/storage.ts` |
| The format, the buffering and the recovery | `src/lib/partials.ts` |
| Writing the answer down as it arrives | `src/blocks/prompt-input/prompt-block.tsx` — `respondReal` |
| Telling the model an answer was cut off | the same file — `CUT_OFF` |
| Putting the answers back on launch | `src/main.tsx` — `recoverAnswers` |
| Removing the journals with the conversations | `src/blocks/shell/settings-privacy.tsx` |
| Where they live | `docs/storage.md` |

### The choices that were made along the way

- **The journal is removed only once the conversation write has succeeded.**
  A conversation write can fail — a full disk — and a journal left behind is
  the answer, recovered on the next launch. So `persist` now reports whether
  the write happened, and the journal is removed only when it did.
- **The answer is written whole, not by what is new.** Every line carries the
  whole of the answer so far, because a line the crash cut in half is then
  discarded and the line before it still has the answer. The cost is that the
  journal holds the answer several times over, and the flush rule is what
  keeps that to about eight times rather than its square: the answer is
  written again once it has grown by a kilobyte, or by an eighth of what has
  been written so far, whichever is more.
- **A slow answer is written anyway, every two seconds.** So a crash costs
  seconds rather than the whole turn.
- **The model is told.** An answer that was cut off is in the conversation as
  a partial one, and a model reading it would take it for the whole answer
  and carry on as though it had finished. So the request carries a note that
  it was cut off — which is what the reference does for an interrupted tool
  call, and for background work that did not finish.
- **The two copies are settled by length, not by time.** The journal is
  written first and the conversation second, so the journal is never behind,
  except when the answer finished and the journal was not removed before the
  app died. Comparing the lengths settles both cases without a timestamp that
  could be wrong.

### The one thing that was left for later

The journal is written by the composer, which is the only thing that holds
the stream today. When the conversation runtime arrives — the next layer of
the build plan — the runtime becomes the writer, and the composer becomes a
reader. The journal's own API does not change, so that is a change of one
call site.

Until then there is no case in which the composer is not mounted while an
answer is being written, because switching threads aborts the reply. So the
journal is complete for the app as it is, and carries forward unchanged.
