/**
 * The conversation runtime.
 *
 * A reply's lifecycle, owned by something that outlives any component.
 *
 * **Why it is here.** Today the composer *is* the runtime. The turns, the
 * status, the abort handle and the error are all component state, so a reply
 * can only exist while the component that started it is mounted and showing
 * the same conversation. Switching threads aborts it. The comment in the code
 * says it plainly: *"One composer, one stream."*
 *
 * That single rule is what stands between the app and every parallel
 * feature — panes, per-conversation badges, a reply that keeps going while
 * you read another one, an announcement about a conversation you are not
 * looking at. It has to go first, and this is where it goes.
 *
 * **What it owns.**
 *
 * | | |
 * |---|---|
 * | The request | the stream, and the events that come back from it |
 * | The turns | the conversation's live turns, so a reply belongs to a conversation rather than to a component |
 * | The abort | one controller per conversation, so stopping one leaves the others running |
 * | The journal | the answer is written down as it grows, whether or not anyone is looking |
 * | The conversation | the finished answer is written into the conversation it belongs to |
 * | The announcement | the reader is told that a reply finished, by the rule in `notifications.ts` |
 *
 * **What it does not own.** What is *asked*. The request is prepared by the
 * caller, because preparing it needs the folder's files and the model's own
 * capabilities, and those are the viewer's facts.
 */

import { streamChat, type ChatRequest, type ToolActivity } from "./api.ts"
import { chatWriteError, findChat, saveChat } from "./chats.ts"
import { announceReply } from "./notifications.ts"
import {
  beginPartial,
  discardPartial,
  finishPartial,
  writePartial,
} from "./partials.ts"
import { findSession, saveSession, sessionWriteError } from "./sessions.ts"
import type { Side } from "./sides.ts"
import { toStoredTurns, type Turn } from "./turns.ts"
import type { WorkspaceFile } from "./workspace.ts"
import type { PromptTokenUsage } from "@/blocks/prompt-input/prompt-controls"

/** Where a conversation's reply is. */
export type ConversationStatus = "idle" | "submitted" | "streaming" | "error"

/**
 * What the thread records about the run that produced it.
 *
 * Captured when the turn is sent, because the reply comes back later and by
 * then the user may have changed the model, the folder or the surface. A
 * thread records the settings it was actually run with, not the ones that
 * happen to be in force when the answer arrives.
 */
export type RunFacts = {
  /** Which side the thread belongs to. */
  side: Side
  /** The model that answered. */
  model: string
  /** The effort level the turn was asked at. */
  effort: string
  /** The provider the request went to. */
  provider?: string
  /** The program's own session, when it has one. */
  sessionId?: string
  /** The agent mode. Code only. */
  mode: string
  /** The folder's id and name. Code only. */
  folderId: string | undefined
  folderName: string | undefined
}

/** One conversation's live state. */
export type Conversation = {
  /** The conversation's id. */
  id: string
  /** Which side it belongs to. */
  side: Side
  /** Where the reply is. */
  status: ConversationStatus
  /** The conversation's turns, as they stand. */
  turns: Turn[]
  /** The provider's own accounting for the turn. */
  usage: PromptTokenUsage | null
  /** The model that answered, when the provider says. */
  servedModel: string | null
  /** The last thing that went wrong, if anything did. */
  error: string | null
  /**
   * Whether this conversation is being compacted right now.
   *
   * It is the conversation's, and not the composer's: a compaction is
   * something happening to one conversation, and a reader who switched
   * conversations in the middle of one must not find the next one claiming
   * to be busy.
   */
  compacting: boolean
  /** When the turn was sent. */
  startedAt: number
  /** The assistant turn being written, while one is. */
  turnId: string | null
}

