"use client";

import { AssistantChatTransport, useChatRuntime } from "@assistant-ui/ai-sdk";
import {
  AssistantRuntimeProvider,
  AuiConfig,
  Tools,
} from "@assistant-ui/react";
import { lastAssistantMessageIsCompleteWithToolCalls } from "ai";

import { Thread } from "@/components/thread.aui";
import { DesktopToolGate } from "@/components/desktop-tool-gate";
import { authHeaders } from "@/lib/secret";
import toolkit from "@/toolkit";

/**
 * The AI SDK runtime, wired to the separate chat server. Vite proxies `/api`
 * to that process in development, so the relative path works unchanged from
 * the Tauri webview.
 *
 * This mounts `AssistantRuntimeProvider` itself, so it must not be wrapped in
 * another one, and the Thread must sit inside a container with a real height.
 */
export const Assistant = () => {
  const runtime = useChatRuntime({
    // Runs the follow-up round-trip automatically once a tool round completes,
    // which is what pairs with the server's step limit.
    sendAutomaticallyWhen: lastAssistantMessageIsCompleteWithToolCalls,
    // Headers are resolved per request, so a key stored in the OS credential
    // store is read immediately before use and never held longer than that.
    // Returns nothing in the browser, where the server falls back to its
    // environment variable.
    transport: new AssistantChatTransport({
      api: "/api/chat",
      headers: authHeaders,
    }),
  });

  // One config object only. If this component later needs more configuration,
  // add the key here rather than creating a second AuiConfig.
  const config = AuiConfig({ tools: Tools({ toolkit }) });

  return (
    <AssistantRuntimeProvider runtime={runtime} config={config}>
      {/* Drops the desktop-only tools from the model's tool set when running in
          a browser, so it is never offered tools it cannot execute. */}
      <DesktopToolGate />
      {/* The model picker lives in the composer rail inside the generated
          Thread, so it is already inside this provider and can register its
          selection with assistant-ui's model context. */}
      <Thread />
    </AssistantRuntimeProvider>
  );
};