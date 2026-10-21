"use client"

import * as React from "react"
import {
  CircleAlertIcon,
  CircleCheckIcon,
  CircleHelpIcon,
  ClipboardPasteIcon,
  ExternalLinkIcon,
  KeyRoundIcon,
  PencilIcon,
  PlusIcon,
  RefreshCwIcon,
  ReplaceIcon,
  Trash2Icon,
  TriangleAlertIcon,
} from "lucide-react"

import {
  Alert,
  AlertDescription,
  AlertTitle,
} from "@/components/alert"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/alert-dialog"
import { Badge } from "@/components/badge"
import { Button } from "@/components/button"
import { InfoHint } from "@/components/info-hint"
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/dialog"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/dropdown-menu"
import { Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/empty"
import { Field, FieldLabel } from "@/components/field"
import { Input } from "@/components/input"
import {
  InputGroup,
  InputGroupAddon,
  InputGroupButton,
  InputGroupInput,
  InputGroupPasswordToggle,
} from "@/components/input-group"
import {
  Item,
  ItemActions,
  ItemContent,
  ItemDescription,
  ItemGroup,
  ItemMedia,
  ItemTitle,
} from "@/components/item"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/select"
import { Skeleton } from "@/components/skeleton"
import {
  activateProviderKey,
  checkProviderKey,
  listProviderKeys,
  openExternal,
  removeProviderKey,
  renameProviderKey,
  replaceProviderKey,
  recheckProviderKey,
  saveProviderKey,
  type ProviderKey,
} from "@/lib/api"
import { ACTIVE_PROVIDER_ID, PROVIDERS, providerFor } from "@/lib/providers"
import { isDesktopApp } from "@/lib/platform"
import { cn } from "@/lib/utils"

/**
 * The API keys pane.
 *
 * A list of the keys the app holds, grouped by the provider they are for —
 * because the provider is a property of the key, and two keys for one
 * provider have to sit together to be told apart.
 *
 * The key itself is never shown. It is never read back out of where it is
 * kept, and on the desktop it never reaches this code at all — so a row can
 * say whether the provider accepts it and whose key it is, and can put a new
 * one in, rename it, choose between two, and take one away, and can do
 * nothing else with it.
 *
 * The heading is drawn here rather than by the settings card because it
 * carries two things the card's shared heading has no room for: how many keys
 * there are, and the button that adds one. `tall` is the card's narrow shape,
 * where the strip of tabs has already named the section and saying it again
 * would say it twice.
 */

/**
 * The pane's own inset.
 *
 * The `Item` component insets its own content, so a row's icon tile would
 * start a little to the right of the heading above it and its actions would
 * stop a little to the left of the button beside the heading. One value, put
 * on the element itself, so the two cannot drift: an inline style beats a
 * class, whichever order the stylesheet happens to emit them in.
 */
const PANE_INSET = { "--item-px": "0px" } as React.CSSProperties

/** What the pane says about the keys, on the desktop. */
export const DESKTOP_NOTE = "Kept in this computer's credential store."

/** What the pane says about the keys, in a browser. */
export const WEB_NOTE = "Kept by this computer's server."

/** The window a provider's spending cap resets on, in words. */
const WINDOW_NAME: Record<string, string> = {
  daily: "today",
  weekly: "this week",
  monthly: "this month",
}

/**
 * Money, in the provider's own unit.
 *
 * The unit is a field on the key, never an assumption: a silent "$" on a
 * provider that counts credits would be a lie about the number.
 *
 * An amount that rounds away to nothing is not nothing, so a figure smaller
 * than a cent is shown with the digits it actually has rather than as zero.
 */
function money(value: number, currency: string | null): string {
  const format = (digits: number) =>
    currency
      ? new Intl.NumberFormat("en-US", {
          style: "currency",
          currency,
          maximumFractionDigits: digits,
        }).format(value)
      : new Intl.NumberFormat("en-US", { maximumFractionDigits: digits }).format(
          value,
        )

  const rounded = format(2)
  const shown = Number(rounded.replace(/[^0-9.-]/g, ""))
  if (value !== 0 && shown === 0) {
    return format(6)
  }
  return rounded
}

/**
 * A date, in the short form.
 *
 * Written out rather than asked of the runtime, because the runtime's locale
 * is not the same in the desktop app and in a browser — and the same key
 * should not read as two different days in the two builds.
 */
const MONTHS = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
]

function shortDate(seconds: number): string {
  const date = new Date(seconds * 1000)
  return `${date.getDate()} ${MONTHS[date.getMonth()]} ${date.getFullYear()}`
}

/** How long ago something happened, in words. */
function ago(seconds: number): string {
  const delta = Math.floor(Date.now() / 1000) - seconds
  if (delta < 60) return "just now"
  if (delta < 3600) {
    const minutes = Math.floor(delta / 60)
    return `${minutes} minute${minutes === 1 ? "" : "s"} ago`
  }
  if (delta < 86_400) {
    const hours = Math.floor(delta / 3600)
    return `${hours} hour${hours === 1 ? "" : "s"} ago`
  }
  const days = Math.floor(delta / 86_400)
  if (days < 30) return `${days} day${days === 1 ? "" : "s"} ago`
  return `on ${shortDate(seconds)}`
}

