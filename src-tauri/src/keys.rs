//! The provider keys.
//!
//! A key is not a string. It is a credential with an identity: it belongs to a
//! provider, it has a name the user gave it, and it is one of possibly
//! several for that provider — a personal key and a work key for the same
//! provider, which is the case every console has to answer for and the one
//! the reference design is about.
//!
//! Two places hold it, and they hold different things.
//!
//! - **The secret** is in the operating system's credential store, under
//!   `api-key:<id>`. It is written there, read back only where a provider's
//!   request is made, and never handed to the webview.
//! - **The metadata** is in a sidecar file beside the app's other data. The
//!   credential store cannot be enumerated — there is no "list" in it — and
//!   cannot hold portable metadata, so a sidecar is the only design that
//!   works. It holds no secret.
//!
//! Which key a request goes out with is an explicit pointer, never an
//! inference. "The newest one wins", "the first in the list" and "the one the
//! provider last accepted" all silently change which account is billed.
//!
//! The providers are listed here rather than read from a file so that the
//! credential store is the only place a key is written and the only place it
//! is read from. The list mirrors `src/lib/providers.ts`, which the website's
//! server and the pane both use, so the two sides call the same providers by
//! the same names — and a test says the two tables agree.

use std::collections::BTreeMap;
use std::sync::atomic::{AtomicU64, Ordering};
use std::time::{SystemTime, UNIX_EPOCH};

use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use tauri::AppHandle;

use crate::appfile;

/// The credential service the keys live under.
const KEY_SERVICE: &str = "tavi";

/// The prefix a credential is filed under.
///
/// The key's own id is part of the credential's name rather than of a file
/// beside it, so one credential store holds every key without a second place
/// to keep in step with it.
const KEY_USER_PREFIX: &str = "api-key:";

/// The namespace the key was stored under before the app was renamed.
const LEGACY_KEY_SERVICE: &str = "ai-app";

/// The single credential name the key had before there was more than one.
const LEGACY_KEY_USER: &str = "openrouter-api-key";

/// The provider whose key the app's own requests use.
const ACTIVE_PROVIDER: &str = "openrouter";

/// The sidecar, beside the app's other data.
const INDEX_FILE: &str = "provider-keys.json";

/// The shape of the sidecar this build understands.
const INDEX_VERSION: u32 = 1;

/// How a provider takes a key.
#[derive(Clone, Copy, PartialEq, Eq)]
enum Auth {
    /// `Authorization: Bearer <key>`.
    Bearer,
    /// `x-api-key: <key>`, with the version header Anthropic requires.
    ApiKeyHeader,
}

/// How a provider's key can be checked.
#[derive(Clone, Copy, PartialEq, Eq)]
enum Validation {
    /// A free request that answers "no" for a bad key.
    IdentityEndpoint,
    /// No such endpoint. The only way to find out is to make a real
    /// inference, which costs the user's quota, so it is only ever run when
    /// the user asks for it.
    InferenceProbe,
}

/// A provider the app can hold a key for.
struct Provider {
    id: &'static str,
    label: &'static str,
    /// Where the provider's keys are made.
    ///
    /// The pane reads this from the TypeScript table; it is here so the two
    /// tables can be compared, field by field, by a test.
    #[allow(dead_code)]
    keys_url: &'static str,
    /// The environment variable this provider's key is named in.
    ///
    /// It is what the website's server reads the key from, and what the
    /// development key file is read for, so both halves of the app are given a
    /// key by the same name.
    env_var: &'static str,
    /// How the provider takes the key.
    auth: Auth,
    /// The endpoint that answers "is this key good, and whose is it".
    identity_url: &'static str,
    /// The endpoint a real request goes to, for the providers whose check
    /// costs one.
    inference_url: &'static str,
    /// Whether the provider's answer carries an account name and a limit.
    reports_usage: bool,
    /// How the key can be checked, and what it costs to check it.
    validation: Validation,
}

const PROVIDERS: &[Provider] = &[
    Provider {
        id: "openrouter",
        label: "OpenRouter",
        keys_url: "https://openrouter.ai/keys",
        env_var: "OPENROUTER_API_KEY",
        auth: Auth::Bearer,
        identity_url: "https://openrouter.ai/api/v1/key",
        inference_url: "https://openrouter.ai/api/v1/chat/completions",
        reports_usage: true,
        validation: Validation::IdentityEndpoint,
    },
    Provider {
        id: "anthropic",
        label: "Anthropic",
        keys_url: "https://console.anthropic.com/settings/keys",
        env_var: "ANTHROPIC_API_KEY",
        auth: Auth::ApiKeyHeader,
        identity_url: "https://api.anthropic.com/v1/models",
        inference_url: "https://api.anthropic.com/v1/messages",
        reports_usage: false,
        validation: Validation::IdentityEndpoint,
    },
    Provider {
        id: "openai",
        label: "OpenAI",
        keys_url: "https://platform.openai.com/api-keys",
        env_var: "OPENAI_API_KEY",
        auth: Auth::Bearer,
        identity_url: "https://api.openai.com/v1/models",
        inference_url: "https://api.openai.com/v1/chat/completions",
        reports_usage: false,
        validation: Validation::IdentityEndpoint,
    },
    Provider {
        id: "nvidia-nim",
        label: "NVIDIA NIM",
        keys_url: "https://build.nvidia.com/",
        env_var: "NVIDIA_API_KEY",
        auth: Auth::Bearer,
        /* Public. `GET /v1/models` answers 200 with the whole catalogue to
           any caller, with a bad key and with no key at all, so it cannot tell
           a good key from a bad one and must not be used as a check. */
        identity_url: "https://integrate.api.nvidia.com/v1/models",
        inference_url: "https://integrate.api.nvidia.com/v1/chat/completions",
        reports_usage: false,
        validation: Validation::InferenceProbe,
    },
];

fn provider_for(id: &str) -> Option<&'static Provider> {
    PROVIDERS.iter().find(|provider| provider.id == id)
}

/* -------------------------------------------------------------------------- */
/* The sidecar                                                                 */
/* -------------------------------------------------------------------------- */

/// What a provider says about a key.
///
/// Every field is optional, and absent means "the provider did not say". A
/// missing answer is never rendered as a zero.
#[derive(Debug, Clone, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct Standing {
    #[serde(default)]
    valid: Option<bool>,
    #[serde(default)]
    check_reason: Option<String>,
    #[serde(default)]
    checked_at: Option<u64>,
    #[serde(default)]
    account: Option<String>,
    #[serde(default)]
    organization_id: Option<String>,
    #[serde(default)]
    workspace_id: Option<String>,
    #[serde(default)]
    creator_user_id: Option<String>,
    #[serde(default)]
    expires_at: Option<u64>,
    #[serde(default)]
    limit: Option<f64>,
    #[serde(default)]
    limit_remaining: Option<f64>,
    #[serde(default)]
    limit_reset: Option<String>,
    #[serde(default)]
    limit_currency: Option<String>,
    #[serde(default)]
    usage: Option<f64>,
    #[serde(default)]
    usage_in_window: Option<f64>,
    #[serde(default)]
    is_free_tier: Option<bool>,
}

