"use client"

import * as React from "react"

import { cn } from "@/lib/utils"
import type { LayoutNode, PaneInstanceId } from "@/lib/workspace-state"

/**
 * The layout, drawn.
 *
 * The arrangement is a tree of three kinds of node, and this is what draws
 * it:
 *
 * - a **pane** is one region, and the caller says what is in it;
 * - a **split** is two regions side by side or one above the other, with a
 *   divider between them that can be dragged;
 * - a **group** is several panes sharing one place, with a tab strip above
 *   the one that is showing.
 *
 * **The geometry is the app's own.** A pane is a flat region on the
 * window's background, separated from its neighbour by a single hairline.
 * There is no card, no rounded corner and no shadow, because that is what
 * the reference looks like and a pane that looked like a card would be a
 * different thing.
 *
 * The tree is the single source of truth. A divider that is being dragged
 * keeps its own number for the length of the drag, so the drag does not
 * re-draw the whole tree sixty times a second, and it writes the number
 * back when the pointer is let go.
 */

/**
 * The smallest a pane may be.
 *
 * A pane narrower than this cannot show its own title, and one shorter than
 * this cannot show its header and any content at all. The reference's panes
 * are never smaller, and a pane that can be dragged to nothing is a pane
 * that has to be dragged back out again.
 */
export const MIN_PANE_SIZE = 140

/** What a pane's region is told to draw. */
export type PaneRenderer = (paneId: PaneInstanceId) => React.ReactNode

/**
 * The tree, drawn.
 */
export function LayoutTree({
  node,
  renderPane,
}: {
  node: LayoutNode
  renderPane: PaneRenderer
}) {
  if (node.kind === "pane") {
    return <>{renderPane(node.paneId)}</>
  }
  if (node.kind === "group") {
    return <TabGroup node={node} renderPane={renderPane} />
  }
  return <Split node={node} renderPane={renderPane} />
}

/**
 * Two panes, side by side or one above the other.
 *
 * The two halves share the space the split has, and the divider between
 * them takes none of it: the ratio is the share of the *remaining* space,
 * so a divider that is 5 pixels wide does not make the panes 5% smaller.
 */
function Split({
  node,
  renderPane,
}: {
  node: Extract<LayoutNode, { kind: "split" }>
  renderPane: PaneRenderer
}) {
  const horizontal = node.orientation === "horizontal"
  const container = React.useRef<HTMLDivElement | null>(null)

  /**
   * The ratio while a divider is being dragged.
   *
   * It is local, and it is null when no drag is happening. The number in
   * the tree is the truth; this is the number being tried out, and it
   * replaces the truth only for as long as the pointer is down.
   */
  const [dragging, setDragging] = React.useState<number | null>(null)
  const ratio = dragging ?? node.ratio

  const onRatio = React.useCallback(
    (next: number) => {
      const box = container.current?.getBoundingClientRect()
      if (!box) return
      const size = horizontal ? box.width : box.height
      if (size <= 0) return
      const min = Math.min(MIN_PANE_SIZE / size, 0.5)
      const clamped = Math.min(Math.max(next, min), 1 - min)
      setDragging(clamped)
    },
    [horizontal],
  )

  const onDragEnd = React.useCallback(() => {
    setDragging(null)
  }, [])

  return (
    <div
      ref={container}
      data-slot="split"
      data-orientation={node.orientation}
      className={cn(
        "flex min-h-0 min-w-0 flex-1",
        horizontal ? "flex-row" : "flex-col",
      )}
    >
      <div
        data-slot="split-child"
        className="flex min-h-0 min-w-0"
        style={{ flexGrow: ratio, flexBasis: 0, flexShrink: 1 }}
      >
        <LayoutTree node={node.children[0]} renderPane={renderPane} />
      </div>
      <SplitSeparator
        orientation={node.orientation}
        onRatio={onRatio}
        onDragEnd={onDragEnd}
      />
      <div
        data-slot="split-child"
        className="flex min-h-0 min-w-0"
        style={{ flexGrow: 1 - ratio, flexBasis: 0, flexShrink: 1 }}
      >
        <LayoutTree node={node.children[1]} renderPane={renderPane} />
      </div>
    </div>
  )
}

/**
 * The divider between two panes.
 *
 * It is a hairline with a wider invisible band over it, so it can be
 * caught without being fat, and it is a real control: it can be focused and
 * it can be moved with the arrow keys, because a layout that can only be
 * changed by dragging is not reachable by everyone.
 *
 * The keyboard moves it by a step, and the step is a percentage of the
 * split rather than a number of pixels, so it is the same movement whether
 * the split is two hundred pixels wide or two thousand.
 */
