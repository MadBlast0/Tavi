# AI Desktop App — Master Product, UX, Architecture & Implementation Specification

**Document version:** 4.0 — complete rewrite  
**Status:** Proposed implementation baseline; repository audit required before coding  
**Intended project:** `C:\Users\Mad\Desktop\ai-app` (confirm the actual path during audit)  
**Primary target:** Desktop-first AI chat application with Chat and Agent modes  
**Source of context:** The supplied `ai-app-master-plan.md`, plus the user's clarification that a working partial UI already exists for messaging, folder selection, local-model selection, and Chat/Agent mode.  
**Technology baseline from the source plan:** Vite, React, TypeScript, Tailwind CSS v4, Tauri v2, assistant-ui, AI SDK, OpenRouter, and a separate Node chat backend. Every package and version must be verified from the repository before implementation.

---

## How this specification must be used

This document replaces the previous plan. It is not a patch list and must not be treated as evidence that every feature described in the old plan was implemented correctly.

The repository is the source of truth for current implementation. The user's description is the source of truth for the intended product direction. The old plan is useful context, but its completion claims are unverified until the corresponding code and behavior are inspected.

The coding agent must work in small, reviewable stages. At the start of each stage it must inspect the existing implementation, identify the smallest safe change, preserve working behavior, implement only the stage's scope, run the relevant checks, and report concrete evidence. It must not attempt to implement the entire document in one pass.

When the actual repository conflicts with a detail in this document, the coding agent must not silently guess. It must record the mismatch, state the safest option, and either resolve it from existing project conventions or ask for a decision if the choice changes product behavior, data handling, security, or architecture.

### Requirement language

- **MUST / MUST NOT:** required for correctness, privacy, security, or acceptance.
- **SHOULD / SHOULD NOT:** expected default unless a documented reason justifies a deviation.
- **MAY:** optional or deferred capability.
- **Verified baseline:** confirmed by inspecting the current repository or reproducing behavior.
- **User-reported baseline:** described by the user but not yet independently audited.
- **Target behavior:** required end state; not a statement that the feature currently exists.

---

# 1. Product charter

## 1.1 Product goal

Build a polished, reliable, desktop-first AI application that supports normal conversational chat and a separate agent workflow, exposes model choice honestly, can work with an explicitly selected local folder, and uses purpose-built UI components rather than dumping internal agent machinery into the conversation.

The product should feel like a cohesive application, not a developer demo wrapped around a chat stream. It needs clear separation between conversation content, user controls, agent activity, tool results, settings, and diagnostics.

## 1.2 Core user jobs

1. Start a conversation and receive a streamed answer.
2. Select the model that will answer, including a configured local model where supported.
3. Switch intentionally between **Chat** and **Agent** behavior.
4. Add files to a message when the selected model and attachment pipeline support them.
5. Select a local workspace folder and let approved tools inspect only permitted content within that workspace.
6. Understand what the agent is doing, whether it is waiting for permission, whether a tool succeeded, and what the final answer means.
7. Configure provider credentials, model preferences, theme, and tool permissions without exposing secrets.
8. Recover from errors, stop a run, retry, and retain a clear account of what completed versus what failed.

## 1.3 Product promise

The application must never imply that a capability works when the selected model, adapter, permissions, or runtime cannot actually perform it. Tool support, attachments, local-model connectivity, and filesystem access must be capability-gated and tested end-to-end.

## 1.4 Product non-goals for the first stable iteration

Unless repository evidence shows a working implementation and the user explicitly wants to retain it, do not add these merely because they are common in AI products:

- User accounts, multi-user collaboration, cloud synchronization, or a hosted database.
- Public MCP marketplace or arbitrary third-party plugin installation.
- Autonomous shell execution, arbitrary code execution, file writes, file deletes, or terminal access.
- Background agents that run without a visible active task.
- Voice, dictation, audio generation, image generation, or video understanding without complete adapters and suitable UI.
- A custom UI framework that replaces the existing component library.
- A full packaging/distribution pipeline until the local development architecture is understood and stable.

These may enter a future roadmap only after a separate scope decision.

---

# 2. Baseline reconciliation and repository audit

## 2.1 User-reported current state

The user reports that the following basic application area has already been built:

- A way to send messages and chat with an AI.
- Model selection, including local-model selection.
- A folder-selection workflow.
- Chat mode and Agent mode.
- A composer with a model-name control, an attachment/add control, a send control, and related actions.
- A collection of prebuilt UI/UX components the user wants to reuse.

The visual quality, component inventory, exact model adapter, folder permissions, backend boundary, runtime configuration, tool registration, and completeness of the remaining features have not been verified in this specification.

## 2.2 Claims from the old plan that require verification

The old plan claims that a Node chat backend runs on port `8787`, that the app uses a particular assistant-ui runtime and AI SDK version, that a small set of tools exists, that the OpenRouter catalog and reasoning effort are wired, and that OS credential storage work was implemented. These are **audit targets**, not trusted facts.

The old plan also says conversation persistence and attachment adapters are deferred, packaged desktop builds are not yet ready, native filesystem tools are path-confined, and approval gates were deferred. Verify all of these rather than assuming they remain true.

## 2.3 Mandatory audit before source changes

The first coding task is read-only except for an audit report. It must inspect:

- The complete project tree, with a special focus on `package.json`, the lockfile, Vite configuration, TypeScript configuration, Tailwind configuration, Tauri configuration, Rust command registrations, Tauri capabilities/permissions, backend startup, environment variables, and all chat-related components.
- The actual versions of React, Vite, TypeScript, Tailwind, Tauri, assistant-ui, the AI SDK, provider packages, icon packages, and UI primitives.
- All prebuilt, vendored, generated, or locally authored UI components. Record their locations, intended use, prop APIs, variants, and any warnings about editing generated files.
- The current message lifecycle from composer submission through transport, model invocation, tool execution, streaming, and final message rendering.
- How Chat and Agent modes differ in state, system instructions, available tools, and request payloads.
- How model selection changes the actual outgoing request and what happens when a local model is chosen.
- How a selected folder is stored, whether it is a workspace root or a one-time picker result, and which Rust commands can read it.
- Whether tool schemas, arguments, tool-call IDs, results, and errors are rendered by assistant-ui, custom components, plain text, logs, or more than one path.
- Whether tool output or runtime event objects are accidentally concatenated into assistant message text.
- Current secret handling, local backend binding, CORS/origin checks, request authentication, and logging redaction.
- Current scripts for type checking, linting, unit tests, integration tests, and desktop builds.

### Required audit report

The report must include:

1. A component inventory table with `component`, `file`, `purpose`, `reuse status`, `API notes`, and `risk if changed`.
2. A feature matrix with `feature`, `current state`, `evidence`, `known defect`, and `recommended next action`.
3. A data-flow diagram from UI to backend/model/tool and back.
4. A list of verified regressions and non-regression checks.
5. A list of discrepancies between the old plan, the user-reported state, and the repository.
6. A recommended implementation order, with no source changes made during the audit stage.

The coding agent must not claim a feature is verified merely because a corresponding file exists. It must trace the code path and run a focused behavior check where feasible.

---

# 3. Product and engineering principles

## 3.1 Preserve working behavior

Before modifying shared runtime, transport, composer, or message components, capture the current working baseline. Every stage must preserve ordinary text streaming, sending, model selection, folder selection, mode switching, stop/cancel behavior if present, and theme behavior if present.

## 3.2 Reuse before creating

Existing project components are the default choice. Before authoring a new button, popover, command menu, dialog, tooltip, dropdown, badge, card, input, or message primitive, search the component inventory. Extend an existing component using its supported variants when appropriate.

Do not import a second component library to solve a small styling issue. Do not duplicate an existing abstraction because the coding agent finds it easier than learning the current API.

## 3.3 Separate content from control and diagnostics

The conversation thread is for user-visible conversational content and useful task activity. Model settings, provider setup, tool permissions, developer diagnostics, and raw protocol payloads belong in their own surfaces.

Raw tool schemas, tool-call JSON, internal function names, framework event objects, authorization headers, stack traces, and backend log lines MUST NOT be appended to ordinary assistant prose.

## 3.4 Capability honesty

A feature can only be selectable when the full path exists: UI support, request representation, backend/provider support, runtime handling, result rendering, permissions, and relevant tests. If a feature is unavailable, show a disabled state with a clear reason or hide it from a picker, depending on the context. Do not create a fake successful result.

## 3.5 Least privilege

Tools should receive the minimum data and permissions needed. A model must not gain access to arbitrary local paths because the user selected a workspace folder. No filesystem operation should occur outside an approved root, and sensitive operations need explicit user authorization.

## 3.6 One source of truth

Each concern has one authoritative state owner. Do not store one model selection in the composer, another in the runtime, and a third in the backend without an explicit synchronization contract. Do not duplicate the port, API base URL, tool registry, capability flags, or theme state in multiple unrelated places.

## 3.7 Evidence-based implementation

Every implementation stage must end with test results and a list of files changed. Unsupported assumptions must be labelled. When package documentation differs from the installed version, follow the installed version and its compatible documentation rather than copying an example from a newer release.

---

# 4. Scope and release boundary

## 4.1 Core product scope

The first coherent release should cover:

- Main application shell and navigation around the existing chat experience.
- Clear composer and message-thread behavior.
- Distinct Chat and Agent modes.
- Correct model selection for supported hosted and local model paths.
- Correct tool-call execution and tool-specific UI rendering in Agent mode.
- Explicit folder/workspace selection and constrained filesystem access.
- Model capability discovery, filtering, and honest capability labels when the current backend supports it.
- Settings for provider connection, credential entry, model defaults, theme, and tool permissions where applicable.
- Reliable streaming, errors, stop/cancel, and retry.
- Security, accessibility, performance, and regression tests for all supported paths.
- Documentation explaining setup, architecture, configuration, and known limits.

## 4.2 Explicitly deferred unless audit shows completion and tests support it

- Durable conversation history across restarts.
- Attachments that require multimodal or file adapters not currently implemented.
- Destructive filesystem operations.
- Arbitrary shell/terminal execution.
- Public-facing packaged distribution if the Node backend is not correctly bundled or hosted.
- Voice/audio/video capabilities.
- Remote synchronization and user accounts.

Deferred does not mean forgotten. Each deferred feature should have a specific entry in the future roadmap, with prerequisites and a reason it is not in the current release.

