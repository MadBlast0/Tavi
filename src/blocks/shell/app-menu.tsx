"use client"

import * as React from "react"
import { TextAlignJustifyStartIcon } from "lucide-react"

import { Button } from "@/components/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "@/components/dropdown-menu"
import { useNewThread } from "@/blocks/prompt-input/thread-bridge"
import { hideWindow, quitApp } from "@/lib/desktop"
import { isDesktopApp } from "@/lib/platform"

/**
 * The application menu.
 *
 * One entry per command, three levels deep where the command has a command of
 * its own. The shape is the shape of the menu bar every desktop app has, and
 * it is here rather than invented so that the muscle memory of the machine
 * the app is running on still applies.
 *
 * The entries that would run a command are rendered disabled, because a menu
 * item that looks live and does nothing is worse than one that admits it —
 * the same rule the rail's unfinished destinations follow. The entries that
 * open another menu stay enabled, since a submenu that cannot be opened is
 * not a shape at all.
 *
 * Three of them are live: the ones the system tray also has, because they
 * are the app's own commands and having them in two places is not a reason
 * to have them in one. The rest are the shape of the menu and nothing more.
 */
type MenuEntry = {
  label: string
  /** Present when the entry opens a menu of its own. */
  children?: MenuEntry[]
  /** Why the entry is inert, said on hover. */
  why?: string
  /** What the entry does, when it does something. */
  action?: MenuAction
}

/** The commands the menu can run. */
type MenuAction = "new-chat" | "new-session" | "close-window" | "exit"

const NOT_BUILT = "Not built yet"

/**
 * The commands only the desktop app can run, and why.
 *
 * "Close window" puts the app away and "Exit" leaves it, and both are things
 * the operating system owns. A browser tab can be neither hidden nor closed
 * from the page it is showing, so in a browser these two are rendered
 * disabled with the reason said on hover — the same thing every other
 * command in this menu that does not exist yet does.
 *
 * Leaving them looking live would be the one kind of lie this menu cannot
 * tell: the entry is there, it is enabled, and pressing it does nothing.
 */
const DESKTOP_ONLY: Partial<Record<MenuAction, string>> = {
  "close-window":
    "A browser tab cannot be put away. This command belongs to the desktop app.",
  exit: "A browser tab cannot be closed from the page. This command belongs to the desktop app.",
}

/**
 * The menu's contents.
 *
 * Read as a tree, top to bottom: the five menus, and under each the commands
 * they hold. The three that open a further menu are marked by having
 * children of their own.
 */
const MENU: MenuEntry[] = [
  {
    label: "File",
    children: [
      { label: "New chat", action: "new-chat" },
      { label: "New session", action: "new-session" },
      { label: "Open file" },
      { label: "Open folder" },
      { label: "Settings" },
      { label: "Close window", action: "close-window" },
      { label: "Exit", action: "exit" },
    ],
  },
  {
    label: "Edit",
    children: [
      { label: "Undo" },
      { label: "Redo" },
      { label: "Cut" },
      { label: "Copy" },
      { label: "Paste" },
      { label: "Delete" },
      { label: "Select all" },
      { label: "Find" },
      { label: "Find next" },
      { label: "Find previous" },
    ],
  },
  {
    label: "View",
    children: [
      { label: "Command palette" },
      { label: "Sidebar" },
      { label: "Terminal changes" },
      { label: "Browser files" },
      { label: "Side chat" },
      { label: "Close pane" },
      {
        label: "Split view",
        children: [
          { label: "New session on right" },
          { label: "New session below" },
          { label: "Focus next split view" },
          { label: "Focus previous split view" },
          { label: "Move split view left" },
          { label: "Move split view right" },
          { label: "Move split view up" },
          { label: "Move split view down" },
          { label: "Close split view" },
        ],
      },
      { label: "Actual size" },
      { label: "Zoom in" },
      { label: "Zoom out" },
      { label: "Full screen" },
      { label: "Reload" },
    ],
  },
  {
    label: "Go",
    children: [
      { label: "Back" },
      { label: "Forward" },
      { label: "Previous chat" },
      { label: "Next chat" },
      { label: "Search" },
    ],
  },
  {
    label: "Help",
    children: [
      { label: "Help" },
      { label: "Keyboard shortcuts" },
      {
        label: "Troubleshooting",
        children: [
          { label: "Show logs in file explorer" },
          { label: "Copy installation ID" },
          { label: "Source session data in file explorer" },
          { label: "Generate diagnostic report" },
          { label: "Record next log" },
          { label: "Enable developer mode" },
          { label: "Disable hardware acceleration" },
          { label: "Enable co-work VM debug logging" },
          { label: "Enable SDK debugging" },
          { label: "Free up disk space" },
          { label: "Delete VM bundle and restart" },
          { label: "Delete sessions / VM sessions and restart" },
          {
            label: "Import CLI sessions",
            children: [
              {
                label: "No CLIs found",
                why: "The app does not look for installed CLIs yet",
              },
            ],
          },
          { label: "Review pinned git origin" },
          { label: "Clear cache and restart" },
          { label: "Reset app data" },
        ],
      },
      { label: "Get support" },
      { label: "About Tavi" },
    ],
  },
]

