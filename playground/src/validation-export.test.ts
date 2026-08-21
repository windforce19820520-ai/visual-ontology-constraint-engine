import assert from 'node:assert/strict'
import type { AddressInfo } from 'node:net'
import test from 'node:test'
import { sha256 } from '@voce-engine/core'
import { createProviderRequestMaterializer } from './provider-materializer.js'
import { MOCK_PLAYGROUND_PROFILE } from './providers.js'
import { compileSemanticClosure, type PlaygroundScenarioInput } from './semantic-closure.js'
import { createPlaygroundServer } from './server.js'
import { createValidationExportPackage } from './validation-export.js'
import { testBrowserFetch } from './test-browser.js'

function minimalPng(width = 64, height = 96): Uint8Array {
  const bytes = new Uint8Array(24)
  bytes.set([137, 80, 78, 71, 13, 10, 26, 10, 0, 0, 0, 13, 73, 72, 68, 82])
  new DataView(bytes.buffer).setUint32(16, width)
  new DataView(bytes.buffer).setUint32(20, height)
  return bytes
}

function input(): PlaygroundScenarioInput {
  const roles = [{ assetId: 'person', role: 'person-identity' }, { assetId: 'top', role: 'garment-top', typedMetadata: { category: 'shirt' } }]
  return {
    scenarioId: 'virtual-tryon',
    assets: roles.map((role) => ({ id: role.assetId, storeId: 'test', contentHash: sha256({ id: role.assetId }), mediaType: 'image/png', byteLength: 24, role: 'reference-image', resolverId: 'test', availability: 'available', retentionClass: 'request', redactionPolicy: 'safe-hash-only' })),
    declaredRoles: roles,
    compositionSelections: [],
  }
}

function unzipStored(bytes: Uint8Array): Map<string, Uint8Array> {
  const buffer = Buffer.from(bytes)
  const files = new Map<string, Uint8Array>()
  let offset = 0
  while (offset + 4 <= buffer.byteLength && buffer.readUInt32LE(offset) === 0x04034b50) {
    const size = buffer.readUInt32LE(offset + 18)
    const nameLength = buffer.readUInt16LE(offset + 26)
    const extraLength = buffer.readUInt16LE(offset + 28)
    const nameStart = offset + 30
    const contentStart = nameStart + nameLength + extraLength
    const name = buffer.subarray(nameStart, nameStart + nameLength).toString('utf8')
    files.set(name, buffer.subarray(contentStart, contentStart + size))
    offset = contentStart + size
  }
  return files
}

async function withServer<T>(options: Parameters<typeof createPlaygroundServer>[0], action: (baseUrl: string) => Promise<T>): Promise<T> {
  const server = createPlaygroundServer(options)
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
  const port = (server.address() as AddressInfo).port
  try { return await action(`http://127.0.0.1:${port}`) } finally { await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve())) }
}

async function upload(baseUrl: string, session: string, role: string, bytes: Uint8Array): Promise<any> {
  const response = await testBrowserFetch(baseUrl, session, '/api/upload', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ role, mediaType: 'image/png', bytesBase64: Buffer.from(bytes).toString('base64') }) })
  assert.equal(response.status, 200)
  return response.json()
}

test('validation package contains the exact guarded prompt, ordered references, and checklist', () => {
  const scenario = input()
  const result = compileSemanticClosure(scenario, MOCK_PLAYGROUND_PROFILE)
  const materializer = createProviderRequestMaterializer('mock.materializer', '1.0.0', MOCK_PLAYGROUND_PROFILE)
  const materialization = materializer.materialize(result.providerRenderRequest)
  const assets = scenario.assets.map((asset, index) => ({ id: asset.id, contentHash: asset.contentHash, mediaType: asset.mediaType, bytes: minimalPng(64 + index, 96) }))
  const exported = createValidationExportPackage({ scenarioId: scenario.scenarioId, request: result.providerRenderRequest, materialization, assets, compositionSelections: [], evaluationPlan: result.evaluationPlan })
  const files = unzipStored(exported.bytes)
  assert.deepEqual([...files.keys()], ['validation-manifest.json', 'final-prompt.txt', 'references/01-person-identity.png', 'references/02-garment-top.png', 'acceptance-checklist.md'])
  assert.equal(Buffer.from(files.get('final-prompt.txt')!).toString('utf8'), materialization.request.prompt)
  const manifest = JSON.parse(Buffer.from(files.get('validation-manifest.json')!).toString('utf8'))
  assert.equal(manifest.requestHash, result.providerRenderRequest.requestHash)
  assert.equal(manifest.promptHash, result.providerRenderRequest.promptIRHash)
  assert.deepEqual(manifest.referenceMappings.map((item: any) => item.role), ['person-identity', 'garment-top'])
  assert.match(Buffer.from(files.get('acceptance-checklist.md')!).toString('utf8'), /no automatic retry/i)
  assert.doesNotMatch(Buffer.from(exported.bytes).toString('latin1'), /secret-test-key|https?:\/\/|[A-Za-z]:\\/i)
})

