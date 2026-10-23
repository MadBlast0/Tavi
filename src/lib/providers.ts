/**
 * The providers Tavi can hold a key for.
 *
 * One list, shared by the desktop app and the website's server, so the two
 * agree on what a provider is called, where its key is made, and which
 * environment variable the server reads it from. A provider added here is
 * added on both sides at once.
 *
 * **The list is the one the app offers, and it is short on purpose.** A
 * provider with no client behind it could be given a key that nothing would
 * ever read, which is a key the user paid for and the app ignored — so a
 * provider is here because the app can do something with it.
 *
 * One of them is not a company at all: **Custom endpoint** is the
 * OpenAI chat-completions shape at an address the user gives — a gateway, a
 * proxy, or a model running on this machine. The key carries the address, and
 * the address wins over any default.
 *
 * ## What a provider is made of
 *
 * A provider is a **wire shape** and some **configuration**. Most of them
 * speak the OpenAI chat-completions shape and differ only in the address they
 * live at and how the key is sent; those are fields, not code. The shapes that
 * are not OpenAI's — Anthropic's Messages, Google's generate-content — are
 * clients, and there are three of them.
 *
 * ## Where a provider's address comes from
 *
 * The table holds the **default** address. A provider that lives somewhere
 * else for you — an Azure resource, a self-hosted vLLM, a Databricks
 * workspace, a gateway of your own — is given its own address with the key,
 * and the key's address wins. One provider, one key, one address.
 *
 * ## The facts here
 *
 * The addresses, the environment variables and the documentation links were
 * read from each provider's own documentation. They are facts about the
 * provider, and they are written down here so that both halves of the app
 * use the same ones.
 */

/** How a provider takes a key. */
export type ProviderAuth =
  | "bearer"
  | "x-api-key"
  | "api-key"
  | "x-goog-api-key"
  | "aws-bearer"
  | "google-oauth"
  | "none";

/**
 * How a provider's chat request is shaped on the wire.
 *
 * `openai-chat-completions` is spoken by most of them, including NVIDIA
 * NIM's, which is OpenAI-compatible rather than OpenAI. The others are
 * different requests, different headers and different streams, and they are
 * named here so that nothing has to infer one from a provider's name.
 */
export type ProviderWire =
  | "openai-chat-completions"
  | "anthropic-messages"
  | "google-generative-ai"
  | "cohere-chat";

/**
 * How a provider's key can be checked.
 *
 * The two kinds are not the same cost, and the difference is the whole reason
 * this field exists.
 *
 * - `identity-endpoint` is a free request that answers "no" for a bad key and
 *   "yes" for a good one. Most providers have one.
 * - `inference-probe` has no such endpoint, and the only way to find out is to
 *   make a real inference. The check costs the user's quota, so it is only
 *   ever run when the user asks for it.
 */
export type ProviderValidation = "identity-endpoint" | "inference-probe";

/**
 * How a provider takes a reasoning level.
 *
 * The name is the field on the wire, because that is what the request has to
 * carry, and a level that is sent in the wrong field is one the provider
 * ignores.
 */
export type ProviderReasoningField =
  | "reasoning.effort"
  | "reasoning_effort"
  | "output_config.effort"
  | "none";