/**
 * One level of the menu, rendered.
 *
 * An entry with children becomes a submenu trigger, and the level under it is
 * this same component again — which is what lets the tree be any depth
 * without the component knowing how deep it is. An entry without children is a
 * command: it runs its action, or it is inert.
 */
function MenuEntries({
  entries,
  run,
}: {
  entries: MenuEntry[]
  run: (action: MenuAction) => void
}) {
  return entries.map((entry) => {
    /* An entry with an action this build cannot honour is drawn disabled,
       with the reason said on hover. It stays in the tree, so it is still
       discoverable — a menu that quietly dropped the rows would be a
       different menu in each build. */
    const blocked = entry.action ? DESKTOP_ONLY[entry.action] : undefined
    const inert = blocked !== undefined && !isDesktopApp()

    if (entry.children) {
      return (
        <DropdownMenuSub key={entry.label}>
          <DropdownMenuSubTrigger>{entry.label}</DropdownMenuSubTrigger>
          <DropdownMenuSubContent>
            <MenuEntries entries={entry.children} run={run} />
          </DropdownMenuSubContent>
        </DropdownMenuSub>
      )
    }

    if (entry.action) {
      return inert ? (
        <DropdownMenuItem key={entry.label} disabled title={blocked}>
          {entry.label}
        </DropdownMenuItem>
      ) : (
        <DropdownMenuItem key={entry.label} onClick={() => run(entry.action!)}>
          {entry.label}
        </DropdownMenuItem>
      )
    }

    return (
      <DropdownMenuItem
        key={entry.label}
        disabled
        title={entry.why ?? NOT_BUILT}
      >
        {entry.label}
      </DropdownMenuItem>
    )
  })
}

/**
 * The menu button in the title bar.
 *
 * It is the second control from the left, after the sidebar's toggle, and it
 * opens the whole menu rather than one branch of it: the branches are the
 * submenus, so the menu can be opened and read without committing to File or
 * Edit before it is known which is wanted.
 */
export function AppMenu() {
  const newThread = useNewThread()

  /* The commands the menu really has. The window's own controls are the same as
     the tray's: closing the window puts the app away rather than quitting it,
     and quitting is a command of its own. */
  const run = React.useCallback(
    (action: MenuAction) => {
      if (action === "new-chat") {
        newThread("chat")
        return
      }
      if (action === "new-session") {
        newThread("code")
        return
      }
      if (!isDesktopApp()) return
      if (action === "close-window") {
        void hideWindow().catch(() => {})
        return
      }
      void quitApp().catch(() => {})
    },
    [newThread],
  )

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <Button
            variant="ghost"
            size="icon-xs"
            className="size-7"
            aria-label="Main menu"
          />
        }
      >
        <TextAlignJustifyStartIcon className="size-4" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" sideOffset={4}>
        <MenuEntries entries={MENU} run={run} />
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
