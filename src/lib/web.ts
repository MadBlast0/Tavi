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
  GitBranches,
  GitIdentity,
  GitOutcome,
  GitStatus,
  KeyStandingReport,
  ModelCatalogue,
  NotificationPermission,
  PartialJournal,
  ProjectsListing,
  ProviderKey,
} from "./api.ts"
import { forgetStorage, readStorage, storageKeys, writeStorage } from "./storage.ts"

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
  baseUrl?: string,
): Promise<void> => {
  const response = await fetch("/api/keys", {
    method: "POST",
    headers: MUTATING,
    body: JSON.stringify({
      provider,
      key,
      name: name ?? null,
      baseUrl: baseUrl ?? null,
    }),
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
  baseUrl?: string,
): Promise<KeyStandingReport> => {
  const response = await fetch("/api/keys/check", {
    method: "POST",
    headers: MUTATING,
    body: JSON.stringify({ provider, key, spend, baseUrl: baseUrl ?? null }),
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

/**
 * The catalogue for one provider.
 *
 * The provider is named, because the app can talk to more than one and the
 * list has to be the one whose models the request will actually use.
 */
export const fetchModels = async (providerId: string): Promise<ModelCatalogue> => {
  const response = await fetch(
    `/api/models?provider=${encodeURIComponent(providerId)}`,
  )
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
/* The answers in flight                                                       */
/* -------------------------------------------------------------------------- */

/**
 * The name a conversation's journal is stored under.
 *
 * The website has no app-data directory, so the journal goes where the
 * website's conversations go: the browser's storage. It is kept under its own
 * name so that it can be found again, and so that removing the conversations
 * can remove it with them.
 */
const partialName = (threadId: string) => `partial.${threadId}`

/**
 * Adds one line to the journal of an answer that is being written.
 *
 * A browser's storage is a set of named values rather than a set of files, so
 * there is nothing to append to: the whole of the journal is read and written
 * back. It is small — an answer, not a history — and the same thing happens
 * in the browser as on the desktop, so the two stay in step.
 */
export const appendPartial = async (
  threadId: string,
  line: string
): Promise<void> => {
  const name = partialName(threadId)
  const existing = readStorage(name) ?? "";
  writeStorage(name, existing + line + "\n");
};

/** Every journal that is there. */
export const readPartials = async (): Promise<PartialJournal[]> => {
  const journals: PartialJournal[] = [];
  for (const name of storageKeys("partial.")) {
    const contents = readStorage(name);
    if (contents === undefined) continue;
    journals.push({ id: name.slice("partial.".length), contents });
  }
  return journals;
};

/** Removes one journal. */
export const clearPartial = async (threadId: string): Promise<void> => {
  forgetStorage(partialName(threadId));
};

/** Removes every journal. */
export const clearPartials = async (): Promise<void> => {
  for (const name of storageKeys("partial.")) {
    forgetStorage(name);
  }
};

/* -------------------------------------------------------------------------- */
/* Notifications                                                               */
/* -------------------------------------------------------------------------- */

/**
 * Whether the browser will let the app raise a notification.
 *
 * The browser's own permission, which it asks for when the reader asks for
 * one and which it can take away again.
 */
export const notificationPermission = async (): Promise<NotificationPermission> => {
  if (typeof Notification === "undefined") return "denied";
  return Notification.permission as NotificationPermission;
};

/** Asks the browser for permission to raise a notification. */
export const requestNotificationPermission = async (): Promise<boolean> => {
  if (typeof Notification === "undefined") return false;
  try {
    return (await Notification.requestPermission()) === "granted";
  } catch {
    return false;
  }
};

/**
 * Raises a notification.
 *
 * The browser's own, which is a toast from the operating system when the
 * browser is running as an application and a card in its own centre when it
 * is a tab. Either way it only exists while the tab does: a closed tab is
 * not there to raise one, and a notification that outlived the tab would need
 * a push service and a service worker, which is a different thing entirely.
 */
export const showNotification = (title: string, body: string): void => {
  if (typeof Notification === "undefined") return;
  try {
    new Notification(title, { body });
  } catch {
    /* A browser that refuses is a browser that has said no. */
  }
};

/**
 * Whether the app is in front of the reader.
 *
 * The document's focus and its visibility. A tab in the background is not in
 * front even when the window it is in has the focus, which is why both are
 * asked about.
 */
export const windowHasFocus = async (): Promise<boolean> => {
  if (typeof document === "undefined") return false;
  return document.visibilityState !== "hidden" && document.hasFocus();
};

/* -------------------------------------------------------------------------- */
/* Git                                                                        */
/* -------------------------------------------------------------------------- */

/**
 * Git runs on your machine, and a browser cannot run it.
 *
 * Every call refuses with that, rather than with a failure that looks like
 * something went wrong. The desktop app runs git with an argument array and
 * no shell; there is nothing here that could do the same, and pretending
 * otherwise would be the one kind of lie this app does not tell.
 */
const GIT_UNAVAILABLE =
  "Git runs on your machine, and a browser cannot run it. This is a desktop thing."

export const gitStatus = async (_id: string): Promise<GitStatus> => {
  throw new Error(GIT_UNAVAILABLE)
}

export const gitBranches = async (_id: string): Promise<GitBranches> => {
  throw new Error(GIT_UNAVAILABLE)
}

export const gitCommit = async (
  _path: string,
  _message: string,
  _identity?: GitIdentity,
): Promise<GitOutcome> => {
  throw new Error(GIT_UNAVAILABLE)
}

export const gitPull = async (_id: string): Promise<GitOutcome> => {
  throw new Error(GIT_UNAVAILABLE)
}

export const gitPush = async (_id: string): Promise<GitOutcome> => {
  throw new Error(GIT_UNAVAILABLE)
}

export const gitSwitchBranch = async (
  _path: string,
  _branch: string,
): Promise<GitOutcome> => {
  throw new Error(GIT_UNAVAILABLE)
}

export const gitCreateBranch = async (
  _path: string,
  _branch: string,
): Promise<GitOutcome> => {
  throw new Error(GIT_UNAVAILABLE)
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
