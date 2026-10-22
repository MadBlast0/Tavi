/**
 * What each provider says about a model, read the one way.
 *
 * A catalogue is a list of models, and each entry says what that model can do.
 * That has to be read the same way wherever it is read: the Node server that
 * serves the website, and the desktop app, which gets the catalogue from Rust
 * and reads it here.
 *
 * So the reading lives here rather than in the server, and both use it. The
 * effort the picker offers, and the effort the server refuses, come out of the
 * same description of the same model.
 *
 * OpenRouter's reading is in `catalogue.ts`, beside the projection it belongs
 * to. The other three are here, because they answer a different question: what
 * the provider publishes about a model, in the provider's own shape.
 */

import {
  readSupport,
  type CapabilitySource,
  type EffortCapability,
  type EffortValue,
  type ModelReasoningCapabilities,
  type ModelTarget,
  type SupportStatus,
  type ThinkingBudgetCapability,
  type ThinkingModeCapability,
  type ThinkingModeOption,
} from "./reasoning.ts"

/**
 * A capability block, as a provider publishes it.
 *
 * Every field is optional, and absent means "the provider did not say", which
 * is not the same as "there is none".
 */
type CapabilitySupport = { supported?: boolean } | null | undefined

/** Reads a per-level support flag. */
const levelStatus = (value: CapabilitySupport): SupportStatus => {
  if (value === undefined || value === null) return "unknown"
  if (typeof value.supported === "boolean") {
    return value.supported ? "supported" : "unsupported"
  }
  return "unknown"
}

/* -------------------------------------------------------------------------- */
/* OpenAI                                                                     */
/* -------------------------------------------------------------------------- */

/** Where the documented values came from, and when they were last read. */
export const OPENAI_REASONING_GUIDE =
  "https://platform.openai.com/docs/guides/reasoning"

/** When the curated table below was last checked against the guide. */
export const OPENAI_REVIEWED_AT = "2026-10-18"

/**
 * Values documented for OpenAI's reasoning effort.
 *
 * `max` is at the top: OpenAI's Chat Completions reference documents
 * `none, minimal, low, medium, high, xhigh, max`. It is not borrowed from
 * `verbosity`, which is a different control.
 */
const OPENAI_DOCUMENTED_EFFORT_VALUES = [
  "none",
  "minimal",
  "low",
  "medium",
  "high",
  "xhigh",
  "max",
] as const

const OPENAI_EFFORT_INTENSITY: Record<string, EffortValue["intensity"]> = {
  none: "minimal",
  minimal: "minimal",
  low: "low",
  medium: "medium",
  high: "high",
  xhigh: "maximum",
  max: "maximum",
}

const OPENAI_EFFORT_LABELS: Record<string, string> = {
  none: "None",
  minimal: "Minimal",
  low: "Low",
  medium: "Medium",
  high: "High",
  xhigh: "Extra high",
  max: "Max",
}

type Curated = {
  /** Exact accepted values, in the guide's order. */
  levels: readonly string[]
  /** Only where the guide documents a default. */
  default?: string
  notes: string
}

/**
 * Documented cases only. Keyed by exact model id so a near-miss cannot silently
 * inherit another model's capability — matching on a family name is exactly what
 * the specification forbids.
 */
const OPENAI_CURATED: Record<string, Curated> = {
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
}

const openaiCuratedFor = (modelId: string): Curated | undefined =>
  OPENAI_CURATED[modelId]

const openaiEffort = (
  modelId: string,
  source: CapabilitySource,
): EffortCapability => {
  const curated = openaiCuratedFor(modelId)
  if (!curated) {
    // Not curated: not "unsupported", simply not established.
    return {
      status: "unknown",
      parameterName: "reasoning.effort",
      defaultKnown: false,
      source,
    }
  }
  const values: EffortValue[] = curated.levels.map((level, order) => ({
    value: level,
    label: OPENAI_EFFORT_LABELS[level] ?? level,
    order,
    intensity: OPENAI_EFFORT_INTENSITY[level],
  }))
  return {
    status: "supported",
    parameterName: "reasoning.effort",
    values,
    defaultValue: curated.default,
    defaultKnown: curated.default !== undefined,
    semantics: curated.notes,
    source,
  }
}

