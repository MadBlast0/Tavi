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
`src-tauri/tauri.conf.json` already invokes the same command, so `npm run tauri dev`
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
> `docs/plan/Plan_master.md` §9.2.

## Configuration

| Setting | Default | Effect |
|---|---|---|
| `OPENROUTER_API_KEY` | — | Provider key. Server-side only. |
| `CHAT_SERVER_PORT` | `8787` | Chat server port. Must match the proxy target; both read this variable. |

There is no default model. The server streams only the model the client sends,
and rejects a request that carries none with `400 No model selected`.

Your last pick is remembered. Model, effort, mode and composer layout are
restored on load, and a stored model that has left the catalogue is replaced
with one the picker names. See [`docs/storage.md`](docs/storage.md) for where
each kind of data lives on the web and desktop targets.

## Storage

| Data | Where |
|---|---|
| Preferences (model, effort, mode, layout) | `localStorage` via `src/lib/prefs.ts` |
| Conversation threads | `localStorage` via `src/lib/sessions.ts`, capped at 50 |
| Folder handles | IndexedDB via `src/lib/fs-access.ts` — handles cannot go in `localStorage` |
| API key | OS credential store, through Rust. Never web storage |

Browser storage is evictable, and that is fine on the web target but not for an
installed app. `docs/storage.md` covers the platform paths and what should move
into an app-data file.

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
- Reasoning is modelled as **five separate capabilities**, not one setting:
  whether a reasoning mechanism exists, reasoning *effort*, *thinking mode*, a
  *thinking budget*, and *reasoning display*. They have different semantics and
  are never substituted for one another. In particular effort, thinking mode and
  reasoning display are never conflated — see `src/lib/reasoning.ts`.
- The effort selector offers **only the levels the selected model publishes**,
  with the provider's own wire values and labels. Across the live catalogue that
  is 27 distinct level sets, from `[high]` to
  `[none, minimal, low, medium, high, xhigh, max]` — including sets with holes,
  such as `[none, high]` or `[low, high, max]`. There is no universal level list,
  and an earlier hardcoded one was wrong for most models.
- A model that accepts the effort *parameter* but publishes no levels for it gets
  **no picker and an explanation**, not an assumed range. An absent metadata
  field is treated as `unknown`, which is distinct from `unsupported`: the
  former means "not looked up", the latter means "documented as absent".
- **Choosing no effort means the provider's default, expressed by omitting the
  field** — never by sending `medium` or any other value. An explicit choice the
  model cannot honour is refused with `400` and the list it does accept; it is
  never quietly remapped.
- `none` is shown as whatever the provider calls it ("None"), and is *not*
  treated as a universal "thinking off". Turning thinking off is a
  **thinking-mode** decision, which providers model separately and which
  OpenRouter does not publish at all.
- Selection and effort persist in local storage; both are preferences, not
- Selection and effort persist in local storage; both are preferences, not
  secrets.

### Provider support

All four adapters are implemented. What differs is **how each one's capabilities
were established** — and that distinction is deliberate, because three of them
cannot be verified live from this checkout.

| Provider | Capability source | Verified |
| --- | --- | --- |
| **OpenRouter** | Live `GET /api/v1/models`, per-model `reasoning.supported_efforts` | **Live** — 471 models, 204 publishing level sets |
| **Anthropic** | Documented `GET /v1/models` capability schema (`capabilities.effort`, `capabilities.thinking.types`) | **Fixtures only** — a live run needs `ANTHROPIC_API_KEY` |
| **OpenAI** | Curated from the official reasoning guide. `GET /v1/models` is a listing endpoint, not a capability schema, so nothing is derived from it; uncurated models stay `unknown` | **Fixtures only** — needs `OPENAI_API_KEY` |
| **NVIDIA NIM** | `GET /v1/models` returns only `id`/`object`/`created`/`owned_by` — **no capability metadata whatsoever** | **Fixtures only** — listing is public |

**NVIDIA NIM specifically.** Effort controls are *not* inherently impossible on
NIM — NVIDIA documents `reasoning_effort` for its GPT-OSS models in multi-LLM
deployments configured with `NIM_REASONING_PARSER=openai_gptoss`. That is a
**server-side deployment setting the API does not expose**, so this app cannot
establish whether it is set. Rather than match on a model name and offer a control
that silently fails on an unconfigured deployment, every NIM model resolves to
`unknown` and stays on the provider default. The documented levels are recorded in
`server/providers.nim.ts` with their source, and `nimEffortFromDeployment` is the
single seam where a deployment capability channel would slot in.

### How effort reaches the provider

Effort is one facet of five (capability, effort, thinking mode, thinking budget,
display) and is validated on its own. `reasoning.effort` (OpenRouter),
`output_config.effort` (Anthropic) and `reasoning.effort` (OpenAI) are three
different wire parameters; none is derived from another. Choosing no effort omits
the field entirely — it is never `medium`. An explicit value a model does not
accept is refused with a message naming what it does accept.

`max` is a real value on OpenRouter's `reasoning.effort` surface (94 models
publish it) even though it is absent from the separate `reasoning_effort` enum,
and it is verified live: on `upstage/solar-mini4`, `xhigh` returned 45 reasoning
tokens and `max` returned 298. It is *not* borrowed from `verbosity`, which is a
third, unrelated parameter controlling answer length.

Provider-specific behaviour lives in `server/providers*.ts` only. Adding one means
adding an adapter there; the UI and the request path do not change.

