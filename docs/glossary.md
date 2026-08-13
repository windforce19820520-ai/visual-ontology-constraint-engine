# Glossary

> Normative terminology source. The [Simplified Chinese translation](zh-CN/glossary.md) is maintained as a semantic equivalent. Public code identifiers remain in English. If wording diverges, this document defines the public contract.

This glossary defines project terms at their architectural boundaries. It does not require an end user to learn or edit the ontology. User interfaces should translate these terms into ordinary actions such as preserve, replace, adjust, create, remove, and ignore a source.

## Design inputs and evidence

### `CaseSpec`

The normalized request for one design revision: user intent, reference assets, trusted metadata, interaction mode, host policies, and the requested output. A `CaseSpec` is input to interpretation and compilation; it is not authorization to call an external service or incur cost.

### `CompilationContext`

An immutable, content-addressed snapshot of everything a compilation checkpoint is allowed to rely on. It binds the `CaseSpec` revision and hash, referenced artifact hashes, accepted decisions, schema and rule versions, component and adapter versions, capability-profile versions, host-policy snapshot, declared remote destinations, and applicable call and cost budgets.

Each snapshot has a `contextHash`. A new input, decision, version, destination, or budget creates a new `CompilationContext`; it must not mutate an already authorized context. Remote compilation calls and final execution authorization bind to the relevant `contextHash` to prevent a checked request from being replaced before use.

### `ChangeIntent`

A structured statement of how the desired result should differ or remain stable at an ontology path. Its operations are `preserve`, `replace`, `adjust`, `create`, and `remove`.

`ChangeIntent` describes the target result. It does not decide which reference supplies evidence. In particular, `remove` means the target result must not contain an entity or property; it is different from excluding an observation from inheritance.

### `RequestedScopePlan`

The smallest planned set of ontology scopes that interpreters are permitted or required to analyze for a task, together with target assets, analysis purposes, exclusions, and clarification questions.

It is derived before detailed visual interpretation from user intent, scenario policy, asset hints, and the `OutputContract`. It limits cost and privacy exposure and prevents exhaustive image captioning merely because the ontology can express many fields.

### `Observation`

One immutable candidate claim about one reference asset at one ontology path. It includes a value, `Provenance`, optional `confidence`, optional `EvidenceRegion`, analyzer version information, warnings, and a content hash.

An `Observation` says what a model, user annotation, or trusted metadata source reports. It is not automatically an accepted fact, a hard constraint, or an instruction to inherit the observed property.

### `ObservationDecision`

The separate acceptance record for an `Observation`. It records `proposed`, `confirmed`, or `rejected`, the authorized decision authority, reason, time, and the observation content hash and context version to which the decision applies.

Changing an observation produces a new hash and invalidates any decision bound to the old content. A serialized view may project current decision status next to an observation, but the observation payload and authoritative `ObservationDecision` remain separate records.

### `ReferenceObservation`

The conceptual or adapter-level result of analyzing a reference asset, usually containing multiple `Observation` records plus unresolved items and warnings. One image may therefore contribute observations about identity appearance, hair, expression, pose, wardrobe, accessories, background, lighting, and camera at the same time.

`Observation` is the normalized claim-level contract used by resolution. `ReferenceObservation` may be used as a transport wrapper, but it must not collapse an image into one exclusive role or silently accept every contained observation.

### `EvidenceRegion`

A discriminated union indicating where image evidence for an `Observation` was found. The initial variants are `rectangle` with normalized coordinates, `polygon` with normalized points, and `mask` with an `ArtifactHandle`. Rectangle and polygon coordinates use the coordinate space defined by their typed fields; a mask's coordinate space is defined by the referenced artifact contract. Each variant carries an explicit `kind`; consumers must not infer the shape from optional fields.

An `EvidenceRegion` supports explanation and review; it does not prove that the observation is correct. Absence of a region means location evidence is unavailable, not that the claim applies to the entire image.

### `Provenance`

Machine-readable origin and derivation information for a claim, fact, suggestion, or decision. It distinguishes at least user-explicit input, reference observation, trusted metadata, rule inference, optimizer suggestion, and declared default, and records relevant source and version identifiers.

`Provenance` answers “where did this come from?” It is independent of certainty, importance, and acceptance.

## Intent, evidence, and accepted facts

### `Intent Interpreter`

