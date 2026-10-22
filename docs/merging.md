# Branches, merging, and the merge bot

## The two lines

There are two long-lived lines in this repository, and they are not the same
thing.

| | What it is | Who writes to it |
|---|---|---|
| **`master`** | The line of work. New work is committed here, and the other branches are cut from it. | The work in progress. |
| **`main`** | The trunk. Everything that is finished is merged into it, and it is the line that is supposed to be provable at any moment. | The merge bot, and anybody merging by hand. |

`main` is not a copy of `master`, and it does not run ahead of it on purpose. It
is the place where work from every branch has been brought together and proved
to work. A branch that is still being written to is not in `main` until it is
finished and the merge has been proved.

The point of keeping them apart is that `main` has a property the working
branches do not have to have: **it is green.** It is the line you can put in
front of somebody.

## Why a merge is proved before `main` moves

A merge that does not work is worse than no merge at all, because it looks
like progress. Git will happily merge two branches that disagree about what
the app is, and it will not say so — it merges the text and leaves the
meaning broken. This repository has a live example of that, and it is the
reason the gate exists:

- One branch changed the provider marks to be drawn in the page's own colour,
  so they are imported as `?raw`.
- Another branch added a test that walks every import in the app and checks
  that it points at a file that is there. That test did not know about the
  `?raw` suffix, so it decided thirty-one imports pointed at nothing.
- The two branches merged with **no conflict at all** — they touched
  different lines — and the result failed a test that passed on both of them
  separately.

That is the class of failure a merge check has to catch. A conflict is loud;
a semantic disagreement is silent.

So `main` does not move until the merge is proved. The gate is:

| Step | What it proves |
|---|---|
| `pnpm install --frozen-lockfile` | The manifest and the lockfile agree. A branch that imports a package it never declared fails here rather than at runtime. |
| `pnpm typecheck` | The TypeScript compiles. |
| `pnpm test` | The tests pass. |
| `pnpm build` | The app builds. |
| `cargo check --all-targets` | The Rust side compiles, with `RUSTFLAGS=-D warnings` so a warning is a failure. |

The build prints one advisory — that a bundle is larger than 500 kB after
minification. It is a standing condition of the app rather than something a
merge introduces, so it is named in the script as the one warning that is
allowed. Every other warning fails the gate.

**If the gate fails, the merge is aborted and `main` is left exactly as it
was.** It is not merged "with the problem still in it" and not merged on
Tuesday.

## The merge bot

`scripts/merge-main.ps1` is the bot. It runs on a timer, and each run does the
same four things.

1. **It checks the worktree is clean.** A merge must not land on top of
   somebody's half-finished edits, so if the `main` worktree has any
   uncommitted change the run stops and says so.
2. **It finds the branches that have something new.** A branch with no commits
   that `main` does not already have is skipped, and so is the bot's own
   branch.
3. **It merges each of them, one at a time, and proves each one before
   committing it.** The proof runs against the merged tree, not against the
   branch — that is the only way to know the *combination* works.
4. **It pushes `main`** when it has moved, and it logs everything to
   `%APPDATA%\Tavi\merge.log`.

### What it will not do

- **It will not touch another branch's worktree.** It reads other branches;
  it writes to one place only, the `main` worktree. The work in `CLI` and
  `UIUX` is never checked out, moved, reset or committed to by the bot.
- **It will not merge work that is not committed.** Git merges commits, so a
  branch that is holding uncommitted changes in its worktree is merged as of
  its last commit. The bot reports how many files that is, so a merge is
  never mistaken for more than it was.
- **It will not guess.** See below.

### When a merge needs judgement

Two things need a person or an agent rather than a script:

- the merge **conflicts**, so there is text to reconcile; and
- the merge is **clean but the gate goes red**, so the two branches disagree
  about something the gate can see and git cannot.

The bot does not try to settle either one. It writes down what failed and
where the output is, and it calls:

```bash
opencode run --session <session> --auto "<the failing merge, and what to do about it>"
```

That wakes an agent in a session of your choosing, gives it the failing
output, and tells it the rules: work in the `main` worktree, leave every other
branch alone, keep both sides' features when the two sides disagree, prove
the result with the same gate, and commit and push only what passes.

This is the part that a CI service cannot do. A merge that needs judgement
needs somebody who can read both sides and decide what the app should be —
which is not a thing a YAML workflow can be told.

## The timer

The bot runs on a Windows scheduled task, every thirty minutes, whether or not
a terminal or an agent session is open.

```powershell
# put it on the timer
./scripts/install-merge-timer.ps1

# take it off again
./scripts/install-merge-timer.ps1 -Remove
```

The installer also writes `scripts/.tavi-merge.json`, which says which
session to wake. It is a local file and it is not committed.

The task is registered with `MultipleInstances: IgnoreNew`, so a run that
takes longer than thirty minutes does not stack up behind itself, and the bot
takes a lock file of its own for the same reason.

### Running it by hand

```powershell
# everything: merge, prove, push, and wake an agent if something needs judgement
./scripts/merge-main.ps1

# report only, and do not wake anybody
./scripts/merge-main.ps1 -NoAgent

# just these two branches
./scripts/merge-main.ps1 -NoAgent -Branches CLI,UIUX
```

## The `main` worktree

The bot needs a checkout of `main` that is its own, so that a merge never
happens in a tree somebody is working in. It is a git worktree, beside the
repository rather than inside it:

```
C:\Storage\Coding\Tavi-merge        ← the main worktree, on the main branch
C:\Storage\Coding\Tavi              ← the ordinary checkout, on master
```

```powershell
git worktree list
```

The bot works in the first of those and does not touch the second.

## Known limitations

- **The timer needs the machine to be on.** It is a Windows scheduled task,
  not a service. A machine that is asleep at the time does not run the bot
  when it wakes up, unless the task is set to start when it was missed.
- **A branch that is still being written to is not merged.** That is the
  point of the gate, but it means `main` trails the working branches by
  however long the work takes.
- **The bot merges what is committed, not what is in the tree.** A branch
  with uncommitted work is merged as of its last commit. The bot reports
  this, but it does not wait for the work to be committed.
- **Nothing here runs the app.** The gate proves it compiles, that the tests
  pass and that it builds. It does not open a window and look at it, so a
  merge that is wrong in a way only a person can see will pass the gate.
