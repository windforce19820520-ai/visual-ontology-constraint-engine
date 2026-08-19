import { readFile } from 'node:fs/promises'
import { test } from 'node:test'
import assert from 'node:assert/strict'
import type { ConstraintIR, ReferenceCandidate } from '@voce-engine/contracts'
import { MOCK_LIMITED_REFERENCE_PROFILE, sha256, planReferences } from '@voce-engine/core'
import { bindReferenceCandidates, compileScenarioInput, compileSemanticClosure } from './semantic-closure.js'
import { scenarioDistribution } from './scenario-distribution.js'
import type { PlaygroundAssetDeclaration, PlaygroundScenarioInput } from './semantic-closure.js'

function asset(id: string): PlaygroundAssetDeclaration {
  return { id, storeId: 'playground-offline', contentHash: sha256({ asset: id }), mediaType: 'image/png', byteLength: 100_000, role: 'reference-image', resolverId: 'playground-offline', availability: 'available', retentionClass: 'request', redactionPolicy: 'safe-hash-only', ...(id === 'pose' ? { poseSourceKind: 'pose-sketch' as const } : {}) }
}

function input(scenarioId: PlaygroundScenarioInput['scenarioId'], declaredRoles: PlaygroundScenarioInput['declaredRoles'], selections: PlaygroundScenarioInput['compositionSelections'] = []): PlaygroundScenarioInput {
  const assets = [...new Set(declaredRoles.map((item) => item.assetId))].map(asset)
  return { scenarioId, assets, declaredRoles, compositionSelections: selections }
}

const tryOnRoles = [
  { assetId: 'person', role: 'person-identity' },
  { assetId: 'garment', role: 'garment-detail' },
  { assetId: 'wearing', role: 'wearing-effect' },
  { assetId: 'footwear', role: 'footwear-detail' },
]

const cosplayRoles = [
  { assetId: 'person', role: 'person-identity' },
  { assetId: 'character', role: 'character-design' },
]

test('Try-On four required references compile through Guard to ProviderRenderRequest', () => {
  const result = compileSemanticClosure(input('virtual-tryon', tryOnRoles, [{ presetId: 'full-shot' }]))
  assert.equal(result.seed.referenceCandidateSeeds.length, 4)
  assert.equal(result.binding.candidates.length, 4)
  assert.equal(result.referencePlan.ordered.length, 4)
  assert.equal(result.guardResult.status, 'accepted')
  assert.equal(result.providerRenderRequest.referenceMappings.length, 4)
})

test('Try-On optional pose becomes a fifth planned reference and only contributes pose', () => {
  const result = compileSemanticClosure(input('virtual-tryon', [...tryOnRoles, { assetId: 'pose', role: 'pose' }]))
  const pose = result.providerRenderRequest.referenceMappings.find((mapping) => mapping.role === 'pose')
  assert.ok(pose)
  assert.deepEqual(pose.prohibitedTargetPaths, ['environment.background', 'person.identity', 'style', 'wardrobe.footwear', 'wardrobe.garment', 'wardrobe.wearingEffect'])
  assert.equal(result.referencePlan.ordered.length, 5)
})

test('Cosplay supplemental signature prop and pose coexist', () => {
  const result = compileSemanticClosure(input('cosplay', [...cosplayRoles, { assetId: 'prop', role: 'signature-prop-detail' }, { assetId: 'pose', role: 'pose' }], [{ presetId: 'low-angle' }]))
  assert.deepEqual(result.referencePlan.ordered.map((item) => item.role).sort(), ['character-design', 'person-identity', 'pose', 'signature-prop-detail'])
})

test('character reference never receives person.identity constraint links', () => {
  const result = compileSemanticClosure(input('cosplay', [...cosplayRoles, { assetId: 'prop', role: 'signature-prop-detail' }]))
  const character = result.binding.candidates.find((candidate) => candidate.role === 'character-design')!
  assert.ok(character)
  assert.ok(character.constraintIds!.every((id) => !result.constraintIR.constraints.find((constraint) => constraint.id === id)?.targetPaths.includes('person.identity')))
})

