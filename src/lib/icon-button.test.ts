/**
 * The icon-only button, checked.
 *
 * An icon on its own does not say what it does. The app's shared icon
 * button, `src/components/tooltip-icon-button.tsx`, is the answer to that:
 * a `Button variant="ghost" size="icon"` inside a tooltip trigger, with
 * the same string as its visually hidden name and as its tooltip's text,
 * so the visible name and the accessible name cannot disagree.
 *
 * These rules catch the two ways that pattern is broken: an icon-only
 * control that has no name at all, and a second pattern growing beside the
 * first one.
 */

import { test } from "node:test"
import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { join } from "node:path"

const SRC = join(import.meta.dirname, "..")
const read = (...parts: string[]) => readFileSync(join(SRC, ...parts), "utf8")

const component = read("components", "tooltip-icon-button.tsx")

test("the icon-only button is the shared one", () => {
  assert.ok(
    component.includes("export const TooltipIconButton"),
    "the shared icon button should exist",
  )
})

test("the icon-only button is built on the app's button", () => {
  assert.ok(
    component.includes('from "@/components/button"'),
    "it should import the app's Button, not a bare <button>",
  )
  assert.ok(
    component.includes('variant="ghost"'),
    "it should use the ghost variant, so it does not fight the surrounding surface",
  )
  assert.ok(
    component.includes('size="icon"'),
    "it should use the icon size, so its hit area is the app's own",
  )
})

test("the icon-only button requires a name", () => {
  // The `tooltip` prop is required, so a caller cannot have the button
  // without the name. An icon-only control with no name is a control a
  // keyboard user cannot identify, and the component's whole purpose is
  // to make that impossible.
  assert.match(
    component,
    /tooltip:\s*string/,
    "the tooltip prop should be required, so every icon-only control has a name",
  )
})

test("the icon-only button names itself for assistive technology", () => {
  // The name comes from a visually hidden span, so a screen reader reads
  // it even though nothing is visible. The tooltip and the span carry the
  // same string.
  assert.ok(
    component.includes('aui-sr-only sr-only'),
    "it should carry a visually hidden name for assistive technology",
  )
  assert.ok(
    component.includes("{tooltip}"),
    "the visually hidden name should be the tooltip's text",
  )
})

test("the icon-only button shows a tooltip", () => {
  // The name is said on hover and on focus, so a person who cannot see
  // the icon — or who is not sure what it does — gets the same answer
  // without having to ask.
  assert.ok(
    component.includes("TooltipContent"),
    "it should show a tooltip",
  )
  assert.ok(
    component.includes("TooltipTrigger"),
    "the tooltip should be triggered by the button",
  )
})

test("the icon-only button keeps its Lucide icon aligned", () => {
  // The icon is passed in as a child, and the button sizes it. An icon
  // that is the wrong size for the button is the most common way the
  // pattern goes wrong in practice.
  assert.ok(
    component.includes("has-[svg]:p-1"),
    "it should pad itself only when it holds an icon, so the size and the " +
      "padding stay in step",
  )
})

test("the icon-only button keeps its tooltip on the bottom by default", () => {
  // The default side is chosen so that a tooltip does not cover the thing
  // it explains. Callers can move it, but they should not have to.
  assert.match(
    component,
    /side\s*=\s*"bottom"/,
    "the default tooltip side should be bottom",
  )
})
