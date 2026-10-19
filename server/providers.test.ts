import { test } from "node:test";
import assert from "node:assert/strict";

import { openRouterAdapter } from "../server/providers.ts";
import type { ProviderConnection, ProviderModel } from "../server/providers.ts";
import {
  availableEffort,
  canToggleThinking,
  effortValuesFor,
  readSupport,
  unknownCapabilities,
  type ModelReasoningCapabilities,
} from "../src/lib/reasoning.ts";

const connection: ProviderConnection = {
  id: "openrouter",
  providerId: "openrouter",
  apiProtocol: "openai-chat-completions",
};

/** Builds a model from raw provider metadata, exactly as the adapter sees it. */
const modelFrom = (raw: unknown): ProviderModel => ({
  id: (raw as { id: string }).id,
  displayName: (raw as { name: string }).name,
  raw,
});

const capabilitiesFor = async (raw: unknown) =>
  openRouterAdapter.getModelCapabilities(connection, modelFrom(raw));

/** Mirrors a real OpenRouter catalogue entry that publishes its level set. */
const enumeratedModel = {
  id: "nvidia/nemotron-3-super-120b-a12b:free",
  name: "NVIDIA: Nemotron 3 Super (free)",
  supported_parameters: ["reasoning", "reasoning_effort", "tools"],
  reasoning: {
    mandatory: false,
    supported_efforts: ["medium", "low", "none"],
    default_effort: "medium",
  },
};

/** Mirrors a catalogue entry with no published levels. */
const unenumeratedModel = {
  id: "vendor/mystery-model",
  name: "Vendor: Mystery",
  supported_parameters: ["reasoning_effort", "tools"],
};

/** Mirrors a model with no reasoning parameter at all. */
const plainModel = {
  id: "vendor/plain",
  name: "Vendor: Plain",
  supported_parameters: ["tools"],
};

const serialize = (
  capabilities: ModelReasoningCapabilities,
  effort: { mode: "provider_default" } | { mode: "explicit"; value: string },
) =>
  openRouterAdapter.serializeReasoning(capabilities, {
    effort,
    thinkingMode: { mode: "provider_default" },
  });

/* 1. exact published values are shown, and nothing is added */
test("published effort levels are used verbatim, in ascending intensity", async () => {
  const capabilities = await capabilitiesFor(enumeratedModel);
  const shown = availableEffort(capabilities.effort).map((v) => v.value);
  assert.deepEqual(shown, ["none", "low", "medium"]);
  // Provider order is descending; display is ascending, but the wire values are
  // exactly what the provider published.
  assert.ok(!shown.includes("high"));
  assert.ok(!shown.includes("max"));
});

/* 2. `medium` is not assumed on a model that does not publish it */
test("a model publishing only low/high does not gain a medium", async () => {
  const capabilities = await capabilitiesFor({
    ...unenumeratedModel,
    reasoning: { supported: true, supported_efforts: ["high", "low"] },
  });
  const shown = availableEffort(capabilities.effort).map((v) => v.value);
  assert.deepEqual(shown, ["low", "high"]);
});

/* 3. exact wire values are preserved */
test("max and xhigh keep their exact wire values", async () => {
  const capabilities = await capabilitiesFor({
    ...unenumeratedModel,
    reasoning: {
      supported: true,
      supported_efforts: ["max", "xhigh", "high", "medium", "low"],
    },
  });
  const shown = availableEffort(capabilities.effort).map((v) => v.value);
  assert.deepEqual(shown, ["low", "medium", "high", "xhigh", "max"]);
  const serialized = serialize(capabilities, { mode: "explicit", value: "max" });
  assert.deepEqual(serialized, {
    kind: "payload",
    fields: { reasoning: { effort: "max" } },
  });
});

/* 4. provider default omits the field rather than sending a value */
test("provider default serialises to an omitted field", async () => {
  const capabilities = await capabilitiesFor(enumeratedModel);
  assert.deepEqual(serialize(capabilities, { mode: "provider_default" }), {
    kind: "omit",
  });
});

/* 5. an unaccepted explicit value is refused, never remapped */
test("an unsupported explicit effort is refused and names the accepted set", async () => {
  const capabilities = await capabilitiesFor(enumeratedModel);
  const result = serialize(capabilities, { mode: "explicit", value: "high" });
  assert.equal(result.kind, "reject");
  if (result.kind === "reject") {
    assert.match(result.message, /does not accept effort "high"/);
    assert.match(result.message, /none, low, medium/);
  }
});

/* 6. an unpublished level set is not invented into a range */
test("levels are not invented when the gateway does not publish them", async () => {
  const capabilities = await capabilitiesFor(unenumeratedModel);
  // Accepted by the gateway, but no values are known.
  assert.equal(capabilities.effort.status, "supported");
  assert.deepEqual(availableEffort(capabilities.effort), []);
  const result = serialize(capabilities, { mode: "explicit", value: "medium" });
  assert.equal(result.kind, "reject");
  if (result.kind === "reject") {
    assert.match(result.message, /not published/i);
  }
});

