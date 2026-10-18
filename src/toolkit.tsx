"use generative";

import { defineToolkit } from "@assistant-ui/react";
import {
  CircleAlertIcon,
  FileIcon,
  FolderIcon,
  LoaderIcon,
} from "lucide-react";
import { z } from "zod";

import { listDirectory, readTextFile } from "@/lib/desktop";
import type { DirEntry, ReadFileResult } from "@/lib/desktop";
import { evaluateExpression } from "@/lib/expression";

const formatBytes = (bytes: number) => {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
};

/** Pending state from the incoming args, shared by the native tool renderers. */
const PendingRow = ({ label, path }: { label: string; path: string }) => (
  <div className="flex items-center gap-2 rounded-lg border border-border/70 bg-muted/40 px-3 py-2 text-sm">
    <LoaderIcon className="size-4 shrink-0 animate-spin text-muted-foreground" />
    <span className="text-muted-foreground shrink-0">{label}</span>
    <span className="truncate font-mono text-xs">{path}</span>
  </div>
);

const ErrorRow = ({ label, message }: { label: string; message: string }) => (
  <div className="flex items-start gap-2 rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
    <CircleAlertIcon className="mt-0.5 size-4 shrink-0" />
    <span className="min-w-0">
      <span className="font-medium">{label} failed</span>
      <span className="mt-0.5 block text-xs opacity-90">{message}</span>
    </span>
  </div>
);

