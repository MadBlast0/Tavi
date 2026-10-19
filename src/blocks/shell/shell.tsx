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
import { matchesHotkey } from "@/lib/hotkey"
import { SidebarAccount } from "./sidebar-account"
import { SidebarNav } from "./sidebar-nav"
import { SETTINGS_HOTKEY, SettingsDialog } from "./settings-dialog"
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
 * The rail's width.
 *
 * Deliberately not stored. A width you set by dragging is a fit for the window
 * you are looking at; saving it would reopen the app at a width chosen for some
 * other screen, and on a narrower display the work area would be left too small
 * to read. Closing and reopening returns it to the default, which is the only
 * value guaranteed to be right.
 *
 * The floor is set where the rail's own rows stop being readable — a session
 * title has to clear the status dot, its own padding, and the timestamp
 * overlaid at the end of the row before it starts being clipped. The ceiling is
 * set where the rail has stopped earning the width: past it the work area is
 * being squeezed for a panel that has nothing wide in it yet.
 */
const SIDEBAR_WIDTH_DEFAULT = 256
const SIDEBAR_WIDTH_MIN = 200
const SIDEBAR_WIDTH_MAX = 440
/** How far the arrow keys move the wall. */
const SIDEBAR_WIDTH_STEP = 16

function clampSidebarWidth(value: number) {
  return Math.min(SIDEBAR_WIDTH_MAX, Math.max(SIDEBAR_WIDTH_MIN, value))
}

/**
 * The wall between the rail and the work area, which you can grab and drag.
 *
 * It sits exactly on the seam, so the line you are dragging is the line the two
 * panels already meet at. Nothing is drawn there: the boundary between the two
 * surfaces is already visible as the step from one colour to the other, and a
 * rule laid over it only doubles the edge. There is deliberately no hover or
 * active state either — this is a wall, not a control, and a wall that lights
 * up when the pointer crosses it reads as something to press. The handle is a
 * grab area with nothing in it.
 *
 * The one thing that does appear is the focus ring, and only under keyboard
 * focus. The handle is reachable and operable from the keyboard — arrow keys to
 * nudge, Home and End for the ends of the range — and a control that can be
 * operated by keyboard but cannot be seen to have focus is not operable by
 * anyone who cannot use a mouse. It never appears on click.
 *
 * Pointer events rather than mouse events, so it drags under a touch or a pen
 * as well, and the pointer is captured on the way down so the drag survives
 * leaving the 12px strip.
 */
