import type {
  ArtifactHandle,
  ChangeIntent,
  CompilationContext,
  Constraint,
  ConstraintIR,
  EvidenceAndSourceResolverInput,
  Importance,
  JsonValue,
  OntologyInstance,
  OutputContract,
  PipelinePlan,
  PromptCandidateIR,
  PromptGuardResult,
  PromptIR,
  ProviderCapabilityProfile,
  ProviderRenderRequest,
  ReferenceCandidate,
  ReferenceDependency,
  ReferencePlan,
  RequestedScope,
  RequestedScopePlan,
} from '@voce-engine/contracts'
import {
  MOCK_IMAGE_PROFILE,
  computeCompilationContextHash,
  computeReferenceCandidateHash,
  computeRequestedScopePlanHash,
  compileConstraints,
  compilePromptIR,
  createProviderRenderRequest,
  createReferenceCandidate,
  expandVisualCompositionPreset,
  guardPromptCandidate,
  optimizePromptIR,
  planPipeline,
  planReferences,
  resolveEvidenceAndSource,
  visualCompositionEvaluationExpectation,
  canonicalize,
  sha256,
} from '@voce-engine/core'
import type { PlaygroundScenarioId, ScenarioDistribution, ScenarioRoleCondition, ScenarioRolePolicy } from './scenario-distribution.js'
import { rolePolicyFor, scenarioDistribution } from './scenario-distribution.js'

export interface PlaygroundAssetDeclaration extends ArtifactHandle {
  /** Upload metadata is not semantic evidence; it only makes offline planning budgetable. */
  byteLength: number
  /** Pose references are pre-existing assets only; no extraction or editing is performed here. */
  poseSourceKind?: 'skeleton-image' | 'action-photo' | 'pose-sketch'
}

export interface PlaygroundDeclaredRole {
  assetId: string
  role: string
  /** Compatibility-only assertion. When supplied, it must equal the
   * ScenarioPack-declared reference order and never overrides it. */
  order?: number
  /** Typed, ScenarioPack allow-listed role metadata. Browser never supplies paths. */
  typedMetadata?: Readonly<Record<string, JsonValue>>
  /** Backwards-compatible input spelling; it is normalized before compilation. */
  metadata?: Readonly<Record<string, JsonValue>>
}

export type GarmentTopCategory = 't_shirt' | 'shirt' | 'blouse' | 'knitwear' | 'jacket' | 'coat' | 'vest' | 'other_upper'
export type GarmentBottomCategory = 'trousers' | 'jeans' | 'skirt' | 'shorts' | 'leggings' | 'other_lower'
export type GarmentFullBodyCategory = 'dress' | 'jumpsuit' | 'robe' | 'complete_outfit' | 'other_full_body'
export type FullBodyStructure = 'one_piece' | 'complete_outfit'
export type AccessoryType = 'bracelet' | 'ring' | 'brooch' | 'necklace' | 'earring' | 'hair_accessory'
export type AccessoryPlacement = 'wrist' | 'hand_finger_region' | 'chest' | 'neck' | 'ear' | 'hair_head'
export type AccessorySide = 'left' | 'right' | 'both' | 'center'

export interface TryOnTypedMetadata {
  category?: GarmentTopCategory | GarmentBottomCategory | GarmentFullBodyCategory
  structure?: FullBodyStructure
  appearance?: JsonValue
}

export interface AccessoryTypedMetadata {
  accessoryType: AccessoryType
  placement: AccessoryPlacement
  side: AccessorySide
  appearance?: JsonValue
}

export interface PlaygroundCompositionSelection {
  presetId: string
  inputs?: Readonly<Record<string, JsonValue>>
  importance?: Importance
}

export interface PlaygroundScenarioInput {
  scenarioId: PlaygroundScenarioId
  caseId?: string
  caseRevision?: number
  assets: readonly PlaygroundAssetDeclaration[]
  declaredRoles: readonly PlaygroundDeclaredRole[]
  compositionSelections?: readonly PlaygroundCompositionSelection[]
  outputContract?: OutputContract
}

export interface ReferenceCandidateSeed {
  schemaVersion: 'voce.playground-reference-candidate-seed/v1alpha1'
  id: string
  assetId: string
  artifact: PlaygroundAssetDeclaration
  role: string
  orderKey: string
  importance: Importance
  ontologyScopes: readonly string[]
  authorizedTargetPaths: readonly string[]
  prohibitedTargetPaths: readonly string[]
  prohibitedTargetPathImportance: Readonly<Record<string, Importance>>
  typedMetadata?: Readonly<Record<string, JsonValue>>
  supportingIntentIds: readonly string[]
  seedHash: string
}

export interface ReferenceDependencySeed {
  schemaVersion: 'voce.playground-reference-dependency-seed/v1alpha1'
  id: string
  parentSeedId: string
  childSeedId: string
  kind: ReferenceDependency['kind']
  importance: Importance
  reasonCode: string
  explanation: string
  seedHash: string
}

export interface PlaygroundDeclaredRolePlan {
  scenarioId: PlaygroundScenarioId
  distributionHash: string
  roles: ReadonlyArray<{ role: string; policyDigest: string; declaredAssetIds: readonly string[] }>
  planHash: string
}

export interface ScenarioCompilationSeed {
  requestedScopePlan: RequestedScopePlan
  changeIntents: readonly ChangeIntent[]
  referenceCandidateSeeds: readonly ReferenceCandidateSeed[]
  referenceDependencySeeds: readonly ReferenceDependencySeed[]
  declaredRolePlan: PlaygroundDeclaredRolePlan
}

