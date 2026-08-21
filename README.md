# Visual Ontology & Constraint Engine

[![Validate](https://github.com/windforce19820520-ai/visual-ontology-constraint-engine/actions/workflows/validate.yml/badge.svg)](https://github.com/windforce19820520-ai/visual-ontology-constraint-engine/actions/workflows/validate.yml)
[![License](https://img.shields.io/badge/license-Apache--2.0-blue.svg)](LICENSE)

An open-source visual ontology, constraint compiler, prompt optimization, and evaluation runtime for controllable, reference-guided image generation.

## Incubation status and v0.1 release candidate

`v0.1.0-rc.5` is the published Playground release candidate for GitHub and five public npm packages under the `next` distribution tag. It packages the local-first Playground separately as `@voce-engine/playground`, while retaining the RC.4 30-preset catalog and the earlier Cosplay fidelity repair. The [RC.5 acceptance report](docs/acceptance/v0.1.0-rc.5.md) records the exact tag, OIDC workflow, public-registry consumer, signatures, and provenance. This candidate is **not production-ready**: APIs, schemas, package contracts, and behavior may change before `v0.1.0`.

The repository contains deterministic runtime packages, data-only ScenarioPack fixtures, three offline vertical cases, bundle manifests, a Mock execution path, the local Playground Host, credentialed Seedream multi-reference smoke tooling, and clean-room/release-candidate checks. All five public packages are validated from their packed tarballs; the clean consumer also starts the installed Playground, reads its metadata, and loads a bundled composition example. Package contents, checksums, and reproducibility are verified on the release path. See the [release-readiness checklist](docs/release-checklist.md), [candidate compatibility surface](docs/compatibility.md), and [changelog](CHANGELOG.md).

The runtime also includes 30 declarative visual-composition presets. A host displays the bundled example artwork, submits a stable preset ID plus any required typed inputs, and expands that selection into ordinary `ChangeIntent` records before constraint and prompt compilation. The artwork is UI/documentation guidance, not a model reference image and does not consume reference budget. See [visual composition presets and integration](docs/visual-composition.md) or the [简体中文指南](docs/zh-CN/visual-composition.md).

### Visual-composition preset overview

Each card below pairs the bundled selection artwork with the exact stable `presetId` submitted by a host. Click the overview for the full Simplified Chinese guide, including behavior, required inputs, conflict handling, prompt generation, and integration code.

[![Overview of all 30 visual-composition presets, with example artwork and stable preset IDs](docs/assets/visual-composition-overview.jpg)](docs/zh-CN/visual-composition.md)

Full guides: [English](docs/visual-composition.md) · [简体中文](docs/zh-CN/visual-composition.md)

## Try the Playground

RC.5 packages the standalone local Host as `@voce-engine/playground`. Installing the package gives users the web UI and its 30 bundled Cosplay composition examples; it does not create a shared public deployment or make a production-readiness claim.

The Playground provides two distinct workflows:

- **Virtual Try-On:** upload one person plus either one full outfit or a Top, a Bottom, or both. Footwear, fit, pose, and typed accessories are optional. Try-On preserves unselected clothing regions and does not expose the 30 composition presets.
- **Cosplay:** upload the person and character design, optionally add a signature prop, pose, or critical detail, and choose from the complete 30-preset gallery with example artwork.

Cloudflare Workers AI FLUX.2 klein 4B is the default free quick-preview profile. It accepts at most four references and every input must be strictly smaller than 512×512. Exact face identity, small accessory details, complete feet/framing, and complex spatial composition can be less reliable than Seedream or Grok; the UI states these limits before a call. Cloudflare credentials are deployment-managed and never entered in the Browser. Seedream 5.0 Pro and Grok Imagine remain optional BYOK choices, subject to their declared reference limits and availability.

Install `@voce-engine/playground@0.1.0-rc.5` (or `@voce-engine/playground@next`), run `voce-playground`, and open `http://127.0.0.1:4173/playground`. Do not omit the version/tag during RC.5: npm's `latest` tag still identifies the non-runnable namespace-bootstrap record, while `next` identifies the reviewed Playground release. Rendering is disabled unless the Host explicitly enables an approved transport. See the [Playground usage and security guide](playground/README.md), [Try-On/Cosplay product amendment](docs/design/playground-tryon-cosplay-input-amendment.md), and [Provider capability report](docs/implementation-notes/playground-provider-capability-report.md).

## What works today

`v0.1.0-rc.5` is the current candidate line. In addition to the established deterministic Core, Contracts, testkit, and CLI surfaces, its fifth package provides the installable local Playground. The repository owner completed local interactive acceptance across multiple Virtual Try-On, Cosplay, and composition scenarios with Cloudflare Free and Seedream BYOK. That qualitative real-Provider evidence and its privacy boundary are recorded in the [RC.5 acceptance report](docs/acceptance/v0.1.0-rc.5.md); RC.4's earlier three-call composition evidence remains in the [RC.4 report](docs/acceptance/v0.1.0-rc.4.md).

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
- cosplay identity, face and existing-makeup preservation, character hair, costume, mask, and prop planning;
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
- [Visual composition presets and integration](docs/visual-composition.md) · [简体中文](docs/zh-CN/visual-composition.md)
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
npm install @voce-engine/contracts@0.1.0-rc.5
npm install @voce-engine/core@0.1.0-rc.5
npm install --save-dev @voce-engine/testkit@0.1.0-rc.5
npm install --global @voce-engine/cli@0.1.0-rc.5
npm install --global @voce-engine/playground@0.1.0-rc.5
```

The RC.5 release process uses an annotated `v0.1.0-rc.5` tag and publishes five exact, gate-verified tarballs through npm Trusted Publishing under `next`. The repository's release-candidate gate verifies its local checksum manifest; no separate package tarballs are attached to the GitHub Release.

The RC.5 clean consumer additionally imports and starts the installed Playground package, checks both scenarios and all 30 preset records, and loads a packaged example image without network generation. See the [RC.5 acceptance report](docs/acceptance/v0.1.0-rc.5.md). The [RC.4](docs/acceptance/v0.1.0-rc.4.md), [RC.3](docs/acceptance/v0.1.0-rc.3.md), [RC.2](docs/acceptance/v0.1.0-rc.2.md), and [RC.1](docs/acceptance/v0.1.0-rc.1.md) reports remain historical evidence.

## Use the offline CLI

After `pnpm install --ignore-scripts` and `pnpm run build`, run `node packages/cli/dist/cli.js --help` or follow [CLI usage](docs/cli.md). All pack, case, and trace inputs are explicit local paths. For the public CLI in this release candidate, the default Provider is disabled and `--provider mock` is the only enabled execution path. This does not mean the Provider layer is Mock-only: the Seedream adapter has been exercised separately through explicitly authorized local multi-reference smoke tests. Real-Provider calls remain intentionally outside standard CI and the default public CLI path.

The first-party packs and the third-party contract fixture are redistributable data-only examples under `fixtures/`. They use `example.test`/fixture IDs and generated virtual artifacts; they contain no private images, credentials, signed URLs, or model output.

## License

Licensed under the [Apache License 2.0](LICENSE).
