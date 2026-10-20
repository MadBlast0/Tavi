"use client"

import {
  Combobox,
  ComboboxContent,
  ComboboxEmpty,
  ComboboxInput,
  ComboboxItem,
  ComboboxList,
  ComboboxStatus,
} from "@/components/combobox"
import { PALETTES, usePalette, type Palette } from "@/lib/palette"
import { useThemePreference, resolveTheme, type ResolvedTheme } from "@/lib/theme"
import { cn } from "@/lib/utils"

/**
 * The colours a palette is represented by, background first.
 *
 * Sized to be told apart from the next one at 20px tall without reading the
 * name — a palette's name on its own says nothing about what it looks like,
 * which is the whole reason the strip is here.
 *
 * Drawn in whichever mode the app is currently in, for the reason given on
 * `Palette.swatch`: a strip of light values shown against a dark app
 * describes a palette the reader is not looking at.
 */
function Swatch({
  palette,
  mode,
  className,
}: {
  palette: Palette
  mode: ResolvedTheme
  className?: string
}) {
  return (
    <span
      aria-hidden="true"
      className={cn("flex shrink-0 gap-px", className)}
    >
      {palette.swatch[mode].map((colour, index) => (
        <span
          key={index}
          className="h-5 w-1.5 rounded-[2px] ring-1 ring-inset ring-foreground/10"
          style={{ backgroundColor: colour }}
        />
      ))}
    </span>
  )
}

/**
 * The palette picker.
 *
 * The same control as the font picker beside it, down to the searchable list,
 * and for the same reason: both are choosing from a list that is longer than
 * fits, so both are searched rather than scrolled, and neither leaves the
 * control in a state where the current choice is not visible.
 *
 * A palette's swatch is drawn from values held beside the palette in
 * `src/lib/palette.ts` rather than read back off the stylesheet. Reading them
 * would mean putting each candidate palette on the element in turn to measure
 * it, and a strip has to be drawable for a palette that is not currently
 * applied. The trade is that a palette can ship a strip that does not match
 * its tokens — which is why the two are written next to each other.
 */
export function PalettePicker({ className }: { className?: string }) {
  const [current, setCurrent] = usePalette()
  /* The swatches follow the theme, so this has to know it. Read through the
     same store as the Theme row rather than from the class on the root, so
     the two cannot disagree — the row above is the thing being mirrored, and
     a strip drawn from a stale mode would be exactly the wrong thing to
     choose a palette by. `resolveTheme` is what turns `system` into light or
     dark, which is the case that would otherwise be undefined here. */
  const [preference] = useThemePreference()
  const mode = resolveTheme(preference)

  const selected = PALETTES.find((palette) => palette.id === current)

  return (
    /* The width goes on a wrapper, as it does for the font picker: the
       combobox root takes no className of its own. */
    <div className={cn("w-64", className)}>
      <Combobox
        items={PALETTES}
        /* Single choice, so the value is the palette itself rather than a
           one-item array — the collection is multi-aware, this control is not.
           The palette carries its own label and swatch, so the input and the
           options both know how to draw it without being told. */
        value={selected ?? PALETTES[0]}
        onValueChange={(value) => {
          if (value) setCurrent(value.id)
        }}
        isItemEqualToValue={(a, b) => a.id === b.id}
        itemToStringLabel={(palette) => palette.name}
        itemToStringValue={(palette) => palette.id}
        openOnInputClick
      >
        <ComboboxInput
          showTrigger
          aria-label="Colour palette"
          placeholder="Search palettes"
        />
        <ComboboxContent>
          <ComboboxEmpty>No palette matches that.</ComboboxEmpty>
          <ComboboxList>
            {(palette: Palette) => (
              <ComboboxItem
                key={palette.id}
                value={palette}
                className="flex items-center gap-2.5"
              >
                <Swatch palette={palette} mode={mode} />
                <span className="flex-1 truncate">{palette.name}</span>
              </ComboboxItem>
            )}
          </ComboboxList>
          {/* Announced rather than shown: the visible state is the field
              itself, and a screen reader is told how many there are. */}
          <ComboboxStatus className="sr-only">
            {`${PALETTES.length} palettes available.`}
          </ComboboxStatus>
        </ComboboxContent>
      </Combobox>
    </div>
  )
}