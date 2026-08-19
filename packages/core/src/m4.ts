import type {
  ArtifactHandle,
  BindingDecision,
  Budget,
  CancellationPolicy,
  ChangeIntent,
  Cleanup,
  CompilationContext,
  Compensation,
  Constraint,
  ConstraintCompilationInput,
  ConstraintConflict,
  ConstraintDependency,
  ConstraintIR,
  ConstraintState,
  ConstraintWaiver,
  DeclarativeConditionOperator,
  DeclarativeRule,
  DeclarativeRuleCondition,
  DeclarativeRuleOperand,
  DataTransfer,
  Degradation,
  DispatchPreflightResult,
  DispatchSnapshot,
  ExecutionAuthorization,
  ExplainEntry,
  ExplainResult,
  Goal,
  Importance,
  JsonObject,
  JsonValue,
  OutputContract,
  OntologyPathDefinition,
  PipelinePlan,
  PipelinePlanningInput,
  PipelinePlanningResult,
  PipelineStep,
  PlannedReference,
  ProviderCapabilityProfile,
  ReferenceBudget,
  ReferenceCandidate,
  ReferenceDependency,
  ReferenceOmission,
  ReferencePlan,
  ReferencePlanningInput,
  RegisteredStepCapability,
  RemoteCallAuthorization,
  ResourceClaim,
  ReviewRequirement,
  RuleTrace,
  SemanticDiff,
  SemanticDiffChange,
  SourceBinding,
  StepDependency,
} from '@voce-engine/contracts'
import {
  BINDING_DECISION_SCHEMA_VERSION,
  BUDGET_SCHEMA_VERSION,
  CLEANUP_SCHEMA_VERSION,
  COMPENSATION_SCHEMA_VERSION,
  CONSTRAINT_CONFLICT_SCHEMA_VERSION,
  CONSTRAINT_DEPENDENCY_SCHEMA_VERSION,
  CONSTRAINT_IR_SCHEMA_VERSION,
  CONSTRAINT_SCHEMA_VERSION,
  DATA_TRANSFER_SCHEMA_VERSION,
  DEGRADATION_SCHEMA_VERSION,
  EXECUTION_AUTHORIZATION_SCHEMA_VERSION,
  EXPLAIN_RESULT_SCHEMA_VERSION,
  GOAL_SCHEMA_VERSION,
  PIPELINE_PLAN_SCHEMA_VERSION,
  PIPELINE_PLANNING_RESULT_SCHEMA_VERSION,
  PIPELINE_STEP_SCHEMA_VERSION,
  PLANNED_REFERENCE_SCHEMA_VERSION,
  PROVIDER_CAPABILITY_PROFILE_SCHEMA_VERSION,
  REFERENCE_CANDIDATE_SCHEMA_VERSION,
  REFERENCE_DEPENDENCY_SCHEMA_VERSION,
  REFERENCE_OMISSION_SCHEMA_VERSION,
  REFERENCE_PLAN_SCHEMA_VERSION,
  REMOTE_CALL_AUTHORIZATION_SCHEMA_VERSION,
  REVIEW_REQUIREMENT_SCHEMA_VERSION,
  RESOURCE_CLAIM_SCHEMA_VERSION,
  RULE_TRACE_SCHEMA_VERSION,
  SEMANTIC_DIFF_SCHEMA_VERSION,
  STEP_DEPENDENCY_SCHEMA_VERSION,
} from '@voce-engine/contracts'
import {
  computeBindingDecisionHash,
  computeSourceBindingContentHash,
} from './evidence.js'
import { canonicalize, sha256 } from './canonical.js'

export const CONSTRAINT_COMPILER_VERSION = 'voce.constraint-compiler/v1alpha1'
export const REFERENCE_OPTIMIZER_VERSION = 'voce.reference-budget-optimizer/v1alpha1'
export const PIPELINE_PLANNER_VERSION = 'voce.pipeline-planner/v1alpha1'
export const REMOTE_AUTHORIZATION_VERSION = 'voce.authorization-preflight/v1alpha1'
export const FIXED_M4_TIME = '2026-01-01T00:00:00.000Z'

const HASH_PATTERN = /^sha256:[0-9a-f]{64}$/
const IMPORTANCE_RANK: Record<Importance, number> = { preferred: 1, required: 2, hard: 3 }

function compareCodeUnits(left: string, right: string): number {
  const length = Math.min(left.length, right.length)
  for (let index = 0; index < length; index += 1) {
    const difference = left.charCodeAt(index) - right.charCodeAt(index)
    if (difference !== 0) return difference
  }
  return left.length - right.length
}

function jsonReady(value: unknown): JsonValue {
  if (value === null || typeof value === 'boolean' || typeof value === 'string') return value
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) throw new Error('JSON_VALUE_INVALID')
    return value
  }
  if (Array.isArray(value)) return value.map((item) => jsonReady(item === undefined ? null : item))
  if (value && typeof value === 'object') {
    const object: JsonObject = {}
    for (const [key, item] of Object.entries(value as Record<string, unknown>)) {
      if (item !== undefined) object[key] = jsonReady(item)
    }
    return object
  }
  throw new Error('JSON_VALUE_INVALID')
}

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(jsonReady(value))) as T
}

function objectOf(value: unknown): JsonObject {
  const ready = jsonReady(value)
  return ready !== null && typeof ready === 'object' && !Array.isArray(ready) ? ready as JsonObject : {}
}

function sortedStrings(values: string[] | undefined): string[] {
  return [...new Set(values ?? [])].sort(compareCodeUnits)
}

function sortedImportanceMap(value: Record<string, Importance> | undefined): Record<string, Importance> | undefined {
  if (value === undefined) return undefined
  return Object.fromEntries(Object.entries(value).sort(([left], [right]) => compareCodeUnits(left, right)))
}

function mergeImportanceMaps(left: Record<string, Importance> | undefined, right: Record<string, Importance> | undefined): Record<string, Importance> | undefined {
  if (left === undefined && right === undefined) return undefined
  const merged: Record<string, Importance> = {}
  for (const [path, importance] of [...Object.entries(left ?? {}), ...Object.entries(right ?? {})].sort(([leftPath], [rightPath]) => compareCodeUnits(leftPath, rightPath))) {
    merged[path] = stableImportance(merged[path], importance)
  }
  return merged
}

function sortedBy<T>(values: T[], key: (value: T) => string): T[] {
  return values.map((value) => clone(value)).sort((left, right) => compareCodeUnits(key(left), key(right)) || compareCodeUnits(canonicalize(jsonReady(left)), canonicalize(jsonReady(right))))
}

function cleanWithout(value: unknown, field: string): JsonObject {
  const object = objectOf(value)
  delete object[field]
  return object
}

function hashId(prefix: string, value: unknown): string {
  return `${prefix}-${sha256(jsonReady(value)).slice('sha256:'.length, 'sha256:'.length + 24)}`
}

function stableImportance(left: Importance | undefined, right: Importance | undefined): Importance {
  return IMPORTANCE_RANK[left ?? 'preferred'] >= IMPORTANCE_RANK[right ?? 'preferred'] ? (left ?? 'preferred') : (right ?? 'preferred')
}

function importanceFromValues(values: Array<Importance | undefined>, fallback: Importance = 'required'): Importance {
  return values.reduce<Importance>((current, value) => stableImportance(current, value), fallback)
}

function uniqueSortedObjects<T>(values: T[], key: (value: T) => string): T[] {
  const result: T[] = []
  const seen = new Set<string>()
  for (const value of sortedBy(values, key)) {
    const identity = key(value)
    if (seen.has(identity)) continue
    seen.add(identity)
    result.push(value)
  }
  return result
}

function isHash(value: unknown): value is string {
  return typeof value === 'string' && HASH_PATTERN.test(value)
}

function semanticHash(value: unknown, field: string): string {
  return sha256(cleanWithout(value, field))
}

function normalizeImportance(value: unknown): Importance {
  return value === 'hard' || value === 'required' || value === 'preferred' ? value : 'required'
}

function pathMatches(candidate: string, expected: string): boolean {
  return candidate === expected || candidate.startsWith(`${expected}.`) || expected.startsWith(`${candidate}.`)
}

function pathPresent(paths: string[], candidates: string[]): boolean {
  return paths.some((path) => candidates.some((candidate) => pathMatches(path, candidate)))
}

function valueStrings(value: unknown): string[] {
  const values: string[] = []
  const visit = (current: unknown): void => {
    if (typeof current === 'string') values.push(current.toLowerCase().replaceAll(' ', '_'))
    else if (Array.isArray(current)) current.forEach(visit)
    else if (current && typeof current === 'object') Object.values(current as Record<string, unknown>).forEach(visit)
  }
  visit(value)
  return values
}

function valueHasToken(value: unknown, tokens: string[]): boolean {
  const normalized = valueStrings(value)
  return tokens.some((token) => normalized.includes(token.toLowerCase().replaceAll(' ', '_')))
}

function normalizeArray<T>(values: T[] | undefined, key: (value: T) => string): T[] {
  return sortedBy(values ?? [], key)
}

function sourceBindingProjection(binding: SourceBinding): JsonObject {
  return {
    schemaVersion: binding.schemaVersion,
    id: binding.id,
    targetPath: binding.targetPath,
    observationIds: sortedStrings(binding.observationIds),
    relation: binding.relation,
    priority: binding.priority,
  }
}

function bindingDecisionProjection(decision: BindingDecision): JsonObject {
  const result: JsonObject = {
    schemaVersion: decision.schemaVersion,
    decisionId: decision.decisionId,
    bindingId: decision.bindingId,
    bindingHash: decision.bindingHash,
    contextHash: decision.contextHash,
    status: decision.status,
    authority: decision.authority,
    decidedBy: decision.decidedBy,
    reasonCode: decision.reasonCode,
  }
  if (decision.policyVersion !== undefined) result.policyVersion = decision.policyVersion
  if (decision.decidedAt !== undefined) result.decidedAt = decision.decidedAt
  return result
}

function normalizedOntologyProjection(instance: ConstraintCompilationInput['ontologyInstance']): JsonObject {
  return {
    schemaVersion: instance.schemaVersion,
    id: instance.id,
    caseId: instance.caseId,
    caseRevision: instance.caseRevision,
    contextHash: instance.contextHash,
    requestedScopePlanHash: instance.requestedScopePlanHash,
    facts: sortedBy(instance.facts, (item) => `${item.path}|${item.id}`),
    unknownPaths: sortedStrings(instance.unknownPaths),
    unspecifiedPaths: sortedStrings(instance.unspecifiedPaths),
    unresolvedItems: sortedBy(instance.unresolvedItems, (item) => item.id),
    conflicts: sortedBy(instance.conflicts, (item) => item.id),
    decisionTrace: sortedBy(instance.decisionTrace, (item) => item.id),
  } as unknown as JsonObject
}

export function computeOntologyInstanceHash(instance: ConstraintCompilationInput['ontologyInstance']): string {
  return sha256(normalizedOntologyProjection(instance))
}

export function computeCompilationContextHash(context: CompilationContext): string {
  const projection = cleanWithout(context, 'contextHash')
  if (Array.isArray(projection.artifactHashes)) projection.artifactHashes = sortedStrings(projection.artifactHashes as string[]) as unknown as JsonValue
  if (Array.isArray(projection.decisionHashes)) projection.decisionHashes = sortedStrings(projection.decisionHashes as string[]) as unknown as JsonValue
  if (Array.isArray(projection.rulePackPlugins)) projection.rulePackPlugins = sortedBy(projection.rulePackPlugins as unknown[], (item) => canonicalize(jsonReady(item))) as unknown as JsonValue[]
  if (Array.isArray(projection.adapters)) projection.adapters = sortedBy(projection.adapters as unknown[], (item) => canonicalize(jsonReady(item))) as unknown as JsonValue[]
  if (Array.isArray(projection.capabilityProfiles)) projection.capabilityProfiles = sortedBy(projection.capabilityProfiles as unknown[], (item) => canonicalize(jsonReady(item))) as unknown as JsonValue[]
  if (Array.isArray(projection.budgets)) projection.budgets = sortedBy(projection.budgets as unknown[], (item) => String((item as Record<string, unknown>).id)) as unknown as JsonValue[]
  if (Array.isArray(projection.dataTransfers)) projection.dataTransfers = sortedBy(projection.dataTransfers as unknown[], (item) => String((item as Record<string, unknown>).id)) as unknown as JsonValue[]
  return sha256(projection)
}

export function computeOutputContractHash(contract: OutputContract): string {
  const projection = cleanWithout(contract, 'outputContractHash')
  if (Array.isArray(projection.mediaTypes)) projection.mediaTypes = sortedStrings(projection.mediaTypes as string[]) as unknown as JsonValue
  return sha256(projection)
}

export function computeConstraintHash(constraint: Constraint): string {
  const projection = cleanWithout(constraint, 'constraintHash')
  if (Array.isArray(projection.targetPaths)) projection.targetPaths = sortedStrings(projection.targetPaths as string[]) as unknown as JsonValue
  if (Array.isArray(projection.goalIds)) projection.goalIds = sortedStrings(projection.goalIds as string[]) as unknown as JsonValue
  if (Array.isArray(projection.dependsOn)) projection.dependsOn = sortedStrings(projection.dependsOn as string[]) as unknown as JsonValue
  if (Array.isArray(projection.resourceClaimIds)) projection.resourceClaimIds = sortedStrings(projection.resourceClaimIds as string[]) as unknown as JsonValue
  if (Array.isArray(projection.sourceIds)) projection.sourceIds = sortedStrings(projection.sourceIds as string[]) as unknown as JsonValue
  return sha256(projection)
}

export function computeGoalHash(goal: Goal): string { return semanticHash({ ...goal, sourceIds: sortedStrings(goal.sourceIds), constraintIds: sortedStrings(goal.constraintIds) }, 'goalHash') }
export function computeConstraintDependencyHash(dependency: ConstraintDependency): string { return semanticHash(dependency, 'dependencyHash') }
export function computeResourceClaimHash(claim: ResourceClaim): string { return semanticHash({ ...claim, claimantIds: sortedStrings(claim.claimantIds), constraintIds: sortedStrings(claim.constraintIds) }, 'resourceHash') }
export function computeConstraintConflictHash(conflict: ConstraintConflict): string { return semanticHash({ ...conflict, constraintIds: sortedStrings(conflict.constraintIds), dependencyIds: sortedStrings(conflict.dependencyIds), resourceClaimIds: sortedStrings(conflict.resourceClaimIds) }, 'conflictHash') }
export function computeDegradationHash(degradation: Degradation): string { return semanticHash({ ...degradation, affectedIds: sortedStrings(degradation.affectedIds) }, 'degradationHash') }
export function computeRuleTraceHash(trace: RuleTrace): string { return semanticHash({ ...trace, inputIds: sortedStrings(trace.inputIds), outputIds: sortedStrings(trace.outputIds) }, 'traceHash') }
export function computeReviewRequirementHash(requirement: ReviewRequirement): string { return semanticHash({ ...requirement, constraintIds: sortedStrings(requirement.constraintIds), sourceIds: sortedStrings(requirement.sourceIds) }, 'reviewHash') }

function constraintIRProjection(ir: ConstraintIR): JsonObject {
  return {
    schemaVersion: ir.schemaVersion,
    id: ir.id,
    caseId: ir.caseId,
    caseRevision: ir.caseRevision,
    contextHash: ir.contextHash,
    requestedScopePlanHash: ir.requestedScopePlanHash,
    instanceHash: ir.instanceHash,
    decisionHashes: sortedStrings(ir.decisionHashes),
    goals: sortedBy(ir.goals, (item) => item.id),
    constraints: sortedBy(ir.constraints, (item) => item.id),
    dependencies: sortedBy(ir.dependencies, (item) => item.id),
    resourceClaims: sortedBy(ir.resourceClaims, (item) => item.id),
    conflicts: sortedBy(ir.conflicts, (item) => item.id),
    degradedPreferences: sortedBy(ir.degradedPreferences, (item) => item.id),
    reviewRequirements: sortedBy(ir.reviewRequirements, (item) => item.id),
    explanations: sortedBy(ir.explanations, (item) => item.id),
    ruleTraces: sortedBy(ir.ruleTraces, (item) => item.id),
    warnings: sortedStrings(ir.warnings),
    status: ir.status,
  } as unknown as JsonObject
}

export function computeConstraintIRSignature(ir: ConstraintIR): string { return sha256(constraintIRProjection(ir)) }

function referenceCandidateProjection(candidate: ReferenceCandidate): JsonObject {
  const artifact = candidate.artifact ?? candidate.artifactHandle
  return jsonReady({
    schemaVersion: candidate.schemaVersion,
    id: candidate.id,
    assetId: candidate.assetId,
    contentHash: candidate.contentHash,
    ...(artifact ? { artifact: { id: artifact.id, contentHash: artifact.contentHash, mediaType: artifact.mediaType, byteLength: artifact.byteLength, role: artifact.role, availability: artifact.availability } } : {}),
    mediaType: candidate.mediaType,
    byteLength: candidate.byteLength,
    role: candidate.role,
    ontologyScopes: sortedStrings(candidate.ontologyScopes),
    ...(candidate.prohibitedTargetPaths === undefined ? {} : { prohibitedTargetPaths: sortedStrings(candidate.prohibitedTargetPaths) }),
    ...(candidate.prohibitedTargetPathImportance === undefined ? {} : { prohibitedTargetPathImportance: sortedImportanceMap(candidate.prohibitedTargetPathImportance) }),
    importance: candidate.importance,
    constraintIds: sortedStrings(candidate.constraintIds),
    sourceBindingIds: sortedStrings(candidate.sourceBindingIds),
    goalIds: sortedStrings(candidate.goalIds),
    orderKey: candidate.orderKey,
  }) as JsonObject
}

export function computeReferenceCandidateHash(candidate: ReferenceCandidate): string { return semanticHash(referenceCandidateProjection(candidate), 'candidateHash') }
export function computeReferenceDependencyHash(dependency: ReferenceDependency): string { return semanticHash(dependency, 'dependencyHash') }
export function computeReferenceOmissionHash(omission: ReferenceOmission): string { return semanticHash({ ...omission, constraintIds: sortedStrings(omission.constraintIds), dependencyIds: sortedStrings(omission.dependencyIds) }, 'omissionHash') }

export function createReferenceCandidate(input: Omit<ReferenceCandidate, 'candidateHash'>): ReferenceCandidate {
  const base = clone({ ...input, candidateHash: '' }) as ReferenceCandidate
  return clone({ ...base, candidateHash: computeReferenceCandidateHash(base) })
}

export function createReferenceDependency(input: Omit<ReferenceDependency, 'dependencyHash'>): ReferenceDependency {
  const base = clone({ ...input, dependencyHash: '' }) as ReferenceDependency
  return clone({ ...base, dependencyHash: computeReferenceDependencyHash(base) })
}

type ProviderCapabilityProfileForHash = Omit<ProviderCapabilityProfile, 'profileHash'>

function profileProjection(profile: ProviderCapabilityProfileForHash): JsonObject {
  const reference = profile.referenceLimits ?? {}
  const output = profile.outputCapabilities ?? {}
  return jsonReady({
    schemaVersion: profile.schemaVersion,
    id: profile.id,
    version: profile.version,
    versionSummary: profile.versionSummary,
    adapterId: profile.adapterId,
    adapterDigest: profile.adapterDigest,
    verificationStatus: profile.verificationStatus,
    referenceLimits: {
      maximumReferenceCount: profile.maximumReferenceCount ?? reference.maximumReferenceCount,
      maximumTotalBytes: profile.maximumTotalReferenceBytes ?? reference.maximumTotalBytes,
      maximumBytesPerReference: profile.maximumBytesPerReference ?? reference.maximumBytesPerReference,
      allowedMediaTypes: sortedStrings(profile.allowedReferenceMediaTypes ?? reference.allowedMediaTypes),
      allowedRoles: sortedStrings(profile.allowedReferenceRoles ?? reference.allowedRoles),
      ordering: profile.referenceOrdering ?? reference.ordering,
      roleOrder: profile.referenceRoleOrder ?? reference.roleOrder,
      supportsMultipleReferences: profile.supportsMultipleReferences ?? reference.supportsMultipleReferences,
      requiresPublishedReferences: profile.requiresPublishedReferences ?? reference.requiresPublishedReferences,
    },
    outputCapabilities: {
      mediaTypes: sortedStrings(profile.outputMediaTypes ?? output.mediaTypes),
      formats: sortedStrings(output.formats),
      supportsTransparentOutput: profile.supportsTransparentOutput ?? output.supportsTransparentOutput,
      supportsAlpha: profile.supportsAlpha ?? output.supportsAlpha,
      maximumWidth: output.maximumWidth,
      maximumHeight: output.maximumHeight,
      minimumWidth: output.minimumWidth,
      minimumHeight: output.minimumHeight,
    },
    supportsEditing: profile.supportsEditing,
    supportsBatchOutput: profile.supportsBatchOutput,
    knownIncompatibilities: sortedStrings(profile.knownIncompatibilities),
    timeoutMs: profile.timeoutMs,
    streaming: profile.streaming,
    destination: profile.destination,
    dataCategories: sortedStrings(profile.dataCategories),
  }) as JsonObject
}

