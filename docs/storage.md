# Storage

Where each piece of data lives, on each platform, what it is worth, and what
happens to it.

This is the storage reference: it describes what the code **does now**, and it
is kept in step with the code rather than describing what the code once did.
It began as the storage section of the implementation brief that the desktop
app's durable storage, the workspace grants and the Rust provider path were
built from; that brief is gone, and this is what it left behind.

The app has two targets from one codebase: a **website** (plain browser) and a
**desktop app** (Tauri). Anything that must work on both goes through a browser
storage API, because in the desktop app the UI *is* a webview and already has
one. Only data that has to outlive the webview, or be shared with Rust, moves
behind `invoke`.

---

## The data map

What is kept, where it is kept, how sensitive it is, how long it is kept, and
what removes it.

| Data | Where | Sensitivity | Retention | Removed by |
|---|---|---|---|---|
| Chats and code sessions | The app's own file on the desktop; `localStorage` on the web | The user's own conversations. Never sent anywhere but the provider they chose | Until the user deletes it. The newest 50 of each kind are kept | Deleting a thread, or **Settings ? Privacy ? Delete everything** |
| The provider key | The OS credential store on the desktop; the server's own file on the website | A credential. Never logged, never sent back to a browser | Until the user removes it | **Settings ? Platform ? API keys ? Remove** |
| The provider a request goes to | A per-side preference, in the browser's storage | Low. A choice about where a request goes | Until the user clears site data | Clearing site data |
| The key's details | `provider-keys.json` beside the app's data; the same file, on the website | Low, but a fingerprint: the masked value and the account name | Until the key is removed | With the key |
| Preferences: model, effort, agent mode, the rail's open state | `localStorage` | Low. A choice the user made and could re-make | Until the user clears site data | Clearing site data |
| Composer drafts, one per side | `localStorage` | The user's own words, unsent | Until sent, or cleared | Clearing site data, or sending |
| Folder handles (website) | IndexedDB `tavi-fs` | A handle to a folder the user opened. The browser enforces it | Until the folder is forgotten | **Forget folder** in the picker |
| Workspace grants (desktop) | The app's own file | A path the user chose | Until the folder is forgotten or the grant is relinked | **Forget folder** |
| The model catalogue | A cache in the app's data directory on the desktop, one file per provider; in the server's memory on the website. OpenRouter's public API is the source | None. A list of models | 15 minutes, then fetched again | Overwritten |
| The window's size and position | The app's own file, written by Rust | None | Until the app is reinstalled | Overwritten |
| Cloned repositories | The projects folder, on disk | The user's own code | Until the user deletes them | The user, or the file manager |
| Attachments and mentions | Inlined into the conversation, and stored with the turn | The user's own words and files | With the thread | Deleting the thread |

**What leaves the machine.** The message that was sent, the attachments that
came with it, and the files that were mentioned by name — and nothing else.
They go to the provider the user chose a model from. A chat is never given a
folder, and a request that tried to carry one is refused.

**What does not.** A chat is a conversation. The app has no telemetry, no
crash reporting and no account. The provider's own record of what was sent is
the provider's business, and the app does not claim otherwise.

---



## The design, in full

Where each piece of data lives, on each platform, and what survives what.

The app has two targets from one codebase: a **website** (plain browser) and a
**desktop app** (Tauri). Anything that must work on both goes through a browser
storage API, because in the desktop app the UI *is* a webview and already has
one. Only data that has to outlive the webview, or be shared with Rust, moves
behind `invoke`.

### The decision rule

| The data is… | Store it in | Because |
|---|---|---|
| A preference the user picked and could re-type | `localStorage` | Synchronous, needed on first paint |
| **Chats** | the app's own file (desktop), `localStorage` (web) | See "Threads" below |
| **Code sessions** | the app's own file (desktop), `localStorage` (web) | See "Threads" below |
| **Composer drafts** | `localStorage` | One per side, and small enough to be worth keeping |
| A folder handle the browser granted | IndexedDB | Handles cannot go in `localStorage` |
| A folder the native tools may reach | the app's own file | A grant, so a path the model names is not a permission |
| An API key or other secret | OS credential store, via Rust | Never any web storage |
| A regenerated cache | Cache dir / temp, never persisted | Wipe is harmless |

