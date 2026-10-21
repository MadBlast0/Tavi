"use client"

import * as React from "react"
import {
  DownloadIcon,
  FolderXIcon,
  ShieldCheckIcon,
  Trash2Icon,
  UploadIcon,
} from "lucide-react"

import { Button } from "@/components/button"
import { SettingRow } from "@/components/setting-row"
import {
  dataLocation,
  exportConversations,
  importConversations,
} from "@/lib/backup"
import { clearChats } from "@/lib/chats"
import { clearSessions } from "@/lib/sessions"
import { forgetAllWorkspaces } from "@/lib/workspace"
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
 * What is about to be removed.
 *
 * The names are the ones the pane uses elsewhere, so the question and the
 * button beside it say the same thing.
 */
type Removal = "chats" | "sessions" | "folders" | "everything"

/** What each removal takes with it, in words. */
const REMOVAL: Record<Removal, { title: string; detail: string }> = {
  chats: {
    title: "Delete every chat?",
    detail:
      "Every chat is removed from this machine. There is no copy afterwards unless you have exported one.",
  },
  sessions: {
    title: "Delete every code session?",
    detail:
      "Every code session is removed from this machine. There is no copy afterwards unless you have exported one.",
  },
  folders: {
    title: "Forget every folder?",
    detail:
      "Tavi gives up its access to every folder you granted it. The folders themselves are not touched — they stay where they are, on your disk — but Tavi can no longer read them, and you would have to grant it access again.",
  },
  everything: {
    title: "Delete everything?",
    detail:
      "Every chat, every code session, and every folder grant are removed from this machine. The folders themselves are not touched, but Tavi can no longer read them. There is no copy of anything afterwards unless you have exported it.",
  },
}

/**
 * The Privacy section.
 *
 * Everything here is about the user's own data: where it is, how to take a
 * copy of it, how to put one back, and how to be rid of it. The last of those
 * is the one people look for and cannot find, and it is the one that has to be
 * findable — a control that removes everything should be easy to reach and
 * impossible to do by accident.
 *
 * There is one control for everything and one for each thing, because those
 * are two different needs. Somebody tidying up wants the folders back and the
 * chats gone; somebody who wants the machine clean wants the lot. Neither
 * should have to guess what the other button does.
 */
export function PrivacySettings() {
  const [where, setWhere] = React.useState<string | null>(null)
  const [message, setMessage] = React.useState<string | null>(null)
  const [busy, setBusy] = React.useState(false)
  const [removing, setRemoving] = React.useState<Removal | null>(null)

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

  /** Removes what the button named, and says what was removed. */
  const remove = (what: Removal) =>
    run(async () => {
      const removed: string[] = []
      if (what === "chats" || what === "everything") {
        await clearChats()
        removed.push("every chat")
      }
      if (what === "sessions" || what === "everything") {
        await clearSessions()
        removed.push("every code session")
      }
      if (what === "folders" || what === "everything") {
        const folders = await forgetAllWorkspaces()
        removed.push(
          folders === 0
            ? "no folder grants"
            : `${folders} folder grant${folders === 1 ? "" : "s"}`,
        )
      }
      setRemoving(null)
      const said = removed.join(", ")
      return `Removed ${said} from this machine.`
    })

  /**
   * The confirmation for a removal.
   *
   * The button that was pressed turns into the one that does it, so the
   * thing that happens is the thing that was asked for.
   */
  const confirm = (
    what: Removal,
    label: string,
    icon: React.ReactNode = <Trash2Icon className="size-4" />,
  ) =>
    removing === what ? (
      <div className="flex items-center gap-2">
        <Button
          variant="destructive"
          size="sm"
          disabled={busy}
          onClick={() => void remove(what)}
        >
          {icon}
          {label}
        </Button>
        <Button
          variant="ghost"
          size="sm"
          disabled={busy}
          onClick={() => setRemoving(null)}
        >
          Keep them
        </Button>
      </div>
    ) : (
      <Button
        variant="outline"
        size="sm"
        disabled={busy}
        onClick={() => setRemoving(what)}
      >
        {icon}
        {label}
      </Button>
    )

  return (
    <div className="flex flex-col gap-8">
      <Group title="On this machine">
        <SettingRow
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
        </SettingRow>

        <SettingRow
          label="What leaves this machine"
          description="The message you send, the files you attach and the files you mention are sent to the provider you have chosen a model from. Nothing else is."
        >
          <ShieldCheckIcon className="size-4 text-muted-foreground" />
        </SettingRow>
      </Group>

      <Group title="Your conversations">
        <SettingRow
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
        </SettingRow>

        <SettingRow
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
        </SettingRow>
      </Group>

      <Group title="What to remove">
        <SettingRow
          label="Delete every chat"
          description="Remove every chat from this machine, and leave the code sessions alone."
        >
          {confirm("chats", "Delete chats")}
        </SettingRow>

        <SettingRow
          label="Delete every code session"
          description="Remove every code session from this machine, and leave the chats alone."
        >
          {confirm("sessions", "Delete sessions")}
        </SettingRow>

        <SettingRow
          label="Forget every folder"
          description="Give up Tavi's access to every folder you granted it. The folders stay where they are; you would have to grant access again."
        >
          {confirm("folders", "Forget folders", <FolderXIcon className="size-4" />)}
        </SettingRow>

        <SettingRow
          label="Delete everything"
          description="Remove every chat, every code session and every folder grant from this machine. The folders themselves are not touched. There is no copy afterwards unless you have exported one."
        >
          {confirm("everything", "Delete everything")}
        </SettingRow>
      </Group>

      {removing ? (
        <p className="text-sm text-pretty text-muted-foreground">
          {REMOVAL[removing].title} {REMOVAL[removing].detail}
        </p>
      ) : null}

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
