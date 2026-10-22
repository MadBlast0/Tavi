import { test } from "node:test";
import assert from "node:assert/strict";

import { toolDetail, toolFailed, toolLabel } from "./tool-activity.ts";
import type { ToolActivity } from "@/lib/api";

/**
 * What the tool rows say.
 *
 * A row that shows the program's own name is showing an identifier where a
 * person was meant to read a sentence, so the wording is checked here.
 */

const tool = (over: Partial<ToolActivity> = {}): ToolActivity => ({
  name: "shell",
  title: "shell",
  status: "completed",
  ...over,
});

test("a tool is named in words, not by the program's name", () => {
  assert.equal(toolLabel(tool({ name: "shell" })), "Running a command");
  assert.equal(toolLabel(tool({ name: "read" })), "Reading a file");
  assert.equal(toolLabel(tool({ name: "webfetch" })), "Opening a web page");
});

test("a tool the app has not heard of is said plainly", () => {
  assert.equal(toolLabel(tool({ name: "some_new_tool" })), "Some new tool");
  assert.equal(toolLabel(tool({ name: "" })), "Working");
});

test("the command a tool ran is the detail worth showing", () => {
  assert.equal(
    toolDetail(tool({ input: { command: "echo hello" } })),
    "echo hello",
  );
  assert.equal(
    toolDetail(tool({ input: { filePath: "src/app.tsx" } })),
    "src/app.tsx",
  );
});

test("a detail is one line", () => {
  assert.equal(
    toolDetail(tool({ input: { command: "first\nsecond" } })),
    "first",
  );
});

test("a tool with nothing to say says nothing", () => {
  assert.equal(toolDetail(tool()), null);
  assert.equal(toolDetail(tool({ output: "" })), null);
});

test("a tool that failed is marked", () => {
  assert.equal(toolFailed(tool({ status: "failed" })), true);
  assert.equal(toolFailed(tool({ status: "error" })), true);
  assert.equal(toolFailed(tool({ status: "completed" })), false);
  assert.equal(toolFailed(tool({ status: "running" })), false);
});
