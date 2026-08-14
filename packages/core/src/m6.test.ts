import test from 'node:test'
import assert from 'node:assert/strict'
import type {
  ArtifactHandle,
  AssetSink,
  Budget,
  HumanAcceptanceDecision,
  JsonObject,
  ProviderRequestEnvelope,
  ProviderResponseEnvelope,
  ProviderSubmissionLookup,
  ProviderTransport,
  ProviderTransportContext,
  RemoteCallAuthorization,
  SemanticReviewRequest,
  SemanticReviewReport,
  ExecutionRun,
  StaticTraceReportModel,
  StructuralValidationArtifactInput,
  StructuralValidationInput,
  VersionPin,
} from '@voce/contracts'
import {
  FixtureSemanticReviewer,
  RecordingMockTransport,
  SeedreamAdapter,
  VeImageXBackgroundRemovalAdapter,
  compareSnapshots,
  compileEvaluationReport,
  computeArtifactBytesHash,
  computeProviderResponseEnvelopeHash,
  computeProviderErrorHash,
  computeSemanticReviewFindingHash,
  computeSemanticReviewReportHash,
  computeSemanticReviewRequestHash,
  computeStaticTraceReportModelHash,
  createProviderSubmissionLookup,
  executeSemanticReview,
  createHumanAcceptanceDecision,
  createRemoteCallAuthorization,
  renderStaticTraceReport,
  sha256,
  traceModelFromExecution,
  validateStructuralImage,
} from './index.js'

const ALPHA_PNG = Uint8Array.from([
  137, 80, 78, 71, 13, 10, 26, 10,
  0, 0, 0, 13, 73, 72, 68, 82,
  0, 0, 0, 1, 0, 0, 0, 1,
  8, 6, 0, 0, 0, 31, 21, 196, 137,
])
const OPAQUE_PNG = Uint8Array.from([
  137, 80, 78, 71, 13, 10, 26, 10,
  0, 0, 0, 13, 73, 72, 68, 82,
  0, 0, 0, 1, 0, 0, 0, 1,
  8, 2, 0, 0, 0, 144, 119, 83, 222,
])
const JPEG = Uint8Array.from([255, 216, 255, 224, 0, 16, 74, 70, 73, 70, 0, 1, 255, 217])

const adapter: VersionPin = { id: 'fixture.seedream', version: '1.0.0', digest: sha256({ adapter: 'fixture.seedream' }) }
const profile: VersionPin = { id: 'fixture.seedream.profile', version: '1.0.0', digest: sha256({ profile: 'fixture.seedream.profile' }) }
const postAdapter: VersionPin = { id: 'fixture.veimagex', version: '1.0.0', digest: sha256({ adapter: 'fixture.veimagex' }) }
const postProfile: VersionPin = { id: 'fixture.veimagex.profile', version: '1.0.0', digest: sha256({ profile: 'fixture.veimagex.profile' }) }
const destination = 'https://provider.example.test'
const credential = { ref: 'fixture-credential', value: 'injected-only-secret' }

class TestAssetSink implements AssetSink {
  readonly items: Array<{ artifact: ArtifactHandle; bytes: Uint8Array }> = []

  async put(input: { bytes: Uint8Array; mediaType: string; role: string }): Promise<ArtifactHandle> {
    const bytes = new Uint8Array(input.bytes)
    const artifact: ArtifactHandle = { id: `sink-${this.items.length + 1}`, storeId: 'fixture-sink', contentHash: computeArtifactBytesHash(bytes), mediaType: input.mediaType, byteLength: bytes.byteLength, role: input.role, resolverId: 'fixture-resolver', availability: 'available', retentionClass: 'fixture', redactionPolicy: 'safe-hash-only' }
    this.items.push({ artifact, bytes })
    return { ...artifact }
  }

  async putRemote(): Promise<ArtifactHandle|undefined> { return undefined }
  async resolve(handle: ArtifactHandle): Promise<Uint8Array|undefined> { return this.items.find((item) => item.artifact.id === handle.id)?.bytes }
}

function budget(id: string): Budget { return { schemaVersion: 'voce.budget/v1alpha1', id, maximumCalls: 1, maximumRetries: 0, timeoutMs: 60_000 } }

function auth(input: { stepId: string; purpose: RemoteCallAuthorization['purpose']; inputHash: string; adapter: VersionPin; profileDigest: string; artifactHashes?: string[]; dataCategories?: string[]; id?: string }): RemoteCallAuthorization {
  return createRemoteCallAuthorization({ schemaVersion: 'voce.remote-call-authorization/v1alpha1', id: input.id ?? `auth-${input.stepId}`, caseId: 'm6-case', caseRevision: 1, contextHash: sha256({ fixture: 'm6-context' }), stepId: input.stepId, purpose: input.purpose, inputHash: input.inputHash, permittedArtifactHashes: [...(input.artifactHashes ?? [])].sort(), permittedScopeIds: [], constraintIds: [], ...(input.adapter.id === 'fixture.seedream' ? { modelId: 'fixture-model', modelVersion: '1.0.0' } : {}), adapterId: input.adapter.id, adapterDigest: input.adapter.digest, profileDigest: input.profileDigest, destination, dataCategories: [...(input.dataCategories ?? ['prompt'])].sort(), maximumCalls: 1, maximumRetries: 0, timeoutMs: 60_000, idempotencyKey: `idempotency-${input.stepId}`, authority: 'fixture', authorizedBy: 'fixture-reviewer', authorizedAt: '2026-01-01T00:00:00.000Z' })
}

