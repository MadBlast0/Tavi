/**
 * The popped-out pane window's chrome, checked.
 *
 * A detached pane is the same pane in a different window: it gets the one
 * `Pane` header, its view launchers, and a control that says what it does.
 * These checks catch a second title bar growing back above the header, a
 * close button that actually docks the pane back, and a saved handoff record
 * that demands workspace-only dock targets.
 */

import { test } from "node:test"
import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { join } from "node:path"

const SRC = join(import.meta.dirname, "..")
const read = (...parts: string[]) => readFileSync(join(SRC, ...parts), "utf8")

const paneWindow = read("blocks", "workspace", "pane-window.tsx")
const layout = read("blocks", "workspace", "workspace-layout.tsx")

test("a popped-out pane has one header: the pane's own", () => {
  assert.ok(paneWindow.includes("<Pane"), "the window should draw the shared pane frame")
  assert.ok(!paneWindow.includes("Popped out ·"), "the extra window title bar should be gone")
  assert.ok(!paneWindow.includes('id="dock-target"'), "the dock-target select is workspace chrome, not window chrome")
  assert.ok(!paneWindow.includes('id="dock-edge"'), "the dock-position select is workspace chrome, not window chrome")
})

test("the popped-out pane keeps its view launchers and offers dock back truthfully", () => {
  assert.ok(paneWindow.includes('showViewActions={pane.type === "code-session"}'), "a code session keeps its launchers")
  assert.ok(paneWindow.includes("onDockBack: () => void dockBack()"), "non-session panes receive dock back")
  assert.ok(paneWindow.includes("onDockBack={() => void dockBack()}"), "the pane header receives dock back")
  assert.ok(!paneWindow.includes("onClose: () => void dockBack()"), "dock back must not be supplied as close")
  assert.ok(!paneWindow.includes('tooltip="Close"'), "the window must not show a close control for a dock-back action")
  assert.ok(paneWindow.includes("Dock back to workspace"), "the visible control names what it does")
})

test("the handoff record no longer carries unused workspace dock targets", () => {
  assert.ok(!paneWindow.includes("record.targets"), "the window should not read target choices it cannot use")
  assert.ok(!paneWindow.includes("Array.isArray(record.targets)"), "old records with targets must stay readable")
  assert.ok(!layout.includes("targets: panes.filter"), "new pop-out records should not write unused targets")
})

test("the main-window placeholder docks the pane back rather than closing it", () => {
  const placeholder = layout.slice(layout.indexOf("if (poppedOut) {"), layout.indexOf("const createdActions = {"))
  assert.ok(placeholder.includes("onDockBack={() => onDockBack(pane.id)}"), "the placeholder header should say dock back")
  assert.ok(!placeholder.includes("onClose={() => onDockBack(pane.id)}"), "the placeholder must not label dock-back as close")
})
