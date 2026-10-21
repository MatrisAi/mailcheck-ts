/**
 * The entry of the classic-script bundle, `dist/mailcheck.global.js`, for
 * pages that load mailcheck with `<script src>` and call a global. It defines
 * `window.MailcheckTs` and nothing else.
 *
 * Kept small on purpose: the typo suggester, the mailcheck-compatible API and
 * the MX check. The disposable-domain list (about 150 KB) is left out; pages
 * that need it import the ESM build (`mailcheck-ts/disposable`) instead.
 *
 * Built by scripts/build.mjs, not by tsc: tsconfig.build.json excludes this
 * file, so it ships only inside the bundle.
 */
export { suggest, suggestDomain } from "./suggest.js";
export { checkMx, isDefinitivelyUndeliverable } from "./mx.js";
export { run, Mailcheck } from "./mailcheck-compat.js";
