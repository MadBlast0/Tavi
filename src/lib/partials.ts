/**
 * The journal of answers that are still being written.
 *
 * An answer that is being written exists in memory until it ends. If the app
 * dies while it is being written, the answer is gone: there was nothing on
 * disk between the message being sent and the answer finishing.
 *
 * This is the journal that closes that window. Each conversation gets a file
 * of its own, and the file is **appended to** — a line is added as the answer
 * grows, and nothing already written is ever rewritten. That makes a write
 * cheap enough to do often, and it makes a crash able to lose only the last
 * line rather than the whole answer.
 *
 * ## The shape of a line
 *
 * Every line carries the whole of the answer as it has arrived so far, and
 * the lines of one answer share a turn id. The last line of an answer that
 * finished says so; a journal whose last line does not is an answer that was
 * cut off.
 *
 * Carrying the whole answer rather than only what is new is what makes a
 * crash cheap to survive. A line that was cut in half by the crash is
 * discarded, and the line before it — which has the whole of the answer as it
 * was a moment earlier — is still there. A journal of only the new text would
 * lose the piece the half-written line was carrying.
 *
 * The cost is that the journal holds the answer several times over, and the
 * flush rule below is what keeps that to a small multiple rather than a
 * square.
 *
 * ## The flush rule
 *
 * A write per token is I/O the app does not need, so the text is buffered.
 * The buffer is written when the answer has grown by at least a kilobyte
 * since the last write, or by at least an eighth of what has been written so
 * far — whichever is more — so the journal grows geometrically and the whole
 * of it stays about eight times the size of the answer. A slow answer is
 * written anyway, every two seconds, so that a crash costs seconds rather
 * than the whole turn.
 */

import {
  appendPartial,
  clearPartial as clearPartialOperation,
  clearPartials as clearPartialsOperation,
  readPartials as readPartialsOperation,
  type PartialJournal,
  type PartialLine,
} from "./api.ts"
import { findChat, saveChat, chatWriteError } from "./chats.ts"
import { findSession, saveSession, sessionWriteError } from "./sessions.ts"
import type { Side } from "./sides.ts"
import type { StoredTurn } from "./threads.ts"

/** How much the answer has to grow before the journal is written again. */
const MIN_GROWTH = 1024

/** How often a slow answer is written anyway. */
const FLUSH_MS = 2000

/** An answer that is being written. */
type Open = {
  /** The turn the answer belongs to. Every line of it shares this. */
  id: string
  side: Side
  model?: string
  /** The whole of the answer as it has arrived. */
  text: string
  /** How much of it has been written. */
  written: number
  /** The write that is in flight, so the last one can wait for it. */
  writing: Promise<void> | null
}

/** The answers being written, by the conversation they belong to. */
const open = new Map<string, Open>()

/** The timer that writes the slow ones. */
let ticker: number | null = null

/**
 * An answer as it is read back from a journal.
 *
 * `stopped` says the answer did not finish — it was cut off, rather than
 * having been answered. It is the same flag a stopped answer carries, because
 * from the reader's side they are the same thing.
 */
export type PartialAnswer = {
  /** The conversation the answer belongs to. */
  threadId: string
  /** The turn the answer is. */
  turnId: string
  /** Which side it was asked on. */
  side: Side
  /** The model it was asked with, when there was one. */
  model?: string
  /** The whole of the answer, as far as it got. */
  text: string
  /** Whether it was cut off rather than finished. */
  stopped: boolean
}

/** The line as it is written. */
const lineFor = (
  state: Open,
  stopReason: PartialLine["stopReason"]
): PartialLine => ({
  id: state.id,
  role: "assistant",
  side: state.side,
  ...(state.model ? { model: state.model } : {}),
  text: state.text,
  stopReason,
  timestamp: new Date().toISOString(),
})

/** Writes one line. A write that fails is not worth stopping an answer for. */
const writeLine = async (
  threadId: string,
  line: PartialLine
): Promise<void> => {
  try {
    await appendPartial(threadId, JSON.stringify(line))
  } catch {
    /* The answer is still in memory, and the finished answer is still written
       to the conversation. A journal that could not be written is a smaller
       loss than an answer that was not. */
  }
}

/**
 * Writes the answer as it stands, and remembers how much of it is down.
 *
 * The write is remembered so that the last one can wait for it: a write that
 * is still in flight when the answer ends would otherwise land after the
 * journal was removed, and put it back.
 */
const flush = (threadId: string, state: Open): Promise<void> => {
  const writing = writeLine(threadId, lineFor(state, null))
  state.written = state.text.length
  state.writing = writing
  return writing
}

/** Whether the answer has grown enough to be worth writing again. */
const shouldFlush = (state: Open): boolean =>
  state.text.length - state.written >= Math.max(MIN_GROWTH, state.written / 8)

