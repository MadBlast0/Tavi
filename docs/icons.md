# The icons

Every mark the app is drawn with, and the rules it draws them by.

This document describes the app **as it is**. It is the map a new surface is
built from: which pack a glyph comes from, how big it is, when it is read
aloud and when it is not. It is not a design document — the design is the
code, and the code is `lucide-react` plus the classes in `src/`.

---

## 1. One pack

`lucide-react`, and only `lucide-react`.

| | |
|---|---|
| The pack | `lucide-react` |
| The import | a named import, from the bare specifier |
| The name | every identifier ends in `Icon` |
| The version | 1.59.0 — 1891 icons |

Sixty-six files import icons. Every one of them imports from
`lucide-react`, every one by name, and every one with the suffix on the
identifier: `XIcon`, not `X`. Between them they bring in 266 identifiers —
127 distinct glyphs.

**Why one pack and not two.** The two packs an app is most likely to reach
for are not interchangeable at the same size. Both stroke at 2px, so the
stroke does not tell them apart; their glyph proportions do. A `size-4` from
each in the same row reads as a mistake rather than as a choice, and there is
no way to draw that back except by changing the icons, which is a change to
every screen at once.

`src/lib/icons.test.ts` checks this. It fails on a second pack in
`package.json`, on an import of one, on a sub-path import such as
`lucide-react/icons/x`, and on an import that is not a named import.

---

## 2. Canonical names, not aliases

Lucide renamed a handful of glyphs and kept the old names working. The alias
and the canonical name are the same component — `AlertCircleIcon` and
`CircleAlertIcon` are one object — so the choice shows up in the code and
nowhere else in the app.

| The alias | The name to use | Where the alias is used today |
|---|---|---|
| `AlertCircleIcon` | `CircleAlertIcon` | `components/button/button.tsx`, `components/field/field.tsx` |
| `AlertTriangleIcon` | `TriangleAlertIcon` | `components/toast/toast.tsx`, `components/video-player/video-player.tsx` |
| `MoreHorizontalIcon` | `EllipsisIcon` | `components/thread.aui.tsx` |
| `Loader2Icon` | `LoaderCircleIcon` | `components/image.tsx`, `components/assistant-ui/elements/attachment.aui.tsx` |
| `Trash2Icon` | `TrashIcon` | `blocks/prompt-input/prompt-controls.tsx`, `blocks/shell/settings-keys.tsx`, `blocks/shell/settings-privacy.tsx`, `blocks/shell/thread-context-menu.tsx` |
| `XCircleIcon` | `CircleXIcon` | `components/assistant-ui/elements/tool-fallback.aui.tsx` |

New code uses the canonical name. The existing uses are listed rather than
changed: the same task that wrote this map also said not to change the app's
icons without a clear reason, and there is not one. The test fails on a
*new* use of an alias and lets the old ones stand, and it checks the table
against the installed package so it cannot go stale.

The app already uses the canonical names elsewhere: `CircleAlertIcon` in
`src/toolkit.tsx`, `src/blocks/prompt-input/prompt-block.tsx`,
`src/blocks/prompt-input/clone-dialog.tsx` and
`src/blocks/shell/settings-keys.tsx`; `TriangleAlertIcon` in
`settings-keys.tsx`; `EllipsisIcon` in `components/breadcrumb` and
`components/pagination`; `CircleXIcon` in `components/toast`.

---

## 3. The size scale

**An icon with no size of its own is 16 pixels.** The app says so in one
form, on the container:

```
[&_svg:not([class*='size-'])]:size-4
```

Forty-nine places across twenty-nine files say it. Thirty-two of them are
the `size-4` form; the rest are `size-3`, `size-3.5`, `size-5`, `size-6` and
one `size-2.5`.

The guard is what makes the rule hold. It applies only to an icon that has
not named a size of its own, so an icon that says `size-3.5` keeps it and
the container does not argue.

