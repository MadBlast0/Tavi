/**
 * Anthropic adapter.
 *
 * Capability discovery comes from the documented `GET /v1/models` shape, which
 * publishes effort and thinking *separately*:
 *
 *   capabilities.effort  { supported, low, medium, high, xhigh?, max? }  each a
 *                        `{ supported: boolean }`
 *   capabilities.thinking { supported, types: { adaptive, enabled, disabled } }
 *
 * That separation is the whole point of the adapter. Effort and thinking mode
 * are independent: a model can accept `thinking.type: "disabled"` while
 * rejecting a particular effort level, and `disabled.supported` is documented as
 * "false exactly when a request that sends it gets a 400 from this model".
 *
 * Fixtures under `server/fixtures/` mirror that schema. Tests exercise parsing
 * from fixtures, so behaviour is verified without a credential or a billable
 * request. Live discovery is exercised only when `ANTHROPIC_API_KEY` is set.
 */

import {
  availableEffort,
  readSupport,
  type CapabilitySource,
  type EffortCapability,
  type EffortValue,
  type ModelTarget,
  type SupportStatus,
  type ThinkingBudgetCapability,
  type ThinkingModeCapability,
  type ThinkingModeOption,
} from "../src/lib/reasoning.ts";
import type {
  ModelProviderAdapter,
  ProviderConnection,
  ProviderModel,
} from "./providers.ts";

const ANTHROPIC_MODELS_URL = "https://api.anthropic.com/v1/models";
const ANTHROPIC_VERSION = "2023-06-01";

/** Effort levels Anthropic publishes, most intense last. */
const EFFORT_LEVELS = ["low", "medium", "high", "xhigh", "max"] as const;

/**
 * `thinking.type` values and how each behaves. `enabled` is manual extended
 * thinking with a caller-set `budget_tokens`; that is Anthropic's term and is
 * only used where the API expects it.
 */
const THINKING_TYPES = {
  adaptive: {
    label: "Adaptive",
    description: "The model decides whether and how much to think.",
    behavior: "adaptive",
  },
  enabled: {
    label: "Extended thinking",
    description:
      "Thinking runs for a budget of tokens you set. Rejected by some newer models.",
    behavior: "manual_enabled",
  },
  disabled: {
    label: "Off",
    description: "No thinking blocks. Rejected by models that always reason.",
    behavior: "disabled",
  },
} as const satisfies Record<
  string,
  { label: string; description: string; behavior: ThinkingModeOption["behavior"] }
>;

/** Intensity hint for ordering only; never used to derive a wire value. */
const EFFORT_INTENSITY: Record<string, EffortValue["intensity"]> = {
  low: "low",
  medium: "medium",
  high: "high",
  xhigh: "maximum",
  max: "maximum",
};

const EFFORT_LABELS: Record<string, string> = {
  low: "Low",
  medium: "Medium",
  high: "High",
  xhigh: "Extra high",
  max: "Max",
};

/* ------------------------------------------------------------------ */

type CapabilitySupport = { supported?: boolean } | null | undefined;

type AnthropicModel = {
  id?: string;
  display_name?: string;
  capabilities?: {
    effort?: Record<string, CapabilitySupport> & { supported?: boolean } | null;
    thinking?: {
      supported?: boolean;
      types?: Record<string, CapabilitySupport> | null;
    } | null;
  } | null;
  max_input_tokens?: number | null;
};

/**
 * Reads a per-level support flag. A missing key means the provider did not
 * publish that level, which is not the same as it being unsupported.
 */
const levelStatus = (value: CapabilitySupport): SupportStatus => {
  if (value === undefined || value === null) return "unknown";
  if (typeof value.supported === "boolean") {
    return value.supported ? "supported" : "unsupported";
  }
  return "unknown";
};

type EffortBlock =
  | (Record<string, CapabilitySupport> & { supported?: boolean })
  | null
  | undefined;

type ThinkingBlock =
  | { supported?: boolean; types?: Record<string, CapabilitySupport> | null }
  | null
  | undefined;

const anthropicEffort = (
  effort: EffortBlock,
  source: CapabilitySource,
): EffortCapability => {
  if (effort === null || effort === undefined) {
    // The whole capability block is absent. Unknown, not unsupported.
    return { status: "unknown", parameterName: "output_config.effort", defaultKnown: false, source };
  }

  const overall = readSupport(effort);
  const values: EffortValue[] = [];
  for (const level of EFFORT_LEVELS) {
    const status = levelStatus((effort as Record<string, CapabilitySupport>)[level]);
    if (status === "supported") {
      values.push({
        value: level,
        label: EFFORT_LABELS[level] ?? level,
        order: values.length,
        intensity: EFFORT_INTENSITY[level],
      });
    }
  }

  // Published per-level flags are authoritative. An overall `supported: false`
  // with no per-level detail is also a statement; anything vaguer stays unknown.
  const status: SupportStatus =
    values.length > 0 ? "supported" : overall === "unsupported" ? "unsupported" : "unknown";

  return {
    status,
    parameterName: "output_config.effort",
    values: values.length ? values : undefined,
    defaultKnown: false,
    source,
  };
};

