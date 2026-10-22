# Dockable Workspace UI/UX Plan

**File purpose:** This is the source-of-truth implementation roadmap for completing the application's frontend UI/UX before adding real AI execution or developer-tool integrations.

**Execution rule:** Follow this document from top to bottom. Give the coding AI **one numbered task at a time**. It must stop after that task, report what changed and wait for the next task. Do not ask the model to implement the entire document in one request.

**Current starting point:** The app already has a dark desktop shell, a Chat/Code switch, a left sidebar, a Chat landing screen with a centered prompt composer, and a Code landing screen with a project/folder prompt composer and Sessions list. The user supplied screenshots of both screens. Treat these as approved visual references.

**Libraries to respect:** The app uses **shadcn/ui** for UI components and **Lucide** for icons. Audit what is already installed and implemented before using or creating components. Reuse the app's existing shared components, shadcn/ui components, tokens and conventions whenever possible.

**Desired end state:** The app looks and behaves like a carefully integrated desktop AI development workspace, with a generic pane framework, realistic Chat/Code/terminal/diff/browser/files/activity interfaces, full UI states and controls, and a dockable workspace that can show up to six panes simultaneously. This phase is frontend UI/UX only.

---

## Where the work has got to

Every task in this plan, and the state it is in. The states are:

| | |
|---|---|
| ✅ done | Finished, and its own checks have passed |
| 🟡 partly | Some of it is done, and the Status block says what is not |
| ▶ next | The next one to do. It may also be partly done — the Status block says how much of it stands |
| ⬜ not started | Nothing done on it yet |

**A task is only marked done once its own checks have passed.** A task
that is half finished says so, in its Status block, rather than claiming
to be finished — and `src/lib/plan-bookkeeping.test.ts` checks the two
against each other, so the tracker cannot drift away from the work.

**The first four tasks that are marked partly are being redone.** They
were done against a reading of the plan that was wrong: the workspace
was built as a place you go rather than a place that is, and the rail
grew a row for it. §1.8 now says what the workspace is. Each of those
Status blocks says what stands, what was wrong, and what it becomes.

| Task | State | What it produces |
|---|---|---|

**Phase 0 — Audit the codebase and decide, before editing**

| 0.1 | ✅ done | The audit: the stack, the entry points, the shell, the rail, the two sides, the composers, the state, the check commands, and the raw material on disk |
| 0.2 | ✅ done | [`docs/visual-baseline.md`](../../visual-baseline.md) — the approved shape, as numbers, and the list of nine things that must not change |
| 0.3 | ✅ done | The findings, in the two documents it produced: the component map and the icon convention |
| 0.4 | ✅ done | [`docs/plan/docking.md`](docking.md) — rewritten: the engine is the app's own code, and the three candidates measured against the requirements the plan now has |

**Phase 1 — The frontend foundation**

| 1.1 | ✅ done | [`docs/tokens.md`](../../tokens.md) — the token map — and seven missing tokens, three of which the code already asked for |
| 1.2 | ✅ done | [`docs/components.md`](../../components.md) — the component map — the last of the app's own code moved off the older component family, and four tests that keep it there |
| 1.3 | ✅ done | [`docs/icons.md`](../../icons.md) — the icon convention — and `src/blocks/workspace/pane-types.ts`, the mark for each of the thirteen kinds of view |
| 1.4 | ✅ done | [`docs/layout.md`](../../layout.md) — the height chain and the scroll boundaries — and one real defect fixed: the work area could make the whole window scroll |
| 1.5 | ✅ done | [`docs/workspace-state.md`](../../workspace-state.md) — who owns each of the eight — and `src/lib/workspace-state.ts`, the model of the arrangement, the panes and the groups |

**Phase 2 — The workspace region, and the way into it**

| 2.1 | ✅ done | `src/blocks/workspace/workspace-host.tsx` — the region the layout lives in, which shows the landing screen when it is empty and the layout when it is not |
| 2.2 | 🟡 partly | The way in: a session opens the workspace, and the rail keeps its two lists |
| 2.3 | 🟡 partly | `src/blocks/workspace/workspace-empty.tsx` and `views-picker.tsx` — what an empty workspace says, and the list of what it will hold |

**Phase 3 — Reusable controls and overlay behaviour**

| 3.1 | ✅ done | One icon-button pattern, used by every pane |
| 3.2 | ✅ done | The menu and context-menu conventions |
| 3.3 | ✅ done | The popover, select and command patterns |
| 3.4 | ▶ next | One dialog and confirmation convention |
| 3.5 | ⬜ not started | The shared patterns for a pane's unhappy states |

**Phase 4 — The generic pane framework**

| 4.1 | ⬜ not started | The frame every pane is drawn in |
| 4.2 | ⬜ not started | The header: icon, title, actions, and the drag region |
| 4.3 | ⬜ not started | The overflow menu, and the close, focus, maximize and pop-out controls |
| 4.4 | ⬜ not started | The registry of pane types, and the model of an instance |
| 4.5 | ⬜ not started | The shared empty, loading, error and unavailable slots |

**Phase 5 — Every pane's content, one pane at a time**

| 5.1 | ⬜ not started | The Chat pane |
| 5.2 | ⬜ not started | The Code Session pane |
| 5.3 | ⬜ not started | The Diff Viewer: the overview and the file list |
| 5.4 | ⬜ not started | The Diff Viewer: the changed code and its controls |
| 5.5 | ⬜ not started | The Browser pane |
| 5.6 | ⬜ not started | The Application Preview pane |
| 5.7 | ⬜ not started | The Terminal pane |
| 5.8 | ⬜ not started | The File Explorer pane |
| 5.9 | ⬜ not started | The File Editor pane |
| 5.10 | ⬜ not started | The Plan pane |
| 5.11 | ⬜ not started | The Tasks pane |
| 5.12 | ⬜ not started | The Agent Activity pane |
| 5.13 | ⬜ not started | The File Preview pane |
| 5.14 | ⬜ not started | The Logs pane |
| 5.15 | ⬜ not started | One look across every pane |

**Phase 6 — Build the docking engine, in the app's own code**

| 6.1 | ⬜ not started | The layout model, and the renderer that draws it |
| 6.2 | ⬜ not started | The divider, and resizing |
| 6.3 | ⬜ not started | Dragging a pane, and the drop targets |
| 6.4 | ⬜ not started | Tab groups |
| 6.5 | ⬜ not started | Drawing the registered panes |
| 6.6 | ⬜ not started | The first pane, and composing several |

**Phase 7 — The interactions**

| 7.1 | ⬜ not started | The menu that adds a view |
| 7.2 | ⬜ not started | Closing a pane, and the branches it leaves |
| 7.3 | ⬜ not started | Splitting a pane left, right, top or bottom |
| 7.4 | ⬜ not started | Resizing, and the sizes a pane may have |
| 7.5 | ⬜ not started | Drag-and-drop docking, end to end |
| 7.6 | ⬜ not started | Which pane has focus |
| 7.7 | ⬜ not started | Maximizing a pane, and putting it back |
| 7.8 | ⬜ not started | The layout presets |
| 7.9 | ⬜ not started | Resetting, and recovering from a broken layout |
| 7.10 | ⬜ not started | The pane's own menu |
| 7.11 | ⬜ not started | Keeping the layout between runs |
| 7.12 | ⬜ not started | Two sessions, side by side |
| 7.13 | ⬜ not started | Popping a pane out, and docking it back |

**Phase 8 — States, keyboard, narrow windows, polish**

| 8.1 | ⬜ not started | Every pane's states, checked against the list |
| 8.2 | ⬜ not started | Menus, popovers and dialogs, checked |
| 8.3 | ⬜ not started | The workspace by keyboard, and read aloud |
| 8.4 | ⬜ not started | The workspace at 600 by 338 |
| 8.5 | ⬜ not started | The last look, against the approved screens |

**Phase 9 — Regression QA and the handoff**

| 9.1 | ⬜ not started | The whole thing, exercised |
| 9.2 | ⬜ not started | The note that says what is built and what is not |
---
# 1. The non-negotiable product contract

## 1.1 Preserve the existing app first

The supplied screenshots define the current approved visual direction. Keep the dark theme, typography, visual density, sidebar organization, Chat/Code switch, top window chrome, prompt composer layouts and overall alignment intact unless a small change is necessary to integrate a new workspace feature.

The Chat and Code landing screens are not to be redesigned as part of this project. In particular:

- Preserve the Chat landing greeting, compact prompt composer, microphone/send controls, model-status text and suggestion chips.
- Preserve the Code landing greeting, Local/Choose folder controls, code prompt area, Edit control, model-status text, send control and code-specific suggestion chips.
- Preserve the fact that the Chat and Code sidebars have different navigation items and lists; do not force them into one identical sidebar.
- Preserve existing sidebar navigation such as New, Projects or Sessions, Artifacts, Routines, Scheduled, Customize and the account/footer area as currently implemented. Do not remove or rename working items as part of the workspace work.
- Do not make the initial Code screen become a blank docking canvas. Keep the current landing state available. The docking workspace should appear through the appropriate existing session/open-workspace flow or an explicit UI action.
- Do not redesign the native window controls or imitate operating-system chrome inside the web content area.

Before each task, inspect the current code and compare it against these rules. If a UI change is not needed for the task, leave it alone.

## 1.2 What this phase builds

Build the full **frontend presentation and local UI interactions** for:

- App shell integration and workspace host.
- Shared interaction conventions for buttons, icon buttons, menus, dropdowns, popovers, tooltips, dialogs, confirmation dialogs, toasts, inputs, badges, tabs, scroll regions and empty/error/loading states.
- A generic, reusable pane component and registry.
- Pane headers, action menus, title/selection/focus/close controls and layout controls.
- Chat and Code Session pane presentations.
- Diff Viewer, Browser, Preview, Terminal, File Explorer, File Editor, Plan, Tasks, Agent Activity, File Preview and Logs presentations.
- A configurable nested layout that displays up to six panes at once.
- Add, close, split, resize, drag-and-drop dock, focus, maximize/restore, layout presets and reset/restore interactions.
- Accessible interaction states, keyboard basics, appropriate scroll behavior and responsive desktop behavior.
- Mock/sample content that demonstrates all the interfaces without claiming real work has happened.

## 1.3 What stays out of scope

Do not implement during this UI/UX phase:

- Real AI API requests, model streaming, real conversation orchestration or agent execution.
- Real shell/terminal execution or spawning processes.
- Actual filesystem reads/writes, project discovery or file watcher support.
- Real Git status, diff calculation, commits, branches or worktrees.
- Real browser automation, network navigation or local development server startup.
- Actual background jobs, subagents, task scheduling or build/test execution.
- Authentication changes, databases, cloud syncing or account-wide persistence.
- Full-featured IDE editing, installing a heavy code-editor engine, or adding syntax parsers unless one already exists and is specifically needed for the current UI.
- Decorative animations as a requirement. Functional transitions are acceptable but animation polish can be done later.

Local state changes are allowed when they demonstrate a real UI interaction: selecting a file in sample data, expanding a folder, changing a preview mode, toggling a filter, marking a mock checklist item, typing in a local demo composer, or rearranging panes. They must not imply that actual files, commands or AI operations were executed.

## 1.4 Terminology

- **App shell:** existing application window layout, navigation and sidebar.
- **Section:** top-level Chat or Code area.
- **Project:** project/repository/folder context shown in the app.
- **Session:** an independent AI conversation or coding task with its own future history and execution lifecycle.
- **Pane type:** a kind of view, such as Terminal, Diff, Browser or File Editor.
- **Pane instance:** one occurrence of a pane type, with its own unique ID and presentation state.
- **Workspace:** the main content region that arranges pane instances.
- **Docking/layout engine:** the system that splits, resizes, moves and restores pane instances.
- **Layout preset:** a predefined arrangement of pane instances.
- **Overlay:** UI shown above other content, such as a dropdown, popover, tooltip or dialog.

A session and a pane are different things. A session can be displayed in a Chat/Code Session pane. A Terminal, Diff or File Viewer pane may be associated with a project or session context later, but the layout system must not implement agent execution.

## 1.5 Six-pane product rule

The app's selected limit is **six simultaneously visible, docked pane instances in the primary workspace**. This is our product requirement, not an assumed limitation of Claude or any docking library.

- The number of available projects, sessions and registered pane types is not limited to six.
- At six visible pane instances, adding a seventh must be prevented with clear feedback.
- Rearranging the existing six panes must remain possible.
- The standard example layout is three visible panes in the top row and three in the bottom row.
- Do not hard-code six fixed cells. The same general layout system must also support one pane, two side-by-side panes, two stacked panes, uneven splits, three columns, nested splits and other valid arrangements.
- For this initial version, prefer direct visible panes rather than hidden tab stacks. Do not let a tabbed group hide panes that the UI says are simultaneously visible. **Tabbed pane groups are requested by the product owner and are in scope.** See §1.7.

