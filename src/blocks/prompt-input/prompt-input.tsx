"use client"

import * as React from "react"
import {
  ArrowUpIcon,
  FileTextIcon,
  PaperclipIcon,
  SquareIcon,
  RefreshCwIcon,
  XIcon,
} from "lucide-react"
import { cn } from "cn"

import { prefersReducedMotion, useSizeMorph } from "@/lib/motion"

import {
  Attachment,
  AttachmentAction,
  AttachmentActions,
  AttachmentContent,
  AttachmentDescription,
  AttachmentGroup,
  AttachmentMedia,
  AttachmentTitle,
  AttachmentTrigger,
} from "@/components/attachment"
import { Button } from "@/components/button"
import { useMergedRef } from "@/hooks/use-merged-ref"
import {
  Dialog,
  DialogBody,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/dialog"
import { KbdGroup } from "@/components/kbd"
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/tooltip"

import { haptic } from "./haptics"
import { formatBytes, insertText, isImeEnter } from "./text"
import {
  usePromptFiles,
  type PromptFile,
  type PromptFileOptions,
} from "./use-prompt-files"

type PromptStatus = "ready" | "submitted" | "streaming" | "error"

type PromptMention = {
  id: string
  label: string
  icon?: React.ReactNode
}

type PromptMessage = {
  text: string
  files: PromptFile[]
  mentions: PromptMention[]
}

type QueuedMessage = PromptMessage & { id: string }

type MenuHandle = {
  listId: string
  activeId?: string
  handleKey: (event: React.KeyboardEvent<HTMLTextAreaElement>) => boolean
}

type PromptInputContextValue = {
  text: string
  setText: (value: string) => void
  caret: number
  setCaret: (value: number) => void
  focused: boolean
  setFocused: (value: boolean) => void
  expanded: boolean
  setExpanded: (value: boolean) => void
  layout: "auto" | "compact" | "expanded"
  textareaRef: React.RefObject<HTMLTextAreaElement | null>
  groupRef: React.RefObject<HTMLDivElement | null>
  status: PromptStatus
  busy: boolean
  disabled: boolean
  submitOn: "enter" | "mod+enter"
  maxLength?: number
  pasteLimit: number | false
  files: PromptFile[]
  addFiles: (files: File[], extra?: { pasted?: string }) => void
  removeFile: (id: string) => void
  retryFile: (id: string) => void
  openFileDialog: () => void
  mentions: PromptMention[]
  addMention: (mention: PromptMention) => void
  removeMention: (id: string) => void
  tools: number
  registerTool: () => () => void
  queue: QueuedMessage[]
  removeQueued: (id: string) => void
  sendQueuedNow: (id: string) => void
  submit: () => void
  stop?: () => void
  onEditLast?: () => string | void
  menu: MenuHandle | null
  setMenu: (menu: MenuHandle | null) => void
  dragging: boolean
  globalDrop: boolean
  announce: (message: string) => void
  hintId: string
  canSubmit: boolean
  blockedReason: string | null
}

const PromptInputContext = React.createContext<PromptInputContextValue | null>(
  null
)

function usePromptInput(part = "usePromptInput") {
  const context = React.useContext(PromptInputContext)
  if (!context) {
    throw new Error(`${part} must be used within <PromptInput>.`)
  }
  return context
}

function subscribeCoarse(callback: () => void) {
  if (typeof window.matchMedia !== "function") return () => {}
  const query = window.matchMedia("(pointer: coarse)")
  query.addEventListener("change", callback)
  return () => query.removeEventListener("change", callback)
}

function readCoarse() {
  return (
    typeof window.matchMedia === "function" &&
    window.matchMedia("(pointer: coarse)").matches
  )
}

function useCoarsePointer() {
  return React.useSyncExternalStore(subscribeCoarse, readCoarse, () => false)
}

function shake(element: HTMLElement | null) {
  if (!element || prefersReducedMotion()) return
  element.removeAttribute("data-shake")
  void element.offsetWidth
  element.setAttribute("data-shake", "")
  setTimeout(() => element.removeAttribute("data-shake"), 400)
}

function hasFiles(event: DragEvent | React.DragEvent) {
  return Array.from(event.dataTransfer?.types ?? []).includes("Files")
}

function readDraft(key: string) {
  try {
    return window.localStorage.getItem(`prompt-draft:${key}`) ?? ""
  } catch {
    return ""
  }
}

function writeDraft(key: string, value: string) {
  try {
    if (value) window.localStorage.setItem(`prompt-draft:${key}`, value)
    else window.localStorage.removeItem(`prompt-draft:${key}`)
  } catch {}
}

function isPrintable(event: KeyboardEvent) {
  return (
    event.key.length === 1 &&
    event.key !== " " &&
    !event.ctrlKey &&
    !event.metaKey &&
    !event.altKey &&
    !event.isComposing
  )
}

function isEditable(element: Element | null) {
  return (
    element instanceof HTMLElement &&
    (element.isContentEditable ||
      ["INPUT", "TEXTAREA", "SELECT"].includes(element.tagName))
  )
}

let queued = 0

type PromptInputProps = Omit<
  React.ComponentProps<"form">,
  "onSubmit" | "defaultValue"
> &
  PromptFileOptions & {
    onSubmit: (message: PromptMessage) => void | Promise<unknown>
    status?: PromptStatus
    onStop?: () => void
    onEditLast?: () => string | void
    value?: string
    defaultValue?: string
    onValueChange?: (value: string) => void
    submitOn?: "enter" | "mod+enter"
    pasteLimit?: number | false
    maxLength?: number
    draftKey?: string
    globalDrop?: boolean
    focusOnType?: boolean
    disabled?: boolean
    layout?: "auto" | "compact" | "expanded"
  }

function PromptInput({
  onSubmit,
  status = "ready",
  onStop,
  onEditLast,
  value,
  defaultValue = "",
  onValueChange,
  submitOn = "enter",
  pasteLimit = 5000,
  maxLength,
  draftKey,
  globalDrop = false,
  focusOnType = false,
  disabled = false,
  layout = "auto",
  accept,
  maxFiles,
  maxFileSize,
  upload,
  onReject,
  className,
  children,
  onDragEnter,
  onDragOver,
  onDragLeave,
  onDrop,
  ...props
}: PromptInputProps) {
  const [ownText, setOwnText] = React.useState(defaultValue)
  const text = value ?? ownText
  const [caret, setCaret] = React.useState(0)
  const [focused, setFocused] = React.useState(false)
  const [autoExpanded, setExpanded] = React.useState(false)
  const expanded = layout === "expanded" || (layout === "auto" && autoExpanded)
  const [mentions, setMentions] = React.useState<PromptMention[]>([])
  const [queue, setQueue] = React.useState<QueuedMessage[]>([])
  const [menu, setMenu] = React.useState<MenuHandle | null>(null)
  const [tools, setTools] = React.useState(0)
  const [dragging, setDragging] = React.useState(false)
  const [announcement, setAnnouncement] = React.useState("")
  const textareaRef = React.useRef<HTMLTextAreaElement | null>(null)
  const groupRef = React.useRef<HTMLDivElement | null>(null)
  const inputRef = React.useRef<HTMLInputElement>(null)
  const dragDepth = React.useRef(0)
  const hintId = React.useId()
  const busy = status === "submitted" || status === "streaming"

  const announce = React.useCallback((message: string) => {
    setAnnouncement((current) =>
      current === message ? `${message} ` : message
    )
  }, [])

  const setText = React.useCallback(
    (next: string) => {
      if (value === undefined) setOwnText(next)
      onValueChange?.(next)
    },
    [value, onValueChange]
  )

  const files = usePromptFiles({
    accept,
    maxFiles,
    maxFileSize,
    upload,
    onReject: (file, reason) => {
      announce(`${file.name || "File"} not added. ${reason}.`)
      onReject?.(file, reason)
    },
  })

  React.useEffect(() => {
    if (!draftKey) return
    const draft = readDraft(draftKey)
    if (draft) setText(draft)
  }, [draftKey])

  React.useEffect(() => {
    if (draftKey) writeDraft(draftKey, text)
  }, [draftKey, text])

  const addFiles = React.useCallback(
    (incoming: File[], extra?: { pasted?: string }) => {
      if (incoming.length === 0) return
      const { accepted } = files.add(incoming, extra)
      if (accepted.length > 0) {
        announce(
          extra?.pasted !== undefined
            ? "Long paste added as an attachment"
            : `${accepted.length} ${accepted.length === 1 ? "file" : "files"} attached`
        )
      }
    },
    [files, announce]
  )

  const restore = React.useCallback(
    (message: PromptMessage) => {
      const current = textareaRef.current?.value ?? ""
      setText(current ? `${message.text}\n${current}` : message.text)
      files.restore(message.files)
      setMentions((list) => [
        ...message.mentions,
        ...list.filter((item) => !message.mentions.some((m) => m.id === item.id)),
      ])
      announce("Couldn’t send. Your message is back in the box.")
    },
    [files, setText, announce]
  )

  const deliver = React.useCallback(
    (message: PromptMessage) => {
      try {
        const result = onSubmit(message)
        if (result && typeof result.then === "function") {
          result.then(undefined, () => restore(message))
        }
      } catch {
        restore(message)
      }
    },
    [onSubmit, restore]
  )

  React.useEffect(() => {
    if (busy || queue.length === 0) return
    const [first, ...rest] = queue
    setQueue(rest)
    deliver(first)
  }, [busy, queue, deliver])

  const uploading = files.files.some((file) => file.state === "uploading")
  const failed = files.files.some(
    (file) => file.state === "error" && file.retryable
  )
  const ready = files.files.filter((file) => file.state === "done")
  const over = maxLength !== undefined && text.length > maxLength
  const empty = !text.trim() && ready.length === 0 && mentions.length === 0
  const blockedReason = over
    ? `Your message is over ${maxLength!.toLocaleString()} characters`
    : uploading
      ? "Waiting for files to finish uploading"
      : failed
        ? "Retry or remove the files that didn’t upload"
        : null
  const canSubmit = !disabled && !empty && !blockedReason

  const submit = React.useCallback(() => {
    const field = textareaRef.current
    if (!canSubmit) {
      haptic("success")
      shake(groupRef.current)
      field?.focus()
      if (blockedReason) announce(blockedReason)
      return
    }
    haptic("tap")
    const message: PromptMessage = {
      text: text.trim(),
      files: files.take(),
      mentions,
    }
    setText("")
    setMentions([])
    if (draftKey) writeDraft(draftKey, "")
    if (busy) {
      queued += 1
      setQueue((list) => [...list, { ...message, id: `queued-${queued}` }])
      announce("Message queued. It sends when the reply finishes.")
    } else {
      deliver(message)
      announce("Message sent")
    }
    field?.focus()
  }, [
    canSubmit,
    blockedReason,
    text,
    files,
    mentions,
    busy,
    draftKey,
    setText,
    deliver,
    announce,
  ])

  const stop = React.useMemo(
    () =>
      onStop
        ? () => {
            haptic("tap")
            onStop()
            announce("Stopped")
            textareaRef.current?.focus()
          }
        : undefined,
    [onStop, announce]
  )

  const registerTool = React.useCallback(() => {
    setTools((count) => count + 1)
    return () => setTools((count) => count - 1)
  }, [])

  const sendQueuedNow = React.useCallback(
    (id: string) => {
      setQueue((list) => {
        const item = list.find((entry) => entry.id === id)
        return item ? [item, ...list.filter((entry) => entry.id !== id)] : list
      })
      onStop?.()
    },
    [onStop]
  )

  React.useEffect(() => {
    if (!focusOnType) return
    const onKey = (event: KeyboardEvent) => {
      const active = document.activeElement
      if (
        event.defaultPrevented ||
        !isPrintable(event) ||
        (active && active !== document.body) ||
        isEditable(active) ||
        document.querySelector("[aria-modal=true], [role=dialog][data-open]")
      ) {
        return
      }
      textareaRef.current?.focus()
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [focusOnType])

  React.useEffect(() => {
    if (!globalDrop || disabled) return
    let depth = 0
    const enter = (event: DragEvent) => {
      if (!hasFiles(event)) return
      depth++
      setDragging(true)
    }
    const over = (event: DragEvent) => {
      if (hasFiles(event)) event.preventDefault()
    }
    const leave = (event: DragEvent) => {
      if (!hasFiles(event)) return
      depth = Math.max(0, depth - 1)
      if (depth === 0) setDragging(false)
    }
    const drop = (event: DragEvent) => {
      if (!hasFiles(event)) return
      event.preventDefault()
      depth = 0
      setDragging(false)
      addFiles(Array.from(event.dataTransfer?.files ?? []))
      textareaRef.current?.focus()
    }
    window.addEventListener("dragenter", enter)
    window.addEventListener("dragover", over)
    window.addEventListener("dragleave", leave)
    window.addEventListener("drop", drop)
    return () => {
      window.removeEventListener("dragenter", enter)
      window.removeEventListener("dragover", over)
      window.removeEventListener("dragleave", leave)
      window.removeEventListener("drop", drop)
    }
  }, [globalDrop, disabled, addFiles])

  const context: PromptInputContextValue = {
    text,
    setText,
    caret,
    setCaret,
    focused,
    setFocused,
    expanded,
    setExpanded,
    layout,
    textareaRef,
    groupRef,
    status,
    busy,
    disabled,
    submitOn,
    maxLength,
    pasteLimit,
    files: files.files,
    addFiles,
    removeFile: files.remove,
    retryFile: files.retry,
    openFileDialog: () => inputRef.current?.click(),
    mentions,
    addMention: (mention) =>
      setMentions((list) =>
        list.some((item) => item.id === mention.id) ? list : [...list, mention]
      ),
    removeMention: (id) =>
      setMentions((list) => list.filter((item) => item.id !== id)),
    tools,
    registerTool,
    queue,
    removeQueued: (id) =>
      setQueue((list) => list.filter((item) => item.id !== id)),
    sendQueuedNow,
    submit,
    stop,
    onEditLast,
    menu,
    setMenu,
    dragging,
    globalDrop,
    announce,
    hintId,
    canSubmit,
    blockedReason,
  }

  return (
    <PromptInputContext.Provider value={context}>
      <form
        data-slot="prompt-input"
        data-status={status}
        className={cn(
          "relative flex min-w-0 flex-col gap-2 [--composer-radius:1.625rem] [--composer-radius-inner:calc(var(--composer-radius)-1px)] [--composer-radius-outer:calc(var(--composer-radius)+--spacing(1.5))]",
          className
        )}
        onSubmit={(event) => {
          event.preventDefault()
          submit()
        }}
        onDragEnter={(event) => {
          onDragEnter?.(event)
          if (globalDrop || disabled || !hasFiles(event)) return
          dragDepth.current++
          setDragging(true)
        }}
        onDragOver={(event) => {
          onDragOver?.(event)
          if (!globalDrop && hasFiles(event)) event.preventDefault()
        }}
        onDragLeave={(event) => {
          onDragLeave?.(event)
          if (globalDrop || !hasFiles(event)) return
          dragDepth.current = Math.max(0, dragDepth.current - 1)
          if (dragDepth.current === 0) setDragging(false)
        }}
        onDrop={(event) => {
          onDrop?.(event)
          if (globalDrop || disabled || !hasFiles(event)) return
          event.preventDefault()
          dragDepth.current = 0
          setDragging(false)
          addFiles(Array.from(event.dataTransfer.files))
          textareaRef.current?.focus()
        }}
        {...props}
      >
        {children}
        <input
          ref={inputRef}
          type="file"
          multiple
          accept={accept}
          tabIndex={-1}
          aria-hidden="true"
          className="hidden"
          onChange={(event) => {
            addFiles(Array.from(event.currentTarget.files ?? []))
            event.currentTarget.value = ""
            textareaRef.current?.focus()
          }}
        />
        <span id={hintId} className="hidden">
          {submitOn === "enter"
            ? "Press Enter to send and Shift Enter for a new line."
            : "Press Command or Control Enter to send."}
        </span>
        <span role="status" className="sr-only">
          {announcement}
        </span>
        {globalDrop && dragging ? (
          <div
            aria-hidden="true"
            className="pointer-events-none fixed inset-0 z-50 flex items-center justify-center bg-background/80 backdrop-blur-sm motion-safe:animate-in motion-safe:animation-duration-150 motion-safe:fade-in-0"
          >
            <div className="flex flex-col items-center gap-2 rounded-2xl border-2 border-dashed border-ring px-10 py-8 text-sm text-muted-foreground">
              <PaperclipIcon className="size-6 text-foreground" />
              Drop files to attach
            </div>
          </div>
        ) : null}
      </form>
    </PromptInputContext.Provider>
  )
}

function PromptInputBody({
  className,
  children,
  onMouseDown,
  ...props
}: React.ComponentProps<"div">) {
  const context = usePromptInput("PromptInputBody")
  const morphRef = useSizeMorph<HTMLDivElement>({ axis: "height", duration: 240 })
  const setRef = useMergedRef(context.groupRef, morphRef)

  return (
    <div
      ref={setRef}
      data-slot="prompt-input-body"
      data-layout={context.expanded ? "expanded" : "compact"}
      data-disabled={context.disabled ? "" : undefined}
      className={cn(
        "group/composer relative flex min-w-0 cursor-text flex-wrap items-center gap-1 rounded-(--composer-radius) bg-input/30 p-2 transition-shadow duration-150 ease-out-cubic data-morphing:overflow-clip data-shake:motion-safe:animate-button-shake motion-reduce:transition-none forced-colors:border data-disabled:cursor-not-allowed data-disabled:opacity-50",
        className
      )}
      onMouseDown={(event) => {
        onMouseDown?.(event)
        const target = event.target as HTMLElement
        if (
          event.defaultPrevented ||
          target.closest("button, a, input, textarea, [role=button], [tabindex]")
        ) {
          return
        }
        event.preventDefault()
        context.textareaRef.current?.focus()
      }}
      {...props}
    >
      {children}

      {context.dragging && !context.globalDrop ? (
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center gap-2 rounded-(--composer-radius) border-2 border-dashed border-ring bg-background/90 text-sm text-muted-foreground motion-safe:animate-in motion-safe:animation-duration-150 motion-safe:fade-in-0"
        >
          <PaperclipIcon className="size-4 text-foreground" />
          Drop files to attach
        </div>
      ) : null}
    </div>
  )
}

function PromptInputTextarea({
  className,
  autoFocus,
  onKeyDown,
  onPaste,
  onSelect,
  onFocus,
  onBlur,
  placeholder = "Ask anything",
  ...props
}: React.ComponentProps<"textarea">) {
  const context = usePromptInput("PromptInputTextarea")
  const coarse = useCoarsePointer()
  const {
    textareaRef,
    text,
    files,
    mentions,
    tools,
    expanded,
    setExpanded,
    layout,
  } = context

  React.useEffect(() => {
    if (autoFocus && !readCoarse()) textareaRef.current?.focus()
  }, [autoFocus, textareaRef])

  /**
   * Each variant renders its own textarea and only one is mounted at a time, but
   * they share the single `textareaRef` in context. A plain ref object does not
   * survive a variant switch: React clears it on unmount, and the outgoing
   * variant unmounts *after* the incoming one has registered, so the shared ref
   * ends up null and stays that way.
   *
   * Everything that writes into the field directly - the starter chips, the @
   * file menu, the / commands, dictation - goes through that ref, so once it is
   * null those controls look fine and silently do nothing.
   *
   * Each instance therefore remembers its own node and releases the shared ref
   * only if that node is still the registered one.
   */
  const ownField = React.useRef<HTMLTextAreaElement | null>(null)
  const attachField = React.useCallback(
    (node: HTMLTextAreaElement | null) => {
      if (node) {
        ownField.current = node
        textareaRef.current = node
        return
      }
      if (textareaRef.current === ownField.current) textareaRef.current = null
      ownField.current = null
    },
    [textareaRef],
  )

  const empty =
    !text && files.length === 0 && mentions.length === 0 && tools === 0
  const forced =
    text.includes("\n") ||
    files.length > 0 ||
    mentions.length > 0 ||
    tools > 0

  React.useLayoutEffect(() => {
    const field = textareaRef.current
    if (!field || layout !== "auto") return
    if (empty) {
      if (expanded) setExpanded(false)
      return
    }
    if (expanded) return
    const check = () => {
      const style = getComputedStyle(field)
      const line = parseFloat(style.lineHeight) || 24
      const padding =
        (parseFloat(style.paddingTop) || 0) +
        (parseFloat(style.paddingBottom) || 0)
      if (forced || field.scrollHeight - padding > line * 1.5) {
        setExpanded(true)
      }
    }
    check()
    if (typeof ResizeObserver === "undefined") return
    const observer = new ResizeObserver(check)
    observer.observe(field)
    return () => observer.disconnect()
  }, [textareaRef, text, empty, forced, expanded, setExpanded, layout])

  return (
    <textarea
      ref={attachField}
      data-slot="prompt-input-textarea"
      name="message"
      value={text}
      placeholder={placeholder}
      disabled={context.disabled}
      dir="auto"
      rows={1}
      enterKeyHint={coarse || context.submitOn !== "enter" ? "enter" : "send"}
      autoComplete="off"
      autoCapitalize="sentences"
      spellCheck
      aria-label={props["aria-label"] ?? "Message"}
      aria-describedby={context.hintId}
      aria-invalid={
        context.maxLength !== undefined && text.length > context.maxLength
          ? true
          : undefined
      }
      aria-autocomplete="list"
      aria-controls={context.menu?.listId}
      aria-activedescendant={context.menu?.activeId}
      className={cn(
        "order-2 field-sizing-content max-h-52 min-h-9 min-w-0 flex-1 basis-0 resize-none bg-transparent px-2 py-1.5 text-base text-foreground outline-none placeholder:text-muted-foreground disabled:cursor-not-allowed group-data-[layout=expanded]/composer:order-1 group-data-[layout=expanded]/composer:basis-full group-data-[layout=expanded]/composer:pt-1 pointer-coarse:text-touch",
        className
      )}
      onChange={(event) => {
        context.setText(event.currentTarget.value)
        context.setCaret(event.currentTarget.selectionEnd)
      }}
      onSelect={(event) => {
        onSelect?.(event)
        context.setCaret(event.currentTarget.selectionEnd)
      }}
      onFocus={(event) => {
        onFocus?.(event)
        context.setFocused(true)
        context.setCaret(event.currentTarget.selectionEnd)
      }}
      onBlur={(event) => {
        onBlur?.(event)
        context.setFocused(false)
      }}
      onKeyDown={(event) => {
        onKeyDown?.(event)
        if (event.defaultPrevented) return
        if (context.menu?.handleKey(event)) return
        if (isImeEnter(event.nativeEvent)) return
        const mod = event.metaKey || event.ctrlKey
        if (event.key === "Enter") {
          if (event.shiftKey || event.altKey) return
          const send = mod || (context.submitOn === "enter" && !coarse)
          if (send) {
            event.preventDefault()
            context.submit()
          }
          return
        }
        if (event.key === "Escape" && context.busy && context.stop) {
          event.preventDefault()
          context.stop()
          return
        }
        if (
          event.key === "ArrowUp" &&
          !mod &&
          !event.shiftKey &&
          !event.altKey &&
          !text &&
          context.onEditLast
        ) {
          const previous = context.onEditLast()
          if (typeof previous === "string") {
            event.preventDefault()
            context.setText(previous)
            requestAnimationFrame(() => {
              textareaRef.current?.setSelectionRange(
                previous.length,
                previous.length
              )
            })
          }
        }
      }}
      onPaste={(event) => {
        onPaste?.(event)
        if (event.defaultPrevented) return
        const data = event.clipboardData
        const pasted = Array.from(data.files)
        const plain = data.getData("text/plain")
        if (pasted.length > 0) {
          if (!plain) event.preventDefault()
          context.addFiles(pasted)
          return
        }
        if (context.pasteLimit !== false && plain.length > context.pasteLimit) {
          event.preventDefault()
          context.addFiles(
            [new File([plain], "Pasted text.txt", { type: "text/plain" })],
            { pasted: plain }
          )
        }
      }}
      {...props}
    />
  )
}

function PromptInputTools({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="prompt-input-tools"
      className={cn(
        "order-1 flex min-w-0 items-center gap-0.5 group-data-[layout=expanded]/composer:order-2",
        className
      )}
      {...props}
    />
  )
}

function PromptInputActions({
  className,
  ...props
}: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="prompt-input-actions"
      className={cn("order-3 ms-auto flex items-center gap-1", className)}
      {...props}
    />
  )
}

function PromptInputSubmit({ className }: { className?: string }) {
  const context = usePromptInput("PromptInputSubmit")
  const hasText = Boolean(context.text.trim()) || context.files.length > 0
  const stopping = context.busy && !hasText && Boolean(context.stop)
  const queueing = context.busy && hasText
  const label = stopping
    ? "Stop"
    : queueing
      ? "Queue message"
      : "Send message"

  return (
    <div className={cn("flex items-center gap-1", className)}>
      {context.busy && hasText && context.stop ? (
        <span className="flex motion-safe:animate-in motion-safe:animation-duration-150 motion-safe:fade-in-0 motion-safe:zoom-in-90">
          <Tooltip>
            <TooltipTrigger
              render={
                <Button
                  type="button"
                  size="icon"
                  variant="secondary"
                  aria-label="Stop"
                  onClick={context.stop}
                  shape="pill"
                />
              }
            >
              <SquareIcon />
            </TooltipTrigger>
            <TooltipContent>
              Stop <KbdGroup keys="escape" size="sm" />
            </TooltipContent>
          </Tooltip>
        </span>
      ) : null}
      <Tooltip>
        <TooltipTrigger
          render={
            <Button
              type={stopping ? "button" : "submit"}
              size="icon"
              variant={stopping || context.canSubmit ? "default" : "secondary"}
              aria-label={label}
              aria-disabled={!stopping && !context.canSubmit ? true : undefined}
              data-mode={stopping ? "stop" : "send"}
              onClick={(event) => {
                if (stopping) {
                  event.preventDefault()
                  context.stop?.()
                }
              }}
              shape="pill"
              className="group/submit"
            />
          }
        >
          <span className="grid *:col-start-1 *:row-start-1">
            <ArrowUpIcon className="transition duration-150 ease-out group-data-[mode=stop]/submit:scale-50 group-data-[mode=stop]/submit:opacity-0 motion-reduce:transition-none" />
            <SquareIcon className="scale-50 opacity-0 transition duration-150 ease-out group-data-[mode=stop]/submit:scale-100 group-data-[mode=stop]/submit:opacity-100 motion-reduce:transition-none" />
          </span>
        </TooltipTrigger>
        <TooltipContent>
          {stopping ? (
            <>
              Stop <KbdGroup keys="escape" size="sm" />
            </>
          ) : context.blockedReason ? (
            context.blockedReason
          ) : (
            <>
              {queueing ? "Queue" : "Send"}{" "}
              <KbdGroup
                keys={context.submitOn === "enter" ? "enter" : "mod+enter"}
                size="sm"
              />
            </>
          )}
        </TooltipContent>
      </Tooltip>
    </div>
  )
}

function fileDescription(file: PromptFile) {
  if (file.state === "error") return file.error ?? "Couldn’t upload"
  if (file.state === "uploading") {
    return file.progress !== undefined ? `Uploading ${file.progress}%` : "Uploading"
  }
  if (file.pasted) {
    return `${file.pasted.lines.toLocaleString()} ${file.pasted.lines === 1 ? "line" : "lines"}`
  }
  return formatBytes(file.size)
}

function PromptInputAttachments({ className }: { className?: string }) {
  const context = usePromptInput("PromptInputAttachments")
  const [preview, setPreview] = React.useState<PromptFile | null>(null)

  if (context.files.length === 0 && context.mentions.length === 0) {
    return null
  }

  return (
    <div
      data-slot="prompt-input-attachments"
      className={cn("order-first min-w-0 basis-full", className)}
    >
      <AttachmentGroup className="w-full">
        {context.mentions.map((mention) => (
          <Attachment key={mention.id} size="xs">
            {mention.icon ? <AttachmentMedia>{mention.icon}</AttachmentMedia> : null}
            <AttachmentContent>
              <AttachmentTitle>{mention.label}</AttachmentTitle>
            </AttachmentContent>
            <AttachmentActions>
              <AttachmentAction
                aria-label={`Remove ${mention.label}`}
                onClick={() => {
                  context.removeMention(mention.id)
                  context.textareaRef.current?.focus()
                }}
              >
                <XIcon />
              </AttachmentAction>
            </AttachmentActions>
          </Attachment>
        ))}
        {context.files.map((file) => (
          <Attachment
            key={file.id}
            size="sm"
            state={file.state}
            progress={file.progress}
          >
            {file.pasted ? (
              <AttachmentTrigger
                aria-label={`Preview ${file.name}`}
                onClick={() => setPreview(file)}
              />
            ) : null}
            {file.preview ? (
              <AttachmentMedia variant="image">
                <img src={file.preview} alt="" />
              </AttachmentMedia>
            ) : (
              <AttachmentMedia>
                {file.pasted ? <FileTextIcon /> : <PaperclipIcon />}
              </AttachmentMedia>
            )}
            <AttachmentContent>
              <AttachmentTitle>{file.name}</AttachmentTitle>
              <AttachmentDescription>{fileDescription(file)}</AttachmentDescription>
            </AttachmentContent>
            <AttachmentActions>
              {file.state === "error" && file.retryable ? (
                <AttachmentAction
                  aria-label={`Retry ${file.name}`}
                  onClick={() => context.retryFile(file.id)}
                >
                  <RefreshCwIcon />
                </AttachmentAction>
              ) : null}
              <AttachmentAction
                aria-label={`Remove ${file.name}`}
                onClick={() => {
                  context.removeFile(file.id)
                  context.textareaRef.current?.focus()
                }}
              >
                <XIcon />
              </AttachmentAction>
            </AttachmentActions>
          </Attachment>
        ))}
      </AttachmentGroup>
      <Dialog
        open={preview !== null}
        onOpenChange={(open) => {
          if (!open) setPreview(null)
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Pasted text</DialogTitle>
            <DialogDescription>
              {preview ? fileDescription(preview) : null}. Long pastes are sent
              as a file so the message stays readable.
            </DialogDescription>
          </DialogHeader>
          <DialogBody><pre className="max-h-80 overflow-auto rounded-lg bg-muted p-3 font-mono text-xs/5 whitespace-pre-wrap">
            {preview?.pasted?.text}
          </pre></DialogBody>
          <DialogFooter>
            <DialogClose render={<Button variant="outline" />}>Close</DialogClose>
            <Button
              onClick={() => {
                const field = context.textareaRef.current
                if (!preview?.pasted || !field) return
                const text = preview.pasted.text
                context.removeFile(preview.id)
                setPreview(null)
                requestAnimationFrame(() => insertText(field, text))
              }}
            >
              Insert as text
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

function PromptInputQueue({ className }: { className?: string }) {
  const context = usePromptInput("PromptInputQueue")
  if (context.queue.length === 0) return null

  return (
    <ol
      data-slot="prompt-input-queue"
      aria-label="Queued messages"
      className={cn("flex flex-col gap-1", className)}
    >
      {context.queue.map((item, index) => (
        <li
          key={item.id}
          className="flex min-w-0 items-center gap-2 rounded-lg bg-muted/60 py-1 ps-3 pe-1 text-sm motion-safe:animate-in motion-safe:animation-duration-200 motion-safe:fade-in-0 motion-safe:slide-in-from-bottom-1"
        >
          <span className="shrink-0 text-xs text-muted-foreground tabular-nums">
            {index + 1}
          </span>
          <span className="min-w-0 flex-1 truncate">
            {item.text ||
              `${item.files.length} ${item.files.length === 1 ? "file" : "files"}`}
          </span>
          <Button
            size="xs"
            variant="ghost"
            onClick={() => context.sendQueuedNow(item.id)}
          >
            Send now
          </Button>
          <Button
            size="icon-xs"
            variant="ghost"
            aria-label="Remove from queue"
            onClick={() => context.removeQueued(item.id)}
          >
            <XIcon />
          </Button>
        </li>
      ))}
    </ol>
  )
}

export {
  PromptInput,
  PromptInputAttachments,
  PromptInputActions,
  PromptInputBody,
  PromptInputQueue,
  PromptInputSubmit,
  PromptInputTextarea,
  PromptInputTools,
  usePromptInput,
  type MenuHandle,
  type PromptInputProps,
  type PromptMention,
  type PromptMessage,
  type PromptStatus,
  type QueuedMessage,
}