/** What a caller hands the runtime when a reply starts. */
export type ConversationStart = {
  /** The conversation the reply belongs to. */
  id: string
  /** The assistant turn's id. */
  turnId: string
  /** The conversation's turns, as they stand — the user's message is among them. */
  turns: Turn[]
  /** The request, ready to go. */
  request: ChatRequest
  /** What the thread records about the run. */
  write: RunFacts
  /** The folder's files, as they were when the turn was sent. */
  known: WorkspaceFile[]
  /**
   * Told when the program hands back the session it continued in.
   *
   * The next turn from the same side carries it, so a CLI conversation
   * continues where it left off rather than in a summary of it.
   */
  onSession?: (session: string) => void
}

/**
 * The facts of a run in flight.
 *
 * Separate from the conversation's live state, because a run has a beginning
 * and an end and the conversation does not: the turn's id, the settings the
 * run was asked at and the folder's files at the time are all facts about
 * *this* reply, and they are gone once it has landed.
 */
type Run = {
  id: string
  side: Side
  turnId: string
  write: RunFacts
  known: WorkspaceFile[]
  controller: AbortController
}

/**
 * The conversations, by id.
 *
 * A conversation is here once it has been shown, and it stays until it is
 * closed. A reply that is in flight keeps its entry whatever happens to the
 * view, because the reply is the entry's reason for existing.
 */
const conversations = new Map<string, Conversation>()

/** The runs in flight, by conversation. */
const runs = new Map<string, Run>()

/** The listeners of each conversation, and the listeners of every status. */
const listeners = new Map<string, Set<() => void>>()
const statusListeners = new Set<() => void>()

/**
 * The conversation the app is showing.
 *
 * The runtime answers "is this conversation the one being looked at?", and
 * this is how it knows. It is the one piece of view state the runtime needs,
 * and it is set by the view rather than read from it.
 */
let onScreen: string | null = null

/* -------------------------------------------------------------------------- */
/* Reading                                                                     */
/* -------------------------------------------------------------------------- */

/** A conversation's live state, if it has any. */
export const conversation = (id: string): Conversation | undefined =>
  conversations.get(id)

/** A conversation's turns, as they stand. */
export const conversationTurns = (id: string): Turn[] =>
  conversations.get(id)?.turns ?? []

/** The ids of the conversations with a reply in flight. */
export const runningConversations = (): string[] =>
  [...conversations.values()]
    .filter((item) => item.status === "submitted" || item.status === "streaming")
    .map((item) => item.id)

/** Whether a conversation is answering right now. */
export const isRunning = (id: string): boolean => {
  const status = conversations.get(id)?.status
  return status === "submitted" || status === "streaming"
}

/* -------------------------------------------------------------------------- */
/* Subscribing                                                                 */
/* -------------------------------------------------------------------------- */

/**
 * Subscribes to one conversation's changes.
 *
 * A view re-renders when its own conversation changes and not otherwise: the
 * text arrives many times a second, and a rail of fifty rows has no business
 * redrawing for it.
 */
export const subscribeConversation = (
  id: string,
  listener: () => void,
): (() => void) => {
  const set = listeners.get(id) ?? new Set<() => void>()
  set.add(listener)
  listeners.set(id, set)
  return () => {
    set.delete(listener)
    if (set.size === 0) listeners.delete(id)
  }
}

/**
 * Subscribes to every conversation's *status* changing.
 *
 * The rail draws a running dot, and a dot is about whether a conversation is
 * answering — not about what it is saying.
 */
export const subscribeStatuses = (listener: () => void): (() => void) => {
  statusListeners.add(listener)
  return () => {
    statusListeners.delete(listener)
  }
}

/* -------------------------------------------------------------------------- */
/* Writing                                                                     */
/* -------------------------------------------------------------------------- */

/**
 * Puts a conversation's turns in place, as they were read from storage.
 *
 * The live copy is the working copy; the stored one is what a conversation
 * file holds. They are different shapes, and this is where the stored one
 * becomes the live one.
 */