/** What OpenAI publishes about a model. */
export const openaiCapabilities = (
  modelId: string,
  target: ModelTarget,
  raw: unknown,
): ModelReasoningCapabilities => {
  const source: CapabilitySource = {
    kind: "official_docs",
    url: OPENAI_REASONING_GUIDE,
    reviewedAt: OPENAI_REVIEWED_AT,
    confidence: "medium",
    notes:
      openaiCuratedFor(modelId)?.notes ??
      "No curated capability record for this model",
  }

  return {
    target,
    reasoningCapability: openaiCuratedFor(modelId) ? "supported" : "unknown",
    effort: openaiEffort(modelId, source),
    /* OpenAI has no `thinking.type` equivalent in this surface. */
    thinkingMode: {
      status: "unsupported",
      defaultKnown: false,
      canDisable: "unknown",
      source,
    },
    /* No numeric reasoning budget in this surface either. */
    thinkingBudget: { status: "unsupported", source },
    /* Reasoning summaries are a separate output control from effort, and are
       not switched on or off by it. */
    display: { summary: "supported", thinkingContent: "unknown", source },
    /* `reasoning.mode` (standard/pro) exists on newer models only; left
       unknown rather than assumed. */
    executionMode: { status: "unknown", defaultKnown: false, source },
    rawMetadata: raw,
    schemaVersion: 2,
    sources: [source],
  }
}

/* -------------------------------------------------------------------------- */
/* Anthropic                                                                  */
/* -------------------------------------------------------------------------- */

/** Where Anthropic's models and their capabilities are published. */
export const ANTHROPIC_MODELS_URL = "https://api.anthropic.com/v1/models"

/** The version header Anthropic's API requires. */
export const ANTHROPIC_VERSION = "2023-06-01"

/** Effort levels Anthropic publishes, most intense last. */
const ANTHROPIC_EFFORT_LEVELS = ["low", "medium", "high", "xhigh", "max"] as const

/**
 * `thinking.type` values and how each behaves. `enabled` is manual extended
 * thinking with a caller-set `budget_tokens`; that is Anthropic's term and is
 * only used where the API expects it.
 *
 * `between_tools` is the low-thinking alternative Anthropic publishes: the
 * model thinks between tool calls without extended thinking for the whole
 * turn. It matters because Anthropic documents that `disabled` is rejected at
 * high effort on the newest models, and `between_tools` is what is left.
 */
