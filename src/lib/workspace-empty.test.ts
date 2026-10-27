/** Empty workspace behavior preserves the app's current landing surface. */

import { test } from "node:test"
import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { join } from "node:path"

const SRC = join(import.meta.dirname, "..")
const read = (...parts: string[]) => readFileSync(join(SRC, ...parts), "utf8")
const layout = read("blocks", "workspace", "workspace-layout.tsx")
const host = read("blocks", "workspace", "workspace-host.tsx")
const picker = read("blocks", "workspace", "views-picker.tsx")
const pane = read("blocks", "workspace", "pane.tsx")

test("an empty workspace shows the existing landing content", () => {
  assert.match(layout, /if \(panes\.length === 0\) return <div[\s\S]*?\{children\}<\/div>/)
  assert.ok(host.includes("no session and no panes — the landing screen"))
  assert.ok(!host.includes("openWorkspace"), "the workspace is not a separate destination")
})

test("the empty workspace can receive a real session drag", () => {
  assert.ok(layout.includes('types.includes("application/x-tavi-session")'))
  assert.ok(layout.includes('onSessionDrop?.(payload.side, payload.id, "", "center")'))
})

test("the compact title-bar picker adds registered types and explains the six-view limit", () => {
  assert.ok(picker.includes("<DropdownMenu"))
  assert.ok(picker.includes("addPane"))
  assert.ok(picker.includes("MAX_VISIBLE_PANES"))
  assert.ok(picker.includes("Close a view to make room"))
  assert.ok(picker.includes('["terminal", "diff", "browser", "file-explorer"]'))
  assert.ok(pane.includes("<ViewsPicker className=\"flex items-center gap-0.5\""))
  assert.ok(!picker.includes("type.description"), "the overflow menu should not contain descriptive paragraphs")
})
