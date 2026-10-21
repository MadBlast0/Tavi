/**
 * Where the conversations live.
 *
 * The website has no app-data directory, so it keeps them in browser storage.
 * The desktop app has one, and Rust writes to it: a conversation that is only
 * in the webview's storage can be taken by "clear site data" or by a browser
 * under pressure, and an installed app that forgets its conversations is not
 * an installed app.
 *
 * The two are told apart here, and nowhere else. Everything above this file
 * asks a store for threads and does not care where they came from.
 */

import {
  clearThreads as clearDesktopThreads,
  readThreads as readDesktopThreads,
  writeThreads as writeDesktopThreads,
} from "./desktop.ts"
import { isDesktopApp } from "./platform.ts"
import { forgetStorage, readStorage, writeStorage } from "./storage.ts"

/** The two collections of conversations there are. */
export type ThreadKind = "chats" | "sessions"

/**
 * A place conversations can be kept.
 *
 * The records are passed as a JSON array rather than as objects, so neither
 * side has to know what a turn is. What a chat is allowed to carry, and what
 * a code session is, is decided above this line.
 */
export type ThreadRepository = {
  /** Where the conversations are kept. */
  readonly backend: "browser" | "desktop"
  /** Every record, as a JSON array. */
  read: () => Promise<string>
  /** Replaces them. Resolves false when the write did not happen. */
  write: (records: string) => Promise<boolean>
  /** Removes them all. */
  clear: () => Promise<void>
  /**
   * Brings conversations across from where they used to live.
   *
   * A no-op for the browser, which has always kept them where they are. On
   * the desktop it moves the ones the webview was holding into the app's own
   * file, and it does that only once the durable copy has been read back.
   */
  migrate: () => Promise<void>
}

/** How many records a JSON array holds. Zero for anything unreadable. */
const recordCount = (records: string): number => {
  try {
    const parsed = JSON.parse(records)
    return Array.isArray(parsed) ? parsed.length : 0
  } catch {
    return 0
  }
}

/**
 * Browser storage.
 *
 * The website's own store, and the desktop app's store before the app owned
 * its storage. A write that the browser refuses — a full quota, a private
 * window — resolves false rather than throwing, so the caller can try again
 * with less.
 */
const browserRepository = (key: string): ThreadRepository => ({
  backend: "browser",
  read: async () => readStorage(key) ?? "[]",
  write: async (records) => writeStorage(key, records),
  clear: async () => {
    forgetStorage(key)
  },
  migrate: async () => {},
})

/**
 * The conversations that were in the webview's storage, brought across.
 *
 * The source is only removed once the durable copy has been read back and
 * found to be there. A migration that cannot be verified leaves the source
 * where it is and the next launch tries again: a conversation is worth more
 * than the tidiness of having moved it.
 *
 * It is written as a function of the two places it touches, so it can be
 * tested without a desktop app.
 */
export const migrateConversations = async (
  durable: { read: () => Promise<string>; write: (records: string) => Promise<boolean> },
  legacyKey: string,
): Promise<void> => {
  const stored = await durable.read()
  if (recordCount(stored) > 0) return

  const legacy = readStorage(legacyKey)
  if (!legacy || recordCount(legacy) === 0) return

  const written = await durable.write(legacy)
  if (!written) return

  const check = await durable.read()
  if (recordCount(check) < recordCount(legacy)) return
  forgetStorage(legacyKey)
}

/**
 * The app's own file, written by Rust.
 */
const desktopRepository = (kind: ThreadKind, legacyKey: string): ThreadRepository => {
  const durable = {
    read: () => readDesktopThreads(kind),
    write: async (records: string) => {
      try {
        await writeDesktopThreads(kind, records)
        return true
      } catch {
        return false
      }
    },
  }
  return {
    backend: "desktop",
    read: durable.read,
    write: durable.write,
    clear: async () => {
      await clearDesktopThreads(kind)
    },
    migrate: () => migrateConversations(durable, legacyKey),
  }
}

/**
 * The repository for one collection.
 *
 * The desktop app writes to its own file; everything else writes to browser
 * storage. The key is the browser one, and is what the migration reads from.
 */
export const repositoryFor = (kind: ThreadKind, key: string): ThreadRepository =>
  isDesktopApp() ? desktopRepository(kind, key) : browserRepository(key)
