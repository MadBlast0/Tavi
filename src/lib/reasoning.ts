/**
 * Normalised reasoning capability schema, shared by the browser and the chat
 * server so validation on either side speaks the same vocabulary.
 *
 * ## Why this is not a list of effort levels
 *
 * The earlier version of this file defined a fixed seven-value vocabulary
 * (`none`/`minimal`/`low`/`medium`/`high`/`xhigh`/`max`) and filtered it per
 * model. That was wrong twice over:
 *
 * 1. It is a *universal* set, but no provider defines one. OpenAI's effort enum
 *    is `none, minimal, low, medium, high, xhigh`; Anthropic's is
 *    `low, medium, high, xhigh, max`; Gemini's `thinking_level` is a different
 *    set again. Publishing one list makes it look like every model accepts every
 *    level, and a value that happens to be in the list but not in a model's real
 *    set gets sent and rejected.
 * 2. Effort, thinking mode, thinking budget and reasoning display are different
 *    controls with different semantics, so they are modelled separately here.
 *    Conflating them is what produced an "off" switch that was really just an
 *    effort level named `none`.
 *
 * Every facet is tri-state. `unknown` is a real answer: an absent metadata field
 * means unsupported / not applicable / not implemented / not exposed on this
 * protocol / metadata omission, and those are not interchangeable.
 */

export type SupportStatus = "supported" | "unsupported" | "unknown";

/**
 * A user preference that can legitimately express "do not override this".
 *
 * Absence is meaningful and is *not* the same as any concrete value — not
 * `medium`, not `false`, not `adaptive`. It serialises to an omitted field.
 */
export type Preference<T> =
  | { mode: "provider_default" }
  | { mode: "explicit"; value: T };

/** Where a capability fact came from, and how much it can be trusted. */
export type CapabilitySource = {
  kind:
    | "live_metadata"
    | "official_docs"
    | "gateway_metadata"
    | "user_override"
    | "observed_validation";
  /** Endpoint or document the fact was read from. Never a credential. */
  url?: string;
  /** Epoch milliseconds, when the metadata was fetched. */
  retrievedAt?: number;
  /** ISO date the documentation was last reviewed. */
  reviewedAt?: string | number;
  confidence: "high" | "medium" | "low";
  notes?: string;
};

/**
 * One accepted effort value.
 *
 * `value` is the exact wire string and is never rewritten for display or
 * convenience. `intensity` is a best-effort, cross-provider hint for sorting and
 * copy only — two providers' `high` are not guaranteed to behave alike, so
 * nothing may be derived from it automatically.
 */
export type EffortValue = {
  value: string;
  label: string;
  /** Position in the provider's own ordering, when it supplied one. */
  order: number;
  intensity?: "minimal" | "low" | "medium" | "high" | "maximum" | "unknown";
  semantics?: string;
};

export type EffortCapability = {
  status: SupportStatus;
  /** The provider's parameter name, which differs per API. */
  parameterName?: string;
  /** Exact accepted values when known. Absent means not enumerated, not empty. */
  values?: EffortValue[];
  /** Only set when explicitly documented or published. */
  defaultValue?: string;
  /** Distinguishes "defaults to X" from "we do not know the default". */
  defaultKnown: boolean;
  semantics?: string;
  source?: CapabilitySource;
};

export type ThinkingModeBehavior =
  | "adaptive"
  | "manual_enabled"
  | "disabled"
  | "between_tools"
  | "automatic"
  | "provider_specific";

export type ThinkingModeOption = {
  /** Exact wire value, e.g. `adaptive`, `between_tools`. */
  value: string;
  label: string;
  description?: string;
  behavior: ThinkingModeBehavior;
};

export type ThinkingModeCapability = {
  status: SupportStatus;
  parameterName?: string;
  options?: ThinkingModeOption[];
  defaultValue?: string;
  defaultKnown: boolean;
  /**
   * Only when authoritative metadata says so. A model that reasons regardless
   * should show an information state, never a switch that does nothing.
   */
  alwaysOn?: boolean;
  /** Whether the model accepts an explicit "off". Distinct from `alwaysOn`. */
  canDisable?: SupportStatus;
  source?: CapabilitySource;
};

export type ThinkingBudgetCapability = {
  status: SupportStatus;
  parameterName?: string;
  unit?: "tokens" | "provider_specific";
  minimum?: number;
  maximum?: number;
  step?: number;
  /**
   * Whether the number is a target, an upper bound or a hard limit. Not
   * interchangeable, and never derivable from an effort level.
   */
  semantics?: "target" | "best_effort_upper_bound" | "hard_limit" | "provider_specific";
  /** Output tokens that must remain available after thinking, where documented. */
  requiredOutputReserve?: number;
  source?: CapabilitySource;
};

/**
 * Whether reasoning output is *returned*, which is a presentation concern and
 * never the same as whether reasoning is computed.
 */
export type ReasoningDisplayCapability = {
  summary: SupportStatus;
  thinkingContent: SupportStatus;
  includeParameter?: string;
  excludeParameter?: string;
  source?: CapabilitySource;
};

