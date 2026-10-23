# Documentation

Two kinds of document live here, and they are kept apart on purpose.

| | What it is | Where it lives |
|---|---|---|
| **The app as it is** | What the code does now, and where each thing lives | `docs/` — this folder, and [`architecture.md`](architecture.md), [`storage.md`](storage.md), [`tokens.md`](tokens.md), [`components.md`](components.md), [`icons.md`](icons.md), [`layout.md`](layout.md), [`visual-baseline.md`](visual-baseline.md) and [`workspace-state.md`](workspace-state.md) |
| **The app as it is meant to become** | What is deferred, what was planned, and what has not been built | [`docs/plan/`](plan/) |

A document in `docs/` describes something that is true of the code you can
read today. A document in `docs/plan/` describes something that is not true
yet. The difference matters: a reader who finds a description of the current
app can rely on it, and a reader who finds a plan knows not to.

---

## The app as it is

| Document | What it covers |
|---|---|
| [`architecture.md`](architecture.md) | How the app is put together: the surfaces, the storage layer, the boundaries that were settled, and the table of gaps that were closed and the two that were found by auditing the work |
| [`storage.md`](storage.md) | Where every piece of data lives, on each platform, what it is worth, how long it is kept, and what removes it — and the design behind it |
| [`providers.md`](providers.md) | The other half of the provider story: where they live, what shape they speak, where a reasoning level goes, what the address is, which keys can be checked and how, and why the marks are drawn in the page. The list itself is in `src/lib/providers.ts`; the test that says the desktop app and the website read the same list is `provider-table.test.ts` |
| [`merging.md`](merging.md) | The two long-lived lines, the gate a merge has to pass before `main` moves, the timer that merges on its own, the report that says what is in `main` and what is not, and the two merges that needed a judgement call |
| [`tokens.md`](tokens.md) | Every colour, size and shape the app is drawn with: the roles, the values in both modes, the rules the themes obey and where they are checked, and how to add a token |
| [`components.md`](components.md) | Every shared component in the app and which one to use for a given job: the one family they are all built on, the map, the rules, and what changed |
| [`icons.md`](icons.md) | Every mark the app is drawn with: the one pack, the size scale, the stroke, when an icon is read aloud and when it is not, and the marks the future pane types take |
| [`layout.md`](layout.md) | Every element that owns a height or a scrollbar: the window's floor, the height chain, what scrolls and what does not, the container a workspace will live in, and what changed |
| [`visual-baseline.md`](visual-baseline.md) | What the app looks like today: the window, the shell, the two sides of the rail, the two states of the work area, the composers, and the list of things that must not change |
| [`workspace-state.md`](workspace-state.md) | Who owns each piece of the workspace's state — the app section, the active session, the open flag, the pane instances, the active pane, the arrangement, the pane-local state and the overlay — where it lives, who changes it, and the two separations that keep the arrangement from becoming a copy of the panes |

The [README](../README.md) is the front door: what the app is, how to run it,
and what it does and does not do.

## The app as it is meant to become

| Document | What it covers |
|---|---|
| [`plan/later-on.md`](plan/later-on.md) | What is deferred, and why: the features that were deliberately left out, the things noticed while building, and the three that need a machine to check |
| [`plan/build-plan.md`](plan/build-plan.md) | What to build next, bottom-up: the stack from the storage layer to the features, with the front-end and back-end work for each layer, and the conversation runtime that comes first |
| [`plan/docking.md`](plan/docking.md) | Which layout engine the workspace is built on and why: the requirements, the three candidates, the decision, what it does not settle, and the smallest experiment that would prove it |
| [`plan/git.md`](plan/git.md) | The Git layer: what the reference does, the decisions, the cleanup policy, and how it meets the workspace plan |
| [`plan/Plan_master.md`](plan/Plan_master.md) | The master plan the app was built from |
| [`plan/api-keys-and-parity.md`](plan/api-keys-and-parity.md) | The API keys screen, and the audit of every place the desktop app and the website are not the same: twelve defects (three of them found by probing the live providers and the live code), the five deliberate differences and the eleven capability differences, the research behind each decision, the fifty-item plan — forty-nine of them done and one deferred — and the guardrails that would stop the two drifting apart again |
