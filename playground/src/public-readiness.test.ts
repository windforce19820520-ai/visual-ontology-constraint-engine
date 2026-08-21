import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import type { AddressInfo } from 'node:net'
import test from 'node:test'
import type { ArtifactHandle } from '@voce-engine/contracts'
import { sha256 } from '@voce-engine/core'
import { FetchGrokProviderTransport, grokTransportErrorCode } from './grok-provider.js'
import { sanitizeImageMetadata } from './image-safety.js'
import type { PlaygroundProviderCall, PlaygroundProviderTransport } from './provider-bridges.js'
import { InMemoryRequestQuotaStore, RequestQuotaGate } from './quota-store.js'
import { playgroundRuntimeConfigFromEnv } from './runtime-config.js'
import { createPlaygroundServer } from './server.js'
import { testBrowserFetch } from './test-browser.js'

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

async function jsonRequest(baseUrl: string, session: string, path: string, body: unknown, headers: Record<string, string> = {}): Promise<{ status: number; value: any; headers: Headers }> {
  const response = await testBrowserFetch(baseUrl, session, path, { method: 'POST', headers: { 'content-type': 'application/json', ...headers }, body: JSON.stringify(body) })
  return { status: response.status, value: await response.json(), headers: response.headers }
}

async function uploadScenario(baseUrl: string, session: string, providerProfileId: 'mock-image' | 'seedream-5.0-pro', headers: Record<string, string> = {}): Promise<any> {
  const declarations = [{ role: 'person-identity' }, { role: 'garment-top', typedMetadata: { category: 'shirt' } }]
  const assets = []
  for (const [index, declaration] of declarations.entries()) {
    const uploaded = await jsonRequest(baseUrl, session, '/api/upload', { mediaType: 'image/png', role: declaration.role, bytesBase64: Buffer.from(minimalPng(64 + index, 96)).toString('base64') }, headers)
    assert.equal(uploaded.status, 200)
    assets.push(uploaded.value.artifact)
  }
  return { scenarioId: 'virtual-tryon', assets, declaredRoles: assets.map((asset, index) => ({ assetId: asset.id, ...declarations[index] })), compositionSelections: [], rightsConfirmed: true, providerProfileId }
}

async function mockGenerate(baseUrl: string, session: string, headers: Record<string, string> = {}): Promise<{ status: number; value: any }> {
  const compileInput = await uploadScenario(baseUrl, session, 'mock-image', headers)
  const compiled = await jsonRequest(baseUrl, session, '/api/compile', compileInput, headers)
  assert.equal(compiled.status, 200)
  return jsonRequest(baseUrl, session, '/api/generate', { compile: compileInput, planBinding: compiled.value.planBinding, confirmSingleCall: true }, headers)
}

function publicEnv(): NodeJS.ProcessEnv {
  return {
    PLAYGROUND_PUBLIC_MODE: '1', PLAYGROUND_HOST: '127.0.0.1', PLAYGROUND_EXTERNAL_SCHEME: 'https', PLAYGROUND_BEHIND_REVERSE_PROXY: '1',
    PLAYGROUND_SINGLE_INSTANCE: '1', PLAYGROUND_PROVIDER_HARD_LIMITS_CONFIRMED: '1',
    PLAYGROUND_SESSION_CALLS_PER_DAY: '4', PLAYGROUND_CLIENT_CALLS_PER_DAY: '10', PLAYGROUND_GLOBAL_CALLS_PER_DAY: '20',
    PLAYGROUND_MAX_CONCURRENT_GENERATIONS: '2', PLAYGROUND_SEEDREAM_CALLS_PER_MINUTE: '5',
    PLAYGROUND_GROK_CALLS_PER_MINUTE: '5', PLAYGROUND_CLOUDFLARE_CALLS_PER_MINUTE: '10',
  }
}

