import { invoke } from "@tauri-apps/api/core";

/**
 * Provider API key access.
 *
 * The key lives in the OS credential store. It is written there and cleared
 * from there, and it is never read back out: the desktop app's provider
 * request is made in Rust, which reads the key itself. A key in JavaScript is
 * a key in every script on the page, and there was no reason for it to be
 * there.
 *
 * One key per provider. The providers are the ones in `src/lib/providers.ts`,
 * which the website's server reads the same list from.
 */

const isDesktop = () =>
  typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;

export const isKeyStoreAvailable = () => isDesktop();

/**
 * What the app knows about one provider's key.
 *
 * The key itself is never in this. What is here is whether a key is stored,
 * whether the provider accepts it, and — for the one provider that says so —
 * whose key it is and how much of its allowance is gone.
 */
export type ApiKeyInfo = {
  provider: string;
  label: string;
  stored: boolean;
  /**
   * Where the key came from, when one is stored.
   *
   * "store" is the operating system's credential store, or the server's own
   * file. "dev-file" is the development key file, which only a development
   * build reads. "env" is the environment the website's server was started
   * with — the `.env.local` file in development. The pane says which one it
   * is, because a key that is somewhere else is a key the user cannot change
   * from that screen.
   */
  source?: "store" | "dev-file" | "env";
  valid?: boolean;
  reason?: string;
  account?: string;
  limit?: number | null;
  usage?: number | null;
  remaining?: number | null;
  isFreeTier?: boolean;
};

/**
 * Every provider, and what is known about its key.
 *
 * A provider with no key is listed without one, so the pane can show what
 * could be added as well as what is there.
 */
export const listApiKeys = async (): Promise<ApiKeyInfo[]> => {
  if (isDesktop()) {
    return invoke<ApiKeyInfo[]>("list_api_keys");
  }

  const response = await fetch("/api/keys");
  if (!response.ok) {
    throw new Error(`The keys are unavailable (${response.status}).`);
  }
  return (await response.json()) as ApiKeyInfo[];
};

/**
 * Store a key for a provider.
 *
 * The desktop app puts it in the operating system's credential store. The
 * website's server has no such thing, so it keeps the key in its own file
 * instead — the same place the environment variable it replaces lives.
 */
export const saveApiKey = async (provider: string, key: string) => {
  if (isDesktop()) {
    await invoke("set_api_key", { provider, key });
    return;
  }

  const response = await fetch("/api/keys", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ provider, key }),
  });
  if (!response.ok) {
    const detail = (await response.json().catch(() => null)) as {
      error?: string;
    } | null;
    throw new Error(detail?.error ?? "The key could not be stored.");
  }
};

/**
 * Take a provider's key out.
 *
 * The desktop app takes it out of the credential store; the website's server
 * takes it out of its own file.
 */
export const clearApiKey = async (provider: string) => {
  if (isDesktop()) {
    await invoke("clear_api_key", { provider });
    return;
  }

  const response = await fetch(
    `/api/keys?provider=${encodeURIComponent(provider)}`,
    { method: "DELETE" },
  );
  if (!response.ok) {
    const detail = (await response.json().catch(() => null)) as {
      error?: string;
    } | null;
    throw new Error(detail?.error ?? "The key could not be removed.");
  }
};
