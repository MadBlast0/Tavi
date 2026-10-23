"use client"

import * as React from "react"
import { SearchIcon } from "lucide-react"

import { Input } from "@/components/input"
import { cn } from "@/lib/utils"

interface SampleFile {
  path: string
  status: "added" | "modified" | "deleted"
  additions: number
  deletions: number
}

const SAMPLE_FILES: readonly SampleFile[] = [
  { path: "src/lib/workspace-state.ts", status: "modified", additions: 47, deletions: 12 },
  { path: "src/blocks/workspace/pane.tsx", status: "modified", additions: 23, deletions: 8 },
  { path: "src/blocks/workspace/panes/chat-pane.tsx", status: "added", additions: 219, deletions: 0 },
  { path: "src/blocks/workspace/panes/code-session-pane.tsx", status: "added", additions: 197, deletions: 0 },
  { path: "src/blocks/workspace/pane-registry.tsx", status: "added", additions: 156, deletions: 0 },
  { path: "src/blocks/workspace/pane-states.tsx", status: "added", additions: 134, deletions: 0 },
  { path: "src/lib/workspace-state.ts", status: "modified", additions: 89, deletions: 31 },
  { path: "src/blocks/workspace/layout/layout-tree.tsx", status: "added", additions: 345, deletions: 0 },
  { path: "src/blocks/workspace/pane-registry.test.ts", status: "added", additions: 87, deletions: 0 },
  { path: "src/blocks/workspace/pane-states.test.ts", status: "added", additions: 76, deletions: 0 },
  { path: "src/lib/pane-registry.test.ts", status: "added", additions: 62, deletions: 0 },
  { path: "README.md", status: "modified", additions: 12, deletions: 3 },
  { path: "src/lib/providers.ts", status: "deleted", additions: 0, deletions: 245 },
  { path: "docs/providers.md", status: "added", additions: 169, deletions: 0 },
] as const

type FileStatus = SampleFile["status"]
type DiffState = "empty" | "populated" | "loading" | "error" | "unavailable" | "no-selection"

function FileRow({ file, isSelected, onClick }: { file: SampleFile; isSelected: boolean; onClick: () => void }) {
  return (
    <button
      key={file.path}
      type="button"
      onClick={onClick}
      className="flex items-center gap-2 px-2 py-1.5 text-left text-xs hover:bg-accent"
    >
      <span className="size-3 shrink-0 text-muted-foreground" role="img" aria-label="File">📄</span>
      <span className="truncate flex-1">{file.path}</span>
      <span className="text-[10px] px-1 rounded text-green-500">+{file.additions}</span>
      <span className="text-[10px] px-1 rounded text-red-500">-{file.deletions}</span>
    </button>
  )
}

function DiffContent({ selected }: { selected: SampleFile | null }) {
  if (!selected) {
    return (
      <div className="flex min-h-0 flex-1 items-center justify-center text-muted-foreground">
        <span className="size-12" role="img" aria-label="Diff">📊</span>
        <p className="text-sm">Select a file to view its diff</p>
      </div>
    )
  }
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex shrink-0 items-center gap-2 border-b border-border px-3 py-2">
        <span className="size-4 text-muted-foreground" role="img" aria-label="Code">📄</span>
        <span className="truncate text-sm font-medium">{selected.path}</span>
        <div className="ml-auto flex items-center gap-1">
          <span className="text-xs px-1 rounded text-green-500">+{selected.additions}</span>
          <span className="text-xs px-1 rounded text-red-500">-{selected.deletions}</span>
        </div>
      </div>
      <div className="flex min-h-0 flex-1 p-3 overflow-auto font-mono text-xs bg-muted/30">
        <pre className="text-muted-foreground">
// {selected.path}
// Sample diff content for {selected.path}
+ This is a sample diff
+ showing the structure
+ of the Diff Viewer pane
- The real implementation
- would show actual diffs</pre>
      </div>
    </div>
  )
}

