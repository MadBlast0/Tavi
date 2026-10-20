/**
 * The vocabulary both thread stores share.
 *
 * A chat and a code session are the same kind of thing at this level — a
 * conversation, with turns, a model, an effort level and a pin — and they
 * differ in what else they carry. A chat has no folder and no agent mode; a
 * session has both. Everything common lives here so the two stores cannot
 * drift apart, and the difference stays a difference rather than becoming a
 * field on every record that only one of them ever sets.
 *
 * The store itself is a factory rather than two hand-written copies, because
 * everything the two do — read, write, rename, pin, fork, subscribe — is
 * identical, and a copy is a copy that will drift.
 */

import { readStorage, writeStorage } from "./storage.ts"

export type StoredFile = {
  name: string
  size: number
  /** Text captured at send time, so a restored thread still keeps its context. */
  text?: string
}

export type StoredMention = {
  label: string
  /** Relative path inside the picked folder, when it came from the @ menu. */
  path?: string
}

export type StoredTurn =
  | { id: string; role: "user"; text: string; files: StoredFile[]; mentions: StoredMention[] }
  | { id: string; role: "assistant"; text: string; stopped?: boolean }
  /** Carries the summary it stands for, so it can be sent with later turns. */
  | { id: string; role: "summary"; text: string }

/**
 * The token usage the provider reported on a thread's last finished turn.
 *
 * It belongs to the thread, not to the window. The context dial reads it, and
 * the dial is showing the thread that is open — a number that belonged to
 * whichever thread happened to answer last would be a lie about the one on
 * screen.
 */
export type StoredUsage = {
  inputTokens?: number
  outputTokens?: number
  totalTokens?: number
  reasoningTokens?: number
  cachedInputTokens?: number
  inputTokenDetails?: {
    noCacheTokens?: number
    cacheReadTokens?: number
    cacheWriteTokens?: number
  }
  outputTokenDetails?: {
    textTokens?: number
    reasoningTokens?: number
  }
}

/** The fields every thread has, whichever side it belongs to. */
export type ThreadBase = {
  id: string
  title: string
  createdAt: number
  updatedAt: number
  turns: StoredTurn[]
  model?: string
  /**
   * The model's name at the time, so a thread says what answered it in the
   * words a person reads rather than in a provider's identifier.
   */
  modelName?: string
  effort?: string
  usage?: StoredUsage
  /**
   * When the thread was pinned, or absent if it is not.
   *
   * A thread stores its own pin rather than a separate list of pinned ids, so
   * pinning cannot leave a dangling reference if the thread is deleted, and a
   * thread that is unpinned and re-pinned comes back to the top.
   */
  pinnedAt?: number
}

/** What a caller writes when saving a thread. */
export type ThreadDraft<E extends object> = {
  turns: StoredTurn[]
  model?: string
  modelName?: string
  effort?: string
  usage?: StoredUsage
} & E

export type ThreadStore<E extends object> = {
  /** The storage key, without the namespace. */
  key: string
  /** Every thread, newest first. */
  list: () => Array<ThreadBase & E>
  /** One thread, by its id. */
  find: (id: string) => (ThreadBase & E) | undefined
  create: (draft: ThreadDraft<E>) => ThreadBase & E
  save: (id: string | null, draft: ThreadDraft<E>) => ThreadBase & E
  remove: (id: string) => void
  rename: (id: string, title: string) => void
  togglePin: (id: string) => void
  fork: (id: string) => (ThreadBase & E) | undefined
  /** Listen for changes. Returns an unsubscribe function. */
  subscribe: (listener: () => void) => () => void
}

const UNTITLED = "Untitled thread"

/**
 * A thread is named after what was actually said in it. Anything that would
 * render as an empty row ("New chat", a pasted newline) falls through to a
 * neutral label instead.
 */
export const titleFor = (turns: StoredTurn[]): string => {
  const first = turns.find((turn) => turn.role === "user")
  const text = first && first.role === "user" ? first.text.trim() : ""
  const flattened = text.replace(/\s+/g, " ")
  if (!flattened) return UNTITLED
  return flattened.length > 60 ? `${flattened.slice(0, 60).trimEnd()}…` : flattened
}

/**
 * "4s", "12m", "3h", "6d", "2mo", "1y" — the units a list of threads needs to
 * be read at a glance.
 *
 * One unit at a time, finest first, so a thread from a moment ago and one from
 * last year are both distinguishable without opening either. Anything coarser
 * merges two things a reader would want told apart — an hour ago and an hour
 * and a half ago are both "1h" if the step is days, and "just now" hides
 * whether a thread was started ten seconds or fifty.
 *
 * Days run to a month and months to a year rather than stopping at "Yesterday",
 * because in a rail of threads the question is usually "which of these did I
 * just leave" or "which of these is old", and both are answered by a number.
 */
export const formatWhen = (timestamp: number, now = Date.now()): string => {
  const seconds = Math.max(0, Math.round((now - timestamp) / 1000))
  if (seconds < 60) return `${seconds}s`

  const minutes = Math.round(seconds / 60)
  if (minutes < 60) return `${minutes}m`

  const hours = Math.round(minutes / 60)
  if (hours < 24) return `${hours}h`

  const days = Math.round(hours / 24)
  if (days < 30) return `${days}d`

  const months = Math.round(days / 30)
  if (months < 12) return `${months}mo`

  return `${Math.round(days / 365)}y`
}

