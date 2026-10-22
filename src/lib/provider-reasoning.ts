/**
 * How a provider takes a reasoning preference, and how it refuses one.
 *
 * The same rule has to answer on both sides of the app: the website's server
 * refuses an effort a model does not publish, and the desktop app refuses it
 * too. So the rule is here, once, and both use it.
 *
 * The answer is the provider's **own** field, spelled the way the provider
 * spells it. OpenRouter takes `reasoning: { effort }`, OpenAI and NVIDIA NIM
 * take `reasoning_effort` at the top level, and Anthropic takes
 * `output_config: { effort }`. A value is never translated between them and
 * never renamed.
 *
 * A provider default is an **omitted** field. It is never a guessed `medium`,
 * because a silently-downgraded effort is indistinguishable from the model
 * simply running at a lower setting.
 */

import {
  availableEffort,
  type ModelReasoningCapabilities,
} from "./reasoning.ts"

/** What a person chose, before it is checked against the model. */
export type ReasoningPreferences = {
  effort: { mode: "provider_default" } | { mode: "explicit"; value: string }
  thinkingMode: { mode: "provider_default" } | { mode: "explicit"; value: string }
}

/**
 * The provider-shaped options, or a refusal. Never both, never neither.
 *
 * `omit` is the success case for a provider default: the field is simply not
 * sent. `reject` must never be resolved by picking a different value.
 */
export type SerializedReasoning =
  | { kind: "omit" }
  | { kind: "payload"; fields: Record<string, unknown> }
  | { kind: "reject"; message: string }

/** The refusal for a model whose effort levels are not established. */
const notEstablished = (capabilities: ModelReasoningCapabilities): string =>
  capabilities.effort.status === "unsupported"
    ? "This model does not support a reasoning-effort setting."
    : "This model's reasoning-effort levels are not established for it, so that setting cannot be verified. Use the provider default instead."

/** The refusal for a model whose levels are published but do not include it. */
const notAccepted = (accepted: readonly string[], value: string): string =>
  `This model does not accept effort "${value}". It accepts: ${accepted.join(", ")}.`;

/* -------------------------------------------------------------------------- */
/* OpenRouter                                                                 */
/* -------------------------------------------------------------------------- */

const openRouterReasoning = (
  capabilities: ModelReasoningCapabilities,
  preferences: ReasoningPreferences,
): SerializedReasoning => {
  // Provider default means omit the field. Not `medium`.
  if (preferences.effort.mode === "provider_default") {
    return { kind: "omit" }
  }

  const value = preferences.effort.value
  const accepted = availableEffort(capabilities.effort).map((entry) => entry.value)

  if (accepted.length === 0) {
    /* Distinguish "supported but we do not know which values" from "not
       supported". Collapsing these told a user their setting was rejected by
       a model that in fact accepts the parameter. */
    if (capabilities.effort.status === "supported") {
      return {
        kind: "reject",
        message:
          "This model's effort levels are not published, so that setting cannot be verified. Use the provider default instead.",
      }
    }
    if (capabilities.effort.status === "unknown") {
      return {
        kind: "reject",
        message:
          "This model's reasoning-effort support is not published, so that setting cannot be verified. Use the provider default instead.",
      }
    }
    return {
      kind: "reject",
      message: "This model does not support a reasoning-effort setting.",
    }
  }

  if (!accepted.includes(value)) {
    return { kind: "reject", message: notAccepted(accepted, value) }
  }

  return { kind: "payload", fields: { reasoning: { effort: value } } }
}

/* -------------------------------------------------------------------------- */
/* OpenAI and NVIDIA NIM                                                      */
/* -------------------------------------------------------------------------- */

const openAiReasoning = (
  capabilities: ModelReasoningCapabilities,
  preferences: ReasoningPreferences,
): SerializedReasoning => {
  // Provider default: omit the field entirely. Not `medium`.
  if (preferences.effort.mode === "provider_default") return { kind: "omit" }

  const value = preferences.effort.value
  const levels = availableEffort(capabilities.effort)

  if (levels.length === 0) {
    return { kind: "reject", message: notEstablished(capabilities) }
  }
  if (!levels.some((level) => level.value === value)) {
    return { kind: "reject", message: notAccepted(levels.map((l) => l.value), value) }
  }

  // Exact wire value, unmodified. Never translated or renamed.
  //
  // The Chat Completions surface takes `reasoning_effort` at the top level.
  // The nested `reasoning: { effort }` shape belongs to the Responses
  // surface, and sending it here is a request the provider refuses.
  return { kind: "payload", fields: { reasoning_effort: value } }
}

