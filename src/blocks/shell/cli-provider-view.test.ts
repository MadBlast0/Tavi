import { test } from "node:test";
import assert from "node:assert/strict";

import {
  cliCounts,
  cliDetail,
  cliKept,
  cliMatches,
  cliNeedsAttention,
  cliStanding,
  cliUpdateLabel,
  cliVisible,
} from "./cli-provider-view.ts";
import type { CliProviderState } from "@/lib/cli-providers";

/**
 * The decisions the CLI providers pane makes.
 *
 * Each of them is a question with one answer, and the answer is what the
 * pane shows, so they are written down here rather than left in the
 * arrangement around them.
 */

/** A provider in a known state. */
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

test("a search finds a provider by its name", () => {
  assert.equal(cliMatches(provider(), "opencode"), true);
  assert.equal(cliMatches(provider(), "OPENCODE"), true);
  assert.equal(cliMatches(provider(), "claude"), false);
});

test("a search finds a provider by where it was found", () => {
  /* The path is how a person remembers where a tool is, so it is searched
     as well as the name. */
  assert.equal(cliMatches(provider(), "npm/opencode"), true);
  assert.equal(cliMatches(provider(), "protocol"), true);
});

test("an empty search finds everything", () => {
  assert.equal(cliMatches(provider(), ""), true);
  assert.equal(cliMatches(provider(), "   "), true);
});

test("a filter keeps what it says it keeps", () => {
  const here = provider()
  const gone = provider({ installed: false, version: null })
  const off = provider({ enabled: false })

  assert.equal(cliKept(here, "installed"), true);
  assert.equal(cliKept(gone, "installed"), false);
  assert.equal(cliKept(gone, "missing"), true);
  assert.equal(cliKept(off, "disabled"), true);
  assert.equal(cliKept(off, "enabled"), false);
  assert.equal(cliKept(here, "all"), true);
});

test("a program that is not the tool wants attention", () => {
  assert.equal(
    cliNeedsAttention(
      provider({ installed: false, problem: "A program called copilot is here." }),
    ),
    true,
  );
});

test("a provider that is offered but not installed wants attention", () => {
  assert.equal(
    cliNeedsAttention(provider({ installed: false, version: null })),
    true,
  );
});

test("a provider that is installed and switched on does not", () => {
  assert.equal(cliNeedsAttention(provider()), false);
});

test("the counts are of everything, not of what is left", () => {
  const states = [
    provider(),
    provider({ id: "claude", label: "Claude Code", installed: false, version: null }),
    provider({ id: "codex", label: "Codex", enabled: false }),
  ];
  const counts = cliCounts(states);
  assert.equal(counts.known, 3);
  /* Two of the three are here; the third is not. */
  assert.equal(counts.installed, 2);
  assert.equal(counts.enabled, 2);
  /* The one that is offered and not here wants attention. */
  assert.equal(counts.attention, 1);
});

test("the list is ordered by name unless something else is asked for", () => {
  const states = [
    provider({ id: "b", label: "Beta" }),
    provider({ id: "a", label: "Alpha" }),
  ];
  assert.deepEqual(
    cliVisible(states, "", "all", "name").map((state) => state.label),
    ["Alpha", "Beta"],
  );
});

test("installed providers come first when that is the order", () => {
  const states = [
    provider({ id: "a", label: "Alpha", installed: false, version: null }),
    provider({ id: "b", label: "Beta" }),
  ];
  assert.deepEqual(
    cliVisible(states, "", "all", "installed").map((state) => state.label),
    ["Beta", "Alpha"],
  );
});

test("a provider with an update comes first when that is the order", () => {
  const states = [
    provider({ id: "a", label: "Alpha" }),
    provider({
      id: "b",
      label: "Beta",
      updateState: "available",
      latestVersion: "2.1.0",
    }),
  ];
  assert.deepEqual(
    cliVisible(states, "", "all", "updates").map((state) => state.label),
    ["Beta", "Alpha"],
  );
});

test("a program that is not the tool is not the tool", () => {
  const state = provider({
    installed: false,
    version: null,
    problem: "A program called copilot is here, but it is not the Copilot CLI.",
  });
  assert.equal(cliStanding(state).label, "Not the right program");
  assert.equal(cliStanding(state).tone, "destructive");
  assert.equal(cliDetail(state), state.problem);
});

test("a provider that is not here says so", () => {
  const state = provider({ installed: false, version: null });
  assert.equal(cliStanding(state).label, "Not installed");
  assert.equal(cliStanding(state).tone, "muted");
  assert.equal(cliDetail(state), state.description);
});

test("a provider that is here says which version", () => {
  const state = provider();
  assert.equal(cliStanding(state).label, "2.0.26");
  assert.equal(cliDetail(state), "An open coding agent. · 2.0.26");
});

test("an update is named with the version it is", () => {
  assert.equal(
    cliUpdateLabel(
      provider({ updateState: "available", latestVersion: "2.1.0" }),
    ),
    "Update to 2.1.0 is available",
  );
  assert.equal(cliUpdateLabel(provider({ updateState: "up-to-date" })), "Up to date");
  assert.equal(cliUpdateLabel(provider()), null);
});
