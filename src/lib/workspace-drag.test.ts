/**
 * Sidebar-to-workspace session dragging, checked at its source and target.
 *
 * The state transition itself — a tab leaving one group and joining another —
 * is behavioural in `workspace-state.test.ts`. These checks guard the drag
 * wiring the audit names: the payload carries the real session identity
 * (WS-08), a cross-group tab drop falls back to a dock (WS-07), and a
 * popped-out pane keeps a dock target (WS-10). Those are documented
 * interaction invariants; anything else belongs in a behaviour test.
 */

import { test } from "node:test"
import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { join } from "node:path"

const SRC = join(import.meta.dirname, "..")
const read = (...parts: string[]) => readFileSync(join(SRC, ...parts), "utf8")

test("sidebar conversation rows carry their real id and side while dragging", () => {
  const source = read("blocks", "shell", "sidebar-nav.tsx")
  assert.ok(source.includes('setData("application/x-tavi-session"'), "a row should provide the session drag type")
  assert.ok(source.includes("thread.id, side: thread.side"), "a row should carry the selected conversation identity")
})

test("workspace panes accept a session drop and use the pointer's docking edge", () => {
  const source = read("blocks", "workspace", "workspace-layout.tsx")
  assert.ok(source.includes('getData("application/x-tavi-session")'), "a pane should read the session drag type")
  assert.ok(source.includes("onSessionDrop?.(payload.side, payload.id, pane.id, edge)"), "the drop should retain side, id, target and edge")
  assert.ok(source.includes("data-[drop-edge=left]"), "the user should see edge drop feedback")
})

test("a grouped tab can be dragged out onto an ordinary tool pane", () => {
  const source = read("blocks", "workspace", "workspace-layout.tsx")
  assert.ok(source.includes('types.includes("application/x-tavi-tab")'), "tool panes should accept a tab drag preview")
  assert.ok(source.includes('getData("application/x-tavi-pane") || event.dataTransfer.getData("application/x-tavi-tab")'), "tool panes should dock a tab by its existing pane id")
})

test("a tab dropped on another group's tab joins that group", () => {
  const tree = read("blocks", "workspace", "layout", "layout-tree.tsx")
  assert.ok(
    tree.includes('if (!reorderTab(dragged, paneId)) dockPane(dragged, paneId, "center")'),
    "a cross-group HTML tab drop should dock into the target group",
  )
  const source = read("blocks", "workspace", "workspace-layout.tsx")
  assert.ok(
    source.includes('reorderTab(payload.paneId, targetId) || dockPane(payload.paneId, targetId, "center")'),
    "a cross-group native tab drop should dock into the target group",
  )
})

test("native drops clear stale leave targets and match their originating drag", () => {
  const source = read("blocks", "workspace", "workspace-layout.tsx")
  assert.ok(source.includes('if (event.type === "leave" || !event.position) {\n          nativeTargetRef.current = null'), "leaving the workspace must discard its last drop target")
  assert.ok(source.includes("nativeTarget?.dragId !== envelope.dragId"), "a delayed drop callback must not reuse another drag's target")
  assert.ok(source.includes("await nativeOverTaskRef.current"), "the native drop must wait for its last pointer target to be resolved")
})

test("a popped-out pane leaves a drop target at its original dock position", () => {
  const source = read("blocks", "workspace", "workspace-layout.tsx")
  const popoutBranch = source.slice(source.indexOf("if (poppedOut) {"), source.indexOf("const createdActions = {"))
  assert.ok(popoutBranch.includes("<PaneDropTarget paneId={pane.id}"), "the placeholder must remain a target for native return drags")
  assert.ok(source.includes("isDockBackToOriginalPaneTarget"), "dropping a pane on its own placeholder must be accepted as dock-back")
})

test("split dividers on the active pane's path are brightest", () => {
  const source = read("blocks", "workspace", "layout", "layout-tree.tsx")
  assert.ok(source.includes("activeNeighbor"), "the divider should know whether its split contains the focused pane")
  assert.ok(source.includes('activeNeighbor ? "bg-foreground/60" : "bg-border"'), "the divider beside the focused pane should be the strongest")
})

test("focused panes are lit and inactive panes are dimmed without fading their controls", () => {
  const source = read("blocks", "workspace", "pane.tsx")
  assert.ok(!source.includes('opacity-[.92]'), "pane state should not fade the whole content and its controls")
  assert.ok(source.includes('active ? "border-border bg-muted" : "border-transparent bg-transparent"'), "the focused header should be a distinct surface")
  assert.ok(source.includes('!active && "text-muted-foreground"'), "an inactive pane's text should recede through colour")
  assert.ok(source.includes('active ? "text-foreground" : "text-muted-foreground"'), "the focused title and mark should use the foreground")
})

test("another saved conversation has its own transcript and can be activated", () => {
  const source = read("blocks", "workspace", "panes", "stored-thread-pane.tsx")
  assert.ok(source.includes("findChat(id)"), "chat panes should read their own saved chat")
  assert.ok(source.includes("findSession(id)"), "code panes should read their own saved session")
  assert.ok(source.includes('onClick={() => onOpen(id)}'), "a stored pane should return to the live conversation")
})
