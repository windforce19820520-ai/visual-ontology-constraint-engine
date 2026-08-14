import test from 'node:test'
import assert from 'node:assert/strict'
import type {
  ArtifactHandle,
  BindingDecision,
  ChangeIntent,
  EffectiveScenario,
  EvidenceAndSourceResolverInput,
  Observation,
  ObservationDecision,
  RequestedScopePlan,
  SourceBinding,
} from '@voce-engine/contracts'
import {
  EvidenceAndSourceResolver,
  FixtureReferenceInterpreter,
  ManualReferenceInterpreter,
  createBindingDecision,
  createObservation,
  createObservationDecision,
  createSourceBinding,
  computeRequestedScopePlanHash,
  sha256,
} from './index.js'

const CONTEXT_HASH = sha256({ fixture: 'm3-context' })
const CREATED_AT = '2026-01-01T00:00:00.000Z'

function asset(id = 'ref-01'): ArtifactHandle {
  return { id, storeId: 'fixture-store', contentHash: sha256({ asset: id }), mediaType: 'image/png', role: 'reference', resolverId: 'fixture', availability: 'available', retentionClass: 'fixture', redactionPolicy: 'hash-only' }
}

function plan(paths: string[], assetId = 'ref-01', excludedScopes: string[] = []): RequestedScopePlan {
  const orderedPaths = [...paths].sort()
  const base = {
    schemaVersion: 'voce.requested-scope-plan/v1alpha1' as const,
    id: 'plan-m3',
    caseId: 'case-m3',
    caseRevision: 1,
    scopes: orderedPaths.map((ontologyPath, index) => ({ schemaVersion: 'voce.requested-scope/v1alpha1' as const, id: `scope-${index + 1}`, ontologyPath, assetIds: [assetId], purpose: 'find_source' as const, required: true })),
    excludedScopes,
    questions: [],
  }
  return { ...base, planHash: computeRequestedScopePlanHash(base) }
}

function observation(id: string, ontologyPath: string, value: string, assetId = 'ref-01'): Observation {
  return createObservation({
    schemaVersion: 'voce.observation/v1alpha1',
    id,
    assetId,
    ontologyPath,
    value,
    provenance: { source: 'reference_observed', sourceIds: [assetId], createdBy: 'fixture', createdAt: CREATED_AT },
    warnings: [],
  })
}

function observationDecision(value: Observation, contextHash = CONTEXT_HASH, status: ObservationDecision['status'] = 'confirmed', decisionId = `decision-${value.id}`): ObservationDecision {
  return createObservationDecision({
    schemaVersion: 'voce.observation-decision/v1alpha1',
    decisionId,
    observationId: value.id,
    observationHash: value.contentHash,
    contextHash,
    status,
    authority: 'user',
    decidedBy: 'reviewer',
    decidedAt: CREATED_AT,
    reasonCode: 'fixture',
  })
}

function intent(id: string, operation: ChangeIntent['operation'], targetPath: string, requestedValue?: string): ChangeIntent {
  return {
    schemaVersion: 'voce.change-intent/v1alpha1',
    id,
    operation,
    targetPath,
    ...(requestedValue === undefined ? {} : { requestedValue }),
    importance: 'required',
    provenance: { source: 'user_explicit', sourceIds: [id], createdBy: 'fixture', createdAt: CREATED_AT },
  }
}

function resolverInput(overrides: Partial<EvidenceAndSourceResolverInput> = {}): EvidenceAndSourceResolverInput {
  return {
    schemaVersion: 'voce.evidence-source-resolver-input/v1alpha1',
    caseId: 'case-m3',
    caseRevision: 1,
    contextHash: CONTEXT_HASH,
    requestedScopePlan: plan(['person.identity']),
    changeIntents: [],
    observations: [],
    observationDecisions: [],
    sourceBindings: [],
    bindingDecisions: [],
    trustedMetadata: [],
    ...overrides,
  }
}

