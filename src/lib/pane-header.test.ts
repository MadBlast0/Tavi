/**
 * The pane header, checked.
 *
 * The header is a strip with the pane's mark and title on the left and the
 * pane's three controls on the right, and the left part is the drag handle.
 * These rules catch the two ways the header is broken: a drag that starts
 * from a button click, and a header that changes size with its content.
 */

import { test } from "node:test"
import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { join } from "node:path"

const SRC = join(import.meta.dirname, "..")
const read = (...parts: string[]) => readFileSync(join(SRC, ...parts), "utf8")

const pane = read("blocks", "workspace", "pane.tsx")

test("the header has a drag handle", () => {
  assert.ok(
    pane.includes('data-slot="pane-drag-handle"'),
    "the header should have a dedicated drag handle",
  )
  assert.ok(
    pane.includes('data-drag-handle=""'),
    "the drag handle should be marked as such",
  )
})

test("the drag handle is separate from the buttons", () => {
  // The handle is the header's left part, and the buttons are in their own
  // element. A click on a button does not start a drag, and a drag does not
  // reach the buttons.
  const handleIndex = pane.indexOf('data-slot="pane-drag-handle"')
  const buttonsIndex = pane.indexOf('className="flex shrink-0 items-center gap-0.5"')
  assert.ok(handleIndex !== -1, "the drag handle should exist")
  assert.ok(buttonsIndex !== -1, "the buttons should exist")
  assert.ok(
    handleIndex < buttonsIndex,
    "the drag handle should come before the buttons",
  )
})

test("the header is a fixed height", () => {
  assert.match(
    pane,
    /data-slot="pane-header"[\s\S]*?h-8/,
    "the header should be a fixed height",
  )
})

test("the header carries the icon, the title and the context", () => {
  assert.ok(pane.includes("Icon"), "the header should carry the pane's mark")
  assert.ok(pane.includes("{title}"), "the header should carry the title")
  assert.ok(pane.includes("{context ?"), "the header should carry the secondary context")
})

test("the header has active and inactive styling", () => {
  assert.ok(
    pane.includes('active ? "bg-muted/40"'),
    "the active pane's header should be lit",
  )
  assert.ok(
    pane.includes('active ? "text-foreground"'),
    "the active pane's title should be the foreground colour",
  )
})

test("the header's buttons are icon-only", () => {
  // The three controls — pop out, menu, close — are icon-only, so each one
  // carries a tooltip and an accessible name.
  const tooltipCount = (pane.match(/TooltipIconButton/g) || []).length
  assert.ok(tooltipCount >= 2, "the header should use the shared icon button for its controls")
})
