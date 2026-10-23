# Git

The plan for Layer 7 of [`build-plan.md`](build-plan.md): the workspace, and
Git.

**The design.** The back end is built and tested, and so is the surface. What
is not built is the isolated copy, and it is not built because the app
cannot write.

---

## 1. What the reference does, and what we take from it

The reference is a desktop coding application with a Git-aware session. This
is what it does, and what each part of it means for us.

### 1.1 The branch is chosen when the session starts, not by a setting

**The reference.** In the row under the prompt box, beside the project
folder, there is a **branch** control and a **Worktree** toggle. The branch is
picked per session, at the start, and it belongs to the session. A later
report notes that in the newest build the pair moved into the *environment's*
configuration, so the choice is remembered for the folder rather than offered
fresh each time.

**What we take.** The branch belongs to the **conversation**, not to the app
and not to the folder. A conversation about a bug is about a bug on a branch,
and the branch is part of what the conversation is. It is remembered with the
conversation, and it is shown with it.

**What we do not take.** The worktree toggle. See §4.

### 1.2 The "Changes" card is where the session says what it changed

**The reference.** Beside the chat there is a *session details panel*: a set
of cards showing where the session runs, **what it changed**, what it is
running, and how much of the context window is used. The Changes card lists
the changed files with their line counts (`+12 -1`), and clicking the counts
opens the diff view. There is also a **Changes** button in the session's title
bar, and a `Cmd+Shift+D` shortcut that toggles the diff pane.

**What we take.** The idea that a conversation carries a *Changes* surface:
the files that are different, how different they are, and a way into the
difference itself. A conversation about a repository is not finished when the
answer arrives; what it changed is part of the answer.

**What we do not take.** The diff *viewer* as a pane. The diff viewer's
surface belongs to the other plan — see §5.

### 1.3 There is no commit button, because the agent commits

**The reference.** The desktop app's Git surface has no commit button and no
push button. The changes are made by the agent, and the *agent* commits and
pushes them; the app's own surfaces are for reading the difference and for
watching the pull request. Creating a pull request needs the GitHub CLI on
the machine, and the app says so when it is missing.

**This is the one place we must differ, and the reason is ours and not a
choice.** **Our agent cannot write.** The write path is deliberately not
built — the app reads a folder and talks about a change. So the changes in
the working tree are *the reader's*, made outside the app, and the app is
where they are looked at, committed, and pushed.

That makes the app's Git surface a **reader's** surface rather than an
agent's: it reports what is different, and it commits and pushes on the
reader's instruction.

### 1.4 Archiving is the removal route, and it asks before it destroys

**The reference.** A session is archived from its row in the sidebar. If its
worktree has uncommitted changes, the app asks: **Archive anyway** to discard
them, or cancel and commit them. Archived sessions move to an **Archived**
tab, and **Unarchive** brings them back. The worktree's changes survive an
archive, and the app removes the worktree about thirty days later.

**What we take.** Two things. **Archiving asks before it throws work away** —
and in our case the work is the reader's, so the question is even more
important than it is there. And **unarchiving is a first-class way back**.

We already have both: the conversation's own menu archives, and the rail's
**Archived** row is where they go.

### 1.5 The notification

**The reference.** "The desktop app sends an OS notification when a Code
session finishes a task and you aren't currently viewing that session."

**We have this.** It is the rule in `notifications.ts`, and it says a *reply
finished* rather than a task finished, because the app knows only that.

### 1.6 The lessons from its failures

The research on the reference records three that bear on us directly.

| | |
|---|---|
| **A turn ending is not a task finishing.** | Its notifications can fire at intermediate turn-ends while background work continues, and the request on its tracker is for a setting that tells the two apart. We already refuse to claim more than "a reply finished". |
| **Two sessions on one checkout share files.** | There is no general conflict detector: two sessions in one directory can overwrite each other's files, and there are reports of prompts being routed to the wrong session. This is why the isolated copy is not a nicety. |
| **Cleanup must not fall back to deleting a directory.** | A changelog entry records that its cleanup no longer falls back to `rm -rf` when `git worktree remove` fails, because that had been losing gitignored and in-progress files. |

---

## 2. The decisions

These are settled, and building past them without them would build the wrong
thing.

### 2.1 The app runs git itself, with an argument list and no shell

