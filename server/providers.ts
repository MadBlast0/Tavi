/**
 * Provider adapters: read a provider's model metadata, normalise it into
 * `ModelReasoningCapabilities`, and serialise a validated preference back into
 * that provider's exact request shape.
 *
 * Each adapter owns three things and nothing else needs to know them:
 *
 * - how to read the provider's catalogue;
 * - how to normalise its reasoning/thinking metadata;
 * - how to write a validated preference back onto the wire.
 *
 * Nothing here infers a capability from a model name, a provider name, or the
 * presence of the words "reasoning"/"thinking". An absent field becomes
 * `unknown`; it never becomes a level list.
 */

import {
  availableEffort,
  readSupport,
  sortByIntensity,
  type CapabilitySource,
  type EffortCapability,
  type EffortValue,
  type ModelReasoningCapabilities,
  type ModelTarget,
  type SupportStatus,
  type ThinkingModeCapability,
} from "../src/lib/reasoning.ts";

export type ProviderModel = {
  /** Model id exactly as the provider names it. Never rewritten. */
  id: string;
  displayName: string;
  /** Provider's own metadata, kept so nothing is lost in normalisation. */
  raw: unknown;
};

export type ProviderConnection = {
  id: string;
  providerId: string;
  apiProtocol: string;
  baseUrl?: string;
  /** Reference to a credential. Secrets are never stored with model metadata. */
  credentialRef?: string;
};

export type ReasoningPreferences = {
  effort: { mode: "provider_default" } | { mode: "explicit"; value: string };
  thinkingMode: { mode: "provider_default" } | { mode: "explicit"; value: string };
};

/**
 * What a validated preference becomes on the wire, or why it cannot.
 *
 * `omit` is the success case for a provider default: the field is simply not
 * sent. `reject` must never be resolved by picking a different value.
 */
/** The provider-shaped options, or a refusal. Never both, never neither. */
export type SerializedReasoning =
  | { kind: "omit" }
  | { kind: "payload"; fields: Record<string, unknown> }
  | { kind: "reject"; message: string };

export interface ModelProviderAdapter {
  id: string;
  /** Human-facing name for connection UI. */
  label: string;
  /** False when the provider publishes no model/capability endpoint at all. */
  hasLiveDiscovery: boolean;

  listModels(connection: ProviderConnection): Promise<ProviderModel[]>;
  getModelCapabilities(
    connection: ProviderConnection,
    model: ProviderModel,
  ): Promise<ModelReasoningCapabilities>;
  /**
   * Validate a preference against this target and produce the exact payload.
   * Must not mutate the preference and must not substitute another value.
   */
  serializeReasoning(
    capabilities: ModelReasoningCapabilities,
    preferences: ReasoningPreferences,
  ): SerializedReasoning;
}

/* ------------------------------------------------------------------ */
/* OpenRouter                                                           */
/* ------------------------------------------------------------------ */

const OPENROUTER_MODELS_URL = "https://openrouter.ai/api/v1/models";

/**
 * OpenRouter documents TWO different effort parameters, and they do not carry
 * the same values. Conflating them is an easy and consequential mistake:
 *
 * - `reasoning_effort` (top-level, OpenAI-style) is documented as the enum
 *   `xhigh, high, medium, low, minimal, none`.
 * - `reasoning.effort` (the normalised `reasoning` object) is documented as
 *   `"max", "xhigh", "high", "medium", "low", "minimal" or "none"` — it also
 *   admits `max`.
 * - `verbosity` is a third, unrelated parameter whose enum also includes `max`
 *   and which maps to Anthropic's `output_config.effort`. It controls answer
 *   length, is not a reasoning control, and is never read or sent here.
 *
 * `max` appears in `reasoning.supported_efforts` for 94 models, so on that
 * surface it is a genuine reasoning level and not a verbosity value leaking in.
 * Verified live against `upstage/solar-mini4`, which publishes all seven:
 * `xhigh` returned 45 reasoning tokens, `max` returned 298.
 *
 * Labels below are presentation only. `intensity` is a coarse cross-provider
 * hint for ordering and is never used to derive or translate a wire value.
 */
