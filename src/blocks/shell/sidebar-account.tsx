"use client"

import * as React from "react"
import {
  ChevronDownIcon,
  CircleArrowUpIcon,
  CircleHelpIcon,
  GlobeIcon,
  InfoIcon,
  KeyRoundIcon,
  LayoutGridIcon,
  LogOutIcon,
  SettingsIcon,
  SquareArrowOutUpRightIcon,
} from "lucide-react"

import { Avatar, AvatarFallback } from "@/components/avatar"
import { Button } from "@/components/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuShortcut,
  DropdownMenuTrigger,
} from "@/components/dropdown-menu"
import { SidebarFooter } from "@/components/sidebar"
import { formatHotkey, useIsApple } from "@/lib/hotkey"
import { SETTINGS_HOTKEY } from "./settings-dialog"

/**
 * Who this row is. The only part of the account menu that is a fact about a
 * person rather than about this machine; everything else on the row is read
 * from the provider key at runtime.
 *
 * `initials` is derived rather than written, so changing the name does not
 * leave a stale letter behind in the avatar.
 */
const ACCOUNT = {
  name: "MadBlast",
}

/**
 * A menu row.
 *
 * The component's own row is 32px tall with 6px of padding above and below,
 * which is room for a list of ten. This one has eight and sits at the bottom of
 * a rail the reader is not looking at, so it takes the component's compact
 * height instead and the padding down to nothing — the height, not the words,
 * is what makes it dense.
 */
const ITEM = "min-h-7 gap-1.5 py-1 text-[0.8125rem] [&_svg:not([class*='size-'])]:size-4"

/**
 * The one icon for "apps and extensions", in the rail and in the menu.
 *
 * The square at the bottom of the rail and the row in this menu are the same
 * feature reached from two places, so they carry the same mark. Two different
 * glyphs for one destination would make the rail's button look like something
 * else entirely.
 */
const APPS_LABEL = "Apps and extensions"
const AppsIcon = LayoutGridIcon
const APPS_TITLE = "Not built yet — there are no extensions"

/**
 * "MadBlast" -> "M", "Ada Lovelace" -> "AL".
 *
 * One word gives one letter. Taking the first two would read as a different
 * initial pair than the one the name already carries.
 */
function initialsOf(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean)
  if (words.length === 0) return "?"
  if (words.length === 1) return words[0][0].toUpperCase()
  return (words[0][0] + words[words.length - 1][0]).toUpperCase()
}

/** What `/api/key` reports. The key itself never leaves the server. */
type KeyStatus = {
  valid: boolean
  isFreeTier?: boolean
}

/**
 * The row at the bottom of the rail, and the menu it opens.
 *
 * One block. The avatar, the name, the plan, the chevron and the grid button
 * are the same control, because a row that only answers on its chevron is a row
 * whose hit area nobody can guess.
 *
 * It opens on click and never on hover. A menu that appears because the pointer
 * crossed it will open on the way to something else and close on the way away
 * from it, which is not a thing anyone asked for.
 *
 * Nothing about the row changes while its menu is open. The tint belongs to the
 * pointer being over it; a row that stays lit after the click reads as still
 * pressed, and the menu appearing above it is already all the indication there
 * needs to be.
 *
 * It opens upward, because below it is the edge of the window.
 *
 * The items are the account menu. Only the plan badge is real — it is read from
 * the provider key's own free-tier flag — because there is no account system
 * behind the rest of them yet. They are drawn at full strength because a menu
 * full of greyed rows is not the menu; each one carries a title saying what it
 * will do when it does something, so nothing here is quietly pretending.
 */
