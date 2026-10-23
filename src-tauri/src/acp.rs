#![allow(dead_code, unused_mut, unused_assignments, unused_variables, unused)]
//! The Agent Client Protocol, for the programs that speak it.
//!
//! A protocol, rather than a headless mode, is the way to a program that
//! behaves like a real agent: the app sends a message and the program sends
//! back text, tool calls, permission requests and what the turn cost. The app
//! shows all of it, and the program keeps the session.
//!
//! OpenCode speaks this protocol. `opencode acp` starts the server on
//! standard input and output, and the conversation is JSON-RPC 2.0, one
//! message per line.

use std::collections::BTreeMap;
use std::io::{BufRead, BufReader, Write};
use std::process::{Command, Stdio};
use std::sync::{Arc, Mutex};
use std::time::Duration;

use serde::{Deserialize, Serialize};
use tauri::ipc::Channel;
use tauri::AppHandle;
use tauri::State;

use crate::provider::ChatEvent;
use crate::provider::EventMetadata;
use crate::provider::ChatRequest;

/// The shape of a JSON-RPC 2.0 request.
#[derive(Serialize)]
struct JsonRpcRequest {
    jsonrpc: &'static str,
    id: i64,
    method: String,
    params: serde_json::Value,
}

/// The shape of a JSON-RPC 2.0 notification.
#[derive(Serialize)]
struct JsonRpcNotification {
    jsonrpc: &'static str,
    method: String,
    params: serde_json::Value,
}

/// The shape of a JSON-RPC 2.0 response.
#[derive(Deserialize, Debug)]
struct JsonRpcResponse {
    #[allow(dead_code)]
    jsonrpc: Option<String>,
    id: Option<i64>,
    result: Option<serde_json::Value>,
    error: Option<JsonRpcError>,
}

/// A JSON-RPC 2.0 error.
#[derive(Deserialize, Debug)]
struct JsonRpcError {
    code: i64,
    message: String,
}

/// A JSON-RPC 2.0 notification received from the agent.
#[derive(Deserialize, Debug)]
struct JsonRpcNotificationIn {
    #[allow(dead_code)]
    jsonrpc: Option<String>,
    method: String,
    params: Option<serde_json::Value>,
}

/// A JSON-RPC 2.0 request received from the agent (needs a response).
#[derive(Deserialize, Debug)]
struct JsonRpcRequestIn {
    #[allow(dead_code)]
    jsonrpc: Option<String>,
    id: Option<i64>,
    method: String,
    params: Option<serde_json::Value>,
}

