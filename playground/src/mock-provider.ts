import type { ArtifactHandle, JsonObject, ProviderRenderRequest, ProviderRenderResult } from '@voce-engine/contracts'
import { computeProviderRenderRequestHash, sha256 } from '@voce-engine/core'
import type { MaterializationResult, ProviderRequestMaterializer } from './provider-materializer.js'
import { materializationContainsOnlyAcceptedSources } from './provider-materializer.js'
import type { CredentialMode, InMemoryBudgetGate, PlaygroundProviderProfile, UploadedAssetSummary } from './providers.js'
import { preflightProviderCapability } from './providers.js'

export interface PlaygroundPlanBinding {
  schemaVersion: 'voce.playground-plan-binding/v1alpha1'
  requestHash: string
  assetSetHash: string
  scenarioDistributionHash: string
  adapterId: string
  adapterDigest: string
  profileId: string
  profileDigest: string
  materializerId: string
  materializerDigest: string
  credentialMode: CredentialMode
  bindingHash: string
}

export interface MockCleanupReceipt {
  status: 'completed' | 'failed'
  releasedRequestBuffers: boolean
  releasedCredential: boolean
  reasonCode?: string
}

export interface MockProviderResult {
  status: 'ok' | 'failed'
  providerResult: ProviderRenderResult
  materialization?: MaterializationResult
  cleanup: MockCleanupReceipt
  capability: ReturnType<typeof preflightProviderCapability>
  calls: number
  logs: readonly JsonObject[]
}

export interface MockGenerateInput {
  request: ProviderRenderRequest
  profile: PlaygroundProviderProfile
  materializer: ProviderRequestMaterializer
  assets: readonly UploadedAssetSummary[]
  clientId: string
  renderEnabled: boolean
  confirmSingleCall: boolean
  credentialMode?: CredentialMode
  budgetGate?: InMemoryBudgetGate
}

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T
}

function resultHash(result: Omit<ProviderRenderResult, 'resultHash'>): string {
  return sha256(JSON.parse(JSON.stringify(result)) as never)
}

function failure(requestHash: string, adapterId: string, adapterDigest: string, profile: PlaygroundProviderProfile, code: string): ProviderRenderResult {
  const base: Omit<ProviderRenderResult, 'resultHash'> = {
    schemaVersion: 'voce.provider-render-result/v1alpha1',
    status: 'failed',
    requestHash,
    adapterId,
    adapterVersion: { id: adapterId, version: profile.version, digest: adapterDigest },
    outputArtifacts: [],
    metadata: { mock: true, failureCode: code },
    failureCode: code,
  }
  return { ...base, resultHash: resultHash(base) }
}

function success(request: ProviderRenderRequest, profile: PlaygroundProviderProfile, materialization: MaterializationResult): ProviderRenderResult {
  const output: ArtifactHandle = {
    id: `mock-output-${request.requestHash.slice(-20)}`,
    storeId: 'playground-mock',
    contentHash: sha256({ requestHash: request.requestHash, materialization: materialization.receipt.receiptHash, attempt: 1 } as never),
    mediaType: 'image/png',
    byteLength: 0,
    role: 'generated-image',
    resolverId: 'playground-mock',
    availability: 'available',
    retentionClass: 'request',
    redactionPolicy: 'safe-hash-only',
  }
  const base: Omit<ProviderRenderResult, 'resultHash'> = {
    schemaVersion: 'voce.provider-render-result/v1alpha1',
    status: 'ok',
    requestHash: request.requestHash,
    adapterId: profile.adapterId,
    adapterVersion: { id: profile.adapterId, version: profile.version, digest: profile.adapterDigest! },
    providerRequestId: `mock-request-${request.requestHash.slice(-20)}`,
    outputArtifacts: [output],
    metadata: { mock: true, generatedImages: 1, materializationReceiptHash: materialization.receipt.receiptHash },
  }
  return { ...base, resultHash: resultHash(base) }
}

function safeLog(event: { event: string; requestHash: string; profileId: string; status: string; code?: string }): JsonObject {
  return { event: event.event, requestHash: event.requestHash, profileId: event.profileId, status: event.status, ...(event.code ? { code: event.code } : {}) }
}

export function computeAssetSetHash(assets: readonly UploadedAssetSummary[]): string {
  return sha256([...assets].map((asset) => ({ id: asset.id, byteLength: asset.byteLength, mediaType: asset.mediaType, role: asset.role })).sort((left, right) => left.id < right.id ? -1 : left.id > right.id ? 1 : 0) as never)
}

