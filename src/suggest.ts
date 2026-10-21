/**
 * "Did you mean jane@gmail.com?" for a mistyped mailbox provider, decided
 * offline, identically in a browser, a Worker and Node.
 *
 * A suggestion is a HINT, never a verdict: it is offered only when one known
 * provider domain is clearly what was meant, and `null` is the answer whenever
 * that is not certain. The rules, in order:
 *
 *   1. A domain that is itself a known provider, or a known real domain that
 *      merely looks like one (`NOT_TYPOS`), is left alone.
 *   2. An internationalised domain (non-ASCII, or a `xn--` label) is left
 *      alone: the lists hold none, and a near miss in another script is not
 *      a typo of an ASCII name.
 *   3. A listed lookalike (`gmail.ro`, verified to accept no mail) maps to its
 *      provider.
 *   4. A missing dot (`gmailcom`) or a comma for the dot (`gmail,com`) that
 *      yields a provider exactly is restored, and a bare provider name with
 *      no ending (`gmail`, `proton`) is completed when exactly one provider
 *      carries that name (mailcheck 2.0's completion; `yahoo` has many, so
 *      it gets none).
 *   5. Junk before a provider (`999gmail.com`, `.gmail.com`): up to four
 *      digits or dots in front of a provider whose first label has at
 *      least five letters.
 *   6. Otherwise the closest provider by optimal string alignment distance,
 *      when it is the ONLY one at that distance, within ONE edit, only toward
 *      a provider whose first label has at least five letters, never for a
 *      typed label under four letters, and never across a real TLD: when the typed last
 *      label is a TLD in IANA's root zone and the provider's is different,
 *      the TLD is what the person meant (`company.co`, `hotmail.ro`). A
 *      provider's own name typed correctly (`gmail.cz`) is only ever
 *      corrected to that same provider, never to a neighbour one letter away
 *      (`email.cz`), and a one-letter last label (`hotmail.c`) is never
 *      completed: it does not say which TLD was meant.
 *
 * What it deliberately does not do: weight edits by keyboard distance (it
 * cannot know the layout, QWERTY, QWERTZ or AZERTY, and on a phone the
 * error is autocorrect, not a neighbouring key; with a few hundred
 * candidates, two at the same edit distance are rare and are answered with
 * no suggestion instead of a guess), or suggest anything for a domain that
 * is not near a known provider.
 */
import { osaDistance } from "./distance.js";
import { LOOKALIKE_DOMAINS, NOT_TYPOS, PROVIDER_DOMAINS } from "./providers.js";
import { isRealTld } from "./tlds.js";

export type SuggestionReason = "typo" | "lookalike" | "missing_dot" | "missing_tld" | "separator" | "junk_prefix";

export interface Suggestion {
  /** The corrected address: the local part exactly as typed, the domain replaced. */
  address: string;
  /** The corrected domain. */
  domain: string;
  /** The domain as typed (lower-cased, trailing dot removed). */
  original: string;
  reason: SuggestionReason;
}

export interface SuggestOptions {
  /** Replaces the provider list (domains to correct toward). */
  providers?: readonly string[];
  /** Replaces the lookalike map (domain -> provider). */
  lookalikes?: Readonly<Record<string, string>>;
  /** Replaces the list of real domains that are never corrected. */
  notTypos?: readonly string[];
}

const MAX_JUNK_PREFIX = 4;
const MIN_TYPED_LABEL = 4;

interface Catalog {
  providers: readonly string[];
  known: ReadonlySet<string>;
  lookalikes: Readonly<Record<string, string>>;
  compact: ReadonlyMap<string, string>;
  brands: ReadonlySet<string>;
}

function buildCatalog(providers: readonly string[], lookalikes: Readonly<Record<string, string>>, notTypos: readonly string[]): Catalog {
  const compact = new Map<string, string>();
  for (const domain of providers) compact.set(domain.replaceAll(".", ""), domain);
  const brands = new Set(providers.map(firstLabel));
  return { providers, known: new Set([...providers, ...notTypos]), lookalikes, compact, brands };
}

const DEFAULT_CATALOG = buildCatalog(PROVIDER_DOMAINS, LOOKALIKE_DOMAINS, NOT_TYPOS);

function catalogFor(options: SuggestOptions | undefined): Catalog {
  if (!options || (!options.providers && !options.lookalikes && !options.notTypos)) return DEFAULT_CATALOG;
  return buildCatalog(options.providers ?? PROVIDER_DOMAINS, options.lookalikes ?? LOOKALIKE_DOMAINS, options.notTypos ?? NOT_TYPOS);
}

function firstLabel(domain: string): string {
  const dot = domain.indexOf(".");
  return dot === -1 ? domain : domain.slice(0, dot);
}

function lastLabel(domain: string): string {
  return domain.slice(domain.lastIndexOf(".") + 1);
}

