import { test } from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

/**
 * The HTTP boundary, checked.
 *
 * The frontend talks to the website's server over `/api`, and nothing checks
 * that the two agree. A route renamed on one side is a route that fails in
 * the browser and nowhere else — the desktop app talks to Rust, and does not
 * notice at all.
 *
 * There is already a test of the same kind for the other boundary:
 * `src/lib/commands.test.ts` reads the frontend's `invoke("…")` calls and
 * Rust's `generate_handler![…]` list and says they agree. This is that test
 * for the HTTP one.
 *
 * The server's routes are read out of the file rather than from a table,
 * because a table would be a second copy of the truth, and a second copy is
 * what the test exists to prevent.
 */

/**
 * The source without its comments.
 *
 * A comment that talks about the boundary is not part of the boundary, and
 * one that quotes a path is not a request.
 */
const stripComments = (source: string): string =>
  source
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^\s*\/\/.*$/gm, "");

/** Every file under a folder, with its path. */
const walk = (folder: string): string[] => {
  const out: string[] = [];
  for (const entry of readdirSync(folder)) {
    const path = join(folder, entry);
    if (statSync(path).isDirectory()) out.push(...walk(path));
    else if (/\.(ts|tsx)$/.test(path)) out.push(path);
  }
  return out;
};

const ROOT = join(import.meta.dirname, "..", "..");

/** A route the server serves. */
type Route = {
  path: string;
  /** Every path the block serves; a block may name several. */
  paths: string[];
  /** The methods it answers. Empty means "any". */
  methods: Set<string>;
};

/**
 * The routes the server serves.
 *
 * The routing is a series of `if (url.pathname === "…")` blocks, and the
 * methods are decided inside them. Both are read here.
 */
const serverRoutes = (): Route[] => {
  const source = stripComments(
    readFileSync(join(ROOT, "server", "main.ts"), "utf8"),
  );

  /* Every path the server mentions, with where it is mentioned. */
  const mentions = [
    ...source.matchAll(/url\.pathname\s*(===|!==)\s*"(\/api\/[^"]+)"/g),
  ].map((match) => ({
    operator: match[1] as "===" | "!==",
    path: match[2],
    index: match.index ?? 0,
    end: (match.index ?? 0) + match[0].length,
  }));

  assert.ok(mentions.length > 0, "the server should have some routes");

  /* Paths joined by `||` are one block, and one block is one route family. */
  const groups: Array<{
    paths: string[];
    start: number;
    end: number;
  }> = [];
  for (const mention of mentions) {
    const previous = groups[groups.length - 1];
    if (previous) {
      const separator = source.slice(previous.end, mention.index);
      if (/^\s*\|\|\s*url\.pathname\s*===\s*"$/.test(separator)) {
        previous.paths.push(mention.path);
        previous.end = mention.end;
        continue;
      }
    }
    groups.push({
      paths: [mention.path],
      start: mention.index,
      end: mention.end,
    });
  }

  return groups.map((group, index) => {
    const end =
      index + 1 < groups.length ? groups[index + 1].start : source.length;
    const body = source.slice(group.start, end);

    const methods = new Set<string>();
    for (const match of body.matchAll(/req\.method\s*===\s*"(\w+)"/g)) {
      methods.add(match[1]);
    }
    for (const match of body.matchAll(/req\.method\s*!==\s*"(\w+)"/g)) {
      methods.clear();
      methods.add(match[1]);
    }
    for (const match of body.matchAll(/allow:\s*"([^"]+)"/g)) {
      for (const method of match[1].split(",")) {
        methods.add(method.trim());
      }
    }

    return { path: group.paths[0], methods, paths: group.paths };
  });
};

/** A request the frontend makes. */
type Call = {
  path: string;
  method: string;
  file: string;
};

/** Every `/api` request the frontend makes. */
const frontendCalls = (): Call[] => {
  const calls: Call[] = [];
  for (const path of walk(join(ROOT, "src"))) {
    const source = stripComments(readFileSync(path, "utf8"));
    for (const match of source.matchAll(/fetch\(\s*[`"'](\/api\/[^`"']*)/g)) {
      const start = match.index ?? 0;
      /* The options are the next few hundred characters; a call is short. */
      const options = source.slice(start, start + 600);
      const method = options.match(/method:\s*"(\w+)"/)?.[1] ?? "GET";
      calls.push({
        path: match[1].split("?")[0],
        method,
        file: path.slice(ROOT.length + 1),
      });
    }
  }
  return calls;
};

test("every request the frontend makes is a route the server serves", () => {
  const routes = serverRoutes();
  const served = new Set(routes.flatMap((route) => route.paths));

  for (const call of frontendCalls()) {
    assert.ok(
      served.has(call.path),
      `the frontend fetches ${call.path} from ${call.file}, and the server does not serve it`,
    );
  }
});

test("the method the frontend uses is one the server allows", () => {
  const routes = serverRoutes();

  for (const call of frontendCalls()) {
    const route = routes.find((candidate) => candidate.paths.includes(call.path));
    assert.ok(route, `the server should serve ${call.path}`);
    if (route.methods.size === 0) continue;
    assert.ok(
      route.methods.has(call.method),
      `the frontend uses ${call.method} for ${call.path}, and the server allows ${[
        ...route.methods,
      ].join(", ")}`,
    );
  }
});

test("the server serves no route the frontend cannot reach", () => {
  const called = new Set(frontendCalls().map((call) => call.path));
  const unused = [
    ...new Set(
      serverRoutes()
        .flatMap((route) => route.paths)
        .filter((path) => !called.has(path)),
    ),
  ];

  /* `/api/health` is a health check by design: something has to be able to
     ask whether the server is up without being the app. */
  assert.deepEqual(
    unused,
    ["/api/health"],
    "these routes are served but nothing calls them",
  );
});

test("the server's routes are all under /api", () => {
  for (const route of serverRoutes()) {
    assert.match(route.path, /^\/api\//);
  }
});
