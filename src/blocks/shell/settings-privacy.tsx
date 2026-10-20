"use client"

import * as React from "react"
import { DownloadIcon, ShieldCheckIcon, Trash2Icon, UploadIcon } from "lucide-react"

import { Button } from "@/components/button"
import {
  dataLocation,
  exportConversations,
  importConversations,
} from "@/lib/backup"
import { clearChats } from "@/lib/chats"
import { clearSessions } from "@/lib/sessions"
import { cn } from "@/lib/utils"

/**
 * A heading above a run of rows. The pane's own heading is the section name,
 * so these name the group within it.
 */
function Group({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="flex flex-col">
      <h3 className="pb-1 text-sm font-semibold text-pretty">{title}</h3>
      {children}
    </section>
  )
}

/**
 * One setting: a name, what it is for, and the control that changes it.
 *
 * The control sits at the far end rather than under the name because these are
 * read as a table, not as prose.
 */
function Row({
  label,
  description,
  children,
}: {
  label: string
  description?: string
  children: React.ReactNode
}) {
  return (
    <div className="flex items-start justify-between gap-6 border-b py-4 last:border-b-0">
      <div className="min-w-0">
        <div className="text-sm font-medium">{label}</div>
        {description ? (
          <p className="mt-0.5 text-sm text-muted-foreground text-pretty">
            {description}
          </p>
        ) : null}
      </div>
      <div className="shrink-0 pt-0.5">{children}</div>
    </div>
  )
}

/**
 * The Privacy section.
 *
 * Everything here is about the user's own data: where it is, how to take a
 * copy of it, how to put one back, and how to be rid of it. The last of those
 * is the one people look for and cannot find, and it is the one that has to be
 * findable — a control that removes everything should be easy to reach and
 * impossible to do by accident.
 */
export function PrivacySettings() {
  const [where, setWhere] = React.useState<string | null>(null)
  const [message, setMessage] = React.useState<string | null>(null)
  const [busy, setBusy] = React.useState(false)
  const [confirming, setConfirming] = React.useState(false)

  React.useEffect(() => {
    let current = true
    void dataLocation().then((location) => {
      if (current) setWhere(location)
    })
    return () => {
      current = false
    }
  }, [])

  const run = async (work: () => Promise<string | null>) => {
    setBusy(true)
    setMessage(null)
    try {
      const said = await work()
      if (said) setMessage(said)
    } catch (error) {
      setMessage(
        error instanceof Error ? error.message : "That could not be done.",
      )
    } finally {
      setBusy(false)
    }
  }

  const exportAll = () =>
    run(async () => {
      const written = await exportConversations()
      return written ? "Your conversations were written to a file." : null
    })

  const importAll = () =>
    run(async () => {
      const result = await importConversations()
      if (!result) return null
      if (result.added === 0) {
        return `Nothing was added: ${result.skipped} of them were already here.`
      }
      return result.skipped
        ? `Added ${result.added}; ${result.skipped} were already here.`
        : `Added ${result.added}.`
    })

  const clearAll = () =>
    run(async () => {
      await clearChats()
      await clearSessions()
      setConfirming(false)
      return "Your conversations were removed from this machine."
    })

  return (
    <div className="flex flex-col gap-8">
      <Group title="On this machine">
        <Row
          label="Where your conversations are"
          description={
            where
              ? "In the app's own folder on this machine. They are not in the cloud, and they are not in the browser's storage."
              : "In the browser's storage, which the browser may clear. Clearing site data clears them with it."
          }
        >
          {where ? (
            <span className="font-mono text-xs break-all text-muted-foreground">
              {where}
            </span>
          ) : null}
        </Row>

        <Row
          label="What leaves this machine"
          description="The message you send, the files you attach and the files you mention are sent to the provider you have chosen a model from. Nothing else is."
        >
          <ShieldCheckIcon className="size-4 text-muted-foreground" />
        </Row>
      </Group>

      <Group title="Your conversations">
        <Row
          label="Export"
          description="Write every chat and every session to a file you can read and keep."
        >
          <Button
            variant="outline"
            size="sm"
            disabled={busy}
            onClick={() => void exportAll()}
          >
            <DownloadIcon className="size-4" />
            Export
          </Button>
        </Row>

        <Row
          label="Import"
          description="Add the conversations from a file made by Export. The ones already here are left alone."
        >
          <Button
            variant="outline"
            size="sm"
            disabled={busy}
            onClick={() => void importAll()}
          >
            <UploadIcon className="size-4" />
            Import
          </Button>
        </Row>

        <Row
          label="Delete everything"
          description="Remove every chat and every session from this machine. There is no copy afterwards unless you have exported one."
        >
          {confirming ? (
            <div className="flex items-center gap-2">
              <Button
                variant="destructive"
                size="sm"
                disabled={busy}
                onClick={() => void clearAll()}
              >
                <Trash2Icon className="size-4" />
                Delete them
              </Button>
              <Button
                variant="ghost"
                size="sm"
                disabled={busy}
                onClick={() => setConfirming(false)}
              >
                Keep them
              </Button>
            </div>
          ) : (
            <Button
              variant="outline"
              size="sm"
              disabled={busy}
              onClick={() => setConfirming(true)}
            >
              <Trash2Icon className="size-4" />
              Delete everything
            </Button>
          )}
        </Row>
      </Group>

      {message ? (
        <p
          role="status"
          className={cn("text-sm text-muted-foreground text-pretty")}
        >
          {message}
        </p>
      ) : null}
    </div>
  )
}
