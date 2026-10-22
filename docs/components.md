# The components

Every shared component in the app, what each one is for, and which one to
use for a given job.

This document describes the app **as it is**. It is the map a new surface is
built from: when a pane needs a menu, a tooltip, a status badge or a
scrollable region, this says which component it takes. The rule it exists to
enforce is one line long: **there is one component for each job, and a new
surface takes it rather than making its own.**

---

## 1. The one family

Every component in the app is built on **Base UI** (`@base-ui/react/*`).
There is no Radix in the project, and there is not going to be one: a second
primitive family is a second set of behaviours — a second focus model, a
second portal, a second way of closing an overlay — and the app has one of
each already.

| | |
|---|---|
| The primitives | `@base-ui/react` |
| The style | shadcn's `base-nova`, which is what `components.json` declares |
| The components | `src/components/<name>/<name>.tsx`, one folder each, with an `index.ts` |
| The class merging | `cn`, from the `cn` package — `src/lib/utils.ts` re-exports it |

A component's folder holds one file and an `index.ts` that re-exports it.
The import is the folder:

```tsx
import { Button } from "@/components/button"
```

### The second generation

`src/components/ui/` holds ten components from an **older** generation of the
same set: `avatar`, `button`, `command`, `dialog`, `input-group`, `input`,
`popover`, `skeleton`, `textarea`, `tooltip`.

They are the same primitives, written against an older shadcn style. They
are **not** part of the design system and nothing new is built from them.
They are still on disk because the vendored assistant-ui elements import
them, and those elements are raw material the project keeps on purpose —
see `docs/plan/build-plan.md`, *"Twenty-five vendored components are
imported by nothing. They map onto the list above almost one to one."*

The one place the app's **own** code reached for the older generation was
`src/components/tooltip-icon-button.tsx`, the app's shared icon button. It
is now on the canonical family, so everything the app itself runs is on one
family. `src/lib/components.test.ts` checks that, and fails if anything
reachable from the entry point reaches for the old one again.

---

## 2. The map

One row per job. The **canonical** column is the one to use.

| Job | The component | Notes |
|---|---|---|
| A button | `@/components/button` | `variant`: `default`, `outline`, `secondary`, `ghost`, `ghost-destructive`, `destructive`, `link`. `size`: `xs`, `sm`, `default`, `lg`, and the `icon` family |
| An icon-only button | `@/components/tooltip-icon-button` | The button above plus its tooltip. **Use this, not a bare `Button` with `size="icon"`** — an icon with no label needs one |
| A tooltip | `@/components/tooltip` | Only inside `TooltipIconButton`, or where a control has a visible label already |
| An action list | `@/components/dropdown-menu` | The menu under a trigger |
| Right-click actions | `@/components/context-menu` | The same items as the dropdown, on a right click |
| An anchored panel | `@/components/popover` | Filters, small settings, a picker |
| A dialog | `@/components/dialog` | A form that wants focus |
| A confirmation | `@/components/alert-dialog` | Destructive or disruptive, and only then |
| A searchable list | `@/components/command` | The palette, and the Views picker when it arrives |
| A picker with a value | `@/components/select` | One of several |
| A picker with a value, searchable | `@/components/combobox` | |
| A single choice, visible | `@/components/radio-group` | |
| One line of text | `@/components/input` | |
| Several lines of text | `@/components/textarea` | |
| A field with a label | `@/components/field` | And `@/components/label` |
| Sections | `@/components/tabs` | Only where tabbing is the point |
| An expandable list | `@/components/collapsible` | And `@/components/tree` for a file tree |
| A scrollable region | `@/components/scroll-area` | Or the app's own scroll pattern |
| A rule between two things | `@/components/separator` | |
| A status | `@/components/badge` | `secondary`, `destructive`, `outline`, `success`, `info`, `warning` |
| Something loading | `@/components/skeleton` | Shaped like what is coming |
| Something spinning | `@/components/spinner` | |
| How far along | `@/components/progress` | |
| A number that changes | `@/components/number-flow` | The token meter uses it |
| A confirmation of a small act | `@/components/toast` | And never for something that did not happen |
| A keyboard key | `@/components/kbd` | |
| A row of items | `@/components/item` | |
| A card | `@/components/card` | |
| Nothing here yet | `@/components/empty` | Icon, title, explanation, one action |
| Something went wrong | `@/components/alert` | `destructive`, `warning`, `info`, `success` |
| A draggable divider | `@/components/resizable` | The split panels. **Vendored and not yet used** |
| The left rail | `@/components/sidebar` | The app's own rail |
| A table | `@/components/table`, `@/components/data-table` | |
| A chart | `@/components/chart` | |
| A file, and its icon | `@/components/file` | `getMimeTypeIcon` picks the icon |
| A calendar | `@/components/calendar` | |
| A slider | `@/components/slider` | |
| A switch | `@/components/switch` | |
| A checkbox | `@/components/checkbox` | |
| A carousel | `@/components/carousel` | |
| A hover card | `@/components/hover-card` | |
| A drawer | `@/components/drawer` | |
| A sheet | `@/components/sheet` | |
| A menubar | `@/components/menubar` | |
| A navigation menu | `@/components/navigation-menu` | |
| A pagination | `@/components/pagination` | |
| A date picker | `@/components/date-picker` | |

