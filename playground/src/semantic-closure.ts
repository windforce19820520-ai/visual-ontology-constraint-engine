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
  sha256,
} from '@voce-engine/core'
import type { PlaygroundScenarioId, ScenarioDistribution, ScenarioRolePolicy } from './scenario-distribution.js'
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
  order?: number
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
  declaredRoles: readonly { role: string; assetId: string; authorized: readonly string[]; notAuthorized: readonly string[] }[]
  observedFacts: readonly string[]
  confirmedSourceBindings: readonly string[]
  selectedReferences: readonly { role: string; assetId: string; contributionPaths: readonly string[]; prohibitedPaths: readonly string[] }[]
  omittedReferences: readonly { seedId: string; reasonCode: string }[]
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

function rolePlan(distribution: ScenarioDistribution, declarations: readonly PlaygroundDeclaredRole[]): { normalized: PlaygroundDeclaredRole[]; policies: Map<string, ScenarioRolePolicy>; assetsByRole: Map<string, PlaygroundDeclaredRole[]> } {
  const policies = new Map<string, ScenarioRolePolicy>()
  const assetsByRole = new Map<string, PlaygroundDeclaredRole[]>()
  const normalized = [...declarations].map((declaration) => ({ assetId: declaration.assetId, role: declaration.role, order: declaration.order ?? 0 })).sort((left, right) => compareCodeUnits(`${left.role}|${left.assetId}|${left.order}`, `${right.role}|${right.assetId}|${right.order}`))
  const seenAssets = new Set<string>()
  for (const declaration of normalized) {
    if (seenAssets.has(declaration.assetId)) throw new Error(`PLAYGROUND_ASSET_ROLE_CONFLICT:${declaration.assetId}`)
    seenAssets.add(declaration.assetId)
    const policy = rolePolicyFor(distribution, declaration.role)
    if (!policy) throw new Error(`PLAYGROUND_ROLE_UNKNOWN:${declaration.role}`)
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
  return { normalized, policies, assetsByRole }
}

function scopePlan(input: PlaygroundScenarioInput, normalized: readonly PlaygroundDeclaredRole[], assets: Map<string, PlaygroundAssetDeclaration>, policies: Map<string, ScenarioRolePolicy>, caseId: string, caseRevision: number): RequestedScopePlan {
  const scopes: RequestedScope[] = []
  for (const declaration of normalized) {
    const asset = assets.get(declaration.assetId)!
    const policy = policies.get(declaration.role)!
    for (const targetPath of policy.authorizedTargetPaths) scopes.push({ schemaVersion: 'voce.requested-scope/v1alpha1', id: stableId('scope', { assetId: asset.id, role: declaration.role, targetPath }), ontologyPath: targetPath, assetIds: [asset.id], purpose: 'resolve_change', required: policy.minCount > 0 })
  }
  const base = { schemaVersion: 'voce.requested-scope-plan/v1alpha1' as const, id: stableId('scope-plan', { caseId, caseRevision, scenarioId: input.scenarioId, scopes }), caseId, caseRevision, scopes: scopes.sort((left, right) => compareCodeUnits(left.id, right.id)), excludedScopes: [], questions: [] }
  return { ...base, planHash: computeRequestedScopePlanHash(base) }
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
  const referenceCandidateSeeds: ReferenceCandidateSeed[] = []
  const changeIntents: ChangeIntent[] = []
  for (const declaration of normalized) {
    const policy = policies.get(declaration.role)!
    const asset = assets.get(declaration.assetId)!
    const seedId = stableId('candidate-seed', { scenarioId: input.scenarioId, assetId: asset.id, role: declaration.role, order: declaration.order ?? 0 })
    const authorizedTargetPaths = sortedStrings(policy.authorizedTargetPaths)
    const prohibitedTargetPaths = sortedStrings(policy.prohibitedTargetPaths)
    const supportingIntentIds: string[] = []
    for (const target of policy.targets) {
      const intentId = stableId('declared-intent', { seedId, targetPath: target.targetPath, operation: target.operation, importance: target.importance })
      supportingIntentIds.push(intentId)
      changeIntents.push({ schemaVersion: 'voce.change-intent/v1alpha1', id: intentId, operation: target.operation, targetPath: target.targetPath, sourceHintIds: sortedStrings([asset.id, policy.id, seedId]), importance: target.importance, provenance: { source: 'user_explicit', sourceIds: sortedStrings([asset.id, policy.id, seedId]), createdBy: 'voce-playground-scenario-input', createdAt: FIXED_TIME } })
    }
    const seedBase = { schemaVersion: 'voce.playground-reference-candidate-seed/v1alpha1' as const, id: seedId, assetId: asset.id, artifact: asset, role: declaration.role, orderKey: `${declaration.role}|${String(declaration.order ?? 0).padStart(4, '0')}|${asset.id}`, importance: inferredImportance(policy), ontologyScopes: authorizedTargetPaths, authorizedTargetPaths, prohibitedTargetPaths, supportingIntentIds: sortedStrings(supportingIntentIds) }
    referenceCandidateSeeds.push({ ...seedBase, seedHash: sha256(JSON.parse(JSON.stringify(seedBase)) as JsonValue) })
  }
  const compositionIntents = (input.compositionSelections ?? []).flatMap((selection) => expandVisualCompositionPreset(selection.presetId, { inputs: selection.inputs as Record<string, JsonValue> | undefined, sourceHintIds: [`playground-composition:${input.scenarioId}:${selection.presetId}`] }).map((intent) => ({ ...intent, importance: selection.importance ?? intent.importance })))
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
    const base = { schemaVersion: 'voce.reference-candidate/v1alpha1' as const, id: seed.id, assetId: seed.assetId, artifact: clone(seed.artifact), contentHash: seed.artifact.contentHash, mediaType: seed.artifact.mediaType, byteLength: seed.artifact.byteLength, role: seed.role, ontologyScopes: sortedStrings(seed.ontologyScopes), prohibitedTargetPaths: sortedStrings(seed.prohibitedTargetPaths), importance: seed.importance, constraintIds, sourceBindingIds: [], goalIds, orderKey: seed.orderKey }
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
  const humanPlan: HumanPlan = { scenarioId: input.scenarioId, distributionHash: distribution.distributionHash, declaredRoles: [...seed.referenceCandidateSeeds].map((candidate) => ({ role: candidate.role, assetId: candidate.assetId, authorized: [...candidate.authorizedTargetPaths], notAuthorized: [...candidate.prohibitedTargetPaths] })), observedFacts: evidence.ontologyInstance.facts.map((fact) => fact.path), confirmedSourceBindings: [], selectedReferences: referencePlan.ordered.map((reference) => ({ role: reference.role, assetId: reference.assetId, contributionPaths: [...reference.ontologyScopes], prohibitedPaths: [...(reference.prohibitedTargetPaths ?? [])] })), omittedReferences: binding.omittedSeeds }
  return { seed, ontologyInstance: evidence.ontologyInstance, constraintIR, binding, referencePlan, pipelinePlan, promptIR, promptCandidate, guardResult, providerRenderRequest, humanPlan }
}

export function candidateHashWithIsolation(candidate: ReferenceCandidate): string {
  return computeReferenceCandidateHash(candidate)
}