export const setConversationTurns = (
  id: string,
  side: Side,
  turns: Turn[],
): void => {
  const existing = conversations.get(id)
  conversations.set(id, {
    id,
    side,
    status: existing?.status ?? "idle",
    turns,
    usage: existing?.usage ?? null,
    servedModel: existing?.servedModel ?? null,
    error: existing?.error ?? null,
    compacting: existing?.compacting ?? false,
    startedAt: existing?.startedAt ?? Date.now(),
    turnId: existing?.turnId ?? null,
  })
  publish(id)
}

/**
 * The conversation's usage, and the model the server says it called.
 *
 * The usage is the provider's own report on the last finished turn, and it
 * is what the context dial reads — nothing here is estimated from character
 * counts.
 */
export const setConversationReport = (
  id: string,
  usage: PromptTokenUsage | null,
  servedModel: string | null,
): void => {
  const existing = conversations.get(id)
  if (!existing) return
  existing.usage = usage
  existing.servedModel = servedModel
  publish(id)
}

/**
 * The last thing that went wrong, if anything did.
 *
 * A conversation that could not be saved is still on screen, and the rail
 * still lists it, and both are gone the next time the app opens. So it is
 * said out loud rather than discovered.
 */
export const setConversationError = (id: string, error: string | null): void => {
  const existing = conversations.get(id)
  if (!existing) return
  existing.error = error
  publish(id)
}

/**
 * Says a conversation is waiting for its reply.
 *
 * Between the moment the thread exists and the moment the request goes out
 * there is a gap — the request is being prepared, and the preparation reads
 * the attachments — and the reader has to be told the app is working.
 */
export const markConversationPending = (id: string): void => {
  const existing = conversations.get(id)
  if (!existing) return
  existing.status = "submitted"
  publish(id)
  publishStatus()
}

/**
 * Puts a conversation's stored turns in place, unless a reply is in flight.
 *
 * **A conversation that is answering keeps the turns it has.** The answer
 * being written is not in the store yet, so loading the stored turns over
 * the top would throw it away — and the conversation would then be written
 * back without it, and the answer would be lost for good.
 *
 * So the stored turns are only loaded when nothing is in flight, and the
 * live ones are left alone when something is.
 */
export const loadConversation = (
  id: string,
  side: Side,
  turns: Turn[],
  report: { usage: PromptTokenUsage | null; servedModel: string | null },
): void => {
  if (isRunning(id)) return
  setConversationTurns(id, side, turns)
  setConversationReport(id, report.usage, report.servedModel)
}

/**
 * Says a conversation is being compacted, or that it is not.
 *
 * A compaction rewrites a conversation into a summary, and it takes a while.
 * The flag is the conversation's, so a reader who switched conversations in
 * the middle of one does not find the next one claiming to be busy.
 */
export const markConversationCompacting = (
  id: string,
  compacting: boolean,
): void => {
  const existing = conversations.get(id)
  if (!existing) return
  existing.compacting = compacting
  publish(id)
}

/**
 * Forgets a conversation.
 *
 * Called when the app closes one — a new chat, a deleted conversation. A
 * conversation with a reply in flight is not forgotten, because the reply is
 * still going to land in it.
 */
export const forgetConversation = (id: string): void => {
  /* A conversation with a reply in flight is not forgotten, because the
     reply is still going to land in it. */
  if (isRunning(id)) return
  conversations.delete(id)
  if (onScreen === id) onScreen = null
}

/** Says which conversation the app is showing. */
export const setShownConversation = (id: string | null): void => {
  onScreen = id
}

/**
 * Fails a conversation before its request goes out.
 *
 * The request is prepared by the caller, and preparing it can be refused —
 * an effort level the model does not publish is refused rather than
 * downgraded. The refusal is the answer, and it goes into the conversation
 * like any other.
 */