### The app's own

These are not shadcn's. They are the app's, and they are what a new surface
reaches for when the shadcn set does not have the thing.

| | What it is |
|---|---|
| `@/components/tooltip-icon-button` | A button that is only an icon, and the tooltip that names it |
| `@/components/surfaces` | The shared class vocabulary: `pressable`, `ghostButton`, `inkButton`, `iconSwap`, `labelSwap`, `collapsePanel`, and the `paper` / `floating` / `field` surfaces |
| `@/components/message-scroller` | The scrolling conversation, with its scroll-to-bottom button |
| `@/components/markdown-text` | The markdown renderer, with the copy button on a code block |
| `@/components/model-picker` | The model chooser in the composer |
| `@/components/setting-row` | A labelled row in the settings card |
| `@/components/info-hint` | The small "?" that explains a row |
| `@/components/icon-switch` | The Chat/Code switch — one control, two states |
| `@/components/provider-logo` | A provider's mark |
| `@/components/spinner`, `@/components/skeleton` | Used by the app as well as the vendored set |
| `@/components/thread.aui` and `src/assistant.tsx` | The assistant-ui thread surface. **Not reachable from the entry point** — raw material |

---

## 3. The rules

1. **One component per job.** If this document names a component for what
   you are building, that is the one. A pane that needs a menu uses
   `dropdown-menu`; it does not grow its own.
2. **A new component is a last resort.** Before adding one, check the list
   above and the vendored set. Most "missing" components are here under a
   name you would not have guessed.
3. **A new component follows the local conventions.** Base UI, one folder
   under `src/components/`, a `data-slot` on the root, the tokens from
   `docs/tokens.md`, and `cn` for merging classes. No new primitive, no
   new package.
4. **The state is in the component, not in the caller.** A component that
   can be open, closed, empty, loading, in error or unavailable says so
   itself, in the same place every time.
5. **Colour alone is never the message.** A status carries a label, a
   symbol or a shape as well as a colour.

---

## 4. What was changed, and why

### The icon button moved to the canonical family

`src/components/tooltip-icon-button.tsx` was the only place the app's **own**
code used `src/components/ui/`. It is now on `@/components/button` and
`@/components/tooltip`, and the two components it is made of are the ones
every other button and tooltip in the app is made of.

Four things changed with it, and each was measured rather than assumed:

| | Before | After |
|---|---|---|
| The corner | `rounded-lg` — 10px | `rounded-md` — 8px |
| The edge | a 1px transparent border, which ate 1px of the icon's box on each side | none |
| The press | 0.90 — the wrapper's own `active:scale-90` | 0.97 — the button's own, the same as every other button |
| The tooltip's delay | 0ms — the older provider's default | 150ms — the app's, the same as every other tooltip |

The padding rule changed from `has-[>svg]:p-1` to `has-[svg]:p-1`,
because the button puts its children inside a wrapper of its own when it is
showing a status, and the icon is then a descendant rather than a direct
child. The button was measured afterwards: 24 × 24, 4px of padding, a 16px
icon.

The press scale deserves a note. The wrapper's `active:scale-90` was dead
the moment the button changed family — the button's own press rule is both
later in the stylesheet and more specific, so it won. A class that does
nothing is worse than no class, so it was removed rather than left to look
like it was working.

### Nothing else was changed

No component was added, none was duplicated, no package was added, and no
primitive family was touched. The ten components under `src/components/ui/`
are still there, because six vendored files import them and those files are
raw material the project keeps.

---

## 5. Adding a component

1. Check the map in §2 and the vendored set under `src/components/`. Most
   of what is missing is already here.
2. If it really is missing, put it in `src/components/<name>/<name>.tsx`,
   with an `index.ts` that re-exports it.
3. Build it on Base UI, and on the tokens in `docs/tokens.md`.
4. Give the root a `data-slot`, so a caller can reach it and a stylesheet
   can find it.
5. Handle the states in §3.4 of the plan: default, hover, focus-visible,
   pressed, selected, disabled, loading, empty, error, unavailable.
6. Add it to the map in §2, so the next person finds it instead of writing
   it again.