Every call is a fixed argument array, run without a shell, so a branch name
or a commit message reaches git as data and never as a command line. **The
model cannot run git**: it cannot choose an argument, and it cannot name a
path the app has not been given. The rule that shell commands are not in the
model's hands holds because the model is never handed a way to reach git.

### 2.2 The app never stores credentials

`GIT_TERMINAL_PROMPT=0` is set on every call, so git never waits for a
password on a terminal the app does not have — it fails instead, and the
failure is reported as it happened.

**A push therefore works with whatever the machine already has**: a credential
helper, an SSH agent, a token in the environment. **A private repository over
SSH works for the same reason, and only for that reason**: the host was
configured outside the app, and the app has no part in it. The app never asks
for a password, so it never has one to store.

### 2.3 The app does not write the reader's git configuration

An identity, if the reader has set one in the app's own settings, is passed
to git with `-c` **for that one commit**, and is written neither into the
repository nor into the machine's global configuration. Where there is no such
identity, git's own configuration is used; where git has none either, git
refuses and the refusal is reported rather than papered over.

### 2.4 Every call is bounded

A pull or a push talks to a remote, and a remote can stop answering. A git
that never finishes must not be a window that never finishes, so every call
is killed after ten minutes and the refusal is reported.

### 2.5 The status is read from git's machine-readable form

`git status --porcelain=v2 --branch --untracked-files=all` — one call, and
nothing depends on how git happens to word its output in this version. The
lines are read by *field count*, because a path may contain spaces and the
fields before it never do.

### 2.6 Git is a desktop thing, and the website says so

A browser cannot run git. The web target refuses, and the surface says why
rather than showing a control that does nothing. This is the same rule the
app follows everywhere else: a provider request without a key is refused
rather than answered with a default.

### 2.7 The working tree is the reader's

The app did not change it. The app reports what is different, and it commits
and pushes on the reader's instruction. **This is the reason the commit and
the push belong to the app at all**: they are the reader's actions on the
reader's work.

### 2.8 The mock panes stay mock

See §5.

---

## 3. What is built, and what is not

| | Task | Where | |
|---|---|---|---|
| ✅ | The plugin's shape of a git call: an argument array, no shell, the prompt turned off, and a bound | `src-tauri/src/git.rs` | |
| ✅ | **Status** — clean or dirty, the branch, ahead or behind, the files that changed | `git_status` | |
| ✅ | **The branches** the repository has, and which one is checked out | `git_branches` | |
| ✅ | **Commit** — everything that is changed, with the reader's message | `git_commit` | |
| ✅ | **Pull** | `git_pull` | |
| ✅ | **Push** | `git_push` | |
| ✅ | **Switch or create a branch** | `git_switch_branch`, `git_create_branch` | |
| ✅ | The surface — the branch in the Code side's row, the changed files, the branches, and the four actions | `src/blocks/prompt-input/git-panel.tsx` | |
| ⬜ | **Private repositories** | | SSH works only if the host was configured outside the app; there is no token flow, and the app will not add one |
| ⬜ | **An isolated copy of the repository per conversation** | | **gated on the write path** — see §4.2 |
| ⬜ | **The cleanup policy for that copy** | | lands with the copy |
| ⬜ | **A settings control for the projects folder** | | the location is resolved in one place today; it becomes a control when there is a choice to make |
| ⬜ | **The write path** | | **deliberately not built** |

---

## 4. The surface

**The back end is built and tested, and so is the surface.** What is not
built is the isolated copy, and it is not built because the app cannot write.

### 4.1 Where it goes

**In the Code side's row under the prompt box**, where the reference has its
branch control, and beside the folder control the app already has.

The row is the app's "what this conversation is about" row: the folder, the
mode, the model. **The branch belongs there** — it is the fourth fact about
a conversation about a repository, and the reference put it in the same place.

**The changes are shown as a list**, not as a diff. A diff is the other
plan's pane. What belongs here is the *inventory*: which files are different,
how, and whether the branch is ahead or behind. Clicking a file opens it in
the app's file surface, which is also the other plan's — hmm.

**So the honest shape is smaller than it looks.** The surface is:

- The **branch**, in the row under the prompt box, with the branch's name and
  whether it is ahead or behind.
- A **Git** control that opens a small panel: the changed files with their
  states, the branch list, and the four actions — commit, pull, push, and a
  branch to switch to.
