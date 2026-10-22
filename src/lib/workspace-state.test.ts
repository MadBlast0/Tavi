/**
 * The workspace's state, checked.
 *
 * The rules here are the ones the plan asks for and the ones the next task
 * will lean on: a pane has an id nobody else has, two panes of the same
 * type do not share their own state, the arrangement carries no pane's
 * content, and there is room for one overlay.
 *
 * What it cannot check is whether the workspace duplicates the app's own
 * state, because that is a question about a field that is *not* there. The
 * third test is the one that answers it: the workspace holds six things,
 * and the app section and the active thread are not among them.
 */

import { test } from "node:test"
import assert from "node:assert/strict"

import {
  MAX_VISIBLE_PANES,
  createWorkspaceStore,
  layoutPaneIds,
  validateLayout,
  type LayoutNode,
} from "./workspace-state.ts"

/**
 * Every string anywhere in a value, whatever it is nested in.
 *
 * The arrangement's shape is a union, so reading its known fields one by one
 * would only prove that the fields it has today hold what they should. This
 * walks the value as it is, so a field that was added to hold a pane's
 * content is found whichever field it is.
 */
const stringsIn = (value: unknown): string[] => {
  if (typeof value === "string") return [value]
  if (Array.isArray(value)) return value.flatMap(stringsIn)
  if (value && typeof value === "object") {
    return Object.values(value).flatMap(stringsIn)
  }
  return []
}

/**
 * The words the arrangement is written in.
 *
 * Everything else in it has to be a pane's id. These four are how the tree
 * says what it is — a leaf or a split, side by side or one above the other
 * — and they are the only strings in it that are not somebody's pane.
 */
const ARRANGEMENT_WORDS = new Set([
  "pane",
  "split",
  "horizontal",
  "vertical",
])

/** Two panes side by side. */
const sideBySide = (
  first: string,
  second: string,
): LayoutNode => ({
  kind: "split",
  orientation: "horizontal",
  ratio: 0.5,
  children: [
    { kind: "pane", paneId: first },
    { kind: "pane", paneId: second },
  ],
})

test("a new workspace is closed, and has nothing in it", () => {
  const store = createWorkspaceStore()
  const snapshot = store.getSnapshot()

  assert.equal(snapshot.open, false)
  assert.deepEqual(snapshot.panes, [])
  assert.equal(snapshot.activePaneId, null)
  assert.equal(snapshot.layout, null)
  assert.equal(snapshot.overlay, null)
  assert.deepEqual(snapshot.paneState, {})
})

test("the workspace keeps no copy of the app's section or its active thread", () => {
  // The section belongs to the composer variant provider and the active
  // thread to the thread bridge. A copy here would be a second answer to
  // "which side are we on" and to "what is open", and the two would
  // disagree the first time the rail's switch was used.
  const store = createWorkspaceStore()
  assert.deepEqual(Object.keys(store.getSnapshot()).sort(), [
    "activePaneId",
    "layout",
    "open",
    "overlay",
    "paneState",
    "panes",
  ])
})

test("a change tells whatever is watching", () => {
  const store = createWorkspaceStore()
  let told = 0
  const off = store.subscribe(() => {
    told += 1
  })

  store.open()
  assert.equal(told, 1)

  store.addPane("terminal")
  assert.equal(told, 2)

  off()
  store.close()
  assert.equal(told, 2, "a listener that has gone should not be called")
})

test("every pane gets an id nobody else has", () => {
  const store = createWorkspaceStore()
  const ids = new Set<string>()

  for (let i = 0; i < 5; i++) {
    const pane = store.addPane("file-explorer")
    assert.ok(pane, "there is room for five panes")
    assert.ok(!ids.has(pane.id), `the id ${pane.id} was handed out twice`)
    ids.add(pane.id)
  }

  assert.equal(store.getSnapshot().panes.length, 5)
})

