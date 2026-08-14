# ScenarioPack Contract

[简体中文](zh-CN/scenario-pack-contract.md)

**Status:** Proposed for v0.1
**Normative language:** English
**Contract ID:** `voce.scenario-pack/v1alpha1`

This document is one of the four paired core specifications. Terminology follows the [project glossary](glossary.md), and lifecycle and authorization rules follow the [system design](system-design.md).

## 1. Purpose

A `ScenarioPack` makes a creator scenario installable and composable without adding scenario-specific branches to VOCE Core. Virtual try-on, cosplay, and product shot are packages selected through the same registry, resolver, compiler, planner, runtime, and evaluation contracts.

A ScenarioPack contributes declarative domain knowledge and defaults. It is not:

- a Provider or remote-service Adapter;
- an authorization to inspect assets, transfer data, incur cost, or execute a plan;
- a Host application, account system, catalog, workflow UI, or moderation service;
- a privileged way to mutate confirmed facts or bypass Core policy.

## 2. Layer boundary

```text
Host application
  selects and activates an exact scenario composition
  supplies consent, rights, policy, storage, credentials, budgets, and authorization

ScenarioPack
  composes ontology vocabulary, declarative rules, candidate scopes,
  typed prompt sections, review templates, and declared defaults

RulePack
  deterministically compiles accepted inputs into constraints and trace

ProviderAdapter and other execution Adapters
  performs a specifically authorized local or remote step

VOCE Core
  resolves packages, validates composition, compiles, plans, guards,
  executes authorized plans, records receipts, and evaluates
```

Core must not import first-party scenario packages, compare scenario IDs, or branch on names such as `virtual-try-on`, `cosplay`, or `product-shot`. First-party and third-party packs use the same public Registry and validation path.

## 3. Root, extension, and HostOverride model

Each `ScenarioPackSelection` contains:

- exactly one `root` pack, which establishes the base scenario vocabulary and experience;
- zero or more explicitly selected `extension` packs;
- an optional `HostPolicyOverlay` containing zero or more typed `HostOverride` records owned by the Host and bound to the Case revision.

Deterministic resolution may add dependency-required extension packs and must disclose them in the dependency trace. Installation does not select or activate a pack. An installed extension never becomes active merely because it is discoverable.

```ts
interface ScenarioPackRequest {
  packId: string
  versionRange: string
  configuration?: JsonObject
}

interface ScenarioPackSelection {
  root: ScenarioPackRequest
  extensions: ScenarioPackRequest[]
  hostPolicyOverlay?: HostPolicyOverlay
}
```

The root and extensions are composition roles, not trust levels. A third-party root and a first-party extension have identical Core permissions.

## 4. Manifest and package definition

```ts
type JsonPrimitive = null | boolean | number | string
type JsonValue = JsonPrimitive | JsonValue[] | JsonObject

interface JsonObject {
  [key: string]: JsonValue
}

interface VersionedCoreContractRef {
  contractId: string
  version: string
}

interface JsonSchemaRef extends VersionedCoreContractRef {
  schemaId: string
}

type ScenarioInteractionMode = 'text_only' | 'reference_guided' | 'edit_existing'

interface ScenarioCardinality {
  min: number
  max: number
}

interface ScenarioInputExpectation {
  id: string
  inputKind: 'text_intent' | 'asset' | 'structured_metadata'
  dataType: 'text' | 'image' | 'json'
  requiredIn: ScenarioInteractionMode[]
  cardinality: ScenarioCardinality
  ontologyPath?: string
  mediaTypes?: string[]
  sensitivity: 'none' | 'personal_data' | 'biometric_candidate'
}

interface ScenarioOutputExpectation {
  id: string
  artifactKind: 'image' | 'structured_review' | 'layer_bundle'
  dataType: 'image' | 'json'
  producedIn: ScenarioInteractionMode[]
  cardinality: ScenarioCardinality
  mediaTypes: string[]
  outputContract?: VersionedCoreContractRef
}

type ScenarioContributionKind =
  | 'ontology_vocabulary'
  | 'rule_pack'
  | 'interpretation_scope'
  | 'prompt_section'
  | 'review_template'
  | 'default'
  | 'override_point'

interface ScenarioPackManifest {
  schemaVersion: 'voce.scenario-pack/v1alpha1'
  packId: string
  version: string
  kind: 'root' | 'extension'
  supportedInteractionModes: ScenarioInteractionMode[]
  inputExpectations: ScenarioInputExpectation[]
  outputExpectations: ScenarioOutputExpectation[]
  extensionOf?: {
    rootPackId: string
    rootVersionRange: string
  }
  license: string
  provenance: PackageProvenance
  coreRange: string
  contractRanges: {
    ontology: string
    declarativeRuleContribution: string
    requestedScopePlan: string
    promptIR: string
    reviewTemplate: string
  }
  configurationSchema?: JsonSchemaRef
  ui: UIMetadata
  dependencies: ScenarioPackDependency[]
  conflicts: ScenarioPackConflict[]
  composition: {
    before: string[]
    after: string[]
  }
  contributions: ScenarioContributionIndex
  fixtures: ScenarioContributionDescriptor[]
  migrations: ScenarioContributionDescriptor[]
  capabilityRequirements: ScenarioCapabilityRequirement[]
  declarations: ScenarioPackDeclarations
  permissions: ScenarioPackPermissions
  distributionInventory: DistributionInventoryEntry[]
}

interface DistributionInventoryEntry {
  path: string
  role: 'contribution' | 'fixture' | 'migration' | 'readme' | 'license' | 'package_metadata'
  contentDigest: string
}

interface UIMetadata {
  defaultLocale: string
  locales: Record<string, {
    displayName: string
    description: string
    instructions?: string
    messages: Record<string, string>
  }>
  disclosures: Array<{
    id: string
    severity: 'info' | 'warning' | 'required'
    messageKey: string
  }>
  accessibility: {
    textAlternativesRequired: boolean
    keyboardOperableReferenceUI: boolean
    doesNotRelyOnColorAlone: boolean
  }
}

interface ScenarioCapabilityRequirement {
  id: string
  capability: string
  importance: 'hard' | 'required' | 'preferred'
  reasonCode: string
}

interface ScenarioPackDeclarations {
  containsExecutableScenarioCode: false
  distributionLifecycleScripts: false
  containsExecutableFiles: false
  fixturesRequireNetwork: false
  fixturesRequireRealProvider: false
  collectsTelemetry: false
  mayHandlePersonImages: boolean
  rightsDisclosureRequired: boolean
}

interface ScenarioPackDependency {
  packId: string
  versionRange: string
  role: 'extension'
  reasonCode: string
}

interface ScenarioPackConflict {
  packId: string
  versionRange: string
  reasonCode: string
}

interface ScenarioPackPermissions {
  network: false
  remoteCalls: false
  secrets: false
  filesystemWrite: false
  mutateConfirmedFacts: false
  authorizeCalls: false
  overrideHostPolicy: false
  selectProvider: false
  changeBudgets: false
}

interface ScenarioContributionIndex {
  ontologyVocabulary: ScenarioContributionDescriptor[]
  rulePacks: ScenarioContributionDescriptor[]
  interpretationScopes: ScenarioContributionDescriptor[]
  promptSections: ScenarioContributionDescriptor[]
  reviewTemplates: ScenarioContributionDescriptor[]
  defaults: ScenarioContributionDescriptor[]
  overridePoints: ScenarioContributionDescriptor[]
}

interface ScenarioContributionDescriptor {
  id: string
  schemaVersion: string
  contentDigest: string
}
```

