/**
 * The keys the website's server holds.
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
 *
 * The file is written the way a file that holds a credential has to be
 * written: atomically, with the previous copy kept beside it, and with a
 * parse error treated as a problem to report rather than as an empty store to
 * overwrite. One unreadable moment followed by one write used to be enough to
 * lose every other provider's key.
 */

import {
  chmodSync,
  copyFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  renameSync,
  writeFileSync,
} from "node:fs";
import { homedir } from "node:os";
import path from "node:path";

import { PROVIDERS } from "../src/lib/providers.ts";
import { maskSecret } from "../src/lib/redact.ts";

/**
 * Where the server's keys live.
 *
 * An explicit `TAVI_KEYS_DIR` first, then the user's own configuration
 * folder. Not the documents folder: that one is commonly synced to somebody
 * else's server, and a plaintext key does not belong there.
 *
 * On Windows the file's permissions are the folder's inherited ACL, because
 * the platform has no such bit — and `%APPDATA%` is the one folder here that
 * is the user's alone.
 */
export const keysRoot = (): string => {
  const override = process.env.TAVI_KEYS_DIR?.trim();
  if (override) return path.resolve(override);

  if (process.platform === "win32") {
    const appData = process.env.APPDATA?.trim();
    if (appData) return path.join(appData, "Tavi", "keys");
  }

  const config = process.env.XDG_CONFIG_HOME?.trim();
  if (config) return path.join(config, "tavi", "keys");
  return path.join(homedir(), ".config", "tavi", "keys");
};

const keysFile = (): string => path.join(keysRoot(), "server-keys.json");
const backupFile = (): string => path.join(keysRoot(), "server-keys.json.bak");

/** The shape of the store this build understands. */
const STORE_VERSION = 1;

/** One key, as the server holds it. */
export type StoredKey = {
  /** The key's own id, made up by the server. */
  id: string;
  /** Which provider it is for. */
  provider: string;
  /** The name the user gave it. */
  name: string;
  /** True until the user renames it. */
  nameIsDefault: boolean;
  /**
   * The address this key belongs to, when it is not the provider's default.
   *
   * Some providers do not live at one address: an Azure resource, a
   * Databricks workspace, a model running on this machine. The key says
   * which, and the key's address wins.
   */
  baseUrl: string | null;
  /** When it was stored, in unix seconds. */
  createdAt: number;
  /** When it was last changed, in unix seconds. */
  updatedAt: number;
  /** When the app last made a request with it, in unix seconds. */
  lastUsedAt: number | null;
  /** The vendor's prefix and the last four characters. */
  maskedValue: string | null;
  /**
   * The secret.
   *
   * It is in this file and nowhere else, and it is never in an answer. The
   * file is `0600` and the folder is `0700`.
   */
  secret: string;
};

/** One provider's keys, and which of them is in use. */
type ProviderGroup = {
  /** The one key requests go out with. */
  activeKeyId: string | null;
  /** Every key held for this provider. */
  keys: StoredKey[];
};

/** The whole store. */
type Store = {
  version: number;
  providers: Record<string, ProviderGroup>;
};

/**
 * Where the store came from.
 *
 * "recovered" means the file itself could not be read and the copy kept
 * beside it was used instead. The operator is told, because a key file that
 * had to be recovered is a key file that was being written badly.
 */
type StoreRead = { store: Store; recovered: boolean };

const nowSeconds = (): number => Math.floor(Date.now() / 1000);

/** An id the server made up. */
let counter = 0;
const mintId = (): string => {
  counter += 1;
  return `key_${Date.now().toString(16).padStart(12, "0")}${counter
    .toString(16)
    .padStart(4, "0")}`;
};

const emptyStore = (): Store => ({ version: STORE_VERSION, providers: {} });

/** Whether a parsed object is the shape the store used to have. */
const isLegacyShape = (value: unknown): value is Record<string, string> =>
  typeof value === "object" &&
  value !== null &&
  !Array.isArray(value) &&
  Object.values(value as Record<string, unknown>).every(
    (entry) => typeof entry === "string",
  );

/**
 * Turns the shape the store used to have into the shape it has now.
 *
 * The old shape was one secret per provider, filed under the provider's
 * name. It is still read, so a downgrade loses nothing, and it is written in
 * the new shape the next time anything is written.
 */
