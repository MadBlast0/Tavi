"use client"

import * as React from "react"

/**
 * Which colour palette the app is drawn in.
 *
 * Separate from the theme on purpose. The theme decides whether the app is
 * light or dark; the palette decides which colours it uses while doing that.
 * They are independent axes, and conflating them is how a colour picker ends
 * up offering "dark blue" as though it were a theme — it is a palette in both
 * modes, each with its own token values.
 *
 * Like the theme's storage key, this one is a plain `palette` and not a
 * namespaced key from `prefs.ts`, because the inline script in `index.html`
 * has to read it before the bundle exists. That script cannot import this
 * module, so the key, the default and the attribute name are written out in
 * both places and have to be changed together.
 *
 * The rule that falls out of that, and is worth stating because it looks like
 * an inconsistency otherwise: a preference the inline script reads keeps a
 * plain key, and everything else goes through `prefs.ts` and is namespaced.
 * App font is read only by app code, so it is `tavi.font`. Theme and palette
 * are both applied as attributes on the root before the bundle loads, so both
 * are plain. The theme's key could have been namespaced years ago and moving
 * it would have discarded the choice of anyone who had already made one; this
 * one is new and could still follow either rule, and follows its sibling
 * because the two are applied by the same script and read side by side.
 *
 * Applying a palette sets `data-palette` on the root element and changes
 * nothing else. The token values live in `index.css` beside every other
 * token, selected by that attribute, rather than being written onto the
 * element as inline styles — which would put the palette's colours in
 * JavaScript and in the stylesheet, and give two answers whenever they
 * disagreed.
 */

/** A palette's identity, as it appears on the root element. */
export type PaletteId = string

export type Palette = {
  id: PaletteId
  name: string
  /**
   * Representative colours for the picker, one set per mode.
   *
   * Each set runs background → foreground, so the first bar is the surface the
   * app is drawn on and the last is the text on top of it. That is the order
   * that stays meaningful across modes: "lightest first" would reverse meaning
   * between them, and the dark set would begin with the colour on the other
   * end of the ramp.
   *
   * Two sets because the picker shows whichever mode the app is currently in,
   * and a strip of light values on a dark screen describes nothing the reader
   * can see — it would show what the palette looks like in the mode the reader
   * is not using. Which also means a palette has to supply both here, exactly
   * as it has to supply both token sets in `index.css`.
   *
   * These are not read back off the stylesheet. A swatch has to be drawable
   * for a palette that is not currently applied, and resolving that would mean
   * putting each candidate on the element in turn to measure it. They exist to
   * tell palettes apart at a glance, and a palette that ships the wrong strip
   * is noticed immediately, because the strip sits next to the thing it
   * describes.
   */
  swatch: { light: string[]; dark: string[] }
}

/**
 * The palettes on offer.
 *
 * `Default` is the app's existing token set, unchanged — its swatch is the
 * actual values from `index.css`. Further palettes are added here, each with
 * its own token block in `index.css` keyed on the same id.
 *
 * The swatch is a strip, and a strip shows the colours that tell one palette
 * from another. It is not the whole token set: a palette has to define every
 * token the base defines — `--panel-border` among them, the faint edge a
 * floating panel carries — and the test fails one that is missing any of
 * them, so a new palette cannot leave one of them behind.
 */
export const PALETTES: Palette[] = [
  {
    id: "default",
    name: "Default",
    // background, secondary, border, muted-foreground, foreground — each
    // taken from the matching block in index.css, and each the colour it
    // actually paints: the border is translucent, so the swatch shows it laid
    // over the background it is drawn on, which is what a reader sees.
    //
    // The panel's own edge is not in the strip. It is a line a pixel wide
    // and a few percent off the panel's fill, and a bar of that colour
    // would be indistinguishable from the border's — which is the whole
    // point of a strip.
    swatch: {
      light: [
        "oklch(1 0 0)",
        "oklch(0.95 0 0)",
        "oklch(0.91 0 0)",
        "oklch(0.556 0 0)",
        "oklch(0.145 0 0)",
      ],
      dark: [
        "oklch(0.145 0 0)",
        "oklch(0.269 0 0)",
        "oklch(0.19 0 0)",
        "oklch(0.708 0 0)",
        "oklch(0.985 0 0)",
      ],
    },
  },
]

export const DEFAULT_PALETTE: PaletteId = "default"

export const PALETTE_STORAGE_KEY = "palette"

/** The attribute the stylesheet selects on. Kept in step with `index.css`. */
const PALETTE_ATTRIBUTE = "data-palette"

export function isKnownPalette(id: unknown): id is PaletteId {
  return PALETTES.some((palette) => palette.id === id)
}

function readStored(): PaletteId {
  if (typeof localStorage === "undefined") return DEFAULT_PALETTE
  try {
    const stored = localStorage.getItem(PALETTE_STORAGE_KEY)
    /* An unknown id reads as the default rather than throwing. A palette
       added in a later version of the app must not stop this one starting,
       and a palette removed in one must not leave the app unstyled. */
    return isKnownPalette(stored) ? stored : DEFAULT_PALETTE
  } catch {
    return DEFAULT_PALETTE
  }
}

/** Puts a palette on screen. Does not store it. */
export function applyPalette(id: PaletteId) {
  if (typeof document === "undefined") return
  /* Always written, including for the default. An attribute that is present
     when it means "the default" and absent when it is not leaves the
     stylesheet with two ways of saying the same thing, and the pre-paint
     script in `index.html` has to reproduce that choice exactly. */
  document.documentElement.setAttribute(
    PALETTE_ATTRIBUTE,
    isKnownPalette(id) ? id : DEFAULT_PALETTE
  )
}

let cached: PaletteId | null = null

export function getPalette(): PaletteId {
  cached ??= readStored()
  return cached
}

const listeners = new Set<() => void>()

function notify() {
  for (const listener of listeners) listener()
}

export function subscribePalette(listener: () => void): () => void {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

export function setPalette(id: PaletteId) {
  const next = isKnownPalette(id) ? id : DEFAULT_PALETTE
  cached = next
  try {
    localStorage.setItem(PALETTE_STORAGE_KEY, next)
  } catch {
    /* Private mode, or storage disabled. The choice still applies for this
       session, and failing to persist a preference is not worth interrupting
       anyone over. */
  }
  applyPalette(next)
  notify()
}

/**
 * The palette in force, and a setter for it.
 *
 * Read through the store rather than from state so two controls reading it
 * cannot disagree, and so a change in one moves the other.
 */
export function usePalette(): [PaletteId, (id: PaletteId) => void] {
  const palette = React.useSyncExternalStore(
    subscribePalette,
    getPalette,
    getPalette
  )
  return [palette, setPalette]
}

/**
 * Puts the stored palette on screen before the first render.
 *
 * The counterpart to the inline script in `index.html`. That one normally gets
 * there first; this exists so the app is still correct if it is absent, which
 * is the case for any future host that serves the bundle without that page.
 */
export function restorePalette() {
  applyPalette(getPalette())
}