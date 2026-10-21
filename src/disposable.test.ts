import { describe, expect, it } from "vitest";
import { checkEmail } from "./check.js";
import { disposableDomains, isDisposable } from "./disposable.js";
import type { FetchLike } from "./mx.js";
import { PROVIDER_DOMAINS } from "./providers.js";

describe("isDisposable", () => {
  it("knows the big throwaway services, case and root dot aside", () => {
    for (const domain of ["mailinator.com", "guerrillamail.com", "10minutemail.com", "yopmail.com", "MAILINATOR.COM."]) {
      expect(isDisposable(domain), domain).toBe(true);
    }
  });

  it("counts a subdomain only below a reviewed wildcard service", () => {
    expect(isDisposable("anything.mailinator.com")).toBe(true);
    expect(isDisposable("a.b.yopmail.com")).toBe(true);
  });

  it("never lists a mailbox provider, nor a parent of one", () => {
    for (const domain of PROVIDER_DOMAINS) expect(isDisposable(domain), domain).toBe(false);
  });

  it("answers false for real company domains and non-host input", () => {
    for (const domain of ["acme.com", "stripe.com", "", "not a domain", "com", "bücher.de"]) {
      expect(isDisposable(domain), domain).toBe(false);
    }
  });

  it("holds a normalised, deduplicated list", () => {
    const list = [...disposableDomains()];
    expect(list.length).toBeGreaterThan(5000);
    for (const domain of list) expect(domain).toMatch(/^[a-z0-9-]+(\.[a-z0-9-]+)+$/);
    expect(new Set(list).size).toBe(list.length);
  });
});

const mxFor = (status: "mx" | "nodata"): FetchLike => async (input) => {
  const name = new URL(input).searchParams.get("name") ?? "";
  const type = new URL(input).searchParams.get("type");
  const body =
    status === "mx" && type === "MX"
      ? { Status: 0, Answer: [{ name, type: 15, TTL: 60, data: `10 mx.${name}.` }] }
      : { Status: 0, Authority: [{ name, type: 6, TTL: 60, data: "ns. host. 1 2 3 4 60" }] };
  return new Response(JSON.stringify(body), { status: 200 });
};

describe("checkEmail", () => {
  it("allows a disposable address by default (the library is neutral)", async () => {
    const result = await checkEmail("a@mailinator.com", { fetch: mxFor("mx"), cache: null });
    expect(result).toMatchObject({ verdict: "allow", disposable: true });
  });

  it("refuses it with allowDisposable: false, before asking DNS", async () => {
    let asked = 0;
    const counting: FetchLike = async (input, init) => {
      asked += 1;
      return mxFor("mx")(input, init);
    };
    expect(await checkEmail("a@x.mailinator.com", { fetch: counting, allowDisposable: false })).toEqual({
      verdict: "disposable",
      domain: "x.mailinator.com",
      suggestion: null,
    });
    expect(asked).toBe(0);
  });

  it("refuses only a definitive DNS negative, and carries the fix", async () => {
    const result = await checkEmail("ana@gmail.ro", { fetch: mxFor("nodata"), cache: null });
    expect(result).toMatchObject({ verdict: "undeliverable", domain: "gmail.ro", suggestion: { address: "ana@gmail.com" } });
  });

  it("allows with a hint when DNS says deliverable, and offline when asked", async () => {
    expect(await checkEmail("ana@gmial.com", { fetch: mxFor("mx"), cache: null })).toMatchObject({ verdict: "allow", suggestion: { domain: "gmail.com" } });
    expect(await checkEmail("ana@gmial.com", { checkMx: false })).toMatchObject({ verdict: "allow", mx: null });
  });

  it("calls a malformed address invalid", async () => {
    for (const email of ["", "ana", "ana@", "@gmail.com", "ana@localhost", "ana@a..b"]) {
      expect(await checkEmail(email, { checkMx: false }), email).toEqual({ verdict: "invalid" });
    }
  });
});
