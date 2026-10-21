"use client"

import * as React from "react"
import { MonitorIcon, MoonIcon, SunIcon } from "lucide-react"

import { IconSwitch, type IconSwitchOption } from "@/components/icon-switch"
import { SettingRow } from "@/components/setting-row"
import { Switch } from "@/components/switch"
import { ToggleGroup, ToggleGroupItem } from "@/components/toggle-group"
import { useThemePreference, type ThemePreference } from "@/lib/theme"
import { FontPicker } from "./settings-font"
import { PalettePicker } from "./settings-palette"
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
 * Why a row here is inert.
 *
 * Phrased as what is missing rather than as "coming soon", because that is the
 * difference between a row that is waiting for something and one that is
 * pretending. Nothing in this file is enabled except the theme.
 */
const NOT_BUILT = "Not built yet — there is nothing to configure yet"

/** A segmented control for a row that cannot be changed yet. */
function Placeholder({
  options,
  value,
  className,
  label,
}: {
  options: string[]
  value?: string
  className?: string
  label: string
}) {
  return (
    <ToggleGroup
      /* No value and no handler: a control with nothing to change it to. The
         component is disabled rather than merely inert so it is out of the tab
         order too — a segmented control you can focus and cannot press is
         worse than one that says it is unavailable. */
      disabled
      value={value === undefined ? [] : [value]}
      aria-label={label}
      className={cn("opacity-60", className)}
    >
      {options.map((option) => (
        <ToggleGroupItem key={option} value={option}>
          {option}
        </ToggleGroupItem>
      ))}
    </ToggleGroup>
  )
}

/** A switch for a row that cannot be changed yet. */
function PlaceholderSwitch({ label }: { label: string }) {
  return (
    <Switch
      disabled
      aria-label={label}
      /* Off, not on. The design this is drawn from shows these switches on,
         but nothing is wired behind them, and a switch that reads "on" tells
         the reader something is happening when nothing would. Off is both
         honest and the safe default if it is ever wired up. */
    />
  )
}

/**
 * The Theme row, which works.
 *
 * The same switch the rail uses to move between Chat and Code, because it is
 * the same kind of decision: a short list of mutually exclusive options, one of
 * which is in force, where the control should keep its size whichever is chosen.
 * Only the options differ. Sharing the component rather than copying its
 * classes is the point — a second copy of this control would drift from the
 * first the first time either was touched.
 *
 * `system` first because it is the one that needs no decision from the reader,
 * and because it has to stay reachable after somebody has already overridden:
 * last would make the override the shortest way out of following the OS and the
 * way back the longest.
 */
function ThemeRow() {
  const [preference, setPreference] = useThemePreference()

  const options: IconSwitchOption<ThemePreference>[] = [
    { value: "system", label: "System", icon: <MonitorIcon /> },
    { value: "light", label: "Light", icon: <SunIcon /> },
    { value: "dark", label: "Dark", icon: <MoonIcon /> },
  ]

  return (
    <SettingRow label="Theme" description="Whether the app follows your system setting or overrides it.">
      <IconSwitch
        aria-label="Theme"
        value={preference}
        onValueChange={setPreference}
        options={options}
      />
    </SettingRow>
  )
}

/**
 * The Colour palette row, which works.
 *
 * Below Theme rather than above it, because the two are separate axes and read
 * as a sentence in this order: the app is light or dark, and it is drawn in
 * these colours. A palette carries its own light and dark token values, so
 * neither of them implies anything about the other.
 *
 * There is only one palette so far — the app's existing token set, which is
 * also the fallback for anything unrecognised. The list grows by adding to
 * `PALETTES` and writing the matching tokens in `index.css`; the control does
 * not change.
 */
function PaletteRow() {
  return (
    <SettingRow
      label="Colour palette"
      description="The colours every surface, border and accent is drawn from."
    >
      <PalettePicker />
    </SettingRow>
  )
}

/**
 * The General section.
 *
 * Everything in it except Theme, Colour palette and App font is a row with
 * the shape of a control and nothing behind it. They are here as a layout
 * rather than as settings: the card's proportions, the two-pane split and the
 * scroll of the pane are all decided by what fits, and there is no way to know
 * what fits from one line of placeholder text.
 *
 * Each inert row says why in its own tooltip rather than being silently dead,
 * and none of them is enabled. A row that looked live and was not would be the
 * one thing worse than a row that is obviously not there yet.
 */
export function GeneralSettings() {
  return (
    <div className="flex flex-col gap-8">
      <Group title="Appearance">
        <ThemeRow />

        <PaletteRow />

        <SettingRow
          label="App font"
          description="The typeface the whole app is drawn in. Code stays monospaced."
        >
          <FontPicker />
        </SettingRow>

        <SettingRow
          label="Transcript text size"
          why={NOT_BUILT}
          description="Size of the conversation transcript text."
        >
          <Placeholder
            label="Transcript text size"
            options={["Small", "Medium", "Large"]}
            value="Medium"
          />
        </SettingRow>

        <SettingRow
          label="Transcript width"
          why={NOT_BUILT}
          description="Maximum width of the transcript and composer columns."
        >
          <Placeholder
            label="Transcript width"
            options={["Narrow", "Medium", "Wide"]}
            value="Medium"
          />
        </SettingRow>

        <SettingRow
          label="Motion"
          why={NOT_BUILT}
          description="Reduce animation in streaming responses and other interface elements."
        >
          <Placeholder
            label="Motion"
            options={["System", "Reduced"]}
            value="System"
          />
        </SettingRow>
      </Group>

      <Group title="Notifications">
        <SettingRow
          label="Response completions"
          why={NOT_BUILT}
          description="Get notified when a response has finished. Useful for long-running tasks."
        >
          <PlaceholderSwitch label="Response completions" />
        </SettingRow>

        <SettingRow
          label="Mentions and replies"
          why={NOT_BUILT}
          description="Get an email when someone @mentions you on an artifact, or replies in a comment thread you're part of."
        >
          <PlaceholderSwitch label="Mentions and replies" />
        </SettingRow>

        <SettingRow
          label="Comments on your artifacts"
          why={NOT_BUILT}
          description="Get an email when someone comments on an artifact you own, even when you're not mentioned."
        >
          <PlaceholderSwitch label="Comments on your artifacts" />
        </SettingRow>

        <SettingRow
          label="Artifacts shared with you"
          why={NOT_BUILT}
          description="Get an email when someone shares an artifact with you."
        >
          <PlaceholderSwitch label="Artifacts shared with you" />
        </SettingRow>
      </Group>
    </div>
  )
}