---

## 1.7 Tabbed groups, and what counts towards the cap

**Tabbed groups are in scope.** The product owner has asked for them
explicitly, which is the condition §1.5 set for them. A group is a set of
panes that share one place in the layout, one of which is showing, and the
rest of which are reached by its tab strip.

A group changes what the cap counts, so the counting is written down:

- **The cap counts pane instances, not places.** A group holding three tabs
  is three panes, not one. Six visible pane instances means six, whether
  they are in six groups or in two.
- **Every pane in the layout counts**, including the ones a tab is hiding.
  A group is a way of arranging panes, not a way of having more of them.
- **A pane in its own window does not count** against the main window's six,
  because it is not in the main window. It still has an id, and it is still
  a pane instance.
- **Rearranging is always allowed.** The cap is on how many panes there
  are, never on moving them.

A group with a single tab is drawn as a plain pane, because a tab strip
with one tab on it is a decoration and not a control.

---

## 1.8 The shape of the workspace, and how a person gets into it

This section is the one that was got wrong the first time, so it is written
down as a rule rather than left to be inferred.

**The workspace is the main content region.** It is the area of the window
beside the rail — the area the prompt composer sits in. It is not a
destination, it is not a mode, and it is not something the rail navigates
to. **There is no "Workspace" row in the rail.** The rail lists sessions and
projects, and nothing else. Adding a docking entry to it is what §4.1
forbids: *"New docking controls must not crowd the existing shell."*

**The workspace is always there.** What it shows is decided by what is in
it, not by a flag:

| What is in the workspace | What the region shows |
|---|---|
| No session and no panes | The existing landing screen — the greeting and the composer, exactly as it is today |
| A session, or at least one pane | The layout: the panes, split and arranged |

There is no third state, and no "open" or "closed" flag. A workspace that
has to be opened and closed is a mode, and a mode needs a way in, and the
way in is what went wrong.

**A session is how a person gets in.** Opening a session — from the rail's
list, or by starting one — puts that session's conversation in the work
area. This is the existing flow in the app and it is the right one: the
rail already lists sessions, and the app already knows how to open one.

**A pane is how a person adds a tool view.** The workspace toolbar carries
an **Add view** action, and the choice adds a pane beside what is already
there. In Claude Code Desktop the same thing happens from the session's own
title bar, and the panes that can be opened from there are Terminal,
Changes (the diff), Browser and Files.

**The chat is a pane, not a privileged centrepiece.** In Claude Code Desktop
the chat sits in the layout beside the diff and the terminal, and moving it
does not end the conversation. Here the composer is the chat pane's
composer: it is at the bottom of the pane, it travels with the pane, and the
conversation it holds belongs to the session, not to the pane.

**The rail's own list is the only navigation.** Sessions and projects, and
the two sides keep their two different lists. Nothing about the workspace
adds a row to either.

---

# 2. Global instructions for every coding-AI task

Copy these rules alongside each task prompt or give the AI this file as project context.

1. Read the relevant section of this plan and implement **only** the requested task ID.
2. Inspect the relevant existing files before editing. Preserve the existing framework, build system, route structure, shell, sidebar, composers, styling and behavior wherever possible.
3. Treat the supplied Chat and Code screenshots/current screens as approved visual references. Do not reinterpret them as rough inspiration for a redesign.
4. Use the existing **shadcn/ui implementation and shared components first**. This project may use a customized shadcn component set; do not assume the newest documentation API matches the code in this repo.
5. Use the existing **Lucide** package for icons. Do not add a second icon library, use emoji as UI icons, or create ad-hoc Unicode icon substitutes.
6. Before using any component, check whether the project already has it. Do not import a component that does not exist. If a needed component is missing, use the existing component conventions and add only the minimum required reusable component, or report the missing dependency/component if the change should be handled separately.
7. Do not run a shadcn CLI command, add a package or change underlying primitives without checking the project's existing setup and explaining why it is necessary.
8. Match existing design tokens. Do not hard-code a new color/spacing system for each pane.
9. Do not replace current working behavior with mock behavior. Mock only new UI features that do not have backend integrations yet.
10. Do not implement later tasks early. Do not make unrelated refactors, rename large sets of files, or reformat the whole codebase.
11. Do not integrate real APIs, execute commands, read/write project files or connect external services during this phase.
12. Do not show fake “success” for an actual operation that did not occur. Local demo interactions must be limited to local sample state and must be clear about unavailable real functionality.
13. Keep the application runnable after each task. Run the existing relevant build, lint, type-check and/or tests. Do not invent checks that are not configured.
14. Check the result visually at the size of the supplied screenshots or an equivalent desktop viewport when a browser/dev preview is available.
15. When the requirement is unclear, use the smallest implementation consistent with this plan. Do not invent new product features.
16. After the task, report: task ID, changed files, UI/behavior delivered, checks run and results, remaining limitations, and the next task ID. **Stop and wait**; do not start the next task automatically.

### Correction prompt if the AI goes off-scope

> Stop adding features. Compare your changes with the requested task and its acceptance criteria. Preserve the approved Chat/Code screens and existing working behavior. Revert or correct unrelated changes, run the relevant existing checks, and report any remaining issue. Do not start a different task.

---

# 3. Design system and interaction contract

## 3.1 Use the existing design system, not a new one

The screenshots show a restrained dark desktop UI with compact controls, subdued borders, low-contrast surfaces and a small hierarchy of text sizes. Keep that character. Exact values must be discovered from the current code rather than guessed.

Audit and reuse existing tokens for:

- Main window and workspace backgrounds.
- Sidebar background and separators.
- Pane surfaces and elevated/overlay surfaces.
- Primary, muted, disabled, hover, selected and destructive foreground colors.
- Border and divider colors.
- Font family, font sizes, line heights and font weights.
- Spacing scale, control heights, icon-button sizes, border radii and focus indicators.
- Menus, dialogs, popovers, tooltips and toast surfaces.
- Diff additions/removals, status badges, task status and log severity colors.

Create tokens only where genuinely missing. Avoid redundant aliases or a parallel theme that drifts from the app.

## 3.2 Component reuse policy: shadcn/ui

Treat shadcn/ui as the project's preferred source of composable UI primitives, while remembering that its components are code-owned and may have been customized locally. Follow the APIs and conventions already present in the repository.

Audit availability and prefer reuse for the following categories where needed:

| UI need | Preferred existing component/pattern, if present |
|---|---|
| Standard actions | Button |
| Icon-only controls | Existing IconButton wrapper or Button with icon-only variant |
| Short control explanation | Tooltip |
| Action lists | DropdownMenu |
| Right-click actions | ContextMenu |
| Small anchored settings/filter panel | Popover |
| Modal content or rename form | Dialog |
| Destructive/reset confirmation | AlertDialog or existing confirmation dialog |
| Searchable Views picker | Command/Combobox inside a popover or dialog |
| Single selection | Select or RadioGroup |
| Multi-line text | Textarea |
| Text/URL/search entry | Input |
| Pane section switcher | Tabs only where tabbing is intentional |
| Nested expandable lists | Collapsible |
| Scroll-contained content | ScrollArea or the app's existing scroll pattern |
| Separators | Separator |
| Status | Badge or existing status pill |
| Loading | Skeleton or existing loader |
| Progress | Progress |
| Temporary feedback | Existing toast/Sonner system |
| Splitters | Existing resizable primitive or selected docking library |
| Sidebar behavior | Existing sidebar implementation; inspect before changing |

Do not add all these components just because they are listed. Only use what a task needs. If two installed shadcn primitive families (for example, Radix-based and Base UI-based variants) exist, keep using the project's current family; do not mix implementations casually.

Do not use a dropdown menu for content-heavy forms, a tooltip for important instructions, or a dialog for every small choice. Use the correct interaction for the amount and importance of content.

## 3.3 Lucide icon rules

- Use named icons from the project's existing Lucide package (for React projects, this is commonly `lucide-react`; verify the actual dependency before importing).
- Use semantically appropriate icons: conversation for Chat, code for Code, panel/layout for workspace, terminal for Terminal, files/folder for file views, globe/browser for Preview, diff/columns for Diff, list/check for Tasks, clipboard/list for Plan, activity/radio indicators for Activity, and file/text/log icons for viewers.
- Keep repeated actions consistent across the app. The same action should not randomly change icon between the toolbar, pane menu and context menu.
- Follow existing icon sizing. If no standard exists, define a small consistent scale suitable for the current compact interface; do not set each icon size independently.
- Keep Lucide's existing stroke style consistent with the app; do not randomly mix filled and outline icon styles.
- Icons should align optically with adjacent text and controls.
- Decorative icons should be hidden from assistive technology when the text already names the action. Icon-only interactive controls need an accessible label, and usually a tooltip on hover/focus.
- Use a tooltip to explain ambiguous icon-only controls such as maximize, dock, refresh or overflow. Do not show redundant tooltips on visible text buttons.
- Do not use emoji as icons. Do not draw custom inline SVG icons for actions already covered by Lucide.
- Do not use color alone to indicate success, failure, active pane, additions/deletions or task status; pair color with a label, symbol or other shape/state.

## 3.4 Shared interactive states

Every interactive component must deliberately handle the states relevant to it:

- **Default:** clear base appearance.
- **Hover:** low-key surface or border change; no layout shift.
- **Focus-visible:** visible keyboard focus ring or outline consistent with the app.
- **Pressed/active:** clear feedback when activated.
- **Selected:** persistent selection for current navigation item, file, pane or option.
- **Expanded/open:** trigger and popover/menu state remain visually coordinated.
- **Disabled:** muted but legible; unavailable actions must not look enabled.
- **Loading:** use only when there is a real local UI transition to show; use skeletons for content-shaped loading where appropriate.
- **Empty:** explain what is missing and show one appropriate next action if there is one.
- **Error:** describe the issue in user-facing language and offer a safe retry/dismiss action only when that action is meaningful.
- **Unavailable/not connected:** clearly differentiate from an error; explain that real integration is not available in this UI prototype.
- **Overflow/truncation:** preserve controls and use a tooltip or accessible title when important text is truncated.
- **High-density/small pane:** hide nonessential text labels or move secondary actions into overflow menus before controls overlap.

Do not implement states that do not make sense for a component, but do not leave relevant states undefined.

## 3.5 Dropdowns, popovers, tooltips, dialogs and menus

Use shared components and consistent conventions:

- **Dropdown menu:** short action list or selection menu. Use grouped items, separators and destructive styling where appropriate. Close on selection unless the chosen component is intended to remain open for multiple selections.
- **Popover:** compact anchored content such as filters, layout options or a simple pane-type selector. Avoid large nested popovers.
- **Dialog:** an operation requiring a focused form or more content, such as renaming a layout or editing a title. Provide title, optional description, clear primary/secondary buttons and sensible focus behavior.
- **Alert dialog:** confirm a destructive or disruptive action such as resetting a custom layout if unsaved layout adjustments could be lost. Do not over-confirm routine pane focus or close actions if the content remains preserved elsewhere.
- **Tooltip:** brief hint for an ambiguous icon-only control. It must not be the sole home for critical instructions.
- **Context menu:** right-click menu for a pane, file or tree item. It should expose sensible actions also available elsewhere; essential actions must not be discoverable only through right-click.
- **Toast:** brief confirmation for a UI-only action that genuinely completed, such as a local layout preset being applied. Do not display “file saved,” “command executed,” or “AI task completed” for mocked behavior.

All overlays should:

- Open from their intended trigger and close using Escape where appropriate.
- Close on outside interaction where the component's normal convention supports it.
- Avoid being clipped by the pane's scroll container.
- Use correct z-index layering and avoid disappearing behind other panes.
- Keep focus behavior consistent with the underlying shadcn primitive.
- Position intelligently near the trigger and avoid extending off-screen where the library supports collision handling.
- Never create multiple competing overlays for one action.

## 3.6 Inputs and forms

- Preserve the existing Chat and Code composer designs.
- Give every new input a visible or accessible label. Placeholder-only labeling is not sufficient for controls that need a lasting label.
- Make focus, disabled and invalid states consistent.
- Prevent clicks on buttons inside a form from accidentally submitting the form unless intended.
- Disable submit actions when the required input is empty, where that is the expected UX.
- When a mock form submits, perform only a local presentation-state update or visibly remain in prototype mode; do not imply persistence or backend success.
- Support long text without pushing the pane beyond its boundaries.

