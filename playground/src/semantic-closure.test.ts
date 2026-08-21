import { readFile } from 'node:fs/promises'
import { test } from 'node:test'
import assert from 'node:assert/strict'
import type { ConstraintIR, ReferenceCandidate } from '@voce-engine/contracts'
import { MOCK_IMAGE_PROFILE, MOCK_LIMITED_REFERENCE_PROFILE, VISUAL_COMPOSITION_PRESETS, computeProviderCapabilityProfileHash, sha256, planReferences } from '@voce-engine/core'
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
  { assetId: 'top', role: 'garment-top', typedMetadata: { category: 'shirt' } },
  { assetId: 'bottom', role: 'garment-bottom', typedMetadata: { category: 'jeans' } },
  { assetId: 'footwear', role: 'footwear-detail' },
]

const cosplayRoles = [
  { assetId: 'person', role: 'person-identity' },
  { assetId: 'character', role: 'character-design' },
]

test('Try-On four selected references compile through Guard to ProviderRenderRequest', () => {
  const result = compileSemanticClosure(input('virtual-tryon', tryOnRoles))
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
  assert.deepEqual(pose.prohibitedTargetPaths, ['environment.background', 'person.identity', 'style', 'wardrobe.footwear', 'wardrobe.fullBody', 'wardrobe.lower', 'wardrobe.upper'])
  assert.deepEqual(pose.prohibitedTargetPathImportance, Object.fromEntries(pose.prohibitedTargetPaths!.map((path) => [path, 'hard'])))
  assert.equal(result.referencePlan.ordered.length, 5)
})

test('Cosplay supplemental signature prop and pose coexist', () => {
  const result = compileSemanticClosure(input('cosplay', [...cosplayRoles, { assetId: 'prop', role: 'signature-prop-detail' }, { assetId: 'pose', role: 'pose' }], [{ presetId: 'low-angle' }]))
  assert.deepEqual(result.referencePlan.ordered.map((item) => item.role).sort(), ['character-design', 'person-identity', 'pose', 'signature-prop-detail'])
})

test('all 30 compositions compile to model-facing semantics and concrete acceptance checks', () => {
  const inputsByPreset: Record<string, Record<string, string | boolean>> = {
    'dutch-angle': { direction: 'left' },
    'leading-room': { direction: 'right' },
    'negative-space': { direction: 'left' },
    'profile-silhouette': { silhouette: true },
  }
  assert.equal(VISUAL_COMPOSITION_PRESETS.length, 30)
  for (const preset of VISUAL_COMPOSITION_PRESETS) {
    const result = compileSemanticClosure(input('cosplay', cosplayRoles, [{ presetId: preset.id, ...(inputsByPreset[preset.id] ? { inputs: inputsByPreset[preset.id] } : {}) }]))
    const compositionConstraintIds = new Set(result.constraintIR.constraints.filter((constraint) => constraint.targetPaths.some((path) => path.startsWith('camera.') || path === 'lighting.subjectRendering')).map((constraint) => constraint.id))
    const compositionSections = result.promptIR.sections.filter((section) => section.constraintIds.some((id) => compositionConstraintIds.has(id)))
    assert.ok(compositionSections.length > 0, preset.id)
    assert.ok(compositionSections.every((section) => !section.content.includes('camera.') && !section.content.includes('value=')), preset.id)
    const criterion = result.evaluationPlan.criteria.find((item) => item.id === `composition-${preset.id}`)
    assert.ok(criterion, preset.id)
    assert.ok(criterion.expectation.length > 70, preset.id)
    assert.doesNotMatch(criterion.expectation, /^Match the selected /)
  }
})

test('Cosplay prompt replaces the original hairstyle with complete character hair fidelity', () => {
  const result = compileSemanticClosure(input('cosplay', cosplayRoles))
  const hairConstraint = result.constraintIR.constraints.find((constraint) => constraint.targetPath === 'character.hair')!
  const hairSection = result.promptIR.sections.find((section) => section.constraintIds.includes(hairConstraint.id))!
  assert.match(hairSection.content, /Replace only the hairstyle/)
  assert.match(hairSection.content, /color, cut, length, texture, ornaments, and silhouette/)
  assert.doesNotMatch(hairSection.content, /face/)
  assert.ok(result.evaluationPlan.criteria.some((criterion) => criterion.id === 'character-hair' && criterion.expectation.includes('Replace the original hairstyle completely')))
})

