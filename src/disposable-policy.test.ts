import { describe, expect, it } from "vitest";
import { disposableDomains, isDisposable, NEVER_DISPOSABLE, WILDCARD_DISPOSABLE } from "./disposable.js";

/**
 * The reviewed classification of the vendored list (update-disposable
 * --review and --wildcards, 2026-10-21). Safer side first: only the exact
 * listed name is disposable unless the service is a reviewed wildcard.
 */
const KEPT_DISPOSABLE = [
  "10minutemail.com", "bugmenot.com", "emailondeck.com", "generator.email", "guerrillamail.com", "kuku.lu",
  "mail-tester.com", "mail.tm", "mailinator.com", "moakt.com", "temp-mail.org", "tempmail.ninja", "webhook.site",
  "yopmail.com", "yourdomain.com",
];

/** Dynamic DNS and free subdomain hosts on the list: exact name only, people run real mail below them. */
const SHARED_HOSTS = [
  "mooo.com", "us.to", "uk.to", "chickenkiller.com", "ydns.eu", "zyns.com", "ftp.sh", "v6.rocks", "qc.to", "qd.je",
  "rf.gd", "42web.io", "co.cc", "vpn64.de", "25u.com", "4pu.com",
];

describe("NEVER_DISPOSABLE: reviewed real providers and companies", () => {
  it("is never disposable, nor anything below it, and is not in the vendored list", () => {
    for (const domain of Object.keys(NEVER_DISPOSABLE)) {
      expect(isDisposable(domain), domain).toBe(false);
      expect(isDisposable(`mail.${domain}`), `mail.${domain}`).toBe(false);
      expect(disposableDomains().has(domain), domain).toBe(false);
    }
  });

  it("names the four the review found, each with a reason", () => {
    expect(Object.keys(NEVER_DISPOSABLE).sort()).toEqual(["21cn.com", "99.com", "hola.org", "sify.com"]);
    for (const reason of Object.values(NEVER_DISPOSABLE)) expect(reason.length).toBeGreaterThan(10);
  });
});

describe("exact name by default", () => {
  it("a subdomain of a shared host is allowed; the exact listed name is not", () => {
    for (const host of SHARED_HOSTS) {
      expect(isDisposable(`someones-home.${host}`), host).toBe(false);
      expect(isDisposable(`mail.business.${host}`), host).toBe(false);
      expect(isDisposable(host), host).toBe(disposableDomains().has(host));
    }
    expect(isDisposable("home.mooo.com")).toBe(false);
    expect(isDisposable("mooo.com")).toBe(true);
  });

  it("a subdomain under any listed parent outside the wildcard set is allowed", () => {
    const listedNonWildcard = [...disposableDomains()].filter((d) => !Object.hasOwn(WILDCARD_DISPOSABLE, d)).slice(0, 500);
    for (const d of listedNonWildcard) expect(isDisposable(`someone.${d}`), d).toBe(false);
    expect(isDisposable("x.guerrillamail.com")).toBe(false);
  });

  it("every kept service is disposable by its exact name", () => {
    for (const domain of KEPT_DISPOSABLE) expect(isDisposable(domain), domain).toBe(true);
  });
});

describe("WILDCARD_DISPOSABLE: reviewed services that hand out subdomain addresses", () => {
  it("refuses any name below them", () => {
    expect(isDisposable("x.mailinator.com")).toBe(true);
    expect(isDisposable("team.x.mailinator.com")).toBe(true);
    for (const domain of Object.keys(WILDCARD_DISPOSABLE)) expect(isDisposable(`anything.${domain}`), domain).toBe(true);
  });

  it("holds only listed domains, never a shared host, each with a reason", () => {
    for (const [domain, reason] of Object.entries(WILDCARD_DISPOSABLE)) {
      expect(disposableDomains().has(domain), domain).toBe(true);
      expect(SHARED_HOSTS, domain).not.toContain(domain);
      expect(reason.length, domain).toBeGreaterThan(10);
    }
  });
});
