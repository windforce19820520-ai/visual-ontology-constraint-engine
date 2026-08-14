# Release-candidate process

This repository currently produces an auditable local release candidate, not a published release.

## Local gates

From a clean checkout:

```text
pnpm install --ignore-scripts
pnpm run validate
pnpm run typecheck
pnpm test
pnpm run clean-room
pnpm run release-candidate
git diff --check
```

`pnpm run clean-room` packs the four public workspace packages, installs only those local tarballs in the repository-controlled `clean-room/v0.1.0-rc.1` directory with `--ignore-scripts --offline`, checks that installed packages are not workspace symlinks, and runs version, pack, three pack tests, and the three vertical compile/run/trace paths.

`pnpm run release-candidate` validates the repository, rebuilds and runs the full test suite, exercises pack dry-runs, runs the three vertical cases, writes per-file SHA-256 checksums, a package allowlist/dry-run audit, a version matrix, a license metadata report, and a local build manifest under the ignored `release-candidate/v0.1.0-rc.1` directory.

## Checksums and provenance

`checksums.sha256` is reproducible from the generated files. `build-manifest.json` is deliberately labeled `officialAttestation: false`: it is a local build manifest, not a GitHub Actions artifact attestation, npm provenance statement, signature, or trust endorsement. When repository permissions support it, a future release workflow may attach GitHub's standard artifact attestation without changing the local boundary.

The license report is derived from workspace package metadata and the lock/install metadata available to the build. Missing third-party metadata is reported rather than invented.

## What is not automated

The workflow never publishes to npm, creates a GitHub Release, creates a tag, merges a pull request, calls a real Provider, sends credentials, or claims production readiness. Those actions require explicit authorization from the root task and a separate review of release permissions and provenance.
