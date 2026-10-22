# Dockable Workspace UI/UX Plan

**File purpose:** This is the source-of-truth implementation roadmap for completing the application's frontend UI/UX before adding real AI execution or developer-tool integrations.

**Execution rule:** Follow this document from top to bottom. Give the coding AI **one numbered task at a time**. It must stop after that task, report what changed and wait for the next task. Do not ask the model to implement the entire document in one request.

**Current starting point:** The app already has a dark desktop shell, a Chat/Code switch, a left sidebar, a Chat landing screen with a centered prompt composer, and a Code landing screen with a project/folder prompt composer and Sessions list. The user supplied screenshots of both screens. Treat these as approved visual references.

**Libraries to respect:** The app uses **shadcn/ui** for UI components and **Lucide** for icons. Audit what is already installed and implemented before using or creating components. Reuse the app's existing shared components, shadcn/ui components, tokens and conventions whenever possible.

**Desired end state:** The app looks and behaves like a carefully integrated desktop AI development workspace, with a generic pane framework, realistic Chat/Code/terminal/diff/browser/files/activity interfaces, full UI states and controls, and a dockable workspace that can show up to six panes simultaneously. This phase is frontend UI/UX only.

---

## Where the work has got to

| Task | | What it produced |
|---|---|---|
| 0.1 | ✅ done | The implementation map: the stack, the entry points, the shell, the sidebar, the Chat/Code switch, the composers, the state, the check commands, and the vendored `react-resizable-panels` primitive that is on disk and imported by nothing |
| 0.2 | ✅ done | [`docs/visual-baseline.md`](../../visual-baseline.md) — the approved shape, as numbers, and the list of nine things that must not change |
| 0.3 | ✅ done | The shadcn and Lucide audit: the component families that exist, the one primitive family in use, and the icon sizing convention |
| 0.4 | ✅ done | [`docs/plan/docking.md`](docking.md) — the docking decision: `react-resizable-panels` through the app's own component, with the drag built on top of it |
| 1.1 | ✅ done | [`docs/tokens.md`](../../tokens.md) — the token map — and seven missing tokens, three of which the code already asked for |
| 1.2 | ✅ done | [`docs/components.md`](../../components.md) — the component map — the last of the app's own code moved off the older component family, and four tests that keep it there |
| 1.3 | ✅ done | [`docs/icons.md`](../../icons.md) — the icon convention — and `src/blocks/workspace/pane-types.ts`, the mark for each of the thirteen kinds of view |
| 1.4 | ✅ done | [`docs/layout.md`](../../layout.md) — the height chain and the scroll boundaries — and one real defect fixed: the work area could make the whole window scroll |
| 1.5 | ✅ done | [`docs/workspace-state.md`](../../workspace-state.md) — who owns each of the eight — and `src/lib/workspace-state.ts`, the six that are new |
| 2.1 | ⬜ next | The workspace host |
| 2.2 | ⬜ | The way into the workspace |
| 2.3 | ⬜ | The empty workspace |
| 3.1 | ⬜ | The icon-only button |
| 3.2 | ⬜ | Menus and tooltips |
| 3.3 | ⬜ | Popovers and pickers |
| 3.4 | ⬜ | Dialogs and confirmations |
| 3.5 | ⬜ | Status, empty, loading and error |
| 4.1 | ⬜ | The pane frame |
| 4.2 | ⬜ | The pane header |
| 4.3 | ⬜ | The pane's actions |
| 4.4 | ⬜ | The pane registry |
| 4.5 | ⬜ | The pane's state slots |
| 5.1 – 5.15 | ⬜ | The thirteen panes, and the consistency pass |
| 6.1 – 6.5 | ⬜ | The layout engine, and the first panes in it |
| 7.1 – 7.11 | ⬜ | The interactions: the Views menu, splitting, resizing, docking, focus, maximise, presets, reset, and the pane menu |
| 8.1 – 8.5 | ⬜ | States, overlays, keyboard, narrow windows, and the polish pass |
| 9.1 – 9.2 | ⬜ | The QA pass and the handoff note |

Each task that is done carries a **Status** block with what it produced and
where it went, and the block is only written after the task's own checks
have passed. A task marked done is done.

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
- For this initial version, prefer direct visible panes rather than hidden tab stacks. Do not let a tabbed group hide panes that the UI says are simultaneously visible. Only add tabbed pane groups if the product owner explicitly requests them.

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

Once the workspace is open, provide a compact toolbar suitable for the current design. Include only actions needed by the current UI:

- Workspace/view name or current project/session context where useful.
- **Views/Add View** menu.
- Layout preset selector.
- A layout reset action, placed in a menu or clearly differentiated if it could discard custom arrangement.
- Optional visible pane-count indicator only if it is helpful; avoid adding decorative status clutter.
- A clear state for the six-pane cap when the user attempts to add more.

