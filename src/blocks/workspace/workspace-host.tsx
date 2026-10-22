"use client"

import * as React from "react"

import { useWorkspace } from "@/lib/workspace-state"
import { cn } from "@/lib/utils"

/**
 * The workspace host.
 *
 * The workspace is the region that arranges panes. This is where it lives:
 * the work area, beside the rail, filling whatever the window has left over.
 *
 * **It is a host and not a workspace.** It has no idea what a pane is, how
 * many there are, or how they are arranged — the layout engine brings that,
 * and the registry knows what a pane *is*. What this does is hold the space
 * and give the layout somewhere to draw.
 *
 * **It is nothing at all while the workspace is closed.** The app shows the
 * conversation and the composer exactly as it always has, and the landing
 * screens are untouched. The host appears in its place, and closing the
 * workspace puts them back.
 *
 * The top padding is the title bar's height, and the title bar is drawn over
 * the top of the work area. The padding is on the host rather than on what is
 * inside it, so the background still reaches the top of the window: the work
 * area's colour has to be there for the title bar to sit against.
 */
export function WorkspaceHost({
  children,
  className,
}: {
  /** What the layout engine draws. Nothing, until there is one. */
  children?: React.ReactNode
  className?: string
}) {
  const { open } = useWorkspace()
  if (!open) return null
  return (
    <div
      data-slot="workspace-host"
      className={cn(
        "flex min-h-0 flex-1 flex-col bg-background pt-(--shell-top-bar-h)",
        className,
      )}
    >
      {children}
    </div>
  )
}