The mistake worth avoiding is putting something in `localStorage` that the user
would be upset to lose, and then discovering the browser evicted it. The second
mistake is putting something permanent in a temp directory, and having the OS
delete it on a schedule.

---

### Preferences — `localStorage`

`src/lib/prefs.ts`. Model, effort level, agent mode, app font, and whether the
rail is open.

The model and the effort are remembered **per side**: `tavi.model.chat` and
`tavi.model.code`, `tavi.effort.chat` and `tavi.effort.code`. Chat and Code
are separate places, and the model you chat with is not the model you code
with — a cheap model for a quick question and a careful one for a change are
different choices, and "New chat" and "New session" each keep their own side's.

The agent mode's default is remembered **per folder** — `tavi.mode.<folderId>` —
the way a permission mode is remembered per folder in other tools. The way you
work in one repository is not the way you work in another. A session that is
already open keeps the mode it was run with.

- **Website:** `localStorage` for `https://your-host`. Shared across tabs,
  per-origin, per-browser-profile. Roughly 5–10 MB, but we use ~100 bytes.
- **Desktop:** the same API, backed by the webview's own profile on disk.

Why `localStorage` and not IndexedDB: the composer needs the model during its
first render, before any effect can await. IndexedDB would mean a blank or
wrong model on every cold start.

#### Two profiles, one code path

**The app and the website are two profiles, with two preference sets, that
share one code path.** The API is the same in both — that is what lets one
implementation serve both — but the *area* is not: `localStorage` is
partitioned by origin, and in production the app and the website are different
origins. A preference set in one is not read by the other, and nothing crosses
between them except a one-time migration.

That migration has a defined end point and is not a sync: the app bringing the
website's conversations across on first run is a migration, and it should stay
labelled as one. There is no account, so there is nothing to sync against.

**In development the two share one area.** `pnpm tauri dev` runs the webview
and a browser tab on the same origin, `http://localhost:1420`, so a preference
set in one is visible in the other — and **a bug that depends on a fresh
`localStorage` will not reproduce in development.** In production the app is
`tauri://localhost` (macOS and Linux) or `http://tauri.localhost` (Windows),
and the website is its own origin, so they are separate.

#### The namespace, and the move out of the old one

Everything the app stores in the browser is under one namespace, so it cannot
collide with anything else on the origin. The namespace, and the move out of
the one the app had before it was renamed, belong to `src/lib/storage.ts`.

A value that is only in the old namespace is moved to the new one the first
time it is read, and the old one is removed afterwards. A rename is not a
reason to lose someone's chats or their choice of model, and the move never
overwrites: a value already in the new namespace is the newer one, and it
wins.

**One value is retired rather than moved.** The app used to keep one array of
threads, holding both chats and code sessions with nothing on either to say
which it was. It is gone, and it is deleted from **both** namespaces: the
namespace rule above would otherwise move the legacy copy straight back on the
next read. `src/lib/storage.ts` has `forgetStorage` for exactly this, and
`src/lib/migrations.ts` is where the one-time changes live.

The same is true of the model and the effort, which used to be one choice for
the whole app: the old value becomes the first choice on **each** side and the
old key is then removed.

#### What is deliberately not stored

The **composer layout** — Chat or Code — is not stored. The app always opens
in Chat. The model, the effort and the mode are preferences about *how* to
work and are remembered; which of the two jobs the app starts on is a
question about what the user came to do, and a fresh start is the honest
answer to it. Coming back to Code is a click.

The **rail's width** is not stored either, for a different reason: a width
someone set by dragging is a fit for the window they were looking at, and
saving it would reopen the app at a width chosen for some other screen. The
rail's *open* state is stored, because that is a preference and not a fit.

#### What can go wrong, and what we do about it

