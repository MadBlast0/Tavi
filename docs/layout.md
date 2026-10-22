# The layout

Every element in the app that owns a height or a scrollbar, and which of the
two it owns.

This document describes the app **as it is**. It is the map a new surface is
built from: how tall the work area is, what scrolls and what does not, and
where a pane gets its height. It is not a design document — the design is the
code, and the code is `src/blocks/shell/shell.tsx`.

The numbers here were measured in a browser, not read off the stylesheet.
Where a measurement is given, it is the height of that element in a window of
that size, with the rail in the state named.

---

## 1. The window

| | |
|---|---|
| The floor | 600 × 338 logical pixels |
| The size it opens at | 1030 × 579, which is 16:9 |
| Where it is set | `src-tauri/tauri.conf.json` — `minWidth`, `minHeight`, `width`, `height` |

Logical pixels are density-independent, so the floor is the same apparent size
on every display. A percentage would have been the wrong instrument: it moves
the floor with the monitor, so the same app would be allowed to get smaller on
a small screen than on a large one, which is where the layout needs the room.
The OS resolves the floor against the screen: a display too small even for it
gets a window as small as it can be.

The window is undecorated. The app draws its own caption — the **title bar** —
in the top 28 pixels, over the work area rather than beside it, so that the
colours behind it are the shell's own. That 28 pixels is `--shell-top-bar-h`,
one number, published by the shell and measured against by four things: the
bar itself, the rail's header, the work area's content, and the wall you drag
to resize the rail.

---

## 2. The height chain

The window's height reaches the content through four elements. Each one
either states the height or is measured against the one above it, and the
chain is closed: nothing in it takes its height from its own content.

| Element | Where | Owns | What that means |
|---|---|---|---|
| the window | `tauri.conf.json` | the height | 579 pixels tall when it opens; 338 at the floor |
| the shell wrapper | `components/sidebar/sidebar.tsx` | the floor of the height | `min-h-svh` — at least the window, and it does not clip |
| the rail | `components/sidebar/sidebar.tsx` | neither | 256 pixels wide (200–440), the window's height, and its own list scrolls inside it |
| the title bar | `blocks/shell/title-bar.tsx` | neither | 28 pixels tall, drawn over the work area, and it never moves |
| **the work area** | `blocks/shell/shell.tsx` | **the height** | `h-svh`: the window's height, and it clips what does not fit |
| the surface | `blocks/prompt-input/prompt-block.tsx` | the height, the same one | `h-svh` and `pt-(--shell-top-bar-h)`: its box is the work area's height and its content is the title bar's shorter |
| the conversation | `components/message-scroller/` | the scroll | the region inside the surface that scrolls |
| the composer | `blocks/prompt-input/prompt-block.tsx` | neither | `shrink-0` — it keeps its place at the bottom of the surface |

At 1030 × 579, measured:

| | The rail open | The rail closed |
|---|---|---|
| the shell wrapper | 1030 × 579 | 1030 × 579 |
| the rail | 256 × 579 | off the page, 256 wide |
| the work area | 774 × 579, 40-pixel corner | 1030 × 579, square |
| the title bar | 1030 × 28, over the work area | the same |
| the surface | 774 × 579, 28 of padding at the top, so 551 of content | 1030 × 579, the same 551 |
| the composer | 144 tall, at the bottom of the surface | the same |
| the conversation | everything above the composer | the same |
| the document | 579 tall, and it does not scroll | the same |

The document's height is the window's height in every one of those states, and
in both rail states. **The page does not scroll.** That is the rule the whole
chain exists to keep: the window is not a scroll region, and nothing in it
may make the window taller.

---

## 3. What scrolls, and what does not

| Region | Where | Scrolls |
|---|---|---|
| the page | — | **no** |
| the rail's list | `SidebarContent` | yes, down, and the rail hides the bar |
| the conversation | `MessageScrollerViewport` | yes, down |
| the settings card's nav | `settings-dialog.tsx` | yes, down |
| the settings card's pane | `dialog.tsx` | yes, down |
| the settings card's tab strip | `settings-dialog.tsx` | yes, sideways |
| the model picker | `prompt-controls.tsx` | yes, down, and it is capped |
| the composer's `/` and `@` menus | `prompt-menu.tsx` | yes, down, and it is capped |
| a menu, a context menu, the command palette | `components/dropdown-menu/`, `components/context-menu/`, `components/command/` | yes, and each is capped at the room there is |
| the title bar, the work area, the surface, the composer | — | no |

The rule, in four lines, so that a new region can be built against it:

1. **The window does not scroll.** It is the window's height, and nothing may
   make it taller.
2. **A region that owns content owns its scrolling.** One region, one
   scrollbar, and never one inside another that could have done the job.
3. **A header does not scroll with the content under it.** The title bar, the
   rail's header, a pane's header, a toolbar: they hold still.