function confirmedBinding(id: string, targetPath: string, observationId: string, relation: SourceBinding['relation'] = 'preserve', contextHash = CONTEXT_HASH, priority: SourceBinding['priority'] = 'required'): { binding: SourceBinding; decision: BindingDecision } {
  const binding = createSourceBinding({ schemaVersion: 'voce.source-binding/v1alpha1', id, targetPath, observationIds: [observationId], relation, priority })
  const decision = createBindingDecision({ schemaVersion: 'voce.binding-decision/v1alpha1', decisionId: `decision-${id}`, bindingId: id, bindingHash: binding.contentHash, contextHash, status: 'confirmed', authority: 'user', decidedBy: 'reviewer', decidedAt: CREATED_AT, reasonCode: 'fixture' })
  return { binding, decision }
}

function effectiveScenario(rootPackId: string): EffectiveScenario {
  return {
    lockHash: sha256({ lock: rootPackId }),
    rootPackId,
    extensionPackIds: [],
    compositionOrder: [`${rootPackId}@1.0.0`],
    configurations: {},
    ontologyVocabulary: [],
    rulePacks: [],
    interpretationScopes: [{ packId: rootPackId, contributionKind: 'interpretationScopes', contributionId: 'person.identity', contentDigest: sha256({ rootPackId, path: 'person.identity' }), ontologyPath: 'person.identity' }],
    promptSections: [],
    reviewTemplates: [],
    defaults: [],
    capabilityRequirements: [],
    declarations: [],
    appliedOverrides: [],
    effectiveScenarioHash: sha256({ rootPackId, path: 'person.identity' }),
  }
}

test('FixtureReferenceInterpreter emits multiple scopes from one ref-01 without source decisions', () => {
  const input = {
    schemaVersion: 'voce.reference-interpreter-input/v1alpha1' as const,
    caseId: 'case-m3', caseRevision: 1, contextHash: CONTEXT_HASH,
    assets: [asset()],
    requestedScopePlan: plan(['person.identity', 'person.hair', 'expression', 'pose', 'wardrobe.top', 'environment.background', 'camera.framing']),
    fixtureId: 'ref-01',
  }
  const result = new FixtureReferenceInterpreter().interpret(input)
  assert.equal(result.observations.length, 7)
  assert.deepEqual(result.observations.map((item) => item.ontologyPath).sort(), ['camera.framing', 'environment.background', 'expression', 'person.hair', 'person.identity', 'pose', 'wardrobe.top'])
  for (const item of result.observations) assert.equal(Object.hasOwn(item, 'status'), false)
  assert.equal(Object.hasOwn(result, 'sourceBindings'), false)
})

test('Reference interpreters explain a scope that RequestedScopePlan does not allow', () => {
  const input = {
    schemaVersion: 'voce.reference-interpreter-input/v1alpha1' as const,
    caseId: 'case-m3', caseRevision: 1, contextHash: CONTEXT_HASH, assets: [asset()],
    requestedScopePlan: plan(['person.identity']),
    manualDeclarations: [{ schemaVersion: 'voce.manual-observation-declaration/v1alpha1' as const, id: 'obs-background', assetId: 'ref-01', ontologyPath: 'environment.background', value: 'city', provenance: { source: 'user_explicit' as const, sourceIds: ['ref-01'], createdBy: 'fixture', createdAt: CREATED_AT }, warnings: [] }],
  }
  const result = new ManualReferenceInterpreter().interpret(input)
  assert.deepEqual(result.observations.map((item) => item.ontologyPath), [])
  assert.equal(result.unresolvedItems.length, 1)
  assert.equal(result.unresolvedItems[0].code, 'SCOPE_NOT_PERMITTED')
})

test('interpreters block tampered and case-mismatched RequestedScopePlans before normalization', () => {
  const base = {
    schemaVersion: 'voce.reference-interpreter-input/v1alpha1' as const,
    caseId: 'case-m3', caseRevision: 1, contextHash: CONTEXT_HASH, assets: [asset()], fixtureId: 'ref-01',
    requestedScopePlan: plan(['person.identity']),
  }
  const tampered = new FixtureReferenceInterpreter().interpret({ ...base, requestedScopePlan: { ...base.requestedScopePlan, planHash: sha256({ tampered: true }) } })
  assert.equal(tampered.status, 'blocked')
  assert.equal(tampered.observations.length, 0)
  assert.ok(tampered.unresolvedItems.some((item) => item.code === 'REQUESTED_SCOPE_PLAN_HASH_MISMATCH'))
  const caseMismatch = new ManualReferenceInterpreter().interpret({
    ...base,
    requestedScopePlan: { ...base.requestedScopePlan, caseId: 'other-case' },
    manualDeclarations: [{ schemaVersion: 'voce.manual-observation-declaration/v1alpha1', id: 'obs-identity', assetId: 'ref-01', ontologyPath: 'person.identity', value: 'subject', provenance: { source: 'user_explicit', sourceIds: ['ref-01'], createdBy: 'fixture', createdAt: CREATED_AT }, warnings: [] }],
  })
  assert.equal(caseMismatch.status, 'blocked')
  assert.ok(caseMismatch.unresolvedItems.some((item) => item.code === 'REQUESTED_SCOPE_PLAN_CASE_MISMATCH'))
})

