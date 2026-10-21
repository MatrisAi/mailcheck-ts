/**
 * The rules shared by scripts/leak-scan.mjs (the source tree) and
 * scripts/pack-check.mjs (the real tarball): what may be published, and what
 * must never appear in a published or public file.
 *
 * Why so strict: a published package is permanent. A source map shipped by
 * mistake exposes the whole original source and can point at private
 * storage; a stray internal name, path or key is just as hard to take back.
 * So the tarball is checked against an exact allowlist, and every file in it
 * (and in the source tree) is scanned for the patterns below.
 *
 * Patterns that name the private origin are assembled from parts, so this
 * file itself never contains the word it looks for.
 */

const word = (...parts) => parts.join("");
const ORIGIN = word("mat", "ris");
const NEUTRAL_HOST = word("store", "cloud");

/** Exactly what a tarball may contain. Anything missing or extra fails the check. */
export const EXPECTED_PACK_FILES = [
  "LICENSE",
  "NOTICE",
  "README.md",
  "package.json",
  ...["check", "disposable", "disposable-list", "disposable-policy", "distance", "index", "mailcheck-compat", "mx", "providers", "suggest", "tlds"].flatMap(
    (name) => [`dist/${name}.d.ts`, `dist/${name}.js`],
  ),
].sort();

/** Size caps: the disposable list is ~145 KB of text, about 90 KB packed in total; anything far past that is an accident. */
export const MAX_PACKED_BYTES = 150_000;
export const MAX_UNPACKED_BYTES = 400_000;

/** File names that must never be published, whatever the allowlist says. */
const FORBIDDEN_NAMES = [
  { re: /\.map$/i, why: "a source map" },
  { re: /\.(test|spec)\.[cm]?[jt]s$/i, why: "a test" },
  { re: /(^|\/)(scripts|src|test|tests|fixtures|__fixtures__|coverage)\//i, why: "a non-dist folder" },
  { re: /(^|\/)\.[^/]+$/, why: "a dotfile" },
  { re: /(^|\/)\.env/i, why: "an env file" },
  { re: /\.(pem|key|p12|pfx|crt|cer|der|keystore|jks)$/i, why: "a key or certificate" },
  { re: /\.(zip|tgz|tar|gz)$/i, why: "an archive" },
];

/** True for a `.ts` path that is not a declaration file. */
function isTsSource(path) {
  return /\.ts$/i.test(path) && !/\.d\.ts$/i.test(path);
}

export function forbiddenName(path) {
  if (isTsSource(path)) return "TypeScript source (only .d.ts may ship)";
  for (const { re, why } of FORBIDDEN_NAMES) {
    if (re.test(path)) return why;
  }
  return null;
}

/** Content patterns, each with a reason. */
const CONTENT_RULES = [
  { re: new RegExp(ORIGIN, "i"), why: "the private origin's name" },
  { re: new RegExp(NEUTRAL_HOST, "i"), why: "a private brand name" },
  { re: new RegExp(`${word("source", "MappingURL")}|${word("sources", "Content")}`), why: "source map material" },
  { re: /\br2\.dev\b|r2\.cloudflarestorage\.com/i, why: "an object-storage URL" },
  { re: /\.workers\.dev\b/i, why: "a Workers preview hostname" },
  { re: /\/Users\/[A-Za-z]|\/home\/[a-z][a-z0-9_-]*\/|[A-Z]:\\\\Users\\\\/, why: "an absolute local path" },
  { re: /(\.\.\/){2,}/, why: "a path that leaves the package" },
  { re: /\b(services|apps|engines|workflows|consumers|plugins)\/[a-z0-9-]+\//, why: "a path into a private repository" },
  { re: /\bdocs\/rules\b|CLAUDE\.md/, why: "a private repository document" },
  { re: /\bsk-[A-Za-z0-9_-]{20,}/, why: "an API key" },
  { re: /\bAKIA[0-9A-Z]{16}\b/, why: "an AWS access key" },
  { re: /-----BEGIN [A-Z ]*PRIVATE KEY-----/, why: "a private key" },
  { re: /\b(ghp|gho|ghs|ghu)_[A-Za-z0-9]{30,}|github_pat_[A-Za-z0-9_]{20,}/, why: "a GitHub token" },
  { re: /\bnpm_[A-Za-z0-9]{36}\b/, why: "an npm token" },
  { re: /\bxox[abpr]-[A-Za-z0-9-]{10,}/, why: "a Slack token" },
  { re: /\bAIza[0-9A-Za-z_-]{35}\b/, why: "a Google API key" },
  { re: /\beyJ[A-Za-z0-9_-]{15,}\.[A-Za-z0-9_-]{15,}\.[A-Za-z0-9_-]{10,}/, why: "a JWT" },
];

/** This package's own repository, the only URL allowed to name the origin. */
const REPO = `https://github\\.com/${ORIGIN}Ai/mailcheck-ts`;

/**
 * Lines allowed to name the origin, and only in these files: the copyright
 * holder in LICENSE and NOTICE, and the author, homepage, repository and bugs
 * fields of package.json, each matched as a whole line (as written in the
 * source, and as pnpm writes the manifest into the tarball).
 */
const ALLOWED_LINES = [
  { file: /^(LICENSE|NOTICE)$/, line: new RegExp(`^Copyright \\(c\\) \\d{4}(-\\d{4})? ${ORIGIN}AI\\.?( MIT License \\(see LICENSE\\)\\.)?$`, "i") },
  { file: /^package\.json$/, line: new RegExp(`^"author": "${ORIGIN}AI",?$`, "i") },
  { file: /^package\.json$/, line: new RegExp(`^"homepage": "${REPO}#readme",?$`, "i") },
  { file: /^package\.json$/, line: new RegExp(`^"url": "git\\+${REPO}\\.git",?$`, "i") },
  { file: /^package\.json$/, line: new RegExp(`^"url": "${REPO}/issues",?$`, "i") },
];

/**
 * Findings for one file's text: `[{ line, why, excerpt }]`. `extraAllowed`
 * lets a caller accept a further known line in a known file.
 */
export function scanText(path, text, extraAllowed = []) {
  const findings = [];
  const allowed = [...ALLOWED_LINES, ...extraAllowed];
  const lines = text.split(/\r?\n/);
  for (const [index, line] of lines.entries()) {
    for (const { re, why } of CONTENT_RULES) {
      if (!re.test(line)) continue;
      if (allowed.some((a) => a.file.test(path) && a.line.test(line.trim()))) continue;
      findings.push({ path, line: index + 1, why, excerpt: line.trim().slice(0, 120) });
    }
  }
  return findings;
}

/** Compare a tarball's file list with the allowlist; problems as strings. */
export function checkFileList(files) {
  const problems = [];
  const sorted = [...files].sort();
  for (const path of sorted) {
    const why = forbiddenName(path);
    if (why) problems.push(`${path}: ${why}`);
    if (!EXPECTED_PACK_FILES.includes(path)) problems.push(`${path}: not in the allowlist`);
  }
  for (const path of EXPECTED_PACK_FILES) if (!sorted.includes(path)) problems.push(`${path}: missing from the pack`);
  return problems;
}
