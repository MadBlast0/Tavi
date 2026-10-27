import { test } from "node:test"
import assert from "node:assert/strict"

import { runWorkspaceNativeDrag } from "./workspace-native-drag.ts"

test("the native drag announces its end if starting the shared drag notice fails", async () => {
  const calls: string[] = []
  await runWorkspaceNativeDrag({
    announceStart: async () => { calls.push("start"); throw new Error("event bridge unavailable") },
    drag: async () => { calls.push("drag") },
    announceEnd: async () => { calls.push("end") },
  })
  assert.deepEqual(calls, ["start", "end"])
})

test("a failed native drag still announces its end", async () => {
  const calls: string[] = []
  await runWorkspaceNativeDrag({
    announceStart: async () => { calls.push("start") },
    drag: async () => { calls.push("drag"); throw new Error("OS drag cancelled") },
    announceEnd: async () => { calls.push("end") },
  })
  assert.deepEqual(calls, ["start", "drag", "end"])
})

test("a failed end notification does not escape as an unhandled rejection", async () => {
  await assert.doesNotReject(runWorkspaceNativeDrag({
    announceStart: async () => {},
    drag: async () => {},
    announceEnd: async () => { throw new Error("webview closed") },
  }))
})
