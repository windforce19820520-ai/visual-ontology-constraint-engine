import { test } from 'node:test'
import assert from 'node:assert/strict'
import type { AddressInfo } from 'node:net'
import type { ArtifactHandle, ProviderRenderRequest } from '@voce-engine/contracts'
import { sha256 } from '@voce-engine/core'
import { compilePlayground, createPlaygroundServer, playgroundCompositionPresets, playgroundMeta } from './server.js'
import { createProviderRequestMaterializer } from './provider-materializer.js'
import { MockProvider, createPlaygroundPlanBinding, assertPlaygroundPlanBinding } from './mock-provider.js'
import { GROK_IMAGINE_PROFILE, MOCK_PLAYGROUND_PROFILE, PLAYGROUND_PROVIDER_PROFILES, SEEDREAM_4_PROFILE, InMemoryBudgetGate, preflightProviderCapability } from './providers.js'
import { buildProviderCall, type PlaygroundProviderCall, type PlaygroundProviderTransport } from './provider-bridges.js'
import { compileSemanticClosure, type PlaygroundAssetDeclaration, type PlaygroundScenarioInput } from './semantic-closure.js'
import { PLAYGROUND_HTML } from './web.js'

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
  assert.equal(serialized.includes('playground-inspection'), false)
  const presets = playgroundCompositionPresets() as any
  assert.ok(JSON.stringify(presets).includes('full-shot'))
  const parameterized = presets.presets.filter((preset: any) => preset.requiredInputs.length > 0)
  assert.equal(parameterized.length, 4)
  assert.ok(parameterized.every((preset: any) => preset.inputs.length === preset.requiredInputs.length && preset.inputs.every((item: any) => item.options.length > 0)))
})

test('all parameterized composition presets expose a valid browser choice and compile', () => {
  const presets = playgroundCompositionPresets() as any
  for (const presetId of ['dutch-angle', 'leading-room', 'negative-space', 'reflection-composition']) {
    const preset = presets.presets.find((item: any) => item.id === presetId)
    assert.ok(preset)
    const inputs = Object.fromEntries(preset.inputs.map((item: any) => [item.id, item.options[0]]))
    assert.doesNotThrow(() => compilePlayground({ ...input(), compositionSelections: [{ presetId, inputs }], rightsConfirmed: true, providerProfileId: 'mock-image' }))
  }
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
  const response = compileSemanticClosure(input(), MOCK_PLAYGROUND_PROFILE)
  const materializer = createProviderRequestMaterializer('mock.materializer', '1.0.0', MOCK_PLAYGROUND_PROFILE)
  const first = materializer.materialize(response.providerRenderRequest)
  const second = materializer.materialize(response.providerRenderRequest)
  assert.deepEqual(first, second)
  assert.ok(first.receipt.traces.length >= response.providerRenderRequest.sections.length)
  assert.ok(first.receipt.traces.every((trace) => trace.sourceKind.startsWith('accepted_')))
  assert.equal(first.request.references.length, 4)
  assert.ok(first.request.forbidden.every((item) => first.request.prompt.includes(item.text)))
})

test('Grok profile blocks four-reference Try-On before transport', () => {
  const response = compilePlayground({ ...input(), rightsConfirmed: true, providerProfileId: 'mock-image' })
  const preflight = preflightProviderCapability({ request: response.providerRenderRequest, profile: GROK_IMAGINE_PROFILE, assets: tryOnRoles.map((item) => ({ ...asset(item.assetId), role: item.role })), renderEnabled: true, confirmSingleCall: true })
  assert.equal(preflight.status, 'blocked')
  assert.ok(preflight.reasons.includes('PROFILE_BINDING_MISMATCH'))
  assert.ok(preflight.reasons.includes('REFERENCE_COUNT_EXCEEDED'))
})

