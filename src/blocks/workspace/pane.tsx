"use client"

import * as React from "react"
import {
  ArrowDownToLineIcon,
  ChevronDownIcon,
  GripVerticalIcon,
  Minimize2Icon,
  PictureInPicture2Icon,
  XIcon,
} from "lucide-react"

import { Button } from "@/components/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuSeparator,
  DropdownMenuShortcut,
  DropdownMenuTrigger,
} from "@/components/dropdown-menu"
import { TooltipIconButton } from "@/components/tooltip-icon-button"
import { startWorkspaceNativeDrag, type WorkspaceNativeDragPayload } from "@/lib/desktop"
import { formatHotkey, useIsApple } from "@/lib/hotkey"
import { cn } from "@/lib/utils"
import type { DockEdge, PaneInstance } from "@/lib/workspace-state"
import { ViewsPicker } from "./views-picker"
import { PaneTabStripContext } from "./layout/tab-strip-context"
import { WORKSPACE_SHORTCUTS } from "./workspace-shortcuts"

/**
 * The pane frame.
 *
 * A pane is a **region of the window**, not a card. It has no rounded
 * corners, no border of its own and no shadow; it is separated from its
 * neighbour by a single hairline, which is the split's job and not the
 * pane's. The window's own background is the pane's background.
 *
 * The frame is three things:
 *
 * - a **pane title bar**, with the pane's name and relevant view controls;
 * - a **content area** that takes the rest of the pane and scrolls on its
 *   own, so a long conversation scrolls inside its pane and the window does
 *   not move;
 * - the **content itself**, which the caller supplies.
 *
 * The title bar keeps the commonly used view buttons visible. On the right,
 * the pane's own controls are the same three in every pane, in the same
 * order: pop out, the chevron that opens the pane's menu, and close. A narrow
 * pane, or the browser build where pop-out cannot work, folds pop-out into
 * the chevron; maximize, move and split are always in that menu. A maximized
 * pane keeps a visible restore control in the header. A pane drawn in its own
 * window swaps close for dock back, because closing a detached pane returns
 * it to the workspace rather than discarding it.
 */
