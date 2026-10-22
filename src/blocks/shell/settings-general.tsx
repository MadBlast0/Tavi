"use client"

import * as React from "react"
import { MonitorIcon, MoonIcon, SunIcon } from "lucide-react"

import { IconSwitch, type IconSwitchOption } from "@/components/icon-switch"
import { SettingRow } from "@/components/setting-row"
import { Switch } from "@/components/switch"
import { ToggleGroup, ToggleGroupItem } from "@/components/toggle-group"
import { Button } from "@/components/button"
import {
  announceTest,
  askForNotifications,
  notificationPreferences,
  setCompletionNotifications,
  setInFrontNotifications,
  setNotificationPreview,
} from "@/lib/notifications"
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
 * pretending. The theme, the palette, the font and the notification rows are
 * the ones in this file that work; the rest are waiting.
 */
const NOT_BUILT = "Not built yet — there is nothing to configure yet"

/**
 * What the test row is really testing.
 *
 * A notification is raised by the operating system and not by the app, and
 * the operating system may decline. On Windows only an *installed* app may
 * raise one, and a development build is not installed, so a development build
 * shows the notification under powershell's name or not at all.
 */
const TEST_WHY =
  "On Windows, only an installed app may raise a notification. A development build shows one under powershell's name."

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
 * The notification rows, which work.
 *
 * Three switches, because there are two questions and they are different
 * ones: *whether* to be told, and *how much* to be told. Somebody who wants
 * a preview in the background and none in the foreground cannot say so in a
 * single switch.
 *
 * The second and the third are disabled while the first is off, because the
 * two would otherwise contradict each other — a switch that reads "on" and
 * does nothing is the one thing worse than a switch that reads "off".
 *
 * **The permission is asked for here, and not at launch.** A permission asked
 * for before the reader knows what it is for is a permission asked for
 * before the question, and the answer they give is the answer to a question
 * they were not asked. If it is refused, the setting goes back off and says
 * so.
 *
 * **The test row is not a decoration.** A notification is raised by the
 * operating system and not by the app, and the operating system may decline
 * — on Windows only an *installed* app may raise one, and a development
 * build is not one. Without a way to ask, the reader is left guessing
 * whether the app is broken or the system is saying no.
 */
function NotificationRows() {
  const [preferences, setPreferences] = React.useState(notificationPreferences)
  const [refused, setRefused] = React.useState(false)

  const onCompletions = async (on: boolean) => {
    if (!on) {
      setCompletionNotifications(false)
      setRefused(false)
      setPreferences(notificationPreferences())
      return
    }
    const granted = await askForNotifications()
    if (!granted) {
      setRefused(true)
      setPreferences(notificationPreferences())
      return
    }
    setRefused(false)
    setCompletionNotifications(true)
    setPreferences(notificationPreferences())
  }

  return (
    <>
      <SettingRow
        label="Response completions"
        description="Tell me when a reply finishes and the answer is not on screen."
      >
        <Switch
          checked={preferences.completions}
          onCheckedChange={(on) => void onCompletions(on)}
          aria-label="Response completions"
        />
      </SettingRow>

      <SettingRow
        label="Also when the app is in front"
        description="Tell me even when the answer is on screen."
      >
        <Switch
          checked={preferences.inFront}
          disabled={!preferences.completions}
          onCheckedChange={(on) => {
            setInFrontNotifications(on)
            setPreferences(notificationPreferences())
          }}
          aria-label="Also when the app is in front"
        />
      </SettingRow>

      <SettingRow
        label="Show a preview"
        description="Put the first line of the answer in the notification."
      >
        <Switch
          checked={preferences.preview}
          disabled={!preferences.completions}
          onCheckedChange={(on) => {
            setNotificationPreview(on)
            setPreferences(notificationPreferences())
          }}
          aria-label="Show a preview"
        />
      </SettingRow>

      <SettingRow
        label="Test notification"
        description="Send one now, to see whether your system will show it."
        why={TEST_WHY}
      >
        <Button
          variant="outline"
          size="sm"
          onClick={() => {
            void announceTest().then((granted) => setRefused(!granted))
          }}
        >
          Send
        </Button>
      </SettingRow>

      {refused ? (
        <p className="text-xs text-muted-foreground">
          The system did not allow notifications, so there is nothing to show.
        </p>
      ) : null}
    </>
  )
}

/**
 * The rows that are about a service this app does not have.
 *
 * Mentions, comments on a thing you own and things shared with you all need
 * an account, a place where things are shared and a mail server to tell you
 * about it. This app has none of the three, and it is not going to grow an
 * account system because a settings card has a row for one.
 *
 * So they stay off, and they say **what is missing** rather than the generic
 * *"not built yet"*, which is true of everything and so says nothing about
 * any of them in particular.
 */
const NO_SERVICE =
  "There is no account and nothing to share, so there is nothing to be mentioned in."

/**
 * The General section.
 *
 * Everything in it except Theme, Colour palette, App font and the three
 * notification rows is a row with the shape of a control and nothing behind
 * it. They are here as a layout rather than as settings: the card's
 * proportions, the two-pane split and the scroll of the pane are all decided
 * by what fits, and there is no way to know what fits from one line of
 * placeholder text.
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
        <NotificationRows />

        <SettingRow
          label="Mentions and replies"
          why={NO_SERVICE}
          description="Get an email when someone @mentions you on an artifact, or replies in a comment thread you're part of."
        >
          <PlaceholderSwitch label="Mentions and replies" />
        </SettingRow>

        <SettingRow
          label="Comments on your artifacts"
          why={NO_SERVICE}
          description="Get an email when someone comments on an artifact you own, even when you're not mentioned."
        >
          <PlaceholderSwitch label="Comments on your artifacts" />
        </SettingRow>

        <SettingRow
          label="Artifacts shared with you"
          why={NO_SERVICE}
          description="Get an email when someone shares an artifact with you."
        >
          <PlaceholderSwitch label="Artifacts shared with you" />
        </SettingRow>
      </Group>
    </div>
  )
}