function response(requestHash: string, body: JsonObject, status: ProviderResponseEnvelope['status'] = 'succeeded'): ProviderResponseEnvelope {
  const base: Omit<ProviderResponseEnvelope, 'responseHash'> = { schemaVersion: 'voce.provider-response-envelope/v1alpha1', requestHash, status, outputArtifactIds: [], body }
  return { ...base, responseHash: computeProviderResponseEnvelopeHash(base as ProviderResponseEnvelope) }
}

function seedreamConfig(transport: RecordingMockTransport, sink: AssetSink) {
  return { endpoint: destination, credentialRef: credential.ref, model: 'fixture-model', modelVersion: '1.0.0', adapter, profile, destination, transport, assetSink: sink }
}

test('Seedream blocks unsupported cardinality, fields, reference count, and transparent conflicts before transport', async () => {
  const transport = new RecordingMockTransport()
  const adapterInstance = new SeedreamAdapter(seedreamConfig(transport, new TestAssetSink()))
  const cases = [
    { prompt: 'x', n: 2 },
    { prompt: 'x', sequential_image_generation: false },
    { prompt: 'x', image_urls: ['x'] },
    { prompt: 'x', image: Array.from({ length: 11 }, () => 'data:image/png;base64,AA==') },
    { prompt: 'x', background: 'transparent' as const, output_format: 'png' as const },
    { prompt: 'x', image: ['a', 'b'], background: 'transparent' as const, output_format: 'png' as const },
    { prompt: 'x', image: 'data:image/jpeg;base64,/9j=', background: 'transparent' as const, output_format: 'jpeg' as const },
  ]
  for (const item of cases) {
    const result = await adapterInstance.generate(item, auth({ stepId: `invalid-${cases.indexOf(item)}`, purpose: 'generation', inputHash: sha256({ index: cases.indexOf(item) }), adapter, profileDigest: profile.digest }), { credential })
    assert.equal(result.status, 'failed')
  }
  assert.equal(transport.calls.length, 0)
})

test('Seedream accepts one Alpha PNG transparent reference and persists URL/base64 output safely', async () => {
  const sink = new TestAssetSink()
  const transport = new RecordingMockTransport()
  const adapterInstance = new SeedreamAdapter(seedreamConfig(transport, sink))
  const input = { prompt: 'transparent product', image: ALPHA_PNG, background: 'transparent' as const, output_format: 'png' as const }
  const authorization = auth({ stepId: 'seedream-valid', purpose: 'generation', inputHash: sha256({ fixture: 'seedream-valid' }), adapter, profileDigest: profile.digest, dataCategories: ['prompt'] })
  transport.enqueue(response('', { data: [{ b64_json: Buffer.from(ALPHA_PNG).toString('base64'), mediaType: 'image/png' }] }))
  const result = await adapterInstance.generate(input, authorization, { credential })
  assert.equal(result.status, 'succeeded')
  assert.equal(result.artifacts.length, 1)
  assert.equal(transport.calls.length, 1)
  assert.equal(result.response.body, undefined)
})

test('missing credential, endpoint, model, or adapter scope fails closed', async () => {
  const transport = new RecordingMockTransport()
  const sink = new TestAssetSink()
  const instance = new SeedreamAdapter(seedreamConfig(transport, sink))
  const authorization = auth({ stepId: 'missing-credential', purpose: 'generation', inputHash: sha256({ fixture: 'missing-credential' }), adapter, profileDigest: profile.digest })
  const result = await instance.generate({ prompt: 'x' }, authorization)
  assert.equal(result.status, 'failed')
  assert.equal(result.failureCode, 'ADAPTER_CREDENTIAL_MISSING')
  assert.equal(transport.calls.length, 0)
  assert.throws(() => new SeedreamAdapter({ ...seedreamConfig(transport, sink), endpoint: '' }), /ADAPTER_ENDPOINT_MISSING/)
  assert.throws(() => new SeedreamAdapter({ ...seedreamConfig(transport, sink), model: '' }), /ADAPTER_MODEL_MISSING/)
})

