"use client"

import * as React from "react"
import { ArrowLeftIcon, ArrowRightIcon, PanelLeftIcon } from "lucide-react"

import { Button } from "@/components/button"
import { SidebarTrigger } from "@/components/sidebar"
import { AppMenu } from "./app-menu"
import { WindowControls } from "./window-controls"

/**
 * The title bar: the strip along the top of the window.
 *
 * The window is undecorated — the operating system's own caption is turned off
 * — so this is the app's caption. It carries the app's controls on the left,
 * the window's controls on the right, and the empty space between them is
 * what the window is dragged by.
 *
 * It is drawn over the shell rather than beside it, and it is transparent
 * rather than painted. That is what makes it match the app's own top bar
 * exactly rather than approximately: the rail's colour and the work area's
 * colour are behind it, and the curve where the work area meets the rail is
 * the curve the work area already draws. A bar of its own colour would have
 * to redraw that curve to match, and would get it subtly wrong.
 *
 * The controls on the left are the ones that were in the app's top bar. They
 * are mounted here rather than over the shell so they hold their place
 * across the sidebar's collapse: mounted in the sidebar while it is open and
 * in the workspace while it is closed, they would have to cross the seam on
 * every toggle, and a control that flies from one side of a divider to the
 * other reads as the sidebar moving when the sidebar did not.
 *
 * Only the sidebar toggle has anything to act on yet, along with the menu.
 * The app has no navigation history, so the back and forward controls are
 * rendered disabled rather than wired to something that does nothing. A
 * button that looks live and is not is worse than one that admits it.
 */
export function TitleBar() {
  return (
    <div className="absolute inset-x-0 top-0 z-30 flex h-(--shell-top-bar-h) items-center">
      <div className="flex shrink-0 items-center gap-0.5 px-1.5">
        {/* The vendored trigger, so the toggle keeps its aria-expanded and
            aria-controls wiring and the focus hand-back when the sidebar
            closes over something focused.

            The size is set here rather than taken from the component's own
            `icon-xs`, because the bar is thinner than that button: the
            control has to be the height of the strip it sits in, or it
            overflows it.

            The height and the icon are the sidebar's: a rail row is 28 pixels
            tall with a 16 pixel icon in it, and the bar's controls are the
            same, so a control is the same size wherever it is and the app has
            one vertical rhythm rather than two. The icon carries its own size
            for the same reason — the vendored rule only sizes icons that do
            not name a size themselves, so naming one here is what makes it
            stick. */}
        <SidebarTrigger
          size="icon-xs"
          className="size-7"
          aria-label="Toggle sidebar"
        >
          <PanelLeftIcon className="size-4 rtl:-scale-x-100" />
        </SidebarTrigger>
        <AppMenu />
        <Button
          variant="ghost"
          size="icon-xs"
          className="size-7"
          aria-label="Back"
          disabled
        >
          <ArrowLeftIcon className="size-4" />
        </Button>
        <Button
          variant="ghost"
          size="icon-xs"
          className="size-7"
          aria-label="Forward"
          disabled
        >
          <ArrowRightIcon className="size-4" />
        </Button>
      </div>

      {/* The empty middle of the bar, which is what the window is dragged by.

          The attribute is enough: Tauri watches for it and starts the drag
          itself, so no handler is needed and no permission is spent on a
          JavaScript round trip. It is deliberately a bare element with nothing
          in it — the attribute drags only where the pointer lands on the
          element itself, so a child inside it would be a hole in the drag
          area.

          The buttons on either side are not holes: a button is not a drag
          region, and a click on one of them is a click and not the start of a
          move. */}
      <div data-tauri-drag-region className="h-full min-w-0 flex-1" />

      <WindowControls />
    </div>
  )
}
