# API keys, and the app/browser split — research and plan

**Document status:** Draft for decision. Nothing in §4 onward has been built.
**Scope:** Settings → Platform → API keys, and every place the desktop app and
the website are not the same.
**How to read this.** §1 is the audit, measured. §2 explains each item in
words. §3 is the research behind each decision. §4 is the plan, with a
decision line per item. §5 is the guardrails. §6 is the file-by-file research
of the dormant assistant branch. §7 is what has to be true when this ships.
**§8 is how to carry the work out** — the order, the rules, the verification
and what "done" means.

**If you are here to do the work, read §0, then §8, then §4.** Everything
else is the reasoning behind them.

Each numbered item in §4 carries a **Decision** line, blank. Fill one in and
that item is settled.

### What was asked for, in the terms it was asked in

| Asked | Where it is answered |
|---|---|
| The API keys section is **Settings → Platform → API keys**; that is the one being worked on | §1, §4 |
| The app and the website must be **the same screen**, not two versions | §1.7, §4.1, §5 (G2) |
| The user flow is: **Settings → API keys → Add key → choose a provider → enter the key → Save** | §1, §4.2 |
| The app must work with **keys added in Settings** when it ships; the environment key is a **testing convenience only** | §7 |
| **D1 / V5** — the browser should have the font capability the app has, if it can | §3.1 |
| **D2** — where is the app menu's "Close window" / "Exit", and is it dead code? | §3.2 |
| **D3** — fix the key shapes | §3.3 |
| **D4** — combine the duplications into one, production grade | §3.3, §4.2 |
| **D5** — explain it first | §2, D5; §3.10.2 |
| **D6** — found while researching: the NVIDIA NIM check accepts anything | §2, D6; §3.3.6 |
| **D7** — found while checking the flow: with no key, the picker blames a search | §2, D7; §1.8 |
| **D8** — found by probing the live provider: the allowance line reads a field that does not exist | §2, D8; §3.10.1 |
| **D9** — found by probing the providers: three adapter defects that will 400 | §2, D9; §3.10.4 |
| **D10** — found while researching: a write can destroy the other providers' keys | §2, D10; §3.11.3 |
| **D11** — found while researching: any web page can replace the server's key | §2, D11; §3.11.4 |
| **D12** — found while researching: the redaction covers one key format | §2, D12 |
| **V1** — this is already right | §1.2, §7 |
| **V2** — the **Add key button's placement**: on the title's vertical plane, its right wall level with the Remove button, and adjusted for portrait | §3.4, §4.4 |
| **V4** — correct as it is | §1.2 |
| **T1** — the account badge is a placeholder; leave it | §1.3 |
| **T2** — the browser's conversations, the Delete everything button, and Export/Import must work per build | §3.5 |
| **T3** — make it the way professional apps do it, researched | §3.6 |
| The dormant code is **global components**, not to be deleted; research and connect the features | §6 |
| Every guardrail researched on its own, at industry standard | §5 |

---

## 0. The short version

The API keys screen is now one screen, used by both the app and the website.
Twelve things still need decisions — five of them found by the research in
this document rather than by the audit.

**Found by the audit (the app/browser split itself):**

1. The font picker claims "0 fonts installed" in a browser, which is false.
2. The app menu's "Close window" and "Exit" are live-looking and do nothing in
   a browser.
3. There are two shapes for "a provider key", and `label` means two different
   things in them.
4. "What does the provider think of this key" is implemented four times.
5. The model catalogue can be stale, and only the website says so.
6. The NVIDIA NIM key check accepts any string at all — the endpoint it uses
   is public.
7. With no key, the model picker says *"No models match “”."* instead of the
   truth, and the server's honest 503 is swallowed.
8. The key's allowance line reads **`remaining`**, a field the provider does
   not publish (it is `limit_remaining`), and compares *all-time* usage
   against a cap that **resets**.

**Found by the research (probing the live providers and the live code):**

9. The server's key file can **lose every other provider's key** — one
   unreadable moment followed by one write overwrites the store.
10. **Any web page in any browser can replace the server's key.** A
    `text/plain` POST is a CORS "simple request" — no preflight — and the
    route never checks `Content-Type`. The loopback check does not help: a
    browser is on the loopback interface.
11. The redaction only covers `sk-` prefixes, so a provider's account label
    in any other format passes through.
12. Three provider-adapter defects that will produce a **400** — OpenAI's
    `max` is missing, the chat-completions wire shape is wrong, and
    Anthropic's `between_tools` is missing.

**Underneath all of it**, the reason the split happened is that **the two
builds were never compared**. There is a test that the frontend's Rust
commands and Rust's command list agree (`src/lib/commands.test.ts`); there
is nothing that says the same about the HTTP boundary, and nothing that
records where the two builds are *allowed* to differ. §5 is the fix for
that, and it is the part that matters most.

**The research that decides the shape of the key work** is in §3.3: the
reference design is Anthropic's key model; the OS credential store cannot be
enumerated, so the metadata needs a sidecar; the active key must be an
explicit pointer, never an inference; and each provider's key can only be
checked in one particular way, which is not the same way for all four.

**The research that decides where the keys are kept** is in §3.11: the
credential store is an at-rest control, not an authorisation control; the
server's file is the right answer in the wrong place; and the routes that
change it are reachable by any page the user visits.

**To do the work: §8 has the order, the rules, the verification and what
"done" means.**

---

## 1. The audit

Measured against the running app, not inferred. "Browser" means the web
target at `http://localhost:1420`; "app" means the Tauri desktop app.

**A note on the paths.** This section, and the research in §3, were taken
against the code as it stood when the audit was made, and they name the files
that were there then. One of those files has since gone: `src/lib/transport.ts`
— the one file that chose between the two servers — was split into three.
`src/lib/api.ts` is the facade that picks, `src/lib/desktop.ts` is the Tauri
adapter, and `src/lib/web.ts` is the HTTP adapter. A reference to
`transport.ts` below is a reference to the code the audit found; that code now
lives in those three files. The tables in §4, which say what the work touched,
name the files as they are now.

### 1.1 Defects

| # | Where | App | Browser | Note |
|---|---|---|---|---|
| **D1** | General → App font | status reads "N fonts installed." — true | status reads **"0 fonts installed."** while the list below shows the app's own face | states a falsehood |
| **D2** | ☰ app menu → File → "Close window", "Exit" | both work | both render **enabled** and do nothing | live-looking control, no effect |
| **D3** | key shapes | `KeyStatus.label` = the key's *account* name | `ApiKeyInfo.label` = the *provider's* name; the account is `ApiKeyInfo.account` | one word, two meanings, two live shapes |
| **D4** | "ask a provider about a key" | implemented twice in Rust | implemented twice in the server | four copies of one question |
| **D5** | model catalogue staleness | `stale` hardcoded `false` | the server's real `stale` | the app cannot say its list is old |
| **D6** | NVIDIA NIM key check | `GET /v1/models` → 401/403 means "refused" | **the same URL answers 200 to any caller, with or without a key** | the app reports **any string pasted as "Accepted"** for NVIDIA. Found by probing the live endpoint — see §2, D6 |
| **D7** | the model picker, with no key | the catalogue loads and the list fills | the server answers **503 "Model catalog unavailable"**, the client swallows it, and the picker says **"No models match “”."** | states a falsehood about a search that was never made, and the real reason — no key — is never shown. See §2, D7 |
| **D8** | the key's allowance line | "$4.20 of $10.00 used" | the same | it reads **`remaining`**, a field the provider does not publish (it is `limit_remaining`), so the remainder is **always null**; and the numerator is the **all-time** usage against a cap that **resets**. Probed against the live API. See §2, D8 |
| **D9** | the provider adapters (not the keys screen) | — | — | three defects that will produce a **400**: OpenAI's `max` is missing from the documented effort values, the chat-completions wire shape is wrong, and Anthropic's `between_tools` thinking type is missing. See §2, D9 |
| **D10** | the server's key file | — | — | **a write can destroy every other provider's key.** `readStore()` catches *every* error and returns `{}`, so one unreadable moment followed by one write overwrites the file with a single key. Silent, and unrecoverable. See §2, D10 |
| **D11** | the server's key routes | — | — | **any web page in any browser can replace the server's key.** A `text/plain` POST is a CORS "simple request" — no preflight — and the route never checks `Content-Type`. The loopback check does not help: a browser is on the loopback interface. See §2, D11 |
| **D12** | the redaction of key-shaped text | — | — | only `sk-`-prefixed tokens are redacted, so a provider's account label in any other format passes through untouched. See §2, D12 |

### 1.2 Deliberate, and stated in the UI

| # | Where | Difference |
|---|---|---|
| **V1** | API keys pane | one sentence: "kept in this computer's **credential store**" vs "kept by this computer's **server**" |
| **V2** | API keys → Add key | the dialog's field description differs by one clause; and the **button's placement** is wrong — see §3.4, measured |
| **V3** | Privacy → "Where your conversations are" | different description; the path shown only on the desktop |
| **V4** | Title bar | no minimise/maximise/close in a browser |
| **V5** | App font list | shorter in a browser — and it *says* 0, which is false (D1) |

**V2, measured.** The pane's content box runs from x=399 to x=1164. The
`+ Add key` button's right edge is at **1164**; the `Remove` button's is at
**1152** — **12 px apart**, because the row's content is inset by the `Item`
component's own padding. The button's centre (y=145) and the heading's
centre (y=140) are 5 px apart, because the button sits beside the whole
text block rather than beside the title. Full analysis in §3.4.

### 1.3 Same screen, different subject

| # | Where | Difference |
|---|---|---|
| **T1** | Account row's plan badge | the app shows the user's own key's tier; the browser shows the server's key's tier |
| **T2** | API keys list | the app lists the credential store; the browser lists the server's file |
| **T3** | Prefs (theme, palette, font, model) | `localStorage` in both, but a different origin |

### 1.4 Capability differences

| # | Thing | App | Browser |
|---|---|---|---|
| **C1** | Native workspace tools | offered to the model | not offered at all |
| **C2** | System tray | yes | no |
| **C3** | Window controls | yes | no |
| **C4** | File open/save | OS dialog | download / File System Access |
| **C5** | Folder grant | Rust, by path | browser handle in IndexedDB |
| **C6** | Conversations | the app's own file | browser storage |
| **C7** | Cloning | Rust, this machine | the server's machine; 403 off-machine |
| **C8** | Changing the server's keys | n/a | 403 off-machine |
| **C9** | Composer's folder button | always | only where the File System Access API exists |
| **C10** | Listing system fonts | yes | no |
| **C11** | "Get a key" link | opens the system browser | opens a browser tab |

### 1.5 Contracts

| # | Check | Status |
|---|---|---|
| **K1** | Every `invoke("x")` is registered in Rust, and every registered command is called | **passing** — 2 tests, `src/lib/commands.test.ts` |
| **K2** | Every `/api/…` the frontend fetches has a server route | **passing by hand** — 6 paths, all present. **No test.** |
| **K3** | Every server route has a caller | **passing** — except `/api/health`, a health check by design |
| **K4** | The data shapes match across the two sides | **passing** for `ProjectsListing`, `ProjectSummary`, `CloneResult`, `SlimModel`, `ChatEvent`. **Failing** for the key shape — D3 |

### 1.6 Guardrails missing

| # | Gap | Consequence |
|---|---|---|
| **G1** | No test ties the frontend's `/api` paths to the server's routes | a renamed route breaks only in the browser |
| **G2** | No record of where the two builds may differ | a new `isDesktopApp()` branch in a render path is invisible |
| **G3** | Two shapes for one question | the split crept in through duplication — D3, D4 |
| **G4** | No test that a browser route and a desktop command answer the same shape | a shape drift shows up in one build only |

### 1.7 Code that is not mounted

Two directions, both listed here because both look like "dead code" and are
not the same thing.

| # | What | Status |
|---|---|---|
| **X1** | `src/assistant.tsx`, `src/components/AssistantSurface.tsx`, `src/components/thread.aui.tsx`, `src/components/assistant-ui/elements/*` (5 files), `src/components/model-picker.tsx`, `src/components/model-selector.tsx`, `src/components/model-selector.aui.tsx`, `src/components/markdown-text.tsx`, `src/components/reasoning.tsx`, `src/components/media-player.tsx`, `src/components/surfaces.tsx`, `src/components/file.tsx`, `src/components/image.tsx`, `src/components/tooltip-icon-button.tsx`, `src/components/ui/*` (11 files) | **Deliberate.** `README.md:777-783` calls them "the **assistant-ui** equivalents … a reference implementation of the same idea in another runtime, kept for comparison; the app does not mount them." See §6 |
| **X2** | `src/components/collapsible/`, `src/components/command/command.tsx`, `src/components/textarea/textarea.tsx`, `src/components/video-player/` (≈2200 lines) | Unreferenced by any live file, and **not** covered by the README's note. Global components with no user. See §6.6 |

### 1.8 Gaps in the flow between the keys and the rest of the app

Found while checking the user's described flow — *"no API key added → the model
selector prompts, and the dropdown has a button that takes you to the app
settings to add one"* — against the code. None of it exists today.

| # | Gap | Evidence |
|---|---|---|
| **G-A** | **The model picker has no "no key" state.** With no key it says *"No models match “”."* — D7 | **closed** — the picker says which provider has no key, and offers the way to put it right |
| **G-B** | **Nothing can send the user to a specific settings section.** The settings dialog always opens on **General**; there is no deep link. The only routes to it are the `mod+,` hotkey and the account menu's "Settings" row | **closed** — the dialog opens on a section, and the picker's "no key" state opens it on **API keys** |
| **G-C** | **The model list is not scoped to the key's provider.** It is the whole catalogue from the server, filtered to the free pool when there is one — and the server's catalogue is one provider's | **closed** — the list is the provider in use's own catalogue |
| **G-D** | **The app's requests always go to one provider**, whatever keys exist. A second provider's key can be stored and checked, but nothing uses it | **closed** — the request names the provider, and it is sent there |

**Why these matter together.** G-A is the symptom a user meets; G-B is why
it cannot be fixed by a message alone; and C and D are why the model list
cannot yet be "the models in the API key they have chosen" — the app has one
provider's catalogue and one provider's request path.

**The smallest fix that makes the flow whole**, and the order the rest
depends on:

1. **Let the settings dialog open on a section** (G-B). One extra parameter
   — `initialSection?: string` — and the account menu, the model picker and
   anywhere else can deep-link into a section. This is small, and it is the
   prerequisite for every "go and add a key" affordance.
2. **Give the model picker a "no key" state** (G-A). The catalogue fetch
   already distinguishes "the provider could not be reached" from "there are
   no models"; the 503 from `server/main.ts:322` carries a message that says
   *why*. The client should keep that message instead of discarding it, and
   the picker should show it, with a button that opens the settings dialog on
   **API keys** (which G-B now makes possible).
3. **Scope the list to the key's provider** (G-C) — but only once the app
   can talk to more than one provider (G-D), or the list would be scoped to
   a provider the request does not use.

**Decision:** Do the three steps in the order given: let the settings dialog open on a section, give the model picker a “no key” state with a button that opens it on **API keys**, and scope the list to the key’s provider only once the app can talk to more than one provider.

**All three are done.** The app talks to twenty-eight providers across four request shapes, and the provider in use is a per-side preference that the catalogue, the list, the key and the request all follow.

---

## 2. The defects, in words

### D1 — the font picker states a falsehood in the browser

`src/blocks/shell/settings-font.tsx:223-226` announces
`` `${families.length} fonts installed.` ``. In a browser the scan fails, so
`families` is `[]`, and the announcement is **"0 fonts installed."** — while
the list immediately below it shows the app's own face. The two contradict
each other, and the announcement is the one a screen reader reads.

The reason is already computed and thrown away. `src/lib/fonts.ts:70-77`
builds *"Installed fonts can only be listed in the desktop app. Start it with
`pnpm tauri dev`."* — and `settings-font.tsx` reads only `result.ok`, never
`result.message`.

Measured in the browser: `ComboboxStatus` textContent `"0 fonts installed."`,
list items `["Geist"]`.

**Decision:** State the count only when the list was actually obtained, and the
reason otherwise. The reason is already written in `src/lib/fonts.ts` and is
what the picker now says.

### D2 — the app menu's "Close window" and "Exit" do nothing in a browser

These are **visible**. The ☰ button in the title bar opens the app menu
(`src/blocks/shell/title-bar.tsx:65` → `AppMenu`), and under **File** there
are "Close window" and "Exit".

`src/blocks/shell/app-menu.tsx:70-71` gives both an `action`, and an entry
with an action renders **enabled** (`:192-195`). The handler then returns
early on `!isDesktopApp()` (`:232`). So in a browser they are ordinary
enabled menu items that do nothing when clicked.

The repo's own rule, from the README: *"A menu that looked complete and did
nothing would be a lie about how much of the app exists."*

**Decision:** Render “Close window” and “Exit” disabled with the reason on hover in a browser. That is the pattern every other command in that menu already uses, and it keeps the menu the same in both builds.

### D3 — `label` means two different things

| Shape | Where it lives | `label` means | the account is called |
|---|---|---|---|
| `KeyStatus` | Rust `provider.rs` `key_status`, server `/api/key` | the key's **account** name | `label` |
| `ApiKeyInfo` | Rust `keys.rs` `list_api_keys`, server `/api/keys` | the **provider's** name | `account` |

Nothing reads `KeyStatus.label` today, so nothing is broken yet. It is a trap
laid for the next person who adds a field.

**Decision:** One shape, `ProviderKey`, with `providerLabel` for the provider and `account` for the key’s own account. The word `label` is not used for either.

### D4 — "what does the provider think of this key" is written four times

| Implementation | File | Does |
|---|---|---|
| Rust, old | `src-tauri/src/provider.rs:826` `key_status` | OpenRouter's `/key` page; bearer |
| Rust, new | `src-tauri/src/keys.rs` `status` | all four providers; bearer or `x-api-key` |
| Server, old | `server/key-status.ts` `fetchKeyStatus` | OpenRouter's `/key` page; bearer |
| Server, new | `server/key-status.ts` `fetchProviderStatus` | all four providers; bearer or `x-api-key` |

The two "old" ones exist only for the account row's plan badge
(`src/blocks/shell/sidebar-account.tsx:133`). The two "new" ones are the
pane. They can drift, and they have already drifted once — the Rust `old`
one read the provider's reply at the top level, so it never found the account
name, which lives under `data`. That was fixed during the rewrite; the
duplication itself is not.

**Decision:** One implementation per language: `keys::check` in Rust and `fetchProviderStatus` in the server, each covering all four providers. The old `key_status` command and `fetchKeyStatus` are gone.

### D5 — the model catalogue can be stale, and only the website says so

Explained here in full because it was not understood when it was raised.

**What "stale" means.** A model catalogue is a list of every model a provider
offers — several hundred entries, with prices, context lengths and reasoning
capabilities. It changes rarely but not never. The app therefore caches it
and refetches it periodically rather than on every render.

- **The server** (`server/models.ts`) caches with a 15-minute TTL and
  reports the truth: `GET /api/models` answers `{ models, stale }`, where
  `stale` is true when the catalogue being served is older than the TTL.
- **The app** (`src-tauri/src/provider.rs`) caches the same way, with the same
  15-minute TTL (`CATALOGUE_TTL_SECS`), and knows exactly how old the copy it
  served is — `CachedCatalogue { fetched_at, body }`. But the
  `model_catalogue` command returns **only the catalogue body**, so the
  TypeScript side has nothing to go on and writes `stale: false`
  (`src/lib/transport.ts:91`).

**What it costs today.** Nothing visible. The only reader of `stale` is
`src/components/model-picker.tsx:451`, which shows "· cached catalog" — and
that file is dormant (§6). The live app reads only `data.models`
(`src/blocks/prompt-input/prompt-block.tsx:1166`).

**Why it is still worth fixing.** It is a one-line lie in the contract between
two servers. The moment anything reads `stale`, the app will say "fresh" when
it is not. The fix is to have the Rust command return the age of the
catalogue it served, and to derive `stale` from the same TTL the server uses —
so the two answers mean the same thing.

**Decision:** Replace `stale: boolean` with `{ fetchedAt, degraded }` and report it from the desktop too. The Rust command now answers with the age of the copy it served and whether the provider could not be reached.

### D6 — the NVIDIA NIM key check accepts anything

Found while researching the validation endpoints (§3.3), by probing the live
endpoint on 2026-10-21 with a deliberately invalid key and with no
`Authorization` header at all.

`GET https://integrate.api.nvidia.com/v1/models` **answers 200 with the full
model catalogue to any caller.** `GET /v1/models/{id}` likewise. Both are
public. They cannot validate a key, and they are not a key check.

Both sides of the app use that URL as the check:

- `src/lib/providers.ts:77` — `identityUrl: "https://integrate.api.nvidia.com/v1/models"`
- `src-tauri/src/keys.rs:79` — the same URL
- `server/key-status.ts` — the same URL, through the shared table

So pasting any string into the Add-key box and saving it produces a row that
says **"Accepted"** for NVIDIA NIM. The app is telling the user a falsehood
about a credential, which is the same class of defect as D1 and the same
rule the repo states in `AGENTS.md`: *"Do not add … decorative UI that
pretends to work."*

**What NIM actually does.** The only endpoint that checks the key is the
inference endpoint: `POST /v1/chat/completions` with a known model slug
answers **403 `{"status":403,"title":"Forbidden","detail":"Authorization
failed"}`** for a bad key, and **404 "page not found"** for a wrong *model
slug* — which is not a key problem. A 404 is never a key problem, in any
provider.

**The fix, and the honest cost.** Checking a NIM key means a real, billable
(though free-tier) inference with `max_tokens: 1`. The options are:

| Option | What the user sees | Cost |
|---|---|---|
| **A. Probe with a 1-token inference** | a real check, and it costs one request | spends rate-limit budget; must not run on every list refresh |
| **B. Say NIM cannot be checked** | "NVIDIA does not publish a key check, so Tavi cannot confirm this key without spending a request" | no check; consistent with the repo's no-invented-data rule |

**B is the default; A is opt-in** — a "Check this key" button on the NIM row
that the user presses, which is exactly how a real request is spent. The
list must not quietly spend the user's quota.

**The same bug class, elsewhere:** `src-tauri/src/keys.rs` and
`server/key-status.ts` both treat **429** as "not accepted" by lumping it
with 401/403. A 429 means the key is *good* and the account is rate-limited
or out of credit. It needs its own state, and it must never render as
"Not accepted". The full table of what each code means is in §3.3.

