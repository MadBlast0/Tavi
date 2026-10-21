/**
 * The transport to the model.
 *
 * There are two servers behind this: the Node one that serves the website, and
 * the Rust one that serves the desktop app. The request is the same and the
 * events are the same, so everything above this file does not know which one
 * it is talking to.
 *
 * On the desktop the provider key never comes near here. Rust reads it from
 * the credential store, makes the request, and streams the answer back — so
 * there is no credential in JavaScript, and no local port for another process
 * to post to.
 */

import { Channel, invoke } from "@tauri-apps/api/core"

import { openRouterCatalogue, type SlimModel } from "./catalogue.ts"
import { isDesktopApp } from "./desktop.ts"

/** Shape of what the provider says about the key. */
export type KeyStatus = {
  valid: boolean;
  reason?: string;
  label?: string;
  limit?: number | null;
  remaining?: number | null;
  usage?: number | null;
  isFreeTier?: boolean;
};

/** One message in a request. */
export type ChatMessage = {
  id?: string;
  role: "user" | "assistant" | "system";
  parts: { type: string; text?: string }[];
};

/** The request, in the shape both servers accept. */
export type ChatRequest = {
  messages: ChatMessage[];
  /** Which surface the request came from. */
  variant: "chat" | "code";
  /** The agent mode. Code only. */
  mode?: string;
  /** The folder's name. Code only. */
  folder?: string;
  config?: {
    modelName?: string;
    reasoningEffort?: string;
  };
};

/** What the provider reported for the turn that just ended. */
export type ChatUsage = {
  inputTokens?: number;
  outputTokens?: number;
  totalTokens?: number;
  reasoningTokens?: number;
  cachedInputTokens?: number;
};

/** What the servers send back as the answer arrives. */
export type ChatEvent =
  | { type: "text-delta"; delta: string }
  | {
      type: "message-metadata";
      messageMetadata?: { modelId?: string; usage?: ChatUsage };
    }
  | { type: "finish"; messageMetadata?: { modelId?: string; usage?: ChatUsage } }
  | { type: "error"; errorText: string };

/**
 * The model catalogue, in the shape the picker reads.
 *
 * The website's server sends it ready-made. The desktop app gets the raw
 * catalogue from Rust and reads it here, with the same code the server uses,
 * so the picker offers the same models either way.
 */
export const fetchModels = async (): Promise<{
  models: SlimModel[];
  stale: boolean;
}> => {
  if (isDesktopApp()) {
    const raw = await invoke<string>("model_catalogue", { force: false });
    return {
      models: openRouterCatalogue(JSON.parse(raw), {
        connectionId: "openrouter",
        providerId: "openrouter",
        apiProtocol: "openai-chat-completions",
      }),
      stale: false,
    };
  }

  const response = await fetch("/api/models");
  if (!response.ok) {
    /* The server's own words, not a status code. It knows why it refused —
       most often that there is no provider key — and a number is not a
       reason. */
    const detail = (await response.json().catch(() => null)) as {
      error?: string;
    } | null;
    throw new Error(
      detail?.error ?? `The model catalogue is unavailable (${response.status}).`,
    );
  }
  return (await response.json()) as { models: SlimModel[]; stale: boolean };
};

/** What the provider says about the key. */
export const fetchKeyStatus = async (): Promise<KeyStatus> => {
  if (isDesktopApp()) {
    return invoke<KeyStatus>("key_status");
  }
  const response = await fetch("/api/key");
  if (!response.ok) {
    throw new Error(`The key's standing is unavailable (${response.status}).`);
  }
  return (await response.json()) as KeyStatus;
};

/**
 * Sends a chat and reports what comes back.
 *
 * The events are the ones the composer already reads off the stream, so the
 * two servers are interchangeable from there on.
 */
export const streamChat = async (
  request: ChatRequest,
  onEvent: (event: ChatEvent) => void,
  signal?: AbortSignal,
): Promise<void> => {
  if (isDesktopApp()) {
    await desktopChat(request, onEvent, signal);
    return;
  }
  await webChat(request, onEvent, signal);
};

/**
 * The desktop path: Rust makes the request and streams the events back.
 *
 * A Tauri call cannot be cancelled from here, so a request that is stopped is
 * stopped by telling Rust to stop it.
 */
const desktopChat = async (
  request: ChatRequest,
  onEvent: (event: ChatEvent) => void,
  signal?: AbortSignal,
): Promise<void> => {
  const requestId = `chat-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const channel = new Channel<ChatEvent>();
  channel.onmessage = onEvent;

  const cancel = () => {
    void invoke("cancel_chat", { requestId }).catch(() => {});
  };
  signal?.addEventListener("abort", cancel);

  try {
    await invoke("chat", { request: { ...request, requestId }, onEvent: channel });
  } finally {
    signal?.removeEventListener("abort", cancel);
  }
};

/** The website's path: a fetch, and a stream of `data:` lines. */
const webChat = async (
  request: ChatRequest,
  onEvent: (event: ChatEvent) => void,
  signal?: AbortSignal,
): Promise<void> => {
  const response = await fetch("/api/chat", {
    method: "POST",
    headers: { "content-type": "application/json" },
    signal,
    body: JSON.stringify(request),
  });

  if (!response.ok) {
    const detail = (await response.json().catch(() => null)) as {
      error?: string;
    } | null;
    throw new Error(detail?.error ?? `HTTP ${response.status}`);
  }
  if (!response.body) throw new Error("No response body");

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() ?? "";
    for (const line of lines) {
      if (!line.startsWith("data:")) continue;
      const payload = line.slice(5).trim();
      if (!payload || payload === "[DONE]") continue;
      let event: ChatEvent;
      try {
        event = JSON.parse(payload) as ChatEvent;
      } catch {
        /* Partial JSON: the rest of it is still coming. */
        continue;
      }
      /* The handler is called outside the parse's catch on purpose. A handler
         that throws is saying the turn failed, and catching it here would end
         the stream with no text, no error and nothing to show — which is what
         a failed turn looks like from the outside. */
      onEvent(event);
    }
  }
};
