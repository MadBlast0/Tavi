//! The provider.
//!
//! On the desktop the app talks to the model from here, not from JavaScript.
//! The key is read from the OS credential store, used, and never handed out; the
//! system prompt is written here; and the reply is streamed back over a
//! channel. There is no port to bind and no endpoint another process could
//! post to, which is the whole point of doing it this way.
//!
//! The website still has a server of its own, in `server/`. The two read the
//! same instruction text — out of `shared/instructions.json` — and the same
//! request shape, so a model is told the same thing and asked the same way
//! whichever surface the request came from.

use std::collections::HashMap;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex};
use std::time::{Duration, SystemTime, UNIX_EPOCH};

use futures_util::StreamExt;
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use tauri::ipc::Channel;
use tauri::{AppHandle, State};

use crate::appfile;

/// The instruction text, shared with the Node server.
///
/// The file is part of the build: a missing or malformed one is a broken
/// build, not a runtime condition to be handled.
const INSTRUCTIONS: &str = include_str!("../../shared/instructions.json");

/// How a provider takes a key.
#[derive(Clone, Copy, PartialEq, Eq, Debug)]
pub(crate) enum Auth {
    /// `Authorization: Bearer <key>`.
    Bearer,
    /// A header of the provider's own naming, with the key as its value.
    ///
    /// Anthropic's is `x-api-key`, Azure's is `api-key`, and Google's is
    /// `x-goog-api-key`. They are not interchangeable, and the provider's own
    /// name is the only place that says which is which.
    Header(&'static str),
    /// A bearer token AWS issues for Bedrock.
    AwsBearer,
    /// Google's own credentials, which the app cannot hold as a key.
    GoogleOAuth,
    /// No key at all. A model running on this machine does not need one.
    None,
}

/// How a provider's chat request is shaped on the wire.
///
/// Two shapes are in use. The OpenAI one is spoken by most providers,
/// including NVIDIA NIM's, which is OpenAI-compatible rather than OpenAI.
/// Anthropic's is a different request, a different set of headers and a
/// different stream.
#[derive(Clone, Copy, PartialEq, Eq, Debug)]
pub(crate) enum Wire {
    /// `POST {base}/chat/completions`, with a chat-completions body.
    OpenAiChatCompletions,
    /// `POST {base}/messages`, with Anthropic's Messages body.
    AnthropicMessages,
    /// `POST {base}/models/{model}:streamGenerateContent`, with Google's body.
    GoogleGenerativeAi,
    /// `POST {base}/chat`, with Cohere's body.
    CohereChat,
    /// Bedrock's Converse API, which is signed with AWS credentials.
    AwsBedrock,
    /// Vertex's generateContent, which is signed with Google's credentials.
    GoogleVertex,
}

impl Wire {
    /// Whether the app has a client for this shape.
    ///
    /// Two providers are signed with credentials the app does not hold — AWS's
    /// and Google's — and the app says so rather than pretending.
    pub(crate) fn is_supported(self) -> bool {
        !matches!(self, Wire::AwsBedrock | Wire::GoogleVertex)
    }
}

/// How a provider's key can be checked.
#[derive(Clone, Copy, PartialEq, Eq, Debug)]
pub(crate) enum Validation {
    /// A free request that answers "no" for a bad key.
    IdentityEndpoint,
    /// No such endpoint. The only way to find out is to make a real
    /// inference, which costs the user's quota, so it is only ever run when
    /// the user asks for it.
    InferenceProbe,
}

/// A provider the app can hold a key for.
///
/// The table is the same one the website's server reads, field for field, and
/// a test in `src/lib/provider-table.test.ts` says so.
pub(crate) struct ProviderInfo {
    pub(crate) id: &'static str,
    pub(crate) label: &'static str,
    /// The environment variable this provider's key is named in.
    pub(crate) env_var: &'static str,
    /// How the provider takes the key.
    pub(crate) auth: Auth,
    /// The address the provider's API lives at.
    ///
    /// The version is part of it, because the paths below it are not the same
    /// for every provider. A key may carry its own address, which wins.
    pub(crate) base_url: &'static str,
    /// The shape of a chat request for this provider.
    pub(crate) wire: Wire,
    /// A query parameter every request needs.
    ///
    /// Azure's OpenAI endpoint takes its API version as one, and has no
    /// default for it.
    pub(crate) query: Option<(&'static str, &'static str)>,
    /// A header every request needs, beside the one the key goes in.
    pub(crate) extra_headers: Option<(&'static str, &'static str)>,
    /// Whether the provider's answer carries an account name and a limit.
    pub(crate) reports_usage: bool,
    /// How the key can be checked, and what it costs to check it.
    pub(crate) validation: Validation,
    /// Whether the identity endpoint says whose key it is.
    ///
    /// OpenRouter's key page does; the other providers' model listings do not,
    /// and a listing is not an account.
    pub(crate) identity_reports_account: bool,
    /// Whether the provider needs a key at all.
    pub(crate) keyless: bool,
}

/// The providers the app knows about.
pub(crate) const PROVIDERS: &[ProviderInfo] = &[
    ProviderInfo {
        id: "openai",
        label: "OpenAI",
        env_var: "OPENAI_API_KEY",
        auth: Auth::Bearer,
        base_url: "https://api.openai.com/v1",
        wire: Wire::OpenAiChatCompletions,
        query: None,
        extra_headers: None,
        reports_usage: false,
        validation: Validation::IdentityEndpoint,
        identity_reports_account: false,
        keyless: false,
    },
    ProviderInfo {
        id: "anthropic",
        label: "Anthropic",
        env_var: "ANTHROPIC_API_KEY",
        auth: Auth::Header("x-api-key"),
        base_url: "https://api.anthropic.com/v1",
        wire: Wire::AnthropicMessages,
        query: None,
        extra_headers: Some(("anthropic-version", "2023-06-01")),
        reports_usage: false,
        validation: Validation::IdentityEndpoint,
        identity_reports_account: false,
        keyless: false,
    },
    ProviderInfo {
        id: "google",
        label: "Google Gemini",
        env_var: "GOOGLE_API_KEY",
        auth: Auth::Header("x-goog-api-key"),
        base_url: "https://generativelanguage.googleapis.com/v1beta",
        wire: Wire::GoogleGenerativeAi,
        query: None,
        extra_headers: None,
        reports_usage: false,
        validation: Validation::IdentityEndpoint,
        identity_reports_account: false,
        keyless: false,
    },
    ProviderInfo {
        id: "openrouter",
        label: "OpenRouter",
        env_var: "OPENROUTER_API_KEY",
        auth: Auth::Bearer,
        base_url: "https://openrouter.ai/api/v1",
        wire: Wire::OpenAiChatCompletions,
        query: None,
        extra_headers: None,
        reports_usage: true,
        validation: Validation::IdentityEndpoint,
        identity_reports_account: true,
        keyless: false,
    },
    ProviderInfo {
        id: "deepseek",
        label: "DeepSeek",
        env_var: "DEEPSEEK_API_KEY",
        auth: Auth::Bearer,
        base_url: "https://api.deepseek.com",
        wire: Wire::OpenAiChatCompletions,
        query: None,
        extra_headers: None,
        reports_usage: false,
        validation: Validation::IdentityEndpoint,
        identity_reports_account: false,
        keyless: false,
    },
    ProviderInfo {
        id: "xai",
        label: "xAI (Grok)",
        env_var: "XAI_API_KEY",
        auth: Auth::Bearer,
        base_url: "https://api.x.ai/v1",
        wire: Wire::OpenAiChatCompletions,
        query: None,
        extra_headers: None,
        reports_usage: false,
        validation: Validation::IdentityEndpoint,
        identity_reports_account: false,
        keyless: false,
    },
    ProviderInfo {
        id: "mistral",
        label: "Mistral",
        env_var: "MISTRAL_API_KEY",
        auth: Auth::Bearer,
        base_url: "https://api.mistral.ai/v1",
        wire: Wire::OpenAiChatCompletions,
        query: None,
        extra_headers: None,
        reports_usage: false,
        validation: Validation::IdentityEndpoint,
        identity_reports_account: false,
        keyless: false,
    },
    ProviderInfo {
        id: "groq",
        label: "Groq",
        env_var: "GROQ_API_KEY",
        auth: Auth::Bearer,
        base_url: "https://api.groq.com/openai/v1",
        wire: Wire::OpenAiChatCompletions,
        query: None,
        extra_headers: None,
        reports_usage: false,
        validation: Validation::IdentityEndpoint,
        identity_reports_account: false,
        keyless: false,
    },
    ProviderInfo {
        id: "together",
        label: "Together AI",
        env_var: "TOGETHER_API_KEY",
        auth: Auth::Bearer,
        base_url: "https://api.together.xyz/v1",
        wire: Wire::OpenAiChatCompletions,
        query: None,
        extra_headers: None,
        reports_usage: false,
        validation: Validation::IdentityEndpoint,
        identity_reports_account: false,
        keyless: false,
    },
    ProviderInfo {
        id: "fireworks",
        label: "Fireworks AI",
        env_var: "FIREWORKS_API_KEY",
        auth: Auth::Bearer,
        base_url: "https://api.fireworks.ai/inference/v1",
        wire: Wire::OpenAiChatCompletions,
        query: None,
        extra_headers: None,
        reports_usage: false,
        validation: Validation::IdentityEndpoint,
        identity_reports_account: false,
        keyless: false,
    },
    ProviderInfo {
        id: "cerebras",
        label: "Cerebras",
        env_var: "CEREBRAS_API_KEY",
        auth: Auth::Bearer,
        base_url: "https://api.cerebras.ai/v1",
        wire: Wire::OpenAiChatCompletions,
        query: None,
        extra_headers: None,
        reports_usage: false,
        validation: Validation::IdentityEndpoint,
        identity_reports_account: false,
        keyless: false,
    },
    ProviderInfo {
        id: "nvidia-nim",
        label: "NVIDIA NIM",
        env_var: "NVIDIA_API_KEY",
        auth: Auth::Bearer,
        base_url: "https://integrate.api.nvidia.com/v1",
        wire: Wire::OpenAiChatCompletions,
        query: None,
        extra_headers: None,
        reports_usage: false,
        validation: Validation::InferenceProbe,
        identity_reports_account: false,
        keyless: false,
    },
    ProviderInfo {
        id: "huggingface",
        label: "Hugging Face",
        env_var: "HF_TOKEN",
        auth: Auth::Bearer,
        base_url: "https://router.huggingface.co/v1",
        wire: Wire::OpenAiChatCompletions,
        query: None,
        extra_headers: None,
        reports_usage: false,
        validation: Validation::IdentityEndpoint,
        identity_reports_account: false,
        keyless: false,
    },
    ProviderInfo {
        id: "deepinfra",
        label: "DeepInfra",
        env_var: "DEEPINFRA_API_KEY",
        auth: Auth::Bearer,
        base_url: "https://api.deepinfra.com/v1/openai",
        wire: Wire::OpenAiChatCompletions,
        query: None,
        extra_headers: None,
        reports_usage: false,
        validation: Validation::IdentityEndpoint,
        identity_reports_account: false,
        keyless: false,
    },
    ProviderInfo {
        id: "amazon-bedrock",
        label: "Amazon Bedrock",
        env_var: "AWS_BEARER_TOKEN_BEDROCK",
        auth: Auth::AwsBearer,
        base_url: "https://bedrock-runtime.us-east-1.amazonaws.com",
        wire: Wire::AwsBedrock,
        query: None,
        extra_headers: None,
        reports_usage: false,
        validation: Validation::IdentityEndpoint,
        identity_reports_account: false,
        keyless: false,
    },
    ProviderInfo {
        id: "google-vertex",
        label: "Google Vertex AI",
        env_var: "GOOGLE_APPLICATION_CREDENTIALS",
        auth: Auth::GoogleOAuth,
        base_url: "https://us-central1-aiplatform.googleapis.com/v1",
        wire: Wire::GoogleVertex,
        query: None,
        extra_headers: None,
        reports_usage: false,
        validation: Validation::IdentityEndpoint,
        identity_reports_account: false,
        keyless: false,
    },
    ProviderInfo {
        id: "azure",
        label: "Azure OpenAI",
        env_var: "AZURE_API_KEY",
        auth: Auth::Header("api-key"),
        base_url: "https://YOUR-RESOURCE.openai.azure.com/openai/v1",
        wire: Wire::OpenAiChatCompletions,
        query: Some(("api-version", "2024-10-21")),
        extra_headers: None,
        reports_usage: false,
        validation: Validation::IdentityEndpoint,
        identity_reports_account: false,
        keyless: false,
    },
    ProviderInfo {
        id: "moonshot",
        label: "Moonshot AI (Kimi)",
        env_var: "MOONSHOT_API_KEY",
        auth: Auth::Bearer,
        base_url: "https://api.moonshot.ai/v1",
        wire: Wire::OpenAiChatCompletions,
        query: None,
        extra_headers: None,
        reports_usage: false,
        validation: Validation::IdentityEndpoint,
        identity_reports_account: false,
        keyless: false,
    },
    ProviderInfo {
        id: "zai",
        label: "Z.ai (GLM)",
        env_var: "ZHIPU_API_KEY",
        auth: Auth::Bearer,
        base_url: "https://api.z.ai/api/paas/v4",
        wire: Wire::OpenAiChatCompletions,
        query: None,
        extra_headers: None,
        reports_usage: false,
        validation: Validation::IdentityEndpoint,
        identity_reports_account: false,
        keyless: false,
    },
    ProviderInfo {
        id: "alibaba",
        label: "Alibaba Model Studio",
        env_var: "DASHSCOPE_API_KEY",
        auth: Auth::Bearer,
        base_url: "https://dashscope-intl.aliyuncs.com/compatible-mode/v1",
        wire: Wire::OpenAiChatCompletions,
        query: None,
        extra_headers: None,
        reports_usage: false,
        validation: Validation::IdentityEndpoint,
        identity_reports_account: false,
        keyless: false,
    },
    ProviderInfo {
        id: "minimax",
        label: "MiniMax",
        env_var: "MINIMAX_API_KEY",
        auth: Auth::Bearer,
        base_url: "https://api.minimax.io/anthropic/v1",
        wire: Wire::AnthropicMessages,
        query: None,
        extra_headers: Some(("anthropic-version", "2023-06-01")),
        reports_usage: false,
        validation: Validation::IdentityEndpoint,
        identity_reports_account: false,
        keyless: false,
    },
    ProviderInfo {
        id: "perplexity",
        label: "Perplexity",
        env_var: "PERPLEXITY_API_KEY",
        auth: Auth::Bearer,
        base_url: "https://api.perplexity.ai",
        wire: Wire::OpenAiChatCompletions,
        query: None,
        extra_headers: None,
        reports_usage: false,
        validation: Validation::IdentityEndpoint,
        identity_reports_account: false,
        keyless: false,
    },
    ProviderInfo {
        id: "ollama",
        label: "Ollama",
        env_var: "",
        auth: Auth::None,
        base_url: "http://localhost:11434/v1",
        wire: Wire::OpenAiChatCompletions,
        query: None,
        extra_headers: None,
        reports_usage: false,
        validation: Validation::IdentityEndpoint,
        identity_reports_account: false,
        keyless: true,
    },
    ProviderInfo {
        id: "vllm",
        label: "vLLM",
        env_var: "",
        auth: Auth::None,
        base_url: "http://localhost:8000/v1",
        wire: Wire::OpenAiChatCompletions,
        query: None,
        extra_headers: None,
        reports_usage: false,
        validation: Validation::IdentityEndpoint,
        identity_reports_account: false,
        keyless: true,
    },
    ProviderInfo {
        id: "replicate",
        label: "Replicate",
        env_var: "REPLICATE_API_TOKEN",
        auth: Auth::Bearer,
        base_url: "https://api.replicate.com/v1",
        wire: Wire::OpenAiChatCompletions,
        query: None,
        extra_headers: None,
        reports_usage: false,
        validation: Validation::IdentityEndpoint,
        identity_reports_account: false,
        keyless: false,
    },
    ProviderInfo {
        id: "sambanova",
        label: "SambaNova",
        env_var: "SAMBANOVA_API_KEY",
        auth: Auth::Bearer,
        base_url: "https://api.sambanova.ai/v1",
        wire: Wire::OpenAiChatCompletions,
        query: None,
        extra_headers: None,
        reports_usage: false,
        validation: Validation::IdentityEndpoint,
        identity_reports_account: false,
        keyless: false,
    },
    ProviderInfo {
        id: "cohere",
        label: "Cohere",
        env_var: "COHERE_API_KEY",
        auth: Auth::Bearer,
        base_url: "https://api.cohere.com/v2",
        wire: Wire::CohereChat,
        query: None,
        extra_headers: None,
        reports_usage: false,
        validation: Validation::IdentityEndpoint,
        identity_reports_account: false,
        keyless: false,
    },
    ProviderInfo {
        id: "cloudflare",
        label: "Cloudflare AI Gateway",
        env_var: "CLOUDFLARE_API_TOKEN",
        auth: Auth::Bearer,
        base_url: "https://gateway.ai.cloudflare.com/v1/YOUR-ACCOUNT/YOUR-GATEWAY",
        wire: Wire::OpenAiChatCompletions,
        query: None,
        extra_headers: None,
        reports_usage: false,
        validation: Validation::IdentityEndpoint,
        identity_reports_account: false,
        keyless: false,
    },
    ProviderInfo {
        id: "watsonx",
        label: "IBM watsonx",
        env_var: "WATSONX_AI_APIKEY",
        auth: Auth::Bearer,
        base_url: "https://us-south.ml.cloud.ibm.com/ml/v1",
        wire: Wire::OpenAiChatCompletions,
        query: None,
        extra_headers: None,
        reports_usage: false,
        validation: Validation::IdentityEndpoint,
        identity_reports_account: false,
        keyless: false,
    },
    ProviderInfo {
        id: "databricks",
        label: "Databricks",
        env_var: "DATABRICKS_TOKEN",
        auth: Auth::Bearer,
        base_url: "https://YOUR-WORKSPACE.cloud.databricks.com/ai-gateway/mlflow/v1",
        wire: Wire::OpenAiChatCompletions,
        query: None,
        extra_headers: None,
        reports_usage: false,
        validation: Validation::IdentityEndpoint,
        identity_reports_account: false,
        keyless: false,
    },
];

/// The provider with this id, if there is one.
pub(crate) fn provider_for(id: &str) -> Option<&'static ProviderInfo> {
    PROVIDERS.iter().find(|provider| provider.id == id)
}