/**
 * What the provider's answer means, as a badge.
 *
 * The states are separate because they are separate facts. A key whose
 * account is out of credit is not a key that was refused, and a key that was
 * never checked is not a key that is broken.
 */
type Standing = { label: string; tone: "default" | "destructive" }

function standingOf(key: ProviderKey): Standing {
  const { valid, checkReason } = key
  if (valid === true) {
    if (checkReason === "rate-limited") return { label: "Rate limited", tone: "default" }
    return { label: "Accepted", tone: "default" }
  }
  if (valid === false) {
    if (checkReason === "no-credit") return { label: "No credit", tone: "destructive" }
    return { label: "Not accepted", tone: "destructive" }
  }
  if (checkReason === "unreachable") return { label: "Not checked", tone: "default" }
  return { label: "Not checked", tone: "default" }
}

/**
 * What a key says about itself.
 *
 * The allowance is the usage **in the cap's window**, not the all-time
 * figure: a cap that resets monthly compared with a lifetime total is a
 * sentence about two different things.
 */
function allowanceOf(key: ProviderKey): string | null {
  const { limit, limitRemaining, limitReset, usage, usageInWindow } = key
  const unit = key.limitCurrency

  if (limit === null && limitRemaining === null) {
    if (usage === null) return null
    return `${money(usage, unit)} spent in total`
  }

  const used = usageInWindow ?? usage
  if (used === null || limit === null) {
    return "No spending limit"
  }

  if (used > limit) {
    return `${money(used - limit, unit)} over`
  }

  const left = limitRemaining ?? limit - used
  const window = limitReset ? WINDOW_NAME[limitReset] : null
  return (
    `${money(used, unit)} of ${money(limit, unit)} used` +
    (window ? ` ${window}` : "") +
    ` · ${money(left, unit)} left`
  )
}

/**
 * Where a key is, when it is not in the store this pane writes to.
 *
 * A key in the development file, or in the environment the website's server
 * was started with, is somewhere else entirely. The buttons would write a
 * second key somewhere the pane can reach and leave the one in use unchanged,
 * which is worse than not offering them at all.
 */
const isElsewhere = (key: ProviderKey) =>
  key.source === "dev-file" || key.source === "env"

/** What is said about a key that is somewhere else. */
const SOURCE_NOTE: Record<string, string> = {
  "dev-file": "From .env.local, for development",
  env: "From the environment this server was started with",
}

/**
 * The pane, without the fetching.
 *
 * The list is drawn here, from the keys it is given. The container above it
 * fetches them and holds the dialogs; nothing in this component knows where
 * a key came from, which is what lets the same screen be drawn for the app
 * and for the website — and what lets a test draw it with no network at all.
 */
export type KeyPaneProps = {
  /** The keys, as they are known. */
  keys: ProviderKey[]
  /** Whether the keys are kept in this computer's credential store. */
  held: boolean
  /** The section's own name, from the settings registry. */
  label: string
  /** Whether the card is in its narrow shape. */
  tall: boolean
  /** Whether the keys are still being read. */
  loading: boolean
  /** The person asked to add a key. */
  onAdd: () => void
  /** The person asked to rename a key. */
  onRename: (key: ProviderKey) => void
  /** The person asked to put a new secret in place of a key's. */
  onReplace: (key: ProviderKey) => void
  /** The person asked to take a key away. */
  onRemove: (key: ProviderKey) => void
  /** Something about a key changed, and the list is to be read again. */
  onChanged: () => void
}

/**
 * The pane.
 */
