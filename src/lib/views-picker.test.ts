import { test } from "node:test"
import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { join } from "node:path"

const root = join(import.meta.dirname, "..")
const read = (...parts: string[]) => readFileSync(join(root, ...parts), "utf8")
const source = read("blocks", "workspace", "views-picker.tsx")
const pane = read("blocks", "workspace", "pane.tsx")
const layout = read("blocks", "workspace", "workspace-layout.tsx")

test("common tool views live as compact actions in the Code Session title bar", () => {
  assert.match(source, /const quick = \["terminal", "diff", "browser", "file-explorer"\]/)
  assert.match(source, /id === "file-explorer" \? "Files"/)
  assert.match(source, /\{viewLabel\(type\.id\)\}/)
  assert.match(source, /tooltip=\{label\}/)
  assert.match(pane, /<ViewsPicker className="flex items-center gap-0\.5"/)
  assert.match(pane, /showViewActions\?: boolean/)
})

test("additional views use a short icon-and-name overflow menu", () => {
  assert.match(source, /<DropdownMenuContent align="end" className="w-48"/)
  assert.match(source, /<type\.icon \/>/)
  assert.match(source, /<span>\{viewLabel\(type\.id\)\}<\/span>/)
  assert.doesNotMatch(source, /type\.description/)
  assert.doesNotMatch(source, /Conversations|Development|Activity/)
})

test("quick tools move into the overflow menu when the pane is narrow", () => {
  assert.match(source, /getBoundingClientRect\(\)\.width < 280/)
  assert.match(source, /ResizeObserver/)
  assert.match(source, /narrow \|\| !quick\.includes\(type\.id\)/)
})

test("the compact menu preserves the pane cap and excludes conversation creation", () => {
  assert.match(source, /MAX_VISIBLE_PANES/)
  assert.match(source, /Close a view to make room/)
  assert.match(source, /type\.id !== "chat" && type\.id !== "code-session"/)
  assert.match(source, /addPane\(id, \{ anchorPaneId: paneId \}\)/)
})

test("a view added from a header anchors beside the pane that owns it", () => {
  assert.match(pane, /<ViewsPicker className="flex items-center gap-0\.5" paneId=\{id\}/)
  assert.match(source, /export function ViewsPicker\(\{ paneId, className \}/)
})

test("the workspace has no separate view-count and layout toolbar", () => {
  assert.doesNotMatch(layout, /of \{MAX_VISIBLE_PANES\} views/)
  assert.doesNotMatch(layout, />Layout<\/DropdownMenuTrigger>/)
  assert.doesNotMatch(layout, />Move view<\/PopoverTrigger>/)
  assert.doesNotMatch(layout, /<ViewsPicker \/>/)
})
