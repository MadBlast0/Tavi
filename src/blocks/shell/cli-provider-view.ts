/**
 * What the CLI providers pane shows, and how it decides.
 *
 * The pane is mostly arrangement. The decisions — what matches a search,
 * what a filter keeps, what order the list is in, what a row says — are
 * here, where they can be read and checked without a screen.
 */

import type { CliProviderState } from "@/lib/cli-providers"

/** Which providers are being shown. */
export type CliFilter =
  | "all"
  | "installed"
  | "missing"
  | "enabled"
  | "disabled"
  | "attention"
  | "legacy"
  | "updates"
  | "limited"

/** The order the list is in. */
export type CliOrder = "name" | "installed" | "updates"

/** The filters, in the order they are offered. */
export const CLI_FILTERS: { value: CliFilter; label: string }[] = [
  { value: "all", label: "All" },
  { value: "installed", label: "Installed" },
  { value: "missing", label: "Not installed" },
  { value: "enabled", label: "Enabled" },
  { value: "disabled", label: "Disabled" },
  { value: "updates", label: "Updates available" },
  { value: "attention", label: "Needs attention" },
  { value: "legacy", label: "Legacy" },
  { value: "limited", label: "Unsupported or limited" },
]

/** The orders, in the order they are offered. */
export const CLI_ORDERS: { value: CliOrder; label: string }[] = [
  { value: "name", label: "By name" },
  { value: "installed", label: "Installed first" },
  { value: "updates", label: "Updates first" },
]

/**
 * Whether a provider wants the user's attention.
 *
 * A program that is installed and will not say what version it is is a
 * program that may be broken. So is one that is not the tool the app was
 * looking for, and one the app is offering that has since been removed.
 */
export const cliNeedsAttention = (state: CliProviderState): boolean => {
  if (state.problem) return true
  if (state.installed && state.versionError) return true
  if (state.enabled && !state.installed) return true
  return false
}

/**
 * Whether a provider is offered with limited support.
 *
 * Three things limit it: it is not published for this system, it is kept
 * working but not added to, and the app cannot run it. A provider that is
 * listed and cannot be used is shown as such rather than pretended into.
 */
export const cliLimited = (state: CliProviderState): boolean => {
  if (!state.supportedHere) return true
  if (state.maintenance === "legacy") return true
  if (!state.canRun) return true
  return false
}

/**
 * Whether a provider matches what the search box was given.
 *
 * The name, the id, what it is and where it was found are all searched, so
 * that typing a path or an executable's name finds the tool that owns it.
 *
 * The needle is trimmed and folded to lower case here, so that a search is
 * the same however it was typed — and so that a box with nothing in it finds
 * everything rather than nothing.
 */
export const cliMatches = (state: CliProviderState, needle: string): boolean => {
  const wanted = needle.trim().toLowerCase()
  if (!wanted) return true
  const haystack = [
    state.label,
    state.id,
    state.description,
    state.path ?? "",
    ...state.modes,
  ]
    .join(" ")
    .toLowerCase()
  return haystack.includes(wanted)
}

/** Whether a provider is kept by a filter. */
export const cliKept = (
  state: CliProviderState,
  filter: CliFilter,
): boolean => {
  switch (filter) {
    case "installed":
      return state.installed
    case "missing":
      return !state.installed
    case "enabled":
      return state.enabled
    case "disabled":
      return !state.enabled
    case "attention":
      return cliNeedsAttention(state)
    case "legacy":
      return state.maintenance === "legacy"
    case "updates":
      return state.updateState === "available"
    case "limited":
      return cliLimited(state)
    default:
      return true
  }
}

/** The list the pane shows: what was searched for, filtered, and ordered. */
export const cliVisible = (
  states: CliProviderState[],
  query: string,
  filter: CliFilter,
  order: CliOrder,
): CliProviderState[] => {
  const kept = states.filter(
    (state) => cliMatches(state, query) && cliKept(state, filter),
  )

  const sorted = [...kept]
  sorted.sort((a, b) => {
    if (order === "installed") {
      const difference = Number(b.installed) - Number(a.installed)
      if (difference !== 0) return difference
    }
    if (order === "updates") {
      const difference =
        Number(b.updateState === "available") -
        Number(a.updateState === "available")
      if (difference !== 0) return difference
    }
    return a.label.localeCompare(b.label)
  })
  return sorted
}

/** The counts the pane shows above the list. */
export const cliCounts = (states: CliProviderState[]) => {
  const installed = states.filter((state) => state.installed).length
  const enabled = states.filter((state) => state.enabled).length
  const updates = states.filter((state) => state.updateState === "available")
    .length
  const attention = states.filter(cliNeedsAttention).length
  return { known: states.length, installed, enabled, updates, attention }
}

/** The badge that says what state a provider is in. */
export const cliStanding = (
  state: CliProviderState,
): { label: string; tone: "default" | "destructive" | "muted" } => {
  if (state.problem) {
    return { label: "Not the right program", tone: "destructive" }
  }
  if (!state.installed) {
    return { label: "Not installed", tone: "muted" }
  }
  if (state.versionError) {
    return { label: "Version unknown", tone: "destructive" }
  }
  if (state.version) {
    return { label: state.version, tone: "default" }
  }
  return { label: "Installed", tone: "default" }
}

/** The line under the name: what it is, and where it is. */
export const cliDetail = (state: CliProviderState): string => {
  if (state.problem) return state.problem
  if (!state.installed) return state.description
  return `${state.description} · ${state.version ?? "installed"}`
}

/** What the update state is called, in words. */
export const cliUpdateLabel = (state: CliProviderState): string | null => {
  switch (state.updateState) {
    case "available":
      return state.latestVersion
        ? `Update to ${state.latestVersion} is available`
        : "An update is available"
    case "up-to-date":
      return "Up to date"
    case "external":
      return "Updated by whatever installed it"
    default:
      return null
  }
}

/**
 * Whether a provider is signed in, in words.
 *
 * A tool that signs in itself is reported as "may need sign-in" rather than
 * as signed out, because the app did not look and cannot say.
 */
export const readinessLabel = (state: CliProviderState): string | null => {
  switch (state.readiness) {
    case "ready":
      return "Signed in"
    case "signed-out":
      return "Not signed in"
    case "may-need-sign-in":
      return "May need sign-in"
    default:
      return null
  }
}