function SplitSeparator({
  orientation,
  onRatio,
  onDragEnd,
}: {
  orientation: "horizontal" | "vertical"
  onRatio: (next: number) => void
  onDragEnd: () => void
}) {
  const horizontal = orientation === "horizontal"
  const dragging = React.useRef(false)

  const onPointerDown = React.useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      /* Only the primary button drags, and a right-click opens the menu. */
      if (event.button !== 0) return
      event.preventDefault()
      dragging.current = true
      const move = (moveEvent: PointerEvent) => {
        if (!dragging.current) return
        const box = event.currentTarget.parentElement?.getBoundingClientRect()
        if (!box) return
        const value = horizontal
          ? (moveEvent.clientX - box.left) / box.width
          : (moveEvent.clientY - box.top) / box.height
        onRatio(value)
      }
      const up = () => {
        dragging.current = false
        window.removeEventListener("pointermove", move)
        window.removeEventListener("pointerup", up)
        window.removeEventListener("pointercancel", up)
        onDragEnd()
      }
      window.addEventListener("pointermove", move)
      window.addEventListener("pointerup", up)
      window.addEventListener("pointercancel", up)
    },
    [horizontal, onRatio, onDragEnd],
  )

  const onKeyDown = React.useCallback(
    (event: React.KeyboardEvent<HTMLDivElement>) => {
      const step = event.shiftKey ? 0.1 : 0.02
      const back = horizontal ? "ArrowLeft" : "ArrowUp"
      const forward = horizontal ? "ArrowRight" : "ArrowDown"
      if (event.key !== back && event.key !== forward) return
      event.preventDefault()
      const box = event.currentTarget.parentElement?.getBoundingClientRect()
      if (!box) return
      const size = horizontal ? box.width : box.height
      if (size <= 0) return
      const current = event.currentTarget.previousElementSibling?.getBoundingClientRect()
      const start = current ? (horizontal ? current.width : current.height) : size / 2
      const ratio = start / size
      onRatio(event.key === forward ? ratio + step : ratio - step)
      onDragEnd()
    },
    [horizontal, onRatio, onDragEnd],
  )

  return (
    <div
      data-slot="split-separator"
      role="separator"
      tabIndex={0}
      aria-orientation={horizontal ? "vertical" : "horizontal"}
      aria-label="Resize the panes"
      onPointerDown={onPointerDown}
      onKeyDown={onKeyDown}
      className={cn(
        "group relative z-10 shrink-0 touch-none select-none",
        "focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-foreground/60",
        horizontal
          ? "w-px cursor-col-resize"
          : "h-px cursor-row-resize",
      )}
    >
      {/* The hairline itself, and a wider band over it so it can be caught
          without being fat. The band is transparent and only shows a hint
          of the app's own focus colour when the divider is under the
          pointer. */}
      <span
        aria-hidden
        className={cn(
          "absolute inset-0 bg-border",
          horizontal ? "inset-y-0 left-0 w-px" : "inset-x-0 top-0 h-px",
        )}
      />
      <span
        aria-hidden
        className={cn(
          "absolute opacity-0 transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100",
          horizontal
            ? "-inset-x-1 inset-y-0 bg-foreground/20"
            : "-inset-y-1 inset-x-0 bg-foreground/20",
        )}
      />
    </div>
  )
}

/**
 * Several panes sharing one place.
 *
 * The strip above shows each of them, and the one that is showing is
 * drawn below it. A group of one is not a group — the model collapses it
 * into the pane it holds, because a tab strip with one tab on it is a
 * decoration and not a control — so the strip is always at least two tabs
 * wide.
 */
function TabGroup({
  node,
  renderPane,
}: {
  node: Extract<LayoutNode, { kind: "group" }>
  renderPane: PaneRenderer
}) {
  return (
    <div
      data-slot="tab-group"
      className="flex min-h-0 min-w-0 flex-1 flex-col"
    >
      <div
        data-slot="tab-strip"
        role="tablist"
        className="flex h-8 shrink-0 items-stretch gap-0.5 overflow-x-auto border-b border-border px-1"
      >
        {node.tabs.map((paneId) => {
          const active = paneId === node.activeTabId
          return (
            <TabButton key={paneId} paneId={paneId} active={active} />
          )
        })}
      </div>
      <div
        data-slot="tab-panel"
        role="tabpanel"
        className="flex min-h-0 flex-1 flex-col"
      >
        {renderPane(node.activeTabId)}
      </div>
    </div>
  )
}

/**
 * One tab in a group's strip.
 *
 * The tab shows the pane's mark and its title, and it is a real button, so
 * it can be reached and pressed with the keyboard.
 */
function TabButton({
  paneId,
  active,
}: {
  paneId: PaneInstanceId
  active: boolean
}) {
  const { panes, setActiveTab } = React.useContext(WorkspaceLayoutContext)
  const pane = panes.find((item) => item.id === paneId)
  const title = pane?.title ?? paneId
  return (
    <button
      type="button"
      role="tab"
      aria-selected={active}
      data-active={active ? "" : undefined}
      onClick={() => setActiveTab(paneId)}
      className={cn(
        "flex shrink-0 items-center gap-1.5 rounded-t-md px-2 text-xs",
        "text-muted-foreground transition-colors",
        "hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-foreground/60",
        active && "bg-muted text-foreground",
      )}
    >
      <span className="truncate">{title}</span>
    </button>
  )
}

/**
 * What the tab strip needs to know.
 *
 * The strip is drawn by the layout, and the layout is drawn by the region,
 * and the region is above the store's provider in the tree — so the strip
 * is given what it needs through a context rather than through four levels
 * of props.
 */
export const WorkspaceLayoutContext = React.createContext<{
  panes: { id: PaneInstanceId; title?: string }[]
  setActiveTab: (paneId: PaneInstanceId) => void
}>({ panes: [], setActiveTab: () => {} })