A replaceable component that converts normalized user language and scenario context into `ChangeIntent`, `RequestedScopePlan`, ambiguities, and unsupported or unsafe requests. It does not inspect unapproved scopes and does not create accepted ontology facts.

### `Reference Interpreter`

A replaceable manual, fixture, or multimodal component that analyzes only the assets and ontology scopes authorized by `RequestedScopePlan`. It emits `Observation` records, unresolved items, and warnings with strict schemas and versioned analyzer metadata.

It observes candidate evidence; it does not decide what the task should inherit and must not promote identity, product fidelity, material, or logo guesses into facts.

### `SourceBinding`

A proposed relationship between one target ontology path and selected observation evidence. Its relation describes whether evidence may be used to `preserve`, `reproduce`, `inspire`, or `exclude` a property, and its priority describes the required strength.

`SourceBinding` answers “which evidence may supply or must not supply this target?” It is distinct from `ChangeIntent`, which answers “what should change in the target result?” For example, replacing an original jacket can use a `ChangeIntent` with operation `replace` and a `SourceBinding` that `reproduce`s a jacket observed in another image.

### `BindingDecision`

The explicit acceptance state and authority for a `SourceBinding`. It records whether the binding is `proposed`, `confirmed`, or `rejected`, who or what was authorized to decide, why, and the binding content hash and context version to which the decision applies.

A proposed binding is not usable merely because its observations have high confidence. High-impact bindings may require a user, trusted metadata, or host policy decision.

### `Evidence and Source Resolver`

The deterministic component that combines `ChangeIntent`, observations, `ObservationDecision` records, trusted metadata, prior confirmed binding decisions, and host policy. It produces accepted `SourceBinding` records, `BindingDecision` records, a sparse `OntologyInstance`, questions, conflicts, unresolved items, and a decision trace.

The resolver is the boundary between candidate evidence and facts accepted for compilation. It may not hide ambiguity by inventing a value.

### `OntologyInstance`

A sparse, task-specific set of accepted facts that are relevant to compilation and retain provenance and source-binding links. The ontology vocabulary may be broad, but an `OntologyInstance` contains only supported facts needed by the task.

Missing fields remain absent or explicitly unknown. The system must not fill the ontology for completeness.

## Scenario packaging and composition

### `ScenarioPack`

A distributable, versioned declarative-data package that turns public VOCE contracts into one reusable scenario experience by composing declarative rule contributions, scenario defaults, typed `OverridePoint` records, `UIMetadata`, a `FixtureSuite`, compatibility declarations, migrations, documentation, and license and provenance information.

A `ScenarioPack` is not a provider adapter, hosted application, account or catalog model, execution plan, remote-call authorization, or JavaScript entrypoint. Core reads its manifest and content-addressed, JSON-serializable contributions. Commercial virtual try-on, cosplay, and product shot are initial example packs that use the same public Core interfaces; Core does not branch on their scenario IDs.

### `ScenarioPackManifest`

The static, machine-readable declaration of a `ScenarioPack`. It includes a stable `packId`, version, Core and contract compatibility ranges, dependencies and extension relationships, contribution IDs, override points, `UIMetadata`, fixtures, migrations, capability requirements, auditable package declarations, a complete distribution inventory, license, integrity, and `PackageProvenance`.

A manifest describes package behavior and compatibility. Installing or reading it does not activate the pack, execute a ScenarioPack entrypoint, authorize a remote call, or authorize cost. It is neither a sandbox nor a security proof for separately registered code-backed plugins.

### `ScenarioPackTemplate`

A versioned scaffold that creates the minimum valid directory, manifest, example declarative `RulePack` contribution, locale-aware UI metadata, redistributable fixtures, `ScenarioMigrationDeclaration` structure, documentation, and offline validation commands for a new `ScenarioPack`.

Template output is a starting point, not evidence that the resulting pack is complete, secure, compatible, or production-ready.

### `RulePack`

A conceptual semantic rules module. The candidate v0.1 data contract used inside a `ScenarioPack` is `DeclarativeRulePackContribution` and becomes compatibility-stable only with a released schema and compatibility fixtures; executable implementations use the separate experimental `RulePackPlugin` boundary.

A `ScenarioPack` may compose multiple declarative rule contributions. `RulePack` and `ScenarioPack` are separate concepts and must not be used as synonyms.

### `DeclarativeRulePackContribution`

