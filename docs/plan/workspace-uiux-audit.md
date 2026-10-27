# Dockable workspace UI/UX audit

**Date:** 2026-10-27
**Scope:** the workspace shipped under `src/blocks/workspace/`, its layout store, and the app integration in `src/blocks/prompt-input/prompt-block.tsx` and `src/blocks/shell/sidebar-nav.tsx`.
**Baseline:** `docs/plan/ui-ux-plan.md` §1.8, §1.9, §4.3, §4.3.1, `docs/plan/ui-ux-handoff.md`, `docs/plan/ui-ux-research.md`, and the newer `docs/plan/claude-desktop-workspace-reference.md`.
**Method:** read the plan and the code, ran the app at `1189×800`, `800×600`, and `589×338` with seeded layouts, and checked the DOM/state readbacks. `pnpm typecheck` is clean.
**No source files were changed.**

The pane *frame* is mostly right: flat regions, hairline separators, fixed header, independent content scroll, and per-pane composers for bound sessions. The failures are in **what a pane is allowed to render**, **chrome that should not exist**, **the header action model**, and **state transitions when panes are docked, focused, or resized**. The plan tracker overstates completion: 4.3, 5.2, 7.5, 7.6, 8.4 and 8.5 all claim done or near-done while the defects below are reproducible.

## Counts

| Severity | Count | Meaning |
|---|---:|---|
| P0 | 4 | Wrong surface or visually broken at a supported size; fix before polish |
| P1 | 7 | Interaction/state defect; the control exists but behaves incorrectly |
| P2 | 9 | Polish, performance, accessibility, or QA gap |
| **Total** | **20** | |

## Decision on the pane-header conflict

The plan and the research disagree. `ui-ux-plan.md` §4.3.1 and Tasks 4.1/4.2 say the same three controls in every pane, in this order: **pop out, chevron menu, close**. The later review notes (plan lines 2470 and 2476; `claude-desktop-workspace-reference.md` §3 and §10) say maximize and pop-out were consolidated into the overflow and only move at narrow widths.

**Position taken by this audit:** at normal pane width, show **pop out, chevron, close** directly. Below a compact threshold (or in the browser build where pop-out cannot work), fold pop-out into the chevron. Maximize, move, and split stay in the chevron at all widths. Never bury the pane's own actions under a second "More views → Pane actions" level. This satisfies §4.3.1 at normal width and the research's narrow-overflow intent without making the pane menu a maze.

---

## P0 — visual correctness / wrong surface

**WS-01 · Session pane routing · P0 · Forge**
- Files: `src/blocks/workspace/workspace-layout.tsx` (77–116, especially 113), `src/blocks/prompt-input/prompt-block.tsx` (2169–2196, 2473–2506)
- Problem: a chat/code-session pane with no `context.sessionId` renders `sessionContent`, which is the app's entire root `<main>` — landing heading, provider row, starter chips, and the root composer. That is what every **New** session starts as, and what an unbound pane shows after reload. In the live app at `1189×800`, an unbound Code Session pane showed “What can I help with?”, the root composer, and “Ask anything”; at `800×600` the same pane showed the *Chat* copy inside a code pane. The first saved message does bind the pane through the `activeBySide` effect, but until then the pane is a full landing page rather than a pane-sized start surface, and at `589×338` that page clips inside the pane.
- Expected: every chat/code pane is a session surface. Unbound means a pane-sized empty state (“Start a session” / “Open a conversation”), never the root landing or the root conversation. The root landing remains only for `panes.length === 0`.

**WS-02 · QA scaffolding in product panes · P0 · Forge**
- Files: `src/blocks/workspace/panes/sample-pane.tsx` (59–65), `src/blocks/workspace/panes/diff-viewer-pane.tsx` (89, 95–96)
- Problem: every sample tool pane carries a permanent strip reading “Sample preview · local UI state only…” plus a **State** `<select>` exposing `content / empty / loading / error / unavailable / long`. The Diff pane has a separate copy of the same strip and select. This is test-harness chrome, it repeats in every pane, and at short heights it takes the space the content needs.
- Expected: no sample/state selector in the product UI. Keep sample content labelled once, inside the content, or hide the harness behind a development flag. Real empty/loading/error/unavailable states must still exist when a real operation produces them.

