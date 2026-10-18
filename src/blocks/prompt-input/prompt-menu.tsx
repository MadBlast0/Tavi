"use client"

import * as React from "react"
import { createPortal } from "react-dom"
import { cn } from "cn"


import { usePromptInput } from "./prompt-input"
import { haptic } from "./haptics"
import { findTrigger, getCaretRect, insertText } from "./text"

type PromptMenuItem = {
  value: string
  label: string
  description?: string
  icon?: React.ReactNode
  hint?: string
  keywords?: string[]
  insert?: string
}

type PromptInputMenuProps = {
  trigger: string
  items: PromptMenuItem[]
  mode?: "mention" | "text"
  label?: string
  limit?: number
  onSelect?: (item: PromptMenuItem) => void
}

function rank(item: PromptMenuItem, query: string) {
  if (!query) return 1
  const needle = query.toLowerCase()
  const label = item.label.toLowerCase()
  const value = item.value.toLowerCase()
  if (label.startsWith(needle) || value.startsWith(needle)) return 3
  if (label.includes(needle) || value.includes(needle)) return 2
  if (item.keywords?.some((word) => word.toLowerCase().includes(needle))) {
    return 1
  }
  return 0
}

function filterItems(items: PromptMenuItem[], query: string, limit: number) {
  return items
    .map((item, index) => ({ item, index, score: rank(item, query) }))
    .filter((entry) => entry.score > 0)
    .sort((a, b) => b.score - a.score || a.index - b.index)
    .slice(0, limit)
    .map((entry) => entry.item)
}

function Highlight({ text, query }: { text: string; query: string }) {
  const at = query ? text.toLowerCase().indexOf(query.toLowerCase()) : -1
  if (at < 0) return <>{text}</>
  return (
    <>
      {text.slice(0, at)}
      <span className="font-semibold text-foreground">
        {text.slice(at, at + query.length)}
      </span>
      {text.slice(at + query.length)}
    </>
  )
}