export interface ReferenceCandidateBindingResult {
  candidates: readonly ReferenceCandidate[]
  dependencies: readonly ReferenceDependency[]
  omittedSeeds: readonly { seedId: string; reasonCode: string }[]
}

export interface HumanPlan {
  scenarioId: PlaygroundScenarioId
  distributionHash: string
  summary: string
  declaredRoles: readonly { role: string; assetId: string; authorized: readonly string[]; notAuthorized: readonly string[] }[]
  observedFacts: readonly string[]
  confirmedSourceBindings: readonly string[]
  selectedReferences: readonly { role: string; assetId: string; contributionPaths: readonly string[]; prohibitedPaths: readonly string[] }[]
  omittedReferences: readonly { seedId: string; reasonCode: string }[]
}

export interface PlaygroundEvaluationCriterion {
  id: string
  label: string
  expectation: string
  status: 'pending'
}

export interface PlaygroundEvaluationPlan {
  schemaVersion: 'voce.playground-evaluation-plan/v1alpha1'
  criteria: readonly PlaygroundEvaluationCriterion[]
  automaticRetry: false
}

export interface SemanticClosureResult {
  seed: ScenarioCompilationSeed
  ontologyInstance: OntologyInstance
  constraintIR: ConstraintIR
  binding: ReferenceCandidateBindingResult
  referencePlan: ReferencePlan
  pipelinePlan: PipelinePlan
  promptIR: PromptIR
  promptCandidate: PromptCandidateIR
  guardResult: PromptGuardResult
  providerRenderRequest: ProviderRenderRequest
  humanPlan: HumanPlan
  evaluationPlan: PlaygroundEvaluationPlan
}

const IMPORTANCE_RANK: Record<Importance, number> = { preferred: 1, required: 2, hard: 3 }
const FIXED_TIME = '2026-01-01T00:00:00.000Z'
const MOCK_ADAPTER = { id: MOCK_IMAGE_PROFILE.adapterId, version: MOCK_IMAGE_PROFILE.version, digest: MOCK_IMAGE_PROFILE.adapterDigest! }
const OPTIMIZER = { id: 'voce.deterministic-prompt-optimizer', version: '1.0.0', digest: sha256({ id: 'voce.deterministic-prompt-optimizer', version: '1.0.0' }) }

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T
}

function stableId(prefix: string, value: unknown): string {
  return `${prefix}-${sha256(JSON.parse(JSON.stringify(value)) as JsonValue).slice('sha256:'.length, 'sha256:'.length + 20)}`
}

function sortedStrings(values: readonly string[]): string[] {
  return [...new Set(values)].sort(compareCodeUnits)
}

function freeze<T>(value: T): T { return Object.freeze(value) }

function compareCodeUnits(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0
}

function inferredImportance(policy: ScenarioRolePolicy): Importance {
  return policy.targets.reduce<Importance>((current, target) => IMPORTANCE_RANK[target.importance] > IMPORTANCE_RANK[current] ? target.importance : current, 'preferred')
}

function outputContract(input: PlaygroundScenarioInput): OutputContract {
  return clone(input.outputContract ?? { artifactKind: 'image', dataType: 'image', mediaTypes: ['image/png'], cardinality: { min: 1, max: 1 }, background: 'opaque', allowAlpha: false })
}

function validateAssets(input: PlaygroundScenarioInput): Map<string, PlaygroundAssetDeclaration> {
  const assets = new Map<string, PlaygroundAssetDeclaration>()
  for (const asset of input.assets) {
    if (!asset.id || assets.has(asset.id)) throw new Error('PLAYGROUND_ASSET_ID_INVALID')
    if (!Number.isInteger(asset.byteLength) || asset.byteLength < 0) throw new Error(`PLAYGROUND_ASSET_BYTE_LENGTH_INVALID:${asset.id}`)
    if (asset.availability !== 'available') throw new Error(`PLAYGROUND_ASSET_UNAVAILABLE:${asset.id}`)
    assets.set(asset.id, clone(asset))
  }
  return assets
}

function metadataOf(declaration: PlaygroundDeclaredRole): Record<string, JsonValue> {
  return clone((declaration.typedMetadata ?? declaration.metadata ?? {}) as Record<string, JsonValue>)
}

function metadataError(declaration: PlaygroundDeclaredRole, kind: 'required' | 'value' | 'combination', fieldId?: string, policy?: ScenarioRolePolicy): Error {
  if (declaration.role.startsWith('garment-')) {
    if (fieldId === 'structure') return new Error(`PLAYGROUND_GARMENT_STRUCTURE_REQUIRED:${declaration.assetId}`)
    if (kind === 'combination') return new Error(`PLAYGROUND_GARMENT_STRUCTURE_CATEGORY_MISMATCH:${declaration.assetId}`)
    return new Error(`PLAYGROUND_GARMENT_CATEGORY_INVALID:${declaration.role}:${declaration.assetId}`)
  }
  if (declaration.role === 'accessory-detail') {
    if (kind === 'combination') {
      const metadata = metadataOf(declaration)
      const typeAndPlacementMatch = policy?.typedMetadata?.combinations?.some((combination) => combination.values.accessoryType === metadata.accessoryType && combination.values.placement === metadata.placement)
      return new Error(`${typeAndPlacementMatch ? 'PLAYGROUND_ACCESSORY_SIDE_INVALID' : 'PLAYGROUND_ACCESSORY_PAIR_INVALID'}:${declaration.assetId}`)
    }
    return new Error(`PLAYGROUND_ACCESSORY_METADATA_INVALID:${declaration.assetId}`)
  }
  return new Error(`PLAYGROUND_TYPED_METADATA_INVALID:${declaration.role}:${declaration.assetId}`)
}

