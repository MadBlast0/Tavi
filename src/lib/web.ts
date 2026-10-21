/**
 * The web adapter.
 *
 * Everything that talks to the website's server over HTTP is in this file,
 * and nowhere else. The server is the desktop app's counterpart: the same
 * operations, the same shapes, the same answers — reached the other way.
 *
 * The rules this file keeps:
 *
 * - it is the only file that calls `fetch("/api/…")`;
 * - it never imports anything from the desktop adapter;
 * - every request that changes something says so with a content type the
 *   browser has to preflight, which is what stops another page on the
 *   machine from making the change.
 */

import type {
  ChatEvent,
  ChatRequest,
  CloneProgress,
  CloneResult,
  KeyStandingReport,
  ModelCatalogue,
  ProjectsListing,
  ProviderKey,
} from "./api.ts"

/**
 * The header that makes a request something a browser will not send on its
 * own.
 *
 * A `text/plain` POST is a CORS "simple request" and goes out with no
 * preflight, which means any page the user visits could make the server do
 * something. A header the browser does not know is not on the safelist, so
 * the browser has to ask first — and the server, which sends no CORS headers
 * at all, never answers that question.
 */
const REQUEST_HEADER = "x-tavi-request"

/** Reads the server's own words out of a failed answer. */
const failure = async (response: Response, fallback: string): Promise<string> => {
  const detail = (await response.json().catch(() => null)) as {
    error?: string
  } | null
  return detail?.error ?? fallback
}

/**
 * The headers every request that changes something carries.
 *
 * A `text/plain` POST is a CORS "simple request" and goes out with no
 * preflight, which means any page the user visits could make the server do
 * something. A header the browser does not know is not on the safelist, so
 * the browser has to ask first — and the server, which sends no CORS headers
 * at all, never answers that question.
 */
const MUTATING = {
  "content-type": "application/json",
  [REQUEST_HEADER]: "1",
} as const

/* -------------------------------------------------------------------------- */
/* The provider's keys                                                         */
/* -------------------------------------------------------------------------- */

export const listProviderKeys = async (): Promise<ProviderKey[]> => {
  const response = await fetch("/api/keys")
  if (!response.ok) {
    throw new Error(`The keys are unavailable (${response.status}).`)
  }
  return (await response.json()) as ProviderKey[]
}

export const saveProviderKey = async (
  provider: string,
  key: string,
  name?: string,
): Promise<void> => {
  const response = await fetch("/api/keys", {
    method: "POST",
    headers: MUTATING,
    body: JSON.stringify({ provider, key, name: name ?? null }),
  })
  if (!response.ok) {
    throw new Error(
      await failure(response, "The key could not be stored."),
    )
  }
}

export const replaceProviderKey = async (
  id: string,
  key: string,
): Promise<void> => {
  const response = await fetch("/api/keys/replace", {
    method: "POST",
    headers: MUTATING,
    body: JSON.stringify({ id, key }),
  })
  if (!response.ok) {
    throw new Error(await failure(response, "The key could not be replaced."))
  }
}

export const renameProviderKey = async (
  id: string,
  name: string,
): Promise<void> => {
  const response = await fetch("/api/keys/rename", {
    method: "POST",
    headers: MUTATING,
    body: JSON.stringify({ id, name }),
  })
  if (!response.ok) {
    throw new Error(await failure(response, "The key could not be renamed."))
  }
}

export const activateProviderKey = async (id: string): Promise<void> => {
  const response = await fetch("/api/keys/activate", {
    method: "POST",
    headers: MUTATING,
    body: JSON.stringify({ id }),
  })
  if (!response.ok) {
    throw new Error(
      await failure(response, "The key could not be made the one in use."),
    )
  }
}

export const removeProviderKey = async (id: string): Promise<void> => {
  const response = await fetch(`/api/keys?id=${encodeURIComponent(id)}`, {
    method: "DELETE",
    headers: { [REQUEST_HEADER]: "1" },
  })
  if (!response.ok) {
    throw new Error(await failure(response, "The key could not be removed."))
  }
}

export const checkProviderKey = async (
  provider: string,
  key: string,
  spend: boolean,
): Promise<KeyStandingReport> => {
  const response = await fetch("/api/keys/check", {
    method: "POST",
    headers: MUTATING,
    body: JSON.stringify({ provider, key, spend }),
  })
  if (!response.ok) {
    throw new Error(
      await failure(
        response,
        "The provider could not be asked about this key.",
      ),
    )
  }
  return (await response.json()) as KeyStandingReport
}

