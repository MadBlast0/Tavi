"use client"

import * as React from "react"

import { cn } from "@/lib/utils"

/**
 * The workspace region.
 *
 * The workspace is the main content region — the area of the window beside
 * the rail, the area the prompt composer sits in. It is not a place you go
 * and it is not a mode, and there is nothing in the rail that navigates to
 * it. It is simply the region, and it is always there.
 *
 * **The first version of this was a sibling that replaced the surface**, and
 * it was hidden whenever the workspace was "closed". That was built on the
 * assumption that the workspace is a destination, and that assumption is
 * what put a row in the rail: a place you go needs a way in.
 *
 * What the region shows is decided by what is in the workspace, not by a
 * switch:
 *
 * - no session and no panes — the landing screen, exactly as it is today;
 * - a session, or at least one pane — the layout.
 *
 * So the host has no flag of its own and no "closed" state. It is a box,
 * and what is in the box is somebody else's business.
 *
 * The top padding is the title bar's height, and the title bar is drawn over
 * the top of the work area. The padding is on the host rather than on what
 * is inside it, so the background still reaches the top of the window: the
 * work area's colour has to be there for the title bar to sit against.
 */
export function WorkspaceHost({
  children,
  className,
}: {
  /** What the region shows. The landing screen, the layout, or both. */
  children?: React.ReactNode
  className?: string
}) {
  return (
    <div
      data-slot="workspace-host"
      className={cn(
        "flex h-svh min-h-0 flex-col bg-background pt-(--shell-top-bar-h)",
        className,
      )}
    >
      {children}
    </div>
  )
}
