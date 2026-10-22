/**
 * The icon rules, checked.
 *
 * The app draws its marks from one pack, and this is what keeps it that way.
 * A rule nobody checks is a rule that is broken by the next icon.
 *
 * What it catches:
 *
 * 1. **A second icon pack.** The app is drawn with Lucide and only Lucide.
 *    A second pack is not a second set of glyphs, it is a second set of
 *    proportions: both packs stroke at 2px, and side by side at `size-4` the
 *    difference reads as a mistake rather than as a choice.
 * 2. **An import that is not a named import, or is named without the `Icon`
 *    suffix.** Both make one glyph look like two to anybody reading the
 *    code.
 * 3. **A deprecated Lucide alias.** The alias and the canonical name are the
 *    same component, so the app draws the same picture and the code says two
 *    different things about it.
 * 4. **A pane mark that is not in the installed package.** The map in
  *    `src/blocks/workspace/pane-types.ts` names a glyph for every kind of
 *    view, and a name the package does not have is a pane with no mark.
 */

import { test } from "node:test"
import assert from "node:assert/strict"
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs"
import { createRequire } from "node:module"
import { dirname, join, relative, resolve } from "node:path"
import { fileURLToPath } from "node:url"

const SRC = resolve(dirname(fileURLToPath(import.meta.url)), "..")
const ROOT = resolve(SRC, "..")

/** The entry point. Everything the app actually runs is reachable from it. */
const ENTRY = "main.tsx"

/**
 * Every name the installed package exports.
 *
 * The pack is read rather than imported because the rule this file enforces
 * is that an icon comes in by name, and a file that breaks the rule to check
 * it is not worth much. `createRequire` reads the same module the app's own
 * imports read, so the components compared below are the same objects.
 */
const EXPORTED = new Map<string, unknown>(
  Object.entries(createRequire(import.meta.url)("lucide-react")),
)

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
const idOf = (path: string) =>
  path.replace(/\.tsx?$/, "").replace(/\/index$/, "")

/**
 * The code of a file, without its comments.
 *
 * A comment that says "an import of one" is not an import, and a scanner
 * that cannot tell the difference finds one. The `//` is only a comment when
 * it follows whitespace, so a URL inside a string is left alone.
 */
const codeOf = (path: string): string =>
  readFileSync(join(SRC, path), "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, " ")
    .replace(/(^|\s)\/\/[^\n]*/g, "$1")

/** An import, as it is written. */
type Import = {
  /** The file the import is in. */
  from: string
  /** What is between `import` and `from`. */
  clause: string
  /** What it points at. */
  specifier: string
}

const importsOf = (path: string): Import[] => {
  const source = codeOf(path)
  const found: Import[] = []
  /* The clause cannot cross a semicolon, so a match cannot run past the end
     of the statement it started in. */
  for (const match of source.matchAll(
    /import\s+([^;]*?)\s+from\s*["']([^"']+)["']/g,
  )) {
    found.push({
      from: path,
      clause: match[1].trim(),
      specifier: match[2],
    })
  }
  return found
}

const files = sourceFiles()
const byId = new Map(files.map((path) => [idOf(path), path]))
const everyImport = files.flatMap(importsOf)

/** Where an import points, when it points at a module of ours. */
const resolveImport = (from: string, specifier: string): string | null => {
  let base: string
  if (specifier.startsWith("@/")) base = join(SRC, specifier.slice(2))
  else if (specifier.startsWith("."))
    base = resolve(dirname(join(SRC, from)), specifier)
  else return null
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
      if (!/\.tsx?$/.test(path)) return null
      return idOf(path)
    }
  }
  return null
}

/**
 * The files the app can actually reach from the entry point.
 *
 * The vendored assistant-ui elements are on disk and are not part of the app
 * that runs, so "the app's own code" means this and not "everything under
 * `src/`".
 */
const reachableFromEntry = (): Set<string> => {
  const seen = new Set<string>()
  const walk = (id: string) => {
    if (seen.has(id)) return
    const path = byId.get(id)
    if (!path) return
    seen.add(id)
    for (const entry of importsOf(path)) {
      const target = resolveImport(path, entry.specifier)
      if (target) walk(target)
    }
  }
  walk(idOf(ENTRY))
  return seen
}

