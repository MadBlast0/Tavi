/**
 * The workspace's own keyboard routes.
 *
 * The reference documents four pane shortcuts and one pane-focus gesture:
 * close the focused pane, show the terminal, show the browser, show the diff,
 * and move focus between panes. The first four are adopted here; the last is
 * Tavi's own `F6`/`Shift+F6` because the reference's session switcher already
 * owns the bracket keys.
 *
 * The table is plain data and the matching is a pure function so the bindings
 * can be checked without a browser. `WorkspaceLayout` is the only place that
 * executes the intents; a pane window has no arrangement to rearrange.
 *
 * "Toggle" means **focus an existing pane of that type, or open one when none
 * exists**. It deliberately does not close a pane that is already open: the
 * same key would then discard the pane's state, and closing is what `Ctrl+\`
 * is for. The reference's toggles behave the same way from the reader's side —
 * the pane they already have comes back into view rather than being rebuilt.
 *
 * ## Conflict check
 *
 * - `Ctrl+\` / `Cmd+\`: no Tavi binding before this file. Safe.
 * - `Ctrl+``: no Tavi binding. Safe. (Control-Backquote on both platforms,
 *   matching the reference; it is not `Cmd+`` on macOS.)
 * - `Ctrl+Shift+B` / `Cmd+Shift+B`: Tavi's sidebar is `Ctrl+B` / `Cmd+B`,
 *   without Shift, and it stays that way. Different modifier and target.
 * - `Ctrl+Shift+D` / `Cmd+Shift+D`: dictation used to default to
 *   `Ctrl+Shift+D`. Its default moved to `Ctrl+Shift+M` in
 *   `src/blocks/prompt-input/prompt-controls.tsx`, which is what makes this
 *   binding safe. `Ctrl+Shift+M` is Claude's model-menu shortcut but Tavi has
 *   no model menu, so it is free here.
 * - `F6` / `Shift+F6`: no Tavi binding. The reference's next/previous session
 *   uses the bracket keys, so F6 keeps the two apart.
 *
 * Split, pop-out, maximize, add-view and reset have no reference shortcut and
 * none is invented here; they stay on the pane header and menu.
 */
import { matchesHotkey } from "../../lib/hotkey.ts"

/** The bindings this workspace answers to, in one place for the menu hints and the tests. */
export const WORKSPACE_SHORTCUTS = {
  closePane: "mod+\\",
  toggleTerminal: "ctrl+`",
  toggleBrowser: "mod+shift+b",
  toggleDiff: "mod+shift+d",
  nextPane: "f6",
  previousPane: "shift+f6",
} as const

/** What a key press asks the workspace to do. */
export type WorkspaceShortcutIntent =
  | { kind: "close-pane" }
  | { kind: "toggle-pane"; paneType: "terminal" | "browser" | "diff" }
  | { kind: "cycle-pane"; direction: 1 | -1 }

/**
 * The action a key press asks for, or null when it is not one of ours.
 *
 * The caller still decides whether the workspace is enabled and whether an
 * overlay owns the keystroke; this only answers the binding question.
 */
export function workspaceShortcutIntent(event: KeyboardEvent): WorkspaceShortcutIntent | null {
  if (matchesHotkey(event, WORKSPACE_SHORTCUTS.closePane)) return { kind: "close-pane" }
  if (matchesHotkey(event, WORKSPACE_SHORTCUTS.toggleTerminal)) return { kind: "toggle-pane", paneType: "terminal" }
  if (matchesHotkey(event, WORKSPACE_SHORTCUTS.toggleBrowser)) return { kind: "toggle-pane", paneType: "browser" }
  if (matchesHotkey(event, WORKSPACE_SHORTCUTS.toggleDiff)) return { kind: "toggle-pane", paneType: "diff" }
  if (matchesHotkey(event, WORKSPACE_SHORTCUTS.nextPane)) return { kind: "cycle-pane", direction: 1 }
  if (matchesHotkey(event, WORKSPACE_SHORTCUTS.previousPane)) return { kind: "cycle-pane", direction: -1 }
  return null
}

/**
 * The next pane to focus in tree order.
 *
 * Only visible panes are candidates: a tab hidden behind another tab has no
 * rendered surface to receive focus. `null` means "nothing is focused yet",
 * so the first press starts at the first (or last, backwards) pane rather
 * than skipping one.
 */
export function nextPaneId(
  visibleIds: readonly string[],
  activePaneId: string | null,
  direction: 1 | -1,
): string | null {
  if (visibleIds.length === 0) return null
  const index = activePaneId === null ? -1 : visibleIds.indexOf(activePaneId)
  if (index < 0) return direction === 1 ? visibleIds[0] : visibleIds[visibleIds.length - 1]
  return visibleIds[(index + direction + visibleIds.length) % visibleIds.length]
}

/**
 * The pane a type toggle should focus, or null when that type is not open.
 *
 * The focused pane wins when it is already the requested type, so pressing the
 * shortcut twice leaves the reader where they are. Otherwise the first visible
 * instance wins, and an instance hidden behind another tab is still found so
 * the toggle can bring it forward.
 */
export function paneForToggle<T extends { id: string; type: string }>(
  panes: readonly T[],
  type: string,
  activePaneId: string | null,
  visibleIds: readonly string[],
): string | null {
  const matching = panes.filter((pane) => pane.type === type)
  if (matching.length === 0) return null
  if (activePaneId !== null && matching.some((pane) => pane.id === activePaneId)) return activePaneId
  for (const id of visibleIds) {
    if (matching.some((pane) => pane.id === id)) return id
  }
  return matching[0].id
}

/**
 * Whether an open overlay or menu owns the keyboard.
 *
 * A dialog or a menu is a temporary surface above the workspace; changing the
 * arrangement underneath it would move the surface's anchor and steal the
 * keystroke from the thing the reader is actually using.
 */
export function isWorkspaceShortcutBlocked(target: EventTarget | null): boolean {
  if (typeof document === "undefined") return false
  if (target instanceof Element && target.closest('[role="menu"], [role="listbox"], [data-slot="dialog-content"], [data-slot="alert-dialog-content"]')) {
    return true
  }
  return document.querySelector('[data-slot="dialog-content"][data-open], [data-slot="alert-dialog-content"][data-open], [role="alertdialog"][data-open]') !== null
}
