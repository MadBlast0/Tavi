# Tavi

A Tauri v2 desktop chat app built on [assistant-ui](https://www.assistant-ui.com)
and the Vercel AI SDK, with live model discovery and a selectable model.

## Architecture

```
┌──────────────────────────────────────────────────────┐
│ Tauri window (Rust shell)                            │
│  ├─ Webview: React + assistant-ui Thread              │
│  │    · the composer, the rail and the conversations  │
│  │    · no provider key, ever                        │
│  └─ src-tauri/  Rust commands                        │
│       · chat — makes the provider request            │
│       · model catalogue, key standing                 │
│       · conversations in the app's own file           │
│       · workspace grants — what the tools may reach   │
│       · projects — running git                        │
│       · set/clear_api_key (OS credential store)       │
└───────────────────────────┬──────────────────────────┘
                            │ HTTPS
                       OpenRouter
```

The desktop app talks to the provider from Rust, not from JavaScript. The key
is read from the OS credential store, used, and never handed out; there is no
local port and no local endpoint for another process to post to.

The website has no Rust, so it has a server of its own:

```
┌───────────────────────────┐
│ Browser                   │
│  └─ fetch /api/…          │
└─────────┬─────────────────┘
          │ HTTP
┌─────────▼─────────────────┐
│ Node server       :8787   │
│  server/main.ts           │
│  · /api/chat  /api/models  │
│  · /api/key   /api/projects│
└─────────┬─────────────────┘
          │ HTTPS
     OpenRouter
```

The two read the same instruction text, out of `shared/instructions.json`, and
the same request shape, so a model is told the same thing and asked the same
way whichever surface the request came from. Vite proxies `/api` to the server
in development, and `pnpm tauri dev` starts both. The same chat route can later
deploy as a serverless function, which is what makes a web build cheap.

## Prerequisites

- Node 20+
- pnpm — `npm install -g --allow-scripts=pnpm pnpm`
- Rust (stable) — `winget install Rustlang.Rust` or <https://rustup.rs>
- Windows: MSVC Build Tools (already present on this machine)

## Running

```bash
pnpm install

# web target — http://localhost:1420, with the Node server behind it
pnpm dev

# desktop window — the app talks to the provider from Rust, so it needs
# nothing but the frontend server
pnpm tauri dev
```

Or double-click `preview.bat`, which does the same thing and stays open on
failure.

Nothing here needs a `.env.local` — the app starts without one and says so when
you try to chat. If you would rather keep the key in the environment than in
the app, copy `.env.example` to `.env.local` and fill it in. A development build
reads that file for the key as well, so the same file serves both targets: the
website's server takes the key from its environment, and the desktop app reads
the file itself. Neither copies it anywhere, and a release build does not look
for it at all.

`pnpm dev` starts Vite and the Node server together via `concurrently`.
`pnpm dev:web` starts only Vite, and `pnpm dev:server` only the Node server.
`pnpm tauri dev` starts both as well as the desktop window, so the browser at
`http://localhost:1420` has a backend to talk to while the app is open.

This project uses pnpm and ships `pnpm-lock.yaml`. Do not install with npm: it
would resolve a different set of versions from the registry and put it in
`node_modules` without saying so, and the app would start against dependencies
nobody else has.

### Running two checkouts at once

Two checkouts of this source on one machine cannot share the same ports, or
they run over each other. Vite is set to fail rather than to move when its
port is taken, the chat server cannot bind a port that is already bound, and —
the one that bites quietly — the frontend of one answers with the backend of
the other, because the proxy target is a port number and not a checkout.

So each checkout takes a port of its own:

| | Web | Chat server |
|---|---|---|
| The first | `1420` | `8787` |
| The second | `1430` | `8790` |

```bash
TAVI_WEB_PORT=1430 CHAT_SERVER_PORT=8790 pnpm dev
```

The desktop app needs the same two, because the window loads the frontend from
a URL in the Tauri config and that URL has to be the web port. The config has
no way to read an environment variable, so it is given an override file, which
Tauri merges over the file's own settings:

```json
// tauri.local.json
{
  "build": {
    "devUrl": "http://localhost:1430",
    "beforeDevCommand": "pnpm dev"
  }
}
```

```bash
pnpm tauri dev --config tauri.local.json
```

It is a **file** rather than a string on the command line because PowerShell
takes the double quotes out of an argument before a native program sees it, and
the CLI wants JSON — `pnpm tauri dev --config '{"build":{...}}'` arrives
without its quotes and is refused as malformed.

And the two need their own folder for the app's files, because the app's data
directory is named after the app's identifier and that is the same in every
checkout: without this, both write the same conversations file and fight over
the same remembered window.

```bash
TAVI_DATA_DIR=~/.tavi/second TAVI_PROJECTS_DIR=~/.tavi/second-projects pnpm tauri dev --config tauri.local.json
```

The **credential store is not redirected**, and deliberately so: a key belongs
to a user and a provider, not to a checkout of the source, so two copies of the
app share one key.

## Branches and merging

There are two long-lived lines. **`master`** is the line of work — new work
is committed there, and the other branches are cut from it. **`main`** is the
trunk: everything finished is merged into it, and it is the line that is
provable at any moment.

A merge into `main` is **proved before it is committed**. The lockfile has
to install, the TypeScript has to compile, the tests have to pass, the app
has to build, and the Rust side has to compile with warnings as errors. A
merge that does not pass is aborted, and `main` is left exactly as it was.

A merge on a timer does the part a machine can do, and hands the rest to an
agent: the script merges and proves, and when a merge conflicts or the gate
goes red, it wakes an agent with the failing output and the rules to keep.

```powershell
./scripts/install-merge-timer.ps1   # merge and prove every 30 minutes
./scripts/merge-main.ps1 -Report    # what is in main, and what is not
```

[`docs/merging.md`](docs/merging.md) has the whole thing: the gate, the
timer, the report, and the two merges that needed a judgement call.

## Provider keys

Tavi talks to **twenty-eight** providers, and to any OpenAI-compatible
endpoint of your own. The list is in
[`src/lib/providers.ts`](src/lib/providers.ts), one row each: where the API
lives, how the key is sent, the shape of a request, and the field a reasoning
level goes in. The desktop app and the website's server read the same table,
and a test says the two agree.

| | Which |
|---|---|
| OpenAI · Anthropic · Google Gemini · OpenRouter · DeepSeek · xAI · Mistral · Groq · Together AI · Fireworks AI · Cerebras · NVIDIA NIM | the OpenAI chat-completions shape |
| Hugging Face · DeepInfra · Azure OpenAI · Moonshot AI (Kimi) · Z.ai (GLM) · Alibaba Model Studio · Perplexity · Replicate · SambaNova · Cloudflare AI Gateway · IBM watsonx · Databricks | the OpenAI chat-completions shape, at an address of their own |
| Anthropic · MiniMax | Anthropic's Messages shape |
| Google Gemini | Google's generate-content shape |
| Cohere | Cohere's chat shape |
| **Custom endpoint** | the OpenAI chat-completions shape, at an address you give |

A **custom endpoint** is for a gateway, a proxy, or a model running on this
machine: the key carries the address, and the address wins over any default.
A few of the providers above need one too — an Azure resource and a
Databricks workspace are not at somebody else's address — and the settings
pane asks for it when it is needed.

The composer has a **provider** control of its own, beside the model one. The
model picker waits for it, because the models belong to one; the control opens
a dropdown with an **API provider** and a **CLI provider**, and pointing at
either opens **its own dropdown beside it** — the API one is a searchable list
of the providers you have a key for. A chat or a session records the provider
it was started with, and it can still be changed — the conversation is text,
and the effort is checked against the new model.


A key is a credential with an identity. It belongs to a provider, it has a name
the user gave it, and there can be more than one for the same provider — a
personal key and a work key for OpenRouter, which is the case every provider's
own console has to answer for. The providers are listed in
`src/lib/providers.ts`, which the desktop app and the website's server both
read, so the two call the same providers by the same names: OpenRouter,
Anthropic, OpenAI and NVIDIA NIM.

**Every address in that table was checked against the provider itself.** A
provider that answers 401 to a request it understands and 404 to one it does
not is how the addresses were settled: a wrong address is a 404, and a right
one with no key is a 401.

**Settings → Platform → API keys** is where a key is set, and it is the same
screen in the app and in the browser: the same list, the same buttons, the same
dialog. What differs is where the key is kept.

| Build | Where the secret is kept | Where the key's details are kept |
|---|---|---|
| Desktop | The OS credential store — Windows Credential Manager, macOS Keychain, or libsecret — filed under `api-key:<id>` | `provider-keys.json` in the app's data directory, beside `window-state.json` |
| Website | The server's own file, `~/.config/tavi/keys` (`%APPDATA%\Tavi\keys` on Windows) | The same file, in the same record as the secret |

The split is not a choice, it is a fact about the platforms. The operating
system's credential store cannot be enumerated — there is no "list" in it — and
cannot hold portable metadata, so a sidecar file is the only design that works.
The sidecar holds **no secret**: it holds the key's name, when it was added,
when it was last used, and the provider's own masked account name.

The sidecar on the desktop is `0700`/`0600` on macOS and Linux; on Windows the
file inherits the app data folder's ACL, which is the user's alone. The
server's file is `0700`/`0600` everywhere the platform has such a bit, written
atomically with the previous copy kept beside it, and it is **not** in the
documents folder — that one is commonly synced to somebody else's server.

Which key a request goes out with is an explicit pointer, never an inference.
"Newest wins", "first in the list" and "the one the provider last accepted" all
silently change which account is billed. Exactly one key per provider is active,
and the pane says which.

A key that is in the environment is used when the store has none, so a
deployment that sets `OPENROUTER_API_KEY` the usual way keeps working. A key
set from the settings pane wins over the environment variable.

The desktop app is the same in this respect: the credential store is where a
key lives, and in a development build the `.env.local` file is read when the
store has none. The pane says which one a key came from, and does not offer to
edit or remove one that is not in the store — there would be nothing there to
change.

A key is never written to disk in plaintext by the desktop app, never placed
in local storage, and never logged. On the desktop it is also never read into
JavaScript: Rust takes it from the credential store, makes the request, and
hands back the answer. There is no command that gives it out.

### Checking a key

Each provider is checked the only way it can be. OpenRouter, Anthropic and
OpenAI publish a free endpoint that answers "no" for a bad key, and the app
asks it. **NVIDIA NIM does not**: its model list is public and answers `200` to
any caller, with a bad key and with no key at all, so it cannot tell a good key
from a bad one. The only endpoint that can is the inference one, which costs a
real request — so NIM keys are saved unchecked, the pane says they have not
been checked, and a **Check now** button spends one request when the user asks
for it.

A `429` means the key is good and the account is rate limited; a `402` means
the account is out of credit. Neither is ever shown as "Not accepted", and a
`404` is never a key problem at all.

### The server's keys are the operator's own

> The website's server is a **local** server. It holds the operator's own keys,
> it listens on the loopback interface only, and the routes that change a key
> are refused unless the request comes from this machine, addressed to a name
> the server answers to, and carries the header that makes a browser ask
> first. The app's own requests are made through OpenRouter, which is the
> provider the desktop app talks to; a key for another provider is stored and
> can be checked, but nothing in the app speaks to those providers yet.

A deployment that puts the server behind a proxy on another machine sets
`TAVI_BIND_HOST` and `TAVI_ALLOWED_HOSTS`, and is then responsible for the
routes it exposes: the server has no authentication of its own, and the app
has no account system to authenticate with.

## Configuration

| Setting | Default | Effect |
|---|---|---|
| `OPENROUTER_API_KEY` | — | OpenRouter key. Server-side only, and only when the server's own file has none. |
| `ANTHROPIC_API_KEY` | — | Anthropic key. Server-side only. |
| `OPENAI_API_KEY` | — | OpenAI key. Server-side only. |
| `NVIDIA_API_KEY` | — | NVIDIA NIM key. Server-side only. |
| `TAVI_KEYS_DIR` | `~/.config/tavi/keys` (`%APPDATA%\Tavi\keys` on Windows) | Where the website's server keeps its keys. |
| `TAVI_BIND_HOST` | `127.0.0.1` | Where the website's server listens. |
| `TAVI_ALLOWED_HOSTS` | `localhost,127.0.0.1,[::1]` | The names the server answers to. A request addressed to any other name is refused. |
| `CHAT_SERVER_PORT` | `8787` | Chat server port. Must match the proxy target; both read this variable. |
| `TAVI_WEB_PORT` | `1420` | The web server's port. The hot-reload socket sits one above it, so the two move together. |
| `TAVI_DATA_DIR` | the app's own data directory | Where the desktop app keeps its files — the conversations, the folder grants, the window state. See [running two checkouts at once](#running-two-checkouts-at-once). |
| `TAVI_PROJECTS_DIR` | `<home>/Documents/Tavi/projects` | Where the projects folder is. |

There is no default model. The server streams only the model the client sends,
and rejects a request that carries none with `400 No model selected`.

The window's floor is 600 × 338 logical pixels, set in
`src-tauri/tauri.conf.json`. Logical pixels are density-independent, so the
floor is the same apparent size on every display — 600 × 338 of it — rather
than a count of physical pixels that would mean something different on each
one. A percentage would be the wrong instrument here: it would move the floor
with the monitor, so the same app would be allowed to get smaller on a small
screen than on a large one, which is exactly where the layout needs the room.
The one thing that can still stop the window reaching its floor is the screen
itself — the OS will not give a window more room than the display has.

The window opens at 1030 × 579, which is 16:9, and always in the middle of the
screen. The position is deliberately not remembered: a remembered position is
right on the machine it was remembered on and wrong on every other one, while
the middle of the screen is right everywhere. The size *is* remembered, so
after the first run the app opens as large as it was last left.

### The window on any display

Sizes are in **logical pixels**, which is the unit the app is laid out in and
the unit that means the same thing on every screen. A 4K display at 200% and a
1080p one at 100% are the same size in logical pixels and four times the size
in physical ones, so a window measured in logical pixels is the same *apparent*
size on both — the title bar, the icons and the text all scale with the
display's own scaling rather than with its resolution. A count of physical
pixels would be a window twice the size on the high-density screen and the
same size everywhere else, which is the opposite of what a window is for.

The window is also never allowed to be bigger than the screen it is on. The
work area — the screen without the taskbar and any other permanent furniture
on it — is the ceiling, and Tauri's own `preventOverflow` applies it when the
window is created. A size remembered on a large display is capped the same
way when it is restored on a small one, so the app never opens half off the
screen. The floor is the app's own minimum, and the OS resolves the two
against each other: a display too small even for the floor gets a window as
small as it can be.

Your last pick is remembered. Model, effort and mode are restored on load, and
a stored model that has left the catalogue is replaced with one the picker
names. See [`docs/storage.md`](docs/storage.md) for where each kind of data
lives on the web and desktop targets.

Two things are deliberately *not* remembered, because they are questions about
what you are doing now rather than preferences:

- **Which composer layout the app opens in.** It always opens in Chat, never
  in the layout it was last left in. The model, the effort and the mode are
  choices about *how* to work; which of the two jobs the app starts on is a
  question about what you came to do, and a fresh start is the honest answer
  to it. Coming back to Code is a click.
- **Whether the rail is open.** The first time the app is ever run it is
  closed, so what is on screen is the conversation rather than a list of
  places to go. After that it is remembered, because the rail is a working
  tool: someone living in the session list wants it open every morning, and
  someone who closed it wants it shut. Its *width* is still not remembered, for
  the reason given above it.

### The system tray

The app has an icon in the system tray for as long as it is running.
Right-clicking it gives four things:

| Entry | What it does |
|---|---|
| **Show app** | Brings the window back, un-minimised and in front |
| **New chat** | Brings the window back, with an empty Chat composer in it |
| **New session** | Brings the window back, with an empty Code composer in it |
| **Exit** | Quits the app |

Clicking the icon itself brings the window back too, which is what a click on
an icon in the corner of the screen is expected to do.

**Closing the window hides it rather than quitting the app.** The app stays in
the tray, and the tray is where it is found again; Exit is how the app quits.
That is the trade a tray icon buys: the app is one click away at all times,
and it does not go away when its window does.

The menu is native and the app is React, and the two of them cannot both
decide what a new chat is — which composer is in force and what is in it are
the app's business. So the native side brings the window forward and sends
the app a message, and the app puts the right thing in the window. The names
of those messages are written out in both languages, in
`src-tauri/src/tray.rs` and `src/blocks/shell/tray-bridge.tsx`, because there
is no way to share one string across the boundary.

A request is also **kept until the app has taken it**, so a click that arrives
before the app is listening — which is exactly when someone who has just
started the app is most likely to click it — is not lost. The app takes it
when it mounts, and again when the window is next focused, which covers the
other case: a page that was reloaded has lost its listener without the
native side knowing.

### The app's name

The app is Tavi, and that is the name in every place a user can see it: the
window's title, the taskbar button, the Start menu entry, the installer's
folder, and the icon in the tray.

The **identifier** — `com.mad.tavi` — is a different thing. It is the app's
identity in the operating system, and the app's data directories are named
after it. It changed with the name, and changing it moves the webview's
profile, and with it every stored chat. The app has no migration for that:
the profile has to be moved before the webview starts, and whether to move it
is the user's decision, not the app's. On this machine the old directory was
moved across by hand.

The **icon** is `src-tauri/app-icon.svg` — a vector, so it scales to every
size the platforms ask for without being resampled, and so the letter is a
shape rather than a font the app does not ship. Every platform's icons are
generated from it:

```bash
pnpm tauri icon src-tauri/app-icon.svg
```

The command also writes iOS and Android assets, which this desktop app does
not use; they are deleted after generating.

## Appearance

The app is drawn in two modes — light and dark — and in any number of
palettes. All three are the same kind of thing: a **theme**, which is a set of
numbers. What a theme has to provide is written down in `src/index.css`, and
`src/lib/theme.test.ts` checks that every theme provides it.

### The roles

The app paints itself with a fixed set of roles over those numbers. A theme
that cannot fill a role has a hole in it, and a hole is a surface that cannot
be seen.

| Role | Tokens | What it is |
|---|---|---|
| the canvas | `--background` | the page the app is drawn on |
| a panel | `--card`, `--popover`, `--sidebar` | a surface of its own: a card, a menu, the rail |
| a field | `--input` | a control that takes text, and the faint tint a raised control wears |
| a fill | `--secondary`, `--muted`, `--accent` | a solid surface: a chip, a row, a hover |
| a divider | `--border` | the line between two things |
| a menu | `--menu-surface` | the surface a dropdown and its submenus are drawn on |
| text | `--foreground`, `--muted-foreground` | and the colour it is on |

### The rules

1. **Nothing is missing.** A theme defines every token the base defines. A
   token that is absent is not a neutral value.
2. **A surface is separated from what it sits on.** A fill, a tint or a panel
   has to differ from the canvas by a visible step, or it is the same colour
   as the page behind it.
3. **The two themes have the same shape.** A panel is a step from the canvas,
   the rail is the same colour as a panel, and the rail's own rows are the
   same colour as any other fill. The dark theme steps *up* from the canvas
   and the light theme steps *down* from it — the text is above the canvas
   in one and below it in the other — but they take the same size of step, so
   the two modes have the same relationships and only the direction differs.
4. **Text is readable.** The foreground, and the muted foreground, both have to
   clear a contrast ratio that makes them readable rather than merely present.
5. **No hairlines.** Surfaces are separated by their fill, not by an edge drawn
   around them.
6. **A menu is a step further from the canvas than the rail is.** A menu floats
   over the page rather than lying on it, and it is the one surface that can be
   sitting on the rail — which it is the same colour as. So a menu is drawn on
   `--menu-surface`, one step further from the canvas than the rail: further
   *down* in the light theme, further *up* in the dark one, the same step in
   both directions.

Each rule is a test, so a palette that breaks one fails the build with a
message naming the theme, the token and the number. The rules are about
contrast rather than about particular values: a palette is free to be any
colour it likes, and what it cannot do is make a surface that cannot be seen.

### Menus

Dropdowns, their submenus and the right-click menu are all drawn by one
component, `src/components/dropdown-menu/dropdown-menu.tsx`, so they are the
same shape by construction rather than by two files happening to be edited
together. The context menu is a second component with the same surface.

A menu carries **no shadow and no edge** — an edge around a menu would be a
hairline, which is what rule 5 is about. It is separated by its fill alone,
and that fill is the composer's text field's colour: the one surface in the
app that is already a step further from the canvas than the rail is, and that
takes the same step in both modes. Measured, a menu is 1.163:1 from the rail
in the light theme and 1.153:1 in the dark one, and 1.31:1 and 1.27:1 from the
white of the work area.

The corner radius is `rounded-3xl`, 22 pixels, and it does more of the work
than it looks: it is what tells you where the menu ends when it is over the
rail, since the fill alone cannot say much at that contrast.

### The mechanism

A surface is the canvas **tinted toward the foreground** — white in the dark
theme, near-black in the light one. The tokens carry the direction, so a
component never has to know which mode it is in, and the same class paints the
same kind of button in both. A light theme and a dark theme are the same
shapes with the same relationships and opposite directions, like a photograph
and its negative.

The light theme did not follow that, and it is what made the two modes look
like different apps rather than one app in two clothes. Its muted fill was a
hundredth of a shade from white, so the chips, the composer's field and the
rail were all the same colour as the page behind them; its card was the canvas;
and its rail was a different colour from its card, which the dark theme's rail
was not. The two themes now take the same steps, and the dark theme's are the
ones the app has always had.

A hairline was tried as well: `--hairline` was defined, and ninety-odd places
in the app put a one-pixel border around themselves — buttons, cards, fields,
menus, separators. The edges did not earn their place. The test now forbids
the variable being defined, so the hairlines cannot come back.

### Adding a palette

Give it an id in `src/lib/palette.ts`, then add two blocks to
`src/index.css`:

```css
html:not(.dark)[data-palette="your-id"] { ...light tokens... }
.dark[data-palette="your-id"] { ...dark tokens... }
```

The `:not(.dark)` on the light one is not decoration. `[data-palette="x"]` is
one attribute and `.dark` is one class, so they have the same specificity and
whichever comes later wins — a light block written after `.dark` overrides the
dark tokens and the app renders light in both modes. Excluding `.dark` from
the light selector removes the contest entirely: the two rules can no longer
both match, so their order stops mattering.

The palette's swatch in `src/lib/palette.ts` shows what the theme looks like,
and it is not read back off the stylesheet: a swatch has to be drawable for a
palette that is not currently applied. Keep it in step by hand — a palette
that ships the wrong strip is noticed immediately, because the strip sits next
to the thing it describes.

## Storage

| Data | Where |
|---|---|
| Conversations (chats and code sessions) | The app's own file on the desktop, `localStorage` on the web. Capped at 50 each |
| Preferences (model and effort per side, agent mode per folder, rail open) | `localStorage` via `src/lib/prefs.ts` |
| Composer drafts | `localStorage`, one per side |
| Folder handles | IndexedDB via `src/lib/fs-access.ts` — handles cannot go in `localStorage` |
| API key | OS credential store, through Rust. Never web storage, never JavaScript |

The conversations are in the app's own data directory on the desktop, in one
file written by Rust, with the previous one kept beside it. That is the change
that makes an installed app different from a website: browser storage is
evictable, and a conversation is worth more than the tidiness of a folder that
the browser may clear. The website has no such directory, so it keeps them in
browser storage, and the conversations that were there are brought across the
first time the desktop app runs — and the old copy is only removed once the new
one has been read back.

Everything can be exported to a file and put back again, and removed outright,
from Settings → Privacy. [`docs/storage.md`](docs/storage.md) covers the
platform paths in full.

## The two surfaces

The app has two places to be: **Chat** and **Code**. The switch is at the top
of the rail, and it changes what the rail holds and what the work area shows.

**A chat is not a code session.** They are separate objects, in separate
stores, with separate lists.

| | Chat | Code |
|---|---|---|
| A thread is called | a chat | a session |
| The rail's list | "Chats", flat | "Sessions", grouped by project |
| Owns a project folder | no | yes |
| Owns an agent mode (Edit / Plan / Ask) | no | yes |
| Files in context | attachments only | the folder's files and `@` mentions, inlined at send time |
| Tools | none — the server refuses a chat that carries any | the toolkit, bounded by a grant on the folder (not wired into this surface) |
| System prompt | a conversation | the mode's instruction, and the folder |
| Model and effort | remembered for the Chat side | remembered for the Code side |

Switching between them takes you to the other side's conversation, or to an
empty one if that side has none — never to the other side's thread. Opening a
thread moves the switch with it, so opening a session puts the composer in
Code. A reply in flight is aborted on a switch and its partial text kept,
because one composer has one stream.

**The server writes the system prompt.** The client sends the facts — which
surface, which agent mode, which folder — and the server decides what the model
is told. So a request that carries no surface is refused, a request that
carries its own system prompt is refused, and a chat that carries tools is
refused. A rule the client could ignore is not a rule.

**A folder is forgotten from the folder it belongs to.** Right-click a folder in
the Code composer's picker and its own sub-menu carries "Forget folder".
Forgetting takes the folder out of the picker and nothing else: the sessions
that ran against it keep their history, keep the project they were run against,
and stay in the rail.

## Tools

The app's live chat path carries no tools. A conversation is a conversation: the
model sees the text and the attachments that came with it, and it says so
plainly rather than implying that it read a file it did not.

The toolkit in `src/toolkit.tsx` is a second path, kept for the assistant-ui
surface, and it is not mounted. Its two native tools have been moved onto the
same boundary the rest of the app uses:

| Tool | Runs | Purpose |
|---|---|---|
| `current_time` | webview | ISO timestamp |
| `evaluate_expression` | webview | Arithmetic. Recursive-descent parser; never uses `eval` or dynamic function construction. |
| `fetch_url` | webview | Fetches and strips markup, truncated to 4000 chars. **CORS-limited** — see below. |
| `list_workspace_entries` | Tauri | Lists a folder inside the workspace the session is attached to |
| `read_workspace_file` | Tauri | Reads a file from inside it, capped in size |

### The native tools are bounded by a grant

A path the model names is not a permission. The app holds a **grant** — a
canonical path the user chose — and the native tools work only inside one.
There is no default root and no fallback to the home directory: a machine with
no grants has no folders the model can reach.

The model may name a file *inside* a workspace. It may not name a workspace and
it may not name a path. The path is resolved before it is opened, so a link
that points out of the workspace is refused as well as a `..` that climbs out
of it. `AI_APP_FS_ROOT`, if it is set, caps what may be granted — it never
grants anything by itself.

On the desktop the app's own folders are grants too, made through the system
dialog, so the *app's* file access and the *native* tools are bounded by the
same thing. On the website a folder is the browser's handle, and the browser
enforces it. The rules about which files are worth walking for are in
`src/lib/file-rules.ts` and are read by both, so the model is shown the same
files on each.

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

Native tools require the desktop app and say so plainly in the browser rather
than failing opaquely.

## Model selection

The composer rail carries a model picker that reads the catalogue — OpenRouter's
public catalog, projected to a slim shape and cached for 15 minutes. On the
website it comes from the server; on the desktop it comes from Rust, and it is
read by the same code either way, so the picker offers the same models.

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
- Selection and effort persist in local storage, **per side** — the model you
  chat with and the model you code with are two choices, and each side keeps
  its own. Both are preferences, not secrets.

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

- **A provider's own catalogue is the only source of what a model can do.** A
  provider that publishes no capability metadata — which is most of them —
  leaves the effort control off for its models, because the app will not
  offer a setting it cannot verify. The picker's control is the provider
  default, and that is the honest position.
- **A key is one of several for its provider.** A key is filed under its own
  id, named by the user, and exactly one of a provider's keys is the one
  requests go out with — an explicit pointer, never an inference from which
  key is newest or which one the provider last accepted. The pane shows the
  provider's own account name and masked value for each key, whether the
  provider accepts it, whether it is on a free tier, and what is left of its
  spending cap. There is no billing behind any of it, because a provider key
  is the only account the app has.
- **NVIDIA NIM keys cannot be checked for free.** Its model list is public and
  answers `200` to any caller, so it cannot tell a good key from a bad one,
  and the only endpoint that can is the inference one — which costs a request.
  A NIM key is therefore saved unchecked, the pane says it has not been
  checked, and a **Check now** button spends one request when the user asks
  for it. The list never spends the user's quota on its own.
- **The application menu is mostly a shape.** File, Edit, View, Go and Help are
  there with their submenus, so the app has the menu bar the machine expects,
  but only three of the commands do anything: New chat, Close window and Exit,
  which are the same three the system tray has. The rest are rendered disabled
  and say why on hover. In a browser, "Close window" and "Exit" are disabled
  too — a tab cannot be hidden or closed from the page — and they say so. A
  menu that looked complete and did nothing would be a lie about how much of
  the app exists.
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
  to project needs a project to move to, and the only ones there are the
  repositories that have been cloned, so the picker would open on a list that is
  usually empty. An empty picker is worse than no picker.
- **Code's thread list is grouped by project, and projects are usually
  empty.** A session records the folder it was run against, so that is what the
  grouping uses. `GET /api/projects` currently returns an empty list because
  nothing has been cloned into the projects folder, so every real session lands
  under a `No folder` group until one has a folder on it. The grouping is
  derived from the session, not invented for it: a session with no folder is
  labelled as having none rather than being hidden or given a name.
- **The rail's width is not remembered.** Dragging the seam sets it for the
  session and a reload returns it to the default. A width chosen on one screen
  is the wrong width on another, and storing it would reopen the app with the
  work area squeezed for no reason.
- **The window's remembered size can drift on Linux desktops that draw their own decorations.** The
  size is measured as the window's content and restored by asking for that
  content size. On Windows and macOS the two are the same measurement and the
  round trip is exact. On GNOME with Wayland, asking for a content size of X
  produces a content size of X plus the height of the decoration, so the
  window grows a little on every launch. The same drift is in Tauri's own
  window-state plugin, and the fix needs the decoration extent, which only the
  platform knows.
- **The window has no native caption.** The app draws its own title bar: the
  app's controls on the left, the window's on the right, and the space between
  them as the region the window is dragged by. That is what puts the two
  controls in one bar instead of two — the operating system's caption sat above
  the app's, and the app's own bar was a second strip under it. The caption is
  gone as a whole, because the icon and the name are part of it and cannot be
  lifted off on their own; the taskbar still shows the icon. What this costs is
  Windows' snap layouts — hovering the maximize button no longer offers the
  half-screen and quadrant choices, since those belong to the caption button
  that has been replaced. Everything else about the window is unchanged: it
  resizes from its edges, it still snaps with the keyboard, and a double-click
  in the drag region maximizes it.
- **The tray's menu opens on the right button on Windows and macOS, and on the
  system's own button on Linux.** The tray implementation the app uses does not
  support choosing which button opens the menu outside Windows and macOS, so
  on Linux the menu follows the system's convention — and the click that opens
  it also brings the window forward, which is harmless but is not what happens
  elsewhere.
- **The app font can only be listed in the desktop app.** The Appearance
  settings let you pick any font installed on the machine, discovered through the
  OS: DirectWrite on Windows, Core Text on macOS, Fontconfig on Linux. A web page
  has no access to the system font registry — there is no standard API for it, and
  the Chromium-only Local Font Access API would mean a permission prompt and a
  different answer per browser — so `pnpm dev` shows the app's own font and a
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
- **A notification only works for an installed app on Windows.** The desktop app
  raises a toast from the operating system when a reply finishes while the app
  is in the background, and the operating system decides which applications
  may raise one: **only an installed one**. A development build shows a toast
  from powershell, with powershell's name and icon, and an installed build
  shows the app's. That is the platform's rule about which applications may
  interrupt, not something the app can work around. The website's
  notifications are the browser's own, and a browser tab that is **closed**
  gets none — the tab is not there to raise one, and a notification that
  outlived it would need a push service and a service worker.
- **A notification says a reply finished, and nothing more.** The app knows when
  the provider stopped sending text. It does not know whether the answer's
  "I'll run the tests and fix what fails" was followed by anything, because the
  app cannot write files and the model cannot run commands. So the wording is
  "a reply finished", and it is never "the task is finished" — which would be
  a claim the app cannot support.
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
  model and accurate, and the values are sent exactly as the gateway publishes
  them — nothing is translated, downgraded or substituted. A level the model
  does not publish is refused with the list of the ones it does, rather than
  being sent and failing there. A model served direct from another provider
  would need an adapter beside the others in `server/providers.ts` before its
  real levels could be trusted.
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
- **Code cannot write.** It reads the folder you give it, inlines the files you
  mention, and talks about the change. There is no write path and no shell, so
  nothing the model says can change your files. The native tools are bounded by
  a grant: a folder you chose, and a path inside it that is resolved before it
  is opened. A model cannot name a path on the machine.
- **The model is always the picker's.** There is no server-side fallback, so a
  request with no selection is refused rather than silently served by a model
  you did not choose. The composer pre-selects the first free model in the
  catalog so it is usable on first run, and that choice is named in the picker
  and can be changed.
- **Folders need a Chromium browser.** `showDirectoryPicker` is the only way to
  get read access to a real folder, so on other engines the footer says so
  instead of offering a list the app cannot honour. Recents are re-granted via
  IndexedDB; a revoked grant clears the file list rather than leaving stale paths.
- **Sessions are per-profile, with no account and no sync.** On the website they
  are in the browser's `localStorage`; on the desktop they are in the app's own
  file, written by Rust. Either way they belong to one profile: the app and the
  website are two origins in production, so a conversation set in one is not read
  by the other. Attachment text is captured at send time so a restored thread
  keeps its context; the original `File` object cannot survive a reload.
- **Streaming text is revealed by `requestAnimationFrame`.** In a background tab
  the reveal pauses and catches up when the tab is focused again. The answer is
  rendered as Markdown throughout — including the half-finished sentence — so
  the formatting never jumps at the end of the turn, and the parsing is
  deferred so a long answer does not hold up the typing or the scrolling.
- **Agent mode has no tool execution.** Modes change the system prompt only, and
  the server writes that prompt rather than the client. A model may describe
  commands it would run; it cannot run them.

## Local edits to generated files

These files come from the assistant-ui component registry and are regenerated by
`pnpm dlx shadcn@latest add @assistant-ui/thread`. Each edit below is marked in place
and **will be lost on regeneration**:

| File | Edit |
|---|---|
| `src/components/thread.aui.tsx` | `overflow-y-auto` (scrollbar appears only when scrollable); model picker in the composer rail |
| `src/components/tooltip-icon-button.tsx` | padding derived from size instead of hardcoded |
| `src/components/button/button.tsx` | the outline variant paints its surface in `--input` rather than in the background, so the same classes work in both modes |

`src/blocks/prompt-input/` is a different thing: the ui-haven prompt-input
block, vendored in full and edited locally. It is not regenerated by the
command above, so the changes to it are ours to keep — the composer's field
paints itself in `--input` rather than in the background and draws no hairline,
it can be told what content it is showing, and its attachments can be owned by
the caller rather than by the composer.

The composer surface and scrollbar styling deliberately live in
`src/index.css` (unlayered, so they beat Tailwind's layered utilities) precisely
so they survive regeneration.

## Vendored component library

66 components from the `ui-haven` library are in `src/components/<name>/`, with
helpers in `src/lib/{hotkey,motion}.ts` and `src/hooks/`. Many of them are
what the app is drawn with — the rail, the menus, the dialogs, the composer —
and the rest are additive and unreferenced, kept available for future UI work.

Four of the unreferenced ones are worth naming, because a reader looking for
them would otherwise assume they were once used and have since been dropped:
`src/components/collapsible/`, `src/components/command/command.tsx`,
`src/components/textarea/textarea.tsx` and `src/components/video-player/`.
They are part of the library and nothing imports them.

`src/blocks/prompt-input/` is the app's prompt-input block, and it **is** wired
up: `src/App.tsx` renders it directly, and it is the surface the conversation
is drawn and sent from.

`src/assistant.tsx`, `src/components/thread.aui.tsx`, `src/toolkit.tsx`,
`src/components/assistant-ui/**`, `src/components/model-picker.tsx`,
`src/components/model-selector.tsx`, `src/components/model-selector.aui.tsx`,
`src/components/markdown-text.tsx`, `src/components/reasoning.tsx`,
`src/components/media-player.tsx`, `src/components/surfaces.tsx`,
`src/components/file.tsx`, `src/components/image.tsx`,
`src/components/tooltip-icon-button.tsx` and `src/components/ui/**` are the
**assistant-ui** equivalents. They are a reference implementation of the same
idea in another runtime, kept for comparison; the app does not mount them.
They are kept honest by writing the same preference keys the live composer
does, so a reader is not misled by two halves of the app disagreeing about
where a choice is remembered.

One of them is not entirely dormant: `src/components/markdown-text.tsx` is the
app's Markdown renderer, and the live surface renders a model's answer with
it. The renderer and its styles are shared, so there is one set of Markdown
styles in this app rather than two that drift apart.

Test files and other unused archive data were removed on import.

## Documentation

[`docs/`](docs/) holds two kinds of document, kept apart on purpose: the
documents in `docs/` describe the app **as it is** — how it is put together
and where its data lives — and the documents in [`docs/plan/`](docs/plan/)
describe the app **as it is meant to become**, which is to say what is still
deferred and what has not been built. [`docs/README.md`](docs/README.md) says
which is which.