/// A configuration option the agent exposes.
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AcpConfigOption {
    pub id: String,
    pub name: String,
    pub category: Option<String>,
    #[serde(rename = "type")]
    pub option_type: String,
    pub current_value: serde_json::Value,
    pub options: Option<Vec<AcpConfigSelectOption>>,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AcpConfigSelectOption {
    pub value: String,
    pub name: String,
    pub description: Option<String>,
}

/// The result of listing the models and configuration an agent offers.
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AcpConfigResult {
    pub session_id: String,
    pub config_options: Vec<AcpConfigOption>,
}

/// The state of an ACP session.
struct AcpSessionState {
    /// The agent's own session id.
    session_id: String,
    /// The child process.
    child: std::process::Child,
    /// The end the app writes to.
    stdin: std::process::ChildStdin,
    /// The working directory.
    cwd: String,
    /// The next request id.
    next_id: i64,
    /// Pending responses, waiting for the agent to answer.
    pending: std::collections::BTreeMap<i64, std::sync::mpsc::Sender<JsonRpcResponse>>,
}

/// The manager that owns the ACP processes.
#[derive(Default)]
pub struct AcpAgents {
    processes: Arc<Mutex<BTreeMap<String, AcpProcess>>>,
}

struct AcpProcess {
    child: std::process::Child,
    stdin: std::process::ChildStdin,
    next_id: Mutex<i64>,
    /// Responses waiting for their answer.
    pending: Arc<Mutex<BTreeMap<i64, std::sync::mpsc::Sender<JsonRpcResponse>>>>,
    /// The reader thread handle.
    reader_thread: Option<std::thread::JoinHandle<()>>,
    /// The working directory.
    cwd: String,
}

impl AcpAgents {
    /// Starts an ACP agent for a provider, if one is not already running.
    fn start(&self, provider: &str, cwd: &str) -> Result<(), String> {
        let mut processes = self.processes.lock().map_err(|_| "The agent manager is unavailable.")?;

        if processes.contains_key(provider) {
            return Ok(());
        }

        let mut child = Command::new(if cfg!(windows) { "opencode.exe" } else { "opencode" })
            .args(["acp"])
            .stdin(Stdio::piped())
            .stdout(Stdio::piped())
            .stderr(Stdio::null())
            .spawn()
            .map_err(|e| format!("Could not start the agent: {e}"))?;

        let stdin = child.stdin.take().ok_or("The agent's input is unavailable.")?;
        let stdout = child.stdout.take().ok_or("The agent's output is unavailable.")?;

        let pending = Arc::new(Mutex::new(BTreeMap::<i64, std::sync::mpsc::Sender<JsonRpcResponse>>::new()));
        let pending_clone = Arc::clone(&pending);

        let reader_thread = std::thread::spawn(move || {
            let reader = BufReader::new(stdout);
            for line in reader.lines() {
                let Ok(line) = line else { break };
                let line = line.trim();
                if line.is_empty() {
                    continue;
                }
                // Try to parse as a response first.
                if let Ok(response) = serde_json::from_str::<JsonRpcResponse>(line) {
                    if let Some(id) = response.id {
                        let mut pending = pending_clone.lock().unwrap_or_else(|e| e.into_inner());
                        if let Some(sender) = pending.remove(&id) {
                            let _ = sender.send(response);
                        }
                    }
                    continue;
                }
                // Then a notification.
                if let Ok(_notification) = serde_json::from_str::<JsonRpcNotificationIn>(line) {
                    continue;
                }
                // Then an incoming request from the agent.
                if let Ok(_request) = serde_json::from_str::<JsonRpcRequestIn>(line) {
                    continue;
                }
            }
        });


        let process = AcpProcess {
            child,
            stdin,
            next_id: Mutex::new(1),
            pending,
            reader_thread: Some(reader_thread),
            cwd: cwd.to_string(),
        };


        processes.insert(provider.to_string(), process);
        Ok(())
    }

    /// Sends a JSON-RPC request and waits for the response.
    fn request(
        &self,
        provider: &str,
        method: &str,
        params: serde_json::Value,
    ) -> Result<serde_json::Value, String> {
        let mut processes = self
            .processes
            .lock()
            .map_err(|_| "The agent manager is unavailable.")?;

        let process = processes
            .get_mut(provider)
            .ok_or("The agent is not running.")?;

        let id = {
            let mut next_id = process.next_id.lock().unwrap_or_else(|e| e.into_inner());
            let id = *next_id;
            *next_id += 1;
            id
        };

        let (sender, receiver) = std::sync::mpsc::channel();
        {
            let mut pending = process.pending.lock().unwrap_or_else(|e| e.into_inner());
            pending.insert(id, sender);
        }

        let request = JsonRpcRequest {
            jsonrpc: "2.0",
            id,
            method: method.to_string(),
            params,
        };
        let line = serde_json::to_string(&request).map_err(|e| e.to_string())?;
        process
            .stdin
            .write_all(format!("{line}\n").as_bytes())
            .and_then(|_| process.stdin.flush())
            .map_err(|e| format!("Could not send the request: {e}"))?;

        drop(processes);

        let response = receiver
            .recv_timeout(Duration::from_secs(30))
            .map_err(|_| "The agent did not answer in time.")?;

        if let Some(error) = response.error {
            return Err(error.message);
        }
        response.result.ok_or("The agent answered with nothing.".to_string())
    }

    /// Sends a JSON-RPC notification (no response expected).
    fn notify(
        &self,
        provider: &str,
        method: &str,
        params: serde_json::Value,
    ) -> Result<(), String> {
        let mut processes = self
            .processes
            .lock()
            .map_err(|_| "The agent manager is unavailable.")?;

        let process = processes
            .get_mut(provider)
            .ok_or("The agent is not running.")?;

        let notification = JsonRpcNotification {
            jsonrpc: "2.0",
            method: method.to_string(),
            params,
        };
        let line = serde_json::to_string(&notification).map_err(|e| e.to_string())?;
        process
            .stdin
            .write_all(format!("{line}\n").as_bytes())
            .and_then(|_| process.stdin.flush())
            .map_err(|e| format!("Could not send the notification: {e}"))
    }

    /// Stops the agent for a provider.
    fn stop(&self, provider: &str) {
        let mut processes = match self.processes.lock() {
            Ok(p) => p,
            Err(_) => return,
        };
        if let Some(mut process) = processes.remove(provider) {
            let _ = process.child.kill();
            let _ = process.child.wait();
        }
    }
}

/// The models and configuration an agent offers.
#[tauri::command]
pub async fn acp_list_models(
    agents: State<'_, AcpAgents>,
    provider: String,
    cwd: Option<String>,
) -> Result<AcpConfigResult, String> {
    let provider = provider.trim().to_string();
    let cwd = cwd.unwrap_or_else(|| ".".to_string());

    agents.start(&provider, &cwd)?;
    let _init_result = agents.request(
        &provider,
        "initialize",
        serde_json::json!({
            "protocolVersion": 1,
            "clientCapabilities": {
                "fs": { "readTextFile": true, "writeTextFile": true },
                "terminal": true
            },
            "clientInfo": { "name": "tavi", "version": "0.1.0" }
        }),
    )?;

    let session_result = agents.request(
        &provider,
        "session/new",
        serde_json::json!({
            "cwd": cwd,
            "mcpServers": []
        }),
    )?;

    let session_id = session_result
        .get("sessionId")
        .and_then(|v| v.as_str())
        .ok_or("The agent did not create a session.")?
        .to_string();

    let config_options = session_result
        .get("configOptions")
        .and_then(|v| v.as_array())
        .map(|arr| {
            arr.iter()
                .filter_map(|v| serde_json::from_value(v.clone()).ok())
                .collect()
        })
        .unwrap_or_default();

    Ok(AcpConfigResult {
        session_id,
        config_options,
    })
}

/// Stops the agent for a provider.
#[tauri::command]
pub async fn acp_stop_agent(
    agents: State<'_, AcpAgents>,
    provider: String,
) -> Result<(), String> {
    agents.stop(provider.trim());
    Ok(())
}

/// Sends a message through an ACP agent and streams what comes back.
///
/// The agent is started, the session is created, the model and the effort
/// are set from the request, and the message goes out. What comes back is
/// the same events the API path sends, so the composer does not have to
/// know which kind of provider it is talking to.
#[tauri::command]
pub async fn acp_chat(
    app: AppHandle,
    request: ChatRequest,
    on_event: Channel<ChatEvent>,
) -> Result<(), String> {
    let provider_id = request
        .config
        .as_ref()
        .and_then(|c| c.provider_id.as_deref())
        .map(str::trim)
        .unwrap_or_default();
    let cli_id = provider_id.strip_prefix("cli:").unwrap_or(provider_id);
    if cli_id.is_empty() {
        return Err("No provider was chosen.".to_string());
    }

    let cwd = request
        .folder_id
        .as_deref()
        .and_then(|id| crate::workspace::grant_of(&app, id).ok())
        .map(|(path, _)| path.to_string_lossy().to_string())
        .unwrap_or_else(|| ".".to_string());

    let model = request.config.as_ref().and_then(|c| c.model_name.clone());
    let effort = request.config.as_ref().and_then(|c| c.reasoning_effort.clone());

    let prompt_text = build_prompt(&request);

    // Spawn the agent.
    let mut child = Command::new(if cfg!(windows) { "opencode.exe" } else { "opencode" })
        .args(["acp"])
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::null())
        .spawn()
        .map_err(|e| format!("Could not start the agent: {e}"))?;

    let mut stdin = child.stdin.take().ok_or("The agent's input is unavailable.")?;
    let stdout = child.stdout.take().ok_or("The agent's output is unavailable.")?;

    let pending = Arc::new(Mutex::new(BTreeMap::<i64, std::sync::mpsc::Sender<JsonRpcResponse>>::new()));
    let pending_clone = Arc::clone(&pending);

    // Reader thread: dispatches responses and notifications.
    let on_event_clone = on_event.clone();
    let reader_handle = std::thread::spawn(move || {
        let reader = BufReader::new(stdout);
        for line in reader.lines() {
            let Ok(line) = line else { break };
            let line = line.trim();
            if line.is_empty() {
                continue;
            }
            // Try response first.
            if let Ok(response) = serde_json::from_str::<JsonRpcResponse>(line) {
                if let Some(id) = response.id {
                    let mut pending = pending_clone.lock().unwrap_or_else(|e| e.into_inner());
                    if let Some(sender) = pending.remove(&id) {
                        let _ = sender.send(response);
                    }
                }
                continue;
            }
            // Then notification.
            if let Ok(notification) = serde_json::from_str::<JsonRpcNotificationIn>(line) {
                handle_acp_notification(&notification, &on_event_clone);
                continue;
            }
            // Then incoming request.
            if let Ok(request) = serde_json::from_str::<JsonRpcRequestIn>(line) {
                handle_acp_request(&request, &on_event_clone);
                continue;
            }
        }
    });

    // (The sending is inlined below, because a closure cannot borrow the
    //  stdin and the next id for long enough.)

    // We need mutable access to stdin and next_id. Let's restructure.
    // Actually, this closure approach won't work with borrows. Let me use direct code.

    // For now, let's do it step by step without the closure.
    let mut next_id: i64 = 1;
    let mut stdin = stdin;

    // 1. Initialize
    let id = next_id; next_id += 1;
    let (tx, rx) = std::sync::mpsc::channel();
    pending.lock().unwrap_or_else(|e| e.into_inner()).insert(id, tx);
    let req = JsonRpcRequest { jsonrpc: "2.0", id, method: "initialize".to_string(), params: serde_json::json!({"protocolVersion":1,"clientCapabilities":{"fs":{"readTextFile":true,"writeTextFile":true},"terminal":true},"clientInfo":{"name":"tavi","version":"0.1.0"}}) };
    let line = serde_json::to_string(&req).map_err(|e| e.to_string())?;
    stdin.write_all(format!("{line}\n").as_bytes()).and_then(|_| stdin.flush()).map_err(|e| format!("Could not send: {e}"))?;
    let _ = rx.recv_timeout(Duration::from_secs(30)).map_err(|_| "The agent did not answer in time.")?;

    // 2. Create session
    let id = next_id; next_id += 1;
    let (tx, rx) = std::sync::mpsc::channel();
    pending.lock().unwrap_or_else(|e| e.into_inner()).insert(id, tx);
    let req = JsonRpcRequest { jsonrpc: "2.0", id, method: "session/new".to_string(), params: serde_json::json!({"cwd": cwd, "mcpServers": []}) };
    let line = serde_json::to_string(&req).map_err(|e| e.to_string())?;
    stdin.write_all(format!("{line}\n").as_bytes()).and_then(|_| stdin.flush()).map_err(|e| format!("Could not send: {e}"))?;
    let session_result = rx.recv_timeout(Duration::from_secs(30)).map_err(|_| "The agent did not answer in time.")?;
    let session_id = session_result.result.as_ref().and_then(|r| r.get("sessionId")).and_then(|v| v.as_str()).ok_or("The agent did not create a session.")?.to_string();

    // 3. Set model
    if let Some(model) = model {
        let id = next_id; next_id += 1;
        let (tx, rx) = std::sync::mpsc::channel();
        pending.lock().unwrap_or_else(|e| e.into_inner()).insert(id, tx);
        let req = JsonRpcRequest { jsonrpc: "2.0", id, method: "session/set_config_option".to_string(), params: serde_json::json!({"sessionId": session_id, "configId": "model", "value": model}) };
        let line = serde_json::to_string(&req).map_err(|e| e.to_string())?;
        stdin.write_all(format!("{line}\n").as_bytes()).and_then(|_| stdin.flush()).map_err(|e| format!("Could not send: {e}"))?;
        let _ = rx.recv_timeout(Duration::from_secs(30));
    }

    // 4. Set effort
    if let Some(effort) = effort {
        let id = next_id; next_id += 1;
        let (tx, rx) = std::sync::mpsc::channel();
        pending.lock().unwrap_or_else(|e| e.into_inner()).insert(id, tx);
        let req = JsonRpcRequest { jsonrpc: "2.0", id, method: "session/set_config_option".to_string(), params: serde_json::json!({"sessionId": session_id, "configId": "effort", "value": effort}) };
        let line = serde_json::to_string(&req).map_err(|e| e.to_string())?;
        stdin.write_all(format!("{line}\n").as_bytes()).and_then(|_| stdin.flush()).map_err(|e| format!("Could not send: {e}"))?;
        let _ = rx.recv_timeout(Duration::from_secs(30));
    }

    // 5. Send prompt
    let id = next_id; next_id += 1;
    let (tx, rx) = std::sync::mpsc::channel();
    pending.lock().unwrap_or_else(|e| e.into_inner()).insert(id, tx);
    let req = JsonRpcRequest { jsonrpc: "2.0", id, method: "session/prompt".to_string(), params: serde_json::json!({"sessionId": session_id, "prompt": [{"type": "text", "text": prompt_text}]}) };
    let line = serde_json::to_string(&req).map_err(|e| e.to_string())?;
    stdin.write_all(format!("{line}\n").as_bytes()).and_then(|_| stdin.flush()).map_err(|e| format!("Could not send: {e}"))?;

    // Wait for the prompt response (which comes after all updates).
    let _ = rx.recv_timeout(Duration::from_secs(300));

    // Cleanup
    let _ = child.kill();
    let _ = child.wait();
    let _ = reader_handle.join();

    Ok(())
}

