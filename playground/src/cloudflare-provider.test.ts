import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import test from 'node:test'
import type { AddressInfo } from 'node:net'
import { sha256 } from '@voce-engine/core'
import type { PlaygroundScenarioInput } from './semantic-closure.js'
import { compileSemanticClosure } from './semantic-closure.js'
import { createProviderRequestMaterializer } from './provider-materializer.js'
import { PLAYGROUND_INSPECTION_PROFILE, CLOUDFLARE_FLUX_2_KLEIN_4B_PROFILE, CloudflareQuotaGate, GROK_IMAGINE_PROFILE, PLAYGROUND_PROVIDER_PROFILES, SEEDREAM_5_PRO_PROFILE, preflightProviderCapability } from './providers.js'
import { buildCloudflareProviderCall, cloudflareCredentialFromEnv, cloudflareTransportErrorCode, executeCloudflareProviderCall, FetchCloudflareProviderTransport, type CloudflareMultipartAsset } from './cloudflare-provider.js'
import { FetchSeedreamProviderTransport, seedreamTransportErrorCode } from './seedream-provider.js'
import type { PlaygroundProviderCall } from './provider-bridges.js'
import { createPlaygroundServer, playgroundMeta } from './server.js'
import { PLAYGROUND_HTML } from './web.js'
import { testBrowserFetch } from './test-browser.js'

const roles = [
  { assetId: 'person', role: 'person-identity' },
  { assetId: 'top', role: 'garment-top', typedMetadata: { category: 'shirt' } },
  { assetId: 'bottom', role: 'garment-bottom', typedMetadata: { category: 'jeans' } },
  { assetId: 'footwear', role: 'footwear-detail' },
]

function asset(id: string, width = 256, height = 256) {
  return { id, storeId: 'test', contentHash: sha256({ id }), mediaType: 'image/png', byteLength: 1000, role: 'reference-image', resolverId: 'test', availability: 'available' as const, retentionClass: 'request' as const, redactionPolicy: 'safe-hash-only' as const, ...(id === 'pose' ? { poseSourceKind: 'pose-sketch' as const } : {}), width, height }
}

function input(): PlaygroundScenarioInput {
  return { scenarioId: 'virtual-tryon', assets: roles.map(({ assetId }) => asset(assetId)), declaredRoles: roles, compositionSelections: [] }
}

function cloudflareAssets(value: PlaygroundScenarioInput): CloudflareMultipartAsset[] {
  return value.assets.map((item) => ({ id: item.id, contentHash: item.contentHash, byteLength: item.byteLength, mediaType: item.mediaType, width: (item as typeof item & { width: number }).width, height: (item as typeof item & { height: number }).height, bytes: new Uint8Array([1, 2, 3]) }))
}

function minimalPng(width = 256, height = 256): Uint8Array {
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
  const response = await testBrowserFetch(baseUrl, session, path, { method: 'POST', headers: { 'content-type': 'application/json', 'x-playground-client': 'cloudflare-test' }, body: JSON.stringify(body) })
  return { status: response.status, value: await response.json() }
}

async function uploadScenario(baseUrl: string, session: string, includePose = false, width = 256): Promise<PlaygroundScenarioInput> {
  const declarations = includePose ? [...roles, { assetId: 'pose', role: 'pose' }] : roles
  const assets: any[] = []
  for (const [index, declaration] of declarations.entries()) {
    const uploaded = await post(baseUrl, '/api/upload', session, { mediaType: 'image/png', role: declaration.role, poseSourceKind: declaration.role === 'pose' ? 'pose-sketch' : undefined, bytesBase64: Buffer.from(minimalPng(width + index)).toString('base64') })
    assert.equal(uploaded.status, 200)
    assets.push(uploaded.value.artifact)
  }
  return { scenarioId: 'virtual-tryon', assets, declaredRoles: assets.map((item, index) => ({ assetId: item.id, role: declarations[index].role, ...('typedMetadata' in declarations[index] ? { typedMetadata: declarations[index].typedMetadata } : {}) })), compositionSelections: [] }
}

