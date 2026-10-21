import { describe, expect, it } from "vitest";
import { checkMx, isDefinitivelyUndeliverable, MxCache, negativeTtl, normalizeDomain, parseDohJson, parseMxData, type FetchLike, type MxCheck } from "./mx.js";

/**
 * LIVE payloads from https://cloudflare-dns.com/dns-query (accept:
 * application/dns-json), captured 2026-10-21 by scripts/verify-domains.mjs
 * and curl, byte for byte. No test here reaches the network.
 */
const LIVE = {
  "gmail.com MX": `{"Status":0,"TC":false,"RD":true,"RA":true,"AD":false,"CD":false,"Question":[{"name":"gmail.com","type":15}],"Answer":[{"name":"gmail.com","type":15,"TTL":2157,"data":"40 alt4.gmail-smtp-in.l.google.com."},{"name":"gmail.com","type":15,"TTL":2157,"data":"30 alt3.gmail-smtp-in.l.google.com."},{"name":"gmail.com","type":15,"TTL":2157,"data":"20 alt2.gmail-smtp-in.l.google.com."},{"name":"gmail.com","type":15,"TTL":2157,"data":"10 alt1.gmail-smtp-in.l.google.com."},{"name":"gmail.com","type":15,"TTL":2157,"data":"5 gmail-smtp-in.l.google.com."}]}`,
  "yaoo.com MX": `{"Status":0,"TC":false,"RD":true,"RA":true,"AD":false,"CD":false,"Question":[{"name":"yaoo.com","type":15}],"Authority":[{"name":"yaoo.com","type":6,"TTL":600,"data":"hidden-master.yahoo.com. hostmaster.yahoo-inc.com. 2024032701 28800 3600 1814400 600"}]}`,
  "yaoo.com A": `{"Status":0,"TC":false,"RD":true,"RA":true,"AD":false,"CD":false,"Question":[{"name":"yaoo.com","type":1}],"Answer":[{"name":"yaoo.com","type":1,"TTL":30,"data":"76.223.84.192"},{"name":"yaoo.com","type":1,"TTL":30,"data":"13.248.158.7"}]}`,
  "yaoo.com AAAA": `{"Status":0,"TC":false,"RD":true,"RA":true,"AD":false,"CD":false,"Question":[{"name":"yaoo.com","type":28}],"Authority":[{"name":"yaoo.com","type":6,"TTL":600,"data":"hidden-master.yahoo.com. hostmaster.yahoo-inc.com. 2024032701 28800 3600 1814400 600"}]}`,
  "gmail.ro MX": `{"Status":0,"TC":false,"RD":true,"RA":true,"AD":false,"CD":false,"Question":[{"name":"gmail.ro","type":15}],"Authority":[{"name":"gmail.ro","type":6,"TTL":60,"data":"ns1.google.com. dns-admin.google.com. 1002974787 900 900 1800 60"}]}`,
  "gmail.ro A": `{"Status":0,"TC":false,"RD":true,"RA":true,"AD":false,"CD":false,"Question":[{"name":"gmail.ro","type":1}],"Authority":[{"name":"gmail.ro","type":6,"TTL":17,"data":"ns1.google.com. dns-admin.google.com. 1002974787 900 900 1800 60"}]}`,
  "gmail.ro AAAA": `{"Status":0,"TC":false,"RD":true,"RA":true,"AD":false,"CD":false,"Question":[{"name":"gmail.ro","type":28}],"Authority":[{"name":"gmail.ro","type":6,"TTL":60,"data":"ns1.google.com. dns-admin.google.com. 1002974787 900 900 1800 60"}]}`,
  "gmail.de MX": `{"Status":0,"TC":false,"RD":true,"RA":true,"AD":false,"CD":false,"Question":[{"name":"gmail.de","type":15}],"Answer":[{"name":"gmail.de","type":15,"TTL":300,"data":"0 ."}]}`,
  "gmail.om MX": `{"Status":3,"TC":false,"RD":true,"RA":true,"AD":false,"CD":false,"Question":[{"name":"gmail.om","type":15}],"Authority":[{"name":"om","type":6,"TTL":3600,"data":"ns1.registry.om. dnsmanager.tra.gov.om. 1792583434 86400 7200 3600000 3600"}]}`,
  "charter.net MX": `{"Status":2,"TC":false,"RD":true,"RA":true,"AD":false,"CD":false,"Question":[{"name":"charter.net","type":15}],"Comment":["EDE(22): No Reachable Authority at delegation charter.net."]}`,
} as const;