/// A provider, resolved for one request.
///
/// The table holds the providers the app knows about. A request resolves one
/// of them, so that the address, the header and the request shape all come
/// from the same row and cannot disagree.
#[derive(Clone, Debug)]
pub struct Provider {
    /// The provider's id.
    pub id: String,
    /// The provider's name.
    pub label: String,
    /// The address the API lives at, without a trailing slash.
    base: String,
    /// How the key is sent.
    auth: Auth,
    /// The shape of a chat request.
    wire: Wire,
    /// A query parameter every request needs.
    query: Option<(&'static str, &'static str)>,
    /// A header every request needs, beside the one the key goes in.
    extra_headers: Option<(&'static str, &'static str)>,
}

impl Provider {
    /// The provider with this id, resolved for a request.
    pub fn for_provider(id: &str) -> Option<Provider> {
        provider_for(id).map(|info| Provider {
            id: info.id.to_string(),
            label: info.label.to_string(),
            base: info.base_url.trim_end_matches('/').to_string(),
            auth: info.auth,
            wire: info.wire,
            query: info.query,
            extra_headers: info.extra_headers,
        })
    }

    /// The provider with this id, at an address of its own.
    ///
    /// A key may carry the address it belongs to — an Azure resource, a
    /// self-hosted vLLM, a workspace of your own — and the key's address wins
    /// over the table's default.
    pub fn for_provider_at(id: &str, base: &str) -> Option<Provider> {
        let mut provider = Provider::for_provider(id)?;
        let base = base.trim().trim_end_matches('/');
        if !base.is_empty() {
            provider.base = base.to_string();
        }
        Some(provider)
    }

