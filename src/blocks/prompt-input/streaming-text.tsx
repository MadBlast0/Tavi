"use client"

import * as React from "react"
import { cn } from "cn"

import { useSmoothText } from "./use-smooth-text"

const freshTokens = 16

type StreamingTextProps = Omit<React.ComponentProps<"div">, "children"> & {
  text: string
  streaming?: boolean
  smooth?: boolean
  charsPerSecond?: number
}

function StreamingText({
  text,
  streaming = false,
  smooth = true,
  charsPerSecond,
  className,
  ...props
}: StreamingTextProps) {
  const visible = useSmoothText(text, {
    streaming,
    enabled: smooth,
    charsPerSecond,
  })
  const active = streaming || visible.animating
  const tokens = visible.text.split(/(\s+)/)
  const freshFrom = active ? Math.max(0, tokens.length - freshTokens) : tokens.length

  return (
    <div
      aria-busy={active}
      aria-live="polite"
      data-streaming={active ? "" : undefined}
      className={cn("whitespace-pre-wrap", className)}
      {...props}
    >
      {tokens.slice(0, freshFrom).join("")}
      {tokens.slice(freshFrom).map((token, index) => (
        <span
          key={freshFrom + index}
          className="motion-safe:animate-in motion-safe:animation-duration-500 motion-safe:fade-in-0"
        >
          {token}
        </span>
      ))}
      {active ? (
        <span
          aria-hidden="true"
          className="ms-0.5 inline-block h-3.5 w-1.5 translate-y-0.5 rounded-xs bg-foreground/60 motion-safe:animate-pulse"
        />
      ) : null}
    </div>
  )
}

export { StreamingText, type StreamingTextProps }
