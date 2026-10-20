import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";

/**
 * A `localStorage` for the test.
 *
 * Node has none, and the stores are built on it. It is installed before the
 * modules under test are used, because they read the global when they run and
 * not when they are imported.
 */
class MemoryStorage {
  private map = new Map<string, string>();
  get length() {
    return this.map.size;
  }
  clear() {
    this.map.clear();
  }
  getItem(key: string) {
    return this.map.has(key) ? this.map.get(key)! : null;
  }
  key(index: number) {
    return [...this.map.keys()][index] ?? null;
  }
  removeItem(key: string) {
    this.map.delete(key);
  }
  setItem(key: string, value: string) {
    this.map.set(key, String(value));
  }
}

globalThis.localStorage = new MemoryStorage() as unknown as Storage;

const { createThreadStore, titleFor } = await import("./threads.ts");

/** What a code session carries that a chat does not. */
type SessionExtra = {
  mode?: string;
  folder?: string;
  folderName?: string;
};

const chats = createThreadStore<Record<never, never>>({
  key: "chats.v1",
  prefix: "c-",
  signal: "tavi:chats-changed",
});

const sessions = createThreadStore<SessionExtra>({
  key: "code-sessions.v1",
  prefix: "s-",
  signal: "tavi:code-sessions-changed",
});

const aTurn = (text: string) => ({
  id: `t-${text}`,
  role: "user" as const,
  text,
  files: [],
  mentions: [],
});

beforeEach(() => {
  globalThis.localStorage.clear();
});

test("a thread is named after the first thing said in it", () => {
  assert.equal(titleFor([aTurn("  What is  a  thing? ")]), "What is a thing?");
});

test("a thread with nothing said in it has a name that is not empty", () => {
  assert.equal(titleFor([]), "Untitled thread");
  assert.equal(titleFor([aTurn("   ")]), "Untitled thread");
});

test("a long title is cut rather than left to run on", () => {
  const title = titleFor([aTurn("x".repeat(200))]);
  assert.equal(title.length, 61);
  assert.ok(title.endsWith("…"));
});

test("a chat goes in the chat store and a session in the session store", () => {
  const chat = chats.create({ turns: [aTurn("hello")] });
  const session = sessions.create({ turns: [aTurn("hello")] });

  assert.equal(chats.list().length, 1);
  assert.equal(sessions.list().length, 1);
  assert.ok(chat.id.startsWith("c-"));
  assert.ok(session.id.startsWith("s-"));
});

test("a chat carries no folder and no mode", () => {
  const chat = chats.create({ turns: [aTurn("hello")] });

  /* The shape says it too: `ChatDraft` has no `folder` and no `mode`, so a
     caller cannot write one — the compiler refuses it before it is stored.
     What is asserted here is that nothing else put them there. */
  const stored = JSON.parse(
    globalThis.localStorage.getItem("tavi.chats.v1")!,
  ) as Record<string, unknown>[];
  assert.equal("folder" in stored[0], false);
  assert.equal("mode" in stored[0], false);
});

test("a session carries the folder it was run against, by id and by name", () => {
  const session = sessions.create({
    turns: [aTurn("hello")],
    mode: "edit",
    folder: "f-abc",
    folderName: "MyProject",
  });
  assert.equal(session.folder, "f-abc");
  assert.equal(session.folderName, "MyProject");
  assert.equal(session.mode, "edit");
});

test("saving a thread in place does not create a second one", () => {
  const chat = chats.create({ turns: [aTurn("hello")] });
  chats.save(chat.id, { turns: [aTurn("hello"), aTurn("and again")] });

  assert.equal(chats.list().length, 1);
  assert.equal(chats.find(chat.id)?.turns.length, 2);
});

test("a name the user set is not clobbered by the next message", () => {
  const chat = chats.create({ turns: [aTurn("hello")] });
  chats.rename(chat.id, "My name for it");
  chats.save(chat.id, { turns: [aTurn("something else entirely")] });

  assert.equal(chats.find(chat.id)?.title, "My name for it");
});

test("a thread's name is the first thing said in it, and does not change", () => {
  const chat = chats.create({ turns: [aTurn("hello")] });
  chats.save(chat.id, { turns: [aTurn("hello"), aTurn("and again")] });
  assert.equal(chats.find(chat.id)?.title, "hello");
});

test("a thread that had nothing said in it takes its name from its first message", () => {
  const chat = chats.create({ turns: [] });
  assert.equal(chat.title, "Untitled thread");
  chats.save(chat.id, { turns: [aTurn("a better first message")] });
  assert.equal(chats.find(chat.id)?.title, "a better first message");
});

test("a pin can be set and taken away", () => {
  const chat = chats.create({ turns: [aTurn("hello")] });
  chats.togglePin(chat.id);
  assert.ok(chats.find(chat.id)?.pinnedAt);
  chats.togglePin(chat.id);
  assert.equal(chats.find(chat.id)?.pinnedAt, undefined);
});

test("a fork is a separate thread that keeps what it was forked from", () => {
  const session = sessions.create({
    turns: [aTurn("hello")],
    mode: "plan",
    folder: "f-abc",
    folderName: "MyProject",
  });
  sessions.togglePin(session.id)
  const fork = sessions.fork(session.id);

  assert.ok(fork);
  assert.notEqual(fork.id, session.id);
  assert.equal(fork.title, `Fork of ${session.title}`);
  assert.equal(fork.folder, "f-abc");
  assert.equal(fork.folderName, "MyProject");
  assert.equal(fork.mode, "plan");
  /* A copy is something you make once and usually leave. */
  assert.equal(fork.pinnedAt, undefined);
  assert.equal(sessions.list().length, 2);
});

test("forking something that is not there does nothing", () => {
  assert.equal(sessions.fork("nope"), undefined);
});

test("a store keeps its own cap", () => {
  for (let i = 0; i < 55; i++) {
    chats.create({ turns: [aTurn(`message ${i}`)] });
  }
  assert.equal(chats.list().length, 50);
});

test("the two stores do not compete for the same slots", () => {
  for (let i = 0; i < 55; i++) {
    chats.create({ turns: [aTurn(`chat ${i}`)] });
  }
  assert.equal(chats.list().length, 50);
  assert.equal(sessions.list().length, 0);
});

test("a thread that is deleted is gone from its own store and not from the other", () => {
  const chat = chats.create({ turns: [aTurn("hello")] });
  const session = sessions.create({ turns: [aTurn("hello")] });

  chats.remove(chat.id);
  assert.equal(chats.list().length, 0);
  assert.equal(sessions.list().length, 1);
});

test("a thread carries the model and the effort it was run with", () => {
  const chat = chats.create({
    turns: [aTurn("hello")],
    model: "some/model",
    effort: "high",
  });
  assert.equal(chat.model, "some/model");
  assert.equal(chat.effort, "high");
});