/* 7. missing metadata stays unknown, not unsupported */
test("a model with no reasoning parameter reports unknown, not unsupported", async () => {
  const capabilities = await capabilitiesFor(plainModel);
  assert.equal(capabilities.reasoningCapability, "unknown");
  assert.equal(capabilities.effort.status, "unknown");
  assert.deepEqual(availableEffort(capabilities.effort), []);
});

/* 8. an empty published list is not evidence of support */
test("an empty published effort list is treated as unknown", async () => {
  const capabilities = await capabilitiesFor({
    ...unenumeratedModel,
    reasoning: { supported: true, supported_efforts: [] },
  });
  assert.equal(capabilities.effort.status, "unknown");
});

/* 9. defaults are only claimed when actually published */
test("a default is reported only when the provider published one", async () => {
  const withDefault = await capabilitiesFor(enumeratedModel);
  assert.equal(withDefault.effort.defaultKnown, true);
  assert.equal(withDefault.effort.defaultValue, "medium");

  const withoutDefault = await capabilitiesFor(unenumeratedModel);
  assert.equal(withoutDefault.effort.defaultKnown, false);
  assert.equal(withoutDefault.effort.defaultValue, undefined);
});

/* 10. effort and thinking mode are independent */
test("thinking mode is not inferred from effort support", async () => {
  const capabilities = await capabilitiesFor(enumeratedModel);
  assert.equal(capabilities.effort.status, "supported");
  // OpenRouter publishes no thinking *mode* set, so none is claimed.
  assert.equal(capabilities.thinkingMode.status, "unknown");
  assert.equal(canToggleThinking(capabilities.thinkingMode), false);
});

/* 11. display is not conflated with computation */
test("reasoning display is tracked separately from effort", async () => {
  const capabilities = await capabilitiesFor(enumeratedModel);
  assert.equal(capabilities.display.summary, "supported");
  assert.equal(capabilities.display.excludeParameter, "exclude");
  assert.equal(capabilities.thinkingBudget.status, "unknown");
});

/* 12. a numeric reasoning budget is only claimed when published */
test("supports_max_tokens marks the budget supported with no invented bounds", async () => {
  const capabilities = await capabilitiesFor({
    ...enumeratedModel,
    reasoning: { ...enumeratedModel.reasoning, supports_max_tokens: true },
  });
  assert.equal(capabilities.thinkingBudget.status, "supported");
  assert.equal(capabilities.thinkingBudget.minimum, undefined);
  assert.equal(capabilities.thinkingBudget.maximum, undefined);
});

/* 13. effort and thinking preferences resolve independently */
test("effortValuesFor filters to the explicit choice without touching thinking", async () => {
  const capabilities = await capabilitiesFor(enumeratedModel);
  const chosen = effortValuesFor(capabilities.effort, {
    mode: "explicit",
    value: "low",
  });
  assert.deepEqual(chosen.map((v) => v.value), ["low"]);
  // Thinking is untouched by an effort preference.
  assert.equal(capabilities.thinkingMode.defaultKnown, false);
});

/* 14. a preference for an unpublished level yields nothing */
test("a preference for a level the model never published resolves to nothing", async () => {
  const capabilities = await capabilitiesFor(enumeratedModel);
  const chosen = effortValuesFor(capabilities.effort, {
    mode: "explicit",
    value: "max",
  });
  assert.deepEqual(chosen, []);
});

/* 15. unknown capability profiles assert nothing */
test("an unknown profile supports no control", () => {
  const profile = unknownCapabilities({
    connectionId: "c",
    providerId: "p",
    apiProtocol: "a",
    modelId: "m",
  });
  assert.equal(profile.reasoningCapability, "unknown");
  assert.equal(profile.effort.status, "unknown");
  assert.deepEqual(profile.effort.values, undefined);
  assert.equal(profile.thinkingMode.alwaysOn, undefined);
});

/* 16. tri-state reading distinguishes absent from false */
test("readSupport treats an absent field as unknown, not unsupported", () => {
  assert.equal(readSupport(undefined), "unknown");
  assert.equal(readSupport(null), "unknown");
  assert.equal(readSupport({ supported: false }), "unsupported");
  assert.equal(readSupport({ supported: true }), "supported");
  assert.equal(readSupport({}), "unknown");
});

/* 17. raw provider metadata is preserved */
test("raw provider metadata survives normalisation", async () => {
  const capabilities = await capabilitiesFor(enumeratedModel);
  assert.deepEqual(capabilities.rawMetadata, enumeratedModel);
  assert.ok(capabilities.sources.some((s) => s.kind === "gateway_metadata"));
});

/* 18. the provider default is never replaced by a middle value */
test("omitting a preference never yields a concrete effort value", async () => {
  const capabilities = await capabilitiesFor(enumeratedModel);
  const result = serialize(capabilities, { mode: "provider_default" });
  assert.equal(result.kind, "omit");
  assert.ok(!JSON.stringify(result).includes("medium"));
});