- **A commit message box** in that panel, because a commit needs a message
  and a message needs somewhere to be written.

And the *diff* of a file is opened by the file surface, not by this one.

### 4.2 The isolated copy, and why it waits

The plan's own reasoning is the reason, and it is right: **an isolated copy
exists to isolate *writes*, and the app cannot write.** A copy of a
repository, for a conversation that cannot change a file in it, isolates
nothing. It is a second checkout of the same tree, and it is infrastructure
for a feature that is not there.

**What is designed now, so that it lands with the write path:**

| | The rule |
|---|---|
| **Where a copy goes** | Under the repository's own `.tavi/worktrees/`, beside the project — never in a folder the reader did not name, and never shared with another conversation. |
| **What it is called** | The conversation's own name, and a branch of the same name prefixed with the app's — so a branch in the app's list is recognisably the app's. |
| **Never reusing an idle copy** | A copy is allocated by name and is never handed to another conversation. The reference had a reported race where an apparently idle copy was reused while another session was still using it, and a copy is cheap and a collision is not. |
| **The cleanup policy** | The reference's, exactly: a **clean** copy with an **unnamed** conversation is removed with its branch; a **clean** copy with a **named** conversation asks first; a copy **with work in it** asks to keep or remove, and removing discards the work; a copy whose **state cannot be verified** asks and says what it could not check. |
| **How it is removed** | `git worktree remove`, and **never** a recursive delete. The reference changed this for exactly the reason it matters: a fallback delete lost gitignored and in-progress files. |
| **How it is locked** | A lock is taken while the conversation is using the copy, so a cleanup sweep cannot take it out from under it, and released when the conversation ends. |

The policy is in the plan rather than in the code, because there is nothing
for it to act on yet, and a piece of code that removes nothing is a piece of
code nobody has tested.

### 4.3 The identity

The commit needs a name and an address. The app holds them as a preference —
**not** in the reader's git configuration — and passes them with `-c` for the
one commit. If the reader has not set them, git's own configuration is used,
and if git has none, the refusal is shown as it came.

**The setting is a setting**: a name and an address, in the app's own
settings, in the Code part of them.

---

## 5. How this meets the other plan

The other plan is building the **dockable workspace**: the pane framework,
the diff viewer, the file explorer, the terminal, the agent activity pane. Its
own words are that the diff viewer is *sample* content and that no review
action may touch git or the disk.

**So the two must not be wired together, and the difference must be visible.**

| | This plan | The other plan |
|---|---|---|
| The difference between files | **Real.** Read from the repository with git. | **Sample.** Drawn from a fixture. |
| The files it lists | The ones that are really different. | The ones the fixture names. |
| A review action | **Real**, and it commits. | **Sample**, and it says so. |
| The branch | **Real.** | Not present. |
| A pull request | Not built. | Not present. |

**The rule: a pane that says it is a sample stays a sample.** The other
plan's panes are how the workspace is *designed*; this is how the repository
is *read*. Wiring the real git into a pane that says "sample" would make the
app claim work that has not happened, and the app does not do that.

**What the two will share**, when the workspace lands, is the *shape*: a
pane that lists files and a pane that shows one. The real Git data will
arrive as its own surface, beside the conversation, and the workspace's
sample panes will stay sample.

**One thing must be settled before that, and it is a decision rather than a
task:** the reference puts the changes in a panel *beside the chat*, and the
other plan is building panels. If the real Changes surface ends up inside a
workspace pane, the two plans meet, and the pane must be labelled as real
while its neighbours are labelled as sample.

---

## 6. What it cannot do

| | |
|---|---|
| **The website cannot do any of it.** | A browser cannot run git. The surface says so instead of showing a control that does nothing. |
| **A push needs credentials the app does not have.** | The app asks git for none, and never stores any. A push works with what the machine already has, and fails with git's own reason when it does not. |
| **A private repository over SSH works only if the host was configured outside the app.** | There is no token flow, and there will not be one: the app does not store credentials. |
| **The app cannot write.** | So the isolated copies wait, and the commit is of the reader's own changes. |
| **The app cannot merge.** | A merge is a change to a repository's history, and the app does not make changes to repositories. A pull is a fast-forward, and a pull that cannot fast-forward is refused rather than merged. |
| **The changes in the tree are the reader's.** | The app did not make them, and it does not pretend to have. |
