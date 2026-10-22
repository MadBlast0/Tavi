/**
 * OpenAI adapter.
 *
 * Kept deliberately distinct from two things it is easy to conflate with:
 *
 * - the **Codex runtime**, which is a harness with its own delegation policy and
 *   selects the underlying inference effort itself; and
 * - a **generic OpenAI-compatible endpoint**, whose "compatible" describes an
 *   interface, not equivalent semantics.
 *
 * This adapter targets the standard OpenAI Chat Completions surface only.
 *
 * ## Why there is a curated table
 *
 * OpenAI's `GET /v1/models` is a listing and availability endpoint. It does not
 * enumerate reasoning controls or their accepted values, so capability discovery
 * cannot be derived from it. Rather than invent a metadata endpoint or infer
 * support from a model name, the few documented cases below are recorded from the
 * official reasoning guide with a review date. Every other model stays `unknown`,
 * which keeps the UI on provider default instead of guessing.
 *
 * The reading itself lives in `src/lib/provider-capabilities.ts`, because the
 * desktop app reads the same catalogue and must come to the same answer.
 */

import { serverCredential } from "./key-store.ts";
import { type ModelTarget, type ModelReasoningCapabilities } from "../src/lib/reasoning.ts";
import {
  openaiCapabilities,
  openaiCurated,
  openaiDocumentedValues,
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

export const openaiAdapter: ModelProviderAdapter = {
  id: "openai",
  label: "OpenAI",
  /* Model listing yes, capability discovery no. The Models endpoint is not a
     capability schema, so this is declared rather than faked. */
  hasLiveDiscovery: false,

  async listModels(connection: ProviderConnection): Promise<ProviderModel[]> {
    const apiKey = serverCredential(connection.credentialRef ?? "OPENAI_API_KEY");
    if (!apiKey) {
      throw new Error("OPENAI_API_KEY is not set");
    }
    const base = connection.baseUrl ?? "https://api.openai.com/v1";
    const response = await fetch(`${base}/models`, {
      headers: { authorization: `Bearer ${apiKey}`, accept: "application/json" },
    });
    if (!response.ok) {
      throw new Error(`OpenAI models request failed: HTTP ${response.status}`);
    }
    const payload = (await response.json()) as {
      data?: Array<{ id?: string }>;
    };
    return (payload.data ?? []).map((raw) => ({
      id: raw.id ?? "",
      displayName: raw.id ?? "",
      raw,
    }));
  },

  async getModelCapabilities(connection, model) {
    const target: ModelTarget = {
      connectionId: connection.id,
      providerId: connection.providerId,
      apiProtocol: "openai-chat-completions",
      modelId: model.id,
    };

    return openaiCapabilities(model.id, target, model.raw);
  },

  serializeReasoning(
    capabilities: ModelReasoningCapabilities,
    preferences: ReasoningPreferences,
  ): SerializedReasoning {
    return serializeReasoning("openai", capabilities, preferences);
  },
};

/** Exposed for tests: the documented enum, and the curated table. */
export { openaiDocumentedValues, openaiCurated };
