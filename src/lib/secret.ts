import { invoke } from "@tauri-apps/api/core";

/**
 * Provider API key access.
 *
 * The key lives in the OS credential store and is only ever retrieved
 * immediately before a request. It is never written to local storage, never
 * logged, and never placed in the DOM.
 */

const isDesktop = () =>
  typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;

export const isKeyStoreAvailable = () => isDesktop();

export const saveApiKey = async (key: string) => {
  if (!isDesktop()) {
    throw new Error(
      "Key storage is only available in the desktop app. Start it with `npm run tauri dev`, or set OPENROUTER_API_KEY in .env.local.",
    );
  }
  await invoke("set_api_key", { key });
};

export const loadApiKey = async (): Promise<string | undefined> => {
  if (!isDesktop()) return undefined;
  try {
    return (await invoke<string | null>("get_api_key")) ?? undefined;
  } catch {
    return undefined;
  }
};

export const clearApiKey = async () => {
  if (!isDesktop()) return;
  await invoke("clear_api_key");
};

/**
 * Authorization headers for the chat request.
 *
 * Returning an empty object in the browser lets the server fall back to its
 * environment variable, which is the development path.
 */
export const authHeaders = async (): Promise<Record<string, string>> => {
  const key = await loadApiKey();
  return key ? { Authorization: `Bearer ${key}` } : {};
};