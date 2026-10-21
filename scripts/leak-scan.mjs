#!/usr/bin/env node
/**
 * Scan every file of this repository (not .git, node_modules, dist or
 * coverage) with the rules in scripts/pack-rules.mjs: no private names,
 * hosts, repository paths, local paths or secrets. Runs before the tests, so
 * a leak fails the package's own `test`.
 *
 * No exception is made here beyond the shared ALLOWED_LINES in
 * pack-rules.mjs (the copyright holder and the package's own repository
 * metadata), so the tree and the tarball pass or fail on the same rules.
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { scanText } from "./pack-rules.mjs";

const root = fileURLToPath(new URL("..", import.meta.url));
const SKIP = new Set([".git", "node_modules", "dist", "coverage", ".turbo"]);

function walk(dir) {
  const out = [];
  for (const entry of readdirSync(dir)) {
    if (SKIP.has(entry)) continue;
    const path = join(dir, entry);
    if (statSync(path).isDirectory()) out.push(...walk(path));
    else out.push(path);
  }
  return out;
}

const findings = [];
for (const path of walk(root)) {
  const rel = relative(root, path).split("\\").join("/");
  if (rel.endsWith(".tgz")) continue;
  findings.push(...scanText(rel, readFileSync(path, "utf8")));
}
if (findings.length > 0) {
  for (const f of findings) console.error(`leak-scan: ${f.path}:${f.line}: ${f.why}: ${f.excerpt}`);
  console.error(`leak-scan: ${findings.length} finding(s).`);
  process.exit(1);
}
console.log("leak-scan: clean");
