/**
 * Anthropic adapter.
 *
 * Anthropic's API is not OpenAI's. The request has a `system` field of its
 * own, the key goes in `x-api-key` rather than in an authorization header, the
 * body carries `max_tokens` rather than leaving it to a default, and the
 * stream is a sequence of named events rather than a sequence of chat
 * completions.
 *
 * The reasoning controls are Anthropic's too: `output_config.effort` for the
 * effort level, and `thinking.type` for how the model thinks.
 *
 * The reading of a model's capabilities lives in
 * `src/lib/provider-capabilities.ts`, because the desktop app reads the same
 * catalogue and must come to the same answer.
 */

import { serverCredential } from "./key-store.ts";
import {
  type ModelTarget,
  type ModelReasoningCapabilities,
} from "../src/lib/reasoning.ts";
import {
  ANTHROPIC_MODELS_URL,
  ANTHROPIC_VERSION,
  anthropicCapabilities,
  type AnthropicModel,
} from "../src/lib/provider-capabilities.ts";
import {
  serializeReasoning,
  type ReasoningPreferences,
  type SerializedReasoning,
} from "../src/lib/provider-reasoning.ts";
import type {
  ModelProviderAdapter,
  ProviderConnection,
  ProviderModel,
} from "./providers.ts";

export const anthropicAdapter: ModelProviderAdapter = {
  id: "anthropic",
  label: "Anthropic",
  hasLiveDiscovery: true,

  async listModels(connection: ProviderConnection): Promise<ProviderModel[]> {
    const apiKey = serverCredential(connection.credentialRef ?? "ANTHROPIC_API_KEY");
    if (!apiKey) {
      throw new Error("ANTHROPIC_API_KEY is not set");
    }
    const base = connection.baseUrl ?? "https://api.anthropic.com/v1";
    const response = await fetch(`${base}/models?limit=1000`, {
      headers: {
        "x-api-key": apiKey,
        "anthropic-version": ANTHROPIC_VERSION,
        accept: "application/json",
      },
    });
    if (!response.ok) {
      throw new Error(`Anthropic models request failed: HTTP ${response.status}`);
    }
    const payload = (await response.json()) as { data?: AnthropicModel[] };
    return (payload.data ?? []).map((raw) => ({
      id: raw.id ?? "",
      displayName: raw.display_name ?? raw.id ?? "",
      raw,
    }));
  },

  async getModelCapabilities(connection, model) {
    const target: ModelTarget = {
      connectionId: connection.id,
      providerId: connection.providerId,
      apiProtocol: "anthropic-messages",
      modelId: model.id,
    };

    return anthropicCapabilities(model.id, target, model.raw);
  },

  serializeReasoning(
    capabilities: ModelReasoningCapabilities,
    preferences: ReasoningPreferences,
  ): SerializedReasoning {
    return serializeReasoning("anthropic", capabilities, preferences);
  },
};
