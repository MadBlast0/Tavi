/**
 * Key status, used to validate the provider key and to show remaining quota.
 *
 * The key is read from the environment and never logged, echoed, or included in
 * an error response.
 */

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