/// One key's metadata.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct KeyRecord {
    /// The key's own id. Generated here, and never derived from the secret.
    id: String,
    /// Which provider the key is for.
    provider: String,
    /// The name the user gave the key.
    name: String,
    /// True until the user renames it.
    #[serde(default)]
    name_is_default: bool,
    /// When the app stored it.
    #[serde(default)]
    created_at: u64,
    /// When the app last changed it.
    #[serde(default)]
    updated_at: u64,
    /// When the app last made a request with it.
    #[serde(default)]
    last_used_at: Option<u64>,
    /// The vendor's prefix and the last four characters.
    #[serde(default)]
    masked_value: Option<String>,
    /// What the provider last said.
    #[serde(flatten)]
    standing: Standing,
}

/// One provider's keys, and which of them is in use.
#[derive(Debug, Clone, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct ProviderGroup {
    /// The one key requests go out with.
    #[serde(default)]
    active_key_id: Option<String>,
    /// Every key held for this provider.
    #[serde(default)]
    keys: Vec<KeyRecord>,
}

/// The sidecar itself.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct KeyIndex {
    version: u32,
    #[serde(default)]
    providers: BTreeMap<String, ProviderGroup>,
}

fn index_path(app: &AppHandle) -> Result<std::path::PathBuf, String> {
    appfile::data_path(app, INDEX_FILE)
        .ok_or_else(|| "The app data folder is unavailable.".to_string())
}

/// Reads the sidecar.
///
/// A file that exists and cannot be parsed is a problem to report, not an
/// empty store to overwrite. Only a file that is not there at all means "no
/// keys".
fn read_index(path: &std::path::Path) -> Result<Option<KeyIndex>, String> {
    let Some(raw) = appfile::read_string(path) else {
        return Ok(None);
    };

    let index: KeyIndex = serde_json::from_str(&raw)
        .map_err(|error| format!("The key file could not be read: {error}"))?;

    if index.version != INDEX_VERSION {
        return Err(format!(
            "The key file is version {} and this build understands version {}.",
            index.version, INDEX_VERSION
        ));
    }

    Ok(Some(index))
}

/// Writes the sidecar, atomically, and keeps it to its owner.
fn write_index(path: &std::path::Path, index: &KeyIndex) -> Result<(), String> {
    let text =
        serde_json::to_string_pretty(index).map_err(|error| error.to_string())?;
    appfile::write_private(path, &format!("{text}\n"))
}

/* -------------------------------------------------------------------------- */
/* The credential store                                                        */
/* -------------------------------------------------------------------------- */

fn entry_for(account: &str) -> Result<keyring::Entry, String> {
    keyring::Entry::new(KEY_SERVICE, account)
        .map_err(|e| format!("Credential store unavailable: {e}"))
}

/// Reads a credential, if it is there.
fn read_credential(account: &str) -> Result<Option<String>, String> {
    match entry_for(account)?.get_password() {
        Ok(secret) => Ok(Some(secret)),
        Err(keyring::Error::NoEntry) => Ok(None),
        Err(e) => Err(format!("Could not read key: {e}")),
    }
}

/// Writes a credential.
fn write_credential(account: &str, secret: &str) -> Result<(), String> {
    entry_for(account)?
        .set_password(secret)
        .map_err(|e| format!("Could not store key: {e}"))
}

/// Takes a credential away.
fn delete_credential(account: &str) -> Result<(), String> {
    match entry_for(account)?.delete_credential() {
        Ok(()) | Err(keyring::Error::NoEntry) => Ok(()),
        Err(e) => Err(format!("Could not clear key: {e}")),
    }
}

/// Move a key from one name to another, if it is in the first.
///
/// The key is written to the new name before the old one is removed: a key
/// that exists in both places is one the user has already set, and losing it
/// would be worse than leaving a duplicate behind. A key that is in neither
/// place is simply absent, which is what an app that has never had a key
/// looks like.
fn migrate_key(
    from_service: &str,
    from_user: &str,
    to_user: &str,
) -> Result<Option<String>, String> {
    let legacy = keyring::Entry::new(from_service, from_user)
        .map_err(|e| format!("Credential store unavailable: {e}"))?;
    let key = match legacy.get_password() {
        Ok(key) => key,
        Err(keyring::Error::NoEntry) => return Ok(None),
        Err(e) => return Err(format!("Could not read key: {e}")),
    };

    keyring::Entry::new(KEY_SERVICE, to_user)
        .map_err(|e| format!("Credential store unavailable: {e}"))?
        .set_password(&key)
        .map_err(|e| format!("Could not store key: {e}"))?;

    let _ = legacy.delete_credential();
    Ok(Some(key))
}

/* -------------------------------------------------------------------------- */
/* Ids and masking                                                             */
/* -------------------------------------------------------------------------- */

static COUNTER: AtomicU64 = AtomicU64::new(0);

/// An id the app made up.
///
/// Never derived from the secret and never from the name: the same rule the
/// app already applies to a folder's handle, for the same reason.
fn mint_id() -> String {
    let nanos = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|since| since.as_nanos() as u64)
        .unwrap_or(0);
    let count = COUNTER.fetch_add(1, Ordering::Relaxed);
    format!("key_{nanos:016x}{count:04x}")
}

fn now_secs() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|since| since.as_secs())
        .unwrap_or(0)
}

/// The vendor's prefix at the head of a key.
fn leading_prefix(head: &str) -> Option<String> {
    let characters: Vec<char> = head.chars().collect();
    let mut index = 0;

    let mut letters = String::new();
    while index < characters.len() && characters[index].is_ascii_alphabetic() {
        letters.push(characters[index]);
        index += 1;
    }
    if letters.is_empty() {
        return None;
    }

    let separator = *characters.get(index)?;
    if separator != '-' && separator != '_' {
        return None;
    }
    index += 1;

    let mut tail = String::from(separator);
    while index < characters.len()
        && (characters[index].is_ascii_alphanumeric() || characters[index] == '-')
    {
        tail.push(characters[index]);
        index += 1;
    }

    Some(format!("{letters}{tail}"))
}

/// A key, shown as its prefix and its last four characters.
///
/// Computed when the key is written, because that is the only moment the app
/// holds the secret. The app never reads a stored key back out of the
/// credential store, so it cannot ask the provider for a mask it did not
/// issue.
fn mask_secret(secret: &str) -> String {
    let trimmed = secret.trim();
    let characters: Vec<char> = trimmed.chars().collect();
    /* A secret this short is not a provider key, and masking all but four
       characters of it would show most of it. */
    if characters.len() <= 8 {
        return "…".to_string();
    }
    let head: String = characters.iter().take(12).collect();
    let prefix = leading_prefix(&head).unwrap_or_else(|| characters.iter().take(3).collect());
    let tail: String = characters[characters.len() - 4..].iter().collect();
    format!("{prefix}…{tail}")
}