export function createPlaygroundPlanBinding(input: {
  request: ProviderRenderRequest
  assets: readonly UploadedAssetSummary[]
  scenarioDistributionHash: string
  profile: PlaygroundProviderProfile
  materializer: ProviderRequestMaterializer
  credentialMode: CredentialMode
}): PlaygroundPlanBinding {
  if (computeProviderRenderRequestHash(input.request) !== input.request.requestHash) throw new Error('PLAN_BINDING_REQUEST_HASH_INVALID')
  const base: Omit<PlaygroundPlanBinding, 'bindingHash'> = {
    schemaVersion: 'voce.playground-plan-binding/v1alpha1',
    requestHash: input.request.requestHash,
    assetSetHash: computeAssetSetHash(input.assets),
    scenarioDistributionHash: input.scenarioDistributionHash,
    adapterId: input.profile.adapterId,
    adapterDigest: input.profile.adapterDigest!,
    profileId: input.profile.id,
    profileDigest: input.profile.profileHash,
    materializerId: input.materializer.id,
    materializerDigest: input.materializer.digest,
    credentialMode: input.credentialMode,
  }
  return { ...base, bindingHash: sha256(JSON.parse(JSON.stringify(base)) as never) }
}

export function assertPlaygroundPlanBinding(expected: PlaygroundPlanBinding, actual: PlaygroundPlanBinding): void {
  const expectedSafe = { ...expected, bindingHash: undefined }
  const actualSafe = { ...actual, bindingHash: undefined }
  if (JSON.stringify(expectedSafe) !== JSON.stringify(actualSafe) || sha256(JSON.parse(JSON.stringify({ ...expected, bindingHash: undefined })) as never) !== expected.bindingHash || sha256(JSON.parse(JSON.stringify({ ...actual, bindingHash: undefined })) as never) !== actual.bindingHash) throw new Error('PLAN_BINDING_MISMATCH')
}

export class MockProvider {
  private callCount = 0

  get calls(): number { return this.callCount }

  async generate(input: MockGenerateInput): Promise<MockProviderResult> {
    if (input.profile.provider !== 'mock') throw new Error('MOCK_PROFILE_REQUIRED')
    if (computeProviderRenderRequestHash(input.request) !== input.request.requestHash) throw new Error('PLAN_BINDING_REQUEST_HASH_INVALID')
    const capability = preflightProviderCapability({ request: input.request, profile: input.profile, assets: input.assets, renderEnabled: input.renderEnabled, confirmSingleCall: input.confirmSingleCall })
    const logs: JsonObject[] = []
    if (capability.status !== 'ok') {
      const code = capability.reasons[0] ?? 'CAPABILITY_PREFLIGHT_BLOCKED'
      logs.push(safeLog({ event: 'mock.preflight', requestHash: input.request.requestHash, profileId: input.profile.id, status: 'blocked', code }))
      return { status: 'failed', providerResult: failure(input.request.requestHash, input.profile.adapterId, input.profile.adapterDigest!, input.profile, code), cleanup: { status: 'completed', releasedRequestBuffers: true, releasedCredential: true, reasonCode: code }, capability, calls: this.callCount, logs }
    }
    let reservation
    try {
      reservation = input.budgetGate?.reserve(input.clientId, input.profile)
    } catch (error) {
      const code = error instanceof Error ? error.message : 'BUDGET_BLOCKED'
      logs.push(safeLog({ event: 'mock.budget', requestHash: input.request.requestHash, profileId: input.profile.id, status: 'blocked', code }))
      return { status: 'failed', providerResult: failure(input.request.requestHash, input.profile.adapterId, input.profile.adapterDigest!, input.profile, code), cleanup: { status: 'completed', releasedRequestBuffers: true, releasedCredential: true, reasonCode: code }, capability, calls: this.callCount, logs }
    }
    try {
      const materialization = input.materializer.materialize(input.request)
      if (!materializationContainsOnlyAcceptedSources(materialization)) throw new Error('MATERIALIZER_UNTRUSTED_SOURCE')
      this.callCount += 1
      logs.push(safeLog({ event: 'mock.generate', requestHash: input.request.requestHash, profileId: input.profile.id, status: 'succeeded' }))
      return { status: 'ok', providerResult: success(input.request, input.profile, materialization), materialization, cleanup: { status: 'completed', releasedRequestBuffers: true, releasedCredential: true }, capability, calls: this.callCount, logs }
    } catch (error) {
      const code = error instanceof Error ? error.message : 'MOCK_PROVIDER_FAILED'
      logs.push(safeLog({ event: 'mock.generate', requestHash: input.request.requestHash, profileId: input.profile.id, status: 'failed', code }))
      return { status: 'failed', providerResult: failure(input.request.requestHash, input.profile.adapterId, input.profile.adapterDigest!, input.profile, code), cleanup: { status: 'completed', releasedRequestBuffers: true, releasedCredential: true, reasonCode: code }, capability, calls: this.callCount, logs }
    } finally {
      if (reservation && input.budgetGate) input.budgetGate.release(reservation)
    }
  }
}
