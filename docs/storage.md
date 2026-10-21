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
| Preferences: model, effort, agent mode, the rail's open state | `localStorage` | Low. A choice the user made and could re-make | Until the user clears site data | Clearing site data |
| Composer drafts, one per side | `localStorage` | The user's own words, unsent | Until sent, or cleared | Clearing site data, or sending |
| Folder handles (website) | IndexedDB `tavi-fs` | A handle to a folder the user opened. The browser enforces it | Until the folder is forgotten | **Forget folder** in the picker |
| Workspace grants (desktop) | The app's own file | A path the user chose | Until the folder is forgotten or the grant is relinked | **Forget folder** |
| The model catalogue | A cache in the app's data directory, and OpenRouter's public API | None. A list of models | 15 minutes, then fetched again | Overwritten |
| The window's size and position | The app's own file, written by Rust | None | Until the app is reinstalled | Overwritten |
| Cloned repositories | The projects folder, on disk | The user's own code | Until the user deletes them | The user, or the file manager |
| Attachments and mentions | Inlined into the conversation, and stored with the turn | The user's own words and files | With the thread | Deleting the thread |

**What leaves the machine.** The message that was sent, the attachments that
came with it, and the files that were mentioned by name � and nothing else.
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

### Secrets - OS credential store

`src/lib/secret.ts` → `invoke("set_api_key")` → the `keyring` crate in
`src-tauri/src/keys.rs`.

The key is never written to `localStorage`, never logged, never placed in the
DOM. `server/main.ts` logs neither headers nor request bodies.

The credential is stored under the service name `tavi`, and each provider's
key is filed under its own name within it: `api-key:openrouter`,
`api-key:anthropic`, `api-key:openai`, `api-key:nvidia-nim`. One key per
provider.

The app was called something else when the key was first entered, and the
credential is still under that name: it is moved to the current one the first
time the app asks for it, so the rename does not cost the user their key. The
new credential is written before the old one is removed - a key that exists in
both places is one the user has already set, and losing it would be worse than
leaving a duplicate behind.

Where the OS puts it:

| Platform | Backend |
|---|---|
| macOS | Keychain |
| Windows | Credential Manager |
| Linux | Secret Service (`libsecret`) - GNOME Keyring, KWallet |

On the **website** there is no credential store, so the server keeps its own
keys in a file of its own, under `~/Documents/Tavi/keys` (`TAVI_KEYS_DIR` moves
it), written so that only the owner can read it. The key never reaches the
browser: the browser is told whether a provider has a key and what that
provider says about it, and nothing else. A key in the environment is used
when the file has none.

The settings pane is the same in both — the same list, the same buttons, the
same dialog — because a person setting a key should not have to learn a
second version of the screen depending on where the app is running. Changing
the server's keys is only offered to a request from the same machine: it
changes what every request through the server spends.

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

1. ~~**Move threads and preferences to an app-data file**, written from Rust, so
   uninstall/reinstall is a deliberate choice rather than a side effect and
   "clear browser data" cannot silently wipe a user's work. One file with two
   collections, rather than two files, so the app-data directory does not
   become a place where half the state is and half is not.~~
   **Done.** The conversations are in `threads.json` in the app-data directory,
   written by Rust, with the previous file kept beside it. The preferences are
   still in `localStorage` — they are small, and the composer needs the model
   during its first render, where a promise is useless.
2. ~~**Add an export/import** for threads. Until the desktop app owns its
   storage, a user has no way to back up or move their conversations. It has to
   cover both stores, or the export is only half of somebody's work.~~
   **Done.** Settings → Privacy exports both collections to a JSON file and
   imports one back, adding what is not already here.
3. ~~**Bound the thread stores.** The web cap is 50 threads each; the desktop
   file needs an explicit size policy instead of relying on a browser quota.~~
   **Done.** The cap is 50 each, on both targets, and the list is newest first
   so the conversation in use is never the one the cap drops.
4. **Decide the upgrade story** for a schema change to the stored shape. The
   keys are versioned (`tavi.chats.v1`, `tavi.code-sessions.v1`), and the
   one-time changes that have already happened — the retired thread store, the
   model and the effort splitting per side — live in `src/lib/migrations.ts`.
   There is no general migration path yet, and the app-data file has a version
   of its own: a file this build does not understand is refused rather than
   replaced, which is safe but not a migration.

None of this is needed for the web target, and none of it should block it.


