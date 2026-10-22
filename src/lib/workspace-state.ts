"use client"

import * as React from "react"

/**
 * The state the workspace owns.
 *
 * The plan puts eight things in the workspace's care — the app section, the
 * active project or session, the pane instances, the active pane, the
 * layout geometry, the pane-local state and the overlay state, and the
 * workspace's own contents — and asks that the ownership of each of them be
 * written down rather than guessed at. This file holds the ones that are
 * genuinely new, and `docs/workspace-state.md` is the answer for all eight.
 *
 * Two of the eight are deliberately not here, and their absence is the point:
 *
 * - The **app section** — Chat or Code — belongs to `ComposerVariantProvider`
 *   in `src/blocks/prompt-input/composer-variant.tsx`. The workspace keeps no
 *   copy of it. The switch in the rail changes it freely, and two answers to
 *   "which side are we on" is a bug waiting for a day when one of them is
 *   forgotten.
 * - The **active thread** belongs to the thread bridge and the thread stores.
 *   A pane may say which session it is *about*; that is a reference, and the
 *   store still owns the session.
 *
 * And a ninth thing is not here either, because it is not the workspace's at
 * all: anything to do with **running the model** belongs to the conversation
 * runtime, which the build plan puts in a later layer. Nothing here knows
 * whether a reply is in flight, and nothing here should: a layout that
 * carries a "running" flag is a layout that has opinions about work it does
 * not do.
 *
 * **There is no "open" flag, and there is no `openWorkspace()`.** The first
 * version of this file had both, and they were the mistake: the workspace
 * was imagined as a place you go rather than a place that is, and a place
 * you go needs a way in, and the way in grew a row in the rail that the
 * plan had twice said not to put there. The workspace is the main content
 * region. It is always there. What it shows is decided by what is in it —
 * no session and no panes means the landing screen, a session or a pane
 * means the layout — and that is read from the state below rather than
 * switched on.
 *
 * A warning about the word. The **workspace** is the region that arranges
 * pane instances. `src/lib/workspace.ts` is something else entirely — a
 * folder the app has been given access to — and the two are unrelated. The
 * file is named `workspace-state.ts` so the two can live side by side.
 */

/**
 * A pane type's key.
 *
 * A plain string, and not a union of the types that exist. The registry of
 * pane types is a separate thing with its own home, and a union written here
 * would have to be edited every time a type is added — which is the coupling
 * the registry exists to remove.
 */
export type PaneTypeKey = string

/** One occurrence of a pane type. */
export type PaneInstanceId = string

/** One tab group. */
export type GroupId = string

/**
 * What a pane is about.
 *
 * References, not copies. A pane may be associated with a project or a
 * session — a Terminal pointed at a folder, a Diff pane showing what a
 * session changed — and the association is a pair of ids. The folder's name
 * is read from the grant when it is needed, and the session's title is read
 * from the thread store, so neither can go stale here.
 *
 * An association is not ownership. The app's own active thread is the
 * thread bridge's; a pane that mentions a session does not become the
 * active one, and closing the pane does not close the session.
 */
export type PaneContext = {
  /** The project — a folder grant — the pane is about. */
  projectId?: string
  /** The session — a chat or a code session — the pane is about. */
  sessionId?: string
}

/**
 * One occurrence of a pane type.
 *
 * The instance says which *kind* of pane this is, and nothing about how it
 * looks or what it contains. The title is the one thing the instance owns
 * outright, because it is the user's own word for it; everything else — the
 * icon, the default title, the renderer — is asked for from the registry by
 * the type key.
 */
export type PaneInstance = {
  /** Unique within the workspace. */
  id: PaneInstanceId
  /** The kind of pane this is. */
  type: PaneTypeKey
  /** The pane's own title, when it should not be the type's default. */
  title?: string
  /** What the pane is about, as references. */
  context?: PaneContext
}

/** What may be given to a pane as it is added. */
export type PaneOptions = {
  /** The pane's own title, when it should not be the type's default. */
  title?: string
  /** What the pane is about, as references. */
  context?: PaneContext
}