The toolbar should not introduce unrelated settings or duplicate all the actions already available in every pane.

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
| The decision | [`docs/plan/docking.md`](docking.md) — the requirements, the three candidates scored against them, the decision, what it does not settle, and the proof of fit |
| The choice | `react-resizable-panels`, through the app's own `src/components/resizable`, with the drag-and-drop built on top of it |
| What decided it | One requirement: **drag-to-dock docking**. The library resizes and does not move panes. Everything else it does, and does in the app's own component, with the persistence already wired |

No dependency was installed and no implementation code was written.

The proof of fit, which is Task 6.1: two generic panes, a horizontal split
containing a vertical one, a draggable divider, and the app's dark theme —
at the window's 600 × 338 floor, which is the worst case the layout will
ever be asked for.

**Decision note:** Dockview documents both a full docking component and a Gridview option for resizable panels without tabs. This is one option to evaluate, not a predetermined choice. Use the local stack and exact UX requirements to make the decision.

# Phase 1 — Establish the frontend foundation

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

> Document or implement the minimal frontend state ownership needed for the workspace: app section, active project/session selection, whether the workspace is open, pane instances, active pane, layout geometry, pane-local UI state and overlay state. Keep layout geometry separate from pane content, and keep both separate from future AI/tool execution. Do not implement a backend or the docking behavior in this task.

**Acceptance criteria:** State ownership is clear and does not duplicate the current Chat/Code state unnecessarily.

**Status: done.**

| | |
|---|---|
| The map | [`docs/workspace-state.md`](../../workspace-state.md) — all eight, who owns each, where it lives, who changes it, who reads it |
| The state | `src/lib/workspace-state.ts` — the **six** that are new. The app section and the active thread are not among them |
| The check | `src/lib/workspace-state.test.ts` — nineteen tests, each broken on purpose to watch it fail |

Nothing was duplicated: the app section belongs to the composer variant
provider and the active thread to the thread bridge, and the workspace
holds neither. A pane may name the session it is about, and that is a
reference rather than an ownership.

No component, no rendering, no docking behaviour and no package.

# Phase 2 — Integrate a workspace host without changing the landing UI

## Task 2.1 — Add a workspace host shell

**Prompt to the coding AI:**

> Add the smallest workspace host component in the correct main-content location. It must fill the available space beside the existing sidebar, inherit the current visual design and expose a content slot for the future layout engine. Keep it hidden/inactive while the app is showing the current landing screen unless the existing user flow opens a working session/workspace. Do not build the pane layout, alter landing-screen content or add backend logic.

**Acceptance criteria:** The existing Chat and Code landing screens remain visually approved; the host can be activated in a controlled UI path and fills its container.

## Task 2.2 — Define the UI transition into Code workspace

**Prompt to the coding AI:**

> Wire the new workspace host into the existing Code UI flow with the smallest coherent frontend state transition. Keep the current Code landing composer and sessions list intact. Provide a clear path for opening the workspace, using the existing flow if one exists or a new explicit UI-only action if not. Use sample session context where necessary. Do not send prompts to an AI or connect project folders to real disk operations.

**Acceptance criteria:** Users can see the current Code landing state and separately reach the workspace prototype. The transition is reversible and does not reset unrelated state.

## Task 2.3 — Add workspace-level empty state

**Prompt to the coding AI:**

> Design the empty state shown inside the workspace only when the workspace is explicitly open and contains no pane instances. Use a concise message, a relevant Lucide icon and a Views/Add View action. Keep it consistent with the current dark design and avoid duplicating the original Code landing hero. The empty-state action must open the Views picker. Do not add pane rendering or docking yet.

**Acceptance criteria:** The landing screen remains distinct from an empty workspace; the workspace empty state has a clear next action.

# Phase 3 — Build reusable controls and overlay behavior

## Task 3.1 — Create/standardize icon-only button behavior

**Prompt to the coding AI:**

> Audit and reuse the existing icon-only button pattern, or implement a minimal reusable wrapper if necessary. Ensure consistent hit area, hover/pressed/disabled/focus-visible states, accessible label, Lucide icon alignment and optional tooltip support. Keep the current app's compact styling. Do not replace existing buttons globally.

**Acceptance criteria:** New icon controls can use one consistent pattern; keyboard users can identify and focus them.

## Task 3.2 — Standardize tooltip, dropdown and context-menu usage

**Prompt to the coding AI:**

> Verify the existing shadcn tooltip, dropdown-menu and context-menu components. Document/reuse the project's conventions for trigger behavior, alignment, dismissal, focus, labels, separators and destructive actions. Add only the missing minimal shared wrapper/pattern. Do not create a custom menu implementation if an existing shadcn component already covers it.

