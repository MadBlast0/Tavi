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
import { defaultConnection, getCatalog, modelCapabilities } from "./models.ts";
import {
  cloneRepository,
  listProjects,
  projectsRoot,
} from "./projects.ts";
import { adapterFor, type OpenRouterProviderOptions } from "./providers.ts";
import { buildSystemPrompt, type Variant } from "./system.ts";

/**
 * The Tauri window loads a static Vite bundle, so there is no server colocated
 * with the frontend. This process serves the streaming chat route instead; Vite
 * proxies `/api` here during development (see `server.proxy` in vite.config.ts).
 */

const PORT = Number(process.env.CHAT_SERVER_PORT ?? 8787);

const openrouter = createOpenRouter({
  apiKey: process.env.OPENROUTER_API_KEY,
});

type ChatConfig = {
  modelName?: string;
  /**
   * How hard to reason, on one scale that includes `none` for "do not reason".
   * There is no separate on/off: providers express turning reasoning off as the
   * bottom of this same dial.
   */
  reasoningEffort?: string;
};

async function handleChat(request: Request): Promise<Response> {
  const body = (await request.json()) as {
    messages: UIMessage[];
    /**
     * Which surface the request came from.
     *
     * The server writes the system prompt, so this is what decides what the
     * model is told. It is required, and an unknown one is refused rather than
     * defaulted: a request that did not say where it came from cannot be given
     * a prompt that is right for either.
     */
    variant?: Variant;
    /** The agent mode. Code only. */
    mode?: string;
    /** The folder's name. Code only. */
    folder?: string;
    tools?: FrontendTools;
    config?: ChatConfig;
    /**
     * The client used to send the system prompt as prose.
     *
     * It is refused now. The server writes the prompt, and a request that
     * brings its own would be a request that can say anything — which is
     * exactly what the surface is supposed to prevent.
     */
    system?: string;
    // The client may also merge these at the top level rather than inside
    // `config`; both are accepted so the wiring choice does not matter.
    reasoningEffort?: string;
  };
  const { messages, tools, variant, mode, folder } = body;

  if (typeof body.system === "string") {
    console.log("[chat] rejected: request carried its own system prompt");
    return Response.json(
      { error: "The system prompt is written by the server." },
      { status: 400 },
    );
  }

  if (variant !== "chat" && variant !== "code") {
    console.log("[chat] rejected: request carried no surface");
    return Response.json(
      {
        error:
          "No surface selected. Say whether this is a chat or a code session.",
      },
      { status: 400 },
    );
  }

  /**
   * A chat cannot carry tools.
   *
   * The whole point of the surface is that a conversation does not reach the
   * machine, and a request that arrives with tools attached is a request that
   * is trying to. The check is here rather than in the composer because a rule
   * the client can ignore is not a rule.
   */
  if (variant === "chat" && tools) {
    console.log("[chat] rejected: a chat carried tools");
    return Response.json(
      { error: "A chat cannot carry tools. Start a code session instead." },
      { status: 400 },
    );
  }

  // The system prompt is written here, from the facts the client sent.
  const system = buildSystemPrompt({ variant, mode, folderName: folder });

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

  /* The provider adapter owns validation and serialisation for this connection.
     It refuses an explicit value the model cannot honour instead of substituting
     another one: a silently-downgraded effort is indistinguishable from the
     model simply running at a lower setting. A provider default serialises to an
     omitted field, never to a guessed `medium`. */
  const connection = defaultConnection();
  const adapter = adapterFor(connection.providerId);
  const capabilities = await modelCapabilities(connection, modelName);

  let reasoningFields: OpenRouterProviderOptions | Record<string, never> = {};
  if (adapter && capabilities) {
    const requestedEffort =
      body.config?.reasoningEffort ?? body.reasoningEffort;

    const serialized = adapter.serializeReasoning(capabilities, {
      effort:
        requestedEffort === undefined || requestedEffort === null
          ? { mode: "provider_default" }
          : { mode: "explicit", value: String(requestedEffort) },
      thinkingMode: { mode: "provider_default" },
    });

    if (serialized.kind === "reject") {
      console.log(`[chat] rejected: ${serialized.message}`);
      return Response.json({ error: serialized.message }, { status: 400 });
    }
    if (serialized.kind === "payload") {
      // The adapter returns provider-native fields; they are namespaced here for
      // whichever provider client is in use.
      reasoningFields =
        connection.providerId === "openrouter"
          ? { openrouter: serialized.fields as OpenRouterProviderOptions["openrouter"] }
          : (serialized.fields as Record<string, never>);
    }
  }

  const applied = Object.keys(reasoningFields).length
    ? JSON.stringify(reasoningFields)
    : "provider default";
  // Logs the resolved model, the surface it came from and the fields actually
  // serialised. No key, no headers, no request body.
  console.log(
    `[chat] surface=${variant} model=${modelName} reasoning=${applied}`,
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
    ...(Object.keys(reasoningFields).length
      ? { providerOptions: reasoningFields }
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

/**
 * Cloning runs `git` against this machine's filesystem, so it is only offered to
 * requests that originated here. Anything else is a different process making a
 * request the app has no reason to honour.
 */
const isLoopback = (req: IncomingMessage): boolean => {
  const address = req.socket.remoteAddress ?? "";
  return (
    address === "127.0.0.1" ||
    address === "::1" ||
    address === "::ffff:127.0.0.1" ||
    address === ""
  );
};

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

  /* Where cloned repositories live, so the composer can tell the user before
     they paste a URL rather than after. The folder is not created here: it is
     made when a clone is actually started. */
  if (url.pathname === "/api/projects") {
    try {
      sendJson(res, 200, {
        root: projectsRoot(),
        projects: await listProjects(),
      });
    } catch (error) {
      sendJson(res, 500, {
        error: `Could not read the projects folder: ${(error as Error).message}`,
      });
    }
    return;
  }

  /* Runs on this machine, so it is restricted to loopback. A request that
     arrives from elsewhere is not from this app's own page. */
  if (url.pathname === "/api/projects/clone") {
    if (!isLoopback(req)) {
      sendJson(res, 403, { error: "Cloning is only available to the local app." });
      return;
    }
    let body: { url?: string; destination?: string };
    try {
      const raw = await readBody(req);
      body = JSON.parse(raw.toString("utf8")) as { url?: string; destination?: string };
    } catch {
      sendJson(res, 400, { error: "Could not read the request body." });
      return;
    }
    const result = await cloneRepository(body.url ?? "", body.destination);
    sendJson(res, result.ok ? 200 : 400, result);
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