/**
 * The pane frame, checked.
 *
 * A pane is a region of the window, not a card. It has a header strip, a
 * content area that takes the rest of the space, and nothing else — no
 * rounded corners, no border of its own, no shadow. These rules catch the
 * two ways that frame is broken: a pane that does not fill its parent, and
 * a pane that scrolls the window instead of itself.
 */

import { test } from "node:test"
import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { join } from "node:path"

const SRC = join(import.meta.dirname, "..")
const read = (...parts: string[]) => readFileSync(join(SRC, ...parts), "utf8")

const pane = read("blocks", "workspace", "pane.tsx")

test("the pane frame exists", () => {
  assert.ok(
    pane.includes("export function Pane"),
    "the pane frame should exist",
  )
})

test("the pane has a header strip", () => {
  assert.ok(
    pane.includes('data-slot="pane-header"'),
    "the pane should have a header strip",
  )
})

test("the pane has a content area", () => {
  assert.ok(
    pane.includes('data-slot="pane-content"'),
    "the pane should have a content area",
  )
})

test("the header is a fixed height", () => {
  // A header that grew with its content would push the content down and
  // make every pane a different size. The header is a strip.
  assert.match(
    pane,
    /data-slot="pane-header"[\s\S]*?h-8/,
    "the header should be a fixed height",
  )
})

test("the pane fills its parent", () => {
  // It is a flex item, so it takes what is left, and it has to be allowed
  // to shrink — a flex item's default minimum size is its content, and a
  // pane with long content would push the window taller instead of
  // scrolling.
  assert.ok(
    pane.includes("flex-1"),
    "the pane should fill what is left of its parent",
  )
  assert.ok(
    pane.includes("min-h-0"),
    "the pane should be allowed to shrink vertically",
  )
  assert.ok(
    pane.includes("min-w-0"),
    "the pane should be allowed to shrink horizontally",
  )
})

test("the content area scrolls on its own", () => {
  // The window does not scroll. What does not fit in the pane is the
  // content's business, and the pane's part in that is to clip, so that
  // nothing inside it can reach the edge of the window.
  assert.match(
    pane,
    /data-slot="pane-content"[\s\S]*?overflow-hidden/,
    "the content area should clip, so the pane does not scroll the window",
  )
  assert.match(
    pane,
    /data-slot="pane-content"[\s\S]*?flex-1/,
    "the content area should take the rest of the pane",
  )
})

test("the pane carries a title and an icon", () => {
  assert.ok(pane.includes("title: string"), "the pane should take a title")
  assert.ok(pane.includes("icon:"), "the pane should take an icon")
  assert.ok(pane.includes("children?:"), "the pane should take content")
})

test("the pane is a region, not a card", () => {
  // No rounded corners, no border of its own, no shadow. It is separated
  // from its neighbour by a single hairline, which is the split's job and
  // not the pane's.
  assert.ok(
    !pane.includes("rounded-"),
    "the pane should have no rounded corners of its own",
  )
  // The "shadow" in the file is in the doc comment, which is correct — the
  // pane should have no shadow of its own. The check is for a shadow utility
  // in a className, which would be a real one.
  assert.ok(
    !/shadow-(?:sm|md|lg|xl|2xl)/.test(pane),
    "the pane should have no shadow utility in its classes",
  )
})

test("the pane has a data-slot", () => {
  assert.ok(
    pane.includes('data-slot="pane"'),
    "the pane should carry a data-slot for tests and styling",
  )
})

test("the pane exposes its active state and a visible maximize restore", () => {
  assert.ok(pane.includes('role="region"'), "a pane should be a named region")
  assert.ok(pane.includes('aria-label={`${title} pane`}'), "the region should be named by its title")
  assert.ok(pane.includes('aria-current={active ? "true" : undefined}'), "the focused pane should say it is current")
  assert.ok(pane.includes('data-maximized={maximized ? "" : undefined}'), "a maximized pane should carry its state")
  assert.ok(pane.includes("maximized && onMaximize"), "the restore control should appear only while maximized")
  assert.ok(pane.includes('tooltip="Restore pane"'), "the restore control should name what it does")
})
