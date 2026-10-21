/**
 * One call for a form: the typo hint, the disposable check and the DNS check
 * together, with a single verdict. Its own subpath (`mailcheck-ts/check`)
 * because it carries the disposable list.
 *
 * The library is neutral: disposable addresses are ALLOWED unless the caller
 * says otherwise (`allowDisposable: false`), and only definitive DNS answers
 * refuse. What to do with a verdict is the caller's decision.
 */
import { isDisposable } from "./disposable.js";
import { checkMx, isDefinitivelyUndeliverable, normalizeDomain, type CheckMxOptions, type MxCheck } from "./mx.js";
import { suggest, type Suggestion } from "./suggest.js";

export interface CheckEmailOptions extends CheckMxOptions {
  /** Default true. False refuses a disposable domain (before any DNS question). */
  allowDisposable?: boolean;
  /** Default true. False skips DNS entirely (an offline check). */
  checkMx?: boolean;
}

export type EmailCheck =
  /** Nothing proves it cannot work. `mx` is null when DNS was not asked. */
  | { verdict: "allow"; domain: string; suggestion: Suggestion | null; mx: MxCheck | null; disposable: boolean }
  /** A disposable domain, with `allowDisposable: false`. */
  | { verdict: "disposable"; domain: string; suggestion: Suggestion | null }
  /** DNS proves the domain takes no mail (`null_mx`, `no_domain`, `no_mail_host`). */
  | { verdict: "undeliverable"; domain: string; suggestion: Suggestion | null; mx: MxCheck }
  /** Not an address with a host name after the `@`. */
  | { verdict: "invalid" };

export type EmailVerdict = EmailCheck["verdict"];

/** Never throws; a DNS failure is an `allow` with `mx.kind === "unknown"`. */
export async function checkEmail(email: string, options: CheckEmailOptions = {}): Promise<EmailCheck> {
  const value = email.trim();
  const at = value.lastIndexOf("@");
  if (at <= 0 || at === value.length - 1) return { verdict: "invalid" };
  const domain = normalizeDomain(value.slice(at + 1));
  if (!domain) return { verdict: "invalid" };
  const suggestion = suggest(value);
  const disposable = isDisposable(domain);
  if (disposable && options.allowDisposable === false) return { verdict: "disposable", domain, suggestion };
  if (options.checkMx === false) return { verdict: "allow", domain, suggestion, mx: null, disposable };
  const mx = await checkMx(domain, options);
  if (isDefinitivelyUndeliverable(mx)) return { verdict: "undeliverable", domain, suggestion, mx };
  return { verdict: "allow", domain, suggestion, mx, disposable };
}
