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

const write = (sessions: StoredSession[]) => {
  if (typeof localStorage === "undefined") return
  try {
    localStorage.setItem(KEY, JSON.stringify(sessions.slice(0, MAX_SESSIONS)))
  } catch {
    // Quota exhausted. Dropping the oldest thread is better than losing the
    // session the user is currently looking at.
    try {
      const trimmed = sessions.slice(0, Math.min(sessions.length, 5))
      localStorage.setItem(KEY, JSON.stringify(trimmed))
    } catch {}
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

export const clearSessions = () => write([])

/** "just now", "12m", "Yesterday", "4 Mar" — compact, like the menu needs. */
export const formatWhen = (timestamp: number, now = Date.now()): string => {
  const seconds = Math.max(0, Math.round((now - timestamp) / 1000))
  if (seconds < 60) return "just now"
  const minutes = Math.round(seconds / 60)
  if (minutes < 60) return `${minutes}m`
  const hours = Math.round(minutes / 60)
  if (hours < 24) return `${hours}h`
  const days = Math.round(hours / 24)
  if (days === 1) return "Yesterday"
  if (days < 7) return `${days}d`
  return new Date(timestamp).toLocaleDateString(undefined, {
    day: "numeric",
    month: "short",
  })
}
