"use client"

import * as React from "react"
import {
  ArrowDownToLineIcon,
  ArrowUpFromLineIcon,
  GitBranchIcon,
  GitCommitHorizontalIcon,
  LoaderIcon,
} from "lucide-react"

import { Badge } from "@/components/badge"
import { Button } from "@/components/button"
import { Input } from "@/components/input"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/popover"
import { Separator } from "@/components/separator"
import {
  GIT_UNAVAILABLE,
  gitBranches,
  gitCommit,
  gitCreateBranch,
  gitIsAvailable,
  gitPull,
  gitPush,
  gitStatus,
  gitSwitchBranch,
  type GitBranch,
  type GitStatus,
} from "@/lib/git"

/**
 * The repository, in the row under the prompt box.
 *
 * **The branch belongs here.** It is the fourth fact about a conversation
 * about a repository — the folder, the mode, the model, and the branch it is
 * on — and the reference puts it in the same row.
 *
 * **It is a reader's surface, not an agent's.** The app cannot write, so the
 * changes in the working tree are the reader's own, made outside the app.
 * What this shows is what is different, and what it does is commit and push
 * on the reader's instruction.
 *
 * **Every refusal says what it is.** A folder that is not a repository is not
 * an error and is not a complaint; it is what most folders are. A browser
 * cannot run git at all, and says so.
 */
