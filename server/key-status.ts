/**
 * What a provider says about a key.
 *
 * One implementation, used by the settings pane and by the account row, and
 * the same one the desktop app has in Rust. A provider is asked the same way
 * everywhere: a request that only succeeds with a good key, and an answer
 * that is read for what it says about the key rather than for what it says
 * about anything else.
 *
 * The rules the answers are read by:
 *
 * - 401 and 403 mean the provider refused the key.
 * - 402 means the account has no credit left.
 * - 429 means the key is good and the account is being limited.
 * - 404 is never a key problem — it is about a model, a route or a
 *   workspace — so it is never "not accepted".
 * - anything else means the answer was not about the key.
 *
 * A key is never logged, echoed, or included in an error response.
 */

import {
  identityUrlFor,
  inferenceUrlFor,
  PROVIDERS,
  type Provider,
} from "../src/lib/providers.ts";
import { redact, maskSecret } from "../src/lib/redact.ts";
import type { KeyStanding, ProviderKey } from "../src/lib/secret.ts";
import {
  activeKeyIds,
  findKey,
  serverCredentialWithSource,
  storedKeys,
} from "./key-store.ts";

/**
 * What the app knows about one provider's key.
 *
 * The same shape the desktop's Rust command answers in, so the pane reads
 * one thing either way.
 */
export type ProviderKeyStatus = ProviderKey;

/** A standing in which nothing is known. */
const unknown = (): KeyStanding => ({
  valid: null,
  checkReason: "not-checked",
  checkedAt: null,
  account: null,
  organizationId: null,
  workspaceId: null,
  creatorUserId: null,
  expiresAt: null,
  limit: null,
  limitRemaining: null,
  limitReset: null,
  limitCurrency: null,
  usage: null,
  usageInWindow: null,
  isFreeTier: null,
});

/**
 * The standing a provider's answer gives.
 *
 * The status code is the whole of the decision, and the decision is never
 * "not accepted" unless the provider actually refused the key.
 */
const standingForStatus = (status: number, checkedAt: number): KeyStanding => {
  if (status === 401 || status === 403) {
    return { ...unknown(), valid: false, checkReason: "not-accepted", checkedAt };
  }
  if (status === 402) {
    return { ...unknown(), valid: false, checkReason: "no-credit", checkedAt };
  }
  if (status === 429) {
    return { ...unknown(), valid: true, checkReason: "rate-limited", checkedAt };
  }
  return { ...unknown(), checkReason: "not-checked", checkedAt };
};

const number = (value: unknown): number | null =>
  typeof value === "number" && Number.isFinite(value) ? value : null;

const text = (value: unknown): string | null =>
  typeof value === "string" && value.trim() !== "" ? value.trim() : null;

/** An instant the provider published, in unix seconds. */
const timestamp = (value: unknown): number | null => {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim() !== "") {
    const parsed = Date.parse(value);
    if (Number.isFinite(parsed)) return Math.floor(parsed / 1000);
  }
  return null;
};

/**
 * The first model a provider publishes.
 *
 * Taken from the provider's own catalogue rather than written down here,
 * because a model that has been retired is answered with a status that says
 * nothing about the key — and one already has been.
 */
const firstPublishedModel = async (
  provider: Provider,
  baseUrl?: string,
): Promise<string | undefined> => {
  try {
    const response = await fetch(identityUrlFor(provider, baseUrl), {
      headers: { accept: "application/json" },
    });
    if (!response.ok) return undefined;
    const body = (await response.json()) as {
      data?: Array<{ id?: string }>;
    };
    for (const model of body.data ?? []) {
      const id = model.id?.trim();
      if (id) return id;
    }
  } catch {
    /* The catalogue could not be read. The check says so rather than
       guessing at a model. */
  }
  return undefined;
};

/**
 * Checks a key by making one real request.
 *
 * The only endpoint that answers "is this key good" is the inference one, so
 * this costs a request — which is why it only runs when the user asks for
 * it, and why the request asks for a single token.
 */
