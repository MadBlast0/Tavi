"use client"

import * as React from "react"
import { ArrowLeftIcon, ArrowRightIcon, MenuIcon, PanelLeftIcon } from "lucide-react"

import { Button } from "@/components/button"
import {
  Sidebar,
  SidebarContent,
  SidebarHeader,
  SidebarProvider,
  SidebarTrigger,
  useSidebar,
} from "@/components/sidebar"
import { ComposerVariantSwitch } from "@/blocks/prompt-input/composer-variant"
import { cn } from "@/lib/utils"

/**
 * The four controls that live in the top-left corner of the shell.
 *
 * They are mounted once, over the shell rather than inside either half of it,
 * which is the only arrangement where they stay put. Mounted in the sidebar
 * while it is open and in the workspace while it is closed, they would have to
 * cross the seam on every toggle — and a control that flies from one side of
 * a divider to the other reads as the sidebar moving when the sidebar did not.
 * Here the sidebar animates underneath them and they do not move at all.
 *
 * Only the sidebar toggle has anything to act on yet. The app has no menu and
 * no navigation history, so those three are rendered disabled rather than
 * wired to something that does nothing. A button that looks live and is not
 * is worse than one that admits it.
 */
function ShellControls({
  onBack,
  onForward,
  canGoBack,
  canGoForward,
  className,
}: {
  onBack?: () => void
  onForward?: () => void
  canGoBack?: boolean
  canGoForward?: boolean
  className?: string
}) {
  return (
    <div
      className={cn(
        "flex h-(--shell-top-bar-h) items-center gap-0.5",
        className
      )}
    >
      {/* The vendored trigger, so the toggle keeps its aria-expanded and
          aria-controls wiring and the focus hand-back when the sidebar closes
          over something focused. */}
      <SidebarTrigger size="icon-xs" aria-label="Toggle sidebar">
        <PanelLeftIcon className="rtl:-scale-x-100" />
      </SidebarTrigger>
      <Button variant="ghost" size="icon-xs" aria-label="Main menu" disabled>
        <MenuIcon />
      </Button>
      <Button
        variant="ghost"
        size="icon-xs"
        aria-label="Back"
        disabled={!canGoBack}
        onClick={onBack}
      >
        <ArrowLeftIcon />
      </Button>
      <Button
        variant="ghost"
        size="icon-xs"
        aria-label="Forward"
        disabled={!canGoForward}
        onClick={onForward}
      >
        <ArrowRightIcon />
      </Button>
    </div>
  )
}

/**
 * The work area: everything that is not the sidebar.
 *
 * While the sidebar is showing, this rounds down its left side, so the workspace
 * reads as a panel beside the rail rather than as two rectangles butted
 * together. Its left edge is the sidebar's right edge — one line, both walls —
 * and the curve cuts back from it into the work area, letting the shell's
 * backdrop show through. That backdrop is the sidebar's own colour, so the
 * corner reads as the rail wrapping around the panel rather than as a gap
 * between two things.
 *
 * An earlier version inset the work area by 8px instead. That put 8px of
 * nothing between the two halves, which is a gap, not a wall.
 *
 * Collapsed, there is nothing beside it to be rounded against, so it goes back
 * to square — rounding a full-bleed panel against the window edge would just
 * look like a mistake.
 */
function WorkArea({ children }: { children: React.ReactNode }) {
  const { state } = useSidebar()

  return (
    <div
      data-sidebar-open={state === "expanded" ? "" : undefined}
      className="relative flex min-w-0 flex-1 flex-col data-[sidebar-open]:overflow-hidden data-[sidebar-open]:rounded-l-2xl"
    >
      {children}
    </div>
  )
}

/**
 * The shell: a sidebar and the work area beside it.
 *
 * The sidebar is empty on purpose. It exists so the toggle has something real
 * to collapse and the work area has a left edge to be centred against. Nothing
 * is drawn in it yet and nothing pretends otherwise.
 *
 * On mobile the vendored Sidebar renders as a sheet over the work area, which
 * is why the controls stay where they are rather than tucking into a header
 * that is not there.
 */
export function Shell({ children }: { children: React.ReactNode }) {
  return (
    /* `relative` so the controls can anchor to the shell's own top-left corner —
       the one point that means the same thing whether or not the sidebar is
       showing.

       `bg-sidebar` is the backdrop the work area's rounded corners are cut out
       of. It is the same colour the rail paints, so the curve reads as the rail
       wrapping around the workspace rather than as a hole.

       `--shell-top-bar-h` is the app's top bar, and it is the single source of
       its thickness: the sidebar's strip is sized by it, and the work area's
       header reads the same variable. One number, two consumers, so the halves
       cannot end up a pixel apart. Nothing is drawn between them — a rule here
       only ever disagreed with the one it was meant to continue. */
    <SidebarProvider className="relative bg-sidebar [--shell-top-bar-h:2.25rem]">
      <Sidebar collapsible="offcanvas">
        {/* The four controls sit over the shell rather than in here, so they
            hold their place across the collapse. The switch belongs to the
            sidebar properly — it disappears with it — so it lives in the
            header, below the top bar.

            `mt` puts the header under the top bar rather than over it. */}
        <SidebarHeader className="mt-(--shell-top-bar-h)">
          <ComposerVariantSwitch className="w-fit" />
        </SidebarHeader>
        <SidebarContent />
      </Sidebar>
      <WorkArea>{children}</WorkArea>
      <ShellControls className="absolute start-0 top-0 z-30 px-1.5" />
    </SidebarProvider>
  )
}