export function KeyPane({
  keys,
  held,
  label,
  tall,
  loading,
  onAdd,
  onRename,
  onReplace,
  onRemove,
  onChanged,
}: KeyPaneProps) {
  /* Every key the app holds, wherever it is kept.

     A key in the development file, or in the environment the website's server
     was started with, is a key the app is using — so it is listed, and said to
     be somewhere else. The row carries no buttons for it, because there would
     be nothing there to change. */
  const stored = keys

  /* The keys, grouped by the provider they are for. The order is the
     provider table's own, so the groups do not move about between visits. */
  const groups = PROVIDERS.map((provider) => ({
    provider,
    keys: stored.filter((key) => key.provider === provider.id),
  })).filter((group) => group.keys.length > 0)

  return (
    <div className="flex flex-col gap-6">
      {/* The heading and the action are siblings on the first line, so the
          button's centre and the heading's centre are the same height. The
          note sits below, where a reference layout puts it. */}
      <div className="flex flex-col gap-1">
        <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-3">
          <div className="flex items-center gap-1">
            <h2
              className={cn(
                "flex items-center gap-2 text-base leading-snug font-semibold text-pretty",
                tall && "sr-only"
              )}
            >
              {label}
              {loading ? null : (
                <Badge appearance="muted" shape="pill" size="sm">
                  {stored.length}
                </Badge>
              )}
            </h2>
            <InfoHint label={`About ${label.toLowerCase()}`}>
              A key acts as the account it was created for, so two keys for the
              same provider can be told apart. Tavi never writes a key to disk
              in plaintext, never sends one to a browser, and never logs one. If
              you think a key has been exposed, replace it here and revoke it
              at the provider.
            </InfoHint>
          </div>

          <Button type="button" size="sm" onClick={onAdd}>
            <PlusIcon className="size-4" />
            Add key
          </Button>
        </div>
        <p
          data-slot="api-keys-note"
          className="max-w-prose text-sm text-pretty text-muted-foreground"
        >
          {held ? DESKTOP_NOTE : WEB_NOTE}
        </p>
      </div>

      {loading ? (
        <SkeletonRows />
      ) : groups.length === 0 ? (
        <EmptyKeys onAdd={onAdd} />
      ) : (
        <div className="flex flex-col gap-6">
          {groups.map((group) => (
            <KeyGroup
              key={group.provider.id}
              provider={group.provider.id}
              label={group.provider.label}
              keys={group.keys}
              onRename={onRename}
              onReplace={onReplace}
              onRemove={onRemove}
              onChanged={onChanged}
            />
          ))}
        </div>
      )}
    </div>
  )
}

/**
 * The pane.
 *
 * A list of the keys the app holds, grouped by the provider they are for —
 * because the provider is a property of the key, and two keys for one
 * provider have to sit together to be told apart.
 *
 * The key itself is never shown. It is never read back out of where it is
 * kept, and on the desktop it never reaches this code at all — so a row can
 * say whether the provider accepts it and whose key it is, and can put a new
 * one in, rename it, choose between two, and take one away, and can do
 * nothing else with it.
 *
 * The heading is drawn here rather than by the settings card because it
 * carries two things the card's shared heading has no room for: how many keys
 * there are, and the button that adds one. `tall` is the card's narrow shape,
 * where the strip of tabs has already named the section and saying it again
 * would say it twice.
 */
export function KeySettings({
  label,
  tall,
}: {
  /** The section's own name, from the settings registry. */
  label: string
  /** Whether the card is in its narrow shape. */
  tall: boolean
}) {
  /* Whether this build keeps its keys in the operating system's credential
     store or leaves them to the server. The pane is the same either way —
     the same list, the same buttons, the same dialog — because a person
     setting a key should not have to learn a second version of the screen
     depending on where the app is running. */
  const held = isDesktopApp()

  const [keys, setKeys] = React.useState<ProviderKey[] | null>(null)
  const [addOpen, setAddOpen] = React.useState(false)
  const [renaming, setRenaming] = React.useState<ProviderKey | null>(null)
  const [replacing, setReplacing] = React.useState<ProviderKey | null>(null)
  const [removing, setRemoving] = React.useState<ProviderKey | null>(null)
  const [removingOpen, setRemovingOpen] = React.useState(false)

  const load = React.useCallback(async () => {
    try {
      setKeys(await listProviderKeys())
    } catch {
      /* The list could not be read. Nothing is claimed about what is stored. */
      setKeys([])
    }
  }, [])

  React.useEffect(() => {
    void load()
  }, [load])

  return (
    <div className="flex flex-col gap-6">
      <KeyPane
        keys={keys ?? []}
        held={held}
        label={label}
        tall={tall}
        loading={keys === null}
        onAdd={() => setAddOpen(true)}
        onRename={setRenaming}
        onReplace={setReplacing}
        onRemove={(key) => {
          setRemoving(key)
          setRemovingOpen(true)
        }}
        onChanged={() => void load()}
      />

      <KeyDialog
        open={addOpen}
        onOpenChange={setAddOpen}
        keys={keys ?? []}
        held={held}
        onSaved={() => void load()}
      />
      <RenameKeyDialog
        key={renaming?.id ?? "renaming"}
        open={renaming !== null}
        info={renaming}
        onOpenChange={(open) => {
          if (!open) setRenaming(null)
        }}
        onRenamed={() => void load()}
      />
      <ReplaceKeyDialog
        key={replacing?.id ?? "replacing"}
        open={replacing !== null}
        info={replacing}
        held={held}
        onOpenChange={(open) => {
          if (!open) setReplacing(null)
        }}
        onReplaced={() => void load()}
      />
      <RemoveKeyDialog
        open={removingOpen}
        info={removing}
        onOpenChange={setRemovingOpen}
        onRemoved={() => void load()}
      />
    </div>
  )
}

/**
 * The list, while the keys are being read.
 *
 * Two rows, because a list of one would look like a different thing
 * altogether when the answer arrives.
 */