/**
 * Where a pane may be dropped.
 *
 * Four edges and the middle. An edge splits the pane that is dropped on;
 * the middle joins the group that is there, making one if there is not.
 */
export type DockEdge = "left" | "right" | "top" | "bottom" | "center"

/**
 * The arrangement of the panes.
 *
 * A tree of three kinds of node, and nothing else:
 *
 * - a **pane** names one pane instance;
 * - a **split** names an orientation, how the space is divided, and its two
 *   children;
 * - a **group** names a set of panes that share one place, one of which is
 *   showing.
 *
 * There is no room in it for a pane's contents, and that is deliberate — the
 * geometry says where a pane is, and the pane says what is in it. A tree
 * that could carry a pane's state would have to be rewritten every time a
 * pane's state changed, and the arrangement would stop being the
 * arrangement.
 *
 * Nothing here assumes six slots. A tree of one leaf, two leaves, three
 * columns or six panes is the same shape, and the number of panes is a
 * property of the tree rather than a slot in it.
 */
export type LayoutNode =
  | {
      kind: "pane"
      /** The instance this leaf stands for. */
      paneId: PaneInstanceId
    }
  | {
      kind: "split"
      /**
       * How the two children are laid out.
       *
       * `horizontal` puts them side by side; `vertical` puts one above the
       * other.
       */
      orientation: "horizontal" | "vertical"
      /** The share the first child takes, strictly between 0 and 1. */
      ratio: number
      children: [LayoutNode, LayoutNode]
    }
  | {
      kind: "group"
      /** The group's own id, so a tab group can be named and found. */
      groupId: GroupId
      /** The panes in the group, in the order the tab strip shows them. */
      tabs: PaneInstanceId[]
      /** Which of them is showing. */
      activeTabId: PaneInstanceId
    }

/**
 * A pane's own state.
 *
 * The bag of things that belong to one pane and to no one else: which file
 * is selected, which filter is on, which row is expanded. It is a bag
 * rather than a fixed shape because what a pane can hold is the pane type's
 * business — the registry says which state categories a type supports — and
 * the workspace only has to know where the answer lives.
 *
 * One bag per instance, never one per type: two File Explorers on screen at
 * once are two different places, and a file selected in one of them says
 * nothing about the other.
 */
export type PaneLocalState = Record<string, unknown>

/**
 * The overlay that is open over the workspace.
 *
 * `action` names what the overlay is *for* rather than what it is drawn
 * with. The Views menu and the layout-preset menu are both menus, but they
 * are two different actions, and one of them opening must close the other.
 * Naming the action is what keeps the app to the rule that two overlays
 * never compete for the same thing.
 */
export type WorkspaceOverlay = {
  /** The action the overlay offers. */
  action: string
  /** The pane it belongs to, when it belongs to one. */
  paneId?: PaneInstanceId
}

/**
 * The workspace as it is right now.
 *
 * One object, read through `useWorkspace`. It is replaced whenever
 * something changes, and the parts of it that did not change keep their
 * identity, so a reader of one part is not woken by a change to another.
 */
export type WorkspaceSnapshot = {
  /** Every pane instance, in the order they were added. */
  panes: PaneInstance[]
  /** The pane that has focus, or null when none does. */
  activePaneId: PaneInstanceId | null
  /** The arrangement, or null when nothing has been placed. */
  layout: LayoutNode | null
  /** The overlay that is open, or null. */
  overlay: WorkspaceOverlay | null
  /** Each pane's own state, by pane id. */
  paneState: Record<PaneInstanceId, PaneLocalState>
}

/**
 * The most panes the workspace will hold.
 *
 * Six is the product's rule (`docs/plan/ui-ux-plan.md` §1.5), and it is a
 * rule about *pane instances*, not about places: a tab group holding three
 * tabs is three panes, and a pane sitting behind a tab still counts. The
 * number of registered pane types, and the number of projects and sessions,
 * are not limited by it.
 *
 * It is checked where a pane is added rather than where one is drawn,
 * because the moment to refuse a seventh pane is the moment the user asks
 * for it. Moving a pane never adds one, so the cap is never in the way of
 * rearranging what is already there.
 */
