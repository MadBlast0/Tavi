import { test } from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

/**
 * The contract between the two halves of the app.
 *
 * The frontend calls Rust with `invoke("name", …)` and Rust answers with a
 * command of that name. Nothing checks that the two agree, so a command
 * renamed on one side is a command that fails at run time, on the user's
 * machine, with a message about an internal error.
 *
 * These tests read both sides and compare them.
 */

/** Every file under a folder, with its path. */
const walk = (folder: string): string[] => {
  const out: string[] = [];
  for (const entry of readdirSync(folder)) {
    const path = join(folder, entry);
    if (statSync(path).isDirectory()) out.push(...walk(path));
    /* This file is skipped: it talks about `invoke` in prose, and it would be
       asking about itself. */
    else if (/\.(ts|tsx)$/.test(path) && !path.endsWith("commands.test.ts")) {
      out.push(path);
    }
  }
  return out;
};

const RUST = join(import.meta.dirname, "..", "..", "src-tauri", "src", "lib.rs");

/** The commands Rust registers. */
const rustCommands = (): Set<string> => {
  const source = readFileSync(RUST, "utf8");
  const handler = source.match(/generate_handler!\[([\s\S]*?)\]/);
  assert.ok(handler, "the command handler should be in lib.rs");
  return new Set(
    (handler[1].match(/[a-z_]+(?:::[a-z_]+)?/g) ?? []).map((name) =>
      name.split("::").pop()!,
    ),
  );
};

/** The commands the frontend calls. */
const invokedCommands = (): Map<string, string[]> => {
  const found = new Map<string, string[]>();
  for (const path of walk(join(import.meta.dirname, ".."))) {
    const source = readFileSync(path, "utf8");
    for (const match of source.matchAll(/invoke(?:<[^>]*>)?\(\s*"([a-z_]+)"/g)) {
      const name = match[1];
      found.set(name, [...(found.get(name) ?? []), path]);
    }
  }
  return found;
};

test("every command the frontend calls is one Rust registers", () => {
  const registered = rustCommands();
  const called = invokedCommands();

  for (const [name, files] of called) {
    assert.ok(
      registered.has(name),
      `"${name}" is called from ${files.join(", ")} but Rust does not register it`,
    );
  }
});

test("the commands Rust registers are the ones the frontend calls", () => {
  /* The other way round is not a failure — a command can be there for a
     future caller — but it is worth knowing about, because a command nothing
     calls is a command nobody has looked at. */
  const called = invokedCommands();
  const unused = [...rustCommands()].filter((name) => !called.has(name));
  assert.deepEqual(
    unused,
    [],
    "these commands are registered but nothing calls them",
  );
});