export function computeProviderCapabilityProfileHash(profile: ProviderCapabilityProfileForHash): string { return sha256(profileProjection(profile)) }
export function computeBudgetHash(budget: Budget): string { return semanticHash(budget, 'budgetHash') }
export function computeDataTransferHash(transfer: DataTransfer): string { return semanticHash({ ...transfer, dataCategories: sortedStrings(transfer.dataCategories) }, 'transferHash') }
export function computeCleanupHash(cleanup: Cleanup): string { return semanticHash({ ...cleanup, appliesToStepIds: sortedStrings(cleanup.appliesToStepIds), conditions: sortedStrings(cleanup.conditions), artifactRoles: sortedStrings(cleanup.artifactRoles), dataCategories: sortedStrings(cleanup.dataCategories) }, 'cleanupHash') }
export function computeCompensationHash(compensation: Compensation): string { return semanticHash({ ...compensation, appliesToStepIds: sortedStrings(compensation.appliesToStepIds) }, 'compensationHash') }
export function computePipelineStepHash(step: PipelineStep): string { return semanticHash({ ...step, inputArtifactRoles: sortedStrings(step.inputArtifactRoles), outputArtifactRoles: sortedStrings(step.outputArtifactRoles), dependsOn: sortedStrings(step.dependsOn), cleanupObligationIds: sortedStrings(step.cleanupObligationIds), compensationIds: sortedStrings(step.compensationIds) }, 'stepHash') }
export function computePipelinePlanHash(plan: PipelinePlan): string {
  const projection = cleanWithout(plan, 'planHash')
  if (Array.isArray(projection.adapterDigests)) projection.adapterDigests = sortedStrings(projection.adapterDigests as string[]) as unknown as JsonValue
  if (Array.isArray(projection.steps)) projection.steps = sortedBy(projection.steps as unknown[], (item) => String((item as Record<string, unknown>).id)) as unknown as JsonValue[]
  if (Array.isArray(projection.dependencies)) projection.dependencies = sortedBy(projection.dependencies as unknown[], (item) => String((item as Record<string, unknown>).id)) as unknown as JsonValue[]
  if (Array.isArray(projection.budgets)) projection.budgets = sortedBy(projection.budgets as unknown[], (item) => String((item as Record<string, unknown>).id)) as unknown as JsonValue[]
  if (Array.isArray(projection.dataTransfers)) projection.dataTransfers = sortedBy(projection.dataTransfers as unknown[], (item) => String((item as Record<string, unknown>).id)) as unknown as JsonValue[]
  if (Array.isArray(projection.cleanup)) projection.cleanup = sortedBy(projection.cleanup as unknown[], (item) => String((item as Record<string, unknown>).id)) as unknown as JsonValue[]
  if (Array.isArray(projection.compensation)) projection.compensation = sortedBy(projection.compensation as unknown[], (item) => String((item as Record<string, unknown>).id)) as unknown as JsonValue[]
  return sha256(projection)
}

function authorizationProjection(value: RemoteCallAuthorization | ExecutionAuthorization): JsonObject {
  const projection = cleanWithout(value, 'authorizationHash')
  delete projection.authorizedAt
  if (Array.isArray(projection.permittedArtifactHashes)) projection.permittedArtifactHashes = sortedStrings(projection.permittedArtifactHashes as string[]) as unknown as JsonValue
  if (Array.isArray(projection.permittedScopeIds)) projection.permittedScopeIds = sortedStrings(projection.permittedScopeIds as string[]) as unknown as JsonValue
  if (Array.isArray(projection.constraintIds)) projection.constraintIds = sortedStrings(projection.constraintIds as string[]) as unknown as JsonValue
  if (Array.isArray(projection.adapterProfileDigests)) projection.adapterProfileDigests = sortedStrings(projection.adapterProfileDigests as string[]) as unknown as JsonValue
  if (Array.isArray(projection.destinations)) projection.destinations = sortedStrings(projection.destinations as string[]) as unknown as JsonValue
  if (Array.isArray(projection.remoteCallAuthorizationIds)) projection.remoteCallAuthorizationIds = sortedStrings(projection.remoteCallAuthorizationIds as string[]) as unknown as JsonValue
  return projection
}

export function computeRemoteCallAuthorizationHash(authorization: RemoteCallAuthorization): string { return sha256(authorizationProjection(authorization)) }
export function computeExecutionAuthorizationHash(authorization: ExecutionAuthorization): string { return sha256(authorizationProjection(authorization)) }
export function computeConstraintWaiverHash(waiver: ConstraintWaiver): string {
  const projection = cleanWithout(waiver, 'waiverHash')
  delete projection.decidedAt
  return sha256(projection)
}

function normalizeConstraint(constraint: Constraint): Constraint {
  return clone({ ...constraint, targetPaths: sortedStrings(constraint.targetPaths), goalIds: sortedStrings(constraint.goalIds), dependsOn: sortedStrings(constraint.dependsOn), resourceClaimIds: sortedStrings(constraint.resourceClaimIds), sourceIds: sortedStrings(constraint.sourceIds) })
}

export function createConstraint(input: Omit<Constraint, 'constraintHash'>): Constraint {
  const base = normalizeConstraint({ ...input, constraintHash: '' })
  return clone({ ...base, constraintHash: computeConstraintHash(base) })
}

export function createGoal(input: Omit<Goal, 'goalHash'>): Goal {
  const base = clone({ ...input, sourceIds: sortedStrings(input.sourceIds), constraintIds: sortedStrings(input.constraintIds), goalHash: '' }) as Goal
  return clone({ ...base, goalHash: computeGoalHash(base) })
}

export function createConstraintDependency(input: Omit<ConstraintDependency, 'dependencyHash'>): ConstraintDependency {
  const base = clone({ ...input, dependencyHash: '' }) as ConstraintDependency
  return clone({ ...base, dependencyHash: computeConstraintDependencyHash(base) })
}

export function createResourceClaim(input: Omit<ResourceClaim, 'resourceHash'>): ResourceClaim {
  const base = clone({ ...input, claimantIds: sortedStrings(input.claimantIds), constraintIds: sortedStrings(input.constraintIds), resourceHash: '' }) as ResourceClaim
  return clone({ ...base, resourceHash: computeResourceClaimHash(base) })
}

export function createConstraintConflict(input: Omit<ConstraintConflict, 'conflictHash'>): ConstraintConflict {
  const base = clone({ ...input, constraintIds: sortedStrings(input.constraintIds), dependencyIds: sortedStrings(input.dependencyIds), resourceClaimIds: sortedStrings(input.resourceClaimIds), conflictHash: '' }) as ConstraintConflict
  return clone({ ...base, conflictHash: computeConstraintConflictHash(base) })
}

export function createDegradation(input: Omit<Degradation, 'degradationHash'>): Degradation {
  const base = clone({ ...input, affectedIds: sortedStrings(input.affectedIds), degradationHash: '' }) as Degradation
  return clone({ ...base, degradationHash: computeDegradationHash(base) })
}

export function createRuleTrace(input: Omit<RuleTrace, 'traceHash'>): RuleTrace {
  const base = clone({ ...input, inputIds: sortedStrings(input.inputIds), outputIds: sortedStrings(input.outputIds), traceHash: '' }) as RuleTrace
  return clone({ ...base, traceHash: computeRuleTraceHash(base) })
}

export function createReviewRequirement(input: Omit<ReviewRequirement, 'reviewHash'>): ReviewRequirement {
  const base = clone({ ...input, constraintIds: sortedStrings(input.constraintIds), sourceIds: sortedStrings(input.sourceIds), reviewHash: '' }) as ReviewRequirement
  return clone({ ...base, reviewHash: computeReviewRequirementHash(base) })
}

export function createBudget(input: Omit<Budget, 'budgetHash'>): Budget {
  const base = clone({ ...input, budgetHash: '' }) as Budget
  return clone({ ...base, budgetHash: computeBudgetHash(base) })
}

export function createDataTransfer(input: Omit<DataTransfer, 'transferHash'>): DataTransfer {
  const base = clone({ ...input, dataCategories: sortedStrings(input.dataCategories), transferHash: '' }) as DataTransfer
  return clone({ ...base, transferHash: computeDataTransferHash(base) })
}

export function createRemoteCallAuthorization(input: Omit<RemoteCallAuthorization, 'authorizationHash'>): RemoteCallAuthorization {
  const base = clone({ ...input, permittedArtifactHashes: sortedStrings(input.permittedArtifactHashes), permittedScopeIds: sortedStrings(input.permittedScopeIds), constraintIds: sortedStrings(input.constraintIds), dataCategories: sortedStrings(input.dataCategories), authorizationHash: '' }) as RemoteCallAuthorization
  return clone({ ...base, authorizationHash: computeRemoteCallAuthorizationHash(base) })
}

export function createExecutionAuthorization(input: Omit<ExecutionAuthorization, 'authorizationHash'>): ExecutionAuthorization {
  const base = clone({ ...input, adapterProfileDigests: sortedStrings(input.adapterProfileDigests), destinations: sortedStrings(input.destinations), remoteCallAuthorizationIds: sortedStrings(input.remoteCallAuthorizationIds), authorizationHash: '' }) as ExecutionAuthorization
  return clone({ ...base, authorizationHash: computeExecutionAuthorizationHash(base) })
}

export function createConstraintWaiver(input: Omit<ConstraintWaiver, 'waiverHash'>): ConstraintWaiver {
  const base = clone({ ...input, waiverHash: '' }) as ConstraintWaiver
  return clone({ ...base, waiverHash: computeConstraintWaiverHash(base) })
}

interface SemanticItem { id: string; path: string; value: JsonValue; hasValue: boolean; importance: Importance; sourceIds: string[] }
interface InternalOperand extends DeclarativeRuleOperand { match: 'all'|'any' }
interface InternalRule {
  id: string
  contributionId?: string
  code: string
  kind: DeclarativeRule['kind']
  operands: InternalOperand[]
  resolution: DeclarativeRule['resolution']
  importance: Importance
  reasonCode: string
  message: string
  resourceId?: string
  dependencyKind?: ConstraintDependency['kind']
}

/**
 * These are plain declarative records. They are deliberately not keyed to a
 * scenario name; a ScenarioPack may copy, extend, or replace them through its
 * `rulePacks` contribution.
 */
export const M4_RULE_FIXTURES = {
  maskIdentity: {
    id: 'rule.mask-identity-visibility',
    ruleType: 'occlusion',
    leftPaths: ['person.identity', 'person.face'],
    rightPaths: ['accessories.mask', 'mask', 'person.faceMask'],
    rightTokens: ['full_face', 'full-face', 'fullface', 'opaque_face'],
    importance: 'preferred',
    code: 'MASK_IDENTITY_VISIBILITY_CONFLICT',
    reasonCode: 'MASK_OCCLUDES_REQUIRED_IDENTITY',
    message: 'A full-face mask occludes a required identity-visibility constraint.',
  },
  sleeveBracelet: {
    id: 'rule.sleeve-bracelet-occlusion',
    ruleType: 'occlusion',
    leftPaths: ['accessories.bracelet', 'jewelry.bracelet', 'wrist.accessory'],
    rightPaths: ['wardrobe.sleeve', 'wardrobe.sleeves', 'garment.sleeve'],
    rightTokens: ['wrist_cover', 'full_length', 'long', 'long_sleeve', 'covers_wrist'],
    importance: 'required',
    code: 'SLEEVE_BRACELET_OCCLUSION',
    reasonCode: 'SLEEVE_COVERS_REQUIRED_BRACELET',
    message: 'A sleeve coverage requirement occludes a required bracelet detail.',
  },
  handProp: {
    id: 'rule.hand-prop-resource',
    ruleType: 'resource',
    leftPaths: ['accessories.bracelet', 'jewelry', 'accessories.hand'],
    rightPaths: ['prop', 'props', 'pose.hand', 'hand'],
    rightTokens: ['held', 'left', 'right', 'two_hands', 'both_hands'],
    importance: 'required',
    code: 'HAND_PROP_RESOURCE_CONFLICT',
    reasonCode: 'HAND_RESOURCE_OVERLAP',
    message: 'A hand-worn or hand-held requirement claims the same exclusive hand resource as a prop.',
    resourceId: 'hand',
  },
} as const

export const M4_DECLARATIVE_RULE_FIXTURES = Object.values(M4_RULE_FIXTURES)

function internalRule(value: unknown, contributionId?: string): InternalRule | undefined {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined
  const object = value as Record<string, unknown>
  const id = typeof object.id === 'string' ? object.id : typeof object.ruleId === 'string' ? object.ruleId : undefined
  if (!id) return undefined
  const kind = object.kind
  if (kind !== 'incompatibility' && kind !== 'dependency' && kind !== 'cardinality' && kind !== 'occlusion' && kind !== 'resource') return undefined
  if (!Array.isArray(object.operands) || object.operands.length < 2) return undefined
  const conditionOperator = (value: unknown): value is DeclarativeConditionOperator => value === 'present' || value === 'absent' || value === 'equals' || value === 'contains'
  const conditions = (value: unknown): DeclarativeRuleCondition[] | undefined => {
    if (!Array.isArray(value) || value.length === 0) return undefined
    const result: DeclarativeRuleCondition[] = []
    for (const candidate of value) {
      if (!candidate || typeof candidate !== 'object' || Array.isArray(candidate)) return undefined
      const condition = candidate as Record<string, unknown>
      if (typeof condition.path !== 'string' || !condition.path || !conditionOperator(condition.operator)) return undefined
      if ((condition.operator === 'present' || condition.operator === 'absent') && condition.value !== undefined) return undefined
      if ((condition.operator === 'equals' || condition.operator === 'contains') && condition.value === undefined) return undefined
      result.push({ path: condition.path, operator: condition.operator, ...(condition.value === undefined ? {} : { value: jsonReady(condition.value) }) })
    }
    return result
  }
  const operands: InternalOperand[] = []
  const operandIds = new Set<string>()
  for (const candidate of object.operands) {
    if (!candidate || typeof candidate !== 'object' || Array.isArray(candidate)) return undefined
    const operand = candidate as Record<string, unknown>
    if (typeof operand.id !== 'string' || !operand.id || operandIds.has(operand.id)) return undefined
    const operandConditions = conditions(operand.conditions)
    if (!operandConditions) return undefined
    operandIds.add(operand.id)
    operands.push({ id: operand.id, conditions: operandConditions, match: 'all' })
  }
  const resolutionValue = object.resolution
  if (!resolutionValue || typeof resolutionValue !== 'object' || Array.isArray(resolutionValue)) return undefined
  const resolutionObject = resolutionValue as Record<string, unknown>
  if (resolutionObject.strategy !== 'block' && resolutionObject.strategy !== 'degrade_operand') return undefined
  if (typeof resolutionObject.reasonCode !== 'string' || !resolutionObject.reasonCode) return undefined
  const operandId = resolutionObject.operandId
  if (resolutionObject.strategy === 'degrade_operand' && (typeof operandId !== 'string' || !operandIds.has(operandId))) return undefined
  const resolution: DeclarativeRule['resolution'] = { strategy: resolutionObject.strategy, reasonCode: resolutionObject.reasonCode, ...(operandId === undefined ? {} : { operandId: operandId as string }) }
  const severity = normalizeImportance(object.importance)
  const code = typeof object.code === 'string' ? object.code : `RULE_${id.toUpperCase().replaceAll(/[^A-Z0-9]+/g, '_')}`
  const reasonCode = resolution.reasonCode
  const message = typeof object.explanation === 'string' ? object.explanation : typeof object.message === 'string' ? object.message : `Declarative rule ${id} found incompatible constraints.`
  const dependencyKind = object.dependencyKind === 'parent_detail' || object.dependencyKind === 'identity_garment' || object.dependencyKind === 'source_isolation' || object.dependencyKind === 'visibility' || object.dependencyKind === 'occludes' || object.dependencyKind === 'ordered_before' || object.dependencyKind === 'supports' || object.dependencyKind === 'excludes' || object.dependencyKind === 'requires' ? object.dependencyKind : undefined
  return {
    id,
    contributionId,
    code,
    kind,
    operands,
    resolution,
    importance: severity,
    reasonCode,
    message,
    ...(typeof object.resourceId === 'string' ? { resourceId: object.resourceId } : {}),
    ...(dependencyKind ? { dependencyKind } : {}),
  }
}

function allRules(effectiveScenario: ConstraintCompilationInput['effectiveScenario'], collisionIds: string[] = []): InternalRule[] {
  const values: Array<{ value: unknown; contributionId?: string }> = []
  for (const contribution of effectiveScenario?.rulePacks ?? []) {
    const object = contribution as unknown as Record<string, unknown>
    const rules = Array.isArray(object.rules) ? object.rules : []
    for (const rule of rules) values.push({ value: rule, contributionId: typeof object.contributionId === 'string' ? object.contributionId : undefined })
  }
  const byId = new Map<string, InternalRule>()
  const add = (rule: InternalRule): void => {
    const prior = byId.get(rule.id)
    const semantic = (value: InternalRule): string => canonicalize(jsonReady(cleanWithout(value as unknown as Record<string, unknown>, 'contributionId')))
    if (prior && semantic(rule) !== semantic(prior)) collisionIds.push(rule.id)
    if (!prior || canonicalize(jsonReady(rule)) < canonicalize(jsonReady(prior))) byId.set(rule.id, rule)
  }
  for (const value of M4_DECLARATIVE_RULE_FIXTURES) {
    const left: string[] = Array.from(value.leftPaths as readonly string[])
    const right: string[] = Array.from(value.rightPaths as readonly string[])
    if (left.length === 0 || right.length === 0) continue
    const toConditions = (paths: string[], tokens: readonly string[] = []): DeclarativeRuleCondition[] => [
      ...paths.map((path) => ({ path, operator: 'present' as const })),
      ...tokens.map((token) => ({ path: paths[0], operator: 'contains' as const, value: token })),
    ]
    const leftOperand: InternalOperand = { id: 'left', conditions: left.map((path) => ({ path, operator: 'present' as const })), match: 'any' }
    const rightOperand: InternalOperand = { id: 'right', conditions: toConditions(right, value.rightTokens), match: 'any' }
    add({ id: value.id, code: value.code, kind: value.ruleType === 'resource' ? 'resource' : 'occlusion', operands: [leftOperand, rightOperand], resolution: { strategy: 'block', reasonCode: value.reasonCode }, importance: value.importance, reasonCode: value.reasonCode, message: value.message, resourceId: 'resourceId' in value ? value.resourceId : undefined })
  }
  for (const entry of values) {
    const rule = internalRule(entry.value, entry.contributionId)
    if (!rule) continue
    add(rule)
  }
  return sortedBy([...byId.values()], (item) => item.id)
}

function itemImportance(path: string, intents: ChangeIntent[], bindingPriority?: Importance): Importance {
  const matching = intents.filter((intent) => pathMatches(path, intent.targetPath) || pathMatches(intent.targetPath, path)).map((intent) => intent.importance)
  return importanceFromValues([...matching, bindingPriority], 'required')
}

function semanticItems(input: ConstraintCompilationInput): SemanticItem[] {
  const intentItems = input.changeIntents.map((intent) => ({
    id: intent.id,
    path: intent.targetPath,
    value: intent.requestedValue ?? null,
    hasValue: intent.requestedValue !== undefined,
    importance: intent.importance,
    sourceIds: sortedStrings([intent.id, ...(intent.sourceHintIds ?? [])]),
  }))
  const factItems = input.ontologyInstance.facts.map((fact) => ({
    id: fact.id,
    path: fact.path,
    value: fact.value,
    hasValue: true,
    importance: itemImportance(fact.path, input.changeIntents),
    sourceIds: sortedStrings([...fact.acceptedByIds, ...fact.acceptedByDecisionIds, ...fact.sourceBindingIds]),
  }))
  return sortedBy([...intentItems, ...factItems], (item) => `${item.path}|${item.id}`)
}

interface RuleMatch { operands: Map<string, SemanticItem[]>; missingOperandIds: string[] }

interface ConditionMatch { matched: boolean; items: SemanticItem[] }

function conditionMatches(condition: DeclarativeRuleCondition, items: SemanticItem[]): ConditionMatch {
  const candidates = items.filter((item) => pathMatches(item.path, condition.path))
  if (condition.operator === 'absent') return { matched: candidates.length === 0, items: [] }
  if (condition.operator === 'present') return { matched: candidates.length > 0, items: candidates }
  if (condition.operator === 'equals') {
    const matched = candidates.filter((item) => canonicalize(item.value) === canonicalize(condition.value as JsonValue))
    return { matched: matched.length > 0, items: matched }
  }
  const value = condition.value
  const matched = typeof value === 'string'
    ? candidates.filter((item) => valueHasToken(item.value, [value]))
    : candidates.filter((item) => Array.isArray(item.value) && item.value.some((entry) => canonicalize(entry) === canonicalize(value as JsonValue)))
  return { matched: matched.length > 0, items: matched }
}

function compositionVocabulary(effectiveScenario: ConstraintCompilationInput['effectiveScenario'], collisionPaths: string[] = []): Map<string, OntologyPathDefinition> {
  const definitions = new Map<string, OntologyPathDefinition>()
  for (const contribution of effectiveScenario?.ontologyVocabulary ?? []) {
    for (const raw of ((contribution as unknown as { paths?: OntologyPathDefinition[] }).paths ?? [])) {
      if (!raw || typeof raw.path !== 'string' || !raw.path) continue
      const prior = definitions.get(raw.path)
      if (prior && canonicalize(jsonReady(raw)) !== canonicalize(jsonReady(prior))) collisionPaths.push(raw.path)
      else if (!prior) definitions.set(raw.path, clone(raw))
    }
  }
  return definitions
}