export function GitPanel({ id }: { id?: string }) {
  const [open, setOpen] = React.useState(false)
  const [status, setStatus] = React.useState<GitStatus | null>(null)
  const [branches, setBranches] = React.useState<GitBranch[]>([])
  const [message, setMessage] = React.useState("")
  const [newBranch, setNewBranch] = React.useState("")
  const [busy, setBusy] = React.useState(false)
  const [note, setNote] = React.useState<string | null>(null)

  const available = gitIsAvailable()

  const read = React.useCallback(async () => {
    if (!available || !id) return
    const [next, list] = await Promise.all([
      gitStatus(id),
      gitBranches(id),
    ])
    setStatus(next)
    setBranches(list?.branches ?? [])
  }, [available, id])

  React.useEffect(() => {
    if (!open) return
    void read()
  }, [open, read])

  const run = React.useCallback(
    async (action: () => Promise<{ ok: boolean; message?: string; error?: string }>) => {
      setBusy(true)
      setNote(null)
      try {
        const outcome = await action()
        setNote(outcome.ok ? outcome.message ?? "Done." : outcome.error ?? "That did not work.")
        await read()
      } catch (error) {
        setNote(error instanceof Error ? error.message : String(error))
      } finally {
        setBusy(false)
      }
    },
    [read],
  )

  const trigger = (
    <Button
      type="button"
      size="xs"
      variant="secondary"
      aria-label={
        status?.branch ? `Git: ${status.branch}` : "Git"
      }
      disabled={!id}
    >
      <GitBranchIcon />
      {status?.branch || "Git"}
      {status && !status.clean ? (
        <Badge variant="warning" size="sm">
          {status.changed.length}
        </Badge>
      ) : null}
      {status && status.ahead > 0 ? (
        <Badge variant="info" size="sm">
          {status.ahead}
        </Badge>
      ) : null}
      {status && status.behind > 0 ? (
        <Badge appearance="outline" size="sm">
          {status.behind}
        </Badge>
      ) : null}
    </Button>
  )

  return (
    <Popover
      open={open}
      onOpenChange={(next) => {
        setOpen(next)
        if (!next) setNote(null)
      }}
    >
      <PopoverTrigger render={trigger} />
      <PopoverContent side="top" align="start" sideOffset={8} className="w-96">
        <div className="flex flex-col gap-3">
          {!available ? (
            <p className="text-muted-foreground text-xs">{GIT_UNAVAILABLE}</p>
          ) : !id ? (
            <p className="text-muted-foreground text-xs">
              Choose a folder to work in, and this says what is different in it.
            </p>
          ) : status && !status.repository ? (
            <p className="text-muted-foreground text-xs">
              That folder is not a git repository.
            </p>
          ) : (
            <>
              <div className="flex flex-col gap-1">
                <p className="text-sm font-medium">
                  {status?.branch || "No branch yet"}
                </p>
                <p className="text-muted-foreground text-xs">
                  {status
                    ? status.clean
                      ? "Nothing is changed in it."
                      : `${status.changed.length} file${status.changed.length === 1 ? "" : "s"} changed.`
                    : "Reading the repository…"}
                </p>
              </div>

              {status && status.changed.length > 0 ? (
                <ul className="flex max-h-40 flex-col gap-1 overflow-y-auto">
                  {status.changed.map((file) => (
                    <li
                      key={file.path}
                      className="flex items-center gap-2 text-xs"
                    >
                      <span className="text-muted-foreground w-4 shrink-0 font-mono">
                        {file.status}
                      </span>
                      <span className="min-w-0 flex-1 truncate">{file.path}</span>
                      {file.staged ? (
                        <Badge variant="success" size="sm">
                          staged
                        </Badge>
                      ) : null}
                    </li>
                  ))}
                </ul>
              ) : null}

              <Separator />

              <div className="flex flex-col gap-2">
                <Input
                  value={message}
                  onChange={(event) => setMessage(event.target.value)}
                  placeholder="What to say about this change"
                  aria-label="Commit message"
                />
                <div className="flex items-center gap-2">
                  <Button
                    type="button"
                    size="xs"
                    variant="secondary"
                    disabled={busy || !message.trim() || !id}
                    onClick={() =>
                      void run(() => gitCommit(id!, message.trim()))
                    }
                  >
                    <GitCommitHorizontalIcon />
                    Commit
                  </Button>
                  <Button
                    type="button"
                    size="xs"
                    variant="ghost"
                    disabled={busy || !id}
                    onClick={() => void run(() => gitPull(id!))}
                  >
                    <ArrowDownToLineIcon />
                    Pull
                  </Button>
                  <Button
                    type="button"
                    size="xs"
                    variant="ghost"
                    disabled={busy || !id}
                    onClick={() => void run(() => gitPush(id!))}
                  >
                    <ArrowUpFromLineIcon />
                    Push
                  </Button>
                  {busy ? <LoaderIcon className="size-3 animate-spin" /> : null}
                </div>
              </div>

              <Separator />

              <div className="flex flex-col gap-1">
                <p className="text-muted-foreground text-xs">Branches</p>
                <ul className="flex max-h-32 flex-col gap-1 overflow-y-auto">
                  {branches.map((branch) => (
                    <li key={branch.name}>
                      <Button
                        type="button"
                        size="xs"
                        variant={branch.current ? "secondary" : "ghost"}
                        className="w-full justify-start"
                        disabled={busy || branch.current || !id}
                        onClick={() =>
                          void run(() => gitSwitchBranch(id!, branch.name))
                        }
                      >
                        <GitBranchIcon />
                        <span className="truncate">{branch.name}</span>
                      </Button>
                    </li>
                  ))}
                </ul>
                <div className="flex items-center gap-2">
                  <Input
                    value={newBranch}
                    onChange={(event) => setNewBranch(event.target.value)}
                    placeholder="A new branch"
                    aria-label="New branch name"
                  />
                  <Button
                    type="button"
                    size="xs"
                    variant="secondary"
                    disabled={busy || !newBranch.trim() || !id}
                    onClick={() =>
                      void run(async () => {
                        const outcome = await gitCreateBranch(id!, newBranch.trim())
                        if (outcome.ok) setNewBranch("")
                        return outcome
                      })
                    }
                  >
                    Create
                  </Button>
                </div>
              </div>
            </>
          )}

          {note ? (
            <p className="text-muted-foreground text-xs" role="status">
              {note}
            </p>
          ) : null}
        </div>
      </PopoverContent>
    </Popover>
  )
}
