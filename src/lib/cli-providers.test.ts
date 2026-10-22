import { test } from "node:test";
import assert from "node:assert/strict";

import {
  CLI_PREFIX,
  cliIdOf,
  cliProviderId,
  isCliProviderId,
  offeredCliProviders,
  providerChoice,
} from "./cli-providers.ts";
import type { CliProviderState } from "./cli-providers.ts";

/**
 * How the two kinds of provider are told apart.
 *
 * One string says both what kind of provider it is and which one it is, so
 * the composer has one place to read the choice from and the request has
 * one field to carry it in.
 */

const provider = (over: Partial<CliProviderState> = {}): CliProviderState => ({
  id: "opencode",
  label: "OpenCode",
  description: "An open coding agent.",
  docsUrl: "https://opencode.ai/docs/",
  installed: true,
  path: "C:/npm/opencode.cmd",
  version: "2.0.26",
  versionText: "opencode v2.0.26",
  problem: null,
  versionError: null,
  source: "package-manager",
  enabled: true,
  modes: ["protocol", "structured"],
  platforms: ["windows", "macos", "linux"],
  supportedHere: true,
  unsupportedReason: null,
  readiness: "ready",
  models: true,
  maintenance: "active",
  canInstall: true,
  canRun: true,
  runVerified: true,
  canUpdate: true,
  canUninstall: true,
  autoUpdate: false,
  autoUpdateAll: false,
  latestVersion: null,
  updateState: "unknown",
  chosenPath: null,
  lastScan: null,
  ...over,
});

test("a CLI provider's id says what kind it is", () => {
  assert.equal(cliProviderId("opencode"), "cli:opencode");
  assert.equal(isCliProviderId("cli:opencode"), true);
  assert.equal(isCliProviderId("openrouter"), false);
});

test("the kind can be taken off the id again", () => {
  assert.equal(cliIdOf("cli:opencode"), "opencode");
  assert.equal(cliIdOf("openrouter"), "openrouter");
});

test("an API provider and a CLI provider never share an id", () => {
  assert.notEqual(cliProviderId("openrouter"), "openrouter");
  assert.ok(CLI_PREFIX.length > 0);
});

test("the choice is found whichever kind it is", () => {
  const states = [provider()];
  assert.equal(providerChoice("cli:opencode", states)?.label, "OpenCode");
  assert.equal(providerChoice("openrouter", states)?.label, "OpenRouter");
  assert.equal(providerChoice("cli:not-a-provider", states), undefined);
});

test("a program that is not here is not offered", () => {
  const offered = offeredCliProviders([
    provider(),
    provider({ id: "claude", label: "Claude Code", installed: false }),
  ]);
  assert.deepEqual(
    offered.map((state) => state.id),
    ["opencode"],
  );
});

test("a provider the user has turned off is not offered", () => {
  const offered = offeredCliProviders([
    provider(),
    provider({ id: "gemini", label: "Gemini CLI", enabled: false }),
  ]);
  assert.deepEqual(
    offered.map((state) => state.id),
    ["opencode"],
  );
});

test("a provider that is turned off is still there", () => {
  /* Turning one off leaves the program where it is. */
  const states = [provider({ enabled: false })];
  assert.equal(states.length, 1);
  assert.equal(states[0].installed, true);
});
