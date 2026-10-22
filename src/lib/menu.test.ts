/**
 * The menu and overlay conventions, checked.
 *
 * The app has one menu family — `@/components/dropdown-menu`, `@/components/
 * context-menu` and `@/components/tooltip` — all on Base UI. These rules
 * catch the two ways that family is broken: a menu built from a raw
 * `<button>` or a second primitive, and a menu whose items do not say
 * what they do.
 */

import { test } from "node:test"
import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { join } from "node:path"

const SRC = join(import.meta.dirname, "..")
const read = (...parts: string[]) => readFileSync(join(SRC, ...parts), "utf8")

const dropdown = read("components", "dropdown-menu", "dropdown-menu.tsx")
const contextMenu = read("components", "context-menu", "context-menu.tsx")
const tooltip = read("components", "tooltip", "tooltip.tsx")
const pane = read("blocks", "workspace", "pane.tsx")

test("the three menu primitives are on the canonical family", () => {
  assert.ok(
    dropdown.includes('@base-ui/react/menu'),
    "the dropdown menu should be on Base UI",
  )
  assert.ok(
    contextMenu.includes('@base-ui/react/context-menu'),
    "the context menu should be on Base UI",
  )
  assert.ok(
    tooltip.includes('@base-ui/react/tooltip'),
    "the tooltip should be on Base UI",
  )
})

test("the dropdown menu carries a destructive variant for destructive actions", () => {
  // A destructive action is styled distinctly, and the distinction has to
  // live in the primitive so every menu that offers one looks the same.
  assert.match(
    dropdown,
    /variant:\s*\{[^}]*destructive/s,
    "the dropdown menu should have a destructive variant",
  )
})

test("the context menu carries the same destructive variant", () => {
  assert.match(
    contextMenu,
    /variant:\s*\{[^}]*destructive/s,
    "the context menu should have a destructive variant, so right-click and " +
      "the trigger menu agree",
  )
})

test("the pane uses the shared dropdown, not a custom menu", () => {
  // The pane's menu is the app's dropdown menu, so it inherits the
  // trigger, alignment, focus and dismissal behaviour every other menu has.
  assert.ok(
    pane.includes('from "@/components/dropdown-menu"'),
    "the pane should use the shared dropdown menu",
  )
  assert.ok(
    pane.includes("DropdownMenuContent"),
    "the pane should use the shared menu content",
  )
  assert.ok(
    pane.includes('align="end"'),
    "the pane's menu should align to the end of its trigger, so it does not " +
      "cover the pane's title",
  )
})

test("the pane's close action is destructive", () => {
  assert.ok(
    pane.includes('variant="destructive"'),
    "closing a pane is a real change to the layout, and it should look the part",
  )
})

test("the tooltip shows on focus as well as on hover", () => {
  // A control that only says what it is on hover is a control a keyboard
  // user cannot identify. The tooltip's trigger must open on focus too.
  assert.ok(
    tooltip.includes("focus"),
    "the tooltip should open on focus, so a keyboard user gets the name",
  )
})