The Manifest has exactly one legal path: `scenario-pack/manifest.json`. That path is reserved and must not appear in `distributionInventory`; every other distribution file must appear exactly once in the Inventory. The manifest contains metadata and digests, not executable lifecycle hooks. A distribution contains the Manifest plus content-addressed, JSON-serializable contribution documents:

```ts
interface ScenarioPack {
  manifest: ScenarioPackManifest
  contributions: {
    ontologyVocabulary: OntologyVocabularyContribution[]
    rulePacks: DeclarativeRulePackContribution[]
    interpretationScopes: InterpretationScopeContribution[]
    promptSections: PromptSectionContribution[]
    reviewTemplates: ReviewTemplateContribution[]
    defaults: DeclaredDefaultContribution[]
    overridePoints: OverridePoint[]
    fixtureSuites: FixtureSuite[]
  }
  migrations: ScenarioMigrationDeclaration[]
}

interface FixtureSuite {
  id: string
  schemaVersion: string
  cases: FixtureCaseRef[]
  contentDigest: string
}
```

The Loader recomputes every contribution digest, the canonical manifest hash, and the package digest. The manifest does not prove that arbitrary installed code is safe and must never be presented as a sandbox or security signature.

`supportedInteractionModes` declares only the interaction shapes the Pack can compile. Input and output expectations are typed, namespaced declarations used for Host UI, preflight, and output-contract negotiation; they neither inspect an Asset nor authorize a call. Every `requiredIn` and `producedIn` value must also appear in `supportedInteractionModes`. Cardinality bounds must be non-negative with `max >= min`; media types use normalized MIME strings. An expectation may narrow a versioned Core contract through `outputContract`, but it cannot redefine that Core contract.

`UIMetadata` is presentation metadata, not semantic authority. `defaultLocale` must name an entry in `locales`; all referenced disclosure message keys must resolve in that locale; and required disclosures must be acknowledged before activation. Localized labels, instructions, disclosures, and accessibility declarations cannot add constraints, alter contribution data, authorize calls, or change semantic composition. They are excluded from `effectiveScenarioHash` but remain covered by manifest, package, and Lock hashes; semantic contributions cannot use localized UI content as authority.

The accessibility declaration states what pack-supplied text and reference-selection UI assets require from a Host renderer. It does not certify the Host application or shift responsibility for final accessibility conformance away from the Host.

`ScenarioCapabilityRequirement` declares a semantic need only. It cannot name or select a `ProviderAdapter`, model, endpoint, credential, or fallback. Activation validates that requirements are well formed and disclosed but does not claim they are satisfied. Compilation and planning compare them against `ProviderCapabilityProfile` records pinned by `CompilationContext`: unsatisfied `hard` requirements block; unsatisfied `required` requirements block until an explicit waiver creates a new Case revision; and unsatisfied `preferred` requirements may degrade only with trace.

