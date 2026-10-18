"use client"

import * as React from "react"

type SmoothTextOptions = {
  streaming?: boolean
  enabled?: boolean
  charsPerSecond?: number
}

const catchUpSeconds = 0.3
const flushSeconds = 0.12

function isHighSurrogate(code: number) {
  return code >= 0xd800 && code <= 0xdbff
}

function commonPrefixLength(a: string, b: string) {
  const limit = Math.min(a.length, b.length)
  let index = 0
  while (index < limit && a.charCodeAt(index) === b.charCodeAt(index)) index++
  if (index > 0 && isHighSurrogate(a.charCodeAt(index - 1))) index--
  return index
}

function useSmoothText(
  text: string,
  { streaming = false, enabled = true, charsPerSecond = 90 }: SmoothTextOptions = {}
) {
  const [displayed, setDisplayed] = React.useState(() =>
    enabled && streaming ? "" : text
  )
  const textRef = React.useRef(text)
  const streamingRef = React.useRef(streaming)
  const positionRef = React.useRef(displayed.length)
  const frameRef = React.useRef<number | null>(null)
  const lastTimeRef = React.useRef<number | null>(null)

  const tick = React.useCallback(
    (now: number) => {
      const target = textRef.current
      const last = lastTimeRef.current ?? now
      const elapsed = Math.min(now - last, 100) / 1000
      lastTimeRef.current = now

      const backlog = target.length - positionRef.current
      const window = streamingRef.current ? catchUpSeconds : flushSeconds
      const rate = charsPerSecond + backlog / window
      const position = Math.min(
        target.length,
        positionRef.current + rate * elapsed
      )
      positionRef.current = position

      let index = Math.floor(position)
      if (index < target.length && isHighSurrogate(target.charCodeAt(index - 1))) {
        index += 1
      }
      setDisplayed(target.slice(0, index))

      if (position < target.length) {
        frameRef.current = requestAnimationFrame(tick)
      } else {
        frameRef.current = null
        lastTimeRef.current = null
      }
    },
    [charsPerSecond]
  )

  React.useEffect(() => {
    textRef.current = text
    streamingRef.current = streaming

    if (!enabled) {
      if (frameRef.current !== null) cancelAnimationFrame(frameRef.current)
      frameRef.current = null
      lastTimeRef.current = null
      positionRef.current = text.length
      setDisplayed(text)
      return
    }

    if (positionRef.current > text.length) {
      positionRef.current = text.length
    }

    if (frameRef.current === null && positionRef.current < text.length) {
      frameRef.current = requestAnimationFrame(tick)
    }
  }, [text, streaming, enabled, tick])

  React.useEffect(
    () => () => {
      if (frameRef.current !== null) cancelAnimationFrame(frameRef.current)
      frameRef.current = null
      lastTimeRef.current = null
    },
    []
  )

  const visible = !enabled
    ? text
    : text.startsWith(displayed)
      ? displayed
      : text.slice(0, commonPrefixLength(text, displayed))

  if (enabled && visible.length < positionRef.current) {
    positionRef.current = visible.length
  }

  return {
    text: visible,
    animating: visible.length < text.length,
  }
}

export { useSmoothText, type SmoothTextOptions }
