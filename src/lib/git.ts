/**
 * Git.
 *
 * A repository is a folder the reader has given the app, and git is the
 * thing that knows what is in it. This module is the app's side of that: the
 * vocabulary, and the one question the app asks about every call — *can git
 * be run here at all?*
 *
 * **The website cannot.** A browser cannot run a program on the machine, so
 * every call here refuses and says why. A control that does nothing is the
 * one thing worse than a control that is not there.
 *
 * The design, and where it came from, is in
 * [`docs/plan/git.md`](../docs/plan/git.md).
 */

import {
  gitBranches as seamBranches,
  gitCommit as seamCommit,
  gitCreateBranch as seamCreateBranch,
  gitPull as seamPull,
  gitPush as seamPush,
  gitStatus as seamStatus,
  gitSwitchBranch as seamSwitchBranch,
  type GitBranches,
  type GitIdentity,
  type GitOutcome,
  type GitStatus,
} from "./api.ts"
import { isDesktopApp } from "./platform.ts"

export type { GitBranch, GitBranches, GitIdentity, GitOutcome, GitStatus } from "./api.ts"

/** Why Git cannot be used here, when it cannot. */
export const GIT_UNAVAILABLE =
  "Git runs on your machine, and a browser cannot run it. This is a desktop thing."

/**
 * Whether git can be run here.
 *
 * It can on the desktop, where the app has the machine. It cannot in a
 * browser, and the app says so rather than pretending.
 */
export const gitIsAvailable = (): boolean => isDesktopApp()

/**
 * What the repository looks like right now.
 *
 * `null` means git cannot be run here at all. A status whose `repository` is
 * false means the folder is not a repository, which is a fact and not a
 * failure.
 */
export const gitStatus = async (id: string): Promise<GitStatus | null> => {
  if (!gitIsAvailable()) return null
  return seamStatus(id)
}

/** The branches the repository has, and which one is checked out. */
export const gitBranches = async (id: string): Promise<GitBranches | null> => {
  if (!gitIsAvailable()) return null
  return seamBranches(id)
}

/** Commits everything that is changed, staged or not. */
export const gitCommit = async (
  id: string,
  message: string,
  identity?: GitIdentity,
): Promise<GitOutcome> => {
  if (!gitIsAvailable()) return { ok: false, error: GIT_UNAVAILABLE }
  return seamCommit(id, message, identity)
}

/** Fetches from the remote and merges what it fetched. */
export const gitPull = async (id: string): Promise<GitOutcome> => {
  if (!gitIsAvailable()) return { ok: false, error: GIT_UNAVAILABLE }
  return seamPull(id)
}

/** Sends the branch to the remote it tracks. */
export const gitPush = async (id: string): Promise<GitOutcome> => {
  if (!gitIsAvailable()) return { ok: false, error: GIT_UNAVAILABLE }
  return seamPush(id)
}

/** Checks out a branch that is already there. */
export const gitSwitchBranch = async (
  id: string,
  branch: string,
): Promise<GitOutcome> => {
  if (!gitIsAvailable()) return { ok: false, error: GIT_UNAVAILABLE }
  return seamSwitchBranch(id, branch)
}

/** Makes a branch and checks it out. */
export const gitCreateBranch = async (
  id: string,
  branch: string,
): Promise<GitOutcome> => {
  if (!gitIsAvailable()) return { ok: false, error: GIT_UNAVAILABLE }
  return seamCreateBranch(id, branch)
}
