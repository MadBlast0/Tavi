"use client"

import * as React from "react"
import { CheckIcon, ChevronDownIcon, ChevronUpIcon, Columns2Icon, DiffIcon, FileCode2Icon, FileMinus2Icon, FilePlus2Icon, Rows2Icon, SearchIcon } from "lucide-react"

import { Badge } from "@/components/badge"
import { Button } from "@/components/button"
import { Input } from "@/components/input"
import { TooltipIconButton } from "@/components/tooltip-icon-button"
import { setPaneState, usePaneState, type DockEdge } from "@/lib/workspace-state"
import type { WorkspaceNativeDragPayload } from "@/lib/desktop"
import { PaneEmpty, PaneError, PaneLoading, PaneUnavailable } from "../pane-states"
import { Pane } from "../pane"

type SampleFile = { path: string; status: "added" | "modified" | "deleted"; additions: number; deletions: number }
type DiffLine = { kind: "context" | "added" | "removed"; oldLine: number | null; newLine: number | null; text: string; hunk?: number }

/**
 * The state switcher is QA scaffolding, not product chrome.
 *
 * It stays available in a dev build at `?sample-states=1` so the shared states
 * can still be exercised, and is absent everywhere else.
 */
const SAMPLE_STATE_HARNESS =
  typeof window !== "undefined" &&
  import.meta.env.DEV &&
  new URLSearchParams(window.location.search).get("sample-states") === "1"

const SAMPLE_FILES: readonly SampleFile[] = [
  { path: "src/App.tsx", status: "modified", additions: 4, deletions: 2 },
  { path: "src/components/Workspace.tsx", status: "added", additions: 8, deletions: 0 },
  { path: "src/lib/layout.ts", status: "deleted", additions: 0, deletions: 3 },
]
const SAMPLE_LINES: readonly DiffLine[] = [
  { kind: "context", oldLine: 10, newLine: 10, text: "export function App() {" },
  { kind: "removed", oldLine: 11, newLine: null, text: "  return <main>Loading</main>", hunk: 0 },
  { kind: "added", oldLine: null, newLine: 11, text: "  return <WorkspaceHost>", hunk: 0 },
  { kind: "added", oldLine: null, newLine: 12, text: "    <WorkspaceLayout />", hunk: 0 },
  { kind: "context", oldLine: 12, newLine: 13, text: "  </main>" },
  { kind: "context", oldLine: 20, newLine: 21, text: "  const open = (id: string) => {" },
  { kind: "removed", oldLine: 21, newLine: null, text: "    loadThread(id)", hunk: 1 },
  { kind: "added", oldLine: null, newLine: 22, text: "    openThread(side, id)", hunk: 1 },
  { kind: "added", oldLine: null, newLine: 23, text: "    showSessionPane(id)", hunk: 1 },
  { kind: "context", oldLine: 22, newLine: 24, text: "  }" },
]

function usePaneValue<T>(paneId: string, key: string, initial: T): [T, React.Dispatch<React.SetStateAction<T>>] {
  const state = usePaneState(paneId)
  const value = Object.prototype.hasOwnProperty.call(state, key) ? state[key] as T : initial
  const current = React.useRef(value)
  current.current = value
  const setValue = React.useCallback<React.Dispatch<React.SetStateAction<T>>>((update) => {
    const next = typeof update === "function" ? (update as (previous: T) => T)(current.current) : update
    current.current = next
    setPaneState(paneId, { [key]: next })
  }, [paneId, key])
  return [value, setValue]
}

function FileMark({ status }: { status: SampleFile["status"] }) {
  const Icon = status === "added" ? FilePlus2Icon : status === "deleted" ? FileMinus2Icon : FileCode2Icon
  return <Icon className="size-3.5 shrink-0 text-muted-foreground" aria-hidden="true" />
}

