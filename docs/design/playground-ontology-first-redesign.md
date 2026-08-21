# VOCE Playground Ontology-First Redesign

- **Project:** Visual Ontology & Constraint Engine (VOCE)
- **Target baseline:** `main` at `b0b2538d124194af82ab84db8dbaec90ce5588ec`, public package line `0.1.0-rc.4`
- **Status:** implemented on the open PR #32 branch and verified locally on 2026-08-21; not merged, released, or publicly deployed
- **Scope:** Playground compile and bounded-render architecture
- **Authorization:** this document does not grant execution authority. A real Provider call, public deployment, paid resource creation, secret injection, tag, release, merge, or modification of the published `v0.1.0-rc.4` tag always requires the user's current explicit authorization.

> **2026-08-20 product amendment:** [Playground Try-On Accessories, Cosplay Composition, and Local Validation Amendment](playground-tryon-cosplay-input-amendment.md) supersedes this document's fixed four-reference Try-On model, Try-On composition selector, explicit `Separate top + bottom` mode, and untyped accessory-detail assumptions. It places typed accessories in Virtual Try-On and the 30 composition presets in Cosplay. The amendment is normative where the two documents differ.

## 1. Purpose

The earlier Playground proposal correctly defined the product experience: a thin public Host where a user uploads references, selects visual-composition presets, compiles a readable VOCE plan, optionally renders one image, and inspects trace and feedback information.

Its implementation boundary needs one material correction:

> The Provider prompt must remain the output of the VOCE ontology, constraint, reference-planning, Prompt IR, optimization, and Prompt Guard chain. The Playground must not display a VOCE plan and then send a separately handwritten scenario prompt to the image model.

This redesign keeps the earlier product, privacy, security, mobile, accessibility, error-handling, and cost-control requirements. It replaces the semantic integration design and the order of implementation.

## 2. Decisions

The following decisions are normative for the Playground implementation.

1. **There is one semantic authority chain.** `ScenarioPack`, explicit user declarations, ontology scope, `ChangeIntent`, evidence decisions, `ConstraintIR`, `ReferencePlan`, `PipelinePlan`, `PromptIR`, `PromptCandidateIR`, Prompt Guard, and `ProviderRenderRequest` are the only path by which generation semantics reach a Provider.
2. **The Browser never supplies a semantic prompt or ontology path.** It submits a scenario ID, declared reference-slot roles, approved typed UI inputs, visual-composition preset selections, files, and an allow-listed Provider profile selection. Any user-provided credential travels through a separate request-scoped secret channel and is never semantic input.
3. **A declared slot role is not an Observation.** Uploading a file into `person-identity` authorizes a source role; it does not prove any face, color, material, body measurement, weapon type, or other ontology fact.
4. **A declared slot role is not a confirmed `SourceBinding`.** A `SourceBinding` remains valid only when it references real `Observation` records and is backed by the required decisions. The Host must not manufacture observations merely to satisfy the schema.
5. **The role policy is closed-world and ScenarioPack-derived.** Authoritative roles, allowed contributions, prohibited contributions, operations, and importance come from the selected immutable ScenarioPack distribution. The Host validates and projects that data; it does not maintain a second semantic mapping. A declared role first produces a Host `ReferenceCandidateSeed`. After M4 creates and possibly merges/degrades constraints, a deterministic `ReferenceCandidateBinder` may link that seed only to active or satisfied constraints derived from the seed's own role intents and authorized ontology scopes. Unlinked target paths are not authorized contributions from that reference.
6. **Prompt Guard remains before Provider materialization.** No Provider-specific layer may re-author the semantic prompt after Guard.
7. **Provider materialization is mechanical.** It may serialize accepted sections, parameters, mappings, artifacts, and protocol fields. It may not add scenario fidelity prose, provider glosses, dropped constraints, inferred facts, or unguarded user text.
8. **Core remains scenario-agnostic.** No `if (scenario === 'cosplay')` or equivalent scenario-name branch may be added to Core.
9. **The Playground remains an external-style Host.** It lives outside `packages/*`, consumes public package entry points, does not import `packages/core/src/**`, and has a registry-install build gate.
10. **Render remains disabled in CI and ordinary development, while the product default is Cloudflare Free.** The first selected real default profile is Cloudflare Workers AI `@cf/black-forest-labs/flux-2-klein-4b`. A deployment may enable it only with an approved server-side Cloudflare account/token and a hard free-quota gate. Seedream and Grok Imagine remain optional BYOK choices. No real transport, secret injection, or smoke call is authorized merely by selecting these profiles in code.
11. **Pose is a reference role, not an editor feature.** A ready-made skeleton image, ordinary pose photograph, or pose sketch may be declared as a `pose` reference. V1 does not generate, extract, or edit skeletons. The source may contribute only the approved pose scope and must not contribute identity, clothing, background, or style.
12. **Credential modes are explicit.** Cloudflare uses an operator-managed server credential that is never exposed to the browser; Seedream and Grok use an ephemeral user-provided key for one request. Compile remains usable without any credential. Neither credential mode may be stored, logged, hashed, returned, placed in VOCE contracts, or used for an automatic validation or retry call.

## 3. Repository-grounded current state

### 3.1 Public Core surface