## 3.7 Scroll and overflow rules

- The desktop window should not gain unnecessary whole-page scrolling just because a pane has long content.
- Each main scrollable region should own its own scrolling: conversation list/message body, diff content, file tree, editor, terminal output, logs and long menu/dialog content as appropriate.
- Pane headers and toolbars should remain visible while pane content scrolls, unless the UI specifically requires otherwise.
- Avoid multiple nested scrollbars where one scroll region would suffice.
- Preserve horizontal code/log content without expanding the pane or shifting neighbors. Use horizontal scrolling, wrapping where semantically safe, or responsive truncation.
- Keep scrollbar styling consistent with the current app and do not hide scrollbars in a way that makes content undiscoverable.

## 3.8 Motion

Animation work is not required for this plan. Prioritize correct state transitions, stable geometry and responsive pointer interaction. Do not add animation packages. If simple transitions already exist, preserve them. Respect reduced-motion preferences for any transition added incidentally.

---

# 4. Full UI inventory and expected behavior

This section describes what the plan eventually needs to cover. It is the reference for deciding whether a pane or control is visually complete.

## 4.1 Existing app shell

Keep the current main navigation and sidebar structure. Ensure that the Chat/Code selector, section links, sidebar lists, active row, account/footer controls and any existing settings/navigation popovers continue to work as they currently do. New docking controls must not crowd the existing shell.

## 4.2 Workspace toolbar

Once the workspace has something in it, provide a compact toolbar suitable
for the current design. It sits at the top of the work area, below the
window's own caption strip, and it is present only while the workspace has
a session or a pane. Include only actions needed by the current UI:

- Workspace/session identity: the project and the session, or the folder
  and the conversation's name.
- **Views/Add View** menu, grouped the way the pane types are grouped.
- Layout preset selector.
- A layout reset action, placed in a menu or clearly differentiated if it could discard custom arrangement.
- Optional visible pane-count indicator only if it is helpful; avoid adding decorative status clutter.
- A clear state for the six-pane cap when the user attempts to add more.

The toolbar should not introduce unrelated settings or duplicate all the actions already available in every pane.

**Where this sits is a deliberate difference from the reference.** Claude Code
Desktop is an undecorated window whose own title strip doubles as the
session's toolbar, so the Add View menu and the pane buttons live up there.
This app's window is also undecorated, but its top strip is the window's
caption: it carries the sidebar toggle, the application menu and the
operating system's own window controls. Putting docking actions in there
would mix the app's navigation with the window's furniture. So the
workspace's own actions get their own slim strip, and the pane's own
actions stay in the pane's header.

## 4.3 Generic pane frame

Every pane uses a shared frame with:

- A stable header height and padding.
- Pane-type icon and title.
- Optional secondary context such as selected filename, session name or project label.
- A dedicated drag handle/drag region that does not prevent users from clicking title controls or selecting text in content.
- A compact action area: at minimum an overflow menu and close control when appropriate; include maximize/restore as a primary header control only if it fits the current visual hierarchy.
- Active/focused/inactive styling.
- Bordered content surface and independent overflow handling.
- Consistent behavior when the pane is narrow or short.
- A content area that receives pane-specific loading/empty/error/sample states.

The shared frame must not assume that every pane has the same actions. For example, a Terminal may have a clear-output control, Browser may have refresh, and Diff may have a split/unified view toggle. Pane-specific actions belong in a consistent toolbar slot or menu.

### 4.3.1 What a pane looks like

The reference is Claude Code Desktop's pane layout, and the frame follows it
closely:

- **Panes are flat.** A pane has no card around it, no rounded corners and
  no shadow. It is a region of the window, and it is separated from its
  neighbour by a single hairline. The window's own background is the
  background, and the pane's content sits on it.
- **The header is a strip, not a card.** A fixed height, the pane's icon and
  title on the left, and on the right the pane's actions: a button that
  pops the pane out into its own window, a chevron that opens the pane's
  overflow menu, and a close control. The three are in that order, and
  they are the same three in every pane.
- **The content scrolls inside the pane.** The pane's own content area
  scrolls; the window does not scroll, and neither does the region the
  layout lives in.
- **A session pane carries its own composer.** The composer is at the
  bottom of the pane, not below the layout. Two session panes side by side
  have two composers, and each one belongs to its own session.
- **The focused pane is the one that is lit.** The unfocused panes are
  dimmed rather than greyed out, and the divider next to the focused pane
  is the brighter of the two.

## 4.4 Pane action menu

Use a consistent menu structure where the actions apply:

- Rename pane/title, only where useful.
- Split left/right/top/bottom.
- Focus/maximize or restore.
- Move/rearrange only if there is a clear keyboard/pointer alternative to dragging.
- Duplicate only for pane types that can meaningfully have another instance; otherwise omit or disable with explanation.
- Close pane.

Do not show a generic menu filled with actions that do nothing. Actions not included in this phase should be disabled, explicitly described as unavailable, or omitted. Destructive styling is for real destructive UI state changes, not routine focus changes.

## 4.5 Standard empty/loading/error presentation

Use reusable patterns but tailor text to context:

- **Empty:** small relevant Lucide icon, concise title, concise explanation and at most one primary next action.
- **Loading:** use a skeleton shaped like the expected content when loading is meaningful; do not show a fake network spinner when nothing is loading.
- **Error:** concise issue title, helpful detail and a retry/dismiss control only if the UI can actually retry/dismiss that local state.
- **Unavailable:** explain that the real tool is not connected or not implemented in this phase. Avoid technical stack traces in the user-facing body.
- **Sample/demo content:** when necessary, label it subtly as example/demo content. Do not clutter every pane with disclaimers if the sample nature is already clear from the surrounding UI.

---

# 5. Detailed pane specifications

These are UI contracts for each pane type. Implement the visual structure and local UI behavior only. Use sample data rather than real integrations.

## 5.1 Chat pane

### Main layout

- Conversation header or session title, using a compact layout rather than repeating the full app shell.
- Scrollable message timeline with visually distinct user and assistant messages.
- Message content should support paragraphs, lists, inline code, fenced code, links and lightweight tables to the extent the current renderer already supports them. Do not introduce a new markdown dependency unless necessary and approved.
- Optional small timestamps or message metadata, kept visually quiet.
- A composer pinned to the bottom of the pane, with text entry and send control.
- Attachment/plus or microphone controls only if consistent with currently supported app UI; controls that have no frontend behavior should be disabled or explicitly mock-only.

### Message and activity states

- Empty conversation: helpful prompt and composer.
- Populated conversation: sample user and assistant messages.
- Long conversation: message list scrolls without moving the composer.
- Assistant thinking/typing state: optional mock status row; do not claim real model execution.
- Tool activity: compact event row with icon and status; clearly sample only.
- Failed/unavailable response: dedicated error row with retry control only if the retry is a local demo action.
- Long code block: horizontal overflow contained within the message.

### Local interactions

- Typing must work.
- A local demo send may append a clearly mock response or a local user message. It must never call the model API.
- Input text must not be lost when the pane is resized or focus changes.
- New/clear conversation is a mock UI action only and must not delete a real chat.

## 5.2 Code Session pane

### Main layout

- Compact project/session identity area.
- Conversation/activity timeline using consistent message formatting.
- Tool activity rows suitable for future command, file-change or task events.
- A task/plan summary slot only where it improves understanding; avoid duplicating the full Plan or Tasks pane.
- Composer anchored at the bottom.
- Status area with mock states such as Idle, Working, Needs attention, Completed or Failed. Use these only as simulated UI states.

### Required states

- New/empty session.
- Sample active session.
- Waiting/working illustration using mock activity.
- Completed sample session.
- Failed/unavailable sample session.
- Long timeline.
- Composer disabled state for a simulated locked/busy state, if demonstrated.

### Local interactions

- Focus composer, type, send a mock message and show local feedback.
- Expand/collapse mock activity details if included.
- Do not execute tools or pretend a coding agent changed a project.

## 5.3 Diff Viewer pane

A good diff UI includes both a change overview and readable changed content. Avoid presenting it as merely colored code lines.

### Header and toolbar

- Pane title plus selected file name when available.
- Change summary showing sample counts of added, modified and deleted files or lines.
- Unified/split diff display toggle if it can be represented cleanly in the available width.
- Previous/next changed-file or changed-hunk navigation controls where appropriate.
- Optional whitespace/wrapping display control only if the UI supports a clear local demonstration.
- Review/mark-reviewed or comment actions may exist as mock UI, but must not imply real repository updates.

### File list and content

- Scrollable changed-file list with file icon, concise path/name, change marker and added/deleted counts where useful.
- Selected file styling.
- Changed code area with line numbers and distinct old/new line presentation.
- Clearly differentiated added, removed and context lines. Do not rely on red/green alone; use `+`/`−` markers or other non-color cues.
- Long paths truncate gracefully and expose the full name on hover/focus where possible.
- Long lines stay within the diff pane; do not resize neighboring panes.
- Large diffs should scroll within the content region rather than the entire app.

### Required states

- No changes available.
- Changes summary but no selected file.
- Selected file with modifications.
- Added file.
- Deleted file.
- Large/long diff.
- Loading skeleton for a mock loading demonstration.
- Error/unavailable state.
- Narrow-pane state with sensible toolbar overflow.

### Local interactions

- Select a sample file to display its sample diff.
- Toggle unified/split presentation if both are implemented.
- Change sample selection using previous/next controls.
- Any review/comment action must stay local and visibly mock-only; no Git or disk operation.

## 5.4 Browser pane

The Browser pane provides the controls and status surface for a future embedded browser. It must not actually navigate the network in this UI-only phase.

### Header and toolbar

- Back, forward and reload/refresh controls.
- URL/address field with a representative local preview address or example URL.
- Optional open/external-view control only if its unavailable behavior is clear; do not launch a system browser in this phase.
- Optional viewport/zoom control only if it is needed for the app's intended design and can be presented compactly.
- Page/connection status label, kept subtle.

### Content states

- No preview configured: empty state explaining that a preview target is not available.
- Mock preview loaded: show a sample local app page or preview shell, labelled appropriately if ambiguity is possible.
- Loading: use a restrained progress or skeleton state.
- Navigation unavailable: show a friendly message, not a browser/network stack trace.
- Page error state.
- Narrow pane: toolbar controls move into overflow or compact form without overlap.

### Local interactions

- Address field accepts text locally.
- Back/forward/reload may change between predefined mock states only.
- Do not perform network requests or start a local server.

## 5.5 Application Preview pane

Browser chrome and application rendering are related but not identical. Keep the Preview type available as a focused, clean viewport for the app being developed.

### Main layout

- Compact preview toolbar, separate from the page surface.
- A sample viewport contained within the pane.
- Optional desktop/tablet/mobile viewport selector if easy to implement with local mock sizes.
- Optional zoom/fit control if supported by the UI.
- Subtle preview status and reload action.

### Required states

- No application is running/not connected.
- Sample preview displayed.
- Loading preview.
- Preview unavailable or failed.
- Narrow-pane/low-height viewport.

The no-preview state must be the default if no mock page is intentionally selected. Do not show a successful local app preview that appears to be a real running server without indicating that it is demo content.

## 5.6 Terminal pane

### Header and toolbar

- Terminal title and optional terminal instance number.
- Working-directory/context label using sample text only.
- Optional shell/profile label if it fits the design.
- Clear-output action; this may really clear the local sample output.
- Optional copy-output action; copy only displayed sample text if implemented.
- Optional new-terminal control, disabled or mock-only because real process creation is out of scope.

### Terminal body

- Monospace text with preserved whitespace and line breaks.
- Example prompt/command/output rows.
- Scrollable output region.
- Command input at the bottom only if it is clearly labelled as a simulation.
- Handle long output and long lines without resizing adjacent panes.
- Distinguish command prompt, command text and output visually.

### Required states

- Empty terminal.
- Sample output.
- Long output.
- Cleared output.
- Disconnected/unavailable terminal.
- Simulated command input.
- Narrow pane.

### Safety and local interactions

- **Never execute a real command.**
- If the demo input accepts text, it may append a clearly simulated output such as “Demo mode: command execution is not connected.”
- Clear-output and copy-output can operate on the local display only.
- Do not imply a command ran successfully.

## 5.7 File Explorer pane

### Main layout

- Header and optional sample project root.
- Optional search/filter input.
- Expandable folder/file tree with indentation, consistent Lucide folder/file icons and selected-row styling.
- Expand/collapse affordances distinct from selecting a file.
- Scroll-contained tree for large sample hierarchies.
- Context menu for sensible file/folder options.

### Context actions

