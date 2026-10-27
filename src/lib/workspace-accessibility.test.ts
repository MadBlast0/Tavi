/**
 * The workspace tabs and splitters, read from their source.
 *
 * The store transitions behind these controls — dock activation, focusing a
 * hidden tab, closing to a visible survivor — are exercised as behaviour in
 * `workspace-state.test.ts`. What is left here is the ARIA and keyboard
 * contract, which is documented in `docs/plan/workspace-uiux-audit.md`
 * (WS-15, WS-16, WS-17) and cannot be driven without a DOM. Each check names
 * the invariant it guards; a claim that is only a rendering detail belongs in
 * a render test, not here.
 */

import { test } from "node:test"
import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { join } from "node:path"

const source = readFileSync(join(import.meta.dirname, "..", "blocks", "workspace", "layout", "layout-tree.tsx"), "utf8")
const paneSource = readFileSync(join(import.meta.dirname, "..", "blocks", "workspace", "pane.tsx"), "utf8")

test("workspace tabs name and control their tab panel", () => {
  assert.ok(source.includes("aria-label={`Views for ${activeTitle}`}"))
  assert.ok(source.includes("aria-controls={panelId}"))
  assert.ok(source.includes("labelledBy: maximizedPaneId ? undefined : workspaceTabId(active)"))
  assert.ok(source.includes("aria-selected={active}"))
  // The panel role lives on the pane's content, below the tabs, rather than
  // on a wrapper that would contain the tab list it is controlled by.
  assert.ok(paneSource.includes('role={tabStrip ? "tabpanel" : undefined}'))
  assert.ok(paneSource.includes("aria-labelledby={tabStrip?.labelledBy}"))
})

test("workspace tabs support roving focus and standard keyboard navigation", () => {
  assert.ok(source.includes("tabIndex={active ? 0 : -1}"))
  assert.ok(source.includes('"ArrowLeft", "ArrowRight", "Home", "End"'))
  assert.ok(source.includes("event.key === \"ArrowRight\" ? (index + (rtl ? tabs.length - 1 : 1)) % tabs.length"))
  assert.ok(source.includes("setActiveTab(node.tabs[next])"), "keyboard navigation should activate the focused tab")
})

test("the active pane and its tab close controls are exposed to assistive technology", () => {
  assert.ok(paneSource.includes('role="region"'), "a pane should be a named region")
  assert.ok(paneSource.includes('aria-label={`${title} pane`}'), "the region should be named by the pane's title")
  assert.ok(paneSource.includes('aria-current={active ? "true" : undefined}'), "the focused pane should say it is current")
  assert.ok(source.includes("tabIndex={isActive ? 0 : -1}"), "a tab's close control should only join the tab order when its tab is active")
})

test("workspace tabs can be closed from the keyboard and the workspace restores focus", () => {
  assert.ok(source.includes('if (event.key === "Delete")'))
  assert.ok(source.includes("closePane(paneId)"), "closing a tab should use the workspace's close handler")
  const workspace = readFileSync(join(import.meta.dirname, "..", "blocks", "workspace", "workspace-layout.tsx"), "utf8")
  assert.ok(workspace.includes("document.getElementById(`workspace-tab-${nextPaneId}`)"))
  assert.ok(workspace.includes("(paneTitle ?? paneTab)?.focus()"))
  assert.ok(workspace.includes("if (snapshot.panes.length === 0)"), "the workspace region is the fallback only when no panes remain")
  const pane = readFileSync(join(import.meta.dirname, "..", "blocks", "workspace", "pane.tsx"), "utf8")
  assert.ok(pane.includes("id={id ? `workspace-pane-title-${id}` : undefined}"))
  assert.ok(pane.includes("tabIndex={id ? -1 : undefined}"))
})

test("splitters are named for the primary pane and expose bounded values", () => {
  assert.ok(source.includes('role="separator"'))
  assert.ok(source.includes("primaryPaneTitle={primaryPaneTitle}"))
  assert.ok(source.includes("aria-label={`Resize ${primaryPaneTitle}`}"))
  assert.ok(source.includes("const currentPercent = Math.min(maximumPercent, Math.max(minimumPercent, Math.round(ratio * 100)))"))
})

test("splitters can be resized to either allowed limit by keyboard", () => {
  assert.ok(source.includes('event.key === "Home" || event.key === "End"'))
  assert.ok(source.includes('event.key === "Home" ? minimum : 1 - minimum'))
  assert.ok(source.includes('"ArrowLeft" : "ArrowUp"'))
})

test("closing a pane returns focus to the surviving pane or workspace region", () => {
  const workspace = readFileSync(join(import.meta.dirname, "..", "blocks", "workspace", "workspace-layout.tsx"), "utf8")
  assert.ok(workspace.includes("const handleClosePane = React.useCallback((id: string) =>"))
  assert.ok(workspace.includes("removePane(id)"))
  assert.ok(workspace.includes("document.getElementById(`workspace-pane-title-${nextPaneId}`)"))
  assert.ok(workspace.includes("document.querySelector<HTMLElement>(\'[data-slot=\"workspace-layout\"]\')"))
  assert.ok(workspace.includes("document.getElementById(`workspace-tab-${nextPaneId}`)"), "a grouped pane's tab should be a focus fallback")
  assert.ok(workspace.includes("(paneTitle ?? paneTab)?.focus()"))
  assert.ok(workspace.includes("if (snapshot.panes.length === 0)"), "the workspace region is the fallback only when no panes remain")
  assert.ok(workspace.includes('data-slot="workspace-layout"') && workspace.includes('aria-label="Workspace" tabIndex={-1}'))
})
