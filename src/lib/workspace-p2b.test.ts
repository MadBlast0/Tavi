/**
 * The P2 batch B workspace work, checked at its source.
 *
 * Four rules, one for each audit item in this batch:
 *
 * - closing a pane returns focus to a pane the reader can see, and the
 *   group's showing tab follows the focused pane;
 * - the focused pane is exposed to assistive technology, and a tab's close
 *   control only joins the tab order when its tab is active;
 * - chat and code-session panes have one session renderer, not a sample
 *   renderer beside it;
 * - a maximized pane shows a visible restore control, and maximize is a
 *   session-local view mode rather than saved layout state.
 */

import { test } from "node:test"
import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { join } from "node:path"

const SRC = join(import.meta.dirname, "..")
const read = (...parts: string[]) => readFileSync(join(SRC, ...parts), "utf8")

const state = read("lib", "workspace-state.ts")
const tree = read("blocks", "workspace", "layout", "layout-tree.tsx")
const layout = read("blocks", "workspace", "workspace-layout.tsx")
const pane = read("blocks", "workspace", "pane.tsx")
const registry = read("blocks", "workspace", "pane-registry.tsx")

test("closing a pane chooses a visible survivor and keeps the showing tab in step", () => {
  assert.ok(state.includes("export const visiblePaneIds"), "the state should know which panes a reader can see")
  assert.ok(state.includes("const nextTab = oldGroup?.tabs.slice(groupIndex + 1).find(survives)"), "a group's next tab is the nearest survivor")
  assert.ok(state.includes("const previousTab = oldGroup"), "a group's previous tab is the fallback when there is no next tab")
  assert.ok(state.includes("const fallback = nextTab ?? previousTab ?? nextVisible ?? previousVisible"), "a non-group pane uses visible tree order")
  assert.ok(state.includes("layout = showTab(layout, group.groupId, activePaneId)"), "the focused pane and the showing tab should agree")
})

test("closing from the tab strip uses the one workspace close handler", () => {
  assert.ok(tree.includes("const closeTab = (paneId: string) => closePane(paneId)"))
  assert.ok(!tree.includes("removePane(paneId)"), "the tab strip should not keep a second close path")
  assert.ok(layout.includes("closePane: handleClosePane"))
  assert.ok(layout.includes("if (snapshot.panes.length === 0)"), "only the last pane's close sends focus to the workspace region")
  assert.ok(layout.includes("(paneTitle ?? paneTab)?.focus()"))
})

test("the focused pane is current and tab close controls are roving", () => {
  assert.ok(pane.includes('role="region"'), "a pane should be a named region")
  assert.ok(pane.includes('aria-label={`${title} pane`}'), "the region should be named by its title")
  assert.ok(pane.includes('aria-current={active ? "true" : undefined}'), "the focused pane should be current")
  assert.ok(tree.includes("tabIndex={isActive ? 0 : -1}"), "a background tab's close control should be out of the tab order")
})

test("a popped-out placeholder labels dock back as dock back", () => {
  const placeholder = layout.slice(layout.indexOf("if (poppedOut) {"), layout.indexOf("const createdActions = {"))
  assert.ok(placeholder.includes("onDockBack={() => onDockBack(pane.id)}"))
  assert.ok(!placeholder.includes("onClose="), "the placeholder must not label dock back as close")
})

test("the registry has no second session renderer", () => {
  assert.ok(registry.includes('if (type.id === "chat" || type.id === "code-session") return null'))
  assert.ok(!registry.includes("ChatPane") && !registry.includes("CodeSessionPane"))
})

test("a maximized pane shows a restore control and the mode is session-local", () => {
  assert.ok(pane.includes("maximized && onMaximize"), "the restore control should appear in the header while maximized")
  assert.ok(pane.includes('tooltip="Restore pane"'), "the restore control should name what it does")
  assert.ok(pane.includes("Minimize2Icon"))
  assert.ok(pane.includes('data-maximized={maximized ? "" : undefined}'))
  assert.ok(layout.includes("It is deliberately session-local and is not saved"), "the persistence decision should be documented next to the state")
})
