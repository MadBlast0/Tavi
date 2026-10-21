/**
 * A check of the server's key routes, driven the way the app drives them.
 *
 * It runs against the running server on :8787, with the same headers the web
 * adapter sends, so it exercises the route's own checks rather than bypassing
 * them. The key comes from `.env.local` and is never printed.
 *
 * Run it with `node --env-file-if-exists=.env.local scripts/check-keys.ts`.
 */

const BASE = "http://127.0.0.1:8787"
const HEADERS = {
  "content-type": "application/json",
  "x-tavi-request": "1",
}

const key = process.env.OPENROUTER_API_KEY
if (!key) {
  console.error("No OPENROUTER_API_KEY in the environment.")
  process.exit(1)
}

const call = async (path: string, init?: RequestInit) => {
  const response = await fetch(`${BASE}${path}`, init)
  const body = await response.json().catch(() => null)
  return { status: response.status, body }
}

const post = (path: string, body: unknown) =>
  call(path, { method: "POST", headers: HEADERS, body: JSON.stringify(body) })

const show = (label: string, result: { status: number; body: unknown }) => {
  const body = JSON.stringify(result.body)
  /* The secret must never come back out. */
  if (body.includes(key)) {
    console.error(`${label}: THE KEY CAME BACK IN THE ANSWER`)
    process.exitCode = 1
  }
  console.log(`${label}: ${result.status} ${body.slice(0, 400)}`)
}

const list = async () => {
  const result = await call("/api/keys")
  return Array.isArray(result.body) ? result.body : []
}

const run = async () => {
  const mode = process.argv[2] ?? "check"

  if (mode === "add") {
    /* Leave one key in the store, so the screen can be looked at with a row
       that has every button on it. */
    const added = await post("/api/keys", {
      provider: "openrouter",
      key,
      name: "Work key",
    })
    show("add", added)
    return
  }

  if (mode === "clean") {
    for (const entry of await list()) {
      if (entry.source !== "server-file") continue
      show(
        `remove ${entry.name}`,
        await call(`/api/keys?id=${encodeURIComponent(entry.id)}`, {
          method: "DELETE",
          headers: { "x-tavi-request": "1" },
        }),
      )
    }
    return
  }

  const before = await list()
  console.log(`before: ${before.length} key(s)`)

  show(
    "add (a key the provider refuses)",
    await post("/api/keys", {
      provider: "openrouter",
      key: "sk-or-v1-not-a-real-key-000000000",
      name: "Refused",
    }),
  )

  const added = await post("/api/keys", {
    provider: "openrouter",
    key,
    name: "Work key",
  })
  show("add", added)
  const id = (added.body as { id?: string })?.id
  if (!id) {
    console.error("the key was not stored, so the rest cannot be checked")
    process.exit(1)
  }

  const after = await list()
  const stored = after.find((entry) => entry.id === id)
  console.log(
    "the stored key:",
    JSON.stringify({
      id: stored?.id,
      provider: stored?.provider,
      providerLabel: stored?.providerLabel,
      name: stored?.name,
      nameIsDefault: stored?.nameIsDefault,
      source: stored?.source,
      active: stored?.active,
      valid: stored?.valid,
      checkReason: stored?.checkReason,
      account: stored?.account,
      limit: stored?.limit,
      limitRemaining: stored?.limitRemaining,
      limitReset: stored?.limitReset,
      limitCurrency: stored?.limitCurrency,
      usage: stored?.usage,
      usageInWindow: stored?.usageInWindow,
      isFreeTier: stored?.isFreeTier,
    }),
  )

  show("rename", await post("/api/keys/rename", { id, name: "Renamed" }))
  show("activate", await post("/api/keys/activate", { id }))
  show(
    "replace (with a key the provider refuses)",
    await post("/api/keys/replace", { id, key: "sk-or-v1-not-a-real-key-000000000" }),
  )
  show("recheck", await post("/api/keys/recheck", { id }))

  const renamed = await list()
  const now = renamed.find((entry) => entry.id === id)
  console.log(
    "after rename/activate:",
    JSON.stringify({ name: now?.name, active: now?.active, valid: now?.valid }),
  )

  show(
    "remove",
    await call(`/api/keys?id=${encodeURIComponent(id)}`, {
      method: "DELETE",
      headers: { "x-tavi-request": "1" },
    }),
  )

  const final = await list()
  console.log(`after: ${final.length} key(s)`)
}

await run()
