# The docking strategy

Which layout engine the workspace is built on, and why.

This is **Task 0.4** of the UI/UX plan: *"Evaluate the existing app stack and
determine whether a current layout dependency, an additional docking library,
or a small custom nested-split implementation is most appropriate."* It is
the decision the layout engine is built on, so it is written down before any
of it is built.

**Nothing is installed by this document, and nothing is written.** The
smallest experiment that would prove the choice is at the end.

---

## 1. What the workspace has to do

From the plan, and only the parts that bear on the choice:

| | Requirement |
|---|---|
| R1 | Up to **six** panes visible at once, and a seventh refused with a clear reason |
| R2 | **Nested** horizontal and vertical splits, and arrangements that are not a fixed grid of six |
| R3 | **Left / right / top / bottom drag-and-drop docking** — dropping a pane against another creates that split |
| R4 | Resizable dividers, with sensible minimum sizes |
| R5 | **Per-pane headers under the app's control** — the header is the app's, not the library's |
| R6 | **No hidden tab stack.** A tabbed group must not hide a pane the UI says is visible |
| R7 | Layout metadata can be **saved and restored** |
| R8 | Theme compatibility — the app's own tokens, in both modes |
| R9 | Maintainability, and no second design system |

R2 says the layout must not be six fixed cells. So one pane, two side by
side, two stacked, three columns, three above and three below, and
anything else must all be expressible.

---

## 2. The three candidates

### The one already in the project

`react-resizable-panels@4.14.5` is installed, and
`src/components/resizable/resizable.tsx` is the app's own shadcn
**base-nova** wrapper around it — 270 lines, written in the app's
conventions, with the app's tokens on the handle (`bg-border`,
`--ring`, `ease-out-quint`, `motion-safe:`) and with **persistence already
wired** to `localStorage` through `useDefaultLayout`.

It is **imported by nothing**. The project's own build plan calls it out
by name: *"built on `react-resizable-panels` — is vendored and imported by
nothing. The raw material is already on disk."* And that build plan's
Layer 4 says the work area *"renders a panel group"*.

What v4 actually offers, from its own type declarations:

| | |
|---|---|
| `Group` | A single-axis resizable split. `getLayout()` / `setLayout()` over a map of panel id → percentage |
| `Grid` | A **two-dimensional** grid. `Cell`s with `column`, `row`, `columnSpan`, `rowSpan`; `getLayout()` returns the column and row percentages |
| `Panel` | `minSize`, `maxSize`, `collapsible`, `collapsedSize`, `collapsedThreshold` |
| `Separator` | The divider, with a live resize preview and a `preview` slot |
| `useDefaultLayout` | Layout persistence, with a `storage` adapter the app can replace with its own |
| `useDefaultGridLayout` | The same for a `Grid` |
| `useGroupRef` / `useGridRef` / `usePanelRef` | Imperative handles |

Nesting is a `Group` inside a `Panel`. That is how an arbitrary
arrangement is expressed, and it is how the library's own documentation
describes getting past two children.

### Dockview

A full IDE docking manager: tab groups, grids, split views, and drag-and-drop
docking between them. Its **Gridview** is a resizable grid *without* tabs,
and its **Splitview** is a single-axis resizable split.

It is a different component model. A Dockview group draws its own tabs and
its own header, and the app would be styling a second set of surfaces with a
second set of theming hooks.

### A custom nested split

The arrangement is a tree of splits, which the app **already has**:
`src/lib/workspace-state.ts` holds it, with the rules — a leaf names a
pane, a split names an orientation and a ratio, and the tree has nowhere to
put a pane's contents.

Writing the geometry from scratch means writing the drag, the keyboard
resize, the minimum sizes, the persistence, the accessibility of the
separators, and the focus behaviour of a thousand things by hand, when a
component the project already owns does all of it.

---

## 3. What each candidate does against the requirements

| | `react-resizable-panels` | Dockview | custom |
|---|---|---|---|
| R1 six visible | ✅ the app owns the cap, in `addPane` | ✅ | ✅ |
| R2 nested, not six cells | ✅ nested `Group`s; `Grid` with spans for three columns | ✅ | ✅ |
| **R3 drag-to-dock** | ❌ **resize only** | ✅ its core feature | ✅ but by hand |
| R4 resizable dividers | ✅ | ✅ | by hand |
| R5 our own headers | ✅ **the header is ours** — the library draws a divider and nothing else | ⚠️ its own tab strip and header have to be fought | ✅ |
| R6 no hidden tabs | ✅ **there are no tabs in the model at all** | ⚠️ tabs are its centre of gravity; Gridview and Splitview avoid them but the drag model is built on groups | ✅ |
| R7 save and restore | ✅ `useDefaultLayout`, and the vendored component already does it | ✅ | by hand |
| R8 theme | ✅ already the app's tokens | ⚠️ its own theming | ✅ |
| R9 no second design system | ✅ **it is already the app's component** | ❌ a second one | ✅ |

**One requirement decides it: R3, drag-and-drop docking.** `react-resizable-panels`
resizes; it does not move panes. Everything else it does, and does in the
app's own components.

---

## 4. The decision

**`react-resizable-panels`, through the app's own `src/components/resizable`,
with the drag-to-dock behaviour built on top of it.**

### Why

