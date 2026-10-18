"use client"

import * as React from "react"
import {
  IconBug,
  IconBulb,
  IconCode,
  IconFileText,
  IconFolder,
  IconFolderOpen,
  IconHistory,
  IconListCheck,
  IconMessageCircle,
  IconMarkdown,
  IconPaperclip,
  IconPencil,
  IconPencilPlus,
  IconTrash,
} from "@tabler/icons-react"

import {
  forgetFolder,
  listProjectFiles,
  listRecentFolders,
  pickFolder,
  readFileText,
  restoreFolder,
  supportsDirectoryPicker,
  type DirHandle,
  type ProjectFile,
  type RecentFolder,
} from "@/lib/fs-access"
import {
  createSession,
  deleteSession,
  formatWhen,
  listSessions,
  saveSession,
  type StoredSession,
  type StoredTurn,
} from "@/lib/sessions"
import { easeOut, prefersReducedMotion } from "@/lib/motion"
import { cn } from "@/lib/utils"

import {
  Attachment,
  AttachmentContent,
  AttachmentMedia,
  AttachmentTitle,
} from "@/components/attachment"
import { Bubble, BubbleContent } from "@/components/bubble"
import { Button } from "@/components/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from "@/components/dropdown-menu"
import { Message, MessageContent } from "@/components/message"
import {
  MessageScroller,
  MessageScrollerButton,
  MessageScrollerContent,
  MessageScrollerItem,
  MessageScrollerProvider,
  MessageScrollerViewport,
} from "@/components/message-scroller"
import { ToggleGroup, ToggleGroupItem } from "@/components/toggle-group"

import { StreamingText } from "./streaming-text"
import {
  PromptInputContextUsage,
  PromptInputDictation,
  PromptInputFooter,
  PromptInputInset,
  PromptInputMeta,
  PromptInputMeter,
  PromptInputModel,
  PromptInputSelect,
  PromptInputSuggestions,
  type PromptEffort,
  type PromptModel,
  type PromptOption,
  type PromptTokenPricing,
  type PromptTokenUsage,
} from "./prompt-controls"
import {
  PromptInput,
  PromptInputActions,
  PromptInputAttachments,
  PromptInputBody,
  PromptInputQueue,
  PromptInputSubmit,
  PromptInputTextarea,
  PromptInputTools,
  type PromptMessage,
  type PromptStatus,
} from "./prompt-input"
import { PromptInputMenu, type PromptMenuItem } from "./prompt-menu"
import { countLines } from "./text"
import {
  type PromptFile,
  type PromptUpload,
} from "./use-prompt-files"

const efforts: PromptEffort[] = [
  { value: "low", label: "Low" },
  { value: "medium", label: "Medium" },
  { value: "high", label: "High" },
  { value: "extra", label: "Extra high" },
  { value: "max", label: "Max" },
]

/**
 * Each mode carries the system prompt that is actually sent with the request,
 * so switching modes changes how the model behaves rather than only how the
 * button reads. The descriptions state what the model is told to do.
 */
type ModeDefinition = PromptOption & { instruction: string; placeholder: string }

const MODES: ModeDefinition[] = [
  {
    value: "code",
    label: "Code",
    icon: <IconCode />,
    description: "Proposes file edits and commands",
    placeholder: "Describe a change to make",
    instruction:
      "You are helping with a real local repository. You have no tools: you cannot " +
      "run commands, browse the folder, or write files, and you can only see the files " +
      "inlined with the request. Describe the commands you would run rather than " +
      "implying you ran them. When you propose a change, give the exact edit as a " +
      "unified diff or a complete file body, and name every path involved. Prefer the " +
      "smallest change that fully solves the problem, and say so plainly if something " +
      "is ambiguous rather than guessing.",
  },
  {
    value: "plan",
    label: "Plan",
    icon: <IconListCheck />,
    description: "Investigates, then proposes steps before acting",
    placeholder: "What should we plan?",
    instruction:
      "Do not propose edits yet. Investigate only the code and files you were given, " +
      "then reply with an ordered plan: which files to touch, what changes in each, " +
      "and the order to apply them. Name anything you could not verify from the " +
      "material provided.",
  },
  {
    value: "ask",
    label: "Ask",
    icon: <IconMessageCircle />,
    description: "Answers without editing anything",
    placeholder: "Ask about the codebase",
    instruction:
      "Answer the question directly and do not propose edits. If the answer depends " +
      "on code you were not shown, say which file you would need and stop there " +
      "rather than inventing its contents.",
  },
]

const modeFor = (value: string) => MODES.find((mode) => mode.value === value) ?? MODES[0]

const placeholders: Record<string, string> = Object.fromEntries(
  MODES.map((mode) => [mode.value, mode.placeholder]),
)

type Variant = "chat" | "agent"

/**
 * Lists threads that actually exist. Clicking one loads it; the running dot is
 * driven by the live stream, not by a hardcoded flag, so it appears on exactly
 * one row and only while a reply is streaming.
 */
