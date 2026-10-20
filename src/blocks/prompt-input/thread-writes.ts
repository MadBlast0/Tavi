import type { Side } from "@/lib/sides"

/**
 * The two decisions that keep a chat and a code session apart.
 *
 * They are small, and they are the whole of a class of bug that is very hard
 * to see: both of them go wrong in the same way, by letting one side's
 * conversation end up under the other side's composer.
 */

/** Which thread the composer has open, and which side it is on. */
export type OpenThread = {
  side: Side
  id: string | null
}

/**
 * The thread a turn belongs to.
 *
 * A turn is sent on a side, and it belongs to the thread that side has open —
 * or to none, in which case the write makes one.
 *
 * The decision is made when the turn is sent and carried through to the
 * reply's write, because the composer can change while the reply is on its
 * way: the user can press "New", or switch to the other surface, and the
 * reply still belongs to the thread it was asked on. Reading the composer's own
 * state at the moment of the write is what produces two threads with the same
 * conversation in them.
 */
export const threadIdFor = (side: Side, open: OpenThread): string | null =>
  open.side === side ? open.id : null

/**
 * Whether a reply may still touch the composer.
 *
 * A reply belongs to the side it was asked on, and to the thread it was asked
 * about. If the composer has moved to the other surface, or to nothing at all
 * because the user pressed "New", the reply is kept on its own thread and the
 * composer is left alone — otherwise one side's conversation ends up under the
 * other side's composer, and the next message there takes it along and saves
 * it as a thread of the wrong kind.
 *
 * The reply's own id is the one it was asked about, which is not always the
 * id the composer has open: the first message of a thread is asked before the
 * thread exists, so its id is filled in by the write that makes it.
 */
export const replyMayTouchComposer = (
  replySide: Side,
  replyId: string | null,
  open: OpenThread,
): boolean => open.side === replySide && open.id === replyId