const anthropicThinkingMode = (
  thinking: ThinkingBlock,
  source: CapabilitySource,
): ThinkingModeCapability => {
  if (thinking === null || thinking === undefined) {
    return { status: "unknown", defaultKnown: false, canDisable: "unknown", source };
  }

  const types = thinking.types;
  if (types === null || types === undefined) {
    return { status: "unknown", defaultKnown: false, canDisable: "unknown", source };
  }

  const options: ThinkingModeOption[] = [];
  for (const [value, meta] of Object.entries(THINKING_TYPES)) {
    if (levelStatus(types[value]) === "supported") {
      options.push({
        value,
        label: meta.label,
        description: meta.description,
        behavior: meta.behavior,
      });
    }
  }

  const canDisable = levelStatus(types.disabled);
  return {
    status: options.length ? "supported" : "unknown",
    parameterName: "thinking.type",
    options: options.length ? options : undefined,
    defaultKnown: false,
    // Only claimed when the model documents that it cannot be turned off.
    alwaysOn: options.length > 0 && canDisable === "unsupported" ? true : undefined,
    canDisable,
    source,
  };
};

export const anthropicAdapter: ModelProviderAdapter = {
  id: "anthropic",
  label: "Anthropic",
  hasLiveDiscovery: true,

  async listModels(connection: ProviderConnection): Promise<ProviderModel[]> {
    const apiKey = process.env[connection.credentialRef ?? "ANTHROPIC_API_KEY"];
    if (!apiKey) {
      throw new Error("ANTHROPIC_API_KEY is not set");
    }
    const base = connection.baseUrl ?? "https://api.anthropic.com";
    const response = await fetch(`${base}/v1/models?limit=1000`, {
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
    const raw = (model.raw ?? {}) as AnthropicModel;
    const source: CapabilitySource = {
      kind: "live_metadata",
      url: ANTHROPIC_MODELS_URL,
      confidence: "high",
      notes: `Anthropic Models API capabilities for ${model.id}`,
    };

    const target: ModelTarget = {
      connectionId: connection.id,
      providerId: connection.providerId,
      apiProtocol: "anthropic-messages",
      modelId: model.id,
    };

    const effort = anthropicEffort(raw.capabilities?.effort, source);
    const thinkingMode = anthropicThinkingMode(raw.capabilities?.thinking, source);

    // Manual thinking is configured by token budget, so the budget only exists
    // when the model accepts `thinking.type: "enabled"`. No bounds are invented.
    const budget: ThinkingBudgetCapability = {
      status: thinkingMode.options?.some((o) => o.behavior === "manual_enabled")
        ? "supported"
        : "unknown",
      parameterName: "thinking.budget_tokens",
      unit: "tokens",
      semantics: "best_effort_upper_bound",
      source,
    };

    return {
      target,
      reasoningCapability: readSupport(raw.capabilities?.thinking),
      effort,
      thinkingMode,
      thinkingBudget: budget,
      // Anthropic returns thinking blocks in `content`; there is no separate
      // include/exclude flag to advertise here.
      display: { summary: "supported", thinkingContent: "supported", source },
      executionMode: { status: "unknown", defaultKnown: false, source },
      rawMetadata: model.raw,
      schemaVersion: 2,
      sources: [source],
    };
  },

  serializeReasoning(capabilities, preferences) {
    const fields: Record<string, unknown> = {};
    const thinking: Record<string, unknown> = {};

    /* Thinking mode is validated and emitted independently of effort. Choosing
       a thinking mode never sets an effort, and choosing an effort never sets a
       thinking type. */
    if (preferences.thinkingMode.mode === "explicit") {
      const requested = preferences.thinkingMode.value;
      const options = capabilities.thinkingMode.options ?? [];
      if (capabilities.thinkingMode.status !== "supported") {
        return {
          kind: "reject",
          message:
            "This model's thinking modes are not published, so that setting cannot be verified. Use the provider default instead.",
        };
      }
      const match = options.find((o) => o.value === requested);
      if (!match) {
        return {
          kind: "reject",
          message: `This model does not accept thinking mode "${requested}". It accepts: ${options
            .map((o) => o.value)
            .join(", ")}.`,
        };
      }
      thinking.type = match.value;
      // `enabled` is manual thinking, which is meaningless without a budget, so
      // it is never sent on its own.
      if (match.behavior === "manual_enabled") {
        return {
          kind: "reject",
          message:
            'Extended thinking needs a token budget, which this app does not set yet. Choose "Adaptive" or use the provider default.',
        };
      }
    }

    if (preferences.effort.mode === "explicit") {
      const requested = preferences.effort.value;
      const levels = availableEffort(capabilities.effort);
      if (levels.length === 0) {
        return {
          kind: "reject",
          message:
            capabilities.effort.status === "unsupported"
              ? "This model does not support a reasoning-effort setting."
              : "This model's effort levels are not published, so that setting cannot be verified. Use the provider default instead.",
        };
      }
      if (!levels.some((level) => level.value === requested)) {
        return {
          kind: "reject",
          message: `This model does not accept effort "${requested}". It accepts: ${levels
            .map((level) => level.value)
            .join(", ")}.`,
        };
      }
      fields.output_config = { effort: requested };
    }

    if (Object.keys(thinking).length) fields.thinking = thinking;

    // Provider default on both facets means send neither field.
    return Object.keys(fields).length
      ? { kind: "payload", fields }
      : { kind: "omit" };
  },
};