`ScenarioPackDeclarations` are auditable claims and conservative Host-policy inputs, not permissions or proof. A false or inconsistent declaration blocks validation or activation.

A root Manifest must omit `extensionOf`. An extension Manifest must declare exactly one compatible root ID and version range through `extensionOf`. Resolution rejects an extension selected under another root; install state or load order cannot establish compatibility implicitly.

Every `ScenarioPackDependency` resolves to a Manifest whose `kind` is `extension`, whose `extensionOf` matches the selected root, and whose exact version and digests enter the Lock. Declarative RulePack documents are contributions inside a root or extension package, not separately discovered package kinds.

## 5. Contribution authority

### 5.1 Ontology vocabulary

A pack may reference compatible versioned ontology modules or add vocabulary under its declared namespace. It may not redefine Core paths, inject an `OntologyFact`, create an `ObservationDecision` or `BindingDecision`, or assign acceptance authority.

### 5.2 Rule packs

A pack may reference declarative, deterministic RulePack IR. Rules consume accepted inputs and may emit constraints, explanations, degradations, and review requirements. They may not use the network, credentials, current time, randomness, filesystem writes, hidden mutable state, or Provider calls.

`DeclarativeRulePackContribution` is the candidate v0.1 ScenarioPack rule contract and becomes compatibility-stable only with a released schema and compatibility fixtures. A code-backed `RulePackPlugin` is a separately installed trusted plugin and experimental in v0.1; ScenarioPack data cannot reference it as a declarative contribution or make its code part of the ScenarioPack security boundary.

### 5.3 Interpretation scopes

A scope contribution is a candidate allowlist with a purpose, sensitivity class, and deterministic condition. The effective `RequestedScopePlan` is limited by all of:

```text
scope required by accepted user intent
∩ scope contributed by the EffectiveScenario
∩ scope allowed by Host policy
```

A pack cannot force exhaustive analysis, inspect an excluded scope, select an Interpreter, or authorize a remote call.

### 5.4 Prompt sections

Prompt contributions are typed `PromptIR` templates with namespaced IDs, deterministic predicates, source/constraint links, mutability, and explicit ordering anchors. They may read only accepted ontology, constraints, reference plans, output contracts, and declared configuration.

They may not inject system instructions, access an unconfirmed Observation, change a locked section, alter reference order, select a Provider, or bypass the Prompt Guard.

### 5.5 Review templates

A review contribution declares criteria and creates `ReviewTask` templates. It may not execute a remote reviewer or mark a semantic claim accepted. Remote semantic review requires its own Adapter, `RemoteCallAuthorization`, durable run, and receipt. Human acceptance remains separate.

### 5.6 Defaults

A default applies only when the target is `unspecified` and is recorded with `declared_default` provenance. It has lower authority than user intent, trusted metadata, confirmed evidence, and deterministic constraints.

A default cannot set credentials, Provider selection, budgets, data destinations, consent, moderation outcomes, decisions, or execution authorization. Conflicting unequal defaults block composition unless a valid typed HostOverride resolves them.

### 5.7 Override points and fixtures

An `OverridePoint` is an explicit, schema-bounded place where a `HostPolicyOverlay` may alter configuration, a declared default, or an overrideable preferred contribution. Absence of an OverridePoint means no override is permitted.

A `FixtureSuite` contains redistributable offline cases, expected composition artifacts, and Mock acceptance results. It cannot require credentials or real Adapter calls and never proves production readiness.

## 6. Typed HostOverride and HostPolicyOverlay

HostOverride is not a package and cannot be distributed as hidden package behavior. It belongs to a Case revision, has explicit authority and reason, and is included in deterministic hashes.

```ts
type HostOverrideOperation =
  | {
      kind: 'set_configuration'
      packId: string
      overridePointId: string
      value: JsonValue
    }
  | {
      kind: 'set_declared_default'
      packId: string
      overridePointId: string
      value: JsonValue
    }
  | {
      kind: 'set_contribution_activation'
      packId: string
      overridePointId: string
      active: boolean
    }

interface HostOverride {
  id: string
  operation: HostOverrideOperation
  reasonCode: string
  contentHash: string
}

interface OverridePoint {
  id: string
  targetKind: 'configuration' | 'declared_default' | 'contribution_activation'
  targetPath: string
  valueSchema?: JsonSchemaRef
  allowDisable: boolean
  maximumImportance: 'preferred'
}

interface HostPolicyOverlay {
  id: string
  caseId: string
  caseRevision: number
  overrides: HostOverride[]
  authority: 'user' | 'host_policy'
  reasonCode: string
  overlayHash: string
}
```

An override names only its pack and declared `OverridePoint`; the Point supplies the authoritative target path or contribution ID. It must validate against the Point schema and maximum authority. A contribution can be disabled only if its Point allows disabling and it does not protect a hard or required constraint. `HostPolicyOverlay` is the revision-bound container included in deterministic resolution. Overrides cannot redefine vocabulary, alter package digests, weaken confirmed facts, change authorization, or bypass Host policy.