function SessionsMenu({
  sessions,
  activeId,
  runningId,
  onOpen,
  onNew,
  onDelete,
}: {
  sessions: StoredSession[]
  activeId: string | null
  runningId: string | null
  onOpen: (id: string) => void
  onNew: () => void
  onDelete: (id: string) => void
}) {
  const active = sessions.find((session) => session.id === activeId)

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <Button
            type="button"
            size="sm"
            variant="ghost"
            shape="pill"
            className="ms-auto"
          />
        }
      >
        <IconHistory data-icon="inline-start" />
        Sessions
      </DropdownMenuTrigger>
      <DropdownMenuContent side="top" align="end" sideOffset={8} className="w-72">
        <DropdownMenuItem onClick={onNew}>
          <IconPencilPlus />
          New chat
        </DropdownMenuItem>
        <DropdownMenuLabel>
          {sessions.length === 0 ? "No saved sessions" : "Recent sessions"}
        </DropdownMenuLabel>
        {sessions.length === 0 ? (
          <p className="text-muted-foreground px-2 py-2 text-sm">
            Threads you start are saved here and survive a reload.
          </p>
        ) : (
          sessions.map((session) => {
            const running = session.id === runningId
            return (
              <DropdownMenuItem
                key={session.id}
                onClick={() => onOpen(session.id)}
                className={cn(session.id === activeId && "bg-accent")}
              >
                <span
                  aria-hidden="true"
                  className={
                    running
                      ? "size-1.5 shrink-0 rounded-full bg-success motion-safe:animate-pulse"
                      : "size-1.5 shrink-0 rounded-full bg-muted-foreground/40"
                  }
                />
                <span className="min-w-0 flex-1">
                  <span className="block truncate">{session.title}</span>
                  <span className="text-muted-foreground block truncate text-xs">
                    {[session.model, session.folder].filter(Boolean).join(" · ") ||
                      "No model"}
                  </span>
                </span>
                <span className="text-muted-foreground shrink-0 text-xs tabular-nums">
                  {running ? "Running" : formatWhen(session.updatedAt)}
                </span>
              </DropdownMenuItem>
            )
          })
        )}
        {active && active.turns.length > 0 ? (
          <>
            <DropdownMenuLabel>Manage</DropdownMenuLabel>
            <DropdownMenuItem
              onClick={() => onDelete(active.id)}
              className="text-destructive"
            >
              <IconTrash />
              Delete this thread
            </DropdownMenuItem>
          </>
        ) : null}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

/*
 * Commands expand to a real instruction at the caret. They do not run anything;
 * they are prompt scaffolds, and the description says so.
 */
const commands: PromptMenuItem[] = [
  { value: "explain", label: "explain", description: "Walk through code step by step", icon: <IconBulb />, insert: "explain " },
  { value: "fix", label: "fix", description: "Find the cause and propose a minimal fix", icon: <IconBug />, insert: "find the cause of this and propose the smallest fix: " },
  { value: "test", label: "test", description: "Write tests covering the given code", icon: <IconListCheck />, insert: "write tests that cover this, including the failure cases: " },
  { value: "review", label: "review", description: "Review for bugs and edge cases", icon: <IconBug />, insert: "review this for bugs and edge cases: " },
  { value: "plan", label: "plan", description: "Break the work into ordered steps", icon: <IconListCheck />, insert: "plan the steps to " },
]

/**
 * Empty-state prompts. With a folder picked these name files that really exist
 * in it; without one they stay generic instead of implying a codebase is
 * attached when none is. `@path` is resolved to file contents at send time.
 */
const suggestionsFor = (folder: RecentFolder | null, files: ProjectFile[]) => {
  if (!folder) {
    return [
      { label: "What can you do?", prompt: "What can you help with here?", icon: <IconBulb data-icon="inline-start" /> },
      { label: "Draft a better prompt", prompt: "Help me write a clear prompt for the task I care about: ", icon: <IconPencil data-icon="inline-start" /> },
      { label: "Explain a concept", prompt: "Explain ", icon: <IconListCheck data-icon="inline-start" /> },
    ]
  }
  const target = files[0]
  const second = files[1]
  return [
    { label: `Explain ${target?.name ?? "this project"}`, prompt: target ? `@${target.path} explain what this does and why it exists` : "Explain how this project is laid out", icon: <IconBulb data-icon="inline-start" /> },
    { label: `Review ${second?.name ?? "the folder"}`, prompt: second ? `@${second.path} review this for bugs and edge cases` : "Review this folder for problems", icon: <IconBug data-icon="inline-start" /> },
    { label: "Plan a change", prompt: target ? `@${target.path} plan the steps to ` : "plan the steps to ", icon: <IconListCheck data-icon="inline-start" /> },
  ]
}

type Turn =
  | { id: string; role: "user"; message: PromptMessage }
  | { id: string; role: "assistant"; text: string; streaming: boolean; stopped?: boolean }
  /** A model-written summary of everything above it; sent with later requests. */
  | { id: string; role: "summary"; text: string }

/** Matches a typed `@path/to/file.ext` so it resolves like one from the menu. */
const AT_REFERENCE = /@([\w./-]*[\w-]+\.[a-z0-9]{1,8})/gi

