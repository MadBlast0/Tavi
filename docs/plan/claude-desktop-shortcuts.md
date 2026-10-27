# Claude Code Desktop — workspace keyboard shortcuts (WS-16 research)

Scope: which shortcuts Claude Code Desktop ships for the docking/workspace system, what Tavi already binds, conflicts, and a recommendation. Facts tagged **Confirmed** (Anthropic source + URL), **Likely** (video/screenshot/Tavi reading), or **Unverified** (not documented).

**Sources**
- Anthropic Desktop docs, "Arrange your workspace" + "Keyboard shortcuts": https://code.claude.com/docs/en/desktop#keyboard-shortcuts — **Confirmed** for all listed Claude shortcuts.
- Redesign announcement: https://claude.com/resources/articles/claude-code-desktop-redesign — **Confirmed** at product level.
- Official product video (YouTube id `rWaQSQEm_aY`) — **Likely** for any motion not in docs.
- User-confirmed four-session screenshot (Reddit, community) — **Likely/unverified**; no shortcut info in it.
- Tavi source: `src/` keydown handlers and hotkey constants (`SETTINGS_HOTKEY`, `PALETTE_HOTKEY`, sidebar `mod+b`, splitter keys, dictation `ctrl+shift+d`), plus `AGENTS.md`. **Confirmed** for Tavi's own bindings.

## 1. What Claude Code Desktop actually ships

From the docs keyboard-shortcuts table (all **Confirmed**):

