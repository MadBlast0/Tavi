/**
 * Real folder access through the File System Access API.
 *
 * Handles cannot live in localStorage — they are not structured-cloneable for
 * that store — so they go in IndexedDB, which can hold them, and recents are
 * kept as plain metadata next to them.
 *
 * Everything here degrades to a typed "unsupported" rather than throwing, since
 * non-Chromium webviews simply do not expose the API and the UI has to say so
 * instead of pretending it has folders.
 */

export type FileHandle = {
  kind: "file"
  name: string
  getFile(): Promise<File>
}

export type DirHandle = {
  kind: "directory"
  name: string
  values(): AsyncIterableIterator<FileHandle | DirHandle>
}

type PickerWindow = Window & {
  showDirectoryPicker?: (options?: {
    mode?: "read" | "readwrite"
  }) => Promise<DirHandle>
}

export const supportsDirectoryPicker = () =>
  typeof (window as PickerWindow).showDirectoryPicker === "function"

/** Directories worth walking when building the @ file list. */
const SOURCE_EXTENSIONS = new Set([
  "ts", "tsx", "js", "jsx", "mjs", "cjs", "json", "md", "mdx", "txt",
  "css", "scss", "html", "yml", "yaml", "toml", "rs", "py", "go", "sql",
  "sh", "env", "example", "lock",
])

/** Never descend into these; they are large, noisy and never edited by hand. */
const SKIP_DIRECTORIES = new Set([
  "node_modules", ".git", "dist", "build", "out", "target", "vendor",
  ".next", ".nuxt", ".turbo", ".cache", "coverage", "__pycache__",
  ".venv", "venv", ".idea", ".vscode",
])

const MAX_WALK_ENTRIES = 4000
const MAX_READ_BYTES = 400 * 1024

/* -------------------------------------------------------------------------- */
/* IndexedDB handle store                                                      */
/* -------------------------------------------------------------------------- */

const DB_NAME = "tavi-fs"
const DB_VERSION = 1
const HANDLE_STORE = "handles"
const META_STORE = "recent-folders"

/**
 * A folder the user has granted access to.
 *
 * The id is generated, and deliberately **not** the directory's name: two
 * directories on two drives can share a name, and a folder that is identified
 * by its name is one folder to this app. Picking the second would overwrite
 * the first's handle, and a session would lose track of which repository it
 * was run against. The name is kept separately, because it is what a person
 * reads.
 */
export type RecentFolder = {
  /** A generated id. The one thing that identifies this folder. */
  id: string
  /** The directory's name, for display. */
  name: string
  pickedAt: number
}

/**
 * A fresh id for a folder.
 *
 * `crypto.randomUUID` where it exists, and a made-up one where it does not.
 * The fallback is not a random number generator — it is the timestamp and a
 * counter, which is enough to keep two folders picked in the same second
 * apart.
 */
let folderCounter = 0
const newFolderId = (): string => {
  const cryptoApi = globalThis.crypto
  if (cryptoApi && typeof cryptoApi.randomUUID === "function") {
    return cryptoApi.randomUUID()
  }
  folderCounter += 1
  return `f-${Date.now().toString(36)}-${folderCounter.toString(36)}`
}

const openDb = (): Promise<IDBDatabase | null> =>
  new Promise((resolve) => {
    if (typeof indexedDB === "undefined") return resolve(null)
    const request = indexedDB.open(DB_NAME, DB_VERSION)
    request.onupgradeneeded = () => {
      const db = request.result
      if (!db.objectStoreNames.contains(HANDLE_STORE)) db.createObjectStore(HANDLE_STORE)
      if (!db.objectStoreNames.contains(META_STORE)) db.createObjectStore(META_STORE, { keyPath: "id" })
    }
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => resolve(null)
  })

const run = <T,>(
  db: IDBDatabase,
  store: string,
  mode: IDBTransactionMode,
  work: (objectStore: IDBObjectStore) => IDBRequest,
): Promise<T | null> =>
  new Promise((resolve) => {
    try {
      const request = work(db.transaction(store, mode).objectStore(store))
      request.onsuccess = () => resolve((request.result as T) ?? null)
      request.onerror = () => resolve(null)
    } catch {
      resolve(null)
    }
  })

/* -------------------------------------------------------------------------- */
/* Recents                                                                     */
/* -------------------------------------------------------------------------- */

/**
 * Folders the user actually picked, newest first. Empty until they pick one —
 * there is no seeded list, because a folder that does not exist on this machine
 * is worse than no folder at all.
 */
