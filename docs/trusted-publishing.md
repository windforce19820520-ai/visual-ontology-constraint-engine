# npm trusted publishing

VOCE uses npm Trusted Publishing with GitHub Actions OIDC. The release workflow is `.github/workflows/publish-npm.yml`; for RC.5 it publishes five public packages without a stored npm write token and lets npm generate provenance automatically. The first tokenless publication, `v0.1.0-rc.2`, completed successfully for the original four packages and produced npm provenance.

## npm package configuration

Each of these packages must have the same GitHub Actions trusted publisher:

- `@voce-engine/contracts`
- `@voce-engine/core`
- `@voce-engine/testkit`
- `@voce-engine/cli`
- `@voce-engine/playground`

The npm settings are:

| Field | Value |
| --- | --- |
| Organization or user | `windforce19820520-ai` |
| Repository | `visual-ontology-constraint-engine` |
| Workflow filename | `publish-npm.yml` |
| Environment | unset |
| Allowed action | `npm publish` |

The workflow filename is intentionally stored without `.github/workflows/`; npm resolves it from that directory. Each package accepts only one trusted publisher configuration.

## Release invocation

The workflow is manual by design. An owner supplies an existing annotated release tag and chooses the npm distribution tag. The job checks out that exact tag and blocks unless:

- the tag is exactly `v<workspace version>`;
- the checked-out commit is exactly tagged with that value;
- all five public package versions match the workspace version;
- all package repository URLs match this public GitHub repository;
- Node.js and npm satisfy npm's OIDC minimum versions; and
- the standard validation, compatibility, security, consumer, clean-room, release-candidate, and checksum gates pass.

The packages publish serially in dependency order: contracts, Core, testkit, CLI, then Playground. The publish inputs are the exact release-candidate tarballs that passed the clean-consumer and checksum gates, rather than a second package assembled from the source directories. The job has only `contents: read` and `id-token: write`; it does not use `NODE_AUTH_TOKEN` or an npm write secret.

`@voce-engine/playground` is a new npm name in RC.5. npm requires a package to exist before its package-level trusted publisher can be configured. Therefore the RC.5 workflow must not be dispatched for all five packages until the owner has completed a one-time, explicitly authorized namespace bootstrap and configured this repository plus `publish-npm.yml` as the package's trusted publisher. The bootstrap is separate from the RC.5 tarball publication; it must use an interactive 2FA-protected npm action, must not store a token in Git or workflow files, and must not create an unreviewed RC.5 version. Once trust is configured, RC.5 itself is published by the same OIDC workflow as the other four packages and receives normal provenance.

## Provenance and migration state

npm automatically publishes provenance for public packages published from this public repository through GitHub Actions Trusted Publishing. The workflow does not disable provenance and does not need a `--provenance` flag.

Trusted Publisher settings can be saved before the workflow reaches `main`, but npm does not validate those settings at save time. The OIDC exchange was proven by the successful `v0.1.0-rc.2` publication recorded in the [public acceptance report](acceptance/v0.1.0-rc.2.md). A new proof is still required after changing the publisher identity, repository, workflow filename, or environment. Do not republish an existing version merely to test OIDC.

The previous short-lived RC publication token was revoked. The successful RC.2 publication removed the need for a token fallback; do not restore an npm write token in repository secrets or routine release instructions.

## RC.3 publication note

RC.3 package publication succeeded in [workflow run 32119035821](https://github.com/windforce19820520-ai/visual-ontology-constraint-engine/actions/runs/32119035821). The job checked out and verified the exact annotated `v0.1.0-rc.3` tag at `f424705bbf554e23336e8b4179f24b287145cdf6`, reran the release gates, and published all four release-candidate tarballs. Its immediate final CLI registry lookup saw a transient 404 before propagation completed; direct registry verification then confirmed all four immutable versions and `next` tags, so the publish job was not retried.

The workflow was dispatched from `main@1e8baf8dc4049a34e9d14d621cc9d864047cf0db`. npm's SLSA provenance therefore records that workflow invocation ref in `resolvedDependencies`, even though the package checkout and release gates used the RC.3 tag. Existing npm versions cannot be overwritten to change that provenance record. Future publication now fails unless the selected workflow ref is the same tag supplied as `release_ref`, and the final registry check retries only within a bounded propagation window.

## RC.4 publication note

RC.4 package publication succeeded in [workflow run 32127701215](https://github.com/windforce19820520-ai/visual-ontology-constraint-engine/actions/runs/32127701215). The workflow itself was selected from the annotated `v0.1.0-rc.4` tag, checked out the same tag at `70ecee52665c0d0002751e00896618ac0b74877a`, reran the release gates, and published all four `0.1.0-rc.4` package tarballs under npm `next`.

The public registry exposes integrity metadata, an npm signature, and SLSA provenance for contracts, Core, testkit, and CLI. A clean directory outside the development checkout installed the four exact public versions with lifecycle scripts disabled and passed imports, declarations, schemas, CLI doctor, all 30 composition presets, and the three bundled offline ScenarioPack paths. This run proves the corrected tag-to-tag invocation boundary; it does not authorize republishing an immutable version or adding a token fallback.

## Security boundary

- Use GitHub-hosted runners; npm does not support self-hosted runners for Trusted Publishing.
- Keep the workflow filename, repository owner, repository name, and optional environment exact and case-sensitive.
- Never add an npm write token to repository secrets as a fallback.
- A failed or ambiguous publish is a stop state. Inspect npm and GitHub receipts before retrying; never guess whether a version reached the registry.
