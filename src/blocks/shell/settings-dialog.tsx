"use client"

import * as React from "react"
import { ChevronRightIcon, SearchIcon } from "lucide-react"

import { Button } from "@/components/button"
import { Card } from "@/components/card"
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@/components/dialog"
import {
  InputGroup,
  InputGroupAddon,
  InputGroupClear,
  InputGroupInput,
} from "@/components/input-group"
import { ScrollArea } from "@/components/scroll-area"
import { useBoxShape } from "@/hooks/use-box-shape"
import { prefersReducedMotion } from "@/lib/motion"
import {
  DEFAULT_SETTINGS_SECTION,
  filterSettingsSections,
  findSettingsEntry,
  type SettingsGroup,
} from "./settings-sections"
import { GeneralSettings } from "./settings-general"
import { KeySettings } from "./settings-keys"
import { PrivacySettings } from "./settings-privacy"
import { cn } from "@/lib/utils"

/**
 * The card's size.
 *
 * Sized as a share of the window rather than in rems, so the gap around it
 * stays the same proportion on every screen instead of growing as the window
 * does. 80% of the height and 78% of the width leaves 10% above and below and
 * 11% at each side - the card is large against the app it covers, which is
 * what a settings surface wants: the more of the app still visible behind it,
 * the less it reads as the app's only state.
 *
 * The width is capped at 78vw rather than set outright so a wide window does
 * not hand the pane a line of settings so long the label and its control end
 * up at opposite ends. The dialog's own ceiling still applies below this.
 *
 * The height is set at every width, and it must be. A card that sizes itself to
 * its content cannot be measured for its proportions, because the layout it
 * picks is what decides how tall it is: side by side the nav column is several
 * hundred pixels of rows, stacked the header is a title, a search box and a
 * strip of tabs. That is a loop - the shape picks the layout, the layout sets
 * the height, the height sets the shape - and the card settles into whichever
 * answer happens to win, flipping between the two for as long as it is open.
 * An earlier version measured a content-height card and flickered between a
 * 747px column and a 175px header at a fixed width.
 *
 * Fixing the height ends the loop, because the card's proportions then come
 * from the window alone and nothing the card draws can feed back into them.
 *
 * The width and the centring are the same story. The vendored dialog turns
 * itself into a bottom sheet below `sm` - anchored to the bottom edge, rounded
 * only at the top, with a drag handle and its lower edge hanging below the
 * fold. That is the right sheet for a phone, where the window is the sheet, but
 * it is the wrong one for this card in a resized desktop window: the card was
 * a centred panel a moment earlier and is now a sheet clipped by the window,
 * and it changes at 640px for reasons that have nothing to do with this card.
 * So the width cap and the centring are set at every width here, overriding the
 * sheet rather than deferring to it, and the card is the same panel wherever
 * the window happens to be.
 *
 * The width is marked important, which is not a habit here. The dialog's own
 * size variants are `sm:max-w-lg` and friends — the same CSS property, and a
 * breakpoint prefix is not something the class merger treats as a separate
 * utility, so both survive into the stylesheet and the winner is whichever
 * rule the build happens to emit last. That was not stable: the card came out
 * 512px wide in a 1574px window, which is narrow enough to be read as tall, so
 * it sat in its stacked layout on a wide screen and looked stuck there.
 */
const CARD = "h-[80dvh] max-w-[78vw]!"

/**
 * The narrowest the card can be and still have a column beside the pane.
 *
 * The wide shape divides the card: a column of navigation, and the pane. The
 * three widths that have to fit are the column (224px), the pane's own
 * padding (80px, which keeps the content clear of the frame and of the close
 * button), and enough of a pane to hold a setting's name and its control
 * (296px). A card narrower than that cannot be divided: the pane is left with
 * a sliver, and a name in a sliver breaks one letter per line.
 *
 * So the card is **tall** below this width, whatever its proportions. A card
 * that is wider than it is tall is not the same as a card that is wide enough
 * for two columns, and the smallest window the app can be dragged to is the
 * one that proves it: at 600px wide the card is 468px, which is wider than it
 * is tall and far too narrow for a column beside it.
 */
