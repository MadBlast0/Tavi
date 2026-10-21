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

import { fetchProviderStatus, listProviderKeys } from "./key-status.ts";
import {
  activateKey,
  activeKey,
  findKey,
  keyWithoutSecret,
  removeKey,
  renameKey,
  replaceSecret,
  serverCredential,
  storeKey,
} from "./key-store.ts";
import { providerFor } from "../src/lib/providers.ts";
import { redact } from "../src/lib/redact.ts";
import { defaultConnection, getCatalog, modelCapabilities } from "./models.ts";
import {
  cloneRepository,
  listProjects,
  projectsRoot,
} from "./projects.ts";
import { adapterFor, type OpenRouterProviderOptions } from "./providers.ts";
import { buildSystemPrompt, type Variant } from "./system.ts";

/**
 * The website's server: the `/api` routes, the streaming chat route among them.
 * The Tauri window loads a static Vite bundle, so there is no server colocated
 * with the frontend; Vite proxies `/api` here (see `server.proxy` in vite.config.ts).
 */

const PORT = Number(process.env.CHAT_SERVER_PORT ?? 8787);

/**
 * Where the server listens.
 *
 * The loopback interface, and only the loopback interface. A server that
 * binds every interface is reachable from every machine on the network, which
 * is how the settings pane's key routes used to be open to a host on the
 * LAN.
 *
 * A deployment that puts the server behind a proxy on another machine sets
 * `TAVI_BIND_HOST` — and then has to answer for the routes it exposes, which
 * is what the checks below are about.
 */
const BIND_HOST = process.env.TAVI_BIND_HOST?.trim() || "127.0.0.1";

/**
 * The names this server answers to.
 *
 * A request whose `Host` header is not one of these is not for this server.
 * It is the mitigation for DNS rebinding, where a name that resolves to this
 * machine is pointed at the server from a page the user happens to be
 * visiting: the browser believes the page and the server are the same origin,
 * and the only thing that says otherwise is the name in the header.
 *
 * A deployment behind a proxy adds its own name to `TAVI_ALLOWED_HOSTS`.
 */
const ALLOWED_HOSTS = new Set(
  (
    process.env.TAVI_ALLOWED_HOSTS ??
    "localhost,127.0.0.1,[::1],::1"
  )
    .split(",")
    .map((host) => host.trim().toLowerCase())
    .filter(Boolean),
);

/**
 * The header a request that changes something has to carry.
 *
 * A `text/plain` POST is a CORS "simple request" and goes out with no
 * preflight, which means any page the user visits could make the server do
 * something — the browser will not let a page read the answer, but the change
 * has already happened. A header the browser does not know is not on the
 * safelist, so the browser has to ask first, and this server sends no CORS
 * headers at all and so never answers that question.
 *
 * This is OWASP's recommended AJAX pattern, and it is client-side only: no
 * token, no state.
 */
const REQUEST_HEADER = "x-tavi-request";

type ChatConfig = {
  modelName?: string;
  /**
   * How hard to reason, on one scale that includes `none` for "do not reason".
   * There is no separate on/off: providers express turning reasoning off as the
   * bottom of this same dial.
   */
  reasoningEffort?: string;
};

/**
 * A key never leaves this machine, and it never appears in a message.
 *
 * A provider's error quotes the request that failed, and a request that
 * failed for want of a key can quote the key. Anything that looks like one is
 * replaced before it is logged or sent.
 *
 * The rule is the app's own, in `src/lib/redact.ts`, so the server and the
 * desktop's Rust mask the same things.
 */
