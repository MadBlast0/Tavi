import { test } from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

import { BUILD_DIFFERENCES, BUILD_DIFFERENCE_FILES } from "./build-differences.ts";

/**
 * The registry of differences, kept honest.
 *
 * The app has two builds and one codebase, and the differences between them
 * are few and real. The list of them lives in
 * `src/lib/build-differences.ts`, and this test is what stops the list
 * rotting: a file that asks which build it is in has to be on the list.
 *
 * Without the test the list is a comment, and a comment does not survive the
 * next person who needs a difference nobody wrote down.
 */

/** Every file under a folder, with its path. */
const walk = (folder: string): string[] => {
  const out: string[] = [];
  for (const entry of readdirSync(folder)) {
    const path = join(folder, entry);
    if (statSync(path).isDirectory()) out.push(...walk(path));
    else if (/\.(ts|tsx)$/.test(path)) out.push(path);
  }
  return out;
};

const ROOT = join(import.meta.dirname, "..", "..");

/** The ways a file can ask which build it is in. */
const BUILD_CHECKS = ["isDesktopApp(", "isKeyStoreAvailable(", "isDesktop("];

/** The files that ask. */
const filesThatAsk = (): string[] => {
  const out: string[] = [];
  for (const path of walk(join(ROOT, "src"))) {
    /* This file is skipped: it talks about the checks in prose, and it would
       be asking about itself. */
    if (path.endsWith("build-differences.test.ts")) continue;
    const source = readFileSync(path, "utf8");
    if (BUILD_CHECKS.some((check) => source.includes(check))) {
      out.push(path.slice(ROOT.length + 1).split("\\").join("/"));
    }
  }
  return out.sort();
};

test("a file that asks which build it is in is on the list", () => {
  const unlisted = filesThatAsk().filter(
    (file) => !BUILD_DIFFERENCE_FILES.has(file),
  );

  assert.deepEqual(
    unlisted,
    [],
    "these files ask which build they are in, and are not on the list of " +
      "the places the two builds are allowed to differ",
  );
});

test("the list has no file that has gone away", () => {
  const gone = [...BUILD_DIFFERENCE_FILES].filter((file) => {
    try {
      statSync(join(ROOT, file));
      return false;
    } catch {
      return true;
    }
  });

  assert.deepEqual(gone, [], "the list names files that are not there");
});

test("every entry says what differs and why", () => {
  for (const difference of BUILD_DIFFERENCES) {
    assert.ok(
      difference.what.trim().length > 0,
      `${difference.where} should say what differs`,
    );
    assert.ok(
      difference.why.trim().length > 0,
      `${difference.where} should say why the two cannot be the same`,
    );
  }
});

test("the list is short", () => {
  /* The whole point of the list is that there are very few entries. A list
     that grows to twenty is a list nobody reads. */
  assert.ok(
    BUILD_DIFFERENCES.length <= 20,
    "the list of differences should stay short enough to be read",
  );
});

test("the file that knows the runtime is on the list", () => {
  assert.ok(
    BUILD_DIFFERENCE_FILES.has("src/lib/platform.ts"),
    "the one place that knows what runtime this is should be on the list",
  );
});
