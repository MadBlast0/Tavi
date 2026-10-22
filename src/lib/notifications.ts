/**
 * Notifications.
 *
 * A reply that is being written is on screen, and the user reads it as it
 * arrives. The moment the app is not in front — another application is, or
 * another tab is — the answer is happening somewhere the user cannot see,
 * and the only way they find out is by coming back and looking.
 *
 * A notification is that: a sentence saying the reply is there.
 *
 * ## What it says
 *
 * **A reply finished.** Not "the task is finished" and not "the task needs
 * you" — the app knows when the provider stopped sending text, and it knows
 * nothing else. A chat cannot write files and a model cannot run commands,
 * so "the tests passed" is not something this app could know. The wording
 * never claims more than it can support.
 *
 * ## Where it goes
 *
 * **Where the reader is decides where the announcement goes.** The app is in
 * the background, and the operating system is the only thing that can reach
 * you; the app is in the front, and the app itself is the thing in front of
 * you. One rule, two destinations, and no announcement that arrives twice.
 *
 * ## The rule
 *
 * The rule is written once, as *"is this conversation the one being looked
 * at?"*, and it is answered by the thing that owns the conversation. Today
 * that is the same as the app having the focus, because a reply is stopped
 * the moment another conversation is opened. When the conversation runtime
 * arrives it is the narrower question — one conversation among several — and
 * the rule does not change.
 *
 * ## The permission
 *
 * Asked for when the reader turns the setting on, and not before. A
 * permission asked for at launch is a permission asked for before the reader
 * knows what it is for, and the answer they give is the answer to a question
 * they were not asked.
 *
 * ## The card
 *
 * The announcement that appears *inside* the app is a component, and a
 * component cannot be reached from here without dragging a component tree
 * into every test of this file. So the card is asked for by an event on the
 * window, which is how the app's settings card is opened, and the bridge
 * beside the shell answers it.
 */

import {
  notificationPermission,
  requestNotificationPermission,
  showSystemNotification,
  systemHasFocus,
} from "./api.ts"
import { markConversationUnread } from "./conversations.ts"
import type { Side } from "./sides.ts"
import { readStorage, writeStorage } from "./storage.ts"

/** The preference names, under the app's own namespace. */
const PREF_COMPLETIONS = "notify.completions"
const PREF_IN_FRONT = "notify.in-front"
const PREF_PREVIEW = "notify.preview"

/**
 * An announcement that belongs inside the app.
 *
 * Asked for by an event rather than by a call, because the card is a
 * component and this module is read by tests that run without a DOM.
 */
export const ANNOUNCE = "tavi:announce"

/** What an announcement says, and which conversation it is about. */
export type Announcement = {
  /** The conversation's name. */
  title: string
  /** The body of the announcement. */
  body: string
  /** The conversation's id, when there is one to open. */
  id?: string
}

/** What the reader has chosen. */
export type NotificationPreferences = {
  /** Tell me when a reply finishes and the answer is not on screen. */
  completions: boolean
  /** Tell me even when the answer is on screen. */
  inFront: boolean
  /** Put the first line of the answer in the notification. */
  preview: boolean
}

/**
 * The preferences as they are now.
 *
 * **On, off and on.** A reply that takes two minutes while the app is in the
 * background is exactly the case a notification is for, so the default is the
 * helpful one; the reader who does not want it can turn it off, and the
 * second is off because an answer you can see does not need announcing.
 */
export const notificationPreferences = (): NotificationPreferences => ({
  completions: readStorage(PREF_COMPLETIONS) !== "off",
  inFront: readStorage(PREF_IN_FRONT) === "on",
  preview: readStorage(PREF_PREVIEW) !== "off",
})

/** Turns the "a reply finished" notification on or off. */
export const setCompletionNotifications = (on: boolean): void => {
  writeStorage(PREF_COMPLETIONS, on ? "on" : "off")
}

/** Turns the "even when the answer is on screen" notification on or off. */
export const setInFrontNotifications = (on: boolean): void => {
  writeStorage(PREF_IN_FRONT, on ? "on" : "off")
}

/** Turns the preview in the notification on or off. */
export const setNotificationPreview = (on: boolean): void => {
  writeStorage(PREF_PREVIEW, on ? "on" : "off")
}

/**
 * What the app knows when a reply ends.
 *
 * Everything here is a fact the caller already has. The rule takes them and
 * decides; it does not go and look for them.
 */
export type FinishedReply = {
  /** The conversation's name. */
  title: string
  /** The whole of the answer. */
  text: string
  /** The conversation's id, when it has one. */
  id?: string
  /** Which side the conversation belongs to. */
  side: Side
  /** Whether this conversation is the one the reader is looking at. */
  onScreen: boolean
  /** Whether this conversation has been muted. */
  muted: boolean
}

/**
 * Whether the answer was somewhere the reader could see.
 *
 * Both halves are needed. The conversation has to be the one on screen, and
 * the app has to be in the front: a conversation the composer is showing is
 * not visible while the app is behind another window.
 */
export const wasVisible = (reply: FinishedReply, appInFront: boolean): boolean =>
  appInFront && reply.onScreen

/**
 * Whether a finished reply should be announced.
 *
 * Three things have to be true: the reader has asked to be told, this
 * conversation has not been muted, and the answer is somewhere they cannot
 * see — unless they asked to be told either way.
 */
