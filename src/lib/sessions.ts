/**
 * Conversation sessions.
 *
 * A session is one thread: the messages, the model and mode it was run with, and
 * the folder it was pointed at. They are persisted so a thread survives a
 * reload, which is the entire reason this store exists — before it, the menu
 * rendered three invented rows that did nothing when clicked.
 *
 * `Turn` lives here rather than in the view because it has to be serialisable:
 * the view's version carries `File` objects and streaming flags, neither of
 * which survives a JSON round trip.
 */

export type StoredFile = {
  name: string
  size: number
  /** Text captured at send time, so a restored thread still has its context. */
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

export type StoredSession = {
  id: string
  title: string
  createdAt: number
  updatedAt: number
  turns: StoredTurn[]
  model?: string
  effort?: string
  mode?: string
  folder?: string
  /**
   * When the thread was pinned, or absent if it is not.
   *
   * A thread stores its own pin rather than a separate list of pinned ids, so
   * pinning cannot leave a dangling reference if the thread is deleted, and a
   * thread that is unpinned and re-pinned comes back to the top.
   */
  pinnedAt?: number
}

export type SessionDraft = Omit<StoredSession, "id" | "createdAt" | "updatedAt" | "title">

const KEY = "ai-app.sessions.v1"
const MAX_SESSIONS = 50

const safeParse = (raw: string | null): StoredSession[] => {
  if (!raw) return []
  try {
    const parsed = JSON.parse(raw)
    if (!Array.isArray(parsed)) return []
    return parsed.filter(
      (item): item is StoredSession =>
        Boolean(item) &&
        typeof item.id === "string" &&
        typeof item.title === "string" &&
        Array.isArray(item.turns),
    )
  } catch {
    return []
  }
}

const read = (): StoredSession[] => {
  if (typeof localStorage === "undefined") return []
  return safeParse(localStorage.getItem(KEY))
}

/**
 * Fired after the store changes.
 *
 * The store is the only thing that knows when a thread is added, renamed or
 * removed, and the things showing that list are not always the thing that
 * changed it — sending a message in the composer writes a thread, which has to
 * appear in the rail's list immediately. Without this the rail could only find
 * out by re-reading on a reload, which is what it was doing, and what it must
 * not keep doing: a list that only catches up after a refresh reads as the
 * message not having been sent.
 */
const CHANGED = "tavi:sessions-changed"

/** Subscribe to changes to the store. Returns an unsubscribe function. */
export const onSessionsChanged = (listener: () => void): (() => void) => {
  if (typeof window === "undefined") return () => {}
  window.addEventListener(CHANGED, listener)
  return () => window.removeEventListener(CHANGED, listener)
}

const write = (sessions: StoredSession[]) => {
  if (typeof localStorage === "undefined") return
  let stored = false
  try {
    localStorage.setItem(KEY, JSON.stringify(sessions.slice(0, MAX_SESSIONS)))
    stored = true
  } catch {
    // Quota exhausted. Dropping the oldest thread is better than losing the
    // session the user is currently looking at.
    try {
      const trimmed = sessions.slice(0, Math.min(sessions.length, 5))
      localStorage.setItem(KEY, JSON.stringify(trimmed))
      stored = true
    } catch {}
  }
  if (stored && typeof window !== "undefined") {
    window.dispatchEvent(new Event(CHANGED))
  }
}

/**
 * A thread is named after what was actually said in it. Anything that would
 * render as an empty row ("New chat", a pasted newline) falls through to a
 * neutral label instead.
 */
export const titleFor = (turns: StoredTurn[]): string => {
  const first = turns.find((turn) => turn.role === "user")
  const text = first && first.role === "user" ? first.text.trim() : ""
  const flattened = text.replace(/\s+/g, " ")
  if (!flattened) return "Untitled thread"
  return flattened.length > 60 ? `${flattened.slice(0, 60).trimEnd()}…` : flattened
}

/** Newest first — the order the menu shows. */
export const listSessions = (): StoredSession[] =>
  read().sort((a, b) => b.updatedAt - a.updatedAt)

export const createSession = (draft: SessionDraft = { turns: [] }): StoredSession => {
  const now = Date.now()
  const session: StoredSession = {
    ...draft,
    id: `s-${now.toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
    title: titleFor(draft.turns),
    createdAt: now,
    updatedAt: now,
  }
  write([session, ...listSessions()])
  return session
}

/**
 * Saves a thread in place, creating it when the id is unknown. The title is
 * only ever set while it is still the placeholder, so renaming it by sending
 * the first real message does not clobber anything the user chose.
 */
export const saveSession = (
  id: string | null,
  draft: SessionDraft,
): StoredSession => {
  const sessions = listSessions()
  const now = Date.now()
  const existing = id ? sessions.find((s) => s.id === id) : undefined

  if (existing) {
    const next: StoredSession = {
      ...existing,
      ...draft,
      // Preserve a title the user set; otherwise refresh it from content.
      title: existing.title === "Untitled thread" ? titleFor(draft.turns) : existing.title,
      updatedAt: now,
    }
    write(sessions.map((s) => (s.id === id ? next : s)))
    return next
  }

  return createSession(draft)
}

export const deleteSession = (id: string) => {
  write(listSessions().filter((s) => s.id !== id))
}

export const renameSession = (id: string, title: string) => {
  const trimmed = title.trim()
  if (!trimmed) return
  write(listSessions().map((s) => (s.id === id ? { ...s, title: trimmed } : s)))
}

/**
 * Pins a thread to the top of its list, or unpins it.
 *
 * Pinning is deliberately not a stored list of ids. A pin that lives on the
 * thread cannot outlive the thread, and unpinning and re-pinning is one field
 * being set again rather than an entry being found and removed.
 */
export const togglePinSession = (id: string) => {
  write(
    listSessions().map((s) => {
      if (s.id !== id) return s
      if (s.pinnedAt) {
        const { pinnedAt: _dropped, ...rest } = s
        return rest
      }
      return { ...s, pinnedAt: Date.now() }
    }),
  )
}

/**
 * Copies a thread, its whole conversation, into a new one beside it.
 *
 * The copy carries the original's model, mode and folder so it can be continued
 * where the original left off, and is titled as a copy so it is never confused
 * with the thread it came from. Nothing links the two afterwards: a fork is an
 * independent thread, not a live branch.
 */
export const forkSession = (id: string): StoredSession | undefined => {
  const original = listSessions().find((s) => s.id === id)
  if (!original) return undefined
  const now = Date.now()
  const fork: StoredSession = {
    ...original,
    id: `s-${now.toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
    title: `Fork of ${original.title}`,
    createdAt: now,
    updatedAt: now,
    // A copy is not pinned. Pinning is about what to come back to, and a fork is
    // something you make once and usually leave.
    pinnedAt: undefined,
  }
  write([fork, ...listSessions()])
  return fork
}

export const clearSessions = () => write([])

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
