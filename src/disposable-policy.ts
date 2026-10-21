/**
 * Reviewed exceptions and extensions to the vendored disposable list, each
 * entry with its reason. The rule behind them: a wrong "disposable" refuses a
 * real person, so the list is trusted only where it is clearly right.
 *
 * By default only the EXACT listed name is disposable: a name below a listed
 * domain may belong to someone else entirely (dynamic DNS and free subdomain
 * hosts are on the list, and people run real mail under them). A subdomain
 * counts only below a service in `WILDCARD_DISPOSABLE`.
 */

/**
 * Real mailbox providers and companies that the upstream list names. Never
 * disposable, nor any name below them; update-disposable.mjs leaves them out
 * and isDisposable() answers false for them even if a list still has them.
 * From `update-disposable --review` (Tranco top 100k with their own MX), 2026-10-21.
 */
export const NEVER_DISPOSABLE: Readonly<Record<string, string>> = {
  "21cn.com": "China Telecom's webmail, real long-lived mailboxes",
  "sify.com": "Sify Technologies, an Indian ISP with customer mailboxes (mail.sify.com)",
  "hola.org": "Hola, a company (VPN service) whose staff mail is on this domain",
  "99.com": "NetDragon Websoft's corporate domain",
};

/**
 * Disposable services that hand out addresses on subdomains, so ANY name
 * below them is disposable too. Evidence for each: a random label below the
 * domain answers an MX that is the service's own throwaway mail host (a
 * wildcard MX, `update-disposable --wildcards`, 2026-10-21), on a domain that
 * ranks in the Tranco top 1M and is a known temporary-mail service. Hosting
 * and dynamic DNS domains with a wildcard MX (rf.gd, 42web.io) are NOT here:
 * their subdomains belong to their customers.
 */
export const WILDCARD_DISPOSABLE: Readonly<Record<string, string>> = {
  "mailinator.com": "wildcard MX mail.mailinator.com; team inboxes on subdomains",
  "yopmail.com": "wildcard MX smtp.yopmail.com",
  "yopmail.fr": "wildcard MX smtp.yopmail.com (YOPmail's alternate domain)",
  "generator.email": "wildcard MX mx.add5000.com (the generator.email network)",
  "emailfake.com": "wildcard MX mx.add5000.com (the generator.email network)",
  "email-fake.com": "wildcard MX mx.add5000.com (the generator.email network)",
  "xxi2.com": "wildcard MX mx.add5000.com (the generator.email network)",
  "dropmail.me": "wildcard MX mx.dropmail.me",
  "mailcatch.com": "wildcard MX mail2.mailcatch.com",
  "emlhub.com": "wildcard MX mx.emlhub.com (temporary inbox service)",
  "emlpro.com": "wildcard MX mx.emlpro.com (temporary inbox service)",
  "emltmp.com": "wildcard MX mx.emltmp.com (temporary inbox service)",
  "webhook.site": "wildcard MX to its inbound mail; per-token addresses on email.webhook.site",
};