    /// A provider at an address of its own.
    ///
    /// For a test that needs a provider to talk to.
    #[cfg(test)]
    pub fn at(base: &str) -> Self {
        Provider::for_provider_at("openrouter", base).expect("OpenRouter is a provider")
    }

    /// Whether the app has a client for this provider.
    pub fn is_supported(&self) -> bool {
        self.wire.is_supported()
    }

    /// Whether the provider needs a key at all.
    pub fn is_keyless(&self) -> bool {
        provider_for(&self.id).map(|info| info.keyless).unwrap_or(false)
    }

    /// The path of the chat request, under the provider's base address.
    ///
    /// Two of the shapes carry the model's own name in the path, and one
    /// carries a colon before the action.
    fn chat_path(&self, model: &str) -> String {
        match self.wire {
            Wire::OpenAiChatCompletions => "/chat/completions".to_string(),
            Wire::AnthropicMessages => "/messages".to_string(),
            Wire::GoogleGenerativeAi => format!("/models/{model}:streamGenerateContent"),
            Wire::CohereChat => "/chat".to_string(),
            Wire::AwsBedrock => format!("/model/{model}/converse"),
            Wire::GoogleVertex => format!("/models/{model}:streamGenerateContent"),
        }
    }

    /// The path of the model listing, under the provider's base address.
    fn models_path(&self) -> &'static str {
        "/models"
    }

    fn catalogue_url(&self) -> String {
        format!("{}{}", self.base, self.models_path())
    }

    /// The address of the chat request, with the query the provider needs.
    fn chat_url(&self, model: &str) -> String {
        let mut query: Vec<String> = Vec::new();
        if let Some((name, value)) = self.query {
            query.push(format!("{name}={value}"));
        }
        /* Google's streaming endpoint speaks SSE only when it is asked to. */
        if self.wire == Wire::GoogleGenerativeAi {
            query.push("alt=sse".to_string());
        }
        let mut url = format!("{}{}", self.base, self.chat_path(model));
        if !query.is_empty() {
            url.push('?');
            url.push_str(&query.join("&"));
        }
        url
    }

    /// The address of the provider's own key page, for the one provider that
    /// has one.
    pub(crate) fn key_url(&self) -> String {
        format!("{}/key", self.base)
    }

    /// The header every request needs, beside the one the key goes in.
    pub(crate) fn extra_header(&self) -> Option<(&'static str, &'static str)> {
        self.extra_headers
    }

    /// The address a check that costs a request goes to.
    ///
    /// It is the provider's own inference endpoint, which is the only place a
    /// request can be made.
    pub(crate) fn probe_url(&self) -> String {
        match self.wire {
            Wire::OpenAiChatCompletions => format!("{}/chat/completions", self.base),
            Wire::AnthropicMessages => format!("{}/messages", self.base),
            Wire::GoogleGenerativeAi => {
                format!("{}/models:streamGenerateContent", self.base)
            }
            Wire::CohereChat => format!("{}/chat", self.base),
            Wire::AwsBedrock | Wire::GoogleVertex => format!("{}/", self.base),
        }
    }

    /// Puts the key on a request, the way this provider takes it.
    ///
    /// A provider with no key gets a request with no key on it, which is the
    /// right request: a model on this machine is not behind a login.
    pub(crate) fn apply_auth(
        &self,
        request: reqwest::RequestBuilder,
        key: Option<&str>,
    ) -> reqwest::RequestBuilder {
        let request = match (self.auth, key) {
            (Auth::None, _) => request,
            (Auth::GoogleOAuth, _) => request,
            (Auth::Bearer, Some(key)) => request.bearer_auth(key),
            (Auth::AwsBearer, Some(key)) => request.bearer_auth(key),
            (Auth::Header(name), Some(key)) => request.header(name, key),
            (_, None) => request,
        };
        match self.extra_headers {
            Some((name, value)) => request.header(name, value),
            None => request,
        }
    }
}

/// The file the catalogue is cached in.
///
/// One per provider, because a catalogue is a list of one provider's models
/// and another provider's models are not the same list.
fn catalogue_file(provider_id: &str) -> String {
    format!("catalogue.{provider_id}.json")
}

/// How long the catalogue is trusted for.
const CATALOGUE_TTL_SECS: u64 = 15 * 60;

/// How long a request may take.
const REQUEST_TIMEOUT: Duration = Duration::from_secs(300);

/// How long a catalogue or key lookup may take.
const LOOKUP_TIMEOUT: Duration = Duration::from_secs(30);

/* -------------------------------------------------------------------------- */
/* The request                                                                 */
/* -------------------------------------------------------------------------- */

/// A chat request, in the shape the app sends.
#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ChatRequest {
    pub messages: Vec<ChatMessage>,
    /// Which surface the request came from. Required.
    pub variant: Option<String>,
    /// The agent mode. Code only.
    pub mode: Option<String>,
    /// The folder's name. Code only.
    pub folder: Option<String>,
    /// The folder's id. Code only.
    ///
    /// A name is not enough to say which folder is meant — two folders can
    /// have the same name — and a CLI provider has to be started in the right
    /// one, so the id is sent as well.
    pub folder_id: Option<String>,
    /// The client used to send the system prompt as prose. It is refused now.
    pub system: Option<String>,
    /// Tools the client wants to offer. A chat may not carry any.
    pub tools: Option<Value>,
    pub config: Option<ChatConfig>,
    /// Identifies this request, so it can be cancelled.
    #[serde(default)]
    pub request_id: Option<String>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ChatConfig {
    pub model_name: Option<String>,
    /// Which provider to ask.
    ///
    /// The composer sends the provider it showed the model list for, so the
    /// request and the list are about the same provider by construction.
    pub provider_id: Option<String>,
    /// The reasoning preference, already checked and written the provider's
    /// way.
    ///
    /// The desktop app has no server to check it against, so the check happens
    /// in the webview, against the same shared rule the server uses. The
    /// fields are the provider's own, and they are sent as they are.
    pub reasoning: Option<Value>,
}

