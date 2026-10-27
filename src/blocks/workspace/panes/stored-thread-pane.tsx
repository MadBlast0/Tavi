"use client"

import * as React from "react"
import { ArrowUpRightIcon, MessageCircleIcon, CodeXmlIcon } from "lucide-react"

import { Button } from "@/components/button"
import { cn } from "@/lib/utils"
import { findChat, onChatsChanged } from "@/lib/chats"
import { findSession, onSessionsChanged } from "@/lib/sessions"
import type { StoredChat } from "@/lib/chats"
import type { StoredSession } from "@/lib/sessions"
import type { PaneInstance } from "@/lib/workspace-state"
import { Pane } from "../pane"
import type { PaneActions } from "../pane-registry"

type StoredThread = StoredChat | StoredSession

/** A read-only view of another stored session; activation uses the live app runtime. */
export function StoredThreadPane({ pane, actions, onOpen }: { pane: PaneInstance; actions: PaneActions; onOpen: (id: string) => void }) {
  const side = pane.type === "chat" ? "chat" : "code"
  const id = pane.context?.sessionId ?? ""
  const find = React.useCallback((): StoredThread | undefined => side === "chat" ? findChat(id) : findSession(id), [id, side])
  const subscribe = React.useCallback((listener: () => void) => side === "chat" ? onChatsChanged(listener) : onSessionsChanged(listener), [side])
  const thread = React.useSyncExternalStore(subscribe, find, find)
  const Icon = side === "chat" ? MessageCircleIcon : CodeXmlIcon
  const title = pane.title ?? thread?.title ?? (side === "chat" ? "Chat" : "Code Session")

  return (
    <Pane id={pane.id} type={pane.type} title={title} icon={Icon} active={actions.active} onClose={actions.onClose} onDockBack={actions.onDockBack} onSplit={actions.onSplit} onFocus={actions.onFocus} onMaximize={actions.onMaximize} maximized={actions.maximized} onPopOut={actions.onPopOut} popOutAvailable={actions.popOutAvailable} moveTargets={actions.moveTargets} onMoveTo={actions.onMoveTo} getDragPayload={actions.getDragPayload} showViewActions={pane.type === "code-session"}>
      <div className="flex min-h-0 flex-1 flex-col">
        <div className="flex shrink-0 items-center gap-2 border-b border-border px-3 py-2">
          <span className="min-w-0 flex-1 truncate text-xs text-muted-foreground">Saved transcript · read only in this pane</span>
          <Button size="xs" variant="outline" disabled={!thread} onClick={() => onOpen(id)}>Open to continue <ArrowUpRightIcon /></Button>
        </div>
        {!thread ? <div className="flex flex-1 items-center justify-center p-4 text-sm text-muted-foreground">This conversation is no longer available.</div> : (
          <div className="min-h-0 flex-1 overflow-auto p-3">
            <div className="mx-auto flex max-w-3xl flex-col gap-4">
              {thread.turns.length === 0 ? <p className="text-xs text-muted-foreground">No messages in this conversation yet.</p> : null}
              {thread.turns.map((turn) => turn.role === "summary" ? (
                <p key={turn.id} className="text-center text-xs text-muted-foreground">Earlier messages summarized</p>
              ) : (
                <article key={turn.id} className={cn("rounded-md px-3 py-2 text-sm", turn.role === "user" ? "self-end bg-muted" : "self-start")}>
                  <p className="mb-1 text-[10px] uppercase tracking-wide text-muted-foreground">{turn.role === "user" ? "You" : "Assistant"}</p>
                  {turn.text ? <p className="whitespace-pre-wrap break-words">{turn.text}</p> : <p className="text-xs text-muted-foreground">No text was saved for this turn.</p>}
                  {turn.role === "user" && turn.files.length > 0 ? <p className="mt-2 text-xs text-muted-foreground">{turn.files.map((file) => file.name).join(", ")}</p> : null}
                  {turn.role === "assistant" && turn.tools?.length ? <div className="mt-2 space-y-1 border-s border-border ps-2">{turn.tools.map((tool, index) => <p key={`${tool.name}-${index}`} className="text-xs text-muted-foreground">{tool.title} · {tool.status}</p>)}</div> : null}
                </article>
              ))}
            </div>
          </div>
        )}
      </div>
    </Pane>
  )
}