function SkeletonRows() {
  return (
    <div className="flex flex-col gap-4">
      {[0, 1].map((row) => (
        <div key={row} className="flex items-center gap-3">
          <Skeleton className="size-8 shrink-0 rounded-md bg-foreground/10" />
          <div className="flex min-w-0 flex-1 flex-col gap-1.5">
            <Skeleton className="h-3.5 w-28 bg-foreground/10" />
            <Skeleton className="h-3 w-56 bg-foreground/10" />
          </div>
        </div>
      ))}
    </div>
  )
}

/**
 * One provider's keys.
 *
 * The keys sit together because the provider is a property of the key, and
 * two keys for one provider are only tellable apart by being side by side.
 */
function KeyGroup({
  provider,
  label,
  keys,
  onRename,
  onReplace,
  onRemove,
  onChanged,
}: {
  provider: string
  label: string
  keys: ProviderKey[]
  onRename: (key: ProviderKey) => void
  onReplace: (key: ProviderKey) => void
  onRemove: (key: ProviderKey) => void
  onChanged: () => void
}) {
  const details = providerFor(provider)

  return (
    <section className="flex flex-col gap-2">
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-2">
          <h3 className="text-sm leading-snug font-semibold text-pretty">
            {label}
          </h3>
          <Badge appearance="muted" shape="pill" size="sm">
            {keys.length}
          </Badge>
        </div>

        {/* Where the provider keeps its own answers. They sit on the provider's
            own line rather than under every key, because they are the
            provider's and not the key's. */}
        <div className="flex items-center gap-3 text-xs text-muted-foreground">
          {details?.logsUrl ? (
            <Button
              type="button"
              variant="link"
              size="xs"
              className="h-auto p-0 text-xs"
              onClick={() => void openExternal(details.logsUrl!)}
            >
              Usage and logs
              <ExternalLinkIcon className="size-3" />
            </Button>
          ) : null}
          {details?.limitsUrl ? (
            <Button
              type="button"
              variant="link"
              size="xs"
              className="h-auto p-0 text-xs"
              onClick={() => void openExternal(details.limitsUrl!)}
            >
              Spending limits
              <ExternalLinkIcon className="size-3" />
            </Button>
          ) : null}
        </div>
      </div>

      <ItemGroup variant="default">
        {keys.map((key) => (
          <KeyRow
            key={key.id}
            info={key}
            onRename={() => onRename(key)}
            onReplace={() => onReplace(key)}
            onRemove={() => onRemove(key)}
            onChanged={onChanged}
          />
        ))}
      </ItemGroup>
    </section>
  )
}

/**
 * One key.
 *
 * The title is the key's own name — the only thing that tells two keys for
 * the same provider apart. Beneath it is what the provider says about the
 * key, and the buttons are named after it, so a screen-reader user moving
 * down the list hears which row each button belongs to.
 */
function KeyRow({
  info,
  onRename,
  onReplace,
  onRemove,
  onChanged,
}: {
  info: ProviderKey
  onRename: () => void
  onReplace: () => void
  onRemove: () => void
  onChanged: () => void
}) {
  const standing = standingOf(info)
  const provider = providerFor(info.provider)
  const elsewhere = isElsewhere(info)

  /* The check runs behind the menu, which closes when the item is chosen. The
     row's own badge is what changes when it is done. */
  const check = async () => {
    try {
      await recheckProviderKey(info.id)
      onChanged()
    } catch {
      /* The provider could not be asked. The row keeps the standing it had. */
    }
  }

  const makeActive = async () => {
    try {
      await activateProviderKey(info.id)
      onChanged()
    } catch {
      /* The pointer did not move. The list is re-read either way. */
      onChanged()
    }
  }

  return (
    <Item size="sm" className="border-b last:border-b-0" style={PANE_INSET}>
      <ItemMedia variant="icon">
        <KeyRoundIcon />
      </ItemMedia>

      <ItemContent>
        <ItemTitle>
          {info.name}
          {info.active ? (
            <Badge appearance="muted" shape="pill" size="sm">
              In use
            </Badge>
          ) : null}
          <Badge
            variant={standing.tone === "destructive" ? "destructive" : "default"}
            appearance="outline"
            size="sm"
          >
            {standing.tone === "destructive" ? (
              <>
                <TriangleAlertIcon />
                {standing.label}
              </>
            ) : standing.label === "Accepted" ? (
              <>
                <CircleCheckIcon />
                {standing.label}
              </>
            ) : standing.label === "Rate limited" ? (
              <>
                <CircleAlertIcon />
                {standing.label}
              </>
            ) : (
              standing.label
            )}
          </Badge>
        </ItemTitle>

        <ItemDescription>{detail(info)}</ItemDescription>
      </ItemContent>

      <ItemActions>
        {/* A key that is not in the store this pane writes to is not in it:
            there is nothing here to edit or to take away. The menu would write
            a second key somewhere else and leave the one in use unchanged,
            which is worse than not offering it. */}
        {elsewhere ? null : (
          <DropdownMenu>
            <DropdownMenuTrigger
              render={
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-sm"
                  aria-label={`Actions for ${info.name}`}
                />
              }
            >
              <PencilIcon className="size-4" />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem
                aria-label={`Make active ${info.name}`}
                disabled={info.active}
                title={
                  info.active ? "This is the key in use." : undefined
                }
                onClick={() => void makeActive()}
              >
                <CircleCheckIcon />
                Make active
              </DropdownMenuItem>
              <DropdownMenuItem
                aria-label={`Rename ${info.name}`}
                onClick={onRename}
              >
                <PencilIcon />
                Rename
              </DropdownMenuItem>
              <DropdownMenuItem
                aria-label={`Replace key ${info.name}`}
                onClick={onReplace}
              >
                <ReplaceIcon />
                Replace key
              </DropdownMenuItem>
              <DropdownMenuItem
                aria-label={`Check now ${info.name}`}
                title={
                  provider?.validation === "inference-probe"
                    ? "Checking this key costs one request. NVIDIA does not publish a key check, so this is a real inference."
                    : undefined
                }
                onClick={() => void check()}
              >
                <RefreshCwIcon />
                Check now
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                variant="destructive"
                aria-label={`Remove ${info.name}`}
                onClick={onRemove}
              >
                <Trash2Icon />
                Remove
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        )}
      </ItemActions>
    </Item>
  )
}