Possible UI actions include Open, Rename, New File, New Folder, Copy Path, Reveal or Delete, but only include actions represented as safe local demo interactions. Hide or disable actions that would imply real filesystem mutations. Destructive styling and confirmation are appropriate for a local mock Delete interaction if included.

### Required states

- No project selected.
- Project root empty.
- Expanded tree.
- Collapsed folders.
- Selected file.
- Search with matches.
- Search with no matches.
- Long file/folder names.
- Unavailable project/files state.
- Narrow pane.

### Local interactions

- Expand/collapse folders.
- Select files and, where available, open the matching sample File Editor/Preview pane.
- Search/filter sample tree contents.
- Right-click context menus must not be the only route to important actions.
- Do not read or write the actual filesystem.

## 5.8 File Editor pane

### Main layout

- File name/tab label with dirty/unsaved marker where appropriate.
- Optional breadcrumb/path line.
- Small toolbar for view-only actions that fit the app's use case.
- Source area with line numbers and sample syntax colors.
- Monospace text, consistent line heights and stable line-number alignment.
- Independent scrolling for the editor content.
- Tab-style file navigation only if multiple open files are part of the component; do not make every pane a tab group automatically.

### Required states

- No file selected.
- Sample file open.
- Long source file.
- Read-only state.
- Locally edited/dirty sample state.
- Unsaved-changes visual state.
- File unavailable/error state.
- Narrow pane.

### Local interactions and scope

- Use an editor already present in the project if one exists and is appropriate.
- If there is no editor, do not install a heavyweight editor engine just for the mock UI. Use a lightweight code-like sample view or simple local text-editing surface, clearly limited to a presentation prototype.
- Local edits must remain in UI state and must never write to disk.
- If closing a locally dirty demo editor, show a confirmation only if the UI truly has a local draft state that would otherwise be lost.

## 5.9 Plan pane

### Main layout

- Plan title and optional project/session context.
- Clear distinction between plan sections, items and sub-items.
- Checkbox/check state for illustrative tasks where useful.
- Status tags such as Not started, In progress and Done for sample items.
- Progress summary only when it reflects the displayed mock checklist accurately.
- Expand/collapse sections if the plan is hierarchical.

### Required states

- No plan.
- Plan outline with several items.
- Expanded/collapsed sections.
- Locally toggled checklist state.
- Long plan scroll.
- Unavailable/error state.

### Local interactions

- Checkboxes and expansion may update local sample state.
- Do not claim that an AI agent created, persisted or completed the plan.

## 5.10 Tasks pane

### Main layout

- Task title and sample counts/progress.
- Task list with concise names, status indicators and optional priority/owner metadata only if relevant.
- Status filter or view selector where useful.
- Expandable details for a selected task if this interaction adds value.
- Visually distinguish waiting, active, completed, blocked and failed sample states.

### Required states

- No tasks.
- Populated task list.
- Filtered results.
- No filter matches.
- All tasks completed.
- Blocked/failed task.
- Loading/unavailable state.

### Local interactions

- Filtering and expanding task details can be functional locally.
- Task status toggles must be presented as sample UI changes, not actual background task execution.

## 5.11 Agent Activity pane

### Main layout

- Activity timeline/list with event icon, concise description, timestamp or relative time where appropriate, and a visible state.
- Sample agent/task rows with status text.
- Optional collapsible details for a sample event.
- Avoid noisy animation, flashing indicators or dense internal implementation messages.

### Required states

- No activity.
- Active-looking sample activity.
- Completed sample activity.
- Failed or needs-attention sample activity.
- Long activity history.
- Unavailable state.

### Local interactions

- Expanding and filtering sample activity is acceptable.
- Do not start agents or imply that code is running.

## 5.12 File Preview pane

### Main layout

- File name and type indicator.
- A content area appropriate for the mock type: plain text, Markdown preview, JSON-like text, image placeholder or document/PDF-style placeholder.
- Basic zoom/fit or copy actions only if they make sense for the sample representation.
- Keep content scroll-contained.

### Required states

- No file selected.
- Sample text/Markdown/JSON.
- Image preview placeholder.
- Document/PDF placeholder.
- Unsupported file type.
- File unavailable/error.
- Very long content.

Do not load arbitrary local files or real PDFs/images from disk. This pane is a UI presentation only.

## 5.13 Logs pane

### Main layout

- Log heading/context.
- Search/filter field.
- Severity filter using a dropdown or compact selection control.
- Timestamped rows with severity, source and message.
- Optional pause/follow-latest toggle and clear-visible-output action, applied only to local sample logs.
- Monospace content for the log message where appropriate.

### Required states

- Empty logs.
- Sample mixed-severity logs.
- Search matches.
- Search has no matches.
- Severity filtered.
- Paused/follow-latest states if included.
- Large log volume.
- Unavailable/error state.

Do not show real application internals, secrets or actual process output as if these mock logs came from an active run.

## 5.14 Pane-type registry and future extensions

The UI should support a registry of pane types so a new view can be added without rewriting the docking engine. Additional future views could include test results, a Git history, documentation or API responses, but do not build unrelated types in this phase unless explicitly requested.

Each pane type needs:

- Stable type key.
- Default title.
- Lucide icon reference.
- Short description for the Views menu.
- Renderer/component.
- Supported state categories.
- Available header actions and menu actions.
- Minimum useful size or compact behavior where applicable.
- Whether duplicate instances make sense.

Each pane instance needs:

- Unique instance ID.
- Pane type key.
- Optional title override.
- Optional project/session association as metadata only.
- Pane-local UI state kept separate from layout geometry.

---

# 6. Implementation roadmap — execute in this exact order

Each task below is intentionally scoped for a low-cost coding model. Implement one task, validate it, stop, review, and only then give the model the next task.

# Phase 0 — Audit the existing codebase and make decisions before editing

## Task 0.1 — Read-only codebase audit

**Prompt to the coding AI:**

> Read the project structure and inspect the existing application without modifying files. Identify the framework, entry points, routes, shell, sidebar, Chat/Code switching, prompt composers, styling system, state management, available test/build commands and how the app is run. Identify the existing shared components and any current pane/split/layout utilities. Return a concise implementation map with relevant file paths, what must be preserved, and the smallest safe approach to add the dockable workspace. Do not install dependencies or edit files.

**Acceptance criteria:** The report accurately identifies the current stack and relevant files. No files are modified.

**Status: done.**

The audit found the stack, the entry points, the shell, the rail, the two
sides, the composers, the state, the check commands, and the raw material
already on disk. Each finding landed in the document that owns it:

| The finding | Where it is |
|---|---|
| The shape of the app, the entry points, the two chat paths | [`docs/architecture.md`](../../architecture.md) |
| The height chain and the scroll boundaries | [`docs/layout.md`](../../layout.md) |
| Every component, and which one to use for which job | [`docs/components.md`](../../components.md) |
| The icons, and the pack they come from | [`docs/icons.md`](../../icons.md) |
| The check commands | [`README.md`](../../README.md) — *Checking* |
| The vendored `react-resizable-panels` primitive, on disk and imported by nothing | [`docs/components.md`](../../components.md) and [`docs/plan/docking.md`](docking.md) |

The one thing that was not obvious and had to be checked: **there is one
primitive family, not two.** The project has Base UI through shadcn's
`base-nova` style, and no Radix and no Tabler anywhere in it.

## Task 0.2 — Record the approved visual baseline

**Prompt to the coding AI:**

> Using the existing Chat and Code screens and the supplied screenshots as the visual reference, document the current shell layout, sidebar differences, top-level navigation, prompt composers, spacing/color/typography conventions and the current transition between landing and working states. Do not redesign or change anything. Identify any existing screenshot/visual-test workflow; do not add a new test dependency. Report which screen elements must not change in later tasks.

**Acceptance criteria:** The visual contract is recorded in the project notes or task report. No UI is changed.

**Status: done.**

| | |
|---|---|
| The contract | [`docs/visual-baseline.md`](../../visual-baseline.md) — the window, the shell, the two different rails, the two states of the work area, the two composers, and the list of nine things that must not change |
| The check | `src/lib/visual-baseline.test.ts` — eight checks, each broken on purpose to watch it fail |
| What was found | There is **no** screenshot test in the project, and `docs/plan/api-keys-and-parity.md` records why: a screenshot diff fails on the engine and the display scaling before it fails on the design. So the check is the running app, compared by eye, against numbers that cannot quietly drift |

Nothing was redesigned and no UI was changed. Every number in the document was
measured in the running app or read out of the source.

**Measured at the floor.** The window cannot be made smaller than 600 × 338,
and that is where the app has to work. Driven through the real interface at
that size — the rail opened as a sheet, Code selected, Workspace pressed:

| | |
|---|---|
| The page | 338 tall and 338 tall — **it does not scroll** |
| The work area | 600 × 338, 28px of top padding for the title bar |
| The empty state | "Nothing open yet", its title between 157 and 179 |
| The action | "Add view", its bottom at 258 and its right at 350 |

## Task 0.3 — Audit shadcn/ui and Lucide usage

**Prompt to the coding AI:**

> Inspect the project's existing shadcn/ui components, local wrappers/shared UI components and Lucide dependency. List which components are already available for Button, tooltip, dropdown menu, context menu, popover, dialog/alert dialog, input/textarea, select/combobox, command, tabs, collapsible, scroll area, separator, badge, skeleton, progress, toast and resizable/split layout. Confirm the actual Lucide import package and existing icon sizing conventions. Do not install or add anything. Note any missing items that may be needed later.

**Acceptance criteria:** No assumed imports; all findings reflect the repository. No files changed.

**Status: done.**

The findings are in the two documents this work produced:
[`docs/components.md`](../../components.md) for the components, and
[`docs/icons.md`](../../icons.md) for the icons.

The audit found **one** primitive family in the project — Base UI, through
shadcn's `base-nova` style — and no Radix and no Tabler. It found that
`lucide-react` is the only icon pack, that 265 of 266 icon identifiers
carry the `Icon` suffix, that the app's own code uses **both** names for
six glyphs, and that three places let an icon be the only message for a
state. Those are written down rather than changed, because changing an
icon is a change to every screen at once.

## Task 0.4 — Choose the docking strategy

**Prompt to the coding AI:**

> Evaluate the existing app stack and determine whether a current layout dependency, an additional docking library, or a small custom nested-split implementation is most appropriate. Compare the actual requirements: up to six simultaneously visible panes, nested horizontal/vertical splits, left/right/top/bottom drag-and-drop docking, resizable dividers, per-pane headers under our control, no hidden tab stack in the initial design, the ability to save/restore layout metadata, theme compatibility and maintainability. Consider libraries that provide a grid without mandatory tabs as well as full IDE docking libraries. Do not install anything or write implementation code. Recommend one approach, name any tradeoffs, and identify the smallest proof-of-fit experiment needed before committing.

**Acceptance criteria:** A clear documented choice and rationale exist before the layout engine is built. No dependency is installed.

**Status: done.**

| | |
|---|---|
| The decision | [`docs/plan/docking.md`](docking.md) — rewritten. The engine is the app's own code |
| The evidence | The three candidates, measured against the requirements the plan now has |
| What changed | The library is out. The engine is written in `src/`, in the app's own vocabulary |

The first decision was the wrong one, and it was wrong because it was made
against the wrong requirements. It read *"a small custom nested-split
implementation"* as a candidate and rejected it, because writing the
geometry, the drag, the keyboard resize, the minimum sizes, the
persistence and the accessibility of the separators by hand is a lot of
work — and it was, at the time, more work than it bought.

Three things changed the answer:

1. **The requirements grew.** Tabbed groups, pop-out windows, docking a
   popped-out pane back, and two sessions side by side are now in scope.
   None of them is reachable through a resizable-panel library, which
   resizes and does not move panes.
2. **The reference is the shape of the thing, not just its behaviour.**
   Claude Code Desktop's own layout is a flat arrangement of panes with
   hairline separators, each with its own header and its own controls.
   Reproducing that faithfully means owning the geometry, the header and
   the drop indicators — a second set of surfaces and a second set of
   theming hooks is the opposite of that.
3. **The app already owns the model.** `src/lib/workspace-state.ts` holds
   the tree of splits, the rules about what may be in it, and the refusals.
   The first decision was right that the arrangement belongs to the app.
   It was wrong that the *geometry* had to come from a package.

**What the decision does not settle:** the exact pixel geometry of the
divider, the minimum sizes, and the motion of a drop. Those are the
engine's own work, in Tasks 6.2 and 6.3, and they are decided by looking
at the app, not by a document.
## Task 1.1 — Map existing visual tokens

**Prompt to the coding AI:**

