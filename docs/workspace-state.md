# The workspace state

Who owns each piece of the workspace's state, where it lives, who changes it,
and who reads it.

This document describes the app **as it is**. The workspace's state is
`src/lib/workspace-state.ts`, and everything below says which of the eight
things the plan puts in the workspace's care is in that file and which is
somewhere else — the plan asks for the ownership to be written down rather
than guessed at, and a second copy of a decision is how two of them start to
disagree.

**A warning about the word.** The **workspace** is the main content region
that arranges pane instances. `src/lib/workspace.ts` is something else
entirely: a folder the app has been given access to. The two are unrelated,
and the new file is named `workspace-state.ts` so they can sit side by side
without either of them being renamed.

---

## 1. The eight things, and who owns them

| Thing | Who owns it | Where it lives | Who changes it | Who reads it |
|---|---|---|---|---|
| **The app section** — Chat or Code | `ComposerVariantProvider` | `src/blocks/prompt-input/composer-variant.tsx` | The rail's switch (`ComposerVariantSwitch`), the system tray and the app menu, through `useNewThread` | The prompt block, the rail |
| **The active project or session** | The thread bridge and the thread stores | `src/blocks/prompt-input/thread-bridge.tsx`, `src/lib/chats.ts`, `src/lib/sessions.ts` | The rail opens a thread; the composer saves it | The prompt block, the rail |
| **The pane instances** | The workspace state | `src/lib/workspace-state.ts` — `panes` | `addPane()`, `removePane()`, `setPaneTitle()` | The layout engine, the pane frame, the Views menu |
| **The active pane** | The workspace state | `src/lib/workspace-state.ts` — `activePaneId` | `setActivePane()`; Task 7.6 focuses a pane | The pane frame, which draws the active styling |
| **The layout geometry** | The workspace state | `src/lib/workspace-state.ts` — `layout` | `setLayout()`, called by the layout engine | The layout engine; the pane frame, to know where it sits |
| **The pane-local UI state** | Each pane instance | `src/lib/workspace-state.ts` — `paneState`, keyed by pane id | The pane itself, through `setPaneState()` | The pane itself, through `usePaneState()` |
| **The overlay state** | The workspace state | `src/lib/workspace-state.ts` — `overlay` | The trigger that opened it, and the overlay's own dismissal | The overlay, and whatever closes it |

Two of the eight are not in the workspace's file, and that is the point of
the table rather than a gap in it. A ninth thing — whether the model is
running — is not there either, and is not the workspace's to hold; §4 says
why.

### The app section is not ours to keep

`ComposerVariantProvider` owns it, and the workspace keeps no copy. The
switch in the rail changes it freely, and the app always opens in Chat and
never opens in the layout it was last left in — so a second copy in the
workspace would be a second answer to "which side are we on", and the two
would disagree the first time somebody used the switch while the workspace
was open.

The workspace does not need its own copy either. A workspace holds panes of
several kinds — a Chat pane and a Code Session pane are both in the
registry — so the section does not say what a workspace is made of. A caller
that needs both reads both: `useComposerVariant()` for the section,
`useWorkspace()` for the workspace.

### The active thread is not ours either, and a pane's association is not the same thing

The app's active thread is the thread bridge's `activeId`, and the thread
itself is a record in `src/lib/chats.ts` or `src/lib/sessions.ts`. The
workspace holds none of that.

What the workspace does hold is an **association** on a pane instance:

```ts
context?: { projectId?: string; sessionId?: string }
```

These are references, and they are the difference between two things that
are easy to confuse:

- The app's active thread decides **what the work area is showing**. It is
  the conversation in front of the user.
- A pane's association says **what that pane is about** — a Terminal
  pointed at a folder, a Diff pane showing what a session changed.

An association is metadata, not ownership. Focusing a pane does not make
its session the active thread, and closing a pane does not close the
session or unlink the project. The session's title is read from the thread
store when it is needed and the folder's name from the grant in
`src/lib/workspace.ts`, so neither can go stale in the workspace.

---

## 2. The five things the workspace does own

`src/lib/workspace-state.ts` holds exactly these, and a test checks that the
list has not grown.

| Field | What it is |
|---|---|
| `panes` | The pane instances, in the order they were added |
| `activePaneId` | The pane that has focus, or null |
| `layout` | The arrangement, as a tree of panes, splits and groups |
| `overlay` | The one overlay that is open, or null |
| `paneState` | Each pane's own state, keyed by pane id |

