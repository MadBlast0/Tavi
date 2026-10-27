# Claude Code Desktop — full workspace UI/UX research

Companion to `claude-desktop-workspace-reference.md`. Deeper, end-to-end coverage of the docking system so Tavi can match it precisely. Facts are tagged **Confirmed** (Anthropic source + URL), **Likely** (inferred from the redesign video / user-confirmed screenshot / Tavi's reading), or **Unverified** (not documented; Tavi must decide or measure). Tavi-specific decisions are called out separately and must not be attributed to Anthropic.

**Sources**
- Anthropic Desktop docs, "Arrange your workspace": https://code.claude.com/docs/en/desktop#arrange-your-workspace — **Confirmed** basis for documented behaviors.
- Anthropic Desktop docs, "Work in parallel with sessions": https://code.claude.com/docs/en/desktop#work-in-parallel-with-sessions — **Confirmed**.
- Redesign announcement (2026-04-14): https://claude.com/resources/articles/claude-code-desktop-redesign — **Confirmed** at product level; embeds the official 37s product video (YouTube id `rWaQSQEm_aY`), the best first-party visual/motion reference.
- User-confirmed four-session screenshot (community, Reddit): https://www.reddit.com/r/ClaudeAI/comments/1v57qfd/claude_code_desktop_app_split_screen/ and image https://preview.redd.it/claude-code-desktop-app-split-screen-v0-8boohpq4p5fh1.png?auto=webp&crop=smart&s=45b8c246e76dade55d093ce539d6cea88ce695c5&width=640 — **Likely/unverified**; community screenshot, not an Anthropic spec. Not present in this repo, so pixel-level comparison is still outstanding.
- Secondary corroboration: MacRumors summary (2026-04-15) https://www.macrumors.com/2026/04/15/anthropic-rebuilds-claude-code-desktop-app/; The New Stack https://thenewstack.io/claude-code-desktop-redesign/; note.com walkthrough https://note.com/odayakanushi/n/n7cccb1941cc1?hl=en. **Likely** only.

## 1. Information architecture: rail/sidebar sessions vs. workspace

- The app has three top-level surfaces selected from the sidebar: **Chat**, **Cowork**, and **Code**. In the redesign the switcher moved into the sidebar and shows three icons rather than word marks. Code is the surface this research covers. **Confirmed** (docs intro; New Stack).
- Within Code, the unit of work is a **session**: an independent conversation with its own chat history, project folder, and code changes. Sessions are listed in the left sidebar and can run in parallel. **Confirmed** (docs, "Manage sessions").
- The sidebar is the session rail: it lists active and recent sessions, supports filtering by status/project/environment and grouping by project, and carries **+ New** (Cmd/Ctrl+N) to start another. **Confirmed** (docs + announcement).
- The workspace is the pane canvas to the right of the sidebar. It hosts one or more panes arranged in splits/tabs, all bound to a session context. **Confirmed** (docs, "Arrange your workspace").
- A session is displayed in a pane; panes are views, not conversations. Two sessions side by side are two panes showing two different conversations; the pane arrangement has no opinion about either conversation. **Likely** — Tavi's framing, supported by docs ("To change which session a pane shows, click in that pane to give it focus, then click a session in the sidebar").
- Session details panel: a set of cards beside the chat (where it runs, what changed, what's running, context usage). Appears after a session starts, while the chat is wide enough. **Confirmed** (docs, "See session details").
- Top-level distinction that matters for Tavi: OS/app caption (window chrome) vs. session-owned pane title bar. Keep these separate; do not add a second full-width workspace toolbar. **Likely** — Tavi's established interpretation (ui-ux-research R3/R4).

## 2. Entry flows

### 2.1 Opening a session into the work area
- Create a new session: click **+ New** in the sidebar or Cmd/Ctrl+N. New session screen (current layout) lets you pick environment/model etc. **Confirmed** (docs, "Work in parallel with sessions"; "Start a session").
- Open an existing session side by side: hold Option (macOS) / Alt (Windows) and click it in the sidebar, or right-click → Open in → Split view. **Confirmed** (docs).
- Open an existing session in its own window: hold Cmd (macOS) / Ctrl (Windows) and click, or right-click → Open in → New window. **Confirmed** (docs).
- Tavi's sidebar drag-to-split (drag a session row into the workspace) is the user-confirmed target interaction and is **not** an Anthropic-documented gesture. Tavi must implement it as its own required behavior and offer modifier-click / "Open beside" as an alternate, not a replacement. **Likely/unverified** as Anthropic behavior; **Confirmed** as Tavi requirement (ui-ux-research R1/R4/R5).
- While a split is active, clicking another sidebar session replaces whichever pane has focus. **Confirmed** (docs, "Work in parallel with sessions").
- Take the focused session out of split view: Cmd+Ctrl+W (macOS) / Ctrl+Alt+W (Windows). **Confirmed** (docs).
- Switch between sessions: Ctrl+Tab / Ctrl+Shift+Tab. **Confirmed** (docs).

### 2.2 Adding a tool view beside the active pane
- Open another pane via its icon button in the session's title bar: **Terminal**, **Changes** (diff), **Browser**, **Files** are the common ones; hover shows the name. **Confirmed** (docs, "Arrange your workspace").
- Panes with no title-bar button (Background tasks, Plan) appear in the **⋮** menu beside the buttons once the session has something to show in them. **Confirmed** (docs).
- Narrow window: buttons that don't fit move into the **⋮** menu. **Confirmed** (docs).
- Adding a view docks it beside the active pane (Tavi interpretation); the app does not use a separate full-width "Add view" toolbar. **Likely** (Tavi reading; docs don't specify docking side but the drag/reposition model implies it).

### 2.3 The '+ New' draft pane rule (Tavi)
- Starting a new Code session while a saved session is open must leave that session visible and open a fresh draft in a new pane. Reusing a pane bound to a saved session made "New" destructive. **Tavi decision**, not Claude behavior. **Unverified** against Claude (docs do not prescribe the exact result of + New while a split is open).
- If the active pane is already an empty conversation draft, reuse it. **Tavi decision**.
- If the six-pane cap is reached, explain how to make room and preserve the current session. **Tavi decision**.
- A draft becomes a persisted session when the first message is sent, following Tavi's existing persistence flow. **Tavi decision**.

## 3. Docking mechanics

### 3.1 Drag handles
- Drag a pane by its header to reposition it. **Confirmed** (docs, "Arrange your workspace").
- Pane header controls explicitly cancel drag initiation so clicks on buttons don't start a drag. **Tavi implementation detail** (ui-ux-research R5); Claude docs don't specify but is the natural behavior.
- The title-bar row is draggable except for interactive controls. **Tavi implementation**.

### 3.2 Drop targets / edges / zones
- Anthropic docs do not specify exact drop targets, edges, or tab groups. They say panes can be "arranged in any layout" by dragging headers and edges. **Confirmed** vagueness.
- Tavi uses its own four-edge + center drop zones and tab groups, which go beyond the documented Claude drag/reposition behavior and must not be presented as Anthropic's exact undocumented algorithm. **Tavi extension** (ui-ux-research R5).
- Drag-and-drop feedback: a clear insertion indicator before the drop. **Tavi requirement** (docking R12); docs don't describe the indicator.

### 3.3 Tab groups
- Multiple panes can share one place with one showing (tabbed group). **Tavi requirement** (docking R6); Anthropic docs do not document tab groups explicitly, though "any layout" and the pane model imply grouping. **Unverified** against docs.
- Tab accessibility: named tab/tabpanel relationships, selected state, roving focus with Left/Right/Home/End, Delete to close, focus returns to adjacent tab after close (WAI-ARIA Tabs). **Tavi implementation** (ui-ux-research).

### 3.4 Pop-out + dock-back
- Pop a pane (docs example: diff or terminal) out into its own window; dock it back when done; Claude keeps working in the main window. **Confirmed** (docs, "To work across screens").
- Pop-out is a native window requirement for Tavi (Tauri WebviewWindow), not a browser popup. **Tavi constraint** (ui-ux-research).
- Pop-out window chrome, size, and dock-back mechanics are not documented by Anthropic beyond "dock it back." **Unverified**.
- Tavi's native handoff: pane keeps identity and local sample state; new windows stay hidden until the pane webview registers its close/dock listener, then revealed on readiness; creation waits for both child readiness and main window close hook; dock-back carries a request ID and state snapshot; pane window closes only after main acknowledges restoration; pop-out refused while the same session is replying. **Tavi implementation** (ui-ux-handoff).
- Pop-out scope (which pane types can pop out) not enumerated by docs ("such as the diff or terminal"). **Unverified**.

### 3.5 Resize dividers
- Drag a pane edge to resize. **Confirmed** (docs).
- Resizable dividers with sensible minimum sizes; keyboard resizing. **Tavi requirement** (docking R4); docs don't give min sizes or keyboard behavior.
- WAI-ARIA Window Splitter pattern: orientation-matched arrow keys, optional Home/End for min/max, separator named after the primary pane, value = pane size. **Tavi implementation** (ui-ux-research).
- Divider thickness, hit area, dragged appearance: decided by looking (Tavi task 6.2). **Unverified** against Claude.

### 3.6 Maximize / restore
- Maximize/restore a pane: **not documented** by Anthropic. Tavi implements it as a pane action (initially in overflow menu, consolidated there per 2026-10-26 correction). **Unverified** whether Claude has an equivalent.

### 3.7 Reset
- Reset layout to default: not documented. **Unverified**. Tavi persists layout metadata (docking R9) and can restore; a reset affordance is Tavi's own.

## 4. Pane chrome spec

### 4.1 Header strip
- Flat panes, no card/rounded corner/shadow; region separated by a single hairline on the window's own background. **Likely** (Tavi reading; docs don't describe chrome).
- Fixed-height header strip: pane's mark + title on the left; on the right pop-out, chevron (opens pane menu), close — in that order. **Likely** (Tavi reading of screenshot/video; docs don't enumerate).
- Header is the drag handle. **Confirmed** that panes are dragged by their header (docs); the "header is the app's, not the library's" is Tavi's requirement (docking R5).

### 4.2 Header controls: primary vs. overflow
Session title bar (session-level, not pane-level):
- Primary one-click launchers: Terminal, Changes (diff), Browser, Files. **Confirmed** (docs, "Arrange your workspace").
- Overflow **⋮** menu: secondary panes (Background tasks, Plan) listed once the session has something to show; also pane actions (close/focus/maximize/pop-out) as a compact submenu. **Confirmed** for the menu + secondary panes; the consolidation of pane actions into the same menu is Tavi's 2026-10-26 decision.
- Narrow widths: launchers that don't fit move into the **⋮** menu (ResizeObserver-driven in Tavi). **Confirmed** (docs: "When the window is narrow: buttons that don't fit move into the menu").

Pane-level header:
- Pop-out, overflow (chevron), close. **Likely**.
- Maximize/restore: Tavi addition (see 3.6).

### 4.3 Focus / dim treatment
- Split view: the focused pane is lit and the other pane is dimmed. **Confirmed** (docs, "Work in parallel with sessions": "the other pane is dimmed").
- The divider next to the focused pane is the brighter of the two. **Likely** (Tavi reading; not documented).
- Window top strip reflects the focused pane's context. **Likely**.
- In Tavi, focus treatment uses the app's own tokens; the divider's brightness difference is Tavi's styling decision.

### 4.4 Narrow-width behavior
- Title-bar launchers overflow into **⋮** when they don't fit. **Confirmed** (docs).
- Session details panel appears only while the chat is wide enough. **Confirmed** (docs).
- Pane headers move secondary controls into the menu at tight widths; tab strips scroll horizontally; pane roots allow shrinking; content owns its overflow. **Tavi implementation** (ui-ux-handoff, task 8.4).
- Code composer collapses provider/environment/folder labels to icons at narrow widths while keeping full accessible names. **Tavi implementation**.
- Headless render reviewed at 600×338 and 480×320 (two panes, headers and independent content regions visible, no page-level scrollbar). **Tavi verification**.

## 5. Per-pane content expectations

Pane types documented by Anthropic: chat, diff, browser, terminal, file, plan, tasks, subagent, plus iOS Simulator (macOS). **Confirmed** (docs, "Arrange your workspace"). Background tasks and Plan appear in the overflow once the session has something to show. **Confirmed** (docs).

Tavi also has (Tavi extensions, not documented Claude panes): Application Preview, Logs, Agent Activity. Treat as Tavi's own.

Per-pane expectations (mix of Confirmed/Likely):

- **Chat / Code session pane**: carries its own composer at the bottom (Likely); scrolls its own content (Likely); shows suggested prompt as gray text in empty box (Confirmed, docs "Accept a suggested prompt"); supports side chat (Cmd/Ctrl+;) (Confirmed).
- **Terminal pane**: opens in the session's working directory, shares Claude's environment; second terminal tab via **+** in the terminal header or right-click folder → Open in terminal; available in local and SSH (limit on Windows remote). **Confirmed** (docs, "Run commands in the terminal").
- **Changes / diff pane**: review modifications file by file; open via line counts in the Changes card or **Changes** in the title bar; line comments with Cmd/Ctrl+Enter submit; unified view (New Stack notes Claude offers only unified, not split). **Confirmed** (docs, "Review changes with diff view"; New Stack).
- **Browser pane**: tabbed browser; open via Cmd+Shift+B / Ctrl+Shift+B or Browser in title bar; interact with running app; Dev servers menu in header; Keep cookies / Clear browsing data in **⋮**; external-site approval cards (Allow once / Always allow / Deny). **Confirmed** (docs, "Preview your app", "Browse external sites").
- **File pane**: click a path in chat; local sessions editable (except view-only files like .mcp.json, .claude/settings.json), cloud/SSH/WSL view-only; auto-save on by default, toggle Auto save in **⋮**, Save/Cancel when off, Override/Discard on disk change. **Confirmed** (docs, "Open and edit files").
- **Plan pane**: appears in overflow once the session has a plan to show. **Confirmed** existence; content behavior **Unverified** beyond that.
- **Tasks pane**: background work (subagents, background shell commands, dynamic workflows); open from title bar **⋮** or drag into layout; click entry to see output in subagent pane or stop it. **Confirmed** (docs, "Watch background tasks").
- **Subagent pane**: shows output of a clicked task entry. **Confirmed** (docs).
- **Application Preview / Logs / Agent Activity (Tavi)**: Tavi's own panes; no Claude equivalent documented. Treat as Tavi extensions with sample content until real integrations exist. **Tavi decision**.
- Empty/loading/error states: docs don't specify; Tavi should provide consistent empty states per pane and not invent Claude's exact copy. **Unverified**.

## 6. Keyboard / shortcuts and accessibility

Confirmed shortcuts (docs, "Keyboard shortcuts"):
- Cmd/Ctrl+/ : show keyboard shortcuts.
- Cmd+N / Ctrl+N : new session.
- Cmd+W : close session.
- Ctrl+Tab / Ctrl+Shift+Tab : switch sessions.
- Cmd+Shift+] / [ : next/previous session.
- Esc : stop response.
- Tab / Right arrow : accept suggested prompt.
- Cmd+Shift+D : toggle diff pane.
- Cmd+Shift+B : toggle browser pane.
- Cmd+Shift+S : select element in browser.
- Ctrl+` : toggle terminal pane.
- Cmd+\ / Ctrl+\ : close focused pane.
- Cmd+Ctrl+W / Ctrl+Alt+W : take focused session out of split view.
- Cmd+; / Ctrl+; : open side chat.
- Ctrl+O : cycle view modes.
- Cmd+Shift+M/I/E : open permission/model/effort menus.
- 1–9 : select item in an open menu.
- Cmd+Shift+\ (macOS) etc. as listed.

Accessibility observations:
- WAI-ARIA Window Splitter pattern for dividers; Tabs pattern for tab groups; keyboard-interface guidance for visible focus and predictable movement. **Tavi implementation** (ui-ux-research).
- Pointer-only drag handles are hidden from the accessibility tree; keyboard-only pane rearrangement remains an outstanding accessibility gap in Tavi (sidebar row action to open/focus a session beside the active pane remains). **Tavi status**.
- Runtime assistive-technology review remains outstanding for Tavi. **Tavi status**.

## 7. Six-pane cap behavior and cap-reached messaging

- Six is **Tavi's own** chosen maximum docked pane-instance count (including inactive tabs); it is not asserted as Claude's limit or a library's. **Tavi decision** (ui-ux-research; docking R1).
- Claude docs do not state any pane count limit. **Unverified** whether Claude has one.
- Cap-reached messaging is Tavi's own: when the cap is reached, explain how to make room and preserve the current session (e.g., on + New). **Tavi decision**.
- Count inactive tabs in the cap so a tab group cannot bypass it. **Tavi decision**.

## 8. Labeled facts: Confirmed (source URL), Likely, Unverified

**Confirmed (Anthropic docs URL)**
- Panes: chat, diff, browser, terminal, file, plan, tasks, subagent, iOS Simulator (macOS); drag by header; resize by edge; Cmd/Ctrl+\ closes focused pane. https://code.claude.com/docs/en/desktop#arrange-your-workspace
- Pop out a pane (e.g., diff/terminal) into its own window and dock it back; Claude keeps working in the main window. https://code.claude.com/docs/en/desktop#arrange-your-workspace
- Narrow window: buttons that don't fit move into the **⋮** menu; secondary panes listed once the session has something to show. https://code.claude.com/docs/en/desktop#arrange-your-workspace
- Session title bar launchers: Terminal, Changes, Browser, Files. https://code.claude.com/docs/en/desktop#arrange-your-workspace
- Session details panel appears while chat wide enough; hide/show via title bar or **⋮**. https://code.claude.com/docs/en/desktop#see-session-details
- Sessions in parallel; + New in sidebar; modifier-click / context menu for split view and new window; split view focus/dim; take focused session out with Cmd+Ctrl+W / Ctrl+Alt+W. https://code.claude.com/docs/en/desktop#work-in-parallel-with-sessions
- Version gate v1.2581.0+ for pane layout/terminal/file editor/view modes. https://code.claude.com/docs/en/desktop#arrange-your-workspace
- Terminal behavior, file pane save/auto-save, browser pane, diff view, tasks pane, view modes, keyboard shortcuts. https://code.claude.com/docs/en/desktop (sections above).

**Likely (inferred from redesign video / screenshot / Tavi reading)**
- Flat panes, hairline separators, no cards/shadows.
- Header strip: mark + title left; pop-out, chevron, close right, in that order.
- Focused pane lit; divider next to focused pane brighter.
- Session pane carries its own composer at the bottom.
- Window top strip reflects focused pane context.
- Two distinct levels (session split vs. tool panes) as framed.
- Redesign announcement's product-level claims (sidebar, drag-and-drop, terminal, file editor, rebuilt diff, expanded preview, side chat, SSH on Mac, plugin parity).

**Unverified (not documented; Tavi must decide or measure)**
- Exact visual spec (colors, spacing, type sizes, divider thickness, radii).
- Pane-header control set/order enumeration; whether Claude has a pane maximize control.
- Composer placement; focus dimming beyond split view; brighter adjacent divider.
- Which pane types can pop out; pop-out window chrome/size/dock-back mechanics.
- Drop targets/edges/tab groups exact algorithm.
- Minimum pane/window sizes; reset-layout affordance.
- Empty/loading/error state copy and behavior.
- Any pane-count cap in Claude (none documented).
- Whether Claude offers split (side-by-side) diff view (New Stack says unified only, but that's secondary).

## 9. Explicit list: where Anthropic docs are vague (must infer)
1. No visual spec at all — colors, spacing, type sizes, divider thickness, radii, shadows.
2. Pane-header controls are not enumerated; only "drag a pane by its header" is stated.
3. Maximize is not documented (Tavi addition).
4. Composer placement is not documented.
5. Focus treatment beyond split-view dimming (brighter adjacent divider) is not documented.
6. Drop targets, edges, and tab groups are not specified ("arrange in any layout").
7. Pop-out scope ("such as the diff or terminal") and pop-out window chrome/size/dock-back are unspecified.
8. Minimum pane/window sizes are unspecified.
9. Empty/loading/error states are unspecified.
10. Session creation behavior while a split is open is not prescribed ("does not prescribe the exact result of + New while a split is open").
11. Narrow-width overflow breakpoints/thresholds are not given.
12. No pane-count cap is documented.

## 10. Tavi-specific decisions (not Claude facts)
- Six-pane cap (including inactive tabs) and cap-reached messaging.
- Custom layout engine (no docking package); model in `src/lib/workspace-state.ts`.
- Four-edge + center drop zones and tab groups.
- Maximize/pop-out controls consolidated into the pane overflow menu at narrow widths.
- Sidebar drag-to-split (user-confirmed, not Anthropic-documented); modifier-click / "Open beside" offered as alternate.
- Native Tauri pop-out window with readiness/acknowledgement protocol.
- Tavi's own panes (Application Preview, Logs, Agent Activity) with sample content.
- Preservation of Tavi's shell, tokens, typography, composers; not copying Claude's native chrome pixel-for-pixel.