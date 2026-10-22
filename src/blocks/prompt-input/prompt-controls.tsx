"use client"

import * as React from "react"
import {
  ArrowUpIcon,
  CheckIcon,
  CircleHelpIcon,
  FolderOpenIcon,
  GitBranchIcon,
  KeyRoundIcon,
  MicIcon,
  SquareIcon,
  PaperclipIcon,
  PlusIcon,
  SearchIcon,
  Trash2Icon,
  XIcon,
} from "lucide-react"
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
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "@/components/dropdown-menu"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/popover"
import { Kbd, KbdGroup } from "@/components/kbd"
import { NumberFlow } from "@/components/number-flow"
import { openSettings } from "@/lib/open-settings"
import { ProviderLogo } from "@/components/provider-logo"
import { PROVIDERS, providerFor } from "@/lib/providers"
import type { ProviderKey } from "@/lib/secret"

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
import { insertText, replaceAll } from "./text"

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
          <PlusIcon />
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
          <PaperclipIcon />
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
        <XIcon
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
  /**
   * Exactly the effort levels the selected model publishes. Empty means the
   * model publishes none — or the catalogue has not been consulted yet — and the
   * panel is omitted rather than asserting either as a limitation.
   */
  levels: PromptEffort[]
  value: string
  onValueChange: (value: string) => void
  recommended?: string
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