/* -------------------------------------------------------------------------- */
/* Where a key came from                                                       */
/* -------------------------------------------------------------------------- */

/// Where a key came from.
#[derive(Clone, Copy, PartialEq, Eq, Debug)]
enum Source {
    /// The operating system's credential store.
    Store,
    /// The development key file.
    DevFile,
}

impl Source {
    fn as_str(self) -> &'static str {
        match self {
            Source::Store => "keyring",
            Source::DevFile => "dev-file",
        }
    }
}

/// Where the development key file is.
///
/// The file sits at the root of the repository and this crate is one directory
/// below it, so the path is fixed when the binary is built rather than guessed
/// at when it runs.
#[cfg(debug_assertions)]
fn dev_keys_file() -> std::path::PathBuf {
    std::path::Path::new(env!("CARGO_MANIFEST_DIR"))
        .parent()
        .unwrap_or_else(|| std::path::Path::new("."))
        .join(".env.local")
}

/// The key the development file holds for a provider, if it holds one.
///
/// This is the file the website's server reads its key from. It is here so a
/// developer does not have to paste the same key into the credential store on
/// every machine they work on.
///
/// The key is read here, in Rust, and never crosses into the webview, so the
/// rule that a key never enters JavaScript still holds. The credential store
/// is still the first place looked in: a key the user has set in the app wins
/// over the file, and removing the key from the file removes it.
///
/// A release build does not contain any of this.
#[cfg(debug_assertions)]
fn dev_key(provider: &Provider) -> Option<String> {
    let text = std::fs::read_to_string(dev_keys_file()).ok()?;
    for line in text.lines() {
        let line = line.trim();
        if line.is_empty() || line.starts_with('#') {
            continue;
        }
        let Some((name, value)) = line.split_once('=') else {
            continue;
        };
        if name.trim() != provider.env_var {
            continue;
        }
        let value = value.trim().trim_matches(|c| c == '"' || c == '\'').trim();
        if value.is_empty() {
            return None;
        }
        return Some(value.to_string());
    }
    None
}

/// A release build has no development file to read.
#[cfg(not(debug_assertions))]
fn dev_key(_provider: &Provider) -> Option<String> {
    None
}

/* -------------------------------------------------------------------------- */
/* The index, and the migration into it                                        */
/* -------------------------------------------------------------------------- */

/// The index, migrated into shape if it has to be.
fn ensure_index(path: &std::path::Path) -> Result<KeyIndex, String> {
    match read_index(path)? {
        Some(index) => Ok(index),
        None => migrate(path),
    }
}

/// Moves the keys the app used to keep — one per provider, filed under the
/// provider's name — into the shape it keeps now: a key of its own with an
/// id, and a sidecar that says which one is in use.
///
/// All or nothing. The old entries are removed only once the sidecar has been
/// written, and a failure to write it puts the new entries back and leaves
/// the old ones where they were: a half-migrated store leaves the app unable
/// to find a key it has.
fn migrate(path: &std::path::Path) -> Result<KeyIndex, String> {
    let mut index = KeyIndex {
        version: INDEX_VERSION,
        providers: BTreeMap::new(),
    };
    let mut written: Vec<String> = Vec::new();

    for provider in PROVIDERS {
        let old_account = format!("{KEY_USER_PREFIX}{}", provider.id);

        /* The secret, wherever it is. The two names the key had before there
           was more than one provider are moved rather than asked for again. */
        let found = match read_credential(&old_account)? {
            Some(secret) => Some(secret),
            None if provider.id == ACTIVE_PROVIDER => {
                match migrate_key(KEY_SERVICE, LEGACY_KEY_USER, &old_account)? {
                    Some(secret) => Some(secret),
                    None => migrate_key(LEGACY_KEY_SERVICE, LEGACY_KEY_USER, &old_account)?,
                }
            }
            None => None,
        };

        let Some(secret) = found else {
            continue;
        };

        let id = mint_id();
        let account = format!("{KEY_USER_PREFIX}{id}");

        /* The new entry is written first and read back, so a credential store
           that accepted the write but kept nothing is caught here rather than
           later. */
        write_credential(&account, &secret)?;
        written.push(account.clone());
        if read_credential(&account)?.as_deref() != Some(secret.as_str()) {
            let _ = delete_credential(&account);
            return Err("The key could not be stored in the credential store.".to_string());
        }

        let now = now_secs();
        let record = KeyRecord {
            id: id.clone(),
            provider: provider.id.to_string(),
            name: provider.label.to_string(),
            name_is_default: true,
            created_at: now,
            updated_at: now,
            last_used_at: None,
            masked_value: Some(mask_secret(&secret)),
            standing: Standing {
                valid: None,
                check_reason: Some("not-checked".to_string()),
                checked_at: None,
                ..Default::default()
            },
        };

        let group = index
            .providers
            .entry(provider.id.to_string())
            .or_default();
        group.active_key_id = Some(id);
        group.keys.push(record);
    }

    /* The sidecar is written before the old entries are removed, so a failure
       here leaves the old keys exactly where they were. */
    if let Err(error) = write_index(path, &index) {
        for account in &written {
            let _ = delete_credential(account);
        }
        return Err(error);
    }

    for provider in PROVIDERS {
        let _ = delete_credential(&format!("{KEY_USER_PREFIX}{}", provider.id));
    }

    Ok(index)
}

/* -------------------------------------------------------------------------- */
/* Asking a provider about a key                                               */
/* -------------------------------------------------------------------------- */

/// A number the provider published.
fn number(value: Option<&Value>) -> Option<f64> {
    value.and_then(Value::as_f64)
}

/// A string the provider published.
fn text(value: Option<&Value>) -> Option<String> {
    value
        .and_then(Value::as_str)
        .map(|value| value.trim().to_string())
        .filter(|value| !value.is_empty())
}

/// A timestamp the provider published, in unix seconds.
fn timestamp(value: Option<&Value>) -> Option<u64> {
    match value {
        Some(Value::Number(number)) => number.as_f64().map(|value| value as u64),
        Some(Value::String(text)) => {
            let trimmed = text.trim();
            if let Ok(seconds) = trimmed.parse::<u64>() {
                return Some(seconds);
            }
            // An ISO-8601 instant.
            chrono_free_timestamp(trimmed)
        }
        _ => None,
    }
}

