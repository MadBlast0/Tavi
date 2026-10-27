export type PaneWindowAcknowledgement = {
  requestId?: unknown
  id?: unknown
  accepted?: unknown
}

/** A popped-out pane dropped on its main-window placeholder returns in place. */
export const isDockBackToOriginalPaneTarget = ({
  kind,
  paneId,
  targetPaneId,
  sourceWindow,
}: {
  kind: "pane" | "tab" | "session"
  paneId: string
  targetPaneId: string
  sourceWindow: string
}): boolean => kind === "pane" && paneId === targetPaneId && sourceWindow === `pane-${paneId}`

/** Sends a window handoff only after its acknowledgement listener is active. */
export const sendAcknowledgedPaneRequest = async ({
  id,
  requestId,
  subscribe,
  send,
  timeoutMs = 5000,
}: {
  id: string
  requestId: string
  subscribe: (receive: (acknowledgement: PaneWindowAcknowledgement) => void) => Promise<() => void>
  send: () => Promise<void>
  timeoutMs?: number
}): Promise<void> => {
  let settle: (accepted: boolean) => void = () => {}
  const acknowledged = new Promise<boolean>((resolve) => { settle = resolve })
  const unlisten = await subscribe((value) => {
    if (value.requestId === requestId && value.id === id) settle(value.accepted === true)
  })
  const timeout = setTimeout(() => settle(false), timeoutMs)
  try {
    await send()
    if (!await acknowledged) throw new Error("The main workspace did not confirm the pane was restored.")
  } finally {
    clearTimeout(timeout)
    unlisten()
  }
}
