"use client"

import * as React from "react"
import {
  AlignLeftIcon,
  BugIcon,
  CircleAlertIcon,
  CodeIcon,
  CloudIcon,
  FileSearchIcon,
  FileTextIcon,
  FolderOpenIcon,
  GitCompareArrowsIcon,
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
} from "lucide-react"

import { supportsDirectoryPicker } from "@/lib/fs-access"
import { isDesktopApp } from "@/lib/desktop"
import { bindWorkspace } from "@/toolkit"
import {
  forgetWorkspace,
  listWorkspaceFiles,
  listWorkspaces,
  pickWorkspace,
  readWorkspaceFile,
  relinkWorkspace,
  type Workspace,
  type WorkspaceFile,
} from "@/lib/workspace"
import {
  chatWriteError,
  findChat,
  listChats,
  onChatsChanged,
  saveChat,
  type StoredChat,
} from "@/lib/chats"
import {
  findSession,
  listSessions,
  onSessionsChanged,
  saveSession,
  sessionWriteError,
  type StoredSession,
} from "@/lib/sessions"
import {
  type StoredTurn,
  type StoredUsage,
} from "@/lib/threads"
import {
  beginPartial,
  discardPartial,
  finishPartial,
  flushAnswers,
  writePartial,
} from "@/lib/partials"
import { announceReply } from "@/lib/notifications"
import { PREF, folderPref, readPref, sidePref, writePref } from "@/lib/prefs"
import {
  cancelClone,
  cloneRepository,
  fetchModels,
  listCliModels,
  listProjects,
  listProviderKeys,
  streamChat,
  type ChatRequest,
  type ProviderKey,
} from "@/lib/api"
import { cliIdOf, isCliProviderId } from "@/lib/cli-providers"
import { SETTINGS_CLOSED } from "@/lib/open-settings"
import {
  MODES as MODE_DEFINITIONS,
  type AgentMode,
} from "@/lib/modes"
import type { Side } from "@/lib/sides"
import { checkReasoning } from "@/lib/provider-reasoning"
import { unknownCapabilities } from "@/lib/reasoning"
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

/**
 * The capabilities of a model the catalogue did not describe.
 *
 * Absent is not "supports nothing". It is "not looked up", and it keeps the
 * interface on the provider default rather than offering a control that would
 * fail.
 */
const unknownFor = (model: string) =>
  unknownCapabilities({
    connectionId: "",
    providerId: "",
    apiProtocol: "openai-chat-completions",
    modelId: model,
  })

/**
 * Whether there is a key the app can reach a model with.
 *
 * The provider in use is the one that matters. A key for another provider is
 * stored and can be checked, but the request goes out with this one's key, so
 * only this one's key can be what a request goes out with.
 */
const hasKey = (keys: ProviderKey[], provider: string): boolean =>
  keys.some((key) => key.active && key.provider === provider)

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

import {
  Attachment,
  AttachmentContent,
  AttachmentMedia,
  AttachmentTitle,
} from "@/components/attachment"
import { Bubble, BubbleContent } from "@/components/bubble"
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
import {
  replyMayTouchComposer,
  threadIdFor,
} from "./thread-writes"
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
  PromptInputFolderSelect,
  PromptInputInset,
  PromptInputMeta,
  PromptInputMeter,
  PromptInputModel,
  PromptInputProvider,
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
  readComposerDraft,
  writeComposerDraft,
  type PromptInputContent,
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
 * The modes, with their icons.
 *
 * The definitions — the labels, the descriptions, the placeholders and the
 * instructions — live in `@/lib/modes`, because the server writes the system
 * prompt and needs the instructions. The icons are the composer's, and an icon
 * is a React node.
 */
const MODE_ICONS: Record<AgentMode, React.ReactNode> = {
  /* "edit", not "code": the Code layout already owns that word, and a mode
     that repeats its container's name reads as a duplicate control. */
  edit: <CodeIcon />,
  plan: <ListChecksIcon />,
  /* A speech bubble with a question mark, not a bare bubble: the plain
     MessageCircleIcon belongs to the Chat layout, and two meanings must not
     share a glyph. */
  ask: <MessageCircleQuestionMarkIcon />,
}

const MODES: PromptOption[] = MODE_DEFINITIONS.map((mode) => ({
  value: mode.value,
  label: mode.label,
  icon: MODE_ICONS[mode.value],
  description: mode.description,
}))

const placeholders: Record<string, string> = Object.fromEntries(
  MODE_DEFINITIONS.map((mode) => [mode.value, mode.placeholder]),
)

type Variant = "chat" | "code"

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
 * exists - see `docs/plan/later-on.md`.
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
const codeStarters = (files: WorkspaceFile[]): Starter[] => {
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
  folder: Workspace | null,
  files: WorkspaceFile[],
  offset = 0,
): Starter[] => {
  const pool = variant === "code" && folder ? codeStarters(files) : variant === "code" ? codeStarters([]) : chatStarters
  const n = offset % pool.length
  return pool.slice(n).concat(pool.slice(0, n))
}

type Turn =
  | { id: string; role: "user"; message: PromptMessage }
  | { id: string; role: "assistant"; text: string; streaming: boolean; stopped?: boolean; incomplete?: boolean }
  /** A model-written summary of everything above it; sent with later requests. */
  | { id: string; role: "summary"; text: string }

/**
 * What a thread records about the run that produced it.
 *
 * Captured when the turn is sent, because the reply comes back later and by
 * then the user may have changed the model, the folder or the surface. A
 * thread records the settings it was actually run with, not the ones that
 * happen to be in force when the answer arrives.
 */
type WriteState = {
  /** Which side the thread belongs to. */
  side: Side
  /**
   * The thread the turn belongs to.
   *
   * Decided when the turn is sent and carried through to the reply's write, so
   * that a reply which arrives after the user has pressed "New" or switched
   * surfaces lands on the thread it belongs to rather than making a second one
   * with the same conversation in it.
   */
  id: string | null
  model: string
  effort: string
  /** The provider the request went to. */
  provider: string
  /** The agent mode. Code only. */
  mode: string
  /** The folder's id and name. Code only. */
  folderId: string | undefined
  folderName: string | undefined
  /** The provider's accounting for the turn that just finished. */
  usage: PromptTokenUsage | null
}

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
 * The system prompt is not written here.
 *
 * It used to be: the composer built it and sent it as prose, and the server
 * passed it on. That made a rule about what a chat may be told a rule the
 * client could ignore, and the client is the part of the system a bug is most
 * likely to be in. The composer now sends the facts — the variant, the agent
 * mode, the folder — and the server writes the prompt, in `server/system.ts`.
 */

