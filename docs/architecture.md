# Architecture

## 1. Design goal

The system converts free-form user intent and one or more reference images into an executable, explainable, and replayable image-generation plan.

The visual ontology is domain-rich but the runtime is product-neutral. Account systems, catalogs, pricing, entitlements, publishing workflows, and private deployment logic do not belong in this repository.

## 2. Sparse ontology

The schema can express person identity, appearance, expression, gaze, pose, garments, accessories, props, background, camera, lighting, style, references, and output contracts. An individual `OntologyInstance` contains only facts relevant to the current task and supported by explicit intent, trusted metadata supplied by a host, confirmed reference evidence, deterministic rules, or declared defaults. Consuming trusted metadata does not make a catalog system part of VOCE.

Missing information remains unknown. The system must not fill every ontology field merely because the schema can represent it.

Each value carries provenance:

```text
user_explicit
user_confirmed
trusted_metadata
reference_observed
rule_inferred
optimizer_suggested
declared_default
```

## 3. References are evidence, not single roles

A single image may contain person identity, hair, expression, pose, wardrobe, accessories, background, lighting, and camera information. The architecture separates four artifacts:

1. `Observation`: what an analyzer or user annotation reports is visible in an image.
2. `ChangeIntent`: what the target should preserve, replace, adjust, create, or remove.
3. `SourceBinding`: which observation the current task may use to preserve, reproduce, inspire, or exclude a property at a specific ontology path.
4. `OntologyInstance`: the sparse facts accepted for constraint compilation.

Example:

```text
SourceBinding
person.identity <- ref-01 preserve
person.hair     <- ref-01 preserve
pose            <- ref-03 inspire
wardrobe.top    <- ref-02 reproduce

ChangeIntent
expression      <- user intent adjust
background      <- user intent create
```

Observed content is never inherited automatically. `ChangeIntent remove` means the result must omit a property; `SourceBinding exclude` means a particular observation cannot supply it. Those are separate decisions.

## 4. Interpretation modes

- `manual`: an application or user supplies observations plus explicit observation and binding decisions without a model call.
- `assisted`: a multimodal model proposes observations; the deterministic resolver proposes bindings, and authorized people or host policy confirm high-impact decisions.
- `auto`: deterministic policy may accept low-risk proposals, while identity, product fidelity, low-confidence, rights, and conflict cases remain gated.

All automated observations include confidence, model and prompt version, evidence regions where available, and unresolved fields.

## 5. Compilation pipeline

```text
Immutable CompilationContext
        ↓
Intent Interpreter
        ↓
RequestedScopePlan
        ↓
Remote-call preflight and authorization when required
        ↓
Reference Interpreter
        ↓
Evidence and Source Resolver
        ↓
Sparse OntologyInstance
        ↓
Constraint Graph Compiler
        ↓
Reference Budget Optimizer
        ↓
Capability-aware Pipeline Planner
        ↓
Provider-neutral Prompt IR
        ↓
Constrained Prompt Candidate IR
        ↓
Prompt Guard
        ↓
ExecutionAuthorization bound to the plan hash
        ↓
Authorized provider, postprocessor, reviewer, and asset steps
        ↓
Structural validation and semantic review
```

## 6. Prompt optimization

The prompt pipeline retains separate artifacts:

```text
userIntent
ontologyInstance
compiledPromptIR
promptCandidateIR
validatedProviderPrompt
providerRevisedPrompt (when returned)
```

Hard-constraint sections of `PromptIR` are locked or represented by validated request parameters. An optimizer may propose only typed, source-linked transformations allowed by the selected mode. It may not silently modify identity policies, source bindings, hard product constraints, pose-resource decisions, or output contracts.

The deterministic `Prompt Guard` proves structural coverage: locked sections are unchanged, required parameters remain valid, references retain approved identities and order, and every transformation is allowed. Free text whose semantics cannot be proven is reviewed or discarded in favor of the deterministic prompt. The guard does not claim to understand arbitrary prose or prove model compliance.

## 7. Execution and cost boundary

Deterministic compilation, explanation, and Mock execution are offline. Optional intent/reference interpretation or prompt optimization can be remote only under explicit authorization. Any remote interpretation, LLM optimization, generation, postprocessing, semantic review, asset resolution, or asset publication requires an immutable `RemoteCallAuthorization`, a durable run, and redacted step events and receipts. Final plan execution also requires an `ExecutionAuthorization` bound to the case revision, context hash, compilation signature, plan hash, selected prompt-artifact hash, adapter/profile digests, data-transfer digest, and budget digest. Changing any bound input invalidates that authorization.

An immutable `CompilationContext` pins ontology, rule-pack, policy, adapter, capability-profile, and optimizer versions plus allowed adapters, budgets, and destinations. Deterministic signatures are computed from a canonical semantic projection that excludes timestamps, run IDs, and other volatile receipt fields.

The planner may produce steps such as:

```text
generate source image
publish a short-lived signed asset when required
remove background
normalize canvas
validate structure
prepare semantic review
run finally/compensation cleanup obligations
```

Every remote step has an adapter-specific call, retry, timeout, cost, and data-transfer budget. Cleanup is a finally/compensation obligation that runs after success, failure, cancellation, or an uncertain submission when safe. No adapter may silently remove references, reorder required inputs, alter output requirements, add calls, or switch providers.

A potentially charged call with an unknown outcome enters `submission_unknown`, then `reconciling`. Reconciliation may recover the existing result or establish a terminal outcome, but it never automatically resubmits the call.

## 8. Evaluation

A replayable run records only safe, content-addressed metadata:

- ontology and rule versions;
- reference manifest and hashes;
- provider capability snapshot;
- Prompt IR and optimizer change set;
- execution plan and step receipts;
- structural validation;
- semantic review tasks;
- output hashes.

Large or sensitive artifacts remain in host-owned storage and are referenced by redacted `ArtifactHandle` records. If an artifact is deleted or expires, artifact replay reports `unavailable`; it does not imply that the bytes can always be recovered.

Human acceptance is a separate artifact from technical execution state and probabilistic semantic findings.

Standard fixtures are synthetic or explicitly redistributable. CI never uses real user images or paid providers.
