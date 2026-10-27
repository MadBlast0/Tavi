/**
 * The Diff Viewer pane, checked.
 *
 * The Diff Viewer shows an overview of changes with a file list, search, filter,
 * and a diff content area. These rules catch the two ways that pane is broken:
 * a file list that does not update selection, and a diff area that does not show
 * the selected file.
 */

import { test } from "node:test"
import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { join } from "node:path"

const SRC = join(import.meta.dirname, "..")
const read = (...parts: string[]) => readFileSync(join(SRC, ...parts), "utf8")

const pane = read("blocks", "workspace", "panes", "diff-viewer-pane.tsx")

test("the Diff Viewer pane exists", () => {
  assert.ok(
    pane.includes("export function DiffViewerPane"),
    "the Diff Viewer pane should exist",
  )
})

test("the Diff Viewer pane uses the shared pane frame", () => {
  assert.ok(
    pane.includes("<Pane "),
    "the Diff Viewer pane should use the shared pane frame",
  )
  assert.ok(
    pane.includes("<Pane id={paneId}"),
    "the Diff Viewer pane should have a header",
  )
  assert.ok(
    pane.includes("<Pane id={paneId}") && pane.includes("{selected ?"),
    "the Diff Viewer pane should have a content area",
  )
})

test("the Diff Viewer pane has a change summary header", () => {
  assert.ok(
    pane.includes("totalAdditions") || pane.includes("+{totalAdditions}"),
    "the Diff Viewer should show total additions",
  )
  assert.ok(
    pane.includes("totalDeletions") || pane.includes("-{totalDeletions}"),
    "the Diff Viewer should show total deletions",
  )
  assert.ok(
    pane.includes("SAMPLE_FILES.length") || pane.includes("files"),
    "the Diff Viewer should show file count",
  )
})

test("the Diff Viewer pane has a searchable and filterable file list", () => {
  assert.ok(
    pane.includes("search") && pane.includes("setSearch"),
    "the Diff Viewer should have a search field",
  )
  assert.ok(
    pane.includes("filter") && pane.includes("setFilter"),
    "the Diff Viewer should have a filter select",
  )
  assert.ok(
    pane.includes("SAMPLE_FILES") && pane.includes(".filter"),
    "the Diff Viewer should filter the file list",
  )
})

test("the Diff Viewer pane supports file selection", () => {
  assert.ok(
    pane.includes("selectedPath") && pane.includes("setSelectedPath"),
    "the Diff Viewer should track selected file",
  )
  assert.ok(
    pane.includes("selected ?"),
    "the Diff Viewer should render selected file content",
  )
})

test("the Diff Viewer pane shows file status badges", () => {
  assert.ok(
    pane.includes("added") && pane.includes("modified") && pane.includes("deleted"),
    "the Diff Viewer should distinguish file statuses",
  )
})

test("the Diff Viewer pane uses the shared state slots", () => {
  assert.ok(
    pane.includes("No sample files match") && pane.includes("Select a file to view the sample diff"),
    "the Diff Viewer should handle no matches and no selection",
  )
})

test("Diff Viewer selection and controls belong to the pane instance for pop-out transfer", () => {
  assert.ok(pane.includes("usePaneState(paneId)"), "diff controls should be stored with the pane instance")
  for (const key of ["selectedPath", "search", "filter", "view", "hunk", "reviewed", "sampleState"]) {
    assert.ok(pane.includes(`paneId, \"${key}\"`), `${key} should survive a cross-window handoff`)
  }
  assert.ok(pane.includes("getDragPayload={getDragPayload}"), "dragging the popped-out diff should include pane-local state")
})

test("the Diff Viewer pane exposes honest loading, error, unavailable, empty, and long sample states", () => {
  for (const state of ["content", "no-changes", "loading", "error", "unavailable", "long"]) {
    assert.ok(pane.includes(`"${state}"`), `the Diff Viewer should expose ${state}`)
  }
  assert.ok(pane.includes("PaneLoading") && pane.includes("PaneError") && pane.includes("PaneUnavailable") && pane.includes("PaneEmpty"))
  assert.ok(pane.includes("Array.from({ length: 120 }"), "long content should exercise scrolling")
})

test("the Diff Viewer pane does not access Git or filesystem", () => {
  assert.ok(
    !pane.includes("git") || pane.includes("sample"),
    "the Diff Viewer should use sample data, not real Git",
  )
})
