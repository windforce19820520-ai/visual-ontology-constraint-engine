import { createHash, randomUUID } from 'node:crypto'
import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http'
import type { ArtifactHandle, JsonObject } from '@voce-engine/contracts'
import { VISUAL_COMPOSITION_CATALOG, sha256 } from '@voce-engine/core'
import { compileSemanticClosure, type PlaygroundAssetDeclaration, type PlaygroundScenarioInput } from './semantic-closure.js'
import { scenarioDistribution } from './scenario-distribution.js'
import { createProviderRequestMaterializer } from './provider-materializer.js'
import { assertPlaygroundPlanBinding, computeAssetSetHash, createPlaygroundPlanBinding, MockProvider, type PlaygroundPlanBinding } from './mock-provider.js'
import { InMemoryBudgetGate, PLAYGROUND_PROVIDER_PROFILES, providerProfileFor, type PlaygroundProviderProfile, type PlaygroundProviderProfileId } from './providers.js'
import { PLAYGROUND_HTML } from './web.js'

export interface PlaygroundCompilePayload extends PlaygroundScenarioInput {
  providerProfileId?: PlaygroundProviderProfileId
  rightsConfirmed?: boolean
}

export interface PlaygroundCompileResponse {
  schemaVersion: 'voce.playground-compile-response/v1alpha1'
  renderEnabled: false
  scenarioId: PlaygroundScenarioInput['scenarioId']
  providerProfile: { id: string; model: string; capabilityStatus: string; documentation: readonly { label: string; url: string }[] }
  humanPlan: ReturnType<typeof compileSemanticClosure>['humanPlan']
  constraintIR: ReturnType<typeof compileSemanticClosure>['constraintIR']
  referencePlan: ReturnType<typeof compileSemanticClosure>['referencePlan']
  promptIR: ReturnType<typeof compileSemanticClosure>['promptIR']
  trace: JsonObject
  providerRenderRequest: ReturnType<typeof compileSemanticClosure>['providerRenderRequest']
  planBinding: PlaygroundPlanBinding
}

interface StoredUpload {
  artifact: PlaygroundAssetDeclaration
  bytes: Uint8Array
  expiresAt: number
}

class UploadStore {
  private readonly sessions = new Map<string, Map<string, StoredUpload>>()
  put(sessionId: string, upload: StoredUpload): void {
    const session = this.sessions.get(sessionId) ?? new Map<string, StoredUpload>()
    session.set(upload.artifact.id, upload)
    this.sessions.set(sessionId, session)
  }
  get(sessionId: string, assetId: string): StoredUpload | undefined {
    const item = this.sessions.get(sessionId)?.get(assetId)
    if (!item || item.expiresAt < Date.now()) { this.sessions.get(sessionId)?.delete(assetId); return undefined }
    return item
  }
  clear(sessionId: string): void { this.sessions.delete(sessionId) }
  sweep(now = Date.now()): void { for (const [sessionId, session] of this.sessions) { for (const [assetId, item] of session) if (item.expiresAt < now) session.delete(assetId); if (!session.size) this.sessions.delete(sessionId) } }
}

class HttpProblem extends Error {
  constructor(readonly status: number, message: string) { super(message) }
}

function hashBytes(bytes: Uint8Array): string {
  return `sha256:${createHash('sha256').update(bytes).digest('hex')}`
}

function sessionIdOf(request: IncomingMessage): string {
  const value = request.headers['x-playground-session']
  if (typeof value !== 'string' || !/^[A-Za-z0-9_-]{8,120}$/.test(value)) throw new HttpProblem(400, 'PLAYGROUND_SESSION_REQUIRED')
  return value
}

async function readBody(request: IncomingMessage, maximumBytes = 20_000_000): Promise<unknown> {
  const chunks: Buffer[] = []
  let total = 0
  for await (const chunk of request) {
    const bytes = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)
    total += bytes.byteLength
    if (total > maximumBytes) throw new HttpProblem(413, 'PLAYGROUND_REQUEST_TOO_LARGE')
    chunks.push(bytes)
  }
  try { return JSON.parse(Buffer.concat(chunks).toString('utf8')) as unknown } catch { throw new HttpProblem(400, 'PLAYGROUND_JSON_INVALID') }
}

function objectBody(body: unknown): Record<string, unknown> {
  if (!body || typeof body !== 'object' || Array.isArray(body)) throw new HttpProblem(400, 'PLAYGROUND_BODY_INVALID')
  return body as Record<string, unknown>
}