#[derive(Debug, Deserialize)]
pub struct ChatMessage {
    pub role: String,
    #[serde(default)]
    pub parts: Vec<MessagePart>,
}

#[derive(Debug, Deserialize)]
pub struct MessagePart {
    #[serde(rename = "type", default)]
    pub kind: String,
    #[serde(default)]
    pub text: Option<String>,
}

/* -------------------------------------------------------------------------- */
/* The events                                                                  */
/* -------------------------------------------------------------------------- */

/// What the app is told while the answer comes in.
///
/// The names are the ones the app already reads off the stream, so the two
/// paths — this one and the Node server's — are the same to the composer.
#[derive(Clone, Debug, Serialize)]
#[serde(tag = "type")]
pub enum ChatEvent {
    #[serde(rename = "text-delta")]
    TextDelta { delta: String },
    #[serde(rename = "message-metadata")]
    MessageMetadata {
        #[serde(rename = "messageMetadata")]
        message_metadata: EventMetadata,
    },
    #[serde(rename = "finish")]
    Finish {
        #[serde(rename = "messageMetadata")]
        message_metadata: EventMetadata,
    },
    #[serde(rename = "error")]
    Error { error: EventError },
    /// A tool the agent used.
    ///
    /// Only a CLI provider sends these. An API provider has no tools of its
    /// own, so it sends none, and the composer shows no activity for it.
    #[serde(rename = "tool")]
    Tool { tool: ToolEvent },
}

/// What a tool did.
#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ToolEvent {
    /// The name the program calls the tool by.
    pub name: String,
    /// What it was doing, in words.
    pub title: String,
    /// How far it got: running, completed or failed.
    pub status: String,
    /// What it was given.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub input: Option<Value>,
    /// What it said.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub output: Option<String>,
}

#[derive(Clone, Debug, Default, Serialize)]
pub struct EventMetadata {
    #[serde(rename = "modelId", skip_serializing_if = "Option::is_none")]
    pub model_id: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub usage: Option<Value>,
}

#[derive(Clone, Debug, Serialize)]
pub struct EventError {
    pub message: String,
}

/* -------------------------------------------------------------------------- */
/* Cancellation                                                                */
/* -------------------------------------------------------------------------- */

/// The requests in flight, so one of them can be stopped.
#[derive(Default)]
pub struct Cancellations {
    entries: Mutex<HashMap<String, Arc<AtomicBool>>>,
}

impl Cancellations {
    pub(crate) fn register(&self, id: &str) -> Arc<AtomicBool> {
        let flag = Arc::new(AtomicBool::new(false));
        if let Ok(mut entries) = self.entries.lock() {
            entries.insert(id.to_string(), flag.clone());
        }
        flag
    }

    pub(crate) fn finish(&self, id: &str) {
        if let Ok(mut entries) = self.entries.lock() {
            entries.remove(id);
        }
    }

    fn cancel(&self, id: &str) -> bool {
        match self.entries.lock() {
            Ok(entries) => match entries.get(id) {
                Some(flag) => {
                    flag.store(true, Ordering::SeqCst);
                    true
                }
                None => false,
            },
            Err(_) => false,
        }
    }
}

/// Stops a request that is in flight.
///
/// The app cannot cancel an `invoke`, so it says which request to stop and
/// this is where it is noticed.
#[tauri::command]
pub async fn cancel_chat(
    cancellations: State<'_, Cancellations>,
    request_id: String,
) -> Result<(), String> {
    cancellations.cancel(&request_id);
    Ok(())
}

/* -------------------------------------------------------------------------- */
/* The system prompt                                                           */
/* -------------------------------------------------------------------------- */

#[derive(Debug, Deserialize)]
struct Instructions {
    chat: String,
    folder: String,
    modes: HashMap<String, String>,
}

fn instructions() -> &'static Instructions {
    static INSTRUCTIONS_ONCE: std::sync::OnceLock<Instructions> = std::sync::OnceLock::new();
    INSTRUCTIONS_ONCE.get_or_init(|| {
        serde_json::from_str(INSTRUCTIONS)
            .expect("the instruction file is part of the build and must be readable")
    })
}

/// The system prompt for a request.
///
/// A chat gets the chat instruction and nothing else — no folder, no agent
/// mode, because a chat has neither. A code session gets its mode's
/// instruction and, when it has one, the folder paragraph.
fn build_system_prompt(variant: &str, mode: Option<&str>, folder: Option<&str>) -> String {
    let text = instructions();
    if variant == "chat" {
        return text.chat.clone();
    }

    let mode_text = mode
        .and_then(|value| text.modes.get(value))
        .or_else(|| text.modes.get("edit"))
        .cloned()
        .unwrap_or_default();

    let mut parts = vec![mode_text];
    if let Some(name) = folder.filter(|name| !name.is_empty()) {
        parts.push(text.folder.replace("{name}", name));
    }
    parts.join("\n\n")
}

/* -------------------------------------------------------------------------- */
/* The catalogue                                                               */
/* -------------------------------------------------------------------------- */

#[derive(Debug, Serialize, Deserialize)]
struct CachedCatalogue {
    fetched_at: u64,
    body: String,
}

/// A catalogue, and how old it is.
///
/// The age is part of the answer because a catalogue that is three weeks old
/// names models that no longer exist and prices that have changed. Serving
/// it silently is what the website already warns about; the desktop served
/// the same copy with no signal at all.
struct Catalogue {
    body: String,
    /// When it was fetched, in unix seconds.
    fetched_at: u64,
    /// Whether the provider could not be reached and this is the last good
    /// copy. The one state a user can act on.
    degraded: bool,
}

fn now_secs() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|since| since.as_secs())
        .unwrap_or(0)
}

pub(crate) fn http() -> reqwest::Client {
    reqwest::Client::builder()
        .user_agent(concat!("Tavi/", env!("CARGO_PKG_VERSION")))
        .timeout(REQUEST_TIMEOUT)
        .build()
        .unwrap_or_default()
}

/// The model catalogue, as the provider publishes it.
///
/// It is cached, because it is large and it does not change often. A catalogue
/// that cannot be fetched is served from the cache if there is one: a picker
/// that lists last week's models is better than an empty one — and the copy
/// says how old it is, so nobody is told a stale list is a current one.
async fn catalogue(
    app: &AppHandle,
    provider: &Provider,
    force: bool,
) -> Result<Catalogue, String> {
    let path = appfile::data_path(app, &catalogue_file(&provider.id));

    if !force {
        if let Some(path) = path.as_ref() {
            if let Some(raw) = appfile::read_string(path) {
                if let Ok(cached) = serde_json::from_str::<CachedCatalogue>(&raw) {
                    if now_secs().saturating_sub(cached.fetched_at) < CATALOGUE_TTL_SECS {
                        return Ok(Catalogue {
                            body: cached.body,
                            fetched_at: cached.fetched_at,
                            degraded: false,
                        });
                    }
                }
            }
        }
    }

    let fetched = match fetch_text(&provider.catalogue_url(), None, LOOKUP_TIMEOUT).await {
        Ok(body) => body,
        Err(error) => {
            if let Some(path) = path.as_ref() {
                if let Some(raw) = appfile::read_string(path) {
                    if let Ok(cached) = serde_json::from_str::<CachedCatalogue>(&raw) {
                        return Ok(Catalogue {
                            body: cached.body,
                            fetched_at: cached.fetched_at,
                            degraded: true,
                        });
                    }
                }
            }
            return Err(error);
        }
    };

    let fetched_at = now_secs();
    if let Some(path) = path.as_ref() {
        let cached = CachedCatalogue {
            fetched_at,
            body: fetched.clone(),
        };
        if let Ok(json) = serde_json::to_string(&cached) {
            let _ = appfile::write_atomic(path, &json);
        }
    }

    /* The catalogue used to be one file for one provider, and it is one file
       per provider now. The old one is never read again, so it is taken away
       rather than left in the app's data folder for ever. It is a cache, and
       it can be fetched again, so nothing is lost. */
    if let Some(legacy) = appfile::data_path(app, "catalogue.json") {
        if legacy != path.unwrap_or_default() {
            let _ = std::fs::remove_file(legacy);
        }
    }

    Ok(Catalogue {
        body: fetched,
        fetched_at,
        degraded: false,
    })
}

