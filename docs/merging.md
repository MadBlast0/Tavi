# Branches and merging

## The trunk

`main` is the trunk. Everything that is finished is merged into it, and it is
the line that is supposed to be provable at any moment.

Work happens on branches cut from `main`. A branch that is still being written
to is not in `main` until it is finished and the merge has been proved.

The point of keeping the branches apart is that `main` has a property the
working branches do not have to have: **it is green.** It is the line you can
put in front of somebody.

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
merge introduces, so it is the one warning the gate allows. Every other
warning fails the gate.

**If the gate fails, the merge is aborted and `main` is left exactly as it
was.** It is not merged "with the problem still in it" and not merged on
Tuesday.

## The merges that were hard, and what was decided

Two merges were not routine. They are here because they are the cases the
process exists for.

### The provider marks (`UIUX` into `main`)

One branch changed the provider marks to be drawn in the page's own colour,
so they are imported as `?raw`. Another added a test that walks every import
in the app and checks that it points at a file that is there.

The two branches merged with **no conflict at all** — they touched different
lines — and the result failed a test that passed on both of them separately.
The test did not know about the `?raw` suffix, so it decided thirty-one
imports pointed at nothing.

**The test was what was wrong, not the mark.** `?raw` says how the file is
loaded, not which file it is, so the query is dropped before the file is
looked for. Both sides' work is kept: the mark is still drawn in the
page's own colour, and the test still says that an import which points at
nothing fails the build.

### The CLI providers (`CLI` into `main`)

Two files had changed on both sides, in ways that did not overlap and did
not agree.

`src-tauri/Cargo.toml` had the notification plugin on one side and tokio's
`time` feature on the other. Neither was a duplicate of the other: the toast
is the reply that finished while the app was in the background, and
`tokio::time::sleep` is how the CLI waits between polls of a provider's
answer. **Both are kept.**

`prompt-block.tsx` had the reasoning check written two ways. One side
renamed it to `checkReasoning` and had it answer with a verdict; the other
was still calling the old `serializeReasoning`, which the merged module no
longer exports. **The newer name is the one that exists now**, so that is
what is called — and the CLI's own condition is kept with it, that a CLI
provider is not asked whether it publishes effort levels, because it has its
own way of being told how hard to think.

### The rule behind both

When two branches disagree, the question is not *which side wins*. It is
**what each side was trying to do**, and whether the two are the same thing
written twice.

- The same thing written twice → one of them, and the other is dropped.
- Two different things → both, and the merge is written so that both work.

A merge that drops a feature is a failure. So is a merge that keeps two
copies of the same one.

## The report

To see what every branch is holding that `main` does not have:

```bash
git branch -vv
git log --oneline main..<branch>
```

A branch is **safe to delete** when every one of its commits is reachable from
`main`, and it is holding nothing uncommitted. A deleted branch takes its
uncommitted work with it, and that work is gone.

**No branch is deleted automatically.** The report is there so that the
decision is made by somebody who can see it.

## Merging by hand

A merge into `main` is done in the checkout at `C:\Storage\Coding\Tavi`, and
the gate is run against the merged tree before the merge is committed:

```bash
git fetch origin
git switch main
git merge --no-commit --no-ff origin/<branch>
pnpm install --frozen-lockfile
pnpm typecheck
pnpm test
pnpm build
cargo check --all-targets
git commit -m "Merge branch '<branch>' into main"
git push origin main
```

If the gate fails, `git merge --abort` and leave `main` exactly as it was.
Nothing is merged "with the problem still in it" and nothing is merged on
Tuesday.

Two things need a person or an agent rather than the commands above:

- the merge **conflicts**, so there is text to reconcile; and
- the merge is **clean but the gate goes red**, so the two branches disagree
  about something the gate can see and git cannot.

A merge that needs judgement needs somebody who can read both sides and
decide what the app should be — which is not a thing a YAML workflow can be
told.

## The checkout

The repository is checked out at `C:\Storage\Coding\Tavi`, on `main`. Merges
are done there. There is no separate `main` worktree.

```powershell
git worktree list
```

## Known limitations

- **A branch that is still being written to is not merged.** That is the
  point of the gate, but it means `main` trails the working branches by
  however long the work takes.
- **A merge takes what is committed, not what is in the tree.** A branch
  with uncommitted work is merged as of its last commit. The report shows
  this, but a merge does not wait for the work to be committed.
- **Nothing here runs the app.** The gate proves it compiles, that the tests
  pass and that it builds. It does not open a window and look at it, so a
  merge that is wrong in a way only a person can see will pass the gate.