export const failConversation = (
  id: string,
  turnId: string,
  message: string,
): void => {
  const existing = conversations.get(id)
  if (!existing) return
  const has = existing.turns.some((turn) => turn.id === turnId)
  existing.turns = has
    ? existing.turns.map((turn) =>
        turn.id === turnId
          ? { ...turn, text: message, streaming: false }
          : turn,
      )
    : [
        ...existing.turns,
        { id: turnId, role: "assistant", text: message, streaming: false },
      ]
  existing.status = "error"
  existing.error = message
  publish(id)
  publishStatus()
}

/**
 * Starts a reply.
 *
 * Everything after the request is prepared belongs to the runtime: the
 * stream, the events, the journal, the conversation the answer lands in, and
 * the announcement.
 */
export const startConversation = (options: ConversationStart): void => {
  const { id, turnId, request, write } = options
  const controller = new AbortController()
  runs.set(id, {
    id,
    side: write.side,
    turnId,
    write,
    known: options.known,
    controller,
  })

  const existing = conversations.get(id)
  conversations.set(id, {
    id,
    side: write.side,
    status: "streaming",
    /* The turn being written joins the conversation's turns. It is here
       rather than added by a view, because a view that is not looking at
       this conversation still has to see the answer when it looks. */
    turns: [
      ...(existing?.turns ?? options.turns),
      { id: turnId, role: "assistant", text: "", streaming: true },
    ],
    usage: null,
    servedModel: null,
    error: null,
    compacting: false,
    startedAt: Date.now(),
    turnId,
  })
  publish(id)
  publishStatus()

  /* The answer is written down as it grows, and the journal is opened before
     the request goes out: an answer that exists only in memory is lost if
     the app dies in the middle of writing it. */
  beginPartial(id, turnId, write.side, write.model)

  void runConversation(options, controller)
}

/**
 * Stops a conversation's reply, and only that one.
 *
 * The reply is not thrown away: what arrived is kept and marked as stopped,
 * because it is what the reader saw, and because the model is told about it
 * next time so it does not carry on as though it had been finished.
 */
export const stopConversation = (id: string): void => {
  runs.get(id)?.controller.abort()
}

/* -------------------------------------------------------------------------- */
/* The stream                                                                  */
/* -------------------------------------------------------------------------- */

const runConversation = async (
  options: ConversationStart,
  controller: AbortController,
): Promise<void> => {
  const { id, turnId } = options
  /* Hoisted so the failure path can store what actually arrived. */
  let arrived = ""

  try {
    await streamChat(
      options.request,
      (event) => {
        if (event.type === "error") {
          throw new Error(event.errorText || "The stream reported an error")
        }
        if (event.type === "message-metadata") {
          if (event.messageMetadata?.modelId) {
            const current = conversations.get(id)
            if (current) {
              current.servedModel = event.messageMetadata.modelId
              publish(id)
            }
          }
          return
        }
        if (event.type === "finish") {
          /* The provider's own accounting for the turn that just ended. This
             is what the context dial reads — no estimate is involved. */
          const usage = event.messageMetadata?.usage
          if (usage) {
            const current = conversations.get(id)
            if (current) {
              current.usage = usage as PromptTokenUsage
              publish(id)
            }
          }
          /* The program's own session, kept so that the next turn carries on
             in it rather than starting again. */
          const session = event.messageMetadata?.sessionId
          if (session) options.onSession?.(session)
          return
        }
        if (event.type === "tool" && event.tool) {
          /* What the agent did is part of what it said, so it is shown as it
             happens and kept with the turn. */
          const tool = event.tool
          const current = conversations.get(id)
          if (!current) return
          current.turns = current.turns.map((turn) =>
            turn.id === turnId && turn.role === "assistant"
              ? { ...turn, tools: [...(turn.tools ?? []), tool] }
              : turn,
          )
          publish(id)
          return
        }
        if (event.type === "text-delta" && event.delta) {
          arrived += event.delta
          const text = arrived
          /* Written down before anyone is asked whether they are looking at
             it. The journal is the answer's own, and it is written whether or
             not anyone is watching. */
          writePartial(id, text)
          const current = conversations.get(id)
          if (!current) return
          current.turns = current.turns.map((turn) =>
            turn.id === turnId && turn.role === "assistant"
              ? { ...turn, text, streaming: true }
              : turn,
          )
          publish(id)
        }
      },
      controller.signal,
    )

    /* The answer is complete, so the journal says so. It is not removed yet:
       the conversation is written next, and that write can fail. A journal
       left behind is the answer, and the next launch puts it back. */
    await finishPartial(id, false)
    await settle(id, { stopped: false, text: arrived, finished: true })
  } catch (error) {
    const message = error instanceof Error ? error.message : "unknown error"
    const stopped = (error as Error).name === "AbortError"
    /* The answer stopped rather than finished, and the journal says so. */
    await finishPartial(id, true)
    await settle(id, {
      stopped,
      text: stopped
        ? arrived
        : arrived
          ? `${arrived}\n\n[Stopped: ${message}]`
          : `Request failed: ${message}`,
      finished: false,
    })
  } finally {
    runs.delete(id)
  }
}