const WIDE_FLOOR = 600

/**
 * The card's position, overriding the vendored sheet's own.
 *
 * Below `sm` the sheet places itself with `inset-inline: 0` and a negative
 * `bottom`, which pins it to the bottom of the window and lets the bleed run
 * off the edge. The card is centred instead: `inset-inline: auto` drops the
 * edge-to-edge stretch, and the top offset plus the negative translation put it
 * on the window's centre line at any height.
 *
 * `pb` is reset because the sheet's own bottom padding is the drag area at the
 * foot of a sheet, and a centred card has no such affordance — left in place it
 * is a band of empty space inside the card, below the pane.
 *
 * The radius is reset for the same reason: a sheet rounds only its top corners
 * because its bottom corners are off the window, and a centred card has all four
 * corners on screen.
 *
 * `max-h` is the sheet's own ceiling for a sheet, which allows for the bleed.
 * The card's height is set outright, so the ceiling only has to not fight it.
 */
const CENTERED = cn(
  /* All four offsets are set outright, not left to over-constraint. The sheet
     is placed with `inset-inline: 0` and a negative `bottom`, and clearing only
     some of them leaves the card stretched between one edge and a leftover on
     the other — or, worse, apparently centred only because the browser drops
     the end offset when the height is already fixed. That is a coincidence,
     not a placement, and it stops being true the moment the height comes from
     somewhere else.

     So: both inline edges cleared, the block edges set to the centre line, and
     the translation pulls the box back by half its own size. */
  "inset-x-auto top-1/2 bottom-auto start-1/2",
  "-translate-x-1/2 -translate-y-1/2",
  /* The sheet's own ceiling allows for the bleed, which a centred card has no
     use for. The card's height is set outright, so this only has to not fight
     it — but it is written out rather than inherited, because a ceiling meant
     for a different shape is not one to leave in place by accident. */
  "max-h-[calc(100dvh-2rem)]",
  /* All four corners, because all four are on screen — a sheet rounds only the
     two at the end it is not attached to. And no padding: the sheet's bottom
     padding is the drag area at the foot of a sheet, which for a centred card
     is a band of nothing under the pane. */
  "rounded-xl p-0",
  /* The drag handle goes with them. It is a sheet affordance — a grab bar for
     pulling a sheet down — and this card is not attached to anything. */
  "[&>[data-slot=sheet-handle]]:hidden"
)

/**
 * The card's own shortcut.
 *
 * The comma itself, not `comma`. The matcher compares against what the key
 * press reports — the character — rather than the key's name, so spelling the
 * name here would produce a binding that silently never fires, and the account
 * menu would still print it beside the row.
 *
 * `mod` rather than `ctrl`, so it is Command on the platform that has Command
 * and Control on the one that has Control. The account menu prints this one
 * value and the shell listens for it, so the label and the handler cannot
 * disagree about it.
 */
export const SETTINGS_HOTKEY = "mod+,"

/**
 * Which section is showing.
 *
 * `true` rather than the more usual `"page"` is deliberate. It is what every
 * other selected state in the app keys off, and it is the only value Tailwind's
 * built-in `aria-current:` variant matches — that variant emits
 * `[aria-current=true]`, so `"page"` renders no styling at all. On a control
 * that is not a link, `true` announces the same thing `"page"` would.
 *
 * `undefined` rather than `false` for the rows that are not selected, which
 * leaves the attribute off the element entirely. An `aria-current="false"` is
 * still an `aria-current`, and any selector written as `[aria-current]` — which
 * is how the menu's own selected styling below is written — would match it and
 * mark every row in the menu as current.
 */
function isCurrent(entryId: string, active: string) {
  return entryId === active ? true : undefined
}

/** A row in the nav. The selected one is filled; the rest answer on hover. */
const ROW = cn(
  "h-8 w-full justify-start gap-2 rounded-md px-2 text-[0.8125rem] font-normal",
  "text-foreground/80 hover:bg-muted/60 hover:text-foreground",
  "aria-current:bg-muted aria-current:text-foreground"
)

