import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { DEFAULT_PROVIDER_ID, PROVIDERS } from "./providers.ts";

/**
 * The provider table, checked against the other copy of it.
 *
 * The providers are listed twice — once in TypeScript for the app and the
 * website's server, and once in Rust for the desktop's credential store — and
 * nothing kept them in step. They are two halves of one list, and a provider
 * added to one and not the other is a key the app can store and never use, or
 * a provider the app talks to and cannot hold a key for.
 *
 * Rust cannot import TypeScript, so the table is written out twice and this
 * test reads both. It is the same technique `src/lib/commands.test.ts` uses
 * for the command list.
 *
 * The Rust table holds what Rust needs, so the two are compared on the fields
 * they both have. The addresses and the documentation links are the pane's
 * business, and the pane reads them from the TypeScript table.
 */

const RUST = join(
  import.meta.dirname,
  "..",
  "..",
  "src-tauri",
  "src",
  "provider.rs",
);

/** One provider, as the Rust table writes it. */
type RustProvider = {
  id: string;
  label: string;
  env_var: string;
  auth: string;
  base_url: string;
  wire: string;
  reasoning_field: string;
  models_path: string | null;
  chat_path: string | null;
  reports_usage: boolean;
  validation: string;
  identity_reports_account: boolean;
  keyless: boolean;
};

/**
 * The Rust table, read out of the source.
 *
 * The table is a literal, and a literal is the thing worth reading: a test
 * that imported a function would only prove the function returns what it
 * returns.
 */
const rustProviders = (): RustProvider[] => {
  const source = readFileSync(RUST, "utf8");
  const table = source.match(
    /const PROVIDERS: &\[ProviderInfo\] = &\[([\s\S]*?)\n\];/,
  );
  assert.ok(table, "the provider table should be in provider.rs");

  const providers: RustProvider[] = [];
  for (const entry of table[1].matchAll(/ProviderInfo \{([\s\S]*?)\n    \},/g)) {
    const body = entry[1];
    const read = (name: string): string => {
      const match = body.match(new RegExp(`${name}:\\s*"([^"]*)"`));
      assert.ok(match, `the Rust provider should name its ${name}`);
      return match[1];
    };
    const optional = (name: string): string | null => {
      const match = body.match(
        new RegExp(`${name}: Some\\("([^"]*)"\\)`),
      );
      return match ? match[1] : null;
    };
    providers.push({
      id: read("id"),
      label: read("label"),
      env_var: read("env_var"),
      auth: body.match(/auth:\s*Auth::(\w+)/)![1],
      base_url: read("base_url"),
      wire: body.match(/wire:\s*Wire::(\w+)/)![1],
      reasoning_field: read("reasoning_field"),
      models_path: optional("models_path"),
      chat_path: optional("chat_path"),
      reports_usage: body.match(/reports_usage:\s*(true|false)/)![1] === "true",
      validation: body.match(/validation:\s*Validation::(\w+)/)![1],
      identity_reports_account:
        body.match(/identity_reports_account:\s*(true|false)/)![1] === "true",
      keyless: body.match(/keyless:\s*(true|false)/)![1] === "true",
    });
  }
  return providers;
};

/** The Rust spellings of the three enums. */
const AUTH: Record<string, string> = {
  Bearer: "bearer",
  Header: "header",
  None: "none",
};

const VALIDATION: Record<string, string> = {
  IdentityEndpoint: "identity-endpoint",
  InferenceProbe: "inference-probe",
};

const WIRE: Record<string, string> = {
  OpenAiChatCompletions: "openai-chat-completions",
  AnthropicMessages: "anthropic-messages",
  GoogleGenerativeAi: "google-generative-ai",
  CohereChat: "cohere-chat",
};

test("the two provider tables hold the same providers", () => {
  const rust = rustProviders();
  assert.deepEqual(
    rust.map((provider) => provider.id),
    PROVIDERS.map((provider) => provider.id),
    "the two tables should hold the same providers, in the same order",
  );
});

