"use client"

import * as React from "react"
import { MessageCircleIcon, SendIcon } from "lucide-react"

import { Button } from "@/components/button"
import { Message, MessageGroup } from "@/components/message"
import { MessageScroller, MessageScrollerContent, MessageScrollerItem, MessageScrollerProvider, MessageScrollerViewport } from "@/components/message-scroller"
import { Textarea } from "@/components/textarea"
import { cn } from "@/lib/utils"

import { Pane } from "../pane"
import { PaneEmpty, PaneError, PaneLoading, PaneUnavailable } from "../pane-states"
import type { PaneInstance } from "@/lib/workspace-state"

/**
 * Sample messages for the Chat pane.
 *
 * They are sample data, and they say so nowhere on the screen because the
 * sample nature is clear from the surrounding UI: a composer that appends
 * a clearly mock reply, and a status row that says "thinking" without
 * claiming a model is running.
 */
const SAMPLE_MESSAGES: { role: "user" | "assistant"; text: string }[] = [
  { role: "user", text: "Can you explain how the layout engine works?" },
  {
    role: "assistant",
    text: "The layout is a tree of three kinds of node: a **pane** names one view, a **split** names an orientation and a ratio, and a **group** names several panes sharing one place. The renderer walks the tree and draws it: a split is a flex row or column with a divider, and a group is a tab strip above the pane that is showing.",
  },
  { role: "user", text: "What happens when I drag a pane?" },
  {
    role: "assistant",
    text: "Dragging a pane by its header shows where it would land: an edge on the left, right, top or bottom means a split on that side, and the middle means it joins the group that is there. Nothing moves until the drop is committed, so a cancelled drag leaves the layout as it was.",
  },
  {
    role: "assistant",
    text: "Here is a short code sample:\n\n```ts\nconst node: LayoutNode = {\n  kind: \"split\",\n  orientation: \"horizontal\",\n  ratio: 0.5,\n  children: [\n    { kind: \"pane\", paneId: \"a\" },\n    { kind: \"pane\", paneId: \"b\" },\n  ],\n}\n```\n\nThe ratio is the share of the *remaining* space, so the divider takes none of it.",
  },
]

const LONG_MESSAGES: { role: "user" | "assistant"; text: string }[] = [
  ...SAMPLE_MESSAGES,
  ...SAMPLE_MESSAGES,
  ...SAMPLE_MESSAGES,
  { role: "user", text: "And one more question about persistence." },
  {
    role: "assistant",
    text: "The layout is saved locally and read back: the pane instances and their types and titles, the arrangement, the ratios, the groups and their tabs, which pane is active, and which session each pane was about. The saved form is versioned and validated before it is drawn. Nothing is saved that is a secret or that belongs to a session.",
  },
]

type ChatState = "empty" | "populated" | "long" | "thinking" | "loading" | "error" | "unavailable"

/**
 * The Chat pane.
 *
 * A conversation, with a composer at the bottom. The messages scroll
 * inside the pane; the composer does not move. The pane is a view onto a
 * session, and the session is the app's, not the pane's: closing the pane
 * does not close the conversation.
 */
export function ChatPane({ paneId }: { paneId: string }) {
  const [state, setState] = React.useState<ChatState>("populated")
  const [input, setInput] = React.useState("")
  const [messages, setMessages] = React.useState(SAMPLE_MESSAGES)

  const send = React.useCallback(() => {
    const text = input.trim()
    if (!text) return
    setMessages((prev) => [...prev, { role: "user", text }])
    setInput("")
    // A clearly mock reply, and nothing more. No model is called.
    window.setTimeout(() => {
      setMessages((prev) => [
        ...prev,
        { role: "assistant", text: "That is a mock reply. No model was called." },
      ])
    }, 600)
  }, [input])

  const renderContent = () => {
    switch (state) {
      case "empty":
        return (
          <PaneEmpty
            icon={MessageCircleIcon}
            title="No messages yet"
            description="Start the conversation below."
          />
        )
      case "loading":
        return <PaneLoading />
      case "error":
        return (
          <PaneError
            title="The reply did not arrive"
            description="The connection to the model was lost."
            onRetry={() => setState("populated")}
          />
        )
      case "unavailable":
        return (
          <PaneUnavailable
            title="No model connected"
            description="Choose a model in the composer to start."
          />
        )
      case "thinking":
      case "populated":
      case "long":
        return (
          <MessageScrollerProvider autoScroll>
            <MessageScroller>
              <MessageScrollerViewport tabIndex={-1} aria-label="Conversation">
                <MessageScrollerContent aria-busy={state === "thinking"}>
                  <div className="mx-auto flex w-full max-w-3xl min-w-0 flex-col gap-4 p-3">
                    {(state === "long" ? LONG_MESSAGES : messages).map((m, i) => (
                      <MessageGroup key={i}>
                        <Message align={m.role === "user" ? "end" : "start"}>
                          <div
                            className={cn(
                              "max-w-[85%] rounded-lg px-3 py-2 text-sm",
                              m.role === "user"
                                ? "bg-primary text-primary-foreground"
                                : "bg-muted text-foreground",
                            )}
                          >
                            {m.text}
                          </div>
                        </Message>
                      </MessageGroup>
                    ))}
                    {state === "thinking" ? (
                      <MessageGroup>
                        <Message align="start">
                          <div className="flex items-center gap-2 rounded-lg bg-muted px-3 py-2 text-sm text-muted-foreground">
                            <span className="size-2 animate-pulse rounded-full bg-foreground/40" />
                            Thinking…
                          </div>
                        </Message>
                      </MessageGroup>
                    ) : null}
                  </div>
                </MessageScrollerContent>
              </MessageScrollerViewport>
            </MessageScroller>
          </MessageScrollerProvider>
        )
    }
  }

  return (
    <Pane
      id={paneId}
      type="chat"
      title="Chat"
      icon={MessageCircleIcon}
      active
      onClose={() => {}}
    >
      <div className="flex min-h-0 flex-1 flex-col">
        {/* State selector — a small control, not the pane's main UI. */}
        <div className="flex shrink-0 items-center gap-1 border-b border-border px-2 py-1">
          <span className="text-xs text-muted-foreground">State:</span>
          {(["empty", "populated", "long", "thinking", "error", "unavailable"] as ChatState[]).map(
            (s) => (
              <button
                key={s}
                type="button"
                onClick={() => {
                  setState(s)
                  if (s === "populated") setMessages(SAMPLE_MESSAGES)
                  if (s === "empty") setMessages([])
                }}
                className={cn(
                  "rounded px-1.5 py-0.5 text-xs",
                  state === s
                    ? "bg-muted text-foreground"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                {s}
              </button>
            ),
          )}
        </div>
        <div className="min-h-0 flex-1">{renderContent()}</div>
        <div className="shrink-0 border-t border-border p-2">
          <div className="flex items-end gap-2">
            <Textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault()
                  send()
                }
              }}
              placeholder="Type a message…"
              className="min-h-[2.5rem] max-h-24 resize-none text-sm"
              minRows={1}
              maxRows={4}
            />
            <Button
              variant="ghost"
              size="icon-sm"
              onClick={send}
              disabled={!input.trim()}
              aria-label="Send"
            >
              <SendIcon className="size-4" />
            </Button>
          </div>
        </div>
      </div>
    </Pane>
  )
}