**WS-03 · Pane header action model · P0 · Forge**
- Files: `src/blocks/workspace/pane.tsx` (168–177), `src/blocks/workspace/views-picker.tsx` (48–57)
- Problem: the header is `grip → icon/title → views → chevron → close`. There is no direct pop-out. For a code-session pane the *pane's own* actions (focus, maximize, pop out, move, split, close) are nested under `More views → Pane actions`, while a second close sits in the views menu. For tool panes, pop-out is only inside the chevron. The visual result does not match §4.3.1 and makes maximize/pop-out hard to find.
- Expected: the §4.3.1 order at normal width — **pop out, chevron, close** — with maximize/move/split in the chevron. On narrow panes or in the browser build, fold pop-out into the chevron. Do not nest pane actions under the views menu, and do not show two close controls in the same header.

**WS-04 · Diff pane ignores its own width · P0 · Forge**
- Files: `src/blocks/workspace/panes/diff-viewer-pane.tsx` (90–118)
- Problem: the diff layout switches on **viewport** breakpoints (`sm:flex-row`, `sm:w-64`, `max-h-40`), not pane width. At an `800×600` window with two 400px panes, the file rail still takes 256px, leaving roughly 150px for code. The code column is clipped to a few characters with a horizontal scrollbar, the selected-file header truncates to “sr…”, and “Mark reviewed” drops onto its own line. The toolbar wraps into two rows and has two `ms-auto` items competing for the right edge.
- Expected: container-query the pane (it already has `@container/pane`). Below a usable width, collapse the file rail to a compact picker/summary, keep the toolbar on one row with icon controls, and give the code column the remaining width without clipping the file identity. The full file rail returns only when the pane can hold both columns.

---

## P1 — interaction and state

**WS-05 · Docked pane is not activated · P1 · Forge**
- Files: `src/lib/workspace-state.ts` (609–661, 924–935), `src/blocks/workspace/layout/layout-tree.tsx` (424–436), `src/blocks/workspace/workspace-layout.tsx` (144–165, 201–216)
- Problem: dropping a pane on another pane's centre appends it as a tab but leaves the target's `activeTabId` unchanged and does not update `activePaneId`. The pane the user just dragged disappears behind the existing tab. A split drop likewise leaves focus wherever it was.
- Expected: the moved pane becomes the active tab and the focused pane after any successful dock. The drop target clears, and the pane is visible where it landed.

**WS-06 · Focus can point at a hidden tab · P1 · Forge**
- Files: `src/blocks/prompt-input/prompt-block.tsx` (1304–1315), `src/blocks/shell/sidebar-nav.tsx` (437–441), `src/lib/workspace-state.ts` (954–967)
- Problem: `openThread` and the sidebar's “open beside” both find an existing pane and call `setActivePane` without `setActiveTab`. If that pane is an inactive tab in a group, `activePaneId` names a pane nobody can see; no header is lit and the visible pane stays inactive.
- Expected: focusing a pane that lives in a tab group activates its tab in the same transition. `setActivePane` should either do this itself or the callers must pair the two calls.

**WS-07 · Cross-group tab drag silently fails · P1 · Forge**
- Files: `src/blocks/workspace/layout/layout-tree.tsx` (424–436), `src/blocks/workspace/workspace-layout.tsx` (414–417), `src/lib/workspace-state.ts` (969–984)
- Problem: a tab dropped on a tab in another group calls `reorderTab`, which returns `false` when the groups differ. Neither the HTML nor the native path has a dock fallback for `kind: "tab"`, so the gesture does nothing.
- Expected: same-group tab drop reorders; cross-group tab drop joins the target group as a tab and activates it.

**WS-08 · Session drop on a tab strip is a dead target · P1 · Forge**
- Files: `src/blocks/workspace/layout/layout-tree.tsx` (419–437)
- Problem: the tab container accepts session drags in `onDragOver` but its `onDrop` only handles `application/x-tavi-tab` and `application/x-tavi-pane`. The cursor says “droppable”; the drop is silently ignored. The HTML path also gives no target highlight (the highlight class is wired to the native attribute only).
- Expected: a session dropped on a tab opens in that group (new pane in the group, or binds the target session pane), or is rejected before the drop with no droppable cursor. Show the same target preview as a pane centre drop.

