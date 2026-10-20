# Later on

Deferred work, written down so it is not lost. Nothing here is built, and nothing
here is promised — each item says why it is waiting and what it depends on.

Ordered roughly by how much depends on it.

---

## 1. Create the projects folder at install time

**Status:** not built. `server/projects.ts` creates the folder lazily, the first
time it is used.

**What it should do.** The installer (`.msi` / `.dmg` / `.deb`, built with
`cargo tauri build`) creates the projects root before first launch, so a fresh
install has it without the user having to clone anything first.

**Depends on.** A real installer pipeline. `pnpm tauri build` does not currently
produce a working app — see "Known limitations" in the README, which is mostly
this: the shipping frontend is static and the chat server is not bundled.

---

## 2. Settings screen for the projects folder

**Status:** not built. The location is currently resolved in one place
(`projectsRoot()` in `server/projects.ts`) with this precedence:

1. `TAVI_PROJECTS_DIR` environment variable, if set;
2. `<home>/Documents/Tavi/projects`.

**What it should do.** A settings control that writes the location and persists
it, so the user can point it at e.g. a drive they keep work on. It should show
the resolved path and let the user browse for it.

**Design questions to settle first.**

- Where is it stored? A JSON file next to the app's other config, or the OS
  credential store? It is not a secret, so the credential store is probably wrong.
- Should the folder be created when the setting changes, or when it is next used?
- What happens to the existing setting on reinstall or upgrade? Silently losing a
  user's chosen projects directory would be bad.
- Does changing it affect folders already cloned under the old root, or only new
  clones? Currently: only new clones, silently.

---

## 3. Other git features

**Status:** deliberately not built. Clone is the only git operation implemented.

The interesting follow-ups, roughly in the order they would matter:

- **Status of a project** — is the working tree clean, what branch, ahead/behind.
- **Pull** — needs an authenticated fetch, same as clone.
- **Switch branch / create branch.**
- **Commit** — a commit message editor is a much larger piece of UI than the URL
  field, and needs identity configuration (`user.name` / `user.email`).
- **Push** — needs credentials the app does not have and should never store.

**Design question.** How much of git belongs in this app at all, versus shelling
out to a real terminal the user already has? A read-only "status" view is cheap
and useful. Commit message authoring and push are opinionated, and a user with
git installed may prefer their own tooling.

---

## 4. Private repositories

**Status:** not built.

`git clone` over HTTPS is done. Anything needing credentials is not:

- **SSH** (`git@host:owner/repo.git`) is *accepted* today, but only works if the
  user has already configured that host for `git` outside this app. The error is
  reported verbatim when it does not.
- **HTTPS with a token** — no token is requested, stored, or sent. Adding one
  means deciding where it is kept (OS keychain, via the `keyring` crate that is
  already a dependency for the provider key) and what it is scoped to.

**Note.** `git clone` is spawned with `GIT_TERMINAL_PROMPT=0` so that git can
never sit waiting for input in a window the user cannot see. Without that, a
private or nonexistent repository hangs rather than failing.

---

## 4b. Cloud and SSH environments

**Status:** not built. The footer picker lists them, greyed out and marked "Soon",
so the shape is visible without offering something that would silently do
nothing.

**What each needs.**

- **Cloud.** A hosted backend to hold the thread, the credentials and the files.
  Plan_master.md already puts cloud synchronization out of scope, so this is a
  scope decision before it is an engineering one.
- **SSH.** A remote transport, a host picker, key handling, and a remote file
  walker. The blocker is that the browser cannot read a remote filesystem: there
  are no file handles for it. Either the server walks it on request, or Tauri
  does it natively - same fork as item 5.

**When it lands,** the picker's disabled flags and the no-op handler become real
state, and the two entries stop refusing the click.

The folder picker already follows this. It reads its label and placeholder from
`FOLDER_SOURCE`, keyed by `SelectableEnvironment`, so making a second environment
selectable will not compile until that environment says what its files are called
and where they live. Each transport has to answer three questions before it can be
switched on: what a picked thing is called, where it lives, and how it is picked.

## 4c. Microphone selection and offline dictation

**Status:** not built. The mic uses whatever the system calls the default
device, which is what the Web Speech API gives with no configuration.