type Reply = string | { status: number; body: string } | Error;

/** A resolver answering from a table keyed `"<name> <type>"`, recording what it was asked. */
function resolver(table: Record<string, Reply>) {
  const asked: string[] = [];
  const fetch: FetchLike = async (input, init) => {
    const url = new URL(input);
    expect(init.headers.accept).toBe("application/dns-json");
    const key = `${url.searchParams.get("name")} ${url.searchParams.get("type")}`;
    asked.push(key);
    const reply = table[key];
    if (reply === undefined) throw new Error(`unexpected query ${key}`);
    if (reply instanceof Error) throw reply;
    if (typeof reply === "string") return new Response(reply, { status: 200, headers: { "content-type": "application/dns-json" } });
    return new Response(reply.body, { status: reply.status });
  };
  return { fetch, asked };
}

const NOERROR_EMPTY = (name: string, type: number) => `{"Status":0,"Question":[{"name":"${name}","type":${type}}]}`;

describe("checkMx against live payload shapes", () => {
  it("an MX answer is deliverable, hosts in preference order", async () => {
    const { fetch, asked } = resolver({ "gmail.com MX": LIVE["gmail.com MX"] });
    const result = await checkMx("gmail.com", { fetch, cache: null });
    expect(result).toEqual({
      kind: "deliverable",
      via: "mx",
      hosts: ["gmail-smtp-in.l.google.com", "alt1.gmail-smtp-in.l.google.com", "alt2.gmail-smtp-in.l.google.com", "alt3.gmail-smtp-in.l.google.com", "alt4.gmail-smtp-in.l.google.com"],
    });
    // One question: an MX answer settles it.
    expect(asked).toEqual(["gmail.com MX"]);
  });

  it("no MX but an A record is deliverable through the implicit MX (RFC 5321 5.1): yaoo.com", async () => {
    const { fetch } = resolver({ "yaoo.com MX": LIVE["yaoo.com MX"], "yaoo.com A": LIVE["yaoo.com A"], "yaoo.com AAAA": LIVE["yaoo.com AAAA"] });
    expect(await checkMx("yaoo.com", { fetch, cache: null })).toEqual({ kind: "deliverable", via: "implicit", hosts: ["yaoo.com"] });
  });

  it("an AAAA record alone is enough for the implicit MX", async () => {
    const { fetch } = resolver({
      "v6only.example.net MX": NOERROR_EMPTY("v6only.example.net", 15),
      "v6only.example.net A": NOERROR_EMPTY("v6only.example.net", 1),
      "v6only.example.net AAAA": `{"Status":0,"Answer":[{"name":"v6only.example.net","type":28,"TTL":300,"data":"2001:db8::1"}]}`,
    });
    expect((await checkMx("v6only.example.net", { fetch, cache: null })).kind).toBe("deliverable");
  });

  it("NOERROR with no MX, A or AAAA is no_mail_host: gmail.ro", async () => {
    const { fetch } = resolver({ "gmail.ro MX": LIVE["gmail.ro MX"], "gmail.ro A": LIVE["gmail.ro A"], "gmail.ro AAAA": LIVE["gmail.ro AAAA"] });
    expect(await checkMx("gmail.ro", { fetch, cache: null })).toEqual({ kind: "no_mail_host" });
  });

  it("a lone `0 .` MX is the RFC 7505 null MX: gmail.de", async () => {
    const { fetch } = resolver({ "gmail.de MX": LIVE["gmail.de MX"] });
    expect(await checkMx("gmail.de", { fetch, cache: null })).toEqual({ kind: "null_mx" });
  });

  it("only the RFC 7505 shape is null_mx; other all-dot sets are no_mail_host, still refused", async () => {
    const shapes: Array<[string, string]> = [
      ["pref10.example.net", `{"Status":0,"Answer":[{"name":"pref10.example.net","type":15,"TTL":300,"data":"10 ."}]}`],
      ["twodots.example.net", `{"Status":0,"Answer":[{"name":"twodots.example.net","type":15,"TTL":300,"data":"0 ."},{"name":"twodots.example.net","type":15,"TTL":300,"data":"0 ."}]}`],
    ];
    for (const [name, body] of shapes) {
      const { fetch } = resolver({ [`${name} MX`]: body });
      const result = await checkMx(name, { fetch, cache: null });
      expect(result, name).toEqual({ kind: "no_mail_host" });
      expect(isDefinitivelyUndeliverable(result)).toBe(true);
    }
  });

  it("a null MX beside a real MX is not a refusal", async () => {
    const { fetch } = resolver({
      "mixed.example.net MX": `{"Status":0,"Answer":[{"name":"mixed.example.net","type":15,"TTL":300,"data":"0 ."},{"name":"mixed.example.net","type":15,"TTL":300,"data":"10 mx.mixed.example.net."}]}`,
    });
    expect(await checkMx("mixed.example.net", { fetch, cache: null })).toEqual({ kind: "deliverable", via: "mx", hosts: ["mx.mixed.example.net"] });
  });

  it("NXDOMAIN is no_domain: gmail.om", async () => {
    const { fetch } = resolver({ "gmail.om MX": LIVE["gmail.om MX"] });
    expect(await checkMx("gmail.om", { fetch, cache: null })).toEqual({ kind: "no_domain" });
  });

  it("SERVFAIL is unknown, never a refusal: charter.net, a real provider whose authority was unreachable", async () => {
    const { fetch } = resolver({ "charter.net MX": LIVE["charter.net MX"] });
    const result = await checkMx("charter.net", { fetch, cache: null });
    expect(result).toEqual({ kind: "unknown", reason: "servfail", status: 2 });
    expect(isDefinitivelyUndeliverable(result)).toBe(false);
  });

  it("REFUSED and other RCODEs are unknown", async () => {
    const { fetch } = resolver({ "refused.example.net MX": `{"Status":5}` });
    expect(await checkMx("refused.example.net", { fetch, cache: null })).toEqual({ kind: "unknown", reason: "dns_error", status: 5 });
  });

  it("an MX answer that follows a CNAME uses only the MX records", async () => {
    const { fetch } = resolver({
      "alias.example.net MX": `{"Status":0,"Answer":[{"name":"alias.example.net","type":5,"TTL":300,"data":"target.example.net."},{"name":"target.example.net","type":15,"TTL":120,"data":"10 mx.target.example.net."}]}`,
    });
    expect(await checkMx("alias.example.net", { fetch, cache: null })).toEqual({ kind: "deliverable", via: "mx", hosts: ["mx.target.example.net"] });
  });
});