test('Seedream recommended, Grok optional, and Cloudflare experimental preview are ordered before development-only Mock', () => {
  const ordinary = playgroundMeta() as any
  assert.deepEqual(ordinary.providers.map((item: any) => item.id), ['seedream-5.0-pro', 'grok-imagine-image-quality', 'cloudflare-flux-2-klein-4b'])
  assert.equal(ordinary.providers.some((item: any) => item.id === 'mock-image'), false)
  const development = playgroundMeta({ developmentMode: true }) as any
  assert.equal(development.providers.some((item: any) => item.id === 'mock-image'), true)
  assert.equal(development.providers.find((item: any) => item.id === 'cloudflare-flux-2-klein-4b').credentialMode, 'operator_managed')
  assert.equal(development.providers.find((item: any) => item.id === 'seedream-5.0-pro').credentialMode, 'user_ephemeral')
  assert.equal(development.providers.find((item: any) => item.id === 'grok-imagine-image-quality').credentialMode, 'user_ephemeral')
})

test('Cloudflare bridge maps zero through four references in stable multipart slots', () => {
  const compiled = compileSemanticClosure(input(), CLOUDFLARE_FLUX_2_KLEIN_4B_PROFILE)
  const materializer = createProviderRequestMaterializer('cloudflare.materializer', '1.0.0', CLOUDFLARE_FLUX_2_KLEIN_4B_PROFILE)
  const materialization = materializer.materialize(compiled.providerRenderRequest)
  const call = buildCloudflareProviderCall({ request: compiled.providerRenderRequest, profile: CLOUDFLARE_FLUX_2_KLEIN_4B_PROFILE, materialization, assets: cloudflareAssets(input()) })
  assert.equal(call.references.length, 4)
  assert.deepEqual(call.references.map((item) => item.providerField), ['input_image_0', 'input_image_1', 'input_image_2', 'input_image_3'])
  assert.deepEqual(call.references.map((item) => item.order), [0, 1, 2, 3])
  assert.deepEqual(call.parts.filter((part) => part.name.startsWith('input_image_')).map((part) => part.name), ['input_image_0', 'input_image_1', 'input_image_2', 'input_image_3'])
  const empty = buildCloudflareProviderCall({ request: compiled.providerRenderRequest, profile: CLOUDFLARE_FLUX_2_KLEIN_4B_PROFILE, materialization: { ...materialization, request: { ...materialization.request, references: [] } }, assets: [] })
  assert.equal(empty.references.length, 0)
})

test('Cloudflare fifth reference and at-or-above-512 dimensions fail before transport', () => {
  const five = { ...input(), assets: [...input().assets, asset('pose')], declaredRoles: [...input().declaredRoles, { assetId: 'pose', role: 'pose' }] }
  const fiveCompiled = compileSemanticClosure(five, PLAYGROUND_INSPECTION_PROFILE)
  const fivePreflight = preflightProviderCapability({ request: fiveCompiled.providerRenderRequest, profile: CLOUDFLARE_FLUX_2_KLEIN_4B_PROFILE, assets: five.assets.map((item) => ({ id: item.id, byteLength: item.byteLength, mediaType: item.mediaType, width: (item as any).width, height: (item as any).height })), requireProfileBinding: false, requireAuthorization: false })
  assert.equal(fivePreflight.status, 'blocked')
  assert.ok(fivePreflight.reasons.includes('REFERENCE_COUNT_EXCEEDED'))
  const fourCompiled = compileSemanticClosure(input(), CLOUDFLARE_FLUX_2_KLEIN_4B_PROFILE)
  const oversized = preflightProviderCapability({ request: fourCompiled.providerRenderRequest, profile: CLOUDFLARE_FLUX_2_KLEIN_4B_PROFILE, assets: input().assets.map((item, index) => ({ id: item.id, byteLength: item.byteLength, mediaType: item.mediaType, width: index === 0 ? 512 : 256, height: 256 })), requireProfileBinding: false, requireAuthorization: false })
  assert.equal(oversized.status, 'blocked')
  assert.ok(oversized.reasons.includes('REFERENCE_WIDTH_MUST_BE_BELOW:person'))
})

