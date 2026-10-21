/**
 * Can this domain receive mail at all? One DNS question, asked over
 * DNS-over-HTTPS (the JSON API), answered with a discriminated union whose
 * only refusals are DEFINITIVE DNS answers.
 *
 * The decision follows the standards:
 *   - An MX record means the domain names a mail host: `deliverable`.
 *   - No MX record (NOERROR, empty answer) is NOT a refusal: RFC 5321
 *     section 5.1 says the domain is then its own mail host (the "implicit
 *     MX"), so an A or AAAA record at the name is `deliverable` too.
 *   - A single MX of preference 0 pointing at "." is the null MX of RFC 7505:
 *     the domain declares that it accepts no mail. `null_mx`.
 *   - NXDOMAIN (RCODE 3, RFC 1035 section 4.1.1) means the name does not
 *     exist. `no_domain`.
 *   - NOERROR with no MX, no A and no AAAA (NODATA, RFC 2308 section 2.2)
 *     leaves nothing to deliver to. `no_mail_host`.
 *   - Anything else (SERVFAIL, REFUSED, a timeout, a network error, an HTTP
 *     error, a body that is not the documented shape) is `unknown`, and an
 *     unknown answer must ALWAYS be treated as "allow": a resolver that is
 *     down says nothing about the person's mailbox.
 *
 * What "deliverable" does not prove: that the mailbox exists, that the
 * provider still accepts new registrations, or that the mail host answers.
 * It is the strongest thing DNS can say without sending a message.
 *
 * Caching: a small in-isolate map. A positive answer is kept for the DNS TTL
 * the resolver reported, capped at `POSITIVE_CAP_SECONDS`; a negative one for
 * the negative TTL of RFC 2308 section 5 (the smaller of the SOA record's TTL
 * and its MINIMUM field), capped at `NEGATIVE_CAP_SECONDS`, so a domain that
 * gains a mail server is believed within minutes. `unknown` is never cached.
 *
 * The JSON API has no RFC of its own; its shape is Cloudflare's
 * (https://developers.cloudflare.com/1.1.1.1/encryption/dns-over-https/make-api-requests/dns-json/),
 * which Google Public DNS shares. Every field is narrowed by hand before use.
 */

/** The DoH JSON endpoint asked by default. */
export const DEFAULT_DOH_ENDPOINT = "https://cloudflare-dns.com/dns-query";
/** Whole-check budget (MX, then A and AAAA) when the caller names none. */
export const DEFAULT_TIMEOUT_MS = 3000;
/** Longest a positive answer is reused, whatever TTL DNS gave it. */
export const POSITIVE_CAP_SECONDS = 600;
/** Longest a negative answer is reused, whatever the SOA says. */
export const NEGATIVE_CAP_SECONDS = 300;
/** Negative TTL when the answer carries no SOA to read one from. */
export const NEGATIVE_DEFAULT_SECONDS = 60;
/** Entries kept per cache; the oldest is evicted first. */
export const DEFAULT_CACHE_SIZE = 1000;

/** DNS RCODEs the JSON API reports in `Status` (RFC 1035 section 4.1.1, RFC 6895). */
const RCODE_NOERROR = 0;
const RCODE_SERVFAIL = 2;
const RCODE_NXDOMAIN = 3;

/** Resource record types (RFC 1035 section 3.2.2, RFC 3596). */
const TYPE_A = 1;
const TYPE_SOA = 6;
const TYPE_MX = 15;
const TYPE_AAAA = 28;

export type UnknownReason =
  | "invalid_domain"
  | "timeout"
  | "network"
  | "http_status"
  | "bad_response"
  | "servfail"
  | "dns_error";

export type MxCheck =
  /** Mail can be handed to a host: an MX record, or (RFC 5321 5.1) an A/AAAA record with no MX. */
  | { kind: "deliverable"; via: "mx" | "implicit"; hosts: readonly string[] }
  /** RFC 7505: the domain publishes a null MX and accepts no mail. */
  | { kind: "null_mx" }
  /** NXDOMAIN: the domain does not exist. */
  | { kind: "no_domain" }
  /** The domain exists but has no MX, A or AAAA record. */
  | { kind: "no_mail_host" }
  /** No definitive answer. ALWAYS allow. */
  | { kind: "unknown"; reason: UnknownReason; status?: number };