A versioned, content-addressed, deterministic, side-effect-free rules document that may contribute constraints, explanations, degradations, and review requirements. It performs no network call, reads no secret, incurs no fee, and makes no acceptance or authorization decision.

### `RulePackPlugin`

An experimental code-backed rules extension registered through the trusted-local-plugin path, never through ScenarioPack contribution data. It executes with Host-process privileges in v0.1 and is not covered by the ScenarioPack data-only security boundary.

### `ScenarioPackSelection`

The immutable requested input to scenario resolution: exactly one root `ScenarioPack`, zero or more explicitly selected extension packs, and an optional case-revision-bound `HostPolicyOverlay`. Required dependency extensions may be added only through deterministic resolution and remain disclosed in its trace.

Installation does not create a selection, and a selection does not activate a pack or authorize any remote or paid step.

### `ScenarioPackCatalogSnapshot`

An immutable snapshot of explicitly registered local ScenarioPack descriptors, Host availability policies, Registry revision, ScenarioPack contract version, and resolver version. Its `catalogHash` covers the sorted semantic descriptor and policy projections and is an input to resolution and the resulting Lock; acquisition locators are excluded, and later Registry changes cannot alter an existing snapshot.

### `ScenarioComposition`

The resolved package and contribution graph produced from a `ScenarioPackSelection`: one root `ScenarioPack`, explicitly selected or dependency-required extensions, their declarative rule and other contributions, and the typed host overlay. Two unrelated root scenario packs are not merged implicitly.

Composition uses declared relationships and compatibility rules, not load order or silent last-wins behavior.

### `ScenarioCompositionLock`

The immutable resolved record of a `ScenarioComposition`. It pins exact package versions; manifest, package, configuration, dependency, and contribution digests; Catalog, resolver, contract, and canonicalization versions; deterministic composition order; the Host-policy-overlay hash; compatibility results; `compositionHash`; and `lockHash`.

A lock makes composition auditable and replayable. It does not activate the pack or authorize execution, and it must not be rewritten when a package is upgraded or uninstalled.

### `EffectiveScenario`

The immutable, content-addressed semantic scenario definition produced from a valid `ScenarioCompositionLock` after its accepted `HostPolicyOverlay` and `HostOverride` records are applied. It contains resolved ontology vocabulary, declarative rules, interpretation scopes, prompt sections, review templates, defaults, capability requirements, auditable declarations, composition order, applied override IDs, and `effectiveScenarioHash` for new case compilation. `UIMetadata` remains presentation metadata outside this semantic structure.

VOCE Core consumes this public structure and its hash rather than dispatching on a built-in scenario ID. Any accepted composition or override change produces a new `EffectiveScenario` and invalidates contexts or authorizations bound to the old hash where applicable.

### `HostOverride`

One immutable, typed host-supplied operation inside a case-revision-bound `HostPolicyOverlay`. It may set declared pack configuration, set an explicitly overrideable declared default, or change activation of an explicitly overrideable `preferred` contribution, and only through an `OverridePoint` declared by the pack.

A `HostOverride` may not mutate an installed package, redefine vocabulary, weaken Core invariants, silently downgrade `hard` or `required` constraints, rewrite accepted evidence or decisions, bypass authorization, or introduce an undisclosed remote destination. Accepted and denied requests retain provenance in `PackResolutionReport`.

### `HostPolicyOverlay`

The immutable container that binds zero or more typed `HostOverride` records, authority, and reason to one case revision and includes them in deterministic resolution hashes. It is host-owned and is not a package contribution.

The overlay cannot weaken Host policy or create network, Provider, cost, evidence, decision, or execution authority. Reusing its content for another revision requires a new explicitly bound record.

### `OverridePoint`

A manifest declaration of one place the host may override: pack configuration, a declared default, or activation of a declared contribution. It includes a stable ID, target kind and path, optional value schema, whether disabling is allowed, and a maximum importance of `preferred`.

Anything not declared as an `OverridePoint` is not host-overridable. A typed override does not itself authorize a network call or waive a constraint.

### `ScenarioPackConflict`

A manifest-declared incompatibility with another package ID and version range, plus a stable reason code. It is an input to deterministic resolution rather than a load-order hint.

### `ScenarioResolutionConflict`

A structured conflict emitted during deterministic resolution for dependency, compatibility, digest, ordering, contribution, migration, or typed host-override failure. It records stable reason information, involved package versions and digests, affected paths or contributions, severity, and candidate resolutions.