/// An ISO-8601 instant, in unix seconds.
///
/// Written out rather than pulled in as a dependency: the only timestamp the
/// app reads from a provider is an expiry date, and a dependency for one
/// field is not a trade worth making.
fn chrono_free_timestamp(text: &str) -> Option<u64> {
    // `2026-01-31T12:00:00Z` and `2026-01-31T12:00:00.000Z` are the shapes
    // providers publish. Anything else is not read.
    let (date, time) = text.split_once('T')?;
    let mut date_parts = date.split('-');
    let year: i64 = date_parts.next()?.parse().ok()?;
    let month: i64 = date_parts.next()?.parse().ok()?;
    let day: i64 = date_parts.next()?.parse().ok()?;

    let time = time.trim_end_matches('Z');
    let time = time.split(['+', '-']).next().unwrap_or(time);
    let time = time.split('.').next().unwrap_or(time);
    let mut time_parts = time.split(':');
    let hour: i64 = time_parts.next().unwrap_or("0").parse().ok()?;
    let minute: i64 = time_parts.next().unwrap_or("0").parse().ok()?;
    let second: i64 = time_parts.next().unwrap_or("0").parse().ok()?;

    let days = days_from_civil(year, month, day);
    let seconds = days * 86_400 + hour * 3_600 + minute * 60 + second;
    u64::try_from(seconds).ok()
}

/// Days since the epoch, from a civil date.
fn days_from_civil(year: i64, month: i64, day: i64) -> i64 {
    let year = if month <= 2 { year - 1 } else { year };
    let era = if year >= 0 { year } else { year - 399 } / 400;
    let year_of_era = year - era * 400;
    let month = if month > 2 { month - 3 } else { month + 9 };
    let day_of_year = (153 * month + 2) / 5 + day - 1;
    let day_of_era = year_of_era * 365 + year_of_era / 4 - year_of_era / 100 + day_of_year;
    era * 146_097 + day_of_era - 719_468
}

/// The standing a provider's answer gives.
///
/// The rules, which are the same on both sides of the app:
///
/// - 401 and 403 mean the provider refused the key.
/// - 402 means the account has no credit left.
/// - 429 means the key is good and the account is being limited.
/// - 404 is never a key problem — it is about a model, a route or a
///   workspace — so it is never "not accepted".
/// - anything else means the answer was not about the key.
fn standing_for_status(status: u16, checked_at: u64) -> Standing {
    match status {
        401 | 403 => Standing {
            valid: Some(false),
            check_reason: Some("not-accepted".to_string()),
            checked_at: Some(checked_at),
            ..Default::default()
        },
        402 => Standing {
            valid: Some(false),
            check_reason: Some("no-credit".to_string()),
            checked_at: Some(checked_at),
            ..Default::default()
        },
        429 => Standing {
            valid: Some(true),
            check_reason: Some("rate-limited".to_string()),
            checked_at: Some(checked_at),
            ..Default::default()
        },
        _ => Standing {
            valid: None,
            check_reason: Some("not-checked".to_string()),
            checked_at: Some(checked_at),
            ..Default::default()
        },
    }
}

/// Where a provider's key page is asked of.
fn identity_url(provider: &Provider) -> String {
    if provider.id == ACTIVE_PROVIDER {
        return crate::provider::Provider::new().key_url();
    }
    provider.identity_url.to_string()
}

/// What a provider says about a key.
///
/// The secret is never in the answer, and the account name is redacted: a
/// label is free-form text from the network and is not trusted to stay
/// masked.
///
/// A provider whose check costs a request is only ever asked when the user
/// asks for it. The list refresh never spends anything.
async fn check(provider: &Provider, key: &str, spend: bool) -> Result<Standing, String> {    let checked_at = now_secs();

    if provider.validation == Validation::InferenceProbe {
        if !spend {
            return Ok(Standing {
                valid: None,
                check_reason: Some("not-checked".to_string()),
                checked_at: Some(checked_at),
                ..Default::default()
            });
        }
        return check_by_inference(provider, key, checked_at).await;
    }

    let url = identity_url(provider);
    let mut request = crate::provider::http().get(&url);
    request = match provider.auth {
        Auth::Bearer => request.bearer_auth(key),
        Auth::ApiKeyHeader => request
            .header("x-api-key", key)
            .header("anthropic-version", "2023-06-01"),
    };

    let response = request
        .send()
        .await
        .map_err(|e| format!("Could not reach {}: {e}", provider.label))?;

    let status = response.status().as_u16();
    if status != 200 {
        return Ok(standing_for_status(status, checked_at));
    }

    /* The organisation and the workspace come back as headers, and are the
       cheap substitute for an admin API that would need an admin key. */
    let organization_id = response
        .headers()
        .get("anthropic-organization-id")
        .and_then(|value| value.to_str().ok())
        .map(|value| value.to_string());
    let workspace_id = response
        .headers()
        .get("anthropic-workspace-id")
        .and_then(|value| value.to_str().ok())
        .map(|value| value.to_string());

    let mut standing = Standing {
        valid: Some(true),
        check_reason: None,
        checked_at: Some(checked_at),
        organization_id,
        workspace_id,
        ..Default::default()
    };

    if !provider.reports_usage {
        return Ok(standing);
    }

    let body = response
        .text()
        .await
        .map_err(|e| format!("Could not read the provider's answer: {e}"))?;
    let Ok(raw) = serde_json::from_str::<Value>(&body) else {
        return Ok(standing);
    };

    /* The answer is nested under `data`, but a gateway in front of the
       provider may answer flat. Both are read, and neither is invented. */
    let data = raw.get("data").unwrap_or(&raw);

    standing.account = text(data.get("label")).map(|label| crate::provider::redact(&label));
    standing.organization_id = standing
        .organization_id
        .or_else(|| text(data.get("organization_id")));
    standing.workspace_id = standing
        .workspace_id
        .or_else(|| text(data.get("workspace_id")));
    standing.creator_user_id = text(data.get("creator_user_id"));
    standing.expires_at = timestamp(data.get("expires_at"));
    standing.limit = number(data.get("limit"));
    standing.limit_remaining = number(data.get("limit_remaining"));
    standing.limit_reset = text(data.get("limit_reset")).filter(|window| {
        matches!(window.as_str(), "daily" | "weekly" | "monthly")
    });
    standing.usage = number(data.get("usage"));
    standing.is_free_tier = data.get("is_free_tier").and_then(Value::as_bool);

    /* OpenRouter's credits are US dollars. That is a fact about OpenRouter
       and not an assumption the formatter makes about whatever number it is
       handed, so it is written here and nowhere else — and it is written
       whether or not a cap is set, because the all-time spend is in the same
       unit as the cap. */
    standing.limit_currency = Some("USD".to_string());

    /* The figure that belongs beside the cap is the usage **in the cap's
       window**, not the all-time usage. A cap that resets monthly compared
       with a lifetime total is a sentence about two different things. */
    standing.usage_in_window = match (standing.limit, standing.limit_remaining) {
        (Some(limit), Some(remaining)) => Some(limit - remaining),
        _ => match standing.limit_reset.as_deref() {
            Some("daily") => number(data.get("usage_daily")),
            Some("weekly") => number(data.get("usage_weekly")),
            Some("monthly") => number(data.get("usage_monthly")),
            _ => None,
        },
    };

    Ok(standing)
}

