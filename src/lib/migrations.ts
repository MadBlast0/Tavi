/**
 * The changes made to what is on disk, run once.
 *
 * Everything here is a one-time move from an older shape of the app to the
 * current one. Each step is idempotent, and each is about *data the app has
 * already written* — never about anything the user typed in a way that cannot
 * be carried over.
 *
 * The rules the rest of the app follows:
 *
 * - A value is **moved**, never lost. A rename is not a reason to lose
 *   somebody's chats or their choice of model.
 * - A value is **moved into the newer spelling and the older one is deleted**,
 *   so the move happens once and does not repeat.
 * - A value that is being **retired on purpose** is deleted outright, and
 *   from both namespaces — otherwise the legacy rule would move it straight
 *   back on the next read.
 */

import { forgetStorage, readStorage, writeStorage } from "./storage.ts"
import { PREF, sidePref } from "./prefs.ts"
import { SIDES } from "./sides.ts"

/**
 * The single store the app used to keep, before chats and code sessions were
 * separate things.
 *
 * The threads in it were test data — one array holding both kinds of thread,
 * with nothing on either to say which it was. There is no honest way to
 * split them, and a thread that cannot say which side it belongs to is
 * exactly what this change is about, so they go.
 */
const RETIRED_STORE = "sessions.v1"

/**
 * The model and the effort used to be one choice for the whole app.
 *
 * They are one choice per side now, because a chat and a code session are
 * different work. The old choice becomes the first choice on both sides —
 * somebody who had picked a model for their coding did not have a different
 * one in mind for their chat, and a split that started by guessing would
 * start by guessing wrong.
 */
const SPLIT_PREFERENCES = [PREF.model, PREF.effort]

/**
 * Runs every migration.
 *
 * Called once, before the app renders. It is cheap — a handful of reads and
 * writes — and it is safe to call again, which matters because a half-finished
 * migration should be able to run twice without doing anything the second
 * time.
 */
export const runMigrations = (): void => {
  if (typeof localStorage === "undefined") return

  retireTheOldStore()
  splitTheSharedPreferences()
}

/** Removes the store that held both kinds of thread. */
const retireTheOldStore = (): void => {
  forgetStorage(RETIRED_STORE)
}

/**
 * Gives each side the preference that used to be shared.
 *
 * The old key is only copied if the side does not have one of its own yet, so
 * a side the user has already chosen for is never overwritten by the shared
 * value. The old keys go afterwards, because they are retired on purpose —
 * leaving them would mean the next read of one of them would move it back.
 */
const splitTheSharedPreferences = (): void => {
  for (const name of SPLIT_PREFERENCES) {
    const shared = readStorage(name)
    for (const side of SIDES) {
      const key = sidePref(name, side)
      if (readStorage(key) === undefined && shared !== undefined) {
        writeStorage(key, shared)
      }
    }
    forgetStorage(name)
  }
}