test('resolver blocks tampered and case-mismatched RequestedScopePlans before normalization', () => {
  const tampered = new EvidenceAndSourceResolver().resolve(resolverInput({ requestedScopePlan: { ...plan(['person.identity']), planHash: sha256({ tampered: true }) } }))
  assert.equal(tampered.status, 'blocked')
  assert.equal(tampered.ontologyInstance.facts.length, 0)
  assert.ok(tampered.unresolvedItems.some((item) => item.code === 'REQUESTED_SCOPE_PLAN_HASH_MISMATCH'))
  const caseMismatch = new EvidenceAndSourceResolver().resolve(resolverInput({ requestedScopePlan: { ...plan(['person.identity']), caseId: 'other-case' } }))
  assert.equal(caseMismatch.status, 'blocked')
  assert.ok(caseMismatch.unresolvedItems.some((item) => item.code === 'REQUESTED_SCOPE_PLAN_CASE_MISMATCH'))
})

test('scope authorization is exact-or-descendant and never ancestor-by-accident', () => {
  const declaration = { schemaVersion: 'voce.manual-observation-declaration/v1alpha1' as const, id: 'obs-person', assetId: 'ref-01', ontologyPath: 'person', value: 'broad-person', provenance: { source: 'user_explicit' as const, sourceIds: ['ref-01'], createdBy: 'fixture', createdAt: CREATED_AT }, warnings: [] }
  const narrow = new ManualReferenceInterpreter().interpret({ schemaVersion: 'voce.reference-interpreter-input/v1alpha1', caseId: 'case-m3', caseRevision: 1, contextHash: CONTEXT_HASH, assets: [asset()], requestedScopePlan: plan(['person.identity']), manualDeclarations: [declaration] })
  assert.equal(narrow.observations.length, 0)
  assert.ok(narrow.unresolvedItems.some((item) => item.code === 'SCOPE_NOT_PERMITTED'))
  const broad = new ManualReferenceInterpreter().interpret({ schemaVersion: 'voce.reference-interpreter-input/v1alpha1', caseId: 'case-m3', caseRevision: 1, contextHash: CONTEXT_HASH, assets: [asset()], requestedScopePlan: plan(['person']), manualDeclarations: [{ ...declaration, id: 'obs-identity', ontologyPath: 'person.identity', value: 'identity' }] })
  assert.deepEqual(broad.observations.map((item) => item.ontologyPath), ['person.identity'])
})

test('source bindings require exact observation and target paths without implicit projection', () => {
  const candidate = observation('obs-identity', 'person.identity', 'subject')
  const binding = confirmedBinding('binding-parent', 'person', candidate.id)
  const result = new EvidenceAndSourceResolver().resolve(resolverInput({ requestedScopePlan: plan(['person']), observations: [candidate], observationDecisions: [observationDecision(candidate)], sourceBindings: [binding.binding], bindingDecisions: [binding.decision] }))
  assert.equal(result.ontologyInstance.facts.length, 0)
  assert.ok(result.unresolvedItems.some((item) => item.code === 'BINDING_PATH_MISMATCH'))
})

test('unconfirmed observations cannot enter an OntologyInstance', () => {
  const candidate = observation('obs-identity', 'person.identity', 'subject')
  const result = new EvidenceAndSourceResolver().resolve(resolverInput({ requestedScopePlan: plan(['person.identity']), changeIntents: [intent('preserve-identity', 'preserve', 'person.identity')], observations: [candidate] }))
  assert.equal(result.ontologyInstance.facts.length, 0)
  assert.ok(result.unresolvedItems.some((item) => item.code === 'OBSERVATION_NOT_CONFIRMED'))
})