/**
 * LIVE payloads from Google Public DNS's JSON API (https://dns.google/resolve),
 * 2026-10-21: the same fields as Cloudflare's, with names carrying a root dot
 * and `Comment` a string rather than an array. A drop-in `endpoint`.
 */
const GOOGLE = {
  "gmail.de MX": `{"Status":0,"TC":false,"RD":true,"RA":true,"AD":false,"CD":false,"Question":[{"name":"gmail.de.","type":15}],"Answer":[{"name":"gmail.de.","type":15,"TTL":72,"data":"0 ."}]}`,
  "gmail.ro MX": `{"Status":0,"TC":false,"RD":true,"RA":true,"AD":false,"CD":false,"Question":[{"name":"gmail.ro.","type":15}],"Authority":[{"name":"gmail.ro.","type":6,"TTL":60,"data":"ns1.google.com. dns-admin.google.com. 1002974787 900 900 1800 60"}],"Comment":"Response from 216.239.38.10."}`,
  "gmail.om MX": `{"Status":3,"TC":false,"RD":true,"RA":true,"AD":false,"CD":false,"Question":[{"name":"gmail.om.","type":15}],"Authority":[{"name":"om.","type":6,"TTL":1741,"data":"ns1.registry.om. dnsmanager.tra.gov.om. 1792583434 86400 7200 3600000 3600"}]}`,
  "yaoo.com A": `{"Status":0,"TC":false,"RD":true,"RA":true,"AD":false,"CD":false,"Question":[{"name":"yaoo.com.","type":1}],"Answer":[{"name":"yaoo.com.","type":1,"TTL":30,"data":"13.248.158.7"},{"name":"yaoo.com.","type":1,"TTL":30,"data":"76.223.84.192"}],"Comment":"Response from 98.139.24.68."}`,
} as const;

