#!/usr/bin/env node
/**
 * Live check of every curated domain, run by hand before a list changes.
 * Never in CI and never in a repo-wide check: it asks the public DNS (through
 * the same DoH call `checkMx` makes) and the answer moves over time.
 *
 * It sends no email and opens no SMTP connection. It only asks DNS.
 *
 *   pnpm run verify-domains                 every curated domain
 *   pnpm run verify-domains extra.com ...   plus the named ones
 *   pnpm run verify-domains --neighbours    plus the false-positive sweep below
 *   pnpm run verify-domains --neighbours --review   and list every `review` row
 *   pnpm run verify-domains --json          the raw answers, for pinning in tests
 *
 * Exit 1 when a provider is not `deliverable`, a lookalike IS deliverable
 * (the two rules at the top of src/providers.ts), or the sweep flags a
 * domain nobody has reviewed. An `unknown` answer is reported and never
 * fails the run: retry it.
 *
 * The false-positive sweep (`--neighbours`): `suggest()` may rewrite a domain
 * that is somebody's real mail domain (`grail.com` is one edit from
 * `gmail.com`). The sweep finds every domain `suggest()` would rewrite among
 *   - a seed of real-world domains: the Tranco top-sites list
 *     (https://tranco-list.eu, downloaded at run time and never committed;
 *     `--seed <file>` uses a local list instead, one domain per line), and
 *   - the generated one-edit neighbours of every provider (a dropped,
 *     doubled or swapped character, and a neighbouring key: the typos people
 *     make),
 * asks DNS about each, and sorts every one that publishes its own MX:
 *   - `typo catcher`: an MX host in `TYPO_CATCHER_MX` (parking services and
 *     mail catchers, each seen serving dozens of provider typos);
 *   - `provider-owned`: the MX is the provider's own (Google's for a gmail
 *     typo), a defensive registration;
 *   - `FLAG` (fails the run): a real-world SEED site with mail of its own.
 *     Review it into `NOT_TYPOS` (a real business: never rewritten) or
 *     `REVIEWED_TYPO_DOMAINS` (a squatter: the hint stays), or tighten
 *     `suggest()`;
 *   - `review` (reported, does not fail): a GENERATED typo that is not a
 *     top site and has an MX on a general host. Usually a squatter; listed so
 *     a catcher can be recognised by how many it serves.
 * The hint never blocks in any case; this keeps it from nagging a real person.
 *
 * The TypeScript sources are loaded with jiti, the way the bundlers resolve
 * them (extensionless relative imports); Node's own type stripping cannot.
 */
import { readFileSync } from "node:fs";
import { createJiti } from "jiti";

const jiti = createJiti(import.meta.url);
const { checkMx } = await jiti.import(new URL("../src/mx.ts", import.meta.url).href);
const { suggestDomain } = await jiti.import(new URL("../src/suggest.ts", import.meta.url).href);
const { PROVIDER_DOMAINS, LOOKALIKE_DOMAINS, NOT_TYPOS, REVIEWED_TYPO_DOMAINS, TYPO_CATCHER_MX } = await jiti.import(
  new URL("../src/providers.ts", import.meta.url).href,
);

const args = process.argv.slice(2);
const json = args.includes("--json");
const neighbours = args.includes("--neighbours");
/** Also print every generated `review` row, not only their count. */
const reviewAll = args.includes("--review");
const seedIndex = args.indexOf("--seed");
const seedFile = seedIndex >= 0 ? args[seedIndex + 1] : null;
const extra = args.filter((arg, i) => !arg.startsWith("--") && !(seedIndex >= 0 && i === seedIndex + 1));

/** Captures every raw DoH answer so `--json` can print what the live resolver said. */
const raw = new Map();
const recordingFetch = async (url, init) => {
  const response = await fetch(url, init);
  if (json) {
    const body = await response.clone().text();
    const params = new URL(url).searchParams;
    raw.set(`${params.get("name")} ${params.get("type")}`, { status: response.status, body });
  }
  return response;
};

async function run(domain) {
  // One retry on `unknown`: a transient failure is not an answer about the domain.
  let result = await checkMx(domain, { fetch: recordingFetch, timeoutMs: 5000, cache: null });
  if (result.kind === "unknown") result = await checkMx(domain, { fetch: recordingFetch, timeoutMs: 8000, cache: null });
  return result;
}

async function checkAll(rows, concurrency) {
  const out = [];
  for (let i = 0; i < rows.length; i += concurrency) {
    const batch = rows.slice(i, i + concurrency);
    out.push(...(await Promise.all(batch.map(async (row) => ({ ...row, result: await run(row.domain) })))));
  }
  return out;
}