Override order has no last-writer-wins meaning. Identical operations with the same content hash are deduplicated; unequal operations targeting the same effective value block with `PACK_OVERRIDE_INVALID`. The resolver records every applied or rejected override in `PackResolutionReport`.

## 7. Resolution, lock, and effective scenario

```ts
interface ScenarioCompositionLockEntry {
  packId: string
  version: string
  kind: 'root' | 'extension'
  manifestHash: string
  packageDigest: string
  configurationHash: string
  resolvedDependencies: Array<{
    packId: string
    version: string
    packageDigest: string
  }>
  contributionDigests: Record<string, string>
}

interface ScenarioCompositionLock {
  schemaVersion: 'voce.scenario-pack-lock/v1alpha1'
  contractVersion: 'voce.scenario-pack/v1alpha1'
  resolverVersion: string
  catalogHash: string
  canonicalization: 'voce.canonical-json/v1alpha1'
  rootPackId: string
  entries: ScenarioCompositionLockEntry[]
  compositionOrder: string[]
  hostPolicyOverlayHash?: string
  hostOverrideHashes: string[]
  compositionHash: string
  lockHash: string
}

interface EffectiveScenario {
  lockHash: string
  rootPackId: string
  extensionPackIds: string[]
  compositionOrder: string[]
  ontologyVocabulary: ResolvedContribution[]
  rulePacks: ResolvedContribution[]
  interpretationScopes: ResolvedContribution[]
  promptSections: ResolvedContribution[]
  reviewTemplates: ResolvedContribution[]
  defaults: ResolvedContribution[]
  capabilityRequirements: ResolvedScenarioCapabilityRequirement[]
  declarations: ResolvedScenarioPackDeclaration[]
  appliedOverrides: AppliedOverrideRef[]
  effectiveScenarioHash: string
}

interface AppliedOverrideRef {
  packId: string
  overridePointId: string
  hostOverrideId: string
  contentHash: string
}

interface PackResolutionReport {
  status: 'resolved' | 'blocked'
  lockHash?: string
  effectiveScenarioHash?: string
  selected: ResolvedScenarioPack[]
  dependencyTrace: ScenarioDependencyTrace[]
  compositionTrace: ScenarioCompositionTrace[]
  overrideTraces: ScenarioOverrideTrace[]
  conflicts: ScenarioResolutionConflict[]
  warnings: ScenarioResolutionWarning[]
  reportHash: string
}
```

`lockHash` is computed from the other lock fields and never includes itself. `effectiveScenarioHash` covers the exact resolved contributions and semantic `HostPolicyOverlay`. Display text, timestamps, discovery source paths, and report formatting do not affect semantic hashes.

Every ScenarioPack digest is formatted `sha256:<64 lowercase hexadecimal characters>`. Structured semantic hashes use `voce.canonical-json/v1alpha1`: object keys are lexically ordered, numbers and strings use the profile's normalized JSON encoding, arrays retain their contract-defined semantic order, and the hash field being computed is excluded. Volatile timestamps, local paths, acquisition locators, and report presentation never enter semantic hashes.

The manifest inventories every distribution file except the manifest itself; `ScenarioPackDescriptor.manifestHash` covers the canonical manifest separately, so no self-referential digest exists. `packageDigest` hashes the canonical projection `{manifestHash, files}` where `files` is sorted by normalized path and each item contains path UTF-8 byte length, path, role, content byte length, and content digest. `distributionDigest` hashes the exact acquired archive bytes when an archive exists; memory and directory sources first materialize a deterministic tar archive using the same inventory, normalized paths, file modes, and zero timestamps, then hash those bytes.

`CompilationContext` pins `lockHash` and `effectiveScenarioHash`. Recompilation never re-resolves an existing lock merely because another version has been installed.

## 8. Deterministic composition

Resolution uses only the explicitly supplied immutable `ScenarioPackCatalogSnapshot` and performs these steps:

1. validate the root kind, explicit extensions, configuration, manifests, and contribution digests;
2. expand required dependencies without activating unrelated installed packs;
3. require every `ScenarioPackRequest`, dependency, and `extensionOf` target version to be exact SemVer with no range, wildcard, pre-release, or build metadata, select its exact package digest, then record the Catalog, resolver, contract, and canonicalization versions in the Lock;
4. reject missing dependencies, incompatible Core/contract ranges, declared conflicts, and duplicate `packId + version` with different digests;
5. add dependency-before-dependent and manifest `before`/`after` edges;
6. perform a stable topological sort, breaking otherwise equal candidates by `packId`, exact version, and package digest;
7. compose each contribution category using its category rules;
8. validate and apply the `HostPolicyOverlay` and its HostOverrides;
9. emit the Lock, EffectiveScenario, and `PackResolutionReport`.

A dependency or ordering cycle is blocking and includes the minimal known cycle in the report. The resolver never chooses a different Provider or weakens a requirement to make composition succeed.

Category rules are:

- ontology modules resolve to one compatible exact version per module ID;
- duplicate contribution IDs with identical digests are deduplicated; different digests conflict;
- RulePacks follow pack order and their declared internal order;
- interpretation scopes form a union before user-intent and Host-policy intersection;
- Prompt sections use an explicit anchor DAG, then stable namespaced ID ordering;
- review templates form a namespaced union;
- capability requirements form a namespaced union that remains visible to activation and planning; they do not select an Adapter;
- declarations remain pack-scoped, and any false, inconsistent, or Host-policy-prohibited declaration blocks activation;
- unequal defaults for the same target conflict unless a valid HostOverride selects the effective value.

