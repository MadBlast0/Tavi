"use client"

import * as React from "react"
import {
  BellIcon,
  BellOffIcon,
  CopyIcon,
  GitForkIcon,
  PencilIcon,
  PinIcon,
  PinOffIcon,
  Trash2Icon,
} from "lucide-react"

import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuTrigger,
} from "@/components/context-menu"
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/dialog"
import { Button } from "@/components/button"
import { Input } from "@/components/input"
import { SidebarMenuItem } from "@/components/sidebar"
import {
  deleteChat,
  forkChat,
  renameChat,
  toggleMuteChat,
  togglePinChat,
} from "@/lib/chats"
import {
  deleteSession,
  forkSession,
  renameSession,
  toggleMuteSession,
  togglePinSession,
} from "@/lib/sessions"
import type { RailThread } from "./rail-thread"

/** What the menu is acting on, and what it is doing about it. */
type Pending =
  | { kind: "rename"; thread: RailThread }
  | { kind: "delete"; thread: RailThread }
  | null

/**
 * The right-click menu on a thread.
 *
 * The set follows what editors and agent apps put on the same row: Cursor gives
 * a chat Pin, Rename, Mark as Unread and Archive, and adds Fork and Move To for
 * sessions attached to a repository; Kimi Code lists rename, archive, fork,
 * export and pin for a session. Delete is last and behind a rule in all of them,
 * because it is the one that cannot be undone.
 *
 * Two items are deliberately absent. **Archive** is the reversible option and
 * needs somewhere to look at archived threads, which would be a second list and
 * a way back out of it. **Move to project** needs a project to move to, and the
 * projects folder is empty — offering a picker with nothing in it is worse than
 * not offering one. Both are marked off in the README.
 *
 * Chat and Code differ where the work differs: forking a thread is for trying
 * another direction in a repository, and in a conversation the thread is the
 * conversation, not a branch point.
 */
