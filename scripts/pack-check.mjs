#!/usr/bin/env node
/**
 * Pack the package for real, open the tarball, and FAIL unless it is exactly
 * what may be published (scripts/pack-rules.mjs): the allowlisted files, no
 * source map, no TypeScript source, no test, script, fixture, dotfile, env
 * file, key or archive, no private name, host, bucket URL, local path or
 * secret in ANY file inside it, and under the size caps. Runs as
 * `prepublishOnly`, after the build, so a publish cannot skip it.
 *
 * `pnpm pack --dry-run --json` lists file names only, so the tarball is
 * packed into a temporary folder and extracted with `tar` to read contents.
 */
import { spawnSync } from "node:child_process";
import { mkdtempSync, readdirSync, readFileSync, rmSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { checkFileList, MAX_PACKED_BYTES, MAX_UNPACKED_BYTES, scanText } from "./pack-rules.mjs";

const root = fileURLToPath(new URL("..", import.meta.url));

const work = mkdtempSync(join(tmpdir(), "pack-check-"));
const problems = [];
try {
  const pack = spawnSync("pnpm", ["pack", "--pack-destination", work, "--json"], { cwd: root, encoding: "utf8" });
  if (pack.status !== 0) throw new Error(`pnpm pack failed: ${pack.stderr}`);
  const tarball = readdirSync(work).find((name) => name.endsWith(".tgz"));
  if (!tarball) throw new Error("pnpm pack produced no tarball");
  const packed = statSync(join(work, tarball)).size;
  if (packed > MAX_PACKED_BYTES) problems.push(`tarball is ${packed} bytes, over ${MAX_PACKED_BYTES}`);

  const out = join(work, "out");
  spawnSync("mkdir", ["-p", out]);
  const untar = spawnSync("tar", ["-xzf", join(work, tarball), "-C", out], { encoding: "utf8" });
  if (untar.status !== 0) throw new Error(`tar failed: ${untar.stderr}`);
  const base = join(out, "package");
  const files = [];
  const walk = (dir) => {
    for (const entry of readdirSync(dir)) {
      const path = join(dir, entry);
      if (statSync(path).isDirectory()) walk(path);
      else files.push(relative(base, path).split("\\").join("/"));
    }
  };
  walk(base);
  problems.push(...checkFileList(files));
  let unpacked = 0;
  for (const file of files) {
    const text = readFileSync(join(base, file), "utf8");
    unpacked += Buffer.byteLength(text);
    for (const f of scanText(file, text)) problems.push(`${f.path}:${f.line}: ${f.why}: ${f.excerpt}`);
  }
  if (unpacked > MAX_UNPACKED_BYTES) problems.push(`unpacked size ${unpacked} bytes, over ${MAX_UNPACKED_BYTES}`);
  console.log(`pack-check: ${tarball}, ${packed} bytes packed, ${unpacked} unpacked, ${files.length} files`);
  for (const file of files.sort()) console.log(`  ${file}`);
} finally {
  rmSync(work, { recursive: true, force: true });
}
if (problems.length > 0) {
  for (const p of problems) console.error(`pack-check: ${p}`);
  process.exit(1);
}
console.log("pack-check: clean");