## 9. Discovery, installation, and activation

v0.1 discovery is explicit and local:

```ts
type LocalScenarioPackSource =
  | {
      kind: 'memory'
      definition: ScenarioPack
      logicalFiles: Array<{ path: string; bytes: Uint8Array }>
    }
  | { kind: 'directory'; rootPath: string }
  | {
      kind: 'archive'
      archivePath: string
      acquisitionKind: 'file_archive' | 'npm_tarball' | 'github_release'
    }

interface PackageProvenance {
  publisher: string
  sourceRepository?: string
  sourceRevision?: string
  sourceDigest?: string
}

interface PackageAcquisition {
  sourceKind: 'memory' | 'directory' | 'file_archive' | 'npm_tarball' | 'github_release'
  sourceLocator: string
  distributionDigest: string
  lifecycleScriptsExecuted: false
}

interface ScenarioPackDescriptor {
  manifest: ScenarioPackManifest
  manifestHash: string
  packageDigest: string
  distributionDigest: string
  provenance: PackageProvenance
  acquisition: PackageAcquisition
}

interface ScenarioPackCatalogSnapshot {
  contractVersion: 'voce.scenario-pack/v1alpha1'
  resolverVersion: string
  registryRevision: number
  entries: ScenarioPackDescriptor[]
  availabilityPolicies: PackDeactivation[]
  catalogHash: string
}

type ScenarioPackResolution =
  | {
      status: 'resolved'
      lock: ScenarioCompositionLock
      effectiveScenario: EffectiveScenario
      report: PackResolutionReport & { status: 'resolved' }
    }
  | {
      status: 'blocked'
      report: PackResolutionReport & { status: 'blocked' }
    }

interface ScenarioPackRegistry {
  register(source: LocalScenarioPackSource): ScenarioPackDescriptor
  list(): ScenarioPackDescriptor[]
  snapshot(): ScenarioPackCatalogSnapshot
  setAvailabilityPolicy(policy: PackDeactivation, expectedRegistryRevision: number): number
  unregister(check: PackUninstallCheck): PackUninstallReceipt
  resolve(
    selection: ScenarioPackSelection,
    catalog: ScenarioPackCatalogSnapshot,
  ): ScenarioPackResolution
}

interface PackActivation {
  id: string
  caseId: string
  caseRevision: number
  selectionHash: string
  catalogHash: string
  registryRevision: number
  lockHash: string
  effectiveScenarioHash: string
  resolutionReportHash: string
  acknowledgedDisclosureIds: string[]
  activatedBy: string
  activatedAt: string
  activationHash: string
}
```

An npm tarball may expose a data manifest through a `voce.scenarioPack` package metadata field. A GitHub repository may distribute the same pure-data archive. A Host downloads or packs the archive without executing package lifecycle scripts, then supplies the local archive or fully inventoried development directory; Core never resolves a Node package specifier and never executes a ScenarioPack JavaScript entrypoint.

There is no v0.1 marketplace, global `node_modules` scan, remote registry lookup, automatic download, or activation based on installation. A Host supplies sources explicitly. Registration makes a pack discoverable; `snapshot()` freezes the available descriptors; resolution reads only that immutable snapshot and selects exact content; activation binds it to a Case revision. None of those actions authorizes model calls, asset access, data transfer, Provider selection, or cost.

A blocked resolution returns only the blocking `PackResolutionReport`; it never emits a partial Lock or `EffectiveScenario`. A resolved result returns all three artifacts and its top-level `status` must match `report.status`.

Before reading content, the Loader rejects absolute paths, empty or `.`/`..` segments, backslashes, duplicate or case-colliding normalized paths, symbolic links, hard links, device entries, sockets, FIFOs, executable files or executable-mode bits, and any file missing from the inventory. It applies Host-configured compressed-size, uncompressed-size, file-count, per-file-size, path-length, and expansion-ratio limits before extraction. It then recomputes the inventory, `distributionDigest`, and `packageDigest`; role labels never make executable content acceptable. `PackageProvenance` is an authored origin claim that may be checked against Host policy; v0.1 does not define a custom signature-verification or trust-root system.

`PackageAcquisition` records where this Host obtained the bytes, the complete distribution digest, and that lifecycle scripts were not executed. It is not authored by the pack and is excluded from semantic hashes. `activationHash` is computed from every other `PackActivation` field, including the exact acknowledged disclosure IDs, and never includes itself.

`catalogHash` covers the contract and resolver versions, Registry revision, sorted availability-policy hashes, and the sorted descriptor projection of `packId`, exact version, `manifestHash`, `packageDigest`, `distributionDigest`, and acquisition kind. Registration applies any Host acquisition-source policy before snapshot creation. Local paths and acquisition locators are retained for Host audit but never influence resolution or enter the Catalog hash. Resolution rejects any selection prohibited by the snapshot's availability policies. Activation rechecks the current Registry revision and matching policy before accepting the Lock; a changed policy or revision requires a new snapshot and resolution.