export function ThreadContextMenu({
  thread,
  children,
}: {
  thread: RailThread
  children: React.ReactNode
}) {
  const [pending, setPending] = React.useState<Pending>(null)
  const [draftTitle, setDraftTitle] = React.useState("")

  /**
   * The store that holds this thread.
   *
   * A chat and a session are different objects in different places, so the menu
   * acts on the one the thread actually belongs to rather than on whichever
   * store happened to be in front of it.
   */
  const actions =
    thread.side === "chat"
      ? {
          remove: deleteChat,
          rename: renameChat,
          togglePin: togglePinChat,
          toggleMute: toggleMuteChat,
          fork: forkChat,
        }
      : {
          remove: deleteSession,
          rename: renameSession,
          togglePin: togglePinSession,
          toggleMute: toggleMuteSession,
          fork: forkSession,
        }

  function openRename() {
    setDraftTitle(thread.title)
    setPending({ kind: "rename", thread })
  }

  function commitRename() {
    if (pending?.kind === "rename") actions.rename(pending.thread.id, draftTitle)
    setPending(null)
  }

  function commitDelete() {
    if (pending?.kind === "delete") actions.remove(pending.thread.id)
    setPending(null)
  }

  function onFork() {
    actions.fork(thread.id)
  }

  async function onCopyId() {
    try {
      await navigator.clipboard.writeText(thread.id)
    } catch {
      /* Clipboard refused. Nothing else to do, and the id is on the row's own
         title attribute if it is ever needed. */
    }
  }

  return (
    <>
      <ContextMenu>
        {/* `data-popup-open:inset-ring-0` turns off the ring Base UI paints on
            a trigger while its menu is open. That ring is right for a trigger
            that is a button in its own right and wrong here: the trigger is not
            what the user sees, the row inside it is, and the row clips its own
            corners — so the ring came through as four square corners floating
            around the title. The row already shows hover and open states, and
            the open state here is the menu itself.

            `render` makes the trigger the row's own <li> rather than a wrapper
            around it, which is both valid inside the rail's <ul> and one fewer
            box between the pointer and the row. For that reason what is passed
            in is the button and its timestamp, not a finished row. */}
        <ContextMenuTrigger
          render={<SidebarMenuItem />}
          className="data-popup-open:inset-ring-0"
        >
          {children}
        </ContextMenuTrigger>
        {/* `w-max` alone: the panel is as wide as the component's own minimum,
            which is what every other menu in the app is. The fixed width this
            replaces left a strip of empty background to the right of every row,
            and going the other way — sizing purely to the labels — made it look
            clipped rather than narrow. */}
        <ContextMenuContent className="w-max">
          {/* Forking is for trying another direction in a repository, so it is
              offered on a session and not on a chat — where the thread is the
              conversation rather than a branch point. */}
          {thread.side === "code" ? (
            <ContextMenuItem onClick={onFork}>
              <GitForkIcon />
              Fork
            </ContextMenuItem>
          ) : null}

          <ContextMenuItem onClick={() => actions.togglePin(thread.id)}>
            {thread.pinnedAt ? <PinOffIcon /> : <PinIcon />}
            {thread.pinnedAt ? "Unpin" : "Pin"}
          </ContextMenuItem>

          {/* Mute is about being interrupted, not about the thread: a muted
              thread still runs, and its reply still lands in it. It is the
              one item here that says something about the app's behaviour
              rather than about the conversation. */}
          <ContextMenuItem onClick={() => actions.toggleMute(thread.id)}>
            {thread.mutedAt ? <BellIcon /> : <BellOffIcon />}
            {thread.mutedAt ? "Unmute" : "Mute"}
          </ContextMenuItem>

          {/* No ellipsis. It was there to signal that a dialog opens rather than
              something happening in place, but in a menu this narrow it reads as
              the label being cut off — and Rename does not rename in place. */}
          <ContextMenuItem onClick={openRename}>
            <PencilIcon />
            Rename
          </ContextMenuItem>
          <ContextMenuItem onClick={onCopyId}>
            <CopyIcon />
            Copy ID
          </ContextMenuItem>

          <ContextMenuSeparator />

          {/* closeOnClick keeps the menu from lingering under the dialog that
              this opens. */}
          <ContextMenuItem
            variant="destructive"
            onClick={() => setPending({ kind: "delete", thread })}
          >
            <Trash2Icon />
            Delete
          </ContextMenuItem>
        </ContextMenuContent>
      </ContextMenu>

      {/* Rename is a dialog rather than inline editing in the row. The row is
          28px tall in a rail that can be 200px wide; a text field inline would
          either clip its own contents or force the row to resize under the
          pointer that opened it. */}
      <Dialog
        open={pending?.kind === "rename"}
        onOpenChange={(open) => {
          if (!open) setPending(null)
        }}
      >
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Rename thread</DialogTitle>
            <DialogDescription>
              The name it is listed under in the rail.
            </DialogDescription>
          </DialogHeader>
          <DialogBody>
            <Input
              value={draftTitle}
              onChange={(event) => setDraftTitle(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") commitRename()
              }}
              aria-label="Thread name"
            />
          </DialogBody>
          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => setPending(null)}>
              Cancel
            </Button>
            <Button size="sm" onClick={commitRename} disabled={!draftTitle.trim()}>
              Rename
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Every one of these apps confirms before deleting, and names the thread
          being deleted: the titles are the user's own words and often several
          near-identical ones, so "the thread" is not enough to act on. */}
      <Dialog
        open={pending?.kind === "delete"}
        onOpenChange={(open) => {
          if (!open) setPending(null)
        }}
      >
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Delete &quot;{thread.title}&quot;?</DialogTitle>
            <DialogDescription>
              This removes the thread and its whole conversation. It cannot be
              undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => setPending(null)}>
              Cancel
            </Button>
            <Button variant="destructive" size="sm" onClick={commitDelete}>
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}