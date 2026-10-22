/**
 * The component rules, checked.
 *
 * The app has one component family and one primitive family, and this is
 * what keeps it that way. A rule nobody checks is a rule that is broken by
 * the next component.
 *
 * What it catches:
 *
 * 1. **An import that points at nothing.** A file that is renamed, moved or
 *    deleted leaves an import behind, and the build fails with a message
 *    about a module rather than about the thing that was renamed.
 * 2. **The older generation of the components being used again.** There is
 *    a second set under `src/components/ui/`, kept because six vendored
 *    files import it. The app's own code does not use it, and this fails
 *    if it starts to.
 * 3. **A second primitive family.** Every component is built on Base UI.
 *    A Radix import would be a second focus model, a second portal and a
 *    second way of closing an overlay.
 */

import { test } from "node:test"
import assert from "node:assert/strict"
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs"
import { dirname, join, relative, resolve } from "node:path"
import { fileURLToPath } from "node:url"

const SRC = resolve(dirname(fileURLToPath(import.meta.url)), "..")

/** The entry point. Everything the app actually runs is reachable from it. */
const ENTRY = "main.tsx"

/** Every file under `src/`, as a path relative to `src/`. */
const sourceFiles = (): string[] => {
  const found: string[] = []
  const walk = (dir: string) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const path = join(dir, entry.name)
      if (entry.isDirectory()) walk(path)
      else if (/\.tsx?$/.test(entry.name)) found.push(path)
    }
  }
  walk(SRC)
  return found.map((path) => relative(SRC, path).replace(/\\/g, "/"))
}

/** The id a file is known by: its path without the extension. */
const idOf = (path: string) => path.replace(/\.tsx?$/, "").replace(/\/index$/, "")

/** Where an import points. */
type Target =
  /** A module of ours. */
  | { kind: "module"; id: string }
  /** An asset — a provider's mark, a stylesheet, a JSON file. */
  | { kind: "asset" }
  /** Nothing. */
  | { kind: "missing" }

/** Where an import points. */
const resolveImport = (from: string, specifier: string): Target => {
  let base: string
  if (specifier.startsWith("@/")) base = join(SRC, specifier.slice(2))
  else if (specifier.startsWith(".")) base = resolve(dirname(join(SRC, from)), specifier)
  else return { kind: "asset" }
  for (const candidate of [
    base,
    `${base}.tsx`,
    `${base}.ts`,
    join(base, "index.ts"),
    join(base, "index.tsx"),
  ]) {
    if (existsSync(candidate) && statSync(candidate).isFile()) {
      const path = relative(SRC, candidate).replace(/\\/g, "/")
      /* An asset is a file, but it is not a module. */
      if (!/\.tsx?$/.test(path)) return { kind: "asset" }
      return { kind: "module", id: idOf(path) }
    }
  }
  return { kind: "missing" }
}

/** Every import in a file, and what it points at. */
type Import = {
  /** The file the import is in. */
  from: string
  /** The specifier as it is written. */
  specifier: string
  /** What it points at. */
  target: Target
}

const importsOf = (path: string): Import[] => {
  const source = readFileSync(join(SRC, path), "utf8")
  const found: Import[] = []
  for (const match of source.matchAll(/(?:from\s+|import\s*\()\s*["']([^"']+)["']/g)) {
    found.push({
      from: path,
      specifier: match[1],
      target: resolveImport(path, match[1]),
    })
  }
  return found
}

const files = sourceFiles()
const byId = new Map(files.map((path) => [idOf(path), path]))
const everyImport = files.flatMap(importsOf)

/** The files the app can actually reach from the entry point. */
const reachableFromEntry = (): Set<string> => {
  const seen = new Set<string>()
  const walk = (id: string) => {
    if (seen.has(id)) return
    const path = byId.get(id)
    if (!path) return
    seen.add(id)
    for (const entry of importsOf(path)) {
      if (entry.target.kind === "module") walk(entry.target.id)
    }
  }
  walk(idOf(ENTRY))
  return seen
}

test("every import points at a file that is there", () => {
  // A file that is renamed or moved leaves an import behind, and the build
  // fails with a message about a module rather than about the thing that
  // was renamed.
  const broken = everyImport.filter((entry) => entry.target.kind === "missing")
  assert.deepEqual(
    broken.map((entry) => `${entry.from} -> ${entry.specifier}`),
    [],
    "these imports point at nothing",
  )
})

test("the app's own code is on one component family", () => {
  // There is a second set of components under `src/components/ui/`, from an
  // older generation of the same set. Six vendored files import it and the
  // project keeps them as raw material, so the files themselves are fine.
  //
  // What is not fine is the app's own code reaching for one, because then
  // the app has two buttons and two tooltips and the older one wins the
  // argument about how a press feels.
  const reachable = reachableFromEntry()
  const legacy = everyImport.filter(
    (entry) =>
      entry.specifier.startsWith("@/components/ui/") &&
      reachable.has(idOf(entry.from)),
  )
  assert.deepEqual(
    legacy.map((entry) => `${entry.from} -> ${entry.specifier}`),
    [],
    "these files are reachable from the entry point and use the older component family",
  )
})

test("there is one primitive family", () => {
  // Base UI, and nothing else. A second family is a second focus model, a
  // second portal and a second way of closing an overlay.
  const foreign = everyImport.filter((entry) =>
    /^(radix-ui|@radix-ui\/)/.test(entry.specifier),
  )
  assert.deepEqual(
    foreign.map((entry) => `${entry.from} -> ${entry.specifier}`),
    [],
    "these files use a second primitive family",
  )
})

test("every component folder has a barrel", () => {
  // A component is imported as its folder — `import { Button } from
  // "@/components/button"` — so every folder needs an `index.ts` that
  // re-exports it. A folder without one is a component nobody can reach by
  // the app's own convention, and the next person writes their own import
  // for it.
  const missing: string[] = []
  for (const entry of readdirSync(join(SRC, "components"), { withFileTypes: true })) {
    if (!entry.isDirectory()) continue
    /* The older generation is not a folder of components. */
    if (entry.name === "ui") continue
    /* The assistant-ui elements are a group of files, not a component, and
       they are imported one at a time. */
    if (entry.name === "assistant-ui") continue
    const barrel = join(SRC, "components", entry.name, "index.ts")
    if (!existsSync(barrel)) missing.push(`components/${entry.name}`)
  }
  assert.deepEqual(missing, [], "these component folders have no index.ts")
})
