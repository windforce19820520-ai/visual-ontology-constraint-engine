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

A discriminated union indicating where image evidence for an `Observation` was found. The initial variants are `rectangle` with normalized coordinates, `polygon` with normalized points, and `mask` with an `ArtifactHandle` plus coordinate-space metadata. Each variant carries an explicit `kind`; consumers must not infer the shape from optional fields.

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

An explicit, bounded authorization for a remote call made while a `CompilationSession` is interpreting or optimizing. It binds the current `contextHash`, call purpose, adapter and model versions, permitted `ArtifactHandle` and scope identifiers, remote destination and region, maximum calls, bytes, latency, and cost, expiry, and an idempotency key.

It authorizes only the declared remote compilation step. It does not authorize generation or execution of a `PipelinePlan`. Changing any bound value requires a new authorization.

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

The host owns storage, access control, retention, and deletion. Availability is checked at use time. If an artifact has expired or been deleted, its handle becomes `unavailable`; artifact replay must return that explicit state and must not silently re-download, regenerate, or issue a paid call.

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
