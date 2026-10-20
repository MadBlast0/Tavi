"use client"

import * as React from "react"

/**
 * Which theme the app is drawn in, and who chose it.
 *
 * Three preferences rather than two. `system` follows the operating system's
 * colour scheme, `light` and `dark` override it. The app has always had a
 * two-way choice and has defaulted to dark; `system` is added here rather than
 * replacing anything, and the default is still dark, so an app that has never
 * been told otherwise looks exactly as it did.
 *
 * This is the one setting in the card that does something. Everything else in
 * it is a row with the shape of a control and a note saying it cannot be
 * changed yet, and a row like that is only honest while it is inert — the
 * moment a switch says "on" it has to be on.
 *
 * The value is stored under a plain `theme` key, which is where the inline
 * script in `index.html` and the toolbar's theme button have always read it.
 * That script runs before the bundle exists and cannot import this module, so
 * the key and the defaults are written out in both places and have to be
 * changed together. `src/lib/prefs.ts` namespaces its keys for the same reason
 * this one does not: moving the key would silently discard the choice of
 * anyone who had already made one, which is a worse outcome than a key that
 * could in principle collide.
 */

/** A preference, not the resolved theme: `system` has not been applied yet. */
export type ThemePreference = "system" | "light" | "dark"

/** The theme actually on screen, once `system` has been resolved. */
export type ResolvedTheme = "light" | "dark"

export const THEME_STORAGE_KEY = "theme"

/** Dark, as the app has always defaulted. */
export const DEFAULT_THEME: ThemePreference = "dark"

const DARK_QUERY = "(prefers-color-scheme: dark)"

function isPreference(value: unknown): value is ThemePreference {
  return value === "system" || value === "light" || value === "dark"
}

function readStored(): ThemePreference {
  if (typeof localStorage === "undefined") return DEFAULT_THEME
  try {
    const stored = localStorage.getItem(THEME_STORAGE_KEY)
    /* An absent or unreadable value reads as the default rather than
       throwing: a preference must never be the thing that stops the app
       starting. */
    return isPreference(stored) ? stored : DEFAULT_THEME
  } catch {
    return DEFAULT_THEME
  }
}

function systemTheme(): ResolvedTheme {
  /* No `matchMedia` is an old browser or a non-browser host. Dark is the
     default there, so it is the answer that matches the default. */
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") {
    return "dark"
  }
  return window.matchMedia(DARK_QUERY).matches ? "dark" : "light"
}

/** The theme a preference resolves to on this machine, right now. */
export function resolveTheme(preference: ThemePreference): ResolvedTheme {
  if (preference === "system") return systemTheme()
  return preference
}

/** Puts a preference on screen. Does not store it. */
export function applyTheme(preference: ThemePreference) {
  if (typeof document === "undefined") return
  document.documentElement.classList.toggle(
    "dark",
    resolveTheme(preference) === "dark"
  )
}

/**
 * The stored preference, cached.
 *
 * `useSyncExternalStore` calls this on every render and compares by identity,
 * so re-reading storage each time would return a fresh answer whenever the
 * stored string changed and spin the caller. The cache is what makes repeated
 * calls agree.
 */
let cached: ThemePreference | null = null

export function getThemePreference(): ThemePreference {
  cached ??= readStored()
  return cached
}

const listeners = new Set<() => void>()

/** Resolves `system` when the OS changes its mind, which is the point of it. */
let media: MediaQueryList | null = null

function notify() {
  for (const listener of listeners) listener()
}

function onSystemChange() {
  /* Only worth saying anything if anyone is actually following the system.
     Applying it unconditionally would fight a stored `light`, which is what
     that preference is for. */
  if (getThemePreference() !== "system") return
  applyTheme("system")
  notify()
}

function startWatching() {
  if (media || typeof window === "undefined" || typeof window.matchMedia !== "function") {
    return
  }
  media = window.matchMedia(DARK_QUERY)
  media.addEventListener("change", onSystemChange)
}

function stopWatching() {
  if (!media) return
  media.removeEventListener("change", onSystemChange)
  media = null
}

export function subscribeTheme(listener: () => void): () => void {
  listeners.add(listener)
  /* Watched only while something is listening. A listener on every open of
     the settings card and none when it is closed. */
  if (listeners.size === 1) startWatching()
  return () => {
    listeners.delete(listener)
    if (listeners.size === 0) stopWatching()
  }
}

/** Stores a preference, puts it on screen, and tells anything watching. */
export function setThemePreference(preference: ThemePreference) {
  cached = preference
  try {
    localStorage.setItem(THEME_STORAGE_KEY, preference)
  } catch {
    /* Private mode, or storage disabled. The choice still applies for this
       session, and failing to persist a preference is not an error worth
       interrupting anyone over. */
  }
  applyTheme(preference)
  notify()
}

/**
 * The preference, and a setter for it.
 *
 * Read through the store rather than from state so the settings control and
 * the toolbar's theme button cannot disagree: both read the same cached
 * value, and either one changing it moves the other.
 */
export function useThemePreference(): [
  ThemePreference,
  (preference: ThemePreference) => void,
] {
  const preference = React.useSyncExternalStore(
    subscribeTheme,
    getThemePreference,
    getThemePreference
  )
  return [preference, setThemePreference]
}