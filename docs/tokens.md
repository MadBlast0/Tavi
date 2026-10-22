# The tokens

Every colour, size and shape the app is drawn with, and where it comes from.

This document describes the app **as it is**. It is the map a new surface is
built from: what a pane's background is, what a divider is painted in, what a
"needs attention" badge looks like. It is not a design document — the design
is the code, and the code is `src/index.css`.

---

## 1. Where the tokens live

One place: `src/index.css`. Nothing else defines a colour.

| Block | What it is |
|---|---|
| `@theme inline` | The names Tailwind turns into utilities. `--color-muted` becomes `bg-muted`, `text-muted`, `border-muted` |
| `:root` | The light theme's values |
| `.dark` | The dark theme's values |
| `html:not(.dark)[data-palette="…"]` | A palette's light values, if one is added |

`@theme inline` holds `var(--token)` and not the value, so a utility resolves
the token at the point of use. That is what lets one class name mean the
light theme's colour in the light theme and the dark theme's colour in the
dark one, with nothing in the component knowing which mode it is in.

**A token is defined in both themes or in neither.** The light theme is the
one that lists the set, and `src/lib/theme.test.ts` checks every other theme
against it. A token that exists in one mode and not the other is a hole: a
surface that cannot be seen in that mode.

---

## 2. The colour roles

The app paints itself with a fixed set of *roles* over the tokens. A role is
what a thing is; a token is the number behind it.

| Role | Token | What it is |
|---|---|---|
| the canvas | `--background` | the page the app is drawn on — the work area |
| text | `--foreground` | the text on the canvas |
| quiet text | `--muted-foreground` | a label, a hint, a timestamp |
| a panel | `--card` | a surface of its own: a card, a pane |
| a raised surface | `--popover` | a menu, a popover, a tooltip |
| the rail | `--sidebar` | the left rail — the same colour as a card |
| a fill | `--muted`, `--secondary`, `--accent` | a chip, a row, a hover |
| a field | `--input` | the faint tint a control takes, and the edge of a field |
| a divider | `--border` | the line between two things |
| a menu | `--menu-surface` | what a dropdown and its submenus are drawn on |
| the focus ring | `--ring` | the ring a focused control wears |
| failed | `--destructive` | something went wrong |
| needs attention | `--warning` | something is not right yet |
| in progress | `--info` | something is happening |
| done | `--success` | something finished |
| added | `--diff-added` | a line that was added |
| removed | `--diff-removed` | a line that was removed |
| a series | `--chart-1` … `--chart-5` | the steps of a chart, lightest to darkest |

Each of the four states has a **foreground** with it — `--destructive-foreground`,
`--warning-foreground`, `--info-foreground`, `--success-foreground` — which is
the text painted *on* that state when the state is solid. It is chosen
against the state, not against the canvas, which is a different question and
is checked separately.

### The values

| Token | Light | Dark |
|---|---|---|
| `--background` | `oklch(1 0 0)` | `oklch(0.145 0 0)` |
| `--foreground` | `oklch(0.145 0 0)` | `oklch(0.985 0 0)` |
| `--muted-foreground` | `oklch(0.556 0 0)` | `oklch(0.708 0 0)` |
| `--card` / `--popover` / `--sidebar` | `oklch(0.96 0 0)` | `oklch(0.205 0 0)` |
| `--muted` / `--secondary` / `--accent` | `oklch(0.94 0 0)` | `oklch(0.269 0 0)` |
| `--border` | `oklch(0.145 0 0 / 0.1)` | `oklch(1 0 0 / 0.1)` |
| `--input` | `oklch(0.145 0 0 / 0.15)` | `oklch(1 0 0 / 0.15)` |
| `--menu-surface` | `oklch(0.91 0 0)` | `oklch(0.26 0 0)` |
| `--ring` | `oklch(0.708 0 0)` | `oklch(0.556 0 0)` |
| `--destructive` | `oklch(0.577 0.245 27.325)` | `oklch(0.704 0.191 22.216)` |
| `--warning` | `oklch(0.53 0.13 70)` | `oklch(0.73 0.13 70)` |
| `--info` | `oklch(0.53 0.15 255)` | `oklch(0.73 0.12 255)` |
| `--success` | `oklch(0.205 0 0)` | `oklch(0.922 0 0)` |
| `--diff-added` | `oklch(0.50 0.15 150)` | `oklch(0.72 0.14 150)` |
| `--diff-removed` | `oklch(0.52 0.19 25)` | `oklch(0.70 0.16 25)` |
| `--chart-1` … `--chart-5` | `oklch(0.87 0 0)` … `oklch(0.269 0 0)` | the same in both modes |

