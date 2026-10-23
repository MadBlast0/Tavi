# UI/UX Plan Research Notes

**Purpose:** Give future implementation agents a compact evidence base for the dockable workspace. This note distinguishes reference-app behavior, Tavi product decisions, implementation constraints, and claims that still require an in-app proof. It supplements `ui-ux-plan.md`; it does not replace repository inspection.

**Research checked:** 2026-10-23. Vendor documentation and product behavior can change. Recheck version-sensitive claims when a task begins.

## Product being referenced

The reference is **Claude Code in the Claude Desktop app's Code tab**, not the regular Claude Chat tab and not Claude's terminal UI. Anthropic describes its Code tab as a parallel-session workspace, with a sidebar for sessions and draggable panes for chat, diff, browser, terminal, files, plans, tasks, and subagents. The app's own feature names are “Arrange your workspace” and “Work in parallel with sessions.”

### R1 — Separate sessions in one split workspace

This is the primary behavior the product owner has confirmed. The user drags another session from the sidebar/session list into the workspace and sees a second session alongside the first; the referenced community screenshot shows four sessions. The target interaction in Tavi is therefore **drag-to-split sessions**, retaining each session's own conversation and context.

Evidence and limits:

- [Anthropic: Claude Code Desktop — Work in parallel with sessions](https://code.claude.com/docs/en/desktop#work-in-parallel-with-sessions) documents running sessions in parallel and opening a second session next to the current session by modifier-clicking the sidebar. It does not currently document sidebar drag as the way to create that split.
- [User-confirmed Claude Code Desktop screenshot and discussion](https://www.reddit.com/r/ClaudeAI/comments/1v57qfd/claude_code_desktop_app_split_screen/) explicitly shows separate threads in four split panels and describes dragging them into the workspace. Treat this as evidence of the interaction the user means, not as Anthropic's normative documentation.
- [Walkthrough: View Multiple Sessions Side-by-Side](https://note.com/odayakanushi/n/n7cccb1941cc1?hl=en) describes dragging a session from the list into the screen. The author notes behavior may vary by app version/platform and the screenshot was not retained in the article; use it as corroboration, not the only source.
- [Anthropic: Claude Code Desktop redesign](https://claude.com/resources/articles/claude-code-desktop-redesign) confirms multiple sessions and the drag-and-drop workspace at product level, without specifying the exact gesture for session splitting.

**Plan consequence:** Task 7.12 must implement the user's confirmed drag interaction in Tavi and describe it as Tavi's required behavior. Do not state that Anthropic's docs explicitly prescribe that gesture. A modifier-click or accessible “Open beside” action may be offered as an alternate, but must not replace the drag behavior.

### R2 — Dockable tool panes within a session

This is a related but distinct behavior. A session can show its chat alongside tool views such as diff, browser/preview, terminal, file editor, tasks, and plan. These are panes attached to a session context; they are not additional conversations.

- [Anthropic: Arrange your workspace](https://code.claude.com/docs/en/desktop#arrange-your-workspace) says panes can be repositioned by dragging their headers and resized by dragging pane edges. It also describes opening a pane in another window and docking it back.
- [Anthropic: Desktop redesign announcement](https://claude.com/resources/articles/claude-code-desktop-redesign) describes the terminal, preview, diff, and chat as drag-and-drop panes.

**Plan consequence:** Preserve the distinction already defined in §1.4: a session is conversation state; a pane is a view. Dragging a session creates a pane bound by session ID. Dragging an existing pane changes geometry or group membership without cloning or closing its underlying session.

## Tavi product decisions (not claims about Claude)

- Six is Tavi's chosen maximum docked pane-instance count. It is not asserted as Claude's limit or a library limit. Count inactive tabs in this cap so a tab group cannot bypass it.
- The initial workspace is desktop-first and supports nested horizontal/vertical splits. A 600 × 338 minimum window is repository/product constraint from [`docs/layout.md`](../layout.md).
- Tavi retains its own app shell, Chat/Code navigation, composers, tokens, and Lucide icon convention. Use the reference for interaction concepts; do not copy its native title bar or replace Tavi's existing design system.
- Existing live chat, provider/key availability, and session behavior must survive integration. Only pane views without a real integration use clearly labeled sample content.
- Pop-out behavior is a native Tauri window requirement for this desktop app, not something to simulate with a browser popup.

## Implementation and accessibility references

- [Tauri v2 `WebviewWindow` API](https://v2.tauri.app/reference/javascript/api/namespacewebviewwindow/) supports creating a window that hosts a webview. The create capability `core:webview:allow-create-webview-window` is not included in the default permission set. Before implementing pop-out, inspect this repository's Tauri version and capability files; add only the narrowly required permission and retain the existing main-window close behavior.
- [Tauri v2 window configuration](https://v2.tauri.app/reference/config/#windowconfig) documents unique labels for multiple windows.
- [WAI-ARIA Authoring Practices: Window Splitter](https://www.w3.org/WAI/ARIA/apg/patterns/windowsplitter/) provides the semantic and keyboard pattern for a movable separator between panes. Use its current guidance when implementing resize dividers; verify semantics with the actual UI and avoid inventing incompatible shortcuts.
- [MDN: HTML Drag and Drop API](https://developer.mozilla.org/en-US/docs/Web/API/HTML_Drag_and_Drop_API) describes drag sources, targets, feedback, and lifecycle. It is general browser API guidance, not a requirement to use native HTML drag events; compare pointer-based interaction and the app's framework before choosing an implementation.
- [Dockview documentation](https://dockview.dev/docs/) and [core concepts](https://dockview.dev/docs/core/overview/) provide a current comparison point for groups, drag-and-drop, floating/pop-out layouts, and serialization. Any candidate-library decision must be rechecked against the package version, Tauri behavior, accessibility, license, and the product's pane-header requirements.
- [shadcn/ui documentation](https://ui.shadcn.com/docs) and the installed component implementations remain secondary to the repository's actual Base UI/shadcn setup. Use the exact primitive family in the repository rather than importing components from a documentation example for another primitive family.
- [Lucide React guide](https://lucide.dev/guide/react/) aligns with the repository's AGENTS.md icon rule.

## Research-to-task map

| Plan task(s) | Research to consult | What the research does and does not establish |
|---|---|---|
| 0.1–0.4 | Repository files; `docs/architecture.md`; `docs/layout.md`; Dockview docs; React resizable wrapper | Repository inspection decides the baseline. Candidate docs establish available capabilities, not which choice is right for Tavi. |
| 1.1–1.5 | `src/index.css`; current shared components; `docs/architecture.md`; `docs/layout.md`; workspace-state implementation/tests | Tavi source is authoritative for tokens, component APIs, state ownership, and sizing. Do not cite removed notes. |
| 2.1–2.3 | Current app shell and session flow; R1; `docs/layout.md` | Preserve working route/session transitions; reference interaction is separate-session split. |
| 3.1–3.5, 4.1–4.5 | Installed shadcn/Base UI primitives and Lucide; WAI-ARIA APG for relevant widgets | Prefer installed components and their actual APIs; APG informs accessibility, not visual styling. |
| 5.1–5.15 | Existing product behavior for Chat/Code; R2; source-specific docs only for a real feature | Pane mock content must be identified as sample; preserve real session data paths. Tool-pane references do not prove terminal/file/browser functionality exists in Tavi. |
| 6.1–6.6, 7.1–7.11 | Dockview capability docs; WAI-ARIA window splitter; MDN drag-and-drop; app-owned state model | Verify structural invariants, pointer/keyboard behavior, save/restore, and drop preview. Six-pane cap and presets are Tavi decisions. |
| 7.12 | R1 and Anthropic parallel-sessions docs | Implement drag-to-split as the user-confirmed target; official docs independently support side-by-side sessions, but specify modifier-click instead. |
| 7.13 | Tauri v2 WebviewWindow/config/permissions docs and repository capability config | Native pop-out is feasible only with the right Tauri API/version and permission. A browser popup is not equivalent. |
| 8.1–8.5, 9.1–9.2 | WAI-ARIA APG; `docs/layout.md`; original user screenshots if available; app's existing checks and README | QA should report tested behavior and unavailable evidence. Do not assert screenshot comparison if reference images are absent. |

## Claims to avoid repeating without verification

- Do not call “drag a session from the sidebar” an Anthropic-documented gesture; attribute it to the user-confirmed screenshot and walkthrough.
- Do not say a pane pop-out feature in a React docking library automatically provides native Tauri windows or reliable cross-window state sharing.
- Do not call a library's theme hooks a second design system without checking the exact version and whether headers/content can be fully customized. Treat visual control as an evaluation criterion, not a proven blocker.
- Do not claim a hard limit of six comes from Claude. Six is Tavi's own product limit.
- Do not treat removed plan artifacts as available references. The current source files and this research note are the durable context.