test('public runtime configuration is explicit and fails closed on unsafe production settings', () => {
  const config = playgroundRuntimeConfigFromEnv(publicEnv())
  assert.equal(config.publicMode, true)
  assert.equal(config.secureCookies, true)
  assert.equal(config.host, '127.0.0.1')
  assert.equal(config.behindReverseProxy, true)
  assert.equal(config.validationExportEnabled, false)
  assert.throws(() => playgroundRuntimeConfigFromEnv({ ...publicEnv(), PLAYGROUND_EXTERNAL_SCHEME: 'http' }), /PLAYGROUND_PUBLIC_HTTPS_REQUIRED/)
  assert.throws(() => playgroundRuntimeConfigFromEnv({ ...publicEnv(), PLAYGROUND_SINGLE_INSTANCE: '0' }), /PLAYGROUND_PUBLIC_QUOTA_DURABILITY_UNCONFIRMED/)
  assert.throws(() => playgroundRuntimeConfigFromEnv({ ...publicEnv(), PLAYGROUND_BEHIND_REVERSE_PROXY: '0' }), /PLAYGROUND_PUBLIC_REVERSE_PROXY_REQUIRED/)
  assert.throws(() => playgroundRuntimeConfigFromEnv({ ...publicEnv(), PLAYGROUND_VALIDATION_EXPORT: '1' }), /PLAYGROUND_PUBLIC_DEVELOPMENT_FEATURE_FORBIDDEN/)
  assert.throws(() => playgroundRuntimeConfigFromEnv({ ...publicEnv(), PLAYGROUND_TRUST_PROXY: '1', PLAYGROUND_TRUSTED_PROXY_CIDRS: '0.0.0.0\/0' }), /PLAYGROUND_TRUSTED_PROXY_RULE_INVALID/)
  const missingLimit = publicEnv(); delete missingLimit.PLAYGROUND_GLOBAL_CALLS_PER_DAY
  assert.throws(() => playgroundRuntimeConfigFromEnv(missingLimit), /PLAYGROUND_PUBLIC_LIMIT_REQUIRED/)
})

test('health and readiness endpoints are deterministic and do not create sessions', async () => {
  await withServer({ ready: () => false }, async (baseUrl) => {
    const health = await fetch(`${baseUrl}/healthz`)
    const ready = await fetch(`${baseUrl}/readyz`)
    assert.equal(health.status, 200)
    assert.deepEqual(await health.json(), { status: 'ok' })
    assert.equal(health.headers.get('set-cookie'), null)
    assert.equal(ready.status, 503)
    assert.deepEqual(await ready.json(), { status: 'not-ready' })
  })
})

test('server-issued session cookies are HttpOnly, local/public modes differ, and forged cookies cannot reuse uploads', async () => {
  await withServer({}, async (baseUrl) => {
    const first = await fetch(`${baseUrl}/api/meta`)
    const cookie = first.headers.get('set-cookie') ?? ''
    assert.match(cookie, /^voce_playground_session=[0-9a-f]{32}\.[0-9a-f]{64};/)
    assert.match(cookie, /HttpOnly/)
    assert.match(cookie, /SameSite=Strict/)
    assert.doesNotMatch(cookie, /; Secure/)
    const scenario = await uploadScenario(baseUrl, 'legitimate-cookie', 'mock-image')
    const forged = await fetch(`${baseUrl}/api/compile`, { method: 'POST', headers: { 'content-type': 'application/json', cookie: `voce_playground_session=${'a'.repeat(32)}.${'b'.repeat(64)}` }, body: JSON.stringify(scenario) })
    assert.equal(forged.status, 400)
    assert.match((await forged.json()).error, /PLAYGROUND_UPLOAD_NOT_FOUND/)
  })
  await withServer({ secureCookies: true }, async (baseUrl) => {
    const response = await fetch(`${baseUrl}/api/meta`)
    assert.match(response.headers.get('set-cookie') ?? '', /; Secure/)
  })
})

test('spoofed browser client headers cannot bypass per-client quotas', async () => {
  const gate = new RequestQuotaGate(new InMemoryRequestQuotaStore(), { perSessionCalls: 5, perClientCalls: 1, dailyCalls: 10, maxConcurrent: 2, providerCallsPerMinute: { mock: 10 } })
  await withServer({ renderEnabled: true, requestQuotaGate: gate }, async (baseUrl) => {
    const first = await mockGenerate(baseUrl, 'spoof-a', { 'x-playground-client': 'attacker-a' })
    const second = await mockGenerate(baseUrl, 'spoof-b', { 'x-playground-client': 'attacker-b' })
    assert.equal(first.status, 200)
    assert.equal(second.status, 429)
    assert.equal(second.value.error, 'CLIENT_QUOTA_EXCEEDED')
  })
})