The default palette is **achromatic** — every surface is a grey — with three
colours in it: the red of `--destructive`, and the amber of `--warning` and
the blue of `--info`. `--success` is a *name* and not a hue: it is the same
grey as `--primary` in each mode, which is what the app has always been.

---

## 3. The rules, and where they are checked

The contract is written out in the comment at the top of `src/index.css`, and
every rule in it is checked by `src/lib/theme.test.ts`. A rule nobody checks
is a rule that is broken by the next palette.

1. **Nothing is missing.** Every theme defines every token the light one does.
2. **A surface is separated from what it sits on.** A fill, a tint or a panel
   has to differ from the canvas by a visible step, or it is the same colour
   as the page behind it.
3. **The two themes have the same shape.** The dark theme steps *up* from the
   canvas and the light theme steps *down* from it — the same size of step,
   only the direction differs.
4. **Text is readable.** The foreground and the muted foreground both clear
   the contrast that makes them readable rather than merely present.
5. **No hairlines.** Surfaces are separated by their fill, not by an edge
   drawn around them. `--hairline` is asked for in ninety-odd places by the
   vendored components; because it is not defined, none of them draws
   anything, and the test forbids it being defined.
6. **A menu is a step further from the canvas than the rail is.** A menu
   floats over the page, and it is the one surface that can sit on the rail.
7. **A state is readable, and the text on it is too.** A state colour is used
   as text, so it clears the foreground's contrast on the canvas and on a
   panel; and the text painted on a solid state clears it against that state.
8. **The two directions of a change are two colours, not one.** A changed
   line is told apart by a marker as well as by a colour, because colour
   alone is not readable by everyone.

### The mechanism

A surface is the canvas **tinted toward the foreground**: white in the dark
theme, near-black in the light one. The tokens carry the direction, so a
component never has to know which mode it is in — and a palette only has to
supply numbers, not a second set of rules.

### Translucent tokens

`--border` and `--input` are translucent in both modes, so that a fraction of
one and the whole of it are both a tint. A chip is `bg-input/30`; the edge of
a field is `bg-input`.

The state colours and the diff colours are **not** translucent. They are
painted at a fraction by the component instead — `bg-destructive/10`, and
`text-destructive` for the same colour as text — which is the idiom the app
already uses, and it means one token serves as both a surface and a text
colour.

---

## 4. Typography

| | |
|---|---|
| The face | Geist Variable, from `@fontsource-variable/geist` |
| The variable | `--font-sans`, and `--font-heading` points at the same thing |
| The app's own | `--app-font-family` — the Appearance setting rewrites this one, not `--font-sans` |
| Code | `font-mono`, deliberately left alone by the font setting |

`--app-font-family` is a separate variable on purpose. `--font-sans` is
declared inside `@theme inline`, and `inline` makes Tailwind substitute the
*value* into each utility rather than emitting `var(--font-sans)`. So setting
`--font-sans` on the root would change nothing at all — a silently
ineffective setting. `--app-font-family` is applied unlayered to `html`,
`.font-sans` and `.font-heading`, so it takes precedence over the utilities
whatever the source order is.

**Sizes** are Tailwind's own scale, not the app's. The app uses `text-xs` for
a caption and a status, `text-sm` for a row and a control, `text-base` for
the conversation and the composer, and `text-lg` and up only for a title.

---

## 5. Radii

`--radius: 0.625rem` (10px), and the scale is derived from it:

| Token | Value | |
|---|---|---|
| `--radius-sm` | 6px | a chip, a small control |
| `--radius-md` | 8px | a control, a field |
| `--radius-lg` | 10px | a card, a panel |
| `--radius-xl` | 14px | a popover, a menu |
| `--radius-2xl` … `--radius-4xl` | 18px … 26px | the largest overlays |

One number is not a token: the **work area's** corner, `2.5rem`, is named in
`src/blocks/shell/shell.tsx` as `WORK_AREA_CORNER`, because it is a corner for
a panel a thousand pixels tall and it wants to be past the theme's scale.

