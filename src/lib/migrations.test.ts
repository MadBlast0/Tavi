import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";

/**
 * A `localStorage` for the test.
 *
 * Node has none, and the migrations are built on it. It is installed before
 * the modules under test are used, because they read the global when they run
 * and not when they are imported.
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

const { runMigrations } = await import("./migrations.ts");
const { readStorage } = await import("./storage.ts");

const store = globalThis.localStorage;

beforeEach(() => {
  store.clear();
});

test("the old single store is gone, from both namespaces", () => {
  store.setItem("tavi.sessions.v1", "[]");
  store.setItem("ai-app.sessions.v1", "[]");

  runMigrations();

  assert.equal(store.getItem("tavi.sessions.v1"), null);
  assert.equal(store.getItem("ai-app.sessions.v1"), null);
});

test("the old store stays gone, because the namespace rule would move it back", () => {
  store.setItem("ai-app.sessions.v1", "[]");

  runMigrations();
  /* A second run is what would resurrect it, if only one spelling had gone. */
  runMigrations();

  assert.equal(store.getItem("tavi.sessions.v1"), null);
  assert.equal(store.getItem("ai-app.sessions.v1"), null);
});

test("the shared model becomes the first choice on each side", () => {
  store.setItem("tavi.model", "some/model");

  runMigrations();

  assert.equal(store.getItem("tavi.model.chat"), "some/model");
  assert.equal(store.getItem("tavi.model.code"), "some/model");
  assert.equal(store.getItem("tavi.model"), null);
});

test("the shared effort becomes the first choice on each side", () => {
  store.setItem("tavi.effort", "high");

  runMigrations();

  assert.equal(store.getItem("tavi.effort.chat"), "high");
  assert.equal(store.getItem("tavi.effort.code"), "high");
  assert.equal(store.getItem("tavi.effort"), null);
});

test("a side that has already chosen keeps its own choice", () => {
  store.setItem("tavi.model", "shared/model");
  store.setItem("tavi.model.code", "code/model");

  runMigrations();

  assert.equal(store.getItem("tavi.model.chat"), "shared/model");
  assert.equal(store.getItem("tavi.model.code"), "code/model");
});

test("a value in the old namespace is moved rather than lost, when it is read", () => {
  store.setItem("ai-app.sidebar", "true");

  /* The namespace move is lazy: a value is moved the first time it is read,
     which is what keeps the app from rewriting storage it has no reason to
     touch. */
  assert.equal(readStorage("sidebar"), "true");
  assert.equal(store.getItem("tavi.sidebar"), "true");
  assert.equal(store.getItem("ai-app.sidebar"), null);
});

test("running the migrations twice changes nothing the second time", () => {
  store.setItem("tavi.model", "some/model");

  runMigrations();
  const after = store.getItem("tavi.model.chat");

  runMigrations();

  assert.equal(store.getItem("tavi.model.chat"), after);
});
