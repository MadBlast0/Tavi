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
 */

const NAMESPACE = "ai-app"

/** Prefixed so this app cannot collide with anything else on the origin. */
const key = (name: string) => `${NAMESPACE}.${name}`

export const readPref = (name: string): string | undefined => {
  if (typeof localStorage === "undefined") return undefined
  try {
    const value = localStorage.getItem(key(name))
    return value === null ? undefined : value
  } catch {
    // Private mode, disabled storage, or a quota error. Treat as absent.
    return undefined
  }
}

export const writePref = (name: string, value: string | undefined): void => {
  if (typeof localStorage === "undefined") return
  try {
    if (value === undefined) localStorage.removeItem(key(name))
    else localStorage.setItem(key(name), value)
  } catch {
    // Nothing useful to do. The selection still applies for this session, and
    // failing to persist a preference must never surface as an error.
  }
}

/** Names, so a typo cannot silently invent a new key. */
export const PREF = {
  model: "model",
  effort: "effort",
  mode: "mode",
  variant: "variant",
  font: "font",
} as const