A blocking `ScenarioResolutionConflict` prevents activation. It is not resolved by package load order, silent omission, or implicit weakening.

### `PackResolutionReport`

The deterministic result of resolving a `ScenarioPackSelection` and its optional `HostPolicyOverlay`. It identifies selected packages, dependency and composition traces, applied or rejected overrides, warnings, the minimal explainable `ScenarioResolutionConflict` set, actionable resolutions, the resulting lock or blocked status, and provenance for every effective contribution.

The report is an explanation artifact. It is not a migration, activation, authorization, or execution receipt.

### `FixtureSuite`

A versioned set of synthetic, original, public-domain, or explicitly redistributable cases and expected deterministic artifacts used to validate a pack offline. It covers successful, conflict, unknown, override, dependency, budget, migration, and applicable no-person behavior.

Standard fixtures use no credential, private asset, network access, or paid provider. They compare structured contracts, explanations, plans, signatures, and Mock receipts rather than treating generated pixels as golden output.

### `UIMetadata`

Locale-aware presentation metadata containing `displayName`, `description`, optional `instructions`, and a message-key map; stable disclosures with severity and resolvable message keys; and accessibility declarations for required text alternatives, keyboard-operable reference selection, and information that does not rely on color alone.

`UIMetadata` has no semantic or authorization authority. Its `defaultLocale` must exist, required disclosure keys must resolve and be acknowledged before activation, and the accessibility declaration defines host-renderer requirements rather than certifying the host application.

### `PackActivation`

The explicit host record that binds one case revision to exact selection, Catalog/Registry revision, `ScenarioCompositionLock`, `EffectiveScenario`, and resolution-report hashes after required offline gates and disclosures pass. Installation, registration, resolution, and inspection precede activation but do not imply it.

Activation grants no remote-call or execution authority. Existing contexts, authorizations, and runs remain pinned to their recorded package versions and digests.

### `PackDeactivation`

The immutable Host availability-policy record that prevents a pack or exact version from receiving new case-scoped activations at an exact Registry revision without deleting local bytes or historical records. It is separate from `PackActivation`, does not cancel in-progress work, and does not erase package provenance.

Deactivation is normally required before uninstall. Reverse dependencies and active use may still block uninstall.

### `PackUninstallCheck`

The immutable preflight result for removing locally available ScenarioPack data from an exact Registry revision. It records blocking reasons, active activations and availability policies, selections, reverse dependencies, compilation sessions, execution runs, pending migrations, replay requirements, and whether uninstall is currently blocked. A check grants no permission to delete data.

### `PackUninstallReceipt`

The immutable result of an atomic Registry removal based on a matching allowed check. It records Registry revisions, removed local package bytes, descriptor/provenance tombstone hashes, preserved historical records, unavailable replay Lock hashes, and a receipt hash. Uninstall never deletes user assets, historical evidence, decisions, runs, or receipts and never substitutes another package version.

### `ScenarioMigrationDeclaration`

A content-addressed declarative migration record supplied by a pack. It identifies a stable migration ID, source version range, target version, allowed configuration or contribution-ID operations, and a content digest; it is data, not an executable lifecycle hook.

A declaration performs no network or provider call and never rewrites historical observations, decisions, compilation contexts, execution runs, events, or receipts.

### `MigrationPlan`

The deterministic, previewable, network-free plan built for an exact source `ScenarioCompositionLock` and target `ScenarioPackSelection` from applicable `ScenarioMigrationDeclaration` records. It pins the source case revision/editable-state hash and target case revision, Catalog, Lock, EffectiveScenario, and resolution-report hashes, contains ordered operations, unresolved items, and a `planHash`; destructive or ambiguous operations require an auditable confirmation hash.

The dry-run already resolves and pins the target selection, Catalog, lock, and `EffectiveScenario`. Applying a safe plan validates those pins plus the source editable-state hash, then creates only the next editable case revision and `MigrationReceipt`. A missing required declaration or unsafe unresolved item blocks candidate activation rather than guessing a conversion.

### `MigrationReceipt`

The immutable record of one attempted `MigrationPlan`, including its plan hash, source and target lock and effective-scenario hashes, new case revision, applied operation hashes, unresolved items, and receipt hash. It contains no secret or private artifact content and is not an execution authorization.