## 10. Upgrade, migration, unload, and replay

Upgrade is explicit resolution of a new Selection into a new Lock and Case revision. It is never an in-place mutation.

```ts
type ScenarioMigrationOperation = { ownerPackId: string } & (
  | { kind: 'rename_configuration'; from: string; to: string }
  | { kind: 'map_configuration_value'; path: string; from: JsonValue; to: JsonValue }
  | { kind: 'remove_configuration'; path: string; requiresConfirmation: true }
  | { kind: 'replace_contribution_id'; from: string; to: string }
)

interface ScenarioMigrationDeclaration {
  migrationId: string
  ownerPackId: string
  fromVersionRange: string
  toVersion: string
  operations: ScenarioMigrationOperation[]
  contentDigest: string
}

interface MigrationPlan {
  fromLockHash: string
  sourceCaseId: string
  sourceCaseRevision: number
  sourceEditableStateHash: string
  targetCaseRevision: number
  targetSelection: ScenarioPackSelection
  targetCatalogHash: string
  targetLockHash: string
  targetEffectiveScenarioHash: string
  targetResolutionReportHash: string
  declarations: Array<{
    packId: string
    migrationId: string
    contentDigest: string
  }>
  operations: ScenarioMigrationOperation[]
  unresolvedItems: UnresolvedItem[]
  confirmationHash?: string
  planHash: string
}

interface MigrationReceipt {
  planHash: string
  fromLockHash: string
  toLockHash: string
  fromEffectiveScenarioHash: string
  toEffectiveScenarioHash: string
  sourceEditableStateHash: string
  confirmationHash?: string
  newCaseRevision: number
  appliedOperationHashes: string[]
  unresolvedItems: UnresolvedItem[]
  receiptHash: string
}

interface PackDeactivation {
  availabilityPolicyId: string
  packId: string
  version?: string
  registryRevision: number
  allowNewActivations: false
  changedBy: string
  reasonCode: string
  changedAt: string
  policyHash: string
}

interface PackUninstallCheck {
  packId: string
  version: string
  distributionDigest: string
  registryRevision: number
  status: 'allowed' | 'blocked'
  blockingReasonCodes: string[]
  activeActivationHashes: string[]
  availabilityPolicyHashes: string[]
  activeSelectionHashes: string[]
  reverseDependencyLockHashes: string[]
  activeCompilationSessionIds: string[]
  activeExecutionRunIds: string[]
  pendingMigrationPlanHashes: string[]
  replayLockHashes: string[]
  checkHash: string
}

interface PackUninstallReceipt {
  checkHash: string
  packId: string
  version: string
  distributionDigest: string
  removedFromRegistry: true
  registryRevisionBefore: number
  registryRevisionAfter: number
  removedLocalPackageBytes: boolean
  tombstoneDescriptorHash: string
  tombstoneProvenanceHash: string
  preservedHistory: true
  unavailableReplayLockHashes: string[]
  receiptHash: string
}
```

Migration operations are declarative, previewable, and confined to their `ownerPackId` configuration, contribution identifiers, and still-editable draft namespace. Resolution chooses exactly one migration path per affected pack; no path or multiple equally applicable paths block with `PACK_MIGRATION_REQUIRED` or `PACK_MIGRATION_INVALID`. Multi-pack operations follow the target composition order. Destructive or ambiguous migration requires a content-addressed confirmation record whose hash enters the Plan and Receipt. The dry-run pins source Case revision/editable-state and target Catalog, Lock, EffectiveScenario, and resolution-report hashes; applying the plan uses compare-and-swap validation for every pin and never re-resolves mutable Registry state. Applying a valid `MigrationPlan` creates the next Case revision and `MigrationReceipt` bound to those already resolved target artifacts; the old artifacts remain immutable.

`PackActivation` is case-revision scoped. Host-wide future availability is separate `PackDeactivation` policy keyed to a pack/version and Registry revision; it prevents new activations but does not cancel active work. A selected or dependency-required pack cannot be unloaded from an existing Lock. Before removal, the Host creates a `PackUninstallCheck` covering active activations, availability policies, selections, reverse dependencies, compilation/execution, pending migrations, and replay retention. Any active blocker returns `PACK_UNINSTALL_BLOCKED`. Registry removal is an atomic unregister from the exact checked revision; a receipt may be created only from an `allowed` check whose hash and target still match. Historical descriptor and provenance hashes move to a separate tombstone store, not the active Registry. A successful `PackUninstallReceipt` never deletes user assets, Locks, run history, receipts, or provenance. Historical plan replay requires the exact package/contribution digests to remain available; otherwise it returns `PACK_IMPLEMENTATION_UNAVAILABLE`, records the affected Lock hashes, and never substitutes or downloads another version.

A live rerun may deliberately migrate to a new Lock, but it is a new Case revision and ExecutionRun with new authorization.

## 11. Trust and prohibited powers

v0.1 executable plugins are trusted local code because process isolation is deferred. This trust boundary must not be overstated:

- a validated Manifest describes requested shape and declared restrictions; it does not sandbox arbitrary package code;
- the supported ScenarioPack runtime artifact is declarative data;
- `RulePackPlugin` and custom loaders are separate trusted plugins and remain capable of process-level side effects outside the ScenarioPack contract;
- Hosts must review third-party executable code and package provenance before registration or execution.