test('veImageX independently validates Alpha PNG output and lookup never resubmits', async () => {
  const sink = new TestAssetSink()
  const transport = new RecordingMockTransport()
  const instance = new VeImageXBackgroundRemovalAdapter({ endpoint: destination, credentialRef: credential.ref, adapter: postAdapter, profile: postProfile, destination, transport, assetSink: sink })
  const inputArtifact: ArtifactHandle = { id: 'input', storeId: 'fixture', contentHash: computeArtifactBytesHash(ALPHA_PNG), mediaType: 'image/png', byteLength: ALPHA_PNG.length, role: 'source', resolverId: 'fixture', availability: 'available', retentionClass: 'fixture', redactionPolicy: 'safe-hash-only' }
  const input = { artifact: inputArtifact, bytes: ALPHA_PNG }
  const authorization = auth({ stepId: 've-step', purpose: 'postprocessing', inputHash: sha256({ operation: 'background_removal', artifactId: inputArtifact.id, contentHash: inputArtifact.contentHash }), adapter: postAdapter, profileDigest: postProfile.digest, artifactHashes: [inputArtifact.contentHash], dataCategories: ['image'] })
  transport.enqueue(response('', { output: [{ b64_json: Buffer.from(ALPHA_PNG).toString('base64'), mediaType: 'image/png' }] }))
  const result = await instance.process(input, authorization, { credential })
  assert.equal(result.status, 'succeeded')
  assert.equal(transport.calls.length, 1)

  const unknownTransport = new RecordingMockTransport()
  const unknownInstance = new VeImageXBackgroundRemovalAdapter({ endpoint: destination, credentialRef: credential.ref, adapter: postAdapter, profile: postProfile, destination, transport: unknownTransport, assetSink: new TestAssetSink() })
  const unknownAuth = auth({ stepId: 've-unknown', purpose: 'postprocessing', inputHash: authorization.inputHash, adapter: postAdapter, profileDigest: postProfile.digest, artifactHashes: [inputArtifact.contentHash], dataCategories: ['image'] })
  unknownTransport.enqueue(response('', {}, 'processing'))
  const unknown = await unknownInstance.process(input, unknownAuth, { credential })
  assert.equal(unknown.status, 'submission_unknown')
  assert.ok(unknown.lookup)
  unknownTransport.enqueueLookup(response(unknown.lookup!.requestHash, { output: [{ b64_json: Buffer.from(ALPHA_PNG).toString('base64'), mediaType: 'image/png' }] }))
  const reconciled = await unknownInstance.lookup(unknown.lookup!, unknownAuth, { credential })
  assert.equal(reconciled.status, 'succeeded')
  assert.equal(reconciled.artifacts.length, 1)
  assert.equal(unknownTransport.calls.length, 1)
  assert.equal(unknownTransport.lookupCalls.length, 1)
})

test('structural validation is deterministic for PNG/JPEG/WebP, dimensions, Alpha, bytes, availability, and contract', () => {
  const artifact = (id: string, bytes: Uint8Array, mediaType: string, availability: ArtifactHandle['availability'] = 'available'): StructuralValidationArtifactInput => ({ artifact: { id, storeId: 'fixture', contentHash: computeArtifactBytesHash(bytes), mediaType, byteLength: bytes.length, role: 'output', resolverId: 'fixture', availability, retentionClass: 'fixture', redactionPolicy: 'safe-hash-only' }, bytes })
  const valid: StructuralValidationInput = { schemaVersion: 'voce.structural-validation-input/v1alpha1', id: 'structural-valid', artifacts: [artifact('png', ALPHA_PNG, 'image/png')], outputContract: { artifactKind: 'image', dataType: 'image', mediaTypes: ['image/png'], cardinality: { min: 1, max: 1 }, dimensions: { width: 1, height: 1 }, background: 'transparent', allowAlpha: true } }
  const left = validateStructuralImage(valid)
  const right = validateStructuralImage({ ...valid, artifacts: [...valid.artifacts].reverse() })
  assert.equal(left.status, 'needs_review')
  assert.deepEqual(left, right)
  const jpeg = validateStructuralImage({ ...valid, id: 'jpeg', artifacts: [artifact('jpeg', JPEG, 'image/jpeg')], outputContract: { ...valid.outputContract, mediaTypes: ['image/jpeg'], background: 'opaque' } })
  assert.equal(jpeg.status, 'needs_review')
  assert.ok(jpeg.findings.some((item) => item.code === 'DIMENSIONS_UNKNOWN'))
  const mismatch = validateStructuralImage({ ...valid, id: 'opaque', artifacts: [artifact('opaque', OPAQUE_PNG, 'image/png')], outputContract: valid.outputContract })
  assert.equal(mismatch.status, 'failed')
  assert.ok(mismatch.findings.some((item) => item.code === 'ALPHA_REQUIRED'))
  const unavailable = validateStructuralImage({ ...valid, id: 'unavailable', artifacts: [artifact('gone', ALPHA_PNG, 'image/png', 'expired')] })
  assert.equal(unavailable.status, 'failed')
  assert.ok(unavailable.findings.some((item) => item.code === 'ARTIFACT_UNAVAILABLE'))
})

