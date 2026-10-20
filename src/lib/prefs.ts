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
import type { Side } from "@/lib/sides";

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
} as const;

/**
 * A preference that belongs to one side of the app rather than to both.
 *
 * Chat and Code are separate places, so the model you chat with and the model
 * you code with are two choices and not one. The key is the preference's name
 * with the side on the end — `tavi.model.chat`, `tavi.model.code` — which
 * keeps it inside the one namespace everything else lives in.
 */
export const sidePref = (name: string, side: Side): string => `${name}.${side}`;
