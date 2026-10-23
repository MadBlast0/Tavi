/**
 * The workspace's state, checked.
 *
 * The state holds six things: the pane instances, the pane that has focus,
 * the arrangement, the overlay that is open, and each pane's own state. It
 * does **not** hold whether the workspace is open, because the workspace is
 * the region of the window beside the rail and a region is not open or
 * closed — it is there, and what it shows is decided by what is in it.
 *
 * What the state cannot check is whether the workspace duplicates the app's
 * own state, and the third test is the one that answers it: the workspace
 * holds six things, and the app's section and the app's active thread are
 * not among them.
 *
 * The arrangement is the other half. It is a tree of three kinds of node —
 * a pane, a split, and a group of panes sharing one place — and the tests
 * below are the rules on it: what may be in it, what happens when a pane is
 * taken out of it, and what a drop does to it.
 */

import { test } from "node:test"
import assert from "node:assert/strict"

import {
  createWorkspaceStore,
  dockPaneInto,
  layoutPaneIds,
  removePaneFromLayout,
  showTab,
  validateLayout,
  MAX_VISIBLE_PANES,
  type LayoutNode,
} from "./workspace-state.ts"

test("a new workspace is empty, and has nothing in it", () => {
  const store = createWorkspaceStore()
  const snapshot = store.getSnapshot()
  assert.deepEqual(snapshot.panes, [])
  assert.equal(snapshot.activePaneId, null)
  assert.equal(snapshot.layout, null)
  assert.equal(snapshot.overlay, null)
  assert.deepEqual(snapshot.paneState, {})
})

test("the workspace keeps no copy of the app's section or its active thread", () => {
  // The rail's switch says which side you are on and the thread bridge
  // says which conversation is open. A second copy of either would be two
  // answers to one question, and the two would disagree the first time
  // somebody used the switch while the workspace was showing.
  const store = createWorkspaceStore()
  const snapshot = store.getSnapshot()
  for (const key of Object.keys(snapshot)) {
    assert.ok(
      !["variant", "side", "activeThread", "threadId", "sessionId"].includes(key),
      `the workspace should not hold ${key}`,
    )
  }
})

test("the workspace holds no more than six panes", () => {
  // The product's rule (§1.5). A group of three tabs is three panes, and
  // a pane behind a tab still counts: the cap is about pane instances, not
  // about places.
  const store = createWorkspaceStore()
  for (let i = 0; i < MAX_VISIBLE_PANES; i++) {
    assert.ok(store.addPane("terminal"), `pane ${i + 1} should be added`)
  }
  assert.equal(store.addPane("terminal"), null, "the seventh pane should be refused")
  assert.equal(store.getSnapshot().panes.length, MAX_VISIBLE_PANES)
})

test("adding a pane gives it an id nobody else has", () => {
  const store = createWorkspaceStore()
  const ids = new Set<string>()
  for (let i = 0; i < 6; i++) {
    const pane = store.addPane("chat")
    assert.ok(pane)
    assert.ok(!ids.has(pane.id), "two panes shared an id")
    ids.add(pane.id)
  }
})

test("removing a pane takes away what referred to it", () => {
  const store = createWorkspaceStore()
  const pane = store.addPane("terminal")
  assert.ok(pane)
  store.setActivePane(pane.id)
  store.openOverlay("pane-menu", pane.id)
  store.setPaneState(pane.id, { selected: 3 })

  store.removePane(pane.id)

  const snapshot = store.getSnapshot()
  assert.deepEqual(snapshot.panes, [])
  assert.equal(snapshot.activePaneId, null)
  assert.equal(snapshot.overlay, null)
  assert.deepEqual(snapshot.paneState, {})
})

