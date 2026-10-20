/**
 * Which files are worth walking for, and which folders are not worth walking
 * into.
 *
 * The website walks a folder through the browser's file handles and the
 * desktop app walks it through Rust, and the two must agree: a file the model
 * can see on one target and not on the other would be a different app on each.
 *
 * So the rules live here, once, and both walks read them.
 */

/** Extensions worth reading. */
export const SOURCE_EXTENSIONS: ReadonlySet<string> = new Set([
  "ts", "tsx", "js", "jsx", "mjs", "cjs", "json", "md", "mdx", "txt",
  "css", "scss", "html", "yml", "yaml", "toml", "rs", "py", "go", "sql",
  "sh", "env", "example", "lock",
])

/** Never descend into these; they are large, noisy and never edited by hand. */
export const SKIP_DIRECTORIES: ReadonlySet<string> = new Set([
  "node_modules", ".git", "dist", "build", "out", "target", "vendor",
  ".next", ".nuxt", ".turbo", ".cache", "coverage", "__pycache__",
  ".venv", "venv", ".idea", ".vscode",
])

/** How many files one walk may return. */
export const MAX_WALK_ENTRIES = 4000

/** How deep one walk may go. */
export const MAX_WALK_DEPTH = 6

/** The largest file that may be inlined into a prompt. */
export const MAX_READ_BYTES = 400 * 1024

/** Whether a file's name says it is worth reading. */
export const isSourceFile = (name: string): boolean => {
  const dot = name.lastIndexOf(".")
  if (dot <= 0) return false
  return SOURCE_EXTENSIONS.has(name.slice(dot + 1).toLowerCase())
}
