"use client"

import * as React from "react"
import { CodeXmlIcon, MessageCircleIcon } from "lucide-react"
import { Button } from "@/components/button"
import { cn } from "@/lib/utils"
import { readStorage, writeStorage } from "@/lib/storage"
import { closePaneWindow, createPaneWindow, isDesktopApp, notifyWorkspaceDropAccepted, onPaneDockBack, onWorkspaceNativeDrag, onWorkspaceNativeDragOver, onWorkspaceNativeDrop, paneWindowExists, workspaceDropPoint, type WorkspaceNativeDragPayload } from "@/lib/desktop"
import {
  addPane,
  dockPane,
  removePane,
  getWorkspaceSnapshot,
  setActivePane,
  setActiveTab,
  setPaneContext,
  setPaneState,
  setPaneTitle,
  setPaneType,
  parsePersistedWorkspace,
  restoreWorkspace,
  serializeWorkspace,
  removePaneFromLayout,
  reorderTab,
  useWorkspace,
  visiblePaneIds,
} from "@/lib/workspace-state"
import type { LayoutNode, PaneInstance, PaneInstanceId, PaneLocalState } from "@/lib/workspace-state"
import { LayoutTree, WorkspaceLayoutContext } from "./layout/layout-tree"
import { PANE_REGISTRY, paneTitleFor } from "./pane-registry"
import { Pane } from "./pane"
import { PaneEmpty } from "./pane-states"
import { PANE_TYPES } from "./pane-types"
import { StoredThreadPane } from "./panes/stored-thread-pane"
import { isWorkspaceShortcutBlocked, nextPaneId as nextVisiblePaneId, paneForToggle, workspaceShortcutIntent } from "./workspace-shortcuts"
import { parsePaneLocalState, serializePaneLocalState } from "@/lib/pane-state-transfer"
import { isDockBackToOriginalPaneTarget } from "@/lib/pane-window-protocol"
import { conversation, loadConversation } from "@/lib/conversation"
import { findChat } from "@/lib/chats"
import { findSession } from "@/lib/sessions"
import { fromStoredTurns } from "@/lib/turns"

const EDGES = ["left", "right", "top", "bottom", "center"] as const

/** How long a floating workspace notice stays before it fades out. */
const NOTICE_TIMEOUT_MS = 6000