test('forwarded IP is used only when the immediate proxy is explicitly trusted', async () => {
  const limits = { perSessionCalls: 5, perClientCalls: 1, dailyCalls: 10, maxConcurrent: 2, providerCallsPerMinute: { mock: 10 } }
  await withServer({ renderEnabled: true, trustedProxyCidrs: ['127.0.0.1'], requestQuotaGate: new RequestQuotaGate(new InMemoryRequestQuotaStore(), limits) }, async (baseUrl) => {
    assert.equal((await mockGenerate(baseUrl, 'trusted-a', { 'x-forwarded-for': '198.51.100.10' })).status, 200)
    assert.equal((await mockGenerate(baseUrl, 'trusted-b', { 'x-forwarded-for': '198.51.100.11' })).status, 200)
  })
  await withServer({ renderEnabled: true, requestQuotaGate: new RequestQuotaGate(new InMemoryRequestQuotaStore(), limits) }, async (baseUrl) => {
    assert.equal((await mockGenerate(baseUrl, 'untrusted-a', { 'x-forwarded-for': '198.51.100.10' })).status, 200)
    assert.equal((await mockGenerate(baseUrl, 'untrusted-b', { 'x-forwarded-for': '198.51.100.11' })).status, 429)
  })
})

test('upload rejects MIME/signature mismatches, pixel bombs, and global capacity exhaustion', async () => {
  await withServer({ uploadLimits: { globalCount: 1 } }, async (baseUrl) => {
    const mismatch = await jsonRequest(baseUrl, 'upload-mismatch', '/api/upload', { mediaType: 'image/jpeg', role: 'person-identity', bytesBase64: Buffer.from(minimalPng()).toString('base64') })
    assert.equal(mismatch.status, 400)
    assert.equal(mismatch.value.error, 'PLAYGROUND_IMAGE_SIGNATURE_INVALID')
    const bomb = await jsonRequest(baseUrl, 'upload-bomb', '/api/upload', { mediaType: 'image/png', role: 'person-identity', bytesBase64: Buffer.from(minimalPng(10_000, 10_000)).toString('base64') })
    assert.equal(bomb.status, 413)
    assert.equal(bomb.value.error, 'PLAYGROUND_IMAGE_PIXEL_LIMIT_EXCEEDED')
    assert.equal((await jsonRequest(baseUrl, 'capacity-a', '/api/upload', { mediaType: 'image/png', role: 'person-identity', bytesBase64: Buffer.from(minimalPng()).toString('base64') })).status, 200)
    const full = await jsonRequest(baseUrl, 'capacity-b', '/api/upload', { mediaType: 'image/png', role: 'person-identity', bytesBase64: Buffer.from(minimalPng()).toString('base64') })
    assert.equal(full.status, 503)
    assert.equal(full.value.error, 'PLAYGROUND_UPLOAD_COUNT_CAPACITY_EXCEEDED')
  })
})

function pngChunk(type: string, data: Uint8Array): Uint8Array {
  const output = new Uint8Array(12 + data.byteLength)
  new DataView(output.buffer).setUint32(0, data.byteLength)
  output.set(Buffer.from(type, 'ascii'), 4); output.set(data, 8)
  return output
}

function webpChunk(type: string, data: Uint8Array): Uint8Array {
  const output = new Uint8Array(8 + data.byteLength + (data.byteLength % 2))
  output.set(Buffer.from(type, 'ascii')); new DataView(output.buffer).setUint32(4, data.byteLength, true); output.set(data, 8)
  return output
}

test('PNG, JPEG, and WebP metadata are removed without retaining privacy-bearing chunks', () => {
  const png = Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), pngChunk('IHDR', new Uint8Array(13)), pngChunk('tEXt', Buffer.from('author=private')), pngChunk('eXIf', Buffer.from('gps')), pngChunk('IDAT', new Uint8Array()), pngChunk('IEND', new Uint8Array())])
  const cleanPng = sanitizeImageMetadata(png, 'image/png')
  assert.doesNotMatch(Buffer.from(cleanPng).toString('latin1'), /author=private|gps|tEXt|eXIf/)
  const jpeg = Uint8Array.from([0xff, 0xd8, 0xff, 0xe1, 0, 8, 69, 120, 105, 102, 0, 0, 0xff, 0xe2, 0, 6, 73, 67, 67, 0, 0xff, 0xfe, 0, 6, 110, 111, 116, 101, 0xff, 0xda, 0, 2, 1, 2, 0xff, 0xd9])
  const cleanJpeg = sanitizeImageMetadata(jpeg, 'image/jpeg')
  assert.doesNotMatch(Buffer.from(cleanJpeg).toString('latin1'), /Exif|ICC|note/)
  const webpBody = Buffer.concat([webpChunk('VP8X', Uint8Array.from([0x2c, 0, 0, 0, 0, 0, 0, 0, 0, 0])), webpChunk('EXIF', Buffer.from('private')), webpChunk('XMP ', Buffer.from('secret')), webpChunk('VP8 ', new Uint8Array())])
  const webpHeader = Buffer.alloc(12); webpHeader.write('RIFF'); webpHeader.writeUInt32LE(webpBody.byteLength + 4, 4); webpHeader.write('WEBP', 8)
  const cleanWebp = sanitizeImageMetadata(Buffer.concat([webpHeader, webpBody]), 'image/webp')
  assert.doesNotMatch(Buffer.from(cleanWebp).toString('latin1'), /EXIF|XMP |private|secret/)
  assert.equal(cleanWebp[20] & (0x20 | 0x08 | 0x04), 0)
})