**There is no `open` field, and that is the correction.** The first version
of this state had one, along with `openWorkspace()` and `closeWorkspace()`.
It was built on the assumption that the workspace is a place you enter — a
mode, with a way in and a way out — and that assumption is what produced
the navigation row in the rail, which the plan had twice said not to put
there.

The workspace is the main content region: the area of the window beside the
rail, the area the prompt composer sits in. A region is not open or closed.
What it shows is decided by what is in it:

| The workspace holds | The region shows |
|---|---|
| No session and no panes | The landing screen, exactly as it is today |
| A session, or at least one pane | The layout |

So the state answers the question by holding the answer, rather than by
holding a flag that says which way to answer it.

The store is an external store with a `subscribe` / `getSnapshot` pair, read
through `useSyncExternalStore`, and it is the same pattern as
`src/lib/theme.ts` and `src/lib/palette.ts`. No state library was added:
`useSyncExternalStore` is React's own, and the app already reads the theme
and the palette through it.

`createWorkspaceStore()` is a factory and `workspaceStore` is the app's one.
The factory is so that a test can have a workspace of its own — a store that
outlived a test would carry the previous test's panes into the next one.

---

## 3. The pane type registry and the pane instances are two different things

The plan asks for a registry of pane types, and Task 4.4 builds it. **It is
not in this module**, and that is deliberate:

| | The registry | The instances |
|---|---|---|
| What it is | A catalogue of the kinds of pane that exist | The occurrences of those kinds in one workspace |
| What it holds | A type key, a default title, an icon, a description, a renderer, the actions the type supports, whether duplicates make sense | An id, a type key, an optional title of its own, an optional association |
| Where it lives | Its own module, with the types it draws | `panes` in the workspace state |
| When it changes | When a new kind of pane is added | When a pane is added or removed |

A registry entry holds a renderer, and a renderer is a component, so the
registry cannot be a piece of state — it is a catalogue, and it belongs with
the code that draws.

An instance holds only the **key**. Everything else about its kind — the
icon, the default title, the renderer — is asked for from the registry by
that key. So adding a pane type is one entry in the registry and nothing
else: the state module does not change, the layout engine does not change,
and the Views menu reads the same list it read before.

---

## 4. The two separations

### The geometry is not the pane's content

The arrangement is a tree of splits. A leaf **names** a pane; a split names
an orientation and how the space is divided between its two children.
There is nowhere in it for a pane's contents.

A pane's own state — which file is selected, which filter is on, which row
is expanded — lives in `paneState`, under the pane's own id. It is per
instance and never per type: two File Explorers on screen at once are two
different places, and a file selected in one of them says nothing about
the other.

The reason the geometry is kept apart is that a tree which could carry a
pane's state would have to be rewritten every time that state changed, and
the arrangement would stop being the arrangement. It would become a second
copy of every pane, kept in step with the first by hand.

`src/lib/workspace-state.test.ts` checks this by walking the tree and
asking what every string in it is. A pane's id, or one of the four words
the arrangement is written in — `pane`, `split`, `horizontal`, `vertical` —
and nothing else. A field added to the leaf to hold a pane's content is
found by that walk whatever it is called.

### Neither of them is execution

The plan says the layout system must not implement agent execution, and the
build plan puts the conversation runtime in a later layer
(`docs/plan/build-plan.md`, Layer 2 — "the next piece").

So there is **no** field here that says whether a reply is in flight, what a
tool is doing, or whether an agent is working. There is no place to put one:
a layout that carried a "running" flag would be a layout with opinions about
work it does not do, and the moment the runtime arrives it would have two
answers to the same question.

The app already owns that. Today it is the thread bridge's `runningId`, and
when Layer 2 arrives it becomes a per-thread store of its own
(`src/lib/conversation.ts` in that plan). A pane that shows a mock status
draws it from whatever the app has; the workspace state is not involved.

The active pane is a separate matter again. Which pane has focus is a
property of the arrangement and of the pointer, and it says nothing about
what any of the panes is doing.

---

## 5. The rules

1. **Nothing in the workspace is a copy of app state.** It holds six things
   and no more, and the list is checked by a test so that a copy of the app
   section or the active thread cannot be added by accident.
2. **A pane is added before it is placed.** `setLayout()` refuses a tree
   that names a pane the workspace does not have, so a pane is never
   promised at a place where there is nothing to draw.
3. **An arrangement names each pane once.** The same pane in two places is
   not an arrangement, and `validateLayout()` says so.
4. **A split divides the space it has.** A ratio is strictly between 0 and
   1, and a split has two children.
