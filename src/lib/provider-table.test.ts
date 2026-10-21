import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { PROVIDERS } from "./providers.ts";

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
 */

const RUST = join(
  import.meta.dirname,
  "..",
  "..",
  "src-tauri",
  "src",
  "keys.rs",
);

/** One provider, as the Rust table writes it. */
type RustProvider = {
  id: string;
  label: string;
  keys_url: string;
  env_var: string;
  auth: string;
  identity_url: string;
  inference_url: string;
  reports_usage: boolean;
  validation: string;
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
  const table = source.match(/const PROVIDERS: &\[Provider\] = &\[([\s\S]*?)\n\];/);
  assert.ok(table, "the provider table should be in keys.rs");

  const providers: RustProvider[] = [];
  for (const entry of table[1].matchAll(/Provider \{([\s\S]*?)\n    \}/g)) {
    const body = entry[1];
    const read = (name: string): string => {
      const match = body.match(new RegExp(`${name}:\\s*"([^"]*)"`));
      assert.ok(match, `the Rust provider should name its ${name}`);
      return match[1];
    };
    providers.push({
      id: read("id"),
      label: read("label"),
      keys_url: read("keys_url"),
      env_var: read("env_var"),
      auth: body.match(/auth:\s*Auth::(\w+)/)![1],
      identity_url: read("identity_url"),
      inference_url: read("inference_url"),
      reports_usage: body.match(/reports_usage:\s*(true|false)/)![1] === "true",
      validation: body.match(/validation:\s*Validation::(\w+)/)![1],
    });
  }
  return providers;
};

/** The Rust spellings of the two enums. */
const AUTH: Record<string, string> = {
  Bearer: "bearer",
  ApiKeyHeader: "x-api-key",
};

const VALIDATION: Record<string, string> = {
  IdentityEndpoint: "identity-endpoint",
  InferenceProbe: "inference-probe",
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
      other.keys_url,
      provider.keysUrl,
      `${provider.id}: the key pages differ`,
    );
    assert.equal(
      other.env_var,
      provider.envVar,
      `${provider.id}: the environment variables differ`,
    );
    assert.equal(
      AUTH[other.auth],
      provider.auth,
      `${provider.id}: the ways of sending a key differ`,
    );
    assert.equal(
      other.identity_url,
      provider.identityUrl,
      `${provider.id}: the identity addresses differ`,
    );
    assert.equal(
      other.inference_url,
      provider.inferenceUrl,
      `${provider.id}: the inference addresses differ`,
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
  }
});

test("a provider that is checked for free and one that costs a request are both listed", () => {
  /* The two kinds are not the same cost, and the difference is why a provider
     with no free endpoint must never be checked as the list is read. */
  const kinds = new Set(PROVIDERS.map((provider) => provider.validation));
  assert.ok(kinds.has("identity-endpoint"));
  assert.ok(kinds.has("inference-probe"));
});

test("the provider the app talks to is one the app can hold a key for", () => {
  const active = PROVIDERS.find((provider) => provider.id === "openrouter");
  assert.ok(active, "the app's own provider should be on the list");
});
