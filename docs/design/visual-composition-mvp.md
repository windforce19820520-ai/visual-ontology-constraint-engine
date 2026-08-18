# Visual composition ontology and prompt-closure design

Status: implementation-ready design proposal

Target development line: `0.2.0-alpha.1`

Normative language: English

Baseline reviewed: `main@2486935fb4d7cf062c6e456f967c1ad6d7fe0a8a`

## 1. Decision summary

VOCE will add visual composition as declarative ontology data and ScenarioPack policy, not as a scenario-specific branch in Core.

The first implementation unit must deliver one complete runtime loop:

1. a canonical visual-composition vocabulary;
2. UI-facing presets that expand into atomic ontology changes;
3. deterministic conflict detection and permitted auto-resolution;
4. explicit disposition of losing constraints;
5. ScenarioPack-directed prompt section generation; and
6. Prompt Guard proof that a degraded constraint was not reintroduced.

Conflict handling and prompt generation are intentionally one delivery unit. Implementing only conflict records would leave contradictory constraints in the current prompt compiler. Implementing only prompt sections would preserve the existing ambiguous last-write and conflict-severity behavior.

The composition cards shown in the design references are ontology selectors. They are not images sent to an image-generation provider and do not consume the reference budget. A future composition-reference feature may attach an actual reference asset, but it is outside this milestone.

## 2. Product outcome

After this work, a Host or Playground can present choices such as “full shot”, “low angle”, “rule of thirds”, or “leading room”. VOCE can then:

- expand each choice into explicit ontology paths;
- combine compatible choices instead of treating every card as mutually exclusive;
- identify impossible or underspecified combinations;
- preserve required requirements over preferred preferences;
- explain which preference was dropped and why;
- generate ordered prompt sections from the surviving constraints; and
- prove structurally that dropped constraints are absent from Prompt IR.

Example:

```text
User selections
  full shot + rule of thirds + leading room
  subject movement = right

Atomic changes
  camera.framing.shotScale = full_shot
  camera.framing.crop.keepBothFeet = true
  camera.composition.patterns.ruleOfThirds = true
  camera.composition.leadingRoom.enabled = true
  camera.composition.leadingRoom.direction = right

Prompt sections
  Shot and crop: full body, both feet inside the frame
  Layout and space: place the subject on a thirds intersection and leave room to the right
```

## 3. Architectural boundaries

### 3.1 Ownership

Composition extends the existing `camera` module. It does not introduce a second top-level `composition` module.

```text
camera
├── framing
│   ├── shotScale
│   └── crop.*
├── view
│   ├── elevation
│   └── relationship
├── roll
│   └── mode
├── lens
│   ├── focalLengthClass
│   └── perspective
└── composition
    ├── patterns.*
    ├── placement
    ├── negativeSpace
    ├── leadingRoom.*
    ├── foregroundTreatment
    ├── framingDevices.*
    ├── reflection.*
    └── environmentRelationship

pose.bodyOrientation
expression.headView
lighting.subjectRendering
```

Body direction remains owned by `pose`, head view by `expression`, and silhouette lighting by `lighting`. Composition presets may request changes across those modules, but they do not redefine ownership.

### 3.2 Scenario boundary

Core may interpret typed contribution contracts and generic rule operators. Core must not import a named ScenarioPack, compare a scenario ID, or branch on `virtual-tryon`, `cosplay`, `product-shot`, or any other scenario name.

Scenario-specific importance, protected paths, conflicts, prompt wording, and review expectations remain declarative ScenarioPack data.

### 3.3 Provider boundary

The first milestone produces provider-neutral Prompt IR. Provider-native camera parameters and provider-specific vocabulary belong in adapters and are deferred.

### 3.4 Asset and budget boundary

Preset cards are data records containing labels, descriptions, and change operations. Selecting one creates no `SourceBinding`, `PlannedReference`, or provider attachment.

An actual composition-reference image, if added later, must use the existing source-binding and reference-planning path and must rank below required identity, product, costume, and signature-prop evidence unless a ScenarioPack explicitly declares otherwise.

## 4. Current baseline and required corrections

