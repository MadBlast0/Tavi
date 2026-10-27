"use client"

import * as React from "react"
import { EllipsisVerticalIcon } from "lucide-react"

import { Button } from "@/components/button"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuShortcut, DropdownMenuTrigger } from "@/components/dropdown-menu"
import { TooltipIconButton } from "@/components/tooltip-icon-button"
import { formatHotkey, useIsApple } from "@/lib/hotkey"
import { PANE_TYPES } from "./pane-types"
import { PANE_REGISTRY } from "./pane-registry"
import { WORKSPACE_SHORTCUTS } from "./workspace-shortcuts"
import { MAX_VISIBLE_PANES, addPane, useWorkspace, type PaneInstanceId } from "@/lib/workspace-state"

/** Claude-style compact view launcher with common tools one click away. */
export function ViewsPicker({ paneId, className }: { paneId?: PaneInstanceId; className?: string }) {
  const [narrow, setNarrow] = React.useState(false)
  const narrowRef = React.useRef(false)
  const rootRef = React.useRef<HTMLDivElement>(null)
  const { panes } = useWorkspace()
  const apple = useIsApple()
  const canAdd = panes.length < MAX_VISIBLE_PANES
  const quick = ["terminal", "diff", "browser", "file-explorer"]

  React.useEffect(() => {
    const pane = rootRef.current?.closest<HTMLElement>('[data-slot="pane"]')
    if (!pane) return
    const measure = () => {
      const next = pane.getBoundingClientRect().width < 280
      if (next === narrowRef.current) return
      narrowRef.current = next
      setNarrow(next)
    }
    measure()
    const observer = new ResizeObserver(measure)
    observer.observe(pane)
    return () => observer.disconnect()
  }, [])

  const add = (id: string) => {
    const duplicate = PANE_REGISTRY.get(id)?.allowDuplicate === false && panes.some((pane) => pane.type === id)
    if (!canAdd || duplicate) return
    addPane(id, { anchorPaneId: paneId })
  }
  const viewLabel = (id: string) => id === "file-explorer" ? "Files" : PANE_TYPES.find((type) => type.id === id)?.label ?? id
  /* Only the three adopted view shortcuts have a binding to print. The rest
     of the menu is pointer/Enter only, so it stays unadorned. */
  const shortcutFor = (id: string): string | undefined =>
    id === "terminal" ? WORKSPACE_SHORTCUTS.toggleTerminal
    : id === "browser" ? WORKSPACE_SHORTCUTS.toggleBrowser
    : id === "diff" ? WORKSPACE_SHORTCUTS.toggleDiff
    : undefined

  const menuViews = PANE_TYPES.filter((type) => type.id !== "chat" && type.id !== "code-session" && (narrow || !quick.includes(type.id)))
  return <div ref={rootRef} className={className}>
    <div className="flex items-center gap-0.5 @max-[280px]/pane:hidden">
      {quick.map((id) => {
        const type = PANE_TYPES.find((item) => item.id === id)!
        const duplicate = PANE_REGISTRY.get(id)?.allowDuplicate === false && panes.some((pane) => pane.type === id)
        const label = viewLabel(id)
        return <TooltipIconButton key={id} tooltip={label} size="icon-xs" disabled={!canAdd || duplicate} onClick={() => add(id)}><type.icon /></TooltipIconButton>
      })}
    </div>
    <DropdownMenu>
      <DropdownMenuTrigger render={<Button variant="ghost" size="icon-xs" className="size-6" aria-label="More views" title="More views" />}><EllipsisVerticalIcon /></DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-48">
        {menuViews.map((type) => {
          const duplicate = PANE_REGISTRY.get(type.id)?.allowDuplicate === false && panes.some((pane) => pane.type === type.id)
          const shortcut = shortcutFor(type.id)
          return <DropdownMenuItem key={type.id} disabled={!canAdd || duplicate} onClick={() => add(type.id)}><type.icon /><span>{viewLabel(type.id)}</span>{shortcut ? <DropdownMenuShortcut>{formatHotkey(shortcut, apple)}</DropdownMenuShortcut> : null}</DropdownMenuItem>
        })}
        {!canAdd ? <DropdownMenuItem disabled>Close a view to make room</DropdownMenuItem> : null}
      </DropdownMenuContent>
    </DropdownMenu>
  </div>
}
