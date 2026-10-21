#!/usr/bin/env node
/**
 * Build dist/ from scratch: the folder is deleted first, so no stale file (an
 * old source map, a removed module) can ride into a pack.
 *
 * 1. tsc with tsconfig.build.json: the ESM modules and their declarations.
 * 2. scripts/bundle-global.mjs: dist/mailcheck.global.js, the classic-script
 *    bundle that defines `window.MailcheckTs`.
 */
import { spawnSync } from "node:child_process";
import { rmSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { bundleGlobal } from "./bundle-global.mjs";

const root = fileURLToPath(new URL("..", import.meta.url));
rmSync(new URL("../dist", import.meta.url), { recursive: true, force: true });
const tsc = spawnSync("pnpm", ["exec", "tsc", "-p", "tsconfig.build.json"], { cwd: root, stdio: "inherit" });
if (tsc.status !== 0) process.exit(tsc.status ?? 1);
await bundleGlobal({ write: true });
