# VOCE CLI

The `0.1.0-rc.3` release candidate provides the `voce` command through `packages/cli`. It is safe-by-default, deterministic, explicit-path, and offline-first.

## 10–15 minute clean-room quickstart

```text
git clone https://github.com/windforce19820520-ai/visual-ontology-constraint-engine.git
cd visual-ontology-constraint-engine
pnpm install --ignore-scripts
pnpm run build
node packages/cli/dist/cli.js pack validate --source fixtures/packs/product-shot --json
node packages/cli/dist/cli.js case compile --case fixtures/cases/product-shot.json --scenario fixtures/packs/product-shot --profile fixtures/profiles/mock-image.json --out .local-output/product-shot-compiled --json
node packages/cli/dist/cli.js case run --bundle .local-output/product-shot-compiled --provider mock --out .local-output/product-shot-run --json
node packages/cli/dist/cli.js trace render --bundle .local-output/product-shot-run --out .local-output/product-shot.html --json
```

Open `.local-output/product-shot.html` in a local viewer. The page is a static, dependency-free report and is never opened by the CLI.

## Commands

`voce --help` and `voce --version` report the CLI surface and `0.1.0-rc.3`.

`pack inspect|validate|test --source <explicit path>` reads one explicit data-only `pack.json` or a standard `scenario-pack/manifest.json` directory. `test` runs the declared FixtureSuite through the same Registry/Resolver and offline Mock path. It does not execute JavaScript, lifecycle hooks, package scripts, or network access.

`case compile --case <file> --scenario <explicit pack path> --profile <file> --out <directory>` creates a compiled bundle containing the scenario lock, ConstraintIR, ReferencePlan, PipelinePlan, PromptIR/Guard, and execution authorization inputs.

`case run --bundle <compiled directory> --provider mock --out <directory>` runs only the registered offline Mock runtime and writes a separate run bundle. Provider selection is mandatory; no provider argument is treated as disabled.

`trace render --bundle <run/evaluation directory> --out <html>` renders the redacted static trace. `compare --before <bundle> --after <bundle> [--out <file>]` compares semantic snapshots while ignoring only the volatile fields documented by Core.

`doctor` checks the Node major version, local contract version, and the explicit-path/offline policy. It never probes credentials, environment secrets, or a network endpoint.

The contracts tarball includes the documented JSON Schema subpaths. For example, an installed consumer may read `@voce-engine/contracts/schemas/BundleManifest.schema.json`; schemas are data files, not runtime behavior.

The M8 release gates are `pnpm run compatibility`, `pnpm run security`, `pnpm run reproducibility`, `pnpm run consumer`, `pnpm run release-candidate`, `pnpm run clean-room`, and `pnpm run verify-checksums`. The release-candidate gate requires a clean tracked working tree and never publishes or calls a real Provider.

## JSON and exit codes

With `--json`, stdout contains exactly one canonical JSON object. Diagnostics go to stderr and use stable codes without absolute paths, credentials, image bytes, Base64, or signed URLs.

| Code | Meaning |
| ---: | --- |
| 0 | Success |
| 2 | Usage or missing argument |
| 3 | Input file or JSON error |
| 4 | Contract, schema, hash, or bundle-integrity rejection |
| 5 | Offline/provider boundary or fixture execution failure |
| 6 | Output-directory or output-file failure |
| 7 | Unexpected internal failure |

Failures stop before writing a success bundle. Bundle writes use a temporary file inside the named output directory and then an atomic rename. Input directories are never rewritten.

## Bundle boundary

Every bundle has a `manifest.json` with `voce.bundle-manifest/v1alpha1`, a case/revision pin, tool/core/contracts/scenario/profile pins, a sorted file inventory, per-file SHA-256, a semantic hash, and `createdBy`. Compile, run, evaluation, and trace artifacts are separate layers. Plan replay, artifact replay, and live rerun are separate states; an unavailable artifact is never silently regenerated.

Readers validate schema, inventory, safe relative paths, duplicate/case-colliding paths, hashes, extra/missing files, symlinks, hardlinks, and unsafe public values before consuming payload files.

## Deliberate boundaries

The CLI does not discover global packages, read credentials, install or activate packs, load executable plugins, call Seedream/LLM providers, or make real network requests. ScenarioPack content is declarative data. Real Provider smoke tests, npm publish, GitHub Release/tag creation, and production deployment require a separate explicit authorization.

The CLI documentation is currently English-only; the bilingual ScenarioPack/system/scenario/glossary specifications remain unchanged.

## Visual composition evidence

Pack inspection and offline fixture evidence now expose the shared visual-composition catalog through Core: preset expansion, validated vocabulary paths, rule traces, conflict/degradation records, effective and excluded constraint IDs, ordered composition prompt sections, and the planned-reference count before and after a preset-only selection. A selector is reported as ontology intent and does not create a reference attachment.

The evidence path remains local and Mock-first. It does not load card artwork, discover packs, infer a missing leading-room direction or reflection surface, call a real Provider, or turn CLI field parsing into a second Prompt policy compiler.