test('Mock Provider render-disabled gate produces zero calls', async () => {
  const response = compileSemanticClosure(input(), MOCK_PLAYGROUND_PROFILE)
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
  const response = compileSemanticClosure(input(), MOCK_PLAYGROUND_PROFILE)
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
  const binding = createPlaygroundPlanBinding({ request: response.providerRenderRequest, generationRequestHash: response.planBinding.generationRequestHash, assets, scenarioDistributionHash: response.planBinding.scenarioDistributionHash, profile: MOCK_PLAYGROUND_PROFILE, materializer, credentialMode: 'none' })
  assert.doesNotThrow(() => assertPlaygroundPlanBinding(binding, response.planBinding))
  assert.throws(() => assertPlaygroundPlanBinding({ ...binding, assetSetHash: sha256({ changed: true }) }, response.planBinding), /PLAN_BINDING_MISMATCH/)
})

test('real profiles require ephemeral credentials and have no default transport', () => {
  assert.equal(MOCK_PLAYGROUND_PROFILE.provider, 'mock')
  assert.equal(GROK_IMAGINE_PROFILE.credentialMode, 'user_ephemeral')
  const meta = playgroundMeta() as any
  assert.equal(meta.providers.find((item: any) => item.id === 'grok-imagine-image-quality').transportEnabled, false)
})

function minimalPng(width = 64, height = 96): Uint8Array {
  const bytes = new Uint8Array(24)
  bytes.set([137, 80, 78, 71, 13, 10, 26, 10, 0, 0, 0, 13, 73, 72, 68, 82])
  new DataView(bytes.buffer).setUint32(16, width)
  new DataView(bytes.buffer).setUint32(20, height)
  return bytes
}

async function withServer<T>(options: Parameters<typeof createPlaygroundServer>[0], action: (baseUrl: string) => Promise<T>): Promise<T> {
  const server = createPlaygroundServer(options)
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
  const port = (server.address() as AddressInfo).port
  try { return await action(`http://127.0.0.1:${port}`) } finally { await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve())) }
}

async function post(baseUrl: string, path: string, session: string, body: unknown): Promise<{ status: number; value: any }> {
  const response = await fetch(`${baseUrl}${path}`, { method: 'POST', headers: { 'content-type': 'application/json', 'x-playground-session': session, 'x-playground-client': 'test-client' }, body: JSON.stringify(body) })
  return { status: response.status, value: await response.json() }
}

async function uploadTryOn(baseUrl: string, session: string): Promise<PlaygroundScenarioInput> {
  const assets: PlaygroundAssetDeclaration[] = []
  for (const [index, declaration] of tryOnRoles.entries()) {
    const uploaded = await post(baseUrl, '/api/upload', session, { mediaType: 'image/png', role: declaration.role, bytesBase64: Buffer.from(minimalPng(64 + index, 96)).toString('base64') })
    assert.equal(uploaded.status, 200)
    assets.push(uploaded.value.artifact)
  }
  return { scenarioId: 'virtual-tryon', assets, declaredRoles: assets.map((item, index) => ({ assetId: item.id, role: tryOnRoles[index].role })), compositionSelections: [{ presetId: 'full-shot' }] }
}

test('browser bootstrap fetches both metadata endpoints and has mobile/accessibility controls', () => {
  assert.match(PLAYGROUND_HTML, /fetch\('\/api\/meta'\)/)
  assert.match(PLAYGROUND_HTML, /fetch\('\/api\/composition-presets'\)/)
  assert.match(PLAYGROUND_HTML, /@media\(max-width:480px\)/)
  assert.match(PLAYGROUND_HTML, /aria-live="polite"/)
  assert.match(PLAYGROUND_HTML, /id="byok" type="password"/)
  assert.match(PLAYGROUND_HTML, /id="composition-inputs"/)
  assert.match(PLAYGROUND_HTML, /preset\.inputs/)
  assert.match(PLAYGROUND_HTML, /compositionInputs/)
})

test('actual HTTP meta, preset and page endpoints agree on 30 presets', async () => {
  await withServer({}, async (baseUrl) => {
    const [metaResponse, presetResponse, pageResponse] = await Promise.all([fetch(`${baseUrl}/api/meta`), fetch(`${baseUrl}/api/composition-presets`), fetch(`${baseUrl}/playground`)])
    const meta = await metaResponse.json() as any
    const presets = await presetResponse.json() as any
    assert.equal(meta.renderEnabled, false)
    assert.equal(presets.presets.length, 30)
    assert.match(await pageResponse.text(), /VOCE Playground/)
  })
})

