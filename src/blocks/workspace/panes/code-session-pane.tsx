"use client"

import * as React from "react"
import { CodeXmlIcon, SendIcon, TerminalIcon, FolderIcon, CheckCircleIcon, XCircleIcon, AlertCircleIcon, ClockIcon, GitBranchIcon } from "lucide-react"

import { Button } from "@/components/button"
import { Textarea } from "@/components/textarea"
import { Badge } from "@/components/badge"
import { Pane } from "../pane"
import { PaneEmpty, PaneError, PaneUnavailable } from "../pane-states"
import { cn } from "@/lib/utils"

const SAMPLE_ACTIVITY: { type: string; title: string; detail: string; status: "running" | "completed" | "failed" }[] = [
  { type: "file_read", title: "Read src/lib/workspace-state.ts", detail: "Reading the workspace state model", status: "completed" },
  { type: "file_write", title: "Write src/blocks/workspace/panes/chat-pane.tsx", detail: "Creating the Chat pane component", status: "completed" },
  { type: "terminal", title: "Run pnpm typecheck", detail: "TypeScript compilation check", status: "completed" },
  { type: "terminal", title: "Run pnpm test", detail: "Running test suite", status: "running" },
  { type: "diff", title: "Show changes to src/lib/workspace-state.ts", detail: "Added dockPane operation", status: "completed" },
  { type: "file_read", title: "Read docs/plan/ui-ux-plan.md", detail: "Reading the implementation plan", status: "completed" },
  { type: "terminal", title: "Run pnpm build", detail: "Production build", status: "failed" },
]

const LONG_ACTIVITY = [
  ...SAMPLE_ACTIVITY,
  ...SAMPLE_ACTIVITY,
  { type: "file_write", title: "Write src/blocks/workspace/layout/layout-tree.tsx", detail: "Layout renderer with splits and groups", status: "completed" },
  { type: "terminal", title: "Run pnpm test --filter chat-pane", detail: "Chat pane tests", status: "completed" },
  { type: "terminal", title: "Run pnpm test --filter pane-states", detail: "Pane states tests", status: "completed" },
  { type: "terminal", title: "Run pnpm test --filter pane-registry", detail: "Pane registry tests", status: "running" },
]

type CodeState = "empty" | "working" | "completed" | "failed" | "unavailable" | "long" | "error"

export function CodeSessionPane({ paneId }: { paneId: string }) {
  const [state, setState] = React.useState<CodeState>("working")
  const [input, setInput] = React.useState("")
  const [activity, setActivity] = React.useState(SAMPLE_ACTIVITY)

  const send = React.useCallback(() => {
    const text = input.trim()
    if (!text) return
    setActivity((prev) => [...prev, { type: "user", title: `User: ${text}`, detail: "", status: "completed" }])
    setInput("")
    window.setTimeout(() => {
      setActivity((prev) => [...prev, { type: "assistant", title: "Mock response", detail: "That is a mock reply. No agent was run.", status: "completed" }])
    }, 600)
  }, [])

  const statusConfig: Record<CodeState, { icon: React.ComponentType<{ className?: string }>; label: string; color: string }> = {
    empty: { icon: AlertCircleIcon, label: "No session", color: "muted" },
    working: { icon: ClockIcon, label: "Working…", color: "primary" },
    completed: { icon: CheckCircleIcon, label: "Completed", color: "success" },
    failed: { icon: XCircleIcon, label: "Failed", color: "destructive" },
    unavailable: { icon: AlertCircleIcon, label: "Unavailable", color: "destructive" },
    long: { icon: ClockIcon, label: "Long history", color: "primary" },
    error: { icon: AlertCircleIcon, label: "Error", color: "destructive" },
  }

  const renderContent = () => {
    const cfg = statusConfig[state]
    switch (state) {
      case "empty":
        return (
          <PaneEmpty
            icon={CodeXmlIcon}
            title="No session yet"
            description="Start a coding session below."
          />
        )
      case "unavailable":
        return (
          <PaneUnavailable
            title="No session connected"
            description="Open or create a session to begin."
          />
        )
      case "error":
        return (
          <PaneError
            title="Session error"
            description="The session could not be loaded."
            onRetry={() => setState("working")}
          />
        )
      case "working":
      case "completed":
      case "failed":
      case "long":
        return (
          <div className="flex min-h-0 flex-1 flex-col">
            <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
              <div className="flex flex-col gap-3 p-3">
                {(state === "long" ? LONG_ACTIVITY : activity).map((a, i) => (
                  <div
                    key={i}
                    className={cn(
                      "flex items-start gap-3 px-3 py-2 text-sm rounded-lg",
                      a.status === "running" && "bg-primary/10",
                      a.status === "failed" && "bg-destructive/10",
                    )}
                  >
                    <div className="shrink-0 w-6 h-6 flex items-center justify-center rounded bg-muted">
                      {a.type === "file_read" && <TerminalIcon className="size-3 text-muted-foreground" />}
                      {a.type === "file_write" && <CodeXmlIcon className="size-3 text-muted-foreground" />}
                      {a.type === "terminal" && <TerminalIcon className="size-3 text-muted-foreground" />}
                      {a.type === "diff" && <GitBranchIcon className="size-3 text-muted-foreground" />}
                      {a.type === "user" && <ClockIcon className="size-3 text-muted-foreground" />}
                      {a.type === "assistant" && <CodeXmlIcon className="size-3 text-muted-foreground" />}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className="font-medium truncate">{a.title}</span>
                        <Badge variant={a.status === "running" ? "default" : a.status === "failed" ? "destructive" : "success"} className="text-xs">
                          {a.status}
                        </Badge>
                      </div>
                      {a.detail && <p className="text-xs text-muted-foreground truncate">{a.detail}</p>}
                    </div>
                  </div>
                ))}
              </div>
            </div>
            <div className="shrink-0 border-t border-border p-2">
              <div className="flex items-center gap-2">
                <span className="text-xs text-muted-foreground flex items-center gap-1">
                  <cfg.icon className="size-3" />
                  <span className="font-medium">{cfg.label}</span>
                </span>
              </div>
              <div className="flex items-end gap-2 mt-1">
                <Textarea
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !e.shiftKey) {
                      e.preventDefault()
                      send()
                    }
                  }}
                  placeholder="Send a message to the session…"
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
        )
    }
  }

  return (
    <Pane
      id={paneId}
      type="code-session"
      title="Code Session"
      icon={CodeXmlIcon}
      context="tavi / uiux-workspace"
      active
      onClose={() => {}}
    >
      <div className="flex min-h-0 flex-1 flex-col">
        <div className="flex shrink-0 items-center gap-2 border-b border-border px-2 py-1.5">
          <span className="text-xs text-muted-foreground">State:</span>
          {(["empty", "working", "completed", "failed", "unavailable", "long"] as CodeState[]).map(
            (s) => (
              <button
                key={s}
                type="button"
                onClick={() => setState(s)}
                className={cn(
                  "rounded px-1.5 py-0.5 text-xs",
                  state === s ? "bg-muted text-foreground" : "text-muted-foreground hover:text-foreground",
                )}
              >
                {s}
              </button>
            ),
          )}
        </div>
        <div className="min-h-0 flex-1">{renderContent()}</div>
      </div>
    </Pane>
  )
}