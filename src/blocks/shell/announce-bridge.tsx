"use client"

import * as React from "react"

import { Toaster, toast } from "@/components/toast"
import { ANNOUNCE, type Announcement } from "@/lib/notifications"
import { requestOpenThread } from "@/lib/open-thread"

/**
 * The app's own announcement surface.
 *
 * The operating system's toast is the app's way of reaching the reader when
 * the app is in the background. This is its way of reaching them when the
 * app is in the front — and the better of the two, because the card can be
 * acted on: the system's toast cannot open a conversation, as the plugin's
 * action API is mobile-only, and this one can.
 *
 * **The card is at the top of the window, under the title bar.** The bottom
 * of the window belongs to the composer, and a card that covered the thing
 * the reader was typing in would be a card in the wrong place. The offset is
 * the title bar's own thickness, so the card clears it by the same amount
 * the work area does.
 */
export function AnnounceBridge() {
  React.useEffect(() => {
    const onAnnounce = (event: Event) => {
      const announcement = (event as CustomEvent<Announcement>).detail
      if (!announcement) return
      toast.info(announcement.title, {
        description: announcement.body,
        /* The action is what the card can do that the system's toast cannot:
           it opens the conversation the announcement is about. A card with no
           conversation behind it has no action, rather than one that does
           nothing. */
        action: announcement.id
          ? {
              label: "Open",
              onClick: () => requestOpenThread(announcement.id as string),
            }
          : undefined,
      })
    }
    window.addEventListener(ANNOUNCE, onAnnounce)
    return () => window.removeEventListener(ANNOUNCE, onAnnounce)
  }, [])

  return (
    <Toaster
      position="top-right"
      /* The offset is given at both breakpoints, because the position's own
         classes set a top at each of them, and a class that only answered
         the narrow one would lose to the wide one at the width the app
         usually runs at. The title bar's thickness is the number, so the
         card clears the bar by the same amount the work area does. */
      className="top-[calc(var(--shell-top-bar-h)+0.75rem)] sm:top-[calc(var(--shell-top-bar-h)+0.75rem)]"
    />
  )
}
