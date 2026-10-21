"use client"

import * as React from "react"

import { cn } from "@/lib/utils"

/**
 * One setting: a name, what it is for, and the control that changes it.
 *
 * The control sits at the far end rather than under the name because these are
 * read as a table, not as prose — the eye runs down the names and across to
 * whatever is set. A control under its name would make every row twice as tall
 * and put the thing being changed as far from the thing changed as the card
 * allows.
 *
 * The name and its description stack on the left and the control stays put on
 * the right even when a description wraps to two lines, because `items-start`
 * pins the control to the first line rather than letting it drift to the
 * middle of the row.
 *
 * **The row wraps when the pane is too narrow for both.** The name keeps a
 * basis it would rather have — enough for a name and a line of description —
 * and the control keeps its own size, so when the two cannot share a line the
 * control drops below the name. The alternative is the name being squeezed
 * into whatever is left, and a name in a sliver breaks one letter per line,
 * which is worse than a row that is taller.
 *
 * `why` is what a control with nothing behind it says when you try to use it.
 * It is on the row rather than under the control, because a greyed control on
 * its own is a mystery and a sentence next to it is an answer.
 */
export function SettingRow({
  label,
  description,
  why,
  children,
  className,
}: {
  /** What the setting is called. */
  label: string
  /** What the setting is for. Omit it for a row that needs no explanation. */
  description?: string
  /** Why this row cannot be changed yet. Omit it for a row that works. */
  why?: string
  /** The control that changes it. */
  children?: React.ReactNode
  className?: string
}) {
  return (
    <div
      className={cn(
        "flex flex-wrap items-start justify-between gap-x-6 gap-y-3 border-b py-4 last:border-b-0",
        className,
      )}
      title={why}
    >
      {/* `grow` rather than `flex-1`, so the basis is the width the name would
          rather have and the free space is what it takes. `min-w-0` lets it
          shrink below that when the pane is narrower still. */}
      <div className="min-w-0 grow basis-48">
        <div className="text-sm font-medium">{label}</div>
        {description ? (
          <p className="mt-0.5 text-sm text-pretty text-muted-foreground">
            {description}
          </p>
        ) : null}
      </div>
      {children ? (
        /* `ms-auto` keeps the control at the far end of the row when it has
           dropped to a line of its own, so a stacked row still reads as a
           table rather than as two things that happen to be near each other. */
        <div className="ms-auto shrink-0 pt-0.5">{children}</div>
      ) : null}
    </div>
  )
}
