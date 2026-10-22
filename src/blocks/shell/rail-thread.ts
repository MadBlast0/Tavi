import type { Side } from "@/lib/sides"

/**
 * What a row in the rail needs to know, whichever side it is on.
 *
 * The two sides store different things — a chat has no folder, a session has
 * one — but the row draws the same either way, so it is given the few fields it
 * actually reads, and the side it belongs to.
 */
export type RailThread = {
  id: string
  title: string
  updatedAt: number
  /** The model that answered it, by id. */
  model?: string
  /** The project a session is grouped under. A chat has none. */
  folder?: string
  /** The project's name — what the rail calls it. */
  folderName?: string
  /** When the thread was pinned, or absent if it is not. */
  pinnedAt?: number
  /**
   * When a reply finished in this thread while the reader was elsewhere, or
   * absent if there is nothing waiting.
   *
   * The badge says so, so the reader can see what they missed even where the
   * operating system declined to raise a toast.
   */
  unreadAt?: number
  /** When the thread was muted, or absent if it is not. */
  mutedAt?: number
  /** Which side the thread belongs to, and therefore which store holds it. */
  side: Side
}