function EffortPanel({
  levels,
  value,
  onValueChange,
  recommended,
  description = "How long the model thinks before it answers. Higher is smarter but slower.",
  sliderRef,
}: EffortProps & { sliderRef?: React.Ref<HTMLDivElement> }) {
  const { index, current, direction } = useEffortLevel(levels, value)
  const recommendedIndex = recommended
    ? levels.findIndex((level) => level.value === recommended)
    : -1

  const header = (
    <div className="flex items-center gap-1.5 text-sm">
      <span className="text-muted-foreground">Effort</span>
      {levels.length === 1 ? (
        /* One level is one level: there is nothing to slide between, so the
           control is stated rather than drawn as a slider that cannot move. */
        <span className="font-medium">{levels[0].label}</span>
      ) : (
        <FlowText
          value={current?.label ?? ""}
          direction={direction}
          className={cn(
            "font-medium transition-colors duration-300",
            index === levels.length - 1 && levels.length > 1 && "text-chart-4",
          )}
        />
      )}
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
          <CircleHelpIcon />
        </TooltipTrigger>
        <TooltipContent>{description}</TooltipContent>
      </Tooltip>
    </div>
  )

  if (levels.length <= 1) {
    return (
      <div className="flex flex-col gap-2.5 p-0.5">
        {header}
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-2.5 p-0.5">
      {header}
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
        {/* Sized by the label shown; see the note on the model trigger. */}
        <FlowText
          className="basis-[max-content]"
          value={current?.label ?? ""}
          direction={direction}
        />
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

/**
 * The providers the app can talk to, and the one in use.
 *
 * The strip is the first thing in the picker because everything else in it
 * belongs to the provider that is chosen: the models listed, the effort
 * levels offered, and the key the request goes out with. A provider with no
 * key is dimmed rather than hidden — it is one the user may have a key for
 * elsewhere, and the picker says what is missing rather than pretending the
 * provider is not there.
 */
function ProviderStrip({
  provider,
  onProviderChange,
  keys,
}: {
  provider: string
  onProviderChange: (value: string) => void
  keys: ProviderKey[]
}) {
  const reachable = (id: string) =>
    keys.some((key) => key.active && key.provider === id)

  return (
    <div
      role="radiogroup"
      aria-label="Provider"
      className="flex items-center gap-1 overflow-x-auto overscroll-contain pb-2"
    >
      {PROVIDERS.map((entry) => {
        const selected = entry.id === provider
        const hasKey = reachable(entry.id)
        return (
          <button
            key={entry.id}
            type="button"
            role="radio"
            aria-checked={selected}
            aria-label={entry.label}
            title={
              hasKey
                ? entry.label
                : "No " + entry.label + " key is set. Add one in Settings."
            }
            onClick={() => {
              if (!selected) haptic("tick")
              onProviderChange(entry.id)
            }}
            className={cn(
              "flex min-h-8 shrink-0 items-center gap-1.5 rounded-md border px-1.5 text-sm outline-none select-none",
              "focus-visible:ring-ring focus-visible:ring-2",
              selected
                ? "border-border bg-accent text-accent-foreground"
                : "border-transparent text-muted-foreground hover:bg-accent hover:text-accent-foreground",
              !hasKey && !selected && "opacity-50",
            )}
          >
            <ProviderLogo
              provider={entry.id}
              providerLabel={entry.label}
              className="size-4"
            />
            {selected ? <span className="truncate">{entry.label}</span> : null}
          </button>
        )
      })}
    </div>
  )
}

/**
 * There is no provider key, so there is nothing to choose.
 *
 * The list is not fetched without one — it comes from the provider, and a list
 * of models that cannot be called is a list of things that will fail. So this
 * says what is missing, and offers the way to put it right.
 */
function NoKeyState({
  onAddKey,
  providerLabel,
}: {
  onAddKey: () => void
  providerLabel?: string
}) {
  return (
    <div className="flex flex-col items-start gap-2 px-2 py-3">
      <p className="text-sm">
        {providerLabel
          ? "Tavi needs a " +
            providerLabel +
            " key before it can reach any of its models."
          : "Tavi needs a provider key before it can reach any model."}
      </p>
      <Button type="button" size="xs" variant="outline" onClick={onAddKey}>
        <KeyRoundIcon className="size-4" />
        Add a key in Settings
      </Button>
    </div>
  )
}

function PromptInputModel({
  models,
  model,
  onModelChange,
  effort,
  onEffortChange,
  provider,
  onProviderChange,
  providerKeys,
  noKey,
  error,
  catalogue,
  ...props
}: Omit<EffortProps, "value" | "onValueChange"> & {
  models: PromptModel[]
  model: string
  onModelChange: (value: string) => void
  effort: string
  onEffortChange: (value: string) => void
  /**
   * The provider in use, and the way to change it.
   *
   * Everything else in this picker belongs to that provider: the models that
   * are listed, the effort levels that are offered, and the key the request
   * goes out with.
   */
  provider: string
  onProviderChange: (value: string) => void
  /** The keys the app holds, so a provider with none can be said so. */
  providerKeys: ProviderKey[]
  /**
   * Whether there is no provider key at all.
   *
   * Without one the app cannot reach any model, so the list is not fetched
   * and this says what is missing rather than showing an empty box.
   */
  noKey?: boolean
  /**
   * What the server said when the list could not be read.
   *
   * The server's own words: it knows what went wrong, and this does not.
   */
  error?: string | null
  /**
   * How old the catalogue is, and whether it is the last good copy.
   *
   * A catalogue is a list of models and prices, so a copy that is weeks old
   * names models that no longer exist. The age is shown rather than assumed,
   * and the one state worth acting on — the provider could not be reached —
   * is called out.
   */
  catalogue?: { fetchedAt: number; degraded: boolean } | null
}) {
  const context = usePromptInput("PromptInputModel")
  const listRef = React.useRef<HTMLDivElement>(null)
  const selectedRef = React.useRef<HTMLButtonElement>(null)
  const searchRef = React.useRef<HTMLInputElement>(null)
  const [open, setOpen] = React.useState(false)
  const [query, setQuery] = React.useState("")
  const current = models.find((item) => item.value === model) ?? models[0]
  const { current: level, direction } = useEffortLevel(props.levels, effort)
  const choose = (next: string) => {
    if (next !== model) haptic("tick")
    onModelChange(next)
  }

  /* LOCAL EDIT: the catalogue is several hundred entries, so the list is
     searchable and capped at roughly eight rows. The numbered "press 1-9"
     shortcuts that used to sit on the right of each row are gone — they were
     invisible on touch and only ever addressed the first nine of hundreds. */
  const needle = query.trim().toLowerCase()
  const visible = needle
    ? models.filter(
        (item) =>
          item.label.toLowerCase().includes(needle) ||
          item.value.toLowerCase().includes(needle)
      )
    : models

  /* The composer's textarea autofocuses too, and it wins the race against
     `initialFocus` on the popover. Re-assert on the next tick so the search
     field is what the user types into. */
  React.useEffect(() => {
    if (!open) return
    searchRef.current?.focus()
    const timer = setTimeout(() => searchRef.current?.focus(), 0)
    return () => clearTimeout(timer)
  }, [open])

  return (
    <Popover
      open={open}
      onOpenChange={(next) => {
        setOpen(next)
        if (!next) {
          setQuery("")
          refocus(context.textareaRef.current)
        }
      }}
    >
      <PopoverTrigger
        render={
          <Button
            type="button"
            size="xs"
            variant="ghost"
            aria-label={`Model: ${current?.label ?? "No model selected"}, effort: ${level?.label ?? "none"}`}
            disabled={context.disabled}
          />
        }
      >
        {/* The model name yields space, the effort does not: this button is
            flex-shrunk by the actions row, and without `min-w-0 truncate` the raw text
            node kept its full width and spilled ~18px past the button edge.

            The name is said even when there is not one. A button that showed
            nothing at all was not readable as a button, so there was no sign
            the model could be chosen at all. */}
        <span className="min-w-0 truncate">
          {current?.label ?? "No model selected"}
        </span>
        {/* Sized by the label it is actually showing. This span used to hold an
            invisible copy of every level overlaid in the same grid cell, which
            sized the cell to the longest label in the set — so the button kept
            the width of "Extra high" while displaying "Medium", leaving ~40px
            of dead space between this text and the context dial. `levels` now
            varies per model anyway, so a fixed reservation has nothing to
            reserve against; FlowText's width morph keeps the swap smooth.

            Rendered as the flex item itself, on a `max-content` basis. A default
            basis fits to the space left over, which is zero once the model name
            has filled the button — so flex saw a perfect fit, never shrank the
            name, and FlowText's glyphs were clipped away by its own
            `overflow-hidden` instead. */}
        <FlowText
          className="shrink-0 basis-[max-content] text-muted-foreground"
          value={level?.label ?? ""}
          direction={direction}
        />
      </PopoverTrigger>
      <PopoverContent
        side="top"
        align="end"
        sideOffset={8}
        className="w-72"
        initialFocus={searchRef}
        finalFocus={context.textareaRef}
      >
        {/* The search field is hidden when there is nothing to search: a search
            box over an empty list is noise, and the list is empty because
            there is no key. */}
        <ProviderStrip
          provider={provider}
          onProviderChange={onProviderChange}
          keys={providerKeys}
        />

        {noKey ? null : (
          <div className="flex items-center gap-2 pb-2">
            <SearchIcon aria-hidden="true" className="text-muted-foreground size-4 shrink-0" />
            <input
              ref={searchRef}
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              /* First Escape clears the filter; a second one closes the popover,
                 which is what the user expects from a search field. */
              onKeyDown={(event) => {
                if (event.key === "Escape" && query) {
                  event.stopPropagation()
                  setQuery("")
                }
              }}
              placeholder="Search models…"
              aria-label="Search models"
              className="placeholder:text-muted-foreground/70 h-7 w-full min-w-0 rounded-md bg-transparent text-sm outline-none"
            />
          </div>
        )}

        <div
          ref={listRef}
          role="radiogroup"
          aria-label="Model"
          /* Capped at about six rows: the popover stays a predictable size and
             scrolls once the list overflows. */
          className="flex max-h-48 flex-col overflow-y-auto overscroll-contain py-0.5"
          onKeyDown={(event) => {
            const step =
              event.key === "ArrowDown" ? 1 : event.key === "ArrowUp" ? -1 : 0
            if (!step || visible.length === 0) return
            event.preventDefault()
            const index = visible.findIndex((item) => item.value === current?.value)
            const from = index < 0 ? 0 : index
            const next = visible[(from + step + visible.length) % visible.length]
            choose(next.value)
            requestAnimationFrame(() =>
              listRef.current
                ?.querySelector<HTMLElement>("[aria-checked=true]")
                ?.focus()
            )
          }}
        >
          {visible.length > 0 ? (
            visible.map((item) => {
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
                    <CheckIcon aria-hidden="true" className="size-4 shrink-0" />
                  ) : null}
                </button>
              )
            })
          ) : noKey ? (
            <NoKeyState
              providerLabel={providerFor(provider)?.label}
              onAddKey={() => {
                setOpen(false)
                openSettings("api-keys")
              }}
            />
          ) : error ? (
            <p className="text-muted-foreground px-2 py-3 text-sm">{error}</p>
          ) : (
            <p className="text-muted-foreground px-2 py-3 text-sm">
              No models match “{query.trim()}”.
            </p>
          )}
        </div>
        {/* Shown only when the model actually publishes effort levels. Nothing is
            claimed otherwise — not while the catalogue is still loading, and not
            for a model that publishes none — so the popover simply has no
            effort section rather than asserting a limitation. */}
        {props.levels.length > 0 ? (
          <div className="border-t pt-2.5">
            <EffortPanel {...props} value={effort} onValueChange={onEffortChange} />
          </div>
        ) : null}
        {catalogue ? (
          <p className="text-muted-foreground border-t px-2 pt-2 text-xs">
            {catalogue.degraded
              ? `Could not reach the provider — showing the last good catalogue, from ${catalogueAge(catalogue.fetchedAt)}.`
              : `Catalogue updated ${catalogueAge(catalogue.fetchedAt)}.`}
          </p>
        ) : null}
      </PopoverContent>
    </Popover>
  )
}