| Area | Current baseline | Required correction |
| --- | --- | --- |
| ScenarioPack vocabulary | `ResolvedContribution` with opaque JSON | Validate typed path definitions, cardinality, value kind, and allowed values |
| Declarative rules | `rules: JsonValue[]`; runtime recognizes paired path/token shapes | Add a small typed condition and resolution DSL |
| Missing dependencies | Rules generally match only when both sides are present | Support `present`, `absent`, `equals`, and `contains` conditions |
| Conflict importance | Severity can become the maximum importance across both operands | Evaluate each operand independently; never promote the losing preference |
| Preferred conflict | A `Degradation` may be emitted while both constraints remain active | Mark the losing constraint `unsatisfied` and bind it to the degradation |
| Multiple values | One array-valued change can hide independent decisions | Use one atomic boolean path per combinable pattern/device |
| Prompt compilation | All constraints can be emitted; ScenarioPack prompt sections are not consumed | Compile only effective constraints and consume typed prompt-section policy |
| Prompt Guard | Proves coverage of emitted requirements | Also prove the exact partition between emitted and excluded constraints |
| CLI fixture evidence | Reads selected contribution fields locally | Route the same typed contracts through Core and expose trace evidence |

## 5. Canonical vocabulary

Every public path definition declares a value kind and cardinality. Combinable concepts use independent boolean leaves so that each choice has its own importance, provenance, constraint ID, and disposition.

### 5.1 Framing and crop

| Path | Kind | Cardinality | Allowed values or meaning |
| --- | --- | --- | --- |
| `camera.framing.shotScale` | enum | one | `extreme_close_up`, `close_up`, `head_and_shoulders`, `bust_shot`, `medium_close_up`, `medium_shot`, `knee_shot`, `full_shot`, `long_shot`, `extreme_long_shot` |
| `camera.framing.crop.keepHead` | boolean | one | Head must remain inside the output frame |
| `camera.framing.crop.keepHands` | boolean | one | Required visible hands must remain inside the frame |
| `camera.framing.crop.keepBothFeet` | boolean | one | Both feet must remain inside the frame |
| `camera.framing.crop.keepProduct` | boolean | one | Protected product must remain fully visible |
| `camera.framing.crop.keepSignatureProp` | boolean | one | Protected signature prop must remain visible |

The ten shot-scale labels are retained because they correspond to distinct Host choices. Adjacent values are semantically fuzzy across providers, so adapters may translate them differently, but Core still treats `shotScale` as one exclusive value.

### 5.2 View, roll, and lens

| Path | Kind | Cardinality | Allowed values |
| --- | --- | --- | --- |
| `camera.view.elevation` | enum | one | `eye_level`, `low_angle`, `high_angle`, `birds_eye` |
| `camera.view.relationship` | enum | one | `front`, `three_quarter`, `profile`, `rear`, `over_the_shoulder` |
| `camera.roll.mode` | enum | one | `level`, `dutch_left`, `dutch_right` |
| `camera.lens.focalLengthClass` | enum | one | `ultra_wide`, `wide`, `normal`, `telephoto`, `super_telephoto` |
| `camera.lens.perspective` | enum | one | `expanded`, `natural`, `compressed` |

### 5.3 Layout patterns and space

| Path | Kind | Cardinality | Meaning |
| --- | --- | --- | --- |
| `camera.composition.patterns.centeredSymmetry` | boolean | one | Centered, approximately symmetric layout |
| `camera.composition.patterns.ruleOfThirds` | boolean | one | Primary subject follows thirds guides |
| `camera.composition.patterns.leadingLines` | boolean | one | Scene lines direct attention toward the subject |
| `camera.composition.patterns.diagonal` | boolean | one | Dominant diagonal organization |
| `camera.composition.patterns.sCurve` | boolean | one | Dominant S-shaped visual path |
| `camera.composition.patterns.triangle` | boolean | one | Subjects or landmarks form a stable triangle |
| `camera.composition.placement` | enum | one | `center`, `left_third`, `right_third`, `upper_third`, `lower_third` |
| `camera.composition.negativeSpace` | enum | one | `none`, `left`, `right`, `above`, `below`, `surrounding` |
| `camera.composition.leadingRoom.enabled` | boolean | one | Reserve space in the gaze or movement direction |
| `camera.composition.leadingRoom.direction` | enum | one | `left`, `right`, `forward`, `up`, `down` |

Patterns are not universally exclusive. A photograph may legitimately combine thirds, leading lines, and a diagonal. Explicit incompatibility rules are therefore ScenarioPack data rather than a hard-coded single-selection rule.

### 5.4 Depth, framing devices, reflection, and environment

