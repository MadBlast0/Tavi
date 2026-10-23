/**
 * Opening the command palette.
 *
 * The palette is opened by a shortcut and by the application menu's own row,
 * and the menu is a sibling of the palette rather than its parent — so the
 * two are joined by an event on the window rather than by a prop threaded
 * through everything between them.
 *
 * This is the same shape the settings card uses, and for the same reason:
 * the thing that opens the card is below the card, and the card is the only
 * thing that answers to the request.
 */

/** The palette is to open. */
export const OPEN_PALETTE = "tavi:open-palette"

/** The shortcut that opens the palette. */
export const PALETTE_HOTKEY = "mod+k"

/** Opens the palette. */
export const openPalette = () => {
  if (typeof window === "undefined") return
  window.dispatchEvent(new CustomEvent(OPEN_PALETTE))
}
