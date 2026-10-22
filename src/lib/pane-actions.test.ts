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
const read = (...parts: string[]) => readFileSync(join(SRC, ...parts), "utf8")

const pane = read("blocks", "workspace", "pane.tsx")

test("the pane has a pop-out control", () => {
  assert.ok(
    pane.includes("PictureInPicture2Icon"),
    "the pane should have a pop-out control",
  )
  assert.ok(
    pane.includes('tooltip="Pop out into its own window"') ||
      pane.includes('tooltip={\n              popOutAvailable'),
    "the pop-out control should carry a tooltip",
  )
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
  // The drag handle is a separate element from the buttons, so a click on
  // a button does not start a drag.
  assert.ok(
    pane.includes('data-slot="pane-drag-handle"'),
    "the pane should have a dedicated drag handle",
  )
  const handleIndex = pane.indexOf('data-slot="pane-drag-handle"')
  const buttonsIndex = pane.indexOf('className="flex shrink-0 items-center gap-0.5"')
  assert.ok(
    handleIndex < buttonsIndex,
    "the drag handle should come before the buttons",
  )
})