The **composer's** corner is a token of its own, `--composer-radius: 1.625rem`
(26px), set in `src/blocks/prompt-input/prompt-input.tsx` and used by the
shell, the drop target and the focus ring, so all three are the same shape.

---

## 6. Spacing

The base unit is Tailwind's `--spacing: 0.25rem` — **4px** — and almost
every gap and pad in the app is a multiple of it. `p-2` is 8px, `gap-1.5`
is 6px, `px-4` is 16px, `pb-3` is 12px. A half-step is the exception the
scale exists for, and it is used where a gap is a *fraction* of a control
rather than a whole one.

The app's own spacing constants, and where each is published:

| Constant | Value | Published on | What it is |
|---|---|---|---|
| `--shell-top-bar-h` | `1.75rem` (28px) | the shell wrapper | the title bar's thickness — the bar itself, the rail's strip, and the work area's content all measure against it, so the halves cannot end up a pixel apart |
| `--sidebar-width` | 256px | the wrapper **and** the root | the rail's width. It is on the root as well because menus and popovers render in a portal at the end of the body, and they read it from there |
| `--work-area-corner` | `2.5rem` (40px) | the work area | the curve where the work area meets the rail |
| `--composer-radius` | `1.625rem` (26px) | the composer | the composer's corner |

The rail's width has a floor and a ceiling, and both are numbers in
`src/blocks/shell/shell.tsx`: **200px** minimum, **440px** maximum, **256px**
default, and a **16px** step for the arrow keys. The floor is where a row
stops being readable; the ceiling is where the rail has stopped earning the
width. The width is deliberately **not** remembered between runs.

The vendored components carry their own, and they are all multiples of
`--spacing`: `--field-gap` (×1 or ×3), `--item-gap` (×2 … ×3.5),
`--tree-gap` (×1 or ×1.5), `--tree-row-height` (×7 … ×10), `--empty-gap`
(×4 or ×6), `--command-inset` (×1.5).

---

## 7. Controls

The heights are a small set, and they are the same across the app: **24, 32,
36, 40 pixels**, with 36 the default.

| Control | Small | Default | Large |
|---|---|---|---|
| Button, Input, Select trigger | `h-8` (32px) | `h-9` (36px) | `h-10` (40px) |
| Button, extra small | `h-6` (24px) | — | — |
| Menu item | `min-h-8` (32px) | | |
| Command item | `min-h-9` (36px) | | |
| Input group | `h-8` | `h-9` | `h-10` |

A row that is a **menu item** is 32px and a row that is a **command item**
is 36px, and the difference is not an accident: a menu is a short list of
one-line actions, and a command row carries an icon, a label and a hint.

On a **coarse pointer** every interactive row grows to `min-h-11` (44px),
which is the smallest comfortable target for a finger.

### Icons

**An icon with no size of its own is 16px.** Forty-nine places say it, in
one form:

```
[&_svg:not([class*='size-'])]:size-4
```

Thirty-two of those forty-nine are the `size-4` form above; the rest are the
same guard at another size. So an icon inside a button, a menu item or a row
is 16px without anyone saying so, and a component that wants a different
size says so explicitly. The app uses `size-3` (12px) and `size-3.5` (14px)
for the small marks beside a caption, `size-4` (16px) for everything in a
control, and larger only where an icon *is* the picture.

A second form exists and is a different thing: `[&_svg]:size-*`, without
the guard, in twelve places. It overrides whatever the icon said about its
own size rather than filling in a missing one.

`size-7` (28px) in the codebase is a **control** — a button 28 pixels
across — and not an icon size. There is no 28px icon in the app; the icon
inside such a button is `size-4`.

The stroke is Lucide's own. It is never mixed with a filled glyph, with one
exception: a **filled** mark means *this is the state in force* — the
dictation button's stop square, the sort mark in the rail. An ordinary
action icon is never filled.

`docs/icons.md` has the rest: the pack, the size scale in full, and the
rules for when an icon is read aloud.

### The rail

The rail's rows are `px-2` with a `text-[0.8125rem]` label — 13px, which is
between `text-xs` and `text-sm` and is not on the scale on purpose. A group
is `px-2 py-1` and a group heading is `h-5 px-1`.

---

## 8. Focus

`--ring`, exposed to Tailwind as `--color-ring` and as `--color-focus-ring`.
A focused control wears `focus-visible:ring-3 focus-visible:ring-focus-ring`
— a three-pixel ring, not an outline, because an outline is a hairline and
hairlines are rule 5.

