"use client"

import * as React from "react"

import {
  Sidebar,
  SidebarContent,
  SidebarHeader,
  SidebarProvider,
  useSidebar,
} from "@/components/sidebar"
import { ComposerVariantSwitch } from "@/blocks/prompt-input/composer-variant"
import { matchesHotkey } from "@/lib/hotkey"
import { CommandPalette } from "./command-palette"
import {
  notifySettingsClosed,
  OPEN_SETTINGS,
} from "@/lib/open-settings"
import { PREF, readPref, writePref } from "@/lib/prefs"
import { SidebarAccount } from "./sidebar-account"
import { SidebarNav } from "./sidebar-nav"
import { SETTINGS_HOTKEY, SettingsDialog } from "./settings-dialog"
import { TitleBar } from "./title-bar"
import { cn } from "@/lib/utils"

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
 *
 * It starts below the title bar rather than at the top of the window. The bar
 * lies over the seam and would otherwise take the first 36 pixels of it, and a
 * grab area that is there but does nothing is worse than one that is not
 * there.
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
      className="group absolute top-(--shell-top-bar-h) bottom-0 z-30 w-3 -translate-x-1/2 cursor-col-resize touch-none select-none focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-foreground/60"
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
  /* Which section the card opens on. Undefined is the default one; a name is
     a destination, set by whatever asked for the card. */
  const [settingsSection, setSettingsSection] = React.useState<
    string | undefined
  >(undefined)

  /* The card is opened from below the shell as well as from the account menu —
     the composer's model button sends the user here to add a key — so the two
     are joined by an event rather than by a prop threaded through everything
     between them. */
  React.useEffect(() => {
    const onOpen = (event: Event) => {
      setSettingsSection((event as CustomEvent<string | undefined>).detail)
      setSettingsOpen(true)
    }
    window.addEventListener(OPEN_SETTINGS, onOpen)
    return () => window.removeEventListener(OPEN_SETTINGS, onOpen)
  }, [])

  /* Whether the rail is open.
     The first time the app is ever run it is closed, so what is on screen is
     the conversation and the box to type in rather than a list of places to
     go. The rail is navigation for when it is wanted, and on the first run
     nobody has said they want it.

     After that it is remembered, because the rail is a working tool: someone
     living in the session list wants it open every morning, and someone who
     closed it wants it shut. The width is deliberately *not* remembered, for
     the reason given above it.

     The stored value is read during the first render rather than in an
     effect, so the rail is never painted open and then closed — the same
     reason the model and the effort are read that way. */
  const [railOpen, setRailOpen] = React.useState(() => {
    const stored = readPref(PREF.sidebar)
    return stored === undefined ? false : stored === "true"
  })

  const onRailOpenChange = React.useCallback((open: boolean) => {
    setRailOpen(open)
    writePref(PREF.sidebar, String(open))
  }, [])

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
    /* `relative` so the title bar can anchor to the shell's own top-left
       corner — the one point that means the same thing whether or not the
       sidebar is showing.

       `bg-sidebar` is the backdrop the work area's rounded corners are cut out
       of. It is the same colour the rail paints, so the curve reads as the rail
       wrapping around the workspace rather than as a hole.

       `--shell-top-bar-h` is the title bar, and it is the single source of its
       thickness: the bar itself is sized by it, the rail's strip is sized by it,
       and the work area's content starts below it by the same amount. One
       number, three consumers, so the halves cannot end up a pixel apart.
       Nothing is drawn between them — a rule here only ever disagreed with the
       one it was meant to continue.

       The `resizing` flag suspends the vendored sidebar's own width animation.
       Left running, it eases the rail toward the pointer at a quarter of a
       second per frame and the whole panel trails the cursor.

        The number itself lives on the root rather than here, so that anything
        portalled to the body can clear the bar as well. */
    <SidebarProvider
      data-resizing={resizing ? "" : undefined}
      open={railOpen}
      onOpenChange={onRailOpenChange}
      style={{ "--sidebar-width": `${width}px` } as React.CSSProperties}
      className={cn(
        "relative bg-sidebar",
        "data-[resizing]:[&_[data-slot=sidebar]]:transition-none",
        "data-[resizing]:[&_[data-slot=sidebar-container]]:transition-none",
      )}
    >
      {/* `after:hidden` drops the vendored rail's own right-hand edge: the
          resize handle draws that line instead, so the wall is one line that
          reacts to the pointer rather than a static rule with a hit area on
          top of it. */}
      <Sidebar collapsible="offcanvas" className="after:hidden">
        {/* The switch belongs to the sidebar properly — it disappears with it —
            so it lives in the header, below the top bar.

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
      {/* The window's caption, drawn by the app because the window has none of
          its own. It lies over the shell rather than beside it, and it is
          transparent, so the colours and the curve it sits against are the
          shell's own. */}
      <TitleBar />
      <SidebarResizeHandle
        width={width}
        onResize={setWidth}
        onResizeStart={(dragging) => setResizing(dragging)}
      />
      {/* The palette is a sibling of the work area rather than a child of
          it: it is a place to go to, not a thing the work area holds. */}
      <CommandPalette
        onToggleRail={() => onRailOpenChange(!railOpen)}
      />
      {/* Outside the shell's own stacking, because the card portals to the end of
          the body and covers the rail anyway — mounting it inside would only
          decide what it covers on the way there. */}
      <SettingsDialog
        open={settingsOpen}
        onOpenChange={(open) => {
          setSettingsOpen(open)
          if (!open) notifySettingsClosed()
        }}
        section={settingsSection}
      />
    </SidebarProvider>
  )
}