| Shortcut (macOS / Windows) | Action |
| --- | --- |
| `Cmd+\` / `Ctrl+\` | Close focused pane |
| `Ctrl+Tab` / `Ctrl+Shift+Tab` | Switch between sessions |
| `Cmd+Shift+]` / `Cmd+Shift+[` | Next / previous session |
| `Cmd+Shift+D` | Toggle diff pane |
| `Cmd+Shift+B` | Toggle Browser pane |
| `Cmd+Shift+S` | Select an element in the Browser |
| `` Ctrl+` `` | Toggle terminal pane |
| `Cmd+Ctrl+W` / `Ctrl+Alt+W` | Take focused session out of split view |
| `Cmd+;` / `Ctrl+;` | Open side chat |
| `Cmd+/` / `Ctrl+/` | Show keyboard shortcuts |
| `Cmd+N` / `Ctrl+N` | New session |
| `Cmd+W` | Close session |
| `Esc` | Stop Claude's response |
| `Tab` / `Right arrow` | Accept suggested prompt (empty box) |
| `Ctrl+O` | Cycle view modes |
| `Cmd+Shift+M/I/E` | Open permission / model / effort menus |
| `1`–`9` | Select item in an open menu |

Notes:
- "Focus cycling" in Claude is session-level (`Ctrl+Tab` switches sessions), not pane-level. **Confirmed**.
- Split left/right/top/bottom: **no dedicated shortcut documented**. Splitting is done via sidebar modifier-click or the session context menu. **Unverified** whether a shortcut exists in-app.
- Pop out a pane: **no shortcut documented** (button/menu only). **Unverified**.
- Maximize/restore a pane: **no shortcut documented**. **Unverified**.
- Add view (open a pane): **no shortcut documented** beyond the title-bar buttons / overflow menu. **Unverified**.
- Reset layout: **no shortcut documented**. **Unverified**.
- The docs note `Shift+Tab` does not cycle permission modes in Desktop (unlike the CLI). **Confirmed**.

## 2. Tavi's existing keyboard bindings

> This is the pre-WS-16 audit. Dictation's default has since moved to `Ctrl+Shift+M`; see §5.

Found by searching `src/` for keydown handlers and hotkey constants (**Confirmed**):
- `mod+,` (Ctrl/Cmd+,) — open Settings. `src/blocks/shell/settings-dialog.tsx` (`SETTINGS_HOTKEY`).
- `mod+k` (Ctrl/Cmd+K) — command palette. `src/lib/open-palette.ts` (`PALETTE_HOTKEY`).
- `mod+b` (Ctrl/Cmd+B) — toggle sidebar. `src/components/sidebar/sidebar.tsx`.
- `mod+Enter` — submit prompt (when submitOn is mod+enter). `src/blocks/prompt-input/prompt-input.tsx`.
- `Enter` — submit prompt (default). Same file.
- `ctrl+shift+d` — dictation toggle (default). `src/blocks/prompt-input/prompt-controls.tsx` (`PromptInputDictation` default `shortcut`).
- Splitter keys: `Home`/`End`/`ArrowLeft`/`ArrowRight`/`ArrowUp`/`ArrowDown` (with Shift for larger step) on focus. `src/blocks/workspace/layout/layout-tree.tsx`.
- Tab-group keys: Left/Right/Home/End roving focus, Delete to close (WAI-ARIA Tabs). `src/blocks/workspace/layout/tab-group.tsx` (per ui-ux-research).
- `Escape` cancels an in-progress divider drag. `layout-tree.tsx`.

No existing Tavi binding for `Ctrl+\`, `Ctrl+Shift+B/D`, `` Ctrl+` ``, `Ctrl+;`, `Ctrl+O`, or `Ctrl+Tab` session switching was found. **Confirmed** by search.

## 3. Conflicts

- **`Ctrl+Shift+D` (Claude: toggle diff pane) vs. Tavi dictation** (`ctrl+shift+d` default in `PromptInputDictation`). Direct conflict. **Confirmed**.
- `Ctrl+Shift+B` (Claude: toggle browser pane) vs. Tavi `mod+b` (sidebar toggle): different modifiers (Shift vs. none) and different targets, so not a hard collision, but conceptually adjacent and may confuse users accustomed to Claude. **Likely** risk.
- `Ctrl+\` (Claude: close focused pane): no Tavi binding found; safe to adopt. **Confirmed** no conflict.
- `` Ctrl+` `` (Claude: toggle terminal pane): no Tavi binding found; safe. **Confirmed** no conflict.
- `Ctrl+;` (Claude: side chat): Tavi has no side-chat shortcut; safe. **Confirmed** no conflict.
- `Ctrl+Tab` (Claude: switch sessions): Tavi's sidebar/tab components may consume Tab for focus; adopting session switching on Ctrl+Tab could fight component tabbing. **Likely** risk; needs testing.
- `Ctrl+O` (Claude: cycle view modes): Tavi has no binding; but `Ctrl+O` is a common "open file" shortcut in other apps. **Likely** low risk for Tavi.

## 4. Recommendation (Tavi decision)

Adopt (no conflict, high value):
- **Close focused pane: `Ctrl+\`** (Cmd+\ on macOS). Directly addresses WS-16 ("no close-focused-pane shortcut"). No existing binding. **Recommended**.
- **Toggle terminal pane: `` Ctrl+` ``**. Matches Claude; no conflict. **Recommended**.
- **Toggle diff pane: `Ctrl+Shift+D`** — but only after resolving the dictation conflict. Either rebind dictation to a different key (e.g., `Ctrl+Shift+M` or a button-only trigger) or skip. **Recommended with condition**.
- **Toggle browser pane: `Ctrl+Shift+B`**. No hard conflict with `mod+b`; document both. **Recommended**.
- **Open side chat: `Ctrl+;`** if/when Tavi ships side chat. **Recommended (conditional on feature)**.
- **Cycle view modes: `Ctrl+O`** if Tavi ships view modes. **Recommended (conditional)**.

Skip or defer:
- `Ctrl+Tab` session switching — conflicts with component tabbing; Tavi already has sidebar session navigation. **Skip for now** (or scope to when sidebar focused).
- `Ctrl+Shift+S` (select element in browser) — only meaningful once browser element-selection exists in Tavi. **Defer**.
- Split/pop-out/maximize/add-view/reset shortcuts — Claude ships none documented; do not invent global shortcuts for these without a product decision (per WS-16 and ui-ux-plan §3). Provide them via menus/buttons and divider/tab keyboard support instead. **Skip inventing**.
- `Cmd+/` show-shortcuts overlay — nice-to-have; defer unless a shortcut help surface is built.

Tavi-specific additions that don't conflict:
- Close-focused-pane (`Ctrl+\`) and focus cycling between panes (e.g., `Ctrl+Shift+[` / `]` or `F6`) reachable without a pointer, to satisfy WS-16 and accessibility. Ensure they don't collide with Claude's next/prev session (`Cmd+Shift+]`/`[`); using `F6` for pane focus avoids that. **Recommended**.
- Keep splitter and tab-group keyboard support (already present) and expose focused pane to AT (WS-17).

Bottom line: adopt `Ctrl+\`, `` Ctrl+` ``, `Ctrl+Shift+B`, and (after rebinding dictation) `Ctrl+Shift+D`; defer the rest; do not invent split/pop-out/maximize shortcuts. The conflict check is documented in this file, and §5 records the implementation.

## 5. Implemented in WS-16

The bindings live in `src/blocks/workspace/workspace-shortcuts.ts`, and `WorkspaceLayout` mounts one window listener for the region. A pane window has no arrangement to rearrange, so it does not mount the listener.

| Shortcut (macOS / Windows) | Action |
| --- | --- |
| `Cmd+\` / `Ctrl+\` | Close the focused pane. The existing close handler chooses the surviving pane and puts focus on its title or tab. |
| `` Ctrl+` `` (both platforms) | Focus an open Terminal, or open one beside the focused pane. |
| `Cmd+Shift+B` / `Ctrl+Shift+B` | Focus an open Browser, or open one beside the focused pane. |
| `Cmd+Shift+D` / `Ctrl+Shift+D` | Focus an open Diff Viewer, or open one beside the focused pane. |
| `F6` / `Shift+F6` | Focus the next / previous visible pane in layout order, wrapping at the ends. |

Decisions and conflict resolution:

- **Dictation moved from `Ctrl+Shift+D` to `Ctrl+Shift+M`** in `src/blocks/prompt-input/prompt-controls.tsx`. That was the only hard collision. `Ctrl+Shift+M` is Claude's model-menu shortcut, but Tavi has no model menu and the key was unbound here. The dictation button and its tooltip still show the key.
- **`Ctrl+B` stays the sidebar toggle.** `Ctrl+Shift+B` is a different chord and targets the Browser pane. The two are documented together in the shortcut table above.
- **"Toggle" means focus-or-open, not show/hide.** If a pane of that type is already open, the shortcut brings it (and its tab) forward. It never closes that pane, because the same key would discard pane-local state; `Ctrl+\` remains the explicit close. This also stops repeated presses from stacking duplicate terminals or browsers.
- **`Ctrl+Tab` is not adopted.** It would fight component tabbing and Tavi already has sidebar session navigation. `F6`/`Shift+F6` is the pane-level focus route and does not collide with Claude's bracket-key session switching.
- **Split, pop-out, maximize, add-view and reset have no shortcut.** Claude documents none, so none is invented. They remain on the pane header and menu.
- The listener ignores key repeats, IME composition, `defaultPrevented` events, open menus/listboxes/dialogs, and the disabled workspace. `F6` focuses the pane title, its tab in a group, or the labeled pane region; focusing a different pane leaves a maximized view so the target is actually visible.
- Toolbar discovery: the pane menu prints the close chord, and the Views overflow menu prints the Terminal/Browser/Diff chords on the entries it holds (which is where those views move in a narrow pane). The three common view buttons keep their short labels.
- **Desktop is the target.** A browser build may lose `Ctrl+Shift+B` (bookmarks bar), `Ctrl+Shift+D` (bookmark all tabs) or `F6` (address-bar focus) before the page sees them. The Tauri webview has no browser chrome, so all six bindings reach the workspace there. The in-pane tab, menu and splitter keyboard routes remain available in the browser regardless.