/// Fetches a URL and returns its body.
async fn fetch_text(
    url: &str,
    key: Option<&str>,
    timeout: Duration,
) -> Result<String, String> {
    let mut request = http().get(url).timeout(timeout);
    if let Some(key) = key {
        request = request.bearer_auth(key);
    }
    let response = request
        .send()
        .await
        .map_err(|e| format!("Could not reach the provider: {e}"))?;
    if !response.status().is_success() {
        return Err(format!(
            "The provider answered with {}.",
            response.status().as_u16()
        ));
    }
    response
        .text()
        .await
        .map_err(|e| format!("Could not read the provider's answer: {e}"))
}

/// The model catalogue, for the picker.
///
/// The catalogue and the age of the copy being served, so the picker can say
/// how old it is. The age is not decoration: a catalogue is a list of models
/// with prices, and a list that is three weeks old names models that no
/// longer exist.
#[tauri::command]
pub async fn model_catalogue(
    app: AppHandle,
    provider: String,
    force: bool,
) -> Result<Value, String> {
    /* The catalogue comes from the provider, and a provider is only reachable
       with a key. Without one there is nothing to list: the list would be of
       models that cannot be called. The rule is here rather than in the
       composer because a rule the client can ignore is not a rule.

       The provider is named, because the app can talk to more than one and the
       list has to be the one whose models a request will use. */
    let provider = Provider::for_provider(&provider)
        .ok_or_else(|| format!("\"{provider}\" is not a provider this app knows about."))?;

    /* A provider signed with credentials the app does not hold is refused
       here, with the reason, rather than at the first request. */
    if !provider.is_supported() {
        return Err(format!(
            "{} is signed with credentials rather than with a key, and this app does not hold those yet.",
            provider.label
        ));
    }

    let key = crate::keys::active_key(&app, &provider.id)?;
    let provider = match key.as_ref().and_then(|key| key.base_url.as_deref()) {
        Some(base) => Provider::for_provider_at(&provider.id, base)
            .ok_or_else(|| format!("\"{}\" is not a provider this app knows about.", provider.id))?,
        None => provider,
    };

    if key.is_none() && !provider.is_keyless() {
        return Err(format!(
            "No {} key is set. Add one in the settings.",
            provider.label
        ));
    }
    let catalogue = catalogue(&app, &provider, force).await?;
    Ok(json!({
        "body": catalogue.body,
        "fetchedAt": catalogue.fetched_at,
        "degraded": catalogue.degraded,
    }))
}

/* -------------------------------------------------------------------------- */
/* The effort                                                                  */
/* -------------------------------------------------------------------------- */

/* -------------------------------------------------------------------------- */
/* The chat                                                                    */
/* -------------------------------------------------------------------------- */

/// The messages, in the OpenAI chat-completions shape.
///
/// The system prompt is the first message, which is where this shape puts
/// it. Anthropic's shape has a field of its own for it, and is built
/// separately.
fn provider_messages(request: &ChatRequest, system: &str) -> Vec<Value> {
    let mut messages = vec![json!({ "role": "system", "content": system })];
    for message in &request.messages {
        let text = message
            .parts
            .iter()
            .filter(|part| part.kind == "text")
            .filter_map(|part| part.text.as_deref())
            .collect::<Vec<_>>()
            .join("\n\n");
        if text.trim().is_empty() {
            continue;
        }
        let role = match message.role.as_str() {
            "assistant" => "assistant",
            _ => "user",
        };
        messages.push(json!({ "role": role, "content": text }));
    }
    messages
}

/// The messages, in Anthropic's Messages shape.
///
/// The system prompt is not a message here; it is a field of the request.
/// The roles are the same two.
fn anthropic_messages(request: &ChatRequest) -> Vec<Value> {
    let mut messages = Vec::new();
    for message in &request.messages {
        let text = message
            .parts
            .iter()
            .filter(|part| part.kind == "text")
            .filter_map(|part| part.text.as_deref())
            .collect::<Vec<_>>()
            .join("\n\n");
        if text.trim().is_empty() {
            continue;
        }
        let role = match message.role.as_str() {
            "assistant" => "assistant",
            _ => "user",
        };
        messages.push(json!({ "role": role, "content": text }));
    }
    messages
}

/// The messages, in Google's generate-content shape.
///
/// The system prompt is a field of its own, and a turn is a list of parts
/// rather than a string.
fn google_contents(request: &ChatRequest) -> Vec<Value> {
    let mut contents = Vec::new();
    for message in &request.messages {
        let text = message
            .parts
            .iter()
            .filter(|part| part.kind == "text")
            .filter_map(|part| part.text.as_deref())
            .collect::<Vec<_>>()
            .join("\n\n");
        if text.trim().is_empty() {
            continue;
        }
        let role = match message.role.as_str() {
            "assistant" => "model",
            _ => "user",
        };
        contents.push(json!({ "role": role, "parts": [{ "text": text }] }));
    }
    contents
}

/// The messages, in Cohere's shape.
///
/// The system prompt is its own turn here, and it says so by being a system
/// turn rather than a field.
fn cohere_messages(request: &ChatRequest, system: &str) -> Vec<Value> {
    let mut messages = vec![json!({ "role": "system", "content": system })];
    for message in &request.messages {
        let text = message
            .parts
            .iter()
            .filter(|part| part.kind == "text")
            .filter_map(|part| part.text.as_deref())
            .collect::<Vec<_>>()
            .join("\n\n");
        if text.trim().is_empty() {
            continue;
        }
        let role = match message.role.as_str() {
            "assistant" => "assistant",
            _ => "user",
        };
        messages.push(json!({ "role": role, "content": text }));
    }
    messages
}

/// How many tokens a reply may use.
///
/// Anthropic requires it: there is no default, and a request without it is
/// refused. The OpenAI shape has a default the provider picks, so it is left
/// out rather than guessed at.
const ANTHROPIC_MAX_TOKENS: u64 = 8_192;

/// The provider's usage, in the app's shape.
fn map_usage(raw: &Value) -> Value {
    let mut usage = serde_json::Map::new();
    let mut put = |name: &str, value: Option<u64>| {
        if let Some(value) = value {
            usage.insert(name.to_string(), json!(value));
        }
    };
    put("inputTokens", raw.get("prompt_tokens").and_then(Value::as_u64));
    put(
        "outputTokens",
        raw.get("completion_tokens").and_then(Value::as_u64),
    );
    put("totalTokens", raw.get("total_tokens").and_then(Value::as_u64));
    put(
        "reasoningTokens",
        raw.pointer("/completion_tokens_details/reasoning_tokens")
            .and_then(Value::as_u64),
    );
    put(
        "cachedInputTokens",
        raw.pointer("/prompt_tokens_details/cached_tokens")
            .and_then(Value::as_u64),
    );
    Value::Object(usage)
}

/// Streams a chat, and sends the app what it needs as it arrives.
#[tauri::command]
pub async fn chat(
    app: AppHandle,
    cancellations: State<'_, Cancellations>,
    request: ChatRequest,
    on_event: Channel<ChatEvent>,
) -> Result<(), String> {
    /* The provider is the one the request names, which is the one the composer
       showed the model list for. The two are the same by construction: the
       client picked the provider, and it sent the same id back. */
    let provider_id = request
        .config
        .as_ref()
        .and_then(|config| config.provider_id.as_deref())
        .map(str::trim)
        .filter(|id| !id.is_empty())
        .unwrap_or(crate::keys::DEFAULT_PROVIDER)
        .to_string();

    let provider = Provider::for_provider(&provider_id)
        .ok_or_else(|| format!("\"{provider_id}\" is not a provider this app knows about."))?;

    if !provider.is_supported() {
        return Err(format!(
            "{} is signed with credentials rather than with a key, and this app does not hold those yet.",
            provider.label
        ));
    }

    let key = crate::keys::active_key(&app, &provider.id)?;
    let provider = match key.as_ref().and_then(|key| key.base_url.as_deref()) {
        Some(base) => Provider::for_provider_at(&provider.id, base)
            .ok_or_else(|| format!("\"{provider_id}\" is not a provider this app knows about."))?,
        None => provider,
    };
    let key = match key {
        Some(key) => key.secret,
        None if provider.is_keyless() => String::new(),
        None => {
            return Err(format!(
                "No {} key is set. Add one in the settings.",
                provider.label
            ))
        }
    };

    /* The key has just been used, and the app knows that for certain — it is
       the app's own use, not the provider's, which would need an admin API. */
    crate::keys::note_key_use(&app, &provider.id);

    chat_with(
        &provider,
        &key,
        &request,
        &cancellations,
        &mut |event| {
            let _ = on_event.send(event);
        },
    )
    .await
}

