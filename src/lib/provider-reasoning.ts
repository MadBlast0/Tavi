/**
 * How a provider takes a reasoning preference, and how it refuses one.
 *
 * The same rule has to answer on both sides of the app: the website's server
 * refuses an effort a model does not publish, and the desktop app refuses it
 * too. So the rule is here, once, and both use it.
 *
 * **The rule and the field are two different things.** The rule is which
 * levels a model accepts and what to say when it does not; that is the same
 * everywhere. The field the level goes in is not: OpenRouter takes
 * `reasoning: { effort }`, OpenAI and the OpenAI-compatible providers take a
 * top-level `reasoning_effort`, and Anthropic takes `output_config: {
 * effort }`. That is a fact about the provider, and it is written down in the
 * provider table, which both sides read.
 */

import {
  availableEffort,
  type ModelReasoningCapabilities,
} from "./reasoning.ts"
import {
  providerFor,
  type ProviderReasoningField,
} from "./providers.ts"

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

/**
 * The answer about a preference.
 *
 * `ok` carries the level to send, which is the provider's own word for it and
 * is never translated. `refused` carries the reason, which is what the person
 * is shown.
 */
export type ReasoningVerdict =
  | { ok: true; level: string }
  | { ok: false; message: string }

/**
 * Checks a preference against a model.
 *
 * A provider default is always fine: it means "send nothing", and a field
 * that is not sent is a field the provider cannot refuse.
 *
 * An explicit level is only fine when the model publishes the levels it
 * accepts. A model that publishes none has not said that it refuses them, and
 * that is not the same thing — so the level is refused, with the difference
 * spelled out.
 */
export const checkReasoning = (
  capabilities: ModelReasoningCapabilities,
  preferences: ReasoningPreferences,
): ReasoningVerdict => {
  if (preferences.effort.mode === "provider_default") {
    return { ok: true, level: "" }
  }

  const value = preferences.effort.value
  const accepted = availableEffort(capabilities.effort).map(
    (entry) => entry.value,
  )

  if (accepted.length === 0) {
    /* "Supported but the levels are not published" and "not published at
       all" are two different facts, and a person who is told the first and
       meant the second will think the app knows more than it does. */
    if (capabilities.effort.status === "supported") {
      return {
        ok: false,
        message:
          "This model's effort levels are not published, so that setting cannot be verified. Use the provider default instead.",
      }
    }
    if (capabilities.effort.status === "unknown") {
      return {
        ok: false,
        message:
          "This model's reasoning-effort support is not published, so that setting cannot be verified. Use the provider default instead.",
      }
    }
    return {
      ok: false,
      message: "This model does not support a reasoning-effort setting.",
    }
  }

  if (!accepted.includes(value)) {
    return {
      ok: false,
      message: `This model does not accept effort "${value}". It accepts: ${accepted.join(", ")}.`,
    }
  }

  return { ok: true, level: value }
}

/**
 * The AI SDK's own name for a provider's reasoning level.
 *
 * The SDK files a provider's options under the provider's name and gives each
 * control its own name, which is not the name the control has on the wire.
 * This is the one place that difference is written down.
 */
export const sdkOptionsFor = (
  providerId: string,
  level: string,
): Record<string, unknown> | undefined => {
  if (!level) return undefined
  switch (reasoningFieldFor(providerId)) {
    case "reasoning.effort":
      return { reasoning: { effort: level } }
    case "reasoning_effort":
      return { reasoningEffort: level }
    case "output_config.effort":
      return { effort: level }
    default:
      return undefined
  }
}

/**
 * How a provider takes a reasoning level, on the wire.
 *
 * A provider that publishes no reasoning levels takes none, and says so.
 */
export const reasoningFieldFor = (
  providerId: string,
): ProviderReasoningField =>
  providerFor(providerId)?.reasoningField ?? "none"