function normalizeTypedMetadata(declaration: PlaygroundDeclaredRole, policy: ScenarioRolePolicy): Readonly<Record<string, JsonValue>> {
  const metadata = metadataOf(declaration)
  const metadataPolicy = policy.typedMetadata
  if (!metadataPolicy) {
    if (Object.keys(metadata).length) throw metadataError(declaration, 'value')
    return {}
  }
  const fields = metadataPolicy.fields
  if (Object.keys(metadata).some((fieldId) => !fields[fieldId])) throw metadataError(declaration, 'value')
  const normalized: Record<string, JsonValue> = {}
  for (const [fieldId, field] of Object.entries(fields)) {
    const value = metadata[fieldId] ?? field.defaultValue
    if (value === undefined) {
      if (field.required) throw metadataError(declaration, 'required', fieldId)
      continue
    }
    if (!field.values.some((allowed) => canonicalize(allowed) === canonicalize(value))) throw metadataError(declaration, 'value', fieldId)
    normalized[fieldId] = clone(value)
  }
  if (metadataPolicy.combinations && Object.keys(normalized).length > 0 && !metadataPolicy.combinations.some((combination) => Object.entries(combination.values).every(([fieldId, value]) => normalized[fieldId] !== undefined && canonicalize(normalized[fieldId]) === canonicalize(value)))) throw metadataError(declaration, 'combination', undefined, policy)
  if (declaration.role === 'accessory-detail') normalized.itemId = stableId('accessory-item', { assetId: declaration.assetId })
  return normalized
}

function activeWhen(conditions: readonly ScenarioRoleCondition[] | undefined, presentRoles: ReadonlySet<string>): boolean {
  return !conditions || conditions.every((condition) => condition.presence === 'present' ? presentRoles.has(condition.role) : !presentRoles.has(condition.role))
}

function effectivePolicy(policy: ScenarioRolePolicy, presentRoles: ReadonlySet<string>): ScenarioRolePolicy {
  const bindings = policy.bindings.filter((binding) => activeWhen(binding.activeWhen, presentRoles))
  const targets = policy.targets.filter((target) => activeWhen(target.activeWhen, presentRoles))
  const authorizedTargetPaths = sortedStrings(bindings.filter((binding) => binding.relation !== 'exclude').map((binding) => binding.targetPath))
  const prohibitedTargetPaths = sortedStrings(bindings.filter((binding) => binding.relation === 'exclude').map((binding) => binding.targetPath))
  const importance = Object.fromEntries(prohibitedTargetPaths.map((path) => [path, policy.prohibitedTargetPathImportance[path] ?? 'hard']))
  const base = { ...policy, bindings, targets, authorizedTargetPaths, prohibitedTargetPaths, prohibitedTargetPathImportance: importance }
  const digestBase: Record<string, unknown> = { ...base }
  delete digestBase.policyDigest
  return freeze({ ...base, policyDigest: sha256(JSON.parse(JSON.stringify(digestBase)) as JsonValue) })
}

function rolePlan(distribution: ScenarioDistribution, declarations: readonly PlaygroundDeclaredRole[]): { normalized: PlaygroundDeclaredRole[]; policies: Map<string, ScenarioRolePolicy>; assetsByRole: Map<string, PlaygroundDeclaredRole[]> } {
  const policies = new Map<string, ScenarioRolePolicy>()
  const assetsByRole = new Map<string, PlaygroundDeclaredRole[]>()
  const normalized = declarations.map((declaration) => {
    const policy = rolePolicyFor(distribution, declaration.role)
    if (!policy) throw new Error(`PLAYGROUND_ROLE_UNKNOWN:${declaration.role}`)
    if (declaration.order !== undefined && declaration.order !== policy.referenceOrder) throw new Error(`PLAYGROUND_REFERENCE_ORDER_NOT_DECLARED:${declaration.role}:${declaration.order}`)
    return { ...declaration, typedMetadata: normalizeTypedMetadata(declaration, policy), order: policy.referenceOrder }
  }).sort((left, right) => Number(left.order) - Number(right.order) || compareCodeUnits(`${left.role}|${left.assetId}`, `${right.role}|${right.assetId}`))
  const seenAssets = new Set<string>()
  for (const declaration of normalized) {
    if (seenAssets.has(declaration.assetId)) throw new Error(`PLAYGROUND_ASSET_ROLE_CONFLICT:${declaration.assetId}`)
    seenAssets.add(declaration.assetId)
    const policy = rolePolicyFor(distribution, declaration.role)!
    policies.set(declaration.role, policy)
    const list = assetsByRole.get(declaration.role) ?? []
    list.push(declaration)
    assetsByRole.set(declaration.role, list)
  }
  for (const policy of distribution.roles) {
    const count = assetsByRole.get(policy.role)?.length ?? 0
    if (count < policy.minCount) throw new Error(`PLAYGROUND_REQUIRED_ROLE_MISSING:${policy.role}`)
    if (count > policy.maxCount) throw new Error(`PLAYGROUND_ROLE_CARDINALITY_EXCEEDED:${policy.role}`)
  }
  const presentRoles = new Set(normalized.map((declaration) => declaration.role))
  for (const group of distribution.roleGroups) {
    const count = group.roles.reduce((sum, role) => sum + (assetsByRole.get(role)?.length ?? 0), 0)
    if (group.operator === 'atLeastOne' && count < (group.minCount ?? 1)) throw new Error(`PLAYGROUND_REQUIRED_ROLE_GROUP_MISSING:${group.id}`)
    if (group.operator === 'mutuallyExclusive' && count > (group.maxCount ?? 1)) throw new Error(`PLAYGROUND_ROLE_GROUP_MUTUALLY_EXCLUSIVE:${group.id}`)
  }
  for (const [role, policy] of [...policies]) policies.set(role, effectivePolicy(policy, presentRoles))
  return { normalized, policies, assetsByRole }
}