**WS-09 · Header actions do not focus their pane · P1 · Forge**
- Files: `src/blocks/workspace/pane.tsx` (116–122, 168–177), `src/blocks/workspace/views-picker.tsx` (31–35), `src/lib/workspace-state.ts` (825–829)
- Problem: the pane's pointer handler deliberately ignores buttons, so clicking a header menu or a quick launcher does not make that pane active. `ViewsPicker.add` calls `addPane`, which docks beside the *global* `activePaneId`. Add Terminal from an inactive pane's header and the new Terminal opens beside the previously focused pane, not the pane whose button was clicked. Maximizing from an inactive pane's menu leaves `activePaneId` behind.
- Expected: interacting with a pane header makes that pane active, and the action targets that pane. `addPane` should accept an explicit anchor pane instead of relying on global focus.

**WS-10 · Pop-out window chrome and action parity · P1 · Forge**
- Files: `src/blocks/workspace/pane-window.tsx` (136–163), `src/blocks/workspace/workspace-layout.tsx` (48–50)
- Problem: a popped-out tool pane shows a 40px “Popped out · title” bar with dock-target/position selects *above* the pane's own 32px header. The pane header's close button is labelled “Close” but its callback is `onDockBack`; the placeholder pane in the main window has the same mislabelled close. The child session pane loses its Terminal/Changes/Browser/Files launchers, and non-session child panes lose split/maximize/pop-out because the child action object only supplies close/focus.
- Expected: one header per window. Keep the pane header and its launchers, put dock-back in the chevron or a window control, label close truthfully, and give the child the same action set as the docked pane.

**WS-11 · Focus treatment is not legible · P1 · Forge**
- Files: `src/blocks/workspace/pane.tsx` (112–114, 143–145), `src/blocks/workspace/layout/layout-tree.tsx` (343)
- Problem: an inactive pane is `opacity-[.92]` (an 8% change) over its entire content, while the active header is only `bg-muted/40`. In the live two-pane capture the focused and unfocused headers are nearly indistinguishable. The dimming is applied to content and controls rather than to the pane as a state.
- Expected: an unmistakable lit/dimmed distinction — active title/foreground and header, inactive title/muted content — with the divider beside the focused pane the strongest. Do not reduce the opacity of usable controls.

---

## P2 — polish, performance, accessibility, QA

**WS-12 · Stacked chrome and tab styling · P2 · Forge**
- Files: `src/blocks/workspace/layout/layout-tree.tsx` (400–405, 446–455, 504–509)
- Problem: a tabbed group spends 32px on the tab strip plus 32px on the pane header; with the sample strip (WS-02) and a diff toolbar that is 64–96px before content. At `589×338` the remaining content is tiny. The active tab is a rounded-top card, which reads as a different surface language from the flat pane.
- Expected: one compact chrome band where possible; tabs rectangular or integrated into the header; content gets the saved height. This becomes substantially easier after WS-02 removes the QA strip.

**WS-13 · Layout reflows on status notices · P2 · Forge**
- Files: `src/blocks/workspace/workspace-layout.tsx` (508)
- Problem: `notice` renders a paragraph above the layout tree, so a refused drop or pop-out error pushes every pane down and changes pane height.
- Expected: status appears as a transient overlay/toast or inside the affected pane header; the layout geometry never moves.

**WS-14 · Resize and persistence churn · P2 · Forge**
- Files: `src/blocks/workspace/layout/layout-tree.tsx` (153–167, 242–283), `src/blocks/workspace/workspace-layout.tsx` (306–309), `src/lib/workspace-state.ts` (944–952)
- Problem: split dragging calls `updateLayout` on every pointer move, which publishes the whole workspace; the persistence effect then serializes and writes `localStorage` on every snapshot. The comments describe a local drag value committed at drag end, but `onDragEnd` is a no-op and the local `ratio` is overwritten by the tree each move. The persistence effect also fires on every pane-local keystroke even when the serialized layout is unchanged.
- Expected: local ratio during the drag, one `updateLayout` on pointer-up, and a storage write only when the serialized workspace string changes. Pane-local state changes should not rewrite the layout.

**WS-15 · Focus restoration after closing a pane · P2 · Forge**
- Files: `src/blocks/workspace/workspace-layout.tsx` (436–444), `src/lib/workspace-state.ts` (837–852)
- Problem: when the closed pane was the last one in its split, `removePane` sets `activePaneId` to null and focus goes to the generic workspace region even though other panes remain.
- Expected: focus moves to the next visible pane, or the workspace region only when no panes remain.

