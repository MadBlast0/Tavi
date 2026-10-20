"use client"

import * as React from "react"
import {
  CircleSmallIcon,
  ClockIcon,
  FolderIcon,
  ListFilterIcon,
  PinIcon,
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
import {
  useNewThread,
  useThreadBridge,
} from "@/blocks/prompt-input/thread-bridge"
import { ThreadContextMenu } from "./thread-context-menu"
import type { RailThread } from "./rail-thread"
import { listChats, onChatsChanged } from "@/lib/chats"
import { listRecentFolders } from "@/lib/fs-access"
import {
  listSessions,
  onSessionsChanged,
} from "@/lib/sessions"
import { formatWhen } from "@/lib/threads"
import type { Side } from "@/lib/sides"
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

/**
 * How two threads are ordered by the reader's choice.
 *
 * The comparison is separated from the sort so that the project groups can be
 * ordered by the same rule as the threads inside them.
 */
function compareThreads(a: RailThread, b: RailThread, sort: Sort) {
  if (sort === "newest") return b.updatedAt - a.updatedAt
  if (sort === "oldest") return a.updatedAt - b.updatedAt
  /* `numeric` so "Session 2" sorts before "Session 10", and base-case so a
     capitalised title is not exiled to the top of its own group. */
  const direction = sort === "az" ? 1 : -1
  return (
    direction *
    a.title.localeCompare(b.title, undefined, {
      numeric: true,
      sensitivity: "base",
    })
  )
}

function sortThreads(sessions: RailThread[], sort: Sort) {
  const sorted = [...sessions].sort((a, b) => compareThreads(a, b, sort))
  /* Pinned threads stay at the top whatever order was chosen, the way every one
     of these apps does it — the pin is a statement about which threads matter,
     not about how to read them. Most-recently-pinned first among themselves. */
  return sorted.sort((a, b) => (b.pinnedAt ?? 0) - (a.pinnedAt ?? 0))
}

/**
 * Groups sessions by the project they were run against.
 *
 * The key is the folder's id and the heading is its name: the id is what
 * identifies a folder, and the name is what a person reads. Two projects whose
 * directories share a name are two groups, not one.
 *
 * The name comes from the recents list where the app has one, so a folder that
 * has been renamed on disk is called by its new name rather than by the name
 * that was recorded when the session was run.
 */
function groupByProject(sessions: RailThread[], folderNames: Record<string, string>) {
  const groups = new Map<string, { name: string; threads: RailThread[] }>()
  for (const session of sessions) {
    const key = session.folder || NO_FOLDER
    const bucket = groups.get(key)
    if (bucket) bucket.threads.push(session)
    else {
      groups.set(key, {
        name: (session.folder && folderNames[session.folder]) || session.folderName || NO_FOLDER,
        threads: [session],
      })
    }
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
  sortLabel,
  sort,
  onSortChange,
}: {
  label: string
  /** What the list is called in the sort control's own words. */
  sortLabel: string
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
              <Button
                variant="ghost"
                size="icon-xs"
                aria-label={`Sort ${sortLabel}`}
              />
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
  thread,
  active,
  running,
  onOpen,
}: {
  thread: RailThread
  active: boolean
  running: boolean
  onOpen: (id: string) => void
}) {
  return (
    /* The context menu supplies the row's own <li>, so what goes in is the
       button and the timestamp and nothing else. */
    <ThreadContextMenu thread={thread}>
      <SidebarMenuButton
        size="sm"
        className={THREAD}
        isActive={active}
        onClick={() => onOpen(thread.id)}
        title={thread.title}
      >
        {/* The pin says this thread is one to come back to. It is drawn rather
            than only felt through ordering, because a pin you cannot see is a
            pin you forget you set. */}
        {thread.pinnedAt ? (
          <PinIcon
            aria-hidden="true"
            className="size-3 shrink-0 text-sidebar-foreground/50"
          />
        ) : null}
        {/* The dot says this thread is answering right now. It is driven by
            the live stream rather than by a flag the row makes up, so it
            appears on exactly one row and only while a reply is in flight —
            and on no row at all when nothing is running, which is quieter
            than a column of grey dots. */}
        {running ? (
          <span
            aria-hidden="true"
            className="size-1.5 shrink-0 rounded-full bg-success motion-safe:animate-pulse"
          />
        ) : null}
        <span className="min-w-0 flex-1 truncate">{thread.title}</span>
      </SidebarMenuButton>
      {/* The badge is absolutely positioned over the row, and the context
          menu's trigger is the row itself, so the badge is carried inside the
          trigger rather than beside it. */}
      <SidebarMenuBadge className="text-sidebar-foreground/70">
        {running ? "Running" : formatWhen(thread.updatedAt)}
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
  const newThread = useNewThread()
  /* The two lists, kept apart.
     A chat is not a code session, so the rail is not one list drawn twice: it
     is two lists, and the switch says which of them you are looking at. */
  const [chats, setChats] = React.useState<RailThread[]>(() =>
    listChats().map((chat) => ({
      id: chat.id,
      title: chat.title,
      updatedAt: chat.updatedAt,
      model: chat.model,
      pinnedAt: chat.pinnedAt,
      side: "chat" as const,
    })),
  )
  const [sessions, setSessions] = React.useState<RailThread[]>(() =>
    listSessions().map((session) => ({
      id: session.id,
      title: session.title,
      updatedAt: session.updatedAt,
      model: session.model,
      folder: session.folder,
      folderName: session.folderName,
      pinnedAt: session.pinnedAt,
      side: "code" as const,
    })),
  )
  /* Per mode, for the same reason the lists themselves are: a chat list sorted
     one way and a project list sorted another is two answers to one list. Not
     stored — a sort is a way of reading what is on screen, and re-reading it
     the way you left it is the default everywhere else in the app. */
  const [sortByMode, setSortByMode] = React.useState<Record<Side, Sort>>({
    chat: "newest",
    code: "newest",
  })
  const sort = sortByMode[variant]

  /**
   * The names of the folders this app has been granted.
   *
   * Read from the recents list, so a folder that has been renamed on disk is
   * called by its new name. The session record keeps the name it was run with,
   * which is what a session that belongs to a folder nobody has picked any more
   * still shows.
   */
  const [folderNames, setFolderNames] = React.useState<Record<string, string>>({})

  React.useEffect(() => {
    const refresh = () => {
      void listRecentFolders().then((folders) =>
        setFolderNames(Object.fromEntries(folders.map((f) => [f.id, f.name]))),
      )
    }
    refresh()
    window.addEventListener("focus", refresh)
    return () => window.removeEventListener("focus", refresh)
  }, [])

  /**
   * The projects, with their sessions, in the order the reader chose.
   *
   * The groups are ordered by the same rule as the threads inside them: a list
   * that can be ordered one way should not leave its groups in an order of
   * their own.
   */
  const codeGroups = React.useMemo(() => {
    const groups = groupByProject(sessions, folderNames).map(
      ([key, group]) =>
        [key, { name: group.name, threads: sortThreads(group.threads, sort) }] as const,
    )
    return groups.sort((a, b) => {
      const first = a[1].threads[0]
      const other = b[1].threads[0]
      if (!first || !other) return 0
      return compareThreads(first, other, sort)
    })
  }, [sessions, sort, folderNames])

  /* The composer writes threads whenever a message is sent, and it writes them
     straight to the store rather than through here. So this listens to the
     stores instead of trying to watch someone else's writes, and re-reads on
     their own signals. Re-reading on window focus as well, because a thread
     can also change in another tab. */
  React.useEffect(() => {
    const refresh = () => {
      setChats(
        listChats().map((chat) => ({
          id: chat.id,
          title: chat.title,
          updatedAt: chat.updatedAt,
          model: chat.model,
          pinnedAt: chat.pinnedAt,
          side: "chat" as const,
        })),
      )
      setSessions(
        listSessions().map((session) => ({
          id: session.id,
          title: session.title,
          updatedAt: session.updatedAt,
          model: session.model,
          folder: session.folder,
          folderName: session.folderName,
          pinnedAt: session.pinnedAt,
          side: "code" as const,
        })),
      )
    }
    refresh()
    const stopChats = onChatsChanged(refresh)
    const stopSessions = onSessionsChanged(refresh)
    window.addEventListener("focus", refresh)
    return () => {
      stopChats()
      stopSessions()
      window.removeEventListener("focus", refresh)
    }
  }, [])

  function onNew() {
    /* Through the same path the tray and the menu take, so that a queued
       tray intent is answered by what the user has just done instead of
       firing straight afterwards and switching the surface out from under
       them. */
    newThread(variant)
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
          sortLabel={variant === "code" ? "sessions" : "chats"}
          sort={sort}
          onSortChange={onSortChange}
        />
      </SidebarGroup>

      {variant === "code"
        ? codeGroups.map(([project, group]) => (
            <SidebarGroup key={project} className={GROUP}>
              <SidebarGroupLabel className={cn(LABEL, "px-1 text-xs text-sidebar-foreground/60")}>
                {group.name}
              </SidebarGroupLabel>
              <SidebarMenu>
                {group.threads.map((thread) => (
                  <ThreadRow
                    key={thread.id}
                    thread={thread}
                    active={thread.id === bridge.activeId}
                    running={thread.id === bridge.runningId}
                    onOpen={onOpen}
                  />
                ))}
              </SidebarMenu>
            </SidebarGroup>
          ))
        : (
            <SidebarGroup className={GROUP}>
              <SidebarMenu>
                {sortThreads(chats, sort).map((thread) => (
                  <ThreadRow
                    key={thread.id}
                    thread={thread}
                    active={thread.id === bridge.activeId}
                    running={thread.id === bridge.runningId}
                    onOpen={onOpen}
                  />
                ))}
              </SidebarMenu>
            </SidebarGroup>
          )}

      {/* An empty list says so. A rail with a heading and nothing under it
          reads as a list that has failed to load rather than one that has
          nothing in it yet. */}
      {(variant === "code" ? sessions.length === 0 : chats.length === 0) ? (
        <SidebarGroup className={GROUP}>
          <p className="px-2 py-1 text-xs text-sidebar-foreground/60">
            {variant === "code" ? "No sessions yet." : "No chats yet."}
          </p>
        </SidebarGroup>
      ) : null}
    </>
  )
}