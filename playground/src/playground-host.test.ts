import { test } from 'node:test'
import assert from 'node:assert/strict'
import type { ProviderRenderRequest } from '@voce-engine/contracts'
import { sha256 } from '@voce-engine/core'
import { compilePlayground, playgroundCompositionPresets, playgroundMeta } from './server.js'
import { createProviderRequestMaterializer } from './provider-materializer.js'
import { MockProvider, createPlaygroundPlanBinding, assertPlaygroundPlanBinding } from './mock-provider.js'
import { GROK_IMAGINE_PROFILE, MOCK_PLAYGROUND_PROFILE, InMemoryBudgetGate, preflightProviderCapability } from './providers.js'
import type { PlaygroundAssetDeclaration, PlaygroundScenarioInput } from './semantic-closure.js'

function asset(id: string): PlaygroundAssetDeclaration {
  return { id, storeId: 'test', contentHash: sha256({ id }), mediaType: 'image/png', byteLength: 1000, role: 'reference-image', resolverId: 'test', availability: 'available', retentionClass: 'request', redactionPolicy: 'safe-hash-only', ...(id === 'pose' ? { poseSourceKind: 'pose-sketch' as const } : {}) }
}

const tryOnRoles = [
  { assetId: 'person', role: 'person-identity' },
  { assetId: 'garment', role: 'garment-detail' },
  { assetId: 'wearing', role: 'wearing-effect' },
  { assetId: 'footwear', role: 'footwear-detail' },
]

function input(): PlaygroundScenarioInput {
  return { scenarioId: 'virtual-tryon', assets: tryOnRoles.map((item) => asset(item.assetId)), declaredRoles: tryOnRoles, compositionSelections: [{ presetId: 'full-shot' }] }
}

test('meta and composition APIs are UI-safe projections', () => {
  const meta = playgroundMeta()
  const serialized = JSON.stringify(meta)
  assert.equal(serialized.includes('targetPath'), false)
  assert.equal(serialized.includes('prompt'), false)
  const presets = playgroundCompositionPresets()
  assert.ok(JSON.stringify(presets).includes('full-shot'))
})

test('compile response exposes Human Plan and accepted ProviderRenderRequest with no evidence', () => {
  const response = compilePlayground({ ...input(), rightsConfirmed: true, providerProfileId: 'mock-image' })
  assert.equal(response.renderEnabled, false)
  assert.equal(response.humanPlan.observedFacts.length, 0)
  assert.equal(response.humanPlan.confirmedSourceBindings.length, 0)
  assert.equal(response.providerRenderRequest.referenceMappings.length, 4)
  assert.equal(response.planBinding.credentialMode, 'none')
})

test('materialization is deterministic and every trace source is accepted', () => {
  const response = compilePlayground({ ...input(), rightsConfirmed: true, providerProfileId: 'mock-image' })
  const materializer = createProviderRequestMaterializer('mock.materializer', '1.0.0', MOCK_PLAYGROUND_PROFILE)
  const first = materializer.materialize(response.providerRenderRequest)
  const second = materializer.materialize(response.providerRenderRequest)
  assert.deepEqual(first, second)
  assert.ok(first.receipt.traces.length >= response.providerRenderRequest.sections.length)
  assert.ok(first.receipt.traces.every((trace) => trace.sourceKind.startsWith('accepted_')))
  assert.equal(first.request.references.length, 4)
})

test('Grok profile blocks four-reference Try-On before transport', () => {
  const response = compilePlayground({ ...input(), rightsConfirmed: true, providerProfileId: 'mock-image' })
  const preflight = preflightProviderCapability({ request: response.providerRenderRequest, profile: GROK_IMAGINE_PROFILE, assets: tryOnRoles.map((item) => ({ ...asset(item.assetId), role: item.role })), renderEnabled: true, confirmSingleCall: true })
  assert.equal(preflight.status, 'blocked')
  assert.ok(preflight.reasons.includes('PROFILE_BINDING_MISMATCH'))
  assert.ok(preflight.reasons.includes('REFERENCE_COUNT_EXCEEDED'))
})