/// The first model the provider publishes.
///
/// Taken from the provider's own catalogue rather than written down here,
/// because a model that has been retired is answered with a status that says
/// nothing about the key — and one already has been.
async fn first_published_model(provider: &Provider) -> Result<String, String> {
    let response = crate::provider::http()
        .get(provider.identity_url)
        .send()
        .await
        .map_err(|e| format!("Could not reach {}: {e}", provider.label))?;

    if !response.status().is_success() {
        return Err(format!(
            "The provider answered with {}.",
            response.status().as_u16()
        ));
    }

    let body = response
        .text()
        .await
        .map_err(|e| format!("Could not read the provider's answer: {e}"))?;
    let Ok(raw) = serde_json::from_str::<Value>(&body) else {
        return Err("The provider's catalogue could not be read.".to_string());
    };

    let models = raw
        .get("data")
        .and_then(Value::as_array)
        .ok_or("The provider's catalogue could not be read.")?;

    for model in models {
        if let Some(id) = model.get("id").and_then(Value::as_str) {
            if !id.trim().is_empty() {
                return Ok(id.to_string());
            }
        }
    }

    Err("The provider publishes no models to check the key with.".to_string())
}

/// Checks a key by making one real request.
///
/// The only endpoint that answers "is this key good" is the inference one, so
/// this costs a request — which is why it only runs when the user asks for
/// it, and why the request asks for a single token.
async fn check_by_inference(
    provider: &Provider,
    key: &str,
    checked_at: u64,
) -> Result<Standing, String> {
    let model = first_published_model(provider).await?;

    let body = json!({
        "model": model,
        "messages": [{ "role": "user", "content": "hi" }],
        "max_tokens": 1,
    });

    let response = crate::provider::http()
        .post(provider.inference_url)
        .bearer_auth(key)
        .json(&body)
        .send()
        .await
        .map_err(|e| format!("Could not reach {}: {e}", provider.label))?;

    let status = response.status().as_u16();
    if status != 200 {
        return Ok(standing_for_status(status, checked_at));
    }

    Ok(Standing {
        valid: Some(true),
        check_reason: None,
        checked_at: Some(checked_at),
        ..Default::default()
    })
}

/* -------------------------------------------------------------------------- */
/* The store                                                                   */
/* -------------------------------------------------------------------------- */

/**
 * Stores a key, and the record that finds it.
 *
 * The secret is written first and read back, so a credential store that
 * accepted the write but kept nothing is caught here. The index is written
 * after, and the secret is taken away again if that fails — a secret the
 * index cannot find is one the app can never use again.
 *
 * The first key for a provider is the one in use. Every key after it is added
 * inactive: adding a second key must never change which account is billed.
 */
fn put_key(
    path: &std::path::Path,
    provider: &Provider,
    secret: &str,
    name: Option<&str>,
    standing: Standing,
) -> Result<String, String> {
    let mut index = ensure_index(path)?;

    let id = mint_id();
    let account = format!("{KEY_USER_PREFIX}{id}");
    write_credential(&account, secret)?;
    if read_credential(&account)?.as_deref() != Some(secret) {
        let _ = delete_credential(&account);
        return Err("The key could not be stored in the credential store.".to_string());
    }

    let now = now_secs();
    let group = index
        .providers
        .entry(provider.id.to_string())
        .or_default();
    let chosen = name
        .map(|name| name.trim().to_string())
        .filter(|name| !name.is_empty())
        .unwrap_or_else(|| provider.label.to_string());
    let name_is_default = chosen == provider.label;

    group.keys.push(KeyRecord {
        id: id.clone(),
        provider: provider.id.to_string(),
        name: chosen,
        name_is_default,
        created_at: now,
        updated_at: now,
        last_used_at: None,
        masked_value: Some(mask_secret(secret)),
        standing,
    });

    if group.active_key_id.is_none() {
        group.active_key_id = Some(id.clone());
    }

    if let Err(error) = write_index(path, &index) {
        let _ = delete_credential(&account);
        return Err(error);
    }

    Ok(id)
}

/// Puts a new secret in place of an existing one.
///
/// The credential store's own write replaces the secret in place, so there is
/// never a moment with neither.
fn put_secret(
    path: &std::path::Path,
    id: &str,
    secret: &str,
    standing: Standing,
) -> Result<(), String> {
    let mut index = ensure_index(path)?;
    let (provider_id, position) = find_key(&index, id)?;

    let account = format!("{KEY_USER_PREFIX}{id}");
    write_credential(&account, secret)?;

    let group = index
        .providers
        .get_mut(&provider_id)
        .ok_or("That key is not one the app holds.")?;
    let record = &mut group.keys[position];
    record.standing = standing;
    record.masked_value = Some(mask_secret(secret));
    record.updated_at = now_secs();

    write_index(path, &index)
}

/// Renames a key.
fn put_name(path: &std::path::Path, id: &str, name: &str) -> Result<(), String> {
    let mut index = ensure_index(path)?;
    let (provider_id, position) = find_key(&index, id)?;
    let provider = provider_for(&provider_id)
        .ok_or("That provider is not one the app knows about.")?;

    let chosen = name.trim().to_string();
    let group = index
        .providers
        .get_mut(&provider_id)
        .ok_or("That key is not one the app holds.")?;
    let record = &mut group.keys[position];
    record.name = chosen.clone();
    record.name_is_default = chosen == provider.label;
    record.updated_at = now_secs();

    write_index(path, &index)
}

/// Makes a key the one requests go out with.
///
/// An explicit pointer, never an inference: this is the only thing that
/// decides which account is billed.
fn put_active(path: &std::path::Path, id: &str) -> Result<(), String> {
    let mut index = ensure_index(path)?;
    let (provider_id, _) = find_key(&index, id)?;

    index
        .providers
        .get_mut(&provider_id)
        .and_then(|group| {
            group.active_key_id = Some(id.to_string());
            Some(())
        })
        .ok_or("That key is not one the app holds.")?;

    write_index(path, &index)
}

/// Takes a key away.
///
/// Taking away the key in use leaves the provider with none, and the app says
/// so rather than quietly falling back to another key — that is the exact
/// failure where a work key starts paying for a personal key's requests.
fn take_key(path: &std::path::Path, id: &str) -> Result<(), String> {
    let mut index = ensure_index(path)?;
    let (provider_id, position) = find_key(&index, id)?;

    let group = index
        .providers
        .get_mut(&provider_id)
        .ok_or("That key is not one the app holds.")?;
    group.keys.remove(position);
    if group.active_key_id.as_deref() == Some(id) {
        group.active_key_id = None;
    }

    write_index(path, &index)?;

    let _ = delete_credential(&format!("{KEY_USER_PREFIX}{id}"));
    Ok(())
}

/* -------------------------------------------------------------------------- */
/* The commands                                                                */
/* -------------------------------------------------------------------------- */

