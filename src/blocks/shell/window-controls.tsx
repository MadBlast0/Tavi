"use client"

import * as React from "react"
import { MinusIcon, SquareIcon, XIcon } from "lucide-react"

import { appWindow, type AppWindow } from "@/lib/desktop"
import { cn } from "@/lib/utils"

/**
 * The three window buttons, drawn the way the operating system draws them.
 *
 * The window has no native caption — it is undecorated, so the app draws its
 * own title bar and these are its right-hand end. They sit where the caption's
 * buttons used to sit and do what those did, because a window control that has
 * moved is a window control that has to be looked for.
 *
 * The proportions are the caption's, scaled to the bar they live in: a
 * 16-pixel glyph, which is the size every icon in the app is, in a button
 * 46 pixels wide and as tall as the bar. The width is the system's own, so
 * the three of them take the same 138 pixels the caption's controls took and
 * the close button stays where the hand expects it.
 *
 * The hover is the system's too — a flat wash for the two that act on the
 * window, red for the one that ends it. A close button that only tints like
 * the others is asking to be clicked without meaning to.
 */
const CAPTION_BUTTON = cn(
  "flex h-full w-[46px] shrink-0 items-center justify-center",
  "text-foreground/80 transition-colors duration-100",
  "hover:bg-accent hover:text-foreground",
  "focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-foreground/60",
)

/** The one that ends the window, which is the one that is coloured. */
const CLOSE_BUTTON = cn(
  CAPTION_BUTTON,
  "hover:bg-[#c42b1c] hover:text-white focus-visible:outline-[#c42b1c]",
)

/**
 * The glyph for "restore": two squares, one behind the other.
 *
 * Windows draws the un-maximized button as a single square and the maximized
 * one as that square with a second one behind it, so the two states are told
 * apart by shape rather than by a label. Lucide has no such glyph, and
 * `CopyIcon` is a sheet with a folded corner, which reads as "duplicate" at
 * this size. Two squares, offset, is the shape that means what it means.
 */
function RestoreGlyph() {
  return (
    <span className="relative block size-4" aria-hidden>
      <SquareIcon className="absolute top-0 right-0 size-3.25" />
      <SquareIcon className="absolute bottom-0 left-0 size-3.25" />
    </span>
  )
}

/**
 * The window this app is running in, or nothing if there is no window.
 *
 * The web target has none: a browser tab cannot be minimized, and the handle
 * Tauri hands out for it does not exist outside the desktop shell. Reaching
 * for it there would throw, and a throw in a render takes the whole app with
 * it — so the handle is taken once, defensively, and the buttons are simply
 * not drawn when there is nothing to draw them for.
 */
function useAppWindow(): AppWindow | null {
  return React.useMemo(() => appWindow(), [])
}

/**
 * The window buttons.
 *
 * Nothing is drawn outside the desktop app: a browser tab has no window to
 * minimize, and a button that cannot do what it says is worse than no button.
 * The drag region in the title bar is inert in the browser for the same
 * reason, and needs no such check — it is only an attribute.
 */
export function WindowControls() {
  const win = useAppWindow()
  const [maximized, setMaximized] = React.useState(false)

  React.useEffect(() => {
    if (!win) return

    let disposed = false
    let unlisten: (() => void) | undefined

    /* The maximized state is not ours to know: the window can be maximized
       from the keyboard, from a snap layout, or by the user double-clicking
       the drag region. So it is read back from the window rather than tracked
       from the button, and the button reflects whatever the window says. */
    const sync = async () => {
      try {
        const next = await win.isMaximized()
        if (!disposed) setMaximized(next)
      } catch {
        /* The window is on its way out. The state it held no longer has
           anywhere to be shown. */
      }
    }

    void sync()
    void win.onResized(() => void sync()).then((stop) => {
      if (disposed) stop()
      else unlisten = stop
    })

    return () => {
      disposed = true
      unlisten?.()
    }
  }, [win])

  if (!win) return null

  /* Every one of these can fail for the same reason — the window is closing
     underneath the click — and there is nowhere to report that to. The window
     either did the thing or it is gone, and both are fine. */
  const run = (action: () => Promise<void>) => {
    void action().catch(() => {})
  }

  return (
    <div className="flex h-full shrink-0 items-stretch">
      <button
        type="button"
        className={CAPTION_BUTTON}
        aria-label="Minimize window"
        onClick={() => run(() => win.minimize())}
      >
        <MinusIcon className="size-4" />
      </button>
      <button
        type="button"
        className={CAPTION_BUTTON}
        aria-label={maximized ? "Restore window" : "Maximize window"}
        onClick={() => run(() => win.toggleMaximize())}
      >
        {maximized ? <RestoreGlyph /> : <SquareIcon className="size-4" />}
      </button>
      <button
        type="button"
        className={CLOSE_BUTTON}
        aria-label="Close window"
        onClick={() => run(() => win.close())}
      >
        <XIcon className="size-4" />
      </button>
    </div>
  )
}