| Path | Kind | Cardinality | Allowed values or meaning |
| --- | --- | --- | --- |
| `camera.composition.foregroundTreatment` | enum | one | `clear`, `soft_obstruction`, `strong_obstruction` |
| `camera.composition.framingDevices.frameWithinFrame` | boolean | one | Architectural or natural frame surrounds the subject |
| `camera.composition.framingDevices.environmentalPortrait` | boolean | one | Environment materially carries the narrative |
| `camera.composition.reflection.enabled` | boolean | one | Include a reflected subject or object |
| `camera.composition.reflection.surface` | enum | one | `mirror`, `glass`, `water`, `screen`, `polished_surface` |
| `camera.composition.reflection.role` | enum | one | `supporting`, `co_primary`, `primary` |
| `camera.composition.environmentRelationship` | enum | one | `isolated`, `contextual`, `environment_dominant` |

`profile` is represented by `camera.view.relationship`. A silhouette effect belongs to `lighting.subjectRendering`, not to composition. A mirror card expands into reflection paths and must not be stored as a second independent mirror-composition fact.

## 6. Preset model

Presets are Host/Playground affordances over public ontology operations. The first milestone may store the canonical preset catalog as a validated shared fixture. It does not need a new public `Preset` runtime contract.

Each preset record contains:

- stable `id` and localization keys;
- category and compatibility hints for the Host;
- one or more `ChangeOperation`-compatible atomic changes;
- default importance no higher than `preferred`;
- optional prerequisite declarations; and
- no asset URL or embedded reference image.

The preset ID is retained in change provenance, such as `ChangeIntent.sourceHintIds`. The resulting ontology contains the expanded facts, not a magic preset value.

### 6.1 Card mapping

| UI card | Primary expansion | Additional expansion or note |
| --- | --- | --- |
| Extreme close-up | `camera.framing.shotScale=extreme_close_up` | Scenario may protect the specific detail being framed |
| Close-up | `camera.framing.shotScale=close_up` | — |
| Head-and-shoulders | `camera.framing.shotScale=head_and_shoulders` | `crop.keepHead=true` |
| Bust shot | `camera.framing.shotScale=bust_shot` | `crop.keepHead=true` |
| Medium close-up | `camera.framing.shotScale=medium_close_up` | — |
| Medium shot | `camera.framing.shotScale=medium_shot` | — |
| Knee shot | `camera.framing.shotScale=knee_shot` | — |
| Full shot | `camera.framing.shotScale=full_shot` | `crop.keepBothFeet=true` |
| Long shot | `camera.framing.shotScale=long_shot` | `environmentRelationship=contextual` |
| Extreme long shot | `camera.framing.shotScale=extreme_long_shot` | `environmentRelationship=environment_dominant` |
| Low angle | `camera.view.elevation=low_angle` | — |
| High angle | `camera.view.elevation=high_angle` | — |
| Bird's-eye view | `camera.view.elevation=birds_eye` | — |
| Over-the-shoulder | `camera.view.relationship=over_the_shoulder` | Requires a foreground shoulder subject or declared equivalent |
| Dutch angle | `camera.roll.mode=dutch_left` or `dutch_right` | Host must request or choose direction explicitly |
| Centered symmetry | `patterns.centeredSymmetry=true` | Usually `placement=center` |
| Rule of thirds | `patterns.ruleOfThirds=true` | Host may separately choose the target third |
| Leading lines | `patterns.leadingLines=true` | Requires suitable scene geometry or a clarification/review path |
| Leading room | `leadingRoom.enabled=true` | Requires `leadingRoom.direction` |
| Diagonal composition | `patterns.diagonal=true` | — |
| S-curve composition | `patterns.sCurve=true` | — |
| Triangle composition | `patterns.triangle=true` | — |
| Negative space | `negativeSpace` set to an explicit direction | Host must not emit directionless `true` |
| Frame within frame | `framingDevices.frameWithinFrame=true` | — |
| Foreground obstruction | `foregroundTreatment=soft_obstruction` | Required identity/product paths may prohibit strong obstruction |
| Profile / silhouette | `view.relationship=profile` | Optional `lighting.subjectRendering=silhouette`; two independent facts |
| Reflection composition | `reflection.enabled=true` | Requires explicit `reflection.surface` |
| Mirror composition | `reflection.enabled=true`, `surface=mirror` | — |
| Telephoto compression | `lens.focalLengthClass=telephoto`, `lens.perspective=compressed` | — |
| Environmental portrait | `framingDevices.environmentalPortrait=true` | `environmentRelationship=contextual` or `environment_dominant` |

