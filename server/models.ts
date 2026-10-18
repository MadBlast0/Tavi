/**
 * OpenRouter model discovery.
 *
 * The upstream catalog is several megabytes and carries descriptions,
 * benchmarks and provider links the interface never renders, so it is
 * projected down to a slim shape before crossing to the browser.
 */

const CATALOG_URL = "https://openrouter.ai/api/v1/models";
const CACHE_TTL_MS = 15 * 60 * 1000;

export type SlimModel = {
  id: string;
  name: string;
  provider: string;
  contextLength: number | null;
  free: boolean;
  supportsTools: boolean;
  supportsReasoning: boolean;
  supportsEffort: boolean;
  reasoningMandatory: boolean;
  inputModalities: string[];
  outputModalities: string[];
  promptPrice: number;
  completionPrice: number;
};

type UpstreamModel = {
  id: string;
  name: string;
  context_length?: number;
  architecture?: {
    input_modalities?: string[];
    output_modalities?: string[];
  };
  pricing?: { prompt?: string; completion?: string };
  supported_parameters?: string[];
  reasoning?: { mandatory?: boolean };
};

let cache: { models: SlimModel[]; fetchedAt: number } | null = null;
let inFlight: Promise<SlimModel[]> | null = null;

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

const project = (upstream: UpstreamModel): SlimModel => {
  const parameters = upstream.supported_parameters ?? [];
  const promptPrice = toNumber(upstream.pricing?.prompt);
  const completionPrice = toNumber(upstream.pricing?.completion);

  return {
    id: upstream.id,
    name: upstream.name,
    provider: deriveProvider(upstream.name, upstream.id),
    contextLength: upstream.context_length ?? null,
    free: promptPrice === 0 && completionPrice === 0,
    supportsTools: parameters.includes("tools"),
    supportsReasoning: parameters.includes("reasoning"),
    supportsEffort: parameters.includes("reasoning_effort"),
    reasoningMandatory: upstream.reasoning?.mandatory ?? false,
    inputModalities: upstream.architecture?.input_modalities ?? ["text"],
    outputModalities: upstream.architecture?.output_modalities ?? ["text"],
    promptPrice,
    completionPrice,
  };
};

const fetchCatalog = async (): Promise<SlimModel[]> => {
  const response = await fetch(CATALOG_URL, {
    headers: { accept: "application/json" },
  });
  if (!response.ok) {
    throw new Error(`Model catalog request failed: HTTP ${response.status}`);
  }
  const payload = (await response.json()) as { data?: UpstreamModel[] };
  return (payload.data ?? []).map(project);
};

/**
 * Cached catalog. Stale data is served on upstream failure rather than failing
 * the request, so a provider hiccup does not empty the picker.
 */
export const getCatalog = async (): Promise<{
  models: SlimModel[];
  stale: boolean;
}> => {
  const now = Date.now();

  if (cache && now - cache.fetchedAt < CACHE_TTL_MS) {
    return { models: cache.models, stale: false };
  }

  inFlight ??= fetchCatalog()
    .then((models) => {
      cache = { models, fetchedAt: Date.now() };
      inFlight = null;
      return models;
    })
    .catch((error) => {
      inFlight = null;
      throw error;
    });

  try {
    return { models: await inFlight, stale: false };
  } catch (error) {
    if (cache) return { models: cache.models, stale: true };
    throw error;
  }
};

/** Capability lookup used to gate reasoning effort before forwarding it. */
export const modelSupportsEffort = async (id: string): Promise<boolean> => {
  try {
    const { models } = await getCatalog();
    return models.find((m) => m.id === id)?.supportsEffort ?? false;
  } catch {
    return false;
  }
};