**WS-16 · No keyboard route for pane actions · P2 · Forge (decision: Tavi)**
- Files: `src/blocks/workspace/pane.tsx` (189–289), `src/blocks/workspace/layout/layout-tree.tsx` (285–309, 498–503)
- Problem: splitters and tabs have keyboard support, but close/maximize/pop-out/move require tabbing to a menu, and there is no close-focused-pane shortcut. Claude Desktop documents `Ctrl+\`, `Ctrl+Shift+D`, `Ctrl+Shift+B`, and `` Ctrl+` ``. The plan says not to invent conflicting global shortcuts, so this needs a product decision, not a blind port.
- Expected: decide which reference shortcuts Tavi adopts; at minimum make close-focused-pane and focus cycling reachable without a pointer, and document the conflict check.
- Decision (WS-16): adopted `Ctrl+\` (close focused pane), `` Ctrl+` `` (Terminal), `Ctrl+Shift+B` (Browser), `Ctrl+Shift+D` (Diff), and `F6`/`Shift+F6` (pane focus cycle). Dictation moved to `Ctrl+Shift+M` to clear the only hard collision. A view toggle focuses an existing pane or opens one; it never closes an open pane. Split, pop-out, maximize, add-view and reset stay shortcut-free because Claude documents none. Implementation and conflict table: `docs/plan/claude-desktop-shortcuts.md` §5; code: `src/blocks/workspace/workspace-shortcuts.ts`.

**WS-17 · Active-pane and tab semantics · P2 · Forge**
- Files: `src/blocks/workspace/pane.tsx` (107–123), `src/blocks/workspace/layout/layout-tree.tsx` (419–441, 466–513)
- Problem: the active pane is not exposed to assistive technology (`aria-current`/`aria-selected` on the pane), every tab close button is independently tabbable, and a popped-out placeholder's close is announced as “Close” while it docks back.
- Expected: expose the focused pane, use roving focus for tab close controls or take them out of the tab order until the tab is active, and keep labels truthful.

**WS-18 · Workspace tests assert source strings, not behavior · P2 · Sentinel**
- Files: `src/lib/workspace-accessibility.test.ts`, `src/lib/workspace-drag.test.ts`, `src/lib/workspace-host.test.ts`
- Problem: the checks look for substrings in `.tsx` source. They cannot catch the hidden-tab focus path, the cross-group tab no-op, the wrong add-view anchor, or the diff pane's viewport-vs-container breakpoint. All of those exist while the suite is green.
- Expected: behavioral tests for the store transitions (dock activates, focus activates the tab, cross-group drop joins), plus one DOM/render test for narrow diff layout. Keep the string checks only where they guard a documented invariant.

**WS-19 · Duplicate session renderers · P2 · Forge**
- Files: `src/blocks/workspace/pane-registry.tsx` (107–108), `src/blocks/workspace/panes/chat-pane.tsx`, `src/blocks/workspace/panes/code-session-pane.tsx`
- Problem: `renderPane` handles every chat/code-session pane before the registry is consulted, so `ChatPane` and `CodeSessionPane` are unreachable in the app. They contain sample conversations and their own `Pane` frames, which will drift from the real session path and mislead the next change.
- Expected: one session renderer. Delete the dead sample components and their checks, or make the registry the only session path.

**WS-20 · Maximize state is invisible and transient · P2 · Forge**
- Files: `src/blocks/workspace/workspace-layout.tsx` (244, 431, 476–478), `src/blocks/workspace/pane.tsx` (259)
- Problem: maximize is local React state, is shown only as the word “Restore” inside the chevron, resets on reload, and the header has no restore affordance. A maximized pane looks like the only pane in the workspace.
- Expected: show a visible restore control or header state while maximized; decide whether maximize is persisted, and say so in the plan.
- Decision (P2 batch B): maximize stays **session-local** and is not persisted. A reload returns to the saved split arrangement; the maximized pane's header carries a visible **Restore pane** control.

---

## Top three to fix first

1. **WS-01 — stop rendering the root landing/conversation inside an unbound session pane, and give a New session a pane-sized start surface.** This is the largest “nothing like Claude Desktop” signal and it leaks the root composer into a pane.
2. **WS-02 — remove the sample-preview/state-selector chrome from every tool pane.** It is the dominant visual noise in Diff, Terminal, Browser, Files, and the rest, and it steals height at the supported floor.
3. **WS-03 — restore the §4.3.1 header order (pop out, chevron, close) and stop nesting pane actions under More views.** This is the most visible per-pane control regression.