export const MAX_VISIBLE_PANES = 6

/**
 * The store's own operations.
 */
export type WorkspaceStore = {
  /** The workspace as it is right now. */
  getSnapshot: () => WorkspaceSnapshot
  /** Listen for changes. Returns an unsubscribe function. */
  subscribe: (listener: () => void) => () => void
  /**
   * Adds a pane, and gives it an id nobody else has.
   *
   * Returns null when the workspace is already full, which is the six-pane
   * rule. The pane is added but not placed: where it goes is the layout
   * engine's decision, and it is made with `setLayout`.
   */
  addPane: (type: PaneTypeKey, options?: PaneOptions) => PaneInstance | null
  /**
   * Removes a pane, and everything that referred to it.
   *
   * That is its own state, its place in the arrangement, its focus, and any
   * overlay that belonged to it. What it does *not* take is the session or
   * the project the pane was about: those are the app's, and closing a
   * window onto a conversation is not closing the conversation.
   */
  removePane: (id: PaneInstanceId) => void
  /** Gives a pane its own title, or takes the title back. */
  setPaneTitle: (id: PaneInstanceId, title: string | undefined) => void
  /**
   * Says which pane has focus.
   *
   * One pane, or none. An id that is not a pane in this workspace is
   * refused rather than remembered, because a focus that points at nothing
   * is a focus nobody can draw.
   */
  setActivePane: (id: PaneInstanceId | null) => void
  /**
   * Puts an arrangement in place.
   *
   * Returns false and changes nothing when the arrangement is not one this
   * workspace can hold — a pane that is not there, a pane in two places, a
   * ratio that is not a share of anything.
   */
  setLayout: (layout: LayoutNode | null) => boolean
  /**
   * Moves a pane onto another one.
   *
   * The one operation the engine needs, and the one that does the work a
   * drop does: the pane is taken out of wherever it was and put against the
   * target, on the given edge, or into the target's group. A pane that is
   * dropped on itself is refused, and a move that would break the
   * arrangement changes nothing.
   */
  dockPane: (
    paneId: PaneInstanceId,
    targetPaneId: PaneInstanceId,
    edge: DockEdge,
  ) => boolean
  /**
   * Changes one pane's own state.
   *
   * The patch is merged into what the pane already had, so that a pane that
   * keeps two things does not lose the first when the second is set.
   */
  setPaneState: (id: PaneInstanceId, patch: PaneLocalState) => void
  /**
   * Opens an overlay.
   *
   * There is room for one. Opening one closes whatever was open, which is
   * how the app keeps to the rule that two overlays never compete for the
   * same action.
   */
  openOverlay: (action: string, paneId?: PaneInstanceId) => void
  /** Closes the overlay. */
  closeOverlay: () => void
}

/* ------------------------------------------------------------------ */
/* The tree, and the rules on it                                        */
/* ------------------------------------------------------------------ */

/**
 * The pane ids an arrangement mentions, in the order it walks them.
 */
export const layoutPaneIds = (layout: LayoutNode | null): PaneInstanceId[] => {
  if (layout === null) return []
  if (layout.kind === "pane") return [layout.paneId]
  if (layout.kind === "group") return [...layout.tabs]
  return [
    ...layoutPaneIds(layout.children[0]),
    ...layoutPaneIds(layout.children[1]),
  ]
}

/**
 * What is wrong with an arrangement, if anything.
 *
 * The rules are about the arrangement alone, and they are the ones that
 * make it drawable: every pane it names is a pane that exists, no pane is
 * in two places, every split divides the space it has, and every group
 * shows a tab it actually has.
 *
 * A pane that is in the arrangement but is not a pane is the one that
 * matters, because it is the one that turns into a blank space on screen.
 */
