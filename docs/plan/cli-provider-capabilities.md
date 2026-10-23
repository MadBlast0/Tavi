# The CLI providers — what each one can actually do

**Status:** the capability audit the plan's Phase B asks for. It was made by
reading each tool's own documentation and by asking the npm registry and PyPI
what the packages are, and — for the one tool on this machine — by running it
and reading what it said.

**Nothing here is a guess.** Where a thing is not known, the row says
"unknown" rather than filling it in. A column of confident answers about
nineteen tools would be worth less than a short list of the ones that were
actually checked.

---

## How the columns are read

| Column | What it means |
|---|---|
| **Find** | How the app locates the program. Every tool is looked for by name on `PATH` and in the places its installer writes to. |
| **Verify** | How the app knows the program it found is the tool, and not something else with the same name. |
| **Run** | How the app asks it a question without a terminal. |
| **Models** | Whether it publishes a list of models the app can show. |
| **Sign-in** | How it is signed in, and whether the app can tell. |
| **Install** | How the app puts it on this machine, when the tool's own documentation names a way. |
| **Update** | How it is updated. |
| **Remove** | How it is removed. |
| **Platforms** | The systems it is published for. |

---

## The summary

| Tool | Find | Verify | Run | Models | Sign-in | Install | Update | Remove | Platforms |
|---|---|---|---|---|---|---|---|---|---|
| **OpenCode** | `opencode` | version | **yes — `--format json`**, on stdin | **yes** | `opencode auth list` | its own `upgrade` | its own `upgrade` | its own `uninstall` | all three |
| **Claude Code** | `claude` | version | yes — `--output-format stream-json` | no | its own login | npm `@anthropic-ai/claude-code` | npm | npm | all three |
| **Gemini CLI** | `gemini` | version | yes — `--output-format stream-json` | no | its own login | npm `@google/gemini-cli` | npm | npm | all three |
| **Codex CLI** | `codex` | version | not yet | no | its own login | npm `@openai/codex` | npm | npm | all three |
| **Copilot CLI** | `copilot` | version | not yet | no | its own login | npm `@github/copilot` | npm | npm | all three |
| **Cline CLI** | `cline` | version | not yet | no | its own login | **none — see below** | — | — | all three |
| **Pi Coding Agent** | `pi` | version | not yet | no | its own login | npm `@mariozechner/pi-coding-agent` | npm | npm | all three |
| **Kilo Code CLI** | `kilo` | version | not yet | no | its own login | npm `@kilocode/cli` | npm | npm | all three |
| **Qwen Code** | `qwen` | version | not yet | no | its own login | npm `@qwen-code/qwen-code` | npm | npm | all three |
| **Kimi Code CLI** | `kimi` | version | not yet | no | its own login | npm `@moonshot-ai/kimi-code` | npm | npm | all three |
| **Goose** | `goose` | version | not yet | no | its own login | **none — see below** | — | — | all three |
| **Mistral Vibe CLI** | `vibe` | version | not yet | no | its own login | npm `vibe-cli` | npm | npm | all three |
| **Kiro CLI** | `kiro-cli` | version | not yet | no | its own login | **none — see below** | — | — | all three |
| **OpenHands CLI** | `openhands` | version | not yet | no | its own login | PyPI `openhands-ai` | pipx | pipx | all three |
| **Aider** | `aider` | version | not yet | no | its own login | PyPI `aider-chat` | pipx | pipx | all three |
| **Amp** | `amp` | version | not yet | no | its own login | npm `@ampcode/cli` | npm | npm | all three |
| **Crush** | `crush` | version | not yet | no | its own login | **none — see below** | — | — | all three |
| **Open Interpreter** | `interpreter` | version | not yet | no | **unknown** | PyPI `open-interpreter` | pipx | pipx | all three |
| **Continue CLI** | `cn` | version | not yet | no | its own login | npm `@continuedev/cli` | npm | npm | all three |

**"not yet"** means the tool is found, installed, updated and removed by the
app, and the app says plainly that it cannot run it yet. A recipe is written
when the tool's own documentation **and** its actual output have been read —
not before.

---

## What was checked, and how

### The one that was run

**OpenCode v2.0.26** was run, on this machine, through the app's own path:

```
found: C:\Users\Mad\AppData\Roaming\npm\opencode.cmd
runs:  C:\Users\Mad\AppData\Roaming\npm\node_modules\@opencode\cli\bin\opencode.exe
said:  ok
```

