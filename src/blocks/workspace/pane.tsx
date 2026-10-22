"use client"

import * as React from "react"
import {
  ChevronDownIcon,
  PictureInPicture2Icon,
  XIcon,
} from "lucide-react"

import { Button } from "@/components/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/dropdown-menu"
import { TooltipIconButton } from "@/components/tooltip-icon-button"
import { cn } from "@/lib/utils"
import type { DockEdge, PaneInstance } from "@/lib/workspace-state"

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
 * - a **header strip**, a fixed height, with the pane's mark and title on
 *   the left and the pane's three controls on the right;
 * - a **content area** that takes the rest of the pane and scrolls on its
 *   own, so a long conversation scrolls inside its pane and the window does
 *   not move;
 * - the **content itself**, which the caller supplies.
 *
 * The header's three controls are the same three in every pane, which is
 * what the reference does: pop the pane out into its own window, a chevron
 * that opens the pane's menu, and close. They are icon-only, so each one
 * carries a tooltip and an accessible name.
 */
export function Pane({
  title,
  icon: Icon,
  active,
  children,
  className,
  onClose,
  onSplit,
  onFocus,
  onPopOut,
  popOutAvailable,
}: {
  /** The pane's title: its own, or the type's default. */
  title: string
  /** The mark that names the pane. */
  icon: React.ComponentType<{ className?: string }>
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
  /** Pops the pane out into its own window. */
  onPopOut?: () => void
  /** Whether the pane can be popped out yet. */
  popOutAvailable?: boolean
}) {
  return (
    <div
      data-slot="pane"
      data-active={active ? "" : undefined}
      className={cn(
        "flex min-h-0 min-w-0 flex-1 flex-col bg-background",
        className,
      )}
      onPointerDown={onFocus}
    >
      <div
        data-slot="pane-header"
        className="flex h-8 shrink-0 items-center gap-2 px-2"
      >
        {Icon ? <Icon className="size-4 shrink-0 text-muted-foreground" /> : null}
        <span
          className={cn(
            "truncate text-sm",
            active ? "text-foreground" : "text-muted-foreground",
          )}
        >
          {title}
        </span>
        <div className="ms-auto flex shrink-0 items-center gap-0.5">
          <TooltipIconButton
            tooltip={
              popOutAvailable
                ? "Pop out into its own window"
                : "Pop out — not available yet"
            }
            size="icon-xs"
            disabled={!popOutAvailable}
            onClick={onPopOut}
          >
            <PictureInPicture2Icon />
          </TooltipIconButton>
          <PaneMenu onSplit={onSplit} onClose={onClose} />
          <TooltipIconButton
            tooltip="Close"
            size="icon-xs"
            onClick={onClose}
          >
            <XIcon />
          </TooltipIconButton>
        </div>
      </div>
      <div
        data-slot="pane-content"
        className="flex min-h-0 flex-1 flex-col overflow-hidden"
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
  onClose,
}: {
  onSplit?: (edge: DockEdge) => void
  onClose?: () => void
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
        <DropdownMenuLabel>Split</DropdownMenuLabel>
        <DropdownMenuItem onClick={() => onSplit?.("left")}>
          Split left
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => onSplit?.("right")}>
          Split right
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => onSplit?.("top")}>
          Split up
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => onSplit?.("bottom")}>
          Split down
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem variant="destructive" onClick={onClose}>
          Close pane
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
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
