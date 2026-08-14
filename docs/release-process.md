# Release-candidate process

This repository currently produces an auditable local release candidate, not a published release.

## Local gates

From a clean checkout:

```text
pnpm install --ignore-scripts
pnpm run validate
pnpm run typecheck
pnpm test
pnpm run compatibility
pnpm run security
pnpm run reproducibility
pnpm run consumer
pnpm run clean-room
pnpm run release-candidate
pnpm run verify-checksums
git diff --check
```

`pnpm run clean-room` packs the four public packages, installs only those local tarballs in the repository-controlled `clean-room/v0.1.0-rc.1` directory with `--ignore-scripts --offline`, checks that installed packages are not workspace symlinks, compiles a TypeScript consumer against installed declarations, checks the documented schema path, verifies removal does not fall back to the workspace, and runs version, doctor, pack inspect/validate/test, the three vertical compile/run/trace paths, and compare.

`pnpm run release-candidate` requires a clean tracked tree, binds the output to the exact `HEAD`, runs the compatibility, security, consumer, and two-consecutive-build reproducibility gates, writes safe vertical/consumer summaries, per-file SHA-256 checksums, a strict package allowlist audit, a version matrix, a metadata-only local SBOM/license report, and a local build manifest under the ignored `release-candidate/v0.1.0-rc.1` directory. `pnpm run verify-checksums` verifies that directory and rejects a tampered file.

`pnpm run compatibility`, `pnpm run security`, `pnpm run reproducibility`, and `pnpm run consumer` are the M8专项 commands. The first three write only ignored release-candidate summaries; the consumer writes its controlled clean-room under `clean-room/`.

## Checksums and provenance

`checksums.sha256` is reproducible from the generated files. `build-manifest.json` is deliberately labeled `officialAttestation: false`: it is a local build manifest, not a GitHub Actions artifact attestation, npm provenance statement, signature, or trust endorsement. When repository permissions support it, a future release workflow may attach GitHub's standard artifact attestation without changing the local boundary.

The license report is derived from workspace package metadata and the lock/install metadata available to the build. Missing third-party metadata is reported rather than invented.

The container bytes of `.tgz` files are not required to match across tar/gzip tool versions. Reproducibility compares the decompressed, normalized relative-path/content-hash inventory while preserving the exact source revision binding.

## What is not automated

The workflow never publishes to npm, creates a GitHub Release, creates a tag, merges a pull request, calls a real Provider, sends credentials, or claims production readiness. Those actions require explicit authorization from the root task and a separate review of release permissions and provenance.