test('semantic review is a separately authorized proposal and does not become technical state', async () => {
  const artifact: ArtifactHandle = { id: 'result', storeId: 'fixture', contentHash: computeArtifactBytesHash(ALPHA_PNG), mediaType: 'image/png', byteLength: ALPHA_PNG.length, role: 'output', resolverId: 'fixture', availability: 'available', retentionClass: 'fixture', redactionPolicy: 'safe-hash-only' }
  const model: VersionPin = { id: 'fixture-model', version: '1.0.0', digest: sha256({ model: 'fixture-model' }) }
  const reviewAuthorization = auth({ stepId: 'review-step', purpose: 'semantic_review', inputHash: sha256({ review: 'input' }), adapter: adapter, profileDigest: profile.digest, artifactHashes: [artifact.contentHash], dataCategories: ['image'], id: 'review-auth' })
  const base: Omit<SemanticReviewRequest, 'requestHash'> = { schemaVersion: 'voce.semantic-review-request/v1alpha1', id: 'review-request', caseId: 'm6-case', caseRevision: 1, contextHash: reviewAuthorization.contextHash, inputHash: reviewAuthorization.inputHash, outputArtifacts: [artifact], criteria: [{ id: 'identity', kind: 'identity_continuity', targetPath: 'person.identity', importance: 'required' }], model, adapter, profile, authorizationId: reviewAuthorization.id, destination, dataCategories: ['image'], budget: budget('review-budget') }
  const request = { ...base, requestHash: computeSemanticReviewRequestHash(base as SemanticReviewRequest) }
  const reviewer = new FixtureSemanticReviewer()
  const report = await reviewer.review(request, reviewAuthorization)
  assert.equal(report.status, 'proposal')
  assert.equal(report.findings[0].proposal, true)
  const execution = await (await import('./m6.js')).executeSemanticReview(reviewer, request, reviewAuthorization)
  assert.equal(execution.remoteCallRun.state, 'succeeded')
  assert.equal(execution.receipt.authorizationId, reviewAuthorization.id)
  await assert.rejects(() => reviewer.review(request, { ...reviewAuthorization, inputHash: sha256({ forged: true }) }), /SEMANTIC_REVIEW_AUTHORIZATION_SCOPE_MISMATCH/)
})

test('evaluation keeps structural, semantic, human, cleanup, and replay layers separate', () => {
  const human = createHumanAcceptanceDecision({ schemaVersion: 'voce.human-acceptance-decision/v1alpha1', id: 'human', runId: 'run', status: 'declined', reviewerId: 'reviewer', decidedAt: '2026-01-01T00:00:00.000Z', reasonCode: 'FIDELITY_NOT_ACCEPTED', annotations: [], artifactIds: ['result'] })
  const report = compileEvaluationReport({ run: { id: 'run', state: 'completed', technicalOutcome: 'succeeded', contextHash: sha256({ context: 'm6' }), pipelinePlanHash: sha256({ plan: 'm6' }) }, humanAcceptance: human, replay: { mode: 'artifact', status: 'unavailable', code: 'ARTIFACT_UNAVAILABLE', artifactIds: ['missing'] }, artifacts: [] })
  assert.equal(report.technicalOutcome, 'succeeded')
  assert.equal(report.technicalStatus, 'passed')
  assert.equal(report.humanAcceptance?.status, 'declined')
  assert.equal(report.status, 'needs_review')
  assert.equal(report.replay.code, 'ARTIFACT_UNAVAILABLE')
})

test('comparison ignores volatile run fields but captures hashes, versions, budgets, destinations, and findings', () => {
  const before = { pipelinePlan: { id: 'plan', runId: 'run-1', at: '2026-01-01', adapterVersion: '1.0.0', planHash: 'sha256:old' }, evaluation: { finding: 'pass', runId: 'run-1' } }
  const after = { pipelinePlan: { id: 'plan', runId: 'run-2', at: '2026-02-01', adapterVersion: '1.0.0', planHash: 'sha256:old' }, evaluation: { finding: 'fail', runId: 'run-2' } }
  const report = compareSnapshots({ caseId: 'case', beforeRevision: 1, afterRevision: 2, before, after })
  assert.equal(report.entries.find((item) => item.category === 'pipelinePlan')?.kind, 'unchanged')
  assert.equal(report.entries.find((item) => item.category === 'evaluation')?.kind, 'changed')
  assert.ok(report.ignoredFields.includes('runId'))
})

test('static report is deterministic, escaped, offline, and redacted', () => {
  const base: Omit<StaticTraceReportModel, 'modelHash'> = { schemaVersion: 'voce.static-trace-report-model/v1alpha1', caseId: 'case-<script>', revision: 1, contextHash: sha256({ context: 'm6' }), steps: [{ id: 'step', type: 'generate', state: 'succeeded', outputHashes: [] }], budgets: [], destinations: ['https://safe.example.test'], receipts: [], cleanup: [], reconciliation: [], artifacts: [], warnings: ['<script>alert(1)</script>', 'Authorization: Bearer secret', 'https://host.test/a?signature=private', 'C:\\Users\\private\\image.png'] }
  const model = { ...base, modelHash: computeStaticTraceReportModelHash(base as StaticTraceReportModel) }
  const left = renderStaticTraceReport(model)
  const right = renderStaticTraceReport(model)
  assert.equal(left.contentHash, right.contentHash)
  assert.equal(left.content, right.content)
  assert.doesNotMatch(left.content, /<script/i)
  assert.doesNotMatch(left.content, /Bearer secret|signature=private|C:\\Users\\private/i)
  assert.doesNotMatch(left.content, /<script>alert/i)
})

