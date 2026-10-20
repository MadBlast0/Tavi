/**
 * Small user preferences that survive a reload.
 *
 * Backed by `localStorage`, which behaves the same in the browser and inside
 * the Tauri webview, so one code path covers the web target and the desktop
 * app. Deliberately not IndexedDB: these are a few hundred bytes and the
 * composer needs them during its first render, where a promise is useless.
 *
 * Scope note — this holds *preferences*, not data. Preferences are things the
 * user picked that would be trivial to re-enter (a model, an effort level).
 * Anything larger belongs in `sessions.ts`, and anything the user would be
 * upset to lose belongs in `fs-access.ts`. See `docs/storage.md` for where each
 * lands on each platform.
 *
 * `localStorage` is `string` -> `string` only, so everything here is a string
 * and parsing is the caller's business. A corrupt or absent value reads as
 * `undefined` rather than throwing, because a bad preference must never stop
 * the app from starting.
 *
 * The namespace these values live under, and the move out of the namespace
 * the app had before it was renamed, belong to `storage.ts`.
 */

import { readStorage, writeStorage } from "@/lib/storage";

export const readPref = (name: string): string | undefined => readStorage(name);

export const writePref = (name: string, value: string | undefined): void => {
  writeStorage(name, value);
};

/** Names, so a typo cannot silently invent a new key. */
export const PREF = {
  model: "model",
  effort: "effort",
  mode: "mode",
  font: "font",
  sidebar: "sidebar",
} as const