export const validateLayout = (
  layout: LayoutNode | null,
  knownPaneIds: Iterable<PaneInstanceId>,
): string[] => {
  if (layout === null) return []
  const known = new Set(knownPaneIds)
  const problems: string[] = []
  const placed = new Set<PaneInstanceId>()
  const groups = new Set<GroupId>()

  const walk = (node: LayoutNode) => {
    if (node.kind === "pane") {
      if (!known.has(node.paneId)) {
        problems.push(`there is no pane instance with the id ${node.paneId}`)
      }
      if (placed.has(node.paneId)) {
        problems.push(`the pane ${node.paneId} is in the arrangement twice`)
      }
      placed.add(node.paneId)
      return
    }
    if (node.kind === "group") {
      if (groups.has(node.groupId)) {
        problems.push(`there is more than one group with the id ${node.groupId}`)
      }
      groups.add(node.groupId)
      if (node.tabs.length === 0) {
        problems.push(`the group ${node.groupId} has no tabs in it`)
      }
      if (!node.tabs.includes(node.activeTabId)) {
        problems.push(
          `the group ${node.groupId} shows ${node.activeTabId}, which is not one of its tabs`,
        )
      }
      for (const tab of node.tabs) {
        if (!known.has(tab)) {
          problems.push(`there is no pane instance with the id ${tab}`)
        }
        if (placed.has(tab)) {
          problems.push(`the pane ${tab} is in the arrangement twice`)
        }
        placed.add(tab)
      }
      return
    }
    if (!Number.isFinite(node.ratio) || node.ratio <= 0 || node.ratio >= 1) {
      problems.push(`a split has the ratio ${node.ratio}, which is no share of anything`)
    }
    if (node.children.length !== 2) {
      problems.push(`a split has to have two children`)
    }
    for (const child of node.children) walk(child)
  }

  walk(layout)
  return problems
}

/**
 * Takes a pane out of an arrangement.
 *
 * A split that is left with one child collapses into that child, so the
 * tree does not keep a branch that is holding nothing. A group that is left
 * with one tab collapses into that tab, because a group of one is a pane
 * with a tab strip drawn on it. Nothing else moves: where a pane goes, how
 * the space is divided, what the panes are — those are the layout engine's
 * decisions, and this only undoes the one that put the pane there.
 */
export const removePaneFromLayout = (
  layout: LayoutNode | null,
  paneId: PaneInstanceId,
): LayoutNode | null => {
  if (layout === null) return null
  if (layout.kind === "pane") return layout.paneId === paneId ? null : layout

  if (layout.kind === "group") {
    if (!layout.tabs.includes(paneId)) return layout
    const tabs = layout.tabs.filter((tab) => tab !== paneId)
    if (tabs.length === 0) return null
    if (tabs.length === 1) return { kind: "pane", paneId: tabs[0] }
    return {
      ...layout,
      tabs,
      activeTabId:
        layout.activeTabId === paneId ? tabs[0] : layout.activeTabId,
    }
  }

  const [first, second] = layout.children
  const nextFirst = removePaneFromLayout(first, paneId)
  const nextSecond = removePaneFromLayout(second, paneId)
  if (nextFirst === null && nextSecond === null) return null
  if (nextFirst === null) return nextSecond
  if (nextSecond === null) return nextFirst
  return { ...layout, children: [nextFirst, nextSecond] }
}

/**
 * Finds the node that stands for a pane, or null when the pane is not in
 * the arrangement.
 */
const findPane = (
  layout: LayoutNode | null,
  paneId: PaneInstanceId,
): LayoutNode | null => {
  if (layout === null) return null
  if (layout.kind === "pane") return layout.paneId === paneId ? layout : null
  if (layout.kind === "group") {
    return layout.tabs.includes(paneId) ? layout : null
  }
  return (
    findPane(layout.children[0], paneId) ?? findPane(layout.children[1], paneId)
  )
}

/**
 * Replaces the node that stands for a pane with another node.
 */
