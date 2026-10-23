/**
 * The turns of a conversation, and how they are written down.
 *
 * A conversation is a list of turns, and there are two shapes of it: the
 * **live** one, which the app draws and sends, and the **stored** one, which
 * is what a conversation file holds. They are different shapes because the
 * live one carries what cannot be stored — the file a user attached, the
 * caret, the streaming flag — and the stored one carries what can.
 *
 * **They live here rather than in the composer** because the conversation
 * runtime needs them too: the runtime owns a conversation's turns while a
 * reply is being written, and the composer is only the thing that draws
 * them.
 */

import type { PromptMessage } from "@/blocks/prompt-input/prompt-input"
import type { PromptFile } from "@/blocks/prompt-input/use-prompt-files"
import type { ToolActivity } from "./api.ts"
import type { StoredTurn } from "./threads.ts"
import type { WorkspaceFile } from "./workspace.ts"

/** A turn, as the app draws it and sends it. */
export type Turn =
  | { id: string; role: "user"; message: PromptMessage }
  | {
      id: string
      role: "assistant"
      text: string
      streaming: boolean
      stopped?: boolean
      /** It did not finish — the app died, or was closed, while it was being written. */
      incomplete?: boolean
      /**
       * The tools the agent used.
       *
       * Only a CLI provider has tools, so only a CLI provider's turns carry
       * them. What an agent did is part of what it said: the answer alone
       * does not say which files were read or which commands ran.
       */
      tools?: ToolActivity[]
    }
  /** A model-written summary of everything above it; sent with later requests. */
  | { id: string; role: "summary"; text: string }

/** How much of an attachment is worth sending. */
export const MAX_ATTACHMENT_BYTES = 400 * 1024

/**
 * Reads an attachment into the prompt. Anything binary or oversized is stated
 * plainly rather than dropped, so the model knows it was referenced.
 */
export const attachmentText = async (file: PromptFile): Promise<string> => {
  if (file.pasted?.text) return file.pasted.text
  try {
    const blob = file.file
    if (blob.size > MAX_ATTACHMENT_BYTES) return "[Attached file is too large to inline.]"
    const textual =
      blob.type.startsWith("text/") ||
      /^application\/(json|xml|yaml|javascript|typescript|toml)$/.test(blob.type)
    if (!textual) return "[Attached file is not text and was not sent.]"
    return await blob.text()
  } catch {
    return "[Attached file could not be read.]"
  }
}

/** How many lines a piece of text is. */
export const countLines = (text: string): number => text.split("\n").length

/** Captures attachment text so a restored thread still carries its context. */
export const toStoredTurns = async (
  list: Turn[],
  known: WorkspaceFile[],
): Promise<StoredTurn[]> =>
  Promise.all(
    list.map(async (turn): Promise<StoredTurn> => {
      if (turn.role === "summary") return { id: turn.id, role: "summary", text: turn.text }
      if (turn.role === "assistant") {
        return {
          id: turn.id,
          role: "assistant",
          text: turn.text,
          ...(turn.stopped ? { stopped: true } : {}),
          ...(turn.incomplete ? { incomplete: true } : {}),
          ...(turn.tools && turn.tools.length > 0 ? { tools: turn.tools } : {}),
        }
      }
      const files = await Promise.all(
        turn.message.files.map(async (file) => ({
          name: file.name,
          size: file.size,
          text: (await attachmentText(file)).slice(0, 20_000),
        })),
      )
      return {
        id: turn.id,
        role: "user",
        text: turn.message.text,
        files,
        mentions: turn.message.mentions.map((mention) => ({
          label: mention.label,
          ...(known.some((file) => file.path === mention.id) ? { path: mention.id } : {}),
        })),
      }
    }),
  )

/**
 * Rebuilds the view's turns from storage. Attachment text is restored through
 * `pasted`, which `attachmentText` reads first — the original `File` object
 * cannot survive a reload, and re-reading an empty blob would send nothing.
 */
export const fromStoredTurns = (list: StoredTurn[]): Turn[] =>
  list.map((turn) => {
    if (turn.role === "summary") return { id: turn.id, role: "summary", text: turn.text }
    if (turn.role === "assistant") {
      return {
        id: turn.id,
        role: "assistant",
        text: turn.text,
        streaming: false,
        ...(turn.stopped ? { stopped: true } : {}),
        ...(turn.incomplete ? { incomplete: true } : {}),
        ...(turn.tools && turn.tools.length > 0 ? { tools: turn.tools } : {}),
      }
    }
    return {
      id: turn.id,
      role: "user",
      message: {
        text: turn.text,
        files: turn.files.map((file, index) => ({
          id: `${turn.id}-f${index}`,
          file: new File([], file.name),
          name: file.name,
          size: file.size,
          type: "text/plain",
          state: "done" as const,
          ...(file.text !== undefined
            ? { pasted: { text: file.text, lines: countLines(file.text) } }
            : {}),
        })),
        mentions: turn.mentions.map((mention, index) => ({
          id: mention.path ?? `${turn.id}-m${index}`,
          label: mention.label,
        })),
      },
    }
  })
