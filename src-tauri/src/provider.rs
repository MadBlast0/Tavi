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

/// The provider's base address.
///
/// It is the gateway's address, and it can be pointed somewhere else with
/// `OPENROUTER_BASE_URL` — for a gateway of one's own, or for a test that
/// needs a provider to talk to.
#[derive(Clone, Debug)]
pub struct Provider {
    base: String,
}

impl Provider {
    /// The provider the app talks to.
    pub fn new() -> Self {
        Provider {
            base: std::env::var("OPENROUTER_BASE_URL")
                .ok()
                .map(|value| value.trim().trim_end_matches('/').to_string())
                .filter(|value| !value.is_empty())
                .unwrap_or_else(|| "https://openrouter.ai/api/v1".to_string()),
        }
    }

    /// A provider at an address of its own.
    ///
    /// For a test that needs a provider to talk to.
    #[cfg(test)]
    pub fn at(base: &str) -> Self {
        Provider {
            base: base.trim().trim_end_matches('/').to_string(),
        }
    }

    fn catalogue_url(&self) -> String {
        format!("{}/models", self.base)
    }

    fn chat_url(&self) -> String {
        format!("{}/chat/completions", self.base)
    }

    pub(crate) fn key_url(&self) -> String {
        format!("{}/key", self.base)
    }
}

impl Default for Provider {
    fn default() -> Self {
        Provider::new()
    }
}

