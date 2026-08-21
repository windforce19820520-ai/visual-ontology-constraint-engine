import { test } from 'node:test'
import assert from 'node:assert/strict'
import { compileScenarioInput, compileSemanticClosure } from './semantic-closure.js'
import type { PlaygroundDeclaredRole, PlaygroundScenarioInput } from './semantic-closure.js'
import { sha256 } from '@voce-engine/core'
import { createProviderRequestMaterializer } from './provider-materializer.js'
import { SEEDREAM_5_PRO_PROFILE } from './providers.js'

function input(scenarioId: PlaygroundScenarioInput['scenarioId'], declaredRoles: readonly PlaygroundDeclaredRole[], compositionSelections: PlaygroundScenarioInput['compositionSelections'] = []): PlaygroundScenarioInput {
  return {
    scenarioId,
    declaredRoles,
    compositionSelections,
    assets: declaredRoles.map((declaration) => ({
      id: declaration.assetId,
      storeId: 'playground-offline',
      contentHash: sha256({ asset: declaration.assetId }),
      mediaType: 'image/png',
      byteLength: 100,
      role: 'reference-image',
      resolverId: 'playground-offline',
      availability: 'available',
      retentionClass: 'request',
      redactionPolicy: 'safe-hash-only',
      ...(declaration.role === 'pose' ? { poseSourceKind: 'pose-sketch' as const } : {}),
    })),
  }
}

const person: PlaygroundDeclaredRole = { assetId: 'person', role: 'person-identity' }
const top: PlaygroundDeclaredRole = { assetId: 'top', role: 'garment-top', typedMetadata: { category: 'shirt' } }
const bottom: PlaygroundDeclaredRole = { assetId: 'bottom', role: 'garment-bottom', typedMetadata: { category: 'jeans' } }
const fullBody: PlaygroundDeclaredRole = { assetId: 'full-body', role: 'garment-full-body', typedMetadata: { category: 'dress', structure: 'one_piece' } }
const completeOutfit: PlaygroundDeclaredRole = { assetId: 'outfit', role: 'garment-full-body', typedMetadata: { category: 'complete_outfit', structure: 'complete_outfit' } }

test('Try-On accepts five clothing combinations without a separate mode', () => {
  for (const garments of [[fullBody], [completeOutfit], [top], [bottom], [top, bottom]]) {
    const result = compileSemanticClosure(input('virtual-tryon', [person, ...garments]))
    assert.equal(result.guardResult.status, 'accepted')
    assert.deepEqual(result.providerRenderRequest.referenceMappings.map((mapping) => mapping.role), [person, ...garments].map((role) => role.role))
  }
})

test('Try-On garment slots compile without asking users to classify the uploaded clothing', () => {
  const topOnly = compileScenarioInput(input('virtual-tryon', [person, { assetId: 'top-unclassified', role: 'garment-top' }]))
  assert.equal(topOnly.referenceCandidateSeeds.find((item) => item.role === 'garment-top')?.typedMetadata?.category, undefined)
  const fullOutfit = compileScenarioInput(input('virtual-tryon', [person, { assetId: 'full-body-unclassified', role: 'garment-full-body' }]))
  assert.equal(fullOutfit.referenceCandidateSeeds.find((item) => item.role === 'garment-full-body')?.typedMetadata?.structure, undefined)
  const compiled = compileSemanticClosure(input('virtual-tryon', [person, { assetId: 'full-body-unclassified', role: 'garment-full-body' }]))
  assert.match(compiled.humanPlan.summary, /full outfit from its single reference/)
})

test('Try-On rejects missing garments, full-body mixes, legacy detail, and composition selections', () => {
  assert.throws(() => compileScenarioInput(input('virtual-tryon', [person])), /PLAYGROUND_REQUIRED_ROLE_GROUP_MISSING:garment-required/)
  assert.throws(() => compileScenarioInput(input('virtual-tryon', [person, fullBody, top])), /PLAYGROUND_ROLE_GROUP_MUTUALLY_EXCLUSIVE/)
  assert.throws(() => compileScenarioInput(input('virtual-tryon', [person, { assetId: 'legacy', role: 'garment-detail' }])), /PLAYGROUND_ROLE_UNKNOWN:garment-detail/)
  assert.throws(() => compileScenarioInput(input('virtual-tryon', [person, top], [{ presetId: 'full-shot' }])), /PLAYGROUND_TRYON_COMPOSITION_NOT_SUPPORTED/)
  assert.throws(() => compileScenarioInput(input('virtual-tryon', [{ ...person, order: 99 }, top])), /PLAYGROUND_REFERENCE_ORDER_NOT_DECLARED/)
})