/**
 * The same row, as a tab in the header.
 *
 * The header has no room for an icon beside a label — a tab that already sits
 * beside eight siblings and under a heading does not need one — so it drops to
 * the label alone. It keeps the row's height and its selected state, because a
 * tab that is the same control in a different place should look like it. Round
 * rather than square ends, since that is what makes it read as a tab.
 */
const TAB = cn(
  "h-8 shrink-0 rounded-full px-3 text-[0.8125rem] font-normal",
  "text-foreground/70 hover:bg-muted/60 hover:text-foreground",
  "aria-current:bg-muted aria-current:text-foreground"
)

/** A heading above a run of rows. A caption, not a row. */
const HEADING = "px-2 pt-1 pb-0.5 text-[0.6875rem] font-medium text-muted-foreground"

/**
 * The card's name.
 *
 * Hidden in the wide shape, where the nav column beside the pane already says
 * where you are and a second heading over it would be the same name twice.
 * Drawn in the tall one, where there is no column and nothing else answers
 * "what is this".
 */
function SettingsName({ tall }: { tall: boolean }) {
  return (
    <DialogTitle
      className={cn(
        "text-lg leading-snug font-semibold",
        !tall && "sr-only"
      )}
    >
      Settings
    </DialogTitle>
  )
}

/**
 * The pane's own heading: the section's name.
 *
 * It carries the gap to whatever follows it. That gap is the whole reason this
 * is a component rather than the two copies of an `h2` it replaced — without
 * one, "General" and the "Appearance" group heading beneath it sat flush
 * together and read as a single two-line title, because two headings of
 * different sizes with nothing between them look like one heading that wrapped.
 *
 * The margin is here rather than on the content for a second reason: the tall
 * shape hides this heading with `sr-only`, which is `position: absolute`, so it
 * leaves the flow and its margin goes with it. Spacing attached to the heading
 * therefore disappears exactly when the heading does, and spacing attached to
 * the content would not.
 */
function PaneHeading({ label, hidden }: { label: string; hidden: boolean }) {
  return (
    <h2
      className={cn(
        "mb-8 text-base leading-snug font-semibold text-pretty",
        hidden && "sr-only"
      )}
    >
      {label}
    </h2>
  )
}

/**
 * The search box.
 *
 * One control in two places rather than one control that moves, so there is no
 * state to hand across a shape change and no frame in which it is in neither.
 * Only one is ever visible: the other is behind a `hidden`, which also takes it
 * out of the tab order, so a screen reader never meets two search fields.
 *
 * `className` is passed in by whichever header is drawing it, because the tall
 * shape needs it to share a row with the title and take what is left over, and
 * the wide one needs it to take a row to itself.
 */
function SettingsSearch({
  query,
  onQueryChange,
  className,
}: {
  query: string
  onQueryChange: (query: string) => void
  className?: string
}) {
  return (
    <InputGroup size="sm" className={className}>
      <InputGroupAddon>
        <SearchIcon />
      </InputGroupAddon>
      <InputGroupInput
        aria-label="Search settings"
        placeholder="Search"
        value={query}
        onChange={(event) => onQueryChange(event.target.value)}
      />
      <InputGroupClear
        aria-label="Clear search"
        onClear={() => onQueryChange("")}
      />
    </InputGroup>
  )
}

/** A search that matched nothing has to say so. */
function NoMatch({ query }: { query: string }) {
  return (
    <p className="shrink-0 px-2 py-1 text-[0.8125rem] whitespace-nowrap text-muted-foreground">
      No section matches “{query.trim()}”.
    </p>
  )
}

/**
 * The nav, as a column beside the pane.
 *
 * Wide only; its counterpart in the narrow card is `TabStrip`. Both are handed
 * the same `groups`, so the two cannot list different sections.
 */