> Map the existing theme tokens for backgrounds, foregrounds, muted text, borders, focus rings, selected/hover/disabled states, typography, radii, spacing and controls. Reuse existing tokens. Add only tokens demonstrably missing for workspace surfaces, pane separators, status states and diff-line presentation. Do not redesign the app, change the overall theme or re-style the current landing screens. Report any new token and why it was needed.

**Acceptance criteria:** Tokens remain centralized and the existing UI looks materially unchanged.

**Status: done.**

| | |
|---|---|
| The map | [`docs/tokens.md`](../../tokens.md) — the roles, the values in both modes, the rules and where they are checked, typography, radii, spacing, controls, focus, the states, motion, and how to add a token |
| The tokens | `src/index.css` — seven added, in both themes, with their `--color-` mappings |
| The rules | `src/lib/theme.test.ts` — five new tests, eighteen in all |
| The proof | The built CSS was diffed before and after: both themes gained 7 tokens, lost 0, and **no existing value changed**. The only newly painted things are ones that drew nothing before |

Three of the seven tokens were **already used in the code and had no token
behind them**, so the utilities did not exist: `--warning` (the composer's
own token ring drew nothing between 80% and 95% of the limit — a live
defect), `--info` and `--destructive-foreground`. The other four are
`--warning-foreground`, `--info-foreground`, `--diff-added` and
`--diff-removed`.

Nothing was added for a workspace surface or a pane separator: a pane is
`--card`, a header is `--muted`, the workspace is `--background`, and a
separator is `--border`.

## Task 1.2 — Establish safe shared-component reuse

**Prompt to the coding AI:**

> Based on the component audit, create a short internal map of which existing shared/shadcn components should be used for common interactions. Where a needed component is absent, implement only the minimum reusable component or wrapper that follows the existing local shadcn conventions. Do not add packages, duplicate existing components or switch the underlying primitive family. Do not build the pane UI yet.

**Acceptance criteria:** No duplicate design system; no imports refer to nonexistent files; no unrelated changes.

**Status: done.**

| | |
|---|---|
| The map | [`docs/components.md`](../../components.md) — the one family everything is built on, the map of which component to use for which job, the app's own shared components, and the rules |
| The duplicate | `src/components/tooltip-icon-button.tsx` was the only place the app's **own** code used the older generation under `src/components/ui/`. It is now on the canonical family, so everything the app runs is on one family |
| The guard | `src/lib/components.test.ts` — four tests: every import points at a file that is there, the code reachable from the entry point is on one component family, there is one primitive family, and every component folder has a barrel |

Nothing was added, no package was added, and no primitive family was
touched. The ten components under `src/components/ui/` are still on disk,
because six vendored files import them and the project keeps those as raw
material.

The four deltas the move brought — a 10px corner becoming 8px, a 1px
transparent border that is gone, a press that is now the app's 0.97 rather
than the wrapper's 0.90, and a tooltip that waits 150ms rather than
appearing at once — are set out in `docs/components.md` §4. Each was
measured in the browser rather than assumed.

## Task 1.3 — Establish Lucide icon conventions

**Prompt to the coding AI:**

> Define or document the app's icon conventions using its existing Lucide package: standard icon sizes, stroke conventions, decorative versus accessible icon usage, icon-only button labels/tooltips and a small semantic mapping for the future workspace/pane types. Reuse current conventions if they already exist. Do not introduce an icon package or change icons throughout the existing app without a clear reason.

**Acceptance criteria:** The plan for icons is consistent, and the existing shell remains unchanged.

**Status: done.**

| | |
|---|---|
| The convention | [`docs/icons.md`](../../icons.md) — one pack, the size scale, the stroke, when an icon is read aloud, and the rule that an icon is never the only message |
| The map | `src/blocks/workspace/pane-types.ts` — thirteen kinds of view, each with a key, a name, a mark and a line for the Views menu |
| The check | `src/lib/icons.test.ts` — one pack, named imports, the `Icon` suffix, no deprecated alias in the app's own code, and every mark present in the installed package |

The shell is unchanged. Where the app is not consistent today it is written
down rather than fixed, because there is no clear reason to change an icon.

The map lives in the workspace's own folder rather than in `src/lib/`,
because that is where a map of things-with-icons belongs:
`src/blocks/shell/settings-sections.ts` holds the same shape for the
settings card, beside the component that shows it.

## Task 1.4 — Confirm app sizing and scroll boundaries

**Prompt to the coding AI:**

> Inspect the app's current window/container sizing and scroll behavior. Identify the main content container that can host a workspace beside the sidebar and define which elements should remain fixed versus scroll. Make only the minimum structural correction necessary to support a full-height workspace without adding page-level scrolling. Do not build split panes yet.

**Acceptance criteria:** The existing landing screens still fit correctly; there is a clear parent container for the future workspace; no unnecessary global scrollbars appear.

**Status: done.**

| | |
|---|---|
| The map | [`docs/layout.md`](../../layout.md) — the window's floor, the height chain, what scrolls, and the container a workspace will live in |
| The check | `src/lib/layout.test.ts` — six checks, each broken on purpose to watch it fail |
| What was found | A **real defect**, not zero change. The work area took its height from the shell's `min-h-svh`, which is a floor and not a height, so a pane taller than the window made the window taller |

Measured, before and after: a 3000-pixel pane in the work area gave a
3000-pixel document, and now gives the window's own height with the
overflow clipped. The landing screens do not move — the rendered pixels at
1030 × 579 and at the 600 × 338 floor, with the rail open and closed, are
the same.

## Task 1.5 — Define UI state boundaries

**Prompt to the coding AI:**

> Map the existing state, decide who owns each of the pieces the workspace
> will need, and write the ownership down. The app section and the active
> thread belong to the app, not to the workspace. The pane instances, the
> active pane, the arrangement, the pane-local state and the overlay belong
> to the workspace. The arrangement is a tree of panes, splits and groups,
> and it is serializable: a plain object with no functions in it, so it can
> be written down and read back. Write focused tests for the rules on it.

**Acceptance criteria:** State ownership is clear and does not duplicate the
current state; the arrangement's rules are tested; the model survives a
round trip through JSON.

**Status: done.**

| | |
|---|---|
| The model | `src/lib/workspace-state.ts` — the tree of panes, splits and groups; the rules on it; the operations on it |
| The map | [`docs/workspace-state.md`](../../workspace-state.md) — who owns each of the eight |
| The check | `src/lib/workspace-state.test.ts` — twenty-two rules, each broken on purpose to watch it fail |

**What changed.** The `open` flag is gone, and with it `openWorkspace()`
and `closeWorkspace()`. The arrangement has **three** kinds of node now —
a pane, a split, and a **group** of panes sharing one place — and a group
of one collapses into the pane it holds, because a tab strip with one tab
on it is a decoration and not a control. The store grew the one operation
the engine needs: `dockPane()`, which takes a pane out of where it was
and puts it against another one, on an edge or into its group. A move
never adds a pane, so the cap is never in the way of rearranging.

**What did not change, and is the point of the whole file.** A pane refers
to a session and a project by **id**, never by a copy. A pane's own state
is one bag per instance and never one per type. And removing a pane takes
away the arrangement, the focus and the overlay that referred to it, and
**nothing else** — closing a window onto a conversation is not closing the
conversation.
## Task 2.1 — Make the workspace the region, not a mode

**Prompt to the coding AI:**

> Make the workspace host the main content region of the work area, and
> make it permanent. It must fill the available space beside the existing
> sidebar, inherit the current visual design, and hold whatever the
> workspace shows. The landing screen becomes a child of the region rather
> than a sibling that takes turns with it. The region must not have an
> "open" or a "closed" state, and nothing in the rail may navigate to it.
> Do not build the pane layout, alter landing-screen content or add
> backend logic.

**Acceptance criteria:** The region is always in the tree and fills the
work area; the landing screen still fits and still scrolls inside itself;
the document does not scroll; the rail has no row for the workspace.

**Status: done.**

| | |
|---|---|
| The region | `src/blocks/workspace/workspace-host.tsx` — the main content region, always there |
| The check | `src/lib/workspace-host.test.ts` — four rules, each broken on purpose to watch it fail |

**What changed.** The host is not a sibling that takes turns with the
landing surface any more. It is the region, and the landing surface is a
child of it, because the region is what they share. The host has no flag of
its own and no "closed" state: what it shows is decided by what is in the
workspace, and the surface steps aside when the workspace holds a pane.

Measured in the running app, with the rail open: the region is 1168 × 1086
and the surface inside it is 1168 × 1058. The 28 pixels between them are
the title bar's height. The document does not scroll — the scroll height
and the window's height are both 1086 — and the landing screen's pixels
are the same as they were.

**The landing screens are untouched.** The greeting, the composer, the
suggestions and the two sides' own lists are exactly as they were, and
**the rail has no row in it for the workspace**: it lists New, Projects,
Artifacts, Scheduled, Customize and Archived, and a session list, exactly
as it did before this work started.
## Task 2.2 — Define the UI transition into Code workspace

**Prompt to the coding AI:**

> Wire the new workspace host into the existing Code UI flow with the smallest coherent frontend state transition. Keep the current Code landing composer and sessions list intact. Provide a clear path for opening the workspace, using the existing flow if one exists or a new explicit UI-only action if not. Use sample session context where necessary. Do not send prompts to an AI or connect project folders to real disk operations.

**Acceptance criteria:** Users can see the current Code landing state and separately reach the workspace prototype. The transition is reversible and does not reset unrelated state.

**Status: partly — the way in was wrong, and the way in is being redone.**

| | |
|---|---|
| What was built | A **Workspace** row in the Code rail, which opened the workspace and closed it again |
| What is right now | The row is gone. The rail lists sessions and projects, and nothing else |
| What is being redone | The transition itself: a session is what opens the workspace |

**What was wrong.** The rail row was the wrong product entry point, and
the plan said so twice. §1.1: *"Do not remove or rename working items as
part of the workspace work."* §4.1: *"New docking controls must not crowd
the existing shell."* The reference has no such row either: Claude Code
Desktop's rail lists sessions, and the panes are opened from the session's
own title bar, in the work area.

The row was also the reason the workspace was a mode. A row that opens and
closes something is a row that needs a flag to know which it is doing, and
the flag is what made the region replace the landing screen instead of
holding it.

**What the way in is.** The app already has the right flow and it was
there all along: the rail lists sessions, and opening one puts that
session's conversation in the work area. That flow is what opens the
workspace. A pane is added from the workspace's own toolbar.

So the transition is not *"the rail opens the workspace"*. It is *"opening
a session puts a session pane in the region"*, and the region shows the
layout from then on.

**The test that went with the row went with it.** The test that
asserted the Code rail *has* a Workspace row, and that pressing it opens
and closes the workspace, was a test of the mistake. It was removed with
the row, and its replacement says the opposite: the rail has no workspace
row, and the session is the way in.
## Task 2.3 — Add workspace-level empty state

**Prompt to the coding AI:**

> Design the empty state shown inside the workspace only when the workspace is explicitly open and contains no pane instances. Use a concise message, a relevant Lucide icon and a Views/Add View action. Keep it consistent with the current dark design and avoid duplicating the original Code landing hero. The empty-state action must open the Views picker. Do not add pane rendering or docking yet.

**Acceptance criteria:** The landing screen remains distinct from an empty workspace; the workspace empty state has a clear next action.

**Status: partly — the state and the picker are right, the picker cannot choose yet.**

| | |
|---|---|
| What stands | `src/blocks/workspace/workspace-empty.tsx` — the mark, "Nothing open yet", one line, one action. And `src/blocks/workspace/views-picker.tsx` — the thirteen kinds of view in the plan's four groups, each with its mark, its name and what it is for |
| What is not done | Every entry in the picker is disabled. Choosing one does not add a pane |

**What is right.** The picker reads the list of kinds of view from
`src/blocks/workspace/pane-types.ts` rather than keeping a copy, so a type
added there cannot be missing from the picker. The groups are the plan's
own: Conversations, Development, Files, Activity. The state is the app's
own empty component at its small size, and it is quiet on purpose.

**What is not done.** The entries are disabled with the reason on them —
*"Not built yet — there is no pane to put it in"* — which is the app's own
idiom, and honest. But an action that cannot be taken is not a next
action, and §2.3 asks for a clear one.

The picker becomes live in Task 7.1, when the Views menu is built and the
choice adds a pane. Until then the empty state says what it can and the
picker says what it cannot.

**One thing to settle.** The empty state and the landing screen are both
"nothing here yet", and they are different things: the landing screen asks
a question and offers a box to type in; the empty workspace says the
region is empty and offers a way to fill it. The corrected host decides
which one is on screen, and this task's state is what the region shows
when the workspace is open and holds nothing. That is settled in Task 2.1.
## Task 3.1 — Create/standardize icon-only button behavior

