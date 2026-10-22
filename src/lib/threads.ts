/**
 * The vocabulary both thread stores share.
 *
 * A chat and a code session are the same kind of thing at this level — a
 * conversation, with turns, a model, an effort level, a provider and a
 * pin — and they
 * differ in what else they carry. A chat has no folder and no agent mode; a
 * session has both. Everything common lives here so the two stores cannot
 * drift apart, and the difference stays a difference rather than becoming a
 * field on every record that only one of them ever sets.
 *
 * The store itself is a factory rather than two hand-written copies, because
 * everything the two do — read, write, rename, pin, fork, subscribe — is
 * identical, and a copy is a copy that will drift.
 */

import { repositoryFor, type ThreadKind } from "./thread-repository.ts"

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
  | {
      id: string
      role: "assistant"
      text: string
      /** The user stopped it. */
      stopped?: boolean
      /** It did not finish — the app died, or was closed, while it was being written. */
      incomplete?: boolean
    }
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
  effort?: string
  /**
   * The provider the thread was started with.
   *
   * It is what the models came from, and it is the provider the thread is
   * about: opening it shows that provider's models, and the picker names it.
   *
   * It is a record, not a rule. The provider can still be changed — the
   * conversation is text, the tools are the same whichever provider answers,
   * and the effort is checked against the new model — so the thread remembers
   * where it began without refusing to go somewhere else.
   */
  provider?: string
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
  effort?: string
  provider?: string
  usage?: StoredUsage
} & E