/**
 * How long ago something was, in words.
 *
 * A catalogue that is four minutes old and one that is four weeks old are
 * both "recent" to a machine, and neither is to a person choosing a model.
 */
function catalogueAge(fetchedAt: number): string {
  const seconds = Math.floor(Date.now() / 1000) - fetchedAt
  if (seconds < 60) return "just now"
  if (seconds < 3600) {
    const minutes = Math.floor(seconds / 60)
    return `${minutes} minute${minutes === 1 ? "" : "s"} ago`
  }
  if (seconds < 86_400) {
    const hours = Math.floor(seconds / 3600)
    return `${hours} hour${hours === 1 ? "" : "s"} ago`
  }
  const days = Math.floor(seconds / 86_400)
  if (days < 30) return `${days} day${days === 1 ? "" : "s"} ago`
  return `on ${new Date(fetchedAt * 1000).toLocaleDateString(undefined, {
    day: "numeric",
    month: "short",
    year: "numeric",
  })}`
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
        className="w-64"
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
  /** The composer text before dictation began, restored if the user cancels. */
  original: string
  /**
   * The range the dictated text currently occupies.
   *
   * Interim recognition results revise themselves - the engine re-sends a phrase
   * as it grows more confident - so each preview must replace the previous one.
   * Appending would stack "hel" then "hello" and the user would watch a stutter
   * instead of their sentence.
   */
  from: number
  to: number
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
  const latest = React.useRef(context)
  latest.current = context
  const { announce, textareaRef } = context

  /**
   * Writes the transcript into the composer as it is being recognised.
   *
   * The text goes in live, over the range the last preview occupied, so the user
   * can read back what the microphone is actually hearing - the thing they were
   * previously unable to see, because the whole composer used to be hidden
   * behind a waveform until the recording finished.
   *
   * `setRangeText` plus a synthetic `input` event is what the rest of this file
   * uses to write into the field, and it is what React listens for, so composer
   * state and the saved draft stay in step with what is on screen.
   */
  const preview = React.useCallback(
    (session: DictationSession, text: string) => {
      const field = textareaRef.current
      if (!field) return
      const clean = text.replace(/\s+/g, " ").trim()
      const before = field.value.slice(0, session.from)
      const lead = before && !/\s$/.test(before) && clean ? " " : ""
      const next = lead + clean
      field.setRangeText(next, session.from, session.to, "end")
      field.dispatchEvent(new Event("input", { bubbles: true }))
      session.to = session.from + next.length
    },
    [textareaRef],
  )

  /** Puts the composer back exactly as it was before dictation started. */
  const restore = React.useCallback(
    (session: DictationSession) => {
      const field = textareaRef.current
      if (!field) return
      field.value = session.original
      field.dispatchEvent(new Event("input", { bubbles: true }))
    },
    [textareaRef],
  )

  /** Frees the hardware a session was holding. Stable, so `start` stays stable. */
  const release = React.useCallback((session: DictationSession) => {
    clearInterval(session.timer)
    session.stream?.getTracks().forEach((track) => track.stop())
    session.audio?.close().catch(() => {})
  }, [])

  const start = React.useCallback(async () => {
    if (sessionRef.current || !canRecord()) return
    let finish: () => void = () => {}
    const ended = new Promise<void>((resolve) => {
      finish = resolve
    })
    /* Dictation starts at the caret and only ever covers what comes after it,
       so text the user had already written is never rewritten by the transcript.
       The anchor is read before any microphone work, because `getUserMedia` is
       async and the caret can move while it waits. */
    const field = textareaRef.current
    const anchor = field?.selectionStart ?? 0
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
      original: field?.value ?? "",
      from: anchor,
      to: anchor,
    }
    sessionRef.current = session
    setStatus("recording")
    haptic("tap")

    /* The microphone stream is only opened for the server-transcription path.
       Speech Recognition brings its own capture, so asking for a stream as well
       meant the user granted the microphone twice for one recording, and bought
       an AudioContext and a 20Hz analyser whose only output was a waveform
       across the whole composer. */
    if (transcribe) {
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
    }

    if (transcribe && session.stream) {
      const recorder = new MediaRecorder(session.stream)
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
          /* Show it as it arrives. This is the whole point of the change: the
             user watches their sentence being written and can see immediately
             when the engine has misheard something. */
          preview(session, `${session.heard} ${session.pending}`)
        }
        recognition.onerror = (event) => {
          if (event.error === "no-speech" || event.error === "aborted") return
          session.failed = true
          /* Each of these is a different fix for the user, so they get their own
             sentence rather than one "stopped" for all of them. `service-not-
             allowed` and `network` are the two that bite in practice: Chromium's
             recogniser calls a hosted service, so in a webview with no route to
             it the failure looks identical to "nothing happened" otherwise. */
          announce(
            event.error === "not-allowed"
              ? "Microphone access was denied. Allow it in your browser settings and try again."
              : event.error === "service-not-allowed"
                ? "Speech recognition isn't available here. This browser build has no speech service; it usually needs an internet connection."
                : event.error === "audio-capture"
                  ? "No microphone was found."
                  : event.error === "network"
                    ? "Speech recognition lost its connection to the speech service."
                    : "Speech recognition stopped.",
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
        /* `start()` throws if the engine is already running, which Chromium
           does readily when the service drops and the session is restarted by
           `onend`. A throw here would otherwise abandon the session with the
           button stuck on the recording glyph and the microphone still hot. */
        try {
          recognition.start()
          session.recognition = recognition
        } catch {
          if (sessionRef.current === session) sessionRef.current = null
          release(session)
          setStatus("idle")
          announce("The microphone could not be started. Try again.")
          textareaRef.current?.focus()
          return
        }
      } else {
        finish()
      }
    }
    announce("Recording. Press Escape to cancel, or click the microphone again to stop.")
  }, [announce, preview, release, textareaRef, transcribe])

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
        /* The preview has been writing into the composer the whole time, so
           cancelling has to take it back out. Restoring the original value is
           exact; there is nothing to reconstruct. */
        restore(session)
        setStatus("idle")
        announce("Recording discarded")
        textareaRef.current?.focus()
        return
      }

      /* Only the transcribe path has text left to fetch. With live recognition
         the transcript is already in the field - `preview` wrote it as it
         arrived - so there is nothing to insert again here. */
      let added = session.to > session.from
      if (session.recorder && transcribe) {
        session.recorder.stop()
        setStatus("transcribing")
        await session.ended
        let text = ""
        try {
          text = await transcribe(
            new Blob(session.chunks, { type: session.recorder.mimeType })
          )
        } catch {
          announce("Couldn’t transcribe that. Try again.")
        }
        preview(session, text)
        added = session.to > session.from
      } else if (session.recognition) {
        session.recognition.stop()
        /* No visible "transcribing" step: with live preview there is nothing
           left to wait for, and flashing a spinner over text that is already
           there would be noise. */
        await Promise.race([
          session.ended,
          new Promise((resolve) => setTimeout(resolve, 400)),
        ])
      }
      setStatus("idle")
      if (!added) {
        announce("Didn’t catch anything")
        textareaRef.current?.focus()
        return
      }
      /* Leave the caret after the dictated text so typing continues from
         there rather than jumping back to where the recording started. */
      const field = textareaRef.current
      if (field) field.setSelectionRange(session.to, session.to)
      if (action === "send" || autoSend) {
        setTimeout(() => latest.current.submit(), 350)
      }
    },
    [announce, autoSend, preview, restore, textareaRef, transcribe]
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

  const recording = status === "recording"
  const busy = status !== "idle"

  /* One button, three meanings, no overlay.
     Idle it starts dictation. Recording it stops and keeps the text. Transcribing
     it is inert until the transcript lands.

     The composer used to blank out entirely behind a waveform while recording,
     which meant the user could not read back what the microphone was hearing -
     the transcription only appeared at the very end, with no way to notice it had
     gone wrong until it was too late. Now the text arrives in the textarea as it
     is recognised, so the composer stays put and this button carries the
     recording state on its own. */
  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <Button
            type="button"
            size="icon"
            variant="ghost"
            shape="pill"
            data-recording={recording ? "" : undefined}
            aria-label={recording ? "Stop dictation" : busy ? "Transcribing" : "Dictate"}
            aria-pressed={recording || undefined}
            disabled={context.disabled || (busy && !recording)}
            onClick={() => void (recording ? stop("insert") : start())}
            className={cn(
              "relative transition-colors",
              recording && "bg-destructive/10 text-destructive hover:bg-destructive/15",
              /* The recording heartbeat. It pulses the button's own opacity, so
                 it stays inside the button - an earlier version rang a border
                 outward from an inset, which drew outside the button, over the
                 composer's rounded edge and onto the card behind it. */
              recording && "motion-safe:animate-pulse",
            )}
          />
        }
      >
        {recording ? (
          /* Stop means a filled square - the one shape the user already knows.
             Swapping the glyph in place keeps the button from resizing.

             `fill-current` is what makes it solid: lucide draws with
             `fill="none"`, so an outlined square reads as a hollow box rather
             than a stop button. */
          <SquareIcon className="size-3.5 fill-current" />
        ) : (
          <MicIcon className={cn(busy && "animate-pulse")} />
        )}
      </TooltipTrigger>
      <TooltipContent>
        {recording
          ? "Stop and keep text"
          : busy
            ? "Transcribing…"
            : "Dictate"}{" "}
        {shortcut ? <KbdGroup keys={shortcut} size="sm" /> : null}
      </TooltipContent>
    </Tooltip>
  )
}