const fromLegacy = (legacy: Record<string, string>): Store => {
  const store = emptyStore();
  for (const provider of PROVIDERS) {
    const secret = legacy[provider.id]?.trim();
    if (!secret) continue;
    const id = mintId();
    const now = nowSeconds();
    store.providers[provider.id] = {
      activeKeyId: id,
      keys: [
        {
          id,
          provider: provider.id,
          name: provider.label,
          nameIsDefault: true,
          baseUrl: null,
          createdAt: now,
          updatedAt: now,
          lastUsedAt: null,
          maskedValue: maskSecret(secret),
          secret,
        },
      ],
    };
  }
  return store;
};

/** Reads a parsed object as the store it is. */
const asStore = (parsed: unknown): Store => {
  if (isLegacyShape(parsed)) return fromLegacy(parsed);
  if (typeof parsed !== "object" || parsed === null) {
    throw new Error("The key file is not a key store.");
  }
  const candidate = parsed as Partial<Store>;
  if (candidate.version !== STORE_VERSION) {
    throw new Error(
      `The key file is version ${String(candidate.version)} and this build understands version ${STORE_VERSION}.`,
    );
  }
  return {
    version: STORE_VERSION,
    providers:
      typeof candidate.providers === "object" && candidate.providers !== null
        ? (candidate.providers as Record<string, ProviderGroup>)
        : {},
  };
};

/** Reads and parses a file, or says why it could not. */
const parseFile = (file: string): unknown => {
  const raw = readFileSync(file, "utf8");
  return JSON.parse(raw) as unknown;
};

/**
 * The keys, as they are on disk.
 *
 * Read fresh each time rather than cached, because the file is small and the
 * server may be more than one process.
 *
 * A file that is there and cannot be parsed is a problem to report, not an
 * empty store to overwrite: only a file that is not there at all means "no
 * keys". When the file cannot be read but the copy kept beside it can, that
 * copy is used and the operator is told.
 */
const readStore = (): StoreRead | undefined => {
  const file = keysFile();
  if (!existsSync(file)) {
    if (existsSync(backupFile())) {
      return { store: asStore(parseFile(backupFile())), recovered: true };
    }
    return undefined;
  }

  try {
    return { store: asStore(parseFile(file)), recovered: false };
  } catch (error) {
    if (existsSync(backupFile())) {
      try {
        return { store: asStore(parseFile(backupFile())), recovered: true };
      } catch {
        /* The copy is no better. The original failure is the one to report. */
      }
    }
    throw new Error(
      `The key file at ${file} could not be read: ${(error as Error).message}`,
    );
  }
};

/** The store, or an empty one. */
const store = (): Store => readStore()?.store ?? emptyStore();

/**
 * Writes the keys, and keeps them to the owner.
 *
 * Atomically: a temporary file beside it, then a move into place. A crash
 * halfway through leaves the previous file rather than half a file, and the
 * temporary file is never mistaken for the store.
 */
const writeStore = (next: Store): void => {
  const root = keysRoot();
  mkdirSync(root, { recursive: true, mode: 0o700 });
  try {
    chmodSync(root, 0o700);
  } catch {
    /* Windows has no such bit. The folder's ACL is the user's alone. */
  }

  const file = keysFile();
  const temp = path.join(root, "server-keys.json.tmp");
  const payload = `${JSON.stringify(next, null, 2)}\n`;

  writeFileSync(temp, payload, { encoding: "utf8", mode: 0o600 });
  try {
    chmodSync(temp, 0o600);
  } catch {
    /* Windows has no such bit. */
  }

  if (existsSync(file)) {
    try {
      copyFileSync(file, backupFile());
    } catch {
      /* A copy that could not be made is not a reason to refuse the write. */
    }
  }

  renameSync(temp, file);
  try {
    chmodSync(file, 0o600);
  } catch {
    /* Windows has no such bit. */
  }
};

/**
 * Where a credential came from.
 *
 * "server-file" is the server's own file. "env" is the environment the server
 * was started with — which in development is the `.env.local` file, read by
 * Node before the process starts.
 */
export type CredentialSource = "server-file" | "env";

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
    const stored = activeKey(provider.id);
    if (stored) return { key: stored.secret, source: "server-file" };
  }
  const fromEnv = process.env[envVar];
  if (fromEnv) return { key: fromEnv, source: "env" };
  return undefined;
};

/** The key a provider's requests go out with. */
export const serverCredential = (envVar: string): string | undefined =>
  serverCredentialWithSource(envVar)?.key;

/**
 * The key in use for a provider.
 *
 * An explicit pointer, never an inference: which account is billed must not
 * change because a key was added.
 */