function DiffLineRow({ line }: { line: DiffLine }) {
  const sign = line.kind === "added" ? "+" : line.kind === "removed" ? "−" : " "
  const style = line.kind === "added"
    ? "bg-success/10 text-success-foreground"
    : line.kind === "removed"
      ? "bg-destructive/10 text-destructive-foreground"
      : "text-foreground"
  return (
    <div className={`grid min-w-max grid-cols-[2rem_2rem_1.25rem_minmax(0,1fr)] @min-[34rem]/pane:grid-cols-[3rem_3rem_1.25rem_minmax(12rem,1fr)] ${style}`}>
      <span className="select-none border-r border-border/50 px-1 text-right text-muted-foreground">{line.oldLine ?? ""}</span>
      <span className="select-none border-r border-border/50 px-1 text-right text-muted-foreground">{line.newLine ?? ""}</span>
      <span className="select-none text-center">{sign}</span>
      <code className="whitespace-pre px-2">{line.text}</code>
    </div>
  )
}

/** Unified diff lines; the pane's own scroll region owns long-line overflow. */
function UnifiedDiff({ lines }: { lines: readonly DiffLine[] }) {
  return <div className="min-w-max font-mono text-[11px] leading-5">{lines.map((line, index) => <div key={`${line.kind}-${index}`} data-hunk={line.hunk}><DiffLineRow line={line} /></div>)}</div>
}

/** Split diff lines, shown only when the pane can offer each side a readable width. */
function SplitDiff({ lines }: { lines: readonly DiffLine[] }) {
  return <div className="grid min-h-full min-w-[40rem] grid-cols-2 divide-x divide-border font-mono text-[11px] leading-5"><div className="overflow-auto">{lines.filter((line) => line.kind !== "added").map((line, index) => <DiffLineRow key={`old-${index}`} line={line} />)}</div><div className="overflow-auto">{lines.filter((line) => line.kind !== "removed").map((line, index) => <DiffLineRow key={`new-${index}`} line={line} />)}</div></div>
}

