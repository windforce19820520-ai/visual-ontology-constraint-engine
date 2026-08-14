# v0.1.0-rc.1 release-readiness checklist

This checklist describes the local release candidate gate. It does not authorize npm publishing, a GitHub Release, a tag, a merge, or a production-readiness claim.

## Local commands

Run from a clean tracked working tree with Node 20 or newer:

```text
pnpm install --ignore-scripts
pnpm run validate
pnpm run typecheck
pnpm test
pnpm run compatibility
pnpm run security
pnpm run reproducibility
pnpm run consumer
pnpm run release-candidate
pnpm run clean-room
pnpm run verify-checksums
git diff --check
```

`release-candidate` binds its generated local manifest to the exact `HEAD` and stops when tracked files are dirty. Ignored build output is not included in the tracked-dirty decision.

## Gate coverage

- Four public packages are packed and consumed from local tarballs with `--ignore-scripts` and package-import copy mode.
- Installed consumers use public ESM entrypoints, package declarations, the CLI bin, the documented schema subpath, and the same Registry/Resolver path for first-party and renamed third-party data-only packs.
- Product-shot compile, Mock run, static trace, two-bundle compare, and virtual-tryon/cosplay assertion IDs, statuses, and hashes are retained in the generated consumer summary.
- Tarballs contain only `package.json`, `LICENSE`, `README.md`, declared `dist`/schema files, and no source, tests, source maps, node_modules, caches, credentials, or lifecycle scripts.
- The local checksum verifier is exercised once normally and once against a tampered copy; the tampered verification must fail.
- The local SBOM/license report uses only the lockfile and installed public metadata. Missing metadata remains `unknown`.
- The local build manifest always declares `officialAttestation: false`.

## CI matrix

The release-candidate workflow covers Ubuntu and Windows on Node 20, including the real Linux symlink tests and Windows clean-room copy install. A Node 22 Ubuntu consumer job validates the public tarball path. CI has `contents: read`, no secrets, no provider/network probes, and no publish/tag/release steps.

## Deferred actions

Real Seedream, veImageX, LLM, and other paid or network Provider smoke; npm publish; GitHub Release/tag; provenance or attestation; PR merge; hosted product features; marketplace/discovery; and production-readiness declarations remain separately authorized work.