const MAX_ATTACHMENT_BYTES = 400 * 1024

/**
 * Reads an attachment into the prompt. Anything binary or oversized is stated
 * plainly rather than dropped, so the model knows it was referenced.
 */
const attachmentText = async (file: PromptFile): Promise<string> => {
  if (file.pasted?.text) return file.pasted.text
  try {
    const blob = file.file
    if (blob.size > MAX_ATTACHMENT_BYTES) return "[Attached file is too large to inline.]"
    const textual =
      blob.type.startsWith("text/") ||
      /^application\/(json|xml|yaml|javascript|typescript|toml)$/.test(blob.type)
    if (!textual) return "[Attached file is not text and was not sent.]"
    return await blob.text()
  } catch {
    return "[Attached file could not be read.]"
  }
}

/**
 * The system prompt actually sent for a mode. The folder line is explicit that
 * the model can read what is inlined but cannot browse or write, because the
 * alternative is a model claiming to have edited files it never touched.
 */
const buildSystem = (modeValue: string, folderName: string | null) => {
  const parts = [modeFor(modeValue).instruction]
  if (folderName) {
    parts.push(
      `The user has opened the local folder "${folderName}". File contents inlined ` +
        `below were read from it before the request was sent. You cannot browse that ` +
        `folder, run commands, or write to it — say so plainly instead of implying ` +
        `that you did.`,
    )
  }
  return parts.join("\n\n")
}

/** Posts to the chat route and returns the whole reply as plain text. */
const askForText = async (body: unknown, signal?: AbortSignal): Promise<string> => {
  const response = await fetch("/api/chat", {
    method: "POST",
    headers: { "content-type": "application/json" },
    signal,
    body: JSON.stringify(body),
  })
  if (!response.ok) {
    const detail = (await response.json().catch(() => null)) as { error?: string } | null
    throw new Error(detail?.error ?? `HTTP ${response.status}`)
  }
  if (!response.body) throw new Error("No response body")

  const reader = response.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ""
  let out = ""
  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    buffer += decoder.decode(value, { stream: true })
    const lines = buffer.split("\n")
    buffer = lines.pop() ?? ""
    for (const line of lines) {
      if (!line.startsWith("data:")) continue
      const payload = line.slice(5).trim()
      if (!payload || payload === "[DONE]") continue
      try {
        const event = JSON.parse(payload) as { type?: string; delta?: string }
        if (event.type === "text-delta" && event.delta) out += event.delta
      } catch {
        /* partial JSON, wait for more */
      }
    }
  }
  return out.trim()
}

/**
 * Turns an outgoing user message into what the model actually receives: the
 * text, plus the real contents of anything it points at. A file that cannot be
 * read says so in place, rather than the message silently losing its context.
 */
const expandUserTurn = async (
  message: PromptMessage,
  known: ProjectFile[],
): Promise<string> => {
  const blocks: string[] = []
  if (message.text.trim()) blocks.push(message.text.trim())

  const paths = new Set<string>()
  const byPath = new Map(known.map((file) => [file.path, file]))
  for (const mention of message.mentions) {
    if (byPath.has(mention.id)) paths.add(mention.id)
  }
  for (const match of message.text.matchAll(AT_REFERENCE)) {
    const path = match[1]
    if (byPath.has(path)) paths.add(path)
  }

  for (const path of paths) {
    const entry = byPath.get(path)
    if (!entry) continue
    const text = await readFileText(entry)
    blocks.push(
      text === null
        ? `--- ${path} ---\n[Could not be read as text, or exceeds the inline size limit.]`
        : `--- ${path} ---\n${text}`,
    )
  }

  for (const file of message.files) {
    blocks.push(`--- ${file.name} ---\n${await attachmentText(file)}`)
  }

  return blocks.join("\n\n")
}

/** Captures attachment text so a restored thread still carries its context. */
const toStoredTurns = async (list: Turn[], known: ProjectFile[]): Promise<StoredTurn[]> =>
  Promise.all(
    list.map(async (turn): Promise<StoredTurn> => {
      if (turn.role === "summary") return { id: turn.id, role: "summary", text: turn.text }
      if (turn.role === "assistant") {
        return {
          id: turn.id,
          role: "assistant",
          text: turn.text,
          ...(turn.stopped ? { stopped: true } : {}),
        }
      }
      const files = await Promise.all(
        turn.message.files.map(async (file) => ({
          name: file.name,
          size: file.size,
          text: (await attachmentText(file)).slice(0, 20_000),
        })),
      )
      return {
        id: turn.id,
        role: "user",
        text: turn.message.text,
        files,
        mentions: turn.message.mentions.map((mention) => ({
          label: mention.label,
          ...(known.some((file) => file.path === mention.id) ? { path: mention.id } : {}),
        })),
      }
    }),
  )

/**
 * Rebuilds the view's turns from storage. Attachment text is restored through
 * `pasted`, which `attachmentText` reads first — the original `File` object
 * cannot survive a reload, and re-reading an empty blob would send nothing.
 */