/// One key, as the app knows it.
fn key_json(record: &KeyRecord, group: &ProviderGroup, provider: &Provider) -> Value {
    json!({
        "id": record.id,
        "provider": record.provider,
        "providerLabel": provider.label,
        "name": record.name,
        "nameIsDefault": record.name_is_default,
        "createdAt": record.created_at,
        "updatedAt": record.updated_at,
        "lastUsedAt": record.last_used_at,
        "maskedValue": record.masked_value,
        "source": Source::Store.as_str(),
        "active": group.active_key_id.as_deref() == Some(record.id.as_str()),
        "valid": record.standing.valid,
        "checkReason": record.standing.check_reason,
        "checkedAt": record.standing.checked_at,
        "account": record.standing.account,
        "organizationId": record.standing.organization_id,
        "workspaceId": record.standing.workspace_id,
        "creatorUserId": record.standing.creator_user_id,
        "expiresAt": record.standing.expires_at,
        "limit": record.standing.limit,
        "limitRemaining": record.standing.limit_remaining,
        "limitReset": record.standing.limit_reset,
        "limitCurrency": record.standing.limit_currency,
        "usage": record.standing.usage,
        "usageInWindow": record.standing.usage_in_window,
        "isFreeTier": record.standing.is_free_tier,
    })
}

/// Every key the app holds, and what is known about it.
///
/// A provider with no key is not listed, and neither is a key the user cannot
/// see. The list is the keys, not the providers.
#[tauri::command]
pub async fn list_provider_keys(app: AppHandle) -> Result<Vec<Value>, String> {
    let path = index_path(&app)?;
    let index = ensure_index(&path)?;
    let mut keys: Vec<Value> = Vec::new();

    for provider in PROVIDERS {
        let Some(group) = index.providers.get(provider.id) else {
            continue;
        };

        for record in &group.keys {
            /* A key the provider publishes a free answer for is checked as
               the list is read. A key whose check costs a request is not:
               the list must never quietly spend the user's quota. */
            let mut record = record.clone();
            if provider.validation == Validation::IdentityEndpoint {
                let secret = read_credential(&format!("{KEY_USER_PREFIX}{}", record.id))?;
                if let Some(secret) = secret {
                    if let Ok(standing) = check(provider, &secret, false).await {
                        record.standing = standing;
                    }
                }
            }
            keys.push(key_json(&record, group, provider));
        }
    }

    /* A key in the development file, for a provider the store has no active
       key for, is still a key the app is using — so it is listed, and said to
       be somewhere else. A stored key that is not the one in use does not
       displace it: the app is still sending requests with the file's key, and
       the pane has to say so. */
    for provider in PROVIDERS {
        let group = index.providers.get(provider.id);
        let has_active = group
            .and_then(|group| group.active_key_id.as_ref())
            .is_some();
        if has_active {
            continue;
        }
        let Some(secret) = dev_key(provider) else {
            continue;
        };
        let now = now_secs();
        keys.push(json!({
            "id": format!("env:{}", provider.id),
            "provider": provider.id,
            "providerLabel": provider.label,
            "name": provider.label,
            "nameIsDefault": true,
            "createdAt": now,
            "updatedAt": now,
            "lastUsedAt": null,
            "maskedValue": mask_secret(&secret),
            "source": Source::DevFile.as_str(),
            "active": provider.id == ACTIVE_PROVIDER,
            "valid": null,
            "checkReason": "not-checked",
            "checkedAt": null,
            "account": null,
            "organizationId": null,
            "workspaceId": null,
            "creatorUserId": null,
            "expiresAt": null,
            "limit": null,
            "limitRemaining": null,
            "limitReset": null,
            "limitCurrency": null,
            "usage": null,
            "usageInWindow": null,
            "isFreeTier": null,
        }));
    }

    Ok(keys)
}

/// What a provider says about a key that has not been stored yet.
///
/// The secret is passed in and used here; it is never in the answer.
#[tauri::command]
pub async fn check_provider_key(
    provider: String,
    key: String,
    spend: bool,
) -> Result<Value, String> {
    let provider =
        provider_for(&provider).ok_or("That provider is not one the app knows about.")?;
    let key = key.trim();
    if key.is_empty() {
        return Err("Key must not be empty.".to_string());
    }

    let standing = check(provider, key, spend).await?;
    Ok(json!({
        "valid": standing.valid,
        "checkReason": standing.check_reason,
        "checkedAt": standing.checked_at,
        "account": standing.account,
        "organizationId": standing.organization_id,
        "workspaceId": standing.workspace_id,
        "creatorUserId": standing.creator_user_id,
        "expiresAt": standing.expires_at,
        "limit": standing.limit,
        "limitRemaining": standing.limit_remaining,
        "limitReset": standing.limit_reset,
        "limitCurrency": standing.limit_currency,
        "usage": standing.usage,
        "usageInWindow": standing.usage_in_window,
        "isFreeTier": standing.is_free_tier,
    }))
}

/// Stores a new key.
///
/// The order is the one every console uses and the one that never loses a
/// working key: the new secret is checked first, so a refused key leaves
/// what is already stored exactly as it was; the secret is written before the
/// index that finds it, so a failure there can be undone; and the old entry
/// is removed last.
#[tauri::command]
pub async fn save_provider_key(
    app: AppHandle,
    provider: String,
    key: String,
    name: Option<String>,
) -> Result<(), String> {
    let provider =
        provider_for(&provider).ok_or("That provider is not one the app knows about.")?;
    let secret = key.trim().to_string();
    if secret.is_empty() {
        return Err("Key must not be empty.".to_string());
    }

    /* Checked first, and a refusal is a refusal: the key is not stored, and
       whatever was in use stays in use. A provider that could not be reached
       is not a refusal, and a check that costs a request is not run here. */
    let standing = check(provider, &secret, false).await?;
    if standing.valid == Some(false) && standing.check_reason.as_deref() == Some("not-accepted")
    {
        return Err(format!("{} did not accept this key.", provider.label));
    }

    let path = index_path(&app)?;
    let mut index = ensure_index(&path)?;

    let id = mint_id();
    let account = format!("{KEY_USER_PREFIX}{id}");
    write_credential(&account, &secret)?;
    if read_credential(&account)?.as_deref() != Some(secret.as_str()) {
        let _ = delete_credential(&account);
        return Err("The key could not be stored in the credential store.".to_string());
    }

    let now = now_secs();
    let group = index
        .providers
        .entry(provider.id.to_string())
        .or_default();
    let chosen = name
        .map(|name| name.trim().to_string())
        .filter(|name| !name.is_empty())
        .unwrap_or_else(|| provider.label.to_string());
    let name_is_default = chosen == provider.label;

    group.keys.push(KeyRecord {
        id: id.clone(),
        provider: provider.id.to_string(),
        name: chosen,
        name_is_default,
        created_at: now,
        updated_at: now,
        last_used_at: None,
        masked_value: Some(mask_secret(&secret)),
        standing,
    });

    /* The first key for a provider is the one in use. Every key after it is
       added inactive: adding a second key must never change which account
       is billed. */
    if group.active_key_id.is_none() {
        group.active_key_id = Some(id);
    }

    if let Err(error) = write_index(&path, &index) {
        let _ = delete_credential(&account);
        return Err(error);
    }

    Ok(())
}