export const shouldAnnounce = (
  preferences: NotificationPreferences,
  reply: FinishedReply,
  appInFront: boolean,
): boolean => {
  if (!preferences.completions) return false
  /* A muted conversation is never announced. It still runs, and its reply
     still lands in it; the reader simply does not want to be interrupted
     about it. */
  if (reply.muted) return false
  if (wasVisible(reply, appInFront)) return preferences.inFront
  return true
}

/**
 * Whether the conversation should be marked as having something the reader
 * has not looked at.
 *
 * The mark is the app's own record, and it is set only when the answer was
 * not visible — an answer the reader watched arrive needs no mark. It is
 * cleared when the conversation is opened, which is what "looking at it"
 * means.
 *
 * **A muted conversation is not marked either.** The mark says "New" beside
 * the conversation's name, and a reader who muted the conversation has said
 * they do not want to be nudged about it. The reply still lands in it; the
 * conversation's own timestamp still moves.
 */
export const shouldMark = (
  preferences: NotificationPreferences,
  reply: FinishedReply,
  appInFront: boolean,
): boolean => {
  if (!preferences.completions) return false
  if (reply.muted) return false
  return !wasVisible(reply, appInFront)
}

/**
 * The first line of an answer, for a notification's body.
 *
 * A notification is read at a glance, and a paragraph in one is a paragraph
 * on the lock screen. The first line is cut at a line break and at a length
 * a person can read without it wrapping.
 */
export const previewOf = (text: string, limit = 120): string => {
  const line = text.split("\n").find((part) => part.trim().length > 0) ?? "";
  const trimmed = line.trim();
  if (trimmed.length <= limit) return trimmed;
  return `${trimmed.slice(0, limit).trimEnd()}…`;
};

/**
 * What the announcement says when there is no preview to show.
 *
 * It says a reply finished. It does not say the task is finished, because
 * the app cannot know that.
 */
export const NO_PREVIEW = "A reply finished."

/**
 * Asks the operating system for permission to raise a toast.
 *
 * Asked when the reader turns the setting on. If the answer is no, the
 * setting goes back off — a switch that reads "on" and does nothing is the
 * one thing worse than a switch that reads "off".
 */
export const askForNotifications = async (): Promise<boolean> => {
  const granted = await notificationPermission();
  if (granted === "granted") return true;
  if (granted === "denied") return false;
  return await requestNotificationPermission();
};

/**
 * Asks for the announcement to appear inside the app.
 *
 * The card is the app's own transient surface, and it is the one that can be
 * acted on: the operating system's toast cannot open a conversation, because
 * the plugin's action API is mobile-only, and the card can.
 */
export const announceInApp = (announcement: Announcement) => {
  if (typeof window === "undefined") return
  window.dispatchEvent(
    new CustomEvent<Announcement>(ANNOUNCE, { detail: announcement }),
  )
}

/**
 * Announces a reply that finished.
 *
 * The title is the conversation's name rather than the app's, because an
 * announcement that says only "a reply finished" tells the reader nothing
 * when there is more than one conversation, and the whole point is knowing
 * which one to come back to.
 */
export const announceReply = async (reply: FinishedReply): Promise<void> => {
  const preferences = notificationPreferences();
  const appInFront = await systemHasFocus();

  if (!shouldAnnounce(preferences, reply, appInFront)) {
    await markIfUnread(preferences, reply, appInFront)
    return
  }

  /* An answer with nothing in it has no first line to show, and a
     notification with an empty body is a notification that says nothing. */
  const preview = preferences.preview ? previewOf(reply.text) : ""
  const body = preview || NO_PREVIEW

  /* Where the reader is decides where the announcement goes. The app is in
     the background, and the operating system is the only thing that can
     reach them; the app is in the front, and the app itself is the thing in
     front of them. */
  if (!appInFront) {
    showSystemNotification(reply.title, body)
  } else {
    announceInApp({ title: reply.title, body, id: reply.id })
  }

  await markIfUnread(preferences, reply, appInFront)
}

/**
 * Notes that the conversation has something the reader has not looked at.
 *
 * The mark is the app's own record, and it does not depend on the operating
 * system: the operating system may decline to raise a toast — on Windows only
 * an *installed* application may — while the rail's badge does not depend on
 * the operating system's good behaviour.
 *
 * It is written after the announcement, and not before, because the
 * announcement is the urgent half and the mark is the record. The reader
 * should not wait on a disk write to be told.
 */
const markIfUnread = async (
  preferences: NotificationPreferences,
  reply: FinishedReply,
  appInFront: boolean,
): Promise<void> => {
  if (!reply.id) return
  if (!shouldMark(preferences, reply, appInFront)) return
  await markConversationUnread(reply.side, reply.id)
}

/**
 * Raises a test notification, so the reader can see whether the system will
 * show one.
 *
 * The system's own toast is what is being tested, and the app's card says so
 * — a reader who sees only the card has learned that the system did not
 * raise one, which on Windows means the app is not installed.
 *
 * **It answers whether the system would allow one at all**, and says so when
 * it would not: a button that does nothing when pressed is a button the
 * reader cannot tell from a broken one.
 */
export const announceTest = async (): Promise<boolean> => {
  const granted = await askForNotifications();
  if (!granted) return false;
  const body = "If nothing appeared outside the app, the system did not show one."
  showSystemNotification("Tavi", body)
  announceInApp({ title: "Test notification", body })
  return true
}
