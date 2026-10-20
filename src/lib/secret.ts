import { invoke } from "@tauri-apps/api/core";

/**
 * Provider API key access.
 *
 * The key lives in the OS credential store. It is written there and cleared
 * from there, and it is never read back out: the desktop app's provider
 * request is made in Rust, which reads the key itself. A key in JavaScript is
 * a key in every script on the page, and there was no reason for it to be
 * there.
 */

const isDesktop = () =>
  typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;

export const isKeyStoreAvailable = () => isDesktop();

export const saveApiKey = async (key: string) => {
  if (!isDesktop()) {
    throw new Error(
      "Key storage is only available in the desktop app. Start it with `pnpm tauri dev`, or set OPENROUTER_API_KEY in .env.local.",
    );
  }
  await invoke("set_api_key", { key });
};

export const clearApiKey = async () => {
  if (!isDesktop()) return;
  await invoke("clear_api_key");
};
