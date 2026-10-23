# The docking strategy

Which layout engine the workspace is built on, and why.

This is **Task 0.4** of the UI/UX plan: *"Evaluate the existing app stack and
determine whether a current layout dependency, an additional docking library,
or a small custom nested-split implementation is most appropriate."*

**It was written once and it was wrong.** The first version of this document
chose a resizable-panel library, with the drag-to-dock behaviour built on
top of it. That decision was reasonable against the requirements as they
stood then, and the requirements have since grown: tabbed groups, pop-out
windows, docking a popped-out pane back, and two sessions side by side are
all in scope now, and none of them is reachable through a library that
resizes and does not move panes.

This is the second version. It says what the engine has to do, what was
measured, what was chosen, and what the choice does not settle.

---

## 1. What the engine has to do

| | Requirement | Where it comes from |
|---|---|---|
| **R1** | Up to **six** visible pane instances, and a seventh refused with a clear reason | §1.5 |
| **R2** | **Nested** horizontal and vertical splits, and arrangements that are not a fixed grid of six | §1.5 |
| **R3** | **Drag-and-drop docking** — dropping a pane against another creates that split, on any of the four edges or into the middle | The reference |
| **R4** | Resizable dividers, with sensible minimum sizes | The reference |
| **R5** | **Per-pane headers under the app's control** — the header is the app's, not the library's | §4.3 |
| **R6** | **Tabbed groups**, in which several panes share one place and one of them shows | §1.7 |
| **R7** | **Pop-out windows**, and **dock-back** into the main window | The reference |
| **R8** | **Two sessions side by side**, each with its own conversation, state and project | The reference |
| **R9** | Layout metadata can be **saved and restored** | Task 7.11 |
| **R10** | Theme compatibility — the app's own tokens, in both modes | §3.1 |
| **R11** | Maintainability, and no second design system | §3.1 |
| **R12** | **Drag-and-drop feedback**: a clear insertion indicator before the drop | The reference |

R2 says the layout must not be six fixed cells. So one pane, two side by
side, two stacked, three columns, three above and three below, and anything
else must all be expressible.

## 2. What the reference actually looks like

The reference is Claude Code Desktop's pane layout, and it is worth being
precise about it, because the engine is built to reproduce it rather than
to resemble it.

- **The panes are flat.** No card, no rounded corner, no shadow. A pane is
  a region of the window, separated from its neighbour by a single
  hairline, on the window's own background.
- **Each pane carries its own header** — a fixed-height strip with the
  pane's mark and title on the left, and on the right the pane's three
  controls: pop out, a chevron that opens the pane's menu, and close. The
  three are the same three in every pane.
- **Each pane scrolls its own content.** The window does not scroll, and
  neither does the region the layout lives in.
- **A session pane carries its own composer**, at the bottom of the pane.
  Two session panes side by side have two composers.
- **The focused pane is lit and the others are dimmed**, and the divider
  next to the focused pane is the brighter of the two.
- **The top strip of the window belongs to the window**, and it shows the
  focused pane's context. In that app the window is undecorated and that
  strip is its title bar, so the session's own toolbar lives there.

This app's window is also undecorated, but its top strip carries the
sidebar toggle, the application menu and the operating system's own window
controls, so the workspace's actions get their own slim strip instead.
That is a deliberate difference, and it is recorded in §4.2.

**Sessions and panes are different things.** A session is a conversation
with its own history and its own project. A pane is a view. A session is
*displayed in* a pane. Two sessions side by side are two panes that happen
to be showing two different conversations, and the arrangement of the panes
has no opinion about either conversation.

## 3. The candidates

### `react-resizable-panels` — the one already in the project

`react-resizable-panels@4.14.5` is installed, and
`src/components/resizable/resizable.tsx` is the app's own shadcn
**base-nova** wrapper around it — written in the app's conventions, with the
app's tokens on the handle and with persistence already wired to storage
through `useDefaultLayout`.

What it offers: `Group` (a single-axis resizable split), `Grid` (a
two-dimensional grid with spans), `Panel` (with `minSize`, `maxSize`,
`collapsible`), `Separator` (the divider, with a live resize preview), and
`useDefaultLayout` for persistence. Nesting is a `Group` inside a `Panel`.

What it does not offer: **any kind of drag that moves a pane.** It resizes
two panels against each other. There is no pane to pick up, no target to
drop on, no insertion indicator, and no tab anywhere in its model.