| Risk | Handling |
|---|---|
| Private mode / storage disabled | `readPref` returns `undefined`; app starts normally |
| Quota exceeded | `writePref` swallows; selection still applies this session |
| User clears site data | Everything non-secret is lost. Accepted — see below |
| Stored model no longer exists | Validated against the catalogue on load, replaced with a visible selection |
| Corruption | A non-string or unreadable value reads as absent |

**Eviction is the real constraint.** Browsers may clear `localStorage` under
storage pressure or with certain privacy settings, and a user clearing site data
takes it all. That is acceptable for preferences and acceptable for threads on
the web target, but it is *not* acceptable for a desktop app, where the user
installed software and expects it to remember. That is the case for moving to
an app-data file — see "What to change for desktop".

Two stores are twice the exposure: the two are evicted independently, so a
browser under pressure may take one and leave the other. They are also capped
independently, so a long run of code sessions can push a chat out of the cap
without a single chat being lost — the two lists do not compete for the same
fifty slots.

---

### Threads — two of them

`src/lib/chats.ts`, key `tavi.chats.v1`, and `src/lib/sessions.ts`, key
`tavi.code-sessions.v1`. The vocabulary they share — the turn shape, the title
rule, the timestamp format, the storage machinery — is in `src/lib/threads.ts`,
so the two cannot drift apart.

**A chat is not a code session.** They are separate objects in separate
stores, with separate shapes and separate caps:

| | Chat | Code session |
|---|---|---|
| Key | `tavi.chats.v1` | `tavi.code-sessions.v1` |
| Shape | turns, model, effort, pin | turns, model, effort, agent mode, folder, pin |
| A folder | none — there is nowhere to put one | the folder's id and its name |
| Grouped by | nothing; the list is flat | the project it was run against |
| Id prefix | `c-` | `s-` |

Each is a single JSON array, capped at 50, with attachment text captured at send
time so a restored thread keeps its context.

**Where the array lives is `src/lib/thread-repository.ts`'s business.** The
website keeps it in `localStorage`; the desktop app keeps it in the app's own
data directory, in one file with two collections, written by Rust. The
conversations that were in the webview's storage are brought across the first
time the app runs on the desktop, and the old copy is only removed once the
durable one has been read back.

- **Website:** fine as-is at this size. If threads grow to include full file
  contents, move to IndexedDB — the 5 MB `localStorage` ceiling would be hit
  by roughly one long thread with attachments.
- **Desktop:** the app's own file, with the previous one kept beside it. The
  write is atomic, and a file this build does not understand is refused rather
  than replaced.

**The composer's drafts are per side too**, and they are not namespaced: the
key is `prompt-draft:chat` and `prompt-draft:code`. A half-written chat is
waiting in the chat composer and a half-written session in the session
composer, and neither appears in the other.

---

### Folder handles — IndexedDB

`src/lib/fs-access.ts`, database `tavi-fs`, stores `handles` and
`recent-folders`.

`FileSystemDirectoryHandle` is structured-cloneable but **not** serialisable to
`localStorage`, so it needs IndexedDB. Metadata (the folder's id, its name and
when it was picked) lives alongside it.

**A folder's id is generated, and is not its name.** Two directories can share
a name, and a folder identified by its name is one folder to this app: the
second pick would overwrite the first's handle, and two projects would be
grouped as one. The name is kept separately, because the name is what a person
reads.

- **Website:** IndexedDB, same-origin, evicted under the same pressure as
  `localStorage`.
- **Desktop:** the desktop app does not use this path. It reads the filesystem
  through Rust (`src/lib/desktop.ts`) inside a directory the user granted.

A revoked or missing grant resolves to `null`, which clears the file list rather
than leaving stale paths on screen.

---

### The provider in use

`tavi.provider.chat` and `tavi.provider.code` — a preference, per side, like
the model and the effort.

It is the provider the request goes to, and it is what the model list is
scoped to: the catalogue that is fetched, the list that is shown, the key the
request goes out with, and the provider the request is sent to all follow it.
That is what makes the list and the request about the same provider by
construction, rather than by agreeing to.

