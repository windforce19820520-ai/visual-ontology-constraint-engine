import { createHash, randomUUID } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http'
import type { JsonObject, JsonValue } from '@voce-engine/contracts'
import { VISUAL_COMPOSITION_CATALOG, expandVisualCompositionPreset, sha256 } from '@voce-engine/core'
import { compileSemanticClosure, type PlaygroundAssetDeclaration, type PlaygroundScenarioInput } from './semantic-closure.js'
import { scenarioDistribution } from './scenario-distribution.js'
import { createProviderRequestMaterializer, PLAYGROUND_MATERIALIZER_VERSION } from './provider-materializer.js'
import { assertPlaygroundPlanBinding, computeAssetSetHash, createPlaygroundPlanBinding, MockProvider, type PlaygroundPlanBinding } from './mock-provider.js'
import { CloudflareQuotaGate, InMemoryBudgetGate, MOCK_PLAYGROUND_PROFILE, PLAYGROUND_INSPECTION_PROFILE, PLAYGROUND_PROVIDER_PROFILES, estimateCloudflareNeurons, estimateProviderCost, preflightProviderCapability, providerProfileFor, type PlaygroundProviderProfileId, type UploadedAssetSummary } from './providers.js'
import { executeProviderCallDetailed, type PlaygroundProviderTransport, type ResolvedPlaygroundAsset } from './provider-bridges.js'
import { materializationContainsOnlyAcceptedSources } from './provider-materializer.js'
import { cloudflareTransportErrorCode, executeCloudflareProviderCallDetailed, type CloudflareOperatorCredential, type CloudflareProviderTransport } from './cloudflare-provider.js'
import { PLAYGROUND_HTML } from './web.js'
import { createValidationExportPackage } from './validation-export.js'
import { seedreamTransportErrorCode } from './seedream-provider.js'
import { grokTransportErrorCode } from './grok-provider.js'
import { sanitizeImageMetadata } from './image-safety.js'
import { InMemoryRequestQuotaStore, RequestQuotaGate, type RequestQuotaStore } from './quota-store.js'
import { SessionCookieManager, opaqueHash, trustedClientIdentity, type PlaygroundRuntimeLogger } from './runtime-security.js'

export interface PlaygroundCompilePayload extends PlaygroundScenarioInput {
  providerProfileId?: PlaygroundProviderProfileId
  rightsConfirmed?: boolean
}

export interface PlaygroundCompileResponse {
  schemaVersion: 'voce.playground-compile-response/v1alpha1'
  renderEnabled: false
  scenarioId: PlaygroundScenarioInput['scenarioId']
  providerProfile: { id: string; model: string; capabilityStatus: string; documentation: readonly { label: string; url: string }[] }
  providerCapability: ReturnType<typeof preflightProviderCapability>
  humanPlan: ReturnType<typeof compileSemanticClosure>['humanPlan']
  evaluationPlan: ReturnType<typeof compileSemanticClosure>['evaluationPlan']
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
  width: number
  height: number
  expiresAt: number
}

class UploadStore {
  private readonly sessions = new Map<string, Map<string, StoredUpload>>()
  private totalBytes = 0
  constructor(
    private readonly limits: { sessionCount: number; sessionBytes: number; globalCount: number; globalBytes: number },
    private readonly onSizeChange?: (size: number) => void,
  ) {}
  private notify(): void { this.onSizeChange?.(this.size()) }
  size(): number { return [...this.sessions.values()].reduce((sum, session) => sum + session.size, 0) }
  put(sessionId: string, upload: StoredUpload): void {
    const session = this.sessions.get(sessionId) ?? new Map<string, StoredUpload>()
    const replaced = session.get(upload.artifact.id)?.bytes.byteLength ?? 0
    const sessionBytes = [...session.values()].reduce((sum, item) => sum + item.bytes.byteLength, 0) - replaced
    if (!session.has(upload.artifact.id) && session.size >= this.limits.sessionCount) throw new HttpProblem(413, 'PLAYGROUND_SESSION_UPLOAD_COUNT_EXCEEDED')
    if (!session.has(upload.artifact.id) && this.size() >= this.limits.globalCount) throw new HttpProblem(503, 'PLAYGROUND_UPLOAD_COUNT_CAPACITY_EXCEEDED')
    if (sessionBytes + upload.bytes.byteLength > this.limits.sessionBytes) throw new HttpProblem(413, 'PLAYGROUND_SESSION_UPLOAD_BYTES_EXCEEDED')
    if (this.totalBytes - replaced + upload.bytes.byteLength > this.limits.globalBytes) throw new HttpProblem(503, 'PLAYGROUND_UPLOAD_CAPACITY_EXCEEDED')
    session.set(upload.artifact.id, upload)
    this.sessions.set(sessionId, session)
    this.totalBytes = this.totalBytes - replaced + upload.bytes.byteLength
    this.notify()
  }
  get(sessionId: string, assetId: string): StoredUpload | undefined {
    const item = this.sessions.get(sessionId)?.get(assetId)
    if (!item || item.expiresAt < Date.now()) { if (item) this.remove(sessionId, assetId, item); return undefined }
    return item
  }
  private remove(sessionId: string, assetId: string, item: StoredUpload): void { this.sessions.get(sessionId)?.delete(assetId); this.totalBytes = Math.max(0, this.totalBytes - item.bytes.byteLength); if (!this.sessions.get(sessionId)?.size) this.sessions.delete(sessionId); this.notify() }
  clear(sessionId: string): void { const session = this.sessions.get(sessionId); if (session) for (const item of session.values()) this.totalBytes = Math.max(0, this.totalBytes - item.bytes.byteLength); this.sessions.delete(sessionId); this.notify() }
  clearAll(): void { this.sessions.clear(); this.totalBytes = 0; this.notify() }
  sweep(now = Date.now()): void { for (const [sessionId, session] of [...this.sessions]) for (const [assetId, item] of [...session]) if (item.expiresAt < now) this.remove(sessionId, assetId, item) }
}

