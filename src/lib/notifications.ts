/**
 * Notifications.
 *
 * A reply that is being written is on screen, and the user reads it as it
 * arrives. The moment the app is not in front — another application is, or
 * another tab is — the answer is happening somewhere the user cannot see,
 * and the only way they find out is by coming back and looking.
 *
 * A notification is that: a sentence from the operating system saying the
 * reply is there.
 *
 * ## What it says
 *
 * **A reply finished.** Not "the task is finished" and not "the task needs
 * you" — the app knows when the provider stopped sending text, and it knows
 * nothing else. A chat cannot write files and a model cannot run commands,
 * so "the tests passed" is not something this app could know. The wording
 * never claims more than it can support.
 *
 * ## When it is shown
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
 */

import {
  notificationPermission,
  requestNotificationPermission,
  showSystemNotification,
  systemHasFocus,
} from "./api.ts"
import { readStorage, writeStorage } from "./storage.ts"

/** The preference names, under the app's own namespace. */
const PREF_COMPLETIONS = "notify.completions"
const PREF_IN_FRONT = "notify.in-front"
const PREF_PREVIEW = "notify.preview"

/** What the reader has chosen. */
export type NotificationPreferences = {
  /** Tell me when a reply finishes while the app is in the background. */
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

/** Turns the "even when the app is in front" notification on or off. */
export const setInFrontNotifications = (on: boolean): void => {
  writeStorage(PREF_IN_FRONT, on ? "on" : "off")
}

/** Turns the preview in the notification on or off. */
export const setNotificationPreview = (on: boolean): void => {
  writeStorage(PREF_PREVIEW, on ? "on" : "off")
}

/**
 * Whether a finished reply should be announced.
 *
 * `onScreen` says whether the conversation that finished is the one the
 * reader is looking at. Two things have to be true: the reader has asked to
 * be told, and the answer is somewhere they cannot see — unless they asked
 * to be told either way.
 */
export const shouldAnnounce = (
  preferences: NotificationPreferences,
  onScreen: boolean,
): boolean => {
  if (!preferences.completions) return false
  return onScreen ? preferences.inFront : true
}

/**
 * The first line of an answer, for a notification's body.
 *
 * A toast is read at a glance, and a paragraph in a toast is a paragraph on
 * the lock screen. The first line is cut at a line break and at a length a
 * person can read without it wrapping.
 */
export const previewOf = (text: string, limit = 120): string => {
  const line = text.split("\n").find((part) => part.trim().length > 0) ?? "";
  const trimmed = line.trim();
  if (trimmed.length <= limit) return trimmed;
  return `${trimmed.slice(0, limit).trimEnd()}…`;
};

/** What the notification says when the preview is off. */
export const NO_PREVIEW = "The reply is ready.";

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
 * Announces a reply that finished.
 *
 * The title is the conversation's name rather than the app's, because a
 * toast that says only "a reply finished" tells the reader nothing when
 * there is more than one conversation, and the whole point is knowing which
 * one to come back to.
 */
export const announceReply = async (options: {
  /** The conversation's name. */
  title: string
  /** The whole of the answer. */
  text: string
}): Promise<void> => {
  const preferences = notificationPreferences();
  if (!preferences.completions) return;

  const onScreen = await systemHasFocus();
  if (!shouldAnnounce(preferences, onScreen)) return;

  const body = preferences.preview ? previewOf(options.text) : NO_PREVIEW;
  showSystemNotification(options.title, body);
};