### Dockview

A full IDE docking manager: tab groups, grids, split views, and
drag-and-drop docking between them. MIT-licensed, zero runtime
dependencies, and it supports React 19.

Its free tier covers: dockable grids, nested layouts, tabs and tab
groups, tab and group drag-and-drop, edge drop zones, a custom drop
overlay, maximized groups, floating groups, **pop-out windows**,
drag-to-resize splitters, size constraints, save and restore of layouts,
custom panel state, and ARIA and keyboard focus navigation. Its commercial
tier adds a drag-and-drop compass, smart guides, layout history,
multi-row tabs, and keyboard docking.

**It is a second design system.** A Dockview group draws its own tab strip
and its own header, and the app would then be styling a second set of
surfaces with a second set of theming hooks, against the app's own tokens
and the app's own focus treatment. The reference's pane header is a
particular thing — a flat strip with three specific controls — and
fighting a library's header to get it is not a small job.

### FlexLayout

The other React docking manager worth naming. MIT-licensed, React-only
dependency, and it also covers tabs, tab groups, docking to edges and
tabsets, pop-out into floating panels or browser windows, a JSON model,
`data-layout-path` attributes that make a layout easy to test, an
undo/redo hook, and CSS-variable theming.

It is a good library, and its model is tabset-first. The reference's
layout is split-first, and the reference's panes are flat regions with
hairlines rather than tabbed cards.

### A custom engine

The arrangement is a tree, and **the app already has one**:
`src/lib/workspace-state.ts` holds it, with the rules — a leaf names a
pane, a split names an orientation and a ratio, and the tree has nowhere
to put a pane's contents.

Writing the rest means writing: the geometry, the divider, the drag, the
drop targets and their indicators, the minimum sizes, the persistence, the
accessibility of the separators, the focus behaviour, and the tab groups.
That is a lot. The first version of this document said so, and used the
word "a thousand things by hand" about it.

## 4. What each candidate does against the requirements

| | `react-resizable-panels` | Dockview | FlexLayout | custom |
|---|---|---|---|---|
| R1 six visible | ✅ the app owns the cap | ✅ | ✅ | ✅ |
| R2 nested, not six cells | ✅ nested `Group`s | ✅ | ✅ | ✅ |
| **R3 drag-to-dock** | ❌ **resize only** | ✅ | ✅ | by hand |
| R4 resizable dividers | ✅ | ✅ | ✅ | by hand |
| R5 our own headers | ✅ | ⚠️ its own strip to fight | ⚠️ its own strip to fight | ✅ |
| **R6 tab groups** | ❌ **no tabs at all** | ✅ | ✅ | by hand |
| **R7 pop-out and dock-back** | ❌ | ✅ browser windows | ✅ browser windows | by hand, and on Tauri |
| **R8 two sessions side by side** | ✅ | ✅ | ✅ | ✅ |
| R9 save and restore | ✅ `useDefaultLayout` | ✅ | ✅ | by hand |
| R10 theme | ✅ already the app's | ⚠️ its own theming | ✅ CSS variables | ✅ |
| R11 no second design system | ✅ | ❌ a second one | ⚠️ a second one | ✅ |
| **R12 insertion indicator** | ❌ | ✅ | ✅ | by hand |

**R3, R6, R7 and R12 together decide it.** The library that can do all
four brings its own surfaces and its own theming, which is exactly what
R11 forbids and exactly what the reference's flat, hairline-separated panes
are not.

## 5. The decision

**The engine is the app's own code.** It is written in `src/`, in the
app's own vocabulary: the app's tokens, the app's focus treatment, the
app's motion, the app's component family. No docking package is added, and
none is removed — `react-resizable-panels` stays in the project because
other things in the app may use it, and the workspace does not.

### Why

1. **The reference is the shape of the thing, not only its behaviour.**
   Reproducing Claude Code Desktop's panes faithfully means owning the
   geometry, the header, the hairline separators and the drop indicators.
   Those *are* the surface. A library that draws its own tab strip and
   header is not giving the app a layout engine; it is giving the app a
   different application to put inside the layout.
2. **The model was never the library's to give.** `src/lib/workspace-state.ts`
   already holds the tree, the rules about what may be in it, and the
   refusals. The first version of this document was right about that and
   wrong about the geometry.
