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
 * A deployment that does expose capability metadata can replace
 * `nimEffortFromDeployment` below without any change to the UI or request path.
 */

import { serverCredential } from "./key-store.ts";
import {
  type CapabilitySource,
  type EffortCapability,
  type EffortValue,
  type ModelTarget,
} from "../src/lib/reasoning.ts";
import type {
  ModelProviderAdapter,
  ProviderConnection,
  ProviderModel,
} from "./providers.ts";

const NIM_DOCS = "https://docs.api.nvidia.com/nim/reference/llm-apis";

const EFFORT_LABELS: Record<string, string> = {
  low: "Low",
  medium: "Medium",
  high: "High",
};

/**
 * Effort values NIM's documented GPT-OSS deployments accept. Recorded for
 * provenance; not currently promoted to `supported` because the deployment
 * requirement cannot be verified from the API.
 */
const GPT_OSS_DOCUMENTED_EFFORTS = ["low", "medium", "high"] as const;

const GPT_OSS_MODELS = new Set([
  "meta/llama-3.3-70b-instruct",
  "openai/gpt-oss-20b",
  "openai/gpt-oss-120b",
  "nvidia/llama-3.1-nemotron-70b-instruct",
]);

/**
 * Extension point for a deployment that does publish capabilities. Kept as a
 * function so the absence of metadata is a single visible seam rather than a
 * hardcoded "unsupported".
 */
const nimEffortFromDeployment = (
  _modelId: string,
  _raw: unknown,
): EffortCapability | undefined => {
  // No deployment capability channel is exposed by the models endpoint, so there
  // is nothing to read here yet. Returning undefined means "unknown".
  return undefined;
};

const documentedFor = (modelId: string) =>
  GPT_OSS_MODELS.has(modelId) || /gpt-oss/i.test(modelId);

export const nimAdapter: ModelProviderAdapter = {
  id: "nvidia-nim",
  label: "NVIDIA NIM",
  hasLiveDiscovery: false,

  async listModels(connection: ProviderConnection): Promise<ProviderModel[]> {
    const apiKey = serverCredential(connection.credentialRef ?? "NVIDIA_API_KEY");
    const base = connection.baseUrl ?? "https://integrate.api.nvidia.com";
    const headers: Record<string, string> = { accept: "application/json" };
    // NIM permits unauthenticated listing, but a key gives the account's models.
    if (apiKey) headers.authorization = `Bearer ${apiKey}`;
    const response = await fetch(`${base}/v1/models`, { headers });
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
    const fromDeployment = nimEffortFromDeployment(model.id, model.raw);
    const documented = documentedFor(model.id);

    const source: CapabilitySource = {
      kind: documented ? "official_docs" : "user_override",
      url: NIM_DOCS,
      confidence: "low",
      notes: documented
        ? "NIM documents reasoning_effort for GPT-OSS models under multi-LLM deployments configured with NIM_REASONING_PARSER=openai_gptoss. That deployment setting is not observable through the API, so support is not claimed."
        : "NIM publishes no capability metadata for this model.",
    };

    const target: ModelTarget = {
      connectionId: connection.id,
      providerId: connection.providerId,
      apiProtocol: "openai-chat-completions",
      modelId: model.id,
    };

    const values: EffortValue[] = GPT_OSS_DOCUMENTED_EFFORTS.map((level, order) => ({
      value: level,
      label: EFFORT_LABELS[level] ?? level,
      order,
      intensity: level as EffortValue["intensity"],
    }));

    return {
      target,
      /* A reasoning capability is not established either way. */
      reasoningCapability: "unknown",
      effort: fromDeployment ?? {
        status: "unknown",
        parameterName: "reasoning_effort",
        // Documented values are kept for provenance but not offered, because
        // offering them would imply the deployment requirement is met.
        values: undefined,
        defaultKnown: false,
        semantics: documented
          ? `Documented for NIM GPT-OSS deployments: ${GPT_OSS_DOCUMENTED_EFFORTS.join(", ")}. Requires NIM_REASONING_PARSER=openai_gptoss, which this app cannot verify.`
          : undefined,
        source,
      },
      thinkingMode: { status: "unknown", defaultKnown: false, canDisable: "unknown", source },
      thinkingBudget: { status: "unknown", source },
      display: { summary: "unknown", thinkingContent: "unknown", source },
      executionMode: { status: "unknown", defaultKnown: false, source },
      rawMetadata: model.raw,
      schemaVersion: 2,
      sources: [source],
      // Retained so the documented levels are not lost, without being offered.
      ...(documented ? { rawMetadata: { ...(model.raw as object), documentedEffort: values.map((v) => v.value) } } : {}),
    };
  },

  serializeReasoning(_capabilities, preferences) {
    /* Support is unknown, so no explicit effort can be verified. Refusing rather
       than forwarding it is what keeps a GPT-OSS control from failing silently on
       a deployment without the reasoning parser. */
    if (preferences.effort.mode === "provider_default") return { kind: "omit" };
    return {
      kind: "reject",
      message:
        "NVIDIA NIM publishes no reasoning-capability metadata, so an explicit effort cannot be verified. Use the provider default instead.",
    };
  },
};

/** Exported for tests and documentation. */
export const nimDocumentedEfforts = GPT_OSS_DOCUMENTED_EFFORTS;