function renderPane(panes: PaneInstance[], id: PaneInstanceId, activeSessionId: string | null, onOpenSession: (id: string) => void, onSessionDrop: NonNullable<WorkspaceLayoutProps["onSessionDrop"]> | undefined, renderSession: WorkspaceLayoutProps["renderSession"], renderDraftSession: WorkspaceLayoutProps["renderDraftSession"], maximizedPaneId: string | null, activePaneId: string | null, toggleMaximize: (id: string) => void, poppedOut: boolean, onDockBack: (id: string) => void, onPopOut: (pane: PaneInstance) => void, onClosePane: (id: string) => void, paneState: Record<string, PaneLocalState>) {
  const pane = panes.find((item) => item.id === id)
  if (!pane) return null
  const registration = PANE_REGISTRY.get(pane.type)
  if (!registration) return null
  if (poppedOut) {
    const icon = PANE_TYPES.find((type) => type.id === pane.type)?.icon
    return icon ? <PaneDropTarget paneId={pane.id} onSessionDrop={onSessionDrop}><Pane id={pane.id} type={pane.type} title={paneTitleFor(pane.type, pane.title)} icon={icon} active={activePaneId === pane.id} onDockBack={() => onDockBack(pane.id)} onFocus={() => setActivePane(pane.id)} onMaximize={() => toggleMaximize(pane.id)} maximized={maximizedPaneId === pane.id}>
      <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-2 p-4 text-center"><p className="text-sm font-medium">This pane is open in its own window.</p><p className="max-w-sm text-xs text-muted-foreground">Its session continues in that window. Dock it back to return the pane here.</p><Button size="sm" variant="outline" onClick={() => onDockBack(pane.id)}>Dock pane back</Button></div>
    </Pane></PaneDropTarget> : null
  }
  const createdActions = {
    active: activePaneId === pane.id,
    onClose: () => onClosePane(pane.id),
    onFocus: () => {
      setActivePane(pane.id)
      const sessionId = pane.context?.sessionId
      if (sessionId && sessionId !== activeSessionId) onOpenSession(sessionId)
    },
    onMaximize: () => toggleMaximize(pane.id),
    maximized: maximizedPaneId === pane.id,
    moveTargets: panes.filter((candidate) => candidate.id !== pane.id).map((candidate) => ({ id: candidate.id, title: paneTitleFor(candidate.type, candidate.title) })),
    onMoveTo: (targetId: PaneInstanceId) => dockPane(pane.id, targetId, "center"),
    onPopOut: isDesktopApp() ? () => onPopOut(pane) : undefined,
    popOutAvailable: isDesktopApp(),
    getDragPayload: (): WorkspaceNativeDragPayload => ({
      kind: "pane",
      paneId: pane.id,
      paneState: serializePaneLocalState(paneState[pane.id] ?? {}),
      busy: Boolean(pane.context?.sessionId && ["submitted", "streaming"].includes(conversation(pane.context.sessionId)?.status ?? "idle")),
    }),
    onSplit: pane.type === "chat" || pane.type === "code-session" ? undefined : (edge: "left" | "right" | "top" | "bottom" | "center") => {
      const next = addPane(pane.type, { context: pane.context })
      if (next) dockPane(next.id, pane.id, edge)
    },
  }
  if (pane.type === "chat" || pane.type === "code-session") {
    /* Every chat/code pane is a session surface. A pane bound to a saved
       conversation gets its own embedded composer. A pane with no conversation
       is a draft: it gets its own pane-sized start surface and its own
       composer, never the root landing or the root conversation — those
       belong to the workspace region, and the region only shows them when it
       has no panes at all. */
    const side = pane.type === "chat" ? "chat" : "code"
    const sessionId = pane.context?.sessionId
    if (sessionId) {
      const embedded = renderSession?.(side, sessionId)
      const content = embedded
        ? <Pane id={pane.id} type={pane.type} title={paneTitleFor(pane.type, pane.title)} icon={PANE_TYPES.find((type) => type.id === pane.type)!.icon} active={createdActions.active} onClose={createdActions.onClose} onFocus={createdActions.onFocus} onSplit={createdActions.onSplit} onMaximize={createdActions.onMaximize} maximized={createdActions.maximized} onPopOut={createdActions.onPopOut} popOutAvailable={createdActions.popOutAvailable} moveTargets={createdActions.moveTargets} onMoveTo={createdActions.onMoveTo} showViewActions={pane.type === "code-session"} getDragPayload={createdActions.getDragPayload}>{embedded}</Pane>
        : <StoredThreadPane pane={pane} actions={createdActions} onOpen={onOpenSession} />
      return <PaneDropTarget paneId={pane.id} onSessionDrop={onSessionDrop}>{content}</PaneDropTarget>
    }
    const icon = PANE_TYPES.find((type) => type.id === pane.type)?.icon
    if (!icon) return null
    const draft = renderDraftSession?.(side, pane.id)
    return (
      <PaneDropTarget paneId={pane.id} onSessionDrop={onSessionDrop}>
      <Pane
        id={pane.id}
        type={pane.type}
        title={paneTitleFor(pane.type, pane.title)}
        icon={icon}
        context={undefined}
        active={createdActions.active}
        onClose={createdActions.onClose}
        onFocus={createdActions.onFocus}
        onSplit={createdActions.onSplit}
        onMaximize={createdActions.onMaximize}
        maximized={maximizedPaneId === pane.id}
        onPopOut={createdActions.onPopOut}
        popOutAvailable={createdActions.popOutAvailable}
        moveTargets={createdActions.moveTargets}
        onMoveTo={createdActions.onMoveTo}
        showViewActions={pane.type === "code-session"}
        getDragPayload={createdActions.getDragPayload}
      >
        {draft ?? (
          <PaneEmpty
            icon={pane.type === "chat" ? MessageCircleIcon : CodeXmlIcon}
            title={pane.type === "chat" ? "Start a chat" : "Start a session"}
            description="Open a conversation from the sidebar to connect it to this pane."
          />
        )}
      </Pane>
      </PaneDropTarget>
    )
  }
  return (
    <div
      key={pane.id}
      data-pane-drop-target={pane.id}
      data-pane-drop-kind="pane"
      className={cn(
        "relative flex min-h-0 min-w-0 flex-1",
        "before:pointer-events-none before:absolute before:inset-0 before:z-20 before:bg-primary/15 before:opacity-0 before:content-['']",
        "data-[drop-edge=left]:before:right-3/4 data-[drop-edge=right]:before:left-3/4",
        "data-[drop-edge=top]:before:bottom-3/4 data-[drop-edge=bottom]:before:top-3/4",
        "data-[drop-edge=center]:before:opacity-100",
        "data-[drop-edge=left]:before:opacity-100 data-[drop-edge=right]:before:opacity-100",
        "data-[drop-edge=top]:before:opacity-100 data-[drop-edge=bottom]:before:opacity-100",
      )}
      onDragOver={(event) => {
        if (event.dataTransfer.types.includes("application/x-tavi-pane") || event.dataTransfer.types.includes("application/x-tavi-tab") || event.dataTransfer.types.includes("application/x-tavi-session")) {
          event.preventDefault()
          const box = event.currentTarget.getBoundingClientRect()
          const x = (event.clientX - box.left) / box.width
          const y = (event.clientY - box.top) / box.height
          event.currentTarget.dataset.dropEdge = x < 0.2 ? "left" : x > 0.8 ? "right" : y < 0.2 ? "top" : y > 0.8 ? "bottom" : "center"
        }
      }}
      onDragLeave={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget as Node | null)) delete event.currentTarget.dataset.dropEdge
      }}
      onDrop={(event) => {
        const draggedId = event.dataTransfer.getData("application/x-tavi-pane") || event.dataTransfer.getData("application/x-tavi-tab")
        const sessionData = event.dataTransfer.getData("application/x-tavi-session")
        if (!draggedId && !sessionData) return
        event.preventDefault()
        delete event.currentTarget.dataset.dropEdge
        const box = event.currentTarget.getBoundingClientRect()
        const x = (event.clientX - box.left) / box.width
        const y = (event.clientY - box.top) / box.height
        const edge = x < 0.2 ? "left" : x > 0.8 ? "right" : y < 0.2 ? "top" : y > 0.8 ? "bottom" : "center"
        if (draggedId) dockPane(draggedId, pane.id, edge)
        if (sessionData) {
          try {
            const payload = JSON.parse(sessionData) as { id?: unknown; side?: unknown }
            if (typeof payload.id === "string" && (payload.side === "chat" || payload.side === "code")) {
              onSessionDrop?.(payload.side, payload.id, pane.id, edge)
            }
          } catch {
            // Malformed or external drag payloads are ignored.
          }
        }
      }}
    >
      {registration.render(pane.id, createdActions)}
    </div>
  )
}