export type MxKind = MxCheck["kind"];

/**
 * True only for an answer that proves the domain cannot receive mail. The
 * one function a caller should use to decide a refusal: `unknown` and
 * `deliverable` both answer false.
 */
export function isDefinitivelyUndeliverable(result: MxCheck): boolean {
  const kind = result.kind;
  switch (kind) {
    case "null_mx":
    case "no_domain":
    case "no_mail_host":
      return true;
    case "deliverable":
    case "unknown":
      return false;
    default: {
      const unreachable: never = kind;
      // A value from a newer build of this module: never refuse on it.
      void unreachable;
      return false;
    }
  }
}

/** The part of `fetch` this module calls, so a test or another runtime can supply its own. */
export type FetchLike = (input: string, init: { headers: Record<string, string>; signal: AbortSignal }) => Promise<Response>;

/** A bounded in-memory cache of answers, keyed by domain. */
export class MxCache {
  private readonly entries = new Map<string, { result: MxCheck; expiresAt: number }>();

  constructor(private readonly maxEntries: number = DEFAULT_CACHE_SIZE) {}

  get(domain: string, now: number): MxCheck | null {
    const hit = this.entries.get(domain);
    if (!hit) return null;
    if (hit.expiresAt <= now) {
      this.entries.delete(domain);
      return null;
    }
    return hit.result;
  }

  set(domain: string, result: MxCheck, ttlSeconds: number, now: number): void {
    if (ttlSeconds <= 0) return;
    this.entries.delete(domain);
    this.entries.set(domain, { result, expiresAt: now + ttlSeconds * 1000 });
    while (this.entries.size > this.maxEntries) {
      const oldest = this.entries.keys().next();
      if (oldest.done) break;
      this.entries.delete(oldest.value);
    }
  }

  clear(): void {
    this.entries.clear();
  }

  get size(): number {
    return this.entries.size;
  }
}

/** The cache used when the caller passes none: one per isolate, tab or process. */
export const defaultMxCache = new MxCache();

export interface CheckMxOptions {
  /** Defaults to the global `fetch`. */
  fetch?: FetchLike;
  /** Budget for the whole check, every query included. */
  timeoutMs?: number;
  /** A DoH JSON endpoint; defaults to Cloudflare's. */
  endpoint?: string;
  /** `null` disables caching; defaults to `defaultMxCache`. */
  cache?: MxCache | null;
  /** Clock in milliseconds, for tests. */
  now?: () => number;
}

const LABEL = /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/;

/** The domain in the form DNS is asked for it, or null when it is not a host name. */
export function normalizeDomain(raw: string): string | null {
  let domain = raw.trim().toLowerCase();
  if (domain.endsWith(".")) domain = domain.slice(0, -1);
  if (domain.length === 0 || domain.length > 253) return null;
  const labels = domain.split(".");
  if (labels.length < 2) return null;
  if (!labels.every((label) => LABEL.test(label))) return null;
  // An all-numeric last label is an IP address, not a domain.
  if (/^[0-9]+$/.test(labels[labels.length - 1] ?? "")) return null;
  return domain;
}

interface DnsRecord {
  type: number;
  ttl: number;
  data: string;
}

interface DnsAnswer {
  status: number;
  answer: DnsRecord[];
  authority: DnsRecord[];
}

type Query = { ok: true; value: DnsAnswer } | { ok: false; result: MxCheck };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** Records of one section, or null when the section is present and malformed. */
function readSection(value: unknown): DnsRecord[] | null {
  if (value === undefined) return [];
  if (!Array.isArray(value)) return null;
  const out: DnsRecord[] = [];
  for (const item of value) {
    if (!isRecord(item)) return null;
    const { type, TTL, data } = item;
    if (typeof type !== "number" || typeof data !== "string") return null;
    out.push({ type, ttl: typeof TTL === "number" && TTL >= 0 ? TTL : 0, data });
  }
  return out;
}

