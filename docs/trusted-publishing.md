# npm trusted publishing

VOCE uses npm Trusted Publishing with GitHub Actions OIDC. The release workflow is `.github/workflows/publish-npm.yml`; it publishes the four public packages without a stored npm write token and lets npm generate provenance automatically. The first tokenless publication, `v0.1.0-rc.2`, completed successfully for all four packages and produced npm provenance.

## npm package configuration

Each of these packages must have the same GitHub Actions trusted publisher:

- `@voce-engine/contracts`
- `@voce-engine/core`
- `@voce-engine/testkit`
- `@voce-engine/cli`

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
- all four public package versions match the workspace version;
- all package repository URLs match this public GitHub repository;
- Node.js and npm satisfy npm's OIDC minimum versions; and
- the standard validation, compatibility, security, consumer, clean-room, release-candidate, and checksum gates pass.

The packages publish serially in dependency order: contracts, Core, testkit, then CLI. The publish inputs are the exact release-candidate tarballs that passed the clean-consumer and checksum gates, rather than a second package assembled from the source directories. The job has only `contents: read` and `id-token: write`; it does not use `NODE_AUTH_TOKEN` or an npm write secret.

## Provenance and migration state

npm automatically publishes provenance for public packages published from this public repository through GitHub Actions Trusted Publishing. The workflow does not disable provenance and does not need a `--provenance` flag.

Trusted Publisher settings can be saved before the workflow reaches `main`, but npm does not validate those settings at save time. The OIDC exchange was proven by the successful `v0.1.0-rc.2` publication recorded in the [public acceptance report](acceptance/v0.1.0-rc.2.md). A new proof is still required after changing the publisher identity, repository, workflow filename, or environment. Do not republish an existing version merely to test OIDC.

The previous short-lived RC publication token was revoked. The successful RC.2 publication removed the need for a token fallback; do not restore an npm write token in repository secrets or routine release instructions.

## Security boundary

- Use GitHub-hosted runners; npm does not support self-hosted runners for Trusted Publishing.
- Keep the workflow filename, repository owner, repository name, and optional environment exact and case-sensitive.
- Never add an npm write token to repository secrets as a fallback.
- A failed or ambiguous publish is a stop state. Inspect npm and GitHub receipts before retrying; never guess whether a version reached the registry.