test('provider authorization binds purpose, adapter digest, profile, model version, and bounded identity consumption', async () => {
  const transport = new RecordingMockTransport()
  const instance = new SeedreamAdapter(seedreamConfig(transport, new TestAssetSink()))
  const generation = auth({ stepId: 'binding-generation', purpose: 'generation', inputHash: sha256({ binding: 1 }), adapter, profileDigest: profile.digest })
  const request = instance.buildRequest({ prompt: 'binding' }, generation)
  transport.enqueue(response(request.requestHash, {}, 'failed'))
  await transport.send(request, { authorization: generation, credential })
  await assert.rejects(() => transport.send(request, { authorization: generation, credential }), /REMOTE_CALL_BUDGET_EXHAUSTED/)
  const semanticAuth = auth({ stepId: 'binding-semantic', purpose: 'semantic_review', inputHash: sha256({ binding: 2 }), adapter, profileDigest: profile.digest })
  const rejected = await instance.generate({ prompt: 'generation cannot use semantic authorization' }, semanticAuth, { credential })
  assert.equal(rejected.status, 'failed')
  assert.equal(transport.calls.length, 1)
  const lookup = createProviderSubmissionLookup(request, 'provider-request-1')
  assert.equal(lookup.adapterDigest, adapter.digest)
  assert.equal(lookup.purpose, 'generation')
  assert.equal(lookup.modelVersion, '1.0.0')
})

test('provider hashes bind sensitive bytes and URLs without exposing them', async () => {
  const transport = new RecordingMockTransport()
  const instance = new SeedreamAdapter(seedreamConfig(transport, new TestAssetSink()))
  const first = instance.buildRequest({ prompt: 'hash', image: 'data:image/png;base64,AAAA1111' })
  const second = instance.buildRequest({ prompt: 'hash', image: 'data:image/png;base64,BBBB2222' })
  assert.notEqual(first.requestHash, second.requestHash)
  const signedA = instance.buildRequest({ prompt: 'hash', image: 'https://provider.test/image.png?X-Tos-Signature=one' })
  const signedB = instance.buildRequest({ prompt: 'hash', image: 'https://provider.test/image.png?X-Tos-Signature=two' })
  assert.notEqual(signedA.requestHash, signedB.requestHash)
  const responseA = response(first.requestHash, { url: 'https://provider.test/output.png?X-Tos-Signature=one', b64_json: 'A'.repeat(100) })
  const responseB = response(first.requestHash, { url: 'https://provider.test/output.png?X-Tos-Signature=two', b64_json: 'B'.repeat(100) })
  assert.notEqual(responseA.responseHash, responseB.responseHash)
  const error = { schemaVersion: 'voce.provider-error/v1alpha1' as const, code: 'PROVIDER_FAILED', message: 'Authorization: Bearer secret', retryable: false, submissionUnknown: false, safeDetails: { 'X-Tos-Signature': 'secret-token', base64: 'A'.repeat(100) } }
  const errorHash = computeProviderErrorHash({ ...error, errorHash: '' })
  assert.match(errorHash, /^sha256:/)
  const errorAuth = auth({ stepId: 'hash-error', purpose: 'generation', inputHash: sha256({ hashError: 1 }), adapter, profileDigest: profile.digest })
  const errorRequest = instance.buildRequest({ prompt: 'hash-error' }, errorAuth)
  const providerError = { ...error, errorHash: computeProviderErrorHash({ ...error, errorHash: '' }) }
  const failedBase: Omit<ProviderResponseEnvelope, 'responseHash'> = { schemaVersion: 'voce.provider-response-envelope/v1alpha1', requestHash: errorRequest.requestHash, status: 'failed', outputArtifactIds: [], error: providerError }
  transport.enqueue({ ...failedBase, responseHash: computeProviderResponseEnvelopeHash(failedBase as ProviderResponseEnvelope) })
  const failedResult = await instance.generate({ prompt: 'hash-error' }, errorAuth, { credential })
  assert.doesNotMatch(JSON.stringify(failedResult.response), /secret-token|Bearer secret|A{80}/)
  assert.ok(failedResult.response.error)
  assert.equal(computeProviderErrorHash(failedResult.response.error), failedResult.response.error.errorHash)
})