**It starts unset, because the user chooses it.** The composer has a provider
control of its own, beside the model one, and the model picker is not usable
until a provider is chosen — the models belong to one. The control opens a
palette with two kinds of provider, an **API provider** and a **CLI
provider**, and each opens the list of the ones that are set up. The API list
is the providers the user has a key for, because a provider with no key is one
the app cannot reach.

**A thread records the provider it was started with**, the way it records the
model and the effort. It is a record and not a rule: the conversation is text,
the tools are the same whichever provider answers, and the effort is checked
against the new model, so a thread may go on to another provider if the user
wants it to.

A provider is a **shape** and some **configuration**. Most of the thirty
providers the app knows about speak the OpenAI chat-completions shape and
differ only in the address they live at and how the key is sent. Anthropic's
Messages, Google's generate-content and Cohere's chat are three more shapes.
Two of them — Amazon Bedrock and Google Vertex AI — are signed with AWS
credentials and with Google's own rather than with a key, and the app says so
plainly.

**A key may carry the address it belongs to.** Some providers do not live at
one address: an Azure resource, a Databricks workspace, a model running on
this machine. The key says which, and the key's address wins over the
provider's default. The address is part of the key's metadata, and it is
written next to the key rather than beside it — the address is not a secret,
but it is not the provider's either.

### Secrets - OS credential store

`src/lib/secret.ts` → `invoke("save_provider_key")` → the `keyring` crate in
`src-tauri/src/keys.rs`.

The key is never written to `localStorage`, never logged, never placed in the
DOM. `server/main.ts` logs neither headers nor request bodies.

#### What a credential store is, and what it is not

The store is an **at-rest** control. It protects a key from being read off
the disk when the profile is stolen: the Windows DPAPI blob, the macOS
keychain item and the Linux keyring all need the login secret, so a copy of
the profile is not a copy of the key.

It is **not** an authorisation control. A process running as the same OS user
can read the key on all three platforms: Windows `CredRead` needs no prompt,
because the credential set belongs to the logon session; macOS prompts for
*other* applications and remembers the answer; on Linux "any application can
easily read any secret if the keyring is unlocked". A local administrator can
read it everywhere, which is out of scope for any desktop app.

So the app never says a key is "secure" or "protected". It names the threat it
does address: the key is not a plaintext file on the disk.

One OS account per person is assumed. Two people sharing one Windows account
share one credential set, and the second person's app can read the first
person's key with no prompt. The naming scheme carries no user id, because
all three stores are already partitioned by OS user and a uid would be
redundant and brittle - Windows has no uid.

Where the OS puts it:

| Platform | Backend |
|---|---|
| macOS | Keychain |
| Windows | Credential Manager |
| Linux | Secret Service (`libsecret`) - GNOME Keyring, KWallet |

#### The secret, and the sidecar

The credential is stored under the service name `tavi`, and each key is filed
under its own id within it: `api-key:<keyId>`. There can be several keys for
one provider — a personal key and a work key — and the id is what tells them
apart.

**The credential store cannot be enumerated.** `keyring` 3.6.3, the version
pinned in `src-tauri/Cargo.toml`, exposes only per-entry `get` / `set` /
`delete` / `attributes`. There is no `list` and no `find_all`, so the app
cannot ask the operating system "which keys do I have?".

**It cannot hold portable metadata either.** `update_attributes` "ignores
(without error) any specified attributes that aren't supported by that store",
and the attributes map to `username` / `comment` / `target_alias` on Windows,
`label` on macOS, and arbitrary attributes on Secret Service. A key's name and
its date cannot be relied on to live beside the secret.

So the metadata lives in a **sidecar**: `provider-keys.json` in the app's data
directory, beside `window-state.json`. It holds the key's id, its provider,
its name, when it was added, when it was last used, the provider's own masked
account name, and the masked value — the vendor's prefix and the last four
characters, computed when the key was written, because that is the only moment
the app holds the secret.

**It holds no secret.** That is the whole point of the split, and it is why
the sidecar is written `0600` on macOS and Linux rather than being treated as
public. The directory is `0700`.

#### The migration

The app was called something else when the key was first entered, and the
credential is still under that name: it is moved to the current one the first
time the app asks for it, so the rename does not cost the user their key. The
new credential is written before the old one is removed - a key that exists in
both places is one the user has already set, and losing it would be worse than
leaving a duplicate behind.

