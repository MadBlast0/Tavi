import { test } from "node:test";
import assert from "node:assert/strict";

import { anthropicAdapter } from "./providers.anthropic.ts";
import { openaiAdapter, openaiCurated, openaiDocumentedValues } from "./providers.openai.ts";
import { nimAdapter, nimDocumentedEfforts } from "./providers.nim.ts";
import type { ProviderConnection, ProviderModel } from "./providers.ts";
import { availableEffort, type ModelReasoningCapabilities } from "../src/lib/reasoning.ts";

const anthropicConnection: ProviderConnection = {
  id: "anthropic",
  providerId: "anthropic",
  apiProtocol: "anthropic-messages",
};

const openaiConnection: ProviderConnection = {
  id: "openai",
  providerId: "openai",
  apiProtocol: "openai-chat-completions",
};

const nimConnection: ProviderConnection = {
  id: "nvidia-nim",
  providerId: "nvidia-nim",
  apiProtocol: "openai-chat-completions",
};

const modelOf = (id: string, raw: unknown): ProviderModel => ({
  id,
  displayName: id,
  raw,
});

const cap = async (
  adapter: typeof anthropicAdapter | typeof openaiAdapter | typeof nimAdapter,
  connection: ProviderConnection,
  id: string,
  raw: unknown,
): Promise<ModelReasoningCapabilities> =>
  adapter.getModelCapabilities(connection, modelOf(id, raw));

const defaultPrefs = {
  effort: { mode: "provider_default" } as const,
  thinkingMode: { mode: "provider_default" } as const,
};

/* ------------------------------------------------------------------ */
/* Anthropic — parsed from the documented Models API schema             */
/* ------------------------------------------------------------------ */

/* Mirrors a real Anthropic capabilities block, as published. */
const anthropicFull = {
  id: "claude-opus-5-5",
  display_name: "Claude Opus 5.5",
  capabilities: {
    effort: {
      supported: true,
      low: { supported: true },
      medium: { supported: true },
      high: { supported: true },
      xhigh: { supported: true },
      max: { supported: true },
    },
    thinking: {
      supported: true,
      types: {
        adaptive: { supported: true },
        enabled: { supported: true },
        disabled: { supported: true },
      },
    },
  },
};

/* The documentation allows `xhigh` to be absent while others are present. */
const anthropicNoXhigh = {
  id: "claude-sonnet-4-6",
  capabilities: {
    effort: {
      supported: true,
      low: { supported: true },
      medium: { supported: true },
      high: { supported: true },
      max: { supported: true },
      xhigh: { supported: false },
    },
    thinking: {
      supported: true,
      types: { adaptive: { supported: true }, enabled: { supported: false } },
    },
  },
};

test("Anthropic: effort and thinking modes parse independently", async () => {
  const c = await cap(anthropicAdapter, anthropicConnection, "claude-opus-5-5", anthropicFull);
  assert.deepEqual(
    availableEffort(c.effort).map((v) => v.value),
    ["low", "medium", "high", "xhigh", "max"],
  );
  assert.deepEqual(
    c.thinkingMode.options?.map((o) => o.value),
    ["adaptive", "enabled", "disabled"],
  );
  // Effort support does not imply thinking-mode options, and vice versa.
  assert.equal(c.effort.status, "supported");
  assert.equal(c.thinkingMode.status, "supported");
});

test("Anthropic: a level published as false is excluded, and never invented", async () => {
  const c = await cap(anthropicAdapter, anthropicConnection, "claude-sonnet-4-6", anthropicNoXhigh);
  const shown = availableEffort(c.effort).map((v) => v.value);
  assert.deepEqual(shown, ["low", "medium", "high", "max"]);
  assert.ok(!shown.includes("xhigh"), "a level documented false must not appear");
  assert.ok(!shown.includes("minimal"), "an unpublished level must not be added");
  // `disabled` absent means unknown, not false.
  assert.equal(c.thinkingMode.canDisable, "unknown");
  assert.equal(c.thinkingMode.alwaysOn, undefined);
});

test("Anthropic: a model that cannot disable thinking reports always-on", async () => {
  const c = await cap(anthropicAdapter, anthropicConnection, "always-on", {
    capabilities: {
      effort: { supported: true, low: { supported: true } },
      thinking: {
        supported: true,
        types: { adaptive: { supported: true }, disabled: { supported: false } },
      },
    },
  });
  assert.equal(c.thinkingMode.alwaysOn, true);
  assert.equal(c.thinkingMode.canDisable, "unsupported");
});

test("Anthropic: an absent capabilities block stays unknown", async () => {
  const c = await cap(anthropicAdapter, anthropicConnection, "bare", { id: "bare" });
  assert.equal(c.effort.status, "unknown");
  assert.equal(c.thinkingMode.status, "unknown");
  assert.deepEqual(availableEffort(c.effort), []);
});

