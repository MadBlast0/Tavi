# Documentation

Two kinds of document live here, and they are kept apart on purpose.

| | What it is | Where it lives |
|---|---|---|
| **The app as it is** | What the code does now, and where each thing lives | `docs/` — this folder, and [`architecture.md`](architecture.md), [`storage.md`](storage.md), [`tokens.md`](tokens.md), [`components.md`](components.md) and [`workspace-state.md`](workspace-state.md) |
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
| [`tokens.md`](tokens.md) | Every colour, size and shape the app is drawn with: the roles, the values in both modes, the rules the themes obey and where they are checked, and how to add a token |
| [`components.md`](components.md) | Every shared component in the app and which one to use for a given job: the one family they are all built on, the map, the rules, and what changed |
| [`layout.md`](layout.md) | Every element that owns a height or a scrollbar: the window's floor, the height chain, what scrolls and what does not, the container a workspace will live in, and what changed |
| [`workspace-state.md`](workspace-state.md) | Who owns each piece of the workspace's state — the app section, the active session, the open flag, the pane instances, the active pane, the arrangement, the pane-local state and the overlay — where it lives, who changes it, and the two separations that keep the arrangement from becoming a copy of the panes |

The [README](../README.md) is the front door: what the app is, how to run it,
and what it does and does not do.

## The app as it is meant to become

| Document | What it covers |
|---|---|
| [`plan/later-on.md`](plan/later-on.md) | What is deferred, and why: the features that were deliberately left out, the things noticed while building, and the three that need a machine to check |
| [`plan/build-plan.md`](plan/build-plan.md) | What to build next, bottom-up: the stack from the storage layer to the features, with the front-end and back-end work for each layer, and the conversation runtime that comes first |
| [`plan/notifications.md`](plan/notifications.md) | Telling the user that a reply finished while they were not looking at it: the rule, the settings, and what it cannot do |
| [`plan/Plan_master.md`](plan/Plan_master.md) | The master plan the app was built from |
| [`plan/api-keys-and-parity.md`](plan/api-keys-and-parity.md) | The API keys screen, and the audit of every place the desktop app and the website are not the same: twelve defects (three of them found by probing the live providers and the live code), the five deliberate differences and the eleven capability differences, the research behind each decision, the fifty-item plan — forty-nine of them done and one deferred — and the guardrails that would stop the two drifting apart again |