`packages/core/src/index.ts` publicly exports the resolver/evidence surface and the M4, M5, M6, and visual-composition modules. The Playground can therefore reuse public functions and types without deep imports.

The current public chain already contains the important semantic and integrity objects:

```text
RequestedScopePlan
→ Observation / ObservationDecision (when evidence exists)
→ SourceBinding / BindingDecision (when evidence exists)
→ OntologyInstance
→ ConstraintIR
→ ReferencePlan
→ PipelinePlan
→ PromptIR
→ PromptCandidateIR
→ PromptGuardResult
→ ProviderRenderRequest
```

### 3.2 Prompt compilation and guard

The current `PromptCompiler` derives ordered sections from active or satisfied constraints and the resolved scenario prompt-section policy. It also derives typed output parameters, ordered reference mappings, constraint coverage, prohibitions, and explicit excluded constraints.

The current Prompt Guard protects locked sections and parameters, verifies candidate hashes and target adapter/profile identity, rejects reintroduced excluded constraints, and requires declared transformation proof for permitted changes.

`createProviderRenderRequest(...)` then binds the accepted prompt artifact to:

```text
case / revision / context
PromptIR hash
optional PromptCandidate hash
optional PromptGuard result hash
target adapter and capability profile
sections
parameters
reference mappings
output contract
pipeline plan hash
request hash
```

Therefore a second Playground prompt compiler is neither necessary nor permitted.

### 3.3 Provider layer

The public M6 surface includes a guarded Provider transport model and `SeedreamAdapter`. The adapter accepts a provider-native `SeedreamGenerateInput` containing `prompt`, images, and provider parameters. It does not currently accept `ProviderRenderRequest` directly.

This is a real integration gap, but it is a Host bridge gap—not a reason to create a second semantic prompt path.

### 3.4 M9 smoke limitation

`scripts/m9-seedream-smoke.mjs` is valuable evidence that the real transport, authorization, artifact handling, composition closure, and Seedream response path can work. It is not the production Playground prompt path.

The script currently contains handwritten `INPUT_SPECS.binding`, `COSPLAY_FIDELITY_PROMPT`, and `COMPOSITION_GLOSSES`, then appends VOCE-generated composition sections. Those constants must not be copied into the Playground. They prove a bounded experiment, not complete ontology-to-Provider closure.

### 3.5 Scenario fixture gap

The Cosplay fixture already declares recognizable source roles such as `person-identity`, `character-design`, `signature-prop-detail`, and `pose`, with declarative target-path policies.

The Virtual Try-On fixture is still an older, mostly single-reference offline fixture. It does not yet implement the amended slot-driven public experience:

```text
person-identity
garment-full-body | garment-top | garment-bottom (at least one garment slot)
fit-reference (optional)
footwear-detail (optional)
pose (optional)
```

The two fixture packs also use different shapes for `interpretationScopes`. The Playground must not assume that the current fixtures already form one stable, typed Host role-policy contract.

### 3.6 Evidence boundary

The public `SourceBinding` contract requires at least one `observationId`. The resolver also requires observations and decisions to be current and confirmed before a binding can contribute an ontology fact. It enforces exact ontology-path matching.

Consequently, the Playground may not convert “the user placed this image in a garment slot” into a fabricated observation such as “the garment is blue silk” or into a fake confirmed `SourceBinding`.

### 3.7 `ProviderRenderRequest` limitation

`PromptIR` contains `forbidden` and `excludedConstraints`, while the current `ProviderRenderRequest` carries sections, parameters, reference mappings, and output. It does not independently carry the `forbidden` collection. The current reference mapping also carries approved constraint IDs but no explicit prohibited contribution paths. That is insufficient to prove that a generic multi-image Provider was told to use a pose reference only for pose while excluding its identity, clothing, background, and style.

Reference isolation must therefore be resolved before semantic closure is claimed. The preferred minimum RC.5 evolution is to project ScenarioPack `exclude` relations into Guard-protected reference-isolation data in `PromptIR` and the accepted `ProviderRenderRequest` reference mappings. The repository-grounded PR 0 review must confirm the exact smallest compatible shape. The Playground materializer must not reach back to a hidden `PromptIR`, synthesize isolation prose or a negative prompt, or silently add prohibitions after Guard.

### 3.8 Reference-candidate timing

`ReferenceBudgetOptimizer` validates `ReferenceCandidate.constraintIds` against an already compiled `ConstraintIR`. M4 also creates content-addressed constraint IDs and may merge multiple intents for a cardinality-one path or mark a preferred constraint unsatisfied.

Therefore `ScenarioInputCompiler` cannot truthfully emit final `ReferenceCandidate` records before M4. It must emit Host-only candidate seeds containing stable asset/role identity, authorized ontology scopes, and the exact role-intent IDs. A second deterministic Host step binds those seeds to the actual active or satisfied constraints after `ConstraintIR` exists, then computes final `ReferenceCandidate` hashes.

## 4. Target architecture

