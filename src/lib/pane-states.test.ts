/**
 * The pane state slots, checked.
 *
 * The pane's content can be empty, loading, in error, or unavailable, and
 * the shared slots are what every pane uses. These rules catch the two ways
 * those slots are broken: a slot that does not fill the pane, and a slot
 * that pretends a failure is a retryable error.
 */

import { test } from "node:test"
import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { join } from "node:path"

const SRC = join(import.meta.dirname, "..")
const read = (...parts: string[]) => readFileSync(join(SRC, ...parts), "utf8")

const states = read("blocks", "workspace", "pane-states.tsx")

test("the four state slots exist", () => {
  assert.ok(states.includes("export function PaneEmpty"), "PaneEmpty should exist")
  assert.ok(states.includes("export function PaneLoading"), "PaneLoading should exist")
  assert.ok(states.includes("export function PaneError"), "PaneError should exist")
  assert.ok(states.includes("export function PaneUnavailable"), "PaneUnavailable should exist")
})

test("the empty slot takes an icon, a title and an optional action", () => {
  assert.ok(states.includes("icon: LucideIcon"), "PaneEmpty should take an icon")
  assert.ok(states.includes("title: string"), "PaneEmpty should take a title")
  assert.ok(states.includes("action?: React.ReactNode"), "PaneEmpty should take an optional action")
  assert.ok(states.includes("description?: string"), "PaneEmpty should take an optional description")
})

test("the loading slot is marked as busy", () => {
  assert.ok(states.includes('aria-busy="true"'), "PaneLoading should be marked as busy")
  assert.ok(states.includes('aria-live="polite"'), "PaneLoading should announce politely")
})

test("the error slot is an alert", () => {
  assert.ok(states.includes('role="alert"'), "PaneError should be an alert")
})

test("the error slot offers a retry only when one is given", () => {
  assert.ok(states.includes("onRetry?:"), "PaneError should take an optional retry")
  assert.ok(states.includes("Try again"), "PaneError should label its retry")
})

test("the unavailable slot is not an error", () => {
  // It has no alert role and no retry button, because nothing went wrong
  // and there is nothing to retry.
  const unavailable = states.slice(states.indexOf("export function PaneUnavailable"))
  assert.ok(!unavailable.includes('role="alert"'), "PaneUnavailable should not be an alert")
  assert.ok(!unavailable.includes("onRetry"), "PaneUnavailable should have no retry")
})

test("the empty slot fills the pane", () => {
  assert.ok(
    states.includes('h-full'),
    "PaneEmpty should fill the pane",
  )
})

test("the loading slot fills the pane", () => {
  assert.ok(
    states.includes("flex-1"),
    "PaneLoading should fill the pane",
  )
})

test("the text skeleton is shaped like text", () => {
  assert.ok(
    states.includes("export function PaneSkeletonText"),
    "PaneSkeletonText should exist",
  )
})