const checkByInference = async (
  provider: Provider,
  key: string,
  checkedAt: number,
  baseUrl?: string,
): Promise<KeyStanding> => {
  const model = await firstPublishedModel(provider, baseUrl);
  if (!model) {
    return { ...unknown(), checkReason: "unreachable", checkedAt };
  }

  try {
    const response = await fetch(inferenceUrlFor(provider), {
      method: "POST",
      headers: {
        authorization: `Bearer ${key}`,
        "content-type": "application/json",
        accept: "application/json",
      },
      body: JSON.stringify({
        model,
        messages: [{ role: "user", content: "hi" }],
        max_tokens: 1,
      }),
    });

    if (response.status !== 200) {
      return standingForStatus(response.status, checkedAt);
    }
    return { ...unknown(), valid: true, checkReason: null, checkedAt };
  } catch {
    return { ...unknown(), checkReason: "unreachable", checkedAt };
  }
};

/**
 * What a provider says about a key.
 *
 * `spend` is the user's answer to "may this cost a request": the providers
 * whose check costs one are only ever asked when the user says so.
 */
export const fetchProviderStatus = async (
  provider: Provider,
  key: string,
  spend = false,
  baseUrl?: string,
): Promise<KeyStanding> => {
  const checkedAt = Math.floor(Date.now() / 1000);

  if (provider.validation === "inference-probe") {
    if (!spend) return { ...unknown(), checkReason: "not-checked", checkedAt };
    return checkByInference(provider, key, checkedAt, baseUrl);
  }

  const headers: Record<string, string> = { accept: "application/json" };
  if (provider.auth === "x-api-key") {
    headers["x-api-key"] = key;
    headers["anthropic-version"] = "2023-06-01";
  } else {
    headers.authorization = `Bearer ${key}`;
  }

  let response: Response;
  try {
    response = await fetch(identityUrlFor(provider), { headers });
  } catch {
    return { ...unknown(), checkReason: "unreachable", checkedAt };
  }

  if (response.status !== 200) {
    return standingForStatus(response.status, checkedAt);
  }

  /* The organisation and the workspace come back as headers, and are the
     cheap substitute for an admin API that would need an admin key. */
  const organizationId =
    response.headers.get("anthropic-organization-id") ??
    null;
  const workspaceId = response.headers.get("anthropic-workspace-id") ?? null;

  const standing: KeyStanding = {
    ...unknown(),
    valid: true,
    checkReason: null,
    checkedAt,
    organizationId,
    workspaceId,
  };

  if (!provider.reportsUsage) return standing;

  let body: {
    data?: {
      label?: string;
      limit?: number | null;
      limit_remaining?: number | null;
      limit_reset?: string | null;
      usage?: number | null;
      usage_daily?: number | null;
      usage_weekly?: number | null;
      usage_monthly?: number | null;
      is_free_tier?: boolean;
      expires_at?: string | number | null;
      creator_user_id?: string | number | null;
      organization_id?: string | null;
      workspace_id?: string | null;
    };
  };
  try {
    body = (await response.json()) as typeof body;
  } catch {
    return standing;
  }

  const data = body.data ?? {};
  const limit = number(data.limit);
  const limitRemaining = number(data.limit_remaining);
  const limitReset = text(data.limit_reset);

  /* The figure that belongs beside the cap is the usage **in the cap's
     window**, not the all-time usage. A cap that resets monthly compared
     with a lifetime total is a sentence about two different things. */
  let usageInWindow: number | null = null;
  if (limit !== null && limitRemaining !== null) {
    usageInWindow = limit - limitRemaining;
  } else if (limitReset === "daily") {
    usageInWindow = number(data.usage_daily);
  } else if (limitReset === "weekly") {
    usageInWindow = number(data.usage_weekly);
  } else if (limitReset === "monthly") {
    usageInWindow = number(data.usage_monthly);
  }

  const label = text(data.label);
  const creator = text(
    data.creator_user_id === null || data.creator_user_id === undefined
      ? null
      : String(data.creator_user_id),
  );

  return {
    ...standing,
    account: label ? redact(label) : null,
    organizationId:
      organizationId ?? (text(data.organization_id) ?? null),
    workspaceId: workspaceId ?? (text(data.workspace_id) ?? null),
    creatorUserId: creator,
    expiresAt: timestamp(data.expires_at),
    limit,
    limitRemaining,
    limitReset:
      limitReset === "daily" ||
      limitReset === "weekly" ||
      limitReset === "monthly"
        ? limitReset
        : null,
    /* OpenRouter's credits are US dollars. That is a fact about OpenRouter
       and not an assumption the formatter makes about whatever number it is
       handed, so it is written here and nowhere else — and it is written
       whether or not a cap is set, because the all-time spend is in the same
       unit as the cap. */
    limitCurrency: "USD",
    usage: number(data.usage),
    usageInWindow,
    isFreeTier:
      typeof data.is_free_tier === "boolean" ? data.is_free_tier : null,
  };
};