export function Pane({
  id,
  type,
  title,
  icon: Icon,
  context,
  active,
  children,
  className,
  onClose,
  onSplit,
  onFocus,
  onDockBack,
  onPopOut,
  popOutAvailable,
  onMaximize,
  maximized,
  getDragPayload,
  showViewActions,
  moveTargets = [],
  onMoveTo,
}: {
  /** The pane's unique instance id. */
  id?: string
  /** The pane's type key, for the registry. */
  type?: string
  /** The pane's title: its own, or the type's default. */
  title: string
  /** The mark that names the pane. */
  icon: React.ComponentType<{ className?: string }>
  /** Optional secondary context, such as a filename, session or project. */
  context?: string
  /** Whether this is the pane that has focus. */
  active?: boolean
  /** What the pane shows. */
  children?: React.ReactNode
  className?: string
  /** Closes the pane. */
  onClose?: () => void
  /** Splits the pane, on an edge. */
  onSplit?: (edge: DockEdge) => void
  /** Gives the pane the focus. */
  onFocus?: () => void
  /** Returns a pane that is in its own window to the workspace. */
  onDockBack?: () => void
  /** Pops the pane out into its own window. */
  onPopOut?: () => void
  /** Whether the pane can be popped out yet. */
  popOutAvailable?: boolean
  /** Toggles this pane between its place in the tree and the full workspace. */
  onMaximize?: () => void
  maximized?: boolean
  /** Overrides the default pane drag payload, for example to carry pop-out state. */
  getDragPayload?: () => WorkspaceNativeDragPayload
  /** Compact session tools shown in the session title bar. */
  showViewActions?: boolean
  /** Other panes available for keyboard-accessible tab docking. */
  moveTargets?: Array<{ id: string; title: string }>
  /** Moves this pane into another pane's tab group. */
  onMoveTo?: (targetId: string) => void
}) {
  /**
   * The compact threshold matches the view launchers' own. Below it the
   * header has no room for a direct pop-out, so the action moves into the
   * chevron. The browser build has no pop-out at all (`popOutAvailable` is
   * false) and uses the same fallback, where the menu says why.
   */
  const [compact, setCompact] = React.useState(false)
  const compactRef = React.useRef(false)
  const headerRef = React.useRef<HTMLDivElement>(null)
  /* A tab group lends its strip to the pane it is showing. The strip takes
     the title's place in the header, so the group pays for one chrome band
     rather than one above the other. */
  const tabStrip = React.useContext(PaneTabStripContext)

  React.useLayoutEffect(() => {
    const pane = headerRef.current?.closest<HTMLElement>('[data-slot="pane"]')
    if (!pane) return
    const measure = () => {
      const next = pane.getBoundingClientRect().width < 280
      if (next === compactRef.current) return
      compactRef.current = next
      setCompact(next)
    }
    measure()
    const observer = new ResizeObserver(measure)
    observer.observe(pane)
    return () => observer.disconnect()
  }, [])

  const showPopOut = Boolean(onPopOut) && popOutAvailable === true && !compact

  return (
    <div
      data-slot="pane"
      data-pane-id={id}
      data-active={active ? "" : undefined}
      data-maximized={maximized ? "" : undefined}
      role="region"
      aria-label={`${title} pane`}
      aria-current={active ? "true" : undefined}
      /* Focus cycling lands on the title or tab. When neither is drawn, the
         labeled region is still a programmatic focus target rather than
         nowhere. */
      tabIndex={-1}
      className={cn(
        "@container/pane flex min-h-0 min-w-0 flex-1 flex-col bg-background focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-focus-ring",
        className,
      )}
      onPointerDown={(event) => {
        if ((event.target as HTMLElement).closest("button, input, textarea, select, a, [role='tab']")) return
        onFocus?.()
      }}
      onFocusCapture={(event) => {
        if ((event.target as HTMLElement).closest("[data-slot='pane-content'], [data-slot='pane-header']")) onFocus?.()
      }}
    >
      <div
        ref={headerRef}
        data-slot="pane-header"
        data-drag-handle=""
        draggable={Boolean(id)}
        onPointerDownCapture={() => onFocus?.()}
        onDragStart={(event) => {
          if (!id || (event.target as HTMLElement).closest("button, input, textarea, select, a, [role='menuitem']")) {
            event.preventDefault()
            return
          }
          const selection = window.getSelection()
          if (selection && !selection.isCollapsed) {
            event.preventDefault()
            return
          }
          if (startWorkspaceNativeDrag(event.currentTarget, getDragPayload?.() ?? { kind: "pane", paneId: id }, event.nativeEvent)) return
          event.dataTransfer.setData("application/x-tavi-pane", id)
          event.dataTransfer.effectAllowed = "move"
        }}
        className={cn(
          "flex h-8 shrink-0 cursor-grab items-center gap-2 border-b px-2 active:cursor-grabbing @max-[180px]/pane:gap-1 @max-[180px]/pane:px-1",
          active ? "border-border bg-muted" : "border-transparent bg-transparent",
        )}
      >
        <div data-slot="pane-drag-handle" aria-hidden="true" className="grid size-5 shrink-0 place-items-center text-muted-foreground hover:text-foreground">
          <GripVerticalIcon className="size-3.5" aria-hidden="true" />
        </div>
        {tabStrip?.strip ? tabStrip.strip : (
          <div className="flex min-w-0 flex-1 items-center gap-2">
            {Icon ? <Icon className={cn("size-4 shrink-0", active ? "text-foreground" : "text-muted-foreground")} /> : null}
            <span
              id={id ? `workspace-pane-title-${id}` : undefined}
              tabIndex={id ? -1 : undefined}
              className={cn(
                "truncate text-sm focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-foreground/60",
                active ? "text-foreground" : "text-muted-foreground",
              )}
            >
              {title}
            </span>
            {context ? (
              <span className="shrink-0 truncate text-xs text-muted-foreground/70">
                {context}
              </span>
            ) : null}
          </div>
        )}
        <div className="flex shrink-0 cursor-default items-center gap-0.5">
          {maximized && onMaximize ? (
            <TooltipIconButton tooltip="Restore pane" size="icon-xs" onClick={onMaximize}>
              <Minimize2Icon />
            </TooltipIconButton>
          ) : null}
          {showViewActions ? <ViewsPicker className="flex items-center gap-0.5" paneId={id} /> : null}
          {showPopOut ? <TooltipIconButton tooltip="Pop out into its own window" size="icon-xs" onClick={onPopOut}><PictureInPicture2Icon /></TooltipIconButton> : null}
          <PaneMenu
            onSplit={onSplit}
            onFocus={onFocus}
            onDockBack={onDockBack}
            onClose={onClose}
            onMaximize={onMaximize}
            maximized={maximized}
            onPopOut={onPopOut}
            popOutAvailable={popOutAvailable}
            popOutInMenu={!showPopOut}
            moveTargets={moveTargets}
            onMoveTo={onMoveTo}
          />
          {onDockBack ? (
            <TooltipIconButton tooltip="Dock back to workspace" size="icon-xs" onClick={onDockBack}>
              <ArrowDownToLineIcon />
            </TooltipIconButton>
          ) : null}
          {onClose ? (
            <TooltipIconButton
              tooltip="Close"
              size="icon-xs"
              onClick={onClose}
            >
              <XIcon />
            </TooltipIconButton>
          ) : null}
        </div>
      </div>
      <div
        data-slot="pane-content"
        role={tabStrip ? "tabpanel" : undefined}
        id={tabStrip?.panelId}
        aria-labelledby={tabStrip?.labelledBy}
        aria-label={tabStrip?.label}
        className={cn("flex min-h-0 flex-1 flex-col overflow-hidden", !active && "text-muted-foreground")}
      >
        {children}
      </div>
    </div>
  )
}

