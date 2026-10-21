# Changelog

All notable changes to this package. Versions follow semantic versioning.

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
