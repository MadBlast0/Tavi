# The visual baseline

What the app looks like today, and what must not change.

This document is the **contract** for the work that comes after it. The
workspace is going to add a great deal of surface to this app, and the
easiest way to ruin it is to improve something nobody asked to be
improved. So this is a record of the approved design: the shell, the two
sides of it, the two states of the work area, and the things that are
*not* to be touched.

Every number here was measured in the running app or read out of the
source, not estimated. Where a number is a decision rather than a
measurement, it says so.

The **values** — the colours, the type scale, the radii, the spacing — are
in [`tokens.md`](tokens.md). The **components** are in
[`components.md`](components.md). The **heights and the scroll
boundaries** are in [`layout.md`](layout.md). This document is about the
shape of the thing as a whole.

---

## 1. The window

| | |
|---|---|
| The default size | 1030 × 579 |
| The floor | **600 × 338** — the window cannot be made smaller |
| The chrome | The window has **none of its own**. The caption is drawn by the app |
| The title bar | 28px, drawn *over* the work area rather than beside it |
| The rail | 256px by default, 200–440, resizable by dragging its edge |

The floor is not a suggestion. Two conversations side by side inside 600px
is 300px each, and the rail takes another 200 — so anything added to this
app has to be usable at the floor and not only on a large display.

**The rail's width is deliberately not remembered.** A width you set by
dragging is a fit for the window you were looking at; saving it would
reopen the app at a width chosen for some other screen, and on a narrower
display the work area would be left too small to read. Closing and
reopening returns it to the default.

**The rail is off-canvas.** It slides over the work area rather than
taking a permanent slice of it, and it is **closed on a first run** — what
is on screen is the conversation and the box to type in, not a list of
places to go.

---

## 2. The shell

```
┌────────────────────────────────────────────────────────────┐
│ ▣  ☰  ‹  ›            the title bar, 28px, over the work    │
├──────────┬─────────────────────────────────────────────────┤
│          │                                                 │
│  the    │            the work area                         │
│  rail   │                                                 │
│  256px  │    one of two things:                            │
│          │      · the landing screen and the composer      │
│  off-    │      · a conversation and the composer           │
│  canvas  │                                                 │
├──────────┴─────────────────────────────────────────────────┤
│  the account row                                          │
└────────────────────────────────────────────────────────────┘
```

The work area has a **rounded top-left corner** where it meets the rail,
cut out of the rail's own colour, so the work area reads as a panel
*beside* the rail rather than as two rectangles butted together. The
radius is 40px — past the theme's scale, because it is a corner for a
panel a thousand pixels tall and a token one notch tighter reads as a
mistake.

---

## 3. The rail, and how the two sides differ

The rail's **top** holds the Chat/Code switch. It belongs to the sidebar
properly — it disappears with the rail — so it sits in the rail's header,
below the title bar.

**The two sides do not have the same rail, and must not be made to.**

| | **Chat** | **Code** |
|---|---|---|
| The navigation rows | New · **Projects** · Artifacts · Scheduled · Customize | New · Artifacts · **Routines** · Scheduled · Customize |
| The list | **Chats** | **Sessions** |
| The groups in the list | by recency | **by project**, with "No folder" for a session that has none |
| The greeting | "What can I help with?" | "What are we working on?" |
| The composer | one row | two rows, with the folder and mode controls |

"Projects" under Chat and "Routines" under Code are the difference, and
they are deliberate: the two sides are meant to lead somewhere different,
and forcing them into one identical sidebar would say they lead to the
same place.

**The rows that do nothing are rendered disabled and say why on hover.**
Projects, Artifacts, Routines, Scheduled and Customize are all inert
today. They are drawn as real navigation so the shape of the rail is
decided while the rail is still half-built — and a row that looks live and
does nothing is a lie about how much of the app exists.

---

## 4. The top level

| Where | What |
|---|---|
| The title bar, left | The **sidebar toggle** (`PanelLeftIcon`), the **app menu** (`TextAlignJustifyStartIcon`), and **back** / **forward** |
| The app menu | File · Edit · View · Go · Help. Of the fifty-seven commands, **three do anything**: New chat, Close window, Exit. The rest are rendered disabled and say why |
| The rail, top | The Chat/Code switch |
| The rail, bottom | The **account row** — the avatar, the account name, and the menu that holds Settings |
| The work area | The conversation and the composer, and nothing else |