/** Edits allowed toward a provider, from the length of its first label. */
/**
 * One edit, toward a provider name of five letters or more; nothing shorter.
 * Measured, not guessed: over the Tranco top million (2026-10-21) two edits
 * rewrote real companies with their own mail (tesla.com to telia.com,
 * kroger.com to rogers.com, hotmart.com to hotmail.com, kahoot.com to
 * yahoo.com), and four-letter names (live, zoho) caught jive.com and zoro.com.
 * Nearly every real typo is one edit (Damerau 1964), and a missed hint costs
 * nothing while a wrong one nags a real person.
 */
function allowedEdits(provider: string): number {
  return firstLabel(provider).length >= 5 ? 1 : 0;
}

/** The one closest provider, or null when none is close enough or two tie. */
function closestProvider(domain: string, catalog: Catalog): string | null {
  const typedLabel = firstLabel(domain);
  if (typedLabel.length < MIN_TYPED_LABEL) return null;
  const typedTld = lastLabel(domain);
  // One letter says nothing about which TLD was meant (`.c`: com, ca, cz?).
  if (typedTld.length < 2) return null;
  const typedTldIsReal = isRealTld(typedTld);
  // A provider's own name typed right (`gmail.cz`) is that provider with a
  // wrong ending, never a different provider one letter away (`email.cz`).
  const typedIsBrand = catalog.brands.has(typedLabel);
  let best: string | null = null;
  let bestDistance = Number.POSITIVE_INFINITY;
  let tied = false;
  for (const provider of catalog.providers) {
    const max = allowedEdits(provider);
    if (max === 0) continue;
    // Never move a real TLD: `.co`, `.ro` and `.io` are somebody's choice.
    if (typedTldIsReal && lastLabel(provider) !== typedTld) continue;
    if (typedIsBrand && firstLabel(provider) !== typedLabel) continue;
    const distance = osaDistance(domain, provider, max);
    if (distance > max) continue;
    if (distance < bestDistance) {
      best = provider;
      bestDistance = distance;
      tied = false;
    } else if (distance === bestDistance) {
      tied = true;
    }
  }
  return tied ? null : best;
}

function junkPrefixProvider(domain: string, catalog: Catalog): string | null {
  // Digits and dots only: a leading hyphen is not a host name, and mailcheck abstains on it too.
  const match = /^[0-9.]+/.exec(domain);
  if (!match || match[0].length > MAX_JUNK_PREFIX) return null;
  const rest = domain.slice(match[0].length);
  if (!catalog.providers.includes(rest)) return null;
  return firstLabel(rest).length >= 5 ? rest : null;
}

/** The corrected domain and why, or null. `domain` is lower case with no trailing dot. */
export function suggestDomain(domain: string, options?: SuggestOptions): { domain: string; reason: SuggestionReason } | null {
  const catalog = catalogFor(options);
  if (domain.length === 0 || domain.length > 253) return null;
  if (catalog.known.has(domain)) return null;
  // Rule 2: printable ASCII only, and no punycode label.
  if (!/^[\x21-\x7e]+$/.test(domain) || domain.split(".").some((label) => label.startsWith("xn--"))) return null;

  const lookalike = Object.hasOwn(catalog.lookalikes, domain) ? catalog.lookalikes[domain] : undefined;
  if (lookalike) return { domain: lookalike, reason: "lookalike" };

  if (domain.includes(",")) {
    const fixed = domain.replaceAll(",", ".");
    if (catalog.providers.includes(fixed)) return { domain: fixed, reason: "separator" };
    return null;
  }

  if (!domain.includes(".")) {
    const restored = catalog.compact.get(domain);
    if (restored) return { domain: restored, reason: "missing_dot" };
    const completions = catalog.providers.filter((provider) => provider.startsWith(`${domain}.`));
    return completions.length === 1 && completions[0] ? { domain: completions[0], reason: "missing_tld" } : null;
  }

  const unprefixed = junkPrefixProvider(domain, catalog);
  if (unprefixed) return { domain: unprefixed, reason: "junk_prefix" };

  // Labels that are not host names (an empty label from `gmail..com`) are not ours to guess.
  if (domain.split(".").some((label) => !/^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/.test(label))) return null;

  const closest = closestProvider(domain, catalog);
  return closest ? { domain: closest, reason: "typo" } : null;
}

/**
 * A correction for a mistyped provider domain, or null. Pure and offline.
 * The local part is never changed: it belongs to the receiving server
 * (RFC 5321 section 2.4), and `Jane.Doe` is not a typo of `janedoe`.
 */
export function suggest(email: string, options?: SuggestOptions): Suggestion | null {
  const value = email.trim();
  const at = value.lastIndexOf("@");
  if (at <= 0 || at === value.length - 1) return null;
  const local = value.slice(0, at);
  // One root dot is the same name (`gmail.com.`); two are a malformed one.
  const original = value.slice(at + 1).toLowerCase().replace(/\.$/, "");
  const fixed = suggestDomain(original, options);
  if (!fixed || fixed.domain === original) return null;
  return { address: `${local}@${fixed.domain}`, domain: fixed.domain, original, reason: fixed.reason };
}