### `ScenarioPackPublishAudit`

The immutable result of an ordinary clean-package audit, including complete distribution, semantic package, and manifest hashes, validator and template versions, fixture-suite digests, check results with safe evidence hashes, and an `auditHash`.

A passing audit proves only conformance to the ScenarioPack contract and declared offline fixtures. It does not install, register, activate, authorize, certify security, prove model quality, or establish production readiness.

### `PackageProvenance`

Machine-readable authored supply-chain origin for a published pack: publisher and optional source repository, revision, and source digest. The Host-owned `PackageAcquisition` separately records source kind, locator, complete distribution digest, and that lifecycle scripts were not executed; `ScenarioPackDescriptor` records the computed semantic package digest.

`PackageProvenance` supports integrity and trust decisions but is not an endorsement, security proof, rights guarantee, or production-readiness claim.

### `PackageAcquisition`

The Host-owned record of where ScenarioPack bytes were obtained, the digest of the complete distribution archive, and confirmation that package lifecycle scripts were not executed. It is not authored provenance and does not grant trust or activation.

## Compilation and planning

### `ConstraintIR`

The provider-neutral, serializable intermediate representation of accepted goals, hard and soft constraints, conflicts, dependencies, shared resources, degraded preferences, review requirements, explanations, rule traces, and a deterministic signature.

### `Constraint Graph Compiler`

The deterministic compiler that transforms accepted facts, `ChangeIntent`, source bindings, the `OutputContract`, and versioned rule packs into `ConstraintIR`. It propagates dependencies, occlusion, visibility, incompatibility, and resource claims and explains blocking conflicts or permitted degradation before provider execution.

### `ReferencePlan`

The deterministic record of selected, ordered, omitted, and blocked reference assets for a target provider capability profile, including dependencies, byte and count budgets, and reasons for each decision.

### `Reference Budget Optimizer`

The planner that produces a `ReferencePlan` under provider reference-count, byte-size, ordering, role, and dependency limits. It preserves required parent/detail relationships and source isolation; it must explain omissions rather than silently truncate inputs.

### `OutputContract`

The explicit target requirements for the produced artifact, such as dimensions, aspect ratio, format, Alpha channel, background behavior, byte limits, and downstream use. It states the desired outcome, not an assumption that one provider can produce it directly.

### `ProviderCapabilityProfile`

A versioned description of observed or contractually declared provider capabilities and limitations, including supported inputs, reference budgets, generation or edit behavior, output formats, Alpha support, timeouts, incompatibilities, and verification evidence.

### `PipelinePlan`

A bounded, acyclic execution plan that can satisfy an `OutputContract` using declared adapter capabilities. It includes a schema version and content hash, step and adapter versions, dependencies, maximum calls, retries, timeouts, data destinations, cleanup obligations, cost ceilings, and feasibility explanations.

### `Capability-aware Pipeline Planner`

The deterministic planner that matches an `OutputContract` to `ProviderCapabilityProfile` records and registered processing steps. It may plan asset resolution, generation, temporary publication, background removal, normalization, validation, semantic review, and cleanup. If the output contract is unreachable within the declared budget, it fails before a paid call.

### `Provider Adapter`

A bounded integration that translates a validated plan step into a particular external or local provider request and normalizes the response. It must declare capabilities, data destinations, possible fees, timeout and retry behavior, and redaction rules. It may not reinterpret task intent, silently remove or reorder required references, invent capability, add calls, or weaken the `OutputContract`.

## Authorization and TOCTOU protection

### `RemoteCallAuthorization`

An explicit, bounded authorization for one remote or potentially fee-bearing step, whether it occurs during compilation or inside an approved `PipelinePlan`. It binds the current `contextHash`, call purpose, adapter and model versions, permitted `ArtifactHandle` and scope identifiers, remote destination and region, maximum calls, retries, bytes, latency, and cost, expiry, and an idempotency key.

It authorizes only the named step and cannot authorize a different step or an entire plan. Generation or other plan execution additionally requires the exact `ExecutionAuthorization`; changing any bound value requires a new authorization.

### `ExecutionAuthorization`

An explicit authorization to create and dispatch one `ExecutionRun` for an exact compiled result. It binds the `contextHash`, `PipelinePlan` version and hash, selected `PromptCandidateIR` or deterministic `PromptIR` hash, capability and adapter versions, remote destinations, output requirements, call/retry/time budgets, cost ceiling, expiry, and authorization authority.

