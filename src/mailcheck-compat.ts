/**
 * A drop-in replacement for mailcheck's API (https://github.com/mailcheck/mailcheck,
 * MIT, Copyright 2012 Received Inc; author Derrick Ko and contributors), typed.
 *
 *   import Mailcheck from "mailcheck-ts/mailcheck";
 *   Mailcheck.run({ email, suggested: (s) => ..., empty: () => ... });
 *
 * `run()` keeps mailcheck's contract: it returns what `suggested(result)` or
 * `empty()` returns, and with no callbacks the result itself or `undefined`.
 * A result is `{ address, domain, full }`, the address URI-encoded by
 * `encodeEmail` exactly as mailcheck does (render it as text, never HTML).
 *
 * Two behaviours, chosen by what the caller passes:
 *   - With NO custom lists and no distance function (the common case), `run`
 *     answers with this package's own `suggest()`: verified provider lists,
 *     one edit at most, never across a real TLD, ties and `NOT_TYPOS` give no
 *     suggestion. This is where we deliberately differ from mailcheck's
 *     defaults (see README, "Differences from mailcheck").
 *   - With `domains`, `secondLevelDomains`, `topLevelDomains` or
 *     `distanceFunction`, `run` follows mailcheck 2.0's algorithm (ported
 *     below from src/mailcheck.js at master, 2026-09) on the caller's lists,
 *     so existing integrations keep their tuning. Two of our guards still
 *     apply: a domain in `NOT_TYPOS` is never rewritten, and the IANA root
 *     zone list is ours (mailcheck ships its own snapshot of the same list).
 */
import { NOT_TYPOS } from "./providers.js";
import { suggest } from "./suggest.js";
import { isRealTld } from "./tlds.js";

export interface MailcheckResult {
  /** The local part (URI-encoded by `run`, raw from `suggest`). */
  address: string;
  /** The suggested domain. */
  domain: string;
  /** `address@domain`. */
  full: string;
}

export type DistanceFunction = (a: string, b: string) => number;

export interface MailcheckOptions<S = MailcheckResult, E = undefined> {
  /** A string; anything else gets no suggestion, as in mailcheck. */
  email: string | null | undefined;
  suggested?: (result: MailcheckResult) => S;
  empty?: () => E;
  domains?: readonly string[];
  secondLevelDomains?: readonly string[];
  topLevelDomains?: readonly string[];
  distanceFunction?: DistanceFunction;
}

/** mailcheck's own default lists (src/mailcheck.js, master), for callers that pass them explicitly. */
export const defaultDomains: readonly string[] = [
  "msn.com", "bellsouth.net", "telus.net", "comcast.net", "optusnet.com.au", "earthlink.net", "qq.com", "sky.com",
  "icloud.com", "mac.com", "sympatico.ca", "googlemail.com", "att.net", "xtra.co.nz", "web.de", "cox.net",
  "gmail.com", "ymail.com", "aim.com", "rogers.com", "verizon.net", "rocketmail.com", "google.com", "optonline.net",
  "sbcglobal.net", "aol.com", "me.com", "btinternet.com", "charter.net", "shaw.ca", "proton.me", "protonmail.com",
  "pm.me", "hey.com", "fastmail.com", "tuta.com", "tutanota.com", "tutamail.com",
];
export const defaultSecondLevelDomains: readonly string[] = ["yahoo", "hotmail", "mail", "live", "outlook", "gmx"];
export const defaultTopLevelDomains: readonly string[] = [
  "com", "com.au", "com.tw", "ca", "co.nz", "co.uk", "de", "fr", "it", "ru", "net", "org", "edu", "gov", "jp", "nl",
  "kr", "se", "eu", "ie", "co.il", "us", "at", "be", "dk", "hk", "es", "gr", "ch", "no", "cz", "in", "net.au", "info",
  "biz", "mil", "co.jp", "sg", "hu", "uk",
];
export const domainThreshold = 2;
export const secondLevelThreshold = 2;
export const topLevelThreshold = 2;

/**
 * Sift4 (Siderite Zackwehdex, 2014,
 * https://siderite.blogspot.com/2014/11/super-fast-and-accurate-string-distance.html),
 * the "common" variant as mailcheck ships it: a fast approximation of edit
 * distance that can exceed the exact value. Kept for compatibility; this
 * package's own `suggest()` uses the exact `osaDistance`.
 */