/** e.g. `standard` vs `pro`, independent of effort and of thinking mode. */
export type ExecutionModeCapability = {
  status: SupportStatus;
  parameterName?: string;
  options?: Array<{ value: string; label: string; description?: string }>;
  defaultValue?: string;
  defaultKnown: boolean;
  source?: CapabilitySource;
};

/**
 * Identity of the thing a request will actually be sent to.
 *
 * A bare model string is not enough for caching: the same model through a
 * different gateway, protocol or route can expose different parameters,
 * defaults and response shapes.
 */
export type ModelTarget = {
  connectionId: string;
  providerId: string;
  /** e.g. `openai-chat-completions`, `openai-responses`, `anthropic-messages`. */
  apiProtocol: string;
  modelId: string;
  /** The slug the gateway exposes, when it differs from `modelId`. */
  gatewayModelId?: string;
  upstreamProviderId?: string;
  endpointId?: string;
};

/** Bumped when the shape changes, so cached profiles can be invalidated. */
export const CAPABILITY_SCHEMA_VERSION = 2;

export type ModelReasoningCapabilities = {
  target: ModelTarget;
  /** Does a reasoning mechanism exist at all. Not a user switch. */
  reasoningCapability: SupportStatus;
  effort: EffortCapability;
  thinkingMode: ThinkingModeCapability;
  thinkingBudget: ThinkingBudgetCapability;
  display: ReasoningDisplayCapability;
  executionMode: ExecutionModeCapability;
  /** Provider fields that did not fit the normalised shape. */
  rawMetadata?: unknown;
  schemaVersion: number;
  fetchedAt?: number;
  sources: CapabilitySource[];
};

/** The five states the reasoning UI has to render without lying. */
export const UNKNOWN_STATUS: SupportStatus = "unknown";

/** A capability profile that says nothing, for a target we cannot describe. */
export const unknownCapabilities = (
  target: ModelTarget,
): ModelReasoningCapabilities => ({
  target,
  reasoningCapability: UNKNOWN_STATUS,
  effort: { status: UNKNOWN_STATUS, defaultKnown: false },
  thinkingMode: { status: UNKNOWN_STATUS, defaultKnown: false },
  thinkingBudget: { status: UNKNOWN_STATUS },
  display: { summary: UNKNOWN_STATUS, thinkingContent: UNKNOWN_STATUS },
  executionMode: { status: UNKNOWN_STATUS, defaultKnown: false },
  schemaVersion: CAPABILITY_SCHEMA_VERSION,
  sources: [],
});

/** Reads a tri-state out of provider metadata that may simply omit the field. */
export const readSupport = (
  value: unknown,
  key = "supported",
): SupportStatus => {
  if (value === undefined || value === null) return UNKNOWN_STATUS;
  if (typeof value === "boolean") return value ? "supported" : "unsupported";
  if (typeof value === "object") {
    const flag = (value as Record<string, unknown>)[key];
    if (typeof flag === "boolean") return flag ? "supported" : "unsupported";
  }
  return UNKNOWN_STATUS;
};

/**
 * Effort values a model will actually accept, in ascending intensity.
 *
 * Returns nothing when the levels are not enumerated. That is the important
 * case: a target known to accept an effort parameter but not known to accept
 * any *particular* level must not be handed an invented range.
 */
export const availableEffort = (
  capability: EffortCapability,
): readonly EffortValue[] => {
  if (capability.status !== "supported") return [];
  return sortByIntensity(capability.values ?? []);
};

/** Ascending, then by provider order. `intensity` is only a display hint. */
export const sortByIntensity = (
  values: readonly EffortValue[],
): EffortValue[] => {
  const rank: Record<NonNullable<EffortValue["intensity"]>, number> = {
    minimal: 0,
    low: 1,
    medium: 2,
    high: 3,
    maximum: 4,
    unknown: 5,
  };
  return [...values].sort((a, b) => {
    const byRank = rank[a.intensity ?? "unknown"] - rank[b.intensity ?? "unknown"];
    if (byRank !== 0) return byRank;
    return a.order - b.order;
  });
};

/** The levels the picker may show, given what the user has chosen. */
export const effortValuesFor = (
  capability: EffortCapability,
  preference: Preference<string>,
): readonly EffortValue[] => {
  const values = availableEffort(capability);
  if (preference.mode !== "explicit") return values;
  return values.filter((value) => value.value === preference.value);
};

/** Thinking-mode options the picker may show. */
export const thinkingModeOptions = (
  capability: ThinkingModeCapability,
): readonly ThinkingModeOption[] => {
  if (capability.status !== "supported") return [];
  if (capability.options === undefined) return [];
  return capability.options;
};

/**
 * Whether an interactive control is honest to render.
 *
 * A model whose thinking cannot be turned off gets information, not a switch —
 * rendering the switch anyway produces a control that looks live and does
 * nothing, which is the failure this whole schema exists to prevent.
 */
export const canToggleThinking = (
  capability: ThinkingModeCapability,
): boolean =>
  capability.status === "supported" &&
  capability.alwaysOn !== true &&
  thinkingModeOptions(capability).length > 0;