/** The names a named import brings in. */
type ImportedName = {
  /** The name the package exports it under. */
  imported: string
  /** The name it is called here, which is the same unless it was renamed. */
  local: string
}

const namesIn = (clause: string): ImportedName[] => {
  /* A type-only import brings nothing into the bundle, so there is nothing
     in it to be named wrongly. */
  if (/^type\s/.test(clause)) return []
  const braced = clause.match(/\{([\s\S]*)\}/)
  if (!braced) return []
  return braced[1]
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean)
    /* An inline `type` is a type as well, and it is not a glyph. */
    .filter((part) => !/^type\s/.test(part))
    .map((part) => {
      const [imported, local] = part.split(/\s+as\s+/).map((s) => s.trim())
      return { imported, local: local ?? imported }
    })
}

/** Whether an import brings its names in by name, rather than as a namespace
 * or as a default. */
const isNamedImport = (clause: string) =>
  /^\{[\s\S]*\}$/.test(clause) || /^type\s+\{[\s\S]*\}$/.test(clause)

/** Every import of an icon, and the names it brings in. */
const iconImports = () =>
  everyImport
    .filter((entry) => entry.specifier === "lucide-react")
    .map((entry) => ({
      from: entry.from,
      clause: entry.clause,
      names: namesIn(entry.clause),
    }))

/**
 * The icon packs an app is most likely to reach for.
 *
 * The list is what makes the check a check: `@tabler/icons-react` cannot be
 * guessed from the code, and the name pattern on its own would miss it.
 */
const ICON_PACKS = [
  "@heroicons/react",
  "@iconify/react",
  "@iconify-icon/react",
  "@phosphor-icons/react",
  "@radix-ui/react-icons",
  "@tabler/icons-react",
  "@mui/icons-material",
  "@fortawesome/react-fontawesome",
  "@fortawesome/free-solid-svg-icons",
  "feather-icons",
  "react-feather",
  "react-icons",
  "remixicon",
  "unplugin-icons",
]

/** Whether a package name is an icon pack's. */
const looksLikeAnIconPack = (name: string) =>
  ICON_PACKS.includes(name) || /(^|[-/])(icons?|glyphs?)([-/]|$)/i.test(name)

/** The package a specifier belongs to, without the path inside it. */
const packageOf = (specifier: string): string => {
  const parts = specifier.split("/")
  return specifier.startsWith("@") ? parts.slice(0, 2).join("/") : parts[0]
}

/**
 * The aliases Lucide still exports, and the canonical name for each.
 *
 * The alias and the canonical name are the same component, so the choice
 * shows up in the code and nowhere else in the app.
 */
const DEPRECATED_ALIASES: Record<string, string> = {
  AlertCircleIcon: "CircleAlertIcon",
  AlertTriangleIcon: "TriangleAlertIcon",
  MoreHorizontalIcon: "EllipsisIcon",
  Loader2Icon: "LoaderCircleIcon",
  Trash2Icon: "TrashIcon",
  XCircleIcon: "CircleXIcon",
}

/**
 * Where the deprecated aliases are used today.
 *
 * They are listed rather than fixed because fixing them is a change to the
 * app's icons, and the task that wrote this map also says not to make one.
 * Each entry is a file and the alias in it, so a *new* use of an alias fails
 * and the old ones do not.
 */
const KNOWN_ALIAS_USES: Record<string, string[]> = {
  "blocks/prompt-input/prompt-controls.tsx": ["Trash2Icon"],
  "blocks/shell/settings-keys.tsx": ["Trash2Icon"],
  "blocks/shell/settings-privacy.tsx": ["Trash2Icon"],
  "blocks/shell/thread-context-menu.tsx": ["Trash2Icon"],
  "components/button/button.tsx": ["AlertCircleIcon"],
  "components/field/field.tsx": ["AlertCircleIcon"],
}