/**
 * Writes the finished reply into its conversation, and says so.
 *
 * The conversation is written whether the reply finished or stopped, because
 * what arrived is part of the conversation either way. The journal is removed
 * only once the conversation holds the answer.
 */
const settle = async (
  id: string,
  outcome: { stopped: boolean; text: string; finished: boolean },
): Promise<void> => {
  const current = conversations.get(id)
  const run = runs.get(id)
  if (!current) return

  current.turns = current.turns.map((turn) =>
    turn.role === "assistant" && turn.id === current.turnId
      ? {
          ...turn,
          text: outcome.text,
          streaming: false,
          ...(outcome.stopped ? { stopped: true } : {}),
        }
      : turn,
  )
  current.status = "idle"
  current.turnId = null
  publish(id)
  publishStatus()

  /* The thread records the settings the run was actually asked with, and
     not the ones that happen to be in force now. */
  const write = run?.write
  const base = {
    turns: await toStoredTurns(current.turns, run?.known ?? []),
    model: write?.model || undefined,
    effort: write?.effort || undefined,
    /* The provider the thread is about, and the program's session. Both are
       recorded rather than enforced: the thread remembers where it began
       without refusing to go somewhere else. */
    provider: write?.provider || undefined,
    sessionId: write?.sessionId,
    usage: current.usage ?? undefined,
  }
  const saved =
    current.side === "chat"
      ? await saveChat(id, base)
      : await saveSession(id, {
          ...base,
          mode: write?.mode,
          folder: write?.folderId,
          folderName: write?.folderName,
        })

  /* A write that was refused is not a failure the user can see on their own:
     the conversation is still on screen, and the rail still lists it, and
     both are gone the next time the app opens. So it is said out loud. */
  const failure =
    current.side === "chat" ? chatWriteError() : sessionWriteError()
  if (failure) {
    current.error = failure
    publish(id)
  } else {
    /* The answer is safely in the conversation, so the journal can go. */
    await discardPartial(id)
  }

  /* The reader is told that a reply finished — by the rule, which knows
     whether the answer was somewhere they could see. */
  if (outcome.finished) {
    const stored =
      current.side === "chat" ? findChat(saved.id) : findSession(saved.id)
    await announceReply({
      title: stored?.title || "Tavi",
      text: outcome.text,
      id: saved.id,
      side: current.side,
      onScreen: onScreen === saved.id,
      muted: Boolean(stored?.mutedAt),
    })
  }
}

/* -------------------------------------------------------------------------- */
/* Publishing                                                                  */
/* -------------------------------------------------------------------------- */

/** Tells a conversation's own listeners that it changed. */
const publish = (id: string): void => {
  const set = listeners.get(id)
  if (!set) return
  for (const listener of set) listener()
}

/** Tells the status listeners that something started or finished. */
const publishStatus = (): void => {
  for (const listener of statusListeners) listener()
}
