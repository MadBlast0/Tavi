/**
 * The provider client, for whichever provider the request names.
 *
 * The server used to hold one provider and one client. It now holds four
 * providers and two request shapes, and this file is where a provider becomes
 * a client — so that the rest of the server asks a model without knowing which
 * provider it is talking to.
 *
 * Two things are chosen here and nowhere else:
 *
 * - **the client**, because OpenRouter, OpenAI and NVIDIA NIM all speak the
 *   OpenAI chat-completions shape, and Anthropic does not;
 * - **the namespace**, which is the name the AI SDK files a provider's own
 *   options under. `providerOptions` is keyed by it, and a request whose
 *   options are filed under the wrong name is a request the provider ignores.
 */

import { createAnthropic } from "@ai-sdk/anthropic";
import { createCohere } from "@ai-sdk/cohere";
import { createGoogle } from "@ai-sdk/google";
import { createOpenAI } from "@ai-sdk/openai";
import { createOpenAICompatible } from "@ai-sdk/openai-compatible";
import { createOpenRouter } from "@openrouter/ai-sdk-provider";
import type { LanguageModel } from "ai";

import {
  OPENAI_COMPATIBLE_PROVIDERS,
  providerFor,
} from "../src/lib/providers.ts";
import type { OpenRouterProviderOptions } from "./providers.ts";

/**
 * A provider's own options, filed under the provider's name.
 *
 * The AI SDK files a provider's options under that provider's own name, so the
 * namespace is not decoration: options filed under the wrong name are options
 * the provider never sees.
 */
export type ProviderOptions =
  | { openrouter: OpenRouterProviderOptions["openrouter"] }
  | { openai: Record<string, never> }
  | { "openai-compatible": Record<string, never> }
  | { anthropic: Record<string, never> }
  | { google: Record<string, never> }
  | { cohere: Record<string, never> };

/**
 * What a provider needs to be asked.
 *
 * The namespace is the provider's own name, which is what the AI SDK files
 * its options under. The model is asked for by name.
 */
export type ProviderClient = {
  /** The provider's own name — the namespace its options live under. */
  namespace: string;
  /** The model to ask. */
  model: (modelId: string) => LanguageModel;
  /**
   * The provider's own options, filed under its name.
   *
   * The fields come from the provider's adapter, which has already checked
   * them against what the provider publishes. Casting them to the provider's
   * own option type happens here, where the provider is known, rather than in
   * the caller, which only knows a name.
   */
  options: (fields: Record<string, unknown>) => ProviderOptions;
};

/**
 * The client for a provider.
 *
 * The key is passed in rather than read here, so that the caller decides
 * which key it is and this file never goes looking for one.
 */
export const clientFor = (
  providerId: string,
  apiKey: string,
): ProviderClient => {
  const provider = providerFor(providerId);
  if (!provider) {
    throw new Error(`"${providerId}" is not a provider this app knows about.`);
  }

  switch (provider.wire) {
    case "anthropic-messages": {
      const anthropic = createAnthropic({
        apiKey,
        baseURL: provider.baseUrl,
      });
      return {
        namespace: "anthropic",
        model: (modelId) => anthropic(modelId),
        options: (fields) => ({ anthropic: fields as Record<string, never> }),
      };
    }
    case "google-generative-ai": {
      const google = createGoogle({ apiKey, baseURL: provider.baseUrl });
      return {
        namespace: "google",
        model: (modelId) => google(modelId),
        options: (fields) => ({ google: fields as Record<string, never> }),
      };
    }
    case "cohere-chat": {
      const cohere = createCohere({ apiKey, baseURL: provider.baseUrl });
      return {
        namespace: "cohere",
        model: (modelId) => cohere(modelId),
        options: (fields) => ({ cohere: fields as Record<string, never> }),
      };
    }
    case "openai-chat-completions": {
      /* OpenRouter has its own client, which knows its own request shape. */
      if (providerId === "openrouter") {
        const openrouter = createOpenRouter({
          apiKey,
          baseURL: provider.baseUrl,
        });
        return {
          namespace: "openrouter",
          model: (modelId) => openrouter(modelId),
          options: (fields) => ({
            openrouter: fields as OpenRouterProviderOptions["openrouter"],
          }),
        };
      }

      /* The rest speak the OpenAI chat-completions shape, and they are not
         OpenAI: the OpenAI package's default is the Responses API, which only
         OpenAI has. So they go through the compatible package, which speaks
         chat completions and nothing else. */
      if (OPENAI_COMPATIBLE_PROVIDERS.includes(providerId)) {
        const compatible = createOpenAICompatible({
          apiKey,
          baseURL: provider.baseUrl,
          name: providerId,
        });
        return {
          namespace: "openai-compatible",
          model: (modelId) => compatible(modelId),
          options: (fields) => ({
            "openai-compatible": fields as Record<string, never>,
          }),
        };
      }

      /* OpenAI itself, on the API it has. */
      const openai = createOpenAI({ apiKey, baseURL: provider.baseUrl });
      return {
        namespace: "openai",
        model: (modelId) => openai(modelId),
        options: (fields) => ({ openai: fields as Record<string, never> }),
      };
    }
  }
};