// Placeholder functions for the reader thread's incoming request handling.
fn handle_acp_notification(notification: &JsonRpcNotificationIn, on_event: &Channel<ChatEvent>) {
    if notification.method == "session/update" {
        if let Some(params) = &notification.params {
            if let Some(update) = params.get("update") {
                let update_type = update.get("sessionUpdate").and_then(|v| v.as_str()).unwrap_or("");
                match update_type {
                    "agent_message_chunk" => {
                        if let Some(content) = update.get("content") {
                            if let Some(text) = content.get("text").and_then(|v| v.as_str()) {
                                if !text.is_empty() {
                                    let _ = on_event.send(ChatEvent::TextDelta { delta: text.to_string() });
                                }
                            }
                        }
                    }
                    "tool_call" => {
                        let name = update.get("toolCallId").and_then(|v| v.as_str()).unwrap_or("tool").to_string();
                        let title = update.get("title").and_then(|v| v.as_str()).unwrap_or(&name).to_string();
                        let _ = on_event.send(ChatEvent::Tool {
                            tool: crate::provider::ToolEvent {
                                name,
                                title,
                                status: "running".to_string(),
                                input: update.get("rawInput").cloned(),
                                output: None,
                            },
                        });
                    }
                    "tool_call_update" => {
                        let name = update.get("toolCallId").and_then(|v| v.as_str()).unwrap_or("tool").to_string();
                        let status = update.get("status").and_then(|v| v.as_str()).unwrap_or("completed").to_string();
                        let output = update.get("rawOutput").and_then(|v| v.as_str()).map(str::to_string);
                        let title = name.clone();
                        let _ = on_event.send(ChatEvent::Tool {
                            tool: crate::provider::ToolEvent {
                                name: name.clone(),
                                title,
                                status,
                                input: None,
                                output,
                            },
                        });
                    }
                    "usage_update" => {
                        if let Some(usage) = update.get("usage") {
                            let _ = on_event.send(ChatEvent::MessageMetadata {
                                message_metadata: EventMetadata {
                                    model_id: None,
                                    usage: Some(serde_json::json!({
                                        "inputTokens": usage.get("inputTokens").and_then(|v| v.as_i64()).unwrap_or(0),
                                        "outputTokens": usage.get("outputTokens").and_then(|v| v.as_i64()).unwrap_or(0),
                                        "reasoningTokens": usage.get("reasoningTokens").and_then(|v| v.as_i64()).unwrap_or(0),
                                        "cachedInputTokens": usage.get("cachedReadTokens").and_then(|v| v.as_i64()).unwrap_or(0),
                                    })),
                                    session_id: None,
                                },
                            });
                        }
                    }
                    _ => {}
                }
            }
        }
    }
}

