/**
 * The workspace host, checked.
 *
 * The host is the region the panes will live in, and there are two things
 * about it that have to be true and that are easy to break by accident:
 *
 * 1. **It is nothing at all while the workspace is closed.** The app's
 *    landing screens are the approved design and they must not move, not by
 *    a pixel, because a workspace exists.
 * 2. **It fills the work area and starts below the title bar.** The title
 *    bar is drawn over the top of the work area rather than beside it, so
 *    the host has to take the bar's height off the top the way the surface
 *    does — and it has to be able to shrink, or a pane with long content
 *    pushes the window taller instead of scrolling.
 *
 * These are read out of the source, as `layout.test.ts` and
 * `visual-baseline.test.ts` read theirs, because the project has no DOM
 * testing library and adding one is not wanted.
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

test("the host is nothing while the workspace is closed", () => {
  // The landing screens are the approved design. A workspace existing must
  // not move them by a pixel, and the cheapest way to guarantee that is for
  // the host to not be in the tree at all.
  assert.ok(
    host.includes("if (!open) return null"),
    "the host should render nothing while the workspace is closed",
  )
  assert.ok(
    host.includes("useWorkspace()"),
    "the host should ask the workspace state whether it is open",
  )
})

test("the host fills the work area", () => {
  // It is a flex item in the work area's column, so it takes what is left
  // over the surface, and it has to be allowed to shrink — a flex item's
  // default minimum size is its content, and a pane with long content
  // would push the window taller instead of scrolling.
  const classes = classesOf(host, "data-slot=\"workspace-host\"")
  assert.ok(classes.includes("flex-1"), "the host should fill what is left of the work area")
  assert.ok(classes.includes("min-h-0"), "the host should be allowed to shrink")
  assert.ok(classes.includes("flex-col"), "the host should be a column, so a pane can fill it")
})

test("the host starts below the title bar", () => {
  // The title bar is drawn over the top of the work area. The padding is on
  // the host rather than on what is inside it, so the background still
  // reaches the top of the window for the bar to sit against.
  const classes = classesOf(host, "data-slot=\"workspace-host\"")
  assert.ok(
    classes.includes("pt-(--shell-top-bar-h)"),
    "the host should take the title bar's height off the top",
  )
  assert.ok(
    classes.includes("bg-background"),
    "the host should carry the work area's own background to the top",
  )
})

test("the host is a sibling of the surface, and they take turns", () => {
  // The two of them are alternatives: the workspace has the work area, or
  // the conversation and the composer do. Putting the host inside the
  // surface would make the composer part of the workspace, which it is not
  // yet — it will one day be a tile in it, and that is a different thing.
  assert.ok(
    surface.includes("<WorkspaceHost>"),
    "the surface should render the host",
  )
  assert.ok(
    surface.includes('workspaceOpen && "hidden"'),
    "the surface should step aside while the workspace has the work area",
  )
  assert.ok(
    surface.indexOf("<WorkspaceHost>") < surface.indexOf("<main"),
    "the host should come before the surface, so the surface is the one that gives way",
  )
})