function SideNav({
  groups,
  query,
  active,
  onSelect,
}: {
  groups: SettingsGroup[]
  query: string
  active: string
  onSelect: (id: string) => void
}) {
  return (
    <ScrollArea className="min-h-0 flex-1">
      <nav aria-label="Settings sections" className="flex flex-col gap-4 pe-1">
        {groups.map((group) => (
          <div key={group.id} className="flex flex-col gap-0.5">
            <div className={HEADING}>{group.label}</div>
            {group.entries.map((entry) => (
              <Button
                key={entry.id}
                variant="ghost"
                className={ROW}
                aria-current={isCurrent(entry.id, active)}
                onClick={() => onSelect(entry.id)}
              >
                <entry.icon />
                {entry.label}
              </Button>
            ))}
          </div>
        ))}
        {groups.length === 0 ? <NoMatch query={query} /> : null}
      </nav>
    </ScrollArea>
  )
}

/**
 * The nav, as a strip of tabs across the top.
 *
 * The narrow card has no room for a column beside the pane — at this width the
 * column would leave the pane too narrow to put a setting's label and its
 * control on one line — so the same sections move up into a header and run
 * across it instead of down it.
 *
 * They run across and off the edge, and the strip scrolls sideways to reach the
 * ones past it. Wrapping was the alternative and it is worse: sixteen tabs
 * wrapping onto three lines would push the pane down by a third of the card
 * every time the window narrowed, so the content you came to read would move
 * out from under you as you resized. A strip that scrolls sideways keeps the
 * pane exactly where it was.
 *
 * The chevron at the end scrolls the strip on by a screenful and nothing else.
 * It used to open a menu of every section, which was a way to reach the ones
 * past the edge — but it asked the button to mean something other than what it
 * looked like it did, and a strip you can scroll is not a list you need a
 * second index for.
 *
 * It is disabled once there is nothing further to scroll to. It is on the end
 * of the strip, so it is visible for the whole time the card is open, and a
 * live-looking button that has run out of strip to move is worse than one that
 * admits it has.
 *
 * The selected tab is kept in view as the selection moves. Without that,
 * choosing a section from the search results would change the pane and leave
 * the strip still showing General, as though nothing had been chosen.
 */
function TabStrip({
  groups,
  query,
  active,
  onSelect,
}: {
  groups: SettingsGroup[]
  query: string
  active: string
  onSelect: (id: string) => void
}) {
  const stripRef = React.useRef<HTMLDivElement>(null)
  const [atEnd, setAtEnd] = React.useState(true)

  /* Whether the strip has run out. Read from the element rather than guessed
     from the number of tabs, because how much is off the edge depends on the
     card's width and on the label lengths, and both are known only once laid
     out. Also re-read when the tabs change, since a search that narrows the
     strip to one tab can take away the overflow entirely. */
  const syncOverflow = React.useCallback(() => {
    const strip = stripRef.current
    if (!strip) return
    const slack = strip.scrollWidth - strip.clientWidth
    setAtEnd(slack <= 1 || strip.scrollLeft >= slack - 1)
  }, [])

  React.useEffect(() => {
    const strip = stripRef.current
    if (!strip) return
    syncOverflow()

    strip.addEventListener("scroll", syncOverflow, { passive: true })
    const observer = new ResizeObserver(syncOverflow)
    observer.observe(strip)
    if (strip.firstElementChild) observer.observe(strip.firstElementChild)
    return () => {
      strip.removeEventListener("scroll", syncOverflow)
      observer.disconnect()
    }
  }, [syncOverflow, groups, query])

  React.useEffect(() => {
    stripRef.current
      ?.querySelector<HTMLElement>('[aria-current="true"]')
      ?.scrollIntoView({ block: "nearest", inline: "nearest" })
  }, [active])

  function scrollForward() {
    const strip = stripRef.current
    if (!strip) return
    strip.scrollBy({
      left: strip.clientWidth,
      behavior: prefersReducedMotion() ? "auto" : "smooth",
    })
  }

  return (
    <div className="flex items-center gap-1">
      {/* `overflow-x-auto` rather than the scroll-area: that scrolls vertically,
          and draws a vertical bar over a strip exactly as tall as its content.
          A sideways scroll on a strip this short needs no visible bar. */}
      <div
        ref={stripRef}
        className="scrollbar-none min-w-0 flex-1 overflow-x-auto"
      >
        <nav
          aria-label="Settings sections"
          className="flex w-max items-center gap-1 px-1 py-0.5"
        >
          {groups.flatMap((group) =>
            group.entries.map((entry) => (
              <Button
                key={entry.id}
                variant="ghost"
                className={TAB}
                aria-current={isCurrent(entry.id, active)}
                onClick={() => onSelect(entry.id)}
              >
                {entry.label}
              </Button>
            ))
          )}
          {groups.length === 0 ? <NoMatch query={query} /> : null}
        </nav>
      </div>

      <Button
        variant="ghost"
        size="icon-sm"
        className="shrink-0"
        aria-label="Scroll sections forward"
        disabled={atEnd}
        onClick={scrollForward}
      >
        <ChevronRightIcon />
      </Button>
    </div>
  )
}