/**
 * What a provider says about its key, in one line.
 *
 * The account name is the provider's own — the label OpenRouter puts on a
 * key — and it is already masked by the provider and masked again here.
 * Nothing here is the key.
 *
 * The standing is not repeated here: the badge beside the name already says
 * whether the provider accepts it.
 */
function detail(info: ProviderKey): string {
  const parts: string[] = []

  /* Where the key came from is said first, because it decides what can be
     done with it: a key that is elsewhere is edited where it is. */
  if (info.source && info.source !== "keyring" && info.source !== "server-file") {
    parts.push(SOURCE_NOTE[info.source] ?? "From somewhere else")
  }

  if (info.account) {
    parts.push(`Signed in as “${info.account}”`)
  } else if (info.maskedValue) {
    /* The provider did not say whose key this is, so the app's own mask is
       what the user has to match against the provider's console. When the
       provider does say, its name is the better answer and the two are not
       printed one after the other. */
    parts.push(info.maskedValue)
  }

  if (info.isFreeTier) {
    parts.push("Free tier")
  }

  /* What the badge does not say. A key that was refused is worth a word more
     than the badge carries, because there are two things it can mean and only
     one of them is a mistake. */
  if (info.valid === false && info.checkReason === "not-accepted") {
    parts.push("It may have been revoked, or entered wrongly")
  }
  if (info.valid === null && info.checkReason === "unreachable") {
    parts.push("The provider could not be reached")
  }

  const allowance = allowanceOf(info)
  if (allowance) {
    parts.push(allowance)
  }

  /* The dates the app knows for certain. "Last used" is the app's own use,
     which is the one it can be sure of. */
  parts.push(`Added ${shortDate(info.createdAt)}`)
  if (info.lastUsedAt) {
    parts.push(`Last used by Tavi ${ago(info.lastUsedAt)}`)
  }
  if (info.expiresAt) {
    parts.push(`Expires ${shortDate(info.expiresAt)}`)
  }

  return parts.join(" · ")
}

/**
 * Nothing is stored.
 *
 * The app does not make keys, so the two things this can offer are the button
 * that takes one you already have, and — once a provider is chosen — the
 * provider's own page for making one.
 */
function EmptyKeys({ onAdd }: { onAdd: () => void }) {
  return (
    <Empty>
      <EmptyHeader>
        <EmptyMedia variant="icon">
          <KeyRoundIcon />
        </EmptyMedia>
        <EmptyTitle>No API keys yet</EmptyTitle>
        <EmptyDescription>
          Tavi needs a key to reach a provider. Add one you already have for
          OpenRouter, Anthropic, OpenAI or NVIDIA.
        </EmptyDescription>
      </EmptyHeader>
      <EmptyContent>
        <Button type="button" onClick={onAdd}>
          <PlusIcon className="size-4" />
          Add key
        </Button>
      </EmptyContent>
    </Empty>
  )
}

/**
 * Adding a key.
 *
 * The provider is chosen first and the key is entered for it, because a key
 * means nothing without the provider it belongs to. The value is held in
 * component state only long enough to submit, then cleared — it is never
 * mirrored into storage and never rendered back after a save.
 */