/// Puts a new secret in place of an existing one.
///
/// The old secret is checked first — a refused key leaves the old one exactly
/// as it was — and the credential store's own write replaces the secret in
/// place, so there is never a moment with neither.
#[tauri::command]
pub async fn replace_provider_key(app: AppHandle, id: String, key: String) -> Result<(), String> {
    let secret = key.trim().to_string();
    if secret.is_empty() {
        return Err("Key must not be empty.".to_string());
    }

    let path = index_path(&app)?;
    let mut index = ensure_index(&path)?;
    let (provider_id, position) = find_key(&index, &id)?;
    let provider = provider_for(&provider_id)
        .ok_or("That provider is not one the app knows about.")?;

    let standing = check(provider, &secret, false).await?;
    if standing.valid == Some(false) && standing.check_reason.as_deref() == Some("not-accepted")
    {
        return Err(format!("{} did not accept this key.", provider.label));
    }

    let account = format!("{KEY_USER_PREFIX}{id}");
    write_credential(&account, &secret)?;

    let group = index
        .providers
        .get_mut(&provider_id)
        .ok_or("That key is not one the app holds.")?;
    let record = &mut group.keys[position];
    record.standing = standing;
    record.masked_value = Some(mask_secret(&secret));
    record.updated_at = now_secs();

    if let Err(error) = write_index(&path, &index) {
        return Err(error);
    }

    Ok(())
}

/// Renames a key.
#[tauri::command]
pub async fn rename_provider_key(app: AppHandle, id: String, name: String) -> Result<(), String> {
    let chosen = name.trim().to_string();
    if chosen.is_empty() {
        return Err("A key needs a name.".to_string());
    }

    let path = index_path(&app)?;
    let mut index = ensure_index(&path)?;
    let (provider_id, position) = find_key(&index, &id)?;
    let provider = provider_for(&provider_id)
        .ok_or("That provider is not one the app knows about.")?;

    let group = index
        .providers
        .get_mut(&provider_id)
        .ok_or("That key is not one the app holds.")?;
    let record = &mut group.keys[position];
    record.name = chosen.clone();
    record.name_is_default = chosen == provider.label;
    record.updated_at = now_secs();

    write_index(&path, &index)
}

/// Makes a key the one requests go out with.
///
/// An explicit pointer, never an inference: this is the only thing that
/// decides which account is billed.
#[tauri::command]
pub async fn activate_provider_key(app: AppHandle, id: String) -> Result<(), String> {
    let path = index_path(&app)?;
    let mut index = ensure_index(&path)?;
    let (provider_id, _) = find_key(&index, &id)?;

    index
        .providers
        .get_mut(&provider_id)
        .and_then(|group| {
            group.active_key_id = Some(id.clone());
            Some(())
        })
        .ok_or("That key is not one the app holds.")?;

    write_index(&path, &index)
}

/// Takes a key away.
///
/// Taking away the key in use leaves the provider with none, and the app says
/// so rather than quietly falling back to another key — that is the exact
/// failure where a work key starts paying for a personal key's requests.
#[tauri::command]
pub async fn remove_provider_key(app: AppHandle, id: String) -> Result<(), String> {
    let path = index_path(&app)?;
    let mut index = ensure_index(&path)?;
    let (provider_id, position) = find_key(&index, &id)?;

    let group = index
        .providers
        .get_mut(&provider_id)
        .ok_or("That key is not one the app holds.")?;
    group.keys.remove(position);
    if group.active_key_id.as_deref() == Some(id.as_str()) {
        group.active_key_id = None;
    }

    write_index(&path, &index)?;

    let _ = delete_credential(&format!("{KEY_USER_PREFIX}{id}"));
    Ok(())
}

/// Checks a key the app already holds.
#[tauri::command]
pub async fn recheck_provider_key(app: AppHandle, id: String) -> Result<(), String> {
    let path = index_path(&app)?;
    let mut index = ensure_index(&path)?;
    let (provider_id, position) = find_key(&index, &id)?;
    let provider = provider_for(&provider_id)
        .ok_or("That provider is not one the app knows about.")?;

    let secret = read_credential(&format!("{KEY_USER_PREFIX}{id}"))?
        .ok_or("That key is not one the app holds.")?;

    let standing = check(provider, &secret, true).await?;

    let group = index
        .providers
        .get_mut(&provider_id)
        .ok_or("That key is not one the app holds.")?;
    let record = &mut group.keys[position];
    record.standing = standing;
    record.updated_at = now_secs();

    write_index(&path, &index)
}

/// Where a key is in the index.
fn find_key(index: &KeyIndex, id: &str) -> Result<(String, usize), String> {
    for (provider_id, group) in &index.providers {
        if let Some(position) = group.keys.iter().position(|record| record.id == id) {
            return Ok((provider_id.clone(), position));
        }
    }
    Err("That key is not one the app holds.".to_string())
}

/// The key the app's own provider requests use.
///
/// Not a command. The webview used to ask for the key and send it to a local
/// server as a bearer header, which put a credential in JavaScript for no
/// reason: the provider request is made here, and the key is used here.
pub fn get_api_key(app: &AppHandle) -> Result<Option<String>, String> {
    let path = index_path(app)?;
    let index = ensure_index(&path)?;

    if let Some(group) = index.providers.get(ACTIVE_PROVIDER) {
        if let Some(id) = &group.active_key_id {
            if let Some(secret) = read_credential(&format!("{KEY_USER_PREFIX}{id}"))? {
                return Ok(Some(secret));
            }
        }
    }

    /* Nothing in the store. In a development build the key may be in the file
       the website's server reads. */
    Ok(provider_for(ACTIVE_PROVIDER).and_then(dev_key))
}

/// Notes that a key was just used.
///
/// The app's own use, not the provider's — the provider's last-used time
/// needs an admin API, and this is the one fact the app can know for sure.
pub fn note_key_use(app: &AppHandle) {
    let path = match index_path(app) {
        Ok(path) => path,
        Err(_) => return,
    };
    let Ok(mut index) = ensure_index(&path) else {
        return;
    };
    let Some(group) = index.providers.get(ACTIVE_PROVIDER) else {
        return;
    };
    let Some(id) = group.active_key_id.clone() else {
        return;
    };
    let now = now_secs();
    let Some(provider) = index.providers.get_mut(ACTIVE_PROVIDER) else {
        return;
    };
    if let Some(record) = provider.keys.iter_mut().find(|record| record.id == id) {
        record.last_used_at = Some(now);
    }
    let _ = write_index(&path, &index);
}

#[cfg(test)]
mod tests {
    use serde_json::json;

    use super::{
        ACTIVE_PROVIDER, KEY_SERVICE, KEY_USER_PREFIX, PROVIDERS, Source, days_from_civil,
        dev_key, entry_for, leading_prefix, mask_secret, migrate_key, provider_for,
        timestamp,
    };

