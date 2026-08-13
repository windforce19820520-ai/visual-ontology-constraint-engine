# Architecture

## 1. Design goal

The system converts free-form user intent and one or more reference images into an executable, explainable, and replayable image-generation plan.

The visual ontology is domain-rich but the runtime is product-neutral. Account systems, catalogs, pricing, entitlements, publishing workflows, and private deployment logic do not belong in this repository.

## 2. Sparse ontology

The schema can express person identity, appearance, expression, gaze, pose, garments, accessories, props, background, camera, lighting, style, references, and output contracts. An individual `OntologyInstance` contains only facts relevant to the current task and supported by explicit intent, catalog metadata, reference evidence, rules, or declared defaults.

Missing information remains unknown. The system must not fill every ontology field merely because the schema can represent it.

Each value carries provenance:

```text
user_explicit
reference_observed
catalog_metadata
rule_inferred
optimizer_suggested
default
```

## 3. References are evidence, not single roles

A single image may contain person identity, hair, expression, pose, wardrobe, accessories, background, lighting, and camera information. The architecture separates three artifacts:

1. `Observation`: what an analyzer or user annotation reports is visible in an image.
2. `SourceBinding`: which image and observation the current task may preserve, copy, use as inspiration, or ignore for a specific ontology path.
3. `OntologyInstance`: the sparse facts accepted for constraint compilation.

Example:

```text
person.identity <- ref-01 preserve
person.hair     <- ref-01 preserve
expression      <- user intent replace
pose            <- ref-03 inspire
wardrobe.top    <- ref-02 copy
background      <- user intent replace
```

Observed content is never inherited automatically.

## 4. Interpretation modes

- `manual`: an application or user supplies annotations and source bindings without a model call.
- `assisted`: a multimodal model proposes observations; users or application rules confirm high-impact bindings.
- `auto`: the system proposes bindings, while identity, product fidelity, low-confidence, and conflict cases remain gated.

All automated observations include confidence, model and prompt version, evidence regions where available, and unresolved fields.

## 5. Compilation pipeline

```text
Intent Interpreter
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
Prompt Optimizer
        ↓
Prompt Guard
        ↓
Provider and postprocessors
        ↓
Structural validation and semantic review
```

## 6. Prompt optimization

The prompt pipeline retains separate artifacts:

```text
userIntent
ontologyInstance
compiledPromptIR
optimizedProviderPrompt
providerRevisedPrompt (when returned)
```

The optimizer may improve structure, wording, and provider adaptation. It may not silently modify identity policies, source bindings, hard product constraints, pose-resource decisions, or output contracts.

The `Prompt Guard` produces a constraint-coverage report and blocks execution if a hard constraint is missing or contradicted.

## 7. Execution and cost boundary

Compilation, explanation, and Mock execution are offline. Real execution requires explicit analyzer/provider adapters, credentials, timeouts, call budgets, retry budgets, and output limits.

The planner may produce steps such as:

```text
generate source image
publish a short-lived signed asset when required
remove background
normalize canvas
validate structure
prepare semantic review
```

No adapter may silently remove references, reorder required inputs, alter output requirements, or add calls.

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

Standard fixtures are synthetic or explicitly redistributable. CI never uses real user images or paid providers.
