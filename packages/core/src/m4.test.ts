import test from 'node:test'
import assert from 'node:assert/strict'
import type {
  ArtifactHandle,
  ChangeIntent,
  CompilationContext,
  ConstraintCompilationInput,
  ConstraintIR,
  JsonValue,
  OntologyFact,
  OntologyInstance,
  OutputContract,
  ProviderCapabilityProfile,
  ReferenceCandidate,
} from '@voce/contracts'
import {
  CapabilityAwarePipelinePlanner,
  ConstraintGraphCompiler,
  FIXED_M4_TIME,
  MOCK_IMAGE_PROFILE,
  MOCK_JPEG_PROFILE,
  MOCK_LIMITED_REFERENCE_PROFILE,
  ReferenceBudgetOptimizer,
  computeCompilationContextHash,
  computeConstraintConflictHash,
  computeConstraintIRSignature,
  computeExecutionAuthorizationHash,
  computeOntologyInstanceHash,
  computeProviderCapabilityProfileHash,
  computeReferenceCandidateHash,
  computeReferencePlanHash,
  createExecutionAuthorization,
  createConstraintWaiver,
  createReferenceDependency,
  createRemoteCallAuthorization,
  diffConstraintIR,
  explainConstraintIR,
  explainPipelinePlan,
  explainReferencePlan,
  preflightDispatch,
  sha256,
} from './index.js'

const CASE_ID = 'case-m4-test'
const REVISION = 1
const PLAN_HASH = sha256({ fixture: 'm4-test-scope' })

function context(overrides: Partial<Omit<CompilationContext, 'contextHash'>> = {}): CompilationContext {
  const base: Omit<CompilationContext, 'contextHash'> = {
    caseSpecId: CASE_ID,
    caseSpecRevision: REVISION,
    caseSpecHash: sha256({ fixture: 'case' }),
    artifactHashes: [],
    decisionHashes: [],
    scenarioCompositionLockHash: sha256({ fixture: 'lock' }),
    effectiveScenarioHash: sha256({ fixture: 'scenario' }),
    rulePackPlugins: [],
    optimizer: { id: 'voce.deterministic', version: '1.0.0', digest: sha256({ fixture: 'optimizer' }) },
    ...overrides,
  }
  return { ...base, contextHash: computeCompilationContextHash(base as CompilationContext) }
}

function ontology(facts: OntologyFact[] = [], changes: Partial<OntologyInstance> = {}): OntologyInstance {
  const currentContext = changes.contextHash ?? context().contextHash
  const base = {
    schemaVersion: 'voce.ontology-instance/v1alpha1' as const,
    id: 'ontology-m4-test',
    caseId: CASE_ID,
    caseRevision: REVISION,
    contextHash: currentContext,
    requestedScopePlanHash: PLAN_HASH,
    facts,
    unknownPaths: [],
    unspecifiedPaths: [],
    unresolvedItems: [],
    conflicts: [],
    decisionTrace: [],
    ...changes,
  }
  return { ...base, instanceHash: computeOntologyInstanceHash({ ...base, instanceHash: '' }) } as OntologyInstance
}

function output(background: OutputContract['background'] = 'opaque'): OutputContract {
  return { artifactKind: 'image', dataType: 'image', mediaTypes: ['image/png'], cardinality: { min: 1, max: 1 }, dimensions: { width: 1024, height: 1024 }, background, allowAlpha: false }
}

function intent(id: string, operation: 'preserve'|'replace'|'adjust'|'create'|'remove', targetPath: string, importance: 'hard'|'required'|'preferred', requestedValue?: JsonValue) {
  return { schemaVersion: 'voce.change-intent/v1alpha1' as const, id, operation, targetPath, importance, ...(requestedValue === undefined ? {} : { requestedValue }), provenance: { source: 'user_explicit' as const, sourceIds: [id], createdBy: 'm4-test', createdAt: FIXED_M4_TIME } }
}

function input(intents: ChangeIntent[] = [], currentOntology = ontology(), currentContext = context(), extra: Partial<ConstraintCompilationInput> = {}): ConstraintCompilationInput {
  return {
    schemaVersion: 'voce.constraint-compilation-input/v1alpha1',
    caseId: CASE_ID,
    caseRevision: REVISION,
    context: currentContext,
    contextHash: currentContext.contextHash,
    requestedScopePlanHash: PLAN_HASH,
    ontologyInstance: currentOntology,
    changeIntents: intents,
    sourceBindings: [],
    bindingDecisions: [],
    outputContract: output(),
    ...extra,
  }
}