**Why a device picker is not a small addition.** SpeechRecognition takes no
device argument - it opens the default itself. Picking a specific microphone
means abandoning it for getUserMedia({ audio: { deviceId } }) and doing the
transcription locally, which means a transcription backend the app does not
have. OpenRouter is text-only. So this is a real dependency decision, not a
dropdown.

**The same decision fixes the desktop app.** Chromium's recogniser is a remote
service; the Tauri webview has no route to it. Moving to a local model (Whisper
or similar, over the existing server/) is what makes dictation work offline
and work in the packaged app at all. The 	ranscribe prop on
PromptInputDictation is the seam for it: pass a function that posts a Blob to
a server route and the component records, sends, and inserts - that path is
implemented and simply unused today.

**Deciding between them.**

- **Local model via the 	ranscribe path.** Works offline, works in Tauri,
  enables device selection, but the text appears at the end rather than live
  unless the endpoint streams partial transcripts.
- **Keep Web Speech.** No backend, and live interim text for free - which is
  what now shows in the composer - but it is browser-only.

Streaming partials would be the best of both, and is the reason to prefer the
server path if this gets built.
## 5. Opening a cloned project without the system picker

**Status:** not built, and this is the main limitation of clone as it stands.

Cloning happens on the server, which the browser has no filesystem handle for. So
after a successful clone the dialog says so and offers **Choose folder**, which
opens the OS picker — the user still has to select it once.

**Options, in order of how much they change the app.**

1. **Tauri's `fs` plugin.** The desktop app could read the projects root directly
   with no picker at all, and could pass a path straight to the file walker. This
   also removes the File System Access API dependency in the web build.
2. **Serve the cloned tree over HTTP** from the local server, and have the app read
   files with `fetch`. Works in the web build too, but it means two different
   file-reading paths depending on how a project was opened, which is exactly the
   kind of divergence that causes subtle bugs.
3. **Do nothing.** One picker click after cloning. Honest, and it is where we are.

Option 1 is the right answer for the desktop app and also needs the installer
work in item 1.

---

## 6. Multiple provider connections

**Status:** adapters exist for OpenRouter, Anthropic, OpenAI and NVIDIA NIM, but
there is exactly one hardcoded connection — `defaultConnection()` in
`server/models.ts`, which is OpenRouter.

**What it needs.** A connections list the user can add to, credentials per
connection read from the environment (or the OS keychain), a provider picker, and
cache keys that already account for the connection — `ModelTarget` carries
`connectionId`, `providerId` and `apiProtocol` precisely so this does not
collapse into "the model string".

**Also needed.** Anthropic and OpenAI have had no live run yet, because this
checkout has no key for either. Their parsing is fixture-tested only. Adding the
keys to `.env.local` would let both be verified against real capability data.

---

## 7. Thinking mode and budget controls

**Status:** in the data model, not in the UI.

`ModelReasoningCapabilities` carries five separate facets — capability, effort,
thinking mode, thinking budget, and display. Only effort is rendered, because
OpenRouter publishes no thinking-mode metadata at all. Anthropic does publish it
(`adaptive` / `enabled` / `disabled`), and its adapter serialises it correctly.

**Before adding a control:** it should only appear for a connection and model
that actually publish the options. A generic "Extended thinking" toggle is wrong
— that is Anthropic's term for a specific API value, and it is already labelled
that way in the adapter for exactly that reason.

The budget control is not started. Anthropic's manual thinking needs
`budget_tokens`, and the app does not currently collect one; the adapter refuses
`thinking.type: "enabled"` with an explanation rather than sending a mode it
cannot satisfy.

---

## 8. What is left over from separating Chat from Code

**Status:** the separation is built — two stores, two composers, two lists, and a
server that writes the system prompt. These are the things that were noticed
while it was built and are not part of it.

### 8.1 The website's chat route is open to the network

`server.listen(PORT)` binds every interface, and only `/api/projects/clone` is
loopback-guarded — and `isLoopback` accepts an empty remote address. So the
route that refuses a chat carrying tools, and refuses a request carrying its
own system prompt, can be posted to from anywhere on the network.

This is the **website's** route now. The desktop app does not use it: the
desktop makes its provider request in Rust, so there is no local port and no
endpoint another process can post to. What is left is a question about the
website, and the answer is the one any website's own backend has to work out —
who is allowed to spend this account's key.

The rules are worth having either way, but they are not a boundary until the
route is one. Binding the loopback interface is the small fix, and it makes a
development server a development server; the larger one is a session.

