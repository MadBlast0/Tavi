"use client"

import * as React from "react"
import { invoke } from "@tauri-apps/api/core"

import { isDesktopApp } from "@/lib/desktop"
import { useComposerVariant } from "./composer-variant"

/**
 * How the rail drives the composer, and what the composer is showing.
 *
 * The rail sits above the prompt block in the tree, so it cannot reach the
 * block's own handlers directly — they are state inside a component that is the
 * rail's sibling's child. Rather than lift that state out, which would mean
 * moving a dozen interdependent pieces of the composer across a module
 * boundary, the block publishes its two entry points here and the rail calls
 * them.
 *
 * The handlers live in a ref, not in state, because nothing needs to re-render
 * when they are published and the block rebuilds both on every render. A
 * state-based bridge would either republish in a loop or force memoisation of
 * functions that were never written to be stable.
 *
 * What the rail has to redraw for is state: the open thread, and the thread
 * that is streaming. The rail draws the thread list, so it has to know which
 * one is answering, and it has to know when the answer is in flight — otherwise
 * a row cannot say "this one is working".
 */
export type ThreadBridge = {
  /** Start a new thread, leaving whatever is open. */
  reset: () => void
  /** Open an existing thread by its id. */
  open: (id: string) => void
}

type ThreadBridgeValue = {
  functions: React.RefObject<ThreadBridge | null>
  activeId: string | null
  setActiveId: (id: string | null) => void
  /** The thread with a reply in flight, or null when nothing is streaming. */
  runningId: string | null
  setRunningId: (id: string | null) => void
}

const ThreadBridgeContext = React.createContext<ThreadBridgeValue | null>(null)

export function ThreadBridgeProvider({ children }: { children: React.ReactNode }) {
  const functions = React.useRef<ThreadBridge | null>(null)
  const [activeId, setActiveId] = React.useState<string | null>(null)
  const [runningId, setRunningId] = React.useState<string | null>(null)

  const value = React.useMemo<ThreadBridgeValue>(
    () => ({ functions, activeId, setActiveId, runningId, setRunningId }),
    [activeId, runningId],
  )

  return (
    <ThreadBridgeContext.Provider value={value}>
      {children}
    </ThreadBridgeContext.Provider>
  )
}

export function useThreadBridge() {
  const value = React.useContext(ThreadBridgeContext)
  if (!value) {
    throw new Error("useThreadBridge must be used inside a ThreadBridgeProvider")
  }
  return value
}

/**
 * Start a new thread in one of the two composer layouts.
 *
 * The rail, the application menu and the system tray all want the same thing
 * — an empty chat, or an empty session, in front of the user — and they all
 * want it in the same way: the layout changes, and the composer is emptied.
 * This is that, in one place, so the three of them cannot drift apart.
 *
 * It lives here rather than in the shell because the thread bridge is already
 * the seam between the rail and the composer, and the composer variant is the
 * other half of what a new thread means.
 */
export function useNewThread() {
  const { setVariant } = useComposerVariant()
  const bridge = useThreadBridge()

  return React.useCallback(
    (variant: "chat" | "code") => {
      /* Any request the system tray is still holding is answered by what the
         user has just done instead. */
      if (isDesktopApp()) {
        void invoke("take_intent").catch(() => {})
      }
      setVariant(variant)
      bridge.functions.current?.reset()
    },
    [setVariant, bridge.functions],
  )
}