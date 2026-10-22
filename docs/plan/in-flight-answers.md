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
Each line carries the whole of the answer as it has arrived, and the lines of
one answer share the turn's id:

```json
{"id":"c-mfz3k-8a2b1c-assistant","role":"assistant","side":"chat","model":"...","text":"The answer so far, ","stopReason":null,"timestamp":"2026-10-22T10:30:00.000Z"}
{"id":"c-mfz3k-8a2b1c-assistant","role":"assistant","side":"chat","model":"...","text":"The answer so far, as it arrives.","stopReason":null,"timestamp":"2026-10-22T10:30:00.400Z"}
{"id":"c-mfz3k-8a2b1c-assistant","role":"assistant","side":"chat","model":"...","text":"The answer so far, as it arrives. And the end of it.","stopReason":"end_turn","timestamp":"2026-10-22T10:30:01.200Z"}
```

- **One file per conversation.** Two answers in flight cannot touch each
  other's file, so there is no race to lose, and neither has to know the other
  exists.
- **Append-only.** A write adds a line. It never rewrites what is already
  there, so a write is cheap and a crash can only ever lose the last line.
- **The last line is the whole answer.** Every line carries everything, so
  the last whole line is the answer, and a line the crash cut in half is
  discarded and the one before it still has the answer.
- **`stopReason` says how it ended.** `null` while it is being written,
  `"end_turn"` when it finished, `"stopped"` when the user stopped it.
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

### 5.1 Front-end — whoever holds the stream holds the journal

The runtime (Layer 2 of the build plan) owns the stream, so the runtime owns
the journal. Until the runtime arrives, the composer holds the stream and the
composer owns the journal — and there is no case in which the composer is
unmounted during an answer, because switching threads aborts the reply.

- `writePartial(threadId, text)` — called on each text delta, **buffered**.
- **The flush cadence.** A write per token is I/O the app does not need. The
  text is written again when the answer has grown by **at least a kilobyte**
  since the last write, **or by an eighth of what has been written so far**,
  whichever is more — and a slow answer is written anyway, every **two
  seconds**, so a crash costs seconds rather than the whole turn.
  - *Why the growing threshold:* every line carries the whole of the answer,
    so a long answer written from scratch every time would make the journal
    the square of the answer. Growing the threshold with the answer keeps the
    whole journal about eight times the size of the answer instead.
  - *Why two seconds:* the answer is usually arriving faster than that, and
    the growth rule covers it; the clock is there for the answer that trickles.
  - *Why a kilobyte at the floor:* a short answer should be written whole
    rather than in pieces.
- The write happens **immediately** when the answer ends, when it is stopped,
  and when the app goes away.
- The flush is **fire-and-forget**. A write that fails is not an error the
  user is shown: the answer is still in memory, and the finished answer is
  still written to the conversation at the end.

### 5.2 Back-end — four Rust commands

| Command | What it does |
|---|---|
| `append_partial(thread_id, line)` | Appends one line to `partials/<thread_id>.jsonl`, creating the file and the directory if needed. |
| `read_partials()` | Reads every journal in `partials/` and gives back the id and the lines, as they are on disk. |
| `clear_partial(thread_id)` | Deletes `partials/<thread_id>.jsonl`. |
| `clear_partials()` | Deletes every journal, and leaves the directory so the next answer has somewhere to go. |

**The format is the frontend's.** Rust knows where the file lives, that it is
a list of lines, and that it only grows. What a line says is decided above
that line — the same way `threads.rs` treats the records it stores, as opaque
text. So `read_partials` hands back the lines whole, and the frontend is the
one that knows a half-written line from a complete one.

**A line that is not whole is not a fact.** A crash during a write leaves a
half-written line at the end of the file. It is discarded on read, and the
text before it is kept. A reader that tried to parse it would either fail or
invent something.

**The path is built from an id, so the id is checked.** A thread id is
generated by the app — `<prefix><base36 time>-<random>` — but it crosses a
command boundary, and a path built from an unchecked string is a path
traversal. The rule: the id must be letters, digits, dashes and underscores,
at most sixty-four of them, and must not be one of the names Windows refuses
(`con`, `com1`, `lpt9`…) — a rule that is only true on some platforms is a
rule that fails in the worst place.

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
4. A journal whose conversation no longer exists → delete it. **Unless the
   conversations could not be read at all** — a store that cannot be read is
   a temporary thing, and the journal is then the only copy of the answer, so
   it is kept. A journal is only ever swept away when the app knows the
   conversation is not there.
5. A conversation with no journal → untouched.

**Why longer wins.** The two copies can disagree in one direction only. The
journal is written first and the conversation second, so the journal is never
behind — *except* when the answer finished, was written to the conversation,
and the journal was not yet removed, in which case the conversation is the
newer copy. Comparing the two lengths settles both cases without a timestamp
that could be wrong.

---

## 7. What an unfinished answer looks like

**Two things, not one.** The stored assistant turn carries two flags, because
two different things happened:

| | |
|---|---|
| `stopped?: boolean` | The user stopped it. They know that, and they did it on purpose. |
| `incomplete?: boolean` | It was cut off — the app died, or was closed, while it was being written. Nobody did that on purpose. |

A recovered answer carries the one that matches how it ended. An answer that
was cut off is marked `incomplete`, **not** `stopped`: saying "Stopped" about
an answer the app lost would be a small lie about what happened, and the app
does not tell small lies.

