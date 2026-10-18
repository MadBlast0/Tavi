"use client"

import * as React from "react"
import {
  IconArrowUp,
  IconCheck,
  IconHelpCircle,
  IconMicrophone,
  IconPlayerStopFilled,
  IconPaperclip,
  IconPlus,
  IconX,
} from "@tabler/icons-react"
import { cn } from "cn"

import { Button } from "@/components/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuShortcut,
  DropdownMenuTrigger,
} from "@/components/dropdown-menu"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/popover"
import { Kbd, KbdGroup } from "@/components/kbd"
import { NumberFlow } from "@/components/number-flow"
import { Switch } from "@/components/switch"
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/tooltip"

import { matchesHotkey } from "@/lib/hotkey"
import { easeOut, prefersReducedMotion, useSizeMorph } from "@/lib/motion"

import { usePromptInput } from "./prompt-input"
import { EffortFill } from "./effort-fill"
import { haptic } from "./haptics"
import { insertText } from "./text"

function refocus(field: HTMLTextAreaElement | null) {
  requestAnimationFrame(() => field?.focus())
}

function PromptInputAddMenu({
  children,
  label = "Add files and more",
  fileLabel = "Add photos and files",
}: {
  children?: React.ReactNode
  label?: string
  fileLabel?: string
}) {
  const context = usePromptInput("PromptInputAddMenu")

  return (
    <DropdownMenu>
      <Tooltip>
        <TooltipTrigger
          render={
            <DropdownMenuTrigger
              render={
                <Button
                  type="button"
                  size="icon"
                  variant="ghost"
                  aria-label={label}
                  disabled={context.disabled}
                  shape="pill"
                />
              }
            />
          }
        >
          <IconPlus />
        </TooltipTrigger>
        <TooltipContent>{label}</TooltipContent>
      </Tooltip>
      <DropdownMenuContent
        side="top"
        align="start"
        sideOffset={8}
        finalFocus={context.textareaRef}
      >
        <DropdownMenuItem onClick={context.openFileDialog}>
          <IconPaperclip />
          {fileLabel}
        </DropdownMenuItem>
        {children ? (
          <>
            <DropdownMenuSeparator />
            {children}
          </>
        ) : null}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

const toolTones = {
  blue: "text-chart-1 hover:bg-chart-1/10 focus-visible:bg-chart-1/10",
  green: "text-chart-2 hover:bg-chart-2/10 focus-visible:bg-chart-2/10",
  amber: "text-chart-3 hover:bg-chart-3/10 focus-visible:bg-chart-3/10",
  violet: "text-chart-4 hover:bg-chart-4/10 focus-visible:bg-chart-4/10",
  pink: "text-chart-5 hover:bg-chart-5/10 focus-visible:bg-chart-5/10",
} as const

type PromptToolTone = keyof typeof toolTones

function PromptInputTool({
  icon,
  children,
  tone = "blue",
  onRemove,
}: {
  icon: React.ReactNode
  children: string
  tone?: PromptToolTone
  onRemove: () => void
}) {
  const context = usePromptInput("PromptInputTool")
  const { registerTool } = context

  React.useLayoutEffect(registerTool, [registerTool])

  return (
    <button
      type="button"
      data-slot="prompt-input-tool"
      aria-label={`${children}, on. Turn off`}
      disabled={context.disabled}
      onClick={() => {
        haptic("tick")
        onRemove()
        refocus(context.textareaRef.current)
      }}
      className={cn(
        "group/tool inline-flex h-9 shrink-0 items-center gap-1.5 rounded-full px-2 text-sm font-medium outline-none select-none transition-colors duration-150 focus-visible:ring-3 focus-visible:ring-focus-ring disabled:pointer-events-none disabled:opacity-50 motion-safe:animate-in motion-safe:animation-duration-150 motion-safe:fade-in-0 motion-safe:zoom-in-95 motion-reduce:transition-none [&_svg]:size-4 [&_svg]:shrink-0",
        toolTones[tone]
      )}
    >
      <span className="grid *:col-start-1 *:row-start-1">
        <span className="flex group-hover/tool:invisible group-focus-visible/tool:invisible">
          {icon}
        </span>
        <IconX
          aria-hidden="true"
          className="invisible group-hover/tool:visible group-focus-visible/tool:visible"
        />
      </span>
      <span className="max-sm:sr-only">{children}</span>
    </button>
  )
}

type PromptModel = {
  value: string
  label: string
}

function PromptInputModelSelect({
  models,
  value,
  onValueChange,
}: {
  models: PromptModel[]
  value: string
  onValueChange: (value: string) => void
}) {
  const context = usePromptInput("PromptInputModelSelect")
  const [open, setOpen] = React.useState(false)
  const current = models.find((model) => model.value === value) ?? models[0]
  const choose = (next: string) => {
    if (next !== value) haptic("tick")
    onValueChange(next)
    refocus(context.textareaRef.current)
  }

  return (
    <DropdownMenu open={open} onOpenChange={setOpen}>
      <DropdownMenuTrigger
        render={
          <Button
            type="button"
            size="xs"
            variant="ghost"
            aria-label={`Model: ${current?.label ?? "none"}`}
            disabled={context.disabled}
          />
        }
      >
        {current?.label}
      </DropdownMenuTrigger>
      <DropdownMenuContent
        side="top"
        align="end"
        sideOffset={8}
        finalFocus={context.textareaRef}
        onKeyDown={(event) => {
          const position = Number(event.key)
          if (
            !Number.isInteger(position) ||
            position < 1 ||
            position > models.length ||
            event.metaKey ||
            event.ctrlKey ||
            event.altKey
          ) {
            return
          }
          event.preventDefault()
          choose(models[position - 1].value)
          setOpen(false)
        }}
      >
        <DropdownMenuRadioGroup
          value={value}
          onValueChange={(next) => choose(String(next))}
        >
          {models.map((model, index) => (
            <DropdownMenuRadioItem
              key={model.value}
              value={model.value}
              indicator="end"
              closeOnClick
            >
              {model.label}
              {index < 9 ? (
                <DropdownMenuShortcut>
                  <Kbd size="sm">{String(index + 1)}</Kbd>
                </DropdownMenuShortcut>
              ) : null}
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

type PromptEffort = {
  value: string
  label: string
}

function EffortTrack({
  levels,
  index,
  recommended,
  onIndexChange,
  sliderRef,
  label = "Effort",
}: {
  levels: PromptEffort[]
  index: number
  recommended?: number
  onIndexChange: (index: number) => void
  sliderRef?: React.Ref<HTMLDivElement>
  label?: string
}) {
  const rootRef = React.useRef<HTMLDivElement>(null)
  const [dragging, setDragging] = React.useState(false)
  const [popped, setPopped] = React.useState<number | null>(null)
  const last = levels.length - 1
  const level = last > 0 ? index / last : 0
  const max = last > 0 && index === last

  const place = React.useCallback((share: number) => {
    const root = rootRef.current
    if (!root) return
    root.style.setProperty("--effort-thumb", `calc((100% - 2rem) * ${share} + 0.125rem)`)
    root.style.setProperty("--effort-fill", `calc((100% - 2rem) * ${share} + 2rem)`)
  }, [])

  React.useLayoutEffect(() => {
    if (!dragging) place(last > 0 ? index / last : 0)
  }, [index, last, dragging, place])

  React.useLayoutEffect(() => {
    const root = rootRef.current
    if (!root || recommended === undefined) return
    root.style.setProperty(
      "--effort-recommended",
      `calc((100% - 2rem) * ${last > 0 ? recommended / last : 0} + 1rem)`
    )
  }, [recommended, last])

  React.useEffect(() => {
    if (popped === null) return
    const timer = setTimeout(() => setPopped(null), 240)
    return () => clearTimeout(timer)
  }, [popped])

  const commit = (next: number) => {
    if (next === index) return
    onIndexChange(next)
    setPopped(next)
    const strength = last > 0 ? next / last : 0
    haptic(next === last && last > 0 ? "success" : "tick", strength)
  }

  const shareAt = (track: HTMLElement, clientX: number) => {
    const box = track.getBoundingClientRect()
    let share = (clientX - box.left - 16) / Math.max(1, box.width - 32)
    if (getComputedStyle(track).direction === "rtl") share = 1 - share
    return Math.min(1, Math.max(0, share))
  }

  const follow = (track: HTMLElement, clientX: number) => {
    const share = shareAt(track, clientX)
    place(share)
    commit(Math.round(share * last))
  }

  return (
    <div ref={rootRef} className="flex flex-col gap-1.5">
      <div
        ref={sliderRef}
        role="slider"
        tabIndex={0}
        aria-label={label}
        aria-valuemin={0}
        aria-valuemax={last}
        aria-valuenow={index}
        aria-valuetext={levels[index]?.label}
        data-dragging={dragging ? "" : undefined}
        onPointerDown={(event) => {
          if (event.button !== 0) return
          event.currentTarget.setPointerCapture(event.pointerId)
          setDragging(true)
          follow(event.currentTarget, event.clientX)
        }}
        onPointerMove={(event) => {
          if (dragging) follow(event.currentTarget, event.clientX)
        }}
        onPointerUp={() => setDragging(false)}
        onPointerCancel={() => setDragging(false)}
        onLostPointerCapture={() => setDragging(false)}
        onKeyDown={(event) => {
          const rtl = getComputedStyle(event.currentTarget).direction === "rtl"
          const forward = rtl ? "ArrowLeft" : "ArrowRight"
          const backward = rtl ? "ArrowRight" : "ArrowLeft"
          let next = index
          if (event.key === forward || event.key === "ArrowUp") next = index + 1
          else if (event.key === backward || event.key === "ArrowDown") next = index - 1
          else if (event.key === "Home") next = 0
          else if (event.key === "End") next = last
          else return
          event.preventDefault()
          commit(Math.min(last, Math.max(0, next)))
        }}
        className="group/effort relative h-7 w-full pointer-coarse:h-11 cursor-grab touch-none overflow-hidden rounded-lg bg-foreground/6 outline-none dark:bg-foreground/10 select-none focus-visible:ring-3 focus-visible:ring-focus-ring data-dragging:cursor-grabbing"
      >
        <div className="absolute inset-y-0 start-0 w-(--effort-fill) overflow-hidden rounded-lg transition-all duration-500 ease-spring group-data-dragging/effort:duration-0 motion-reduce:transition-none">
          <EffortFill level={level} />
        </div>
        <div
          aria-hidden="true"
          className={cn(
            "pointer-events-none absolute inset-0 flex items-center justify-between px-4 transition-opacity duration-300",
            max && "opacity-0"
          )}
        >
          {levels.map((item, position) => (
            <span key={item.value} className="flex w-0 justify-center">
              <span
                className={cn(
                  "size-1 shrink-0 rounded-full transition-all duration-200 ease-spring",
                  position <= index
                    ? "bg-background/70"
                    : "bg-muted-foreground/45",
                  popped === position && "scale-200"
                )}
              />
            </span>
          ))}
        </div>
        <div className="pointer-events-none absolute inset-y-0.5 start-(--effort-thumb) w-7 rounded-md border border-foreground/10 bg-background shadow-sm group-data-dragging/effort:shadow-md transition-all duration-500 ease-spring group-hover/effort:border-foreground/20 group-data-dragging/effort:scale-95 group-data-dragging/effort:shadow-md group-data-dragging/effort:duration-0 motion-reduce:transition-none dark:bg-foreground/90" />
      </div>
      {recommended !== undefined ? (
        <div className="relative h-4 text-xs text-muted-foreground/80">
          <span className="absolute start-(--effort-recommended) -translate-x-1/2 whitespace-nowrap rtl:translate-x-1/2">
            Recommended
          </span>
        </div>
      ) : null}
    </div>
  )
}

type FlowState = {
  current: string
  previous: string | null
  direction: 1 | -1
  key: number
}

function FlowText({
  value,
  direction,
  className,
}: {
  value: string
  direction: 1 | -1
  className?: string
}) {
  const [state, setState] = React.useState<FlowState>({
    current: value,
    previous: null,
    direction,
    key: 0,
  })
  const incomingRef = React.useRef<HTMLSpanElement>(null)
  const outgoingRef = React.useRef<HTMLSpanElement>(null)
  const morphRef = useSizeMorph<HTMLSpanElement>({ axis: "width", duration: 260 })

  if (value !== state.current) {
    setState({
      current: value,
      previous: state.current,
      direction,
      key: state.key + 1,
    })
  }

  React.useLayoutEffect(() => {
    if (state.previous === null) return
    const incoming = Array.from(incomingRef.current?.children ?? []) as HTMLElement[]
    const outgoing = Array.from(outgoingRef.current?.children ?? []) as HTMLElement[]
    if (prefersReducedMotion() || typeof incoming[0]?.animate !== "function") {
      setState((last) => ({ ...last, previous: null }))
      return
    }
    const shift = `${state.direction * 100}%`
    const back = `${state.direction * -100}%`
    const animations = [
      ...outgoing.map((char, index) =>
        char.animate(
          [
            { translate: "0 0", opacity: 1, filter: "blur(0)" },
            { translate: `0 ${back}`, opacity: 0, filter: "blur(2px)" },
          ],
          { duration: 220, delay: index * 18, easing: easeOut, fill: "both" }
        )
      ),
      ...incoming.map((char, index) =>
        char.animate(
          [
            { translate: `0 ${shift}`, opacity: 0, filter: "blur(2px)" },
            { translate: "0 0", opacity: 1, filter: "blur(0)" },
          ],
          { duration: 360, delay: index * 22, easing: easeOut, fill: "backwards" }
        )
      ),
    ]
    let active = true
    Promise.all(animations.map((animation) => animation.finished)).then(
      () => {
        if (active) setState((last) => ({ ...last, previous: null }))
      },
      () => {}
    )
    return () => {
      active = false
    }
  }, [state.key])

  return (
    <span
      ref={morphRef}
      className={cn("relative inline-flex overflow-hidden whitespace-pre", className)}
    >
      <span className="sr-only">{state.current}</span>
      <span key={`in-${state.key}`} ref={incomingRef} aria-hidden="true" className="inline-flex">
        {Array.from(state.current).map((char, index) => (
          <span key={index} className="inline-block">
            {char}
          </span>
        ))}
      </span>
      {state.previous !== null ? (
        <span
          key={`out-${state.key}`}
          ref={outgoingRef}
          aria-hidden="true"
          className="absolute inset-y-0 start-0 inline-flex"
        >
          {Array.from(state.previous).map((char, index) => (
            <span key={index} className="inline-block">
              {char}
            </span>
          ))}
        </span>
      ) : null}
    </span>
  )
}

type EffortProps = {
  levels: PromptEffort[]
  value: string
  onValueChange: (value: string) => void
  recommended?: string
  thinking?: boolean
  onThinkingChange?: (thinking: boolean) => void
  thinkingLabel?: string
  description?: string
}

function useEffortLevel(levels: PromptEffort[], value: string) {
  const index = Math.max(
    0,
    levels.findIndex((level) => level.value === value)
  )
  const lastIndex = React.useRef(index)
  const direction: 1 | -1 = index >= lastIndex.current ? 1 : -1
  React.useEffect(() => {
    lastIndex.current = index
  }, [index])
  return { index, current: levels[index], direction }
}

function EffortWidth({ levels }: { levels: PromptEffort[] }) {
  return levels.map((level) => (
    <span key={level.value} aria-hidden="true" className="invisible">
      {level.label}
    </span>
  ))
}

function EffortPanel({
  levels,
  value,
  onValueChange,
  recommended,
  thinking,
  onThinkingChange,
  thinkingLabel = "Extended thinking",
  description = "How long the model thinks before it answers. Higher is smarter but slower.",
  sliderRef,
}: EffortProps & { sliderRef?: React.Ref<HTMLDivElement> }) {
  const switchId = React.useId()
  const { index, current, direction } = useEffortLevel(levels, value)
  const recommendedIndex = recommended
    ? levels.findIndex((level) => level.value === recommended)
    : -1

  return (
    <div className="flex flex-col gap-2.5 p-0.5">
      <div className="flex items-center gap-1.5 text-sm">
        <span className="text-muted-foreground">Effort</span>
        <FlowText
          value={current?.label ?? ""}
          direction={direction}
          className={cn(
            "font-medium transition-colors duration-300",
            index === levels.length - 1 && levels.length > 1 && "text-chart-4"
          )}
        />
        <Tooltip>
          <TooltipTrigger
            render={
              <Button
                type="button"
                size="icon-xs"
                variant="ghost"
                aria-label="About effort"
                className="ms-auto"
              />
            }
          >
            <IconHelpCircle />
          </TooltipTrigger>
          <TooltipContent>{description}</TooltipContent>
        </Tooltip>
      </div>
      <div className="-mb-1 flex justify-between text-xs text-muted-foreground">
        <span>Faster</span>
        <span>Smarter</span>
      </div>
      <EffortTrack
        levels={levels}
        index={index}
        recommended={recommendedIndex >= 0 ? recommendedIndex : undefined}
        onIndexChange={(next) => onValueChange(levels[next].value)}
        sliderRef={sliderRef}
      />
      {onThinkingChange ? (
        <div className="flex items-center justify-between gap-3 border-t pt-2.5">
          <label htmlFor={switchId} className="text-sm">
            {thinkingLabel}
          </label>
          <Switch
            id={switchId}
            size="sm"
            checked={Boolean(thinking)}
            onCheckedChange={(next) => {
              haptic("tick")
              onThinkingChange(next)
            }}
          />
        </div>
      ) : null}
    </div>
  )
}

function PromptInputEffortSlider({
  levels,
  value,
  onValueChange,
  recommended,
  label = "Effort",
  captions = ["Faster", "Smarter"],
}: {
  levels: PromptEffort[]
  value: string
  onValueChange: (value: string) => void
  recommended?: string
  label?: string
  captions?: [string, string]
}) {
  const { index, current, direction } = useEffortLevel(levels, value)
  const recommendedIndex = recommended
    ? levels.findIndex((level) => level.value === recommended)
    : -1

  return (
    <div className="flex w-full flex-col gap-1.5">
      <div className="flex items-baseline justify-between gap-3 text-xs text-muted-foreground">
        <span>{captions[0]}</span>
        <FlowText
          value={current?.label ?? ""}
          direction={direction}
          className={cn(
            "text-sm font-medium text-foreground transition-colors duration-300",
            index === levels.length - 1 && levels.length > 1 && "text-chart-4"
          )}
        />
        <span>{captions[1]}</span>
      </div>
      <EffortTrack
        levels={levels}
        index={index}
        recommended={recommendedIndex >= 0 ? recommendedIndex : undefined}
        onIndexChange={(next) => onValueChange(levels[next].value)}
        label={label}
      />
    </div>
  )
}

function PromptInputEffort(props: EffortProps) {
  const context = usePromptInput("PromptInputEffort")
  const sliderRef = React.useRef<HTMLDivElement>(null)
  const { current, direction } = useEffortLevel(props.levels, props.value)

  return (
    <Popover
      onOpenChange={(open) => {
        if (!open) refocus(context.textareaRef.current)
      }}
    >
      <PopoverTrigger
        render={
          <Button
            type="button"
            size="xs"
            variant="secondary"
            aria-label={`Effort: ${current?.label}`}
            disabled={context.disabled}
          />
        }
      >
        <span className="grid justify-items-center *:col-start-1 *:row-start-1">
          <EffortWidth levels={props.levels} />
          <FlowText value={current?.label ?? ""} direction={direction} />
        </span>
      </PopoverTrigger>
      <PopoverContent
        side="top"
        align="end"
        sideOffset={8}
        initialFocus={sliderRef}
        finalFocus={context.textareaRef}
      >
        <EffortPanel {...props} sliderRef={sliderRef} />
      </PopoverContent>
    </Popover>
  )
}

function PromptInputModel({
  models,
  model,
  onModelChange,
  effort,
  onEffortChange,
  ...props
}: Omit<EffortProps, "value" | "onValueChange"> & {
  models: PromptModel[]
  model: string
  onModelChange: (value: string) => void
  effort: string
  onEffortChange: (value: string) => void
}) {
  const context = usePromptInput("PromptInputModel")
  const listRef = React.useRef<HTMLDivElement>(null)
  const selectedRef = React.useRef<HTMLButtonElement>(null)
  const current = models.find((item) => item.value === model) ?? models[0]
  const { current: level, direction } = useEffortLevel(props.levels, effort)
  const choose = (next: string) => {
    if (next !== model) haptic("tick")
    onModelChange(next)
  }

  return (
    <Popover
      onOpenChange={(open) => {
        if (!open) refocus(context.textareaRef.current)
      }}
    >
      <PopoverTrigger
        render={
          <Button
            type="button"
            size="xs"
            variant="ghost"
            aria-label={`Model: ${current?.label ?? "none"}, effort: ${level?.label ?? "none"}`}
            disabled={context.disabled}
          />
        }
      >
        {current?.label}
        <span className="grid justify-items-start text-muted-foreground *:col-start-1 *:row-start-1">
          <EffortWidth levels={props.levels} />
          <FlowText value={level?.label ?? ""} direction={direction} />
        </span>
      </PopoverTrigger>
      <PopoverContent
        side="top"
        align="end"
        sideOffset={8}
        initialFocus={selectedRef}
        finalFocus={context.textareaRef}
        onKeyDown={(event) => {
          const position = Number(event.key)
          if (
            !Number.isInteger(position) ||
            position < 1 ||
            position > Math.min(9, models.length) ||
            event.metaKey ||
            event.ctrlKey ||
            event.altKey
          ) {
            return
          }
          event.preventDefault()
          choose(models[position - 1].value)
        }}
      >
        <div
          ref={listRef}
          role="radiogroup"
          aria-label="Model"
          className="-m-1 flex flex-col"
          onKeyDown={(event) => {
            const step =
              event.key === "ArrowDown" ? 1 : event.key === "ArrowUp" ? -1 : 0
            if (!step) return
            event.preventDefault()
            const index = models.findIndex((item) => item.value === current?.value)
            const next = models[(index + step + models.length) % models.length]
            choose(next.value)
            requestAnimationFrame(() =>
              listRef.current
                ?.querySelector<HTMLElement>("[aria-checked=true]")
                ?.focus()
            )
          }}
        >
          {models.map((item, index) => {
            const selected = item.value === current?.value
            return (
              <button
                key={item.value}
                ref={selected ? selectedRef : undefined}
                type="button"
                role="radio"
                aria-checked={selected}
                tabIndex={selected ? 0 : -1}
                onClick={() => choose(item.value)}
                className="flex min-h-8 items-center gap-2 rounded-md px-2 text-start text-sm outline-none select-none hover:bg-accent hover:text-accent-foreground focus-visible:bg-accent focus-visible:text-accent-foreground pointer-coarse:min-h-11 forced-colors:focus-visible:outline-2"
              >
                <span className="min-w-0 flex-1 truncate">{item.label}</span>
                {selected ? (
                  <IconCheck aria-hidden="true" className="size-4 shrink-0" />
                ) : index < 9 ? (
                  <Kbd size="sm">{String(index + 1)}</Kbd>
                ) : null}
              </button>
            )
          })}
        </div>
        <div className="border-t pt-2.5">
          <EffortPanel {...props} value={effort} onValueChange={onEffortChange} />
        </div>
      </PopoverContent>
    </Popover>
  )
}

function formatTokens(tokens: number) {
  if (tokens < 1000) return String(tokens)
  if (tokens < 1_000_000) {
    const value = tokens / 1000
    return `${value < 100 ? value.toFixed(1).replace(/\.0$/, "") : Math.round(value)}k`
  }
  return `${(tokens / 1_000_000).toFixed(1).replace(/\.0$/, "")}M`
}

type PromptUsageLimit = {
  label: string
  used: number
  detail?: string
}

type PromptTokenUsage = {
  inputTokens?: number
  outputTokens?: number
  totalTokens?: number
  reasoningTokens?: number
  cachedInputTokens?: number
  inputTokenDetails?: {
    noCacheTokens?: number
    cacheReadTokens?: number
    cacheWriteTokens?: number
  }
  outputTokenDetails?: {
    textTokens?: number
    reasoningTokens?: number
  }
}

type PromptTokenPricing = {
  input: number
  output: number
  cachedInput?: number
  reasoning?: number
}

type PromptTokenKind = "input" | "cached" | "output" | "reasoning"

const tokenKinds: {
  kind: PromptTokenKind
  label: string
  className: string
}[] = [
  { kind: "input", label: "Input", className: "bg-chart-1" },
  { kind: "cached", label: "Cached input", className: "bg-chart-2" },
  { kind: "output", label: "Output", className: "bg-chart-4" },
  { kind: "reasoning", label: "Reasoning", className: "bg-chart-5" },
]

function tokenCount(value: number | undefined) {
  return typeof value === "number" && Number.isFinite(value) && value > 0
    ? value
    : 0
}

function getTokenBreakdown(
  usage: PromptTokenUsage
): Record<PromptTokenKind, number> {
  const cached = tokenCount(
    usage.inputTokenDetails?.cacheReadTokens ?? usage.cachedInputTokens
  )
  const reasoning = tokenCount(
    usage.outputTokenDetails?.reasoningTokens ?? usage.reasoningTokens
  )
  const inputTokens = tokenCount(usage.inputTokens)
  const outputTokens = tokenCount(usage.outputTokens)
  const noCache = usage.inputTokenDetails?.noCacheTokens
  const text = usage.outputTokenDetails?.textTokens
  return {
    input:
      noCache !== undefined
        ? tokenCount(noCache)
        : inputTokens >= cached
          ? inputTokens - cached
          : inputTokens,
    cached,
    output:
      text !== undefined
        ? tokenCount(text)
        : Math.max(0, outputTokens - reasoning),
    reasoning,
  }
}

function tokenRate(kind: PromptTokenKind, pricing: PromptTokenPricing) {
  if (kind === "cached") return pricing.cachedInput ?? pricing.input
  if (kind === "reasoning") return pricing.reasoning ?? pricing.output
  return pricing[kind]
}

function formatCost(value: number) {
  if (!Number.isFinite(value) || value <= 0) return "$0.00"
  if (value < 0.0001) return "<$0.0001"
  if (value < 0.01) return `$${value.toFixed(4)}`
  return `$${value.toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`
}

function toPercent(value: number) {
  return `${Math.max(0, Math.min(100, value * 100))}%`
}

function UsageBar({ value, className }: { value: number; className?: string }) {
  return (
    <div className="h-1 w-full overflow-hidden rounded-full bg-muted forced-colors:border">
      <span
        ref={(element) => element?.style.setProperty("--share", toPercent(value))}
        className={cn(
          "block h-full w-(--share) rounded-full forced-colors:bg-highlight",
          className
        )}
      />
    </div>
  )
}

type ContextSegment = {
  key: string
  share: number
  className: string
}

function ContextBar({ segments }: { segments: ContextSegment[] }) {
  const placed = segments.reduce<(ContextSegment & { start: number })[]>(
    (list, segment) => {
      const last = list.at(-1)
      return [
        ...list,
        { ...segment, start: last ? last.start + last.share : 0 },
      ]
    },
    []
  )
  const end = placed.reduce((total, segment) => total + segment.share, 0)

  return (
    <div
      aria-hidden="true"
      data-slot="prompt-input-context-bar"
      className="relative h-1.5 w-full overflow-hidden rounded-full"
    >
      {placed.map((segment) => (
        <span
          key={segment.key}
          data-kind={segment.key}
          ref={(element) => {
            element?.style.setProperty("--start", toPercent(segment.start))
            element?.style.setProperty(
              "--share",
              `calc(${toPercent(segment.share)} - 2px)`
            )
          }}
          className={cn(
            "absolute inset-y-0 start-(--start) w-(--share) transition-all duration-300 ease-out-cubic motion-reduce:transition-none motion-safe:starting:start-0 motion-safe:starting:w-0 forced-colors:bg-highlight",
            segment.className
          )}
        />
      ))}
      <span
        ref={(element) => element?.style.setProperty("--start", toPercent(end))}
        className="absolute inset-y-0 start-(--start) end-0 bg-muted transition-all duration-300 ease-out-cubic motion-reduce:transition-none motion-safe:starting:start-0 forced-colors:border"
      />
    </div>
  )
}

function PromptInputContextUsage({
  used: usedProp,
  limit,
  usage,
  model,
  cost,
  pricing,
  onCompact,
  limits = [],
  limitsLabel = "Usage limits",
}: {
  used?: number
  limit: number
  usage?: PromptTokenUsage
  model?: string
  cost?: number
  pricing?: PromptTokenPricing
  onCompact?: () => void | Promise<unknown>
  limits?: PromptUsageLimit[]
  limitsLabel?: string
}) {
  const [open, setOpen] = React.useState(false)
  const [compacting, setCompacting] = React.useState(false)
  const popupRef = React.useRef<HTMLDivElement>(null)
  const breakdown = usage ? getTokenBreakdown(usage) : null
  const counted = breakdown
    ? breakdown.input + breakdown.cached + breakdown.output + breakdown.reasoning
    : 0
  const used = Math.max(
    0,
    usedProp ?? (counted > 0 ? counted : tokenCount(usage?.totalTokens))
  )
  const ratio = limit > 0 ? used / limit : 0
  const percent = Math.min(100, Math.round(ratio * 100))
  const radius = 7
  const circumference = 2 * Math.PI * radius
  const tone =
    ratio >= 0.95
      ? "text-destructive"
      : ratio >= 0.8
        ? "text-warning"
        : "text-foreground/70"
  const fill =
    ratio >= 0.95 ? "bg-destructive" : ratio >= 0.8 ? "bg-warning" : "bg-chart-1"
  const filled = Math.min(ratio, 1)
  const rows =
    breakdown && counted > 0
      ? tokenKinds
          .filter(
            (item) =>
              item.kind === "input" ||
              item.kind === "output" ||
              breakdown[item.kind] > 0
          )
          .map((item) => ({
            ...item,
            tokens: breakdown[item.kind],
            cost: pricing
              ? (breakdown[item.kind] * tokenRate(item.kind, pricing)) /
                1_000_000
              : undefined,
          }))
      : []
  const segments: ContextSegment[] =
    breakdown && counted > 0
      ? tokenKinds.map((item) => ({
          key: item.kind,
          share: (breakdown[item.kind] / counted) * filled,
          className: item.className,
        }))
      : [{ key: "used", share: filled, className: fill }]
  const priced = rows.length > 0 && pricing !== undefined
  const total =
    cost ??
    (priced ? rows.reduce((sum, row) => sum + (row.cost ?? 0), 0) : undefined)
  const showCompact = onCompact !== undefined && (ratio >= 0.8 || compacting)

  const compact = async () => {
    if (!onCompact || compacting) return
    setCompacting(true)
    try {
      await onCompact()
      setOpen(false)
    } catch {
    } finally {
      setCompacting(false)
    }
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        openOnHover
        delay={300}
        render={
          <Button
            type="button"
            size="icon-xs"
            variant="ghost"
            shape="pill"
            aria-label={`${percent}% of context used`}
          />
        }
      >
        <svg
          viewBox="0 0 18 18"
          aria-hidden="true"
          className={cn("size-4 -rotate-90", tone)}
        >
          <circle
            cx="9"
            cy="9"
            r={radius}
            fill="none"
            strokeWidth="2"
            className="stroke-foreground/15"
          />
          {ratio >= 0.01 ? (
            <circle
              cx="9"
              cy="9"
              r={radius}
              fill="none"
              strokeWidth="2"
              strokeLinecap="butt"
              strokeDasharray={circumference}
              strokeDashoffset={circumference * (1 - filled)}
              className="stroke-current transition-all duration-300 ease-out-cubic motion-reduce:transition-none"
            />
          ) : null}
        </svg>
      </PopoverTrigger>
      <PopoverContent
        ref={popupRef}
        initialFocus={popupRef}
        side="top"
        align="end"
        sideOffset={8}
        className="w-80"
      >
        <div
          data-slot="prompt-input-context"
          className="flex flex-col gap-2 p-0.5 text-sm"
        >
          <div className="flex items-baseline justify-between gap-3">
            <span
              className={cn(
                "min-w-0 truncate",
                model ? "font-medium" : "text-muted-foreground"
              )}
            >
              {model ?? "Context window"}
            </span>
            <span className="shrink-0 text-muted-foreground tabular-nums">
              {formatTokens(used)} / {formatTokens(limit)}
            </span>
          </div>
          <ContextBar segments={segments} />
          <div className="flex items-baseline justify-between gap-3 text-xs text-muted-foreground tabular-nums">
            <NumberFlow value={percent} suffix="% used" />
            <span>{formatTokens(Math.max(0, limit - used))} left</span>
          </div>
          {rows.length > 0 ? (
            <table
              data-slot="prompt-input-context-breakdown"
              className="mt-1 w-full border-separate border-spacing-0 tabular-nums"
            >
              <caption className="sr-only">Token breakdown</caption>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.kind} data-kind={row.kind}>
                    <th
                      scope="row"
                      className="py-0.5 text-start font-normal"
                    >
                      <span className="flex min-w-0 items-center gap-2">
                        <span
                          aria-hidden="true"
                          className={cn(
                            "size-2 shrink-0 rounded-full forced-colors:bg-canvas-text",
                            row.className
                          )}
                        />
                        <span className="truncate">{row.label}</span>
                      </span>
                    </th>
                    <td className="py-0.5 ps-3 text-end text-muted-foreground">
                      {row.tokens.toLocaleString()}
                    </td>
                    {priced ? (
                      <td className="w-0 py-0.5 ps-4 text-end text-muted-foreground">
                        {formatCost(row.cost ?? 0)}
                      </td>
                    ) : null}
                  </tr>
                ))}
              </tbody>
            </table>
          ) : null}
          {total !== undefined ? (
            <div
              data-slot="prompt-input-context-cost"
              className="flex items-baseline justify-between gap-3 border-t pt-2"
            >
              <span className="text-muted-foreground">
                {priced ? "Total cost" : "Cost"}
              </span>
              <span className="font-medium tabular-nums">{formatCost(total)}</span>
            </div>
          ) : null}
          {showCompact ? (
            <div className="mt-0.5 flex flex-col gap-2 border-t pt-2.5">
              <p className="text-xs text-pretty text-muted-foreground">
                Summarizes earlier messages to free up space. Recent messages
                stay as they are.
              </p>
              <Button
                type="button"
                size="sm"
                variant="secondary"
                loading={compacting}
                loadingLabel="Compacting…"
                onClick={() => void compact()}
              >
                Compact conversation
              </Button>
            </div>
          ) : null}
          {limits.length > 0 ? (
            <div className="mt-1.5 flex flex-col gap-2 border-t pt-2.5">
              <span className="text-muted-foreground">{limitsLabel}</span>
              {limits.map((item) => (
                <div key={item.label} className="flex flex-col gap-1.5">
                  <div className="flex items-baseline justify-between gap-3">
                    <span className="min-w-0 truncate">{item.label}</span>
                    <span className="shrink-0 text-muted-foreground tabular-nums">
                      {item.detail ? `${item.detail}  ` : ""}
                      {Math.round(item.used * 100)}%
                    </span>
                  </div>
                  <UsageBar
                    value={item.used}
                    className={
                      item.used >= 0.95
                        ? "bg-destructive"
                        : item.used >= 0.8
                          ? "bg-warning"
                          : "bg-chart-1"
                    }
                  />
                </div>
              ))}
            </div>
          ) : null}
        </div>
      </PopoverContent>
    </Popover>
  )
}

type Recognition = {
  continuous: boolean
  interimResults: boolean
  lang: string
  start: () => void
  stop: () => void
  abort: () => void
  onresult:
    | ((event: {
        resultIndex: number
        results: ArrayLike<{ isFinal: boolean; 0: { transcript: string } }>
      }) => void)
    | null
  onerror: ((event: { error: string }) => void) | null
  onend: (() => void) | null
}

type RecognitionConstructor = new () => Recognition

function getRecognition() {
  if (typeof window === "undefined") return null
  const scope = window as unknown as {
    SpeechRecognition?: RecognitionConstructor
    webkitSpeechRecognition?: RecognitionConstructor
  }
  return scope.SpeechRecognition ?? scope.webkitSpeechRecognition ?? null
}

function subscribeNothing() {
  return () => {}
}

function canRecord() {
  return (
    typeof navigator !== "undefined" &&
    typeof navigator.mediaDevices?.getUserMedia === "function"
  )
}

const sampleEvery = 50

function Waveform({
  levelsRef,
  sampledRef,
}: {
  levelsRef: React.RefObject<number[]>
  sampledRef: React.RefObject<number>
}) {
  const canvasRef = React.useRef<HTMLCanvasElement>(null)

  React.useEffect(() => {
    const canvas = canvasRef.current
    const context = canvas?.getContext("2d")
    if (!canvas || !context) return
    const ratio = Math.min(2, window.devicePixelRatio || 1)
    const styles = getComputedStyle(canvas)
    const bar = styles.color
    const dot = styles.borderTopColor || bar
    const still = prefersReducedMotion()
    let frame = 0

    const draw = () => {
      const width = Math.max(1, Math.round(canvas.clientWidth * ratio))
      const height = Math.max(1, Math.round(canvas.clientHeight * ratio))
      if (canvas.width !== width || canvas.height !== height) {
        canvas.width = width
        canvas.height = height
      }
      context.clearRect(0, 0, width, height)
      const step = 5 * ratio
      const thickness = 2.5 * ratio
      const slots = Math.floor(width / step) + 1
      const levels = levelsRef.current
      const start = Math.max(0, levels.length - slots)
      const filled = levels.length - start
      const middle = height / 2
      const progress = still
        ? 0
        : Math.min(1, (performance.now() - sampledRef.current) / sampleEvery)
      const shift = levels.length > 0 ? progress * step : 0
      for (let slot = 0; slot < slots; slot++) {
        const x = width - (slots - slot) * step + (step - thickness) / 2 - shift + step
        const index = slot - (slots - filled)
        if (index < 0) {
          context.fillStyle = dot
          context.globalAlpha = 0.5
          context.beginPath()
          context.arc(x + thickness / 2, middle, ratio, 0, Math.PI * 2)
          context.fill()
          continue
        }
        const level = levels[start + index]
        const size = Math.max(thickness, level * height * 0.9)
        context.globalAlpha = 0.85
        context.fillStyle = bar
        context.beginPath()
        context.roundRect(x, middle - size / 2, thickness, size, thickness / 2)
        context.fill()
      }
      context.globalAlpha = 1
      if (!still) frame = requestAnimationFrame(draw)
    }

    frame = requestAnimationFrame(draw)
    return () => cancelAnimationFrame(frame)
  }, [levelsRef, sampledRef])

  return (
    <canvas
      ref={canvasRef}
      aria-hidden="true"
      className="h-8 min-w-0 flex-1 border-muted-foreground text-foreground/70 rtl:-scale-x-100"
    />
  )
}

type DictationStatus = "idle" | "recording" | "transcribing"

type DictationSession = {
  stream: MediaStream | null
  audio: AudioContext | null
  timer: ReturnType<typeof setInterval> | undefined
  recorder: MediaRecorder | null
  chunks: Blob[]
  recognition: Recognition | null
  heard: string
  pending: string
  ended: Promise<void>
  stopped: boolean
  failed: boolean
}

function PromptInputDictation({
  transcribe,
  shortcut = "ctrl+shift+d",
  autoSend = false,
}: {
  transcribe?: (audio: Blob) => Promise<string>
  shortcut?: string | false
  autoSend?: boolean
}) {
  const context = usePromptInput("PromptInputDictation")
  const supported = React.useSyncExternalStore(
    subscribeNothing,
    () => canRecord() && (Boolean(transcribe) || getRecognition() !== null),
    () => false
  )
  const [status, setStatus] = React.useState<DictationStatus>("idle")
  const sessionRef = React.useRef<DictationSession | null>(null)
  const levelsRef = React.useRef<number[]>([])
  const sampledRef = React.useRef(0)
  const latest = React.useRef(context)
  latest.current = context
  const { announce, textareaRef } = context

  const insert = React.useCallback(
    (text: string) => {
      const field = textareaRef.current
      const clean = text.replace(/\s+/g, " ").trim()
      if (!field || !clean) return false
      const before = field.value.slice(0, field.selectionStart)
      insertText(field, before && !/\s$/.test(before) ? ` ${clean}` : clean)
      return true
    },
    [textareaRef]
  )

  const release = (session: DictationSession) => {
    clearInterval(session.timer)
    session.stream?.getTracks().forEach((track) => track.stop())
    session.audio?.close().catch(() => {})
  }

  const start = React.useCallback(async () => {
    if (sessionRef.current || !canRecord()) return
    let finish: () => void = () => {}
    const ended = new Promise<void>((resolve) => {
      finish = resolve
    })
    const session: DictationSession = {
      stream: null,
      audio: null,
      timer: undefined,
      recorder: null,
      chunks: [],
      recognition: null,
      heard: "",
      pending: "",
      ended,
      stopped: false,
      failed: false,
    }
    sessionRef.current = session
    levelsRef.current = []
    sampledRef.current = performance.now()
    setStatus("recording")
    haptic("tap")

    let stream: MediaStream
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true })
    } catch {
      if (sessionRef.current === session) sessionRef.current = null
      setStatus("idle")
      announce("Microphone access is blocked")
      textareaRef.current?.focus()
      return
    }
    if (session.stopped) {
      stream.getTracks().forEach((track) => track.stop())
      return
    }
    session.stream = stream
    const audio = new AudioContext()
    session.audio = audio
    const analyser = audio.createAnalyser()
    analyser.fftSize = 1024
    audio.createMediaStreamSource(stream).connect(analyser)
    const samples = new Float32Array(analyser.fftSize)
    let smooth = 0
    session.timer = setInterval(() => {
      analyser.getFloatTimeDomainData(samples)
      let sum = 0
      for (const sample of samples) sum += sample * sample
      const level = Math.min(1, Math.sqrt(sum / samples.length) * 6)
      smooth += (level - smooth) * (level > smooth ? 0.65 : 0.3)
      levelsRef.current.push(smooth)
      if (levelsRef.current.length > 400) levelsRef.current.shift()
      sampledRef.current = performance.now()
    }, sampleEvery)

    if (transcribe) {
      const recorder = new MediaRecorder(stream)
      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) session.chunks.push(event.data)
      }
      recorder.onstop = () => finish()
      recorder.start()
      session.recorder = recorder
    } else {
      const Recognition = getRecognition()
      if (Recognition) {
        const recognition = new Recognition()
        recognition.continuous = true
        recognition.interimResults = true
        recognition.lang = document.documentElement.lang || navigator.language
        recognition.onresult = (event) => {
          let pending = ""
          for (let index = event.resultIndex; index < event.results.length; index++) {
            const result = event.results[index]
            if (result.isFinal) session.heard += ` ${result[0].transcript}`
            else pending += result[0].transcript
          }
          session.pending = pending
        }
        recognition.onerror = (event) => {
          if (event.error === "no-speech" || event.error === "aborted") return
          session.failed = true
          announce(
            event.error === "not-allowed" || event.error === "service-not-allowed"
              ? "Speech recognition is blocked"
              : "Speech recognition stopped"
          )
        }
        recognition.onend = () => {
          if (!session.stopped && !session.failed) {
            try {
              recognition.start()
              return
            } catch {}
          }
          finish()
        }
        recognition.start()
        session.recognition = recognition
      } else {
        finish()
      }
    }
    announce("Recording. Press Escape to cancel.")
  }, [announce, textareaRef, transcribe])

  const stop = React.useCallback(
    async (action: "insert" | "send" | "cancel") => {
      const session = sessionRef.current
      if (!session) return
      sessionRef.current = null
      session.stopped = true
      release(session)
      haptic("tick")
      if (action === "cancel") {
        session.recorder?.stop()
        session.recognition?.abort()
        setStatus("idle")
        announce("Recording discarded")
        textareaRef.current?.focus()
        return
      }
      let text = ""
      if (session.recorder && transcribe) {
        session.recorder.stop()
        setStatus("transcribing")
        await session.ended
        try {
          text = await transcribe(
            new Blob(session.chunks, { type: session.recorder.mimeType })
          )
        } catch {
          announce("Couldn’t transcribe that. Try again.")
        }
      } else if (session.recognition) {
        setStatus("transcribing")
        session.recognition.stop()
        await Promise.race([
          session.ended,
          new Promise((resolve) => setTimeout(resolve, 1500)),
        ])
        text = `${session.heard} ${session.pending}`
      }
      setStatus("idle")
      const added = insert(text)
      if (!added) {
        announce("Didn’t catch anything")
        textareaRef.current?.focus()
        return
      }
      if (action === "send" || autoSend) {
        setTimeout(() => latest.current.submit(), 350)
      }
    },
    [announce, autoSend, insert, textareaRef, transcribe]
  )

  React.useEffect(
    () => () => {
      const session = sessionRef.current
      if (!session) return
      session.stopped = true
      release(session)
      session.recorder?.stop()
      session.recognition?.abort()
    },
    []
  )

  React.useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (shortcut && matchesHotkey(event, shortcut)) {
        event.preventDefault()
        if (sessionRef.current) void stop("insert")
        else if (status === "idle") void start()
        return
      }
      if (event.key === "Escape" && sessionRef.current) {
        event.preventDefault()
        void stop("cancel")
      }
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [shortcut, start, stop, status])

  React.useEffect(() => {
    const group = context.groupRef.current
    if (!group) return
    if (status === "idle") group.removeAttribute("data-dictating")
    else group.setAttribute("data-dictating", "")
  }, [status, context.groupRef])

  if (!supported) return null

  return (
    <>
      <Tooltip>
        <TooltipTrigger
          render={
            <Button
              type="button"
              size="icon"
              variant="ghost"
              shape="pill"
              aria-label="Dictate"
              disabled={context.disabled || status !== "idle"}
              onClick={() => void start()}
            />
          }
        >
          <IconMicrophone />
        </TooltipTrigger>
        <TooltipContent>
          Dictate {shortcut ? <KbdGroup keys={shortcut} size="sm" /> : null}
        </TooltipContent>
      </Tooltip>
      {status !== "idle" ? (
        <div
          role="group"
          aria-label="Dictation"
          className="absolute inset-px z-20 flex items-center gap-2 rounded-(--composer-radius-inner) bg-background p-1.75 dark:bg-card"
        >
          <Tooltip>
            <TooltipTrigger
              render={
                <Button
                  type="button"
                  size="icon"
                  variant="outline"
                  shape="pill"
                  aria-label="Cancel dictation"
                  disabled={status !== "recording"}
                  onClick={() => void stop("cancel")}
                />
              }
            >
              <IconX />
            </TooltipTrigger>
            <TooltipContent>
              Cancel <KbdGroup keys="escape" size="sm" />
            </TooltipContent>
          </Tooltip>
          <div className="relative flex min-w-0 flex-1 items-center px-2">
            {status === "transcribing" ? (
              <span className="flex h-8 flex-1 items-center justify-center text-sm text-shimmer motion-safe:animate-in motion-safe:animation-duration-200 motion-safe:fade-in-0">
                Transcribing…
              </span>
            ) : (
              <Waveform levelsRef={levelsRef} sampledRef={sampledRef} />
            )}
          </div>
          <Tooltip>
            <TooltipTrigger
              render={
                <Button
                  type="button"
                  size="icon"
                  variant="secondary"
                  shape="pill"
                  aria-label="Stop and insert text"
                  disabled={status !== "recording"}
                  onClick={() => void stop("insert")}
                  className="relative"
                />
              }
            >
              {status === "recording" ? (
                <span
                  aria-hidden="true"
                  className="absolute -inset-1 rounded-full border border-foreground/15 motion-safe:animate-pulse"
                />
              ) : null}
              <IconPlayerStopFilled />
            </TooltipTrigger>
            <TooltipContent>
              Stop <KbdGroup keys={shortcut || "ctrl+shift+d"} size="sm" />
            </TooltipContent>
          </Tooltip>
          <Tooltip>
            <TooltipTrigger
              render={
                <Button
                  type="button"
                  size="icon"
                  shape="pill"
                  aria-label="Send now"
                  disabled={status !== "recording"}
                  onClick={() => void stop("send")}
                />
              }
            >
              <IconArrowUp />
            </TooltipTrigger>
            <TooltipContent>Send</TooltipContent>
          </Tooltip>
        </div>
      ) : null}
    </>
  )
}

