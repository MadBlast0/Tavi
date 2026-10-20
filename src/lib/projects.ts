/**
 * Cloned projects.
 *
 * The website's server runs `git` on the machine that serves it, and the
 * desktop app runs it in Rust, on the machine it is running on. Both do the
 * same thing, and the composer does not know which one it asked.
 *
 * The rules are the same on both sides: the destination is checked before
 * anything is written, an existing project is never overwritten, and a clone
 * that failed part way through is removed rather than left as debris.
 */

import { Channel, invoke } from "@tauri-apps/api/core"

import { isDesktopApp } from "./desktop.ts"

/** A project that has been cloned. */
export type ProjectSummary = {
  /** The folder's name inside the projects folder. */
  name: string;
  path: string;
  /** When it was last changed. */
  modifiedAt: number;
}

/** Where cloned repositories go, and what is in there. */
export type ProjectsListing = {
  root: string;
  projects: ProjectSummary[];
}

/** What a clone did. */
export type CloneResult = {
  ok: boolean;
  name?: string;
  path?: string;
  error?: string;
}

/** How a clone is going. */
export type CloneProgress = {
  /** How far along it is, when git says. */
  percent?: number;
  message: string;
}

/**
 * The projects folder, and the projects in it.
 *
 * The folder is not created until a clone is actually started: a folder that
 * exists because the app opened is a folder nobody asked for.
 */
export const listProjects = async (): Promise<ProjectsListing> => {
  if (isDesktopApp()) {
    return invoke<ProjectsListing>("list_projects");
  }

  const response = await fetch("/api/projects");
  if (!response.ok) {
    throw new Error(`The projects folder could not be read (${response.status}).`);
  }
  return (await response.json()) as ProjectsListing;
};

/**
 * Clones a repository.
 *
 * `where` is the folder to put it in. The app's projects folder when it is
 * not given.
 */
export const cloneRepository = async (
  url: string,
  where: string | undefined,
  onProgress?: (progress: CloneProgress) => void,
): Promise<CloneResult> => {
  if (isDesktopApp()) {
    const channel = new Channel<{ type: string; percent?: number; message?: string }>();
    channel.onmessage = (event) => {
      if (event.type === "progress" && event.message) {
        onProgress?.({ percent: event.percent, message: event.message });
      }
    };
    return invoke<CloneResult>("clone_repository", {
      url,
      parent: where || null,
      onEvent: channel,
    });
  }

  const response = await fetch("/api/projects/clone", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ url, destination: where || undefined }),
  });
  const result = (await response.json().catch(() => null)) as CloneResult | null;
  if (!result) {
    throw new Error("The clone could not be started.");
  }
  return result;
};

/** Stops a clone that is in flight. */
export const cancelClone = async (): Promise<void> => {
  if (!isDesktopApp()) return;
  await invoke("cancel_clone");
};