function compile(intents: ChangeIntent[] = [], currentOntology = ontology(), currentContext = context(), extra: Partial<ConstraintCompilationInput> = {}): ConstraintIR {
  return new ConstraintGraphCompiler().compile(input(intents, currentOntology, currentContext, extra))
}

function artifact(id: string, byteLength?: number, mediaType = 'image/png'): ArtifactHandle {
  return { id, storeId: 'm4-store', contentHash: sha256({ artifact: id }), mediaType, ...(byteLength === undefined ? {} : { byteLength }), role: 'reference', resolverId: 'm4-resolver', availability: 'available', retentionClass: 'fixture', redactionPolicy: 'hash-only' }
}

function candidate(id: string, importance: ReferenceCandidate['importance'] = 'preferred', byteLength?: number, profile: ProviderCapabilityProfile = MOCK_IMAGE_PROFILE): ReferenceCandidate {
  const handle = artifact(id, byteLength, profile.allowedReferenceMediaTypes?.[0] ?? 'image/png')
  const base: ReferenceCandidate = { schemaVersion: 'voce.reference-candidate/v1alpha1', id, assetId: id, artifact: handle, contentHash: handle.contentHash, mediaType: handle.mediaType, ...(byteLength === undefined ? {} : { byteLength }), role: 'detail', ontologyScopes: [`scope.${id}`], importance, constraintIds: [], sourceBindingIds: [], goalIds: [] }
  return { ...base, candidateHash: computeReferenceCandidateHash(base) }
}

function refPlan(profile: ProviderCapabilityProfile, candidates = [candidate('ref-01', 'required', 100_000, profile)]) {
  const ir = compile()
  return new ReferenceBudgetOptimizer().plan({ schemaVersion: 'voce.reference-planning-input/v1alpha1', caseId: CASE_ID, caseRevision: REVISION, contextHash: ir.contextHash, constraintIR: ir, candidates, dependencies: [], profile })
}

test('M4 rejects blocked M3 state and stale context/instance signatures without throwing', () => {
  const blockedOntology = ontology([], { conflicts: [{ schemaVersion: 'voce.conflict/v1alpha1', id: 'm3-block', code: 'SOURCE_CONFLICT_UNRESOLVED', message: 'blocked', candidateIds: ['a', 'b'], relatedIds: ['a', 'b'], blocking: true }] })
  const blocked = compile([], blockedOntology)
  assert.equal(blocked.status, 'blocked')
  assert.ok(blocked.warnings.includes('M3_BLOCKING_CONFLICT'))
  const staleContext = context()
  const stale = new ConstraintGraphCompiler().compile({ ...input([], ontology(), staleContext), contextHash: sha256({ stale: true }) })
  assert.equal(stale.status, 'blocked')
  assert.ok(stale.warnings.includes('CONTEXT_HASH_MISMATCH'))
  const staleInstance = ontology()
  staleInstance.instanceHash = sha256({ stale: true })
  const instanceResult = compile([], staleInstance)
  assert.equal(instanceResult.status, 'blocked')
  assert.ok(instanceResult.warnings.includes('INSTANCE_HASH_MISMATCH'))
})

test('mask/identity, sleeve/bracelet, and hand/prop declarative rules block before planning', () => {
  const cases = [
    [intent('identity', 'preserve', 'person.identity', 'hard'), intent('mask', 'replace', 'accessories.mask', 'required', { coverage: 'full_face' })],
    [intent('bracelet', 'preserve', 'accessories.bracelet', 'required'), intent('sleeve', 'replace', 'wardrobe.sleeve', 'required', { coverage: 'long_sleeve' })],
    [intent('bracelet', 'preserve', 'accessories.bracelet', 'required', { hand: 'left' }), intent('prop', 'replace', 'prop.held', 'required', { heldBy: 'left' })],
  ] as const
  const codes = ['MASK_IDENTITY_VISIBILITY_CONFLICT', 'SLEEVE_BRACELET_OCCLUSION', 'HAND_PROP_RESOURCE_CONFLICT']
  cases.forEach((items, index) => {
    const result = compile([...items])
    assert.equal(result.status, 'blocked')
    assert.ok(result.conflicts.some((conflict) => conflict.code === codes[index]))
    assert.ok(result.ruleTraces.some((trace) => trace.reasonCode === codes[index]))
  })
})

