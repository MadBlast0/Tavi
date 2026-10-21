/**
 * The model catalogue, and what can be told from it.
 *
 * A catalogue is a list of models, and each entry says what that model can do.
 * That has to be read the same way wherever it is read: the Node server that
 * serves the website, and the desktop app, which gets the catalogue from Rust
 * and reads it here.
 *
 * So the reading lives here rather than in the server, and both use it. The
 * effort the picker offers, and the effort the server refuses, come out of
 * the same description of the same model.
 */

import {
  readSupport,
  type CapabilitySource,
  type EffortCapability,
  type EffortValue,
  type ModelReasoningCapabilities,
  type ModelTarget,
  type SupportStatus,
  type ThinkingModeCapability,
} from "./reasoning.ts"

/**
 * What the browser receives.
 *
 * The upstream catalogue is several megabytes and carries descriptions,
 * benchmarks and provider links the interface never renders, so it is projected
 * down. `capabilities` is the full normalised profile: the reasoning controls are
 * several distinct facets, and collapsing them here is what previously made
 * effort and thinking look interchangeable.
 */
export type SlimModel = {
  id: string;
  name: string;
  provider: string;
  contextLength: number | null;
  free: boolean;
  supportsTools: boolean;
  supportsReasoning: boolean;
  capabilities: ModelReasoningCapabilities;
  inputModalities: string[];
  outputModalities: string[];
  promptPrice: number;
  completionPrice: number;
  /**
   * The price of a token the provider has already cached.
   *
   * Null when the provider publishes no such price. Cached input is billed at
   * its own rate, and pricing it at the full input rate over-reports what a
   * request costs.
   */
  cachedInputPrice: number | null;
}

/** A model, as the provider names it. */
export type CatalogueModel = {
  id: string;
  displayName: string;
  /** The provider's own metadata, kept so nothing is lost in normalisation. */
  raw: unknown;
}

/** Which connection the catalogue came through. */
export type CatalogueSource = {
  connectionId: string;
  providerId: string;
  apiProtocol: string;
}

/** Where the catalogue comes from, for the record. */
const OPENROUTER_MODELS_URL = "https://openrouter.ai/api/v1/models";

/**
 * Labels are presentation only. `intensity` is a coarse cross-provider hint for
 * ordering and is never used to derive or translate a wire value.
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
 * fact, not a universal one — it is why this records no thinking-mode options
 * rather than inventing `enabled`/`disabled`.
 *
 * It does publish two things about the same question, and they are read here:
 *
 * - `mandatory` means reasoning cannot be turned off for this model at all.
 *   A model like that gets information, not a control that would do nothing.
 * - `default_enabled` says whether the model reasons unless told otherwise.
 */
const openRouterThinkingMode = (
  reasoning: OpenRouterReasoningMeta | undefined,
  source: CapabilitySource,
): ThinkingModeCapability => {
  const mandatory = reasoning?.mandatory === true;
  const defaultEnabled = reasoning?.default_enabled;

  return {
    status: "unknown",
    defaultKnown: defaultEnabled !== undefined,
    defaultEnabled: defaultEnabled === undefined ? undefined : defaultEnabled,
    alwaysOn: mandatory,
    canDisable: mandatory ? "unsupported" : "unknown",
    source,
  };
};

/** What a model can do, as the gateway describes it. */
export const openRouterCapabilities = (
  model: CatalogueModel,
  target: ModelTarget,
): ModelReasoningCapabilities => {
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
};

const toNumber = (value: string | undefined): number => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
};

/**
 * Display names are already "Provider: Model", so the provider grouping comes
 * free and no separate taxonomy is needed.
 */
const deriveProvider = (name: string, id: string) => {
  const separator = name.indexOf(":");
  if (separator > 0) return name.slice(0, separator).trim();
  const slash = id.indexOf("/");
  return slash > 0 ? id.slice(0, slash) : id;
};

/** Projects a model down to what the interface renders. */
export const projectModel = (
  model: CatalogueModel,
  capabilities: ModelReasoningCapabilities,
): SlimModel => {
  const raw = (model.raw ?? {}) as {
    context_length?: number;
    architecture?: { input_modalities?: string[]; output_modalities?: string[] };
    pricing?: {
      prompt?: string;
      completion?: string;
      input_cache_read?: string;
    };
    supported_parameters?: string[];
  };

  const promptPrice = toNumber(raw.pricing?.prompt);
  const completionPrice = toNumber(raw.pricing?.completion);
  /* A provider that publishes no cached-input price is not saying the cached
     input is free; it is saying nothing, and the full input rate is the only
     honest figure to quote. */
  const cachedInputPrice =
    raw.pricing?.input_cache_read === undefined
      ? null
      : toNumber(raw.pricing.input_cache_read);

  return {
    id: model.id,
    name: model.displayName,
    provider: deriveProvider(model.displayName, model.id),
    contextLength: raw.context_length ?? null,
    free: promptPrice === 0 && completionPrice === 0,
    supportsTools: (raw.supported_parameters ?? []).includes("tools"),
    supportsReasoning: capabilities.reasoningCapability !== "unsupported",
    capabilities,
    inputModalities: raw.architecture?.input_modalities ?? ["text"],
    outputModalities: raw.architecture?.output_modalities ?? ["text"],
    promptPrice,
    completionPrice,
    cachedInputPrice,
  };
};

/** The target a model is reached through. */
const openRouterTarget = (
  source: CatalogueSource,
  modelId: string,
): ModelTarget => ({
  connectionId: source.connectionId,
  providerId: source.providerId,
  apiProtocol: source.apiProtocol,
  modelId,
  gatewayModelId: modelId,
});

/**
 * The catalogue, as the gateway publishes it, read into the shape the
 * interface uses.
 *
 * This is what the desktop app does with the catalogue Rust fetches for it.
 */
export const openRouterCatalogue = (
  raw: unknown,
  source: CatalogueSource,
): SlimModel[] => {
  const data = (raw as { data?: unknown[] } | null)?.data ?? [];
  return data.map((entry) => {
    const model = (entry ?? {}) as { id?: string; name?: string };
    const catalogueModel: CatalogueModel = {
      id: model.id ?? "",
      displayName: model.name ?? model.id ?? "",
      raw: entry,
    };
    return projectModel(
      catalogueModel,
      openRouterCapabilities(
        catalogueModel,
        openRouterTarget(source, catalogueModel.id),
      ),
    );
  });
};
