# Contributing

Thank you for helping. A few rules keep this package safe to depend on.

## Setup

- Node 22 (`.nvmrc`) and pnpm, the version pinned by `packageManager` in
  package.json (`corepack enable` picks it up). pnpm only: the lockfile is
  `pnpm-lock.yaml`.
- `pnpm install`

## Before a pull request

```sh
pnpm test            # leak scan, then every test (none reaches the network)
pnpm run typecheck
pnpm run build
pnpm run pack-check  # packs for real and checks the tarball
```

CI runs the same four on every pull request.

## Changing the domain lists

The curated lists are verified against live DNS by hand, never in CI:

```sh
pnpm run verify-domains              # every curated domain must answer as declared
pnpm run verify-domains --neighbours # the false-positive sweep
pnpm run update-tlds                 # refresh src/tlds.ts from IANA
pnpm run update-disposable           # refresh src/disposable-list.ts
```

Commit a refreshed list as its own change, with the script's output in the
pull request, so the diff can be reviewed. See "Keeping the lists honest" in
the README.

## Releasing

**Never publish from your machine.** A version is published only by
`.github/workflows/release.yml` (npm trusted publishing over OIDC, with
provenance), started by publishing a GitHub release for a tag `vX.Y.Z` that
matches `version` in package.json:

1. Bump `version` in package.json and add the entry to CHANGELOG.md.
2. Merge, then create the tag and the GitHub release.
3. Check the workflow's `pack-check` output and the provenance on the
   registry page.

### First release

npm offers trusted publishing settings only for a package that already
exists. The maintainer bootstraps `0.1.0` once, then, on npmjs.com, opens the
package settings, adds a GitHub Actions trusted publisher (this repository,
workflow `release.yml`, environment `npm`), sets publishing access to
require 2FA and disallow tokens, and revokes any token used for the
bootstrap. Every later version goes through the workflow only.
