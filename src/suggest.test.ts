import { describe, expect, it } from "vitest";
import { osaDistance } from "./distance.js";
import { LOOKALIKE_DOMAINS, NOT_TYPOS, PROVIDER_DOMAINS, REVIEWED_TYPO_DOMAINS } from "./providers.js";
import { suggest, suggestDomain } from "./suggest.js";
import { isRealTld } from "./tlds.js";

describe("suggest: real typos are corrected", () => {
  const cases: Array<[string, string]> = [
    // The production bounces that started this package (2026-10-21).
    ["ana@gmail.ro", "ana@gmail.com"],
    ["ana@yaoo.com", "ana@yahoo.com"],
    ["ana@999gmail.com", "ana@gmail.com"],
    // Swaps, drops, doubles and wrong keys.
    ["ana@gmial.com", "ana@gmail.com"],
    ["ana@gmal.com", "ana@gmail.com"],
    ["ana@gmai.com", "ana@gmail.com"],
    ["ana@gnail.com", "ana@gmail.com"],
    ["ana@gmaill.com", "ana@gmail.com"],
    ["ana@gamil.com", "ana@gmail.com"],
    ["ana@gmail.con", "ana@gmail.com"],
    ["ana@gmail.cim", "ana@gmail.com"],
    ["ana@gmail.comm", "ana@gmail.com"],
    ["ana@yahooo.com", "ana@yahoo.com"],
    ["ana@yhaoo.com", "ana@yahoo.com"],
    ["ana@hotmial.com", "ana@hotmail.com"],
    ["ana@hotmal.com", "ana@hotmail.com"],
    ["ana@hotmail.con", "ana@hotmail.com"],
    ["ana@outlok.com", "ana@outlook.com"],
    ["ana@outloo.com", "ana@outlook.com"],
    ["ana@iclod.com", "ana@icloud.com"],
    ["ana@protonmial.com", "ana@protonmail.com"],
    // Country domains keep their country.
    ["ana@yaho.fr", "ana@yahoo.fr"],
    ["ana@hotmial.fr", "ana@hotmail.fr"],
    ["ana@outlok.de", "ana@outlook.de"],
    ["ana@hotmial.co.uk", "ana@hotmail.co.uk"],
    ["ana@librero.it", "ana@libero.it"],
    ["ana@seznma.cz", "ana@seznam.cz"],
    ["ana@t-onlin.de", "ana@t-online.de"],
    ["ana@googlemial.com", "ana@googlemail.com"],
    // Separators and dots.
    ["ana@gmailcom", "ana@gmail.com"],
    ["ana@gmail,com", "ana@gmail.com"],
    ["ana@.gmail.com", "ana@gmail.com"],
    // Lookalikes verified to accept no mail.
    ["ana@gmail.co", "ana@gmail.com"],
    ["ana@gmail.de", "ana@gmail.com"],
    ["ana@yahoo.co", "ana@yahoo.com"],
  ];
  for (const [typed, expected] of cases) {
    it(`${typed} -> ${expected}`, () => {
      expect(suggest(typed)?.address).toBe(expected);
    });
  }

  it("keeps the local part exactly as typed and normalizes only the domain", () => {
    expect(suggest("  Jane.Doe+tag@GMIAL.COM.  ")).toEqual({
      address: "Jane.Doe+tag@gmail.com",
      domain: "gmail.com",
      original: "gmial.com",
      reason: "typo",
    });
  });

  it("names why", () => {
    expect(suggest("a@gmail.ro")?.reason).toBe("lookalike");
    expect(suggest("a@999gmail.com")?.reason).toBe("junk_prefix");
    expect(suggest("a@gmailcom")?.reason).toBe("missing_dot");
    expect(suggest("a@gmail,com")?.reason).toBe("separator");
  });
});

