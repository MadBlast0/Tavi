/**
 * A conversation, whichever side it is on.
 *
 * A chat and a code session are different objects with different rules, and
 * they live in separate stores so that one list can never hold both. This is
 * the one place that knows about both of them, so that a caller holding a
 * side and an id does not have to branch on the side itself.
 *
 * It is a thin file on purpose: the stores own their own rules, and this
 * only chooses between them.
 */

import {
  clearChatUnread,
  findChat,
  markChatUnread,
  toggleMuteChat,
  type StoredChat,
} from "./chats.ts"
import {
  clearSessionUnread,
  findSession,
  markSessionUnread,
  toggleMuteSession,
  type StoredSession,
} from "./sessions.ts"
import type { Side } from "./sides.ts"

/** One conversation, of either kind. */
export type Conversation = StoredChat | StoredSession

/** Finds a conversation by its id, on the side it belongs to. */
export const findConversation = (
  side: Side,
  id: string,
): Conversation | undefined =>
  side === "chat" ? findChat(id) : findSession(id)

/**
 * Notes that a reply finished in this conversation while the reader was
 * elsewhere.
 *
 * The rail's own badge carries this, so the reader can see what they missed
 * even on a machine where the operating system refused to raise a toast.
 */
export const markConversationUnread = (side: Side, id: string) =>
  side === "chat" ? markChatUnread(id) : markSessionUnread(id)

/** Notes that the reader has looked at this conversation. */
export const clearConversationUnread = (side: Side, id: string) =>
  side === "chat" ? clearChatUnread(id) : clearSessionUnread(id)

/** Turns this conversation's announcements on or off. */
export const toggleMuteConversation = (side: Side, id: string) =>
  side === "chat" ? toggleMuteChat(id) : toggleMuteSession(id)
