import { createServer } from "node:http";
import type { IncomingMessage, ServerResponse } from "node:http";
import { Readable } from "node:stream";
import { frontendTools } from "@assistant-ui/ai-sdk";
import type { FrontendTools } from "@assistant-ui/ai-sdk";
import { createOpenRouter } from "@openrouter/ai-sdk-provider";
import {
  convertToModelMessages,
  createUIMessageStreamResponse,
  stepCountIs,
  streamText,
  toUIMessageStream,
} from "ai";
import type { ToolSet, UIMessage } from "ai";

import { fetchKeyStatus } from "./key-status.ts";
import { getCatalog, modelSupportsEffort } from "./models.ts";

/**
 * The Tauri window loads a static Vite bundle, so there is no server colocated
 * with the frontend. This process serves the streaming chat route instead; Vite
 * proxies `/api` here during development (see `server.proxy` in vite.config.ts).
 */

const PORT = Number(process.env.CHAT_SERVER_PORT ?? 8787);

const REASONING_EFFORTS = [
  "xhigh",
  "high",
  "medium",
  "low",
  "minimal",
  "none",
] as const;

type ReasoningEffort = (typeof REASONING_EFFORTS)[number];

const isReasoningEffort = (value: unknown): value is ReasoningEffort =>
  typeof value === "string" &&
  (REASONING_EFFORTS as readonly string[]).includes(value);

const openrouter = createOpenRouter({
  apiKey: process.env.OPENROUTER_API_KEY,
});

type ChatConfig = {
  modelName?: string;
  reasoningEffort?: string;
};

async function handleChat(request: Request): Promise<Response> {
  const body = (await request.json()) as {
    messages: UIMessage[];
    system?: string;
    tools?: FrontendTools;
    config?: ChatConfig;
    // The client may also merge effort at the top level rather than inside
    // `config`; both are accepted so the wiring choice does not matter.
    reasoningEffort?: string;
  };
  const { messages, system, tools } = body;

  // There is deliberately no fallback here. The model has to be the one the
  // picker is showing; substituting a default would stream from a model the
  // user never chose, and did not even know was in play.
  const modelName = body.config?.modelName?.trim();
  if (!modelName) {
    console.log("[chat] rejected: request carried no model");
    return Response.json(
      { error: "No model selected. Pick a model before sending." },
      { status: 400 },
    );
  }

  const requestedEffort =
    body.config?.reasoningEffort ?? body.reasoningEffort;
  const effort = isReasoningEffort(requestedEffort)
    ? requestedEffort
    : undefined;

  // Never forward an unsupported parameter; several models reject it outright.
  const supportsEffort = effort ? await modelSupportsEffort(modelName) : false;

  // Logs the resolved model and whether effort was applied. No key, no headers,
  // no request body.
  console.log(
    `[chat] model=${modelName} effort=${effort ?? "none"}${
      effort && !supportsEffort ? " (dropped: model lacks effort support)" : ""
    }`,
  );

  // AssistantChatTransport forwards system messages and any frontend tools the
  // provider registered, so both have to be rehydrated here.
  const aiSDKTools: ToolSet = tools ? { ...frontendTools(tools) } : {};

  const result = streamText({
    abortSignal: request.signal,
    model: openrouter(modelName),
    system,
    messages: await convertToModelMessages(messages, { tools: aiSDKTools }),
    tools: aiSDKTools,
    // Without a stop condition the SDK runs a single inference step, so a tool
    // call would consume the only step and the run would end with the tool
    // result and no assistant reply. Five covers realistic tool chains while
    // capping what a confused run can burn on the free tier.
    stopWhen: stepCountIs(5),
    ...(supportsEffort && effort
      ? {
          providerOptions: {
            openrouter: { reasoning: { effort } },
          },
        }
      : {}),
  });

  return createUIMessageStreamResponse({
    stream: toUIMessageStream({
      stream: result.stream,
      messageMetadata: ({ part }) => {
        if (part.type === "finish") {
          return { usage: part.totalUsage };
        }
        if (part.type === "finish-step") {
          return { modelId: part.response.modelId };
        }
        return undefined;
      },
    }),
  });
}

const readBody = (req: IncomingMessage): Promise<Buffer> =>
  new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on("data", (chunk: Buffer) => chunks.push(chunk));
    req.on("end", () => resolve(Buffer.concat(chunks)));
    req.on("error", reject);
  });

const sendJson = (res: ServerResponse, status: number, body: unknown) => {
  const payload = JSON.stringify(body);
  res.writeHead(status, {
    "content-type": "application/json",
    "content-length": Buffer.byteLength(payload),
  });
  res.end(payload);
};

const server = createServer(async (req, res) => {
  const url = new URL(req.url ?? "/", `http://localhost:${PORT}`);

  if (url.pathname === "/api/health") {
    sendJson(res, 200, { ok: true });
    return;
  }

  if (url.pathname === "/api/models") {
    try {
      const { models, stale } = await getCatalog();
      sendJson(res, 200, { models, stale });
    } catch (error) {
      // Say so plainly rather than returning an empty picker.
      sendJson(res, 503, {
        error:
          error instanceof Error
            ? error.message
            : "Model catalog unavailable.",
      });
    }
    return;
  }

  if (url.pathname === "/api/key") {
    if (!process.env.OPENROUTER_API_KEY) {
      sendJson(res, 200, { valid: false, reason: "No key configured." });
      return;
    }
    // Never logs or echoes the key.
    sendJson(res, 200, await fetchKeyStatus(process.env.OPENROUTER_API_KEY));
    return;
  }

  if (url.pathname !== "/api/chat") {
    sendJson(res, 404, { error: "Not found" });
    return;
  }

  if (req.method !== "POST") {
    res.writeHead(405, { allow: "POST" });
    res.end();
    return;
  }

  if (!process.env.OPENROUTER_API_KEY) {
    sendJson(res, 500, { error: "OPENROUTER_API_KEY is not set" });
    return;
  }

  // Abort the model call when the webview goes away, so the stream stops
  // upstream instead of running to completion for nobody.
  const controller = new AbortController();
  res.on("close", () => controller.abort());

  const request = new Request(`http://localhost:${PORT}/api/chat`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: new Uint8Array(await readBody(req)),
    signal: controller.signal,
  });

  try {
    const response = await handleChat(request);
    console.log(`[chat] ${req.method} ${url.pathname} -> ${response.status}`);
    res.writeHead(response.status, Object.fromEntries(response.headers));

    if (response.body) {
      Readable.fromWeb(response.body as never).pipe(res);
    } else {
      res.end();
    }
  } catch (error) {
    if (controller.signal.aborted) {
      res.end();
      return;
    }
    // Logs the failure only. Request bodies and headers are never logged, so a
    // key carried as an authorization header cannot leak through this path.
    console.error(
      "[chat] request failed:",
      error instanceof Error ? error.message : error,
    );
    sendJson(res, 500, {
      error: error instanceof Error ? error.message : "Chat request failed",
    });
  }
});

server.listen(PORT, () => {
  console.log(`[chat] streaming route on http://localhost:${PORT}/api/chat`);
  console.log(
    `[chat] no default model; key ${
      process.env.OPENROUTER_API_KEY ? "found" : "MISSING"
    }`,
  );
});