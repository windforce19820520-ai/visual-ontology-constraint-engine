import type {
  ArtifactHandle,
  AssetSink,
  Budget,
  JsonObject,
  ProviderResponseEnvelope,
  RemoteCallAuthorization,
  StructuralValidationArtifactInput,
  VersionPin,
} from '@voce-engine/contracts'
import {
  computeArtifactBytesHash,
  computeProviderResponseEnvelopeHash,
  createRemoteCallAuthorization,
  sha256,
} from '@voce-engine/core'

export const FIXTURE_M6_ALPHA_PNG = Uint8Array.from([
  137, 80, 78, 71, 13, 10, 26, 10,
  0, 0, 0, 13, 73, 72, 68, 82,
  0, 0, 0, 1, 0, 0, 0, 1,
  8, 6, 0, 0, 0, 31, 21, 196, 137,
])

export const FIXTURE_M6_OPAQUE_PNG = Uint8Array.from([
  137, 80, 78, 71, 13, 10, 26, 10,
  0, 0, 0, 13, 73, 72, 68, 82,
  0, 0, 0, 1, 0, 0, 0, 1,
  8, 2, 0, 0, 0, 144, 119, 83, 222,
])

export const FIXTURE_M6_JPEG = Uint8Array.from([255, 216, 255, 224, 0, 16, 74, 70, 73, 70, 0, 1, 255, 217])

export function fixtureM6Artifact(id: string, bytes: Uint8Array = FIXTURE_M6_OPAQUE_PNG, mediaType = 'image/png', role = 'generated-image'): ArtifactHandle {
  return {
    id,
    storeId: 'm6-fixture-store',
    contentHash: computeArtifactBytesHash(bytes),
    mediaType,
    byteLength: bytes.byteLength,
    role,
    resolverId: 'm6-fixture-resolver',
    availability: 'available',
    retentionClass: 'fixture',
    redactionPolicy: 'safe-hash-only',
  }
}

export class RecordingAssetSink implements AssetSink {
  readonly puts: Array<{ artifact: ArtifactHandle; bytes: Uint8Array }> = []
  readonly remoteUrls: string[] = []
  private readonly remoteBytes = new Map<string, Uint8Array>()

  constructor(remoteOutputs: Record<string, Uint8Array> = {}) {
    for (const [url, bytes] of Object.entries(remoteOutputs)) this.remoteBytes.set(url, new Uint8Array(bytes))
  }

  async put(input: { bytes: Uint8Array; mediaType: string; role: string }): Promise<ArtifactHandle> {
    const bytes = new Uint8Array(input.bytes)
    const artifact = fixtureM6Artifact(`m6-artifact-${this.puts.length + 1}`, bytes, input.mediaType, input.role)
    this.puts.push({ artifact, bytes })
    return { ...artifact }
  }

  async putRemote(input: { url: string; mediaType?: string; role: string }): Promise<ArtifactHandle|undefined> {
    this.remoteUrls.push(input.url)
    const bytes = this.remoteBytes.get(input.url)
    return bytes ? this.put({ bytes, mediaType: input.mediaType ?? 'image/png', role: input.role }) : undefined
  }

  async resolve(handle: ArtifactHandle): Promise<Uint8Array|undefined> {
    const found = this.puts.find((item) => item.artifact.id === handle.id)
    return found ? new Uint8Array(found.bytes) : undefined
  }
}

export function fixtureM6Authorization(input: {
  id?: string
  caseId?: string
  caseRevision?: number
  contextHash?: string
  stepId: string
  purpose: RemoteCallAuthorization['purpose']
  inputHash: string
  artifactHashes?: string[]
  scopeIds?: string[]
  constraintIds?: string[]
  adapter: VersionPin
  profileDigest: string
  destination: string
  region?: string
  dataCategories?: string[]
  budget?: Budget
  modelId?: string
  modelVersion?: string
}): RemoteCallAuthorization {
  const budget = input.budget ?? { schemaVersion: 'voce.budget/v1alpha1', id: `m6-budget-${input.stepId}`, maximumCalls: 1, maximumRetries: 0, timeoutMs: 60_000 }
  return createRemoteCallAuthorization({
    schemaVersion: 'voce.remote-call-authorization/v1alpha1',
    id: input.id ?? `m6-auth-${input.stepId}`,
    caseId: input.caseId ?? 'm6-fixture-case',
    caseRevision: input.caseRevision ?? 1,
    contextHash: input.contextHash ?? sha256({ fixture: 'm6-context' }),
    stepId: input.stepId,
    purpose: input.purpose,
    inputHash: input.inputHash,
    permittedArtifactHashes: [...(input.artifactHashes ?? [])].sort(),
    permittedScopeIds: [...(input.scopeIds ?? [])].sort(),
    constraintIds: [...(input.constraintIds ?? [])].sort(),
    ...(input.modelId === undefined ? {} : { modelId: input.modelId }),
    ...(input.modelVersion === undefined ? {} : { modelVersion: input.modelVersion }),
    adapterId: input.adapter.id,
    adapterDigest: input.adapter.digest,
    profileDigest: input.profileDigest,
    destination: input.destination,
    ...(input.region === undefined ? {} : { region: input.region }),
    dataCategories: [...(input.dataCategories ?? ['image'])].sort(),
    maximumCalls: budget.maximumCalls,
    maximumRetries: budget.maximumRetries,
    ...(budget.maximumBytes === undefined ? {} : { maximumBytes: budget.maximumBytes }),
    timeoutMs: budget.timeoutMs,
    ...(budget.maximumCost === undefined ? {} : { maximumCost: budget.maximumCost }),
    ...(budget.currency === undefined ? {} : { currency: budget.currency }),
    idempotencyKey: `m6-idempotency-${input.stepId}`,
    authority: 'm6-fixture-authority',
    authorizedBy: 'm6-fixture-reviewer',
    authorizedAt: '2026-01-01T00:00:00.000Z',
  })
}

export function fixtureStructuralArtifactInput(id = 'm6-image', bytes = FIXTURE_M6_OPAQUE_PNG, mediaType = 'image/png'): StructuralValidationArtifactInput {
  return { artifact: fixtureM6Artifact(id, bytes, mediaType), bytes: new Uint8Array(bytes) }
}

export function fixtureProviderResponse(requestHash: string, body: JsonObject, status: ProviderResponseEnvelope['status'] = 'succeeded'): ProviderResponseEnvelope {
  const base = { schemaVersion: 'voce.provider-response-envelope/v1alpha1' as const, requestHash, status, outputArtifactIds: [], body }
  return { ...base, responseHash: computeProviderResponseEnvelopeHash(base as unknown as ProviderResponseEnvelope) }
}