The same move happens for the shape of the store itself. The app used to keep
one key per provider, filed under the provider's name; it now keeps a key of
its own with an id, and an explicit pointer to the one in use. The migration
is all or nothing: the new entries are written and read back, the sidecar is
written, and only then are the old entries removed. A sidecar that cannot be
written leaves the old keys exactly where they were, because a half-migrated
store leaves the app unable to find a key it has.

#### On the website

There is no credential store in a browser, so the server keeps its keys in a
file of its own, under `~/.config/tavi/keys` (`%APPDATA%\Tavi\keys` on
Windows). `TAVI_KEYS_DIR` moves it. The folder is `0700` and the file `0600`,
written atomically with the previous copy kept beside it, and a file that
cannot be parsed is reported rather than treated as an empty store — one
unreadable moment followed by one write used to be enough to lose every other
provider's key.

It is deliberately **not** in the documents folder: that one is commonly synced
to somebody else's server, and a plaintext key does not belong there.

The key never reaches the browser: the browser is told whether a provider has a
key and what that provider says about it, and nothing else. A key in the
environment is used when the file has none.

#### The development file

A **development build** of the desktop app reads `.env.local` for a key when
the credential store has none, so a developer does not have to paste the same
key in by hand on every machine. It is read in Rust, it never crosses into the
webview, and it is not copied anywhere — removing it from the file removes
it. The settings pane says which one a key came from. A release build does
not contain the code that looks for the file at all, so a shipped app has no
key on a machine that only ever had `.env.local`.

The settings pane is the same in both — the same list, the same buttons, the
same dialog — because a person setting a key should not have to learn a
second version of the screen depending on where the app is running. The server
holds the **operator's own** keys and listens on the loopback interface; the
routes that change one are refused unless the request came from this machine,
was addressed to a name the server answers to, and carried the header that
makes a browser ask first.

---

### Where the desktop app actually writes

Tauri resolves these through `app.path()`. The identifier is `com.mad.tavi`
(`src-tauri/tauri.conf.json`), so they are namespaced per app and a second app
with a different identifier cannot read them.

| Kind | Windows | macOS | Linux |
|---|---|---|---|
| App data (permanent) | `%APPDATA%\com.mad.tavi` | `~/Library/Application Support/com.mad.tavi` | `$XDG_DATA_HOME/com.mad.tavi`, else `~/.local/share/com.mad.tavi` |
| Cache (regenerable) | `%LOCALAPPDATA%\com.mad.tavi\cache` | `~/Library/Caches/com.mad.tavi` | `$XDG_CACHE_HOME/com.mad.tavi`, else `~/.cache/com.mad.tavi` |
| Temp (per-run) | `%TEMP%` → `…\AppData\Local\Temp` | `$TMPDIR` → `/var/folders/…` | `$TMPDIR`, else `/tmp` |

**`TAVI_DATA_DIR` overrides the app data directory.** The identifier names it,
which is right for an installed app — one app, one place — and wrong for two
checkouts of the same source on one machine, where both would write the same
conversations file and fight over the same remembered window. Setting it
points the desktop app's own files somewhere else: the conversations, the
folder grants, the key index, the catalogue cache and the window state.

The **credential store is not redirected with it.** A key belongs to a user and
a provider, not to a checkout of the source, so the service name stays the
same and two copies of the app share one key. The same is true of the
website's server's own key file (`TAVI_KEYS_DIR`): one key for one user, and
the app's whole design says a key lives in one place.

#### Window state — app data

`src-tauri/src/window_state.rs` writes `window-state.json` into the app data
directory: the window's size and whether it was maximized, so the app opens as
large as it was left rather than at the size it was configured with.

It is app data and not a preference because it belongs to the installed
program rather than to the webview's profile: a window that forgets how big it
was is a window that opens at the wrong size every morning, and the state
belongs to survive the webview's storage being cleared.

The **position** is not in the file. The window always opens centred on the
screen, which is the one position that is right on every machine and every
arrangement of monitors; a remembered position is right on the machine it was
remembered on and wrong everywhere else.