test('Try-On typed replacement and preserve scopes remain conditional and ordered', () => {
  const result = compileSemanticClosure(input('virtual-tryon', [person, top, bottom]))
  const intents = result.seed.changeIntents
  assert.equal(intents.filter((intent) => intent.targetPath === 'wardrobe.replacement.scope').every((intent) => intent.requestedValue === 'upper_and_lower'), true)
  assert.equal(intents.some((intent) => intent.targetPath === 'wardrobe.upper' && intent.operation === 'preserve'), false)
  assert.equal(intents.some((intent) => intent.targetPath === 'wardrobe.lower' && intent.operation === 'preserve'), false)
  assert.deepEqual(result.providerRenderRequest.referenceMappings.map((mapping) => mapping.order), [0, 1, 2])
  assert.match(result.humanPlan.summary, /Replace the top and the bottom/)
  assert.ok(result.evaluationPlan.criteria.some((criterion) => criterion.id === 'footwear' && criterion.expectation.includes('Preserve')))
})

test('Try-On preserves source pose and camera by default, then isolates an explicit pose reference', () => {
  const sourceOnly = compileSemanticClosure(input('virtual-tryon', [person, top]))
  const sourcePerson = sourceOnly.providerRenderRequest.referenceMappings.find((mapping) => mapping.role === 'person-identity')!
  assert.ok((sourcePerson.authorizedTargetPaths ?? []).includes('pose'))
  assert.ok((sourcePerson.authorizedTargetPaths ?? []).some((path) => path.startsWith('camera.')))
  assert.equal(sourceOnly.evaluationPlan.criteria.find((criterion) => criterion.id === 'pose')?.expectation, 'Preserve the original pose on a best-effort basis.')

  const explicitPose = compileSemanticClosure(input('virtual-tryon', [person, top, { assetId: 'pose', role: 'pose' }]))
  const personWithPose = explicitPose.providerRenderRequest.referenceMappings.find((mapping) => mapping.role === 'person-identity')!
  const poseMapping = explicitPose.providerRenderRequest.referenceMappings.find((mapping) => mapping.role === 'pose')!
  assert.equal((personWithPose.authorizedTargetPaths ?? []).includes('pose'), false)
  assert.ok(personWithPose.prohibitedTargetPaths?.includes('pose'))
  assert.deepEqual(poseMapping.authorizedTargetPaths, ['pose'])
  assert.ok((personWithPose.authorizedTargetPaths ?? []).some((path) => path.startsWith('camera.')))
  assert.equal(explicitPose.evaluationPlan.criteria.find((criterion) => criterion.id === 'pose')?.expectation, 'Use only the declared pose reference.')
})

const accessoryCases = [
  ['bracelet', 'wrist', 'both'],
  ['ring', 'hand_finger_region', 'left'],
  ['brooch', 'chest', 'center'],
  ['necklace', 'neck', 'center'],
  ['earring', 'ear', 'right'],
  ['hair_accessory', 'hair_head', 'left'],
] as const

