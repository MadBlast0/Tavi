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
 */

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
    instruction:
      "You are helping with a real local repository. You have no tools: you cannot " +
      "run commands, browse the folder, or write files, and you can only see the files " +
      "inlined with the request. Describe the commands you would run rather than " +
      "implying you ran them. When you propose a change, give the exact edit as a " +
      "unified diff or a complete file body, and name every path involved. Prefer the " +
      "smallest change that fully solves the problem, and say so plainly if something " +
      "is ambiguous rather than guessing.",
  },
  {
    value: "plan",
    label: "Plan",
    description: "Investigates, then proposes steps before acting",
    placeholder: "What should we plan?",
    instruction:
      "Do not propose edits yet. Investigate only the code and files you were given, " +
      "then reply with an ordered plan: which files to touch, what changes in each, " +
      "and the order to apply them. Name anything you could not verify from the " +
      "material provided.",
  },
  {
    value: "ask",
    label: "Ask",
    description: "Answers without editing anything",
    placeholder: "Ask about the codebase",
    instruction:
      "Answer the question directly and do not propose edits. If the answer depends " +
      "on code you were not shown, say which file you would need and stop there " +
      "rather than inventing its contents.",
  },
]

/** The mode a value names, or the first one when it names none. */
export const modeFor = (value: string): ModeDefinition =>
  MODES.find((mode) => mode.value === value) ?? MODES[0]