/// The chat itself, with the provider and the way to report it given.
///
/// The command is a thin wrapper around this, so the whole path can be
/// exercised without a window: the request that goes out, the events that come
/// back, and the refusals in between.
async fn chat_with<F>(
    provider: &Provider,
    key: &str,
    request: &ChatRequest,
    cancellations: &Cancellations,
    on_event: &mut F,
) -> Result<(), String>
where
    F: FnMut(ChatEvent),
{
    /* The rules first, in the same order the Node server applies them. */
    if request.system.is_some() {
        return Err("The system prompt is written by the server.".to_string());
    }

    let variant = request.variant.clone().unwrap_or_default();
    if variant != "chat" && variant != "code" {
        return Err(
            "No surface selected. Say whether this is a chat or a code session.".to_string(),
        );
    }

    if variant == "chat" && request.tools.is_some() {
        return Err("A chat cannot carry tools. Start a code session instead.".to_string());
    }

    let model = request
        .config
        .as_ref()
        .and_then(|config| config.model_name.as_deref())
        .unwrap_or("")
        .trim()
        .to_string();
    if model.is_empty() {
        return Err("No model selected. Pick a model before sending.".to_string());
    }

    let system = build_system_prompt(
        &variant,
        request.mode.as_deref(),
        request.folder.as_deref(),
    );

    /* The body is the provider's own shape. The OpenAI one takes the system
       prompt as the first message and the reasoning level under `reasoning`;
       Anthropic's takes the prompt as a field of its own and the level under
       `output_config`. */
    let mut body = match provider.wire {
        Wire::OpenAiChatCompletions => json!({
            "model": model,
            "messages": provider_messages(&request, &system),
            "stream": true,
        }),
        Wire::AnthropicMessages => json!({
            "model": model,
            "system": system,
            "messages": anthropic_messages(&request),
            "max_tokens": ANTHROPIC_MAX_TOKENS,
            "stream": true,
        }),
        Wire::GoogleGenerativeAi => json!({
            "contents": google_contents(&request),
            "systemInstruction": json!({ "parts": [{ "text": system }] }),
        }),
        Wire::CohereChat => json!({
            "model": model,
            "messages": cohere_messages(&request, &system),
            "stream": true,
        }),
        /* Two providers are signed with credentials the app does not hold. */
        Wire::AwsBedrock | Wire::GoogleVertex => {
            return Err(format!(
                "{} is signed with credentials rather than with a key, and this app does not hold those yet.",
                provider.label
            ));
        }
    };

    /* The reasoning preference, already checked and written the provider's
       own way by the shared rule. The fields are the provider's, and they go
       on the body as they are. */
    if let Some(reasoning) = request
        .config
        .as_ref()
        .and_then(|config| config.reasoning.as_ref())
        .and_then(|reasoning| reasoning.as_object())
    {
        for (name, value) in reasoning {
            body[name] = value.clone();
        }
    }

    let request_id = request
        .request_id
        .clone()
        .unwrap_or_else(|| "chat".to_string());
    let cancelled = cancellations.register(&request_id);

    let outcome = stream(provider, &body, &model, key, &cancelled, on_event).await;
    cancellations.finish(&request_id);
    outcome
}

/// What one line of the provider's stream means.
#[derive(Debug, PartialEq)]
enum StreamAction {
    /// A piece of the answer.
    Delta(String),
    /// The provider gave up part way through.
    Failed(String),
    /// The model that answered, and what it cost.
    Metadata {
        model_id: Option<String>,
        usage: Option<Value>,
    },
    /// Nothing this line says is for us.
    Nothing,
}

/// Reads one `data:` payload from the provider's stream.
///
/// The payloads are JSON objects, one per line, and a line that is not a
/// complete object yet is left for the next one — the stream arrives in
/// whatever pieces the network gives it.
fn read_payload(wire: Wire, payload: &str) -> StreamAction {
    let trimmed = payload.trim();
    if trimmed.is_empty() || trimmed == "[DONE]" {
        return StreamAction::Nothing;
    }
    let Ok(event) = serde_json::from_str::<Value>(trimmed) else {
        return StreamAction::Nothing;
    };

    if let Some(message) = event.pointer("/error/message").and_then(Value::as_str) {
        return StreamAction::Failed(message.to_string());
    }

    match wire {
        /* The OpenAI shape: a choice, a delta, and the usage on the last
           frame. */
        Wire::OpenAiChatCompletions => {
            let model_id = event
                .get("model")
                .and_then(Value::as_str)
                .map(str::to_string);
            let usage = event
                .get("usage")
                .filter(|usage| !usage.is_null())
                .map(map_usage);
            let delta = event
                .pointer("/choices/0/delta/content")
                .and_then(Value::as_str)
                .unwrap_or("");

            if !delta.is_empty() {
                return StreamAction::Delta(delta.to_string());
            }
            if model_id.is_some() || usage.is_some() {
                return StreamAction::Metadata { model_id, usage };
            }
            StreamAction::Nothing
        }
        /* Anthropic's shape: a named event, and the text under a content
           block. */
        Wire::AnthropicMessages => match event.get("type").and_then(Value::as_str).unwrap_or("") {
            "content_block_delta" => {
                let delta = event
                    .pointer("/delta/text")
                    .and_then(Value::as_str)
                    .unwrap_or("");
                if !delta.is_empty() {
                    return StreamAction::Delta(delta.to_string());
                }
                StreamAction::Nothing
            }
            "message_start" => StreamAction::Metadata {
                model_id: event
                    .pointer("/message/model")
                    .and_then(Value::as_str)
                    .map(str::to_string),
                usage: event
                    .pointer("/message/usage")
                    .filter(|usage| !usage.is_null())
                    .map(map_anthropic_usage),
            },
            "message_delta" => StreamAction::Metadata {
                model_id: None,
                usage: event
                    .get("usage")
                    .filter(|usage| !usage.is_null())
                    .map(map_anthropic_usage),
            },
            "error" => {
                let message = event
                    .pointer("/error/message")
                    .and_then(Value::as_str)
                    .unwrap_or("The provider reported an error.");
                StreamAction::Failed(message.to_string())
            }
            _ => StreamAction::Nothing,
        },
        /* Google's shape: a candidate, and the text under its parts. */
        Wire::GoogleGenerativeAi => {
            let model_id = event
                .pointer("/modelVersion")
                .and_then(Value::as_str)
                .map(str::to_string);
            let usage = event
                .get("usageMetadata")
                .filter(|usage| !usage.is_null())
                .map(map_google_usage);
            let delta = event
                .pointer("/candidates/0/content/parts/0/text")
                .and_then(Value::as_str)
                .unwrap_or("");

            if !delta.is_empty() {
                return StreamAction::Delta(delta.to_string());
            }
            if model_id.is_some() || usage.is_some() {
                return StreamAction::Metadata { model_id, usage };
            }
            StreamAction::Nothing
        }
        /* Cohere's shape: a named event, and the text under a message. */
        Wire::CohereChat => match event.get("type").and_then(Value::as_str).unwrap_or("") {
            "content-delta" => {
                let delta = event
                    .pointer("/delta/message/content/text")
                    .and_then(Value::as_str)
                    .unwrap_or("");
                if !delta.is_empty() {
                    return StreamAction::Delta(delta.to_string());
                }
                StreamAction::Nothing
            }
            "message-end" => StreamAction::Metadata {
                model_id: None,
                usage: event
                    .get("delta")
                    .filter(|usage| !usage.is_null())
                    .map(map_cohere_usage),
            },
            _ => StreamAction::Nothing,
        },
        Wire::AwsBedrock | Wire::GoogleVertex => StreamAction::Nothing,
    }
}

/// Anthropic's usage, in the app's shape.
fn map_anthropic_usage(raw: &Value) -> Value {
    let mut usage = serde_json::Map::new();
    let mut put = |name: &str, value: Option<u64>| {
        if let Some(value) = value {
            usage.insert(name.to_string(), json!(value));
        }
    };
    put("inputTokens", raw.get("input_tokens").and_then(Value::as_u64));
    put("outputTokens", raw.get("output_tokens").and_then(Value::as_u64));
    Value::Object(usage)
}

/// Google's usage, in the app's shape.
fn map_google_usage(raw: &Value) -> Value {
    let mut usage = serde_json::Map::new();
    let mut put = |name: &str, value: Option<u64>| {
        if let Some(value) = value {
            usage.insert(name.to_string(), json!(value));
        }
    };
    put("inputTokens", raw.get("promptTokenCount").and_then(Value::as_u64));
    put("outputTokens", raw.get("candidatesTokenCount").and_then(Value::as_u64));
    put("totalTokens", raw.get("totalTokenCount").and_then(Value::as_u64));
    put(
        "reasoningTokens",
        raw.get("thoughtsTokenCount").and_then(Value::as_u64),
    );
    Value::Object(usage)
}

