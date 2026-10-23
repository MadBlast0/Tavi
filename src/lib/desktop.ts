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
import {
  isPermissionGranted,
  requestPermission,
  sendNotification,
} from "@tauri-apps/plugin-notification"
import { openUrl } from "@tauri-apps/plugin-opener"

import { isDesktopApp } from "./platform.ts"
import type {
  ChatEvent,
  ChatRequest,
  CloneProgress,
  CloneResult,
  KeyStandingReport,
  NotificationPermission,
  PartialJournal,
  ProjectsListing,
  RawCatalogue,
  Workspace,
  WorkspaceEntry,
  WorkspaceFile,
} from "./api.ts"
import type {
  CliLifecycleAction,
  CliProviderChanges,
  CliProviderState,
} from "./cli-providers.ts"
import type { AcpConfigResult, CliTerminalEvent } from "./api.ts"
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
  baseUrl?: string,
): Promise<void> => {
  await invoke("save_provider_key", {
    provider,
    key,
    name: name ?? null,
    baseUrl: baseUrl ?? null,
  })
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
  baseUrl?: string,
): Promise<KeyStandingReport> =>
  invoke<KeyStandingReport>("check_provider_key", {
    provider,
    key,
    spend,
    baseUrl: baseUrl ?? null,
  })

export const recheckProviderKey = async (id: string): Promise<void> => {
  await invoke("recheck_provider_key", { id })
}

/* -------------------------------------------------------------------------- */
/* The model catalogue                                                         */
/* -------------------------------------------------------------------------- */

/**
 * The catalogue for one provider.
 *
 * The provider is named, because the app can talk to more than one and the
 * list has to be the one whose models the request will actually use.
 */
