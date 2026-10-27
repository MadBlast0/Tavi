"use client"

import * as React from "react"
import { CheckIcon, ChevronDownIcon, ChevronRightIcon, CircleAlertIcon, CopyIcon, FileIcon, RotateCwIcon, TrashIcon } from "lucide-react"

import { Badge } from "@/components/badge"
import { Button } from "@/components/button"
import { Input } from "@/components/input"
import { Textarea } from "@/components/textarea"
import { cn } from "@/lib/utils"
import { setPaneState, usePaneState, type PaneInstance } from "@/lib/workspace-state"
import { PANE_TYPES } from "../pane-types"
import { Pane } from "../pane"
import type { PaneActions } from "../pane-registry"
import { PaneEmpty, PaneError, PaneLoading, PaneUnavailable } from "../pane-states"

const SAMPLE_FILES = ["README.md", "package.json", "src", "src/App.tsx", "src/index.css", "src/lib", "src/lib/workspace-state.ts"]
const SAMPLE_LOGS = [
  { time: "10:42:18", level: "info", source: "workspace", message: "Layout restored from this window's saved state." },
  { time: "10:42:19", level: "info", source: "pane", message: "A sample view was opened. No project service was contacted." },
  { time: "10:42:21", level: "warn", source: "preview", message: "No live application preview is connected." },
  { time: "10:42:22", level: "error", source: "sample", message: "This is an example log row, not an application error." },
]
const INITIAL_EDITOR_VALUE = "// Editable sample\nexport function App() {\n  return <main>Hello from the preview</main>\n}\n"
type SampleState = "content" | "empty" | "loading" | "error" | "unavailable" | "long"

/**
 * The state switcher is QA scaffolding, not product chrome.
 *
 * It stays available in a dev build at `?sample-states=1` so the shared states
 * can still be exercised, and is absent everywhere else. The pane's own
 * content already says it is a sample.
 */
const SAMPLE_STATE_HARNESS =
  typeof window !== "undefined" &&
  import.meta.env.DEV &&
  new URLSearchParams(window.location.search).get("sample-states") === "1"

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