## 4.3 Definition of “implemented”

A feature is implemented only when:

1. Its UI is reachable and correctly located.
2. Its state and request wiring are correct.
3. Its success, empty, loading, disabled, cancellation, and failure states are designed.
4. It has the required authorization and data-boundary controls.
5. The feature works in the target desktop environment or reports unsupported behavior honestly.
6. Its acceptance criteria and applicable regression tests pass.
7. Documentation describes any remaining limitation.

A component that renders without being connected to the real runtime is not implemented. A tool that appears in a tool registry but cannot complete a round trip is not implemented. A model listed in a picker but unable to use the displayed capability is not implemented.

---

# 5. Target architecture and boundaries

> Preserve the existing high-level stack unless the audit demonstrates a concrete blocker. Do not refactor framework, runtime, or backend boundaries for aesthetic reasons.

## 5.1 Intended logical layers

### A. Desktop shell

Responsibilities:

- Create the desktop webview and application lifecycle.
- Own privileged operating-system integrations through explicitly registered Rust commands.
- Provide secure storage for credentials if the required Tauri plugin or keyring integration is actually present and supported.
- Enforce the Tauri v2 capability/permission model.
- Expose only narrow, validated commands to the frontend.

It must not become an unrestricted bridge that lets model-generated values call arbitrary operating-system functionality.

### B. Frontend application

Responsibilities:

- Application navigation and responsive layout.
- Chat/Agent mode controls and current selection state.
- Composer, message transcript, tool activity renderers, and user-facing errors.
- Model picker and capability presentation.
- Attachment staging and workspace selection UI.
- Settings and confirmation dialogs.
- Calling approved Tauri commands through the existing project integration.

The frontend is not the security authority for filesystem access. Rust must repeat all security-relevant validation.

### C. Chat runtime and transport

Responsibilities:

- Submit normalized message history and run configuration.
- Stream typed events back to the UI.
- Carry cancellation and request/run identifiers.
- Preserve correct message-part structure rather than flattening everything into strings.
- Coordinate tool calls, tool results, approvals, and final assistant output using the API supported by the installed runtime version.

### D. Node chat backend, if retained

The original plan describes a separate Node process. Verify it. If retained, it should:

- Bind to loopback only, never all network interfaces, for local desktop use.
- Validate request shape, model configuration, origin, and any local request token.
- Call the selected provider using a server-held or securely forwarded credential.
- Apply model capability gates, tool-loop limits, timeouts, cancellation, output limits, and logging redaction.
- Expose minimal, documented endpoints, such as chat, model catalog, provider/key status, and health.
- Avoid becoming an open local proxy for arbitrary websites or arbitrary provider calls.

If production credential flow requires the webview to forward a credential to the backend, the transfer must be short-lived/in-memory, sent only to the authenticated loopback endpoint, excluded from browser storage, excluded from logs, and covered by a threat-model note. A future move of provider calls into Rust may be evaluated separately; do not change to that architecture during a UI-only stage.

### E. Provider/model adapters

The hosted provider path and the local-model path must use a normalized application contract. Provider-specific details should not leak into the composer or every message component.

The local-model adapter, protocol, endpoint, and health checks are unknown until the repository audit. Do not assume a specific local server (for example, Ollama or a compatible OpenAI endpoint) without repository evidence.

## 5.2 Required request path

The intended high-level path is:

1. User submits a composer payload.
2. Frontend validates local UI state and creates a unique request/run identifier.
3. Runtime builds a normalized request containing messages, selected model identity, mode, supported options, staged attachments, workspace context if authorized, and enabled tool definitions allowed for that mode.
4. Transport sends the request to the correct backend/provider adapter.
5. Backend validates request configuration and removes unsupported parameters.
6. Model emits text and/or structured tool calls.
7. Runtime validates the tool call, checks mode, capability, permission, and approval requirements, and executes only the registered tool.
8. Tool result returns as a typed tool-result part associated with the matching tool-call ID.
9. Runtime continues the model loop only within defined limits and stops when the model finishes, user cancels, an approval is required, or a bounded stop condition is reached.
10. UI renders user-visible text and dedicated activity/result components in the correct order.
11. Run state becomes completed, cancelled, failed, or needs-approval; it must never remain indefinitely “running.”

## 5.3 Architecture diagrams

The audit must replace this conceptual diagram with actual filenames and actual call paths:

```text
┌────────────────────────────── Frontend / WebView ──────────────────────────────┐
│ App Shell → Chat/Agent Mode → Composer → Runtime / Transport                   │
│      │                                  │                                      │
│      ├─ Model Picker / Settings         ├─ Transcript / Message Parts           │
│      ├─ Workspace Picker                └─ Tool Activity Renderers              │
│      └─ Attachment Staging                                                     │
└───────────────────────────────┬────────────────────────────────────────────────┘
                                │ validated request + typed stream
                 ┌──────────────┴─────────────────┐
                 │                                │
          Local Node Backend                Tauri Rust Commands
          (if retained)                      (privileged OS boundary)
                 │                                │
       Hosted Provider Adapter            Approved Workspace Roots
       or Local-Model Adapter              List / Read Operations
                 │                                │
                 └──────────────┬─────────────────┘
                                │ typed model/tool results
                         Runtime / UI renderer
```

This is a logical design, not permission to route every tool through every layer. Each tool must have one explicit execution location and a documented reason.

## 5.4 Endpoint and configuration discipline

If the Node backend exists:

- Define the port and base URL in one documented configuration source. Do not maintain separate conflicting port constants in the server and Vite proxy.
- Document defaults and behavior when configuration is unset.
- Validate environment variables at startup and fail with a clear message for invalid values.
- Provide a health endpoint that reports readiness and active adapter/model metadata without returning credentials.
- Avoid returning provider raw payloads to the frontend if only a small normalized projection is needed.
- Include graceful startup/shutdown and cancellation cleanup.

## 5.5 Current package-version rule

At implementation time, read exact versions from the lockfile. Verify each API used—particularly stream loop control, assistant-ui tool registration/rendering, frontend tool execution, and Tauri permissions—against the documentation for those exact major versions. Do not blindly copy current online examples into a repository that may use a different major release.

---

# 6. Application information architecture

## 6.1 Primary application surfaces

The product should have a stable hierarchy. The exact visual arrangement must be mapped to existing components and approved patterns during audit, but responsibilities are fixed:

1. **Application shell:** app-level navigation, workspace/conversation controls if already supported, global settings entry point, and theme-aware layout.
2. **Conversation header:** conversation identity when available, active model identity, current mode, and optional conversation actions.
3. **Message transcript:** user messages, assistant answers, useful rendered artifacts, and inline tool activity appropriate to the current run.
4. **Composer:** message input and directly related actions only.
5. **Model picker surface:** searchable model list, provider grouping, local/hosted distinction, capability indicators, and selection status.
6. **Workspace surface:** explicitly selected folder/root, change/clear action, and access scope explanation.
7. **Settings surface:** provider credentials and status, model defaults, theme, tool permissions, and diagnostics where applicable.
8. **Approval dialog/surface:** explicit pending decision for a tool that requires permission.
9. **Error/empty/loading states:** purpose-built UI, not raw exceptions or protocol output.

Do not force every responsibility into one dropdown, one crowded composer row, or one giant settings dialog.

## 6.2 Main chat layout

The chat layout must:

- Give the transcript the dominant space.
- Keep the composer anchored to the bottom of the conversation region without covering the newest message.
- Preserve usable width at common desktop window sizes.
- Handle an empty chat, short chat, long chat, expanded tool output, and expanded reasoning/output blocks without permanent layout jumps.
- Keep the active run's status visible near the conversation rather than putting technical state in the message body.
- Provide an intentional empty state with one clear starting action; do not add decorative controls that have no working behavior.

## 6.3 Composer control placement

Composer controls belong to the composer only when they directly affect the outgoing message or the immediate generation configuration.

- **Model control:** compact trigger showing the selected display name and enough context to distinguish local versus hosted model where necessary. The trigger opens the full picker; it is not itself the full picker.
- **Attachment/add control:** opens the existing file-selection interaction or a small action menu for supported attachment/workspace operations. Do not make it an unlabelled dumping ground for unrelated features.
- **Message input:** grows up to a defined maximum height, then scrolls internally while preserving keyboard input behavior.
- **Send/stop control:** sends when idle; switches to a clearly labelled stop/cancel affordance while a run is cancellable. Disabled state must be visually distinct and accessible.
- **Mode selection:** Chat/Agent must be clearly visible and easy to change, but must not be confused with the model picker or attachment controls.
- **Optional controls:** reasoning effort, web search, or other advanced parameters should be surfaced only when supported and useful. Avoid showing permanent controls for unsupported options.

Any additional icons must have a defined action, accessible name, tooltip where appropriate, disabled state, and tests. Remove placeholder buttons that do nothing.

## 6.4 Model picker UX

The picker must use the project's existing popover/command-menu/dialog primitives where suitable.

Required capabilities:

- Search by display name and model identifier.
- Group hosted models by provider when provider metadata is available.
- Show local models in a clearly separate section or identify them with an explicit local badge/label.
- Show selection state and useful capability signals as text/icons with accessible names, not colour alone.
- Filter to free hosted models by default if this remains the product's intended cost policy; give users an explicit way to reveal paid models rather than silently mixing them in.
- Label experimental routing models accurately when they may route to a different underlying model per request.
- Hide or disable unsupported modalities and tool capability options.
- Preserve keyboard navigation, type-ahead/search, Escape-to-close, and focus restoration.
- Provide loading, stale-cache, empty-result, and catalog-failure states.
- Avoid rendering hundreds of expensive item components when virtualization/windowing is justified by actual performance measurements.

The active selection must be reflected in the outgoing request. A visual selection without request wiring fails acceptance.

## 6.5 Workspace UI

The user must be able to tell:

- Whether a workspace folder is selected.
- Which folder is currently authorized.
- What the agent can do within that folder (initially list/read only, if these tools remain in scope).
- How to change or clear the workspace.
- When an operation requests access outside the current scope and why it is rejected.

Do not use the folder picker as a generic implicit permission to read the entire machine. Folder selection is not consent to upload every file to a remote provider; remote transmission requires a separate disclosure/confirmation path when sensitive local content may be sent.

## 6.6 Settings UX