```text
Browser
  │
  │ scenarioId + declared roles + typed selections + files
  ▼
Playground Server / BFF
  │
  ├─ UploadPolicy + ArtifactSession
  ├─ ScenarioDistributionRegistry
  ├─ ScenarioInputCompiler
  │    ├─ RequestedScopePlan
  │    ├─ ChangeIntent[]
  │    ├─ ReferenceCandidateSeed[] (Host DTO)
  │    ├─ ReferenceDependencySeed[] (Host DTO)
  │    └─ DeclaredRolePlan (Host DTO only)
  │
  ├─ VOCE CompilationOrchestrator
  │    ├─ resolve ScenarioPack → EffectiveScenario
  │    ├─ resolve evidence (zero observations is valid)
  │    ├─ compile ConstraintIR
  │    ├─ ReferenceCandidateBinder
  │    │    ├─ ReferenceCandidate[]
  │    │    └─ ReferenceDependency[]
  │    ├─ plan ReferencePlan
  │    ├─ plan PipelinePlan
  │    ├─ compile PromptIR
  │    ├─ optimize PromptCandidateIR
  │    ├─ Prompt Guard
  │    └─ create ProviderRenderRequest
  │
  ├─ PlaygroundPlanProjector
  │
  └─ Generate path (only when enabled)
       ├─ recompile and verify binding
       ├─ ProviderRequestMaterializer
       ├─ RemoteCallAuthorization / budget preflight
       ├─ configured Provider adapter + transport
       └─ output validation + cleanup
```

## 5. Host scenario distribution

### 5.1 Do not run production from test fixtures

The production Host must not import `@voce-engine/testkit` or treat `fixtures/packs/**` as an implicit runtime contract.

The implementation should create an immutable Playground scenario distribution, generated or validated from reviewed scenario-pack sources. A reasonable initial location is:

```text
playground/
└─ scenarios/
   ├─ cosplay/
   │  ├─ manifest.json
   │  ├─ contributions/
   │  └─ checksums.json
   └─ virtual-tryon/
      ├─ manifest.json
      ├─ contributions/
      └─ checksums.json
```

The exact layout may change after repository-validator review, but the following properties are required:

- deterministic content digests;
- no executable scenario code;
- no secrets or network permissions;
- no duplicate manually maintained semantics between UI and ScenarioPack;
- CI drift detection;
- runtime registration through public Core APIs;
- no dependency on `testkit` in a production build.

### 5.2 Scenario-derived declared role policy

The Browser is allowed to send only a role identifier that exists in the selected scenario distribution. The Server resolves ScenarioPack `interpretationScopes` and related declarations into an immutable Host projection. The ScenarioPack distribution remains the semantic source of truth; Host code may add layout, labels, and help text but may not hand-author a second role-to-ontology mapping.

Proposed Host contract:

```ts
interface ResolvedDeclaredReferenceRolePolicy {
  schemaVersion: 'voce.playground-resolved-role-policy/v1alpha1'
  id: string
  scenarioId: string
  role: string
  minCount: number
  maxCount: number
  targets: ReadonlyArray<{
    targetPath: string
    operation: 'preserve' | 'replace' | 'adjust'
    importance: 'hard' | 'required' | 'preferred'
  }>
  prohibitedTargetPaths: readonly string[]
  displayOnlyNonContributions: readonly string[]
}
```

The projection uses one deterministic mapping: `preserve → preserve`, `reproduce → replace`, `inspire → adjust`, while `exclude` creates no target `remove` intent and instead populates `prohibitedTargetPaths`. Importance comes from the declarative relation priority. Unknown relations or missing paths block before M4.

`displayOnlyNonContributions` is human-readable UI text derived from the same prohibition data. It is not an `Observation`, `OntologyFact`, `SourceBinding`, or target `remove` intent.

The role policy is validated against the selected `EffectiveScenario` vocabulary. A Browser-supplied arbitrary path is rejected before compilation.

## 6. ScenarioInputCompiler

### 6.1 Input

```ts
interface PlaygroundScenarioInput {
  scenarioId: 'virtual-tryon' | 'cosplay'
  assets: readonly ArtifactHandle[]
  declaredRoles: ReadonlyArray<{
    assetId: string
    role: string
    order: number
  }>
  compositionSelections: ReadonlyArray<{
    presetId: string
    inputs?: Readonly<Record<string, unknown>>
    importance?: 'required' | 'preferred'
  }>
  typedUserInputs?: Readonly<Record<string, unknown>>
  outputContract: OutputContract
}
```

The general-purpose raw prompt field is not part of this contract.

### 6.2 Output

The first Host stage deliberately does **not** emit final Core `ReferenceCandidate` records, because their `constraintIds` do not exist until M4 has compiled, merged, and possibly degraded constraints.

```ts
interface ReferenceCandidateSeed {
  schemaVersion: 'voce.playground-reference-candidate-seed/v1alpha1'
  id: string
  assetId: string
  artifact: ArtifactHandle
  role: string
  orderKey: string
  importance: 'hard' | 'required' | 'preferred'
  ontologyScopes: readonly string[]
  authorizedTargetPaths: readonly string[]
  prohibitedTargetPaths: readonly string[]
  supportingIntentIds: readonly string[]
  seedHash: string
}

interface ReferenceDependencySeed {
  schemaVersion: 'voce.playground-reference-dependency-seed/v1alpha1'
  id: string
  parentSeedId: string
  childSeedId: string
  kind: string
  importance: 'hard' | 'required' | 'preferred'
  reasonCode: string
  explanation: string
  seedHash: string
}

interface ScenarioCompilationSeed {
  requestedScopePlan: RequestedScopePlan
  changeIntents: readonly ChangeIntent[]
  referenceCandidateSeeds: readonly ReferenceCandidateSeed[]
  referenceDependencySeeds: readonly ReferenceDependencySeed[]
  declaredRolePlan: PlaygroundDeclaredRolePlan
}
```