/**
 * The one import in the app that is not named with the `Icon` suffix.
 *
 * It is in a vendored file the app does not mount, and it is listed for the
 * same reason as the aliases: a new unsuffixed import fails, and this one
 * does not.
 */
const KNOWN_UNSUFFIXED: Record<string, string[]> = {
  "components/assistant-ui/elements/attachment.aui.tsx": ["FileText"],
}

/**
 * The pane types the plan names.
 *
 * They are the thirteen the plan's own inventory lists, and the map in
 * `pane-icons.ts` is a map of those and nothing else. A new kind of view is
 * added to the plan first.
 */
const PLANNED_PANE_TYPES = [
  "chat",
  "code-session",
  "diff",
  "browser",
  "app-preview",
  "terminal",
  "file-explorer",
  "file-editor",
  "plan",
  "tasks",
  "agent-activity",
  "file-preview",
  "logs",
]

test("the app has one icon pack", () => {
  // Lucide, and only Lucide. The two packs that are not interchangeable at
  // the same size are the reason: both stroke at 2px, and their glyph
  // proportions differ, so a `size-4` from each in the same row reads as a
  // mistake rather than as a choice.
  const manifest = JSON.parse(
    readFileSync(join(ROOT, "package.json"), "utf8"),
  ) as {
    dependencies?: Record<string, string>
    devDependencies?: Record<string, string>
  }
  const declared = [
    ...Object.keys(manifest.dependencies ?? {}),
    ...Object.keys(manifest.devDependencies ?? {}),
  ]

  assert.ok(
    declared.includes("lucide-react"),
    "the app should depend on lucide-react",
  )

  const packs = declared.filter(looksLikeAnIconPack)
  assert.deepEqual(
    packs,
    [],
    "these dependencies are icon packs, and the app has one already",
  )

  const imported = everyImport
    .map((entry) => entry.specifier)
    .filter((specifier) => !specifier.startsWith(".") && !specifier.startsWith("@/"))
    .map(packageOf)
    .filter(looksLikeAnIconPack)
    .filter((name) => name !== "lucide-react")
  assert.deepEqual(
    imported,
    [],
    "these files import an icon pack other than lucide-react",
  )

  const subpaths = everyImport
    .map((entry) => entry.specifier)
    .filter((specifier) => specifier.startsWith("lucide-react/"))
  assert.deepEqual(
    subpaths,
    [],
    "these files import a sub-path of lucide-react rather than the pack itself",
  )
})

test("an icon is imported by name, and the name ends in Icon", () => {
  // A namespace import and a default import are two ways of saying the same
  // thing, and neither of them says which glyph is meant. The suffix is the
  // other half of it: `X` and `XIcon` are the same picture, and only one of
  // them says so at a glance.
  const notNamed: string[] = []
  const notSuffixed: string[] = []

  for (const entry of iconImports()) {
    if (!isNamedImport(entry.clause)) {
      notNamed.push(`${entry.from} -> ${entry.clause}`)
      continue
    }
    for (const name of entry.names) {
      if (name.imported.endsWith("Icon") && name.local.endsWith("Icon")) continue
      const known = KNOWN_UNSUFFIXED[entry.from] ?? []
      if (known.includes(name.imported)) continue
      notSuffixed.push(`${entry.from} -> ${name.imported}`)
    }
  }

  assert.deepEqual(
    notNamed,
    [],
    "these icon imports are not named imports",
  )
  assert.deepEqual(
    notSuffixed,
    [],
    "these icons are imported without the Icon suffix",
  )
})

test("the deprecated aliases are the same component as the canonical name", () => {
  // The table above is a claim about the installed package, and the package
  // is the thing that decides it. If a future version of Lucide drops an
  // alias, this fails and the table is corrected rather than the app
  // silently carrying a name that means nothing.
  const wrong: string[] = []
  for (const [alias, canonical] of Object.entries(DEPRECATED_ALIASES)) {
    if (!EXPORTED.has(alias) || !EXPORTED.has(canonical)) {
      wrong.push(`${alias} or ${canonical} is not in the installed package`)
      continue
    }
    if (EXPORTED.get(alias) !== EXPORTED.get(canonical)) {
      wrong.push(`${alias} is not ${canonical} in the installed package`)
    }
  }
  assert.deepEqual(
    wrong,
    [],
    "the deprecated alias table is out of step with the installed package",
  )
})