test('HTTP Mock Generate recompiles the inspection plan against the selected profile', async () => {
  await withServer({ renderEnabled: true }, async (baseUrl) => {
    const session = 'mock-generation-session'
    const compileInput = { ...(await uploadTryOn(baseUrl, session)), rightsConfirmed: true, providerProfileId: 'mock-image' as const }
    const compiled = await post(baseUrl, '/api/compile', session, compileInput)
    assert.equal(compiled.status, 200)
    assert.notEqual(compiled.value.planBinding.requestHash, compiled.value.planBinding.generationRequestHash)
    const generated = await post(baseUrl, '/api/generate', session, { compile: compileInput, planBinding: compiled.value.planBinding, confirmSingleCall: true })
    assert.equal(generated.status, 200)
    assert.equal(generated.value.result.calls, 1)
  })
})

test('Seedream and Grok selection both compile; Grok only blocks Generate capability', () => {
  const seedream = compilePlayground({ ...input(), rightsConfirmed: true, providerProfileId: 'seedream-4.0' })
  const grok = compilePlayground({ ...input(), rightsConfirmed: true, providerProfileId: 'grok-imagine-image-quality' })
  assert.equal(seedream.providerCapability.status, 'ok')
  assert.equal(grok.providerCapability.status, 'blocked')
  assert.ok(grok.providerCapability.reasons.includes('REFERENCE_COUNT_EXCEEDED'))
  assert.equal(grok.humanPlan.selectedReferences.length, 4)
})

test('provider-neutral Compile preserves a ten-reference Cosplay plan accepted by Seedream', () => {
  const roles = [
    { assetId: 'person', role: 'person-identity' },
    { assetId: 'character', role: 'character-design' },
    ...Array.from({ length: 4 }, (_, index) => ({ assetId: `prop-${index}`, role: 'signature-prop-detail' })),
    ...Array.from({ length: 4 }, (_, index) => ({ assetId: `detail-${index}`, role: 'critical-detail' })),
  ]
  const compiled = compilePlayground({ scenarioId: 'cosplay', assets: roles.map((item) => asset(item.assetId)), declaredRoles: roles, compositionSelections: [], rightsConfirmed: true, providerProfileId: 'seedream-4.0' })
  assert.equal(compiled.referencePlan.ordered.length, 10)
  assert.equal(compiled.providerCapability.status, 'ok')
  assert.notEqual(compiled.planBinding.generationRequestHash, compiled.providerRenderRequest.requestHash)
})

test('provider profiles and nested security fields are immutable and plan binding uses full digest', () => {
  assert.equal(Object.isFrozen(PLAYGROUND_PROVIDER_PROFILES), true)
  assert.equal(Object.isFrozen(SEEDREAM_4_PROFILE), true)
  assert.equal(Object.isFrozen(SEEDREAM_4_PROFILE.documentation), true)
  assert.equal(Object.isFrozen(SEEDREAM_4_PROFILE.rateLimit), true)
  const response = compilePlayground({ ...input(), rightsConfirmed: true, providerProfileId: 'seedream-4.0' })
  assert.equal(response.planBinding.profileDigest, SEEDREAM_4_PROFILE.playgroundProfileDigest)
  assert.notEqual(SEEDREAM_4_PROFILE.playgroundProfileDigest, SEEDREAM_4_PROFILE.profileHash)
})

test('Grok cost includes each input image and output resolution', () => {
  const compiled = compilePlayground({ ...input(), rightsConfirmed: true, providerProfileId: 'grok-imagine-image-quality' })
  assert.equal(compiled.providerCapability.estimatedCost, 0.09)
  const twoK = { ...compiled.providerRenderRequest, output: { ...compiled.providerRenderRequest.output, dimensions: { width: 2048, height: 2048 } } }
  const preflight = preflightProviderCapability({ request: twoK, profile: GROK_IMAGINE_PROFILE, requireProfileBinding: false, requireAuthorization: false })
  assert.equal(preflight.estimatedCost, 0.11)
})

