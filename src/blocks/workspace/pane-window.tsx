"use client"

import * as React from "react"

import { Button } from "@/components/button"
import { ComposerVariantProvider, type ComposerVariant } from "@/blocks/prompt-input/composer-variant"
import { PromptBlock } from "@/blocks/prompt-input/prompt-block"
import { ThreadBridgeProvider } from "@/blocks/prompt-input/thread-bridge"
import { Pane } from "@/blocks/workspace/pane"
import { PANE_REGISTRY, type PaneActions } from "@/blocks/workspace/pane-registry"
import { readStorage } from "@/lib/storage"
import { destroyCurrentPaneWindow, notifyPaneWindowReady, onPaneWindowCloseRequest, onWorkspaceDropAccepted, requestPaneDockBack } from "@/lib/desktop"
import { conversation, subscribeConversation } from "@/lib/conversation"
import { getWorkspaceSnapshot, restoreWorkspace, setPaneState, type PaneInstance } from "@/lib/workspace-state"
import type { WorkspaceNativeDragPayload } from "@/lib/desktop"
import { parsePaneLocalState, serializePaneLocalState } from "@/lib/pane-state-transfer"

type PaneWindowRecord = {
  version: 1
  pane: PaneInstance
  paneState?: string
}

function readRecord(id: string): PaneWindowRecord | null {
  const raw = readStorage(`workspace.popout.${id}`)
  if (!raw) return null
  try {
    const record = JSON.parse(raw) as PaneWindowRecord
    if (record.version !== 1 || record.pane?.id !== id || !PANE_REGISTRY.has(record.pane.type)) return null
    return record
  } catch {
    return null
  }
}

/**
 * One pane in its own native window.
 *
 * The window is the pane's, not the workspace's: it draws the same `Pane`
 * header as the docked pane, so the title, the view launchers and the menu
 * come with it. Because there is no cross-window layout protocol, actions
 * that would rearrange the main workspace — split, maximize and another
 * pop-out — are not offered here; the one window action is dock back, which
 * returns the pane to the slot it left.
 */
export function PaneWindow({ paneId }: { paneId: string }) {
  const record = React.useMemo(() => readRecord(paneId), [paneId])
  const [error, setError] = React.useState<string | null>(null)
  const returning = React.useRef(false)
  const returnWhenIdle = React.useRef(false)
  const pane = record?.pane
  const sessionId = pane?.context?.sessionId
  const status = React.useSyncExternalStore(
    React.useCallback((listener) => sessionId ? subscribeConversation(sessionId, listener) : () => {}, [sessionId]),
    React.useCallback(() => sessionId ? conversation(sessionId)?.status ?? "idle" : "idle", [sessionId]),
    React.useCallback(() => "idle", []),
  )
  const busy = status === "submitted" || status === "streaming"

  const dockBack = React.useCallback(async () => {
    if (returning.current) return
    if (busy) {
      returnWhenIdle.current = true
      setError("A reply is still running. This pane will return when it finishes.")
      return
    }
    returning.current = true
    try {
      const paneState = serializePaneLocalState(getWorkspaceSnapshot().paneState[paneId] ?? {})
      await requestPaneDockBack({ id: paneId, paneState })
      await destroyCurrentPaneWindow()
    } catch (reason) {
      returning.current = false
      setError(reason instanceof Error ? reason.message : "The pane could not be docked back.")
    }
  }, [busy, paneId])

  /* A native close request cannot destroy the webview while its conversation
     owns the active stream. Keep the window alive, then complete the requested
     dock-back as soon as the synchronized runtime reports idle. */
  React.useEffect(() => {
    if (busy || !returnWhenIdle.current) return
    returnWhenIdle.current = false
    void dockBack()
  }, [busy, dockBack])

  React.useEffect(() => {
    let unlisten: (() => void) | undefined
    let alive = true
    void onPaneWindowCloseRequest(() => { void dockBack() })
      .then((stop) => {
        if (alive) {
          unlisten = stop
          void notifyPaneWindowReady(paneId).catch((reason) => setError(reason instanceof Error ? reason.message : "The pane window could not finish opening."))
        } else stop()
      })
      .catch(() => {})
    return () => { alive = false; unlisten?.() }
  }, [dockBack, paneId])

  React.useEffect(() => {
    let unlisten: (() => void) | undefined
    let alive = true
    void onWorkspaceDropAccepted((acceptedId) => {
      if (acceptedId !== paneId || returning.current) return
      returning.current = true
      void destroyCurrentPaneWindow().catch((reason) => {
        returning.current = false
        setError(reason instanceof Error ? reason.message : "The pane window could not be closed after docking.")
      })
    }).then((stop) => { if (alive) unlisten = stop; else stop() }).catch(() => {})
    return () => { alive = false; unlisten?.() }
  }, [paneId])

  React.useEffect(() => {
    if (pane) restoreWorkspace({ version: 1, panes: [pane], activePaneId: pane.id, layout: { kind: "pane", paneId: pane.id } })
    const paneState = record?.paneState ? parsePaneLocalState(record.paneState) : null
    if (paneState) setPaneState(paneId, paneState)
  }, [pane, paneId, record])

  const registration = pane ? PANE_REGISTRY.get(pane.type) : undefined
  const title = pane?.title ?? registration?.defaultTitle ?? "Pane"
  const side: ComposerVariant = pane?.type === "chat" ? "chat" : "code"
  const actions: PaneActions = {
    active: true,
    onDockBack: () => void dockBack(),
    onFocus: () => {},
    getDragPayload: (): WorkspaceNativeDragPayload => ({
      kind: "pane",
      paneId,
      paneState: serializePaneLocalState(getWorkspaceSnapshot().paneState[paneId] ?? {}),
      busy,
    }),
  }

  return (
    <main className="flex h-svh min-h-0 min-w-0 flex-col bg-background">
      {error ? <p className="shrink-0 border-b border-border px-3 py-2 text-xs text-destructive" role="alert">{error}</p> : null}
      <div className="flex min-h-0 min-w-0 flex-1">
        {!record || !pane || !registration ? <div className="m-auto p-6 text-center text-sm text-muted-foreground"><p>This pane’s saved window state is unavailable.</p><Button className="mt-3" size="sm" onClick={() => void dockBack()}>Dock back to workspace</Button></div>
          : pane.type === "chat" || pane.type === "code-session" ? (
            <Pane id={pane.id} type={pane.type} title={title} icon={registration.icon} active onDockBack={() => void dockBack()} showViewActions={pane.type === "code-session"} getDragPayload={() => ({ kind: "pane", paneId: pane.id, paneState: serializePaneLocalState(getWorkspaceSnapshot().paneState[pane.id] ?? {}), busy })}>
              <ThreadBridgeProvider listenForOpenThread={false}>
                <ComposerVariantProvider initialVariant={side}>
                  <PromptBlock embeddedSession={{ side, id: pane.context?.sessionId ?? "" }} />
                </ComposerVariantProvider>
              </ThreadBridgeProvider>
            </Pane>
          ) : (
            registration.render(pane.id, actions)
          )}
      </div>
    </main>
  )
}

export function paneWindowIdFromUrl(): string | null {
  if (typeof window === "undefined") return null
  const id = new URLSearchParams(window.location.search).get("pane")
  return id && /^[a-zA-Z0-9_-]{1,80}$/.test(id) ? id : null
}