test('stale ObservationDecision hash and context cannot admit a candidate', () => {
  const original = observation('obs-identity', 'person.identity', 'subject')
  const changed = observation('obs-identity', 'person.identity', 'different-subject')
  const staleHash = observationDecision(original)
  const staleContext = observationDecision(changed, sha256({ other: 'context' }))
  const result = new EvidenceAndSourceResolver().resolve(resolverInput({ observations: [changed], observationDecisions: [staleHash, staleContext], changeIntents: [intent('preserve-identity', 'preserve', 'person.identity')] }))
  assert.equal(result.ontologyInstance.facts.length, 0)
  assert.ok(result.unresolvedItems.some((item) => item.code === 'OBSERVATION_HASH_MISMATCH'))
  assert.ok(result.unresolvedItems.some((item) => item.code === 'OBSERVATION_CONTEXT_MISMATCH'))
})

test('resolver proposes a SourceBinding and proposed BindingDecision without promoting it', () => {
  const candidate = observation('obs-identity', 'person.identity', 'subject')
  const observationAcceptance = observationDecision(candidate)
  const result = new EvidenceAndSourceResolver().resolve(resolverInput({ observations: [candidate], observationDecisions: [observationAcceptance], changeIntents: [intent('preserve-identity', 'preserve', 'person.identity')] }))
  assert.equal(result.proposedBindings.length, 1)
  assert.equal(result.proposedBindingDecisions.length, 1)
  assert.equal(result.proposedBindingDecisions[0].status, 'proposed')
  assert.equal(result.ontologyInstance.facts.length, 0)
})

test('confirmed BindingDecision plus confirmed ObservationDecision admits a sparse fact', () => {
  const candidate = observation('obs-identity', 'person.identity', 'subject')
  const binding = confirmedBinding('binding-identity', 'person.identity', candidate.id)
  const result = new EvidenceAndSourceResolver().resolve(resolverInput({ observations: [candidate], observationDecisions: [observationDecision(candidate)], sourceBindings: [binding.binding], bindingDecisions: [binding.decision] }))
  assert.equal(result.confirmedBindings.length, 1)
  assert.deepEqual(result.ontologyInstance.facts.map((fact) => fact.path), ['person.identity'])
  assert.equal(result.ontologyInstance.facts[0].value, 'subject')
})

test('source facts trace confirmed BindingDecision IDs rather than SourceBinding IDs', () => {
  const candidate = observation('obs-audit', 'person.identity', 'subject')
  const binding = confirmedBinding('binding-audit', 'person.identity', candidate.id)
  const result = new EvidenceAndSourceResolver().resolve(resolverInput({ observations: [candidate], observationDecisions: [observationDecision(candidate)], sourceBindings: [binding.binding], bindingDecisions: [binding.decision] }))
  const fact = result.ontologyInstance.facts[0]
  assert.deepEqual(fact.acceptedByDecisionIds, [binding.decision.decisionId])
  assert.deepEqual(fact.acceptedByIds, [binding.decision.decisionId])
  assert.deepEqual(fact.sourceBindingIds, [binding.binding.id])
  assert.equal(Object.hasOwn(fact, 'acceptedBy'), false)
  assert.equal(fact.acceptedByDecisionIds.includes(binding.binding.id), false)
})

test('same-value confirmed sources merge deterministic decision ID arrays without comma encoding', () => {
  const first = observation('obs-same-first', 'person.identity', 'same')
  const second = observation('obs-same-second', 'person.identity', 'same')
  const firstBinding = confirmedBinding('binding-same-first', 'person.identity', first.id)
  const secondBinding = confirmedBinding('binding-same-second', 'person.identity', second.id)
  const result = new EvidenceAndSourceResolver().resolve(resolverInput({ observations: [second, first], observationDecisions: [observationDecision(second), observationDecision(first)], sourceBindings: [secondBinding.binding, firstBinding.binding], bindingDecisions: [secondBinding.decision, firstBinding.decision] }))
  assert.equal(result.ontologyInstance.facts.length, 1)
  assert.deepEqual(result.ontologyInstance.facts[0].acceptedByDecisionIds, [firstBinding.decision.decisionId, secondBinding.decision.decisionId].sort())
  assert.equal(result.ontologyInstance.facts[0].acceptedByIds.some((item) => item.includes(',')), false)
})

