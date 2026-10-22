/**
 * The kinds of view a workspace can hold, and the mark that names each.
 *
 * A **pane** is one view inside a workspace, a **pane type** is a kind of
 * view — a Terminal, a Diff, a Browser — and a **pane instance** is one
 * occurrence of a type with its own id. This is the naming half of the
 * registry: the key an instance is stored under, the name it has before
 * anybody renames it, and the mark that tells two kinds of view apart in a
 * header and in the Views menu.
 *
 * It is plain data on purpose. Nothing here renders and nothing here knows
 * how a pane is built — the registry owns that, and a second opinion about
 * it would be a second place for the panes to drift from each other. The
 * rules the marks follow are in `docs/icons.md`.
 *
 * It lives beside the workspace rather than in `src/lib/` because that is
 * where a map of things-with-icons belongs: `src/blocks/shell/settings-sections.ts`
 * holds the same shape for the settings card, in the folder beside the
 * component that shows it. `src/lib/` holds state and services.
 */
import type { ComponentType } from "react"
import {
  ActivityIcon,
  AppWindowIcon,
  ClipboardListIcon,
  CodeXmlIcon,
  DiffIcon,
  FileCodeIcon,
  FileTextIcon,
  FolderTreeIcon,
  GlobeIcon,
  ListTodoIcon,
  MessageCircleIcon,
  ScrollTextIcon,
  TerminalIcon,
} from "lucide-react"

/** What a pane type carries: the key, the name, the mark, and the line the Views menu says it under. */
export type PaneType = {
  /** The stable key a pane instance of this type carries. */
  id: string
  /** What the pane is called before anybody renames it. */
  label: string
  /** The mark that names the pane. */
  icon: ComponentType<{ className?: string }>
  /** What the Views menu says the pane is for. */
  description: string
}

/**
 * Every pane type, and the mark that names it.
 *
 * The order is the order of the plan's own inventory, and it is the order the
 * Views menu will use: conversations, then the things a session touches, then
 * the files, then what happened.
 */
export const PANE_TYPES: readonly PaneType[] = [
  {
    id: "chat",
    label: "Chat",
    /* The app's own Chat mark, from the Chat/Code switch. The composer's
       "ask" mode deliberately uses a different bubble so that the two do not
       share a glyph, and this is the one the plain bubble belongs to. */
    icon: MessageCircleIcon,
    description: "A conversation, and what came back.",
  },
  {
    id: "code-session",
    label: "Code Session",
    /* The app's own Code mark, from the same switch. `CodeIcon` is not
       available: it is the edit mode, and two things must not share a glyph. */
    icon: CodeXmlIcon,
    description: "A coding session against a project.",
  },
  {
    id: "diff",
    label: "Diff Viewer",
    /* The mark says what the pane is. `Columns2Icon` would say how it happens
       to be drawn — a split view — and the pane is only split some of the
       time. */
    icon: DiffIcon,
    description: "The changes in a set of files.",
  },
  {
    id: "browser",
    label: "Browser",
    /* A globe is the web, and this pane is the web. */
    icon: GlobeIcon,
    description: "A page, with an address bar.",
  },
  {
    id: "app-preview",
    label: "Application Preview",
    /* A window, because this pane is the app being built seen through a
       frame. `MonitorIcon` is not available: it is the system theme in the
       settings card, and a preview is not the machine's own display. */
    icon: AppWindowIcon,
    description: "The app you are building, as it looks now.",
  },
  {
    id: "terminal",
    label: "Terminal",
    /* The same mark the composer uses for a remote shell, because it is the
       same idea: a place a command is typed. */
    icon: TerminalIcon,
    description: "A shell and its output.",
  },
  {
    id: "file-explorer",
    label: "File Explorer",
    /* A folder and what is inside it. The app already uses `FolderIcon` for a
       project in the rail, so the tree is what tells a pane of files from a
       row of files. */
    icon: FolderTreeIcon,
    description: "The files in a project.",
  },
  {
    id: "file-editor",
    label: "File Editor",
    /* A file of source. `CodeIcon` is the edit mode and is not available;
       this is a file, which is what the pane opens. */
    icon: FileCodeIcon,
    description: "One file, open to read.",
  },
  {
    id: "plan",
    label: "Plan",
    /* `ListChecksIcon` is the plan *mode* and the *test* command already, and
       it is ambiguous. A clipboard is a plan before anything has been done to
       it. */
    icon: ClipboardListIcon,
    description: "The steps a piece of work is broken into.",
  },
  {
    id: "tasks",
    label: "Tasks",
    /* A list of things to do, with boxes to tick. `ListChecksIcon` is taken
       by the plan mode, and two panes in one menu cannot share a mark. */
    icon: ListTodoIcon,
    description: "The things to do, and how they are going.",
  },
  {
    id: "agent-activity",
    label: "Agent Activity",
    /* A pulse. This is the one pane whose subject is something happening, and
       the mark says that rather than saying what is happening. */
    icon: ActivityIcon,
    description: "What an agent is doing, and what it did.",
  },
  {
    id: "file-preview",
    label: "File Preview",
    /* The composer's own mark for a file. A preview is a file being read
       rather than edited, and the editor above it is a file being edited; the
       labels are what tell them apart. */
    icon: FileTextIcon,
    description: "A file as it reads, without editing it.",
  },
  {
    id: "logs",
    label: "Logs",
    /* A scroll of text going down. `NotebookTextIcon` reads as a page of
       prose, and a log is not prose. */
    icon: ScrollTextIcon,
    description: "A running record of what happened.",
  },
]

/**
 * The key of a pane type, taken from the list rather than written beside it.
 *
 * A union that is written out separately is a second list to keep in step,
 * and a type added to the list above and not to the union is a pane the
 * code will not accept.
 */
export type PaneTypeKey = (typeof PANE_TYPES)[number]["id"]