function ontologyScalarMatches(definition: OntologyPathDefinition, value: JsonValue): boolean {
  if (definition.valueKind === 'boolean') return typeof value === 'boolean'
  if (definition.valueKind === 'string') return typeof value === 'string'
  if (definition.valueKind === 'number') return typeof value === 'number' && Number.isFinite(value)
  return Array.isArray(definition.allowedValues) && definition.allowedValues.some((allowed) => canonicalize(allowed) === canonicalize(value))
}

function ontologyValueMatches(definition: OntologyPathDefinition, value: JsonValue): boolean {
  if (definition.cardinality === 'many' && Array.isArray(value)) return value.every((entry) => ontologyScalarMatches(definition, entry))
  return ontologyScalarMatches(definition, value)
}

function applyCardinalityResolution(constraints: Constraint[], goals: Goal[], vocabulary: Map<string, OntologyPathDefinition>): {
  constraints: Constraint[]
  remap: Map<string, string>
  conflicts: ConstraintConflict[]
  degradations: Degradation[]
  traces: RuleTrace[]
} {
  const remap = new Map<string, string>()
  const conflicts: ConstraintConflict[] = []
  const degradations: Degradation[] = []
  const traces: RuleTrace[] = []
  const mergedConstraints: Constraint[] = []
  const cardinalityConstraintIds = new Set<string>()
  const byPath = new Map<string, Constraint[]>()
  for (const constraint of constraints) {
    if (!constraint.targetPath || constraint.value === undefined || constraint.status === 'unsatisfied' || !vocabulary.has(constraint.targetPath)) continue
    if (vocabulary.get(constraint.targetPath)!.cardinality !== 'one') continue
    byPath.set(constraint.targetPath, [...(byPath.get(constraint.targetPath) ?? []), constraint])
  }
  const degraded = new Set<string>()
  const markUnsatisfied = (constraint: Constraint, ruleId: string, reasonCode: string): void => {
    constraint.status = 'unsatisfied'
    constraint.ruleId = ruleId
    constraint.reasonCode = reasonCode
    constraint.constraintHash = computeConstraintHash(constraint)
  }
  for (const [path, pathConstraints] of [...byPath.entries()].sort((left, right) => compareCodeUnits(left[0], right[0]))) {
    for (const item of pathConstraints) cardinalityConstraintIds.add(item.id)
    const valueGroups = new Map<string, Constraint[]>()
    for (const constraint of sortedBy(pathConstraints, (item) => item.id)) {
      const key = canonicalize(jsonReady(constraint.value))
      valueGroups.set(key, [...(valueGroups.get(key) ?? []), constraint])
    }
    const merged: Constraint[] = []
    for (const group of [...valueGroups.values()].sort((left, right) => compareCodeUnits(canonicalize(jsonReady(left[0].value)), canonicalize(jsonReady(right[0].value))))) {
      const representative = sortedBy(group, (item) => item.id)[0]
      const mergedConstraint = createConstraint({
        ...representative,
        id: hashId('constraint-value', { path, value: representative.value }),
        status: group.some((item) => item.status === 'active') ? 'active' : 'satisfied',
        importance: importanceFromValues(group.map((item) => item.importance), representative.importance),
        sourceIds: sortedStrings(group.flatMap((item) => item.sourceIds)),
        goalIds: sortedStrings(group.flatMap((item) => item.goalIds)),
      })
      merged.push(mergedConstraint)
      mergedConstraints.push(mergedConstraint)
      for (const item of group) remap.set(item.id, mergedConstraint.id)
    }
    for (const goal of goals) goal.constraintIds = sortedStrings(goal.constraintIds.map((id) => remap.get(id) ?? id))
    const strongGroups = merged.filter((item) => item.importance === 'hard' || item.importance === 'required')
    const ruleId = `rule.cardinality.${path}`
    if (merged.length > 1) {
      const blocking = strongGroups.length !== 1
      const conflict = createConstraintConflict({
        schemaVersion: CONSTRAINT_CONFLICT_SCHEMA_VERSION,
        id: hashId('constraint-conflict', { code: 'CARDINALITY_CONFLICT', path, constraintIds: merged.map((item) => item.id) }),
        code: 'CARDINALITY_CONFLICT',
        severity: importanceFromValues(merged.map((item) => item.importance), 'preferred'),
        targetPath: path,
        constraintIds: merged.map((item) => item.id),
        dependencyIds: [], resourceClaimIds: [],
        message: `Cardinality one path ${path} received incompatible values.`,
        blocking,
        waiverAllowed: !blocking,
      })
      conflicts.push(conflict)
      if (!blocking && strongGroups.length === 1) {
        for (const loser of merged.filter((item) => item.importance === 'preferred')) {
          markUnsatisfied(loser, ruleId, 'CARDINALITY_PREFERENCE_DEGRADED')
          if (degraded.has(loser.id)) continue
          degraded.add(loser.id)
          const degradation = createDegradation({
            schemaVersion: DEGRADATION_SCHEMA_VERSION,
            id: hashId('degradation', { conflictId: conflict.id, constraintId: loser.id }),
            preferenceId: loser.id,
            constraintId: loser.id,
            reasonCode: 'CARDINALITY_PREFERENCE_DEGRADED',
            impact: conflict.message,
            affectedIds: [loser.id, strongGroups[0].id],
            explanation: `Preferred value for ${path} was excluded in favor of the stronger constraint.`,
          })
          degradations.push(degradation)
          traces.push(createRuleTrace({ schemaVersion: RULE_TRACE_SCHEMA_VERSION, id: hashId('rule-trace', { ruleId, constraintId: loser.id }), ruleId, inputIds: [loser.id, strongGroups[0].id], outputIds: [degradation.id], outcome: 'degraded', reasonCode: degradation.reasonCode, message: degradation.explanation }))
        }
      } else {
        traces.push(createRuleTrace({ schemaVersion: RULE_TRACE_SCHEMA_VERSION, id: hashId('rule-trace', { ruleId, constraintIds: merged.map((item) => item.id) }), ruleId, inputIds: merged.map((item) => item.id), outputIds: [conflict.id], outcome: 'blocked', reasonCode: 'CARDINALITY_CONFLICT', message: conflict.message }))
      }
    }
  }
  for (const goal of goals) goal.constraintIds = sortedStrings(goal.constraintIds.map((id) => remap.get(id) ?? id))
  return { constraints: sortedBy([...constraints.filter((item) => !cardinalityConstraintIds.has(item.id)), ...mergedConstraints], (item) => item.id), remap, conflicts, degradations, traces }
}

function operandMatches(operand: InternalOperand, items: SemanticItem[]): SemanticItem[] | undefined {
  const matches = operand.conditions.map((condition) => conditionMatches(condition, items))
  if (operand.match === 'any') {
    const matched = matches.filter((value) => value.matched)
    return matched.length > 0 ? uniqueSortedObjects(matched.flatMap((value) => value.items), (item) => item.id) : undefined
  }
  if (matches.some((value) => !value.matched)) return undefined
  return uniqueSortedObjects(matches.flatMap((value) => value.items), (item) => item.id)
}

function ruleMatches(rule: InternalRule, items: SemanticItem[]): RuleMatch | undefined {
  const operands = new Map<string, SemanticItem[]>()
  const missingOperandIds: string[] = []
  for (const operand of rule.operands) {
    const match = operandMatches(operand, items)
    if (match === undefined) missingOperandIds.push(operand.id)
    else operands.set(operand.id, match)
  }
  if (missingOperandIds.length === 0) return { operands, missingOperandIds }
  if (rule.kind !== 'dependency') return undefined
  const trigger = rule.operands[0]
  const triggerMatch = operands.get(trigger.id)
  if (triggerMatch === undefined || triggerMatch.length === 0) return undefined
  return { operands, missingOperandIds }
}

function goalForIntent(intent: ChangeIntent): Goal {
  const base: Omit<Goal, 'goalHash'> = {
    schemaVersion: GOAL_SCHEMA_VERSION,
    id: hashId('goal', { id: intent.id, operation: intent.operation, targetPath: intent.targetPath, requestedValue: intent.requestedValue, importance: intent.importance }),
    operation: intent.operation,
    importance: intent.importance,
    targetPath: intent.targetPath,
    ...(intent.requestedValue === undefined ? {} : { requestedValue: clone(intent.requestedValue) }),
    sourceIds: sortedStrings([intent.id, ...(intent.sourceHintIds ?? [])]),
    constraintIds: [],
    explanation: `Target ${intent.operation} goal for ${intent.targetPath}.`,
  }
  return createGoal(base)
}

function constraintForIntent(intent: ChangeIntent, goal: Goal): Constraint {
  const kind: Constraint['kind'] = intent.operation === 'preserve' ? 'preservation' : intent.operation === 'remove' ? 'visibility' : intent.operation === 'create' ? 'output' : 'transformation'
  const base: Omit<Constraint, 'constraintHash'> = {
    schemaVersion: CONSTRAINT_SCHEMA_VERSION,
    id: hashId('constraint', { goalId: goal.id, kind, targetPath: intent.targetPath, value: intent.requestedValue, importance: intent.importance }),
    kind,
    importance: intent.importance,
    status: 'active',
    targetPath: intent.targetPath,
    targetPaths: [intent.targetPath],
    predicate: intent.operation === 'remove' ? 'absent' : intent.operation,
    ...(intent.requestedValue === undefined ? {} : { value: clone(intent.requestedValue) }),
    goalIds: [goal.id],
    dependsOn: [],
    resourceClaimIds: [],
    sourceIds: sortedStrings([intent.id, ...(intent.sourceHintIds ?? [])]),
    reasonCode: `TARGET_${intent.operation.toUpperCase()}`,
    explanation: `Constraint derived from ${intent.operation} intent at ${intent.targetPath}.`,
  }
  return createConstraint(base)
}

function factConstraint(item: SemanticItem): Constraint {
  return createConstraint({
    schemaVersion: CONSTRAINT_SCHEMA_VERSION,
    id: hashId('fact-constraint', { id: item.id, path: item.path, value: item.value }),
    kind: 'preservation',
    importance: item.importance,
    status: 'satisfied',
    targetPath: item.path,
    targetPaths: [item.path],
    predicate: 'fact_present',
    value: clone(item.value),
    goalIds: [],
    dependsOn: [],
    resourceClaimIds: [],
    sourceIds: item.sourceIds,
    reasonCode: 'ONTOLOGY_FACT_ACCEPTED',
    explanation: `Accepted sparse ontology fact at ${item.path}.`,
  })
}

function outputConstraints(contract: OutputContract): Constraint[] {
  const constraints: Constraint[] = []
  const outputValue = { artifactKind: contract.artifactKind, dataType: contract.dataType, mediaTypes: sortedStrings(contract.mediaTypes), cardinality: contract.cardinality, dimensions: contract.dimensions, background: contract.background, maxBytes: contract.maxBytes, allowAlpha: contract.allowAlpha, downstreamUse: contract.downstreamUse }
  constraints.push(createConstraint({
    schemaVersion: CONSTRAINT_SCHEMA_VERSION,
    id: hashId('output-constraint', outputValue),
    kind: 'output',
    importance: 'hard',
    status: 'active',
    targetPath: 'output',
    targetPaths: ['output'],
    predicate: 'output_contract',
    value: outputValue as unknown as JsonValue,
    goalIds: [],
    dependsOn: [],
    resourceClaimIds: [],
    sourceIds: [],
    reasonCode: 'OUTPUT_CONTRACT_REQUIRED',
    explanation: 'OutputContract requirements are immutable compilation constraints.',
  }))
  return constraints
}

function makeRuleTrace(rule: InternalRule, inputIds: string[], outputIds: string[], outcome: RuleTrace['outcome'], reasonCode = rule.reasonCode, message = rule.message): RuleTrace {
  return createRuleTrace({ schemaVersion: RULE_TRACE_SCHEMA_VERSION, id: hashId('rule-trace', { ruleId: rule.id, inputIds, outputIds, outcome, reasonCode }), ruleId: rule.id, ...(rule.contributionId ? { contributionId: rule.contributionId } : {}), inputIds, outputIds, outcome, reasonCode, message })
}

function conflictForRule(rule: InternalRule, constraints: Constraint[], blocking = true): ConstraintConflict {
  const constraintIds = sortedStrings(constraints.map((item) => item.id))
  const severity = importanceFromValues(constraints.map((item) => item.importance), rule.importance)
  return createConstraintConflict({
    schemaVersion: CONSTRAINT_CONFLICT_SCHEMA_VERSION,
    id: hashId('constraint-conflict', { code: rule.code, ruleId: rule.id, constraintIds }),
    code: rule.code,
    severity,
    targetPath: constraints.map((item) => item.targetPath).find((item): item is string => typeof item === 'string'),
    constraintIds,
    dependencyIds: [],
    resourceClaimIds: rule.resourceId ? [hashId('resource', { resourceId: rule.resourceId, constraintIds })] : [],
    message: rule.message,
    blocking,
    waiverAllowed: severity === 'required',
  })
}

function validWaiver(waiver: ConstraintWaiver, input: ConstraintCompilationInput): boolean {
  if (waiver.schemaVersion !== 'voce.constraint-waiver/v1alpha1' || waiver.caseId !== input.caseId || waiver.caseRevision !== input.caseRevision || waiver.contextHash !== input.contextHash || !isHash(waiver.waiverHash)) return false
  return computeConstraintWaiverHash(waiver) === waiver.waiverHash
}

function waiverTargets(waivers: ConstraintWaiver[], input: ConstraintCompilationInput): Set<string> {
  const result = new Set<string>()
  for (const waiver of waivers) if (validWaiver(waiver, input)) result.add(waiver.targetId)
  return result
}

function dependencyCycles(dependencies: ConstraintDependency[], ids: Set<string>): string[][] {
  const edges = new Map<string, string[]>()
  for (const dependency of dependencies) {
    if (!ids.has(dependency.parentId) || !ids.has(dependency.childId)) continue
    edges.set(dependency.parentId, [...(edges.get(dependency.parentId) ?? []), dependency.childId])
  }
  for (const [key, values] of edges) edges.set(key, sortedStrings(values))
  const visited = new Set<string>()
  const active = new Set<string>()
  const cycles: string[][] = []
  const walk = (id: string, stack: string[]): void => {
    if (active.has(id)) {
      const index = stack.indexOf(id)
      cycles.push(stack.slice(index))
      return
    }
    if (visited.has(id)) return
    active.add(id)
    for (const child of edges.get(id) ?? []) walk(child, [...stack, child])
    active.delete(id)
    visited.add(id)
  }
  for (const id of [...ids].sort(compareCodeUnits)) walk(id, [id])
  return cycles
}

function blockedConstraintIR(input: Partial<ConstraintCompilationInput>, reasons: string[], conflicts: ConstraintConflict[] = []): ConstraintIR {
  const caseId = typeof input.caseId === 'string' ? input.caseId : 'unknown-case'
  const caseRevision = typeof input.caseRevision === 'number' ? input.caseRevision : 0
  const contextHash = typeof input.contextHash === 'string' ? input.contextHash : 'sha256:' + '0'.repeat(64)
  const instance = input.ontologyInstance
  const requestedScopePlanHash = typeof input.requestedScopePlanHash === 'string' ? input.requestedScopePlanHash : instance?.requestedScopePlanHash ?? 'sha256:' + '0'.repeat(64)
  const instanceHash = instance?.instanceHash ?? 'sha256:' + '0'.repeat(64)
  const base: ConstraintIR = {
    schemaVersion: CONSTRAINT_IR_SCHEMA_VERSION,
    id: hashId('constraint-ir', { caseId, caseRevision, contextHash, requestedScopePlanHash, instanceHash, reasons: sortedStrings(reasons) }),
    caseId,
    caseRevision,
    contextHash,
    requestedScopePlanHash,
    instanceHash,
    decisionHashes: [],
    goals: [],
    constraints: [],
    dependencies: [],
    resourceClaims: [],
    conflicts: sortedBy(conflicts, (item) => item.id),
    degradedPreferences: [],
    reviewRequirements: [],
    explanations: [],
    ruleTraces: [],
    warnings: sortedStrings(reasons),
    status: 'blocked',
    deterministicSignature: '',
  }
  base.deterministicSignature = computeConstraintIRSignature(base)
  return clone(base)
}

function validateBindingInputs(input: ConstraintCompilationInput): string[] {
  const reasons: string[] = []
  const bindingsById = new Map<string, SourceBinding>()
  for (const binding of sortedBy(input.sourceBindings ?? [], (item) => item.id)) {
    const prior = bindingsById.get(binding.id)
    const hashValid = binding.schemaVersion === 'voce.source-binding/v1alpha1' && isHash(binding.contentHash) && computeSourceBindingContentHash(binding) === binding.contentHash
    if (!hashValid) { reasons.push('SOURCE_BINDING_HASH_MISMATCH'); continue }
    if (prior && canonicalize(jsonReady(sourceBindingProjection(prior))) !== canonicalize(jsonReady(sourceBindingProjection(binding)))) reasons.push('SOURCE_BINDING_ID_COLLISION')
    else bindingsById.set(binding.id, clone(binding))
  }
  const decisionsById = new Map<string, BindingDecision>()
  for (const decision of sortedBy(input.bindingDecisions ?? [], (item) => item.decisionId)) {
    const prior = decisionsById.get(decision.decisionId)
    const hashValid = decision.schemaVersion === BINDING_DECISION_SCHEMA_VERSION && isHash(decision.decisionHash) && computeBindingDecisionHash(decision) === decision.decisionHash
    if (!hashValid) { reasons.push('BINDING_DECISION_HASH_MISMATCH'); continue }
    if (prior && canonicalize(jsonReady(bindingDecisionProjection(prior))) !== canonicalize(jsonReady(bindingDecisionProjection(decision)))) reasons.push('BINDING_DECISION_ID_COLLISION')
    else decisionsById.set(decision.decisionId, clone(decision))
  }
  for (const decision of decisionsById.values()) {
    const binding = bindingsById.get(decision.bindingId)
    if (!binding) reasons.push('BINDING_NOT_FOUND')
    else if (decision.bindingHash !== binding.contentHash) reasons.push('BINDING_HASH_MISMATCH')
    if (decision.contextHash !== input.contextHash) reasons.push('BINDING_CONTEXT_MISMATCH')
    if (decision.status !== 'confirmed') reasons.push('BINDING_NOT_CONFIRMED')
    if (input.context.decisionHashes.length > 0 && !input.context.decisionHashes.includes(decision.decisionHash)) reasons.push('DECISION_HASH_NOT_PINNED')
  }
  return sortedStrings(reasons)
}

function constraintIRIntegrityReasons(ir: ConstraintIR): string[] {
  const reasons: string[] = []
  if (ir.schemaVersion !== CONSTRAINT_IR_SCHEMA_VERSION) reasons.push('CONSTRAINT_IR_SCHEMA_INVALID')
  if (!isHash(ir.deterministicSignature) || computeConstraintIRSignature(ir) !== ir.deterministicSignature) reasons.push('CONSTRAINT_IR_SIGNATURE_MISMATCH')
  for (const item of ir.goals) if (!isHash(item.goalHash) || computeGoalHash(item) !== item.goalHash) reasons.push('GOAL_HASH_MISMATCH')
  for (const item of ir.constraints) if (!isHash(item.constraintHash) || computeConstraintHash(item) !== item.constraintHash) reasons.push('CONSTRAINT_HASH_MISMATCH')
  for (const item of ir.dependencies) if (!isHash(item.dependencyHash) || computeConstraintDependencyHash(item) !== item.dependencyHash) reasons.push('CONSTRAINT_DEPENDENCY_HASH_MISMATCH')
  for (const item of ir.resourceClaims) if (!isHash(item.resourceHash) || computeResourceClaimHash(item) !== item.resourceHash) reasons.push('RESOURCE_CLAIM_HASH_MISMATCH')
  for (const item of ir.conflicts) if (!isHash(item.conflictHash) || computeConstraintConflictHash(item) !== item.conflictHash) reasons.push('CONSTRAINT_CONFLICT_HASH_MISMATCH')
  for (const item of ir.degradedPreferences) if (!isHash(item.degradationHash) || computeDegradationHash(item) !== item.degradationHash) reasons.push('DEGRADATION_HASH_MISMATCH')
  for (const item of ir.reviewRequirements) if (!isHash(item.reviewHash) || computeReviewRequirementHash(item) !== item.reviewHash) reasons.push('REVIEW_REQUIREMENT_HASH_MISMATCH')
  for (const item of ir.ruleTraces) if (!isHash(item.traceHash) || computeRuleTraceHash(item) !== item.traceHash) reasons.push('RULE_TRACE_HASH_MISMATCH')
  return sortedStrings(reasons)
}

export class ConstraintGraphCompiler {
  compile(input: ConstraintCompilationInput): ConstraintIR {
    try {
      return this.compileSafe(clone(input))
    } catch (error) {
      const code = error instanceof Error && error.message === 'JSON_VALUE_INVALID' ? 'INPUT_INVALID' : 'INPUT_INVALID'
      return blockedConstraintIR(input ?? {}, [code])
    }
  }

