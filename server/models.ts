/**
 * Model discovery across configured provider connections.
 *
 * Discovery and capability resolution both go through `server/providers.ts`, so
 * adding a provider never requires editing this file. The catalogue is cached
 * per connection because the same model id can mean different things through
 * different gateways, protocols or routes.
 */

import {
  adapterFor,
  openRouterAdapter,
  type ProviderConnection,
  type ProviderModel,
} from "./providers.ts";
import { projectModel, type SlimModel } from "../src/lib/catalogue.ts";
import type { ModelReasoningCapabilities } from "../src/lib/reasoning.ts";

const CACHE_TTL_MS = 15 * 60 * 1000;

export type { SlimModel };

type CacheEntry = { models: SlimModel[]; fetchedAt: number };

const cache = new Map<string, CacheEntry>();
const inFlight = new Map<string, Promise<SlimModel[]>>();

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

const project = (
  provider: ProviderModel,
  capabilities: ModelReasoningCapabilities,
): SlimModel =>
  projectModel(
    { id: provider.id, displayName: provider.displayName, raw: provider.raw },
    capabilities,
  );

const fetchFor = async (connection: ProviderConnection): Promise<SlimModel[]> => {
  const adapter = adapterFor(connection.providerId);
  if (!adapter) {
    throw new Error(`No adapter registered for provider "${connection.providerId}"`);
  }
  const listed = await adapter.listModels(connection);
  return Promise.all(
    listed.map(async (model) =>
      project(model, await adapter.getModelCapabilities(connection, model)),
    ),
  );
};

/**
 * Cached catalogue for one connection.
 *
 * Stale data is served on upstream failure rather than failing the request, so a
 * provider hiccup does not empty the picker.
 */
export const getCatalog = async (
  connection: ProviderConnection = defaultConnection(),
): Promise<{ models: SlimModel[]; stale: boolean }> => {
  const now = Date.now();
  const hit = cache.get(connection.id);
  if (hit && now - hit.fetchedAt < CACHE_TTL_MS) {
    return { models: hit.models, stale: false };
  }

  if (!inFlight.has(connection.id)) {
    inFlight.set(
      connection.id,
      fetchFor(connection)
        .then((models) => {
          cache.set(connection.id, { models, fetchedAt: Date.now() });
          return models;
        })
        .finally(() => inFlight.delete(connection.id)),
    );
  }

  try {
    return { models: await inFlight.get(connection.id)!, stale: false };
  } catch (error) {
    if (hit) return { models: hit.models, stale: true };
    throw error;
  }
};

/** The OpenRouter connection, configured from the environment. */
export const defaultConnection = (): ProviderConnection => ({
  id: "openrouter",
  providerId: openRouterAdapter.id,
  apiProtocol: "openai-chat-completions",
  baseUrl: "https://openrouter.ai/api/v1",
  credentialRef: "OPENROUTER_API_KEY",
});

/**
 * Capabilities for one model on one connection.
 *
 * A miss yields an `unknown` profile rather than a fabricated one, so a failed
 * or missing lookup can never be mistaken for "this model supports nothing".
 */
export const modelCapabilities = async (
  connection: ProviderConnection,
  modelId: string,
): Promise<ModelReasoningCapabilities | undefined> => {
  const { models } = await getCatalog(connection);
  return models.find((model) => model.id === modelId)?.capabilities;
};