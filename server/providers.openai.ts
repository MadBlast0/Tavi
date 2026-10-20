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
 */

import {
  availableEffort,
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

const REASONING_GUIDE = "https://platform.openai.com/docs/guides/reasoning";

/**
 * Values documented for OpenAI's reasoning effort. `max` is deliberately absent:
 * OpenAI's enum stops at `xhigh`, and `max` belongs to Anthropic's effort
 * vocabulary. It is not borrowed from `verbosity`, which is a different control.
 */
const DOCUMENTED_EFFORT_VALUES = [
  "none",
  "minimal",
  "low",
  "medium",
  "high",
  "xhigh",
] as const;

const EFFORT_INTENSITY: Record<string, EffortValue["intensity"]> = {
  none: "minimal",
  minimal: "minimal",
  low: "low",
  medium: "medium",
  high: "high",
  xhigh: "maximum",
};

const EFFORT_LABELS: Record<string, string> = {
  none: "None",
  minimal: "Minimal",
  low: "Low",
  medium: "Medium",
  high: "High",
  xhigh: "Extra high",
};

/** When the curated table below was last checked against the guide. */
const REVIEWED_AT = "2026-10-18";

type Curated = {
  /** Exact accepted values, in the guide's order. */
  levels: readonly string[];
  /** Only where the guide documents a default. */
  default?: string;
  notes: string;
};

/**
 * Documented cases only. Keyed by exact model id so a near-miss cannot silently
 * inherit another model's capability — matching on a family name is exactly what
 * the specification forbids.
 */
const CURATED: Record<string, Curated> = {
  "gpt-5.1": {
    levels: ["none", "low", "medium", "high"],
    default: "none",
    notes: "gpt-5.1 defaults to none; supports none/low/medium/high.",
  },
  "gpt-5-pro": {
    levels: ["high"],
    default: "high",
    notes: "gpt-5-pro defaults to and only supports high.",
  },
};

const curatedFor = (modelId: string): Curated | undefined => CURATED[modelId];

const openaiEffort = (
  modelId: string,
  source: CapabilitySource,
): EffortCapability => {
  const curated = curatedFor(modelId);
  if (!curated) {
    // Not curated: not "unsupported", simply not established.
    return {
      status: "unknown",
      parameterName: "reasoning.effort",
      defaultKnown: false,
      source,
    };
  }
  const values: EffortValue[] = curated.levels.map((level, order) => ({
    value: level,
    label: EFFORT_LABELS[level] ?? level,
    order,
    intensity: EFFORT_INTENSITY[level],
  }));
  return {
    status: "supported",
    parameterName: "reasoning.effort",
    values,
    defaultValue: curated.default,
    defaultKnown: curated.default !== undefined,
    semantics: curated.notes,
    source,
  };
};

export const openaiAdapter: ModelProviderAdapter = {
  id: "openai",
  label: "OpenAI",
  /* Model listing yes, capability discovery no. The Models endpoint is not a
     capability schema, so this is declared rather than faked. */
  hasLiveDiscovery: false,

  async listModels(connection: ProviderConnection): Promise<ProviderModel[]> {
    const apiKey = process.env[connection.credentialRef ?? "OPENAI_API_KEY"];
    if (!apiKey) {
      throw new Error("OPENAI_API_KEY is not set");
    }
    const base = connection.baseUrl ?? "https://api.openai.com";
    const response = await fetch(`${base}/v1/models`, {
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
    const source: CapabilitySource = {
      kind: "official_docs",
      url: REASONING_GUIDE,
      reviewedAt: REVIEWED_AT,
      confidence: "medium",
      notes: curatedFor(model.id)?.notes ?? "No curated capability record for this model",
    };

    const target: ModelTarget = {
      connectionId: connection.id,
      providerId: connection.providerId,
      apiProtocol: "openai-chat-completions",
      modelId: model.id,
    };

    return {
      target,
      reasoningCapability: curatedFor(model.id) ? "supported" : "unknown",
      effort: openaiEffort(model.id, source),
      /* OpenAI has no `thinking.type` equivalent in this surface. */
      thinkingMode: { status: "unsupported", defaultKnown: false, canDisable: "unknown", source },
      /* No numeric reasoning budget in this surface either. */
      thinkingBudget: { status: "unsupported", source },
      /* Reasoning summaries are a separate output control from effort, and are
         not switched on or off by it. */
      display: { summary: "supported", thinkingContent: "unknown", source },
      /* `reasoning.mode` (standard/pro) exists on newer models only; left
         unknown rather than assumed. */
      executionMode: { status: "unknown", defaultKnown: false, source },
      rawMetadata: model.raw,
      schemaVersion: 2,
      sources: [source],
    };
  },

  serializeReasoning(capabilities, preferences) {
    // Provider default: omit the field entirely. Not `medium`.
    if (preferences.effort.mode === "provider_default") return { kind: "omit" };

    const value = preferences.effort.value;
    const levels = availableEffort(capabilities.effort);

    if (levels.length === 0) {
      return {
        kind: "reject",
        message:
          capabilities.effort.status === "unsupported"
            ? "This model does not support a reasoning-effort setting."
            : "This model's reasoning-effort levels are not established for it, so that setting cannot be verified. Use the provider default instead.",
      };
    }
    if (!levels.some((level) => level.value === value)) {
      return {
        kind: "reject",
        message: `This model does not accept effort "${value}". It accepts: ${levels
          .map((level) => level.value)
          .join(", ")}.`,
      };
    }

    // Exact wire value, unmodified. Never translated or renamed.
    return { kind: "payload", fields: { reasoning: { effort: value } } };
  },
};

/** Exposed for tests: the documented enum, and the curated table. */
export const openaiDocumentedValues = DOCUMENTED_EFFORT_VALUES;
export const openaiCurated = CURATED;