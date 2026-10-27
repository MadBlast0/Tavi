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
  parsePersistedWorkspace,
  removePaneFromLayout,
  serializeWorkspace,
  showTab,
  validateLayout,
  visiblePaneIds,
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

test("adding panes puts each instance into one valid layout and focuses the newest", () => {
  const store = createWorkspaceStore()
  const first = store.addPane("terminal")
  assert.ok(first)
  assert.deepEqual(store.getSnapshot().layout, { kind: "pane", paneId: first.id })
  const second = store.addPane("diff")
  assert.ok(second)
  assert.equal(store.getSnapshot().activePaneId, second.id)
  assert.deepEqual(layoutPaneIds(store.getSnapshot().layout).sort(), [first.id, second.id].sort())
  assert.deepEqual(validateLayout(store.getSnapshot().layout, store.getSnapshot().panes.map((pane) => pane.id)), [])
})

test("a pane added from a header anchors beside that pane", () => {
  const store = createWorkspaceStore()
  const first = store.addPane("terminal")
  const second = store.addPane("diff")
  assert.ok(first && second)
  store.setActivePane(first.id)

  const third = store.addPane("browser", { anchorPaneId: second.id })
  assert.ok(third)
  const snapshot = store.getSnapshot()
  assert.equal(snapshot.activePaneId, third.id, "the added pane takes the focus")

  /* The focused pane is `first`, on the left. The new pane went beside
     `second` on the right instead, as the header that asked for it said. */
  const root = snapshot.layout
  assert.equal(root?.kind, "split")
  if (root?.kind !== "split") return
  assert.deepEqual(root.children[0], { kind: "pane", paneId: first.id })
  const right = root.children[1]
  assert.equal(right.kind, "split")
  if (right.kind !== "split") return
  assert.deepEqual(right.children, [
    { kind: "pane", paneId: second.id },
    { kind: "pane", paneId: third.id },
  ])
})

test("an anchor that is no longer a pane falls back to the focused pane", () => {
  const store = createWorkspaceStore()
  const first = store.addPane("terminal")
  const second = store.addPane("diff")
  assert.ok(first && second)
  store.setActivePane(first.id)

  const third = store.addPane("browser", { anchorPaneId: "gone" })
  assert.ok(third)
  const root = store.getSnapshot().layout
  assert.equal(root?.kind, "split")
  if (root?.kind !== "split") return
  const left = root.children[0]
  assert.equal(left.kind, "split")
  if (left.kind !== "split") return
  assert.deepEqual(left.children, [
    { kind: "pane", paneId: first.id },
    { kind: "pane", paneId: third.id },
  ])
})

test("a pane added beside a grouped pane joins its group", () => {
  const store = createWorkspaceStore()
  const first = store.addPane("terminal")
  const second = store.addPane("diff")
  assert.ok(first && second)
  assert.equal(store.setLayout({ kind: "group", groupId: "g-add", tabs: [first.id, second.id], activeTabId: first.id }), true)

  const third = store.addPane("browser", { anchorPaneId: second.id })
  assert.ok(third)
  const snapshot = store.getSnapshot()
  assert.deepEqual(snapshot.layout, {
    kind: "group",
    groupId: "g-add",
    tabs: [first.id, second.id, third.id],
    activeTabId: third.id,
  })
  assert.equal(snapshot.activePaneId, third.id)
  assert.deepEqual(
    validateLayout(snapshot.layout, snapshot.panes.map((pane) => pane.id)),
    [],
    "the added pane is placed, not left outside the arrangement",
  )
})

test("closing the focused pane focuses one that remains", () => {
  const store = createWorkspaceStore()
  const first = store.addPane("terminal")
  const second = store.addPane("diff")
  assert.ok(first && second)
  assert.equal(store.getSnapshot().activePaneId, second.id)

  /* The header focuses the pane a control belongs to, so closing the
     second pane makes it the focused pane first. The focus has to land on
     the pane that is left rather than on nothing. */
  store.removePane(second.id)
  assert.equal(store.getSnapshot().activePaneId, first.id)
})

