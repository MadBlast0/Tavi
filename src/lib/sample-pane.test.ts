/** Local preview behavior stays truthful and has usable shared states. */

import { test } from "node:test"
import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { join } from "node:path"

const source = readFileSync(join(import.meta.dirname, "..", "blocks", "workspace", "panes", "sample-pane.tsx"), "utf8")

test("every local tool preview can demonstrate its relevant pane states", () => {
  for (const state of ["content", "empty", "loading", "error", "unavailable", "long"]) {
    assert.ok(source.includes(`"${state}"`), `the sample pane should offer ${state}`)
  }
  for (const slot of ["PaneEmpty", "PaneLoading", "PaneError", "PaneUnavailable"]) {
    assert.ok(source.includes(slot), `the sample pane should use the shared ${slot} presentation`)
  }
})

test("sample editor states that edits stay local instead of claiming read-only", () => {
  assert.ok(source.includes("editable sample"))
  assert.ok(source.includes("never written to disk"))
})

test("the sample pane explicitly disclaims external services and project files", () => {
  assert.ok(source.includes("no external service or project files are connected"))
  assert.ok(source.includes("No command was executed"))
  assert.ok(source.includes("no network request is made"))
})