test('budget gate separates currencies and resets on the next UTC day', () => {
  let now = Date.UTC(2026, 7, 19, 12)
  const gate = new InMemoryBudgetGate({ dailyCostByCurrency: { CNY: 0.2, USD: 0.1 }, perClientCostByCurrency: { CNY: 0.2, USD: 0.1 }, maxConcurrent: 1, now: () => now })
  const first = gate.reserve('client', SEEDREAM_4_PROFILE, 0.2); gate.release(first)
  assert.throws(() => gate.reserve('client', SEEDREAM_4_PROFILE, 0.2), /DAILY_BUDGET_EXCEEDED/)
  const usd = gate.reserve('client', GROK_IMAGINE_PROFILE, 0.09); gate.release(usd)
  now += 24 * 60 * 60 * 1000
  const nextDay = gate.reserve('client', SEEDREAM_4_PROFILE, 0.2); gate.release(nextDay)
  assert.equal(gate.snapshot().day, '2026-08-20')
})

test('budget gate enforces profile request rate without sleeping or retrying', () => {
  let now = Date.UTC(2026, 7, 19, 12)
  const gate = new InMemoryBudgetGate({ dailyCostByCurrency: { USD: 1 }, perClientCostByCurrency: { USD: 1 }, maxConcurrent: 1, now: () => now })
  for (let index = 0; index < 10; index += 1) { const reservation = gate.reserve('client', MOCK_PLAYGROUND_PROFILE, 0); gate.release(reservation) }
  assert.throws(() => gate.reserve('client', MOCK_PLAYGROUND_PROFILE, 0), /RATE_LIMIT_REQUESTS_PER_SECOND_EXCEEDED/)
  now += 1000
  const allowed = gate.reserve('client', MOCK_PLAYGROUND_PROFILE, 0); gate.release(allowed)
})

test('provider preflight applies decoded dimensions and aspect ratio', () => {
  const compiled = compilePlayground({ ...input(), rightsConfirmed: true, providerProfileId: 'seedream-4.0' })
  const summaries = tryOnRoles.map((item, index) => ({ ...asset(item.assetId), role: item.role, width: index ? 1024 : 5000, height: 1000 }))
  const preflight = preflightProviderCapability({ request: compiled.providerRenderRequest, profile: SEEDREAM_4_PROFILE, assets: summaries, requireProfileBinding: false, requireAuthorization: false })
  assert.ok(preflight.reasons.includes('REFERENCE_WIDTH_EXCEEDED:person'))
  assert.ok(preflight.reasons.includes('REFERENCE_ASPECT_RATIO_UNSUPPORTED:person'))
})

test('Generate failure clears the real upload store, not only a cleanup flag', async () => {
  const sizes: number[] = []
  await withServer({ renderEnabled: true, onUploadStoreSizeChange: (size) => sizes.push(size) }, async (baseUrl) => {
    const session = 'cleanup-session'
    const compileInput = { ...(await uploadTryOn(baseUrl, session)), rightsConfirmed: true, providerProfileId: 'seedream-4.0' as const }
    const compiled = await post(baseUrl, '/api/compile', session, compileInput)
    const generated = await post(baseUrl, '/api/generate', session, { compile: compileInput, planBinding: compiled.value.planBinding, confirmSingleCall: true })
    assert.equal(generated.status, 400)
    assert.equal(generated.value.error, 'EPHEMERAL_PROVIDER_KEY_REQUIRED')
  })
  assert.ok(sizes.includes(4))
  assert.equal(sizes.at(-1), 0)
})

