import { describe, expect, it } from "vitest";
import { checkFileList, EXPECTED_PACK_FILES, scanText } from "./pack-rules.mjs";

const word = (...parts) => parts.join("");

describe("pack-check rules", () => {
  it("accepts exactly the allowlist", () => {
    expect(checkFileList(EXPECTED_PACK_FILES)).toEqual([]);
  });

  it("fails on a source map, TypeScript source, a test, a dotfile, an env file and a key", () => {
    const bad = [...EXPECTED_PACK_FILES, "dist/index.js.map", "src/index.ts", "dist/mx.test.js", ".npmrc", ".env.local", "dist/server.pem"];
    const problems = checkFileList(bad);
    for (const path of ["dist/index.js.map", "src/index.ts", "dist/mx.test.js", ".npmrc", ".env.local", "dist/server.pem"]) {
      expect(problems.some((p) => p.startsWith(`${path}:`)), path).toBe(true);
    }
    expect(problems.find((p) => p.startsWith("dist/index.js.map:"))).toContain("source map");
  });

  it("fails when an allowlisted file is missing", () => {
    expect(checkFileList(EXPECTED_PACK_FILES.filter((f) => f !== "LICENSE"))).toContain("LICENSE: missing from the pack");
  });

  it("finds the private name, map material, bucket URLs, local paths and secrets in contents", () => {
    const lines = [
      `const host = "app.${word("mat", "ris")}.ai";`,
      `//# ${word("source", "MappingURL")}=index.js.map`,
      `"${word("sources", "Content")}": []`,
      `fetch('https://pub-123.${word("r2", ".dev")}/source.zip')`,
      `https://acct.${word("r2.cloudflare", "storage.com")}/bucket`,
      `${word("/Use", "rs/")}someone/project/src/index.ts`,
      `${word("../", "../")}${word("serv", "ices/")}backend/src/x.ts`,
      `token ${word("sk-", "abcdefghijklmnopqrstuvwxyz012345")}`,
      `${word("AKIA", "ABCDEFGHIJKLMNOP")}`,
      `-----BEGIN RSA ${word("PRIVATE", " KEY")}-----`,
    ];
    const findings = scanText("dist/index.js", lines.join("\n"));
    expect(new Set(findings.map((f) => f.line))).toEqual(new Set(lines.map((_, i) => i + 1)));
  });

  it("allows the copyright line in LICENSE and NOTICE only", () => {
    const line = `Copyright (c) 2026 ${word("Mat", "ris")}AI`;
    expect(scanText("LICENSE", line)).toEqual([]);
    expect(scanText("NOTICE", line)).toEqual([]);
    expect(scanText("dist/index.js", line)).toHaveLength(1);
  });

  it("allows the package's own author, homepage, repository and bugs lines in package.json only", () => {
    const org = word("Mat", "risAi");
    const lines = [
      `"author": "${word("Mat", "risAI")}",`,
      `"homepage": "https://github.com/${org}/mailcheck-ts#readme",`,
      `"url": "git+https://github.com/${org}/mailcheck-ts.git"`,
      `"url": "https://github.com/${org}/mailcheck-ts/issues"`,
    ];
    expect(scanText("package.json", lines.join("\n"))).toEqual([]);
    expect(scanText("README.md", lines.join("\n"))).toHaveLength(lines.length);
    // Another repository, a scoped name or a host of the origin stays a finding.
    const others = [
      `"name": "@${word("mat", "ris")}/mailcheck-ts",`,
      `"url": "https://github.com/${org}/other-repo"`,
      `"homepage": "https://app.${word("mat", "ris")}.ai",`,
    ];
    expect(scanText("package.json", others.join("\n"))).toHaveLength(others.length);
  });

  it("allows the CI badge of this repository in README.md only", () => {
    const repo = `https://github.com/${word("Mat", "risAi")}/mailcheck-ts`;
    const badge = `[![CI](${repo}/actions/workflows/ci.yml/badge.svg)](${repo}/actions/workflows/ci.yml)`;
    expect(scanText("README.md", badge)).toEqual([]);
    expect(scanText("dist/index.js", badge)).toHaveLength(1);
    // Anything else on the line, or another repository, stays a finding.
    expect(scanText("README.md", `${badge} see ${repo}/issues`)).toHaveLength(1);
    const other = `https://github.com/${word("Mat", "risAi")}/other-repo`;
    expect(scanText("README.md", `[![CI](${other}/actions/workflows/ci.yml/badge.svg)](${other}/actions/workflows/ci.yml)`)).toHaveLength(1);
  });

  it("passes clean library code", () => {
    expect(scanText("dist/suggest.js", 'export function suggest(email) { return email.split("@"); }')).toEqual([]);
  });
});
