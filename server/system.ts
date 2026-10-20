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
 */

import { modeFor } from "../src/lib/modes.ts"

/** The two surfaces a request can come from. */
export type Variant = "chat" | "code"

/**
 * What a chat is told.
 *
 * A chat is a conversation. It has no repository, no tools and no folder: the
 * model can only see the text and the attachments that came with the request,
 * and it says so plainly rather than implying that it read a file it did not.
 */
const CHAT_INSTRUCTION =
  "You are having a conversation. You have no tools: you cannot run commands, " +
  "browse the machine, or read or write any file, and you can only see the text " +
  "and the attachments that were sent with this request. Answer the question " +
  "directly. If a question would need a file you were not given, say which file " +
  "you would need and stop there rather than inventing its contents."

/**
 * What a code session is told about the folder it is pointed at.
 *
 * It says plainly that the model cannot browse or write it, because the
 * alternative is a model claiming to have edited files it never touched.
 */
const folderParagraph = (folderName: string): string =>
  `The user has opened the local folder "${folderName}". File contents inlined ` +
  `below were read from it before the request was sent. You cannot browse that ` +
  `folder, run commands, or write to it — say so plainly instead of implying ` +
  `that you did.`

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
  if (request.variant === "chat") return CHAT_INSTRUCTION

  const parts = [modeFor(request.mode ?? "").instruction]
  if (request.folderName) parts.push(folderParagraph(request.folderName))
  return parts.join("\n\n")
}
