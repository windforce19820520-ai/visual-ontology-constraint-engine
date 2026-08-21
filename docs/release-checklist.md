# v0.1.0-rc.5 release-readiness checklist

This checklist describes the local release candidate gate. Passing it does not itself authorize npm publishing, a GitHub Release, a tag, a merge, or a production-readiness claim. `v0.1.0-rc.5` publication remains an explicitly owner-authorized RC operation.

## Candidate scope

RC.5 retains the four existing runtime packages and adds `@voce-engine/playground` as a separate fifth package. The Playground tarball includes its local Host, public declarations, executable, Cloudflare environment-name example, and all 30 Cosplay composition example images. It does not include credentials, uploaded inputs, generated outputs, or a public deployment.

Required release evidence:

- all five package manifests, internal pins, CLI/Playground version output, compatibility fixtures, and release directories use `0.1.0-rc.5`;
- a clean tarball consumer reports 29 visual-composition paths and 30 presets through Core and CLI doctor;
- ESM, declarations, schemas, the virtual-tryon, Cosplay, and product-shot offline paths pass;
- a clean tarball consumer starts the installed Playground and verifies both scenarios, the 30-preset API, and a bundled JPEG;
- the annotated tag, GitHub prerelease, npm `next` versions, and checked-out publication revision align at the exact RC.5 source revision; and
- all five registry records expose integrity metadata, npm signatures, and SLSA provenance after publication.

See the [RC.5 acceptance report](acceptance/v0.1.0-rc.5.md). Historical real-image evidence remains qualitative and is not a committed release artifact or an automatic pass/fail gate.

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

- Five public packages are packed and consumed from local tarballs with `--ignore-scripts` and package-import copy mode.
- Installed consumers use public ESM entrypoints, package declarations, both executable entrypoints, the documented schema subpath, the Playground HTTP surface and packaged assets, and the same Registry/Resolver path for first-party and renamed third-party data-only packs.
- Product-shot compile, Mock run, static trace, two-bundle compare, and virtual-tryon/cosplay assertion IDs, statuses, and hashes are retained in the generated consumer summary.
- Tarballs contain only `package.json`, `LICENSE`, `README.md`, declared `dist`/schema/Playground asset files, and no source, tests, source maps, node_modules, caches, credentials, or lifecycle scripts.
- The local checksum verifier covers the build manifest, rejects links and special files, and is exercised against both an ordinary artifact tamper and a build-manifest tamper; both verifications must fail.
- The local SBOM/license report uses only the lockfile and installed public metadata. Missing metadata remains `unknown`.
- The local build manifest always declares `officialAttestation: false`.

## CI matrix

The release-candidate workflow covers Ubuntu and Windows on Node 20, including the real Linux symlink tests and Windows clean-room copy install. A Node 22 Ubuntu consumer job validates the public tarball path. CI has `contents: read`, no secrets, no provider/network probes, and no publish/tag/release steps.

## Separately authorized actions

Real Seedream, LLM, and other paid or network Provider smoke; npm publication; GitHub Release/tag; provenance or attestation; PR merge; hosted product features; marketplace/discovery; and production-readiness declarations remain outside the automatic gate. M9 performed an explicitly authorized local Seedream multi-reference smoke; its credentials, inputs, and generated results are ignored and are not release artifacts.