test('injected Seedream transport receives one ephemeral key and public output never contains it', async () => {
  const calls: PlaygroundProviderCall[] = []
  const keys: string[] = []
  const output: ArtifactHandle = { id: 'generated-1', storeId: 'test-output', contentHash: sha256({ output: 1 }), mediaType: 'image/png', byteLength: 24, role: 'generated-image', resolverId: 'test-output', availability: 'available', retentionClass: 'request', redactionPolicy: 'safe-hash-only' }
  const transport: PlaygroundProviderTransport = { provider: 'seedream', async send(call, key) { calls.push(call); keys.push(key); return { providerRequestId: 'provider-1', outputArtifacts: [output] } } }
  await withServer({ renderEnabled: true, transports: { seedream: transport } }, async (baseUrl) => {
    const session = 'provider-session'
    const compileInput = { ...(await uploadTryOn(baseUrl, session)), rightsConfirmed: true, providerProfileId: 'seedream-4.0' as const }
    const compiled = await post(baseUrl, '/api/compile', session, compileInput)
    assert.equal(compiled.status, 200)
    const generated = await post(baseUrl, '/api/generate', session, { compile: compileInput, planBinding: compiled.value.planBinding, confirmSingleCall: true, apiKey: 'secret-test-key' })
    assert.equal(generated.status, 200)
    assert.equal(generated.value.result.calls, 1)
    assert.equal(JSON.stringify(generated.value).includes('secret-test-key'), false)
  })
  assert.equal(calls.length, 1)
  assert.deepEqual(keys, ['secret-test-key'])
  assert.equal(JSON.stringify(calls[0]).includes('secret-test-key'), false)
  assert.equal(calls[0].wireFormat, 'seedream-json-data-uri')
})

test('provider transport errors cannot echo an ephemeral key', async () => {
  const secret = 'secret-transport-key'
  const sizes: number[] = []
  const transport: PlaygroundProviderTransport = { provider: 'seedream', async send() { throw new Error(`Authorization Bearer ${secret}`) } }
  await withServer({ renderEnabled: true, transports: { seedream: transport }, onUploadStoreSizeChange: (size) => sizes.push(size) }, async (baseUrl) => {
    const session = 'provider-error-session'
    const compileInput = { ...(await uploadTryOn(baseUrl, session)), rightsConfirmed: true, providerProfileId: 'seedream-4.0' as const }
    const compiled = await post(baseUrl, '/api/compile', session, compileInput)
    const generated = await post(baseUrl, '/api/generate', session, { compile: compileInput, planBinding: compiled.value.planBinding, confirmSingleCall: true, apiKey: secret })
    assert.equal(generated.status, 502)
    assert.equal(generated.value.error, 'PROVIDER_CALL_FAILED')
    assert.equal(JSON.stringify(generated.value).includes(secret), false)
  })
  assert.equal(sizes.at(-1), 0)
})

test('Grok bridge uses the reviewed JSON edit shape and keeps accepted semantics', () => {
  const cosplayRoles = [{ assetId: 'person', role: 'person-identity' }, { assetId: 'character', role: 'character-design' }]
  const cosplayInput: PlaygroundScenarioInput = { scenarioId: 'cosplay', assets: cosplayRoles.map((item) => asset(item.assetId)), declaredRoles: cosplayRoles, compositionSelections: [] }
  const target = compileSemanticClosure(cosplayInput, GROK_IMAGINE_PROFILE)
  const materializer = createProviderRequestMaterializer('grok-imagine.materializer', '1.0.0', GROK_IMAGINE_PROFILE)
  const materialization = materializer.materialize(target.providerRenderRequest)
  const call = buildProviderCall({ request: target.providerRenderRequest, profile: GROK_IMAGINE_PROFILE, materialization,
    assets: cosplayInput.assets.map((item, index) => ({ id: item.id, contentHash: item.contentHash, byteLength: item.byteLength, mediaType: item.mediaType, role: cosplayRoles[index].role, width: 64, height: 96, bytes: minimalPng(64 + index, 96) })) })
  assert.equal(call.wireFormat, 'xai-image-edits-json')
  assert.equal(call.prompt, materialization.request.prompt)
  assert.ok(materialization.request.forbidden.every((item) => call.prompt.includes(item.text)))
  assert.deepEqual(call.controls.parameters, materialization.request.parameters)
  assert.deepEqual(call.controls.output, materialization.request.output)
  assert.equal(call.references.length, 2)
})

// Keep this import-time type assertion close to the test that protects the
// public contract without reaching into packages/core/src.
const _providerRequestTypeCheck: ProviderRenderRequest | undefined = undefined
void _providerRequestTypeCheck
