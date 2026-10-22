/**
 * Notifications.
 *
 * The rule is the whole of it: whether a finished reply should be announced,
 * and what the announcement says. The rest is the operating system's.
 */

import { describe, it, beforeEach } from "node:test"
import assert from "node:assert/strict"

import {
  NO_PREVIEW,
  notificationPreferences,
  previewOf,
  setCompletionNotifications,
  setInFrontNotifications,
  setNotificationPreview,
  shouldAnnounce,
  type NotificationPreferences,
} from "./notifications.ts"

/**
 * A local storage, so the preferences can be written and read back.
 *
 * The app's own storage keeps a value under a namespace, and a value that is
 * not there reads as absent — which is what the defaults are built on.
 */
const store = new Map<string, string>()
Object.defineProperty(globalThis, "localStorage", {
  configurable: true,
  writable: true,
  value: {
    get length() {
      return store.size
    },
    key: (index: number) => [...store.keys()][index] ?? null,
    getItem: (key: string) => store.get(key) ?? null,
    setItem: (key: string, value: string) => {
      store.set(key, String(value))
    },
    removeItem: (key: string) => {
      store.delete(key)
    },
    clear: () => {
      store.clear()
    },
  } satisfies Storage,
})

const all = (over: Partial<NotificationPreferences> = {}): NotificationPreferences => ({
  completions: true,
  inFront: false,
  preview: true,
  ...over,
})

describe("the notification preferences", () => {
  beforeEach(() => {
    store.clear()
  })

  it("are on, off and on to begin with", () => {
    /* A reply that takes two minutes while the app is in the background is
       exactly the case a notification is for. */
    assert.deepEqual(notificationPreferences(), {
      completions: true,
      inFront: false,
      preview: true,
    })
  })

  it("are remembered", () => {
    setCompletionNotifications(false)
    setInFrontNotifications(true)
    setNotificationPreview(false)
    assert.deepEqual(notificationPreferences(), {
      completions: false,
      inFront: true,
      preview: false,
    })
  })
})

describe("when a finished reply is announced", () => {
  it("is announced when the app is in the background", () => {
    assert.equal(shouldAnnounce(all(), false), true)
  })

  it("is not announced when the answer is on screen", () => {
    /* The reader can see it. */
    assert.equal(shouldAnnounce(all(), true), false)
  })

  it("is announced when the answer is on screen and the reader asked anyway", () => {
    assert.equal(shouldAnnounce(all({ inFront: true }), true), true)
  })

  it("is never announced when the reader has turned it off", () => {
    assert.equal(shouldAnnounce(all({ completions: false }), false), false)
    assert.equal(
      shouldAnnounce(all({ completions: false, inFront: true }), true),
      false,
    )
  })
})

describe("the preview", () => {
  it("is the first line of the answer", () => {
    assert.equal(previewOf("It is raining.\nAnd it will go on."), "It is raining.")
  })

  it("skips the blank lines before it", () => {
    assert.equal(previewOf("\n\n  The answer.  \nMore."), "The answer.")
  })

  it("is cut at a length a person can read", () => {
    const long = "a".repeat(200)
    const preview = previewOf(long, 20)
    assert.equal(preview.length, 21)
    assert.equal(preview.endsWith("…"), true)
  })

  it("is empty when there is no answer to preview", () => {
    assert.equal(previewOf(""), "")
    assert.equal(previewOf("   \n  "), "")
  })

  it("has a plain sentence to fall back on", () => {
    assert.equal(NO_PREVIEW, "The reply is ready.")
  })
})
