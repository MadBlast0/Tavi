/**
 * The pane actions and overflow menu, checked.
 *
 * The pane's controls are consistent: the three icon buttons on the header
 * and the overflow menu behind the chevron. These rules catch the two ways
 * that consistency is broken: a control that is not an icon-only button,
 * and an action that is offered when it cannot work.
 */

import { test } from "node:test"
import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { join } from "node:path"

const SRC = join(import.meta.dirname, "..")
const read = (...parts: string[]) =>
  // Normalised, so a check for a run of source lines does not depend on
  // whether this checkout wrote them with CRLF or LF.
  readFileSync(join(SRC, ...parts), "utf8").replace(/\r\n/g, "\n")

const pane = read("blocks", "workspace", "pane.tsx")

test("pop-out is available from the pane overflow when supported", () => {
  assert.ok(pane.includes("onPopOut={onPopOut}"), "the pane menu should receive the pop-out action")
  assert.ok(pane.includes("Pop out"), "the pane menu should name the pop-out action")
  assert.ok(pane.includes("disabled={!popOutAvailable}"), "unavailable pop-out should be disabled")
})

test("moving a pane to another tab group is keyboard reachable from its menu", () => {
  assert.ok(pane.includes("DropdownMenuSubTrigger"), "the move action should use the menu's keyboard-operable submenu")
  assert.ok(pane.includes('Move into pane'), "the submenu should have a short, clear label")
  assert.ok(pane.includes("moveTargets.map"), "other panes should be listed as destinations")
  const layout = read("blocks", "workspace", "workspace-layout.tsx")
  assert.ok(layout.includes('dockPane(pane.id, targetId, "center")'), "choosing a destination should dock this pane as a tab")
})

test("the pane has a close control", () => {
  assert.ok(
    pane.includes('tooltip="Close"'),
    "the pane should have a close control with a tooltip",
  )
})

test("the pane has an overflow menu", () => {
  assert.ok(
    pane.includes("DropdownMenu"),
    "the pane should use the shared dropdown menu",
  )
  assert.ok(
    pane.includes('aria-label="Pane menu"'),
    "the overflow menu trigger should have an accessible label",
  )
})

test("the pane's close action is destructive", () => {
  assert.ok(
    pane.includes('variant="destructive"'),
    "closing a pane should look destructive",
  )
})

test("the pane's actions are conditional", () => {
  // Split and focus are offered only when their callbacks are provided, so
  // a pane that cannot split or focus does not pretend it can.
  assert.ok(
    pane.includes("onSplit ?"),
    "split actions should be conditional on the callback",
  )
  assert.ok(
    pane.includes("onFocus ?"),
    "focus action should be conditional on the callback",
  )
})

test("the pane's actions do not start a drag", () => {
  // The full header is a drag surface, but nested controls suppress drag start.
  assert.ok(
    pane.includes('data-slot="pane-header"'),
    "the pane should expose its header as a drag surface",
  )
  assert.ok(
    pane.includes("closest(\"button, input, textarea, select, a, [role='menuitem']\")"),
    "interactive controls should not start pane drags",
  )
})
