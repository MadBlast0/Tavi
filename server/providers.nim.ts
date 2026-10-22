/**
 * NVIDIA NIM adapter.
 *
 * ## What is discoverable, and what is not
 *
 * NIM's OpenAI-compatible `GET /v1/models` returns only `id`, `object`,
 * `created` and `owned_by`. It publishes **no capability metadata at all** — no
 * effort levels, no thinking modes, no reasoning flags. That is a fact about the
 * endpoint, not about NIM: NVIDIA documents `reasoning_effort` support for its
 * GPT-OSS models, but only in a *multi-LLM NIM deployment configured with
 * `NIM_REASONING_PARSER=openai_gptoss`*.
 *
 * So the accurate position is:
 *
 * - **Statically documented**: `reasoning_effort` exists for GPT-OSS-20B and
 *   GPT-OSS-120B under that deployment configuration. Recorded below as a curated
 *   capability with its source.
 * - **Dynamically discoverable**: nothing. The models endpoint carries no
 *   capability fields.
 * - **Unknown**: whether *this* deployment has `NIM_REASONING_PARSER` set. That
 *   is server-side configuration the application cannot observe through the API.
 *
 * Because the deployment requirement cannot be established, the curated entry is
 * deliberately **not** surfaced as support: matching on a model name would be
 * exactly the inference the specification forbids, and would offer a control that
 * silently fails on a deployment without the parser. Everything therefore resolves
 * to `unknown`, which keeps the UI on the provider default.
 *
 * The reading lives in `src/lib/provider-capabilities.ts`, because the desktop
 * app reads the same catalogue and must come to the same answer.
 */

import { serverCredential } from "./key-store.ts";
import {
  type ModelTarget,
  type ModelReasoningCapabilities,
} from "../src/lib/reasoning.ts";
import {
  nimCapabilities,
  nimDocumentedEfforts,
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

export const nimAdapter: ModelProviderAdapter = {
  id: "nvidia-nim",
  label: "NVIDIA NIM",
  hasLiveDiscovery: false,

  async listModels(connection: ProviderConnection): Promise<ProviderModel[]> {
    const apiKey = serverCredential(connection.credentialRef ?? "NVIDIA_API_KEY");
    const base = connection.baseUrl ?? "https://integrate.api.nvidia.com/v1";
    const headers: Record<string, string> = { accept: "application/json" };
    // NIM permits unauthenticated listing, but a key gives the account's models.
    if (apiKey) headers.authorization = `Bearer ${apiKey}`;
    const response = await fetch(`${base}/models`, { headers });
    if (!response.ok) {
      throw new Error(`NIM models request failed: HTTP ${response.status}`);
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

    return nimCapabilities(model.id, target, model.raw);
  },

  serializeReasoning(
    _capabilities: ModelReasoningCapabilities,
    preferences: ReasoningPreferences,
  ): SerializedReasoning {
    return serializeReasoning("nvidia-nim", _capabilities, preferences);
  },
};

/** Exported for tests and documentation. */
export { nimDocumentedEfforts };