**Acceptance criteria:** The workspace can use standard menus without inconsistent behavior or invented component APIs.

## Task 3.3 — Standardize popovers and selection pickers

**Prompt to the coding AI:**

> Verify existing Popover, Select/Combobox and Command components. Establish one suitable pattern for an anchored pane-type picker and one for compact filters. Ensure options have readable labels, selected state, keyboard interaction and an empty/no-results state when search is used. Do not build the actual Views menu yet.

**Acceptance criteria:** The primitives are ready for reuse and follow the local shadcn implementation.

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

# Phase 6 — Implement or integrate the docking engine

## Task 6.1 — Run a minimal proof of fit for the chosen docking approach

**Prompt to the coding AI:**

> Based on the decision in Task 0.4, implement the smallest isolated proof of fit for the selected layout library or custom approach. Demonstrate two generic panes split horizontally and vertically, a draggable divider, and correct dark-theme integration inside a temporary/test view. Do not migrate the full app or implement all workspace actions yet. Do not add a second layout engine.

**Acceptance criteria:** The selected approach supports the required geometry and styling; if it does not, stop and report before broad integration.

## Task 6.2 — Create a layout adapter boundary

**Prompt to the coding AI:**

> Introduce a small adapter/interface between the app and the chosen layout engine. The rest of the app should request operations such as add pane, remove pane, split, move, resize, focus, maximize and serialize without relying directly on library internals everywhere. Keep the adapter intentionally small; do not wrap every library API or build an unnecessary framework. If the selected layout library already provides a suitable stable API, expose only the operations this app uses.

**Acceptance criteria:** Pane content and registry remain independent of the layout vendor; adapter code is easy to trace.

## Task 6.3 — Define layout schema and validation

**Prompt to the coding AI:**

> Define or map the layout representation for the chosen engine. If the engine uses a nested split tree, represent split orientation, child nodes and ratios without hard-coded six-slot assumptions. If the library owns geometry, use its supported layout schema through the adapter rather than duplicating it. Add validation for unique pane instance IDs, known pane types, valid ratios and the six-visible-pane limit. Write focused tests if the project has a test setup.

**Acceptance criteria:** Layout schema is valid, testable and does not duplicate the library's internal model unnecessarily.

## Task 6.4 — Render registered pane content in the layout

**Prompt to the coding AI:**

> Replace the temporary proof-of-fit panes with the registered pane renderers. The layout engine should render pane instances by ID/type and pass through their own local UI state. Ensure multiple instances of the same type do not share unintended selection or editor state. Do not add the Views menu or drag-and-drop behaviors in this task.

**Acceptance criteria:** Any registered pane type can render in the workspace and preserve its own presentation state during layout changes.

## Task 6.5 — Add the first pane and compose multiple panes

**Prompt to the coding AI:**

> Wire the workspace empty-state Views/Add View action to create the first pane instance. Then support adding another pane with a sensible default split. Use the pane registry and layout adapter. Enforce the six-pane cap at the add-operation boundary. Keep the existing Code landing state separate and unchanged.

**Acceptance criteria:** Empty workspace to one pane to multiple panes works; the seventh pane is prevented; IDs remain unique.

# Phase 7 — Complete pane and layout interactions

## Task 7.1 — Add the Views menu

**Prompt to the coding AI:**

> Build the workspace Views/Add View picker using the established shadcn menu/popover/command pattern. Organize available pane types into clear groups such as Conversations, Development, Files and Activity. Show Lucide icon, readable title and a concise description where helpful. At six panes, disable or block additional pane insertion and explain the limit. Searchable selection may be added if it fits existing components. All options must use the pane registry, not hard-coded render logic in the menu.

**Acceptance criteria:** Every registered pane type is discoverable; keyboard selection works; max count is clear; selection adds the chosen type.

## Task 7.2 — Implement pane close/removal and empty branches

**Prompt to the coding AI:**

> Implement closing/removing a pane through its header and overflow menu. Update the layout using the adapter so empty split branches collapse safely and remaining panes keep their content/state. If no panes remain, return to the workspace empty state. Do not delete or close an underlying real session or project when its pane is closed. Confirm only when a local demo edit would genuinely be discarded.

**Acceptance criteria:** Closing panes from any position preserves the validity and expected geometry of the remaining workspace.

## Task 7.3 — Implement explicit split actions

**Prompt to the coding AI:**

> Wire pane split commands for left, right, top and bottom using the layout adapter. Show a drop-insertion result around the selected pane while preserving all current pane IDs/content. Choose an appropriate pane type to add through the Views picker or a clearly defined default flow. Validate the six-pane cap before committing. Do not add drag-and-drop in this task.

**Acceptance criteria:** All supported orientations work; failed splits leave the layout unchanged.

## Task 7.4 — Implement resize behavior and minimum sizes

**Prompt to the coding AI:**

