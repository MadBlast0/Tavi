"use client"

import * as React from "react"
import {
  CircleSmallIcon,
  ClockIcon,
  FolderIcon,
  ListFilterIcon,
  PlusIcon,
  ShapesIcon,
  SlidersHorizontalIcon,
  ZapIcon,
} from "lucide-react"

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from "@/components/dropdown-menu"
import { Button } from "@/components/button"
import {
  SidebarGroup,
  SidebarGroupAction,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuBadge,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@/components/sidebar"
import { useComposerVariant } from "@/blocks/prompt-input/composer-variant"
import { useThreadBridge } from "@/blocks/prompt-input/thread-bridge"
import { ThreadContextMenu } from "./thread-context-menu"
import {
  formatWhen,
  listSessions,
  onSessionsChanged,
  type StoredSession,
} from "@/lib/sessions"
import { cn } from "@/lib/utils"

/**
 * Row geometry, shared by the destinations and the threads so the two read as
 * one list rather than two.
 *
 * `size="sm"` is the component's compact row at 28px. Its own padding is 8px,
 * which at that height is most of the row and leaves the 16px icon somewhere to
 * sit; taking it off and giving back only the inline padding puts the icon and
 * the label on one line with a few pixels of air, which is what a row in a rail
 * is for.
 *
 * The label is set a notch above that size's own 12px. Twelve is legible but it
 * reads as an afterthought next to 14px type everywhere else, and 13px costs
 * nothing vertically in a 28px row — the compactness here comes from the height,
 * not from shrinking the words.
 */
const ROW = "gap-2 p-0 px-2 text-[0.8125rem]"

/**
 * There are three states in this rail and they have to be told apart at a
 * glance, because two of them mean "not now" in quite different senses.
 *
 * The thread you are looking at is at full strength. The others are dimmed —
 * they are perfectly usable, they are just not what is open, and the rail is
 * mostly a list of things you are not currently in. The destinations with
 * nothing behind them are dimmed further, by the component's own
 * `disabled:opacity-50`.
 *
 * The gap between the two dimmed states is the point. At one strength they
 * merge, and a row that cannot be opened looks like a row that merely is not
 * open, which is a lie about how much of this app exists.
 */
const THREAD = cn(ROW, "text-sidebar-foreground/70 data-active:text-sidebar-accent-foreground")

/** Groups sit tight against the rows they contain. */
const GROUP = "px-2 py-1"

/** The label above a group of threads is a caption, not a row. */
const LABEL = "h-5 px-1"

/**
 * Every sort option carries a ring; the chosen one is filled in.
 *
 * The component's own radio mark cannot express this. It draws nothing at all
 * on the unchosen options, scales to half size when unchosen
 * (`motion-safe:scale-50`) and is a hollow circle even when chosen — so making
 * it show on every row leaves four rings in two different sizes, which reads as
 * a mistake rather than as a set of choices.
 *
 * The mark is also the only thing saying which ordering is in force, so a solid
 * disc answers that more plainly than an empty one does. Which option is
 * chosen is known here, so the mark is drawn from that rather than inferred
 * from a state attribute, and the component's is hidden. Its 16px slot at the
 * row's start is kept — both marks sit in the same place, so the labels do not
 * move — and `aria-checked` still comes from the radio item, so assistive
 * technology is unaffected.
 */
const SORT_OPTION = "[&_[data-slot=dropdown-menu-radio-item-indicator]]:hidden"

function SortMark({ selected }: { selected: boolean }) {
  return (
    <span
      aria-hidden
      className="pointer-events-none absolute start-2 flex size-4 items-center justify-center"
    >
      {/* circle-small, not circle: it is drawn at half the radius, so at this
          size it stays a clean ring instead of closing up into a dot. */}
      <CircleSmallIcon className={cn("size-3", selected && "fill-current")} />
    </span>
  )
}

type NavEntry = {
  id: string
  label: string
  icon: React.ComponentType<{ className?: string }>
  /** Why this row cannot be pressed yet, shown as its tooltip. */
  why?: string
}

/**
 * What sits under the Chat/Code switch, one list per mode.
 *
 * These are genuinely two lists, not one list filtered by mode. Chat is having a
 * conversation and Code is working in a repository, so what you can go and do
 * is a different set of things; sharing entries because the icons happen to
 * match would mean each mode offers something the other cannot honour.
 *
 * Only New is live. Every other destination needs a screen that does not exist,
 * and a row that looks pressable and is not is worse than one that says so.
 *
 * The icons are chosen to be told apart at 16px without reading the label:
 * a plus for starting something, a shape for what has been produced, a bolt
 * for what runs on its own, a clock for what is due.
 *
 * The bolt is drawn filled-looking at a glance because its zigzag is the only
 * silhouette here with a strong diagonal, which is what keeps Routines from
 * reading as another box or stack next to Artifacts. Artifacts was a layer
 * stack, which at 16px is three near-parallel lines and not much of a shape;
 * a circle and a square crossed over each other is heavier and reads at the
 * same size without being confused with Projects' folder.
 */
const NAV: Record<"chat" | "code", NavEntry[]> = {
  chat: [
    { id: "new", label: "New", icon: PlusIcon },
    {
      id: "projects",
      label: "Projects",
      icon: FolderIcon,
      why: "No projects in this mode yet",
    },
    {
      id: "artifacts",
      label: "Artifacts",
      icon: ShapesIcon,
      why: "Not built yet — there is no artifacts store",
    },
    {
      id: "scheduled",
      label: "Scheduled",
      icon: ClockIcon,
      why: "Not built yet — nothing can be scheduled to run",
    },
    {
      id: "customize",
      label: "Customize",
      icon: SlidersHorizontalIcon,
      why: "Not built yet — there is nothing to customise",
    },
  ],
  code: [
    { id: "new", label: "New", icon: PlusIcon },
    {
      id: "artifacts",
      label: "Artifacts",
      icon: ShapesIcon,
      why: "Not built yet — there is no artifacts store",
    },
    {
      id: "routines",
      label: "Routines",
      icon: ZapIcon,
      why: "Not built yet — nothing can be run on a schedule",
    },
    {
      id: "scheduled",
      label: "Scheduled",
      icon: ClockIcon,
      why: "Not built yet — nothing can be scheduled to run",
    },
    {
      id: "customize",
      label: "Customize",
      icon: SlidersHorizontalIcon,
      why: "Not built yet — there is nothing to customise",
    },
  ],
}

/**
 * Code groups its threads by the project they were run against. A thread
 * carries the folder it was pointed at, so the grouping is a fact about the
 * thread rather than something invented here — which is why a thread with no
 * folder gets a group that says so instead of being hidden or given a name.
 */
const NO_FOLDER = "No folder"

/**
 * How a list of threads can be ordered.
 *
 * The four are what a file browser offers for the two properties a thread list
 * has: a name and a date. Time leads because the common question is which one
 * was touched last, but a long list of generated titles is unreadable in date
 * order, so name is there too.
 */
type Sort = "newest" | "oldest" | "az" | "za"

const SORTS: { value: Sort; label: string }[] = [
  { value: "newest", label: "Newest first" },
  { value: "oldest", label: "Oldest first" },
  { value: "az", label: "Name (A to Z)" },
  { value: "za", label: "Name (Z to A)" },
]

function sortThreads(sessions: StoredSession[], sort: Sort) {
  const sorted = [...sessions]
  if (sort === "newest") sorted.sort((a, b) => b.updatedAt - a.updatedAt)
  else if (sort === "oldest") sorted.sort((a, b) => a.updatedAt - b.updatedAt)
  else {
    /* `numeric` so "Session 2" sorts before "Session 10", and base-case so a
       capitalised title is not exiled to the top of its own group. */
    const direction = sort === "az" ? 1 : -1
    sorted.sort(
      (a, b) =>
        direction *
        a.title.localeCompare(b.title, undefined, {
          numeric: true,
          sensitivity: "base",
        }),
    )
  }
  /* Pinned threads stay at the top whatever order was chosen, the way every one
     of these apps does it — the pin is a statement about which threads matter,
     not about how to read them. Most-recently-pinned first among themselves. */
  return sorted.sort((a, b) => (b.pinnedAt ?? 0) - (a.pinnedAt ?? 0))
}

function groupByProject(sessions: StoredSession[]) {
  const groups = new Map<string, StoredSession[]>()
  for (const session of sessions) {
    const key = session.folder || NO_FOLDER
    const bucket = groups.get(key)
    if (bucket) bucket.push(session)
    else groups.set(key, [session])
  }
  return [...groups.entries()]
}

/**
 * The heading above a thread list, with the sort control at its far right.
 *
 * One per mode rather than one per project: a list that can be ordered one way
 * should not offer the same four choices once for every group, and the reader
 * is choosing how to read the whole list, not how to read one project.
 */
function ThreadListHeading({
  label,
  sort,
  onSortChange,
}: {
  label: string
  sort: Sort
  onSortChange: (sort: Sort) => void
}) {
  return (
    <div className="flex items-center">
      <SidebarGroupLabel className={cn(LABEL, "grow")}>{label}</SidebarGroupLabel>
      {/* The vendored action is an absolutely-positioned square button meant to
          sit on its own. It is given a non-button root and put back into the
          flow, because the control here is a menu trigger and a button inside a
          button is not a thing. */}
      <SidebarGroupAction
        render={<span />}
        className="static! ms-auto! aspect-auto! w-auto!"
      >
        <DropdownMenu>
          <DropdownMenuTrigger
            render={
              /* No open-state tint here either: the funnel lights up under the
                 pointer and goes out again when it leaves, rather than staying
                 lit while its menu is up. */
              <Button variant="ghost" size="icon-xs" aria-label="Sort threads" />
            }
          >
            {/* Three centred lines narrowing downward — the funnel's triangle
                drawn as lines rather than as a shape. Reads as the same control
                without the solid mass a filled funnel puts next to a list of
                thin type. */}
            <ListFilterIcon />
          </DropdownMenuTrigger>
          {/* Opens to the right of the rail, not under the button. The rail's own
              content clips at its edge, so a menu that opened downward would be
              cut off by it; opening sideways puts the list over the work area,
              which is empty at that corner, and keeps the menu clear of the
              threads it is reordering.

              `align="start"` puts the menu's top edge on the button's top edge
              rather than centring a tall menu against a short button, so the
              thing that opened it and the thing it opened read as one pair
              instead of the list appearing to hang off the middle of an icon. */}
          <DropdownMenuContent side="right" align="start" sideOffset={6} className="w-44">
            <DropdownMenuLabel>Sort by</DropdownMenuLabel>
            <DropdownMenuRadioGroup
              value={sort}
              onValueChange={(next) => onSortChange(next as Sort)}
            >
              {SORTS.map((option) => (
                <DropdownMenuRadioItem
                  key={option.value}
                  value={option.value}
                  className={SORT_OPTION}
                >
                  <SortMark selected={sort === option.value} />
                  {option.label}
                </DropdownMenuRadioItem>
              ))}
            </DropdownMenuRadioGroup>
          </DropdownMenuContent>
        </DropdownMenu>
      </SidebarGroupAction>
    </div>
  )
}

function ThreadRow({
  session,
  active,
  onOpen,
}: {
  session: StoredSession
  active: boolean
  onOpen: (id: string) => void
}) {
  return (
    /* The context menu supplies the row's own <li>, so what goes in is the
       button and the timestamp and nothing else. */
    <ThreadContextMenu session={session}>
      <SidebarMenuButton
        size="sm"
        className={THREAD}
        isActive={active}
        onClick={() => onOpen(session.id)}
        title={session.title}
      >
        <span className="min-w-0 flex-1 truncate">{session.title}</span>
      </SidebarMenuButton>
      {/* The badge is absolutely positioned over the row, and the context
          menu's trigger is the row itself, so the badge is carried inside the
          trigger rather than beside it. */}
      <SidebarMenuBadge className="text-sidebar-foreground/70">
        {formatWhen(session.updatedAt)}
      </SidebarMenuBadge>
    </ThreadContextMenu>
  )
}

/**
 * The rail's contents: this mode's destinations, then this mode's threads.
 *
 * Both halves follow the switch. Nothing is shared between Chat and Code but
 * the components they are drawn with — the same row, the same badge, the same
 * timestamp — because the same idea in two places should look like the same
 * idea.
 */
export function SidebarNav() {
  const { variant } = useComposerVariant()
  const bridge = useThreadBridge()
  const [sessions, setSessions] = React.useState<StoredSession[]>(() => listSessions())
  /* Per mode, for the same reason the lists themselves are: a chat list sorted
     one way and a project list sorted another is two answers to one list. Not
     stored — a sort is a way of reading what is on screen, and re-reading it
     the way you left it is the default everywhere else in the app. */
  const [sortByMode, setSortByMode] = React.useState<Record<"chat" | "code", Sort>>({
    chat: "newest",
    code: "newest",
  })
  const sort = sortByMode[variant]

  /* The composer writes threads whenever a message is sent, and it writes them
     straight to the store rather than through here. So this listens to the
     store instead of trying to watch someone else's writes, and re-reads on
     the store's own signal. Re-reading on window focus as well, because a
     thread can also change in another tab. */
  React.useEffect(() => {
    const refresh = () => setSessions(listSessions())
    refresh()
    const stop = onSessionsChanged(refresh)
    window.addEventListener("focus", refresh)
    return () => {
      stop()
      window.removeEventListener("focus", refresh)
    }
  }, [])

  function onNew() {
    bridge.functions.current?.reset()
  }

  function onOpen(id: string) {
    bridge.functions.current?.open(id)
  }

  function onSortChange(next: Sort) {
    setSortByMode((current) => ({ ...current, [variant]: next }))
  }

  return (
    <>
      <SidebarGroup className={GROUP}>
        <SidebarMenu>
          {NAV[variant].map((entry) => (
            <SidebarMenuItem key={entry.id}>
              <SidebarMenuButton
                size="sm"
                className={ROW}
                disabled={Boolean(entry.why)}
                title={entry.why}
                onClick={entry.id === "new" ? onNew : undefined}
              >
                <entry.icon />
                {entry.label}
              </SidebarMenuButton>
            </SidebarMenuItem>
          ))}
        </SidebarMenu>
      </SidebarGroup>

      <SidebarGroup className={GROUP}>
        <ThreadListHeading
          label={variant === "code" ? "Sessions" : "Chats"}
          sort={sort}
          onSortChange={onSortChange}
        />
      </SidebarGroup>

      {variant === "code"
        ? groupByProject(sessions).map(([project, threads]) => (
            <SidebarGroup key={project} className={GROUP}>
              <SidebarMenu>
                {sortThreads(threads, sort).map((session) => (
                  <ThreadRow
                    key={session.id}
                    session={session}
                    active={session.id === bridge.activeId}
                    onOpen={onOpen}
                  />
                ))}
              </SidebarMenu>
            </SidebarGroup>
          ))
        : (
            <SidebarGroup className={GROUP}>
              <SidebarMenu>
                {sortThreads(sessions, sort).map((session) => (
                  <ThreadRow
                    key={session.id}
                    session={session}
                    active={session.id === bridge.activeId}
                    onOpen={onOpen}
                  />
                ))}
              </SidebarMenu>
            </SidebarGroup>
          )}
    </>
  )
}