export const activeKey = (providerId: string): StoredKey | undefined => {
  const group = store().providers[providerId];
  if (!group) return undefined;
  const id = group.activeKeyId;
  if (!id) return undefined;
  return group.keys.find((key) => key.id === id);
};

/** Every key the server holds, for every provider. */
export const storedKeys = (): StoredKey[] => {
  const current = store();
  return Object.values(current.providers).flatMap((group) => group.keys);
};

/** The id of the key in use, for each provider. */
export const activeKeyIds = (): Record<string, string | null> => {
  const current = store();
  const out: Record<string, string | null> = {};
  for (const [providerId, group] of Object.entries(current.providers)) {
    out[providerId] = group.activeKeyId;
  }
  return out;
};

/** The metadata of one key, without its secret. */
export const keyWithoutSecret = (key: StoredKey): Omit<StoredKey, "secret"> => {
  const { secret: _secret, ...rest } = key;
  return rest;
};

/** Finds one key by its id. */
export const findKey = (id: string): StoredKey | undefined =>
  storedKeys().find((key) => key.id === id);

/**
 * Stores a key.
 *
 * The first key for a provider is the one in use; every key after it is
 * added inactive, because adding a second key must never change which
 * account is billed.
 */
export const storeKey = (
  providerId: string,
  secret: string,
  name?: string,
  baseUrl?: string,
): StoredKey => {
  const current = store();
  const provider = PROVIDERS.find((candidate) => candidate.id === providerId);
  const trimmed = secret.trim();
  const id = mintId();
  const now = nowSeconds();
  const chosen = name?.trim() || provider?.label || providerId;

  const key: StoredKey = {
    id,
    provider: providerId,
    name: chosen,
    nameIsDefault: chosen === (provider?.label ?? providerId),
    baseUrl: baseUrl?.trim().replace(/\/+$/, "") || null,
    createdAt: now,
    updatedAt: now,
    lastUsedAt: null,
    maskedValue: maskSecret(trimmed),
    secret: trimmed,
  };

  const group = current.providers[providerId] ?? {
    activeKeyId: null,
    keys: [],
  };
  group.keys.push(key);
  if (!group.activeKeyId) group.activeKeyId = id;
  current.providers[providerId] = group;

  writeStore(current);
  return key;
};

/** Puts a new secret in place of an existing one. */
export const replaceSecret = (id: string, secret: string): StoredKey | undefined => {
  const current = store();
  const trimmed = secret.trim();
  for (const group of Object.values(current.providers)) {
    const key = group.keys.find((candidate) => candidate.id === id);
    if (!key) continue;
    key.secret = trimmed;
    key.maskedValue = maskSecret(trimmed);
    key.updatedAt = nowSeconds();
    writeStore(current);
    return key;
  }
  return undefined;
};

/** Renames a key. */
export const renameKey = (id: string, name: string): StoredKey | undefined => {
  const current = store();
  const chosen = name.trim();
  if (!chosen) return undefined;
  for (const group of Object.values(current.providers)) {
    const key = group.keys.find((candidate) => candidate.id === id);
    if (!key) continue;
    key.name = chosen;
    key.nameIsDefault = false;
    key.updatedAt = nowSeconds();
    writeStore(current);
    return key;
  }
  return undefined;
};

/** Makes a key the one requests go out with. */
export const activateKey = (id: string): boolean => {
  const current = store();
  for (const [providerId, group] of Object.entries(current.providers)) {
    if (!group.keys.some((key) => key.id === id)) continue;
    group.activeKeyId = id;
    current.providers[providerId] = group;
    writeStore(current);
    return true;
  }
  return false;
};

/**
 * Takes a key away.
 *
 * Taking away the key in use leaves the provider with none, and the app says
 * so rather than quietly falling back to another key — that is the exact
 * failure where a work key starts paying for a personal key's requests.
 */
export const removeKey = (id: string): boolean => {
  const current = store();
  for (const [providerId, group] of Object.entries(current.providers)) {
    if (!group.keys.some((key) => key.id === id)) continue;
    group.keys = group.keys.filter((key) => key.id !== id);
    if (group.activeKeyId === id) group.activeKeyId = null;
    current.providers[providerId] = group;
    writeStore(current);
    return true;
  }
  return false;
};

/** Notes that a key was just used. */
export const noteKeyUse = (id: string): void => {
  const current = store();
  for (const group of Object.values(current.providers)) {
    const key = group.keys.find((candidate) => candidate.id === id);
    if (!key) continue;
    key.lastUsedAt = nowSeconds();
    writeStore(current);
    return;
  }
};
