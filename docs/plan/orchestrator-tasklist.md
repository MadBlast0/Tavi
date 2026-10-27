# Tavi orchestrator task list

Owner: Tavi (orchestrator). Single source of truth for the docking-system UI/UX program.
Companion: docs/plan/ui-ux-plan.md (task tracker), docs/plan/workspace-uiux-audit.md (20 fixes), docs/plan/claude-desktop-workspace-reference.md, docs/plan/claude-desktop-full-workspace-research.md.

Protocol:
- One task per agent at a time. Forge (200k ctx) gets small single-concern slices with full context; compact between major groups.
- Tavi monitors every Forge result before routing the next slice; never queues overlapping file owners.
- Risky actions (send/pay/post/delete) require user approval; none in this program.
- After each slice: pnpm typecheck + pnpm test + pnpm build; report all three.
- After each slice: commit and push (per user request). Use repo identity (Mad Blast), no AI attribution, follow AGENTS.md commit rules (no node_modules/dist/target/.env). Commit message must be a proper descriptive name of the work done, not a task ID — e.g., "feat(workspace): unbound session panes show pane-sized start state instead of root landing" with a body listing key changes. No "WS-01", "F1", or task IDs in the subject line.

## Phase 0 — Foundation correctness (from audit)
- [x] F1 WS-01 unbound session pane start state (Forge) — DONE (431/431 tests, typecheck+build clean)
- [x] F2 WS-02 remove sample/state chrome from tool panes (Forge) — DONE (431/431 tests, typecheck+build clean)
- [x] F3 WS-03 header action order pop-out/chevron/close (Forge) — DONE (431/431 tests, typecheck+build clean)
- [x] F4 WS-04 diff container query (Forge) — DONE (431/431 tests, typecheck+build clean)
- [x] F5 WS-05/06/07 dock activation, focus, cross-group tab drag (Forge) — DONE (434/434 tests, typecheck+build clean)
- [x] F6 WS-09 header interaction focuses pane; add-view anchors (Forge) — DONE (440/440 tests, typecheck+build clean)
- [x] F7 WS-10/11 pop-out parity + legible focus (Forge) — DONE (445/445 tests, typecheck+build clean)
- [x] P2-A WS-12/13/14 stacked chrome, reflow, resize/persistence (Forge) — DONE (454/454 tests, typecheck+build clean)
- [x] P2-B WS-15/17/19/20 (Forge) — DONE (446/446 tests, typecheck+build clean)
- [x] WS-16 keyboard shortcuts implementation (Forge) — DONE (451/451 tests, typecheck+build clean)
- [x] WS-18 behavioral tests (Sentinel) — DONE (455/455 tests, typecheck+build clean)

## Phase 0 — COMPLETE (all 20 audit fixes + WS-18 done)

## Phase 1 — Chrome rework (product decision needed)
Open question: move session-name drag handle to the left sidebar (session rows draggable) and move view-launchers (Terminal/Changes/Browser/Files/overflow) into the top caption bar left of window controls as an animated dropdown, removing the in-pane launcher bar. This revises §1.9. Requires Atlas architecture note + user approval before Forge.

## Phase 2 — Per-pane content fidelity (one pane type at a time)
- Terminal pane (visual + states + local sim)
- Diff viewer (full spec §5.3)
- Browser pane (§5.4)
- Application Preview (§5.5)
- File Explorer (§5.7)
- File Editor (§5.8)
- File Preview (§5.13)
- Plan pane (§5.9)
- Tasks pane (§5.10)
- Agent Activity (§5.11)
- Logs (§5.12)

## Phase 3 — Interaction polish
- Narrow-window/overflow (WS-08/04 follow-ups)
- Pop-out streaming verification
- Keyboard/a11y full pass
- Visual polish pass

## Phase 4 — QA & handoff
- Sentinel QA matrix (audit §Sentinel QA matrix)
- Interaction QA
- Handoff note refresh

## Agent ownership
- Atlas: architecture decisions, audit, interface contracts
- Iris: research (Claude Desktop reference, per-pane behavior)
- Forge: all source edits (one slice at a time)
- Sentinel: review + behavioral tests
- Tavi: orchestration, monitoring, context management, user gates