test("Anthropic: provider default omits both fields", async () => {
  const c = await cap(anthropicAdapter, anthropicConnection, "claude-opus-5-5", anthropicFull);
  assert.deepEqual(anthropicAdapter.serializeReasoning(c, defaultPrefs), { kind: "omit" });
});

test("Anthropic: effort serialises to output_config.effort, unmodified", async () => {
  const c = await cap(anthropicAdapter, anthropicConnection, "claude-opus-5-5", anthropicFull);
  const out = anthropicAdapter.serializeReasoning(c, {
    effort: { mode: "explicit", value: "max" },
    thinkingMode: { mode: "provider_default" },
  });
  assert.deepEqual(out, {
    kind: "payload",
    fields: { output_config: { effort: "max" } },
  });
});

test("Anthropic: an unaccepted effort is refused, not remapped", async () => {
  const c = await cap(anthropicAdapter, anthropicConnection, "claude-sonnet-4-6", anthropicNoXhigh);
  const out = anthropicAdapter.serializeReasoning(c, {
    effort: { mode: "explicit", value: "xhigh" },
    thinkingMode: { mode: "provider_default" },
  });
  assert.equal(out.kind, "reject");
  if (out.kind === "reject") assert.match(out.message, /does not accept effort "xhigh"/);
});

test("Anthropic: a thinking mode never implies an effort", async () => {
  const c = await cap(anthropicAdapter, anthropicConnection, "claude-opus-5-5", anthropicFull);
  const out = anthropicAdapter.serializeReasoning(c, {
    effort: { mode: "provider_default" },
    thinkingMode: { mode: "explicit", value: "adaptive" },
  });
  // Only the thinking field appears; no effort is invented alongside it.
  assert.deepEqual(out, { kind: "payload", fields: { thinking: { type: "adaptive" } } });
  assert.ok(!JSON.stringify(out).includes("medium"));
});

test("Anthropic: manual extended thinking is refused without a budget", async () => {
  const c = await cap(anthropicAdapter, anthropicConnection, "claude-opus-5-5", anthropicFull);
  const out = anthropicAdapter.serializeReasoning(c, {
    effort: { mode: "provider_default" },
    thinkingMode: { mode: "explicit", value: "enabled" },
  });
  assert.equal(out.kind, "reject");
  if (out.kind === "reject") assert.match(out.message, /budget/i);
});

/* ------------------------------------------------------------------ */
/* OpenAI — curated from official documentation                        */
/* ------------------------------------------------------------------ */

test("OpenAI: only curated models gain levels; others stay unknown", async () => {
  const curated = await cap(openaiAdapter, openaiConnection, "gpt-5.1", { id: "gpt-5.1" });
  assert.deepEqual(
    availableEffort(curated.effort).map((v) => v.value),
    ["none", "low", "medium", "high"],
  );

  const uncurated = await cap(openaiAdapter, openaiConnection, "gpt-4o", { id: "gpt-4o" });
  assert.equal(uncurated.effort.status, "unknown");
  assert.deepEqual(availableEffort(uncurated.effort), []);
});

test("OpenAI: a single-level model does not gain any other", async () => {
  const c = await cap(openaiAdapter, openaiConnection, "gpt-5-pro", { id: "gpt-5-pro" });
  assert.deepEqual(
    availableEffort(c.effort).map((v) => v.value),
    ["high"],
  );
});

test("OpenAI: the documented enum excludes max", () => {
  assert.ok(!openaiDocumentedValues.includes("max" as never));
  for (const entry of Object.values(openaiCurated)) {
    for (const level of entry.levels) {
      assert.ok(openaiDocumentedValues.includes(level as never), `${level} not documented`);
    }
  }
});

test("OpenAI: provider default omits; an explicit value is sent verbatim", async () => {
  const c = await cap(openaiAdapter, openaiConnection, "gpt-5.1", { id: "gpt-5.1" });
  assert.deepEqual(openaiAdapter.serializeReasoning(c, defaultPrefs), { kind: "omit" });
  assert.deepEqual(
    openaiAdapter.serializeReasoning(c, {
      effort: { mode: "explicit", value: "none" },
      thinkingMode: { mode: "provider_default" },
    }),
    { kind: "payload", fields: { reasoning: { effort: "none" } } },
  );
});

test("OpenAI: `none` is a level, not a thinking-off switch", async () => {
  const c = await cap(openaiAdapter, openaiConnection, "gpt-5.1", { id: "gpt-5.1" });
  // Thinking mode is separately unsupported on this surface.
  assert.equal(c.thinkingMode.status, "unsupported");
  const out = openaiAdapter.serializeReasoning(c, {
    effort: { mode: "explicit", value: "none" },
    thinkingMode: { mode: "provider_default" },
  });
  // It serialises as an effort value and does not fabricate a thinking field.
  assert.deepEqual(out, { kind: "payload", fields: { reasoning: { effort: "none" } } });
});

