"use client"

import * as React from "react"
import { InfoIcon } from "lucide-react"

import { Button } from "@/components/button"
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/tooltip"
import { cn } from "@/lib/utils"

/**
 * A note, behind a button.
 *
 * Most fields do not need a sentence of explanation, and a screen of
 * descriptions is a screen nobody reads. The ones that do get a small mark
 * beside the label that says it — so the explanation is there for the person
 * who wants it, and out of the way for the person who does not.
 *
 * The mark is a button, so it is reachable by keyboard and the note is
 * announced when it is focused. The note opens on hover, on focus **and** on
 * a click, because a pointer is not the only way to ask and a touch screen
 * has no hover at all.
 */
export function InfoHint({
  children,
  label = "More information",
  className,
  side = "bottom",
  align = "start",
}: {
  /** What the note says. */
  children: React.ReactNode
  /** What the button is called, for anyone who cannot see the mark. */
  label?: string
  className?: string
  /** Which side of the button the note opens on. */
  side?: "top" | "bottom" | "left" | "right"
  /** How the note lines up with the button. */
  align?: "start" | "center" | "end"
}) {
  const [open, setOpen] = React.useState(false)

  return (
    <Tooltip open={open} onOpenChange={setOpen}>
      <TooltipTrigger
        onClick={() => setOpen(true)}
        render={
          <Button
            type="button"
            variant="ghost"
            size="icon-xs"
            aria-label={label}
            aria-expanded={open}
            className={cn(
              /* The theme's own muted colour, at full strength: a mark that
                 is legible in the light theme and in the dark one, and that
                 is the same weight as the other quiet controls beside it. */
              "text-muted-foreground hover:text-foreground",
              className,
            )}
          />
        }
      >
        <InfoIcon className="size-3.5" />
      </TooltipTrigger>
      {/*
        The note is placed the way the rest of the app's overlays are placed:
        it prefers one side, flips to the other when there is no room, and
        shifts rather than running off the edge. A mark beside a label is
        usually near the top of a panel, where a note that opens upwards has
        nowhere to go.

        The width is fixed on the note itself rather than left to the text,
        because a note is measured before it is laid out: a paragraph measured
        on one line is wider than the screen, and the note would then be
        placed as if it were that wide.
      */}
      <TooltipContent
        side={side}
        align={align}
        sideOffset={8}
        collisionPadding={12}
        collisionAvoidance={{ side: "flip", align: "shift" }}
        className="w-64 max-w-[min(16rem,var(--available-width))]"
      >
        {children}
      </TooltipContent>
    </Tooltip>
  )
}