The app menu being mostly a shape is deliberate. A menu that looked
complete and did nothing would be a lie about how much of the app
exists.

---

## 5. The work area: two states

The work area shows **one of two things**, and the composer is in both.

### The landing screen

```
            What can I help with?

    ┌──────────────────────────────────────────────┐
    │  Ask anything                          ⌨  ↑ │
    └──────────────────────────────────────────────┘
                    No model selected

        [ Explain a concept ] [ Compare options ] [ Check my reasoning ]
```

| | |
|---|---|
| The greeting | 24px, weight 400, line-height 32px, centred |
| Where it sits | Just above the composer, not in the middle of the screen |
| The composer | 736px wide, 144px tall in Chat |
| The chips | 32px tall, three of them, **rotating every 60 seconds** while the composer is empty |
| The model's line | "No model selected" — a real state, said plainly, when no key is set |

The greeting asks each side its own question. "What are we working on?"
is a code question, and it would be a strange thing to read over an
empty chat.

### The working state

The greeting is replaced by the conversation, which scrolls, and the
composer stays at the bottom. Nothing else changes: the composer is in
the same place, in the same width, with the same controls.

**The transition is one animation.** When the conversation appears, the
composer moves up by the height of the greeting, and it *eases* there
rather than jumping: 480ms, on the app's standard ease-out. It is done
with the Web Animations API, and it is skipped entirely when the reader
has asked for reduced motion.

The chips fade out when the user starts typing, and the greeting does
not come back.

---

## 6. The composers

**The Chat composer** is one row: the text, and on the right the dictation
control, the model, and send.

**The Code composer** is two rows. The top row is the text. The bottom
row is the controls, and it carries two that Chat does not: **Local** /
**Choose folder** on the left, and the **Edit** mode control.

| | Chat | Code |
|---|---|---|
| Height | 144px | 192px |
| Width | 736px | 736px |
| Folder | — | Local / Choose folder |
| Mode | — | Edit |
| Both | dictation, model, send | dictation, model, send |

The composer is a card with a 26px corner, a hairline edge and a shadow
that is a *tint* in the dark theme rather than a black shadow, because a
black shadow on a near-black surface is invisible.

**The composer is always there.** It is the app's only way of saying
something, and it is in the landing state and the working state alike.

---

## 7. What must not change

This is the list. A change to anything on it needs a reason that is not
"it looked better".

1. **The two landing screens** — the Chat greeting, the Code greeting, the
   compact prompt composer, the dictation and send controls, the
   model-status line and the suggestion chips.
2. **The rail's two different shapes** — Chat has Projects and Chats, Code
   has Routines and Sessions. Do not unify them.
3. **The rail's width, its range, and the fact that it is not remembered.**
4. **The title bar**: 28px, drawn over the work area, with the sidebar
   toggle, the app menu and back/forward where they are.
5. **The work area's corner** — 40px, cut out of the rail's own colour.
6. **The account row**, and the Settings card's own navigation.
7. **The dark theme.** The app is dark by default and the light theme is
   the alternative, not the reverse.
8. **The type scale and the colour roles** — `docs/tokens.md`.
9. **The composers' shape** — 736px wide, the Code one taller than the
   Chat one, the folder and mode controls where they are.

---

## 8. How the result is checked

**There is no screenshot test, and no visual-regression workflow.** The
project has no Playwright, no Puppeteer, no Storybook, and no image
baselines — only the application's own icons. Adding one is not wanted
here, and `docs/plan/api-keys-and-parity.md` records why: a screenshot
diff fails on the *engine* and on the *display scaling* before it fails on
the design, so it reports a change that is not one.

So the check is **the running app, at a desktop viewport, compared by
eye** — and the numbers above are what "the same" means. When a change
is made to anything on the list in §7, the app is opened at 1030 × 579
and at the 600 × 338 floor, the rail is opened and closed, and both
sides are looked at.

The measurements in this document are the checkable part: a number that
has moved is a change, whether or not anyone looked.