**Decision:** NVIDIA NIM is not checked against its public listing, which answers `200` to any caller. A NIM key is saved unchecked, the pane says it has not been checked, and a **Check now** button spends one 1-token inference when the user asks for it. 429 and 402 get their own states.

### D7 — with no key, the model picker blames a search

This one sits outside the settings screen but is squarely in the API keys'
way: it is what a person meets when they have not added a key yet.

**What happens, step by step.**

1. `src/blocks/prompt-input/prompt-block.tsx:1166` calls `fetchModels()`.
2. With no key, the server's catalogue fetch fails and the route answers
   **503** with a plain message — `server/main.ts:322-334`, whose own comment
   says *"Say so plainly rather than returning an empty picker."*
3. The client throws: *"The model catalogue is unavailable (503)."*
   (`src/lib/transport.ts`).
4. The effect's `.catch(() => {})` (`prompt-block.tsx:1222`) **discards it**.
5. `realModels` stays empty, and the picker's empty state renders
   `No models match “{query.trim()}”.` (`prompt-controls.tsx:871-873`).

So the picker tells the user that no model matches an **empty search** —
which is not a thing anyone searched for — and the one true statement
available, *"you have not added a key"*, is thrown away on the way.

**The intended behaviour**, which the app should have: no key → the picker
says so, and offers a way to add one. See §1.8.

**Decision:** Keep the catalogue’s own error instead of discarding it, and show it in the picker, with a button that opens the settings on **API keys**.

### D8 — the key's allowance line reads a field that does not exist

**Probed against the live endpoint on 2026-10-21.** `GET /api/v1/key` answers
`{ data: { … } }`, and the fields are:

```
label, is_management_key, is_provisioning_key,
limit, limit_reset, limit_remaining, include_byok_in_limit,
budgets, effective_budget,
usage, usage_daily, usage_weekly, usage_monthly,
byok_usage, byok_usage_daily, byok_usage_weekly, byok_usage_monthly,
is_free_tier, expires_at, creator_user_id, organization_id, workspace_id,
allowed_data_regions, free_model_daily_requests, rate_limit
```

**There is no `remaining` field.** The app reads it anyway, on both sides:

- `server/key-status.ts:96` and `:171` — `remaining: d.remaining ?? null`
- `src-tauri/src/keys.rs:377` — `"remaining": data.get("remaining")`

So the remainder the pane would show has **always been null**, and nothing
ever showed it.

**And the numerator is the wrong number.** `usage` is *all-time* usage;
`limit` is a cap that resets, and `limit_reset` says which window. So
"$4.20 of $10.00 used" compares a lifetime figure with a monthly cap. The
number that belongs in that sentence is the usage **in the current window** —
`limit - limit_remaining`, or the matching `usage_daily` / `usage_weekly` /
`usage_monthly` — and the sentence should name the window.

**The corrected line**, and the reasons for each form, are in §3.10.1. The
short version: keep "$X of $Y used", add the window and the remainder, name
the overage rather than pinning at zero, and say "No spending limit" when
there is no limit.

**The unit should be a field**, not an assumption: `limitCurrency: "USD"`.
Only OpenRouter reports a limit today, so nothing is mislabelled — but the
shape should not assume it either.

**Two more fields the model should gain**, from the same response, and both
of them are the "a key acts as an account" facts the reference design is
about: `organization_id`, `workspace_id`, `expires_at` and `creator_user_id`.
See the `ProviderKey` table in §3.3.3.

**Decision:** Read `limit_remaining` and `limit_reset`. The figure beside the cap is the usage **in the cap’s window**, the window is named, the overage is named rather than pinned at zero, and “No spending limit” is said when there is no cap. The unit is a field, `limitCurrency`.

### D9 — three provider-adapter defects that will produce a 400

Not in the API keys screen, but found by the same research and recorded here
so they are not lost. The full list is §3.10.4; these three will actually
fail a request.

| # | Where | What |
|---|---|---|
| **F1** | `server/providers.openai.ts:44-51` | `DOCUMENTED_EFFORT_VALUES` omits **`max`**, and the comment *"OpenAI's enum stops at `xhigh`"* is now false — OpenAI's Chat Completions reference documents `none, minimal, low, medium, high, xhigh, max` |
| **F3** | `server/providers.openai.ts:224` | sends `{ reasoning: { effort } }` while the adapter declares `apiProtocol: "openai-chat-completions"`, whose wire field is **top-level `reasoning_effort`**. VS Code documents the three shapes as `chat-completions` → top-level `reasoning_effort`, `responses` → nested `reasoning.effort`, `messages` → `output_config.effort` |
| **F4** | `server/providers.anthropic.ts:51-71` | `THINKING_TYPES` omits **`between_tools`**, which Anthropic now publishes — and Anthropic documents that `disabled` is rejected at high effort on the newest models, with `between_tools` as the low-thinking alternative |

**These are a separate decision from the API keys work.** They are recorded
here because the document is the only place the findings are written down, and
because F4 and F1 touch the same provider table the key work uses.

**Decision:** Fix all three: `max` is in OpenAI’s documented enum, the chat-completions wire field is top-level `reasoning_effort`, and Anthropic’s `between_tools` thinking type is published.

### D10 — a write to the server's key file can destroy every other key

This one is in the code written in this session, and it is the worst defect in
the list: it loses data, silently.

**The chain.** `server/key-store.ts:44-58` — `readStore()` catches **every**
error and returns `{}`:

```ts
try {
  const raw = readFileSync(keysFile(), "utf8")
  …
} catch {
  return {}
}
```

`storeKey` (`:93-97`) then does:

```ts
const store = readStore()
store[providerId] = key
writeStore(store)
```

So if the file is momentarily unreadable — **truncated by a crash**, because
`writeFileSync` truncates before it writes (`:69`) — or `EACCES`, or a race
with a second server process — the next write **overwrites the file with one
key and destroys all the others.** `removeKey` has the mirror-image failure:
it reads `{}`, sees the provider is absent, and returns without removing
anything.

**Three fixes, in order.**

1. **Treat a parse error as a hard error.** A file that exists and cannot be
   parsed is a problem to report, not an empty store to overwrite. Only
   `ENOENT` may mean "no keys".
2. **Write atomically.** Write `server-keys.json.tmp` in the same directory
   and `rename` it into place. A crash then leaves the old file intact, and
   the temporary file is never mistaken for the store.
3. **Keep a `.bak`**, and refuse to start without one if the main file is
   unreadable.

**And the directory's mode** (`:66`): `mkdirSync(root, { recursive: true })`
with no mode creates it at `0755` — world-**listable**. The XDG rule for
`$XDG_RUNTIME_DIR` is the model: `0700`, owned by the user.

**Decision:** A parse error is a hard error rather than an empty store, the write is atomic, a `.bak` is kept, the directory is `0700` and the file `0600`.

### D11 — any web page can replace the server's key

**The lever.** `POST /api/keys` parses the body with `JSON.parse` and **never
checks `Content-Type`** (`server/main.ts:339-347`).

Per the Fetch specification, a request is a CORS **"simple request"** — sent
with **no preflight** — when it is a `GET`, `HEAD` or `POST`, sets only
CORS-safelisted headers, and has a `Content-Type` of
`application/x-www-form-urlencoded`, `multipart/form-data`, or **`text/plain`**.

So this, from any web page in any browser on the machine:

```js
fetch("http://localhost:8787/api/keys", {
  method: "POST",
  headers: { "Content-Type": "text/plain" },   // simple request — no preflight
  body: JSON.stringify({ provider: "openrouter", key: "sk-attacker…" }),
})
```

is sent, and the server **replaces the operator's OpenRouter key**. The
attacker cannot *read* the response — no `Access-Control-Allow-Origin` is
sent, so it is opaque — but the state change has already happened. A
`<form method="POST" enctype="text/plain">` does it too. This is textbook
CSRF.

**Why the loopback check does not help.** It establishes *"this request came
from this machine"*, not *"this request came from the app's own page"*. A
browser on this machine **is** on the loopback interface. The only
difference is the `Origin` header, which the server never inspects.

**And the loopback check is not a boundary in a real deployment either.**
`server.listen(PORT)` with no host binds **every interface** — verified on
this machine: `{"address":"::","family":"IPv6"}`. In production the site
and the API are the same origin behind a reverse proxy on the same host; a
visitor's browser POSTs to `https://tavi.example/api/keys`, the proxy
forwards to `127.0.0.1:8787`, and the server sees `remoteAddress =
127.0.0.1` — **the check passes**. So the README's claim that *"its
settings pane can only be changed by a request from the same machine"* is
true only in the dev topology, and misleading in the deployed one.

**`GET /api/keys` has no guard at all** (`server/main.ts:321-325`), so a
host on the LAN can read which providers have keys and which account each
belongs to.

**What to do, in order of importance.**

1. **Decide the deployment model, and make the route match it.**
   - *Local-only server* (dev, or a single-user install): bind explicitly to
     `127.0.0.1` — `server.listen(PORT, "127.0.0.1")` — and validate `Host`
     ∈ {`localhost`, `127.0.0.1`, `[::1]`}. Two lines, and it removes both
     the LAN exposure and the DNS-rebinding exposure.
   - *Shared server* (what the README describes): the key routes need
     **authentication**, not a network check. The cleanest option is to
     **remove the ability to change the server's key over HTTP** and make it
     a deployment-time action — the environment variable, or the file the
     operator edits. That is also what Stripe, OpenAI and Anthropic all
     describe.
2. **Require a preflight on every mutating route** — either reject anything
   that is not `application/json`, or require a custom request header (a
   custom header is never CORS-safelisted, so the browser must preflight, and
   the preflight fails because the server sends no `Access-Control-Allow-*`).
   OWASP's recommended AJAX pattern, and it is client-side only: no token,
   no state.
3. **Verify `Origin` / `Sec-Fetch-Site`.** OWASP now recommends Fetch
   Metadata as the primary signal (supported in all major browsers since
   March 2023) with standard-header `Origin` verification as the mandatory
   fallback. Reject `cross-site` on `POST` and `DELETE`.
4. **Validate the `Host` header** against an allowlist — the specific
   mitigation GitHub Security Lab names for DNS rebinding, and the only thing
   that stops a rebind when the server is otherwise open.
5. **Remove the `address === ""` fail-open** from `isLoopback`
   (`server/main.ts:226-234`). It is dead code over TCP, and it is a
   fail-open default in a security predicate.
6. **Apply the same treatment to `/api/chat`** and `/api/projects/clone`,
   which have the same exposure — the former entirely unguarded.
7. **For the desktop app, the key routes should not exist over HTTP at
   all.** The Tauri commands are the right boundary: the runtime mediates,
   the capability system says which window may call what, and there is no
   port, no CORS and no CSRF. The repo already does this; narrowing the
   commands with `AppManifest::commands` in `build.rs` would finish it.

**Decision:** The server is a local, single-operator server. It binds the loopback interface, and the mutating routes require the request to have come from this machine, to be addressed to a name the server answers to, to carry no cross-site marker, and to carry the header that makes a browser ask first. The same checks cover `/api/chat` and `/api/projects/clone`.

### D12 — the redaction only covers one key format