/** Asks the model for a whole answer, as plain text. */
const askForText = async (
  request: ChatRequest,
  signal?: AbortSignal,
): Promise<string> => {
  let out = ""
  await streamChat(request, (event) => {
    if (event.type === "text-delta" && event.delta) out += event.delta
  }, signal)
  return out.trim()
}

/**
 * Turns an outgoing user message into what the model actually receives: the
 * text, plus the real contents of anything it points at. A file that cannot be
 * read says so in place, rather than the message silently losing its context.
 */
const expandUserTurn = async (
  message: PromptMessage,
  known: WorkspaceFile[],
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
    const text = await readWorkspaceFile(entry)
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

/**
 * What the model is told about an answer that did not finish.
 *
 * An answer that was cut off — by a crash, or by the app being closed — is in
 * the conversation as a partial one. A model reading it would take it for the
 * whole answer and carry on as though it had been finished, so it is told
 * that it was not.
 *
 * It is said in brackets because it is not something the model wrote, and
 * because a bracket is something a model reads as an aside rather than as
 * part of the answer.
 */
const CUT_OFF =
  "\n\n[This answer was cut off before it finished, so it is incomplete. Carry on from where it stopped, and do not assume that anything after this point was written.]"

/**
 * What the model is told about an answer the user stopped.
 *
 * The same thing, said for the same reason: the answer is partial, and the
 * model should not carry on as though it had been finished. The difference is
 * only in why, and the model is told that too, because the two call for
 * different things — an answer that was stopped was stopped on purpose.
 */
const STOPPED =
  "\n\n[This answer was stopped before it finished, so it is incomplete. Carry on from where it stopped, and do not assume that anything after this point was written.]"

/** Captures attachment text so a restored thread still carries its context. */
const toStoredTurns = async (list: Turn[], known: WorkspaceFile[]): Promise<StoredTurn[]> =>
  Promise.all(
    list.map(async (turn): Promise<StoredTurn> => {
      if (turn.role === "summary") return { id: turn.id, role: "summary", text: turn.text }
      if (turn.role === "assistant") {
        return {
          id: turn.id,
          role: "assistant",
          text: turn.text,
          ...(turn.stopped ? { stopped: true } : {}),
          ...(turn.incomplete ? { incomplete: true } : {}),
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
        ...(turn.incomplete ? { incomplete: true } : {}),
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
  /* The switch that changes this lives in the sidebar; see composer-variant.tsx.
     It is a *surface* switch: it says which of the two places you are in, and
     each place has its own threads, its own model and its own composer. */
  const { variant, setVariant } = useComposerVariant()

  /**
   * The model and the effort each side remembers.
   *
   * A chat and a code session are different work, and the model that answers
   * one of them is not the model that answers the other. Both are remembered
   * per side, so "New chat" keeps the chat's model and "New session" keeps the
   * session's, and each side comes back to the one it was left on.
   */
  const [modelBySide, setModelBySide] = React.useState<Record<Side, string>>(() => ({
    chat: readPref(sidePref(PREF.model, "chat")) ?? "",
    code: readPref(sidePref(PREF.model, "code")) ?? "",
  }))
  const [effortBySide, setEffortBySide] = React.useState<Record<Side, string>>(() => ({
    chat: readPref(sidePref(PREF.effort, "chat")) ?? "",
    code: readPref(sidePref(PREF.effort, "code")) ?? "",
  }))
  /**
   * The provider in use, per side.
   *
   * It is a preference like the model and the effort, and everything follows
   * it: the catalogue that is fetched, the list that is shown, the key the
   * request goes out with, and the provider the request is sent to. That is
   * what makes the list and the request about the same provider by
   * construction, rather than by agreeing to.
   *
   * It starts unset, because the user chooses it: the model picker is not
   * usable until a provider is chosen, since the models belong to one.
   */
  const [providerBySide, setProviderBySide] = React.useState<Record<Side, string>>(
    () => ({
      chat: readPref(sidePref(PREF.provider, "chat")) ?? "",
      code: readPref(sidePref(PREF.provider, "code")) ?? "",
    }),
  )
  const model = modelBySide[variant]
  const effort = effortBySide[variant]
  const provider = providerBySide[variant]

  /**
   * What the user has typed, attached, mentioned or queued — per side.
   *
   * The composer is one shell with two regions, and the regions share the
   * shell's context. That context is where the text and the attachments live,
   * so without this a half-written chat would be waiting in the Code
   * composer, and a chat's attachments would go out with a code message.
   *
   * The content belongs to the side, not to the composer, so the composer is
   * told what it is showing and reports what changed.
   */
  const [contentBySide, setContentBySide] = React.useState<
    Record<Side, PromptInputContent>
  >(() => ({
    chat: { text: readComposerDraft("chat"), files: [], mentions: [], queue: [] },
    code: { text: readComposerDraft("code"), files: [], mentions: [], queue: [] },
  }))
  const content = contentBySide[variant]

  /**
   * Choosing a model, or an effort level, changes the side you are on.
   *
   * The picker is one control with two memories: the same button in the chat
   * composer and in the code composer, bound to whichever side is showing.
   */
  const setModel = React.useCallback(
    (next: string | ((current: string) => string)) => {
      setModelBySide((current) => {
        const resolved =
          typeof next === "function" ? next(current[variant]) : next
        return { ...current, [variant]: resolved }
      })
    },
    [variant],
  )
  const setEffort = React.useCallback(
    (next: string | ((current: string) => string)) => {
      setEffortBySide((current) => {
        const resolved =
          typeof next === "function" ? next(current[variant]) : next
        return { ...current, [variant]: resolved }
      })
    },
    [variant],
  )
  const setProvider = React.useCallback(
    (next: string | ((current: string) => string)) => {
      setProviderBySide((current) => {
        const resolved =
          typeof next === "function" ? next(current[variant]) : next
        return { ...current, [variant]: resolved }
      })
    },
    [variant],
  )

  /** A change to the composer content, which belongs to the side. */
  const onContentChange = React.useCallback(
    (change: Partial<PromptInputContent>) => {
      setContentBySide((current) => ({
        ...current,
        [variant]: { ...current[variant], ...change },
      }))
    },
    [variant],
  )

  /** The agent mode. Code only — a chat has no repository to be careful in. */
  const [mode, setMode] = React.useState(() => readPref(PREF.mode) ?? "edit")
  const [realModels, setRealModels] = React.useState<PromptModel[]>([])

  /* The models a CLI provider publishes.
   *
   * `null` means "not a CLI provider, or not read yet". An empty list means
   * the CLI has no list of its own, and the app shows no model picker for it
   * rather than an empty one. */
  const [cliModels, setCliModels] = React.useState<PromptModel[] | null>(null)
  /** Every model's display name, including ones outside the free pool. */
  const [realNames, setRealNames] = React.useState<Record<string, string>>({})
  const [realSpecs, setRealSpecs] = React.useState<
    Record<string, { limit: number | null; pricing?: PromptTokenPricing }>
  >({})
  /** Per-model reasoning capabilities, exactly as the adapter normalised them. */
  const [realCapabilities, setRealCapabilities] = React.useState<
    Record<string, ModelReasoningCapabilities>
  >({})
  /** Token usage exactly as the provider reported it on the last finished turn. */
  const [usage, setUsage] = React.useState<PromptTokenUsage | null>(null)
  /** Which model the server says it called, so a mismatch can be shown. */
  const [servedModel, setServedModel] = React.useState<string | null>(null)
  /** Folders this app has actually been given access to. Empty until one is picked. */
  const [folders, setFolders] = React.useState<Workspace[]>([])
  const [folderId, setFolderId] = React.useState<string | undefined>(undefined)
  const [projectFiles, setProjectFiles] = React.useState<WorkspaceFile[]>([])
  /**
   * The last conversation that could not be saved, if there was one.
   *
   * The conversation stays on screen either way — losing what the user can see
   * would be worse than losing what is on disk — but a conversation that is
   * only on screen is gone the next time the app opens, and that has to be
   * said rather than discovered.
   */
  const [saveError, setSaveError] = React.useState<string | null>(null)
  /**
   * Something worth saying that is not an error — a folder was linked, a
   * clone finished. It goes away on the next thing that happens.
   */
  const [notice, setNotice] = React.useState<string | null>(null)
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
  /**
   * The thread each side has open.
   *
   * A chat is not a code session, so each side keeps its own, and opening one
   * does not close the other. Switching between the two leaves the other side
   * exactly where it was.
   */
  const [activeBySide, setActiveBySide] = React.useState<Record<Side, string | null>>({
    chat: null,
    code: null,
  })
  const activeSessionId = activeBySide[variant]
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
    listProjects()
      .then((data) => {
        if (current && data.root) setProjectsRoot(data.root)
      })
      .catch(() => {})
    return () => {
      current = false
    }
  }, [])

  /**
   * Clones the repository.
   *
   * `git` runs on this machine — in Rust on the desktop, and in the website's
   * server on the web. Either way the destination is checked first, so an
   * existing project is never overwritten.
   */
  const runClone = React.useCallback(async (url: string) => {
    setCloneState({ phase: "cloning", url })
    try {
      const result = await cloneRepository(url, undefined, (progress) => {
        setCloneState((state) =>
          state.phase === "cloning" ? { ...state, progress } : state,
        )
      })
      setCloneState(
        result.ok
          ? { phase: "done", name: result.name ?? "", path: result.path ?? "" }
          : { phase: "failed", url, error: result.error ?? "The clone failed." },
      )
    } catch {
      setCloneState({
        phase: "failed",
        url,
        error: "Could not reach the machine to clone. Is the app still running?",
      })
    }
  }, [])
  const [compacting, setCompacting] = React.useState(false)
  const abortRef = React.useRef<AbortController | null>(null)
  const dockRef = React.useRef<HTMLDivElement>(null)

  /**
   * The journal is written when the app goes away.
   *
   * An answer is written down as it grows, but the writing is buffered: the
   * text since the last write would be lost with the window if the app were
   * closed in the middle of an answer. So it is written on the way out.
   *
   * It is best-effort — the webview is on its way off, and a write that does
   * not land is a write the two-second cadence would have made anyway.
   */
  React.useEffect(
    () => () => {
      void flushAnswers()
    },
    []
  )
  /**
   * The thread being written, and the side it belongs to.
   *
   * A ref, because the write happens inside a stream that outlives the render
   * that started it — and because a thread belongs to a side, so the side has
   * to be known at the moment of the write rather than at the moment of the
   * render that began it.
   */
  const activeRef = React.useRef<{ side: Side; id: string | null }>({
    side: "chat",
    id: null,
  })
  const empty = turns.length === 0
  useDock(dockRef, !empty)

  const folder = folders.find((item) => item.id === folderId) ?? null
  const busy = status === "submitted" || status === "streaming"

  /**
   * Empties a side's conversation.
   *
   * The composer holds the live copy of the thread that is open, and this is
   * what "no thread is open" looks like. It is also what a thread that has
   * been deleted looks like: a conversation that no longer exists is not a
   * conversation, and leaving the other side's turns on screen under this
   * side's composer would be a lie about what is open.
   */
  const clearThread = React.useCallback((side: Side) => {
    setTurns([])
    setUsage(null)
    setServedModel(null)
    activeRef.current = { side, id: null }
    setActiveBySide((current) =>
      current[side] === null ? current : { ...current, [side]: null },
    )
  }, [])

  /**
   * Shows a thread, or nothing at all.
   *
   * The store is the truth about a thread that is not open; the composer holds
   * the live copy while it is open. Loading one replaces everything the
   * composer is showing — the turns, the usage, the model, the effort, and in
   * Code the folder and the agent mode — because a thread is a conversation
   * with its own settings rather than a window onto shared ones.
   *
   * The folder and the mode are Code's, so loading a chat does not touch
   * them, and loading a session restores them from the session rather than
   * from whatever was there before.
   */
  const loadThread = React.useCallback(
    (side: Side, id: string | null) => {
      abortRef.current?.abort()
      abortRef.current = null
      setStatus("ready")

      if (!id) {
        clearThread(side)
        /* The folder and the agent mode are left alone.
           The folder is the side's, not the thread's: it is what the composer
           is pointed at, and a new session starts where the last one was left.
           The mode is settled by the effect below, which knows the folder. */
        return
      }

      if (side === "chat") {
        const chat = findChat(id)
        if (!chat) {
          /* The thread is not there. Showing the other side's conversation
             under this side's composer would be a lie about what is open, so
             the composer is emptied instead. */
          clearThread(side)
          return
        }
        setTurns(fromStoredTurns(chat.turns))
        setUsage(chat.usage ?? null)
        setServedModel(null)
        activeRef.current = { side, id }
        setActiveBySide((current) =>
          current[side] === id ? current : { ...current, [side]: id },
        )
        if (chat.model) setModelBySide((current) => ({ ...current, [side]: chat.model! }))
        if (chat.effort) setEffortBySide((current) => ({ ...current, [side]: chat.effort! }))
        /* The provider the thread is about, the same way. */
        if (chat.provider)
          setProviderBySide((current) => ({ ...current, [side]: chat.provider! }))
        return
      }

      const session = findSession(id)
      if (!session) {
        clearThread(side)
        return
      }
      setTurns(fromStoredTurns(session.turns))
      setUsage(session.usage ?? null)
      setServedModel(null)
      activeRef.current = { side, id }
      setActiveBySide((current) =>
        current[side] === id ? current : { ...current, [side]: id },
      )
      if (session.model) setModelBySide((current) => ({ ...current, [side]: session.model! }))
      if (session.effort) setEffortBySide((current) => ({ ...current, [side]: session.effort! }))
      /* The provider the session is about, the same way. */
      if (session.provider)
        setProviderBySide((current) => ({ ...current, [side]: session.provider! }))
      if (session.mode) setMode(session.mode)
      setFolderId(
        folders.some((item) => item.id === session.folder) ? session.folder : undefined,
      )
    },
    [folders, clearThread],
  )

  /**
   * Opens a thread, and moves to the side that owns it.
   *
   * Opening a session from the Sessions list puts the composer in Code, and
   * opening a chat puts it in Chat — a thread is a conversation with its own
   * job, and the composer is that job's furniture.
   */
  const openThread = React.useCallback(
    (side: Side, id: string) => {
      if (variant !== side) setVariant(side)
      loadThread(side, id)
    },
    [variant, setVariant, loadThread],
  )

  /**
   * Starts a new thread on a side.
   *
   * It resets that side's conversation and nothing else: the other side's
   * thread is untouched, and this side keeps its model, its effort and — in
   * Code — the folder it was pointed at.
   */
  const resetThread = React.useCallback(
    (side: Side) => {
      loadThread(side, null)
    },
    [loadThread],
  )

  /* The selected model is added to the visible list when it is not already there.
     A saved preference may name a paid model while the picker lists only the free
     pool; without this the trigger fell back to the first free entry and showed
     one model's name while another model's reasoning controls were in effect.

     A CLI provider brings its own list. A CLI that publishes models is asked
     for them and shows them; a CLI that chooses its own model is asked for
     nothing and shows no picker at all, because a picker with nothing in it
     is a claim that there is a choice. */
  const modelOptions = React.useMemo(() => {
    const list = isCliProviderId(provider) ? (cliModels ?? []) : realModels
    if (!model) return list
    if (list.some((entry) => entry.value === model)) return list
    const label = isCliProviderId(provider)
      ? model
      : realNames[model]
    if (!label) return list
    return [...list, { value: model, label }]
  }, [realModels, realNames, model, cliModels, provider])
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
    /* The desktop asks the system for a folder, which is always there. The
       website asks the browser, which only some browsers have. */
    setCanPick(isDesktopApp() || supportsDirectoryPicker())
  }, [])

  React.useEffect(() => {
    void listWorkspaces().then(setFolders)
  }, [])

  /**
   * The provider keys, once they have been read.
   *
   * Null until they have been. The model list is not fetched until this says
   * there is a key: the catalogue comes from the provider, and a list of
   * models that cannot be called is a list of things that will fail. The
   * picker says what is missing instead.
   */
  const [keys, setKeys] = React.useState<ProviderKey[] | null>(null)
  /**
   * What the server said when the models could not be read.
   *
   * It is kept rather than swallowed, because a picker with no models in it
   * and no reason why is a picker that looks broken. The server's own words
   * are shown: it knows what went wrong, and this does not.
   */
  const [modelsError, setModelsError] = React.useState<string | null>(null)
  /**
   * How old the catalogue is, and whether it is the last good copy.
   *
   * A catalogue is a list of models and prices. One that is three weeks old
   * names models that no longer exist, so the age is shown rather than
   * assumed, and the one state a person can act on — the provider could not
   * be reached and this is the last good copy — is called out.
   */
  const [catalogueFreshness, setCatalogueFreshness] = React.useState<{
    fetchedAt: number
    degraded: boolean
  } | null>(null)

  React.useEffect(() => {
    let current = true
    let timer: number | undefined

    const read = (attempt = 0) => {
      void listProviderKeys()
        .then((list) => {
          if (current) setKeys(list)
        })
        .catch(() => {
          if (!current) return
          /* The server may not be listening yet. A browser tab can be opened
             before it is, and the app has no way of telling that apart from a
             server that is not there at all, so the question is asked again a
             few times before it is given up on. A failure that is not a
             failure yet should not be reported as one. */
          if (attempt < 4) {
            timer = window.setTimeout(() => read(attempt + 1), 750)
            return
          }
          /* Nothing is claimed about whether there is a key, so the list is
             treated as empty and the picker asks for a key — which is where
             the answer is. */
          setKeys([])
        })
    }
    read()
    /* The settings card is where a key is added, so it is where this answer
       can change, and it says when it closes. */
    const onClosed = () => read()
    window.addEventListener(SETTINGS_CLOSED, onClosed)
    return () => {
      current = false
      if (timer !== undefined) window.clearTimeout(timer)
      window.removeEventListener(SETTINGS_CLOSED, onClosed)
    }
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
    /* No key, no models. Nothing is fetched from a provider the app cannot
       reach, and the picker says what is missing. */
    if (!keys || !hasKey(keys, provider)) return
    let current = true
    fetchModels(provider)
      .then((data) => {
        if (!current) return
        setModelsError(null)
        setCatalogueFreshness({
          fetchedAt: data.fetchedAt,
          degraded: data.degraded,
        })
        const list: Array<{
          id: string
          name: string
          free: boolean
          contextLength: number | null
          promptPrice: number | null
          completionPrice: number | null
          cachedInputPrice: number | null
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
                /* A provider that publishes no price gets no figure: a
                   number nobody published is not a number. */
                pricing:
                  m.promptPrice === null
                    ? undefined
                    : {
                        input: m.promptPrice,
                        /* Cached input is billed at its own rate, and pricing
                           it at the full input rate over-reports what a
                           request costs. */
                        cachedInput: m.cachedInputPrice ?? m.promptPrice,
                        output: m.completionPrice ?? m.promptPrice,
                      },
              },
            ])
          )
        )
        /* The server deliberately has no default, so something must be selected
           for the composer to be usable at all. Which side that selection
           belongs to is settled below, once the catalogue is in state. */
      })
      .catch((error: unknown) => {
        if (!current) return
        setModelsError(
          error instanceof Error
            ? error.message
            : "The model list could not be read.",
        )
      })
    return () => {
      current = false
    }
  }, [keys, provider])

  /* The models of a CLI provider.
   *
   * A CLI is not a model, and most of them do not publish a list: they
   * choose their own. One that does is asked for the list, and the list is
   * what the picker shows. One that does not is asked for nothing, and the
   * picker is not shown at all. */
  React.useEffect(() => {
    if (!isCliProviderId(provider)) {
      setCliModels(null)
      return
    }
    let current = true
    void listCliModels(cliIdOf(provider))
      .then((models) => {
        if (!current) return
        setCliModels(models.map((id) => ({ value: id, label: id })))
      })
      .catch(() => {
        /* A CLI that will not say what models it has has no list to show.
           The app shows no picker rather than an empty one. */
        if (current) setCliModels([])
      })
    return () => {
      current = false
    }
  }, [provider])

  /**
   * The side you are on always has a model.
   *
   * The restored choice wins if it is still in the catalogue; otherwise the
   * first free model is named in the picker and can be changed — a visible
   * selection, never a substitution made behind the user's back.
   *
   * It is reconciled per side, so switching to a side that has not chosen one
   * yet picks for that side and leaves the other side's choice alone. A model
   * that has since left the *free* pool is still accepted if it exists in the
   * full catalogue, so a paid model the user picked is not silently swapped out
   * from under them.
   */
  React.useEffect(() => {
    if (realModels.length === 0) return
    setModel((current) => {
      if (current && realModels.some((m) => m.value === current)) return current
      if (current && realNames[current]) return current
      return realModels[0]?.value ?? current
    })
  }, [realModels, realNames, variant])

  /* Persist the picks. Written declaratively so every path that changes them —
     the picker, opening a thread, the restore fallback — is covered once. The
     model and the effort are remembered per side, so each of them is written
     against the side that is showing. */
  React.useEffect(() => {
    writePref(sidePref(PREF.model, variant), model || undefined)
  }, [model, variant])
  React.useEffect(() => {
    writePref(sidePref(PREF.effort, variant), effort || undefined)
  }, [effort, variant])
  React.useEffect(() => {
    writePref(sidePref(PREF.provider, variant), provider || undefined)
  }, [provider, variant])

  /**
   * The agent mode is remembered per project.
   *
   * The way you work in one repository is not the way you work in another: a
   * plan you chose for a large change is not a plan you want for a small one.
   * So the mode you pick is kept against the folder, and a new session in that
   * folder starts on it — while a session you are opening keeps the mode it
   * was run with, because a conversation continues in the way it started.
   */
  React.useEffect(() => {
    if (activeSessionId) return
    if (!folderId) {
      setMode(readPref(PREF.mode) ?? "edit")
      return
    }
    setMode(readPref(folderPref("mode", folderId)) ?? readPref(PREF.mode) ?? "edit")
  }, [folderId, activeSessionId])

  React.useEffect(() => {
    if (folderId) writePref(folderPref("mode", folderId), mode)
    else writePref(PREF.mode, mode)
  }, [mode, folderId])

  /* The draft is the side's, so it is saved against the side and restored into
     the side. A half-written chat is waiting in the chat composer, and a
     half-written session in the session composer, and neither appears in the
     other. */
  React.useEffect(() => {
    writeComposerDraft(variant, content.text)
  }, [variant, content.text])

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

  /* Index the folder's source files. A folder that has gone away, or whose
     access was refused, resolves to nothing, which clears the list rather than
     leaving stale paths behind.

     The native tools are bound to the same folder: a tool that could reach
     anywhere on the machine would not be bounded by anything, and a tool
     bound to a folder the model cannot name is a tool that can do nothing
     outside the one the user chose. */
  React.useEffect(() => {
    bindWorkspace(folderId ?? null)
    if (!folderId) {
      setProjectFiles([])
      return
    }
    let cancelled = false
    void (async () => {
      const files = await listWorkspaceFiles(folderId)
      if (cancelled) return
      setProjectFiles(files)
    })()
    return () => {
      cancelled = true
    }
  }, [folderId])

  /* Streams a reply from the chat route. */
  const respondReal = async (
    id: string,
    history: Turn[],
    write: WriteState,
    threadId: string,
  ) => {
    const controller = new AbortController()
    abortRef.current = controller
    /* Hoisted so the abort and failure paths can store what actually arrived. */
    let shown = ""
    /* The provider's own accounting for the turn, as it arrives. It is kept
       here as well as in state because the write happens after the stream has
       ended, and by then the render that started it is long gone. */
    let reported: PromptTokenUsage | null = null

    /* The answer is written down while it is being written.
       Until now it existed only in memory: between the message going out and
       the answer finishing, a crash lost all of it. The journal is a file of
       the conversation's own, appended to as the text arrives, and the answer
       is found again on the next launch if the app dies in the middle of
       writing it.

       The journal is named by the conversation, and the conversation is the
       one the reply was asked on — which the write that sent the message has
       already settled. */
    beginPartial(threadId, id, write.side, write.model)

    /**
     * Whether the composer is still showing the side this reply belongs to.
     *
     * A reply belongs to the side it was asked on. If the user has switched to
     * the other surface while it was arriving, the composer is now showing a
     * different conversation, and putting this one's turns back into it would
     * put one side's conversation under the other side's composer — where the
     * next message would take it along and save a session that has nothing to
     * do with Code.
     *
     * The reply is still stored on the thread it belongs to. Only the composer
     * is left alone.
     */
    const stillHere = () =>
      replyMayTouchComposer(write.side, write.id, activeRef.current)

    try {
      /* Resolve every file the thread points at before the request goes out, so
         the model receives contents rather than filenames. */
      const outbound: {
        id: string
        role: "user" | "assistant"
        parts: { type: "text"; text: string }[]
      }[] = []

      for (const turn of history) {
        /* The summary stands for every message above it, so it is sent as what
           it is. Dropping it would mean the model never sees the part of the
           conversation that was compacted away — which is the opposite of what
           compaction is for. */
        if (turn.role === "summary") {
          outbound.push({
            id: turn.id,
            role: "user",
            parts: [
              {
                type: "text",
                text:
                  "Summary of the conversation so far, standing in for the " +
                  "messages it replaces:\n\n" +
                  turn.text,
              },
            ],
          })
          continue
        }
        if (turn.role === "assistant") {
          /* An answer that did not finish is in the conversation as a partial
             one, and a model reading it would take it for the whole answer.
             So it is told — and told why, because the two call for different
             things. */
          const note = turn.incomplete
            ? CUT_OFF
            : turn.stopped
              ? STOPPED
              : "";
          outbound.push({
            id: turn.id,
            role: "assistant",
            parts: [{ type: "text", text: turn.text + note }],
          });
          continue
        }
        outbound.push({
          id: turn.id,
          role: "user",
          parts: [
            {
              type: "text",
              /* The folder's files are inlined only in Code. A chat has no
                 repository, and a chat that carried the contents of somebody's
                 working tree would be a conversation about their files without
                 their having asked for that. */
              text: await expandUserTurn(
                turn.message,
                write.side === "code" ? projectFiles : [],
              ),
            },
          ],
        })
      }

      /* The turn is added before the request goes out, because the answer
         arrives as events and there has to be somewhere to put them. */
      setStatus("streaming")
      setTurns((list) => [...list, { id, role: "assistant", text: "", streaming: true }])

      /* The reasoning preference, checked against the model.
       *
       * A level the model does not publish is refused, and the refusal says
       * why. It is the shared rule, so the desktop app and the website's
       * server answer the same question the same way. The level itself goes
       * out as it is, and the app that makes the request writes it in the
       * field its provider takes it in.
       *
       * A CLI provider has none of this. It has its own way of being told
       * how hard to think, and the app does not second-guess it. */
      const verdict =
        effort && model && !isCliProviderId(provider)
          ? checkReasoning(
              realCapabilities[model] ?? unknownFor(model),
              {
                effort: { mode: "explicit", value: effort },
                thinkingMode: { mode: "provider_default" },
              },
            )
          : null;
      if (verdict && !verdict.ok) {
        setStatus("error")
        setTurns((list) =>
          list.map((turn) =>
            turn.id === id
              ? { ...turn, text: verdict.message, streaming: false }
              : turn,
          ),
        )
        return
      }

      await streamChat(
        {
          messages: outbound,
          /* The facts, not the prose. The server writes the system prompt, so
             that what a chat is told is a rule the client cannot ignore. */
          variant: write.side,
          ...(write.side === "code"
            ? {
                mode: write.mode,
                folder: write.folderName,
                /* The id as well as the name: a CLI provider is started in
                   the folder, and two folders can have the same name. */
                folderId: write.folderId,
              }
            : {}),
          config: {
            ...(model ? { modelName: model } : {}),
            /* The provider the model list was fetched for. The request and
               the list are about the same provider by construction. */
            ...(provider ? { providerId: provider } : {}),
            /* One dial: `none` is the "do not reason" position on it, not a
               separate switch. The level is validated against the model's
               capability and refused rather than downgraded — and the
               provider's own fields travel with the request, because the
               desktop app makes the provider request itself. */
            ...(effort ? { reasoningEffort: effort } : {}),
          },
        },
        (event) => {
          if (event.type === "error") {
            throw new Error(event.errorText || "The stream reported an error")
          }
          if (event.type === "message-metadata") {
            if (event.messageMetadata?.modelId) {
              setServedModel(event.messageMetadata.modelId)
            }
            return
          }
          if (event.type === "finish") {
            /* The provider's own accounting for the turn that just ended. This
               is what the context dial reads — no estimate is involved. */
            const usage = event.messageMetadata?.usage
            if (usage) {
              reported = usage as PromptTokenUsage
              if (stillHere()) setUsage(usage as PromptTokenUsage)
            }
            return
          }
          if (event.type === "text-delta" && event.delta) {
            shown += event.delta
            const text = shown
            /* Written down before the composer is asked whether it is still
               showing this thread. The journal is the answer's own, and it is
               written whether or not anyone is looking at it. */
            writePartial(threadId, text)
            if (!stillHere()) return
            setTurns((list) =>
              list.map((turn) =>
                turn.id === id && turn.role === "assistant"
                  ? { ...turn, text, streaming: true }
                  : turn
              )
            )
          }
        },
        controller.signal,
      )

      /* Settle the turn from the text that actually arrived, then store it. The
         reply is persisted here as well as on send, because until this point
         only the user's half of the exchange exists.

         The composer is only updated if it is still showing this side. A reply
         that arrives after the user has switched is kept — it belongs to the
         thread it was asked on — but it is not put on screen under the other
         side's conversation. */
      const settled: Turn[] = [
        ...history,
        { id, role: "assistant", text: shown, streaming: false },
      ]
      if (stillHere()) {
        setTurns(settled)
        setStatus("ready")
      }
      /* The answer is complete, so the journal says so. It is not removed
         yet: the conversation is written next, and that write can fail. A
         journal left behind is the answer, and the next launch puts it back. */
      await finishPartial(threadId, false)
      void persist(settled, { ...write, usage: reported }).then((saved) => {
        if (saved) void discardPartial(threadId)
      })

      /* The reply is on screen, so it needs no announcement — unless the app
         is in the background, which is the whole case. The rule is written
         once, in `notifications.ts`, and it is answered here by what this
         component knows: the reply finished, and this is the conversation it
         belongs to.

         The title is the conversation's name rather than the app's, because a
         toast that says only "a reply finished" tells the reader nothing
         when there is more than one conversation, and the whole point is
         knowing which one to come back to. */
      const title =
        write.side === "chat"
          ? findChat(threadId)?.title
          : findSession(threadId)?.title
      void announceReply({ title: title || "Tavi", text: shown })
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
      if (stillHere()) {
        setTurns(settled)
        setStatus("ready")
      }
      /* The answer stopped rather than finished, and the journal says so. */
      await finishPartial(threadId, true)
      void persist(settled, { ...write, usage: reported }).then((saved) => {
        if (saved) void discardPartial(threadId)
      })
    } finally {
      abortRef.current = null
    }
  }

  /**
   * Writes the current thread to storage.
   *
   * Called once a turn settles, so a half-streamed reply is never stored as if
   * it were complete. The id comes from a ref rather than state: `persist`
   * runs from inside an async stream that outlives the render which started
   * it, so a state value captured at call time would still be stale and create
   * a second thread.
   *
   * The thread goes into the store for the side it belongs to — the chat store
   * or the code-session store — because a chat and a session are different
   * objects, and one of them appearing in the other's list is the thing this
   * separation exists to prevent.
   *
   * **The id is decided once, when the turn is sent**, and carried here in the
   * write. It is not read from the composer's own state at the moment of the
   * write, because that state can change in between — the user can press
   * "New", or switch to the other surface, while the reply is still arriving —
   * and a write that then finds no open thread creates a *second* one with the
   * same conversation in it. Two threads with the same title, one of which
   * nobody will ever open, is worse than losing a reply.
   */
  const persist = async (next: Turn[], write: WriteState): Promise<boolean> => {
    const base = {
      turns: await toStoredTurns(next, projectFiles),
      model: write.model || undefined,
      effort: write.effort || undefined,
      /* The provider the thread is about. It is recorded, not enforced: the
         conversation is text and the tools are the same whichever provider
         answers, so the thread remembers where it began without refusing to
         go somewhere else. */
      provider: write.provider || undefined,
      usage: write.usage ?? undefined,
    }
    /* The thread the turn was asked about, before the write. */
    const asked = write.id
    const saved =
      write.side === "chat"
        ? await saveChat(asked, base)
        : await saveSession(asked, {
            ...base,
            mode: write.mode,
            folder: write.folderId,
            folderName: write.folderName,
          })
    /* The reply's own write reuses the thread this one made. */
    write.id = saved.id
    /* Which thread the composer has open. Only a write that belongs to the
       thread now on screen may change it: a reply that arrives after the user
       has switched surfaces, or pressed "New", belongs to the thread it was
       asked on — not to the conversation now on screen. If it were allowed to
       change it, the next message on the side now showing would find no open
       thread and make a second one with the same conversation in it. */
    if (replyMayTouchComposer(write.side, asked, activeRef.current)) {
      activeRef.current = { side: write.side, id: saved.id }
      /* The thread the side had open, whatever side the composer is on — the
         rail highlights it, and switching back to that side finds it. */
      setActiveBySide((current) => ({ ...current, [write.side]: saved.id }))
    }

    /* A write that was refused is not a failure the user can see on their own:
       the conversation is still on screen, and the rail still lists it, and
       both are gone the next time the app opens. So it is said out loud.

       Whether it happened is also returned, because the answer's journal is
       only removed once the answer is safely in the conversation. A journal
       left behind is the answer, and the next launch puts it back. */
    const failure =
      write.side === "chat" ? chatWriteError() : sessionWriteError()
    if (failure) {
      setStatus("error")
      setSaveError(failure)
    } else {
      setSaveError(null)
    }
    return !failure
  }

  /**
   * What a write needs to know, captured when the turn was sent.
   *
   * The reply comes back later, and by then the user may have changed the
   * model, the folder or the surface. A thread records the settings it was
   * actually run with, not the ones that happen to be in force when the
   * answer arrives — and the thread it belongs to is decided now too, not when
   * the answer arrives.
   */
  const captureWrite = (): WriteState => ({
    side: variant,
    /* The thread this turn belongs to: the one that is open on this side, or
       none yet, in which case the write makes one. */
    id: threadIdFor(variant, activeRef.current),
    model,
    effort,
    provider,
    mode,
    folderId: folder?.id,
    folderName: folder?.name,
    usage,
  })

  const send = async (message: PromptMessage) => {
    const id = `${Date.now()}`
    const next: Turn[] = [...turns, { id: `${id}-user`, role: "user", message }]
    setTurns(next)
    setStatus("submitted")
    const write = captureWrite()
    /* The message is saved before the request goes out. A reply is written to
       the thread the message was asked on, and that thread has to exist
       before the reply can arrive. */
    await persist(next, write)
    /* The write above settled the conversation — it made one if there was not
       one — so the reply has a thread to belong to and a journal to be
       written against. */
    const threadId = write.id
    if (!threadId) return
    void respondReal(`${id}-assistant`, next, write, threadId)
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
    void persist(settled, captureWrite())
  }

  /* Opens a folder the user will actually grant us, and keeps it in recents.
     Nothing is inserted that this app has not been given access to read. */
  const browse = async () => {
    const picked = await pickWorkspace()
    if (!picked) return
    setFolders(await listWorkspaces())
    setFolderId(picked.id)
  }

  const chooseFolder = (id: string) => {
    setFolderId((current) => (current === id ? undefined : id))
  }

  /**
   * Takes a folder out of the picker.
   *
   * It does not touch the sessions that were run against it. They keep their
   * history, keep the project they were run against, and stay in the rail —
   * forgetting where to work from is not the same as throwing the work away.
   */
  const forget = async (id: string) => {
    await forgetWorkspace(id)
    setFolders(await listWorkspaces())
    if (folderId === id) setFolderId(undefined)
  }

  /**
   * Points a folder that has moved at its new place.
   *
   * The grant keeps its id, so the sessions that were run against the folder
   * stay attached to it, and the folder's files come back.
   */
  const relink = async (id: string) => {
    const relinked = await relinkWorkspace(id)
    setFolders(await listWorkspaces())
    if (relinked) setNotice(`Folder linked to ${relinked.name}.`)
  }

  /**
   * Starts a new thread on a side.
   *
   * It resets that side's conversation and nothing else: the other side's
   * thread is untouched, and this side keeps its model, its effort and — in
   * Code — the folder it was pointed at.
   */
  const newThread = (side: Side) => {
    resetThread(side)
    /* A new thread should not open on the starters the last one ended on. Done
       here rather than watched for, because the open thread goes to null for a
       new thread *and* for an unassigned one - two new threads in a row leave
       it unchanged and a dependency would not notice the second. */
    setStarterOffset((n) => n + 1)
  }

  /**
   * The rail's "New" row, and the tray's and the menu's.
   *
   * It starts a new thread on the side it was asked for and empties the
   * composer. The thread that was open stays stored, and the other side's
   * thread is not touched at all.
   */
  const reset = (side: Side = variant) => {
    newThread(side)
    requestAnimationFrame(() =>
      dockRef.current?.querySelector("textarea")?.focus()
    )
  }

  /**
   * The rail's "open a thread" row.
   *
   * The side is not passed in, because a thread knows which side it belongs to
   * — a chat is a chat and a session is a session, and the ids say which.
   */
  const open = (id: string) => {
    if (findChat(id)) {
      openThread("chat", id)
      return
    }
    if (findSession(id)) openThread("code", id)
  }

  /* The rail sits above this block and cannot reach its handlers, so they are
     published here. Written every render in a layout effect: both functions are
     rebuilt each time, and a dependency on them would either republish in a
     loop or require memoising functions that were never written to be stable. */
  const threadBridge = useThreadBridge()
  React.useLayoutEffect(() => {
    threadBridge.functions.current = { reset, open }
  })
  /* Which thread is open is state, because the rail has to redraw its list when
     it changes — unlike the handlers above, which only ever get called. */
  React.useEffect(() => {
    threadBridge.setActiveId(activeSessionId)
  }, [activeSessionId, threadBridge])
  /* Which thread is answering is state for the same reason. The rail draws the
     thread list, so a row has to be able to say that this one is working — and
     it is the live stream that says so, not a flag the row makes up. */
  React.useEffect(() => {
    threadBridge.setRunningId(busy ? activeSessionId : null)
  }, [busy, activeSessionId, threadBridge])

  /**
   * Switching sides shows the other side's thread.
   *
   * The composer is one shell with two regions, and the region that is showing
   * has to be showing *that side's* conversation — so the switch loads the
   * thread the new side had open, or nothing if it had none.
   *
   * A layout effect rather than an ordinary one, so the swap happens before
   * the browser paints: otherwise there is a frame in which the old side's
   * conversation is drawn under the new side's composer, which is exactly the
   * confusion this is meant to remove.
   *
   * Loading also aborts a reply in flight. One composer, one stream: the
   * partial answer is kept and marked stopped, and the side it belonged to is
   * exactly where you left it.
   */
  React.useLayoutEffect(() => {
    loadThread(variant, activeBySide[variant])
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [variant])

  /**
   * A thread that is deleted while it is open stops being open.
   *
   * The rail's context menu can delete the thread the composer is showing, and
   * the composer has to notice: a conversation that no longer exists is not a
   * conversation. The stores say so themselves, so the composer listens to
   * them rather than to the rail.
   */
  const loadThreadRef = React.useRef(loadThread)
  loadThreadRef.current = loadThread
  React.useEffect(() => {
    const check = () => {
      const side = variant
      const id = activeBySide[side]
      if (!id) return
      const record = side === "chat" ? findChat(id) : findSession(id)
      if (!record) loadThreadRef.current(side, null)
    }
    const stopChats = onChatsChanged(check)
    const stopSessions = onSessionsChanged(check)
    return () => {
      stopChats()
      stopSessions()
    }
  }, [variant, activeBySide])

  /* The composer text is mirrored into a ref, because the idle rotation has to
     know whether the box is empty before it turns the starters over, and
     reading it on every keystroke would re-render the whole block to answer a
     question only a timer ever asks. */
  React.useEffect(() => {
    draftRef.current = content.text
  }, [content.text])

  /**
   * The model picker, shared by both variants.
   *
   * It was previously written out twice — once inside Code's action row, once
   * inside Chat's meta row — which meant the two copies could drift apart, and
   * this element is the one that moves between them when the variant changes.
   * One definition keeps both homes identical.
   */
  const composerModel = (
    <>
      <PromptInputProvider
        provider={provider}
        onProviderChange={setProvider}
        keys={keys ?? []}
      />
      {/* A CLI that chooses its own model has no model picker: an empty
          picker is a claim that there is a choice, and there is not one. */}
      {isCliProviderId(provider) && (cliModels ?? []).length === 0 ? null : (
        <PromptInputModel
          models={modelOptions}
          model={model}
          onModelChange={setModel}
          provider={provider}
          levels={isCliProviderId(provider) ? [] : efforts}
          effort={effort}
          onEffortChange={setEffort}
          recommended="medium"
          noKey={
            !isCliProviderId(provider) && keys !== null && !hasKey(keys, provider)
          }
          error={modelsError}
          catalogue={catalogueFreshness}
        />
      )}
    </>
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
        /* The same facts as any other request, so a summary is written with
           the same framing as the conversation it summarises. */
        variant,
        ...(variant === "code" ? { mode, folder: folder?.name } : {}),
        config: { modelName: model },
      })
      if (!summary) return
      const next: Turn[] = [
        { id: `${Date.now()}-summary`, role: "summary", text: summary },
        ...turns.slice(cut),
      ]
      setTurns(next)
      setUsage(null)
      await persist(next, captureWrite())
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
      {/* The top padding is the title bar's height, and the title bar is drawn
          over the top of the work area. The bar is the app's only strip at the
          top of the window now — the window has no caption of its own — so the
          conversation starts under it rather than under a second bar.

          The padding is on the main rather than on what is inside it, so the
          background still reaches the top of the window: the work area's
          colour has to be there for the title bar to sit against, and the
          curve where the work area meets the rail is cut out of this
          background. */}
      <main className="flex h-svh flex-col bg-background pt-(--shell-top-bar-h)">
        {empty ? (
          <div key="intro" className="flex flex-1 flex-col items-center justify-end px-4 pb-7">
            <h1 className="text-center text-2xl font-normal text-balance motion-safe:animate-in motion-safe:animation-duration-500 motion-safe:fade-in-0">
              {/* Each side asks its own question. "What are we working on?" is
                  a code question, and it would be a strange thing to read over
                  an empty chat. */}
              {variant === "code" ? "What are we working on?" : "What can I help with?"}
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
                            ) : turn.incomplete ? (
                              /* Not "Stopped": the user did not stop it. The
                                 app died, or was closed, while it was being
                                 written — and saying otherwise would be a
                                 small lie about what happened. */
                              <p className="text-xs text-muted-foreground">
                                Cut off — this answer did not finish
                              </p>
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
          {saveError ? (
            <p
              role="alert"
              className="text-destructive mb-2 flex items-start gap-2 px-1 text-xs"
            >
              <CircleAlertIcon className="mt-0.5 size-3.5 shrink-0" />
              <span>
                {saveError} It is on screen now, but it will be gone the next
                time the app opens.
              </span>
            </p>
          ) : null}
          {notice ? (
            <p
              role="status"
              className="text-muted-foreground mb-2 px-1 text-xs"
            >
              {notice}
            </p>
          ) : null}
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
            composerContent={content}
            onComposerContentChange={onContentChange}
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
                      <PromptInputDictation />
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
                      <PromptInputFolderSelect
                        label={folderSource.label}
                        folders={folders}
                        value={folderId}
                        onValueChange={chooseFolder}
                        onForget={(id) => void forget(id)}
                        onRelink={(id) => void relink(id)}
                        onOpenFolder={() => void browse()}
                        onClone={() => setCloneOpen(true)}
                        placeholder={folderSource.placeholder}
                        icon={<FolderOpenIcon />}
                      />
                    ) : (
                      <span className="text-muted-foreground me-auto text-xs">
                        Folder access needs a Chromium-based browser
                      </span>
                    )}
                  </PromptInputFooter>
                </PromptInputInset>
              </VariantRegion>

              <VariantRegion regionKey="variant-chat-body" active={variant === "chat"}>
                <PromptInputBody>
                  <PromptInputAttachments />
                  <PromptInputTextarea autoFocus placeholder="Ask anything" />
                  <PromptInputActions>
                    <PromptInputMeter />
                    <PromptInputDictation />
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
            {/* The @ menu lists the files in the folder this session is
                pointed at, so it belongs to Code. A chat has no folder, and a
                chat that could mention files in one would be a conversation
                about somebody's working tree without their having asked. */}
            {variant === "code" && fileMenu.length > 0 ? (
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
              onCancel={() => {
                void cancelClone()
                setCloneState({ phase: "idle" })
              }}
            />
          </PromptInput>
        </div>
        {empty ? <div key="outro" className="flex-1" /> : null}
      </main>
    </MessageScrollerProvider>
  )
}
