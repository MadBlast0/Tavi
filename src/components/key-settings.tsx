"use client";

import { KeyRoundIcon, LoaderIcon, Trash2Icon } from "lucide-react";
import { useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/label";
import {
  clearApiKey,
  isKeyStoreAvailable,
  loadApiKey,
  saveApiKey,
} from "@/lib/secret";

/**
 * Key entry. The value is held in component state only long enough to submit,
 * then cleared — it is never mirrored into storage or rendered back after a
 * save. On reload the app shows only whether a key exists, never the key.
 */
export const KeySettings = () => {
  const [supported, setSupported] = useState(false);
  const [hasKey, setHasKey] = useState(false);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    setSupported(isKeyStoreAvailable());
    if (isKeyStoreAvailable()) {
      loadApiKey().then((key) => setHasKey(Boolean(key)));
    }
  }, []);

  const save = async () => {
    setBusy(true);
    setMessage(null);
    try {
      await saveApiKey(draft);
      setHasKey(true);
      setDraft("");
      setMessage("Key saved to the system credential store.");
    } catch (error) {
      setMessage(
        error instanceof Error ? error.message : "Could not save the key.",
      );
    } finally {
      setBusy(false);
    }
  };

  const clear = async () => {
    setBusy(true);
    setMessage(null);
    try {
      await clearApiKey();
      setHasKey(false);
      setMessage("Key removed.");
    } catch (error) {
      setMessage(
        error instanceof Error ? error.message : "Could not remove the key.",
      );
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog>
      <DialogTrigger
        render={
          <Button
            type="button"
            size="icon"
            variant="ghost"
            aria-label="API key settings"
            className="text-muted-foreground hover:text-foreground size-8 rounded-full"
          >
            <KeyRoundIcon className="size-4" />
          </Button>
        }
      />
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Provider API key</DialogTitle>
          <DialogDescription>
            {supported
              ? "Stored in the operating system's credential store — Windows Credential Manager, macOS Keychain, or libsecret. It is never written to disk in plaintext."
              : "Key storage needs the desktop app. Run `npm run tauri dev`, or set OPENROUTER_API_KEY in .env.local for the web target."}
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-3">
          <Label htmlFor="api-key">OpenRouter API key</Label>
          <Input
            id="api-key"
            type="password"
            autoComplete="off"
            spellCheck={false}
            placeholder={hasKey ? "A key is stored" : "sk-or-v1-…"}
            value={draft}
            disabled={!supported || busy}
            onChange={(e) => setDraft(e.target.value)}
          />
          <p className="text-muted-foreground text-xs">
            {hasKey
              ? "A key is currently stored. Enter a new value to replace it."
              : "No key stored yet."}
          </p>
          {message && (
            <p className="text-muted-foreground text-xs" role="status">
              {message}
            </p>
          )}
        </div>

        <DialogFooter className="gap-2">
          {hasKey && (
            <Button
              type="button"
              variant="ghost"
              disabled={busy}
              onClick={clear}
              className="text-destructive hover:text-destructive gap-1.5"
            >
              <Trash2Icon className="size-4" />
              Remove
            </Button>
          )}
          <DialogClose
            render={
              <Button type="button" variant="outline" disabled={busy}>
                Close
              </Button>
            }
          />
          <Button
            type="button"
            disabled={!supported || busy || draft.trim().length === 0}
            onClick={save}
          >
            {busy && <LoaderIcon className="size-4 animate-spin" />}
            Save key
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};