  private compileSafe(input: ConstraintCompilationInput): ConstraintIR {
    const basicReasons: string[] = []
    if (!input || typeof input !== 'object' || input.schemaVersion !== 'voce.constraint-compilation-input/v1alpha1') basicReasons.push('CONSTRAINT_INPUT_SCHEMA_INVALID')
    if (typeof input.caseId !== 'string' || typeof input.caseRevision !== 'number') basicReasons.push('CASE_REVISION_INVALID')
    if (!input.context || typeof input.context !== 'object') basicReasons.push('COMPILATION_CONTEXT_INVALID')
    if (input.context && (input.context.caseSpecId !== input.caseId || input.context.caseSpecRevision !== input.caseRevision)) basicReasons.push('CONTEXT_CASE_MISMATCH')
    if (!isHash(input.contextHash) || input.context.contextHash !== input.contextHash || computeCompilationContextHash(input.context) !== input.contextHash) basicReasons.push('CONTEXT_HASH_MISMATCH')
    if (!input.ontologyInstance || typeof input.ontologyInstance !== 'object') basicReasons.push('ONTOLOGY_INSTANCE_INVALID')
    if (input.ontologyInstance && (!isHash(input.ontologyInstance.instanceHash) || computeOntologyInstanceHash(input.ontologyInstance) !== input.ontologyInstance.instanceHash)) basicReasons.push('INSTANCE_HASH_MISMATCH')
    if (input.ontologyInstance && input.ontologyInstance.contextHash !== input.contextHash) basicReasons.push('ONTOLOGY_CONTEXT_MISMATCH')
    if (input.ontologyInstance && input.ontologyInstance.requestedScopePlanHash !== input.requestedScopePlanHash) basicReasons.push('REQUESTED_SCOPE_PLAN_HASH_MISMATCH')
    const status = input.status ?? input.ontologyStatus ?? (input.ontologyInstance as ConstraintCompilationInput['ontologyInstance'] & { status?: 'ok'|'blocked' }).status ?? 'ok'
    if (status !== 'ok') basicReasons.push('M3_STATUS_BLOCKED')
    if (input.ontologyInstance?.conflicts.some((conflict) => conflict.blocking)) basicReasons.push('M3_BLOCKING_CONFLICT')
    if (input.effectiveScenario) {
      const scenarioProjection = cleanWithout(input.effectiveScenario, 'effectiveScenarioHash')
      if (!isHash(input.effectiveScenario.effectiveScenarioHash) || sha256(scenarioProjection) !== input.effectiveScenario.effectiveScenarioHash) basicReasons.push('EFFECTIVE_SCENARIO_HASH_MISMATCH')
    }
    const bindingReasons = validateBindingInputs(input)
    basicReasons.push(...bindingReasons)
    if (basicReasons.length) return blockedConstraintIR(input, basicReasons)

    const ruleCollisionIds: string[] = []
    allRules(input.effectiveScenario, ruleCollisionIds)
    if (ruleCollisionIds.length) return blockedConstraintIR(input, ['DECLARATIVE_RULE_ID_COLLISION'])
    const vocabularyCollisionPaths: string[] = []
    const vocabulary = compositionVocabulary(input.effectiveScenario, vocabularyCollisionPaths)
    if (vocabularyCollisionPaths.length) return blockedConstraintIR(input, ['ONTOLOGY_PATH_DEFINITION_COLLISION'])
    const invalidOntologyValues = semanticItems(input).filter((item) => {
      const definition = vocabulary.get(item.path)
      return item.hasValue && definition !== undefined && !ontologyValueMatches(definition, item.value)
    })
    if (invalidOntologyValues.length) return blockedConstraintIR(input, ['ONTOLOGY_VALUE_INVALID'])

    const goals: Goal[] = []
    const constraints: Constraint[] = []
    const dependencies: ConstraintDependency[] = []
    const resourceClaims: ResourceClaim[] = []
    const conflicts: ConstraintConflict[] = []
    const degradations: Degradation[] = []
    const reviewRequirements: ConstraintIR['reviewRequirements'] = []
    const traces: RuleTrace[] = []
    const warnings: string[] = []
    const items = semanticItems(input)
    for (const item of sortedBy(input.ontologyInstance.unresolvedItems, (value) => value.id)) {
      reviewRequirements.push(createReviewRequirement({
        schemaVersion: REVIEW_REQUIREMENT_SCHEMA_VERSION,
        id: hashId('review-requirement', { kind: 'unresolved', id: item.id }),
        reasonCode: `ONTOLOGY_${item.code}`,
        ...(item.targetPath ? { targetPath: item.targetPath } : {}),
        constraintIds: [],
        sourceIds: item.relatedIds,
        blocking: false,
        explanation: item.message,
      }))
    }
    for (const path of sortedStrings([...input.ontologyInstance.unknownPaths, ...input.ontologyInstance.unspecifiedPaths])) {
      const isUnknown = input.ontologyInstance.unknownPaths.includes(path)
      reviewRequirements.push(createReviewRequirement({
        schemaVersion: REVIEW_REQUIREMENT_SCHEMA_VERSION,
        id: hashId('review-requirement', { kind: isUnknown ? 'unknown' : 'unspecified', path }),
        reasonCode: isUnknown ? 'ONTOLOGY_PATH_UNKNOWN' : 'ONTOLOGY_PATH_UNSPECIFIED',
        targetPath: path,
        constraintIds: [],
        sourceIds: [],
        blocking: false,
        explanation: isUnknown ? `Ontology path ${path} is unknown and needs review.` : `Ontology path ${path} is unspecified and needs review.`,
      }))
    }
    const constraintByPath = new Map<string, Constraint[]>()
    for (const intent of sortedBy(input.changeIntents ?? [], (item) => item.id)) {
      const goal = goalForIntent(intent)
      const constraint = constraintForIntent(intent, goal)
      goal.constraintIds = [constraint.id]
      goal.goalHash = computeGoalHash(goal)
      goals.push(goal)
      constraints.push(constraint)
      const group = constraintByPath.get(intent.targetPath) ?? []
      group.push(constraint)
      constraintByPath.set(intent.targetPath, group)
      traces.push(createRuleTrace({ schemaVersion: RULE_TRACE_SCHEMA_VERSION, id: hashId('rule-trace', { kind: 'intent', id: intent.id }), ruleId: 'rule.intent-to-constraint', inputIds: [intent.id], outputIds: [goal.id, constraint.id], outcome: 'applied', reasonCode: constraint.reasonCode, message: constraint.explanation }))
    }
    for (const item of items.filter((candidate) => input.ontologyInstance.facts.some((fact) => fact.id === candidate.id))) {
      const constraint = factConstraint(item)
      constraints.push(constraint)
      const group = constraintByPath.get(item.path) ?? []
      group.push(constraint)
      constraintByPath.set(item.path, group)
      traces.push(createRuleTrace({ schemaVersion: RULE_TRACE_SCHEMA_VERSION, id: hashId('rule-trace', { kind: 'fact', id: item.id }), ruleId: 'rule.accepted-fact-to-constraint', inputIds: item.sourceIds, outputIds: [constraint.id], outcome: 'applied', reasonCode: 'ONTOLOGY_FACT_TO_CONSTRAINT', message: constraint.explanation }))
    }
    const output = outputConstraints(input.outputContract)
    constraints.push(...output)
    traces.push(createRuleTrace({ schemaVersion: RULE_TRACE_SCHEMA_VERSION, id: hashId('rule-trace', { kind: 'output', id: output[0].id }), ruleId: 'rule.output-contract', inputIds: [], outputIds: output.map((item) => item.id), outcome: 'applied', reasonCode: 'OUTPUT_CONTRACT_REQUIRED', message: 'OutputContract was compiled into provider-neutral output constraints.' }))

    const cardinality = applyCardinalityResolution(constraints, goals, vocabulary)
    constraints.splice(0, constraints.length, ...cardinality.constraints)
    conflicts.push(...cardinality.conflicts)
    degradations.push(...cardinality.degradations)
    traces.push(...cardinality.traces)
    for (const goal of goals) goal.goalHash = computeGoalHash(goal)
    constraintByPath.clear()
    for (const constraint of constraints) if (constraint.targetPath) constraintByPath.set(constraint.targetPath, [...(constraintByPath.get(constraint.targetPath) ?? []), constraint])

    const ruleItems = items
    const degradedConstraintIds = new Set(degradations.map((item) => item.constraintId).filter((item): item is string => typeof item === 'string'))
    const markUnsatisfied = (constraint: Constraint, rule: InternalRule, reasonCode: string): void => {
      constraint.status = 'unsatisfied'
      constraint.ruleId = rule.id
      constraint.reasonCode = reasonCode
      constraint.constraintHash = computeConstraintHash(constraint)
    }
    const degrade = (constraint: Constraint, rule: InternalRule, conflict: ConstraintConflict, affectedIds: string[]): Degradation | undefined => {
      const target = constraints.find((item) => item.id === constraint.id)
      if (!target || target.importance !== 'preferred' || degradedConstraintIds.has(target.id)) return undefined
      markUnsatisfied(target, rule, rule.resolution.reasonCode)
      degradedConstraintIds.add(target.id)
      const degradation = createDegradation({ schemaVersion: DEGRADATION_SCHEMA_VERSION, id: hashId('degradation', { conflictId: conflict.id, constraintId: target.id }), preferenceId: target.id, constraintId: target.id, reasonCode: rule.resolution.reasonCode, impact: conflict.message, affectedIds: sortedStrings([target.id, ...affectedIds]), explanation: `Preferred constraint ${target.id} was excluded because ${conflict.message}` })
      degradations.push(degradation)
      return degradation
    }
    for (const rule of allRules(input.effectiveScenario)) {
      const match = ruleMatches(rule, ruleItems)
      if (!match) {
        traces.push(makeRuleTrace(rule, [], [], 'skipped', 'RULE_PRECONDITION_NOT_MET', 'Declarative rule preconditions were not met.'))
        continue
      }
      const matchedItems = [...match.operands.values()].flat()
      const matchedConstraints = uniqueSortedObjects(matchedItems.flatMap((item) => constraintByPath.get(item.path) ?? []), (item) => item.id)
      const inputIds = sortedStrings(matchedItems.map((item) => item.id))
      if (rule.kind === 'dependency') {
        const parentItems = match.operands.get(rule.operands[0].id) ?? []
        const parentConstraints = uniqueSortedObjects(parentItems.flatMap((item) => constraintByPath.get(item.path) ?? []), (item) => item.id)
        if (match.missingOperandIds.length > 0) {
          const dependencyConflict = createConstraintConflict({ schemaVersion: CONSTRAINT_CONFLICT_SCHEMA_VERSION, id: hashId('constraint-conflict', { code: 'CONSTRAINT_DEPENDENCY_MISSING', ruleId: rule.id, constraintIds: parentConstraints.map((item) => item.id), missingOperandIds: match.missingOperandIds }), code: 'CONSTRAINT_DEPENDENCY_MISSING', severity: importanceFromValues(parentConstraints.map((item) => item.importance), rule.importance), targetPath: parentConstraints[0]?.targetPath, constraintIds: parentConstraints.map((item) => item.id), dependencyIds: [], resourceClaimIds: [], message: `${rule.message} Required dependency operand(s) missing: ${match.missingOperandIds.join(', ')}.`, blocking: !(rule.resolution.strategy === 'degrade_operand' && parentConstraints.every((item) => item.importance === 'preferred')), waiverAllowed: rule.importance === 'required' })
          conflicts.push(dependencyConflict)
          const dependencyDegradations = rule.resolution.strategy === 'degrade_operand' ? parentConstraints.map((constraint) => degrade(constraint, rule, dependencyConflict, parentConstraints.map((item) => item.id))).filter((item): item is Degradation => item !== undefined).map((item) => item.id) : []
          traces.push(makeRuleTrace(rule, inputIds, [dependencyConflict.id, ...dependencyDegradations], dependencyConflict.blocking ? 'blocked' : 'degraded', 'CONSTRAINT_DEPENDENCY_MISSING', dependencyConflict.message))
        } else {
          const dependencyIds: string[] = []
          for (const operand of rule.operands.slice(1)) {
            const childItems = match.operands.get(operand.id) ?? []
            const child = uniqueSortedObjects(childItems.flatMap((item) => constraintByPath.get(item.path) ?? []), (item) => item.id)[0]
            const parent = parentConstraints[0]
            if (!parent || !child) continue
            const dependency = createConstraintDependency({ schemaVersion: CONSTRAINT_DEPENDENCY_SCHEMA_VERSION, id: hashId('constraint-dependency', { ruleId: rule.id, parent: parent.id, child: child.id }), parentId: parent.id, childId: child.id, kind: rule.dependencyKind ?? 'requires', importance: rule.importance, explanation: rule.message })
            dependencies.push(dependency); dependencyIds.push(dependency.id)
          }
          traces.push(makeRuleTrace(rule, inputIds, dependencyIds, 'applied', rule.reasonCode))
        }
        continue
      }
      if (matchedConstraints.length < 2) {
        traces.push(makeRuleTrace(rule, inputIds, [], 'skipped', 'RULE_SINGLE_OPERAND_MATCH', 'A declarative rule matched fewer than two constraint operands.'))
        continue
      }
      const strong = matchedConstraints.filter((constraint) => constraint.importance === 'hard' || constraint.importance === 'required')
      let degradable = matchedConstraints.filter((constraint) => constraint.importance === 'preferred')
      if (strong.length === 0 && rule.resolution.strategy === 'degrade_operand' && rule.resolution.operandId) {
        const targetedItems = match.operands.get(rule.resolution.operandId) ?? []
        const targetedIds = new Set(targetedItems.map((item) => item.id))
        degradable = matchedConstraints.filter((constraint) => constraint.importance === 'preferred' && constraint.sourceIds.some((sourceId) => targetedIds.has(sourceId)) || constraint.importance === 'preferred' && targetedItems.some((item) => item.path === constraint.targetPath))
      }
      const autoDegrade = strong.length === 1 ? matchedConstraints.filter((constraint) => constraint.importance === 'preferred') : strong.length === 0 && degradable.length > 0 && degradable.length < matchedConstraints.length ? degradable : []
      const conflict = conflictForRule(rule, matchedConstraints, autoDegrade.length === 0)
      conflicts.push(conflict)
      const degradationIds = autoDegrade.map((constraint) => degrade(constraint, rule, conflict, strong.map((item) => item.id))).filter((item): item is Degradation => item !== undefined).map((item) => item.id)
      if (rule.resourceId) {
        const claim = createResourceClaim({ schemaVersion: RESOURCE_CLAIM_SCHEMA_VERSION, id: conflict.resourceClaimIds[0] ?? hashId('resource', { resourceId: rule.resourceId, constraintIds: conflict.constraintIds }), resourceId: rule.resourceId, mode: 'exclusive', claimantIds: inputIds, constraintIds: conflict.constraintIds, quantity: 1, explanation: rule.message })
        resourceClaims.push(claim)
      }
      traces.push(makeRuleTrace(rule, inputIds, [conflict.id, ...degradationIds], conflict.blocking ? 'blocked' : 'degraded', conflict.code))
    }

    const allConstraintIds = new Set(constraints.map((constraint) => constraint.id))
    for (const dependency of dependencies) {
      if (!allConstraintIds.has(dependency.parentId) || !allConstraintIds.has(dependency.childId)) {
        conflicts.push(createConstraintConflict({ schemaVersion: CONSTRAINT_CONFLICT_SCHEMA_VERSION, id: hashId('constraint-conflict', { code: 'CONSTRAINT_DEPENDENCY_MISSING', dependencyId: dependency.id }), code: 'CONSTRAINT_DEPENDENCY_MISSING', severity: dependency.importance, constraintIds: [], dependencyIds: [dependency.id], resourceClaimIds: [], message: 'A declarative constraint dependency refers to a missing node.', blocking: dependency.importance !== 'preferred', waiverAllowed: dependency.importance === 'required' }))
      }
    }
    for (const cycle of dependencyCycles(dependencies, allConstraintIds)) {
      conflicts.push(createConstraintConflict({ schemaVersion: CONSTRAINT_CONFLICT_SCHEMA_VERSION, id: hashId('constraint-conflict', { code: 'CONSTRAINT_DEPENDENCY_CYCLE', cycle }), code: 'CONSTRAINT_DEPENDENCY_CYCLE', severity: 'hard', constraintIds: cycle, dependencyIds: dependencies.filter((dependency) => cycle.includes(dependency.parentId) && cycle.includes(dependency.childId)).map((dependency) => dependency.id), resourceClaimIds: [], message: 'Constraint dependency graph contains a directed cycle.', blocking: true, waiverAllowed: false }))
    }
    for (const claim of resourceClaims) {
      const exclusiveClaimants = sortedStrings(claim.claimantIds)
      if (claim.mode === 'exclusive' && exclusiveClaimants.length > 1 && !conflicts.some((conflict) => conflict.resourceClaimIds.includes(claim.id))) {
        conflicts.push(createConstraintConflict({ schemaVersion: CONSTRAINT_CONFLICT_SCHEMA_VERSION, id: hashId('constraint-conflict', { code: 'RESOURCE_CONFLICT', claim: claim.id }), code: 'RESOURCE_CONFLICT', severity: 'required', constraintIds: claim.constraintIds, dependencyIds: [], resourceClaimIds: [claim.id], message: `Exclusive resource ${claim.resourceId} is claimed by multiple constraints.`, blocking: true, waiverAllowed: true }))
      }
    }

    const validWaivers = waiverTargets(input.waivers ?? [], input)
    const adjustedConflicts: ConstraintConflict[] = []
    const rehashConflict = (conflict: ConstraintConflict): ConstraintConflict => clone({ ...conflict, conflictHash: computeConstraintConflictHash(conflict) })
    for (const conflict of uniqueSortedObjects(conflicts, (item) => item.id)) {
      const covered = [conflict.id, conflict.code, ...conflict.constraintIds, ...conflict.dependencyIds, ...conflict.resourceClaimIds].some((id) => validWaivers.has(id))
      if (conflict.severity === 'hard' && covered) {
        adjustedConflicts.push(rehashConflict({ ...conflict, blocking: true, waiverAllowed: false, message: `${conflict.message} Hard conflicts cannot be waived.` }))
        warnings.push('HARD_CONFLICT_CANNOT_WAIVE')
      } else if (conflict.severity === 'required' && covered) {
        adjustedConflicts.push(rehashConflict({ ...conflict, blocking: false, message: `${conflict.message} Proceeding only under an explicit scoped waiver.` }))
        warnings.push('REQUIRED_CONFLICT_WAIVED')
      } else adjustedConflicts.push(conflict)
    }
    const blocked = adjustedConflicts.some((conflict) => conflict.blocking)
    const orderedGoals = sortedBy(goals, (item) => item.id)
    const orderedConstraints = sortedBy(constraints.map(normalizeConstraint), (item) => item.id)
    const orderedDependencies = sortedBy(dependencies, (item) => item.id)
    const orderedClaims = sortedBy(resourceClaims, (item) => item.id)
    const orderedConflicts = sortedBy(adjustedConflicts, (item) => item.id)
    const orderedDegradations = sortedBy(degradations, (item) => item.id)
    const orderedTraces = sortedBy(traces, (item) => item.id)
    const base: ConstraintIR = {
      schemaVersion: CONSTRAINT_IR_SCHEMA_VERSION,
      id: hashId('constraint-ir', { caseId: input.caseId, caseRevision: input.caseRevision, contextHash: input.contextHash, requestedScopePlanHash: input.requestedScopePlanHash, instanceHash: input.ontologyInstance.instanceHash }),
      caseId: input.caseId,
      caseRevision: input.caseRevision,
      contextHash: input.contextHash,
      requestedScopePlanHash: input.requestedScopePlanHash,
      instanceHash: input.ontologyInstance.instanceHash,
      decisionHashes: sortedStrings(input.bindingDecisions.map((decision) => decision.decisionHash)),
      goals: orderedGoals,
      constraints: orderedConstraints,
      dependencies: orderedDependencies,
      resourceClaims: orderedClaims,
      conflicts: orderedConflicts,
      degradedPreferences: orderedDegradations,
      reviewRequirements,
      explanations: orderedTraces,
      ruleTraces: orderedTraces,
      warnings: sortedStrings(warnings),
      status: blocked ? 'blocked' : 'ok',
      deterministicSignature: '',
    }
    base.deterministicSignature = computeConstraintIRSignature(base)
    return clone(base)
  }
}

export const DeterministicConstraintGraphCompiler = ConstraintGraphCompiler

export function compileConstraints(input: ConstraintCompilationInput): ConstraintIR {
  return new ConstraintGraphCompiler().compile(input)
}

export function compileConstraintIR(input: ConstraintCompilationInput): ConstraintIR {
  return compileConstraints(input)
}

function referenceProfileLimits(profile: ProviderCapabilityProfile): {
  maximumReferenceCount?: number
  maximumTotalBytes?: number
  maximumBytesPerReference?: number
  allowedMediaTypes: string[]
  allowedRoles: string[]
  ordering: ProviderCapabilityProfile['referenceOrdering']
  roleOrder: string[]
  supportsMultipleReferences: boolean
  requiresPublishedReferences: boolean
} {
  const nested = profile.referenceLimits ?? {}
  return {
    maximumReferenceCount: profile.maximumReferenceCount ?? nested.maximumReferenceCount,
    maximumTotalBytes: profile.maximumTotalReferenceBytes ?? nested.maximumTotalBytes,
    maximumBytesPerReference: profile.maximumBytesPerReference ?? nested.maximumBytesPerReference,
    allowedMediaTypes: sortedStrings(profile.allowedReferenceMediaTypes ?? nested.allowedMediaTypes),
    allowedRoles: sortedStrings(profile.allowedReferenceRoles ?? nested.allowedRoles),
    ordering: profile.referenceOrdering ?? nested.ordering ?? 'stable',
    roleOrder: sortedStrings(profile.referenceRoleOrder ?? nested.roleOrder),
    supportsMultipleReferences: profile.supportsMultipleReferences ?? nested.supportsMultipleReferences ?? true,
    requiresPublishedReferences: profile.requiresPublishedReferences ?? nested.requiresPublishedReferences ?? false,
  }
}