test("removing a pane does not touch the session it was about", () => {
  // Closing a window onto a conversation is not closing the conversation.
  // The pane holds a reference to the session; the session is the app's.
  const store = createWorkspaceStore()
  const pane = store.addPane("code-session", {
    context: { sessionId: "s-1", projectId: "p-1" },
  })
  assert.ok(pane)
  assert.equal(pane.context?.sessionId, "s-1")

  store.removePane(pane.id)

  assert.deepEqual(store.getSnapshot().panes, [])
  /* The store never held the session, so there is nothing of it here to
     have been thrown away. */
  assert.equal(
    Object.keys(store.getSnapshot().paneState).length,
    0,
    "the pane's own state went with the pane, and the session was never in it",
  )
})

test("a pane can be given a title of its own", () => {
  const store = createWorkspaceStore()
  const pane = store.addPane("terminal")
  assert.ok(pane)
  store.setPaneTitle(pane.id, "Build")
  assert.equal(store.getSnapshot().panes[0].title, "Build")
  store.setPaneTitle(pane.id, undefined)
  assert.equal(store.getSnapshot().panes[0].title, undefined)
})

test("an arrangement that names a pane that is not there is refused", () => {
  const store = createWorkspaceStore()
  const pane = store.addPane("terminal")
  assert.ok(pane)
  const good: LayoutNode = { kind: "pane", paneId: pane.id }
  assert.equal(store.setLayout(good), true)
  const bad: LayoutNode = { kind: "pane", paneId: "nope" }
  assert.equal(store.setLayout(bad), false)
  assert.deepEqual(store.getSnapshot().layout, good, "the refused layout changed nothing")
})

test("the arrangement must not put a pane in two places", () => {
  const store = createWorkspaceStore()
  const a = store.addPane("terminal")
  const b = store.addPane("chat")
  assert.ok(a && b)
  const doubled: LayoutNode = {
    kind: "split",
    orientation: "horizontal",
    ratio: 0.5,
    children: [
      { kind: "pane", paneId: a.id },
      { kind: "pane", paneId: a.id },
    ],
  }
  assert.equal(store.setLayout(doubled), false)
})

test("a split's ratio must be a share of something", () => {
  const store = createWorkspaceStore()
  const a = store.addPane("terminal")
  const b = store.addPane("chat")
  assert.ok(a && b)
  for (const ratio of [0, 1, -0.5, 1.5, Number.NaN]) {
    const node: LayoutNode = {
      kind: "split",
      orientation: "horizontal",
      ratio,
      children: [
        { kind: "pane", paneId: a.id },
        { kind: "pane", paneId: b.id },
      ],
    }
    assert.equal(store.setLayout(node), false, `a ratio of ${ratio} should be refused`)
  }
})

test("taking a pane out collapses the branch it was in", () => {
  const tree: LayoutNode = {
    kind: "split",
    orientation: "horizontal",
    ratio: 0.5,
    children: [
      { kind: "pane", paneId: "a" },
      {
        kind: "split",
        orientation: "vertical",
        ratio: 0.5,
        children: [
          { kind: "pane", paneId: "b" },
          { kind: "pane", paneId: "c" },
        ],
      },
    ],
  }
  const after = removePaneFromLayout(tree, "b")
  assert.ok(after)
  assert.deepEqual(layoutPaneIds(after), ["a", "c"])
  assert.equal(after.kind, "split")
  assert.equal(after.children[1].kind, "pane", "the empty branch collapsed")
})

test("a group left with one tab is a pane, not a group", () => {
  // A tab strip with one tab on it is a decoration and not a control, so
  // the model does not keep one.
  const tree: LayoutNode = {
    kind: "group",
    groupId: "g-1",
    tabs: ["a", "b"],
    activeTabId: "a",
  }
  const after = removePaneFromLayout(tree, "b")
  assert.deepEqual(after, { kind: "pane", paneId: "a" })
})

test("a group must show a tab it has", () => {
  const problems = validateLayout(
    { kind: "group", groupId: "g-1", tabs: ["a"], activeTabId: "b" },
    ["a", "b"],
  )
  assert.ok(problems.length > 0, "a group showing a tab it does not have is a problem")
})

