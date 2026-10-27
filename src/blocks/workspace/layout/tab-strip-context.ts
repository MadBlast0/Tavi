"use client"

import * as React from "react"

/**
 * The tab chrome a group lends to the pane it is showing.
 *
 * A tabbed group used to draw a strip above the pane and the pane used to
 * draw its own header under it, so the reader paid twice for the same band.
 * The group now hands the strip to the pane, and the pane draws it inside
 * the one header it already has.
 *
 * The panel's name lives here too, because the panel role belongs on the
 * pane's content area rather than on a wrapper around the whole pane — a
 * tab list must not sit inside the panel it controls.
 */
export type PaneTabStrip = {
  /**
   * The tab list, drawn inside the pane's header band. Absent when the
   * group is maximized and the pane shows its own title instead.
   */
  strip?: React.ReactNode
  /** The id of the panel the tabs control. */
  panelId: string
  /** The id of the tab that names the panel, when there is one. */
  labelledBy?: string
  /** The panel's accessible name when no tab can name it (maximized). */
  label?: string
}

export const PaneTabStripContext = React.createContext<PaneTabStrip | null>(null)
