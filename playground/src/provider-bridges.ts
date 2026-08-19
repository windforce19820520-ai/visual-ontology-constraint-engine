import type { ArtifactHandle, JsonObject, ProviderRenderRequest, ProviderRenderResult } from '@voce-engine/contracts'
import { sha256 } from '@voce-engine/core'
import type { MaterializationResult } from './provider-materializer.js'
import type { PlaygroundProviderProfile, UploadedAssetSummary } from './providers.js'

export interface ResolvedPlaygroundAsset extends UploadedAssetSummary { contentHash: string; bytes: Uint8Array }

/** A deployment-owned transport. No network transport is registered by default. */
export interface PlaygroundProviderTransport {
  readonly provider: 'seedream' | 'grok-imagine'
  send(request: PlaygroundProviderCall, ephemeralApiKey: string): Promise<PlaygroundTransportResult>
}

export interface PlaygroundProviderCall {
  schemaVersion: 'voce.playground-provider-call/v1alpha1'
  provider: 'seedream' | 'grok-imagine'
  endpoint: string
  model: string
  wireFormat: 'seedream-json-data-uri' | 'xai-image-edits-json'
  requestHash: string
  prompt: string
  references: readonly { assetId: string; contentHash: string; mediaType: string; bytes: Uint8Array }[]
  controls: JsonObject
  timeoutMs: number
}

export interface PlaygroundTransportResult {
  providerRequestId?: string
  outputArtifacts: readonly ArtifactHandle[]
  metadata?: JsonObject
}

function safeResultHash(value: Omit<ProviderRenderResult, 'resultHash'>): string {
  return sha256(JSON.parse(JSON.stringify(value)) as never)
}

export function buildProviderCall(input: {
  request: ProviderRenderRequest
  profile: PlaygroundProviderProfile
  materialization: MaterializationResult
  assets: readonly ResolvedPlaygroundAsset[]
}): PlaygroundProviderCall {
  if (input.profile.provider === 'mock') throw new Error('REAL_PROVIDER_PROFILE_REQUIRED')
  const byId = new Map(input.assets.map((asset) => [asset.id, asset]))
  const references = input.materialization.request.references.map((mapping) => {
    const asset = byId.get(mapping.assetId)
    if (!asset || asset.contentHash !== mapping.contentHash) throw new Error(`PROVIDER_ASSET_BINDING_MISMATCH:${mapping.assetId}`)
    return { assetId: asset.id, contentHash: asset.contentHash, mediaType: asset.mediaType, bytes: asset.bytes }
  })
  const acceptedControls: JsonObject = {
    parameters: JSON.parse(JSON.stringify(input.materialization.request.parameters)) as JsonObject,
    output: JSON.parse(JSON.stringify(input.materialization.request.output)) as JsonObject,
  }
  const controls: JsonObject = input.profile.provider === 'seedream'
    ? { count: 1, sequentialImageGeneration: false, responseFormat: 'normalized', ...acceptedControls }
    : { count: 1, responseFormat: 'normalized', ...acceptedControls }
  return {
    schemaVersion: 'voce.playground-provider-call/v1alpha1', provider: input.profile.provider,
    endpoint: input.profile.endpoint, model: input.profile.model,
    wireFormat: input.profile.provider === 'seedream' ? 'seedream-json-data-uri' : 'xai-image-edits-json',
    requestHash: input.request.requestHash, prompt: input.materialization.request.prompt,
    references, controls, timeoutMs: input.profile.timeoutMs,
  }
}

export async function executeProviderCall(input: {
  request: ProviderRenderRequest
  profile: PlaygroundProviderProfile
  materialization: MaterializationResult
  assets: readonly ResolvedPlaygroundAsset[]
  transport: PlaygroundProviderTransport
  ephemeralApiKey: string
}): Promise<ProviderRenderResult> {
  if (input.transport.provider !== input.profile.provider) throw new Error('PROVIDER_TRANSPORT_PROFILE_MISMATCH')
  const call = buildProviderCall(input)
  const transportResult = await input.transport.send(call, input.ephemeralApiKey)
  if (transportResult.providerRequestId === input.ephemeralApiKey) throw new Error('PROVIDER_RESPONSE_CREDENTIAL_ECHOED')
  if (transportResult.providerRequestId !== undefined && (!/^[A-Za-z0-9._:-]{1,200}$/.test(transportResult.providerRequestId))) throw new Error('PROVIDER_REQUEST_ID_INVALID')
  for (const artifact of transportResult.outputArtifacts) {
    if (!/^sha256:[0-9a-f]{64}$/.test(artifact.contentHash) || typeof artifact.byteLength !== 'number' || !Number.isInteger(artifact.byteLength) || artifact.byteLength < 0 || !artifact.mediaType.startsWith('image/') || artifact.availability !== 'available') throw new Error('PROVIDER_OUTPUT_ARTIFACT_INVALID')
  }
  const base: Omit<ProviderRenderResult, 'resultHash'> = {
    schemaVersion: 'voce.provider-render-result/v1alpha1', status: 'ok', requestHash: input.request.requestHash,
    adapterId: input.profile.adapterId,
    adapterVersion: { id: input.profile.adapterId, version: input.profile.version, digest: input.profile.adapterDigest! },
    ...(transportResult.providerRequestId ? { providerRequestId: transportResult.providerRequestId } : {}),
    outputArtifacts: [...transportResult.outputArtifacts],
    // Deployment transports cannot inject arbitrary public metadata. This
    // keeps credentials and raw Provider bodies out of the Host response.
    metadata: { provider: input.profile.provider, outputCount: transportResult.outputArtifacts.length },
  }
  if (base.outputArtifacts.length !== 1) throw new Error('PROVIDER_OUTPUT_CARDINALITY_INVALID')
  return { ...base, resultHash: safeResultHash(base) }
}