3. **The requirements grew past the library.** Tabbed groups, pop-out,
   dock-back and insertion indicators are not reachable through a
   resizable-panel library, and the pop-out has to be a **Tauri window**
   anyway — so that work was going to be ours regardless.
4. **The app's own components are the vocabulary.** `docs/components.md`
   says the app's components are built on one family and that a new one
   should not appear beside it. A docking library is a new family.

### What we build, and where

| | |
|---|---|
| The model | `src/lib/workspace-state.ts` — the tree, the rules, the operations |
| The renderer | `src/blocks/workspace/layout/` — the tree drawn |
| The divider | `src/blocks/workspace/layout/separator.tsx` |
| The drag | `src/blocks/workspace/layout/drag.ts` — the state machine |
| The indicators | `src/blocks/workspace/layout/drop-target.tsx` |
| The groups | `src/blocks/workspace/layout/tab-group.tsx` |
| The panes | `src/blocks/workspace/panes/` — the thirteen renderers |

The engine is **ours**, which is the point, and the cost is written down
rather than discovered: the geometry, the drag, the keyboard resize, the
minimum sizes, the persistence and the accessibility of the separators are
all written and all tested here. None of them is optional and none of them
is small.

### The trade-offs, stated plainly

| | We give up | We take on |
|---|---|---|
| **Against Dockview and FlexLayout** | Years of work on what a drag feels like, and the pop-out that comes with them | Full control of the pane's own look, the drop indicators, and the pop-out, which has to be a Tauri window in any case |
| **Against `react-resizable-panels`** | A tested resize implementation | Everything R3, R6, R7 and R12 need, and a layout model with groups in it |
| **Against doing nothing** | — | — |

The honest risk: **the drag will not be as smooth as a mature docking
library's.** The mitigation is that the drop targets and the animation are
the app's own code, so they can be tuned to the app's motion vocabulary —
`docs/tokens.md` §10 — rather than to a library's.

### What this decision does not settle

- **The exact geometry of the divider** — its thickness, its hit area, and
  how it looks when it is being dragged. Task 6.2, decided by looking.
- **The minimum sizes** for a pane, at the 600 × 338 floor. Task 6.4.
- **The motion of a drop** — whether the pane animates into place, and for
  how long. Task 6.3.
- **The pop-out's window** — its chrome, its size, and how it docks back.
  Task 7.13, and it needs work on the desktop side.
- **The pane registry** (Task 4.4) — the type, title, mark, renderer and
  actions of each pane type. It is the app's, and it is not the layout's.

---

## 6. The proof of fit

Phase 6 is the proof, and it is not a throwaway experiment: every task in
it produces the real engine, in the real workspace.

The first task is the one that would have changed this decision, and it
answers four questions at once:

1. **Does the tree render?** A `Group` inside a `Panel` inside a `Group`
   has to survive being drawn by hand — which is the whole of the nesting
   requirement, R2.
2. **Do the app's tokens style a hairline separator** between two panes,
   and a focused pane's brighter one? The app's own tokens are the only
   ones in play, so this is about whether the tokens are enough.
3. **Does the arrangement survive a round trip** through JSON? The model
   has to be serializable, because Task 7.11 writes it down.
4. **Does it survive the 600 × 338 floor?** Two panes side by side at the
   window's smallest is the worst case the floor allows, and it is the
   case that decides the minimum sizes.

**If the tree does not render,** the fallback is a library, and the cost is
the app's own model becoming the library's — which is why it is found here,
at Task 6.1, and not at Task 7.5.

**If the drag feels wrong,** that is Task 6.3's problem and it is tunable
there, because the drop targets are our own code. It is not a reason to
change the engine.

---

## 7. What was ruled out, and why

| | Why not |
|---|---|
| **`react-resizable-panels` as the engine** | It resizes. It does not move panes, and it has no tabs, no pop-out and no insertion indicator. It stays in the project for whatever else uses it |
| **Dockview** | A second design system, with its own tab strips, its own headers and its own theming, and the reference's panes are the opposite of all three. Its pop-out is a browser window, and this is a desktop app |
| **FlexLayout** | A good library, and the closest of the three — but tabset-first, and the reference is split-first. Its pop-out is a browser window too |
| **A grid-only approach** | A grid covers three columns beautifully, but a grid cannot express a pane that is 70% of the width beside one that is 30% and then split vertically. A grid is a *layout* the workspace can offer as a preset, not the layout model |
