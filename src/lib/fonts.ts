import { invoke } from "@tauri-apps/api/core";

import { isDesktopApp } from "./desktop";
import { PREF, readPref, writePref } from "./prefs";

/**
 * Installed font families, from the operating system.
 *
 * There is deliberately no fallback list here. A list written into the app
 * would name fonts that are not installed, and CSS silently substitutes
 * something else when a family is missing — so every one of those names would
 * render as the fallback while appearing in the dropdown as though it worked.
 * The list is whatever this machine actually has, which is a question only the
 * OS can answer.
 *
 * Only the desktop app can ask it. A web page has no access to the system font
 * registry: there is no standard API for it, and the Chromium-only Local Font
 * Access API would mean a permission prompt and a different answer depending on
 * the browser. So the web target reports the same failure the rest of the
 * native tools do rather than pretending.
 */

export type FontDiscoveryResult =
  | { ok: true; families: string[] }
  | { ok: false; reason: "unsupported" | "failed"; message: string };

/**
 * The face the app ships with, and the default of the picker.
 *
 * Offered as a choice in its own right rather than left implicit, because
 * "the default" and "Geist" mean the same thing now but need not if the app's
 * own typeface ever changes — and a picker whose first entry is a hardcoded
 * name goes stale the same way the rest of a hardcoded list would.
 */
export const DEFAULT_FONT_FAMILY = "Geist Variable";

/**
 * The result of the last scan, kept so reopening the settings card does not
 * rescan a system database.
 *
 * Not persisted. A font list is only true on the machine it was taken from,
 * and it goes stale the moment somebody installs or removes a font — caching it
 * across restarts would keep showing a catalogue from last week.
 */
let cached: FontDiscoveryResult | null = null;

/** In flight, so several callers at once share one scan rather than racing. */
let pending: Promise<FontDiscoveryResult> | null = null;

async function discover(): Promise<FontDiscoveryResult> {
  /* The call is the test, not an environment check made beforehand.

     Sniffing for the Tauri bridge and refusing to try when it looked absent
     made this feature silently dead wherever that sniff was wrong — the picker
     came up greyed out reading "only available in the desktop app" on the
     desktop app. Invoking anyway costs one caught exception in a browser and
     removes that whole class of failure: if the command answers, it works,
     whatever any global said.

     `isDesktopApp` now only chooses which message to show. */
  try {
    const families = await invoke<string[]>("list_installed_fonts");
    return {
      ok: true,
      // The backend normalises; this is belt and braces for a build where the
      // two ever drift, and it costs nothing on the list we already have.
      families: families.filter((name) => name.trim() !== ""),
    };
  } catch {
    const inDesktop = isDesktopApp();
    return {
      ok: false,
      reason: inDesktop ? "failed" : "unsupported",
      message: inDesktop
        ? "Could not read the installed fonts."
        : "Installed fonts can only be listed in the desktop app. Start it with `pnpm tauri dev`.",
    };
  }
}

/** The installed families, or why there are none. Uses the cached scan. */
export async function listInstalledFonts(): Promise<FontDiscoveryResult> {
  if (cached) return cached;
  pending ??= discover().finally(() => {
    pending = null;
  });
  cached = await pending;
  return cached;
}

/**
 * Starts a scan at launch, without waiting for it.
 *
 * The result is held in memory for the rest of the session, so the settings
 * card opens onto a list that is already there. Fired at startup rather than
 * when the card first opens because the scan reads a system database and takes
 * long enough to be felt — nobody should wait on it at the moment they are
 * looking for something else.
 *
 * Once per launch is the whole refresh story, and it is deliberately the only
 * one. There is no rescan button, and nothing writes the list to disk: a
 * catalogue of somebody's fonts goes stale the moment they install or remove
 * one, and a stale one is worse than none — it would offer families that no
 * longer exist and hide ones that now do. Because the cache lives only as long
 * as the process, a font installed since the last run is simply already there
 * next time the app opens.
 *
 * Only started in the desktop app, because in a browser there is no list to
 * find and the attempt would only be an exception.
 */
export function warmInstalledFonts(): void {
  if (!isDesktopApp()) return;
  void listInstalledFonts();
}

/**
 * Puts a family on screen.
 *
 * The name is serialised as a CSS string before it reaches the style, because
 * font family names come from the operating system and can contain spaces,
 * commas, quotes and anything else a user has installed. `JSON.stringify`
 * produces a quoted, escaped CSS string; assigning the result through CSSOM
 * means the browser parses it rather than the app concatenating CSS text.
 *
 * The stack falls through to the app's own face, so a family that was
 * uninstalled after being chosen keeps rendering — in Geist, as it would have
 * anyway — instead of falling back to the browser's serif default.
 */
export function applyFontFamily(family: string | null | undefined): void {
  if (typeof document === "undefined") return;
  const root = document.documentElement;
  if (!family) {
    root.style.removeProperty("--app-font-family");
    return;
  }
  root.style.setProperty(
    "--app-font-family",
    `${JSON.stringify(family)}, var(--font-sans)`,
  );
}

/** The chosen family, or `null` for the app's own face. */
export function readFontFamily(): string | null {
  return readPref(PREF.font) ?? null;
}

/** Stores a family, or clears the preference when given `null`. */
export function writeFontFamily(family: string | null): void {
  writePref(PREF.font, family ?? undefined);
  applyFontFamily(family);
}

/**
 * Applies the saved family before the app renders.
 *
 * Called from `main.tsx` rather than from the settings screen, because the
 * choice affects every surface and restoring it only when somebody opens
 * settings would mean the rest of the session is drawn in the wrong face.
 */
export function restoreFontFamily(): void {
  applyFontFamily(readFontFamily());
}