    /// The key moves from the name it had before there was more than one
    /// provider to the name it has now, and the old one is cleaned up.
    ///
    /// It uses a name of its own so the user's own key is never touched, and
    /// it removes what it created so nothing is left behind.
    #[test]
    fn a_key_moves_between_names() {
        const FROM: &str = "tavi-test-migration-from";
        const TO: &str = "tavi-test-migration-to";

        // A machine with no credential store has nowhere to move a key to and
        // from. That is not the migration failing — it is a machine without
        // the facility, and the app says so when it cannot reach one.
        let (Ok(from), Ok(to)) = (
            keyring::Entry::new(KEY_SERVICE, FROM),
            keyring::Entry::new(KEY_SERVICE, TO),
        ) else {
            return;
        };

        let _ = from.delete_credential();
        let _ = to.delete_credential();

        from.set_password("secret")
            .expect("the test key should store");
        let moved = migrate_key(KEY_SERVICE, FROM, TO).expect("the migration should work");

        assert_eq!(moved.as_deref(), Some("secret"));
        assert_eq!(
            to.get_password().expect("the moved key should read"),
            "secret"
        );
        assert!(
            matches!(from.get_password(), Err(keyring::Error::NoEntry)),
            "the old name should have been cleaned up"
        );

        let _ = from.delete_credential();
        let _ = to.delete_credential();
    }

    /// Every provider the app knows about has one entry, and no two of them
    /// share an id — two providers with the same id would file their keys
    /// under the same name, and one of them would be lost.
    #[test]
    fn the_providers_are_distinct() {
        let mut ids: Vec<&str> = PROVIDERS.iter().map(|provider| provider.id).collect();
        ids.sort_unstable();
        let before = ids.len();
        ids.dedup();
        assert_eq!(before, ids.len(), "two providers share an id");
    }

    /// The provider the app's own requests use is one of the providers it can
    /// hold a key for. A key for a provider that is not on the list would be
    /// stored and never used.
    #[test]
    fn the_active_provider_is_one_we_know() {
        assert!(provider_for(ACTIVE_PROVIDER).is_some());
    }

    /// A provider that is not on the list is refused rather than filed under
    /// a name nothing will ever read.
    #[test]
    fn an_unknown_provider_is_not_found() {
        assert!(provider_for("not-a-provider").is_none());
    }

    /// Each provider's key is filed under its own name, so one credential
    /// store holds them all without a second place to keep in step.
    #[test]
    fn each_provider_has_its_own_credential_name() {
        for provider in PROVIDERS {
            let name = format!("{KEY_USER_PREFIX}{}", provider.id);
            assert!(name.starts_with(KEY_USER_PREFIX));
            assert!(name.len() > KEY_USER_PREFIX.len());
        }
    }

    /// The development file is read, and a key in it is found.
    ///
    /// It says nothing on a machine that is not developing the app: there is
    /// no file there, and so there is nothing to find.
    #[test]
    fn a_key_in_the_development_file_is_found() {
        let Some(provider) = provider_for("openrouter") else {
            return;
        };
        let Some(key) = dev_key(provider) else {
            return;
        };
        assert!(!key.trim().is_empty());
    }

    /// A key that is only in the development file says that it came from
    /// there.
    ///
    /// This is what lets the pane say where a key is rather than claiming it
    /// is in the store, where it is not and cannot be changed.
    #[test]
    fn a_key_that_is_only_in_the_development_file_says_so() {
        let Some(provider) = provider_for("openrouter") else {
            return;
        };
        if dev_key(provider).is_none() {
            return;
        }
        /* The store is looked in first, so a machine whose store has a key
           for this provider says nothing about the file. */
        if entry_for("openrouter")
            .ok()
            .and_then(|entry| entry.get_password().ok())
            .is_some()
        {
            return;
        }
        let (key, source) = read_key_for_test("openrouter");
        assert_eq!(source, Source::DevFile);
        assert!(!key.trim().is_empty());
    }

    /// Reads a key the way the app does, for the test above.
    fn read_key_for_test(provider_id: &str) -> (String, Source) {
        let account = format!("{KEY_USER_PREFIX}{provider_id}");
        if let Ok(Some(key)) = entry_for(&account).and_then(|entry| match entry.get_password() {
            Ok(key) => Ok(Some(key)),
            Err(keyring::Error::NoEntry) => Ok(None),
            Err(e) => Err(format!("Could not read key: {e}")),
        }) {
            return (key, Source::Store);
        }
        let provider = provider_for(provider_id).expect("the provider should be known");
        (
            dev_key(provider).unwrap_or_default(),
            Source::DevFile,
        )
    }

    /// Every provider knows the environment variable its key is named in.
    ///
    /// A provider without one could never be given a key by the environment,
    /// and the development file would have nothing to read for it.
    #[test]
    fn every_provider_names_its_environment_variable() {
        for provider in PROVIDERS {
            assert!(
                provider.env_var.starts_with(char::is_alphabetic),
                "{} has no environment variable",
                provider.id
            );
            assert!(
                provider
                    .env_var
                    .chars()
                    .all(|c| c.is_ascii_uppercase() || c == '_'),
                "{} has an environment variable that is not a name",
                provider.id
            );
        }
    }

    /// A key is shown as its vendor's prefix and its last four characters,
    /// and never in full.
    #[test]
    fn a_key_is_shown_masked() {
        assert_eq!(
            mask_secret("sk-or-v1-au7abcdefghijklmnop890"),
            "sk-or-v1-au7…p890"
        );
        assert_eq!(
            mask_secret("sk-ant-api03-zzzzzzzzzzzzzzzzzzzz"),
            "sk-ant-api03…zzzz"
        );
        assert_eq!(mask_secret("short"), "…");
    }

    /// The vendor's prefix is found in the head of a key.
    #[test]
    fn the_vendors_prefix_is_found() {
        assert_eq!(leading_prefix("sk-or-v1-au7").as_deref(), Some("sk-or-v1-au7"));
        assert_eq!(leading_prefix("nvapi-abcdef").as_deref(), Some("nvapi-abcdef"));
        assert_eq!(leading_prefix("plainword"), None);
    }

    /// An ISO-8601 instant is read as a time.
    #[test]
    fn an_iso_instant_is_read() {
        assert_eq!(
            timestamp(Some(&json!("2026-01-31T12:00:00Z"))),
            Some(1_769_860_800)
        );
        assert_eq!(timestamp(Some(&json!(1_769_860_800))), Some(1_769_860_800));
        assert_eq!(timestamp(Some(&json!("not a date"))), None);
    }

    /// Days since the epoch, from a civil date.
    #[test]
    fn a_civil_date_is_counted() {
        assert_eq!(days_from_civil(1970, 1, 1), 0);
        assert_eq!(days_from_civil(2026, 1, 1), 20454);
        assert_eq!(days_from_civil(2026, 1, 31), 20484);
    }
}