`server/key-status.ts:49-52` redacts `/sk-[A-Za-z0-9_-]{6,}/`. That covers
Anthropic (`sk-ant-…`), OpenAI (`sk-proj-…`) and OpenRouter (`sk-or-v1-…`),
but **not any other vendor's prefix** — and a provider's account `label` is
free-form text from the network. The file's own comment says the right
thing (*"a label is free-form text from the network and should never be
trusted to stay masked"*) while the implementation only handles one prefix.

The Rust side has the same shape (`provider.rs`'s `redact` looks for `sk-`).

**The fix:** broaden the pattern to any long run of key-shaped characters,
not one vendor's prefix — or, better, mask everything that is not obviously
a human-readable account name.

**Decision:** Mask any long run of key-shaped characters with a digit in it, and anything with a known vendor prefix — not only `sk-`. A label the provider has already masked is left as it is.

---

## 3. Research

### 3.1 Listing system fonts in a browser (D1, V5)

The question: can a web page know which fonts are installed on the machine it
is running on?

**Short answer: in Chromium browsers, yes, with a permission prompt.
Everywhere else, no.**

| Source | Finding |
|---|---|
| MDN — Local Font Access API | `Window.queryLocalFonts()` is **Chrome 103+, Edge 103+, Opera 89+**. **No support in Firefox or Safari**, desktop or mobile. "Limited availability — does not work in some of the most widely-used browsers." |
| MDN — permissions | Calling it prompts the user for the `local-fonts` permission, queryable through the Permissions API. |
| Chrome developer docs | "Browser support: 103" (Chrome/Edge/Opera only). The permission "provides a highly fingerprintable surface" — anonymity-focused browsers "may choose to only provide a set of default fonts built into the browser". |

**What this means for the app.**

1. The desktop's OS-level enumeration (`font-kit` → the system's font
   database) has no browser equivalent. A browser can only report the fonts
   it is *able to see*, and even then only in Chromium, and only after the
   user grants a permission.
2. So the browser path is **not** "the same capability". It is a different,
   narrower capability, and it must be described as such.
3. The professional behaviour, and what the repo's own rules demand
   (`src/lib/fonts.ts:7-21` — "a list written into the app would name fonts
   that are not installed, and CSS silently substitutes something else"), is:

   - **Never state a count the app did not obtain.** D1 is not a wording
     problem; it is the app asserting a fact it does not have.
   - **Offer the Local Font Access API where it exists.** Chromium users get
     the real list, behind the browser's own permission prompt — which is the
     correct and expected UX, not a workaround.
   - **Say plainly where the list is unavailable.** Firefox and Safari get
     the app's own face plus anything already chosen, and a line that says
     why, not a fabricated count.
   - **Keep the control usable either way.** The picker is never disabled;
     `settings-font.tsx:91-98` already reasons about this and is right.

**The message that already exists and is thrown away** —
`src/lib/fonts.ts:70-77` — should be the one shown. It is already written
for exactly this case.

**The rule this is an instance of.** The repo's house style already states
it in three places — *"There is no universal level list, and an earlier
hardcoded one was wrong for most models"*; *"a list written into the app
would name fonts that are not installed, and CSS substitutes silently, so
every one of them would render as the fallback while appearing to have
worked"*; *"The grouping is derived from the session, not invented for it."*

> **A count, a name, a status, or a capability may only be rendered if the
> app obtained it.** A missing datum is `unknown`, and `unknown` renders as
> an explanation — never as a zero, never as a false.

That is D1, and it is the same rule the 429 states in D6 need.

**Decision:** Never state a count the app did not obtain. Offer the Local Font Access API where it exists, behind the browser’s own permission prompt and only on the person’s request, and say plainly where the list is unavailable.

### 3.2 Where "Close window" and "Exit" live (D2)

Established above: the ☰ button in the title bar → `AppMenu` → **File** →
"Close window" and "Exit". They are visible in both builds.

What they do in the app:

- **Close window** → `getCurrentWindow().hide()` (`app-menu.tsx:233-235`) —
  the window is hidden rather than closed, because the app lives in the tray.
- **Exit** → `invoke("quit_app")` (`app-menu.tsx:237`) → `app.exit(0)`
  (`src-tauri/src/lib.rs`).

In a browser neither has a meaning: a tab cannot be hidden, and the browser
owns its own lifetime. The options are:

| Option | What the browser shows | Cost |
|---|---|---|
| **A. Render them disabled with a reason** | the rows are there, greyed, with a tooltip saying why | one line in the menu's entry table; matches how every other not-yet-built command in that menu is already rendered (`app-menu.tsx:196-204` uses the same `disabled` + `title` pattern) |
| **B. Don't render them at all** | the rows are absent | the menu is shorter in a browser than in the app — a *different menu*, which is the thing we are trying to stop |
| **C. Make them work** | not possible — a tab cannot be hidden or exited by a page | — |

**A is the consistent choice**, and it is already the pattern the file uses
for every other command that does not exist yet. The menu's entries are a
table; entries that cannot run in this build get `disabled` and a `title`,
exactly as "Open file" and "Undo" do.

#### 3.2.1 What the accessibility guidance says about a disabled control

Worth reading, because "disabled with a reason" is a specific thing to get
right, and the repo's existing pattern is already close.

| Source | What it says |
|---|---|
| **WCAG 2.2, SC 1.4.3 Contrast (Minimum)** | *"Text or images of text that are part of an **inactive user interface component** … have no contrast requirement."* So dimming a disabled row is permitted, and the low-contrast style the menu already uses for disabled rows is not a failure |
| **WCAG 2.2, SC 4.1.2 Name, Role, Value** | the name, role and state must be programmatically determinable — so a disabled item must still be in the tree, and its state exposed |
| **MDN, `aria-disabled`** | *"the element is perceivable but disabled"*; and, unlike HTML's `disabled`, *"web developers must manually ensure such elements have their functionality suppressed"* |
| **NN/g, "Button States: Communicate Interaction"** | *"Disabled button states should also have the `ARIA-disabled: true` attribute … this will allow the button to still receive tab focus but will indicate to screen readers that the button is inactive"*; and *"Disabled buttons often confuse users by appearing clickable but providing no response or feedback … clearly explain why the button is disabled"* |
| **MDN, `aria-describedby`** | the mechanism for attaching *the reason* to a control in a way a screen reader will read |
| **WAI-ARIA APG, Keyboard Interface** | includes *"determining when to make disabled interactive elements focusable"* |

> **The accepted practice, stated plainly:** a control this build cannot
> honour must be (a) visibly unavailable, (b) still discoverable by
> assistive technology, and (c) accompanied by a stated reason. The reason
> is not optional — "disabled with no explanation" is the documented failure
> mode.

For this menu that means: the row stays in the tree, gets `disabled` (or
`aria-disabled="true"` with the handler suppressed), and the reason is
attached with `title` — the pattern already used at `app-menu.tsx:196-204` —
and ideally with `aria-describedby` pointing at visible text.

**A note on the "disabled" style the repo already uses.** The menu's
disabled rows are dimmed. That is permitted by WCAG, and it is the right
visual language for "this exists but is unavailable here".

**Decision:** Render them disabled with the reason on hover in a browser, which is the pattern the menu already uses for every command that does not exist yet.

### 3.3 What a provider key should be (D3, D4, D6, T2)

#### 3.3.1 The reference design is Anthropic's key model

The screenshot's description — *"A key acts as the user or service account it
was created for. A workspace key belongs to a workspace and stays active
after its creator leaves"* — is a paraphrase of Anthropic's published key
types (<https://platform.claude.com/docs/en/manage-claude/authentication>):

| Key type | Acts as | Stops working when |
|---|---|---|
| **Personal key** | You, the user, with your roles and permissions | You lose access to the organisation. Personal keys are archived when their user is removed. |
| **Service account key** | A service account | The service account is archived or removed |
| **Workspace key** | No one — it belongs to the workspace it was created in | It expires, is disabled or deleted, or its workspace is archived, **regardless of whether its creator leaves the organisation** |

**What the model implies.** A key is not a string. It is a credential with an
identity:

1. it has a **principal** (a user or a service account),
2. it has a **scope** (organisation / workspace / project),
3. it has a **creator**,
4. it has a **status** (active / expired / archived / inactive),
5. it can **outlive the person who made it**.

Anthropic's Admin API object carries exactly these: `id`, `created_at`,
`created_by`, `expires_at`, `name`, `partial_key_hint`, `principal`, `scope`,
`status`. OpenAI's carries `name`, `owner`, `redacted_value`, `created_at`,
`last_used_at`, `expires_at`, `owner_project_access`, `permissions`. Stripe's
carries a name, a note, permissions, an access policy and a mode. GitHub's
carries a name, a description, an owner, repository access, permissions and
an expiry.

**The app's copy should say what the identity means.** One sentence, in the
row: *"Tavi reaches OpenRouter as `sk-or-v1-au7…890`. Requests made with this
key are billed to that account."* That is the "acts as" idea, in the place
the user reads it.

#### 3.3.2 The constraint that decides the storage design

**The OS credential store cannot be enumerated.** `keyring` 3.6.3 — the
version pinned in `src-tauri/Cargo.toml` — exposes only per-entry
`get` / `set` / `delete` / `attributes`. There is no `list` or `find_all`
function anywhere in it (verified in the vendored crate). The app therefore
**cannot ask the operating system "which keys do I have?"**

Two further facts from the same source:

- **The OS store cannot hold portable metadata.** `update_attributes`
  *"ignores (without error) any specified attributes that aren't supported by
  that store"* — the attributes map to `username` / `comment` / `target_alias`
  on Windows, `label` on macOS, and arbitrary attributes on Secret Service.
  A key's name and created date cannot be relied on to live beside the
  secret.
- **Many entries are fine.** No store documents a hard cap; dozens to
  hundreds is routine. Windows' blob limit is 2560 bytes (a provider key is
  ~100 bytes UTF-16, so there is room — but a pasted value over 1 KB should
  be refused with a clear message rather than let the keyring throw
  `TooLong`).

> **Therefore: the secret in the credential store, the metadata in a sidecar
> JSON file beside the app's other data.** This is not a workaround — it is
> the only portable design, and it is what the server side already does.

#### 3.3.3 The data model

Two shapes, so a secret cannot leak into the pipe by accident:
`ProviderKey` (metadata only) and `StoredProviderKey = ProviderKey & { secret }`
(only ever in Rust memory or in the server's file).

| Field | Type | Owner | Notes |
|---|---|---|---|
| `id` | `string` — opaque, app-generated | app | Stable across a rename. Never derived from the secret, never the name — the same rule the repo already applies to folder handles (`docs/storage.md:217`) |
| `provider` | `string` | app | One of the ids in the shared provider table |
| `providerLabel` | `string` | app | `"OpenRouter"`. **Never called `label`** — that is the D3 collision |
| `name` | `string` | user | Required, 1–64 chars, unique per provider, editable. The only thing that distinguishes two keys for one provider in every console surveyed |
| `nameIsDefault` | `boolean` | app | True until the user renames it, so the app does not show "Personal" as though the user chose it |
| `createdAt` / `updatedAt` | `number` — unix seconds | app | The true creation time is unknowable (the keyring does not expose `LastWritten`), so this is when *the app* stored it |
| `lastUsedAt` | `number \| null` | app | When **the app** last sent a request with it — not the provider's `last_used_at`, which needs an admin API. Label it "last used by Tavi" |
| `maskedValue` | `string` | app | Vendor prefix + last four, computed **at write time**. The app never reads the secret back, so it cannot ask the provider for a mask it did not issue |
| `valid` | `boolean \| null` | provider | `null` = not checked / unknown. Never `false` for "not checked" |
| `checkReason` | `"not-accepted" \| "rate-limited" \| "no-credit" \| "not-checked" \| "unreachable" \| null` | provider | The 429 states are their own reasons (D6) |
| `checkedAt` | `number \| null` | app | |
| `account` | `string \| null` | provider | The provider's own masked name for the key. **OpenRouter only** (`data.label`) |
| `organizationId` / `workspaceId` | `string \| null` | provider | **Anthropic only** — the `anthropic-organization-id` and `anthropic-workspace-id` response headers, which are the cheap substitute for the Admin API |
| `principal` / `scope` / `status` / `expiresAt` | provider | provider | Admin-API only; normally `null`. The app never sets them. `expires_at` is published by **OpenRouter** today |
| `organizationId` / `workspaceId` | `string \| null` | provider | **Anthropic** — the `anthropic-organization-id` and `anthropic-workspace-id` response headers. **OpenRouter** publishes both too (`organization_id`, `workspace_id`), and they are the "acts as an account" facts the reference design is about |
| `creatorUserId` | `string \| null` | provider | **OpenRouter** (`creator_user_id`) — who made the key |
| `limit` / `usage` | `number \| null` | provider | **OpenRouter only.** The other three providers publish no limit. `usage` is **all-time**; the windowed figures are separate |
| `limitRemaining` / `limitReset` | `number \| null` / `"daily" \| "weekly" \| "monthly" \| null` | provider | **OpenRouter.** `limitRemaining` is the remainder; `limitReset` says **which window** the cap applies to. The app reads neither today — see D8 |
| `limitCurrency` | `string \| null` | provider | The unit of the limit. **Never assumed by the formatter** — only OpenRouter reports a limit today, and a silent "$" on another provider's number would be a lie |
| `usageInWindow` | `number \| null` | provider | Usage **in the cap's window** — `limit - limitRemaining`, or the matching `usage_daily` / `usage_weekly` / `usage_monthly`. This is the number that belongs in "of $10.00 used" |
| `isFreeTier` | `boolean \| null` | provider | **OpenRouter only.** Whether the account has ever paid |
| `scopes` | `string[] \| null` | provider | Read-only. OpenAI admin API only |
| `note` | `string \| null` | user | Stripe's "where you saved it" |
| `source` | `"keyring" \| "server-file" \| "env"` | app | Which store holds the secret, so the UI can say where it lives |
| `secret` | `string` | user | **Never in `ProviderKey`.** Keyring or the 0600 file only. Never in an API response, never in the webview, never in a log |

#### 3.3.4 The storage layout

**Desktop.** Credential store: service `"tavi"`, account
`api-key:<localKeyId>` — a per-key id, so distinct keys are distinct
entries. (On Windows the target name becomes `api-key:<id>.tavi`; on macOS
the service and account are separate fields; on Linux they are attributes.)

Metadata sidecar, in the app data directory beside `window-state.json` —
`%APPDATA%\com.mad.tavi\provider-keys.json`,
`~/Library/Application Support/com.mad.tavi/provider-keys.json`,
`$XDG_DATA_HOME/com.mad.tavi/provider-keys.json`:

```json
{
  "version": 1,
  "providers": {
    "openrouter": {
      "activeKeyId": "key_01J8Z7H4Q9N2M",
      "keys": [
        {
          "id": "key_01J8Z7H4Q9N2M",
          "provider": "openrouter",
          "name": "Personal",
          "nameIsDefault": false,
          "createdAt": 1760000000,
          "lastUsedAt": 1760000000,
          "maskedValue": "sk-or-v1-…-890",
          "valid": true,
          "checkReason": null,
          "checkedAt": 1760000000,
          "account": "sk-or-v1-au7…890",
          "limit": 100, "usage": 12.5, "remaining": 87.5, "isFreeTier": false
        }
      ]
    }
  }
}
```

`activeKeyId` is the **only** active marker — do not also carry
`active: true` on the record, because two sources of truth for one fact is a
drift bug waiting to happen. The file holds **no secrets**, so it is safe to
read and diff. Write it atomically: a temporary file, then a rename.

**Website's server.** One file, `0600`, with the secret as a clearly-marked
field of each record — the "one place to keep in step" rule the repo
prefers (`docs/storage.md`), with the secret isolated by a *field* rather
than by a file. `writeFileSync` with `mode: 0o600` **plus** the existing
`chmodSync` on every write, because `writeFileSync` only applies the mode
when it creates the file.

#### 3.3.5 Migration from today's layout

Today: keyring service `"tavi"`, account `"api-key:<providerId>"`, plus two
legacy names the existing `read_key` already migrates
(`src-tauri/src/keys.rs:126-146`).

1. If the sidecar exists and is version 1 → nothing to do.
2. Otherwise, per provider: read the old entry; if absent, try the two
   legacy names. **Reuse the existing `migrate_key` — do not write a second
   implementation of it.**
3. If a secret was found: mint a local id; **write the new entry first**;
   read it back to confirm; **then** delete the old entry.
4. Build the record. `name` defaults to the provider label with
   `nameIsDefault: true` — **do not invent "Personal"**, which the user
   never chose. `createdAt` is now, because the real creation time is not
   recoverable.
5. `activeKeyId` = that key; it was the only one.
6. Write the sidecar atomically.
7. **If the sidecar write fails, roll back** — delete the new keyring
   entries, leave the old ones, report the failure. A half-migrated store
   leaves the app unable to find a key it has.

The server's migration is the same shape over `server-keys.json`, whose
current shape is `{ "<provider>": "<secret>" }`; **keep reading the old
shape as a fallback** so a downgrade loses nothing, and write the new shape
on the next write.

#### 3.3.6 The validation table

Verified by direct probe on 2026-10-21 against the live endpoints with a
deliberately invalid key.

| Provider | Endpoint | Auth | Cost | 401 | 403 | 404 | 429 | Reports |
|---|---|---|---|---|---|---|---|---|
| **OpenRouter** | `GET /api/v1/key` | `Bearer` | free | `{"error":{"message":"User not found.","code":401}}` | — | — | rate limit; `402` for exhausted credits | ✅ `label` (masked), `usage*`, `limit`, `limit_remaining`, `is_free_tier`, `expires_at`, `scope`, `organization_id` |
| **Anthropic** | `GET /v1/models` | `x-api-key` + `anthropic-version: 2023-06-01` | free | `authentication_error` | `permission_error` — the key lacks permission for the resource | `not_found_error` — an unknown **workspace**, never a key problem | `rate_limit_error` — org limit, tier cap, workspace spend limit | ✅ response headers `anthropic-organization-id`, `anthropic-workspace-id`. ❌ name/principal/scope/status need the Admin API (admin key required; **workspace keys rejected**) |
| **OpenAI** | `GET /v1/models` | `Bearer` | free | `invalid_api_key` | unsupported country/region | — | `credit_balance_exhausted`, `rate_limit_error`, `organization_spend_limit_exceeded`, `project_spend_limit_exceeded` | ❌ nothing, unless an admin key is used for `GET /organization/admin_api_keys` (opt-in only) |
| **NVIDIA NIM** | `POST /v1/chat/completions`, `max_tokens: 1` | `Bearer` | **one inference** | — | ✅ **`{"status":403,…,"detail":"Authorization failed"}`** — this is what a bad key gives | `page not found` — wrong **model slug**, not a key problem | rate limit | ❌ nothing. ⚠️ `GET /v1/models` is **public** and must not be used (D6) |

**The rule the table gives:** 401 and 403 mean "not accepted"; **404 is never
a key problem**; **429 means the key is accepted** and needs its own state;
402 means a billing problem; anything else means "not checked".

#### 3.3.7 Which key a request uses

1. **Two levels, two settings.** Which *provider* — one app-level setting
   (OpenRouter today). Which *key within it* — a per-provider explicit
   active pointer. Never conflated.
2. **The active key is a pointer, never an inference.** Not "newest wins",
   not "first in the list", not "the one whose `valid` is true". All of
   those silently change which account is billed.
3. **Exactly one active key per provider.** Setting a new one demotes the
   old; `activeKeyId` is the single source of truth.
4. **Adding a second key never changes the key in use.** The first key for
   a provider becomes active; later keys are added inactive. Every console
   surveyed behaves this way.
5. **Removing the active key requires a replacement, or leaves the provider
   with no active key — and says so.** Never fall back silently to another
   key for the same provider; that is the exact failure where a work key
   starts paying for a personal key's requests.
6. **The environment variable is a fallback, not a peer** — and the UI must
   say when it is in use: *"This server is using the OPENROUTER_API_KEY
   environment variable, not a key you can see here."*
7. **The key in use must be visible at the moment of the request.** The
   account badge and the settings pane must read the same shape and agree.
8. **The request carries a `keyId`, not a secret** — leaving room for a
   future per-conversation choice to be a change to the request, not to the
   storage.
9. **The change takes effect on the next request, with no restart.** The
   server already re-reads its store per request; the desktop side must do
   the same rather than caching the key at startup.

#### 3.3.8 Rotation and revocation

Every source prescribes the same sequence: **create new → switch → verify →
delete old**, with an overlap window (Stripe: seven days, the replacement
keeps the same name). The local version can be stronger than that, because
there is never a moment without a working key:

1. **Validate the new secret first.** A failed check leaves the old key
   completely untouched.
2. **Write the new secret** to a new credential entry under a new id. The
   old entry is still intact and still usable.
3. **Update the index**: add the record, point `activeKeyId` at the new one.
4. **Delete the old credential entry.**
5. **Never delete the old secret before the new one is stored.** The repo's
   own `migrate_key` already states the principle
   (`src-tauri/src/keys.rs:96-102`).

| Failure | State | What the app must do |
|---|---|---|
| New key refused (401/403) | old key untouched and still active | keep the dialog open, name the provider and the code. **Save must be blocked** |
| Keyring write fails | nothing changed | error shown, dialog open, **nothing written to the index** |
| Index write fails after the keyring write | an orphaned secret | **delete the new entry and report the failure.** An unindexed secret is one the app can never find again — worse than no secret |
| Deleting the old key fails | new key active and working; old secret still in the store | **a warning, not an error**: *"The old key is still in the credential store."* Offer a retry |
| The network fails during the check | unknown | allow the save with a warning. **Never treat a transport failure as "not accepted"** |
| The provider revokes the key later | the local record is invalid | the next check reports 401 → the row says "Not accepted" and offers a replacement. The app does **not** delete the record on its own |

#### 3.3.9 The UI this implies

**The list is grouped by provider.** The provider is a property of the *key*,
and two keys for one provider must sit together. Each provider section
carries a count badge and the "in use" marker.

| Slot | Content |
|---|---|
| **Title** | **The key's name** — the user's own name. This replaces today's provider label as the row title, and it is the whole reason two OpenRouter keys are distinguishable |
| **Description** | Whose key it is (the provider's account), plus the masked value so it can be matched against the provider's console. Where the provider reports no account, say so: *"This provider does not say whose key it is."* |
| **Status badge** | Accepted / Not accepted / **Rate limited** / **No credit** / Not checked — the 429 states are their own, and never "Not accepted" |
| **Active marker** | A distinct **"In use"** badge. Exactly one per provider |
| **Last used** | From the app's own `lastUsedAt`, labelled as the app's own use |
| **Added / Expires** | From `createdAt`; an expiry only when the provider reports one |
| **Actions** | **Make active** · **Rename** · **Replace key** · **Check now** · **Remove** |

**And the parts that must not move:** one shape (`ProviderKey`) used by both
builds and both servers; one implementation of "ask a provider about a key"
per language; one provider table, with a test that the Rust and TypeScript
copies agree — the same technique `src/lib/commands.test.ts` already uses
for the command list.

**Decision:** One `ProviderKey` shape with the secret outside it. The secret in the credential store and the metadata in a sidecar, because the store cannot be enumerated and cannot hold portable metadata. The active key an explicit pointer, never an inference. Each provider checked in the one way it can be.

### 3.4 The Add-key button geometry (V2)

Measured in the running app, wide shape, at a 1512 px viewport. `x` is in CSS
pixels; the pane's content box runs from 399 to 1164 (the `DialogBody` has
`px-6` and `pe-14` to clear the card's close button).

| Element | left | right | centre y |
|---|---|---|---|
| Pane content box | 399 | **1164** | — |
| `API keys` heading | 399 | 1002 | 140 |
| **`+ Add key` button** | 1071 | **1164** | 145 |
| Key row (`Item` box) | 399 | 1164 | 249 |
| Row actions (`ItemActions`) | 922 | **1152** | 249 |
| **`Remove` button** | 1059 | **1152** | 249 |
| Card close `×` | 1176 | 1208 | 137 |

Two findings, both visible:

1. **The right edges do not line up: 1164 vs 1152 — 12 px apart.** The
   `Item` component insets its own content by `--item-px` (12 px at
   `size="sm"`), so the row's actions sit 12 px inside the pane's content
   edge, while the header's button sits exactly on it.
2. **The vertical planes do not line up: 145 vs 140.** The heading's text
   centre and the button's centre are 5 px apart, because the button is in a
   flex row whose top edge is the block's top edge, not the text's centre
   line.

**The reference design puts the action on the title's line**, with the
description beneath it. The current layout puts the description in a column
with the heading and the button beside the column, which is why the button
ends up beside the *description* rather than beside the *title*.

**The fix, in two parts.**

- *Structure.* The heading and the action become siblings in the first row,
  with `items-center` so the button's centre and the heading's centre are
  the same y. The description moves below that row, as in the reference.
  With `flex-wrap`, a narrow (portrait) card wraps the action onto its own
  line — which is where it lands at the bottom-left, and is the correct
  behaviour when there is no room for it beside the title.
- *Right edge.* Both action columns must end at the same x. Two ways:
  - **(i)** remove the row's horizontal inset so the row's actions end at the
    pane's content edge (1164), where the header's button already is. This
    also fixes the left side: the icon tile moves from 411 to 399, where the
    heading is. The catch is a Tailwind specificity trap: `Item` sets
    `px-(--item-px)` and a `px-0` in `className` may lose to it depending on
    the order the stylesheet emits them, so the inset has to be removed by a
    means that cannot lose — overriding the `--item-px` custom property
    rather than the `padding-inline` property.
  - **(ii)** inset the header's action by the same 12 px so it ends at 1152.
    Smaller change, but the two then have to agree by hand, and they drift
    the moment the row's padding changes.

  **(i) is the right answer**: one right edge for the whole pane, and the
  heading and the rows' content on the same left edge. The value must come
  from a single token so the two cannot drift.

**Decision:** The heading and the action are siblings on the first row with `items-center`, and the row’s own inset is removed by overriding `--item-px` on the element — which cannot lose to the stylesheet — so the icon tile starts where the heading starts and the actions end where the button ends.

### 3.5 Where the conversations live, and the Privacy pane (T2, C6, C7)

The user's requirement: *the user should be able to clear that data, clear
cache and all that from the app's settings; the Delete everything button
should work in the browser by deleting from the browser, and in the app by
deleting from the app; the same for Export and Import.*

**What exists today, verified:**

| | App | Browser |
|---|---|---|
| Where the conversations live | the app's own file, written by Rust (`src-tauri/src/threads.rs`) | `localStorage` under the `tavi` namespace (`src/lib/thread-repository.ts:138`) |
| "Delete everything" | `clearChats()` + `clearSessions()` → `invoke("clear_threads")` | the same calls → the browser repository clears `localStorage` |
| Export | Rust writes the file, chosen through the OS save dialog (`src/lib/backup.ts:64`) | a browser download |
| Import | Rust reads the file (`src/lib/backup.ts:92`) | a file input |
| "Where your conversations are" | the app's own folder, path shown | the browser's storage, path absent (`settings-privacy.tsx:130-141`) |

So the behaviour the user wants **already works** — the pane calls the same
functions in both builds, and the functions branch on where the data lives.
Two things are worth confirming rather than assuming:

1. The browser's "Delete everything" clears `localStorage` for the app's
   namespace, but a browser's "clear site data" also clears the **folder
   handles** in IndexedDB (`src/lib/fs-access.ts`) — the granted folders. The
   Privacy pane's wording should say so, or the button should clear them
   too. **This is a real gap: the button says "every chat and every session",
   and the browser's conversations are indeed every chat and every session —
   but the granted folders are the user's access to their own disk, and
   whether "delete everything" should revoke them is a product decision, not
   an oversight.**
2. The browser's export uses a download and its import uses a file input, so
   the "choose a file" step looks different in the two builds even though
   the button does the same thing.

**Decision:** Conversations are conversations, and folders are access to the user’s own disk. “Delete everything” removes every chat, every code session **and** every folder grant, and there is one button for each kind as well, so neither has to guess what the other does. The pane says that clearing site data in a browser removes the folder grants too.

### 3.6 Prefs across two origins (T3)

`src/lib/prefs.ts:4-5` says it plainly: *"Backed by `localStorage`, which
behaves the same in the browser and inside the Tauri webview, so one code
path covers the web target and the desktop app."*

The mechanism is the same. The **storage area is not**: `localStorage` is
per-origin.

| Build | Origin in dev | Origin in production |
|---|---|---|
| App | `http://localhost:1420` (dev) — the same as the browser | `tauri://localhost` |
| Browser | `http://localhost:1420` | the website's own origin |

So in development the app and a browser tab on the same machine **share**
their preferences, and in production they do not. That is correct and
cannot be changed: a preference is a property of a profile, and the app and
the website are two profiles.

**Is that how a professional app does it?** Yes. Every desktop app that also
has a website treats them as separate profiles with separate local state, and
synchronises across them only through an account — which this app has none
of, by design (`README.md`, "The account row is not an account": *"There is
no signed-in user, no email, no plan to upgrade and nothing to log out of,
because there is no auth anywhere in the app"*).

The one thing that must be true: **the app must not silently read a
preference that was set somewhere else and behave as though the user chose
it here.** It does not — each origin has its own.

#### 3.6.1 Two consequences the repo should write down

**1. In development the two builds share one `localStorage`.** MDN: *"`localStorage`
is partitioned by origin only. All documents with the same origin have access
to the same localStorage area."* In `pnpm tauri dev` the app's webview and a
browser tab are both `http://localhost:1420`, so a preference set in one is
visible in the other — and **a bug that depends on a fresh `localStorage`
will not reproduce in development.** In production the app is `tauri://localhost`
(macOS/Linux) or `http://tauri.localhost` (Windows) and the website is its
own origin, so they are separate.

**2. The comment in `src/lib/prefs.ts:4-5` is true of the API and false of
the area.** It says `localStorage` *"behaves the same in the browser and
inside the Tauri webview, so one code path covers the web target and the
desktop app"*. The **API** is the same — that is the important half, and it
is what makes one code path possible. But the **area** is not, and a
comment like this is the kind of statement that ages into a bug: someone will
add "and the preferences carry over", which is false in production.

**The rule to write down instead:** *the app and the website are two
profiles, with two preference sets, that share one code path. A preference
never crosses between them except as a one-time migration.*

A one-time migration is not sync. The app importing the browser's
conversations on first run (`src/lib/thread-repository.ts`) is a migration
with a defined end point, and should stay labelled as one.

**Where the rule is written down.** It is in `docs/storage.md`, in the
preferences section, and in the comment at the head of `src/lib/prefs.ts`,
which now says the two are two profiles rather than one area that behaves the
same in both. The first of the two consequences above is in the same place:
it is the reason a test that needs a clean `localStorage` cannot be trusted in
development.

#### 3.6.2 The industry rule for cross-device preferences

Sync happens through an account, or not at all.

- **VS Code Settings Sync** — *"Settings Sync keeps your Visual Studio Code
  preferences consistent across devices"*, and it requires sign-in, with
  per-category opt-in and conflict-resolution prompts.
- **Tavi has no account at all** — *"There is no signed-in user, no email,
  no plan to upgrade and nothing to log out of, because there is no auth
  anywhere in the app"* (`README.md`).

So the answer for Tavi is: **do not sync, and be explicit that you do not.**
Three rules follow:

1. **Never silently read the other profile's state.** Each origin has its
   own; nothing should reach across.
2. **A one-time migration is not sync** — and it must be labelled as one.
3. **A preference that means "which machine" must not be portable.** The
   window's geometry, the machine's installed fonts and the credential
   store's contents are properties of a *machine*, not of a person, and
   there is no account to attach them to. A preference that means "which
   person" could be synced later, if an account ever exists.

**Decision:** The app and the website are two profiles with two preference sets that share one code path. Nothing crosses between them except a one-time migration, and no preference crosses at all.

### 3.7 Guardrails: what industry practice actually is (G1, G2, G4)

**G1 — the HTTP boundary.**

Contract testing splits into two families:

| Style | Who writes the contract | Tooling | Best for |
|---|---|---|---|
| **Provider-driven** (schema-first) | the provider, in OpenAPI | `oasdiff` (schema diffing), Schemathesis, Dredd, Portman | a published API with many consumers |
| **Consumer-driven** | the consumer, in Pact | Pact + Pact Broker, `can-i-deploy` gates | catching a real consumer's breakage before deploy |

*(Sources: Pact docs; Schemathesis; Dredd; Steve Kinney's "API Contract
Testing" — "Treat contract testing as compatibility testing, not total
correctness testing"; API7's "Contract Testing in API Development".)*

For **this** repository the honest answer is that neither family's machinery
is warranted: there is one HTTP boundary, one consumer (the app), one
provider (the server), and both live in the same repository and change in the
same commit. A Pact broker and an OpenAPI document would be a lot of
ceremony for one boundary.

**Why the machinery is not warranted here, from the sources themselves:**

- **Fowler's consumer-driven contracts** — the load-bearing idea is not the
  tooling, it is that *"expressions of consumer expectations can be captured
  in a spreadsheet or similar document … By going a little further and
  introducing unit tests that assert each expectation, we can ensure that
  contracts are described and enforced in a repeatable, automated fashion
  with each build."* A broker is not required.
- **Fowler's Contract Test bliki** — *"These tests need not be run as part
  of your regular deployment pipeline. Your regular pipeline is based on the
  rhythm of changes to your code, but these tests need to be based on the
  rhythm of changes to the external service."* **Tavi's two sides change in
  the same commit** — the strongest possible form of "same rhythm". There is
  never a window in which one side is deployed and the other is not, which
  is the entire problem a broker exists to manage.
- **Pact's own applicability criteria** — *"You (or your team) control the
  development of both the consumer and the provider"* ✅; *"The provider team
  can easily control the data returned"* ✅; *"a small enough number of
  consumers"* ✅. Tavi satisfies every **organisational** precondition and
  violates every **scale** precondition. The broker is for the case where
  the sides cannot change together, which is not this case.
- **Kinney** — *"Treat contract testing as compatibility testing, not total
  correctness testing"*; and, directly relevant to the plan's shape test,
  *"Writing CDC tests at the UI layer … Contract tests should wrap the
  consumer code that actually makes the remote call, not an entire frontend
  stack."* So the shape test belongs at the adapter layer, not at the
  settings-pane level.

**But the idea behind them is exactly right, and this repository already
applies it to the Rust boundary**: `src/lib/commands.test.ts` reads both
sides — the frontend's `invoke("…")` calls and Rust's `generate_handler![…]`
list — and asserts they agree. That is a contract test. The HTTP boundary
needs the same test, written the same way, by the same house style:

- read every `fetch("/api/…")` in `src/`
- read every `url.pathname === "/api/…"` in `server/main.ts`
- assert every path the frontend fetches is one the server serves, **and
  that the method the frontend uses is one the server allows for that path**
- report the file and line when it is not

That is ~40 lines, needs no new dependency, runs in the existing
`node --test` suite, and turns "a renamed route breaks only in the browser"
into a failing test.

**What is deliberately not being adopted, and why:**

| Not adopted | Why |
|---|---|
| An OpenAPI document | One consumer, one commit. It would be a second source of truth that needs its own drift machinery (oasdiff / Dredd / Schemathesis) to be worth anything |
| Pact + a broker | The organisational preconditions are met but the scale ones are not; the broker coordinates independently-deployed sides, and Tavi's sides never are |
| Schemathesis | It needs an OpenAPI schema to generate inputs from, and a running server. Right tool for a published API with unknown consumers; Tavi has neither |
| **A shape test** | **Yes** — the shape drift is real and has already happened (D3) |
| **A shared payload definition** | `zod` is already a dependency (`src/toolkit.tsx:10`). Defining the API payloads as schemas in one module, and deriving an OpenAPI document from them *later* if there is ever a second consumer, is a cheap future option. Today it is enough to define the shape once and have Rust and Node read the *same* key list |

**G2 — where the two builds may differ.**

The industry pattern is a **capability registry**: a single list of what the
build can do, with the detection in one place, rather than scattered
`isDesktopApp()` checks that each component makes for itself. The failure
mode of the current arrangement is exactly what happened here — a component
that asked "am I on the desktop?" and answered "no, so I will hide the
buttons", with nothing recording that as a decision.

The proportionate version for this repo:

- a module listing every place the two builds are allowed to differ, each
  with its reason;
- a test that reads `src/` for the build checks (`isDesktopApp`,
  `isKeyStoreAvailable`, `isDesktop`) and **fails when a file uses one and
  is not on the list**.

The test is the important half. Without it the list rots; with it, adding a
build-dependent screen is a deliberate act that someone has to write down.

**G4 — the two sides must answer the same shape.**

The same technique applies to the data: the browser's route and the app's
command must answer the same shape, or the pane is written twice. This is
what D3 and D4 are. A test that compares the shapes — the Rust command's
serialised keys against the server's serialised keys, and the TypeScript
type against both — closes the class.

**Decision:** Read the implementation, not a copy of it: a test that reads the frontend’s `/api` calls and the server’s routes and says they agree, and a test that reads the build checks and says every file that consults the build is on the list of the places the two builds may differ.

### 3.8 Proving the two builds are the same screen (G2)

A registry of differences stops *new* drift. It does not prove the two
builds render the same thing. That needs a test, and the research says
exactly which kind.

**The visual-comparison trap.** Playwright's own screenshot guidance warns
that *"browser rendering can vary based on the host OS, version, settings,
hardware, power source, headless mode, and other factors"*. A Tauri window
on Windows is **WebView2** — a particular Chromium build with Edge's
settings; the website is tested in Playwright's bundled Chromium. The pixels
are not comparable, and `toHaveScreenshot()` cannot be pointed at both and
diffed meaningfully.

> **Compare structure, not pixels.** The right primitive is an **ARIA
> snapshot** (`toMatchAriaSnapshot`) — a deterministic, text-based
> serialisation of the accessible tree: role, name, state. It is immune to
> rendering differences, and it is *precisely* what differs when a control is
> disabled-with-a-reason versus absent. "The same screen" should mean "the
> same accessible tree" — which is also what a screen-reader user actually
> experiences.

**Playwright's project model is the right shape for it.** A project is *"a
logical group of tests running with the same configuration"*, and the docs
give the environment axis explicitly: *"You can also use projects to run the
same tests in different configurations"* — for example, *"different
environments such as staging and production"*. So **two projects, two
`baseURL`s, one shared `testMatch`** is a first-class concept, not a
workaround.

**Tauri has a browser mode for exactly this.** Its WebDriver documentation
names WebdriverIO's `@wdio/tauri-service`, and describes a **browser mode**:

> *"Browser mode lets you test your Tauri frontend UI in plain Chrome
> against a running Vite dev server — no Tauri binary, no tauri-driver, no
> WebKitWebDriver or msedgedriver. Tauri commands are intercepted at the
> `window.__TAURI_INTERNALS__.invoke()` JavaScript boundary in the renderer,
> so you can mock individual commands and assert on their call arguments
> just like in native mode."*
>
> *"Your frontend code runs for real in Chrome; the Tauri Rust backend is
> replaced by mocks you define per command. Same WDIO API, same frontend
> code path — the only thing that changes is what's on the other end of
> `invoke(...)`."*

**And a unit-level equivalent.** `@tauri-apps/api/mocks` ships `mockIPC` for
the "same component, two backends" case: *"Ensure the correct backend calls
are made"*, *"Simulate different results from backend functions"*, with
`clearMocks()` between tests.

**The cost note specific to this repository.** `pnpm test` is
`node --test server/*.test.ts src/lib/*.test.ts src/blocks/**/*.test.ts` —
**`.ts` only**. There is no DOM test runner, and no `.tsx` test is picked up
by the current glob. A component-level parity test therefore means adding a
runner (Vitest + Testing Library + jsdom) or restructuring the script. That
is a real cost, and it is the reason to sequence the work:

1. **Static source-reading tests first** — no new dependency at all, and
   they catch the two failures that actually happen (a renamed route, a
   changed shape).
2. **Component tests second** — the ARIA-snapshot parity check, once a
   runner exists.
3. **End-to-end third** — the full matrix, if it is ever wanted.

**Decision:** Structure, not pixels. The static source-reading tests come first — they catch the two failures that actually happen — and the component-level parity check is sequenced last, because it needs a runner the repository does not have.

### 3.9 The accessibility of the keys screen itself

The pane is a list of things, each with actions, inside a dialog, with a
destructive confirmation. That is a shape with known guidance, and two things
in the current markup do not meet it.

#### 3.10.1 The per-row buttons all have the same name

Every row's buttons are called **"Edit"** and **"Remove"**. A screen-reader
user moving down the list hears "Edit, button" … "Remove, button" … "Edit,
button" … with nothing to tell the rows apart. The visible row title is
right there, but it is not in the button's name.

The WAI-ARIA APG says exactly what to do
(<https://www.w3.org/WAI/ARIA/apg/practices/names-and-descriptions/>):

> *"For interactive elements that perform an action, this means a verb is
> the first word. For instance, if a list of contacts displays Edit, Delete,
> and Actions buttons for each contact, then **Edit John Doe, Delete John
> Doe**, and Actions for John Doe would be better accessible names than John
> Doe edit, John Doe delete, and John Doe actions. By placing the verb first
> in the name, screen reader users can more easily and quickly distinguish
> the buttons from one another as well as from the element that opens the
> contact card for John Doe."*

That is this pane, exactly, with a key in place of a contact.

**The fix, and the two rules it has to respect.**

- `aria-label={`Edit ${key.name}`}` — the verb first, then the key's name.
- **The accessible name must contain the visible text**, so the visible
  "Edit" stays and the label is "Edit OpenRouter". This is what keeps voice
  control working: a user saying "click Edit" must still hit the button.
- **`aria-label` hides the descendant content** from assistive technology —
  which is exactly what is wanted here, because the descendant is the word
  "Edit" and the label already contains it. (The same APG page warns about
  this: *"using `aria-label` or `aria-labelledby` will hide descendant
  content from assistive technologies."*)
- **Do not put the role in the name.** "Remove OpenRouter button" would
  double the role that the screen reader already announces.

**The same applies to the trash icon**, which is `aria-hidden` already, and
to the "Make active" / "Rename" / "Replace key" / "Check now" actions the
§3.3.9 list adds.

**The row carries one control, not five.** The buttons those names belong to
used to sit in the row itself — five of them, side by side — and the key's own
name was the smallest thing on the line. They are in a menu at the far right of
the row now, opened by a pencil button, and the name gets the space back. The
naming rule is unchanged by the move: the button that opens the menu is
"Actions for *<key>*", and each item in the menu names the key too, because a
column of menus is still a column of rows.

#### 3.10.2 The list is not a list

The rows are plain `div`s. The vendored `Item` component already knows how
to do this properly: `ItemGroup` sets `role="list"` on the group and
`role="listitem"` on each `Item` — and it only does so when **every** child
is an item, so the semantics cannot be wrong.

The APG treats `role="list"` as *discretionary* — *"potentially beneficial
for users of screen readers that support both list names and navigation
among lists on a page"*, but also *"a source of distracting or undesirable
screen reader verbosity"*. The rule that matters is the one in the ARIA
spec: **`listitem` MUST be contained in, or owned by, an element with the
role `list` or `group`.** So either the rows are a list, or they are not
items.

The right answer here is to use `ItemGroup` — which also brings the
`ItemGroup`'s own arrow-key navigation and its highlight behaviour, both of
which the plain `div` was missing.

**One trap to avoid.** `ItemGroup`'s `grouped` variant paints a surface
(`bg-card`), and the settings pane is already `--card` — so the surface
would be invisible. The `default` variant carries the list semantics with no
surface, which is what this pane wants: the rows are separated by the
hairline dividers the app already uses.

#### 3.10.3 The rest of the pane, checked

| Element | Verdict |
|---|---|
| The count badge inside the `<h2>` | fine — "API keys 1" reads as the heading and its count |
| The status badge | fine — it is **text plus an icon**, never colour alone, and the icon is `aria-hidden` by the `Badge` component's own rule |
| The `+ Add key` button | fine |
| The dialog | fine — `DialogTitle` and `DialogDescription` are both present, so the dialog is named and described |
| The provider `<select>` | fine — labelled by `FieldLabel htmlFor`; base-ui's `Field` also wires the description |
| The key field | fine — `type="password"` with a reveal toggle that carries `aria-pressed`; the input group masks the field's own chrome from the accessible name |
| The paste button | fine — `aria-label="Paste from the clipboard"` |
| The Remove confirmation | fine — the title names the provider (*"Remove the OpenRouter key?"*) and the description says what is lost |
| The destructive button's colour | `ghost-destructive` — red text, and it is still named "Remove"; colour is not the only signal |

**Decision:** Verb first, and the visible text inside the name: “Edit OpenRouter”, not “Edit”. The rows are a list: `ItemGroup`, so the items are `listitem`s inside a `list`. The row's actions live in **one** menu at the far right of the row, so the row carries a single control; the button that opens it is named “Actions for *<key>*”, and every item in the menu names the key as well — “Rename Work key”, “Remove Work key” — because a column of menus is still a column of rows.

### 3.10 What the provider research found

Researched while checking the model catalogue and the effort path. The user
reports both as working, and the **live UI is largely right** — the app's
`EffortPanel` already renders a static label for a one-level model and
renders nothing at all for a model that publishes no levels, which is exactly
what the research says is right.

But the research also found **nine defects**, of which two are in the API
keys' own path and are recorded as **D8** and **D9**. The rest are in the
effort path and the provider adapters, and are listed here so they are not
lost — they are outside the API keys work, and fixing them is a separate
decision.

#### 3.11.1 The corrected allowance line (D8) — this is the keys' own bug

**Probed against the live endpoint on 2026-10-21.** `GET /api/v1/key`
answers, under `data`:

| Field | Meaning | Present today |
|---|---|---|
| `limit` | spending limit in USD; `null` = unlimited | read ✓ |
| `limit_remaining` | **remaining** spending limit in USD | **not read** |
| `limit_reset` | `daily` / `weekly` / `monthly` / `null` — **which window the cap applies to** | **not read** |
| `usage` | **all-time** credit usage | read ✓ |
| `usage_daily` / `usage_weekly` / `usage_monthly` | usage in the current window | **not read** |
| `is_free_tier` | whether the account has ever paid | read ✓ |
| `expires_at`, `creator_user_id`, `organization_id`, `workspace_id` | the key's identity and lifetime | **not read** |
| `budgets`, `rate_limit`, `include_byok_in_limit` | further limits | **not read** |

**The app reads `remaining` — a field that does not exist.** Both sides do:
`server/key-status.ts:96,171` and `src-tauri/src/keys.rs:377`. The field is
`limit_remaining`. So the "remaining" figure in the pane has **always been
null**, and nothing ever showed it.

**And the numerator is the wrong number.** `usage` is *all-time*; `limit` is a
cap that resets (`limit_reset`). So the pane's "$4.20 of $10.00 used"
compares a lifetime number with a monthly cap. The number that belongs in
that sentence is the usage **in the current window** — `limit - limit_remaining`
— and the sentence should name the window.

**What the line should say**, following Cursor's and Vercel's forms:

| Case | The line |
|---|---|
| A limit, in a window | **"$4.20 of $10.00 used this month"**, plus **"$5.80 left"** |
| A limit, over | **"$12.40 over"** — the overage named, never pinned at zero |
| No limit (`limit` or `limit_remaining` is null) | **"No spending limit"** — not a bar at 0%, not "$0.00 of $0.00 used" |
| All-time spend | its own reading — **"$128.40 spent in total"** — so it is not conflated with the cap |
| A limit with no currency | the provider's own unit, attributed: **"Limit 10,000 credits (units as published by OpenRouter)"** — never a silent "$" |

The unit should be a field on the status object, not assumed by the
formatter: `limitCurrency: "USD"`. Today only OpenRouter reports a limit, so
nothing is mislabelled — but the shape should not assume it either.

**The bar** is fine, and belongs beside the limit rather than beside the
token dial, with the numbers in its accessible name rather than only a
percentage.

#### 3.11.2 The catalogue freshness (D5, restated with the research)

The research's finding is sharper than "the app hardcodes `stale: false`":

- `server/models.ts` sets `stale: true` in **exactly one** situation — the
  cache entry existed, the TTL expired, **and** the upstream fetch threw. It
  reports `stale: false` even when it served a copy that was two hours old.
- `src-tauri/src/provider.rs:323-335` does the **identical** thing — it
  serves a cached catalogue silently when the upstream fails — and
  `src/lib/transport.ts:91` hardcodes `stale: false`. So the desktop can
  serve a three-week-old catalogue, containing models that no longer exist
  and prices that have changed, **with no signal at all**, while the website
  signals the identical condition.

**The `stale` boolean conflates three facts:** "this came from a cache"
(uninteresting), "this is older than the TTL" (rarely actionable) and "the
provider is unreachable and this is the last good copy" (the only one a user
can act on).

**The recommendation.** Replace `stale: boolean` with a small freshness
object — `{ fetchedAt: number; degraded: boolean }` — where `degraded` is the
fault indicator, and `fetchedAt` comes from the cache entry that both sides
already keep (`CacheEntry.fetchedAt` in the server, `CachedCatalogue.fetched_at`
in Rust). Render it as a **timestamp** — *"Catalog updated 4 minutes ago"*,
the idiom LM Studio uses on every model card — and **badge only the degraded
case**, with a "Refresh" action. A permanent badge for a 15-minute TTL would
appear constantly and train people to ignore it.

And implement **stale-while-revalidate** in the server (RFC 9111 §4.2.4,
RFC 5861): today `getCatalog` *blocks* on the upstream fetch whenever the TTL
has expired, which is the opposite of SWR and is why the picker can be slow
to open.

#### 3.11.3 The provider capability tables (for the record)

| | **OpenRouter** | **Anthropic** | **OpenAI** | **NVIDIA NIM** |
|---|---|---|---|---|
| Capability endpoint | `GET /api/v1/models` | `GET /v1/models` | **none** | `GET /v1/models` |
| Published field | `reasoning.supported_efforts` | `capabilities.effort.{level}.supported` | — | — |
| Shape | `string[] \| null`, descending | a support flag per level | — | — |
| Levels | `max, xhigh, high, medium, low, minimal, none` | `low, medium, high, xhigh, max` | `none, minimal, low, medium, high, xhigh, max` | documented `low, medium, high` |
| Default | `reasoning.default_effort` | `high` (`medium` on Opus 5.5 / Haiku 5.5) | model-dependent | — |
| **Absent means** | *"does not expose effort selection"* | not published | — | — |
| Wire (nested) | `reasoning: { effort }` | `output_config: { effort }` | `reasoning: { effort }` | `reasoning_effort` |
| Wire (chat completions) | `reasoning_effort` (**no `max`**) or `reasoning:{effort}` | `output_config: { effort }` | `reasoning_effort` (top level) | `reasoning_effort` |
| Thinking mode (separate) | not published | `capabilities.thinking.types` | not published | — |
| Token budget (separate) | `reasoning.supports_max_tokens` | `thinking.budget_tokens` | not published | — |

**A correction worth recording:** there is no `supported_reasoning_efforts`
field in OpenRouter's API. The published field is
**`reasoning.supported_efforts`**. `supported_parameters` only ever carries
the *name* of a parameter, never its accepted values — which is exactly why
the app's own comment is right.

**The four capability states, and what each should show** (the live app
already does three of them correctly):

| State | Control | Copy |
|---|---|---|
| **Documented as absent** | **none** — no effort row, no disabled row | (nothing) |
| **Published, levels unknown** | information only, in the model's detail row | *"Effort: accepted, levels not published"* |
| **Exactly one level** | a static label, not a control | *"Effort: High"* / *"Effort: High (default)"* |
| **Documented as unrestricted** (`supported_efforts: null`) | the gateway's own enum | the gateway's labels |

**The anti-pattern, named:** a fixed `low/medium/high` list. It asserts
support for 130+ models that publish something else, drops `none` / `max` /
`xhigh` for 100+ models that support them, and cannot express a one-level
model. The live catalogue has **27 distinct level sets**, including holes like
`["high","none"]` and `["max","high","low"]`.

#### 3.11.4 The nine findings outside the keys' path

Listed so they are not lost. **None of these is in the API keys screen**;
three are in the server's provider adapters and will produce a 400.

| # | Where | What | Severity |
|---|---|---|---|
| **F1** | `server/providers.openai.ts:44-51` | `DOCUMENTED_EFFORT_VALUES` omits **`max`**, and the comment *"OpenAI's enum stops at `xhigh`"* is now false — OpenAI's Chat Completions reference documents `max` | **stale fact — a 400** |
| **F2** | `src/lib/reasoning.ts:10-13` | the same stale claim in the header comment | stale fact |
| **F3** | `server/providers.openai.ts:224` | sends `{ reasoning: { effort } }` while the adapter declares `apiProtocol: "openai-chat-completions"`, whose wire field is **top-level `reasoning_effort`** | **wrong wire shape** |
| **F4** | `server/providers.anthropic.ts:51-71` | `THINKING_TYPES` omits **`between_tools`**, which Anthropic now publishes — and Anthropic rejects `disabled` at high effort on the newest models | **missing capability** |
| **F5** | `server/key-status.ts:96,171`, `keys.rs:377` | reads `remaining`; the field is **`limit_remaining`** | **see D8** |
| **F6** | `server/key-status.ts` | `limit_reset` is not read, so the app cannot say which window a cap applies to | **see D8** |
| **F7** | `src/lib/catalogue.ts:81-87` | `mandatory` and `default_enabled` are declared and never read. **133 live models are `mandatory: true`** — reasoning cannot be turned off for them — and 31 publish `default_enabled: true` | unread capability |
| **F8** | `src/lib/transport.ts:91` | the desktop hardcodes `stale: false` while Rust serves a stale copy silently — **see D5 and §3.10.2** | asymmetry |
| **F9** | `src/lib/catalogue.ts:243-244`, `prompt-block.tsx:1209-1213` | only `pricing.prompt` and `pricing.completion` are read. OpenRouter also publishes `pricing.input_cache_read` (≈10% of input) and `pricing.overrides[]` for long-context pricing. **Cached input is billed at the full input rate, and long-context requests are mis-costed.** | cost over-reported |

**F10**, the dormant picker's hard-coded `EFFORTS` list, is in §3.10.3 and in
§6.

**Two of these change the `ProviderKey` model in §3.3.3**, which should gain
`organizationId`, `workspaceId`, `expiresAt` and `creatorUserId` — OpenRouter
publishes all four today, and they are the "a key acts as an account" facts
the reference design is about.

**Decision:** Fix the three that will produce a 400 and the two that will mis-cost a request, and record the rest.

### 3.11 The security posture of storing the keys

The threat model for a desktop app holding a provider key, the limits of a
`0600` file on the server, and what the app should say when a key is
suspected of being exposed.

#### 3.12.1 What the OS credential store does and does not buy

| Threat | Who can read the key | The app's position |
|---|---|---|
| The profile is stolen from disk | nobody — DPAPI / the keychain / the keyring all need the login secret | **Good.** The key is not a plaintext file, which is the single biggest thing the credential store buys |
| A malicious process **as the same OS user** | **the key, on all three platforms** — Windows: `CredRead` with no prompt, because the credential set is the *logon session's*; macOS: the item ACL prompts for *other* apps and the "Always Allow" answer is sticky; Linux: *"any application can easily read any secret if the keyring is unlocked"* | **Accepted, and must be said out loud.** The store is an **at-rest** control, not an **authorisation** control, on Windows and Linux |
| A local administrator | the key, everywhere | Out of scope for any desktop app |
| A compromised **npm** dependency (the server) | the key, straight out of the plaintext file — no API needed | **The sharpest edge in the repo.** The desktop's equivalent (a compromised Rust dependency) is bounded by the fact that the key never leaves Rust |
| A malicious browser extension | not the credential store — but the app's DOM and storage, and in dev the same `localStorage` as the webview | The desktop's real control is the Tauri capability system, which is present. `"csp": null` is a gap |
| The key ends up in a log | — | **No.** The server logs neither bodies nor headers, and `get_api_key` is deliberately not a command |
| The key ends up in the webview | — | **No.** The key is never read into JavaScript on the desktop |

**The mitigation the app already gets right**, and should keep: the desktop
never hands the key to JavaScript. `keys.rs` exposes `get_api_key()` as a
plain Rust function, **not** a `#[tauri::command]`, and the comment says
why. That is the boundary that matters, and no amount of file permissions
substitutes for it.

**One fix worth making while the Rust is open.** `src-tauri/Cargo.toml`
enables `keyring`'s `sync-secret-service` feature **without** `crypto-rust` or
`crypto-openssl`. In the vendored source, `secret_service.rs:140-143` and
`:333-336` select `EncryptionType::Plain` unless one of those is on — so on
Linux the secret is transferred **in the clear over the D-Bus session bus**.
The bus socket lives in `$XDG_RUNTIME_DIR`, which the XDG spec requires to
be `0700` and owned by the user, so the practical loss is small — but it is a
gratuitous downgrade from the crate's own posture, and the fix is one
feature flag.

#### 3.12.2 The desktop sidecar: where it goes and what mode it has

The sidecar is **metadata, not a credential** — it holds no secret. But it
does hold the masked value and the account name, which is a fingerprint: the
last four characters of an `sk-or-v1-` key are four hex characters, so
knowing them turns a guess into a confirmation. It is not a new disclosure
channel, because both already cross to the browser in `list_api_keys` — but
it makes an existing disclosure durable and greppable.

**So: per-user confidentiality, and not elaborate machinery.**

| Platform | Location | Directory | File |
|---|---|---|---|
| Windows | `%APPDATA%\com.mad.tavi\provider-keys.json` | inherited | inherited |
| macOS | `~/Library/Application Support/com.mad.tavi/provider-keys.json` | `0700` | `0600` |
| Linux | `$XDG_DATA_HOME/com.mad.tavi/provider-keys.json` | `0700` | `0600` |

**Windows: do nothing, and do not try.** The measured ACL on this machine's
`%APPDATA%` is *user, SYSTEM, Administrators* — no `Users`, no `Everyone`, no
`Authenticated Users`. A file created there inherits that, which is already
correct. Setting a POSIX mode on Windows is a no-op in any case.

**macOS and Linux: set the modes explicitly.** The default umask is `022`, so
a file created without an explicit mode is `0644` — world-readable — and a
directory created without a mode is `0755` — world-listable. `umask(2)` can
only ever *remove* bits, so passing `mode: 0o600` is safe and sufficient;
what is not safe is creating the file with no mode at all.

**The rules, whatever the platform:**

1. Write with an **explicit mode**, and re-`chmod` after every write — the
   mode only applies when the file is created, which is the reason
   `server/key-store.ts:71` already re-`chmod`s.
2. Write **atomically** (temp file, then rename).
3. `0700` on the app's own directory, so a file later created in it without
   a mode is still private.
4. Hold **no secret** in it.

#### 3.12.3 The server's file: a `0600` file is the right answer, in the right place

**The ladder**, and when each rung is right:

| Rung | When |
|---|---|
| Platform secret manager (Vault, AWS/GCP/Azure Secret Manager) | multi-operator, cloud-hosted, or the secret must be shared across machines |
| SOPS / age-encrypted file | the configuration must be version-controlled and the decryption key lives elsewhere |
| **`0600` file on a single-operator host** | **Tavi's case.** One operator, one machine, one process |
| Environment variable | the last resort, and the fallback Tavi already supports |

**The environment variable is not more secure than a `0600` file.** Stripe's
ladder puts the vault first, but GCP's best-practices page is blunt that env
vars are *worse* than you would think — visible to every process in the tree
and to `/proc/<pid>/environ` for the same user. A `0600` file has a
**narrower** blast radius: one path, one mode, one owner.

**But the file is in the wrong place, and the mode is a no-op where it
matters.**

- **`~/Documents` is commonly synced.** iCloud Drive, OneDrive and Dropbox
  put a plaintext secret on someone else's server. The keys must live
  outside every synced folder: `~/.config/tavi/keys` (or
  `%APPDATA%\Tavi\keys` on Windows).
- **Node's POSIX mode does nothing on Windows.** Node's own documentation:
  *"on Windows only the write permission can be changed, and the distinction
  among the permissions of group, owner, or others is not implemented."* So
  `mode: 0o600` and `chmodSync(file, 0o600)` **do not restrict access on
  Windows at all** — the confidentiality there is entirely the inherited
  NTFS DACL. And the DACL measured on this machine's `~/Documents` carries
  an extra `RX` ACE for a group, so a file created there inherits a
  **group-readable** key. On Windows the file must go under `%APPDATA%`, or
  get an explicit DACL.
- **The known risks of a plaintext file on a server:** backups (a zip or a
  cloud agent may not preserve the mode), sync tools, container layers (every
  layer is addressable), a process that dumps its environment, and a
  world-readable parent directory.
- **The same fix as D10 applies**: atomic write, a `.bak`, and a parse error
  treated as a hard error.

#### 3.12.4 What the app should say when a key is suspected of being exposed

The providers all prescribe the same sequence, and the app can carry most of
it:

> **Anthropic** — *"If you suspect that your API key may be compromised, we
> recommend **revoking the key immediately**"*, *"**Monitor usage and logs
> closely**"*, *"**Set spend limits**"*, *"**Use separate keys for different
> purposes** … If your API Key is compromised, this allows you to quickly
> disable just that use case"*, *"**Rotate API keys regularly**"*.
> **OpenAI** — *"**rotate your key immediately**"*, *"**Review your usage**"*,
> *"Set monthly spend limits … **Spend alerts alone don't stop API traffic.**"*
> **Stripe** — *"**Rotate key**"*, *"**Roll out gradually**"*, *"**check its
> request logs** … **expire it only after its request volume has been at
> zero**"*, *"**Stripe recommends configuring access policies on all live mode
> keys.**"*

**The shape, in the settings pane:**

> **If you think a key has been exposed**
>
> Anyone who has seen a key can spend your money. If you think one has leaked
> — it was pasted somewhere public, it was in a log, a screenshot, a shared
> machine, or a tool you do not trust — replace it.
>
> 1. **Create a new key** at the provider and put it in here. The old key
>    keeps working until you remove it, so nothing breaks while you do this.
> 2. **Remove the old key here** once the new one is working.
> 3. **Revoke the old key at the provider.** Removing it from Tavi does not
>    tell the provider anything; only the provider can stop it being used.
> 4. **Check what the key was used for.** Tavi can show the provider's usage
>    figures; the request log is the provider's own.
> 5. **Set a limit so a leak cannot run up a bill.**
>
> A key that has leaked is not a key you can un-leak. Revoke it and replace
> it.

**On a provider row**, when the key is present:

> Kept in this computer's **credential store**. It is never written to disk
> by Tavi, never sent to a browser, and never logged.
>
> If you think this key has been exposed: replace it here, then revoke it at
> {provider} and check {provider}'s usage and request logs.

**On a provider row**, when the provider says the key is not accepted:

> The provider did not accept this key. It may have been revoked at
> {provider} — which is what to do if you think it was exposed — or it may
> have been entered wrong. Make a new key at {provider} and put it here.

**After a rotation**, once the new key validates:

> The new key is in use and the provider accepts it. The old key has been
> removed from this computer's credential store.
>
> **It is still live at the provider until you revoke it.**

**What the app must not say:**

- ❌ *"Your key is secure"* / *"your key is protected"* — it is protected
  against at-rest theft of your profile, not against a process running as you.
- ❌ *"Tavi has revoked the key"* — Tavi cannot revoke; only the provider can.
- ❌ *"Check your usage here"*, implying Tavi can see the provider's request
  log — it can see OpenRouter's aggregate usage figures, and nothing else.
- ❌ *"Your key is safe because it is in the OS credential store"* — that
  names one threat, and the app should name the threat.

**The links this needs**, most of which the provider table already has:
`keysUrl` exists in `src/lib/providers.ts`; `logsUrl` and `limitsUrl` do not,
and would need adding.

| Provider | Revoke / create | Logs & usage | Limits |
|---|---|---|---|
| OpenRouter | `https://openrouter.ai/keys` | `https://openrouter.ai/activity` | — |
| Anthropic | `https://console.anthropic.com/settings/keys` | `platform.claude.com/logs`, `/usage` | `platform.claude.com/settings/billing` |
| OpenAI | `https://platform.openai.com/api-keys` | `platform.openai.com/usage` | project budget, hard enforcement |
| NVIDIA NIM | `https://build.nvidia.com/` | — | — |

#### 3.12.5 Multi-user machines

The app's assumption — **one credential store per OS user** — is sound as
long as each person has their own OS account. Two people sharing one Windows
account share one credential set, and person B can read person A's key with
no prompt. On macOS the trust decision is per *application* identity, so the
second person's apps would prompt; on Linux *"any application can easily
read any secret if the keyring is unlocked"*.

**The naming scheme does not need a user id** — all three stores are already
partitioned by OS user, and a uid in the name would be redundant and brittle
(Windows has no uid). What it **does** need to disambiguate is
**applications**: today the service is `"tavi"` and the account is
`api-key:<provider>`, so **two Tavi installations on one OS account share the
same credential.** The per-key id in §3.3.4 fixes the two-keys-one-provider
case, and because the id is minted by the app and stored in the sidecar, two
installations would each mint their own id and not collide — provided the
service name stays `"tavi"` and the id is genuinely app-instance-scoped.

**One Windows nuance:** `keyring` 3.6.3 writes with
`Persist: CRED_PERSIST_ENTERPRISE`, so the credential **survives logoff** and,
for domain-joined accounts, roams with the account to other machines on the
domain. "Per-user" on Windows Enterprise means "per-domain-user", not
"per-device".

**The server's file is a different case.** It belongs to the **operator**,
and the README says the server holds one key per provider *for everyone who
uses it*. On a shared server the key is shared **by design** — which is
exactly why §3.11 and D11 matter.

**Decision:** The credential store is an at-rest control, not an authorisation control, and the app says so rather than calling a key “secure”. One OS account per person is assumed, and `docs/storage.md` says it. The server’s file is `0600`, out of every synced folder, and written atomically.

---

## 4. The plan

Each item, what it is, what it touches, and how it is verified. Nothing here
is started until the decision lines above are filled in.

### 4.1 Fix the falsehoods (D1, D2, D6)

| Item | Change | Files | Verified by |
|---|---|---|---|
| **P1** ✅ | The font picker's status says what it knows: the count **only** when the list was actually obtained; otherwise the reason from `fonts.ts` | `settings-font.tsx`, `fonts.ts` | the browser announces the reason, not a count |
| **P2** ✅ | Where the Local Font Access API exists, use it — behind the browser's own permission prompt — and fall back honestly elsewhere | `fonts.ts` | Chromium lists real families; Firefox/Safari says why it cannot |
| **P3** ✅ | "Close window" and "Exit" render disabled with a reason in the browser, as every other not-yet-built command in that menu already does | `app-menu.tsx` | the rows are greyed with a tooltip in the browser, live in the app |
| **P4** ✅ | **NVIDIA NIM is not validated by a public endpoint.** Either say NIM cannot be checked, or check it with a 1-token inference **on explicit user action only** | `src/lib/providers.ts`, `keys.rs`, `server/key-status.ts` | a junk string does not produce "Accepted" for NIM |
| **P5** ✅ | 429 is its own state — **Rate limited** / **No credit** — and never renders as "Not accepted". 404 is never a key problem | `keys.rs`, `server/key-status.ts` | the status table in §3.3.6 is implemented as written |
| **P6** ✅ | **The model picker's "no key" state** (D7, G-A): keep the catalogue error instead of discarding it, and show it | `prompt-block.tsx`, `prompt-controls.tsx` | with no key, the picker says why, and does not say "No models match “”" |


**What was done.** **P1** ✅: the picker states the count only when the list was
actually obtained, and the reason otherwise — and the reason is the one already
written in `src/lib/fonts.ts`. **P2** ✅: the Local Font Access API is offered
where it exists, behind the browser's own permission prompt, and only on the
person's request: a **List installed fonts** button, because a prompt nobody
asked for is a prompt nobody wants. **P3** ✅: “Close window” and “Exit” are
disabled in a browser, with the reason on hover. **P4** ✅: NVIDIA NIM is not
checked against its public listing; a NIM key is saved unchecked, the pane says
so, and **Check now** spends one 1-token inference when the user asks for it.
**P5** ✅: 429 is **Rate limited** and 402 is **No credit**, and a 404 is never
a key problem. **P6** ✅: the catalogue's own error is kept and shown, with a
button that opens the settings on **API keys**.

### 4.2 One key shape, one implementation (D3, D4, D6, D8, T2)

| Item | Change | Files | Verified by |
|---|---|---|---|
| **P7** ✅ | One `ProviderKey` shape with `providerLabel` / `name` / `account` — no `label` | `src/lib/secret.ts`, `src/lib/api.ts`, `server/key-status.ts`, `keys.rs`, `provider.rs` | a shape test across all four |
| **P8** ✅ | The account badge and the pane read the same shape; `KeyStatus` and `fetchKeyStatus` go | `sidebar-account.tsx`, `src/lib/api.ts` | the account badge and the pane agree about the same key |
| **P9** ✅ | "Ask a provider about a key" exists **once** in Rust and **once** in the server, each covering all four providers | `keys.rs`, `provider.rs`, `server/key-status.ts` | the old `key_status` command and `fetchKeyStatus` are gone |
| **P10** ✅ | The provider table exists once, and a test asserts the Rust table and the TypeScript table agree | `src/lib/providers.ts`, `keys.rs` | a test, in the style of `commands.test.ts` |
| **P11** ✅ | **The metadata sidecar.** The secret in the credential store, the metadata in `provider-keys.json` beside the app's other data — because the OS store cannot be enumerated and cannot hold portable metadata (§3.3.2) | `keys.rs`, `server/key-store.ts` | two keys for one provider are both listed, and both are found |
| **P12** ✅ | **A named key with an id, and an explicit active pointer** — never an inference (§3.3.7) | `keys.rs`, `server/key-store.ts` | two keys for one provider; exactly one is "in use"; adding a second does not change which |
| **P13** ✅ | **The migration**, all-or-nothing, reusing the existing `migrate_key` | `keys.rs`, `server/key-store.ts` | the current single-key layout migrates; a failed sidecar write rolls back |
| **P14** ✅ | **The rotation order**: validate → write new → switch the pointer → delete old, with the failure table in §3.3.8 implemented | `keys.rs` | a refused new key leaves the old one active and usable |

**P11 and P12 are the ones that change the product.** Today the model is
"one key per provider", which makes "which key does a request use" trivial
but cannot express two OpenRouter keys for two accounts — the common case,
and the one the reference screenshot describes.

**P12 needs one decision the research settles:** the active key is a
**pointer**, never an inference. Not "newest wins", not "first in the list",
not "the one whose `valid` is true" — all of those silently change which
account is billed. One `activeKeyId` per provider, shown in the list,
changed from the list.


**What was done.** **P7** ✅: one `ProviderKey` shape in `src/lib/secret.ts`,
with the secret outside it; a test compares it with the Rust command's and the
server's. **P8** ✅: the account row reads the same list and the same shape, so
the two cannot disagree about which key is in use. **P9** ✅: `keys::check` in
Rust and `fetchProviderStatus` in the server, each covering all four
providers; the old `key_status` command and `fetchKeyStatus` are gone.
**P10** ✅: `src/lib/provider-table.test.ts` reads both tables and says they
agree. **P11** ✅: the secret in the credential store under `api-key:<id>`, the
metadata in `provider-keys.json` beside the app's other data; the server's file
keeps the secret in a clearly-marked field of the same record. **P12** ✅: a
key has an id, a name and an explicit active pointer, and adding a second key
never changes the one in use. **P13** ✅: the migration is all-or-nothing and
reuses the existing `migrate_key`; a sidecar that cannot be written leaves the
old keys exactly where they were. **P14** ✅: a new secret is checked before it
is written, the old one is untouched when the provider refuses it, and a refused
key never becomes the one in use.

### 4.3 The stale catalogue (D5)

| Item | Change | Files | Verified by |
|---|---|---|---|
| **P15** ✅ | The Rust `model_catalogue` command returns the catalogue **and** when it was fetched; the TypeScript derives `stale` from the same TTL the server uses | `provider.rs`, `src/lib/api.ts` | the app says "cached catalog" when its list is old, as the website does |


**What was done.** **P15** ✅: the Rust `model_catalogue` command answers with
the catalogue **and** when it was fetched, and the TypeScript derives the
freshness from the same TTL the server uses. It was done together with **P29**
and **P30** in §4.7.

### 4.4 The button geometry (V2)

| Item | Change | Files | Verified by |
|---|---|---|---|
| **P16** ✅ | The heading and the action are siblings on the first row, `items-center`; the description moves below | `settings-keys.tsx` | the action's centre y equals the heading's |
| **P17** ✅ | The row's actions and the header's action end at the same x, from one token — and the row's icon tile starts at the same x as the heading | `settings-keys.tsx`, `item.tsx` | measured: both right edges equal, both left edges equal |


**What was done.** **P16** ✅ and **P17** ✅, and measured in the running
app: the heading and the **Add key** button share a centre line, the row's icon
tile starts at the same x as the heading, and the row's actions end at the same
x as the button. The row's inset is removed by overriding `--item-px` on the
element, which is a value the stylesheet cannot win against.

### 4.5 The guardrails (G1, G2, G4)

| Item | Change | Files | Verified by |
|---|---|---|---|
| **P18** ✅ | An HTTP contract test: every `/api/…` the frontend fetches is one the server serves, with the method it uses | new `src/lib/api-contract.test.ts` | the test fails when a route is renamed |
| **P19** ✅ | A build-difference registry: every file that branches on the build, with its reason; a test fails when a file branches and is not on the list | new `src/lib/build-differences.ts` + test | the test fails on a new `isDesktopApp()` in a render path |
| **P20** ✅ | A shape test: the Rust command, the server route and the TypeScript type answer the same keys | new test | the test fails when a field is added to one side only |
| **P21** ✅ | **One detector.** `src/lib/secret.ts` re-implements the runtime check instead of importing it; there is one marker, in one file | `src/lib/platform.ts`, `src/lib/secret.ts`, `src/lib/desktop.ts` | the marker string appears once in `src/` |
| **P22** ✅ | **One adapter per boundary**: only the Tauri adapter imports `@tauri-apps/*`, only the web adapter calls `fetch("/api/…")` | `src/lib/desktop.ts`, new `src/lib/web.ts`, new `src/lib/api.ts` | a grep for `@tauri-apps/` finds one file |
| **P23** ✅ | An **ARIA-snapshot parity test** — the same screen, compared by accessible tree rather than by pixels (§3.8) | new, needs a DOM runner | the same spec passes against both builds; sequenced last, because it needs a runner the repo does not have |


**What was done.** **P18** ✅: `src/lib/api-contract.test.ts` reads the
frontend's `/api` calls and the server's routes and says they agree, with the
method as well as the path. **P19** ✅: `src/lib/build-differences.ts` is the
registry and `src/lib/build-differences.test.ts` says every file that
consults the build is on it. **P20** ✅: `src/lib/key-shape.test.ts` compares
the TypeScript type, the Rust command and the server's object. **P21** ✅: the
runtime marker is written down once, in `src/lib/platform.ts`. **P22** ✅:
`src/lib/desktop.ts` is the only file that imports `@tauri-apps/*` and
`src/lib/web.ts` is the only file that calls `fetch("/api/…")`;
`src/lib/api.ts` picks between them. **P23** ✅: the parity test draws the pane twice and compares the two — see the note below.

**P23** ✅: `src/lib/key-parity.test.ts` draws the pane twice — once
as the desktop draws it and once as the website does — and compares the two.

The comparison is of the *structure*, not of the pixels, and that is the
research's own recommendation: a Tauri window is WebView2 and the website is
Chromium, and a screenshot diff would fail on the engine, the display scaling
and the font rendering before it failed on anything that mattered. What is
compared is the markup: the same controls, with the same names, in the same
order, carrying the same state — which is what an ARIA snapshot is a
serialisation of, and what a screen-reader user actually experiences.

The one difference the registry records — the sentence that says where the
key is kept — is allowed, and is named in the test so that a *second*
difference is a failure. The test also says that the rows are a `list`, that
exactly one key is marked “in use”, and that every row's button names the
key it belongs to.

The loader is Vite's, which the repository already depends on, so no new
runner and no new dependency were needed: `vite.ssrLoadModule` reads a
`.tsx` file and `react-dom/server` renders it. The cost is about a minute
in the suite — React and the component library are loaded into Node for the
first time — and it is paid once, not once per test.

### 4.6 The dormant branch (§6)

| Item | Change | Files | Verified by |
|---|---|---|---|
| **P24** ✅ | **Keep** the branch; do not mount it; do not delete it | — | the README's note is extended to name the files it currently omits |
| **P25** ✅ | **Port the markdown renderer** to the live surface, so a model answer in Markdown is not shown as raw `**` and `#` | `markdown-text.tsx` → `streaming-text.tsx` | the live surface renders a table as a table |
| **P26** ✅ | Say plainly, in the README, that the four unreferenced live component folders are unused | `README.md` | — |


**What was done.** **P24** ✅: the branch is kept, not mounted and not
deleted, and the README's note now names every file the branch is made of.
**P25** ✅: the Markdown renderer is now the live surface's renderer.
`src/components/markdown-text.tsx` exports `MarkdownBody`, and
`streaming-text.tsx` renders the answer with it, so there is one set of
Markdown styles in the app rather than two that drift apart — and the answer is
formatted throughout the turn rather than jumping into shape at the end.
**P26** ✅: the README names the four unreferenced live folders.

### 4.7 The allowance line and the catalogue freshness (D5, D8)

| Item | Change | Files | Verified by |
|---|---|---|---|
| **P27** ✅ | **Read `limit_remaining` and `limit_reset`**, not `remaining`; the numerator becomes the usage **in the cap's window**; the line names the window, shows the remainder, names the overage, and says "No spending limit" when there is no limit (§3.10.1) | `server/key-status.ts`, `keys.rs`, `settings-keys.tsx` | a key with a monthly limit reads "$4.20 of $10.00 used this month" and "$5.80 left" |
| **P28** ✅ | The unit is a field, not an assumption: `limitCurrency` | the same three files | a limit without a currency is rendered with the provider's own unit |
| **P29** ✅ | **Replace `stale: boolean` with `{ fetchedAt, degraded }`**, and report it from the desktop too — Rust already serves a stale copy silently (§3.10.2) | `server/models.ts`, `provider.rs`, `src/lib/api.ts` | the app shows "Catalog updated 4 minutes ago", and says so when the catalogue is degraded |
| **P30** ✅ | **Stale-while-revalidate** in the server, so the picker is not blocked on the upstream fetch | `server/models.ts` | the picker opens on the cached copy immediately |


**What was done.** **P27** ✅ and **P28** ✅: the allowance line reads
`limit_remaining` and `limit_reset`, the figure beside the cap is the usage
**in the cap's window**, the overage is named rather than pinned at zero, “No
spending limit” is said when there is no cap, and the unit is the provider's
own field rather than a silent “$”. **P29** ✅: `stale: boolean` is gone in
favour of `{ fetchedAt, degraded }`, and the desktop reports it too — the
picker now says how old the catalogue is, and says so when it is the last good
copy. **P30** ✅: the server serves the cached catalogue at once and refreshes
it behind the caller's back, so the picker is not blocked on the provider.

### 4.8 The security of the key store (D10, D11, D12, §3.11)

| Item | Change | Files | Verified by |
|---|---|---|---|
| **P31** ✅ | **A parse error is a hard error, not an empty store**, and the write is atomic with a `.bak` — a write must never be able to destroy the other providers' keys (D10) | `server/key-store.ts` | a corrupt file is reported, and the next write does not truncate the store |
| **P32** ✅ | The keys directory is `0700`, the file `0600`, re-asserted on every write (D10, §3.11.3) | `server/key-store.ts` | `ls -l` shows `drwx------` and `-rw-------` |
| **P33** ✅ | **The server's keys move out of `~/Documents`** — to `~/.config/tavi/keys`, or `%APPDATA%\Tavi\keys` on Windows, where Node's mode is a no-op and the DACL is user-only (§3.11.3) | `server/key-store.ts`, `README.md` | the file is not in a synced folder, and on Windows it is not group-readable |
| **P34** ✅ | **The mutating key routes are protected**: reject anything that is not `application/json` (or require a custom header, which forces a preflight), verify `Origin` / `Sec-Fetch-Site`, validate `Host`, and drop the `address === ""` fail-open (D11) | `server/main.ts` | a `text/plain` POST from another origin is refused |
| **P35** ✅ | **Decide the deployment model**: bind to `127.0.0.1` for a local server, or remove the ability to change the server's key over HTTP and make it a deployment-time action for a shared one (D11) | `server/main.ts`, `README.md` | — |
| **P36** ✅ | **The redaction covers any key format**, not only `sk-` (D12) | `server/key-status.ts`, `provider.rs` | a non-`sk-` token in a provider's account label is masked |
| **P37** ✅ | **The desktop sidecar** is `0700`/`0600`, written atomically, and holds no secret (§3.11.2) | `keys.rs` | the modes are as stated on macOS and Linux |
| **P38** ✅ | **`keyring`'s `crypto-rust` feature** so the Linux D-Bus transfer is not plaintext (§3.11.1) | `src-tauri/Cargo.toml` | — |
| **P39** ✅ | **The "if you think this key has been exposed" wording**, with the provider's revoke / logs / limits links (§3.11.4) | `settings-keys.tsx`, `src/lib/providers.ts` | the pane carries the guidance and the links |
| **P40** ✅ | `docs/storage.md` says plainly that the credential store is an at-rest control, not an authorisation control, and that one OS account per person is assumed | `docs/storage.md` | — |


**What was done.** **P31** ✅: a file that exists and cannot be parsed is
reported, not treated as an empty store, and the write is atomic with a
`.bak` beside it. **P32** ✅: the directory is `0700` and the file `0600`,
re-asserted on every write. **P33** ✅: the server's keys moved out of
`~/Documents` — that folder is commonly synced to somebody else's server — to
`~/.config/tavi/keys`, or `%APPDATA%\Tavi\keys` on Windows, where the
platform's mode is a no-op and the folder's ACL is the user's alone.
**P34** ✅: the mutating routes require the request to have come from this
machine, to be addressed to a name the server answers to, to carry no
cross-site marker, and to carry the header that makes a browser ask first; the
same checks cover `/api/chat` and `/api/projects/clone`. **P35** ✅: the
server is a local, single-operator server, and the README says so instead of
claiming a shared one. **P36** ✅: the redaction covers any key-shaped run,
not one vendor's prefix, and leaves an already-masked label alone.
**P37** ✅: the sidecar is `0700`/`0600`, written atomically, and holds no
secret. **P38** ✅: `keyring`'s `crypto-rust` feature is on, so the Linux
D-Bus transfer is not plaintext. **P39** ✅: the pane carries the exposed-key
wording and the provider's revoke, usage and limits links. **P40** ✅:
`docs/storage.md` says that the credential store is an at-rest control and
not an authorisation control, and that one OS account per person is assumed.

### 4.9 The provider adapters and the effort path (D9, §3.10.4)

| Item | Change | Files | Verified by |
|---|---|---|---|
| **P41** ✅ | OpenAI's documented effort values include `max`, and the comment says so | `server/providers.openai.ts`, `src/lib/reasoning.ts` | — |
| **P42** ✅ | The chat-completions protocol sends top-level `reasoning_effort` | `server/providers.openai.ts` | — |
| **P43** ✅ | Anthropic's `between_tools` thinking type is published | `server/providers.anthropic.ts` | — |
| **P44** ✅ | The `mandatory` and `default_enabled` flags are read, and cached input is priced at `pricing.input_cache_read` | `src/lib/catalogue.ts`, `prompt-block.tsx` | — |
| **P45** ✅ | The dormant picker's hard-coded `EFFORTS` is deleted, and it renders `availableEffort(...)` — the call it already makes two lines away | `src/components/model-picker.tsx` | — |


**What was done.** **P41** ✅: `max` is in OpenAI's documented enum and the
comment says so. **P42** ✅: the chat-completions protocol sends top-level
`reasoning_effort`. **P43** ✅: Anthropic's `between_tools` thinking type is
published. **P44** ✅: `mandatory` and `default_enabled` are read, and cached
input is priced at `pricing.input_cache_read`. **P45** ✅: the dormant
picker's invented effort list is gone, and it renders the levels the model
publishes.

### 4.10 The accessibility of the pane (§3.9)

| Item | Change | Files | Verified by |
|---|---|---|---|
| **P46** ✅ | **The per-row buttons carry the key's name** — "Edit OpenRouter", not "Edit" | `settings-keys.tsx` | a screen reader announces the row each button belongs to |
| **P47** ✅ | **The list is a list** — `ItemGroup`, so the rows are `listitem`s inside a `list` | `settings-keys.tsx` | the accessibility tree shows a list |


**What was done.** **P46** ✅: every per-row button carries the key's name
— “Edit OpenRouter”, not “Edit” — with the visible text inside the accessible
name, and the role left out of it. **P47** ✅: the rows are an `ItemGroup`, so
the group is a `list` and the rows are `listitem`s inside it.

### 4.11 The flow between the keys and the rest of the app (D7, §1.8)
| Item | Change | Files | Verified by |
|---|---|---|---|
| **P48** ✅ | **The settings dialog can open on a section.** One optional parameter, and every "go and add a key" affordance becomes possible | `settings-dialog.tsx`, `shell.tsx` | the dialog opens on API keys when asked to |
| **P49** ✅ | **The model picker's "no key" state** with a button that opens the settings on API keys (G-A) | `prompt-controls.tsx` | with no key, the picker says why and offers the way out |
| **P50** ✅ | The list is scoped to the key's provider — **only once the app can talk to more than one provider** (G-C, G-D) | `prompt-block.tsx` | the list, the key and the request are about the same provider |

---

## 5. Guardrails in detail


**What was done.** **P48** ✅: the settings dialog opens on a section, and
the model picker's button opens it on **API keys**. **P49** ✅: the picker says
why there is no model and offers the way out. **P50** ✅: the app talks to more
than one provider now — twenty-eight of them and any OpenAI-compatible endpoint
of the user's own, across four request shapes — and the model list is scoped to
the provider in use. The provider is a per-side preference, like the model and
the effort, and everything follows it: the catalogue that is fetched, the list
that is shown, the key the request goes out with, and the provider the request
is sent to. The list and the request are about the same provider by
construction, rather than by agreeing to.

The provider is chosen in the composer, by a control of its own beside the
model one, and the model picker waits for it — the models belong to one. The
control opens a dropdown with two kinds of provider, an **API provider** and a
**CLI provider**, and pointing at either opens **its own dropdown beside it**:
the API one is a searchable list of the providers the user has a key for, and
the CLI one is where the CLI providers will be. A thread records the provider
it was started with, the way it records the model and the effort.

**Every address was checked against the provider itself.** A provider that
answers 401 to a request it understands and 404 to one it does not is how the
addresses were settled: a wrong address is a 404, and a right one with no key
is a 401. Three were wrong and are now right — Perplexity's models are under
`/v1` and its chat is not, and DeepInfra's chat is under `/openai`.

**A provider says where a reasoning level goes.** The field is not the same
everywhere — OpenRouter takes `reasoning: { effort }`, OpenAI and the
OpenAI-compatible providers take a top-level `reasoning_effort`, and Anthropic
takes `output_config: { effort }` — and a level sent in the wrong field is
one the provider ignores. The field is in the provider's own row, and both
halves of the app read it from there.

**Two providers were taken out.** Amazon Bedrock and Google Vertex AI are
signed with AWS credentials and with Google's own rather than with a key, and
the app has no client for either. A provider the app cannot talk to is not a
provider the app supports.

The provider is chosen in the composer, by a control of its own beside the
model one, and the model picker waits for it — the models belong to one. The
control opens a dropdown with two kinds of provider, an **API provider** and a
**CLI provider**, and pointing at either opens **its own dropdown beside it**:
the API one is a searchable list of the providers the user has a key for, and
the CLI one is where the CLI providers will be. A thread records the provider
it was started with, the way it records the model and the effort.

### G1 — the HTTP contract test

**Shape.** Following `src/lib/commands.test.ts` exactly, because that file
already proves the idea works in this repo:

```
read every src/**/*.{ts,tsx}
  find fetch("/api/…") and fetch(`${…}/api/…`)
read server/main.ts
  find url.pathname === "/api/…"
assert every path the frontend fetches is one the server serves
assert the method the frontend uses is one the server allows for that path
```

**Why the method check.** The server's `/api/keys` answers GET, POST and
DELETE; the frontend uses all three. A path can exist and still be wrong for
the method. The current route table is in the file, not in a declaration, so
the test has to read it — which is what makes the test valuable: it is
reading the implementation, not a copy of it.

**What it will not catch.** A path that exists but answers the wrong shape —
that is G4's job.

### G2 — the build-difference registry

**Shape.**

```ts
export type BuildDifference = {
  /** Where the difference is. */
  where: string
  /** What differs. */
  what: string
  /** Why the two cannot be the same. */
  why: string
}
```

and a test that walks `src/` for `isDesktopApp(`, `isKeyStoreAvailable(` and
`isDesktop(`, and fails when a file uses one and is not on the list.

**The list is the point, not the test.** The test only says "you did not
write it down". The list is where a reviewer reads *why* the app and the
website differ, in one place, instead of finding out by comparing two
screens. It should be a short document — the whole point is that there
should be very few entries.

**Which entries it will hold**, from §1: the key store (V1/V2), the font
list (D1/V5), the conversation storage (V3/C6), the system tray (C2), the
window controls (C3), the native tools (C1), the file dialogs (C4), the
folder grant (C5), cloning (C7), the server's keys (C8), the folder picker
(C9), the external link (C11).

#### G2.1 The structure the research recommends

The industry pattern is not "make the two builds identical by construction"
— that is impossible, the website has no Rust. It is **one codebase, one
shared screen, and a narrow, centrally-detected, enumerated set of capability
differences**, where the default path is identical and only the exceptions
are named.

**VS Code is the closest analogue and the best-documented example.** It runs
one codebase on two hosts — Electron on the desktop, a browser on
vscode.dev — and it does it with a single platform module,
VS Code's `src/vs/base/common/platform.ts` (in its own repository), which computes the environment **once, at
module load**, and exports **named facts** rather than a function that
re-sniffs:

```ts
export const isWindows = _isWindows;
export const isMacintosh = _isMacintosh;
export const isNative = _isNative;
export const isElectron = _isElectron;
export const isWeb = _isWeb;
export const isMobile = _isMobile;
export const platform = _platform;   // enum Platform { Web, Mac, Linux, Windows }
```

Every other file imports from it. **Nothing else asks "am I on the web?"**
Note also that VS Code *does* sniff the user agent — but only for things a
capability flag cannot express (`isChrome`, `isSafari`, `isEdge`,
`isAndroid`), and it does so in the one module that owns the question.

VS Code also separates two things this app currently conflates: **the host**
(`UIKind.Desktop` vs `UIKind.Web` — which host am I in) from **the
abilities** (what can I do). `isKeyStoreAvailable()` conflates them: it
answers a *host* question and is used as if it were a *capability*.

**Slack's published lesson is the one to keep.** Slack Desktop is Electron
wrapping the web app, and Slack Engineering wrote up the cost of the
alternative: *"the interop between the two must be an explicit, narrow API
rather than ambient globals"* — documenting the failure modes of injecting
native capabilities onto `window` (implicit global dependencies, mutable
shared state, conflicts with third-party dependencies, untestable).

> The app and the website must **share the screen**, and the native side
> must be reached through an **explicit adapter**, not by sprinkling
> `invoke()` calls through components.

Tavi's `src/lib/workspace.ts` already does this for folders ("There are two
kinds of grant, and the app does not have to know which is which"); it does
not do it for chat, keys, or projects.

**Capacitor's transferable idea** is not "web first" — it is *"one API, many
hosts, and the host that lacks a capability must still answer the same
call."* Tavi's direction is the mirror image (the desktop is the superset),
and the same rule applies.

**The recommended structure for this repository.** Three new files, one rule,
one test:

```
src/lib/platform.ts          (new)  — the ONLY place that knows what runtime this is
src/lib/abilities.ts         (new)  — the registry: what this build can do, and why
src/lib/build-differences.ts (new)  — the render sites allowed to consult an ability
src/lib/desktop.ts           (edit) — becomes the Tauri adapter (the only file importing @tauri-apps/*)
src/lib/web.ts               (new)  — the HTTP adapter (the only file calling fetch("/api/…"))
src/lib/api.ts               (new)  — the facade: one function per operation, picks the adapter
src/lib/parity.test.ts       (new)  — the guardrail, in the style of commands.test.ts
```

**What was built, against that proposal.** Five of the seven are there:
`platform.ts`, `build-differences.ts`, `desktop.ts`, `web.ts` and `api.ts`. Two
were not, and neither was needed as written. `abilities.ts` was not a separate
file: the registry of what this build can do and why is the same list as the
registry of the render sites allowed to consult it, so one file —
`build-differences.ts` — holds both, and the test checks it. And the parity
test is `src/lib/key-parity.test.ts` rather than `parity.test.ts`, because it
compares one screen and not the app as a whole.

> **A naming trap worth avoiding.** Tauri already uses the word
> *capabilities* for something else entirely — `src-tauri/capabilities/*.json`
> are the files that grant **permissions** to windows, and
> `src-tauri/capabilities/default.json` is one of them. A new frontend module
> called `capabilities.ts` would collide with that in every reader's head.
> **`abilities.ts`** (or `platform.ts` alone) avoids it.

**Plus one architectural rule that makes the registry enforceable:** *only
one module per boundary may touch it.* Without that, the registry cannot be
complete — a component can call `invoke()` directly and never consult it.
The repo already half-demonstrates this in `src/lib/workspace.ts` and
`src/lib/file-rules.ts`; it is not enforced anywhere.

#### G2.2 The failure modes the research names — and the two already live

| Failure mode | Already live in Tavi? |
|---|---|
| **The detector drifts from reality, because there are two detectors.** `src/lib/secret.ts:16-19` re-implements `"__TAURI_INTERNALS__" in window` rather than importing `isDesktopApp`. Change the marker in one place and the two disagree — and the disagreement is *semantic*, because one backs a user-visible string and the other backs a transport choice | **Yes** |
| **The probe tests for the API's presence rather than its workingness.** `isDesktopApp()` is the wrong probe for "can this build dictate" — the webview has no route to a speech service. The repo already says so: *"reporting it is not the same as working."* Any capability that depends on an external service — speech, clipboard permission, the Local Font Access permission, the network — must be **probed at runtime**, not inferred from the host | **Yes** — and it is the lesson of D1 |
| **The capability name describes a mechanism, not a capability.** `isKeyStoreAvailable()` names a *store*; the user-visible fact is *"whose computer holds this key"* — mine, or the server's. On the website there *is* a key store. The name is wrong, and the UI consequence is that the pane must pick one of two sentences | **Yes** — `DESKTOP_NOTE` vs `WEB_NOTE` |
| **The check happens too late.** `prompt-block.tsx:1147` computes `setCanPick(...)` inside an effect, so the first paint renders a state derived from `false` and the control appears a frame late. A capability read at render time, synchronously, does not have this problem | **Yes** |
| **The registry rots.** A list nobody checks is a comment. The registry only works if a *test* enforces it | This is G2's test |
| **A capability flag that says true while the feature is broken.** Capability support differs *per webview engine* — the Tauri webview is WebView2 on Windows, WKWebView on macOS, WebKitGTK on Linux — not per host. `src/lib/fs-access.ts` already has to handle this, which is why `prompt-block.tsx:1147` ORs two conditions rather than branching on the host. That is feature detection done right | **Partly** |

**The three-valued distinction is already the house style.** Unity separates
"this platform cannot do X" from "we have not checked whether X is
available", and Tavi already has that distinction in the model catalogue:
*"An absent metadata field is treated as `unknown`, which is distinct from
`unsupported`: the former means 'not looked up', the latter means
'documented as absent'."* A capability registry should carry the same
three values — `yes` / `no` / `unknown` — and an ability that has never been
probed is `unknown`, not `false`.

### G3 — one question, one shape

The root cause of D3 and D4 is that "what does the provider think of this
key" was answered twice, in two shapes, in two languages, and nothing compared
them. The guard is the same shape as G4's, applied earlier: **one shape, one
implementation, per side.**

| Side | One shape | One implementation |
|---|---|---|
| TypeScript | `ProviderKey` in `src/lib/secret.ts` | the pane and the account badge both read it |
| Rust | the `json!` in `keys.rs` | `keys::status` is the only place a provider is asked |
| The server | `ProviderKeyStatus` in `server/key-status.ts` | `fetchProviderStatus` is the only place a provider is asked |

**And the two languages must agree.** The provider table exists in
`src/lib/providers.ts` and, by hand, in `src-tauri/src/keys.rs`. Rust cannot
import TypeScript, so the options are to generate one from the other, or to
keep both and test that they agree. This repository already does the second
thing for the command list (`src/lib/commands.test.ts`), and the same test
style applies here: read the TypeScript table and the Rust table and assert
the ids, labels and identity URLs match.

**The rule that would have caught it.** Two things in this repository mean
"this is a provider" — a name and a way to ask it about a key. A third means
"this is a key" — a name and a status. When a fourth arrives, the test in G4
fails, because the fourth is not in the shape.

### G4 — the shape test

**Shape.** The key shape is the one that matters, because it is the one that
already drifted. The test reads:

- the Rust command's `json!` keys in `keys.rs`,
- the server's `ProviderKeyStatus` object keys in `server/key-status.ts`,
- the TypeScript `ProviderKey` type in `src/lib/secret.ts`,

and asserts the three agree. The Rust side is the awkward one — it builds
JSON with `json!`, so the keys are string literals in the source. Reading
them out of the source is exactly what `commands.test.ts` already does for
the command list.

---

## 6. The dormant assistant branch

### 6.1 What it is, and what it is not

The first correction: **this is not a set of unfinished features that must be
connected.** The repository says what it is, in `README.md:777-783`:

> `src/assistant.tsx`, `src/components/thread.aui.tsx`, `src/toolkit.tsx`,
> `src/components/assistant-ui/**` and `src/components/model-picker.tsx` are
> the **assistant-ui** equivalents. They are a reference implementation of the
> same idea in another runtime, kept for comparison; the app does not mount
> them. They are kept honest by writing the same preference keys the live
> composer does, so a reader is not misled by two halves of the app
> disagreeing about where a choice is remembered.

So the branch is **a second, parallel implementation of the conversation
surface, kept as a comparison**, exactly as the user asked for the rest of
`src/components` — a library of global components, some of which the app
happens not to mount yet.

The import graph, in full:

```
src/components/AssistantSurface.tsx          ← nothing imports it
 ├─ src/assistant.tsx
 │   ├─ src/components/thread.aui.tsx
 │   │   ├─ src/components/assistant-ui/elements/attachment.aui.tsx
 │   │   ├─ src/components/assistant-ui/elements/follow-up-suggestions.aui.tsx
 │   │   ├─ src/components/assistant-ui/elements/reasoning.aui.tsx
 │   │   ├─ src/components/assistant-ui/elements/tool-fallback.aui.tsx
 │   │   ├─ src/components/assistant-ui/elements/tool-group.aui.tsx
 │   │   ├─ src/components/file.tsx → media-player.tsx → surfaces.tsx
 │   │   ├─ src/components/image.tsx
 │   │   ├─ src/components/markdown-text.tsx → use-copy-to-clipboard.ts
 │   │   ├─ src/components/tooltip-icon-button.tsx
 │   │   ├─ src/components/model-picker.tsx
 │   │   └─ src/components/ui/{button,skeleton}.tsx
 │   ├─ src/components/desktop-tool-gate.tsx
 │   └─ src/toolkit.tsx                       ← also used by the live app
 ├─ src/components/theme-toggle.tsx
 └─ src/components/ui/tooltip.tsx

src/components/model-selector.aui.tsx → src/components/model-selector.tsx   ← nothing imports the .aui file
src/utils/model-selection.ts → src/components/model-selector.tsx only
```

Only one file is shared with the live app: `src/toolkit.tsx`, and the live
app imports exactly one function from it — `bindWorkspace`
(`src/blocks/prompt-input/prompt-block.tsx:29`, called at `:1326`).

### 6.2 What would break if it were mounted today

This is the part that decides the question. It is not "some features would be
inert" — **the branch would not work at all.**

1. **The transport never sends `variant`.** `AssistantChatTransport` builds
   the body as `{callSettings, system, config, tools, id, messages, trigger,
   messageId, metadata}`. `server/main.ts:90-99` refuses any request whose
   `variant` is neither `"chat"` nor `"code"`:
   *"No surface selected. Say whether this is a chat or a code session."* —
   **400**. Every request the branch makes would be rejected.
2. **There is no `/api` server in the packaged desktop app.** `tauri.conf.json`
   builds a static bundle (`"frontendDist": "../dist"`); the live app avoids
   this by calling Rust through `invoke("chat", …)`
   (`src/lib/transport.ts:153`). The branch always POSTs to `/api/chat`.
3. **Six capability flags are `false`** because the runtime is created with
   no adapters (`@assistant-ui/core`, `local-thread-runtime-core.js:85-100`,
   `:326-377`): voice, dictation, feedback thumbs, load-earlier, attachments
   and suggestions. The UI for all six is written and would render empty.
4. **The tool-approval flow would never appear** — `onRespondToToolApproval`
   and `onResumeToolCall` are not passed to `useChatRuntime`
   (`src/assistant.tsx:24-34`).
5. **The model picker writes the wrong preference.** It is mounted with no
   `side` (`thread.aui.tsx:501`), so it would always write `model.chat` /
   `effort.chat` regardless of surface.
6. **Its effort list contradicts the live rule.** `model-picker.tsx:87-91`
   hard-codes low/medium/high. The live app deliberately refuses an invented
   range (`prompt-block.tsx:1101-1116`: *"There is no global list: models
   disagree about what exists"*).

**Conclusion.** Mounting the branch is not a matter of finishing it; it is a
matter of rewriting its transport, giving it a thread store, and re-deriving
half its controls from the live ones. That is a different project from the
one this document is about.

**Recommendation: keep the branch, do not mount it, and do not delete it.**
It is a comparison implementation and a source of the parts the live app is
missing (§6.3). What it must not be is mistaken for dead code, and the
README already says what it is — which is the right protection. The gap is
that the README's list of the branch's files is incomplete: it does not
mention `model-selector.tsx`, `markdown-text.tsx`, `reasoning.tsx`,
`media-player.tsx`, `surfaces.tsx`, `file.tsx`, `image.tsx`,
`tooltip-icon-button.tsx` or `src/components/ui/*`.

### 6.3 The one thing that is a live gap rather than dead weight

**The live app renders model output as plain text.**
`src/blocks/prompt-input/streaming-text.tsx:34-57` is a `div` with
`whitespace-pre-wrap` and a per-token fade-in, used at
`prompt-block.tsx:1984-1988`. A model that answers in Markdown has its
`**bold**`, `#` headings and `|` table pipes shown literally.

`src/components/markdown-text.tsx` is the **only** markdown renderer in the
repository: `@assistant-ui/react-markdown` + `remark-gfm`, a full
per-element style sheet (`:93-275`), and a code-block header with a copy
button (`:69-91`). The renderer itself is complete; it is simply not mounted.

**Recommendation: port the renderer, do not mount the branch.** The live
surface should render the model's answer with it — that is a live feature the
app is missing — and the branch stays a comparison.

This also closes the only "reasoning display" question: the live wire
protocol has no reasoning event (`src/lib/transport.ts:63-70` — `text-delta`,
`message-metadata`, `finish`, `error`; Rust emits only `ChatEvent::TextDelta`),
so the dormant reasoning disclosure has nothing to show. The live app's
reasoning-*effort* control (`prompt-controls.tsx:541-614`) is a different
thing and is not affected.

### 6.4 File by file

| File | What it does | Feature | Live equivalent | Incomplete | Backend |
|---|---|---|---|---|---|
| `AssistantSurface.tsx` | Mounts `<Assistant/>` in one of three placements | the whole assistant surface | **none** — the live surface is `prompt-block.tsx:755-2170` | nothing imports it; the `modal` variant's overlay is a hand-rolled div with no focus trap, no escape, no portal, no scroll lock; `sidebar`/`modal` are never used | indirect |
| `assistant.tsx` | The assistant-ui runtime: `useChatRuntime` over `AssistantChatTransport` → `/api/chat`; `sendAutomaticallyWhen` after a tool round; `AuiConfig({tools})` | the transport and tool registration | `prompt-block.tsx:1371-1447` builds the request; `src/lib/transport.ts:120-201` streams it | **the transport is refused by the server** (§6.2); `sendAutomaticallyWhen` would 400 the same way; the Thread "must sit inside a container with a real height" and nothing provides one | real transport, wrong contract |
| `thread.aui.tsx` (800 lines) | The generated Thread: message list, parts, composer, action bar, branch picker, welcome + starters, scroll-to-bottom, load-earlier, edit-and-resubmit, voice | reasoning display; tool cards; attachments; copy/refresh/👍/👎/export action bar; branch switching; post-reply suggestion chips; voice | the model picker, effort control, attachments, dictation, scroll-to-bottom, welcome chips and context meter all have live equivalents; **reasoning output, tool cards, the action bar, branch switching, post-reply chips, voice and load-earlier do not** | voice, dictation, feedback, load-earlier, attachments and suggestions are all inert (capability flags `false`); `group-task` needs an override that is not supplied | runtime state only |
| `elements/attachment.aui.tsx` | Attachment tiles, zoom-preview dialog, remove, upload spinner, error state | attachment tiles + a lightbox | the live `@/components/attachment` chip set (`prompt-input.tsx:1111-1228`, `prompt-block.tsx:698-727`) — the live preview is a pasted-text dialog, not an image lightbox | the live upload is a no-op (`prompt-block.tsx:696`), so "uploading" can never occur; the preview trigger is a `div[role=button]` with no `onKeyDown`, so a keyboard user cannot open the dialog | local object URLs only |
| `elements/follow-up-suggestions.aui.tsx` | A scrolling row of "what next?" chips | post-reply suggestions | **none** — the live chips only show on an empty thread (`prompt-block.tsx:2141`) and are a static pool, not model-generated | `s.thread.suggestions` is empty without a suggestion adapter, and there is no server endpoint that could produce them | none |
| `elements/reasoning.aui.tsx` | Adapts the reasoning part to the shared collapsible primitives; scroll-locks during the animation; streaming-aware group | the reasoning disclosure | **none** — the live protocol has no reasoning event | `ReasoningGroup` is marked `@deprecated` in its own docstring (`:107-113`) | none |
| `elements/tool-fallback.aui.tsx` (1330 lines) | The generic tool card: collapsible trigger, elapsed time, args/result/error, and a full human-in-the-loop approval flow (allow/deny, declared options, typed notes, confirm dialogs, multi-question prompts, a receipt) | tool cards + tool approval | **none** — the live path carries no tools (`src/lib/transport.ts:39-51`; `README.md:429-431`) | needs `approval` / `respondToApproval` on the part; the runtime exposes `onRespondToToolApproval` / `onResumeToolCall` but `assistant.tsx:24-34` passes neither; the "questions" mode needs `approval.questions`, which nothing produces; and it is the *fallback* — the toolkit's own renderers take precedence, so for the five toolkit tools it would never be seen | the **server** half is real (`server/main.ts:177-195` rehydrates `frontendTools(tools)`); only the client half is unmounted |
| `elements/tool-group.aui.tsx` | Folds consecutive tool calls into one "N tool calls" row | the grouped tool disclosure | **none** | `ToolGroup` is marked `@deprecated` in its own docstring (`:211-216`) | none |
| `model-picker.tsx` (461 lines) | Composer-rail model + effort picker: dropdown, search, free-only toggle, provider grouping, a fixed-position hover detail panel, an effort radio group, a key-status footer | the model picker | the live `PromptInputModel` (`prompt-controls.tsx:703-888`) — a popover, not a dropdown, with a search box and a capped radio list | **real and wired** to `fetchModels()` / `fetchKeyStatus()`; but the effort list is hard-coded (`:87-91`), the hover panel is a hand-rolled `position:fixed` box with no portal or collision handling, and it declares its own `SlimModel` type instead of importing `src/lib/catalogue.ts:34` | **real** — `invoke("model_catalogue")` / `invoke("key_status")` on the app, `GET /api/models` / `GET /api/key` on the web |
| `model-selector.tsx` + `.aui.tsx` (573 + 140 lines) | A cmdk-backed model picker: root/trigger/value/content/search/list/item/group/separator/empty/effort | a different model picker | the live `PromptInputModel` | **nothing imports `model-selector.aui.tsx`**; `models` is a **prop** (`:47`) and is never connected to `fetchModels()`; the effort levels are the same invented low/medium/high list (`src/utils/model-selection.ts:18-22`) | none |
| `markdown-text.tsx` (275 lines) | Markdown over `@assistant-ui/react-markdown` + `remark-gfm`, a full style sheet, a code-block header with a copy button | **markdown rendering** | **none** — the live app renders plain text | the renderer is complete; it is simply not mounted (§6.3) | none |
| `tooltip-icon-button.tsx` | An icon button inside a tooltip, with an `sr-only` label and a padding rule derived from whether it holds an SVG | every small icon button in the thread | the live app uses `@/components/tooltip` and `@/components/button` directly | unreachable; carries a documented `local edit` that is lost on regeneration (`README.md:752`) | none |
| `reasoning.tsx` (337 lines) | The collapsible reasoning primitives: root, fade, trigger (brain icon + "Reasoning (Ns)"), content, text with a scroll-pinned live preview while streaming | the reasoning disclosure | **none** | only the dormant branch imports it | none |
| `file.tsx` (415 lines) | A file message part: MIME icon, size, a download link, safe-scheme checks, audio/video playback | files in a reply | **none** — live replies are text only | unreachable | none |
| `image.tsx` (681 lines) | An image message part: preview, a zoom portal, copy, download, regenerate, an "image generating" placeholder | images in a reply | **none** | unreachable | none |
| `media-player.tsx` (293 lines) | `AudioPlayer` and `VideoPlayer` | audio and video playback | **none** | unreachable | none |
| `surfaces.tsx` (122 lines) | A bag of shared class strings plus `ShimmerLabel` and `SwapLabel` | shared styling | — | only `media-player.tsx` uses it | none |
| `src/components/ui/*` (11 files) | The second shadcn set: avatar, button, command, dialog, input, input-group, popover, skeleton, textarea, tooltip | — | **every one has a live twin** under `src/components/<name>/` | **every one is used only by the dormant branch** — no live file imports anything from `@/components/ui/` | none |

### 6.5 The duplication inventory

| # | Duplicated thing | Copies |
|---|---|---|
| 1 | **Model pickers** | three — `model-picker.tsx:187-461` (dormant, wired), `model-selector.tsx:60-573` (dormant, unwired), `prompt-controls.tsx:703-888` (live, wired) |
| 2 | **Effort controls** | three — `model-picker.tsx:411-440` (hard-coded), `model-selector.tsx:468-547` (hard-coded), `prompt-controls.tsx:541-614` + `:262-405` (live, derived from `availableEffort()`); plus a fourth, unused, `prompt-controls.tsx:616-659` |
| 3 | **Markdown renderers** | one dormant, **zero** live — §6.3 |
| 4 | **Tooltip systems** | two — `src/components/ui/tooltip.tsx` + `tooltip-icon-button.tsx` (dormant), `src/components/tooltip/` (live) |
| 5 | **Button / Dialog / Input / InputGroup / Textarea / Skeleton / Avatar / Popover** | two each — `src/components/ui/*` (dormant) and `src/components/<name>/` (live) |
| 6 | **Collapsible systems** | two — `src/components/collapsible-root.tsx` (dormant), `src/components/collapsible/` (live, unreferenced) |
| 7 | **Attachment UIs** | two — `attachment.aui.tsx` (tile + lightbox), `src/components/attachment/` (chip) |
| 8 | **Model types** | two — `model-picker.tsx:63-77` (a local copy) and `src/lib/catalogue.ts:34-47` (canonical) |
| 9 | **Chat/thread stores** | two — assistant-ui's runtime thread list (no store at all) and `src/lib/thread-repository.ts` (live) |
| 10 | **Context/token metering** | two — `model-picker.tsx:167-175` (dormant) and `prompt-controls.tsx:1061-1319` (live, richer) |
| 11 | **Conversation surfaces** | two — `thread.aui.tsx:199-258` (dormant) and `prompt-block.tsx:1938-2168` (live) |
| 12 | **Tool renderers** | two dormant (the generic fallback and the toolkit's native ones), **zero** live |

### 6.6 The other direction: unreferenced live components

Four folders in the live library have no importer at all:

| Folder | Size | Note |
|---|---|---|
| `src/components/collapsible/` | — | the dormant branch uses `collapsible-root.tsx` instead |
| `src/components/command/command.tsx` | — | the dormant branch uses `src/components/ui/command.tsx` instead |
| `src/components/textarea/textarea.tsx` | — | no importer |
| `src/components/video-player/` | ≈2200 lines | a full video player with captions, picture-in-picture and fullscreen; no importer |

Per the instruction that everything in `src/components` is a global component
and is not to be deleted, these stay. But they are **not** covered by the
README's note about the assistant-ui branch, so a reader has no way to tell
that they are unused. The honest options are (a) leave them and say so here,
or (b) give the README a second sentence naming them.

**Decision:** Give the README a second sentence naming the four unreferenced live folders, so a reader has a way to tell that they are unused rather than dropped.


---

## 7. The testing key, and what must be true at ship time

The key in use during development is in an environment file, so that the app
and the website can be exercised without re-entering a key on every reload.
That is a **development convenience**, and the shipped behaviour must not
depend on it.

**What is where, today:**

| Where the key is | Read by | When it applies |
|---|---|---|
| `.env.local` → `OPENROUTER_API_KEY` (and the other three) | the **server** (`server/key-status.ts`, `server/main.ts`, the provider adapters) | the web target, and development |
| the server's own file, `~/Documents/Tavi/keys` | the server | the web target, when a key has been set through the pane |
| the OS credential store, `tavi / api-key:<provider>` | the **app**, through Rust | the desktop app, always |

**The precedence, stated once:**

- The app **never** reads `OPENROUTER_API_KEY`. `keys.rs` reads the
  credential store and nothing else. **In the desktop app the settings pane
  is the only way to set a key** — which is exactly the production
  behaviour the user described, and it is already true.
- The server prefers its own file over the environment variable
  (`server/key-store.ts` `serverCredential`), so a key set through the pane
  wins over a leftover `.env.local` entry. The environment variable is the
  fallback for a deployment that has no file.

**What must be true when this ships:**

1. The desktop app's provider request uses the key from the credential
   store, and the credential store is populated from
   **Settings → Platform → API keys**. — **already true.**
2. The website's provider request uses the key the server was given, whether
   from its file or its environment. — **already true.**
3. A shipped app has no `.env.local` next to it, so the environment
   fallback is a deployment concern only. — **already true.**
4. The environment file must never be read in production for the *desktop*
   build, and must never be committed. — **`.env.local` is gitignored;
   confirm.**
5. The key the pane writes is the key the app uses. — **true for the app;
   true for the server from P9 onward.**

**Decision:** The precedence stands: the credential store first, then the environment — which is `.env.local` in development, read in Rust and only in a development build. In a shipped desktop app the settings pane is the only way to set a key, and the environment fallback is a deployment concern only.

---

## 8. How to carry this out

This section is for whoever does the work. It holds the order, the rules that
hold throughout, and what "done" means.

### 8.1 The order, and why

| # | What | Depends on |
|---|---|---|
| **0** | **§4.1** and **§4.8** — the falsehoods and the data loss | nothing. **D10 loses keys and D11 lets any web page replace the server's key. Both are live now.** Do them first |
| **1** | **§4.2** — one key shape, one store, one implementation | nothing, but everything else assumes it |
| **2** | **§4.7** — the allowance line and the catalogue freshness | needs the shape from 1 |
| **3** | **§4.4**, **§4.10** — the pane's geometry and its accessibility | needs the list from 1 |
| **4** | **§4.11** — the flow: the model picker's "no key" state | needs 3 |
| **5** | **§4.5** — the guardrails | needs 1; they are what stops this happening again |
| **6** | **§4.6** — the dormant branch: the README note and the markdown port | needs 3 |
| **7** | **§4.9** — the provider adapters and the effort path | independent of the rest; do it when the rest is done |
| **8** | **§4.3** — the catalogue freshness, if not already done in 2 | needs 1 |

**Phase 0 is first because two of its items are live bugs**, not improvements:
D10 can destroy the server's other keys, and D11 lets any page the user
visits replace the server's key.

### 8.2 The rules that hold throughout

- **Never move a secret into JavaScript.** On the desktop the key stays in Rust
  (`src-tauri/src/keys.rs`); `get_api_key()` is deliberately **not** a
  `#[tauri::command]`. Do not add a command that returns a key.
- **Do not delete the dormant assistant-ui branch.** The repo's README calls it
  "a reference implementation of the same idea in another runtime, kept for
  comparison; the app does not mount them". It is a library of global
  components, not dead code. Do not mount it either — §6.2 lists the six things
  that break.
- **Do not rename or move files** unless a task requires it. The paths in this
  document have drifted twice (`server/chat.ts` → `server/main.ts`,
  `src/lib/chat.ts` → `src/lib/transport.ts` → `src/lib/api.ts`); grep for
  symbols, not line numbers.
- **Do not change which provider the app talks to.** OpenRouter today. Preparing
  the others is the point; switching the app over is not this work.
- **One shape for a key, one implementation per language.** That is what D3 and
  D4 are about.
- **No invented data, no hidden fallbacks**, and no UI that pretends to work —
  the repo's own `AGENTS.md` rules. If a capability cannot be built, say so in
  the UI and in `README.md` → Known limitations.
- **Do not widen the scope.** If you find something that is not in this
  document, report it; do not quietly fix it in the same pass.
- **A partial item is worse than no item.** Every P item is either done and
  verified, or not started.

### 8.3 The decisions are already made

The research in §3 settles them. Where a "**Decision:**" line is blank, the
recommendation immediately above it **is** the decision: take it, write a
one-line justification into the line, and move on. Stop and ask the user only
for a genuine product decision, and if you must, ask **once**, with every
question listed together. The open product questions are marked in the
document.

**Do not re-derive the research.** It was checked against the live providers
and the live code, and the results are in §3.3.6 (the validation table), §3.10
(the provider tables), §3.11 (the security findings) and Appendix A (how each
claim was checked). If something contradicts them, **trust the live check and
say so**.

### 8.4 How to run it, and how to verify

```
pnpm typecheck                 # clean
pnpm test                      # 134 tests, plus yours
cd src-tauri && cargo test     # 98 tests, plus yours
cd src-tauri && cargo check    # clean
pnpm build                     # succeeds
```

Then **run the app and look at it** — the commands are the whole point of the
plan, and passing tests is not the same as the screen being right:

```
pnpm tauri dev                 # the app, hot reload; vite on :1420
pnpm chat                      # the website's server on :8787 (another terminal)
```

Open **Settings → Platform → API keys** and work through the empty state, the
list, **Add key** (provider → key → **Save key**), **Edit**, **Remove** and its
confirmation, and the state after each. Then open
`http://localhost:1420` — the same frontend on the web target — and check it
matches. **Any difference between the two is a defect in this plan's terms:**
fix it, or report it.

**Use the keyboard throughout.** The per-row buttons must announce which key
they belong to (§3.9).

### 8.5 What "done" means

- Every P item in §4 is done and verified, or reported as not done, with the reason.
- The two builds render the same API keys screen with the same controls, and
  the only difference is where the key is kept — stated in one sentence, in
  the UI.
- No key reaches JavaScript on the desktop, and no key is ever written to a log.
- `pnpm typecheck`, `pnpm test`, `cargo test`, `cargo check` and `pnpm build`
  are clean.
- `README.md` → Known limitations and `docs/storage.md` are true of the code as
  it now is. The README's claim that the server's key can "only be changed by a
  request from the same machine" is true only in the dev topology, and must
  either be fixed or corrected.
- **This document is updated as the work proceeds** — each item ticked, each
  decision recorded, anything new that is found added. It stays the
  specification, not a snapshot of one.

### 8.7 What the work found that is not in this document

Added as the work went, because §8.6 asks for it.

**The live check contradicts §3.3.6 in one place.** The table says NVIDIA NIM
answers **403** for a bad key. Probed again on 2026-10-21, against a model
that is still published, a bad key answers **401** and a missing key answers
**401** as well; the 403 the table records was what a *dead model slug*
answered with, which is a different thing. The implementation treats 401 and
403 the same — both mean “not accepted” — so nothing changes, but the table's
number is wrong.

**A hard-coded model slug is not a safe thing to check a key with.** The first
probe was written with a slug from the table, and it answered **410 Gone**:
the model had reached its end of life. The probe now takes the model from the
provider's own published catalogue at the moment it runs, so it never names a
model that has gone away.

**A provider's already-masked label is spelled with three dots.** The
redaction in §3.11's rule leaves a label the provider has already masked
alone, and OpenRouter's label for an unnamed key is `sk-or-v1-612...95f` —
three ASCII dots, not the ellipsis character. The rule now recognises both.

**`source` has four values, not three.** §3.3.3 lists `keyring`,
`server-file` and `env`. The desktop's development file is none of them: it
is not an environment variable the process was started with, and saying so is
the difference between “the key is in the environment this server was started
with” and “this is a development file”. The field carries `dev-file` as well.

**Only OpenRouter publishes a limit at all.** §3.11.1 describes the allowance
line as if every provider had one. Three of the four publish no limit, no
usage and no account, so the line simply is not there for them — which is the
rule the rest of this document states: a number the app did not obtain is
never rendered as a zero.

**The server's key file moved out of the documents folder.** §4.8 P33 says
where; the finding is that `~/Documents` is commonly synced to somebody
else's server, so a plaintext key written there is a plaintext key on a
third party's disk.

**The markdown renderer could not be reached through the assistant-ui
primitive.** `MarkdownTextPrimitive` reads the text from the assistant-ui
runtime's context, so it can only render inside that runtime. The live
surface needs a renderer that takes a string, so `react-markdown` became a
direct dependency and the two surfaces share one set of components and one
stylesheet. The assistant-ui branch keeps its own primitive and its own
behaviour, and the two are no longer the same file.

**The `pnpm chat` script did not exist.** §8.4 says to run it, and there was
no such script: the server was only ever started by `pnpm dev`, which starts
the web target with it. The script is there now.

**The credential store does not like two threads at once.** The Windows
credential manager is one store on the machine, and a write and a read from
two threads can come back disagreeing: a key that was just written reads back
as the one before it. The tests that touch the store now take a lock, so they
do not compete with each other. The app does not have the problem — it makes
one request at a time — but it is worth knowing before anything else is
written against that store.

**A test needs a store of its own.** The credential service is the
operating system's namespace for the secret, and the app's own is `tavi`. A
test that used it would move the user's keys about — which it did, until the
service became a field rather than a constant. The tests now have a service of
their own, and a scratch sidecar beside it.

**The desktop app's development-file key was being listed and then hidden.**
The backend listed it — it is a key the app is using, and saying so is the
point — and the pane filtered it out because it was not in the store the pane
writes to. Found by looking at the desktop app, which is the only way it shows
up: the browser's server has an environment key of its own and never showed
the row at all.

**Two dialogs had the same React key.** Both the rename dialog and the replace
dialog were keyed "none" when they were closed, and React said so in the
console: "Encountered two children with the same key". It was the only defect
the desktop app showed that the browser did not, because the browser's console
was not being read.

**Tauri refuses a command with a bare string, not with an error.** A
command that answers `Err("…")` rejects the promise with that text, so a
caller that checks `instanceof Error` throws away the reason the Rust side
gave and shows its own generic wording instead. The desktop adapter now
turns a refusal into an error that says what it was, and the pane says
"OpenRouter did not accept this key." rather than "The key could not be
stored."

**The pane said too much.** The first version of the rewritten screen
carried three sentences under the heading, a paragraph of dates under every
row, and a paragraph of guidance under every provider. It was all true and it
was all necessary somewhere, and together they made a list of keys look like
a document. It is now one line under the heading, one line under each row,
the provider's own links on the provider's own line, and one line of guidance
at the foot of the pane. The reassurance that is left out of the screen is a
tooltip on the line that is there, so it is still there for anyone who asks.

**Two differences between the builds that should not have been there.** The
server's environment key was shown without a masked value, because the mask is
computed when a key is written and that key was never written by the app —
but the server holds it, so it can mask it, and now does. And a date was
formatted by the runtime, which put `21 Oct 2026` in the desktop app and
`Oct 21, 2026` in a browser, because the two runtimes have different
locales; the date is written out now, and the same key reads the same in
both.

**A mark that only opens on hover is a mark that does not open at
all.** A touch screen has no hover, and a person who taps a mark expects
something. The note opens on hover, on keyboard focus and on a click, and the
mark is drawn in the theme's own muted colour — legible against the light
theme's white and against the dark theme's near-black, and the same weight as
the other quiet controls beside it.

**A hand-rolled control is a control the app does not know about.** The
add-key dialog had a native `<select>` and a hand-written `<input>` with
its own border and focus ring, while the repository has a `Select` and an
`Input` that are the app's own. The native select is the browser's dropdown
dressed up in the operating system's colours, and it is not what the rest of
the app looks like. Both are the app's own components now, and the provider
list is the providers' names and nothing else — a count of the keys a
provider already has is the list's business, not the option's.

**Two product questions were put to the maintainer, and answered.** The
deployment model (§4.8 P35): the server is a local, single-operator server,
the operator's own keys are used locally whether in a browser or in the app,
and everything stays local. The Privacy pane (§3.5): “delete everything”
should delete everything, and there should be a button for each kind as well,
so a person can say what they mean. Both answers are in the code.

**One thing the document asked for is not in the code.** §4.7 P29 asks for the
catalogue's age to be shown, and it is — but the age is shown in the model
picker's popover rather than in the settings pane, because the catalogue is
the picker's business and the settings pane has nothing to say about a list of
models it is not showing.

**A row of buttons is a row with a row of buttons.** The rewritten pane gave
each key a row with the key's name, its badges and its one line of detail —
and then five buttons: Make active, Rename, Replace key, Check now, Remove.
The buttons were wider than the name, and the screen read as a form rather
than a list of keys. They are in a menu at the far right of the row now, opened
by a pencil button, which is where the Remove button used to be. “Make active”
is in the menu too, and is disabled with the reason on it — “This is the key in
use.” — when the key is already the one the app sends requests with, so the
menu is the same shape for every key. One thing the move costs: the check's
spinner was on the button, and there is no button to spin now — the menu
closes, the check runs, and the row's badge is what changes when it is done.

**A menu's items are not in the tree until it is opened.** The parity test
looked for the rows' buttons in the rendered markup and found nothing, because
base-ui mounts a menu's content only while it is open. The rule it now
checks is the one that can be checked in markup: the control that opens the
menu says which key it acts on.

**The document drifted under itself.** The work that made the guardrails real
split `src/lib/transport.ts` into `src/lib/api.ts`, `src/lib/desktop.ts` and
`src/lib/web.ts`, so the file this document names in eight places in §1–§3 and
§6 has since gone. The audit's findings are left as they were found — they are
evidence, and rewriting them would be rewriting the audit — and §1 now says
where that code lives now. §4's tables, which say what the work touched, name
the files as they are.

**The app talks to more than one provider now.** The last item, **P50**, was
deferred on G-D: the app could only talk to one provider, so scoping the model
list to a key's provider would have scoped it to a provider the request did not
use. The app now talks to **twenty-eight** providers across **four** request
shapes, and to any OpenAI-compatible endpoint of the user's own, and the
provider in use is a per-side preference that the catalogue, the list, the key
and the request all follow — so the list and the request are about the same
provider by construction rather than by agreeing to.

**Every address was checked against the provider itself.** A provider that
answers 401 to a request it understands and 404 to one it does not is how the
addresses were settled: a wrong address is a 404, and a right one with no key
is a 401. Three were wrong and are now right — Perplexity's models are under
`/v1` and its chat is not, and DeepInfra's chat is under `/openai`.

**The AI SDK's OpenAI package is not the OpenAI-compatible one.** Its default
is the Responses API, which only OpenAI has, so every provider that speaks
chat completions and is not OpenAI goes through the compatible package
instead. Twenty of them would have been sent a request their API has never
heard of.

**A provider says where a reasoning level goes.** The field is not the same
everywhere, and a level sent in the wrong field is one the provider ignores.
It is in the provider's own row, and both halves of the app read it from
there.

**Two providers were taken out.** Amazon Bedrock and Google Vertex AI are
signed with AWS credentials and with Google's own rather than with a key, and
the app has no client for either. A provider the app cannot talk to is not a
provider the app supports.

**A provider is a shape and some configuration.** Most of the twenty-eight speak the
OpenAI chat-completions shape and differ only in the address they live at and
how the key is sent, and those are fields rather than code. Anthropic's
Messages, Google's generate-content and Cohere's chat are three more shapes,
and there are three clients. Two of the providers that were in the list at the
start — **Amazon Bedrock** and **Google Vertex AI** — are signed with AWS
credentials and with Google's own rather than with a key, and they are not in
the list at all: a provider the app cannot talk to is not a provider the app
supports, and the app says so plainly rather than taking a
credential it cannot use.

**A key may carry the address it belongs to.** Some providers do not live at one
address: an Azure resource, a Databricks workspace, a model running on this
machine. The key says which, and the key's address wins over the provider's
default.

**Switching provider in the middle of a thread is safe, so it is not
prevented.** The research the work asked for: the conversation is text, so it
travels; the tools are the same whichever provider answers, because the
provider packages translate them; the system prompt is written from the
surface, the mode and the folder, and not from the provider; the reasoning
level is checked against the new model by the shared rule, which refuses a
level the new model does not publish; and the model is reconciled when the
new provider does not offer the old one, the way the app already reconciles a
model that has left the catalogue. What does change is the quality and the
cost, mid-thread, and that is the user's call. So the provider is recorded on
the thread and is not locked.

**The reasoning preference is written in one place and in one language.** The
provider's own field for a reasoning level is not the same for every provider —
`reasoning: { effort }` for OpenRouter, `reasoning_effort` for OpenAI, and
`output_config: { effort }` for Anthropic — and the app used to check the
level against the catalogue in Rust, in one provider's shape. The rule that
turns a preference into a provider's own field now lives in
`src/lib/provider-reasoning.ts`, and both the website's server and the desktop
app use it, so they refuse the same things for the same model. The desktop
app sends the fields it has already checked, because it has no server to check
them against.

**The capability reading moved to the webview too.** It is in
`src/lib/provider-capabilities.ts`, beside the rule that uses it, and the
website's server and the desktop app read the same description of the same
model.

### 8.6 Reporting back

1. **What changed**, by phase, with the files.
2. **What was verified and how** — the commands, and what was seen in the app
   and in the browser.
3. **What was not done, and why.**
4. **Anything found that is not in this document** — a new defect, a
   contradiction in the research, something in the repo that looks wrong. Say
   it plainly.
5. **The decisions taken** where a line was blank, one line each, with the
   reason.

---

## Appendix A — the audit's evidence

Commands run to produce §1, so any of it can be re-checked.

| Claim | How it was checked |
|---|---|
| Every `invoke("x")` is registered in Rust | `src/lib/commands.test.ts` — passing |
| Every `/api/…` fetched by the frontend exists in the server | read of `src/**` and `server/main.ts` — 6 paths, all present |
| The font status text in the browser | `ComboboxStatus` textContent read in the page: `"0 fonts installed."`; list items `["Geist"]` |
| The button geometry | `getBoundingClientRect()` on the heading, the Add key button, the `Item`, `ItemActions` and the Remove button |
| The app menu's entries are visible | `title-bar.tsx:65` renders `AppMenu`; `app-menu.tsx:70-71` gives the two entries an action; `:196-204` renders entries without an action as disabled |
| **The NVIDIA NIM endpoint is public** | probed on 2026-10-21: `GET https://integrate.api.nvidia.com/v1/models` answers **200 with the full catalogue** with an invalid key **and with no `Authorization` header at all**; `POST /v1/chat/completions` answers **403 "Authorization failed"** for a bad key |
| **The credential store cannot be enumerated** | read of the vendored `keyring` 3.6.3 source in `~/.cargo/registry/src/…/keyring-3.6.3/src/` — no `list` or `find_all` function exists |
| **The credential store cannot hold portable metadata** | the same source: `update_attributes` *"ignores (without error) any specified attributes that aren't supported by that store"* |
| **The reference design is Anthropic's key model** | <https://platform.claude.com/docs/en/manage-claude/authentication> — the personal / service-account / workspace table, and *"keeps working after its creator leaves"* |
| **The key model in every console** | OpenAI (`redacted_value`, `last_used_at`, `owner`, `expires_at`), Anthropic's Admin API (`principal`, `scope`, `status`, `partial_key_hint`), Stripe (`name`, `note`, policies, 7-day rotation grace), GitHub PATs, AWS IAM (two keys per user, `last_used_date`), Doppler, Vercel, 1Password, SOPS/age |
| **The browser's font capability** | MDN Local Font Access API: `queryLocalFonts()` is Chrome/Edge/Opera 103+, **no Firefox, no Safari**; it prompts for the `local-fonts` permission; Chrome's own docs call it *"a highly fingerprintable surface"* |
| **The contract-testing practice** | Pact docs; Martin Fowler's *Consumer-Driven Contracts* and *Contract Test*; Schemathesis; Dredd; oasdiff; Steve Kinney's *API Contract Testing* |
| **The parity practice** | VS Code's VS Code's `src/vs/base/common/platform.ts` (in its own repository) and its web-extension limitations docs; Slack Engineering's *Interops Labyrinth*; Capacitor's "web first" rule; Microsoft's PWA guidance; MDN's progressive-enhancement and `localStorage` partitioning pages |
| **The accessibility rules for a disabled control** | WCAG 2.2 SC 1.4.3 (inactive components are exempt from contrast) and SC 4.1.2; MDN `aria-disabled` and `aria-describedby`; NN/g *Button States: Communicate Interaction*; WAI-ARIA APG *Keyboard Interface* |
| **The dormant branch** | see §6 |
| **The OpenRouter key endpoint's real fields** | probed live on 2026-10-21: `GET /api/v1/key` answers `data` with `limit`, **`limit_remaining`**, **`limit_reset`**, `usage`, `usage_daily` / `usage_weekly` / `usage_monthly`, `is_free_tier`, `expires_at`, `creator_user_id`, `organization_id`, `workspace_id`, `budgets`, `rate_limit` — and **no `remaining` field at all** |
| **The NVIDIA NIM endpoint is public** | probed on 2026-10-21: `GET https://integrate.api.nvidia.com/v1/models` answers **200 with the full catalogue** with an invalid key **and with no `Authorization` header at all**; `POST /v1/chat/completions` answers **403 "Authorization failed"** for a bad key |
| **The credential store cannot be enumerated** | read of the vendored `keyring` 3.6.3 source in `~/.cargo/registry/src/…/keyring-3.6.3/src/` — no `list` or `find_all` function exists |
| **The credential store cannot hold portable metadata** | the same source: `update_attributes` *"ignores (without error) any specified attributes that aren't supported by that store"* |
| **Node's file mode is a no-op on Windows** | Node's own documentation: *"on Windows only the write permission can be changed, and the distinction among the permissions of group, owner, or others is not implemented"* |
| **`~/Documents` is not user-only on this machine** | measured ACL: `DESKTOP-MEQ30GR\CodexSandboxUsers:(OI)(CI)(RX)` alongside the user, SYSTEM and Administrators |
| **`%APPDATA%` *is* user-only on this machine** | measured ACL: user, SYSTEM, Administrators — no `Users`, no `Everyone`, no `Authenticated Users` |
| **The server binds every interface** | measured: `server.listen` with no host reports `{"address":"::","family":"IPv6"}` |
| **A `text/plain` POST is a CORS simple request** | MDN's CORS guide: a simple request uses `GET`/`HEAD`/`POST`, only safelisted headers, and a `Content-Type` of `application/x-www-form-urlencoded`, `multipart/form-data` or `text/plain` — and is sent **without a preflight** |
| **The reference design is Anthropic's key model** | <https://platform.claude.com/docs/en/manage-claude/authentication> — the personal / service-account / workspace table, and *"keeps working after its creator leaves"* |

## Appendix B — the file map for §6

The dormant branch, in the order §6.4 covers it.

| File | Reached from |
|---|---|
| `src/components/AssistantSurface.tsx` | nothing |
| `src/assistant.tsx` | `AssistantSurface.tsx` |
| `src/components/thread.aui.tsx` | `src/assistant.tsx` |
| `src/components/assistant-ui/elements/attachment.aui.tsx` | `thread.aui.tsx` |
| `src/components/assistant-ui/elements/follow-up-suggestions.aui.tsx` | `thread.aui.tsx` |
| `src/components/assistant-ui/elements/reasoning.aui.tsx` | `thread.aui.tsx` |
| `src/components/assistant-ui/elements/tool-fallback.aui.tsx` | `thread.aui.tsx` |
| `src/components/assistant-ui/elements/tool-group.aui.tsx` | `thread.aui.tsx` |
| `src/components/file.tsx` | `thread.aui.tsx` |
| `src/components/image.tsx` | `thread.aui.tsx` |
| `src/components/markdown-text.tsx` | `thread.aui.tsx` |
| `src/components/model-picker.tsx` | `thread.aui.tsx` |
| `src/components/reasoning.tsx` | `elements/reasoning.aui.tsx` |
| `src/components/media-player.tsx` | `src/components/file.tsx` |
| `src/components/surfaces.tsx` | `src/components/media-player.tsx` |
| `src/components/tooltip-icon-button.tsx` | `markdown-text.tsx`, `thread.aui.tsx` |
| `src/components/model-selector.aui.tsx` | nothing |
| `src/components/model-selector.tsx` | `model-selector.aui.tsx` |
| `src/utils/model-selection.ts` | `model-selector.tsx` |
| `src/components/ui/*` (11 files) | the above, and `tooltip-icon-button.tsx` |
| `src/toolkit.tsx` | `src/assistant.tsx` — **and the live app**, for `bindWorkspace` only |
| `src/components/desktop-tool-gate.tsx` | `src/assistant.tsx` — **and the live app**? see §1.4 C1 |

The four unreferenced live folders of §6.6: `src/components/collapsible/`,
`src/components/command/command.tsx`, `src/components/textarea/textarea.tsx`,
`src/components/video-player/`.

## Appendix C — the sources

| Topic | Sources |
|---|---|
| Anthropic key types | <https://platform.claude.com/docs/en/manage-claude/authentication> · <https://platform.claude.com/docs/en/get-api-key> · <https://platform.claude.com/docs/en/api/organization/api_keys/list> · <https://platform.claude.com/docs/en/api/errors> |
| OpenAI keys | <https://platform.openai.com/docs/api-reference/admin-api-keys> · <https://developers.openai.com/api/reference/resources/admin/subresources/organization/subresources/projects/subresources/api_keys/methods/list> · <https://help.openai.com/en/articles/5112595-best-practices-for-api-key-safety> · <https://help.openai.com/en/articles/8867743-assign-api-key-permissions> · <https://developers.openai.com/api/docs/guides/error-codes> |
| Stripe keys | <https://docs.stripe.com/keys> |
| GitHub PATs | <https://docs.github.com/en/authentication/keeping-your-account-and-data-secure/managing-your-personal-access-tokens> |
| AWS access keys | <https://docs.aws.amazon.com/IAM/latest/UserGuide/id_credentials_access-keys.html> · <https://docs.aws.amazon.com/IAM/latest/UserGuide/id_credentials_getting-report.html> |
| Secret managers | <https://docs.doppler.com/docs/secrets> · <https://vercel.com/docs/environment-variables> · <https://vercel.com/docs/environment-variables/rotating-secrets> · <https://getsops.io/> · <https://github.com/getsops/sops> |
| OpenRouter key API | <https://openrouter.ai/docs/api/api-reference/api-keys/get-current-key> · <https://openrouter.ai/docs/limits> |
| NVIDIA NIM | <https://docs.api.nvidia.com/nim/reference/llm-apis> · <https://build.nvidia.com/settings/api-keys> |
| Local Font Access API | <https://developer.mozilla.org/en-US/docs/Web/API/Local_Font_Access_API> · <https://developer.chrome.com/docs/capabilities/web-apis/local-fonts> · <https://github.com/WICG/local-font-access> |
| Contract testing | <https://docs.pact.io/> · <https://martinfowler.com/articles/consumerDrivenContracts.html> · <https://martinfowler.com/bliki/ContractTest.html> · <https://github.com/schemathesis/schemathesis> · <https://dredd.org/en/latest/> · <https://github.com/oasdiff/oasdiff> · <https://stevekinney.com/courses/enterprise-ui/api-contract-testing> |
| Parity | <https://code.visualstudio.com/docs/remote/vscode-web> · <https://code.visualstudio.com/api/extension-guides/web-extensions> · <https://slack.engineering/interops-labyrinth-sharing-code-between-web-electron-apps/> · <https://capacitorjs.com/docs/> · <https://learn.microsoft.com/en-us/microsoft-edge/progressive-web-apps/> · <https://developer.mozilla.org/en-US/docs/Web/HTTP/Guides/Browser_detection_using_the_user_agent> |
| Testing both builds | <https://playwright.dev/docs/test-projects> · <https://playwright.dev/docs/test-components> · <https://playwright.dev/docs/test-snapshots> · <https://playwright.dev/docs/aria-snapshots> · <https://v2.tauri.app/develop/tests/webdriver/> · <https://webdriver.io/docs/desktop-testing/tauri> · <https://v2.tauri.app/develop/tests/mocking/> |
| Accessibility | <https://www.w3.org/WAI/WCAG22/Understanding/contrast-minimum.html> · <https://www.w3.org/WAI/WCAG22/Understanding/name-role-value.html> · <https://developer.mozilla.org/en-US/docs/Web/Accessibility/ARIA/Attributes/aria-disabled> · <https://www.nngroup.com/articles/button-states-communicate-interaction/> · <https://www.w3.org/WAI/ARIA/apg/practices/keyboard-interface/> |
| Storage | <https://developer.mozilla.org/en-US/docs/Web/API/Web_Storage_API> · <https://developer.mozilla.org/en-US/docs/Web/Privacy/Guides/State_Partitioning> · <https://v2.tauri.app/plugin/store/> |
| Credential stores | <https://support.apple.com/guide/security/keychain-data-protection-secb0694df1a/web> · <https://learn.microsoft.com/en-us/windows/win32/api/wincred/nf-wincred-credreadw> · <https://attack.mitre.org/techniques/T1555/004/> · <https://wiki.archlinux.org/title/GNOME/Keyring> · <https://docs.rs/keyring/3.6.3/keyring/> |
| Secrets at rest | <https://cheatsheetseries.owasp.org/cheatsheets/Secrets_Management_Cheat_Sheet.html> · <https://cloud.google.com/secret-manager/docs/best-practices> · <https://github.com/getsops/sops> · <https://12factor.net/config> · <https://docs.stripe.com/keys> |
| CSRF and local servers | <https://developer.mozilla.org/en-US/docs/Web/HTTP/Guides/CORS> · <https://cheatsheetseries.owasp.org/cheatsheets/Cross-Site_Request_Forgery_Prevention_Cheat_Sheet.html> · <https://github.blog/security/application-security/localhost-dangers-cors-and-dns-rebinding/> · <https://www.kb.cert.org/vuls/id/652514> |
| File permissions | <https://specifications.freedesktop.org/basedir-spec/latest/> · <https://man7.org/linux/man-pages/man2/umask.2.html> · <https://github.com/nodejs/node/blob/main/doc/api/fs.md#file-modes> · <https://learn.microsoft.com/en-us/windows/win32/shell/known-folders> |
| Exposed keys | <https://support.claude.com/en/articles/9767949-api-key-best-practices-keep-your-keys-safe-and-secure> · <https://help.openai.com/en/articles/5112595-best-practices-for-api-key-safety> · <https://docs.stripe.com/keys> |

