/**
 * The workspace's keyboard routes, checked at their behaviour.
 *
 * These tests do not read the component's source: they press the adopted keys
 * against the same matcher the window listener uses, then check the pane the
 * workspace would focus. The DOM seam — focusing the title, tab or region — is
 * left to the runtime checks because this file has no browser.
 */

import { test } from "node:test"
import assert from "node:assert/strict"

import { isApplePlatform } from "../../lib/hotkey.ts"
import {
  WORKSPACE_SHORTCUTS,
  nextPaneId,
  paneForToggle,
  workspaceShortcutIntent,
} from "./workspace-shortcuts.ts"

type PressOptions = {
  mod?: boolean
  ctrl?: boolean
  shift?: boolean
  alt?: boolean
}

/** A key press shaped like the listener sees it, including the platform's modifier. */
function press(key: string, options: PressOptions = {}): KeyboardEvent {
  const apple = isApplePlatform()
  return {
    key,
    code: "",
    metaKey: Boolean(options.mod && apple),
    ctrlKey: Boolean(options.ctrl || (options.mod && !apple)),
    altKey: Boolean(options.alt),
    shiftKey: Boolean(options.shift),
    defaultPrevented: false,
    repeat: false,
    isComposing: false,
  } as KeyboardEvent
}

const tab = { id: "pane-chat", type: "chat" }
const terminal = { id: "pane-terminal", type: "terminal" }
const diffOne = { id: "pane-diff-1", type: "diff" }
const diffTwo = { id: "pane-diff-2", type: "diff" }
const panes = [tab, terminal, diffOne, diffTwo]

test("the adopted bindings are the documented ones", () => {
  assert.deepEqual(WORKSPACE_SHORTCUTS, {
    closePane: "mod+\\",
    toggleTerminal: "ctrl+`",
    toggleBrowser: "mod+shift+b",
    toggleDiff: "mod+shift+d",
    nextPane: "f6",
    previousPane: "shift+f6",
  })
})

test("the adopted keys resolve to their workspace actions", () => {
  assert.deepEqual(workspaceShortcutIntent(press("\\", { mod: true })), { kind: "close-pane" })
  assert.deepEqual(workspaceShortcutIntent(press("`", { ctrl: true })), { kind: "toggle-pane", paneType: "terminal" })
  assert.deepEqual(workspaceShortcutIntent(press("B", { mod: true, shift: true })), { kind: "toggle-pane", paneType: "browser" })
  assert.deepEqual(workspaceShortcutIntent(press("D", { mod: true, shift: true })), { kind: "toggle-pane", paneType: "diff" })
  assert.deepEqual(workspaceShortcutIntent(press("F6")), { kind: "cycle-pane", direction: 1 })
  assert.deepEqual(workspaceShortcutIntent(press("F6", { shift: true })), { kind: "cycle-pane", direction: -1 })
})

test("unrelated and incomplete chords are left to the rest of the app", () => {
  assert.equal(workspaceShortcutIntent(press("\\")), null, "close needs its modifier")
  assert.equal(workspaceShortcutIntent(press("`")), null, "terminal needs Control")
  assert.equal(workspaceShortcutIntent(press("b", { mod: true })), null, "the sidebar keeps mod+b")
  assert.equal(workspaceShortcutIntent(press("m", { mod: true, shift: true })), null, "dictation's new key is not a pane shortcut")
  assert.equal(workspaceShortcutIntent(press("F6", { ctrl: true })), null)
  assert.equal(workspaceShortcutIntent(press("F6", { shift: true, alt: true })), null)
})

test("focus cycles through visible panes in order and wraps", () => {
  assert.equal(nextPaneId(["a", "b", "c"], "b", 1), "c")
  assert.equal(nextPaneId(["a", "b", "c"], "c", 1), "a")
  assert.equal(nextPaneId(["a", "b", "c"], "a", -1), "c")
  assert.equal(nextPaneId(["a", "b", "c"], null, 1), "a", "the first press starts at the first pane")
  assert.equal(nextPaneId(["a", "b", "c"], null, -1), "c", "backwards starts at the last pane")
  assert.equal(nextPaneId(["a", "b", "c"], "hidden", 1), "a", "a pane that is no longer visible does not skip one")
  assert.equal(nextPaneId(["a"], "a", 1), "a", "a single pane is its own next pane")
  assert.equal(nextPaneId([], "a", 1), null, "an empty workspace has nowhere to go")
})

test("a view toggle focuses the focused instance, then a visible one, then any", () => {
  assert.equal(
    paneForToggle(panes, "diff", "pane-diff-2", ["pane-chat", "pane-terminal"]),
    "pane-diff-2",
    "the focused instance wins even when another tab is showing",
  )
  assert.equal(
    paneForToggle(panes, "diff", "pane-chat", ["pane-chat", "pane-terminal", "pane-diff-2"]),
    "pane-diff-2",
    "the first visible instance wins over an earlier hidden one",
  )
  assert.equal(
    paneForToggle(panes, "diff", "pane-chat", ["pane-chat", "pane-terminal"]),
    "pane-diff-1",
    "a hidden instance is still a target when no instance is visible",
  )
  assert.equal(paneForToggle(panes, "browser", "pane-chat", ["pane-chat"]), null, "a type that is not open has no target")
})