/** Local-only previews for views without a live service behind them. */
export function SamplePane({ pane, actions }: { pane: PaneInstance; actions: PaneActions }) {
  const type = PANE_TYPES.find((item) => item.id === pane.type)
  if (!type) return null
  const [search, setSearch] = usePaneValue(pane.id, "search", "")
  const [selected, setSelected] = usePaneValue<string | null>(pane.id, "selected", null)
  const [expanded, setExpanded] = usePaneValue(pane.id, "expanded", new Set(["src", "src/lib"]))
  const [checked, setChecked] = usePaneValue(pane.id, "checked", new Set([0]))
  const [expandedSections, setExpandedSections] = usePaneValue(pane.id, "expandedSections", new Set(["Workspace", "Review"]))
  const [expandedActivity, setExpandedActivity] = usePaneValue<number | null>(pane.id, "expandedActivity", null)
  const [filter, setFilter] = usePaneValue(pane.id, "filter", "all")
  const [value, setValue] = usePaneValue(pane.id, "editorValue", INITIAL_EDITOR_VALUE)
  const [messages, setMessages] = usePaneValue(pane.id, "terminalOutput", ["Preview only · commands are never executed.", "No shell is connected."])
  const [input, setInput] = usePaneValue(pane.id, "terminalInput", "")
  const [route, setRoute] = usePaneValue(pane.id, "sampleRoute", "tavi://welcome")
  const [history, setHistory] = usePaneValue(pane.id, "sampleHistory", ["tavi://welcome"])
  const [historyIndex, setHistoryIndex] = usePaneValue(pane.id, "sampleHistoryIndex", 0)
  const [notice, setNotice] = usePaneValue(pane.id, "notice", "")
  const [logs, setLogs] = usePaneValue(pane.id, "sampleLogs", SAMPLE_LOGS)
  const [showSamplePreview, setShowSamplePreview] = usePaneValue(pane.id, "showSamplePreview", false)
  const [fileKind, setFileKind] = usePaneValue(pane.id, "fileKind", "Markdown")
  const [sampleState, setSampleState] = usePaneValue<SampleState>(pane.id, "sampleState", "content")
  const previewState: SampleState = SAMPLE_STATE_HARNESS ? sampleState : "content"
  const title = pane.title ?? type.label

  const previewHeader = SAMPLE_STATE_HARNESS ? <div className="flex shrink-0 items-center gap-2 border-b border-border px-2 py-1 text-[11px] text-muted-foreground"><span className="min-w-0 flex-1 truncate">Sample preview · local UI state only; no external service or project files are connected.</span><label className="flex shrink-0 items-center gap-1">State<select aria-label="Sample preview state" value={sampleState} onChange={(event) => setSampleState(event.target.value as SampleState)} className="h-6 rounded border border-border bg-background px-1 text-[11px] text-foreground">{(["content", "empty", "loading", "error", "unavailable", "long"] as SampleState[]).map((state) => <option key={state} value={state}>{state === "content" ? "Sample" : state[0].toUpperCase() + state.slice(1)}</option>)}</select></label></div> : null
  const panel = (children: React.ReactNode) => <div className="flex min-h-0 flex-1 flex-col overflow-hidden">{previewHeader}{children}</div>
  const textRows = (rows: string[]) => <div className="min-h-0 flex-1 overflow-auto p-3 font-mono text-xs leading-6">{rows.map((row, i) => <p key={`${i}-${row}`} className="whitespace-pre-wrap break-words">{row}</p>)}</div>

  let content: React.ReactNode
  if (previewState === "empty") {
    content = panel(<PaneEmpty icon={CircleAlertIcon} title={`No ${type.label.toLowerCase()} sample`} description="Choose the sample state to return to the local preview." />)
  } else if (previewState === "loading") {
    content = panel(<PaneLoading />)
  } else if (previewState === "error") {
    content = panel(<PaneError title={`${type.label} preview unavailable`} description="This is a simulated error state; no service request was made." onRetry={() => setSampleState("content")} />)
  } else if (previewState === "unavailable") {
    content = panel(<PaneUnavailable title={`${type.label} is not connected`} description="The real integration is not available in this UI phase. The sample state remains local." />)
  } else if (previewState === "long") {
    content = panel(<div className="min-h-0 flex-1 overflow-auto p-3 font-mono text-xs leading-6">{Array.from({ length: 120 }, (_, index) => <p key={index} className="whitespace-pre-wrap break-words">{String(index + 1).padStart(3, "0")} · Long-content sample for {type.label}; this text is local demonstration data.</p>)}</div>)
  } else switch (pane.type) {
    case "browser": {
      const go = () => {
        if (!["tavi://welcome", "tavi://docs", "tavi://preview"].includes(route)) {
          setNotice("Only the three built-in sample pages can be opened.")
          return
        }
        setNotice("")
        setHistory((items) => [...items.slice(0, historyIndex + 1), route])
        setHistoryIndex((index) => index + 1)
      }
      content = panel(<>
        <div className="flex shrink-0 flex-wrap items-center gap-1 border-b border-border p-2">
          <Button size="icon-xs" variant="ghost" aria-label="Back" disabled={historyIndex === 0} onClick={() => { const i = Math.max(0, historyIndex - 1); setHistoryIndex(i); setRoute(history[i]) }}><ChevronRightIcon className="rotate-180" /></Button>
          <Button size="icon-xs" variant="ghost" aria-label="Forward" disabled={historyIndex >= history.length - 1} onClick={() => { const i = Math.min(history.length - 1, historyIndex + 1); setHistoryIndex(i); setRoute(history[i]) }}><ChevronRightIcon /></Button>
          <Button size="icon-xs" variant="ghost" aria-label="Reload sample page" onClick={() => setNotice("Sample page refreshed.")}><RotateCwIcon /></Button>
          <form className="flex min-w-0 flex-1 gap-1" onSubmit={(event) => { event.preventDefault(); go() }}><Input value={route} onChange={(event) => setRoute(event.target.value)} aria-label="Sample address" className="h-7 min-w-0 text-xs" /><Button size="sm" className="h-7">Go</Button></form>
        </div>
        {notice ? <p role="status" className="px-3 pt-2 text-xs text-muted-foreground">{notice}</p> : null}
        <div className="m-3 min-h-0 flex-1 overflow-auto rounded-md border border-border bg-muted/20 p-5">
          <p className="mb-2 text-xs uppercase tracking-wide text-muted-foreground">Built-in preview</p>
          <h2 className="text-lg font-medium">{route === "tavi://docs" ? "Workspace guide" : route === "tavi://preview" ? "Preview example" : "Welcome to the browser preview"}</h2>
          <p className="mt-2 max-w-prose text-sm text-muted-foreground">This contained page is local sample content. Arbitrary addresses are not loaded and no network request is made.</p>
        </div>
      </>)
      break
    }
    case "app-preview":
      content = panel(<div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-3 overflow-auto p-4 text-center">
        {showSamplePreview ? <div className="w-full max-w-xl overflow-hidden rounded-md border border-border bg-background text-left"><div className="border-b border-border px-3 py-2 text-xs text-muted-foreground">Sample application · not running</div><div className="p-6"><h2 className="text-lg font-medium">A small preview surface</h2><p className="mt-2 text-sm text-muted-foreground">This is local illustrative content, not a live application.</p><Button className="mt-4" size="sm" onClick={() => setNotice("Sample preview button clicked.")}>Example action</Button>{notice ? <p role="status" className="mt-2 text-xs text-muted-foreground">{notice}</p> : null}</div></div> : <><FileIcon className="size-8 text-muted-foreground" /><h2 className="text-sm font-medium">No application is running</h2><p className="max-w-sm text-xs text-muted-foreground">Tavi has no preview server connected. This pane does not start one.</p><Button size="sm" variant="outline" onClick={() => setShowSamplePreview(true)}>Show sample preview</Button></>}
      </div>)
      break
    case "terminal":
      content = panel(<>
        <div className="flex min-h-0 flex-1 flex-col overflow-hidden bg-background p-3 font-mono text-xs">
          <p className="mb-2 text-muted-foreground">sample-project / preview shell</p>
          <div className="min-h-0 flex-1 overflow-auto" aria-live="polite">{messages.map((line, i) => <p key={`${i}-${line}`} className="whitespace-pre-wrap break-all">{line}</p>)}</div>
          <form className="mt-2 flex gap-2 border-t border-border pt-2" onSubmit={(event) => { event.preventDefault(); if (input.trim()) setMessages((current) => [...current, `$ ${input.trim()}`, "Input recorded locally. No command was executed."]); setInput("") }}><span aria-hidden="true">$</span><Input aria-label="Sample command input" value={input} onChange={(event) => setInput(event.target.value)} className="h-7 border-0 p-0 font-mono text-xs shadow-none focus-visible:ring-0" placeholder="Type to preview the UI (not executed)" /><Button variant="ghost" size="icon-xs" type="button" aria-label="Clear sample output" onClick={() => setMessages([])}><TrashIcon /></Button><Button variant="ghost" size="icon-xs" type="button" aria-label="Copy sample output" onClick={() => { void navigator.clipboard.writeText(messages.join("\n")).then(() => setNotice("Sample output copied.")).catch(() => setNotice("Clipboard access was denied.")) }}><CopyIcon /></Button></form>
          {notice ? <p role="status" className="pt-1 text-muted-foreground">{notice}</p> : null}
        </div>
      </>)
      break
    case "file-explorer": {
      const visible = SAMPLE_FILES.filter((path) => path.toLowerCase().includes(search.toLowerCase()))
      const toggle = (path: string) => setExpanded((current) => { const next = new Set(current); next.has(path) ? next.delete(path) : next.add(path); return next })
      content = panel(<>
        <div className="shrink-0 p-2"><Input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Filter sample files" aria-label="Filter sample files" className="h-7 text-xs" /></div>
        <div className="min-h-0 flex-1 overflow-auto px-2 pb-2" role="tree" aria-label="Sample files">{visible.map((path) => {
          const depth = path.split("/").length - 1
          const folder = path === "src" || path === "src/lib"
          const shown = depth === 0 || path.startsWith("src/") && expanded.has("src") && (depth === 1 || expanded.has("src/lib"))
          if (!shown) return null
          return <button key={path} type="button" role="treeitem" aria-selected={selected === path} aria-expanded={folder ? expanded.has(path) : undefined} onClick={() => folder ? toggle(path) : setSelected(path)} className="flex h-7 w-full items-center gap-1 rounded px-1 text-left text-xs hover:bg-accent focus-visible:outline-2 focus-visible:outline-foreground/60" style={{ paddingLeft: `${8 + depth * 14}px` }}>{folder ? expanded.has(path) ? <ChevronDownIcon className="size-3" /> : <ChevronRightIcon className="size-3" /> : <FileIcon className="size-3" />}<span className="truncate">{path.split("/").at(-1)}</span></button>
        })}{visible.length === 0 ? <p className="p-3 text-xs text-muted-foreground">No sample files match.</p> : null}</div>
        {selected ? <p className="shrink-0 border-t border-border p-2 text-xs text-muted-foreground">Selected sample: {selected}</p> : null}
      </>)
      break
    }
    case "file-editor":
      content = panel(<>
        <div className="flex shrink-0 items-center justify-between border-b border-border px-3 py-2 text-xs"><span>src/App.tsx · editable sample</span><Badge variant="default" appearance="outline">{value === INITIAL_EDITOR_VALUE ? "Sample" : "Local edits"}</Badge></div>
        <div className="flex min-h-0 flex-1 overflow-hidden"><pre aria-hidden="true" className="select-none overflow-hidden border-r border-border px-2 py-3 text-right font-mono text-xs leading-5 text-muted-foreground">{value.split("\n").map((_, i) => <span key={i} className="block">{i + 1}</span>)}</pre><Textarea aria-label="Sample source editor" value={value} onChange={(event) => setValue(event.target.value)} className="min-h-0 flex-1 resize-none rounded-none border-0 p-3 font-mono text-xs leading-5 shadow-none focus-visible:ring-0" /></div>
        <p className="shrink-0 border-t border-border px-3 py-1 text-[11px] text-muted-foreground">Edits remain in this pane and are never written to disk.</p>
      </>)
      break
    case "plan": {
      const sections = [{ title: "Workspace", items: ["Understand the request", "Inspect the current code"] }, { title: "Review", items: ["Implement the workspace", "Verify interactions"] }]
      const total = sections.reduce((count, section) => count + section.items.length, 0)
      content = panel(<div className="min-h-0 flex-1 overflow-auto p-3"><div className="mb-3 flex items-center justify-between"><h2 className="text-sm font-medium">Sample plan</h2><Badge variant="default" appearance="muted">{checked.size}/{total} complete</Badge></div><div className="space-y-2">{sections.map((section) => <section key={section.title} className="rounded border border-border/70"><button type="button" aria-expanded={expandedSections.has(section.title)} onClick={() => setExpandedSections((current) => { const next = new Set(current); next.has(section.title) ? next.delete(section.title) : next.add(section.title); return next })} className="flex w-full items-center gap-2 px-2 py-2 text-left text-xs font-medium hover:bg-accent focus-visible:outline-2 focus-visible:outline-foreground/60"><ChevronRightIcon className={cn("size-3 transition-transform", expandedSections.has(section.title) && "rotate-90")} />{section.title}<span className="ms-auto text-muted-foreground">{section.items.filter((_, i) => checked.has(sections.slice(0, sections.indexOf(section)).reduce((n, item) => n + item.items.length, 0) + i)).length}/{section.items.length}</span></button>{expandedSections.has(section.title) ? <div className="border-t border-border/70 p-1">{section.items.map((step, i) => { const index = sections.slice(0, sections.indexOf(section)).reduce((n, item) => n + item.items.length, 0) + i; return <button key={step} type="button" aria-pressed={checked.has(index)} onClick={() => setChecked((current) => { const next = new Set(current); next.has(index) ? next.delete(index) : next.add(index); return next })} className="flex w-full items-center gap-2 rounded px-2 py-2 text-left text-xs hover:bg-accent focus-visible:outline-2 focus-visible:outline-foreground/60"><span className="grid size-4 place-items-center rounded border border-border">{checked.has(index) ? <CheckIcon className="size-3" /> : null}</span><span className={checked.has(index) ? "text-muted-foreground line-through" : ""}>{step}</span></button>})}</div> : null}</section>)}</div><p className="mt-4 text-[11px] text-muted-foreground">Example checklist only; no agent plan is connected.</p></div>)
      break
    }
    case "tasks": {
      const tasks = [{ name: "Review the workspace", state: "done" }, { name: "Connect live tool panes", state: "blocked" }, { name: "Check narrow layouts", state: "open" }]
      const filtered = filter === "all" ? tasks : tasks.filter((task) => task.state === filter)
      content = panel(<><div className="flex shrink-0 items-center gap-2 border-b border-border p-2"><span className="text-xs text-muted-foreground">Show</span>{["all", "open", "done", "blocked"].map((state) => <button key={state} type="button" aria-pressed={filter === state} onClick={() => setFilter(state)} className="rounded px-2 py-1 text-xs capitalize hover:bg-accent focus-visible:outline-2 focus-visible:outline-foreground/60">{state}</button>)}</div><div className="min-h-0 flex-1 overflow-auto p-2">{filtered.map((task) => <div key={task.name} className="flex items-center justify-between gap-2 border-b border-border px-2 py-2 text-xs"><span>{task.name}</span><Badge variant={task.state === "blocked" ? "destructive" : "default"} appearance="muted">{task.state}</Badge></div>)}{filtered.length === 0 ? <p className="p-3 text-xs text-muted-foreground">No sample tasks in this state.</p> : null}<p className="p-2 text-[11px] text-muted-foreground">Example task rows; no jobs are running.</p></div></>)
      break
    }
    case "agent-activity": {
      const events = [{ time: "10:42:18", title: "Preview opened", detail: "A local sample view was selected.", state: "completed" }, { time: "10:42:20", title: "Workspace state changed", detail: "The split layout changed in local UI state.", state: "active" }, { time: "10:42:22", title: "No agent is connected", detail: "There is no background agent or task execution behind this timeline.", state: "needs attention" }]
      content = panel(<div className="min-h-0 flex-1 overflow-auto p-2"><div className="space-y-1">{events.map((event, index) => <div key={event.time} className="rounded border border-border/70"><button type="button" aria-expanded={expandedActivity === index} onClick={() => setExpandedActivity((current) => current === index ? null : index)} className="flex w-full items-center gap-2 px-2 py-2 text-left text-xs hover:bg-accent focus-visible:outline-2 focus-visible:outline-foreground/60"><span className="font-mono text-muted-foreground">{event.time}</span><span className="min-w-0 flex-1 truncate">{event.title}</span><Badge variant={event.state === "needs attention" ? "destructive" : "default"} appearance="muted">{event.state}</Badge><ChevronRightIcon className={cn("size-3 transition-transform", expandedActivity === index && "rotate-90")} /></button>{expandedActivity === index ? <p className="border-t border-border/70 px-3 py-2 text-xs text-muted-foreground">{event.detail}</p> : null}</div>)}</div><p className="px-2 py-3 text-[11px] text-muted-foreground">Illustrative timeline only; it reports no real agent work.</p></div>)
      break
    }
    case "file-preview":
      content = panel(<><div className="flex shrink-0 flex-wrap gap-1 border-b border-border p-2">{["Markdown", "JSON", "Text", "Image", "Document", "PDF"].map((kind) => <button key={kind} type="button" aria-pressed={fileKind === kind} onClick={() => setFileKind(kind)} className="rounded px-2 py-1 text-xs hover:bg-accent focus-visible:outline-2 focus-visible:outline-foreground/60">{kind}</button>)}</div><div className="min-h-0 flex-1 overflow-auto p-4"><div className="mx-auto max-w-2xl rounded-md border border-border bg-muted/20 p-4"><p className="mb-3 text-xs text-muted-foreground">sample.{fileKind.toLowerCase()} · illustrative {fileKind} view</p>{fileKind === "Markdown" ? <><h2 className="text-lg font-medium">Project preview</h2><p className="mt-2 text-sm text-muted-foreground">A local example of how a text file preview can read. This pane does not open a project file.</p></> : fileKind === "JSON" ? <pre className="overflow-auto rounded bg-background p-3 text-xs">{`{\n  "preview": "sample",\n  "connected": false\n}`}</pre> : fileKind === "Image" ? <div className="grid min-h-40 place-items-center rounded border border-dashed border-border text-xs text-muted-foreground">Sample image preview · no image file loaded</div> : fileKind === "PDF" || fileKind === "Document" ? <div className="grid min-h-40 place-items-center rounded border border-dashed border-border text-xs text-muted-foreground">Sample {fileKind} preview · no document opened</div> : <pre className="whitespace-pre-wrap text-sm">This is a plain-text sample. No local file is read.</pre>}</div></div></>)
      break
    case "logs": {
      const filtered = logs.filter((entry) => (filter === "all" || entry.level === filter) && `${entry.time} ${entry.source} ${entry.message}`.toLowerCase().includes(search.toLowerCase()))
      content = panel(<><div className="flex shrink-0 flex-wrap items-center gap-1 border-b border-border p-2"><Input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search sample logs" aria-label="Search sample logs" className="h-7 min-w-24 flex-1 text-xs" />{["all", "info", "warn", "error"].map((level) => <button key={level} type="button" aria-pressed={filter === level} onClick={() => setFilter(level)} className="rounded px-2 py-1 text-xs uppercase hover:bg-accent focus-visible:outline-2 focus-visible:outline-foreground/60">{level}</button>)}<Button variant="ghost" size="icon-xs" aria-label="Clear sample logs" onClick={() => setLogs([])}><TrashIcon /></Button></div><div className="min-h-0 flex-1 overflow-auto font-mono text-[11px]">{filtered.map((entry, i) => <div key={`${entry.time}-${i}`} className="grid grid-cols-[4.5rem_3.5rem_5rem_minmax(0,1fr)] gap-2 border-b border-border/60 px-2 py-1.5"><span className="text-muted-foreground">{entry.time}</span><span className="uppercase">{entry.level}</span><span className="truncate text-muted-foreground">{entry.source}</span><span className="break-words">{entry.message}</span></div>)}{filtered.length === 0 ? <p className="p-3 font-sans text-xs text-muted-foreground">No sample logs match.</p> : null}</div><p className="shrink-0 border-t border-border px-2 py-1 text-[11px] text-muted-foreground">Sample log entries only.</p></>)
      break
    }
    default:
      content = panel(textRows([`${type.label} is not connected to a live service.`, "This pane contains no real project or process data."]))
  }

  return <Pane id={pane.id} type={pane.type} title={title} icon={type.icon} active={actions.active} onClose={actions.onClose} onDockBack={actions.onDockBack} onSplit={actions.onSplit} onFocus={actions.onFocus} onMaximize={actions.onMaximize} maximized={actions.maximized} onPopOut={actions.onPopOut} popOutAvailable={actions.popOutAvailable} moveTargets={actions.moveTargets} onMoveTo={actions.onMoveTo} getDragPayload={actions.getDragPayload}>{content}</Pane>
}