export function sift4Distance(s1: string, s2: string, maxOffset = 5): number {
  if (!s1 || !s1.length) return s2 ? s2.length : 0;
  if (!s2 || !s2.length) return s1.length;
  const l1 = s1.length;
  const l2 = s2.length;
  let c1 = 0;
  let c2 = 0;
  let lcss = 0;
  let localCs = 0;
  let trans = 0;
  const offsets: Array<{ c1: number; c2: number; trans: boolean }> = [];
  while (c1 < l1 && c2 < l2) {
    if (s1.charAt(c1) === s2.charAt(c2)) {
      localCs += 1;
      let isTrans = false;
      let i = 0;
      while (i < offsets.length) {
        const ofs = offsets[i];
        if (!ofs) break;
        if (c1 <= ofs.c1 || c2 <= ofs.c2) {
          isTrans = Math.abs(c2 - c1) >= Math.abs(ofs.c2 - ofs.c1);
          if (isTrans) {
            trans += 1;
          } else if (!ofs.trans) {
            ofs.trans = true;
            trans += 1;
          }
          break;
        } else if (c1 > ofs.c2 && c2 > ofs.c1) {
          offsets.splice(i, 1);
        } else {
          i += 1;
        }
      }
      offsets.push({ c1, c2, trans: isTrans });
    } else {
      lcss += localCs;
      localCs = 0;
      if (c1 !== c2) c1 = c2 = Math.min(c1, c2);
      for (let j = 0; j < maxOffset && (c1 + j < l1 || c2 + j < l2); j += 1) {
        if (c1 + j < l1 && s1.charAt(c1 + j) === s2.charAt(c2)) {
          c1 += j - 1;
          c2 -= 1;
          break;
        }
        if (c2 + j < l2 && s1.charAt(c1) === s2.charAt(c2 + j)) {
          c1 -= 1;
          c2 += j - 1;
          break;
        }
      }
    }
    c1 += 1;
    c2 += 1;
    if (c1 >= l1 || c2 >= l2) {
      lcss += localCs;
      localCs = 0;
      c1 = c2 = Math.min(c1, c2);
    }
  }
  lcss += localCs;
  return Math.round(Math.max(l1, l2) - lcss + trans);
}

export interface EmailParts {
  topLevelDomain: string;
  secondLevelDomain: string;
  domain: string;
  address: string;
}

/**
 * mailcheck's split: the first label is the "second-level domain", every
 * label after it the "top-level domain" (`yahoo` + `co.uk`). It does not
 * know public suffixes, which is why compound endings are only handled when
 * the caller lists them.
 */
export function splitEmail(email: unknown): EmailParts | false {
  if (typeof email !== "string") return false;
  const parts = email.trim().split("@");
  if (parts.length < 2 || parts.some((part) => part === "")) return false;
  const domain = parts.pop() ?? "";
  const labels = domain.split(".");
  let sld = "";
  let tld: string;
  if (labels.length === 1) {
    tld = labels[0] ?? "";
  } else {
    sld = labels[0] ?? "";
    tld = labels.slice(1).join(".");
  }
  return { topLevelDomain: tld, secondLevelDomain: sld, domain, address: parts.join("@") };
}

/**
 * mailcheck's legacy URI-encoding helper, kept for compatibility. It is NOT an
 * HTML sanitizer: render a suggestion as text, never as HTML.
 */
export function encodeEmail(email: string): string {
  return encodeURI(email)
    .replace("%20", " ")
    .replace(/%25/g, "%")
    .replace("%5E", "^")
    .replace("%60", "`")
    .replace("%7B", "{")
    .replace("%7C", "|")
    .replace("%7D", "}");
}

interface ClosestMatch {
  domain: string | false;
  ambiguous: boolean;
}

function closestMatch(domain: string, domains: readonly string[] | undefined, distance: DistanceFunction, threshold: number): ClosestMatch {
  if (!domain || !domains) return { domain: false, ambiguous: false };
  let minDist = Number.POSITIVE_INFINITY;
  let closest: string | false = false;
  let ambiguous = false;
  for (const candidate of domains) {
    if (domain === candidate) return { domain, ambiguous: false };
    const dist = distance(domain, candidate);
    if (dist < minDist) {
      minDist = dist;
      closest = candidate;
      ambiguous = false;
    } else if (dist === minDist && candidate !== closest) {
      ambiguous = true;
    }
  }
  return { domain: minDist <= threshold && !ambiguous ? closest : false, ambiguous: minDist <= threshold && ambiguous };
}

/** mailcheck's `findClosestDomain`: the one closest candidate within the threshold, or `false` (ties too). */
export function findClosestDomain(
  domain: string,
  domains: readonly string[] | undefined,
  distanceFunction?: DistanceFunction,
  threshold?: number,
): string | false {
  return closestMatch(domain, domains, distanceFunction ?? sift4Distance, threshold === undefined ? topLevelThreshold : threshold).domain;
}

const NOT_TYPO_SET: ReadonlySet<string> = new Set(NOT_TYPOS);

/**
 * mailcheck 2.0's `suggest`, typed, with mailcheck's handling of a list left
 * `undefined` (that step is skipped). Returns `false` when there is nothing
 * to suggest, as mailcheck does. A domain in `NOT_TYPOS` is never rewritten.
 */