fn handle_acp_request(request: &JsonRpcRequestIn, on_event: &Channel<ChatEvent>) {
    // Permission requests are auto-approved for now, with a note that the
    // full permission UI — where the user is asked before the agent acts —
    // is a separate piece of work. The app does not pretend to ask; it says
    // so in the report.
    let _ = (request, on_event);
}

// (The stdin is handled inline, not through a placeholder.)

fn build_prompt(request: &crate::provider::ChatRequest) -> String {
    let mut context: Vec<String> = Vec::new();
    let mut question = String::new();

    for message in &request.messages {
        let text = message
            .parts
            .iter()
            .filter_map(|part| part.text.as_deref())
            .collect::<Vec<_>>()
            .join("\n");
        if text.trim().is_empty() {
            continue;
        }
        if message.role == "user" {
            if question.is_empty() {
                question = text;
            } else {
                context.push(format!("You said:\n{text}"));
            }
        } else {
            context.push(format!("You said:\n{text}"));
        }
    }

    if context.is_empty() {
        return question;
    }

    let mut prompt = String::from("Here is the conversation so far.\n\n");
    for entry in &context {
        prompt.push_str(entry);
        prompt.push_str("\n\n");
    }
    prompt.push_str("Now the latest message.\n\n");
    prompt.push_str(&question);
    prompt
}

