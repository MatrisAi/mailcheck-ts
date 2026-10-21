/**
 * The classic-script bundle, `dist/mailcheck.global.js`: one minified IIFE
 * that defines `window.MailcheckTs` (entry src/global.ts), for pages that
 * load the library with `<script src>`. No source map and no comments, by
 * the same rule as the tsc build; only a one-line license banner.
 *
 * rolldown is the bundler vite (and so vitest) already depends on, pinned
 * exactly in devDependencies, so the bundle adds no package to the install.
 *
 * Shared by scripts/build.mjs (writes the file) and
 * scripts/global-bundle.test.mjs (bundles in memory and evaluates it), so the
 * test checks the same configuration that ships.
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { build } from "rolldown";

const root = fileURLToPath(new URL("..", import.meta.url));
export const GLOBAL_BUNDLE_FILE = "dist/mailcheck.global.js";
export const GLOBAL_NAME = "MailcheckTs";

/** Bundle; with `write: false` nothing touches the disk. Returns the code. */
export async function bundleGlobal({ write }) {
  const { version } = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8"));
  const result = await build({
    cwd: root,
    input: "src/global.ts",
    // The sources import siblings as `./x.js`, as Node ESM requires; the files are `.ts`.
    resolve: { extensionAlias: { ".js": [".ts", ".js"] } },
    logLevel: "warn",
    write,
    output: {
      file: GLOBAL_BUNDLE_FILE,
      format: "iife",
      name: GLOBAL_NAME,
      minify: true,
      sourcemap: false,
      comments: false,
      postBanner: `/*! mailcheck-ts ${version} | MIT | adapts mailcheck (MIT, Received Inc) | see NOTICE */`,
    },
  });
  const chunks = result.output.filter((o) => o.type === "chunk");
  if (chunks.length !== 1 || result.output.length !== 1) {
    throw new Error(`the global bundle must be exactly one file, got ${result.output.map((o) => o.fileName).join(", ")}`);
  }
  return chunks[0].code;
}