Settings must be discoverable without cluttering the chat composer. Use clear sections such as:

- Provider connection and credential status.
- Default hosted model and local-model endpoint/configuration, if supported by the existing adapter.
- Model filtering and generation preferences.
- Theme preference.
- Agent tools and workspace access.
- Diagnostics/log location and safe troubleshooting information.

Secrets must never be shown again in full after save. Use masked display and clear edit/replace/remove actions. Do not build a fake settings screen that persists values only in React state while implying that they survive restart.

---

# 7. Component inventory and UI implementation rules

## 7.1 Inventory first

The coding agent must create a component catalog before larger UI changes. The catalog should identify:

- Shared primitives (buttons, inputs, popovers, dropdowns, dialogs, scroll areas, tooltips, toggles, command menus, cards, skeletons, and separators).
- Chat-specific components (thread, message, assistant/user content, composer, message attachments, reasoning block, tool renderer, and status indicators).
- Application-specific components (model selector, workspace picker, provider settings, theme toggle, and approval UI).
- Generated/vendor components versus hand-authored components.

## 7.2 Component selection order

For each UI requirement:

1. Find a matching existing component.
2. Inspect its real API and usage examples.
3. Reuse it directly if appropriate.
4. Extend a variant or wrapper if the gap is small and the new API remains coherent.
5. Create a new component only if the inventory confirms a real missing abstraction.
6. Document any change to a generated component and prefer external styling when that is robust.

## 7.3 Styling rules

- Use existing design tokens and theme variables instead of scattered raw colour values.
- Avoid `!important`, unlayered overrides, arbitrary selectors, or specificity battles unless a narrowly justified integration requires them; document why and add a regression check.
- Do not add style changes to solve a geometry problem until actual measurements confirm the defect.
- Do not change correct centering, padding, or hit targets based on visual impression alone; inspect both the icon bounds and button box.
- Avoid permanent scrollbar gutters or layout hacks that contradict the intended overflow behavior.
- Test surfaces, borders, shadows, focus rings, hover/pressed/disabled states, and selection indicators in both light and dark themes if both themes are supported.
- Keep motion subtle, purposeful, and compatible with reduced-motion preferences.

## 7.4 Generated/vendor code

Generated or vendored files must be marked in the component catalog. Prefer adding application-owned wrappers and tokens over editing generated internals. If a direct edit is necessary, document the exact upstream file, the reason, the patch, and how to reapply it after regeneration.

## 7.5 Definition of UI completion

A UI component is not complete until it has the correct placement, real behavior, loading/empty/error/disabled states as appropriate, keyboard access, focus treatment, theme treatment, and no regressions at common desktop sizes.

---

# 8. Conversation data model and transcript rendering

## 8.1 Core rule

The transcript must render a structured conversation, not a single concatenated string that mixes human-readable prose with runtime metadata.

Messages may contain user text, assistant text, attachment references, reasoning metadata, tool-call parts, tool-result parts, refusal/error parts, and other runtime-supported structured parts. Keep these types distinct for as long as the installed runtime supports them.

## 8.2 Normalized message concepts

Use the existing runtime's compatible types where possible. Do not create a competing message format without a demonstrated need. At the application boundary, the conceptual message model includes:

- `messageId`: stable message identity.
- `conversationId`: stable conversation identity if the current app has conversations.
- `role`: system/developer/user/assistant/tool as supported by the runtime; system/developer instructions should not render as ordinary chat messages.
- `parts`: an ordered list of typed content parts.
- `createdAt`: timestamp where relevant.
- `runId`: ties assistant/tool activity to one generation run.
- `status`: streaming, complete, failed, cancelled, or awaiting approval as appropriate.

Tool-call part concepts include a stable tool-call ID, internal tool identifier, normalized user-facing label, validated arguments, status, and associated result/error. Use the SDK's actual schema as the source of type compatibility; this list states semantics, not an instruction to duplicate SDK internals.

## 8.3 Rendering rules

- User and assistant prose render through the normal message components.
- Markdown is rendered safely with the existing supported renderer. Sanitize or disallow unsafe raw HTML, executable URLs, and dangerous embedded content.
- Code blocks use the project's existing code renderer and handle long lines without widening the entire transcript.
- Attachments are rendered as attachment chips/cards with names, type, size when available, and clear upload/processing status. Do not expose raw absolute local paths unless that information is necessary and explicitly appropriate.
- Tool calls render as a dedicated tool/activity component, not as assistant text.
- Tool outputs are associated with the correct tool call and are not independently appended as user-authored messages.
- System prompts, provider JSON, schemas, hidden state, debug logging, and authorization data never render in the transcript.
- If the backend/provider returns an unexpected raw protocol object, the renderer must fail closed into a generic error/activity state rather than printing the object to the user.
- Empty assistant messages caused by a tool-only step must not create confusing blank chat bubbles.
- Partial assistant text received before an error should remain visible with a clear interrupted/failed state; do not rewrite it as a completed answer.

## 8.4 Tool-call association

The tool-call ID is the authoritative link between a call, its approval, execution status, and result. Do not rely on array order alone. Validate that each result references an existing call and that stale events from an earlier run cannot update a newer run's UI.

## 8.5 Reasoning and hidden model traces

If the selected provider/model emits a supported reasoning part and the application intends to expose it, it must be separately handled, clearly labelled, user-controlled where appropriate, and never confused with final output. Do not expose private system/developer prompts, provider internals, or tool protocol as “reasoning.” If support is inconsistent, hide the control rather than rendering malformed output.

---

# 9. Tool visibility and interaction model

This section is a release-blocking product requirement, not merely a styling detail.

## 9.1 Three separate things

The implementation must distinguish:

1. **Assistant response:** natural-language content addressed to the user.
2. **Tool activity:** a structured request to execute an application capability, including arguments, status, and result.
3. **Diagnostics:** runtime logs, raw provider errors, framework internals, or debug data intended only for developers.

These must not be flattened into one string. The runtime, data model, stream parser, and renderer must preserve the distinction.

## 9.2 Default user-facing behavior

When the agent calls a tool, show a small, polished, human-readable activity row/card in the relevant place in the transcript. Examples of user-facing labels:

- `Calculating` rather than an internal function name such as `evaluate_expression`.
- `Checking the current time` rather than a raw tool identifier.
- `Reading a file` or `Listing a folder` for filesystem tools, including enough non-sensitive context for the user to understand the action.
- `Opening a web page` for URL retrieval, with the host or URL shown only where appropriate.

The activity should indicate state through text plus visual treatment:

- Pending/running.
- Waiting for approval.
- Completed.
- Failed.
- Cancelled.
- Result available (possibly collapsed).

Use existing card, disclosure, badge, spinner, icon, and tooltip primitives where possible. Tool output can be expanded by the user when useful, but the default transcript should remain readable.

## 9.3 What must never be shown as ordinary assistant prose

- Raw tool call JSON or partially streamed JSON arguments.
- Internal tool identifiers when a human-friendly label exists.
- Toolkit registration objects or schemas.
- Runtime event chunks, serialized tool-result envelopes, or internal metadata.
- Debug statements such as `tool called`, request dumps, stack traces, environment variables, or provider headers.
- The model's intermediate protocol payload as if it were its final answer.

A tool name may be used internally for logging and routing. The user-visible activity renderer must map it through an explicit label registry.

## 9.4 Avoid overzealous text filtering

The renderer should not regex-delete arbitrary natural-language sentences simply because they contain the word “tool.” If the model itself says “I’ll use a calculator,” that is ordinary assistant text unless the product has a separate, intentionally designed narration policy. The robust fix is to keep structured tool-call parts out of prose and instruct the model not to narrate internal implementation details unnecessarily—not to corrupt legitimate language with brittle text filtering.

If providers leak tool syntax into the assistant text channel, record a reproducible test and fix the provider/runtime parsing boundary. Do not patch the UI with ad hoc replacement strings as the primary solution.

## 9.5 Tool activity lifecycle

For every tool invocation:

1. As soon as a valid tool-call part is available, create/update a stable activity item.
2. Stream partial arguments only inside the activity component if they are meaningful and safe; do not show malformed JSON fragments to the user.
3. Before execution, validate the tool name, schema, run state, mode, and permission.
4. If approval is required, pause the run and show the approval UI; no side effect may occur before approval.
5. Show progress while executing, with no fake percentage unless the tool has real measurable progress.
6. On success, associate the result with the original activity.
7. On failure, show a human-readable reason and preserve safe diagnostics for logs.
8. Continue the model loop only if the runtime says it is valid and the configured step/time/output budgets permit it.
9. If the agent reaches a limit, show a neutral limit state and preserve completed results.
10. Once the run finishes, show the final assistant answer separately.

## 9.6 Tool renderers

Every supported tool must have an explicit renderer or a safe generic renderer. A renderer must handle missing, partial, malformed, and failed arguments/results. It must not crash the entire transcript because one tool result is unexpected.

Tool renderer components must use the project's existing UI primitives. They should be visually quieter than a final assistant answer while remaining readable, accessible, and expandable when there is meaningful detail.

## 9.7 Tool activity grouping

A single agent run may produce several calls. Group related calls under the current run when helpful, but do not collapse important approval or failure states. For parallel calls, display an understandable order and independent status for each call. A final answer must not appear before all required dependent tool calls have resolved unless the runtime intentionally yields a partial answer and labels it as such.

---

# 10. Tool registry and per-tool contracts

## 10.1 Tool registry rules

- Register tools centrally using the existing assistant-ui/AI SDK pattern verified in the installed versions.
- Maintain one canonical registry for internal name, user-facing label, purpose, schema, execution location, required mode, capabilities, permission/approval policy, timeout, input/output limits, and renderer.
- Do not define the same tool under different names in the client and server without a compatibility mapping.
- Do not advertise a tool to a model that cannot execute it or that the current mode does not permit.
- Tool schemas must be narrow and typed. Validate arguments at the trusted execution boundary even if the model was given a schema.
- Tool output should be normalized, size-limited, and safe to insert into subsequent model context.
- Errors must be converted to typed tool failures without leaking secrets or raw stack traces.

## 10.2 Mode policy

**Chat mode:** should behave like ordinary conversation. Unless a documented product requirement says otherwise, application tools are not enabled by default in Chat mode. The model should not silently read local files or perform actions.

