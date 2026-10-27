import { test } from "node:test"
import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { join } from "node:path"

const SRC = join(import.meta.dirname, "..")
const read = (...parts: string[]) => readFileSync(join(SRC, ...parts), "utf8")
const pane = read("blocks", "workspace", "pane.tsx")

test("the full pane header is draggable and interactive controls opt out", () => {
  assert.match(pane, /data-slot="pane-header"[\s\S]*?draggable=\{Boolean\(id\)\}/)
  assert.match(pane, /data-drag-handle=""/)
  assert.match(pane, /closest\("button, input, textarea, select, a, \[role='menuitem'\]"\)/)
})

test("the header is fixed height and carries icon, title and context", () => {
  assert.match(pane, /data-slot="pane-header"[\s\S]*?h-8/)
  assert.ok(pane.includes("Icon"))
  assert.ok(pane.includes("{title}"))
  assert.ok(pane.includes("{context ?"))
})

test("the title bar keeps focused state styling and compact view actions", () => {
  assert.ok(pane.includes('active ? "border-border bg-muted" : "border-transparent bg-transparent"'))
  assert.ok(pane.includes('active ? "text-foreground"'))
  assert.ok(pane.includes("<ViewsPicker"))
})

test("a pane in its own window offers a truthful dock back instead of close", () => {
  assert.ok(pane.includes('tooltip="Dock back to workspace"'))
  assert.ok(pane.includes("Dock back to workspace"))
  assert.ok(pane.includes("{onDockBack ? ("))
  assert.ok(pane.includes("{onClose ? ("))
})

test("interacting with a header focuses its pane before acting", () => {
  assert.match(
    pane,
    /onPointerDownCapture=\{\(\) => onFocus\?\.\(\)\}/,
    "a header control should focus the pane it belongs to",
  )
  assert.match(
    pane,
    /onFocusCapture=\{[\s\S]*?\[data-slot='pane-header'\]/,
    "keyboard focus in the header should focus the pane too",
  )
})

test("narrow panes move common view actions to the overflow list", () => {
  const views = read("blocks", "workspace", "views-picker.tsx")
  assert.ok(views.includes("getBoundingClientRect().width < 280"))
  assert.ok(views.includes("ResizeObserver"))
  assert.ok(views.includes('aria-label="More views"'))
})