const replacePane = (
  layout: LayoutNode,
  paneId: PaneInstanceId,
  replacement: LayoutNode,
): LayoutNode | null => {
  if (layout.kind === "pane") {
    return layout.paneId === paneId ? replacement : layout
  }
  if (layout.kind === "group") {
    /* A group is not a leaf: the pane is inside it, so replacing the pane
       means putting the new node into the group as a tab. That is what
       dropping onto the middle of a group means, and it is handled by
       `dockPaneInto` rather than here. */
    return layout
  }
  const [first, second] = layout.children
  const nextFirst = replacePane(first, paneId, replacement)
  const nextSecond = replacePane(second, paneId, replacement)
  if (nextFirst === null && nextSecond === null) return null
  if (nextFirst === null) return nextSecond
  if (nextSecond === null) return nextFirst
  return { ...layout, children: [nextFirst, nextSecond] }
}

/**
 * A group's id that nobody is using.
 *
 * Groups are named so that a tab group can be found in the tree and talked
 * about — the store keeps one group id per group, and the group is a thing
 * a reader can point at.
 */
let groupSerial = 0
export const newGroupId = (): GroupId => {
  for (;;) {
    groupSerial += 1
    const id = `g-${groupSerial.toString(36)}`
    if (!usedGroupIds.has(id)) return id
  }
}
const usedGroupIds = new Set<GroupId>()

/**
 * Moves a pane onto another one.
 *
 * The one operation the engine needs, and the one a drop performs. The pane
 * is taken out of wherever it was and put against the target:
 *
 * - an **edge** splits the target, and the dragged pane takes the new half;
 * - the **middle** puts the dragged pane into the target's group, making a
 *   group of the two when the target was a pane on its own.
 *
 * A pane dropped on itself is refused. A pane dropped on a pane that is in
 * the same group joins that group, rather than making a group of two that
 * are already side by side.
 *
 * The result is a new tree. Nothing is changed in place, so a caller that
 * does not like the answer can throw it away.
 */
export const dockPaneInto = (
  layout: LayoutNode | null,
  paneId: PaneInstanceId,
  targetPaneId: PaneInstanceId,
  edge: DockEdge,
): LayoutNode | null => {
  if (paneId === targetPaneId) return layout
  if (layout === null) return null

  const withoutDragged = removePaneFromLayout(layout, paneId)
  if (withoutDragged === null) return null

  const target = findPane(withoutDragged, targetPaneId)
  if (target === null) return layout

  /* Dropping onto the middle of a pane that is already in a group joins
     that group, rather than making a group inside a group. */
  if (edge === "center" && target.kind === "group") {
    if (target.tabs.includes(paneId)) return withoutDragged
    return replaceGroup(
      withoutDragged,
      target.groupId,
      {
        ...target,
        tabs: [...target.tabs, paneId],
      },
    )
  }

  if (edge === "center") {
    /* A pane on its own: the two of them become a group. */
    return replacePane(withoutDragged, targetPaneId, {
      kind: "group",
      groupId: newGroupId(),
      tabs: [targetPaneId, paneId],
      activeTabId: targetPaneId,
    })
  }

  const dragged: LayoutNode = { kind: "pane", paneId }
  const horizontal = edge === "left" || edge === "right"
  const draggedFirst = edge === "left" || edge === "top"

  const split: LayoutNode = {
    kind: "split",
    orientation: horizontal ? "horizontal" : "vertical",
    ratio: 0.5,
    children: draggedFirst
      ? [dragged, target]
      : [target, dragged],
  }

  return replacePane(withoutDragged, targetPaneId, split)
}

/**
 * Replaces a group, wherever it is in the tree.
 */
const replaceGroup = (
  layout: LayoutNode,
  groupId: GroupId,
  replacement: LayoutNode,
): LayoutNode | null => {
  if (layout.kind === "group") {
    return layout.groupId === groupId ? replacement : layout
  }
  if (layout.kind === "pane") return layout
  const [first, second] = layout.children
  const nextFirst = replaceGroup(first, groupId, replacement) ?? first
  const nextSecond = replaceGroup(second, groupId, replacement) ?? second
  return { ...layout, children: [nextFirst, nextSecond] }
}

/**
 * Shows another tab in a group.
 *
 * The group keeps its tabs in the order the strip shows them; this only
 * changes which of them is showing.
 */
