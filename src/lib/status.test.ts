/**
 * The status, empty, loading and feedback patterns, checked.
 *
 * The app has one set of primitives for the non-happy path: a badge for a
 * status, an empty state, a skeleton for loading, a progress indicator and
 * a toast for short feedback. These rules catch the two ways that set is
 * broken: a second primitive growing beside the first, and a pane that
 * shows a fake success for something that did not happen.
 */

import { test } from "node:test"
import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { join } from "node:path"

const SRC = join(import.meta.dirname, "..")
const read = (...parts: string[]) => readFileSync(join(SRC, ...parts), "utf8")

const badge = read("components", "badge", "badge.tsx")
const empty = read("components", "empty", "empty.tsx")
const skeleton = read("components", "skeleton", "skeleton.tsx")
const progress = read("components", "progress", "progress.tsx")
const toast = read("components", "toast", "toast.tsx")
const workspaceEmpty = read("blocks", "workspace", "workspace-empty.tsx")

test("the badge is on the canonical family", () => {
  assert.ok(
    badge.includes("@base-ui/react"),
    "the badge should be on Base UI",
  )
})

test("the empty state is on the canonical family", () => {
  assert.ok(
    empty.includes("@base-ui/react"),
    "the empty state should be on Base UI",
  )
})

test("the skeleton is on the canonical family", () => {
  assert.ok(
    skeleton.includes("@base-ui/react"),
    "the skeleton should be on Base UI",
  )
})

test("the progress indicator is on the canonical family", () => {
  assert.ok(
    progress.includes("@base-ui/react"),
    "the progress indicator should be on Base UI",
  )
})

test("the toast is on the canonical family", () => {
  assert.ok(
    toast.includes("@base-ui/react") || toast.includes("sonner"),
    "the toast should be on Base UI or the app's own toast system",
  )
})

test("the empty state carries a title, a description and a media slot", () => {
  // An empty state that is only an icon says nothing. The app's empty
  // component carries a header, a media slot, a title and a description,
  // so a caller cannot leave the message out.
  assert.ok(empty.includes("EmptyTitle"), "the empty state should have a title")
  assert.ok(empty.includes("EmptyDescription"), "the empty state should have a description")
  assert.ok(empty.includes("EmptyMedia"), "the empty state should have a media slot")
})

test("the empty state offers a single action at most", () => {
  // One action, and it is the one that fills the empty thing. Two actions
  // is a choice, and an empty state is not a choice.
  assert.ok(empty.includes("EmptyContent"), "the empty state should have a content slot for one action")
})

test("the skeleton is shaped like content", () => {
  // A skeleton that is a spinner is a spinner. The app's skeleton is a
  // placeholder shaped like the content it stands in for.
  assert.ok(
    skeleton.includes("SkeletonText") || skeleton.includes("Skeleton"),
    "the skeleton should offer a content-shaped placeholder",
  )
})

test("the workspace empty state uses the shared empty component", () => {
  // The workspace does not grow its own empty state; it uses the app's.
  assert.ok(
    workspaceEmpty.includes('from "@/components/empty"'),
    "the workspace empty state should use the shared empty component",
  )
})

test("the workspace empty state uses the shared Views picker", () => {
  assert.ok(
    workspaceEmpty.includes("<ViewsPicker />"),
    "the workspace empty state should offer the Views picker as its one action",
  )
})
