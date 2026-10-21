/**
 * Key-shaped text, hidden.
 *
 * A provider's account name is free-form text that arrives over the network.
 * It is usually the provider's own already-masked hint — OpenRouter answers
 * `sk-or-v1-au7…890` — but it is text, and text is whatever the far end
 * decided to send. So it is masked here rather than trusted.
 *
 * The rule is deliberately not "anything beginning `sk-`". That covers one
 * vendor's prefix and leaves every other vendor's key — and any future one —
 * in the clear. The rule is a shape instead: a long run of the characters a
 * key is made of, with a digit in it, is a key until shown otherwise.
 *
 * One place implements it, and both sides of the app use it: the server
 * imports this file, and the desktop's Rust carries the same rule in
 * `src-tauri/src/provider.rs`. There is a test that says the two agree.
 */

/**
 * Prefixes that are known to begin a credential.
 *
 * These are matched whatever their length, because a prefix on its own is
 * enough to say "this is a key" and short keys are still keys.
 */
const SECRET_PREFIXES = [
  "sk-",
  "sk_",
  "nvapi-",
  "gsk_",
  "xai-",
  "AIza",
  "hf_",
  "r8_",
  "csk-",
  "api-",
] as const;

/** A maximal run of the characters a key is made of. */
const TOKEN = /[A-Za-z0-9_-]+/g;

/**
 * Whether a run of characters is a key rather than a word.
 *
 * Two ways to be one: a known prefix, or the shape — long, and with a digit
 * in it, which is what a generated secret looks like and what an English word
 * does not.
 */
const looksSecret = (token: string): boolean => {
  if (SECRET_PREFIXES.some((prefix) => token.startsWith(prefix))) return true;
  if (token.length < 16) return false;
  return /\d/.test(token);
};

/**
 * Whether the provider has already masked what follows.
 *
 * A provider's account name is usually the key's own masked hint, and the
 * ellipsis after it says the far end did the masking. Taking the visible
 * head off as well would throw away the one piece of the name that is safe
 * to show.
 *
 * Both spellings count: the single character and the three dots.
 */
const isEllipsis = (text: string, index: number): boolean => {
  const rest = text.slice(index);
  return rest.startsWith("…") || rest.startsWith("...");
};

/**
 * Hides anything key-shaped in a piece of text.
 *
 * A token the provider has already truncated is left alone: the ellipsis
 * after it means the far end did the masking, and taking the visible head off
 * as well would throw away the one piece of the name that is safe to show.
 */
export const redact = (value: string): string => {
  let out = "";
  let kept = 0;

  for (const match of value.matchAll(TOKEN)) {
    const token = match[0];
    const index = match.index ?? 0;
    if (isEllipsis(value, index + token.length)) continue;
    if (!looksSecret(token)) continue;
    out += value.slice(kept, index) + "***";
    kept = index + token.length;
  }

  return out + value.slice(kept);
};

/**
 * A key, shown as itself and its last four characters.
 *
 * Computed when the key is written, because that is the only moment the app
 * holds the secret. The app never reads a key back out of the credential
 * store, so it cannot ask the provider for a mask it did not issue.
 */
export const maskSecret = (secret: string): string => {
  const trimmed = secret.trim();
  /* A secret this short is not a provider key, and masking all but four
     characters of it would show most of it. */
  if (trimmed.length <= 8) return "…";

  /* The vendor's own prefix: the leading letters and the dashes and digits
     that follow them, up to twelve characters. `sk-or-v1-au7…890` is the
     shape this produces, which is enough to tell one provider's key from
     another's without showing the middle. */
  const head = trimmed.slice(0, 12).match(/^[A-Za-z]+[-_][A-Za-z0-9-]*/)?.[0];
  const prefix = head ?? trimmed.slice(0, 3);

  return `${prefix}…${trimmed.slice(-4)}`;
};
