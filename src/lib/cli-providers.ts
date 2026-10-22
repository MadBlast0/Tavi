/**
 * The CLI providers: programs on this machine that can answer a message.
 *
 * An API provider is an address and a key. A CLI provider is a program the
 * user has already installed — OpenCode, Claude Code, Codex and the rest —
 * and the app talks to it by starting it and reading what it says.
 *
 * The catalogue itself belongs to the desktop app, which is the only place
 * that can look at this machine. This file holds the shapes that come back
 * from it, and the little arithmetic that says which kind of provider an id
 * means.
 *
 * The two kinds of provider are told apart by the id. A CLI provider's id
 * carries a prefix, so one string says both what kind of provider it is and
 * which one it is — the composer has one place to read the choice from, and
 * the request has one field to carry it in.
 */

import { PROVIDERS } from "./providers.ts"

/** The prefix a CLI provider's id carries. */
export const CLI_PREFIX = "cli:"

/** How the app can talk to a CLI. */
export type CliMode = "protocol" | "structured" | "terminal"

/** Who owns a CLI's install. */
export type CliSource = "external" | "package-manager" | "unknown"

/** Whether a CLI is still being worked on. */
export type CliMaintenance = "active" | "legacy" | "unknown"

/** What the app knows about one CLI provider right now. */
export type CliProviderState = {
  /** The app's own id for it. */
  id: string
  /** The name the app shows. */
  label: string
  /** One line about what it is. */
  description: string
  /** Where it documents itself. */
  docsUrl: string
  /** Whether there is a program on this machine. */
  installed: boolean
  /** Where it was found. */
  path: string | null
  /** What it said its version was. */
  version: string | null
  /** Why the version is not known, when it is not. */
  versionError: string | null
  /** Who owns the install. */
  source: CliSource
  /** Whether the user has turned it on. */
  enabled: boolean
  /** How the app can talk to it. */
  modes: CliMode[]
  /** Whether it publishes a list of models. */
  models: boolean
  /** Whether it is still being worked on. */
  maintenance: CliMaintenance
  /** Whether the app can put it on this machine. */
  canInstall: boolean
  /** Whether the app can update it. */
  canUpdate: boolean
  /** Whether the app can remove it. */
  canUninstall: boolean
  /** Whether it may update itself without being asked. */
  autoUpdate: boolean
  /** Whether any provider may update itself without being asked. */
  autoUpdateAll: boolean
  /** The newest version the registry knows about. */
  latestVersion: string | null
  /**
   * Whether there is an update waiting.
   *
   * `unknown` is the honest answer for a tool the app cannot ask about, and
   * it is not the same as "up to date".
   */
  updateState: "unknown" | "up-to-date" | "available" | "external"
  /** A path the user has pointed at, when they have. */
  chosenPath: string | null
  /** When the app last looked. */
  lastScan: number | null
}

/** What a lifecycle operation is. */
export type CliLifecycleAction = "install" | "update" | "uninstall"

/** What the app can change about a CLI provider. */
export type CliProviderChanges = {
  /** Whether the user wants it offered. */
  enabled?: boolean
  /** Whether it may update itself without being asked. */
  autoUpdate?: boolean
  /** Whether any provider may update itself without being asked. */
  autoUpdateAll?: boolean
  /** A path the user has pointed at. */
  path?: string
}

/** The id a CLI provider is chosen by. */
export const cliProviderId = (id: string): string => `${CLI_PREFIX}${id}`

/** Whether this id names a CLI provider. */
export const isCliProviderId = (id: string): boolean => id.startsWith(CLI_PREFIX)

/** The CLI provider's own id, without the prefix. */
export const cliIdOf = (id: string): string =>
  isCliProviderId(id) ? id.slice(CLI_PREFIX.length) : id

/**
 * What a provider id names, whichever kind it is.
 *
 * The two kinds are told apart by the id, so one lookup answers for both, and
 * the composer does not have to ask which kind it is looking at before it
 * knows what to show.
 */
export const providerChoice = (
  id: string,
  cliProviders: CliProviderState[],
): { id: string; label: string } | undefined => {
  if (isCliProviderId(id)) {
    const wanted = cliIdOf(id)
    return cliProviders.find((state) => state.id === wanted)
  }
  return PROVIDERS.find((provider) => provider.id === id)
}
