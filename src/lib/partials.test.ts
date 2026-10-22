/**
 * The journal of answers that are still being written.
 *
 * The parts that decide something are tested here. The parts that talk to
 * the disk are the platform's business, and are tested on the platform.
 */

import { describe, it } from "node:test"
import assert from "node:assert/strict"

import {
  growthWarrantsAWrite,
  journalIsTheNewerCopy,
  parseJournal,
  type PartialAnswer,
} from "./partials.ts"

/** A line as the journal writes it. */
const line = (
  text: string,
  stopReason: "end_turn" | "stopped" | null,
  id = "m-1"
) =>
  JSON.stringify({
    id,
    role: "assistant",
    side: "chat",
    text,
    stopReason,
    timestamp: "2026-10-22T10:30:00.000Z",
  })

describe("the journal", () => {
  it("reads the last line, which has the whole of the answer", () => {
    const answer = parseJournal({
      id: "c-mfz3k-8a2b1c",
      contents: [
        line("The answer ", null),
        line("The answer so far, ", null),
        line("The answer so far, as it arrives.", "end_turn"),
      ].join("\n"),
    })
    assert.ok(answer)
    assert.equal(answer.text, "The answer so far, as it arrives.")
    assert.equal(answer.threadId, "c-mfz3k-8a2b1c")
    assert.equal(answer.turnId, "m-1")
    assert.equal(answer.side, "chat")
  })

  it("says an answer that did not finish was cut off", () => {
    const answer = parseJournal({
      id: "c-mfz3k-8a2b1c",
      contents: line("Half an ans", null),
    })
    assert.ok(answer)
    assert.equal(answer.stopped, true)
  })

  it("says an answer that finished is whole", () => {
    const answer = parseJournal({
      id: "c-mfz3k-8a2b1c",
      contents: line("The whole thing.", "end_turn"),
    })
    assert.ok(answer)
    assert.equal(answer.stopped, false)
  })

  it("keeps the answer before a line the crash cut in half", () => {
    /* A crash in the middle of a write leaves half a line at the end of the
       file. The half line is not a fact about the answer, and the line before
       it is the answer as it was a moment earlier — which is the one wanted. */
    const answer = parseJournal({
      id: "c-mfz3k-8a2b1c",
      contents: [
        line("The whole answer so far.", null),
        '{"id":"m-1","role":"assistant","side":"chat","text":"The whole ans',
      ].join("\n"),
    })
    assert.ok(answer)
    assert.equal(answer.text, "The whole answer so far.")
    assert.equal(answer.stopped, true)
  })

  it("skips a line that is not a line at all", () => {
    const answer = parseJournal({
      id: "c-mfz3k-8a2b1c",
      contents: [
        "not json",
        JSON.stringify({ id: "m-1", side: "chat" }),
        line("The answer.", "end_turn"),
      ].join("\n"),
    })
    assert.ok(answer)
    assert.equal(answer.text, "The answer.")
  })

  it("reads nothing out of an empty journal", () => {
    assert.equal(parseJournal({ id: "c-mfz3k", contents: "" }), null)
    assert.equal(parseJournal({ id: "c-mfz3k", contents: "\n\n" }), null)
  })

  it("reads nothing out of a journal of lines that are not answers", () => {
    const answer = parseJournal({
      id: "c-mfz3k",
      contents: JSON.stringify({ id: "m-1", side: "chat", text: 42 }),
    })
    assert.equal(answer, null)
  })
})

describe("which copy of an answer is the answer", () => {
  const answer = (text: string): PartialAnswer => ({
    threadId: "c-mfz3k-8a2b1c",
    turnId: "m-1",
    side: "chat",
    text,
    stopped: true,
  })

  it("takes the journal when the conversation has no such turn", () => {
    assert.equal(journalIsTheNewerCopy(undefined, answer("anything")), true)
  })

  it("takes the journal when it is longer", () => {
    assert.equal(
      journalIsTheNewerCopy({ text: "half" }, answer("the whole thing")),
      true
    )
  })

  it("keeps the conversation when it is longer", () => {
    /* The answer finished, was written to the conversation, and the journal
       was not removed before the app died. The conversation is the newer
       copy, and the journal is the leftover. */
    assert.equal(
      journalIsTheNewerCopy({ text: "the whole thing" }, answer("half")),
      false
    )
  })

  it("keeps the conversation when the two are the same length", () => {
    assert.equal(
      journalIsTheNewerCopy({ text: "the same" }, answer("the same")),
      false
    )
  })
})

describe("when the answer is written again", () => {
  it("waits for a kilobyte before writing a short answer", () => {
    assert.equal(growthWarrantsAWrite(0, 500), false)
    assert.equal(growthWarrantsAWrite(0, 1024), true)
  })

  it("writes a long answer less often than it is written", () => {
    /* A hundred kilobyte answer is not written a hundred times over. The
       threshold grows with the answer, so the whole journal stays about
       eight times the size of the answer rather than its square. */
    const written = 100_000
    assert.equal(growthWarrantsAWrite(written, written + 1_024), false)
    assert.equal(growthWarrantsAWrite(written, written + 12_500), true)
  })

  it("counts what has been written, not what has arrived", () => {
    /* Nothing has arrived since the last write, so there is nothing to
       write. */
    assert.equal(growthWarrantsAWrite(5_000, 5_000), false)
  })
})