type PromptOption = {
  value: string
  label: string
  icon?: React.ReactNode
  description?: string
  /**
   * Shown greyed out and not selectable. Used for options that are planned but
   * have no implementation behind them, so the menu can show where the feature
   * is going without offering something that would silently do nothing.
   */
  disabled?: boolean
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
                    disabled={option.disabled}
                    closeOnClick
                  >
                    {option.icon}
                    <span className="truncate">{option.label}</span>
                    {option.disabled ? (
                      <span className="ms-auto ps-2 text-xs text-muted-foreground/70">
                        Soon
                      </span>
                    ) : null}
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
        {/* The separator only makes sense when it divides two groups. With no
            options above it — nothing picked yet — it is just a stray line at
            the top of the menu. */}
        {children && options.length > 0 ? (
          <>
            <DropdownMenuSeparator />
            {children}
          </>
        ) : children ? (
          children
        ) : null}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

/**
 * How much of a folder name is shown before it is cut.
 *
 * A folder name can be a sentence — people name folders after what is in them.
 * The picker is a list of folders, not a place to read them, so a long name is
 * cut and marked rather than allowed to push the list wide. Twenty characters
 * holds most project names whole while still leaving room for the pill and the
 * row to sit side by side.
 */
const FOLDER_NAME_LIMIT = 20

/** Cuts a folder name to the limit, marking the cut with an ellipsis. */
function shortFolderName(name: string): string {
  return name.length > FOLDER_NAME_LIMIT
    ? `${name.slice(0, FOLDER_NAME_LIMIT)}…`
    : name
}

/**
 * The folder picker.
 *
 * Not the generic select, because a folder can be **forgotten**, and
 * forgetting belongs to *that* folder rather than to whatever happens to be
 * selected. A row at the foot of the menu saying "Forget" acts on the selected
 * folder, which is the wrong folder the moment the reader is looking at
 * another one.
 *
 * So every row is a submenu, and right-clicking the row opens it. The submenu
 * opens on a right-click rather than on a hover or a click, because a submenu
 * that popped open under the pointer every time the list was swept — or every
 * time a folder was chosen — would be noise, and this one has a single item in
 * it. Choosing a folder is a click; forgetting one is a right-click.
 *
 * **Forgetting a folder takes it out of this list and nothing else.** The
 * sessions that were run against it keep their history, keep the project they
 * were run against, and stay in the rail — forgetting where to work from is not
 * the same as throwing the work away.
 */
function PromptInputFolderSelect({
  folders,
  value,
  onValueChange,
  onForget,
  onRelink,
  onOpenFolder,
  onClone,
  label,
  placeholder,
  icon,
}: {
  /** The folders this app has been granted access to. */
  folders: { id: string; name: string; missing?: boolean }[]
  value?: string
  onValueChange: (value: string) => void
  /** Takes a folder out of the list. */
  onForget: (id: string) => void
  /** Points a folder that has moved at its new place. */
  onRelink: (id: string) => void
  /** Asks the system for a folder. */
  onOpenFolder: () => void
  /** Clones a repository into the projects folder. */
  onClone: () => void
  label: string
  placeholder?: string
  icon?: React.ReactNode
}) {
  const context = usePromptInput("PromptInputFolderSelect")
  const { announce, disabled } = context
  const current = folders.find((folder) => folder.id === value)
  /** What the pill says: the folder's name, cut to the limit. */
  const shown = current ? shortFolderName(current.name) : (placeholder ?? label)
  /** What the pill is called, for anyone who cannot see it. The whole name. */
  const named = current ? `${label}: ${current.name}` : `${label}: ${shown}`

  /**
   * Which row's submenu is open.
   *
   * One at a time, and only ever opened by a right-click: the submenu belongs
   * to a row, so two of them open at once would be two answers to the same
   * question.
   */
  const [openFor, setOpenFor] = React.useState<string | null>(null)

  const choose = (id: string) => {
    if (id !== value) haptic("tick")
    onValueChange(id)
    refocus(context.textareaRef.current)
  }

  const forget = (id: string, name: string) => {
    setOpenFor(null)
    onForget(id)
    announce(`Forgot ${name}.`)
  }

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
                  aria-label={named}
                  title={current?.name}
                  disabled={disabled}
                  className="min-w-0"
                />
              }
            />
          }
        >
          <span data-icon="inline-start" className="flex">
            {icon}
          </span>
          <span className="truncate">{shown}</span>
        </TooltipTrigger>
        <TooltipContent>{label}</TooltipContent>
      </Tooltip>
      <DropdownMenuContent
        side="top"
        align="start"
        sideOffset={8}
        finalFocus={context.textareaRef}
        className="min-w-40 max-w-72"
      >
        {folders.length === 0 ? (
          <DropdownMenuLabel>No folders yet</DropdownMenuLabel>
        ) : (
          folders.map((folder) => (
            <DropdownMenuSub
              key={folder.id}
              open={openFor === folder.id}
              onOpenChange={(open) => setOpenFor(open ? folder.id : null)}
            >
              <DropdownMenuSubTrigger
                /* A submenu that opened on a hover would pop open under the
                   pointer every time the list was swept past. This one is
                   opened by a right-click, and by the keyboard's own submenu
                   key. */
                openOnHover={false}
                onContextMenu={(event) => {
                  event.preventDefault()
                  setOpenFor(folder.id)
                }}
                /* A submenu trigger opens its submenu when it is pressed, and
                   a folder row is pressed to choose the folder. The press is
                   taken away from the menu, so choosing a folder does not also
                   throw up the submenu on top of it. The row still chooses the
                   folder, and the keyboard's submenu key still opens the
                   submenu, because that path does not go through a press. */
                onMouseDown={(event) => event.preventBaseUIHandler?.()}
                onClick={(event) => {
                  event.preventBaseUIHandler?.()
                  choose(folder.id)
                }}
                /* The submenu is opened by a right-click, so the arrow that
                   points at a submenu is a promise the row does not keep. */
                className="[&>[data-slot=dropdown-menu-sub-trigger-icon]]:hidden"
              >
                <FolderOpenIcon />
                <span className="truncate">{shortFolderName(folder.name)}</span>
                {folder.missing ? (
                  /* The folder has moved, or been renamed, and the app can no
                     longer reach it. Saying so is better than a project whose
                     files quietly are not there. */
                  <span className="ms-auto text-xs text-muted-foreground">
                    moved
                  </span>
                ) : folder.id === value ? (
                  <CheckIcon aria-hidden="true" className="ms-auto size-3.5" />
                ) : null}
              </DropdownMenuSubTrigger>
              <DropdownMenuSubContent>
                {folder.missing ? (
                  /* A folder that has moved is still the project the sessions
                     were run against, so it is pointed at its new place rather
                     than forgotten. */
                  <DropdownMenuItem onClick={() => onRelink(folder.id)}>
                    <FolderOpenIcon />
                    Relink folder
                  </DropdownMenuItem>
                ) : null}
                <DropdownMenuItem
                  onClick={() => forget(folder.id, folder.name)}
                  className="text-destructive"
                >
                  <Trash2Icon />
                  Forget folder
                </DropdownMenuItem>
              </DropdownMenuSubContent>
            </DropdownMenuSub>
          ))
        )}
        {folders.length > 0 ? <DropdownMenuSeparator /> : null}
        <DropdownMenuItem onClick={onOpenFolder}>
          <FolderOpenIcon />
          Open folder
        </DropdownMenuItem>
        <DropdownMenuItem onClick={onClone}>
          <GitBranchIcon />
          Clone repository
        </DropdownMenuItem>
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