test('Seedream resolves ArtifactHandle bytes and validates endpoint profile and native format', async () => {
  const sink = new TestAssetSink()
  const transport = new RecordingMockTransport()
  const artifactHandle: ArtifactHandle = { id: 'reference-handle', storeId: 'fixture', contentHash: computeArtifactBytesHash(ALPHA_PNG), mediaType: 'image/png', byteLength: ALPHA_PNG.length, role: 'reference', resolverId: 'fixture', availability: 'available', retentionClass: 'fixture', redactionPolicy: 'safe-hash-only' }
  const instance = new SeedreamAdapter(seedreamConfig(transport, sink))
  const request = instance.buildRequest({ prompt: 'artifact', image: artifactHandle, referenceArtifacts: [{ artifact: artifactHandle, bytes: ALPHA_PNG }] }, auth({ stepId: 'artifact-input', purpose: 'generation', inputHash: sha256({ artifact: 1 }), adapter, profileDigest: profile.digest, artifactHashes: [artifactHandle.contentHash], dataCategories: ['prompt', 'reference_image'] }))
  assert.equal(typeof request.payload.image, 'string')
  assert.match(String(request.payload.image), /^data:image\/png;base64,/)
  assert.notEqual(request.payload.image, artifactHandle.id)
  assert.throws(() => new SeedreamAdapter({ ...seedreamConfig(transport, sink), endpointProfile: 'domestic', endpoint: 'https://api.bytepluses.com' }), /ADAPTER_ENDPOINT_PROFILE_MISMATCH/)
  assert.throws(() => new SeedreamAdapter({ ...seedreamConfig(transport, sink), endpointProfile: 'overseas', endpoint: 'https://api.volces.com' }), /ADAPTER_ENDPOINT_PROFILE_MISMATCH/)
  assert.throws(() => new SeedreamAdapter({ ...seedreamConfig(transport, sink), endpoint: 'https://other.example.test' }), /ADAPTER_DESTINATION_ENDPOINT_MISMATCH/)
  const webp = { prompt: 'webp', output_format: 'webp' } as unknown as Parameters<SeedreamAdapter['generate']>[0]
  const result = await instance.generate(webp, auth({ stepId: 'webp', purpose: 'generation', inputHash: sha256({ webp: 1 }), adapter, profileDigest: profile.digest }), { credential })
  assert.equal(result.status, 'failed')
  assert.equal(transport.calls.length, 0)
})

test('Seedream resolver preserves ArtifactHandle authorization and adapters reject forged transport responses', async () => {
  const sink = new TestAssetSink()
  const transport = new RecordingMockTransport()
  const artifactHandle: ArtifactHandle = { id: 'resolver-reference', storeId: 'fixture', contentHash: computeArtifactBytesHash(ALPHA_PNG), mediaType: 'image/png', byteLength: ALPHA_PNG.length, role: 'reference', resolverId: 'fixture', availability: 'available', retentionClass: 'fixture', redactionPolicy: 'safe-hash-only' }
  const instance = new SeedreamAdapter({ ...seedreamConfig(transport, sink), resolver: async (artifact) => artifact.id === artifactHandle.id ? new Uint8Array(ALPHA_PNG) : undefined })
  const authorization = auth({ stepId: 'resolver-input', purpose: 'generation', inputHash: sha256({ resolver: 1 }), adapter, profileDigest: profile.digest, artifactHashes: [artifactHandle.contentHash], dataCategories: ['prompt', 'reference_image'] })
  transport.enqueue(response('', { data: [{ b64_json: Buffer.from(JPEG).toString('base64'), mediaType: 'image/jpeg' }] }))
  const result = await instance.generate({ prompt: 'resolver', image: artifactHandle, output_format: 'jpeg' }, authorization, { credential })
  assert.equal(result.status, 'succeeded')
  assert.equal(transport.calls.length, 1)

  const forgedTransport: ProviderTransport = {
    id: 'forged-response-transport',
    mode: 'offline',
    async send(request: ProviderRequestEnvelope, _context: ProviderTransportContext): Promise<ProviderResponseEnvelope> {
      return { ...response(request.requestHash, { data: [{ b64_json: Buffer.from(JPEG).toString('base64'), mediaType: 'image/jpeg' }] }), responseHash: sha256({ forged: true }) }
    },
    async lookup(_request: ProviderSubmissionLookup, _context: ProviderTransportContext): Promise<ProviderResponseEnvelope> {
      throw new Error('not used')
    },
  }
  const forgedInstance = new SeedreamAdapter({ ...seedreamConfig(new RecordingMockTransport(), new TestAssetSink()), transport: forgedTransport })
  const forgedResult = await forgedInstance.generate({ prompt: 'forged response' }, auth({ stepId: 'forged-response', purpose: 'generation', inputHash: sha256({ forgedResponse: 1 }), adapter, profileDigest: profile.digest }), { credential })
  assert.equal(forgedResult.status, 'failed')
  assert.equal(forgedResult.failureCode, 'PROVIDER_RESPONSE_HASH_MISMATCH')
})

