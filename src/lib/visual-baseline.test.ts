/**
 * The visual baseline, checked.
 *
 * The app's approved shape is written down in `docs/visual-baseline.md`, and
 * the list of things that must not change is a list of *numbers* rather than
 * of impressions: a title bar 28px tall, a rail 256px wide that goes down
 * to 200 and up to 440, a window that cannot be made smaller than 600 by
 * 338, a greeting at 24px, a composer 736px wide.
 *
 * A number that has moved is a change, whether or not anybody looked. That
 * is the whole point: there is no screenshot test in this project, and
 * `docs/plan/api-keys-and-parity.md` records why — a screenshot diff fails
 * on the engine and the display scaling before it fails on the design. So
 * the check is the numbers.
 *
 * What it catches: a change to the shell that was made without deciding to
 * change the design. The work area's corner, the rail's range, the
 * window's floor and the composer's width are all things that can drift
 * quietly, because each of them is one class in a file nobody was thinking
 * about.
 */

import { test } from "node:test"
import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { join } from "node:path"

const HERE = import.meta.dirname
const SRC = join(HERE, "..")
const read = (...parts: string[]) => readFileSync(join(SRC, ...parts), "utf8")

const shell = read("blocks", "shell", "shell.tsx")
const titleBar = read("blocks", "shell", "title-bar.tsx")
const sidebarNav = read("blocks", "shell", "sidebar-nav.tsx")
const promptBlock = read("blocks", "prompt-input", "prompt-block.tsx")
const stylesheet = read("index.css")
const tauriConfig = read("..", "src-tauri", "tauri.conf.json")

/**
 * The number a constant is given, in the units it is written in.
 *
 * A constant may be written as a number or as a string of rem, and the two
 * are the same thing here: the shell's corner is `2.5rem` and the width is
 * `256`.
 */
const numberIn = (source: string, name: string): number => {
  const match = source.match(
    new RegExp(`${name}\\s*=\\s*(?:"([0-9.]+)rem"|([0-9.]+))`),
  )
  assert.ok(match, `there should be a constant named ${name}`)
  return Number(match[1] ?? match[2])
}

test("the window cannot be made smaller than 600 by 338", () => {
  // The floor is a product decision, not a default. Two conversations side
  // by side inside 600px is 300px each, and the rail takes another 200, so
  // anything added to this app has to be usable here and not only on a
  // large display.
  const config = JSON.parse(tauriConfig) as {
    app?: { windows?: Array<{ minWidth?: number; minHeight?: number }> }
  }
  const window = config.app?.windows?.[0]
  assert.ok(window, "the tauri config should describe a window")
  assert.equal(window.minWidth, 600, "the window's minimum width should be 600")
  assert.equal(window.minHeight, 338, "the window's minimum height should be 338")
})

test("the title bar is 28 pixels tall", () => {
  // It is drawn over the work area rather than beside it, and the number is
  // published in one place so the bar, the rail's header and the surface
  // cannot end up a pixel apart.
  //
  // The number is on the root, so that a menu or a popover — which is
  // portalled to the end of the body — can see it too. It may be written in
  // the stylesheet or set on the root from code; what the rule forbids is a
  // height that is not 28 pixels, and two heights.
  const published =
    (stylesheet.match(/--shell-top-bar-h\s*:\s*([\d.]+rem)/) ?? [])[1] ??
    (shell.match(/\[--shell-top-bar-h:([\d.]+rem)\]/) ?? [])[1]
  assert.equal(
    published,
    "1.75rem",
    "the title bar's height should be published as 1.75rem, which is 28 pixels",
  )
  assert.ok(
    titleBar.includes("h-(--shell-top-bar-h)"),
    "the title bar should be as tall as the published height",
  )
})

test("the rail is 256 pixels wide, and goes down to 200 and up to 440", () => {
  // The floor is where a row stops being readable; the ceiling is where the
  // rail has stopped earning the width. And the width is deliberately not
  // remembered between runs.
  assert.equal(numberIn(shell, "SIDEBAR_WIDTH_DEFAULT"), 256)
  assert.equal(numberIn(shell, "SIDEBAR_WIDTH_MIN"), 200)
  assert.equal(numberIn(shell, "SIDEBAR_WIDTH_MAX"), 440)
  assert.equal(numberIn(shell, "SIDEBAR_WIDTH_STEP"), 16)
})

test("the work area's corner is 40 pixels", () => {
  // It is past the theme's scale on purpose: it is a corner for a panel a
  // thousand pixels tall, and a token one notch tighter reads as a mistake.
  assert.equal(numberIn(shell, "WORK_AREA_CORNER"), 2.5)
})

test("the two sides ask their own questions", () => {
  // "What are we working on?" is a code question, and it would be a strange
  // thing to read over an empty chat.
  assert.ok(
    promptBlock.includes('"What are we working on?" : "What can I help with?"'),
    "the greeting should be chosen by the side",
  )
  assert.ok(
    promptBlock.includes("text-2xl font-normal"),
    "the greeting should be 24px and not bold",
  )
})

test("the composer is 736 pixels wide on both sides", () => {
  // `max-w-3xl` is 48rem, and the composer's own `px-4` takes 16px off each
  // side. The Code composer is taller because it carries the folder and the
  // mode controls; it is not wider.
  assert.ok(
    promptBlock.includes("mx-auto w-full max-w-3xl"),
    "the composer should be capped at max-w-3xl and centred",
  )
  const width = 48 * 16 - 2 * 16
  assert.equal(width, 736)
})

test("the rail's two sides keep their own rows", () => {
  // Chat has Projects and Chats; Code has Routines and Sessions. Forcing
  // them into one identical sidebar would say the two sides lead to the
  // same place, and they are meant to lead somewhere different.
  assert.ok(sidebarNav.includes('"Projects"'), "the Chat rail should have a Projects row")
  assert.ok(sidebarNav.includes('"Routines"'), "the Code rail should have a Routines row")
  assert.ok(sidebarNav.includes('"Artifacts"'), "both rails should have an Artifacts row")
  assert.ok(sidebarNav.includes('"Scheduled"'), "both rails should have a Scheduled row")
  assert.ok(sidebarNav.includes('"Customize"'), "both rails should have a Customize row")
  assert.ok(
    /variant\s*===\s*"code"\s*\?\s*"Sessions"\s*:\s*"Chats"/.test(
      sidebarNav.replace(/\s+/g, " "),
    ),
    "the list should be titled by the side",
  )
})

test("the rows that do nothing are marked as such", () => {
  // A row that looks live and does nothing is a lie about how much of the
  // app exists.
  assert.ok(
    sidebarNav.includes("disabled"),
    "the inert rows should be rendered disabled rather than removed",
  )
})
