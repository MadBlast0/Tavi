"use client"

import * as React from "react"
import { KeyRoundIcon, Trash2Icon } from "lucide-react"

import { Button } from "@/components/button"
import { Input } from "@/components/input"
import { Label } from "@/components/label"
import { fetchKeyStatus, type KeyStatus } from "@/lib/chat"
import { clearApiKey, isKeyStoreAvailable, saveApiKey } from "@/lib/secret"

/**
 * The provider key.
 *
 * It lives in the operating system's credential store, and it is never read
 * back out: the desktop app's provider request is made in Rust, which holds the
 * key itself. So this pane can say whether a key is stored and what the
 * provider thinks of it, and it can put a new one in or take the old one out,
 * and it cannot show the key — which is the point of storing it there.
 */
export function KeySettings() {
  const supported = isKeyStoreAvailable()
  const [status, setStatus] = React.useState<KeyStatus | null>(null)
  const [draft, setDraft] = React.useState("")
  const [busy, setBusy] = React.useState(false)
  const [message, setMessage] = React.useState<string | null>(null)

  React.useEffect(() => {
    let current = true
    void fetchKeyStatus()
      .then((answer) => {
        if (current) setStatus(answer)
      })
      .catch(() => {
        /* The provider cannot be reached. The key may still be there. */
      })
    return () => {
      current = false
    }
  }, [])

  const save = async () => {
    setBusy(true)
    setMessage(null)
    try {
      await saveApiKey(draft)
      setDraft("")
      setMessage("The key was stored in the system credential store.")
      const answer = await fetchKeyStatus().catch(() => null)
      if (answer) setStatus(answer)
    } catch (error) {
      setMessage(
        error instanceof Error ? error.message : "The key could not be stored.",
      )
    } finally {
      setBusy(false)
    }
  }

  const remove = async () => {
    setBusy(true)
    setMessage(null)
    try {
      await clearApiKey()
      setMessage("The key was removed.")
      const answer = await fetchKeyStatus().catch(() => null)
      if (answer) setStatus(answer)
    } catch (error) {
      setMessage(
        error instanceof Error ? error.message : "The key could not be removed.",
      )
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <section className="flex flex-col">
        <h3 className="pb-1 text-sm font-semibold text-pretty">OpenRouter</h3>

        <div className="flex flex-col gap-3 border-b py-4">
          <Label htmlFor="provider-key">API key</Label>
          <Input
            id="provider-key"
            type="password"
            autoComplete="off"
            spellCheck={false}
            placeholder={status?.valid ? "A key is stored" : "sk-or-v1-…"}
            value={draft}
            disabled={!supported || busy}
            onChange={(event) => setDraft(event.target.value)}
          />
          <p className="text-muted-foreground text-xs">
            {supported
              ? "Stored in the operating system's credential store — Windows Credential Manager, macOS Keychain, or libsecret. It is never written to disk in plaintext, and it is never read back into the app's interface."
              : "The website's server holds its own key in its environment. The desktop app keeps one here, in the system's credential store."}
          </p>
          {status?.valid && status.label ? (
            <p className="text-muted-foreground text-xs">
              Signed in as {status.label}
              {status.limit ? `, with a limit of ${status.limit}` : ""}.
            </p>
          ) : status && !status.valid ? (
            <p className="text-muted-foreground text-xs">
              {status.reason ?? "There is no key the provider accepts."}
            </p>
          ) : null}
          {message ? (
            <p className="text-muted-foreground text-xs" role="status">
              {message}
            </p>
          ) : null}
          <div className="flex items-center gap-2">
            <Button
              type="button"
              size="sm"
              disabled={!supported || busy || !draft.trim()}
              onClick={() => void save()}
            >
              <KeyRoundIcon className="size-4" />
              Save
            </Button>
            {status?.valid ? (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                disabled={!supported || busy}
                onClick={() => void remove()}
                className="text-destructive hover:text-destructive"
              >
                <Trash2Icon className="size-4" />
                Remove
              </Button>
            ) : null}
          </div>
        </div>
      </section>
    </div>
  )
}