test("a drop on an edge splits the pane it was dropped on", () => {
  const tree: LayoutNode = { kind: "pane", paneId: "a" }
  const after = dockPaneInto(tree, "b", "a", "right")
  assert.ok(after)
  assert.equal(after.kind, "split")
  if (after.kind !== "split") return
  assert.equal(after.orientation, "horizontal")
  assert.equal(after.ratio, 0.5)
  assert.deepEqual(after.children[0], { kind: "pane", paneId: "a" })
  assert.deepEqual(after.children[1], { kind: "pane", paneId: "b" })
})

test("a drop on the top or the bottom splits the other way", () => {
  const tree: LayoutNode = { kind: "pane", paneId: "a" }
  const below = dockPaneInto(tree, "b", "a", "bottom")
  assert.ok(below)
  if (below.kind !== "split") return
  assert.equal(below.orientation, "vertical")
  assert.deepEqual(below.children[0], { kind: "pane", paneId: "a" })
  assert.deepEqual(below.children[1], { kind: "pane", paneId: "b" })
})

test("a drop in the middle makes a group of the two", () => {
  const tree: LayoutNode = { kind: "pane", paneId: "a" }
  const after = dockPaneInto(tree, "b", "a", "center")
  assert.ok(after)
  assert.equal(after.kind, "group")
  if (after.kind !== "group") return
  assert.deepEqual(after.tabs, ["a", "b"])
  assert.equal(after.activeTabId, "a", "the pane that was dropped on keeps showing")
})

test("a drop in the middle of a group joins that group", () => {
  const tree: LayoutNode = {
    kind: "group",
    groupId: "g-1",
    tabs: ["a"],
    activeTabId: "a",
  }
  const after = dockPaneInto(tree, "b", "a", "center")
  assert.ok(after)
  assert.equal(after.kind, "group")
  if (after.kind !== "group") return
  assert.deepEqual(after.tabs, ["a", "b"])
})

test("a pane dropped on itself goes nowhere", () => {
  const tree: LayoutNode = { kind: "pane", paneId: "a" }
  assert.equal(dockPaneInto(tree, "a", "a", "right"), tree)
})

test("moving a pane does not make a second one of it", () => {
  const tree: LayoutNode = {
    kind: "split",
    orientation: "horizontal",
    ratio: 0.5,
    children: [
      { kind: "pane", paneId: "a" },
      { kind: "pane", paneId: "b" },
    ],
  }
  const after = dockPaneInto(tree, "b", "a", "right")
  assert.ok(after)
  assert.deepEqual(layoutPaneIds(after).sort(), ["a", "b"])
})

test("a group can show another of its tabs", () => {
  const tree: LayoutNode = {
    kind: "group",
    groupId: "g-1",
    tabs: ["a", "b"],
    activeTabId: "a",
  }
  const after = showTab(tree, "g-1", "b")
  assert.ok(after)
  assert.equal(after.kind, "group")
  if (after.kind !== "group") return
  assert.equal(after.activeTabId, "b")
  assert.deepEqual(after.tabs, ["a", "b"], "the order of the tabs did not change")
})

test("the store moves a pane, and refuses a move it cannot make", () => {
  const store = createWorkspaceStore()
  const a = store.addPane("terminal")
  const b = store.addPane("chat")
  assert.ok(a && b)
  assert.equal(store.setLayout({ kind: "pane", paneId: a.id }), true)

  assert.equal(store.dockPane(b.id, a.id, "right"), true)
  assert.equal(store.getSnapshot().layout?.kind, "split")
  assert.equal(store.dockPane(b.id, b.id, "right"), false, "a pane cannot be dropped on itself")
  assert.equal(store.dockPane("nope", a.id, "right"), false, "a pane that is not there cannot be moved")
})

test("a move keeps both panes' identities", () => {
  const store = createWorkspaceStore()
  const a = store.addPane("terminal")
  const b = store.addPane("chat")
  assert.ok(a && b)
  store.setLayout({ kind: "pane", paneId: a.id })
  store.dockPane(b.id, a.id, "bottom")
  const ids = layoutPaneIds(store.getSnapshot().layout)
  assert.deepEqual(ids.sort(), [a.id, b.id].sort())
})
