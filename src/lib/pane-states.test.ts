/**
 * The pane empty/loading/error state slots, checked.
 *
 * The pane's header stays visible while the content changes state, and the
 * content area is where the state is drawn. These rules catch the two ways
 * that contract is broken: a state that replaces the whole pane including
 * its header, and a state that is a different shape in every pane.
 */

import { test } from "node:test"
import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { join } from "node:path"

const SRC = join(import.meta.dirname, "..")
const read = (...parts: string[]) => readFileSync(join(SRC, ...parts), "utf8")

const states = read("blocks", "workspace", "pane-states.tsx")

test("the empty state slot exists", () => {
  assert.ok(states.includes("export function PaneEmpty"), "the empty slot should exist")
})

test("the loading state slot exists", () => {
  assert.ok(states.includes("export function PaneLoading"), "the loading slot should exist")
})

test("the error state slot exists", () => {
  assert.ok(states.includes("export function PaneError"), "the error slot should exist")
})

test("the unavailable state slot exists", () => {
  assert.ok(states.includes("export function PaneUnavailable"), "the unavailable slot should exist")
})

test("the slots are built on the app's shared components", () => {
  assert.ok(states.includes('from "@/components/empty"'), "the empty slot should use the shared empty component")
  assert.ok(states.includes('from "@/components/skeleton"'), "the loading slot should use the shared skeleton")
  assert.ok(states.includes('from "@/components/button"'), "the error slot should use the shared button")
})

test("the slots keep the header out of it", () => {
  // The slots are content, not frames. They do not draw a header, because
  // the header belongs to the pane and stays visible while the content
  // changes state.
  assert.ok(!states.includes('data-slot="pane-header"'), "the slots should not draw a header")
})

test("the slots take their own text", () => {
  // A pane supplies the words that fit it. Forcing one sentence on every
  // pane would be a copy of the same mistake the plan forbids.
  assert.ok(states.includes("title: string"), "the empty slot should take a title")
  assert.ok(states.includes("title: string"), "the error slot should take a title")
})

test("the slots offer a single action at most", () => {
  assert.ok(states.includes("action?: () => void"), "the empty slot should offer at most one action")
  assert.ok(states.includes("onRetry?: () => void"), "the error slot should offer at most one retry")
})
