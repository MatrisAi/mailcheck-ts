# Changelog

All notable changes to this package. Versions follow semantic versioning.

## 0.1.1

- `dist/mailcheck.global.js`: a minified classic-script bundle (about 21 KB,
  9 KB gzipped) for pages that load the library with `<script src>`. It
  defines one global, `window.MailcheckTs`, with `suggest`, `suggestDomain`,
  `checkMx`, `isDefinitivelyUndeliverable`, mailcheck's `run` and the
  `Mailcheck` object, so a page migrating from mailcheck changes only the
  global's name. The disposable-domain list is not included. The `jsdelivr`
  and `unpkg` fields point at it.
- README: CDN use (jsDelivr, unpkg, esm.sh) with exact-version pinning and
  Subresource Integrity, the classic-script example, and badges.
- Releases are now staged on npm by the release workflow (trusted
  publishing, provenance) and approved by a maintainer with 2FA on
  npmjs.com before they are installable.
- No change to the ESM modules' behaviour.

## 0.1.0

First public release.

- `suggest(email, options?)`: offline typo suggestion against a curated,
  DNS-verified provider list; answers only when one provider is clearly
  meant, never rewrites a real TLD.
- `checkMx(domain, options?)`: DNS-over-HTTPS MX check (Cloudflare and Google
  JSON resolvers) returning a discriminated union; only `null_mx`,
  `no_domain` and `no_mail_host` are definitive, every `unknown` must be
  allowed. `isDefinitivelyUndeliverable()` decides a refusal.
- `isDisposable(domain)` (`mailcheck-ts/disposable`): exact-name match
  against the vendored disposable-email-domains list, plus reviewed wildcard
  services.
- `checkEmail(email, options?)` (`mailcheck-ts/check`): all three with one
  verdict.
- `Mailcheck` (`mailcheck-ts/mailcheck`): typed drop-in for mailcheck's
  `run`, `suggest`, `splitEmail`, `encodeEmail` and `findClosestDomain`.
- ESM only, zero runtime dependencies; browsers, Node 18+, Deno, Bun,
  Cloudflare Workers and other edge runtimes.