function SidebarResizeHandle({
  width,
  onResize,
  onResizeStart,
}: {
  width: number
  onResize: (width: number) => void
  onResizeStart: (dragging: boolean) => void
}) {
  const { state } = useSidebar()
  const start = React.useRef<{ x: number; width: number } | null>(null)
  const settleTimer = React.useRef<number | null>(null)

  const cancelSettle = React.useCallback(() => {
    if (settleTimer.current !== null) window.clearTimeout(settleTimer.current)
    settleTimer.current = null
  }, [])

  React.useEffect(() => cancelSettle, [cancelSettle])

  function onPointerDown(event: React.PointerEvent<HTMLDivElement>) {
    if (event.pointerType === "mouse" && event.button !== 0) return
    cancelSettle()
    start.current = { x: event.clientX, width }
    onResizeStart(true)
    event.currentTarget.setPointerCapture(event.pointerId)
  }

  function onPointerMove(event: React.PointerEvent<HTMLDivElement>) {
    const from = start.current
    if (!from) return
    onResize(clampSidebarWidth(from.width + (event.clientX - from.x)))
  }

  function onPointerUp(event: React.PointerEvent<HTMLDivElement>) {
    start.current = null
    onResizeStart(false)
    cancelSettle()
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId)
    }
  }

  function onKeyDown(event: React.KeyboardEvent<HTMLDivElement>) {
    const step = SIDEBAR_WIDTH_STEP
    if (event.key === "ArrowLeft") onResize(clampSidebarWidth(width - step))
    else if (event.key === "ArrowRight") onResize(clampSidebarWidth(width + step))
    else if (event.key === "Home") onResize(SIDEBAR_WIDTH_MIN)
    else if (event.key === "End") onResize(SIDEBAR_WIDTH_MAX)
    else return
    event.preventDefault()
    /* The rail's width eases over a quarter of a second so that collapsing it
       animates. Held-down arrow keys would queue one easing move behind
       another and the wall would trail the keyboard, so a key press marks the
       change as direct manipulation and it lands at once. The flag is given a
       moment to fall back so the next collapse still animates. */
    onResizeStart(true)
    cancelSettle()
    settleTimer.current = window.setTimeout(() => onResizeStart(false), 200)
  }

  /* Collapsed the rail is off the page, so there is no wall to grab. */
  if (state !== "expanded") return null

  return (
    <div
      role="separator"
      aria-label="Resize sidebar"
      aria-orientation="vertical"
      aria-valuenow={width}
      aria-valuemin={SIDEBAR_WIDTH_MIN}
      aria-valuemax={SIDEBAR_WIDTH_MAX}
      tabIndex={0}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
      onKeyDown={onKeyDown}
      style={{ insetInlineStart: width }}
      className="group absolute inset-y-0 z-30 w-3 -translate-x-1/2 cursor-col-resize touch-none select-none focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-foreground/60"
    />
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
 *
 * The radius is past the theme's scale on purpose. That scale stops at 26px,
 * which is a corner for a card; this is a corner for a panel a thousand pixels
 * tall, and it wants a little more than that to read as the same curve rather
 * than a token one notch tighter. It is named here so the number has one home.
 *
 * `corner-shape` is what separates a corner from a proper curve. `border-radius`
 * draws a circular arc, which meets each edge at a visible corner; Apple's does
 * not meet them at all — it runs its curve into the straight edge so the tangent
 * is continuous, which is why theirs reads as softer at the same radius. The
 * browser has to say so explicitly, and a browser that does not understand the
 * property ignores it and draws the circular arc, so this costs nothing where it
 * is unsupported.
 */
const WORK_AREA_CORNER = "2.5rem"

function WorkArea({ children }: { children: React.ReactNode }) {
  const { state } = useSidebar()

  return (
    <div
      data-sidebar-open={state === "expanded" ? "" : undefined}
      style={
        {
          "--work-area-corner": WORK_AREA_CORNER,
          cornerShape: "squircle",
        } as React.CSSProperties
      }
      className="relative flex min-w-0 flex-1 flex-col data-[sidebar-open]:overflow-hidden data-[sidebar-open]:rounded-l-[var(--work-area-corner)]"
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
  const [width, setWidth] = React.useState(SIDEBAR_WIDTH_DEFAULT)
  const [resizing, setResizing] = React.useState(false)
  const [settingsOpen, setSettingsOpen] = React.useState(false)

  /* The rail's width is also published on the document root, not only on the
     shell wrapper the sidebar provider makes it a variable of. Menus and popovers
     render in a portal at the end of the body, so they inherit from there and
     never see the wrapper's value — which is what lets the account menu size
     itself to the rail instead of spilling out of it. */
  React.useEffect(() => {
    document.documentElement.style.setProperty("--sidebar-width", `${width}px`)
  }, [width])

  /* The account menu prints the shortcut next to its Settings row, so the
     shortcut has to be true. It is bound on the window rather than on the card,
     because the card may not be open — that is the whole point of a shortcut. */
  React.useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (
        event.defaultPrevented ||
        event.repeat ||
        !matchesHotkey(event, SETTINGS_HOTKEY)
      ) {
        return
      }
      event.preventDefault()
      setSettingsOpen(true)
    }
    window.addEventListener("keydown", onKeyDown)
    return () => window.removeEventListener("keydown", onKeyDown)
  }, [])

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
       only ever disagreed with the one it was meant to continue.

       The `resizing` flag suspends the vendored sidebar's own width animation.
       Left running, it eases the rail toward the pointer at a quarter of a
       second per frame and the whole panel trails the cursor. */
    <SidebarProvider
      data-resizing={resizing ? "" : undefined}
      style={{ "--sidebar-width": `${width}px` } as React.CSSProperties}
      className={cn(
        "relative bg-sidebar [--shell-top-bar-h:2.25rem]",
        "data-[resizing]:[&_[data-slot=sidebar]]:transition-none",
        "data-[resizing]:[&_[data-slot=sidebar-container]]:transition-none",
      )}
    >
      {/* `after:hidden` drops the vendored rail's own right-hand edge: the
          resize handle draws that line instead, so the wall is one line that
          reacts to the pointer rather than a static rule with a hit area on
          top of it. */}
      <Sidebar collapsible="offcanvas" className="after:hidden">
        {/* The four controls sit over the shell rather than in here, so they
            hold their place across the collapse. The switch belongs to the
            sidebar properly — it disappears with it — so it lives in the
            header, below the top bar.

            `mt` puts the header under the top bar rather than over it. */}
        <SidebarHeader className="mt-(--shell-top-bar-h)">
          <ComposerVariantSwitch className="w-fit" />
        </SidebarHeader>
        {/* `gap-0` because the groups carry their own spacing. The vendored
            content adds 8px between them on top of each group's padding, which
            is what makes a rail of a dozen rows feel twice as tall as it is. */}
        <SidebarContent className="gap-0 scrollbar-none">
          <SidebarNav />
        </SidebarContent>
        <SidebarAccount onOpenSettings={() => setSettingsOpen(true)} />
      </Sidebar>
      <WorkArea>{children}</WorkArea>
      <ShellControls className="absolute start-0 top-0 z-30 px-1.5" />
      <SidebarResizeHandle
        width={width}
        onResize={setWidth}
        onResizeStart={(dragging) => setResizing(dragging)}
      />
      {/* Outside the shell's own stacking, because the card portals to the end of
          the body and covers the rail anyway — mounting it inside would only
          decide what it covers on the way there. */}
      <SettingsDialog open={settingsOpen} onOpenChange={setSettingsOpen} />
    </SidebarProvider>
  )
}