**Agent mode:** may use the enabled tools that the selected model supports and the user has authorized. A mode switch is not blanket consent to every filesystem operation. Permissions and workspace scope remain enforced per tool.

## 10.3 Initial tool catalogue from the old plan

The old plan proposed five tools. Keep them only if they remain desirable after audit. The requirements below are the target behavior if they are retained.

### Tool A — Current time

**Purpose:** Return the machine's current date/time in a normalized format.

- Inputs: none.
- Execution location: choose and document one supported boundary; a local frontend implementation may be sufficient if it truly uses the machine runtime clock.
- Output: ISO timestamp plus a defined timezone representation where needed.
- UI label: `Checking the current time`.
- Validation: output must parse as a date/time; do not fabricate a timezone.
- Failure behavior: show a short failure state and allow the run to continue where the runtime permits.

### Tool B — Arithmetic evaluator

**Purpose:** Evaluate explicitly requested basic arithmetic, not arbitrary code.

- Input: a single expression string, length-limited.
- Allowed operations: addition, subtraction, multiplication, division, parentheses, modulo, exponentiation only if supported by a bounded and documented parser.
- Implementation: strict tokenizer and arithmetic parser (for example, a recursive-descent parser), not `eval`, `Function`, shell execution, or any equivalent dynamic code execution.
- Reject: identifiers, property access, assignment, strings, arrays, object literals, imports, function calls, statements, and any unrecognized token.
- Bound expression length, token count, exponent size, magnitude, and computation time to prevent abuse.
- Define division/modulo-by-zero behavior, invalid syntax, numeric precision expectations, and non-finite output handling.
- UI label: `Calculating`.
- Result display: show the expression and result in a concise, copyable form. Do not put raw evaluator metadata in the assistant prose.
- Test cases: arithmetic precedence, parentheses, unary minus if supported, decimal numbers, malformed input, division by zero, exponent-limit rejection, unexpected identifiers, and very long strings.

### Tool C — Fetch a public URL

**Purpose:** Retrieve a public HTTP(S) page and provide a bounded text extraction for the agent.

- Accept only explicit `http:` and `https:` URLs.
- Reject credentials embedded in URLs, unsupported protocols, malformed URLs, and local/private destinations.
- Revalidate redirect destinations; a safe initial URL must not redirect to a local or private address.
- Set connection and total timeouts, response-size limits, redirect limits, and text-extraction limits.
- Handle non-success HTTP status as a readable error.
- Strip scripts, styles, markup, and non-text payloads from the model-facing extract; preserve title/source URL/status where safe.
- Never execute page scripts, trust page instructions as system instructions, or follow prompt-injection content as authority.
- Do not make the tool an arbitrary network proxy. If a browser-side fetch is retained, document CORS limitations instead of bypassing them insecurely. If the fetch moves to the backend, apply SSRF defenses at the trusted server boundary.
- UI label: `Opening a web page` or `Reading a web page`.
- UI detail: show the hostname and a safe status; raw full response bodies stay collapsed or hidden.

### Tool D — List a directory

**Purpose:** List entries under the selected workspace root.

- Input: a relative path under the approved root; use an empty relative path for the root itself if appropriate.
- Do not accept arbitrary absolute paths from the model.
- Canonicalize and validate in Rust, not only in the frontend.
- Reject `..` traversal, symlinks that escape the workspace, device paths, disallowed special files, and paths outside the approved root.
- Avoid following symlinks by default. If support is ever required, resolve the final canonical target and re-check confinement.
- Return a bounded list of filenames, entry kinds, and safe metadata; do not read file contents during listing.
- Apply entry count and path-length limits and deterministic sorting.
- UI label: `Listing a folder`.
- Approval: require approval on first access per workspace/session or apply a documented equivalent; new or broader roots require new consent.

### Tool E — Read a text file

**Purpose:** Read a bounded UTF-8 text file inside the selected workspace.

- Input: a relative path and optional maximum byte count that cannot exceed the application hard cap.
- Validate the extension/content policy if one is defined; reject binary and special files rather than rendering them as corrupt text.
- Canonicalize and enforce workspace confinement in Rust.
- Reject traversal and symlink escape. Re-check after file open where platform APIs permit safe handling of race conditions.
- Apply maximum file size, read size, output tokens/bytes, and timeout.
- Return a truncation flag when content is capped; do not silently imply the entire file was read.
- Escape/sanitize output when rendering previews. Keep source content clearly marked as untrusted data when passed back to the model.
- UI label: `Reading a file`; show a relative path or limited safe context rather than leaking unrelated absolute paths.
- Approval: do not read before the required user approval. The selected workspace is a scope boundary, not permission to read unrelated files.

## 10.4 Tool lifecycle and approval policy

For tools touching the local filesystem, approval must happen before the first read unless the product has an explicit, documented user opt-in for that workspace and access level. The approval surface must state the requested action, target file/folder, scope, and whether data may be sent to a hosted model.

At minimum, the user must be able to deny an action without the agent retrying indefinitely. Denials should return a structured `denied` result, not an exception that crashes the run. The agent must not immediately reissue the same denied operation unless the user changes the permission or supplies a materially different instruction.

## 10.5 Tool budgets

Define per-run limits for:

- Maximum inference/tool steps.
- Maximum repeated calls to the same tool with the same arguments.
- Maximum concurrent tool calls.
- Per-tool timeout and overall run timeout.
- Maximum bytes/tokens returned by each tool.
- Maximum aggregate tool output included in model context.

Use reasonable defaults, centralize them, and report limit exhaustion clearly. No unbounded loop is permitted.

---

# 11. Agent loop, cancellation, and run state

## 11.1 Runtime loop

A tool call is not the final assistant answer. The runtime must support a bounded cycle of model generation, validated tool execution, result return, and subsequent generation. It must stop when the assistant finishes, a stop condition is reached, the user cancels, an approval is pending, the provider fails, or a timeout/budget is exceeded.

Use the installed AI SDK version's documented loop-control API (the current documentation describes a `stopWhen`/step-count pattern, but exact API names must be checked against the lockfile version). Do not implement a parallel custom loop unless the existing runtime demonstrably cannot support the required flow.

## 11.2 Run state machine

Represent run status explicitly. The conceptual states are:

- `idle`
- `submitting`
- `streaming`
- `executing_tool`
- `awaiting_approval`
- `continuing_after_tool`
- `completed`
- `cancelled`
- `failed`
- `limit_reached`

Use the existing runtime state types if they cover these concepts. Do not create a competing run-state store without need.

Valid transitions must be enforced. For example, a completed or cancelled run must not move back to streaming because a late event arrived. A tool result must not be applied to a different run. When a stream closes without a recognized terminal event, mark the run failed/interrupted after a bounded recovery path rather than leaving the UI spinning forever.

## 11.3 Stop/cancel behavior

- The active generation must have a unique abort/cancellation mechanism.
- The composer send action changes to a stop action only while stopping is meaningful.
- Cancellation must propagate from the frontend through transport/backend to provider generation and pending tool operations where technically possible.
- Any work that cannot be cancelled must complete safely without updating a newer run's UI.
- Preserve already received assistant text and completed tool results, but label the run as cancelled/interrupted.
- Release listeners, controllers, temporary files, pending permissions, and other per-run resources.

## 11.4 Retry behavior

Retry creates a new run identity. It must not append duplicate tool results to the prior run, replay a destructive action automatically, or discard the prior partial answer silently. Retrying a tool that can access local files must re-evaluate approvals and scope.

## 11.5 Failure isolation

A malformed argument or one failed tool should fail that tool call only where possible. The assistant may explain the failure or recover if the model runtime remains valid. Provider/network errors, authentication errors, rate limits, unsupported parameters, tool failures, cancellation, and approval denial must be distinguishable to the user when the remedy differs.

---

# 12. Model catalog, selection, and capability gates

## 12.1 Normalized model record

Use one normalized model record for UI and request validation. Include only fields actually available from the provider or local adapter, such as:

- Stable model identifier.
- Display name.
- Provider/source identity.
- Hosted versus local classification.
- Context length when known.
- Input/output modalities when known.
- Tool/function calling capability.
- Reasoning support and supported effort levels where advertised.
- Streaming support where known.
- Pricing values for hosted models, with units and explicit unknown state.
- Experimental/variable routing marker when applicable.
- Last refreshed/source status if relevant.

Do not infer paid/free status from model-name suffixes. Use normalized pricing metadata. If pricing is missing or ambiguous, label it unknown rather than free.

## 12.2 Discovery and caching

If an OpenRouter model catalog endpoint is present or added:

- Fetch through the backend or designated provider adapter, not independently from multiple UI components.
- Project the upstream response to a slim stable schema.
- Cache it with a documented TTL; a value around fifteen minutes is a starting point, not a sacred constant.
- Serve stale cached data on a recoverable upstream failure and show stale status if the UI supports it.
- If no cached catalog is available, show a meaningful failure state with retry rather than an empty unexplained picker.
- Treat upstream fields as data, not executable configuration.
- Validate and normalize context, modalities, prices, and tool support on the trusted side.

## 12.3 Request resolution

The selected model displayed in the UI must be exactly the model identity sent to the correct adapter. If a model is no longer available, the app must not silently switch to a different paid or unsupported model. It may offer a clearly disclosed fallback or request that the user choose another model.

The server must be authoritative about the final resolved model and log safe metadata for it. The client must display the actual model used when the backend had to resolve or fall back.

## 12.4 Capability matrix

Before a capability is enabled, validate all layers:

| Capability | Required conditions | UX behavior when unavailable |
|---|---|---|
| Tool calling | Model supports tools; runtime forwards definitions; tool loop is enabled; each offered tool is executable | Disable Agent tool execution or explain why the selected model cannot use tools |
| Reasoning effort | Model advertises the parameter/value; adapter supports it | Hide the control or disable unsupported choices; never send unsupported values |
| Image input | Model supports image input; attachment adapter encodes/transfers images; UI stages and previews them | Do not imply image understanding is enabled |
| Audio input/output | Model, adapter, stream, encoding, and UI all support the requested direction | Hide/disable until complete |
| File input | Adapter understands the format and sends usable content, not merely a local path | Reject unsupported file types with a clear explanation |
| Local model | Local adapter endpoint is configured and reachable; model exists; options map correctly | Show unavailable/offline state with retry and setup guidance |
| Context window | Known limits and message/attachment accounting are available | Do not claim remaining context precision when estimates are unavailable |