5. **A pane's own state is per instance.** Keyed by the pane's id, never by
   its type.
6. **There is room for one overlay.** Opening one closes whatever was open.
   The overlay names the *action* it offers, so the Views menu and the
   layout-preset menu are two different things and only one of them can be
   open.
7. **Six panes.** The product's rule, in §1.5 of the plan, checked where a
   pane is added — the moment the user asks for one too many. The number of
   registered pane types, and the number of projects and sessions, are not
   limited by it.
8. **Removing a pane takes away what referred to it** — its own state, its
   place in the arrangement, its focus, and any overlay that belonged to it
   — **and nothing else.** The session and the project it was about are the
   app's, and closing a window onto a conversation is not closing the
   conversation.

---

## 6. What was changed, and why

Two new files, and nothing else.

| File | What it is |
|---|---|
| `src/lib/workspace-state.ts` | The state, its types, the store and the operations that change it |
| `src/lib/workspace-state.test.ts` | Nineteen tests: one for each rule that matters, and one for the thing the workspace must not do |

No component was added, nothing was rendered, no docking behaviour was
built, and no package was added. Nothing in `src/components/**`, in the
shell, in the prompt block or in the thread bridge was touched — the
existing state supports all of this, which is the point of the acceptance
criterion: the workspace needed six new things and a second copy of
nothing.

### The decisions that were not handed down

**The arrangement is a tree of three kinds of node**, and not two. A leaf
names a pane, a split names an orientation, a ratio and two children, and a
**group** names a set of panes that share one place and one of which is
showing. The group is there because tabbed groups are in scope
(`docs/plan/ui-ux-plan.md` §1.7), and because a group is what a pane
dropped on the middle of another pane becomes.

A group of one is not a group: it collapses into the pane it holds, because
a tab strip with one tab on it is a decoration and not a control. The model
does not keep what the renderer would not draw.

**A group has an id of its own.** `GroupId` is a stable name for a place
in the layout, so that a tab group can be found in the tree and talked
about.

**The six-pane cap is enforced here.** The plan puts the cap at "the
add-operation boundary", and the add operation is the only place a seventh
pane can be refused before it exists. Enforcing it in the state means the
limit is a property of the workspace rather than a thing each caller has to
remember.

**The arrangement is the app's own tree of splits.** A nested split tree
represents one pane, two panes, three columns and six panes with the same
shape, and nothing in it assumes six slots. It is not tied to a docking
library, because that library has not been chosen: Task 0.4 is still open.
If the library that is chosen owns its own geometry, Task 6.3's adapter maps
this tree onto that schema and the tree stops being the source of truth —
the separation it exists for does not change either way.

**Removing a pane takes it out of the arrangement.** The tree and the list
of panes have to agree, and a tree that names a pane that is not there is a
blank space on screen. The store does the one piece of surgery that needs
doing — the branch collapses into what is left of it, and a group of one
becomes a pane — and decides nothing else. Where a pane *goes* is the
layout engine's business, in Tasks 6 and 7.

**Moving a pane does not add one.** A drop takes the pane out of where it
was and puts it somewhere else, and the cap is on how many panes there are,
not on where they are. So rearranging the six is always allowed, and the
seventh is refused at the moment it is asked for.

**Nothing is written to disk yet.** The workspace's state is in memory, and
it is not restored on the next run — the app opens on the landing screen.
Task 7.11 may save the arrangement.

### What is not here, and where it goes

| | |
|---|---|
| The pane type registry | Task 4.4, in its own module |
| The pane frame and its header | Tasks 4.1 and 4.2 |
| The workspace region | Task 2.1 |
| Opening a session into the layout | Task 2.2, through `addPane()` and `setLayout()` |
| The layout engine | Tasks 6.1 to 6.6, through `setLayout()` and `dockPane()` |
| Focusing a pane | Task 7.6, through `setActivePane()` |
| The Views menu | Task 7.1, through `openOverlay()` |
| Saving the arrangement | Task 7.11, and only if it is safe to do |

---

## 7. Adding to the state

1. Decide whether the thing is **the workspace's**. If it is a fact about
   the app — the section, the active thread, what the model is doing — it
   belongs somewhere else, and the file that owns it says so.
2. Decide whether it is **the arrangement's** or **a pane's**. The
   arrangement says where a pane is; the pane says what is in it.
3. Add it to the snapshot, to the store, and to the test that checks the
   snapshot's own list of fields. A field added without that test is a
   field nobody decided to own.