test('stale BindingDecision hash and context cannot admit a fact', () => {
  const candidate = observation('obs-identity', 'person.identity', 'subject')
  const binding = confirmedBinding('binding-identity', 'person.identity', candidate.id)
  const staleHash = { ...binding.decision, bindingHash: sha256({ changed: true }) }
  const { decisionHash: _ignoredDecisionHash, ...staleHashInput } = staleHash
  const staleHashWithDecisionHash = createBindingDecision(staleHashInput)
  const staleContext = createBindingDecision({ ...binding.decision, decisionId: 'decision-stale-context', contextHash: sha256({ other: 'context' }) })
  const result = new EvidenceAndSourceResolver().resolve(resolverInput({ observations: [candidate], observationDecisions: [observationDecision(candidate)], sourceBindings: [binding.binding], bindingDecisions: [staleHashWithDecisionHash, staleContext] }))
  assert.equal(result.ontologyInstance.facts.length, 0)
  assert.ok(result.unresolvedItems.some((item) => item.code === 'BINDING_HASH_MISMATCH'))
  assert.ok(result.unresolvedItems.some((item) => item.code === 'BINDING_CONTEXT_MISMATCH'))
})

test('confirmed and rejected ObservationDecisions for one candidate remain an unresolved conflict', () => {
  const candidate = observation('obs-conflict', 'person.identity', 'subject')
  const confirmed = observationDecision(candidate, CONTEXT_HASH, 'confirmed', 'decision-observation-confirmed')
  const rejected = observationDecision(candidate, CONTEXT_HASH, 'rejected', 'decision-observation-rejected')
  const result = new EvidenceAndSourceResolver().resolve(resolverInput({ observations: [candidate], observationDecisions: [rejected, confirmed], changeIntents: [intent('preserve-identity', 'preserve', 'person.identity')] }))
  assert.equal(result.ontologyInstance.facts.length, 0)
  assert.ok(result.conflicts.some((item) => item.code === 'OBSERVATION_DECISION_CONFLICT'))
  assert.ok(result.unresolvedItems.some((item) => item.code === 'OBSERVATION_DECISION_CONFLICT'))
})

test('conflicting duplicate ObservationDecision IDs cannot fall through a Map last-write', () => {
  const candidate = observation('obs-decision-id', 'person.identity', 'subject')
  const first = observationDecision(candidate, CONTEXT_HASH, 'confirmed', 'decision-same-id')
  const second = observationDecision(candidate, CONTEXT_HASH, 'rejected', 'decision-same-id')
  const left = new EvidenceAndSourceResolver().resolve(resolverInput({ observations: [candidate], observationDecisions: [first, second], changeIntents: [intent('preserve-identity', 'preserve', 'person.identity')] }))
  const right = new EvidenceAndSourceResolver().resolve(resolverInput({ observations: [candidate], observationDecisions: [second, first], changeIntents: [intent('preserve-identity', 'preserve', 'person.identity')] }))
  assert.equal(left.ontologyInstance.facts.length, 0)
  assert.ok(left.conflicts.some((item) => item.code === 'OBSERVATION_DECISION_ID_COLLISION'))
  assert.deepEqual(right, left)
})

test('confirmed and rejected BindingDecisions for one binding remain an unresolved conflict', () => {
  const candidate = observation('obs-binding-conflict', 'person.identity', 'subject')
  const binding = confirmedBinding('binding-decision-conflict', 'person.identity', candidate.id)
  const rejected = createBindingDecision({ ...(() => { const { decisionHash: _ignored, ...rest } = binding.decision; return rest })(), decisionId: 'decision-binding-rejected', status: 'rejected' })
  const result = new EvidenceAndSourceResolver().resolve(resolverInput({ observations: [candidate], observationDecisions: [observationDecision(candidate)], sourceBindings: [binding.binding], bindingDecisions: [binding.decision, rejected] }))
  assert.equal(result.ontologyInstance.facts.length, 0)
  assert.ok(result.conflicts.some((item) => item.code === 'BINDING_DECISION_CONFLICT'))
  assert.ok(result.unresolvedItems.some((item) => item.code === 'BINDING_DECISION_CONFLICT'))
})