function validProfile(profile: ProviderCapabilityProfile): string[] {
  const reasons: string[] = []
  if (!profile || typeof profile !== 'object' || profile.schemaVersion !== PROVIDER_CAPABILITY_PROFILE_SCHEMA_VERSION) return ['PROFILE_SCHEMA_INVALID']
  if (typeof profile.id !== 'string' || !profile.id || typeof profile.version !== 'string' || !/^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/.test(profile.version)) reasons.push('PROFILE_VERSION_UNKNOWN')
  if (profile.verificationStatus === 'unknown' || profile.verificationStatus === 'stale') reasons.push('PROFILE_VERIFICATION_INVALID')
  if (typeof profile.adapterId !== 'string' || !profile.adapterId) reasons.push('ADAPTER_ID_MISSING')
  if (!isHash(profile.adapterDigest)) reasons.push('ADAPTER_DIGEST_MISSING')
  if (!isHash(profile.profileHash)) reasons.push('PROFILE_HASH_MISSING')
  else if (profile.profileHash !== computeProviderCapabilityProfileHash(profile)) reasons.push('PROFILE_HASH_MISMATCH')
  if (typeof profile.timeoutMs !== 'number' || profile.timeoutMs <= 0) reasons.push('PROFILE_TIMEOUT_INVALID')
  return sortedStrings(reasons)
}

function candidateArtifact(candidate: ReferenceCandidate): ArtifactHandle | undefined {
  return candidate.artifact ?? candidate.artifactHandle
}

function normalizedCandidate(candidate: ReferenceCandidate, constraintIR: ConstraintIR): ReferenceCandidate {
  const artifact = candidateArtifact(candidate)
  const constraints = sortedStrings(candidate.constraintIds)
  const inferredImportance = importanceFromValues(constraints.map((id) => constraintIR.constraints.find((item) => item.id === id)?.importance), candidate.importance ?? 'preferred')
  return clone({
    ...candidate,
    candidateHash: candidate.candidateHash ?? computeReferenceCandidateHash(candidate),
    contentHash: candidate.contentHash ?? artifact?.contentHash ?? '',
    mediaType: candidate.mediaType ?? artifact?.mediaType,
    byteLength: candidate.byteLength ?? artifact?.byteLength,
    role: candidate.role ?? artifact?.role ?? 'reference',
    ontologyScopes: sortedStrings(candidate.ontologyScopes),
    ...(candidate.prohibitedTargetPaths === undefined ? {} : { prohibitedTargetPaths: sortedStrings(candidate.prohibitedTargetPaths) }),
    ...(candidate.prohibitedTargetPathImportance === undefined ? {} : { prohibitedTargetPathImportance: sortedImportanceMap(candidate.prohibitedTargetPathImportance) }),
    importance: inferredImportance,
    constraintIds: constraints,
    sourceBindingIds: sortedStrings(candidate.sourceBindingIds),
    goalIds: sortedStrings(candidate.goalIds),
    orderKey: candidate.orderKey ?? candidate.id,
  })
}

function candidateValidation(candidate: ReferenceCandidate): string[] {
  const reasons: string[] = []
  const artifact = candidateArtifact(candidate)
  if (candidate.schemaVersion !== REFERENCE_CANDIDATE_SCHEMA_VERSION) reasons.push('REFERENCE_CANDIDATE_SCHEMA_INVALID')
  if (!candidate.id || !candidate.assetId || !isHash(candidate.contentHash)) reasons.push('REFERENCE_CANDIDATE_INVALID')
  if (!isHash(candidate.candidateHash)) reasons.push('REFERENCE_CANDIDATE_HASH_MISSING')
  else if (computeReferenceCandidateHash(candidate) !== candidate.candidateHash) reasons.push('REFERENCE_CANDIDATE_HASH_MISMATCH')
  if (artifact) {
    if (artifact.contentHash !== candidate.contentHash) reasons.push('REFERENCE_ARTIFACT_HASH_MISMATCH')
    if (artifact.availability !== 'available') reasons.push('REFERENCE_ARTIFACT_UNAVAILABLE')
  }
  if (candidate.byteLength !== undefined && (!Number.isInteger(candidate.byteLength) || candidate.byteLength < 0)) reasons.push('REFERENCE_BYTE_LENGTH_INVALID')
  const prohibitedPaths = sortedStrings(candidate.prohibitedTargetPaths)
  const importanceMap = candidate.prohibitedTargetPathImportance
  if (candidate.prohibitedTargetPaths !== undefined) {
    if (!importanceMap || canonicalize(sortedStrings(Object.keys(importanceMap))) !== canonicalize(prohibitedPaths) || Object.values(importanceMap).some((value) => !['hard', 'required', 'preferred'].includes(value))) reasons.push('REFERENCE_ISOLATION_IMPORTANCE_INVALID')
  } else if (importanceMap !== undefined) reasons.push('REFERENCE_ISOLATION_IMPORTANCE_INVALID')
  if (prohibitedPaths.some((prohibited) => (candidate.ontologyScopes ?? []).some((allowed) => pathMatches(prohibited, allowed)))) reasons.push('REFERENCE_ISOLATION_CONFLICT')
  return sortedStrings(reasons)
}

function referenceBudgetValidationReasons(budget: ReferenceBudget | undefined): string[] {
  if (!budget) return []
  const reasons: string[] = []
  if (budget.maximumReferenceCount !== undefined && (!Number.isInteger(budget.maximumReferenceCount) || budget.maximumReferenceCount < 0)) reasons.push('REFERENCE_COUNT_BUDGET_INVALID')
  if (budget.maximumTotalBytes !== undefined && (!Number.isInteger(budget.maximumTotalBytes) || budget.maximumTotalBytes < 0)) reasons.push('REFERENCE_BYTES_BUDGET_INVALID')
  if (!Number.isInteger(budget.usedReferenceCount) || budget.usedReferenceCount < 0) reasons.push('REFERENCE_USED_COUNT_INVALID')
  if (budget.usedTotalBytes !== undefined && (!Number.isInteger(budget.usedTotalBytes) || budget.usedTotalBytes < 0)) reasons.push('REFERENCE_USED_BYTES_INVALID')
  return sortedStrings(reasons)
}

function makeReferenceOmission(candidate: ReferenceCandidate, dependencyIds: string[], reasonCode: string, impact: string): ReferenceOmission {
  const base: Omit<ReferenceOmission, 'omissionHash'> = {
    schemaVersion: REFERENCE_OMISSION_SCHEMA_VERSION,
    id: hashId('reference-omission', { candidateId: candidate.id, assetId: candidate.assetId, reasonCode, dependencyIds }),
    candidateId: candidate.id,
    assetId: candidate.assetId,
    importance: candidate.importance ?? 'preferred',
    constraintIds: sortedStrings(candidate.constraintIds),
    dependencyIds: sortedStrings(dependencyIds),
    reasonCode,
    impact,
  }
  return clone({ ...base, omissionHash: computeReferenceOmissionHash({ ...base, omissionHash: '' }) })
}

function planProjection(plan: ReferencePlan): JsonObject {
  const projection = cleanWithout(plan, 'planHash')
  if (Array.isArray(projection.selected)) projection.selected = sortedBy(projection.selected as unknown[], (item) => String((item as Record<string, unknown>).id)) as unknown as JsonValue[]
  if (Array.isArray(projection.ordered)) projection.ordered = sortedBy(projection.ordered as unknown[], (item) => String((item as Record<string, unknown>).id)) as unknown as JsonValue[]
  if (Array.isArray(projection.omitted)) projection.omitted = sortedBy(projection.omitted as unknown[], (item) => String((item as Record<string, unknown>).id)) as unknown as JsonValue[]
  if (Array.isArray(projection.blockedReferences)) projection.blockedReferences = sortedBy(projection.blockedReferences as unknown[], (item) => String((item as Record<string, unknown>).id)) as unknown as JsonValue[]
  if (Array.isArray(projection.dependencies)) projection.dependencies = sortedBy(projection.dependencies as unknown[], (item) => String((item as Record<string, unknown>).id)) as unknown as JsonValue[]
  if (Array.isArray((projection.budget as Record<string, unknown> | undefined)?.unknownByteLengthAssetIds)) {
    const budget = projection.budget as Record<string, unknown>
    budget.unknownByteLengthAssetIds = sortedStrings(budget.unknownByteLengthAssetIds as string[]) as unknown as JsonValue
  }
  return projection
}

export function computeReferencePlanHash(plan: ReferencePlan): string { return sha256(planProjection(plan)) }

function referencePlanIntegrityReasons(plan: ReferencePlan): string[] {
  const reasons: string[] = []
  if (plan.schemaVersion !== REFERENCE_PLAN_SCHEMA_VERSION) reasons.push('REFERENCE_PLAN_SCHEMA_INVALID')
  if (!isHash(plan.planHash) || computeReferencePlanHash(plan) !== plan.planHash) reasons.push('REFERENCE_PLAN_HASH_MISMATCH')
  if (!isHash(plan.profileDigest)) reasons.push('REFERENCE_PROFILE_DIGEST_MISSING')
  for (const dependency of plan.dependencies) {
    if (!isHash(dependency.dependencyHash) || computeReferenceDependencyHash(dependency) !== dependency.dependencyHash) reasons.push('REFERENCE_DEPENDENCY_HASH_MISMATCH')
  }
  for (const omission of [...plan.omitted, ...plan.blockedReferences]) {
    if (!isHash(omission.omissionHash) || computeReferenceOmissionHash(omission) !== omission.omissionHash) reasons.push('REFERENCE_OMISSION_HASH_MISMATCH')
  }
  return sortedStrings(reasons)
}

function makePlannedReference(candidate: ReferenceCandidate, dependencyIds: string[], order: number): PlannedReference {
  const base: PlannedReference = {
    schemaVersion: PLANNED_REFERENCE_SCHEMA_VERSION,
    id: hashId('planned-reference', { candidateId: candidate.id, contentHash: candidate.contentHash }),
    candidateId: candidate.id,
    assetId: candidate.assetId,
    contentHash: candidate.contentHash,
    mediaType: candidate.mediaType ?? 'application/octet-stream',
    ...(candidate.byteLength === undefined ? {} : { byteLength: candidate.byteLength }),
    role: candidate.role ?? 'reference',
    ontologyScopes: sortedStrings(candidate.ontologyScopes),
    ...(candidate.prohibitedTargetPaths === undefined ? {} : { prohibitedTargetPaths: sortedStrings(candidate.prohibitedTargetPaths) }),
    ...(candidate.prohibitedTargetPathImportance === undefined ? {} : { prohibitedTargetPathImportance: sortedImportanceMap(candidate.prohibitedTargetPathImportance) }),
    constraintIds: sortedStrings(candidate.constraintIds),
    sourceBindingIds: sortedStrings(candidate.sourceBindingIds),
    dependencyIds: sortedStrings(dependencyIds),
    order,
    label: `ref-${String(order + 1).padStart(2, '0')}`,
  }
  return clone(base)
}

function blockedReferencePlan(input: Partial<ReferencePlanningInput>, reasons: string[], warnings: string[] = [], blockedReferences: ReferenceOmission[] = []): ReferencePlan {
  const profile = input.profile
  const base: ReferencePlan = {
    schemaVersion: REFERENCE_PLAN_SCHEMA_VERSION,
    id: hashId('reference-plan', { caseId: input.caseId ?? 'unknown-case', caseRevision: input.caseRevision ?? 0, contextHash: input.contextHash ?? '', constraintSignature: input.constraintIR?.deterministicSignature ?? '', profileId: profile?.id ?? 'unknown-profile', reasons: sortedStrings(reasons) }),
    caseId: input.caseId ?? 'unknown-case',
    caseRevision: input.caseRevision ?? 0,
    contextHash: input.contextHash ?? 'sha256:' + '0'.repeat(64),
    constraintSignature: input.constraintIR?.deterministicSignature ?? 'sha256:' + '0'.repeat(64),
    profileId: profile?.id ?? 'unknown-profile',
    profileVersion: profile?.version ?? 'unknown',
    profileDigest: profile && isHash(profile.profileHash) ? profile.profileHash : 'sha256:' + '0'.repeat(64),
    selected: [],
    ordered: [],
    omitted: [],
    blockedReferences,
    dependencies: sortedBy(input.dependencies ?? [], (item) => item.id),
    budget: { maximumReferenceCount: referenceProfileLimits(profile ?? ({ referenceLimits: {}, knownIncompatibilities: [], timeoutMs: 1, streaming: false } as unknown as ProviderCapabilityProfile)).maximumReferenceCount, maximumTotalBytes: referenceProfileLimits(profile ?? ({ referenceLimits: {}, knownIncompatibilities: [], timeoutMs: 1, streaming: false } as unknown as ProviderCapabilityProfile)).maximumTotalBytes, usedReferenceCount: 0, byteLengthKnown: false, unknownByteLengthAssetIds: [] },
    warnings: sortedStrings(warnings),
    status: 'blocked',
    planHash: '',
  }
  base.planHash = computeReferencePlanHash(base)
  return clone(base)
}

interface CandidateGroup { key: string; representative: ReferenceCandidate; aliases: string[]; bytes?: number; required: boolean; members: ReferenceCandidate[]; isolationConflict: boolean }

function groupCandidates(candidates: ReferenceCandidate[]): CandidateGroup[] {
  const groups = new Map<string, CandidateGroup>()
  for (const candidate of candidates) {
    const key = candidate.contentHash
    const existing = groups.get(key)
    if (!existing) {
      groups.set(key, { key, representative: clone(candidate), aliases: [candidate.id], bytes: candidate.byteLength, required: candidate.importance !== 'preferred', members: [clone(candidate)], isolationConflict: false })
      continue
    }
    existing.aliases.push(candidate.id)
    existing.members.push(clone(candidate))
    existing.required = existing.required || candidate.importance !== 'preferred'
    const ontologyScopes = sortedStrings([...(existing.representative.ontologyScopes ?? []), ...(candidate.ontologyScopes ?? [])])
    const prohibitedTargetPaths = sortedStrings([...(existing.representative.prohibitedTargetPaths ?? []), ...(candidate.prohibitedTargetPaths ?? [])])
    const prohibitedTargetPathImportance = mergeImportanceMaps(existing.representative.prohibitedTargetPathImportance, candidate.prohibitedTargetPathImportance)
    existing.isolationConflict = existing.isolationConflict || prohibitedTargetPaths.some((prohibited) => ontologyScopes.some((allowed) => pathMatches(prohibited, allowed)))
    existing.representative = clone({
      ...existing.representative,
      id: [existing.representative.id, candidate.id].sort(compareCodeUnits)[0],
      importance: stableImportance(existing.representative.importance, candidate.importance),
      role: [existing.representative.role ?? 'reference', candidate.role ?? 'reference'].sort(compareCodeUnits)[0],
      ontologyScopes,
      ...(existing.representative.prohibitedTargetPaths === undefined && candidate.prohibitedTargetPaths === undefined ? {} : { prohibitedTargetPaths }),
      ...(prohibitedTargetPathImportance === undefined ? {} : { prohibitedTargetPathImportance }),
      constraintIds: sortedStrings([...(existing.representative.constraintIds ?? []), ...(candidate.constraintIds ?? [])]),
      sourceBindingIds: sortedStrings([...(existing.representative.sourceBindingIds ?? []), ...(candidate.sourceBindingIds ?? [])]),
      goalIds: sortedStrings([...(existing.representative.goalIds ?? []), ...(candidate.goalIds ?? [])]),
      byteLength: existing.representative.byteLength ?? candidate.byteLength,
    })
    if (existing.bytes === undefined) existing.bytes = candidate.byteLength
  }
  return sortedBy([...groups.values()], (group) => `${group.key}|${group.representative.id}`)
}

function representativeFor(id: string, groups: CandidateGroup[]): CandidateGroup | undefined {
  return groups.find((group) => group.aliases.includes(id))
}

function dependencyGroupEdges(dependencies: ReferenceDependency[], groups: CandidateGroup[]): Map<string, Set<string>> {
  const edges = new Map<string, Set<string>>()
  for (const group of groups) edges.set(group.key, new Set([group.key]))
  const union = (left: string, right: string): void => {
    const a = edges.get(left); const b = edges.get(right)
    if (!a || !b || a === b) return
    const merged = new Set([...a, ...b])
    for (const key of merged) edges.set(key, merged)
  }
  for (const dependency of dependencies) {
    if (dependency.importance === 'preferred') continue
    const parent = representativeFor(dependency.parentCandidateId, groups)
    const child = representativeFor(dependency.childCandidateId, groups)
    if (parent && child) union(parent.key, child.key)
  }
  return edges
}

function candidateDependencyIds(candidate: ReferenceCandidate, dependencies: ReferenceDependency[]): string[] {
  return dependencies.filter((dependency) => dependency.parentCandidateId === candidate.id || dependency.childCandidateId === candidate.id).map((dependency) => dependency.id)
}

function profileOutput(profile: ProviderCapabilityProfile): { mediaTypes: string[]; transparent: boolean; alpha: boolean; minimumWidth?: number; minimumHeight?: number; maximumWidth?: number; maximumHeight?: number } {
  const output = profile.outputCapabilities ?? {}
  return {
    mediaTypes: sortedStrings(profile.outputMediaTypes ?? output.mediaTypes),
    transparent: profile.supportsTransparentOutput ?? output.supportsTransparentOutput ?? false,
    alpha: profile.supportsAlpha ?? output.supportsAlpha ?? false,
    minimumWidth: output.minimumWidth,
    minimumHeight: output.minimumHeight,
    maximumWidth: output.maximumWidth,
    maximumHeight: output.maximumHeight,
  }
}

export class ReferenceBudgetOptimizer {
  plan(input: ReferencePlanningInput): ReferencePlan {
    try { return this.planSafe(clone(input)) } catch { return blockedReferencePlan(input ?? {}, ['REFERENCE_PLANNING_INPUT_INVALID']) }
  }

