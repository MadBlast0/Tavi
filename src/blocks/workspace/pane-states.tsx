"use client"

import * as React from "react"

import { CircleAlertIcon, type LucideIcon } from "lucide-react"

import { Button } from "@/components/button"
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/empty"
import { Skeleton, SkeletonText } from "@/components/skeleton"
import { cn } from "@/lib/utils"

/**
 * The shared states a pane's content can be in.
 *
 * A pane's header stays put while its content changes state, and the state
 * is the same shape in every pane: a small icon, a concise title, a line
 * of explanation, and at most one action. The copy and the icon are the
 * pane's own, because a Terminal's empty state and a Diff Viewer's empty
 * state are different things and should not say the same words.
 *
 * Four states, and no others:
 *
 * - **empty** — there is nothing here yet, and one action fills it;
 * - **loading** — the content is on its way, and a skeleton shaped like it
 *   is shown rather than a spinner;
 * - **error** — something went wrong, and a retry is offered only when the
 *   retry can actually happen;
 * - **unavailable** — the real tool is not connected, and the pane says so
 *   plainly rather than showing an error it cannot fix.
 */

/**
 * An empty pane.
 *
 * The icon, the title, the description and the action are all the pane's
 * own. The action is optional, because not every empty state has one, and
 * the empty state carries at most one.
 */
export function PaneEmpty({
  icon: Icon,
  title,
  description,
  action,
  className,
}: {
  icon: LucideIcon
  title: string
  description?: string
  action?: React.ReactNode
  className?: string
}) {
  return (
    <Empty size="sm" className={cn("h-full", className)}>
      <EmptyHeader>
        <EmptyMedia variant="icon">
          <Icon />
        </EmptyMedia>
        <EmptyTitle>{title}</EmptyTitle>
        {description ? <EmptyDescription>{description}</EmptyDescription> : null}
      </EmptyHeader>
      {action ? <EmptyContent>{action}</EmptyContent> : null}
    </Empty>
  )
}

/**
 * A loading pane.
 *
 * The caller supplies a skeleton shaped like the content that is on its way,
 * so the pane does not jump when it arrives. A bare spinner is not used,
 * because a spinner says "something is happening" and a skeleton says "this
 * is what you are about to see".
 */
export function PaneLoading({
  children,
  className,
}: {
  /** A skeleton shaped like the expected content. */
  children?: React.ReactNode
  className?: string
}) {
  return (
    <div
      data-slot="pane-loading"
      aria-busy="true"
      aria-live="polite"
      className={cn("flex min-h-0 flex-1 flex-col gap-2 p-3", className)}
    >
      {children ?? (
        <>
          <Skeleton className="h-4 w-3/4" />
          <Skeleton className="h-4 w-1/2" />
          <Skeleton className="h-4 w-5/6" />
        </>
      )}
    </div>
  )
}

/**
 * An error pane.
 *
 * The title says what went wrong in user-facing language, the description
 * says why, and the retry is offered only when the retry can actually
 * happen. A retry that does nothing is worse than no retry.
 */
export function PaneError({
  title,
  description,
  onRetry,
  className,
}: {
  title: string
  description?: string
  onRetry?: () => void
  className?: string
}) {
  return (
    <div
      data-slot="pane-error"
      role="alert"
      className={cn("flex min-h-0 flex-1 flex-col items-center justify-center gap-2 p-4 text-center", className)}
    >
      <CircleAlertIcon className="size-6 text-destructive" />
      <p className="text-sm font-medium text-foreground">{title}</p>
      {description ? (
        <p className="text-xs text-muted-foreground">{description}</p>
      ) : null}
      {onRetry ? (
        <Button variant="outline" size="sm" onClick={onRetry} className="mt-1">
          Try again
        </Button>
      ) : null}
    </div>
  )
}

/**
 * An unavailable pane.
 *
 * The real tool is not connected, or is not implemented in this phase, and
 * the pane says so plainly. It is not an error: nothing went wrong, and
 * there is nothing to retry. The distinction matters, because a retry button
 * on an unavailable pane is a button that does nothing.
 */
export function PaneUnavailable({
  title,
  description,
  className,
}: {
  title: string
  description?: string
  className?: string
}) {
  return (
    <div
      data-slot="pane-unavailable"
      className={cn("flex min-h-0 flex-1 flex-col items-center justify-center gap-2 p-4 text-center", className)}
    >
      <p className="text-sm font-medium text-foreground">{title}</p>
      {description ? (
        <p className="text-xs text-muted-foreground">{description}</p>
      ) : null}
    </div>
  )
}

/**
 * A text skeleton, sized by the caller.
 *
 * A convenience over the app's `Skeleton` for the common case of a line
 * of text. The caller says how many lines and how wide.
 */
export function PaneSkeletonText({
  lines = 3,
  className,
}: {
  lines?: number
  className?: string
}) {
  return (
    <div className={cn("flex flex-col gap-2", className)}>
      {Array.from({ length: lines }).map((_, i) => (
        <SkeletonText
          key={i}
          className={i === lines - 1 ? "w-2/3" : "w-full"}
        />
      ))}
    </div>
  )
}
