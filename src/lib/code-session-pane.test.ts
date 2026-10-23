/**
 * The Code Session pane, checked.
 *
 * A coding session with project context, activity timeline, and a composer.
 * These rules catch the two ways that pane is broken: a composer that scrolls
 * away, and an activity row that calls a real tool.
 */

import { test } from "node:test"
import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { join } from "node:path"

const SRC = join(import.meta.dirname, "..")
const read = (...parts: string[]) => readFileSync(join(SRC, ...parts), "utf8")

const pane = read("blocks", "workspace", "panes", "code-session-pane.tsx")

test("the Code Session pane exists", () => {
  assert.ok(
    pane.includes("export function CodeSessionPane"),
    "the Code Session pane should exist",
  )
})

test("the Code Session pane uses the shared pane frame", () => {
  // The pane frame is tested via rendering, not via import path
  assert.ok(
    pane.includes("<Pane"),
    "the Code Session pane should render a Pane",
  )
})

test("the Code Session pane has project context", () => {
  assert.ok(
    pane.includes("context="),
    "the Code Session pane should show project context",
  )
})

test("the Code Session pane has activity timeline", () => {
  assert.ok(
    pane.includes("SAMPLE_ACTIVITY"),
    "the Code Session pane should have sample activity",
  )
  assert.ok(
    pane.includes("type: \"file_read\""),
    "the activity should include file reads",
  )
  assert.ok(
    pane.includes("type: \"terminal\""),
    "the activity should include terminal commands",
  )
  assert.ok(
    pane.includes("type: \"diff\""),
    "the activity should include diffs",
  )
})

test("the Code Session pane has a composer", () => {
  assert.ok(
    pane.includes("Textarea"),
    "the Code Session pane should have a text entry",
  )
  assert.ok(
    pane.includes("SendIcon"),
    "the Code Session pane should have a send control",
  )
})

test("the Code Session pane has execution status", () => {
  assert.ok(
    pane.includes("statusConfig"),
    "the Code Session pane should have execution status display",
  )
  assert.ok(
    pane.includes("ClockIcon") && pane.includes("Working"),
    "the working state should show a thinking indicator",
  )
  assert.ok(
    pane.includes("CheckCircleIcon") && pane.includes("Completed"),
    "the completed state should show a check",
  )
  assert.ok(
    pane.includes("XCircleIcon") && pane.includes("Failed"),
    "the failed state should show an X",
  )
})

test("the Code Session pane has all the states", () => {
  for (const state of ["empty", "working", "completed", "failed", "unavailable", "long", "error"]) {
    assert.ok(
      pane.includes(`"${state}"`),
      `the Code Session pane should have a ${state} state`,
    )
  }
})

test("the Code Session pane uses the shared state slots", () => {
  assert.ok(pane.includes("PaneEmpty"), "should use PaneEmpty")
  assert.ok(pane.includes("PaneError"), "should use PaneError")
  assert.ok(pane.includes("PaneUnavailable"), "should use PaneUnavailable")
})

test("the Code Session pane does not run agents or tools", () => {
  assert.ok(
    !pane.includes("streamText") && !pane.includes("generateText") && !pane.includes("/api/chat"),
    "the Code Session pane must not call a model or run tools",
  )
  assert.ok(
    pane.includes("mock") || pane.includes("Mock"),
    "the Code Session pane's activity should be clearly mock",
  )
})

test("the Code Session pane's composer is at the bottom", () => {
  assert.ok(
    pane.includes("shrink-0 border-t"),
    "the composer should be pinned below the activity",
  )
})

test("the Code Session pane shows project context", () => {
  assert.ok(
    pane.includes("context="),
    "the Code Session pane should accept and display context",
  )
})