export const showTab = (
  layout: LayoutNode | null,
  groupId: GroupId,
  paneId: PaneInstanceId,
): LayoutNode | null => {
  if (layout === null) return null
  if (layout.kind === "group") {
    if (layout.groupId !== groupId) return layout
    if (!layout.tabs.includes(paneId)) return layout
    return { ...layout, activeTabId: paneId }
  }
  if (layout.kind === "pane") return layout
  const [first, second] = layout.children
  const nextFirst = showTab(first, groupId, paneId) ?? first
  const nextSecond = showTab(second, groupId, paneId) ?? second
  return { ...layout, children: [nextFirst, nextSecond] }
}

/* ------------------------------------------------------------------ */
/* The store                                                            */
/* ------------------------------------------------------------------ */

/**
 * Builds a workspace store.
 *
 * A factory rather than a single object, because the app has one workspace
 * and a test has as many as it needs, and a store that outlived a test
 * would carry the previous test's panes into the next one.
 */
export const createWorkspaceStore = (): WorkspaceStore => {
  const listeners = new Set<() => void>()

  let panes: PaneInstance[] = []
  let activePaneId: PaneInstanceId | null = null
  let layout: LayoutNode | null = null
  let overlay: WorkspaceOverlay | null = null
  let paneState: Record<PaneInstanceId, PaneLocalState> = {}

  let snapshot: WorkspaceSnapshot = {
    panes,
    activePaneId,
    layout,
    overlay,
    paneState,
  }

  const publish = () => {
    snapshot = { panes, activePaneId, layout, overlay, paneState }
    for (const listener of listeners) listener()
  }

  /**
   * An id nobody else has.
   *
   * The serial makes it unique inside this workspace whatever the random
   * part does, and the random part keeps two workspaces from handing out
   * the same id — which matters once a layout is written down and read
   * back somewhere else.
   */
  let serial = 0
  const newId = (): PaneInstanceId => {
    for (;;) {
      serial += 1
      const id = `p-${Math.random().toString(36).slice(2, 8)}-${serial.toString(36)}`
      if (!panes.some((pane) => pane.id === id)) return id
    }
  }

  const has = (id: PaneInstanceId) => panes.some((pane) => pane.id === id)

  return {
    getSnapshot: () => snapshot,

    subscribe: (listener) => {
      listeners.add(listener)
      return () => {
        listeners.delete(listener)
      }
    },

    addPane: (type, options) => {
      if (panes.length >= MAX_VISIBLE_PANES) return null
      const instance: PaneInstance = { id: newId(), type }
      if (options?.title !== undefined) instance.title = options.title
      if (options?.context !== undefined) instance.context = options.context
      panes = [...panes, instance]
      publish()
      return instance
    },

    removePane: (id) => {
      if (!has(id)) return
      panes = panes.filter((pane) => pane.id !== id)
      if (activePaneId === id) activePaneId = null
      if (overlay && overlay.paneId === id) overlay = null
      if (paneState[id]) {
        const next = { ...paneState }
        delete next[id]
        paneState = next
      }
      layout = removePaneFromLayout(layout, id)
      publish()
    },

    setPaneTitle: (id, title) => {
      if (!has(id)) return
      panes = panes.map((pane) => {
        if (pane.id !== id) return pane
        const next = { ...pane }
        if (title === undefined) delete next.title
        else next.title = title
        return next
      })
      publish()
    },

    setActivePane: (id) => {
      if (id !== null && !has(id)) return
      if (activePaneId === id) return
      activePaneId = id
      publish()
    },

    setLayout: (next) => {
      if (validateLayout(next, panes.map((pane) => pane.id)).length > 0) {
        return false
      }
      layout = next
      publish()
      return true
    },

    dockPane: (paneId, targetPaneId, edge) => {
      if (!has(paneId) || !has(targetPaneId)) return false
      if (paneId === targetPaneId) return false
      const next = dockPaneInto(layout, paneId, targetPaneId, edge)
      if (next === null || next === layout) return false
      if (validateLayout(next, panes.map((pane) => pane.id)).length > 0) {
        return false
      }
      layout = next
      publish()
      return true
    },

    setPaneState: (id, patch) => {
      if (!has(id)) return
      const current = paneState[id] ?? {}
      paneState = { ...paneState, [id]: { ...current, ...patch } }
      publish()
    },

    openOverlay: (action, paneId) => {
      if (overlay && overlay.action === action && overlay.paneId === paneId) {
        return
      }
      overlay = paneId === undefined ? { action } : { action, paneId }
      publish()
    },

    closeOverlay: () => {
      if (overlay === null) return
      overlay = null
      publish()
    },
  }
}