function dropEdge(event: React.DragEvent<HTMLElement>): "left" | "right" | "top" | "bottom" | "center" {
  const box = event.currentTarget.getBoundingClientRect()
  const x = box.width > 0 ? (event.clientX - box.left) / box.width : 0.5
  const y = box.height > 0 ? (event.clientY - box.top) / box.height : 0.5
  return x < 0.2 ? "left" : x > 0.8 ? "right" : y < 0.2 ? "top" : y > 0.8 ? "bottom" : "center"
}

function nativeDropEdge(rect: DOMRect, x: number, y: number): "left" | "right" | "top" | "bottom" | "center" {
  const px = rect.width > 0 ? (x - rect.left) / rect.width : 0.5
  const py = rect.height > 0 ? (y - rect.top) / rect.height : 0.5
  return px < 0.2 ? "left" : px > 0.8 ? "right" : py < 0.2 ? "top" : py > 0.8 ? "bottom" : "center"
}

function PaneDropTarget({ paneId, onSessionDrop, children }: {
  paneId: PaneInstanceId
  onSessionDrop: NonNullable<WorkspaceLayoutProps["onSessionDrop"]> | undefined
  children: React.ReactNode
}) {
  return <div
    data-pane-drop-target={paneId}
    data-pane-drop-kind="pane"
    className={cn("relative flex min-h-0 min-w-0 flex-1", "before:pointer-events-none before:absolute before:inset-0 before:z-20 before:bg-primary/15 before:opacity-0 before:content-['']", "data-[drop-edge=left]:before:right-3/4 data-[drop-edge=right]:before:left-3/4", "data-[drop-edge=top]:before:bottom-3/4 data-[drop-edge=bottom]:before:top-3/4", "data-[drop-edge=center]:before:opacity-100 data-[drop-edge=left]:before:opacity-100 data-[drop-edge=right]:before:opacity-100 data-[drop-edge=top]:before:opacity-100 data-[drop-edge=bottom]:before:opacity-100")}
    onDragOver={(event) => {
      if (["application/x-tavi-pane", "application/x-tavi-tab", "application/x-tavi-session"].some((type) => event.dataTransfer.types.includes(type))) {
        event.preventDefault()
        event.currentTarget.dataset.dropEdge = dropEdge(event)
      }
    }}
    onDragLeave={(event) => { if (!event.currentTarget.contains(event.relatedTarget as Node | null)) delete event.currentTarget.dataset.dropEdge }}
    onDrop={(event) => {
      const draggedId = event.dataTransfer.getData("application/x-tavi-pane") || event.dataTransfer.getData("application/x-tavi-tab")
      const sessionData = event.dataTransfer.getData("application/x-tavi-session")
      if (!draggedId && !sessionData) return
      event.preventDefault()
      event.stopPropagation()
      delete event.currentTarget.dataset.dropEdge
      const edge = dropEdge(event)
      if (draggedId) dockPane(draggedId, paneId, edge)
      if (sessionData) {
        try {
          const payload = JSON.parse(sessionData) as { id?: unknown; side?: unknown }
          if (typeof payload.id === "string" && (payload.side === "chat" || payload.side === "code")) onSessionDrop?.(payload.side, payload.id, paneId, edge)
        } catch { /* Invalid drag payloads are ignored. */ }
      }
    }}
  >{children}</div>
}