test('reference isolation remains in PromptIR, Prompt Guard, and accepted request', () => {
  const result = compileSemanticClosure(input('cosplay', [...cosplayRoles, { assetId: 'pose', role: 'pose' }]))
  const poseMapping = result.providerRenderRequest.referenceMappings.find((mapping) => mapping.role === 'pose')!
  assert.ok(result.promptIR.forbidden.some((item) => item.text.includes('environment.background')))
  assert.ok(result.guardResult.guardedCandidate?.referenceMappings.some((mapping) => mapping.role === 'pose' && (mapping.prohibitedTargetPaths ?? []).includes('person.identity')))
  assert.ok((poseMapping.prohibitedTargetPaths ?? []).includes('style'))
  assert.ok((result.providerRenderRequest.forbidden ?? []).length >= result.promptIR.forbidden.length)
})

test('binder links only constraints whose sourceIds contain exact supporting intent and authorized path', () => {
  const result = compileSemanticClosure(input('cosplay', [...cosplayRoles, { assetId: 'prop', role: 'signature-prop-detail' }]))
  for (const candidate of result.binding.candidates) {
    const seed = result.seed.referenceCandidateSeeds.find((item) => item.id === candidate.id)!
    for (const id of candidate.constraintIds ?? []) {
      const constraint = result.constraintIR.constraints.find((item) => item.id === id)!
      assert.ok(constraint)
      assert.ok(constraint.sourceIds.some((sourceId) => seed.supportingIntentIds.includes(sourceId)))
      assert.ok(constraint.targetPaths.some((path) => seed.authorizedTargetPaths.includes(path) || seed.authorizedTargetPaths.some((allowed) => path.startsWith(`${allowed}.`))))
    }
  }
})

test('M4 merged constraints are bound by the actual surviving constraint ID', () => {
  const result = compileSemanticClosure(input('cosplay', cosplayRoles, [{ presetId: 'medium-shot' }, { presetId: 'medium-shot' }]))
  const merged = result.constraintIR.constraints.filter((constraint) => constraint.targetPath === 'camera.framing.shotScale')
  assert.equal(merged.length, 1)
  const supportingIntentIds = result.seed.changeIntents.filter((intent) => intent.targetPath === 'camera.framing.shotScale').map((intent) => intent.id)
  assert.equal(supportingIntentIds.length, 2)
  assert.ok(supportingIntentIds.every((id) => merged[0].sourceIds.includes(id)))
  const seed = result.seed.referenceCandidateSeeds[0]
  const syntheticSeed = { ...seed, id: 'composition-reference-seed', role: 'composition-reference', authorizedTargetPaths: ['camera.framing.shotScale'], ontologyScopes: ['camera.framing.shotScale'], supportingIntentIds }
  const binding = bindReferenceCandidates({ seeds: [syntheticSeed], dependencySeeds: [], constraintIR: result.constraintIR })
  assert.deepEqual(binding.candidates[0].constraintIds, [merged[0].id])
})

test('preferred seed omits when no active or satisfied constraint survives, required seed blocks', () => {
  const compiled = compileSemanticClosure(input('virtual-tryon', [...tryOnRoles, { assetId: 'pose', role: 'pose' }]))
  const poseInput = compileScenarioInput(input('virtual-tryon', [...tryOnRoles, { assetId: 'pose', role: 'pose' }]))
  const pose = compiled.constraintIR.constraints.find((constraint) => constraint.targetPath === 'pose')!
  const degraded = { ...compiled.constraintIR, constraints: compiled.constraintIR.constraints.map((constraint) => constraint.id === pose.id ? { ...constraint, status: 'unsatisfied' as const } : constraint) }
  const omitted = bindReferenceCandidates({ seeds: poseInput.referenceCandidateSeeds, dependencySeeds: [], constraintIR: degraded })
  assert.ok(omitted.omittedSeeds.some((item) => item.reasonCode === 'PREFERRED_REFERENCE_NO_SURVIVING_CONSTRAINT'))
  const requiredSeed = poseInput.referenceCandidateSeeds.find((seed) => seed.role === 'person-identity')!
  const requiredConstraint = degraded.constraints.find((constraint) => constraint.targetPath === 'person.identity')!
  const requiredIR: ConstraintIR = { ...degraded, constraints: degraded.constraints.map((constraint) => constraint.id === requiredConstraint.id ? { ...constraint, status: 'unsatisfied' as const, importance: 'required' as const } : constraint) }
  assert.throws(() => bindReferenceCandidates({ seeds: [requiredSeed], dependencySeeds: [], constraintIR: requiredIR }), /PLAYGROUND_REQUIRED_REFERENCE_NO_SURVIVING_CONSTRAINT/)
})