function respond(response: ServerResponse, status: number, body: unknown): void {
  const text = JSON.stringify(body)
  response.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', 'x-content-type-options': 'nosniff' })
  response.end(text)
}

function respondHtml(response: ServerResponse): void {
  response.writeHead(200, { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store', 'content-security-policy': "default-src 'self'; img-src 'self' blob: data:; style-src 'unsafe-inline'; script-src 'unsafe-inline'" })
  response.end(PLAYGROUND_HTML)
}

function errorBody(error: unknown): { error: string } {
  return { error: error instanceof Error ? error.message : 'PLAYGROUND_REQUEST_FAILED' }
}

function roleMetadata(scenarioId: 'virtual-tryon' | 'cosplay'): JsonObject {
  const distribution = scenarioDistribution(scenarioId)
  return { id: scenarioId, roles: distribution.roles.map((role) => ({ id: role.role, minCount: role.minCount, maxCount: role.maxCount })).sort((left, right) => String(left.id).localeCompare(String(right.id))) }
}

export function playgroundMeta(): JsonObject {
  return {
    schemaVersion: 'voce.playground-meta/v1alpha1',
    renderEnabled: false,
    scenarios: [roleMetadata('virtual-tryon'), roleMetadata('cosplay')],
    providers: Object.values(PLAYGROUND_PROVIDER_PROFILES).map((profile) => ({ id: profile.id, label: profile.provider === 'mock' ? 'Offline Mock' : profile.model, model: profile.model, credentialMode: profile.credentialMode, ...(profile.maximumReferenceCount === undefined ? {} : { maximumReferenceCount: profile.maximumReferenceCount }), pricePerImage: profile.pricePerImage, currency: profile.currency, transportEnabled: false, capabilityVerifiedAt: profile.capabilityVerifiedAt, documentation: profile.documentation })) as unknown as JsonObject['providers'],
  }
}

export function playgroundCompositionPresets(): JsonObject {
  return { schemaVersion: 'voce.playground-composition-presets/v1alpha1', catalogHash: VISUAL_COMPOSITION_CATALOG.catalogHash, presets: VISUAL_COMPOSITION_CATALOG.presets.map((preset) => ({ id: preset.id, category: preset.category, labelKey: preset.labelKey, descriptionKey: preset.descriptionKey, requiredInputs: preset.requiredInputs ?? [], compatibilityHints: preset.compatibilityHints ?? [] })) }
}

function normalizeAssets(body: PlaygroundCompilePayload, store: UploadStore, sessionId?: string): PlaygroundCompilePayload {
  if (!Array.isArray(body.assets) || !Array.isArray(body.declaredRoles)) throw new HttpProblem(400, 'PLAYGROUND_ASSETS_OR_ROLES_INVALID')
  const roleByAsset = new Map(body.declaredRoles.map((declaration) => [declaration.assetId, declaration.role]))
  const assets = body.assets.map((asset) => {
    if (!asset || typeof asset !== 'object' || !asset.id) throw new HttpProblem(400, 'PLAYGROUND_ASSET_INVALID')
    const stored = sessionId ? store.get(sessionId, asset.id) : undefined
    if (sessionId && !stored) throw new HttpProblem(400, `PLAYGROUND_UPLOAD_NOT_FOUND:${asset.id}`)
    if (stored && (stored.artifact.contentHash !== asset.contentHash || stored.artifact.byteLength !== asset.byteLength || stored.artifact.mediaType !== asset.mediaType)) throw new HttpProblem(400, `PLAYGROUND_UPLOAD_BINDING_MISMATCH:${asset.id}`)
    return stored ? stored.artifact : { ...asset, byteLength: asset.byteLength ?? 0, role: asset.role || 'reference-image' } as PlaygroundAssetDeclaration
  })
  for (const declaration of body.declaredRoles) if (!roleByAsset.has(declaration.assetId)) throw new HttpProblem(400, `PLAYGROUND_ROLE_ASSET_INVALID:${declaration.assetId}`)
  return { ...body, assets }
}

export function compilePlayground(payload: PlaygroundCompilePayload): PlaygroundCompileResponse {
  if (payload.rightsConfirmed !== true) throw new HttpProblem(400, 'PLAYGROUND_RIGHTS_CONFIRMATION_REQUIRED')
  const profile = providerProfileFor(payload.providerProfileId ?? 'mock-image')
  const input: PlaygroundScenarioInput = { scenarioId: payload.scenarioId, caseId: payload.caseId, caseRevision: payload.caseRevision, assets: payload.assets, declaredRoles: payload.declaredRoles, compositionSelections: payload.compositionSelections, outputContract: payload.outputContract }
  const result = compileSemanticClosure(input, profile)
  const materializer = createProviderRequestMaterializer(`${profile.provider}.materializer`, '1.0.0', profile)
  const summaries = payload.assets.map((asset) => ({ id: asset.id, byteLength: asset.byteLength, mediaType: asset.mediaType, role: payload.declaredRoles.find((declaration) => declaration.assetId === asset.id)?.role }))
  const planBinding = createPlaygroundPlanBinding({ request: result.providerRenderRequest, assets: summaries, scenarioDistributionHash: result.seed.declaredRolePlan.distributionHash, profile, materializer, credentialMode: profile.credentialMode })
  return {
    schemaVersion: 'voce.playground-compile-response/v1alpha1',
    renderEnabled: false,
    scenarioId: payload.scenarioId,
    providerProfile: { id: profile.id, model: profile.model, capabilityStatus: profile.knownIncompatibilities.length ? 'declared-with-incompatibilities' : 'declared', documentation: profile.documentation },
    humanPlan: result.humanPlan,
    constraintIR: result.constraintIR,
    referencePlan: result.referencePlan,
    promptIR: result.promptIR,
    trace: { schemaVersion: 'voce.playground-trace/v1alpha1', caseId: result.providerRenderRequest.caseId, contextHash: result.providerRenderRequest.contextHash, constraintHash: result.constraintIR.deterministicSignature, referencePlanHash: result.referencePlan.planHash, pipelinePlanHash: result.pipelinePlan.planHash, promptHash: result.promptIR.deterministicSignature, providerRequestHash: result.providerRenderRequest.requestHash, observedFactCount: result.ontologyInstance.facts.length, confirmedSourceBindingCount: result.humanPlan.confirmedSourceBindings.length },
    providerRenderRequest: result.providerRenderRequest,
    planBinding,
  }
}

function hasImageSignature(bytes: Uint8Array, mediaType: string): boolean {
  if (mediaType === 'image/png') return bytes.length >= 8 && [137, 80, 78, 71, 13, 10, 26, 10].every((value, index) => bytes[index] === value)
  if (mediaType === 'image/jpeg') return bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff
  if (mediaType === 'image/webp') return bytes.length >= 12 && String.fromCharCode(...bytes.slice(0, 4)) === 'RIFF' && String.fromCharCode(...bytes.slice(8, 12)) === 'WEBP'
  return false
}

function upload(body: Record<string, unknown>, store: UploadStore, sessionId: string): JsonObject {
  const encoded = body.bytesBase64
  const mediaType = body.mediaType
  const role = body.role
  if (typeof encoded !== 'string' || !/^[A-Za-z0-9+/]*={0,2}$/.test(encoded) || typeof mediaType !== 'string' || !['image/png', 'image/jpeg', 'image/webp'].includes(mediaType) || typeof role !== 'string' || !role) throw new HttpProblem(400, 'PLAYGROUND_UPLOAD_INVALID')
  let bytes: Uint8Array
  try { bytes = Uint8Array.from(Buffer.from(encoded, 'base64')) } catch { throw new HttpProblem(400, 'PLAYGROUND_UPLOAD_BASE64_INVALID') }
  if (!bytes.length || bytes.byteLength > 15_000_000) throw new HttpProblem(413, 'PLAYGROUND_UPLOAD_SIZE_INVALID')
  if (!hasImageSignature(bytes, mediaType)) throw new HttpProblem(400, 'PLAYGROUND_IMAGE_SIGNATURE_INVALID')
  const id = `upload-${randomUUID()}`
  const artifact: PlaygroundAssetDeclaration = { id, storeId: 'playground-request', contentHash: hashBytes(bytes), mediaType, byteLength: bytes.byteLength, role: 'reference-image', resolverId: 'playground-request', availability: 'available', retentionClass: 'request', redactionPolicy: 'safe-hash-only', ...(role === 'pose' ? { poseSourceKind: body.poseSourceKind === 'skeleton-image' || body.poseSourceKind === 'action-photo' || body.poseSourceKind === 'pose-sketch' ? body.poseSourceKind : 'pose-sketch' } : {}) }
  store.put(sessionId, { artifact, bytes, expiresAt: Date.now() + 15 * 60_000 })
  return { artifact: artifact as unknown as JsonObject }
}

export interface PlaygroundServerOptions {
  renderEnabled?: boolean
  budgetGate?: InMemoryBudgetGate
}

export function createPlaygroundServer(options: PlaygroundServerOptions = {}): Server {
  const store = new UploadStore()
  const mock = new MockProvider()
  const budgetGate = options.budgetGate ?? new InMemoryBudgetGate({ dailyCost: 2, perClientCost: 1, maxConcurrent: 1, currency: 'USD' })
  const sweepTimer = setInterval(() => store.sweep(), 60_000)
  sweepTimer.unref()
  return createServer(async (request, response) => {
    try {
      const url = new URL(request.url ?? '/', 'http://playground.local')
      if (request.method === 'GET' && url.pathname === '/playground') return respondHtml(response)
      if (request.method === 'GET' && url.pathname === '/api/meta') return respond(response, 200, playgroundMeta())
      if (request.method === 'GET' && url.pathname === '/api/composition-presets') return respond(response, 200, playgroundCompositionPresets())
      if (request.method === 'POST' && url.pathname === '/api/upload') { const sessionId = sessionIdOf(request); return respond(response, 200, upload(objectBody(await readBody(request)), store, sessionId)) }
      if (request.method === 'POST' && url.pathname === '/api/compile') {
        const sessionId = sessionIdOf(request)
        const body = objectBody(await readBody(request)) as unknown as PlaygroundCompilePayload
        return respond(response, 200, compilePlayground(normalizeAssets(body, store, sessionId)))
      }
      if (request.method === 'POST' && url.pathname === '/api/generate') {
        const sessionId = sessionIdOf(request)
        const body = objectBody(await readBody(request))
        const compileBody = objectBody(body.compile ?? body.input) as unknown as PlaygroundCompilePayload
        const expected = body.planBinding as unknown as PlaygroundPlanBinding
        const normalized = normalizeAssets(compileBody, store, sessionId)
        const compiled = compilePlayground(normalized)
        assertPlaygroundPlanBinding(expected, compiled.planBinding)
        const profile = providerProfileFor(normalized.providerProfileId ?? 'mock-image')
        const confirmSingleCall = body.confirmSingleCall === true
        const ephemeralCredentialPresent = typeof body.apiKey === 'string' && (body.apiKey as string).length > 0
        // Deliberately remove the key before any downstream call; it never enters
        // a plan, receipt, log, or ProviderRenderRequest.
        body.apiKey = undefined
        if (profile.credentialMode === 'user_ephemeral' && !ephemeralCredentialPresent) throw new HttpProblem(400, 'EPHEMERAL_PROVIDER_KEY_REQUIRED')
        if (!options.renderEnabled) throw new HttpProblem(403, 'RENDER_DISABLED')
        if (profile.provider !== 'mock') throw new HttpProblem(503, 'REAL_PROVIDER_TRANSPORT_DISABLED')
        const materializer = createProviderRequestMaterializer(`${profile.provider}.materializer`, '1.0.0', profile)
        const result = await mock.generate({ request: compiled.providerRenderRequest, profile, materializer, assets: normalized.assets.map((asset) => ({ id: asset.id, byteLength: asset.byteLength, mediaType: asset.mediaType, role: normalized.declaredRoles.find((declaration) => declaration.assetId === asset.id)?.role })), clientId: String(request.headers['x-playground-client'] ?? 'anonymous'), renderEnabled: true, confirmSingleCall, credentialMode: profile.credentialMode, budgetGate })
        store.clear(sessionId)
        return respond(response, result.status === 'ok' ? 200 : 409, { schemaVersion: 'voce.playground-generate-response/v1alpha1', renderEnabled: true, result })
      }
      respond(response, 404, { error: 'PLAYGROUND_ROUTE_NOT_FOUND' })
    } catch (error) {
      const status = error instanceof HttpProblem ? error.status : error instanceof Error && error.message === 'PLAN_BINDING_MISMATCH' ? 409 : 400
      respond(response, status, errorBody(error))
    }
  })
}

export async function startPlaygroundServer(port = Number(process.env.PLAYGROUND_PORT ?? 4173), options: PlaygroundServerOptions = {}): Promise<Server> {
  const server = createPlaygroundServer(options)
  await new Promise<void>((resolve) => server.listen(port, '127.0.0.1', resolve))
  return server
}

export function serverPlanBindingDigest(binding: PlaygroundPlanBinding): string {
  return sha256({ ...binding, bindingHash: undefined } as never)
}

export { computeAssetSetHash }
