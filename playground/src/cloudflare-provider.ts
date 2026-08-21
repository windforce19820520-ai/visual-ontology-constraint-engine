import { createHash, randomUUID } from 'node:crypto'
import type { ArtifactHandle, JsonObject, ProviderRenderRequest, ProviderRenderResult } from '@voce-engine/contracts'
import { sha256 } from '@voce-engine/core'
import type { MaterializationResult } from './provider-materializer.js'
import { sanitizeImageMetadata } from './image-safety.js'
import type { PlaygroundProviderProfile } from './providers.js'

export const CLOUDFLARE_ACCOUNT_ID_ENV = 'CLOUDFLARE_ACCOUNT_ID'
export const CLOUDFLARE_API_TOKEN_ENV = 'CLOUDFLARE_API_TOKEN'

/** Deployment-only credential. It is never part of a ProviderRenderRequest or call hash. */
export interface CloudflareOperatorCredential {
  accountId: string
  apiToken: string
}

export interface CloudflareMultipartAsset {
  id: string
  contentHash: string
  byteLength: number
  mediaType: string
  width?: number
  height?: number
  bytes: Uint8Array
}

export interface CloudflareMultipartPart {
  name: 'prompt' | 'width' | 'height' | 'guidance' | 'seed' | `input_image_${0 | 1 | 2 | 3}`
  kind: 'text' | 'binary'
  value: string | Uint8Array
  mediaType?: string
}

export interface CloudflareMultipartCall {
  schemaVersion: 'voce.playground-cloudflare-multipart-call/v1alpha1'
  provider: 'cloudflare'
  model: string
  /** This is a public endpoint template; accountId is injected only by the transport. */
  endpointTemplate: string
  wireFormat: 'multipart/form-data'
  requestHash: string
  prompt: string
  parts: readonly CloudflareMultipartPart[]
  references: readonly { assetId: string; contentHash: string; providerField: `input_image_${0 | 1 | 2 | 3}`; order: number }[]
  controls: JsonObject
  timeoutMs: number
}

export interface CloudflareProviderTransport {
  readonly provider: 'cloudflare'
  send(call: CloudflareMultipartCall, credential: CloudflareOperatorCredential): Promise<CloudflareTransportResult>
}

export interface CloudflareTransportResult {
  providerRequestId?: string
  outputArtifacts: readonly ArtifactHandle[]
  /** Trusted-host payload. executeCloudflareProviderCall omits it from the public receipt. */
  outputAssets?: readonly CloudflareGeneratedOutput[]
  metadata?: JsonObject
}

export interface CloudflareGeneratedOutput {
  artifact: ArtifactHandle
  bytes: Uint8Array
}

export interface CloudflareExecutionResult {
  providerResult: ProviderRenderResult
  outputAssets: readonly CloudflareGeneratedOutput[]
}

export interface CloudflareTransportErrorShape {
  status?: number
  code?: string | number
  errors?: readonly { code?: string | number }[]
}

function clone<T>(value: T): T { return JSON.parse(JSON.stringify(value)) as T }

function safeResultHash(value: Omit<ProviderRenderResult, 'resultHash'>): string {
  return sha256(JSON.parse(JSON.stringify(value)) as never)
}

export function endpointFor(accountId: string, model: string): string {
  if (!/^[A-Za-z0-9_-]{1,120}$/.test(accountId)) throw new Error('CLOUDFLARE_OPERATOR_CREDENTIAL_INVALID')
  if (model !== '@cf/black-forest-labs/flux-2-klein-4b') throw new Error('CLOUDFLARE_MODEL_NOT_ALLOW_LISTED')
  return `https://api.cloudflare.com/client/v4/accounts/${accountId}/ai/run/${model}`
}

interface CloudflareEnvelope {
  success?: boolean
  result?: { image?: string }
  errors?: readonly { code?: string | number; message?: string }[]
}

class CloudflareHttpError extends Error implements CloudflareTransportErrorShape {
  constructor(readonly status: number, readonly errors: readonly { code?: string | number }[] = []) {
    super('CLOUDFLARE_HTTP_REQUEST_FAILED')
  }
}

function imageMediaType(bytes: Uint8Array): string | undefined {
  if (bytes.length >= 8 && bytes[0] === 137 && bytes[1] === 80 && bytes[2] === 78 && bytes[3] === 71 && bytes[4] === 13 && bytes[5] === 10 && bytes[6] === 26 && bytes[7] === 10) return 'image/png'
  if (bytes.length >= 3 && bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255) return 'image/jpeg'
  if (bytes.length >= 12 && Buffer.from(bytes.subarray(0, 4)).toString('ascii') === 'RIFF' && Buffer.from(bytes.subarray(8, 12)).toString('ascii') === 'WEBP') return 'image/webp'
  return undefined
}