### 8.2 The model id is never checked against the catalogue

`openrouter(modelName)` is called with whatever string arrived. The catalogue is
consulted only to decide whether a reasoning effort can be serialised, so an
unknown model reaches the provider and fails there.

**On the desktop this is now checked**: the effort is refused unless the model
publishes it, and a model that is not in the catalogue refuses every effort. The
model id itself is still sent as it arrives, because the provider is the one
that knows what it has.

### 8.3 The tray's pending intent holds one

`PENDING` is a `Mutex<Option<Intent>>`. A "New chat" followed quickly by a "New
session" before the webview takes either overwrites the first.

### 8.4 A restored thread carries less context than the original

Attachment text is inlined into the request at up to 400 KB and truncated to
20 000 characters on the way into storage, and the `@`-mentioned folder files
are not stored at all — only their paths. A thread that is closed and opened
again therefore has less in it than the thread that was answered.

### 8.5 The composer's variant region can get stuck

`VariantRegion`'s unstick timer only runs while the region is active, so a region
removed within 550 ms of entering relies on the exit animation alone.

### 8.6 Some small things

- `servedModel` is written and never read.
- `codeStarters` computes a third file it never uses.
- Five exported composer primitives are used nowhere.
- A comment in the composer still describes a dictation overlay that was removed.
- The assistant-ui surface, its thread components and the toolkit beside them
  are not mounted. The native tools in the toolkit now take a workspace and a
  path inside it, but nothing binds a workspace to a session yet.

### 8.7 What is not started

Each of these was deliberately left out of the separation and is its own piece of
work: **parallel sessions**, so several run at once with their own panes;
**restoring the last open thread per side across a reload**; the rail's
**per-side row order and hidden set**, which is what the mock's Customize panel
exists for; the **command palette**, which must list only the active side's
threads; **search** over threads; **archive**; Code's **diff, terminal, file and
browser panes**; **chat tools**, which the server is already the place to refuse;
and **side chats**.

### 8.8 What the desktop app still cannot do

One thing the plan asked for and the app does not have:

- **A file is read, never written.** The model can talk about a change and show
  the exact edit, and the app can read the folder it is attached to, but there
  is no write path and no shell. That is deliberate: the authorization gap was
  closed first, and a write path is a separate piece of work with its own
  review.

Two things that used to be on this list and are not any more:

- **The desktop's folders are Rust grants.** The app asks the system for a
  folder and holds a grant — a canonical path the user chose — so the *native*
  tools and the *app's* file access are bounded by the same thing, rather than
  by two boundaries in two languages for one folder. The rules about which
  files are worth walking for live in `src/lib/file-rules.ts` and are read by
  both targets, so the model is shown the same files on each.
- **A folder that has moved can be relinked.** The grant keeps its id, so the
  sessions that were run against it stay attached to it, and the picker offers
  to point it at the folder's new place rather than showing a project whose
  files quietly are not there.

### 8.9 What still needs a machine to check

Three things are right in the code and have not been watched working:

- **The Tauri app running.** The command names are checked by a test, and the
  Rust behind them is tested, but the IPC round trip, the event channel and
  the native file dialog have not been exercised together.
- **A real `git clone`.** Its rules, its destination, its collision guard and
  its progress are tested; a clone against a real repository has not run.
- **The packaged app.** It builds — an MSI and an NSIS installer — but it has
  not been installed and started.

---

## 9. What was built against the plan

The brief that the desktop's durable storage, its workspace grants and the Rust
provider path were built from has served its purpose and is gone.
`docs/architecture.md` has the map, the boundaries that were settled, and what
each stage closed; `docs/storage.md` has where the data lives. The short
version:

- The conversations moved out of the webview's storage and into the app's own
  file, with the old copy brought across once and only removed once the new one
  had been read back.
- The Rust file commands stopped defaulting to the home directory. They need a
  grant now, and a grant is a path the user chose.
- The desktop app talks to the provider from Rust. The key is read there, used
  there, and never handed to JavaScript, and there is no local port.
- The clone runs on the machine the app is on, reports what it is doing, can be
  stopped, and cleans up after itself when it fails.
- There is a place to find out where the data is, to take a copy of it, to put
  one back, and to be rid of it.
- The desktop's folders are grants the app made itself, and a folder that has
  moved can be pointed at its new place without losing the sessions that were
  run against it.