**Prompt to the coding AI:**

> Audit and reuse the existing icon-only button pattern, or implement a minimal reusable wrapper if necessary. Ensure consistent hit area, hover/pressed/disabled/focus-visible states, accessible label, Lucide icon alignment and optional tooltip support. Keep the current app's compact styling. Do not replace existing buttons globally.

**Acceptance criteria:** New icon controls can use one consistent pattern; keyboard users can identify and focus them.



**Status: done.**

| | |
|---|---|
| The pattern | `src/components/tooltip-icon-button.tsx` — the app's shared icon button, already the standard |
| The check | `src/lib/icon-button.test.ts` — seven rules, each broken on purpose to watch it fail |
| The map | [`docs/icons.md`](../../icons.md) §7, [`docs/components.md`](../../components.md) |

**What this task found.** The pattern already existed: a `Button
variant="ghost" size="icon"` inside a tooltip trigger, with the tooltip's
text as the visually hidden name, so the visible name and the accessible
name are the same string and cannot disagree. The `tooltip` prop is
required, so a caller cannot have the button without the name. The
component's whole purpose is to make that impossible.

What was missing was the audit and the check. `docs/icons.md` §7 already
says a new pane uses it, and `docs/components.md` already says to use
it and not a bare `Button` with `size="icon"`. The raw `size="icon"`
usages that remain are inside shadcn primitives — dialog close, sheet
close, sidebar trigger and the like — which are self-contained and are not
app-level controls. Task 3.1 says not to replace existing buttons
globally, so they stay.

`src/lib/icon-button.test.ts` is the check: the shared button exists, it
is built on the app's button with the ghost variant and the icon size, its
tooltip is required, it names itself for assistive technology, it shows a
tooltip, it sizes its padding from the presence of an icon, and it
defaults the tooltip to the bottom.
## Task 3.2 — Standardize tooltip, dropdown and context-menu usage

**Prompt to the coding AI:**

> Verify the existing shadcn tooltip, dropdown-menu and context-menu components. Document/reuse the project's conventions for trigger behavior, alignment, dismissal, focus, labels, separators and destructive actions. Add only the missing minimal shared wrapper/pattern. Do not create a custom menu implementation if an existing shadcn component already covers it.

**Acceptance criteria:** The workspace can use standard menus without inconsistent behavior or invented component APIs.



**Status: done.**

| | |
|---|---|
| The primitives | `@/components/tooltip`, `@/components/dropdown-menu`, `@/components/context-menu` — all on Base UI |
| The check | `src/lib/menu.test.ts` — six rules, each broken on purpose to watch it fail |
| The map | [`docs/components.md`](../../components.md) §2 and §3 |

**What this task found.** All three primitives are already on the canonical
family — Base UI — and all three carry the same destructive variant, so a
menu that offers a destructive action looks the same whether it is opened
from a trigger or from a right click. The pane's own menu uses the shared
dropdown with `align="end"`, so it does not cover the pane's title, and
its close action is destructive. The tooltip opens on focus as well as on
hover, so a keyboard user gets the name.

Nothing was added. The primitives cover the job, and a custom menu would
have been a second one. The conventions are written down in
`docs/components.md` §3, and the pane's menu is the proof that they are
followed.
## Task 3.3 — Standardize popovers and selection pickers

**Prompt to the coding AI:**

> Verify existing Popover, Select/Combobox and Command components. Establish one suitable pattern for an anchored pane-type picker and one for compact filters. Ensure options have readable labels, selected state, keyboard interaction and an empty/no-results state when search is used. Do not build the actual Views menu yet.

**Acceptance criteria:** The primitives are ready for reuse and follow the local shadcn implementation.



**Status: done.**

| | |
|---|---|
| The primitives | `@/components/popover`, `@/components/select`, `@/components/combobox`, `@/components/command` — all on Base UI |
| The check | `src/lib/popover-picker.test.ts` — six rules, each broken on purpose to watch it fail |
| The map | [`docs/components.md`](../../components.md) §2 |

**What this task found.** All four primitives are already on the canonical
family — Base UI — and the command palette is built on Base UI's dialog
with cmdk for the search. The Views picker, which is the anchored pane-type
picker, is a popover: a small anchored panel, the right primitive for a
compact list. Its entries are disabled with a reason rather than pretending
they work, and the picker keeps its entries in the plan's four groups.

Nothing was added. The primitives cover the job, and the Views picker is
the proof that the anchored pattern is followed. The Views menu itself is
Task 7.1.
## Task 3.4 — Standardize dialogs and confirmations

**Prompt to the coding AI:**

> Reuse the existing Dialog and AlertDialog patterns for focused forms and consequential UI actions. Ensure title/description, clear primary and secondary actions, proper focus handling and safe dismissal. Do not create a dialog or confirmation for every minor action. Do not add any destructive application behavior.

**Acceptance criteria:** A common dialog convention exists for future rename/reset/unsaved-demo-state interactions.

## Task 3.5 — Standardize status, empty, loading, error and toast patterns

**Prompt to the coding AI:**

> Review existing Badge/status, Empty, Skeleton, Progress and toast components. Reuse them or establish minimal shared variants for status labels, empty-state content, content-shaped loading placeholders, simple progress and short local-action feedback. Keep errors distinct from unavailable integrations. Do not display success for mocked operations that did not actually happen.

**Acceptance criteria:** Future panes have consistent patterns for non-happy-path states without a new design system.

# Phase 4 — Build the generic pane framework

## Task 4.1 — Create the Pane container

**Prompt to the coding AI:**

> Create a reusable Pane frame. It should accept a unique pane-instance ID, type key, display title, Lucide icon, optional secondary context, active/focused state, content renderer and available actions. Include a stable header and independently scrollable content area. The Pane is responsible for its own framing and local presentation; it must not own the overall layout tree or future AI execution. Reuse the established shared components and tokens.

**Acceptance criteria:** The Pane can wrap arbitrary content, fits within parent bounds and has consistent header/content geometry.

## Task 4.2 — Implement the pane header

**Prompt to the coding AI:**

> Implement the pane header using the shared Pane frame. Include the icon, title, optional context label and compact action area. Provide visible active/inactive/focused styling and a dedicated drag handle/region that does not interfere with clicking header buttons, selecting text or interacting with controls. Do not implement actual drag-and-drop yet.

**Acceptance criteria:** Header elements remain usable at full and narrow pane widths; drag initiation is not triggered by every header click.

## Task 4.3 — Add pane actions and overflow menu

**Prompt to the coding AI:**

> Add the common pane overflow menu and close/focus/maximize action slots. Show only actions supported for that pane instance and workspace state. Split actions can be wired to simple callbacks, but if layout support is not ready, mark them as unavailable rather than pretending they work. Include accessible labels/tooltips for icon-only buttons. Do not implement the layout engine in this task.

**Acceptance criteria:** Pane controls look consistent; actions do not overlap the title or accidentally start a drag.

## Task 4.4 — Create the pane registry and instance model

**Prompt to the coding AI:**

> Define a central registry of pane types with a stable type key, default title, Lucide icon, short description, renderer, relevant states, available actions and whether duplicates are allowed. Define pane instances separately with unique IDs, optional title override and local state. Register: Chat, Code Session, Diff Viewer, Browser, Application Preview, Terminal, File Explorer, File Editor, Plan, Tasks, Agent Activity, File Preview and Logs. Use lightweight components or simple temporary renderers until each pane is implemented. Do not hard-code pane types inside the layout engine.

**Acceptance criteria:** Duplicate instances get unique IDs; unknown types fail gracefully; adding a pane type does not require rewriting the registry consumer.

## Task 4.5 — Create reusable pane empty/loading/error state slots

**Prompt to the coding AI:**

> Add shared presentation helpers/slots for empty, loading, error and unavailable content inside a pane. Keep pane headers visible while the content state changes. Use the established shadcn/Lucide patterns, concise text and a single meaningful action at most. Do not force the same copy or icon on every pane; allow each type to supply appropriate text.

**Acceptance criteria:** Every pane can present its own state without duplicating markup or breaking the Pane frame.

# Phase 5 — Implement every pane's visual content, one pane at a time

Implement the tasks in order. Do not integrate real services. Each task should make the pane look complete and its local interactions demonstrable.

## Task 5.1 — Chat pane

**Prompt to the coding AI:**

> Implement the Chat pane to the specification in Section 5.1. Include sample user/assistant messages, readable markdown/code presentation using existing capabilities, a scrollable timeline and a composer anchored to the bottom. Include empty, populated, long-conversation, mock-thinking/activity and error/unavailable states as appropriate. Local demo send behavior is allowed but must not call an AI API or imply a real model response. Preserve the existing landing Chat UI.

**Acceptance criteria:** Composer stays visible; long content scrolls within the message area; states are complete; no backend calls.

## Task 5.2 — Code Session pane

**Prompt to the coding AI:**

> Implement the Code Session pane to the specification in Section 5.2. Include project/session context, a sample conversation/activity timeline, mock tool activity rows, a visible sample execution status and a bottom composer. Add empty, working-looking, completed sample, failed/unavailable and long-history states. Every execution state must remain clearly simulated; do not run agents or tools.

**Acceptance criteria:** It feels like a coding session, not a copy of the generic Chat pane; there is no actual execution.

## Task 5.3 — Diff Viewer: overview and file navigation

**Prompt to the coding AI:**

> Implement the Diff Viewer's header, change summary, changed-file list, file selection, status/count labels and narrow-layout behavior as specified in Section 5.3. Use consistent Lucide file icons and non-color cues. Use sample data only. Do not calculate Git changes or access the project filesystem. The diff-content area may use a temporary sample renderer until the next task.

**Acceptance criteria:** The file/change overview is readable and scroll-contained; selecting a sample file updates selected state.

## Task 5.4 — Diff Viewer: changed code surface and controls

**Prompt to the coding AI:**

> Complete the Diff Viewer with sample line-numbered code, added/removed/context lines, unified/split view if practical, previous/next change navigation, and review controls as specified in Section 5.3. Include no-changes, no-selection, added/deleted file, long-diff, loading and unavailable/error states. Review controls may update local sample UI state only. Do not write files or update Git.

**Acceptance criteria:** Code lines remain legible at varied pane sizes; color is not the only cue; controls operate on sample state only.

## Task 5.5 — Browser pane

**Prompt to the coding AI:**

> Implement the Browser pane to the specification in Section 5.4. Include back/forward/reload controls, an editable address field, a contained page surface and no-preview/loading/unavailable/error/sample-loaded states. Controls may switch between predefined local mock views only. Do not make network requests, navigate arbitrary URLs or launch an external browser.

**Acceptance criteria:** Toolbar controls have correct enabled/disabled states; page content never expands the workspace; no network integration.

## Task 5.6 — Application Preview pane

**Prompt to the coding AI:**

> Implement the focused Application Preview pane as specified in Section 5.5. Include a compact preview toolbar, a no-app-running state, a clearly sample/demo preview state, loading and failed/unavailable states, and optional locally simulated viewport-size selection if it fits the app. Do not start a server or imply that a real local app is running.

**Acceptance criteria:** The preview surface is contained and visually clear; the default unavailable state cannot be mistaken for a live app.

## Task 5.7 — Terminal pane

**Prompt to the coding AI:**

> Implement the Terminal pane to the specification in Section 5.6. Include a sample working-directory label, monospace prompt/output, contained scrolling, clear-output and optional copy-output actions, plus empty/disconnected/long-output states. If a command input is shown, it must be explicitly simulated and must never execute a real command. Do not spawn processes, connect to a shell or claim a command succeeded.

**Acceptance criteria:** Terminal typography/whitespace are correct; local controls work on displayed sample output only.

## Task 5.8 — File Explorer pane

**Prompt to the coding AI:**

> Implement the File Explorer pane to the specification in Section 5.7. Include a sample folder/file tree, indentation, expand/collapse controls, selected-file state, optional local search/filter and appropriate context menus. Include empty project, populated tree, no-search-match, long-name and unavailable states. Selecting a sample file may update local selection or open its sample editor view. Do not access or mutate the real filesystem.

**Acceptance criteria:** Tree interactions work locally and remain usable in narrow panes; there are no real file operations.

## Task 5.9 — File Editor pane

**Prompt to the coding AI:**

> Implement the File Editor pane to the specification in Section 5.8. Reuse an existing editor if the project already includes one and it is appropriate. Otherwise, build a lightweight sample source view/editor surface without adding a heavyweight editor dependency. Include file title, optional path, line numbers, readable code, read-only/dirty states, long-file scrolling and unavailable state. Any edits remain local and are never written to disk.

