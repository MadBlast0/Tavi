"use client"

import * as React from "react"

/**
 * Which way round a box is.
 *
 * `wide` is the box being at least as wide as it is tall — 1:1 and wider — and
 * `tall` is everything else. A square counts as `wide`, since a square has as
 * much room for two panes side by side as anything else of its size.
 *
 * Measured against the element itself, not the window. This matters because the
 * element is usually not the window's shape: a dialog in the middle of a wide
 * screen can easily be taller than it is wide, and it is the dialog that has to
 * decide how to lay itself out.
 *
 * A width threshold cannot answer this on its own. A box 400px wide and 900px
 * tall has room for a column beside a pane and no height to spend on one; a box
 * 1200px wide and 300px tall has height and almost no width to divide. Every
 * width step gives both the same answer, and it is wrong for one of them in
 * each case. A box also changes shape as its window does without passing
 * through the width a width-based rule would switch at — narrowing a window
 * from the side leaves its height alone, so a comfortably wide box goes tall
 * while its width never crossed the threshold.
 *
 * **But a box can be too narrow for the layout its proportions would choose.**
 * `minWide` is that floor: the narrowest the box can be and still be `wide`,
 * because the wide shape divides the box, and a box that cannot be divided
 * leaves one of the halves a sliver. A card that is wider than it is tall can
 * still be too narrow for a column beside a pane, and its proportions do not
 * say so — only its width does. So the width sets a floor and the proportions
 * decide above it.
 *
 * The reading is taken in a layout effect rather than on mount, so it is right
 * before the first paint the reader sees. A layout effect runs after layout but
 * before paint, so the box is never shown in the wrong shape and there is no
 * visible flip to correct afterwards.
 *
 * `ResizeObserver` on the element, not on anything above it. The box can change
 * shape without its parent changing size at all — a sibling growing, a sidebar
 * collapsing, the window dragged from its edge.
 *
 * The element has to be plain DOM, and it has to be there when the effect runs.
 * Both matter and neither fails loudly. A `useRender` wrapper — the card, the
 * dialog frame — does not hand its ref through to the node it renders, so a ref
 * passed to one stays null. And a dialog's content is mounted after the
 * component that owns the dialog has run its effects, so even a ref that works
 * is null on the first pass. Either way the effect returns early and the shape
 * sits at its first reading forever with nothing to say so, which is why a
 * callback ref is used here: it runs when the node arrives, whenever that is,
 * rather than only when the owner happens to render.
 */
export type BoxShape = "wide" | "tall"

function readShape(element: HTMLElement, minWide: number): BoxShape {
  /* The layout box, not the painted one.

     `getBoundingClientRect` includes any transform, and the card is scaled
     in when it opens — so a rectangle read during that animation is smaller
     than the card is going to be. A width floor read that way is a floor on
     the animation rather than on the card, and the reading is then stuck
     there: `ResizeObserver` watches the layout box and does not fire for a
     transform. `offsetWidth` and `offsetHeight` are the layout box, whatever
     is painted. */
  const width = element.offsetWidth
  const height = element.offsetHeight
  /* A box with no box yet measures zero, and zero is not greater than zero, so
     it would read as `tall` and then flip on the first real measurement. `wide`
     means the first real reading only ever corrects something that was not on
     screen. */
  if (width === 0 && height === 0) return "wide"
  if (width < minWide) return "tall"
  return width >= height ? "wide" : "tall"
}

export function useBoxShape(options?: {
  /** The narrowest the box can be and still count as wide. */
  minWide?: number
}): [(node: HTMLElement | null) => void, BoxShape] {
  const minWide = options?.minWide ?? 0
  const [shape, setShape] = React.useState<BoxShape>("wide")
  const observerRef = React.useRef<ResizeObserver | null>(null)

  /* Stable for the life of the component. A ref that changed identity on every
     render would make React detach and re-attach it — which is harmless — but
     the observer would then be torn down and rebuilt on every render for the
     same reason. */
  const attach = React.useCallback(
    (node: HTMLElement | null) => {
      observerRef.current?.disconnect()
      observerRef.current = null
      if (!node) return

      const measure = () => {
        const next = readShape(node, minWide)
        /* Same reading, no re-render. An observer fires on every pixel of a
           drag, and the layout does not care which of those matched the last
           one. Re-rendering on each would put the whole dialog through React
           on every frame of a window drag, for no change to what it shows. */
        setShape((current) => (current === next ? current : next))
      }

      measure()

      const observer = new ResizeObserver(measure)
      observer.observe(node)
      observerRef.current = observer
    },
    [minWide],
  )

  React.useEffect(() => () => observerRef.current?.disconnect(), [])

  return [attach, shape]
}