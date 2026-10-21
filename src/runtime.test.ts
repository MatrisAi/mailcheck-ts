import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { checkMx, type FetchLike } from "./mx.js";
import { suggest } from "./suggest.js";

/**
 * The package runs anywhere the web platform does (browsers, Node 18+, Deno,
 * Bun, Workers, edge runtimes): standard `fetch`, `Response`, `URL`,
 * `URLSearchParams` and `AbortSignal.timeout` only. These tests run under
 * plain Node (vitest's node environment) with no Workers globals.
 */
const SRC = new URL(".", import.meta.url).pathname;
const sources = readdirSync(SRC)
  .filter((name) => name.endsWith(".ts") && !name.endsWith(".test.ts"))
  .map((name) => ({ name, text: readFileSync(join(SRC, name), "utf8") }));

describe("runtime-agnostic", () => {
  it("runs with no Workers globals present", async () => {
    const g: Record<string, unknown> = globalThis as unknown as Record<string, unknown>;
    expect(g.WebSocketPair).toBeUndefined();
    expect(g.HTMLRewriter).toBeUndefined();
    expect(suggest("ana@gmial.com")?.domain).toBe("gmail.com");
    const fetchFn: FetchLike = async () => new Response(`{"Status":0,"Answer":[{"type":15,"TTL":60,"data":"10 mx.example.net."}]}`);
    expect((await checkMx("example.net", { fetch: fetchFn, cache: null })).kind).toBe("deliverable");
  });

  it("uses the global fetch when none is injected (Node 18+, browsers, Deno, Bun)", async () => {
    const original = globalThis.fetch;
    const asked: string[] = [];
    globalThis.fetch = (async (input: RequestInfo | URL) => {
      asked.push(String(input));
      return new Response(`{"Status":3}`);
    }) as typeof fetch;
    try {
      expect(await checkMx("nothing-here.example", { cache: null })).toEqual({ kind: "no_domain" });
    } finally {
      globalThis.fetch = original;
    }
    expect(asked[0]).toMatch(/^https:\/\/cloudflare-dns\.com\/dns-query\?name=nothing-here\.example&type=MX$/);
  });

  it("imports nothing runtime-specific", () => {
    for (const { name, text } of sources) {
      expect(text, name).not.toMatch(/from\s+["'](cloudflare:|node:|bun:|deno:)/);
      expect(text, name).not.toMatch(/\b(process\.env|Deno\.|Bun\.|require\()/);
    }
  });

  it("has no runtime dependency at all", () => {
    for (const { name, text } of sources) {
      for (const match of text.matchAll(/^(?:import|export)[^\n]*from\s+["']([^"']+)["']/gm)) {
        expect(match[1]?.startsWith("./"), `${name} imports ${match[1]}`).toBe(true);
      }
    }
  });
});