test('conflicting duplicate SourceBinding IDs are blocked without last-write selection', () => {
  const candidate = observation('obs-binding-id', 'person.identity', 'subject')
  const first = createSourceBinding({ schemaVersion: 'voce.source-binding/v1alpha1', id: 'binding-same-id', targetPath: 'person.identity', observationIds: [candidate.id], relation: 'preserve', priority: 'required' })
  const second = createSourceBinding({ schemaVersion: 'voce.source-binding/v1alpha1', id: 'binding-same-id', targetPath: 'person.hair', observationIds: [candidate.id], relation: 'preserve', priority: 'required' })
  const result = new EvidenceAndSourceResolver().resolve(resolverInput({ requestedScopePlan: plan(['person.identity', 'person.hair']), observations: [candidate], observationDecisions: [observationDecision(candidate)], sourceBindings: [second, first] }))
  assert.equal(result.ontologyInstance.facts.length, 0)
  assert.ok(result.conflicts.some((item) => item.code === 'SOURCE_BINDING_ID_COLLISION'))
})

test('conflicting confirmed sources remain conflict/unresolved and are never last-win', () => {
  const first = observation('obs-first', 'wardrobe.top', 'red')
  const second = observation('obs-second', 'wardrobe.top', 'blue')
  const firstBinding = confirmedBinding('binding-first', 'wardrobe.top', first.id)
  const secondBinding = confirmedBinding('binding-second', 'wardrobe.top', second.id)
  const result = new EvidenceAndSourceResolver().resolve(resolverInput({ requestedScopePlan: plan(['wardrobe.top']), observations: [second, first], observationDecisions: [observationDecision(second), observationDecision(first)], sourceBindings: [secondBinding.binding, firstBinding.binding], bindingDecisions: [secondBinding.decision, firstBinding.decision] }))
  assert.equal(result.ontologyInstance.facts.length, 0)
  assert.equal(result.conflicts.length, 1)
  assert.equal(result.conflicts[0].code, 'SOURCE_CONFLICT_UNRESOLVED')
  assert.ok(result.questions.some((item) => item.code === 'SOURCE_CONFLICT_REQUIRES_ADJUDICATION'))
})

test('unknown, unspecified, and unresolved states remain distinct', () => {
  const unresolvedInput = {
    schemaVersion: 'voce.reference-interpreter-input/v1alpha1' as const,
    caseId: 'case-m3', caseRevision: 1, contextHash: CONTEXT_HASH, assets: [asset()],
    requestedScopePlan: plan(['person.identity', 'environment.background'], 'ref-01', ['camera']), fixtureId: 'ref-01',
  }
  const interpreted = new FixtureReferenceInterpreter().interpret(unresolvedInput)
  const result = new EvidenceAndSourceResolver().resolve(resolverInput({ requestedScopePlan: unresolvedInput.requestedScopePlan, observations: interpreted.observations, observationDecisions: interpreted.observations.map((item) => observationDecision(item)), changeIntents: [intent('create-background', 'create', 'environment.background')] }))
  assert.ok(result.ontologyInstance.unspecifiedPaths.includes('camera'))
  assert.ok(result.ontologyInstance.unresolvedItems.some((item) => item.code === 'TARGET_VALUE_UNSPECIFIED'))
  assert.ok(result.ontologyInstance.unknownPaths.length >= 1)
})

test('remove intent and exclude source relation are distinct decisions', () => {
  const candidate = observation('obs-earring', 'accessories.earrings', 'silver')
  const excluded = confirmedBinding('binding-exclude', 'accessories.earrings', candidate.id, 'exclude')
  const result = new EvidenceAndSourceResolver().resolve(resolverInput({ requestedScopePlan: plan(['accessories.earrings']), observations: [candidate], observationDecisions: [observationDecision(candidate)], changeIntents: [intent('remove-earring', 'remove', 'accessories.earrings')], sourceBindings: [excluded.binding], bindingDecisions: [excluded.decision] }))
  assert.equal(result.ontologyInstance.facts.length, 0)
  assert.ok(result.decisionTrace.some((item) => item.code === 'TARGET_REMOVE'))
  assert.ok(result.decisionTrace.some((item) => item.code === 'SOURCE_EXCLUDED'))
})