test("two panes of the same type do not share their own state", () => {
  // The plan says so twice, in §1.5 and in §6.4: a pane's own state is
  // kept per instance. A file selected in one File Explorer says nothing
  // about the other one, and the only way to keep it that way is to key the
  // state by the instance rather than by the type.
  const store = createWorkspaceStore()
  const first = store.addPane("file-explorer")
  const second = store.addPane("file-explorer")
  assert.ok(first && second)

  store.setPaneState(first.id, { selectedPath: "src/lib/api.ts" })
  store.setPaneState(second.id, { selectedPath: "README.md" })

  assert.equal(
    store.getSnapshot().paneState[first.id].selectedPath,
    "src/lib/api.ts",
  )
  assert.equal(
    store.getSnapshot().paneState[second.id].selectedPath,
    "README.md",
  )
})

test("a pane's own state is merged rather than replaced", () => {
  // A pane that keeps two things does not lose the first when the second
  // is set — the file tree and the filter are both the explorer's, and
  // setting the filter is not a reason to forget the file.
  const store = createWorkspaceStore()
  const pane = store.addPane("file-explorer")
  assert.ok(pane)

  store.setPaneState(pane.id, { selectedPath: "src/lib/api.ts" })
  store.setPaneState(pane.id, { filter: "api" })

  assert.deepEqual(store.getSnapshot().paneState[pane.id], {
    selectedPath: "src/lib/api.ts",
    filter: "api",
  })
})

test("the active pane is one of the panes, or none", () => {
  const store = createWorkspaceStore()
  const pane = store.addPane("terminal")
  assert.ok(pane)

  assert.equal(store.getSnapshot().activePaneId, null)

  store.setActivePane(pane.id)
  assert.equal(store.getSnapshot().activePaneId, pane.id)

  /* An id that is not a pane is refused rather than remembered: a focus
     that points at nothing is a focus nobody can draw. */
  store.setActivePane("p-not-a-pane")
  assert.equal(store.getSnapshot().activePaneId, pane.id)

  store.setActivePane(null)
  assert.equal(store.getSnapshot().activePaneId, null)
})

test("the arrangement does not carry a pane's content", () => {
  // The geometry says where a pane is. What is in it belongs to the pane,
  // and a tree that could carry a pane's state would have to be rewritten
  // every time the state changed.
  const store = createWorkspaceStore()
  const terminal = store.addPane("terminal")
  const explorer = store.addPane("file-explorer")
  assert.ok(terminal && explorer)

  store.setPaneState(terminal.id, { selectedPath: "src/lib/api.ts" })
  assert.equal(store.setLayout(sideBySide(terminal.id, explorer.id)), true)

  const layout = store.getSnapshot().layout
  for (const value of stringsIn(layout)) {
    assert.ok(
      value === terminal.id ||
        value === explorer.id ||
        ARRANGEMENT_WORDS.has(value),
      `the arrangement holds the string ${value}, which is neither a pane's id nor one of the arrangement's own words`,
    )
  }

  assert.ok(
    !JSON.stringify(layout).includes("src/lib/api.ts"),
    "the arrangement should not hold the pane's own state",
  )
})

test("an arrangement cannot name a pane that is not there", () => {
  // A pane is added before it is placed. The other order leaves a blank
  // space on screen where a pane was promised.
  const store = createWorkspaceStore()
  const pane = store.addPane("terminal")
  assert.ok(pane)

  assert.equal(store.setLayout({ kind: "pane", paneId: "p-nothing" }), false)
  assert.equal(store.getSnapshot().layout, null)

  assert.equal(store.setLayout({ kind: "pane", paneId: pane.id }), true)
})

test("a pane cannot be in the arrangement twice", () => {
  const store = createWorkspaceStore()
  const pane = store.addPane("terminal")
  assert.ok(pane)

  const twice = sideBySide(pane.id, pane.id)
  assert.equal(store.setLayout(twice), false)
  assert.equal(store.getSnapshot().layout, null)

  const problems = validateLayout(twice, [pane.id])
  assert.equal(problems.length, 1)
  assert.match(problems[0], /twice/)
})

test("a split divides the space it has", () => {
  const store = createWorkspaceStore()
  const pane = store.addPane("terminal")
  assert.ok(pane)

  const impossible: LayoutNode = {
    kind: "split",
    orientation: "horizontal",
    ratio: 1.4,
    children: [
      { kind: "pane", paneId: pane.id },
      { kind: "pane", paneId: pane.id },
    ],
  }
  assert.equal(store.setLayout(impossible), false)
})

