# mailcheck-ts

[![npm version](https://img.shields.io/npm/v/mailcheck-ts)](https://www.npmjs.com/package/mailcheck-ts)
[![CI](https://github.com/MatrisAi/mailcheck-ts/actions/workflows/ci.yml/badge.svg)](https://github.com/MatrisAi/mailcheck-ts/actions/workflows/ci.yml)
[![license: MIT](https://img.shields.io/npm/l/mailcheck-ts)](https://opensource.org/license/mit)
[![minzipped size](https://img.shields.io/bundlephobia/minzip/mailcheck-ts)](https://bundlephobia.com/package/mailcheck-ts)

> Catch mistyped, disposable and undeliverable email addresses **without ever
> refusing a real one**.

```ts
import { suggest } from "mailcheck-ts";

suggest("ana@gmial.com")?.address; // "ana@gmail.com"
```

## Features

- **Typo hints**: "Did you mean ana@gmail.com?", offline, and only when
  exactly one known provider is clearly what was meant.
- **MX check**: can this domain receive mail at all? One to three
  DNS-over-HTTPS queries, and a refusal only on a definitive DNS answer.
- **Disposable detection**: a vendored, reviewed list of throwaway inbox
  services, offline. Whether to accept them is your choice.
- **One verdict**: `checkEmail` combines all three.
- **Drop-in for [mailcheck](https://github.com/mailcheck/mailcheck)**:
  the same API, typed, with mailcheck's own test suite ported.
- **Runs everywhere**: browsers, Node 18+, Deno, Bun, Cloudflare Workers and
  other edge runtimes. Zero dependencies, ESM, strict TypeScript, published
  with [npm provenance](https://docs.npmjs.com/generating-provenance-statements).

## Contents

- [Install](#install)
- [Usage](#usage)
- [API](#api)
- [How it decides](#how-it-decides)
- [Migrating from mailcheck](#migrating-from-mailcheck)
- [Runtime support](#runtime-support)
- [FAQ](#faq)
- [Contributing](#contributing)
- [Acknowledgements](#acknowledgements)
- [License](#license)

## Install

```sh
npm install mailcheck-ts
```

```sh
pnpm add mailcheck-ts
yarn add mailcheck-ts
bun add mailcheck-ts
deno add npm:mailcheck-ts
```

### CDN

Every version is served by jsDelivr, unpkg and esm.sh. In production,
**pin the exact version you tested** (`mailcheck-ts@0.1.1`, not `@0.1`):
a range follows new releases into your page without review.

As a module:

```html
<script type="module">
  import { suggest } from "https://cdn.jsdelivr.net/npm/mailcheck-ts@0.1.1/dist/suggest.js";
  // or: "https://unpkg.com/mailcheck-ts@0.1.1/dist/suggest.js"
  // or: "https://esm.sh/mailcheck-ts@0.1.1/suggest"
  console.log(suggest("ana@gmial.com")?.address); // "ana@gmail.com"
</script>
```

As a classic script, for pages that load mailcheck with `<script src>`. One
minified file (about 21 KB, 9 KB gzipped) that defines a single global,
`window.MailcheckTs`, with `suggest`, `suggestDomain`, `checkMx`,
`isDefinitivelyUndeliverable`, `run` and the mailcheck-compatible
`Mailcheck` object. It leaves out the disposable list (about 150 KB); import
`mailcheck-ts/disposable` as a module when you need it.

```html
<script
  src="https://cdn.jsdelivr.net/npm/mailcheck-ts@0.1.1/dist/mailcheck.global.js"
  integrity="sha384-L8nI3X041f+iah4SnTpvrgsgQm80+yW0lhPDq1YzEiBGM/3pxb2MGZrYunTDk2m/"
  crossorigin="anonymous"></script>
```

The `integrity` hash is for 0.1.1 and is the same from jsDelivr and unpkg
(the published file). For another version, compute it once:

```sh
curl -s https://cdn.jsdelivr.net/npm/mailcheck-ts@VERSION/dist/mailcheck.global.js \
  | openssl dgst -sha384 -binary | openssl base64 -A
```

Use SRI with an exact version only. It fits the classic script best: a
module's `integrity` covers that one file, not what it imports, and esm.sh
generates its responses, so they are not guaranteed to stay byte-identical.

## Usage

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

The same with the classic script, using mailcheck's callback API:

```html
<script>
  var input = document.getElementById("email");
  var hint = document.getElementById("email-hint");
  input.addEventListener("blur", function () {
    MailcheckTs.run({
      email: input.value,
      suggested: function (s) { hint.textContent = "Did you mean " + s.full + "?"; },
      empty: function () { hint.textContent = ""; },
    });
  });
</script>
```

More examples:

```ts
import { suggest, checkMx } from "mailcheck-ts";
import { isDisposable } from "mailcheck-ts/disposable";
import { checkEmail } from "mailcheck-ts/check";

suggest("ana@company.co"); // null: .co is a real TLD, never rewritten
suggest("ana@acme.com");   // null: not near a known provider

await checkMx("gmail.ro");        // { kind: "no_mail_host" }
isDisposable("x.mailinator.com"); // true

await checkEmail("ana@gmail.ro");
// { verdict: "undeliverable", domain: "gmail.ro", suggestion: { address: "ana@gmail.com", ... }, mx: { kind: "no_mail_host" } }
```

## API

| Entry point | Main exports | Network | When unsure |
|---|---|---|---|
| `mailcheck-ts` | `suggest`, `suggestDomain`, `checkMx`, `isDefinitivelyUndeliverable` | DoH (`checkMx` only) | `null` / `unknown` |
| `mailcheck-ts/suggest` | `suggest`, `suggestDomain` | none | `null` |
| `mailcheck-ts/mx` | `checkMx`, `isDefinitivelyUndeliverable` | DoH | `unknown`, which you must allow |
| `mailcheck-ts/disposable` | `isDisposable` | none | `false` |
| `mailcheck-ts/check` | `checkEmail` | DoH, unless `checkMx: false` | `allow` |
| `mailcheck-ts/providers` | `PROVIDER_DOMAINS`, `LOOKALIKE_DOMAINS`, `NOT_TYPOS` | none | |
| `mailcheck-ts/mailcheck` | `Mailcheck` (default) | none | as mailcheck |

The disposable list (about 145 KB of text) lives only in
`mailcheck-ts/disposable` and `mailcheck-ts/check`, so code that only
suggests typos never ships it.

### `suggest(email, options?)`

Returns `{ address, domain, original, reason } | null`. The local part is
returned exactly as typed (RFC 5321 section 2.4: it belongs to the receiving
server).

| `reason` | example |
|---|---|
| `typo` | `gmial.com`, `yaoo.com`, `hotmial.fr`, `gmail.con` |
| `lookalike` | `gmail.ro`, `gmail.de`, `gmail.co` (verified to accept no mail) |
| `junk_prefix` | `999gmail.com`, `.gmail.com` |
| `missing_dot` | `gmailcom` |
| `missing_tld` | `gmail`, `proton` (exactly one provider has that name) |
| `separator` | `gmail,com` |

Options: `providers`, `lookalikes` and `notTypos` replace the built-in lists.

### `checkMx(domain, options?)`

```ts
type MxCheck =
  | { kind: "deliverable"; via: "mx" | "implicit"; hosts: readonly string[] }
  | { kind: "null_mx" }        // RFC 7505
  | { kind: "no_domain" }      // NXDOMAIN, RCODE 3
  | { kind: "no_mail_host" }   // NOERROR, no MX, no A, no AAAA
  | { kind: "unknown"; reason: "invalid_domain" | "timeout" | "network" | "http_status" | "bad_response" | "servfail" | "dns_error"; status?: number };
```

Options:

| option | default | |
|---|---|---|
| `fetch` | `globalThis.fetch` | for an older Node, a proxy or tests |
| `timeoutMs` | `3000` | for the whole check |
| `endpoint` | `https://cloudflare-dns.com/dns-query` | any DoH JSON endpoint |
| `cache` | in-memory, 1000 entries | `null` to disable |
| `now` | `Date.now` | |

### `isDefinitivelyUndeliverable(result)`

`true` only for `null_mx`, `no_domain` and `no_mail_host`. The one function
to decide a refusal with.

### `isDisposable(domain)`

`true` when the domain is a listed throwaway inbox service. Matches the exact
name only, plus subdomains of services known to hand them out (see
[Disposable domains](#disposable-domains)).

### `checkEmail(email, options?)`

Returns one of:

- `allow`, with `suggestion`, `mx` and `disposable`;
- `disposable`, only with `allowDisposable: false`, decided before any DNS
  question;
- `undeliverable`, a definitive DNS negative, with the suggestion;
- `invalid`, not an email address.

Options: `allowDisposable` (default `true`), `checkMx` (`false` makes it
offline), and every `checkMx` option.

### `Mailcheck`

mailcheck's API, typed: `run`, `suggest`, `findClosestDomain`,
`splitEmail`, `encodeEmail`, `sift4Distance`, `defaultDomains`,
`defaultSecondLevelDomains`, `defaultTopLevelDomains` and the three
thresholds. See [Migrating from mailcheck](#migrating-from-mailcheck).

## How it decides

**A typo hint costs nothing; a wrong refusal loses a person.** So:

- `suggest()` never blocks anything, and answers only when exactly one known
  provider is clearly what was meant.
- `checkMx()` refuses only on proof: `null_mx`, `no_domain`, `no_mail_host`.
  Everything else, including every kind of `unknown` (timeout, SERVFAIL,
  HTTP error, unexpected body), must be allowed.
- The library is neutral about disposable addresses: `checkEmail` allows
  them unless you pass `allowDisposable: false`.
- DNS saying "deliverable" does not prove a mailbox exists. A typo domain can
  be registered and answer DNS (`yaoo.com` has an A record and therefore an
  implicit MX; `999gmail.com` publishes an MX to a mail catcher), which is why
  the hint exists alongside the check.

### Typo suggestions

In order:

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

The distance is optimal string alignment (restricted Damerau-Levenshtein):
insertions, deletions, substitutions and swaps of two adjacent characters,
so `gmial` is one edit, not two. mailcheck uses Sift4, a fast approximation
that can exceed the true distance; here the strings are short and the list
is a few hundred entries, so the exact answer costs nothing. Keyboard
weighting was left out: it needs the layout (QWERTY, QWERTZ, AZERTY all
occur in Europe), on a phone the common error is autocorrect, and it changes
no answer in the test table. A real tie gets no suggestion rather than a
guess.

### MX check

- MX records present: `deliverable` (`via: "mx"`), hosts by preference.
- No MX (NOERROR, empty): by RFC 5321 section 5.1 the domain is its own mail
  host when it has an address, so A or AAAA present is `deliverable`
  (`via: "implicit"`). Both address queries must answer NOERROR and empty for
  `no_mail_host`; one that fails makes the answer `unknown`.
- Exactly one MX, preference 0, exchange `.`: the null MX of RFC 7505,
  `null_mx`. Any other set naming only `.` names no host: `no_mail_host`. A
  null MX beside a real MX is a misconfiguration the real one still serves:
  `deliverable`.
- Status 3: NXDOMAIN (RFC 1035 section 4.1.1), `no_domain`.
- Status 2 (SERVFAIL), 5 (REFUSED) or anything else, an HTTP error, a
  timeout, a network error, or a body that is not the documented shape:
  `unknown`. Every field of the JSON is narrowed by hand.

A positive answer is cached for its DNS TTL, at most 10 minutes. A negative
answer is cached for the negative TTL of RFC 2308 section 5, at most 5
minutes. `unknown` is never cached.

### Disposable domains

`isDisposable` matches the EXACT listed name only (case and a root dot
aside): `mooo.com` is listed, `home.mooo.com` is not disposable, because a
name below a listed domain may be somebody's own (dynamic DNS and free
subdomain hosts are on the list, and people run real mail under them). Two
reviewed sets in `src/disposable-policy.ts` change that:

- `WILDCARD_DISPOSABLE`: throwaway services that hand out subdomain
  addresses (`mailinator.com`, `yopmail.com`, `dropmail.me`, ...), so any
  name below them is disposable too. Evidence: a random label below each
  answers an MX that is the service's own mail host.
- `NEVER_DISPOSABLE`: real providers and companies the upstream list names
  (`21cn.com`, `sify.com`, `hola.org`, `99.com`). Never disposable, nor
  anything below them.

The list never covers a domain in `PROVIDER_DOMAINS`.

## Migrating from mailcheck

```ts
// before: import Mailcheck from "mailcheck";
import Mailcheck from "mailcheck-ts/mailcheck";

Mailcheck.run({
  email: input.value,
  suggested: (s) => showHint(s.full), // { address, domain, full }
  empty: () => hideHint(),
});
```

1. Replace the import. With a classic script, load `mailcheck.global.js`
   and use `MailcheckTs.run`, or `var Mailcheck = MailcheckTs.Mailcheck;`
   for existing code. The jQuery plugin (`$(el).mailcheck(...)`) is not
   included; call `run` from your own handler.
2. With no custom lists, `run` uses this package's engine. If you pass
   `domains`, `secondLevelDomains`, `topLevelDomains` or `distanceFunction`,
   `run` follows mailcheck 2.0's algorithm on your lists exactly, plus one
   guard: a domain in `NOT_TYPOS` is never rewritten.
3. `run` keeps mailcheck's callback contract and its URI-encoding of the
   local part (render the suggestion as text, never HTML).
4. For new code, prefer `suggest()`: it says why it suggested (`reason`) and
   returns `null` instead of `false`.

Where the default behaviour differs from mailcheck 2.0, it is deliberate:

| input | mailcheck 2.0 | mailcheck-ts | why |
|---|---|---|---|
| `gmil.con`, `yahooo.cmo` | corrected (two edits) | none | two edits rewrote real companies in the Tranco sweep |
| `randomsmallcompany.cmo` | `.com` | none | no guess for a domain we do not know |
| `gmail.co`, `hotmail.co` | none | `gmail.com`, `hotmail.com` | live DNS proves they accept no mail |
| `grail.com`, `cloud.com` | may correct | none | real domains with their own mail (`NOT_TYPOS`) |
| distance | Sift4, threshold 2 | exact OSA, one edit | exact, and measured |

## Runtime support

It uses only `fetch`, `Response`, `URL`, `URLSearchParams` and
`AbortSignal.timeout`, so it runs in browsers, Node 18+, Deno, Bun, Workers
and edge runtimes. For an older Node, or a proxy, pass your own `fetch`.

`checkMx` works with either public resolver:

| endpoint | notes |
|---|---|
| `https://cloudflare-dns.com/dns-query` (default) | Cloudflare 1.1.1.1, no account needed, CORS enabled. |
| `https://dns.google/resolve` | Google Public DNS JSON API. CORS enabled for the simple GET this package sends. |

```ts
await checkMx("example.org", { endpoint: "https://dns.google/resolve" });
```

## FAQ

**Does it check that the mailbox exists?**
No. It never opens an SMTP connection and never sends an email. Probing a
mailbox over SMTP is unreliable (catch-all servers, greylisting) and can get
your IP listed. The only way to know an address works is to send it a
confirmation email; this package makes sure that email goes to the right
address.

**What leaves the browser or server?**
`checkMx` sends the domain (never the local part) to the DoH resolver you
choose. `suggest` and `isDisposable` are fully offline. In a browser the
question goes from the visitor's machine to the resolver; run `checkMx` on
your server if that matters to you.

**Why not refuse disposable addresses by default?**
Whether a throwaway inbox is acceptable depends on the product. A newsletter
may welcome it; an account sign-up may not. Pass `allowDisposable: false`
where you need it.

**Why does a timeout allow the address?**
Because a slow resolver is not evidence. Refusing on `unknown` would turn
every network blip into lost sign-ups.

## Contributing

Issues and pull requests are welcome. [CONTRIBUTING.md](CONTRIBUTING.md)
covers setup, tests, refreshing the domain lists and releases. Security
issues: see [SECURITY.md](SECURITY.md).

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

Exact notices are in [NOTICE](NOTICE).

## License

[MIT](LICENSE)