export const listRecentFolders = async (): Promise<RecentFolder[]> => {
  const db = await openDb()
  if (!db) return []
  const all = await run<RecentFolder[]>(db, META_STORE, "readonly", (s) => s.getAll())
  return (all ?? []).sort((a, b) => b.pickedAt - a.pickedAt)
}

export const rememberFolder = async (handle: DirHandle): Promise<RecentFolder> => {
  const entry: RecentFolder = {
    id: newFolderId(),
    name: handle.name,
    pickedAt: Date.now(),
  }
  const db = await openDb()
  if (db) {
    /* Keyed by the generated id, not by the name — the handle store holds the
       one thing that must not be confused with another folder's. */
    await run(db, HANDLE_STORE, "readwrite", (s) => s.put(handle, entry.id))
    await run(db, META_STORE, "readwrite", (s) => s.put(entry))
  }
  return entry
}

export const forgetFolder = async (id: string): Promise<void> => {
  const db = await openDb()
  if (!db) return
  await run(db, HANDLE_STORE, "readwrite", (s) => s.delete(id))
  await run(db, META_STORE, "readwrite", (s) => s.delete(id))
}

/**
 * Re-grants access to a previously picked folder. The browser may prompt again,
 * or refuse outright if the grant was revoked — both are reported as `null`
 * rather than as an empty folder, so callers can show a real message.
 */
export const restoreFolder = async (id: string): Promise<DirHandle | null> => {
  const db = await openDb()
  if (!db) return null
  const handle = await run<DirHandle>(db, HANDLE_STORE, "readonly", (s) => s.get(id))
  if (!handle) return null
  try {
    const permission = await (handle as DirHandle & {
      queryPermission?: (d: { mode: string }) => Promise<PermissionState>
    }).queryPermission?.({ mode: "read" })
    if (permission === "denied") return null
    return handle
  } catch {
    return null
  }
}

/**
 * Asks the user for a folder and remembers it.
 *
 * It returns the folder that was remembered rather than the handle, because
 * the id is the thing a caller needs — the handle is looked up again from the
 * id when the files are read.
 */
export const pickFolder = async (): Promise<RecentFolder | null> => {
  const picker = (window as PickerWindow).showDirectoryPicker
  if (!picker) return null
  try {
    const handle = await picker({ mode: "read" })
    return await rememberFolder(handle)
  } catch {
    // The user dismissed the picker. That is not an error worth surfacing.
    return null
  }
}

/* -------------------------------------------------------------------------- */
/* Reading                                                                     */
/* -------------------------------------------------------------------------- */

export type ProjectFile = {
  /** Path relative to the picked folder, using forward slashes. */
  path: string
  name: string
  handle: FileHandle
}

/**
 * Walks a picked folder for source files. Bounded on three axes — depth, entry
 * count and file size — because the alternative is freezing the tab on a
 * monorepo.
 */
export const listProjectFiles = async (
  root: DirHandle,
  { maxDepth = 6 }: { maxDepth?: number } = {},
): Promise<ProjectFile[]> => {
  const out: ProjectFile[] = []
  let seen = 0

  const walk = async (dir: DirHandle, prefix: string, depth: number): Promise<void> => {
    if (depth > maxDepth || seen >= MAX_WALK_ENTRIES) return
    for await (const entry of dir.values()) {
      if (seen >= MAX_WALK_ENTRIES) return
      seen++
      if (entry.kind === "directory") {
        if (!SKIP_DIRECTORIES.has(entry.name)) {
          await walk(entry, `${prefix}${entry.name}/`, depth + 1)
        }
        continue
      }
      const dot = entry.name.lastIndexOf(".")
      const extension = dot > 0 ? entry.name.slice(dot + 1).toLowerCase() : ""
      if (!SOURCE_EXTENSIONS.has(extension)) continue
      out.push({ path: `${prefix}${entry.name}`, name: entry.name, handle: entry })
    }
  }

  await walk(root, "", 0)
  return out.sort((a, b) => a.path.localeCompare(b.path))
}

const isProbablyText = (file: File) =>
  file.type.startsWith("text/") ||
  /^application\/(json|xml|yaml|x-yaml|javascript|typescript|toml)$/.test(file.type)

/**
 * Reads a file as text for inclusion in a prompt. Binary and oversized files
 * come back as `null` instead of being silently truncated into the model.
 */
export const readFileText = async (entry: ProjectFile): Promise<string | null> => {
  try {
    const file = await entry.handle.getFile()
    if (file.size > MAX_READ_BYTES) return null
    if (!isProbablyText(file)) return null
    return await file.text()
  } catch {
    return null
  }
}