test('lookup reconciliation is original-request bound, bounded, and returns only persisted safe results', async () => {
  const sink = new TestAssetSink()
  const transport = new RecordingMockTransport()
  const instance = new VeImageXBackgroundRemovalAdapter({ endpoint: destination, credentialRef: credential.ref, adapter: postAdapter, profile: postProfile, destination, transport, assetSink: sink })
  const artifact: ArtifactHandle = { id: 'lookup-input', storeId: 'fixture', contentHash: computeArtifactBytesHash(ALPHA_PNG), mediaType: 'image/png', byteLength: ALPHA_PNG.length, role: 'source', resolverId: 'fixture', availability: 'available', retentionClass: 'fixture', redactionPolicy: 'safe-hash-only' }
  const authorization = auth({ stepId: 'lookup-bound', purpose: 'postprocessing', inputHash: sha256({ lookup: 1 }), adapter: postAdapter, profileDigest: postProfile.digest, artifactHashes: [artifact.contentHash], dataCategories: ['image'] })
  transport.enqueue(response('', {}, 'processing'))
  const pending = await instance.process({ artifact, bytes: ALPHA_PNG }, authorization, { credential })
  assert.equal(pending.status, 'submission_unknown')
  assert.ok(pending.lookup)
  const forged = { ...pending.lookup!, purpose: 'generation' as const }
  await assert.rejects(() => instance.lookup(forged, authorization, { credential }), /PROVIDER_LOOKUP_SCOPE_MISMATCH|PROVIDER_LOOKUP_HASH_MISMATCH/)
  transport.enqueueLookup(response(pending.lookup!.requestHash, { output: [{ b64_json: Buffer.from(ALPHA_PNG).toString('base64'), mediaType: 'image/png' }] }))
  const reconciled = await instance.lookup(pending.lookup!, authorization, { credential })
  assert.equal(reconciled.status, 'succeeded')
  assert.equal(reconciled.response.body, undefined)
  const repeated = await instance.lookup(pending.lookup!, authorization, { credential })
  assert.equal(repeated.status, 'failed')
  assert.equal(repeated.failureCode, 'REMOTE_CALL_BUDGET_EXHAUSTED')
})

test('structural validator distinguishes declared media type and visual transparency uncertainty', () => {
  const mismatched = validateStructuralImage({ schemaVersion: 'voce.structural-validation-input/v1alpha1', id: 'declared-mismatch', artifacts: [{ artifact: { ...fixtureArtifactForTest('mismatch', JPEG, 'image/png') }, bytes: JPEG }], outputContract: { artifactKind: 'image', dataType: 'image', mediaTypes: ['image/jpeg'], cardinality: { min: 1, max: 1 }, background: 'opaque', allowAlpha: true } })
  assert.equal(mismatched.status, 'failed')
  assert.ok(mismatched.findings.some((item) => item.code === 'DECLARED_MEDIA_TYPE_SIGNATURE_MISMATCH'))
  const transparent = validateStructuralImage({ schemaVersion: 'voce.structural-validation-input/v1alpha1', id: 'visual-unknown', artifacts: [{ artifact: fixtureArtifactForTest('alpha', ALPHA_PNG, 'image/png'), bytes: ALPHA_PNG }], outputContract: { artifactKind: 'image', dataType: 'image', mediaTypes: ['image/png'], cardinality: { min: 1, max: 1 }, background: 'transparent', allowAlpha: true } })
  assert.equal(transparent.status, 'needs_review')
  assert.ok(transparent.findings.some((item) => item.code === 'BACKGROUND_VISUAL_TRANSPARENCY_UNKNOWN'))
})

function fixtureArtifactForTest(id: string, bytes: Uint8Array, mediaType: string): ArtifactHandle {
  return { id, storeId: 'fixture', contentHash: computeArtifactBytesHash(bytes), mediaType, byteLength: bytes.length, role: 'output', resolverId: 'fixture', availability: 'available', retentionClass: 'fixture', redactionPolicy: 'safe-hash-only' }
}

