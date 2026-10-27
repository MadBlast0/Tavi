import type { PaneLocalState } from "./workspace-state.ts"

const SET_MARKER = "__taviPaneStateSet__"

/** Encodes pane-local UI state for a local Tauri dock-back event. */
export const serializePaneLocalState = (state: PaneLocalState): string =>
  JSON.stringify(state, (_key, value: unknown) =>
    value instanceof Set ? { [SET_MARKER]: [...value] } : value,
  )

/** Decodes a bounded, plain pane-state object received from a sibling webview. */
export const parsePaneLocalState = (raw: unknown): PaneLocalState | null => {
  if (typeof raw !== "string" || raw.length > 256_000) return null
  try {
    const value = JSON.parse(raw, (_key, item: unknown) => {
      if (!item || typeof item !== "object" || Array.isArray(item)) return item
      const record = item as Record<string, unknown>
      if (!(SET_MARKER in record)) return item
      return Array.isArray(record[SET_MARKER]) ? new Set(record[SET_MARKER]) : item
    }) as unknown
    return value !== null && typeof value === "object" && !Array.isArray(value)
      ? value as PaneLocalState
      : null
  } catch {
    return null
  }
}
