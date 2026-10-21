/**
 * The keys the website's server holds, one per provider.
 *
 * The desktop app keeps its keys in the operating system's credential store. A
 * Node server has no such thing, so the server keeps them in its own file
 * instead — the same place a deployment keeps the environment variable it
 * replaces, and written so that only the owner can read it.
 *
 * A key is never written to a log, never sent back to a browser, and never
 * leaves this machine. The file is the server's own business: the browser is
 * told whether a provider has a key and what that provider says about it, and
 * nothing else.
 */

import { chmodSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import path from "node:path";

import { PROVIDERS } from "../src/lib/providers.ts";

/**
 * Where the server's keys live.
 *
 * An explicit `TAVI_KEYS_DIR` first, then the same per-user folder the
 * projects live in, so everything the app owns on this machine is in one
 * place.
 */
export const keysRoot = (): string => {
  const override = process.env.TAVI_KEYS_DIR?.trim();
  if (override) return path.resolve(override);
  return path.join(homedir(), "Documents", "Tavi", "keys");
};

const keysFile = (): string => path.join(keysRoot(), "server-keys.json");

/**
 * The keys, as they are on disk.
 *
 * Read fresh each time rather than cached, because the file is small and the
 * server may be more than one process. A file that cannot be read is treated
 * as no keys rather than as a failure: a server that cannot find its key
 * store should still serve the models it can.
 */
const readStore = (): Record<string, string> => {
  try {
    const raw = readFileSync(keysFile(), "utf8");
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    const store: Record<string, string> = {};
    for (const [provider, value] of Object.entries(parsed)) {
      if (typeof value === "string" && value.trim()) {
        store[provider] = value.trim();
      }
    }
    return store;
  } catch {
    return {};
  }
};

/** Write the keys, and keep them to the owner. */
const writeStore = (store: Record<string, string>): void => {
  const root = keysRoot();
  mkdirSync(root, { recursive: true });
  const file = keysFile();
  writeFileSync(file, `${JSON.stringify(store, null, 2)}\n`, {
    encoding: "utf8",
    mode: 0o600,
  });
  /* `writeFileSync` only applies the mode when it creates the file, so an
     existing one keeps whatever it had. */
  try {
    chmodSync(file, 0o600);
  } catch {}
};

/**
 * Where a credential came from.
 *
 * "store" is the server's own file. "env" is the environment the server was
 * started with — which in development is the `.env.local` file, read by Node
 * before the process starts.
 */
export type CredentialSource = "store" | "env";

/**
 * The key a provider's requests go out with, and where it came from.
 *
 * The stored key wins over the environment variable: the settings pane is
 * how a deployment's key is set, and an environment variable left over from
 * before it should not quietly win over what the operator last chose.
 *
 * Where the key came from is reported rather than assumed, because a key from
 * the environment cannot be changed from the pane — the pane says so instead
 * of offering a button that would do nothing.
 */
export const serverCredentialWithSource = (
  envVar: string,
): { key: string; source: CredentialSource } | undefined => {
  const provider = PROVIDERS.find((candidate) => candidate.envVar === envVar);
  if (provider) {
    const stored = readStore()[provider.id];
    if (stored) return { key: stored, source: "store" };
  }
  const fromEnv = process.env[envVar];
  if (fromEnv) return { key: fromEnv, source: "env" };
  return undefined;
};

/** The key a provider's requests go out with. */
export const serverCredential = (envVar: string): string | undefined =>
  serverCredentialWithSource(envVar)?.key;

/** Store a provider's key. */
export const storeKey = (providerId: string, key: string): void => {
  const store = readStore();
  store[providerId] = key.trim();
  writeStore(store);
};

/** Take a provider's key out. */
export const removeKey = (providerId: string): void => {
  const store = readStore();
  if (!(providerId in store)) {
    return;
  }
  delete store[providerId];
  writeStore(store);
};