  private planSafe(input: ReferencePlanningInput): ReferencePlan {
    const profileReasons = validProfile(input.profile)
    if (profileReasons.length) return blockedReferencePlan(input, profileReasons)
    if (!input.constraintIR || input.constraintIR.status !== 'ok' || constraintIRIntegrityReasons(input.constraintIR).length) return blockedReferencePlan(input, ['CONSTRAINT_IR_INVALID'])
    if (input.constraintIR.contextHash !== input.contextHash || input.caseId !== input.constraintIR.caseId || input.caseRevision !== input.constraintIR.caseRevision) return blockedReferencePlan(input, ['CONSTRAINT_CONTEXT_MISMATCH'])
    const referenceBudgetReasons = referenceBudgetValidationReasons(input.budget)
    if (referenceBudgetReasons.length) return blockedReferencePlan(input, referenceBudgetReasons)
    const limits = referenceProfileLimits(input.profile)
    const candidates = (input.candidates ?? []).map((candidate) => ({ raw: clone(candidate), normalized: normalizedCandidate(candidate, input.constraintIR) }))
    const reasons: string[] = []
    const seenIds = new Map<string, ReferenceCandidate>()
    const validCandidates: ReferenceCandidate[] = []
    for (const entry of sortedBy(candidates, (item) => item.raw.id)) {
      const candidate = entry.normalized
      const rawCandidate = entry.raw
      const prior = seenIds.get(candidate.id)
      if (prior && canonicalize(jsonReady(referenceCandidateProjection(prior))) !== canonicalize(jsonReady(referenceCandidateProjection(candidate)))) { reasons.push('REFERENCE_CANDIDATE_ID_COLLISION'); continue }
      seenIds.set(candidate.id, candidate)
      // Validate the externally supplied candidate hash before deterministic
      // defaults (role/order/media metadata) are derived for planning.
      const validation = candidateValidation(rawCandidate)
      if (validation.length) { reasons.push(...validation); continue }
      if (candidate.constraintIds?.some((id) => !input.constraintIR.constraints.some((constraint) => constraint.id === id))) { reasons.push('REFERENCE_CONSTRAINT_NOT_FOUND'); continue }
      if (candidate.goalIds?.some((id) => !input.constraintIR.goals.some((goal) => goal.id === id))) { reasons.push('REFERENCE_GOAL_NOT_FOUND'); continue }
      validCandidates.push(candidate)
    }
    if (reasons.length) return blockedReferencePlan(input, reasons)
    const dependencies = uniqueSortedObjects((input.dependencies ?? []).map((dependency) => clone(dependency)), (item) => item.id)
    const dependencyReasons: string[] = []
    for (const dependency of dependencies) {
      if (dependency.schemaVersion !== REFERENCE_DEPENDENCY_SCHEMA_VERSION) dependencyReasons.push('REFERENCE_DEPENDENCY_SCHEMA_INVALID')
      if (!isHash(dependency.dependencyHash)) dependencyReasons.push('REFERENCE_DEPENDENCY_HASH_MISSING')
      else if (computeReferenceDependencyHash(dependency) !== dependency.dependencyHash) dependencyReasons.push('REFERENCE_DEPENDENCY_HASH_MISMATCH')
    }
    if (dependencyReasons.length) return blockedReferencePlan(input, dependencyReasons)
    const groups = groupCandidates(validCandidates)
    const isolationConflicts = groups.filter((group) => group.isolationConflict)
    if (isolationConflicts.length) {
      const blocked = isolationConflicts.flatMap((group) => group.members.map((candidate) => makeReferenceOmission(candidate, candidateDependencyIds(candidate, dependencies), 'REFERENCE_ISOLATION_CONFLICT', 'The same content cannot be assigned mutually contradictory allowed and prohibited contribution paths.')))
      return blockedReferencePlan(input, ['REFERENCE_ISOLATION_CONFLICT'], [], blocked)
    }
    const omissions: ReferenceOmission[] = []
    const blockedReferences: ReferenceOmission[] = []
    const groupEdges = dependencyGroupEdges(dependencies, groups)
    for (const dependency of dependencies) {
      if (!representativeFor(dependency.parentCandidateId, groups) || !representativeFor(dependency.childCandidateId, groups)) {
        if (dependency.importance !== 'preferred') dependencyReasons.push('REFERENCE_DEPENDENCY_MISSING')
      }
    }
    if (dependencyReasons.length) return blockedReferencePlan(input, dependencyReasons)
    const componentMembers = new Map<string, CandidateGroup[]>()
    for (const group of groups) {
      const component = [...(groupEdges.get(group.key) ?? new Set([group.key]))].sort(compareCodeUnits)
      const key = component[0]
      componentMembers.set(key, component.map((item) => groups.find((candidateGroup) => candidateGroup.key === item)!).filter(Boolean))
    }
    const allComponents = sortedBy([...componentMembers.entries()], (entry) => entry[0])
    const selectedGroups: CandidateGroup[] = []
    let usedBytes = 0
    let bytesKnown = true
    const unknownByteLengthAssetIds: string[] = []
    const maximumCount = input.budget?.maximumReferenceCount === undefined ? limits.maximumReferenceCount : Math.min(input.budget.maximumReferenceCount, limits.maximumReferenceCount ?? Number.MAX_SAFE_INTEGER)
    const maximumBytes = input.budget?.maximumTotalBytes === undefined ? limits.maximumTotalBytes : Math.min(input.budget.maximumTotalBytes, limits.maximumTotalBytes ?? Number.MAX_SAFE_INTEGER)
    const countFor = (component: CandidateGroup[]): number => component.length
    const bytesFor = (component: CandidateGroup[]): number | undefined => {
      let total = 0
      for (const group of component) {
        if (group.bytes === undefined) return undefined
        total += group.bytes
      }
      return total
    }
    const fits = (component: CandidateGroup[]): { ok: boolean; reason?: string; componentBytes?: number } => {
      const count = selectedGroups.length + countFor(component)
      if (maximumCount !== undefined && count > maximumCount) return { ok: false, reason: 'REFERENCE_COUNT_EXCEEDED' }
      if (!limits.supportsMultipleReferences && count > 1) return { ok: false, reason: 'MULTI_REFERENCE_UNSUPPORTED' }
      for (const group of component) {
        const candidate = group.representative
        if (limits.allowedMediaTypes.length && (!candidate.mediaType || !limits.allowedMediaTypes.includes(candidate.mediaType))) return { ok: false, reason: 'REFERENCE_MEDIA_TYPE_UNSUPPORTED' }
        if (limits.allowedRoles.length && (!candidate.role || !limits.allowedRoles.includes(candidate.role))) return { ok: false, reason: 'REFERENCE_ROLE_UNSUPPORTED' }
        if (limits.maximumBytesPerReference !== undefined) {
          if (candidate.byteLength === undefined) return { ok: false, reason: 'REFERENCE_BYTE_LENGTH_REQUIRED' }
          if (candidate.byteLength > limits.maximumBytesPerReference) return { ok: false, reason: 'REFERENCE_BYTES_PER_ASSET_EXCEEDED' }
        }
      }
      const componentBytes = bytesFor(component)
      if (maximumBytes !== undefined) {
        if (componentBytes === undefined) return { ok: false, reason: 'REFERENCE_TOTAL_BYTES_UNKNOWN' }
        if (usedBytes + componentBytes > maximumBytes) return { ok: false, reason: 'REFERENCE_TOTAL_BYTES_EXCEEDED', componentBytes }
      }
      return { ok: true, componentBytes }
    }
    const sortedComponents = allComponents.sort((left, right) => {
      const leftGroups = left[1]; const rightGroups = right[1]
      const leftImportance = Math.max(...leftGroups.map((group) => IMPORTANCE_RANK[group.representative.importance ?? 'preferred']))
      const rightImportance = Math.max(...rightGroups.map((group) => IMPORTANCE_RANK[group.representative.importance ?? 'preferred']))
      return rightImportance - leftImportance || compareCodeUnits(left[0], right[0])
    })
    for (const [, component] of sortedComponents) {
      if (component.some((group) => group.bytes === undefined)) {
        bytesKnown = false
        unknownByteLengthAssetIds.push(...component.map((group) => group.representative.assetId))
      }
      const required = component.some((group) => group.required) || component.some((group) => dependencies.some((dependency) => dependency.importance !== 'preferred' && (dependency.parentCandidateId === group.representative.id || dependency.childCandidateId === group.representative.id)))
      const fit = fits(component)
      if (!fit.ok) {
        const reason = fit.reason ?? 'REFERENCE_BUDGET_UNSATISFIABLE'
        for (const group of component) {
          const candidate = group.representative
          const omission = makeReferenceOmission(candidate, candidateDependencyIds(candidate, dependencies), reason, required ? 'A hard or required reference dependency cannot fit the provider budget.' : 'Preferred reference was omitted to remain within the provider budget.')
          if (required) blockedReferences.push(omission)
          else omissions.push(omission)
        }
        if (required) reasons.push(reason)
        continue
      }
      selectedGroups.push(...component)
      if (fit.componentBytes === undefined) {
        bytesKnown = false
        for (const group of component) unknownByteLengthAssetIds.push(group.representative.assetId)
      } else usedBytes += fit.componentBytes
    }
    for (const group of selectedGroups) if (group.representative.byteLength === undefined) {
      bytesKnown = false
      unknownByteLengthAssetIds.push(group.representative.assetId)
    }
    const selectedUnique = selectedGroups.filter((group, index) => selectedGroups.findIndex((candidate) => candidate.key === group.key) === index)
    const order = (left: CandidateGroup, right: CandidateGroup): number => {
      const roleOrder = limits.roleOrder
      const roleDifference = roleOrder.length ? (roleOrder.indexOf(left.representative.role ?? 'reference') + 1 || Number.MAX_SAFE_INTEGER) - (roleOrder.indexOf(right.representative.role ?? 'reference') + 1 || Number.MAX_SAFE_INTEGER) : 0
      return (limits.ordering === 'role' ? roleDifference : 0) || compareCodeUnits(left.representative.orderKey ?? left.representative.id, right.representative.orderKey ?? right.representative.id) || compareCodeUnits(left.key, right.key)
    }
    const orderedGroups = [...selectedUnique].sort(order)
    const planned = orderedGroups.map((group, index) => makePlannedReference(group.representative, dependencies.filter((dependency) => group.aliases.includes(dependency.parentCandidateId) || group.aliases.includes(dependency.childCandidateId)).map((dependency) => dependency.id), index))
    const warnings = [...(bytesKnown ? [] : ['REFERENCE_BYTE_LENGTH_UNKNOWN']), ...(limits.requiresPublishedReferences ? ['REFERENCE_PUBLICATION_REQUIRED'] : [])]
    const planBase: ReferencePlan = {
      schemaVersion: REFERENCE_PLAN_SCHEMA_VERSION,
      id: hashId('reference-plan', { caseId: input.caseId, caseRevision: input.caseRevision, contextHash: input.contextHash, constraintSignature: input.constraintIR.deterministicSignature, profileId: input.profile.id, profileVersion: input.profile.version }),
      caseId: input.caseId,
      caseRevision: input.caseRevision,
      contextHash: input.contextHash,
      constraintSignature: input.constraintIR.deterministicSignature,
      profileId: input.profile.id,
      profileVersion: input.profile.version,
      profileDigest: profileDigest(input.profile),
      selected: planned,
      ordered: planned,
      omitted: sortedBy(omissions, (item) => item.id),
      blockedReferences: sortedBy(blockedReferences, (item) => item.id),
      dependencies: sortedBy(dependencies, (item) => item.id),
      budget: { maximumReferenceCount: maximumCount, maximumTotalBytes: maximumBytes, usedReferenceCount: planned.length, ...(bytesKnown ? { usedTotalBytes: usedBytes } : {}), byteLengthKnown: bytesKnown, unknownByteLengthAssetIds: sortedStrings(unknownByteLengthAssetIds) },
      warnings: sortedStrings(warnings),
      status: reasons.length || blockedReferences.length ? 'blocked' : 'ok',
      planHash: '',
    }
    planBase.planHash = computeReferencePlanHash(planBase)
    return clone(planBase)
  }
}

export const DeterministicReferenceBudgetOptimizer = ReferenceBudgetOptimizer

export function planReferences(input: ReferencePlanningInput): ReferencePlan {
  return new ReferenceBudgetOptimizer().plan(input)
}

export function optimizeReferenceBudget(input: ReferencePlanningInput): ReferencePlan {
  return planReferences(input)
}

function profileDigest(profile: ProviderCapabilityProfile): string {
  return profile.profileHash ?? computeProviderCapabilityProfileHash(profile)
}

function profileOutputMediaTypes(profile: ProviderCapabilityProfile): string[] {
  return profileOutput(profile).mediaTypes
}

function targetMediaTypes(contract: OutputContract): string[] {
  return sortedStrings(contract.mediaTypes)
}

function capabilityVersionPin(capability: RegisteredStepCapability, profile: ProviderCapabilityProfile): { adapterVersion: RegisteredStepCapability['adapterVersion']; profileVersion: NonNullable<RegisteredStepCapability['profileVersion']> } {
  return {
    adapterVersion: clone(capability.adapterVersion),
    profileVersion: clone(capability.profileVersion ?? { id: profile.id, version: profile.version, digest: profileDigest(profile) }),
  }
}

function defaultCapabilities(profile: ProviderCapabilityProfile): RegisteredStepCapability[] {
  const generatorDigest = profile.adapterDigest ?? ''
  const generatorPin = { id: profile.adapterId, version: profile.version, digest: generatorDigest }
  const profilePin = { id: profile.id, version: profile.version, digest: profileDigest(profile) }
  const localDigest = sha256({ fixture: 'voce-local-step-adapter', version: '1.0.0' })
  const normalizeDigest = sha256({ fixture: 'voce-image-normalization-adapter', version: '1.0.0' })
  const validateDigest = sha256({ fixture: 'voce-structural-validation-adapter', version: '1.0.0' })
  const localPin = { id: 'voce.local', version: '1.0.0', digest: localDigest }
  return [
    { id: 'resolve-provider-asset', type: 'resolve_asset', capability: 'resolve_provider_readable_asset', adapterId: 'voce.local', adapterVersion: localPin, adapterDigest: localDigest, outputMediaTypes: ['image/png', 'image/jpeg', 'image/webp'], destination: 'local', dataCategories: ['asset_metadata'], mayCreateChargedSubmission: false },
    { id: 'publish-provider-asset', type: 'publish_asset', capability: 'publish_provider_readable_asset', adapterId: 'voce.asset-publisher', adapterVersion: { id: 'voce.asset-publisher', version: '1.0.0', digest: localDigest }, adapterDigest: localDigest, destination: profile.destination, dataCategories: ['reference_image'], mayCreateChargedSubmission: true },
    { id: 'generate-image', type: 'generate', capability: 'image_generation', adapterId: profile.adapterId, adapterVersion: generatorPin, adapterDigest: generatorDigest, profileVersion: profilePin, outputMediaTypes: profileOutputMediaTypes(profile), supportsAlpha: profileOutput(profile).alpha, destination: profile.destination, dataCategories: profile.dataCategories ?? ['reference_image', 'prompt'], budget: createBudget({ schemaVersion: BUDGET_SCHEMA_VERSION, id: profile.adapterId, maximumCalls: 1, maximumRetries: 0, timeoutMs: profile.timeoutMs }), cancellation: { cancellable: true, onCancel: 'submission_unknown' }, mayCreateChargedSubmission: true },
    { id: 'normalize-image', type: 'normalize', capability: 'image_normalization', adapterId: 'voce.image-normalizer', adapterVersion: { id: 'voce.image-normalizer', version: '1.0.0', digest: normalizeDigest }, adapterDigest: normalizeDigest, inputMediaTypes: ['image/jpeg', 'image/png', 'image/webp'], outputMediaTypes: ['image/png', 'image/jpeg', 'image/webp'], supportsAlpha: true, destination: 'local', dataCategories: ['generated_image'], budget: createBudget({ schemaVersion: BUDGET_SCHEMA_VERSION, id: 'voce.image-normalizer', maximumCalls: 1, maximumRetries: 0, timeoutMs: 60_000 }), cancellation: { cancellable: false, onCancel: 'continue' }, mayCreateChargedSubmission: false },
    { id: 'structural-validate', type: 'structural_validate', capability: 'structural_validation', adapterId: 'voce.structural-validator', adapterVersion: { id: 'voce.structural-validator', version: '1.0.0', digest: validateDigest }, adapterDigest: validateDigest, inputMediaTypes: ['image/png', 'image/jpeg', 'image/webp'], destination: 'local', dataCategories: ['generated_image', 'output_metadata'], budget: createBudget({ schemaVersion: BUDGET_SCHEMA_VERSION, id: 'voce.structural-validator', maximumCalls: 1, maximumRetries: 0, timeoutMs: 30_000 }), cancellation: { cancellable: false, onCancel: 'continue' }, mayCreateChargedSubmission: false },
  ]
}

function capabilityFor(type: RegisteredStepCapability['type'], capabilities: RegisteredStepCapability[]): RegisteredStepCapability | undefined {
  return sortedBy(capabilities.filter((capability) => capability.type === type), (item) => `${item.id}|${item.adapterId}`)[0]
}

function conflictingObjectIds<T>(values: T[], key: (value: T) => string, reasonCode: string): string[] {
  const seen = new Map<string, string>()
  const reasons: string[] = []
  for (const value of sortedBy(values, key)) {
    const id = key(value)
    const projection = canonicalize(jsonReady(value))
    const prior = seen.get(id)
    if (prior !== undefined && prior !== projection) reasons.push(reasonCode)
    else if (prior === undefined) seen.set(id, projection)
  }
  return sortedStrings(reasons)
}

function pipelineDataTransfer(capability: RegisteredStepCapability, input: PipelinePlanningInput, purpose: string): DataTransfer | undefined {
  const explicit = sortedBy(input.dataTransfers ?? [], (transfer) => `${transfer.adapterId}|${transfer.id}`).find((transfer) => transfer.adapterId === capability.adapterId)
  const destination = capability.destination ?? explicit?.destination
  if (!destination) return undefined
  return createDataTransfer({ schemaVersion: DATA_TRANSFER_SCHEMA_VERSION, id: explicit?.id ?? hashId('transfer', { adapterId: capability.adapterId, destination, purpose }), adapterId: capability.adapterId, destination, ...(explicit?.region ? { region: explicit.region } : {}), dataCategories: capability.dataCategories ?? explicit?.dataCategories ?? ['generated_image'], purpose, ...(explicit?.maximumBytes === undefined ? {} : { maximumBytes: explicit.maximumBytes }) })
}

function pipelineBudget(capability: RegisteredStepCapability, input: PipelinePlanningInput): Budget {
  const explicit = sortedBy(input.budgets ?? [], (budget) => budget.id).find((budget) => budget.id === capability.adapterId || budget.id === capability.id)
  const source = explicit ?? capability.budget ?? { schemaVersion: BUDGET_SCHEMA_VERSION, id: capability.adapterId, maximumCalls: capability.mayCreateChargedSubmission ? 1 : 1, maximumRetries: 0, timeoutMs: 60_000 }
  return createBudget({ ...source, schemaVersion: BUDGET_SCHEMA_VERSION })
}

function makePipelineStep(capability: RegisteredStepCapability, profile: ProviderCapabilityProfile, input: PipelinePlanningInput, dependsOn: string[], cleanupIds: string[], compensationIds: string[], inputRoles: string[], outputRoles: string[], purpose: string): PipelineStep | undefined {
  const transfer = pipelineDataTransfer(capability, input, purpose)
  if (!transfer) return undefined
  const versions = capabilityVersionPin(capability, profile)
  const budget = pipelineBudget(capability, input)
  const cancellation: CancellationPolicy = capability.cancellation ?? { cancellable: false, onCancel: 'continue' }
  const base: PipelineStep = {
    schemaVersion: PIPELINE_STEP_SCHEMA_VERSION,
    id: hashId('pipeline-step', { capability: capability.id, type: capability.type, adapterId: capability.adapterId, dependsOn, inputRoles, outputRoles }),
    type: capability.type,
    adapterId: capability.adapterId,
    adapterVersion: versions.adapterVersion,
    profileVersion: versions.profileVersion,
    inputArtifactRoles: sortedStrings(inputRoles),
    outputArtifactRoles: sortedStrings(outputRoles),
    dependsOn: sortedStrings(dependsOn),
    budget,
    dataTransfer: transfer,
    destination: transfer.destination,
    cancellation,
    cleanupObligationIds: sortedStrings(cleanupIds),
    compensationIds: sortedStrings(compensationIds),
    mayCreateChargedSubmission: capability.mayCreateChargedSubmission ?? false,
    capability: capability.capability,
  }
  return clone({ ...base, stepHash: computePipelineStepHash(base) })
}

function pipelineDependencies(steps: PipelineStep[]): StepDependency[] {
  const dependencies: StepDependency[] = []
  for (const step of steps) for (const parent of step.dependsOn) dependencies.push({ schemaVersion: STEP_DEPENDENCY_SCHEMA_VERSION, id: hashId('step-dependency', { fromStepId: parent, toStepId: step.id }), fromStepId: parent, toStepId: step.id, relation: 'depends_on' })
  return dependencies.map((dependency) => ({ ...dependency, dependencyHash: semanticHash(dependency, 'dependencyHash') })).sort((left, right) => compareCodeUnits(left.id, right.id))
}

function budgetValidationReasons(budget: Budget, requireHash = false): string[] {
  const reasons: string[] = []
  if (budget.schemaVersion !== BUDGET_SCHEMA_VERSION) reasons.push('BUDGET_SCHEMA_INVALID')
  if (!Number.isInteger(budget.maximumCalls) || budget.maximumCalls < 0) reasons.push('BUDGET_CALL_LIMIT_INVALID')
  if (!Number.isInteger(budget.maximumRetries) || budget.maximumRetries < 0) reasons.push('BUDGET_RETRY_LIMIT_INVALID')
  if (!Number.isInteger(budget.timeoutMs) || budget.timeoutMs <= 0) reasons.push('BUDGET_TIMEOUT_INVALID')
  if (budget.maximumCost !== undefined && (!Number.isFinite(budget.maximumCost) || budget.maximumCost < 0)) reasons.push('BUDGET_COST_INVALID')
  if (budget.maximumBytes !== undefined && (!Number.isInteger(budget.maximumBytes) || budget.maximumBytes < 0)) reasons.push('BUDGET_BYTES_INVALID')
  if (requireHash && !isHash(budget.budgetHash)) reasons.push('BUDGET_HASH_MISSING')
  else if (budget.budgetHash !== undefined && (!isHash(budget.budgetHash) || computeBudgetHash(budget) !== budget.budgetHash)) reasons.push('BUDGET_HASH_MISMATCH')
  return sortedStrings(reasons)
}

function dataTransferValidationReasons(transfer: DataTransfer, requireHash = false): string[] {
  const reasons: string[] = []
  if (transfer.schemaVersion !== DATA_TRANSFER_SCHEMA_VERSION) reasons.push('DATA_TRANSFER_SCHEMA_INVALID')
  if (!transfer.id || !transfer.adapterId || !transfer.destination || !transfer.purpose) reasons.push('DATA_TRANSFER_BINDING_INVALID')
  if (requireHash && !isHash(transfer.transferHash)) reasons.push('DATA_TRANSFER_HASH_MISSING')
  else if (transfer.transferHash !== undefined && (!isHash(transfer.transferHash) || computeDataTransferHash(transfer) !== transfer.transferHash)) reasons.push('DATA_TRANSFER_HASH_MISMATCH')
  if (transfer.maximumBytes !== undefined && (!Number.isInteger(transfer.maximumBytes) || transfer.maximumBytes < 0)) reasons.push('DATA_TRANSFER_BYTES_INVALID')
  return sortedStrings(reasons)
}

function capabilityValidationReasons(capability: RegisteredStepCapability): string[] {
  const reasons: string[] = []
  if (!isHash(capability.adapterDigest) || !isHash(capability.adapterVersion.digest)) reasons.push('ADAPTER_DIGEST_MISSING')
  if (capability.profileVersion && !isHash(capability.profileVersion.digest)) reasons.push('PROFILE_DIGEST_MISSING')
  if (capability.budget) reasons.push(...budgetValidationReasons(capability.budget))
  return sortedStrings(reasons)
}

function pipelineHasCycle(steps: PipelineStep[], dependencies: StepDependency[]): boolean {
  const ids = new Set(steps.map((step) => step.id))
  const edges = new Map<string, string[]>()
  for (const dependency of dependencies) {
    if (!ids.has(dependency.fromStepId) || !ids.has(dependency.toStepId)) return true
    edges.set(dependency.fromStepId, [...(edges.get(dependency.fromStepId) ?? []), dependency.toStepId])
  }
  const active = new Set<string>(); const visited = new Set<string>()
  const walk = (id: string): boolean => {
    if (active.has(id)) return true
    if (visited.has(id)) return false
    active.add(id)
    for (const child of edges.get(id) ?? []) if (walk(child)) return true
    active.delete(id); visited.add(id); return false
  }
  return [...ids].sort(compareCodeUnits).some(walk)
}