/**
 * The settings card.
 *
 * A modal, not a page: it is opened from the account menu and closed by
 * clicking away or pressing escape, and the app is still there underneath it —
 * which is why the backdrop behind it is blurred rather than opaque. You are
 * looking at settings over your work, not somewhere else.
 *
 * Two shapes, chosen by the card's own proportions and not the window's. Wide —
 * at least as wide as it is tall, and wide enough to divide — the nav is a
 * column beside the pane. Tall, the nav becomes a strip of tabs in a header
 * above it. The same sections, the same selection, the same search; only where
 * they sit changes, so nothing is reachable in one shape and not the other.
 *
 * Shape rather than width, because width cannot answer the question being
 * asked. A card 500px wide and 900px tall has room to put a column beside the
 * pane and no height to spend on one; a card 1200px wide and 400px tall has
 * plenty of height and almost no width to divide. Every width step gives both
 * of them the same answer, and it is the wrong answer for one of them in each
 * case. The card changes proportions as the window does, and often not in step
 * with it — a window narrowed from the side keeps its height, so a card that
 * was comfortably wide becomes tall without ever passing through the width at
 * which a width-based rule would have switched it over.
 *
 * But proportions are not the whole of it, because a card can be too narrow to
 * divide however it is shaped. The wide shape has a floor — see `WIDE_FLOOR` —
 * and below it the card is tall even though it is wider than it is tall.
 *
 * The measurement is the card's own, not the window's. The card is capped well
 * inside the window on all sides, so the two are different boxes with different
 * proportions, and the one that has to decide how to lay itself out is the
 * card.
 *
 * Neither pane scrolls the card. The nav scrolls inside itself, because a
 * section list can outgrow the card while the pane beside it should not be
 * pushed about by that; the pane scrolls inside itself for the ordinary
 * reason. Letting the card itself scroll would take the search box away the
 * moment the list got long.
 */