/** A clearly labeled local diff preview; it never reads Git or the filesystem. */
export function DiffViewerPane({ paneId, active, onClose, onDockBack, onSplit, onFocus, onMaximize, maximized, onPopOut, popOutAvailable, getDragPayload }: { paneId: string; active?: boolean; onClose?: () => void; onDockBack?: () => void; onSplit?: (edge: DockEdge) => void; onFocus?: () => void; onMaximize?: () => void; maximized?: boolean; onPopOut?: () => void; popOutAvailable?: boolean; getDragPayload?: () => WorkspaceNativeDragPayload }) {
  const [selectedPath, setSelectedPath] = usePaneValue<string | null>(paneId, "selectedPath", SAMPLE_FILES[0]?.path ?? null)
  const [search, setSearch] = usePaneValue(paneId, "search", "")
  const [filter, setFilter] = usePaneValue<"all" | SampleFile["status"]>(paneId, "filter", "all")
  const [view, setView] = usePaneValue<"unified" | "split">(paneId, "view", "unified")
  const [hunk, setHunk] = usePaneValue(paneId, "hunk", 0)
  const [reviewed, setReviewed] = usePaneValue<Set<string>>(paneId, "reviewed", new Set())
  const [sampleState, setSampleState] = usePaneValue<"content" | "no-changes" | "loading" | "error" | "unavailable" | "long">(paneId, "sampleState", "content")
  const previewState = SAMPLE_STATE_HARNESS ? sampleState : "content"
  const diffScroll = React.useRef<HTMLDivElement | null>(null)
  const files = (previewState === "no-changes" ? [] : SAMPLE_FILES).filter((file) => (filter === "all" || file.status === filter) && file.path.toLowerCase().includes(search.toLowerCase()))
  const selected = previewState === "no-changes" ? null : SAMPLE_FILES.find((file) => file.path === selectedPath) ?? null
  const selectedReviewed = selected ? reviewed.has(selected.path) : false
  const toggleReviewed = () => {
    if (!selected) return
    setReviewed((current) => { const next = new Set(current); next.has(selected.path) ? next.delete(selected.path) : next.add(selected.path); return next })
  }
  const totalAdditions = previewState === "no-changes" ? 0 : SAMPLE_FILES.reduce((total, file) => total + file.additions, 0)
  const totalDeletions = previewState === "no-changes" ? 0 : SAMPLE_FILES.reduce((total, file) => total + file.deletions, 0)
  const lines = previewState === "long" ? Array.from({ length: 120 }, (_, index) => SAMPLE_LINES[index % SAMPLE_LINES.length]!) : SAMPLE_LINES

  return (
    <Pane id={paneId} type="diff" title="Diff Viewer" icon={DiffIcon} active={active} onClose={onClose} onDockBack={onDockBack} onSplit={onSplit} onFocus={onFocus} onMaximize={onMaximize} maximized={maximized} onPopOut={onPopOut} popOutAvailable={popOutAvailable} getDragPayload={getDragPayload}>
      <div className="flex min-h-0 flex-1 flex-col">
        {SAMPLE_STATE_HARNESS ? <div className="flex shrink-0 flex-wrap items-center gap-2 border-b border-border px-2 py-1 text-[11px] text-muted-foreground"><p>Sample preview · illustrative changes only; not read from Git.</p><label className="ms-auto flex items-center gap-1">Sample state<select aria-label="Diff sample state" value={sampleState} onChange={(event) => setSampleState(event.target.value as typeof sampleState)} className="h-6 rounded border border-border bg-background px-1 text-foreground">{(["content", "no-changes", "loading", "error", "unavailable", "long"] as const).map((state) => <option key={state} value={state}>{state}</option>)}</select></label></div> : null}
        <div className="flex shrink-0 flex-wrap items-center gap-2 border-b border-border px-3 py-2">
          <div className="flex min-w-0 flex-1 items-center gap-2">
            <span className="shrink-0 text-sm font-medium">Changes</span>
            <Badge variant="default" appearance="muted" className="@max-[22rem]/pane:hidden" title="Illustrative changes only; not read from Git.">Sample</Badge>
            <span className="shrink-0 text-xs text-success-foreground @max-[20rem]/pane:hidden">+{totalAdditions}</span>
            <span className="shrink-0 text-xs text-destructive-foreground @max-[20rem]/pane:hidden">−{totalDeletions}</span>
            <span className="truncate text-xs text-muted-foreground @max-[22rem]/pane:hidden">{files.length} files</span>
          </div>
          <div className="ms-auto flex shrink-0 items-center gap-1">
            <TooltipIconButton tooltip="Previous change" size="icon-xs" disabled={hunk === 0} onClick={() => { const next = Math.max(0, hunk - 1); setHunk(next); diffScroll.current?.querySelector(`[data-hunk="${next}"]`)?.scrollIntoView({ block: "center" }) }}><ChevronUpIcon /></TooltipIconButton>
            <span className="min-w-10 text-center text-[11px] text-muted-foreground @max-[30rem]/pane:hidden">{hunk + 1} / 2</span>
            <TooltipIconButton tooltip="Next change" size="icon-xs" disabled={hunk >= 1} onClick={() => { const next = Math.min(1, hunk + 1); setHunk(next); diffScroll.current?.querySelector(`[data-hunk="${next}"]`)?.scrollIntoView({ block: "center" }) }}><ChevronDownIcon /></TooltipIconButton>
            <TooltipIconButton tooltip={view === "unified" ? "Switch to split view" : "Switch to unified view"} size="icon-xs" className="@max-[30rem]/pane:hidden" aria-pressed={view === "split"} onClick={() => setView((current) => current === "unified" ? "split" : "unified")}>{view === "unified" ? <Columns2Icon /> : <Rows2Icon />}</TooltipIconButton>
          </div>
        </div>
        {previewState === "loading" ? <PaneLoading className="flex-1" /> : previewState === "error" ? <PaneError title="Sample diff failed to load" description="This error is illustrative; no Git or filesystem request was made." onRetry={() => setSampleState("content")} /> : previewState === "unavailable" ? <PaneUnavailable title="No repository is connected" description="This pane only shows local sample changes." /> : previewState === "no-changes" ? <PaneEmpty icon={DiffIcon} title="No sample changes" description="Choose another sample state to see the example diff." /> : <div className="flex min-h-0 flex-1 flex-col @min-[34rem]/pane:flex-row">
          <aside className="flex min-h-0 shrink-0 flex-col border-b border-border @min-[34rem]/pane:w-56 @min-[34rem]/pane:border-b-0 @min-[34rem]/pane:border-r" aria-label="Changed files">
            <div className="hidden shrink-0 gap-1 p-2 @min-[34rem]/pane:flex">
              <div className="relative min-w-0 flex-1"><SearchIcon className="absolute start-2 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" aria-hidden="true" /><Input aria-label="Search changed files" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Filter files" className="h-7 ps-7 text-xs" /></div>
              <select aria-label="Filter file status" value={filter} onChange={(event) => setFilter(event.target.value as typeof filter)} className="h-7 max-w-24 rounded border border-input bg-background px-1 text-xs"><option value="all">All</option><option value="added">Added</option><option value="modified">Modified</option><option value="deleted">Deleted</option></select>
            </div>
            <div className="flex items-center gap-2 px-2 py-1.5 @min-[34rem]/pane:hidden">
              {selected ? <FileMark status={selected.status} /> : null}
              <select aria-label="Select changed file" value={selectedPath ?? ""} onChange={(event) => setSelectedPath(event.target.value || null)} title={selected?.path} className="h-7 min-w-0 flex-1 rounded border border-input bg-background px-1 text-xs">
                {files.length === 0 ? <option value="">No sample files match</option> : <>{selectedPath === null ? <option value="">Select a file</option> : null}{files.map((file) => <option key={file.path} value={file.path}>{file.path} (+{file.additions} −{file.deletions})</option>)}</>}
              </select>
            </div>
            <div className="hidden min-h-0 flex-1 overflow-auto p-1 @min-[34rem]/pane:block">
              {files.map((file) => <button key={file.path} type="button" title={file.path} aria-current={selectedPath === file.path ? "true" : undefined} onClick={() => setSelectedPath((current) => current === file.path ? null : file.path)} className="flex w-full min-w-0 items-center gap-2 rounded px-2 py-2 text-left text-xs hover:bg-accent focus-visible:outline-2 focus-visible:outline-foreground/60 aria-current:bg-accent" data-selected={selectedPath === file.path ? "" : undefined}><FileMark status={file.status} /><span className="min-w-0 flex-1 truncate">{file.path}</span><span className="shrink-0 text-success-foreground">+{file.additions}</span><span className="shrink-0 text-destructive-foreground">−{file.deletions}</span></button>)}
              {files.length === 0 ? <p className="p-3 text-xs text-muted-foreground">No sample files match.</p> : null}
            </div>
          </aside>
          <section className="flex min-h-0 min-w-0 flex-1 flex-col" aria-label="Selected file diff">
            {selected ? <>
              <div className="flex shrink-0 items-start gap-2 border-b border-border px-3 py-2">
                <span className="mt-0.5 shrink-0"><FileMark status={selected.status} /></span>
                <p className="min-w-0 flex-1 text-xs font-medium leading-5 [overflow-wrap:anywhere]">{selected.path}</p>
                <Badge variant={selectedReviewed ? "success" : "default"} appearance="muted" className="shrink-0 @max-[36rem]/pane:hidden">{selectedReviewed ? "Reviewed" : selected.status}</Badge>
                <TooltipIconButton tooltip={selectedReviewed ? "Unmark reviewed" : "Mark reviewed"} size="icon-xs" variant="outline" className="@min-[52rem]/pane:hidden" aria-pressed={selectedReviewed} onClick={toggleReviewed}><CheckIcon /></TooltipIconButton>
                <Button size="xs" variant="outline" className="@max-[52rem]/pane:hidden" onClick={toggleReviewed}>{selectedReviewed ? "Unmark" : "Mark reviewed"}</Button>
              </div>
              <div ref={diffScroll} className="min-h-0 flex-1 overflow-auto py-2" data-diff-view={view}>
                {view === "unified" ? <UnifiedDiff lines={lines} /> : <><div className="@min-[30rem]/pane:hidden"><UnifiedDiff lines={lines} /></div><div className="hidden @min-[30rem]/pane:block"><SplitDiff lines={lines} /></div></>}
              </div>
            </> : <div className="flex flex-1 flex-col items-center justify-center gap-2 text-center text-sm text-muted-foreground"><DiffIcon className="size-6" /><p>Select a file to view the sample diff.</p></div>}
          </section>
        </div>}
      </div>
    </Pane>
  )
}