export const recheckProviderKey = async (id: string): Promise<void> => {
  const response = await fetch("/api/keys/recheck", {
    method: "POST",
    headers: MUTATING,
    body: JSON.stringify({ id }),
  })
  if (!response.ok) {
    throw new Error(
      await failure(
        response,
        "The provider could not be asked about this key.",
      ),
    )
  }
}

/* -------------------------------------------------------------------------- */
/* The model catalogue                                                         */
/* -------------------------------------------------------------------------- */

export const fetchModels = async (): Promise<ModelCatalogue> => {
  const response = await fetch("/api/models")
  if (!response.ok) {
    /* The server's own words, not a status code. It knows why it refused —
       most often that there is no provider key — and a number is not a
       reason. */
    throw new Error(
      await failure(
        response,
        `The model catalogue is unavailable (${response.status}).`,
      ),
    )
  }
  return (await response.json()) as ModelCatalogue
}

/* -------------------------------------------------------------------------- */
/* The conversation                                                            */
/* -------------------------------------------------------------------------- */

/** The website's path: a fetch, and a stream of `data:` lines. */
export const streamChat = async (
  request: ChatRequest,
  onEvent: (event: ChatEvent) => void,
  signal?: AbortSignal,
): Promise<void> => {
  const response = await fetch("/api/chat", {
    method: "POST",
    headers: MUTATING,
    signal,
    body: JSON.stringify(request),
  })

  if (!response.ok) {
    throw new Error(await failure(response, `HTTP ${response.status}`))
  }
  if (!response.body) throw new Error("No response body")

  const reader = response.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ""

  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    buffer += decoder.decode(value, { stream: true })
    const lines = buffer.split("\n")
    buffer = lines.pop() ?? ""
    for (const line of lines) {
      if (!line.startsWith("data:")) continue
      const payload = line.slice(5).trim()
      if (!payload || payload === "[DONE]") continue
      let event: ChatEvent
      try {
        event = JSON.parse(payload) as ChatEvent
      } catch {
        /* Partial JSON: the rest of it is still coming. */
        continue
      }
      /* The handler is called outside the parse's catch on purpose. A handler
         that throws is saying the turn failed, and catching it here would end
         the stream with no text, no error and nothing to show — which is what
         a failed turn looks like from the outside. */
      onEvent(event)
    }
  }
}

/* -------------------------------------------------------------------------- */
/* The projects                                                                */
/* -------------------------------------------------------------------------- */

export const listProjects = async (): Promise<ProjectsListing> => {
  const response = await fetch("/api/projects")
  if (!response.ok) {
    throw new Error(`The projects folder could not be read (${response.status}).`)
  }
  return (await response.json()) as ProjectsListing
}

export const cloneRepository = async (
  url: string,
  where: string | undefined,
  onProgress?: (progress: CloneProgress) => void,
): Promise<CloneResult> => {
  const response = await fetch("/api/projects/clone", {
    method: "POST",
    headers: MUTATING,
    body: JSON.stringify({ url, destination: where || undefined }),
  })
  const result = (await response.json().catch(() => null)) as CloneResult | null
  if (!result) {
    throw new Error("The clone could not be started.")
  }
  onProgress?.({ message: result.error ?? "" })
  return result
}

export const cancelClone = async (): Promise<void> => {
  /* The server's clone is not cancellable over HTTP; it is stopped by the
     request going away. */
}

/* -------------------------------------------------------------------------- */
/* Files and links                                                             */
/* -------------------------------------------------------------------------- */

/** Hands a file to the browser to save. */
export const downloadTextFile = async (
  name: string,
  contents: string,
): Promise<boolean> => {
  const blob = new Blob([contents], { type: "application/json" })
  const url = URL.createObjectURL(blob)
  const link = document.createElement("a")
  link.href = url
  link.download = name
  link.click()
  URL.revokeObjectURL(url)
  return true
}

/** Asks the browser for a file. */
export const chooseTextFile = async (): Promise<string | null> =>
  new Promise((resolve) => {
    const input = document.createElement("input")
    input.type = "file"
    input.accept = "application/json,.json"
    input.onchange = async () => {
      const file = input.files?.[0]
      resolve(file ? await file.text() : null)
    }
    input.oncancel = () => resolve(null)
    input.click()
  })

/** Opens a page in a new tab. */
export const openInNewTab = async (url: string): Promise<void> => {
  window.open(url, "_blank", "noopener")
}
