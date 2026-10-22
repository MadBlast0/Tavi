/**
 * Opening a conversation, from anywhere.
 *
 * The composer is what shows a conversation, and it lives below almost
 * everything — the notification card that names a finished reply is raised
 * from a module, and the rail is a sibling of the composer rather than its
 * parent. So the two are joined by an event on the window rather than by a
 * prop threaded through everything in between, the same way the settings card
 * is opened.
 *
 * The listener is the thread bridge, which already publishes the composer's
 * two entry points, so this is the same seam reached from a different side.
 */

/** A conversation to open, named by its id. */
export const OPEN_THREAD = "tavi:open-thread"

/**
 * Asks for a conversation to be opened.
 *
 * The id is the conversation's own, and the side it belongs to is looked up
 * where it is opened: a chat and a code session are different conversations
 * and the app knows which is which.
 */
export const requestOpenThread = (id: string) => {
  if (typeof window === "undefined") return
  window.dispatchEvent(new CustomEvent<string>(OPEN_THREAD, { detail: id }))
}
