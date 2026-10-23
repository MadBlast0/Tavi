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
| **R1** | Up to **six** docked pane instances, including inactive tabs, and a seventh refused with a clear reason | §1.5 |
| **R2** | **Nested** horizontal and vertical splits, and arrangements that are not a fixed grid of six | §1.5 |
| **R3** | **Drag-and-drop docking** — dropping a pane against another creates that split, on any of the four edges or into the middle | The reference |
| **R4** | Resizable dividers, with sensible minimum sizes | The reference |
| **R5** | **Per-pane headers under the app's control** — the header is the app's, not the library's | §4.3 |
| **R6** | **Tabbed groups**, in which several panes share one place and one of them shows | §1.7 |
| **R7** | **Pop-out windows**, and **dock-back** into the main window | The reference |
| **R8** | **Two sessions side by side**, each with its own conversation, state and project | The reference |
| **R9** | Layout metadata can be **saved and restored** | Task 7.11 |
| **R10** | Theme compatibility — the app's own tokens, in both modes | §3.1 |
| **R11** | One authoritative layout model, and maintainable integration with Tavi's components | §3.1 and `src/lib/workspace-state.ts` |
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

A full IDE docking manager with tab groups, nested layouts, drag-and-drop,
floating groups, pop-out windows and layout serialization. The current
Dockview docs describe its core packages as MIT-licensed and zero-runtime-
dependency; verify the exact package and version before adoption.

Dockview is more customizable than the first version of this decision
record allowed for. Its docs show custom tab renderers, custom header
actions, a hidden group header, custom themes, and pop-out lifecycle hooks.
It therefore is **not inherently a second design system**. It does bring
its own layout model and styled surface, which must be integrated with
Tavi's pane-frame contract and state model; the amount of styling and
adapter work should be measured in a proof of fit, not assumed.

References: [Dockview overview](https://dockview.dev/docs/overview/introduction/),
[custom tabs](https://dockview.dev/docs/core/panels/tabs/),
[group controls](https://dockview.dev/docs/core/groups/hiddenHeader/), and
[pop-out windows](https://dockview.dev/docs/core/groups/popoutGroups/).

### FlexLayout

FlexLayout React is a React layout manager organized around tabs and
tabsets. Its package documentation describes drag-and-drop between tabs
and groups, edge docking, tabsets, model serialization, and pop-out tabs
in browser windows. The pop-out implementation is not automatically a
native Tauri window. It supports custom tab and tabset rendering, so the
actual fit with Tavi's frame also requires a small proof of fit.

References: [FlexLayout React package documentation](https://www.npmjs.com/package/flexlayout-react)
and [pop-out rendering API](https://github.com/caplin/FlexLayout/blob/master/src/view/Layout.tsx).

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
| R1 six pane instances | ✅ the app owns the cap | ✅ app-level policy | ✅ app-level policy | ✅ |
| R2 nested, not six cells | ✅ nested `Group`s | ✅ | ✅ | ✅ |
| **R3 drag-to-dock** | ❌ **resize only** | ✅ | ✅ | by hand |
| R4 resizable dividers | ✅ | ✅ | ✅ | by hand |
| R5 our own headers | ✅ | ✅ custom tabs/header actions; verify frame fit | ✅ custom tab/tabset renderers | ✅ |
| **R6 tab groups** | ❌ **no tabs at all** | ✅ | ✅ | by hand |
| **R7 pop-out and dock-back** | ❌ | ⚠️ browser pop-out API; bridge to native Tauri window | ⚠️ browser pop-out; bridge to native Tauri window | by hand, and on Tauri |
| **R8 two sessions side by side** | ✅ | ✅ | ✅ | ✅ |
| R9 save and restore | ✅ `useDefaultLayout` | ✅ | ✅ | by hand |
| R10 theme | ✅ already the app's | ✅ custom themes and renderers | ✅ CSS/theming and custom renderers | ✅ |
| R11 one authoritative layout model | ✅ | ⚠️ adapter or migration from app model | ⚠️ adapter or migration from app model | ✅ |
| **R12 insertion indicator** | ❌ | ✅ | ✅ | by hand |

**R3, R6 and R12 rule out the resize-only primitive as the complete
engine.** Dockview and FlexLayout appear to cover the core docking behaviors
and both expose customization; the decisive trade-off is whether their
layout models and browser-window pop-outs can be integrated cleanly with
Tavi's existing state and native Tauri window requirements. The custom
engine avoids an adapter but carries the full implementation and QA burden.

## 5. The decision

**The engine is the app's own code.** It is written in `src/`, in the
app's own vocabulary: the app's tokens, the app's focus treatment, the
app's motion, the app's component family. No docking package is added, and
none is removed — `react-resizable-panels` stays in the project because
other things in the app may use it, and the workspace does not.

### Why

1. **The reference is the shape of the thing, not only its behaviour.**
   Tavi needs flat regions, its own pane content, and clear drop targets.
   Dockview and FlexLayout have customization hooks, so matching the frame
   is possible in principle. The custom implementation preserves direct
   control but must earn that choice through working geometry, drag/drop,
   keyboard resizing, focus, and accessibility—not through a presumption
   that libraries cannot be themed.
2. **The model was never the library's to give.** `src/lib/workspace-state.ts`
   already holds the tree, the rules about what may be in it, and the
   refusals. The first version of this document was right about that and
   wrong about the geometry.
3. **The requirements grew past the resize-only primitive.** Tab groups,
   pane moves and insertion indicators are not provided by
   `react-resizable-panels`. Dockview and FlexLayout do provide broader
   docking behavior. Pop-out requires checking Tauri's native window and
   permission boundary regardless of which layout engine is selected.
4. **The app already has a state model.** `src/lib/workspace-state.ts`
   owns pane instances, contexts, groups and geometry. The custom route
   avoids maintaining a second structural model, at the cost of owning
   more interaction and accessibility code.

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
`src/index.css` and §3.1 of the UI/UX plan — rather than to a library's.

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
| **Dockview** | Not selected for the current custom-engine implementation because its layout model would need an adapter or migration, and the app already has a serializable tree and docking operations. Its styling hooks are real; compare them in a proof of fit before treating style as a blocker. Its documented pop-out uses browser windows, so native Tauri bridging still needs work |
| **FlexLayout** | Not selected for the current custom-engine implementation because it centers the model on tabsets and browser-window pop-outs; verify its custom renderers and Tauri bridge in a proof of fit before ruling it out on visual fit alone |
| **A grid-only approach** | A grid covers three columns beautifully, but a grid cannot express a pane that is 70% of the width beside one that is 30% and then split vertically. A grid is a *layout* the workspace can offer as a preset, not the layout model |
