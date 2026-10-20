/**
 * Cloned projects on this machine.
 *
 * The browser cannot run `git`, so cloning happens here, on the same machine as
 * the app, into a single projects root. The root is resolved in one place so the
 * composer, the settings screen and the installer all agree on it.
 *
 * Nothing here is simulated. If `git` is missing or the clone fails, the caller
 * gets the real error rather than a placeholder directory that looks like it
 * worked.
 */

import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdir, readdir, rm, stat } from "node:fs/promises";
import { homedir } from "node:os";
import path from "node:path";

/**
 * Where cloned repositories go.
 *
 * Precedence: an explicit `TAVI_PROJECTS_DIR`, then a marker file written by
 * the installer (which is planned but not built yet), then a per-user default.
 * A settings UI that writes this location is also planned; see docs/plan/later-on.md.
 */
export const projectsRoot = (): string => {
  const override = process.env.TAVI_PROJECTS_DIR?.trim();
  if (override) return path.resolve(override);
  return path.join(homedir(), "Documents", "Tavi", "projects");
};

/** Creates the root if it is missing. Idempotent. */
export const ensureProjectsRoot = async (): Promise<string> => {
  const root = projectsRoot();
  await mkdir(root, { recursive: true });
  return root;
};

export type ProjectSummary = {
  /** Directory name inside the projects root. */
  name: string;
  path: string;
  modifiedAt: number;
};

export const listProjects = async (): Promise<ProjectSummary[]> => {
  const root = projectsRoot();
  if (!existsSync(root)) return [];
  const entries = await readdir(root, { withFileTypes: true });
  const out: ProjectSummary[] = [];
  for (const entry of entries) {
    if (!entry.isDirectory() || entry.name.startsWith(".")) continue;
    const full = path.join(root, entry.name);
    try {
      const info = await stat(full);
      out.push({ name: entry.name, path: full, modifiedAt: info.mtimeMs });
    } catch {
      // Vanished between readdir and stat; not worth reporting.
    }
  }
  return out.sort((a, b) => b.modifiedAt - a.modifiedAt);
};

/* -------------------------------------------------------------------------- */
/* Cloning                                                                     */
/* -------------------------------------------------------------------------- */

/**
 * Repository URL forms this will clone.
 *
 * `https://` covers GitHub, GitLab and self-hosted servers. `git@host:path` is
 * SSH, which only works if the user already has that host set up for `git`; the
 * error is reported as-is rather than hidden.
 *
 * Everything else is refused. Notably `file://` and bare local paths are not
 * accepted: cloning them would copy arbitrary local directories, and a
 * filesystem path pasted into a "repository URL" field is nearly always a mistake.
 */
const ALLOWED_URL = /^(https:\/\/[^\s]+\.[^\s]+|git@[A-Za-z0-9.\-]+:[^\s]+)$/;

/** A conservative directory name derived from the URL. */
const projectNameFrom = (url: string): string => {
  const withoutScheme = url
    .replace(/^https?:\/\//, "")
    .replace(/^git@[^:]+:/, "");
  const segments = withoutScheme.replace(/\.git$/, "").split(/[/:]/).filter(Boolean);
  const last = segments.at(-1) ?? "repository";
  const cleaned = last.replace(/[^A-Za-z0-9._-]/g, "-").replace(/^[-.]+/, "");
  return cleaned || "repository";
};

export type CloneResult =
  | { ok: true; name: string; path: string }
  | { ok: false; error: string };

const MAX_CLONE_MS = 10 * 60 * 1000;

/**
 * Shallow-clones a repository into the projects root.
 *
 * Spawned without a shell and with an argument array, so a URL containing shell
 * metacharacters is passed to `git` as data rather than interpreted. The
 * destination is derived from a sanitised name and is checked for existence
 * first, so an existing project is never overwritten.
 *
 * A clone that fails part way through is removed. The projects folder holds
 * projects, not the debris of attempts.
 */
export const cloneRepository = (
  url: string,
  destination?: string,
): Promise<CloneResult> =>
  (async () => {
    const trimmed = url.trim();
    if (!trimmed) return { ok: false, error: "Enter a repository URL." };
    if (!ALLOWED_URL.test(trimmed)) {
      return {
        ok: false,
        error:
          "That does not look like a repository URL. Use https://host/owner/repo or git@host:owner/repo.",
      };
    }

    const root = destination?.trim()
      ? path.resolve(destination.trim())
      : await ensureProjectsRoot();
    if (!existsSync(root)) {
      return { ok: false, error: `${root} is not a folder.` };
    }

    const name = projectNameFrom(trimmed);
    const target = path.join(root, name);

    try {
      const info = await stat(target);
      if (info.isDirectory()) {
        return {
          ok: false,
          error: `"${name}" already exists in your projects folder.`,
        };
      }
    } catch {
      // Does not exist, which is what we want.
    }

    const bin = process.platform === "win32" ? "git.exe" : "git";
    return new Promise<CloneResult>((resolve) => {
      const child = spawn(
        bin,
        ["clone", "--depth", "1", "--single-branch", "--", trimmed, target],
        {
          // No shell: arguments reach git as data, never as a command line.
          shell: false,
          windowsHide: true,
          stdio: ["ignore", "pipe", "pipe"],
          env: { ...process.env, GIT_TERMINAL_PROMPT: "0" },
        },
      );

      let stderr = "";
      child.stderr?.on("data", (chunk: Buffer) => {
        // Git's progress output is noisy and not useful to relay verbatim.
        const text = chunk.toString();
        if (/error|fatal|denied|not found|could not/i.test(text)) {
          stderr += text;
        }
      });

      const timer = setTimeout(() => {
        child.kill();
        resolve({
          ok: false,
          error: "The clone timed out. Check the URL and your network, then try again.",
        });
      }, MAX_CLONE_MS);

      child.on("error", (error) => {
        clearTimeout(timer);
        resolve({
          ok: false,
          error:
            (error as NodeJS.ErrnoException).code === "ENOENT"
              ? "git is not installed or not on PATH, so repositories cannot be cloned."
              : `Could not start git: ${error.message}`,
        });
      });

      child.on("close", (code) => {
        clearTimeout(timer);
        if (code === 0) {
          resolve({ ok: true, name, path: target });
          return;
        }
        // A clone that failed leaves a half-made folder behind. It is not a
        // project, and the next attempt would refuse to overwrite it.
        rm(target, { recursive: true, force: true }).catch(() => {});
        const detail = stderr.trim().split("\n").slice(-1)[0];
        resolve({
          ok: false,
          error: detail
            ? `git could not clone that repository. ${detail}`
            : `git exited with code ${code}.`,
        });
      });
    });
  })();