test('Cloudflare materialization retains accepted prohibitions, typed parameters, output, and order', () => {
  const compiled = compileSemanticClosure(input(), CLOUDFLARE_FLUX_2_KLEIN_4B_PROFILE)
  const materializer = createProviderRequestMaterializer('cloudflare.materializer', '1.0.0', CLOUDFLARE_FLUX_2_KLEIN_4B_PROFILE)
  const materialization = materializer.materialize(compiled.providerRenderRequest)
  const call = buildCloudflareProviderCall({ request: compiled.providerRenderRequest, profile: CLOUDFLARE_FLUX_2_KLEIN_4B_PROFILE, materialization, assets: cloudflareAssets(input()) })
  assert.ok(compiled.providerRenderRequest.referenceMappings.every((mapping) => mapping.prohibitedTargetPaths?.every((path) => materialization.request.references.find((item) => item.assetId === mapping.assetId)?.prohibitedTargetPaths.includes(path))))
  assert.deepEqual(call.controls.parameters, materialization.request.parameters)
  assert.deepEqual((call.controls as any).output, materialization.request.output)
  assert.equal(call.prompt, materialization.request.prompt)
  assert.equal(call.requestHash, compiled.providerRenderRequest.requestHash)
})

test('real Cloudflare transport sends bounded multipart data and decodes one image without exposing credentials', async () => {
  const compiled = compileSemanticClosure(input(), CLOUDFLARE_FLUX_2_KLEIN_4B_PROFILE)
  const materializer = createProviderRequestMaterializer('cloudflare.materializer', '1.0.0', CLOUDFLARE_FLUX_2_KLEIN_4B_PROFILE)
  const call = buildCloudflareProviderCall({ request: compiled.providerRenderRequest, profile: CLOUDFLARE_FLUX_2_KLEIN_4B_PROFILE, materialization: materializer.materialize(compiled.providerRenderRequest), assets: cloudflareAssets(input()) })
  const png = minimalPng()
  let observedUrl = ''
  let observedForm: FormData | undefined
  const transport = new FetchCloudflareProviderTransport(async (url, init) => {
    observedUrl = String(url)
    assert.equal(new Headers(init?.headers).get('authorization'), 'Bearer secret-token')
    assert.ok(init?.body instanceof FormData)
    observedForm = init.body
    return new Response(JSON.stringify({ success: true, result: { image: Buffer.from(png).toString('base64') } }), { status: 200, headers: { 'content-type': 'application/json', 'cf-ray': 'request-123' } })
  })
  const result = await transport.send(call, { accountId: 'account-test', apiToken: 'secret-token' })
  assert.match(observedUrl, /\/accounts\/account-test\/ai\/run\/@cf\/black-forest-labs\/flux-2-klein-4b$/)
  assert.equal(observedForm?.get('prompt'), call.prompt)
  assert.equal(observedForm?.getAll('input_image_0').length, 1)
  assert.equal(result.providerRequestId, 'request-123')
  assert.equal(result.outputArtifacts.length, 1)
  assert.equal(result.outputAssets?.[0].bytes.byteLength, png.byteLength)
  assert.equal(JSON.stringify(result).includes('secret-token'), false)
  assert.match(PLAYGROUND_HTML, /generated-image/)
})

test('Cloudflare quota is shared, UTC-reset, and fail-closed without fallback or retry', () => {
  let now = Date.UTC(2026, 7, 19, 12)
  const gate = new CloudflareQuotaGate(100, () => now)
  gate.reserve(90)
  assert.throws(() => gate.reserve(11), /CLOUDFLARE_QUOTA_EXHAUSTED/)
  assert.equal(gate.snapshot().calls, 1)
  now += 24 * 60 * 60 * 1000
  assert.equal(gate.snapshot().usedNeurons, 0)
  assert.equal(cloudflareTransportErrorCode({ status: 429, errors: [{ code: 3036 }] }), 'CLOUDFLARE_ACCOUNT_LIMITED')
  assert.equal(cloudflareTransportErrorCode({ status: 500, errors: [{ code: 1234 }] }), 'CLOUDFLARE_TRANSPORT_FAILED')
})

