"use client"

import * as React from "react"
import { invoke } from "@tauri-apps/api/core"
import { listen } from "@tauri-apps/api/event"

import { useNewThread } from "@/blocks/prompt-input/thread-bridge"
import { isDesktopApp } from "@/lib/desktop"

/**
 * The events the system tray sends.
 *
 * These names are written out in both languages and have to be kept in step
 * by hand: the native side sends them and this side listens for them, and
 * there is no way to share one string across the boundary. They are written
 * out in `src-tauri/src/tray.rs`.
 */
export const NEW_CHAT = "tavi-new-chat"
export const NEW_SESSION = "tavi-new-session"

/** Which composer the tray asked for, in the shape the native side sends. */
type Intent = "newChat" | "newSession"

/**
 * The tray's commands, carried into the app.
 *
 * The tray is native and the app is React, and neither of the two things the
 * tray can ask for is the tray's to decide. A new chat and a new session are
 * both answers to "what should be on screen", and the screen is the app's: the
 * chat and the session are two halves of one composer, and which half is in
 * force is state the app holds. So the tray asks and the app answers — the
 * native side brings the window forward, and this side puts the right thing
 * in it.
 *
 * It is mounted above the shell rather than inside it because the thing it
 * needs — the way to start a new thread — reaches into state that lives in
 * providers above the shell.
 */
export function TrayBridge() {
  const newThread = useNewThread()

  React.useEffect(() => {
    // The web target has no tray. There is nothing to listen for, and asking
    // would fail with an error about internals that are not there.
    if (!isDesktopApp()) return

    let disposed = false
    const unlisten: Array<() => void> = []

    const subscribe = async () => {
      const offChat = await listen(NEW_CHAT, () => newThread("chat"))
      const offSession = await listen(NEW_SESSION, () => newThread("code"))
      /* The component can go away between asking to listen and being told
         that it is listening. The listeners are then released here, rather
         than left behind for an app that is no longer listening. */
      if (disposed) {
        offChat()
        offSession()
        return
      }
      unlisten.push(offChat, offSession)
    }

    subscribe()

    return () => {
      disposed = true
      unlisten.forEach((off) => off())
    }
  }, [newThread])

  /* A request the tray made that the event did not reach: either the app was
     not listening yet, or the page was reloaded and the listener went with
     it. Taking it here is what makes the tray's buttons work from the moment
     the app appears, rather than only once it is settled.

     The window's own focus is the other moment worth looking, because the
     tray brings the window forward when it is asked to do something — and a
     window that is already in front does not gain focus, so this is not
     always the same moment as the event. */
  React.useEffect(() => {
    if (!isDesktopApp()) return

    const take = () => {
      void invoke<Intent | null>("take_intent")
        .then((intent) => {
          if (intent === "newChat") newThread("chat")
          else if (intent === "newSession") newThread("code")
        })
        .catch(() => {})
    }

    take()
    window.addEventListener("focus", take)
    return () => window.removeEventListener("focus", take)
  }, [newThread])

  return null
}
