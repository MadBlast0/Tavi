/**
 * The session composer, checked at its source.
 *
 * Chat and code sessions share the real PromptBlock in both the docked
 * workspace and a pane's own window. In a narrow code pane the provider,
 * environment and folder values compact rather than pushing the composer
 * out of the pane.
 */

import { test } from "node:test"
import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { join } from "node:path"

const SRC = join(import.meta.dirname, "..")
const read = (...parts: string[]) => readFileSync(join(SRC, ...parts), "utf8")

const promptBlock = read("blocks", "prompt-input", "prompt-block.tsx")
const promptControls = read("blocks", "prompt-input", "prompt-controls.tsx")
const paneWindow = read("blocks", "workspace", "pane-window.tsx")
const layout = read("blocks", "workspace", "workspace-layout.tsx")

test("the code composer keeps environment and folder controls readable in narrow panes", () => {
  assert.equal((promptBlock.match(/compactLabel/g) ?? []).length, 3, "provider, environment and folder values should compact in Code")
  assert.ok((promptControls.match(/compactLabel && "@max-\[320px\]\/pane:hidden"/g) ?? []).length >= 3, "visible labels should collapse at the pane-width threshold")
  assert.ok(promptControls.includes('aria-label={`${label}: ${shown}`}'), "the environment button keeps its full accessible name")
  assert.ok(promptControls.includes("aria-label={named}"), "the folder button keeps its full accessible name")
})

test("the docked and popped-out session surfaces share the real composer", () => {
  assert.ok(paneWindow.includes("<PromptBlock embeddedSession="), "a popped-out session should render the real PromptBlock")
  assert.ok(layout.includes("renderSession?.(side, sessionId)"), "a docked live session should use the app's session renderer")
  assert.ok(layout.includes("<StoredThreadPane"), "a docked saved session should use the stored transcript path")
})
