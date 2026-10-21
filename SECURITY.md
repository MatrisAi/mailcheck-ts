# Security policy

## Reporting a vulnerability

Please report security issues privately, never in a public issue or pull
request: open this repository's **Security** tab on GitHub and choose
**Report a vulnerability** (GitHub private vulnerability reporting).

Include what you found, the version, and the smallest input or steps that
show it. We acknowledge a report within 5 working days, keep you informed
while we fix it, and credit you in the advisory unless you prefer otherwise.

## Supported versions

Only the latest published version receives fixes.

## Scope

In scope: anything in the published package (`dist/`) that lets an input
crash the caller, run unexpectedly long (for example a pathological string
for `suggest`), reach a host other than the configured DNS-over-HTTPS
resolver, or make `checkMx` report a definitive refusal that DNS did not
give. Also in scope: a published tarball that contains anything other than
what `pnpm run pack-check` allows.

Out of scope: a domain missing from, or wrongly present in, the provider or
disposable lists. Please open a normal issue for those.

## Releases

Every version is published only by this repository's release workflow with
npm trusted publishing and a provenance attestation, never from a personal
machine. A version without a provenance attestation did not come from us.