**Acceptance criteria:** Code presentation is legible and contained; local dirty state is honest; no disk writes or unnecessary editor packages.

## Task 5.10 — Plan pane

**Prompt to the coding AI:**

> Implement the Plan pane to the specification in Section 5.9. Include a sample plan hierarchy, expandable sections, task checkboxes/status badges and a progress summary that accurately reflects the displayed mock items. Include no-plan, populated, long-plan and unavailable states. Interactions may update local demo state only; do not invoke an agent.

**Acceptance criteria:** Plan hierarchy is understandable and state/progress remains internally consistent.

## Task 5.11 — Tasks pane

**Prompt to the coding AI:**

> Implement the Tasks pane to the specification in Section 5.10. Include sample task rows, statuses, optional priority/context, a compact filter and task detail expansion if useful. Include empty, populated, filtered, no-match, all-complete and failed/blocked states. Filtering and expansion may work locally; do not run actual jobs.

**Acceptance criteria:** Statuses are distinguishable and filter behavior works on sample data.

## Task 5.12 — Agent Activity pane

**Prompt to the coding AI:**

> Implement the Agent Activity pane to the specification in Section 5.11. Include a sample timeline of events, concise descriptions, icons, timestamps/statuses and optional expandable details. Cover empty, active-looking, completed, failed/needs-attention and long-history states. Keep sample execution obviously simulated; do not start agents or background tasks.

**Acceptance criteria:** Activity is scannable and quiet, and does not appear to report real executions.

## Task 5.13 — File Preview pane

**Prompt to the coding AI:**

> Implement the File Preview pane to the specification in Section 5.12. Provide sample representations for text/Markdown/JSON and image/document/PDF-style content, plus empty, unsupported-type, unavailable/error and long-content states. Reuse current renderers and components where possible. Do not load real local files or add a PDF/image rendering library for the mockup.

**Acceptance criteria:** Each sample type has an intentional presentation; the pane does not claim to open a real file.

## Task 5.14 — Logs pane

**Prompt to the coding AI:**

> Implement the Logs pane to the specification in Section 5.13. Include a sample timestamped log list, severity markers, source/message styling, local search, severity filtering, and optional follow-latest/pause and clear-visible-output controls. Cover empty, populated, no-match, filtered, long-log and unavailable states. Do not display real process logs or secrets.

**Acceptance criteria:** Long messages and large sample lists remain readable; search/filter state behaves correctly on mock data.

## Task 5.15 — Pane consistency review

**Prompt to the coding AI:**

> Review all implemented pane types against Sections 3–5. Fix only cross-pane inconsistencies: header heights/padding, title truncation, icon alignment, toolbar patterns, content scrolling, empty/loading/error states, menu placement, narrow-pane overflow and focus styling. Do not redesign any pane, add new product features or connect backend services.

**Acceptance criteria:** Pane types feel like one app; existing landing pages remain unchanged; shared styles are reused.

# Phase 6 — Build the docking engine, in the app's own code

**The engine is ours.** Task 0.4 chose a third-party docking library; that
decision has been reopened and reversed, and this phase is the engine
written in `src/`. It is written in the app's own vocabulary — the app's
tokens, the app's focus treatment, the app's motion — and the layout model
belongs to the app, not to a package. See `docs/plan/docking.md`.

Nothing in this phase is a demo. Every task here produces the real engine,
in the real workspace, and the checks are the app's own.

## Task 6.1 — The layout model, and the renderer that draws it

**Prompt to the coding AI:**

> Write the layout model and the component that draws it. The model is a
> tree: a leaf names a pane instance, a split names an orientation, a ratio
> and two children, and a group names a set of panes that share one place
> and one of which is showing. It lives in `src/lib/workspace-state.ts`
> beside the rest of the workspace's state, and it is serializable — a
> plain object with no functions in it, so it can be written down and read
> back. The renderer walks the tree and draws it: a split is a flex row or
> column with a divider between its children, and a group is a tab strip
> above the pane that is showing.
>
> A pane that is alone in the tree is drawn as a plain pane, with no strip
> and no divider. The geometry is the app's own: the panes are flat, they
> share the window's background, and they are separated by a single
> hairline. Reuse the app's tokens and its focus treatment; do not
> introduce a second design system and do not add a package.

**Acceptance criteria:** A tree of one pane, two side by side, two stacked
and a nested arrangement all draw correctly; the model survives a
round-trip through JSON; a single-pane tree draws no chrome it does not
need.

## Task 6.2 — The divider, and resizing

**Prompt to the coding AI:**

> Write the divider between two children of a split, and the resizing it
> does. Dragging it moves the divider; the keyboard moves it too, because a
> layout that can only be changed by dragging is not reachable. Give the
> divider the app's own role — a separator with a visible focus ring, an
> accessible name, and a value that says where it is — and give it a
> sensible minimum size for each of its two halves, so a pane cannot be
> dragged to nothing.
>
> Resizing one split must not move the dividers of the splits nested
> inside it. A cancelled drag must leave the ratio exactly as it was.

**Acceptance criteria:** The divider drags, resizes with the keyboard, and
respects the minimum sizes; nested splits are unaffected by an outer
resize; a cancelled drag changes nothing.

## Task 6.3 — Dragging a pane, and the drop targets

**Prompt to the coding AI:**

> Write the drag that moves a pane, and the targets it can be dropped on.
> The drag starts from the pane header's own drag region, and it must not
> start from a click on a header button, on the title, or on text being
> selected in the content. While the drag is over the layout, the pane
> under the pointer shows where it would land: an edge on the left, right,
> top or bottom means a split on that side, and the middle means it joins
> the group that is there.
>
> The indication is drawn by the app, in the app's own colours, and it is
> an insertion indicator rather than a preview of the whole layout — the
> reference shows a line, not a mock-up. Nothing is moved until the drop
> is committed, so a cancelled drag cannot leave the layout changed.

**Acceptance criteria:** The drag starts only from the header's drag
region; all five targets show a clear indicator; nothing moves until the
drop; a cancelled drag leaves the layout byte-for-byte as it was.

## Task 6.4 — Tab groups

**Prompt to the coding AI:**

> Write the tab group: a strip of tabs above the pane that is showing, with
> the group's panes in it. A tab shows the pane's mark and its title, and
> carries the pane's own state — a renamed pane shows its new name. Tabs
> can be switched by clicking, reordered by dragging, and closed from the
> strip. The group has its own stable id.
>
> A group with one tab is drawn as a plain pane, with no strip, because a
> tab strip holding one tab is a decoration and not a control. The group
> is where a dropped pane lands when it is dropped on the middle of
> another pane, and the tab it joins is the one that is showing.

**Acceptance criteria:** Tabs switch, reorder and close; a single-tab
group draws no strip; a pane dropped on the middle of a pane joins that
pane's group.

## Task 6.5 — Drawing the registered panes

**Prompt to the coding AI:**

> Make the renderer draw the registered pane renderers rather than
> placeholders. Every pane instance is drawn by the renderer its type
> names, and each instance keeps its own state: two File Explorers on
> screen at once are two different places, and a file selected in one says
> nothing about the other. Do not add the Views menu or the drag behaviour
> in this task, and do not change the registry's shape.

**Acceptance criteria:** Every registered pane type draws in the layout;
two instances of one type keep separate state; the registry is the only
place that knows what a pane type is.

## Task 6.6 — The first pane, and composing several

**Prompt to the coding AI:**

> Wire the workspace's Add view action to create a pane, and make a second
> pane split the region beside the first. Use the model from Task 6.1 and
> the operations in the workspace state; do not build a second arrangement
> model. Enforce the six-pane cap where a pane is added, and say why when
> the cap refuses it.
>
> The landing screen stays as it is: with no session and no panes, the
> work area shows the greeting and the composer, and the layout is not
> there at all.

**Acceptance criteria:** The empty workspace becomes one pane and then
several; the seventh pane is refused with a reason; the pane ids stay
unique; the landing screen is untouched when there are no panes.

# Phase 7 — Complete pane and layout interactions

## Task 7.1 — The Views menu

**Prompt to the coding AI:**

> Build the workspace's Add view picker using the app's own menu, popover
> and command primitives. Organize the pane types into the plan's groups:
> Conversations, Development, Files and Activity. Each entry shows the
> pane's mark, its name, and a line saying what it is for. Every entry
> comes from the pane registry, so a type added there is offered here
> without a second list to keep in step.
>
> At six panes, the entries are disabled and the reason is on them. Search
> is added if the app's command component carries it well, and not
> otherwise.

**Acceptance criteria:** Every registered pane type is offered; the
keyboard can reach and choose one; the cap is explained; choosing one
adds that pane.

## Task 7.2 — Closing a pane, and the branches it leaves

**Prompt to the coding AI:**

> Implement closing a pane from its header and from its menu. A split left
> with one child collapses into that child, so the tree does not keep a
> branch that is holding nothing. The panes that are left keep their
> content and their state, and a group left with one tab becomes a plain
> pane.
>
> Closing a pane does not close the session it was about, and it does not
> touch the project. Closing the last pane returns the work area to the
> landing screen.

**Acceptance criteria:** Closing a pane from any position leaves a valid
layout; the remaining panes keep their state; no session is closed.

## Task 7.3 — Splitting a pane on purpose

**Prompt to the coding AI:**

> Wire the split commands — left, right, top, bottom — to the same tree
> operation the drag uses, so a split made by a menu and a split made by a
> drag are the same split. The new half holds a pane chosen through the
> Views picker, and the split is refused, with a reason, when the cap
> would be broken.
>
> The command is offered in the pane's menu and in the pane's header, so
> it is not reachable only by dragging.

**Acceptance criteria:** All four directions work; a split made by a menu
is identical to one made by a drag; a refused split changes nothing.

## Task 7.4 — Resizing, and the sizes a pane may have

**Prompt to the coding AI:**

> Give the dividers their final behaviour: a hover and a focus state that
> can be seen, a pointer drag that updates the ratio live, a keyboard
> resize, and a minimum size for each half that keeps the pane's header
> and its content usable. Test at the app's own floor of 600 by 338,
> where two panes side by side is the worst case the window allows.
>
> The drag must be cancelled cleanly — the pointer leaving the window, the
> pointer being released outside it, or the escape key must all leave the
> ratio as it was.

**Acceptance criteria:** Resizing works in both directions and from the
keyboard; the minimum sizes hold at the floor; a cancelled drag changes
nothing.

## Task 7.5 — Drag-and-drop docking, end to end

**Prompt to the coding AI:**

> Join the drag from Task 6.3 to the tree operation from Task 6.1, so a
> dropped pane lands where the indicator said it would. The pane that was
> dragged keeps its identity and its state, and so does the pane it was
> dropped on. Moving a pane never creates a pane, so the cap is not
> affected by a move.
>
> A tab can be dragged out of its group and the group closes behind it
> when it is left empty.

**Acceptance criteria:** A pane can be dragged to each of the four edges
and to the middle; the pane keeps its identity and its state; no pane is
created or destroyed by a move.

## Task 7.6 — Which pane has focus

**Prompt to the coding AI:**

> Add the active pane. Clicking in a pane or on its header makes it the
> active one, without starting a drag and without firing the control that
> was clicked. The active pane is the lit one and the others are dimmed,
> as the reference shows; the divider beside the active pane is the
> brighter of the two. The active pane and the keyboard's focus must never
> contradict each other.
>
> The active pane is not the same thing as a session that is working, and
> the two must not be confused.

**Acceptance criteria:** Exactly one pane is active; the active styling
is subtle and does not fight the dark theme; clicking a header control
does not move the focus to the pane.

## Task 7.7 — Maximizing a pane, and putting it back

**Prompt to the coding AI:**

> Implement maximize and restore. Maximizing gives one pane the whole
> workspace for the moment, and the layout it was part of is kept, so
> restoring returns to the same arrangement with the same ratios and the
> same panes. Nothing is destroyed and no pane loses its state.

**Acceptance criteria:** Maximize and restore are reversible and lose
nothing; the panes that were hidden are the ones that come back.

## Task 7.8 — The layout presets

**Prompt to the coding AI:**

> Add a compact preset picker: Single Pane, Two Side by Side, Two
> Stacked, Three Columns, and Three Above and Three Below. Each preset is
> a tree built by the same model as everything else, not a set of fixed
> cells. A preset rearranges the panes that are already there, in their
> stable order, and says so when the number of panes does not fit it.
> Nothing is silently discarded.

**Acceptance criteria:** Each preset draws what its name says; three
above and three below draws six panes; no pane is lost by choosing one.

## Task 7.9 — Resetting, and recovering from a broken layout

