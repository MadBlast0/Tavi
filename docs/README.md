# Documentation

Two kinds of document live here, and they are kept apart on purpose.

| | What it is | Where it lives |
|---|---|---|
| **The app as it is** | What the code does now, and where each thing lives | `docs/` — this folder, and [`architecture.md`](architecture.md) and [`storage.md`](storage.md) |
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

The [README](../README.md) is the front door: what the app is, how to run it,
and what it does and does not do.

## The app as it is meant to become

| Document | What it covers |
|---|---|
| [`plan/later-on.md`](plan/later-on.md) | What is deferred, and why: the features that were deliberately left out, the things noticed while building, and the three that need a machine to check |
| [`plan/Plan_master.md`](plan/Plan_master.md) | The master plan the app was built from |
| [`plan/mock/shell-layout.html`](plan/mock/shell-layout.html) | The shell layout as it was designed, before it was built |
