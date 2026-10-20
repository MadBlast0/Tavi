/**
 * The folders the app has been given access to.
 *
 * There are two kinds of grant, and the app does not have to know which is
 * which:
 *
 * - On the website, a folder is a **browser grant**: the File System Access
 *   API's handle, kept in IndexedDB, and the browser enforces it.
 * - On the desktop, a folder is a **Rust grant**: a canonical path the user
 *   chose, kept in the app's own file, and the native tools are confined to
 *   it. A path the model names is not a permission, so this is the only shape
 *   a folder can have where the model can reach the disk.
 *
 * Everything above this file asks for a workspace, lists its files, reads one
 * and forgets it, and does not know which kind it is holding.
 */

import {
  listWorkspaceEntries,
  listWorkspaces as listRustWorkspaces,
  grantWorkspace as grantRustWorkspace,
  readWorkspaceFile as readRustWorkspaceFile,
  revokeWorkspace as revokeRustWorkspace,
} from "./desktop.ts"
import { isDesktopApp } from "./desktop.ts"
import {
  MAX_READ_BYTES,
  MAX_WALK_DEPTH,
  MAX_WALK_ENTRIES,
  SKIP_DIRECTORIES,
  isSourceFile,
} from "./file-rules.ts"
import {
  forgetFolder,
  listProjectFiles,
  listRecentFolders,
  pickFolder,
  readFileText as readBrowserFile,
  restoreFolder,
  type FileHandle,
} from "./fs-access.ts"

/** A folder the app has been given access to. */
export type Workspace = {
  /** A generated id. The one thing that identifies this folder. */
  id: string
  /** The folder's name, for display. */
  name: string
}

/** One file inside a workspace. */
export type WorkspaceFile = {
  /** The workspace it belongs to, so it can be read without being told. */
  workspaceId: string
  /** The path, relative to the workspace, using forward slashes. */
  path: string
  name: string
  /** The browser's handle for it, on the website. */
  handle?: FileHandle
}

/** Every folder the app has been given access to, newest first. */
export const listWorkspaces = async (): Promise<Workspace[]> => {
  if (isDesktopApp()) {
    const grants = await listRustWorkspaces();
    return grants.map((grant) => ({ id: grant.id, name: grant.name }));
  }
  const folders = await listRecentFolders();
  return folders.map((folder) => ({ id: folder.id, name: folder.name }));
};

/**
 * Asks the user for a folder.
 *
 * The desktop uses the system dialog, because the browser's picker cannot say
 * where the folder is — and a folder the app cannot name is a folder the
 * native tools cannot be given. The website uses the browser's picker, which
 * is the only one it has.
 */
export const pickWorkspace = async (): Promise<Workspace | null> => {
  if (isDesktopApp()) {
    const { open } = await import("@tauri-apps/plugin-dialog");
    const picked = await open({ directory: true, multiple: false });
    if (!picked || Array.isArray(picked)) return null;
    const grant = await grantRustWorkspace(picked);
    return { id: grant.id, name: grant.name };
  }
  const folder = await pickFolder();
  return folder ? { id: folder.id, name: folder.name } : null;
};

/**
 * Gives up access to a folder.
 *
 * The folder on disk is not touched. This is about what this app may reach,
 * and a folder the user gave us once is still their folder afterwards.
 */
export const forgetWorkspace = async (id: string): Promise<void> => {
  if (isDesktopApp()) {
    await revokeRustWorkspace(id);
    return;
  }
  await forgetFolder(id);
};

/**
 * The files inside a workspace that are worth reading.
 *
 * Bounded on three axes — depth, entry count and file size — because the
 * alternative is freezing the tab on a monorepo.
 */
export const listWorkspaceFiles = async (
  workspaceId: string,
): Promise<WorkspaceFile[]> => {
  if (!isDesktopApp()) {
    const root = await restoreFolder(workspaceId);
    if (!root) return [];
    const files = await listProjectFiles(root);
    return files.map((file) => ({
      workspaceId,
      path: file.path,
      name: file.name,
      handle: file.handle,
    }));
  }

  return walkRust(workspaceId);
};

/**
 * Reads a file as text, for inclusion in a prompt.
 *
 * Binary and oversized files come back as `null` instead of being silently
 * truncated into the model.
 */
export const readWorkspaceFile = async (
  file: WorkspaceFile,
): Promise<string | null> => {
  if (file.handle) return readBrowserFile(file);
  const result = await readRustWorkspaceFile(
    file.workspaceId,
    file.path,
    MAX_READ_BYTES,
  );
  /* Too large is too large: a file cut in half is not the file, and the model
     would be reading a truncation and thinking it had read the whole thing. */
  if (result.bytes > MAX_READ_BYTES) return null;
  return result.text;
};

/**
 * Walks a workspace on the desktop, one folder at a time.
 *
 * The rules are the ones the website uses, read from the same place, so the
 * two targets show the model the same files.
 */
const walkRust = async (workspaceId: string): Promise<WorkspaceFile[]> => {
  const out: WorkspaceFile[] = [];
  let seen = 0;

  const walk = async (path: string, depth: number): Promise<void> => {
    if (depth > MAX_WALK_DEPTH || seen >= MAX_WALK_ENTRIES) return;
    const entries = await listWorkspaceEntries(workspaceId, path);
    for (const entry of entries) {
      if (seen >= MAX_WALK_ENTRIES) return;
      seen++;
      if (entry.isDirectory) {
        if (SKIP_DIRECTORIES.has(entry.name)) continue;
        await walk(entry.path, depth + 1);
        continue;
      }
      if (!isSourceFile(entry.name)) continue;
      out.push({ workspaceId, path: entry.path, name: entry.name });
    }
  };

  await walk("", 0);
  return out.sort((a, b) => a.path.localeCompare(b.path));
};
