import test from 'node:test'
import assert from 'node:assert/strict'
import type {
  ArtifactHandle,
  ChangeIntent,
  CompilationContext,
  ConstraintCompilationInput,
  DeclarativeRule,
  EffectiveScenario,
  ConstraintIR,
  JsonValue,
  OntologyFact,
  OntologyInstance,
  OutputContract,
  ProviderCapabilityProfile,
  ReferenceCandidate,
} from '@voce-engine/contracts'
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
  hashWithoutSelf,
  sha256,
  VISUAL_COMPOSITION_PATHS,
  VISUAL_COMPOSITION_PRESETS,
  expandVisualCompositionPreset,
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

function compositionScenario(rules: DeclarativeRule[] = []): EffectiveScenario {
  const base = {
    lockHash: sha256({ fixture: 'composition-lock' }), rootPackId: 'composition.fixture', extensionPackIds: [], compositionOrder: ['composition.fixture'], configurations: {},
    ontologyVocabulary: [{ packId: 'composition.fixture', contributionKind: 'ontologyVocabulary', contributionId: 'composition.vocabulary', contentDigest: sha256({ fixture: 'composition-vocabulary' }), paths: VISUAL_COMPOSITION_PATHS }],
    rulePacks: rules.length ? [{ packId: 'composition.fixture', contributionKind: 'rulePacks', contributionId: 'composition.rules', contentDigest: sha256(rules as unknown as JsonValue), namespace: 'composition.fixture', rules }] : [], interpretationScopes: [], promptSections: [], reviewTemplates: [], defaults: [], capabilityRequirements: [], declarations: [], appliedOverrides: [], effectiveScenarioHash: '',
  } as unknown as EffectiveScenario
  return { ...base, effectiveScenarioHash: hashWithoutSelf(base as unknown as Record<string, unknown>, 'effectiveScenarioHash') }
}