**The unguarded form is a different thing.** Twelve places, across eight
files, write `[&_svg]:size-*` — no guard, so it overrides whatever the icon
said. Those are overrides rather than defaults, and they are the reason a
mark can be fourteen pixels inside a control that otherwise promises
sixteen.

| | |
|---|---|
| `size-3` — 12px | a mark beside a caption |
| `size-3.5` — 14px | a mark beside a caption, in a row with more in it |
| `size-4` — 16px | anything in a control |
| `size-6` — 24px, `size-8` — 32px | only where the icon *is* the picture |

Sizes on an icon element in the app today: `size-2` twice, `size-3` ten
times, `size-3.25` twice, `size-3.5` seventeen times, `size-4` fifty-six
times, `size-5` once, `size-6` once, `size-8` four times.

**There is no 28-pixel icon anywhere in the app.** `size-7` is a *control* —
a button twenty-eight pixels across — and the icon inside it is `size-4`.
The one size that is not on the scale is `size-3.25`, and it belongs to the
restore glyph in the window controls, which is two squares offset against
each other.

---

## 4. The stroke

Lucide's default stroke is 2px, and every action icon in the app uses it.

`absoluteStrokeWidth` is nowhere in the app. `strokeWidth` is set in five
files, and every one of them is a mark rather than an action or a
decoration: the checkbox's tick (2.75), the questionnaire's tick (3), the
switch's tick (3), the spinner (2.25 and 2.5) and the composer's context
gauge (2). The first three are Lucide's own `CheckIcon` and `MinusIcon`
with a heavier stroke than the pack's; the last two are inline SVG and not
glyphs at all. No action icon and no decorative icon overrides the stroke.

---

## 5. Outline, with one exception

The app draws Lucide's outline. There is exactly one exception, and it is a
rule rather than a decoration:

> **A filled mark means *this is the state in force*.**

A mark is filled in three files, and all of it says the same thing: the
dictation button's stop square
(`src/blocks/prompt-input/prompt-controls.tsx:1942`), the sort mark in the
rail (`src/blocks/shell/sidebar-nav.tsx:117`), and the vendored thread's
stop squares (`src/components/thread.aui.tsx:509,528`). An ordinary action
icon is never filled.

**Inline SVG is for state glyphs, never for an action.** There are four: the
spinner, the progress ring, the composer's context-usage gauge and the
safe-area overlay. All four show something that is happening or is being
measured. An action Lucide already covers is drawn with Lucide.

**When Lucide has no glyph, compose it from Lucide pieces and say why.**
There is one: `RestoreGlyph` in `src/blocks/shell/window-controls.tsx` is
two `SquareIcon`s at `size-3.25`, because Lucide has no restore glyph and
`CopyIcon` reads as "duplicate" at that size. The comment says so, and the
comment is the point.

---

## 6. Decorative or accessible

Lucide's own behaviour, read out of the installed package:

- An icon is **hidden from assistive technology by default**. It renders
  `aria-hidden="true"` unless it has children, an `aria-*` prop, a `role`, or
  a `title`.
- Passing `aria-label` **unhides** it. That is the opposite of what people
  expect, and it is the correct behaviour: an icon that carries meaning
  should be exposed.

So:

- **A decorative icon needs nothing.** Lucide already hides it. The app's
  forty-five explicit `aria-hidden` attributes on icons are redundant but
  harmless; the other 239 rely on the default.
- **An icon that carries meaning is given a name** — an `aria-label`, or a
  `title` child. The name goes on the *control* rather than on the icon
  when the control already has one.
- **When an explicit `aria-hidden` is wanted** — on a wrapping element, or
  to be explicit — the spelling is `aria-hidden="true"`. Never a bare
  `aria-hidden`: that is an empty string, and it only works because every
  implementation treats any value other than "false" as true. The app uses
  both today, thirty-three bare and twelve explicit on icons, and new code
  uses the explicit one.

---

## 7. An icon-only control is `TooltipIconButton`

