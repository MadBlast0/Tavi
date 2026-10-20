/**
 * Code sessions.
 *
 * A session is a conversation run against a repository: it has a folder, an
 * agent mode, and its own history. It is a different object from a chat and
 * lives in a different store — see `chats.ts` for why.
 *
 * The folder is recorded twice: `folder` is the folder's id, which is what
 * identifies it, and `folderName` is what the rail calls it. The id is not
 * the directory's name, because two directories can share a name and a
 * session has to stay attached to the one it was run against.
 */

import {
  createThreadStore,
  type ThreadBase,
  type ThreadDraft,
  type ThreadStore,
} from "@/lib/threads"

/** What a code session carries that a chat does not. */
export type SessionExtra = {
  /** The agent behaviour: edit, plan or ask. */
  mode?: string
  /** The folder's id — what the session is attached to. */
  folder?: string
  /** The folder's name — what the rail calls it. */
  folderName?: string
}

export type StoredSession = ThreadBase & SessionExtra

export type SessionDraft = ThreadDraft<SessionExtra>

export type SessionStore = ThreadStore<SessionExtra>

export const sessionStore: SessionStore = createThreadStore<SessionExtra>({
  key: "code-sessions.v1",
  prefix: "s-",
  signal: "tavi:code-sessions-changed",
})

/** Every session, newest first. */
export const listSessions = (): StoredSession[] => sessionStore.list()

/** One session, by its id. */
export const findSession = (id: string): StoredSession | undefined =>
  sessionStore.find(id)

/** Writes a session, creating it when the id is unknown. */
export const saveSession = (
  id: string | null,
  draft: SessionDraft,
): StoredSession => sessionStore.save(id, draft)

export const deleteSession = (id: string) => sessionStore.remove(id)

export const renameSession = (id: string, title: string) =>
  sessionStore.rename(id, title)

export const togglePinSession = (id: string) => sessionStore.togglePin(id)

export const forkSession = (id: string): StoredSession | undefined =>
  sessionStore.fork(id)

/** Listen for sessions changing. Returns an unsubscribe function. */
export const onSessionsChanged = (listener: () => void): (() => void) =>
  sessionStore.subscribe(listener)
