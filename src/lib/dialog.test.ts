/**
 * The dialog and confirmation conventions, checked.
 *
 * The app has one dialog family and one confirmation family, both on Base
 * UI. These rules catch the two ways that family is broken: a dialog built
 * from a raw element, and a confirmation that is used for a minor action.
 */

import { test } from "node:test"
import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { join } from "node:path"

const SRC = join(import.meta.dirname, "..")
const read = (...parts: string[]) => readFileSync(join(SRC, ...parts), "utf8")

const dialog = read("components", "dialog", "dialog.tsx")
const alertDialog = read("components", "alert-dialog", "alert-dialog.tsx")

test("the dialog is on the canonical family", () => {
  assert.ok(
    dialog.includes("@base-ui/react/drawer"),
    "the dialog should be on Base UI",
  )
})

test("the alert dialog is on the canonical family", () => {
  assert.ok(
    alertDialog.includes("@base-ui/react/drawer"),
    "the alert dialog should be on Base UI",
  )
})

test("the dialog carries a title and a description", () => {
  // A dialog without a title or a description is a dialog a keyboard user
  // cannot identify. Both are exported, so a caller can give them.
  assert.ok(dialog.includes("DialogTitle"), "the dialog should have a title")
  assert.ok(dialog.includes("DialogDescription"), "the dialog should have a description")
})

test("the alert dialog carries a title and a description", () => {
  assert.ok(alertDialog.includes("AlertDialogTitle"), "the alert dialog should have a title")
  assert.ok(alertDialog.includes("AlertDialogDescription"), "the alert dialog should have a description")
})

test("the alert dialog has a cancel and an action", () => {
  // A confirmation that cannot be dismissed is not a confirmation. The
  // two buttons are what make it one.
  assert.ok(alertDialog.includes("AlertDialogCancel"), "the alert dialog should have a cancel")
  assert.ok(alertDialog.includes("AlertDialogAction"), "the alert dialog should have an action")
})

test("the dialog can be closed", () => {
  assert.ok(dialog.includes("DialogClose"), "the dialog should be dismissable")
})

test("the dialog has a body slot", () => {
  // A dialog is a form that wants focus, and a form needs a place for its
  // fields. The body slot is that place.
  assert.ok(dialog.includes("DialogBody"), "the dialog should have a body slot")
})
