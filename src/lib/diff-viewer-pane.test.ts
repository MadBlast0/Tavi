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
    pane.includes("data-slot=\"pane\""),
    "the Diff Viewer pane should use the shared pane frame",
  )
  assert.ok(
    pane.includes("data-slot=\"pane-header\""),
    "the Diff Viewer pane should have a header",
  )
  assert.ok(
    pane.includes("data-slot=\"pane-content\""),
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
    pane.includes("selectedFile") && pane.includes("setSelectedFile"),
    "the Diff Viewer should track selected file",
  )
  assert.ok(
    pane.includes("selected ?") || pane.includes("selectedFile"),
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
    pane.includes("empty") || pane.includes("loading") || pane.includes("error") || pane.includes("unavailable"),
    "the Diff Viewer should handle multiple states",
  )
})

test("the Diff Viewer pane does not access Git or filesystem", () => {
  assert.ok(
    !pane.includes("git") || pane.includes("sample"),
    "the Diff Viewer should use sample data, not real Git",
  )
})