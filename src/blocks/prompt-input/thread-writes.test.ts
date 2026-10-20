import { test } from "node:test";
import assert from "node:assert/strict";

import {
  replyMayTouchComposer,
  threadIdFor,
} from "./thread-writes.ts";

/**
 * The two rules that keep a chat and a code session apart.
 *
 * Both of them go wrong in the same way — by letting one side's conversation
 * end up under the other side's composer — and both of them only misbehave
 * when the user changes something while a reply is on its way. So they are
 * checked here, where the timing can be written down.
 */

test("a turn belongs to the thread its own side has open", () => {
  assert.equal(threadIdFor("chat", { side: "chat", id: "c-1" }), "c-1");
  assert.equal(threadIdFor("code", { side: "code", id: "s-1" }), "s-1");
});

test("a turn sent on a side with no thread makes one", () => {
  assert.equal(threadIdFor("chat", { side: "chat", id: null }), null);
  assert.equal(threadIdFor("code", { side: "code", id: null }), null);
});

test("a turn never lands on the other side's thread", () => {
  /* The composer is showing Code, and a chat turn is sent. */
  assert.equal(threadIdFor("chat", { side: "code", id: "s-1" }), null);
  /* And the other way round. */
  assert.equal(threadIdFor("code", { side: "chat", id: "c-1" }), null);
});

test("a reply may touch the composer while it is still on that side", () => {
  assert.equal(
    replyMayTouchComposer("chat", "c-1", { side: "chat", id: "c-1" }),
    true,
  );
  assert.equal(
    replyMayTouchComposer("code", "s-1", { side: "code", id: "s-1" }),
    true,
  );
});

test("a reply may not touch the composer after the user has switched", () => {
  assert.equal(
    replyMayTouchComposer("chat", "c-1", { side: "code", id: "s-1" }),
    false,
  );
  assert.equal(
    replyMayTouchComposer("code", "s-1", { side: "chat", id: "c-1" }),
    false,
  );
});

test("a reply may not touch the composer after the user has pressed New", () => {
  /* "New" on the same side leaves no thread open, and the reply that was on
     its way belongs to the thread that was just closed. */
  assert.equal(
    replyMayTouchComposer("chat", "c-1", { side: "chat", id: null }),
    false,
  );
});

test("the first message of a thread may touch the composer", () => {
  /* It was asked before the thread existed, so its id is filled in by the
     write that makes it — and by then the composer is showing that thread. */
  assert.equal(
    replyMayTouchComposer("chat", "c-1", { side: "chat", id: "c-1" }),
    true,
  );
});