/**
 * Whether the answer has grown enough to be worth writing again.
 *
 * The rule is in two parts because there are two things to be careful of. A
 * short answer must be written whole rather than in pieces, so there is a
 * floor of a kilobyte. A long answer must not be written over and over in
 * full, so the threshold grows with the answer — by an eighth of what has
 * been written — which keeps the whole journal about eight times the size of
 * the answer rather than its square.
 */
export const growthWarrantsAWrite = (written: number, length: number): boolean =>
  length - written >= Math.max(MIN_GROWTH, written / 8)

/**
 * Whether the journal's answer should replace the one in the conversation.
 *
 * A journal and a conversation can disagree, and they can only disagree in
 * one direction. The journal is written while the answer is being written and
 * the conversation is written when it ends, so the journal is never behind —
 * except when the answer finished, was written to the conversation, and the
 * journal was not removed before the app died. In that case the conversation
 * is the newer copy.
 *
 * Comparing the two settles it without a timestamp that could be wrong: the
 * longer one is the answer, and the shorter one is thrown away.
 */
export const journalIsTheNewerCopy = (
  existing: { text: string } | undefined,
  answer: PartialAnswer
): boolean => {
  if (!existing) return true
  return answer.text.length > existing.text.length
};

/** Starts the timer that writes the slow answers. */
const startTicker = () => {
  if (ticker !== null) return
  if (typeof window === "undefined") return
  ticker = window.setInterval(() => {
    for (const [threadId, state] of open) {
      if (state.text.length > state.written) void flush(threadId, state)
    }
  }, FLUSH_MS)
}

/** Stops the timer when there is nothing left to write. */
const stopTickerIfIdle = () => {
  if (open.size > 0 || ticker === null) return
  window.clearInterval(ticker)
  ticker = null
}

/**
 * Starts the journal for an answer that is being written.
 *
 * The conversation is named by its id, and the turn by the id it will have.
 * The turn is what a recovered answer is matched against, so it has to be
 * the same one the conversation will hold.
 */
export const beginPartial = (
  threadId: string,
  turnId: string,
  side: Side,
  model?: string
): void => {
  open.set(threadId, {
    id: turnId,
    side,
    ...(model ? { model } : {}),
    text: "",
    written: 0,
    writing: null,
  })
  startTicker()
}

/**
 * Records the answer as it stands.
 *
 * Called as the text arrives. It does not write on every call — the answer
 * has to grow enough first — so calling it for every token is cheap.
 */
export const writePartial = (threadId: string, text: string): void => {
  const state = open.get(threadId);
  if (!state) return;
  state.text = text;
  if (shouldFlush(state)) void flush(threadId, state);
};

/**
 * Finishes the journal: the last line says the answer finished.
 *
 * The journal is *not* removed here. It is removed once the answer has been
 * written to the conversation, which is a separate thing that can fail — and a
 * journal that outlives a conversation write that failed is exactly what the
 * journal is for.
 *
 * A write that was still in flight is waited for, so that it cannot arrive
 * after the journal is removed and put it back.
 */
export const finishPartial = async (
  threadId: string,
  stopped: boolean
): Promise<void> => {
  const state = open.get(threadId);
  if (!state) return;
  open.delete(threadId);
  stopTickerIfIdle();

  /* Let any write that was in flight land, so it cannot arrive after the
     journal is removed and put it back. */
  if (state.writing) await state.writing;

  await writeLine(threadId, lineFor(state, stopped ? "stopped" : "end_turn"));
};

/**
 * Removes a journal.
 *
 * The answer is in the conversation now, so the journal has done its work.
 * A journal that could not be removed is left where it is: the next launch
 * reads it, finds that the conversation already has a longer answer, and
 * removes it then.
 */
export const discardPartial = async (threadId: string): Promise<void> => {
  await clearPartialOperation(threadId);
};

/**
 * Reads a journal into the answer it holds.
 *
 * A line that cannot be read is skipped, and so is one that does not have
 * the shape of a line. A crash in the middle of a write leaves a half-line
 * at the end of the file, and the line before it is the answer as it was a
 * moment earlier — which is the answer we want, not the half-line.
 */
export const parseJournal = (journal: PartialJournal): PartialAnswer | null => {
  let last: PartialLine | null = null;
  for (const raw of journal.contents.split("\n")) {
    const trimmed = raw.trim();
    if (!trimmed) continue;
    let parsed: PartialLine;
    try {
      parsed = JSON.parse(trimmed) as PartialLine;
    } catch {
      continue;
    }
    if (!parsed || typeof parsed.text !== "string" || typeof parsed.id !== "string") {
      continue;
    }
    if (parsed.side !== "chat" && parsed.side !== "code") continue;
    last = parsed;
  }
  if (!last) return null;
  return {
    threadId: journal.id,
    turnId: last.id,
    side: last.side,
    ...(last.model ? { model: last.model } : {}),
    text: last.text,
    stopped: last.stopReason === null,
  };
};

