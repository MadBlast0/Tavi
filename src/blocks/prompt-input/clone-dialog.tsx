"use client"

import * as React from "react"
import { CircleAlertIcon, FolderCheckIcon, GitBranchIcon } from "lucide-react"

import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/dialog"
import { Button } from "@/components/button"
import { Input } from "@/components/input"
import { Label } from "@/components/label"
import { Spinner } from "@/components/spinner"
import { cn } from "cn"

export type CloneState =
  | { phase: "idle" }
  | { phase: "cloning"; url: string }
  | { phase: "done"; name: string; path: string }
  | { phase: "failed"; url: string; error: string }

/**
 * Repository URL entry for cloning into the app's projects folder.
 *
 * The destination is shown before the user commits, because the folder is
 * created by the app rather than chosen by them — worth knowing in advance.
 *
 * A finished clone is reported with the real path. The browser cannot hand out a
 * filesystem handle for a folder the user did not open, so selecting it still
 * takes one action of theirs; that is stated rather than papered over with a
 * button that appears to do it automatically.
 */
export function CloneRepositoryDialog({
  open,
  onOpenChange,
  projectsRoot,
  state,
  onSubmit,
  onChoose,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** Absolute path clones will land in, or null when it could not be read. */
  projectsRoot: string | null
  state: CloneState
  onSubmit: (url: string) => void
  onChoose: () => void
}) {
  const [url, setUrl] = React.useState("")
  const inputRef = React.useRef<HTMLInputElement>(null)

  React.useEffect(() => {
    if (!open) return
    setUrl("")
    // Focus lands on the field, since pasting a URL is the only action here.
    const timer = window.setTimeout(() => inputRef.current?.focus(), 60)
    return () => window.clearTimeout(timer)
  }, [open])

  const busy = state.phase === "cloning"
  const submit = () => {
    const trimmed = url.trim()
    if (trimmed && !busy) onSubmit(trimmed)
  }

  return (
    <Dialog open={open} onOpenChange={(next) => !busy && onOpenChange(next)}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <GitBranchIcon className="size-4 shrink-0" />
            Clone repository
          </DialogTitle>
          <DialogDescription>
            Paste a repository URL. It is cloned into your projects folder.
          </DialogDescription>
        </DialogHeader>

        <DialogBody className="flex flex-col gap-3">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="clone-url">Repository URL</Label>
            <Input
              id="clone-url"
              ref={inputRef}
              value={url}
              spellCheck={false}
              autoComplete="off"
              placeholder="https://github.com/owner/repo"
              disabled={busy}
              onChange={(event) => setUrl(event.target.value)}
              onKeyDown={(event) => {
                if (event.key !== "Enter") return
                event.preventDefault()
                submit()
              }}
            />
          </div>

          {projectsRoot ? (
            <p className="text-muted-foreground text-xs">
              Destination:{" "}
              <span className="font-mono break-all">{projectsRoot}</span>
            </p>
          ) : (
            <p className="text-muted-foreground text-xs">
              The projects folder could not be read, so cloning is unavailable.
            </p>
          )}

          {state.phase === "cloning" ? (
            <p className="text-muted-foreground flex items-center gap-2 text-sm">
              <Spinner className="size-4" />
              Cloning {state.url}…
            </p>
          ) : null}

          {state.phase === "failed" ? (
            <p
              role="alert"
              className="text-destructive flex items-start gap-2 text-sm"
            >
              <CircleAlertIcon className="mt-0.5 size-4 shrink-0" />
              <span>{state.error}</span>
            </p>
          ) : null}

          {state.phase === "done" ? (
            <div className="flex flex-col gap-2">
              <p className="flex items-start gap-2 text-sm">
                <FolderCheckIcon className="mt-0.5 size-4 shrink-0" />
                <span>
                  Cloned <span className="font-medium">{state.name}</span> into{" "}
                  <span className="font-mono break-all text-xs">
                    {state.path}
                  </span>
                </span>
              </p>
              <p className="text-muted-foreground text-xs">
                Choosing a folder needs the system file picker, so use
                &ldquo;Choose folder&rdquo; and pick the clone.
              </p>
            </div>
          ) : null}
        </DialogBody>

        <DialogFooter>
          {state.phase === "done" ? (
            <>
              <Button variant="ghost" onClick={() => onOpenChange(false)}>
                Done
              </Button>
              <Button
                onClick={() => {
                  onOpenChange(false)
                  onChoose()
                }}
              >
                Choose folder
              </Button>
            </>
          ) : (
            <>
              <Button
                variant="ghost"
                onClick={() => onOpenChange(false)}
                disabled={busy}
              >
                Cancel
              </Button>
              <Button
                onClick={submit}
                disabled={busy || !url.trim() || !projectsRoot}
              >
                {busy ? "Cloning…" : "Clone"}
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}