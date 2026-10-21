/**
 * Opening the settings card, and hearing that it closed.
 *
 * The card is the shell's, and the things that want to open it are below it —
 * the composer's model button is three levels down — so the two are joined by
 * events on the window rather than by props threaded through everything
 * between them. The shell listens; whoever needs the card asks.
 *
 * These are window events rather than a context because the card is the only
 * thing that answers to them, and a context would have to be provided above
 * the shell to reach a caller that is already inside it.
 */

/** The card is to open, at a section if one is named. */
export const OPEN_SETTINGS = "tavi:open-settings"

/**
 * The card has closed.
 *
 * Fired on the way out, because that is when a key may have been added or
 * taken away, and the things that depend on which keys there are — the model
 * list, above all — need to know.
 */
export const SETTINGS_CLOSED = "tavi:settings-closed"

/** Opens the card. A section id names where it should open. */
export const openSettings = (section?: string) => {
  if (typeof window === "undefined") return
  window.dispatchEvent(
    new CustomEvent<string | undefined>(OPEN_SETTINGS, { detail: section }),
  )
}

/** Says the card has closed. */
export const notifySettingsClosed = () => {
  if (typeof window === "undefined") return
  window.dispatchEvent(new CustomEvent(SETTINGS_CLOSED))
}
