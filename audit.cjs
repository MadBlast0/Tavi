const fs = require("node:fs");
const path = require("node:path");

const walk = (dir, out = []) => {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === "node_modules" || entry.name === "dist" || entry.name === "target") continue;
    const p = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(p, out);
    else if (/\.(ts|tsx)$/.test(p)) out.push(p);
  }
  return out;
};

const files = [...walk("src"), ...walk("server")];
const read = (f) => fs.readFileSync(f, "utf8");
const bodies = new Map(files.map((f) => [f, read(f)]));

// exports
const exportsOf = (src) => {
  const names = [];
  for (const m of src.matchAll(/^export\s+(?:async\s+)?(?:function|const|class|type|interface|enum)\s+([A-Za-z0-9_]+)/gm)) names.push(m[1]);
  for (const m of src.matchAll(/^export\s*\{([^}]+)\}/gm)) {
    for (const part of m[1].split(",")) {
      const name = part.trim().split(/\s+as\s+/).pop().trim();
      if (name) names.push(name);
    }
  }
  return names;
};

const unused = [];
for (const [file, src] of bodies) {
  if (file.includes("test.ts")) continue;
  for (const name of exportsOf(src)) {
    let used = false;
    for (const [other, otherSrc] of bodies) {
      if (other === file) continue;
      const re = new RegExp("\\b" + name.replace(/[$]/g, "\\$") + "\\b");
      if (re.test(otherSrc)) { used = true; break; }
    }
    if (!used) unused.push(`${file}  ->  ${name}`);
  }
}
console.log("=== EXPORTS NOTHING ELSE REFERENCES ===");
console.log(unused.sort().join("\n"));

// files nothing imports
const imported = new Set();
for (const src of bodies.values()) {
  for (const m of src.matchAll(/from\s+"([^"]+)"/g)) imported.add(m[1]);
  for (const m of src.matchAll(/import\s+"([^"]+)"/g)) imported.add(m[1]);
}
const resolve = (from, spec) => {
  if (!spec.startsWith(".")) return null;
  let p = path.normalize(path.join(path.dirname(from), spec)).replace(/\\/g, "/");
  p = p.replace(/\.ts$/, ".tsx").replace(/\.tsx$/, ".tsx");
  const base = p.replace(/\.tsx$/, "");
  for (const cand of [p, base + ".tsx", base + ".ts", base + "/index.ts", base + "/index.tsx"]) {
    if (files.includes(cand)) return cand;
  }
  return null;
};
const orphans = [];
for (const file of files) {
  if (file.includes("test.ts") || file.includes("main.tsx")) continue;
  let isImported = false;
  for (const [other, src] of bodies) {
    if (other === file) continue;
    for (const m of src.matchAll(/from\s+"([^"]+)"/g)) {
      if (resolve(other, m[1]) === file) { isImported = true; break; }
    }
    if (isImported) break;
  }
  if (!isImported) orphans.push(file);
}
console.log("\n=== FILES NOTHING IMPORTS ===");
console.log(orphans.sort().join("\n"));
