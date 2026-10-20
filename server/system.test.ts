import { test } from "node:test";
import assert from "node:assert/strict";

import { buildSystemPrompt } from "../server/system.ts";

/**
 * The system prompt is the server's, not the client's.
 *
 * These are the rules that make a chat a chat. They are checked here because a
 * rule that only exists in a component is a rule a bug can walk past — and
 * because the prompt is the one thing in the request that decides what the
 * model is allowed to do.
 */

test("a chat is told it is having a conversation", () => {
  const prompt = buildSystemPrompt({ variant: "chat" });
  assert.match(prompt, /conversation/i);
  assert.match(prompt, /no tools/i);
});

test("a chat is told it cannot reach the machine", () => {
  const prompt = buildSystemPrompt({ variant: "chat" });
  assert.match(prompt, /cannot run commands/i);
  assert.match(prompt, /read or write any file/i);
});

test("a chat is not told it is in a repository", () => {
  const prompt = buildSystemPrompt({ variant: "chat" });
  assert.doesNotMatch(prompt, /repository/i);
  assert.doesNotMatch(prompt, /local folder/i);
});

test("a chat ignores the mode and the folder it was sent", () => {
  const chat = buildSystemPrompt({ variant: "chat" });
  const chatWithFacts = buildSystemPrompt({
    variant: "chat",
    mode: "edit",
    folderName: "MyProject",
  });
  assert.equal(chat, chatWithFacts);
});

test("a code session is told what its mode says", () => {
  const edit = buildSystemPrompt({ variant: "code", mode: "edit" });
  const plan = buildSystemPrompt({ variant: "code", mode: "plan" });
  const ask = buildSystemPrompt({ variant: "code", mode: "ask" });

  assert.match(edit, /real local repository/i);
  assert.match(plan, /Do not propose edits yet/i);
  assert.match(ask, /Answer the question directly/i);
  assert.notEqual(edit, plan);
});

test("a code session with no folder is not told about one", () => {
  const prompt = buildSystemPrompt({ variant: "code", mode: "edit" });
  assert.doesNotMatch(prompt, /local folder/i);
});

test("a code session with a folder is told which one, and what it cannot do with it", () => {
  const prompt = buildSystemPrompt({
    variant: "code",
    mode: "edit",
    folderName: "MyProject",
  });
  assert.match(prompt, /"MyProject"/);
  assert.match(prompt, /cannot browse that folder/i);
});

test("an unknown mode falls back to the first one rather than to nothing", () => {
  const prompt = buildSystemPrompt({ variant: "code", mode: "nonsense" });
  assert.match(prompt, /real local repository/i);
});

test("a code session with no mode falls back to the first one", () => {
  const prompt = buildSystemPrompt({ variant: "code" });
  assert.match(prompt, /real local repository/i);
});