test('preferred conflicts degrade with a complete rule trace and remain executable', () => {
  const result = compile([intent('identity', 'preserve', 'person.identity', 'preferred'), intent('mask', 'replace', 'accessories.mask', 'preferred', { coverage: 'full_face' })])
  assert.equal(result.status, 'ok')
  assert.equal(result.degradedPreferences.length, 1)
  assert.ok(result.ruleTraces.some((trace) => trace.outcome === 'degraded' && trace.reasonCode === 'MASK_IDENTITY_VISIBILITY_CONFLICT'))
})

test('required conflicts need a scoped waiver and hard conflicts remain non-waivable', () => {
  const requiredIntents = [intent('bracelet', 'preserve', 'accessories.bracelet', 'required'), intent('sleeve', 'replace', 'wardrobe.sleeve', 'required', { coverage: 'long_sleeve' })]
  const blocked = compile(requiredIntents)
  assert.equal(blocked.status, 'blocked')
  const waiver = createConstraintWaiver({ schemaVersion: 'voce.constraint-waiver/v1alpha1', id: 'waiver-sleeve', caseId: CASE_ID, caseRevision: REVISION, contextHash: context().contextHash, targetId: 'SLEEVE_BRACELET_OCCLUSION', authority: 'user', decidedBy: 'm4-test', reasonCode: 'USER_ACCEPTED_TRADEOFF', decidedAt: FIXED_M4_TIME })
  const waived = compile(requiredIntents, ontology(), context(), { waivers: [waiver] })
  assert.equal(waived.status, 'ok')
  assert.ok(waived.warnings.includes('REQUIRED_CONFLICT_WAIVED'))
  assert.ok(waived.conflicts.every((conflict) => computeConstraintConflictHash(conflict) === conflict.conflictHash))
  const hardIntents = [intent('identity-hard', 'preserve', 'person.identity', 'hard'), intent('mask-required', 'replace', 'accessories.mask', 'required', { coverage: 'full_face' })]
  const hard = compile(hardIntents, ontology(), context(), { waivers: [createConstraintWaiver({ schemaVersion: 'voce.constraint-waiver/v1alpha1', id: 'waiver-mask', caseId: CASE_ID, caseRevision: REVISION, contextHash: context().contextHash, targetId: 'MASK_IDENTITY_VISIBILITY_CONFLICT', authority: 'user', decidedBy: 'm4-test', reasonCode: 'USER_ACCEPTED_TRADEOFF', decidedAt: FIXED_M4_TIME })] })
  assert.equal(hard.status, 'blocked')
  assert.ok(hard.warnings.includes('HARD_CONFLICT_CANNOT_WAIVE'))
})

test('product-only and zero-person compilation succeeds through the same entrypoint', () => {
  const result = compile([intent('product', 'preserve', 'product.shape', 'required', { shape: 'round' }), intent('background', 'create', 'environment.background', 'preferred', { kind: 'studio' })])
  assert.equal(result.status, 'ok')
  assert.ok(result.constraints.some((constraint) => constraint.targetPath === 'product.shape'))
  assert.equal(result.conflicts.length, 0)
})

test('compiler output is stable under insertion-order changes and defensive copies', () => {
  const left = compile([intent('b', 'create', 'environment.background', 'preferred', 'gray'), intent('a', 'preserve', 'product.shape', 'required', 'round')])
  const right = compile([intent('a', 'preserve', 'product.shape', 'required', 'round'), intent('b', 'create', 'environment.background', 'preferred', 'gray')])
  assert.deepEqual(right, left)
  const hash = left.deterministicSignature
  left.constraints[0].targetPaths.push('mutated')
  assert.equal(compile([intent('a', 'preserve', 'product.shape', 'required', 'round'), intent('b', 'create', 'environment.background', 'preferred', 'gray')]).deterministicSignature, hash)
})

test('reference plan counts one asset once while retaining multiple scopes', () => {
  const same = candidate('shared', 'required', 200_000)
  same.ontologyScopes = ['person.identity', 'person.hair', 'wardrobe.top']
  same.candidateHash = computeReferenceCandidateHash(same)
  const plan = refPlan(MOCK_IMAGE_PROFILE, [same])
  assert.equal(plan.status, 'ok')
  assert.equal(plan.selected.length, 1)
  assert.equal(plan.budget.usedReferenceCount, 1)
  assert.deepEqual(plan.selected[0].ontologyScopes, ['person.hair', 'person.identity', 'wardrobe.top'])
})