export function SettingsDialog({
  open,
  onOpenChange,
  section,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  /**
   * The section to open on.
   *
   * Undefined opens the default one. A named section is a destination rather
   * than a one-time instruction, so it applies while the card is open too.
   */
  section?: string
}) {
  const [query, setQuery] = React.useState("")
  const [active, setActive] = React.useState(DEFAULT_SETTINGS_SECTION)

  /* Opening at a named section wins over the default. The reset below only
     runs while the card is closed, so the two do not fight. */
  React.useEffect(() => {
    if (open && section) setActive(section)
  }, [open, section])
  /* Measured on a plain wrapper around the card rather than on the card.

     The card is a `useRender` wrapper that does not hand its ref through to the
     node it renders, so a ref on it never arrives. A plain `div` around it
     takes one normally, and it is sized the way the card is — the card is its
     only child and fills it — so it measures the same box. */
  const [measureShape, shape] = useBoxShape({ minWide: WIDE_FLOOR })
  const tall = shape === "tall"

  /* Reopening always starts at the top of the list with the box empty. There is
     nothing behind a search term or a scrolled-away-from section yet, so
     holding on to either would only re-open the card somewhere the reader did
     not leave it. */
  React.useEffect(() => {
    if (open) return
    setQuery("")
    setActive(DEFAULT_SETTINGS_SECTION)
  }, [open])

  const groups = React.useMemo(() => filterSettingsSections(query), [query])
  const current = findSettingsEntry(active)

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className={cn("overflow-hidden!", CENTERED, CARD)}>
        <DialogDescription className="sr-only">
          Application settings, grouped by what they change.
        </DialogDescription>

        {/* `data-shape` is what both halves below ask about, and it is set from
            the measurement rather than from a CSS query — see the note on the
            hook. `data-shape` rather than a pair of booleans so the two halves
            cannot disagree about which shape they are in. */}
        <div
          ref={measureShape}
          data-settings-card-holder=""
          className="flex min-h-0 flex-1 flex-col"
        >
          <Card
            data-shape={shape}
            size="flush"
            className={cn(
              "min-h-0 flex-1 overflow-hidden pb-0!",
              /* Side by side only when there is height to divide. The column is a
                 fixed 224px, so on a card not much wider than that the pane would
                 be a sliver beside it — which is the tall case, and the tall case
                 stacks. */
              !tall && "flex-row"
            )}
          >
            {/* The header. It is the whole of the nav in the tall card, so it is
                drawn only there — the reverse of the column below, which is the
                same nav in the other shape. The two are never both drawn and
                never both absent.

                The title and the search share one row here. They were on rows of
                their own, which cost a header two bands tall for a control and a
                word, and pushed the pane — the part that is actually settings —
                that much further down. The close button sits at the top right,
                so the row is padded clear of it and the search fills whatever is
                left between the name and the button. */}
            {!tall ? null : (
              <div className="flex shrink-0 flex-col gap-2 border-b p-3">
                <div className="flex items-center gap-3 pe-9">
                  <SettingsName tall={tall} />
                  <SettingsSearch
                    query={query}
                    onQueryChange={setQuery}
                    className="min-w-0 flex-1"
                  />
                </div>
                <TabStrip
                  groups={groups}
                  query={query}
                  active={active}
                  onSelect={setActive}
                />
              </div>
            )}

            {/* The nav column, wide only. The name is drawn again here rather
                than moved between the two: it is one line of text, and belonging
                to both shapes means neither has to reach into the other to take
                it. */}
            {!tall ? (
              <div className="flex w-56 shrink-0 flex-col gap-3 border-e bg-muted/40 p-3">
                <SettingsName tall={tall} />
                <SettingsSearch query={query} onQueryChange={setQuery} />
                <SideNav
                  groups={groups}
                  query={query}
                  active={active}
                  onSelect={setActive}
                />
              </div>
            ) : null}

            {/* The pane. Its heading is the section's own name, so the nav and the
                pane always agree about what is open without either saying it
                twice.

                `pt-6` over the body's own `py-1`: the heading is the top edge of
                the pane's content, so it wants clearance from the frame rather
                than sitting flush against it. `pe-14` keeps it from running
                underneath the close button.

                Tall, the header has already said the card's name and the tabs
                have said the section's, so this heading is dropped — the same
                words twice, a hundred pixels apart, reads as a mistake. */}
            <DialogBody className="pt-6 pb-6 pe-14">
              {current?.id === "general" ? (
                <>
                  <PaneHeading label={current.label} hidden={tall} />
                  <GeneralSettings />
                </>
              ) : current?.id === "privacy" ? (
                <>
                  <PaneHeading label={current.label} hidden={tall} />
                  <PrivacySettings />
                </>
              ) : current?.id === "api-keys" ? (
                /* This pane draws its own heading. It carries the count of
                   keys and the button that adds one, which the shared
                   heading has no room for — and it needs the card's shape to
                   know whether the strip of tabs has already named the
                   section. */
                <KeySettings label={current.label} tall={tall} />
              ) : current ? (
                <>
                  <PaneHeading label={current.label} hidden={tall} />
                  <p className="text-sm text-muted-foreground">
                    Nothing here yet — this section has no controls behind it.
                  </p>
                </>
              ) : null}
            </DialogBody>
          </Card>
          </div>
      </DialogContent>
    </Dialog>
  )
}
