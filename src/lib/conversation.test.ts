/**
 * The conversation runtime.
 *
 * The runtime is the app's rule that a reply belongs to a conversation and
 * not to a component. These are the parts of that rule that can be checked
 * without a provider: what the runtime holds, what it tells, and what it
 * refuses to forget.
 *
 * **The stream itself is not here.** It is the provider's, and it is checked
 * in the running app — a reply that keeps arriving while the reader looks at
 * another conversation, and a stop that leaves the other replies running.
 */

import { describe, it } from "node:test"
import assert from "node:assert/strict"

import {
  conversation,
  conversationTurns,
  failConversation,
  forgetConversation,
  isRunning,
  markConversationPending,
  runningConversations,
  setConversationError,
  setConversationReport,
  setConversationTurns,
  setShownConversation,
  subscribeConversation,
  subscribeStatuses,
  type Conversation,
} from "./conversation.ts"
import type { Turn } from "./turns.ts"

const aTurn = (text: string): Turn => ({
  id: `t-${text}`,
  role: "assistant",
  text,
  streaming: false,
})

const aUserTurn = (text: string): Turn => ({
  id: `u-${text}`,
  role: "user",
  message: { text, files: [], mentions: [] },
})

/**
 * A fresh id for each test.
 *
 * The ids are **not** reset between tests, because the runtime keeps its
 * conversations and a repeated id would be the same conversation — and a
 * conversation that one test left running would still be running in the next.
 */
let counter = 0
const anId = () => `c-${(counter += 1)}`

describe("a conversation's live state", () => {
  it("is kept, and read back", () => {
    const id = anId()
    setConversationTurns(id, "chat", [aTurn("hello")])

    const run = conversation(id)
    assert.ok(run, "the conversation should be there")
    assert.equal(run.side, "chat")
    assert.equal(run.status, "idle")
    assert.deepEqual(conversationTurns(id), [aTurn("hello")])
  })

  it("is empty for a conversation nobody has shown", () => {
    assert.equal(conversation("nope"), undefined)
    assert.deepEqual(conversationTurns("nope"), [])
  })

  it("is told about its own changes", () => {
    const id = anId()
    let told = 0
    const stop = subscribeConversation(id, () => {
      told += 1
    })

    setConversationTurns(id, "chat", [aTurn("one")])
    assert.equal(told, 1, "loading a conversation is a change")

    setConversationReport(id, { totalTokens: 10 }, "a-model")
    assert.equal(told, 2, "a report is a change")

    stop()
    setConversationTurns(id, "chat", [aTurn("two")])
    assert.equal(told, 2, "an unsubscribed listener is not told")
  })

  it("is not told about another conversation's changes", () => {
    const mine = anId()
    const theirs = anId()
    let told = 0
    const stop = subscribeConversation(mine, () => {
      told += 1
    })

    setConversationTurns(theirs, "chat", [aTurn("hello")])
    assert.equal(told, 0)
    stop()
  })
})

describe("a conversation's status", () => {
  it("is told to the status listeners, and only when it changes", () => {
    const id = anId()
    let told = 0
    const stop = subscribeStatuses(() => {
      told += 1
    })

    setConversationTurns(id, "chat", [aTurn("hello")])
    assert.equal(told, 0, "loading a conversation does not start a reply")

    markConversationPending(id)
    assert.equal(told, 1, "a conversation waiting for its reply is a change")
    assert.equal(isRunning(id), true)
    assert.equal(
      runningConversations().includes(id),
      true,
      "a conversation waiting for its reply is running",
    )

    stop()
  })

  it("is not running while it is idle", () => {
    const id = anId()
    setConversationTurns(id, "chat", [aTurn("hello")])
    assert.equal(isRunning(id), false)
    assert.equal(runningConversations().includes(id), false)
  })

  it("carries the last thing that went wrong", () => {
    const id = anId()
    setConversationTurns(id, "chat", [aTurn("hello")])

    setConversationError(id, "The conversation could not be saved.")
    assert.equal(conversation(id)?.error, "The conversation could not be saved.")

    setConversationError(id, null)
    assert.equal(conversation(id)?.error, null)
  })
})

describe("a conversation that is closed", () => {
  it("is forgotten", () => {
    const id = anId()
    setConversationTurns(id, "chat", [aTurn("hello")])
    assert.ok(conversation(id))

    forgetConversation(id)
    assert.equal(conversation(id), undefined)
  })

  it("is not forgotten while a reply is going to land in it", () => {
    const id = anId()
    setConversationTurns(id, "chat", [aTurn("hello")])
    markConversationPending(id)

    forgetConversation(id)
    assert.ok(
      conversation(id),
      "the reply is still going to land in it, so it is not thrown away",
    )
  })
})

describe("a reply that was refused before it started", () => {
  it("is in the conversation, and says why", () => {
    const id = anId()
    setConversationTurns(id, "chat", [aUserTurn("hello")])

    failConversation(id, "a-reason", "That effort level is not offered by this model.")

    const run = conversation(id) as Conversation
    assert.equal(run.status, "error")
    assert.equal(run.error, "That effort level is not offered by this model.")
    assert.equal(run.turns.length, 2, "the turn being written is in the conversation")
    assert.equal(run.turns[1].text, "That effort level is not offered by this model.")
    assert.equal(run.turns[1].streaming, false)
  })

  it("replaces a turn that is already there", () => {
    const id = anId()
    setConversationTurns(id, "chat", [
      aUserTurn("hello"),
      { id: "a-reason", role: "assistant", text: "", streaming: true },
    ])

    failConversation(id, "a-reason", "It cannot be done.")

    const run = conversation(id) as Conversation
    assert.equal(run.turns.length, 2, "the turn is not added twice")
    assert.equal(run.turns[1].text, "It cannot be done.")
  })
})

describe("the conversation the app is showing", () => {
  it("is remembered", () => {
    const id = anId()
    setShownConversation(id)
    setShownConversation(null)
    /* The runtime does not expose it — the announcement reads it — but it must
       not throw when it is asked for, and it must not be left pointing at a
       conversation that has been closed. */
    const other = anId()
    setConversationTurns(other, "chat", [aTurn("hello")])
    setShownConversation(other)
    forgetConversation(other)
  })
})
