# Visual Ontology & Constraint Engine

[![Validate](https://github.com/windforce19820520-ai/visual-ontology-constraint-engine/actions/workflows/validate.yml/badge.svg)](https://github.com/windforce19820520-ai/visual-ontology-constraint-engine/actions/workflows/validate.yml)
[![License](https://img.shields.io/badge/license-Apache--2.0-blue.svg)](LICENSE)

An open-source visual ontology, constraint compiler, prompt optimization, and evaluation runtime for controllable, reference-guided image generation.

## Incubation status

This repository is in the design and incubation phase. It does not yet contain a production-ready SDK or a `v0.1.0` release. The current public baseline establishes the project boundary, architecture, safety rules, and implementation roadmap before code extraction begins.

## The problem

Reference-guided image generation becomes difficult when a task combines person identity, expression, pose, garments, accessories, props, background, camera, lighting, product fidelity, reference-image limits, and provider-specific output constraints.

Prompt text alone does not reliably answer:

- which properties should be preserved, replaced, adjusted, created, or ignored;
- which parts of a single reference image are relevant to the current task;
- how multiple references depend on and conflict with one another;
- whether a provider can satisfy the requested output contract;
- what changed during prompt optimization;
- why an output passed or failed validation.

## Proposed workflow

```text
User text ───────────────→ Intent Interpreter ──────────────┐
                                                            │
Reference images → Reference Interpreter → Observations ────┤
                                                            ↓
                                            Evidence and Source Resolver
                                                            ↓
                                                  Sparse ontology
                                                            ↓
                                             Constraint compilation
                                                            ↓
                              Reference planning and pipeline planning
                                                            ↓
                                      Prompt IR → Prompt Optimizer
                                                            ↓
                                                Prompt Guard and execution
                                                            ↓
                                                Validation and evaluation
```

## User-facing mental model

End users should not fill out an ontology form. They upload references, describe the result, and confirm five decisions:

- **Preserve** — identity, hairstyle, body proportions, or another selected property.
- **Replace** — garments, accessories, props, background, or another selected property.
- **Adjust** — expression, pose, lighting, camera, or composition.
- **Create** — properties not sourced from a reference.
- **Ignore** — visible properties in a reference that must not carry into the result.

The ontology stays behind the interface and makes these decisions structured, explainable, and testable.

## Planned technical contributions

1. **Sparse visual ontology** — person, expression, gaze, pose, wardrobe, accessories, props, environment, camera, lighting, style, references, and output contracts without requiring every field to be populated.
2. **Multimodal Reference Interpreter** — produces multiple scoped observations, confidence, evidence regions, and unresolved items from each image.
3. **Evidence and Source Resolver** — separates what an image contains from what the current task should preserve or copy.
4. **Constraint Graph Compiler** — detects occlusion, resource, dependency, and policy conflicts before generation.
5. **Reference Budget Optimizer** — selects and orders references under provider limits while retaining required dependencies.
6. **Capability-aware Pipeline Planner** — derives generation, temporary asset, postprocessing, normalization, and validation steps from an output contract.
7. **Auditable Prompt Optimizer** — records the compiled Prompt IR, optimized prompt, change set, hard-constraint coverage, and any provider-revised prompt.
8. **Replayable Evaluation Runtime** — compares rule, model, prompt, and provider changes through reproducible run receipts.

## Initial scenarios

- commercial virtual try-on visualization;
- cosplay identity, costume, makeup, mask, and prop planning;
- product-only shots used as a regression case to prevent person-only assumptions.

This project does not promise physical fit, sizing accuracy, or exact real-world product behavior. It is an orchestration and evaluation layer for generative image workflows.

## Safety defaults

- Standard tests and CI never call paid model providers.
- Real analyzers, generators, and postprocessors must be explicitly configured and budgeted.
- Secrets, image bytes, Base64 payloads, temporary URLs, and biometric descriptions must not be logged.
- Low-confidence model observations do not become hard facts automatically.
- Provider capability gaps fail before network execution.

## Repository documents

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

## License

Licensed under the [Apache License 2.0](LICENSE).
