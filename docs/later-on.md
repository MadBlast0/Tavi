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

**Depends on.** A real installer pipeline. `npm run tauri build` does not currently
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