## 12.5 Local models

The local-model selector already exists according to the user's description. Audit its real adapter and request path before modifying it.

Required target behavior:

- Clearly distinguish local models from hosted models.
- Verify local endpoint/model availability before treating selection as usable.
- Do not attach hosted-provider credentials to local requests.
- Display connection failures distinctly from model authentication/quota failures.
- Apply only parameters supported by the local adapter/model.
- Ensure model selection in the UI is reflected in the outgoing request.
- Provide safe endpoint validation and avoid sending local prompts or files to a hosted provider after a local model was selected unless a clearly disclosed fallback is explicitly confirmed.

## 12.6 Reasoning and generation options

Advanced generation options must be data-driven and capability-gated. Do not send a reasoning effort option unconditionally. Do not guess default effort levels. If the user explicitly selects an effort and the provider rejects it, show an actionable error; do not silently retry with a different setting while implying the original choice was honored.

## 12.7 Credit, quota, and status

Where provider account metadata can safely be retrieved, show useful balance/quota status near the provider/settings area or model picker, not as raw JSON inside the thread. Treat absence of quota data as unknown, not zero. Never expose the API key when checking status.

---

# 13. Composer, attachments, and file handling

## 13.1 Composer behavior

- Enter sends only if this is the established product convention and the input is not composing an IME character; Shift+Enter inserts a newline when supported.
- If Enter-to-send is enabled, make the behavior discoverable and preserve multiline editing.
- Trim or validate empty/whitespace-only messages according to consistent product rules.
- Prevent accidental duplicate submission while the same request is being created.
- Preserve draft text after a recoverable failure.
- When a response is streaming, allow a clear stop/cancel action and avoid accidental double-send.
- Respect paste, text selection, keyboard navigation, and platform-native editing behavior.

## 13.2 Attachment staging

The plus/add control may open a small menu if the app has multiple distinct add actions. Each action must have a clear label and its own tested path; do not use vague menu items.

For each staged attachment, track the metadata the current runtime actually needs, such as stable local ID, name, MIME type, byte size, upload/processing state, and adapter-supported content reference. Avoid inventing fake URLs or claiming a file was uploaded when only its path was stored.

The UI must support:

- Add one or more files where supported.
- Show staged attachments before send.
- Remove an individual staged attachment.
- Show invalid file type, size-limit, read, or processing errors.
- Clear or preserve staged attachments on send/failure according to one documented rule.
- Prevent stale attachments from leaking into the next unrelated message.
- Communicate when a selected model cannot use the attachment type.

## 13.3 Privacy for attachments and workspace files

A local path is not file content. If the app needs to send content to a hosted model, the implementation must read/process that content intentionally and communicate that it may leave the device. Never silently upload the contents of an entire workspace folder.

If the user chose a local model, do not fall back to a hosted model with local file content without an explicit confirmation. If a tool result contains local file content and the selected model is remote, apply the same data-disclosure rule.

## 13.4 Attachment adapters

An attachment feature is complete only when all relevant pieces work:

- UI picker and staging.
- Validation, size limits, and safe file handling.
- Normalized transport representation.
- Provider/local adapter encoding or upload behavior.
- Capability checks.
- Progress/error states.
- Message history representation if supported.
- Privacy disclosure and tests.

Until that path is complete, hide or disable unsupported attachment types rather than claiming broad “file support.” Text-only attachments may be implemented as a narrow first step if the current adapter supports them end-to-end.

---

# 14. Workspace and filesystem security model

## 14.1 Workspace concept

The selected folder is an approved root for a constrained set of operations, not an unrestricted permission to browse the machine. Store the root in application state with a clear source and lifecycle. If the app restarts and remembers a root, revalidate that it still exists and is still permitted before tool use.

## 14.2 Trusted boundary

The Tauri/Rust layer is the trusted boundary for filesystem operations. Frontend filtering is useful for UX but does not replace Rust validation. Model-generated paths are untrusted input even when the model received a schema.

## 14.3 Path validation

Rust commands must:

- Accept root-relative paths rather than unrestricted absolute paths where possible.
- Canonicalize the root and candidate path and confirm the final target stays inside the root.
- Reject traversal sequences, absolute paths outside the root, device/special paths, and symlink escapes.
- Avoid following symlinks by default; if they are allowed later, implement explicit, race-aware validation.
- Apply path-length, entry-count, file-size, and operation-time limits.
- Enforce a strict allowlist of commands. Frontend must not be able to invoke arbitrary Rust functions.
- Return normalized error codes and safe messages, not raw OS internals or stack traces.

The audit should pay special attention to TOCTOU concerns: validating a path and then opening a different object due to a race can undermine confinement. Use safe filesystem patterns appropriate to the supported operating system and document residual limitations.

## 14.4 Tauri permissions

Every custom command must be explicitly registered and exposed only through the minimum capability/permission set needed by the relevant window/webview. Review the actual capability files and default grants. Do not grant broad permissions as a shortcut to make a command work. Add tests or a manual verification step proving that disallowed commands remain inaccessible.

Official Tauri reference: https://tauri.app/security/capabilities/ and https://tauri.app/security/permissions/.

## 14.5 Initial permission levels

Recommended initial tool policy:

- Current time: no additional permission.
- Arithmetic: no additional permission, strict parser only.
- Public URL retrieval: network restrictions and clear external-data handling.
- List workspace: workspace permission and approval policy.
- Read workspace file: workspace permission, file limits, and explicit approval policy.
- File write/delete/shell execution: not in the initial release.

## 14.6 Untrusted file/web content

Content returned by a file or web tool is data, not new system instructions. Clearly delimit it in the model context if the SDK allows. Never let retrieved content alter the tool registry, provider credentials, allowed workspace root, permission policy, or developer/system prompt. Tool output must be size-limited and safely rendered.

---

# 15. Credentials, provider configuration, and local backend security

## 15.1 Secret handling requirements

- Provider API keys must not be committed to version control.
- Production credentials must not be stored in `localStorage`, ordinary browser storage, message history, frontend logs, crash reports, or plaintext application config.
- Development `.env.local` may be retained only if it is gitignored, documented as development-only, and handled without printing values.
- Use an OS credential store for durable desktop storage when supported by the actual project.
- The app must never echo, log, or display the full stored credential after entry.
- Redact authorization headers and key-like values at a central logging boundary.
- Key rotation/replacement must take effect without requiring an undocumented restart unless the underlying architecture makes this impossible; if restart is required, say so in the UI.

## 15.2 Credential settings workflow

1. User opens provider settings.
2. UI shows connection status without exposing the credential.
3. User enters or replaces the credential in a masked field.
4. App validates basic formatting locally without claiming that formatting proves validity.
5. Credential is stored using the verified secure mechanism.
6. App tests it through the provider's safe status endpoint where available.
7. UI reports success, invalid/revoked key, quota/rate limit, network failure, or unsupported credential path distinctly.
8. User can replace or remove the stored value.

## 15.3 Separate process considerations

The previous plan describes the Node backend as a separate process. If this remains true, inspect how it receives credentials. The application must use the narrowest viable path and document where the key temporarily exists in memory.

If the webview attaches a credential to a backend request:

- Send it only to the expected loopback endpoint.
- Bind the backend to `127.0.0.1` or the relevant loopback interface, not a public network interface.
- Validate allowed origin/host and require a local session token or equivalent request authentication where appropriate.
- Do not enable broad CORS as a convenience.
- Do not log request headers or full credential-bearing bodies.
- Do not persist the forwarded credential in backend caches or session history.
- Ensure a remote webpage cannot silently use the local backend as an open proxy.

If the current architecture cannot meet the necessary boundaries without redesign, record a focused security decision before proceeding; do not quietly ship the weaker path.

## 15.4 Error categorization

The user should be able to distinguish:

- Missing credential.
- Invalid or revoked credential.
- Provider quota/rate limit.
- Unsupported model or parameter.
- Provider outage.
- Network/connection failure.
- Local model endpoint unavailable.
- Local backend unavailable.

Raw provider response bodies should not be shown verbatim if they might contain secrets or irrelevant internals. Extract safe, actionable information.

## 15.5 Logging redaction

Allowed fields may include request/run ID, model ID, provider ID, duration, step count, tool identifier, safe tool outcome code, token usage if supplied, finish reason, and HTTP status. Never log full message contents, workspace file contents, API keys, bearer tokens, full authorization headers, or unredacted request bodies by default.

---

# 16. State, preferences, and conversation persistence

## 16.1 Separate state categories

Audit and document which state is:

- Ephemeral UI state (open popover, current hover, temporary validation messages).
- Current-run state (stream status, tool activity, cancellation controller).
- Conversation state (messages, metadata, attachments, selected model for a conversation if applicable).
- User preference state (theme, preferred model, default mode, model filters).
- Sensitive state (provider credentials and any sensitive workspace metadata).

Use the correct storage lifetime for each category. Do not put all state into one undifferentiated storage mechanism.

## 16.2 Persistence decision

The old plan explicitly lists conversation persistence as out of scope. Keep it deferred unless the repository already implements it or the user approves it as a current requirement. Do not silently introduce a database while repairing tool UI.

If conversations remain in-memory, clearly document that reload/restart loses them. If persistence is later added, it requires an explicit schema, migration strategy, deletion policy, backup/export policy, and a privacy review for local file content and tool outputs.

## 16.3 Preference persistence

Non-sensitive preferences such as theme, selected model, and model picker filters may persist using the existing safe preference mechanism. Validate stored values and handle corrupt/unavailable storage gracefully. Do not persist credentials in ordinary browser storage.

## 16.4 Workspace persistence

Remembering a workspace root is a product/security decision. If enabled, persist only the necessary path metadata in the permitted application preference store, revalidate at startup, and require new consent when the root changes or a permissions scope expands. Do not persist file contents as a shortcut.

---

# 17. Visual design system, responsive layout, and accessibility

## 17.1 Design system

Inventory and reuse current design tokens. Establish one source for:

- Background/surface levels.
- Text/muted text.
- Border and focus ring.
- Accent and destructive states.
- Radius, spacing, typography, and icon sizing.
- Elevation/shadow.
- Animation duration and reduced-motion behavior.
- Light and dark theme values.

The plan does not mandate new numerical values before the existing system is reviewed. Define or adjust tokens only after examining current components and screenshots.

## 17.2 Theme behavior