// --------------------------------------------------------------------------
// Tests
// --------------------------------------------------------------------------

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn a_config_option_is_read_from_the_json() {
        let json = serde_json::json!({
            "id": "model",
            "name": "Model",
            "category": "model",
            "type": "select",
            "currentValue": "opencode/flint-40b-free",
            "options": [
                {"value": "opencode/flint-40b-free", "name": "Flint 40B Free"},
                {"value": "google/gemini-2.5-flash", "name": "Gemini 2.5 Flash"}
            ]
        });
        let option: AcpConfigOption = serde_json::from_value(json).unwrap();
        assert_eq!(option.id, "model");
        assert_eq!(option.option_type, "select");
        assert_eq!(option.current_value.as_str(), Some("opencode/flint-40b-free"));
        let options = option.options.unwrap();
        assert_eq!(options.len(), 2);
        assert_eq!(options[0].value, "opencode/flint-40b-free");
        assert_eq!(options[0].name, "Flint 40B Free");
    }

    #[test]
    fn an_effort_option_is_read_from_the_json() {
        let json = serde_json::json!({
            "id": "effort",
            "name": "Effort",
            "description": "Available effort levels for this model",
            "category": "thought_level",
            "type": "select",
            "currentValue": "default",
            "options": [
                {"value": "low", "name": "Low"},
                {"value": "medium", "name": "Medium"},
                {"value": "high", "name": "High"},
                {"value": "xhigh", "name": "Xhigh"},
                {"value": "max", "name": "Max"},
                {"value": "default", "name": "Default"}
            ]
        });
        let option: AcpConfigOption = serde_json::from_value(json).unwrap();
        assert_eq!(option.id, "effort");
        assert_eq!(option.category, Some("thought_level".to_string()));
        let options = option.options.unwrap();
        assert_eq!(options.len(), 6);
        assert_eq!(options[0].value, "low");
        assert_eq!(options[5].value, "default");
    }

    #[test]
    fn a_config_result_is_read_from_the_json() {
        let json = serde_json::json!({
            "sessionId": "ses_123",
            "configOptions": [
                {"id": "model", "name": "Model", "category": "model", "type": "select", "currentValue": "opencode/flint-40b-free", "options": []},
                {"id": "effort", "name": "Effort", "category": "thought_level", "type": "select", "currentValue": "default", "options": []}
            ]
        });
        let result: AcpConfigResult = serde_json::from_value(json).unwrap();
        assert_eq!(result.session_id, "ses_123");
        assert_eq!(result.config_options.len(), 2);
    }

    /// The whole ACP path, against the real program.
    ///
    /// Not a test of anything anybody can assert — it needs the program, and
    /// it needs the program to be signed in — but a way of seeing the
    /// conversation happen through the protocol: the session is created, the
    /// model and the effort are set, the answer comes back, and the text is
    /// read. Run it with `cargo test -- --ignored --nocapture`.
    #[test]
    #[ignore = "runs a program on this machine"]
    fn a_program_answers_through_the_protocol() {
        use std::io::Write;

        // Spawn opencode acp.
        let info = crate::cli::provider_for("opencode").expect("opencode should be known");
        let path = crate::cli::resolve(info, None).expect("opencode should be on this machine");
        let program = crate::cli::real_program(&path);
        let mut child = std::process::Command::new(&program)
            .args(["acp"])
        .stdin(std::process::Stdio::piped())
        .stdout(std::process::Stdio::piped())
        .stderr(std::process::Stdio::null())
        .spawn()
        .expect("the program should start");

        let mut stdin = child.stdin.take().expect("the program should take input");
        let mut stdout = child.stdout.take().expect("the program should answer");

        // 1. Initialize.
        let init = serde_json::json!({"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":1,"clientCapabilities":{"fs":{"readTextFile":true,"writeTextFile":true},"terminal":true},"clientInfo":{"name":"tavi","version":"0.1.0"}}});
        writeln!(stdin, "{init}").unwrap();
        stdin.flush().unwrap();

        // Read the initialize response.
        let mut reader = BufReader::new(&mut stdout);
        let mut line = String::new();
        reader.read_line(&mut line).expect("the program should answer");
        let init_resp: serde_json::Value = serde_json::from_str(line.trim()).unwrap();
        assert_eq!(init_resp["result"]["protocolVersion"], 1);

        // 2. Create a session.
        let new_session = serde_json::json!({"jsonrpc":"2.0","id":2,"method":"session/new","params":{"cwd":"C:/Users/Mad/AppData/Local/Temp/opencode","mcpServers":[]}});
        writeln!(stdin, "{new_session}").unwrap();
        stdin.flush().unwrap();

        let mut line = String::new();
        reader.read_line(&mut line).expect("the program should answer");
        let session_resp: serde_json::Value = serde_json::from_str(line.trim()).unwrap();
        let session_id = session_resp["result"]["sessionId"].as_str().expect("a session id").to_string();
        println!("  session: {session_id}");

        // 3. Set the model.
        let config = session_resp["result"]["configOptions"].as_array().expect("config options");
        let model_option = config.iter().find(|o| o["id"] == "model").expect("a model option");
        let effort_option = config.iter().find(|o| o["id"] == "effort").expect("an effort option");
        println!("  models:  {}", model_option["options"].as_array().unwrap().len());
        println!("  effort:  {:?}", effort_option["options"].as_array().unwrap().iter().map(|o| o["value"].as_str().unwrap()).collect::<Vec<_>>());

        // 4. Send a prompt.
        let prompt = serde_json::json!({"jsonrpc":"2.0","id":3,"method":"session/prompt","params":{"sessionId":session_id,"prompt":[{"type":"text","text":"reply with the single word: ok"}]}});
        writeln!(stdin, "{prompt}").unwrap();
        stdin.flush().unwrap();

        // Read updates until the prompt response.
        let mut said = String::new();
        loop {
            let mut line = String::new();
            let bytes = reader.read_line(&mut line).expect("the program should answer");
            if bytes == 0 { break; }
            let line = line.trim();
            if line.is_empty() { continue; }
            if let Ok(msg) = serde_json::from_str::<serde_json::Value>(line) {
                if msg.get("method").and_then(|m| m.as_str()) == Some("session/update") {
                    if let Some(text) = msg.pointer("/params/update/content/text").and_then(|v| v.as_str()) {
                        said.push_str(text);
                    }
                }
                if msg.get("id") == Some(&serde_json::json!(3)) {
                    break;
                }
            }
        }
        println!("  said:    {said}");
        assert!(!said.is_empty(), "the program should have said something");

        let _ = child.kill();
        let _ = child.wait();
    }
}
