import { describe, expect, it } from "vitest";
import Mailcheck, { encodeEmail, legacySuggest, run, sift4Distance, splitEmail } from "./mailcheck-compat.js";

/**
 * mailcheck's own correctness suite (spec/correctness.test.js at master,
 * 2026-09, MIT), ported case by case. Where this package deliberately answers
 * differently, the case says so and the README's "Differences from mailcheck"
 * gives the reason.
 */
describe("mailcheck parity: run() with the defaults", () => {
  const typos: Array<[string, string]> = [
    ["Person.Name+Tag@gmial.com", "Person.Name+Tag@gmail.com"],
    ["person@hotmial.com", "person@hotmail.com"],
    ["person@gmail.con", "person@gmail.com"],
  ];
  for (const [input, expected] of typos) {
    it(`corrects ${input}`, () => {
      expect(run({ email: input })).toMatchObject({ full: expected });
    });
  }

  // DIFFERENCE: two edits (gmil.con, yahooo.cmo) and a TLD fix on an unknown
  // domain (randomsmallcompany.cmo) give no suggestion here: two edits rewrote
  // real companies in our sweep, and we never guess for a domain we do not know.
  for (const email of ["person@gmil.con", "person@yahooo.cmo", "person@randomsmallcompany.cmo", "person@con-artists.con"]) {
    it(`deliberately leaves ${email} alone`, () => {
      expect(run({ email })).toBeUndefined();
    });
  }

  const legitimate = [
    "person@gmail.com", "person@company.ai", "person@company.io", "person@company.app", "person@company.dev",
    "person@company.zip", "person@company.co", "person@company.design", "person@company.museum", "person@proton.me",
    "person@protonmail.com", "person@pm.me", "person@hey.com", "person@fastmail.com", "person@tuta.com",
    "person@gmil.ai", "person@mail.example.com", "person@example.co.uk", "person@bücher.de",
    "person@xn--bcher-kva.de", "person@example.рф",
  ];
  for (const email of legitimate) {
    it(`leaves ${email} alone`, () => {
      expect(run({ email })).toBeUndefined();
    });
  }

  // DIFFERENCE: gmail.co and hotmail.co are verified by live DNS to accept no
  // mail (null MX / no mail host), so they are corrected as lookalikes.
  it("corrects the verified dead lookalikes gmail.co and hotmail.co", () => {
    expect(run({ email: "person@gmail.co" })).toMatchObject({ full: "person@gmail.com" });
    expect(run({ email: "person@hotmail.co" })).toMatchObject({ full: "person@hotmail.com" });
  });

  it("completes an exact known name with a missing ending, and the completion is stable", () => {
    for (const [email, full] of [
      ["sample@gmail", "sample@gmail.com"],
      ["Sample+Tag@GMAIL", "Sample+Tag@gmail.com"],
      ["sample@gmail.", "sample@gmail.com"],
      ["person@icloud", "person@icloud.com"],
      ["person@proton", "person@proton.me"],
    ] as const) {
      const suggestion = run({ email });
      expect(suggestion).toMatchObject({ full });
      expect(run({ email: full })).toBeUndefined();
    }
  });

  it("abstains on prefixes and unknown names", () => {
    for (const domain of ["g", "gm", "gmai", "unknowncompany", "gmail..", "gmail.-", "-gmail", "gmail-", "xn--bcher-kva"]) {
      expect(run({ email: `sample@${domain}` }), domain).toBeUndefined();
    }
  });

  it("is case-insensitive on the domain and keeps the local part", () => {
    expect(run({ email: " Person.Name@GMIAL.COM " })).toMatchObject({ full: "Person.Name@gmail.com" });
  });

  it("keeps mailcheck's encoding contract: run() encodes the local part", () => {
    for (const local of ["Person.Name+Tag", "François", "a%%^^``{{||}}", "<script>alert(1)</script>"]) {
      expect(run({ email: `${local}@gmial.com` })).toMatchObject({ address: encodeEmail(local) });
    }
  });

  it("leaves every one of mailcheck's bundled providers alone", () => {
    for (const domain of Mailcheck.defaultDomains) expect(run({ email: `Person@${domain}` }), domain).toBeUndefined();
  });

  it("abstains on malformed input without throwing", () => {
    for (const email of [null, undefined, "", "person", "@gmail.com", "person@", "person@gm", "person@gmai", "person@#gmail.com", "person@gmail..com", "person@-gmail.com", "person@gmail-.com", "person@[127.0.0.1]"]) {
      expect(run({ email }), String(email)).toBeUndefined();
    }
    expect(splitEmail(null)).toBe(false);
  });

  it("dispatches callbacks exactly once, with mailcheck's arguments", () => {
    const suggestedCalls: unknown[][] = [];
    const emptyCalls: unknown[][] = [];
    const options = {
      email: "Person@gmial.com",
      suggested: (...args: unknown[]) => {
        suggestedCalls.push(args);
        return "suggested-result";
      },
      empty: (...args: unknown[]) => {
        emptyCalls.push(args);
        return "empty-result";
      },
    };
    expect(run(options)).toBe("suggested-result");
    expect(suggestedCalls).toEqual([[{ address: "Person", domain: "gmail.com", full: "Person@gmail.com" }]]);
    expect(run({ ...options, email: "Person@hey.com" })).toBe("empty-result");
    expect(emptyCalls).toEqual([[]]);
  });
});