/// Cohere's usage, in the app's shape.
fn map_cohere_usage(raw: &Value) -> Value {
    let mut usage = serde_json::Map::new();
    let mut put = |name: &str, value: Option<u64>| {
        if let Some(value) = value {
            usage.insert(name.to_string(), json!(value));
        }
    };
    let tokens = raw.get("tokens");
    put(
        "inputTokens",
        tokens.and_then(|t| t.get("input_tokens")).and_then(Value::as_u64),
    );
    put(
        "outputTokens",
        tokens.and_then(|t| t.get("output_tokens")).and_then(Value::as_u64),
    );
    Value::Object(usage)
}

/// Sends the request and reads the reply.
async fn stream<F>(
    provider: &Provider,
    body: &Value,
    model: &str,
    key: &str,
    cancelled: &Arc<AtomicBool>,
    on_event: &mut F,
) -> Result<(), String>
where
    F: FnMut(ChatEvent),
{
    let response = provider
        .apply_auth(http().post(provider.chat_url(model)), Some(key))
        .json(body)
        .send()
        .await
        .map_err(|e| format!("Could not reach the provider: {e}"))?;

    if !response.status().is_success() {
        let status = response.status().as_u16();
        let detail = response.text().await.unwrap_or_default();
        let message = serde_json::from_str::<Value>(&detail)
            .ok()
            .and_then(|value| {
                value
                    .get("error")
                    .and_then(|error| error.get("message"))
                    .and_then(Value::as_str)
                    .map(str::to_string)
            })
            .unwrap_or_else(|| format!("The provider answered with {status}."));
        return Err(message);
    }

    let mut stream = response.bytes_stream();
    let mut buffer = String::new();
    let mut model_id: Option<String> = None;
    let mut usage: Option<Value> = None;

    while let Some(chunk) = stream.next().await {
        if cancelled.load(Ordering::SeqCst) {
            return Ok(());
        }
        let chunk = chunk.map_err(|e| format!("The reply was cut short: {e}"))?;
        buffer.push_str(&String::from_utf8_lossy(&chunk));

        while let Some(position) = buffer.find('\n') {
            let line = buffer[..position].to_string();
            buffer = buffer[position + 1..].to_string();
            let line = line.trim();
            let Some(payload) = line.strip_prefix("data:") else {
                continue;
            };

            match read_payload(provider.wire, payload) {
                StreamAction::Delta(delta) => {
                    on_event(ChatEvent::TextDelta { delta });
                }
                StreamAction::Failed(message) => {
                    on_event(ChatEvent::Error {
                        error: EventError { message },
                    });
                    return Ok(());
                }
                StreamAction::Metadata {
                    model_id: found,
                    usage: found_usage,
                } => {
                    if model_id.is_none() {
                        model_id = found;
                    }
                    if found_usage.is_some() {
                        usage = found_usage;
                    }
                }
                StreamAction::Nothing => {}
            }
        }
    }

    on_event(ChatEvent::MessageMetadata {
        message_metadata: EventMetadata {
            model_id: model_id.clone(),
            usage: None,
        },
    });
    on_event(ChatEvent::Finish {
        message_metadata: EventMetadata {
            model_id: None,
            usage,
        },
    });

    Ok(())
}

/* -------------------------------------------------------------------------- */
/* The key's standing                                                          */
/* -------------------------------------------------------------------------- */

/**
 * Hides a key in a label.
 *
 * A label is free-form text from the network and should never be trusted to
 * stay masked, so anything key-shaped in it is hidden again. The rule is a
 * shape rather than one vendor's prefix: a long run of the characters a key
 * is made of, with a digit in it, is a key until shown otherwise.
 *
 * A token the provider has already truncated is left alone — the ellipsis
 * after it means the far end did the masking, and taking the visible head
 * off as well would throw away the one piece of the name that is safe to
 * show.
 *
 * The same rule lives in `src/lib/redact.ts`, and a test says the two agree.
 */
pub(crate) fn redact(label: &str) -> String {
    const PREFIXES: [&str; 10] = [
        "sk-", "sk_", "nvapi-", "gsk_", "xai-", "AIza", "hf_", "r8_", "csk-", "api-",
    ];

    let characters: Vec<char> = label.chars().collect();
    let mut out = String::new();
    let mut index = 0;

    while index < characters.len() {
        let character = characters[index];
        if !character.is_ascii_alphanumeric() && character != '-' && character != '_' {
            out.push(character);
            index += 1;
            continue;
        }

        let start = index;
        while index < characters.len()
            && (characters[index].is_ascii_alphanumeric()
                || characters[index] == '-'
                || characters[index] == '_')
        {
            index += 1;
        }
        let token: String = characters[start..index].iter().collect();

        let already_masked = characters
            .get(index)
            .map(|next| *next == '…')
            .unwrap_or(false)
            || characters
                .get(index..index + 3)
                .map(|rest| rest == ['.', '.', '.'])
                .unwrap_or(false);

        let secret = PREFIXES.iter().any(|prefix| token.starts_with(prefix))
            || (token.chars().count() >= 16 && token.chars().any(|c| c.is_ascii_digit()));

        if already_masked || !secret {
            out.push_str(&token);
        } else {
            out.push_str("***");
        }
    }

    out
}

#[cfg(test)]
mod tests {
    use super::{
        ChatEvent, ChatRequest, Provider, StreamAction, Wire, build_system_prompt, chat_with,
        map_usage, read_payload, redact,
    };
    use crate::provider::Cancellations;
    use serde_json::json;
    use std::io::{BufRead, BufReader, Read, Write};
    use std::net::TcpListener;
    use std::sync::{Arc, Mutex};

    /// A provider to talk to, and what it was asked.
    ///
    /// It is a real HTTP server on a real socket, so the request the app makes
    /// is the request that is checked: the same headers, the same body, the
    /// same stream.
    struct FakeProvider {
        base: String,
        seen: Arc<Mutex<Vec<String>>>,
    }

    impl FakeProvider {
        /// Starts a server that answers a chat with the given lines.
        fn start(answer: Vec<String>) -> FakeProvider {
            let listener = TcpListener::bind("127.0.0.1:0").expect("the socket should bind");
            let port = listener
                .local_addr()
                .expect("the address should be there")
                .port();
            let seen = Arc::new(Mutex::new(Vec::new()));
            let recorder = seen.clone();

            std::thread::spawn(move || {
                for stream in listener.incoming() {
                    let Ok(mut stream) = stream else { break };
                    let mut reader =
                        BufReader::new(stream.try_clone().expect("the stream should clone"));
                    let mut head = String::new();
                    loop {
                        let mut line = String::new();
                        let Ok(count) = reader.read_line(&mut line) else { break };
                        if count == 0 || line == "\r\n" || line == "\n" {
                            break;
                        }
                        head.push_str(&line);
                    }
                    let length: usize = head
                        .lines()
                        .find_map(|line| {
                            line.to_lowercase()
                                .strip_prefix("content-length:")
                                .and_then(|value| value.trim().parse().ok())
                        })
                        .unwrap_or(0);
                    let mut body = vec![0u8; length];
                    let _ = reader.read_exact(&mut body);
                    let body = String::from_utf8_lossy(&body).to_string();
                    if let Ok(mut seen) = recorder.lock() {
                        seen.push(format!("{head}\n{body}"));
                    }

                    let mut response = String::from(
                        "HTTP/1.1 200 OK\r\ncontent-type: text/event-stream\r\n\r\n",
                    );
                    for line in &answer {
                        response.push_str(&format!("data: {line}\n\n"));
                    }
                    response.push_str("data: [DONE]\n\n");
                    let _ = stream.write_all(response.as_bytes());
                    let _ = stream.flush();
                }
            });

            FakeProvider {
                base: format!("http://127.0.0.1:{port}"),
                seen,
            }
        }

        /// Everything the server was asked, joined.
        fn requests(&self) -> String {
            self.seen
                .lock()
                .map(|seen| seen.join("\n---\n"))
                .unwrap_or_default()
        }
    }

    fn a_request(variant: &str) -> ChatRequest {
        ChatRequest {
            messages: vec![super::ChatMessage {
                role: "user".to_string(),
                parts: vec![super::MessagePart {
                    kind: "text".to_string(),
                    text: Some("Hello there".to_string()),
                }],
            }],
            variant: Some(variant.to_string()),
            mode: None,
            folder: None,
            folder_id: None,
            system: None,
            tools: None,
            config: Some(super::ChatConfig {
                model_name: Some("vendor/model".to_string()),
                provider_id: None,
                reasoning: None,
            }),
            request_id: Some("test".to_string()),
        }
    }

    /// A runtime for the tests that have to wait for a socket.
    fn runtime() -> tokio::runtime::Runtime {
        tokio::runtime::Builder::new_current_thread()
            .enable_all()
            .build()
            .expect("the runtime should build")
    }

