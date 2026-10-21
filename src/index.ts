export { suggest, suggestDomain, type Suggestion, type SuggestionReason, type SuggestOptions } from "./suggest.js";
export {
  checkMx,
  isDefinitivelyUndeliverable,
  normalizeDomain,
  MxCache,
  defaultMxCache,
  DEFAULT_DOH_ENDPOINT,
  DEFAULT_TIMEOUT_MS,
  POSITIVE_CAP_SECONDS,
  NEGATIVE_CAP_SECONDS,
  type MxCheck,
  type MxKind,
  type UnknownReason,
  type CheckMxOptions,
  type FetchLike,
} from "./mx.js";
export { PROVIDER_DOMAINS, LOOKALIKE_DOMAINS, NOT_TYPOS, VERIFIED_ON } from "./providers.js";
export { osaDistance } from "./distance.js";
export { isRealTld } from "./tlds.js";
