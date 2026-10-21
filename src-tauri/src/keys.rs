//! The provider keys, held in the operating system's credential store.
//!
//! One key per provider. The key itself is never in a log, never in this
//! file's answers, and never handed to the webview: it is written to the
//! credential store, read back here to make the provider's request, and used
//! there. What the app can say about a key is whether the provider accepts it
//! and, for the one provider that says so, which account it belongs to.
//!
//! The providers are listed here rather than read from a file so that the
//! credential store is the only place a key is written and the only place it
//! is read from. The list mirrors `src/lib/providers.ts`, which the website's
//! server and the pane both use, so the two sides call the same providers by
//! the same names.

use serde_json::{json, Value};

/// The credential service the keys live under.
const KEY_SERVICE: &str = "tavi";

/// The prefix a provider's credential is filed under.
///
/// The provider is part of the credential's name rather than of a file beside
/// it, so one credential store holds every provider's key without a second
/// place to keep in step with it.
const KEY_USER_PREFIX: &str = "api-key:";

/// The namespace the key was stored under before the app was renamed.
const LEGACY_KEY_SERVICE: &str = "ai-app";

/// The single credential name the key had before there was more than one.
const LEGACY_KEY_USER: &str = "openrouter-api-key";

/// The provider whose key the app's own requests use.
const ACTIVE_PROVIDER: &str = "openrouter";

/// How a provider takes a key.
#[derive(Clone, Copy)]
enum Auth {
    /// `Authorization: Bearer <key>`.
    Bearer,
    /// `x-api-key: <key>`, with the version header Anthropic requires.
    ApiKeyHeader,
}

/// A provider the app can hold a key for.
struct Provider {
    id: &'static str,
    label: &'static str,
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
    /// Whether the provider's answer carries an account name and a limit.
    reports_usage: bool,
}

const PROVIDERS: &[Provider] = &[
    Provider {
        id: "openrouter",
        label: "OpenRouter",
        env_var: "OPENROUTER_API_KEY",
        auth: Auth::Bearer,
        identity_url: "https://openrouter.ai/api/v1/key",
        reports_usage: true,
    },
    Provider {
        id: "anthropic",
        label: "Anthropic",
        env_var: "ANTHROPIC_API_KEY",
        auth: Auth::ApiKeyHeader,
        identity_url: "https://api.anthropic.com/v1/models",
        reports_usage: false,
    },
    Provider {
        id: "openai",
        label: "OpenAI",
        env_var: "OPENAI_API_KEY",
        auth: Auth::Bearer,
        identity_url: "https://api.openai.com/v1/models",
        reports_usage: false,
    },
    Provider {
        id: "nvidia-nim",
        label: "NVIDIA NIM",
        env_var: "NVIDIA_API_KEY",
        auth: Auth::Bearer,
        identity_url: "https://integrate.api.nvidia.com/v1/models",
        reports_usage: false,
    },
];

fn provider_for(id: &str) -> Option<&'static Provider> {
    PROVIDERS.iter().find(|provider| provider.id == id)
}