const fromStoredTurns = (list: StoredTurn[]): Turn[] =>
  list.map((turn) => {
    if (turn.role === "summary") return { id: turn.id, role: "summary", text: turn.text }
    if (turn.role === "assistant") {
      return {
        id: turn.id,
        role: "assistant",
        text: turn.text,
        streaming: false,
        ...(turn.stopped ? { stopped: true } : {}),
      }
    }
    return {
      id: turn.id,
      role: "user",
      message: {
        text: turn.text,
        files: turn.files.map((file, index) => ({
          id: `${turn.id}-f${index}`,
          file: new File([], file.name),
          name: file.name,
          size: file.size,
          type: "text/plain",
          state: "done" as const,
          ...(file.text !== undefined
            ? { pasted: { text: file.text, lines: countLines(file.text) } }
            : {}),
        })),
        mentions: turn.mentions.map((mention, index) => ({
          id: mention.path ?? `${turn.id}-m${index}`,
          label: mention.label,
        })),
      },
    }
  })

/**
 * Attachments are accepted locally; their text is read at send time and inlined
 * into the prompt by `expandUserTurn`, so nothing needs an upload endpoint.
 */
const upload: PromptUpload = async (file) => ({ name: file.name })

function UserTurn({ message }: { message: PromptMessage }) {
  const chips = [
    ...message.mentions.map((mention) => ({ id: mention.id, label: mention.label, icon: <IconFileText /> })),
    ...message.files.map((file) => ({ id: file.id, label: file.name, icon: <IconPaperclip /> })),
  ]

  return (
    <Message align="end">
      <MessageContent>
        {chips.length > 0 ? (
          <div className="flex flex-wrap justify-end gap-1.5">
            {chips.map((chip) => (
              <Attachment key={chip.id} size="xs">
                <AttachmentMedia>{chip.icon}</AttachmentMedia>
                <AttachmentContent>
                  <AttachmentTitle>{chip.label}</AttachmentTitle>
                </AttachmentContent>
              </Attachment>
            ))}
          </div>
        ) : null}
        {message.text ? (
          <Bubble variant="secondary">
            <BubbleContent className="whitespace-pre-wrap"><span className="text-base">{message.text}</span></BubbleContent>
          </Bubble>
        ) : null}
      </MessageContent>
    </Message>
  )
}

function useDock(ref: React.RefObject<HTMLElement | null>, docked: boolean) {
  const lastTop = React.useRef<number | null>(null)

  React.useLayoutEffect(() => {
    const element = ref.current
    if (!element) return
    const top = element.getBoundingClientRect().top
    const from = lastTop.current
    lastTop.current = top
    if (from === null || Math.abs(from - top) < 1 || prefersReducedMotion()) return
    element.animate(
      [{ translate: `0 ${from - top}px` }, { translate: "0 0" }],
      { duration: 480, easing: easeOut }
    )
  }, [docked, ref])
}

/**
 * The app surface: a conversation thread with the prompt block as its composer.
 *
 * Everything here is wired to something real. The model catalog and the stream
 * come from `/api`; token usage is the provider's own report on the last
 * finished turn; folders are ones the browser has actually granted access to;
 * threads are persisted. There is no mock path — the old `real={false}` branch
 * was unreachable and its invented data has been removed rather than kept.
 */