    /// The whole path: a request goes out, the answer comes back, and the
    /// things the app needs are in it.
    #[test]
    fn a_chat_reaches_the_provider_and_the_answer_comes_back() {
        let fake = FakeProvider::start(vec![
            json!({"model":"vendor/model","choices":[{"delta":{"content":"Hello"}}]}).to_string(),
            json!({"choices":[{"delta":{"content":" there"}}]}).to_string(),
            json!({"usage":{"prompt_tokens":7,"completion_tokens":3,"total_tokens":10}}).to_string(),
        ]);

        let mut events: Vec<ChatEvent> = Vec::new();
        let outcome = runtime().block_on(chat_with(
            &Provider::at(&fake.base),
            "sk-test",
            &a_request("chat"),
            &Cancellations::default(),
            &mut |event| events.push(event),
        ));

        assert!(outcome.is_ok(), "the chat should succeed: {outcome:?}");

        let text: String = events
            .iter()
            .filter_map(|event| match event {
                ChatEvent::TextDelta { delta } => Some(delta.clone()),
                _ => None,
            })
            .collect();
        assert_eq!(text, "Hello there");

        /* The model that answered, and what it cost, are reported. */
        let finished = events
            .iter()
            .find_map(|event| match event {
                ChatEvent::Finish { message_metadata } => Some(message_metadata.clone()),
                _ => None,
            })
            .expect("the stream should finish");
        assert_eq!(finished.usage.unwrap()["totalTokens"], 10);

        /* The request really went out, with the key on it. */
        let request = fake.requests();
        assert!(
            request.contains("authorization: Bearer sk-test"),
            "the key should be on the request"
        );
        assert!(
            request.contains("\"model\":\"vendor/model\""),
            "the model should be on the request"
        );
        assert!(
            request.contains("Hello there"),
            "the message should be on the request"
        );
        assert!(
            request.contains("You are having a conversation"),
            "the system prompt should be on the request"
        );
    }

    /// The rules are the same on both sides, and they are checked before
    /// anything is sent.
    #[test]
    fn a_request_carrying_its_own_system_prompt_is_refused() {
        let fake = FakeProvider::start(vec![]);
        let mut request = a_request("chat");
        request.system = Some("I am a different model.".to_string());

        let outcome = runtime().block_on(chat_with(
            &Provider::at(&fake.base),
            "sk-test",
            &request,
            &Cancellations::default(),
            &mut |_| {},
        ));

        assert!(outcome
            .unwrap_err()
            .contains("system prompt is written by the server"));
        assert!(fake.requests().is_empty(), "nothing should have been sent");
    }

    #[test]
    fn a_chat_carrying_tools_is_refused() {
        let fake = FakeProvider::start(vec![]);
        let mut request = a_request("chat");
        request.tools = Some(json!({ "a_tool": {} }));

        let outcome = runtime().block_on(chat_with(
            &Provider::at(&fake.base),
            "sk-test",
            &request,
            &Cancellations::default(),
            &mut |_| {},
        ));

        assert!(outcome.unwrap_err().contains("cannot carry tools"));
        assert!(fake.requests().is_empty(), "nothing should have been sent");
    }

    #[test]
    fn a_request_with_no_surface_is_refused() {
        let fake = FakeProvider::start(vec![]);
        let mut request = a_request("chat");
        request.variant = None;

        let outcome = runtime().block_on(chat_with(
            &Provider::at(&fake.base),
            "sk-test",
            &request,
            &Cancellations::default(),
            &mut |_| {},
        ));

        assert!(outcome.unwrap_err().contains("No surface selected"));
        assert!(fake.requests().is_empty(), "nothing should have been sent");
    }

    #[test]
    fn a_request_with_no_model_is_refused() {
        let fake = FakeProvider::start(vec![]);
        let mut request = a_request("chat");
        request.config = Some(super::ChatConfig {
            model_name: None,
            provider_id: None,
            reasoning: None,
        });

        let outcome = runtime().block_on(chat_with(
            &Provider::at(&fake.base),
            "sk-test",
            &request,
            &Cancellations::default(),
            &mut |_| {},
        ));

        assert!(outcome.unwrap_err().contains("No model selected"));
        assert!(fake.requests().is_empty(), "nothing should have been sent");
    }

    #[test]
    fn a_chat_is_told_only_that_it_is_a_conversation() {
        let prompt = build_system_prompt("chat", Some("edit"), Some("MyProject"));
        assert!(prompt.contains("You are having a conversation"));
        assert!(!prompt.contains("MyProject"));
    }

    #[test]
    fn a_code_session_is_told_about_its_mode_and_its_folder() {
        let prompt = build_system_prompt("code", Some("plan"), Some("MyProject"));
        assert!(prompt.contains("ordered plan"));
        assert!(prompt.contains("MyProject"));
    }

    #[test]
    fn a_code_session_with_no_folder_is_not_told_about_one() {
        let prompt = build_system_prompt("code", Some("ask"), None);
        assert!(prompt.contains("Answer the question directly"));
        assert!(!prompt.contains("local folder"));
    }

    #[test]
    fn an_unknown_mode_falls_back_to_the_first_one() {
        let prompt = build_system_prompt("code", Some("nonsense"), None);
        assert!(prompt.contains("real local repository"));
    }

    #[test]
    fn the_usage_is_mapped_into_the_app_s_shape() {
        let usage = map_usage(&json!({
            "prompt_tokens": 10,
            "completion_tokens": 4,
            "total_tokens": 14,
            "completion_tokens_details": { "reasoning_tokens": 2 },
            "prompt_tokens_details": { "cached_tokens": 6 }
        }));
        assert_eq!(usage["inputTokens"], 10);
        assert_eq!(usage["outputTokens"], 4);
        assert_eq!(usage["totalTokens"], 14);
        assert_eq!(usage["reasoningTokens"], 2);
        assert_eq!(usage["cachedInputTokens"], 6);
    }

    #[test]
    fn a_key_label_keeps_nothing_of_the_key() {
        assert_eq!(redact("sk-or-v1-abcdefghijkl"), "***");
        assert_eq!(redact("a key: sk-or-v1-abcdefghijkl (free)"), "a key: *** (free)");
    }

    /// A key in any vendor's format is hidden, not only one vendor's prefix.
    #[test]
    fn a_key_of_any_format_is_hidden() {
        assert_eq!(redact("nvapi-abcdefghijklmnopqrst"), "***");
        assert_eq!(redact("AIzaSyABCDEFGHIJKLMNOP"), "***");
        /* A long run with a digit in it is a key until shown otherwise. */
        assert_eq!(redact("account 0123456789abcdef"), "account ***");
    }

    /// A name the provider has already masked is left as it is.
    #[test]
    fn an_already_masked_label_is_left_alone() {
        assert_eq!(redact("sk-or-v1-au7…890"), "sk-or-v1-au7…890");
    }

    #[test]
    fn a_label_with_no_key_in_it_is_left_alone() {
        assert_eq!(redact("Some User"), "Some User");
        assert_eq!(redact("Production key for the client"), "Production key for the client");
    }

    #[test]
    fn a_piece_of_the_answer_is_read() {
        assert_eq!(
            read_payload(Wire::OpenAiChatCompletions, r#"{"choices":[{"delta":{"content":"Hello"}}]}"#),
            StreamAction::Delta("Hello".to_string())
        );
    }

    #[test]
    fn the_end_of_the_stream_is_not_an_answer() {
        assert_eq!(read_payload(Wire::OpenAiChatCompletions, "[DONE]"), StreamAction::Nothing);
        assert_eq!(read_payload(Wire::OpenAiChatCompletions, ""), StreamAction::Nothing);
    }

    #[test]
    fn a_line_that_is_not_json_yet_is_left_alone() {
        assert_eq!(read_payload(Wire::OpenAiChatCompletions, r#"{"choices":[{"del"#), StreamAction::Nothing);
    }

    #[test]
    fn the_model_and_the_usage_are_read() {
        match read_payload(Wire::OpenAiChatCompletions, 
            r#"{"model":"vendor/model","usage":{"prompt_tokens":3,"completion_tokens":1,"total_tokens":4}}"#,
        ) {
            StreamAction::Metadata { model_id, usage } => {
                assert_eq!(model_id.as_deref(), Some("vendor/model"));
                assert_eq!(usage.unwrap()["totalTokens"], 4);
            }
            other => panic!("expected the metadata, got {other:?}"),
        }
    }

    #[test]
    fn a_failure_in_the_middle_of_the_stream_is_read() {
        assert_eq!(
            read_payload(Wire::OpenAiChatCompletions, r#"{"error":{"message":"The model is overloaded."}}"#),
            StreamAction::Failed("The model is overloaded.".to_string())
        );
    }
}