function scopePlan(input: PlaygroundScenarioInput, normalized: readonly PlaygroundDeclaredRole[], assets: Map<string, PlaygroundAssetDeclaration>, policies: Map<string, ScenarioRolePolicy>, caseId: string, caseRevision: number): RequestedScopePlan {
  const scopes: RequestedScope[] = []
  for (const declaration of normalized) {
    const asset = assets.get(declaration.assetId)!
    const policy = policies.get(declaration.role)!
    for (const path of policy.authorizedTargetPaths) {
      scopes.push({ schemaVersion: 'voce.requested-scope/v1alpha1', id: stableId('scope', { assetId: asset.id, role: declaration.role, targetPath: path }), ontologyPath: path, assetIds: [asset.id], purpose: 'resolve_change', required: policy.minCount > 0 })
    }
  }
  const base = { schemaVersion: 'voce.requested-scope-plan/v1alpha1' as const, id: stableId('scope-plan', { caseId, caseRevision, scenarioId: input.scenarioId, scopes }), caseId, caseRevision, scopes: scopes.sort((left, right) => compareCodeUnits(left.id, right.id)), excludedScopes: [], questions: [] }
  return { ...base, planHash: computeRequestedScopePlanHash(base) }
}

function typedReferenceValue(role: string, targetPath: string, metadata: Readonly<Record<string, JsonValue>>, assetId: string, presentRoles: ReadonlySet<string>): JsonValue | undefined {
  if (targetPath === 'person.identity' || targetPath.startsWith('person.identity.')) return `reference:${assetId}`
  if (targetPath === 'wardrobe.replacement.scope') return role === 'garment-full-body' || (presentRoles.has('garment-top') && presentRoles.has('garment-bottom')) ? 'upper_and_lower' : role === 'garment-top' ? 'upper' : role === 'garment-bottom' ? 'lower' : undefined
  if (targetPath === 'wardrobe.garment.structure') return metadata.structure === 'one_piece' || metadata.structure === 'complete_outfit' ? metadata.structure : undefined
  if (targetPath === 'wardrobe.garment.sourceLayout') return role === 'garment-full-body' ? 'single_reference' : role.startsWith('garment-') ? 'separate_references' : undefined
  if (targetPath === 'wardrobe.upper.category' || targetPath === 'wardrobe.lower.category' || targetPath === 'wardrobe.fullBody.category') return metadata.category
  if (targetPath === 'wardrobe.upper' || targetPath === 'wardrobe.lower' || targetPath === 'wardrobe.fullBody' || targetPath === 'wardrobe.footwear') return `reference:${assetId}`
  if (targetPath.startsWith('wardrobe.fit.')) return `fit-reference:${assetId}`
  if (targetPath === 'wardrobe.accessories.items') return role === 'accessory-detail'
    ? JSON.stringify({ itemId: metadata.itemId, accessoryType: metadata.accessoryType, placement: metadata.placement, side: metadata.side, appearance: metadata.appearance })
    : `reference:${assetId}`
  if (targetPath === 'character.signatureProps.primary.signatureDetails') return `reference:${assetId}`
  if (targetPath === 'character.criticalDetails') return `reference:${assetId}`
  if (targetPath === 'pose') return role === 'pose' ? `pose-reference:${assetId}` : undefined
  if (targetPath.startsWith('character.') || targetPath === 'style') return `reference:${assetId}`
  if (targetPath.includes('camera.')) return undefined
  return `reference:${assetId}`
}

