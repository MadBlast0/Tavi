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

/**
 * How a provider's key can be checked.
 *
 * The two kinds are not the same cost, and the difference is the whole reason
 * this field exists.
 *
 * - `identity-endpoint` is a free request that answers "no" for a bad key and
 *   "yes" for a good one. Three of the four providers have one.
 * - `inference-probe` has no such endpoint, and the only way to find out is to
 *   make a real inference. The check costs the user's quota, so it is only
 *   ever run when the user asks for it.
 */
export type ProviderValidation = "identity-endpoint" | "inference-probe";

export type Provider = {
  id: string;
  /** The name the app shows. */
  label: string;
  /** Where the provider's keys are made. */
  keysUrl: string;
  /** Where the provider's own request log and usage live. */
  logsUrl?: string;
  /** Where the provider's spending limits are set. */
  limitsUrl?: string;
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
   *
   * A provider whose validation is `inference-probe` has no such endpoint: its
   * listing is public, and a public listing cannot tell a good key from a bad
   * one. The field is kept so the shape is the same for every provider.
   */
  identityUrl: string;
  /**
   * The endpoint a real request goes to.
   *
   * It is here because one provider's check costs a request, and the request
   * has to go somewhere. It is not read for the providers whose check is
   * free.
   */
  inferenceUrl: string;
  /**
   * Whether the provider's answer carries an account name and a limit.
   *
   * Only OpenRouter says which account a key belongs to and how much of its
   * allowance is gone. The others say nothing of the kind, so the app does not
   * show an account or an allowance for them.
   */
  reportsUsage: boolean;
  /** How the key can be checked, and what it costs to check it. */
  validation: ProviderValidation;
  /**
   * Whether a check can be run without the provider's answer being about the
   * key itself.
   *
   * OpenRouter's key page is about the key. The other catalogues are about
   * the models, and a key without permission to read them cannot.
   */
  identityReportsAccount: boolean;
};

export const PROVIDERS: readonly Provider[] = [
  {
    id: "openrouter",
    label: "OpenRouter",
    keysUrl: "https://openrouter.ai/keys",
    logsUrl: "https://openrouter.ai/activity",
    envVar: "OPENROUTER_API_KEY",
    auth: "bearer",
    identityUrl: "https://openrouter.ai/api/v1/key",
    inferenceUrl: "https://openrouter.ai/api/v1/chat/completions",
    reportsUsage: true,
    validation: "identity-endpoint",
    identityReportsAccount: true,
  },
  {
    id: "anthropic",
    label: "Anthropic",
    keysUrl: "https://console.anthropic.com/settings/keys",
    logsUrl: "https://platform.claude.com/logs",
    limitsUrl: "https://platform.claude.com/settings/billing",
    envVar: "ANTHROPIC_API_KEY",
    auth: "x-api-key",
    identityUrl: "https://api.anthropic.com/v1/models",
    inferenceUrl: "https://api.anthropic.com/v1/messages",
    reportsUsage: false,
    validation: "identity-endpoint",
    identityReportsAccount: false,
  },
  {
    id: "openai",
    label: "OpenAI",
    keysUrl: "https://platform.openai.com/api-keys",
    logsUrl: "https://platform.openai.com/usage",
    limitsUrl: "https://platform.openai.com/settings/organization/billing/limits",
    envVar: "OPENAI_API_KEY",
    auth: "bearer",
    identityUrl: "https://api.openai.com/v1/models",
    inferenceUrl: "https://api.openai.com/v1/chat/completions",
    reportsUsage: false,
    validation: "identity-endpoint",
    identityReportsAccount: false,
  },
  {
    id: "nvidia-nim",
    label: "NVIDIA NIM",
    keysUrl: "https://build.nvidia.com/",
    envVar: "NVIDIA_API_KEY",
    auth: "bearer",
    /**
     * Public. `GET /v1/models` answers 200 with the whole catalogue to any
     * caller, with a bad key and with no key at all, so it cannot tell a good
     * key from a bad one. It is kept here because the provider table is one
     * shape, and a field that is only sometimes true is better than a field
     * that is sometimes missing.
     */
    identityUrl: "https://integrate.api.nvidia.com/v1/models",
    inferenceUrl: "https://integrate.api.nvidia.com/v1/chat/completions",
    reportsUsage: false,
    validation: "inference-probe",
    identityReportsAccount: false,
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