function decodeCloudflareImage(value: string): { bytes: Uint8Array; mediaType: string } {
  const match = /^data:(image\/(?:png|jpeg|webp));base64,(.+)$/s.exec(value)
  const encoded = match ? match[2] : value
  if (!encoded || encoded.length % 4 !== 0 || !/^[A-Za-z0-9+/]*={0,2}$/.test(encoded)) throw new Error('CLOUDFLARE_RESPONSE_IMAGE_INVALID')
  const bytes = Uint8Array.from(Buffer.from(encoded, 'base64'))
  if (!bytes.length || bytes.byteLength > 50_000_000) throw new Error('CLOUDFLARE_RESPONSE_IMAGE_INVALID')
  const detected = imageMediaType(bytes)
  if (!detected || (match && match[1] !== detected)) throw new Error('CLOUDFLARE_RESPONSE_IMAGE_INVALID')
  return { bytes, mediaType: detected }
}

/** Real server-side Workers AI transport. Credentials stay in the host process. */
export class FetchCloudflareProviderTransport implements CloudflareProviderTransport {
  readonly provider = 'cloudflare' as const
  constructor(private readonly fetchImpl: typeof fetch = fetch) {}

  async send(call: CloudflareMultipartCall, credential: CloudflareOperatorCredential): Promise<CloudflareTransportResult> {
    if (!credential.apiToken || credential.apiToken.length > 4096) throw new Error('CLOUDFLARE_OPERATOR_CREDENTIAL_INVALID')
    const form = new FormData()
    for (const part of call.parts) {
      if (part.kind === 'text') {
        if (typeof part.value !== 'string') throw new Error('CLOUDFLARE_MULTIPART_PART_INVALID')
        form.append(part.name, part.value)
      } else {
        if (!(part.value instanceof Uint8Array) || !part.mediaType?.startsWith('image/')) throw new Error('CLOUDFLARE_MULTIPART_PART_INVALID')
        const extension = part.mediaType === 'image/jpeg' ? 'jpg' : part.mediaType === 'image/webp' ? 'webp' : 'png'
        const blobBytes = part.value.slice().buffer as ArrayBuffer
        form.append(part.name, new Blob([blobBytes], { type: part.mediaType }), `${part.name}.${extension}`)
      }
    }
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), call.timeoutMs)
    let response: Response
    try {
      response = await this.fetchImpl(endpointFor(credential.accountId, call.model), {
        method: 'POST', headers: { authorization: `Bearer ${credential.apiToken}` }, body: form, signal: controller.signal,
      })
    } catch {
      throw new Error('CLOUDFLARE_HTTP_REQUEST_FAILED')
    } finally {
      clearTimeout(timer)
    }
    let envelope: CloudflareEnvelope
    try { envelope = await response.json() as CloudflareEnvelope } catch { throw new CloudflareHttpError(response.status) }
    if (!response.ok || envelope.success === false) throw new CloudflareHttpError(response.status, (envelope.errors ?? []).map(({ code }) => ({ code })))
    if (typeof envelope.result?.image !== 'string') throw new Error('CLOUDFLARE_RESPONSE_IMAGE_MISSING')
    const decoded = decodeCloudflareImage(envelope.result.image)
    const output = { ...decoded, bytes: sanitizeImageMetadata(decoded.bytes, decoded.mediaType) }
    const contentHash = `sha256:${createHash('sha256').update(output.bytes).digest('hex')}`
    const artifact: ArtifactHandle = {
      id: `cloudflare-${randomUUID()}`, storeId: 'playground-generated', contentHash, mediaType: output.mediaType,
      byteLength: output.bytes.byteLength, role: 'generated-image', resolverId: 'playground-generated', availability: 'available',
      retentionClass: 'request', redactionPolicy: 'safe-hash-only',
    }
    const requestId = response.headers.get('cf-ray') ?? undefined
    return { ...(requestId && /^[A-Za-z0-9._:-]{1,200}$/.test(requestId) ? { providerRequestId: requestId } : {}), outputArtifacts: [artifact], outputAssets: [{ artifact, bytes: output.bytes }] }
  }
}