test('Cloudflare operator credential is not a browser field and is never echoed', async () => {
  const ordinary = playgroundMeta() as any
  const cloudflare = ordinary.providers.find((item: any) => item.id === 'cloudflare-flux-2-klein-4b')
  assert.equal(cloudflare.credentialMode, 'operator_managed')
  assert.equal(cloudflare.selectorMetadata.credential.includes('browser'), true)
  assert.match(cloudflare.selectorMetadata.qualityNote, /quick previews/i)
  assert.match(cloudflare.selectorMetadata.qualityNote, /face identity/i)
  assert.match(cloudflare.selectorMetadata.qualityNote, /accessory details/i)
  assert.match(cloudflare.selectorMetadata.qualityNote, /feet\/framing/i)
  assert.match(PLAYGROUND_HTML, /Cloudflare — Free experimental preview/)
  assert.match(PLAYGROUND_HTML, /Seedream 5\.0 Pro — recommended \(BYOK\)/)
  assert.equal(cloudflareTransportErrorCode({ status: 429, code: '3036', body: 'Bearer token should not appear' }), 'CLOUDFLARE_ACCOUNT_LIMITED')
  assert.equal(cloudflareCredentialFromEnv({}), undefined)
  assert.match(PLAYGROUND_HTML, /provider-controls/)
  const compiled = compileSemanticClosure(input(), CLOUDFLARE_FLUX_2_KLEIN_4B_PROFILE)
  const materializer = createProviderRequestMaterializer('cloudflare.materializer', '1.0.0', CLOUDFLARE_FLUX_2_KLEIN_4B_PROFILE)
  await assert.rejects(() => executeCloudflareProviderCall({ request: compiled.providerRenderRequest, profile: CLOUDFLARE_FLUX_2_KLEIN_4B_PROFILE, materialization: materializer.materialize(compiled.providerRenderRequest), assets: cloudflareAssets(input()), credential: { accountId: 'account-test', apiToken: 'token-test' }, transport: { provider: 'cloudflare', async send() { return { providerRequestId: 'token-test', outputArtifacts: [] } } } }), /CLOUDFLARE_RESPONSE_CREDENTIAL_ECHOED/)
  assert.equal(JSON.stringify(ordinary).includes('token-test'), false)
})

test('Cloudflare fifth reference is blocked before transport with calls=0', async () => {
  let calls = 0
  const transport = { provider: 'cloudflare' as const, async send() { calls += 1; throw new Error('must not be called') } }
  await withServer({ renderEnabled: true, cloudflareCredential: { accountId: 'account-test', apiToken: 'token-test' }, transports: { cloudflare: transport } }, async (baseUrl) => {
    const session = 'cloudflare-five-session'
    const compileInput = { ...(await uploadScenario(baseUrl, session, true)), rightsConfirmed: true, providerProfileId: 'cloudflare-flux-2-klein-4b' as const }
    const compiled = await post(baseUrl, '/api/compile', session, compileInput)
    assert.equal(compiled.status, 200)
    assert.equal(compiled.value.providerCapability.status, 'blocked')
    const generated = await post(baseUrl, '/api/generate', session, { compile: compileInput, planBinding: compiled.value.planBinding, confirmSingleCall: true })
    assert.equal(generated.status, 409)
    assert.match(generated.value.error, /REFERENCE_COUNT_EXCEEDED/)
    const oversizedSession = 'cloudflare-size-session'
    const oversizedInput = { ...(await uploadScenario(baseUrl, oversizedSession, false, 512)), rightsConfirmed: true, providerProfileId: 'cloudflare-flux-2-klein-4b' as const }
    const oversized = await post(baseUrl, '/api/compile', oversizedSession, oversizedInput)
    assert.equal(oversized.status, 200)
    assert.equal(oversized.value.providerCapability.status, 'blocked')
    assert.ok(oversized.value.providerCapability.reasons.some((reason: string) => reason.includes('MUST_BE_BELOW')))
    const oversizedGenerated = await post(baseUrl, '/api/generate', oversizedSession, { compile: oversizedInput, planBinding: oversized.value.planBinding, confirmSingleCall: true })
    assert.equal(oversizedGenerated.status, 409)
  })
  assert.equal(calls, 0)
})