test('generated results are cookie-scoped, omit session query parameters, and expire', async () => {
  const bytes = minimalPng()
  const artifact: ArtifactHandle = { id: 'seedream-00000000-0000-4000-8000-000000000002', storeId: 'test', contentHash: `sha256:${createHash('sha256').update(bytes).digest('hex')}`, mediaType: 'image/png', byteLength: bytes.byteLength, role: 'generated-image', resolverId: 'test', availability: 'available', retentionClass: 'request', redactionPolicy: 'safe-hash-only' }
  const transport: PlaygroundProviderTransport = { provider: 'seedream', async send() { return { outputArtifacts: [artifact], outputAssets: [{ artifact, bytes }] } } }
  await withServer({ renderEnabled: true, transports: { seedream: transport }, generatedTtlMs: 0 }, async (baseUrl) => {
    const session = 'result-owner'
    const compileInput = await uploadScenario(baseUrl, session, 'seedream-5.0-pro')
    const compiled = await jsonRequest(baseUrl, session, '/api/compile', compileInput)
    const generated = await jsonRequest(baseUrl, session, '/api/generate', { compile: compileInput, planBinding: compiled.value.planBinding, confirmSingleCall: true, apiKey: 'one-use-key' })
    assert.equal(generated.status, 200)
    assert.equal(generated.value.result.outputUrl.includes('?'), false)
    assert.equal((await testBrowserFetch(baseUrl, 'other-session', generated.value.result.outputUrl)).status, 404)
    assert.equal((await testBrowserFetch(baseUrl, session, generated.value.result.outputUrl)).status, 404)
  })
})

test('result capacity is checked before transport and API keys never enter logs or responses', async () => {
  let calls = 0
  const logs: unknown[] = []
  const transport: PlaygroundProviderTransport = { provider: 'seedream', async send(_call, key) { calls += 1; throw new Error(`provider private body ${key}`) } }
  const logger = { info(event: string, fields: unknown) { logs.push({ event, fields }) }, error(event: string, fields: unknown) { logs.push({ event, fields }) } }
  await withServer({ renderEnabled: true, transports: { seedream: transport }, generatedLimits: { globalBytes: 49_999_999 }, logger }, async (baseUrl) => {
    const compileInput = await uploadScenario(baseUrl, 'capacity-result', 'seedream-5.0-pro')
    const compiled = await jsonRequest(baseUrl, 'capacity-result', '/api/compile', compileInput)
    const generated = await jsonRequest(baseUrl, 'capacity-result', '/api/generate', { compile: compileInput, planBinding: compiled.value.planBinding, confirmSingleCall: true, apiKey: 'private-capacity-key' })
    assert.equal(generated.status, 503)
    assert.equal(generated.value.error, 'PLAYGROUND_RESULT_BYTES_CAPACITY_EXCEEDED')
    assert.equal(calls, 0)
    assert.doesNotMatch(JSON.stringify({ logs, generated: generated.value }), /private-capacity-key|provider private body/)
  })
  await withServer({ renderEnabled: true, transports: { seedream: transport }, logger }, async (baseUrl) => {
    const compileInput = await uploadScenario(baseUrl, 'safe-error-log', 'seedream-5.0-pro')
    const compiled = await jsonRequest(baseUrl, 'safe-error-log', '/api/compile', compileInput)
    const generated = await jsonRequest(baseUrl, 'safe-error-log', '/api/generate', { compile: compileInput, planBinding: compiled.value.planBinding, confirmSingleCall: true, apiKey: 'private-error-key' })
    assert.equal(generated.status, 502)
    assert.equal(generated.value.error, 'SEEDREAM_TRANSPORT_FAILED')
    assert.doesNotMatch(JSON.stringify({ logs, generated: generated.value }), /private-error-key|provider private body/)
  })
})