function parameterText(name: string, value: unknown): string {
  if (name === 'width' || name === 'height' || name === 'seed') {
    if (!Number.isInteger(value)) throw new Error(`CLOUDFLARE_PARAMETER_INVALID:${name}`)
  } else if (name === 'guidance' && (typeof value !== 'number' || !Number.isFinite(value))) {
    throw new Error('CLOUDFLARE_PARAMETER_INVALID:guidance')
  }
  if (typeof value !== 'string' && typeof value !== 'number') throw new Error(`CLOUDFLARE_PARAMETER_INVALID:${name}`)
  return String(value)
}

/** Mechanical projection of the Guard-accepted request into Cloudflare's multipart fields. */
export function buildCloudflareProviderCall(input: {
  request: ProviderRenderRequest
  profile: PlaygroundProviderProfile
  materialization: MaterializationResult
  assets: readonly CloudflareMultipartAsset[]
}): CloudflareMultipartCall {
  if (input.profile.provider !== 'cloudflare') throw new Error('CLOUDFLARE_PROFILE_REQUIRED')
  if (input.profile.id !== 'cloudflare-flux-2-klein-4b') throw new Error('CLOUDFLARE_PROFILE_NOT_ALLOW_LISTED')
  const byId = new Map(input.assets.map((asset) => [asset.id, asset]))
  const mappings = [...input.materialization.request.references].sort((left, right) => left.order - right.order || left.assetId.localeCompare(right.assetId))
  if (mappings.length > 4) throw new Error('CLOUDFLARE_REFERENCE_COUNT_EXCEEDED')
  const parts: CloudflareMultipartPart[] = [{ name: 'prompt', kind: 'text', value: input.materialization.request.prompt }]
  const parameterEntries = Object.entries(input.materialization.request.parameters).sort(([left], [right]) => left.localeCompare(right))
  const supportedParameters = new Set(['width', 'height', 'guidance', 'seed'])
  for (const [name, value] of parameterEntries) {
    if (!supportedParameters.has(name)) {
      // output media type, alpha and count are retained in controls/receipt but
      // are not silently invented as unsupported Cloudflare wire fields.
      if (name === 'mediaType' || name === 'allowAlpha' || name === 'background' || name === 'maxBytes' || name === 'count') continue
      throw new Error(`CLOUDFLARE_PARAMETER_UNSUPPORTED:${name}`)
    }
    parts.push({ name: name as 'width' | 'height' | 'guidance' | 'seed', kind: 'text', value: parameterText(name, value) })
  }
  const dimensions = input.request.output.dimensions ?? { width: 1024, height: 1024 }
  if (!parameterEntries.some(([name]) => name === 'width')) parts.push({ name: 'width', kind: 'text', value: String(dimensions.width) })
  if (!parameterEntries.some(([name]) => name === 'height')) parts.push({ name: 'height', kind: 'text', value: String(dimensions.height) })
  const references: Array<CloudflareMultipartCall['references'][number]> = []
  mappings.forEach((mapping, index) => {
    if (mapping.order !== index) throw new Error('CLOUDFLARE_REFERENCE_ORDER_INVALID')
    const asset = byId.get(mapping.assetId)
    if (!asset || asset.contentHash !== mapping.contentHash) throw new Error(`CLOUDFLARE_ASSET_BINDING_MISMATCH:${mapping.assetId}`)
    if (!asset.width || !asset.height) throw new Error(`CLOUDFLARE_REFERENCE_DIMENSIONS_REQUIRED:${mapping.assetId}`)
    if (asset.width >= 512 || asset.height >= 512) throw new Error(`CLOUDFLARE_REFERENCE_DIMENSION_MUST_BE_BELOW_512:${mapping.assetId}`)
    const providerField = `input_image_${index}` as `input_image_${0 | 1 | 2 | 3}`
    parts.push({ name: providerField, kind: 'binary', value: asset.bytes, mediaType: asset.mediaType })
    references.push({ assetId: asset.id, contentHash: asset.contentHash, providerField, order: index })
  })
  return {
    schemaVersion: 'voce.playground-cloudflare-multipart-call/v1alpha1', provider: 'cloudflare', model: input.profile.model,
    endpointTemplate: input.profile.endpoint, wireFormat: 'multipart/form-data', requestHash: input.request.requestHash,
    prompt: input.materialization.request.prompt, parts, references,
    controls: { parameters: clone(input.materialization.request.parameters), output: clone(input.materialization.request.output), count: 1, steps: 4 } as unknown as JsonObject,
    timeoutMs: input.profile.timeoutMs,
  }
}