export function DiffViewerPane({ paneId }: { paneId: string }) {
  const [state, setState] = React.useState<DiffState>("populated")
  const [selectedFile, setSelectedFile] = React.useState<string | null>(SAMPLE_FILES[0].path)
  const [search, setSearch] = React.useState("")
  const [filter, setFilter] = React.useState<"all" | "added" | "modified" | "deleted">("all")

  function renderContent() {
    switch (state) {
      case "empty":
        return (
          <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-4 p-4 text-muted-foreground">
            <div className="animate-spin size-8 border-2 border-primary border-t-transparent rounded-full" />
            <span className="text-sm">Loading diff…</span>
          </div>
        )
      case "loading":
        return (
          <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-4 p-4 text-muted-foreground">
            <div className="animate-spin size-8 border-2 border-primary border-t-transparent rounded-full" />
            <span className="text-sm">Loading diff…</span>
          </div>
        )
      case "error":
        return (
          <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-2 p-4 text-center" role="alert">
            <span className="text-destructive size-6" role="img" aria-label="Error">✕</span>
            <p className="text-sm font-medium">Failed to load diff</p>
            <p className="text-xs text-muted-foreground">The diff could not be loaded.</p>
            <button
              type="button"
              onClick={() => setState("populated")}
              className="mt-2 rounded border bg-transparent px-2 py-1 text-xs hover:bg-accent"
            >
              Try again
            </button>
          </div>
        )
      case "unavailable":
        return (
          <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-2 p-4 text-center text-muted-foreground">
            <span className="size-12" role="img" aria-label="Diff">📊</span>
            <p className="text-sm font-medium">Diff unavailable</p>
            <p className="text-xs">No Git repository or session connected.</p>
          </div>
        )
      case "no-selection":
        return (
          <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-2 p-4 text-center text-muted-foreground">
            <span className="size-12" role="img" aria-label="Diff">📊</span>
            <p className="text-sm font-medium">Select a file</p>
            <p className="text-xs">Choose a file from the list to view its diff</p>
          </div>
        )
      default: {
        const selected = SAMPLE_FILES.find((f) => f.path === selectedFile) ?? null
        const filteredFiles = SAMPLE_FILES.filter((f) => {
          if (filter !== "all" && f.status !== filter) return false
          if (search && !f.path.toLowerCase().includes(search.toLowerCase())) return false
          return true
        })
        const totalAdditions = SAMPLE_FILES.reduce((sum, f) => sum + f.additions, 0)
        const totalDeletions = SAMPLE_FILES.reduce((sum, f) => sum + f.deletions, 0)

        const fileButtons = SAMPLE_FILES.map((file) => {
          return (
            <button
              key={file.path}
              type="button"
              onClick={() => setSelectedFile(file.path)}
              className="flex items-center gap-2 px-2 py-1.5 text-left text-xs hover:bg-accent"
            >
              <span className="size-3 shrink-0 text-muted-foreground" role="img" aria-label="File">📄</span>
              <span className="truncate flex-1">{file.path}</span>
              <span className="text-[10px] px-1 rounded text-green-500">+{file.additions}</span>
              <span className="text-[10px] px-1 rounded text-red-500">-{file.deletions}</span>
            </button>
          )
        })

        return (
          <div className="flex min-h-0 flex-1 flex-col">
            <div className="flex shrink-0 flex-col border-b border-border p-3 gap-2">
              <div className="flex items-center justify-between">
                <h3 className="font-medium text-sm">Changes</h3>
                <div className="flex items-center gap-2">
                  <span className="text-green-500 text-xs font-medium">+{totalAdditions}</span>
                  <span className="text-red-500 text-xs font-medium">-{totalDeletions}</span>
                  <span className="text-xs text-muted-foreground">{SAMPLE_FILES.length} files</span>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <div className="relative flex-1">
                  <span className="absolute left-2 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" role="img" aria-label="Search">🔍</span>
                  <input
                    type="text"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    placeholder="Filter files…"
                    className="pl-8 pr-2 text-xs h-7 rounded border border-input bg-background"
                  />
                </div>
                <select
                  value={filter}
                  onChange={(e) => setFilter(e.target.value as any)}
                  className="px-2 py-1 text-xs border border-input bg-background rounded"
                >
                  <option value="all">All</option>
                  <option value="added">Added</option>
                  <option value="modified">Modified</option>
                  <option value="deleted">Deleted</option>
                </select>
              </div>
            </div>
            <div className="flex min-h-0 flex-1">
              <div className="flex shrink-0 w-72 border-r border-border flex-col overflow-hidden">
                <div className="flex min-h-0 flex-1 flex-col overflow-y-auto">
                  {filteredFiles.length === 0 ? (
                    <div className="p-3 text-center text-xs text-muted-foreground">
                      No files match the filter
                    </div>
                  ) : (
                    fileButtons
                  )}
                </div>
              </div>
              <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
                <div className="flex min-h-0 flex-1">
                  <DiffContent selected={SAMPLE_FILES.find((f) => f.path === selectedFile) ?? null} />
                </div>
              </div>
            </div>
          </div>
        )
      }
    }
  }

  return (
    <div data-slot="pane" className="flex min-h-0 min-w-0 flex-1 flex-col bg-background">
      <div data-slot="pane-header" className="flex h-8 shrink-0 items-center gap-2 px-2">
        <span className="size-4 shrink-0 text-muted-foreground" role="img" aria-label="Diff">📊</span>
        <span className="truncate text-sm font-medium">Diff Viewer</span>
        <span className="shrink-0 truncate text-xs text-muted-foreground/70">tavi / uiux-workspace</span>
        <div className="ms-auto flex shrink-0 items-center gap-0.5">
          <button type="button" className="size-6 rounded hover:bg-accent" aria-label="Pop out into its own window" disabled>
            <span className="size-4" role="img" aria-label="Pop out">🔲</span>
          </button>
          <button type="button" className="size-6 rounded hover:bg-accent" aria-label="Pane menu">
            <span className="size-4" role="img" aria-label="Menu">⋮</span>
          </button>
          <button type="button" className="size-6 rounded hover:bg-accent" aria-label="Close">
            <span className="size-4" role="img" aria-label="Close">✕</span>
          </button>
        </div>
      </div>
      <div data-slot="pane-content" className="flex min-h-0 flex-1 flex-col overflow-hidden">
        {renderContent()}
      </div>
    </div>
  )
}