function pipelineResult(status: PipelinePlanningResult['status'], plan: PipelinePlan | undefined, blockedReasons: string[], warnings: string[]): PipelinePlanningResult {
  const base = { schemaVersion: PIPELINE_PLANNING_RESULT_SCHEMA_VERSION, status, ...(plan ? { pipelinePlan: plan } : {}), blockedReasons: sortedStrings(blockedReasons), warnings: sortedStrings(warnings) }
  return clone({ ...base, resultHash: sha256(jsonReady(base)) }) as PipelinePlanningResult
}

function blockedPipelinePlan(input: Partial<PipelinePlanningInput>, reasons: string[], warnings: string[] = []): PipelinePlan {
  const profile = input.profile
  const base: PipelinePlan = {
    schemaVersion: PIPELINE_PLAN_SCHEMA_VERSION,
    id: hashId('pipeline-plan', { caseId: input.caseId ?? 'unknown-case', caseRevision: input.caseRevision ?? 0, contextHash: input.contextHash ?? '', reasons: sortedStrings(reasons) }),
    caseId: input.caseId ?? 'unknown-case',
    caseRevision: input.caseRevision ?? 0,
    contextHash: input.contextHash ?? 'sha256:' + '0'.repeat(64),
    constraintSignature: input.constraintIR?.deterministicSignature ?? 'sha256:' + '0'.repeat(64),
    referencePlanHash: input.referencePlan?.planHash ?? 'sha256:' + '0'.repeat(64),
    outputContractHash: input.outputContract ? computeOutputContractHash(input.outputContract) : 'sha256:' + '0'.repeat(64),
    profileDigest: profile ? profileDigest(profile) : 'sha256:' + '0'.repeat(64),
    adapterDigests: [],
    steps: [],
    dependencies: [],
    budgets: [],
    dataTransfers: [],
    cleanup: [],
    compensation: [],
    warnings: sortedStrings(warnings),
    blockedReasons: sortedStrings(reasons),
    status: 'blocked',
    planHash: '',
  }
  base.planHash = computePipelinePlanHash(base)
  return clone(base)
}

export const MOCK_IMAGE_PROFILE: ProviderCapabilityProfile = (() => {
  const base: Omit<ProviderCapabilityProfile, 'profileHash'> = {
    schemaVersion: PROVIDER_CAPABILITY_PROFILE_SCHEMA_VERSION,
    id: 'mock-image',
    version: '1.0.0',
    versionSummary: 'Offline mock image generator with standard opaque PNG and JPEG output.',
    adapterId: 'mock.image-generator',
    adapterDigest: sha256({ fixture: 'mock-image-generator', version: '1.0.0' }),
    verificationStatus: 'verified',
    maximumReferenceCount: 8,
    maximumTotalReferenceBytes: 8_000_000,
    allowedReferenceMediaTypes: ['image/jpeg', 'image/png', 'image/webp'],
    referenceOrdering: 'role',
    referenceRoleOrder: ['identity', 'primary', 'detail', 'context'],
    supportsMultipleReferences: true,
    supportsEditing: true,
    supportsBatchOutput: false,
    outputMediaTypes: ['image/png', 'image/jpeg'],
    supportsTransparentOutput: false,
    supportsAlpha: false,
    knownIncompatibilities: [],
    timeoutMs: 120_000,
    streaming: true,
    destination: 'mock://generator',
    dataCategories: ['reference_image', 'prompt', 'generated_image'],
  }
  return { ...base, profileHash: computeProviderCapabilityProfileHash(base) }
})()

export const MOCK_JPEG_PROFILE: ProviderCapabilityProfile = (() => {
  const base: Omit<ProviderCapabilityProfile, 'profileHash'> = {
    schemaVersion: PROVIDER_CAPABILITY_PROFILE_SCHEMA_VERSION,
    id: 'mock-jpeg',
    version: '1.0.0',
    versionSummary: 'Offline mock generator that emits opaque JPEG.',
    adapterId: 'mock.jpeg-generator',
    adapterDigest: sha256({ fixture: 'mock-jpeg-generator', version: '1.0.0' }),
    verificationStatus: 'verified',
    maximumReferenceCount: 8,
    maximumTotalReferenceBytes: 8_000_000,
    allowedReferenceMediaTypes: ['image/jpeg', 'image/png'],
    referenceOrdering: 'stable',
    supportsMultipleReferences: true,
    supportsEditing: false,
    supportsBatchOutput: false,
    outputMediaTypes: ['image/jpeg'],
    supportsTransparentOutput: false,
    supportsAlpha: false,
    knownIncompatibilities: [],
    timeoutMs: 120_000,
    streaming: false,
    destination: 'mock://jpeg-generator',
    dataCategories: ['reference_image', 'prompt', 'generated_image'],
  }
  return { ...base, profileHash: computeProviderCapabilityProfileHash(base) }
})()

export const MOCK_LIMITED_REFERENCE_PROFILE: ProviderCapabilityProfile = (() => {
  const base: Omit<ProviderCapabilityProfile, 'profileHash'> = {
    schemaVersion: PROVIDER_CAPABILITY_PROFILE_SCHEMA_VERSION,
    id: 'mock-limited-reference',
    version: '1.0.0',
    versionSummary: 'Offline mock generator with a deliberately small reference count and byte budget.',
    adapterId: 'mock.limited-generator',
    adapterDigest: sha256({ fixture: 'mock-limited-generator', version: '1.0.0' }),
    verificationStatus: 'verified',
    maximumReferenceCount: 2,
    maximumTotalReferenceBytes: 1_000_000,
    maximumBytesPerReference: 700_000,
    allowedReferenceMediaTypes: ['image/png'],
    referenceOrdering: 'role',
    referenceRoleOrder: ['identity', 'primary', 'detail'],
    supportsMultipleReferences: true,
    supportsEditing: false,
    supportsBatchOutput: false,
    outputMediaTypes: ['image/png'],
    supportsTransparentOutput: false,
    supportsAlpha: false,
    knownIncompatibilities: [],
    timeoutMs: 90_000,
    streaming: false,
    destination: 'mock://limited-generator',
    dataCategories: ['reference_image', 'prompt'],
  }
  return { ...base, profileHash: computeProviderCapabilityProfileHash(base) }
})()

export const MOCK_PROVIDER_CAPABILITY_PROFILES = [MOCK_IMAGE_PROFILE, MOCK_JPEG_PROFILE, MOCK_LIMITED_REFERENCE_PROFILE]

export class CapabilityAwarePipelinePlanner {
  plan(input: PipelinePlanningInput): PipelinePlanningResult {
    try { return this.planSafe(clone(input)) } catch { return pipelineResult('blocked', blockedPipelinePlan(input ?? {}, ['PIPELINE_PLANNING_INPUT_INVALID']), ['PIPELINE_PLANNING_INPUT_INVALID'], []) }
  }

  private planSafe(input: PipelinePlanningInput): PipelinePlanningResult {
    const profileReasons = validProfile(input.profile)
    if (profileReasons.length) return pipelineResult('blocked', blockedPipelinePlan(input, profileReasons), profileReasons, [])
    if (!input.constraintIR || input.constraintIR.status !== 'ok' || constraintIRIntegrityReasons(input.constraintIR).length) return pipelineResult('blocked', blockedPipelinePlan(input, ['CONSTRAINT_IR_INVALID']), ['CONSTRAINT_IR_INVALID'], [])
    if (!input.referencePlan || input.referencePlan.status !== 'ok' || referencePlanIntegrityReasons(input.referencePlan).length) return pipelineResult('blocked', blockedPipelinePlan(input, ['REFERENCE_PLAN_INVALID']), ['REFERENCE_PLAN_INVALID'], [])
    if (input.referencePlan && input.referencePlan.profileDigest !== profileDigest(input.profile)) return pipelineResult('blocked', blockedPipelinePlan(input, ['REFERENCE_PROFILE_MISMATCH']), ['REFERENCE_PROFILE_MISMATCH'], [])
    if (input.contextHash !== input.constraintIR.contextHash || input.contextHash !== input.referencePlan.contextHash || input.caseId !== input.constraintIR.caseId || input.caseRevision !== input.constraintIR.caseRevision) return pipelineResult('blocked', blockedPipelinePlan(input, ['PLANNING_CONTEXT_MISMATCH']), ['PLANNING_CONTEXT_MISMATCH'], [])
    const output = profileOutput(input.profile)
    const targetTypes = targetMediaTypes(input.outputContract)
    const targetTransparent = input.outputContract.background === 'transparent'
    const capabilities = input.registeredCapabilities ? sortedBy(input.registeredCapabilities, (item) => `${item.type}|${item.id}`) : defaultCapabilities(input.profile)
    const generator = capabilityFor('generate', capabilities)
    const validator = capabilityFor('structural_validate', capabilities)
    const normalizer = capabilityFor('normalize', capabilities)
    const publisher = capabilityFor('publish_asset', capabilities)
    const resolver = capabilityFor('resolve_asset', capabilities)
    const reasons: string[] = []
    reasons.push(...conflictingObjectIds(capabilities, (item) => `${item.type}|${item.id}`, 'CAPABILITY_ID_COLLISION'))
    reasons.push(...conflictingObjectIds(input.budgets ?? [], (item) => item.id, 'BUDGET_ID_COLLISION'))
    reasons.push(...conflictingObjectIds(input.dataTransfers ?? [], (item) => item.id, 'DATA_TRANSFER_ID_COLLISION'))
    for (const budget of input.budgets ?? []) reasons.push(...budgetValidationReasons(budget, true))
    for (const transfer of input.dataTransfers ?? []) reasons.push(...dataTransferValidationReasons(transfer, true))
    const selectedCapabilities = [resolver, publisher, generator, normalizer, validator].filter((value): value is RegisteredStepCapability => Boolean(value))
    for (const capability of selectedCapabilities) reasons.push(...capabilityValidationReasons(capability))
    if (!generator) reasons.push('GENERATION_CAPABILITY_MISSING')
    if (!validator) reasons.push('STRUCTURAL_VALIDATOR_MISSING')
    if (!resolver) reasons.push('ASSET_RESOLUTION_CAPABILITY_MISSING')
    if (!input.outputContract.mediaTypes.length) reasons.push('OUTPUT_MEDIA_TYPE_MISSING')
    const native = targetTransparent && output.transparent && output.alpha && targetTypes.some((type) => output.mediaTypes.includes(type))
    const generatorMedia = generator?.outputMediaTypes ?? output.mediaTypes
    const directMedia = targetTypes.some((type) => generatorMedia.includes(type))
    const dimensions = input.outputContract.dimensions
    const dimensionsNeedNormalization = Boolean(dimensions && ((output.minimumWidth !== undefined && dimensions.width < output.minimumWidth) || (output.minimumHeight !== undefined && dimensions.height < output.minimumHeight) || (output.maximumWidth !== undefined && dimensions.width > output.maximumWidth) || (output.maximumHeight !== undefined && dimensions.height > output.maximumHeight)))
    const postprocessNeeded = dimensionsNeedNormalization || (!targetTransparent && !directMedia)
    if (targetTransparent && input.outputContract.allowAlpha === false) reasons.push('OUTPUT_ALPHA_CONTRACT_CONFLICT')
    if (targetTransparent && !native) reasons.push('TRANSPARENT_OUTPUT_UNSATISFIABLE')
    if (!targetTransparent && !directMedia && !normalizer) reasons.push('OUTPUT_FORMAT_UNSATISFIABLE')
    if (dimensionsNeedNormalization && !normalizer) reasons.push('OUTPUT_DIMENSION_UNSATISFIABLE')
    if (normalizer && postprocessNeeded && targetTransparent && (!normalizer.supportsAlpha || !(normalizer.outputMediaTypes ?? []).some((type) => targetTypes.includes(type)))) reasons.push('NORMALIZATION_ALPHA_OR_FORMAT_UNSUPPORTED')
    if (normalizer && dimensionsNeedNormalization && !(normalizer.outputMediaTypes ?? []).length) reasons.push('NORMALIZATION_CAPABILITY_INCOMPLETE')
    if (input.profile.knownIncompatibilities.some((code) => targetTransparent && (code === 'TRANSPARENT_OUTPUT_NOT_NATIVE' || code === 'TRANSPARENT_OUTPUT_UNSUPPORTED'))) reasons.push('KNOWN_CAPABILITY_GAP')
    if (reasons.length) return pipelineResult('blocked', blockedPipelinePlan(input, reasons), reasons, [])

    const temporaryPublication = referenceProfileLimits(input.profile).requiresPublishedReferences
    if (temporaryPublication && !publisher) return pipelineResult('blocked', blockedPipelinePlan(input, ['ASSET_PUBLICATION_CAPABILITY_MISSING']), ['ASSET_PUBLICATION_CAPABILITY_MISSING'], [])
    const cleanupBase: Cleanup = {
      schemaVersion: CLEANUP_SCHEMA_VERSION,
      id: hashId('cleanup', { caseId: input.caseId, profileId: input.profile.id, role: 'temporary-assets' }),
      cleanupHash: '',
      phase: 'finally',
      appliesToStepIds: [],
      conditions: ['always', 'on_failure_or_cancel', 'on_submission_unknown', 'on_worker_restart'],
      artifactRoles: temporaryPublication ? ['published_reference', 'temporary_intermediate'] : ['temporary_intermediate'],
      destination: temporaryPublication ? (publisher?.destination ?? 'local') : 'local',
      dataCategories: ['temporary_asset'],
      explanation: 'Cleanup remains a finally obligation after success, failure, cancellation, uncertain submission, or worker restart.',
    }
    const cleanup = { ...cleanupBase, cleanupHash: computeCleanupHash(cleanupBase) }
    const compensation: Compensation[] = []
    const steps: PipelineStep[] = []
    const addCompensation = (stepId: string, trigger: Compensation['trigger']): string => {
      const base: Compensation = { schemaVersion: COMPENSATION_SCHEMA_VERSION, id: hashId('compensation', { stepId, trigger, cleanupId: cleanup.id }), compensationHash: '', appliesToStepIds: [stepId], trigger, cleanupId: cleanup.id, explanation: 'Retain cleanup obligation; do not resubmit the uncertain or failed call.' }
      const value = { ...base, compensationHash: computeCompensationHash(base) }
      compensation.push(value)
      return value.id
    }
    const addStep = (capability: RegisteredStepCapability, dependsOn: string[], inputRoles: string[], outputRoles: string[], purpose: string): PipelineStep | undefined => {
      const provisionalId = hashId('pipeline-step', { capability: capability.id, type: capability.type, adapterId: capability.adapterId, dependsOn, inputRoles, outputRoles })
      const compensationIds = capability.mayCreateChargedSubmission ? ['failure', 'cancel', 'submission_unknown', 'worker_restart'].map((trigger) => addCompensation(provisionalId, trigger as Compensation['trigger'])) : []
      const step = makePipelineStep(capability, input.profile, input, dependsOn, [cleanup.id], compensationIds, inputRoles, outputRoles, purpose)
      if (step) {
        cleanup.appliesToStepIds.push(step.id)
        steps.push(step)
      }
      return step
    }
    const resolveStep = resolver ? addStep(resolver, [], ['reference'], ['provider-readable-reference'], 'resolve provider-readable reference') : undefined
    if (!resolveStep) reasons.push('ASSET_RESOLUTION_STEP_UNPLANNABLE')
    const previous = resolveStep ? [resolveStep.id] : []
    let publishStep: PipelineStep | undefined
    if (temporaryPublication && publisher) publishStep = addStep(publisher, previous, ['provider-readable-reference'], ['published-reference'], 'publish provider-readable reference for the selected profile')
    if (temporaryPublication && !publishStep) reasons.push('ASSET_PUBLICATION_STEP_UNPLANNABLE')
    const generationDepends = publishStep ? [publishStep.id] : previous
    const generation = generator ? addStep(generator, generationDepends, ['planned-reference', 'prompt'], ['generated-image'], 'generate source image') : undefined
    if (!generation) reasons.push('GENERATION_STEP_UNPLANNABLE')
    let last = generation
    const needsNormalize = Boolean(last && ((!targetTransparent && !directMedia) || dimensionsNeedNormalization))
    if (needsNormalize && normalizer && last) {
      const normalizeStep = addStep(normalizer, [last.id], ['generated-image'], ['normalized-image'], 'normalize format and dimensions')
      if (!normalizeStep) reasons.push('NORMALIZATION_STEP_UNPLANNABLE')
      last = normalizeStep
    }
    const validateDepends = last ? [last.id] : []
    const validationStep = validator ? addStep(validator, validateDepends, ['normalized-image', 'generated-image'], ['validated-output'], 'structural validate output contract') : undefined
    if (!validationStep) reasons.push('STRUCTURAL_VALIDATION_STEP_UNPLANNABLE')
    if (reasons.length) return pipelineResult('blocked', blockedPipelinePlan(input, reasons), reasons, [])
    cleanup.appliesToStepIds = sortedStrings(cleanup.appliesToStepIds)
    cleanup.cleanupHash = computeCleanupHash(cleanup)
    const dependencies = pipelineDependencies(steps)
    if (pipelineHasCycle(steps, dependencies)) return pipelineResult('blocked', blockedPipelinePlan(input, ['PIPELINE_DAG_CYCLE']), ['PIPELINE_DAG_CYCLE'], [])
    const stepBudgetReasons = steps.flatMap((step) => {
      const stepReasons = budgetValidationReasons(step.budget)
      if (step.budget.maximumCalls < 1) stepReasons.push('PIPELINE_BUDGET_CALLS_EXCEEDED')
      return stepReasons
    })
    if (stepBudgetReasons.length) return pipelineResult('blocked', blockedPipelinePlan(input, stepBudgetReasons), stepBudgetReasons, [])
    const uniqueTransfers = uniqueSortedObjects(steps.map((step) => step.dataTransfer), (item) => item.id)
    const budgets = uniqueSortedObjects(steps.map((step) => step.budget), (item) => item.id)
    const planBase: PipelinePlan = {
      schemaVersion: PIPELINE_PLAN_SCHEMA_VERSION,
      id: hashId('pipeline-plan', { caseId: input.caseId, caseRevision: input.caseRevision, contextHash: input.contextHash, constraintSignature: input.constraintIR.deterministicSignature, referencePlanHash: input.referencePlan.planHash, profileDigest: profileDigest(input.profile) }),
      caseId: input.caseId,
      caseRevision: input.caseRevision,
      contextHash: input.contextHash,
      constraintSignature: input.constraintIR.deterministicSignature,
      referencePlanHash: input.referencePlan.planHash,
      outputContractHash: computeOutputContractHash(input.outputContract),
      profileDigest: profileDigest(input.profile),
      adapterDigests: sortedStrings(steps.map((step) => step.adapterVersion.digest)),
      steps: sortedBy(steps, (step) => step.id),
      dependencies,
      budgets,
      dataTransfers: uniqueTransfers,
      cleanup: [cleanup],
      compensation: sortedBy(compensation, (item) => item.id),
      warnings: sortedStrings(temporaryPublication ? ['TEMPORARY_PUBLICATION_CLEANUP_REQUIRED'] : []),
      blockedReasons: [],
      status: 'ok',
      planHash: '',
    }
    planBase.planHash = computePipelinePlanHash(planBase)
    return pipelineResult('ok', clone(planBase), [], planBase.warnings)
  }
}

export const DeterministicCapabilityAwarePipelinePlanner = CapabilityAwarePipelinePlanner

export function planPipeline(input: PipelinePlanningInput): PipelinePlanningResult {
  return new CapabilityAwarePipelinePlanner().plan(input)
}

export function planCapabilityAwarePipeline(input: PipelinePlanningInput): PipelinePlanningResult {
  return planPipeline(input)
}

function expired(expiresAt: string | undefined, now: string): boolean {
  if (!expiresAt) return false
  const expiry = Date.parse(expiresAt); const current = Date.parse(now)
  return !Number.isFinite(expiry) || !Number.isFinite(current) || current >= expiry
}

function validString(value: unknown): boolean {
  return typeof value === 'string' && value.length > 0
}

function validDate(value: unknown): boolean {
  return typeof value === 'string' && value.length > 0 && Number.isFinite(Date.parse(value))
}

function validNonNegativeInteger(value: unknown): boolean {
  return typeof value === 'number' && Number.isInteger(value) && value >= 0
}

function validPositiveInteger(value: unknown): boolean {
  return typeof value === 'number' && Number.isInteger(value) && value > 0
}

function validNonNegativeNumber(value: unknown): boolean {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0
}

function validStringArray(value: unknown): boolean {
  return Array.isArray(value) && value.every((item) => validString(item))
}

function validHashArray(value: unknown): boolean {
  return Array.isArray(value) && value.every((item) => isHash(item))
}

function authorizationFieldReasons(field: string, value: unknown, validator: (value: unknown) => boolean, required = true): string[] {
  if (value === undefined) return required ? [`AUTHORIZATION_FIELD_MISSING:${field}`] : []
  return validator(value) ? [] : [`AUTHORIZATION_FIELD_INVALID:${field}`]
}