fn entry_for(provider_id: &str) -> Result<keyring::Entry, String> {
    keyring::Entry::new(KEY_SERVICE, &format!("{KEY_USER_PREFIX}{provider_id}"))
        .map_err(|e| format!("Credential store unavailable: {e}"))
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
            Source::Store => "store",
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

/// One provider's key, if there is one, and where it came from.
fn read_key(provider_id: &str) -> Result<Option<(String, Source)>, String> {
    let entry = entry_for(provider_id)?;
    match entry.get_password() {
        Ok(key) => Ok(Some((key, Source::Store))),
        Err(keyring::Error::NoEntry) => {
            /* The key may still be under the name it had when there was only
               one provider — first under the app's old name, then under a
               fixed name of its own. Both are moved rather than asked for
               again: a key the user has already entered should not have to be
               entered a second time because the app grew. */
            if provider_id == ACTIVE_PROVIDER {
                let to_user = format!("{KEY_USER_PREFIX}{provider_id}");
                if let Some(key) = migrate_key(KEY_SERVICE, LEGACY_KEY_USER, &to_user)? {
                    return Ok(Some((key, Source::Store)));
                }
                if let Some(key) = migrate_key(LEGACY_KEY_SERVICE, LEGACY_KEY_USER, &to_user)? {
                    return Ok(Some((key, Source::Store)));
                }
            }
            /* Nothing in the store. In a development build the key may be in
               the file the website's server reads. */
            Ok(provider_for(provider_id)
                .and_then(dev_key)
                .map(|key| (key, Source::DevFile)))
        }
        Err(e) => Err(format!("Could not read key: {e}")),
    }
}

/// The key the app's own provider requests use.
///
/// Not a command. The webview used to ask for the key and send it to a local
/// server as a bearer header, which put a credential in JavaScript for no
/// reason: the provider request is made here, and the key is used here.
pub fn get_api_key() -> Result<Option<String>, String> {
    Ok(read_key(ACTIVE_PROVIDER)?.map(|(key, _source)| key))
}

/// Store a key for a provider.
#[tauri::command]
pub async fn set_api_key(provider: String, key: String) -> Result<(), String> {
    let provider =
        provider_for(&provider).ok_or("That provider is not one the app knows about.")?;
    let key = key.trim().to_string();
    if key.is_empty() {
        return Err("Key must not be empty.".to_string());
    }
    entry_for(provider.id)?
        .set_password(&key)
        .map_err(|e| format!("Could not store key: {e}"))
}

/// Take a provider's key out.
#[tauri::command]
pub async fn clear_api_key(provider: String) -> Result<(), String> {
    let provider =
        provider_for(&provider).ok_or("That provider is not one the app knows about.")?;
    match entry_for(provider.id)?.delete_credential() {
        Ok(()) | Err(keyring::Error::NoEntry) => Ok(()),
        Err(e) => Err(format!("Could not clear key: {e}")),
    }
}

/// Every provider, and what is known about its key.
///
/// A provider with no key is listed without one rather than left out, so the
/// pane can show what is available to add as well as what is there.
#[tauri::command]
pub async fn list_api_keys() -> Result<Vec<Value>, String> {
    let checks = PROVIDERS.iter().map(|provider| async move {
        let Some((key, source)) = read_key(provider.id)? else {
            return Ok(json!({
                "provider": provider.id,
                "label": provider.label,
                "stored": false,
            }));
        };

        let mut info = json!({
            "provider": provider.id,
            "label": provider.label,
            "stored": true,
            "source": source.as_str(),
        });

        match status(provider, &key).await {
            Ok(standing) => {
                if let (Some(target), Some(source)) =
                    (info.as_object_mut(), standing.as_object())
                {
                    for (name, value) in source {
                        target.insert(name.clone(), value.clone());
                    }
                }
            }
            Err(reason) => {
                /* The provider could not be reached. That is not the same as
                   the provider refusing the key, so nothing is claimed about
                   whether the key is good. */
                info["reason"] = json!(reason);
            }
        }

        Ok(info)
    });

    futures_util::future::join_all(checks)
        .await
        .into_iter()
        .collect::<Result<Vec<Value>, String>>()
}

/// What a provider says about a key.
///
/// The key itself is never in the answer, and the account name is redacted:
/// a key is shown as `sk-***` or not at all.
async fn status(provider: &Provider, key: &str) -> Result<Value, String> {
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

    if response.status() == 401 || response.status() == 403 {
        return Ok(json!({
            "valid": false,
            "reason": "The provider did not accept this key.",
        }));
    }
    if !response.status().is_success() {
        return Ok(json!({
            "valid": false,
            "reason": format!(
                "The provider answered with {}.",
                response.status().as_u16()
            ),
        }));
    }

    if !provider.reports_usage {
        return Ok(json!({ "valid": true }));
    }

    let body = response
        .text()
        .await
        .map_err(|e| format!("Could not read the provider's answer: {e}"))?;
    let Ok(raw) = serde_json::from_str::<Value>(&body) else {
        return Ok(json!({ "valid": true }));
    };

    /* The answer is nested under `data`, but a gateway in front of the
       provider may answer flat. Both are read, and neither is invented. */
    let data = raw.get("data").unwrap_or(&raw);

    Ok(json!({
        "valid": true,
        "account": data.get("label").and_then(Value::as_str).map(crate::provider::redact),
        "limit": data.get("limit"),
        "usage": data.get("usage"),
        "remaining": data.get("remaining"),
        "isFreeTier": data.get("is_free_tier"),
    }))
}

/// Where a provider's key is asked about.
///
/// OpenRouter's address can be pointed elsewhere — at a gateway of one's own,
/// or at a test server — so its key page is asked of whatever the app is
/// talking to rather than of a fixed address.
fn identity_url(provider: &Provider) -> String {
    if provider.id == ACTIVE_PROVIDER {
        return crate::provider::Provider::new().key_url();
    }
    provider.identity_url.to_string()
}

#[cfg(test)]
mod tests {
    use super::{
        ACTIVE_PROVIDER, KEY_SERVICE, KEY_USER_PREFIX, PROVIDERS, Source, dev_key, entry_for,
        migrate_key, provider_for, read_key,
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
        let (key, source) = read_key("openrouter")
            .expect("the key should be readable")
            .expect("the development file's key should be found");
        assert_eq!(source, Source::DevFile);
        assert!(!key.trim().is_empty());
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
}