These seed types are Playground Host DTOs. They are not new Core public contracts.

### 6.3 Scenario-input compilation rules

For every declared role:

1. Resolve the immutable role policy from the selected ScenarioPack distribution; reject any independent Host semantic mapping that disagrees with it.
2. Validate cardinality and asset ownership.
3. Validate every target path against the resolved scenario vocabulary.
4. Create a `RequestedScope` for each authorized target path and asset.
5. Create a `ChangeIntent` for each target policy. `sourceHintIds` must include the corresponding asset ID, role-policy ID, and candidate-seed ID.
6. Create a `ReferenceCandidateSeed` containing only the role's authorized scopes, prohibited contribution paths, and the exact IDs of the role-derived intents. Do not guess final constraint IDs.
7. Create any dependency seeds using stable candidate-seed IDs; do not finalize dependencies for omitted candidates yet.
8. Do not create a `ManualObservationDeclaration` unless the user explicitly entered a typed value that the UI and scenario contract identify as a fact.
9. Do not create a `SourceBinding` unless real observations and required confirmed decisions exist.
10. Expand visual-composition presets through `expandVisualCompositionPreset(...)`; do not reproduce preset semantics in the Browser.
11. Accept a `pose` asset only as a declared ready-made skeleton, ordinary pose photograph, or pose sketch; do not infer its pose content, identity, clothing, background, or style and do not add a skeleton editor or extractor in V1.
12. Reject unknown roles, duplicate incompatible slots, missing required roles, arbitrary paths, or stale scenario digests before M4.

### 6.4 ReferenceCandidateBinder

After `ConstraintIR` exists, the Host runs a second pure deterministic step:

```ts
interface ReferenceCandidateBindingResult {
  candidates: readonly ReferenceCandidate[]
  dependencies: readonly ReferenceDependency[]
  omittedSeeds: ReadonlyArray<{
    seedId: string
    reasonCode: string
  }>
}

bindReferenceCandidates(input: {
  seeds: readonly ReferenceCandidateSeed[]
  dependencySeeds: readonly ReferenceDependencySeed[]
  constraintIR: ConstraintIR
}): ReferenceCandidateBindingResult
```

For each seed, the binder must:

1. Consider only `ConstraintIR.constraints` with status `active` or `satisfied`.
2. Match a constraint only when its `sourceIds` contains one of the seed's exact `supportingIntentIds`.
3. Verify the constraint target path is inside the seed's `authorizedTargetPaths` / `ontologyScopes` allow-list.
4. Set final `constraintIds` to the matched constraint IDs and `goalIds` to the linked goals; never join by role name, prompt text, or asset appearance.
5. Keep `sourceBindingIds` empty in the zero-observation V1 path. Any future population requires real confirmed observations and bindings tied to the same asset and exact path.
6. Compute `candidateHash` only after all final Core fields are populated.
7. Omit a preferred seed with no surviving linked constraint using a deterministic Host reason. A hard or required seed with no surviving linked constraint blocks semantic closure rather than producing an unscoped reference.
8. Finalize only dependencies whose candidate endpoints survived; a missing hard/required dependency endpoint blocks, while an explicitly preferred dependency may be omitted with a reason.

This two-stage design is necessary because M4 may merge constraints from multiple intents or degrade a preferred intent. The binder follows the compiled result rather than predicting M4 IDs.

### 6.5 Closed-world source authorization

The final candidate is linked only to constraints derived from that seed's own role intents.

Example:

```text
person image
  → role intents preserve person.identity / person.face / person.body / person.hair
  → M4 creates or merges the actual constraints
  → binder links the person candidate only to matching active/satisfied constraints

garment image
  → role intents replace wardrobe.design / structure / material / color / details
  → M4 creates or merges the actual constraints
  → binder links the garment candidate only to matching active/satisfied constraints
```

A Provider materializer may state, mechanically, that each reference is authorized only for its linked constraints. It must not infer additional contributions from visual content or role names.

For a generic multi-reference Provider such as Seedream or Grok Imagine, the accepted request must already contain the Guard-protected pose-only isolation semantics. For a Provider with a dedicated structural-control input, the adapter may map the same accepted `pose` mapping to that native field without changing its meaning.

## 7. Scenario requirements

### 7.1 Virtual Try-On

The normative role, garment-category, replace/preserve, and composition behavior is defined by the [2026-08-20 amendment](playground-tryon-cosplay-input-amendment.md). In summary, person is required; Full-body, Top, and Bottom are declarative garment slots with at least one garment required; Full-body is mutually exclusive with Top/Bottom; Top and Bottom may coexist without a separate mode; Fit, Footwear, and Pose are optional. Try-On does not accept the 30 composition presets.

### 7.2 Cosplay

The initial public roles are:

| Role | Authorized target paths | Operation | Default importance |
|---|---|---|---|
| `person-identity` | `person.identity`, and any explicitly supported person-preservation descendants | `preserve` | hard/required |
| `character-design` | `character.hair`, `character.costume`, `character.accessories` | `replace` | required |
| `signature-prop-detail` | `character.signatureProps.primary` descendants supported by the vocabulary | `replace` | required/hard |
| `pose` | `pose` | `adjust` | preferred |
| `critical-detail` | a finite Server-resolved allow-list of current scenario paths | scenario-declared | required/preferred |

The character image is not authorized for `person.identity`. This is enforced by the absence of an identity constraint link plus Guard-protected prohibited contributions for that mapping, not by inventing a target-level “remove identity” intent. The UI has two required references (`person-identity`, `character-design`) and repeatable supplemental references so a signature-prop reference and a pose reference can coexist when the Provider budget permits them.

In both scenarios, pose accepts an already prepared skeleton image, ordinary action photograph, or pose sketch. V1 provides upload, preview, replacement, removal, ordering, and role selection only; pose extraction and skeleton editing are explicitly out of scope.

## 8. Evidence and fact policy

The Playground UI and API must distinguish:

```text
Declared role
Observed fact
Confirmed fact
Inferred proposal
```

V1 may operate with zero image-content observations. In that case:

- the ontology can contain unknown or unspecified paths;
- role-derived `ChangeIntent` constraints may still compile;
- the Human Plan may say which source role is authorized for which target;
- the UI must not claim color, material, weapon type, body dimensions, or other content facts;
- `SourceBinding` lists remain empty or are explicitly labeled “not established from image observation.”

If a later Reference Interpreter is introduced, it must use the existing Observation and decision contracts and must not auto-confirm its own proposals without an approved authority path.

## 9. CompilationOrchestrator

The Server owns the complete compile path. The implementation must use public package entry points and return a Host DTO, not a new Core public contract.

Required order:

```text
validate upload and declared roles
→ resolve scenario distribution and EffectiveScenario
→ expand approved visual-composition presets and compile ScenarioCompilationSeed
  (role intents + composition intents + candidate seeds, not final candidates)
→ resolve evidence / OntologyInstance
→ compile ConstraintIR
→ bind ReferenceCandidateSeed records to actual active/satisfied constraints
→ plan ReferencePlan
→ plan PipelinePlan
→ compile PromptIR
→ create deterministic PromptCandidateIR or approved optimizer candidate
→ Prompt Guard
→ create ProviderRenderRequest
→ project sanitized PlaygroundPlan
```

A compile response is `ready` only when:

- M3 is not blocked;
- `ConstraintIR` is not blocked;
- required references survive the reference budget;
- `PipelinePlan` is valid for the selected capability profile;
- Prompt Guard accepts the candidate or an explicitly approved deterministic fallback is used;
- `ProviderRenderRequest.requestHash` is valid;
- the configured Provider profile can satisfy reference count and media requirements, when render is enabled.

## 10. General free text

A raw prompt textbox must not bypass the ontology chain.

For MVP, choose one of these reviewed paths:

1. **Preferred:** omit general free text and expose only typed scenario inputs and composition presets.
2. Convert a finite typed UI field into `ChangeIntent` records with `user_explicit` provenance.
3. Admit non-semantic scene wording only through a declared `PromptCandidateIR` suggestion transformation accepted by Prompt Guard.

The Provider materializer must never append raw Browser text.

## 11. PlaygroundPlan projection

`PlaygroundPlan` is a sanitized Host DTO. It may include:

```text
status
scenario and engine version
declaredRolePlan
constraints and degradations
excludedConstraints
reference budget and omissions
PromptIR sections
Prompt Guard status
ProviderRenderRequest hash
capability status
selected Provider/profile and credential mode (never the credential value)
sanitized trace hashes
```

The Human Plan must not call a declared role policy a confirmed `SourceBinding`. Suggested labels:

```text
Declared source role
Authorized contribution
Not authorized from this reference
Observed facts: none
Confirmed source bindings: none
```

## 12. ProviderRequestMaterializer

### 12.1 Contract

```ts
interface ProviderRequestMaterializer<TNativeInput> {
  readonly id: string
  readonly version: string
  readonly digest: string

  materialize(input: {
    request: ProviderRenderRequest
    artifacts: ReadonlyMap<string, ArtifactHandle>
  }): {
    nativeInput: TNativeInput
    receipt: ProviderMaterializationReceipt
  }
}
```

Proposed receipt:

```ts
interface ProviderMaterializationReceipt {
  schemaVersion: 'voce.playground-provider-materialization-receipt/v1alpha1'
  providerRenderRequestHash: string
  materializerId: string
  materializerVersion: string
  materializerDigest: string
  targetAdapterDigest: string
  targetProfileDigest: string
  emittedSectionIds: readonly string[]
  emittedConstraintIds: readonly string[]
  emittedParameterIds: readonly string[]
  referenceSlotMap: ReadonlyArray<{
    mappingId: string
    assetId: string
    contentHash: string
    providerSlot: string
    order: number
  }>
  nativePromptHash: string
  nativeRequestHash: string
  receiptHash: string
}
```

### 12.2 Allowed behavior

The materializer may:

- serialize accepted sections in stable order;
- group a mapping with the exact accepted constraints referenced by `mapping.constraintIds`;
- emit fixed protocol text such as “use each reference only for its listed constraints,” provided that text contains no scenario path, value, or inferred fact;
- map typed parameters to supported native fields;
- map ordered reference mappings to native image slots;
- map an accepted `pose` reference to a dedicated provider structural-control slot when and only when the selected capability profile declares that field; otherwise preserve its accepted order as a generic reference image;
- reject unsupported required parameters or references before network access;
- normalize provider syntax without changing semantic content;
- produce deterministic hashes and a receipt.

### 12.3 Forbidden behavior

The materializer must not:

- branch on `scenarioId`;
- contain a Try-On or Cosplay fidelity prompt;
- copy `COSPLAY_FIDELITY_PROMPT`, `COMPOSITION_GLOSSES`, or `INPUT_SPECS.binding` from M9;
- add an ontology path or value absent from the accepted request;
- infer image content;
- append raw user text;
- read dropped or excluded constraints and reintroduce them;
- drop a required reference to fit a Provider limit;
- replace a reference role based on visual guesses;
- read an earlier hidden `PromptIR` to synthesize a negative prompt;
- retry a paid or quota-consuming call automatically.

## 13. Compile/generate binding

The Browser never supplies an authoritative plan back to Generate.

Recommended stateless flow:

### Compile

```text
normalize upload
→ hash each normalized artifact
→ compute assetSetHash including role and order
→ run full compile
→ return sanitized plan + ProviderRenderRequest.requestHash
→ discard bytes after the request lifecycle
```

### Generate

```text
receive the same declared input and files again
→ normalize and hash again
→ run the same full compile again
→ compare expected request hash and assetSetHash
→ compare scenario distribution, adapter profile, and materializer digests
→ preflight rate/cost/capability/authorization
→ receive the selected Provider credential through a request-scoped secret channel
→ exactly one Provider attempt
→ discard the credential before returning
```

`assetSetHash` must include at least:

```text
scenario
slot role
slot order
asset content hash
media type
scenario distribution hash
selected Provider/profile digest
credential mode, but never credential bytes
```

A mismatch returns `409 PLAN_BINDING_MISMATCH` and performs zero Provider calls.

## 14. Approved Provider and capability gate

The approved initial selector order is:

1. Cloudflare Workers AI `@cf/black-forest-labs/flux-2-klein-4b` — product default, free-quota, operator-managed credential;
2. Seedream 5.0 Pro (`doubao-seedream-5-0-pro-260628`) — optional user-funded BYOK and the model used by the RC.3/RC.4 real-provider acceptance;
3. Grok Imagine image quality — optional user-funded BYOK.

Mock remains a development/test Provider and is hidden from the ordinary product selector. Cloudflare's official profile supports multipart generation/editing with at most four ordered binary inputs, each smaller than 512×512, output width and height from 256–1920, and a fixed four-step distilled model. Workers AI currently provides 10,000 free Neurons per day and resets the allocation at 00:00 UTC. The Host must enforce a disclosed cap at or below the free allocation and fail closed when exhausted; it may never silently continue on paid overage, switch Provider, or ask the user for a Cloudflare key.

Official capability sources:

- [Cloudflare FLUX.2 klein 4B launch and multipart limits](https://developers.cloudflare.com/changelog/post/2026-01-15-flux-2-klein-4b-workers-ai/)
- [Cloudflare Workers AI pricing and free allocation](https://developers.cloudflare.com/workers-ai/platform/pricing/)
- [Cloudflare Workers AI quota error semantics](https://developers.cloudflare.com/workers-ai/platform/errors/)

Minimum generation requirements:

- Virtual Try-On: two required references for person plus one garment slot, or three when Top and Bottom are both supplied, plus only the optional references explicitly selected by the user;
- Cosplay: two ordered required references and enough supplemental capacity for the selected signature-prop, pose, or critical-detail references; the prop-plus-pose acceptance path requires four total references;
- supported upload media and byte limits known before call;
- server-side credential model;
- deterministic reference ordering;
- output cardinality one;
- clear per-image price, free-tier or quota behavior, reset rules, and cost-overrun behavior;
- no silent paid fallback;
- privacy terms acceptable for person images;
- no requirement to expose secrets or public source-image URLs.

If the configured Provider cannot meet the resolved scenario reference count, Compile remains available and Generate is disabled. Cloudflare can carry up to four total references; the amended Try-On path therefore has two references in the common single-garment case, three when Top and Bottom are both supplied, and less remaining capacity as optional references are added. References are never silently deleted, and selecting Cloudflare never silently changes the scenario or promotes a paid Provider.

### 14.1 Default Cloudflare credential and user disclosure

The browser does not receive or request a Cloudflare key. A deployment injects `CLOUDFLARE_ACCOUNT_ID` and `CLOUDFLARE_API_TOKEN` only into the Host transport. Source code, fixtures, tests, responses, and client JavaScript contain neither value. PR C may implement the credential mode, configuration schema, bridge, disabled transport boundary, and mock fixtures; actual secret injection and a real call remain separately authorized deployment actions.

Before Compile and again before Generate, the Cloudflare option must disclose in plain language:

- it is the default free-quota model and requires no user key;
- at most four references are accepted and every input must already be smaller than 512×512; an oversize input is blocked before transport without changing role or order;
- free capacity is shared and limited; quota exhaustion blocks the call and does not incur or trigger a paid fallback;
- it is a fast distilled 4B/four-step model and may provide weaker identity, garment, prop-detail, and complex-composition fidelity than Seedream or Grok;
- output dimensions are bounded by the approved profile and only one output is requested.

### 14.2 User-provided ephemeral credentials (BYOK)

Compile and plan inspection require no API key. Generate may offer an allow-listed Provider/profile selector and accept a user-provided API key for that request only.

- The browser must not persist the key in cookies, local storage, session storage, service-worker caches, analytics, or error reports.
- The Server receives it only over HTTPS through a dedicated secret channel excluded from general request logging.
- The key is injected into the selected adapter after plan binding and remote-call authorization; only a non-secret `credentialRef` and `credentialMode: user_ephemeral` may appear in Host state.
- The key is not part of `assetSetHash`, `ProviderRenderRequest`, `RemoteCallAuthorization`, trace output, logs, or responses.
- Do not make a separate credential-validation call. One authorized generation attempt is the first possible Provider use, with zero automatic retries.
- Provider endpoints and models are allow-listed by the deployment; users cannot submit arbitrary endpoints.
- The UI discloses Provider, model, destination/region when known, image count, credential handling, retention information, and estimated per-call cost before authorization.
- User-funded calls still pass Host concurrency and abuse controls.

The operator-managed mode is approved only for the allow-listed Cloudflare free profile and its hard free-quota gate. It does not authorize shared Seedream/Grok credentials or any paid fallback.

## 15. Security, privacy, and logs

The earlier conservative upload policy remains in force.

The Server must not log:

```text
image bytes
Base64
data URIs
original file names
raw Provider prompt
raw user text
biometric descriptions
temporary or signed URLs
credentials or authorization headers
```

Required controls:

- magic-byte validation;
- bounded total and per-file size;
- EXIF removal or non-preservation;
- memory or bounded temporary storage;
- cleanup on success, failure, timeout, and cancellation;
- `Cache-Control: no-store` on sensitive responses;
- Server-only secrets;
- explicit redaction of the BYOK secret channel before any middleware or application logging;
- concurrency, per-client window, and global daily gates;
- one call and zero automatic retries by default;
- Render disable switch independent from Compile.

## 16. Package and workspace boundary

Recommended Host location:

```text
/playground
```

Requirements:

- not added as a fifth public package under `packages/*`;
- no change to the published `v0.1.0-rc.4` tag;
- no relative import from package source;
- no `tsconfig` path alias to `packages/core/src`;
- development may use a controlled local workflow, but at least one CI gate must install exact public versions from the npm registry in a fresh directory;
- production build must prove it can consume the same public package surface available to an external Host.

RC.4 is the repository-grounded audit baseline, not a permanent Playground dependency. Every deployed Playground build pins an exact published package version. If PR 0 confirms that Guard-protected reference isolation needs a public contract change, that change belongs in RC.5; the registry consumer gate and deployed Playground must then pin RC.5 before real generation is enabled.

## 17. Implementation sequence

### PR 0 — Semantic closure before UI

Deliver:

- current-state audit against this document;
- immutable Host role-policy model;
- amended slot-driven Virtual Try-On scenario distribution with typed garment categories and conditional preserve/replace scopes;
- normalized Cosplay role policy;
- optional pose-reference policy for both scenarios, with no pose editor or extractor;
- `ScenarioInputCompiler`;
- deterministic `ReferenceCandidateBinder` and dependency finalization;
- complete offline compile harness through a valid `ProviderRenderRequest`;
- Human Plan projection that distinguishes declared roles from observations and bindings;
- no Web UI beyond minimal test fixtures;
- no Provider materializer;
- no network.

### PR A — Playground shell and Compile

Deliver:

- standalone `/playground` Host;
- Try-On and Cosplay UI;
- slot-driven Try-On uploads with person plus at least one garment, optional Fit/Footwear/Pose, no composition controls, and two required Cosplay uploads plus repeatable typed supplemental references;
- uploads, pose-reference format guidance, and rights confirmation;
- Cosplay-only composition catalog from the public Core API;
- `/api/meta`, `/api/composition-presets`, `/api/compile`;
- Human Plan and Developer View;
- mobile and accessibility coverage;
- Render disabled.

### PR B — Guarded materialization and Mock render

Deliver:

- `ProviderRequestMaterializer` contract and one mock/native implementation;
- deterministic materialization receipt;
- full compile/generate binding;
- capability preflight;
- rate/budget gates;
- Mock Provider result path;
- cleanup and redaction tests;
- zero real Provider calls.

### PR C — Cloudflare default-free profile plus Seedream/Grok BYOK

The approved default is Cloudflare Workers AI `@cf/black-forest-labs/flux-2-klein-4b`; Seedream and Grok remain optional BYOK profiles. Keep the current official-doc capability, privacy, credential, and cost report synchronized with all three.

Then deliver:

- an additive Cloudflare multipart bridge that mechanically maps accepted prompt, typed parameters, output, and stable references to `input_image_0` through `input_image_3`;
- an allow-listed selector ordered Cloudflare Free, Seedream BYOK, Grok BYOK, with Mock hidden outside development mode;
- operator-managed Cloudflare credential mode with no browser key field, plus existing user-ephemeral credential injection for Seedream/Grok;
- profile-driven preflight for the strict below-512×512 input bound and the four-reference maximum;
- explicit limitations/quality/quota disclosure and zero silent paid fallback;
- disabled-by-default live transport;
- mock transport tests;
- deployment configuration with no secrets committed;
- no real call until separately authorized.

This is an additive scope. Do not refactor or change the already reviewed semantic closure, composition behavior, Seedream/Grok bridges, BYOK redaction, plan binding, or Provider-neutral Compile path except for the smallest type/registry/selector extension required to add Cloudflare. If that cannot be done without redesigning a reviewed path, stop and report the blocker.

### PR D — Public deployment and adoption loop

Only after explicit authorization:

- deployment;
- secret injection;
- bounded one-call smoke per scenario;
- global quota gate;
- feedback and sanitized issue handoff;
- README demo link after acceptance.

## 18. Acceptance tests

### Semantic closure

- Person plus Top, Bottom, Top-and-Bottom, Full-body one-piece, and Full-body complete-outfit inputs each compile to the amended deterministic replace/preserve scopes and exact planned-reference count.
- Three declared Cosplay roles compile without allowing the character seed or finalized reference candidate to support `person.identity`.
- A ready-made pose reference can be declared in either scenario, contributes only `pose`, and carries Guard-protected prohibitions against identity, clothing, background, and style inheritance.
- A Cosplay signature-prop reference and pose reference can coexist as separate supplemental candidates; an insufficient preferred-reference budget omits pose explicitly rather than the required prop.
- No Observation, `SourceBinding`, or `OntologyFact` is created merely from an uploaded role.
- A typed explicit value, when supported, is traceable to `user_explicit` provenance.
- Final candidate `constraintIds` are computed after M4 and each linked constraint contains one of the seed's exact supporting intent IDs in `sourceIds`.
- A preferred seed whose only constraint is degraded is omitted deterministically; a required seed with no surviving linked constraint blocks.
- A Cosplay composition preset adds `ChangeIntent` records but does not consume reference budget; a Try-On composition selection blocks before compilation.
- Required medium-shot plus preferred close-up produces one degradation and excludes the losing constraint from Prompt IR and Provider request sections.
- Swapping two files between roles changes `assetSetHash` and Provider request binding.

### Prompt and materialization

- Every emitted semantic line traces to an accepted section or reference-to-constraint link.
- The materializer emits no scenario-specific constant prompt.
- Excluded constraints are absent.
- Locked sections and parameters are unchanged.
- Required references are never dropped.
- Native prompt and request hashes are deterministic across input ordering variations that are semantically equivalent.

### Provider and security

- Insufficient Provider reference capacity fails before network access.
- Cloudflare is the first ordinary selector option and Mock is absent from the ordinary product selector.
- Cloudflare accepts zero to four references in stable order, uses multipart fields `input_image_0` through `input_image_3`, and blocks a fifth reference before transport.
- Cloudflare inputs at or above 512 pixels on either dimension are blocked before transport; this increment does not add a new image-resizing dependency or silently mutate an upload.
- Cloudflare Generate requires an injected Host credential but never a browser-supplied key; missing Host configuration fails before transport without revealing configuration details.
- The free-quota gate blocks exhaustion and performs zero automatic retry, paid continuation, or Provider switch.
- Model selection displays Cloudflare's four-image/size/quota/quality limitations and displays Seedream/Grok as user-key choices.
- Render disabled performs zero network calls.
- CI performs zero real Provider calls and contains zero credentials.
- Success, failure, timeout, and cancellation all clean temporary assets.
- Logs and error responses contain no bytes, Base64, signed URLs, full prompt, secrets, or original file names.
- Compile succeeds without a Provider credential; Generate rejects a missing credential before transport; a supplied BYOK value is absent from every hash, trace, log, receipt, and response and is discarded after the one attempt.

## 19. Stop conditions

Codex must stop and request approval if implementation appears to require any of the following:

```text
scenario-name branches in Core
deep imports from packages/core/src
handwritten scenario prompt after Prompt Guard
Provider-specific prompt text inside ScenarioPack
fake Observation, SourceBinding, or confirmed OntologyFact
silent deletion of a required reference
raw Browser prompt appended to Provider input
modification of the published rc.4 tag
real Provider call, public deployment, or paid resource
secret committed to repository
credential persistence, credential logging, arbitrary Provider endpoints, or an extra API-key validation call
```

## 20. Product decisions still required

The following decisions are intentionally deferred:

1. Whether general free text is omitted or admitted through a guarded suggestion path.
2. The deployment-specific Cloudflare account, token, cap below 10,000 Neurons/day, region/privacy review, and retention timeout.
3. Whether pose remains preferred by default in both scenarios or the UI may explicitly promote it to required, subject to Provider capacity.
4. Whether a real Reference Interpreter is in scope after MVP. Pose extraction and skeleton editing remain separate future tools even if an interpreter is later added.

Until those decisions are approved, the implementation must remain offline and mock-only.