test('concurrent result capacity is reserved before Provider transport', async () => {
  const bytes = minimalPng()
  const artifact: ArtifactHandle = { id: 'seedream-00000000-0000-4000-8000-000000000003', storeId: 'test', contentHash: `sha256:${createHash('sha256').update(bytes).digest('hex')}`, mediaType: 'image/png', byteLength: bytes.byteLength, role: 'generated-image', resolverId: 'test', availability: 'available', retentionClass: 'request', redactionPolicy: 'safe-hash-only' }
  let calls = 0
  let releaseTransport!: () => void
  let transportStarted!: () => void
  const blocked = new Promise<void>((resolve) => { releaseTransport = resolve })
  const started = new Promise<void>((resolve) => { transportStarted = resolve })
  const transport: PlaygroundProviderTransport = { provider: 'seedream', async send() { calls += 1; transportStarted(); await blocked; return { outputArtifacts: [artifact], outputAssets: [{ artifact, bytes }] } } }
  await withServer({ renderEnabled: true, transports: { seedream: transport }, generatedLimits: { globalBytes: 50_000_000 } }, async (baseUrl) => {
    const firstInput = await uploadScenario(baseUrl, 'capacity-concurrent-a', 'seedream-5.0-pro')
    const secondInput = await uploadScenario(baseUrl, 'capacity-concurrent-b', 'seedream-5.0-pro')
    const firstCompile = await jsonRequest(baseUrl, 'capacity-concurrent-a', '/api/compile', firstInput)
    const secondCompile = await jsonRequest(baseUrl, 'capacity-concurrent-b', '/api/compile', secondInput)
    const firstPending = jsonRequest(baseUrl, 'capacity-concurrent-a', '/api/generate', { compile: firstInput, planBinding: firstCompile.value.planBinding, confirmSingleCall: true, apiKey: 'first-one-use-key' })
    await started
    const second = await jsonRequest(baseUrl, 'capacity-concurrent-b', '/api/generate', { compile: secondInput, planBinding: secondCompile.value.planBinding, confirmSingleCall: true, apiKey: 'second-one-use-key' })
    assert.equal(second.status, 503)
    assert.equal(second.value.error, 'PLAYGROUND_RESULT_BYTES_CAPACITY_EXCEEDED')
    assert.equal(calls, 1)
    releaseTransport()
    assert.equal((await firstPending).status, 200)
  })
})

test('Grok allow-listed transport uses JSON data URIs and maps Mock HTTP success/failure safely', async () => {
  const reference = minimalPng()
  const output = minimalPng(96, 96)
  const call: PlaygroundProviderCall = {
    schemaVersion: 'voce.playground-provider-call/v1alpha1', provider: 'grok-imagine', endpoint: 'https://api.x.ai/v1/images/edits', model: 'grok-imagine-image-quality',
    wireFormat: 'xai-image-edits-json', requestHash: sha256({ grok: true }), prompt: 'Preserve the person and edit the clothing.',
    references: [{ assetId: 'person', contentHash: `sha256:${createHash('sha256').update(reference).digest('hex')}`, mediaType: 'image/png', bytes: reference }],
    controls: { output: { dimensions: { width: 2048, height: 1152 } } }, timeoutMs: 10_000,
  }
  let calls = 0
  const transport = new FetchGrokProviderTransport(async (url, init) => {
    calls += 1
    if (calls === 1) {
      assert.equal(String(url), call.endpoint)
      assert.equal(new Headers(init?.headers).get('authorization'), 'Bearer grok-one-use')
        const body = JSON.parse(String(init?.body))
        assert.equal(body.model, call.model); assert.equal(body.n, 1); assert.equal(body.response_format, 'url')
        assert.equal(body.aspect_ratio, '16:9'); assert.equal(body.resolution, '2k')
        assert.match(body.image.url, /^data:image\/png;base64,/)
      return new Response(JSON.stringify({ data: [{ url: 'https://imgen.x.ai/output.png' }] }), { status: 200, headers: { 'x-request-id': 'grok-request-1' } })
    }
    return new Response(output.slice().buffer as ArrayBuffer, { status: 200, headers: { 'content-type': 'image/png' } })
  })
  const result = await transport.send(call, 'grok-one-use')
  assert.equal(calls, 2)
  assert.equal(result.providerRequestId, 'grok-request-1')
  assert.equal(JSON.stringify(result).includes('grok-one-use'), false)
  for (const [status, expected] of [[401, 'GROK_API_KEY_REJECTED'], [429, 'GROK_RATE_OR_QUOTA_LIMITED'], [500, 'GROK_SERVICE_UNAVAILABLE'], [400, 'GROK_REQUEST_REJECTED']] as const) {
    const failing = new FetchGrokProviderTransport(async () => new Response(JSON.stringify({ error: { message: 'private body' } }), { status }))
    let observed: unknown
    try { await failing.send(call, 'private-grok-key') } catch (error) { observed = error }
    assert.equal(grokTransportErrorCode(observed), expected)
    assert.doesNotMatch(String(observed), /private-grok-key|private body/)
  }
  const unsupported = { ...call, controls: { output: { dimensions: { width: 1000, height: 1000 } } } }
  let observed: unknown
  try { await transport.send(unsupported, 'grok-one-use') } catch (error) { observed = error }
  assert.equal(grokTransportErrorCode(observed), 'GROK_OUTPUT_DIMENSIONS_UNSUPPORTED')
  assert.equal(calls, 2)
})