export type Provider = {
  id: string;
  /** The name the app shows. */
  label: string;
  /** Where the provider's keys are made. */
  keysUrl: string;
  /** Where the provider's own request log and usage live. */
  logsUrl?: string;
  /** Where the provider's spending caps are set. */
  limitsUrl?: string;
  /** Where the provider documents its models. */
  docsUrl: string;
  /** The website's server reads this provider's key from this variable. */
  envVar: string;
  /** How the key is sent. */
  auth: ProviderAuth;
  /**
   * The address the provider's API lives at.
   *
   * The version is part of it, because the paths below it are not the same
   * for every provider. A key may carry its own address, which wins.
   */
  baseUrl: string;
  /** The shape of a chat request for this provider. */
  wire: ProviderWire;
  /**
   * How the provider takes a reasoning level, on the wire.
   *
   * The field is not the same everywhere: OpenRouter takes `reasoning: {
   * effort }`, OpenAI and the OpenAI-compatible providers take a top-level
   * `reasoning_effort`, and Anthropic takes `output_config: { effort }`.
   * A provider that publishes no reasoning levels takes none, and says so.
   */
  reasoningField: ProviderReasoningField;
  /**
   * The path of the model listing, when it is not `/models`.
   *
   * Most providers put their catalogue at the root of their version. A few do
   * not: Perplexity's models are under `/v1` and its chat is not.
   */
  modelsPath?: string;
  /**
   * The path of the chat request, when it is not the one the shape implies.
   *
   * `{model}` is the model's own name.
   */
  chatPath?: string;
  /**
   * A query parameter every request needs.
   *
   * Azure's OpenAI endpoint takes its API version as a query parameter, and
   * there is no default for it.
   */
  query?: Record<string, string>;
  /**
   * A header every request needs, beside the one the key goes in.
   *
   * Anthropic's API requires a version header, and a request without it is
   * refused.
   */
  extraHeaders?: Record<string, string>;
  /**
   * Whether the provider's answer carries an account name and a limit.
   *
   * Only OpenRouter says which account a key belongs to and how much of its
   * allowance is gone. The others say nothing of the kind, so the app does
   * not show an account or an allowance for them.
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
  /**
   * Whether the provider needs a key at all.
   *
   * A model running on this machine does not. The app says so rather than
   * asking for a key that does not exist.
   */
  keyless?: boolean;
};

