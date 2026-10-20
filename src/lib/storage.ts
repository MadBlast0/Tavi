/**
 * The app's own corner of `localStorage`.
 *
 * Everything the app stores in the browser is under one namespace, so it
 * cannot collide with anything else on the origin. The origin is the app's
 * own in a build, but it is `localhost:1420` in development — and a
 * development origin is shared by every project on the machine, so the
 * namespace is what keeps one project's preferences out of another's.
 *
 * ## The old namespace
 *
 * The app was called something else before it was renamed, and the values it
 * had stored are still under that name. A rename is not a reason to lose
 * someone's chats or their choice of model, so a value that is only in the old
 * namespace is moved to the new one the first time it is read. The old name is
 * gone afterwards, so the move happens once.
 *
 * The move never overwrites: a value that is already in the new namespace is
 * the newer one — the build that wrote it is the current one — and it wins.
 */

/** The namespace everything the app stores is under. */
export const NAMESPACE = "tavi";

/** The namespace the app stored things under before it was renamed. */
export const LEGACY_NAMESPACE = "ai-app";

/** The full key a named value is stored under. */
export const storageKey = (name: string) => `${NAMESPACE}.${name}`;

/** The full key a named value used to be stored under. */
export const legacyStorageKey = (name: string) => `${LEGACY_NAMESPACE}.${name}`;

/**
 * Read a named value, moving it here first if that is where it is.
 *
 * A value that cannot be read at all — private mode, disabled storage, a
 * quota error — reads as absent. A bad value must never stop the app from
 * starting.
 */
export const readStorage = (name: string): string | undefined => {
  if (typeof localStorage === "undefined") return undefined;
  try {
    const value = localStorage.getItem(storageKey(name));
    if (value !== null) return value;

    const legacy = localStorage.getItem(legacyStorageKey(name));
    if (legacy === null) return undefined;

    /* The move is best-effort. Storage that is full or read-only still has
       the value to give, and the next run can try again. */
    try {
      localStorage.setItem(storageKey(name), legacy);
      localStorage.removeItem(legacyStorageKey(name));
    } catch {}

    return legacy;
  } catch {
    return undefined;
  }
};

/**
 * Write a named value, or remove it when the value is `undefined`.
 *
 * Returns whether the value was stored. A write that did not happen is not an
 * error — the selection still applies for this session — but a caller that
 * can do something about it, such as dropping the oldest saved thread, needs
 * to be able to tell.
 */
export const writeStorage = (name: string, value: string | undefined): boolean => {
  if (typeof localStorage === "undefined") return false;
  try {
    if (value === undefined) localStorage.removeItem(storageKey(name));
    else localStorage.setItem(storageKey(name), value);
    return true;
  } catch {
    return false;
  }
};

/**
 * Removes a value from both namespaces.
 *
 * `writeStorage(name, undefined)` removes only the current spelling, and the
 * legacy one is then moved straight back on the next read — so a value that
 * has been retired with it comes back. This removes both, and the value stays
 * gone.
 *
 * It is the one thing this module does that is not a move, and it is only for
 * values that are being retired on purpose: a store that has been replaced by
 * a different one, or a preference that has been split in two.
 */
export const forgetStorage = (name: string): void => {
  if (typeof localStorage === "undefined") return;
  try {
    localStorage.removeItem(storageKey(name));
    localStorage.removeItem(legacyStorageKey(name));
  } catch {
    // Nothing to do. A storage that refuses to be written to is a storage
    // that has already forgotten everything.
  }
};
