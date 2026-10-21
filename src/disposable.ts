/**
 * Is this a disposable (throwaway) email domain? Offline, from the
 * disposable-email-domains list (CC0 1.0), vendored as a generated module,
 * with the reviewed policy of `disposable-policy.ts`.
 *
 * Its own subpath export (`mailcheck-ts/disposable`), so code that only
 * suggests typos never ships the list.
 *
 * Matching, safer side first (a wrong "disposable" refuses a real person):
 *   - the EXACT listed name only, by default: `home.mooo.com` is not
 *     `mooo.com`, because a name below a listed domain may be somebody's own
 *     (dynamic DNS and free subdomain hosts are on the list);
 *   - any name below a service in `WILDCARD_DISPOSABLE`, which is reviewed
 *     evidence that the service hands out subdomain addresses
 *     (`x.mailinator.com`);
 *   - never a reviewed real provider or company (`NEVER_DISPOSABLE`) or
 *     anything below it, nor one of our provider domains.
 */
import { DISPOSABLE_DOMAIN_TEXT } from "./disposable-list.js";
import { NEVER_DISPOSABLE, WILDCARD_DISPOSABLE } from "./disposable-policy.js";

export { NEVER_DISPOSABLE, WILDCARD_DISPOSABLE } from "./disposable-policy.js";

let domains: ReadonlySet<string> | null = null;

/** The list, parsed once on first use. */
export function disposableDomains(): ReadonlySet<string> {
  domains ??= new Set(DISPOSABLE_DOMAIN_TEXT.split("\n"));
  return domains;
}

/**
 * True when `domain` is disposable under the rules above. Case and a
 * trailing dot do not matter; anything that is not a plausible ASCII host
 * name answers false.
 */
export function isDisposable(domain: string): boolean {
  let d = domain.trim().toLowerCase();
  if (d.endsWith(".")) d = d.slice(0, -1);
  if (d.length === 0 || d.length > 253 || !/^[a-z0-9.-]+$/.test(d)) return false;
  const labels = d.split(".");
  const parents: string[] = [];
  for (let i = 1; i <= labels.length - 2; i += 1) parents.push(labels.slice(i).join("."));
  if ([d, ...parents].some((name) => Object.hasOwn(NEVER_DISPOSABLE, name))) return false;
  if (disposableDomains().has(d)) return true;
  return parents.some((parent) => Object.hasOwn(WILDCARD_DISPOSABLE, parent));
}
