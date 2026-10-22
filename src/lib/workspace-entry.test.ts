/**
 * The way into the workspace, checked.
 *
 * The workspace is reached from the Code rail, and the way back out is the
 * same row. Three things about it have to be true, and each of them is the
 * kind of thing that is easy to break without noticing:
 *
 * 1. **The row is on the Code side only.** Chat is a conversation and Code
 *    is working in a repository, and the two sides are deliberately
 *    different lists — a destination that only one of them can honour
 *    should not be on the other.
 * 2. **The row is live.** Every other destination in the rail is rendered
 *    disabled with a reason, and a row that looks live and does nothing is
 *    a lie about how much of the app exists. The workspace is real.
 * 3. **The row says which it will do.** A row that says "Workspace" and
 *    closes the workspace when pressed is a row that lies about what it
 *    does, and the rail is where the user is looking when they decide to
 *    leave.
 */

import { test } from "node:test"
import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { join } from "node:path"

const SRC = join(import.meta.dirname, "..")
const read = (...parts: string[]) => readFileSync(join(SRC, ...parts), "utf8")

const nav = read("blocks", "shell", "sidebar-nav.tsx")

/** The text of one list in the navigation, between its two braces. */
const listOf = (side: "chat" | "code"): string => {
  const at = nav.indexOf(`${side}: [`)
  assert.notEqual(at, -1, `there should be a ${side} list in the navigation`)
  const end = nav.indexOf("\n  ],", at)
  assert.notEqual(end, -1, `the ${side} list should end`)
  return nav.slice(at, end)
}

test("the workspace is reached from the Code rail", () => {
  const code = listOf("code")
  assert.ok(
    code.includes('id: "workspace"'),
    "the Code rail should have a Workspace row",
  )
  assert.ok(
    code.includes('label: "Workspace"'),
    "the row should be called Workspace",
  )
})

test("the Chat rail is left alone", () => {
  // The two sides are two lists, not one list drawn twice. A destination
  // that only Code can honour should not appear on the Chat side, and the
  // Chat list is the approved shape.
  const chat = listOf("chat")
  assert.ok(
    !chat.includes('id: "workspace"'),
    "the Chat rail should not have a Workspace row",
  )
})

test("the row is live, and says why the others are not", () => {
  // Every other destination carries a `why`, and a `why` is what makes a
  // row disabled. The workspace has to be the exception, or it is a row
  // that looks live and does nothing.
  const code = listOf("code")
  const entry = code.slice(code.indexOf('id: "workspace"'))
  const block = entry.slice(0, entry.indexOf("},"))
  assert.ok(
    !block.includes("why:"),
    "the Workspace row should not carry a reason for being disabled",
  )
})

test("the row says which way it goes", () => {
  // It opens the workspace or closes it, and it says which before it is
  // pressed rather than after.
  assert.ok(
    nav.includes("if (workspaceOpen) closeWorkspace()"),
    "the row should close the workspace when it is open",
  )
  assert.ok(
    nav.includes("else openWorkspace()"),
    "the row should open the workspace when it is closed",
  )
  assert.ok(
    nav.includes('"Close workspace"'),
    "the row should say what it will do while the workspace is open",
  )
})

test("the workspace does not disturb the conversation", () => {
  // Opening the workspace takes the work area; it does not start a new
  // conversation, change the side, or clear anything. The rail's New row
  // goes through the thread bridge for that reason, and the workspace row
  // does not go near it.
  const onWorkspace = nav.slice(nav.indexOf("function onWorkspace"))
  const body = onWorkspace.slice(0, onWorkspace.indexOf("\n  }"))
  assert.ok(
    !body.includes("newThread"),
    "the workspace row should not start a new conversation",
  )
  assert.ok(
    !body.includes("setVariant"),
    "the workspace row should not change the side",
  )
})