If light and dark themes are supported:

- Use one authoritative theme state and one documented precedence policy between saved preference and OS preference.
- Do not create a visible flash on startup if the current architecture supports pre-mount initialization.
- Store only the user's preference, not duplicated theme state in multiple unrelated components.
- Verify the composer, model picker, dialogs, tool activity, code blocks, scrollbars, disabled controls, and focus rings in both themes.
- Do not choose a default that contradicts an explicit user requirement already established in the repository/project.

The old plan contains conflicting descriptions of default-theme precedence. The audit must identify the actual user preference and choose one unambiguous rule before theme changes.

## 17.3 Typography and density

- Keep the reading column comfortable for long responses.
- Use consistent heading/body/caption hierarchy.
- Avoid overusing bordered cards; not every control needs a container.
- Avoid presenting raw telemetry as prominent UI.
- Keep tool activity visually subordinate to final assistant prose.
- Ensure filenames, model IDs, URLs, and code can wrap or scroll without expanding the full layout.

## 17.4 Accessibility baseline

- Every icon-only button has a stable accessible name and appropriate tooltip.
- Every interactive element is keyboard reachable with a visible focus indicator.
- Dialogs and popovers follow existing library focus and Escape behavior.
- Focus returns to the invoking control when a dialog or picker closes.
- Status updates such as tool start, approval-needed, success, failure, and cancellation are announced appropriately without excessively announcing every streamed token.
- Tool states use text/shape/icon in addition to colour.
- Reduced-motion preference is respected.
- Text and control contrast meet applicable WCAG AA expectations.
- The transcript remains scrollable with keyboard and assistive technology even when visual scrollbars are thin or visually subtle.
- Do not trap the user's keyboard focus in the transcript while a tool is running.

## 17.5 Window sizes and layout tests

Test at narrow desktop width, normal laptop width, and a large desktop width. Also test a short window height. The application should not clip primary controls, force unwanted horizontal page scrolling, obscure the latest message behind the composer, or cause large layout jumps when the first message arrives or tool cards expand.

## 17.6 Scrollbars and overflow

Only customize scrollbars after determining the source of overflow and measuring actual element sizes. Keep them thin if that is the established visual target, but preserve native scrolling, dragging, keyboard access, and visibility when overflow exists. Avoid reserving permanent scrollbar space if the accepted design requires the track to appear only when needed.

## 17.7 Button geometry and interaction states

Verify the actual button box and icon bounds before changing size/padding. Shared icon buttons should keep size and padding rules coherent across variants. Test rest, hover, pressed, disabled, focus, loading, and stop/cancel states. Do not change correctly centered icons to address a perceived contrast issue.

---

# 18. Reliability, errors, and recovery

## 18.1 Error taxonomy

Represent expected failures as typed categories where practical:

- Validation error.
- Authentication/credential error.
- Rate limit/quota exceeded.
- Provider unavailable.
- Local endpoint unavailable.
- Unsupported model capability/parameter.
- Transport disconnected/interrupted.
- Tool input invalid.
- Tool execution failed.
- Permission denied.
- Workspace scope violation.
- Attachment unsupported/too large/unreadable.
- Timeout.
- User cancelled.
- Step/output/context limit reached.

Do not map every failure to “Something went wrong.” The UI should communicate the remedy when it is known.

## 18.2 Streaming interruption

If streaming stops unexpectedly:

- Preserve received text and completed tool results.
- Mark the run interrupted rather than complete.
- Provide retry where safe.
- Do not auto-replay filesystem operations or other side effects without renewed validation/approval.
- Clean up the stream, abort controller, listeners, and pending tool activity.

## 18.3 Provider rate limits

Where safe metadata is available, show the reason and practical remedy. Do not invent quota remaining values. A rate limit must not leave the composer disabled indefinitely.

## 18.4 Model becomes unavailable

Do not silently switch to a different model and imply the original model answered. Show the unavailable selection and offer an explicit change/fallback path. If a backend fallback is necessary for resilience, expose the actual model in the response metadata/UI.

## 18.5 Catalog failure

Use the cached catalog when available, note staleness if possible, and permit retry. If no catalog is available, show a useful message rather than an empty menu that looks like “no models exist.”

## 18.6 Keychain/storage failure

If secure credential storage fails, show a clear error. Do not silently downgrade to plaintext persistent storage. A development-only environment variable fallback may remain documented for development; production behavior must be explicit.

## 18.7 Safe fallback behavior

A fallback may reduce capability, but it must not silently expand cost, data exposure, filesystem access, or privilege. For example, losing local-model availability must not automatically send local files to a remote model.

---

# 19. Performance and resource budgets

## 19.1 Rendering

- Avoid rerendering the entire transcript on every token where the existing runtime allows more targeted updates.
- Keep tool activity rows keyed by stable IDs.
- Virtualize long model lists when measured DOM/render cost warrants it.
- Debounce model search where needed without making it feel sluggish.
- Avoid repeated parsing of the full message history for each stream chunk.
- Ensure expanded tool results do not freeze the transcript.

## 19.2 Context and output limits

- Use model context length where known, but present estimates honestly.
- Bound tool outputs individually and in aggregate.
- Truncate large files/pages with an explicit truncation marker.
- Avoid sending entire raw catalog payloads or raw HTML to the model.
- Use deterministic serialization for normalized model/tool metadata.

## 19.3 Network and timeouts

Define central defaults for connection timeout, total request timeout, catalog TTL, stream idle timeout, per-tool timeout, and max response bytes. Values should be chosen after testing the actual provider/local adapter; document the rationale and allow cancellation.

## 19.4 Memory and cleanup

Ensure aborted streams, completed tool calls, popovers, file buffers, event listeners, and temporary attachment objects are cleaned up. A cancelled tool must not keep updating UI state after its conversation/run changed.

---

# 20. Testing and acceptance strategy

## 20.1 Testing layers

1. **Static checks:** type checking, linting, build, formatting if configured.
2. **Unit tests:** input schemas, arithmetic parser, capability normalization, path validation helpers, redaction, state transitions, label mapping.
3. **Backend integration tests:** request normalization, provider/model resolution, streaming protocol, tool round-trip, timeouts, errors, model capability filtering.
4. **Tauri integration/manual tests:** command permissions, path confinement, workspace selection, credential storage and native error handling.
5. **UI component tests:** message-part renderer, tool lifecycle states, composer interactions, model picker, dialogs, approval controls, theme.
6. **End-to-end checks:** full send/stream/stop/tool/result/final-answer flow through the real app architecture.
7. **Visual regression/manual review:** light/dark themes and several desktop window sizes.
8. **Security tests:** traversal, symlink escape, protocol validation, SSRF cases, secret leakage, unapproved tool execution, unauthorized local backend calls.

## 20.2 Regression baseline

At minimum, re-verify all of the following after shared runtime or UI changes:

- Sending a plain text message works.
- Replies stream incrementally.
- A final response is displayed as assistant prose.
- Stop/cancel works when streaming is active, if the current implementation supports it.
- Changing the hosted model changes the request actually sent.
- Selecting a local model reaches the real local adapter and reports offline status correctly.
- Switching Chat/Agent changes available tools and runtime behavior as specified.
- Selecting/clearing a folder updates workspace state.
- Tool calls render as activity components, not raw protocol text.
- A tool call is followed by tool result and assistant continuation when the model/runtime supports that flow.
- Unsupported tool capability is handled without leaking raw calls or leaving a spinner active.
- Both theme variants remain readable.

## 20.3 Release-blocking tool tests

- A simple arithmetic request produces a calculation activity and a final user-facing answer.
- No raw function name/schema/JSON appears in a normal transcript.
- A multi-step run stays responsive and stops at the configured bound.
- Invalid tool arguments fail only the relevant tool where possible.
- A filesystem tool does not execute before required approval.
- Denied approval does not lead to repeated hidden retries.
- A file outside the selected workspace is rejected by Rust even if the frontend is bypassed.
- Traversal and symlink escape attempts are rejected.
- A tool failure shows a useful error without leaking stack traces or secrets.
- Cancelling during tool execution leaves the UI in a terminal state and prevents stale updates.

## 20.4 Test data and quota discipline

Use mocked providers or deterministic local fixtures for routine UI/runtime tests. Reserve live provider calls for focused integration checks. Do not consume free quotas by repeatedly clicking a UI to test behavior that can be tested at the backend or unit-test layer.

Never use real secrets, personal files, or sensitive workspace contents in automated fixtures.

## 20.5 Acceptance evidence

Every stage report must list:

- Commands executed.
- Pass/fail result for each command.
- Manual steps performed and observations.
- Tests added or updated.
- Known untested areas and why.
- Files changed.
- Any deviation from this plan and the documented reason.

“Looks good” and “implemented” are not adequate evidence by themselves.

---

# 21. Implementation roadmap and stage gates

Stages below are a proposed order. The audit may refine ordering based on actual dependencies, but stages must not be collapsed into one giant unreviewable change.

## Stage 0 — Repository and baseline audit

**Purpose:** Find out what actually exists before changing it.

**Allowed work:** Inspect code, run safe checks, produce the audit report, capture screenshots or behavior notes, and propose the implementation order. Do not modify production source code in this stage.

**Deliverables:** Component catalog; feature matrix; request/data-flow diagram; package/version list; security boundary summary; initial test commands; deviations list.

**Exit gate:** User and coding agent can point to the exact parts of the repository responsible for composer submission, model selection, mode state, tool registration, stream parsing, tool rendering, and filesystem access.

## Stage 1 — Stabilize contracts and regression baseline

**Purpose:** Establish reliable message, run, model, and tool boundaries before major UI work.

**Tasks:**

- Document the current message/stream format and normalize only where required.
- Ensure user text, assistant text, tool calls, tool results, and errors remain structured.
- Establish unique run IDs and stable tool-call association using the installed SDK's model.
- Confirm the current server/transport path and define the configuration source for base URL/port.
- Add focused tests for ordinary streaming and terminal run states.
- Record current working behavior as regression tests or a repeatable manual checklist.

**Exit gate:** Basic chat continues to work, and structured tool parts are not flattened into assistant prose at the data boundary.

## Stage 2 — Fix tool visibility and transcript rendering

**Purpose:** Eliminate raw tool machinery from the visible chat and create consistent tool activity UI.

**Tasks:**