export function SidebarAccount({
  onOpenSettings,
}: {
  onOpenSettings: () => void
}) {
  const [status, setStatus] = React.useState<KeyStatus | null>(null)
  const apple = useIsApple()
  /**
   * A zero-width mark pinned to the row's left edge, used as the menu's anchor.
   *
   * The positioner decides between `start` and `end` on its own, and on a wide
   * rail it chose `end` — which put the menu 178px in from the rail's edge,
   * under a button that stretches the whole rail. Anchoring to something with no
   * width makes both answers the same coordinate, so the decision stops mattering
   * and the menu lands on the rail's left at every rail width. It is out of flow
   * so it adds no gap to the row.
   */
  const anchorRef = React.useRef<HTMLSpanElement>(null)

  React.useEffect(() => {
    let cancelled = false
    fetch("/api/key")
      .then((response) => response.json())
      .then((data: KeyStatus) => {
        if (!cancelled) setStatus(data)
      })
      .catch(() => {
        /* Server unreachable. The badge is simply absent, which is true. */
      })
    return () => {
      cancelled = true
    }
  }, [])

  return (
    <SidebarFooter className="border-t border-sidebar-border p-1">
      {/* Two controls, not one. The identity opens the menu; the square beside it
          is its own thing and must not be swallowed by it. */}
      <div className="relative flex items-center gap-1">
        <span ref={anchorRef} aria-hidden className="absolute inset-y-0 start-0 w-0" />
        <DropdownMenu>
          <DropdownMenuTrigger
            render={
              <Button
                variant="ghost"
                /* Sized to its contents, and the square is pushed to the far
                   end with `ms-auto`. Letting this one grow to fill the row drew
                   the row's hover tint across the empty space between the
                   chevron and the square, so a control that ends at the arrow
                   looked like a control that runs to the edge. The gap between
                   them belongs to neither of them. */
                /* `not-hover` so the rule only applies when the pointer is elsewhere: with a
                   plain `aria-expanded:` override, whether the row still tinted
                   under the cursor while its menu was open came down to which
                   variant the stylesheet happened to emit last. Scoped this way,
                   hovering always wins and the row is tinted by hover alone. */
                className="h-auto min-w-0 shrink-0 justify-start gap-2 px-2 py-1 text-start aria-expanded:not-hover:bg-transparent"
                aria-label="Account menu"
              />
            }
          >
            <Avatar className="size-7 shrink-0">
              <AvatarFallback className="text-[0.6875rem] font-medium">
                {initialsOf(ACCOUNT.name)}
              </AvatarFallback>
            </Avatar>
            {/* No `flex-1` on the name. Stretching it pushed the plan and the
                chevron to the far end of the rail, against the square on the
                other side, so the identity read as three unrelated things.
                They sit against the name instead: who, what they are on, and
                the way out of here. */}
            <span className="min-w-0 truncate text-[0.8125rem] font-medium">
              {ACCOUNT.name}
            </span>
            {status?.isFreeTier ? (
              <span className="shrink-0 text-xs text-muted-foreground">Free</span>
            ) : null}
            <ChevronDownIcon className="size-4 shrink-0 text-muted-foreground" />
          </DropdownMenuTrigger>

          {/* Sized from the rail's own width, so it sits inside the rail at any width the
              rail can be dragged to. The portal gives it the document root's
              `--sidebar-width` to work from; without a ceiling it would spill
              into the work area, which is what a menu belonging to the rail
              should never do. `min-w-0` is needed as well as the ceiling: the
              component's own floor is the width of whatever opened it, and the
              identity block is most of the rail, so a wide rail would otherwise
              drag the menu out past the rail's edge anyway. */}
          <DropdownMenuContent
            side="top"
            align="start"
            sideOffset={8}
            collisionPadding={8}
            className="w-[min(16rem,calc(var(--sidebar-width)-0.75rem))] min-w-0 p-1"
            /* Anchored to the row, not to the button inside it. The button grows
               to fill the rail, so aligning to it left the menu hanging off
               whichever end base-ui decided fitted — at a 440px rail that put
               it 150px in from the left edge. The row's own left edge is the
               rail's left edge at every rail width, so anchoring there is what
               actually means "put it on the left". */
            anchor={anchorRef}
          >
            <DropdownMenuItem className={ITEM} onClick={onOpenSettings}>
              <SettingsIcon />
              Settings
              <DropdownMenuShortcut>
                {formatHotkey(SETTINGS_HOTKEY, apple)}
              </DropdownMenuShortcut>
            </DropdownMenuItem>
            <DropdownMenuItem className={ITEM} title="Not built yet — the app has one language">
              <GlobeIcon />
              Language
            </DropdownMenuItem>
            <DropdownMenuItem className={ITEM} title="Not built yet — there is nowhere to send you">
              <CircleHelpIcon />
              Get help
            </DropdownMenuItem>

            <DropdownMenuSeparator />
            <DropdownMenuItem className={ITEM} title="Not built yet — there is no billing">
              <CircleArrowUpIcon />
              Upgrade plan
            </DropdownMenuItem>
            <DropdownMenuItem className={ITEM} title={APPS_TITLE}>
              <AppsIcon />
              {APPS_LABEL}
            </DropdownMenuItem>
            <DropdownMenuItem
              className={ITEM}
              title="Not built yet — there is no documentation site"
            >
              <InfoIcon />
              Learn more
              <ChevronDownIcon className="ms-auto size-4 -rotate-90" />
            </DropdownMenuItem>

            <DropdownMenuSeparator />
            <DropdownMenuItem className={ITEM} title="Not built yet — the key lives in the server's environment">
              <KeyRoundIcon />
              Get API keys
              <SquareArrowOutUpRightIcon className="ms-auto size-3.5" />
            </DropdownMenuItem>
            <DropdownMenuItem className={ITEM} title="Not built yet — there is no session to end">
              <LogOutIcon />
              Log out
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>

        <Button
          variant="ghost"
          size="icon-sm"
          aria-label={APPS_LABEL}
          title={APPS_TITLE}
          className="ms-auto shrink-0"
        >
          {/* 16px, like every other icon in the rail. This was 20px, which made
              it the only icon that size anywhere in the sidebar and the
              brightest thing in a footer whose other marks — the chevron, the
              avatar — are muted. An outlined glyph at 20px reads heavier than
              the filled 28px avatar beside it, not matched to it, so matching
              the avatar was the wrong way round to be matching. */}
          <AppsIcon />
        </Button>
      </div>
    </SidebarFooter>
  )
}