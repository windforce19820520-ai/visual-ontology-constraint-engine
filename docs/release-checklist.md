# v0.1.0-rc.4 release-readiness checklist

This checklist describes the local release candidate gate. Passing it does not itself authorize npm publishing, a GitHub Release, a tag, a merge, or a production-readiness claim. `v0.1.0-rc.4` publication remains an explicitly owner-authorized RC operation.

## Recorded publication state

RC.4 adds the 30-preset visual-composition catalog to the four-package public surface. PR [#28](https://github.com/windforce19820520-ai/visual-ontology-constraint-engine/pull/28) was squash-merged as `70ecee52665c0d0002751e00896618ac0b74877a`; the annotated tag, GitHub prerelease, OIDC workflow checkout, and npm packages use that source revision. Local and public-registry clean consumers passed on 2026-08-18. A separately authorized three-call Seedream run exercised representative composition combinations with no retries and no credential recording.

Completed release evidence:

- all four package manifests, internal pins, CLI output, compatibility fixtures, and release directories use `0.1.0-rc.4`;
- a clean tarball consumer reports 29 visual-composition paths and 30 presets through Core and CLI doctor;
- ESM, schemas, the virtual-tryon, Cosplay, and product-shot offline paths pass;
- the annotated tag, GitHub prerelease, npm `next` versions, and checked-out publication revision are aligned at RC.4 / `70ecee5`;
- all four registry records contain integrity metadata, npm signatures, and SLSA provenance; and
- an exact public-registry consumer repeated the package, composition-catalog, declaration, schema, CLI, and three offline-path checks after publication.

See the [RC.4 acceptance report](acceptance/v0.1.0-rc.4.md). The real images remain qualitative evidence and are not committed release artifacts or an automatic pass/fail gate.

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
