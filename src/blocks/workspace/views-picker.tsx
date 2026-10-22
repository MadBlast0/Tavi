"use client"

import * as React from "react"
import { PlusIcon } from "lucide-react"

import { Button } from "@/components/button"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/popover"
import { PANE_TYPES } from "./pane-types"
import { cn } from "@/lib/utils"

/**
 * The groups the pane types are listed in.
 *
 * Four, and they are the plan's own: conversations, development, files,
 * and what happened. The order is the order a person would think in — what
 * I am talking to, what I am doing, what I am looking at, and what
 * happened — rather than the alphabetical order of the type keys, which is
 * an order for a machine.
 */
const GROUPS: { label: string; ids: string[] }[] = [
  { label: "Conversations", ids: ["chat", "code-session"] },
  {
    label: "Development",
    ids: ["diff", "terminal", "browser", "app-preview"],
  },
  { label: "Files", ids: ["file-explorer", "file-editor", "file-preview"] },
  {
    label: "Activity",
    ids: ["plan", "tasks", "agent-activity", "logs"],
  },
]

/** Why a type cannot be added yet. */
const NOT_YET = "Not built yet — there is no pane to put it in"

/**
 * The Views picker.
 *
 * It is the list of the kinds of view a workspace can hold, taken from the
 * one list that says what those kinds *are*: `pane-types.ts`. The registry
 * will extend that list with a renderer and a set of actions, and this
 * picker will follow it rather than keep a copy.
 *
 * **Nothing can be added yet.** The panes themselves are later work, and the
 * layout that would hold them later still, so every entry says so rather
 * than pretending. A button that does nothing is worse than a button that
 * says why it is not going to.
 */
export function ViewsPicker({
  className,
}: {
  className?: string
}) {
  const [open, setOpen] = React.useState(false)

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        render={
          <Button variant="outline" size="sm" className={className} />
        }
      >
        <PlusIcon />
        Add view
      </PopoverTrigger>
      <PopoverContent
        align="center"
        className="w-72 p-0"
        aria-label="Views"
      >
        <div className="max-h-80 overflow-y-auto p-1">
          {GROUPS.map((group) => {
            const types = group.ids
              .map((id) => PANE_TYPES.find((type) => type.id === id))
              .filter((type): type is (typeof PANE_TYPES)[number] => !!type)
            if (types.length === 0) return null
            return (
              <div key={group.label} className="mb-1 last:mb-0">
                <p className="px-2 py-1.5 text-xs text-muted-foreground">
                  {group.label}
                </p>
                {types.map((type) => (
                  <button
                    key={type.id}
                    type="button"
                    disabled
                    title={NOT_YET}
                    className={cn(
                      "flex w-full items-start gap-2.5 rounded-md px-2 py-2 text-start",
                      "cursor-not-allowed opacity-50",
                    )}
                  >
                    <type.icon className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
                    <span className="min-w-0 flex-1">
                      <span className="block text-sm font-medium">
                        {type.label}
                      </span>
                      <span className="block text-xs text-muted-foreground">
                        {type.description}
                      </span>
                    </span>
                  </button>
                ))}
              </div>
            )
          })}
        </div>
      </PopoverContent>
    </Popover>
  )
}
