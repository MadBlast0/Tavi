import { test } from "node:test"
import assert from "node:assert/strict"

import { isDockBackToOriginalPaneTarget, sendAcknowledgedPaneRequest, type PaneWindowAcknowledgement } from "./pane-window-protocol.ts"

test("a popped-out pane can return to its own placeholder without moving its layout node", () => {
  assert.equal(isDockBackToOriginalPaneTarget({ kind: "pane", paneId: "pane-a", targetPaneId: "pane-a", sourceWindow: "pane-pane-a" }), true)
})

test("ordinary self-drops and tab self-drops remain no-ops", () => {
  assert.equal(isDockBackToOriginalPaneTarget({ kind: "pane", paneId: "pane-a", targetPaneId: "pane-a", sourceWindow: "main" }), false)
  assert.equal(isDockBackToOriginalPaneTarget({ kind: "tab", paneId: "pane-a", targetPaneId: "pane-a", sourceWindow: "pane-pane-a" }), false)
})

test("pane dock request subscribes before sending and ignores unrelated acknowledgements", async () => {
  const calls: string[] = []
  let receive: ((value: PaneWindowAcknowledgement) => void) | undefined
  let cleaned = false
  const request = sendAcknowledgedPaneRequest({
    id: "pane-a",
    requestId: "request-a",
    subscribe: async (handler) => {
      calls.push("subscribe")
      receive = handler
      return () => { cleaned = true }
    },
    send: async () => {
      calls.push("send")
      receive?.({ id: "pane-a", requestId: "stale", accepted: true })
      receive?.({ id: "pane-other", requestId: "request-a", accepted: true })
      queueMicrotask(() => receive?.({ id: "pane-a", requestId: "request-a", accepted: true }))
    },
  })

  await request
  assert.deepEqual(calls, ["subscribe", "send"])
  assert.equal(cleaned, true)
})

test("a rejected dock request leaves cleanup complete and reports refusal", async () => {
  let cleaned = false
  await assert.rejects(sendAcknowledgedPaneRequest({
    id: "pane-a",
    requestId: "request-a",
    subscribe: async (receive) => {
      queueMicrotask(() => receive({ id: "pane-a", requestId: "request-a", accepted: false }))
      return () => { cleaned = true }
    },
    send: async () => {},
  }), /did not confirm/)
  assert.equal(cleaned, true)
})

test("a dock request times out and removes its acknowledgement listener", async () => {
  let cleaned = false
  await assert.rejects(sendAcknowledgedPaneRequest({
    id: "pane-a",
    requestId: "request-a",
    timeoutMs: 5,
    subscribe: async () => () => { cleaned = true },
    send: async () => {},
  }), /did not confirm/)
  assert.equal(cleaned, true)
})

test("a failed dock request send still removes its acknowledgement listener", async () => {
  let cleaned = false
  await assert.rejects(sendAcknowledgedPaneRequest({
    id: "pane-a",
    requestId: "request-a",
    subscribe: async () => () => { cleaned = true },
    send: async () => { throw new Error("window unavailable") },
  }), /window unavailable/)
  assert.equal(cleaned, true)
})