The rendering follows: **"Stopped"** for the one the user stopped, and
**"Cut off — this answer did not finish"** for the one that was lost.

The model is told either way, and told which: the note for a cut-off answer
says it was cut off, and the note for a stopped one says it was stopped.
Both say the answer is incomplete and must not be taken for the whole thing.

> This was open in the first draft of this plan, as a question. It is answered
> now: the two are distinguishable, and they are told apart.

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

### Rust — `src-tauri/src/partials.rs`

| | Test |
|---|---|
| ✅ | A journal holds the lines written to it, and nothing else is added. |
| ✅ | A journal only ever grows — the earlier lines are still there. |
| ✅ | Two journals do not interfere: writing one does not change the other. |
| ✅ | A journal can be removed, and removing one that was never there is not a failure. |
| ✅ | Every journal can be removed, and the directory is left for the next answer. |
| ✅ | A file that is not a journal is left out. |
| ✅ | A conversation id that is not a plain id is refused. |
| ✅ | The names Windows refuses are refused. |
| ✅ | The journal and the directory are created with the app's own private mode. |

### TypeScript — `src/lib/partials.test.ts`

| | Test |
|---|---|
| ✅ | The last line is read, and it has the whole of the answer. |
| ✅ | A line the crash cut in half is discarded, and the line before it is kept. |
| ✅ | A line that is not a line at all is skipped. |
| ✅ | An empty journal, and one of lines that are not answers, read as nothing. |
| ✅ | An answer that did not finish reads as cut off; one the user stopped reads as stopped; one that finished reads as complete. |
| ✅ | The recovery rule: a journal shorter than the conversation's turn is dropped; a longer one wins; the same length keeps the conversation. |
| ✅ | The buffer waits for a kilobyte before writing a short answer, and writes a long one less often than it is written. |
| ✅ | The recovery runs and is safe when there is nothing to put back. |

### And by running it

The whole round trip was watched working in the desktop app: a journal planted
in the app's data directory came back as a turn marked `incomplete`, with the
text it had, and the journal was gone.

---

## 11. The work, in order

| | Step | Where |
|---|---|---|
| ✅ | **Rust** — the commands, the id rule, the private directory, and the tests | `src-tauri/src/partials.rs`, `src-tauri/src/appfile.rs` |
| ✅ | **TypeScript** — the adapters and the seam | `src/lib/desktop.ts`, `src/lib/web.ts`, `src/lib/api.ts` |
| ✅ | **The composer** writes to it | `src/blocks/prompt-input/prompt-block.tsx` |
| ✅ | **The recovery** on launch | `src/main.tsx` |
| ✅ | **The privacy removals** | `src/blocks/shell/settings-privacy.tsx` |
| ✅ | **The rendering** of an unfinished answer, and the note the model gets | `src/blocks/prompt-input/prompt-block.tsx` |
| ✅ | **`docs/storage.md`** — the new directory and the platform paths | `docs/storage.md` |
| ⏳ | **The runtime** writes to it — Layer 2 of the build plan | *deferred: see below* |

**The one step that is not done, and why.** The runtime is the next layer of
the build plan and it is not built yet. Until it is, the composer holds the
stream and the composer owns the journal — and there is no case in which the
composer is unmounted during an answer, because switching threads aborts the
reply. So the journal is complete for the app as it is. When the runtime
arrives, the runtime becomes the writer and the composer becomes a reader:
**one call site moves**, and the journal's own API does not change.

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
| Telling the model an answer did not finish | the same file — `CUT_OFF` and `STOPPED` |
| Putting the answers back on launch | `src/main.tsx` — `recoverAnswers` |
| Removing the journals with the conversations | `src/blocks/shell/settings-privacy.tsx` |
| The two kinds of unfinished answer | `src/lib/threads.ts` — `stopped` and `incomplete` |
| Where they live | `docs/storage.md` |

### The choices that were made along the way

- **The journal is removed only once the conversation write has succeeded.**
  A conversation write can fail — a full disk — and a journal left behind is
  the answer, recovered on the next launch. So `persist` now reports whether
  the write happened, and the journal is removed only when it did.
- **A journal is never removed when the conversations could not be read.** A
  store that cannot be read is a temporary thing, and the journal is then the
  only copy of the answer. This one was found by running the app: a file with
  a byte-order mark in it was correctly refused by the app, the store came up
  empty, and the journal was swept away as orphaned. It is now kept.
- **The answer is written whole, not by what is new.** Every line carries the
  whole of the answer so far, because a line the crash cut in half is then
  discarded and the line before it still has the answer. The cost is that the
  journal holds the answer several times over, and the flush rule is what
  keeps that to about eight times rather than its square: the answer is
  written again once it has grown by a kilobyte, or by an eighth of what has
  been written so far, whichever is more.
- **A slow answer is written anyway, every two seconds.** So a crash costs
  seconds rather than the whole turn. And the text waiting to be written is
  written when the app goes away.
- **The model is told, and told why.** An answer that did not finish is in the
  conversation as a partial one, and a model reading it would take it for the
  whole answer and carry on as though it had finished. So the request carries
  a note — one for an answer that was cut off, and one for an answer the user
  stopped, because the two call for different things. This is what the
  reference does for an interrupted tool call, and for background work that
  did not finish.
- **"Stopped" and "cut off" are told apart.** The user stopped one and the
  app lost the other, and saying "Stopped" about an answer the app lost would
  be a small lie. There are two flags, and two renderings.
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
