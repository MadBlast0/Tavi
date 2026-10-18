"use client"

import * as React from "react"

import { countLines, formatBytes, matchesAccept } from "./text"

type PromptFileState = "uploading" | "done" | "error"

type PromptFile = {
  id: string
  file: File
  name: string
  size: number
  type: string
  state: PromptFileState
  preview?: string
  progress?: number
  error?: string
  retryable?: boolean
  pasted?: { text: string; lines: number }
  result?: unknown
}

type UploadOptions = {
  signal: AbortSignal
  onProgress: (progress: number) => void
}

type PromptUpload = (file: File, options: UploadOptions) => Promise<unknown>

type PromptFileOptions = {
  accept?: string
  maxFiles?: number
  maxFileSize?: number
  upload?: PromptUpload
  onReject?: (file: File, reason: string) => void
}

class UploadError extends Error {
  retryable: boolean

  constructor(message: string, { retryable = true } = {}) {
    super(message)
    this.retryable = retryable
  }
}

let counter = 0

function nextId() {
  counter += 1
  return `file-${Date.now().toString(36)}-${counter}`
}

function createPreview(file: File) {
  if (!file.type.startsWith("image/")) return undefined
  try {
    return URL.createObjectURL(file)
  } catch {
    return undefined
  }
}

function revoke(entry: PromptFile) {
  if (!entry.preview) return
  try {
    URL.revokeObjectURL(entry.preview)
  } catch {}
}

function usePromptFiles({
  accept,
  maxFiles = 10,
  maxFileSize,
  upload,
  onReject,
}: PromptFileOptions) {
  const [files, setFiles] = React.useState<PromptFile[]>([])
  const filesRef = React.useRef(files)
  const controllers = React.useRef(new Map<string, AbortController>())
  const options = React.useRef({ upload, onReject })
  options.current = { upload, onReject }

  React.useEffect(() => {
    filesRef.current = files
  }, [files])

  React.useEffect(() => {
    const pending = controllers.current
    return () => {
      for (const controller of pending.values()) controller.abort()
      for (const entry of filesRef.current) revoke(entry)
    }
  }, [])

  const patch = React.useCallback((id: string, change: Partial<PromptFile>) => {
    setFiles((current) =>
      current.map((entry) => (entry.id === id ? { ...entry, ...change } : entry))
    )
  }, [])

  const start = React.useCallback(
    (entry: PromptFile) => {
      const send = options.current.upload
      if (!send) return
      const controller = new AbortController()
      controllers.current.set(entry.id, controller)
      send(entry.file, {
        signal: controller.signal,
        onProgress: (progress) => {
          if (!controller.signal.aborted) {
            patch(entry.id, { progress: Math.round(progress) })
          }
        },
      }).then(
        (result) => {
          if (controller.signal.aborted) return
          controllers.current.delete(entry.id)
          patch(entry.id, { state: "done", progress: undefined, result })
        },
        (error: unknown) => {
          if (controller.signal.aborted) return
          controllers.current.delete(entry.id)
          patch(entry.id, {
            state: "error",
            progress: undefined,
            error: error instanceof Error ? error.message : "Upload failed",
            retryable: !(error instanceof UploadError) || error.retryable,
          })
        }
      )
    },
    [patch]
  )

  const add = React.useCallback(
    (incoming: File[], extra: { pasted?: string } = {}) => {
      const accepted: PromptFile[] = []
      const rejected: PromptFile[] = []
      let room = maxFiles - filesRef.current.filter((f) => f.state !== "error").length
      for (const file of incoming) {
        const base = {
          id: nextId(),
          file,
          name: file.name || "Untitled",
          size: file.size,
          type: file.type,
        }
        let reason: string | null = null
        if (!matchesAccept(file, accept)) reason = "This file type isn’t supported"
        else if (maxFileSize !== undefined && file.size > maxFileSize) {
          reason = `Larger than ${formatBytes(maxFileSize)}`
        } else if (room <= 0) {
          reason = `You can attach up to ${maxFiles} files`
        }
        if (reason) {
          rejected.push({ ...base, state: "error", error: reason, retryable: false })
          options.current.onReject?.(file, reason)
          continue
        }
        room--
        accepted.push({
          ...base,
          state: options.current.upload ? "uploading" : "done",
          progress: options.current.upload ? 0 : undefined,
          preview: createPreview(file),
          pasted:
            extra.pasted !== undefined
              ? { text: extra.pasted, lines: countLines(extra.pasted) }
              : undefined,
        })
      }
      const next = [...filesRef.current, ...accepted, ...rejected]
      filesRef.current = next
      setFiles(next)
      for (const entry of accepted) start(entry)
      return { accepted, rejected }
    },
    [accept, maxFiles, maxFileSize, start]
  )

  const remove = React.useCallback((id: string) => {
    controllers.current.get(id)?.abort()
    controllers.current.delete(id)
    const entry = filesRef.current.find((f) => f.id === id)
    if (entry) revoke(entry)
    const next = filesRef.current.filter((f) => f.id !== id)
    filesRef.current = next
    setFiles(next)
  }, [])

  const retry = React.useCallback(
    (id: string) => {
      const entry = filesRef.current.find((f) => f.id === id)
      if (!entry || entry.state !== "error" || !entry.retryable) return
      const reset = { ...entry, state: "uploading" as const, progress: 0, error: undefined }
      patch(id, reset)
      start(reset)
    },
    [patch, start]
  )

  const take = React.useCallback(() => {
    const sent = filesRef.current.filter((f) => f.state === "done")
    for (const entry of filesRef.current) {
      if (entry.state !== "done") {
        controllers.current.get(entry.id)?.abort()
        revoke(entry)
      }
    }
    controllers.current.clear()
    filesRef.current = []
    setFiles([])
    return sent
  }, [])

  const restore = React.useCallback((entries: PromptFile[]) => {
    const next = [...entries, ...filesRef.current]
    filesRef.current = next
    setFiles(next)
  }, [])

  return React.useMemo(
    () => ({ files, add, remove, retry, take, restore }),
    [files, add, remove, retry, take, restore]
  )
}

export {
  UploadError,
  usePromptFiles,
  type PromptFile,
  type PromptFileOptions,
  type PromptFileState,
  type PromptUpload,
  type UploadOptions,
}
