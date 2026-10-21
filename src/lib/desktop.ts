/**
 * The desktop adapter.
 *
 * Everything that touches the Tauri runtime is in this file, and nowhere else.
 * That is the whole point of it: the app has two hosts, and the boundary
 * between them is one module wide. A component that reaches for `invoke()`
 * itself is a component that has to know which host it is running on, and
 * there are already too many of those.
 *
 * The rules this file keeps:
 *
 * - it is the only file that imports `@tauri-apps/*`;
 * - it never imports anything from the web adapter;
 * - it holds no user-facing wording, because the same words have to be said
 *   in a browser too.
 *
 * The counterpart is `src/lib/web.ts`, and the facade that picks between them
 * is `src/lib/api.ts`.
 */

import { Channel, invoke as tauriInvoke } from "@tauri-apps/api/core"
import { listen } from "@tauri-apps/api/event"
import { getCurrentWindow, type Window } from "@tauri-apps/api/window"
import { openUrl } from "@tauri-apps/plugin-opener"

import { isDesktopApp } from "./platform.ts"
import type {
  ChatEvent,
  ChatRequest,
  CloneProgress,
  CloneResult,
  KeyStandingReport,
  ProjectsListing,
  RawCatalogue,
  Workspace,
  WorkspaceEntry,
  WorkspaceFile,
} from "./api.ts"
import type { ProviderKey } from "./secret.ts"

export { isDesktopApp }
export type { Window as AppWindow }

/**
 * The window this app is running in, or nothing if there is no window.
 *
 * The web target has none: a browser tab cannot be minimized, and the handle
 * Tauri hands out for it does not exist outside the desktop shell. Reaching
 * for it there would throw, and a throw in a render takes the whole app with
 * it — so the handle is taken once, defensively.
 */
export const appWindow = (): Window | null => {
  if (!isDesktopApp()) return null
  try {
    return getCurrentWindow()
  } catch {
    return null
  }
}

const requireDesktop = () => {
  if (!isDesktopApp()) {
    throw new Error(
      "This is only available in the desktop app. Start it with `pnpm tauri dev`.",
    )
  }
}

/**
 * Calls a command, and turns a refusal into an error that says what it was.
 *
 * Tauri rejects with the command's own message as a bare string, not as an
 * `Error`. A caller that checks `instanceof Error` would therefore throw its
 * own generic wording away and show "something went wrong" in place of the
 * reason the Rust side gave — which is the one worth showing.
 */
const invoke = async <T>(
  command: string,
  args?: Record<string, unknown>,
): Promise<T> => {
  try {
    return await tauriInvoke<T>(command, args)
  } catch (error) {
    if (error instanceof Error) throw error
    if (typeof error === "string" && error.trim() !== "") {
      throw new Error(error)
    }
    throw new Error("That could not be done.")
  }
}

/* -------------------------------------------------------------------------- */
/* The provider's keys                                                         */
/* -------------------------------------------------------------------------- */

export const listProviderKeys = async (): Promise<ProviderKey[]> =>
  invoke<ProviderKey[]>("list_provider_keys")

export const saveProviderKey = async (
  provider: string,
  key: string,
  name?: string,
): Promise<void> => {
  await invoke("save_provider_key", { provider, key, name: name ?? null })
}

export const replaceProviderKey = async (
  id: string,
  key: string,
): Promise<void> => {
  await invoke("replace_provider_key", { id, key })
}

export const renameProviderKey = async (
  id: string,
  name: string,
): Promise<void> => {
  await invoke("rename_provider_key", { id, name })
}

export const activateProviderKey = async (id: string): Promise<void> => {
  await invoke("activate_provider_key", { id })
}

export const removeProviderKey = async (id: string): Promise<void> => {
  await invoke("remove_provider_key", { id })
}

/**
 * Asks a provider about a key that has not been stored yet.
 *
 * `spend` is the user's answer to "may this cost a request": the providers
 * whose check costs one are only ever asked when the user says so.
 */
export const checkProviderKey = async (
  provider: string,
  key: string,
  spend: boolean,
): Promise<KeyStandingReport> =>
  invoke<KeyStandingReport>("check_provider_key", { provider, key, spend })

export const recheckProviderKey = async (id: string): Promise<void> => {
  await invoke("recheck_provider_key", { id })
}

/* -------------------------------------------------------------------------- */
/* The model catalogue                                                         */
/* -------------------------------------------------------------------------- */

export const fetchModels = async (): Promise<RawCatalogue> => {
  const raw = await invoke<{
    body: string
    fetchedAt: number
    degraded: boolean
  }>("model_catalogue", { force: false })
  return {
    body: raw.body,
    fetchedAt: raw.fetchedAt,
    degraded: raw.degraded,
  }
}

/* -------------------------------------------------------------------------- */
/* The conversation                                                            */
/* -------------------------------------------------------------------------- */

/**
 * Sends a chat and reports what comes back.
 *
 * A Tauri call cannot be cancelled from here, so a request that is stopped is
 * stopped by telling Rust to stop it.
 */