function detailOf(result) {
  if (result.kind === "deliverable") return `${result.via}: ${result.hosts.slice(0, 2).join(", ")}${result.hosts.length > 2 ? ", ..." : ""}`;
  if (result.kind === "unknown") return `${result.reason}${result.status !== undefined ? ` ${result.status}` : ""}`;
  return "";
}

// ---------------------------------------------------------------------------
// The curated lists.

const rows = [
  ...PROVIDER_DOMAINS.map((domain) => ({ domain, role: "provider" })),
  ...NOT_TYPOS.filter((domain) => !PROVIDER_DOMAINS.includes(domain)).map((domain) => ({ domain, role: "not-typo" })),
  ...Object.keys(LOOKALIKE_DOMAINS).map((domain) => ({ domain, role: "lookalike" })),
  ...extra.map((domain) => ({ domain, role: "extra" })),
];

let failures = 0;
const lines = [];
const curated = await checkAll(rows, 8);
for (const { domain, role, result } of curated) {
  const kind = result.kind;
  let verdict = "ok";
  if ((role === "provider" || role === "not-typo") && kind !== "deliverable") verdict = kind === "unknown" ? "RETRY" : "REMOVE";
  if (role === "lookalike" && kind === "deliverable") verdict = "REMOVE";
  if (role === "lookalike" && kind === "unknown") verdict = "RETRY";
  if (verdict === "REMOVE") failures += 1;
  lines.push(`| ${domain} | ${role} | ${kind} | ${detailOf(result)} | ${verdict} |`);
}

// ---------------------------------------------------------------------------
// The false-positive sweep.

const QWERTY_ROWS = ["1234567890-", "qwertyuiop", "asdfghjkl", "zxcvbnm"];
const ADJACENT = new Map();
for (const [r, row] of QWERTY_ROWS.entries()) {
  for (const [c, ch] of [...row].entries()) {
    const near = new Set([row[c - 1], row[c + 1], QWERTY_ROWS[r - 1]?.[c], QWERTY_ROWS[r - 1]?.[c + 1], QWERTY_ROWS[r + 1]?.[c], QWERTY_ROWS[r + 1]?.[c - 1]]);
    near.delete(undefined);
    ADJACENT.set(ch, [...near]);
  }
}

/** One-edit neighbours of a provider's first label: dropped, doubled, swapped and neighbouring-key characters. */
function generatedNeighbours(provider) {
  const dot = provider.indexOf(".");
  const label = provider.slice(0, dot);
  const rest = provider.slice(dot);
  const out = new Set();
  for (let i = 0; i < label.length; i += 1) {
    out.add(label.slice(0, i) + label.slice(i + 1));
    out.add(label.slice(0, i) + label[i] + label.slice(i));
    if (i + 1 < label.length) out.add(label.slice(0, i) + label[i + 1] + label[i] + label.slice(i + 2));
    for (const key of ADJACENT.get(label[i]) ?? []) out.add(label.slice(0, i) + key + label.slice(i + 1));
  }
  out.delete(label);
  return [...out].filter((l) => /^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/.test(l)).map((l) => l + rest);
}

async function seedDomains() {
  if (seedFile) return readFileSync(seedFile, "utf8").split("\n").map((l) => l.trim().toLowerCase()).filter(Boolean);
  const idResponse = await fetch("https://tranco-list.eu/top-1m-id");
  if (!idResponse.ok) throw new Error(`tranco id: HTTP ${idResponse.status}`);
  const id = (await idResponse.text()).trim();
  const listResponse = await fetch(`https://tranco-list.eu/download/${encodeURIComponent(id)}/1000000`);
  if (!listResponse.ok) throw new Error(`tranco list ${id}: HTTP ${listResponse.status}`);
  seedLabel = `Tranco list ${id} (top 1M)`;
  return (await listResponse.text()).split("\n").map((l) => (l.split(",")[1] ?? "").trim().toLowerCase()).filter(Boolean);
}