test("the two provider tables agree about every provider", () => {
  const rust = rustProviders();

  for (const provider of PROVIDERS) {
    const other = rust.find((candidate) => candidate.id === provider.id);
    assert.ok(other, `the Rust table should hold ${provider.id}`);

    assert.equal(other.label, provider.label, `${provider.id}: the labels differ`);
    assert.equal(
      other.env_var,
      provider.envVar,
      `${provider.id}: the environment variables differ`,
    );
    assert.equal(
      other.base_url,
      provider.baseUrl,
      `${provider.id}: the addresses differ`,
    );
    assert.equal(
      WIRE[other.wire],
      provider.wire,
      `${provider.id}: the request shapes differ`,
    );
    assert.equal(
      other.reasoning_field,
      provider.reasoningField,
      `${provider.id}: the reasoning fields differ`,
    );
    assert.equal(
      other.models_path,
      provider.modelsPath ?? null,
      `${provider.id}: the catalogue paths differ`,
    );
    assert.equal(
      other.chat_path,
      provider.chatPath ?? null,
      `${provider.id}: the chat paths differ`,
    );
    assert.equal(
      other.reports_usage,
      provider.reportsUsage,
      `${provider.id}: the accounts they report differ`,
    );
    assert.equal(
      VALIDATION[other.validation],
      provider.validation,
      `${provider.id}: the ways of checking a key differ`,
    );
    assert.equal(
      other.identity_reports_account,
      provider.identityReportsAccount,
      `${provider.id}: the identity endpoints differ`,
    );
    assert.equal(
      other.keyless,
      Boolean(provider.keyless),
      `${provider.id}: the ones that need no key differ`,
    );
  }
});

test("the two provider tables agree about how a key is sent", () => {
  const rust = rustProviders();

  for (const provider of PROVIDERS) {
    const other = rust.find((candidate) => candidate.id === provider.id);
    assert.ok(other, `the Rust table should hold ${provider.id}`);

    /* The Rust side names the header it puts the key in, and the TypeScript
       side names the kind of key it is. They are two names for one fact, so
       they are compared by kind rather than by spelling. */
    const rustKind = (auth: string): string => {
      if (auth === "Bearer") return "bearer"
      if (auth === "None") return "none"
      return "header"
    };
    const typeKind = (auth: string): string => {
      if (auth === "bearer") return "bearer"
      if (auth === "none") return "none"
      return "header"
    };
    assert.equal(
      rustKind(other.auth),
      typeKind(provider.auth),
      `${provider.id}: the ways of sending a key differ`,
    );
  }
});

test("a provider that is checked for free and one that costs a request are both listed", () => {
  /* The two kinds are not the same cost, and the difference is why a provider
     with no free endpoint must never be checked as the list is read. */
  const kinds = new Set(PROVIDERS.map((provider) => provider.validation));
  assert.ok(kinds.has("identity-endpoint"));
  assert.ok(kinds.has("inference-probe"));
});

test("the provider the app falls back to is one the app can hold a key for", () => {
  const fallback = PROVIDERS.find(
    (provider) => provider.id === DEFAULT_PROVIDER_ID,
  );
  assert.ok(fallback, "the app's fallback provider should be on the list");
});

test("a provider that needs no key names no variable for one", () => {
  for (const provider of PROVIDERS) {
    if (!provider.keyless) continue;
    assert.equal(
      provider.envVar,
      "",
      `${provider.id} needs no key, so it should name no variable for one`,
    );
  }
});

test("no two providers share an id", () => {
  const ids = PROVIDERS.map((provider) => provider.id);
  assert.equal(
    new Set(ids).size,
    ids.length,
    "two providers with the same id would fight over one key",
  );
});

test("every provider that takes a reasoning level says which field it takes it in", () => {
  const FIELDS = new Set([
    "reasoning.effort",
    "reasoning_effort",
    "output_config.effort",
    "none",
  ]);
  for (const provider of PROVIDERS) {
    assert.ok(
      FIELDS.has(provider.reasoningField),
      `${provider.id} names a reasoning field the app does not know`,
    );
  }
});