describe("checkMx against Google Public DNS (endpoint https://dns.google/resolve)", () => {
  const endpoint = "https://dns.google/resolve";
  const google = (table: Record<string, string>): FetchLike => async (input) => {
    const url = new URL(input);
    expect(`${url.origin}${url.pathname}`).toBe(endpoint);
    const reply = table[`${url.searchParams.get("name")} ${url.searchParams.get("type")}`];
    if (reply === undefined) throw new Error(`unexpected ${input}`);
    return new Response(reply, { status: 200 });
  };
  it("reads the same verdicts from Google's shape", async () => {
    expect(await checkMx("gmail.de", { endpoint, fetch: google(GOOGLE), cache: null })).toEqual({ kind: "null_mx" });
    expect(await checkMx("gmail.om", { endpoint, fetch: google(GOOGLE), cache: null })).toEqual({ kind: "no_domain" });
    expect(
      await checkMx("gmail.ro", {
        endpoint,
        fetch: google({ ...GOOGLE, "gmail.ro A": GOOGLE["gmail.ro MX"].replace('"type":15}]', '"type":1}]'), "gmail.ro AAAA": GOOGLE["gmail.ro MX"] }),
        cache: null,
      }),
    ).toEqual({ kind: "no_mail_host" });
    expect(
      await checkMx("yaoo.com", {
        endpoint,
        fetch: google({ "yaoo.com MX": `{"Status":0,"Question":[{"name":"yaoo.com.","type":15}]}`, "yaoo.com A": GOOGLE["yaoo.com A"], "yaoo.com AAAA": `{"Status":0}` }),
        cache: null,
      }),
    ).toEqual({ kind: "deliverable", via: "implicit", hosts: ["yaoo.com"] });
  });
});

