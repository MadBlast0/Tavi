/**
 * Where the app and the website are allowed to be different.
 *
 * The app has two targets — a Tauri desktop app and a plain website — and one
 * codebase. Most of the app is the same in both: the same screens, the same
 * controls, the same words. The differences are real and unavoidable, and
 * they are few.
 *
 * The problem is not the differences. It is that nothing recorded them, so
 * each new one was discovered by somebody comparing two screens and finding
 * they did not match. That is how the browser came to claim "0 fonts
 * installed" while listing a font, and how the app menu came to offer "Close
 * window" in a browser tab that cannot be closed.
 *
 * So the differences are written down here, and a test fails when a file
 * consults the build and is not on this list. The list is the point: it is
 * where a reviewer reads *why* the two builds differ, in one place, instead
 * of finding out by comparing two screens.
 *
 * A file that consults the build has to say here what it changes and why the
 * two cannot be the same. That is the whole discipline.
 */

export type BuildDifference = {
  /**
   * The file that decides.
   *
   * The path is relative to the repository root, so a reviewer can open it.
   */
  where: string
  /** What is different between the app and the website. */
  what: string
  /** Why the two cannot be the same. */
  why: string
};

/**
 * Every place the two builds are allowed to differ.
 *
 * It is deliberately short. Every entry is a thing the website genuinely
 * cannot do, or a fact about the machine the app is sitting on.
 */
export const BUILD_DIFFERENCES: BuildDifference[] = [
  {
    where: "src/lib/platform.ts",
    what: "Whether this build is running inside the Tauri shell.",
    why:
      "The app runs in a Tauri window and the website runs in a browser tab. " +
      "One file knows which, so the marker that says so cannot be written down twice.",
  },
  {
    where: "src/lib/desktop.ts",
    what: "The Tauri adapter: the only file that touches the native runtime.",
    why:
      "There is no Rust side in a browser. The adapter is where that fact is " +
      "paid for, and it is the only file allowed to know about it.",
  },
  {
    where: "src/lib/api.ts",
    what: "Which adapter carries out an operation.",
    why:
      "The facade is the one place that chooses between the desktop and the " +
      "server, so every other file can ask for what it wants without knowing " +
      "which host it is in.",
  },
  {
    where: "src/lib/fonts.ts",
    what: "The list of fonts installed on this machine.",
    why:
      "A browser can only report the fonts it is able to see, and even then " +
      "only in Chromium and only with a permission. The operating system can " +
      "answer properly, and the website says why it cannot rather than " +
      "inventing a count.",
  },
  {
    where: "src/lib/workspace.ts",
    what: "What a folder is: a path on the desktop, a handle in a browser.",
    why:
      "The native tools are confined to a folder the user chose, and a path " +
      "the model names is not a permission. The browser's grant is enforced " +
      "by the browser instead.",
  },
  {
    where: "src/lib/thread-repository.ts",
    what: "Where the conversations are kept.",
    why:
      "The website has no app-data directory and keeps them in browser " +
      "storage. The desktop app writes them to its own file, because an " +
      "installed app that forgets its conversations is not an installed app.",
  },
  {
    where: "src/lib/git.ts",
    what: "Whether git can be run at all.",
    why:
      "Git is a program on the machine, and a browser cannot run one. The " +
      "website refuses every call and says why, rather than showing a " +
      "control that would do nothing.",
  },
  {
    where: "src/components/desktop-tool-gate.tsx",
    what: "Whether the native tools are offered to the model.",
    why:
      "The native tools reach the machine's disk, and the website has no " +
      "such tools to offer.",
  },
  {
    where: "src/blocks/prompt-input/prompt-block.tsx",
    what: "Whether the composer offers a folder to work in.",
    why:
      "The desktop asks the system for a folder; the website asks the " +
      "browser, and only the browsers that have the File System Access API " +
      "can answer.",
  },
  {
    where: "src/blocks/prompt-input/thread-bridge.tsx",
    what: "Whether the system tray's pending request is taken.",
    why:
      "There is no system tray in a browser, so there is nothing to take a " +
      "request from.",
  },
  {
    where: "src/blocks/shell/tray-bridge.tsx",
    what: "Whether the system tray's commands are listened for.",
    why:
      "The tray is the operating system's, and a browser tab has none.",
  },
  {
    where: "src/blocks/shell/app-menu.tsx",
    what: "Whether 'Close window' and 'Exit' can be run.",
    why:
      "A browser tab cannot be hidden and cannot be closed from the page it " +
      "is showing. The two commands are drawn disabled with the reason said, " +
      "rather than left looking live.",
  },
  {
    where: "src/blocks/shell/settings-keys.tsx",
    what: "Where the key is kept, in one sentence.",
    why:
      "The desktop keeps it in the operating system's credential store and " +
      "the website's server keeps it in its own file. Everything else about " +
      "the screen is the same.",
  },
];

/** The files on the list. */
export const BUILD_DIFFERENCE_FILES = new Set(
  BUILD_DIFFERENCES.map((difference) => difference.where),
);
