"use client"

import * as React from "react"

import { PANE_TYPES, type PaneType } from "./pane-types"
import type { DockEdge } from "@/lib/workspace-state"
import type { WorkspaceNativeDragPayload } from "@/lib/desktop"
import { DiffViewerPane } from "./panes/diff-viewer-pane"
import { SamplePane } from "./panes/sample-pane"

export type PaneActions = {
  active?: boolean
  onClose?: () => void
  onDockBack?: () => void
  onSplit?: (edge: DockEdge) => void
  onFocus?: () => void
  onMaximize?: () => void
  maximized?: boolean
  onPopOut?: () => void
  popOutAvailable?: boolean
  moveTargets?: Array<{ id: string; title: string }>
  onMoveTo?: (targetId: string) => void
  getDragPayload?: () => WorkspaceNativeDragPayload
}

/**
 * What a pane type carries beyond its name and mark.
 *
 * The registry is the one place that knows what a pane type *does*: which
 * component draws it, what actions its menu offers, and whether two of them
 * may exist at once. The pane types in `pane-types.ts` are the naming half
 * — the key, the name, the mark and the line the Views menu says — and
 * this is the doing half.
 *
 * A type that is not registered here cannot be added to a workspace: the
 * registry is the gate, and the layout engine asks it for a renderer rather
 * than keeping its own list.
 */
export type PaneRegistration = {
  /** The type's stable key. */
  type: string
  /** The default title, before anybody renames it. */
  defaultTitle: string
  /** The mark that names the pane. */
  icon: React.ComponentType<{ className?: string }>
  /** What the Views menu says the pane is for. */
  description: string
  /**
   * The component that draws the pane's content.
   *
   * A chat or code-session pane is a conversation surface: the workspace
   * and the pane window choose its renderer before asking the registry, so
   * this entry returns null rather than growing a second sample renderer.
   * The other types are tool panes; their real content is built in Phase 5.
   */
  render: (paneId: string, actions?: PaneActions) => React.ReactNode
  /** The actions the pane's menu offers, beyond the shared ones. */
  actions: readonly PaneAction[]
  /** Whether two instances of this type may exist at once. */
  allowDuplicate: boolean
}

/** An action a pane's menu may offer. */
export type PaneAction =
  | "split-left"
  | "split-right"
  | "split-top"
  | "split-bottom"
  | "focus"
  | "maximise"
  | "pop-out"
  | "rename"
  | "duplicate"
  | "close"

/**
 * The actions every pane offers, regardless of type. These are the shared
 * ones — the ones that belong to the workspace rather than to the pane.
 */
const SHARED_ACTIONS: readonly PaneAction[] = [
  "split-left",
  "split-right",
  "split-top",
  "split-bottom",
  "focus",
  "pop-out",
  "close",
]

/**
 * The registry.
 *
 * Built from `PANE_TYPES`, so the two cannot drift apart: a type added to
 * `pane-types.ts` is in the registry with a placeholder renderer, and a
 * type removed from one is removed from the other. The registry adds the
 * rendering and the actions; the pane types add the name and the mark.
 */
export const PANE_REGISTRY: ReadonlyMap<string, PaneRegistration> = new Map(
  PANE_TYPES.map((type: PaneType) => [
    type.id,
    {
      type: type.id,
      defaultTitle: type.label,
      icon: type.icon,
      description: type.description,
      render: (paneId: string, actions?: PaneActions) => {
        /* One session path: WorkspaceLayout and PaneWindow draw chat and
           code-session panes themselves. A second sample conversation here
           would drift from the real composer and mislead the next change. */
        if (type.id === "chat" || type.id === "code-session") return null
        if (type.id === "diff") return <DiffViewerPane paneId={paneId} {...actions} />
        return <SamplePane pane={{ id: paneId, type: type.id }} actions={actions ?? {}} />
      },
      actions: SHARED_ACTIONS,
      // Every type may be duplicated except the two that are about a single
      // conversation: a chat and a code session are one thing at a time.
      allowDuplicate: type.id !== "chat" && type.id !== "code-session",
    },
  ]),
)

/** Looks up a pane type's registration. */
export const getPaneRegistration = (
  type: string,
): PaneRegistration | undefined => PANE_REGISTRY.get(type)

/** Whether a pane type is registered. */
export const isRegisteredPaneType = (type: string): boolean =>
  PANE_REGISTRY.has(type)

/** Every registered pane type, in the order of the pane types. */
export const registeredPaneTypes = (): PaneRegistration[] => [...PANE_REGISTRY.values()]

/**
 * The pane instance's own title, or the type's default when it has none.
 */
export const paneTitleFor = (type: string, instanceTitle: string | undefined): string =>
  instanceTitle ?? getPaneRegistration(type)?.defaultTitle ?? type
