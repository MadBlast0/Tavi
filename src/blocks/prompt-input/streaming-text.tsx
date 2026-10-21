"use client"

import * as React from "react"
import { cn } from "cn"

import { MarkdownBody } from "@/components/markdown-text"

import { useSmoothText } from "./use-smooth-text"

const freshTokens = 16

type StreamingTextProps = Omit<React.ComponentProps<"div">, "children"> & {
  text: string
  streaming?: boolean
  smooth?: boolean
  charsPerSecond?: number
}

/**
 * A model's answer, as it arrives and after it has.
 *
 * The answer is Markdown, because models answer in Markdown and a reader who
 * sees `**bold**` and `|` and `#` where a heading and a table were meant has
 * been shown the transport rather than the answer. The renderer is the same
 * one the assistant-ui branch uses, so there is one set of styles for
 * Markdown in this app rather than two.
 *
 * The text is revealed smoothly while it arrives, and the whole answer is
 * parsed as Markdown throughout — including the half-finished sentence — so
 * the formatting never jumps at the end of the turn. The stylesheet draws a
 * pulsing mark after the last line while the answer is arriving, which is
 * where a cursor belongs: inside the last paragraph, where the text is, and
 * not on a line of its own below it.
 */
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

  return (
    <div
      aria-busy={active}
      aria-live="polite"
      data-streaming={active ? "" : undefined}
      className={cn("text-base/relaxed", className)}
      {...props}
    >
      <MarkdownBody text={visible.text} status={active ? "running" : undefined} />
    </div>
  )
}

export { StreamingText, type StreamingTextProps }
