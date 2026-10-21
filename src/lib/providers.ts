/**
 * The providers Tavi can hold a key for.
 *
 * One list, shared by the desktop app and the website's server, so the two
 * agree on what a provider is called, where its key is made, and which
 * environment variable the server reads it from. A provider added here is
 * added on both sides at once.
 *
 * The list is deliberately short. It holds the providers the app can actually
 * do something with — a provider with no adapter behind it could be given a
 * key that nothing would ever read, which is a key the user paid for and the
 * app ignored.
 */

/** How a provider takes a key. */
export type ProviderAuth = "bearer" | "x-api-key";

export type Provider = {
  id: string;
  /** The name the app shows. */
  label: string;
  /** Where the provider's keys are made. */
  keysUrl: string;
  /** The website's server reads this provider's key from this variable. */
  envVar: string;
  /** How the key is sent. */
  auth: ProviderAuth;
  /**
   * The endpoint that answers "is this key good, and whose is it".
   *
   * For OpenRouter that is the key's own page, which also reports the limit
   * and what has been spent. The others have no such page, so their answer is
   * only yes or no, and the catalogue is asked instead.
   */
  identityUrl: string;
  /**
   * Whether the provider's answer carries an account name and a limit.
   *
   * Only OpenRouter says which account a key belongs to and how much of its
   * allowance is gone. The others say nothing of the kind, so the app does not
   * show an account or an allowance for them.
   */
  reportsUsage: boolean;
};

export const PROVIDERS: readonly Provider[] = [
  {
    id: "openrouter",
    label: "OpenRouter",
    keysUrl: "https://openrouter.ai/keys",
    envVar: "OPENROUTER_API_KEY",
    auth: "bearer",
    identityUrl: "https://openrouter.ai/api/v1/key",
    reportsUsage: true,
  },
  {
    id: "anthropic",
    label: "Anthropic",
    keysUrl: "https://console.anthropic.com/settings/keys",
    envVar: "ANTHROPIC_API_KEY",
    auth: "x-api-key",
    identityUrl: "https://api.anthropic.com/v1/models",
    reportsUsage: false,
  },
  {
    id: "openai",
    label: "OpenAI",
    keysUrl: "https://platform.openai.com/api-keys",
    envVar: "OPENAI_API_KEY",
    auth: "bearer",
    identityUrl: "https://api.openai.com/v1/models",
    reportsUsage: false,
  },
  {
    id: "nvidia-nim",
    label: "NVIDIA NIM",
    keysUrl: "https://build.nvidia.com/",
    envVar: "NVIDIA_API_KEY",
    auth: "bearer",
    identityUrl: "https://integrate.api.nvidia.com/v1/models",
    reportsUsage: false,
  },
];

/** The provider with this id, if there is one. */
export const providerFor = (id: string): Provider | undefined =>
  PROVIDERS.find((provider) => provider.id === id);

/**
 * The provider whose key the app's own requests use.
 *
 * Everything the app asks a model is asked through this one for now. A key for
 * any other provider is stored and can be checked, but nothing in the app
 * speaks to those providers yet, and the pane says so rather than letting a
 * key look as though it were in use.
 */
export const ACTIVE_PROVIDER_ID = "openrouter";
