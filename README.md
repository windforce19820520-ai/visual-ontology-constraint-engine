# Visual Ontology & Constraint Engine

[![Validate](https://github.com/windforce19820520-ai/visual-ontology-constraint-engine/actions/workflows/validate.yml/badge.svg)](https://github.com/windforce19820520-ai/visual-ontology-constraint-engine/actions/workflows/validate.yml)
[![License](https://img.shields.io/badge/license-Apache--2.0-blue.svg)](LICENSE)

An open-source visual ontology, constraint compiler, prompt optimization, and evaluation runtime for controllable, reference-guided image generation.

## Incubation status and v0.1 release candidate

The source tree is preparing `v0.1.0-rc.3`; `v0.1.0-rc.2` remains the current public release candidate until a separately authorized publication completes. Neither candidate is **production-ready**: APIs, schemas, package contracts, and behavior may change before `v0.1.0`.

The repository contains deterministic runtime packages, data-only ScenarioPack fixtures, three offline vertical cases, bundle manifests, a Mock execution path, credentialed Seedream multi-reference smoke tooling, and clean-room/release-candidate checks. The four public packages are validated from their packed tarballs, clean consumers compile against installed declarations, and package contents, checksums, and reproducibility are verified on the release path. See the [release-readiness checklist](docs/release-checklist.md), [candidate compatibility surface](docs/compatibility.md), and [changelog](CHANGELOG.md).

## What works today

`v0.1.0-rc.2` is publicly installable from npm. The four public `@voce-engine/*` packages have been exercised from clean consumer environments, including package imports, CLI usage, compilation, an offline Mock run, static trace generation, and a third-party data-only ScenarioPack journey. See the [RC.2 public acceptance report](docs/acceptance/v0.1.0-rc.2.md).

The public CLI remains offline-first and Mock-first by default. Separately, the Seedream adapter has been exercised through explicitly authorized local multi-reference smoke tests for virtual try-on and cosplay, with successful Provider responses. Real-Provider calls are intentionally excluded from standard CI and are not the default CLI execution path. See the [M9 Seedream smoke decisions](docs/implementation-notes/m9-seedream-smoke.md).

VOCE is still a release candidate rather than a production-ready framework. The current focus is stabilization, external feedback, compatibility hardening, and ecosystem validation—not establishing the initial runtime architecture from scratch.

## Project origin and repository timeline

VOCE is the product-neutral public core extracted and generalized from earlier research and development for a commercial AI content platform. The public repository therefore begins at the open-source extraction, contract hardening, and release-engineering stage—not at the beginning of the underlying product research.

The rapid M1–M9 sequence records the work of turning that earlier domain knowledge into public contracts, deterministic runtimes, fixtures, safety gates, documentation, and provider validation. It should not be read as a claim that the visual ontology and reference-guided generation design were conceived from zero in one day.

## The problem

Reference-guided image generation becomes difficult when a task combines person identity, expression, pose, garments, accessories, props, background, camera, lighting, product fidelity, reference-image limits, and provider-specific output constraints.

Prompt text alone does not reliably answer:

- which properties should be preserved, replaced, adjusted, created, removed from the result, or excluded as source evidence;
- which parts of a single reference image are relevant to the current task;
- how multiple references depend on and conflict with one another;
- whether a provider can satisfy the requested output contract;
- what changed during prompt optimization;
- why an output passed or failed validation.

## Runtime workflow

```text
Select one root ScenarioPack + explicit extensions
                     ↓
Resolve exact versions, digests, overrides, and EffectiveScenario
                     ↓
User text → Select Intent Interpreter
                     ↓
       Remote-call preflight when external
                     ↓
 Intent Interpreter → ChangeIntent + RequestedScopePlan
                     ↓
       Reference-call preflight when external
                     ↓
Reference images → Reference Interpreter → Observations
                     ↓
Trusted metadata and decisions → Evidence and Source Resolver
                     ↓
              Sparse ontology
                     ↓
         Constraint compilation
                     ↓
Reference planning and pipeline planning
                     ↓
Prompt IR → constrained Prompt Candidate IR
                     ↓
       Prompt Guard and execution
                     ↓
       Validation and evaluation
```

## User-facing mental model

End users should not fill out an ontology form. They upload references, describe the result, and confirm ordinary target and source decisions:

- **Preserve** — identity, hairstyle, body proportions, or another selected property.
- **Replace** — garments, accessories, props, background, or another selected property.
- **Adjust** — expression, pose, lighting, camera, or composition.
- **Create** — properties not sourced from a reference.
- **Remove** — an entity or property that must not exist in the result.
- **Ignore as source** — visible reference evidence that must not be inherited.

Removing an earring from the result is different from ignoring one image as its source. The ontology stays behind the interface and makes both decisions structured, explainable, and testable.

## Core technical contributions

1. **Sparse visual ontology** — person, expression, gaze, pose, wardrobe, accessories, props, environment, camera, lighting, style, references, and output contracts without requiring every field to be populated.
2. **Multimodal Reference Interpreter** — produces multiple scoped observations, confidence, evidence regions, and unresolved items from each image.
3. **Evidence and Source Resolver** — separates what an image contains, what the target should change, and which evidence may supply it.
4. **Constraint Graph Compiler** — detects occlusion, resource, dependency, and policy conflicts before generation.
5. **Reference Budget Optimizer** — selects and orders references under provider limits while retaining required dependencies.
6. **Capability-aware Pipeline Planner** — derives generation, temporary asset, postprocessing, normalization, and validation steps from an output contract.
7. **Auditable Prompt Optimizer** — proposes constrained, source-linked prompt transformations that can be checked against locked hard-constraint sections before rendering a provider prompt.
8. **Replayable Evaluation Runtime** — compares rule, model, prompt, and provider changes through durable, redacted run receipts without implying pixel-identical generation.

## Initial scenarios

The repository currently includes data-only ScenarioPack fixtures and vertical cases for three initial domains:

- commercial virtual try-on visualization;
- cosplay identity, costume, makeup, mask, and prop planning;
- product-only shots used as a regression case to prevent person-only assumptions.

These scenarios remain outside Core and use the same explicit `ScenarioPackRegistry`, resolution, validation, fixture, and activation path intended for first-party and third-party packs. Core never imports a scenario package or branches on a scenario ID. The fixtures are not independently published domain products, and installing a package does not activate it, authorize a remote call, select a provider, or create cost.

For v0.1, the candidate public compatibility surface is intentionally limited to `ScenarioPack`, `ScenarioPackRegistry`, `ScenarioPackManifest`, `DeclarativeRulePackContribution`, `ProviderAdapter`, `ProviderCapabilityProfile`, and the offline testkit; it becomes stable only with released schemas and compatibility fixtures. Other ports, including `RulePackPlugin`, remain experimental. ScenarioPack runtime artifacts are declarative data; any executable plugin or adapter is separately trusted local code running with host-process privileges. Hosts register local package data explicitly; there is no dynamic package scan, marketplace, or automatic installation. A valid manifest is a declaration and compatibility input, not a sandbox or proof that third-party code is safe.

This project does not promise physical fit, sizing accuracy, or exact real-world product behavior. It is an orchestration and evaluation layer for generative image workflows.

The first-party scenarios produce complete images. Background removal, transparent cutouts, host-canvas compositing, and concrete services for those product workflows are outside the v0.1 repository scope. Hosts may register generic optional postprocessing steps without making any one postprocessor part of Core.

## Safety defaults

- Standard tests and CI never call paid model providers.
- Every remote step must be explicitly configured, authorized, and budgeted per adapter and step, including interpreters, optimizers, generators, postprocessors, semantic reviewers, and asset resolvers or publishers.
- Secrets, image bytes, Base64 payloads, temporary URLs, and biometric descriptions must not be logged.
- Low-confidence model observations do not become hard facts automatically.
- Known generation-capability gaps fail before a generation-provider network call.

## Repository documents

- [Documentation index](docs/README.md) · [简体中文](docs/zh-CN/README.md)
- [Scenario and user journey design](docs/scenario-design.md) · [简体中文](docs/zh-CN/scenario-design.md)
- [System design](docs/system-design.md) · [简体中文](docs/zh-CN/system-design.md)
- [Glossary](docs/glossary.md) · [简体中文](docs/zh-CN/glossary.md)
- [ScenarioPack contract](docs/scenario-pack-contract.md) · [简体中文](docs/zh-CN/scenario-pack-contract.md)
- [Architecture](docs/architecture.md)
- [Roadmap](docs/roadmap.md)
- [Contributing](CONTRIBUTING.md)
- [Security](SECURITY.md)
- [Code of Conduct](CODE_OF_CONDUCT.md)

## Validate the current baseline

```bash
npm install
npm run validate
```

No API key or network model access is required.

## Install the release candidate

The RC is published under the npm `next` dist-tag. Pin the exact version when reproducibility matters:

```bash
npm install @voce-engine/contracts@0.1.0-rc.2
npm install @voce-engine/core@0.1.0-rc.2
npm install --save-dev @voce-engine/testkit@0.1.0-rc.2
npm install --global @voce-engine/cli@0.1.0-rc.2
```

The GitHub prerelease and its checksummed tarballs are available from [`v0.1.0-rc.2`](https://github.com/windforce19820520-ai/visual-ontology-constraint-engine/releases/tag/v0.1.0-rc.2).

RC.2 was published through npm Trusted Publishing with provenance and exercised from a clean npm consumer, including a third-party data-only ScenarioPack installation, compilation, Mock run, and static trace. See the [RC.2 public acceptance report](docs/acceptance/v0.1.0-rc.2.md). The [RC.1 report](docs/acceptance/v0.1.0-rc.1.md) remains available as historical evidence.

## Use the offline CLI

After `pnpm install --ignore-scripts` and `pnpm run build`, run `node packages/cli/dist/cli.js --help` or follow [CLI usage](docs/cli.md). All pack, case, and trace inputs are explicit local paths. For the public CLI in this release candidate, the default Provider is disabled and `--provider mock` is the only enabled execution path. This does not mean the Provider layer is Mock-only: the Seedream adapter has been exercised separately through explicitly authorized local multi-reference smoke tests. Real-Provider calls remain intentionally outside standard CI and the default public CLI path.

The first-party packs and the third-party contract fixture are redistributable data-only examples under `fixtures/`. They use `example.test`/fixture IDs and generated virtual artifacts; they contain no private images, credentials, signed URLs, or model output.

## License

Licensed under the [Apache License 2.0](LICENSE).