**Prompt to the coding AI:**

> Add a reset action, and make a stored layout that cannot be drawn fall
> back to a default rather than to a blank screen. The reset says that it
> resets the layout and not the sessions or the projects, and it asks
> first, because it throws away an arrangement the reader made. A layout
> read back from storage is validated before it is drawn, and a malformed
> one is replaced rather than half-drawn.

**Acceptance criteria:** Reset produces a valid workspace and says what
it does; a malformed stored layout falls back safely; no session or
project record is touched.

## Task 7.10 — The pane's own menu

**Prompt to the coding AI:**

> Complete the pane's overflow menu with the app's own menu primitives.
> The entries are the ones this pane and this workspace can actually do:
> split left, right, top and bottom; focus, maximize or restore; pop out;
> duplicate where a second instance of the type means anything; rename
> where a title is useful; and close. An action that cannot work is left
> out or disabled with a reason, and is never drawn as if it could.
>
> Right-click is never the only way to reach something.

**Acceptance criteria:** The menus are compact and keyboard reachable;
they offer only actions that work; every essential action is reachable
without a right-click.

## Task 7.11 — Keeping the layout between runs

**Prompt to the coding AI:**

> Save the layout locally and read it back: the pane instances and their
> types and titles, the arrangement, the ratios, the groups and their
> tabs, which pane is active, and which session each pane was about. The
> saved form is versioned and validated before it is drawn, and a saved
> layout that names a pane type that no longer exists is repaired rather
> than refused.
>
> Nothing is saved that is a secret or that belongs to a session: no
> prompt, no key, no sample terminal input, no file content. If the
> session a pane was about is gone, the pane opens empty and says so.

**Acceptance criteria:** A reload restores the layout that was there; a
saved layout that is old or malformed falls back safely; the sessions
themselves are not touched.

## Task 7.12 — Two sessions, side by side

**Prompt to the coding AI:**

> Make a second session openable in the workspace beside the first, the way
> the reference shows it: two session panes, each with its own
> conversation, its own composer and its own project. A session pane is
> bound to a session by a reference, never by a copy, and the two must not
> be able to see each other's conversation, their state or their context.
> Moving a session's pane, maximizing it, popping it out, or closing it
> does not end the session, and closing a session is not something the
> pane does.
>
> The rail's list is still the way a session is chosen, and the two sides
> keep their two different lists.

**Acceptance criteria:** Two sessions can be shown at once; their
conversations and their state stay separate; moving or closing a pane does
not end its session; the rail is still the only navigation.

## Task 7.13 — Popping a pane out, and docking it back

**Prompt to the coding AI:**

> Let a pane leave the main window. The pane's header carries a control
> that opens the pane in its own window, and the window is a real one: the
> app is a desktop app, and a browser popup is not the thing the reference
> does. The session behind the pane keeps running and keeps its state; the
> pane in the window is a window onto the same thing, not a copy of it.
>
> The pane can be docked back into the main window, and where it lands is
> the reader's choice — the same drop targets the drag uses, with the same
> indicators. Closing the popped-out window docks the pane back rather
> than throwing it away, and the layout is left valid either way.
>
> This needs work on the desktop side: the capability to create a window,
> the scope that lets the new window talk to the app, and a close handler
> that docks back instead of hiding the window the way the main window's
> does. Do not weaken the main window's own close behaviour to get there.

**Acceptance criteria:** A pane opens in its own window with its state
intact; the session keeps running; the pane docks back into the main
window and the layout is valid afterwards; closing the window docks the
pane back rather than losing it.
# Phase 8 — Finish states, keyboard behavior, responsive behavior and detail polish

## Task 8.1 — State coverage audit for every pane

**Prompt to the coding AI:**

> Use the required states listed in Section 5 for each pane type and audit the actual implementation. Fill missing empty, populated, selected, loading, error, unavailable, long-content and narrow-pane states where relevant. Ensure all sample/mock states are truthful and consistent. Do not add real integrations or visual redesigns.

**Acceptance criteria:** Every pane has the states relevant to it; no empty or failure state looks broken or misleading.

## Task 8.2 — Overlay and popover audit

**Prompt to the coding AI:**

> Audit all menus, dropdowns, popovers, tooltips, dialogs, confirmations and toasts introduced by the workspace. Verify correct trigger behavior, alignment, dismissal, focus behavior, z-index, viewport collision and scroll-container clipping. Use existing shadcn components; do not replace them with bespoke overlay code. Fix only real interaction defects.

**Acceptance criteria:** Overlays remain visible, dismiss properly and are consistent across the workspace.

## Task 8.3 — Keyboard and accessibility pass

**Prompt to the coding AI:**

> Perform a practical accessibility pass on the new workspace. Ensure all buttons and icon-only controls have accessible labels, focus-visible states are present, menus/dialogs follow their underlying shadcn keyboard behavior, Escape closes appropriate overlays, and text/status is not communicated by color alone. Make essential pane actions available without dragging or right-clicking. Do not invent conflicting global shortcuts. Keep the scope to the new workspace plus regressions directly introduced by it.

**Acceptance criteria:** Primary interactions can be reached and understood using a keyboard; labels and focus indicators are clear.

## Task 8.4 — Narrow-window and overflow behavior

**Prompt to the coding AI:**

> Test the desktop UI at the supplied screenshot size and narrower supported window sizes. Ensure pane headers, toolbars, dropdown triggers and content do not overlap. At narrow widths, move secondary actions into overflow menus or use an intentional compact header. Preserve the six-pane layout state rather than silently deleting panes. Keep each content region's scroll behavior independent. Do not redesign the mobile experience unless the app already supports it.

**Acceptance criteria:** Small layouts remain usable; long text/paths/code/logs are contained; the app does not develop unnecessary global scrollbars.

## Task 8.5 — Visual polish pass

**Prompt to the coding AI:**

> Compare the completed app against the approved screenshots and the shared pane specifications. Fix only visual defects and inconsistencies: incorrect spacing, pane header alignment, title truncation, icon sizes/strokes, border contrast, scroll regions, menu padding, state colors, inactive/focused states and alignment with the existing shell. Do not add decorative animation or redesign the approved landing screens.

**Acceptance criteria:** New workspace features match the existing visual system and the Chat/Code landing screens remain approved.

# Phase 9 — Final regression QA and handoff

## Task 9.1 — Interaction QA

**Prompt to the coding AI:**

> Run a systematic UI-only QA pass. Verify: Chat/Code switching; existing sidebar items; original landing screens; opening and leaving the workspace; opening each pane type; duplicate instances; add/remove behavior; six-pane enforcement; two-way splits; nested splits; all split directions; resizing; drag docking; cancelled drags; focus; maximize/restore; each layout preset; reset; layout restoration if present; all menus/dialogs; keyboard use; long content; empty/error/unavailable states; and narrow desktop sizes. Run the project's existing build/lint/type/test commands. Fix only defects in scope. Report every check that could not be completed.

**Acceptance criteria:** The app builds and the tested UI behaviors work; there are no known major regressions.

## Task 9.2 — Produce the frontend handoff note

**Prompt to the coding AI:**

> Write a concise handoff note documenting the pane registry, shared component conventions, chosen docking library/approach, layout adapter/data model, how pane instance state is separated from geometry, current local/mock interactions, local layout persistence behavior and known limitations. Explicitly list the real backend integrations that remain unimplemented. Do not modify product code in this task.

**Acceptance criteria:** A later implementation phase can add real services without redesigning the visual workspace or replacing the layout engine.

---

# 7. Quality gates and definition of done

Do not mark the UI phase complete until these conditions are met:

## Visual preservation

- [ ] Chat landing screen still matches its approved design.
- [ ] Code landing screen still matches its approved design.
- [ ] Existing sidebar/navigation and prompt composers still work as before.
- [ ] Dark theme and typography remain consistent.

## Component consistency

- [ ] Existing shadcn/shared components are reused where appropriate.
- [ ] Lucide is the only icon system used for application UI icons.
- [ ] Icon-only buttons are accessible and have consistent sizing.
- [ ] Dropdowns/popovers/dialogs/tooltips use consistent primitives and behavior.
- [ ] Active, hover, focus-visible, disabled and relevant error/empty states are defined.

## Pane completeness

- [ ] Chat and Code Session panes implemented.
- [ ] Diff Viewer has file navigation and readable added/removed/context lines.
- [ ] Browser and Application Preview have distinct, clear no-preview and sample states.
- [ ] Terminal has safe local sample behavior and cannot execute commands.
- [ ] File Explorer supports local tree expansion/selection/search.
- [ ] File Editor has clear read-only/dirty/sample state without disk writes.
- [ ] Plan and Tasks have appropriate sample hierarchy/status behavior.
- [ ] Agent Activity, File Preview and Logs have their specified content and states.
- [ ] Each pane handles long content and narrow dimensions without breaking neighbors.

## Docking behavior

- [ ] Workspace can be empty, contain one pane or contain up to six.
- [ ] Pane types are registry-driven and instances have unique IDs.
- [ ] Horizontal/vertical nested splits work.
- [ ] Dividers resize appropriately.
- [ ] Drag-and-drop supports all required edge targets.
- [ ] Closing panes collapses empty branches safely.
- [ ] Existing panes can be moved at the six-pane cap; a seventh is blocked.
- [ ] Maximize/restore preserves the previous layout.
- [ ] Layout presets, including three-above/three-below, work.
- [ ] Reset and invalid-layout recovery work.
- [ ] Local layout restoration works if implemented, otherwise its omission is documented.

## Interaction/accessibility/QA

- [ ] Essential interactions are not available only through dragging or right-click.
- [ ] Menus/dialogs handle focus and dismissal correctly.
- [ ] No important status relies only on color.
- [ ] Workspace works at the reference desktop size and reasonable narrower sizes.
- [ ] Existing build/type/lint/tests pass, or known pre-existing failures are documented.
- [ ] No backend integration or unsafe execution was introduced.

---

# 8. Recommended workflow for a low-cost coding model

Use this cycle for every single task:

1. **Read:** provide the global rules and the current task only.
2. **Inspect:** the model identifies the files it expects to edit.
3. **Implement:** one narrow task, no future phases.
4. **Verify:** run the smallest relevant existing checks.
5. **Review:** inspect the diff for unrelated changes and regressions.
6. **Checkpoint:** make a Git commit or recoverable snapshot when appropriate.
7. **Stop:** the model reports results and waits for approval.

Suggested instruction to start the project:

> Read `docs/ui-ux-plan.md` completely. Follow its global instructions and exact task order. Start with Task 0.1 only. Inspect the codebase without modifying any files. Report the architecture map, relevant file paths, build/check commands, existing shadcn/Lucide setup and likely docking approaches. Then stop and wait for my approval.

If a task is too large for the model, split that task into smaller numbered sub-tasks before implementation; do not let it skip ahead or rewrite unrelated files.

---

# 9. Research and reference links

Use these as documentation references, not as a command to copy their visual design blindly. Always check the version and implementation already used by the project.

- **shadcn/ui introduction:** https://ui.shadcn.com/docs
- **shadcn/ui sidebar:** https://ui.shadcn.com/docs/components/base/sidebar
- **shadcn/ui dropdown menu:** https://ui.shadcn.com/docs/components/base/dropdown-menu
- **shadcn/ui context menu:** https://ui.shadcn.com/docs/components/base/context-menu
- **shadcn/ui dialog:** https://ui.shadcn.com/docs/components/base/dialog
- **shadcn/ui empty state:** https://ui.shadcn.com/docs/components/base/empty
- **shadcn/ui skeleton:** https://ui.shadcn.com/docs/components/base/skeleton
- **Lucide for React:** https://lucide.dev/guide/react/
- **Lucide icons catalogue:** https://lucide.dev/icons
- **Claude Code Desktop documentation:** https://code.claude.com/docs/en/desktop
- **Claude Code Desktop — arrange your workspace:** https://code.claude.com/docs/en/desktop#arrange-your-workspace
- **Claude Code Desktop — work in parallel with sessions:** https://code.claude.com/docs/en/desktop#work-in-parallel-with-sessions
- **Claude Code Desktop quickstart:** https://code.claude.com/docs/en/desktop-quickstart
- **Claude Code desktop redesign announcement:** https://claude.com/blog/claude-code-desktop-redesign
- **Pop-out panes in Claude Code Desktop:** https://aicatchup.com/news/claude-code-desktop-pop-out-panes

---

## Final instruction

This document describes the UI/UX phase only. Build from the existing app outward, establish and verify the foundation first, then build reusable controls and pane components, then integrate the docking engine and interactions, then complete states and QA. Do not begin real AI/tool/backend work until the UI phase passes the completion checklist.
