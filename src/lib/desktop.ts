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
import { emit, emitTo, listen } from "@tauri-apps/api/event"
import { getCurrentWindow, type Window } from "@tauri-apps/api/window"
import { WebviewWindow } from "@tauri-apps/api/webviewWindow"
import {
  isPermissionGranted,
  requestPermission,
  sendNotification,
} from "@tauri-apps/plugin-notification"
import { openUrl } from "@tauri-apps/plugin-opener"

import { isDesktopApp } from "./platform.ts"
import { sendAcknowledgedPaneRequest } from "./pane-window-protocol.ts"
import { runWorkspaceNativeDrag } from "./workspace-native-drag.ts"
import type {
  ChatEvent,
  ChatRequest,
  CloneProgress,
  CloneResult,
  GitBranches,
  GitIdentity,
  GitOutcome,
  GitStatus,
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

export type WorkspaceNativeDragPayload =
  | { kind: "pane" | "tab"; paneId: string; paneState?: string; busy?: boolean }
  | { kind: "session"; id: string; side: "chat" | "code" }

type WorkspaceNativeDragNotice = {
  phase: "start" | "end"
  dragId: string
  sourceWindow: string
  payload: WorkspaceNativeDragPayload
}

const WORKSPACE_DRAG_EVENT = "tavi-workspace-native-drag"
const WORKSPACE_CONVERSATION_EVENT = "tavi-workspace-conversation-state"
const PANE_DOCK_BACK_ACK_EVENT = "tavi-pane-dock-back-ack"
const PANE_WINDOW_READY_EVENT = "tavi-pane-window-ready"
let workspaceNativeDropHandler: ((payload: unknown) => void) | undefined
let workspaceNativeDropSetup: Promise<void> | null = null
let workspaceNativeDragOverHandler: ((event: { type: string; position?: { x: number; y: number } }) => void) | undefined

const ensureWorkspaceNativeDropListener = (): Promise<void> => {
  if (!workspaceNativeDropSetup) {
    workspaceNativeDropSetup = getCurrentWindow().onDragDropEvent(async ({ payload }) => {
      workspaceNativeDragOverHandler?.(payload)
      if (payload.type !== "drop" || !Array.isArray(payload.paths)) return
      for (const path of payload.paths) {
        try {
          const data = await invoke<unknown | null>("read_workspace_drag_payload", { path })
          if (data !== null) {
            workspaceNativeDropHandler?.(data)
            return
          }
        } catch {
          // Non-plugin file drops keep flowing through the existing file-drop handling.
        }
      }
    }).then(() => undefined)
      .catch((error) => { workspaceNativeDropSetup = null; throw error })
  }
  return workspaceNativeDropSetup
}

/** Starts the native desktop drag protocol; browser builds keep HTML DnD. */
export const startWorkspaceNativeDrag = (
  element: HTMLElement,
  payload: WorkspaceNativeDragPayload,
  event?: DragEvent,
): boolean => {
  if (!isDesktopApp()) return false
  event?.preventDefault()
  const sourceWindow = getCurrentWindow().label
  const dragId = crypto.randomUUID()
  const notice: WorkspaceNativeDragNotice = { phase: "start", dragId, sourceWindow, payload }
  void runWorkspaceNativeDrag({
    announceStart: () => emit(WORKSPACE_DRAG_EVENT, notice),
    drag: async () => {
      const { dragBack } = await import("@crabnebula/tauri-plugin-drag-as-window")
      await dragBack(element, { ...notice, version: 1 }, undefined, { mode: "move" })
    },
    announceEnd: () => emit(WORKSPACE_DRAG_EVENT, { ...notice, phase: "end" } satisfies WorkspaceNativeDragNotice),
  })
  return true
}

/** Receives native drag lifecycle events from sibling Tauri webviews. */
export const onWorkspaceNativeDrag = async (
  handler: (notice: WorkspaceNativeDragNotice) => void,
): Promise<() => void> => {
  requireDesktop()
  return listen<WorkspaceNativeDragNotice>(WORKSPACE_DRAG_EVENT, (event) => handler(event.payload))
}

/** Registers this window as a target for JSON pane/session drags. */
export const onWorkspaceNativeDrop = async (
  handler: (payload: unknown) => void,
): Promise<void> => {
  requireDesktop()
  workspaceNativeDropHandler = handler
  await ensureWorkspaceNativeDropListener()
}

/** Native drag-over positions are physical pixels local to this webview. */
export const onWorkspaceNativeDragOver = async (
  handler: (event: { type: string; position?: { x: number; y: number } }) => void,
): Promise<() => void> => {
  requireDesktop()
  workspaceNativeDragOverHandler = handler
  await ensureWorkspaceNativeDropListener()
  return () => {
    if (workspaceNativeDragOverHandler === handler) workspaceNativeDragOverHandler = undefined
  }
}

/** Confirms a popped-out pane was accepted into the main layout. */
export const notifyWorkspaceDropAccepted = async (sourceWindow: string, paneId: string): Promise<void> => {
  requireDesktop()
  await emitTo(sourceWindow, "tavi-workspace-native-drop-accepted", { paneId })
}

/** Listens for the main layout accepting this window's pane drop. */
export const onWorkspaceDropAccepted = async (handler: (paneId: string) => void): Promise<() => void> => {
  requireDesktop()
  return listen<{ paneId?: unknown }>("tavi-workspace-native-drop-accepted", (event) => {
    if (typeof event.payload?.paneId === "string") handler(event.payload.paneId)
  })
}

/** Broadcasts a serializable live conversation snapshot to sibling webviews. */
export const broadcastWorkspaceConversationState = async (id: string, revision: number, state: unknown): Promise<void> => {
  requireDesktop()
  await emit(WORKSPACE_CONVERSATION_EVENT, { sourceWindow: getCurrentWindow().label, id, revision, state })
}

/** Receives conversation snapshots from sibling webviews. */
export const onWorkspaceConversationState = async (
  handler: (snapshot: { sourceWindow: string; id: string; revision: number; state: unknown }) => void,
): Promise<() => void> => {
  requireDesktop()
  const sourceWindow = getCurrentWindow().label
  return listen<{ sourceWindow?: unknown; id?: unknown; revision?: unknown; state?: unknown }>(WORKSPACE_CONVERSATION_EVENT, (event) => {
    const value = event.payload
    if (typeof value?.sourceWindow !== "string" || value.sourceWindow === sourceWindow || typeof value.id !== "string" || typeof value.revision !== "number" || !Number.isSafeInteger(value.revision) || !value.state || typeof value.state !== "object") return
    handler({ sourceWindow: value.sourceWindow, id: value.id, revision: value.revision, state: value.state })
  })
}

/** Convert Tauri's native drop position to CSS pixels in this webview. */
export const workspaceDropPoint = async (position: { x: number; y: number }): Promise<{ x: number; y: number }> => {
  requireDesktop()
  const scale = await getCurrentWindow().scaleFactor()
  return { x: position.x / scale, y: position.y / scale }
}

/** A native window on one registered workspace pane. */
export type PaneWindowRequest = {
  id: string
  title: string
}

/** Opens an actual Tauri webview window for one pane. */
export const createPaneWindow = async ({ id, title }: PaneWindowRequest): Promise<void> => {
  requireDesktop()
  const label = `pane-${id}`
  const existing = await WebviewWindow.getByLabel(label)
  if (existing) {
    await existing.setFocus()
    return
  }
  const params = new URLSearchParams({ pane: id })
  let window: WebviewWindow | undefined
  let unlistenReady: (() => void) | undefined
  let readyTimeout: ReturnType<typeof setTimeout> | undefined
  let closeHandlerReady = false
  let paneHandlerReady = false
  let resolveReady!: () => void
  let rejectReady!: (error: Error) => void
  const revealWhenReady = () => {
    if (closeHandlerReady && paneHandlerReady && window) void window.show().then(resolveReady, rejectReady)
  }
  try {
    const ready = new Promise<void>((resolve, reject) => { resolveReady = resolve; rejectReady = reject })
    unlistenReady = await listen<{ id?: unknown; sourceWindow?: unknown }>(PANE_WINDOW_READY_EVENT, (event) => {
      const value = event.payload
      if (value?.id !== id || value.sourceWindow !== label) return
      paneHandlerReady = true
      revealWhenReady()
    })
    // Registration completes before the secondary webview is created, so its
    // ready event cannot race ahead of the listener.
    readyTimeout = setTimeout(() => rejectReady(new Error("The pane window did not finish opening.")), 10000)
    window = new WebviewWindow(label, {
      url: `/?${params.toString()}`,
      title: `${title} · Tavi`,
      width: 900,
      height: 640,
      minWidth: 420,
      minHeight: 320,
      center: true,
      decorations: true,
      // Wait until the pane webview has installed its close/dock listener.
      visible: false,
    })
    const created = new Promise<void>((resolve, reject) => {
      void window!.once("tauri://created", () => resolve())
      void window!.once("tauri://error", (event) => reject(new Error(String(event.payload))))
    })
    await Promise.all([
      created,
      window.onCloseRequested((event) => {
        event.preventDefault()
        void emitTo(label, "tavi-pane-close-request", { id }).catch(() => {})
      }),
    ])
    closeHandlerReady = true
    revealWhenReady()
    await ready
  } catch (error) {
    await window?.destroy().catch(() => {})
    throw error
  } finally {
    if (readyTimeout) clearTimeout(readyTimeout)
    unlistenReady?.()
  }
}

/** Announces that the pane's close/dock listener is installed. */
export const notifyPaneWindowReady = async (id: string): Promise<void> => {
  requireDesktop()
  await emitTo("main", PANE_WINDOW_READY_EVENT, { id, sourceWindow: getCurrentWindow().label })
}

/** Whether a saved pane window still exists in this native app process. */
export const paneWindowExists = async (id: string): Promise<boolean> => {
  requireDesktop()
  return Boolean(await WebviewWindow.getByLabel(`pane-${id}`))
}

/** Returns a pane from a native pane window to the main workspace. */
export const requestPaneDockBack = async (payload: { id: string; targetId?: string; edge?: string; paneState?: string }): Promise<void> => {
  requireDesktop()
  const requestId = crypto.randomUUID()
  const sourceWindow = getCurrentWindow().label
  await sendAcknowledgedPaneRequest({
    id: payload.id,
    requestId,
    subscribe: async (receive) => listen<{ requestId?: unknown; id?: unknown; accepted?: unknown }>(PANE_DOCK_BACK_ACK_EVENT, (event) => receive(event.payload ?? {})),
    send: () => emitTo("main", "tavi-pane-dock-back", { ...payload, requestId, sourceWindow }),
  })
}

/** Listens for a dock-back request from a native pane window. */
export const onPaneDockBack = async (handler: (payload: { id: string; targetId?: string; edge?: string; paneState?: string }) => boolean | void | Promise<boolean | void>): Promise<() => void> => {
  requireDesktop()
  return listen("tavi-pane-dock-back", (event) => {
    if (!event.payload || typeof event.payload !== "object") return
    const payload = event.payload as { id?: unknown; targetId?: unknown; edge?: unknown; paneState?: unknown; requestId?: unknown; sourceWindow?: unknown }
    if (typeof payload.id !== "string" || typeof payload.requestId !== "string" || payload.sourceWindow !== `pane-${payload.id}`) return
    const request = { id: payload.id, ...(typeof payload.targetId === "string" ? { targetId: payload.targetId } : {}), ...(typeof payload.edge === "string" ? { edge: payload.edge } : {}), ...(typeof payload.paneState === "string" ? { paneState: payload.paneState } : {}) }
    // Defer invocation so a synchronous handler throw follows the same
    // negative-acknowledgement path as an asynchronous rejection.
    void Promise.resolve().then(() => handler(request)).then((accepted) =>
      emitTo(payload.sourceWindow as string, PANE_DOCK_BACK_ACK_EVENT, { requestId: payload.requestId, id: payload.id, accepted: accepted !== false }),
    ).catch(() => emitTo(payload.sourceWindow as string, PANE_DOCK_BACK_ACK_EVENT, { requestId: payload.requestId, id: payload.id, accepted: false }).catch(() => {}))
  })
}

/** Closes a secondary native window after its pane has been returned. */
export const destroyCurrentPaneWindow = async (): Promise<void> => {
  requireDesktop()
  await getCurrentWindow().destroy()
}

/** Handles the native close button without destroying a pane that is still answering. */
export const onPaneWindowCloseRequest = async (handler: () => void): Promise<() => void> => {
  requireDesktop()
  return listen("tavi-pane-close-request", () => handler())
}

/** Requests a dock-back from the native close control of a pane window. */
export const closePaneWindow = async (id: string): Promise<void> => {
  requireDesktop()
  const window = await WebviewWindow.getByLabel(`pane-${id}`)
  if (window) await window.close()
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

/* -------------------------------------------------------------------------- */
/* Git                                                                        */
/* -------------------------------------------------------------------------- */

/**
 * What a repository looks like right now.
 *
 * The command is the app's own, and it runs git with an argument array and
 * no shell. The reader's repository is never given to the model.
 */
export const gitStatus = async (path: string): Promise<GitStatus> => {
  requireDesktop()
  return invoke<GitStatus>("git_status", { path })
}

/** The branches the repository has, and which one is checked out. */
export const gitBranches = async (path: string): Promise<GitBranches> => {
  requireDesktop()
  return invoke<GitBranches>("git_branches", { path })
}

/**
 * Commits everything that is changed, staged or not.
 *
 * The identity is passed to git for this one commit and is not written into
 * the repository or into the machine's configuration.
 */
export const gitCommit = async (
  path: string,
  message: string,
  identity?: GitIdentity,
): Promise<GitOutcome> => {
  requireDesktop()
  return invoke<GitOutcome>("git_commit", { path, message, identity })
}

/** Fetches from the remote and merges what it fetched. */
export const gitPull = async (path: string): Promise<GitOutcome> => {
  requireDesktop()
  return invoke<GitOutcome>("git_pull", { path })
}

/** Sends the branch to the remote it tracks. */
export const gitPush = async (path: string): Promise<GitOutcome> => {
  requireDesktop()
  return invoke<GitOutcome>("git_push", { path })
}

/** Checks out a branch that is already there. */
export const gitSwitchBranch = async (
  path: string,
  branch: string,
): Promise<GitOutcome> => {
  requireDesktop()
  return invoke<GitOutcome>("git_switch_branch", { path, branch })
}

/** Makes a branch and checks it out. */
export const gitCreateBranch = async (
  path: string,
  branch: string,
): Promise<GitOutcome> => {
  requireDesktop()
  return invoke<GitOutcome>("git_create_branch", { path, branch })
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