- Trace the exact route by which raw tool names/arguments/results appear in the transcript.
- Fix the source of the data-shape/rendering error rather than using string replacement as the main fix.
- Add a central tool-label registry.
- Implement or repair the generic activity renderer and specialized renderers for retained tools.
- Add pending/running/success/failure/cancel/approval states.
- Ensure empty tool-only assistant messages do not produce blank bubbles.
- Keep raw diagnostics in logs/dev tools, with redaction.
- Add regression tests that inspect visible transcript output and assert that internal payloads are absent.

**Exit gate:** A tool call produces a polished activity item, a correctly associated result, and a natural-language final response when applicable. No raw JSON/schema/internal identifier is displayed as normal chat content.

## Stage 3 — Composer and component-system integration

**Purpose:** Make the core UI coherent using the existing prebuilt components.

**Tasks:**

- Map current controls to the component inventory and remove duplicates.
- Reuse project button, popover, dialog, command menu, input, tooltip, card, scroll, and status primitives.
- Refine model trigger, attachment/add control, send/stop button, and Chat/Agent switch according to Section 6.
- Ensure keyboard/focus/disabled/loading states are complete.
- Fix actual measured overflow, border, shadow, and button geometry defects without introducing arbitrary CSS hacks.
- Review empty chat, normal chat, long response, long tool sequence, and narrow desktop layout.

**Exit gate:** The composer and thread are visually consistent with the current component system, all controls perform their labelled action, and no regression is introduced.

## Stage 4 — Model selection and normalized catalog

**Purpose:** Make selection reliable and capability-aware.

**Tasks:**

- Verify the hosted model catalog endpoint and actual response shape.
- Add or repair the slim normalized catalog.
- Implement caching, stale fallback, search, provider grouping, local-model distinction, filters, and capability labels.
- Ensure the selected model identity is actually sent to the correct adapter.
- Gate tools, reasoning effort, modalities, and format options based on real capabilities.
- Add tests for free/paid/unknown pricing and missing capability metadata.

**Exit gate:** Changing model changes the actual backend request; unsupported features are not advertised or sent; catalog failure is understandable and recoverable.

## Stage 5 — Agent loop, tools, approvals, and cancellation

**Purpose:** Make Agent mode reliably run bounded tool workflows.

**Tasks:**

- Verify tool schema registration and forwarding against installed SDK/assistant-ui versions.
- Enable the documented bounded multi-step loop.
- Implement one canonical tool registry with normalized schemas and labels.
- Implement per-tool validation, limits, timeout, typed results, and readable failures.
- Add approval UI for local filesystem operations.
- Implement correct run-state and cancellation transitions.
- Prevent hidden retries after denied permissions.

**Exit gate:** At least one deterministic tool completes a call-result-final-answer round trip, chained steps respect limits, and failures/approval/cancellation are handled predictably.

## Stage 6 — Workspace and native tool security

**Purpose:** Make local folder access constrained, transparent, and safe.

**Tasks:**

- Review Tauri command registration and capabilities.
- Implement root-relative list/read APIs only for the retained initial scope.
- Validate canonical paths and reject traversal/symlink escapes in Rust.
- Set limits for listings and file reads.
- Add approval flow and workspace state UI.
- Ensure browser-only builds report native tools as unsupported without invoking invalid commands.
- Add adversarial path tests and manual Tauri permission tests.

**Exit gate:** Valid workspace operations work, out-of-root paths are rejected at Rust boundary, and the user can see/deny local access before execution where required.

## Stage 7 — Local model reliability and provider settings

**Purpose:** Make local and hosted model selection trustworthy.

**Tasks:**

- Audit the current local-model adapter and identify its protocol/endpoint.
- Implement connectivity/availability status and actionable errors.
- Ensure local and hosted credentials/configuration never cross unintentionally.
- Implement provider credential entry using the verified secret store if it is in scope and available.
- Add key validation/status UI and safe replacement/removal flow.
- Harden local backend binding/origin/request authentication.

**Exit gate:** Local model requests actually go local; hosted requests use the selected hosted model; credentials are not persisted in ordinary browser storage or logged; connection failures are distinct and actionable.

## Stage 8 — Attachment support decision and implementation

**Purpose:** Avoid false promises around the plus/add control.

**Tasks:**

- Decide from the audit whether attachments will remain deferred or which narrow format to support first.
- If in scope, implement the full staging/validation/transport/adapter/rendering path for that format.
- Add model capability gates and hosted-transmission disclosure for local content.
- Prevent stale attachments from crossing message boundaries.

**Exit gate:** Only genuinely supported file types are offered; selected attachments reach the model in a usable form; failures and privacy implications are explicit.

## Stage 9 — Theme, accessibility, performance, and polish

**Purpose:** Complete the interface without destabilizing working functionality.

**Tasks:**

- Confirm one theme preference policy and eliminate initial flash if feasible.
- Test all surfaces and states in both themes.
- Review contrast, focus, keyboard navigation, screen-reader announcements, reduced motion, and window sizes.
- Measure actual model-list/transcript performance before adding virtualization or complex optimizations.
- Polish scrollbars, composer elevation, borders, button state, and status indicators using current tokens.

**Exit gate:** No known accessibility blocker in core workflows; common desktop sizes work; long conversations remain responsive.

## Stage 10 — Documentation, security review, and release readiness

**Purpose:** Deliver a stable implementation that can be maintained.

**Tasks:**

- Run all static, unit, integration, UI, and security checks.
- Confirm `.env.local`, keys, and personal data are excluded from version control and logs.
- Resolve or explicitly document packaging/sidecar limitations.
- Verify setup, dev run, troubleshooting, architecture, permissions, and known limitations documentation.
- Remove abandoned experiments or clearly label intentionally retained code.
- Review the complete diff and test the app from a clean startup.

**Exit gate:** The repository builds using documented steps, key workflows pass, unresolved limitations are explicit, and there are no known critical tool/data-boundary defects.

---

# 22. Definition of done by feature

## 22.1 Chat

- [ ] User can submit a non-empty message.
- [ ] Assistant response streams incrementally.
- [ ] Message parts render with correct role and ordering.
- [ ] Partial responses are preserved on interruption.
- [ ] Errors have readable status and don't leave controls stuck.
- [ ] Retry and cancellation behavior is explicit and safe.

## 22.2 Composer

- [ ] Model trigger opens the real model picker.
- [ ] Add control invokes only supported actions.
- [ ] Send submits once and disables/changes state correctly.
- [ ] Stop cancels the current run when available.
- [ ] Keyboard behavior and focus are correct.
- [ ] No unlabelled decorative controls remain.

## 22.3 Chat/Agent mode

- [ ] Mode is visible and the current selection is unambiguous.
- [ ] Mode changes actual request/tool availability.
- [ ] Switching modes during an active run has a documented and safe rule.
- [ ] Chat mode does not silently perform filesystem actions.
- [ ] Agent mode shows tool activity and respects all approvals/permissions.

## 22.4 Models

- [ ] The active model ID matches the outgoing request.
- [ ] Local and hosted models are distinguishable.
- [ ] Unsupported capabilities are hidden/disabled and never sent.
- [ ] Catalog loading, failure, cached fallback, and empty search are handled.
- [ ] A model fallback is disclosed and the real model is identifiable.

## 22.5 Tools

- [ ] All tool calls have stable IDs and typed results.
- [ ] Internal tool protocol is never rendered as ordinary assistant prose.
- [ ] Each tool has a user-facing label and a purpose-built/generic renderer.
- [ ] Invalid arguments, failure, denial, timeout, and cancellation are handled.
- [ ] Tool loops are bounded.
- [ ] Tool output is size-limited and treated as untrusted data.

## 22.6 Filesystem

- [ ] Only approved tools are callable.
- [ ] Root is explicit and visible to the user.
- [ ] Rust enforces confinement independently of frontend validation.
- [ ] Traversal, symlink escape, special-file, and oversize-read cases are rejected.
- [ ] Approval precedes protected access.
- [ ] Remote data transfer of local content is disclosed where relevant.

## 22.7 Security/settings

- [ ] Secrets are not stored in ordinary browser storage.
- [ ] Secrets are not logged or displayed after entry.
- [ ] Backend binds only to intended local interfaces.
- [ ] Request origin/authentication boundaries are tested.
- [ ] Secure storage failure is not silently downgraded to plaintext.
- [ ] Provider and local endpoint failures are distinguishable.

## 22.8 UI/accessibility

- [ ] Core workflows work with keyboard navigation.
- [ ] Focus is visible and restored when overlays close.
- [ ] Status is not communicated by colour alone.
- [ ] Light/dark theme checks pass if both are supported.
- [ ] Long messages/tool results do not cause page-wide horizontal overflow.
- [ ] Composer does not obscure the latest content.

---

# 23. Risk register

| ID | Risk | Impact | Mitigation / gate |
|---|---|---|---|
| R1 | Old plan claims features are complete when they are not | High | Stage 0 evidence-based repository audit; no assumptions from status text |
| R2 | Tool calls/results are flattened into assistant prose | High | Preserve typed message parts; transcript regression tests; central tool renderer |
| R3 | A cheap coding model rewrites or duplicates existing components | High | Inventory-first; reuse-before-create rule; small staged diffs |
| R4 | Model selection UI does not alter actual request | High | Request-level tests and safe backend model logs |
| R5 | Model advertised as tool-capable but tool loop fails | High | Capability gate plus end-to-end tool round-trip tests |
| R6 | Free/experimental routing changes model/tool support between turns | Medium–High | Label variable routing; use pinned supported model for deterministic tests |
| R7 | Workspace path escape or symlink traversal | Critical | Rust-side canonicalization/confinement; adversarial tests; least privilege |
| R8 | Files read without meaningful approval or sent remotely without disclosure | High | Per-tool approval; data-transmission notice; no implicit whole-folder upload |
| R9 | API key leaks through logs, webview storage, or local backend | Critical | OS credential store; central redaction; loopback/auth/origin controls; security tests |
| R10 | Local model outage silently falls back to hosted model | High | Explicit fallback choice; never send local content remotely without consent |
| R11 | Unsupported attachment type appears functional | High | End-to-end adapter gate; hide/disable unimplemented modalities |
| R12 | Tool or stream failure leaves perpetual spinner | Medium–High | Explicit run state machine, timeout, cleanup and terminal states |
| R13 | Generated component regeneration erases fixes | Medium | Application-owned wrappers/tokens; document unavoidable patches |
| R14 | Port/configuration mismatch breaks transport | Medium | One configuration source; startup validation and health endpoint |
| R15 | Package API examples mismatch installed versions | Medium–High | Lockfile-first API check; no cross-major copy/paste |
| R16 | Excessive token/tool output consumes context or quota | Medium | Per-tool and aggregate output caps; bounded step count and timeouts |
| R17 | Theme/style fixes create layout or focus regressions | Medium | Visual checks in both themes and multiple sizes |
| R18 | Packaging fails because separate backend is omitted | High if distributed | Keep packaging out of release scope until sidecar/hosted architecture is resolved |
| R19 | Conversation history persistence is added without privacy/migration design | Medium–High | Keep deferred unless explicitly approved; use a separate design stage |
| R20 | UI reports fallback/partial results as a completed answer | High | Explicit result/run status; preserve partial work and state truncation clearly |

