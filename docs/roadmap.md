# Roadmap

This roadmap is directional. A milestone is complete only when its contracts, tests, documentation, and offline examples are complete.

## Current status

- Published candidate: `v0.1.0-rc.5`, with five npm packages under `next`.
- Current `main`: post-RC.5 stabilization and Public Playground operational hardening.
- Public preview: a single-instance deployment on a temporary hostname.
- Provider positioning: Seedream recommended BYOK, Grok optional BYOK, and Cloudflare free experimental preview.
- Current focus: feedback, operational observation, compatibility, and the first stable v0.1 release.

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
- provider-neutral optional postprocessing extension validation;
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
- concrete background-removal services, transparent cutout production, or host-canvas compositing;
- automated semantic claims without published evidence.
- dynamic package or global `node_modules` scanning;
- plugin marketplace, remote discovery, automatic install/update, or implicit activation;
- isolation or sandboxing for untrusted third-party executable code;
- compatibility promises for extension ports outside the released `ScenarioPack`, `ScenarioPackRegistry`, `ScenarioPackManifest`, `DeclarativeRulePackContribution`, `ProviderAdapter`, `ProviderCapabilityProfile`, and testkit contracts.

## Visual composition MVP status

The first declarative visual-composition vertical shipped in `v0.1.0-rc.4`: 29 canonical camera-owned paths, 30 atomic selector presets, typed ScenarioPack rules and prompt sections, deterministic conflict/dependency disposition, explicit Prompt IR exclusions, and Guard anti-relink checks. An exact public-registry consumer verified the packaged surface. Three separately authorized Seedream calls exercised representative conflict, framing, layout, lens, and reflection combinations; they are qualitative evidence outside the standard release gate.

RC.4 does not add a Playground/UI, composition-reference assets, or provider-native composition controls. Example artwork remains host selection guidance rather than model input. Those product and adapter units remain separately scoped follow-up work.

The follow-up Playground Host shipped in `v0.1.0-rc.5` as the separate `@voce-engine/playground` package. It implements an English Browser UI, ontology-first Compile/Inspect, guarded prompt materialization, Mock generation, Seedream recommended BYOK, Grok optional BYOK, Cloudflare Free as an experimental preview rather than the quality representative, Virtual Try-On conditional garment/accessory semantics, Cosplay-only access to the 30-preset gallery, and a development-only validation-package export. Local manual acceptance on 2026-08-21 exercised multiple Try-On, Cosplay, and composition scenarios with Cloudflare Free and Seedream BYOK.

The current source subsequently added public-mode validation, server-issued sessions, bounded temporary storage, structured redacted logs, quota interfaces and gates, reviewed Cloudflare/Seedream/Grok transports, and a single-instance Nginx/systemd deployment baseline. A separately authorized temporary-host deployment passed Mock-only online acceptance on 2026-08-21. This is not a multi-instance or durable-global-quota claim: an owned domain, durable atomic quota storage, long-term monitoring/incident operations, feedback operations, and any further real-Provider quality acceptance remain follow-up work.