export function compileScenarioInput(input: PlaygroundScenarioInput): ScenarioCompilationSeed {
  const distribution = scenarioDistribution(input.scenarioId)
  const assets = validateAssets(input)
  const caseId = input.caseId ?? `playground-${input.scenarioId}`
  const caseRevision = input.caseRevision ?? 1
  const { normalized, policies, assetsByRole } = rolePlan(distribution, input.declaredRoles)
  for (const declaration of normalized) if (!assets.has(declaration.assetId)) throw new Error(`PLAYGROUND_ASSET_NOT_DECLARED:${declaration.assetId}`)
  for (const declaration of normalized) {
    if (declaration.role === 'pose' && !['skeleton-image', 'action-photo', 'pose-sketch'].includes(assets.get(declaration.assetId)!.poseSourceKind ?? '')) throw new Error(`PLAYGROUND_POSE_SOURCE_INVALID:${declaration.assetId}`)
  }
  const requestedScopePlan = scopePlan(input, normalized, assets, policies, caseId, caseRevision)
  const presentRoles = new Set(normalized.map((declaration) => declaration.role))
  const referenceCandidateSeeds: ReferenceCandidateSeed[] = []
  const changeIntents: ChangeIntent[] = []
  for (const declaration of normalized) {
    const policy = policies.get(declaration.role)!
    const asset = assets.get(declaration.assetId)!
    const seedId = stableId('candidate-seed', { scenarioId: input.scenarioId, assetId: asset.id, role: declaration.role, order: declaration.order ?? 0 })
    const authorizedTargetPaths = sortedStrings(policy.authorizedTargetPaths)
    const prohibitedTargetPaths = sortedStrings(policy.prohibitedTargetPaths)
    const prohibitedTargetPathImportance = Object.fromEntries(Object.entries(policy.prohibitedTargetPathImportance).sort(([left], [right]) => compareCodeUnits(left, right)))
    const supportingIntentIds: string[] = []
    for (const target of policy.targets) {
      const targetPath = target.targetPath
      const requestedValue = typedReferenceValue(declaration.role, targetPath, declaration.typedMetadata ?? {}, asset.id, presentRoles)
      const intentId = stableId('declared-intent', { seedId, targetPath, operation: target.operation, importance: target.importance, requestedValue })
      supportingIntentIds.push(intentId)
      changeIntents.push({ schemaVersion: 'voce.change-intent/v1alpha1', id: intentId, operation: target.operation, targetPath, ...(requestedValue === undefined ? {} : { requestedValue }), sourceHintIds: sortedStrings([asset.id, policy.id, seedId]), importance: target.importance, provenance: { source: 'user_explicit', sourceIds: sortedStrings([asset.id, policy.id, seedId]), createdBy: 'voce-playground-scenario-input', createdAt: FIXED_TIME } })
    }
    const seedBase = { schemaVersion: 'voce.playground-reference-candidate-seed/v1alpha1' as const, id: seedId, assetId: asset.id, artifact: asset, role: declaration.role, orderKey: `${String(declaration.order ?? 0).padStart(4, '0')}|${declaration.role}|${asset.id}`, importance: inferredImportance(policy), ontologyScopes: authorizedTargetPaths, authorizedTargetPaths, prohibitedTargetPaths, prohibitedTargetPathImportance, ...(declaration.typedMetadata ? { typedMetadata: declaration.typedMetadata } : {}), supportingIntentIds: sortedStrings(supportingIntentIds) }
    referenceCandidateSeeds.push({ ...seedBase, seedHash: sha256(JSON.parse(JSON.stringify(seedBase)) as JsonValue) })
  }
  const compositionSelections = input.compositionSelections ?? []
  if (compositionSelections.length > 0 && !distribution.capabilities.composition) throw new Error('PLAYGROUND_TRYON_COMPOSITION_NOT_SUPPORTED')
  const duplicatePresetIds = sortedStrings(compositionSelections.map((selection) => selection.presetId)).filter((presetId) => compositionSelections.filter((selection) => selection.presetId === presetId).length > 1)
  if (duplicatePresetIds.length) throw new Error(`PLAYGROUND_COMPOSITION_SELECTION_DUPLICATE:${duplicatePresetIds.join(',')}`)
  const compositionIntents = compositionSelections.flatMap((selection) => expandVisualCompositionPreset(selection.presetId, { inputs: selection.inputs as Record<string, JsonValue> | undefined, sourceHintIds: [`playground-composition:${input.scenarioId}:${selection.presetId}`] }).map((intent) => ({ ...intent, importance: selection.importance ?? intent.importance })))
  changeIntents.push(...compositionIntents)
  const roles = [...policies.values()].sort((left, right) => compareCodeUnits(left.role, right.role)).map((policy) => ({ role: policy.role, policyDigest: policy.policyDigest, declaredAssetIds: sortedStrings((assetsByRole.get(policy.role) ?? []).map((item) => item.assetId)) }))
  const rolePlanBase = { scenarioId: input.scenarioId, distributionHash: distribution.distributionHash, roles }
  const declaredRolePlan: PlaygroundDeclaredRolePlan = { ...rolePlanBase, planHash: sha256(JSON.parse(JSON.stringify(rolePlanBase)) as JsonValue) }
  const referenceDependencySeeds: ReferenceDependencySeed[] = []
  return { requestedScopePlan, changeIntents: changeIntents.sort((left, right) => compareCodeUnits(left.id, right.id)), referenceCandidateSeeds: referenceCandidateSeeds.sort((left, right) => compareCodeUnits(left.id, right.id)), referenceDependencySeeds, declaredRolePlan }
}

function targetPathAllowed(constraint: Constraint, allowed: readonly string[]): boolean {
  const paths = constraint.targetPaths.length ? constraint.targetPaths : constraint.targetPath ? [constraint.targetPath] : []
  return paths.some((path) => allowed.includes(path) || allowed.some((candidate) => path.startsWith(`${candidate}.`)))
}

function bindingConstraint(seed: ReferenceCandidateSeed, constraints: readonly Constraint[]): Constraint[] {
  return constraints.filter((constraint) => (constraint.status === 'active' || constraint.status === 'satisfied') && constraint.sourceIds.some((sourceId) => seed.supportingIntentIds.includes(sourceId)) && targetPathAllowed(constraint, seed.authorizedTargetPaths))
}