/// The file the catalogue is cached in.
const CATALOGUE_FILE: &str = "catalogue.json";

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
    pub reasoning_effort: Option<String>,
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
    fn register(&self, id: &str) -> Arc<AtomicBool> {
        let flag = Arc::new(AtomicBool::new(false));
        if let Ok(mut entries) = self.entries.lock() {
            entries.insert(id.to_string(), flag.clone());
        }
        flag
    }

    fn finish(&self, id: &str) {
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
/// that lists last week's models is better than an empty one.
async fn catalogue(app: &AppHandle, provider: &Provider, force: bool) -> Result<String, String> {
    let path = appfile::data_path(app, CATALOGUE_FILE);

    if !force {
        if let Some(path) = path.as_ref() {
            if let Some(raw) = appfile::read_string(path) {
                if let Ok(cached) = serde_json::from_str::<CachedCatalogue>(&raw) {
                    if now_secs().saturating_sub(cached.fetched_at) < CATALOGUE_TTL_SECS {
                        return Ok(cached.body);
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
                        return Ok(cached.body);
                    }
                }
            }
            return Err(error);
        }
    };

    if let Some(path) = path.as_ref() {
        let cached = CachedCatalogue {
            fetched_at: now_secs(),
            body: fetched.clone(),
        };
        if let Ok(json) = serde_json::to_string(&cached) {
            let _ = appfile::write_atomic(path, &json);
        }
    }

    Ok(fetched)
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
#[tauri::command]
pub async fn model_catalogue(app: AppHandle, force: bool) -> Result<String, String> {
    /* The catalogue comes from the provider, and a provider is only reachable
       with a key. Without one there is nothing to list: the list would be of
       models that cannot be called. The rule is here rather than in the
       composer because a rule the client can ignore is not a rule. */
    if crate::keys::get_api_key()?.is_none() {
        return Err("No provider key is set. Add one in the settings.".to_string());
    }
    catalogue(&app, &Provider::new(), force).await
}

/* -------------------------------------------------------------------------- */
/* The effort                                                                  */
/* -------------------------------------------------------------------------- */

/// What a model publishes about the effort it accepts.
struct EffortSupport {
    /// The levels it accepts, when they are published.
    values: Vec<String>,
    /// Whether the levels are published at all.
    published: bool,
    /// Whether the model has a reasoning setting of any kind.
    supported: bool,
}

/// What the catalogue says about one model.
fn effort_support(catalogue: &Value, model: &str) -> EffortSupport {
    let empty = EffortSupport {
        values: Vec::new(),
        published: false,
        supported: false,
    };

    let Some(data) = catalogue.get("data").and_then(Value::as_array) else {
        return empty;
    };
    let Some(entry) = data
        .iter()
        .find(|entry| entry.get("id").and_then(Value::as_str) == Some(model))
    else {
        return empty;
    };

    let parameters: Vec<&str> = entry
        .get("supported_parameters")
        .and_then(Value::as_array)
        .map(|values| values.iter().filter_map(Value::as_str).collect())
        .unwrap_or_default();
    let parameter_accepted = parameters.iter().any(|name| *name == "reasoning_effort");

    let reasoning = entry.get("reasoning");
    let enumerated = reasoning.and_then(|meta| meta.get("supported_efforts"));

    match enumerated {
        Some(Value::Array(values)) => {
            let levels: Vec<String> = values
                .iter()
                .filter_map(Value::as_str)
                .map(str::to_string)
                .collect();
            if levels.is_empty() {
                /* An empty enumeration is not evidence of support. */
                EffortSupport {
                    values: Vec::new(),
                    published: false,
                    supported: parameter_accepted,
                }
            } else {
                EffortSupport {
                    values: levels,
                    published: true,
                    supported: true,
                }
            }
        }
        _ if parameter_accepted => EffortSupport {
            /* Accepted by the gateway, level set not published for this model. */
            values: Vec::new(),
            published: false,
            supported: true,
        },
        _ => EffortSupport {
            values: Vec::new(),
            published: false,
            supported: false,
        },
    }
}

/// Checks an effort against what the model publishes, and refuses what it does
/// not accept.
///
/// A level that cannot be verified is refused rather than sent: a silently
/// downgraded effort is indistinguishable from the model simply running at a
/// lower setting.
fn check_effort(catalogue: &Value, model: &str, effort: &str) -> Result<(), String> {
    let support = effort_support(catalogue, model);

    if support.published {
        if support.values.iter().any(|value| value == effort) {
            return Ok(());
        }
        return Err(format!(
            "This model does not accept effort \"{effort}\". It accepts: {}.",
            support.values.join(", ")
        ));
    }

    if support.supported {
        return Err(
            "This model's effort levels are not published, so that setting cannot be verified. Use the provider default instead."
                .to_string(),
        );
    }

    Err("This model does not support a reasoning-effort setting.".to_string())
}

/* -------------------------------------------------------------------------- */
/* The chat                                                                    */
/* -------------------------------------------------------------------------- */

/// The messages, in the provider's shape.
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
    let provider = Provider::new();

    let key = crate::keys::get_api_key()
        .map_err(|error| error)?
        .ok_or("No provider key is set. Add one in the settings.")?;

    /* The catalogue is only fetched when there is an effort to check against
       it, because a request that names no effort does not need it. */
    let catalogue = if request
        .config
        .as_ref()
        .and_then(|config| config.reasoning_effort.as_deref())
        .map(str::trim)
        .filter(|effort| !effort.is_empty())
        .is_some()
    {
        let raw = catalogue(&app, &provider, false).await.unwrap_or_default();
        Some(serde_json::from_str::<Value>(&raw).unwrap_or(Value::Null))
    } else {
        None
    };

    chat_with(
        &provider,
        &key,
        &request,
        catalogue,
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
    catalogue: Option<Value>,
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

    let effort = request
        .config
        .as_ref()
        .and_then(|config| config.reasoning_effort.as_deref())
        .map(str::trim)
        .filter(|effort| !effort.is_empty())
        .map(str::to_string);

    let mut body = json!({
        "model": model,
        "messages": provider_messages(&request, &build_system_prompt(
            &variant,
            request.mode.as_deref(),
            request.folder.as_deref(),
        )),
        "stream": true,
    });

    if let Some(effort) = effort.as_deref() {
        let published = catalogue.clone().unwrap_or(Value::Null);
        check_effort(&published, &model, effort)?;
        body["reasoning"] = json!({ "effort": effort });
    }

    let request_id = request
        .request_id
        .clone()
        .unwrap_or_else(|| "chat".to_string());
    let cancelled = cancellations.register(&request_id);

    let outcome = stream(provider, &body, key, &cancelled, on_event).await;
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
fn read_payload(payload: &str) -> StreamAction {
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

/// Sends the request and reads the reply.
async fn stream<F>(
    provider: &Provider,
    body: &Value,
    key: &str,
    cancelled: &Arc<AtomicBool>,
    on_event: &mut F,
) -> Result<(), String>
where
    F: FnMut(ChatEvent),
{
    let response = http()
        .post(provider.chat_url())
        .bearer_auth(key)
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

            match read_payload(payload) {
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

/// What the provider says about the key.
///
/// The key itself is never in the answer, and the label is redacted: a key is
/// shown as the first few characters and nothing else.
#[tauri::command]
pub async fn key_status() -> Result<Value, String> {
    let provider = Provider::new();
    let Some(key) = crate::keys::get_api_key().map_err(|error| error)? else {
        return Ok(json!({ "valid": false, "reason": "No key configured." }));
    };

    let response = http()
        .get(provider.key_url())
        .bearer_auth(&key)
        .send()
        .await
        .map_err(|e| format!("Could not reach the provider: {e}"))?;

    if !response.status().is_success() {
        return Ok(json!({ "valid": false }));
    }

    let body = response
        .text()
        .await
        .map_err(|e| format!("Could not read the provider's answer: {e}"))?;
    let Ok(raw) = serde_json::from_str::<Value>(&body) else {
        return Ok(json!({ "valid": false }));
    };

    /* The answer is nested under `data`, but a gateway in front of the provider
       may answer flat. Both are read, and neither is invented. Reading only
       the top level meant the account name was never found. */
    let data = raw.get("data").unwrap_or(&raw);

    let label = data
        .get("label")
        .and_then(Value::as_str)
        .map(|label| redact(label));

    Ok(json!({
        "valid": true,
        "label": label,
        "limit": data.get("limit"),
        "remaining": data.get("remaining"),
        "usage": data.get("usage"),
        "isFreeTier": data.get("is_free_tier"),
    }))
}

/// Hides a key in a label.
///
/// The whole key is replaced, not most of it: a key is shown as `sk-***` or
/// not at all.
pub(crate) fn redact(label: &str) -> String {
    let mut out = String::new();
    let mut rest = label;
    while let Some(position) = rest.find("sk-") {
        out.push_str(&rest[..position]);
        let after = &rest[position + 3..];
        let length = after
            .chars()
            .take_while(|character| {
                character.is_ascii_alphanumeric() || *character == '-' || *character == '_'
            })
            .count();
        if length >= 6 {
            out.push_str("sk-***");
            rest = &after[length..];
        } else {
            out.push_str("sk-");
            rest = after;
        }
    }
    out.push_str(rest);
    out
}

#[cfg(test)]
mod tests {
    use super::{
        ChatEvent, ChatRequest, Provider, StreamAction, build_system_prompt, check_effort,
        chat_with, effort_support, map_usage, read_payload, redact,
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
            system: None,
            tools: None,
            config: Some(super::ChatConfig {
                model_name: Some("vendor/model".to_string()),
                reasoning_effort: None,
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
            None,
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
            None,
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
            None,
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
            None,
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
            reasoning_effort: None,
        });

        let outcome = runtime().block_on(chat_with(
            &Provider::at(&fake.base),
            "sk-test",
            &request,
            None,
            &Cancellations::default(),
            &mut |_| {},
        ));

        assert!(outcome.unwrap_err().contains("No model selected"));
        assert!(fake.requests().is_empty(), "nothing should have been sent");
    }

    /// An effort the model does not publish is refused, and nothing is sent.
    #[test]
    fn an_unpublished_effort_is_refused_before_anything_is_sent() {
        let fake = FakeProvider::start(vec![]);
        let mut request = a_request("chat");
        request.config = Some(super::ChatConfig {
            model_name: Some("vendor/model".to_string()),
            reasoning_effort: Some("xhigh".to_string()),
        });

        let outcome = runtime().block_on(chat_with(
            &Provider::at(&fake.base),
            "sk-test",
            &request,
            Some(json!({
                "data": [{
                    "id": "vendor/model",
                    "supported_parameters": ["reasoning", "reasoning_effort"],
                    "reasoning": { "supported_efforts": ["low", "medium", "high"] }
                }]
            })),
            &Cancellations::default(),
            &mut |_| {},
        ));

        assert!(outcome.unwrap_err().contains("does not accept effort"));
        assert!(fake.requests().is_empty(), "nothing should have been sent");
    }

    /// An effort the model does publish goes out, on the request.
    #[test]
    fn a_published_effort_goes_out_on_the_request() {
        let fake =
            FakeProvider::start(vec![json!({"choices":[{"delta":{"content":"ok"}}]}).to_string()]);
        let mut request = a_request("chat");
        request.config = Some(super::ChatConfig {
            model_name: Some("vendor/model".to_string()),
            reasoning_effort: Some("high".to_string()),
        });

        runtime()
            .block_on(chat_with(
                &Provider::at(&fake.base),
                "sk-test",
                &request,
                Some(json!({
                    "data": [{
                        "id": "vendor/model",
                        "supported_parameters": ["reasoning", "reasoning_effort"],
                        "reasoning": { "supported_efforts": ["low", "medium", "high"] }
                    }]
                })),
                &Cancellations::default(),
                &mut |_| {},
            ))
            .expect("the chat should succeed");

        assert!(fake.requests().contains(r#""reasoning":{"effort":"high"}"#));
    }

    fn catalogue() -> serde_json::Value {
        json!({
            "data": [
                {
                    "id": "vendor/enumerated",
                    "supported_parameters": ["reasoning", "reasoning_effort"],
                    "reasoning": { "supported_efforts": ["high", "low", "medium"] }
                },
                {
                    "id": "vendor/unnamed",
                    "supported_parameters": ["reasoning", "reasoning_effort"]
                },
                {
                    "id": "vendor/plain",
                    "supported_parameters": ["tools"]
                }
            ]
        })
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
    fn a_published_level_is_accepted() {
        assert!(check_effort(&catalogue(), "vendor/enumerated", "high").is_ok());
    }

    #[test]
    fn a_level_the_model_does_not_publish_is_refused() {
        let error = check_effort(&catalogue(), "vendor/enumerated", "xhigh")
            .expect_err("xhigh is not published for this model");
        assert!(error.contains("does not accept effort"));
        assert!(error.contains("high"));
    }

    #[test]
    fn a_level_that_cannot_be_verified_is_refused() {
        let error = check_effort(&catalogue(), "vendor/unnamed", "high")
            .expect_err("the levels are not published for this model");
        assert!(error.contains("not published"));
    }

    #[test]
    fn a_model_with_no_reasoning_at_all_is_refused() {
        let error = check_effort(&catalogue(), "vendor/plain", "high")
            .expect_err("this model has no reasoning setting");
        assert!(error.contains("does not support"));
    }

    #[test]
    fn a_model_that_is_not_in_the_catalogue_is_refused() {
        let error = check_effort(&catalogue(), "vendor/missing", "high")
            .expect_err("the model is not in the catalogue");
        assert!(error.contains("does not support"));
    }

    #[test]
    fn the_levels_are_read_from_the_catalogue() {
        let support = effort_support(&catalogue(), "vendor/enumerated");
        assert!(support.published);
        assert!(support.supported);
        assert_eq!(support.values, vec!["high", "low", "medium"]);
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
        assert_eq!(redact("sk-or-v1-abcdefghijkl"), "sk-***");
        assert_eq!(redact("a key: sk-or-v1-abcdefghijkl (free)"), "a key: sk-*** (free)");
    }

    #[test]
    fn a_label_with_no_key_in_it_is_left_alone() {
        assert_eq!(redact("Some User"), "Some User");
    }

    #[test]
    fn a_piece_of_the_answer_is_read() {
        assert_eq!(
            read_payload(r#"{"choices":[{"delta":{"content":"Hello"}}]}"#),
            StreamAction::Delta("Hello".to_string())
        );
    }

    #[test]
    fn the_end_of_the_stream_is_not_an_answer() {
        assert_eq!(read_payload("[DONE]"), StreamAction::Nothing);
        assert_eq!(read_payload(""), StreamAction::Nothing);
    }

    #[test]
    fn a_line_that_is_not_json_yet_is_left_alone() {
        assert_eq!(read_payload(r#"{"choices":[{"del"#), StreamAction::Nothing);
    }

    #[test]
    fn the_model_and_the_usage_are_read() {
        match read_payload(
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
            read_payload(r#"{"error":{"message":"The model is overloaded."}}"#),
            StreamAction::Failed("The model is overloaded.".to_string())
        );
    }
}
