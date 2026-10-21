# mailcheck-ts

Catch mistyped, disposable and undeliverable email addresses **without ever
refusing a real one**.

- `suggest(email)`: "Did you mean jane@gmail.com?", offline and pure.
- `checkMx(domain)`: can this domain receive mail at all? One to three
  DNS-over-HTTPS queries; refuses only on a definitive DNS answer.
- `isDisposable(domain)`: is it a throwaway inbox service? Offline.
- `checkEmail(email, options)`: all three with one verdict.
- `Mailcheck.run(...)`: a typed, drop-in replacement for
  [mailcheck](https://github.com/mailcheck/mailcheck).

Zero runtime dependencies, ESM, strict TypeScript. Runs anywhere the web
platform does: browsers, Node 18+, Deno, Bun, Cloudflare Workers and other
edge runtimes. It uses only `fetch`, `Response`, `URL`, `URLSearchParams`
and `AbortSignal.timeout`.

MIT licensed. Built on mailcheck, public disposable-domain and TLD lists and
the DNS-over-HTTPS services named in [Acknowledgements](#acknowledgements).

## Install

```sh
npm install mailcheck-ts
# or
pnpm add mailcheck-ts
# or
yarn add mailcheck-ts
# or
bun add mailcheck-ts
# Deno
deno add npm:mailcheck-ts
```

Straight in a browser, with no build step:

```html
<script type="module">
  import { suggest } from "https://esm.sh/mailcheck-ts@0.1/suggest";
  console.log(suggest("ana@gmial.com")?.address); // "ana@gmail.com"
</script>
```

Pin the version you tested (`mailcheck-ts@0.1.0`) in production.

## Quick start

A "Did you mean" hint on an email field, without blocking the person:

```ts
import { suggest } from "mailcheck-ts/suggest";

const input = document.querySelector<HTMLInputElement>("#email")!;
const hint = document.querySelector<HTMLElement>("#email-hint")!;

input.addEventListener("blur", () => {
  const fix = suggest(input.value);
  hint.textContent = fix ? `Did you mean ${fix.address}?` : "";
  hint.onclick = fix ? () => { input.value = fix.address; hint.textContent = ""; } : null;
});
```

On the server, refuse only what DNS proves cannot receive mail, and decide
yourself about disposable inboxes:

```ts
import { checkEmail } from "mailcheck-ts/check";

const result = await checkEmail(email, { allowDisposable: false });
if (result.verdict === "invalid") {
  // not an email address at all
} else if (result.verdict === "undeliverable" || result.verdict === "disposable") {
  // answer 400 with result.suggestion?.address when there is one
}
// "allow" also covers a DNS lookup that did not answer in time
// (result.mx.kind === "unknown"): never refuse on that.
```

## Overview

| | `suggest` | `checkMx` | `isDisposable` |
|---|---|---|---|
| Subpath | `mailcheck-ts/suggest` (or the root) | `mailcheck-ts/mx` (or the root) | `mailcheck-ts/disposable` |
| Network | none | DoH queries | none |
| When unsure | `null` | `unknown`, which you must allow | `false` |

The disposable list (about 145 KB of text) lives only in
`mailcheck-ts/disposable` and `mailcheck-ts/check`, so code that only
suggests typos never ships it.

```ts
import { suggest, checkMx, isDefinitivelyUndeliverable } from "mailcheck-ts";
import { isDisposable } from "mailcheck-ts/disposable";
import { checkEmail } from "mailcheck-ts/check";

suggest("ana@gmial.com");
// { address: "ana@gmail.com", domain: "gmail.com", original: "gmial.com", reason: "typo" }
suggest("ana@company.co"); // null: .co is a real TLD, never rewritten
suggest("ana@acme.com");   // null: not near a known provider

await checkMx("gmail.ro");            // { kind: "no_mail_host" }
isDisposable("x.mailinator.com");     // true

await checkEmail("ana@gmail.ro");
// { verdict: "undeliverable", domain: "gmail.ro", suggestion: { address: "ana@gmail.com", ... }, mx: { kind: "no_mail_host" } }
await checkEmail("a@mailinator.com", { allowDisposable: false }); // { verdict: "disposable", ... }
```

## The rule this package is built around

**A typo hint costs nothing; a wrong refusal loses a person.** So:

- `suggest()` never blocks anything. It answers only when exactly one known
  provider is clearly what was meant, and `null` otherwise.
- `checkMx()` returns a discriminated union. Only three answers are proof:
  `null_mx`, `no_domain`, `no_mail_host`. Everything else (`deliverable`, and
  every kind of `unknown`: timeout, SERVFAIL, HTTP error, unexpected body)
  must be allowed. `isDefinitivelyUndeliverable()` is the one function to
  decide a refusal with.
- The library is neutral about disposable addresses: `checkEmail` allows
  them unless you pass `allowDisposable: false`.
- DNS saying "deliverable" does not prove a mailbox exists. A typo domain can
  be registered and answer DNS (`yaoo.com` has an A record and therefore an
  implicit MX; `999gmail.com` publishes an MX to a mail catcher), which is why
  the hint exists alongside the check.

## `suggest(email, options?)`

Returns `{ address, domain, original, reason } | null`. The local part is
returned exactly as typed (RFC 5321 section 2.4: it belongs to the receiving
server). `reason` is one of:

| reason | example |
|---|---|
| `typo` | `gmial.com`, `yaoo.com`, `hotmial.fr`, `gmail.con` |
| `lookalike` | `gmail.ro`, `gmail.de`, `gmail.co` (verified to accept no mail) |
| `junk_prefix` | `999gmail.com`, `.gmail.com` |
| `missing_dot` | `gmailcom` |
| `missing_tld` | `gmail`, `proton` (exactly one provider has that name) |
| `separator` | `gmail,com` |

How it decides, in order:

1. A known provider, or a known real domain that only looks like one
   (`NOT_TYPOS`: `wahoo.com`, `grail.com`, `cloud.com`...), is left alone.
2. An internationalised domain is left alone.
3. A listed lookalike maps to its provider.
4. A missing dot, a comma for the dot, or a bare provider name with exactly
   one completion.
5. Up to four digits or dots before a provider whose first label has at
   least five letters (`999gmail.com`; never `12mail.com`).
6. Otherwise the closest provider by optimal string alignment distance, if it
   is the only one at that distance:
   - at most ONE edit, and only toward a provider whose first label has five
     letters or more (`me.com`, `aol.com`, `gmx.de`, `live.com`, `zoho.com`
     are never fuzzy targets). Measured over the Tranco top million: two
     edits rewrote real companies with their own mail (`tesla.com` to
     `telia.com`, `kroger.com` to `rogers.com`, `hotmart.com` to
     `hotmail.com`), and four-letter names caught `jive.com` and `zoro.com`;
   - never for a typed first label under 4 letters;
   - **never across a real TLD**: if the typed last label is in IANA's root
     zone and differs from the provider's, the TLD is what the person meant
     (`company.co`, `startup.io`, `hotmail.ro`);
   - a provider's own name typed right (`gmail.cz`) is only corrected toward
     that provider, never to a neighbour (`email.cz`);
   - a one-letter last label (`hotmail.c`) is never completed.

`options.providers`, `options.lookalikes` and `options.notTypos` replace the
built-in lists.

### Why optimal string alignment, and no keyboard weighting

The distance is the restricted Damerau-Levenshtein distance (optimal string
alignment): insertions, deletions, substitutions and swaps of two adjacent
characters. A swap (`gmial`, `hotmial`) is one edit, not two as in
Levenshtein. mailcheck uses Sift4, a fast approximation that can exceed the
true distance; here the strings are short and the list is a few hundred
entries, so the exact answer costs nothing.

Keyboard-adjacency weighting was considered and left out: it needs the
layout (QWERTY, QWERTZ, AZERTY all occur in Europe), on a phone the common
error is autocorrect rather than a neighbouring key, and every typo in the
test table already has a single closest provider, so weighting could not
change one answer there. A real tie gets no suggestion rather than a
layout-dependent guess.

## `checkMx(domain, options?)`

```ts
type MxCheck =
  | { kind: "deliverable"; via: "mx" | "implicit"; hosts: readonly string[] }
  | { kind: "null_mx" }        // RFC 7505
  | { kind: "no_domain" }      // NXDOMAIN, RCODE 3
  | { kind: "no_mail_host" }   // NOERROR, no MX, no A, no AAAA
  | { kind: "unknown"; reason: "invalid_domain" | "timeout" | "network" | "http_status" | "bad_response" | "servfail" | "dns_error"; status?: number };
```

Options: `fetch` (defaults to the global one), `timeoutMs` (whole check,
default 3000), `endpoint` (any DoH JSON endpoint), `cache` (`null` to
disable), `now`.

Decisions, with their sources:

- MX records present: `deliverable` (`via: "mx"`), hosts by preference.
- No MX (NOERROR, empty): RFC 5321 section 5.1, the domain is its own mail
  host when it has an address, so A or AAAA present is `deliverable`
  (`via: "implicit"`). Both address queries must answer NOERROR and empty for
  `no_mail_host`; one that fails makes the answer `unknown`.
- Exactly one MX, preference 0, exchange `.`: the null MX of RFC 7505,
  `null_mx`. Any other set naming only `.` (`10 .`, two `0 .`) names no host:
  `no_mail_host`. A null MX beside a real MX is a misconfiguration the real
  one still serves: `deliverable`.
- Status 3: NXDOMAIN (RFC 1035 section 4.1.1), `no_domain`.
- Status 2 (SERVFAIL), 5 (REFUSED) or anything else, an HTTP error, a
  timeout, a network error, or a body that is not the documented shape:
  `unknown`. Every field of the JSON is narrowed by hand; nothing is trusted.

Caching is a small in-memory map (1000 entries, oldest evicted). A positive
answer is kept for its DNS TTL, at most 10 minutes. A negative answer is kept
for the negative TTL of RFC 2308 section 5 (the smaller of the SOA record's
TTL and its MINIMUM field), at most 5 minutes. `unknown` is never cached.

### Resolvers and runtimes

| endpoint | notes |
|---|---|
| `https://cloudflare-dns.com/dns-query` (default) | Cloudflare's public 1.1.1.1 resolver, no account needed. Sends `Access-Control-Allow-Origin: *` and answers CORS preflight. |
| `https://dns.google/resolve` | Google Public DNS JSON API: the same fields (names carry a root dot, `Comment` is a string). Pinned in the tests. Sends `Access-Control-Allow-Origin: *` on GET; its preflight answers 400, which does not matter because the request sent here (a GET with only an `accept` header) needs no preflight. |

```ts
await checkMx("example.org", { endpoint: "https://dns.google/resolve" });
```

Both work from browsers, Node 18+ (global `fetch`), Deno, Bun, Workers and
edge runtimes. For an older Node, or a proxy, pass your own `fetch`. In a
browser the DNS question goes from the visitor's machine to the resolver;
run `checkMx` on your server if that matters to you. The JSON API has no RFC
of its own (the shapes are each provider's), which is why the tests pin live
payloads from both.

## `isDisposable(domain)` and `checkEmail(email, options?)`

`isDisposable` matches the EXACT listed name only, by default (case and a
root dot aside): `mooo.com` is listed, `home.mooo.com` is not disposable,
because a name below a listed domain may be somebody's own (dynamic DNS and
free subdomain hosts are on the list, and people run real mail under them).
Two reviewed sets in `src/disposable-policy.ts`, one reason each, change that:

- `WILDCARD_DISPOSABLE`: throwaway services that hand out subdomain
  addresses (`mailinator.com`, `yopmail.com`, the generator.email network,
  `dropmail.me`, ...), so any name below them is disposable too
  (`x.mailinator.com`). Evidence: a random label below each answers an MX
  that is the service's own mail host. Hosting domains with a wildcard MX
  (`rf.gd`, `42web.io`) are deliberately left out.
- `NEVER_DISPOSABLE`: real providers and companies the upstream list names
  (`21cn.com`, `sify.com`, `hola.org`, `99.com`). Never disposable, nor
  anything below them, and left out of the vendored list.

The list is never allowed to cover a provider in `PROVIDER_DOMAINS`.
`pnpm run update-disposable --review` lists every entry ranked in the Tranco
top 100k that publishes its own MX, and `--wildcards` every entry with a
wildcard MX, for a decision by hand.

`checkEmail` returns one of `allow` (with `suggestion`, `mx`, `disposable`),
`disposable` (only with `allowDisposable: false`, decided before any DNS
question), `undeliverable` (a definitive DNS negative, with the suggestion)
or `invalid`. `checkMx: false` makes it offline.

## A drop-in for mailcheck

```ts
// before: import Mailcheck from "mailcheck";
import Mailcheck from "mailcheck-ts/mailcheck";

Mailcheck.run({
  email: input.value,
  suggested: (s) => showHint(s.full), // { address, domain, full }
  empty: () => hideHint(),
});
```

Everything mailcheck exposes is there and typed: `run`, `suggest`,
`findClosestDomain`, `splitEmail`, `encodeEmail`, `sift4Distance`,
`defaultDomains`, `defaultSecondLevelDomains`, `defaultTopLevelDomains` and
the three thresholds. `run` keeps mailcheck's callback contract and its
URI-encoding of the local part (render the suggestion as text, never HTML).
mailcheck's own correctness suite is ported case by case in
`src/mailcheck-compat.test.ts`.

### Migration

1. Replace the import as above. A jQuery plugin is not included; call
   `Mailcheck.run` from your own handler.
2. With no custom lists, `run` uses this package's own engine (below). If
   you pass `domains`, `secondLevelDomains`, `topLevelDomains` or
   `distanceFunction`, `run` follows mailcheck 2.0's algorithm on your lists
   exactly, plus one guard: a domain in `NOT_TYPOS` is never rewritten.
3. For new code, prefer `suggest()`: it says why it suggested (`reason`) and
   returns `null` instead of `false`.

### Differences from mailcheck, and why

mailcheck 2.0 (2026) already fixed its best-known false positives: it no
longer rewrites a recognised TLD (`.co` to `.com`), and it abstains on ties
(older versions did both; see its issues #97, #70, #109, #168). Where the
default behaviour still differs, it is deliberate:

| input | mailcheck 2.0 | mailcheck-ts | why |
|---|---|---|---|
| `gmil.con`, `yahooo.cmo` | corrected (two edits) | none | two edits rewrote real companies in the Tranco sweep |
| `randomsmallcompany.cmo` | `.com` | none | we never guess for a domain we do not know |
| `gmail.co`, `hotmail.co` | none | `gmail.com`, `hotmail.com` | live DNS proves they accept no mail (null MX / no mail host) |
| `grail.com`, `cloud.com` | (Sift4 within 2) may correct | none | real domains with their own mail (`NOT_TYPOS`) |
| distance | Sift4, threshold 2 | exact OSA, one edit | exact, and measured |

## Keeping the lists honest

`PROVIDER_DOMAINS` holds only domains whose mailboxes exist and whose DNS
answers `deliverable`. `LOOKALIKE_DOMAINS` holds only domains DNS proves
cannot receive mail, so rewriting one can never move a working address.

```sh
pnpm run verify-domains                # every curated domain, a table
pnpm run verify-domains foo.com bar.ro # plus these
pnpm run verify-domains --neighbours   # plus the false-positive sweep
pnpm run verify-domains --json         # raw DoH answers, for pinning in tests
pnpm run update-tlds                   # refresh src/tlds.ts from IANA
pnpm run update-disposable             # refresh src/disposable-list.ts
```

`--neighbours` finds every domain `suggest()` would rewrite among the Tranco
top million (https://tranco-list.eu, downloaded at run time and never
committed; `--seed <file>` for a local list) and among the generated one-edit
neighbours of every provider (dropped, doubled, swapped and neighbouring-key
characters). Each one with its own MX is sorted: `typo catcher` (MX in
`TYPO_CATCHER_MX`), `provider-owned` (the provider's own MX, a defensive
registration), `FLAG` (a real top site with mail of its own: fails the run
until reviewed into `NOT_TYPOS` or `REVIEWED_TYPO_DOMAINS`), or `review` (a
generated typo on a general mail host: counted, listed with `--review`).

`verify-domains` asks DNS only. It never opens an SMTP connection and never
sends an email. It exits 1 when a provider is not deliverable, a lookalike
is, or the sweep flags a real site; an `unknown` answer is reported as
`RETRY` and never fails the run. It is deliberately not part of any CI run:
live DNS changes, tests must not. The generated lists are refreshed by hand,
reviewed as a diff, and never fetched at runtime.

## Tests

`pnpm test` runs the leak scan, then every test. No test reaches the
network: `checkMx` is tested through an injected `fetch` answering with live
payloads captured on 2026-10-21 from both resolvers, and a runtime test
proves the package runs under plain Node with no Workers globals and imports
nothing runtime-specific.

## Releasing

A published version is permanent, so the pack is checked, not trusted.

- `files` in package.json is an ALLOWLIST (`dist/**/*.js`, `dist/**/*.d.ts`,
  README, LICENSE, NOTICE), never an ignore file.
- `pnpm run build` deletes `dist/` and compiles with `tsconfig.build.json`:
  no source maps, no declaration maps, no inlined sources.
- `pnpm run pack-check` packs for real, opens the tarball and fails unless
  the file list equals the exact allowlist, no file is a source map, a
  TypeScript source, a test, a script, a fixture, a dotfile, an env file, a
  key or an archive, no file contains source map material, a private name or
  host, an object-storage URL, an absolute local path or anything shaped like
  a secret, and the size is under the caps. `prepublishOnly` runs the build
  and `pack-check`, so a publish cannot skip them.
- Publish only from this repository's release workflow
  (`.github/workflows/release.yml`, run by publishing a GitHub release or
  pushing a `v*` tag), with npm trusted publishing (OIDC, no token stored
  anywhere) and provenance (`publishConfig.provenance`), 2FA on the npm
  account, never from a developer machine with local build artifacts. Paste
  the `pack-check` output into the release PR and review it.

## Acknowledgements

This package stands on other people's work. Thank you.

| project | license | what we did with it |
|---|---|---|
| [mailcheck](https://github.com/mailcheck/mailcheck) by Derrick Ko, Received Inc and its maintainers | MIT | **Adapted**: the API shape (`run`, `suggest`, `splitEmail`, `encodeEmail`, `findClosestDomain`, `{ address, domain, full }`), its 2.0 algorithm for custom lists (ported, typed), its Sift4 implementation, its default domain lists (merged into ours and re-verified live), and its correctness suite (ported). |
| [@zootools/email-spell-checker](https://github.com/ZooTools/email-spell-checker) by ZooTools, Inc. | MIT | **Studied**: its TypeScript port of mailcheck and Sift3 distance; used to cross-check the provider list. No code taken. |
| [email-misspelled](https://github.com/julien-amblard/email-misspelled) by Julien Amblard | MIT | **Adapted**: its per-country Yahoo, Hotmail, Outlook and Live lists, as seeds, each re-verified live (several removed for having no mail server). |
| [disposable-email-domains](https://github.com/disposable-email-domains/disposable-email-domains) and its contributors | CC0 1.0 | **Vendored**: `disposable_email_blocklist.conf`, normalised, as `src/disposable-list.ts`. |
| [IANA root zone list](https://data.iana.org/TLD/tlds-alpha-by-domain.txt) | public data | **Vendored**: `src/tlds.ts`. |
| [Tranco list](https://tranco-list.eu) (Le Pochat et al., NDSS 2019) | see its site | **Used only** by the maintainer's false-positive sweep, downloaded at run time; never committed or shipped. |
| [Cloudflare 1.1.1.1 DNS over HTTPS](https://developers.cloudflare.com/1.1.1.1/encryption/dns-over-https/make-api-requests/dns-json/) and [Google Public DNS JSON API](https://developers.google.com/speed/public-dns/docs/doh/json) | service | **Used**: the JSON shapes `checkMx` reads, pinned from live answers. |
| Sift4, Siderite Zackwehdex ([2014](https://siderite.blogspot.com/2014/11/super-fast-and-accurate-string-distance.html)) | (as shipped in mailcheck, MIT) | **Adapted** through mailcheck, for the compatibility layer. |
| Damerau, F. J. (1964), "A technique for computer detection and correction of spelling errors", CACM 7(3) | reference | **Studied**: the edit operations behind optimal string alignment. |
| RFC 5321 (SMTP, 5.1 implicit MX, 2.4 local part), RFC 7505 (null MX), RFC 1035 (DNS, RCODEs), RFC 2308 (negative caching) | IETF | **Implemented**: the decisions in `checkMx` and `suggest`. |
| RFC 2606 and RFC 6761 (reserved names) | IETF | **Used**: test fixtures name only reserved domains (`example.net`) where a domain is invented. This package does not refuse reserved names itself; do that before calling it if you need to. |

Exact notices are in `NOTICE`.

## License

MIT, Copyright (c) 2026 the copyright holder named in `LICENSE`.
