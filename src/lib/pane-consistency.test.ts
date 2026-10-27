/**
 * Cross-pane consistency rules for the shared workspace frame and scrolling.
 *
 * Chat and code-session panes are conversation surfaces and are drawn by
 * the real session path, not by the registry. The registry's renderers are
 * for the tool panes, and all of them use the one shared Pane frame.
 */

import { test } from "node:test"
import assert from "node:assert/strict"
import { existsSync, readFileSync } from "node:fs"
import { join } from "node:path"

const SRC = join(import.meta.dirname, "..")
const read = (...parts: string[]) => readFileSync(join(SRC, ...parts), "utf8")

const diff = read("blocks", "workspace", "panes", "diff-viewer-pane.tsx")
const sample = read("blocks", "workspace", "panes", "sample-pane.tsx")
const registry = read("blocks", "workspace", "pane-registry.tsx")

test("tool pane renderers use the shared frame and the registry has no sample session renderer", () => {
  for (const [name, source] of [["Diff Viewer", diff], ["tool pane", sample]] as const) {
    assert.ok(source.includes("<Pane"), `${name} should use the shared Pane frame`)
  }
  assert.ok(registry.includes("return <SamplePane"), "all registered sample tools should share the same pane frame")
  assert.ok(registry.includes("return <DiffViewerPane"))
  assert.ok(!registry.includes("ChatPane") && !registry.includes("CodeSessionPane"), "the registry must not grow a second session renderer")
  assert.ok(
    !existsSync(join(SRC, "blocks", "workspace", "panes", "chat-pane.tsx")) &&
      !existsSync(join(SRC, "blocks", "workspace", "panes", "code-session-pane.tsx")),
    "the dead sample session renderers should be gone",
  )
})

test("sample state controls wrap at the minimum pane width", () => {
  assert.match(diff, /flex shrink-0 flex-wrap items-center gap-2 border-b/)
})

test("diff and sample content stay inside pane-owned scroll regions", () => {
  assert.ok(diff.includes("min-h-0 flex-1 overflow-auto py-2"), "diff content should scroll independently")
  assert.ok(sample.includes("min-h-0 flex-1 overflow-auto"), "sample tools should scroll inside their content region")
})
