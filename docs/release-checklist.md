# v0.1.0-rc.3 release-readiness checklist

This checklist describes the local release candidate gate. Passing it does not itself authorize npm publishing, a GitHub Release, a tag, a merge, or a production-readiness claim. `v0.1.0-rc.3` publication is a separately authorized RC operation.

## Recorded publication state

The reviewed PR, annotated tag, and GitHub prerelease were completed on 2026-08-17 at source revision `f424705bbf554e23336e8b4179f24b287145cdf6`. The post-merge release-candidate, clean-room, checksum, and tracked-diff gates passed. On 2026-08-18 the separately authorized npm and real-Provider acceptance steps completed.

Completed external evidence:

- all four public packages are published at `0.1.0-rc.3` and resolve from `next`;
- a clean consumer installed the exact public packages with lifecycle scripts disabled and no workspace/link dependency;
- ESM, schema, CLI doctor, and the virtual-tryon, cosplay, and product-shot offline paths passed;
- one explicitly authorized Seedream Cosplay call returned HTTP 200 and passed visual signature-prop review; and
- issue [#19](https://github.com/windforce19820520-ai/visual-ontology-constraint-engine/issues/19) is closed.

See the [RC.3 public acceptance report](acceptance/v0.1.0-rc.3.md). This remains release-candidate evidence, not a production-readiness claim.

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
- The local checksum verifier covers the build manifest, rejects links and special files, and is exercised against both an ordinary artifact tamper and a build-manifest tamper; both verifications must fail.
- The local SBOM/license report uses only the lockfile and installed public metadata. Missing metadata remains `unknown`.
- The local build manifest always declares `officialAttestation: false`.

## CI matrix

The release-candidate workflow covers Ubuntu and Windows on Node 20, including the real Linux symlink tests and Windows clean-room copy install. A Node 22 Ubuntu consumer job validates the public tarball path. CI has `contents: read`, no secrets, no provider/network probes, and no publish/tag/release steps.

## Separately authorized actions

Real Seedream, LLM, and other paid or network Provider smoke; npm publication; GitHub Release/tag; provenance or attestation; PR merge; hosted product features; marketplace/discovery; and production-readiness declarations remain outside the automatic gate. M9 performed an explicitly authorized local Seedream multi-reference smoke; its credentials, inputs, and generated results are ignored and are not release artifacts.