/**
 * The app's workspace.
 *
 * One per app. The rail and the work area are on the same workspace, so
 * there is nothing to be gained from a second one, and everything to be
 * lost in two of them disagreeing.
 */
export const workspaceStore: WorkspaceStore = createWorkspaceStore()

/** The workspace as it is right now. */
export const getWorkspaceSnapshot = (): WorkspaceSnapshot =>
  workspaceStore.getSnapshot()

/** Listen for changes to the workspace. Returns an unsubscribe function. */
export const subscribeWorkspace = (listener: () => void): (() => void) =>
  workspaceStore.subscribe(listener)

/**
 * The workspace, as a component sees it.
 *
 * Read through the store rather than through state so that everything that
 * reads the workspace reads the same answer, and a change in one place
 * moves all of them.
 */
export const useWorkspace = (): WorkspaceSnapshot =>
  React.useSyncExternalStore(
    subscribeWorkspace,
    getWorkspaceSnapshot,
    getWorkspaceSnapshot,
  )

/**
 * One pane's own state.
 *
 * The empty state is a constant rather than a fresh object each time, so
 * that a pane that has nothing yet does not re-render on every change to
 * the workspace.
 */
const EMPTY_PANE_STATE: PaneLocalState = {}

/**
 * One pane's own state, as a component sees it.
 *
 * Read it; do not write to it. A change goes through `setPaneState`, which
 * is what tells the rest of the app that something moved.
 */
export const usePaneState = (paneId: PaneInstanceId): PaneLocalState => {
  const getSnapshot = React.useCallback(
    () => getWorkspaceSnapshot().paneState[paneId] ?? EMPTY_PANE_STATE,
    [paneId],
  )
  return React.useSyncExternalStore(subscribeWorkspace, getSnapshot, getSnapshot)
}

/** Adds a pane to the workspace. */
export const addPane = (
  type: PaneTypeKey,
  options?: PaneOptions,
): PaneInstance | null => workspaceStore.addPane(type, options)

/** Removes a pane, and everything that referred to it. */
export const removePane = (id: PaneInstanceId): void =>
  workspaceStore.removePane(id)

/** Gives a pane its own title, or takes the title back. */
export const setPaneTitle = (id: PaneInstanceId, title: string | undefined): void =>
  workspaceStore.setPaneTitle(id, title)

/** Says which pane has focus. */
export const setActivePane = (id: PaneInstanceId | null): void =>
  workspaceStore.setActivePane(id)

/** Puts an arrangement in place. Returns false when it is not one this workspace can hold. */
export const setLayout = (layout: LayoutNode | null): boolean =>
  workspaceStore.setLayout(layout)

/** Moves a pane onto another one, on an edge or into its group. */
export const dockPane = (
  paneId: PaneInstanceId,
  targetPaneId: PaneInstanceId,
  edge: DockEdge,
): boolean => workspaceStore.dockPane(paneId, targetPaneId, edge)

/** Changes one pane's own state. */
export const setPaneState = (id: PaneInstanceId, patch: PaneLocalState): void =>
  workspaceStore.setPaneState(id, patch)

/** Opens an overlay, and closes whatever was open. */
export const openOverlay = (action: string, paneId?: PaneInstanceId): void =>
  workspaceStore.openOverlay(action, paneId)

/** Closes the overlay. */
export const closeOverlay = (): void => workspaceStore.closeOverlay()