ScenarioPack contributions cannot:

- call the network, read secrets, write files, or execute Providers;
- select an Interpreter, Generator, PostProcessor, Reviewer, or fallback Provider;
- create `RemoteCallAuthorization` or `ExecutionAuthorization`;
- change budgets, destinations, retries, timeouts, retention, consent, moderation, or rights policy;
- mutate `Observation`, decisions, accepted ontology facts, locked Prompt sections, ReferencePlan order, or OutputContract;
- disable the Prompt Guard, capability preflight, cleanup obligations, receipts, or human-review gates.

Any requested remote behavior must be implemented by a separately registered `ProviderAdapter` or other execution Adapter, described by an applicable `ProviderCapabilityProfile`, and travel through the normal plan and authorization path. A ScenarioPack cannot create or modify either object.

## 12. Authoring scaffold and publication audit

The repository provides an ordinary, offline `ScenarioPackTemplate`. It scaffolds data and tests; it is not a privileged generator, installer, marketplace client, or activation path.

```text
package.json
README.md
LICENSE
scenario-pack/manifest.json
scenario-pack/contributions/*.json
scenario-pack/fixtures/*.json
scenario-pack/migrations/*.json
```

```ts
interface ScenarioPackTemplate {
  schemaVersion: 'voce.scenario-pack-template/v1alpha1'
  templateVersion: string
  files: Array<{
    path: string
    role: 'manifest' | 'contribution' | 'fixture' | 'migration' | 'readme' | 'license'
    required: boolean
  }>
  scripts: {
    validate: string
    testOffline: string
    pack: string
    audit: string
  }
  requiredAcceptanceIds: string[]
}

interface ScenarioPackScaffoldInput {
  packageName: string
  packId: string
  kind: 'root' | 'extension'
  license: string
  defaultLocale: string
}

interface ScenarioPackPublishAudit {
  packId: string
  version: string
  distributionDigest: string
  packageDigest: string
  manifestHash: string
  validatorVersion: string
  templateVersion: string
  fixtureSuiteDigests: string[]
  checks: Array<{
    id: string
    status: 'passed' | 'failed'
    evidenceHash?: string
  }>
  auditHash: string
}
```

Scaffolding creates only files in an explicitly chosen workspace. The ordinary publish audit:

1. validates the Manifest, the complete distribution digest, the semantic package digest, and every declared contribution digest;
2. checks the declared license, provenance, Core and contract ranges;
3. checks that `defaultLocale` exists, locale keys resolve, required disclosures are present, and accessibility declarations are complete;
4. validates capability requirements and declarations without selecting an Adapter;
5. proves FixtureSuites run offline with Mock Adapters and no secret;
6. validates migration declarations, rejects lifecycle scripts, all executable content and unsafe archive entries, and ensures every inventory entry resolves inside the package;
7. produces the same package digest from a clean pack operation and emits a `ScenarioPackPublishAudit`.

Passing the audit means only that the package conforms to this contract and its declared offline fixtures. It does not install, register, activate, authorize, certify security, prove model quality, or make the package production-ready. npm and GitHub remain ordinary distribution channels; publication does not let Core discover or download them automatically.

## 13. First-party packages

The initial packages planned for v0.1 will be ordinary Registry entries:

```text
@voce/scenario-virtual-try-on
@voce/scenario-cosplay
@voce/scenario-product-shot
```

They may share versioned ontology and declarative rule schemas, and may depend on compatible extension ScenarioPacks that carry reusable contributions, but Core contains no built-in imports or branches for them. Product-shot must compile with zero people. Replacing any first-party pack with a contract-compatible third-party pack requires no Core change.

## 14. Error codes

```text
PACK_MANIFEST_INVALID
PACK_SCHEMA_UNSUPPORTED
PACK_CONTRIBUTION_INVALID
PACK_DECLARATION_INVALID
PACK_PROVENANCE_INVALID
PACK_FIXTURE_INVALID
PACK_FIXTURE_FAILED
PACK_SOURCE_UNSUPPORTED
PACK_NOT_FOUND
PACK_ROOT_REQUIRED
PACK_MULTIPLE_ROOTS
PACK_KIND_INVALID
PACK_CONFIGURATION_INVALID
PACK_VERSION_UNSATISFIABLE
PACK_COMPATIBILITY_MISMATCH
PACK_CORE_INCOMPATIBLE
PACK_CONTRACT_INCOMPATIBLE
PACK_DIGEST_MISMATCH
PACK_DUPLICATE_ID_VERSION
PACK_DEPENDENCY_UNSATISFIABLE
PACK_DEPENDENCY_MISSING
PACK_CONFLICT
PACK_RULE_CONFLICT
PACK_ORDER_CYCLE
PACK_CAPABILITY_UNSATISFIABLE
PACK_PERMISSION_FORBIDDEN
PACK_OVERRIDE_INVALID
PACK_OVERRIDE_FORBIDDEN
PACK_OVERRIDE_POINT_NOT_FOUND
PACK_DISCLOSURE_REQUIRED
PACK_MIGRATION_REQUIRED
PACK_MIGRATION_INVALID
PACK_MIGRATION_FAILED
PACK_MIGRATION_CONFIRMATION_REQUIRED
PACK_IMPLEMENTATION_UNAVAILABLE
PACK_ACTIVATION_INVALID
PACK_REPLAY_LOCK_MISMATCH
PACK_UNINSTALL_BLOCKED
PACK_TEMPLATE_INVALID
PACK_PUBLISH_AUDIT_FAILED
```