export function bindReferenceCandidates(input: { seeds: readonly ReferenceCandidateSeed[]; dependencySeeds: readonly ReferenceDependencySeed[]; constraintIR: ConstraintIR }): ReferenceCandidateBindingResult {
  if (input.constraintIR.status !== 'ok') throw new Error('PLAYGROUND_CONSTRAINT_IR_NOT_OK')
  const candidates: ReferenceCandidate[] = []
  const omittedSeeds: { seedId: string; reasonCode: string }[] = []
  for (const seed of [...input.seeds].sort((left, right) => compareCodeUnits(left.id, right.id))) {
    const matched = bindingConstraint(seed, input.constraintIR.constraints)
    if (matched.length === 0) {
      if (seed.importance === 'preferred') omittedSeeds.push({ seedId: seed.id, reasonCode: 'PREFERRED_REFERENCE_NO_SURVIVING_CONSTRAINT' })
      else throw new Error(`PLAYGROUND_REQUIRED_REFERENCE_NO_SURVIVING_CONSTRAINT:${seed.id}`)
      continue
    }
    const constraintIds = sortedStrings(matched.map((constraint) => constraint.id))
    const goalIds = sortedStrings(matched.flatMap((constraint) => constraint.goalIds))
    const base = { schemaVersion: 'voce.reference-candidate/v1alpha1' as const, id: seed.id, assetId: seed.assetId, artifact: clone(seed.artifact), contentHash: seed.artifact.contentHash, mediaType: seed.artifact.mediaType, byteLength: seed.artifact.byteLength, role: seed.role, ontologyScopes: sortedStrings(seed.ontologyScopes), prohibitedTargetPaths: sortedStrings(seed.prohibitedTargetPaths), prohibitedTargetPathImportance: clone(seed.prohibitedTargetPathImportance), ...(seed.typedMetadata ? { typedMetadata: clone(seed.typedMetadata) } : {}), importance: seed.importance, constraintIds, sourceBindingIds: [], goalIds, orderKey: seed.orderKey } as unknown as Omit<ReferenceCandidate, 'candidateHash'>
    candidates.push(createReferenceCandidate(base))
  }
  const candidateIds = new Set(candidates.map((candidate) => candidate.id))
  const dependencies: ReferenceDependency[] = []
  for (const seed of [...input.dependencySeeds].sort((left, right) => compareCodeUnits(left.id, right.id))) {
    if (!candidateIds.has(seed.parentSeedId) || !candidateIds.has(seed.childSeedId)) {
      if (seed.importance !== 'preferred') throw new Error(`PLAYGROUND_REQUIRED_REFERENCE_DEPENDENCY_MISSING:${seed.id}`)
      continue
    }
    const base = { schemaVersion: 'voce.reference-dependency/v1alpha1' as const, id: seed.id, parentCandidateId: seed.parentSeedId, childCandidateId: seed.childSeedId, kind: seed.kind, importance: seed.importance, reasonCode: seed.reasonCode, explanation: seed.explanation }
    dependencies.push({ ...base, dependencyHash: sha256(JSON.parse(JSON.stringify(base)) as JsonValue) })
  }
  return { candidates, dependencies, omittedSeeds }
}

function buildContext(input: PlaygroundScenarioInput, distribution: ScenarioDistribution, assets: readonly PlaygroundAssetDeclaration[], profile: ProviderCapabilityProfile, caseId: string, caseRevision: number): CompilationContext {
  const caseSpecHash = sha256({ caseId, caseRevision, scenarioId: input.scenarioId, assets: assets.map((asset) => ({ id: asset.id, contentHash: asset.contentHash })) } as unknown as JsonValue)
  const base: Omit<CompilationContext, 'contextHash'> = {
    caseSpecId: caseId,
    caseSpecRevision: caseRevision,
    caseSpecHash,
    artifactHashes: sortedStrings(assets.map((asset) => asset.contentHash)),
    decisionHashes: [],
    scenarioCompositionLockHash: distribution.effectiveScenario.lockHash,
    effectiveScenarioHash: distribution.effectiveScenario.effectiveScenarioHash,
    rulePackPlugins: [],
    optimizer: OPTIMIZER,
    hostPolicy: { id: 'voce.playground-host-policy', version: '1.0.0', digest: sha256({ id: 'voce.playground-host-policy', version: '1.0.0' }) },
    adapters: [MOCK_ADAPTER],
    capabilityProfiles: [{ id: profile.id, version: profile.version, digest: profile.profileHash }],
    selectedGenerationProfileId: profile.id,
    optimizerMode: 'strict',
  }
  return { ...base, contextHash: computeCompilationContextHash(base as CompilationContext) }
}

function readableHumanPlan(input: PlaygroundScenarioInput, seeds: readonly ReferenceCandidateSeed[]): string {
  const roles = new Set(seeds.map((seed) => seed.role))
  if (input.scenarioId === 'virtual-tryon') {
    const fullBody = seeds.find((seed) => seed.role === 'garment-full-body')
    const replacements = fullBody
      ? [fullBody.typedMetadata?.structure === 'complete_outfit' ? 'the complete outfit' : fullBody.typedMetadata?.structure === 'one_piece' ? 'the one-piece garment' : 'the full outfit from its single reference']
      : [roles.has('garment-top') ? 'the top' : '', roles.has('garment-bottom') ? 'the bottom' : ''].filter(Boolean)
    const preserved = [
      "the person's identity",
      !fullBody && !roles.has('garment-top') ? 'the original top' : '',
      !fullBody && !roles.has('garment-bottom') ? 'the original bottom' : '',
      !roles.has('footwear-detail') ? 'the original shoes' : '',
      !roles.has('pose') ? 'the original pose' : '',
      'the original framing',
    ].filter(Boolean)
    const accessoryCount = seeds.filter((seed) => seed.role === 'accessory-detail').length
    const optional = [roles.has('footwear-detail') ? 'Replace the shoes.' : '', roles.has('pose') ? 'Adjust only the pose from its reference.' : '', roles.has('fit-reference') ? 'Apply the selected fit only to replaced clothing.' : '', accessoryCount ? `Add ${accessoryCount} declared accessor${accessoryCount === 1 ? 'y' : 'ies'} at the selected placement${accessoryCount === 1 ? '' : 's'}.` : 'Keep the original accessories.'].filter(Boolean)
    return `Replace ${replacements.join(' and ')}. Keep ${preserved.join(', ')}.${optional.length ? ` ${optional.join(' ')}` : ''}`
  }
  const composition = (input.compositionSelections ?? []).map((selection) => selection.presetId).join(', ')
  return `Keep the person from the real-person reference. Replace only the hairstyle, costume, accessories, and props from the character-design reference, and keep the result photographic.${composition ? ` Use the selected composition: ${composition}.` : ''}`
}