/** Every journal that is there, read into the answers they hold. */
export const readAnswers = async (): Promise<PartialAnswer[]> => {
  const journals = await readPartialsOperation();
  const answers: PartialAnswer[] = [];
  for (const journal of journals) {
    const answer = parseJournal(journal);
    if (answer) answers.push(answer);
  }
  return answers;
};

/**
 * Puts the answers that were cut off back into their conversations.
 *
 * A journal and a conversation can disagree, and they can only disagree in
 * one direction. The journal is written while the answer is being written and
 * the conversation is written when it ends, so the journal is never behind —
 * except when the answer finished, was written to the conversation, and the
 * journal was not removed before the app died. In that case the conversation
 * is the newer copy.
 *
 * Comparing the two settles it without a timestamp that could be wrong: the
 * longer one is the answer, and the shorter one is thrown away.
 */
export const recoverAnswers = async (): Promise<void> => {
  const answers = await readAnswers();
  for (const answer of answers) {
    if (answer.side === "chat") {
      await recoverChat(answer);
    } else {
      await recoverSession(answer);
    }
  }
};

/** The turn an answer becomes when it is put back. */
const recoveredTurn = (answer: PartialAnswer): StoredTurn => ({
  id: answer.turnId,
  role: "assistant",
  text: answer.text,
  ...(answer.stopped ? { stopped: true } : {}),
});

/** Puts one cut-off answer back into its chat. */
const recoverChat = async (answer: PartialAnswer): Promise<void> => {
  const chat = findChat(answer.threadId);
  if (!chat) {
    /* The conversations could not be read. The journal is then the only copy
       of the answer, and it is kept — a store that cannot be read is a
       temporary thing, and the answer is worth more than the tidiness of
       having swept it away. */
    if (chatWriteError()) return;
    await clearPartialOperation(answer.threadId);
    return;
  }
  const existing = chat.turns.find((turn) => turn.id === answer.turnId);
  if (existing && existing.role === "assistant") {
    /* The conversation already has this answer, and it is at least as long as
       the journal. The journal is the leftover. */
    if (!journalIsTheNewerCopy(existing, answer)) {
      await clearPartialOperation(answer.threadId);
      return;
    }
  }
  const turns = existing
    ? chat.turns.map((turn) =>
        turn.id === answer.turnId ? recoveredTurn(answer) : turn
      )
    : [...chat.turns, recoveredTurn(answer)];
  await saveChat(answer.threadId, {
    turns,
    ...(chat.model ? { model: chat.model } : {}),
    ...(chat.effort ? { effort: chat.effort } : {}),
    ...(chat.usage ? { usage: chat.usage } : {}),
  });
  await clearPartialOperation(answer.threadId);
};

/** Puts one cut-off answer back into its session. */
const recoverSession = async (answer: PartialAnswer): Promise<void> => {
  const session = findSession(answer.threadId);
  if (!session) {
    /* The same as above: a store that could not be read is not the same as a
       conversation that is not there. */
    if (sessionWriteError()) return;
    await clearPartialOperation(answer.threadId);
    return;
  }
  const existing = session.turns.find((turn) => turn.id === answer.turnId);
  if (existing && existing.role === "assistant") {
    if (!journalIsTheNewerCopy(existing, answer)) {
      await clearPartialOperation(answer.threadId);
      return;
    }
  }
  const turns = existing
    ? session.turns.map((turn) =>
        turn.id === answer.turnId ? recoveredTurn(answer) : turn
      )
    : [...session.turns, recoveredTurn(answer)];
  await saveSession(answer.threadId, {
    turns,
    ...(session.model ? { model: session.model } : {}),
    ...(session.effort ? { effort: session.effort } : {}),
    ...(session.usage ? { usage: session.usage } : {}),
    ...(session.mode ? { mode: session.mode } : {}),
    ...(session.folder ? { folder: session.folder } : {}),
    ...(session.folderName ? { folderName: session.folderName } : {}),
  });
  await clearPartialOperation(answer.threadId);
};

/** Removes every journal. Used when the conversations are removed. */
export const forgetAnswers = async (): Promise<void> => {
  open.clear();
  stopTickerIfIdle();
  await clearPartialsOperation();
};

/**
 * Removes the journals of the conversations on one side.
 *
 * The journals are read first, because which side a journal belongs to is
 * said in the lines of it, and the lines are the frontend's to read.
 */
export const forgetAnswersOnSide = async (side: Side): Promise<void> => {
  const answers = await readAnswers();
  for (const answer of answers) {
    if (answer.side !== side) continue;
    open.delete(answer.threadId);
    await clearPartialOperation(answer.threadId);
  }
  stopTickerIfIdle();
};