The card artwork and instructional copy belong to the Host repository. VOCE may provide stable IDs and localization keys, but it must not commit private chat screenshots or personal image assets.

## 7. Typed declarative contribution contracts

The implementation should replace only the contribution shapes needed by this feature. Other opaque contribution categories may remain unchanged until separately migrated.

Illustrative contract shape:

```ts
type OntologyValueKind = 'boolean' | 'enum' | 'string' | 'number'
type OntologyCardinality = 'one' | 'many'

interface OntologyPathDefinition {
  path: string
  valueKind: OntologyValueKind
  cardinality: OntologyCardinality
  allowedValues?: JsonValue[]
  defaultImportance?: Importance
}

interface OntologyVocabularyContribution extends ScenarioPackContribution {
  paths: OntologyPathDefinition[]
}

interface ResolvedOntologyVocabularyContribution extends ResolvedContribution {
  paths: OntologyPathDefinition[]
}

type DeclarativeConditionOperator =
  | 'present'
  | 'absent'
  | 'equals'
  | 'contains'

interface DeclarativeRuleCondition {
  path: string
  operator: DeclarativeConditionOperator
  value?: JsonValue
}

interface DeclarativeRuleResolution {
  strategy: 'block' | 'degrade_operand'
  operandId?: string
  reasonCode: string
}

interface DeclarativeRule {
  id: string
  kind: 'incompatibility' | 'dependency' | 'cardinality' |
        'occlusion' | 'resource'
  operands: Array<{
    id: string
    conditions: DeclarativeRuleCondition[]
  }>
  resolution: DeclarativeRuleResolution
  importance?: Importance
  explanation: string
}

interface PromptSectionDefinition {
  id: string
  group: string
  order: number
  pathPrefixes: string[]
  requiredPaths?: string[]
  templateKey: string
}

interface PromptSectionContribution extends ScenarioPackContribution {
  sections: PromptSectionDefinition[]
}

interface ResolvedPromptSectionContribution extends ResolvedContribution {
  sections: PromptSectionDefinition[]
}
```

Contract validation rules:

- contribution IDs, rule IDs, section IDs, and path definitions are unique after composition;
- duplicate definitions are allowed only when canonical content is identical;
- `cardinality=one` cannot receive multiple different active values;
- enum values must be present in `allowedValues`;
- `present` and `absent` conditions reject a `value` field;
- `equals` and `contains` conditions require a `value` field;
- `degrade_operand` requires an `operandId` that exists in the rule;
- a rule cannot authorize degradation of a hard or required operand at runtime;
- prompt section ordering is deterministic and duplicate orders use ID code-unit order as a tie-breaker; and
- all contribution objects are defensively copied before evaluation.

The exact exported names may change during implementation if an existing naming convention requires it, but the semantics above are acceptance requirements.

## 8. Deterministic conflict and dependency semantics

### 8.1 No silent last-wins

For every `cardinality=one` path, Core groups candidate constraints by target path and canonical value before applying cross-path rules.

1. Identical values are deduplicated deterministically. Provenance and source IDs are unioned; the strongest importance is retained.
2. Different values are compared by importance.
3. Hard or required constraints are never dropped automatically.
4. A preferred value loses to a hard or required value and becomes `unsatisfied`.
5. Two different preferred values block unless a matching declarative rule explicitly identifies the operand that may be degraded.
6. Alphabetical order, input order, hash order, pack order, and “last write” are never semantic tie-breakers.

### 8.2 Resolution matrix

| Left | Right | Default result |
| --- | --- | --- |
| hard | hard | blocking conflict |
| hard | required | blocking conflict |
| required | required | blocking conflict |
| hard or required | preferred | keep stronger; set preferred constraint to `unsatisfied`; emit degradation |
| preferred | preferred | blocking ambiguity unless a rule declares the degradable operand |

For a declared cross-path incompatibility, the same matrix applies. The rule may identify a degradable operand, but runtime importance still has authority. A rule must not raise the importance of both operands to the maximum and thereby turn an otherwise degradable preference into a false required conflict.

### 8.3 Dependency behavior

Dependency rules may detect missing facts. Examples:

- `leadingRoom.enabled=true` requires `leadingRoom.direction` to be present;
- `reflection.enabled=true` requires `reflection.surface` to be present;
- `view.relationship=over_the_shoulder` requires a declared foreground subject relationship;
- `crop.keepSignatureProp=true` requires an active signature-prop visibility constraint in scenarios that declare one.

A missing required dependency blocks. A missing preferred dependency may degrade the requesting preferred constraint only when the rule explicitly identifies it as degradable. Core must not invent a direction, surface, foreground subject, or protected target.

### 8.4 Constraint disposition

An auto-resolved losing preference must produce all of the following:

- the original constraint with `status='unsatisfied'`;
- exactly one `Degradation` whose `constraintId` identifies that constraint;
- a non-blocking `ConstraintConflict` or dependency finding that explains the collision;
- a `RuleTrace` with `outcome='degraded'`; and
- no effective prompt coverage for the losing constraint.

Blocking conflicts retain active constraints and set `ConstraintIR.status='blocked'`. Prompt compilation must reject a blocked `ConstraintIR`.

## 9. Prompt compilation closure

### 9.1 Effective Scenario input

`PromptCompilationInput` must receive the resolved prompt policy, preferably by adding the hash-verified `EffectiveScenario`. The compiler verifies that its `effectiveScenarioHash` matches `CompilationContext.effectiveScenarioHash` before reading `promptSections`.

Passing unverified raw pack data directly to the prompt compiler is not allowed.

### 9.2 Prompt constraint partition

Prompt IR needs an explicit exclusion record rather than silently omitting degraded constraints:

```ts
interface PromptConstraintExclusion {
  constraintId: string
  degradationId: string
  reasonCode: string
  sourceIds: string[]
}
```

`PromptIR` then records `excludedConstraints: PromptConstraintExclusion[]`.

For a successful compilation, every input constraint is in exactly one disposition set:

- effective: `active` or `satisfied`, present in `PromptIR.constraintIds`, and covered as required by policy;
- excluded: `unsatisfied`, absent from `PromptIR.constraintIds`, and listed exactly once in `excludedConstraints`; or
- waived: omitted from effective coverage and represented by the existing waiver/audit path.

The compiler must reject an unknown status or an inconsistent degradation reference.

### 9.3 Composition section order

ScenarioPacks may name and word sections differently, but the shared fixture defines this stable group order:

1. `subject-and-product-fidelity`
2. `pose-and-object-relations`
3. `composition-shot-and-crop`
4. `composition-view-and-roll`
5. `composition-layout-and-space`
6. `composition-depth-framing-and-reflection`
7. `composition-lens-and-environment`
8. `forbidden-and-output`

Only sections that have effective matching constraints are emitted. Empty decorative sections are not generated.

### 9.4 Prompt Guard requirements

Prompt Guard must verify:

- hard and required effective constraints retain locked coverage;
- preferred effective constraints retain traceable coverage when emitted;
- every unsatisfied constraint has exactly one valid exclusion record;
- excluded constraint IDs do not occur in section, parameter, reference-mapping, or coverage links;
- optimization candidates preserve the exclusion set;
- a transformation proof never names an excluded constraint as preserved; and
- all emitted contribution section IDs and orders come from the hash-verified effective prompt policy.

This is a structural guarantee. VOCE cannot reliably prove that arbitrary natural-language free text is semantically equivalent to an excluded idea. Therefore undeclared free-text transformations remain conservative and may require review or be rejected under strict mode.

## 10. Scenario policy

The canonical vocabulary and preset IDs are shared. ScenarioPacks specialize importance and conflict rules declaratively.

### 10.1 Virtual try-on

- product visibility and garment coverage remain hard or required;
- full-body crop may require both feet only when the requested garment or pose needs them;
- strong foreground obstruction conflicts with protected garment regions;
- extreme close-up conflicts with required full-garment coverage;
- composition preferences may degrade before garment fidelity.

### 10.2 Cosplay

- identity, costume, and signature-prop fidelity remain ahead of composition preferences;
- `crop.keepSignatureProp=true` is required when a signature prop is active;
- foreground obstruction must not hide required prop details;
- shot scale may degrade from a preferred close crop to a wider compatible crop only through an explicit rule;
- no composition choice consumes the reference slots already needed for identity, costume, or prop evidence.

### 10.3 Product shot

- product completeness, geometry, label visibility, and output contract remain hard or required;
- environmental portrait-style composition is allowed only when it does not demote product salience;
- reflection may require semantic review for label legibility and false duplicate appearance;
- negative space is generally compatible with marketing-copy placement but does not itself create text content.

