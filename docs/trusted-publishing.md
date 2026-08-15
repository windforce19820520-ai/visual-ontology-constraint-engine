# npm trusted publishing

VOCE uses npm Trusted Publishing with GitHub Actions OIDC for future package releases. The release workflow is `.github/workflows/publish-npm.yml`; it publishes the four public packages without a stored npm write token and lets npm generate provenance automatically.

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

The packages publish serially in dependency order: contracts, Core, testkit, then CLI. The job has only `contents: read` and `id-token: write`; it does not use `NODE_AUTH_TOKEN` or an npm write secret.

## Provenance and migration state

npm automatically publishes provenance for public packages published from this public repository through GitHub Actions Trusted Publishing. The workflow does not disable provenance and does not need a `--provenance` flag.

Trusted Publisher settings can be saved before the workflow reaches `main`, but npm does not validate those settings at save time. The OIDC exchange is therefore fully proven only by the first successful publication of a new version after this workflow is merged. Do not republish an existing version merely to test OIDC.

The previous short-lived RC publication token was revoked. Traditional token publishing should be disabled in npm package settings only after the first successful OIDC publication, preserving a recoverable migration path while the trust relationship is still unproven.

## Security boundary

- Use GitHub-hosted runners; npm does not support self-hosted runners for Trusted Publishing.
- Keep the workflow filename, repository owner, repository name, and optional environment exact and case-sensitive.
- Never add an npm write token to repository secrets as a fallback.
- A failed or ambiguous publish is a stop state. Inspect npm and GitHub receipts before retrying; never guess whether a version reached the registry.
