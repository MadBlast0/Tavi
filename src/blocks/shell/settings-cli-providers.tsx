"use client"

import * as React from "react"
import {
  CircleCheckIcon,
  CircleHelpIcon,
  ExternalLinkIcon,
  FolderOpenIcon,
  InfoIcon,
  MoreHorizontalIcon,
  PackageIcon,
  RefreshCwIcon,
  SquareIcon,
  TerminalIcon,
  TriangleAlertIcon,
} from "lucide-react"

import { Badge } from "@/components/badge"
import { Button } from "@/components/button"
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
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/empty"
import { InfoHint } from "@/components/info-hint"
import { InputGroup, InputGroupAddon, InputGroupInput } from "@/components/input-group"
import {
  Item,
  ItemActions,
  ItemContent,
  ItemDescription,
  ItemGroup,
  ItemMedia,
  ItemTitle,
} from "@/components/item"
import { ProviderLogo } from "@/components/provider-logo"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/select"
import { SettingRow } from "@/components/setting-row"
import { Skeleton } from "@/components/skeleton"
import { Spinner } from "@/components/spinner"
import { Switch } from "@/components/switch"
import {
  cancelCliLifecycle,
  chooseCliProgram,
  listCliProviders,
  openExternal,
  runCliLifecycle,
  scanCliProviders,
  setCliProviderState,
  type CliLifecycleAction,
  type CliProviderState,
} from "@/lib/api"
import { isDesktopApp } from "@/lib/platform"
import {
  CLI_FILTERS,
  CLI_ORDERS,
  cliCounts,
  cliDetail,
  cliStanding,
  cliUpdateLabel,
  cliVisible,
  readinessLabel,
  type CliFilter,
  type CliOrder,
} from "./cli-provider-view"
import { cn } from "@/lib/utils"

/**
 * The CLI providers pane.
 *
 * A CLI provider is a program on this computer — OpenCode, Claude Code,
 * Codex and the rest — that the app starts and reads. The list is every one
 * the app knows about, whether or not it is installed, because a tool that is
 * missing from the list is a tool the app does not know exists.
 *
 * Three things are kept apart, and the row shows all three:
 *
 * - **is it installed** — a program on this machine;
 * - **is it enabled** — whether the user wants the app to offer it;
 * - **is it up to date** — whether the registry has something newer.
 *
 * Turning one off never removes it. A program that is installed and turned
 * off is still installed, and the row still says where it is.
 *
 * The row carries one visible action and a menu. The action is the obvious
 * next thing — install it, or update it — and everything else is in the
 * menu, because a row of six buttons is a row nobody reads.
 */

/** The pane's own inset. The `Item` component insets its own content. */
const PANE_INSET = { "--item-px": "0px" } as React.CSSProperties

/** What the pane says about the providers, in a browser. */
export const WEB_NOTE =
  "CLI providers are programs on this computer. Open the desktop app to use them."

/* -------------------------------------------------------------------------- */
/* The pane                                                                    */
/* -------------------------------------------------------------------------- */

/**
 * The pane, without the fetching.
 *
 * The list is drawn here, from the states it is given. The container above
 * it fetches them and holds the dialogs; nothing in this component knows
 * where a state came from, which is what lets the same screen be drawn for
 * the app and for the website — and what lets a test draw it with no
 * network at all.
 */
export type CliProviderPaneProps = {
  /** The providers, as they are known. */
  states: CliProviderState[]
  /** The section's own name, from the settings registry. */
  label: string
  /** Whether the card is in its narrow shape. */
  tall: boolean
  /** Whether the providers are still being read. */
  loading: boolean
  /** The provider an operation is running on, if one is. */
  busy: string | null
  /** Whether any provider may update itself without being asked. */
  autoUpdateAll: boolean
  /** The person asked to look again. */
  onRescan: () => void
  /** The person turned a provider on or off. */
  onToggle: (state: CliProviderState, enabled: boolean) => void
  /** The person asked for any provider to update itself. */
  onAutoUpdateAll: (enabled: boolean) => void
  /** The person asked to install, update or remove a provider. */
  onLifecycle: (
    state: CliProviderState,
    action: CliLifecycleAction,
  ) => void
  /** The person asked to stop the operation that is running. */
  onCancel: () => void
  /** The person asked to see a provider's details. */
  onDetails: (state: CliProviderState) => void
}

