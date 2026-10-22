/**
 * The empty workspace, checked.
 *
 * Two things have to be true, and the second is the one that is easy to
 * get wrong:
 *
 * 1. **The empty state is not the landing screen.** They are different
 *    states and they have to look different. The landing screen asks a
 *    question and offers a box to type in; the empty workspace says the
 *    workspace is empty and offers a way to fill it.
 * 2. **The picker lists every pane type, and the picker is the one that
 *    says what a pane type is.** The list of kinds of view lives in
 *    `pane-types.ts`, and a picker that kept its own copy would fall out of
 *    step with it the first time a type was added.
 */

import { test } from "node:test"
import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { join } from "node:path"

const SRC = join(import.meta.dirname, "..")
const read = (...parts: string[]) => readFileSync(join(SRC, ...parts), "utf8")

const empty = read("blocks", "workspace", "workspace-empty.tsx")
const picker = read("blocks", "workspace", "views-picker.tsx")
const types = read("blocks", "workspace", "pane-types.ts")

test("the empty state is only the empty state", () => {
  // It is not the landing screen, and it does not stand in for one. It shows
  // when the workspace is open and holds nothing, and the landing screen is
  // somewhere else entirely.
  assert.ok(
    empty.includes("if (panes.length > 0) return null"),
    "the empty state should disappear once the workspace holds a pane",
  )
  assert.ok(
    empty.includes("useWorkspace()"),
    "the empty state should ask the workspace state what is in it",
  )
})

test("the empty state is quiet, and is not the landing hero", () => {
  // The Code landing screen is the app's loudest surface: a 24-pixel
  // heading over a composer. A second loud thing in the same place would be
  // a competition rather than a state.
  assert.ok(
    empty.includes('size="sm"'),
    "the empty state should be the small size of the empty component",
  )
  assert.ok(
    !empty.includes("text-2xl"),
    "the empty state should not use the landing screen's heading size",
  )
  assert.ok(
    !empty.includes("prompt-input"),
    "the empty state should not carry a composer",
  )
})

test("the empty state offers the Views picker", () => {
  // One action, and it is the one that opens the picker.
  assert.ok(
    empty.includes("<ViewsPicker />"),
    "the empty state should offer the Views picker",
  )
  const actions = empty.match(/<Button|<ViewsPicker/g) ?? []
  assert.equal(actions.length, 1, "the empty state should offer exactly one action")
})

test("the picker opens, and says what each kind of view is for", () => {
  assert.ok(
    picker.includes("<Popover"),
    "the picker should be a popover",
  )
  assert.ok(
    picker.includes("Add view"),
    "the picker should have a trigger that says what it does",
  )
  assert.ok(
    picker.includes("type.description"),
    "each kind of view should carry its description",
  )
})

test("the picker lists every pane type, in the plan's groups", () => {
  // The list of kinds of view is one list, and the picker reads it rather
  // than keeping a copy. A type that is in the map and not in the picker is
  // a kind of view the user cannot find.
  const keys = [...types.matchAll(/^\s+id: "([a-z-]+)",$/gm)].map((m) => m[1])
  assert.ok(keys.length >= 13, `the map should name every kind of view, found ${keys.length}`)

  const groups = picker.slice(
    picker.indexOf("const GROUPS"),
    picker.indexOf("/** Why a type cannot be added yet."),
  )
  for (const key of keys) {
    assert.ok(
      groups.includes(`"${key}"`),
      `the picker should list "${key}" — the map has it and the picker does not`,
    )
  }
  for (const group of ["Conversations", "Development", "Files", "Activity"]) {
    assert.ok(
      groups.includes(`label: "${group}"`),
      `the picker should have a "${group}" group`,
    )
  }
})

test("nothing can be added yet, and the picker says so", () => {
  // The panes are later work and the layout that would hold them later
  // still, so every entry says so. A button that does nothing is worse
  // than a button that says why it is not going to.
  assert.ok(
    picker.includes("disabled"),
    "the entries should be disabled while there is nothing to put them in",
  )
  assert.ok(
    picker.includes("Not built yet"),
    "the entries should say why they cannot be added",
  )
})