test('Cloudflare missing operator credential, quota exhaustion, and account-limited errors are safe', async () => {
  const output = { id: 'generated', storeId: 'recording', contentHash: sha256({ generated: true }), mediaType: 'image/png', byteLength: 0, role: 'generated-image', resolverId: 'recording', availability: 'available' as const, retentionClass: 'request' as const, redactionPolicy: 'safe-hash-only' as const }
  const recording = { provider: 'cloudflare' as const, async send() { return { providerRequestId: 'cf-request-1', outputArtifacts: [output] } } }
  await withServer({ renderEnabled: true, transports: { cloudflare: recording } }, async (baseUrl) => {
    const session = 'cloudflare-credential-session'
    const compileInput = { ...(await uploadScenario(baseUrl, session)), rightsConfirmed: true, providerProfileId: 'cloudflare-flux-2-klein-4b' as const }
    const compiled = await post(baseUrl, '/api/compile', session, compileInput)
    const generated = await post(baseUrl, '/api/generate', session, { compile: compileInput, planBinding: compiled.value.planBinding, confirmSingleCall: true })
    assert.equal(generated.status, 503)
    assert.equal(generated.value.error, 'CLOUDFLARE_OPERATOR_CREDENTIAL_UNAVAILABLE')
  })
  await withServer({ renderEnabled: true, cloudflareCredential: { accountId: 'account-test', apiToken: 'token-test' }, cloudflareQuotaGate: new CloudflareQuotaGate(1), transports: { cloudflare: recording } }, async (baseUrl) => {
    const session = 'cloudflare-quota-session'
    const compileInput = { ...(await uploadScenario(baseUrl, session)), rightsConfirmed: true, providerProfileId: 'cloudflare-flux-2-klein-4b' as const }
    const compiled = await post(baseUrl, '/api/compile', session, compileInput)
    const generated = await post(baseUrl, '/api/generate', session, { compile: compileInput, planBinding: compiled.value.planBinding, confirmSingleCall: true })
    assert.equal(generated.status, 429)
    assert.equal(generated.value.error, 'CLOUDFLARE_QUOTA_EXHAUSTED')
    assert.equal(JSON.stringify(generated.value).includes('token-test'), false)
  })
  const limited = { provider: 'cloudflare' as const, async send() { throw Object.assign(new Error('Bearer token-test raw body'), { status: 429, errors: [{ code: 3036 }], body: 'token-test' }) } }
  await withServer({ renderEnabled: true, cloudflareCredential: { accountId: 'account-test', apiToken: 'token-test' }, transports: { cloudflare: limited } }, async (baseUrl) => {
    const session = 'cloudflare-limited-session'
    const compileInput = { ...(await uploadScenario(baseUrl, session)), rightsConfirmed: true, providerProfileId: 'cloudflare-flux-2-klein-4b' as const }
    const compiled = await post(baseUrl, '/api/compile', session, compileInput)
    const generated = await post(baseUrl, '/api/generate', session, { compile: compileInput, planBinding: compiled.value.planBinding, confirmSingleCall: true })
    assert.equal(generated.status, 502)
    assert.equal(generated.value.error, 'CLOUDFLARE_ACCOUNT_LIMITED')
    assert.equal(JSON.stringify(generated.value).includes('token-test'), false)
  })
})

test('Seedream and Grok remain user-ephemeral BYOK profiles', () => {
  assert.equal(SEEDREAM_5_PRO_PROFILE.credentialMode, 'user_ephemeral')
  assert.equal(GROK_IMAGINE_PROFILE.credentialMode, 'user_ephemeral')
  assert.equal(PLAYGROUND_PROVIDER_PROFILES['cloudflare-flux-2-klein-4b'].credentialMode, 'operator_managed')
})

