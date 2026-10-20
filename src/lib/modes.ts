/**
 * The agent behaviours a code session can run in.
 *
 * Each mode carries the instruction that is actually sent with the request, so
 * switching modes changes how the model behaves rather than only how the button
 * reads.
 *
 * The instructions live here rather than in the composer because the **server**
 * writes the system prompt. The composer sends the facts — which mode, which
 * folder — and the server decides what the model is told. A rule the client
 * could change is not a rule, and the client is the part of the system a bug is
 * most likely to be in.
 *
 * The instruction text itself is in `shared/instructions.json`, which the Rust
 * side reads as well. There are two servers — the Node one that serves the
 * website and the Rust one that serves the desktop app — and a model told two
 * different things by two halves of the same app would be a bug waiting to
 * happen.
 */

import instructions from "../../shared/instructions.json" with { type: "json" }

/** The behaviours a code session can run in. */
export type AgentMode = "edit" | "plan" | "ask"

export type ModeDefinition = {
  value: AgentMode
  label: string
  /** What the picker says the mode does. */
  description: string
  /** What the composer says in place of the text. */
  placeholder: string
  /** What the model is told when this mode is in force. */
  instruction: string
}

export const MODES: ModeDefinition[] = [
  {
    /* "edit", not "code": the Code layout already owns that word, and a mode
       that repeats its container's name reads as a duplicate control. */
    value: "edit",
    label: "Edit",
    description: "Proposes file edits and commands",
    placeholder: "Describe a change to make",
    instruction: instructions.modes.edit,
  },
  {
    value: "plan",
    label: "Plan",
    description: "Investigates, then proposes steps before acting",
    placeholder: "What should we plan?",
    instruction: instructions.modes.plan,
  },
  {
    value: "ask",
    label: "Ask",
    description: "Answers without editing anything",
    placeholder: "Ask about the codebase",
    instruction: instructions.modes.ask,
  },
]

/** The mode a value names, or the first one when it names none. */
export const modeFor = (value: string): ModeDefinition =>
  MODES.find((mode) => mode.value === value) ?? MODES[0]
