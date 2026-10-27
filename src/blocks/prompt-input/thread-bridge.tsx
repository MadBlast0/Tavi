"use client"

import * as React from "react"

import { takeIntent } from "@/lib/desktop"
import { OPEN_THREAD } from "@/lib/open-thread"
import { isDesktopApp } from "@/lib/platform"
import type { Side } from "@/lib/sides"
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
 * What the rail has to redraw for is state: the open thread. The rail draws
 * the thread list, so it has to know which one is open.
 *
 * **Which thread is answering is not here.** That is the runtime's, and it is
 * the runtime's because a reply can be running in a conversation this side is
 * not showing — so a single id, for one conversation, was never enough.
 */
export type ThreadBridge = {
  /**
   * Start a new thread on a side, leaving whatever is open there.
   *
   * The side is optional because the rail's "New" row means "new thread on the
   * side I am already on", while the tray and the menu mean "new chat" or
   * "new session" by name.
   */
  reset: (side?: Side) => void
  /** Open an existing thread by its id. */
  open: (id: string) => void
}

type ThreadBridgeValue = {
  functions: React.RefObject<ThreadBridge | null>
  activeId: string | null
  setActiveId: (id: string | null) => void
}

const ThreadBridgeContext = React.createContext<ThreadBridgeValue | null>(null)

export function ThreadBridgeProvider({ children, listenForOpenThread = true }: { children: React.ReactNode; listenForOpenThread?: boolean }) {
  const functions = React.useRef<ThreadBridge | null>(null)
  const [activeId, setActiveId] = React.useState<string | null>(null)

  const value = React.useMemo<ThreadBridgeValue>(
    () => ({ functions, activeId, setActiveId }),
    [activeId],
  )

  /**
   * A conversation asked for from outside the composer.
   *
   * The notification card that names a finished reply is raised from a module
   * rather than from a component, so it cannot hold the composer's handlers.
   * It asks for the conversation to be opened instead, and this is where the
   * request lands — the bridge already publishes the composer's two entry
   * points, so this is the same seam reached from a different side.
   */
  React.useEffect(() => {
    if (!listenForOpenThread) return
    const onOpen = (event: Event) => {
      const id = (event as CustomEvent<string>).detail
      if (typeof id !== "string" || !id) return
      functions.current?.open(id)
    }
    window.addEventListener(OPEN_THREAD, onOpen)
    return () => window.removeEventListener(OPEN_THREAD, onOpen)
  }, [listenForOpenThread])

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
    (side: Side) => {
      /* Any request the system tray is still holding is answered by what the
         user has just done instead. */
      if (isDesktopApp()) {
        void takeIntent().catch(() => {})
      }
      setVariant(side)
      bridge.functions.current?.reset(side)
    },
    [setVariant, bridge.functions],
  )
}
