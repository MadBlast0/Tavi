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
  type ProviderConnection,
  type ProviderModel,
} from "./providers.ts";
import {
  projectModel,
  projectPlainModel,
  type SlimModel,
} from "../src/lib/catalogue.ts";
import {
  DEFAULT_PROVIDER_ID,
  providerFor,
} from "../src/lib/providers.ts";
import type { ModelReasoningCapabilities } from "../src/lib/reasoning.ts";

const CACHE_TTL_MS = 15 * 60 * 1000;

export type { SlimModel };

/**
 * A catalogue that has been fetched.
 *
 * `degraded` is the one state worth showing: the provider could not be
 * reached and this is the last good copy. The age is there so the picker can
 * say how old the list is, because a list of models and prices that is three
 * weeks old names models that no longer exist.
 */
type CacheEntry = {
  models: SlimModel[];
  fetchedAt: number;
  degraded: boolean;
};

const cache = new Map<string, CacheEntry>();
const inFlight = new Map<string, Promise<void>>();

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
  providerId: string,
  provider: ProviderModel,
  capabilities: ModelReasoningCapabilities,
): SlimModel => {
  const model = {
    id: provider.id,
    displayName: provider.displayName,
    raw: provider.raw,
  };
  /* OpenRouter publishes prices, a context window and the modalities; the
     other providers publish a list and little else, and the projection says
     so rather than filling the gaps in. */
  return providerId === "openrouter"
    ? projectModel(model, capabilities)
    : projectPlainModel(model, capabilities, providerId);
};

const fetchFor = async (connection: ProviderConnection): Promise<SlimModel[]> => {
  const adapter = adapterFor(connection.providerId);
  if (!adapter) {
    throw new Error(`No adapter registered for provider "${connection.providerId}"`);
  }
  const listed = await adapter.listModels(connection);
  return Promise.all(
    listed.map(async (model) =>
      project(
        connection.providerId,
        model,
        await adapter.getModelCapabilities(connection, model),
      ),
    ),
  );
};

/**
 * Fetches the catalogue and puts it in the cache.
 *
 * A failure leaves whatever was there before, marked as degraded, so the
 * picker can say the list is the last good copy rather than pretending it is
 * current.
 */
const refresh = async (connection: ProviderConnection): Promise<void> => {
  try {
    const models = await fetchFor(connection);
    cache.set(connection.id, {
      models,
      fetchedAt: Date.now(),
      degraded: false,
    });
  } catch (error) {
    const entry = cache.get(connection.id);
    if (entry) {
      cache.set(connection.id, { ...entry, degraded: true });
    }
    throw error;
  }
};

/**
 * The catalogue for one connection.
 *
 * Stale-while-revalidate: a catalogue that has been fetched before is served
 * at once, and refreshed behind the caller's back. Blocking on the upstream
 * fetch every time the TTL expired is what made the picker slow to open,
 * and the copy that is already here is good enough to show while the new one
 * arrives.
 *
 * The first fetch has to be waited for — there is nothing to serve until it
 * has happened.
 */
export const getCatalog = async (
  connection: ProviderConnection = defaultConnection(),
): Promise<{ models: SlimModel[]; fetchedAt: number; degraded: boolean }> => {
  const hit = cache.get(connection.id);

  if (!hit) {
    await refresh(connection);
    const entry = cache.get(connection.id)!;
    return {
      models: entry.models,
      fetchedAt: entry.fetchedAt,
      degraded: entry.degraded,
    };
  }

  if (Date.now() - hit.fetchedAt >= CACHE_TTL_MS && !inFlight.has(connection.id)) {
    const pending = refresh(connection)
      .catch(() => {
        /* The copy that is already here is kept. The entry is marked
           degraded, and the picker says so. */
      })
      .finally(() => inFlight.delete(connection.id));
    inFlight.set(connection.id, pending);
  }

  return {
    models: hit.models,
    fetchedAt: hit.fetchedAt,
    degraded: hit.degraded,
  };
};

/**
 * The connection for a provider, configured from the shared table.
 *
 * One table, in `src/lib/providers.ts`, says what every provider is: where its
 * API lives, which shape its requests take, and which environment variable
 * the server reads its key from. The desktop app reads the same table, so the
 * two cannot drift about where a provider is.
 */
export const connectionFor = (providerId: string): ProviderConnection => {
  const provider = providerFor(providerId);
  if (!provider) {
    throw new Error(`"${providerId}" is not a provider this app knows about.`);
  }
  return {
    id: provider.id,
    providerId: provider.id,
    apiProtocol: provider.wire,
    baseUrl: provider.baseUrl,
    credentialRef: provider.envVar,
  };
};

/** The connection used when the client has not said which provider it means. */
export const defaultConnection = (): ProviderConnection =>
  connectionFor(DEFAULT_PROVIDER_ID);

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