`openrouter/free` is sorted last: it routes to a random free model per request,
so tool support is intermittent.

## Known limitations

- **The account row is not an account.** It opens a menu on click and shows
  the two facts this app has about itself — the machine it is running on, and
  the provider key it can reach, including whether that key is on a free tier.
  There is no signed-in user, no email, no plan to upgrade and nothing to log
  out of, because there is no auth anywhere in the app, so a menu carrying those
  items would be a picture of a sign-in that does not exist. The row and its
  open-on-click behaviour are built; the contents are what is actually known.
- **Most of the rail has nothing behind it yet.** Chat offers Projects,
  Artifacts, Scheduled and Customize; Code offers Artifacts, Routines,
  Scheduled and Customize. None of those destinations exists, so all eight rows
  are rendered disabled and say why on hover. Only `New` works. The two lists are
  kept separate rather than merged because Chat and Code are meant to lead
  somewhere different — sharing rows that happen to look alike would mean
  offering each mode something the other cannot honour.
- **The thread menu has no Archive and no Move to project.** Right-clicking a
  thread in the rail gives Pin, Rename, Copy ID, Delete, plus Fork in Code. Those
  are the options the comparable apps offer that this one can actually honour.
  Two that show up in Cursor, Zed and Kimi Code are left out on purpose. Archive
  is the reversible option, and it needs somewhere to read archived threads and a
  way back out of it, which would be a second list rather than a menu item. Move
  to project needs a project to move to, and `GET /api/projects` returns nothing,
  so the picker would open empty. An empty picker is worse than no picker.
- **Code's thread list is grouped by project, and projects are usually
  empty.** A thread records the folder it was run against, so that is what the
  grouping uses. `GET /api/projects` currently returns an empty list because
  nothing has been cloned into the projects folder, so every real thread lands
  under a `No folder` group until one has a folder on it. The grouping is
  derived from the thread, not invented for it: a thread with no folder is
  labelled as having none rather than being hidden or given a name.
- **The rail's width is not remembered.** Dragging the seam sets it for the
  session and a reload returns it to the default. A width chosen on one screen
  is the wrong width on another, and storing it would reopen the app with the
  work area squeezed for no reason.
- **The app font can only be listed in the desktop app.** The Appearance
  settings let you pick any font installed on the machine, discovered through the
  OS: DirectWrite on Windows, Core Text on macOS, Fontconfig on Linux. A web page
  has no access to the system font registry — there is no standard API for it, and
  the Chromium-only Local Font Access API would mean a permission prompt and a
  different answer per browser — so `npm run dev` shows the app's own font and a
  message saying where the list comes from, rather than a fake one. This is also
  why there is no bundled list of font names anywhere: a list written into the
  app would name fonts that are not installed, and CSS substitutes silently, so
  every one of them would render as the fallback while appearing to have worked.
- **Building on Linux needs Fontconfig and FreeType development packages.** The
  font picker reaches the system through `font-kit`, which links both. On
  Debian and Ubuntu:

  ```sh
  sudo apt install pkg-config libfreetype6-dev libfontconfig1-dev
  ```

  Fedora and RHEL equivalents are `pkgconf-pkg-config`, `freetype-devel` and
  `fontconfig-devel`; Arch is `pkgconf`, `freetype2-dev` and `fontconfig-dev`.
  Windows and macOS need nothing extra, as both backends are part of the system.
  Only the Linux build is affected — the web target never calls into them.
- **Dictation depends on a browser speech service, and the desktop app may not
  have one.** The microphone uses the Web Speech API with the system default
  device — there is nothing to configure, and no device picker exists. That API
  is not local: Chromium's implementation streams audio to a hosted speech
  service. In an ordinary browser tab it works. In the Tauri webview it generally
  does not, because the webview has no route to that service and no key baked in,
  so `service-not-allowed` or `network` is the likely outcome. The app reports
  which of those happened rather than failing silently, but reporting it is not
  the same as working.
- **Only the local environment exists.** The composer footer carries an
  environment picker because the upstream assistant-ui composer it is modelled on
  has one. `Local` works; `SSH` and `Cloud` are listed above it, greyed out,
  marked "Soon" and refusing the click, because there is no remote transport and
  no hosted backend to point them at. `docs/plan/Plan_master.md` puts cloud
  synchronization out of scope. There is no state behind the picker — the value
  can only ever be `local`, so a state variable would overstate what the app can
  do.
- **The environment scopes the folder picker.** Which filesystem "choose a
  folder" means depends on where the agent runs — VS Code merges the two into one
  picker for the same reason, searching local, GitHub and remote workspaces
  through a single control. Here the folder control takes its copy from
  `FOLDER_SOURCE`, keyed by `SelectableEnvironment`, so making a second
  environment selectable fails to compile until that environment says what its
  files are called and where they live. Only `local` has an entry, because only
  `local` has a filesystem behind it.
- **Effort levels come from OpenRouter's `supported_efforts`.** That is per
  model and accurate, but it is the *gateway's* view, translated into its own
  vocabulary: `minimal` is sent to Claude as `low`, and `xhigh` maps down to
  `high` for Gemini. A model served direct from another provider would need an
  adapter beside the others in `server/providers.ts` before its real levels could
  be trusted.
- **There is no "ultracode" effort level.** Claude Code has a toggle by that
  name, but its own docs describe it as a session setting that orchestrates
  subagents, not an effort value — and `ultrathink` is a prompt keyword
  rewritten client-side. Neither is a `reasoning_effort` value, so neither can
  be sent to an API.
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
