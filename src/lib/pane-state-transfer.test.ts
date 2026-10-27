import { test } from "node:test"
import assert from "node:assert/strict"

import { parsePaneLocalState, serializePaneLocalState } from "./pane-state-transfer.ts"
import { readFileSync } from "node:fs"
import { join } from "node:path"

test("pane-local Sets survive a round trip through a native-window payload", () => {
  const original = { selected: "src/App.tsx", expanded: new Set(["src", "src/lib"]), checked: new Set([1, 3]) }
  const restored = parsePaneLocalState(serializePaneLocalState(original))
  assert.equal(restored?.selected, "src/App.tsx")
  assert.ok(restored?.expanded instanceof Set)
  assert.deepEqual([...(restored?.expanded as Set<string>)], ["src", "src/lib"])
  assert.deepEqual([...(restored?.checked as Set<number>)], [1, 3])
})

test("malformed and unbounded transferred pane state is rejected", () => {
  assert.equal(parsePaneLocalState("{"), null)
  assert.equal(parsePaneLocalState("[]"), null)
  assert.equal(parsePaneLocalState("x".repeat(256_001)), null)
})

test("pop-out metadata and dock-back events carry pane-instance state", () => {
  const layout = readFileSync(join(import.meta.dirname, "..", "blocks", "workspace", "workspace-layout.tsx"), "utf8")
  const window = readFileSync(join(import.meta.dirname, "..", "blocks", "workspace", "pane-window.tsx"), "utf8")
  const stored = readFileSync(join(import.meta.dirname, "..", "blocks", "workspace", "panes", "stored-thread-pane.tsx"), "utf8")
  assert.ok(layout.includes("paneState: serializePaneLocalState(snapshot.paneState[pane.id] ?? {})"))
  assert.ok(layout.includes("getDragPayload: (): WorkspaceNativeDragPayload"), "main-window panes should carry pane state when dragged")
  assert.ok(layout.includes("getDragPayload={createdActions.getDragPayload}"), "saved and embedded sessions should use the same drag payload")
  assert.ok(stored.includes("getDragPayload={actions.getDragPayload}"), "saved transcript panes should carry their session's drag state")
  assert.ok(layout.includes("setPaneState(payload.id, returnedState)"))
  assert.ok(window.includes("getWorkspaceSnapshot().paneState[paneId] ?? {}"))
  assert.ok(window.includes("getDragPayload: (): WorkspaceNativeDragPayload"), "dragging any popped-out pane should carry its latest local state")
  assert.ok(window.includes("paneState: serializePaneLocalState(getWorkspaceSnapshot().paneState[paneId] ?? {})"), "native drops must transfer current pane-local state")
  assert.ok(window.includes("restoreWorkspace({ version: 1, panes: [pane]"), "the pop-out renderer should register the same pane id in its local state store")
  assert.ok(layout.includes("This session is still replying in the main window"), "a running main-webview reply must finish before pop-out")
  assert.ok(layout.includes("paneWindowExists(id)"), "stale saved pop-out markers must be reconciled against real native windows")
  assert.ok(layout.includes('if (!writeStorage(`workspace.popout.${pane.id}`, JSON.stringify(record)))'), "a pane must not open a window if its handoff record could not be persisted")
})

test("a popped-out pane stays open until the main workspace acknowledges dock-back", () => {
  const desktop = readFileSync(join(import.meta.dirname, "desktop.ts"), "utf8")
  const window = readFileSync(join(import.meta.dirname, "..", "blocks", "workspace", "pane-window.tsx"), "utf8")
  assert.ok(desktop.includes("PANE_DOCK_BACK_ACK_EVENT"), "dock-back needs a matching acknowledgement event")
  assert.ok(desktop.includes("payload.sourceWindow !== `pane-${payload.id}`"), "only the matching pane window may receive the acknowledgement")
  assert.ok(desktop.includes("accepted: accepted !== false"), "the main window must acknowledge only after its handler accepts the pane")
  assert.ok(window.includes("await requestPaneDockBack("), "the source window must wait for the handoff result")
  assert.ok(window.includes("await destroyCurrentPaneWindow()"), "the source window closes after the acknowledged handoff")
})

test("a native close requested during a reply docks the pane when the reply becomes idle", () => {
  const window = readFileSync(join(import.meta.dirname, "..", "blocks", "workspace", "pane-window.tsx"), "utf8")
  assert.ok(window.includes("returnWhenIdle.current = true"), "a busy close should be queued, not discarded")
  assert.ok(window.includes("if (busy || !returnWhenIdle.current) return"), "queued close should wait for the synchronized reply status")
  assert.ok(window.includes("void dockBack()"), "the queued close should hand the pane back after the reply")
})

test("a synchronous dock-back handler failure sends a negative acknowledgement", () => {
  const desktop = readFileSync(join(import.meta.dirname, "desktop.ts"), "utf8")
  assert.ok(
    desktop.includes("Promise.resolve().then(() => handler(request))"),
    "defer the handler invocation so synchronous throws reach the rejection acknowledgement",
  )
  assert.ok(
    desktop.includes("accepted: false"),
    "a failed dock-back must leave the native pane window open with an explicit refusal",
  )
})

test("a native pane window is revealed only after its dock-back handler is installed", () => {
  const desktop = readFileSync(join(import.meta.dirname, "desktop.ts"), "utf8")
  const window = readFileSync(join(import.meta.dirname, "..", "blocks", "workspace", "pane-window.tsx"), "utf8")
  assert.ok(desktop.includes("visible: false"), "the title bar should not be available before setup")
  assert.ok(desktop.includes("const created = new Promise") && desktop.includes("await Promise.all([") && desktop.includes("await ready"), "creation should wait for both native creation and the ready signal")
  assert.ok(desktop.includes("await Promise.all([") && desktop.includes("window.onCloseRequested(") && desktop.includes("closeHandlerReady && paneHandlerReady"), "creation and the main close handler must be ready before reveal")
  assert.ok(desktop.includes("void window.show().then(resolveReady, rejectReady)"), "the main window should reveal the pane after both handlers are ready")
  assert.ok(desktop.includes("The pane window did not finish opening."), "a pane that never becomes ready should fail cleanly")
  assert.ok(window.includes("unlisten = stop\n          void notifyPaneWindowReady(paneId)"), "the pane window should announce readiness after listening")
})

test("one pane cannot start overlapping pop-out handoffs", () => {
  const layout = readFileSync(join(import.meta.dirname, "..", "blocks", "workspace", "workspace-layout.tsx"), "utf8")
  assert.ok(layout.includes("popOutPendingRef = React.useRef(new Set<string>())"), "pending handoffs should be tracked per pane")
  assert.ok(layout.includes("if (popOutPendingRef.current.has(pane.id)) return"), "repeat activation should not create/focus an unready window")
  assert.ok(layout.includes("popOutPendingRef.current.delete(pane.id)"), "the guard should clear on both success and failure")
})
