import { test } from "node:test";
import assert from "node:assert/strict";

import { isText } from "./fs-access.ts";

/**
 * Whether a file is text is decided by its bytes.
 *
 * The browser's own answer is not asked, because it is wrong about a common
 * case: Chromium reports a `.ts` file as `video/mp2t` — it is the MPEG
 * transport stream — and every TypeScript source file was therefore being
 * refused as binary, so an `@` mention of one said it could not be read.
 */

const bytes = (text: string) => new TextEncoder().encode(text);

test("a text file is text", () => {
  assert.equal(isText(bytes("export const answer = 42\n")), true);
});

test("a file with a null byte in it is not", () => {
  const withNull = new Uint8Array([0x61, 0x62, 0x00, 0x63]);
  assert.equal(isText(withNull), false);
});

test("bytes that are not UTF-8 are not text", () => {
  /* 0xFF is not a valid UTF-8 sequence. */
  assert.equal(isText(new Uint8Array([0xff, 0xfe, 0xfd])), false);
});

test("an empty file is text", () => {
  assert.equal(isText(new Uint8Array([])), true);
});

test("a UTF-8 file with a non-ASCII character is text", () => {
  assert.equal(isText(bytes("héllo — wörld ✓")), true);
});