const OPENROUTER_LABELS: Record<string, { label: string; intensity: EffortValue["intensity"] }> = {
  none: { label: "None", intensity: "minimal" },
  minimal: { label: "Minimal", intensity: "minimal" },
  low: { label: "Low", intensity: "low" },
  medium: { label: "Medium", intensity: "medium" },
  high: { label: "High", intensity: "high" },
  xhigh: { label: "Extra high", intensity: "maximum" },
  max: { label: "Max", intensity: "maximum" },
};

type OpenRouterReasoningMeta = {
  mandatory?: boolean;
  supported_efforts?: string[] | null;
  default_effort?: string;
  default_enabled?: boolean;
  supports_max_tokens?: boolean;
};

const openRouterEffort = (
  reasoning: OpenRouterReasoningMeta | undefined,
  parameters: readonly string[],
  source: CapabilitySource,
): EffortCapability => {
  const declared = readSupport(reasoning ? { supported: undefined } : undefined);

  // `supported_parameters` says the gateway accepts the *name*. It does not say
  // which values are valid, so on its own this stays "supported but unenumerated"
  // rather than becoming an invented range.
  const parameterAccepted = parameters.includes("reasoning_effort");
  const enumerated = reasoning?.supported_efforts;

  let status: SupportStatus;
  let values: EffortValue[] | undefined;
  let defaultValue: string | undefined;
  let defaultKnown = false;

  if (Array.isArray(enumerated)) {
    status = "supported";
    // OpenRouter documents this array as descending, highest first. Reversed
    // here so `order` is ascending, which is what display sorting assumes; the
    // wire values themselves are untouched. Without this, `xhigh` and `max`
    // (both "maximum" intensity) would tie and fall back to the provider's
    // descending positions, rendering Max below Extra high.
    values = enumerated
      .filter((value): value is string => typeof value === "string")
      .map((value) => value)
      .reverse()
      .map((value, order) => ({
        value,
        label: OPENROUTER_LABELS[value]?.label ?? value,
        order,
        intensity: OPENROUTER_LABELS[value]?.intensity ?? "unknown",
      }));
    if (values.length === 0) {
      // An empty enumeration is not evidence of support.
      status = "unknown";
      values = undefined;
    }
    if (typeof reasoning?.default_effort === "string") {
      defaultValue = reasoning.default_effort;
      defaultKnown = true;
    }
  } else if (parameterAccepted) {
    // Accepted by the gateway, level set not published for this model.
    status = "supported";
  } else if (enumerated === null || reasoning === undefined) {
    status = declared === "unknown" ? "unknown" : declared;
  } else {
    status = "unsupported";
  }

  return {
    status,
    parameterName: parameterAccepted ? "reasoning_effort" : undefined,
    values,
    defaultValue,
    defaultKnown,
    source,
  };
};

/**
 * OpenRouter folds "whether to reason" into the same `reasoning` object as
 * effort, and does not publish a separate thinking *mode*. That is a gateway
 * fact, not a universal one — it is why this adapter records no thinking-mode
 * options rather than inventing `enabled`/`disabled`.
 */
const openRouterThinkingMode = (
  reasoning: OpenRouterReasoningMeta | undefined,
  source: CapabilitySource,
): ThinkingModeCapability => ({
  status: "unknown",
  defaultKnown: false,
  canDisable: "unknown",
  source,
});

import { anthropicAdapter } from "./providers.anthropic.ts";
import { openaiAdapter } from "./providers.openai.ts";
import { nimAdapter } from "./providers.nim.ts";