Immediately before any remote dispatch, the runtime recomputes and compares all bound hashes and snapshots. A mismatch makes the authorization stale and blocks the call. An authorization cannot be reused across a new revision, destination, provider version, prompt candidate, plan, or increased budget. This check-at-dispatch rule is the project’s primary time-of-check/time-of-use (TOCTOU) protection.

## Prompt compilation and protection

### `PromptIR`

The deterministic, provider-neutral, structured prompt representation compiled from accepted facts and constraints. Its sections link text and request parameters back to constraint and source identifiers, and it includes prohibitions, planned references, the `OutputContract`, and a deterministic signature.

`PromptIR` is not a provider-ready natural-language prompt and is not overwritten by later optimization or provider rewriting.

### `PromptCandidateIR`

A structured, immutable candidate derived from `PromptIR` for a particular provider. It contains candidate prompt sections, request parameters, reference mappings, an explicit transformation set linked to source and constraint identifiers, provenance-bearing additions, coverage claims, warnings, target adapter/version, and a content hash.

It is a candidate for guarding and authorization, not proof of semantic equivalence and not permission to execute. A deterministic compiler may emit a baseline `PromptCandidateIR`; an optional optimizer may emit additional candidates.

### `Prompt Optimizer`

An optional offline or model-backed component that adapts `PromptIR` for a provider by rephrasing, reordering, removing redundancy, moving intent into parameters, or adding only mode-permitted suggestions. It returns one or more `PromptCandidateIR` records with an explicit change set, coverage claims, provenance-bearing additions, and warnings.

An optimizer may improve expression but may not silently alter identity policy, product fidelity, confirmed source bindings, hard pose/resource choices, or the `OutputContract`.

### `Prompt Guard`

An independent deterministic check that compares a `PromptCandidateIR` with `PromptIR`, accepted bindings, request parameters, and hard constraints. It can prove schema validity, identifier and structured-field coverage, parameter consistency, and whether declared transformations belong to an allowlist. It blocks deterministic structural omissions, contradictions, binding changes, prohibited structured additions, and promotion of suggestions to user facts.

The guard cannot deterministically prove that arbitrary natural-language text preserves meaning, even when every required identifier is present. If a candidate depends on a free-text rewrite outside a controlled deterministic template, policy must either request human or probabilistic semantic review, reject it, or fall back to the deterministic prompt candidate. Probabilistic review informs a decision; it is not a proof. The guard proves only structural coverage and allowed structured transformation, and never claims that a generative model will comply with the prompt.

### `providerRevisedPrompt`

A prompt rewrite returned by a generation provider, when available. It is recorded as a separate provider artifact for audit and comparison and never replaces `PromptIR` or the project’s own optimization result.

## Validation and review

### `Structural Validation`

Deterministic or directly measurable checks on an artifact and its execution contract, such as file signature, MIME type, dimensions, Alpha channel, byte size, expected output count, hashes, and required receipts. Passing structural validation does not prove visual or semantic fidelity.

### `Semantic Review`

Probabilistic model review or human assessment of meaning and visual fidelity, such as identity continuity, garment or product detail, occlusion, pose plausibility, material appearance, or artistic acceptability. Findings retain reviewer and version provenance and may produce `needs_review`; they are not silently promoted to objective facts.

## Lifecycle, artifacts, and evidence

### `CompilationSession`

The pre-execution lifecycle for interpreting, resolving, compiling, and planning one `CaseSpec` revision. It advances through immutable `CompilationContext` snapshots. Any remote interpreter or optimizer step requires its own `RemoteCallAuthorization` and produces step events and a receipt. A session may become `ready` or `blocked`; `ready` means a feasible bounded plan exists and does not grant `ExecutionAuthorization`.

### `ExecutionRun`

One attempt to execute a confirmed `PipelinePlan` under an exact `ExecutionAuthorization`. It has its own state, bound hashes, budgets, adapter snapshots, receipts, outputs, and parent revision. A retry or live rerun requires authorization and creates a new `ExecutionRun`, not continuation disguised as exactly-once execution.

### `ArtifactHandle`

An opaque, host-owned, content-addressed reference to an input, intermediate, output, mask, or report. It exposes safe metadata such as content hash, media type, byte size, logical role, resolver identifier, availability state, retention class or expiry, and redaction policy, but not image bytes, Base64 data, credentials, or expiring URLs.

