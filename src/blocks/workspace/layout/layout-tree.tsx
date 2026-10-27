"use client"

import * as React from "react"
import { XIcon } from "lucide-react"

import { cn } from "@/lib/utils"
import { updateLayout, type LayoutNode, type PaneInstanceId } from "@/lib/workspace-state"
import { dockPane, reorderTab } from "@/lib/workspace-state"
import { startWorkspaceNativeDrag } from "@/lib/desktop"
import { PaneTabStripContext, type PaneTabStrip } from "./tab-strip-context"

/**
 * The layout, drawn.
 *
 * The arrangement is a tree of three kinds of node, and this is what draws
 * it:
 *
 * - a **pane** is one region, and the caller says what is in it;
 * - a **split** is two regions side by side or one above the other, with a
 *   divider between them that can be dragged;
 * - a **group** is several panes sharing one place, with a tab strip in the
 *   header of the one that is showing.
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
  path = "root",
  maximizedPaneId,
}: {
  node: LayoutNode
  renderPane: PaneRenderer
  path?: string
  maximizedPaneId?: string
}) {
  if (node.kind === "pane") {
    return <>{renderPane(node.paneId)}</>
  }
  if (node.kind === "group") {
    return <TabGroup node={node} renderPane={renderPane} maximizedPaneId={maximizedPaneId} />
  }
  return <Split node={node} renderPane={renderPane} path={path} maximizedPaneId={maximizedPaneId} />
}

function containsPane(node: LayoutNode, paneId: string): boolean {
  if (node.kind === "pane") return node.paneId === paneId
  if (node.kind === "group") return node.tabs.includes(paneId)
  return containsPane(node.children[0], paneId) || containsPane(node.children[1], paneId)
}

function firstPaneId(node: LayoutNode): string {
  if (node.kind === "pane") return node.paneId
  if (node.kind === "group") return node.activeTabId
  return firstPaneId(node.children[0])
}

function replaceSplitAtPath(layout: LayoutNode | null, path: string, ratio: number): LayoutNode | null {
  if (!layout) return null
  if (path === "root") return layout.kind === "split" ? { ...layout, ratio } : layout
  const segments = path.split(".").slice(1).map(Number)
  const update = (node: LayoutNode, depth: number): LayoutNode => {
    if (depth === segments.length) return node.kind === "split" ? { ...node, ratio } : node
    if (node.kind !== "split") return node
    const index = segments[depth]
    const children = [...node.children] as [LayoutNode, LayoutNode]
    children[index] = update(children[index], depth + 1)
    return { ...node, children }
  }
  return update(layout, 0)
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
  path,
  maximizedPaneId,
}: {
  node: Extract<LayoutNode, { kind: "split" }>
  renderPane: PaneRenderer
  path: string
  maximizedPaneId?: string
}) {
  const horizontal = node.orientation === "horizontal"
  const { activePaneId, panes } = React.useContext(WorkspaceLayoutContext)
  const container = React.useRef<HTMLDivElement | null>(null)
  const [containerSize, setContainerSize] = React.useState(0)
  React.useEffect(() => {
    const element = container.current
    if (!element) return
    const measure = () => setContainerSize(horizontal ? element.clientWidth : element.clientHeight)
    measure()
    const observer = new ResizeObserver(measure)
    observer.observe(element)
    return () => observer.disconnect()
  }, [horizontal])
  const minimum = Math.min(MIN_PANE_SIZE / Math.max(containerSize, MIN_PANE_SIZE * 2), 0.5)

  /**
   * The ratio the split is showing.
   *
   * The number in the tree is the truth. While a divider is being dragged
   * this copy follows the pointer, and only the pointer-up writes it back:
   * publishing the whole workspace on every move made a drag feel heavy and
   * rewrote the saved layout on every frame. The ref is the same number
   * without waiting for a render, so the pointer-up commits exactly what the
   * reader last saw.
   */
  const [ratio, setRatio] = React.useState<number>(node.ratio)
  const ratioRef = React.useRef(node.ratio)
  React.useEffect(() => {
    ratioRef.current = node.ratio
    setRatio(node.ratio)
  }, [node.ratio])
  const firstContainsMaximized = maximizedPaneId ? containsPane(node.children[0], maximizedPaneId) : false
  const secondContainsMaximized = maximizedPaneId ? containsPane(node.children[1], maximizedPaneId) : false
  const activeNeighbor = activePaneId !== null && (containsPane(node.children[0], activePaneId) || containsPane(node.children[1], activePaneId))
  const primaryPaneId = firstPaneId(node.children[0])
  const primaryPaneTitle = panes.find((pane) => pane.id === primaryPaneId)?.title ?? "primary pane"
  const firstGrow = maximizedPaneId ? Number(firstContainsMaximized) : ratio
  const secondGrow = maximizedPaneId ? Number(secondContainsMaximized) : 1 - ratio

  const onRatio = React.useCallback(
    (next: number) => {
      const box = container.current?.getBoundingClientRect()
      if (!box) return
      const size = horizontal ? box.width : box.height
      if (size <= 0) return
      const min = Math.min(MIN_PANE_SIZE / size, 0.5)
      const clamped = Math.min(Math.max(next, min), 1 - min)
      ratioRef.current = clamped
      setRatio(clamped)
    },
    [horizontal],
  )

  /**
   * Commits the ratio the reader settled on.
   *
   * One store update per gesture, not one per pointer move. A gesture that
   * ends where it started — or a pointer-up after a cancelled drag — writes
   * nothing, so the layout and its saved copy stay untouched.
   */
  const onDragEnd = React.useCallback(() => {
    const next = ratioRef.current
    if (next === node.ratio) return
    if (!updateLayout((current) => replaceSplitAtPath(current, path, next))) {
      ratioRef.current = node.ratio
      setRatio(node.ratio)
    }
  }, [node.ratio, path])

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
        id={`${path}-primary-pane`}
        data-slot="split-child"
        className={cn("flex min-h-0 min-w-0", maximizedPaneId && !firstContainsMaximized && "hidden")}
        style={{ flexGrow: firstGrow, flexBasis: 0, flexShrink: 1 }}
      >
        <LayoutTree node={node.children[0]} renderPane={renderPane} path={`${path}.0`} maximizedPaneId={maximizedPaneId} />
      </div>
      {!maximizedPaneId ? <SplitSeparator
        orientation={node.orientation}
        controls={`${path}-primary-pane`}
        primaryPaneTitle={primaryPaneTitle}
        minimum={minimum}
        ratio={ratio}
        activeNeighbor={activeNeighbor}
        onRatio={onRatio}
        onDragEnd={onDragEnd}
      /> : null}
      <div
        data-slot="split-child"
        className={cn("flex min-h-0 min-w-0", maximizedPaneId && !secondContainsMaximized && "hidden")}
        style={{ flexGrow: secondGrow, flexBasis: 0, flexShrink: 1 }}
      >
        <LayoutTree node={node.children[1]} renderPane={renderPane} path={`${path}.1`} maximizedPaneId={maximizedPaneId} />
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
  controls,
  primaryPaneTitle,
  ratio,
  activeNeighbor,
  minimum,
  onRatio,
  onDragEnd,
}: {
  orientation: "horizontal" | "vertical"
  controls: string
  primaryPaneTitle: string
  ratio: number
  activeNeighbor: boolean
  minimum: number
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
      const element = event.currentTarget
      const box = element.parentElement?.getBoundingClientRect()
      if (!box) return
      const initialRatio = ratio
      const move = (moveEvent: PointerEvent) => {
        if (!dragging.current) return
        const value = horizontal
          ? (moveEvent.clientX - box.left) / box.width
          : (moveEvent.clientY - box.top) / box.height
        onRatio(value)
      }
      const cleanup = () => {
        dragging.current = false
        window.removeEventListener("pointermove", move)
        window.removeEventListener("pointerup", finish)
        window.removeEventListener("pointercancel", cancel)
        window.removeEventListener("keydown", keydown)
      }
      const finish = () => {
        cleanup()
        onDragEnd()
      }
      const cancel = () => {
        cleanup()
        onRatio(initialRatio)
      }
      const keydown = (keyEvent: KeyboardEvent) => {
        if (keyEvent.key === "Escape") cancel()
      }
      window.addEventListener("pointermove", move)
      window.addEventListener("pointerup", finish)
      window.addEventListener("pointercancel", cancel)
      window.addEventListener("keydown", keydown)
    },
    [horizontal, onRatio, onDragEnd, ratio],
  )

  const onKeyDown = React.useCallback(
    (event: React.KeyboardEvent<HTMLDivElement>) => {
      if (event.key === "Home" || event.key === "End") {
        event.preventDefault()
        onRatio(event.key === "Home" ? minimum : 1 - minimum)
        onDragEnd()
        return
      }
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
    [horizontal, minimum, onRatio, onDragEnd],
  )

  const minimumPercent = Math.ceil(minimum * 100)
  const maximumPercent = Math.floor((1 - minimum) * 100)
  const currentPercent = Math.min(maximumPercent, Math.max(minimumPercent, Math.round(ratio * 100)))

  return (
    <div
      data-slot="split-separator"
      role="separator"
      tabIndex={0}
      aria-orientation={horizontal ? "vertical" : "horizontal"}
      aria-label={`Resize ${primaryPaneTitle}`}
      aria-controls={controls}
      aria-valuemin={minimumPercent}
      aria-valuemax={maximumPercent}
      aria-valuenow={currentPercent}
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
          cn("absolute inset-0", activeNeighbor ? "bg-foreground/60" : "bg-border"),
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
 * The strip names each of them in the header of the one that is showing,
 * so the group pays for one chrome band rather than a strip above a header.
 * A group of one is not a group — the model collapses it into the pane it
 * holds, because a tab strip with one tab on it is a decoration and not a
 * control — so the strip is always at least two tabs wide.
 */
function TabGroup({
  node,
  renderPane,
  maximizedPaneId,
}: {
  node: Extract<LayoutNode, { kind: "group" }>
  renderPane: PaneRenderer
  maximizedPaneId?: string
}) {
  /* The tab that is showing. It starts at the node's active tab and follows
     the reader's choice from there. */
  const active = maximizedPaneId && node.tabs.includes(maximizedPaneId) ? maximizedPaneId : node.activeTabId
  const { panes, setActiveTab, closePane } = React.useContext(WorkspaceLayoutContext)
  const panelId = `workspace-tabpanel-${node.groupId}`
  const activeTitle = panes.find((pane) => pane.id === active)?.title ?? active
  /* Closing goes through the workspace's handler, which puts focus on
     whichever visible pane survives. The strip does not need a second focus
     rule of its own. */
  const closeTab = (paneId: string) => closePane(paneId)

  /* The chrome the showing pane draws in its own header. The strip is not
     drawn as a second band above the pane, and it is not drawn at all when
     the group is maximized: the maximized pane shows its title instead. */
  const chrome: PaneTabStrip = {
    panelId,
    labelledBy: maximizedPaneId ? undefined : workspaceTabId(active),
    label: maximizedPaneId ? activeTitle : undefined,
    strip: maximizedPaneId ? null : (
      <div
        data-slot="tab-strip"
        role="tablist"
        aria-label={`Views for ${activeTitle}`}
        className="flex h-full min-w-0 flex-1 items-stretch overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
        onKeyDown={(event) => {
          if (!(["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key))) return
          const tabs = [...event.currentTarget.querySelectorAll<HTMLButtonElement>('[role="tab"]')]
          const focusedTab = event.target instanceof Element ? event.target.closest<HTMLButtonElement>('[role="tab"]') : null
          const index = focusedTab ? tabs.indexOf(focusedTab) : -1
          if (index < 0 || tabs.length < 1) return
          event.preventDefault()
          const rtl = getComputedStyle(event.currentTarget).direction === "rtl"
          const next = event.key === "Home" ? 0 : event.key === "End" ? tabs.length - 1 : event.key === "ArrowRight" ? (index + (rtl ? tabs.length - 1 : 1)) % tabs.length : (index + (rtl ? 1 : tabs.length - 1)) % tabs.length
          tabs[next]?.focus()
          setActiveTab(node.tabs[next])
        }}
      >
        {node.tabs.map((paneId) => {
          const isActive = paneId === active
          return (
            <div key={paneId} role="presentation" data-pane-drop-target={paneId} data-pane-drop-kind="tab" className="group/tab flex shrink-0 items-center border-e border-border/60 last:border-e-0 data-[native-drop-edge=center]:bg-primary/15 data-[native-drop-edge=center]:ring-1 data-[native-drop-edge=center]:ring-primary/50" onDragOver={(event) => {
              if (event.dataTransfer.types.includes("application/x-tavi-tab") || event.dataTransfer.types.includes("application/x-tavi-pane") || event.dataTransfer.types.includes("application/x-tavi-session")) event.preventDefault()
            }} onDrop={(event) => {
              const dragged = event.dataTransfer.getData("application/x-tavi-tab")
              if (dragged) {
                event.preventDefault()
                if (!reorderTab(dragged, paneId)) dockPane(dragged, paneId, "center")
                return
              }
              const pane = event.dataTransfer.getData("application/x-tavi-pane")
              if (pane) {
                event.preventDefault()
                if (node.tabs.includes(pane)) reorderTab(pane, paneId)
                else dockPane(pane, paneId, "center")
              }
            }}>
              <TabButton paneId={paneId} panelId={panelId} active={isActive} onClick={() => setActiveTab(paneId)} onClose={() => closeTab(paneId)} />
              <button type="button" tabIndex={isActive ? 0 : -1} className="me-0.5 grid size-5 shrink-0 place-items-center rounded-sm opacity-60 hover:bg-background hover:opacity-100 focus-visible:outline-2 focus-visible:outline-foreground/60" aria-label={`Close pane ${panes.find((pane) => pane.id === paneId)?.title ?? paneId}`} onClick={() => closeTab(paneId)}>
                <XIcon className="size-3" />
              </button>
            </div>
          )
        })}
      </div>
    ),
  }

  return (
    <PaneTabStripContext.Provider value={chrome}>
      <div
        data-slot="tab-group"
        className="flex min-h-0 min-w-0 flex-1 flex-col"
      >
        <div
          data-slot="tab-panel"
          className="flex min-h-0 flex-1 flex-col"
        >
          {renderPane(active)}
        </div>
      </div>
    </PaneTabStripContext.Provider>
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
  panelId,
  active,
  onClick,
  onClose,
}: {
  paneId: PaneInstanceId
  panelId: string
  active: boolean
  onClick: () => void
  onClose: () => void
}) {
  const { panes } = React.useContext(WorkspaceLayoutContext)
  const pane = panes.find((item) => item.id === paneId)
  const title = pane?.title ?? paneId
  return (
    <button
      type="button"
      role="tab"
      id={workspaceTabId(paneId)}
      aria-controls={panelId}
      aria-selected={active}
      tabIndex={active ? 0 : -1}
      data-active={active ? "" : undefined}
      draggable
      onDragStart={(event) => {
        /* The tab is drawn inside the pane's draggable header. Without this,
           the header would take the drag and the tab would never leave. */
        event.stopPropagation()
        if (startWorkspaceNativeDrag(event.currentTarget, { kind: "tab", paneId }, event.nativeEvent)) return
        event.dataTransfer.setData("application/x-tavi-tab", paneId)
        event.dataTransfer.effectAllowed = "move"
      }}
      onClick={onClick}
      onKeyDown={(event) => {
        if (event.key === "Delete") {
          event.preventDefault()
          onClose()
        }
      }}
      className={cn(
        "flex h-full shrink-0 items-center gap-1.5 px-2 text-xs",
        "text-muted-foreground transition-colors",
        "hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-foreground/60",
        "data-active:bg-background data-active:text-foreground",
      )}
    >
      <span className="truncate">{title}</span>
    </button>
  )
}

function workspaceTabId(paneId: string) {
  return `workspace-tab-${paneId}`
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
  activePaneId: PaneInstanceId | null
  setActiveTab: (paneId: PaneInstanceId) => void
  closePane: (paneId: PaneInstanceId) => void
}>({ panes: [], activePaneId: null, setActiveTab: () => {}, closePane: () => {} })