type WorkspaceLayoutProps = {
  className?: string
  children?: React.ReactNode
  activeSessionId?: string | null
  onOpenSession?: (id: string) => void
  onSessionDrop?: (side: "chat" | "code", id: string, targetId: string, edge: "left" | "right" | "top" | "bottom" | "center") => boolean | void
  renderSession?: (side: "chat" | "code", id: string) => React.ReactNode
  /** The start surface of a chat/code pane that has no conversation yet. */
  renderDraftSession?: (side: "chat" | "code", paneId: string) => React.ReactNode
  disabled?: boolean
}

function splitAll(ids: string[], orientation: "horizontal" | "vertical"): LayoutNode | null {
  if (ids.length === 0) return null
  if (ids.length === 1) return { kind: "pane", paneId: ids[0] }
  const mid = Math.ceil(ids.length / 2)
  const first = splitAll(ids.slice(0, mid), orientation)
  const second = splitAll(ids.slice(mid), orientation)
  if (!first || !second) return first ?? second
  return { kind: "split", orientation, ratio: mid / ids.length, children: [first, second] }
}

/**
 * Puts keyboard focus on a pane that was just focused or opened.
 *
 * The store update and the DOM move happen in the same tick, so the target's
 * title or tab may not be rendered yet. The next frame is after React has
 * committed the new arrangement. A pane in a tab group has no title of its
 * own — its tab names it — and a pane with neither falls back to the labeled
 * region, which is why the pane frame is programmatically focusable.
 */
function focusPaneWhenRendered(paneId: PaneInstanceId): void {
  requestAnimationFrame(() => {
    const title = document.getElementById(`workspace-pane-title-${paneId}`)
    if (title) {
      title.focus()
      return
    }
    const tab = document.getElementById(`workspace-tab-${paneId}`)
    if (tab) {
      tab.focus()
      return
    }
    for (const pane of document.querySelectorAll<HTMLElement>('[data-slot="pane"]')) {
      if (pane.dataset.paneId === paneId) {
        pane.focus()
        return
      }
    }
  })
}