describe("suggest: never rewrites what may be real", () => {
  const untouched = [
    // Every provider as typed.
    ...PROVIDER_DOMAINS.map((domain) => `ana@${domain}`),
    // Real domains one edit from a provider.
    ...NOT_TYPOS.map((domain) => `ana@${domain}`),
    // Valid company domains and valid TLDs.
    "ana@company.co",
    "ana@startup.io",
    "ana@acme.com",
    "ana@acme.ai",
    "ana@firma.ro",
    "ana@example.org",
    "ana@university.edu",
    "ana@stud.ubbcluj.ro",
    // A real TLD is the person's choice, even beside a provider name.
    "ana@outlook.ro",
    "ana@hotmail.ro",
    "ana@gmail.it",
    // A provider's name typed right is never turned into a neighbour: not email.cz.
    "ana@gmail.cz",
    "ana@mail.de",
    "ana@yahoo.cam",
    "ana@proton.be",
    // Real companies with their own mail that a looser rule rewrote (Tranco
    // sweep, 2026-10-21): two edits away, or one edit from a 4-letter name.
    "ana@tesla.com",
    "ana@kroger.com",
    "ana@hotmart.com",
    "ana@kahoot.com",
    "ana@badoo.com",
    "ana@delta.com",
    "ana@mixcloud.com",
    "ana@jive.com",
    "ana@zoro.com",
    // ...and one edit away, listed in NOT_TYPOS after review.
    "ana@grail.com",
    "ana@libro.it",
    "ana@mymail.com",
    "ana@cloud.com",
    // Short domains: too little signal.
    "ana@me.co",
    "ana@mc.com",
    "ana@aol.co",
    "ana@gmx.co",
    "ana@wp.p",
    "ana@web.d",
    "ana@lve.fr",
    "ana@o3.pl",
    // Ambiguous: several providers one edit away.
    "ana@hotmail.c",
    "ana@outlook.c",
    // Internationalised domains.
    "ana@gmäil.com",
    "ana@xn--gmil-6na.com",
    "ana@яндекс.рф",
    // Not an address.
    "",
    "gmail.com",
    "ana@",
    "@gmail.com",
    "ana@gmail..com",
    "ana@123.com",
  ];
  for (const typed of untouched) {
    it(`${JSON.stringify(typed)} -> no suggestion`, () => {
      expect(suggest(typed)).toBeNull();
    });
  }

  it("junk before a short provider is not stripped (`12mail.com` may be real)", () => {
    expect(suggest("ana@12mail.com")).toBeNull();
    expect(suggest("ana@1aol.com")).toBeNull();
    expect(suggest("ana@12345gmail.com")).toBeNull();
  });
});

describe("the curated lists", () => {
  it("a reviewed typo is still corrected, and no domain is both a typo and not one", () => {
    for (const domain of REVIEWED_TYPO_DOMAINS) {
      expect(suggestDomain(domain), domain).not.toBeNull();
      expect(NOT_TYPOS).not.toContain(domain);
    }
  });

  it("every lookalike maps to a listed provider and is not itself a provider", () => {
    for (const [from, to] of Object.entries(LOOKALIKE_DOMAINS)) {
      expect(PROVIDER_DOMAINS).toContain(to);
      expect(PROVIDER_DOMAINS).not.toContain(from);
    }
  });

  it("holds no duplicates and only lower-case ASCII host names", () => {
    expect(new Set(PROVIDER_DOMAINS).size).toBe(PROVIDER_DOMAINS.length);
    for (const domain of [...PROVIDER_DOMAINS, ...Object.keys(LOOKALIKE_DOMAINS), ...NOT_TYPOS]) {
      expect(domain).toMatch(/^[a-z0-9-]+(\.[a-z0-9-]+)+$/);
      expect(isRealTld(domain.slice(domain.lastIndexOf(".") + 1))).toBe(true);
    }
  });

  it("no provider is suggested for another provider", () => {
    for (const domain of PROVIDER_DOMAINS) expect(suggestDomain(domain)).toBeNull();
  });

  it("accepts a caller's own lists", () => {
    expect(suggest("a@acme-mial.com", { providers: ["acme-mail.com"] })?.address).toBe("a@acme-mail.com");
    expect(suggest("a@gmial.com", { providers: ["acme-mail.com"] })).toBeNull();
  });
});

describe("osaDistance", () => {
  it("counts an adjacent swap as one edit", () => {
    expect(osaDistance("gmial", "gmail")).toBe(1);
    expect(osaDistance("ab", "ba")).toBe(1);
  });
  it("counts insertions, deletions and substitutions", () => {
    expect(osaDistance("", "abc")).toBe(3);
    expect(osaDistance("kitten", "sitting")).toBe(3);
    expect(osaDistance("same", "same")).toBe(0);
  });
  it("is the restricted distance (OSA), not full Damerau: CA -> ABC is 3", () => {
    expect(osaDistance("ca", "abc")).toBe(3);
  });
  it("stops early past max", () => {
    expect(osaDistance("abcdefgh", "zzzzzzzz", 2)).toBe(3);
    expect(osaDistance("a", "abcd", 1)).toBe(2);
  });
});