The host owns storage, access control, retention, and deletion. Availability is checked at use time. If an artifact has expired or been deleted, its handle records `expired` or `deleted`, and artifact replay returns `ARTIFACT_UNAVAILABLE`; it must not silently re-download, regenerate, or issue a paid call.

### `StepEvent`

An immutable, append-only event for one compilation-time remote step or one `ExecutionRun` step. It records a unique event and correlation identifier, monotonic sequence, step and state transition, time, bound context/plan hashes, authorization identifier, safe input/output summaries, and reconciliation metadata where applicable.

History is corrected by appending a new event, never by rewriting an earlier event. Materialized status and receipts are projections of the ordered event stream.

### `StepReceipt`

A redacted evidence projection for one remote step. It may be linked either to a compilation-time remote step in a `CompilationSession` or to a step in an `ExecutionRun`, and references the append-only `StepEvent` sequence from which it was derived. It contains safe identifiers, bound hashes and authorization, input and output hash summaries, adapter/version, timestamps, optional provider request and cost evidence, failure code, and cleanup status. It must not contain secrets, image bytes, Base64 payloads, biometric descriptions, or expiring asset URLs.

`submission_unknown` means a remote request may have been accepted or charged but no reliable acknowledgement was received. An authorized person or host process may reconcile it by appending provider evidence and a reconciliation `StepEvent`. The runtime must never automatically resubmit, retry, or create a replacement paid call from `submission_unknown`; a deliberate new call requires a new authorization and run or step identity.

## Independent axes

### `confidence`

Epistemic uncertainty about whether an `Observation` is correct. It is normally numeric or calibrated by an interpreter. High `confidence` does not imply user importance or authorization to accept a claim.

### `importance`

How strongly the desired result requires an intent, fact, binding, or constraint. The values have operational meaning:

- `hard`: if unsatisfied, contradicted, or unresolved, compilation is blocked and execution is forbidden;
- `required`: it cannot be downgraded automatically; execution may proceed without it only through an explicit, traced waiver or a new case revision that changes its importance;
- `preferred`: a declared deterministic rule may degrade it automatically, but the degradation and reason must appear in the trace.

High `importance` does not prove that supporting evidence is correct. A waiver records an authorized exception; it does not rewrite evidence or pretend the requirement was satisfied.

### `decisionStatus`

Whether an authorized decision has left a candidate `proposed`, `confirmed`, or `rejected`. Confirmation is an acceptance decision, not a confidence score. Implementations may expose the field as `status` in a specific contract, but documentation uses `decisionStatus` when distinguishing this axis.

These three axes are independent. A high-confidence observation may be rejected or irrelevant; a hard requirement may depend on uncertain evidence and therefore require clarification.

## Missing and unresolved information

### `unknown`

The system needs or tracks a value but does not have adequate evidence to assert it. `unknown` is a valid open-world state and must not be replaced by an invented default.

### `unspecified`

The user, host policy, or contract did not request a value and the task does not currently require one. An `unspecified` field is normally omitted from the sparse `OntologyInstance`; it is not an analysis failure.

### `unresolved`

The system has identified a consequential question, ambiguity, conflict, or evidence gap that still requires a decision or additional evidence before a particular operation can proceed. An unresolved item records its reason, impact, and possible resolution path.

In short: `unknown` means “needed but not known,” `unspecified` means “not requested or currently needed,” and `unresolved` means “a known open decision or conflict remains.”

## Replay and comparison

### `replay`

An umbrella term with three distinct meanings:

1. **Plan replay** — recompile the same confirmed inputs with the same schema, rules, adapters, and capability versions. Deterministic IR, plans, and signatures should match; no paid generation call is required.
2. **Artifact replay** — rerun downstream processing, evaluation, or reporting from available `ArtifactHandle` records and receipts without resubmitting the original model call. If any required artifact has expired or been deleted, replay returns `unavailable` and does not silently regenerate it.
3. **Live rerun** — submit a new external provider call using a prior case or plan as input. It requires a current authorization, creates a new `ExecutionRun`, may incur cost, and does not promise pixel-identical output.

Documentation and APIs must name the intended replay mode. An unqualified promise of “reproducible generation” must not imply pixel-identical results from live generative providers.