function remoteAuthorizationCompletenessReasons(authorization: RemoteCallAuthorization): string[] {
  const reasons: string[] = []
  const requireField = (field: string, value: unknown, validator: (value: unknown) => boolean): void => { reasons.push(...authorizationFieldReasons(field, value, validator)) }
  const optionalField = (field: string, value: unknown, validator: (value: unknown) => boolean): void => { reasons.push(...authorizationFieldReasons(field, value, validator, false)) }
  requireField('schemaVersion', authorization.schemaVersion, (value) => value === REMOTE_CALL_AUTHORIZATION_SCHEMA_VERSION)
  requireField('id', authorization.id, validString)
  requireField('caseId', authorization.caseId, validString)
  requireField('caseRevision', authorization.caseRevision, validNonNegativeInteger)
  requireField('contextHash', authorization.contextHash, isHash)
  requireField('stepId', authorization.stepId, validString)
  requireField('purpose', authorization.purpose, (value) => ['intent_interpretation', 'reference_interpretation', 'prompt_optimization', 'generation', 'postprocessing', 'semantic_review', 'asset_publication'].includes(value as string))
  requireField('inputHash', authorization.inputHash, isHash)
  requireField('permittedArtifactHashes', authorization.permittedArtifactHashes, validHashArray)
  requireField('permittedScopeIds', authorization.permittedScopeIds, validStringArray)
  requireField('constraintIds', authorization.constraintIds, validStringArray)
  requireField('adapterId', authorization.adapterId, validString)
  requireField('adapterDigest', authorization.adapterDigest, isHash)
  requireField('destination', authorization.destination, validString)
  requireField('dataCategories', authorization.dataCategories, validStringArray)
  requireField('maximumCalls', authorization.maximumCalls, validNonNegativeInteger)
  requireField('maximumRetries', authorization.maximumRetries, validNonNegativeInteger)
  requireField('timeoutMs', authorization.timeoutMs, validPositiveInteger)
  requireField('idempotencyKey', authorization.idempotencyKey, validString)
  requireField('authority', authorization.authority, validString)
  requireField('authorizedBy', authorization.authorizedBy, validString)
  requireField('authorizedAt', authorization.authorizedAt, validDate)
  requireField('authorizationHash', authorization.authorizationHash, isHash)
  optionalField('inputManifestHash', authorization.inputManifestHash, isHash)
  optionalField('modelId', authorization.modelId, validString)
  optionalField('modelVersion', authorization.modelVersion, validString)
  optionalField('profileDigest', authorization.profileDigest, isHash)
  optionalField('region', authorization.region, validString)
  optionalField('maximumBytes', authorization.maximumBytes, validNonNegativeInteger)
  optionalField('maximumCost', authorization.maximumCost, validNonNegativeNumber)
  optionalField('currency', authorization.currency, validString)
  optionalField('expiresAt', authorization.expiresAt, validDate)
  return sortedStrings(reasons)
}

function executionAuthorizationCompletenessReasons(authorization: ExecutionAuthorization): string[] {
  const reasons: string[] = []
  const requireField = (field: string, value: unknown, validator: (value: unknown) => boolean): void => { reasons.push(...authorizationFieldReasons(field, value, validator)) }
  const optionalField = (field: string, value: unknown, validator: (value: unknown) => boolean): void => { reasons.push(...authorizationFieldReasons(field, value, validator, false)) }
  requireField('schemaVersion', authorization.schemaVersion, (value) => value === EXECUTION_AUTHORIZATION_SCHEMA_VERSION)
  requireField('id', authorization.id, validString)
  requireField('caseId', authorization.caseId, validString)
  requireField('caseRevision', authorization.caseRevision, validNonNegativeInteger)
  requireField('contextHash', authorization.contextHash, isHash)
  requireField('constraintIRHash', authorization.constraintIRHash, isHash)
  requireField('compilationSignature', authorization.compilationSignature, isHash)
  requireField('referencePlanHash', authorization.referencePlanHash, isHash)
  requireField('pipelinePlanHash', authorization.pipelinePlanHash, isHash)
  requireField('outputContractHash', authorization.outputContractHash, isHash)
  requireField('adapterProfileDigests', authorization.adapterProfileDigests, validHashArray)
  requireField('destinations', authorization.destinations, validStringArray)
  requireField('dataTransferDigest', authorization.dataTransferDigest, isHash)
  requireField('budgetDigest', authorization.budgetDigest, isHash)
  requireField('remoteCallAuthorizationIds', authorization.remoteCallAuthorizationIds, validStringArray)
  requireField('authority', authorization.authority, validString)
  requireField('authorizedBy', authorization.authorizedBy, validString)
  requireField('authorizedAt', authorization.authorizedAt, validDate)
  requireField('authorizationHash', authorization.authorizationHash, isHash)
  optionalField('promptArtifactHash', authorization.promptArtifactHash, isHash)
  optionalField('expiresAt', authorization.expiresAt, validDate)
  return sortedStrings(reasons)
}

function sameSnapshotValue(left: unknown, right: unknown): boolean {
  return canonicalize(jsonReady(left)) === canonicalize(jsonReady(right))
}

function requiredSnapshotField(mismatches: string[], snapshot: DispatchSnapshot, field: keyof DispatchSnapshot, expected: unknown): void {
  const name = String(field)
  if (expected === undefined) {
    mismatches.push(`AUTHORIZATION_FIELD_MISSING:${name}`)
  } else if (snapshot[field] === undefined) {
    mismatches.push(`SNAPSHOT_FIELD_MISSING:${name}`)
  } else if (!sameSnapshotValue(snapshot[field], expected)) {
    mismatches.push(`SNAPSHOT_FIELD_MISMATCH:${name}`)
  }
}

function optionalSnapshotField(mismatches: string[], snapshot: DispatchSnapshot, field: keyof DispatchSnapshot, expected: unknown): void {
  const name = String(field)
  const actual = snapshot[field]
  if (expected === undefined && actual === undefined) return
  if (expected === undefined) {
    mismatches.push(`SNAPSHOT_FIELD_UNEXPECTED:${name}`)
  } else if (actual === undefined) {
    mismatches.push(`SNAPSHOT_FIELD_MISSING:${name}`)
  } else if (!sameSnapshotValue(actual, expected)) {
    mismatches.push(`SNAPSHOT_FIELD_MISMATCH:${name}`)
  }
}

function remoteSnapshotMismatches(authorization: RemoteCallAuthorization, snapshot: DispatchSnapshot): string[] {
  const mismatches: string[] = []
  const required: Array<[keyof DispatchSnapshot, unknown]> = [
    ['kind', 'remote_call'],
    ['caseId', authorization.caseId],
    ['caseRevision', authorization.caseRevision],
    ['contextHash', authorization.contextHash],
    ['stepId', authorization.stepId],
    ['purpose', authorization.purpose],
    ['inputHash', authorization.inputHash],
    ['permittedArtifactHashes', sortedStrings(authorization.permittedArtifactHashes)],
    ['permittedScopeIds', sortedStrings(authorization.permittedScopeIds)],
    ['constraintIds', sortedStrings(authorization.constraintIds)],
    ['adapterId', authorization.adapterId],
    ['adapterDigest', authorization.adapterDigest],
    ['destination', authorization.destination],
    ['dataCategories', sortedStrings(authorization.dataCategories)],
    ['maximumCalls', authorization.maximumCalls],
    ['maximumRetries', authorization.maximumRetries],
    ['timeoutMs', authorization.timeoutMs],
    ['idempotencyKey', authorization.idempotencyKey],
  ]
  for (const [field, expected] of required) requiredSnapshotField(mismatches, snapshot, field, expected)
  const optional: Array<[keyof DispatchSnapshot, unknown]> = [
    ['inputManifestHash', authorization.inputManifestHash],
    ['modelId', authorization.modelId],
    ['modelVersion', authorization.modelVersion],
    ['profileDigest', authorization.profileDigest],
    ['region', authorization.region],
    ['maximumBytes', authorization.maximumBytes],
    ['maximumCost', authorization.maximumCost],
    ['currency', authorization.currency],
  ]
  for (const [field, expected] of optional) optionalSnapshotField(mismatches, snapshot, field, expected)
  return sortedStrings(mismatches)
}

function executionSnapshotMismatches(authorization: ExecutionAuthorization, snapshot: DispatchSnapshot): string[] {
  const mismatches: string[] = []
  const required: Array<[keyof DispatchSnapshot, unknown]> = [
    ['kind', 'execution'],
    ['caseId', authorization.caseId],
    ['caseRevision', authorization.caseRevision],
    ['contextHash', authorization.contextHash],
    ['constraintIRHash', authorization.constraintIRHash],
    ['compilationSignature', authorization.compilationSignature],
    ['referencePlanHash', authorization.referencePlanHash],
    ['pipelinePlanHash', authorization.pipelinePlanHash],
    ['outputContractHash', authorization.outputContractHash],
    ['adapterProfileDigests', sortedStrings(authorization.adapterProfileDigests)],
    ['destinations', sortedStrings(authorization.destinations)],
    ['dataTransferDigest', authorization.dataTransferDigest],
    ['budgetDigest', authorization.budgetDigest],
    ['remoteCallAuthorizationIds', sortedStrings(authorization.remoteCallAuthorizationIds)],
  ]
  for (const [field, expected] of required) requiredSnapshotField(mismatches, snapshot, field, expected)
  optionalSnapshotField(mismatches, snapshot, 'promptArtifactHash', authorization.promptArtifactHash)
  return sortedStrings(mismatches)
}

export function dispatchPreflight(authorization: RemoteCallAuthorization | ExecutionAuthorization, snapshot: DispatchSnapshot, now = FIXED_M4_TIME): DispatchPreflightResult {
  try {
    const authorizationHash = typeof authorization?.authorizationHash === 'string' ? authorization.authorizationHash : ''
    const isRemote = authorization?.schemaVersion === REMOTE_CALL_AUTHORIZATION_SCHEMA_VERSION
    const isExecution = authorization?.schemaVersion === EXECUTION_AUTHORIZATION_SCHEMA_VERSION
    if (!isRemote && !isExecution) return { status: 'blocked', code: 'EXECUTION_NOT_AUTHORIZED', reasons: ['AUTHORIZATION_SCHEMA_INVALID'], authorizationHash }
    const completenessReasons = isRemote ? remoteAuthorizationCompletenessReasons(authorization as RemoteCallAuthorization) : executionAuthorizationCompletenessReasons(authorization as ExecutionAuthorization)
    if (completenessReasons.length) return { status: 'blocked', code: 'EXECUTION_NOT_AUTHORIZED', reasons: completenessReasons, authorizationHash }
    const hashValid = isRemote ? computeRemoteCallAuthorizationHash(authorization as RemoteCallAuthorization) === authorization.authorizationHash : computeExecutionAuthorizationHash(authorization as ExecutionAuthorization) === authorization.authorizationHash
    if (!hashValid) return { status: 'blocked', code: 'EXECUTION_NOT_AUTHORIZED', reasons: ['AUTHORIZATION_HASH_MISMATCH'], authorizationHash }
    if (expired(authorization.expiresAt, now)) return { status: 'blocked', code: 'AUTHORIZATION_STALE', reasons: ['AUTHORIZATION_EXPIRED'], authorizationHash }
    const reasons = isRemote ? remoteSnapshotMismatches(authorization as RemoteCallAuthorization, snapshot) : executionSnapshotMismatches(authorization as ExecutionAuthorization, snapshot)
    if (reasons.length) return { status: 'blocked', code: 'AUTHORIZATION_STALE', reasons, authorizationHash }
    return { status: 'authorized', code: 'AUTHORIZED', reasons: [], authorizationHash }
  } catch {
    return { status: 'blocked', code: 'EXECUTION_NOT_AUTHORIZED', reasons: ['PREFLIGHT_INPUT_INVALID'], authorizationHash: typeof authorization?.authorizationHash === 'string' ? authorization.authorizationHash : '' }
  }
}

export const preflightDispatch = dispatchPreflight
export const dispatchPreflightPure = dispatchPreflight

function explainEntry(value: Omit<ExplainEntry, 'id'>): ExplainEntry {
  const normalized = { ...value, sourceIds: sortedStrings(value.sourceIds), ruleIds: sortedStrings(value.ruleIds), constraintIds: sortedStrings(value.constraintIds), decisionIds: sortedStrings(value.decisionIds), assetIds: sortedStrings(value.assetIds) }
  return { ...clone(normalized), id: hashId('explain-entry', normalized) }
}

function finalExplain(kind: ExplainResult['artifactKind'], id: string, artifactHash: string, entries: ExplainEntry[], status: ExplainResult['status']): ExplainResult {
  const base = { schemaVersion: EXPLAIN_RESULT_SCHEMA_VERSION, artifactKind: kind, artifactId: id, artifactHash, entries: sortedBy(entries, (entry) => entry.id), status }
  return clone({ ...base, explainHash: sha256(jsonReady(base)) }) as ExplainResult
}

export function explainConstraintIR(ir: ConstraintIR): ExplainResult {
  const entries: ExplainEntry[] = []
  for (const goal of ir.goals) entries.push(explainEntry({ kind: 'constraint', sourceIds: goal.sourceIds, ruleIds: [], constraintIds: goal.constraintIds, decisionIds: [], assetIds: [], reasonCode: 'GOAL', message: goal.explanation }))
  for (const constraint of ir.constraints) entries.push(explainEntry({ kind: 'constraint', sourceIds: constraint.sourceIds, ruleIds: constraint.ruleId ? [constraint.ruleId] : [], constraintIds: [constraint.id], decisionIds: [], assetIds: [], reasonCode: constraint.reasonCode, message: constraint.explanation }))
  for (const conflict of ir.conflicts) entries.push(explainEntry({ kind: 'conflict', sourceIds: [], ruleIds: [], constraintIds: conflict.constraintIds, decisionIds: [], assetIds: [], reasonCode: conflict.code, message: conflict.message }))
  for (const degradation of ir.degradedPreferences) entries.push(explainEntry({ kind: 'degradation', sourceIds: [], ruleIds: [], constraintIds: degradation.constraintId ? [degradation.constraintId] : [], decisionIds: [], assetIds: [], reasonCode: degradation.reasonCode, message: degradation.explanation }))
  for (const trace of ir.ruleTraces) entries.push(explainEntry({ kind: 'rule', sourceIds: trace.inputIds, ruleIds: [trace.ruleId], constraintIds: trace.outputIds, decisionIds: [], assetIds: [], reasonCode: trace.reasonCode, message: trace.message }))
  return finalExplain('constraint-ir', ir.id, ir.deterministicSignature, entries, ir.status)
}

export function explainReferencePlan(plan: ReferencePlan): ExplainResult {
  const entries: ExplainEntry[] = []
  for (const reference of plan.ordered) entries.push(explainEntry({ kind: 'asset', sourceIds: reference.sourceBindingIds, ruleIds: [], constraintIds: reference.constraintIds, decisionIds: [], assetIds: [reference.assetId], reasonCode: 'REFERENCE_SELECTED', message: `${reference.label} selected for role ${reference.role}.` }))
  for (const omission of [...plan.omitted, ...plan.blockedReferences]) entries.push(explainEntry({ kind: 'asset', sourceIds: [], ruleIds: [], constraintIds: omission.constraintIds, decisionIds: [], assetIds: [omission.assetId], reasonCode: omission.reasonCode, message: omission.impact }))
  return finalExplain('reference-plan', plan.id, plan.planHash, entries, plan.status)
}

export function explainPipelinePlan(plan: PipelinePlan): ExplainResult {
  const entries: ExplainEntry[] = []
  for (const step of plan.steps) entries.push(explainEntry({ kind: 'step', sourceIds: [], ruleIds: [], constraintIds: [], decisionIds: [], assetIds: [], reasonCode: step.capability, message: `${step.type} uses ${step.adapterId} at ${step.destination}.` }))
  for (const cleanup of plan.cleanup) entries.push(explainEntry({ kind: 'step', sourceIds: [], ruleIds: [], constraintIds: [], decisionIds: [], assetIds: [], reasonCode: 'CLEANUP_FINALLY', message: cleanup.explanation }))
  for (const reason of plan.blockedReasons) entries.push(explainEntry({ kind: 'conflict', sourceIds: [], ruleIds: [], constraintIds: [], decisionIds: [], assetIds: [], reasonCode: reason, message: reason }))
  return finalExplain('pipeline-plan', plan.id, plan.planHash, entries, plan.status)
}

function semanticRecord(value: unknown): JsonValue {
  const object = objectOf(value)
  for (const field of ['constraintHash', 'goalHash', 'dependencyHash', 'resourceHash', 'conflictHash', 'degradationHash', 'traceHash', 'candidateHash', 'omissionHash', 'profileHash', 'budgetHash', 'transferHash', 'cleanupHash', 'compensationHash', 'stepHash', 'planHash', 'authorizationHash', 'explainHash', 'diffHash', 'resultHash']) delete object[field]
  delete object.authorizedAt; delete object.expiresAt
  return object
}

function recordsFor(kind: SemanticDiff['artifactKind'], value: ConstraintIR | ReferencePlan | PipelinePlan): Map<string, JsonValue> {
  const result = new Map<string, JsonValue>()
  if (kind === 'constraint-ir') {
    const ir = value as ConstraintIR
    for (const item of ir.goals) result.set(`goal:${item.id}`, semanticRecord(item))
    for (const item of ir.constraints) result.set(`constraint:${item.id}`, semanticRecord(item))
    for (const item of ir.dependencies) result.set(`dependency:${item.id}`, semanticRecord(item))
    for (const item of ir.resourceClaims) result.set(`resource:${item.id}`, semanticRecord(item))
    for (const item of ir.conflicts) result.set(`conflict:${item.id}`, semanticRecord(item))
    for (const item of ir.degradedPreferences) result.set(`degradation:${item.id}`, semanticRecord(item))
    for (const item of ir.ruleTraces) result.set(`trace:${item.id}`, semanticRecord(item))
  } else if (kind === 'reference-plan') {
    const plan = value as ReferencePlan
    for (const item of plan.ordered) result.set(`reference:${item.candidateId}`, semanticRecord(item))
    for (const item of plan.omitted) result.set(`omitted:${item.candidateId}`, semanticRecord(item))
    for (const item of plan.blockedReferences) result.set(`blocked:${item.candidateId}`, semanticRecord(item))
  } else {
    const plan = value as PipelinePlan
    for (const item of plan.steps) result.set(`step:${item.id}`, semanticRecord(item))
    for (const item of plan.dependencies) result.set(`dependency:${item.id}`, semanticRecord(item))
    for (const item of plan.cleanup) result.set(`cleanup:${item.id}`, semanticRecord(item))
    for (const item of plan.compensation) result.set(`compensation:${item.id}`, semanticRecord(item))
  }
  return result
}

function artifactHash(kind: SemanticDiff['artifactKind'], value: ConstraintIR | ReferencePlan | PipelinePlan): string {
  if (kind === 'constraint-ir') return (value as ConstraintIR).deterministicSignature
  if (kind === 'reference-plan') return (value as ReferencePlan).planHash
  return (value as PipelinePlan).planHash
}

function statusOf(kind: SemanticDiff['artifactKind'], value: ConstraintIR | ReferencePlan | PipelinePlan): string {
  return value.status
}

export function semanticDiff(kind: SemanticDiff['artifactKind'], before: ConstraintIR | ReferencePlan | PipelinePlan, after: ConstraintIR | ReferencePlan | PipelinePlan): SemanticDiff {
  const beforeRecords = recordsFor(kind, before); const afterRecords = recordsFor(kind, after)
  const added: string[] = []; const removed: string[] = []; const changed: SemanticDiffChange[] = []
  for (const id of [...afterRecords.keys()].sort(compareCodeUnits)) {
    if (!beforeRecords.has(id)) added.push(id)
    else if (canonicalize(beforeRecords.get(id)!) !== canonicalize(afterRecords.get(id)!)) changed.push({ id, before: beforeRecords.get(id), after: afterRecords.get(id), reasonCode: 'SEMANTIC_FIELD_CHANGED' })
  }
  for (const id of [...beforeRecords.keys()].sort(compareCodeUnits)) if (!afterRecords.has(id)) removed.push(id)
  const degraded = kind === 'constraint-ir' ? (after as ConstraintIR).degradedPreferences.map((item) => item.id).sort(compareCodeUnits) : kind === 'reference-plan' ? (after as ReferencePlan).omitted.map((item) => item.id).sort(compareCodeUnits) : []
  const blocked = [statusOf(kind, after) === 'blocked' ? 'artifact' : '', ...(kind === 'constraint-ir' ? (after as ConstraintIR).conflicts.filter((item) => item.blocking).map((item) => item.id) : kind === 'reference-plan' ? (after as ReferencePlan).blockedReferences.map((item) => item.id) : (after as PipelinePlan).blockedReasons)].filter(Boolean).sort(compareCodeUnits)
  const base = { schemaVersion: SEMANTIC_DIFF_SCHEMA_VERSION, artifactKind: kind, beforeHash: artifactHash(kind, before), afterHash: artifactHash(kind, after), added: sortedStrings(added), removed: sortedStrings(removed), changed: sortedBy(changed, (item) => item.id), degraded, blocked }
  return clone({ ...base, diffHash: sha256(jsonReady(base)) }) as SemanticDiff
}

export function diffConstraintIR(before: ConstraintIR, after: ConstraintIR): SemanticDiff { return semanticDiff('constraint-ir', before, after) }
export function diffReferencePlan(before: ReferencePlan, after: ReferencePlan): SemanticDiff { return semanticDiff('reference-plan', before, after) }
export function diffPipelinePlan(before: PipelinePlan, after: PipelinePlan): SemanticDiff { return semanticDiff('pipeline-plan', before, after) }
