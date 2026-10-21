import { listInstalledFonts as listInstalledFontsDesktop } from "./desktop.ts";
import { isDesktopApp } from "./platform.ts";
import { PREF, readPref, writePref } from "./prefs.ts";

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
 * Two builds can answer it, and neither of them is the whole answer:
 *
 * - The desktop app asks the operating system, and gets the whole list.
 * - A browser can only report the fonts it is *able* to see, and even then
 *   only in Chromium, and only after the user grants the `local-fonts`
 *   permission. Everywhere else there is no list at all, and the app says so
 *   rather than inventing one.
 *
 * A count is only ever stated when the list was actually obtained. "0 fonts
 * installed" is a falsehood in a browser, and the list right underneath it —
 * the app's own face — is what makes it obvious.
 */

export type FontDiscoveryResult =
  | { ok: true; families: string[] }
  | {
      ok: false;
      reason: "unsupported" | "failed" | "permission-required";
      message: string;
    };

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

/**
 * Whether this browser can list the fonts on the machine.
 *
 * The Local Font Access API is Chromium-only: Chrome, Edge and Opera have it,
 * Firefox and Safari do not. Calling it makes the browser ask the user for
 * the `local-fonts` permission, which is the right way round — the browser
 * knows who is asking and what for, and the answer is the user's.
 */
export const canQueryLocalFonts = (): boolean =>
  typeof window !== "undefined" &&
  typeof (window as { queryLocalFonts?: unknown }).queryLocalFonts === "function";

/**
 * The font families the browser is able to see.
 *
 * The browser's own list of what it can render, which is a narrower thing
 * than what the operating system has installed — but it is the list the page
 * can actually use, and it is the truth about this browser.
 */
const queryLocalFonts = async (): Promise<FontDiscoveryResult> => {
  if (!canQueryLocalFonts()) {
    return {
      ok: false,
      reason: "unsupported",
      message:
        "This browser cannot list the fonts installed on this computer. Installed fonts can only be listed in the desktop app. Start it with `pnpm tauri dev`.",
    };
  }

  try {
    const query = (
      window as unknown as {
        queryLocalFonts: () => Promise<Array<{ family: string }>>;
      }
    ).queryLocalFonts;
    const faces = await query();
    const families = [
      ...new Set(
        faces
          .map((face) => face.family.trim())
          .filter((family) => family !== ""),
      ),
    ].sort((left, right) => left.localeCompare(right));
    return { ok: true, families };
  } catch {
    return {
      ok: false,
      reason: "failed",
      message:
        "The browser did not grant access to the installed fonts. The list can be requested again, and the browser will ask.",
    };
  }
};

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
    const families = await listInstalledFontsDesktop();
    return {
      ok: true,
      // The backend normalises; this is belt and braces for a build where the
      // two ever drift, and it costs nothing on the list we already have.
      families: families.filter((name) => name.trim() !== ""),
    };
  } catch {
    /* Not the desktop. A browser may still be able to answer, behind its own
       permission prompt — and asking is the user's to make, so the result
       here says the list is available rather than asking for it. */
  }

  if (canQueryLocalFonts()) {
    return {
      ok: false,
      reason: "permission-required",
      message:
        "This browser can list the fonts installed on this computer. It will ask your permission first.",
    };
  }

  return {
    ok: false,
    reason: isDesktopApp() ? "failed" : "unsupported",
    message: isDesktopApp()
      ? "Could not read the installed fonts."
      : "Installed fonts can only be listed in the desktop app. Start it with `pnpm tauri dev`.",
  };
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
 * Asks the browser for the installed fonts.
 *
 * Only ever called when the person presses the button, because the browser's
 * permission prompt is theirs to answer and a prompt nobody asked for is a
 * prompt nobody wants.
 */
export async function requestInstalledFonts(): Promise<FontDiscoveryResult> {
  const result = await queryLocalFonts();
  if (result.ok) {
    cached = result;
  }
  return result;
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
 * next to time the app opens.
 *
 * Only started in the desktop app, because in a browser there is no list to
 * find without the user's permission, and the attempt would only be an
 * exception.
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