interface StoredGeneratedImage {
  bytes: Uint8Array
  mediaType: string
  expiresAt: number
}

interface GeneratedCapacityReservation { id: string; sessionId: string; maximumBytes: number }

class GeneratedImageStore {
  private readonly sessions = new Map<string, Map<string, StoredGeneratedImage>>()
  private readonly reservations = new Map<string, GeneratedCapacityReservation>()
  private totalBytes = 0
  private sequence = 0
  constructor(private readonly limits: { sessionCount: number; globalCount: number; globalBytes: number }, private readonly onSizeChange?: (size: number) => void) {}
  size(): number { return [...this.sessions.values()].reduce((sum, session) => sum + session.size, 0) }
  private notify(): void { this.onSizeChange?.(this.size()) }
  reserve(sessionId: string, maximumIncomingBytes: number): GeneratedCapacityReservation {
    const session = this.sessions.get(sessionId)
    const sessionReserved = [...this.reservations.values()].filter((reservation) => reservation.sessionId === sessionId).length
    const reservedBytes = [...this.reservations.values()].reduce((sum, reservation) => sum + reservation.maximumBytes, 0)
    if ((session?.size ?? 0) + sessionReserved >= this.limits.sessionCount) throw new HttpProblem(503, 'PLAYGROUND_RESULT_SESSION_CAPACITY_EXCEEDED')
    if (this.size() + this.reservations.size >= this.limits.globalCount) throw new HttpProblem(503, 'PLAYGROUND_RESULT_COUNT_CAPACITY_EXCEEDED')
    if (this.totalBytes + reservedBytes + maximumIncomingBytes > this.limits.globalBytes) throw new HttpProblem(503, 'PLAYGROUND_RESULT_BYTES_CAPACITY_EXCEEDED')
    const reservation = { id: `generated-capacity-${++this.sequence}`, sessionId, maximumBytes: maximumIncomingBytes }
    this.reservations.set(reservation.id, reservation)
    return reservation
  }
  commit(reservation: GeneratedCapacityReservation, id: string, image: StoredGeneratedImage): void {
    const active = this.reservations.get(reservation.id)
    if (!active || active.sessionId !== reservation.sessionId || image.bytes.byteLength > active.maximumBytes) throw new HttpProblem(503, 'PLAYGROUND_RESULT_RESERVATION_INVALID')
    this.reservations.delete(reservation.id)
    this.put(reservation.sessionId, id, image)
  }
  release(reservation: GeneratedCapacityReservation): void { this.reservations.delete(reservation.id) }
  private put(sessionId: string, id: string, image: StoredGeneratedImage): void {
    const session = this.sessions.get(sessionId) ?? new Map<string, StoredGeneratedImage>()
    const replaced = session.get(id)?.bytes.byteLength ?? 0
    if (!session.has(id) && session.size >= this.limits.sessionCount) throw new HttpProblem(503, 'PLAYGROUND_RESULT_SESSION_CAPACITY_EXCEEDED')
    if (!session.has(id) && this.size() >= this.limits.globalCount) throw new HttpProblem(503, 'PLAYGROUND_RESULT_COUNT_CAPACITY_EXCEEDED')
    if (this.totalBytes - replaced + image.bytes.byteLength > this.limits.globalBytes) throw new HttpProblem(503, 'PLAYGROUND_RESULT_BYTES_CAPACITY_EXCEEDED')
    session.set(id, image)
    this.sessions.set(sessionId, session)
    this.totalBytes = this.totalBytes - replaced + image.bytes.byteLength
    this.notify()
  }
  get(sessionId: string, id: string): StoredGeneratedImage | undefined {
    const image = this.sessions.get(sessionId)?.get(id)
    if (!image || image.expiresAt < Date.now()) { if (image) this.remove(sessionId, id, image); return undefined }
    return image
  }
  private remove(sessionId: string, id: string, image: StoredGeneratedImage): void { this.sessions.get(sessionId)?.delete(id); this.totalBytes = Math.max(0, this.totalBytes - image.bytes.byteLength); if (!this.sessions.get(sessionId)?.size) this.sessions.delete(sessionId); this.notify() }
  clear(sessionId: string): void { const session = this.sessions.get(sessionId); if (session) for (const item of session.values()) this.totalBytes = Math.max(0, this.totalBytes - item.bytes.byteLength); this.sessions.delete(sessionId); for (const [id, reservation] of this.reservations) if (reservation.sessionId === sessionId) this.reservations.delete(id); this.notify() }
  sweep(now = Date.now()): void { for (const [sessionId, session] of [...this.sessions]) for (const [id, image] of [...session]) if (image.expiresAt < now) this.remove(sessionId, id, image) }
  clearAll(): void { this.sessions.clear(); this.reservations.clear(); this.totalBytes = 0; this.notify() }
}

class HttpProblem extends Error {
  constructor(readonly status: number, message: string) { super(message) }
}