`forced-colors:` variants replace it with a real outline, because a ring made
of a colour is invisible when the colour is forced away.

---

## 9. The states every control has

| State | How it is shown |
|---|---|
| Default | The base appearance |
| Hover | `hover:bg-muted/50` or `hover:bg-foreground/[0.06]` — a change of fill, never a change of size |
| Focus-visible | `ring-3 ring-focus-ring` |
| Pressed | `active:scale-[0.96]`, with `motion-reduce:transition-none` beside it |
| Selected | `data-active:` or `data-selected:` — a fill of `--accent` |
| Expanded / open | `data-popup-open:` on the trigger, and the open state is coordinated on both |
| Disabled | `disabled:opacity-50`, muted but legible |
| Error | `--destructive`, with a message and not a colour alone |

---

## 10. Motion

The app's motion is **CSS transitions and a small amount of JavaScript**, not
a library. `motion` is in `package.json` but nothing imports it.

| What | Where |
|---|---|
| The easings and the durations | `src/lib/motion.ts` — `easeOut`, `easeSpring`, and `duration.press` / `.release` / `.hover` / `.enter` / `.exit` / `.morph` |
| Reduced motion | `prefersReducedMotion()` in the same file, and `motion-reduce:transition-none` on every transition |
| The text that arrives | `src/blocks/prompt-input/use-smooth-text.ts` — a character rate, not an animation |
| The shared class vocabulary | `src/components/surfaces.tsx` — `pressable`, `ghostButton`, `inkButton`, `iconSwap`, `labelSwap`, `collapsePanel` |

Three rules the existing motion follows, and any new motion follows too:

1. **A transition changes a colour or a scale, never a size.** A row that
   grows when the pointer arrives moves everything under it.
2. **Every transition has a `motion-reduce:` beside it.** The transition is
   removed, not shortened.
3. **The duration is one of six.** A new one is a decision, and the six are
   named in one file.

---

## 11. What was added for the workspace

Seven tokens, and the reasons.

| Token | Why it was needed |
|---|---|
| `--warning` | **It was already used and did not exist.** The composer's own token meter paints its ring in `bg-warning` between 80% and 95% of the limit, and the vendored badge and avatar ask for it too. Because the token was not defined, the utility did not exist, and the meter drew nothing at all in that range — a live defect, not a missing feature. It is also the "needs attention" and "blocked" state the workspace's status surfaces need |
| `--warning-foreground` | The text on a solid `--warning`, asked for by the vendored badge |
| `--info` | The "in progress" and "informational" state — a running task, an info log line. Asked for by the vendored badge, alert and calendar |
| `--info-foreground` | The text on a solid `--info` |
| `--destructive-foreground` | The text on a solid `--destructive`. The vendored destructive button and badge asked for it and it was not defined, so a red button inherited the page's text colour |
| `--diff-added` | The colour of a line that was added — the marker and the line's own tint |
| `--diff-removed` | The colour of a line that was removed |

**Nothing was added for a workspace surface or a pane separator**, because
there was nothing to add:

- A **pane** is a panel: `--card`. Its header is a fill: `--muted`. The
  workspace it sits on is the canvas: `--background`. An inactive pane is the
  canvas and an active one is `--card`, so the two are told apart by a step
  rather than by an edge.
- A **separator** is `--border`, which is the token for exactly that, and the
  vendored `react-resizable-panels` handle already paints its divider in it
  and its hover and active states in `--muted-foreground/40` and `--primary`.

**`--diff-added` and `--diff-removed` are not `--destructive` and not
`--success`.** A removed line is not a failure, and a green added line is not
the app's achromatic `--success`. The two are separate, and they are softer
than `--destructive` on purpose: a diff is a record, not an alarm.

---

## 12. Adding a token

1. Add it to **both** `:root` and `.dark`, in the same place in both.
2. Add the `--color-` mapping to `@theme inline`, so a utility exists.
3. Say what role it plays, in the table in §2 and in the comment at the top of
   `src/index.css`.
4. If it is a colour anyone reads, add the rule it obeys to
   `src/lib/theme.test.ts` — with the contrast measured by
   `src/lib/color.ts`, not by eye.
5. If a palette is ever added, it has to define the new token too. The test
   fails one that does not.
