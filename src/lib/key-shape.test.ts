import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * The shape of a key, checked across all three sides.
 *
 * A key is answered in three places: the desktop's Rust command, the
 * website's server, and the TypeScript type the pane reads. Nothing kept them
 * in step, and they had already drifted once — one side called the provider's
 * name `label` and the other called the key's own account `label`, so a word
 * meant two things depending on which file you were in.
 *
 * This test reads all three and says they are the same.
 */

/** Where the three sources are. */
const ROOT = join(import.meta.dirname, "..", "..");

const read = (...parts: string[]): string =>
  readFileSync(join(ROOT, ...parts), "utf8");

/**
 * The keys of a TypeScript type.
 *
 * A type is written as `name: type` or `name?: type`, one per line, and the
 * braces are matched so a nested object does not contribute its own fields.
 */
const typeKeys = (source: string, name: string): string[] => {
  const declaration = new RegExp(
    `export type ${name} = ([\\s\\S]*?)\\n\\}`,
  ).exec(source);
  assert.ok(declaration, `${name} should be in the file`);

  /* The opening brace of the object type is not a field, and a nested
     object's fields are not this type's fields either. */
  const body = declaration[1].replace(/^\s*\{/, "");
  const keys: string[] = [];
  let depth = 0;

  for (const line of body.split("\n")) {
    const trimmed = line.trim();
    if (trimmed.startsWith("}")) {
      depth = Math.max(0, depth - 1);
      continue;
    }
    if (trimmed.startsWith("{")) {
      depth += 1;
      continue;
    }
    if (depth > 0) continue;
    const match = trimmed.match(/^([A-Za-z][A-Za-z0-9]*)\??:/);
    if (!match) continue;
    keys.push(match[1]);
    if (trimmed.endsWith("{")) depth += 1;
  }

  return keys;
};

/**
 * The keys of a Rust `json!` object.
 *
 * The Rust side builds its answer with `json!`, so the keys are string
 * literals in the source. Reading them out is exactly what
 * `src/lib/commands.test.ts` does for the command list.
 */
const rustJsonKeys = (source: string, marker: string): string[] => {
  const start = source.indexOf(marker);
  assert.ok(start !== -1, `${marker} should be in the Rust file`);
  const open = source.indexOf("{", start);
  const close = source.indexOf("\n    })", open);
  const body = source.slice(open, close === -1 ? undefined : close);
  return [...body.matchAll(/"([A-Za-z][A-Za-z0-9]*)":/g)].map(
    (match) => match[1],
  );
};

/**
 * The keys of the object the server answers with.
 *
 * The server writes the shape out field by field rather than spreading two
 * objects together, because a spread hides the fields from this test.
 */
const serverKeys = (): string[] => {
  const source = read("server", "key-status.ts");
  const start = source.indexOf("export const listProviderKeys");
  assert.ok(start !== -1, "the server should list its keys");
  const body = source.slice(start);
  const object = body.indexOf("return {", body.indexOf("keys.map"));
  assert.ok(object !== -1, "the server should build a key");
  const end = body.indexOf("\n      };", object);
  const literal = body.slice(object, end === -1 ? undefined : end);
  return [...literal.matchAll(/^\s{8}([A-Za-z][A-Za-z0-9]*):/gm)].map(
    (match) => match[1],
  );
};

/**
 * Every field of the key type.
 *
 * The type is written as the standing intersected with the key's own
 * fields, so the shape is the union of the two.
 */
const keyTypeKeys = (): string[] => {
  const source = read("src", "lib", "secret.ts");
  return [
    ...typeKeys(source, "KeyStanding"),
    ...typeKeys(source, "ProviderKey"),
  ];
};

test("the TypeScript type and the Rust command hold the same fields", () => {
  const type = keyTypeKeys();
  const rust = rustJsonKeys(
    read("src-tauri", "src", "keys.rs"),
    "fn key_json",
  );

  assert.deepEqual(
    [...type].sort(),
    [...rust].sort(),
    "the Rust command and the TypeScript type should hold the same fields",
  );
});

test("the server and the TypeScript type hold the same fields", () => {
  const type = keyTypeKeys();
  const server = serverKeys();

  assert.deepEqual(
    [...type].sort(),
    [...server].sort(),
    "the server and the TypeScript type should hold the same fields",
  );
});

test("a key's shape has one name for the provider and one for the key", () => {
  const source = read("src", "lib", "secret.ts");
  const type = new RegExp(
    "export type ProviderKey = KeyStanding & \\{([\\s\\S]*?)\\n\\}",
  ).exec(source);
  assert.ok(type, "the key type should be written out");

  /* `label` meant the provider's name on one side and the key's own account
     on the other. It is not used at all now, and a field that comes back
     under that name is a field that means two things again. */
  assert.ok(
    !/(^|\s)label:/.test(type[1]),
    "the key's shape should not have a field called `label`",
  );
  assert.match(type[1], /providerLabel:/);
  assert.match(type[1], /\bname:/);
});

test("the standing's fields are the same everywhere", () => {
  const type = typeKeys(read("src", "lib", "secret.ts"), "KeyStanding");
  const rust = rustJsonKeys(
    read("src-tauri", "src", "keys.rs"),
    "fn key_json",
  );

  for (const field of type) {
    assert.ok(
      rust.includes(field),
      `the Rust command should answer with ${field}`,
    );
  }
});