`src/components/tooltip-icon-button.tsx` is the app's shared icon button. It
puts a `Button variant="ghost" size="icon"` inside a tooltip trigger, puts
a visually hidden `<span className="aui-sr-only sr-only">{tooltip}</span>`
inside the trigger, and shows a `TooltipContent` with the same text.

The `tooltip` prop is **required**, so a caller cannot have the button
without the name. That is the component's whole purpose: the visible name
and the accessible name are the same string, so they cannot disagree.

**Every icon-only control has a name.** There is no bare icon button in the
app, and there must not be one. The name comes from an `aria-label`, from a
visually hidden span, or from the tooltip's own text.

**The caveat, said plainly.** The wrapper has fifteen call sites and **one**
of them is live: the copy button on a code block in
`src/components/markdown-text.tsx`. The other fourteen are in the vendored
assistant-ui files. Meanwhile the app's own live icon-only controls — the
window buttons, the sidebar's sort, the app menu, the composer's dictation
and context controls, the settings card's key actions — are raw `Button`s
and raw `<button>`s with a hand-written `aria-label` and a hand-written
tooltip. The wrapper is the right answer and is barely used. **A new pane
uses it.**

---

## 8. An icon is never the only message

The rule: an icon is **plus** text, or an icon plus a name that spells the
state out.

The app does this most of the time. The save error in the composer is a
`CircleAlertIcon` beside the sentence that says what went wrong
(`src/blocks/prompt-input/prompt-block.tsx:2336`). A file in a tool result
is a `FileIcon` beside the file's path (`src/toolkit.tsx:112`). A finished
clone is a `FolderCheckIcon` beside the sentence that says it worked
(`src/blocks/prompt-input/clone-dialog.tsx:150`). Where the control has no
text of its own, the name says it: the composer's context meter is named
`{percent}% of context used`, and the help beside the effort control is
named "About effort".

Three places break it, and a new pane must not copy them:

1. `src/components/field/field.tsx:307` — the field's validity mark. The
   whole span is `aria-hidden`, and it holds a `CheckIcon` for good and an
   `AlertCircleIcon` for bad. Shape and colour, no text.
2. `src/components/button/button.tsx:271` — the button's status layer.
   Success draws a `CircleCheckIcon`, error draws an `AlertCircleIcon`, and
   when the button is icon-only the icon is the entire message and the
   accessible name does not change.
3. `src/blocks/shell/sidebar-nav.tsx:398` — a pinned thread shows a
   `PinIcon` and nothing else. The pin is twelve pixels, muted, and nothing
   says "pinned".

**Why this matters more in the workspace than anywhere else.** The Logs
pane's severity, the Diff pane's change sign and the Agent Activity pane's
agent state all have to be *spelled*. A red line in a diff and a green line
in a diff are the same glyph to somebody who cannot see red, and the plan
asks for a `+`/`−` marker or another non-colour cue for exactly that reason.

---

## 9. One action, one glyph

The same action is the same glyph everywhere — the toolbar, the pane menu and
the context menu. Two names for one glyph is a bug, and so is one name for
two actions.

Where the app is not consistent today it is written down here rather than
changed, because the task that wrote this map also said not to change the
app's icons without a clear reason:

| What | Where |
|---|---|
| `BugIcon` means both "fix" and "review" | `src/blocks/prompt-input/prompt-block.tsx:309,311` |
| `ListChecksIcon` means both "test" and "plan" | the same file, `:310,312` |
| the mode list keeps the rule the command list breaks | the same file, `:279–288` |
| a ternary with two identical branches | the same file, `:2227` — the name is tested for `.md`/`.mdx` and both arms draw `FileTextIcon` |
| the composer mixes sizes in one button | a `SquareIcon` at `size-3.5` beside a `MicIcon` with no size, so sixteen |
| the toast mixes | a 16px status mark beside a 14px close mark in the same row (`src/components/toast/toast.tsx:237,272`) |
| the selected mark is two sizes in one menu | a 16px check in the checkbox item and an 8px filled circle in the radio item (`src/components/dropdown-menu/dropdown-menu.tsx:407,475`) |
| "effort" has two glyphs | `GaugeIcon` in the model picker, `CircleHelpIcon` in the composer's effort control (`src/blocks/prompt-input/prompt-controls.tsx:588`) |
| "code" has two glyphs | `CodeIcon` for the edit mode, `CodeXmlIcon` for the Code layout |