test('reference budget keeps required references and blocks when the profile cannot fit them', () => {
  const result = compileSemanticClosure(input('virtual-tryon', tryOnRoles))
  const limited = planReferences({ schemaVersion: 'voce.reference-planning-input/v1alpha1', caseId: result.constraintIR.caseId, caseRevision: result.constraintIR.caseRevision, contextHash: result.constraintIR.contextHash, constraintIR: result.constraintIR, candidates: [...result.binding.candidates], dependencies: [], profile: MOCK_LIMITED_REFERENCE_PROFILE })
  assert.equal(limited.status, 'blocked')
  assert.ok(limited.blockedReferences.length >= 1)
})

test('preferred close-up is degraded when required medium-shot owns the one-path cardinality', () => {
  const result = compileSemanticClosure(input('cosplay', cosplayRoles, [{ presetId: 'medium-shot', importance: 'required' }, { presetId: 'close-up', importance: 'preferred' }]))
  assert.ok(result.constraintIR.degradedPreferences.length >= 1)
  assert.ok(result.promptIR.excludedConstraints.some((item) => item.sourceIds.includes('close-up')))
  assert.ok(!result.promptIR.sections.some((section) => section.sourceIds.includes('close-up')))
})

test('changing role-to-asset assignment changes the request binding hash', () => {
  const first = compileSemanticClosure(input('cosplay', cosplayRoles))
  const second = compileSemanticClosure(input('cosplay', [{ assetId: 'character', role: 'person-identity' }, { assetId: 'person', role: 'character-design' }]))
  assert.notEqual(first.providerRenderRequest.requestHash, second.providerRenderRequest.requestHash)
})

test('unknown roles and missing assets fail before Core compilation', () => {
  assert.throws(() => compileScenarioInput(input('cosplay', [{ assetId: 'person', role: 'unknown-role' }, cosplayRoles[1]])), /PLAYGROUND_ROLE_UNKNOWN/)
  assert.throws(() => compileScenarioInput({ ...input('cosplay', cosplayRoles), assets: [asset('person')] }), /PLAYGROUND_ASSET_NOT_DECLARED/)
  const poseInput = input('cosplay', [...cosplayRoles, { assetId: 'pose', role: 'pose' }])
  assert.throws(() => compileScenarioInput({ ...poseInput, assets: poseInput.assets.map((item) => item.id === 'pose' ? { ...item, poseSourceKind: undefined } : item) }), /PLAYGROUND_POSE_SOURCE_INVALID/)
})

test('declared slots do not fabricate observations, bindings, or confirmed facts', () => {
  const result = compileSemanticClosure(input('cosplay', cosplayRoles))
  assert.equal(result.ontologyInstance.facts.length, 0)
  assert.equal(result.humanPlan.observedFacts.length, 0)
  assert.equal(result.humanPlan.confirmedSourceBindings.length, 0)
  assert.deepEqual(result.binding.candidates.map((candidate) => candidate.sourceBindingIds), [[], []])
})

test('semantic-equivalent role and selection order produces identical hashes', () => {
  const first = compileSemanticClosure(input('cosplay', [...cosplayRoles, { assetId: 'prop', role: 'signature-prop-detail' }], [{ presetId: 'low-angle' }, { presetId: 'rule-of-thirds' }]))
  const second = compileSemanticClosure(input('cosplay', [...cosplayRoles].reverse().concat({ assetId: 'prop', role: 'signature-prop-detail' }), [{ presetId: 'rule-of-thirds' }, { presetId: 'low-angle' }]))
  assert.equal(first.seed.declaredRolePlan.planHash, second.seed.declaredRolePlan.planHash)
  assert.equal(first.constraintIR.deterministicSignature, second.constraintIR.deterministicSignature)
  assert.equal(first.providerRenderRequest.requestHash, second.providerRenderRequest.requestHash)
})

test('Playground semantic closure uses public package exports only', async () => {
  const distribution = scenarioDistribution('cosplay')
  assert.ok(Object.isFrozen(distribution))
  assert.ok(Object.isFrozen(distribution.effectiveScenario))
  assert.ok(Object.isFrozen(distribution.roles[0]))
  const posePolicy = distribution.roles.find((role) => role.role === 'pose')!
  assert.ok(posePolicy.targets.some((target) => target.targetPath === 'pose' && target.operation === 'adjust'))
  assert.ok(posePolicy.displayOnlyNonContributions.some((text) => text.includes('person identity')))
  const source = await readFile(new URL('../src/semantic-closure.ts', import.meta.url), 'utf8')
  assert.doesNotMatch(source, /packages[\\/]core[\\/]src/)
})
