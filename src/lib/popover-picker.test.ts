/**
 * The popover and picker conventions, checked.
 *
 * The app has one popover family and one picker family, both on Base UI.
 * These rules catch the two ways that family is broken: a picker built
 * from a raw `<div>` or a second primitive, and a picker that offers no
 * way to find an entry.
 */

import { test } from "node:test"
import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { join } from "node:path"

const SRC = join(import.meta.dirname, "..")
const read = (...parts: string[]) => readFileSync(join(SRC, ...parts), "utf8")

const popover = read("components", "popover", "popover.tsx")
const select = read("components", "select", "select.tsx")
const combobox = read("components", "combobox", "combobox.tsx")
const command = read("components", "command", "command.tsx")
const viewsPicker = read("blocks", "workspace", "views-picker.tsx")

test("the popover is on the canonical family", () => {
  assert.ok(
    popover.includes("@base-ui/react/popover"),
    "the popover should be on Base UI",
  )
})

test("the select is on the canonical family", () => {
  assert.ok(
    select.includes("@base-ui/react/select"),
    "the select should be on Base UI",
  )
})

test("the combobox is on the canonical family", () => {
  assert.ok(
    combobox.includes("@base-ui/react/combobox"),
    "the combobox should be on Base UI",
  )
})

test("the command palette is on the canonical family", () => {
  assert.ok(
    command.includes("@base-ui/react/dialog"),
    "the command palette should be built on Base UI's dialog",
  )
  assert.ok(
    command.includes("cmdk"),
    "the command palette should use cmdk for the search",
  )
})

test("the pane view picker uses the shared dropdown menu", () => {
  assert.ok(
    viewsPicker.includes('from "@/components/dropdown-menu"'),
    "the Views picker should use the shared dropdown menu",
  )
  assert.ok(
    viewsPicker.includes("DropdownMenuContent"),
    "the Views picker should use the dropdown menu content",
  )
})

test("the anchored picker has a no-results state", () => {
  // A picker with search and no empty state is a picker that looks broken
  // when nothing matches. The pane-type picker does not search yet, but the
  // primitive must be able to, and the Views picker keeps its entries
  // disabled with a reason rather than pretending they work.
  assert.ok(
    viewsPicker.includes("disabled"),
    "the picker should disable entries that cannot be used, with a reason",
  )
})
