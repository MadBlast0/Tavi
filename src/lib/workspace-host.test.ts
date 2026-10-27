/**
 * The workspace region, checked.
 *
 * The region is the area of the window beside the rail — the area the
 * prompt composer sits in. It is not a place you go, and there are three
 * things about it that have to be true and that are easy to break by
 * accident:
 *
 * 1. **It is always there.** There is no flag and no "closed" state. The
 *    first version of this had one, and it is what put a row in the rail.
 * 2. **It fills the work area and starts below the title bar.** The title
 *    bar is drawn over the top of the work area rather than beside it, so
 *    the region has to take the bar's height off the top — and it has to be
 *    able to shrink, or a pane with long content pushes the window taller
 *    instead of scrolling.
 * 3. **The landing screen is inside it, not beside it.** The region is
 *    what they share. A sibling that took turns with it was the same
 *    mistake one layer up.
 *
 * These are read out of the source because they are structural invariants
 * (WS-01), not interactions: there is no DOM or CSS engine in the test runner
 * that could resolve the layout classes, and `diff-viewer-narrow.test.ts`
 * shows what a render test can add where structure alone makes the claim.
 */

import { test } from "node:test"
import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { join } from "node:path"

const SRC = join(import.meta.dirname, "..")
const read = (...parts: string[]) => readFileSync(join(SRC, ...parts), "utf8")

const host = read("blocks", "workspace", "workspace-host.tsx")
const surface = read("blocks", "prompt-input", "prompt-block.tsx")

/** The class list of the element whose opening tag holds this marker. */
function classesOf(source: string, marker: string): string[] {
  const at = source.indexOf(marker)
  assert.notEqual(at, -1, `there should be an element with ${marker}`)
  const end = source.indexOf(">", at)
  assert.notEqual(end, -1, `the element with ${marker} should have a tag`)
  const tag = source.slice(at, end)
  const plain = tag.match(/className="([^"]*)"/)
  if (plain) return plain[1]!.split(/\s+/).filter(Boolean)
  const built = tag.match(/className=\{cn\(\s*"([^"]*)"/)
  assert.ok(built, `the element with ${marker} should carry a className`)
  return built[1]!.split(/\s+/).filter(Boolean)
}

test("the region is always there, and asks nothing", () => {
  // A region is not open or closed. The first version of the host had an
  // `if (!open) return null` in it, and that flag is what made the
  // workspace a destination, and what put a row in the rail.
  assert.ok(
    !host.includes("if (!open) return null"),
    "the region should not be able to be switched off",
  )
  assert.ok(
    !host.includes("useWorkspace()"),
    "the region should not ask the workspace whether it is open",
  )
  assert.ok(
    !/openWorkspace|closeWorkspace/.test(host),
    "the region should not open or close anything",
  )
})

test("the region fills the work area", () => {
  // It is a flex item in the work area's column, so it takes what is left
  // over, and it has to be allowed to shrink — a flex item's default
  // minimum size is its content, and a pane with long content would push
  // the window taller instead of scrolling.
  const classes = classesOf(host, "data-slot=\"workspace-host\"")
  assert.ok(
    classes.includes("h-svh"),
    "the region should be the height of the window",
  )
  assert.ok(classes.includes("min-h-0"), "the region should be allowed to shrink")
  assert.ok(classes.includes("flex-col"), "the region should be a column, so a pane can fill it")
})

test("the region starts below the title bar", () => {
  // The title bar is drawn over the top of the work area. The padding is on
  // the region rather than on what is inside it, so the background still
  // reaches the top of the window for the bar to sit against.
  const classes = classesOf(host, "data-slot=\"workspace-host\"")
  assert.ok(
    classes.includes("pt-(--shell-top-bar-h)"),
    "the region should take the title bar's height off the top",
  )
  assert.ok(
    classes.includes("bg-background"),
    "the region should carry the work area's own background to the top",
  )
})

test("the landing screen becomes the session pane content", () => {
  // The region is what they share, so the surface is a child of it. A
  // sibling that took turns with the region was the same mistake one layer
  // up, and it is what made the composer a thing beside the workspace
  // rather than a tile in it.
  const hostTag = surface.match(/<WorkspaceHost\b[^>]*>/)?.[0]
  assert.ok(
    hostTag,
    "the surface should render the region",
  )
  assert.ok(
    surface.indexOf(hostTag!) < surface.indexOf("<main"),
    "the region should come before the surface, so the surface is inside it",
  )
  assert.ok(surface.includes("<WorkspaceLayout"), "the layout should own the live surface")
  assert.ok(surface.includes("</WorkspaceLayout>"), "the live surface should stay inside the layout host")
  assert.ok(surface.includes("context: { sessionId: id }"), "opening a thread should associate its pane with that thread")
  assert.ok(
    !surface.includes("workspaceOpen"),
    "nothing should read an 'open' flag any more",
  )
})
