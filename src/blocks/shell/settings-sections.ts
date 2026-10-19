import type { ComponentType } from "react"
import {
  BrainIcon,
  BoxesIcon,
  CircleUserRoundIcon,
  CodeXmlIcon,
  ComponentIcon,
  CreditCardIcon,
  Grid2x2Icon,
  KeyRoundIcon,
  MonitorIcon,
  PlugIcon,
  PuzzleIcon,
  SettingsIcon,
  ShieldCheckIcon,
  SunriseIcon,
  TimerIcon,
  WrenchIcon,
} from "lucide-react"

export type SettingsEntry = {
  id: string
  label: string
  icon: ComponentType<{ className?: string }>
}

export type SettingsGroup = {
  id: string
  label: string
  entries: SettingsEntry[]
}

/**
 * What the settings card lists.
 *
 * The groups are how the card is read rather than where anything is stored:
 * "Settings" is what you would change about yourself, "This computer" is what
 * you would change about the machine you are sitting at, "Customize" is what
 * you would add to the app, and "Platform" holds the few things that belong to
 * the provider rather than to either.
 *
 * Nothing in here is built yet. Every one of these rows opens onto an empty
 * pane that says so, which is why none of them carry a value, a control or a
 * setting behind them. They are here so the shape of the card is decided while
 * the card is still empty, and so the sections land in a chosen order instead
 * of whatever order they happen to get built in.
 *
 * The icons are picked to be told apart at 16px without reading the label. Two
 * of them are reused on purpose: Extensions and Plugins are both third-party
 * code, and drawing them differently would suggest they are different kinds of
 * thing.
 */
export const SETTINGS_SECTIONS: SettingsGroup[] = [
  {
    id: "settings",
    label: "Settings",
    entries: [
      { id: "general", label: "General", icon: SettingsIcon },
      { id: "account", label: "Account", icon: CircleUserRoundIcon },
      { id: "privacy", label: "Privacy", icon: ShieldCheckIcon },
      { id: "billing", label: "Billing", icon: CreditCardIcon },
      { id: "capabilities", label: "Capabilities", icon: BoxesIcon },
      { id: "memory", label: "Memory", icon: BrainIcon },
      { id: "reflect", label: "Reflect", icon: SunriseIcon },
      { id: "time-and-focus", label: "Time and focus", icon: TimerIcon },
      { id: "claude-code", label: "Claude Code", icon: CodeXmlIcon },
    ],
  },
  {
    id: "this-computer",
    label: "This computer",
    entries: [
      { id: "system", label: "System", icon: MonitorIcon },
      { id: "extensions", label: "Extensions", icon: PuzzleIcon },
      { id: "developer", label: "Developer", icon: WrenchIcon },
    ],
  },
  {
    id: "customize",
    label: "Customize",
    entries: [
      { id: "skills", label: "Skills", icon: ComponentIcon },
      { id: "connectors", label: "Connectors", icon: Grid2x2Icon },
      { id: "plugins", label: "Plugins", icon: PlugIcon },
    ],
  },
  {
    id: "platform",
    label: "Platform",
    entries: [{ id: "api-keys", label: "API keys", icon: KeyRoundIcon }],
  },
]

/** The section a card opens on, and the one it returns to when it reopens. */
export const DEFAULT_SETTINGS_SECTION = "general"

/**
 * Every section, flattened.
 *
 * The nav is nested and the pane is not — the pane asks for one section by id
 * and never wants to walk groups to find it. Flattening once here means the
 * lookup below is a map rather than a search, and there is exactly one list of
 * what exists.
 */
export const SETTINGS_ENTRIES: SettingsEntry[] = SETTINGS_SECTIONS.flatMap(
  (group) => group.entries
)

const ENTRIES_BY_ID = new Map(SETTINGS_ENTRIES.map((entry) => [entry.id, entry]))

/** The entry for an id, or `undefined` — the pane draws nothing it cannot name. */
export function findSettingsEntry(id: string): SettingsEntry | undefined {
  return ENTRIES_BY_ID.get(id)
}

/**
 * The groups, narrowed to the ones the search box can still reach.
 *
 * A group that loses every one of its rows is dropped rather than left as an
 * empty heading — a heading with nothing under it is a dead end in a list of
 * things you can click. Matching is on the row's own label, so a group heading
 * is not a way in: typing "computer" finds Developer, because that is the row
 * you would have been reaching for, not the group it happens to sit under.
 */
export function filterSettingsSections(query: string): SettingsGroup[] {
  const needle = query.trim().toLowerCase()
  if (needle === "") return SETTINGS_SECTIONS

  return SETTINGS_SECTIONS.map((group) => ({
    ...group,
    entries: group.entries.filter((entry) =>
      entry.label.toLowerCase().includes(needle)
    ),
  })).filter((group) => group.entries.length > 0)
}