function evaluationPlan(input: PlaygroundScenarioInput, seeds: readonly ReferenceCandidateSeed[]): PlaygroundEvaluationPlan {
  const roles = new Set(seeds.map((seed) => seed.role))
  const criteria: PlaygroundEvaluationCriterion[] = [{ id: 'identity', label: 'Identity', expectation: input.scenarioId === 'cosplay' ? "The output must be the exact uploaded real person, not merely a similar cosplayer; the character reference must not supply, reshape, stylize, or idealize the face." : "Preserve the uploaded person's identity.", status: 'pending' }]
  if (input.scenarioId === 'virtual-tryon') {
    const fullBody = seeds.find((seed) => seed.role === 'garment-full-body')
    criteria.push(
      { id: 'upper', label: 'Upper garment', expectation: fullBody || roles.has('garment-top') ? 'Replace the upper garment from the declared clothing reference.' : 'Preserve the original upper garment.', status: 'pending' },
      { id: 'lower', label: 'Lower garment', expectation: fullBody || roles.has('garment-bottom') ? 'Replace the lower garment from the declared clothing reference.' : 'Preserve the original lower garment.', status: 'pending' },
      { id: 'footwear', label: 'Footwear', expectation: roles.has('footwear-detail') ? 'Replace footwear from the declared footwear reference.' : 'Preserve the original footwear.', status: 'pending' },
      { id: 'pose', label: 'Pose', expectation: roles.has('pose') ? 'Use only the declared pose reference.' : 'Preserve the original pose on a best-effort basis.', status: 'pending' },
      { id: 'framing', label: 'Framing', expectation: 'Preserve the source framing and camera relationship.', status: 'pending' },
    )
    if (fullBody?.typedMetadata?.structure === 'one_piece') criteria.push({ id: 'one-piece-continuity', label: 'One-piece continuity', expectation: 'Keep the upper and lower portions visually continuous as one garment.', status: 'pending' })
    if (fullBody?.typedMetadata?.structure === 'complete_outfit') criteria.push({ id: 'complete-outfit', label: 'Complete outfit', expectation: 'Keep the upper and lower pieces coordinated while remaining distinct garments.', status: 'pending' })
    for (const seed of seeds.filter((item) => item.role === 'accessory-detail')) {
      const metadata = seed.typedMetadata ?? {}
      criteria.push({ id: `accessory-${String(metadata.itemId)}`, label: 'Accessory', expectation: `Reproduce the ${String(metadata.accessoryType)} at ${String(metadata.placement)} on ${String(metadata.side)} with visible appearance fidelity.`, status: 'pending' })
    }
    if (!roles.has('accessory-detail')) criteria.push({ id: 'accessories', label: 'Accessories', expectation: 'Preserve the original accessories.', status: 'pending' })
  } else {
    criteria.push(
      { id: 'identity-face-shape', label: 'Face shape', expectation: "Match the real-person reference's face outline, forehead and temple proportions, cheek width and fullness, jawline, and chin width, length, and roundness. Reject a narrower face, a sharper or longer chin, or character-derived facial anatomy.", status: 'pending' },
      { id: 'identity-facial-features', label: 'Facial geometry', expectation: "Match the real-person reference's eyes, eyelids, brows, nose, mouth, lips, and the exact size, spacing, placement, and ratios between those features. Reject enlarged eyes, a reduced nose, beautification reshaping, or anime-style facial proportions.", status: 'pending' },
      { id: 'identity-skin-appearance', label: 'Skin and makeup', expectation: "Preserve the real-person reference's visible natural skin tone, texture, and existing makeup. Do not inherit makeup, eye color, facial markings, or facial styling from the character reference.", status: 'pending' },
      { id: 'identity-expression-age', label: 'Expression and age', expectation: "Preserve the real-person reference's gaze, head tilt, mouth opening, smile shape, visible teeth, apparent age, and distinctive natural asymmetries; reject a younger, doll-like, idealized, or character-derived face.", status: 'pending' },
      { id: 'rendering-medium', label: 'Consistent visual medium', expectation: "Render the face, skin, body, costume, hair, accessories, props, and reflection consistently in the real-person reference's visual medium and realism level. Reject anime, line-art, cel-shaded, painted, or stylized character-reference rendering in any region.", status: 'pending' },
    )
    criteria.push({ id: 'character-hair', label: 'Character hairstyle', expectation: 'Replace the original hairstyle completely and reproduce the character reference color, length, cut, bangs, side locks, volume, texture, gradients, ornaments, and silhouette while preserving the real person’s face.', status: 'pending' })
    for (const selection of input.compositionSelections ?? []) criteria.push({ id: `composition-${selection.presetId}`, label: 'Composition', expectation: visualCompositionEvaluationExpectation(selection.presetId, { ...(selection.inputs ?? {}) }), status: 'pending' })
  }
  return { schemaVersion: 'voce.playground-evaluation-plan/v1alpha1', criteria, automaticRetry: false }
}