/** The documented JSON shape, narrowed; null for anything else. */
export function parseDohJson(body: unknown): DnsAnswer | null {
  if (!isRecord(body)) return null;
  const status = body.Status;
  if (typeof status !== "number" || !Number.isInteger(status)) return null;
  const answer = readSection(body.Answer);
  const authority = readSection(body.Authority);
  if (!answer || !authority) return null;
  return { status, answer, authority };
}

function isAbort(error: unknown): boolean {
  return isRecord(error) && (error.name === "AbortError" || error.name === "TimeoutError");
}

async function query(
  domain: string,
  type: "MX" | "A" | "AAAA",
  fetchFn: FetchLike,
  endpoint: string,
  signal: AbortSignal,
): Promise<Query> {
  const url = `${endpoint}?${new URLSearchParams({ name: domain, type }).toString()}`;
  let response: Response;
  try {
    response = await fetchFn(url, { headers: { accept: "application/dns-json" }, signal });
  } catch (error) {
    return { ok: false, result: { kind: "unknown", reason: isAbort(error) || signal.aborted ? "timeout" : "network" } };
  }
  if (!response.ok) {
    await response.body?.cancel().catch(() => undefined);
    return { ok: false, result: { kind: "unknown", reason: "http_status", status: response.status } };
  }
  let body: unknown;
  try {
    body = await response.json();
  } catch (error) {
    return { ok: false, result: { kind: "unknown", reason: isAbort(error) || signal.aborted ? "timeout" : "bad_response" } };
  }
  const parsed = parseDohJson(body);
  if (!parsed) return { ok: false, result: { kind: "unknown", reason: "bad_response" } };
  return { ok: true, value: parsed };
}

/** An MX record's data, `"<preference> <exchange>"`, or null when it is not that. */
export function parseMxData(data: string): { preference: number; exchange: string } | null {
  const match = /^\s*(\d{1,5})\s+(\S+)\s*$/.exec(data);
  if (!match) return null;
  const preference = Number(match[1]);
  const rawExchange = match[2] ?? "";
  if (preference > 65535) return null;
  const exchange = rawExchange === "." ? "." : rawExchange.replace(/\.$/, "").toLowerCase();
  return { preference, exchange };
}

/**
 * RFC 2308 section 5: the negative TTL is the smaller of the SOA record's own
 * TTL and its MINIMUM field (the last of the seven SOA fields).
 */
export function negativeTtl(authority: readonly DnsRecord[]): number {
  const soa = authority.find((record) => record.type === TYPE_SOA);
  if (!soa) return NEGATIVE_DEFAULT_SECONDS;
  const fields = soa.data.trim().split(/\s+/);
  const minimum = Number(fields[fields.length - 1]);
  const candidates = [soa.ttl, Number.isFinite(minimum) && minimum >= 0 ? minimum : soa.ttl];
  return Math.min(NEGATIVE_CAP_SECONDS, ...candidates);
}

function positiveTtl(records: readonly DnsRecord[]): number {
  if (records.length === 0) return 0;
  return Math.min(POSITIVE_CAP_SECONDS, ...records.map((record) => record.ttl));
}

/** Which kind an RCODE that is neither NOERROR nor NXDOMAIN is reported as. */
function failedStatus(status: number): MxCheck {
  return { kind: "unknown", reason: status === RCODE_SERVFAIL ? "servfail" : "dns_error", status };
}

/**
 * Ask whether `domain` can receive mail. Never throws; every failure is an
 * `unknown` answer, which callers must treat as "allow".
 */