test('session, client, global concurrency, Provider rate, and daily call gates fail closed', () => {
  let now = Date.UTC(2026, 7, 21)
  const gate = new RequestQuotaGate(new InMemoryRequestQuotaStore(), { perSessionCalls: 1, perClientCalls: 2, dailyCalls: 3, maxConcurrent: 1, providerCallsPerMinute: { seedream: 1 }, now: () => now })
  const first = gate.reserve({ sessionId: 's1', clientId: 'c1', provider: 'seedream' })
  assert.throws(() => gate.reserve({ sessionId: 's2', clientId: 'c2', provider: 'seedream' }), /RATE_LIMIT_CONCURRENCY_EXCEEDED/)
  gate.release(first)
  assert.throws(() => gate.reserve({ sessionId: 's1', clientId: 'c1', provider: 'seedream' }), /SESSION_QUOTA_EXCEEDED/)
  assert.throws(() => gate.reserve({ sessionId: 's2', clientId: 'c2', provider: 'seedream' }), /PROVIDER_RATE_LIMIT_EXCEEDED/)
  now += 60_000
  const second = gate.reserve({ sessionId: 's2', clientId: 'c1', provider: 'seedream' }); gate.release(second)
  now += 60_000
  assert.throws(() => gate.reserve({ sessionId: 's3', clientId: 'c1', provider: 'seedream' }), /CLIENT_QUOTA_EXCEEDED/)
  const third = gate.reserve({ sessionId: 's3', clientId: 'c3', provider: 'seedream' }); gate.release(third)
  now += 60_000
  assert.throws(() => gate.reserve({ sessionId: 's4', clientId: 'c4', provider: 'seedream' }), /DAILY_CALL_BUDGET_EXCEEDED/)
})

test('Compile remains available after Generate quota exhaustion and production export is absent', async () => {
  const gate = new RequestQuotaGate(new InMemoryRequestQuotaStore(), { perSessionCalls: 1, perClientCalls: 1, dailyCalls: 1, maxConcurrent: 1, providerCallsPerMinute: { mock: 10 } })
  await withServer({ renderEnabled: true, requestQuotaGate: gate, developmentMode: false, validationExportEnabled: true }, async (baseUrl) => {
    assert.equal((await mockGenerate(baseUrl, 'budget-first')).status, 200)
    const compileInput = await uploadScenario(baseUrl, 'budget-second', 'mock-image')
    const compiled = await jsonRequest(baseUrl, 'budget-second', '/api/compile', compileInput)
    assert.equal(compiled.status, 200)
    const blocked = await jsonRequest(baseUrl, 'budget-second', '/api/generate', { compile: compileInput, planBinding: compiled.value.planBinding, confirmSingleCall: true })
    assert.equal(blocked.status, 429)
    assert.equal(blocked.value.error, 'CLIENT_QUOTA_EXCEEDED')
    const exported = await jsonRequest(baseUrl, 'budget-second', '/api/validation-export', {})
    assert.equal(exported.status, 404)
  })
})