test("the app's own code does not use a deprecated alias", () => {
  // The vendored elements still use three of them, and that is where they
  // are left: they are raw material the project keeps, and they are not
  // part of the app that runs. What is not allowed is the app's own code
  // taking one up, because the two names are the same picture and the code
  // would be saying two things about it.
  const live = reachableFromEntry()
  const used: string[] = []

  for (const entry of iconImports()) {
    if (!live.has(idOf(entry.from))) continue
    for (const name of entry.names) {
      if (!(name.imported in DEPRECATED_ALIASES)) continue
      const known = KNOWN_ALIAS_USES[entry.from] ?? []
      if (known.includes(name.imported)) continue
      used.push(`${entry.from} -> ${name.imported}`)
    }
  }

  assert.deepEqual(
    used,
    [],
    "these files use a deprecated Lucide alias",
  )
})

test("every icon in the pane mapping exists in the installed package", async () => {
  // The map names a glyph for every kind of view, and a name the package
  // does not have is a pane with no mark. The check is made against the
  // installed package rather than against the types, so it holds on its own
  // and not only when the project is typechecked.
  const mapping = "blocks/workspace/pane-types.ts"
  const clause = importsOf(mapping).find(
    (entry) => entry.specifier === "lucide-react",
  )
  assert.ok(clause, "the pane map should import its icons from lucide-react")

  const missing = namesIn(clause.clause)
    .map((name) => name.imported)
    .filter((name) => !EXPORTED.has(name))
  assert.deepEqual(
    missing,
    [],
    "the pane map names icons the installed lucide-react does not export",
  )

  const { PANE_TYPES } = await import("../blocks/workspace/pane-types.ts")

  const wrong: string[] = []
  for (const entry of PANE_TYPES) {
    /* The mark has to be a component the package exports, or the pane is
       drawing something of its own. */
    const exported = [...EXPORTED.entries()].filter(
      ([, value]) => value === entry.icon,
    )
    if (exported.length === 0) {
      wrong.push(`${entry.id}: the mark is not from lucide-react`)
      continue
    }
    /* And it has to be the one the package exports under the name it
       claims, so the map and the package cannot drift apart. */
    const canonical = entry.icon.displayName
    if (!canonical || !EXPORTED.has(`${canonical}Icon`)) {
      wrong.push(`${entry.id}: lucide-react does not export ${canonical}Icon`)
      continue
    }
    if (EXPORTED.get(`${canonical}Icon`) !== entry.icon) {
      wrong.push(
        `${entry.id}: the mark is not the one lucide-react exports as ${canonical}Icon`,
      )
    }
  }

  assert.deepEqual(
    wrong,
    [],
    "these pane marks are not in the installed lucide-react",
  )
})

test("the pane mapping is complete", async () => {
  // A pane type the Views menu offers needs a name, a line of description
  // and a mark, or it is a row of nothing. And two types cannot share a
  // key, because the key is what a pane instance is stored under.
  const { PANE_TYPES } = await import("../blocks/workspace/pane-types.ts")

  const keys = PANE_TYPES.map((entry) => entry.id)
  const twice = keys.filter((key, index) => keys.indexOf(key) !== index)
  assert.deepEqual(
    [...new Set(twice)],
    [],
    "these pane type keys are used twice",
  )

  const absent = PLANNED_PANE_TYPES.filter(
    (key) => !keys.some((known) => known === key),
  )
  assert.deepEqual(
    absent,
    [],
    "these pane types the plan names are not in the map",
  )

  const incomplete: string[] = []
  for (const entry of PANE_TYPES) {
    if (!entry.label.trim()) incomplete.push(`${entry.id}: no title`)
    if (!entry.description.trim()) incomplete.push(`${entry.id}: no description`)
    if (!entry.icon) incomplete.push(`${entry.id}: no mark`)
  }
  assert.deepEqual(
    incomplete,
    [],
    "these pane types are missing something the Views menu needs",
  )
})