export const fetchModels = async (provider: string): Promise<RawCatalogue> => {
  const raw = await invoke<{
    body: string
    fetchedAt: number
    degraded: boolean
  }>("model_catalogue", { provider, force: false })
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
/* The CLI providers                                                           */
/* -------------------------------------------------------------------------- */

/** Every CLI provider the app knows about, and what state it is in. */
export const listCliProviders = async (): Promise<CliProviderState[]> => {
  requireDesktop()
  return invoke<CliProviderState[]>("list_cli_providers")
}

/** Looks again, for a provider that has just been installed or removed. */
export const scanCliProviders = async (): Promise<CliProviderState[]> => {
  requireDesktop()
  return invoke<CliProviderState[]>("scan_cli_providers")
}

/** Changes what the app remembers about a CLI provider. */
export const setCliProviderState = async (
  id: string,
  changes: CliProviderChanges,
): Promise<CliProviderState[]> => {
  requireDesktop()
  return invoke<CliProviderState[]>("set_cli_provider_state", {
    id,
    enabled: changes.enabled ?? null,
    autoUpdate: changes.autoUpdate ?? null,
    autoUpdateAll: changes.autoUpdateAll ?? null,
    path: changes.path ?? null,
  })
}

/**
 * Installs, updates or removes a CLI provider.
 *
 * The operation is run by the tool's own means, and what it says comes back
 * as it says it.
 */
export const runCliLifecycle = async (
  id: string,
  action: CliLifecycleAction,
  onLog?: (message: string) => void,
): Promise<void> => {
  requireDesktop()
  const channel = new Channel<{ type: string; message?: string }>()
  channel.onmessage = (event) => {
    if (event.type === "log" && event.message) onLog?.(event.message)
  }
  await invoke("run_cli_lifecycle", { id, action, onEvent: channel })
}

/** Stops an install, an update or a removal that is in flight. */
export const cancelCliLifecycle = async (): Promise<void> => {
  requireDesktop()
  await invoke("cancel_cli_lifecycle")
}

/** Starts a program in a real terminal. */
export const startCliTerminal = async (
  program: string,
  args: string[],
  workingDir: string | undefined,
  onEvent: (event: CliTerminalEvent) => void,
): Promise<string> => {
  requireDesktop()
  const channel = new Channel<CliTerminalEvent>()
  channel.onmessage = onEvent
  return invoke<string>("start_cli_terminal", {
    program,
    args,
    workingDir: workingDir || null,
    onEvent: channel,
  })
}

/** Writes to a terminal, as if the person had typed it. */
export const writeCliTerminal = async (
  id: string,
  data: string,
): Promise<void> => {
  requireDesktop()
  await invoke("write_cli_terminal", { id, data })
}

/** Tells a terminal it is a different size, so the program redraws. */
export const resizeCliTerminal = async (
  id: string,
  rows: number,
  cols: number,
): Promise<void> => {
  requireDesktop()
  await invoke("resize_cli_terminal", { id, rows, cols })
}

/** Stops a terminal and lets go of it. */
export const stopCliTerminal = async (id: string): Promise<void> => {
  requireDesktop()
  await invoke("stop_cli_terminal", { id })
}

/** The models and configuration an agent offers. */
export const listAcpModels = async (
  provider: string,
): Promise<AcpConfigResult> => {
  requireDesktop()
  return invoke<AcpConfigResult>("acp_list_models", {
    provider,
    cwd: null,
  })
}

/** Stops the agent for a provider. */
export const stopAcpAgent = async (provider: string): Promise<void> => {
  requireDesktop()
  await invoke("acp_stop_agent", { provider })
}

/** A report about one CLI provider, for a person to paste somewhere. */
export const cliProviderDiagnostics = async (id: string): Promise<string> => {
  requireDesktop()
  return invoke<string>("cli_provider_diagnostics", { id })
}

/** The models a CLI provider publishes. */
export const listCliModels = async (id: string): Promise<string[]> => {
  requireDesktop()
  return invoke<string[]>("list_cli_models", { id })
}

/**
 * Sends a message to a CLI provider.
 *
 * The program is started in Rust and read there, so nothing about it — not
 * its path, not its arguments, not the message — is ever in this side's
 * hands. What comes back is the same events the API path sends.
 */
export const streamCliChat = async (
  request: ChatRequest,
  onEvent: (event: ChatEvent) => void,
  signal?: AbortSignal,
): Promise<void> => {
  requireDesktop()
  const requestId = `cli-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
  const channel = new Channel<ChatEvent>()
  channel.onmessage = onEvent

  const cancel = () => {
    void invoke("cancel_chat", { requestId }).catch(() => {})
  }
  signal?.addEventListener("abort", cancel)

  try {
    /* A CLI provider speaks either a documented headless mode or a protocol.
       The app tries the protocol first, because it is the richer one — models
       with friendly names, effort levels, tool calls, permissions — and falls
       back to the headless mode when the program has no protocol. */
    const providerId = request.config?.providerId ?? ""
    try {
      await invoke("acp_chat", {
        request: { ...request, requestId },
        onEvent: channel,
      })
    } catch {
      await invoke("run_cli_chat", {
        request: { ...request, requestId },
        onEvent: channel,
      })
    }
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
/* The answers in flight                                                       */
/* -------------------------------------------------------------------------- */

/**
 * Adds one line to the journal of an answer that is being written.
 *
 * The journal is a file of the app's own, and Rust appends to it. The file
 * only ever grows, so this is cheap enough to call as the answer arrives.
 */
export const appendPartial = async (
  threadId: string,
  line: string
): Promise<void> => {
  await invoke("append_partial", { threadId, line })
}

/**
 * Every journal that is there.
 *
 * The lines are given as they are on disk. A journal whose last line was cut
 * short by a crash comes back whole, and reading it is the frontend's job —
 * it is the one that knows what a line means.
 */
export const readPartials = async (): Promise<PartialJournal[]> => {
  const raw = await invoke<string>("read_partials")
  try {
    const parsed = JSON.parse(raw) as unknown
    return Array.isArray(parsed) ? (parsed as PartialJournal[]) : []
  } catch {
    return []
  }
}

/** Removes one journal. */
export const clearPartial = async (threadId: string): Promise<void> => {
  await invoke("clear_partial", { threadId })
}

/** Removes every journal. */
export const clearPartials = async (): Promise<void> => {
  await invoke("clear_partials")
}

/* -------------------------------------------------------------------------- */
/* Notifications                                                               */
/* -------------------------------------------------------------------------- */

/**
 * Whether the operating system will let the app raise a toast.
 *
 * On Windows it does not ask: a toast is a toast, and the permission is
 * reported as granted whether or not the toast will be delivered — the
 * operating system only lets an *installed* application raise one, and says
 * so by not showing it.
 */
export const notificationPermission = async (): Promise<NotificationPermission> => {
  const granted = await isPermissionGranted();
  return granted ? "granted" : "default";
};

/**
 * Asks the operating system for permission to raise a toast.
 *
 * The answer is the permission's new state, and a refusal is a refusal.
 */
export const requestNotificationPermission = async (): Promise<boolean> => {
  const permission = await requestPermission();
  return permission === "granted";
};

/** Raises a toast. */
export const showNotification = (title: string, body: string): void => {
  sendNotification({ title, body });
};

/**
 * Whether the app is in front of the reader.
 *
 * The window's own focus, which is the operating system's answer rather than
 * the app's guess at it.
 */
export const windowHasFocus = async (): Promise<boolean> => {
  const window = appWindow();
  if (!window) return false;
  try {
    return await window.isFocused();
  } catch {
    /* A window that cannot say is treated as not in front, which is the safe
       direction: the reader is told rather than left wondering. */
    return false;
  }
};

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
 * Asks the system which program to use.
 *
 * A program the app could not find can be pointed at by hand, which is the
 * remedy when a tool lives somewhere the app does not look.
 */
export const chooseCliProgram = async (): Promise<string | null> => {
  requireDesktop()
  const { open } = await import("@tauri-apps/plugin-dialog")
  const path = await open({
    multiple: false,
    directory: false,
    title: "Choose the program",
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