The file is one small JSON object, written atomically (to a temporary file,
then moved into place), and a file that is missing, unreadable or malformed
reads as *no state* — the window then opens at its configured size, which is
the same as the first time the app is ever run. The file carries the version
of its own shape, and a file written in a shape this build does not know is
read as no state as well.

The size in the file is in **logical pixels**, so it means the same apparent
size on a 4K display at 200% as on a 1080p one at 100%. It is capped at the
work area of the screen the window opens on, so a size remembered on a large
display cannot leave the window hanging off a small one.

Rules that follow from this:

1. **Nothing the user needs goes in the cache dir.** The OS is free to delete it.
2. **Nothing permanent goes in temp.** macOS in particular may clear
   `/var/folders/…` on a schedule, and Linux clears `/tmp` on reboot on many
   distributions.
3. **Cache is keyed by content or version**, so a stale entry is replaced rather
   than needing invalidation logic.

#### The webview's own storage

On the desktop target the preferences, threads and handles live in the embedded
webview's profile, not in these directories:

| Platform | Engine | Typical location |
|---|---|---|
| Windows | WebView2 | `%LOCALAPPDATA%\{identifier}\EBWebView\` |
| macOS | WKWebView | `~/Library/WebKit/com.mad.tavi/WebsiteData\` |
| Linux | WebKitGTK | `~/.local/share/webkit2/` or a per-app profile |

These paths are engine-version dependent and should not be read or written
directly — treat them as implementation detail. The practical consequences:

- They are cleared by "clear site data" in the OS, or by deleting the profile.
- They can grow without bound; there is no quota to hit but nothing prunes them
  either, so an unbounded write there is a slow leak.
- They are not portable between machines.

---

### What to change for a shipping desktop app

1. ~~**Move threads to an app-data file**, written from Rust, so
   uninstall/reinstall is a deliberate choice rather than a side effect and
   "clear browser data" cannot silently wipe a user's work. One file with two
   collections, rather than two files, so the app-data directory does not
   become a place where half the state is and half is not.~~
   **Done.** The conversations are in `threads.json` in the app-data directory,
   written by Rust, with the previous file kept beside it.
   **The preferences were not part of this and have not moved:** they are still
   in `localStorage`. That is a decision rather than an oversight — they are
   small, and the composer needs the model during its first render, where a
   promise is useless. The cost is that they live in the webview's profile,
   which "clear site data" can take like anything else the profile holds.
2. ~~**Add an export/import** for threads. Until the desktop app owns its
   storage, a user has no way to back up or move their conversations. It has to
   cover both stores, or the export is only half of somebody's work.~~
   **Done.** Settings → Privacy exports both collections to a JSON file and
   imports one back, adding what is not already here.
3. ~~**Bound the thread stores.** The web cap is 50 threads each; the desktop
   file needs an explicit size policy instead of relying on a browser quota.~~
   **Done.** The cap is 50 each, on both targets, and the list is newest first
   so the conversation in use is never the one the cap drops.
4. **Decide the upgrade story** for a schema change to the stored shape. **Not
   done.** The browser's keys are versioned (`tavi.chats.v1`,
   `tavi.code-sessions.v1`), and the one-time changes that have already
   happened — the retired thread store, the model and the effort splitting per
   side — live in `src/lib/migrations.ts`.

   There is no general migration path, and there are now **three** versioned
   files, each of which refuses a version it does not understand rather than
   moving it:

   | File | Where | Version |
   |---|---|---|
   | `threads.json` | the app's data directory | `FILE_VERSION` in `src-tauri/src/threads.rs` |
   | `provider-keys.json` | beside it | `INDEX_VERSION` in `src-tauri/src/keys.rs` |
   | the server's key file | the server's own folder | `STORE_VERSION` in `server/key-store.ts` |

   A refusal is safe and it is not a migration: the data is still there, and
   the app cannot read it. Moving it needs a migration per file, and the
   decision about what a version 2 looks like has not been taken.

None of this is needed for the web target, and none of it should block it.


