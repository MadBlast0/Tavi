# Storage strategy

Where each piece of data lives, on each platform, and what survives what.

The app has two targets from one codebase: a **website** (plain browser) and a
**desktop app** (Tauri). Anything that must work on both goes through a browser
storage API, because in the desktop app the UI *is* a webview and already has
one. Only data that has to outlive the webview, or be shared with Rust, moves
behind `invoke`.

## The decision rule

| The data is… | Store it in | Because |
|---|---|---|
| A preference the user picked and could re-type | `localStorage` | Synchronous, needed on first paint |
| Conversation threads | `localStorage` (small) → IndexedDB (large) | See "Threads" below |
| A folder handle the browser granted | IndexedDB | Handles cannot go in `localStorage` |
| An API key or other secret | OS credential store, via Rust | Never any web storage |
| A regenerated cache | Cache dir / temp, never persisted | Wipe is harmless |

The mistake worth avoiding is putting something in `localStorage` that the user
would be upset to lose, and then discovering the browser evicted it. The second
mistake is putting something permanent in a temp directory, and having the OS
delete it on a schedule.

---

## Preferences — `localStorage`

`src/lib/prefs.ts`. Model, effort level, mode, and composer layout.

- **Website:** `localStorage` for `https://your-host`. Shared across tabs,
  per-origin, per-browser-profile. Roughly 5–10 MB, but we use ~100 bytes.
- **Desktop:** the same API, backed by the webview's own profile on disk.

Why `localStorage` and not IndexedDB: the composer needs the model during its
first render, before any effect can await. IndexedDB would mean a blank or
wrong model on every cold start.

### What can go wrong, and what we do about it

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

---

## Conversation threads

`src/lib/sessions.ts`, key `ai-app.sessions.v1`.

Currently a single JSON array in `localStorage`, capped at 50 threads, with
attachment text captured at send time so a restored thread keeps its context.

- **Website:** fine as-is at this size. If threads grow to include full file
  contents, move to IndexedDB — the 5 MB `localStorage` ceiling would be hit
  by roughly one long thread with attachments.
- **Desktop:** same today, with the same eviction caveat. Moving to a file in
  the app-data directory is the correct end state.

---

## Folder handles — IndexedDB

`src/lib/fs-access.ts`, database `tavi-fs`, stores `handles` and
`recent-folders`.

`FileSystemDirectoryHandle` is structured-cloneable but **not** serialisable to
`localStorage`, so it needs IndexedDB. Metadata (folder name, picked-at) lives
alongside it.

- **Website:** IndexedDB, same-origin, evicted under the same pressure as
  `localStorage`.
- **Desktop:** the desktop app does not use this path. It reads the filesystem
  through Rust (`src/lib/desktop.ts`) inside a directory the user granted.

A revoked or missing grant resolves to `null`, which clears the file list rather
than leaving stale paths on screen.

---

## Secrets — OS credential store

`src/lib/secret.ts` → `invoke("get_api_key")` → the `keyring` crate in
`src-tauri/src/lib.rs`.

The key is never written to `localStorage`, never logged, never placed in the
DOM. `server/chat.ts` logs neither headers nor request bodies.

Where the OS puts it:

| Platform | Backend |
|---|---|
| macOS | Keychain |
| Windows | Credential Manager |
| Linux | Secret Service (`libsecret`) — GNOME Keyring, KWallet |

On the **website** there is no credential store. The key comes from the
server's environment (`OPENROUTER_API_KEY`) and never reaches the browser. A
web build that needs per-user keys needs a backend session, not browser storage.

---

## Where the desktop app actually writes

Tauri resolves these through `app.path()`. The identifier is `com.mad.ai-app`
(`src-tauri/tauri.conf.json`), so they are namespaced per app and a second app
with a different identifier cannot read them.

| Kind | Windows | macOS | Linux |
|---|---|---|---|
| App data (permanent) | `%APPDATA%\com.mad.ai-app` | `~/Library/Application Support/com.mad.ai-app` | `$XDG_DATA_HOME/com.mad.ai-app`, else `~/.local/share/com.mad.ai-app` |
| Cache (regenerable) | `%LOCALAPPDATA%\com.mad.ai-app\cache` | `~/Library/Caches/com.mad.ai-app` | `$XDG_CACHE_HOME/com.mad.ai-app`, else `~/.cache/com.mad.ai-app` |
| Temp (per-run) | `%TEMP%` → `…\AppData\Local\Temp` | `$TMPDIR` → `/var/folders/…` | `$TMPDIR`, else `/tmp` |

Rules that follow from this:

1. **Nothing the user needs goes in the cache dir.** The OS is free to delete it.
2. **Nothing permanent goes in temp.** macOS in particular may clear
   `/var/folders/…` on a schedule, and Linux clears `/tmp` on reboot on many
   distributions.
3. **Cache is keyed by content or version**, so a stale entry is replaced rather
   than needing invalidation logic.

### The webview's own storage

On the desktop target the preferences, threads and handles live in the embedded
webview's profile, not in these directories:

| Platform | Engine | Typical location |
|---|---|---|
| Windows | WebView2 | `%LOCALAPPDATA%\{product}\EBWebView\` |
| macOS | WKWebView | `~/Library/WebKit/com.mad.ai-app/WebsiteData\` |
| Linux | WebKitGTK | `~/.local/share/webkit2/` or a per-app profile |

These paths are engine-version dependent and should not be read or written
directly — treat them as implementation detail. The practical consequences:

- They are cleared by "clear site data" in the OS, or by deleting the profile.
- They can grow without bound; there is no quota to hit but nothing prunes them
  either, so an unbounded write there is a slow leak.
- They are not portable between machines.

---

## What to change for a shipping desktop app

1. **Move threads and preferences to an app-data file**, written from Rust, so
   uninstall/reinstall is a deliberate choice rather than a side effect and
   "clear browser data" cannot silently wipe a user's work.
2. **Add an export/import** for threads. Until the desktop app owns its storage,
   a user has no way to back up or move their conversations.
3. **Bound the thread store.** The web cap is 50 threads; the desktop file
   needs an explicit size policy instead of relying on a browser quota.
4. **Decide the upgrade story** for a schema change to the stored shape — the
   key is versioned (`ai-app.sessions.v1`) but there is no migration path yet.

None of this is needed for the web target, and none of it should block it.