function validateOutputArtifacts(artifacts: readonly ArtifactHandle[], credential: CloudflareOperatorCredential): void {
  if (artifacts.length !== 1) throw new Error('CLOUDFLARE_OUTPUT_CARDINALITY_INVALID')
  for (const artifact of artifacts) {
    if (!/^sha256:[0-9a-f]{64}$/.test(artifact.contentHash) || typeof artifact.byteLength !== 'number' || !Number.isInteger(artifact.byteLength) || artifact.byteLength < 0 || !artifact.mediaType.startsWith('image/') || artifact.availability !== 'available') throw new Error('CLOUDFLARE_OUTPUT_ARTIFACT_INVALID')
  }
  if (!credential.accountId || !credential.apiToken) throw new Error('CLOUDFLARE_OPERATOR_CREDENTIAL_INVALID')
}

export async function executeCloudflareProviderCallDetailed(input: {
  request: ProviderRenderRequest
  profile: PlaygroundProviderProfile
  materialization: MaterializationResult
  assets: readonly CloudflareMultipartAsset[]
  transport: CloudflareProviderTransport
  credential: CloudflareOperatorCredential
}): Promise<CloudflareExecutionResult> {
  if (input.transport.provider !== 'cloudflare') throw new Error('CLOUDFLARE_TRANSPORT_PROFILE_MISMATCH')
  const call = buildCloudflareProviderCall(input)
  const result = await input.transport.send(call, input.credential)
  if (result.providerRequestId !== undefined && (result.providerRequestId === input.credential.accountId || result.providerRequestId === input.credential.apiToken || !/^[A-Za-z0-9._:-]{1,200}$/.test(result.providerRequestId))) throw new Error('CLOUDFLARE_RESPONSE_CREDENTIAL_ECHOED')
  validateOutputArtifacts(result.outputArtifacts, input.credential)
  const outputAssets = [...(result.outputAssets ?? [])]
  if (outputAssets.length && (outputAssets.length !== result.outputArtifacts.length || outputAssets.some((output, index) => output.artifact.id !== result.outputArtifacts[index].id || output.artifact.contentHash !== result.outputArtifacts[index].contentHash || output.artifact.byteLength !== output.bytes.byteLength || `sha256:${createHash('sha256').update(output.bytes).digest('hex')}` !== output.artifact.contentHash))) throw new Error('CLOUDFLARE_OUTPUT_BYTES_INVALID')
  const base: Omit<ProviderRenderResult, 'resultHash'> = {
    schemaVersion: 'voce.provider-render-result/v1alpha1', status: 'ok', requestHash: input.request.requestHash,
    adapterId: input.profile.adapterId, adapterVersion: { id: input.profile.adapterId, version: input.profile.version, digest: input.profile.adapterDigest! },
    ...(result.providerRequestId ? { providerRequestId: result.providerRequestId } : {}), outputArtifacts: [...result.outputArtifacts],
    metadata: { provider: 'cloudflare', outputCount: result.outputArtifacts.length },
  }
  return { providerResult: { ...base, resultHash: safeResultHash(base) }, outputAssets }
}

export async function executeCloudflareProviderCall(input: Parameters<typeof executeCloudflareProviderCallDetailed>[0]): Promise<ProviderRenderResult> {
  return (await executeCloudflareProviderCallDetailed(input)).providerResult
}

export function cloudflareTransportErrorCode(error: unknown): 'CLOUDFLARE_ACCOUNT_LIMITED' | 'CLOUDFLARE_RATE_LIMITED' | 'CLOUDFLARE_TRANSPORT_FAILED' {
  const value = (error && typeof error === 'object' ? error : {}) as CloudflareTransportErrorShape
  const codes = [value.code, ...(value.errors ?? []).map((item) => item.code)].map((item) => String(item ?? ''))
  if (value.status === 429 && codes.includes('3036')) return 'CLOUDFLARE_ACCOUNT_LIMITED'
  if (value.status === 429 || codes.includes('3040')) return 'CLOUDFLARE_RATE_LIMITED'
  return 'CLOUDFLARE_TRANSPORT_FAILED'
}

export function cloudflareCredentialFromEnv(env: NodeJS.ProcessEnv = process.env): CloudflareOperatorCredential | undefined {
  const accountId = env[CLOUDFLARE_ACCOUNT_ID_ENV]
  const apiToken = env[CLOUDFLARE_API_TOKEN_ENV]
  return accountId && apiToken ? { accountId, apiToken } : undefined
}
