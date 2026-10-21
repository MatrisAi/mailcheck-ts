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

**Never publish from your machine, and never publish directly.** A version
reaches npm only through staged publishing: `.github/workflows/release.yml`
STAGES it (npm trusted publishing over OIDC, with provenance), and a
maintainer approves the staged version on npmjs.com with 2FA. The workflow
starts when a GitHub release is published for a tag `vX.Y.Z` that matches
`version` in package.json:

1. Bump `version` in package.json and add the entry to CHANGELOG.md, in a
   pull request. Paste the `pack-check` output into it.
2. Merge, then create and publish the GitHub release `vX.Y.Z` (it creates
   the tag).
3. The workflow runs in the `npm` environment (approve the deployment if
   the environment has required reviewers), runs the full gate (tests,
   typecheck, build, `pack-check`) and runs `pnpm stage publish`. A version
   already published is skipped; one already staged is reported as nothing
   to do.
4. On npmjs.com, open the package, tab **Staged Packages**, check the
   staged version (files, size, provenance), then **Approve** it with your
   passkey. Only now is it installable. Reject it there instead if anything
   is wrong; the version number stays usable for a fixed re-stage.
5. Check the provenance badge on the package's version page.

The repository must be public when the workflow runs: npm generates and
accepts provenance only for a public repository.

### Trusted publisher settings (npmjs.com)

Package settings > Trusted publishing > GitHub Actions: this repository's
owner and name, workflow file `release.yml`, environment `npm`, allowed
action **"npm stage publish" only** (no direct `npm publish`, no
`npm dist-tag`). Publishing access: require 2FA and disallow tokens. With
these, a compromised workflow or repository can at most stage a version,
which nobody installs until a maintainer approves it.

### First release

npm offers trusted publishing settings only for a package that already
exists. The maintainer bootstrapped `0.1.0` once, then configured the
trusted publisher above and revoked any token used for the bootstrap.
Every later version goes through the workflow and an approval only.