const DirListRenderer = ({
  args,
  result,
}: {
  args: { path: string };
  result?: DirEntry[];
}) => {
  if (!result) return <PendingRow label="Listing" path={args.path} />;
  if (result.length === 0) {
    return (
      <div className="rounded-lg border border-border/70 bg-muted/40 px-3 py-2 text-sm text-muted-foreground">
        Empty directory.
      </div>
    );
  }
  return (
    <div className="overflow-hidden rounded-lg border border-border/70 bg-muted/30">
      <div className="border-b border-border/60 px-3 py-1.5 font-mono text-xs text-muted-foreground">
        {args.path}
      </div>
      <ul className="max-h-64 divide-y divide-border/40 overflow-y-auto">
        {result.map((entry) => (
          <li key={entry.path} className="flex items-center gap-2 px-3 py-1.5 text-sm">
            {entry.isDirectory ? (
              <FolderIcon className="size-4 shrink-0 text-muted-foreground" />
            ) : (
              <FileIcon className="size-4 shrink-0 text-muted-foreground" />
            )}
            <span className="min-w-0 flex-1 truncate">{entry.name}</span>
            {entry.size !== null && (
              <span className="shrink-0 text-xs text-muted-foreground tabular-nums">
                {formatBytes(entry.size)}
              </span>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
};

const FilePreviewRenderer = ({
  args,
  result,
  error,
}: {
  args: { path: string };
  result?: ReadFileResult;
  error?: string;
}) => {
  if (error) return <ErrorRow label="Reading file" message={error} />;
  if (!result) return <PendingRow label="Reading" path={args.path} />;
  return (
    <div className="overflow-hidden rounded-lg border border-border/70 bg-muted/30">
      <div className="flex items-center gap-2 border-b border-border/60 px-3 py-1.5">
        <FileIcon className="size-3.5 shrink-0 text-muted-foreground" />
        <span className="min-w-0 flex-1 truncate font-mono text-xs">
          {result.path}
        </span>
        <span className="shrink-0 text-xs text-muted-foreground tabular-nums">
          {formatBytes(result.bytes)}
          {result.truncated ? " (truncated)" : ""}
        </span>
      </div>
      <pre className="max-h-72 overflow-auto p-3 font-mono text-xs leading-relaxed whitespace-pre-wrap">
        {result.text || "(empty file)"}
      </pre>
    </div>
  );
};

export default defineToolkit({
  current_time: {
    description:
      "Get the current date and time on this machine as an ISO 8601 timestamp.",
    parameters: z.object({}),
    execute: async () => {
      "use client";
      return { now: new Date().toISOString() };
    },
    renderText: {
      running: "Checking the clock…",
      complete: ({ result }) =>
        result ? `It is ${new Date(result.now).toLocaleString()}` : "Done",
    },
  },

  evaluate_expression: {
    description:
      "Evaluate an arithmetic expression, for example (12 * 8) + 3 or 2^10. Supports + - * / % ^ and parentheses.",
    parameters: z.object({
      expression: z.string().describe("The arithmetic expression to evaluate"),
    }),
    execute: async ({ expression }) => {
      "use client";
      try {
        const value = evaluateExpression(expression);
        return { expression, value, ok: true as const };
      } catch (e) {
        return {
          expression,
          ok: false as const,
          error: e instanceof Error ? e.message : "Could not evaluate.",
        };
      }
    },
    renderText: {
      running: ({ args }) => `Calculating ${args.expression}…`,
      complete: ({ result }) =>
        !result
          ? "Done"
          : result.ok
            ? `${result.expression} = ${result.value}`
            : `Could not evaluate ${result.expression}: ${result.error}`,
    },
  },

  fetch_url: {
    description:
      "Fetch a public web address and return its text content, truncated to keep it within context.",
    parameters: z.object({ url: z.string().describe("The absolute URL to fetch") }),
    execute: async ({ url }) => {
      "use client";
      try {
        const response = await fetch(url);
        const raw = await response.text();
        const text = raw
          .replace(/<script[\s\S]*?<\/script>/gi, " ")
          .replace(/<style[\s\S]*?<\/style>/gi, " ")
          .replace(/<[^>]+>/g, " ")
          .replace(/\s+/g, " ")
          .trim();
        const truncated = text.length > 4000;
        return {
          url,
          status: response.status,
          text: truncated ? `${text.slice(0, 4000)}…` : text,
          truncated,
        };
      } catch (e) {
        // A browser-side fetch can only read cross-origin responses when the
        // target opts in, so a bare network failure here is nearly always CORS
        // rather than a bad URL. Say so, or the model reports it as an outage.
        return {
          url,
          status: 0,
          text: "",
          truncated: false,
          error:
            "Request could not be read from the browser. This is usually the " +
            "target's CORS policy rather than an outage: a cross-origin fetch " +
            "only works when the server sends Access-Control-Allow-Origin. " +
            "Try a different URL, or an endpoint that permits cross-origin reads.",
        };
      }
    },
    renderText: {
      running: ({ args }) => `Fetching ${args.url}…`,
      complete: ({ result }) =>
        !result
          ? "Done"
          : result.error
            ? `Could not fetch ${result.url}: ${result.error}`
            : `Fetched ${result.url} (HTTP ${result.status}${result.truncated ? ", truncated" : ""})`,
    },
  },

  list_directory: {
    description:
      "List the files and folders at a path on this machine. Desktop app only.",
    parameters: z.object({
      path: z.string().describe("Absolute directory path to list"),
    }),
    execute: async ({ path }) => {
      "use client";
      try {
        return { entries: await listDirectory(path), error: undefined };
      } catch (e) {
        return {
          entries: undefined,
          error: e instanceof Error ? e.message : "Could not list directory.",
        };
      }
    },
    render: ({ args, result }) => {
      if (result?.error) {
        return <ErrorRow label="Listing directory" message={result.error} />;
      }
      return (
        <DirListRenderer args={args} result={result?.entries as DirEntry[] | undefined} />
      );
    },
  },

  read_text_file: {
    description:
      "Read a UTF-8 text file from this machine, optionally capped in size. Desktop app only.",
    parameters: z.object({
      path: z.string().describe("Absolute file path to read"),
      maxBytes: z
        .number()
        .int()
        .positive()
        .max(2_000_000)
        .optional()
        .describe("Maximum bytes to read"),
    }),
    execute: async ({ path, maxBytes }) => {
      "use client";
      try {
        return { file: await readTextFile(path, maxBytes), error: undefined };
      } catch (e) {
        return {
          file: undefined,
          error: e instanceof Error ? e.message : "Could not read file.",
        };
      }
    },
    render: ({ args, result }) => (
      <FilePreviewRenderer
        args={args}
        result={result?.file as ReadFileResult | undefined}
        error={result?.error}
      />
    ),
  },
});