The npm shim is a `.cmd` beside the real `.exe`, and the name of the program
is read out of the shim, so the app runs the program rather than a script a
command interpreter has to interpret. The message goes in on **standard
input**, so nothing the user typed is ever part of a command line.

The events it emits are newline-delimited JSON, one per line, each with a
`type` and a `part`:

| The program says | The app makes of it |
|---|---|
| `{"type":"text","part":{"type":"text","text":"…"}}` | text |
| `{"type":"tool_use","part":{"type":"tool","tool":"shell","state":{…}}}` | a tool the agent used |
| `{"type":"step_finish","part":{"type":"step-finish","tokens":{…}}}` | what the turn cost |
| `{"type":"error","part":…,"error":{"message":"…"}}` | a failure, with the reason |

### The one that was nearly wrong

**Copilot CLI.** VS Code puts a `copilot` on this machine. It is **not** the
GitHub Copilot CLI — it says so when it is asked its version:

> GitHub Copilot CLI was not found. Run copilot in a terminal to install it…

So a program has to answer with a version before it counts as installed, and
one that does not is reported as what it is rather than as "not installed",
because "not installed" would leave the person wondering why the program is
right there.

### The four the app will not install

Four of the nineteen have a package of the same name that installs something
else. The app checks the registry before it offers to install anything, and
declares **no** install source for these four:

| The tool | The package of the same name | What it really is |
|---|---|---|
| Cline CLI | `@cline/cli` | installs a program called `clite` — a different tool |
| Goose | `goose` on npm, `goose-ai` on PyPI | a Go bracket helper, and a squatted package |
| Kiro CLI | `kiro-cli` on npm | a placeholder that installs a program called `kirox` |
| Crush | `crush` on npm | a media tool. Crush is a Go program, installed with Go |

For these four the app shows where to read about installing it and a **Look
again** button, and does not pretend it can do it. An update to a tool
somebody else installed is reported as *"Updated by whatever installed it"*,
because it is.

### The one whose sign-in nobody knows

**Open Interpreter** is the only tool in the catalogue whose sign-in the app
does not describe, so it is reported as *unknown* rather than as *may need
sign-in*. The other eighteen sign in themselves, and the app cannot ask
without asking the person to do something, so they are reported as *may need
sign-in* — which is what that means.

**OpenCode** is the exception: its own documentation names `opencode auth
list`, which does not sign anybody in, so the app runs it and reports *Signed
in* or *Not signed in* for real.

---

## The three ways a CLI can be talked to

The plan names three modes. This is where each one stands.

| Mode | What it is | Where it stands |
|---|---|---|
| **Protocol** | A documented agent protocol over standard input and output. OpenCode speaks one (`opencode acp`). | **Built, and checked.** `src-tauri/src/acp.rs` starts the agent, opens a session, sets the model and the effort from the request, sends the message and reads what comes back: text, tool calls, what the turn cost, and the program's own session id. The model list and the effort levels come from the agent itself, so the picker shows what the agent offers rather than a guess at it. **What is not yet read:** permission requests, file operations and terminal operations are accepted but not acted on; the app neither auto-approves nor asks, and says so. |
| **Structured** | A documented headless mode whose output can be read. | **Working for OpenCode**, and checked against the program's own output. Claude Code and Gemini CLI have documented interfaces of this kind; their recipes are written from the documentation and are marked as not having been checked against the program. |
| **Terminal** | A real pseudo-terminal, for a program that needs one. | **Built, and checked.** `src-tauri/src/pty.rs` opens a real pseudo-terminal, runs a program in it, reads what it draws, takes what is typed at it, resizes it, and reports the program's own exit code. The test proves the program really had a terminal and not a pipe: a terminal turns a newline into a carriage return and a newline, and a pipe does not. **There is no surface that shows one yet** — that needs a terminal emulator on the front end and a place in the thread for it. |

A terminal is a **fallback**, not the shape of the whole feature. It is
there for the tools that will not do anything else, and building one without
a tool to test it against would be an untested claim.

---

## What is deliberately conservative

- **The app installs only what it has been told how to install.** A package
  manager, or the tool's own command. Never a script fetched from the
  internet.
- **Turning a provider off never removes it.** A program that is installed
  and turned off is still installed, and the row still says where it is.
- **Installing and removing are asked about first**, and the question says
  what will happen.
- **An update is never marked successful on a zero exit code alone.** The
  version is read again afterwards.
- **The provider is pinned once a thread has been talked to.** The model may
  change; the provider may not, until a new thread is started.
- **A CLI keeps its own account and its own keys.** The app never asks for
  them, never reads them, and never writes them down.