test("the arrangement names the panes in the order it walks them", () => {
  const store = createWorkspaceStore()
  const first = store.addPane("terminal")
  const second = store.addPane("file-explorer")
  const third = store.addPane("logs")
  assert.ok(first && second && third)

  const layout: LayoutNode = {
    kind: "split",
    orientation: "vertical",
    ratio: 0.4,
    children: [
      { kind: "pane", paneId: first.id },
      sideBySide(second.id, third.id),
    ],
  }

  assert.deepEqual(layoutPaneIds(layout), [first.id, second.id, third.id])
})

test("only one overlay is open at a time", () => {
  // The plan's §3.5: never create multiple competing overlays for one
  // action. There is room for one overlay, and opening one closes what was
  // there.
  const store = createWorkspaceStore()

  store.openOverlay("views-menu")
  assert.equal(store.getSnapshot().overlay?.action, "views-menu")

  store.openOverlay("layout-presets")
  assert.equal(store.getSnapshot().overlay?.action, "layout-presets")

  store.closeOverlay()
  assert.equal(store.getSnapshot().overlay, null)
})

test("an overlay can belong to a pane", () => {
  const store = createWorkspaceStore()
  const pane = store.addPane("terminal")
  assert.ok(pane)

  store.openOverlay("pane-menu", pane.id)
  assert.equal(store.getSnapshot().overlay?.paneId, pane.id)
})

test("the workspace holds no more than six panes", () => {
  // The product's rule, in §1.5 of the plan. It is checked where a pane is
  // added, because that is the moment the user asks for one too many.
  const store = createWorkspaceStore()

  for (let i = 0; i < MAX_VISIBLE_PANES; i++) {
    assert.ok(store.addPane("terminal"), `pane ${i + 1} should have been added`)
  }
  assert.equal(store.addPane("terminal"), null)
  assert.equal(store.getSnapshot().panes.length, MAX_VISIBLE_PANES)
})

test("removing a pane takes away what referred to it", () => {
  const store = createWorkspaceStore()
  const terminal = store.addPane("terminal")
  const explorer = store.addPane("file-explorer")
  assert.ok(terminal && explorer)

  store.setPaneState(terminal.id, { selectedPath: "src/lib/api.ts" })
  store.setActivePane(terminal.id)
  store.openOverlay("pane-menu", terminal.id)
  store.setLayout(sideBySide(terminal.id, explorer.id))

  store.removePane(terminal.id)

  const snapshot = store.getSnapshot()
  assert.equal(snapshot.panes.length, 1)
  assert.equal(snapshot.paneState[terminal.id], undefined)
  assert.equal(snapshot.activePaneId, null)
  assert.equal(snapshot.overlay, null)
  /* The branch the pane was in collapses into what is left of it. */
  assert.deepEqual(snapshot.layout, { kind: "pane", paneId: explorer.id })
})

test("removing a pane does not touch the session it was about", () => {
  // The session is the app's, not the workspace's. Closing a window onto a
  // conversation is not closing the conversation.
  const store = createWorkspaceStore()
  const pane = store.addPane("terminal", {
    context: { sessionId: "s-abc", projectId: "f-abc" },
  })
  assert.ok(pane)

  assert.equal(pane.context?.sessionId, "s-abc")
  assert.equal(pane.context?.projectId, "f-abc")

  store.removePane(pane.id)
  assert.equal(store.getSnapshot().panes.length, 0)
})

test("closing the workspace keeps what is in it", () => {
  // Closing hides the workspace; it does not empty it. A close that also
  // threw the arrangement away would lose the arrangement every time
  // somebody looked at the landing screen.
  const store = createWorkspaceStore()
  const pane = store.addPane("terminal")
  assert.ok(pane)
  store.open()

  store.close()

  const snapshot = store.getSnapshot()
  assert.equal(snapshot.open, false)
  assert.equal(snapshot.panes.length, 1)
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
