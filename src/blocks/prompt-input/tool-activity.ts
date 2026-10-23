/**
 * What a tool did, in words.
 *
 * The names a program uses are the program's, and several of them mean
 * nothing to the person reading the row. These are said in words instead:
 * "Running a command" rather than "shell".
 *
 * The wording is kept here, away from the arrangement, because it is the
 * part worth checking — a row that says "shell" is a row showing an
 * identifier where a person was meant to read a sentence.
 */

import type { ToolActivity } from "@/lib/api"

/** The names a program is known by, and what they are called here. */
const KNOWN: Record<string, string> = {
  shell: "Running a command",
  bash: "Running a command",
  read: "Reading a file",
  read_file: "Reading a file",
  write: "Writing a file",
  write_file: "Writing a file",
  edit: "Editing a file",
  edit_file: "Editing a file",
  patch: "Editing a file",
  glob: "Listing files",
  list: "Listing files",
  ls: "Listing files",
  grep: "Searching files",
  search: "Searching files",
  webfetch: "Opening a web page",
  fetch: "Opening a web page",
  websearch: "Searching the web",
  task: "Starting another agent",
  agent: "Starting another agent",
  todowrite: "Writing the plan",
  todoread: "Reading the plan",
}

/** What a tool was doing, in words. */
export const toolLabel = (tool: ToolActivity): string => {
  const name = tool.name.toLowerCase()
  if (KNOWN[name]) return KNOWN[name]

  const words = name.replace(/[_-]+/g, " ").trim()
  if (!words) return "Working"
  return words.charAt(0).toUpperCase() + words.slice(1)
}

/**
 * The one detail worth showing.
 *
 * What the tool was given, trimmed to a line: the command it ran, or the
 * file it was about. An absolute path is left as the program gave it — this
 * is the person's own machine, and the path is the only thing that says
 * which file.
 */
export const toolDetail = (tool: ToolActivity): string | null => {
  const input = tool.input
  if (input && typeof input === "object") {
    const record = input as Record<string, unknown>
    for (const key of ["command", "filePath", "file_path", "path", "url", "pattern"]) {
      const value = record[key]
      if (typeof value === "string" && value.trim()) {
        return value.trim().split("\n")[0].slice(0, 120)
      }
    }
  }
  if (typeof input === "string" && input.trim()) {
    return input.trim().split("\n")[0].slice(0, 120)
  }
  if (tool.output) {
    return tool.output.trim().split("\n")[0].slice(0, 120)
  }
  return null
}

/** Whether a tool failed, so the row can say so. */
export const toolFailed = (tool: ToolActivity): boolean =>
  tool.status === "failed" || tool.status === "error"