4. **What does not fit is cut off, not made reachable by scrolling the
   window.** The work area clips. A region that should have scrolled and did
   not is a bug in that region, and clipping it is what stops the bug from
   becoming a window that scrolls.

A region that scrolls has to say so, and the app already has the two ways:
`overflow-y-auto` for a plain region, and `@/components/scroll-area` where the
scrollbar is meant to be the component's own.

---

## 4. The container a workspace will live in

**The work area** — `WorkArea` in `src/blocks/shell/shell.tsx` — is the
container. It is the region beside the rail, and it is as tall as the window.

It guarantees three things, and a workspace inside it can rely on all three:

| | |
|---|---|
| Its height is the window's height | and it does not grow: it is `h-svh`, not a flex item waiting for its content to say how tall it is |
| It clips | what does not fit inside it is cut off, so nothing in it can reach the edge of the window and push the page |
| Its width is the window's less the rail | `flex-1 min-w-0`, so a pane can be as narrow as it needs to be and the work area gives way rather than the rail |

**How a pane gets a height inside it.** The work area is a column, so the
workspace host is a child of it that takes the height that is there:

```
flex-1 min-h-0
```

`flex-1` takes the height the work area has; `min-h-0` lets the host shrink
below the height of its content, which is what stops a pane with a long file
in it from pushing the window taller. A pane inside the host is then a
column of its own: a header that does not move, and a content region that
scrolls.

**The title bar is over the top of it.** The bar is drawn over the work area's
first 28 pixels, so a host that must not sit under the bar carries
`pt-(--shell-top-bar-h)` — which is what the surface does, and what the
number is published for.

At 1030 × 579 with the rail open, a host in the work area is 774 wide and 579
tall, and with the title bar's 28 pixels taken off the top it has 551 of
content.

---

## 5. The narrow window

The floor is 600 × 338, and the app's narrow layout starts below 768 pixels.
The breakpoint is in the rail's own component — `md:` on the rail and
`(max-width: 767px)` in its script — so at the floor **the rail is a sheet
over the work area** rather than a column beside it, and the work area is the
full 600 pixels wide.

The landing screens fit there. At 600 × 338 the surface has 310 pixels below
the title bar, and the greeting, the composer and the suggestion chips fit in
them with 63 pixels to spare.

The work area still rounds its top-left corner at that width, because the
corner follows the rail's state and not the layout: the rail is a sheet over
the work area there, not a column beside it.

So a pane at that width is in the narrow layout too, and it has to:

- take the width it is given, which may be the whole window, and never ask
  for a minimum width the window cannot give it;
- keep its header's title and its actions from overlapping, with the
  secondary actions moved into the overflow menu rather than dropped;
- truncate long text — a file path, a log line — instead of widening itself;
- scroll its content inside itself, like every other region.

---

## 6. What was changed, and why

One element changed: **the work area**.

| | Before | After |
|---|---|---|
| its height | inherited from the shell's `min-h-svh` — a floor, not a height | `h-svh` — the window's height |
| its overflow | `data-[sidebar-open]:overflow-hidden` — clipped only while the rail was open | `overflow-hidden` — always |

**Why the height.** The work area is a flex item beside the rail, and a flex
item is only as tall as what is put in it. The shell says `min-h-svh`, which
is a floor, so a work area with no height of its own grew with its content,
and the shell grew with it, and the window grew a scrollbar.

Measured, with a host in the work area holding a pane 3000 pixels tall:

| | Before | After |
|---|---|---|
| the work area's height | 3000 | 579 |
| the document's height | 3000 | 579 |
| the page scrolled | **yes** | no |

**Why the clipping is unconditional.** It was conditional because that is when
the corner needs cutting, and cutting the corner is what the rule was for.
Clipping is needed in the other state as well, and the rail is closed on a
first run — so the state a long pane would have met it in was the one where it
did not happen.

**What did not change.** The landing screens. The rendered pixels at
1030 × 579 and at 600 × 338, with the rail open and with it closed, are
byte-for-byte the same before and after: the height chain resolves to the
same numbers, and the only thing that moved is a limit that nothing was
reaching.

---

## 7. Adding a region that scrolls

1. Give it a height that is not its content's: `flex-1 min-h-0` inside a
   column, or `h-full` inside a box that has a height of its own.
2. Put the scrolling on the region that has the content, and on nothing
   above it.
3. A header above it does not move: keep it out of the scrolling region.
4. Code, logs and long lines scroll sideways inside the region rather than
   widening it.
5. Check it in a window of 600 × 338 and of 1030 × 579, with the rail open
   and closed, and check that the document's height is still the window's.
6. `src/lib/layout.test.ts` checks the chain this document describes. A
   change that breaks it fails the test rather than the person who made it.