test('real Seedream BYOK transport sends one allow-listed request and returns display bytes without retaining the key', async () => {
  const jpeg = new Uint8Array([255, 216, 255, 217])
  const reference = minimalPng()
  const contentHash = `sha256:${createHash('sha256').update(reference).digest('hex')}`
  const call: PlaygroundProviderCall = {
    schemaVersion: 'voce.playground-provider-call/v1alpha1',
    provider: 'seedream',
    endpoint: 'https://ark.cn-beijing.volces.com/api/v3/images/generations',
    model: 'doubao-seedream-5-0-pro-260628',
    wireFormat: 'seedream-json-data-uri',
    requestHash: sha256({ seedream: true }),
    prompt: 'Keep the person identity and replace the clothing.',
    references: [{ assetId: 'person', contentHash, mediaType: 'image/png', bytes: reference }],
    controls: {},
    timeoutMs: 10_000,
  }
  let calls = 0
  const transport = new FetchSeedreamProviderTransport(async (url, init) => {
    calls += 1
    if (calls === 1) {
      assert.equal(String(url), call.endpoint)
      assert.equal(new Headers(init?.headers).get('authorization'), 'Bearer one-request-key')
      const body = JSON.parse(String(init?.body))
      assert.equal(body.model, call.model)
      assert.equal(body.n, 1)
      assert.equal(body.output_format, 'jpeg')
      assert.equal(body.size, '2K')
      assert.equal(body.watermark, false)
      assert.equal('sequential_image_generation' in body, false)
      assert.equal('stream' in body, false)
      assert.equal('response_format' in body, false)
      assert.equal(body.image.startsWith('data:image/png;base64,'), true)
      return new Response(JSON.stringify({ data: [{ url: 'https://output.volces.com/generated.jpg' }] }), { status: 200, headers: { 'x-request-id': 'seedream-request-1' } })
    }
    assert.equal(String(url), 'https://output.volces.com/generated.jpg')
    return new Response(jpeg, { status: 200, headers: { 'content-type': 'image/jpeg' } })
  })
  const result = await transport.send(call, 'one-request-key')
  assert.equal(calls, 2)
  assert.equal(result.providerRequestId, 'seedream-request-1')
  assert.equal(result.outputArtifacts.length, 1)
  assert.equal(result.outputAssets?.[0].artifact.mediaType, 'image/jpeg')
  assert.deepEqual(result.outputAssets?.[0].bytes, jpeg)
  assert.equal(JSON.stringify(result).includes('one-request-key'), false)
})

test('Seedream transport exposes only safe failure categories', async () => {
  const reference = minimalPng()
  const call: PlaygroundProviderCall = {
    schemaVersion: 'voce.playground-provider-call/v1alpha1', provider: 'seedream',
    endpoint: 'https://ark.cn-beijing.volces.com/api/v3/images/generations', model: 'doubao-seedream-5-0-pro-260628', wireFormat: 'seedream-json-data-uri',
    requestHash: sha256({ failure: true }), prompt: 'test',
    references: [{ assetId: 'person', contentHash: `sha256:${createHash('sha256').update(reference).digest('hex')}`, mediaType: 'image/png', bytes: reference }],
    controls: {}, timeoutMs: 10_000,
  }
  for (const [status, expected] of [[401, 'SEEDREAM_API_KEY_REJECTED'], [429, 'SEEDREAM_RATE_OR_QUOTA_LIMITED'], [500, 'SEEDREAM_SERVICE_UNAVAILABLE'], [400, 'SEEDREAM_REQUEST_REJECTED']] as const) {
    const transport = new FetchSeedreamProviderTransport(async () => new Response(JSON.stringify({ error: { message: 'must stay private' } }), { status }))
    let observed: unknown
    try { await transport.send(call, 'private-key') } catch (error) { observed = error }
    assert.equal(seedreamTransportErrorCode(observed), expected)
    assert.equal(String(observed).includes('private-key'), false)
    assert.equal(String(observed).includes('must stay private'), false)
  }
  const detailed = new FetchSeedreamProviderTransport(async () => new Response(JSON.stringify({ error: { code: 'InvalidParameter', param: 'image', message: 'private provider explanation' } }), { status: 400 }))
  let detailedError: unknown
  try { await detailed.send(call, 'private-key') } catch (error) { detailedError = error }
  assert.equal(seedreamTransportErrorCode(detailedError), 'SEEDREAM_REQUEST_REJECTED:InvalidParameter:image')
  assert.equal(seedreamTransportErrorCode(detailedError).includes('private provider explanation'), false)
})
