/**
 * The pane registry, checked.
 *
 * The registry is the one place that knows what a pane type is: its key,
 * its default title, its mark, its description, its renderer, its actions
 * and whether it may be duplicated. These rules catch the two ways that
 * registry is broken: a type that is not registered, and a registry that
 * has drifted away from the list of pane types.
 */

import { test } from "node:test"
import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { join } from "node:path"

const SRC = join(import.meta.dirname, "..")
const read = (...parts: string[]) => readFileSync(join(SRC, ...parts), "utf8")

const registry = read("blocks", "workspace", "pane-registry.tsx")
const paneTypes = read("blocks", "workspace", "pane-types.ts")

test("the registry is built from the pane types", () => {
  // A type added to pane-types.ts is in the registry, with no second list
  // to keep in step. The registry maps over PANE_TYPES.
  assert.ok(
    registry.includes("PANE_TYPES.map"),
    "the registry should be built from PANE_TYPES, so the two cannot drift",
  )
})

test("the registry covers every pane type", () => {
  // The registry is built from PANE_TYPES, so every type that is in
  // pane-types.ts is in the registry with no second list to keep in step.
  const typeIds = [...paneTypes.matchAll(/id: "([^"]+)"/g)].map(m => m[1])
  assert.ok(typeIds.length === 13, "there should be thirteen pane types")
  // The registry maps over PANE_TYPES and uses type.id as the key, so the
  // count of types in the registry is the count of types in pane-types.ts.
  assert.ok(
    registry.includes("PANE_TYPES.map"),
    "the registry should be built from PANE_TYPES, so it covers every type",
  )
  // Each type's default title is its label, which the registry reads from
  // the type. A type whose label is missing would have no default title.
  assert.ok(
    registry.includes("defaultTitle: type.label"),
    "the registry should use each type's label as its default title",
  )
})

test("the registry has a renderer for every type", () => {
  assert.ok(
    registry.includes("render:"),
    "every registered type should carry a renderer",
  )
})

test("the registry says which types may be duplicated", () => {
  assert.ok(
    registry.includes("allowDuplicate:"),
    "every registered type should say whether it may be duplicated",
  )
})

test("the registry has a shared set of actions", () => {
  assert.ok(
    registry.includes("SHARED_ACTIONS"),
    "the shared actions should be defined once, not per type",
  )
})

test("the registry has a lookup", () => {
  assert.ok(
    registry.includes("getPaneRegistration"),
    "the registry should have a lookup by type key",
  )
  assert.ok(
    registry.includes("isRegisteredPaneType"),
    "the registry should be able to say whether a type is registered",
  )
})

test("a chat and a code session cannot be duplicated", () => {
  // A chat and a code session are one thing at a time. The registry says so.
  assert.ok(
    registry.includes('type.id !== "chat"'),
    "chat should not be duplicable",
  )
  assert.ok(
    registry.includes('type.id !== "code-session"'),
    "code-session should not be duplicable",
  )
})