export const PROVIDERS: readonly Provider[] = [
  {
    id: "custom",
    label: "Custom endpoint",
    /* An endpoint of the user's own: a gateway, a proxy, a model running on
       this machine. It has no address of its own and no page to make a key
       on, and the key says where it is. */
    keysUrl: "",
    docsUrl: "",
    envVar: "CUSTOM_API_KEY",
    auth: "bearer",
    baseUrl: "",
    wire: "openai-chat-completions",
    reasoningField: "reasoning_effort",
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
    docsUrl: "https://platform.openai.com/docs/models",
    envVar: "OPENAI_API_KEY",
    auth: "bearer",
    baseUrl: "https://api.openai.com/v1",
    wire: "openai-chat-completions",
    reasoningField: "reasoning_effort",
    reportsUsage: false,
    validation: "identity-endpoint",
    identityReportsAccount: false,
  },
  {
    id: "anthropic",
    label: "Anthropic",
    keysUrl: "https://console.anthropic.com/settings/keys",
    logsUrl: "https://platform.claude.com/logs",
    limitsUrl: "https://platform.claude.com/settings/billing",
    docsUrl: "https://docs.anthropic.com/en/docs/about-claude/models",
    envVar: "ANTHROPIC_API_KEY",
    auth: "x-api-key",
    baseUrl: "https://api.anthropic.com/v1",
    wire: "anthropic-messages",
    reasoningField: "output_config.effort",
    extraHeaders: { "anthropic-version": "2023-06-01" },
    reportsUsage: false,
    validation: "identity-endpoint",
    identityReportsAccount: false,
  },
  {
    id: "google",
    label: "Google Gemini",
    keysUrl: "https://aistudio.google.com/apikey",
    docsUrl: "https://ai.google.dev/gemini-api/docs/models",
    envVar: "GOOGLE_API_KEY",
    auth: "x-goog-api-key",
    baseUrl: "https://generativelanguage.googleapis.com/v1beta",
    wire: "google-generative-ai",
    reasoningField: "none",
    reportsUsage: false,
    validation: "identity-endpoint",
    identityReportsAccount: false,
  },
  {
    id: "openrouter",
    label: "OpenRouter",
    keysUrl: "https://openrouter.ai/keys",
    logsUrl: "https://openrouter.ai/activity",
    limitsUrl: "https://openrouter.ai/settings/limits",
    docsUrl: "https://openrouter.ai/models",
    envVar: "OPENROUTER_API_KEY",
    auth: "bearer",
    baseUrl: "https://openrouter.ai/api/v1",
    wire: "openai-chat-completions",
    reasoningField: "reasoning.effort",
    reportsUsage: true,
    validation: "identity-endpoint",
    identityReportsAccount: true,
  },
  {
    id: "deepseek",
    label: "DeepSeek",
    keysUrl: "https://platform.deepseek.com/api_keys",
    docsUrl: "https://api-docs.deepseek.com/quick_start/pricing",
    envVar: "DEEPSEEK_API_KEY",
    auth: "bearer",
    baseUrl: "https://api.deepseek.com",
    wire: "openai-chat-completions",
    reasoningField: "none",
    reportsUsage: false,
    validation: "identity-endpoint",
    identityReportsAccount: false,
  },
  {
    id: "xai",
    label: "xAI (Grok)",
    keysUrl: "https://console.x.ai/",
    docsUrl: "https://docs.x.ai/docs/models",
    envVar: "XAI_API_KEY",
    auth: "bearer",
    baseUrl: "https://api.x.ai/v1",
    wire: "openai-chat-completions",
    reasoningField: "none",
    reportsUsage: false,
    validation: "identity-endpoint",
    identityReportsAccount: false,
  },
  {
    id: "mistral",
    label: "Mistral",
    keysUrl: "https://console.mistral.ai/api-keys",
    docsUrl: "https://docs.mistral.ai/getting-started/models/",
    envVar: "MISTRAL_API_KEY",
    auth: "bearer",
    baseUrl: "https://api.mistral.ai/v1",
    wire: "openai-chat-completions",
    reasoningField: "none",
    reportsUsage: false,
    validation: "identity-endpoint",
    identityReportsAccount: false,
  },
  {
    id: "groq",
    label: "Groq",
    keysUrl: "https://console.groq.com/keys",
    docsUrl: "https://console.groq.com/docs/models",
    envVar: "GROQ_API_KEY",
    auth: "bearer",
    baseUrl: "https://api.groq.com/openai/v1",
    wire: "openai-chat-completions",
    reasoningField: "none",
    reportsUsage: false,
    validation: "identity-endpoint",
    identityReportsAccount: false,
  },
  {
    id: "together",
    label: "Together AI",
    keysUrl: "https://api.together.ai/settings/api-keys",
    docsUrl: "https://docs.together.ai/docs/serverless-models",
    envVar: "TOGETHER_API_KEY",
    auth: "bearer",
    baseUrl: "https://api.together.xyz/v1",
    wire: "openai-chat-completions",
    reasoningField: "none",
    reportsUsage: false,
    validation: "identity-endpoint",
    identityReportsAccount: false,
  },
  {
    id: "fireworks",
    label: "Fireworks AI",
    keysUrl: "https://fireworks.ai/api-keys",
    docsUrl: "https://docs.fireworks.ai/",
    envVar: "FIREWORKS_API_KEY",
    auth: "bearer",
    baseUrl: "https://api.fireworks.ai/inference/v1",
    wire: "openai-chat-completions",
    reasoningField: "none",
    reportsUsage: false,
    validation: "identity-endpoint",
    identityReportsAccount: false,
  },
  {
    id: "cerebras",
    label: "Cerebras",
    keysUrl: "https://cloud.cerebras.ai",
    docsUrl: "https://inference-docs.cerebras.ai/models/overview",
    envVar: "CEREBRAS_API_KEY",
    auth: "bearer",
    baseUrl: "https://api.cerebras.ai/v1",
    wire: "openai-chat-completions",
    reasoningField: "none",
    reportsUsage: false,
    validation: "identity-endpoint",
    identityReportsAccount: false,
  },
  {
    id: "nvidia-nim",
    label: "NVIDIA NIM",
    keysUrl: "https://build.nvidia.com/",
    docsUrl: "https://docs.api.nvidia.com/nim/",
    envVar: "NVIDIA_API_KEY",
    auth: "bearer",
    baseUrl: "https://integrate.api.nvidia.com/v1",
    wire: "openai-chat-completions",
    reasoningField: "reasoning_effort",
    reportsUsage: false,
    validation: "inference-probe",
    identityReportsAccount: false,
  },
  {
    id: "huggingface",
    label: "Hugging Face",
    keysUrl: "https://huggingface.co/settings/tokens",
    docsUrl: "https://huggingface.co/docs/inference-providers",
    envVar: "HF_TOKEN",
    auth: "bearer",
    baseUrl: "https://router.huggingface.co/v1",
    wire: "openai-chat-completions",
    reasoningField: "none",
    reportsUsage: false,
    validation: "identity-endpoint",
    identityReportsAccount: false,
  },
  {
    id: "deepinfra",
    label: "DeepInfra",
    keysUrl: "https://deepinfra.com/dash/settings/api-keys",
    docsUrl: "https://deepinfra.com/models",
    envVar: "DEEPINFRA_API_KEY",
    auth: "bearer",
    baseUrl: "https://api.deepinfra.com/v1",
    wire: "openai-chat-completions",
    reasoningField: "none",
    chatPath: "/openai/chat/completions",
    reportsUsage: false,
    validation: "identity-endpoint",
    identityReportsAccount: false,
  },
  {
    id: "azure",
    label: "Azure OpenAI",
    keysUrl: "https://learn.microsoft.com/azure/ai-services/openai/how-to/create-resource",
    docsUrl: "https://learn.microsoft.com/en-us/azure/ai-services/openai/concepts/models",
    envVar: "AZURE_API_KEY",
    auth: "api-key",
    baseUrl: "https://YOUR-RESOURCE.openai.azure.com/openai/v1",
    wire: "openai-chat-completions",
    reasoningField: "none",
    query: { "api-version": "2024-10-21" },
    reportsUsage: false,
    validation: "identity-endpoint",
    identityReportsAccount: false,
  },
  {
    id: "moonshot",
    label: "Moonshot AI (Kimi)",
    keysUrl: "https://platform.moonshot.ai/console/api-keys",
    docsUrl: "https://platform.moonshot.ai/docs/api/chat",
    envVar: "MOONSHOT_API_KEY",
    auth: "bearer",
    baseUrl: "https://api.moonshot.ai/v1",
    wire: "openai-chat-completions",
    reasoningField: "none",
    reportsUsage: false,
    validation: "identity-endpoint",
    identityReportsAccount: false,
  },
  {
    id: "zai",
    label: "Z.ai (GLM)",
    keysUrl: "https://z.ai/manage-apikey/apikey-list",
    docsUrl: "https://docs.z.ai/guides/overview/pricing",
    envVar: "ZHIPU_API_KEY",
    auth: "bearer",
    baseUrl: "https://api.z.ai/api/paas/v4",
    wire: "openai-chat-completions",
    reasoningField: "none",
    reportsUsage: false,
    validation: "identity-endpoint",
    identityReportsAccount: false,
  },
  {
    id: "alibaba",
    label: "Alibaba Model Studio",
    keysUrl: "https://bailian.console.alibabacloud.com/",
    docsUrl: "https://www.alibabacloud.com/help/en/model-studio/models",
    envVar: "DASHSCOPE_API_KEY",
    auth: "bearer",
    baseUrl: "https://dashscope-intl.aliyuncs.com/compatible-mode/v1",
    wire: "openai-chat-completions",
    reasoningField: "none",
    reportsUsage: false,
    validation: "identity-endpoint",
    identityReportsAccount: false,
  },
  {
    id: "minimax",
    label: "MiniMax",
    keysUrl: "https://platform.minimax.io/user-center/basic-information/interface-key",
    docsUrl: "https://platform.minimax.io/docs/guides/quickstart",
    envVar: "MINIMAX_API_KEY",
    auth: "bearer",
    baseUrl: "https://api.minimax.io/anthropic/v1",
    wire: "anthropic-messages",
    reasoningField: "output_config.effort",
    extraHeaders: { "anthropic-version": "2023-06-01" },
    reportsUsage: false,
    validation: "identity-endpoint",
    identityReportsAccount: false,
  },
  {
    id: "perplexity",
    label: "Perplexity",
    keysUrl: "https://www.perplexity.ai/settings/api",
    docsUrl: "https://docs.perplexity.ai/",
    envVar: "PERPLEXITY_API_KEY",
    auth: "bearer",
    baseUrl: "https://api.perplexity.ai",
    wire: "openai-chat-completions",
    reasoningField: "none",
    modelsPath: "/v1/models",
    chatPath: "/chat/completions",
    reportsUsage: false,
    validation: "identity-endpoint",
    identityReportsAccount: false,
  },
  {
    id: "ollama",
    label: "Ollama",
    keysUrl: "https://ollama.com/settings/keys",
    docsUrl: "https://docs.ollama.com/api/openai-compatibility",
    envVar: "",
    auth: "none",
    baseUrl: "http://localhost:11434/v1",
    wire: "openai-chat-completions",
    reasoningField: "none",
    reportsUsage: false,
    validation: "identity-endpoint",
    identityReportsAccount: false,
    keyless: true,
  },
  {
    id: "vllm",
    label: "vLLM",
    keysUrl: "https://docs.vllm.ai/",
    docsUrl: "https://docs.vllm.ai/en/latest/serving/openai_compatible_server.html",
    envVar: "",
    auth: "none",
    baseUrl: "http://localhost:8000/v1",
    wire: "openai-chat-completions",
    reasoningField: "none",
    reportsUsage: false,
    validation: "identity-endpoint",
    identityReportsAccount: false,
    keyless: true,
  },
  {
    id: "replicate",
    label: "Replicate",
    keysUrl: "https://replicate.com/account/api-tokens",
    docsUrl: "https://replicate.com/docs/reference/http",
    envVar: "REPLICATE_API_TOKEN",
    auth: "bearer",
    baseUrl: "https://api.replicate.com/v1",
    wire: "openai-chat-completions",
    reasoningField: "none",
    reportsUsage: false,
    validation: "identity-endpoint",
    identityReportsAccount: false,
  },
  {
    id: "sambanova",
    label: "SambaNova",
    keysUrl: "https://cloud.sambanova.ai/apis",
    docsUrl: "https://docs.sambanova.ai/cloud/docs/get-started/supported-models",
    envVar: "SAMBANOVA_API_KEY",
    auth: "bearer",
    baseUrl: "https://api.sambanova.ai/v1",
    wire: "openai-chat-completions",
    reasoningField: "none",
    reportsUsage: false,
    validation: "identity-endpoint",
    identityReportsAccount: false,
  },
  {
    id: "cohere",
    label: "Cohere",
    keysUrl: "https://dashboard.cohere.com/api-keys",
    docsUrl: "https://docs.cohere.com/docs/models",
    envVar: "COHERE_API_KEY",
    auth: "bearer",
    baseUrl: "https://api.cohere.com/v2",
    wire: "cohere-chat",
    reasoningField: "none",
    reportsUsage: false,
    validation: "identity-endpoint",
    identityReportsAccount: false,
  },
  {
    id: "cloudflare",
    label: "Cloudflare AI Gateway",
    keysUrl: "https://dash.cloudflare.com/profile/api-tokens",
    docsUrl: "https://developers.cloudflare.com/ai-gateway/",
    envVar: "CLOUDFLARE_API_TOKEN",
    auth: "bearer",
    baseUrl: "https://gateway.ai.cloudflare.com/v1/YOUR-ACCOUNT/YOUR-GATEWAY",
    wire: "openai-chat-completions",
    reasoningField: "none",
    reportsUsage: false,
    validation: "identity-endpoint",
    identityReportsAccount: false,
  },
  {
    id: "watsonx",
    label: "IBM watsonx",
    keysUrl: "https://dataplatform.cloud.ibm.com/",
    docsUrl: "https://www.ibm.com/docs/en/watsonx",
    envVar: "WATSONX_AI_APIKEY",
    auth: "bearer",
    baseUrl: "https://us-south.ml.cloud.ibm.com/ml/v1",
    wire: "openai-chat-completions",
    reasoningField: "none",
    reportsUsage: false,
    validation: "identity-endpoint",
    identityReportsAccount: false,
  },
  {
    id: "databricks",
    label: "Databricks",
    keysUrl: "https://databricks.com/",
    docsUrl: "https://docs.databricks.com/aws/en/machine-learning/model-serving/",
    envVar: "DATABRICKS_TOKEN",
    auth: "bearer",
    baseUrl: "https://YOUR-WORKSPACE.cloud.databricks.com/ai-gateway/mlflow/v1",
    wire: "openai-chat-completions",
    reasoningField: "none",
    reportsUsage: false,
    validation: "identity-endpoint",
    identityReportsAccount: false,
  },
];