type PromptOption = {
  value: string
  label: string
  icon?: React.ReactNode
  description?: string
}

function PromptInputSelect({
  options,
  value,
  onValueChange,
  label,
  placeholder,
  icon,
  heading,
  shortcut,
  side = "top",
  align = "start",
  className,
  children,
}: {
  options: PromptOption[]
  value?: string
  onValueChange: (value: string) => void
  label: string
  placeholder?: string
  icon?: React.ReactNode
  heading?: string
  shortcut?: string
  side?: "top" | "bottom"
  align?: "start" | "end"
  className?: string
  children?: React.ReactNode
}) {
  const context = usePromptInput("PromptInputSelect")
  const { announce, disabled } = context
  const current = options.find((option) => option.value === value)
  const shown = current?.label ?? placeholder ?? label
  const choose = (next: string) => {
    if (next !== value) haptic("tick")
    onValueChange(next)
    refocus(context.textareaRef.current)
  }

  React.useEffect(() => {
    if (!shortcut || options.length < 2) return
    const onKey = (event: KeyboardEvent) => {
      if (disabled || !matchesHotkey(event, shortcut)) return
      event.preventDefault()
      const index = options.findIndex((option) => option.value === value)
      const next = options[(index + 1) % options.length]
      haptic("tick")
      onValueChange(next.value)
      announce(`${label}: ${next.label}`)
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [shortcut, options, value, onValueChange, label, announce, disabled])

  return (
    <DropdownMenu>
      <Tooltip>
        <TooltipTrigger
          render={
            <DropdownMenuTrigger
              render={
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  shape="pill"
                  aria-label={`${label}: ${shown}`}
                  disabled={disabled}
                  className={cn("min-w-0", className)}
                />
              }
            />
          }
        >
          {current?.icon || icon ? (
            <span data-icon="inline-start" className="flex">
              {current?.icon ?? icon}
            </span>
          ) : null}
          <span className="truncate">{shown}</span>
        </TooltipTrigger>
        <TooltipContent>
          {label} {shortcut ? <KbdGroup keys={shortcut} size="sm" /> : null}
        </TooltipContent>
      </Tooltip>
      <DropdownMenuContent
        side={side}
        align={align}
        sideOffset={8}
        finalFocus={context.textareaRef}
        className="min-w-40 max-w-72"
      >
        {heading ? <DropdownMenuLabel>{heading}</DropdownMenuLabel> : null}
        <DropdownMenuRadioGroup
          value={value ?? ""}
          onValueChange={(next) => choose(String(next))}
        >
          {/* Only the label is shown inline. Descriptions move to a hover
              tooltip so every row stays one line and the menu stays narrow. */}
          {options.map((option) => (
            <Tooltip key={option.value}>
              <TooltipTrigger
                render={
                  <DropdownMenuRadioItem
                    value={option.value}
                    indicator="end"
                    closeOnClick
                  >
                    {option.icon}
                    <span className="truncate">{option.label}</span>
                  </DropdownMenuRadioItem>
                }
              />
              {option.description ? (
                <TooltipContent side="right" sideOffset={8}>
                  {option.description}
                </TooltipContent>
              ) : null}
            </Tooltip>
          ))}
        </DropdownMenuRadioGroup>
        {children ? (
          <>
            <DropdownMenuSeparator />
            {children}
          </>
        ) : null}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

function PromptInputInset({
  className,
  ...props
}: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="prompt-input-inset"
      className={cn(
        "flex min-w-0 flex-col rounded-(--composer-radius-outer) bg-muted p-1.5 dark:bg-muted/60 forced-colors:border",
        className
      )}
      {...props}
    />
  )
}

function PromptInputFooter({
  className,
  ...props
}: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="prompt-input-footer"
      className={cn(
        "order-first flex min-h-9 min-w-0 items-center gap-0.5 px-1.5 text-muted-foreground",
        className
      )}
      {...props}
    />
  )
}

function PromptInputMeter({ showAt = 0.8 }: { showAt?: number }) {
  const context = usePromptInput("PromptInputMeter")
  const limit = context.maxLength
  const used = context.text.length
  const ratio = limit ? used / limit : 0
  const level = ratio > 1 ? 2 : ratio >= showAt ? 1 : 0
  const previous = React.useRef(level)
  const { announce } = context

  React.useEffect(() => {
    if (!limit) return
    if (level > previous.current) {
      announce(
        level === 2
          ? `Over the ${limit.toLocaleString()} character limit`
          : `${(limit - used).toLocaleString()} characters left`
      )
    }
    previous.current = level
  }, [level])

  if (!limit || level === 0) return null
  const left = limit - used

  return (
    <span
      role="img"
      aria-label={
        left >= 0
          ? `${left.toLocaleString()} characters left`
          : `${(-left).toLocaleString()} characters over the limit`
      }
      className={cn(
        "px-1 text-xs tabular-nums motion-safe:animate-in motion-safe:animation-duration-150 motion-safe:fade-in-0",
        ratio > 1 ? "text-destructive" : "text-muted-foreground"
      )}
    >
      {left.toLocaleString()}
    </span>
  )
}

function PromptInputMeta({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="prompt-input-meta"
      className={cn("flex min-h-8 items-center justify-end gap-1 px-1", className)}
      {...props}
    />
  )
}

type PromptSuggestion = {
  label: string
  prompt?: string
  icon?: React.ReactNode
}

function PromptInputSuggestions({
  suggestions,
  className,
}: {
  suggestions: PromptSuggestion[]
  className?: string
}) {
  const context = usePromptInput("PromptInputSuggestions")
  const hidden =
    Boolean(context.text) || context.files.length > 0 || context.mentions.length > 0

  return (
    <div
      role="group"
      aria-label="Suggestions"
      aria-hidden={hidden || undefined}
      inert={hidden}
      data-slot="prompt-input-suggestions"
      data-hidden={hidden ? "" : undefined}
      className={cn(
        "flex flex-wrap justify-center gap-2 transition-opacity duration-200 ease-out data-hidden:opacity-0 motion-reduce:transition-none",
        className
      )}
    >
      {suggestions.map((suggestion) => (
        <Button
          key={suggestion.label}
          type="button"
          size="sm"
          variant="outline"
          shape="pill"
          onClick={() => {
            const field = context.textareaRef.current
            if (!field) return
            insertText(field, suggestion.prompt ?? suggestion.label, 0, field.value.length)
          }}
        >
          {suggestion.icon}
          {suggestion.label}
        </Button>
      ))}
    </div>
  )
}

export {
  PromptInputAddMenu,
  PromptInputContextUsage,
  PromptInputDictation,
  PromptInputEffort,
  PromptInputEffortSlider,
  PromptInputFooter,
  PromptInputInset,
  PromptInputMeta,
  PromptInputMeter,
  PromptInputModel,
  PromptInputModelSelect,
  PromptInputSelect,
  PromptInputSuggestions,
  PromptInputTool,
  formatCost,
  formatTokens,
  getTokenBreakdown,
  type PromptEffort,
  type PromptModel,
  type PromptOption,
  type PromptSuggestion,
  type PromptTokenPricing,
  type PromptTokenUsage,
  type PromptToolTone,
  type PromptUsageLimit,
}