Errors are stable, safe, and accompanied by a `PackResolutionReport` where resolution began. No error activates another pack, downloads content, changes a Provider, or weakens a constraint.

These are the complete public `PACK_*` codes for v0.1. `PACK_DEPENDENCY_UNSATISFIABLE`, `PACK_COMPATIBILITY_MISMATCH`, `PACK_RULE_CONFLICT`, `PACK_OVERRIDE_FORBIDDEN`, `PACK_FIXTURE_FAILED`, and `PACK_MIGRATION_FAILED` are stable top-level categories; the adjacent fine-grained codes may be emitted as structured causes. Implementations may attach safe details but must not mint another public pack-lifecycle code. In particular, unavailable historical bytes or implementations always use `PACK_IMPLEMENTATION_UNAVAILABLE`.

## 15. Version compatibility

ScenarioPack versions use Semantic Versioning:

- major: incompatible Manifest/contract requirements, removed or redefined public vocabulary, changed hard/required semantics, or incompatible configuration;
- minor: backward-compatible additive vocabulary, contributions, optional configuration, or review templates;
- patch: compatible defect correction that preserves public schemas.

Every content change requires a new version and digest. Registries reject two different package digests for the same `packId + version` within one Catalog. v0.1 `ScenarioPackRequest.versionRange`, dependency `versionRange`, and `extensionOf.rootVersionRange` use the field name for future compatibility but accept only exact normal SemVer without pre-release or build metadata. `ScenarioPackConflict.versionRange`, Core/contract compatibility ranges, and migration source ranges remain true SemVer ranges evaluated against already selected exact versions; they may include a pre-release only when the range names it explicitly. Replay and existing Cases use exact pinned versions and digests.

## 16. v0.1 acceptance matrix

| ID | Requirement |
| --- | --- |
| SPK-AC-001 | Core loads first-party and third-party packs through the same Registry and contains no branch or import keyed to a scenario ID. |
| SPK-AC-002 | A `ScenarioPackSelection` contains exactly one root, explicit extensions, and an optional typed `HostPolicyOverlay`; installation, publication, and registration alone activate nothing or grant authorization. |
| SPK-AC-003 | The same `ScenarioPackSelection` with its optional `HostPolicyOverlay`, immutable `ScenarioPackCatalogSnapshot`, and contract versions produces identical `ScenarioCompositionLock`, order, `EffectiveScenario`, `PackResolutionReport`, and semantic hashes. |
| SPK-AC-004 | Locks pin exact versions, manifest/package/configuration/dependency/contribution digests, Catalog and resolver versions, canonicalization profile, and the accepted Host-policy-overlay hash. |
| SPK-AC-005 | Missing dependencies, incompatible Root/Extension or contract ranges, digest mismatches, declared conflicts, duplicate contribution conflicts, and ordering cycles block with explanatory traces. |
| SPK-AC-006 | Ontology, rules, scopes, Prompt sections, review templates, defaults, `UIMetadata`, capability requirements, and declarations obey their authority boundaries; required disclosures gate activation. |
| SPK-AC-007 | Scope composition cannot exceed accepted intent or Host policy and does not authorize interpretation. |
| SPK-AC-008 | Prompt contributions cannot change locked sections, unconfirmed evidence, approved reference order, Provider selection, or Prompt Guard behavior. |
| SPK-AC-009 | Review templates create tasks only; semantic and human acceptance remain outside ScenarioPack authority. |
| SPK-AC-010 | Defaults apply only to unspecified values with declared-default provenance and cannot set security, Provider, cost, or authorization fields. |
| SPK-AC-011 | Every HostOverride names its pack and declared OverridePoint; invalid overrides or overlays cannot weaken hard/required constraints, confirmed facts, policy, authorization, or package digests. |
| SPK-AC-012 | Upgrade and the unique valid `MigrationPlan` create a new Selection, Lock, EffectiveScenario, Case revision, and `MigrationReceipt`; operations remain in their owner-pack namespace and preserve old artifacts. |
| SPK-AC-013 | Deactivation and uninstall use explicit checks/receipts, never mutate historical Locks or user history, and return `PACK_UNINSTALL_BLOCKED` or `PACK_IMPLEMENTATION_UNAVAILABLE` without substitution or network retrieval. |
| SPK-AC-014 | Acquisition verifies safe paths, resource limits, complete inventory and SHA-256 distribution/package digests without lifecycle scripts or executable content; discovery remains explicit/local, with no marketplace, dynamic scan, automatic download, hidden Provider, implicit activation, or runtime authority from publication. |
| SPK-AC-015 | Virtual try-on, cosplay, and product-shot each pass their declared offline `FixtureSuite` through Mock Adapters and the same Core pipeline without a secret, network call, or real Provider. |