export function legacySuggest(
  email: string,
  domains?: readonly string[],
  secondLevelDomains?: readonly string[],
  topLevelDomains?: readonly string[],
  distanceFunction?: DistanceFunction,
): MailcheckResult | false {
  const split = splitEmail(email);
  if (!split) return false;
  const distance = distanceFunction ?? sift4Distance;
  const parts: EmailParts = {
    address: split.address,
    domain: split.domain.toLowerCase(),
    secondLevelDomain: split.secondLevelDomain.toLowerCase(),
    topLevelDomain: split.topLevelDomain.toLowerCase(),
  };
  const result = (domain: string): MailcheckResult | false =>
    NOT_TYPO_SET.has(parts.domain) ? false : { address: parts.address, domain, full: `${parts.address}@${domain}` };

  // A bare name completes only to exactly one listed domain.
  if (/^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.?$/.test(parts.domain) && !parts.domain.startsWith("xn--")) {
    if (domains?.includes(parts.domain)) return false;
    const prefix = `${parts.domain.replace(/\.$/, "")}.`;
    let completion: string | false = false;
    for (const candidate of domains ?? []) {
      if (candidate.startsWith(prefix) && candidate.length > prefix.length) {
        if (completion && completion !== candidate) return false;
        completion = candidate;
      }
    }
    return completion ? result(completion) : false;
  }

  if (!parts.secondLevelDomain || !/^[a-z0-9-]+(?:\.[a-z0-9-]+)+$/.test(parts.domain) || /(^|\.)-|-(\.|$)|(^|\.)xn--/.test(parts.domain)) {
    return false;
  }
  if (parts.topLevelDomain.includes(".") && !topLevelDomains?.includes(parts.topLevelDomain)) return false;

  const root = parts.domain.slice(parts.domain.lastIndexOf(".") + 1);
  const knownTld = isRealTld(root) || !!topLevelDomains?.includes(parts.topLevelDomain);
  // A recognised suffix never becomes a different suffix (.co stays .co).
  const matching = knownTld && domains ? domains.filter((d) => d.slice(d.indexOf(".") + 1) === parts.topLevelDomain) : domains;

  if (secondLevelDomains?.includes(parts.secondLevelDomain) && topLevelDomains?.includes(parts.topLevelDomain)) return false;

  const match = closestMatch(parts.domain, matching, distance, domainThreshold);
  if (match.ambiguous) return false;
  if (match.domain) return match.domain === parts.domain ? false : result(match.domain);

  if (knownTld && !topLevelDomains?.includes(parts.topLevelDomain)) return false;
  const closestSld = findClosestDomain(parts.secondLevelDomain, secondLevelDomains, distance, secondLevelThreshold);
  const closestTld = knownTld ? parts.topLevelDomain : findClosestDomain(parts.topLevelDomain, topLevelDomains, distance, topLevelThreshold);

  let fixed = parts.domain;
  let changed = false;
  if (closestSld && closestSld !== parts.secondLevelDomain) {
    fixed = fixed.replace(parts.secondLevelDomain, closestSld);
    changed = true;
  }
  if (closestTld && closestTld !== parts.topLevelDomain) {
    fixed = fixed.slice(0, fixed.length - parts.topLevelDomain.length) + closestTld;
    changed = true;
  }
  return changed ? result(fixed) : false;
}

/** mailcheck's `run`, typed. */
export function run<S = MailcheckResult, E = undefined>(options: MailcheckOptions<S, E>): S | E | MailcheckResult | undefined {
  const raw: unknown = options.email;
  const email = typeof raw === "string" ? raw.trim() : null;
  const custom = options.domains || options.secondLevelDomains || options.topLevelDomains || options.distanceFunction;
  let found: MailcheckResult | false = false;
  if (email !== null && custom) {
    found = legacySuggest(
      encodeEmail(email),
      options.domains ?? defaultDomains,
      options.secondLevelDomains ?? defaultSecondLevelDomains,
      options.topLevelDomains ?? defaultTopLevelDomains,
      options.distanceFunction ?? sift4Distance,
    );
  } else if (email !== null) {
    const ours = suggest(email);
    if (ours) {
      const address = encodeEmail(email.slice(0, email.lastIndexOf("@")));
      found = { address, domain: ours.domain, full: `${address}@${ours.domain}` };
    }
  }
  if (found) return options.suggested ? options.suggested(found) : found;
  return options.empty ? options.empty() : undefined;
}

/** The `Mailcheck` object, for code that calls `Mailcheck.run(...)`. */
export const Mailcheck = {
  run,
  suggest: legacySuggest,
  findClosestDomain,
  splitEmail,
  encodeEmail,
  sift4Distance,
  defaultDomains,
  defaultSecondLevelDomains,
  defaultTopLevelDomains,
  domainThreshold,
  secondLevelThreshold,
  topLevelThreshold,
} as const;

export default Mailcheck;
