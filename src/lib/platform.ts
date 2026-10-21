/**
 * What this build is.
 *
 * One file knows whether the app is running inside the Tauri shell or in a
 * plain browser, and nothing else asks. The marker the Tauri runtime leaves on
 * the window it runs in is written down once, here, so that a change to it
 * cannot leave two detectors disagreeing — which is how a user-visible
 * sentence and a transport choice end up meaning different things.
 *
 * The answer is computed once, when the module is loaded, rather than being
 * re-sniffed on every call. A build's runtime does not change while it is
 * running, and a check that re-reads the environment is a check that can be
 * right in one place and wrong in another.
 */

/**
 * The marker the Tauri runtime leaves on the window it runs in.
 *
 * It is the runtime's own, not ours, and it is the only thing in the app that
 * knows what it is running on.
 */
const TAURI_MARKER = "__TAURI_INTERNALS__";

/** Whether the app is running inside the Tauri shell. */
const detected =
  typeof window !== "undefined" && TAURI_MARKER in window;

/**
 * Whether the app is running inside the Tauri shell.
 *
 * False in a plain browser, which is the web target.
 */
export const isDesktopApp = (): boolean => detected;