export const streamChat = async (
  request: ChatRequest,
  onEvent: (event: ChatEvent) => void,
  signal?: AbortSignal,
): Promise<void> => {
  const requestId = `chat-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
  const channel = new Channel<ChatEvent>()
  channel.onmessage = onEvent

  const cancel = () => {
    void invoke("cancel_chat", { requestId }).catch(() => {})
  }
  signal?.addEventListener("abort", cancel)

  try {
    await invoke("chat", { request: { ...request, requestId }, onEvent: channel })
  } finally {
    signal?.removeEventListener("abort", cancel)
  }
}

/* -------------------------------------------------------------------------- */
/* The folders                                                                 */
/* -------------------------------------------------------------------------- */

export const listWorkspaces = async (): Promise<Workspace[]> => {
  requireDesktop()
  return invoke<Workspace[]>("list_workspaces")
}

export const grantWorkspace = async (path: string): Promise<Workspace> => {
  requireDesktop()
  return invoke<Workspace>("grant_workspace", { path })
}

export const relinkWorkspace = async (
  id: string,
  path: string,
): Promise<Workspace> => {
  requireDesktop()
  return invoke<Workspace>("relink_workspace", { id, path })
}

export const revokeWorkspace = async (id: string): Promise<boolean> => {
  requireDesktop()
  return invoke<boolean>("revoke_workspace", { id })
}

export const listWorkspaceEntries = async (
  workspaceId: string,
  path = "",
): Promise<WorkspaceEntry[]> => {
  requireDesktop()
  return invoke<WorkspaceEntry[]>("list_workspace_entries", {
    workspaceId,
    path,
  })
}

export const readWorkspaceFile = async (
  workspaceId: string,
  path: string,
  maxBytes?: number,
): Promise<WorkspaceFile> => {
  requireDesktop()
  return invoke<WorkspaceFile>("read_workspace_file", {
    workspaceId,
    path,
    maxBytes,
  })
}

/**
 * Asks the system for a folder.
 *
 * The browser's picker cannot say where the folder is, and a folder the app
 * cannot name is a folder the native tools cannot be given — so the desktop
 * asks the operating system.
 */
export const pickDirectory = async (): Promise<string | null> => {
  const { open } = await import("@tauri-apps/plugin-dialog")
  const picked = await open({ directory: true, multiple: false })
  if (!picked || Array.isArray(picked)) return null
  return picked
}

/* -------------------------------------------------------------------------- */
/* The conversations                                                           */
/* -------------------------------------------------------------------------- */

export const readThreads = async (kind: string): Promise<string> =>
  invoke<string>("read_threads", { kind })

export const writeThreads = async (
  kind: string,
  records: string,
): Promise<void> => {
  await invoke("write_threads", { kind, records })
}

export const clearThreads = async (kind: string): Promise<void> => {
  await invoke("clear_threads", { kind })
}

/* -------------------------------------------------------------------------- */
/* The projects                                                                */
/* -------------------------------------------------------------------------- */

export const listProjects = async (): Promise<ProjectsListing> =>
  invoke<ProjectsListing>("list_projects")

export const cloneRepository = async (
  url: string,
  where: string | undefined,
  onProgress?: (progress: CloneProgress) => void,
): Promise<CloneResult> => {
  const channel = new Channel<{
    type: string
    percent?: number
    message?: string
  }>()
  channel.onmessage = (event) => {
    if (event.type === "progress" && event.message) {
      onProgress?.({ percent: event.percent, message: event.message })
    }
  }
  return invoke<CloneResult>("clone_repository", {
    url,
    parent: where || null,
    onEvent: channel,
  })
}

export const cancelClone = async (): Promise<void> => {
  await invoke("cancel_clone")
}

/* -------------------------------------------------------------------------- */
/* Files, links and the window                                                 */
/* -------------------------------------------------------------------------- */

/** Where the app keeps its own data. */
export const dataDirectory = async (): Promise<string> =>
  invoke<string>("data_directory")

/** Writes a file the user chose. */
export const writeFile = async (
  path: string,
  contents: string,
): Promise<void> => {
  await invoke("write_file", { path, contents })
}

/** Reads a file the user chose. */
export const readFile = async (path: string): Promise<string> =>
  invoke<string>("read_file", { path })

/** Asks the system where to save a file. */
export const pickSavePath = async (name: string): Promise<string | null> => {
  const { save } = await import("@tauri-apps/plugin-dialog")
  const path = await save({
    defaultPath: name,
    filters: [{ name: "Tavi conversations", extensions: ["json"] }],
  })
  return path ?? null
}

/** Asks the system which file to open. */
export const pickOpenPath = async (): Promise<string | null> => {
  const { open } = await import("@tauri-apps/plugin-dialog")
  const path = await open({
    multiple: false,
    directory: false,
    filters: [{ name: "Tavi conversations", extensions: ["json"] }],
  })
  if (!path || Array.isArray(path)) return null
  return path
}

/**
 * Opens a page in the system browser.
 *
 * The webview swallows a new-window request, so a link has to be handed to
 * the operating system rather than opened in the app.
 */
export const openInSystemBrowser = async (url: string): Promise<void> => {
  await openUrl(url)
}

/** Puts the window away, without leaving the app running. */
export const hideWindow = async (): Promise<void> => {
  await appWindow()?.hide()
}

/** Leaves the app. */
export const quitApp = async (): Promise<void> => {
  await invoke("quit_app")
}

/* -------------------------------------------------------------------------- */
/* The system tray                                                             */
/* -------------------------------------------------------------------------- */

/** Which composer the tray asked for, in the shape the native side sends. */
export type TrayIntent = "newChat" | "newSession"

/** Listens for something the tray asked for. */
export const listenForTray = async (
  event: string,
  handler: () => void,
): Promise<() => void> => listen(event, handler)

/** Takes the request the tray is holding, if there is one. */
export const takeIntent = async (): Promise<TrayIntent | null> =>
  invoke<TrayIntent | null>("take_intent")

/* -------------------------------------------------------------------------- */
/* The fonts                                                                   */
/* -------------------------------------------------------------------------- */

export const listInstalledFonts = async (): Promise<string[]> =>
  invoke<string[]>("list_installed_fonts")
