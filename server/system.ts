/**
 * The system prompt.
 *
 * The **server** writes it. The client used to build it and send it as prose,
 * which meant a rule about what a chat may be told was a rule the client
 * could ignore — and the client is the part of the system a bug is most likely
 * to be in. The client now sends the facts: which surface the request came
 * from, which agent mode, which folder. The server decides what the model is
 * told.
 *
 * This is the same rule Claude's own Chat surface is built on: "these
 * restrictions are enforced in the app's main process, not just hidden in the
 * UI."
 *
 * There are two servers: this one, which serves the website, and the Rust one
 * that serves the desktop app. Both read the same instruction text, out of
 * `shared/instructions.json`, so a model is told the same thing whichever
 * surface it was asked on.
 */

import { modeFor } from "../src/lib/modes.ts"
import instructions from "../shared/instructions.json" with { type: "json" }

/** The two surfaces a request can come from. */
export type Variant = "chat" | "code"

/**
 * What a code session is told about the folder it is pointed at.
 *
 * It says plainly that the model cannot browse or write it, because the
 * alternative is a model claiming to have edited files it never touched.
 */
const folderParagraph = (folderName: string): string =>
  instructions.folder.replace("{name}", folderName)

/**
 * The system prompt for a request.
 *
 * A chat gets the chat instruction and nothing else — no folder, no agent
 * mode, because a chat has neither. A code session gets its mode's
 * instruction and, when it has one, the folder paragraph.
 */
export const buildSystemPrompt = (request: {
  variant: Variant
  /** The agent mode. Code only. */
  mode?: string
  /** The folder's name. Code only. */
  folderName?: string | null
}): string => {
  if (request.variant === "chat") return instructions.chat

  const parts = [modeFor(request.mode ?? "").instruction]
  if (request.folderName) parts.push(folderParagraph(request.folderName))
  return parts.join("\n\n")
}