function PromptInputMenu({
  trigger,
  items,
  mode = trigger === "@" ? "mention" : "text",
  label = trigger === "@" ? "Mentions" : "Commands",
  limit = 8,
  onSelect,
}: PromptInputMenuProps) {
  const context = usePromptInput("PromptInputMenu")
  const listId = React.useId()
  const popupRef = React.useRef<HTMLDivElement>(null)
  const [active, setActive] = React.useState(0)
  const [dismissed, setDismissed] = React.useState<number | null>(null)
  const match = context.focused
    ? findTrigger(context.text, context.caret, [trigger])
    : null
  const results = match ? filterItems(items, match.query, limit) : []
  const open =
    Boolean(match) &&
    results.length > 0 &&
    dismissed !== match?.start &&
    !context.disabled
  const key = match ? `${match.start}:${match.query}` : ""
  const current = Math.min(active, Math.max(0, results.length - 1))

  React.useEffect(() => {
    setActive(0)
  }, [key])

  React.useEffect(() => {
    if (match === null || match.start !== dismissed) setDismissed(null)
  }, [match?.start])

  const choose = (item: PromptMenuItem) => {
    const field = context.textareaRef.current
    if (!field || !match) return
    haptic("tick")
    if (mode === "mention") {
      insertText(field, `${trigger}${item.label} `, match.start, match.end)
      context.addMention({ id: item.value, label: item.label, icon: item.icon })
      context.announce(`${item.label} added`)
    } else {
      insertText(
        field,
        item.insert ?? `${trigger}${item.value} `,
        match.start,
        match.end
      )
    }
    onSelect?.(item)
  }

  const handleRef = React.useRef<
    (event: React.KeyboardEvent<HTMLTextAreaElement>) => boolean
  >(() => false)
  handleRef.current = (event) => {
    if (!open || event.nativeEvent.isComposing) return false
    const count = results.length
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault()
      setActive(
        (current + (event.key === "ArrowDown" ? 1 : count - 1)) % count
      )
      return true
    }
    if ((event.key === "Enter" || event.key === "Tab") && !event.shiftKey) {
      event.preventDefault()
      choose(results[current])
      return true
    }
    if (event.key === "Escape") {
      event.preventDefault()
      setDismissed(match?.start ?? null)
      return true
    }
    return false
  }

  const { setMenu, announce } = context

  React.useEffect(() => {
    if (!open) return
    setMenu({
      listId,
      activeId: `${listId}-${current}`,
      handleKey: (event) => handleRef.current(event),
    })
  }, [open, current, listId, setMenu])

  React.useEffect(() => {
    if (!open) return
    return () => setMenu(null)
  }, [open, setMenu])

  React.useEffect(() => {
    if (open) {
      announce(
        `${results.length} ${results.length === 1 ? "suggestion" : "suggestions"}`
      )
    }
  }, [open])

  React.useLayoutEffect(() => {
    const field = context.textareaRef.current
    const popup = popupRef.current
    if (!open || !field || !popup || !match) return
    const caret = getCaretRect(field, match.start)
    const width = popup.offsetWidth
    const left = Math.max(8, Math.min(caret.left, window.innerWidth - width - 8))
    const above = caret.top > Math.min(320, window.innerHeight / 2)
    popup.dataset.side = above ? "top" : "bottom"
    popup.style.setProperty("--menu-left", `${left}px`)
    popup.style.setProperty(
      "--menu-y",
      above
        ? `${window.innerHeight - caret.top + 6}px`
        : `${caret.top + caret.height + 6}px`
    )
  }, [open, match?.start, context.text])

  React.useEffect(() => {
    if (!open) return
    document
      .getElementById(`${listId}-${current}`)
      ?.scrollIntoView?.({ block: "nearest" })
  }, [open, current, listId])

  if (!open || typeof document === "undefined") return null

  return createPortal(
    <div
      ref={popupRef}
      data-slot="prompt-input-menu"
      className="fixed left-(--menu-left) z-50 w-80 max-w-[calc(100vw-1rem)] data-[side=bottom]:top-(--menu-y) data-[side=top]:bottom-(--menu-y)"
    >
      <div className="flex flex-col overflow-hidden rounded-xl bg-popover text-popover-foreground shadow-lg ring-(length:--hairline) ring-foreground/10 motion-safe:animate-in motion-safe:animation-duration-100 motion-safe:fade-in-0">
        <div
          role="listbox"
          id={listId}
          aria-label={label}
          className="flex max-h-72 flex-col overflow-y-auto overscroll-contain p-1"
        >
          <div
            aria-hidden="true"
            className="px-2 pt-1.5 pb-1 text-xs font-medium text-muted-foreground"
          >
            {label}
          </div>
          {results.map((item, index) => (
            <div
              key={item.value}
              id={`${listId}-${index}`}
              role="option"
              aria-selected={index === current}
              data-active={index === current ? "" : undefined}
              onMouseDown={(event) => event.preventDefault()}
              onMouseMove={() => {
                if (index !== current) setActive(index)
              }}
              onClick={() => choose(item)}
              className="group/option flex h-8 shrink-0 cursor-default items-center gap-2.5 rounded-lg px-2 text-sm select-none data-active:bg-accent data-active:text-accent-foreground pointer-coarse:h-11 [&_svg]:size-4 [&_svg]:shrink-0 [&_svg]:text-muted-foreground data-active:[&_svg]:text-foreground"
            >
              {item.icon}
              <span className="shrink-0">
                <Highlight
                  text={mode === "text" ? `${trigger}${item.label}` : item.label}
                  query={match?.query ?? ""}
                />
              </span>
              {item.description ? (
                <span className="min-w-0 truncate text-muted-foreground">
                  {item.description}
                </span>
              ) : null}
              {item.hint ? (
                <span className="ms-auto min-w-0 shrink truncate ps-2 text-xs text-muted-foreground">
                  {item.hint}
                </span>
              ) : null}
            </div>
          ))}
        </div>
      </div>
    </div>,
    document.body
  )
}

export {
  PromptInputMenu,
  filterItems,
  type PromptInputMenuProps,
  type PromptMenuItem,
}
