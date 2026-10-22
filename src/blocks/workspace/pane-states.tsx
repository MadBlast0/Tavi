"use client"

import * as React from "react"
import {
  AlertCircleIcon,
  CloudOffIcon,
  InboxIcon,
  Loader2Icon,
} from "lucide-react"

import { Button } from "@/components/button"
import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/empty"
import { Skeleton } from "@/components/skeleton"
import { cn } from "@/lib/utils"

/**
 * The pane's own state, shown in its content area.
 *
 * A pane's header stays visible while the content changes state, so the
 * reader always knows which pane they are looking at. The four states are
 * the ones a pane can be in that are not "showing its content": empty,
 * loading, error and unavailable.
 *
 * Each state is a small component that takes its own text, so a pane
 * supplies the words that fit it rather than inheriting a sentence that
 * was written for a different one. The shape is the same everywhere, which
 * is the point: the states are the app's, not each pane's.
 */

/**
 * Empty.
 *
 * A pane with nothing in it yet. A small mark, a title, a line, and at
 * most one action.
 */
export function PaneEmpty({
  icon: Icon = InboxIcon,
  title,
  description,
  action,
  actionLabel,
  className,
}: {
  icon?: React.ComponentType<{ className?: string }>
  title: string
  description?: string
  action?: () => void
  actionLabel?: string
  className?: string
}) {
  return (
    <Empty size="sm" className={cn("flex-1", className)}>
      <EmptyHeader>
        <EmptyMedia variant="icon">
          <Icon />
        </EmptyMedia>
        <EmptyTitle>{title}</EmptyTitle>
        {description ? <EmptyDescription>{description}</EmptyDescription> : null}
      </EmptyHeader>
      {action && actionLabel ? (
        <EmptyContent>
          <Button size="sm" onClick={action}>
            {actionLabel}
          </Button>
        </EmptyContent>
      ) : null}
    </Empty>
  )
}

/**
 * Loading.
 *
 * A skeleton shaped like the expected content. The shape is the caller's,
 * because a chat's loading skeleton looks nothing like a terminal's.
 */
export function PaneLoading({
  children,
  className,
}: {
  /** The skeleton, shaped like the content. */
  children?: React.ReactNode
  className?: string
}) {
  return (
    <div className={cn("flex min-h-0 flex-1 flex-col gap-2 p-3", className)}>
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
 * Error.
 *
 * Something went wrong with the local state. The title says what, the
 * detail says why, and the retry is offered only when it can actually be
 * retried.
 */
export function PaneError({
  title,
  detail,
  onRetry,
  className,
}: {
  title: string
  detail?: string
  onRetry?: () => void
  className?: string
}) {
  return (
    <div
      className={cn(
        "flex min-h-0 flex-1 flex-col items-center justify-center gap-2 p-4 text-center",
        className,
      )}
    >
      <AlertCircleIcon className="size-6 text-destructive" />
      <p className="text-sm font-medium">{title}</p>
      {detail ? (
        <p className="max-w-xs text-xs text-muted-foreground">{detail}</p>
      ) : null}
      {onRetry ? (
        <Button size="sm" variant="outline" onClick={onRetry}>
          Try again
        </Button>
      ) : null}
    </div>
  )
}

/**
 * Unavailable.
 *
 * The real integration is not connected, or is not implemented in this
 * phase. It is not an error, and it is not drawn as one — it is a fact
 * about what the app can do right now.
 */
export function PaneUnavailable({
  title,
  detail,
  className,
}: {
  title: string
  detail?: string
  className?: string
}) {
  return (
    <div
      className={cn(
        "flex min-h-0 flex-1 flex-col items-center justify-center gap-2 p-4 text-center",
        className,
      )}
    >
      <CloudOffIcon className="size-6 text-muted-foreground" />
      <p className="text-sm font-medium">{title}</p>
      {detail ? (
        <p className="max-w-xs text-xs text-muted-foreground">{detail}</p>
      ) : null}
    </div>
  )
}

/**
 * The spinner, for the rare case where a skeleton is not the right shape.
 */
export function PaneSpinner({ className }: { className?: string }) {
  return (
    <div className={cn("flex min-h-0 flex-1 items-center justify-center", className)}>
      <Loader2Icon className="size-5 animate-spin text-muted-foreground" />
    </div>
  )
}