WS-04 is the immediate follow-up: the Diff pane is visibly broken in a normal 400px pane at an 800px window, which is a supported layout, not an edge case.

## What already matches the reference (do not regress)

- §1.8: the workspace is the content region; there is no Workspace rail row; the landing screen is the zero-pane state; the region is always present (`workspace-host.tsx`, `workspace-layout.tsx` 482–506).
- §1.9: there is no separate full-width workspace toolbar; view launchers live in the session pane header.
- §4.3.1: panes are flat with no card, radius, or shadow; separators are hairlines; the header is a fixed 32px strip; content clips and scrolls independently; a bound session pane does carry its own embedded composer (`workspace-layout.tsx` 82–88).
- The six-pane cap, validated versioned persistence, splitter ARIA/keyboard movement, and tab ARIA/tab-key basics are in place.

## Suggested Forge slices (single concern each)

| Slice | Issues | Files | Outcome |
|---|---|---|---|
| F1 | WS-01 | `workspace-layout.tsx` | Unbound session panes show a pane empty state, not root children |
| F2 | WS-02 | `sample-pane.tsx`, `diff-viewer-pane.tsx` | Sample/state chrome removed; content labelled once or behind a dev flag |
| F3 | WS-03 | `pane.tsx`, `views-picker.tsx` | Header action order and pane-action menu corrected |
| F4 | WS-04 | `diff-viewer-pane.tsx` | Container-query diff layout at narrow pane widths (after F2) |
| F5 | WS-05/06/07 | `workspace-state.ts`, `layout-tree.tsx`, `prompt-block.tsx`, `sidebar-nav.tsx` | Dock activates; focus activates the tab; tab drag crosses groups |
| F6 | WS-09 | `pane.tsx`, `views-picker.tsx`, `workspace-state.ts` | Header interaction focuses the pane; add-view anchors to that pane |
| F7 | WS-10/11 | `pane-window.tsx`, `workspace-layout.tsx`, `pane.tsx` | Pop-out parity; legible lit/dimmed focus |

Keep F5 split into separate commits if Forge's context is tight: dock activation, atomic focus, and cross-group tab drop are three independent behaviors.

## Sentinel QA matrix

1. Start a New chat and a New session: the pane must show a pane-sized start state immediately, not the root landing. Send a message, then reload; the pane must reopen bound to the saved conversation.
2. Two session panes side by side, both streaming and idle: click headers, click content, switch sidebar sessions. Focus must follow visibly, and a hidden tab must never hold focus.
3. Dock a pane on a pane centre, on each edge, and onto a tab in another group. The moved pane must be visible and focused every time; cancel a drag with Escape.
4. Drag a session from the rail onto a pane, a tab strip, and the empty workspace. All accepted targets must do what the cursor promises; refused targets must not show a droppable cursor.
5. Diff pane inside 400px, 300px, and 240px pane widths at `1189×800`, `800×600`, `600×338`, and `480×320`. No clipped file identity, no toolbar collision, no page scrollbar.
6. Pop out a terminal and a session; verify one header only, launchers/actions present, close and dock-back labelled correctly, dock back at the saved target.
7. Keyboard: tab to every header control, menu, splitter, and tab; close a tab with Delete; resize with arrows/Home/End; confirm the focused pane is announced.
8. Run `pnpm typecheck`, `pnpm test`, and `pnpm build`; report all three, not just typecheck.

## Evidence

- Code: line references above; `pnpm typecheck` → `tsc --noEmit`, clean.
- Live `1189×800`, three panes: unbound Code Session pane rendered the root landing (“What can I help with?”) with the root composer; Diff showed the sample strip, wrapped toolbar, and a file rail wider than the code column; Terminal showed a second sample strip and State select.
- Live `800×600`, Code Session + Diff at 50/50: Diff file rail 256px, code column ≈150px, selected-file title truncated to “sr…”, toolbar wrapped, horizontal scrollbar.
- Live `589×338`, three panes: landing content clipped inside the pane; Diff and Terminal each lost height to repeated strips; first pane's title and actions remained but content was not usable.
- Group seed at `800×600`: 32px tab strip plus 32px pane header before content; active tab styled as a rounded card.
- Limitation: the Claude Desktop screenshot referenced in the research is not in this checkout, so this audit compares code and live behavior against the documented reference, not a pixel diff.
