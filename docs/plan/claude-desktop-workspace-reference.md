# Claude Code Desktop workspace reference

Research note for matching Tavi's dockable workspace to Claude Code Desktop's Code tab. Facts are tagged **Confirmed** (Anthropic source + URL), **Likely** (inferred from the redesign video / user-confirmed screenshot / Tavi's reading of the reference), or **Unverified** (not documented; Tavi must decide or measure). Where Anthropic's docs are vague, noted in §9.

**Sources**
- Anthropic Desktop docs, "Arrange your workspace": https://code.claude.com/docs/en/desktop#arrange-your-workspace — **Confirmed** for documented behaviors below.
- Anthropic Desktop docs, "Work in parallel with sessions": https://code.claude.com/docs/en/desktop#work-in-parallel-with-sessions — **Confirmed**.
- Redesign announcement (2026-04-14): https://claude.com/resources/articles/claude-code-desktop-redesign — **Confirmed** at product level.
- User-confirmed four-session screenshot (Reddit, community): https://www.reddit.com/r/ClaudeAI/comments/1v57qfd/claude_code_desktop_app_split_screen/ and image https://preview.redd.it/claude-code-desktop-app-split-screen-v0-8boohpq4p5fh1.png?auto=webp&crop=smart&s=45b8c246e76dade55d093ce539d6cea88ce695c5&width=640 — **Likely/unverified**; a community screenshot, not an Anthropic spec. Not present in this repo, so pixel-level comparison is still outstanding.

## 1. Overall model
- Code tab is session-centric: each session is an independent conversation with its own project folder and context; the sidebar lists sessions and runs several in parallel. **Confirmed** (docs, "Work in parallel with sessions").
- Within a session, panes (chat, diff, browser, terminal, file, plan, tasks, subagent; iOS Simulator on macOS) can be arranged in any layout. **Confirmed** (docs, "Arrange your workspace").
- Two distinct levels: (a) session split — two sessions side by side, each with its own conversation; (b) tool panes within one session. **Confirmed** that both exist; the framing is Tavi's. Docs treat panes as showing a session ("To change which session a pane shows, click in that pane…").

## 2. Pane layout
- Panes are flat: no card, rounded corner, or shadow; a pane is a region of the window separated from its neighbour by a single hairline on the window's own background. **Likely** — Tavi's reading of the reference; Anthropic docs do not describe pane chrome.
- Each pane carries its own header: mark + title on the left; on the right pop-out, a chevron that opens the pane's menu, and close, in that order. **Likely** — the control set and order come from Tavi's reading of the screenshot/video; docs do not enumerate pane-header controls.
- Each pane scrolls its own content; the window and the layout region do not scroll. **Likely**.
- A session pane carries its own composer at the bottom; two session panes side by side have two composers. **Likely** — evident in the user-confirmed four-session screenshot; not stated in docs.
- The top strip of the window belongs to the window and carries the focused pane's context (session title bar with pane launchers). **Likely**.

## 3. Header controls
Session title bar (primary, session-level):
- One-click launchers: **Terminal**, **Changes** (diff), **Browser**, **Files**. **Confirmed** (docs, "Arrange your workspace").
- Secondary panes (Background tasks, Plan, etc.) appear in the adjacent **⋮** menu once the session has something to show in them. **Confirmed** (docs).
- Hide/show the session details panel via "Hide session rail" / "Show session rail" in the title bar or its **⋮** menu. **Confirmed** (docs, "See session details").

Narrow widths:
- Title-bar buttons that don't fit move into the **⋮** menu. **Confirmed** (docs, "When the window is narrow").

Pane-level header:
- Pop-out, overflow (chevron) menu, close. **Likely** (control set not enumerated in docs).
- Maximize/restore: **Unverified** — not documented by Anthropic; Tavi treats it as its own pane action. Docs do not mention a pane maximize control.

Pop-out:
- Pop a pane (docs example: diff or terminal) into its own window and dock it back; Claude keeps working in the main window. **Confirmed** (docs, "To work across screens…").
- Which pane types support pop-out is not enumerated ("such as the diff or terminal"). **Unverified** scope.

## 4. Drag / dock
- Drag a pane by its header to reposition; drag a pane edge to resize. **Confirmed** (docs, "Arrange your workspace").
- Drop targets, edges, tab groups: Anthropic docs do not specify the exact drop zones or tab-group algorithm. Tavi's four-edge + center drop zones and tab groups are a Tavi extension and must not be presented as Anthropic's. **Unverified / Tavi extension**.
- Two sessions side by side: hold Option (macOS) / Alt (Windows) and click a session in the sidebar, or right-click → Open in → Split view; hold Cmd / Ctrl and click, or right-click → Open in → New window, for a separate window. **Confirmed** (docs, "Work in parallel with sessions").
- In split view the last-opened/clicked pane has focus and the other is dimmed; click a pane to focus it, then click a session in the sidebar to change what it shows; take the focused session out of split view with Cmd+Ctrl+W / Ctrl+Alt+W. **Confirmed** (docs).
- Close the focused pane: Cmd+\ (macOS) / Ctrl+\ (Windows). **Confirmed** (docs).
- Keyboard shortcuts for panes: Cmd+Shift+D toggle diff, Cmd+Shift+B toggle browser, Ctrl+` toggle terminal. **Confirmed** (docs, "Keyboard shortcuts").

## 5. Session composer
- Per-pane composer at the bottom of a session pane; it travels with the pane. **Likely** — evident in the four-session screenshot and Tavi's reading; docs do not state composer placement. **Unverified** against docs.

## 6. Focus treatment
- Split view: the focused pane is lit and the other pane is dimmed. **Confirmed** (docs, "Work in parallel with sessions").
- The divider next to the focused pane is the brighter of the two. **Likely** — Tavi's reading of the reference; not documented by Anthropic.
- Window top strip reflects the focused pane's context. **Likely**.

## 7. Narrow window / overflow
- Title-bar launchers overflow into the **⋮** menu when they don't fit. **Confirmed** (docs).
- Session details panel appears only while the chat is wide enough. **Confirmed** (docs, "See session details").
- Minimum pane/window sizes: not documented. **Unverified** (Tavi uses a 600×338 floor per its own constraint).
- Pane content keeps independent scroll regions at narrow widths. **Likely** (Tavi reading; docs say each pane scrolls its own content).

## 8. Other relevant details
- Version gate: pane layout, terminal, file editor, and view modes require Claude Desktop v1.2581.0+. **Confirmed** (docs).
- View modes: Normal, Thinking, Verbose (Summary on older versions). **Confirmed** (docs, "Switch view modes").
- Terminal: opens in the session's working directory, shares Claude's environment; a second terminal tab via **+** in the terminal pane header or right-click folder → Open in terminal. **Confirmed** (docs, "Run commands in the terminal").
- File pane: click a path in chat; auto-save on by default; toggle Auto save in the pane's **⋮**; Save/Cancel when off; Override/Discard on disk change. **Confirmed** (docs, "Open and edit files").
- Browser pane: tabbed browser; open via Cmd+Shift+B / Ctrl+Shift+B or Browser in the title bar; external-link dialog; Keep cookies / Clear browsing data in **⋮**. **Confirmed** (docs, "Browse external sites").
- Diff view: open via line counts in the Changes card or Changes in the title bar; line comments submit with Cmd/Ctrl+Enter. **Confirmed** (docs, "Review changes with diff view").
- Session details panel cards: where the session runs, what it changed, what it's running, context usage. **Confirmed** (docs, "See session details").
- Redesign (2026-04-14): new session sidebar, drag-and-drop layout, integrated terminal + file editor, rebuilt diff viewer, expanded preview (HTML/PDF), side chat (Cmd/Ctrl+;), SSH on Mac, CLI plugin parity. **Confirmed** (announcement).
- Spacing, density, typography: no numeric spec in Anthropic docs; exact values must be measured from the live app/screenshots. Tavi should keep its own tokens rather than copy pixel values. **Unverified / absent**.

## 9. Where Anthropic docs are vague (must infer)
- No visual spec: colors, spacing, type sizes, divider thickness, radii, shadows.
- Pane-header control set and order are not enumerated (inferred from screenshot/video).
- Focus dimming of the non-focused pane is documented only for split view; the brighter adjacent divider is not documented.
- Composer placement is not documented.
- Pop-out scope ("such as the diff or terminal") and pop-out window chrome/size/dock-back mechanics are not specified.
- Drop targets, edges, and tab groups are not specified.
- Maximize control is not documented.
- Minimum pane/window sizes are not documented.
- Session creation behavior while a split is open ("does not prescribe the exact result of + New while a split is open").
- Pane launchers' overflow threshold and exact narrow-width breakpoints are not given.

## 10. Tavi-specific decisions (not Claude facts)
- Six-pane cap, custom layout engine, four-edge/center drop zones + tab groups, maximize/pop-out in overflow at narrow widths, and sidebar drag-to-split are Tavi decisions (sidebar drag is user-confirmed, not Anthropic-documented). Keep them labeled as Tavi's, not Anthropic's.