let seedLabel = seedFile ? `seed file ${seedFile}` : "";
const sweepLines = [];
let sweepSummary = "";
if (neighbours) {
  const candidates = new Map();
  const seed = await seedDomains();
  for (const domain of seed) {
    const fixed = suggestDomain(domain);
    if (fixed && fixed.reason !== "lookalike") candidates.set(domain, { to: fixed.domain, source: "seed" });
  }
  let generated = 0;
  for (const provider of PROVIDER_DOMAINS) {
    for (const domain of generatedNeighbours(provider)) {
      generated += 1;
      if (candidates.has(domain)) continue;
      const fixed = suggestDomain(domain);
      if (fixed && fixed.reason !== "lookalike") candidates.set(domain, { to: fixed.domain, source: "generated" });
    }
  }
  const checked = await checkAll([...candidates.entries()].map(([domain, c]) => ({ domain, ...c })), 16);
  const counts = { flagged: 0, review: 0, reviewedTypo: 0, catcher: 0, defensive: 0, noHost: 0, implicit: 0, refusable: 0, unknown: 0 };
  /** The last two labels: close enough to "who runs this mail host" for grouping. */
  const ownerOf = (host) => host.split(".").slice(-2).join(".");
  const isCatcher = (host) => TYPO_CATCHER_MX.some((suffix) => host === suffix || host.endsWith(`.${suffix}`));
  // A provider's own mail hosts, from the curated run: a typo of gmail.com whose
  // MX is Google's is Google's defensive registration, not somebody's business.
  const providerOwners = new Map();
  for (const { domain, result } of curated) {
    if (result.kind === "deliverable") providerOwners.set(domain, new Set(result.hosts.map(ownerOf)));
  }
  const unlistedHosts = new Map();
  for (const { domain, to, source, result } of checked) {
    let verdict;
    if (result.kind === "deliverable" && result.via === "mx") {
      const owners = new Set(result.hosts.map(ownerOf));
      if (result.hosts.some((host) => host === "localhost" || host.startsWith("localhost.") || !host.includes("."))) {
        // `10 localhost.` and the like: an MX that names no real host.
        verdict = "no real host";
        counts.noHost += 1;
      } else if (result.hosts.some(isCatcher)) {
        verdict = "typo catcher";
        counts.catcher += 1;
      } else if ([...owners].some((owner) => providerOwners.get(to)?.has(owner))) {
        verdict = "provider-owned";
        counts.defensive += 1;
      } else if (REVIEWED_TYPO_DOMAINS.includes(domain)) {
        verdict = "reviewed typo";
        counts.reviewedTypo += 1;
      } else if (source === "seed") {
        // A real-world site with mail of its own that suggest() would rewrite.
        verdict = "FLAG";
        counts.flagged += 1;
        failures += 1;
      } else {
        // A generated typo nobody visits, with an MX: usually a squatter on a
        // hosted mailbox; listed for review, the hint stays non-blocking.
        verdict = "review";
        counts.review += 1;
      }
      if (verdict === "FLAG" || verdict === "review") {
        for (const owner of owners) unlistedHosts.set(owner, (unlistedHosts.get(owner) ?? 0) + 1);
      }
    } else if (result.kind === "deliverable") {
      verdict = "parked (implicit MX)";
      counts.implicit += 1;
    } else if (result.kind === "unknown") {
      verdict = "unknown";
      counts.unknown += 1;
    } else {
      verdict = "cannot receive mail";
      counts.refusable += 1;
    }
    if (verdict === "FLAG" || (verdict === "review" && reviewAll)) {
      sweepLines.push(`| ${domain} | ${to} | ${source} | ${result.kind} | ${detailOf(result)} | ${verdict} |`);
    }
  }
  const busiest = [...unlistedHosts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 15);
  sweepSummary =
    `${seedLabel}: ${seed.length} domains; ${generated} generated neighbours; ${candidates.size} would be rewritten.\n` +
    `FLAG (real site, own MX) ${counts.flagged}; review (generated typo, own MX) ${counts.review}; ` +
    `typo catcher ${counts.catcher}; provider-owned ${counts.defensive}; MX naming no host ${counts.noHost}; ` +
    `reviewed typo ${counts.reviewedTypo}; parked (A record only) ${counts.implicit}; cannot receive mail ${counts.refusable}; unknown ${counts.unknown}.\n` +
    `Mail hosts behind the unresolved ones (a host serving many typo domains is a catcher candidate): ` +
    busiest.map(([owner, n]) => `${owner} ${n}`).join(", ");
}

if (json) {
  console.log(JSON.stringify(Object.fromEntries(raw), null, 2));
} else {
  console.log(`Live MX check, ${new Date().toISOString()}, ${rows.length} curated domains\n`);
  console.log("| domain | role | result | detail | verdict |");
  console.log("|---|---|---|---|---|");
  for (const line of lines) console.log(line);
  if (neighbours) {
    console.log(`\nFalse-positive sweep. ${sweepSummary}\n`);
    console.log("| domain | suggest() says | source | result | detail | verdict |");
    console.log("|---|---|---|---|---|---|");
    for (const line of sweepLines) console.log(line);
  }
  console.log(`\n${failures} to fix.`);
}
process.exitCode = failures > 0 ? 1 : 0;