1. **It is already the app's component.** The wrapper in
   `src/components/resizable/resizable.tsx` is written in the app's
   conventions, with the app's tokens and the app's focus treatment. Using
   it means the workspace is built from the app's own vocabulary — the rule
   `docs/components.md` states, and the reason Task 1.2 exists.
2. **The persistence is already built.** The wrapper's `useDefaultLayout`
   writes the layout to storage and reads it back, with a `storage` option
   the app can point at its own store. Task 7.11 is close to free.
3. **It has no tabs, so R6 cannot be violated.** Dockview's model is
   groups of tabs; the plan says plainly that a tabbed group must not hide
   a pane the UI says is visible. Choosing Dockview means choosing against
   its grain.
4. **The header stays ours.** R5 wants per-pane headers under the app's
   control. With this library, the library draws a divider and the app
   draws everything else.
5. **The arrangement stays ours too.** The app's `workspace-state.ts` already
   holds the tree, with the rules about what may be in it. Dockview would
   replace that with its own model and leave the app's tree a shadow of
   the library's — and the plan's Task 6.3 says the schema is the app's.
6. **It covers the awkward arrangements directly.** `Grid` with `columnSpan`
   and `rowSpan` is three columns and three-above/three-below without
   nesting six groups; nested `Group`s are everything else. Neither is a
   fixed set of six cells.

### What it does not give us, and what we build instead

**Drag-to-dock is ours to build.** The library gives the geometry — where
the dividers are, how big a pane may be, what the layout is. The *move* is
the app's:

- The pane header's drag handle is the app's (Task 4.2).
- The drop targets — left, right, top, bottom, around a pane — are the
  app's rendering (Task 7.5).
- The drop is a tree operation on `workspace-state.ts`: split this pane in
  that direction, put the dragged pane in the new half. The tree, its
  rules and its refusals already exist.

This is the same division the plan already draws for the rest of the
workspace: *the app owns the interaction, the library owns the geometry.*
A full docking library would take the interaction too, and with it the
app's own component vocabulary, which is the thing R9 is about.

### The trade-offs, stated plainly

| | We give up | We take on |
|---|---|---|
| **Against Dockview** | Drag-to-dock, the drag-to-dock *and* the drop-target animation, and the library's own handling of a pane dragged out of the layout | Building the drag ourselves; a second look at how a drag over a pane feels; the possibility of losing some of the polish a mature docking library has spent years on |
| **Against a custom split** | Nothing much | The library's resize behaviour, its keyboard support, its minimum sizes, its persistence, and its accessibility are already written and already styled for this app |
| **Against doing nothing** | — | — |

The honest risk: **the drag will not be as smooth as Dockview's.** Dockview
has had years of work on what a drag feels like. The mitigation is that the
drop targets and the animation are the app's own code, so they can be
tuned to the app's motion vocabulary — `docs/tokens.md` §10 — rather than
to the library's.

### What this decision does not settle

- **The pane registry** (Task 4.4) — the type, title, icon, renderer and
  actions of each pane type. It is the app's, and it is not the layout's.
- **The six-pane cap's place in the UI** — the state already refuses a
  seventh pane; the Views menu has to say why.
- **Whether a layout is restored or rebuilt on launch.** The state says the
  open flag is not persisted; the *layout* is a separate question, and the
  library can restore one from storage.

---

## 5. The proof of fit

**Task 6.1**, and the smallest thing that would change this decision:

> A temporary view with **two generic panes**, a `Group` split
> horizontally containing a `Group` split vertically — so the nesting is
> exercised, not just a linear split — a draggable divider, and the
> app's dark theme on both. Written against `src/components/resizable`, in
> a scratch route, and thrown away afterwards.

It answers four questions at once:

1. **Does nesting work inside the app's wrapper?** The wrapper is a
   shadcn component around the library, and a `Group` inside a `Panel` has
   to survive its class names and its `data-panel` attribute.
2. **Do the app's tokens actually style the divider?** The wrapper's
   handle uses `--ring` and `bg-border`; a divider in a panel that has its
   own background may want something else.
3. **Does the layout persist and come back?** The wrapper's
   `useDefaultLayout` writes to `localStorage`; a workspace will want the
   app's own store, and the `storage` option is how.
4. **Does it survive the 600 × 338 floor?** Two nested splits at 300px
   each is the worst case the floor allows, and it is the case that
   decides whether the minimum sizes are right.

**If the nesting does not work**, the fallback is a custom split tree over
the same `workspace-state.ts` — more work, and the reason to find out
now rather than at Task 6.4.

**If the drag proves the library unusable** — and it will not, because the
library does not do dragging — the decision to revisit is Dockview, and the
cost of revisiting is the app's own tree becoming the library's.

---

## 6. What was ruled out, and why

| | Why not |
|---|---|
| **Dockview** | It is tab-centred, and the product says no hidden tab stacks. Its headers and its theming are a second design system. It would take the layout model away from the app, which is the thing Task 1.5 was written to keep |
| **A custom nested split** | The geometry, the resize, the keyboard support, the persistence and the accessibility are all written, tested and themed — in the app's own component library. Writing them again is the work the project already paid for |
| **A grid-only approach** | A `Grid` covers three columns and spans beautifully, but a grid cannot express a pane that is 70% of the width beside one that is 30% and then split vertically, and the plan asks for uneven splits and for the arrangements that are not a fixed set of cells. A grid is a *layout* the workspace can offer as a preset, not the layout model |