export const openRouterAdapter: ModelProviderAdapter = {
  id: "openrouter",
  label: "OpenRouter",
  hasLiveDiscovery: true,

  async listModels() {
    const response = await fetch(OPENROUTER_MODELS_URL, {
      headers: { accept: "application/json" },
    });
    if (!response.ok) {
      throw new Error(`OpenRouter catalog request failed: HTTP ${response.status}`);
    }
    const payload = (await response.json()) as { data?: unknown[] };
    return (payload.data ?? []).map((raw) => {
      const model = raw as { id?: string; name?: string };
      return {
        id: model.id ?? "",
        displayName: model.name ?? model.id ?? "",
        raw,
      };
    });
  },

  async getModelCapabilities(connection, model) {
    const raw = (model.raw ?? {}) as {
      supported_parameters?: string[];
      reasoning?: OpenRouterReasoningMeta;
    };
    const parameters = raw.supported_parameters ?? [];
    const source: CapabilitySource = {
      kind: "gateway_metadata",
      url: OPENROUTER_MODELS_URL,
      confidence: "high",
      notes: "OpenRouter catalogue entry for this model slug",
    };

    const target: ModelTarget = {
      connectionId: connection.id,
      providerId: connection.providerId,
      apiProtocol: connection.apiProtocol,
      modelId: model.id,
      gatewayModelId: model.id,
    };

    const effort = openRouterEffort(raw.reasoning, parameters, source);
    const reasoningExists = parameters.includes("reasoning");

    return {
      target,
      reasoningCapability: reasoningExists ? "supported" : "unknown",
      effort,
      thinkingMode: openRouterThinkingMode(raw.reasoning, source),
      thinkingBudget: {
        // `supports_max_tokens` is a genuine per-model signal for a numeric
        // reasoning budget, but the gateway publishes no bounds for it.
        status: raw.reasoning?.supports_max_tokens ? "supported" : "unknown",
        parameterName: raw.reasoning?.supports_max_tokens ? "max_tokens" : undefined,
        unit: raw.reasoning?.supports_max_tokens ? "tokens" : undefined,
        semantics: "provider_specific",
        source,
      },
      display: {
        // `exclude` controls whether reasoning is returned, not whether it runs.
        summary: parameters.includes("reasoning") ? "supported" : "unknown",
        thinkingContent: parameters.includes("reasoning") ? "supported" : "unknown",
        excludeParameter: "exclude",
        source,
      },
      executionMode: { status: "unknown", defaultKnown: false, source },
      rawMetadata: model.raw,
      schemaVersion: 2,
      sources: [source],
    };
  },

  serializeReasoning(capabilities, preferences) {
    if (preferences.effort.mode === "provider_default") {
      // Provider default means omit the field. Not `medium`.
      return { kind: "omit" };
    }

    const value = preferences.effort.value;
    const accepted = availableEffort(capabilities.effort).map((entry) => entry.value);

    if (accepted.length === 0) {
      // Distinguish "supported but we do not know which values" from "not
      // supported". Collapsing these told a user their setting was rejected by
      // a model that in fact accepts the parameter.
      if (capabilities.effort.status === "supported") {
        return {
          kind: "reject",
          message:
            "This model's effort levels are not published, so that setting cannot be verified. Use the provider default instead.",
        };
      }
      if (capabilities.effort.status === "unknown") {
        return {
          kind: "reject",
          message:
            "This model's reasoning-effort support is not published, so that setting cannot be verified. Use the provider default instead.",
        };
      }
      return {
        kind: "reject",
        message: "This model does not support a reasoning-effort setting.",
      };
    }

    if (!accepted.includes(value)) {
      return {
        kind: "reject",
        message: `This model does not accept effort "${value}". It accepts: ${accepted.join(", ")}.`,
      };
    }

    return {
      kind: "payload",
      fields: { reasoning: { effort: value } },
    };
  },
};

/**
 * The payload shape the OpenRouter provider client accepts.
 *
 * Mirrors the provider's own `.d.ts`, which does not export it. Declared so the
 * validated result is type-checked on its way to the wire rather than slipping
 * through an untyped record.
 */
export type OpenRouterProviderOptions = {
  openrouter: {
    reasoning:
      | { enabled?: boolean; exclude?: boolean; max_tokens: number }
      | { enabled?: boolean; exclude?: boolean; effort: string };
  };
};

/* ------------------------------------------------------------------ */
/* Registry                                                             */
/* ------------------------------------------------------------------ */

/**
 * Registered in lookup order. Each provider owns its own request shape and
 * capability vocabulary; nothing above this list assumes any of them.
 */
const ADAPTERS: readonly ModelProviderAdapter[] = [
  openRouterAdapter,
  anthropicAdapter,
  openaiAdapter,
  nimAdapter,
];

export const adapterFor = (providerId: string): ModelProviderAdapter | undefined =>
  ADAPTERS.find((adapter) => adapter.id === providerId);

export const knownProviderIds = (): string[] => ADAPTERS.map((a) => a.id);

/** Re-exported for the catalogue projection, which needs the shared vocabulary. */
export { availableEffort, sortByIntensity };
export type { EffortCapability };