test("OpenAI: an uncurated model refuses an explicit effort rather than guessing", async () => {
  const c = await cap(openaiAdapter, openaiConnection, "gpt-4o", { id: "gpt-4o" });
  const out = openaiAdapter.serializeReasoning(c, {
    effort: { mode: "explicit", value: "high" },
    thinkingMode: { mode: "provider_default" },
  });
  assert.equal(out.kind, "reject");
  if (out.kind === "reject") assert.match(out.message, /provider default/i);
});

test("OpenAI: declares it has no live capability discovery", () => {
  assert.equal(openaiAdapter.hasLiveDiscovery, false);
});

/* ------------------------------------------------------------------ */
/* NVIDIA NIM — documented scope, deployment-dependent                  */
/* ------------------------------------------------------------------ */

test("NIM: publishes no capability metadata, so nothing is claimed", async () => {
  const c = await cap(nimAdapter, nimConnection, "openai/gpt-oss-120b", {
    id: "openai/gpt-oss-120b",
    object: "model",
    created: 1,
    owned_by: "nvidia",
  });
  assert.equal(c.effort.status, "unknown");
  assert.deepEqual(availableEffort(c.effort), []);
  assert.equal(c.reasoningCapability, "unknown");
});

test("NIM: documented GPT-OSS efforts are recorded but not offered", async () => {
  const c = await cap(nimAdapter, nimConnection, "openai/gpt-oss-20b", {
    id: "openai/gpt-oss-20b",
  });
  // The deployment requirement (NIM_REASONING_PARSER=openai_gptoss) is not
  // observable, so nothing is presented as supported.
  assert.equal(c.effort.status, "unknown");
  assert.ok(
    c.effort.semantics?.includes("NIM_REASONING_PARSER"),
    "the deployment requirement should be recorded for provenance",
  );
  assert.deepEqual([...nimDocumentedEfforts], ["low", "medium", "high"]);
});

test("NIM: an explicit effort is refused, provider default is sent", async () => {
  const c = await cap(nimAdapter, nimConnection, "openai/gpt-oss-120b", { id: "openai/gpt-oss-120b" });
  assert.deepEqual(nimAdapter.serializeReasoning(c, defaultPrefs), { kind: "omit" });
  const out = nimAdapter.serializeReasoning(c, {
    effort: { mode: "explicit", value: "high" },
    thinkingMode: { mode: "provider_default" },
  });
  assert.equal(out.kind, "reject");
});

/* ------------------------------------------------------------------ */
/* Registry                                                             */
/* ------------------------------------------------------------------ */

test("every adapter preserves the five facets separately", async () => {
  const cases: Array<[string, ModelReasoningCapabilities]> = [
    ["openrouter", await cap((await import("./providers.ts")).openRouterAdapter, { id: "openrouter", providerId: "openrouter", apiProtocol: "openai-chat-completions" }, "m", { supported_parameters: ["reasoning_effort"], reasoning: { supported_efforts: ["low", "high"] } })],
    ["anthropic", await cap(anthropicAdapter, anthropicConnection, "m", anthropicFull)],
    ["openai", await cap(openaiAdapter, openaiConnection, "gpt-5.1", { id: "gpt-5.1" })],
    ["nim", await cap(nimAdapter, nimConnection, "m", { id: "m" })],
  ];
  for (const [name, c] of cases) {
    assert.ok(c.effort, `${name} must describe effort`);
    assert.ok(c.thinkingMode, `${name} must describe thinking mode`);
    assert.ok(c.thinkingBudget, `${name} must describe thinking budget`);
    assert.ok(c.display, `${name} must describe display`);
    assert.ok(c.executionMode, `${name} must describe execution mode`);
    // Nothing collapses one facet's status into another's.
    assert.ok(["supported", "unsupported", "unknown"].includes(c.effort.status));
  }
});

test("a thinking preference never leaks into the effort payload", async () => {
  const c = await cap(anthropicAdapter, anthropicConnection, "claude-opus-5-5", anthropicFull);
  const thinkingOnly = anthropicAdapter.serializeReasoning(c, {
    effort: { mode: "provider_default" },
    thinkingMode: { mode: "explicit", value: "adaptive" },
  });
  const effortOnly = anthropicAdapter.serializeReasoning(c, {
    effort: { mode: "explicit", value: "high" },
    thinkingMode: { mode: "provider_default" },
  });
  const t = JSON.stringify(thinkingOnly);
  const e = JSON.stringify(effortOnly);
  assert.ok(!t.includes("effort"), "thinking-only must not carry an effort field");
  assert.ok(!e.includes("thinking"), "effort-only must not carry a thinking field");
});