test('required parent/detail dependencies are retained together or block together', () => {
  const parent = candidate('parent', 'required', 600_000, MOCK_LIMITED_REFERENCE_PROFILE)
  parent.role = 'primary'; parent.candidateHash = computeReferenceCandidateHash(parent)
  const detail = candidate('detail', 'required', 600_000, MOCK_LIMITED_REFERENCE_PROFILE)
  const dependency = createReferenceDependency({ schemaVersion: 'voce.reference-dependency/v1alpha1', id: 'parent-detail', parentCandidateId: parent.id, childCandidateId: detail.id, kind: 'parent_detail', importance: 'required', reasonCode: 'PARENT_DETAIL_REQUIRED', explanation: 'Detail cannot be used without its primary reference.' })
  const ir = compile()
  const plan = new ReferenceBudgetOptimizer().plan({ schemaVersion: 'voce.reference-planning-input/v1alpha1', caseId: CASE_ID, caseRevision: REVISION, contextHash: ir.contextHash, constraintIR: ir, candidates: [detail, parent], dependencies: [dependency], profile: MOCK_LIMITED_REFERENCE_PROFILE })
  assert.equal(plan.status, 'blocked')
  assert.equal(plan.blockedReferences.length, 2)
  assert.ok(plan.blockedReferences.every((item) => item.reasonCode === 'REFERENCE_TOTAL_BYTES_EXCEEDED'))
})

test('preferred references are omitted with a reason instead of silently truncated', () => {
  const required = candidate('required', 'required', 600_000, MOCK_LIMITED_REFERENCE_PROFILE)
  required.role = 'identity'; required.candidateHash = computeReferenceCandidateHash(required)
  const preferred = candidate('preferred', 'preferred', 600_000, MOCK_LIMITED_REFERENCE_PROFILE)
  const plan = refPlan(MOCK_LIMITED_REFERENCE_PROFILE, [preferred, required])
  assert.equal(plan.status, 'ok')
  assert.equal(plan.selected.length, 1)
  assert.equal(plan.omitted.length, 1)
  assert.equal(plan.omitted[0].reasonCode, 'REFERENCE_TOTAL_BYTES_EXCEEDED')
})

test('unknown byte length never pretends to satisfy a finite total-byte budget', () => {
  const unknown = candidate('unknown', 'required', undefined, MOCK_LIMITED_REFERENCE_PROFILE)
  const plan = refPlan(MOCK_LIMITED_REFERENCE_PROFILE, [unknown])
  assert.equal(plan.status, 'blocked')
  assert.ok(plan.warnings.includes('REFERENCE_TOTAL_BYTES_UNKNOWN') || plan.blockedReferences.some((item) => ['REFERENCE_TOTAL_BYTES_UNKNOWN', 'REFERENCE_BYTE_LENGTH_REQUIRED'].includes(item.reasonCode)))
  assert.equal(plan.budget.byteLengthKnown, false)
})

test('reference plan hashes and trace order do not depend on input insertion order', () => {
  const one = refPlan(MOCK_IMAGE_PROFILE, [candidate('b', 'preferred', 100), candidate('a', 'required', 100)])
  const two = refPlan(MOCK_IMAGE_PROFILE, [candidate('a', 'required', 100), candidate('b', 'preferred', 100)])
  assert.equal(two.planHash, one.planHash)
  assert.deepEqual(explainReferencePlan(two), explainReferencePlan(one))
})

test('standard image and JPEG normalization profiles produce bounded acyclic plans', () => {
  const nativePlan = refPlan(MOCK_IMAGE_PROFILE)
  const jpegPlan = refPlan(MOCK_JPEG_PROFILE, [candidate('ref-01', 'required', 100_000, MOCK_JPEG_PROFILE)])
  const native = new CapabilityAwarePipelinePlanner().plan({ schemaVersion: 'voce.pipeline-planning-input/v1alpha1', caseId: CASE_ID, caseRevision: REVISION, contextHash: nativePlan.contextHash, outputContract: output(), constraintIR: compile(), referencePlan: nativePlan, profile: MOCK_IMAGE_PROFILE })
  const jpeg = new CapabilityAwarePipelinePlanner().plan({ schemaVersion: 'voce.pipeline-planning-input/v1alpha1', caseId: CASE_ID, caseRevision: REVISION, contextHash: jpegPlan.contextHash, outputContract: output(), constraintIR: compile(), referencePlan: jpegPlan, profile: MOCK_JPEG_PROFILE })
  assert.equal(native.status, 'ok'); assert.equal(jpeg.status, 'ok')
  assert.equal(jpeg.pipelinePlan?.steps.some((step) => step.type === 'normalize'), true)
  for (const plan of [native.pipelinePlan!, jpeg.pipelinePlan!]) {
    assert.ok(plan.steps.every((step) => step.destination && step.cleanupObligationIds.length > 0))
    assert.equal(plan.cleanup.length > 0, true)
    assert.equal(plan.compensation.length > 0, true)
  }
  assert.ok(explainPipelinePlan(native.pipelinePlan!).entries.length > 0)
})

