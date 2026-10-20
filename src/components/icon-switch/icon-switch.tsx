"use client"

import * as React from "react"

import { ToggleGroup, ToggleGroupItem } from "@/components/toggle-group"
import { cn } from "@/lib/utils"

/**
 * A segmented switch whose items are icons, with the selected one's label
 * appearing beside it.
 *
 * This is the control the Chat/Code switch in the rail is made of, extracted so
 * that a second use of the same idea — the theme switch in settings — cannot
 * drift from it. The behaviour is worth stating once: the unselected options
 * keep their icon and drop their label, so the control is always exactly as wide
 * as its selected option and never reflows when the choice changes; and the
 * highlight is a pill that slides, carried by the toggle group's own indicator
 * rather than by anything drawn here.
 *
 * The label opens with an animated grid track rather than a width, because the
 * track is content-sized. A width would have to be a number, so a longer label
 * would either clip or force the control wider on its own; `0fr` to `1fr` lets
 * the label take whatever width it needs while still animating.
 */
export type IconSwitchOption<Value extends string> = {
  value: Value
  label: string
  icon: React.ReactNode
  /**
   * A short count shown beside the option.
   *
   * It is generic on purpose. The component is shared with the theme switch in
   * settings, and an affordance that only made sense for one of its users would
   * leak into the other — which is the drift the component's own comment warns
   * against.
   */
  badge?: React.ReactNode
}

export function IconSwitch<Value extends string>({
  value,
  onValueChange,
  options,
  className,
  itemClassName,
  "aria-label": ariaLabel,
}: {
  value: Value
  onValueChange: (value: Value) => void
  options: IconSwitchOption<Value>[]
  className?: string
  itemClassName?: string
  "aria-label": string
}) {
  return (
    <ToggleGroup
      className={cn("gap-0 rounded-[1.625rem] bg-muted/50 p-1", className)}
      aria-label={ariaLabel}
      size="sm"
      /* A single choice in a control whose value is a list, so it goes in and
         comes out as a one-item array. The `multiple` prop would express that
         more honestly, but the primitive infers its value type from this one
         argument, and an explicit `false` does not narrow it back. An empty
         array means nothing is pressed; that cannot happen here, since the
         store behind both uses always holds one of the options. */
      value={[value]}
      onValueChange={(next) => {
        const [first] = next
        if (first) onValueChange(first as Value)
      }}
    >
      {options.map((option) => (
        <ToggleGroupItem
          key={option.value}
          value={option.value}
          /* The label is what says which option this is to a screen reader and
             on hover, since the icon alone does not. It sits inside the button
             rather than beside it so it is part of the accessible name. */
          aria-label={option.label}
          title={option.label}
          className={cn("rounded-full gap-0 px-2", itemClassName)}
        >
          <span className="flex size-4 shrink-0 items-center justify-center [&_svg]:size-4">
            {option.icon}
          </span>
          {/* The count sits outside the collapsing label, so it is there
              whichever option is selected. It says what is behind the switch
              before you take it. */}
          {option.badge ? (
            <span className="ms-1 rounded-full bg-muted px-1.5 text-[0.625rem] leading-4 tabular-nums text-muted-foreground">
              {option.badge}
            </span>
          ) : null}
          {/* Collapses to zero width when unselected. The easing matches the
              indicator's own glide, so the two move as one thing. */}
          <span
            className={cn(
              "ms-0 grid grid-cols-[0fr] transition-[grid-template-columns] duration-300",
              "ease-[cubic-bezier(0.22,1,0.36,1)] motion-reduce:transition-none",
              "group-data-pressed/toggle:ms-1.5",
              "group-data-pressed/toggle:grid-cols-[1fr]"
            )}
          >
            <span
              className={cn(
                "overflow-hidden whitespace-nowrap opacity-0",
                "transition-opacity duration-200 motion-reduce:transition-none",
                "group-data-pressed/toggle:opacity-100"
              )}
            >
              {option.label}
            </span>
          </span>
        </ToggleGroupItem>
      ))}
    </ToggleGroup>
  )
}