export type ThreadStore<E extends object> = {
  /** The storage key, without the namespace. */
  key: string
  /** Every thread, newest first. */
  list: () => Array<ThreadBase & E>
  /**
   * Loads the threads from where they are kept.
   *
   * Every write waits for this, so a write can never land on a store that has
   * not been read yet and take the rest of the history with it.
   */
  ready: () => Promise<void>
  /** One thread, by its id. */
  find: (id: string) => (ThreadBase & E) | undefined
  create: (draft: ThreadDraft<E>) => Promise<ThreadBase & E>
  /**
   * Puts a thread back exactly as it was — the same id, the same everything.
   *
   * This is what an import uses. A thread restored under a new id would be a
   * different thread, and importing the same backup twice would make two
   * copies of every conversation in it.
   */
  restore: (thread: ThreadBase & E) => Promise<ThreadBase & E>
  save: (id: string | null, draft: ThreadDraft<E>) => Promise<ThreadBase & E>
  remove: (id: string) => Promise<void>
  /** Removes every thread in this collection. */
  clear: () => Promise<void>
  rename: (id: string, title: string) => Promise<void>
  togglePin: (id: string) => Promise<void>
  fork: (id: string) => Promise<(ThreadBase & E) | undefined>
  /**
   * The last write that did not happen, if there was one.
   *
   * The threads on screen are the ones in memory, and a write that is refused
   * — a full disk, a browser with no room left — leaves the conversation on
   * screen and says here that it was not saved. Losing what the user can see
   * would be worse than losing what is on disk.
   */
  lastError: () => string | null
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
  /** Which collection this is. */
  kind: ThreadKind
}): ThreadStore<E> => {
  const { key, prefix, signal, kind } = options
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

  const repository = repositoryFor(kind, key)

  /**
   * The threads as they are right now.
   *
   * They are held here rather than read back on every call, because a write
   * has to know what else is there: the desktop app writes a file, and two
   * writes that each read the file and then each write their own version of it
   * back would lose one of them.
   */
  let threads: Array<ThreadBase & E> = []
  let loaded: Promise<void> | null = null
  let failure: string | null = null

  const parse = (raw: string): Array<ThreadBase & E> => {
    try {
      const parsed = JSON.parse(raw)
      if (!Array.isArray(parsed)) return []
      return parsed.filter(isThread)
    } catch {
      return []
    }
  }

  const announce = () => {
    if (typeof window !== "undefined") {
      window.dispatchEvent(new Event(signal))
    }
  }

  const ready = (): Promise<void> => {
    if (!loaded) {
      loaded = (async () => {
        try {
          /* The conversations that were in the webview's storage are brought
             across first, so the first read sees everything there is. */
          await repository.migrate()
          threads = parse(await repository.read())
        } catch (error) {
          /* The conversations could not be read. The store stays empty rather
             than holding half of them, and the app is told. */
          failure = error instanceof Error ? error.message : String(error)
          console.error("[threads] could not be read:", error)
        }
        announce()
      })()
    }
    return loaded
  }

  /**
   * Takes a new set of threads.
   *
   * The list is newest first, and the cap is the size policy: when there are
   * too many, the least recently used go. A thread that has just been written
   * to is at the front, so the conversation the user is in is never the one
   * that is dropped.
   */
  const apply = (next: Array<ThreadBase & E>) => {
    threads = next.slice(0, cap)
    announce()
  }

  /**
   * Writes the threads out.
   *
   * A write that is refused leaves the threads on screen and records why,
   * rather than throwing away the conversation the user is looking at.
   */
  const write = async (next: Array<ThreadBase & E>): Promise<void> => {
    const written = await repository.write(JSON.stringify(next))
    failure = written ? null : "The conversation could not be saved."
  }

  const list = () => [...threads].sort((a, b) => b.updatedAt - a.updatedAt)

  const find = (id: string) => threads.find((thread) => thread.id === id)

  const create = async (draft: ThreadDraft<E>): Promise<ThreadBase & E> => {
    await ready()
    const now = Date.now()
    const thread = {
      ...draft,
      id: `${prefix}${now.toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
      title: titleFor(draft.turns),
      createdAt: now,
      updatedAt: now,
    } as ThreadBase & E
    apply([thread, ...threads])
    await write(threads)
    return thread
  }

  /**
   * Saves a thread in place, creating it when the id is unknown. The title is
   * only ever set while it is still the placeholder, so renaming it by sending
   * the first real message does not clobber anything the user chose.
   */
  const save = async (
    id: string | null,
    draft: ThreadDraft<E>,
  ): Promise<ThreadBase & E> => {
    await ready()
    const now = Date.now()
    const existing = id ? threads.find((thread) => thread.id === id) : undefined

    if (existing) {
      const next = {
        ...existing,
        ...draft,
        title: existing.title === UNTITLED ? titleFor(draft.turns) : existing.title,
        updatedAt: now,
      } as ThreadBase & E
      apply([next, ...threads.filter((thread) => thread.id !== id)])
      await write(threads)
      return next
    }

    return create(draft)
  }

  const remove = async (id: string) => {
    await ready()
    apply(threads.filter((thread) => thread.id !== id))
    await write(threads)
  }

  /**
   * Removes every thread in this collection.
   *
   * The other collection is untouched: a chat and a code session are separate
   * things, and clearing one is not a reason to clear the other.
   */
  const clear = async () => {
    await ready()
    apply([])
    await write(threads)
  }

  const restore = async (thread: ThreadBase & E): Promise<ThreadBase & E> => {
    await ready()
    apply([thread, ...threads.filter((existing) => existing.id !== thread.id)])
    await write(threads)
    return thread
  }

  const rename = async (id: string, title: string) => {
    await ready()
    const trimmed = title.trim()
    if (!trimmed) return
    apply(
      threads.map((thread) =>
        thread.id === id ? { ...thread, title: trimmed } : thread,
      ),
    )
    await write(threads)
  }

  const togglePin = async (id: string) => {
    await ready()
    apply(
      threads.map((thread) => {
        if (thread.id !== id) return thread
        if (thread.pinnedAt) {
          const { pinnedAt: _dropped, ...rest } = thread
          return rest as ThreadBase & E
        }
        return { ...thread, pinnedAt: Date.now() }
      }),
    )
    await write(threads)
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
  const fork = async (id: string): Promise<(ThreadBase & E) | undefined> => {
    await ready()
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
    apply([forkThread, ...threads])
    await write(threads)
    return forkThread
  }

  const subscribe = (listener: () => void) => {
    if (typeof window === "undefined") return () => {}
    window.addEventListener(signal, listener)
    return () => window.removeEventListener(signal, listener)
  }

  return {
    key,
    list,
    ready,
    find,
    create,
    save,
    restore,
    remove,
    clear,
    rename,
    togglePin,
    fork,
    lastError: () => failure,
    subscribe,
  }
}