test('Try-On accessory allow-list is typed, repeatable, isolated, and carried through materialization', () => {
  for (const [accessoryType, placement, side] of accessoryCases) {
    const role: PlaygroundDeclaredRole = { assetId: `accessory-${accessoryType}`, role: 'accessory-detail', typedMetadata: { accessoryType, placement, side } }
    const result = compileSemanticClosure(input('virtual-tryon', [person, top, role]))
    const mapping = result.providerRenderRequest.referenceMappings.find((item) => item.role === 'accessory-detail')!
    assert.equal(result.guardResult.status, 'accepted')
    assert.equal(mapping.typedMetadata?.accessoryType, accessoryType)
    assert.equal(mapping.typedMetadata?.placement, placement)
    assert.equal(mapping.typedMetadata?.side, side)
    assert.equal(mapping.typedMetadata?.appearance, 'reference_image')
    assert.match(String(mapping.typedMetadata?.itemId), /^accessory-item-/)
    assert.deepEqual(mapping.authorizedTargetPaths, ['wardrobe.accessories.items'])
    assert.ok(mapping.prohibitedTargetPaths?.includes('wardrobe.upper'))
    const personMapping = result.providerRenderRequest.referenceMappings.find((item) => item.role === 'person-identity')!
    assert.equal(personMapping.authorizedTargetPaths?.includes('wardrobe.accessories.items'), false)
    assert.ok(personMapping.prohibitedTargetPaths?.includes('wardrobe.accessories.items'))
  }
  assert.throws(() => compileScenarioInput(input('virtual-tryon', [person, top, { assetId: 'invalid', role: 'accessory-detail', typedMetadata: { accessoryType: 'bracelet', placement: 'neck', side: 'left' } }])), /PLAYGROUND_ACCESSORY_PAIR_INVALID/)
  assert.throws(() => compileScenarioInput(input('virtual-tryon', [person, top, { assetId: 'invalid-side', role: 'accessory-detail', typedMetadata: { accessoryType: 'necklace', placement: 'neck', side: 'left' } }])), /PLAYGROUND_ACCESSORY_SIDE_INVALID/)
  assert.throws(() => compileScenarioInput(input('cosplay', [person, { assetId: 'character', role: 'character-design' }, { assetId: 'cosplay-accessory', role: 'accessory-detail', typedMetadata: { accessoryType: 'bracelet', placement: 'wrist', side: 'left' } }])), /PLAYGROUND_ROLE_UNKNOWN:accessory-detail/)
})

test('Try-On preserves original accessories only when no replacement accessory is supplied', () => {
  const withoutAccessory = compileSemanticClosure(input('virtual-tryon', [person, top]))
  const personMapping = withoutAccessory.providerRenderRequest.referenceMappings.find((mapping) => mapping.role === 'person-identity')!
  assert.ok(personMapping.authorizedTargetPaths?.includes('wardrobe.accessories.items'))
  assert.match(withoutAccessory.humanPlan.summary, /Keep the original accessories/)
  assert.equal(withoutAccessory.evaluationPlan.criteria.find((criterion) => criterion.id === 'accessories')?.expectation, 'Preserve the original accessories.')
})

test('Try-On explicitly removes original bags and jewelry only when replacement accessories are declared', () => {
  const bracelet: PlaygroundDeclaredRole = { assetId: 'accessory-bracelet', role: 'accessory-detail', typedMetadata: { accessoryType: 'bracelet', placement: 'wrist', side: 'right' } }
  const withAccessory = compileSemanticClosure(input('virtual-tryon', [person, top, bracelet]), SEEDREAM_5_PRO_PROFILE)
  const withPrompt = createProviderRequestMaterializer('seedream.materializer', '1.1.0', SEEDREAM_5_PRO_PROFILE).materialize(withAccessory.providerRenderRequest).request.prompt
  assert.match(withPrompt, /Remove all original accessories from the person reference, including the original handbag, shoulder bag, and jewelry\. Add only the declared accessory references\./)

  const withoutAccessory = compileSemanticClosure(input('virtual-tryon', [person, top]), SEEDREAM_5_PRO_PROFILE)
  const withoutPrompt = createProviderRequestMaterializer('seedream.materializer', '1.1.0', SEEDREAM_5_PRO_PROFILE).materialize(withoutAccessory.providerRenderRequest).request.prompt
  assert.doesNotMatch(withoutPrompt, /Remove all original accessories/)
})

test('Cosplay retains composition presets while Try-On does not', () => {
  const result = compileSemanticClosure(input('cosplay', [person, { assetId: 'character', role: 'character-design' }], [{ presetId: 'full-shot' }]))
  assert.equal(result.guardResult.status, 'accepted')
  assert.ok(result.seed.changeIntents.some((intent) => intent.targetPath === 'camera.framing.shotScale'))
})

test('Cosplay critical detail remains a separate optional reference', () => {
  const result = compileSemanticClosure(input('cosplay', [person, { assetId: 'character', role: 'character-design' }, { assetId: 'detail', role: 'critical-detail' }]))
  assert.equal(result.guardResult.status, 'accepted')
  const detail = result.providerRenderRequest.referenceMappings.find((mapping) => mapping.role === 'critical-detail')!
  assert.deepEqual(detail.authorizedTargetPaths, ['character.criticalDetails'])
})