export function CliProviderPane({
  states,
  label,
  tall,
  loading,
  busy,
  autoUpdateAll,
  onRescan,
  onToggle,
  onAutoUpdateAll,
  onLifecycle,
  onCancel,
  onDetails,
}: CliProviderPaneProps) {
  const [query, setQuery] = React.useState("")
  const [filter, setFilter] = React.useState<CliFilter>("all")
  const [order, setOrder] = React.useState<CliOrder>("name")

  const shown = React.useMemo(
    () => cliVisible(states, query, filter, order),
    [states, query, filter, order],
  )

  /* The counts are of everything, not of what the search left. A number that
     changes as the user types is a number nobody can act on. */
  const counts = React.useMemo(() => cliCounts(states), [states])

  return (
    <div className="flex flex-col gap-6">
      {/* The heading and the action are siblings on the first line, so the
          button's centre and the heading's centre are the same height. */}
      <div className="flex flex-col gap-1">
        <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-3">
          <div className="flex items-center gap-1">
            <h2
              className={cn(
                "flex items-center gap-2 text-base leading-snug font-semibold text-pretty",
                tall && "sr-only",
              )}
            >
              {label}
              {/* The count is of what this build can see, and a browser
                  cannot see any of them — so the browser shows no count
                  rather than a count of nothing. */}
              {loading || !isDesktopApp() ? null : (
                <Badge appearance="muted" shape="pill" size="sm">
                  {counts.known}
                </Badge>
              )}
            </h2>
            <InfoHint label={`About ${label.toLowerCase()}`}>
              A CLI provider is a program on this computer, not a service
              somewhere else. Tavi starts it, reads what it says, and shows it
              in the same thread as an API provider. The program keeps its own
              account, its own keys and its own configuration — Tavi never
              asks for them, and never sees them.
            </InfoHint>
          </div>

          {isDesktopApp() ? (
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={onRescan}
              disabled={loading || busy !== null}
            >
              <RefreshCwIcon className="size-4" />
              Look again
            </Button>
          ) : null}
        </div>

        {!isDesktopApp() ? (
          <p className="max-w-prose text-sm text-pretty text-muted-foreground">
            {WEB_NOTE}
          </p>
        ) : null}
      </div>

      {/* A browser cannot see this computer's programs, so it is shown
          nothing at all rather than a list of nothing. A count of zero
          would be a claim — that there are no CLI providers anywhere — and
          the app knows of nineteen. */}
      {!isDesktopApp() ? null : (
        <>
          {/* Whether any provider may update itself without being asked.
              It is off until it is turned on, and it only ever applies to a
              provider the app installed itself. */}
          <SettingRow
            label="Update providers automatically"
            description="Only for a provider Tavi installed. One somebody else installed is left to whoever installed it."
          >
            <Switch
              size="sm"
              checked={autoUpdateAll}
              disabled={busy !== null}
              onCheckedChange={(checked) => onAutoUpdateAll(checked)}
              aria-label="Let providers update themselves"
            />
          </SettingRow>

          {/* The search, the filter and the order share a row, because they
              are three ways of looking at the same list and are used
              together. */}
          <div className="flex flex-wrap items-center gap-2">
            <InputGroup size="sm" className="min-w-48 flex-1">
              <InputGroupAddon>
                <PackageIcon />
              </InputGroupAddon>
              <InputGroupInput
                aria-label="Search CLI providers"
                placeholder="Search"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
              />
            </InputGroup>

            <Select
              value={filter}
              onValueChange={(value) => setFilter(value as CliFilter)}
            >
              <SelectTrigger size="sm" aria-label="Filter CLI providers">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {CLI_FILTERS.map((entry) => (
                  <SelectItem key={entry.value} value={entry.value}>
                    {entry.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Select
              value={order}
              onValueChange={(value) => setOrder(value as CliOrder)}
            >
              <SelectTrigger size="sm" aria-label="Order CLI providers">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {CLI_ORDERS.map((entry) => (
                  <SelectItem key={entry.value} value={entry.value}>
                    {entry.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* The counts. They are of everything, so they do not move as the
              search narrows the list. */}
          <p className="text-xs text-muted-foreground">
            {counts.known} known · {counts.installed} installed · {counts.enabled}{" "}
            enabled
            {counts.updates > 0 ? ` · ${counts.updates} with an update` : ""}
            {counts.attention > 0
              ? ` · ${counts.attention} need attention`
              : ""}
          </p>
        </>
      )}
      {loading ? (
        <CliSkeleton />
      ) : !isDesktopApp() ? null : shown.length === 0 ? (
        <CliEmpty query={query} filter={filter} />
      ) : (
        <ItemGroup variant="default">
          {shown.map((state) => (
            <CliProviderRow
              key={state.id}
              state={state}
              busy={busy === state.id}
              onToggle={onToggle}
              onLifecycle={onLifecycle}
              onCancel={onCancel}
              onDetails={onDetails}
            />
          ))}
        </ItemGroup>
      )}
    </div>
  )
}

/* -------------------------------------------------------------------------- */
/* A row                                                                       */
/* -------------------------------------------------------------------------- */

function CliProviderRow({
  state,
  busy,
  onToggle,
  onLifecycle,
  onCancel,
  onDetails,
}: {
  state: CliProviderState
  busy: boolean
  onToggle: (state: CliProviderState, enabled: boolean) => void
  onLifecycle: (state: CliProviderState, action: CliLifecycleAction) => void
  onCancel: () => void
  onDetails: (state: CliProviderState) => void
}) {
  const standing = cliStanding(state)
  const update = cliUpdateLabel(state)
  const readiness = readinessLabel(state)

  /* The one visible action. A tool that is not here yet is installed; one
     that is here and can be updated is updated. A tool the app cannot
     install or update has no action of its own, and says so in the menu
     instead. */
  const mainAction: { label: string; action: CliLifecycleAction } | null =
    !state.installed && state.canInstall
      ? { label: "Install", action: "install" }
      : state.installed && state.canUpdate
        ? { label: "Update", action: "update" }
        : null

  return (
    <Item size="sm" className="border-b last:border-b-0" style={PANE_INSET}>
      <ItemMedia variant="icon">
        <ProviderLogo
          provider={state.id}
          providerLabel={state.label}
          className="size-5"
        />
      </ItemMedia>

      <ItemContent>
        <ItemTitle>
          {state.label}
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
            ) : standing.label === "Not installed" ? (
              standing.label
            ) : (
              <>
                <CircleCheckIcon />
                {standing.label}
              </>
            )}
          </Badge>
          {state.maintenance === "legacy" ? (
            <Badge appearance="muted" shape="pill" size="sm">
              Legacy
            </Badge>
          ) : null}
        </ItemTitle>

        <ItemDescription>{cliDetail(state)}</ItemDescription>

        {/* Where it is, and what the app can do with it. The path is how a
            person finds the program, and the modes are what the app knows
            it can do. */}
        <p className="mt-1 truncate text-xs text-muted-foreground">
          {state.path ? state.path : state.description}
        </p>

        <div className="mt-1 flex flex-wrap items-center gap-1">
          {state.modes.map((mode) => (
            <Badge key={mode} appearance="muted" shape="pill" size="sm">
              {mode}
            </Badge>
          ))}
          {readiness ? (
            <Badge appearance="muted" shape="pill" size="sm">
              {readiness}
            </Badge>
          ) : null}
          {state.supportedHere ? null : (
            <Badge variant="destructive" appearance="outline" size="sm">
              {state.unsupportedReason ?? "Not for this system"}
            </Badge>
          )}
        </div>

        {update ? (
          <p
            className={cn(
              "mt-1 text-xs",
              state.updateState === "available"
                ? "text-foreground"
                : "text-muted-foreground",
            )}
          >
            {update}
          </p>
        ) : null}
      </ItemContent>

      <ItemActions>
        {busy ? (
          <>
            <Spinner className="size-4" />
            <Button
              type="button"
              size="xs"
              variant="ghost"
              onClick={onCancel}
              aria-label={`Stop the operation on ${state.label}`}
            >
              <SquareIcon className="size-4" />
              Stop
            </Button>
          </>
        ) : null}

        {/* Whether the app offers it. This is the control that is used most,
            so it is on the row rather than in the menu. */}
        <Switch
          size="sm"
          checked={state.enabled}
          onCheckedChange={(checked) => onToggle(state, checked)}
          aria-label={`Offer ${state.label} in the composer`}
        />

        {mainAction ? (
          <Button
            type="button"
            size="xs"
            variant="outline"
            disabled={busy}
            onClick={() => onLifecycle(state, mainAction.action)}
          >
            {mainAction.label}
          </Button>
        ) : null}

        <DropdownMenu>
          <DropdownMenuTrigger
            render={
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                aria-label={`Actions for ${state.label}`}
              />
            }
          >
            <MoreHorizontalIcon className="size-4" />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onClick={() => onDetails(state)}>
              <InfoIcon />
              Details
            </DropdownMenuItem>

            {state.installed && state.canUpdate ? (
              <DropdownMenuItem
                disabled={busy}
                onClick={() => onLifecycle(state, "update")}
              >
                <RefreshCwIcon />
                Update
              </DropdownMenuItem>
            ) : null}

            {state.installed && state.canUninstall ? (
              <DropdownMenuItem
                disabled={busy}
                onClick={() => onLifecycle(state, "uninstall")}
              >
                <PackageIcon />
                Uninstall
              </DropdownMenuItem>
            ) : null}

            {!state.installed && !state.canInstall ? (
              <DropdownMenuItem disabled>
                <CircleHelpIcon />
                Install it yourself
              </DropdownMenuItem>
            ) : null}

            <DropdownMenuSeparator />

            <DropdownMenuItem
              onClick={() => void openExternal(state.docsUrl)}
            >
              <ExternalLinkIcon />
              Documentation
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </ItemActions>
    </Item>
  )
}

/* -------------------------------------------------------------------------- */
/* The confirmation                                                             */
/* -------------------------------------------------------------------------- */

/**
 * What is about to happen, said before it happens.
 *
 * Installing software and removing it are the two things the app does that
 * change the machine, so both are asked about first. The question says what
 * will happen, in words, and what will be left behind — because "are you
 * sure?" on its own says nothing about what is about to be done.
 */
function CliConfirm({
  state,
  action,
  onClose,
  onConfirm,
}: {
  state: CliProviderState
  action: CliLifecycleAction
  onClose: () => void
  onConfirm: () => void
}) {
  const title =
    action === "install"
      ? `Install ${state.label}?`
      : action === "update"
        ? `Update ${state.label}?`
        : `Remove ${state.label}?`

  const description =
    action === "install"
      ? `Tavi will install ${state.label} with the package manager it is published on. It will be left switched off until you turn it on.`
      : action === "update"
        ? `Tavi will update ${state.label} to the newest version the package manager has.`
        : `Tavi will remove ${state.label} with the package manager it was installed with. Your projects, your settings and your account are not touched.`

  return (
    <AlertDialog open onOpenChange={(open) => (open ? null : onClose())}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{title}</AlertDialogTitle>
          <AlertDialogDescription>{description}</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction onClick={onConfirm}>
            {action === "install"
              ? "Install"
              : action === "update"
                ? "Update"
                : "Remove"}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}

/* -------------------------------------------------------------------------- */
/* The empties                                                                 */
/* -------------------------------------------------------------------------- */

function CliSkeleton() {
  return (
    <div className="flex flex-col gap-3">
      {[0, 1, 2, 3].map((row) => (
        <div key={row} className="flex items-center gap-3">
          <Skeleton className="size-5 rounded-md" />
          <Skeleton className="h-4 w-40" />
          <Skeleton className="ml-auto h-4 w-16" />
        </div>
      ))}
    </div>
  )
}

function CliEmpty({ query, filter }: { query: string; filter: CliFilter }) {
  const searching = query.trim() !== ""
  return (
    <Empty>
      <EmptyHeader>
        <EmptyMedia>
          <TerminalIcon />
        </EmptyMedia>
        <EmptyTitle>
          {searching ? "Nothing matches that" : "Nothing to show"}
        </EmptyTitle>
        <EmptyDescription>
          {searching
            ? "No CLI provider matches what you typed."
            : filter === "all"
              ? "There are no CLI providers to show."
              : "No CLI provider is in this state."}
        </EmptyDescription>
      </EmptyHeader>
      {!searching && filter !== "all" ? (
        <EmptyContent>
          <p className="text-xs text-muted-foreground">
            Change the filter to see the rest.
          </p>
        </EmptyContent>
      ) : null}
    </Empty>
  )
}

/* -------------------------------------------------------------------------- */
/* The container                                                               */
/* -------------------------------------------------------------------------- */

/**
 * The pane, with the fetching and the dialogs.
 *
 * Everything that changes something goes through the app's own seam, so the
 * program is started on the other side of the boundary and nothing about it
 * is ever in this side's hands.
 */
export function CliProvidersSettings({
  label,
  tall,
}: {
  label: string
  tall: boolean
}) {
  const [states, setStates] = React.useState<CliProviderState[]>([])
  const [loading, setLoading] = React.useState(true)
  const [busy, setBusy] = React.useState<string | null>(null)
  const [details, setDetails] = React.useState<CliProviderState | null>(null)
  const [problem, setProblem] = React.useState<string | null>(null)
  /* The operation that is about to happen, once it has been agreed to. */
  const [pending, setPending] = React.useState<{
    state: CliProviderState
    action: CliLifecycleAction
  } | null>(null)

  const read = React.useCallback(async () => {
    try {
      setStates(await listCliProviders())
      setProblem(null)
    } catch (error) {
      setProblem(
        error instanceof Error ? error.message : "The CLI providers could not be read.",
      )
    } finally {
      setLoading(false)
    }
  }, [])

  React.useEffect(() => {
    void read()
  }, [read])

  const rescan = async () => {
    setLoading(true)
    try {
      setStates(await scanCliProviders())
      setProblem(null)
    } catch (error) {
      setProblem(
        error instanceof Error ? error.message : "They could not be looked for.",
      )
    } finally {
      setLoading(false)
    }
  }

  const toggle = async (state: CliProviderState, enabled: boolean) => {
    try {
      setStates(await setCliProviderState(state.id, { enabled }))
    } catch (error) {
      setProblem(
        error instanceof Error ? error.message : "That could not be changed.",
      )
    }
  }

  const autoUpdateAll = async (enabled: boolean) => {
    try {
      setStates(await setCliProviderState("any", { autoUpdateAll: enabled }))
    } catch (error) {
      setProblem(
        error instanceof Error ? error.message : "That could not be changed.",
      )
    }
  }

  const lifecycle = async (
    state: CliProviderState,
    action: CliLifecycleAction,
  ) => {
    setBusy(state.id)
    setProblem(null)
    try {
      await runCliLifecycle(state.id, action)
      setStates(await listCliProviders())
    } catch (error) {
      setProblem(
        error instanceof Error ? error.message : "That could not be done.",
      )
    } finally {
      setBusy(null)
    }
  }

  const stop = async () => {
    try {
      await cancelCliLifecycle()
    } catch {
      /* The operation is stopping either way. */
    }
  }

  return (
    <>
      <CliProviderPane
        states={states}
        label={label}
        tall={tall}
        loading={loading}
        busy={busy}
        autoUpdateAll={states.some((state) => state.autoUpdateAll)}
        onRescan={() => void rescan()}
        onToggle={(state, enabled) => void toggle(state, enabled)}
        onAutoUpdateAll={(enabled) => void autoUpdateAll(enabled)}
        onLifecycle={(state, action) => setPending({ state, action })}
        onCancel={() => void stop()}
        onDetails={setDetails}
      />

      {pending ? (
        <CliConfirm
          state={pending.state}
          action={pending.action}
          onClose={() => setPending(null)}
          onConfirm={() => {
            const { state, action } = pending
            setPending(null)
            void lifecycle(state, action)
          }}
        />
      ) : null}

      {problem ? (
        <p className="text-sm text-destructive">{problem}</p>
      ) : null}

      {details ? (
        <CliProviderDetails
          state={details}
          onClose={() => setDetails(null)}
          onChanged={(next) => {
            setStates(next)
            setDetails(
              next.find((state) => state.id === details.id) ?? details,
            )
          }}
        />
      ) : null}
    </>
  )
}

/* -------------------------------------------------------------------------- */
/* The details                                                                 */
/* -------------------------------------------------------------------------- */

/**
 * What the app knows about one provider, in full.
 *
 * The row says the state in a line. This says the rest: where the program
 * is, who installed it, how the app can talk to it, and what the app can do
 * about it.
 */
function CliProviderDetails({
  state,
  onClose,
  onChanged,
}: {
  state: CliProviderState
  onClose: () => void
  onChanged: (states: CliProviderState[]) => void
}) {
  const [busy, setBusy] = React.useState(false)
  const [problem, setProblem] = React.useState<string | null>(null)

  const change = async (changes: Parameters<typeof setCliProviderState>[1]) => {
    setBusy(true)
    try {
      onChanged(await setCliProviderState(state.id, changes))
      setProblem(null)
    } catch (error) {
      setProblem(
        error instanceof Error ? error.message : "That could not be changed.",
      )
    } finally {
      setBusy(false)
    }
  }

  /* A program the app could not find can be pointed at by hand. */
  const choose = async () => {
    const path = await chooseCliProgram()
    if (!path) return
    await change({ path })
  }

  return (
    <Dialog open onOpenChange={(open) => (open ? null : onClose())}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{state.label}</DialogTitle>
          <DialogDescription>{state.description}</DialogDescription>
        </DialogHeader>
        <DialogBody>
          <div className="flex flex-col">
            <SettingRow
              label="Where it is"
              description="A program the app could not find can be pointed at by hand."
            >
              <div className="flex items-center gap-2">
                <p className="max-w-48 truncate text-sm text-muted-foreground">
                  {state.path ?? "Not installed"}
                </p>
                <Button
                  type="button"
                  size="xs"
                  variant="outline"
                  disabled={busy}
                  onClick={() => void choose()}
                >
                  <FolderOpenIcon className="size-4" />
                  Choose
                </Button>
              </div>
            </SettingRow>

            <SettingRow label="Version">
              <p className="text-sm text-muted-foreground">
                {state.version ?? "Unknown"}
                {state.latestVersion ? ` · newest is ${state.latestVersion}` : ""}
              </p>
            </SettingRow>

            <SettingRow label="Signed in">
              <p className="text-sm text-muted-foreground">
                {readinessLabel(state) ?? "Nobody has said"}
              </p>
            </SettingRow>

            <SettingRow label="Published for">
              <p className="text-sm text-muted-foreground">
                {state.platforms.join(", ")}
                {state.supportedHere
                  ? ""
                  : " · not for this system"}
              </p>
            </SettingRow>

            <SettingRow label="Who installed it">
              <p className="text-sm text-muted-foreground">
                {state.source === "package-manager"
                  ? "A package manager"
                  : state.source === "external"
                    ? "Somebody else"
                    : "Nobody has said"}
              </p>
            </SettingRow>

            <SettingRow
              label="How Tavi talks to it"
              description="A protocol is a structured conversation, a structured mode is a machine-readable answer, and a terminal is a program that needs one."
            >
              <p className="text-sm text-muted-foreground">
                {state.modes.join(", ")}
              </p>
            </SettingRow>

            <SettingRow
              label="Update itself"
              description="Only for a program Tavi installed. A program somebody else installed is left to whoever installed it."
            >
              <Switch
                size="sm"
                checked={state.autoUpdate}
                disabled={busy || !state.installed}
                onCheckedChange={(checked) => void change({ autoUpdate: checked })}
                aria-label={`Let ${state.label} update itself`}
              />
            </SettingRow>

            <SettingRow
              label="Offer it in the composer"
              description="Turning this off leaves the program where it is. It is not removed."
            >
              <Switch
                size="sm"
                checked={state.enabled}
                disabled={busy}
                onCheckedChange={(checked) => void change({ enabled: checked })}
                aria-label={`Offer ${state.label} in the composer`}
              />
            </SettingRow>
          </div>

          {problem ? (
            <p className="text-sm text-destructive">{problem}</p>
          ) : null}
        </DialogBody>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={onClose}>
            Close
          </Button>
          <Button
            type="button"
            variant="ghost"
            onClick={() => void openExternal(state.docsUrl)}
          >
            <ExternalLinkIcon className="size-4" />
            Documentation
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