---

# 24. Open decisions and recommended defaults

These are questions to settle during the audit, not reasons to block useful read-only work.

| Decision | Recommended default | Why |
|---|---|---|
| Which exact runtime/package versions are installed? | Read the lockfile; do not guess | API compatibility is version-sensitive |
| Is the Node backend retained? | Preserve it initially if it is working; harden and document it | Avoid unnecessary architecture changes during UI repair |
| Which local-model server/protocol is used? | Discover from code/configuration | Do not assume an adapter that may not exist |
| Are conversations persisted? | Keep current behavior unless verified otherwise; do not add persistence during tool repair | Persistence changes data lifecycle and privacy expectations |
| Are file attachments actually supported end-to-end? | Verify; otherwise disable unsupported options | Prevent false capability claims |
| Should Chat mode expose tools? | No, by default | Keeps normal chat predictable and avoids silent local actions |
| Should file reads require approval? | Yes, at least for first protected access per workspace/session | Preserves user agency over local data |
| Should web retrieval run in the browser or backend? | Keep current location if safe; document browser CORS or backend SSRF implications | Avoid insecure “fixes” that turn it into an open proxy |
| Theme default and OS preference precedence? | Choose one explicit policy matching existing user requirement | Old plan contains conflicting descriptions |
| Free-only model picker? | Preserve if cost avoidance is still a requirement, but make the policy explicit | User should not unknowingly select paid models |
| Packaging/distribution? | Defer until backend lifecycle/sidecar decision is made | Dev-only backend arrangements may not ship |
| Approval persistence? | Do not remember broader permissions silently; require fresh consent for scope expansion | Prevent permission drift |

---

# 25. Coding-agent operating protocol

This section is intentionally explicit because the plan must be executable by a less capable coding agent.

## 25.1 Rules for every implementation task

The coding agent must:

1. Read this specification and the relevant source files before editing.
2. State the precise stage and acceptance criteria it is addressing.
3. Identify the smallest set of files likely to change.
4. Reuse existing components and patterns discovered in the audit.
5. Avoid opportunistic refactors unrelated to the stage.
6. Preserve unrelated user edits and never reset/overwrite them.
7. Avoid dependency additions unless existing dependencies cannot meet the requirement; explain the reason first in the report.
8. Implement real behavior rather than static UI placeholders.
9. Run relevant checks and add regression tests when a bug fix could recur.
10. Inspect the final diff for accidental deletions, unrelated formatting churn, secrets, debug output, and generated files.
11. Report what changed, what passed, what did not pass, and what remains uncertain.
12. Stop at the stage gate rather than automatically continuing into the next stage.

## 25.2 Prohibited implementation habits

- Do not mark a phase complete because code was generated.
- Do not claim success from a compile-only check when the task concerns runtime behavior.
- Do not delete a component because its intended use is unclear; inspect references first.
- Do not add duplicate state, duplicate model registries, or duplicate component libraries without a clear reason.
- Do not solve message-part problems by regex-stripping assistant text.
- Do not weaken Tauri permissions to make a command work quickly.
- Do not replace missing functionality with a fake successful response.
- Do not silently downgrade credential storage.
- Do not create an unlimited agent loop.
- Do not expose local file contents or credentials in logs or the transcript.
- Do not make broad, speculative rewrites across the whole app in a single change.

## 25.3 Per-task report template

Every task report should include:

- **Stage/goal:**
- **Root cause or rationale:**
- **Files inspected:**
- **Files changed:**
- **Existing components reused:**
- **Behavior implemented:**
- **Tests/checks run:**
- **Results:**
- **Security/privacy impact:**
- **Known limitations:**
- **Deviations from plan:**
- **Next stage recommendation:**

## 25.4 Definition of a safe commit-sized unit

A unit should address one coherent concern and be small enough to review. Examples include repairing tool-part rendering, adding a label map, wiring one model selection path, or adding Rust path validation. Avoid combining a theme redesign, backend protocol rewrite, keychain migration, and attachment implementation in one patch.

---

# 26. First task to give the coding agent

Copy the following prompt as the first task. It deliberately requests an audit only.

> **Task: Audit the existing AI app against the new master specification. Do not modify source code yet.**
>
> Read the entire master specification first. Inspect the repository and determine the actual state of the application, including its UI component library, chat composer, transcript/message renderer, Chat/Agent mode, hosted model selection, local-model selection, workspace/folder selection, tool registration/execution/rendering, Tauri commands and capabilities, Node backend (if present), credential handling, tests, and build scripts.
>
> Do not assume that the old plan's “implemented” claims are true. Trace each important feature to its real code path and run safe checks where possible. Identify exactly why any tool names, tool arguments, tool JSON, or tool results may appear as normal chat text. Separate a structured tool-rendering bug from a model voluntarily narrating its activity in natural language; do not propose regex deletion of ordinary assistant prose as the primary fix.
>
> Produce the audit report required by Section 2.3: component inventory, feature matrix, request/data-flow diagram, baseline checks, differences between the repository and the plan, security boundaries, and a staged implementation recommendation. Include file paths and concrete evidence. Record all package versions from the lockfile and verify API assumptions against those versions. Do not install dependencies, regenerate components, reformat the whole repository, or change source files in this task.
>
> Finish by recommending the smallest high-value implementation stage and its acceptance tests. Stop after the report.

---

# 27. Required project documentation

After the implementation stages that affect each area, maintain the following documentation in the repository using its existing documentation conventions:

- **README:** prerequisites, setup, how to start the frontend/backend/desktop shell, model configuration, local model requirements, and troubleshooting.
- **Architecture overview:** UI/runtime/backend/provider/Tauri boundaries and actual request flow.
- **Component catalog:** reusable components, owned wrappers, generated/vendor files, and local customizations.
- **Configuration reference:** every env/config key, default, scope, and behavior when unset.
- **Tool registry reference:** each retained tool's name, purpose, schema, execution location, permissions, limits, renderer, and tests.
- **Security notes:** workspace root rules, Tauri capabilities, credential storage, local backend binding, redaction, and known limitations.
- **Testing guide:** exact commands and manual end-to-end scenarios.
- **Known limitations/roadmap:** persistence, attachment gaps, packaging/sidecar requirements, and any deliberately deferred tools.

Keep documentation in sync with the actual repository; do not leave references to nonexistent files or commands.

---

# 28. Repository hygiene and release checks

- Confirm the intended Git repository root. Investigate the old plan's note about a stray `.git` directory; do not delete or initialize version control without inspecting the current state and preserving history.
- Verify ignore rules exclude `.env.local`, provider credentials, logs, generated secrets, and user-specific test data.
- Never print secret values while debugging configuration.
- Remove temporary probes and one-off scripts that are not part of an intentional test suite, or move them into documented tests.
- Confirm there is one authoritative package manager/lockfile and one documented command for each common action.
- Do not perform destructive clean-up commands without examining what they would remove.
- Before release, build from a clean checkout or otherwise verify that required files are tracked and the app does not depend on an accidental local artifact.
- If desktop packaging still lacks a supported Node sidecar or hosted-backend configuration, state clearly that the app is not ready for distribution rather than representing a development-only launch as a production build.

---

# 29. External documentation to verify during implementation

Use these references to confirm concepts, then select documentation matching the versions installed in the project:

- AI SDK tool calling and bounded multi-step execution: https://ai-sdk.dev/docs/ai-sdk-core/tools-and-tool-calling
- AI SDK agent loop control: https://ai-sdk.dev/docs/agents/loop-control
- assistant-ui tool registration: https://www.assistant-ui.com/docs/tools
- assistant-ui tool-specific rendering: https://www.assistant-ui.com/docs/tools/tool-ui
- assistant-ui tool definitions: https://www.assistant-ui.com/docs/tools/defining-tools
- Tauri v2 capabilities: https://tauri.app/security/capabilities/
- Tauri v2 permissions: https://tauri.app/security/permissions/
- OpenRouter model listing and model metadata: verify the current official documentation from the installed integration and chosen endpoint before coding; normalize the response and do not depend on undocumented fields.

Documentation is a reference, not permission to replace the architecture. Confirm version compatibility, validate the actual API contract, and test the integrated behavior.

---

# 30. Final success criteria

The application is ready for its next milestone only when all of the following are true:

1. The repository has been audited and the true baseline is documented.
2. The coding agent can identify and reuse the existing UI components instead of rebuilding them.
3. Normal chat is stable and the transcript preserves typed message parts.
4. Tool calls/results never leak into ordinary chat prose as raw protocol payloads.
5. Tool activity has clear labels and complete lifecycle states.
6. Chat and Agent modes have intentional, tested differences.
7. Model selection controls the actual provider/model request and capability flags are honest.
8. Local-model selection has a verified adapter and does not silently route local content to a hosted provider.
9. Workspace access is scoped, validated in Rust, and permissioned.
10. Credentials are handled through a documented secure path and are never logged.
11. Attachments are either genuinely supported end-to-end or honestly unavailable.
12. Errors, timeouts, cancellations, and partial results leave the UI in understandable terminal states.
13. Existing prebuilt components and design tokens are used consistently.
14. Core workflows are keyboard accessible and behave correctly in supported themes and window sizes.
15. Automated checks and focused end-to-end tests pass, and failures are reported honestly.
16. Packaging, persistence, and other deferred capabilities are documented rather than falsely implied to work.

**Operating principle:** audit first, preserve what works, fix root causes, build one coherent layer at a time, and require evidence before marking anything complete.