The last two are why a pane type may not take a glyph that already means
something else. `CodeIcon` is the edit mode, `GaugeIcon` is the effort
control, `BugIcon` is a command, and `ListChecksIcon` is the plan mode.

---

## 10. The pane types

The map is `src/blocks/workspace/pane-types.ts`, and it is the icon half of
the registry the plan describes. The registry itself is a later task, and
nothing renders this map yet.

| Key | Label | Icon | Description |
|---|---|---|---|
| `chat` | Chat | `MessageCircleIcon` | A conversation, and what came back. |
| `code-session` | Code Session | `CodeXmlIcon` | A coding session against a project. |
| `diff` | Diff Viewer | `DiffIcon` | The changes in a set of files. |
| `browser` | Browser | `GlobeIcon` | A page, with an address bar. |
| `app-preview` | Application Preview | `AppWindowIcon` | The app you are building, as it looks now. |
| `terminal` | Terminal | `TerminalIcon` | A shell and its output. |
| `file-explorer` | File Explorer | `FolderTreeIcon` | The files in a project. |
| `file-editor` | File Editor | `FileCodeIcon` | One file, open to read. |
| `plan` | Plan | `ClipboardListIcon` | The steps a piece of work is broken into. |
| `tasks` | Tasks | `ListTodoIcon` | The things to do, and how they are going. |
| `agent-activity` | Agent Activity | `ActivityIcon` | What an agent is doing, and what it did. |
| `file-preview` | File Preview | `FileTextIcon` | A file as it reads, without editing it. |
| `logs` | Logs | `ScrollTextIcon` | A running record of what happened. |

A pane type needs four things: a stable key, a name, a mark, and a line of
description for the Views menu. The key is what an instance is stored under,
so it is lowercase, hyphenated, and never reused for a different kind of
view.

The mark is chosen so that it does not already mean something else. Four of
them are marks the app already uses for the same idea, and that is the
point: `MessageCircleIcon` is the app's Chat mark and `CodeXmlIcon` its
Code mark, both from the Chat/Code switch; `TerminalIcon` is the mark the
composer uses for a remote shell; and `FileTextIcon` is the app's own file
mark, from the composer's attachment list. A pane that shows the same thing
should be marked the same way. The rest are marks the app does not use yet.

Two of the obvious ones are not available. `CodeIcon` would have named a
Code Session, and it is the edit mode — the app's own comment on the mode
list says that two things must not share a glyph. `ListChecksIcon` would
have named Tasks, and it is already the plan mode *and* the test command.

---

## 11. Adding an icon

1. **Check the name against the installed pack** before you write it:
   `node_modules/lucide-react` has 1891 of them, and the list on disk is the
   one that counts. A name that does not exist is a compile error, and
   `src/lib/icons.test.ts` fails on it as well.
2. **Import it by name, with the suffix**:
   `import { DiffIcon } from "lucide-react"`.
3. **Size it by leaving it alone** if it is in a control — the container's
   guard gives it sixteen pixels. Say `size-3.5` only for a mark beside a
   caption.
4. **Give it a name** if it carries meaning on its own, and give the
   *control* the name when the control already has one.
5. **Add the text** if the icon would otherwise be the only message.
6. **Compose it from Lucide pieces** if Lucide has no glyph, and say why in
   a comment — the way `window-controls.tsx` composes the restore glyph.
7. **Do not reuse a glyph that already means something else.** If it does,
   find one that does not.