/**
 * The pane's own menu.
 *
 * Only the actions that this pane and this workspace can actually do. An
 * action that cannot work is left out rather than drawn as though it could,
 * and right-click is never the only way to reach one of them: the same
 * actions are on the pane's header.
 */
function PaneMenu({
  onSplit,
  onFocus,
  onDockBack,
  onClose,
  onMaximize,
  maximized,
  onPopOut,
  popOutAvailable,
  popOutInMenu,
  moveTargets,
  onMoveTo,
}: {
  onSplit?: (edge: DockEdge) => void
  onFocus?: () => void
  onDockBack?: () => void
  onClose?: () => void
  onMaximize?: () => void
  maximized?: boolean
  onPopOut?: () => void
  popOutAvailable?: boolean
  popOutInMenu: boolean
  moveTargets: Array<{ id: string; title: string }>
  onMoveTo?: (targetId: string) => void
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <Button
            variant="ghost"
            size="icon-xs"
            className="size-6"
            aria-label="Pane menu"
          />
        }
      >
      <ChevronDownIcon />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <PaneMenuItems onSplit={onSplit} onFocus={onFocus} onDockBack={onDockBack} onClose={onClose} onMaximize={onMaximize} maximized={maximized} onPopOut={onPopOut} popOutAvailable={popOutAvailable} popOutInMenu={popOutInMenu} moveTargets={moveTargets} onMoveTo={onMoveTo} />
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

function PaneMenuItems({ onSplit, onFocus, onDockBack, onClose, onMaximize, maximized, onPopOut, popOutAvailable, popOutInMenu, moveTargets, onMoveTo }: {
  onSplit?: (edge: DockEdge) => void
  onFocus?: () => void
  onDockBack?: () => void
  onClose?: () => void
  onMaximize?: () => void
  maximized?: boolean
  onPopOut?: () => void
  popOutAvailable?: boolean
  popOutInMenu: boolean
  moveTargets: Array<{ id: string; title: string }>
  onMoveTo?: (targetId: string) => void
}) {
  const apple = useIsApple()
  return <>
        {onFocus ? (
          <>
            <DropdownMenuItem onClick={onFocus}>
              Focus pane
            </DropdownMenuItem>
            <DropdownMenuSeparator />
          </>
        ) : null}
        {onMaximize ? <DropdownMenuItem onClick={onMaximize}>{maximized ? "Restore" : "Maximize"}</DropdownMenuItem> : null}
        {popOutInMenu && (onPopOut || popOutAvailable === false) ? <DropdownMenuItem disabled={!popOutAvailable} onClick={onPopOut}>{popOutAvailable ? "Pop out" : "Pop out unavailable"}</DropdownMenuItem> : null}
        {moveTargets.length > 0 && onMoveTo ? (
          <DropdownMenuSub>
            <DropdownMenuSubTrigger>
              Move into pane
            </DropdownMenuSubTrigger>
            <DropdownMenuSubContent>
              {moveTargets.map((target) => (
                <DropdownMenuItem key={target.id} onClick={() => onMoveTo(target.id)}>
                  {target.title}
                </DropdownMenuItem>
              ))}
            </DropdownMenuSubContent>
          </DropdownMenuSub>
        ) : null}
        {onSplit ? (
          <>
            <DropdownMenuLabel>Split view</DropdownMenuLabel>
            <DropdownMenuItem onClick={() => onSplit("left")}>Left</DropdownMenuItem>
            <DropdownMenuItem onClick={() => onSplit("right")}>Right</DropdownMenuItem>
            <DropdownMenuItem onClick={() => onSplit("top")}>Above</DropdownMenuItem>
            <DropdownMenuItem onClick={() => onSplit("bottom")}>Below</DropdownMenuItem>
            <DropdownMenuSeparator />
          </>
        ) : null}
        {onDockBack ? (
          <DropdownMenuItem onClick={onDockBack}>
            Dock back to workspace
          </DropdownMenuItem>
        ) : null}
        {onClose ? (
          <DropdownMenuItem variant="destructive" onClick={onClose}>
            Close pane
            <DropdownMenuShortcut>{formatHotkey(WORKSPACE_SHORTCUTS.closePane, apple)}</DropdownMenuShortcut>
          </DropdownMenuItem>
        ) : null}
  </>
}

/**
 * The pane's title, from the instance or from its type.
 *
 * An instance's own title is the reader's word for it, and it wins. Failing
 * that, the type's own name is used, and the type is the only thing that
 * knows it.
 */
export const paneTitle = (pane: PaneInstance, fallback: string): string =>
  pane.title ?? fallback
