# Roadmap

This roadmap is directional. A milestone is complete only when its contracts, tests, documentation, and offline examples are complete.

## Phase 0 — Public foundation

- establish scope, terminology, license, contribution rules, and safety defaults;
- keep the repository independent from private product history and assets;
- publish architecture and acceptance criteria;
- publish the paired `ScenarioPack` contract and candidate/experimental extension boundary;
- validate the repository without external services.

## Phase 1 — Ontology and evidence

- versioned sparse visual ontology and JSON Schemas;
- Observation, `EvidenceRegion`, `ObservationDecision`, SourceBinding, provenance, confidence, and unresolved-fact contracts;
- manual and fixture Reference Interpreters;
- deterministic Evidence and Source Resolver;
- immutable `CompilationContext`, `ArtifactHandle`, and canonical-signature contracts;
- `ScenarioPack`, manifest, explicit local registry, selection, composition-lock, and effective-scenario contracts;
- virtual try-on, cosplay, and product-shot as independent optional first-party packages using the public registration path;
- matching third-party sample pack and offline fixture path proving Core contains no scenario-ID branch.

## Phase 2 — Constraints and planning

- constraint graph and trace format;
- hard, required, and preferred constraint resolution;
- dependency- and priority-aware reference optimizer;
- provider capability profiles;
- output-contract and pipeline planning with a canonical plan hash;
- per-adapter/step budgets, data-transfer declarations, and finally/compensation cleanup;
- `RemoteCallAuthorization` and plan-bound `ExecutionAuthorization` contracts;
- explain and diff commands.
- candidate `ScenarioPack`, `ScenarioPackRegistry`, `ScenarioPackManifest`, `DeclarativeRulePackContribution`, `ProviderAdapter`, `ProviderCapabilityProfile`, and testkit contracts, made stable only with released schemas and compatibility fixtures;
- deterministic package resolution, digest locking, compatibility reports, and canonical golden-IR fixtures.

## Phase 3 — Prompt and execution

- provider-neutral Prompt IR;
- deterministic prompt compiler;
- constrained `PromptCandidateIR` and auditable LLM Prompt Optimizer interface;
- Prompt Guard for mechanically provable structural coverage, with deterministic fallback for unverifiable text;
- offline Mock provider;
- bounded durable async execution, append-only events, safe receipts, cancellation, submission reconciliation, and cleanup compensation.

## Phase 4 — Adapters and evaluation

- at least one multimodal interpreter adapter;
- Seedream reference adapter;
- veImageX background-removal adapter;
- structural image validation;
- separately authorized semantic review protocol and human-acceptance artifacts;
- replay, compare, and local HTML reports.

## Phase 5 — v0.1.0

- CLI and read-only local/static HTML trace report;
- redistributable benchmark cases;
- clean-room onboarding verification;
- npm packages and a GitHub release with checksums and provenance where supported;
- ordinary npm/GitHub distribution with locked manifests, package/contribution digests, lockfile integrity, and offline compatibility fixtures;
- CLI inspection, validation, and offline test commands for explicitly registered local packages;
- complete offline Mock vertical cases as release gates;
- optional credentialed real-adapter smoke evidence outside CI and outside the default release gate;
- no production-readiness claim for v0.1.

## Out of scope for v0.1

- hosted SaaS;
- account, payment, catalog, entitlement, or publishing systems;
- physical fit or size prediction;
- production multi-tenant queues;
- interactive Trace Studio;
- video generation;
- automated semantic claims without published evidence.
- dynamic package or global `node_modules` scanning;
- plugin marketplace, remote discovery, automatic install/update, or implicit activation;
- isolation or sandboxing for untrusted third-party executable code;
- compatibility promises for extension ports outside the released `ScenarioPack`, `ScenarioPackRegistry`, `ScenarioPackManifest`, `DeclarativeRulePackContribution`, `ProviderAdapter`, `ProviderCapabilityProfile`, and testkit contracts.