test('transparent output blocks when the selected provider does not support it natively', () => {
  const profileWithHash = { ...MOCK_JPEG_PROFILE, profileHash: computeProviderCapabilityProfileHash(MOCK_JPEG_PROFILE) }
  const referencePlan = refPlan(profileWithHash, [candidate('ref-01', 'required', 100_000, profileWithHash)])
  const ir = compile()
  const generator = { id: 'generator', type: 'generate' as const, capability: 'image_generation', adapterId: profileWithHash.adapterId, adapterVersion: { id: profileWithHash.adapterId, version: profileWithHash.version, digest: profileWithHash.adapterDigest! }, adapterDigest: profileWithHash.adapterDigest, profileVersion: { id: profileWithHash.id, version: profileWithHash.version, digest: profileWithHash.profileHash! }, outputMediaTypes: ['image/jpeg'], destination: profileWithHash.destination, dataCategories: ['reference_image'], mayCreateChargedSubmission: true }
  const validator = { id: 'validator', type: 'structural_validate' as const, capability: 'structural_validation', adapterId: 'validator', adapterVersion: { id: 'validator', version: '1.0.0', digest: sha256({ validator: 1 }) }, adapterDigest: sha256({ validator: 1 }), destination: 'local', dataCategories: ['output_metadata'], mayCreateChargedSubmission: false }
  const result = new CapabilityAwarePipelinePlanner().plan({ schemaVersion: 'voce.pipeline-planning-input/v1alpha1', caseId: CASE_ID, caseRevision: REVISION, contextHash: ir.contextHash, outputContract: output('transparent'), constraintIR: ir, referencePlan, profile: profileWithHash, registeredCapabilities: [generator, validator] })
  assert.equal(result.status, 'blocked')
  assert.ok(result.blockedReasons.includes('TRANSPARENT_OUTPUT_UNSATISFIABLE'))
})

