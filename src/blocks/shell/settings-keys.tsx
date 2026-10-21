"use client"

import * as React from "react"
import {
  CircleCheckIcon,
  ClipboardPasteIcon,
  ExternalLinkIcon,
  KeyRoundIcon,
  PlusIcon,
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
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/empty"
import { Field, FieldDescription, FieldLabel } from "@/components/field"
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
  ItemMedia,
  ItemTitle,
} from "@/components/item"
import {
  NativeSelect,
  NativeSelectOption,
} from "@/components/native-select"
import { Skeleton } from "@/components/skeleton"
import { openExternal } from "@/lib/open-external"
import { PROVIDERS, providerFor } from "@/lib/providers"
import {
  clearApiKey,
  isKeyStoreAvailable,
  listApiKeys,
  saveApiKey,
  type ApiKeyInfo,
} from "@/lib/secret"
import { cn } from "@/lib/utils"

/**
 * Credits, as the provider reports them.
 *
 * Only one provider reports a limit at all, so this is used in one place and
 * the other rows say nothing about money.
 */
const MONEY = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  maximumFractionDigits: 2,
})

/** What the pane says about the keys, on the desktop. */
const DESKTOP_NOTE =
  "A key lets Tavi reach a provider as you. Each one is kept in this computer's credential store, and none of them is ever read back into the app. A development build also reads a key from .env.local, so a key can be given to the app without being pasted in."

/** What the pane says about the keys, in a browser. */
const WEB_NOTE =
  "A key lets Tavi reach a provider as you. Each one is kept by this computer's server, and none of them is ever read back into the app. A key in the environment the server was started with — the .env.local file in development — is used too, and cannot be changed from here."

/**
 * The API keys pane.
 *
 * A list, one row per provider that has a key, and nothing else. The key
 * itself is never shown — it is never read back out of where it is kept, and
 * never reaches this code at all — so a row can say whether the provider
 * accepts it and whose key it is, and can put a new one in or take the old one
 * away, and can do nothing else with it.
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
  const held = isKeyStoreAvailable()

  const [keys, setKeys] = React.useState<ApiKeyInfo[] | null>(null)
  const [addOpen, setAddOpen] = React.useState(false)
  const [editing, setEditing] = React.useState<string | null>(null)
  const [removing, setRemoving] = React.useState<ApiKeyInfo | null>(null)
  const [removingOpen, setRemovingOpen] = React.useState(false)

  const load = React.useCallback(async () => {
    try {
      setKeys(await listApiKeys())
    } catch {
      /* The list could not be read. Nothing is claimed about what is stored. */
      setKeys([])
    }
  }, [])

  React.useEffect(() => {
    void load()
  }, [load])

  const stored = (keys ?? []).filter((key) => key.stored)

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-start justify-between gap-x-6 gap-y-3">
        <div className="min-w-0">
          <h2
            className={cn(
              "flex items-center gap-2 text-base leading-snug font-semibold text-pretty",
              tall && "sr-only"
            )}
          >
            {label}
            {keys === null ? null : (
              <Badge appearance="muted" shape="pill" size="sm">
                {stored.length}
              </Badge>
            )}
          </h2>
          <p
            className={cn(
              "max-w-prose text-sm text-pretty text-muted-foreground",
              !tall && "mt-1"
            )}
          >
            {held ? DESKTOP_NOTE : WEB_NOTE}
          </p>
        </div>

        <Button type="button" size="sm" onClick={() => setAddOpen(true)}>
          <PlusIcon className="size-4" />
          Add key
        </Button>
      </div>

      {keys === null ? (
        <SkeletonRows />
      ) : stored.length === 0 ? (
        <EmptyKeys onAdd={() => setAddOpen(true)} />
      ) : (
        <div className="flex flex-col">
          {stored.map((key) => (
            <KeyRow
              key={key.provider}
              info={key}
              onEdit={() => setEditing(key.provider)}
              onRemove={() => {
                setRemoving(key)
                setRemovingOpen(true)
              }}
            />
          ))}
        </div>
      )}

      <KeyDialog
        open={addOpen || editing !== null}
        onOpenChange={(open) => {
          setAddOpen(open)
          if (!open) {
            setEditing(null)
          }
        }}
        provider={editing ?? undefined}
        keys={keys ?? []}
        held={held}
        onSaved={() => void load()}
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
 * One provider's key.
 *
 * Two lines: which provider it is for, and what that provider says about it.
 * The status is a badge rather than a word in the sentence, because it is the
 * one thing about a key that decides whether it can be used, and it should be
 * the same shape on every row so the eye can run down the column.
 */
