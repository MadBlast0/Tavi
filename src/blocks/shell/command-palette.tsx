"use client"

import * as React from "react"
import {
  KeyRoundIcon,
  MessageCircleIcon,
  PanelLeftIcon,
  SettingsIcon,
  ShieldIcon,
  SquarePenIcon,
} from "lucide-react"

import {
  Command,
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
  CommandShortcut,
} from "@/components/command"
import { useComposerVariant } from "@/blocks/prompt-input/composer-variant"
import { useNewThread, useThreadBridge } from "@/blocks/prompt-input/thread-bridge"
import { listChats } from "@/lib/chats"
import { formatHotkey, matchesHotkey, useIsApple } from "@/lib/hotkey"
import { OPEN_PALETTE, PALETTE_HOTKEY } from "@/lib/open-palette"
import { openSettings } from "@/lib/open-settings"
import { listSessions } from "@/lib/sessions"
import { SETTINGS_HOTKEY } from "./settings-dialog"

/**
 * How many conversations the palette lists.
 *
 * The plan says fifty per side, and fifty is what the rail holds, so the
 * palette can show every conversation there is and the rail cannot be
 * hiding one the palette has not heard of.
 */
const LIMIT = 50

/**
 * The command palette.
 *
 * One place to go to: the conversations on the side you are on, and the
 * app's own commands. It is opened with the usual shortcut, and from the
 * application menu's own row, because a command that is in the menu and
 * nowhere else is a command nobody finds.
 *
 * **It lists the side you are on.** Chat and Code are separate places with
 * separate conversations, and a palette that mixed them would be a list of
 * places rather than a list of things.
 */
export function CommandPalette({
  onToggleRail,
}: {
  /** Shows or hides the rail. */
  onToggleRail: () => void
}) {
  const [open, setOpen] = React.useState(false)
  const { variant, setVariant } = useComposerVariant()
  const bridge = useThreadBridge()
  const newThread = useNewThread()
  const apple = useIsApple()

  /* The shortcut and the menu's row both open it. */
  React.useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (
        event.defaultPrevented ||
        event.repeat ||
        !matchesHotkey(event, PALETTE_HOTKEY)
      ) {
        return
      }
      event.preventDefault()
      setOpen(true)
    }
    const onOpen = () => setOpen(true)
    window.addEventListener("keydown", onKeyDown)
    window.addEventListener(OPEN_PALETTE, onOpen)
    return () => {
      window.removeEventListener("keydown", onKeyDown)
      window.removeEventListener(OPEN_PALETTE, onOpen)
    }
  }, [])

  /**
   * The conversations, read when the palette opens.
   *
   * They are read then and not kept, because a palette that lists what the
   * store held when it was mounted would list a conversation that has since
   * been deleted, and would not list one that has since been written.
   */
  const conversations = React.useMemo(() => {
    if (!open) return []
    const list = variant === "chat" ? listChats() : listSessions()
    return list.slice(0, LIMIT)
  }, [open, variant])

  const run = React.useCallback(
    (action: () => void) => {
      setOpen(false)
      action()
    },
    [],
  )

  const shortcut = formatHotkey(PALETTE_HOTKEY, apple)

  return (
    <CommandDialog
      open={open}
      onOpenChange={setOpen}
      title="Command palette"
      description="Search the conversations on this side and the app's commands."
    >
      <Command>
        <CommandInput placeholder="Search conversations and commands" />
        <CommandList>
          <CommandEmpty>Nothing here matches that.</CommandEmpty>

          <CommandGroup
            heading={variant === "chat" ? "Chats" : "Sessions"}
          >
            {conversations.map((thread) => (
              <CommandItem
                key={thread.id}
                value={`${thread.title} ${thread.id}`}
                onSelect={() =>
                  run(() => bridge.functions.current?.open(thread.id))
                }
              >
                <MessageCircleIcon />
                {thread.title}
              </CommandItem>
            ))}
          </CommandGroup>

          <CommandSeparator />

          <CommandGroup heading="Commands">
            <CommandItem
              value="new chat"
              onSelect={() => run(() => newThread("chat"))}
            >
              <MessageCircleIcon />
              New chat
            </CommandItem>
            <CommandItem
              value="new session"
              onSelect={() => run(() => newThread("code"))}
            >
              <SquarePenIcon />
              New session
            </CommandItem>
            {variant === "chat" ? (
              <CommandItem
                value="go to code sessions"
                onSelect={() => run(() => setVariant("code"))}
              >
                <SquarePenIcon />
                Go to Code
              </CommandItem>
            ) : (
              <CommandItem
                value="go to chats"
                onSelect={() => run(() => setVariant("chat"))}
              >
                <MessageCircleIcon />
                Go to Chat
              </CommandItem>
            )}
            <CommandItem
              value="settings"
              onSelect={() => run(() => openSettings("general"))}
            >
              <SettingsIcon />
              Settings
              <CommandShortcut>
                {formatHotkey(SETTINGS_HOTKEY, apple)}
              </CommandShortcut>
            </CommandItem>
            <CommandItem
              value="api keys"
              onSelect={() => run(() => openSettings("api-keys"))}
            >
              <KeyRoundIcon />
              API keys
            </CommandItem>
            <CommandItem
              value="privacy"
              onSelect={() => run(() => openSettings("privacy"))}
            >
              <ShieldIcon />
              Privacy
            </CommandItem>
            <CommandItem value="sidebar" onSelect={() => run(onToggleRail)}>
              <PanelLeftIcon />
              Show or hide the sidebar
            </CommandItem>
          </CommandGroup>
        </CommandList>
      </Command>
    </CommandDialog>
  )
}