test('authorization preflight fails closed on any bound plan or destination change', () => {
  const remote = createRemoteCallAuthorization({ schemaVersion: 'voce.remote-call-authorization/v1alpha1', id: 'auth-remote', caseId: CASE_ID, caseRevision: REVISION, contextHash: context().contextHash, stepId: 'generate', purpose: 'generation', inputHash: sha256({ input: 1 }), permittedArtifactHashes: [], permittedScopeIds: [], constraintIds: [], adapterId: 'mock.image-generator', adapterDigest: MOCK_IMAGE_PROFILE.adapterDigest!, profileDigest: MOCK_IMAGE_PROFILE.profileHash, destination: MOCK_IMAGE_PROFILE.destination!, dataCategories: ['reference_image'], maximumCalls: 1, maximumRetries: 0, timeoutMs: 120_000, idempotencyKey: 'idempotency-1', authority: 'fixture-authority', authorizedBy: 'fixture-user', authorizedAt: FIXED_M4_TIME })
  const snapshot = { kind: 'remote_call' as const, caseId: CASE_ID, caseRevision: REVISION, contextHash: remote.contextHash, stepId: remote.stepId, purpose: remote.purpose, inputHash: remote.inputHash, permittedArtifactHashes: [], permittedScopeIds: [], constraintIds: [], adapterId: remote.adapterId, adapterDigest: remote.adapterDigest, profileDigest: remote.profileDigest, destination: remote.destination, dataCategories: remote.dataCategories, maximumCalls: remote.maximumCalls, maximumRetries: remote.maximumRetries, timeoutMs: remote.timeoutMs, idempotencyKey: remote.idempotencyKey }
  const minimalRemote = preflightDispatch(remote, { kind: 'remote_call', caseId: CASE_ID, caseRevision: REVISION, contextHash: remote.contextHash })
  assert.equal(minimalRemote.code, 'AUTHORIZATION_STALE')
  assert.ok(minimalRemote.reasons.includes('SNAPSHOT_FIELD_MISSING:stepId'))
  assert.equal(preflightDispatch(remote, snapshot).status, 'authorized')
  assert.equal(preflightDispatch(remote, { ...snapshot, destination: 'mock://changed' }).code, 'AUTHORIZATION_STALE')
  const incompleteRemote = { ...remote, adapterDigest: undefined } as unknown as typeof remote
  const incompleteRemoteResult = preflightDispatch(incompleteRemote, snapshot)
  assert.equal(incompleteRemoteResult.code, 'EXECUTION_NOT_AUTHORIZED')
  assert.ok(incompleteRemoteResult.reasons.includes('AUTHORIZATION_FIELD_MISSING:adapterDigest'))
  const tampered = { ...remote, maximumCalls: 2 }
  assert.equal(preflightDispatch(tampered, snapshot).code, 'EXECUTION_NOT_AUTHORIZED')
  const execution = createExecutionAuthorization({ schemaVersion: 'voce.execution-authorization/v1alpha1', id: 'auth-execution', caseId: CASE_ID, caseRevision: REVISION, contextHash: remote.contextHash, constraintIRHash: sha256({ ir: 1 }), compilationSignature: sha256({ ir: 1 }), referencePlanHash: sha256({ refs: 1 }), pipelinePlanHash: sha256({ plan: 1 }), outputContractHash: sha256({ output: 1 }), adapterProfileDigests: [MOCK_IMAGE_PROFILE.profileHash!], destinations: [MOCK_IMAGE_PROFILE.destination!], dataTransferDigest: sha256({ transfer: 1 }), budgetDigest: sha256({ budget: 1 }), remoteCallAuthorizationIds: [remote.id], authority: 'fixture-authority', authorizedBy: 'fixture-user', authorizedAt: FIXED_M4_TIME })
  const minimalExecution = preflightDispatch(execution, { kind: 'execution', caseId: CASE_ID, caseRevision: REVISION, contextHash: execution.contextHash })
  assert.equal(minimalExecution.code, 'AUTHORIZATION_STALE')
  assert.ok(minimalExecution.reasons.includes('SNAPSHOT_FIELD_MISSING:constraintIRHash'))
  const executionSnapshot = { kind: 'execution' as const, caseId: CASE_ID, caseRevision: REVISION, contextHash: execution.contextHash, constraintIRHash: execution.constraintIRHash, compilationSignature: execution.compilationSignature, referencePlanHash: execution.referencePlanHash, pipelinePlanHash: execution.pipelinePlanHash, outputContractHash: execution.outputContractHash, adapterProfileDigests: execution.adapterProfileDigests, destinations: execution.destinations, dataTransferDigest: execution.dataTransferDigest, budgetDigest: execution.budgetDigest, remoteCallAuthorizationIds: execution.remoteCallAuthorizationIds }
  assert.equal(preflightDispatch(execution, executionSnapshot).status, 'authorized')
  assert.equal(preflightDispatch(execution, { ...executionSnapshot, budgetDigest: sha256({ budget: 2 }) }).code, 'AUTHORIZATION_STALE')
  assert.equal(computeExecutionAuthorizationHash(execution), execution.authorizationHash)
  assert.equal(computeExecutionAuthorizationHash({ ...execution, authorizedAt: '2026-08-14T00:00:00.000Z' }), execution.authorizationHash)
})

test('explain and semantic diff ignore volatile hashes and identify degradation/blocking changes', () => {
  const before = compile([intent('identity', 'preserve', 'person.identity', 'preferred')])
  const after = compile([intent('identity', 'preserve', 'person.identity', 'preferred'), intent('mask', 'replace', 'accessories.mask', 'preferred', { coverage: 'full_face' })])
  const explanation = explainConstraintIR(after)
  assert.ok(explanation.entries.some((entry) => entry.reasonCode === 'MASK_IDENTITY_VISIBILITY_CONFLICT'))
  const diff = diffConstraintIR(before, after)
  assert.ok(diff.added.length > 0)
  assert.ok(diff.degraded.length > 0)
  assert.equal(computeConstraintIRSignature(before), before.deterministicSignature)
})