describe("checkMx fails open", () => {
  const cases: Array<[string, Reply, MxCheck]> = [
    ["a network error", new TypeError("fetch failed"), { kind: "unknown", reason: "network" }],
    ["a timeout", Object.assign(new Error("timed out"), { name: "TimeoutError" }), { kind: "unknown", reason: "timeout" }],
    ["an HTTP 503", { status: 503, body: "busy" }, { kind: "unknown", reason: "http_status", status: 503 }],
    ["an HTTP 400 error object", { status: 400, body: `{"error":"Invalid query name"}` }, { kind: "unknown", reason: "http_status", status: 400 }],
    ["a body that is not JSON", "<html>captive portal</html>", { kind: "unknown", reason: "bad_response" }],
    ["JSON without a Status", `{"Answer":[]}`, { kind: "unknown", reason: "bad_response" }],
    ["a Status that is not a number", `{"Status":"0"}`, { kind: "unknown", reason: "bad_response" }],
    ["an Answer that is not an array", `{"Status":0,"Answer":{"type":15}}`, { kind: "unknown", reason: "bad_response" }],
    ["a record without data", `{"Status":0,"Answer":[{"type":15,"TTL":1}]}`, { kind: "unknown", reason: "bad_response" }],
    ["an MX record whose data is not `pref host`", `{"Status":0,"Answer":[{"type":15,"TTL":1,"data":"mx.example.net."}]}`, { kind: "unknown", reason: "bad_response" }],
    ["JSON null", "null", { kind: "unknown", reason: "bad_response" }],
    ["a JSON array", "[]", { kind: "unknown", reason: "bad_response" }],
  ];
  for (const [name, reply, expected] of cases) {
    it(`${name} is unknown`, async () => {
      const { fetch } = resolver({ "flaky.example.net MX": reply });
      const result = await checkMx("flaky.example.net", { fetch, cache: null });
      expect(result).toEqual(expected);
      expect(isDefinitivelyUndeliverable(result)).toBe(false);
    });
  }

  it("a timeout during the address queries is unknown, never no_mail_host", async () => {
    const { fetch } = resolver({
      "slow.example.net MX": NOERROR_EMPTY("slow.example.net", 15),
      "slow.example.net A": Object.assign(new Error("aborted"), { name: "AbortError" }),
      "slow.example.net AAAA": NOERROR_EMPTY("slow.example.net", 28),
    });
    expect(await checkMx("slow.example.net", { fetch, cache: null })).toEqual({ kind: "unknown", reason: "timeout" });
  });

  it("SERVFAIL on the A query is unknown even when AAAA is empty", async () => {
    const { fetch } = resolver({
      "half.example.net MX": NOERROR_EMPTY("half.example.net", 15),
      "half.example.net A": `{"Status":2}`,
      "half.example.net AAAA": NOERROR_EMPTY("half.example.net", 28),
    });
    expect(await checkMx("half.example.net", { fetch, cache: null })).toEqual({ kind: "unknown", reason: "servfail", status: 2 });
  });

  it("NXDOMAIN on A after NOERROR on MX is an inconsistent picture, unknown", async () => {
    const { fetch } = resolver({
      "race.example.net MX": NOERROR_EMPTY("race.example.net", 15),
      "race.example.net A": `{"Status":3}`,
      "race.example.net AAAA": NOERROR_EMPTY("race.example.net", 28),
    });
    expect((await checkMx("race.example.net", { fetch, cache: null })).kind).toBe("unknown");
  });

  it("a real timeout budget aborts a resolver that never answers", async () => {
    const hanging: FetchLike = (_input, init) =>
      new Promise((_resolve, reject) => {
        init.signal.addEventListener("abort", () => reject(init.signal.reason));
      });
    expect(await checkMx("hang.example.net", { fetch: hanging, timeoutMs: 20, cache: null })).toEqual({ kind: "unknown", reason: "timeout" });
  });

  it("a malformed domain is unknown without asking anybody", async () => {
    const { fetch, asked } = resolver({});
    for (const bad of ["", "localhost", "a..b.com", "-bad.com", "192.168.0.1", "x".repeat(64) + ".com", "sp ace.com"]) {
      expect(await checkMx(bad, { fetch, cache: null })).toEqual({ kind: "unknown", reason: "invalid_domain" });
    }
    expect(asked).toEqual([]);
  });
});