/**
 * Every key the server holds, and what is known about it.
 *
 * A provider with no key is not listed, and neither is a key the user cannot
 * see. The list is the keys, not the providers.
 */
export const listProviderKeys = async (): Promise<ProviderKeyStatus[]> => {
  const keys = storedKeys();
  const active = activeKeyIds();

  const listed = await Promise.all(
    keys.map(async (key) => {
      const provider = PROVIDERS.find(
        (candidate) => candidate.id === key.provider,
      );

      /* A provider whose check costs a request is not asked as the list is
         read. The list must never quietly spend the user's quota. */
      const standing =
        provider && provider.validation === "identity-endpoint"
          ? await fetchProviderStatus(provider, key.secret)
          : {
              ...unknown(),
              checkReason: "not-checked" as const,
              checkedAt: null,
            };

      return {
        id: key.id,
        provider: key.provider,
        providerLabel: provider?.label ?? key.provider,
        name: key.name,
        nameIsDefault: key.nameIsDefault,
        createdAt: key.createdAt,
        updatedAt: key.updatedAt,
        lastUsedAt: key.lastUsedAt,
        maskedValue: key.maskedValue,
        baseUrl: key.baseUrl ?? null,
        source: "server-file" as const,
        active: active[key.provider] === key.id,
        valid: standing.valid,
        checkReason: standing.checkReason,
        checkedAt: standing.checkedAt,
        account: standing.account,
        organizationId: standing.organizationId,
        workspaceId: standing.workspaceId,
        creatorUserId: standing.creatorUserId,
        expiresAt: standing.expiresAt,
        limit: standing.limit,
        limitRemaining: standing.limitRemaining,
        limitReset: standing.limitReset,
        limitCurrency: standing.limitCurrency,
        usage: standing.usage,
        usageInWindow: standing.usageInWindow,
        isFreeTier: standing.isFreeTier,
      };
    }),
  );

  /* A key in the environment is still a key the server is using, so it is
     listed — and said to be somewhere else, because it cannot be changed
     from the pane.

     It is listed whenever there is no **active** stored key for the provider.
     A stored key that is not the one in use does not displace it: the server
     is still sending requests with the environment's key, and the pane has to
     say so. */
  const env: ProviderKeyStatus[] = [];
  for (const provider of PROVIDERS) {
    const activeId = active[provider.id];
    if (activeId !== null && activeId !== undefined) continue;
    const credential = serverCredentialWithSource(provider.envVar);
    if (!credential || credential.source !== "env") continue;
    const now = Math.floor(Date.now() / 1000);
    env.push({
      id: `env:${provider.id}`,
      provider: provider.id,
      providerLabel: provider.label,
      name: provider.label,
      nameIsDefault: true,
      createdAt: now,
      updatedAt: now,
      lastUsedAt: null,
      /* The server holds the key, so it can mask it the same way the desktop
         does — and the two builds show the same key the same way. */
      maskedValue: maskSecret(credential.key),
      baseUrl: null,
      source: "env",
      /* An environment key is the one in use for its provider only while no
         stored key is active for it. Which provider the app is talking to is
         the client's choice, and it is named in the request. */
      active: true,
      valid: null,
      checkReason: "not-checked",
      checkedAt: null,
      account: null,
      organizationId: null,
      workspaceId: null,
      creatorUserId: null,
      expiresAt: null,
      limit: null,
      limitRemaining: null,
      limitReset: null,
      limitCurrency: null,
      usage: null,
      usageInWindow: null,
      isFreeTier: null,
    });
  }

  return [...listed, ...env];
};

/** The standing of a key the server already holds. */
export const standingForStoredKey = async (
  id: string,
  spend = false,
): Promise<KeyStanding | undefined> => {
  const key = findKey(id);
  if (!key) return undefined;
  const provider = PROVIDERS.find(
    (candidate) => candidate.id === key.provider,
  );
  if (!provider) return undefined;
  return fetchProviderStatus(provider, key.secret, spend);
};