test("closing the focused pane in a split focuses the visible tab, not a hidden one", () => {
  const store = createWorkspaceStore()
  const left = store.addPane("terminal")
  const hidden = store.addPane("diff")
  const showing = store.addPane("browser")
  assert.ok(left && hidden && showing)
  assert.equal(store.setLayout({
    kind: "split",
    orientation: "horizontal",
    ratio: 0.5,
    children: [
      { kind: "pane", paneId: left.id },
      {
        kind: "group",
        groupId: "g-close-visible",
        tabs: [hidden.id, showing.id],
        activeTabId: showing.id,
      },
    ],
  }), true)
  store.setActivePane(left.id)

  store.removePane(left.id)

  const snapshot = store.getSnapshot()
  assert.equal(snapshot.activePaneId, showing.id, "focus should land on the tab the group is showing")
  assert.equal(snapshot.layout?.kind === "group" ? snapshot.layout.activeTabId : null, showing.id)
  assert.deepEqual(visiblePaneIds(snapshot.layout), [showing.id], "a hidden tab is not a visible focus target")
})

test("closing the showing tab focuses and shows the next tab", () => {
  const store = createWorkspaceStore()
  const first = store.addPane("terminal")
  const second = store.addPane("diff")
  const third = store.addPane("browser")
  assert.ok(first && second && third)
  assert.equal(store.setLayout({
    kind: "group",
    groupId: "g-close-next",
    tabs: [first.id, second.id, third.id],
    activeTabId: second.id,
  }), true)
  store.setActivePane(second.id)

  store.removePane(second.id)

  const snapshot = store.getSnapshot()
  assert.equal(snapshot.activePaneId, third.id, "the next tab is the nearest surviving pane")
  assert.equal(snapshot.layout?.kind === "group" ? snapshot.layout.activeTabId : null, third.id, "the focused pane and the showing tab agree")
  assert.deepEqual(snapshot.layout?.kind === "group" ? snapshot.layout.tabs : [], [first.id, third.id])
})

test("closing the last tab focuses the previous tab", () => {
  const store = createWorkspaceStore()
  const first = store.addPane("terminal")
  const second = store.addPane("diff")
  const third = store.addPane("browser")
  assert.ok(first && second && third)
  assert.equal(store.setLayout({
    kind: "group",
    groupId: "g-close-previous",
    tabs: [first.id, second.id, third.id],
    activeTabId: third.id,
  }), true)
  store.setActivePane(third.id)

  store.removePane(third.id)

  const snapshot = store.getSnapshot()
  assert.equal(snapshot.activePaneId, second.id)
  assert.equal(snapshot.layout?.kind === "group" ? snapshot.layout.activeTabId : null, second.id)
})

test("closing a background tab leaves the active pane in front", () => {
  const store = createWorkspaceStore()
  const first = store.addPane("terminal")
  const second = store.addPane("diff")
  const third = store.addPane("browser")
  assert.ok(first && second && third)
  assert.equal(store.setLayout({
    kind: "group",
    groupId: "g-close-background",
    tabs: [first.id, second.id, third.id],
    activeTabId: first.id,
  }), true)
  store.setActivePane(first.id)

  store.removePane(third.id)

  const snapshot = store.getSnapshot()
  assert.equal(snapshot.activePaneId, first.id)
  assert.equal(snapshot.layout?.kind === "group" ? snapshot.layout.activeTabId : null, first.id)
})

test("a pane cannot be left orphaned outside the layout", () => {
  const store = createWorkspaceStore()
  const first = store.addPane("terminal")
  const second = store.addPane("diff")
  assert.ok(first && second)
  assert.equal(store.setLayout({ kind: "pane", paneId: first.id }), false)
  assert.equal(store.setLayout(null), false)
})

test("a workspace layout serializes and restores validated pane geometry only", () => {
  const source = createWorkspaceStore()
  const first = source.addPane("code-session", { title: "Build", context: { sessionId: "session-a" } })
  const second = source.addPane("diff", { context: { projectId: "project-a" } })
  assert.ok(first && second)
  const serialized = serializeWorkspace(source.getSnapshot())
  assert.ok(serialized)
  assert.equal(serialized.includes("paneState"), false)
  assert.equal(serialized.includes("turns"), false)
  const decoded = parsePersistedWorkspace(serialized)
  assert.ok(decoded)
  const restored = createWorkspaceStore()
  assert.equal(restored.restore(decoded), true)
  assert.deepEqual(layoutPaneIds(restored.getSnapshot().layout), layoutPaneIds(source.getSnapshot().layout))
  assert.deepEqual(restored.getSnapshot().panes, source.getSnapshot().panes)
})

