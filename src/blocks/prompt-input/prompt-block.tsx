"use client"

import * as React from "react"
import {
  AlignLeftIcon,
  BugIcon,
  CodeIcon,
  CloudIcon,
  FileSearchIcon,
  FileTextIcon,
  FolderIcon,
  FolderOpenIcon,
  GitBranchIcon,
  GitCompareArrowsIcon,
  HistoryIcon,
  LightbulbIcon,
  ListChecksIcon,
  LaptopIcon,
  MailIcon,
  MessageCircleQuestionMarkIcon,
  PaperclipIcon,
  PenLineIcon,
  PlaneIcon,
  ScaleIcon,
  SquarePenIcon,
  TerminalIcon,
  Trash2Icon,
} from "lucide-react"

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
import { PREF, readPref, writePref } from "@/lib/prefs"
import { duration, easeOut, prefersReducedMotion } from "@/lib/motion"
import { AnimatePresence, MotionConfig, motion } from "motion/react"

/**
 * Transition for the Chat <-> Code morph, built from the same tokens the rest of
 * the composer animates with so the two do not read as separate systems.
 *
 * The easing is cast rather than re-typed as a tuple: `easeOut` is the shared
 * token, and duplicating its four numbers here would let the two drift.
 * Motion forwards any valid CSS easing to the Web Animations API; its `Transition`
 * type just narrows to keywords and tuples.
 */
const MORPH = {
  duration: duration.morph / 1000,
  ease: easeOut as unknown as [number, number, number, number],
} as const

/** Collapse/expand of a region that only exists in one variant. */
const variantRegion = {
  initial: { height: 0, opacity: 0 },
  animate: { height: "auto", opacity: 1 },
  exit: { height: 0, opacity: 0 },
} as const

/**
 * A region that belongs to one variant, collapsing when it goes away.
 *
 * Motion animates `height` by measuring the element every frame and writes
 * `opacity` through the Web Animations API, so both need frames to run. When
 * they never do — a backgrounded tab, a stalled compositor — the animations
 * neither advance nor complete and Motion leaves its inline styles behind: a
 * region measured at its full height but held at `opacity: 0`, laid out and
 * invisible. So once the animation has had its full window plus slack, the
 * inline height and opacity are dropped unconditionally and the element goes
 * back to being a plain block at its content's natural size.
 *
 * The wait is longer than the animation itself, so on a machine that is painting
 * normally this only ever runs after Motion has already settled.
 */
function VariantRegion({
  regionKey,
  active,
  children,
}: {
  regionKey: string
  active: boolean
  children: React.ReactNode
}) {
  const ref = React.useRef<HTMLDivElement>(null)

  React.useEffect(() => {
    if (!active) return
    const timer = window.setTimeout(() => {
      const element = ref.current
      if (!element) return
      // A running Web Animations entry wins over inline styles, so clearing
      // them is not enough on its own: the region would keep whatever opacity
      // the stalled animation was holding. Finishing them resolves each to its
      // own end state — visible for an entering region, collapsed for a leaving
      // one — which is the correct outcome either way.
      element.getAnimations().forEach((animation) => {
        try {
          animation.finish()
        } catch {
          animation.cancel()
        }
      })
      element.style.height = ""
      element.style.opacity = ""
    }, MORPH.duration * 1000 + 250)
    return () => window.clearTimeout(timer)
  }, [active, regionKey])

  return (
    <AnimatePresence initial={false}>
      {active ? (
        <motion.div
          key={regionKey}
          ref={ref}
          {...variantRegion}
          transition={MORPH}
          style={{ overflow: "hidden" }}
        >
          {children}
        </motion.div>
      ) : null}
    </AnimatePresence>
  )
}
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
  DropdownMenuSeparator,
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

import { StreamingText } from "./streaming-text"
import { useComposerVariant } from "./composer-variant"
import { useThreadBridge } from "./thread-bridge"
import { CloneRepositoryDialog, type CloneState } from "./clone-dialog"
import {
  availableEffort,
  type ModelReasoningCapabilities,
} from "@/lib/reasoning"
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

/**
 * Each mode carries the system prompt that is actually sent with the request,
 * so switching modes changes how the model behaves rather than only how the
 * button reads. The descriptions state what the model is told to do.
 */
type ModeDefinition = PromptOption & { instruction: string; placeholder: string }