export async function checkMx(rawDomain: string, options: CheckMxOptions = {}): Promise<MxCheck> {
  const domain = normalizeDomain(rawDomain);
  if (!domain) return { kind: "unknown", reason: "invalid_domain" };

  const now = options.now ?? Date.now;
  const cache = options.cache === undefined ? defaultMxCache : options.cache;
  const cached = cache?.get(domain, now());
  if (cached) return cached;

  const fetchFn: FetchLike | undefined = options.fetch ?? (typeof fetch === "function" ? (input, init) => fetch(input, init) : undefined);
  if (!fetchFn) return { kind: "unknown", reason: "network" };
  const endpoint = options.endpoint ?? DEFAULT_DOH_ENDPOINT;
  const signal = AbortSignal.timeout(options.timeoutMs ?? DEFAULT_TIMEOUT_MS);

  const mx = await query(domain, "MX", fetchFn, endpoint, signal);
  if (!mx.ok) return mx.result;

  const remember = (result: MxCheck, ttl: number): MxCheck => {
    cache?.set(domain, result, ttl, now());
    return result;
  };

  if (mx.value.status === RCODE_NXDOMAIN) return remember({ kind: "no_domain" }, negativeTtl(mx.value.authority));
  if (mx.value.status !== RCODE_NOERROR) return failedStatus(mx.value.status);

  const mxRecords = mx.value.answer.filter((record) => record.type === TYPE_MX);
  if (mxRecords.length > 0) {
    const parsed = mxRecords.map((record) => parseMxData(record.data));
    if (parsed.some((entry) => entry === null)) return { kind: "unknown", reason: "bad_response" };
    const exchanges = parsed.filter((entry): entry is { preference: number; exchange: string } => entry !== null);
    const hosts = exchanges.filter((entry) => entry.exchange !== "." && entry.exchange !== "");
    // RFC 7505 section 3: a null MX is the ONLY MX a domain may publish. A
    // null MX beside real ones is a misconfiguration; the real ones still
    // accept mail, so it is not a refusal.
    if (hosts.length === 0) {
      // RFC 7505 section 3 defines the null MX as exactly ONE record, preference
      // 0, exchange ".". Any other set naming only "." (`10 .`, two `0 .`) is
      // not that declaration, but it still names no host: no_mail_host.
      const only = exchanges[0];
      const isNullMx = exchanges.length === 1 && only?.preference === 0 && only.exchange === ".";
      return remember({ kind: isNullMx ? "null_mx" : "no_mail_host" }, Math.min(NEGATIVE_CAP_SECONDS, positiveTtl(mxRecords)));
    }
    const ordered = [...hosts].sort((a, b) => a.preference - b.preference).map((entry) => entry.exchange);
    return remember({ kind: "deliverable", via: "mx", hosts: ordered }, positiveTtl(mxRecords));
  }

  // NODATA for MX: RFC 5321 section 5.1, the domain is its own mail host if it has an address.
  const [a, aaaa] = await Promise.all([
    query(domain, "A", fetchFn, endpoint, signal),
    query(domain, "AAAA", fetchFn, endpoint, signal),
  ]);
  const addresses: DnsRecord[] = [];
  for (const answer of [a, aaaa]) {
    if (answer.ok && answer.value.status === RCODE_NOERROR) {
      addresses.push(...answer.value.answer.filter((record) => record.type === TYPE_A || record.type === TYPE_AAAA));
    }
  }
  if (addresses.length > 0) return remember({ kind: "deliverable", via: "implicit", hosts: [domain] }, positiveTtl(addresses));

  // A refusal needs BOTH address queries to have answered NOERROR with nothing.
  // One that failed, or an NXDOMAIN right after the MX query said the name
  // exists, is an inconsistent picture, never proof.
  for (const answer of [a, aaaa]) {
    if (!answer.ok) return answer.result;
    if (answer.value.status !== RCODE_NOERROR) {
      return answer.value.status === RCODE_NXDOMAIN ? { kind: "unknown", reason: "dns_error", status: RCODE_NXDOMAIN } : failedStatus(answer.value.status);
    }
  }
  return remember({ kind: "no_mail_host" }, negativeTtl(mx.value.authority));
}
