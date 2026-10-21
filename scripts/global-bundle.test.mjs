import { createContext, runInContext } from "node:vm";
import { beforeAll, describe, expect, it } from "vitest";
import { bundleGlobal, GLOBAL_NAME } from "./bundle-global.mjs";

/**
 * The classic-script bundle, built in memory with the exact configuration
 * that ships and evaluated as a page would run `<script src>`: a fresh global
 * with only the web APIs it uses (`AbortSignal`, `Response`, `URL`,
 * `URLSearchParams`) and the page's own `fetch` stub.
 */
let code = "";
let page;

beforeAll(async () => {
  code = await bundleGlobal({ write: false });
  page = createContext({ AbortSignal, Response, URL, URLSearchParams });
  const before = new Set(Object.getOwnPropertyNames(runInContext("globalThis", page)));
  runInContext(code, page, { filename: "mailcheck.global.js" });
  page.added = Object.getOwnPropertyNames(runInContext("globalThis", page)).filter((k) => !before.has(k));
}, 30_000);

describe("dist/mailcheck.global.js", () => {
  it(`defines window.${GLOBAL_NAME} and nothing else`, () => {
    expect(page.added).toEqual([GLOBAL_NAME]);
    expect(runInContext(`typeof ${GLOBAL_NAME}`, page)).toBe("object");
    expect(runInContext(`Object.keys(${GLOBAL_NAME}).sort().join(",")`, page)).toBe(
      "Mailcheck,checkMx,isDefinitivelyUndeliverable,run,suggest,suggestDomain",
    );
  });

  it("suggests a correction", () => {
    expect(runInContext(`${GLOBAL_NAME}.suggest("ana@gmial.com").address`, page)).toBe("ana@gmail.com");
    expect(runInContext(`${GLOBAL_NAME}.suggest("ana@gmail.com")`, page)).toBeNull();
  });

  it("keeps mailcheck's run() contract, for pages migrating from mailcheck", () => {
    const out = runInContext(
      `${GLOBAL_NAME}.run({ email: "ana@hotmial.com", suggested: (s) => "did you mean " + s.full, empty: () => "none" })`,
      page,
    );
    expect(out).toBe("did you mean ana@hotmail.com");
    expect(runInContext(`${GLOBAL_NAME}.Mailcheck.run({ email: "ana@gmail.com", empty: () => "none" })`, page)).toBe("none");
    expect(runInContext(`typeof ${GLOBAL_NAME}.Mailcheck.suggest`, page)).toBe("function");
  });

  it("checks MX with the page's fetch", async () => {
    runInContext(
      `globalThis.fetch = async () => new Response('{"Status":0,"Answer":[{"type":15,"TTL":60,"data":"10 mx.example.net."}]}')`,
      page,
    );
    const result = await runInContext(`${GLOBAL_NAME}.checkMx("example.net", { cache: null })`, page);
    expect(result.kind).toBe("deliverable");
  });

  it("leaves out the disposable list, carries no source map and stays small", () => {
    expect(code).not.toMatch(/isDisposable|mailinator/);
    // Built from parts so this file passes the leak scan's own rule.
    expect(code).not.toMatch(new RegExp(["source", "MappingURL|sources", "Content"].join("")));
    expect(Buffer.byteLength(code)).toBeLessThan(40_000);
    expect(code.startsWith("/*! mailcheck-ts ")).toBe(true);
  });
});