test("a pane's own state never changes the serialized workspace", () => {
  const store = createWorkspaceStore()
  const first = store.addPane("terminal")
  const second = store.addPane("diff")
  assert.ok(first && second)
  const before = serializeWorkspace(store.getSnapshot())
  store.setPaneState(first.id, { selectedFile: "src/App.tsx", filter: "open" })
  const after = serializeWorkspace(store.getSnapshot())
  assert.equal(after, before, "pane-local changes are not geometry and must not rewrite the saved layout")
  const geometry = serializeWorkspace({
    panes: store.getSnapshot().panes,
    activePaneId: store.getSnapshot().activePaneId,
    layout: store.getSnapshot().layout,
  })
  assert.equal(geometry, before, "the geometry-only call should produce the same string")
})

test("a pane's own state keeps the geometry's identity", () => {
  // The persistence effect watches these three values. If a pane-local
  // change replaced any of them, the effect would run on every keystroke
  // even though the serialized layout was the same.
  const store = createWorkspaceStore()
  const pane = store.addPane("diff")
  assert.ok(pane)
  const before = store.getSnapshot()
  store.setPaneState(pane.id, { selectedFile: "src/App.tsx" })
  const after = store.getSnapshot()
  assert.notEqual(after, before, "the snapshot itself is replaced")
  assert.equal(after.panes, before.panes)
  assert.equal(after.activePaneId, before.activePaneId)
  assert.equal(after.layout, before.layout)
})