/**
 * Where a provider's key is checked.
 *
 * A provider that says whose key it is has a key page of its own. The others
 * have a model listing, which answers yes or no and nothing more. Which one
 * it is comes from the provider's own row, not from its name.
 */
export const identityUrlFor = (
  provider: Provider,
  baseUrl?: string,
): string => {
  const base = (baseUrl?.trim() || provider.baseUrl).replace(/\/+$/, "");
  return provider.identityReportsAccount
    ? `${base}/key`
    : `${base}${provider.modelsPath ?? "/models"}`;
};

/**
 * Where a request that costs one goes.
 *
 * It is the provider's own inference endpoint, which is the only place a
 * request can be made. Only the providers that speak the OpenAI shape can be
 * checked this way, and only one of them is.
 */
export const inferenceUrlFor = (provider: Provider): string => {
  switch (provider.wire) {
    case "anthropic-messages":
      return `${provider.baseUrl}/messages`
    case "google-generative-ai":
      return `${provider.baseUrl}/models:streamGenerateContent`
    case "cohere-chat":
      return `${provider.baseUrl}/chat`
    default:
      return `${provider.baseUrl}/chat/completions`
  }
};

/** The provider with this id, if there is one. */
/**
 * The providers that speak the OpenAI chat-completions shape.
 *
 * They are the same shape as OpenAI's own, and they are not the same as
 * OpenAI's own: the OpenAI package's default is the Responses API, which only
 * OpenAI has. So these go through the OpenAI-compatible package, which speaks
 * chat completions and nothing else.
 */
export const OPENAI_COMPATIBLE_PROVIDERS: readonly string[] = [
  "deepseek",
  "xai",
  "mistral",
  "groq",
  "together",
  "fireworks",
  "cerebras",
  "nvidia-nim",
  "huggingface",
  "deepinfra",
  "azure",
  "moonshot",
  "zai",
  "alibaba",
  "perplexity",
  "ollama",
  "vllm",
  "replicate",
  "sambanova",
  "cloudflare",
  "watsonx",
  "databricks",
];

export const providerFor = (id: string): Provider | undefined =>
  PROVIDERS.find((provider) => provider.id === id);

/**
 * The provider the app talks to when the user has not chosen one.
 *
 * The provider **in use** is a per-side preference, like the model and the
 * effort, and it is what the model list is scoped to: the list, the key the
 * request goes out with, and the request itself all follow it, so they cannot
 * disagree about which provider is being used. This is the answer to "which
 * provider, if the user has not said" — and it is the provider the app used
 * before the choice existed, so nothing changes for a person who never makes
 * it.
 */
export const DEFAULT_PROVIDER_ID = "openrouter";
