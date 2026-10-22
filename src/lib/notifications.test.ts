/**
 * Notifications.
 *
 * The rule is the whole of it: whether a finished reply should be announced,
 * whether the conversation should be marked as having something the reader
 * has not looked at, and what the announcement says. The rest is the
 * operating system's.
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
  shouldMark,
  wasVisible,
  type FinishedReply,
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

const prefs = (
  over: Partial<NotificationPreferences> = {},
): NotificationPreferences => ({
  completions: true,
  inFront: false,
  preview: true,
  ...over,
})

const reply = (over: Partial<FinishedReply> = {}): FinishedReply => ({
  title: "What is the weather?",
  text: "It is raining, and it will",
  id: "c-1",
  side: "chat",
  onScreen: true,
  muted: false,
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

describe("whether the answer was visible", () => {
  it("was not, when the app is in the background", () => {
    /* The composer is still showing the conversation, but the app is behind
       another window, so the reader cannot see it. */
    assert.equal(wasVisible(reply(), false), false)
  })

  it("was not, when another conversation is the one on screen", () => {
    assert.equal(wasVisible(reply({ onScreen: false }), true), false)
  })

  it("was, when the app is in the front and this is the conversation", () => {
    assert.equal(wasVisible(reply(), true), true)
  })
})

describe("when a finished reply is announced", () => {
  it("is announced when the app is in the background", () => {
    assert.equal(shouldAnnounce(prefs(), reply(), false), true)
  })

  it("is announced when another conversation is the one on screen", () => {
    assert.equal(
      shouldAnnounce(prefs(), reply({ onScreen: false }), true),
      true,
    )
  })

  it("is not announced when the answer is on screen", () => {
    /* The reader can see it. */
    assert.equal(shouldAnnounce(prefs(), reply(), true), false)
  })

  it("is announced when the answer is on screen and the reader asked anyway", () => {
    assert.equal(
      shouldAnnounce(prefs({ inFront: true }), reply(), true),
      true,
    )
  })

  it("is never announced when the reader has turned it off", () => {
    assert.equal(
      shouldAnnounce(prefs({ completions: false }), reply(), false),
      false,
    )
    assert.equal(
      shouldAnnounce(
        prefs({ completions: false, inFront: true }),
        reply(),
        true,
      ),
      false,
    )
  })

  it("is never announced for a muted conversation", () => {
    /* A muted conversation still runs, and its reply still lands in it. The
       reader simply does not want to be interrupted about it. */
    assert.equal(
      shouldAnnounce(prefs({ inFront: true }), reply({ muted: true }), false),
      false,
    )
  })
})

describe("when a conversation is marked as unread", () => {
  it("is marked when the answer was not visible", () => {
    assert.equal(shouldMark(prefs(), reply(), false), true)
  })

  it("is not marked when the reader watched it arrive", () => {
    assert.equal(shouldMark(prefs(), reply(), true), false)
  })

  it("is not marked when notifications are turned off", () => {
    assert.equal(
      shouldMark(prefs({ completions: false }), reply(), false),
      false,
    )
  })

  it("is not marked for a muted conversation", () => {
    assert.equal(
      shouldMark(prefs(), reply({ muted: true }), false),
      false,
    )
  })
})

describe("the preview", () => {
  it("is the first line of the answer", () => {
    assert.equal(
      previewOf("It is raining.\nAnd it will go on."),
      "It is raining.",
    )
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
    /* It says a reply finished. It does not say the task is finished, because
       the app cannot know that. */
    assert.equal(NO_PREVIEW, "A reply finished.")
  })
})