test('semantic execution rejects forged findings and maps failed or unknown reports to non-success receipts', async () => {
  const artifact = fixtureArtifactForTest('semantic-output', ALPHA_PNG, 'image/png')
  const reviewAuthorization = auth({ stepId: 'semantic-validation', purpose: 'semantic_review', inputHash: sha256({ semantic: 1 }), adapter, profileDigest: profile.digest, artifactHashes: [artifact.contentHash], dataCategories: ['image'] })
  const model: VersionPin = { id: 'fixture-model', version: '1.0.0', digest: sha256({ model: 'fixture-model' }) }
  const base: Omit<SemanticReviewRequest, 'requestHash'> = { schemaVersion: 'voce.semantic-review-request/v1alpha1', id: 'semantic-validation-request', caseId: 'm6-case', caseRevision: 1, contextHash: reviewAuthorization.contextHash, inputHash: reviewAuthorization.inputHash, outputArtifacts: [artifact], criteria: [{ id: 'identity', kind: 'identity_continuity', targetPath: 'person.identity', importance: 'required' }], model, adapter, profile, authorizationId: reviewAuthorization.id, destination, dataCategories: ['image'], budget: budget('semantic-validation-budget') }
  const request = { ...base, requestHash: computeSemanticReviewRequestHash(base as SemanticReviewRequest) }
  const fixture = new FixtureSemanticReviewer()
  const valid = await fixture.review(request, reviewAuthorization)
  await assert.rejects(() => executeSemanticReview({ id: 'third-party-forged-hash', version: adapter, review: async () => ({ ...valid, requestHash: sha256({ forged: true }) }) }, request, reviewAuthorization), /SEMANTIC_REVIEW_REPORT_INVALID/)
  const forgedConfidence = { ...valid, findings: [{ ...valid.findings[0], confidence: 2 }] }
  forgedConfidence.findings[0].findingHash = computeSemanticReviewFindingHash(forgedConfidence.findings[0])
  forgedConfidence.reportHash = computeSemanticReviewReportHash(forgedConfidence)
  await assert.rejects(() => executeSemanticReview({ id: 'third-party-confidence', version: adapter, review: async () => forgedConfidence }, request, reviewAuthorization), /SEMANTIC_REVIEW_CONFIDENCE_INVALID/)
  const forgedEvidence = { ...valid, findings: [{ ...valid.findings[0], evidenceArtifactIds: ['unknown-artifact'] }] }
  forgedEvidence.findings[0].findingHash = computeSemanticReviewFindingHash(forgedEvidence.findings[0])
  forgedEvidence.reportHash = computeSemanticReviewReportHash(forgedEvidence)
  await assert.rejects(() => executeSemanticReview({ id: 'third-party', version: adapter, review: async () => forgedEvidence }, request, reviewAuthorization), /SEMANTIC_REVIEW_EVIDENCE_UNKNOWN/)
  const failed: SemanticReviewReport = { ...valid, status: 'failed', findings: [], reportHash: '' }
  failed.reportHash = computeSemanticReviewReportHash(failed)
  const failedExecution = await executeSemanticReview({ id: 'third-party-failed', version: adapter, review: async () => failed }, request, reviewAuthorization)
  assert.equal(failedExecution.receipt.state, 'failed')
  assert.equal(failedExecution.remoteCallRun.state, 'failed')
  const unknown: SemanticReviewReport = { ...valid, status: 'submission_unknown', findings: [], reportHash: '' }
  unknown.reportHash = computeSemanticReviewReportHash(unknown)
  const unknownExecution = await executeSemanticReview({ id: 'third-party-unknown', version: adapter, review: async () => unknown }, request, reviewAuthorization)
  assert.equal(unknownExecution.receipt.state, 'submission_unknown')
  assert.equal(unknownExecution.remoteCallRun.state, 'submission_unknown')
})

test('comparison preserves prompt and plan order while normalizing declared sets', () => {
  const before = { pipelinePlan: { id: 'plan', steps: [{ id: 'first' }, { id: 'second' }], dataCategories: ['prompt', 'image'] }, promptIR: { id: 'prompt', sections: [{ id: 'subject' }, { id: 'style' }] } }
  const after = { pipelinePlan: { id: 'plan', steps: [{ id: 'second' }, { id: 'first' }], dataCategories: ['image', 'prompt'] }, promptIR: { id: 'prompt', sections: [{ id: 'style' }, { id: 'subject' }] } }
  const report = compareSnapshots({ caseId: 'order', beforeRevision: 1, afterRevision: 2, before, after })
  assert.equal(report.entries.find((item) => item.category === 'pipelinePlan')?.kind, 'changed')
  assert.equal(report.entries.find((item) => item.category === 'promptIR')?.kind, 'changed')
})

test('trace model sanitizes public fields and rejects tampered nested hashes', () => {
  const run = { caseId: 'trace-case', caseRevision: 1, contextHash: sha256({ trace: 1 }), pipelinePlanHash: sha256({ plan: 1 }) } as ExecutionRun
  const model = traceModelFromExecution({ run, receipts: [], cleanup: [], reconciliation: [], warnings: ['Bearer secret', 'https://provider.test/a?X-Tos-Signature=secret', 'C:\\Users\\private\\image.png', 'A'.repeat(100)] })
  assert.doesNotMatch(JSON.stringify(model), /Bearer secret|X-Tos-Signature=secret|C:\\Users\\private|A{80}/i)
  const structural = validateStructuralImage({ schemaVersion: 'voce.structural-validation-input/v1alpha1', id: 'nested', artifacts: [], outputContract: { artifactKind: 'image', dataType: 'image', mediaTypes: ['image/png'], cardinality: { min: 0, max: 0 }, background: 'opaque', allowAlpha: true } })
  assert.throws(() => traceModelFromExecution({ run, receipts: [], cleanup: [], reconciliation: [], structural: { ...structural, status: 'failed' } }), /TRACE_STRUCTURAL_HASH_MISMATCH/)
})