test('Cosplay uses one concise identity instruction while replacing hair', () => {
  const result = compileSemanticClosure(input('cosplay', cosplayRoles))
  const identityPaths = ['person.identity', 'style.rendering.medium']
  for (const path of identityPaths) {
    const constraint = result.constraintIR.constraints.find((item) => item.targetPath === path)
    assert.ok(constraint, path)
    assert.equal(constraint.importance, 'hard', path)
  }
  assert.equal(result.constraintIR.constraints.some((constraint) => constraint.targetPath?.startsWith('person.identity.') === true), false)
  const promptText = result.promptIR.sections.map((section) => section.content).join('\n')
  assert.match(promptText, /Preserve the identity and facial appearance of the person in the first reference image\. Render the same person naturally from the required camera angle\. Do not use or blend the face from any other reference\./)
  assert.equal(promptText.match(/Render the same person naturally from the required camera angle/g)?.length, 1)
  assert.doesNotMatch(promptText, /exactly identical/)
  assert.doesNotMatch(promptText, /forehead and temple|cheek width|feature spacing|enlarge the eyes|shrink the nose/)
  assert.doesNotMatch(promptText, /Reproduce only the character-design reference's surface-level makeup/)
  assert.match(promptText, /consistent real photograph matching the real-person reference/)
  assert.match(promptText, /Replace only the hairstyle/)

  const person = result.providerRenderRequest.referenceMappings.find((mapping) => mapping.role === 'person-identity')!
  for (const path of identityPaths) assert.ok(person.authorizedTargetPaths?.includes(path), path)
  assert.equal(person.authorizedTargetPaths?.some((path) => path.startsWith('person.identity.')), false)
  const character = result.providerRenderRequest.referenceMappings.find((mapping) => mapping.role === 'character-design')!
  assert.ok(character.prohibitedTargetPaths?.includes('person.identity'))
  assert.ok(character.prohibitedTargetPaths?.includes('style'))
  assert.equal(character.authorizedTargetPaths?.includes('character.makeup'), false)
  assert.equal(result.constraintIR.constraints.some((constraint) => constraint.targetPath === 'character.makeup'), false)
  assert.ok(result.promptIR.forbidden.some((item) => item.text === `Reference ${character.label} must not supply or change the person's face or identity.`))

  assert.ok(result.evaluationPlan.criteria.some((criterion) => criterion.id === 'identity-face-shape' && criterion.expectation.includes('Reject a narrower face')))
  assert.ok(result.evaluationPlan.criteria.some((criterion) => criterion.id === 'identity-facial-features' && criterion.expectation.includes('Reject enlarged eyes')))
  assert.ok(result.evaluationPlan.criteria.some((criterion) => criterion.id === 'identity-skin-appearance' && criterion.expectation.includes('existing makeup')))
  assert.ok(result.evaluationPlan.criteria.some((criterion) => criterion.id === 'identity-expression-age' && criterion.expectation.includes('apparent age')))
  assert.ok(result.evaluationPlan.criteria.some((criterion) => criterion.id === 'rendering-medium' && criterion.expectation.includes('visual medium')))
})

test('environment-dependent compositions provide logical defaults without user background references', () => {
  const expectedBackgroundFragments: Record<string, string> = {
    'long-shot': 'spacious lakeside promenade',
    'extreme-long-shot': 'expansive lakeside park',
    'birds-eye-view': 'paved lakeside plaza',
    'over-the-shoulder': 'lakeside overlook',
    'centered-symmetry': 'symmetrical lakeside pavilion walkway',
    'leading-lines': 'lakeside boardwalk',
    'diagonal-composition': 'outdoor stone steps',
    's-curve-composition': 'S-shaped path',
    'negative-space': 'broad open water and sky',
    'frame-within-frame': 'lakeside pavilion',
    'foreground-obstruction': 'lakeside garden',
    'profile-silhouette': 'lakeside horizon',
    'reflection-composition': 'calm foreground lake water',
    'mirror-composition': 'ornate gold-framed full-length mirror',
    'telephoto-compression': 'tree-lined lakeside promenade',
    'environmental-portrait': 'spacious lakeside promenade',
  }
  const expectedPlacementFragments: Record<string, string> = {
    'long-shot': 'one visible promenade ground plane',
    'extreme-long-shot': 'small scale anchor',
    'birds-eye-view': 'visible paved ground plane',
    'over-the-shoulder': 'one anonymous shoulder close to the camera',
    'centered-symmetry': 'walkway centerline',
    'leading-lines': 'visual convergence point',
    'diagonal-composition': 'one step or landing',
    's-curve-composition': 'beside or at the visual end',
    'negative-space': 'solid shore at the edge opposite',
    'frame-within-frame': 'fully inside one architectural opening',
    'foreground-obstruction': 'soft foliage close to the camera',
    'profile-silhouette': 'visible shore or ridge',
    'reflection-composition': 'camera across foreground water',
    'mirror-composition': 'softly out-of-focus partial back',
    'telephoto-compression': 'receding promenade ground plane',
    'environmental-portrait': 'one visible promenade ground plane',
  }
  for (const [presetId, fragment] of Object.entries(expectedBackgroundFragments)) {
    const inputs: Record<string, string | boolean> = presetId === 'negative-space' ? { direction: 'left' } : presetId === 'profile-silhouette' ? { silhouette: false } : {}
    const result = compileSemanticClosure(input('cosplay', cosplayRoles, [{ presetId, inputs }]))
    const background = result.constraintIR.constraints.find((constraint) => constraint.targetPath === 'environment.background')
    assert.ok(background, presetId)
    assert.equal(background.importance, 'preferred', presetId)
    assert.match(String(background.value), new RegExp(fragment, 'i'), presetId)
    const backgroundSection = result.promptIR.sections.find((section) => section.constraintIds.includes(background.id))!
    assert.match(backgroundSection.content, /When no approved background reference or explicit user background is available/, presetId)
    assert.match(backgroundSection.content, new RegExp(fragment, 'i'), presetId)
    const placement = result.constraintIR.constraints.find((constraint) => constraint.targetPath === 'camera.composition.subjectEnvironmentPlacement')
    assert.ok(placement, presetId)
    assert.equal(placement.importance, 'preferred', presetId)
    assert.match(String(placement.value), new RegExp(expectedPlacementFragments[presetId]!, 'i'), presetId)
    const placementSection = result.promptIR.sections.find((section) => section.constraintIds.includes(placement.id))!
    assert.match(placementSection.content, new RegExp(expectedPlacementFragments[presetId]!, 'i'), presetId)
  }
})

test('Water reflection has a fixed lakeside background and no surface input', () => {
  const preset = VISUAL_COMPOSITION_PRESETS.find((item) => item.id === 'reflection-composition')!
  assert.deepEqual(preset.requiredInputs ?? [], [])
  assert.equal(preset.changes.find((change) => change.targetPath === 'camera.composition.reflection.surface')?.requestedValue, 'water')
  assert.equal(preset.changes.find((change) => change.targetPath === 'camera.composition.reflection.subjectSurfaceRelationship')?.requestedValue, 'on_dry_shore_beside_water')
  const result = compileSemanticClosure(input('cosplay', cosplayRoles, [{ presetId: 'reflection-composition' }]))
  const promptText = result.promptIR.sections.map((section) => section.content).join('\n')
  assert.match(promptText, /Place the reflection on a visible water surface/)
  assert.match(promptText, /camera across foreground water toward the person standing on the dry far bank/i)
  assert.match(promptText, /shoreline directly below both feet/i)
  assert.match(promptText, /align the water reflection directly below the person on the same vertical image axis/i)
  assert.match(promptText, /a complete head-to-foot reflection is not required/i)
  assert.match(promptText, /person, costume, and props must remain separate from the water/i)
  assert.match(promptText, /calm foreground lake water/i)
  const criterion = result.evaluationPlan.criteria.find((item) => item.id === 'composition-reflection-composition')!.expectation
  assert.match(criterion, /both feet/)
  assert.match(criterion, /same vertical image axis/)
  assert.match(criterion, /may be partially cropped/)
  assert.match(criterion, /physically separate/)
})

test('mirror composition requires face visibility and same-instant physical consistency', () => {
  const result = compileSemanticClosure(input('cosplay', cosplayRoles, [{ presetId: 'mirror-composition' }]))
  const promptText = result.promptIR.sections.map((section) => section.content).join('\n')
  assert.match(promptText, /mirror must clearly show the person’s face/)
  assert.match(promptText, /ornate gold-framed full-length mirror/)
  assert.match(promptText, /deep navy curtains/)
  assert.match(promptText, /softly out-of-focus partial back, shoulder/)
  assert.match(promptText, /sharp front-facing reflection inside the ornate mirror the dominant subject/)
  assert.match(promptText, /same person, pose, costume, hair, accessories, and held props at the same instant/)
  assert.match(promptText, /physical reflection reversal/)
  assert.match(promptText, /Do not invent a second person or action/)
  const criterion = result.evaluationPlan.criteria.find((item) => item.id === 'composition-mirror-composition')!
  assert.match(criterion.expectation, /softly out-of-focus partial back and shoulder/)
  assert.match(criterion.expectation, /sharp front-facing reflection/)
  assert.match(criterion.expectation, /no duplicate person or alternative action/)
})

test('character reference never receives person.identity constraint links', () => {
  const result = compileSemanticClosure(input('cosplay', [...cosplayRoles, { assetId: 'prop', role: 'signature-prop-detail' }]))
  const character = result.binding.candidates.find((candidate) => candidate.role === 'character-design')!
  assert.ok(character)
  assert.ok(character.constraintIds!.every((id) => !result.constraintIR.constraints.find((constraint) => constraint.id === id)?.targetPaths.some((path) => path === 'person.identity' || path.startsWith('person.identity.'))))
})

test('reference isolation remains in PromptIR, Prompt Guard, and accepted request', () => {
  const result = compileSemanticClosure(input('cosplay', [...cosplayRoles, { assetId: 'pose', role: 'pose' }]))
  const poseMapping = result.providerRenderRequest.referenceMappings.find((mapping) => mapping.role === 'pose')!
  assert.ok(result.promptIR.forbidden.some((item) => item.text.includes('environment.background') && item.importance === 'hard'))
  const poseProhibitions = result.promptIR.forbidden.filter((item) => item.text.startsWith(`Reference ${poseMapping.label} `))
  assert.equal(poseProhibitions.length, poseMapping.prohibitedTargetPaths!.length)
  assert.ok(poseProhibitions.every((item) => item.importance === 'hard'))
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

test('M4 merged constraints from distinct presets bind both unique supporting intents', () => {
  const result = compileSemanticClosure(input('cosplay', cosplayRoles, [{ presetId: 'long-shot' }, { presetId: 'environmental-portrait' }]))
  const merged = result.constraintIR.constraints.filter((constraint) => constraint.targetPath === 'camera.composition.environmentRelationship')
  assert.equal(merged.length, 1)
  const supportingIntentIds = result.seed.changeIntents.filter((intent) => intent.targetPath === 'camera.composition.environmentRelationship').map((intent) => intent.id)
  assert.equal(supportingIntentIds.length, 2)
  assert.equal(new Set(supportingIntentIds).size, 2)
  assert.ok(supportingIntentIds.every((id) => merged[0].sourceIds.includes(id)))
  const seed = result.seed.referenceCandidateSeeds[0]
  const syntheticSeed = { ...seed, id: 'composition-reference-seed', role: 'composition-reference', authorizedTargetPaths: ['camera.composition.environmentRelationship'], ontologyScopes: ['camera.composition.environmentRelationship'], supportingIntentIds }
  const binding = bindReferenceCandidates({ seeds: [syntheticSeed], dependencySeeds: [], constraintIR: result.constraintIR })
  assert.deepEqual(binding.candidates[0].constraintIds, [merged[0].id])
})

test('duplicate composition preset selections fail before compilation', () => {
  assert.throws(() => compileScenarioInput(input('cosplay', cosplayRoles, [{ presetId: 'medium-shot' }, { presetId: 'medium-shot' }])), /PLAYGROUND_COMPOSITION_SELECTION_DUPLICATE:medium-shot/)
})

test('preferred seed omits when no active or satisfied constraint survives, required seed blocks', () => {
  const compiled = compileSemanticClosure(input('virtual-tryon', [...tryOnRoles, { assetId: 'pose', role: 'pose' }]))
  const poseInput = compileScenarioInput(input('virtual-tryon', [...tryOnRoles, { assetId: 'pose', role: 'pose' }]))
  const pose = compiled.constraintIR.constraints.find((constraint) => constraint.targetPath === 'pose')!
  const degraded = { ...compiled.constraintIR, constraints: compiled.constraintIR.constraints.map((constraint) => constraint.id === pose.id ? { ...constraint, status: 'unsatisfied' as const } : constraint) }
  const omitted = bindReferenceCandidates({ seeds: poseInput.referenceCandidateSeeds, dependencySeeds: [], constraintIR: degraded })
  assert.ok(omitted.omittedSeeds.some((item) => item.reasonCode === 'PREFERRED_REFERENCE_NO_SURVIVING_CONSTRAINT'))
  const requiredSeed = poseInput.referenceCandidateSeeds.find((seed) => seed.role === 'person-identity')!
  const requiredConstraintIds = new Set(compiled.binding.candidates.find((candidate) => candidate.role === 'person-identity')!.constraintIds)
  const requiredIR: ConstraintIR = { ...degraded, constraints: degraded.constraints.map((constraint) => requiredConstraintIds.has(constraint.id) ? { ...constraint, status: 'unsatisfied' as const, importance: 'required' as const } : constraint) }
  assert.throws(() => bindReferenceCandidates({ seeds: [requiredSeed], dependencySeeds: [], constraintIR: requiredIR }), /PLAYGROUND_REQUIRED_REFERENCE_NO_SURVIVING_CONSTRAINT/)
})

test('reference budget keeps required references and blocks when the profile cannot fit them', () => {
  const result = compileSemanticClosure(input('virtual-tryon', tryOnRoles))
  const limited = planReferences({ schemaVersion: 'voce.reference-planning-input/v1alpha1', caseId: result.constraintIR.caseId, caseRevision: result.constraintIR.caseRevision, contextHash: result.constraintIR.contextHash, constraintIR: result.constraintIR, candidates: [...result.binding.candidates], dependencies: [], profile: MOCK_LIMITED_REFERENCE_PROFILE })
  assert.equal(limited.status, 'blocked')
  assert.ok(limited.blockedReferences.length >= 1)
})

test('Cosplay budget of three keeps identity, character, and prop while omitting pose', () => {
  const limited = { ...MOCK_IMAGE_PROFILE, maximumReferenceCount: 3, referenceLimits: { ...(MOCK_IMAGE_PROFILE.referenceLimits ?? {}), maximumReferenceCount: 3 } }
  limited.profileHash = computeProviderCapabilityProfileHash(limited)
  const result = compileSemanticClosure(input('cosplay', [...cosplayRoles, { assetId: 'prop', role: 'signature-prop-detail' }, { assetId: 'pose', role: 'pose' }]), limited)
  assert.deepEqual(result.referencePlan.ordered.map((item) => item.role).sort(), ['character-design', 'person-identity', 'signature-prop-detail'])
  const poseSeed = result.seed.referenceCandidateSeeds.find((seed) => seed.role === 'pose')!
  assert.ok(result.referencePlan.omitted.some((item) => item.candidateId === poseSeed.id && item.reasonCode === 'REFERENCE_COUNT_EXCEEDED'))
})

test('same bytes cannot be planned as mutually isolated person and character references', () => {
  const sharedContentHash = sha256({ asset: 'shared-person-character' })
  const scenarioInput = input('cosplay', cosplayRoles)
  scenarioInput.assets = scenarioInput.assets.map((item) => ({ ...item, contentHash: sharedContentHash }))
  assert.throws(() => compileSemanticClosure(scenarioInput), /PLAYGROUND_REFERENCE_PLAN_BLOCKED:REFERENCE_ISOLATION_CONFLICT/)
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
  const poseScope = distribution.effectiveScenario.interpretationScopes.find((scope) => scope.assetRole === 'pose')!
  assert.equal(posePolicy.minCount, poseScope.minCount)
  assert.equal(posePolicy.maxCount, poseScope.maxCount)
  assert.ok(posePolicy.id.endsWith(`:${poseScope.contributionId}`))
  assert.ok(posePolicy.targets.some((target) => target.targetPath === 'pose' && target.operation === 'adjust'))
  assert.ok(posePolicy.displayOnlyNonContributions.some((text) => text.includes('person identity')))
  const source = await readFile(new URL('../src/semantic-closure.ts', import.meta.url), 'utf8')
  assert.doesNotMatch(source, /packages[\\/]core[\\/]src/)
})
