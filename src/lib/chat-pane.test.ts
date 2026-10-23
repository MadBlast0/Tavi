/**
 * The Chat pane, checked.
 *
 * A conversation, with a composer at the bottom. The messages scroll
 * inside the pane and the composer does not move. These rules catch the
 * two ways that pane is broken: a composer that scrolls away, and a
 * reply that calls a model.
 */

import { test } from "node:test"
import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { join } from "node:path"

const SRC = join(import.meta.dirname, "..")
const read = (...parts: string[]) => readFileSync(join(SRC, ...parts), "utf8")

const pane = read("blocks", "workspace", "panes", "chat-pane.tsx")

test("the Chat pane exists", () => {
  assert.ok(
    pane.includes("export function ChatPane"),
    "the Chat pane should exist",
  )
})

test("the Chat pane uses the shared pane frame", () => {
  assert.ok(
    pane.includes('from "../pane"'),
    "the Chat pane should use the shared pane frame",
  )
  assert.ok(
    pane.includes("<Pane"),
    "the Chat pane should render a Pane",
  )
})

test("the Chat pane has a scrollable timeline", () => {
  assert.ok(
    pane.includes("MessageScroller"),
    "the Chat pane should use the message scroller",
  )
  assert.ok(
    pane.includes("MessageScrollerViewport"),
    "the Chat pane should have a scrollable viewport",
  )
  assert.ok(
    pane.includes("MessageScrollerContent"),
    "the Chat pane should have scrollable content",
  )
})

test("the Chat pane has a composer", () => {
  assert.ok(
    pane.includes("Textarea"),
    "the Chat pane should have a text entry",
  )
  assert.ok(
    pane.includes("SendIcon") || pane.includes("Send"),
    "the Chat pane should have a send control",
  )
})

test("the Chat pane has sample messages", () => {
  assert.ok(
    pane.includes("SAMPLE_MESSAGES"),
    "the Chat pane should carry sample messages",
  )
  assert.ok(
    pane.includes('role: "user"'),
    "the Chat pane should have user messages",
  )
  assert.ok(
    pane.includes('role: "assistant"'),
    "the Chat pane should have assistant messages",
  )
})

test("the Chat pane has all the states", () => {
  for (const state of ["empty", "populated", "long", "thinking", "loading", "error", "unavailable"]) {
    assert.ok(
      pane.includes(`"${state}"`),
      `the Chat pane should have a ${state} state`,
    )
  }
})

test("the Chat pane uses the shared state slots", () => {
  assert.ok(
    pane.includes("PaneEmpty"),
    "the Chat pane should use PaneEmpty",
  )
  assert.ok(
    pane.includes("PaneError"),
    "the Chat pane should use PaneError",
  )
  assert.ok(
    pane.includes("PaneUnavailable"),
    "the Chat pane should use PaneUnavailable",
  )
  assert.ok(
    pane.includes("PaneLoading"),
    "the Chat pane should use PaneLoading",
  )
})

test("the Chat pane does not call a model", () => {
  assert.ok(
    !pane.includes("streamText") && !pane.includes("generateText") && !pane.includes("/api/chat"),
    "the Chat pane must not call a model",
  )
  assert.ok(
    pane.includes("No model was called") || pane.includes("mock"),
    "the Chat pane's reply should be clearly mock",
  )
})

test("the Chat pane's composer is at the bottom", () => {
  // The composer is in a shrink-0 element after the scrollable content,
  // so it stays put while the messages scroll.
  assert.ok(
    pane.includes("shrink-0 border-t"),
    "the composer should be pinned below the messages",
  )
})