/* -------------------------------------------------------------------------- */
/* NVIDIA NIM, which publishes no capability metadata at all                  */
/* -------------------------------------------------------------------------- */

const nimReasoning = (
  _capabilities: ModelReasoningCapabilities,
  preferences: ReasoningPreferences,
): SerializedReasoning => {
  /* Support is unknown, so no explicit effort can be verified. Refusing rather
     than forwarding it is what keeps a GPT-OSS control from failing silently
     on a deployment without the reasoning parser. */
  if (preferences.effort.mode === "provider_default") return { kind: "omit" }
  return {
    kind: "reject",
    message:
      "NVIDIA NIM publishes no reasoning-capability metadata, so an explicit effort cannot be verified. Use the provider default instead.",
  }
}

/* -------------------------------------------------------------------------- */
/* Anthropic                                                                  */
/* -------------------------------------------------------------------------- */

const anthropicReasoning = (
  capabilities: ModelReasoningCapabilities,
  preferences: ReasoningPreferences,
): SerializedReasoning => {
  const fields: Record<string, unknown> = {}
  const thinking: Record<string, unknown> = {}

  /* Thinking mode is validated and emitted independently of effort. Choosing
     a thinking mode never sets an effort, and choosing an effort never sets a
     thinking type. */
  if (preferences.thinkingMode.mode === "explicit") {
    const requested = preferences.thinkingMode.value
    const options = capabilities.thinkingMode.options ?? []
    if (capabilities.thinkingMode.status !== "supported") {
      return {
        kind: "reject",
        message:
          "This model's thinking modes are not published, so that setting cannot be verified. Use the provider default instead.",
      }
    }
    const match = options.find((o) => o.value === requested)
    if (!match) {
      return {
        kind: "reject",
        message: `This model does not accept thinking mode "${requested}". It accepts: ${options
          .map((o) => o.value)
          .join(", ")}.`,
      }
    }
    thinking.type = match.value
    // `enabled` is manual thinking, which is meaningless without a budget, so
    // it is never sent on its own.
    if (match.behavior === "manual_enabled") {
      return {
        kind: "reject",
        message:
          'Extended thinking needs a token budget, which this app does not set yet. Choose "Adaptive" or use the provider default.',
      }
    }
  }

  if (preferences.effort.mode === "explicit") {
    const requested = preferences.effort.value
    const levels = availableEffort(capabilities.effort)
    if (levels.length === 0) {
      return { kind: "reject", message: notEstablished(capabilities) }
    }
    if (!levels.some((level) => level.value === requested)) {
      return {
        kind: "reject",
        message: notAccepted(levels.map((l) => l.value), requested),
      }
    }
    fields.output_config = { effort: requested }
  }

  if (Object.keys(thinking).length) fields.thinking = thinking

  // Provider default on both facets means send neither field.
  return Object.keys(fields).length ? { kind: "payload", fields } : { kind: "omit" }
}

/* -------------------------------------------------------------------------- */
/* The dispatcher                                                              */
/* -------------------------------------------------------------------------- */

/**
 * Checks a preference against a model and writes it the provider's way.
 *
 * One implementation per provider, shared by the website's server and the
 * desktop app, so the two cannot refuse different things for the same model.
 */
export const serializeReasoning = (
  providerId: string,
  capabilities: ModelReasoningCapabilities,
  preferences: ReasoningPreferences,
): SerializedReasoning => {
  switch (providerId) {
    case "openrouter":
      return openRouterReasoning(capabilities, preferences)
    case "openai":
      return openAiReasoning(capabilities, preferences)
    case "nvidia-nim":
      return nimReasoning(capabilities, preferences)
    case "anthropic":
      return anthropicReasoning(capabilities, preferences)
    default:
      /* A provider the app does not know cannot be asked to take a preference
         it has not published. */
      return {
        kind: "reject",
        message:
          "This provider publishes no reasoning controls, so that setting cannot be verified. Use the provider default instead.",
      }
  }
}
