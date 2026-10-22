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
  sortByIntensity,
  type CapabilitySource,
  type EffortCapability,
  type ModelReasoningCapabilities,
  type ModelTarget,
  type SupportStatus,
  type ThinkingModeCapability,
} from "../src/lib/reasoning.ts";
import { openRouterCapabilities } from "../src/lib/catalogue.ts";
import {
  serializeReasoning,
  type ReasoningPreferences,
  type SerializedReasoning,
} from "../src/lib/provider-reasoning.ts";

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

/* The rule that turns a preference into a provider's own field, and the
   * refusal when it cannot be verified, live in the shared module: the
   * desktop app asks the same question and must get the same answer. */
export type {
  ReasoningPreferences,
  SerializedReasoning,
} from "../src/lib/provider-reasoning.ts";

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
 * The reading of this metadata lives in `src/lib/catalogue.ts`, which the
 * desktop app uses as well: the effort the picker offers and the effort the
 * server refuses come out of the same description of the same model.
 */
type OpenRouterReasoningMeta = {
  mandatory?: boolean;
  supported_efforts?: string[] | null;
  default_effort?: string;
  default_enabled?: boolean;
  supports_max_tokens?: boolean;
};

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
    return openRouterCapabilities(model, {
      connectionId: connection.id,
      providerId: connection.providerId,
      apiProtocol: connection.apiProtocol,
      modelId: model.id,
      gatewayModelId: model.id,
    });
  },

  serializeReasoning(
    capabilities: ModelReasoningCapabilities,
    preferences: ReasoningPreferences,
  ): SerializedReasoning {
    return serializeReasoning("openrouter", capabilities, preferences);
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

/** Re-exported for the catalogue projection, which needs the shared vocabulary. */
export { availableEffort, sortByIntensity };
export type { EffortCapability };