export const ANTHROPIC_THINKING_TYPES = {
  adaptive: {
    label: "Adaptive",
    description: "The model decides whether and how much to think.",
    behavior: "adaptive",
  },
  between_tools: {
    label: "Between tools",
    description:
      "The model thinks between tool calls, without extended thinking for the whole turn.",
    behavior: "between_tools",
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
>

const ANTHROPIC_EFFORT_INTENSITY: Record<string, EffortValue["intensity"]> = {
  low: "low",
  medium: "medium",
  high: "high",
  xhigh: "maximum",
  max: "maximum",
}

const ANTHROPIC_EFFORT_LABELS: Record<string, string> = {
  low: "Low",
  medium: "Medium",
  high: "High",
  xhigh: "Extra high",
  max: "Max",
}

type EffortBlock =
  | (Record<string, CapabilitySupport> & { supported?: boolean })
  | null
  | undefined

type ThinkingBlock =
  | { supported?: boolean; types?: Record<string, CapabilitySupport> | null }
  | null
  | undefined

/** What Anthropic publishes about a model, in the shape it publishes it. */
export type AnthropicModel = {
  id?: string
  display_name?: string
  capabilities?: {
    effort?: EffortBlock
    thinking?: ThinkingBlock
  } | null
  max_input_tokens?: number | null
}

const anthropicEffort = (
  effort: EffortBlock,
  source: CapabilitySource,
): EffortCapability => {
  if (effort === null || effort === undefined) {
    // The whole capability block is absent. Unknown, not unsupported.
    return {
      status: "unknown",
      parameterName: "output_config.effort",
      defaultKnown: false,
      source,
    }
  }

  const overall = readSupport(effort)
  const values: EffortValue[] = []
  for (const level of ANTHROPIC_EFFORT_LEVELS) {
    const status = levelStatus((effort as Record<string, CapabilitySupport>)[level])
    if (status === "supported") {
      values.push({
        value: level,
        label: ANTHROPIC_EFFORT_LABELS[level] ?? level,
        order: values.length,
        intensity: ANTHROPIC_EFFORT_INTENSITY[level],
      })
    }
  }

  // Published per-level flags are authoritative. An overall `supported: false`
  // with no per-level detail is also a statement; anything vaguer stays unknown.
  const status: SupportStatus =
    values.length > 0
      ? "supported"
      : overall === "unsupported"
        ? "unsupported"
        : "unknown"

  return {
    status,
    parameterName: "output_config.effort",
    values: values.length ? values : undefined,
    defaultKnown: false,
    source,
  }
}

const anthropicThinkingMode = (
  thinking: ThinkingBlock,
  source: CapabilitySource,
): ThinkingModeCapability => {
  if (thinking === null || thinking === undefined) {
    return { status: "unknown", defaultKnown: false, canDisable: "unknown", source }
  }

  const types = thinking.types
  if (types === null || types === undefined) {
    return { status: "unknown", defaultKnown: false, canDisable: "unknown", source }
  }

  const options: ThinkingModeOption[] = []
  for (const [value, meta] of Object.entries(ANTHROPIC_THINKING_TYPES)) {
    if (levelStatus(types[value]) === "supported") {
      options.push({
        value,
        label: meta.label,
        description: meta.description,
        behavior: meta.behavior,
      })
    }
  }

  const canDisable = levelStatus(types.disabled)
  return {
    status: options.length ? "supported" : "unknown",
    parameterName: "thinking.type",
    options: options.length ? options : undefined,
    defaultKnown: false,
    // Only claimed when the model documents that it cannot be turned off.
    alwaysOn: options.length > 0 && canDisable === "unsupported" ? true : undefined,
    canDisable,
    source,
  }
}

/** What Anthropic publishes about a model. */
export const anthropicCapabilities = (
  modelId: string,
  target: ModelTarget,
  raw: unknown,
): ModelReasoningCapabilities => {
  const model = (raw ?? {}) as AnthropicModel
  const source: CapabilitySource = {
    kind: "live_metadata",
    url: ANTHROPIC_MODELS_URL,
    confidence: "high",
    notes: `Anthropic Models API capabilities for ${modelId}`,
  }

  const effort = anthropicEffort(model.capabilities?.effort, source)
  const thinkingMode = anthropicThinkingMode(model.capabilities?.thinking, source)

  // Manual thinking is configured by token budget, so the budget only exists
  // when the model accepts `thinking.type: "enabled"`. No bounds are invented.
  const budget: ThinkingBudgetCapability = {
    status: thinkingMode.options?.some((option) => option.behavior === "manual_enabled")
      ? "supported"
      : "unknown",
    parameterName: "thinking.budget_tokens",
    unit: "tokens",
    semantics: "best_effort_upper_bound",
    source,
  }

  return {
    target,
    reasoningCapability: readSupport(model.capabilities?.thinking),
    effort,
    thinkingMode,
    thinkingBudget: budget,
    // Anthropic returns thinking blocks in `content`; there is no separate
    // include/exclude flag to advertise here.
    display: { summary: "supported", thinkingContent: "supported", source },
    executionMode: { status: "unknown", defaultKnown: false, source },
    rawMetadata: raw,
    schemaVersion: 2,
    sources: [source],
  }
}

/* -------------------------------------------------------------------------- */
/* NVIDIA NIM                                                                 */
/* -------------------------------------------------------------------------- */

/** Where NIM's own documentation lives. */
export const NIM_DOCS = "https://docs.api.nvidia.com/nim/reference/llm-apis"

const NIM_EFFORT_LABELS: Record<string, string> = {
  low: "Low",
  medium: "Medium",
  high: "High",
}

/**
 * Effort values NIM's documented GPT-OSS deployments accept. Recorded for
 * provenance; not currently promoted to `supported` because the deployment
 * requirement cannot be verified from the API.
 */
const NIM_GPT_OSS_DOCUMENTED_EFFORTS = ["low", "medium", "high"] as const

const NIM_GPT_OSS_MODELS = new Set([
  "meta/llama-3.3-70b-instruct",
  "openai/gpt-oss-20b",
  "openai/gpt-oss-120b",
  "nvidia/llama-3.1-nemotron-70b-instruct",
])

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
  return undefined
}

const nimDocumentedFor = (modelId: string) =>
  NIM_GPT_OSS_MODELS.has(modelId) || /gpt-oss/i.test(modelId)

/**
 * What NIM publishes about a model.
 *
 * NIM's models endpoint carries no capability fields at all, so everything
 * here resolves to `unknown`, which keeps the interface on the provider
 * default rather than offering a control that would fail on a deployment
 * without the reasoning parser.
 */
export const nimCapabilities = (
  modelId: string,
  target: ModelTarget,
  raw: unknown,
): ModelReasoningCapabilities => {
  const fromDeployment = nimEffortFromDeployment(modelId, raw)
  const documented = nimDocumentedFor(modelId)

  const source: CapabilitySource = {
    kind: documented ? "official_docs" : "user_override",
    url: NIM_DOCS,
    confidence: "low",
    notes: documented
      ? "NIM documents reasoning_effort for GPT-OSS models under multi-LLM deployments configured with NIM_REASONING_PARSER=openai_gptoss. That deployment setting is not observable through the API, so support is not claimed."
      : "NIM publishes no capability metadata for this model.",
  }

  const values: EffortValue[] = NIM_GPT_OSS_DOCUMENTED_EFFORTS.map(
    (level, order) => ({
      value: level,
      label: NIM_EFFORT_LABELS[level] ?? level,
      order,
      intensity: level as EffortValue["intensity"],
    }),
  )

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
        ? `Documented for NIM GPT-OSS deployments: ${NIM_GPT_OSS_DOCUMENTED_EFFORTS.join(", ")}. Requires NIM_REASONING_PARSER=openai_gptoss, which this app cannot verify.`
        : undefined,
      source,
    },
    thinkingMode: { status: "unknown", defaultKnown: false, canDisable: "unknown", source },
    thinkingBudget: { status: "unknown", source },
    display: { summary: "unknown", thinkingContent: "unknown", source },
    executionMode: { status: "unknown", defaultKnown: false, source },
    rawMetadata: raw,
    schemaVersion: 2,
    sources: [source],
    // Retained so the documented levels are not lost, without being offered.
    ...(documented
      ? { rawMetadata: { ...(raw as object), documentedEffort: values.map((v) => v.value) } }
      : {}),
  }
}

/* -------------------------------------------------------------------------- */
/* The dispatcher                                                              */
/* -------------------------------------------------------------------------- */

/**
 * Reads a model the way its provider publishes it.
 *
 * OpenRouter is not here: its reading is in `catalogue.ts`, beside the
 * projection it belongs to, and it is a different shape from the other three.
 */
export const capabilitiesFor = (
  providerId: string,
  modelId: string,
  target: ModelTarget,
  raw: unknown,
): ModelReasoningCapabilities | undefined => {
  switch (providerId) {
    case "openai":
      return openaiCapabilities(modelId, target, raw)
    case "anthropic":
      return anthropicCapabilities(modelId, target, raw)
    case "nvidia-nim":
      return nimCapabilities(modelId, target, raw)
    default:
      return undefined
  }
}

/** Exposed for tests: the documented enum, and the curated table. */
export const openaiDocumentedValues = OPENAI_DOCUMENTED_EFFORT_VALUES
export const openaiCurated = OPENAI_CURATED
export const nimDocumentedEfforts = NIM_GPT_OSS_DOCUMENTED_EFFORTS