function compileComposition(intents: ChangeIntent[], rules: DeclarativeRule[] = []): ConstraintIR {
  const scenario = compositionScenario(rules)
  const currentContext = context({ effectiveScenarioHash: scenario.effectiveScenarioHash })
  return compile(intents, ontology([], { contextHash: currentContext.contextHash }), currentContext, { effectiveScenario: scenario })
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

test('visual composition catalog expands full shot atomically and preserves selector provenance', () => {
  assert.equal(VISUAL_COMPOSITION_PATHS.length, 37)
  assert.equal(VISUAL_COMPOSITION_PRESETS.length, 30)
  const full = expandVisualCompositionPreset('full-shot')
  assert.deepEqual(full.map((item) => [item.targetPath, item.requestedValue]), [['camera.framing.shotScale', 'full_shot'], ['camera.framing.crop.keepBothFeet', true]])
  assert.ok(full.every((item) => item.sourceHintIds?.includes('full-shot')))
  assert.throws(() => expandVisualCompositionPreset('leading-room'), /COMPOSITION_PRESET_INPUT_REQUIRED/)
  assert.throws(() => expandVisualCompositionPreset('negative-space', { inputs: { direction: 'banana' } }), /COMPOSITION_PRESET_INPUT_INVALID/)
  assert.deepEqual(expandVisualCompositionPreset('extreme-close-up').map((item) => [item.targetPath, item.requestedValue]), [
    ['camera.framing.shotScale', 'extreme_close_up'],
    ['camera.framing.focusTarget', 'eye'],
  ])
  assert.deepEqual(expandVisualCompositionPreset('rule-of-thirds').map((item) => [item.targetPath, item.requestedValue]), [
    ['camera.composition.patterns.ruleOfThirds', true],
    ['camera.composition.placement', 'right_third'],
  ])
  assert.deepEqual(expandVisualCompositionPreset('triangle-composition').map((item) => [item.targetPath, item.requestedValue]), [
    ['camera.composition.patterns.triangle', true],
    ['camera.composition.patterns.triangleSource', 'subject_pose'],
  ])
  assert.equal(expandVisualCompositionPreset('reflection-composition').length, 8)
  assert.equal(expandVisualCompositionPreset('reflection-composition').find((change) => change.targetPath === 'camera.composition.subjectEnvironmentPlacement')?.requestedValue, 'Aim the camera across foreground water toward the person standing on the dry far bank. Show the shoreline directly below both feet and align the water reflection directly below the person on the same vertical image axis.')
  assert.ok(expandVisualCompositionPreset('reflection-composition').some((item) => item.targetPath === 'camera.composition.reflection.surface' && item.requestedValue === 'water'))
  assert.ok(expandVisualCompositionPreset('reflection-composition').some((item) => item.targetPath === 'camera.composition.reflection.subjectSurfaceRelationship' && item.requestedValue === 'on_dry_shore_beside_water'))
  assert.ok(expandVisualCompositionPreset('reflection-composition').some((item) => item.targetPath === 'environment.background' && String(item.requestedValue).includes('calm foreground lake water')))
  assert.equal(expandVisualCompositionPreset('mirror-composition').length, 7)
  assert.ok(expandVisualCompositionPreset('mirror-composition').some((item) => item.targetPath === 'camera.composition.reflection.presentation' && item.requestedValue === 'face_visible_in_mirror'))
  assert.ok(expandVisualCompositionPreset('profile-silhouette', { inputs: { silhouette: true } }).some((item) => item.targetPath === 'lighting.subjectRendering' && item.requestedValue === 'silhouette'))
})

test('visual composition catalog is immutable and expansion returns defensive provenance copies', () => {
  const before = expandVisualCompositionPreset('full-shot')[0].requestedValue
  assert.throws(() => { (VISUAL_COMPOSITION_PRESETS as unknown as Array<{ changes: Array<{ requestedValue?: JsonValue }> }>).find((item) => item.changes[0]?.requestedValue === 'full_shot')!.changes[0].requestedValue = 'close_up' }, TypeError)
  assert.equal(expandVisualCompositionPreset('full-shot')[0].requestedValue, before)
  const provenance = { source: 'user_explicit' as const, sourceIds: ['selection'], createdBy: 'm4-test', createdAt: FIXED_M4_TIME }
  const expanded = expandVisualCompositionPreset('full-shot', { provenance })
  expanded[0].provenance.sourceIds.push('mutated')
  assert.deepEqual(expanded[1].provenance.sourceIds, ['selection'])
  assert.deepEqual(provenance.sourceIds, ['selection'])
})

test('cardinality one keeps required full shot, marks preferred close-up unsatisfied, and blocks two required values', () => {
  const full = expandVisualCompositionPreset('full-shot').filter((item) => item.targetPath === 'camera.framing.shotScale').map((item) => ({ ...item, id: 'full-shot-required', importance: 'required' as const }))
  const close = expandVisualCompositionPreset('close-up').filter((item) => item.targetPath === 'camera.framing.shotScale').map((item) => ({ ...item, id: 'close-up-preferred' }))
  const resolved = compileComposition([...full, ...close])
  const shotConstraints = resolved.constraints.filter((item) => item.targetPath === 'camera.framing.shotScale')
  assert.equal(resolved.status, 'ok')
  assert.equal(shotConstraints.filter((item) => item.status === 'active').length, 1)
  const loser = shotConstraints.find((item) => item.status === 'unsatisfied')!
  assert.equal(loser.importance, 'preferred')
  assert.equal(resolved.degradedPreferences.filter((item) => item.constraintId === loser.id).length, 1)
  assert.ok(resolved.ruleTraces.some((item) => item.outcome === 'degraded' && item.inputIds.includes(loser.id)))

  const requiredClose = close.map((item) => ({ ...item, id: 'close-up-required', importance: 'required' as const }))
  const blocked = compileComposition([...full, ...requiredClose])
  assert.equal(blocked.status, 'blocked')
  assert.ok(blocked.conflicts.some((item) => item.code === 'CARDINALITY_CONFLICT' && item.blocking))
})

test('two preferred placement values block without a semantic last-wins choice', () => {
  const left = { ...expandVisualCompositionPreset('rule-of-thirds')[0], id: 'left-third', targetPath: 'camera.composition.placement', requestedValue: 'left_third' as const }
  const right = { ...left, id: 'right-third', requestedValue: 'right_third' as const }
  const result = compileComposition([left, right])
  assert.equal(result.status, 'blocked')
  assert.ok(result.conflicts.some((item) => item.code === 'CARDINALITY_CONFLICT' && item.blocking))
  assert.equal(result.constraints.filter((item) => item.targetPath === 'camera.composition.placement' && item.status === 'unsatisfied').length, 0)
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

test('preferred conflicts block unless a declarative rule identifies the degradable operand', () => {
  const result = compile([intent('identity', 'preserve', 'person.identity', 'preferred'), intent('mask', 'replace', 'accessories.mask', 'preferred', { coverage: 'full_face' })])
  assert.equal(result.status, 'blocked')
  assert.equal(result.degradedPreferences.length, 0)
  assert.ok(result.conflicts.some((conflict) => conflict.code === 'MASK_IDENTITY_VISIBILITY_CONFLICT' && conflict.blocking))

  const degradableRule: DeclarativeRule = {
    id: 'composition-preference', kind: 'incompatibility',
    operands: [{ id: 'thirds', conditions: [{ path: 'camera.composition.patterns.ruleOfThirds', operator: 'present' }] }, { id: 'lines', conditions: [{ path: 'camera.composition.patterns.leadingLines', operator: 'present' }] }],
    resolution: { strategy: 'degrade_operand', operandId: 'lines', reasonCode: 'COMPOSITION_PREFERENCE_DEGRADED' }, importance: 'preferred', explanation: 'The fixture chooses rule of thirds over leading lines.',
  }
  const resolved = compileComposition([expandVisualCompositionPreset('rule-of-thirds')[0], expandVisualCompositionPreset('leading-lines')[0]], [degradableRule])
  assert.equal(resolved.status, 'ok')
  const thirds = resolved.constraints.find((item) => item.targetPath === 'camera.composition.patterns.ruleOfThirds')!
  const lines = resolved.constraints.find((item) => item.targetPath === 'camera.composition.patterns.leadingLines')!
  assert.equal(thirds.status, 'active')
  assert.equal(lines.status, 'unsatisfied')
  assert.equal(resolved.degradedPreferences.filter((item) => item.constraintId === lines.id).length, 1)
})

test('dependency operands preserve the declared trigger and absent distinguishes presence', () => {
  const dependency: DeclarativeRule = {
    id: 'leading-room-direction', kind: 'dependency',
    operands: [{ id: 'z-trigger', conditions: [{ path: 'camera.composition.leadingRoom.enabled', operator: 'equals', value: true }] }, { id: 'a-required', conditions: [{ path: 'camera.composition.leadingRoom.direction', operator: 'present' }] }],
    resolution: { strategy: 'block', reasonCode: 'LEADING_ROOM_DIRECTION_REQUIRED' }, importance: 'required', explanation: 'Leading room requires a direction.',
  }
  const enabled = { ...expandVisualCompositionPreset('rule-of-thirds')[0], id: 'leading-room-enabled', targetPath: 'camera.composition.leadingRoom.enabled', requestedValue: true, importance: 'required' as const }
  const missing = compileComposition([enabled], [dependency])
  assert.equal(missing.status, 'blocked')
  assert.ok(missing.conflicts.some((item) => item.code === 'CONSTRAINT_DEPENDENCY_MISSING'))

  const absenceRule: DeclarativeRule = {
    id: 'direction-must-be-absent', kind: 'dependency',
    operands: [{ id: 'trigger', conditions: [{ path: 'camera.composition.leadingRoom.enabled', operator: 'present' }] }, { id: 'absence', conditions: [{ path: 'camera.composition.leadingRoom.direction', operator: 'absent' }] }],
    resolution: { strategy: 'block', reasonCode: 'DIRECTION_MUST_BE_ABSENT' }, importance: 'required', explanation: 'Fixture rule proving absent semantics.',
  }
  const absent = compileComposition([enabled], [absenceRule])
  assert.equal(absent.status, 'ok')
  const direction = { ...enabled, id: 'leading-room-direction', targetPath: 'camera.composition.leadingRoom.direction', requestedValue: 'right' }
  const present = compileComposition([enabled, direction], [absenceRule])
  assert.equal(present.status, 'blocked')
  assert.ok(present.conflicts.some((item) => item.code === 'CONSTRAINT_DEPENDENCY_MISSING'))
})

test('typed composition values and conflicting path definitions fail closed', () => {
  const invalid = { ...expandVisualCompositionPreset('rule-of-thirds')[0], id: 'invalid-placement', targetPath: 'camera.composition.placement', requestedValue: 'banana' }
  assert.ok(compileComposition([invalid]).warnings.includes('ONTOLOGY_VALUE_INVALID'))
  const scenario = compositionScenario()
  scenario.ontologyVocabulary.push({ packId: 'composition.extension', contributionKind: 'ontologyVocabulary', contributionId: 'conflicting.vocabulary', contentDigest: sha256({ fixture: 'conflict' }), paths: [{ path: 'camera.composition.placement', valueKind: 'enum', cardinality: 'one', allowedValues: ['banana'] }] } as never)
  scenario.effectiveScenarioHash = hashWithoutSelf(scenario as unknown as Record<string, unknown>, 'effectiveScenarioHash')
  const currentContext = context({ effectiveScenarioHash: scenario.effectiveScenarioHash })
  const result = compile([invalid], ontology([], { contextHash: currentContext.contextHash }), currentContext, { effectiveScenario: scenario })
  assert.equal(result.status, 'blocked')
  assert.ok(result.warnings.includes('ONTOLOGY_PATH_DEFINITION_COLLISION'))
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

test('legacy reference candidate hash is unchanged when isolation fields are absent', () => {
  const legacy: ReferenceCandidate = { schemaVersion: 'voce.reference-candidate/v1alpha1', id: 'legacy-reference', assetId: 'legacy-asset', contentHash: sha256({ asset: 'legacy-asset' }) }
  assert.equal(computeReferenceCandidateHash(legacy), sha256({ schemaVersion: legacy.schemaVersion, id: legacy.id, assetId: legacy.assetId, contentHash: legacy.contentHash, ontologyScopes: [], constraintIds: [], sourceBindingIds: [], goalIds: [] }))
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

test('same content with mutually isolated scopes blocks instead of merging contradictory mappings', () => {
  const identity = candidate('identity-reference', 'hard', 200_000)
  identity.ontologyScopes = ['person.identity']
  identity.prohibitedTargetPaths = ['character.costume']
  identity.prohibitedTargetPathImportance = { 'character.costume': 'hard' }
  identity.candidateHash = computeReferenceCandidateHash(identity)
  const character = candidate('character-reference', 'required', 200_000)
  character.contentHash = identity.contentHash
  character.artifact = { ...character.artifact!, contentHash: identity.contentHash }
  character.ontologyScopes = ['character.costume']
  character.prohibitedTargetPaths = ['person.identity']
  character.prohibitedTargetPathImportance = { 'person.identity': 'hard' }
  character.candidateHash = computeReferenceCandidateHash(character)
  const plan = refPlan(MOCK_IMAGE_PROFILE, [identity, character])
  assert.equal(plan.status, 'blocked')
  assert.equal(plan.blockedReferences.length, 2)
  assert.ok(plan.blockedReferences.every((item) => item.reasonCode === 'REFERENCE_ISOLATION_CONFLICT'))
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
  const before = compile([intent('identity', 'preserve', 'person.identity', 'required')])
  const after = compile([intent('identity', 'preserve', 'person.identity', 'required'), intent('mask', 'replace', 'accessories.mask', 'preferred', { coverage: 'full_face' })])
  const explanation = explainConstraintIR(after)
  assert.ok(explanation.entries.some((entry) => entry.reasonCode === 'MASK_IDENTITY_VISIBILITY_CONFLICT'))
  const diff = diffConstraintIR(before, after)
  assert.ok(diff.added.length > 0)
  assert.ok(diff.degraded.length > 0)
  assert.equal(computeConstraintIRSignature(before), before.deterministicSignature)
})