test('product-only source path works without a person assumption', () => {
  const product = observation('obs-product', 'product.shape', 'round')
  const binding = confirmedBinding('binding-product', 'product.shape', product.id)
  const result = new EvidenceAndSourceResolver().resolve(resolverInput({ requestedScopePlan: plan(['product.shape'], 'product-01'), observations: [product], observationDecisions: [observationDecision(product)], sourceBindings: [binding.binding], bindingDecisions: [binding.decision] }))
  assert.equal(result.ontologyInstance.facts.length, 1)
  assert.equal(result.ontologyInstance.facts[0].path, 'product.shape')
})

test('first-party and third-party EffectiveScenario values use the same resolver entrypoint', () => {
  const candidate = observation('obs-identity', 'person.identity', 'subject')
  const binding = confirmedBinding('binding-identity', 'person.identity', candidate.id)
  const base = resolverInput({ observations: [candidate], observationDecisions: [observationDecision(candidate)], sourceBindings: [binding.binding], bindingDecisions: [binding.decision] })
  const first = new EvidenceAndSourceResolver().resolve({ ...base, effectiveScenario: effectiveScenario('first.party') })
  const third = new EvidenceAndSourceResolver().resolve({ ...base, effectiveScenario: effectiveScenario('community') })
  assert.equal(first.ontologyInstance.facts.length, 1)
  assert.equal(third.ontologyInstance.facts.length, 1)
})

test('semantic insertion order does not change result order, hashes, or trace', () => {
  const first = observation('obs-first', 'person.identity', 'subject')
  const second = observation('obs-second', 'person.hair', 'short')
  const firstBinding = confirmedBinding('binding-first', 'person.identity', first.id)
  const secondBinding = confirmedBinding('binding-second', 'person.hair', second.id)
  const left = resolverInput({ requestedScopePlan: plan(['person.identity', 'person.hair']), observations: [first, second], observationDecisions: [observationDecision(first), observationDecision(second)], sourceBindings: [firstBinding.binding, secondBinding.binding], bindingDecisions: [firstBinding.decision, secondBinding.decision] })
  const right = resolverInput({ requestedScopePlan: plan(['person.hair', 'person.identity']), observations: [second, first], observationDecisions: [observationDecision(second), observationDecision(first)], sourceBindings: [secondBinding.binding, firstBinding.binding], bindingDecisions: [secondBinding.decision, firstBinding.decision] })
  const leftResult = new EvidenceAndSourceResolver().resolve(left)
  const rightResult = new EvidenceAndSourceResolver().resolve(right)
  assert.deepEqual(rightResult, leftResult)
})

test('interpreter and resolver returns are defensive copies', () => {
  const interpreterInput = {
    schemaVersion: 'voce.reference-interpreter-input/v1alpha1' as const,
    caseId: 'case-m3', caseRevision: 1, contextHash: CONTEXT_HASH, assets: [asset()],
    requestedScopePlan: plan(['person.identity']), fixtureId: 'ref-01',
  }
  const interpreter = new FixtureReferenceInterpreter()
  const first = interpreter.interpret(interpreterInput)
  first.observations[0].warnings.push('mutated')
  first.observations[0].provenance.sourceIds.push('mutated')
  const second = interpreter.interpret(interpreterInput)
  assert.deepEqual(second.observations[0].warnings, [])
  assert.equal(second.observations[0].provenance.sourceIds.includes('mutated'), false)
  const candidate = observation('obs-identity', 'person.identity', 'subject')
  const binding = confirmedBinding('binding-identity', 'person.identity', candidate.id)
  const resolver = new EvidenceAndSourceResolver()
  const result = resolver.resolve(resolverInput({ observations: [candidate], observationDecisions: [observationDecision(candidate)], sourceBindings: [binding.binding], bindingDecisions: [binding.decision] }))
  result.ontologyInstance.facts[0].provenance.sourceIds.push('mutated')
  const repeated = resolver.resolve(resolverInput({ observations: [candidate], observationDecisions: [observationDecision(candidate)], sourceBindings: [binding.binding], bindingDecisions: [binding.decision] }))
  assert.equal(repeated.ontologyInstance.facts[0].provenance.sourceIds.includes('mutated'), false)
})
