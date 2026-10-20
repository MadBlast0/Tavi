import { invoke } from "@tauri-apps/api/core";

/**
 * Bridge to the Rust side.
 *
 * These only work inside the Tauri shell. Running them in a plain browser (the
 * `vite dev` web target) would throw an opaque Tauri internal error, so they fail
 * with an explanation instead.
 */

/**
 * Whether the app is running inside the Tauri shell. False in a plain browser,
 * which is the web target.
 */
const isDesktop = () =>
  typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;

export const isDesktopApp = isDesktop;

const requireDesktop = () => {
  if (!isDesktop()) {
    throw new Error(
      "This is only available in the desktop app. Start it with `pnpm tauri dev`.",
    );
  }
};

/**
 * A folder the app has been given access to.
 *
 * The id is generated, and is not the folder's name: two directories can share
 * a name, and a folder identified by its name is one folder to this app. The
 * name is kept separately, because the name is what a person reads.
 */
export type Workspace = {
  id: string;
  /** The canonical path on disk. */
  path: string;
  /** The folder's name, for display. */
  name: string;
  /** When the access was granted. */
  grantedAt: number;
  /** Whether the folder is still where it was. */
  missing: boolean;
};

/** One entry in a folder. */
export type WorkspaceEntry = {
  name: string;
  /** The path, relative to the workspace, using forward slashes. */
  path: string;
  isDirectory: boolean;
  size: number | null;
};

/** A file's contents, read from inside a workspace. */
export type WorkspaceFile = {
  /** The path, relative to the workspace, using forward slashes. */
  path: string;
  text: string;
  truncated: boolean;
  bytes: number;
  /** Whether the file is not text at all. */
  binary: boolean;
};

/** Every workspace the app has been given access to. */
export const listWorkspaces = async (): Promise<Workspace[]> => {
  requireDesktop();
  return invoke<Workspace[]>("list_workspaces");
};

/**
 * Gives the app access to a folder.
 *
 * The path is canonicalised on the Rust side, so what is stored is the real
 * path rather than however it was spelled.
 */
export const grantWorkspace = async (path: string): Promise<Workspace> => {
  requireDesktop();
  return invoke<Workspace>("grant_workspace", { path });
};

/**
 * Points an existing grant at a folder again.
 *
 * The grant keeps its id, so a session that was run against it is still
 * attached to it.
 */
export const relinkWorkspace = async (
  id: string,
  path: string,
): Promise<Workspace> => {
  requireDesktop();
  return invoke<Workspace>("relink_workspace", { id, path });
};

/**
 * Gives up access to a folder.
 *
 * The folder on disk is not touched: this is about what this app may reach.
 */
export const revokeWorkspace = async (id: string): Promise<boolean> => {
  requireDesktop();
  return invoke<boolean>("revoke_workspace", { id });
};

/** The entries of a folder inside a workspace. */
export const listWorkspaceEntries = async (
  workspaceId: string,
  path = "",
): Promise<WorkspaceEntry[]> => {
  requireDesktop();
  return invoke<WorkspaceEntry[]>("list_workspace_entries", {
    workspaceId,
    path,
  });
};

/** Reads a file from inside a workspace. */
export const readWorkspaceFile = async (
  workspaceId: string,
  path: string,
  maxBytes?: number,
): Promise<WorkspaceFile> => {
  requireDesktop();
  return invoke<WorkspaceFile>("read_workspace_file", {
    workspaceId,
    path,
    maxBytes,
  });
};