test("corrupt and incomplete saved layouts are refused", () => {
  assert.equal(parsePersistedWorkspace("not-json"), null)
  assert.equal(parsePersistedWorkspace(JSON.stringify({ version: 1, panes: [], layout: null, activePaneId: null })), null)
  assert.equal(parsePersistedWorkspace(JSON.stringify({
    version: 1,
    panes: [{ id: "p1", type: "terminal" }, { id: "p2", type: "diff" }],
    activePaneId: "p1",
    layout: { kind: "pane", paneId: "p1" },
  })), null)
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

test("a session pane keeps its session reference when its pane type changes", () => {
  const store = createWorkspaceStore()
  const pane = store.addPane("chat", { context: { sessionId: "chat-1" } })
  assert.ok(pane)
  store.setPaneType(pane.id, "code-session")
  store.setPaneContext(pane.id, { sessionId: "session-2", projectId: "project-1" })
  assert.deepEqual(store.getSnapshot().panes[0], {
    id: pane.id,
    type: "code-session",
    context: { sessionId: "session-2", projectId: "project-1" },
  })
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
  assert.equal(after.activeTabId, "b", "the pane that moved shows")
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
  assert.equal(after.activeTabId, "b", "the pane that moved shows")
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

test("tabs can be reordered within their group and not across groups", () => {
  const store = createWorkspaceStore()
  const a = store.addPane("terminal")
  const b = store.addPane("diff")
  const c = store.addPane("logs")
  assert.ok(a && b && c)
  assert.equal(store.setLayout({ kind: "group", groupId: "g-test", tabs: [a.id, b.id, c.id], activeTabId: a.id }), true)
  assert.equal(store.reorderTab(c.id, a.id), true)
  assert.deepEqual(store.getSnapshot().layout, { kind: "group", groupId: "g-test", tabs: [c.id, a.id, b.id], activeTabId: a.id })
  assert.equal(store.reorderTab(c.id, "unknown"), false)
})

test("the store moves a pane, and refuses a move it cannot make", () => {
  const store = createWorkspaceStore()
  const a = store.addPane("terminal")
  const b = store.addPane("chat")
  assert.ok(a && b)

  assert.equal(store.dockPane(b.id, a.id, "right"), true)
  assert.equal(store.getSnapshot().layout?.kind, "split")
  assert.equal(store.dockPane(b.id, b.id, "right"), false, "a pane cannot be dropped on itself")
  assert.equal(store.dockPane("nope", a.id, "right"), false, "a pane that is not there cannot be moved")
})

test("a successful dock focuses the pane that moved", () => {
  const store = createWorkspaceStore()
  const a = store.addPane("terminal")
  const b = store.addPane("chat")
  assert.ok(a && b)
  store.setActivePane(a.id)

  assert.equal(store.dockPane(b.id, a.id, "right"), true)
  assert.equal(store.getSnapshot().activePaneId, b.id, "an edge dock should focus the moved pane")

  assert.equal(store.dockPane(b.id, a.id, "center"), true)
  const snapshot = store.getSnapshot()
  assert.equal(snapshot.activePaneId, b.id, "a tab dock should focus the moved pane")
  assert.equal(snapshot.layout?.kind, "group")
  if (snapshot.layout?.kind === "group") {
    assert.deepEqual(snapshot.layout.tabs, [a.id, b.id])
    assert.equal(snapshot.layout.activeTabId, b.id, "a tab dock should show the moved pane")
  }
})

test("a tab dropped on another group joins it and leaves its old group", () => {
  const store = createWorkspaceStore()
  const a = store.addPane("terminal")
  const b = store.addPane("diff")
  const c = store.addPane("browser")
  const d = store.addPane("files")
  assert.ok(a && b && c && d)
  assert.equal(store.setLayout({
    kind: "split",
    orientation: "horizontal",
    ratio: 0.5,
    children: [
      { kind: "group", groupId: "g-left", tabs: [a.id, b.id], activeTabId: b.id },
      { kind: "group", groupId: "g-right", tabs: [c.id, d.id], activeTabId: c.id },
    ],
  }), true)
  store.setActivePane(b.id)

  assert.equal(store.dockPane(b.id, c.id, "center"), true)
  const snapshot = store.getSnapshot()
  assert.equal(snapshot.activePaneId, b.id, "the dropped tab takes the focus")
  assert.equal(snapshot.layout?.kind, "split")
  if (snapshot.layout?.kind !== "split") return
  assert.deepEqual(
    snapshot.layout.children[0],
    { kind: "pane", paneId: a.id },
    "the group it left collapses to the tab that stayed",
  )
  assert.deepEqual(
    snapshot.layout.children[1],
    { kind: "group", groupId: "g-right", tabs: [c.id, d.id, b.id], activeTabId: b.id },
    "the dropped tab joins the target group and shows there",
  )
  assert.deepEqual(
    layoutPaneIds(snapshot.layout).sort(),
    [a.id, b.id, c.id, d.id].sort(),
    "the moved tab exists once",
  )
})

test("focusing a pane brings its tab forward", () => {
  const store = createWorkspaceStore()
  const a = store.addPane("terminal")
  const b = store.addPane("diff")
  assert.ok(a && b)
  assert.equal(store.setLayout({ kind: "group", groupId: "g-focus", tabs: [a.id, b.id], activeTabId: a.id }), true)
  store.setActivePane(b.id)
  let snapshot = store.getSnapshot()
  assert.equal(snapshot.activePaneId, b.id)
  assert.equal(snapshot.layout?.kind === "group" ? snapshot.layout.activeTabId : null, b.id)

  /* The active pane can name a hidden tab after a layout change. Focusing
     that same pane still has to bring its tab forward. */
  assert.equal(store.setLayout({ kind: "group", groupId: "g-focus", tabs: [a.id, b.id], activeTabId: a.id }), true)
  store.setActivePane(b.id)
  snapshot = store.getSnapshot()
  assert.equal(snapshot.activePaneId, b.id)
  assert.equal(snapshot.layout?.kind === "group" ? snapshot.layout.activeTabId : null, b.id)

  /* Choosing the tab that is already showing still focuses its pane. */
  store.setActivePane(a.id)
  store.setLayout({ kind: "group", groupId: "g-focus", tabs: [a.id, b.id], activeTabId: a.id })
  store.setActiveTab(a.id)
  assert.equal(store.getSnapshot().activePaneId, a.id)
})

test("a move keeps both panes' identities", () => {
  const store = createWorkspaceStore()
  const a = store.addPane("terminal")
  const b = store.addPane("chat")
  assert.ok(a && b)
  store.dockPane(b.id, a.id, "bottom")
  const ids = layoutPaneIds(store.getSnapshot().layout)
  assert.deepEqual(ids.sort(), [a.id, b.id].sort())
})