test('validation export route is absent unless both development flags are enabled', async () => {
  for (const options of [{}, { developmentMode: true }, { validationExportEnabled: true }]) {
    await withServer(options, async (baseUrl) => {
      const response = await testBrowserFetch(baseUrl, 'disabled-export-session', '/api/validation-export', { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' })
      assert.equal(response.status, 404)
    })
  }
})

test('loopback development export uses the exact compiled binding and performs zero Provider calls', async () => {
  await withServer({ developmentMode: true, validationExportEnabled: true }, async (baseUrl) => {
    const session = 'enabled-export-session'
    const person = await upload(baseUrl, session, 'person-identity', minimalPng())
    const top = await upload(baseUrl, session, 'garment-top', minimalPng(65, 96))
    const compileInput = { scenarioId: 'virtual-tryon', assets: [person.artifact, top.artifact], declaredRoles: [{ assetId: person.artifact.id, role: 'person-identity' }, { assetId: top.artifact.id, role: 'garment-top', typedMetadata: { category: 'shirt' } }], compositionSelections: [], rightsConfirmed: true, providerProfileId: 'mock-image' }
    const compiledResponse = await testBrowserFetch(baseUrl, session, '/api/compile', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(compileInput) })
    assert.equal(compiledResponse.status, 200)
    const compiled = await compiledResponse.json() as any
    const exportResponse = await testBrowserFetch(baseUrl, session, '/api/validation-export', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ compile: compileInput, planBinding: compiled.planBinding, confirmExport: true }) })
    assert.equal(exportResponse.status, 200)
    assert.equal(exportResponse.headers.get('content-type'), 'application/zip')
    const files = unzipStored(new Uint8Array(await exportResponse.arrayBuffer()))
    const manifest = JSON.parse(Buffer.from(files.get('validation-manifest.json')!).toString('utf8'))
    assert.equal(manifest.requestHash, compiled.planBinding.generationRequestHash)
    assert.equal(manifest.referenceMappings.length, 2)
  })
})

test('local validation export remains available when the selected Provider blocks image dimensions', async () => {
  await withServer({ developmentMode: true, validationExportEnabled: true }, async (baseUrl) => {
    const session = 'provider-blocked-export-session'
    const person = await upload(baseUrl, session, 'person-identity', minimalPng(640, 960))
    const top = await upload(baseUrl, session, 'garment-top', minimalPng(641, 960))
    const compileInput = { scenarioId: 'virtual-tryon', assets: [person.artifact, top.artifact], declaredRoles: [{ assetId: person.artifact.id, role: 'person-identity' }, { assetId: top.artifact.id, role: 'garment-top', typedMetadata: { category: 'shirt' } }], compositionSelections: [], rightsConfirmed: true, providerProfileId: 'cloudflare-flux-2-klein-4b' }
    const compiledResponse = await testBrowserFetch(baseUrl, session, '/api/compile', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(compileInput) })
    const compiledText = await compiledResponse.text()
    assert.equal(compiledResponse.status, 200, compiledText)
    const compiled = JSON.parse(compiledText) as any
    assert.equal(compiled.providerCapability.status, 'blocked')
    assert.ok(compiled.providerCapability.reasons.some((reason: string) => reason.startsWith('REFERENCE_WIDTH_')))

    const exportResponse = await testBrowserFetch(baseUrl, session, '/api/validation-export', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ compile: compileInput, planBinding: compiled.planBinding, confirmExport: true }) })
    const exportBytes = new Uint8Array(await exportResponse.arrayBuffer())
    assert.equal(exportResponse.status, 200, Buffer.from(exportBytes).toString('utf8'))
    assert.equal(exportResponse.headers.get('content-type'), 'application/zip')
    const files = unzipStored(exportBytes)
    const manifest = JSON.parse(Buffer.from(files.get('validation-manifest.json')!).toString('utf8'))
    assert.deepEqual(manifest.referenceMappings.map((item: any) => item.role), ['person-identity', 'garment-top'])
  })
})

test('validation package blocks sensitive or persistent URL text before export', () => {
  const scenario = input()
  const result = compileSemanticClosure(scenario, MOCK_PLAYGROUND_PROFILE)
  const materializer = createProviderRequestMaterializer('mock.materializer', '1.0.0', MOCK_PLAYGROUND_PROFILE)
  const materialization = materializer.materialize(result.providerRenderRequest)
  const tamperedRequest = { ...materialization.request, prompt: `${materialization.request.prompt}\nhttps://signed.example/output` }
  const tamperedMaterialization = { ...materialization, request: tamperedRequest, receipt: { ...materialization.receipt, nativeRequestHash: sha256(JSON.parse(JSON.stringify(tamperedRequest))) } }
  const assets = scenario.assets.map((asset) => ({ id: asset.id, contentHash: asset.contentHash, mediaType: asset.mediaType, bytes: minimalPng() }))
  assert.throws(() => createValidationExportPackage({ scenarioId: scenario.scenarioId, request: result.providerRenderRequest, materialization: tamperedMaterialization, assets, compositionSelections: [], evaluationPlan: result.evaluationPlan }), /VALIDATION_EXPORT_SENSITIVE_TEXT_BLOCKED/)
  const sensitiveAssetBytes = Buffer.concat([Buffer.from(minimalPng()), Buffer.from(' api_key=secret-test-key')])
  const sensitiveAssets = assets.map((asset, index) => index === 0 ? { ...asset, bytes: sensitiveAssetBytes } : asset)
  assert.throws(() => createValidationExportPackage({ scenarioId: scenario.scenarioId, request: result.providerRenderRequest, materialization, assets: sensitiveAssets, compositionSelections: [], evaluationPlan: result.evaluationPlan }), /VALIDATION_EXPORT_SENSITIVE_TEXT_BLOCKED/)
})
