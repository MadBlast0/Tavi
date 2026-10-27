/**
 * The Diff Viewer at a narrow pane width, drawn.
 *
 * A pane is not the window. The Diff Viewer has to fold its file list into a
 * select and drop split view when the *pane* is narrow; a viewport breakpoint
 * looks right at one window size and is wrong at every other split. The
 * difference between the two is one class prefix (`md:` versus
 * `@min-[34rem]/pane:`), which no source-string check can tell apart from a
 * working layout — so this draws the pane and reads the tree it produced.
 *
 * It is the one render test WS-18 asks for. Vite is already a dependency and
 * already knows how to read a `.tsx` file, so it is used as the loader the
 * same way `key-parity.test.ts` uses it; no new runner and no DOM library.
 */

import { after, before, test } from "node:test"
import assert from "node:assert/strict"
import { join } from "node:path"
import React from "react"
import { renderToStaticMarkup } from "react-dom/server"
import { createServer, type ViteDevServer } from "vite"

type DiffPane = (props: Record<string, unknown>) => React.ReactElement

let DiffViewerPane: DiffPane
let vite: ViteDevServer
let markup: string

before(async () => {
  vite = await createServer({
    configFile: false,
    root: join(import.meta.dirname, "..", ".."),
    appType: "custom",
    logLevel: "silent",
    server: { middlewareMode: true },
    resolve: { alias: { "@": join(import.meta.dirname, "..") } },
  })
  const module = (await vite.ssrLoadModule(
    "/src/blocks/workspace/panes/diff-viewer-pane.tsx",
  )) as { DiffViewerPane: DiffPane }
  DiffViewerPane = module.DiffViewerPane

  /* Split view is the branch with two width-dependent layouts to choose
     between; the pane's default is unified. */
  const store = (await vite.ssrLoadModule("/src/lib/workspace-state.ts")) as {
    workspaceStore: {
      addPane: (type: string) => { id: string } | null
      setPaneState: (id: string, patch: Record<string, unknown>) => void
    }
  }
  const pane = store.workspaceStore.addPane("diff")
  assert.ok(pane)
  store.workspaceStore.setPaneState(pane.id, { view: "split" })
  markup = renderToStaticMarkup(
    React.createElement(DiffViewerPane, { paneId: pane.id, active: true }),
  )
})

after(async () => {
  await vite?.close()
})

/** The opening tag that holds `marker`. */
function tagAround(html: string, marker: string): string {
  const at = html.indexOf(marker)
  assert.notEqual(at, -1, `the pane should draw ${marker}`)
  const start = html.lastIndexOf("<", at)
  const end = html.indexOf(">", at)
  return html.slice(start, end + 1)
}

test("the pane, not the window, is the container the layout measures", () => {
  const pane = tagAround(markup, 'data-slot="pane"')
  assert.ok(
    pane.includes("@container/pane"),
    "the diff layout should resolve its breakpoints against the pane",
  )
})

test("a narrow pane gets a file selector that lists the real files", () => {
  const selector = tagAround(markup, 'aria-label="Select changed file"')
  assert.ok(selector.startsWith("<select"), "the narrow file list should be a select")

  const options = [...markup.matchAll(/<option value="([^"]*)"[^>]*>([^<]*)<\/option>/g)]
    .filter((match) => match[1]?.startsWith("src/"))
  assert.ok(
    options.length >= 1,
    "the narrow selector should list the changed files, not an empty control",
  )
  for (const [, value, label] of options) {
    assert.ok(label?.includes("+"), `${value} should carry its line counts`)
  }

  assert.ok(
    markup.includes("@min-[34rem]/pane:hidden"),
    "the narrow selector should be hidden once the pane is wide enough",
  )
  assert.ok(
    markup.includes("@min-[34rem]/pane:block"),
    "the wide file list should only appear when the pane can hold it",
  )
  assert.ok(
    markup.includes('aria-label="Changed files"'),
    "the wide layout should still be in the tree for a wide pane",
  )
})

test("split view is chosen by the pane's width, not the viewport's", () => {
  /* Both branches are drawn; the container query picks one. A viewport
     prefix (`md:`) is the regression this test exists to catch. */
  assert.ok(
    markup.includes("hidden @min-[30rem]/pane:block"),
    "split view should appear only when the pane is wide enough for two sides",
  )
  assert.ok(
    markup.includes("@min-[30rem]/pane:hidden"),
    "unified diff should be the fallback under the same pane threshold",
  )
  assert.equal(
    /(?:^|[\s"])(?:sm|md|lg|xl|2xl):/.test(markup),
    false,
    "the diff layout must not size itself against the viewport",
  )
})
