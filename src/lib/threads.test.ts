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

/**
 * A pair of stores, made fresh for each test.
 *
 * A store holds its threads in memory as well as on disk, so a store that
 * outlived a test would carry the previous test's conversations into the next
 * one.
 */
const stores = () => ({
  chats: createThreadStore<Record<never, never>>({
    key: "chats.v1",
    prefix: "c-",
    signal: "tavi:chats-changed",
    kind: "chats",
  }),
  sessions: createThreadStore<SessionExtra>({
    key: "code-sessions.v1",
    prefix: "s-",
    signal: "tavi:code-sessions-changed",
    kind: "sessions",
  }),
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

test("a chat goes in the chat store and a session in the session store", async () => {
  const { chats, sessions } = stores();
  const chat = await chats.create({ turns: [aTurn("hello")] });
  const session = await sessions.create({ turns: [aTurn("hello")] });

  assert.equal(chats.list().length, 1);
  assert.equal(sessions.list().length, 1);
  assert.ok(chat.id.startsWith("c-"));
  assert.ok(session.id.startsWith("s-"));
});

test("a chat carries no folder and no mode", async () => {
  const { chats } = stores();
  await chats.create({ turns: [aTurn("hello")] });

  /* The shape says it too: `ChatDraft` has no `folder` and no `mode`, so a
     caller cannot write one — the compiler refuses it before it is stored.
     What is asserted here is that nothing else put them there. */
  const stored = JSON.parse(
    globalThis.localStorage.getItem("tavi.chats.v1")!,
  ) as Record<string, unknown>[];
  assert.equal("folder" in stored[0], false);
  assert.equal("mode" in stored[0], false);
});

test("a session carries the folder it was run against, by id and by name", async () => {
  const { sessions } = stores();
  const session = await sessions.create({
    turns: [aTurn("hello")],
    mode: "edit",
    folder: "f-abc",
    folderName: "MyProject",
  });
  assert.equal(session.folder, "f-abc");
  assert.equal(session.folderName, "MyProject");
  assert.equal(session.mode, "edit");
});

test("saving a thread in place does not create a second one", async () => {
  const { chats } = stores();
  const chat = await chats.create({ turns: [aTurn("hello")] });
  await chats.save(chat.id, { turns: [aTurn("hello"), aTurn("and again")] });

  assert.equal(chats.list().length, 1);
  assert.equal(chats.find(chat.id)?.turns.length, 2);
});

test("a name the user set is not clobbered by the next message", async () => {
  const { chats } = stores();
  const chat = await chats.create({ turns: [aTurn("hello")] });
  await chats.rename(chat.id, "My name for it");
  await chats.save(chat.id, { turns: [aTurn("something else entirely")] });

  assert.equal(chats.find(chat.id)?.title, "My name for it");
});

test("a thread's name is the first thing said in it, and does not change", async () => {
  const { chats } = stores();
  const chat = await chats.create({ turns: [aTurn("hello")] });
  await chats.save(chat.id, { turns: [aTurn("hello"), aTurn("and again")] });
  assert.equal(chats.find(chat.id)?.title, "hello");
});

test("a thread that had nothing said in it takes its name from its first message", async () => {
  const { chats } = stores();
  const chat = await chats.create({ turns: [] });
  assert.equal(chat.title, "Untitled thread");
  await chats.save(chat.id, { turns: [aTurn("a better first message")] });
  assert.equal(chats.find(chat.id)?.title, "a better first message");
});

test("a pin can be set and taken away", async () => {
  const { chats } = stores();
  const chat = await chats.create({ turns: [aTurn("hello")] });
  await chats.togglePin(chat.id);
  assert.ok(chats.find(chat.id)?.pinnedAt);
  await chats.togglePin(chat.id);
  assert.equal(chats.find(chat.id)?.pinnedAt, undefined);
});

test("a fork is a separate thread that keeps what it was forked from", async () => {
  const { sessions } = stores();
  const session = await sessions.create({
    turns: [aTurn("hello")],
    mode: "plan",
    folder: "f-abc",
    folderName: "MyProject",
  });
  await sessions.togglePin(session.id);
  const fork = await sessions.fork(session.id);

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

test("forking something that is not there does nothing", async () => {
  const { sessions } = stores();
  assert.equal(await sessions.fork("nope"), undefined);
});

test("a store keeps its own cap", async () => {
  const { chats } = stores();
  for (let i = 0; i < 55; i++) {
    await chats.create({ turns: [aTurn(`message ${i}`)] });
  }
  assert.equal(chats.list().length, 50);
});

test("the two stores do not compete for the same slots", async () => {
  const { chats, sessions } = stores();
  for (let i = 0; i < 55; i++) {
    await chats.create({ turns: [aTurn(`chat ${i}`)] });
  }
  assert.equal(chats.list().length, 50);
  assert.equal(sessions.list().length, 0);
});

test("a thread that is deleted is gone from its own store and not from the other", async () => {
  const { chats, sessions } = stores();
  const chat = await chats.create({ turns: [aTurn("hello")] });
  await sessions.create({ turns: [aTurn("hello")] });

  await chats.remove(chat.id);
  assert.equal(chats.list().length, 0);
  assert.equal(sessions.list().length, 1);
});

test("a thread carries the model and the effort it was run with", async () => {
  const { chats } = stores();
  const chat = await chats.create({
    turns: [aTurn("hello")],
    model: "some/model",
    effort: "high",
  });
  assert.equal(chat.model, "some/model");
  assert.equal(chat.effort, "high");
});

/**
 * A store that has not been read yet must not be written to.
 *
 * A write lands on everything the store holds. If the store had not been
 * loaded, that would be one thread, and the rest of the history would be
 * gone. So a write waits for the read, and the read happens first.
 */
test("a write waits for the store to be read", async () => {
  const { chats } = stores();
  globalThis.localStorage.setItem(
    "tavi.chats.v1",
    JSON.stringify([
      { id: "c-old", title: "an old one", createdAt: 1, updatedAt: 1, turns: [] },
    ]),
  );

  await chats.create({ turns: [aTurn("hello")] });

  assert.equal(chats.list().length, 2);
  assert.ok(chats.find("c-old"), "the thread that was already there should still be there");
});

/**
 * A thread put back by an import keeps its id.
 *
 * A thread restored under a new id would be a different thread, and importing
 * the same backup twice would make two copies of every conversation in it.
 */
test("a restored thread keeps its id", async () => {
  const { chats } = stores();
  const restored = {
    id: "c-imported",
    title: "from a backup",
    createdAt: 1,
    updatedAt: 1,
    turns: [aTurn("hello")],
  };

  await chats.restore(restored);
  await chats.restore(restored);

  assert.equal(
    chats.list().length,
    1,
    "the same thread should not be added twice",
  );
  assert.equal(chats.find("c-imported")?.title, "from a backup");
});

/**
 * Clearing one collection leaves the other alone.
 *
 * A chat and a code session are separate things, and clearing one is not a
 * reason to clear the other.
 */
test("clearing one store leaves the other alone", async () => {
  const { chats, sessions } = stores();
  await chats.create({ turns: [aTurn("hello")] });
  await sessions.create({ turns: [aTurn("hello")] });

  await chats.clear();

  assert.equal(chats.list().length, 0);
  assert.equal(sessions.list().length, 1);
});