> Finalize resizable dividers using the selected engine's supported implementation. Set reasonable minimum pane dimensions based on the real desktop UI and test at the supplied screenshot size. Resizing one split must not unexpectedly change unrelated nested splits. Make divider hover/focus states visible without adding required animations. Handle pointer cancellation cleanly.

**Acceptance criteria:** Resizing works horizontally and vertically; headers/content remain usable; minimum sizes are respected.

## Task 7.5 — Implement drag-and-drop docking

**Prompt to the coding AI:**

> Implement drag-and-drop docking with the selected layout engine. Use the dedicated pane-header drag handle. Show clear left/right/top/bottom drop targets while dragging. Dropping creates the requested split and preserves both pane instances and their local state. Cancelled drops restore the original layout. Do not create hidden tab groups in this version; the intended behavior is visibly arranged panes. Enforce the six-pane cap for pane creation while still allowing existing panes to move at the cap.

**Acceptance criteria:** Dragging supports all four edges, visual targets are clear, cancellation is safe and existing pane content is never lost.

## Task 7.6 — Focus/active pane state

**Prompt to the coding AI:**

> Add consistent active-pane state. Clicking inside a pane or its header should focus it without triggering drag or an unrelated action. Style the focused pane subtly so users can identify the current target. Keep pane focus separate from mock agent status. Ensure keyboard focus and the active visual state do not contradict each other.

**Acceptance criteria:** Exactly one pane is treated as the active pane where the UX requires one; active styling does not overwhelm the dark theme.

## Task 7.7 — Maximize and restore a pane

**Prompt to the coding AI:**

> Implement maximize/restore for a pane using the selected layout engine or adapter. Maximizing should temporarily give one pane the available workspace area while retaining the previous layout and pane instances; restoring must return to the same arrangement and ratios. Do not destroy sibling panes or reset their local state.

**Acceptance criteria:** Maximize and restore are reversible and preserve layout/content state.

## Task 7.8 — Implement layout presets

**Prompt to the coding AI:**

> Add a compact layout preset picker with Single Pane, Two Side-by-Side, Two Stacked, Three Columns and Three-Above/Three-Below. Use the generic layout model/library, not hard-coded six-slot content. Define whether presets rearrange existing panes by stable order or create panes; do not silently discard panes or local sample state. If the current pane count cannot fit a preset safely, ask for a clear choice or adjust only according to a documented deterministic rule. Maintain the six-visible-pane cap.

**Acceptance criteria:** Presets match their names; three-above/three-below renders six visible panes; current content is not silently lost.

## Task 7.9 — Reset and layout recovery

**Prompt to the coding AI:**

> Add a reset-layout action and robust empty/invalid-layout recovery. Use a confirmation only if resetting could discard the user's custom arrangement; explain that this resets pane layout, not projects or sessions. The default layout should be valid and usable. Malformed stored metadata must fall back gracefully. Do not delete sessions or file data.

**Acceptance criteria:** Reset and recovery produce a valid workspace; existing project/session records are unaffected.

## Task 7.10 — Pane context menu and action availability

**Prompt to the coding AI:**

> Complete pane overflow/context-menu actions using the shared dropdown/context-menu primitives. Ensure actions reflect the selected pane type and current workspace state. Include close, focus/maximize/restore and split directions where supported. Include duplicate/rename only where meaningful and safe. Remove placeholder actions that cannot work; disable them with an explanation only when there is a clear future purpose. Do not make right-click the only way to access essential controls.

**Acceptance criteria:** Menus are compact, consistent, keyboard accessible and do not expose misleading actions.

## Task 7.11 — Optional local layout persistence

**Prompt to the coding AI:**

> If the existing app has an appropriate local persistence pattern and the layout engine supports it safely, save and restore layout metadata locally: pane IDs/types/titles needed for reconstruction, arrangement, ratios, active pane and benign pane presentation settings. Version the saved schema and validate it before restore. Do not persist prompts, secrets, sample terminal input, file contents or future execution data. If this is too risky for the current architecture, leave persistence out and report the reason rather than adding a new persistence framework.

**Acceptance criteria:** If implemented, reload restores a valid layout and malformed/old data falls back safely. If not implemented, the omission is documented.

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
- **Dockview introduction:** https://dockview.dev/docs/overview/introduction/
- **Dockview core concepts:** https://dockview.dev/docs/core/overview/
- **Dockview theming:** https://dockview.dev/docs/core/theming/
- **Claude Code Desktop documentation:** https://code.claude.com/docs/en/desktop

---

## Final instruction

This document describes the UI/UX phase only. Build from the existing app outward, establish and verify the foundation first, then build reusable controls and pane components, then integrate the docking engine and interactions, then complete states and QA. Do not begin real AI/tool/backend work until the UI phase passes the completion checklist.