const MODES: ModeDefinition[] = [
  {
    /* "edit", not "code": the Code layout already owns that word, and a mode
       that repeats its container's name reads as a duplicate control. */
    value: "edit",
    label: "Edit",
    icon: <CodeIcon />,
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
    icon: <ListChecksIcon />,
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
    /* A speech bubble with a question mark, not a bare bubble: the plain
       MessageCircleIcon belongs to the Chat layout, and two meanings must not
       share a glyph. */
    icon: <MessageCircleQuestionMarkIcon />,
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

type Variant = "chat" | "code"

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
        <HistoryIcon data-icon="inline-start" />
        Sessions
      </DropdownMenuTrigger>
      <DropdownMenuContent side="top" align="end" sideOffset={8} className="w-48">
        <DropdownMenuItem onClick={onNew}>
          <SquarePenIcon />
          New chat
        </DropdownMenuItem>
        {/* Nothing but the actions and the list. This used to carry a heading
            ("Recent sessions", or "No saved sessions" when empty) and, when
            empty, a paragraph explaining that threads are saved and survive a
            reload. All of it repeated what was already on screen: the trigger is
            called "Sessions", and an empty list is self-evident. The divider does
            the separating. */}
        {sessions.length > 0 ? <DropdownMenuSeparator /> : null}
        {sessions.map((session) => {
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
        })}
        {active && active.turns.length > 0 ? (
          <>
            <DropdownMenuLabel>Manage</DropdownMenuLabel>
            <DropdownMenuItem
              onClick={() => onDelete(active.id)}
              className="text-destructive"
            >
              <Trash2Icon />
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
  { value: "explain", label: "explain", description: "Walk through code step by step", icon: <LightbulbIcon />, insert: "explain " },
  { value: "fix", label: "fix", description: "Find the cause and propose a minimal fix", icon: <BugIcon />, insert: "find the cause of this and propose the smallest fix: " },
  { value: "test", label: "test", description: "Write tests covering the given code", icon: <ListChecksIcon />, insert: "write tests that cover this, including the failure cases: " },
  { value: "review", label: "review", description: "Review for bugs and edge cases", icon: <BugIcon />, insert: "review this for bugs and edge cases: " },
  { value: "plan", label: "plan", description: "Break the work into ordered steps", icon: <ListChecksIcon />, insert: "plan the steps to " },
]

/**
 * Where the agent is allowed to run.
 *
 * Only `local` works today: the chat server runs on this machine and the file
 * walker reads through the File System Access API on this machine. Cloud and SSH
 * are listed but disabled, because the upstream composer this block is modelled
 * on has an environment picker and the shape is worth having - but a menu entry
 * that silently did nothing would be worse than no entry, so they say "Soon" and
 * refuse the click.
 *
 * Ordered so the ones that cannot be picked sit above the one that can. Reading
 * the list as a capability list - "here is what this app will grow into, and here
 * is what works today" - means the state of the feature is visible without having
 * to hover anything.
 *
 * There is deliberately no state behind this. The value cannot be anything but
 * `local` yet, and a state variable that can only ever hold one value is a lie
 * about how much the app can do. It becomes real state when a remote transport
 * exists - see `docs/later-on.md`.
 */
const ENVIRONMENTS: PromptOption[] = [
  {
    value: "ssh",
    label: "SSH",
    icon: <TerminalIcon />,
    description: "Not built yet - there is no remote transport",
    disabled: true,
  },
  {
    value: "cloud",
    label: "Cloud",
    icon: <CloudIcon />,
    description: "Not built yet - there is no hosted backend",
    disabled: true,
  },
  {
    value: "local",
    label: "Local",
    icon: <LaptopIcon />,
    description: "Files on this machine",
  },
]

/** The environment actually in force. Only one is selectable, so not state. */
const ENVIRONMENT = "local"

/**
 * Environments that can actually be selected. Cloud and SSH are listed in the
 * picker but refused, so they are not in this union - which is what makes the
 * folder record below checkable.
 */
type SelectableEnvironment = "local"

/**
 * What "choose a folder" means depends on where the agent runs, so the control
 * takes its copy from the environment rather than hardcoding "folder".
 *
 * Keyed by {@link SelectableEnvironment} on purpose: the moment a transport
 * makes another environment selectable, the compiler refuses to build until that
 * environment says what its files are called and where they live. That is the
 * coupling the two pickers have to have - VS Code merges them into one picker for
 * exactly this reason, searching local, GitHub and remote workspaces through a
 * single control.
 *
 * An earlier version also put a note in the menu saying where the files live. It
 * was cut: the Environment picker sits directly beside this one and already says
 * which machine, so the note repeated what the row next door shows and left a
 * half-empty line across the top of the menu. The pairing is visible from the
 * footer, not from a caption.
 */
const FOLDER_SOURCE: Record<SelectableEnvironment, { label: string; placeholder: string }> = {
  local: {
    label: "Folder",
    placeholder: "Choose folder",
  },
}

/** How many starters are visible at once. Three fits one row at every width. */
const STARTER_COUNT = 3

/** How long the starters sit unchanged before turning over on their own. */
const STARTER_ROTATE_MS = 60_000

type Starter = { label: string; prompt: string; icon: React.ReactNode }

/**
 * General conversation starters, used in the Chat variant.
 *
 * These are the everyday things people actually open a chat for. They have
 * nothing to do with a codebase because in this variant none is attached, and
 * pretending otherwise would be a promise the app cannot keep.
 */
const chatStarters: Starter[] = [
  {
    label: "Plan a trip",
    icon: <PlaneIcon data-icon="inline-start" />,
    prompt:
      "I need a day-by-day trip plan. I'm in Lisbon and I'm going to Kyoto for five days in late March, travelling with one other person who walks a lot and doesn't eat seafood. Our budget is about 150 euros a day for the two of us including a place to stay. Give me a plan by day with the neighbourhoods we'd actually stay in, what has to be booked ahead of time, roughly how long it takes to get between each stop, and one thing we'd be stupid to miss. Where you're unsure or where the season works against you, say so plainly rather than guessing.",
  },
  {
    label: "Write an email",
    icon: <MailIcon data-icon="inline-start" />,
    prompt:
      "Help me write an email. The situation: I'm writing to <who>, and I need <what I want them to do>. It should come across as direct and friendly rather than stiff or over-apologetic. Keep it under 150 words, put the actual ask in the first two sentences, and close it without a canned sign-off. Then give me two alternative opening lines I can swap in.",
  },
  {
    label: "Explain a concept",
    icon: <LightbulbIcon data-icon="inline-start" />,
    prompt:
      "Explain <concept> to me as if I'm reasonably intelligent but have no background in the subject. Start with a one-sentence definition in plain words, then build up to the real technical picture. Use one concrete analogy that actually holds up, and tell me where that analogy breaks down, because that's usually where the understanding goes wrong. Finish with what people commonly get wrong about it and one thing worth reading next.",
  },
  {
    label: "Compare options",
    icon: <GitCompareArrowsIcon data-icon="inline-start" />,
    prompt:
      "I'm choosing between <option A> and <option B>. For each one, tell me the genuine cost of choosing it, what it quietly rules out later, and the situation where it would be clearly the wrong call. Then recommend one for <my situation>, and be explicit about what new information would change your mind. Don't split the difference just to look balanced.",
  },
  {
    label: "Check my reasoning",
    icon: <ScaleIcon data-icon="inline-start" />,
    prompt:
      "Here is a decision I'm weighing and the reasoning I've used so far: <paste it>. Don't tell me whether you'd have made the same call. I want the assumptions I'm not stating out loud, the evidence that would actually move me either way, and any place where I've quietly used a different standard for each option. If you think I'm right, say so and tell me what would make me wrong.",
  },
  {
    label: "Write this up",
    icon: <PenLineIcon data-icon="inline-start" />,
    prompt:
      "Turn these notes into a piece of writing: <paste notes>. Keep every fact I gave you and invent nothing, including details you'd have to guess at. Fix the structure and the flow, cut what's said twice, and keep my voice rather than sanding it into a template. Show me the result first, then list only the judgement calls you made that I should check before I use it.",
  },
]

/**
 * Coding starters, used in the Code variant.
 *
 * When a folder is attached they name files that really exist in it, and
 * `@path` is resolved to the file's contents at send time. With no folder they
 * ask the user to paste the code instead - they never name a file that is not
 * there, because a starter that cannot work is worse than no starter at all.
 */
const codeStarters = (files: ProjectFile[]): Starter[] => {
  /** The file `n` positions ahead, or null when no folder has been walked. */
  const pick = (n: number) => {
    const file = files.length > 0 ? files[n % files.length] : undefined
    return file ? { name: file.name, path: file.path } : null
  }

  const a = pick(0)
  const b = pick(1)
  const c = pick(2)

  return [
    {
      label: a ? `Explain ${a.name}` : "Explain this code",
      icon: <LightbulbIcon data-icon="inline-start" />,
      prompt: a
        ? `@${a.path} Read this file and explain it in the order a newcomer would need it: what it's responsible for, what it calls out to, what state it owns, and the two or three decisions in here that would surprise a reader. Point at specific lines rather than describing the file in general.`
        : "Here's some code I want to understand: <paste it>. Explain what it's responsible for, what it calls out to, and what state it owns. Point at specific lines rather than describing it in general, and tell me the decisions in here that would surprise a newcomer.",
    },
    {
      label: b ? `Review ${b.name}` : "Review this code",
      icon: <BugIcon data-icon="inline-start" />,
      prompt: b
        ? `@${b.path} Review this file for real defects, not style. For each one give me the exact line, the input or state that triggers it, what goes wrong as a result, and how confident you are. Skip anything you cannot point at in this file. If you find nothing, say that plainly rather than inventing something to report.`
        : "Here's some code I want reviewed: <paste it>. Look for real defects, not style. For each one give me the exact line, the input or state that triggers it, what goes wrong as a result, and how confident you are. If you find nothing, say that plainly rather than inventing something to report.",
    },
    {
      label: "Write tests",
      icon: <SquarePenIcon data-icon="inline-start" />,
      prompt: a
        ? `@${a.path} Write tests for this file. Cover the main path, the boundary cases, and at least two ways it could be called wrong, including what happens when an input is empty or missing. Use the testing style this project already uses if there is one. If there isn't, say which framework you picked and why, and don't add a dependency without telling me.`
        : "Here's some code that needs tests: <paste it>. Cover the main path, the boundary cases, and at least two ways it could be called wrong, including what happens when an input is empty or missing. Tell me which test framework you'd use and why before you assume one.",
    },
    {
      label: "Plan a change",
      icon: <ListChecksIcon data-icon="inline-start" />,
      prompt: a
        ? `@${a.path} I want to change this. Break the work into ordered steps small enough that I can review and land them one at a time. For each step, tell me which files it touches and how I'll know it's finished. Call out anything that has to happen before the rest will work, and anything you think is missing from the plan.`
        : "I want to make a change to this code: <paste it>, and the change is <what you want to do>. Break the work into ordered steps small enough to review one at a time, and for each step tell me what it touches and how I'll know it's done.",
    },
    {
      label: "Find what's broken",
      icon: <FileSearchIcon data-icon="inline-start" />,
      prompt: b
        ? `@${b.path} Something in this area isn't behaving the way it looks like it should, and I haven't managed to localise it. Trace how this is called and what it calls in turn, then tell me the most likely places the behaviour could diverge from what the code appears to do. Rank them by how likely each is, and tell me the first thing to check to rule the top one out.`
        : "Something about this code isn't behaving as expected and I haven't localised it: <paste it>. Tell me the most likely places the behaviour could diverge from what it appears to do, ranked by how likely each is, and what to check first to rule out the top one.",
    },
    {
      label: "Explain this project",
      icon: <AlignLeftIcon data-icon="inline-start" />,
      prompt:
        "Walk me through this codebase as if I've never seen it. Tell me what it's for, how a request or command travels through it from the entry point to where the work happens, which directories hold what, and the three files a new contributor should read first. Base all of it on what's actually in the files rather than on conventions, and say where the code is confusing or inconsistent so I know what to watch out for.",
    },
  ]
}

/**
 * Every starter available for the current thread, in preference order.
 *
 * The block shows a window of {@link STARTER_COUNT} from the front and advances
 * the window over time and on each new chat, so the same three are never the
 * only three.
 *
 * Clicking one fills the composer and deliberately does not send. The prompt
 * that lands in the box is the whole prompt, not a stub the user has to finish:
 * a starter that needs three more things typed before it can work is a promise
 * the chip doesn't keep. Labels stay short enough to scan; the text behind them
 * is a complete request.
 *
 * Chat and Code get entirely different pools, because they answer entirely
 * different questions. Claude splits its new-chat starters the same way.
 *
 * `offset` rotates the finished list, so a rotation reliably lands on a different
 * set of three even when the folder holds only one file.
 */
const starterPool = (
  variant: Variant,
  folder: RecentFolder | null,
  files: ProjectFile[],
  offset = 0,
): Starter[] => {
  const pool = variant === "code" && folder ? codeStarters(files) : variant === "code" ? codeStarters([]) : chatStarters
  const n = offset % pool.length
  return pool.slice(n).concat(pool.slice(0, n))
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
    ...message.mentions.map((mention) => ({ id: mention.id, label: mention.label, icon: <FileTextIcon /> })),
    ...message.files.map((file) => ({ id: file.id, label: file.name, icon: <PaperclipIcon /> })),
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
  /* Restored from the last session's picks. A value that no longer exists in
     the catalogue is replaced when the catalogue arrives. */
  const [model, setModel] = React.useState(() => readPref(PREF.model) ?? "")
  /* Restored from the last session's picks, then reconciled against whatever
     the selected model actually accepts — see the effect below. Held as a plain
     string because it is a preference, not a validated value until the
     catalogue says which levels are on offer. */
  const [effort, setEffort] = React.useState(
    () => readPref(PREF.effort) ?? "",
  )
  /* The switch that changes this lives in the sidebar; see composer-variant.tsx. */
  const { variant } = useComposerVariant()
  const [mode, setMode] = React.useState(() => readPref(PREF.mode) ?? "edit")
  const [realModels, setRealModels] = React.useState<PromptModel[]>([])
  /** Every model's display name, including ones outside the free pool. */
  const [realNames, setRealNames] = React.useState<Record<string, string>>({})
  const [realSpecs, setRealSpecs] = React.useState<
    Record<string, { limit: number | null; pricing: PromptTokenPricing }>
  >({})
  /** Per-model reasoning capabilities, exactly as the adapter normalised them. */
  const [realCapabilities, setRealCapabilities] = React.useState<
    Record<string, ModelReasoningCapabilities>
  >({})
  /** Token usage exactly as the provider reported it on the last finished turn. */
  const [usage, setUsage] = React.useState<PromptTokenUsage | null>(null)
  /** Which model the server says it called, so a mismatch can be shown. */
  const [servedModel, setServedModel] = React.useState<string | null>(null)
  /** Folders this browser has actually granted access to. Empty until one is picked. */
  const [folders, setFolders] = React.useState<RecentFolder[]>([])
  const [folderId, setFolderId] = React.useState<string | undefined>(undefined)
  const [projectFiles, setProjectFiles] = React.useState<ProjectFile[]>([])
  /**
   * Which slice of the starter pool is on screen. Advances on its own - see the
   * rotation effect - so there is no shuffle control to press.
   */
  const [starterOffset, setStarterOffset] = React.useState(0)
  /**
   * The composer's current text, mirrored into a ref rather than state.
   *
   * The idle rotation has to know whether the box is empty before it turns the
   * starters over, and reading this on every keystroke would re-render the whole
   * block to answer a question only a timer ever asks. A ref is written on every
   * change and read once a minute.
   */
  const draftRef = React.useRef("")
  const [sessions, setSessions] = React.useState<StoredSession[]>([])
  const [activeSessionId, setActiveSessionId] = React.useState<string | null>(null)
  const [canPick, setCanPick] = React.useState(false)
  /* Clone dialog. Opening it is what the folder menu triggers; the URL, the
     result and any failure all live here rather than in the menu, so a slow
     clone does not close the menu the user just used. */
  const [cloneOpen, setCloneOpen] = React.useState(false)
  /** Where clones land. Null until the server answers, and it is never guessed. */
  const [projectsRoot, setProjectsRoot] = React.useState<string | null>(null)
  const [cloneState, setCloneState] = React.useState<CloneState>({ phase: "idle" })

  React.useEffect(() => {
    let current = true
    fetch("/api/projects")
      .then((response) => (response.ok ? response.json() : null))
      .then((data: { root?: string } | null) => {
        if (current && data?.root) setProjectsRoot(data.root)
      })
      .catch(() => {})
    return () => {
      current = false
    }
  }, [])

  /** Clones on the server, which is the only place `git` can run. */
  const runClone = React.useCallback(async (url: string) => {
    setCloneState({ phase: "cloning", url })
    try {
      const response = await fetch("/api/projects/clone", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ url }),
      })
      const result = (await response.json()) as
        | { ok: true; name: string; path: string }
        | { ok: false; error: string }
      setCloneState(
        result.ok
          ? { phase: "done", name: result.name, path: result.path }
          : { phase: "failed", url, error: result.error },
      )
    } catch {
      setCloneState({
        phase: "failed",
        url,
        error: "Could not reach the local server to clone. Is the app still running?",
      })
    }
  }, [])
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
  /* The selected model is added to the visible list when it is not already there.
     A saved preference may name a paid model while the picker lists only the free
     pool; without this the trigger fell back to the first free entry and showed
     one model's name while another model's reasoning controls were in effect. */
  const modelOptions = React.useMemo(() => {
    if (!model) return realModels;
    if (realModels.some((entry) => entry.value === model)) return realModels;
    const label = realNames[model];
    if (!label) return realModels;
    return [...realModels, { value: model, label }]
  }, [realModels, realNames, model])
  const lastUser = turns.findLast((turn) => turn.role === "user")

  /* The effort levels offered are exactly the ones this model's capability profile
     authorises, with the provider's own labels and wire values. There is no
     global list: models disagree about what exists, and a value invented here
     would be one the model rejects. A profile with no published levels yields no
     picker rather than an assumed range. */
  const capabilities = model ? realCapabilities[model] : undefined
  const efforts: PromptEffort[] = React.useMemo(
    () =>
      capabilities
        ? availableEffort(capabilities.effort).map((entry) => ({
            value: entry.value,
            label: entry.label,
          }))
        : [],
    [capabilities],
  )

  /* Reconcile the stored preference against what this model authorises.
     A saved value the new model does not accept is cleared rather than mapped to
     a nearby level — provider default means "omit", and quietly substituting
     `medium` is the coupling this capability model exists to remove. */
  React.useEffect(() => {
    if (effort === "") return
    if (efforts.length === 0) {
      setEffort("")
      return
    }
    if (efforts.some((level) => level.value === effort)) return
    // Prefer the model's own published default; otherwise hand back to the
    // provider rather than guessing which accepted level was meant.
    const published =
      capabilities?.effort.defaultKnown && capabilities.effort.defaultValue
        ? capabilities.effort.defaultValue
        : undefined
    setEffort(
      published && efforts.some((level) => level.value === published)
        ? published
        : "",
    )
  }, [efforts, effort, capabilities])

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
     behind the user's back on the server.

     The response is matched against the request that asked for it. A late reply
     from a superseded request must not overwrite what is currently selected, or
     a slow fetch could leave the picker describing a model the user has already
     moved off. */
  React.useEffect(() => {
    let current = true
    fetch("/api/models")
      .then((r) => r.json())
      .then((data) => {
        if (!current) return
        const list: Array<{
          id: string
          name: string
          free: boolean
          contextLength: number | null
          promptPrice: number
          completionPrice: number
          capabilities?: ModelReasoningCapabilities
        }> = data.models ?? []
        const free = list.filter((m) => m.free)
        const pool = free.length ? free : list
        setRealModels(
          pool.map((m) => ({ value: m.id, label: m.name.replace(/\s*\(free\)$/, "") }))
        )
        setRealNames(
          Object.fromEntries(
            list.map((m) => [m.id, m.name.replace(/\s*\(free\)$/, "")]),
          ),
        )
        /* Carried for the whole catalogue, not just the free pool, so switching
           to a paid model still finds its real levels instead of falling back to
           no-effort. Models the server did not describe are simply absent, which
           reads as "not looked up" rather than "supports nothing". */
        setRealCapabilities(
          Object.fromEntries(
            list
              .filter((m): m is typeof m & { capabilities: ModelReasoningCapabilities } =>
                m.capabilities !== undefined,
              )
              .map((m) => [m.id, m.capabilities]),
          ),
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
        /* The server deliberately has no default, so something must be selected
           for the composer to be usable at all. The restored preference wins
           if it is still in the catalogue; otherwise the first free model is
           named in the picker and can be changed — a visible selection, never a
           substitution made behind the user's back.

           A model that has since left the *free* pool is still accepted if it
           exists in the full catalogue, so a paid model the user picked is not
           silently swapped out from under them. */
        setModel((current) => {
          if (current && list.some((m) => m.id === current)) return current
          return pool[0]?.id ?? current
        })
      })
      .catch(() => {})
    return () => {
      current = false
    }
  }, [])

  /* Persist the picks. Written declaratively so every path that changes them —
     the picker, opening a session, the restore fallback — is covered once. */
  React.useEffect(() => {
    if (model) writePref(PREF.model, model)
  }, [model])
  React.useEffect(() => {
    if (effort) writePref(PREF.effort, effort)
  }, [effort])
  React.useEffect(() => {
    writePref(PREF.mode, mode)
  }, [mode])

  /* Starters name files by index, so a window chosen for one folder means
     nothing in another. Advancing rather than resetting keeps every thread open
     on a different set, and this effect covers every path that changes a folder
     - picker, menu, revocation, session restore - which resetting at each
     setFolderId call would not. */
  React.useEffect(() => {
    setStarterOffset((n) => n + 1)
  }, [folderId])

  /* Turn the starters over once a minute while the thread is empty and the box
     is not being used. Left to sit, the same three sit there for the whole of a
     long session, which is worse than not having them at all.

     Only when the composer is genuinely empty. Rotating with a starter loaded
     would drop the row out from under a draft the user is still reading, since
     the row stands down the moment the text stops being one of ours; rotating
     while they have typed their own text would change nothing anyone can see. */
  React.useEffect(() => {
    if (!empty) return
    const id = window.setInterval(() => {
      if (draftRef.current === "") setStarterOffset((n) => n + 1)
    }, STARTER_ROTATE_MS)
    return () => window.clearInterval(id)
  }, [empty])

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
            /* One dial: `none` is the "do not reason" position on it, not a
               separate switch. The server validates the level against the
               model's capability and refuses rather than downgrading. */
            ...(effort ? { reasoningEffort: effort } : {}),
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
      effort: effort ? effort : undefined,
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
    /* A new chat should not open on the starters the last one ended on. Done
       here rather than watched for, because `activeSessionId` goes to null for
       a new chat *and* for an unassigned one - two new chats in a row leave it
       unchanged and a dependency would not notice the second. */
    setStarterOffset((n) => n + 1)
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

  /* The rail sits above this block and cannot reach its handlers, so they are
     published here. Written every render in a layout effect: both functions are
     rebuilt each time, and a dependency on them would either republish in a
     loop or require memoising functions that were never written to be stable. */
  const threadBridge = useThreadBridge()
  React.useLayoutEffect(() => {
    threadBridge.functions.current = { reset, open: openSession }
  })
  /* Which thread is open is state, because the rail has to redraw its list when
     it changes — unlike the handlers above, which only ever get called. */
  React.useEffect(() => {
    threadBridge.setActiveId(activeSessionId)
  }, [activeSessionId, threadBridge])

  /**
   * The model picker, shared by both variants.
   *
   * It was previously written out twice — once inside Code's action row, once
   * inside Chat's meta row — which meant the two copies could drift apart, and
   * this element is the one that moves between them when the variant changes.
   * One definition keeps both homes identical.
   */
  const composerModel = (
    <PromptInputModel
      models={modelOptions}
      model={model}
      onModelChange={setModel}
      levels={efforts}
      effort={effort}
      onEffortChange={setEffort}
      recommended="medium"
    />
  )

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
  /* Rebuilt each render; it is six small objects and nothing downstream cares
     about referential stability. `starterOffset` moves on its own, and on a
     folder change, so "Explain README.md" cannot survive into another folder. */
  const starters = starterPool(variant, folder, projectFiles, starterOffset)
  const suggested = starters.slice(0, STARTER_COUNT)

  const folderOptions: PromptOption[] = folders.map((item) => ({
    value: item.id,
    label: item.name,
    icon: <FolderIcon />,
  }))

  /* The folder picker's copy comes from the environment, so the two controls in
     the footer stay in step. Looked up rather than hardcoded so an environment
     without a story here fails to compile instead of quietly showing "folder". */
  const folderSource = FOLDER_SOURCE[ENVIRONMENT]

  /* The @ menu lists only files that exist in the folder this browser has been
     granted. With no folder there is nothing to list, so it is not rendered. */
  const fileMenu: PromptMenuItem[] = projectFiles.slice(0, 200).map((file) => ({
    value: file.path,
    label: file.name,
    hint: file.path.includes("/")
      ? file.path.slice(0, file.path.lastIndexOf("/"))
      : undefined,
    icon: /\.mdx?$/i.test(file.name) ? <FileTextIcon /> : <FileTextIcon />,
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
        <header className="grid h-(--shell-top-bar-h) shrink-0 grid-cols-[1fr_auto_1fr] items-center gap-2 px-4">
          {/* The centre cell is empty. It held the Chat/Code switch, which now
              lives in the sidebar beside the work area; the grid is kept so
              "New chat" stays in the outer column rather than drifting to the
              middle when the switch leaves.

              The height is the shell's `--shell-top-bar-h`, the same number the
              sidebar's strip is sized from. CSS variables cascade, so the value
              set by the shell reaches this header without either block knowing
              the other's name.

              No rule under it. The two top bars were divided by hairlines, and
              a rule drawn under one half and not the other reads as a mistake
              rather than a boundary; drawing both just put a grey line across
              the app for no information. */}
          {empty ? null : (
            <Button variant="ghost" size="xs" onClick={reset} className="justify-self-end">
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
    onValueChange={(value) => {
      draftRef.current = value
    }}
            layout={variant === "code" ? "expanded" : "auto"}
            globalDrop
            focusOnType
          >
            <PromptInputQueue />
            {/* The two variants are not the same box at two sizes — Code adds an
                inset wrapper, a tools row and a footer, and moves the model
                picker and the context dial from below the composer up into the
                action row. Each region that exists in only one variant is
                mounted through AnimatePresence so it collapses and expands
                instead of blinking, and `reducedMotion="user"` hands the whole
                thing back to the OS setting rather than deciding for the user. */}
            <MotionConfig reducedMotion="user">
              {/* Each variant-only region collapses and expands on its own. They
                  are separate AnimatePresence trees because a Fragment holding
                  several keyed children reads as one unkeyed child, which left
                  the second region stuck at zero height. */}
              <VariantRegion regionKey="variant-code" active={variant === "code"}>
                <PromptInputInset>
                  <PromptInputBody>
                    <PromptInputAttachments />
                    <PromptInputTools>
                      {/* Dictation sits to the left of the Mode picker here, not
                          beside the submit button as it does in Chat - the Mode
                          picker is the control this layout reads as its primary
                          action. The recording overlay is absolutely positioned
                          against PromptInputBody, which is the positioned ancestor
                          of both this row and the actions row, so moving it does
                          not change what the overlay covers. */}
                      <PromptInputDictation autoSend />
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
                      {composerModel}
                      {contextDial}
                      <PromptInputSubmit />
                    </PromptInputActions>
                  </PromptInputBody>
                  <PromptInputFooter>
                    <PromptInputSelect
                      label="Environment"
                      options={ENVIRONMENTS}
                      value="local"
                      onValueChange={() => {}}
                      placeholder="Local"
                      icon={<LaptopIcon />}
                    />
                    {canPick ? (
                      <PromptInputSelect
                        label={folderSource.label}
                        options={folderOptions}
                        value={folderId}
                        onValueChange={chooseFolder}
                        placeholder={folderSource.placeholder}
                        icon={<FolderOpenIcon />}
                      >
                        <DropdownMenuItem onClick={() => void browse()}>
                          <FolderOpenIcon />
                          Open folder
                        </DropdownMenuItem>
                          <DropdownMenuItem onClick={() => setCloneOpen(true)}>
                            <GitBranchIcon />
                            Clone repository
                          </DropdownMenuItem>
                        {folder ? (
                          <DropdownMenuItem onClick={() => void forget(folder.id)}>
                            <Trash2Icon />
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
              </VariantRegion>

              <VariantRegion regionKey="variant-chat-body" active={variant === "chat"}>
                <PromptInputBody>
                  <PromptInputAttachments />
                  <PromptInputTextarea autoFocus placeholder="Ask anything" />
                  <PromptInputActions>
                    <PromptInputMeter />
                    <PromptInputDictation autoSend />
                    <PromptInputSubmit />
                  </PromptInputActions>
                </PromptInputBody>
              </VariantRegion>

              <VariantRegion regionKey="variant-chat-meta" active={variant === "chat"}>
                <PromptInputMeta>
                  {composerModel}
                  {contextDial}
                </PromptInputMeta>
              </VariantRegion>
            </MotionConfig>
            {empty ? (
        <PromptInputSuggestions suggestions={suggested} className="pt-3" />
      ) : null}
            {fileMenu.length > 0 ? (
              <PromptInputMenu trigger="@" items={fileMenu} label="Files" />
            ) : null}
            <PromptInputMenu trigger="/" items={commands} />
            <CloneRepositoryDialog
              open={cloneOpen}
              onOpenChange={setCloneOpen}
              projectsRoot={projectsRoot}
              state={cloneState}
              onSubmit={(url) => void runClone(url)}
              onChoose={() => void browse()}
            />
          </PromptInput>
        </div>
        {empty ? <div key="outro" className="flex-1" /> : null}
      </main>
    </MessageScrollerProvider>
  )
}