test('Mock Provider render-disabled gate produces zero calls', async () => {
  const response = compilePlayground({ ...input(), rightsConfirmed: true, providerProfileId: 'mock-image' })
  const materializer = createProviderRequestMaterializer('mock.materializer', '1.0.0', MOCK_PLAYGROUND_PROFILE)
  const mock = new MockProvider()
  const result = await mock.generate({ request: response.providerRenderRequest, profile: MOCK_PLAYGROUND_PROFILE, materializer, assets: tryOnRoles.map((item) => ({ ...asset(item.assetId), role: item.role })), clientId: 'test', renderEnabled: false, confirmSingleCall: true })
  assert.equal(result.status, 'failed')
  assert.equal(result.providerResult.failureCode, 'RENDER_DISABLED')
  assert.equal(result.calls, 0)
  assert.equal(mock.calls, 0)
  assert.equal(JSON.stringify(result.logs).includes('prompt'), false)
})

test('Mock Provider requires explicit confirmation and succeeds exactly once when enabled', async () => {
  const response = compilePlayground({ ...input(), rightsConfirmed: true, providerProfileId: 'mock-image' })
  const materializer = createProviderRequestMaterializer('mock.materializer', '1.0.0', MOCK_PLAYGROUND_PROFILE)
  const mock = new MockProvider()
  const budget = new InMemoryBudgetGate({ dailyCost: 0, perClientCost: 0, maxConcurrent: 1, currency: 'USD' })
  const blocked = await mock.generate({ request: response.providerRenderRequest, profile: MOCK_PLAYGROUND_PROFILE, materializer, assets: tryOnRoles.map((item) => ({ ...asset(item.assetId), role: item.role })), clientId: 'test', renderEnabled: true, confirmSingleCall: false, budgetGate: budget })
  assert.equal(blocked.providerResult.failureCode, 'SINGLE_CALL_CONFIRMATION_REQUIRED')
  const enabled = await mock.generate({ request: response.providerRenderRequest, profile: MOCK_PLAYGROUND_PROFILE, materializer, assets: tryOnRoles.map((item) => ({ ...asset(item.assetId), role: item.role })), clientId: 'test', renderEnabled: true, confirmSingleCall: true })
  assert.equal(enabled.status, 'ok')
  assert.equal(enabled.calls, 1)
  assert.equal(enabled.providerResult.outputArtifacts.length, 1)
})

test('plan binding detects changed role, profile, or materializer before call', () => {
  const response = compilePlayground({ ...input(), rightsConfirmed: true, providerProfileId: 'mock-image' })
  const materializer = createProviderRequestMaterializer('mock.materializer', '1.0.0', MOCK_PLAYGROUND_PROFILE)
  const assets = tryOnRoles.map((item) => ({ ...asset(item.assetId), role: item.role }))
  const binding = createPlaygroundPlanBinding({ request: response.providerRenderRequest, assets, scenarioDistributionHash: response.planBinding.scenarioDistributionHash, profile: MOCK_PLAYGROUND_PROFILE, materializer, credentialMode: 'none' })
  assert.doesNotThrow(() => assertPlaygroundPlanBinding(binding, response.planBinding))
  assert.throws(() => assertPlaygroundPlanBinding({ ...binding, assetSetHash: sha256({ changed: true }) }, response.planBinding), /PLAN_BINDING_MISMATCH/)
})

test('real profile does not get a transport in this phase', () => {
  assert.equal(MOCK_PLAYGROUND_PROFILE.provider, 'mock')
  assert.equal(GROK_IMAGINE_PROFILE.credentialMode, 'user_ephemeral')
})

// Keep this import-time type assertion close to the test that protects the
// public contract without reaching into packages/core/src.
const _providerRequestTypeCheck: ProviderRenderRequest | undefined = undefined
void _providerRequestTypeCheck