export function PromptBlock() {
  const [turns, setTurns] = React.useState<Turn[]>([])
  const [status, setStatus] = React.useState<PromptStatus>("ready")
  const [model, setModel] = React.useState("")
  const [effort, setEffort] = React.useState("medium")
  const [think, setThink] = React.useState(true)
  const [variant, setVariant] = React.useState<Variant>("agent")
  const [mode, setMode] = React.useState("code")
  const [realModels, setRealModels] = React.useState<PromptModel[]>([])
  const [realSpecs, setRealSpecs] = React.useState<
    Record<string, { limit: number | null; pricing: PromptTokenPricing }>
  >({})
  /** Token usage exactly as the provider reported it on the last finished turn. */
  const [usage, setUsage] = React.useState<PromptTokenUsage | null>(null)
  /** Which model the server says it called, so a mismatch can be shown. */
  const [servedModel, setServedModel] = React.useState<string | null>(null)
  /** Folders this browser has actually granted access to. Empty until one is picked. */
  const [folders, setFolders] = React.useState<RecentFolder[]>([])
  const [folderId, setFolderId] = React.useState<string | undefined>(undefined)
  const [projectFiles, setProjectFiles] = React.useState<ProjectFile[]>([])
  const [sessions, setSessions] = React.useState<StoredSession[]>([])
  const [activeSessionId, setActiveSessionId] = React.useState<string | null>(null)
  const [canPick, setCanPick] = React.useState(false)
  const [compacting, setCompacting] = React.useState(false)
  const abortRef = React.useRef<AbortController | null>(null)
  const dirRef = React.useRef<DirHandle | null>(null)
  const dockRef = React.useRef<HTMLDivElement>(null)
  /** Mirrors `activeSessionId` so async work always sees the current value. */
  const activeSessionRef = React.useRef<string | null>(null)
  const empty = turns.length === 0
  useDock(dockRef, !empty)

  const folder = folders.find((item) => item.id === folderId) ?? null
  const busy = status === "submitted" || status === "streaming"
  const modelOptions = realModels
  const lastUser = turns.findLast((turn) => turn.role === "user")

  /* The picker only exists in Chromium; elsewhere the UI says so instead of
     showing folders it cannot read. */
  React.useEffect(() => {
    setCanPick(supportsDirectoryPicker())
  }, [])

  /* Saved threads. Loaded once and refreshed whenever one is written. */
  React.useEffect(() => {
    setSessions(listSessions())
  }, [])

  React.useEffect(() => {
    void listRecentFolders().then(setFolders)
  }, [])

  /* Real model catalog from the backend, used only in the real app. */
  /* Model catalog from the backend. The server publishes no default, so
     something must be selected for the composer to be usable at all; that
     choice is named in the picker and can be changed, rather than applied
     behind the user's back on the server. */
  React.useEffect(() => {
    fetch("/api/models")
      .then((r) => r.json())
      .then((data) => {
        const list: Array<{
          id: string
          name: string
          free: boolean
          contextLength: number | null
          promptPrice: number
          completionPrice: number
        }> = data.models ?? []
        const free = list.filter((m) => m.free)
        const pool = free.length ? free : list
        setRealModels(
          pool.map((m) => ({ value: m.id, label: m.name.replace(/\s*\(free\)$/, "") }))
        )
        setRealSpecs(
          Object.fromEntries(
            pool.map((m) => [
              m.id,
              {
                // Left null when the provider does not publish a window, rather
                // than inventing one — the dial hides instead of lying.
                limit: m.contextLength ?? null,
                pricing: {
                  input: m.promptPrice ?? 0,
                  cachedInput: 0,
                  output: m.completionPrice ?? 0,
                },
              },
            ])
          )
        )
        // The server deliberately has no default, so something must be selected
        // for the composer to be usable at all. This one is named in the picker
        // and can be changed — it is a visible selection, not a substitution.
        setModel((current) =>
          pool.some((m) => m.id === current) ? current : pool[0]?.id ?? current,
        )
      })
      .catch(() => {})
  }, [])

  /* Re-acquire the picked folder and index its source files. A revoked or
     missing grant resolves to null, which clears the list rather than leaving
     stale paths behind. */
  React.useEffect(() => {
    if (!folderId) {
      dirRef.current = null
      setProjectFiles([])
      return
    }
    let cancelled = false
    void (async () => {
      const handle = await restoreFolder(folderId)
      if (cancelled) return
      dirRef.current = handle
      setProjectFiles(handle ? await listProjectFiles(handle) : [])
    })()
    return () => {
      cancelled = true
    }
  }, [folderId])

  /* Streams a reply from the chat route. */
  const respondReal = async (id: string, history: Turn[]) => {
    const controller = new AbortController()
    abortRef.current = controller
    /* Hoisted so the abort and failure paths can store what actually arrived. */
    let shown = ""

    try {
      /* Resolve every file the thread points at before the request goes out, so
         the model receives contents rather than filenames. */
      const outbound: {
        id: string
        role: "user" | "assistant"
        parts: { type: "text"; text: string }[]
      }[] = []

      for (const turn of history) {
        if (turn.role === "summary") continue
        if (turn.role === "assistant") {
          outbound.push({
            id: turn.id,
            role: "assistant",
            parts: [{ type: "text", text: turn.text }],
          })
          continue
        }
        outbound.push({
          id: turn.id,
          role: "user",
          parts: [{ type: "text", text: await expandUserTurn(turn.message, projectFiles) }],
        })
      }

      const response = await fetch("/api/chat", {
        method: "POST",
        headers: { "content-type": "application/json" },
        signal: controller.signal,
        body: JSON.stringify({
          messages: outbound,
          system: buildSystem(mode, folder?.name ?? null),
          config: {
            ...(model ? { modelName: model } : {}),
            ...(think && effort ? { reasoningEffort: effort } : {}),
          },
        }),
      })

      if (!response.ok) {
        const detail = (await response
          .json()
          .catch(() => null)) as { error?: string } | null
        throw new Error(detail?.error ?? `HTTP ${response.status}`)
      }
      if (!response.body) throw new Error("No response body")

      setStatus("streaming")
      setTurns((list) => [...list, { id, role: "assistant", text: "", streaming: true }])

      const reader = response.body.getReader()
      const decoder = new TextDecoder()
      let buffer = ""

      for (;;) {
        const { done, value } = await reader.read()
        if (done) break
        buffer += decoder.decode(value, { stream: true })
        const lines = buffer.split("\n")
        buffer = lines.pop() ?? ""
        for (const line of lines) {
          if (!line.startsWith("data:")) continue
          const payload = line.slice(5).trim()
          if (!payload || payload === "[DONE]") continue
          let event: {
            type?: string
            delta?: string
            error?: { message?: string }
            messageMetadata?: { modelId?: string; usage?: PromptTokenUsage }
          }
          try {
            event = JSON.parse(payload)
          } catch {
            /* partial JSON, wait for more */
            continue
          }

          const metadata = event.messageMetadata
          if (event.type === "message-metadata" && metadata?.modelId) {
            setServedModel(metadata.modelId)
          }
          /* The provider's own accounting for the turn that just ended. This is
             what the context dial reads — no estimate is involved. */
          if (event.type === "finish" && metadata?.usage) {
            setUsage(metadata.usage)
          }
          if (event.type === "error") {
            throw new Error(event.error?.message ?? "The stream reported an error")
          }

          if (event.type === "text-delta" && event.delta) {
            shown += event.delta
            const text = shown
            setTurns((list) =>
              list.map((turn) =>
                turn.id === id && turn.role === "assistant"
                  ? { ...turn, text, streaming: true }
                  : turn
              )
            )
          }
        }
      }

      /* Settle the turn from the text that actually arrived, then store it. The
         reply is persisted here as well as on send, because until this point
         only the user's half of the exchange exists. */
      const settled: Turn[] = [
        ...history,
        { id, role: "assistant", text: shown, streaming: false },
      ]
      setTurns(settled)
      setStatus("ready")
      void persist(settled)
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "unknown error"
      const settled: Turn[] =
        (error as Error).name === "AbortError"
          ? [...history, { id, role: "assistant", text: shown, streaming: false, stopped: true }]
          : [
              ...history,
              {
                id,
                role: "assistant",
                text: shown
                  ? `${shown}\n\n[Stopped: ${message}]`
                  : `Request failed: ${message}`,
                streaming: false,
              },
            ]
      setTurns(settled)
      setStatus("ready")
      void persist(settled)
    } finally {
      abortRef.current = null
    }
  }

  /* Writes the current thread to storage. Called once a turn settles, so a
     half-streamed reply is never stored as if it were complete. */
  /* Writes the current thread to storage. Called once a turn settles, so a
     half-streamed reply is never stored as if it were complete.
     The id comes from a ref rather than state: `persist` runs from inside an
     async stream that outlives the render which started it, so a state value
     captured at call time would still be stale and create a second thread. */
  const persist = async (next: Turn[]) => {
    const saved = saveSession(activeSessionRef.current, {
      turns: await toStoredTurns(next, projectFiles),
      model,
      effort: think ? effort : undefined,
      mode,
      folder: folder?.name,
    })
    activeSessionRef.current = saved.id
    setActiveSessionId(saved.id)
    setSessions(listSessions())
    return saved
  }

  const send = (message: PromptMessage) => {
    const id = `${Date.now()}`
    const next: Turn[] = [...turns, { id: `${id}-user`, role: "user", message }]
    setTurns(next)
    setStatus("submitted")
    void persist(next)
    void respondReal(`${id}-assistant`, next)
  }

  const stop = () => {
    abortRef.current?.abort()
    abortRef.current = null
    setStatus("ready")
    /* Settled outside the updater: updaters must stay pure, and React may run
       one twice in development, which would store the thread twice. */
    const settled = turns.map((turn) =>
      turn.role === "assistant" && turn.streaming
        ? { ...turn, streaming: false, stopped: true }
        : turn,
    )
    setTurns(settled)
    void persist(settled)
  }

  /* Opens a folder the browser will actually grant us, and keeps it in recents.
     Nothing is inserted that this app has not been given access to read. */
  const browse = async () => {
    const picked = await pickFolder()
    if (!picked) return
    setFolders(await listRecentFolders())
    setFolderId(picked.name)
  }

  const chooseFolder = (id: string) => {
    setFolderId((current) => (current === id ? undefined : id))
  }

  const forget = async (id: string) => {
    await forgetFolder(id)
    setFolders(await listRecentFolders())
    if (folderId === id) setFolderId(undefined)
  }

  const newSession = () => {
    abortRef.current?.abort()
    abortRef.current = null
    setTurns([])
    setUsage(null)
    setServedModel(null)
    setStatus("ready")
    activeSessionRef.current = null
    setActiveSessionId(null)
  }

  const openSession = (id: string) => {
    const session = listSessions().find((item) => item.id === id)
    if (!session) return
    abortRef.current?.abort()
    abortRef.current = null
    setTurns(fromStoredTurns(session.turns))
    setUsage(null)
    setServedModel(null)
    setStatus("ready")
    activeSessionRef.current = session.id
    setActiveSessionId(session.id)
    if (session.model) setModel(session.model)
    if (session.effort) setEffort(session.effort)
    if (session.mode) setMode(session.mode)
    setFolderId((current) =>
      folders.some((item) => item.name === session.folder) ? session.folder : current,
    )
  }

  const removeSession = (id: string) => {
    deleteSession(id)
    setSessions(listSessions())
    if (activeSessionRef.current === id) {
      activeSessionRef.current = null
      setActiveSessionId(null)
    }
  }

  /* Header "New chat": same as the menu's, and it leaves the thread stored. */
  const reset = () => {
    newSession()
    requestAnimationFrame(() =>
      dockRef.current?.querySelector("textarea")?.focus()
    )
  }

  /**
   * Real compaction. Asks the model to summarise the turns being dropped, then
   * folds them into one summary turn. That summary is carried into later
   * requests, so this reduces the real context rather than just hiding rows.
   */
  const compact = async (): Promise<void> => {
    const KEEP = 6
    const cut = turns.length - KEEP
    if (cut <= 0 || !model || compacting) return

    const transcript = turns
      .slice(0, cut)
      .map((turn) =>
        turn.role === "user"
          ? `User: ${turn.message.text}`
          : turn.role === "assistant"
            ? `Assistant: ${turn.text}`
            : "",
      )
      .filter(Boolean)
      .join("\n\n")
    if (!transcript.trim()) return

    setCompacting(true)
    try {
      const summary = await askForText({
        messages: [
          {
            id: "compact",
            role: "user",
            parts: [
              {
                type: "text",
                text:
                  "Summarise this conversation so a different assistant can continue it " +
                  "without seeing the original. Keep decisions made, file paths touched, " +
                  "what is already done, and what is still open. Be specific. Drop " +
                  "pleasantries.\n\n" +
                  transcript,
              },
            ],
          },
        ],
        config: { modelName: model },
      })
      if (!summary) return
      const next: Turn[] = [
        { id: `${Date.now()}-summary`, role: "summary", text: summary },
        ...turns.slice(cut),
      ]
      setTurns(next)
      setUsage(null)
      await persist(next)
    } catch {
      // Leave the thread untouched; a failed compaction should cost nothing.
    } finally {
      setCompacting(false)
    }
  }

  /* Context accounting comes from the provider's own report on the last
     finished turn. Nothing here is estimated from character counts. */
  const spec = realSpecs[model] ?? {
    limit: null,
    pricing: { input: 0, cachedInput: 0, output: 0 },
  }
  const suggested = suggestionsFor(folder, projectFiles)

  const folderOptions: PromptOption[] = folders.map((item) => ({
    value: item.id,
    label: item.name,
    icon: <IconFolder />,
  }))

  /* The @ menu lists only files that exist in the folder this browser has been
     granted. With no folder there is nothing to list, so it is not rendered. */
  const fileMenu: PromptMenuItem[] = projectFiles.slice(0, 200).map((file) => ({
    value: file.path,
    label: file.name,
    hint: file.path.includes("/")
      ? file.path.slice(0, file.path.lastIndexOf("/"))
      : undefined,
    icon: /\.mdx?$/i.test(file.name) ? <IconMarkdown /> : <IconFileText />,
  }))

  /**
   * The dial needs a real window size and real usage. With neither it is not
   * rendered. When usage is known but the provider does not publish a context
   * window, the raw token count is shown instead of a meaningless ratio.
   */
  const contextDial = spec.limit ? (
    <PromptInputContextUsage
      usage={usage ?? undefined}
      limit={spec.limit}
      model={modelOptions.find((item) => item.value === model)?.label}
      pricing={spec.pricing}
      onCompact={compact}
    />
  ) : usage?.totalTokens ? (
    <span
      className="text-muted-foreground text-xs tabular-nums"
      title="Tokens used; this provider does not publish a context window"
    >
      {usage.totalTokens.toLocaleString()} tokens
    </span>
  ) : null

  return (
    <MessageScrollerProvider autoScroll>
      <main className="flex h-svh flex-col bg-background">
        <header className="grid h-14 shrink-0 grid-cols-[1fr_auto_1fr] items-center gap-2 px-4">
          <ToggleGroup
            className="col-start-2"
            aria-label="Composer"
            size="sm"
            value={[variant]}
            onValueChange={(next) => {
              const [value] = next as Variant[]
              if (value) setVariant(value)
            }}
          >
            <ToggleGroupItem value="chat">Chat</ToggleGroupItem>
            <ToggleGroupItem value="agent">Agent</ToggleGroupItem>
          </ToggleGroup>
          {empty ? null : (
            <Button variant="ghost" size="sm" onClick={reset} className="justify-self-end">
              New chat
            </Button>
          )}
        </header>
        {empty ? (
          <div key="intro" className="flex flex-1 flex-col items-center justify-end px-4 pb-7">
            <h1 className="text-center text-2xl font-normal text-balance motion-safe:animate-in motion-safe:animation-duration-500 motion-safe:fade-in-0">
              What are we working on?
            </h1>
          </div>
        ) : (
          <MessageScroller key="thread" className="min-h-0 flex-1">
            <MessageScrollerViewport tabIndex={-1} aria-label="Conversation">
              <MessageScrollerContent aria-busy={status === "streaming"}>
                <div className="mx-auto flex w-full max-w-3xl min-w-0 flex-col gap-6 pt-2 pb-10">
                  {turns.map((turn) =>
                    turn.role === "summary" ? (
                      <p
                        key={turn.id}
                        className="flex items-center gap-3 text-xs text-muted-foreground before:h-px before:flex-1 before:bg-border after:h-px after:flex-1 after:bg-border motion-safe:animate-in motion-safe:fade-in-0"
                      >
                        Earlier messages summarized
                      </p>
                    ) : (
                    <MessageScrollerItem
                      key={turn.id}
                      messageId={turn.id}
                      scrollAnchor={turn.role === "user"}
                    >
                      <div className="p-px">
                        {turn.role === "user" ? (
                          <UserTurn message={turn.message} />
                        ) : (
                          <div className="flex flex-col gap-2">
                            <StreamingText
                              text={turn.text}
                              streaming={turn.streaming}
                              className="text-base/relaxed"
                            />
                            {turn.stopped ? (
                              <p className="text-xs text-muted-foreground">Stopped</p>
                            ) : null}
                          </div>
                        )}
                      </div>
                    </MessageScrollerItem>
                    )
                  )}
                </div>
              </MessageScrollerContent>
            </MessageScrollerViewport>
            <MessageScrollerButton />
          </MessageScroller>
        )}
        <div
          key="composer"
          ref={dockRef}
          className="mx-auto w-full max-w-3xl shrink-0 px-4 pb-3"
        >
          <PromptInput
            status={status}
            onSubmit={send}
            onStop={stop}
            onEditLast={() =>
              lastUser?.role === "user" ? lastUser.message.text : undefined
            }
            upload={upload}
            accept="image/*,.pdf,.txt,.md,.csv,.json,.ts,.tsx,.js,.jsx,.py,.go,.rs"
            maxFileSize={10 * 1024 * 1024}
            maxLength={8000}
            draftKey="acme-prompt-input-demo"
            layout={variant === "agent" ? "expanded" : "auto"}
            globalDrop
            focusOnType
          >
            <PromptInputQueue />
            {variant === "agent" ? (
              <PromptInputInset>
                <PromptInputBody>
                  <PromptInputAttachments />
                  <PromptInputTools>
                    <PromptInputSelect
                      label="Mode"
                      options={MODES}
                      value={mode}
                      onValueChange={setMode}
                      shortcut="alt+m"
                    />
                  </PromptInputTools>
                  <PromptInputTextarea
                    autoFocus
                    placeholder={placeholders[mode]}
                    className="min-h-16"
                  />
                  <PromptInputActions>
                    <PromptInputModel
                      models={modelOptions}
                      model={model}
                      onModelChange={setModel}
                      levels={efforts}
                      effort={effort}
                      onEffortChange={setEffort}
                      recommended="medium"
                      thinking={think}
                      onThinkingChange={setThink}
                    />
                    {contextDial}
                    <PromptInputSubmit />
                  </PromptInputActions>
                </PromptInputBody>
                <PromptInputFooter>
                  {canPick ? (
                    <PromptInputSelect
                      label="Folder"
                      heading="Recent"
                      options={folderOptions}
                      value={folderId}
                      onValueChange={chooseFolder}
                      placeholder="Choose folder"
                      icon={<IconFolderOpen />}
                    >
                      <DropdownMenuItem onClick={() => void browse()}>
                        <IconFolderOpen />
                        Open folder…
                      </DropdownMenuItem>
                      {folder ? (
                        <DropdownMenuItem onClick={() => void forget(folder.id)}>
                          <IconTrash />
                          Forget {folder.name}
                        </DropdownMenuItem>
                      ) : null}
                    </PromptInputSelect>
                  ) : (
                    <span className="text-muted-foreground me-auto text-xs">
                      Folder access needs a Chromium-based browser
                    </span>
                  )}
                  <SessionsMenu
                    sessions={sessions}
                    activeId={activeSessionId}
                    runningId={busy ? activeSessionId : null}
                    onOpen={openSession}
                    onNew={newSession}
                    onDelete={removeSession}
                  />
                </PromptInputFooter>
              </PromptInputInset>
            ) : (
            <PromptInputBody>
              <PromptInputAttachments />
              <PromptInputTextarea autoFocus placeholder="Ask anything" />
              <PromptInputActions>
                <PromptInputMeter />
                <PromptInputDictation autoSend />
                <PromptInputSubmit />
              </PromptInputActions>
            </PromptInputBody>
            )}
            {variant === "chat" ? (
            <PromptInputMeta>
              <PromptInputModel
                models={modelOptions}
                model={model}
                onModelChange={setModel}
                levels={efforts}
                effort={effort}
                onEffortChange={setEffort}
                recommended="medium"
                thinking={think}
                onThinkingChange={setThink}
              />
              {contextDial}
            </PromptInputMeta>
            ) : null}
            {empty ? <PromptInputSuggestions suggestions={suggested} className="pt-3" /> : null}
            {fileMenu.length > 0 ? (
              <PromptInputMenu trigger="@" items={fileMenu} label="Files" />
            ) : null}
            <PromptInputMenu trigger="/" items={commands} />
          </PromptInput>
        </div>
        {empty ? <div key="outro" className="flex-1" /> : null}
      </main>
    </MessageScrollerProvider>
  )
}
