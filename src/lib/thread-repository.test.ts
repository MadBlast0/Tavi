import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";

/**
 * A `localStorage` for the test.
 *
 * Node has none, and the migration reads the old conversations out of it.
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

const { migrateConversations } = await import("./thread-repository.ts");

const LEGACY = "chats.v1";

/** A durable store that holds what it is given. */
const durableStore = (initial = "[]") => {
  let records = initial;
  return {
    read: async () => records,
    write: async (next: string) => {
      records = next;
      return true;
    },
    get: () => records,
  };
};

const aConversation = (id: string) => ({
  id,
  title: `a conversation called ${id}`,
  createdAt: 1,
  updatedAt: 1,
  turns: [],
});

beforeEach(() => {
  globalThis.localStorage.clear();
});

test("the conversations in the browser storage are brought across", async () => {
  globalThis.localStorage.setItem(
    `tavi.${LEGACY}`,
    JSON.stringify([aConversation("c-1"), aConversation("c-2")]),
  );
  const durable = durableStore();

  await migrateConversations(durable, LEGACY);

  assert.equal(JSON.parse(durable.get()).length, 2);
});

test("the old copy is only removed once the new one has been read back", async () => {
  globalThis.localStorage.setItem(
    `tavi.${LEGACY}`,
    JSON.stringify([aConversation("c-1")]),
  );
  const durable = durableStore();

  await migrateConversations(durable, LEGACY);

  assert.equal(
    globalThis.localStorage.getItem(`tavi.${LEGACY}`),
    null,
    "the old copy should be gone once the new one is there",
  );
});

test("a write that cannot be verified leaves the old copy alone", async () => {
  globalThis.localStorage.setItem(
    `tavi.${LEGACY}`,
    JSON.stringify([aConversation("c-1")]),
  );
  /* A store that accepts the write and then cannot read it back. */
  const durable = {
    read: async () => "[]",
    write: async () => true,
  };

  await migrateConversations(durable, LEGACY);

  assert.notEqual(
    globalThis.localStorage.getItem(`tavi.${LEGACY}`),
    null,
    "the conversations should still be where they were",
  );
});

test("a write that is refused leaves the old copy alone", async () => {
  globalThis.localStorage.setItem(
    `tavi.${LEGACY}`,
    JSON.stringify([aConversation("c-1")]),
  );
  const durable = {
    read: async () => "[]",
    write: async () => false,
  };

  await migrateConversations(durable, LEGACY);

  assert.notEqual(
    globalThis.localStorage.getItem(`tavi.${LEGACY}`),
    null,
    "the conversations should still be where they were",
  );
});

test("a store that already has conversations is left alone", async () => {
  globalThis.localStorage.setItem(
    `tavi.${LEGACY}`,
    JSON.stringify([aConversation("c-old")]),
  );
  const durable = durableStore(JSON.stringify([aConversation("c-1")]));

  await migrateConversations(durable, LEGACY);

  assert.equal(JSON.parse(durable.get()).length, 1);
  assert.equal(JSON.parse(durable.get())[0].id, "c-1");
  assert.notEqual(
    globalThis.localStorage.getItem(`tavi.${LEGACY}`),
    null,
    "the old copy should not be touched when there was nothing to move",
  );
});

test("there being nothing to move is not an error", async () => {
  const durable = durableStore();

  await migrateConversations(durable, LEGACY);

  assert.equal(durable.get(), "[]");
});

test("the migration is idempotent", async () => {
  globalThis.localStorage.setItem(
    `tavi.${LEGACY}`,
    JSON.stringify([aConversation("c-1")]),
  );
  const durable = durableStore();

  await migrateConversations(durable, LEGACY);
  await migrateConversations(durable, LEGACY);

  assert.equal(JSON.parse(durable.get()).length, 1);
});
