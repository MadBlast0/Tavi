/**
 * The P2 workspace polish, checked at its source.
 *
 * Three rules, one for each audit item in this batch:
 *
 * - a tab group shares the pane's one chrome band, and its tabs are flat
 *   rectangles rather than a second card above the pane;
 * - a workspace notice floats over the layout instead of taking a row that
 *   moves every pane;
 * - a split drag publishes on pointer-up only, and the saved layout is
 *   written only when its serialized geometry changes.
 */

import { test } from "node:test"
import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { join } from "node:path"

const SRC = join(import.meta.dirname, "..")
const read = (...parts: string[]) => readFileSync(join(SRC, ...parts), "utf8")

const tree = read("blocks", "workspace", "layout", "layout-tree.tsx")
const pane = read("blocks", "workspace", "pane.tsx")
const layout = read("blocks", "workspace", "workspace-layout.tsx")

test("a tab group puts its strip in the pane's single header band", () => {
  assert.ok(tree.includes("const chrome: PaneTabStrip = {"), "the group should describe chrome for the pane")
  assert.ok(tree.includes("strip: maximizedPaneId ? null : ("), "a maximized group should show the pane's own title")
  assert.ok(tree.includes("PaneTabStripContext.Provider value={chrome}"), "the group should lend the strip to the showing pane")
  assert.ok(pane.includes("React.useContext(PaneTabStripContext)"), "the pane should read the group's chrome")
  assert.ok(pane.includes("{tabStrip?.strip ? tabStrip.strip : ("), "the strip should take the title's place in the header")
  assert.ok(
    tree.includes('className="flex h-full min-w-0 flex-1 items-stretch overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"'),
    "the strip should fill the existing header rather than add a second row",
  )
  assert.ok(!tree.includes('className="flex h-8 shrink-0 items-stretch'), "the strip must not keep its own 32px band")
})

test("workspace tabs are rectangular and flat", () => {
  assert.equal(tree.includes("rounded-t-md"), false, "a tab should not read as a rounded card")
  assert.ok(tree.includes("border-e border-border/60 last:border-e-0"), "tabs should be divided by a flat hairline")
  assert.ok(tree.includes("data-active:bg-background data-active:text-foreground"), "the active tab should be a flat filled rectangle")
})

test("a tab drag is not swallowed by the draggable pane header", () => {
  const button = tree.slice(tree.indexOf("function TabButton"), tree.indexOf("function workspaceTabId"))
  assert.ok(
    button.indexOf("event.stopPropagation()") >= 0 && button.indexOf("event.stopPropagation()") < button.indexOf("startWorkspaceNativeDrag"),
    "the tab must stop the header from taking its drag",
  )
})

test("a sibling tab is the focus fallback when a grouped pane closes", () => {
  assert.ok(layout.includes("document.getElementById(`workspace-tab-${nextPaneId}`)"))
  assert.ok(layout.includes("(paneTitle ?? paneTab)?.focus()"))
  assert.ok(layout.includes("if (snapshot.panes.length === 0)"), "the workspace region is the fallback only when no panes remain")
})

test("a notice floats over the workspace and never changes its geometry", () => {
  assert.ok(!layout.includes('{notice ? <p className="shrink-0'), "the notice must not be an in-flow row")
  assert.ok(layout.includes('className="pointer-events-none absolute inset-x-0 top-2 z-30 flex justify-center px-2"'), "the notice should be an overlay")
  assert.ok(layout.includes('role="status"'), "the overlay should announce itself")
  assert.ok(layout.includes("setTimeout(() => setNotice(null), NOTICE_TIMEOUT_MS)"), "the notice should dismiss itself")
  assert.ok(layout.includes('"relative flex min-h-0 min-w-0 flex-1 flex-col'), "the workspace should position the overlay without taking a row")
})

test("a split drag publishes once, when the pointer comes up", () => {
  const split = tree.slice(tree.indexOf("function Split("), tree.indexOf("function SplitSeparator"))
  const onRatio = split.slice(split.indexOf("const onRatio"), split.indexOf("const onDragEnd"))
  assert.ok(onRatio.includes("ratioRef.current = clamped"))
  assert.ok(onRatio.includes("setRatio(clamped)"))
  assert.ok(!onRatio.includes("updateLayout"), "a pointer move must not publish the workspace")
  const dragEndStart = split.indexOf("const onDragEnd")
  const onDragEnd = split.slice(dragEndStart, split.indexOf("\n  return (", dragEndStart))
  assert.ok(onDragEnd.includes("const next = ratioRef.current"))
  assert.ok(onDragEnd.includes("if (next === node.ratio) return"), "an unchanged ratio should not be written")
  assert.ok(onDragEnd.includes("updateLayout((current) => replaceSplitAtPath(current, path, next))"))
  assert.equal(split.match(/updateLayout\(/g)?.length, 1, "the split should have exactly one commit site")
})

test("the layout is written only when its serialized geometry changes", () => {
  assert.ok(layout.includes("const serializedWorkspace = React.useMemo("))
  assert.ok(layout.includes("serializeWorkspace({ panes, activePaneId, layout })"))
  assert.ok(layout.includes("writtenWorkspaceRef.current === serializedWorkspace"))
  assert.ok(layout.includes("}, [serializedWorkspace, storageReady])"), "the effect should watch the serialized string, not the snapshot")
  assert.ok(!layout.includes("[snapshot, storageReady]"), "pane-local state must not rerun the storage effect")
})