/**
 * Starter prompts shown while the thread is empty.
 *
 * Clicking one fills the composer and deliberately does not send: the user
 * reviews and edits before committing. That is the pattern every mainstream
 * assistant uses, and the reason is that a starter is a draft, not an answer.
 *
 * The distinction that matters is *whose* draft it is. Clicking a starter leaves
 * the box holding one of our prompts, so the row stays put and that starter is
 * marked as filled - changing your mind is one more click. Only once the text is
 * something the user typed does the row stand down, because at that point the
 * starters are clutter on a prompt already in progress.
 *
 * This used to key off `text !== ""`, which hid the row the instant a starter was
 * clicked. Since the draft is persisted and restored, merely reloading the page
 * with a starter still in the box would present chips that ignored every click.
 *
 * Note the fade and `inert` are applied together: there is a 200ms window where
 * the row is still fading but no longer clickable. That is the existing look
 * everywhere in this file, and it is short enough not to be worth a layout jump
 * to remove.
 */
function PromptInputSuggestions({
  suggestions,
  className,
}: {
  suggestions: PromptSuggestion[]
  className?: string
}) {
  const context = usePromptInput("PromptInputSuggestions")

  const promptOf = (suggestion: PromptSuggestion) =>
    suggestion.prompt ?? suggestion.label

  /** A draft the user has not touched is still ours, not theirs. */
  const active = suggestions.find(
    (suggestion) => context.text === promptOf(suggestion),
  )
  const ownsDraft = context.text !== "" && active === undefined
  const hidden = ownsDraft

  return (
    <div
      role="group"
      aria-label="Suggestions"
      aria-hidden={hidden || undefined}
      inert={hidden}
      data-slot="prompt-input-suggestions"
      data-hidden={hidden ? "" : undefined}
      className={cn(
        "flex flex-wrap items-center justify-center gap-2 transition-opacity duration-200 ease-out data-hidden:opacity-0 motion-reduce:transition-none",
        className,
      )}
    >
      {suggestions.map((suggestion) => {
        const filled = active?.label === suggestion.label
        return (
          <Button
            key={suggestion.label}
            type="button"
            size="sm"
            variant="outline"
            shape="pill"
            aria-pressed={filled}
            className={cn(filled && "border-primary text-foreground")}
            onClick={() => {
              const field = context.textareaRef.current
              if (!field) return
              // Replace the whole draft, so clicking a different starter swaps
              // rather than appends to what is already there.
              replaceAll(field, promptOf(suggestion))
            }}
          >
            {suggestion.icon}
            {suggestion.label}
          </Button>
        )
      })}
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
  PromptInputFolderSelect,
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
