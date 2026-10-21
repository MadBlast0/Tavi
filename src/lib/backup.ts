/**
 * Getting the conversations out of the app, and back in.
 *
 * A user's conversations are theirs. They can be taken out in a file they can
 * read, put back in again, and removed entirely.
 *
 * The file is JSON, and it holds both collections: a chat and a code session
 * are the same kind of thing and belong in the same backup.
 */

import { dataDirectory, readTextFile, saveTextFile } from "./api.ts"
import { listChats, restoreChat, type StoredChat } from "./chats.ts"
import {
  listSessions,
  restoreSession,
  type StoredSession,
} from "./sessions.ts"

/** The version of the backup file's shape. */
export const BACKUP_VERSION = 1

/** What a backup file holds. */
export type Backup = {
  version: number
  /** When it was taken, in milliseconds since the epoch. */
  exportedAt: number
  chats: StoredChat[]
  sessions: StoredSession[]
}

/** The file a backup is written to, by default. */
export const backupFileName = (now = new Date()): string =>
  `tavi-conversations-${now.toISOString().slice(0, 10)}.json`

/** Everything the app holds, in the shape a backup file has. */
export const buildBackup = (): Backup => ({
  version: BACKUP_VERSION,
  exportedAt: Date.now(),
  chats: listChats(),
  sessions: listSessions(),
})

/**
 * Where the app's data is.
 *
 * On the desktop that is a folder in the app's own data directory, named after
 * the app rather than after anybody. In a browser it is the browser's storage,
 * and there is no folder to point at.
 */
export const dataLocation = dataDirectory

/**
 * Writes every conversation to a file.
 *
 * Returns whether a file was written: the user may say where to put it and
 * then change their mind, and that is not a failure.
 */
export const exportConversations = async (): Promise<boolean> => {
  const backup = buildBackup()
  return saveTextFile(
    backupFileName(),
    JSON.stringify(backup, null, 2),
  )
}

/**
 * Reads a backup file and adds what is in it.
 *
 * A thread that is already here is left alone: an import adds, and does not
 * overwrite what the user already has. The counts are returned so the app can
 * say what happened rather than leaving the reader to work it out.
 */
export const importConversations = async (): Promise<{
  added: number
  skipped: number
} | null> => {
  const raw = await readTextFile();
  if (!raw) return null;

  let backup: Backup;
  try {
    backup = JSON.parse(raw) as Backup;
  } catch {
    throw new Error("That file is not a Tavi backup.");
  }
  if (!backup || backup.version !== BACKUP_VERSION) {
    throw new Error("That backup was made by a different version of the app.");
  }

  const chats = new Set(listChats().map((chat) => chat.id));
  const sessions = new Set(listSessions().map((session) => session.id));
  let added = 0;
  let skipped = 0;

  for (const chat of backup.chats ?? []) {
    if (chats.has(chat.id)) {
      skipped++;
      continue;
    }
    chats.add(chat.id);
    await restoreChat(chat);
    added++;
  }

  for (const session of backup.sessions ?? []) {
    if (sessions.has(session.id)) {
      skipped++;
      continue;
    }
    sessions.add(session.id);
    await restoreSession(session);
    added++;
  }

  return { added, skipped };
};