function KeyDialog({
  open,
  onOpenChange,
  keys,
  held,
  onSaved,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** What is already stored, so the picker can say which are taken. */
  keys: ProviderKey[]
  /** Whether the keys are kept in this computer's credential store. */
  held: boolean
  onSaved: () => void
}) {
  const [chosen, setChosen] = React.useState("")
  const [name, setName] = React.useState("")
  const [value, setValue] = React.useState("")
  const [error, setError] = React.useState<string | null>(null)
  const [saving, setSaving] = React.useState(false)
  const [checking, setChecking] = React.useState(false)
  const [checked, setChecked] = React.useState<string | null>(null)
  const formRef = React.useRef<HTMLFormElement>(null)

  const counts = new Map<string, number>()
  for (const key of keys) {
    counts.set(key.provider, (counts.get(key.provider) ?? 0) + 1)
  }

  /* The provider a key is added for: the first one that has no key yet. */
  const fallback =
    PROVIDERS.find((provider) => !counts.has(provider.id))?.id ?? PROVIDERS[0].id

  React.useEffect(() => {
    if (!open) {
      return
    }
    setChosen(fallback)
    setName("")
    setValue("")
    setError(null)
    setChecked(null)
  }, [open, fallback])

  const provider = providerFor(chosen)
  const editing = false
  const probe = provider?.validation === "inference-probe"

  const store = async () => {
    const key = value.trim()
    if (!key || !provider) {
      return
    }
    setSaving(true)
    setError(null)
    try {
      await saveProviderKey(provider.id, key, name.trim() || undefined)
      setValue("")
      onOpenChange(false)
      onSaved()
    } catch (problem) {
      setError(
        problem instanceof Error
          ? problem.message
          : "The key could not be stored.",
      )
    } finally {
      setSaving(false)
    }
  }

  const paste = async () => {
    try {
      if (!navigator.clipboard?.readText) {
        throw new Error("The clipboard cannot be read here.")
      }
      const text = await navigator.clipboard.readText()
      if (text.trim()) {
        setValue(text.trim())
        setError(null)
        setChecked(null)
      }
    } catch (problem) {
      setError(
        problem instanceof Error
          ? problem.message
          : "The clipboard cannot be read. Paste the key into the field instead.",
      )
    }
  }

  /**
   * Checks a key that has not been stored.
   *
   * Only offered for the providers whose check costs a request, and only ever
   * when the person presses the button — the list must never quietly spend
   * the user's quota.
   */
  const check = async () => {
    if (!provider) return
    const key = value.trim()
    if (!key) return
    setChecking(true)
    setError(null)
    try {
      const standing = await checkProviderKey(provider.id, key, true)
      setChecked(
        standing.valid === true
          ? `${provider.label} accepts this key.`
          : standing.valid === false
            ? standing.checkReason === "no-credit"
              ? `${provider.label} accepts this key, but the account has no credit left.`
              : `${provider.label} did not accept this key.`
            : `${provider.label} could not be reached, so this key's standing is unknown.`,
      )
    } catch (problem) {
      setError(
        problem instanceof Error
          ? problem.message
          : "The provider could not be asked about this key.",
      )
    } finally {
      setChecking(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent size="sm">
        <DialogHeader>
          <DialogTitle>Add API key</DialogTitle>
          <DialogDescription>
            Choose a provider, then paste the key you already have for it.
          </DialogDescription>
        </DialogHeader>

        <DialogBody>
          <form
            ref={formRef}
            onSubmit={(event) => {
              event.preventDefault()
              void store()
            }}
            className="flex flex-col gap-4"
          >
            <Field>
              <div className="flex items-center gap-1">
                <FieldLabel>Provider</FieldLabel>
                <InfoHint label="About the provider">
                  Which provider the key is for. A key only works with the
                  provider that made it, and Tavi asks that provider when it
                  checks the key.
                </InfoHint>
              </div>
              <div className="flex items-center gap-2">
                <Select
                  /* The list of what there is to choose from, so the closed
                     field shows the provider's name rather than its id. */
                  items={PROVIDERS.map((option) => ({
                    value: option.id,
                    label: option.label,
                  }))}
                  value={chosen}
                  onValueChange={(value) => {
                    setChosen(value ?? "")
                    setChecked(null)
                  }}
                >
                  <SelectTrigger id="key-provider" className="min-w-0 flex-1">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent
                    /* The list opens below the field, not over it: the
                       selected provider has to stay readable while the list
                       is open. */
                    alignItemWithTrigger={false}
                  >
                    {PROVIDERS.map((option) => (
                      <SelectItem key={option.id} value={option.id}>
                        {option.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {provider ? (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => void openExternal(provider.keysUrl)}
                  >
                    Get a key
                    <ExternalLinkIcon className="size-4" />
                  </Button>
                ) : null}
              </div>
            </Field>

            <Field>
              <div className="flex items-center gap-1">
                <FieldLabel htmlFor="key-name">Name</FieldLabel>
                <InfoHint label="About the name">
                  What this key is for, so you can tell two keys for the same
                  provider apart. Left empty, it is named after the provider.
                </InfoHint>
              </div>
              <Input
                id="key-name"
                type="text"
                autoComplete="off"
                spellCheck={false}
                maxLength={64}
                placeholder={provider?.label ?? "Provider"}
                value={name}
                onValueChange={(value) => setName(value)}
              />
            </Field>

            <Field>
              <div className="flex items-center gap-1">
                <FieldLabel htmlFor="provider-api-key">
                  {provider?.label ?? "Provider"} API key
                </FieldLabel>
                <InfoHint label="About the key">
                  The key itself. It is shown once, here, and never again —{" "}
                  {held
                    ? "Tavi keeps it in this computer's credential store, never writes it to disk in plaintext, and never reads it back into the app."
                    : "Tavi keeps it on this computer's server, never sends it back to the browser, and never reads it back into the app."}
                </InfoHint>
              </div>
              <InputGroup>
                <InputGroupInput
                  id="provider-api-key"
                  type="password"
                  autoComplete="off"
                  autoCorrect="off"
                  spellCheck={false}
                  placeholder="Paste the key"
                  value={value}
                  onChange={(event) => {
                    setValue(event.target.value)
                    setChecked(null)
                  }}
                />
                <InputGroupAddon align="inline-end">
                  <InputGroupButton
                    size="icon-xs"
                    aria-label="Paste from the clipboard"
                    onClick={() => void paste()}
                  >
                    <ClipboardPasteIcon />
                  </InputGroupButton>
                  <InputGroupPasswordToggle />
                </InputGroupAddon>
              </InputGroup>
            </Field>

            {probe ? (
              <Alert appearance="soft">
                <CircleHelpIcon />
                <AlertTitle>This one cannot be checked for free</AlertTitle>
                <AlertDescription>
                  NVIDIA does not publish a key check, so Tavi cannot confirm
                  this key without spending a request on a real inference. The
                  key is saved either way, and you can check it afterwards with
                  “Check now”.
                </AlertDescription>
              </Alert>
            ) : null}

            {checked ? (
              <Alert appearance="soft">
                {checked.includes("accepts this key") ? (
                  <CircleCheckIcon />
                ) : (
                  <TriangleAlertIcon />
                )}
                <AlertTitle>{checked}</AlertTitle>
              </Alert>
            ) : null}

            {error ? (
              <Alert variant="destructive" appearance="soft">
                <TriangleAlertIcon />
                <AlertTitle>The key was not stored</AlertTitle>
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            ) : null}
          </form>
        </DialogBody>

        <DialogFooter>
          {probe && value.trim() ? (
            <Button
              type="button"
              variant="outline"
              loading={checking}
              onClick={() => void check()}
            >
              Check this key
            </Button>
          ) : null}
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
          >
            Cancel
          </Button>
          <Button
            type="button"
            onClick={() => formRef.current?.requestSubmit()}
            loading={saving}
            disabled={!value.trim()}
          >
            Save key
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

/**
 * Renaming a key.
 *
 * The name is the only thing that tells two keys for the same provider
 * apart, so it is the one thing worth editing.
 */
function RenameKeyDialog({
  open,
  info,
  onOpenChange,
  onRenamed,
}: {
  open: boolean
  info: ProviderKey | null
  onOpenChange: (open: boolean) => void
  onRenamed: () => void
}) {
  const [name, setName] = React.useState("")
  const [error, setError] = React.useState<string | null>(null)
  const [saving, setSaving] = React.useState(false)

  React.useEffect(() => {
    if (!open) return
    setName(info?.name ?? "")
    setError(null)
  }, [open, info])

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent size="sm">
        <DialogHeader>
          <DialogTitle>Rename key</DialogTitle>
          <DialogDescription>
            The name is only for you. It is how two {info?.providerLabel ?? "provider"}{" "}
            keys are told apart.
          </DialogDescription>
        </DialogHeader>

        <DialogBody>
          <Field>
            <FieldLabel htmlFor="rename-key">Name</FieldLabel>
            <Input
              id="rename-key"
              type="text"
              autoComplete="off"
              spellCheck={false}
              maxLength={64}
              value={name}
              onValueChange={(value) => setName(value)}
            />
          </Field>

          {error ? (
            <Alert variant="destructive" appearance="soft" className="mt-4">
              <TriangleAlertIcon />
              <AlertTitle>The key was not renamed</AlertTitle>
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          ) : null}
        </DialogBody>

        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
          >
            Cancel
          </Button>
          <Button
            type="button"
            loading={saving}
            disabled={!name.trim()}
            onClick={async () => {
              if (!info) return
              setSaving(true)
              setError(null)
              try {
                await renameProviderKey(info.id, name.trim())
                onOpenChange(false)
                onRenamed()
              } catch (problem) {
                setError(
                  problem instanceof Error
                    ? problem.message
                    : "The key could not be renamed.",
                )
              } finally {
                setSaving(false)
              }
            }}
          >
            Save name
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

/**
 * Putting a new secret in place of an old one.
 *
 * The new key is checked first, so a key the provider refuses leaves the old
 * one exactly as it was. The old secret stays until it is removed here, and
 * it stays live at the provider until it is revoked there.
 */
function ReplaceKeyDialog({
  open,
  info,
  held,
  onOpenChange,
  onReplaced,
}: {
  open: boolean
  info: ProviderKey | null
  held: boolean
  onOpenChange: (open: boolean) => void
  onReplaced: () => void
}) {
  const [value, setValue] = React.useState("")
  const [error, setError] = React.useState<string | null>(null)
  const [saving, setSaving] = React.useState(false)

  React.useEffect(() => {
    if (!open) return
    setValue("")
    setError(null)
  }, [open])

  const provider = info ? providerFor(info.provider) : undefined
  const probe = provider?.validation === "inference-probe"

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent size="sm">
        <DialogHeader>
          <DialogTitle>Replace key</DialogTitle>
          <DialogDescription>
            Put a new {provider?.label ?? "provider"} key in place of the one
            stored. The old one keeps working until you remove it, and it stays
            live at {provider?.label ?? "the provider"} until you revoke it
            there.
          </DialogDescription>
        </DialogHeader>

        <DialogBody>
          <Field>
            <div className="flex items-center gap-1">
              <FieldLabel htmlFor="replace-key">
                {provider?.label ?? "Provider"} API key
              </FieldLabel>
              <InfoHint label="About the key">
                The new key. It is checked before it is put in place, so a key
                the provider refuses leaves the old one exactly as it was.{" "}
                {held
                  ? "Tavi keeps it in this computer's credential store, never writes it to disk in plaintext, and never reads it back into the app."
                  : "Tavi keeps it on this computer's server, never sends it back to the browser, and never reads it back into the app."}
              </InfoHint>
            </div>
            <InputGroup>
              <InputGroupInput
                id="replace-key"
                type="password"
                autoComplete="off"
                autoCorrect="off"
                spellCheck={false}
                placeholder="Paste the new key"
                value={value}
                onChange={(event) => setValue(event.target.value)}
              />
              <InputGroupAddon align="inline-end">
                <InputGroupPasswordToggle />
              </InputGroupAddon>
            </InputGroup>
          </Field>

          {probe ? (
            <Alert appearance="soft" className="mt-4">
              <CircleHelpIcon />
              <AlertTitle>This one cannot be checked for free</AlertTitle>
              <AlertDescription>
                NVIDIA does not publish a key check, so Tavi cannot confirm this
                key without spending a request on a real inference.
              </AlertDescription>
            </Alert>
          ) : null}

          {error ? (
            <Alert variant="destructive" appearance="soft" className="mt-4">
              <TriangleAlertIcon />
              <AlertTitle>The key was not replaced</AlertTitle>
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          ) : null}
        </DialogBody>

        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
          >
            Cancel
          </Button>
          <Button
            type="button"
            loading={saving}
            disabled={!value.trim()}
            onClick={async () => {
              if (!info) return
              setSaving(true)
              setError(null)
              try {
                await replaceProviderKey(info.id, value.trim())
                setValue("")
                onOpenChange(false)
                onReplaced()
              } catch (problem) {
                setError(
                  problem instanceof Error
                    ? problem.message
                    : "The key could not be replaced.",
                )
              } finally {
                setSaving(false)
              }
            }}
          >
            Replace key
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

/**
 * Taking a key away.
 *
 * Removing the key stops the app reaching that provider, so it is asked for
 * rather than done. The question names the key, because "are you sure" on
 * its own does not say what is about to stop working.
 */
function RemoveKeyDialog({
  open,
  info,
  onOpenChange,
  onRemoved,
}: {
  open: boolean
  info: ProviderKey | null
  onOpenChange: (open: boolean) => void
  onRemoved: () => void
}) {
  const [error, setError] = React.useState<string | null>(null)

  React.useEffect(() => {
    if (!open) {
      return
    }
    setError(null)
  }, [open])

  const wasActive = info?.active

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Remove “{info?.name}”?</AlertDialogTitle>
          <AlertDialogDescription>
            The key is deleted from this computer&apos;s credential store. Tavi
            will not be able to reach {info?.providerLabel} with it
            {wasActive
              ? ", and this provider will have no key in use until another one is added"
              : ""}
            . Removing it here does not revoke it at {info?.providerLabel} —
            only {info?.providerLabel} can do that.
          </AlertDialogDescription>
        </AlertDialogHeader>

        {error ? (
          <Alert variant="destructive" appearance="soft">
            <TriangleAlertIcon />
            <AlertTitle>The key was not removed</AlertTitle>
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        ) : null}

        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction
            onClick={async () => {
              if (!info) {
                return
              }
              try {
                await removeProviderKey(info.id)
                onRemoved()
              } catch (problem) {
                setError(
                  problem instanceof Error
                    ? problem.message
                    : "The key could not be removed.",
                )
                /* Rethrown so the dialog stays open. A failed removal that
                   closed the dialog would look like a successful one. */
                throw problem
              }
            }}
          >
            Remove key
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