These statements must become pack data and deterministic fixtures. They are not Core conditionals.

## 11. Packaging and provenance

The implementation should introduce a canonical shared visual-composition data file, for example:

```text
fixtures/shared/visual-composition.v1.json
```

ScenarioPack fixtures may embed or materialize the normalized contribution as required by the existing package layout, but content digests must prove exact identity. Repository validation must fail on drift between the canonical source and embedded pack copies.

All generated and resolved objects use canonical JSON hashing, stable code-unit ordering, defensive copies, and unique IDs. Input array order must not change the deterministic signature.

## 12. First implementation unit

The first development PR is intentionally vertical and includes both conflict handling and prompt closure.

### In scope

- typed vocabulary contribution for the paths in this document;
- typed declarative condition/resolution rule subset;
- typed prompt-section contribution;
- canonical composition vocabulary and 30 preset mappings;
- declarative policy for the three existing example ScenarioPacks;
- cardinality validation and deterministic deduplication;
- explicit required/preferred conflict behavior;
- missing dependency detection;
- `unsatisfied` losing constraints plus degradation/trace linkage;
- hash-verified prompt policy input;
- prompt sections generated only from effective constraints;
- explicit prompt exclusion records and Guard checks;
- CLI fixture evidence for expansion, resolution, prompt sections, and exclusions;
- JSON Schema and repository validation updates for every changed public contract;
- public exports, deterministic tests, and architecture/contract documentation updates.

### Out of scope

- Playground or other frontend implementation;
- committing the supplied screenshots or card artwork;
- sending preset images to a provider;
- composition-reference assets and reference-budget ranking;
- provider-native camera controls;
- paid or real provider calls;
- automatic image understanding of feet, faces, products, or props;
- composition quality scoring after generation;
- new account, catalog, publishing, or deployment features;
- package version bump, tag, release, or npm publication; and
- external pull request integration.

## 13. Acceptance matrix

At minimum, deterministic tests must cover:

| Case | Expected result |
| --- | --- |
| Full-shot preset expansion | Atomic shot-scale and keep-feet changes with preset provenance |
| Compatible thirds + leading lines | Both remain effective and appear in ordered prompt sections |
| Required full shot vs preferred close-up | Full shot effective; close-up `unsatisfied`; one degradation; no close-up prompt coverage |
| Required full shot vs required close-up | Compilation blocked; no Prompt IR |
| Preferred left third vs preferred right third without rule | Blocking ambiguity; no last-wins |
| Same value from two sources | One deterministic effective constraint with merged provenance |
| Leading room without direction | Missing dependency detected; no invented direction |
| Reflection without surface | Missing dependency detected |
| Strong obstruction vs required product visibility | Required visibility survives; obstruction degrades or blocks per pack rule |
| Cosplay required prop visibility | Composition does not suppress the protected prop constraint |
| Reordered source contributions | Identical hashes, constraint disposition, prompt order, and Prompt IR signature |
| Tampered Effective Scenario | Prompt compiler rejects hash/context mismatch |
| Optimizer re-links excluded constraint | Prompt Guard rejects the candidate |
| Preset-only request | Zero new planned references and unchanged reference budget |

All existing standard suites must remain offline and pass. New fixtures must use synthetic IDs and public-safe data.

## 14. Delivery sequence

One implementation PR may use internal commits, but its reviewable sequence should be:

1. contracts and schemas;
2. canonical vocabulary and presets;
3. generic rule compilation and conflict disposition;
4. prompt policy, exclusion records, and Guard closure;
5. ScenarioPack data and CLI evidence;
6. deterministic, repository, and release-candidate regression tests; and
7. synchronized architecture and contract documentation.

The PR remains Draft until all layers are present. A partial state that records a degradation while still prompting the losing constraint is not review-ready.

## 15. Deferred follow-up units

After the first loop is accepted, separate work may add:

1. Host/Playground UI using the stable preset catalog;
2. optional composition-reference assets with source isolation and budget ranking;
3. provider capability profiles for native camera controls;
4. reusable composition semantic-review templates and evaluation reports; and
5. a separately authorized real-provider smoke test.

None of these follow-ups changes the first milestone's core rule: a selector becomes atomic facts, conflict disposition is explicit, and only effective constraints reach Prompt IR.
