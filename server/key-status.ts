/**
 * Key status, used to validate the provider keys and to show what is left of
 * them.
 *
 * The key is read from the environment and never logged, echoed, or included in
 * an error response. Every provider is asked the same way: a request that only
 * succeeds with a good key, and an answer that is read for what it says about
 * the key rather than for what it says about anything else.
 */

import { PROVIDERS, type Provider } from "../src/lib/providers.ts";
import { serverCredential, serverCredentialWithSource } from "./key-store.ts";

const KEY_URL = "https://openrouter.ai/api/v1/key";

export type KeyStatus = {
  valid: boolean;
  label?: string;
  limit?: number | null;
  remaining?: number | null;
  usage?: number | null;
  isFreeTier?: boolean;
};

/**
 * What the app knows about one provider's key.
 *
 * The same shape the desktop's Rust command answers in, so the pane reads one
 * thing either way.
 */
export type ProviderKeyStatus = {
  provider: string;
  label: string;
  stored: boolean;
  /**
   * Where the key came from, when one is stored.
   *
   * "store" is the server's own file, which the pane can change. "env" is the
   * environment the server was started with — the `.env.local` file in
   * development — which it cannot.
   */
  source?: "store" | "env";
  valid?: boolean;
  reason?: string;
  account?: string;
  limit?: number | null;
  usage?: number | null;
  remaining?: number | null;
  isFreeTier?: boolean;
};

/**
 * The provider normally returns an already-masked label, but a label is
 * free-form text from the network and should never be trusted to stay masked.
 * Anything key-shaped is redacted before it can reach the browser or a log.
 */
const redact = (value: string | undefined): string | undefined => {
  if (!value) return value;
  return value.replace(/sk-[A-Za-z0-9_-]{6,}/g, "sk-***");
};

export const fetchKeyStatus = async (
  apiKey: string,
): Promise<KeyStatus> => {
  try {
    const response = await fetch(KEY_URL, {
      headers: {
        authorization: `Bearer ${apiKey}`,
        accept: "application/json",
      },
    });

    if (response.status === 401 || response.status === 403) {
      return { valid: false };
    }
    if (!response.ok) {
      return { valid: false };
    }

    const data = (await response.json()) as {
      data?: {
        label?: string;
        limit?: number | null;
        usage?: number | null;
        remaining?: number | null;
        is_free_tier?: boolean;
      };
    };

    const d = data.data ?? {};
    return {
      valid: true,
      label: redact(d.label),
      limit: d.limit ?? null,
      usage: d.usage ?? null,
      remaining: d.remaining ?? null,
      isFreeTier: d.is_free_tier ?? false,
    };
  } catch {
    return { valid: false };
  }
};

/**
 * What a provider says about a key.
 *
 * OpenRouter has a page for a key, which also says whose it is and how much
 * of its allowance is gone. The others have no such page, so their answer is
 * only whether the key is good — their catalogue is asked instead, which a
 * key without permission cannot read.
 */
export const fetchProviderStatus = async (
  provider: Provider,
  apiKey: string,
  source: "store" | "env" = "store",
): Promise<ProviderKeyStatus> => {
  const base = {
    provider: provider.id,
    label: provider.label,
    stored: true,
    source,
  };

  try {
    const headers: Record<string, string> = { accept: "application/json" };
    if (provider.auth === "x-api-key") {
      headers["x-api-key"] = apiKey;
      headers["anthropic-version"] = "2023-06-01";
    } else {
      headers.authorization = `Bearer ${apiKey}`;
    }

    const response = await fetch(provider.identityUrl, { headers });

    if (response.status === 401 || response.status === 403) {
      return {
        ...base,
        valid: false,
        reason: "The provider did not accept this key.",
      };
    }
    if (!response.ok) {
      return {
        ...base,
        valid: false,
        reason: `The provider answered with ${response.status}.`,
      };
    }

    if (!provider.reportsUsage) {
      return { ...base, valid: true };
    }

    const data = (await response.json()) as {
      data?: {
        label?: string;
        limit?: number | null;
        usage?: number | null;
        remaining?: number | null;
        is_free_tier?: boolean;
      };
    };

    const d = data.data ?? {};
    return {
      ...base,
      valid: true,
      account: redact(d.label),
      limit: d.limit ?? null,
      usage: d.usage ?? null,
      remaining: d.remaining ?? null,
      isFreeTier: d.is_free_tier ?? false,
    };
  } catch {
    return {
      ...base,
      valid: false,
      reason: `Could not reach ${provider.label}.`,
    };
  }
};

/**
 * Every provider, and what is known about its key.
 *
 * The website's server holds its keys in its own environment, so this is a
 * reading of the environment rather than of a credential store: the keys are
 * there or they are not, and the server cannot be asked to change them from
 * the page.
 */
export const listProviderKeys = async (): Promise<ProviderKeyStatus[]> =>
  Promise.all(
    PROVIDERS.map(async (provider) => {
      const credential = serverCredentialWithSource(provider.envVar);
      if (!credential) {
        return {
          provider: provider.id,
          label: provider.label,
          stored: false,
        };
      }
      return fetchProviderStatus(provider, credential.key, credential.source);
    }),
  );