export function compileSemanticClosure(input: PlaygroundScenarioInput, profile: ProviderCapabilityProfile = MOCK_IMAGE_PROFILE): SemanticClosureResult {
  const distribution = scenarioDistribution(input.scenarioId)
  const seed = compileScenarioInput(input)
  const caseId = input.caseId ?? `playground-${input.scenarioId}`
  const caseRevision = input.caseRevision ?? 1
  const assets = input.assets.map((asset) => clone(asset)).sort((left, right) => compareCodeUnits(left.id, right.id))
  const context = buildContext(input, distribution, assets, profile, caseId, caseRevision)
  const evidenceInput: EvidenceAndSourceResolverInput = { schemaVersion: 'voce.evidence-source-resolver-input/v1alpha1', caseId, caseRevision, contextHash: context.contextHash, requestedScopePlan: seed.requestedScopePlan, changeIntents: [...seed.changeIntents], observations: [], observationDecisions: [], sourceBindings: [], bindingDecisions: [], trustedMetadata: [], effectiveScenario: distribution.effectiveScenario }
  const evidence = resolveEvidenceAndSource(evidenceInput)
  if (evidence.status !== 'ok') throw new Error(`PLAYGROUND_EVIDENCE_BLOCKED:${evidence.unresolvedItems.map((item) => item.code).join(',')}`)
  const contract = outputContract(input)
  const constraintInput = { schemaVersion: 'voce.constraint-compilation-input/v1alpha1' as const, caseId, caseRevision, context, contextHash: context.contextHash, requestedScopePlanHash: seed.requestedScopePlan.planHash, ontologyInstance: evidence.ontologyInstance, ontologyStatus: 'ok' as const, status: 'ok' as const, changeIntents: [...seed.changeIntents], sourceBindings: [], bindingDecisions: [], outputContract: contract, effectiveScenario: distribution.effectiveScenario }
  const constraintIR = compileConstraints(constraintInput)
  if (constraintIR.status !== 'ok') throw new Error(`PLAYGROUND_CONSTRAINTS_BLOCKED:${constraintIR.warnings.join(',')}`)
  const binding = bindReferenceCandidates({ seeds: seed.referenceCandidateSeeds, dependencySeeds: seed.referenceDependencySeeds, constraintIR })
  const referencePlan = planReferences({ schemaVersion: 'voce.reference-planning-input/v1alpha1', caseId, caseRevision, contextHash: context.contextHash, constraintIR, candidates: [...binding.candidates], dependencies: [...binding.dependencies], profile })
  if (referencePlan.status !== 'ok') throw new Error(`PLAYGROUND_REFERENCE_PLAN_BLOCKED:${referencePlan.blockedReferences.map((item) => item.reasonCode).join(',')}`)
  const pipelineResult = planPipeline({ schemaVersion: 'voce.pipeline-planning-input/v1alpha1', caseId, caseRevision, contextHash: context.contextHash, outputContract: contract, constraintIR, referencePlan, profile })
  if (pipelineResult.status !== 'ok' || !pipelineResult.pipelinePlan) throw new Error(`PLAYGROUND_PIPELINE_BLOCKED:${pipelineResult.blockedReasons.join(',')}`)
  const pipelinePlan = pipelineResult.pipelinePlan
  const targetAdapter = { id: profile.adapterId, version: profile.version, digest: profile.adapterDigest! }
  const targetProfile = { id: profile.id, version: profile.version, digest: profile.profileHash }
  const promptIR = compilePromptIR({ schemaVersion: 'voce.prompt-compilation-input/v1alpha2', caseId, caseRevision, context, contextHash: context.contextHash, constraintIR, referencePlan, pipelinePlan, outputContract: contract, targetAdapter, targetCapabilityProfile: targetProfile, effectiveScenario: distribution.effectiveScenario, objective: 'Produce the requested result from the declared reference roles.', positiveDescription: 'Apply only accepted ontology constraints and approved reference contributions.' })
  const promptCandidate = optimizePromptIR({ schemaVersion: 'voce.prompt-optimization-input/v1alpha2', promptIR, targetAdapter, targetCapabilityProfile: targetProfile, optimizer: OPTIMIZER, mode: 'strict' })
  const guardResult = guardPromptCandidate({ schemaVersion: 'voce.prompt-guard-input/v1alpha2', promptIR, candidate: promptCandidate, constraintIR, referencePlan, pipelinePlan, outputContract: contract, context, policy: 'reject' })
  if (guardResult.status !== 'accepted' || !guardResult.guardedCandidate) throw new Error(`PLAYGROUND_PROMPT_GUARD_BLOCKED:${guardResult.findings.map((finding) => finding.code).join(',')}`)
  const providerRenderRequest = createProviderRenderRequest({ promptIR, candidate: guardResult.guardedCandidate, guardResult, caseId, caseRevision, contextHash: context.contextHash, pipelinePlanHash: pipelinePlan.planHash })
  const humanPlan: HumanPlan = { scenarioId: input.scenarioId, distributionHash: distribution.distributionHash, summary: readableHumanPlan(input, seed.referenceCandidateSeeds), declaredRoles: [...seed.referenceCandidateSeeds].map((candidate) => ({ role: candidate.role, assetId: candidate.assetId, authorized: [...candidate.authorizedTargetPaths], notAuthorized: [...candidate.prohibitedTargetPaths] })), observedFacts: evidence.ontologyInstance.facts.map((fact) => fact.path), confirmedSourceBindings: [], selectedReferences: referencePlan.ordered.map((reference) => ({ role: reference.role, assetId: reference.assetId, contributionPaths: [...reference.ontologyScopes], prohibitedPaths: [...(reference.prohibitedTargetPaths ?? [])] })), omittedReferences: binding.omittedSeeds }
  return { seed, ontologyInstance: evidence.ontologyInstance, constraintIR, binding, referencePlan, pipelinePlan, promptIR, promptCandidate, guardResult, providerRenderRequest, humanPlan, evaluationPlan: evaluationPlan(input, seed.referenceCandidateSeeds) }
}

export function candidateHashWithIsolation(candidate: ReferenceCandidate): string {
  return computeReferenceCandidateHash(candidate)
}