function KeyRow({
  info,
  onEdit,
  onRemove,
}: {
  info: ApiKeyInfo
  onEdit: () => void
  onRemove: () => void
}) {
  return (
    <Item size="sm" className="border-b last:border-b-0">
      <ItemMedia variant="icon">
        <KeyRoundIcon />
      </ItemMedia>

      <ItemContent>
        <ItemTitle>{info.label}</ItemTitle>
        <ItemDescription>{detail(info)}</ItemDescription>
      </ItemContent>

      <ItemActions>
        <Badge
          variant={info.valid === false ? "destructive" : "default"}
          appearance="outline"
          size="sm"
        >
          {info.valid === false ? (
            <>
              <TriangleAlertIcon />
              Not accepted
            </>
          ) : info.valid === true ? (
            <>
              <CircleCheckIcon />
              Accepted
            </>
          ) : (
            "Not checked"
          )}
        </Badge>

        {/* A key that is not in the store is not in the store: there is
            nothing here to edit or to take away. The buttons would write a
            second key somewhere else and leave the one in use unchanged,
            which is worse than not offering them. */}
        {isElsewhere(info) ? null : (
          <>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={onEdit}
            >
              Edit
            </Button>
            <Button
              type="button"
              variant="ghost-destructive"
              size="sm"
              onClick={onRemove}
            >
              <Trash2Icon className="size-4" />
              Remove
            </Button>
          </>
        )}
      </ItemActions>
    </Item>
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
const isElsewhere = (info: ApiKeyInfo) =>
  info.source === "dev-file" || info.source === "env"

/** What is said about a key that is somewhere else. */
const SOURCE_NOTE: Record<string, string> = {
  "dev-file": "From .env.local, for development",
  env: "From the environment this server was started with",
}

/**
 * What a provider says about its key, in one line.
 *
 * The account name is the provider's own — the label OpenRouter puts on a
 * key — and it is already masked by the provider. Nothing here is the key.
 */
function detail(info: ApiKeyInfo): string {
  const parts: string[] = []

  /* Where the key came from is said first, because it decides what can be
     done with it: a key that is elsewhere is edited where it is. */
  if (info.source && info.source !== "store") {
    parts.push(SOURCE_NOTE[info.source] ?? "From somewhere else")
  }

  if (info.valid === false) {
    parts.push(info.reason ?? "The provider did not accept this key.")
    return parts.join(" · ")
  }
  if (info.valid !== true) {
    parts.push(
      "The provider could not be reached, so this key's standing is unknown.",
    )
    return parts.join(" · ")
  }

  if (info.account) {
    parts.push(`Signed in as “${info.account}”`)
  }
  if (info.isFreeTier) {
    parts.push("Free tier")
  }
  if (info.limit != null && info.usage != null) {
    parts.push(`${MONEY.format(info.usage)} of ${MONEY.format(info.limit)} used`)
  }
  if (parts.length === 0) {
    parts.push("The provider accepts this key.")
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
 * Adding a key, or putting a new one in place of an old one.
 *
 * The provider is chosen first and the key is entered for it, because a key
 * means nothing without the provider it belongs to. The value is held in
 * component state only long enough to submit, then cleared — it is never
 * mirrored into storage and never rendered back after a save.
 */
function KeyDialog({
  open,
  onOpenChange,
  provider: fixed,
  keys,
  held,
  onSaved,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** The provider being edited. Undefined when a key is being added. */
  provider?: string
  /** What is already stored, so the picker can say which are taken. */
  keys: ApiKeyInfo[]
  /** Whether the keys are kept in this computer's credential store. */
  held: boolean
  onSaved: () => void
}) {
  const [chosen, setChosen] = React.useState("")
  const [value, setValue] = React.useState("")
  const [error, setError] = React.useState<string | null>(null)
  const [saving, setSaving] = React.useState(false)
  const formRef = React.useRef<HTMLFormElement>(null)

  const taken = new Set(keys.filter((key) => key.stored).map((key) => key.provider))

  /* The provider a key is added for: the one being edited, or else the first
     provider that has no key yet. */
  const fallback =
    PROVIDERS.find((provider) => !taken.has(provider.id))?.id ?? PROVIDERS[0].id

  React.useEffect(() => {
    if (!open) {
      return
    }
    setChosen(fixed ?? fallback)
    setValue("")
    setError(null)
  }, [open, fixed, fallback])

  const provider = providerFor(chosen)
  const editing = fixed !== undefined

  const store = async () => {
    const key = value.trim()
    if (!key || !provider) {
      return
    }
    setSaving(true)
    setError(null)
    try {
      await saveApiKey(provider.id, key)
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
      }
    } catch (problem) {
      setError(
        problem instanceof Error
          ? problem.message
          : "The clipboard could not be read. Paste the key into the field instead.",
      )
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent size="sm">
        <DialogHeader>
          <DialogTitle>{editing ? "Edit API key" : "Add API key"}</DialogTitle>
          <DialogDescription>
            {editing
              ? `Put a new ${provider?.label ?? "provider"} key in place of the one stored. The old one is overwritten in the credential store.`
              : "Choose a provider, then paste the key you already have for it."}
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
              <FieldLabel htmlFor="key-provider">Provider</FieldLabel>
              <div className="flex items-center gap-2">
                <NativeSelect
                  id="key-provider"
                  size="default"
                  className="min-w-0 flex-1"
                  value={chosen}
                  disabled={editing}
                  onChange={(event) => setChosen(event.target.value)}
                >
                  {PROVIDERS.map((option) => (
                    <NativeSelectOption key={option.id} value={option.id}>
                      {option.label}
                      {taken.has(option.id) ? " — already has a key" : ""}
                    </NativeSelectOption>
                  ))}
                </NativeSelect>
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
              <FieldLabel htmlFor="provider-api-key">
                {provider?.label ?? "Provider"} API key
              </FieldLabel>
              <InputGroup>
                <InputGroupInput
                  id="provider-api-key"
                  type="password"
                  autoComplete="off"
                  autoCorrect="off"
                  spellCheck={false}
                  placeholder="Paste the key"
                  value={value}
                  onChange={(event) => setValue(event.target.value)}
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
              <FieldDescription>
                {held
                  ? "Kept in this computer's credential store. It is never written to disk in plaintext, and it is never read back into the app."
                  : "Kept by this computer's server. It is never sent back to the browser, and it is never read back into the app."}
              </FieldDescription>
            </Field>

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
 * Taking a key out.
 *
 * Removing the key stops the app reaching that provider, so it is asked for
 * rather than done. The question names the provider, because "are you sure"
 * on its own does not say what is about to stop working.
 */
function RemoveKeyDialog({
  open,
  info,
  onOpenChange,
  onRemoved,
}: {
  open: boolean
  /** The key being taken out. It stays while the dialog closes, so the
   *  question keeps naming the provider it is about. */
  info: ApiKeyInfo | null
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

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Remove the {info?.label} key?</AlertDialogTitle>
          <AlertDialogDescription>
            The key is deleted from this computer&apos;s credential store. Tavi
            will not be able to reach {info?.label} until another one is added.
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
                await clearApiKey(info.provider)
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
