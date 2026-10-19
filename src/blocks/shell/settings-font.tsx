"use client"

import * as React from "react"

import {
  Combobox,
  ComboboxContent,
  ComboboxEmpty,
  ComboboxInput,
  ComboboxItem,
  ComboboxList,
  ComboboxStatus,
} from "@/components/combobox"
import {
  DEFAULT_FONT_FAMILY,
  applyFontFamily,
  listInstalledFonts,
  readFontFamily,
  writeFontFamily,
  type FontDiscoveryResult,
} from "@/lib/fonts"
import { cn } from "@/lib/utils"

/**
 * The family names on offer.
 *
 * The app's own face is always first and always selectable, whether or not the
 * backend reported it — it is bundled, so it is installed by definition, and a
 * machine whose scan somehow missed it should still be able to get back to it.
 *
 * The saved family stays in the list even when discovery has not found it. It
 * may be a machine whose fonts the scan could not see, and dropping someone's
 * saved choice — or rewriting it to something else — would lose a preference
 * they may still want for a machine that has it. It is marked unavailable
 * instead, and the app renders in the fallback until they choose something
 * present.
 */
function buildOptions(families: string[], saved: string | null): string[] {
  const options = [DEFAULT_FONT_FAMILY]
  for (const family of families) {
    if (family !== DEFAULT_FONT_FAMILY && !options.includes(family)) {
      options.push(family)
    }
  }
  if (saved && !options.includes(saved)) options.push(saved)
  return options
}

/**
 * The app font picker.
 *
 * The list is what this machine has installed, discovered through the OS rather
 * than written into the app, so it is searched rather than browsed — a Windows
 * machine has hundreds of families and nobody scrolls for one.
 *
 * Search is the combobox's own filtering, and typing only changes what is
 * *shown*: the stored choice is written when an item is chosen, never as a side
 * effect of the query changing.
 *
 * There is no refresh control. The list is scanned once per launch and held for
 * the session, so a font installed since the last run is already here by the
 * time anybody opens the settings — a button that rescans the same database the
 * app already read would only be a way to be told the answer had not changed.
 *
 * The picker is never disabled. If discovery failed — no permission, a backend
 * that could not answer, the web target — the list is the app's own face and
 * whatever is saved, which is still selectable. A greyed control with nothing
 * under it explains less than a working one with a short list, and the reason
 * is on the field itself for anyone who asks.
 */
export function FontPicker({ className }: { className?: string }) {
  const [families, setFamilies] = React.useState<string[]>([])
  const [scanned, setScanned] = React.useState(false)
  const [saved, setSaved] = React.useState<string | null>(null)

  /* Read on mount rather than passed in, so the picker and anything else
     reading the preference cannot disagree about what is chosen. The face is
     already on screen by now — `main.tsx` applied it before the first render —
     so this is only for the dropdown's own label. */
  React.useEffect(() => {
    setSaved(readFontFamily())
  }, [])

  /* Enumerated when the row appears, not on every render. The launch scan has
     usually already filled the cache by now, so this normally resolves without
     touching the system again. */
  React.useEffect(() => {
    let live = true
    listInstalledFonts().then((result: FontDiscoveryResult) => {
      if (!live) return
      if (result.ok) setFamilies(result.families)
      setScanned(true)
    })
    return () => {
      live = false
    }
  }, [])

  const options = buildOptions(families, saved)
  const current = saved ?? DEFAULT_FONT_FAMILY
  /* The saved family is missing from a list that genuinely answered — as
     opposed to a scan that failed, which tells us nothing either way. */
  const unavailable =
    scanned && families.length > 0 && !families.includes(current)

  function onSelect(family: string) {
    /* The default face is stored as "no preference" rather than as its name, so
       the app's own font stays the default if it is ever renamed. */
    const next = family === DEFAULT_FONT_FAMILY ? null : family
    writeFontFamily(next)
    setSaved(next)
    /* Also applied here, not only through the setter, so a family that is not
       installed still shows as chosen while the app renders in the fallback —
       which is what actually happens. */
    applyFontFamily(next ?? DEFAULT_FONT_FAMILY)
  }

  return (
    /* The width goes on a wrapper: the combobox root takes no className of its
       own, and it is the field inside it that needs to be a predictable width
       so the row's control does not stretch the way a flex child would. */
    <div className={cn("w-64", className)}>
      <Combobox
        items={options}
        /* A single choice, so the value is the family itself rather than a
           one-item array — the collection is multi-aware, this control is not. */
        value={current}
        onValueChange={(value) => {
          if (value) onSelect(value)
        }}
        openOnInputClick
      >
      <ComboboxInput
          showTrigger
          aria-label="App font"
          placeholder={scanned ? "Search fonts" : "Reading installed fonts…"}
          /* Why the list is short, for anyone who asks on the field itself —
             rather than a line of text under the row, which said nothing to
             somebody who never noticed it. */
          title={
            unavailable
              ? "This font is not installed on this machine, so the app is drawn in its own. Choose another to change it."
              : undefined
          }
        />
        <ComboboxContent>
          <ComboboxEmpty>No font matches that.</ComboboxEmpty>
          <ComboboxList>
            {(family: string) => (
              <ComboboxItem
                key={family}
                value={family}
                className="flex items-center justify-between gap-3"
              >
                {/* A sample in the face itself. The names are similar in a way
                    that reading them does not settle — "Segoe UI" and "Selawik"
                    are indistinguishable until they are drawn. */}
                <span style={{ fontFamily: JSON.stringify(family) }}>
                  {family}
                </span>
                {/* Only once discovery has actually answered with a list.
                    Before that nothing is known about what is installed, and
                    marking everything "not installed" would be a guess stated
                    as a fact.

                    The app's own face is never marked either way: it is bundled
                    as a webfont, so it renders whether or not the OS scan knows
                    about it — and the scan cannot know, because it lists
                    installed fonts, not fonts a stylesheet has declared. */}
                {scanned &&
                families.length > 0 &&
                family !== DEFAULT_FONT_FAMILY &&
                !families.includes(family) ? (
                  <span className="text-xs text-muted-foreground">
                    not installed
                  </span>
                ) : null}
              </ComboboxItem>
            )}
          </ComboboxList>
          {/* Announced rather than shown: the visible state is the field's own
              placeholder, and a screen reader is told what the list holds. */}
          <ComboboxStatus className="sr-only">
            {scanned
              ? `${families.length} fonts installed.`
              : "Reading installed fonts."}
          </ComboboxStatus>
        </ComboboxContent>
      </Combobox>
    </div>
  )
}