describe("caching", () => {
  it("reuses a positive answer for its TTL, capped, and asks again after", async () => {
    let clock = 1_000_000;
    const cache = new MxCache();
    const { fetch, asked } = resolver({ "gmail.com MX": LIVE["gmail.com MX"] });
    await checkMx("gmail.com", { fetch, cache, now: () => clock });
    await checkMx("GMAIL.com.", { fetch, cache, now: () => clock });
    expect(asked).toHaveLength(1);
    // TTL 2157 s is capped at 600 s.
    clock += 599_000;
    await checkMx("gmail.com", { fetch, cache, now: () => clock });
    expect(asked).toHaveLength(1);
    clock += 2_000;
    await checkMx("gmail.com", { fetch, cache, now: () => clock });
    expect(asked).toHaveLength(2);
  });

  it("keeps a negative answer no longer than the SOA negative TTL (RFC 2308)", async () => {
    let clock = 0;
    const cache = new MxCache();
    const { fetch, asked } = resolver({ "gmail.ro MX": LIVE["gmail.ro MX"], "gmail.ro A": LIVE["gmail.ro A"], "gmail.ro AAAA": LIVE["gmail.ro AAAA"] });
    await checkMx("gmail.ro", { fetch, cache, now: () => clock });
    clock += 59_000;
    await checkMx("gmail.ro", { fetch, cache, now: () => clock });
    expect(asked).toHaveLength(3);
    // SOA TTL 60, MINIMUM 60: gone after a minute.
    clock += 2_000;
    await checkMx("gmail.ro", { fetch, cache, now: () => clock });
    expect(asked).toHaveLength(6);
  });

  it("caps a long negative TTL: gmail.om's SOA says an hour, the cache keeps five minutes", () => {
    const parsed = parseDohJson(JSON.parse(LIVE["gmail.om MX"]));
    expect(parsed && negativeTtl(parsed.authority)).toBe(300);
  });

  it("never caches unknown", async () => {
    const cache = new MxCache();
    const { fetch, asked } = resolver({ "charter.net MX": LIVE["charter.net MX"] });
    await checkMx("charter.net", { fetch, cache });
    await checkMx("charter.net", { fetch, cache });
    expect(asked).toHaveLength(2);
    expect(cache.size).toBe(0);
  });

  it("evicts the oldest entry past its size", () => {
    const cache = new MxCache(2);
    cache.set("a.com", { kind: "no_domain" }, 60, 0);
    cache.set("b.com", { kind: "no_domain" }, 60, 0);
    cache.set("c.com", { kind: "no_domain" }, 60, 0);
    expect(cache.get("a.com", 0)).toBeNull();
    expect(cache.get("c.com", 0)).toEqual({ kind: "no_domain" });
  });
});

describe("pieces", () => {
  it("isDefinitivelyUndeliverable refuses only the three definitive negatives", () => {
    expect(isDefinitivelyUndeliverable({ kind: "null_mx" })).toBe(true);
    expect(isDefinitivelyUndeliverable({ kind: "no_domain" })).toBe(true);
    expect(isDefinitivelyUndeliverable({ kind: "no_mail_host" })).toBe(true);
    expect(isDefinitivelyUndeliverable({ kind: "deliverable", via: "mx", hosts: [] })).toBe(false);
    expect(isDefinitivelyUndeliverable({ kind: "unknown", reason: "network" })).toBe(false);
    // A kind from a newer build: never a refusal.
    expect(isDefinitivelyUndeliverable(JSON.parse(`{"kind":"something_new"}`))).toBe(false);
  });

  it("parses MX data", () => {
    expect(parseMxData("10 mx.Example.net.")).toEqual({ preference: 10, exchange: "mx.example.net" });
    expect(parseMxData("0 .")).toEqual({ preference: 0, exchange: "." });
    expect(parseMxData("70000 mx.example.net.")).toBeNull();
    expect(parseMxData("mx.example.net.")).toBeNull();
  });

  it("normalizes a domain", () => {
    expect(normalizeDomain(" Gmail.COM. ")).toBe("gmail.com");
    expect(normalizeDomain("xn--bcher-kva.example")).toBe("xn--bcher-kva.example");
    expect(normalizeDomain("bücher.example")).toBeNull();
  });
});
