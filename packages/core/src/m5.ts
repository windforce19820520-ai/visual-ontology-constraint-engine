import type {
  ArtifactHandle,
  ArtifactReplayResult,
  Budget,
  CompilationContext,
  Compensation,
  CompensationReceipt,
  Constraint,
  ConstraintIR,
  Cleanup,
  CleanupReceipt,
  DataTransfer,
  Evaluation,
  ExecutionAuthorization,
  ExecutionRun,
  ExecutionRunState,
  ExecutionTraceProjection,
  HumanAcceptance,
  JsonObject,
  JsonValue,
  PipelinePlan,
  PipelineStep,
  PlannedReference,
  PromptCandidateIR,
  PromptCompilationInput,
  PromptConstraintCoverage,
  PromptFreeTextTransformation,
  PromptGuardFinding,
  PromptGuardInput,
  PromptGuardResult,
  PromptIR,
  PromptOptimizationInput,
  PromptOptimizer,
  PromptParameter,
  PromptProhibition,
  PromptReferenceMapping,
  PromptSection,
  PromptTransformation,
  ProviderAdapter,
  ProviderCapabilityProfile,
  ProviderRenderRequest,
  ProviderRenderResult,
  ReferencePlan,
  RemoteCallRun,
  RemoteCallAuthorization,
  StepEvent,
  StepEventState,
  StepReceipt,
  VersionPin,
} from '@voce-engine/contracts'
import {
  ARTIFACT_REPLAY_RESULT_SCHEMA_VERSION,
  BINDING_DECISION_SCHEMA_VERSION,
  CLEANUP_RECEIPT_SCHEMA_VERSION,
  COMPENSATION_RECEIPT_SCHEMA_VERSION,
  EXECUTION_RUN_SCHEMA_VERSION,
  EXECUTION_TRACE_SCHEMA_VERSION,
  EVALUATION_SCHEMA_VERSION,
  HUMAN_ACCEPTANCE_SCHEMA_VERSION,
  PIPELINE_PLAN_SCHEMA_VERSION,
  PROMPT_CANDIDATE_IR_SCHEMA_VERSION,
  PROMPT_COMPILATION_INPUT_SCHEMA_VERSION,
  PROMPT_CONSTRAINT_COVERAGE_SCHEMA_VERSION,
  PROMPT_GUARD_FINDING_SCHEMA_VERSION,
  PROMPT_GUARD_RESULT_SCHEMA_VERSION,
  PROMPT_IR_SCHEMA_VERSION,
  PROMPT_OPTIMIZATION_INPUT_SCHEMA_VERSION,
  PROMPT_PARAMETER_SCHEMA_VERSION,
  PROMPT_REFERENCE_MAPPING_SCHEMA_VERSION,
  PROMPT_SECTION_SCHEMA_VERSION,
  PROMPT_TRANSFORMATION_SCHEMA_VERSION,
  PROVIDER_RENDER_REQUEST_SCHEMA_VERSION,
  PROVIDER_RENDER_RESULT_SCHEMA_VERSION,
  REMOTE_CALL_RUN_SCHEMA_VERSION,
  STEP_EVENT_SCHEMA_VERSION,
  STEP_RECEIPT_SCHEMA_VERSION,
} from '@voce-engine/contracts'
import {
  computeBudgetHash,
  computeCompilationContextHash,
  computeConstraintConflictHash,
  computeConstraintDependencyHash,
  computeConstraintHash,
  computeConstraintIRSignature,
  computeDataTransferHash,
  computeDegradationHash,
  computeExecutionAuthorizationHash,
  computeGoalHash,
  computeOutputContractHash,
  computePipelinePlanHash,
  computePipelineStepHash,
  computeReferenceDependencyHash,
  computeReferenceOmissionHash,
  computeReferencePlanHash,
  computeRemoteCallAuthorizationHash,
  computeResourceClaimHash,
  computeReviewRequirementHash,
  computeRuleTraceHash,
  dispatchPreflight,
} from './m4.js'
import { canonicalize, sha256 } from './canonical.js'

export const PROMPT_COMPILER_VERSION = 'voce.prompt-compiler/v1alpha1'
export const PROMPT_OPTIMIZER_VERSION = 'voce.deterministic-prompt-optimizer/v1alpha1'
export const PROMPT_GUARD_VERSION = 'voce.prompt-guard/v1alpha1'
export const MOCK_PROVIDER_ADAPTER_VERSION = 'voce.mock-provider-adapter/v1alpha1'
export const EXECUTION_RUNTIME_VERSION = 'voce.offline-execution-runtime/v1alpha1'
export const FIXED_M5_TIME = '2026-01-01T00:00:00.000Z'

const HASH_PATTERN = /^sha256:[0-9a-f]{64}$/

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

function sortedStrings(values: string[] | undefined): string[] {
  return [...new Set(values ?? [])].sort(compareCodeUnits)
}

function sortedBy<T>(values: T[], key: (value: T) => string): T[] {
  return values.map((value) => clone(value)).sort((left, right) => compareCodeUnits(key(left), key(right)) || compareCodeUnits(canonicalize(jsonReady(left)), canonicalize(jsonReady(right))))
}

function isHash(value: unknown): value is string {
  return typeof value === 'string' && HASH_PATTERN.test(value)
}

function hashId(prefix: string, value: unknown): string {
  return `${prefix}-${sha256(jsonReady(value)).slice('sha256:'.length, 'sha256:'.length + 24)}`
}

function objectOf(value: unknown): JsonObject {
  const ready = jsonReady(value)
  return ready !== null && typeof ready === 'object' && !Array.isArray(ready) ? ready as JsonObject : {}
}

function without<T extends Record<string, unknown>>(value: T, field: string): JsonObject {
  const result = objectOf(value)
  delete result[field]
  return result
}

function semanticHash<T extends Record<string, unknown>>(value: T, field: string): string {
  return sha256(without(value, field))
}

function promptSectionProjection(section: PromptSection): JsonObject {
  return jsonReady({
    schemaVersion: PROMPT_SECTION_SCHEMA_VERSION,
    id: section.id,
    kind: section.kind,
    priority: section.priority,
    order: section.order,
    content: section.content,
    ...(section.text === undefined ? {} : { text: section.text }),
    constraintIds: sortedStrings(section.constraintIds),
    sourceIds: sortedStrings(section.sourceIds),
    decisionIds: sortedStrings(section.decisionIds),
    assetIds: sortedStrings(section.assetIds),
    importance: section.importance,
    mutability: section.mutability,
    ...(section.locked === undefined ? {} : { locked: section.locked }),
    ...(section.slotId === undefined ? {} : { slotId: section.slotId }),
  }) as JsonObject
}

function promptParameterProjection(parameter: PromptParameter): JsonObject {
  return jsonReady({
    schemaVersion: PROMPT_PARAMETER_SCHEMA_VERSION,
    id: parameter.id,
    name: parameter.name,
    value: clone(parameter.value),
    valueType: parameter.valueType,
    required: parameter.required,
    mutability: parameter.mutability,
    ...(parameter.bounds === undefined ? {} : { bounds: clone(parameter.bounds) }),
    constraintIds: sortedStrings(parameter.constraintIds),
    sourceIds: sortedStrings(parameter.sourceIds),
    decisionIds: sortedStrings(parameter.decisionIds),
    ...(parameter.provenance === undefined ? {} : { provenance: clone(parameter.provenance) }),
    ...(parameter.type === undefined ? {} : { type: parameter.type }),
    ...(parameter.minimum === undefined ? {} : { minimum: parameter.minimum }),
    ...(parameter.maximum === undefined ? {} : { maximum: parameter.maximum }),
    ...(parameter.allowedValues === undefined ? {} : { allowedValues: clone(parameter.allowedValues) }),
  }) as JsonObject
}

function promptReferenceMappingProjection(mapping: PromptReferenceMapping): JsonObject {
  return jsonReady({
    schemaVersion: PROMPT_REFERENCE_MAPPING_SCHEMA_VERSION,
    id: mapping.id,
    plannedReferenceId: mapping.plannedReferenceId,
    ...(mapping.referenceId === undefined ? {} : { referenceId: mapping.referenceId }),
    assetId: mapping.assetId,
    contentHash: mapping.contentHash,
    label: mapping.label,
    role: mapping.role,
    order: mapping.order,
    required: mapping.required,
    constraintIds: sortedStrings(mapping.constraintIds),
    sourceBindingIds: sortedStrings(mapping.sourceBindingIds),
    decisionIds: sortedStrings(mapping.decisionIds),
  }) as JsonObject
}

function promptCoverageProjection(coverage: PromptConstraintCoverage): JsonObject {
  return jsonReady({
    schemaVersion: PROMPT_CONSTRAINT_COVERAGE_SCHEMA_VERSION,
    constraintId: coverage.constraintId,
    sectionIds: sortedStrings(coverage.sectionIds),
    parameterIds: sortedStrings(coverage.parameterIds),
    referenceMappingIds: sortedStrings(coverage.referenceMappingIds),
    locked: coverage.locked,
  }) as JsonObject
}

function normalizedPromptIRProjection(prompt: PromptIR): JsonObject {
  return jsonReady({
    schemaVersion: PROMPT_IR_SCHEMA_VERSION,
    id: prompt.id,
    caseId: prompt.caseId,
    caseRevision: prompt.caseRevision,
    contextHash: prompt.contextHash,
    compilationSignature: prompt.compilationSignature,
    constraintIRHash: prompt.constraintIRHash,
    referencePlanHash: prompt.referencePlanHash,
    pipelinePlanHash: prompt.pipelinePlanHash,
    outputContractHash: prompt.outputContractHash,
    targetAdapter: clone(prompt.targetAdapter),
    targetCapabilityProfile: clone(prompt.targetCapabilityProfile),
    objective: prompt.objective,
    positiveDescription: prompt.positiveDescription,
    sections: [...prompt.sections].sort((left, right) => left.order - right.order || compareCodeUnits(left.id, right.id)).map(promptSectionProjection),
    parameters: sortedBy(prompt.parameters, (item) => item.id).map(promptParameterProjection),
    referenceMappings: [...prompt.referenceMappings].sort((left, right) => left.order - right.order || compareCodeUnits(left.id, right.id)).map(promptReferenceMappingProjection),
    forbidden: sortedBy(prompt.forbidden, (item) => item.id),
    output: clone(prompt.output),
    constraintCoverage: sortedBy(prompt.constraintCoverage, (item) => item.constraintId).map(promptCoverageProjection),
    sourceIds: sortedStrings(prompt.sourceIds),
    constraintIds: sortedStrings(prompt.constraintIds),
    decisionIds: sortedStrings(prompt.decisionIds),
    assetIds: sortedStrings(prompt.assetIds),
  }) as JsonObject
}

export function computePromptIRHash(prompt: PromptIR): string {
  return sha256(normalizedPromptIRProjection(prompt))
}

export const computePromptIRSignature = computePromptIRHash

function transformationProjection(transformation: PromptTransformation): JsonObject {
  const value = clone(transformation) as unknown as Record<string, unknown>
  if (value.schemaVersion === undefined) value.schemaVersion = PROMPT_TRANSFORMATION_SCHEMA_VERSION
  if (Array.isArray(value.sectionIds)) value.sectionIds = sortedStrings(value.sectionIds as string[])
  if (Array.isArray(value.constraintIds)) value.constraintIds = sortedStrings(value.constraintIds as string[])
  if (Array.isArray(value.sourceIds)) value.sourceIds = sortedStrings(value.sourceIds as string[])
  if (value.proof && typeof value.proof === 'object') {
    const proof = value.proof as Record<string, unknown>
    if (Array.isArray(proof.preservedConstraintIds)) proof.preservedConstraintIds = sortedStrings(proof.preservedConstraintIds as string[])
  }
  return value as JsonObject
}

export function computePromptTransformationHash(transformation: PromptTransformation): string {
  return sha256(transformationProjection(transformation))
}

function candidateSections(candidate: PromptCandidateIR): PromptSection[] {
  return candidate.sections ?? candidate.candidateSections ?? []
}

function candidateParameters(candidate: PromptCandidateIR): PromptParameter[] {
  if (candidate.parameters) return candidate.parameters
  return Object.entries(candidate.requestParameters ?? {}).map(([name, value], index) => ({
    schemaVersion: PROMPT_PARAMETER_SCHEMA_VERSION,
    id: `parameter-${name || index}`,
    name,
    value,
    valueType: typeof value === 'number' && Number.isInteger(value) ? 'integer' : typeof value as PromptParameter['valueType'],
    required: false,
    mutability: 'rephraseable',
    constraintIds: [],
    sourceIds: [],
    decisionIds: [],
  }))
}

function candidateCoverage(candidate: PromptCandidateIR): PromptConstraintCoverage[] {
  if (candidate.constraintCoverage) return candidate.constraintCoverage
  return (candidate.coverageClaims ?? []).map((claim) => ({
    schemaVersion: PROMPT_CONSTRAINT_COVERAGE_SCHEMA_VERSION,
    constraintId: claim.constraintId,
    sectionIds: claim.sectionIds,
    parameterIds: claim.parameterIds,
    referenceMappingIds: claim.referenceMappingIds,
    locked: false,
  }))
}

function normalizedPromptCandidateProjection(candidate: PromptCandidateIR): JsonObject {
  const sections = candidateSections(candidate)
  const parameters = candidateParameters(candidate)
  const coverage = candidateCoverage(candidate)
  return jsonReady({
    schemaVersion: PROMPT_CANDIDATE_IR_SCHEMA_VERSION,
    id: candidate.id,
    basePromptIRHash: candidate.basePromptIRHash,
    ...(candidate.basePromptIRSignature === undefined ? {} : { basePromptIRSignature: candidate.basePromptIRSignature }),
    targetAdapter: clone(candidate.targetAdapter),
    targetCapabilityProfile: clone(candidate.targetCapabilityProfile),
    targetAdapterDigest: candidate.targetAdapterDigest,
    targetProfileDigest: candidate.targetProfileDigest,
    sections: sections.map(promptSectionProjection),
    parameters: sortedBy(parameters, (item) => item.id).map(promptParameterProjection),
    referenceMappings: [...candidate.referenceMappings].sort((left, right) => left.order - right.order || compareCodeUnits(left.id, right.id)).map(promptReferenceMappingProjection),
    constraintCoverage: sortedBy(coverage, (item) => item.constraintId).map(promptCoverageProjection),
    transformations: candidate.transformations.map(transformationProjection),
    optimizer: clone(candidate.optimizer),
    mode: candidate.mode,
    warnings: sortedStrings(candidate.warnings),
    ...(candidate.candidateSections === undefined ? {} : { candidateSections: candidate.candidateSections.map(promptSectionProjection) }),
    ...(candidate.requestParameters === undefined ? {} : { requestParameters: clone(candidate.requestParameters) }),
    ...(candidate.coverageClaims === undefined ? {} : { coverageClaims: clone(candidate.coverageClaims) }),
  }) as JsonObject
}

export function computePromptCandidateHash(candidate: PromptCandidateIR): string {
  return sha256(normalizedPromptCandidateProjection(candidate))
}

export function computePromptGuardResultHash(result: PromptGuardResult): string {
  const value = clone(result) as unknown as Record<string, unknown>
  delete value.resultHash
  return sha256(jsonReady(value))
}

function promptFinding(value: Omit<PromptGuardFinding, 'schemaVersion'|'id'>): PromptGuardFinding {
  const normalized = {
    schemaVersion: PROMPT_GUARD_FINDING_SCHEMA_VERSION,
    ...value,
    constraintIds: sortedStrings(value.constraintIds),
    sourceIds: sortedStrings(value.sourceIds),
    sectionIds: sortedStrings(value.sectionIds),
    decisionIds: sortedStrings(value.decisionIds),
    assetIds: sortedStrings(value.assetIds),
  }
  return clone({ ...normalized, id: hashId('prompt-finding', normalized) })
}

function promptSectionHash(section: PromptSection): string {
  return sha256(promptSectionProjection(section))
}

function lockedPromptSectionProjection(section: PromptSection): JsonObject {
  const value = promptSectionProjection(section) as Record<string, unknown>
  delete value.order
  return value as JsonObject
}

function promptSectionMetadataProjection(section: PromptSection): JsonObject {
  const value = promptSectionProjection(section) as Record<string, unknown>
  delete value.content
  delete value.text
  delete value.order
  return value as JsonObject
}

function promptParameterContractProjection(parameter: PromptParameter): JsonObject {
  const value = promptParameterProjection(parameter) as Record<string, unknown>
  delete value.value
  return value as JsonObject
}

function outputParameter(
  id: string,
  name: string,
  value: JsonValue,
  valueType: PromptParameter['valueType'],
  constraintIds: string[],
  bounds?: PromptParameter['bounds'],
): PromptParameter {
  return {
    schemaVersion: PROMPT_PARAMETER_SCHEMA_VERSION,
    id,
    name,
    value: clone(value),
    valueType,
    required: true,
    mutability: 'locked',
    ...(bounds ? { bounds: clone(bounds) } : {}),
    constraintIds: sortedStrings(constraintIds),
    sourceIds: [],
    decisionIds: [],
    type: valueType,
    ...(bounds?.minimum === undefined ? {} : { minimum: bounds.minimum }),
    ...(bounds?.maximum === undefined ? {} : { maximum: bounds.maximum }),
    ...(bounds?.allowedValues === undefined ? {} : { allowedValues: clone(bounds.allowedValues) }),
  }
}

function constraintText(constraint: Constraint): string {
  const value = constraint.value === undefined ? '' : ` value=${canonicalize(constraint.value)}`
  return `${constraint.predicate} ${constraint.targetPath ?? constraint.targetPaths.join(',')}${value}. ${constraint.explanation}`
}

function targetPinFromProfile(profile: ProviderCapabilityProfile): VersionPin {
  return { id: profile.id, version: profile.version, digest: profile.profileHash }
}

function profileAdapterPin(profile: ProviderCapabilityProfile): VersionPin {
  return { id: profile.adapterId, version: profile.version, digest: profile.adapterDigest ?? sha256({ adapterId: profile.adapterId, version: profile.version }) }
}

function profilePinLike(value: VersionPin | undefined, fallback: VersionPin): VersionPin {
  return clone(value ?? fallback)
}

