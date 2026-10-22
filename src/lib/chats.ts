/**
 * Chats.
 *
 * A chat is a conversation and nothing else: no folder, no agent mode, no
 * repository. The fields it does *not* have are the point — a chat cannot be
 * given a folder by accident, because there is nowhere to put one.
 *
 * The store is separate from the code sessions' store, and not by preference:
 * a chat and a session are different objects with different rules, and one
 * list holding both would make them two views of one thing.
 */

import {
  createThreadStore,
  type ThreadBase,
  type ThreadDraft,
  type ThreadStore,
} from "./threads.ts"

/** A chat carries nothing beyond the fields every thread has. */
export type ChatExtra = Record<never, never>

export type StoredChat = ThreadBase

export type ChatDraft = ThreadDraft<ChatExtra>

export type ChatStore = ThreadStore<ChatExtra>

/**
 * The store.
 *
 * The key is `chats.v1` under the app's namespace, and the ids are prefixed
 * `c-` so a chat and a session can never be mistaken for one another — not by
 * a reader, and not by a bug.
 */
export const chatStore: ChatStore = createThreadStore<ChatExtra>({
  key: "chats.v1",
  prefix: "c-",
  signal: "tavi:chats-changed",
  kind: "chats",
})

/** Every chat, newest first. */
export const listChats = (): StoredChat[] => chatStore.list()

/**
 * Loads the chats from where they are kept.
 *
 * Awaited before the app renders, so the rail never shows an empty list for
 * the moment it takes to read them.
 */
export const readyChats = (): Promise<void> => chatStore.ready()

/** One chat, by its id. */
export const findChat = (id: string): StoredChat | undefined => chatStore.find(id)

/** Writes a chat, creating it when the id is unknown. */
export const saveChat = (
  id: string | null,
  draft: ChatDraft,
): Promise<StoredChat> => chatStore.save(id, draft)

export const deleteChat = (id: string) => chatStore.remove(id)

/** Removes every chat. The code sessions are untouched. */
export const clearChats = () => chatStore.clear()

/** Puts a chat back exactly as it was, for an import. */
export const restoreChat = (chat: StoredChat) => chatStore.restore(chat)

export const renameChat = (id: string, title: string) => chatStore.rename(id, title)

export const togglePinChat = (id: string) => chatStore.togglePin(id)

/**
 * Notes that a reply finished in this chat while the reader was elsewhere.
 *
 * The rail's own badge carries this, so the reader can see what they missed
 * even on a machine where the operating system refused to raise a toast.
 */
export const markChatUnread = (id: string) => chatStore.markUnread(id)

/** Notes that the reader has looked at this chat. */
export const clearChatUnread = (id: string) => chatStore.clearUnread(id)

/** Turns this chat's announcements on or off. */
export const toggleMuteChat = (id: string) => chatStore.toggleMute(id)

/**
 * Puts this chat in the archived list, or takes it out again.
 *
 * The chat is still a chat: it keeps its turns, and it can be brought back.
 */
export const setChatArchived = (id: string, archived: boolean) =>
  chatStore.setArchived(id, archived)

export const forkChat = (id: string): Promise<StoredChat | undefined> => chatStore.fork(id)

/** The last write that did not happen, if there was one. */
export const chatWriteError = (): string | null => chatStore.lastError()

/** Listen for chats changing. Returns an unsubscribe function. */
export const onChatsChanged = (listener: () => void): (() => void) =>
  chatStore.subscribe(listener)
