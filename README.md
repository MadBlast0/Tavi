# AI App

A Tauri v2 desktop chat app built on [assistant-ui](https://www.assistant-ui.com)
and the Vercel AI SDK, with live model discovery and a selectable model.

## Architecture

```
┌──────────────────────────────────────────────────────┐
│ Tauri window (Rust shell)                            │
│  ├─ Webview: React + assistant-ui Thread              │
│  │    · tools execute here (Tauri invoke)            │
│  │    · model picker + theme toggle live here        │
│  └─ src-tauri/  Rust commands                        │
│       · list_directory / read_text_file (path-confined)│
│       · set/get/clear_api_key (OS credential store)  │
└───────────────────────────┬──────────────────────────┘
                            │ HTTP loopback
                  ┌─────────▼──────────┐
                  │ Node chat server   │  :8787
                  │ server/chat.ts     │
                  │  · /api/chat       │
                  │  · /api/models     │
                  │  · /api/key        │
                  └─────────┬──────────┘
                            │ HTTPS
                       OpenRouter
```

The chat backend is a separate process because the Tauri window loads a static
bundle with no server behind it. Vite proxies `/api` to it in development, and
`npm run tauri dev` starts both. The same chat route can later deploy as a
serverless function, which is what makes a web build cheap.

## Prerequisites

- Node 20+
- Rust (stable) — `winget install Rustlang.Rust` or <https://rustup.rs>
- Windows: MSVC Build Tools (already present on this machine)

## Running

```bash
npm install

# web target — http://localhost:1420
npm run dev

# desktop window
npm run tauri dev
```

`npm run dev` starts Vite and the chat server together via `concurrently`.
`tauri.conf.json` already invokes the same command, so `npm run tauri dev`
starts both.

## Provider key

Two supported paths; the header wins if both are present.

| Path | Where | Notes |
|---|---|---|
| **In-app** | Key icon in the top-right bar | Stored in the OS credential store — Windows Credential Manager, macOS Keychain, or libsecret. Desktop only. |
| **Environment** | `.env.local` → `OPENROUTER_API_KEY` | Development and web target. |

The key is never written to disk in plaintext, never placed in local storage, and
never logged. The webview reads it from the credential store immediately before
each request and attaches it as a bearer header to the loopback server.

> Residual risk: in the desktop app the key exists briefly in webview JS memory
> per request. That is inherent to the process split — see
> `docs/plan/ai-app-master-plan.md` §9.2.

## Configuration

| Setting | Default | Effect |
|---|---|---|
| `OPENROUTER_API_KEY` | — | Provider key. Server-side only. |
| `CHAT_SERVER_PORT` | `8787` | Chat server port. Must match the proxy target; both read this variable. |

There is no default model. The server streams only the model the client sends,
and rejects a request that carries none with `400 No model selected`.

## Tools

All tools are browser-side, so the filesystem ones can reach Rust and also work
in a future web build.

| Tool | Runs | Purpose |
|---|---|---|
| `current_time` | webview | ISO timestamp |
| `evaluate_expression` | webview | Arithmetic. Recursive-descent parser; never uses `eval` or dynamic function construction. |
| `fetch_url` | webview | Fetches and strips markup, truncated to 4000 chars. **CORS-limited** — see below. |
| `list_directory` | Tauri | Lists a directory |
| `read_text_file` | Tauri | Reads a UTF-8 file, capped in size |

### Tools are gated per environment

The two native tools are **hidden from the model** when the app runs in a
browser, via `DesktopToolGate` and `useAuiToolOverrides`. They are not offered and
then failed — the model simply never sees them, and so never claims it cannot use
them. In the desktop app they resolve to `disabled: false` and everything is
available.

This is why there are no "only available in the desktop app" errors in the web
build. There is one runtime check, and it is per app instance rather than baked
into the toolkit.

### `fetch_url` and CORS

Because it executes in the browser, `fetch_url` can only read cross-origin
responses when the target opts in. `https://example.com` fails; permissive APIs
like `https://api.github.com/zen` succeed. The tool reports this as a CORS
explanation rather than a generic network error, so it is not mistaken for an
outage.

For unrestricted fetching in the desktop build, the fix is to move the request
into Rust (a `tauri-plugin-http` command) so CORS does not apply. Not implemented
yet.

The filesystem tools are confined to a single root, resolved with `canonicalize`
so traversal sequences and symlink escapes are rejected. Narrow it by setting
`AI_APP_FS_ROOT`; it defaults to your home directory.

Native tools require the desktop app and say so plainly in the browser rather
than failing opaquely.

## Model selection

The composer rail carries a model picker that reads `/api/models` — OpenRouter's
public catalog, projected to a slim shape and cached for 15 minutes.

- Free-only by default, with a reveal-all toggle (zero prompt *and* completion
  pricing, not a naming convention).
- Grouped by provider, which the catalog's `Provider: Model` names give us free.
- Searchable by model name, id, or provider.
- Capabilities are shown as text (`free · 256k ctx · tools · reasoning · vision`),
  not as icons.
- A reasoning-effort selector appears **only** for models that advertise
  `reasoning_effort`. The server re-checks this before forwarding it, so an
  unsupported value is never sent.
- Selection and effort persist in local storage; both are preferences, not
  secrets.

`openrouter/free` is sorted last: it routes to a random free model per request,
so tool support is intermittent.

## Known limitations

- **Effort levels are not discoverable per model.** The catalog says whether
  effort is supported, never which discrete levels are accepted. An unsupported
  level surfaces the provider's error verbatim.
- **MCP support is not discoverable per model.** It is a provider-side plugin
  concept, not a model capability.
- **The catalog is global, not key-filtered.** "What this key supports" is the
  catalog plus your credit balance, which is why the key readout is in the menu.
- **Vision and audio models are listed but not usable yet.** Image attachments
  are accepted and shown, but only text is inlined into the prompt — a non-text
  attachment says so in place rather than being dropped silently.
- **`npm run tauri build` will not work yet.** The shipping frontend is static
  with no server behind it. The chat server needs to become a sidecar, or the
  transport needs to point at a hosted route.
- **The model is always the picker's.** There is no server-side fallback, so a
  request with no selection is refused rather than silently served by a model
  you did not choose. The composer pre-selects the first free model in the
  catalog so it is usable on first run, and that choice is named in the picker
  and can be changed.
- **Folders need a Chromium browser.** `showDirectoryPicker` is the only way to
  get read access to a real folder, so on other engines the footer says so
  instead of offering a list the app cannot honour. Recents are re-granted via
  IndexedDB; a revoked grant clears the file list rather than leaving stale paths.
- **Sessions are per-browser `localStorage`.** No account, no sync. Attachment
  text is captured at send time so a restored thread keeps its context; the
  original `File` object cannot survive a reload.
- **Streaming text is revealed by `requestAnimationFrame`.** In a background tab
  the reveal pauses and catches up when the tab is focused again.
- **Agent mode has no tool execution.** Modes change the system prompt only. A
  model may describe commands it would run; it cannot run them.

## Local edits to generated files

These files come from the assistant-ui component registry and are regenerated by
`npx shadcn@latest add @assistant-ui/thread`. Each edit below is marked in place
and **will be lost on regeneration**:

| File | Edit |
|---|---|
| `src/components/thread.aui.tsx` | `overflow-y-auto` (scrollbar appears only when scrollable); model picker in the composer rail |
| `src/components/tooltip-icon-button.tsx` | padding derived from size instead of hardcoded |

The composer surface and scrollbar styling deliberately live in
`src/index.css` (unlayered, so they beat Tailwind's layered utilities) precisely
so they survive regeneration.

## Vendored component library

66 components from the `ui-haven` library are in `src/components/<name>/`, with
helpers in `src/lib/{hotkey,motion}.ts` and `src/hooks/`. They are additive and
unreferenced by the chat, kept available for future UI work.

`src/blocks/prompt-input/` is their full prompt-input block. It is **not wired
up**: it is coupled to its own context and would mean replacing assistant-ui's
composer wholesale. Kept for reference. Its useful patterns — a DropdownMenu
model/effort rail, and the `EffortFill` idea — informed `ComposerModelPicker`.

Test files and other unused archive data were removed on import.