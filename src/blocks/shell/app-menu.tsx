"use client"

import * as React from "react"
import { invoke } from "@tauri-apps/api/core"
import { getCurrentWindow } from "@tauri-apps/api/window"
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
import { isDesktopApp } from "@/lib/desktop"

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
type MenuAction = "new-chat" | "close-window" | "exit"

const NOT_BUILT = "Not built yet"

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
  return entries.map((entry) =>
    entry.children ? (
      <DropdownMenuSub key={entry.label}>
        <DropdownMenuSubTrigger>{entry.label}</DropdownMenuSubTrigger>
        <DropdownMenuSubContent>
          <MenuEntries entries={entry.children} run={run} />
        </DropdownMenuSubContent>
      </DropdownMenuSub>
    ) : entry.action ? (
      <DropdownMenuItem key={entry.label} onClick={() => run(entry.action!)}>
        {entry.label}
      </DropdownMenuItem>
    ) : (
      <DropdownMenuItem
        key={entry.label}
        disabled
        title={entry.why ?? NOT_BUILT}
      >
        {entry.label}
      </DropdownMenuItem>
    ),
  )
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

  /* The three commands the menu really has. The window's own controls are
     the same as the tray's: closing the window puts the app away rather than
     quitting it, and quitting is a command of its own. */
  const run = React.useCallback(
    (action: MenuAction) => {
      if (action === "new-chat") {
        newThread("chat")
        return
      }
      if (!isDesktopApp()) return
      if (action === "close-window") {
        void getCurrentWindow().hide().catch(() => {})
        return
      }
      void invoke("quit_app").catch(() => {})
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