/**
 * Builds a store for one side's threads.
 *
 * `E` is the extra shape that side's records carry: nothing at all for a
 * chat, and a folder and an agent mode for a code session. It is a type
 * parameter rather than an argument because it decides what a caller is
 * allowed to write, and that has to be checked at compile time rather than
 * discovered by a chat quietly acquiring a folder.
 */
export const createThreadStore = <E extends object>(options: {
  /** The storage key, without the namespace. */
  key: string
  /** The prefix on a thread's id, so a chat and a session are never confused. */
  prefix: string
  /** The event the store fires when it changes. */
  signal: string
  /** How many threads are kept. */
  cap?: number
}): ThreadStore<E> => {
  const { key, prefix, signal } = options
  const cap = options.cap ?? 50

  const isThread = (item: unknown): item is ThreadBase & E => {
    if (!item || typeof item !== "object") return false
    const candidate = item as Record<string, unknown>
    return (
      typeof candidate.id === "string" &&
      typeof candidate.title === "string" &&
      Array.isArray(candidate.turns)
    )
  }

  const read = (): Array<ThreadBase & E> => {
    if (typeof localStorage === "undefined") return []
    const raw = readStorage(key)
    if (!raw) return []
    try {
      const parsed = JSON.parse(raw)
      if (!Array.isArray(parsed)) return []
      return parsed.filter(isThread)
    } catch {
      return []
    }
  }

  const write = (threads: Array<ThreadBase & E>) => {
    if (typeof localStorage === "undefined") return
    let stored = writeStorage(key, JSON.stringify(threads.slice(0, cap)))
    if (!stored) {
      // Quota exhausted. Dropping the oldest thread is better than losing the
      // one the user is looking at.
      stored = writeStorage(key, JSON.stringify(threads.slice(0, 5)))
    }
    if (stored && typeof window !== "undefined") {
      window.dispatchEvent(new Event(signal))
    }
  }

  const list = () =>
    read().sort((a, b) => b.updatedAt - a.updatedAt)

  const find = (id: string) => read().find((thread) => thread.id === id)

  const create = (draft: ThreadDraft<E>): ThreadBase & E => {
    const now = Date.now()
    const thread = {
      ...draft,
      id: `${prefix}${now.toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
      title: titleFor(draft.turns),
      createdAt: now,
      updatedAt: now,
    } as ThreadBase & E
    write([thread, ...read()])
    return thread
  }

  /**
   * Saves a thread in place, creating it when the id is unknown. The title is
   * only ever set while it is still the placeholder, so renaming it by sending
   * the first real message does not clobber anything the user chose.
   */
  const save = (id: string | null, draft: ThreadDraft<E>): ThreadBase & E => {
    const threads = read()
    const now = Date.now()
    const existing = id ? threads.find((thread) => thread.id === id) : undefined

    if (existing) {
      const next = {
        ...existing,
        ...draft,
        title: existing.title === UNTITLED ? titleFor(draft.turns) : existing.title,
        updatedAt: now,
      } as ThreadBase & E
      write(threads.map((thread) => (thread.id === id ? next : thread)))
      return next
    }

    return create(draft)
  }

  const remove = (id: string) => {
    write(read().filter((thread) => thread.id !== id))
  }

  const rename = (id: string, title: string) => {
    const trimmed = title.trim()
    if (!trimmed) return
    write(
      read().map((thread) => (thread.id === id ? { ...thread, title: trimmed } : thread)),
    )
  }

  const togglePin = (id: string) => {
    write(
      read().map((thread) => {
        if (thread.id !== id) return thread
        if (thread.pinnedAt) {
          const { pinnedAt: _dropped, ...rest } = thread
          return rest as ThreadBase & E
        }
        return { ...thread, pinnedAt: Date.now() }
      }),
    )
  }

  /**
   * Copies a thread, its whole conversation, into a new one beside it.
   *
   * The copy carries the original's model, effort and — in Code — its folder
   * and agent mode, so it can be continued where the original left off, and is
   * titled as a copy so it is never confused with the thread it came from.
   * Nothing links the two afterwards: a fork is an independent thread, not a
   * live branch.
   */
  const fork = (id: string): (ThreadBase & E) | undefined => {
    const original = find(id)
    if (!original) return undefined
    const now = Date.now()
    const forkThread = {
      ...original,
      id: `${prefix}${now.toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
      title: `Fork of ${original.title}`,
      createdAt: now,
      updatedAt: now,
      // A copy is not pinned. Pinning is about what to come back to, and a fork
      // is something you make once and usually leave.
      pinnedAt: undefined,
    } as ThreadBase & E
    write([forkThread, ...read()])
    return forkThread
  }

  const subscribe = (listener: () => void) => {
    if (typeof window === "undefined") return () => {}
    window.addEventListener(signal, listener)
    return () => window.removeEventListener(signal, listener)
  }

  return { key, list, find, create, save, remove, rename, togglePin, fork, subscribe }
}