describe("mailcheck parity: custom lists use mailcheck's algorithm", () => {
  it("completes against the caller's list", () => {
    expect(legacySuggest("sample@gmail", ["gmail.com"])).toEqual({ address: "sample", domain: "gmail.com", full: "sample@gmail.com" });
    expect(run({ email: "sample@gmail", domains: [] })).toBeUndefined();
    expect(run({ email: "sample@gmail", domains: ["custom.com"] })).toBeUndefined();
    expect(run({ email: "Person@custom", domains: ["custom.co.uk"], suggested: (s) => s.full, empty: () => "empty" })).toBe("Person@custom.co.uk");
  });

  it("abstains on ambiguous completions, and duplicates are not ambiguous", () => {
    for (const domains of [["gmail.com", "gmail.co.uk"], ["gmail.co.uk", "gmail.com"]]) {
      expect(run({ email: "sample@gmail", domains })).toBeUndefined();
    }
    expect(run({ email: "sample@gmail", domains: ["gmail.com", "gmail.com"] })).toMatchObject({ full: "sample@gmail.com" });
    expect(run({ email: "sample@gmail", domains: ["gmail", "gmail.com"] })).toBeUndefined();
  });

  it("custom suffixes, ties and zero thresholds", () => {
    expect(run({ email: "person@company.corp", topLevelDomains: ["corp"] })).toBeUndefined();
    expect(run({ email: "person@custmo.com", domains: ["custom.com"], secondLevelDomains: [], topLevelDomains: [] })).toMatchObject({ full: "person@custom.com" });
    expect(Mailcheck.findClosestDomain("cat.com", ["bat.com", "hat.com"])).toBe(false);
    expect(Mailcheck.findClosestDomain("cat.com", ["bat.com", "bat.com"])).toBe("bat.com");
    expect(Mailcheck.findClosestDomain("gmial.com", ["gmail.com"], undefined, 0)).toBe(false);
    expect(run({ email: "person@gmial.com", domains: ["gmail.com", "gmiel.com"] })).toBeUndefined();
  });

  it("a custom distance function is used, and callbacks keep their return values", () => {
    let calls = 0;
    const out = run({
      email: "person@typo.com",
      domains: ["custom.com"],
      secondLevelDomains: [],
      distanceFunction: () => {
        calls += 1;
        return 1;
      },
      suggested: (s) => s.full,
      empty: () => "empty",
    });
    expect(out).toBe("person@custom.com");
    expect(calls).toBeGreaterThan(0);
  });

  it("protects modern and regional endings whatever the list order", () => {
    for (const root of ["ai", "io", "app", "dev", "me", "co", "om", "zip", "tech", "cloud", "email", "uk", "nz", "au", "tv", "gg"]) {
      for (const domains of [["gmail.com", "outlook.com"], ["outlook.com", "gmail.com"]]) {
        expect(run({ email: `Person@independentcompany.${root}`, domains }), root).toBeUndefined();
      }
    }
  });

  it("low-level suggest keeps the raw local part; run encodes it", () => {
    const local = "<tag>François+Tag";
    expect(legacySuggest(`${local}@gmial.com`, ["gmail.com"])).toEqual({ address: local, domain: "gmail.com", full: `${local}@gmail.com` });
    expect(run({ email: `${local}@gmial.com`, domains: ["gmail.com"] })).toMatchObject({ address: encodeEmail(local) });
  });

  it("never rewrites a NOT_TYPOS domain, even with mailcheck's lists", () => {
    expect(run({ email: "ana@grail.com", domains: ["gmail.com"] })).toBeUndefined();
  });

  it("does not change the exported default lists", () => {
    const before = [...Mailcheck.defaultDomains];
    run({ email: "person@gmial.com", domains: [], secondLevelDomains: [], topLevelDomains: [] });
    expect(Mailcheck.defaultDomains).toEqual(before);
  });
});

describe("sift4Distance", () => {
  it("matches mailcheck's values on known pairs", () => {
    expect(sift4Distance("gmail.com", "gmail.com")).toBe(0);
    expect(sift4Distance("gmial.com", "gmail.com")).toBe(1);
    expect(sift4Distance("", "abc")).toBe(3);
    expect(sift4Distance("abc", "")).toBe(3);
  });
});
