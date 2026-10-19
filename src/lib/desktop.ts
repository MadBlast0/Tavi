import { invoke } from "@tauri-apps/api/core";

/**
 * Bridge to the Rust side for the two native tools.
 *
 * These only work inside the Tauri shell. Running them in a plain browser (the
 * `vite dev` web target) would throw an opaque Tauri internal error, so they fail
 * with an explanation instead.
 */

export type DirEntry = {
  name: string;
  path: string;
  isDirectory: boolean;
  size: number | null;
};

export type ReadFileResult = {
  path: string;
  text: string;
  truncated: boolean;
  bytes: number;
};

const isDesktop = () =>
  typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;

/**
 * Whether the app is running inside the Tauri shell. False in a plain browser,
 * which is the web target.
 */
export const isDesktopApp = isDesktop;

const requireDesktop = () => {
  if (!isDesktop()) {
    throw new Error(
      "This tool is only available in the desktop app. Start it with `pnpm tauri dev`.",
    );
  }
};

export const listDirectory = async (path: string): Promise<DirEntry[]> => {
  requireDesktop();
  return invoke<DirEntry[]>("list_directory", { path });
};

export const readTextFile = async (
  path: string,
  maxBytes?: number,
): Promise<ReadFileResult> => {
  requireDesktop();
  return invoke<ReadFileResult>("read_text_file", { path, maxBytes });
};