const scrub = (text: string): string => redact(text);

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
    console.log("[server] rejected: request carried its own system prompt");
    return Response.json(
      { error: "The system prompt is written by the server." },
      { status: 400 },
    );
  }

  if (variant !== "chat" && variant !== "code") {
    console.log("[server] rejected: request carried no surface");
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
    console.log("[server] rejected: a chat carried tools");
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
    console.log("[server] rejected: request carried no model");
    return Response.json(
      { error: "No model selected. Pick a model before sending." },
      { status: 400 },
    );
  }

  /* The provider client is built here rather than once at startup, so that it
     carries the key the server actually holds.

     The key lives in the server's own store or in the environment, and the
     store is what the settings pane writes to. A client built at startup
     would only ever see the environment, so a key set in the app would pass
     the check below and then never reach the provider. */
  const apiKey = serverCredential("OPENROUTER_API_KEY");
  if (!apiKey) {
    console.log("[server] rejected: no provider key");
    return Response.json(
      { error: "No provider key is set. Add one in the settings." },
      { status: 400 },
    );
  }
  const openrouter = createOpenRouter({ apiKey });

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
      console.log(`[server] rejected: ${serialized.message}`);
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
    `[server] surface=${variant} model=${modelName} reasoning=${applied}`,
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
    /* The SDK's default here writes the whole error to the console, and the
       whole error carries the request that failed: the prompt that was sent,
       the headers, and whatever the provider answered with. Only the reason
       is written down, and the key is taken out of even that. */
    onError: ({ error }) => {
      const reason = error instanceof Error ? error.message : String(error);
      console.error(`[server] provider request failed: ${scrub(reason)}`);
    },
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
      /* The SDK's default here is "An error occurred.", which keeps the
         provider's reason off the wire. The reason is what tells a missing
         key from a refused one from a network failure, so a scrubbed version
         of it goes to the client. The logging is done once, on the call
         above. */
      onError: (error) => {
        const reason = error instanceof Error ? error.message : String(error);
        return scrub(reason);
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
 *
 * An address the server cannot read is refused rather than allowed: a fail-open
 * default in a security predicate is a default, not a convenience. Over TCP
 * the address is always there.
 */
const isLoopback = (req: IncomingMessage): boolean => {
  const address = req.socket.remoteAddress ?? "";
  return (
    address === "127.0.0.1" ||
    address === "::1" ||
    address === "::ffff:127.0.0.1"
  );
};

/**
 * The name in a `Host` header, without the port.
 *
 * A bracketed IPv6 literal keeps its brackets, because that is how it is
 * written in a header and how it is compared.
 */
const hostName = (host: string | undefined): string => {
  if (!host) return "";
  const trimmed = host.trim().toLowerCase();
  if (trimmed.startsWith("[")) {
    const end = trimmed.indexOf("]");
    return end === -1 ? trimmed : trimmed.slice(0, end + 1);
  }
  return trimmed.split(":")[0];
};

/**
 * Whether the request came from a page this server is showing.
 *
 * `Origin` is the browser's own account of where the request came from, and
 * it is the one thing a cross-site request cannot fake from a page: a browser
 * sets it and will not let a page change it.
 *
 * The names are compared rather than the whole origins, because the origins
 * differ by their port in every arrangement that matters — the dev server
 * proxies to this one, and a deployment puts this one behind a proxy.
 */
const sameOrigin = (req: IncomingMessage): boolean => {
  const origin = req.headers.origin;
  if (!origin) return true;
  try {
    return new URL(origin).hostname === hostName(req.headers.host);
  } catch {
    return false;
  }
};

/**
 * The checks every request that changes something has to pass.
 *
 * Four things, and each of them stops a different attack:
 *
 * - the request came from this machine;
 * - the name it was addressed to is one this server answers to;
 * - the browser says it came from this origin, and says so in the way a
 *   browser cannot be talked out of;
 * - it carries the header that makes a browser ask first.
 */
const refused = (req: IncomingMessage): string | null => {
  if (!isLoopback(req)) {
    return "Only a request from this machine can change the server's keys.";
  }
  if (!ALLOWED_HOSTS.has(hostName(req.headers.host))) {
    return "This server does not answer to that name.";
  }
  const site = req.headers["sec-fetch-site"];
  if (typeof site === "string" && site === "cross-site") {
    return "This request came from another site.";
  }
  if (!sameOrigin(req)) {
    return "This request came from another site.";
  }
  if (!req.headers[REQUEST_HEADER]) {
    return "This request did not come from the app.";
  }
  /* A request with a body has to say what the body is. A request without one
     — a delete, which carries the key's id in the query — has nothing to
     declare. */
  if (req.method === "POST") {
    const contentType = req.headers["content-type"] ?? "";
    if (!contentType.toLowerCase().startsWith("application/json")) {
      return "This request was not JSON.";
    }
  }
  return null;
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
    const reason = refused(req);
    if (reason) {
      sendJson(res, 403, { error: reason });
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
    /* The catalogue comes from the provider, and a provider is only reachable
       with a key. Without one there is nothing to list: the list would be of
       models that cannot be called. The rule is here rather than in the
       composer because a rule the client can ignore is not a rule. */
    if (!serverCredential("OPENROUTER_API_KEY")) {
      sendJson(res, 403, {
        error: "No provider key is set. Add one in the settings.",
        code: "no-provider-key",
      });
      return;
    }
    try {
      const { models, fetchedAt, degraded } = await getCatalog();
      sendJson(res, 200, { models, fetchedAt, degraded });
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

  /* Every key the server holds, and what the provider says about it.
   *
   * The same list the desktop app keeps in the operating system's credential
   * store, and the same pane over it. Nothing here logs or echoes a key. */
  if (url.pathname === "/api/keys") {
    if (req.method === "GET") {
      try {
        sendJson(res, 200, await listProviderKeys());
      } catch (error) {
        sendJson(res, 500, {
          error:
            error instanceof Error
              ? error.message
              : "The keys could not be read.",
        });
      }
      return;
    }

    /* Changing the server's key changes what every request through the
       server spends, so it is only offered to a request this server can
       account for. */
    const reason = refused(req);
    if (reason) {
      sendJson(res, 403, { error: reason });
      return;
    }

    if (req.method === "POST") {
      let body: { provider?: unknown; key?: unknown; name?: unknown };
      try {
        body = JSON.parse((await readBody(req)).toString("utf8"));
      } catch {
        sendJson(res, 400, { error: "The request body is not JSON." });
        return;
      }

      const provider = typeof body.provider === "string" ? body.provider : "";
      const key = typeof body.key === "string" ? body.key.trim() : "";
      const name = typeof body.name === "string" ? body.name : undefined;
      if (!providerFor(provider)) {
        sendJson(res, 400, {
          error: "That provider is not one the app knows about.",
        });
        return;
      }
      if (!key) {
        sendJson(res, 400, { error: "Key must not be empty." });
        return;
      }

      /* The key is checked before it is stored, so a key the provider
         refuses never becomes the one in use. A provider that could not be
         reached is not a refusal, and a check that would cost a request is
         not run here. */
      const standing = await fetchProviderStatus(
        providerFor(provider)!,
        key,
      );
      if (standing.valid === false && standing.checkReason === "not-accepted") {
        sendJson(res, 400, {
          error: `${providerFor(provider)!.label} did not accept this key.`,
        });
        return;
      }

      try {
        const stored = storeKey(provider, key, name);
        sendJson(res, 200, { ok: true, id: stored.id });
      } catch (error) {
        sendJson(res, 500, {
          error:
            error instanceof Error
              ? error.message
              : "The key could not be stored.",
        });
      }
      return;
    }

    if (req.method === "DELETE") {
      const id = url.searchParams.get("id") ?? "";
      if (!id) {
        sendJson(res, 400, { error: "Which key?" });
        return;
      }
      if (!findKey(id)) {
        sendJson(res, 404, { error: "That key is not one the server holds." });
        return;
      }
      removeKey(id);
      sendJson(res, 200, { ok: true });
      return;
    }

    res.writeHead(405, { allow: "GET, POST, DELETE" });
    res.end();
    return;
  }

  /* The rest of the key routes, all of which change something and are all
     held to the same checks. */
  if (
    url.pathname === "/api/keys/replace" ||
    url.pathname === "/api/keys/rename" ||
    url.pathname === "/api/keys/activate" ||
    url.pathname === "/api/keys/check" ||
    url.pathname === "/api/keys/recheck"
  ) {
    if (req.method !== "POST") {
      res.writeHead(405, { allow: "POST" });
      res.end();
      return;
    }

    const reason = refused(req);
    if (reason) {
      sendJson(res, 403, { error: reason });
      return;
    }

    let body: Record<string, unknown>;
    try {
      body = JSON.parse((await readBody(req)).toString("utf8")) as Record<
        string,
        unknown
      >;
    } catch {
      sendJson(res, 400, { error: "The request body is not JSON." });
      return;
    }

    const id = typeof body.id === "string" ? body.id : "";

    if (url.pathname === "/api/keys/replace") {
      const key = typeof body.key === "string" ? body.key.trim() : "";
      const stored = findKey(id);
      if (!stored) {
        sendJson(res, 404, { error: "That key is not one the server holds." });
        return;
      }
      if (!key) {
        sendJson(res, 400, { error: "Key must not be empty." });
        return;
      }
      const provider = providerFor(stored.provider);
      if (provider) {
        const standing = await fetchProviderStatus(provider, key);
        if (
          standing.valid === false &&
          standing.checkReason === "not-accepted"
        ) {
          sendJson(res, 400, {
            error: `${provider.label} did not accept this key.`,
          });
          return;
        }
      }
      replaceSecret(id, key);
      sendJson(res, 200, { ok: true });
      return;
    }

    if (url.pathname === "/api/keys/rename") {
      const name = typeof body.name === "string" ? body.name : "";
      if (!name.trim()) {
        sendJson(res, 400, { error: "A key needs a name." });
        return;
      }
      if (!renameKey(id, name)) {
        sendJson(res, 404, { error: "That key is not one the server holds." });
        return;
      }
      sendJson(res, 200, { ok: true });
      return;
    }

    if (url.pathname === "/api/keys/activate") {
      if (!activateKey(id)) {
        sendJson(res, 404, { error: "That key is not one the server holds." });
        return;
      }
      sendJson(res, 200, { ok: true });
      return;
    }

    if (url.pathname === "/api/keys/check") {
      const provider = typeof body.provider === "string" ? body.provider : "";
      const key = typeof body.key === "string" ? body.key.trim() : "";
      const spend = body.spend === true;
      const known = providerFor(provider);
      if (!known) {
        sendJson(res, 400, {
          error: "That provider is not one the app knows about.",
        });
        return;
      }
      if (!key) {
        sendJson(res, 400, { error: "Key must not be empty." });
        return;
      }
      sendJson(res, 200, await fetchProviderStatus(known, key, spend));
      return;
    }

    /* Re-checking a key the server already holds. */
    const stored = findKey(id);
    if (!stored) {
      sendJson(res, 404, { error: "That key is not one the server holds." });
      return;
    }
    const provider = providerFor(stored.provider);
    if (!provider) {
      sendJson(res, 400, {
        error: "That provider is not one the app knows about.",
      });
      return;
    }
    sendJson(res, 200, await fetchProviderStatus(provider, stored.secret, true));
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

  /* A chat spends the operator's credit, so it is held to the same checks as
     everything else that changes something: a page the user visits must not
     be able to make the server talk to the provider on their behalf. */
  const reason = refused(req);
  if (reason) {
    sendJson(res, 403, { error: reason });
    return;
  }

  if (!serverCredential("OPENROUTER_API_KEY")) {
    sendJson(res, 500, { error: "No provider key is set. Add one in the settings." });
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
    console.log(`[server] ${req.method} ${url.pathname} -> ${response.status}`);
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
      "[server] request failed:",
      error instanceof Error ? error.message : error,
    );
    sendJson(res, 500, {
      error: error instanceof Error ? error.message : "Chat request failed",
    });
  }
});

server.listen(PORT, BIND_HOST, () => {
  console.log(`[server] streaming route on http://${BIND_HOST}:${PORT}/api/chat`);
  console.log(
    `[server] no default model; key ${
      serverCredential("OPENROUTER_API_KEY") ? "found" : "MISSING"
    }`,
  );
});