function hashBytes(bytes: Uint8Array): string {
  return `sha256:${createHash('sha256').update(bytes).digest('hex')}`
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

function respondZip(response: ServerResponse, bytes: Uint8Array): void {
  response.writeHead(200, { 'content-type': 'application/zip', 'content-disposition': 'attachment; filename="voce-validation-package.zip"', 'content-length': String(bytes.byteLength), 'cache-control': 'no-store', 'x-content-type-options': 'nosniff' })
  response.end(bytes)
}

function respondImage(response: ServerResponse, image: StoredGeneratedImage): void {
  response.writeHead(200, { 'content-type': image.mediaType, 'content-length': String(image.bytes.byteLength), 'cache-control': 'no-store', 'x-content-type-options': 'nosniff' })
  response.end(image.bytes)
}

function isLoopbackAddress(address: string | undefined): boolean {
  return address === '127.0.0.1' || address === '::1' || address === '::ffff:127.0.0.1'
}

const compositionPreviewIds = new Set(VISUAL_COMPOSITION_CATALOG.presets.map((preset) => preset.id))
const compositionPreviewRoot = new URL('../assets/visual-composition/', import.meta.url)

async function respondCompositionPreview(response: ServerResponse, pathname: string): Promise<boolean> {
  const match = /^\/assets\/visual-composition\/([a-z0-9-]+)\.jpg$/.exec(pathname)
  if (!match || !compositionPreviewIds.has(match[1])) return false
  const bytes = await readFile(new URL(`${match[1]}.jpg`, compositionPreviewRoot))
  response.writeHead(200, { 'content-type': 'image/jpeg', 'cache-control': 'public, max-age=3600', 'x-content-type-options': 'nosniff' })
  response.end(bytes)
  return true
}

const safeErrorPrefixes = [
  'PLAYGROUND_', 'PROVIDER_CAPABILITY_BLOCKED', 'PLAN_BINDING_', 'MATERIALIZER_', 'VALIDATION_EXPORT_',
  'EPHEMERAL_', 'RENDER_DISABLED', 'SINGLE_CALL_', 'CLOUDFLARE_', 'SEEDREAM_', 'GROK_',
  'RATE_LIMIT_', 'SESSION_QUOTA_', 'CLIENT_QUOTA_', 'DAILY_', 'PROVIDER_RATE_',
]

function safeErrorCode(error: unknown): string {
  const message = error instanceof Error ? error.message : ''
  if (safeErrorPrefixes.some((prefix) => message.startsWith(prefix)) && /^[A-Za-z0-9_.,:-]{1,500}$/.test(message)) return message
  return 'PLAYGROUND_INTERNAL_ERROR'
}

function errorBody(error: unknown, requestId: string): { error: string; requestId: string; limitReason?: string } {
  const code = safeErrorCode(error)
  const limited = /(?:LIMIT|QUOTA|BUDGET|CAPACITY|CONCURRENCY)/.test(code)
  return { error: code, requestId, ...(limited ? { limitReason: code.split(':')[0] } : {}) }
}

function roleMetadata(scenarioId: 'virtual-tryon' | 'cosplay'): JsonObject {
  const distribution = scenarioDistribution(scenarioId)
  return {
    id: scenarioId,
    capabilities: { composition: distribution.capabilities.composition },
    roleGroups: distribution.roleGroups.map((group) => ({ id: group.id, operator: group.operator, roles: [...group.roles], ...(group.minCount === undefined ? {} : { minCount: group.minCount }), ...(group.maxCount === undefined ? {} : { maxCount: group.maxCount }) })),
    roles: distribution.roles.map((role) => ({ id: role.role, referenceOrder: role.referenceOrder, minCount: role.minCount, maxCount: role.maxCount, ...(role.typedMetadata ? { typedChoices: JSON.parse(JSON.stringify(role.typedMetadata)) as JsonObject } : {}) })).sort((left, right) => Number(left.referenceOrder) - Number(right.referenceOrder)),
  }
}

export function playgroundMeta(options: { renderEnabled?: boolean; transports?: Partial<Record<'cloudflare' | 'seedream' | 'grok-imagine', PlaygroundProviderTransport | CloudflareProviderTransport>>; cloudflareCredential?: CloudflareOperatorCredential; developmentMode?: boolean; validationExportEnabled?: boolean } = {}): JsonObject {
  const enabled = options.renderEnabled === true
  const providerOrder: PlaygroundProviderProfileId[] = ['seedream-5.0-pro', 'grok-imagine-image-quality', 'cloudflare-flux-2-klein-4b', 'mock-image']
  const visibleProfiles = providerOrder.map((id) => PLAYGROUND_PROVIDER_PROFILES[id]).filter((profile) => options.developmentMode === true || profile.provider !== 'mock')
  return {
    schemaVersion: 'voce.playground-meta/v1alpha1',
    renderEnabled: enabled,
    validationExportEnabled: options.developmentMode === true && options.validationExportEnabled === true,
    scenarios: [roleMetadata('virtual-tryon'), roleMetadata('cosplay')],
    providers: visibleProfiles.map((profile) => ({ id: profile.id, label: profile.selectorMetadata?.label ?? (profile.provider === 'mock' ? 'Offline Mock' : profile.model), model: profile.model, credentialMode: profile.credentialMode, ...(profile.maximumReferenceCount === undefined ? {} : { maximumReferenceCount: profile.maximumReferenceCount }), ...(profile.inputDimensionsStrictlyBelow ? { inputDimensionsStrictlyBelow: profile.inputDimensionsStrictlyBelow } : {}), ...(profile.freeQuotaNeuronsPerDay ? { freeQuotaNeuronsPerDay: profile.freeQuotaNeuronsPerDay, freeQuotaResetUtc: profile.freeQuotaResetUtc } : {}), pricePerImage: profile.pricePerImage, priceModel: profile.priceModel, currency: profile.currency, transportEnabled: enabled && (profile.provider === 'mock' ? options.developmentMode === true : options.transports?.[profile.provider] !== undefined && (profile.provider !== 'cloudflare' || options.cloudflareCredential !== undefined)), capabilityVerifiedAt: profile.capabilityVerifiedAt, selectorMetadata: profile.selectorMetadata, documentation: profile.documentation })) as unknown as JsonObject['providers'],
  }
}

export function playgroundCompositionPresets(): JsonObject {
  const candidateValues: JsonValue[] = [...new Set(VISUAL_COMPOSITION_CATALOG.paths.flatMap((path) => path.allowedValues ?? [])), false, true]
  const candidateValuesByInput: Record<string, JsonValue[]> = {
    direction: ['left', 'right', 'forward', 'up', 'down', 'above', 'below', 'surrounding'],
    silhouette: [false, true],
  }
  return {
    schemaVersion: 'voce.playground-composition-presets/v1alpha1',
    catalogHash: VISUAL_COMPOSITION_CATALOG.catalogHash,
    presets: VISUAL_COMPOSITION_CATALOG.presets.map((preset) => ({
      id: preset.id,
      category: preset.category,
      labelKey: preset.labelKey,
      descriptionKey: preset.descriptionKey,
      requiredInputs: preset.requiredInputs ?? [],
      optionalInputs: preset.optionalInputs ?? [],
      inputs: [...(preset.requiredInputs ?? []), ...(preset.optionalInputs ?? [])].map((inputId) => ({
        id: inputId,
        required: (preset.requiredInputs ?? []).includes(inputId),
        options: (candidateValuesByInput[inputId] ?? candidateValues).filter((value) => {
          try { expandVisualCompositionPreset(preset.id, { inputs: { [inputId]: value } }); return true } catch { return false }
        }),
      })),
      compatibilityHints: preset.compatibilityHints ?? [],
    })),
  }
}

function normalizeAssets(body: PlaygroundCompilePayload, store: UploadStore, sessionId?: string): PlaygroundCompilePayload {
  if (!Array.isArray(body.assets) || !Array.isArray(body.declaredRoles)) throw new HttpProblem(400, 'PLAYGROUND_ASSETS_OR_ROLES_INVALID')
  const roleByAsset = new Map(body.declaredRoles.map((declaration) => [declaration.assetId, declaration.role]))
  const assets = body.assets.map((asset) => {
    if (!asset || typeof asset !== 'object' || !asset.id) throw new HttpProblem(400, 'PLAYGROUND_ASSET_INVALID')
    const stored = sessionId ? store.get(sessionId, asset.id) : undefined
    if (sessionId && !stored) throw new HttpProblem(400, `PLAYGROUND_UPLOAD_NOT_FOUND:${asset.id}`)
    if (stored && (stored.artifact.contentHash !== asset.contentHash || stored.artifact.byteLength !== asset.byteLength || stored.artifact.mediaType !== asset.mediaType)) throw new HttpProblem(400, `PLAYGROUND_UPLOAD_BINDING_MISMATCH:${asset.id}`)
    return stored ? { ...stored.artifact, width: stored.width, height: stored.height } as PlaygroundAssetDeclaration : { ...asset, byteLength: asset.byteLength ?? 0, role: asset.role || 'reference-image' } as PlaygroundAssetDeclaration
  })
  const assetIds = new Set(assets.map((asset) => asset.id))
  for (const declaration of body.declaredRoles) if (!assetIds.has(declaration.assetId) || !roleByAsset.has(declaration.assetId)) throw new HttpProblem(400, `PLAYGROUND_ROLE_ASSET_INVALID:${declaration.assetId}`)
  return { ...body, assets }
}

function semanticInput(payload: PlaygroundCompilePayload): PlaygroundScenarioInput {
  return { scenarioId: payload.scenarioId, caseId: payload.caseId, caseRevision: payload.caseRevision, assets: payload.assets, declaredRoles: payload.declaredRoles, compositionSelections: payload.compositionSelections, outputContract: payload.outputContract }
}

function assetSummaries(payload: PlaygroundCompilePayload): UploadedAssetSummary[] {
  return payload.assets.map((asset) => ({ id: asset.id, byteLength: asset.byteLength, mediaType: asset.mediaType,
    role: payload.declaredRoles.find((declaration) => declaration.assetId === asset.id)?.role,
    ...(('width' in asset && typeof asset.width === 'number') ? { width: asset.width } : {}),
    ...(('height' in asset && typeof asset.height === 'number') ? { height: asset.height } : {}) }))
}

export function compilePlayground(payload: PlaygroundCompilePayload): PlaygroundCompileResponse {
  if (payload.rightsConfirmed !== true) throw new HttpProblem(400, 'PLAYGROUND_RIGHTS_CONFIRMATION_REQUIRED')
  const profile = providerProfileFor(payload.providerProfileId ?? 'mock-image')
  // Compile is provider-neutral so users can always inspect the accepted plan.
  // Provider-specific reference limits are a separate Generate preflight.
  const result = compileSemanticClosure(semanticInput(payload), PLAYGROUND_INSPECTION_PROFILE)
  const materializer = createProviderRequestMaterializer(`${profile.provider}.materializer`, PLAYGROUND_MATERIALIZER_VERSION, profile)
  const summaries = assetSummaries(payload)
  const providerCapability = preflightProviderCapability({ request: result.providerRenderRequest, profile, assets: summaries, requireProfileBinding: false, requireAuthorization: false })
  const generationRequestHash = providerCapability.status === 'ok'
    ? compileSemanticClosure(semanticInput(payload), profile).providerRenderRequest.requestHash
    : result.providerRenderRequest.requestHash
  const planBinding = createPlaygroundPlanBinding({ request: result.providerRenderRequest, generationRequestHash, assets: summaries, scenarioDistributionHash: result.seed.declaredRolePlan.distributionHash, profile, materializer, credentialMode: profile.credentialMode })
  return {
    schemaVersion: 'voce.playground-compile-response/v1alpha1',
    renderEnabled: false,
    scenarioId: payload.scenarioId,
    providerProfile: { id: profile.id, model: profile.model, capabilityStatus: providerCapability.status, documentation: profile.documentation },
    providerCapability,
    humanPlan: result.humanPlan,
    evaluationPlan: result.evaluationPlan,
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

function imageDimensions(bytes: Uint8Array, mediaType: string): { width: number; height: number } {
  if (mediaType === 'image/png' && bytes.length >= 24 && String.fromCharCode(...bytes.slice(12, 16)) === 'IHDR') {
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
    return { width: view.getUint32(16), height: view.getUint32(20) }
  }
  if (mediaType === 'image/jpeg') {
    let offset = 2
    while (offset + 8 < bytes.length) {
      if (bytes[offset] !== 0xff) { offset += 1; continue }
      const marker = bytes[offset + 1], length = (bytes[offset + 2] << 8) | bytes[offset + 3]
      if (length < 2) break
      if ([0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcd, 0xce, 0xcf].includes(marker)) return { height: (bytes[offset + 5] << 8) | bytes[offset + 6], width: (bytes[offset + 7] << 8) | bytes[offset + 8] }
      offset += 2 + length
    }
  }
  if (mediaType === 'image/webp' && bytes.length >= 30) {
    const kind = String.fromCharCode(...bytes.slice(12, 16))
    if (kind === 'VP8X') return { width: 1 + bytes[24] + (bytes[25] << 8) + (bytes[26] << 16), height: 1 + bytes[27] + (bytes[28] << 8) + (bytes[29] << 16) }
    if (kind === 'VP8 ' && bytes[23] === 0x9d && bytes[24] === 0x01 && bytes[25] === 0x2a) return { width: (bytes[26] | (bytes[27] << 8)) & 0x3fff, height: (bytes[28] | (bytes[29] << 8)) & 0x3fff }
    if (kind === 'VP8L' && bytes[20] === 0x2f) return { width: 1 + (((bytes[22] & 0x3f) << 8) | bytes[21]), height: 1 + (((bytes[24] & 0x0f) << 10) | (bytes[23] << 2) | ((bytes[22] & 0xc0) >> 6)) }
  }
  throw new HttpProblem(400, 'PLAYGROUND_IMAGE_DIMENSIONS_UNREADABLE')
}

function upload(body: Record<string, unknown>, store: UploadStore, sessionId: string, ttlMs: number): JsonObject {
  const encoded = body.bytesBase64
  const mediaType = body.mediaType
  const role = body.role
  if (typeof encoded !== 'string' || encoded.length % 4 !== 0 || !/^[A-Za-z0-9+/]*={0,2}$/.test(encoded) || typeof mediaType !== 'string' || !['image/png', 'image/jpeg', 'image/webp'].includes(mediaType) || typeof role !== 'string' || !role) throw new HttpProblem(400, 'PLAYGROUND_UPLOAD_INVALID')
  let bytes: Uint8Array
  try { bytes = Uint8Array.from(Buffer.from(encoded, 'base64')) } catch { throw new HttpProblem(400, 'PLAYGROUND_UPLOAD_BASE64_INVALID') }
  if (!bytes.length || bytes.byteLength > 15_000_000) throw new HttpProblem(413, 'PLAYGROUND_UPLOAD_SIZE_INVALID')
  if (!hasImageSignature(bytes, mediaType)) throw new HttpProblem(400, 'PLAYGROUND_IMAGE_SIGNATURE_INVALID')
  bytes = sanitizeImageMetadata(bytes, mediaType)
  const dimensions = imageDimensions(bytes, mediaType)
  if (!dimensions.width || !dimensions.height || dimensions.width > 16_384 || dimensions.height > 16_384) throw new HttpProblem(400, 'PLAYGROUND_IMAGE_DIMENSIONS_INVALID')
  if (dimensions.width * dimensions.height > 40_000_000) throw new HttpProblem(413, 'PLAYGROUND_IMAGE_PIXEL_LIMIT_EXCEEDED')
  const id = `upload-${randomUUID()}`
  const artifact: PlaygroundAssetDeclaration = { id, storeId: 'playground-request', contentHash: hashBytes(bytes), mediaType, byteLength: bytes.byteLength, role: 'reference-image', resolverId: 'playground-request', availability: 'available', retentionClass: 'request', redactionPolicy: 'safe-hash-only', ...(role === 'pose' ? { poseSourceKind: body.poseSourceKind === 'skeleton-image' || body.poseSourceKind === 'action-photo' || body.poseSourceKind === 'pose-sketch' ? body.poseSourceKind : 'pose-sketch' } : {}) }
  store.put(sessionId, { artifact, bytes, ...dimensions, expiresAt: Date.now() + ttlMs })
  return { artifact: artifact as unknown as JsonObject, dimensions }
}

export interface PlaygroundServerOptions {
  renderEnabled?: boolean
  budgetGate?: InMemoryBudgetGate
  transports?: Partial<Record<'cloudflare' | 'seedream' | 'grok-imagine', PlaygroundProviderTransport | CloudflareProviderTransport>>
  cloudflareCredential?: CloudflareOperatorCredential
  cloudflareQuotaGate?: CloudflareQuotaGate
  developmentMode?: boolean
  validationExportEnabled?: boolean
  onUploadStoreSizeChange?: (size: number) => void
  onGeneratedStoreSizeChange?: (size: number) => void
  secureCookies?: boolean
  trustedProxyCidrs?: readonly string[]
  logger?: PlaygroundRuntimeLogger
  requestQuotaStore?: RequestQuotaStore
  requestQuotaGate?: RequestQuotaGate
  requestBodyLimitBytes?: number
  uploadLimits?: Partial<{ sessionCount: number; sessionBytes: number; globalCount: number; globalBytes: number }>
  generatedLimits?: Partial<{ sessionCount: number; globalCount: number; globalBytes: number }>
  generatedTtlMs?: number
  uploadTtlMs?: number
  ready?: () => boolean
}

export function createPlaygroundServer(options: PlaygroundServerOptions = {}): Server {
  const uploadLimits = { sessionCount: 12, sessionBytes: 32_000_000, globalCount: 64, globalBytes: 128_000_000, ...options.uploadLimits }
  const generatedLimits = { sessionCount: 4, globalCount: 32, globalBytes: 128_000_000, ...options.generatedLimits }
  const store = new UploadStore(uploadLimits, options.onUploadStoreSizeChange)
  const generatedStore = new GeneratedImageStore(generatedLimits, options.onGeneratedStoreSizeChange)
  const mock = new MockProvider()
  const budgetGate = options.budgetGate ?? new InMemoryBudgetGate({ dailyCostByCurrency: { USD: 1, CNY: 2 }, perClientCostByCurrency: { USD: 0.25, CNY: 1 }, maxConcurrent: 1 })
  const cloudflareQuotaGate = options.cloudflareQuotaGate ?? new CloudflareQuotaGate()
  const requestQuotaGate = options.requestQuotaGate ?? new RequestQuotaGate(options.requestQuotaStore ?? new InMemoryRequestQuotaStore(), {
    perSessionCalls: 8, perClientCalls: 24, dailyCalls: 100, maxConcurrent: 2,
    providerCallsPerMinute: { seedream: 10, 'grok-imagine': 10, cloudflare: 30, mock: 60 },
  })
  const logger = options.logger ?? { info() {}, error() {} }
  const sessions = new SessionCookieManager(options.secureCookies === true)
  const uploadTtlMs = options.uploadTtlMs ?? 15 * 60_000
  const generatedTtlMs = options.generatedTtlMs ?? 15 * 60_000
  const requestBodyLimitBytes = options.requestBodyLimitBytes ?? 20_100_000
  const sweepTimer = setInterval(() => { store.sweep(); generatedStore.sweep() }, 60_000)
  sweepTimer.unref()
  const server = createServer(async (request, response) => {
    const requestId = randomUUID()
    const startedAt = Date.now()
    response.setHeader('x-request-id', requestId)
    const url = new URL(request.url ?? '/', 'http://playground.local')
    const logFields = { requestId, route: url.pathname.startsWith('/api/generated/') ? '/api/generated/:id' : url.pathname, method: request.method ?? 'UNKNOWN' }
    response.once('finish', () => logger.info('http.request', { ...logFields, status: response.statusCode, durationMs: Date.now() - startedAt }))
    try {
      if (request.method === 'GET' && url.pathname === '/healthz') return respond(response, 200, { status: 'ok' })
      if (request.method === 'GET' && url.pathname === '/readyz') { const ready = options.ready?.() !== false; return respond(response, ready ? 200 : 503, { status: ready ? 'ready' : 'not-ready' }) }
      const sessionId = sessions.resolve(request, response)
      if (request.method === 'GET' && url.pathname === '/playground') return respondHtml(response)
      if (request.method === 'GET' && await respondCompositionPreview(response, url.pathname)) return
      if (request.method === 'GET') {
        const generatedMatch = /^\/api\/generated\/((?:cloudflare|seedream|grok)-[0-9a-f-]{36})$/.exec(url.pathname)
        if (generatedMatch) {
          const image = generatedStore.get(sessionId, generatedMatch[1])
          if (!image) throw new HttpProblem(404, 'PLAYGROUND_GENERATED_IMAGE_NOT_FOUND')
          return respondImage(response, image)
        }
      }
      if (request.method === 'GET' && url.pathname === '/api/meta') return respond(response, 200, playgroundMeta(options))
      if (request.method === 'GET' && url.pathname === '/api/composition-presets') return respond(response, 200, playgroundCompositionPresets())
      if (request.method === 'POST' && url.pathname === '/api/upload') return respond(response, 200, upload(objectBody(await readBody(request, requestBodyLimitBytes)), store, sessionId, uploadTtlMs))
      if (request.method === 'DELETE' && url.pathname === '/api/uploads') { store.clear(sessionId); return respond(response, 200, { status: 'cleared' }) }
      if (request.method === 'DELETE' && url.pathname === '/api/session') { store.clear(sessionId); generatedStore.clear(sessionId); sessions.clear(response); return respond(response, 200, { status: 'cleared' }) }
      if (request.method === 'POST' && url.pathname === '/api/compile') {
        const body = objectBody(await readBody(request, requestBodyLimitBytes)) as unknown as PlaygroundCompilePayload
        return respond(response, 200, compilePlayground(normalizeAssets(body, store, sessionId)))
      }
      if (request.method === 'POST' && url.pathname === '/api/validation-export' && options.developmentMode === true && options.validationExportEnabled === true) {
        if (!isLoopbackAddress(request.socket.remoteAddress)) throw new HttpProblem(403, 'VALIDATION_EXPORT_LOOPBACK_REQUIRED')
        const body = objectBody(await readBody(request, requestBodyLimitBytes))
        if (body.confirmExport !== true) throw new HttpProblem(409, 'VALIDATION_EXPORT_CONFIRMATION_REQUIRED')
        const compileBody = objectBody(body.compile ?? body.input) as unknown as PlaygroundCompilePayload
        const expected = body.planBinding as unknown as PlaygroundPlanBinding
        const normalized = normalizeAssets(compileBody, store, sessionId)
        const compiled = compilePlayground(normalized)
        assertPlaygroundPlanBinding(expected, compiled.planBinding)
        // This local handoff is not a call to the selected production Provider. The exact
        // selected plan is still bound above, then materialized through the bounded offline
        // profile so a Provider-specific size or transport limit cannot block validation.
        const target = compileSemanticClosure(semanticInput(normalized), MOCK_PLAYGROUND_PROFILE)
        const materializer = createProviderRequestMaterializer('mock.materializer', PLAYGROUND_MATERIALIZER_VERSION, MOCK_PLAYGROUND_PROFILE)
        const materialization = materializer.materialize(target.providerRenderRequest)
        if (!materializationContainsOnlyAcceptedSources(materialization)) throw new HttpProblem(409, 'MATERIALIZER_UNTRUSTED_SOURCE')
        const assets = target.providerRenderRequest.referenceMappings.map((mapping) => {
          const item = store.get(sessionId, mapping.assetId)
          if (!item) throw new HttpProblem(400, `PLAYGROUND_UPLOAD_NOT_FOUND:${mapping.assetId}`)
          return { id: mapping.assetId, contentHash: item.artifact.contentHash, mediaType: item.artifact.mediaType, bytes: item.bytes }
        })
        const exported = createValidationExportPackage({ scenarioId: normalized.scenarioId, request: target.providerRenderRequest, materialization, assets, compositionSelections: normalized.compositionSelections ?? [], evaluationPlan: target.evaluationPlan })
        return respondZip(response, exported.bytes)
      }
      if (request.method === 'POST' && url.pathname === '/api/generate') {
        let requestQuotaReservation: ReturnType<RequestQuotaGate['reserve']> | undefined
        let resultCapacityReservation: GeneratedCapacityReservation | undefined
        try {
          const body = objectBody(await readBody(request, requestBodyLimitBytes))
          const compileBody = objectBody(body.compile ?? body.input) as unknown as PlaygroundCompilePayload
          const expected = body.planBinding as unknown as PlaygroundPlanBinding
          const normalized = normalizeAssets(compileBody, store, sessionId)
          const compiled = compilePlayground(normalized)
          assertPlaygroundPlanBinding(expected, compiled.planBinding)
          const profile = providerProfileFor(normalized.providerProfileId ?? 'mock-image')
          const confirmSingleCall = body.confirmSingleCall === true
          let apiKey = typeof body.apiKey === 'string' ? body.apiKey.trim() : ''
          body.apiKey = undefined
          if (apiKey.length > 4096) throw new HttpProblem(400, 'EPHEMERAL_PROVIDER_KEY_INVALID')
          if (profile.credentialMode === 'user_ephemeral' && !apiKey) throw new HttpProblem(400, 'EPHEMERAL_PROVIDER_KEY_REQUIRED')
          if (!options.renderEnabled) throw new HttpProblem(403, 'RENDER_DISABLED')
          if (!confirmSingleCall) throw new HttpProblem(409, 'SINGLE_CALL_CONFIRMATION_REQUIRED')
          if (compiled.providerCapability.status !== 'ok') throw new HttpProblem(409, `PROVIDER_CAPABILITY_BLOCKED:${compiled.providerCapability.reasons.join(',')}`)
          const summaries = assetSummaries(normalized)
          const { clientId, clientHash } = trustedClientIdentity(request, options.trustedProxyCidrs ?? [])
          logger.info('provider.preflight', { requestId, profileId: profile.id, provider: profile.provider, clientHash, sessionHash: opaqueHash('session', sessionId) })
          const target = compileSemanticClosure(semanticInput(normalized), profile)
          if (target.providerRenderRequest.requestHash !== compiled.planBinding.generationRequestHash) throw new HttpProblem(409, 'PLAN_BINDING_GENERATION_REQUEST_MISMATCH')
          const targetCapability = preflightProviderCapability({ request: target.providerRenderRequest, profile, assets: summaries, renderEnabled: true, confirmSingleCall: true })
          if (targetCapability.status !== 'ok') throw new HttpProblem(409, `PROVIDER_CAPABILITY_BLOCKED:${targetCapability.reasons.join(',')}`)
          if (profile.provider !== 'mock') resultCapacityReservation = generatedStore.reserve(sessionId, 50_000_000)
          requestQuotaReservation = requestQuotaGate.reserve({ sessionId: opaqueHash('session', sessionId), clientId, provider: profile.provider })
          if (profile.provider === 'mock') {
            const materializer = createProviderRequestMaterializer('mock.materializer', PLAYGROUND_MATERIALIZER_VERSION, profile)
            const result = await mock.generate({ request: target.providerRenderRequest, profile, materializer, assets: summaries, clientId, renderEnabled: true, confirmSingleCall, credentialMode: profile.credentialMode, budgetGate })
            apiKey = ''
            return respond(response, result.status === 'ok' ? 200 : 409, { schemaVersion: 'voce.playground-generate-response/v1alpha1', renderEnabled: true, result })
          }
          const materializer = createProviderRequestMaterializer(`${profile.provider}.materializer`, PLAYGROUND_MATERIALIZER_VERSION, profile)
          const materialization = materializer.materialize(target.providerRenderRequest)
          if (!materializationContainsOnlyAcceptedSources(materialization)) throw new HttpProblem(409, 'MATERIALIZER_UNTRUSTED_SOURCE')
          const resolved: ResolvedPlaygroundAsset[] = normalized.assets.map((asset) => {
            const item = store.get(sessionId, asset.id)
            if (!item) throw new HttpProblem(400, `PLAYGROUND_UPLOAD_NOT_FOUND:${asset.id}`)
            return { id: asset.id, contentHash: asset.contentHash, byteLength: asset.byteLength, mediaType: asset.mediaType,
              role: normalized.declaredRoles.find((declaration) => declaration.assetId === asset.id)?.role,
              width: item.width, height: item.height, bytes: item.bytes }
          })
          if (profile.provider === 'cloudflare') {
            apiKey = ''
            const credential = options.cloudflareCredential
            if (!credential || !credential.accountId || !credential.apiToken) throw new HttpProblem(503, 'CLOUDFLARE_OPERATOR_CREDENTIAL_UNAVAILABLE')
            const transport = options.transports?.cloudflare
            if (!transport || transport.provider !== 'cloudflare') throw new HttpProblem(503, 'REAL_PROVIDER_TRANSPORT_DISABLED')
            let budgetReservation
            let quotaReservation
            try {
              budgetReservation = budgetGate.reserve(clientId, profile, 0)
              try {
                quotaReservation = cloudflareQuotaGate.reserve(estimateCloudflareNeurons(target.providerRenderRequest, profile))
              } catch (error) {
                if (error instanceof Error && error.message === 'CLOUDFLARE_QUOTA_EXHAUSTED') throw new HttpProblem(429, 'CLOUDFLARE_QUOTA_EXHAUSTED')
                throw error
              }
              let providerResult
              let outputUrl: string | undefined
              try {
                const execution = await executeCloudflareProviderCallDetailed({ request: target.providerRenderRequest, profile, materialization, assets: resolved, transport, credential })
                providerResult = execution.providerResult
                const output = execution.outputAssets[0]
                if (output) {
                  generatedStore.commit(resultCapacityReservation!, output.artifact.id, { bytes: output.bytes, mediaType: output.artifact.mediaType, expiresAt: Date.now() + generatedTtlMs })
                  outputUrl = `/api/generated/${output.artifact.id}`
                }
              } catch (error) {
                throw new HttpProblem(502, cloudflareTransportErrorCode(error))
              }
              const result = { status: 'ok', providerResult, ...(outputUrl ? { outputUrl } : {}), capability: targetCapability, quota: cloudflareQuotaGate.snapshot(), cleanup: { status: 'completed', releasedRequestBuffers: true, releasedCredential: true }, calls: 1, logs: [{ event: 'provider.generate', requestHash: target.providerRenderRequest.requestHash, profileId: profile.id, status: 'succeeded' }] }
              return respond(response, 200, { schemaVersion: 'voce.playground-generate-response/v1alpha1', renderEnabled: true, result })
            } finally {
              apiKey = ''
              if (budgetReservation) budgetGate.release(budgetReservation)
              void quotaReservation
            }
          }
          const transport = options.transports?.[profile.provider]
          if (!transport || transport.provider === 'cloudflare') throw new HttpProblem(503, 'REAL_PROVIDER_TRANSPORT_DISABLED')
          let reservation
          try {
            reservation = budgetGate.reserve(clientId, profile, estimateProviderCost(target.providerRenderRequest, profile))
            let providerResult
            let outputUrl: string | undefined
            try {
              const execution = await executeProviderCallDetailed({ request: target.providerRenderRequest, profile, materialization, assets: resolved, transport, ephemeralApiKey: apiKey })
              providerResult = execution.providerResult
              const output = execution.outputAssets[0]
              if (output) {
                generatedStore.commit(resultCapacityReservation!, output.artifact.id, { bytes: output.bytes, mediaType: output.artifact.mediaType, expiresAt: Date.now() + generatedTtlMs })
                outputUrl = `/api/generated/${output.artifact.id}`
              }
            } catch (error) {
              throw new HttpProblem(502, profile.provider === 'seedream' ? seedreamTransportErrorCode(error) : grokTransportErrorCode(error))
            }
            apiKey = ''
            const result = { status: 'ok', providerResult, ...(outputUrl ? { outputUrl } : {}), capability: targetCapability, cleanup: { status: 'completed', releasedRequestBuffers: true, releasedCredential: true }, calls: 1, logs: [{ event: 'provider.generate', requestHash: target.providerRenderRequest.requestHash, profileId: profile.id, status: 'succeeded' }] }
            return respond(response, 200, { schemaVersion: 'voce.playground-generate-response/v1alpha1', renderEnabled: true, result })
          } finally {
            apiKey = ''
            if (reservation) budgetGate.release(reservation)
          }
        } finally {
          if (requestQuotaReservation) requestQuotaGate.release(requestQuotaReservation)
          if (resultCapacityReservation) generatedStore.release(resultCapacityReservation)
          store.clear(sessionId)
        }
      }
      respond(response, 404, { error: 'PLAYGROUND_ROUTE_NOT_FOUND' })
    } catch (error) {
      const code = safeErrorCode(error)
      const limited = /(?:RATE_LIMIT|QUOTA|BUDGET|CAPACITY|CONCURRENCY)/.test(code)
      const status = error instanceof HttpProblem ? error.status
        : error instanceof Error && error.message === 'PLAN_BINDING_MISMATCH' ? 409
          : limited ? 429
            : code === 'PLAYGROUND_INTERNAL_ERROR' ? 500 : 400
      logger.error('http.error', { ...logFields, status, code })
      respond(response, status, errorBody(error, requestId))
    }
  })
  server.once('close', () => { clearInterval(sweepTimer); store.clearAll(); generatedStore.clearAll() })
  return server
}

export async function startPlaygroundServer(port = Number(process.env.PLAYGROUND_PORT ?? 4173), options: PlaygroundServerOptions = {}, host = '127.0.0.1'): Promise<Server> {
  const server = createPlaygroundServer(options)
  await new Promise<void>((resolve, reject) => {
    const onError = (error: Error): void => reject(error)
    server.once('error', onError)
    server.listen(port, host, () => { server.off('error', onError); resolve() })
  })
  return server
}

export function serverPlanBindingDigest(binding: PlaygroundPlanBinding): string {
  return sha256({ ...binding, bindingHash: undefined } as never)
}

export { computeAssetSetHash }