function integrityReasonsForConstraintIR(ir: ConstraintIR, context: CompilationContext, caseId: string, caseRevision: number): string[] {
  const reasons: string[] = []
  if (!ir || ir.schemaVersion !== 'voce.constraint-ir/v1alpha1' || ir.status !== 'ok') reasons.push('CONSTRAINT_IR_NOT_OK')
  if (ir.caseId !== caseId || ir.caseRevision !== caseRevision || ir.contextHash !== context.contextHash) reasons.push('CONSTRAINT_CONTEXT_MISMATCH')
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

function integrityReasonsForReferencePlan(plan: ReferencePlan, ir: ConstraintIR, caseId: string, caseRevision: number, contextHash: string): string[] {
  const reasons: string[] = []
  if (!plan || plan.schemaVersion !== 'voce.reference-plan/v1alpha1' || plan.status !== 'ok') reasons.push('REFERENCE_PLAN_NOT_OK')
  if (plan.caseId !== caseId || plan.caseRevision !== caseRevision || plan.contextHash !== contextHash) reasons.push('REFERENCE_PLAN_CONTEXT_MISMATCH')
  if (plan.constraintSignature !== ir.deterministicSignature) reasons.push('REFERENCE_CONSTRAINT_SIGNATURE_MISMATCH')
  if (!isHash(plan.planHash) || computeReferencePlanHash(plan) !== plan.planHash) reasons.push('REFERENCE_PLAN_HASH_MISMATCH')
  if (!isHash(plan.profileDigest)) reasons.push('REFERENCE_PROFILE_DIGEST_MISSING')
  for (const item of plan.dependencies) if (!isHash(item.dependencyHash) || computeReferenceDependencyHash(item) !== item.dependencyHash) reasons.push('REFERENCE_DEPENDENCY_HASH_MISMATCH')
  for (const item of [...plan.omitted, ...plan.blockedReferences]) if (!isHash(item.omissionHash) || computeReferenceOmissionHash(item) !== item.omissionHash) reasons.push('REFERENCE_OMISSION_HASH_MISMATCH')
  return sortedStrings(reasons)
}

function integrityReasonsForPipelinePlan(plan: PipelinePlan, ir: ConstraintIR, refs: ReferencePlan, output: PromptCompilationInput['outputContract'], caseId: string, caseRevision: number, contextHash: string): string[] {
  const reasons: string[] = []
  if (!plan || plan.schemaVersion !== PIPELINE_PLAN_SCHEMA_VERSION || plan.status !== 'ok') reasons.push('PIPELINE_PLAN_NOT_OK')
  if (plan.caseId !== caseId || plan.caseRevision !== caseRevision || plan.contextHash !== contextHash) reasons.push('PIPELINE_PLAN_CONTEXT_MISMATCH')
  if (plan.constraintSignature !== ir.deterministicSignature) reasons.push('PIPELINE_CONSTRAINT_SIGNATURE_MISMATCH')
  if (plan.referencePlanHash !== refs.planHash) reasons.push('PIPELINE_REFERENCE_PLAN_HASH_MISMATCH')
  if (plan.outputContractHash !== computeOutputContractHash(output)) reasons.push('PIPELINE_OUTPUT_CONTRACT_HASH_MISMATCH')
  if (!isHash(plan.planHash) || computePipelinePlanHash(plan) !== plan.planHash) reasons.push('PIPELINE_PLAN_HASH_MISMATCH')
  for (const step of plan.steps) if (!isHash(step.stepHash) || computePipelineStepHash(step) !== step.stepHash) reasons.push('PIPELINE_STEP_HASH_MISMATCH')
  return sortedStrings(reasons)
}

function outputContractReasons(output: PromptCompilationInput['outputContract']): string[] {
  const reasons: string[] = []
  if (!output || !Array.isArray(output.mediaTypes) || output.mediaTypes.length === 0) reasons.push('OUTPUT_MEDIA_TYPES_INVALID')
  if (!output?.cardinality || !Number.isInteger(output.cardinality.min) || !Number.isInteger(output.cardinality.max) || output.cardinality.min < 0 || output.cardinality.max < output.cardinality.min) reasons.push('OUTPUT_CARDINALITY_INVALID')
  if (output?.dimensions && (!Number.isInteger(output.dimensions.width) || !Number.isInteger(output.dimensions.height) || output.dimensions.width <= 0 || output.dimensions.height <= 0)) reasons.push('OUTPUT_DIMENSIONS_INVALID')
  if (output?.maxBytes !== undefined && (!Number.isInteger(output.maxBytes) || output.maxBytes < 0)) reasons.push('OUTPUT_BYTES_INVALID')
  if (output?.background === 'transparent' && output.allowAlpha === false) reasons.push('OUTPUT_ALPHA_CONTRACT_CONFLICT')
  return sortedStrings(reasons)
}

function promptCompilationInputReasons(input: PromptCompilationInput): string[] {
  const reasons: string[] = []
  if (!input || input.schemaVersion !== PROMPT_COMPILATION_INPUT_SCHEMA_VERSION) reasons.push('PROMPT_COMPILATION_INPUT_SCHEMA_INVALID')
  if (!input || typeof input.caseId !== 'string' || !Number.isInteger(input.caseRevision)) reasons.push('PROMPT_CASE_INVALID')
  if (!input.context || input.context.caseSpecId !== input.caseId || input.context.caseSpecRevision !== input.caseRevision) reasons.push('PROMPT_CONTEXT_CASE_MISMATCH')
  if (!input.context || !isHash(input.contextHash) || input.context.contextHash !== input.contextHash || computeCompilationContextHash(input.context) !== input.contextHash) reasons.push('PROMPT_CONTEXT_HASH_MISMATCH')
  if (!input.constraintIR || integrityReasonsForConstraintIR(input.constraintIR, input.context, input.caseId, input.caseRevision).length) reasons.push('CONSTRAINT_IR_INVALID')
  if (!input.referencePlan || integrityReasonsForReferencePlan(input.referencePlan, input.constraintIR, input.caseId, input.caseRevision, input.contextHash).length) reasons.push('REFERENCE_PLAN_INVALID')
  if (!input.pipelinePlan || integrityReasonsForPipelinePlan(input.pipelinePlan, input.constraintIR, input.referencePlan, input.outputContract, input.caseId, input.caseRevision, input.contextHash).length) reasons.push('PIPELINE_PLAN_INVALID')
  if (!input.outputContract || outputContractReasons(input.outputContract).length || computeOutputContractHash(input.outputContract) !== input.pipelinePlan?.outputContractHash) reasons.push('OUTPUT_CONTRACT_INVALID')
  if (!input.targetAdapter || !isHash(input.targetAdapter.digest)) reasons.push('TARGET_ADAPTER_INVALID')
  if (!input.targetCapabilityProfile || !isHash(input.targetCapabilityProfile.digest)) reasons.push('TARGET_PROFILE_INVALID')
  if (input.pipelinePlan && input.pipelinePlan.profileDigest !== input.targetCapabilityProfile?.digest) reasons.push('TARGET_PROFILE_PLAN_MISMATCH')
  if (input.pipelinePlan && !input.pipelinePlan.adapterDigests.includes(input.targetAdapter?.digest ?? '')) reasons.push('TARGET_ADAPTER_PLAN_MISMATCH')
  return sortedStrings(reasons)
}

function sectionForConstraint(constraint: Constraint, order: number, decisionIds: string[]): PromptSection {
  const locked = constraint.importance === 'hard' || constraint.importance === 'required' || constraint.kind === 'output'
  return {
    schemaVersion: PROMPT_SECTION_SCHEMA_VERSION,
    id: hashId('prompt-section', { kind: constraint.importance, constraintId: constraint.id, order }),
    kind: constraint.importance === 'hard' ? 'hard_constraint' : constraint.importance === 'required' ? 'required_constraint' : 'preferred',
    priority: constraint.importance === 'hard' ? 100 : constraint.importance === 'required' ? 80 : 40,
    order,
    content: constraintText(constraint),
    text: constraintText(constraint),
    constraintIds: [constraint.id],
    sourceIds: sortedStrings(constraint.sourceIds),
    decisionIds: sortedStrings(decisionIds),
    assetIds: [],
    importance: constraint.importance,
    mutability: locked ? 'locked' : 'rephraseable',
    locked,
  }
}

function referenceMapping(reference: PlannedReference, constraints: Constraint[], decisionIds: string[]): PromptReferenceMapping {
  const required = reference.constraintIds.some((id) => constraints.find((constraint) => constraint.id === id)?.importance !== 'preferred') || reference.sourceBindingIds.length > 0
  return {
    schemaVersion: PROMPT_REFERENCE_MAPPING_SCHEMA_VERSION,
    id: hashId('prompt-reference-mapping', { plannedReferenceId: reference.id, assetId: reference.assetId, contentHash: reference.contentHash, order: reference.order }),
    plannedReferenceId: reference.id,
    referenceId: reference.id,
    assetId: reference.assetId,
    contentHash: reference.contentHash,
    label: reference.label,
    role: reference.role,
    order: reference.order,
    required,
    constraintIds: sortedStrings(reference.constraintIds),
    sourceBindingIds: sortedStrings(reference.sourceBindingIds),
    decisionIds: sortedStrings(decisionIds),
  }
}

function promptParameterValues(output: PromptCompilationInput['outputContract'], constraints: Constraint[]): PromptParameter[] {
  const outputIds = constraints.filter((constraint) => constraint.kind === 'output').map((constraint) => constraint.id)
  const parameters: PromptParameter[] = []
  if (output.dimensions) {
    parameters.push(outputParameter('output-width', 'width', output.dimensions.width, 'integer', outputIds, { type: 'integer', minimum: 1, maximum: output.dimensions.width }))
    parameters.push(outputParameter('output-height', 'height', output.dimensions.height, 'integer', outputIds, { type: 'integer', minimum: 1, maximum: output.dimensions.height }))
  }
  if (output.mediaTypes.length) parameters.push(outputParameter('output-media-type', 'mediaType', output.mediaTypes[0], 'enum', outputIds, { type: 'enum', allowedValues: output.mediaTypes.map((item) => item) }))
  if (output.background) parameters.push(outputParameter('output-background', 'background', output.background, 'enum', outputIds, { type: 'enum', allowedValues: ['transparent', 'opaque', 'any'] }))
  if (output.allowAlpha !== undefined) parameters.push(outputParameter('output-alpha', 'allowAlpha', output.allowAlpha, 'boolean', outputIds, { type: 'boolean', allowedValues: [true, false] }))
  parameters.push(outputParameter('output-count', 'count', output.cardinality.min, 'integer', outputIds, { type: 'integer', minimum: output.cardinality.min, maximum: output.cardinality.max }))
  if (output.maxBytes !== undefined) parameters.push(outputParameter('output-max-bytes', 'maxBytes', output.maxBytes, 'integer', outputIds, { type: 'integer', minimum: 0, maximum: output.maxBytes }))
  return parameters
}

function coverageForConstraint(constraint: Constraint, sections: PromptSection[], parameters: PromptParameter[], mappings: PromptReferenceMapping[]): PromptConstraintCoverage {
  const sectionIds = sections.filter((section) => section.constraintIds.includes(constraint.id)).map((section) => section.id)
  const parameterIds = parameters.filter((parameter) => parameter.constraintIds.includes(constraint.id)).map((parameter) => parameter.id)
  const referenceMappingIds = mappings.filter((mapping) => mapping.constraintIds.includes(constraint.id)).map((mapping) => mapping.id)
  return {
    schemaVersion: PROMPT_CONSTRAINT_COVERAGE_SCHEMA_VERSION,
    constraintId: constraint.id,
    sectionIds: sortedStrings(sectionIds),
    parameterIds: sortedStrings(parameterIds),
    referenceMappingIds: sortedStrings(referenceMappingIds),
    locked: constraint.importance !== 'preferred',
  }
}

function promptBaseWithoutSignature(prompt: PromptIR): PromptIR {
  return { ...clone(prompt), deterministicSignature: '' }
}

export class PromptCompiler {
  compile(input: PromptCompilationInput): PromptIR {
    try {
      const safeInput = clone(input)
      const reasons = promptCompilationInputReasons(safeInput)
      if (reasons.length) throw new Error(reasons.join('|'))
      const decisionIds = sortedStrings(safeInput.context.decisionHashes)
      const constraints = sortedBy(safeInput.constraintIR.constraints, (item) => item.id)
      const sections: PromptSection[] = []
      const objective = safeInput.objective ?? 'Produce the requested visual result using only the approved constraints and references.'
      const positiveDescription = safeInput.positiveDescription ?? 'Express the approved target properties clearly and preserve all locked requirements.'
      sections.push({
        schemaVersion: PROMPT_SECTION_SCHEMA_VERSION,
        id: hashId('prompt-section', { kind: 'objective', objective }),
        kind: 'objective', priority: 120, order: 0, content: objective, text: objective,
        constraintIds: [], sourceIds: [], decisionIds, assetIds: [], importance: 'required', mutability: 'rephraseable', locked: false,
      })
      sections.push({
        schemaVersion: PROMPT_SECTION_SCHEMA_VERSION,
        id: hashId('prompt-section', { kind: 'positive', positiveDescription }),
        kind: 'positive', priority: 110, order: 1, content: positiveDescription, text: positiveDescription,
        constraintIds: [], sourceIds: [], decisionIds, assetIds: [], importance: 'required', mutability: 'rephraseable', locked: false,
      })
      constraints.forEach((constraint, index) => sections.push(sectionForConstraint(constraint, 10 + index, decisionIds)))
      const mappings = [...safeInput.referencePlan.ordered].sort((left, right) => left.order - right.order || compareCodeUnits(left.id, right.id)).map((reference) => referenceMapping(reference, constraints, decisionIds))
      mappings.forEach((mapping, index) => sections.push({
        schemaVersion: PROMPT_SECTION_SCHEMA_VERSION,
        id: hashId('prompt-section', { kind: 'reference', mappingId: mapping.id }),
        kind: 'reference', priority: mapping.required ? 90 : 30, order: 100 + index, content: `${mapping.label}: use approved ${mapping.role} reference ${mapping.assetId}.`,
        text: `${mapping.label}: use approved ${mapping.role} reference ${mapping.assetId}.`, constraintIds: mapping.constraintIds,
        sourceIds: mapping.sourceBindingIds, decisionIds: mapping.decisionIds, assetIds: [mapping.assetId], importance: mapping.required ? 'required' : 'preferred', mutability: 'locked', locked: true,
      }))
      const outputConstraints = constraints.filter((constraint) => constraint.kind === 'output')
      const parameters = promptParameterValues(safeInput.outputContract, outputConstraints)
      sections.push({
        schemaVersion: PROMPT_SECTION_SCHEMA_VERSION,
        id: hashId('prompt-section', { kind: 'output', outputContractHash: computeOutputContractHash(safeInput.outputContract) }),
        kind: 'output', priority: 100, order: 1000, content: `Render exactly ${safeInput.outputContract.cardinality.min}-${safeInput.outputContract.cardinality.max} output artifact(s) under the typed output contract.`,
        text: `Render exactly ${safeInput.outputContract.cardinality.min}-${safeInput.outputContract.cardinality.max} output artifact(s) under the typed output contract.`, constraintIds: outputConstraints.map((constraint) => constraint.id), sourceIds: [], decisionIds, assetIds: [], importance: 'hard', mutability: 'locked', locked: true,
      })
      sections.push({
        schemaVersion: PROMPT_SECTION_SCHEMA_VERSION,
        id: 'prompt-suggestion-slot-default', kind: 'suggestion', priority: 10, order: 2000, content: '', text: '', constraintIds: [], sourceIds: [], decisionIds: [], assetIds: [], importance: 'preferred', mutability: 'suggestion_slot', locked: false, slotId: 'suggestion.default',
      })
      const forbidden: PromptProhibition[] = constraints.filter((constraint) => constraint.predicate === 'absent').map((constraint) => ({
        id: hashId('prompt-prohibition', { constraintId: constraint.id }), text: `Do not include ${constraint.targetPath ?? constraint.targetPaths.join(',')}.`, constraintIds: [constraint.id], sourceIds: sortedStrings(constraint.sourceIds), importance: constraint.importance,
      }))
      const coverage = constraints.map((constraint) => coverageForConstraint(constraint, sections, parameters, mappings))
      const prompt: PromptIR = {
        schemaVersion: PROMPT_IR_SCHEMA_VERSION,
        id: hashId('prompt-ir', { caseId: safeInput.caseId, caseRevision: safeInput.caseRevision, compilationSignature: safeInput.constraintIR.deterministicSignature, referencePlanHash: safeInput.referencePlan.planHash, pipelinePlanHash: safeInput.pipelinePlan.planHash, targetAdapter: safeInput.targetAdapter, targetCapabilityProfile: safeInput.targetCapabilityProfile }),
        caseId: safeInput.caseId,
        caseRevision: safeInput.caseRevision,
        contextHash: safeInput.contextHash,
        compilationSignature: safeInput.constraintIR.deterministicSignature,
        constraintIRHash: safeInput.constraintIR.deterministicSignature,
        referencePlanHash: safeInput.referencePlan.planHash,
        pipelinePlanHash: safeInput.pipelinePlan.planHash,
        outputContractHash: computeOutputContractHash(safeInput.outputContract),
        targetAdapter: clone(safeInput.targetAdapter),
        targetCapabilityProfile: clone(safeInput.targetCapabilityProfile),
        objective, positiveDescription,
        sections: [...sections].sort((left, right) => left.order - right.order || compareCodeUnits(left.id, right.id)),
        parameters: sortedBy(parameters, (item) => item.id),
        referenceMappings: mappings,
        forbidden: sortedBy(forbidden, (item) => item.id),
        output: clone(safeInput.outputContract),
        constraintCoverage: sortedBy(coverage, (item) => item.constraintId),
        sourceIds: sortedStrings([...constraints.flatMap((constraint) => constraint.sourceIds), ...mappings.flatMap((mapping) => mapping.sourceBindingIds)]),
        constraintIds: sortedStrings(constraints.map((constraint) => constraint.id)),
        decisionIds,
        assetIds: sortedStrings(mappings.map((mapping) => mapping.assetId)),
        deterministicSignature: '',
      }
      prompt.deterministicSignature = computePromptIRHash(prompt)
      return clone(prompt)
    } catch (error) {
      throw error
    }
  }
}

export const DeterministicPromptCompiler = PromptCompiler

export function compilePromptIR(input: PromptCompilationInput): PromptIR {
  return new PromptCompiler().compile(input)
}

export const compilePrompt = compilePromptIR

function candidateRequestParameters(parameters: PromptParameter[]): JsonObject {
  return Object.fromEntries(parameters.map((parameter) => [parameter.name, clone(parameter.value)])) as JsonObject
}

function candidateCoverageClaims(coverage: PromptConstraintCoverage[]) {
  return coverage.map((item) => ({ constraintId: item.constraintId, transformationIndexes: [], sectionIds: sortedStrings(item.sectionIds), parameterIds: sortedStrings(item.parameterIds), referenceMappingIds: sortedStrings(item.referenceMappingIds) }))
}

function applyTransformation(prompt: PromptIR, sections: PromptSection[], parameters: PromptParameter[], transformation: PromptTransformation): void {
  if (transformation.kind === 'reorder') {
    const byId = new Map(sections.map((section) => [section.id, section]))
    if (transformation.sectionIds.length !== sections.length || transformation.sectionIds.some((id) => !byId.has(id))) throw new Error('PROMPT_TRANSFORMATION_INVALID')
    sections.splice(0, sections.length, ...transformation.sectionIds.map((id) => byId.get(id)!))
    return
  }
  if (transformation.kind === 'rephrase') {
    const section = sections.find((item) => item.id === transformation.sectionId)
    if (!section) throw new Error('PROMPT_SECTION_NOT_FOUND')
    const content = transformation.content ?? transformation.text
    if (content === undefined) throw new Error('PROMPT_TRANSFORMATION_INVALID')
    section.content = content
    section.text = content
    return
  }
  if (transformation.kind === 'parameter_move') {
    const parameter = parameters.find((item) => item.id === transformation.parameterId || item.name === transformation.parameterName)
    if (!parameter) throw new Error('PROMPT_PARAMETER_NOT_FOUND')
    if (transformation.value !== undefined) parameter.value = clone(transformation.value)
    return
  }
  if (transformation.kind === 'suggestion' || transformation.kind === 'add_suggestion' || transformation.kind === 'declared_suggestion') {
    const slot = sections.find((item) => item.slotId === transformation.slotId && item.mutability === 'suggestion_slot')
    if (!slot) throw new Error('PROMPT_SUGGESTION_SLOT_NOT_FOUND')
    const content = transformation.content ?? transformation.text
    if (content === undefined) throw new Error('PROMPT_TRANSFORMATION_INVALID')
    sections.push({
      schemaVersion: PROMPT_SECTION_SCHEMA_VERSION,
      id: hashId('prompt-suggestion', { slotId: transformation.slotId, content, sourceIds: transformation.sourceIds, constraintIds: transformation.constraintIds }),
      kind: 'suggestion', priority: slot.priority, order: Math.max(...sections.map((item) => item.order), 0) + 1,
      content, text: content, constraintIds: sortedStrings(transformation.constraintIds), sourceIds: sortedStrings(transformation.sourceIds), decisionIds: [], assetIds: [], importance: 'preferred', mutability: 'rephraseable', locked: false, slotId: transformation.slotId,
    })
  }
}

export interface PromptCandidateOptions {
  optimizer?: VersionPin
  mode?: 'strict'|'balanced'|'creative'
  warnings?: string[]
}

export function createPromptCandidateIR(prompt: PromptIR, transformations: PromptTransformation[] = [], options: PromptCandidateOptions = {}): PromptCandidateIR {
  const safePrompt = clone(prompt)
  const sections = clone(safePrompt.sections)
  const parameters = clone(safePrompt.parameters)
  const normalizedTransformations = transformations.map((transformation) => ({ schemaVersion: PROMPT_TRANSFORMATION_SCHEMA_VERSION, ...clone(transformation) })) as PromptTransformation[]
  for (const transformation of normalizedTransformations) applyTransformation(safePrompt, sections, parameters, transformation)
  const candidateBase: PromptCandidateIR = {
    schemaVersion: PROMPT_CANDIDATE_IR_SCHEMA_VERSION,
    id: hashId('prompt-candidate', { base: safePrompt.deterministicSignature, transformations: normalizedTransformations, optimizer: options.optimizer ?? { id: PROMPT_OPTIMIZER_VERSION, version: '1.0.0', digest: sha256({ optimizer: PROMPT_OPTIMIZER_VERSION }) }, mode: options.mode ?? 'strict' }),
    candidateHash: '',
    basePromptIRHash: safePrompt.deterministicSignature,
    basePromptIRSignature: safePrompt.deterministicSignature,
    targetAdapter: clone(safePrompt.targetAdapter),
    targetCapabilityProfile: clone(safePrompt.targetCapabilityProfile),
    targetAdapterDigest: safePrompt.targetAdapter.digest,
    targetProfileDigest: safePrompt.targetCapabilityProfile.digest,
    sections: clone(sections),
    parameters: clone(parameters),
    referenceMappings: clone(safePrompt.referenceMappings),
    constraintCoverage: clone(safePrompt.constraintCoverage),
    transformations: normalizedTransformations,
    optimizer: clone(options.optimizer ?? { id: PROMPT_OPTIMIZER_VERSION, version: '1.0.0', digest: sha256({ optimizer: PROMPT_OPTIMIZER_VERSION }) }),
    mode: options.mode ?? 'strict',
    warnings: sortedStrings(options.warnings),
    candidateSections: clone(sections),
    requestParameters: candidateRequestParameters(parameters),
    coverageClaims: candidateCoverageClaims(safePrompt.constraintCoverage),
  }
  candidateBase.candidateHash = computePromptCandidateHash(candidateBase)
  return clone(candidateBase)
}

export class DeterministicPromptOptimizer implements PromptOptimizer {
  optimize(input: PromptOptimizationInput): PromptCandidateIR {
    const safeInput = clone(input)
    if (safeInput.schemaVersion !== PROMPT_OPTIMIZATION_INPUT_SCHEMA_VERSION) throw new Error('PROMPT_OPTIMIZATION_INPUT_SCHEMA_INVALID')
    const prompt = clone(safeInput.promptIR)
    if (computePromptIRHash(prompt) !== prompt.deterministicSignature) throw new Error('PROMPT_IR_SIGNATURE_MISMATCH')
    const mode = safeInput.mode ?? 'strict'
    if (!['strict', 'balanced', 'creative'].includes(mode)) throw new Error('PROMPT_OPTIMIZATION_MODE_INVALID')
    const transformations: PromptTransformation[] = []
    if (mode !== 'strict') {
      for (const section of prompt.sections) {
        if (section.mutability !== 'rephraseable' || !section.content.trim()) continue
        const normalized = section.content.replaceAll(/\s+/g, ' ').trim()
        if (normalized !== section.content) transformations.push({ schemaVersion: PROMPT_TRANSFORMATION_SCHEMA_VERSION, kind: 'rephrase', sectionId: section.id, content: normalized, constraintIds: section.constraintIds, sourceIds: section.sourceIds, proof: { kind: 'whitespace_normalization', sourceSectionHash: promptSectionHash(section), preservedConstraintIds: sortedStrings(section.constraintIds), explanation: 'Whitespace-only normalization is mechanically reproducible.' } })
      }
    }
    return createPromptCandidateIR(prompt, transformations, { optimizer: safeInput.optimizer ?? { id: PROMPT_OPTIMIZER_VERSION, version: '1.0.0', digest: sha256({ optimizer: PROMPT_OPTIMIZER_VERSION }) }, mode })
  }
}

export const BaselinePromptOptimizer = DeterministicPromptOptimizer
export const OfflinePromptOptimizer = DeterministicPromptOptimizer

export function optimizePromptIR(input: PromptOptimizationInput): PromptCandidateIR {
  return new DeterministicPromptOptimizer().optimize(input)
}

export function optimizePromptIRWithFallback(input: PromptOptimizationInput): PromptCandidateIR {
  try {
    return optimizePromptIR(input)
  } catch {
    const prompt = clone(input.promptIR)
    if (computePromptIRHash(prompt) !== prompt.deterministicSignature) throw new Error('PROMPT_IR_SIGNATURE_MISMATCH')
    return createPromptCandidateIR(prompt, [], { mode: 'strict', warnings: ['OPTIMIZER_FALLBACK_DETERMINISTIC_PROMPT_IR'] })
  }
}

export const optimizePromptSafely = optimizePromptIRWithFallback

function valueWithinBounds(parameter: PromptParameter, value: JsonValue): boolean {
  const bounds = parameter.bounds ?? { type: parameter.valueType, minimum: parameter.minimum, maximum: parameter.maximum, allowedValues: parameter.allowedValues }
  if (bounds.type === 'string' && typeof value !== 'string') return false
  if (bounds.type === 'number' && (typeof value !== 'number' || !Number.isFinite(value))) return false
  if (bounds.type === 'integer' && (typeof value !== 'number' || !Number.isInteger(value))) return false
  if (bounds.type === 'boolean' && typeof value !== 'boolean') return false
  if (bounds.type === 'object' && (value === null || typeof value !== 'object' || Array.isArray(value))) return false
  if (bounds.type === 'array' && !Array.isArray(value)) return false
  if (bounds.minimum !== undefined && (typeof value !== 'number' || value < bounds.minimum)) return false
  if (bounds.maximum !== undefined && (typeof value !== 'number' || value > bounds.maximum)) return false
  if (bounds.allowedValues && !bounds.allowedValues.some((item) => canonicalize(item) === canonicalize(value))) return false
  return true
}

function guardFinding(value: Omit<PromptGuardFinding, 'schemaVersion'|'id'>): PromptGuardFinding {
  return promptFinding(value)
}

function guardInputReasons(input: PromptGuardInput): string[] {
  const reasons: string[] = []
  if (!input || input.schemaVersion !== 'voce.prompt-guard-input/v1alpha1') reasons.push('PROMPT_GUARD_INPUT_SCHEMA_INVALID')
  if (!input.promptIR || input.promptIR.schemaVersion !== PROMPT_IR_SCHEMA_VERSION || !isHash(input.promptIR.deterministicSignature) || computePromptIRHash(input.promptIR) !== input.promptIR.deterministicSignature) reasons.push('PROMPT_IR_SIGNATURE_MISMATCH')
  if (!input.candidate || input.candidate.schemaVersion !== PROMPT_CANDIDATE_IR_SCHEMA_VERSION || !isHash(input.candidate.candidateHash) || computePromptCandidateHash(input.candidate) !== input.candidate.candidateHash) reasons.push('PROMPT_CANDIDATE_HASH_MISMATCH')
  if (input.candidate && input.promptIR && input.candidate.basePromptIRHash !== input.promptIR.deterministicSignature) reasons.push('PROMPT_CANDIDATE_BASE_MISMATCH')
  if (input.candidate && input.promptIR && (input.candidate.targetAdapterDigest !== input.promptIR.targetAdapter.digest || input.candidate.targetProfileDigest !== input.promptIR.targetCapabilityProfile.digest)) reasons.push('PROMPT_CANDIDATE_TARGET_MISMATCH')
  if (input.candidate && input.promptIR && (canonicalize(input.candidate.targetAdapter as unknown as JsonValue) !== canonicalize(input.promptIR.targetAdapter as unknown as JsonValue) || canonicalize(input.candidate.targetCapabilityProfile as unknown as JsonValue) !== canonicalize(input.promptIR.targetCapabilityProfile as unknown as JsonValue))) reasons.push('PROMPT_CANDIDATE_TARGET_CHANGED')
  if (!input.context || !isHash(input.context.contextHash) || computeCompilationContextHash(input.context) !== input.context.contextHash) reasons.push('PROMPT_CONTEXT_HASH_MISMATCH')
  if (input.promptIR && input.context && (input.promptIR.contextHash !== input.context.contextHash || input.promptIR.caseId !== input.context.caseSpecId || input.promptIR.caseRevision !== input.context.caseSpecRevision)) reasons.push('PROMPT_CONTEXT_MISMATCH')
  if (input.constraintIR && integrityReasonsForConstraintIR(input.constraintIR, input.context, input.promptIR?.caseId ?? '', input.promptIR?.caseRevision ?? -1).length) reasons.push('CONSTRAINT_IR_INVALID')
  if (input.referencePlan && input.constraintIR && integrityReasonsForReferencePlan(input.referencePlan, input.constraintIR, input.promptIR?.caseId ?? '', input.promptIR?.caseRevision ?? -1, input.context?.contextHash ?? '').length) reasons.push('REFERENCE_PLAN_INVALID')
  if (input.pipelinePlan && input.constraintIR && input.referencePlan && integrityReasonsForPipelinePlan(input.pipelinePlan, input.constraintIR, input.referencePlan, input.outputContract, input.promptIR?.caseId ?? '', input.promptIR?.caseRevision ?? -1, input.context?.contextHash ?? '').length) reasons.push('PIPELINE_PLAN_INVALID')
  if (input.promptIR && input.outputContract && input.promptIR.outputContractHash !== computeOutputContractHash(input.outputContract)) reasons.push('PROMPT_OUTPUT_CONTRACT_MISMATCH')
  if (input.promptIR && input.pipelinePlan && input.promptIR.pipelinePlanHash !== input.pipelinePlan.planHash) reasons.push('PROMPT_PIPELINE_PLAN_MISMATCH')
  if (input.promptIR && input.referencePlan && input.promptIR.referencePlanHash !== input.referencePlan.planHash) reasons.push('PROMPT_REFERENCE_PLAN_MISMATCH')
  if (input.promptIR && input.constraintIR && input.promptIR.compilationSignature !== input.constraintIR.deterministicSignature) reasons.push('PROMPT_CONSTRAINT_SIGNATURE_MISMATCH')
  if (outputContractReasons(input.outputContract).length) reasons.push('OUTPUT_CONTRACT_INVALID')
  return sortedStrings(reasons)
}

function addGuardFinding(findings: PromptGuardFinding[], value: Omit<PromptGuardFinding, 'schemaVersion'|'id'>): void {
  const finding = guardFinding(value)
  if (!findings.some((item) => item.id === finding.id)) findings.push(finding)
}

function guardResult(input: PromptGuardInput, status: PromptGuardResult['status'], findings: PromptGuardFinding[], guardedCandidate?: PromptCandidateIR): PromptGuardResult {
  const base: Omit<PromptGuardResult, 'resultHash'> = {
    schemaVersion: PROMPT_GUARD_RESULT_SCHEMA_VERSION,
    status,
    accepted: status === 'accepted',
    candidateHash: input.candidate?.candidateHash ?? '',
    basePromptIRHash: input.promptIR?.deterministicSignature ?? '',
    findings: sortedBy(findings, (item) => item.id),
    ...(guardedCandidate ? { guardedCandidate: clone(guardedCandidate) } : {}),
    deterministicFallback: clone(input.promptIR),
  }
  return clone({ ...base, resultHash: sha256(jsonReady(base)) }) as PromptGuardResult
}

export class PromptGuard {
  guard(input: PromptGuardInput): PromptGuardResult {
    const safeInput = clone(input)
    const findings: PromptGuardFinding[] = []
    const structuralReasons = guardInputReasons(safeInput)
    for (const code of structuralReasons) addGuardFinding(findings, { code, severity: 'critical', blocking: true, constraintIds: [], sourceIds: [], sectionIds: [], decisionIds: [], assetIds: [], explanation: `Prompt Guard rejected the input because ${code}.` })
    if (structuralReasons.length) return guardResult(safeInput, safeInput.policy === 'fallback' ? 'fallback' : 'rejected', findings)

    const prompt = safeInput.promptIR
    const candidate = safeInput.candidate
    const baseSections = new Map(prompt.sections.map((section) => [section.id, section]))
    const candidateSectionList = candidateSections(candidate)
    const candidateSectionMap = new Map(candidateSectionList.map((section) => [section.id, section]))
    const baseParameters = new Map(prompt.parameters.map((parameter) => [parameter.id, parameter]))
    const candidateParameterList = candidateParameters(candidate)
    const candidateParameterMap = new Map(candidateParameterList.map((parameter) => [parameter.id, parameter]))
    const baseMappings = new Map(prompt.referenceMappings.map((mapping) => [mapping.id, mapping]))
    const candidateMappings = candidate.referenceMappings
    const baseCoverage = new Map(prompt.constraintCoverage.map((coverage) => [coverage.constraintId, coverage]))
    const candidateCoverageMap = new Map(candidateCoverage(candidate).map((coverage) => [coverage.constraintId, coverage]))

    for (const section of prompt.sections) {
      const candidateSection = candidateSectionMap.get(section.id)
      const locked = section.locked === true || section.mutability === 'locked' || section.kind === 'hard_constraint' || section.kind === 'required_constraint' || section.kind === 'output' || section.kind === 'reference'
      if (!candidateSection) {
        addGuardFinding(findings, { code: locked ? 'LOCKED_SECTION_REMOVED' : 'PROMPT_SECTION_REMOVED', severity: locked ? 'critical' : 'error', blocking: locked, constraintIds: section.constraintIds, sourceIds: section.sourceIds, sectionIds: [section.id], decisionIds: section.decisionIds, assetIds: section.assetIds, explanation: `Candidate removed ${locked ? 'locked' : 'declared'} PromptIR section ${section.id}.` })
        continue
      }
      if (locked) {
        const same = canonicalize(lockedPromptSectionProjection(section)) === canonicalize(lockedPromptSectionProjection(candidateSection))
        if (!same) addGuardFinding(findings, { code: 'LOCKED_SECTION_CHANGED', severity: 'critical', blocking: true, constraintIds: section.constraintIds, sourceIds: section.sourceIds, sectionIds: [section.id], decisionIds: section.decisionIds, assetIds: section.assetIds, explanation: `Locked PromptIR section ${section.id} changed in the candidate.` })
      } else {
        if (canonicalize(promptSectionMetadataProjection(section)) !== canonicalize(promptSectionMetadataProjection(candidateSection))) addGuardFinding(findings, { code: 'PROMPT_SECTION_METADATA_CHANGED', severity: 'critical', blocking: true, constraintIds: section.constraintIds, sourceIds: section.sourceIds, sectionIds: [section.id], decisionIds: section.decisionIds, assetIds: section.assetIds, explanation: `Section ${section.id} changed typed provenance or mutability metadata.` })
        if (section.content !== candidateSection.content || section.text !== candidateSection.text) {
          const rephrase = candidate.transformations.some((transformation) => transformation.kind === 'rephrase' && transformation.sectionId === section.id)
          if (!rephrase) addGuardFinding(findings, { code: 'PROMPT_CANDIDATE_UNVERIFIABLE', severity: 'error', blocking: true, constraintIds: section.constraintIds, sourceIds: section.sourceIds, sectionIds: [section.id], decisionIds: section.decisionIds, assetIds: section.assetIds, explanation: `Section ${section.id} changed without a declared rephrase transformation.` })
        }
      }
    }
    for (const section of candidateSectionList) if (!baseSections.has(section.id)) {
      const matchingSuggestions = candidate.transformations.filter((transformation): transformation is Extract<PromptTransformation, { kind: 'suggestion'|'add_suggestion'|'declared_suggestion' }> => {
        if (transformation.kind !== 'suggestion' && transformation.kind !== 'add_suggestion' && transformation.kind !== 'declared_suggestion') return false
        const transformationContent = transformation.content ?? transformation.text
        const transformationText = transformation.text ?? transformation.content
        const slot = prompt.sections.find((candidateSlot) => candidateSlot.slotId === transformation.slotId && candidateSlot.mutability === 'suggestion_slot')
        return slot !== undefined
          && section.slotId === transformation.slotId
          && section.content === transformationContent
          && section.text === transformationText
          && canonicalize(sortedStrings(section.constraintIds)) === canonicalize(sortedStrings(transformation.constraintIds))
          && canonicalize(sortedStrings(section.sourceIds)) === canonicalize(sortedStrings(transformation.sourceIds))
          && transformation.provenance.source === 'optimizer_suggested'
          && transformation.proof?.kind === 'declared_suggestion'
      })
      const structurallyAllowed = section.kind === 'suggestion' && section.mutability !== 'locked' && section.constraintIds.every((id) => !prompt.constraintIds.includes(id) || prompt.constraintCoverage.find((item) => item.constraintId === id)?.locked !== true)
      if (!structurallyAllowed || matchingSuggestions.length === 0) {
        addGuardFinding(findings, { code: matchingSuggestions.length === 0 && structurallyAllowed ? 'PROMPT_CANDIDATE_UNVERIFIABLE' : 'UNAUTHORIZED_SECTION_ADDED', severity: 'critical', blocking: true, constraintIds: section.constraintIds, sourceIds: section.sourceIds, sectionIds: [section.id], decisionIds: section.decisionIds, assetIds: section.assetIds, explanation: `Candidate added suggestion section ${section.id} without a matching declared, proven suggestion transformation.` })
      }
    }
    for (const parameter of prompt.parameters) {
      const candidateParameter = candidateParameterMap.get(parameter.id)
      if (!candidateParameter) {
        addGuardFinding(findings, { code: 'LOCKED_PARAMETER_REMOVED', severity: parameter.mutability === 'locked' ? 'critical' : 'error', blocking: parameter.mutability === 'locked', constraintIds: parameter.constraintIds, sourceIds: parameter.sourceIds, sectionIds: [], decisionIds: parameter.decisionIds, assetIds: [], explanation: `Candidate removed declared parameter ${parameter.name}.` })
        continue
      }
      if (!valueWithinBounds(parameter, candidateParameter.value)) addGuardFinding(findings, { code: 'PARAMETER_OUT_OF_BOUNDS', severity: 'critical', blocking: true, constraintIds: parameter.constraintIds, sourceIds: parameter.sourceIds, sectionIds: [], decisionIds: parameter.decisionIds, assetIds: [], explanation: `Candidate parameter ${parameter.name} is outside its typed bounds.` })
      if (canonicalize(promptParameterContractProjection(parameter)) !== canonicalize(promptParameterContractProjection(candidateParameter))) addGuardFinding(findings, { code: 'PARAMETER_CONTRACT_CHANGED', severity: 'critical', blocking: true, constraintIds: parameter.constraintIds, sourceIds: parameter.sourceIds, sectionIds: [], decisionIds: parameter.decisionIds, assetIds: [], explanation: `Candidate changed the typed contract or provenance for parameter ${parameter.name}.` })
      if (parameter.mutability === 'locked' && canonicalize(parameter.value) !== canonicalize(candidateParameter.value)) addGuardFinding(findings, { code: 'LOCKED_PARAMETER_CHANGED', severity: 'critical', blocking: true, constraintIds: parameter.constraintIds, sourceIds: parameter.sourceIds, sectionIds: [], decisionIds: parameter.decisionIds, assetIds: [], explanation: `Locked parameter ${parameter.name} changed.` })
      if (parameter.mutability !== 'locked' && canonicalize(parameter.value) !== canonicalize(candidateParameter.value) && !candidate.transformations.some((transformation) => transformation.kind === 'parameter_move' && (transformation.parameterId === parameter.id || transformation.parameterName === parameter.name))) addGuardFinding(findings, { code: 'PROMPT_CANDIDATE_UNVERIFIABLE', severity: 'error', blocking: true, constraintIds: parameter.constraintIds, sourceIds: parameter.sourceIds, sectionIds: [], decisionIds: parameter.decisionIds, assetIds: [], explanation: `Parameter ${parameter.name} changed without a declared parameter_move transformation.` })
    }
    for (const parameter of candidateParameterList) if (!baseParameters.has(parameter.id)) addGuardFinding(findings, { code: 'UNAUTHORIZED_PARAMETER_ADDED', severity: 'critical', blocking: true, constraintIds: parameter.constraintIds, sourceIds: parameter.sourceIds, sectionIds: [], decisionIds: parameter.decisionIds, assetIds: [], explanation: `Candidate added undeclared parameter ${parameter.name}.` })

    if (candidate.candidateSections && canonicalize(candidate.candidateSections.map(promptSectionProjection)) !== canonicalize(candidate.sections.map(promptSectionProjection))) addGuardFinding(findings, { code: 'PROMPT_CANDIDATE_ALIAS_MISMATCH', severity: 'critical', blocking: true, constraintIds: [], sourceIds: [], sectionIds: [], decisionIds: [], assetIds: [], explanation: 'Candidate section aliases do not match the guarded sections.' })
    if (candidate.requestParameters && canonicalize(candidate.requestParameters) !== canonicalize(Object.fromEntries(candidateParameterList.map((parameter) => [parameter.name, parameter.value])) as JsonObject)) addGuardFinding(findings, { code: 'PROMPT_CANDIDATE_ALIAS_MISMATCH', severity: 'critical', blocking: true, constraintIds: [], sourceIds: [], sectionIds: [], decisionIds: [], assetIds: [], explanation: 'Candidate parameter aliases do not match the guarded typed parameters.' })

    const baseMappingIds = prompt.referenceMappings.map((mapping) => mapping.id).sort(compareCodeUnits)
    const candidateMappingIds = candidateMappings.map((mapping) => mapping.id).sort(compareCodeUnits)
    if (canonicalize(baseMappingIds) !== canonicalize(candidateMappingIds)) addGuardFinding(findings, { code: 'REFERENCE_MAPPING_SET_CHANGED', severity: 'critical', blocking: true, constraintIds: prompt.referenceMappings.flatMap((mapping) => mapping.constraintIds), sourceIds: prompt.referenceMappings.flatMap((mapping) => mapping.sourceBindingIds), sectionIds: [], decisionIds: prompt.referenceMappings.flatMap((mapping) => mapping.decisionIds), assetIds: prompt.referenceMappings.map((mapping) => mapping.assetId), explanation: 'Candidate added or removed an approved reference mapping.' })
    for (const mapping of prompt.referenceMappings) {
      const candidateMapping = candidateMappings.find((item) => item.id === mapping.id)
      if (!candidateMapping || canonicalize(promptReferenceMappingProjection(mapping)) !== canonicalize(promptReferenceMappingProjection(candidateMapping))) addGuardFinding(findings, { code: 'CONFIRMED_REFERENCE_MAPPING_CHANGED', severity: 'critical', blocking: true, constraintIds: mapping.constraintIds, sourceIds: mapping.sourceBindingIds, sectionIds: [], decisionIds: mapping.decisionIds, assetIds: [mapping.assetId], explanation: `Approved reference mapping ${mapping.id} changed.` })
    }

    for (const coverage of prompt.constraintCoverage) {
      const candidateCoverageValue = candidateCoverageMap.get(coverage.constraintId)
      if (!candidateCoverageValue || coverage.locked && canonicalize(promptCoverageProjection(coverage)) !== canonicalize(promptCoverageProjection(candidateCoverageValue))) addGuardFinding(findings, { code: 'CONSTRAINT_COVERAGE_LOST', severity: coverage.locked ? 'critical' : 'error', blocking: coverage.locked, constraintIds: [coverage.constraintId], sourceIds: [], sectionIds: coverage.sectionIds, decisionIds: [], assetIds: [], explanation: `Candidate no longer proves coverage for constraint ${coverage.constraintId}.` })
    }
    for (const coverage of candidateCoverage(candidate)) if (!baseCoverage.has(coverage.constraintId)) addGuardFinding(findings, { code: 'UNAUTHORIZED_CONSTRAINT_CLAIM', severity: 'critical', blocking: true, constraintIds: [coverage.constraintId], sourceIds: [], sectionIds: coverage.sectionIds, decisionIds: [], assetIds: [], explanation: `Candidate claims coverage for an undeclared constraint ${coverage.constraintId}.` })

    const transformationSectionIds = new Set<string>()
    candidate.transformations.forEach((transformation, index) => {
      if (transformation.schemaVersion !== undefined && transformation.schemaVersion !== PROMPT_TRANSFORMATION_SCHEMA_VERSION) addGuardFinding(findings, { code: 'PROMPT_TRANSFORMATION_SCHEMA_INVALID', severity: 'critical', blocking: true, constraintIds: [], sourceIds: [], sectionIds: [], decisionIds: [], assetIds: [], explanation: `Transformation ${index} has an unsupported schemaVersion.` })
      if (transformation.kind === 'rephrase') {
        transformationSectionIds.add(transformation.sectionId)
        const section = baseSections.get(transformation.sectionId)
        if (!section) addGuardFinding(findings, { code: 'PROMPT_SECTION_NOT_FOUND', severity: 'critical', blocking: true, constraintIds: [], sourceIds: [], sectionIds: [transformation.sectionId], decisionIds: [], assetIds: [], explanation: 'Rephrase targets a section that is not in PromptIR.' })
        else if (section.mutability === 'locked' || section.locked) addGuardFinding(findings, { code: 'LOCKED_SECTION_CHANGED', severity: 'critical', blocking: true, constraintIds: section.constraintIds, sourceIds: section.sourceIds, sectionIds: [section.id], decisionIds: section.decisionIds, assetIds: section.assetIds, explanation: 'A rephrase transformation targets a locked section.' })
        else if (!transformation.proof || !['deterministic_rephrase', 'whitespace_normalization'].includes(transformation.proof.kind) || (transformation.proof.sourceSectionHash !== undefined && transformation.proof.sourceSectionHash !== promptSectionHash(section)) || canonicalize(sortedStrings(transformation.proof.preservedConstraintIds)) !== canonicalize(sortedStrings(section.constraintIds))) addGuardFinding(findings, { code: 'PROMPT_CANDIDATE_UNVERIFIABLE', severity: 'error', blocking: true, constraintIds: section.constraintIds, sourceIds: section.sourceIds, sectionIds: [section.id], decisionIds: section.decisionIds, assetIds: section.assetIds, explanation: 'A free-text rephrase lacks a proof object that preserves the source section constraints.' })
      } else if (transformation.kind === 'reorder') {
        const expected = candidateSectionList.map((section) => section.id).sort(compareCodeUnits)
        const actual = [...transformation.sectionIds].sort(compareCodeUnits)
        if (canonicalize(expected) !== canonicalize(actual)) addGuardFinding(findings, { code: 'PROMPT_REORDER_SET_INVALID', severity: 'critical', blocking: true, constraintIds: [], sourceIds: [], sectionIds: transformation.sectionIds, decisionIds: [], assetIds: [], explanation: 'Reorder transformation does not name exactly the candidate section set.' })
      } else if (transformation.kind === 'parameter_move') {
        const section = baseSections.get(transformation.sectionId)
        const parameter = [...baseParameters.values()].find((item) => item.id === transformation.parameterId || item.name === transformation.parameterName)
        if (!section || !parameter) addGuardFinding(findings, { code: 'PROMPT_PARAMETER_MOVE_TARGET_INVALID', severity: 'critical', blocking: true, constraintIds: [], sourceIds: [], sectionIds: section ? [section.id] : [], decisionIds: [], assetIds: [], explanation: 'Parameter move must target an existing section and parameter.' })
        else if (section.mutability === 'locked' || parameter.mutability === 'locked' || !transformation.proof || transformation.proof.kind !== 'typed_parameter_move' || canonicalize(sortedStrings(transformation.proof.preservedConstraintIds)) !== canonicalize(sortedStrings(parameter.constraintIds)) || (transformation.value !== undefined && (!candidateParameterMap.get(parameter.id) || canonicalize(transformation.value) !== canonicalize(candidateParameterMap.get(parameter.id)!.value)))) addGuardFinding(findings, { code: parameter.mutability === 'locked' ? 'LOCKED_PARAMETER_CHANGED' : 'PROMPT_CANDIDATE_UNVERIFIABLE', severity: 'critical', blocking: true, constraintIds: parameter.constraintIds, sourceIds: parameter.sourceIds, sectionIds: [section.id], decisionIds: parameter.decisionIds, assetIds: [], explanation: 'Parameter move is not a declared, typed, provable transformation.' })
      } else if (transformation.kind === 'suggestion' || transformation.kind === 'add_suggestion' || transformation.kind === 'declared_suggestion') {
        const slot = prompt.sections.find((section) => section.slotId === transformation.slotId && section.mutability === 'suggestion_slot')
        if (!slot || transformation.provenance.source !== 'optimizer_suggested') addGuardFinding(findings, { code: 'SUGGESTION_SLOT_INVALID', severity: 'error', blocking: true, constraintIds: transformation.constraintIds ?? [], sourceIds: transformation.sourceIds ?? [], sectionIds: slot ? [slot.id] : [], decisionIds: [], assetIds: [], explanation: 'Suggestions must use a declared slot and optimizer_suggested provenance.' })
        else if (transformation.proof?.kind !== 'declared_suggestion') addGuardFinding(findings, { code: 'PROMPT_CANDIDATE_UNVERIFIABLE', severity: 'critical', blocking: true, constraintIds: transformation.constraintIds ?? [], sourceIds: transformation.sourceIds ?? [], sectionIds: [slot.id], decisionIds: [], assetIds: [], explanation: 'Added suggestions require declared_suggestion proof.' })
        else if ((transformation.constraintIds ?? []).some((id) => prompt.constraintCoverage.find((coverage) => coverage.constraintId === id)?.locked)) addGuardFinding(findings, { code: 'SUGGESTION_WEAKENS_LOCKED_CONSTRAINT', severity: 'critical', blocking: true, constraintIds: transformation.constraintIds ?? [], sourceIds: transformation.sourceIds ?? [], sectionIds: [slot.id], decisionIds: [], assetIds: [], explanation: 'Suggestion references a locked constraint and cannot be used to weaken it.' })
      } else if ((transformation as PromptFreeTextTransformation).kind === 'free_text') addGuardFinding(findings, { code: 'PROMPT_CANDIDATE_UNVERIFIABLE', severity: 'error', blocking: true, constraintIds: [], sourceIds: [], sectionIds: [], decisionIds: [], assetIds: [], explanation: 'Arbitrary free-text transformation cannot be mechanically proven safe.' })
      else addGuardFinding(findings, { code: 'PROMPT_TRANSFORMATION_NOT_ALLOWED', severity: 'critical', blocking: true, constraintIds: [], sourceIds: [], sectionIds: [], decisionIds: [], assetIds: [], explanation: 'Candidate contains a transformation outside the Prompt Guard AST allowlist.' })
    })
    if (candidate.transformations.some((transformation) => transformation.kind === 'rephrase') && transformationSectionIds.size === 0) addGuardFinding(findings, { code: 'PROMPT_TRANSFORMATION_INVALID', severity: 'critical', blocking: true, constraintIds: [], sourceIds: [], sectionIds: [], decisionIds: [], assetIds: [], explanation: 'Rephrase transformation set is malformed.' })
    const blocking = findings.some((finding) => finding.blocking)
    if (blocking) return guardResult(safeInput, safeInput.policy === 'fallback' ? 'fallback' : 'rejected', findings)
    return guardResult(safeInput, 'accepted', findings, candidate)
  }
}

export const DeterministicPromptGuard = PromptGuard

export function guardPromptCandidate(input: PromptGuardInput): PromptGuardResult {
  return new PromptGuard().guard(input)
}

export const guardPrompt = guardPromptCandidate

export interface ProviderRenderInput {
  promptIR: PromptIR
  candidate?: PromptCandidateIR
  guardResult?: PromptGuardResult
  caseId?: string
  caseRevision?: number
  contextHash?: string
  pipelinePlanHash?: string
}

function renderProjection(request: Omit<ProviderRenderRequest, 'requestHash'>): JsonObject {
  return jsonReady({
    schemaVersion: PROVIDER_RENDER_REQUEST_SCHEMA_VERSION,
    id: request.id,
    caseId: request.caseId,
    caseRevision: request.caseRevision,
    contextHash: request.contextHash,
    promptIRHash: request.promptIRHash,
    ...(request.promptCandidateHash === undefined ? {} : { promptCandidateHash: request.promptCandidateHash }),
    ...(request.guardResultHash === undefined ? {} : { guardResultHash: request.guardResultHash }),
    targetAdapter: clone(request.targetAdapter),
    targetCapabilityProfile: clone(request.targetCapabilityProfile),
    sections: request.sections.map(promptSectionProjection),
    parameters: sortedBy(request.parameters, (item) => item.id).map(promptParameterProjection),
    referenceMappings: [...request.referenceMappings].sort((left, right) => left.order - right.order || compareCodeUnits(left.id, right.id)).map(promptReferenceMappingProjection),
    output: clone(request.output),
    pipelinePlanHash: request.pipelinePlanHash,
  }) as JsonObject
}

export function computeProviderRenderRequestHash(request: ProviderRenderRequest): string {
  return sha256(renderProjection(request))
}

export function createProviderRenderRequest(input: ProviderRenderInput): ProviderRenderRequest {
  const safePrompt = clone(input.promptIR)
  const candidate = input.candidate ? clone(input.candidate) : undefined
  if (computePromptIRHash(safePrompt) !== safePrompt.deterministicSignature) throw new Error('PROMPT_IR_SIGNATURE_MISMATCH')
  if (candidate) {
    if (computePromptCandidateHash(candidate) !== candidate.candidateHash) throw new Error('PROMPT_CANDIDATE_HASH_MISMATCH')
    if (candidate.basePromptIRHash !== safePrompt.deterministicSignature) throw new Error('PROMPT_CANDIDATE_BASE_MISMATCH')
    if (input.guardResult?.status !== 'accepted' || input.guardResult.guardedCandidate?.candidateHash !== candidate.candidateHash) throw new Error('PROMPT_GUARD_REQUIRED')
    if (input.guardResult && computePromptGuardResultHash(input.guardResult) !== input.guardResult.resultHash) throw new Error('PROMPT_GUARD_RESULT_HASH_MISMATCH')
  }
  const sections = candidate ? candidateSections(candidate) : safePrompt.sections
  const parameters = candidate ? candidateParameters(candidate) : safePrompt.parameters
  const mappings = candidate ? candidate.referenceMappings : safePrompt.referenceMappings
  const base: Omit<ProviderRenderRequest, 'requestHash'> = {
    schemaVersion: PROVIDER_RENDER_REQUEST_SCHEMA_VERSION,
    id: hashId('provider-render-request', { prompt: candidate?.candidateHash ?? safePrompt.deterministicSignature, pipelinePlanHash: input.pipelinePlanHash ?? safePrompt.pipelinePlanHash }),
    caseId: input.caseId ?? safePrompt.caseId,
    caseRevision: input.caseRevision ?? safePrompt.caseRevision,
    contextHash: input.contextHash ?? safePrompt.contextHash,
    promptIRHash: safePrompt.deterministicSignature,
    ...(candidate ? { promptCandidateHash: candidate.candidateHash } : {}),
    ...(input.guardResult ? { guardResultHash: input.guardResult.resultHash } : {}),
    targetAdapter: clone(candidate?.targetAdapter ?? safePrompt.targetAdapter),
    targetCapabilityProfile: clone(candidate?.targetCapabilityProfile ?? safePrompt.targetCapabilityProfile),
    sections: clone(sections),
    parameters: clone(parameters),
    referenceMappings: clone(mappings),
    output: clone(safePrompt.output),
    pipelinePlanHash: input.pipelinePlanHash ?? safePrompt.pipelinePlanHash,
  }
  return clone({ ...base, requestHash: sha256(renderProjection(base)) })
}

export const renderProviderRequest = createProviderRenderRequest

export const OFFLINE_EXECUTION_INPUT_SCHEMA_VERSION = 'voce.offline-execution-input/v1alpha1' as const

export interface OfflineExecutionOptions {
  now?: string
  failStepIds?: string[]
  unknownStepIds?: string[]
  retryableFailureStepIds?: string[]
  cancelBeforeStepId?: string
  workerRestartAfterStepId?: string
  cleanupFailureIds?: string[]
  compensationFailureIds?: string[]
  maximumCleanupRetries?: number
}

export interface OfflineExecutionInput {
  schemaVersion: typeof OFFLINE_EXECUTION_INPUT_SCHEMA_VERSION
  context: CompilationContext
  contextHash: string
  constraintIR: ConstraintIR
  referencePlan: ReferencePlan
  pipelinePlan: PipelinePlan
  outputContract: PromptCompilationInput['outputContract']
  promptArtifact: PromptIR|PromptCandidateIR
  promptGuardResult?: PromptGuardResult
  executionAuthorization: ExecutionAuthorization
  remoteCallAuthorizations: RemoteCallAuthorization[]
  options?: OfflineExecutionOptions
}

export interface OfflineExecutionResult {
  status: 'blocked'|ExecutionRunState
  code: string
  reasons: string[]
  executionRun?: ExecutionRun
  run?: ExecutionRun
  events: import('@voce-engine/contracts').StepEvent[]
  receipts: StepReceipt[]
  remoteCallRuns: RemoteCallRun[]
  cleanupReceipts: CleanupReceipt[]
  compensationReceipts: CompensationReceipt[]
  evaluation?: Evaluation
  humanAcceptance?: HumanAcceptance
  trace?: ExecutionTraceProjection
}

export interface MockStepExecutionContext {
  runId: string
  step: PipelineStep
  promptArtifactHash: string
  referencePlanHash: string
  outputContract: OfflineExecutionInput['outputContract']
  attempt: number
  options: OfflineExecutionOptions
}

export interface MockStepExecutionResult {
  status: 'succeeded'|'failed'|'submission_unknown'|'cancelled'
  outputArtifacts: ArtifactHandle[]
  metadata: JsonObject
  providerRequestId?: string
  failureCode?: string
  actualCost?: number
  actualBytes?: number
}

export interface OfflineStepAdapter {
  id: string
  version: VersionPin
  digest: string
  profileDigest?: string
  executeStep(context: MockStepExecutionContext): MockStepExecutionResult
  reconcileStep?(context: MockStepExecutionContext): MockStepExecutionResult
}

function promptArtifactHash(promptArtifact: PromptIR|PromptCandidateIR): string {
  return 'candidateHash' in promptArtifact ? promptArtifact.candidateHash : promptArtifact.deterministicSignature
}

function promptArtifactIntegrityReasons(promptArtifact: PromptIR|PromptCandidateIR, guardResult?: PromptGuardResult): string[] {
  const reasons: string[] = []
  if ('candidateHash' in promptArtifact) {
    if (promptArtifact.schemaVersion !== PROMPT_CANDIDATE_IR_SCHEMA_VERSION || !isHash(promptArtifact.candidateHash) || computePromptCandidateHash(promptArtifact) !== promptArtifact.candidateHash) reasons.push('PROMPT_CANDIDATE_HASH_MISMATCH')
    if (!guardResult || guardResult.status !== 'accepted' || guardResult.guardedCandidate?.candidateHash !== promptArtifact.candidateHash) reasons.push('PROMPT_GUARD_REQUIRED')
    if (guardResult && (!isHash(guardResult.resultHash) || computePromptGuardResultHash(guardResult) !== guardResult.resultHash)) reasons.push('PROMPT_GUARD_RESULT_HASH_MISMATCH')
  } else if (promptArtifact.schemaVersion !== PROMPT_IR_SCHEMA_VERSION || !isHash(promptArtifact.deterministicSignature) || computePromptIRHash(promptArtifact) !== promptArtifact.deterministicSignature) reasons.push('PROMPT_IR_SIGNATURE_MISMATCH')
  return sortedStrings(reasons)
}

function executionAdapterProfileDigests(plan: PipelinePlan): string[] {
  return sortedStrings([plan.profileDigest, ...plan.adapterDigests, ...plan.steps.map((step) => step.profileVersion.digest)])
}

export function computeExecutionDataTransferDigest(plan: PipelinePlan): string {
  return sha256(jsonReady(sortedBy(plan.dataTransfers, (transfer) => transfer.id).map((transfer) => ({ ...clone(transfer), transferHash: transfer.transferHash ?? computeDataTransferHash(transfer) }))))
}

export function computeExecutionBudgetDigest(plan: PipelinePlan): string {
  return sha256(jsonReady(sortedBy(plan.budgets, (budget) => budget.id).map((budget) => ({ ...clone(budget), budgetHash: budget.budgetHash ?? computeBudgetHash(budget) }))))
}

export function computeExecutionStepInputHash(step: PipelineStep, contextHash: string, pipelinePlanHash: string, referencePlanHash: string, promptArtifactHashValue: string, referenceContentHashes: string[] = []): string {
  return sha256({
    stepId: step.id,
    stepHash: step.stepHash ?? computePipelineStepHash(step),
    contextHash,
    pipelinePlanHash,
    referencePlanHash,
    promptArtifactHash: promptArtifactHashValue,
    referenceContentHashes: sortedStrings(referenceContentHashes),
    inputArtifactRoles: sortedStrings(step.inputArtifactRoles),
    outputArtifactRoles: sortedStrings(step.outputArtifactRoles),
  })
}

function executionSnapshot(input: OfflineExecutionInput): import('@voce-engine/contracts').DispatchSnapshot {
  const authorization = input.executionAuthorization
  return {
    kind: 'execution',
    caseId: input.pipelinePlan.caseId,
    caseRevision: input.pipelinePlan.caseRevision,
    contextHash: input.contextHash,
    constraintIRHash: input.constraintIR.deterministicSignature,
    compilationSignature: input.constraintIR.deterministicSignature,
    referencePlanHash: input.referencePlan.planHash,
    pipelinePlanHash: input.pipelinePlan.planHash,
    outputContractHash: computeOutputContractHash(input.outputContract),
    promptArtifactHash: promptArtifactHash(input.promptArtifact),
    adapterProfileDigests: executionAdapterProfileDigests(input.pipelinePlan),
    destinations: sortedStrings(input.pipelinePlan.dataTransfers.map((transfer) => transfer.destination)),
    dataTransferDigest: computeExecutionDataTransferDigest(input.pipelinePlan),
    budgetDigest: computeExecutionBudgetDigest(input.pipelinePlan),
    remoteCallAuthorizationIds: sortedStrings(authorization.remoteCallAuthorizationIds),
  }
}

function executionInputReasons(input: OfflineExecutionInput): string[] {
  const reasons: string[] = []
  if (!input || input.schemaVersion !== OFFLINE_EXECUTION_INPUT_SCHEMA_VERSION) reasons.push('OFFLINE_EXECUTION_INPUT_SCHEMA_INVALID')
  if (!input.context || input.contextHash !== input.context.contextHash || computeCompilationContextHash(input.context) !== input.contextHash) reasons.push('PROMPT_CONTEXT_HASH_MISMATCH')
  if (!input.constraintIR || integrityReasonsForConstraintIR(input.constraintIR, input.context, input.pipelinePlan?.caseId ?? '', input.pipelinePlan?.caseRevision ?? -1).length) reasons.push('CONSTRAINT_IR_INVALID')
  if (!input.referencePlan || integrityReasonsForReferencePlan(input.referencePlan, input.constraintIR, input.pipelinePlan?.caseId ?? '', input.pipelinePlan?.caseRevision ?? -1, input.contextHash).length) reasons.push('REFERENCE_PLAN_INVALID')
  if (!input.pipelinePlan || integrityReasonsForPipelinePlan(input.pipelinePlan, input.constraintIR, input.referencePlan, input.outputContract, input.pipelinePlan?.caseId ?? '', input.pipelinePlan?.caseRevision ?? -1, input.contextHash).length) reasons.push('PIPELINE_PLAN_INVALID')
  if (input.pipelinePlan && (input.pipelinePlan.caseId !== input.context.caseSpecId || input.pipelinePlan.caseRevision !== input.context.caseSpecRevision)) reasons.push('EXECUTION_CASE_MISMATCH')
  if (outputContractReasons(input.outputContract).length) reasons.push('OUTPUT_CONTRACT_INVALID')
  reasons.push(...promptArtifactIntegrityReasons(input.promptArtifact, input.promptGuardResult))
  if (!input.executionAuthorization || computeExecutionAuthorizationHash(input.executionAuthorization) !== input.executionAuthorization.authorizationHash) reasons.push('EXECUTION_AUTHORIZATION_INVALID')
  if (input.executionAuthorization && input.executionAuthorization.caseId !== input.pipelinePlan?.caseId) reasons.push('EXECUTION_AUTHORIZATION_CASE_MISMATCH')
  if (input.executionAuthorization && input.executionAuthorization.caseRevision !== input.pipelinePlan?.caseRevision) reasons.push('EXECUTION_AUTHORIZATION_REVISION_MISMATCH')
  if (input.executionAuthorization && input.executionAuthorization.promptArtifactHash !== promptArtifactHash(input.promptArtifact)) reasons.push('EXECUTION_AUTHORIZATION_PROMPT_MISMATCH')
  for (const step of input.pipelinePlan?.steps ?? []) {
    const budget = step.budget
    if (!Number.isInteger(budget.maximumCalls) || budget.maximumCalls < 1) reasons.push('STEP_BUDGET_CALL_LIMIT_INVALID')
    if (!Number.isInteger(budget.maximumRetries) || budget.maximumRetries < 0 || budget.maximumRetries >= Math.max(budget.maximumCalls, 1)) reasons.push('STEP_BUDGET_RETRY_LIMIT_INVALID')
    if (!Number.isInteger(budget.timeoutMs) || budget.timeoutMs <= 0) reasons.push('STEP_BUDGET_TIMEOUT_INVALID')
    if (budget.maximumCost !== undefined && (!Number.isFinite(budget.maximumCost) || budget.maximumCost < 0)) reasons.push('STEP_BUDGET_COST_INVALID')
    if (budget.maximumBytes !== undefined && (!Number.isInteger(budget.maximumBytes) || budget.maximumBytes < 0)) reasons.push('STEP_BUDGET_BYTES_INVALID')
    if (budget.budgetHash !== undefined && (!isHash(budget.budgetHash) || computeBudgetHash(budget) !== budget.budgetHash)) reasons.push('STEP_BUDGET_HASH_INVALID')
    if (step.dataTransfer.maximumBytes !== undefined && (!Number.isInteger(step.dataTransfer.maximumBytes) || step.dataTransfer.maximumBytes < 0)) reasons.push('STEP_TRANSFER_BYTES_INVALID')
    if (step.dataTransfer.transferHash !== undefined && (!isHash(step.dataTransfer.transferHash) || computeDataTransferHash(step.dataTransfer) !== step.dataTransfer.transferHash)) reasons.push('STEP_TRANSFER_HASH_INVALID')
  }
  return sortedStrings(reasons)
}

function requiredRemoteStep(step: PipelineStep): boolean {
  return step.mayCreateChargedSubmission || step.destination !== 'local'
}

function remoteSnapshot(authorization: RemoteCallAuthorization): import('@voce-engine/contracts').DispatchSnapshot {
  return {
    kind: 'remote_call',
    caseId: authorization.caseId,
    caseRevision: authorization.caseRevision,
    contextHash: authorization.contextHash,
    stepId: authorization.stepId,
    purpose: authorization.purpose,
    inputHash: authorization.inputHash,
    inputManifestHash: authorization.inputManifestHash,
    modelId: authorization.modelId,
    modelVersion: authorization.modelVersion,
    permittedArtifactHashes: sortedStrings(authorization.permittedArtifactHashes),
    permittedScopeIds: sortedStrings(authorization.permittedScopeIds),
    constraintIds: sortedStrings(authorization.constraintIds),
    adapterId: authorization.adapterId,
    adapterDigest: authorization.adapterDigest,
    profileDigest: authorization.profileDigest,
    destination: authorization.destination,
    region: authorization.region,
    dataCategories: sortedStrings(authorization.dataCategories),
    maximumCalls: authorization.maximumCalls,
    maximumRetries: authorization.maximumRetries,
    maximumBytes: authorization.maximumBytes,
    timeoutMs: authorization.timeoutMs,
    maximumCost: authorization.maximumCost,
    currency: authorization.currency,
    idempotencyKey: authorization.idempotencyKey,
  }
}

function remoteAuthorizationReasons(input: OfflineExecutionInput): string[] {
  const reasons: string[] = []
  const byStep = new Map<string, RemoteCallAuthorization>()
  const seenAuthorizationIds = new Set<string>()
  const authorizationIds = new Set(input.executionAuthorization.remoteCallAuthorizationIds)
  const referenceHashes = input.referencePlan.ordered.map((reference) => reference.contentHash)
  for (const authorization of sortedBy(input.remoteCallAuthorizations, (item) => item.id)) {
    if (seenAuthorizationIds.has(authorization.id)) reasons.push('REMOTE_AUTHORIZATION_ID_DUPLICATE')
    seenAuthorizationIds.add(authorization.id)
    if (!authorizationIds.has(authorization.id)) reasons.push('REMOTE_AUTHORIZATION_NOT_BOUND')
    if (computeRemoteCallAuthorizationHash(authorization) !== authorization.authorizationHash) reasons.push('REMOTE_AUTHORIZATION_HASH_MISMATCH')
    const step = input.pipelinePlan.steps.find((item) => item.id === authorization.stepId)
    if (!step || !requiredRemoteStep(step)) reasons.push('REMOTE_AUTHORIZATION_STEP_INVALID')
    if (step) {
      const expectedInputHash = computeExecutionStepInputHash(step, input.contextHash, input.pipelinePlan.planHash, input.referencePlan.planHash, promptArtifactHash(input.promptArtifact), referenceHashes)
      if (authorization.inputHash !== expectedInputHash) reasons.push('REMOTE_AUTHORIZATION_INPUT_MISMATCH')
      if (authorization.caseId !== input.pipelinePlan.caseId || authorization.caseRevision !== input.pipelinePlan.caseRevision || authorization.contextHash !== input.contextHash) reasons.push('REMOTE_AUTHORIZATION_CONTEXT_MISMATCH')
      if (authorization.adapterId !== step.adapterId || authorization.adapterDigest !== step.adapterVersion.digest || authorization.destination !== step.destination) reasons.push('REMOTE_AUTHORIZATION_ADAPTER_MISMATCH')
      if (authorization.profileDigest !== undefined && authorization.profileDigest !== step.profileVersion.digest) reasons.push('REMOTE_AUTHORIZATION_PROFILE_MISMATCH')
      if (authorization.maximumCalls > step.budget.maximumCalls || authorization.maximumRetries > step.budget.maximumRetries || authorization.timeoutMs > step.budget.timeoutMs) reasons.push('REMOTE_AUTHORIZATION_BUDGET_EXCEEDED')
      if (byStep.has(step.id)) reasons.push('REMOTE_AUTHORIZATION_STEP_DUPLICATE')
      else byStep.set(step.id, authorization)
      const preflight = dispatchPreflight(authorization, remoteSnapshot(authorization), input.options?.now ?? FIXED_M5_TIME)
      if (preflight.status !== 'authorized') reasons.push(...preflight.reasons.map((reason) => `REMOTE_${reason}`))
    }
  }
  for (const step of input.pipelinePlan.steps) {
    if (!requiredRemoteStep(step)) continue
    const authorization = byStep.get(step.id)
    if (!authorization) reasons.push('REMOTE_AUTHORIZATION_MISSING')
    else if (!authorizationIds.has(authorization.id)) reasons.push('REMOTE_AUTHORIZATION_ID_NOT_BOUND')
  }
  for (const id of authorizationIds) if (!input.remoteCallAuthorizations.some((authorization) => authorization.id === id)) reasons.push('REMOTE_AUTHORIZATION_RECORD_MISSING')
  return sortedStrings(reasons)
}

function virtualArtifact(runId: string, step: PipelineStep, role: string, mediaType: string): ArtifactHandle {
  const contentHash = sha256({ fixture: 'voce-offline-mock-artifact', runId, stepId: step.id, role, mediaType })
  return {
    id: `mock-artifact-${contentHash.slice('sha256:'.length, 'sha256:'.length + 24)}`,
    storeId: 'voce-mock-store',
    contentHash,
    mediaType,
    role,
    resolverId: 'voce.mock.offline',
    availability: 'available',
    retentionClass: 'fixture',
    redactionPolicy: 'hash-only',
  }
}

function mockMediaType(step: PipelineStep): string {
  if (step.adapterId === 'mock.jpeg-generator') return 'image/jpeg'
  if (step.type === 'postprocess' || step.type === 'normalize') return 'image/png'
  return step.type === 'generate' ? 'image/png' : 'application/json'
}

export interface MockProviderAdapterOptions {
  failStepIds?: string[]
  unknownStepIds?: string[]
  retryableFailureStepIds?: string[]
  version?: VersionPin
  digest?: string
  profileDigest?: string
}

export class MockProviderAdapter implements ProviderAdapter, OfflineStepAdapter {
  readonly id: string
  readonly version: VersionPin
  readonly digest: string
  readonly profileDigest?: string
  readonly offline = true
  private readonly options: MockProviderAdapterOptions

  constructor(options: MockProviderAdapterOptions = {}, id = 'voce.mock.offline') {
    this.id = id
    this.version = clone(options.version ?? { id, version: '1.0.0', digest: options.digest ?? sha256({ adapter: id, version: '1.0.0', fixture: 'offline' }) })
    this.digest = options.digest ?? this.version.digest
    this.profileDigest = options.profileDigest
    this.options = { failStepIds: sortedStrings(options.failStepIds), unknownStepIds: sortedStrings(options.unknownStepIds), retryableFailureStepIds: sortedStrings(options.retryableFailureStepIds) }
  }

  render(request: ProviderRenderRequest): ProviderRenderResult {
    const safeRequest = clone(request)
    const requestHash = computeProviderRenderRequestHash(safeRequest)
    if (requestHash !== safeRequest.requestHash) {
      const failed: Omit<ProviderRenderResult, 'resultHash'> = { schemaVersion: PROVIDER_RENDER_RESULT_SCHEMA_VERSION, status: 'failed', requestHash: safeRequest.requestHash, adapterId: this.id, adapterVersion: clone(this.version), outputArtifacts: [], metadata: { offline: true, provider: this.id }, failureCode: 'PROVIDER_RENDER_REQUEST_HASH_MISMATCH' }
      return clone({ ...failed, resultHash: sha256(jsonReady(failed)) })
    }
    const base: Omit<ProviderRenderResult, 'resultHash'> = { schemaVersion: PROVIDER_RENDER_RESULT_SCHEMA_VERSION, status: 'ok', requestHash, adapterId: this.id, adapterVersion: clone(this.version), providerRequestId: `mock-request-${hashId('request', { requestHash, adapter: this.id }).slice('request-'.length)}`, outputArtifacts: [], metadata: { offline: true, virtual: true, adapterId: this.id } }
    return clone({ ...base, resultHash: sha256(jsonReady(base)) })
  }

  executeStep(context: MockStepExecutionContext): MockStepExecutionResult {
    const stepId = context.step.id
    const unknown = this.options.unknownStepIds?.includes(stepId) || context.options.unknownStepIds?.includes(stepId)
    if (unknown) return { status: 'submission_unknown', outputArtifacts: [], metadata: { offline: true, virtual: true, provider: this.id }, providerRequestId: `mock-unknown-${hashId('request', { stepId, attempt: context.attempt }).slice('request-'.length)}`, failureCode: 'REMOTE_SUBMISSION_UNKNOWN', actualCost: 0 }
    const retryable = this.options.retryableFailureStepIds?.includes(stepId) || context.options.retryableFailureStepIds?.includes(stepId)
    const shouldFail = this.options.failStepIds?.includes(stepId) || context.options.failStepIds?.includes(stepId)
    if (shouldFail && (!retryable || context.attempt === 1)) return { status: 'failed', outputArtifacts: [], metadata: { offline: true, virtual: true, provider: this.id }, failureCode: 'MOCK_STEP_FAILED', actualCost: 0 }
    const mediaType = mockMediaType(context.step)
    const artifacts: ArtifactHandle[] = []
    if (context.step.type === 'resolve_asset') artifacts.push(virtualArtifact(context.runId, context.step, 'provider-readable-reference', 'image/png'))
    if (context.step.type === 'publish_asset') artifacts.push(virtualArtifact(context.runId, context.step, 'published_reference', 'image/png'))
    if (context.step.type === 'generate') artifacts.push(virtualArtifact(context.runId, context.step, 'generated-image', mediaType))
    if (context.step.type === 'postprocess') artifacts.push(...context.step.outputArtifactRoles.map((role) => virtualArtifact(context.runId, context.step, role, mediaType)))
    if (context.step.type === 'normalize') artifacts.push(virtualArtifact(context.runId, context.step, 'normalized-image', mediaType === 'application/json' ? 'image/png' : mediaType))
    const remote = requiredRemoteStep(context.step)
    return { status: 'succeeded', outputArtifacts: artifacts, metadata: { offline: true, virtual: true, provider: this.id, stepType: context.step.type, destination: context.step.destination, budgetId: context.step.budget.id }, ...(remote ? { providerRequestId: `mock-request-${hashId('request', { stepId, attempt: context.attempt }).slice('request-'.length)}` } : {}), actualCost: 0 }
  }

  reconcileStep(context: MockStepExecutionContext): MockStepExecutionResult {
    const mediaType = mockMediaType(context.step)
    const outputArtifacts = context.step.outputArtifactRoles.map((role) => virtualArtifact(context.runId, context.step, role, mediaType))
    return {
      status: 'succeeded',
      outputArtifacts,
      metadata: { offline: true, virtual: true, reconciled: true, provider: this.id, stepType: context.step.type, destination: context.step.destination, budgetId: context.step.budget.id },
      providerRequestId: `mock-reconciled-${hashId('request', { runId: context.runId, stepId: context.step.id }).slice('request-'.length)}`,
      actualCost: 0,
    }
  }
}

export class MockGeneratorAdapter extends MockProviderAdapter {
  constructor(options: MockProviderAdapterOptions = {}) { super(options, 'mock.image-generator') }
}

export class MockPostprocessorAdapter extends MockProviderAdapter {
  constructor(options: MockProviderAdapterOptions = {}) { super(options, 'voce.postprocessor') }
}

export class MockNormalizerAdapter extends MockProviderAdapter {
  constructor(options: MockProviderAdapterOptions = {}) { super(options, 'voce.image-normalizer') }
}

export class MockStructuralValidatorAdapter extends MockProviderAdapter {
  constructor(options: MockProviderAdapterOptions = {}) { super(options, 'voce.structural-validator') }
}

function adapterCanRender(adapter: OfflineStepAdapter): adapter is OfflineStepAdapter & ProviderAdapter {
  return typeof (adapter as unknown as { render?: unknown }).render === 'function'
}

function eventProjection(event: StepEvent): JsonObject {
  const value = clone(event) as unknown as Record<string, unknown>
  delete value.eventHash
  delete value.id
  delete value.runId
  delete value.sequence
  delete value.at
  return value as JsonObject
}

function receiptProjection(receipt: StepReceipt): JsonObject {
  const value = clone(receipt) as unknown as Record<string, unknown>
  delete value.receiptHash
  delete value.id
  delete value.runId
  delete value.eventIds
  delete value.firstSequence
  delete value.lastSequence
  return value as JsonObject
}

function cleanupReceiptProjection(receipt: CleanupReceipt): JsonObject {
  const value = clone(receipt) as unknown as Record<string, unknown>
  delete value.receiptHash
  delete value.id
  delete value.runId
  delete value.eventIds
  return value as JsonObject
}

function compensationReceiptProjection(receipt: CompensationReceipt): JsonObject {
  const value = clone(receipt) as unknown as Record<string, unknown>
  delete value.receiptHash
  delete value.id
  delete value.runId
  delete value.eventIds
  return value as JsonObject
}

function executionRunProjection(run: ExecutionRun): JsonObject {
  const value = clone(run) as unknown as Record<string, unknown>
  delete value.runHash
  delete value.createdAt
  delete value.updatedAt
  delete value.eventCount
  return value as JsonObject
}

function makeEvent(runId: string, sequence: number, step: PipelineStep, state: StepEventState, now: string, promptHash: string, authorizationId: string|undefined, inputHash: string|undefined, outputHashes: string[], attempt: number, retriesUsed: number, providerRequestId?: string, failureCode?: string, cost?: number, bytes?: number): StepEvent {
  const base: Omit<StepEvent, 'eventHash'> = {
    schemaVersion: STEP_EVENT_SCHEMA_VERSION,
    id: hashId('step-event', { runId, sequence, stepId: step.id, state, inputHash, outputHashes }),
    runId,
    sequence,
    stepId: step.id,
    state,
    at: now,
    contextHash: '',
    pipelinePlanHash: '',
    promptArtifactHash: promptHash,
    ...(authorizationId ? { authorizationId } : {}),
    ...(inputHash ? { inputHash } : {}),
    outputHashes: sortedStrings(outputHashes),
    adapterId: step.adapterId,
    adapterVersion: clone(step.adapterVersion),
    profileDigest: step.profileVersion.digest,
    ...(providerRequestId ? { providerRequestId } : {}),
    destination: step.destination,
    dataCategories: sortedStrings(step.dataTransfer.dataCategories),
    budgetId: step.budget.id,
    attempt,
    retriesUsed,
    ...(cost === undefined ? {} : { cost }),
    ...(bytes === undefined ? {} : { bytes }),
    ...(failureCode ? { failureCode } : {}),
    safeReferences: [],
  }
  return { ...base, eventHash: sha256(eventProjection(base as StepEvent)) }
}

function bindEvent(event: StepEvent, contextHash: string, pipelinePlanHash: string): StepEvent {
  const base = { ...clone(event), contextHash, pipelinePlanHash, eventHash: '' }
  return clone({ ...base, eventHash: sha256(eventProjection(base)) })
}

function makeCleanupEvent(runId: string, sequence: number, cleanup: Cleanup, state: StepEventState, now: string, failureCode?: string): StepEvent {
  const step: PipelineStep = {
    schemaVersion: 'voce.pipeline-step/v1alpha1',
    id: cleanup.id,
    type: 'cleanup',
    adapterId: 'voce.cleanup',
    adapterVersion: { id: 'voce.cleanup', version: '1.0.0', digest: sha256({ adapter: 'voce.cleanup' }) },
    profileVersion: { id: 'voce.cleanup', version: '1.0.0', digest: sha256({ profile: 'voce.cleanup' }) },
    inputArtifactRoles: cleanup.artifactRoles,
    outputArtifactRoles: [],
    dependsOn: [],
    budget: { schemaVersion: 'voce.budget/v1alpha1', id: `cleanup-${cleanup.id}`, maximumCalls: 1, maximumRetries: 2, timeoutMs: 30_000 },
    dataTransfer: { schemaVersion: 'voce.data-transfer/v1alpha1', id: `cleanup-transfer-${cleanup.id}`, adapterId: 'voce.cleanup', destination: cleanup.destination, dataCategories: cleanup.dataCategories, purpose: 'cleanup' },
    destination: cleanup.destination,
    cancellation: { cancellable: false, onCancel: 'continue' },
    cleanupObligationIds: [], compensationIds: [], mayCreateChargedSubmission: false, capability: 'cleanup',
  }
  return makeEvent(runId, sequence, step, state, now, '', undefined, undefined, [], 1, 0, undefined, failureCode)
}

function makeStepReceipt(runId: string, step: PipelineStep, events: StepEvent[], cleanupStatus: StepReceipt['cleanupStatus']): StepReceipt {
  const terminal = events[events.length - 1]
  const base: Omit<StepReceipt, 'receiptHash'> = {
    schemaVersion: STEP_RECEIPT_SCHEMA_VERSION,
    id: hashId('step-receipt', { runId, stepId: step.id, eventIds: events.map((event) => event.id), state: terminal?.state }),
    runId,
    stepId: step.id,
    state: terminal?.state ?? 'skipped',
    eventIds: events.map((event) => event.id),
    firstSequence: events[0]?.sequence ?? 0,
    lastSequence: terminal?.sequence ?? 0,
    ...(terminal?.authorizationId ? { authorizationId: terminal.authorizationId } : {}),
    ...(terminal?.inputHash ? { inputHash: terminal.inputHash } : {}),
    outputHashes: sortedStrings(events.flatMap((event) => event.outputHashes)),
    adapterId: step.adapterId,
    adapterVersion: clone(step.adapterVersion),
    profileDigest: step.profileVersion.digest,
    ...(terminal?.providerRequestId ? { providerRequestId: terminal.providerRequestId } : {}),
    destination: step.destination,
    dataCategories: sortedStrings(step.dataTransfer.dataCategories),
    budgetId: step.budget.id,
    maximumCalls: step.budget.maximumCalls,
    maximumRetries: step.budget.maximumRetries,
    timeoutMs: step.budget.timeoutMs,
    attempts: Math.max(...events.map((event) => event.attempt), 1),
    retriesUsed: Math.max(...events.map((event) => event.retriesUsed), 0),
    ...(terminal?.cost === undefined ? {} : { actualCost: terminal.cost }),
    ...(terminal?.bytes === undefined ? {} : { actualBytes: terminal.bytes }),
    ...(terminal?.failureCode ? { failureCode: terminal.failureCode } : {}),
    cleanupStatus,
  }
  return clone({ ...base, receiptHash: sha256(receiptProjection(base as StepReceipt)) })
}

function makeCleanupReceipt(runId: string, cleanup: Cleanup, events: StepEvent[], failed: boolean, maximumRetries: number): CleanupReceipt {
  const base: Omit<CleanupReceipt, 'receiptHash'> = {
    schemaVersion: CLEANUP_RECEIPT_SCHEMA_VERSION,
    id: hashId('cleanup-receipt', { runId, cleanupId: cleanup.id }),
    runId,
    cleanupId: cleanup.id,
    status: failed ? 'cleanup_failed' : 'succeeded',
    attempts: failed ? maximumRetries + 1 : 1,
    maximumRetries,
    artifactRoles: sortedStrings(cleanup.artifactRoles),
    destination: cleanup.destination,
    dataCategories: sortedStrings(cleanup.dataCategories),
    eventIds: events.map((event) => event.id),
    ...(failed ? { failureCode: 'CLEANUP_FAILED' } : {}),
  }
  return clone({ ...base, receiptHash: sha256(cleanupReceiptProjection(base as CleanupReceipt)) })
}

function makeCompensationReceipt(runId: string, compensation: Compensation, events: StepEvent[], failed: boolean, maximumRetries: number): CompensationReceipt {
  const base: Omit<CompensationReceipt, 'receiptHash'> = {
    schemaVersion: COMPENSATION_RECEIPT_SCHEMA_VERSION,
    id: hashId('compensation-receipt', { runId, compensationId: compensation.id }),
    runId,
    compensationId: compensation.id,
    trigger: compensation.trigger,
    cleanupId: compensation.cleanupId,
    status: failed ? 'cleanup_failed' : 'succeeded',
    attempts: failed ? maximumRetries + 1 : 1,
    maximumRetries,
    eventIds: events.map((event) => event.id),
    ...(failed ? { failureCode: 'CLEANUP_FAILED' } : {}),
  }
  return clone({ ...base, receiptHash: sha256(compensationReceiptProjection(base as CompensationReceipt)) })
}

interface OfflineRuntimeRecord {
  input: OfflineExecutionInput
  options: Required<OfflineExecutionOptions>
  run: ExecutionRun
  events: StepEvent[]
  receipts: StepReceipt[]
  remoteCallRuns: RemoteCallRun[]
  cleanupReceipts: CleanupReceipt[]
  compensationReceipts: CompensationReceipt[]
  evaluation?: Evaluation
  humanAcceptance?: HumanAcceptance
  trace?: ExecutionTraceProjection
}

function normalizedExecutionOptions(options: OfflineExecutionOptions = {}): Required<OfflineExecutionOptions> {
  const maximumCleanupRetries = Number.isInteger(options.maximumCleanupRetries) && (options.maximumCleanupRetries ?? 0) >= 0
    ? Math.min(options.maximumCleanupRetries ?? 0, 3)
    : 1
  return {
    now: options.now ?? FIXED_M5_TIME,
    failStepIds: sortedStrings(options.failStepIds),
    unknownStepIds: sortedStrings(options.unknownStepIds),
    retryableFailureStepIds: sortedStrings(options.retryableFailureStepIds),
    cancelBeforeStepId: options.cancelBeforeStepId ?? '',
    workerRestartAfterStepId: options.workerRestartAfterStepId ?? '',
    cleanupFailureIds: sortedStrings(options.cleanupFailureIds),
    compensationFailureIds: sortedStrings(options.compensationFailureIds),
    maximumCleanupRetries,
  }
}

function executionRunHash(run: ExecutionRun): string {
  return sha256(executionRunProjection(run))
}

export function computeExecutionRunHash(run: ExecutionRun): string {
  return executionRunHash(run)
}

function traceProjection(trace: ExecutionTraceProjection): JsonObject {
  const value = clone(trace) as unknown as Record<string, unknown>
  delete value.traceHash
  value.events = sortedBy((value.events as StepEvent[] | undefined) ?? [], (event) => `${event.sequence}|${event.id}`)
  value.receipts = sortedBy((value.receipts as StepReceipt[] | undefined) ?? [], (receipt) => receipt.stepId)
  value.remoteCallRuns = sortedBy((value.remoteCallRuns as RemoteCallRun[] | undefined) ?? [], (item) => item.stepId)
  value.cleanupReceipts = sortedBy((value.cleanupReceipts as CleanupReceipt[] | undefined) ?? [], (item) => item.cleanupId)
  value.compensationReceipts = sortedBy((value.compensationReceipts as CompensationReceipt[] | undefined) ?? [], (item) => item.compensationId)
  return value as JsonObject
}

export function computeExecutionTraceHash(trace: ExecutionTraceProjection): string {
  return sha256(traceProjection(trace))
}

export function projectExecutionTrace(trace: ExecutionTraceProjection): ExecutionTraceProjection {
  const base = traceProjection(trace) as unknown as Omit<ExecutionTraceProjection, 'traceHash'>
  return clone({ ...base, traceHash: sha256(base as unknown as JsonObject) })
}

export const deterministicTraceProjection = projectExecutionTrace

export function serializeExecutionTrace(trace: ExecutionTraceProjection): string {
  return canonicalize(jsonReady(projectExecutionTrace(trace)))
}

export const executionTraceJson = serializeExecutionTrace

function evaluationForRun(runId: string, artifacts: ArtifactHandle[], needsReview: boolean, outcome: 'success'|'failure'|'cancel'|'unknown'): Evaluation {
  const artifactIds = sortedStrings(artifacts.map((artifact) => artifact.id))
  const failed = outcome === 'failure'
  const uncertain = outcome === 'cancel' || outcome === 'unknown'
  const finding = {
    id: hashId('evaluation-finding', { runId, status: failed ? 'fail' : needsReview || uncertain ? 'needs_review' : 'pass' }),
    code: failed ? 'TECHNICAL_EXECUTION_FAILED' : outcome === 'unknown' ? 'REMOTE_SUBMISSION_UNKNOWN' : outcome === 'cancel' ? 'EXECUTION_CANCELLED' : needsReview ? 'HUMAN_ACCEPTANCE_REQUIRED' : 'STRUCTURAL_VALIDATION_PASSED',
    status: failed ? 'fail' as const : needsReview || uncertain ? 'needs_review' as const : 'pass' as const,
    severity: failed ? 'error' as const : needsReview || uncertain ? 'warning' as const : 'info' as const,
    explanation: failed ? 'The offline execution did not complete all pipeline steps.' : outcome === 'unknown' ? 'The provider-semantic submission remains uncertain and requires explicit reconciliation.' : outcome === 'cancel' ? 'The execution was cancelled without changing its technical execution record into a provider failure.' : needsReview ? 'Technical execution completed and awaits separate human acceptance.' : 'The offline structural validation path completed.',
    sourceIds: [],
    artifactIds,
  }
  const base: Omit<Evaluation, 'evaluationHash'> = {
    schemaVersion: EVALUATION_SCHEMA_VERSION,
    id: hashId('evaluation', { runId, finding: finding.code }),
    runId,
    technicalStatus: failed ? 'failed' : needsReview || uncertain ? 'needs_review' : 'passed',
    findings: [finding],
    artifactIds,
  }
  return clone({ ...base, evaluationHash: sha256(base as unknown as JsonObject) })
}

function humanAcceptanceForRun(runId: string, artifacts: ArtifactHandle[]): HumanAcceptance {
  const base: Omit<HumanAcceptance, 'acceptanceHash'> = {
    schemaVersion: HUMAN_ACCEPTANCE_SCHEMA_VERSION,
    id: hashId('human-acceptance', { runId }),
    runId,
    status: 'pending',
    artifactIds: sortedStrings(artifacts.map((artifact) => artifact.id)),
  }
  return clone({ ...base, acceptanceHash: sha256(base as unknown as JsonObject) })
}

function updateHumanAcceptanceHash(acceptance: HumanAcceptance): HumanAcceptance {
  const base = clone(acceptance) as unknown as Record<string, unknown>
  delete base.acceptanceHash
  return clone({ ...base, acceptanceHash: sha256(base as JsonObject) }) as HumanAcceptance
}

function updateStepReceiptHash(receipt: StepReceipt): StepReceipt {
  const base = clone(receipt) as unknown as Record<string, unknown>
  delete base.receiptHash
  return clone({ ...base, receiptHash: sha256(receiptProjection(base as unknown as StepReceipt)) }) as unknown as StepReceipt
}

function updateRemoteCallRunHash(run: RemoteCallRun): RemoteCallRun {
  const base = clone(run) as unknown as Record<string, unknown>
  delete base.runHash
  delete base.id
  delete base.runId
  return clone({ ...run, runHash: sha256(base as JsonObject) })
}

function stepPurpose(step: PipelineStep): RemoteCallAuthorization['purpose'] {
  if (step.type === 'generate') return 'generation'
  if (step.type === 'semantic_review') return 'semantic_review'
  if (step.type === 'publish_asset') return 'asset_publication'
  if (step.type === 'resolve_asset') return 'reference_interpretation'
  return 'postprocessing'
}

function expectedRemoteArtifacts(input: OfflineExecutionInput): string[] {
  return sortedStrings(input.referencePlan.ordered.map((reference) => reference.contentHash))
}

function expectedRemoteScopes(input: OfflineExecutionInput): string[] {
  return sortedStrings(input.referencePlan.ordered.flatMap((reference) => reference.ontologyScopes))
}

function expectedRemoteConstraints(input: OfflineExecutionInput): string[] {
  return sortedStrings(input.constraintIR.constraints.map((constraint) => constraint.id))
}

function remoteAuthorizationExactReasons(input: OfflineExecutionInput): string[] {
  const reasons: string[] = []
  const artifacts = expectedRemoteArtifacts(input)
  const scopes = expectedRemoteScopes(input)
  const constraints = expectedRemoteConstraints(input)
  for (const authorization of input.remoteCallAuthorizations) {
    const step = input.pipelinePlan.steps.find((candidate) => candidate.id === authorization.stepId)
    if (!step) continue
    if (authorization.purpose !== stepPurpose(step)) reasons.push('REMOTE_AUTHORIZATION_PURPOSE_MISMATCH')
    if (canonicalize(sortedStrings(authorization.permittedArtifactHashes)) !== canonicalize(artifacts)) reasons.push('REMOTE_AUTHORIZATION_ARTIFACT_SCOPE_MISMATCH')
    if (canonicalize(sortedStrings(authorization.permittedScopeIds)) !== canonicalize(scopes)) reasons.push('REMOTE_AUTHORIZATION_SCOPE_MISMATCH')
    if (canonicalize(sortedStrings(authorization.constraintIds)) !== canonicalize(constraints)) reasons.push('REMOTE_AUTHORIZATION_CONSTRAINT_SCOPE_MISMATCH')
    if (authorization.profileDigest !== step.profileVersion.digest) reasons.push('REMOTE_AUTHORIZATION_PROFILE_REQUIRED')
    if (authorization.region !== step.dataTransfer.region) reasons.push('REMOTE_AUTHORIZATION_REGION_MISMATCH')
    if (canonicalize(sortedStrings(authorization.dataCategories)) !== canonicalize(sortedStrings(step.dataTransfer.dataCategories))) reasons.push('REMOTE_AUTHORIZATION_DATA_CATEGORIES_MISMATCH')
    const expectedMaximumBytes = step.budget.maximumBytes ?? step.dataTransfer.maximumBytes
    const expectedMaximumCost = step.budget.maximumCost
    if (authorization.maximumCalls !== step.budget.maximumCalls || authorization.maximumRetries !== step.budget.maximumRetries || authorization.timeoutMs !== step.budget.timeoutMs) reasons.push('REMOTE_AUTHORIZATION_BUDGET_MISMATCH')
    if (authorization.maximumBytes !== expectedMaximumBytes || authorization.maximumCost !== expectedMaximumCost || authorization.currency !== step.budget.currency) reasons.push('REMOTE_AUTHORIZATION_BUDGET_BOUND_MISMATCH')
  }
  return sortedStrings(reasons)
}

function safeExecutionInputReasons(input: OfflineExecutionInput): string[] {
  try {
    return executionInputReasons(input)
  } catch {
    return ['OFFLINE_EXECUTION_INPUT_INVALID']
  }
}

function safeRemoteAuthorizationReasons(input: OfflineExecutionInput): string[] {
  try {
    return [...remoteAuthorizationReasons(input), ...remoteAuthorizationExactReasons(input)]
  } catch {
    return ['REMOTE_AUTHORIZATION_INPUT_INVALID']
  }
}

function blockedExecutionResult(code: string, reasons: string[]): OfflineExecutionResult {
  return { status: 'blocked', code, reasons: sortedStrings(reasons), events: [], receipts: [], remoteCallRuns: [], cleanupReceipts: [], compensationReceipts: [] }
}

function runtimeStepEvent(
  record: OfflineRuntimeRecord,
  step: PipelineStep,
  state: StepEventState,
  promptHash: string,
  authorizationId: string | undefined,
  inputHash: string | undefined,
  outputHashes: string[],
  attempt: number,
  retriesUsed: number,
  providerRequestId?: string,
  failureCode?: string,
  cost?: number,
  bytes?: number,
): StepEvent {
  const event = makeEvent(record.run.id, record.events.length + 1, step, state, record.options.now, promptHash, authorizationId, inputHash, outputHashes, attempt, retriesUsed, providerRequestId, failureCode, cost, bytes)
  return bindEvent(event, record.input.contextHash, record.input.pipelinePlan.planHash)
}

function appendRuntimeEvent(record: OfflineRuntimeRecord, event: StepEvent): void {
  record.events.push(clone(event))
  record.run.eventCount = record.events.length
}

function runtimeCleanupEvent(record: OfflineRuntimeRecord, cleanup: Cleanup, state: StepEventState, failureCode?: string): StepEvent {
  return bindEvent(makeCleanupEvent(record.run.id, record.events.length + 1, cleanup, state, record.options.now, failureCode), record.input.contextHash, record.input.pipelinePlan.planHash)
}

function outputArtifactsForResult(result: MockStepExecutionResult): ArtifactHandle[] {
  return result.outputArtifacts.filter((artifact) => artifact.availability === 'available').map((artifact) => clone(artifact))
}

function cleanupConditionMatches(cleanup: Cleanup, outcome: 'success'|'failure'|'cancel'|'unknown', workerRestarted: boolean): boolean {
  if (workerRestarted && cleanup.conditions.includes('on_worker_restart')) return true
  if (cleanup.conditions.includes('always')) return true
  if (outcome === 'success' && cleanup.conditions.includes('on_success')) return true
  if ((outcome === 'failure' || outcome === 'cancel') && cleanup.conditions.includes('on_failure_or_cancel')) return true
  if (outcome === 'unknown' && cleanup.conditions.includes('on_submission_unknown')) return true
  return false
}

function compensationTrigger(outcome: 'success'|'failure'|'cancel'|'unknown', workerRestarted: boolean): Compensation['trigger'] | undefined {
  if (workerRestarted) return 'worker_restart'
  if (outcome === 'failure') return 'failure'
  if (outcome === 'cancel') return 'cancel'
  if (outcome === 'unknown') return 'submission_unknown'
  return undefined
}

function terminalOutcomeFromStep(state: StepEventState | undefined): 'success'|'failure'|'cancel'|'unknown'|undefined {
  if (state === 'succeeded') return 'success'
  if (state === 'failed') return 'failure'
  if (state === 'cancelled') return 'cancel'
  if (state === 'submission_unknown') return 'unknown'
  return undefined
}

function traceForRecord(record: OfflineRuntimeRecord): ExecutionTraceProjection {
  const base: Omit<ExecutionTraceProjection, 'traceHash'> = {
    schemaVersion: EXECUTION_TRACE_SCHEMA_VERSION,
    runId: record.run.id,
    state: record.run.state,
    executionAuthorizationHash: record.input.executionAuthorization.authorizationHash,
    pipelinePlanHash: record.input.pipelinePlan.planHash,
    ...(record.run.promptArtifactHash ? { promptArtifactHash: record.run.promptArtifactHash } : {}),
    events: sortedBy(record.events, (event) => `${String(event.sequence).padStart(12, '0')}|${event.id}`),
    receipts: sortedBy(record.receipts, (receipt) => receipt.stepId),
    remoteCallRuns: sortedBy(record.remoteCallRuns, (item) => item.stepId),
    cleanupReceipts: sortedBy(record.cleanupReceipts, (item) => item.cleanupId),
    compensationReceipts: sortedBy(record.compensationReceipts, (item) => item.compensationId),
    ...(record.evaluation ? { evaluation: clone(record.evaluation) } : {}),
    ...(record.humanAcceptance ? { humanAcceptance: clone(record.humanAcceptance) } : {}),
  }
  return clone({ ...base, traceHash: sha256(traceProjection(base as ExecutionTraceProjection)) })
}

function resultForRecord(record: OfflineRuntimeRecord, code = 'EXECUTION_COMPLETED', reasons: string[] = []): OfflineExecutionResult {
  record.run.eventCount = record.events.length
  record.run.runHash = executionRunHash(record.run)
  record.trace = traceForRecord(record)
  return clone({
    status: record.run.state,
    code,
    reasons: sortedStrings(reasons),
    executionRun: record.run,
    run: record.run,
    events: record.events,
    receipts: record.receipts,
    remoteCallRuns: record.remoteCallRuns,
    cleanupReceipts: record.cleanupReceipts,
    compensationReceipts: record.compensationReceipts,
    ...(record.evaluation ? { evaluation: record.evaluation } : {}),
    ...(record.humanAcceptance ? { humanAcceptance: record.humanAcceptance } : {}),
    trace: record.trace,
  })
}

function refreshReconciledReceipts(record: OfflineRuntimeRecord, steps: PipelineStep[]): void {
  for (const step of steps) {
    const events = record.events.filter((event) => event.stepId === step.id)
    const receipt = makeStepReceipt(record.run.id, step, events, stepCleanupStatus(record, step))
    const index = record.receipts.findIndex((candidate) => candidate.stepId === step.id)
    if (index >= 0) record.receipts[index] = receipt
    else record.receipts.push(receipt)
  }
  for (const remote of record.remoteCallRuns) {
    const stepEvents = record.events.filter((event) => event.stepId === remote.stepId)
    const terminal = stepEvents.at(-1)
    const receipt = record.receipts.find((candidate) => candidate.stepId === remote.stepId)
    if (terminal) remote.state = terminal.state
    if (terminal?.providerRequestId) remote.providerRequestId = terminal.providerRequestId
    if (receipt) remote.receiptId = receipt.id
    record.remoteCallRuns[record.remoteCallRuns.indexOf(remote)] = updateRemoteCallRunHash(remote)
  }
}

function appendReconciliationCleanup(record: OfflineRuntimeRecord, outcome: 'success'|'failure'|'cancel'|'unknown', workerRestarted: boolean): void {
  for (const cleanup of sortedBy(record.input.pipelinePlan.cleanup, (item) => item.id)) {
    if (!cleanupConditionMatches(cleanup, outcome, workerRestarted)) continue
    const cleanupEvents: StepEvent[] = []
    const shouldFail = record.options.cleanupFailureIds.includes(cleanup.id)
    let failedCleanup = false
    for (let attempt = 0; attempt <= record.options.maximumCleanupRetries; attempt += 1) {
      const pending = runtimeCleanupEvent(record, cleanup, 'cleanup_pending')
      appendRuntimeEvent(record, pending); cleanupEvents.push(pending)
      const terminalState: StepEventState = shouldFail ? 'cleanup_failed' : 'cleaned'
      const terminalEvent = runtimeCleanupEvent(record, cleanup, terminalState, shouldFail ? 'CLEANUP_FAILED' : undefined)
      appendRuntimeEvent(record, terminalEvent); cleanupEvents.push(terminalEvent)
      if (!shouldFail) break
      failedCleanup = true
    }
    const receipt = makeCleanupReceipt(record.run.id, cleanup, cleanupEvents, failedCleanup, record.options.maximumCleanupRetries)
    const existingIndex = record.cleanupReceipts.findIndex((candidate) => candidate.cleanupId === cleanup.id)
    if (existingIndex >= 0) record.cleanupReceipts[existingIndex] = receipt
    else record.cleanupReceipts.push(receipt)
  }
}

function appendReconciliationCompensation(record: OfflineRuntimeRecord, outcome: 'success'|'failure'|'cancel'|'unknown', workerRestarted: boolean, completed: Set<string>, failed: Set<string>): void {
  const trigger = compensationTrigger(outcome, workerRestarted)
  if (!trigger) return
  for (const compensation of sortedBy(record.input.pipelinePlan.compensation.filter((item) => item.trigger === trigger && (workerRestarted || item.appliesToStepIds.some((id) => failed.has(id) || !completed.has(id)))), (item) => item.id)) {
    if (record.compensationReceipts.some((receipt) => receipt.compensationId === compensation.id)) continue
    const cleanup = record.input.pipelinePlan.cleanup.find((item) => item.id === compensation.cleanupId)
    if (!cleanup) continue
    const compensationCleanup = { ...cleanup, id: compensation.id, artifactRoles: cleanup.artifactRoles, appliesToStepIds: compensation.appliesToStepIds }
    const compensationEvents: StepEvent[] = []
    const shouldFail = record.options.compensationFailureIds.includes(compensation.id)
    let failedCompensation = false
    for (let attempt = 0; attempt <= record.options.maximumCleanupRetries; attempt += 1) {
      const pending = runtimeCleanupEvent(record, compensationCleanup, 'cleanup_pending')
      appendRuntimeEvent(record, pending); compensationEvents.push(pending)
      const terminalState: StepEventState = shouldFail ? 'cleanup_failed' : 'cleaned'
      const terminalEvent = runtimeCleanupEvent(record, compensationCleanup, terminalState, shouldFail ? 'CLEANUP_FAILED' : undefined)
      appendRuntimeEvent(record, terminalEvent); compensationEvents.push(terminalEvent)
      if (!shouldFail) break
      failedCompensation = true
    }
    record.compensationReceipts.push(makeCompensationReceipt(record.run.id, compensation, compensationEvents, failedCompensation, record.options.maximumCleanupRetries))
  }
}

function makeExecutionRun(input: OfflineExecutionInput, options: Required<OfflineExecutionOptions>): ExecutionRun {
  const promptHash = promptArtifactHash(input.promptArtifact)
  const base: Omit<ExecutionRun, 'runHash'> = {
    schemaVersion: EXECUTION_RUN_SCHEMA_VERSION,
    id: hashId('execution-run', { authorizationHash: input.executionAuthorization.authorizationHash, pipelinePlanHash: input.pipelinePlan.planHash, promptHash, options }),
    caseId: input.pipelinePlan.caseId,
    caseRevision: input.pipelinePlan.caseRevision,
    contextHash: input.contextHash,
    constraintIRHash: input.constraintIR.deterministicSignature,
    referencePlanHash: input.referencePlan.planHash,
    pipelinePlanHash: input.pipelinePlan.planHash,
    promptArtifactHash: promptHash,
    executionAuthorizationId: input.executionAuthorization.id,
    state: 'queued',
    technicalOutcome: 'pending',
    createdAt: options.now,
    updatedAt: options.now,
    eventCount: 0,
    stepIds: sortedStrings(input.pipelinePlan.steps.map((step) => step.id)),
    outputArtifacts: [],
    cleanupStatus: 'pending',
  }
  return clone({ ...base, runHash: executionRunHash(base as ExecutionRun) })
}

function makeRemoteCallRun(record: OfflineRuntimeRecord, step: PipelineStep, authorization: RemoteCallAuthorization, receipt: StepReceipt): RemoteCallRun {
  const terminal = record.events.filter((event) => event.stepId === step.id).at(-1)
  const base: Omit<RemoteCallRun, 'runHash'> = {
    schemaVersion: REMOTE_CALL_RUN_SCHEMA_VERSION,
    id: hashId('remote-call-run', { runId: record.run.id, stepId: step.id, authorizationId: authorization.id }),
    runId: record.run.id,
    stepId: step.id,
    authorizationId: authorization.id,
    inputHash: authorization.inputHash,
    state: terminal?.state ?? 'failed',
    provider: step.adapterId,
    adapterId: step.adapterId,
    profileDigest: step.profileVersion.digest,
    destination: step.destination,
    budgetId: step.budget.id,
    maximumCalls: authorization.maximumCalls,
    maximumRetries: authorization.maximumRetries,
    timeoutMs: authorization.timeoutMs,
    receiptId: receipt.id,
    ...(terminal?.providerRequestId ? { providerRequestId: terminal.providerRequestId } : {}),
  }
  const hashBase = objectOf(base)
  delete hashBase.id
  delete hashBase.runId
  return clone({ ...base, runHash: sha256(hashBase) })
}

function stepCleanupStatus(record: OfflineRuntimeRecord, step: PipelineStep): StepReceipt['cleanupStatus'] {
  const applicable = record.cleanupReceipts.filter((receipt) => {
    const cleanup = record.input.pipelinePlan.cleanup.find((candidate) => candidate.id === receipt.cleanupId)
    return cleanup?.appliesToStepIds.includes(step.id)
  })
  if (applicable.some((receipt) => receipt.status === 'cleanup_failed')) return 'cleanup_failed'
  if (applicable.length) return 'cleaned'
  return 'not_required'
}

function executionOutcomeStatus(outcome: 'success'|'failure'|'cancel'|'unknown', needsReview: boolean): { state: ExecutionRunState; technicalOutcome: ExecutionRun['technicalOutcome'] } {
  if (outcome === 'unknown') return { state: 'submission_unknown', technicalOutcome: 'unknown' }
  if (outcome === 'cancel') return { state: 'cancelled', technicalOutcome: 'cancelled' }
  if (outcome === 'failure') return { state: 'failed', technicalOutcome: 'failed' }
  return { state: needsReview ? 'needs_review' : 'completed', technicalOutcome: 'succeeded' }
}

function pipelineExecutionOrder(steps: PipelineStep[]): PipelineStep[] {
  const remaining = new Map(sortedBy(steps, (step) => step.id).map((step) => [step.id, step]))
  const completed = new Set<string>()
  const ordered: PipelineStep[] = []
  while (remaining.size) {
    const ready = [...remaining.values()].filter((step) => step.dependsOn.every((dependency) => completed.has(dependency) || !remaining.has(dependency))).sort((left, right) => compareCodeUnits(left.id, right.id))
    if (!ready.length) return [...ordered, ...sortedBy([...remaining.values()], (step) => step.id)]
    const next = ready[0]
    remaining.delete(next.id)
    completed.add(next.id)
    ordered.push(next)
  }
  return ordered
}

function adapterRegistrationReasons(steps: PipelineStep[], adapters: Map<string, OfflineStepAdapter>): string[] {
  const reasons: string[] = []
  for (const step of steps) {
    const adapter = adapters.get(step.adapterId)
    if (!adapter) {
      reasons.push(`ADAPTER_NOT_REGISTERED:${step.adapterId}`)
      continue
    }
    const versionMatches = adapter.id === step.adapterId
      && adapter.version.id === step.adapterVersion.id
      && adapter.version.version === step.adapterVersion.version
      && adapter.version.digest === step.adapterVersion.digest
      && adapter.digest === step.adapterVersion.digest
    if (!versionMatches) reasons.push(`ADAPTER_BINDING_MISMATCH:${step.id}`)
    if (adapter.profileDigest !== undefined && adapter.profileDigest !== step.profileVersion.digest) reasons.push(`ADAPTER_PROFILE_BINDING_MISMATCH:${step.id}`)
  }
  return sortedStrings(reasons)
}

interface RegisteredStepExecutionResult {
  terminal: StepEventState
  terminalResult?: MockStepExecutionResult
  outcome: 'success'|'failure'|'cancel'|'unknown'
}

export class OfflineExecutionRuntime {
  private readonly adapters: Map<string, OfflineStepAdapter>
  private readonly records = new Map<string, OfflineRuntimeRecord>()

  constructor(adapter?: OfflineStepAdapter, adapters: OfflineStepAdapter[] = []) {
    this.adapters = new Map(adapters.map((candidate) => [candidate.id, candidate]))
    if (adapter) this.adapters.set(adapter.id, adapter)
  }

  private executeRegisteredStep(record: OfflineRuntimeRecord, step: PipelineStep, authorization: RemoteCallAuthorization | undefined): RegisteredStepExecutionResult {
    const input = record.input
    const options = record.options
    const promptHash = promptArtifactHash(input.promptArtifact)
    const inputHash = computeExecutionStepInputHash(step, input.contextHash, input.pipelinePlan.planHash, input.referencePlan.planHash, promptHash, input.referencePlan.ordered.map((reference) => reference.contentHash))
    const append = (event: StepEvent): void => { appendRuntimeEvent(record, event) }
    append(runtimeStepEvent(record, step, 'authorized', promptHash, authorization?.id, inputHash, [], 0, 0))
    const adapter = this.adapters.get(step.adapterId)
    if (!adapter) {
      append(runtimeStepEvent(record, step, 'failed', promptHash, authorization?.id, inputHash, [], 0, 0, undefined, 'ADAPTER_NOT_REGISTERED'))
      return { terminal: 'failed', outcome: 'failure' }
    }
    const remote = requiredRemoteStep(step)
    let attempts = 0
    let retries = 0
    let spentCost = 0
    let spentBytes = 0
    let terminal: StepEventState = 'failed'
    let terminalResult: MockStepExecutionResult | undefined
    while (attempts < step.budget.maximumCalls) {
      attempts += 1
      if (remote) append(runtimeStepEvent(record, step, 'submitted', promptHash, authorization?.id, inputHash, [], attempts, retries))
      let result: MockStepExecutionResult
      try {
        let renderedRequestId: string | undefined
        if (attempts === 1 && step.type === 'generate' && adapterCanRender(adapter)) {
          const promptIR = 'candidateHash' in input.promptArtifact ? input.promptGuardResult?.deterministicFallback : input.promptArtifact
          if (!promptIR) result = { status: 'failed', outputArtifacts: [], metadata: { offline: true, virtual: true, adapterId: adapter.id }, failureCode: 'PROMPT_RENDER_INPUT_MISSING', actualCost: 0 }
          else {
            const rendered = adapter.render(createProviderRenderRequest({ promptIR, candidate: 'candidateHash' in input.promptArtifact ? input.promptArtifact : undefined, guardResult: input.promptGuardResult, caseId: input.pipelinePlan.caseId, caseRevision: input.pipelinePlan.caseRevision, contextHash: input.contextHash, pipelinePlanHash: input.pipelinePlan.planHash }))
            if (rendered.status !== 'ok') result = { status: rendered.status === 'submission_unknown' ? 'submission_unknown' : 'failed', outputArtifacts: [], metadata: { offline: true, virtual: true, adapterId: adapter.id }, providerRequestId: rendered.providerRequestId, failureCode: rendered.failureCode ?? 'PROMPT_RENDER_FAILED', actualCost: 0 }
            else {
              renderedRequestId = rendered.providerRequestId
              result = adapter.executeStep({ runId: record.run.id, step, promptArtifactHash: promptHash, referencePlanHash: input.referencePlan.planHash, outputContract: input.outputContract, attempt: attempts, options })
              if (!result.providerRequestId && renderedRequestId) result = { ...result, providerRequestId: renderedRequestId }
            }
          }
        } else result = adapter.executeStep({ runId: record.run.id, step, promptArtifactHash: promptHash, referencePlanHash: input.referencePlan.planHash, outputContract: input.outputContract, attempt: attempts, options })
      } catch {
        result = { status: 'failed', outputArtifacts: [], metadata: { offline: true, virtual: true, adapterId: adapter.id }, failureCode: 'MOCK_ADAPTER_EXCEPTION', actualCost: 0 }
      }
      terminalResult = result
      const rawCost = result.actualCost ?? 0
      const rawBytes = result.actualBytes ?? 0
      const invalidUsage = !Number.isFinite(rawCost) || rawCost < 0 || !Number.isInteger(rawBytes) || rawBytes < 0
      const cost = Number.isFinite(rawCost) && rawCost >= 0 ? rawCost : 0
      const bytes = Number.isInteger(rawBytes) && rawBytes >= 0 ? rawBytes : 0
      spentCost += cost
      spentBytes += bytes
      const budgetViolation = invalidUsage || (step.budget.maximumCost !== undefined && spentCost > step.budget.maximumCost) || (step.budget.maximumBytes !== undefined && spentBytes > step.budget.maximumBytes) || (step.dataTransfer.maximumBytes !== undefined && spentBytes > step.dataTransfer.maximumBytes)
      if (budgetViolation) {
        result = { ...result, status: 'failed', outputArtifacts: [], failureCode: invalidUsage ? 'USAGE_ACCOUNTING_INVALID' : (step.budget.maximumBytes !== undefined || step.dataTransfer.maximumBytes !== undefined) && spentBytes > (step.budget.maximumBytes ?? step.dataTransfer.maximumBytes ?? Number.MAX_SAFE_INTEGER) ? 'BYTES_BUDGET_EXCEEDED' : 'COST_BUDGET_EXCEEDED' }
        terminalResult = result
      }
      if (result.status === 'submission_unknown') {
        terminal = 'submission_unknown'
        append(runtimeStepEvent(record, step, terminal, promptHash, authorization?.id, inputHash, [], attempts, retries, result.providerRequestId, result.failureCode ?? 'REMOTE_SUBMISSION_UNKNOWN', spentCost, spentBytes))
        return { terminal, terminalResult, outcome: 'unknown' }
      }
      if (result.status === 'cancelled') {
        terminal = 'cancelled'
        append(runtimeStepEvent(record, step, terminal, promptHash, authorization?.id, inputHash, [], attempts, retries, result.providerRequestId, result.failureCode ?? 'CANCELLED', spentCost, spentBytes))
        return { terminal, terminalResult, outcome: 'cancel' }
      }
      if (result.status === 'succeeded' && !budgetViolation) {
        const artifacts = outputArtifactsForResult(result)
        const outputHashes = artifacts.map((artifact) => artifact.contentHash)
        if (remote) append(runtimeStepEvent(record, step, 'acknowledged', promptHash, authorization?.id, inputHash, outputHashes, attempts, retries, result.providerRequestId, undefined, spentCost, spentBytes))
        append(runtimeStepEvent(record, step, 'succeeded', promptHash, authorization?.id, inputHash, outputHashes, attempts, retries, result.providerRequestId, undefined, spentCost, spentBytes))
        record.run.outputArtifacts.push(...artifacts)
        return { terminal: 'succeeded', terminalResult, outcome: 'success' }
      }
      const failureCode = result.failureCode ?? 'STEP_FAILED'
      append(runtimeStepEvent(record, step, 'failed', promptHash, authorization?.id, inputHash, [], attempts, retries, result.providerRequestId, failureCode, spentCost, spentBytes))
      terminal = 'failed'
      const retryAllowed = options.retryableFailureStepIds.includes(step.id) && retries < step.budget.maximumRetries && attempts < step.budget.maximumCalls
      if (retryAllowed) { retries += 1; continue }
      return { terminal, terminalResult, outcome: 'failure' }
    }
    return { terminal, terminalResult, outcome: 'failure' }
  }

  execute(input: OfflineExecutionInput): OfflineExecutionResult {
    let safeInput: OfflineExecutionInput
    try {
      safeInput = clone(input)
    } catch {
      return blockedExecutionResult('OFFLINE_EXECUTION_INPUT_INVALID', ['OFFLINE_EXECUTION_INPUT_INVALID'])
    }
    const options = normalizedExecutionOptions(safeInput.options)
    const reasons = [...safeExecutionInputReasons(safeInput), ...safeRemoteAuthorizationReasons(safeInput)]
    let preflight: ReturnType<typeof dispatchPreflight> | undefined
    try {
      const snapshot = safeInput.pipelinePlan ? executionSnapshot(safeInput) : { kind: 'execution' as const, caseId: safeInput.executionAuthorization?.caseId ?? '', caseRevision: safeInput.executionAuthorization?.caseRevision ?? 0, contextHash: safeInput.executionAuthorization?.contextHash ?? '' }
      preflight = dispatchPreflight(safeInput.executionAuthorization, snapshot, options.now)
      if (preflight.status !== 'authorized') reasons.push('DISPATCH_PREFLIGHT_BLOCKED', preflight.code, ...preflight.reasons.map((reason) => `DISPATCH_${reason}`))
    } catch {
      reasons.push('DISPATCH_PREFLIGHT_INPUT_INVALID')
    }
    reasons.push(...adapterRegistrationReasons(safeInput.pipelinePlan?.steps ?? [], this.adapters))
    const uniqueReasons = sortedStrings(reasons)
    if (uniqueReasons.length || preflight?.status !== 'authorized') return blockedExecutionResult('EXECUTION_NOT_AUTHORIZED', uniqueReasons.length ? uniqueReasons : ['EXECUTION_NOT_AUTHORIZED'])

    const priorRun = [...this.records.values()].find((record) => record.input.executionAuthorization.authorizationHash === safeInput.executionAuthorization.authorizationHash && record.input.pipelinePlan.planHash === safeInput.pipelinePlan.planHash && promptArtifactHash(record.input.promptArtifact) === promptArtifactHash(safeInput.promptArtifact))
    if (priorRun && ['completed', 'failed', 'cancelled', 'needs_review', 'submission_unknown'].includes(priorRun.run.state)) return blockedExecutionResult('NEW_AUTHORIZATION_REQUIRED', ['TERMINAL_RUN_REQUIRES_NEW_AUTHORIZATION'])

    const run = makeExecutionRun(safeInput, options)
    const record: OfflineRuntimeRecord = { input: safeInput, options, run, events: [], receipts: [], remoteCallRuns: [], cleanupReceipts: [], compensationReceipts: [] }
    this.records.set(run.id, record)
    run.state = 'running'
    run.updatedAt = options.now
    const steps = pipelineExecutionOrder(safeInput.pipelinePlan.steps)
    const authorizations = new Map(safeInput.remoteCallAuthorizations.map((authorization) => [authorization.stepId, authorization]))
    const groups = new Map<string, StepEvent[]>()
    const completed = new Set<string>()
    const failed = new Set<string>()
    let outcome: 'success'|'failure'|'cancel'|'unknown' = 'success'
    let workerRestarted = false
    let stop = false

    for (const step of steps) {
      const group: StepEvent[] = []
      const append = (event: StepEvent): void => { group.push(event); appendRuntimeEvent(record, event) }
      const inputHash = computeExecutionStepInputHash(step, safeInput.contextHash, safeInput.pipelinePlan.planHash, safeInput.referencePlan.planHash, promptArtifactHash(safeInput.promptArtifact), safeInput.referencePlan.ordered.map((reference) => reference.contentHash))
      append(runtimeStepEvent(record, step, 'pending', promptArtifactHash(safeInput.promptArtifact), authorizations.get(step.id)?.id, inputHash, [], 0, 0))
      if (stop) {
        append(runtimeStepEvent(record, step, 'skipped', promptArtifactHash(safeInput.promptArtifact), authorizations.get(step.id)?.id, inputHash, [], 0, 0, undefined, outcome === 'unknown' ? 'UPSTREAM_SUBMISSION_UNKNOWN' : 'UPSTREAM_STEP_FAILED'))
        groups.set(step.id, group)
        continue
      }
      if (options.cancelBeforeStepId && step.id === options.cancelBeforeStepId) {
        append(runtimeStepEvent(record, step, 'cancel_requested', promptArtifactHash(safeInput.promptArtifact), authorizations.get(step.id)?.id, inputHash, [], 0, 0, undefined, 'CANCEL_REQUESTED'))
        append(runtimeStepEvent(record, step, 'cancelled', promptArtifactHash(safeInput.promptArtifact), authorizations.get(step.id)?.id, inputHash, [], 0, 0, undefined, 'CANCELLED_BEFORE_STEP'))
        outcome = 'cancel'; stop = true; groups.set(step.id, group); continue
      }
      if (step.dependsOn.some((dependency) => !completed.has(dependency))) {
        append(runtimeStepEvent(record, step, 'skipped', promptArtifactHash(safeInput.promptArtifact), authorizations.get(step.id)?.id, inputHash, [], 0, 0, undefined, 'DEPENDENCY_NOT_COMPLETED'))
        outcome = outcome === 'success' ? 'failure' : outcome; stop = true; failed.add(step.id); groups.set(step.id, group); continue
      }
      const authorization = authorizations.get(step.id)
      append(runtimeStepEvent(record, step, 'authorized', promptArtifactHash(safeInput.promptArtifact), authorization?.id, inputHash, [], 0, 0))
      const adapter = this.adapters.get(step.adapterId)!
      let attempts = 0
      let retries = 0
      let spentCost = 0
      let spentBytes = 0
      let terminal: StepEventState = 'failed'
      let terminalResult: MockStepExecutionResult | undefined
      while (attempts < step.budget.maximumCalls) {
        attempts += 1
        const remote = requiredRemoteStep(step)
        if (remote) append(runtimeStepEvent(record, step, 'submitted', promptArtifactHash(safeInput.promptArtifact), authorization?.id, inputHash, [], attempts, retries))
        let result: MockStepExecutionResult
        try {
          let renderedRequestId: string | undefined
          if (attempts === 1 && step.type === 'generate' && adapterCanRender(adapter)) {
            const promptIR = 'candidateHash' in safeInput.promptArtifact ? safeInput.promptGuardResult?.deterministicFallback : safeInput.promptArtifact
            if (!promptIR) result = { status: 'failed', outputArtifacts: [], metadata: { offline: true, virtual: true, adapterId: adapter.id }, failureCode: 'PROMPT_RENDER_INPUT_MISSING', actualCost: 0 }
            else {
              const rendered = adapter.render(createProviderRenderRequest({ promptIR, candidate: 'candidateHash' in safeInput.promptArtifact ? safeInput.promptArtifact : undefined, guardResult: safeInput.promptGuardResult, caseId: safeInput.pipelinePlan.caseId, caseRevision: safeInput.pipelinePlan.caseRevision, contextHash: safeInput.contextHash, pipelinePlanHash: safeInput.pipelinePlan.planHash }))
              if (rendered.status !== 'ok') result = { status: rendered.status === 'submission_unknown' ? 'submission_unknown' : 'failed', outputArtifacts: [], metadata: { offline: true, virtual: true, adapterId: adapter.id }, providerRequestId: rendered.providerRequestId, failureCode: rendered.failureCode ?? 'PROMPT_RENDER_FAILED', actualCost: 0 }
              else { renderedRequestId = rendered.providerRequestId; result = adapter.executeStep({ runId: record.run.id, step, promptArtifactHash: promptArtifactHash(safeInput.promptArtifact), referencePlanHash: safeInput.referencePlan.planHash, outputContract: safeInput.outputContract, attempt: attempts, options }); if (!result.providerRequestId && renderedRequestId) result = { ...result, providerRequestId: renderedRequestId } }
            }
          } else result = adapter.executeStep({ runId: record.run.id, step, promptArtifactHash: promptArtifactHash(safeInput.promptArtifact), referencePlanHash: safeInput.referencePlan.planHash, outputContract: safeInput.outputContract, attempt: attempts, options })
        } catch {
          result = { status: 'failed', outputArtifacts: [], metadata: { offline: true, virtual: true, adapterId: adapter.id }, failureCode: 'MOCK_ADAPTER_EXCEPTION', actualCost: 0 }
        }
        terminalResult = result
        const rawCost = result.actualCost ?? 0
        const rawBytes = result.actualBytes ?? 0
        const invalidUsage = !Number.isFinite(rawCost) || rawCost < 0 || !Number.isInteger(rawBytes) || rawBytes < 0
        const cost = Number.isFinite(rawCost) && rawCost >= 0 ? rawCost : 0
        const bytes = Number.isInteger(rawBytes) && rawBytes >= 0 ? rawBytes : 0
        spentCost += cost
        spentBytes += bytes
        const budgetViolation = invalidUsage || (step.budget.maximumCost !== undefined && spentCost > step.budget.maximumCost) || (step.budget.maximumBytes !== undefined && spentBytes > step.budget.maximumBytes) || (step.dataTransfer.maximumBytes !== undefined && spentBytes > step.dataTransfer.maximumBytes)
        if (budgetViolation) {
          result = { ...result, status: 'failed', outputArtifacts: [], failureCode: invalidUsage ? 'USAGE_ACCOUNTING_INVALID' : (step.budget.maximumBytes !== undefined || step.dataTransfer.maximumBytes !== undefined) && spentBytes > (step.budget.maximumBytes ?? step.dataTransfer.maximumBytes ?? Number.MAX_SAFE_INTEGER) ? 'BYTES_BUDGET_EXCEEDED' : 'COST_BUDGET_EXCEEDED' }
          terminalResult = result
        }
        if (result.status === 'submission_unknown') {
          terminal = 'submission_unknown'
          append(runtimeStepEvent(record, step, terminal, promptArtifactHash(safeInput.promptArtifact), authorization?.id, inputHash, [], attempts, retries, result.providerRequestId, result.failureCode ?? 'REMOTE_SUBMISSION_UNKNOWN', spentCost, spentBytes))
          outcome = 'unknown'; stop = true
          break
        }
        if (result.status === 'cancelled') {
          terminal = 'cancelled'
          append(runtimeStepEvent(record, step, terminal, promptArtifactHash(safeInput.promptArtifact), authorization?.id, inputHash, [], attempts, retries, result.providerRequestId, result.failureCode ?? 'CANCELLED', spentCost, spentBytes))
          outcome = 'cancel'; stop = true
          break
        }
        if (result.status === 'succeeded' && !budgetViolation) {
          const artifacts = outputArtifactsForResult(result)
          const outputHashes = artifacts.map((artifact) => artifact.contentHash)
          if (remote) append(runtimeStepEvent(record, step, 'acknowledged', promptArtifactHash(safeInput.promptArtifact), authorization?.id, inputHash, outputHashes, attempts, retries, result.providerRequestId, undefined, spentCost, spentBytes))
          append(runtimeStepEvent(record, step, 'succeeded', promptArtifactHash(safeInput.promptArtifact), authorization?.id, inputHash, outputHashes, attempts, retries, result.providerRequestId, undefined, spentCost, spentBytes))
          record.run.outputArtifacts.push(...artifacts)
          terminal = 'succeeded'; completed.add(step.id)
          break
        }
        const failureCode = result.failureCode ?? 'STEP_FAILED'
        append(runtimeStepEvent(record, step, 'failed', promptArtifactHash(safeInput.promptArtifact), authorization?.id, inputHash, [], attempts, retries, result.providerRequestId, failureCode, spentCost, spentBytes))
        terminal = 'failed'
        const retryAllowed = options.retryableFailureStepIds.includes(step.id) && retries < step.budget.maximumRetries && attempts < step.budget.maximumCalls
        if (retryAllowed) { retries += 1; continue }
        outcome = 'failure'; stop = true; failed.add(step.id)
        break
      }
      if (terminal === 'failed' && outcome === 'success') { outcome = 'failure'; stop = true; failed.add(step.id) }
      if (options.workerRestartAfterStepId && step.id === options.workerRestartAfterStepId) workerRestarted = true
      groups.set(step.id, group)
      if (terminalResult && requiredRemoteStep(step) && authorization) {
        const placeholder = makeStepReceipt(record.run.id, step, group, 'pending')
        record.remoteCallRuns.push(makeRemoteCallRun(record, step, authorization, placeholder))
      }
    }

    const needsReview = outcome === 'success' && steps.some((step) => step.type === 'semantic_review' && completed.has(step.id))
    const finalStatus = executionOutcomeStatus(outcome, needsReview)
    record.run.state = finalStatus.state
    record.run.technicalOutcome = finalStatus.technicalOutcome
    record.run.outputArtifacts = [...new Map(record.run.outputArtifacts.map((artifact) => [artifact.id, artifact])).values()].sort((left, right) => compareCodeUnits(left.id, right.id))
    record.evaluation = evaluationForRun(record.run.id, record.run.outputArtifacts, needsReview, outcome)
    if (needsReview) record.humanAcceptance = humanAcceptanceForRun(record.run.id, record.run.outputArtifacts)

    const cleanupOutcome = outcome
    for (const cleanup of sortedBy(safeInput.pipelinePlan.cleanup, (item) => item.id)) {
      if (!cleanupConditionMatches(cleanup, cleanupOutcome, workerRestarted)) continue
      const cleanupEvents: StepEvent[] = []
      const shouldFail = options.cleanupFailureIds.includes(cleanup.id)
      let failedCleanup = false
      for (let attempt = 0; attempt <= options.maximumCleanupRetries; attempt += 1) {
        const pending = runtimeCleanupEvent(record, cleanup, 'cleanup_pending')
        appendRuntimeEvent(record, pending); cleanupEvents.push(pending)
        const terminalState: StepEventState = shouldFail ? 'cleanup_failed' : 'cleaned'
        const terminalEvent = runtimeCleanupEvent(record, cleanup, terminalState, shouldFail ? 'CLEANUP_FAILED' : undefined)
        appendRuntimeEvent(record, terminalEvent); cleanupEvents.push(terminalEvent)
        if (!shouldFail) break
        failedCleanup = true
      }
      record.cleanupReceipts.push(makeCleanupReceipt(record.run.id, cleanup, cleanupEvents, failedCleanup, options.maximumCleanupRetries))
    }

    const trigger = compensationTrigger(outcome, workerRestarted)
    if (trigger) {
      for (const compensation of sortedBy(safeInput.pipelinePlan.compensation.filter((item) => item.trigger === trigger && (workerRestarted || item.appliesToStepIds.some((id) => failed.has(id) || !completed.has(id)))), (item) => item.id)) {
        const cleanup = safeInput.pipelinePlan.cleanup.find((item) => item.id === compensation.cleanupId)
        if (!cleanup) continue
        const compensationCleanup = { ...cleanup, id: compensation.id, artifactRoles: cleanup.artifactRoles, appliesToStepIds: compensation.appliesToStepIds }
        const compensationEvents: StepEvent[] = []
        const shouldFail = options.compensationFailureIds.includes(compensation.id)
        let failedCompensation = false
        for (let attempt = 0; attempt <= options.maximumCleanupRetries; attempt += 1) {
          const pending = runtimeCleanupEvent(record, compensationCleanup, 'cleanup_pending')
          appendRuntimeEvent(record, pending); compensationEvents.push(pending)
          const terminalState: StepEventState = shouldFail ? 'cleanup_failed' : 'cleaned'
          const terminalEvent = runtimeCleanupEvent(record, compensationCleanup, terminalState, shouldFail ? 'CLEANUP_FAILED' : undefined)
          appendRuntimeEvent(record, terminalEvent); compensationEvents.push(terminalEvent)
          if (!shouldFail) break
          failedCompensation = true
        }
        record.compensationReceipts.push(makeCompensationReceipt(record.run.id, compensation, compensationEvents, failedCompensation, options.maximumCleanupRetries))
      }
    }

    const cleanupFailed = record.cleanupReceipts.some((receipt) => receipt.status === 'cleanup_failed') || record.compensationReceipts.some((receipt) => receipt.status === 'cleanup_failed')
    for (const step of steps) {
      const group = groups.get(step.id) ?? []
      record.receipts.push(makeStepReceipt(record.run.id, step, group, stepCleanupStatus(record, step)))
    }
    for (const remote of record.remoteCallRuns) {
      const receipt = record.receipts.find((candidate) => candidate.stepId === remote.stepId)
      if (receipt) {
        remote.receiptId = receipt.id
        record.remoteCallRuns[record.remoteCallRuns.indexOf(remote)] = updateRemoteCallRunHash(remote)
      }
    }
    record.run.cleanupStatus = cleanupFailed ? 'cleanup_failed' : 'completed'
    record.run.updatedAt = options.now
    const code = cleanupFailed ? 'CLEANUP_FAILED' : outcome === 'unknown' ? 'SUBMISSION_UNKNOWN_RECONCILIATION_REQUIRED' : outcome === 'cancel' ? 'EXECUTION_CANCELLED' : outcome === 'failure' ? 'EXECUTION_FAILED' : needsReview ? 'HUMAN_ACCEPTANCE_REQUIRED' : 'EXECUTION_COMPLETED'
    return resultForRecord(record, code, cleanupFailed ? ['CLEANUP_FAILED'] : outcome === 'unknown' ? ['SUBMISSION_UNKNOWN_RECONCILIATION_REQUIRED'] : [])
  }

  get(runId: string): OfflineExecutionResult | undefined {
    const record = this.records.get(runId)
    return record ? resultForRecord(record, record.run.state === 'submission_unknown' ? 'SUBMISSION_UNKNOWN_RECONCILIATION_REQUIRED' : 'EXECUTION_COMPLETED') : undefined
  }

  run(input: OfflineExecutionInput): OfflineExecutionResult {
    return this.execute(input)
  }

  dispatch(input: OfflineExecutionInput): OfflineExecutionResult {
    return this.execute(input)
  }

  reconcile(runId: string, state: 'running'|'validating'|'completed'|'failed'|'cancelled'): OfflineExecutionResult {
    const record = this.records.get(runId)
    if (!record) return blockedExecutionResult('RUN_NOT_FOUND', ['RUN_NOT_FOUND'])
    if (!['submission_unknown', 'reconciling', 'running', 'validating'].includes(record.run.state)) return resultForRecord(record, 'RECONCILIATION_NOT_REQUIRED')
    const unknown = [...record.events].reverse().find((event) => event.state === 'submission_unknown')
    const step = record.input.pipelinePlan.steps.find((candidate) => candidate.id === unknown?.stepId)
    if (!unknown || !step) return resultForRecord(record, 'RECONCILIATION_INPUT_INVALID', ['RECONCILIATION_INPUT_INVALID'])
    const authorizationId = unknown.authorizationId
    const promptHash = promptArtifactHash(record.input.promptArtifact)
    const inputHash = unknown.inputHash ?? computeExecutionStepInputHash(step, record.input.contextHash, record.input.pipelinePlan.planHash, record.input.referencePlan.planHash, promptHash, record.input.referencePlan.ordered.map((reference) => reference.contentHash))
    appendRuntimeEvent(record, runtimeStepEvent(record, step, 'reconciling', promptHash, authorizationId, inputHash, [], unknown.attempt, unknown.retriesUsed, unknown.providerRequestId, 'EXPLICIT_RECONCILIATION'))

    if (state === 'running' || state === 'validating') {
      record.run.state = state
      record.run.technicalOutcome = 'pending'
      record.run.updatedAt = record.options.now
      refreshReconciledReceipts(record, pipelineExecutionOrder(record.input.pipelinePlan.steps))
      return resultForRecord(record, `RECONCILED_${state.toUpperCase()}`, ['RECONCILIATION_IN_PROGRESS'])
    }

    const completed = new Set<string>(record.input.pipelinePlan.steps.filter((candidate) => record.events.filter((event) => event.stepId === candidate.id).at(-1)?.state === 'succeeded').map((candidate) => candidate.id))
    const failed = new Set<string>(record.input.pipelinePlan.steps.filter((candidate) => ['failed', 'cancelled', 'skipped'].includes(record.events.filter((event) => event.stepId === candidate.id).at(-1)?.state ?? '')).map((candidate) => candidate.id))
    let outcome: 'success'|'failure'|'cancel'|'unknown'

    if (state === 'failed' || state === 'cancelled') {
      const terminalState: StepEventState = state === 'cancelled' ? 'cancelled' : 'failed'
      appendRuntimeEvent(record, runtimeStepEvent(record, step, terminalState, promptHash, authorizationId, inputHash, [], unknown.attempt, unknown.retriesUsed, unknown.providerRequestId, `RECONCILED_${state.toUpperCase()}`))
      outcome = state === 'cancelled' ? 'cancel' : 'failure'
      failed.add(step.id)
    } else {
      const adapter = this.adapters.get(step.adapterId)
      let recovery: MockStepExecutionResult | undefined
      try {
        recovery = adapter?.reconcileStep?.({ runId: record.run.id, step, promptArtifactHash: promptHash, referencePlanHash: record.input.referencePlan.planHash, outputContract: record.input.outputContract, attempt: unknown.attempt, options: record.options })
      } catch {
        recovery = undefined
      }
      const recoveredArtifacts = recovery?.status === 'succeeded' ? outputArtifactsForResult(recovery) : []
      const missingRoles = step.outputArtifactRoles.filter((role) => !recoveredArtifacts.some((artifact) => artifact.role === role))
      if (!recovery || recovery.status !== 'succeeded' || missingRoles.length > 0) {
        record.run.state = 'needs_review'
        record.run.technicalOutcome = 'unknown'
        record.evaluation = evaluationForRun(record.run.id, record.run.outputArtifacts, true, 'unknown')
        record.run.updatedAt = record.options.now
        refreshReconciledReceipts(record, pipelineExecutionOrder(record.input.pipelinePlan.steps))
        return resultForRecord(record, 'RECONCILIATION_ARTIFACTS_UNAVAILABLE', ['RECONCILIATION_ARTIFACTS_UNAVAILABLE'])
      }
      const recoveredHashes = recoveredArtifacts.map((artifact) => artifact.contentHash)
      const providerRequestId = recovery.providerRequestId ?? unknown.providerRequestId
      if (requiredRemoteStep(step)) appendRuntimeEvent(record, runtimeStepEvent(record, step, 'acknowledged', promptHash, authorizationId, inputHash, recoveredHashes, unknown.attempt, unknown.retriesUsed, providerRequestId, undefined, recovery.actualCost ?? 0, recovery.actualBytes ?? 0))
      appendRuntimeEvent(record, runtimeStepEvent(record, step, 'succeeded', promptHash, authorizationId, inputHash, recoveredHashes, unknown.attempt, unknown.retriesUsed, providerRequestId, 'RECONCILED_COMPLETED', recovery.actualCost ?? 0, recovery.actualBytes ?? 0))
      record.run.outputArtifacts.push(...recoveredArtifacts)
      completed.add(step.id)
      outcome = 'success'

      const steps = pipelineExecutionOrder(record.input.pipelinePlan.steps)
      const unknownIndex = steps.findIndex((candidate) => candidate.id === step.id)
      const authorizations = new Map(record.input.remoteCallAuthorizations.map((authorization) => [authorization.stepId, authorization]))
      for (const downstream of steps.slice(unknownIndex + 1)) {
        const latest = record.events.filter((event) => event.stepId === downstream.id).at(-1)
        if (latest?.state === 'succeeded') {
          completed.add(downstream.id)
          continue
        }
        if (downstream.dependsOn.some((dependency) => !completed.has(dependency))) {
          failed.add(downstream.id)
          outcome = 'failure'
          break
        }
        appendRuntimeEvent(record, runtimeStepEvent(record, downstream, 'reconciling', promptHash, authorizations.get(downstream.id)?.id, computeExecutionStepInputHash(downstream, record.input.contextHash, record.input.pipelinePlan.planHash, record.input.referencePlan.planHash, promptHash, record.input.referencePlan.ordered.map((reference) => reference.contentHash)), [], 0, 0, undefined, 'RESUME_AFTER_RECONCILIATION'))
        const stepResult = this.executeRegisteredStep(record, downstream, authorizations.get(downstream.id))
        if (stepResult.terminalResult && requiredRemoteStep(downstream) && authorizations.get(downstream.id)) {
          const stepEvents = record.events.filter((event) => event.stepId === downstream.id)
          const placeholder = makeStepReceipt(record.run.id, downstream, stepEvents, 'pending')
          record.remoteCallRuns.push(makeRemoteCallRun(record, downstream, authorizations.get(downstream.id)!, placeholder))
        }
        if (stepResult.outcome === 'success') completed.add(downstream.id)
        else {
          if (stepResult.outcome === 'unknown') outcome = 'unknown'
          else if (stepResult.outcome === 'cancel') outcome = 'cancel'
          else outcome = 'failure'
          failed.add(downstream.id)
          break
        }
      }
    }

    const steps = pipelineExecutionOrder(record.input.pipelinePlan.steps)
    const needsReview = outcome === 'success' && steps.some((candidate) => candidate.type === 'semantic_review' && completed.has(candidate.id))
    const finalStatus = executionOutcomeStatus(outcome, needsReview)
    record.run.state = finalStatus.state
    record.run.technicalOutcome = finalStatus.technicalOutcome
    record.run.outputArtifacts = [...new Map(record.run.outputArtifacts.map((artifact) => [artifact.id, artifact])).values()].sort((left, right) => compareCodeUnits(left.id, right.id))
    record.evaluation = evaluationForRun(record.run.id, record.run.outputArtifacts, needsReview, outcome)
    if (needsReview && !record.humanAcceptance) record.humanAcceptance = humanAcceptanceForRun(record.run.id, record.run.outputArtifacts)
    appendReconciliationCleanup(record, outcome, false)
    appendReconciliationCompensation(record, outcome, false, completed, failed)
    const cleanupFailed = record.cleanupReceipts.some((receipt) => receipt.status === 'cleanup_failed') || record.compensationReceipts.some((receipt) => receipt.status === 'cleanup_failed')
    refreshReconciledReceipts(record, steps)
    record.run.cleanupStatus = cleanupFailed ? 'cleanup_failed' : 'completed'
    record.run.updatedAt = record.options.now
    const code = cleanupFailed ? 'CLEANUP_FAILED' : outcome === 'unknown' ? 'SUBMISSION_UNKNOWN_RECONCILIATION_REQUIRED' : outcome === 'cancel' ? 'EXECUTION_CANCELLED' : outcome === 'failure' ? 'EXECUTION_FAILED' : needsReview ? 'HUMAN_ACCEPTANCE_REQUIRED' : 'EXECUTION_COMPLETED'
    const reasons = cleanupFailed ? ['CLEANUP_FAILED'] : outcome === 'unknown' ? ['SUBMISSION_UNKNOWN_RECONCILIATION_REQUIRED'] : []
    return resultForRecord(record, code, reasons)
  }

  cancel(runId: string): OfflineExecutionResult {
    const record = this.records.get(runId)
    if (!record) return blockedExecutionResult('RUN_NOT_FOUND', ['RUN_NOT_FOUND'])
    if (record.run.state === 'submission_unknown') return resultForRecord(record, 'SUBMISSION_UNKNOWN_RECONCILIATION_REQUIRED', ['SUBMISSION_UNKNOWN_RECONCILIATION_REQUIRED'])
    if (['completed', 'failed', 'cancelled', 'needs_review'].includes(record.run.state)) return resultForRecord(record, 'RUN_TERMINAL', ['RUN_TERMINAL'])
    record.run.state = 'cancel_requested'
    record.run.updatedAt = record.options.now
    record.run.state = 'cancelled'
    record.run.technicalOutcome = 'cancelled'
    return resultForRecord(record, 'EXECUTION_CANCELLED')
  }

  cancelRun(runId: string): OfflineExecutionResult {
    return this.cancel(runId)
  }

  acceptHumanAcceptance(runId: string, reviewerId = 'offline-reviewer'): OfflineExecutionResult {
    const record = this.records.get(runId)
    if (!record || !record.humanAcceptance) return blockedExecutionResult('HUMAN_ACCEPTANCE_NOT_REQUIRED', ['HUMAN_ACCEPTANCE_NOT_REQUIRED'])
    record.humanAcceptance = updateHumanAcceptanceHash({ ...record.humanAcceptance, status: 'accepted', reviewerId, decidedAt: record.options.now, reasonCode: 'HUMAN_ACCEPTED' })
    return resultForRecord(record, 'HUMAN_ACCEPTED')
  }

  declineHumanAcceptance(runId: string, reasonCode = 'HUMAN_DECLINED', reviewerId = 'offline-reviewer'): OfflineExecutionResult {
    const record = this.records.get(runId)
    if (!record || !record.humanAcceptance) return blockedExecutionResult('HUMAN_ACCEPTANCE_NOT_REQUIRED', ['HUMAN_ACCEPTANCE_NOT_REQUIRED'])
    record.humanAcceptance = updateHumanAcceptanceHash({ ...record.humanAcceptance, status: 'declined', reviewerId, decidedAt: record.options.now, reasonCode })
    return resultForRecord(record, 'HUMAN_ACCEPTANCE_DECLINED', ['HUMAN_ACCEPTANCE_DECLINED'])
  }

  getTrace(runId: string): ExecutionTraceProjection | undefined {
    const record = this.records.get(runId)
    return record?.trace ? clone(record.trace) : record ? traceForRecord(record) : undefined
  }
}

export function createOfflineExecutionRuntime(adapter: OfflineStepAdapter = new MockProviderAdapter(), adapters: OfflineStepAdapter[] = []): OfflineExecutionRuntime {
  return new OfflineExecutionRuntime(adapter, adapters)
}

export function createMockRuntimeForPlan(plan: PipelinePlan, options: MockProviderAdapterOptions = {}): OfflineExecutionRuntime {
  const adapters = new Map<string, OfflineStepAdapter>()
  for (const step of plan.steps) {
    const existing = adapters.get(step.adapterId)
    if (existing && existing.version.digest === step.adapterVersion.digest && existing.profileDigest === step.profileVersion.digest) continue
    adapters.set(step.adapterId, new MockProviderAdapter({
      ...options,
      version: clone(step.adapterVersion),
      digest: step.adapterVersion.digest,
      profileDigest: step.profileVersion.digest,
    }, step.adapterId))
  }
  return new OfflineExecutionRuntime(undefined, [...adapters.values()])
}

export const OfflineExecutionEngine = OfflineExecutionRuntime

export function executeOffline(input: OfflineExecutionInput, runtime?: OfflineExecutionRuntime): OfflineExecutionResult {
  return (runtime ?? createMockRuntimeForPlan(input.pipelinePlan)).execute(input)
}

export const executePipeline = executeOffline
export const runOfflineExecution = executeOffline

function replayResult(artifacts: ArtifactHandle[], traceHash?: string): ArtifactReplayResult {
  const artifactIds = sortedStrings(artifacts.map((artifact) => artifact.id))
  const missingArtifactIds = sortedStrings(artifacts.filter((artifact) => artifact.availability !== 'available').map((artifact) => artifact.id))
  const base: Omit<ArtifactReplayResult, 'resultHash'> = {
    schemaVersion: ARTIFACT_REPLAY_RESULT_SCHEMA_VERSION,
    status: missingArtifactIds.length ? 'unavailable' : 'available',
    code: missingArtifactIds.length ? 'ARTIFACT_UNAVAILABLE' : 'REPLAY_AVAILABLE',
    artifactIds,
    missingArtifactIds,
    ...(traceHash ? { traceHash } : {}),
  }
  return clone({ ...base, resultHash: sha256(base as unknown as JsonObject) })
}

export function replayArtifacts(artifacts: ArtifactHandle[], traceHash?: string): ArtifactReplayResult {
  return replayResult(clone(artifacts), traceHash)
}

export function replayArtifact(artifact: ArtifactHandle, traceHash?: string): ArtifactReplayResult {
  return replayArtifacts([artifact], traceHash)
}

export const replayArtifactHandles = replayArtifacts