/** The connected workspace toolbar, empty state and tree renderer. */
export function WorkspaceLayout({ className, children, activeSessionId = null, onOpenSession, onSessionDrop, renderSession, renderDraftSession, disabled = false }: WorkspaceLayoutProps) {
  const snapshot = useWorkspace()
  const { panes, layout, activePaneId } = snapshot
  /* Maximize is a view mode for the moment, not part of the arrangement.
     It is deliberately session-local and is not saved: reloading returns
     the reader to the split arrangement they saved rather than to one pane
     with the others hidden. The maximized pane's header shows a restore
     control, so the mode is visible and reversible without the menu. */
  const [maximizedPaneId, setMaximizedPaneId] = React.useState<string | null>(null)
  const [notice, setNotice] = React.useState<string | null>(null)
  const [storageReady, setStorageReady] = React.useState(false)
  const [poppedOutIds, setPoppedOutIds] = React.useState<Set<string>>(() => new Set())
  const poppedOutIdsRef = React.useRef(poppedOutIds)
  poppedOutIdsRef.current = poppedOutIds
  const panesRef = React.useRef(panes)
  panesRef.current = panes
  const nativeDragRef = React.useRef<{ dragId: string; sourceWindow: string; payload: WorkspaceNativeDragPayload } | null>(null)
  const nativeTargetRef = React.useRef<{ element: HTMLElement; edge: "left" | "right" | "top" | "bottom" | "center"; dragId: string } | null>(null)
  const nativeOverRevision = React.useRef(0)
  const nativeOverTaskRef = React.useRef<Promise<void>>(Promise.resolve())
  const popOutPendingRef = React.useRef(new Set<string>())
  const handleSessionDropRef = React.useRef<WorkspaceLayoutProps["onSessionDrop"]>(onSessionDrop)
  handleSessionDropRef.current = (side, id, targetId, edge) => {
    const accepted = onSessionDrop?.(side, id, targetId, edge)
    setNotice(accepted === false ? "Six views are open. Close one before adding another." : null)
    return accepted
  }
  React.useLayoutEffect(() => {
    let alive = true
    const raw = readStorage("workspace.layout.v1")
    if (raw) {
      const saved = parsePersistedWorkspace(raw)
      if (saved) {
        const known = saved.panes.filter((pane) => PANE_REGISTRY.has(pane.type))
        let repairedLayout: LayoutNode | null = saved.layout
        for (const pane of saved.panes) {
          if (!PANE_REGISTRY.has(pane.type)) repairedLayout = removePaneFromLayout(repairedLayout, pane.id)
        }
        if (known.length > 0 && repairedLayout) {
          const activePaneId = known.some((pane) => pane.id === saved.activePaneId) ? saved.activePaneId : known[0]?.id ?? null
          restoreWorkspace({ ...saved, panes: known, layout: repairedLayout, activePaneId })
        } else writeStorage("workspace.layout.v1", undefined)
      } else writeStorage("workspace.layout.v1", undefined)
    }
    let savedPopoutIds: string[] = []
    try {
      const rawPopped = readStorage("workspace.popout.ids")
      const ids = rawPopped ? JSON.parse(rawPopped) : []
      if (Array.isArray(ids) && ids.every((id) => typeof id === "string" && /^[a-zA-Z0-9_-]{1,80}$/.test(id))) savedPopoutIds = ids
    } catch { writeStorage("workspace.popout.ids", undefined) }
    if (!isDesktopApp() || savedPopoutIds.length === 0) {
      setPoppedOutIds(new Set())
      setStorageReady(true)
    } else {
      void Promise.all(savedPopoutIds.map(async (id) => [id, await paneWindowExists(id)] as const))
        .then((entries) => {
          if (!alive) return
          const live = entries.filter(([, exists]) => exists).map(([id]) => id)
          for (const [id, exists] of entries) if (!exists) writeStorage(`workspace.popout.${id}`, undefined)
          setPoppedOutIds(new Set(live))
          writeStorage("workspace.popout.ids", live.length ? JSON.stringify(live) : undefined)
          setStorageReady(true)
        })
        .catch(() => {
          if (!alive) return
          setPoppedOutIds(new Set())
          writeStorage("workspace.popout.ids", undefined)
          setStorageReady(true)
        })
    }
    return () => { alive = false }
  }, [])
  /**
   * The workspace's saved form.
   *
   * It is derived from the geometry alone. A pane's own state — a selected
   * file, a filter, a draft — publishes a new snapshot, but it is not part
   * of the saved layout, so the string below does not change and the effect
   * below does not run. The previous version depended on the whole snapshot
   * and rewrote storage on every keystroke in a pane.
   */
  const serializedWorkspace = React.useMemo(
    () => serializeWorkspace({ panes, activePaneId, layout }),
    [panes, activePaneId, layout],
  )
  const writtenWorkspaceRef = React.useRef<string | null | undefined>(undefined)
  React.useEffect(() => {
    if (!storageReady) return
    if (writtenWorkspaceRef.current === serializedWorkspace) return
    writtenWorkspaceRef.current = serializedWorkspace
    writeStorage("workspace.layout.v1", serializedWorkspace ?? undefined)
  }, [serializedWorkspace, storageReady])
  React.useEffect(() => {
    if (!notice) return
    const timer = window.setTimeout(() => setNotice(null), NOTICE_TIMEOUT_MS)
    return () => window.clearTimeout(timer)
  }, [notice])
  React.useEffect(() => {
    if (storageReady) writeStorage("workspace.popout.ids", JSON.stringify([...poppedOutIds]))
  }, [poppedOutIds, storageReady])
  React.useEffect(() => {
    if (!isDesktopApp()) return
    let unlisten: (() => void) | undefined
    let alive = true
    void onPaneDockBack((payload) => {
      if (typeof payload.id !== "string") return false
      const pane = panesRef.current.find((candidate) => candidate.id === payload.id)
      if (!pane) return false
      const sessionId = pane.context?.sessionId
      if (sessionId) {
        const side = pane.type === "chat" ? "chat" : "code"
        const saved = side === "chat" ? findChat(sessionId) : findSession(sessionId)
        if (saved) loadConversation(sessionId, side, fromStoredTurns(saved.turns), { usage: saved.usage ?? null, servedModel: saved.model ?? null })
      }
      const returnedState = typeof payload.paneState === "string" ? parsePaneLocalState(payload.paneState) : null
      if (returnedState) setPaneState(payload.id, returnedState)
      const edge = EDGES.includes(payload.edge as (typeof EDGES)[number]) ? payload.edge as (typeof EDGES)[number] : "right"
      if (payload.targetId && panesRef.current.some((candidate) => candidate.id === payload.targetId)) dockPane(payload.id, payload.targetId, edge)
      setPoppedOutIds((current) => { const next = new Set(current); next.delete(payload.id); return next })
      writeStorage(`workspace.popout.${payload.id}`, undefined)
      return true
    }).then((stop) => { if (alive) unlisten = stop; else stop() }).catch(() => {})
    return () => { alive = false; unlisten?.() }
  }, [])
  React.useEffect(() => {
    if (!isDesktopApp()) return
    let alive = true
    let stopDrag: (() => void) | undefined
    let stopOver: (() => void) | undefined
    const clearMarkers = () => document.querySelectorAll<HTMLElement>("[data-native-drop-edge]").forEach((node) => { delete node.dataset.nativeDropEdge; delete node.dataset.dropEdge })
    void onWorkspaceNativeDrag((notice) => {
      if (notice.phase === "start") { nativeOverRevision.current += 1; nativeDragRef.current = notice; nativeTargetRef.current = null }
      else if (nativeDragRef.current?.dragId === notice.dragId) {
        nativeDragRef.current = null
        clearMarkers()
      }
    }).then((stop) => { if (alive) stopDrag = stop; else stop() }).catch(() => {})
    void onWorkspaceNativeDragOver((event) => {
      const revision = ++nativeOverRevision.current
      const task = (async () => {
        if (event.type === "leave" || !event.position) {
          nativeTargetRef.current = null
          clearMarkers()
          return
        }
        const drag = nativeDragRef.current
        if (!drag) return
        const point = await workspaceDropPoint(event.position)
        if (revision !== nativeOverRevision.current || nativeDragRef.current?.dragId !== drag.dragId) return
        const target = document.elementFromPoint(point.x, point.y)?.closest<HTMLElement>("[data-pane-drop-target]")
        clearMarkers()
        if (target) {
          const edge = target.dataset.paneDropKind === "workspace" ? "center" : nativeDropEdge(target.getBoundingClientRect(), point.x, point.y)
          nativeTargetRef.current = { element: target, edge, dragId: drag.dragId }
          target.dataset.nativeDropEdge = edge
          target.dataset.dropEdge = edge
        } else {
          nativeTargetRef.current = null
        }
      })()
      nativeOverTaskRef.current = task.catch(() => {})
      return nativeOverTaskRef.current
    }).then((stop) => { if (alive) stopOver = stop; else stop() }).catch(() => {})
    void onWorkspaceNativeDrop(async (raw) => {
      const envelope = raw as { version?: unknown; dragId?: unknown; sourceWindow?: unknown; payload?: unknown }
      if (envelope?.version !== 1 || typeof envelope.dragId !== "string" || typeof envelope.sourceWindow !== "string" || !envelope.payload || typeof envelope.payload !== "object") return
      await nativeOverTaskRef.current
      const notice = nativeDragRef.current
      const payload = envelope.payload as WorkspaceNativeDragPayload
      // The OS drop callback does not include a pointer coordinate. The
      // onDragDropEvent stream records the last target under the pointer.
      const nativeTarget = nativeTargetRef.current
      const target = nativeTarget?.element
      const targetId = target?.dataset.paneDropTarget ?? ""
      const edge = nativeTargetRef.current?.edge
      nativeTargetRef.current = null
      clearMarkers()
      if (!target?.isConnected || nativeTarget?.dragId !== envelope.dragId || !edge || (notice && notice.dragId !== envelope.dragId)) return
      if (payload.kind === "session") {
        if (target.dataset.paneDropKind !== "workspace" && !targetId) return
        const accepted = handleSessionDropRef.current?.(payload.side, payload.id, targetId, edge)
        if (accepted === false) return
      } else if (payload.kind === "pane" || payload.kind === "tab") {
        if (!targetId) return
        const dockedAtPlaceholder = isDockBackToOriginalPaneTarget({
          kind: payload.kind,
          paneId: payload.paneId,
          targetPaneId: targetId,
          sourceWindow: envelope.sourceWindow,
        })
        if (payload.paneId === targetId && !dockedAtPlaceholder) return
        if (payload.busy && envelope.sourceWindow.startsWith("pane-")) {
          setNotice("This popped-out session is still replying. Let it finish before docking it here.")
          return
        }
        const pane = panesRef.current.find((item) => item.id === payload.paneId)
        if (!pane) return
        if (payload.paneState) {
          const state = parsePaneLocalState(payload.paneState)
          if (state) setPaneState(payload.paneId, state)
        }
        const moved = dockedAtPlaceholder || (payload.kind === "tab" && target.dataset.paneDropKind === "tab"
          ? reorderTab(payload.paneId, targetId) || dockPane(payload.paneId, targetId, "center")
          : dockPane(payload.paneId, targetId, edge))
        if (!moved) return
        setPoppedOutIds((current) => { const next = new Set(current); next.delete(payload.paneId); return next })
        writeStorage(`workspace.popout.${payload.paneId}`, undefined)
      } else return
      if (payload.kind !== "session") {
        await notifyWorkspaceDropAccepted(envelope.sourceWindow, payload.paneId).catch(() => {})
      }
    }).catch(() => {})
    return () => { alive = false; stopDrag?.(); stopOver?.(); clearMarkers() }
  }, [])
  const paneList = React.useMemo(
    () => panes.map((pane) => ({ id: pane.id, title: paneTitleFor(pane.type, pane.title) })),
    [panes],
  )
  const toggleMaximize = React.useCallback((id: string) => setMaximizedPaneId((current) => current === id ? null : id), [])
  const handleDockBack = React.useCallback((id: string) => {
    if (isDesktopApp()) void closePaneWindow(id).catch(() => setNotice("The pane window could not be closed."))
    else setPoppedOutIds((current) => { const next = new Set(current); next.delete(id); return next })
  }, [])
  const handleClosePane = React.useCallback((id: string) => {
    removePane(id)
    requestAnimationFrame(() => {
      const snapshot = getWorkspaceSnapshot()
      const nextPaneId = snapshot.activePaneId
      const workspace = document.querySelector<HTMLElement>('[data-slot="workspace-layout"]')
      /* The workspace region only takes focus when the last pane has gone.
         With panes left, removePane leaves a visible active pane, and its
         title (or its tab, in a group) is the surviving control. */
      if (snapshot.panes.length === 0) {
        workspace?.focus()
        return
      }
      const paneTitle = nextPaneId ? document.getElementById(`workspace-pane-title-${nextPaneId}`) : null
      /* A grouped pane has no title of its own — its tab names it — so the
         tab is the surviving control to return focus to. */
      const paneTab = nextPaneId ? document.getElementById(`workspace-tab-${nextPaneId}`) : null
      ;(paneTitle ?? paneTab)?.focus()
    })
  }, [])
  /**
   * The workspace's keyboard routes.
   *
   * One listener for the region, not one per pane: focus may be anywhere in a
   * pane's content, and the action belongs to the workspace. It reads the
   * live store rather than the render's snapshot so a key press always acts on
   * the arrangement that is on screen. Dialogs and menus own the keyboard
   * while they are open, and a repeated key must not close three panes.
   */
  React.useEffect(() => {
    if (disabled || panes.length === 0) return
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.defaultPrevented || event.repeat || event.isComposing) return
      const intent = workspaceShortcutIntent(event)
      if (!intent || isWorkspaceShortcutBlocked(event.target)) return
      const snapshot = getWorkspaceSnapshot()
      if (intent.kind === "close-pane") {
        const targetId = snapshot.activePaneId ?? visiblePaneIds(snapshot.layout)[0] ?? snapshot.panes[0]?.id ?? null
        if (!targetId) return
        /* A pane in its own window has no close control in this workspace:
           its header offers dock back instead. Closing it from here would
           remove the placeholder and leave the native window orphaned. */
        if (poppedOutIdsRef.current.has(targetId)) return
        event.preventDefault()
        handleClosePane(targetId)
        return
      }
      if (intent.kind === "cycle-pane") {
        const visible = visiblePaneIds(snapshot.layout)
        const candidates = visible.length > 0 ? visible : snapshot.panes.map((pane) => pane.id)
        const targetId = nextVisiblePaneId(candidates, snapshot.activePaneId, intent.direction)
        if (!targetId) return
        event.preventDefault()
        /* A maximized pane hides the rest of the arrangement; focusing a
           different pane means leaving that view. */
        setMaximizedPaneId((current) => current === targetId ? current : null)
        setActivePane(targetId)
        focusPaneWhenRendered(targetId)
        return
      }
      const visible = visiblePaneIds(snapshot.layout)
      const existing = paneForToggle(snapshot.panes, intent.paneType, snapshot.activePaneId, visible)
      if (existing) {
        event.preventDefault()
        setMaximizedPaneId((current) => current === existing ? current : null)
        setActivePane(existing)
        focusPaneWhenRendered(existing)
        return
      }
      const added = addPane(intent.paneType, { anchorPaneId: snapshot.activePaneId ?? undefined })
      if (!added) {
        event.preventDefault()
        setNotice("Six views are open. Close one before adding another.")
        return
      }
      event.preventDefault()
      setMaximizedPaneId(null)
      focusPaneWhenRendered(added.id)
    }
    window.addEventListener("keydown", onKeyDown)
    return () => window.removeEventListener("keydown", onKeyDown)
  }, [disabled, handleClosePane, panes.length])
  const handlePopOut = React.useCallback(async (pane: PaneInstance) => {
    if (popOutPendingRef.current.has(pane.id)) return
    const sessionId = pane.context?.sessionId
    const status = sessionId ? conversation(sessionId)?.status : undefined
    if (status === "submitted" || status === "streaming") {
      setNotice("This session is still replying in the main window. Let it finish before popping it out.")
      return
    }
    popOutPendingRef.current.add(pane.id)
    const record = { version: 1, pane, paneState: serializePaneLocalState(snapshot.paneState[pane.id] ?? {}) }
    try {
      if (!writeStorage(`workspace.popout.${pane.id}`, JSON.stringify(record))) {
        setNotice("The pane state could not be saved for its new window. Keep this view docked and try again.")
        return
      }
      await createPaneWindow({ id: pane.id, title: paneTitleFor(pane.type, pane.title) })
      setPoppedOutIds((current) => new Set(current).add(pane.id))
      setNotice(null)
    } catch (error) {
      console.error("Failed to open pane window", error)
      writeStorage(`workspace.popout.${pane.id}`, undefined)
      setNotice(error instanceof Error ? error.message : "The pane window could not be opened.")
    } finally {
      popOutPendingRef.current.delete(pane.id)
    }
  }, [panes, snapshot.paneState])
  const handleSessionDrop = React.useCallback<NonNullable<WorkspaceLayoutProps["onSessionDrop"]>>((side, id, targetId, edge) => {
    const accepted = onSessionDrop?.(side, id, targetId, edge)
    setNotice(accepted === false ? "Six views are open. Close one before adding another." : null)
    return accepted
  }, [onSessionDrop])
  React.useEffect(() => {
    if (maximizedPaneId && !panes.some((pane) => pane.id === maximizedPaneId)) setMaximizedPaneId(null)
  }, [maximizedPaneId, panes])
  const openSession = onOpenSession ?? (() => {})
  const render = React.useCallback((id: PaneInstanceId) => renderPane(panes, id, activeSessionId, openSession, handleSessionDrop, renderSession, renderDraftSession, maximizedPaneId, activePaneId, toggleMaximize, poppedOutIds.has(id), handleDockBack, handlePopOut, handleClosePane, snapshot.paneState), [panes, activeSessionId, openSession, handleSessionDrop, renderSession, renderDraftSession, maximizedPaneId, activePaneId, toggleMaximize, poppedOutIds, handleDockBack, handlePopOut, handleClosePane, snapshot.paneState])

  if (disabled) return <>{children}</>
  if (panes.length === 0) return <div data-slot="workspace-layout" data-pane-drop-target="" data-pane-drop-kind="workspace" role="region" aria-label="Workspace" tabIndex={-1} className="relative flex min-h-0 min-w-0 flex-1 before:pointer-events-none before:absolute before:inset-0 before:z-20 before:bg-primary/15 before:opacity-0 before:content-[''] data-[drop-edge=center]:before:opacity-100 focus-visible:outline-2 focus-visible:outline-focus-ring focus-visible:outline-offset-[-2px]" onDragOver={(event) => {
    if (event.dataTransfer.types.includes("application/x-tavi-session")) {
      event.preventDefault()
      event.currentTarget.dataset.dropEdge = "center"
    }
  }} onDragLeave={(event) => { if (!event.currentTarget.contains(event.relatedTarget as Node | null)) delete event.currentTarget.dataset.dropEdge }} onDrop={(event) => {
    const data = event.dataTransfer.getData("application/x-tavi-session")
    if (!data) return
    event.preventDefault()
    delete event.currentTarget.dataset.dropEdge
    try {
      const payload = JSON.parse(data) as { id?: unknown; side?: unknown }
      if (typeof payload.id === "string" && (payload.side === "chat" || payload.side === "code")) onSessionDrop?.(payload.side, payload.id, "", "center")
    } catch { /* Ignore malformed session drags. */ }
  }}>{children}</div>

  return (
    <WorkspaceLayoutContext.Provider value={{
      panes: paneList,
      activePaneId,
      setActiveTab,
      closePane: handleClosePane,
    }}>
      <section data-slot="workspace-layout" className={cn("relative flex min-h-0 min-w-0 flex-1 flex-col focus-visible:outline-2 focus-visible:outline-focus-ring focus-visible:outline-offset-[-2px]", className)} aria-label="Workspace" tabIndex={-1}>
        {notice ? (
          /* A notice floats over the layout. It used to be a paragraph
             above the tree, so a refused drop pushed every pane down and
             changed the height the reader had just given them. */
          <div className="pointer-events-none absolute inset-x-0 top-2 z-30 flex justify-center px-2" role="status">
            <p className="max-w-md rounded-md bg-popover px-2.5 py-1.5 text-xs text-popover-foreground shadow-md ring-1 ring-foreground/10">{notice}</p>
          </div>
        ) : null}
        <div className="flex min-h-0 min-w-0 flex-1" data-active-pane={activePaneId ?? undefined}>
          {layout ? <LayoutTree node={layout} renderPane={render} maximizedPaneId={maximizedPaneId ?? undefined} /> : null}
        </div>
      </section>
    </WorkspaceLayoutContext.Provider>
  )
}
