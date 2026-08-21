import { createHash, randomUUID } from 'node:crypto'
import type { ArtifactHandle } from '@voce-engine/contracts'
import { sanitizeImageMetadata } from './image-safety.js'
import type { PlaygroundProviderCall, PlaygroundProviderTransport, PlaygroundTransportResult } from './provider-bridges.js'

interface SeedreamResponseItem { url?: string; b64_json?: string; base64?: string }
interface SeedreamEnvelope {
  data?: SeedreamResponseItem[]
  output?: SeedreamResponseItem[]
  error?: { code?: unknown; param?: unknown; type?: unknown }
}

export type SeedreamTransportErrorCode =
  | 'SEEDREAM_API_KEY_REJECTED'
  | 'SEEDREAM_REQUEST_REJECTED'
  | 'SEEDREAM_RATE_OR_QUOTA_LIMITED'
  | 'SEEDREAM_SERVICE_UNAVAILABLE'
  | 'SEEDREAM_OUTPUT_FAILED'
  | 'SEEDREAM_TRANSPORT_FAILED'

class SeedreamTransportError extends Error {
  constructor(readonly safeCode: SeedreamTransportErrorCode, readonly providerCode?: string, readonly providerParam?: string) { super(safeCode) }
}

function safeProviderDetail(value: unknown): string | undefined {
  const text = typeof value === 'string' || typeof value === 'number' ? String(value) : ''
  return /^[A-Za-z0-9_.\[\]-]{1,100}$/.test(text) ? text : undefined
}

export function seedreamTransportErrorCode(error: unknown): string {
  if (!(error instanceof SeedreamTransportError)) return 'SEEDREAM_TRANSPORT_FAILED'
  const details = [error.providerCode, error.providerParam].filter((value): value is string => Boolean(value))
  return details.length ? `${error.safeCode}:${details.join(':')}` : error.safeCode
}

function imageMediaType(bytes: Uint8Array): 'image/png' | 'image/jpeg' | 'image/webp' | undefined {
  if (bytes.length >= 8 && [137, 80, 78, 71, 13, 10, 26, 10].every((value, index) => bytes[index] === value)) return 'image/png'
  if (bytes.length >= 3 && bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255) return 'image/jpeg'
  if (bytes.length >= 12 && Buffer.from(bytes.subarray(0, 4)).toString('ascii') === 'RIFF' && Buffer.from(bytes.subarray(8, 12)).toString('ascii') === 'WEBP') return 'image/webp'
  return undefined
}

function decodeBase64(value: string): Uint8Array {
  const match = /^data:image\/(?:png|jpeg|webp);base64,(.+)$/s.exec(value)
  const encoded = match?.[1] ?? value
  if (!encoded || encoded.length % 4 !== 0 || !/^[A-Za-z0-9+/]*={0,2}$/.test(encoded)) throw new Error('SEEDREAM_RESPONSE_IMAGE_INVALID')
  const bytes = Uint8Array.from(Buffer.from(encoded, 'base64'))
  if (!bytes.length || bytes.byteLength > 50_000_000 || !imageMediaType(bytes)) throw new Error('SEEDREAM_RESPONSE_IMAGE_INVALID')
  return bytes
}

function outputArtifact(bytes: Uint8Array, mediaType: string): ArtifactHandle {
  return {
    id: `seedream-${randomUUID()}`,
    storeId: 'playground-generated',
    contentHash: `sha256:${createHash('sha256').update(bytes).digest('hex')}`,
    mediaType,
    byteLength: bytes.byteLength,
    role: 'generated-image',
    resolverId: 'playground-generated',
    availability: 'available',
    retentionClass: 'request',
    redactionPolicy: 'safe-hash-only',
  }
}

function assertAllowListedCall(call: PlaygroundProviderCall): void {
  if (call.provider !== 'seedream' || call.wireFormat !== 'seedream-json-data-uri') throw new Error('SEEDREAM_CALL_INVALID')
  if (call.endpoint !== 'https://ark.cn-beijing.volces.com/api/v3/images/generations') throw new Error('SEEDREAM_ENDPOINT_NOT_ALLOW_LISTED')
  if (call.model !== 'doubao-seedream-5-0-pro-260628') throw new Error('SEEDREAM_MODEL_NOT_ALLOW_LISTED')
  if (!call.references.length || call.references.length > 10) throw new Error('SEEDREAM_REFERENCE_COUNT_INVALID')
}

async function fetchWithTimeout(fetchImpl: typeof fetch, url: string, init: RequestInit, timeoutMs: number): Promise<Response> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  try { return await fetchImpl(url, { ...init, signal: controller.signal }) }
  catch { throw new SeedreamTransportError('SEEDREAM_TRANSPORT_FAILED') }
  finally { clearTimeout(timer) }
}

async function readOutput(item: SeedreamResponseItem, fetchImpl: typeof fetch, timeoutMs: number): Promise<Uint8Array> {
  if (typeof item.b64_json === 'string' || typeof item.base64 === 'string') return decodeBase64(item.b64_json ?? item.base64 ?? '')
  if (typeof item.url !== 'string') throw new SeedreamTransportError('SEEDREAM_OUTPUT_FAILED')
  let url: URL
  try { url = new URL(item.url) } catch { throw new SeedreamTransportError('SEEDREAM_OUTPUT_FAILED') }
  if (url.protocol !== 'https:' || !(url.hostname === 'volces.com' || url.hostname.endsWith('.volces.com'))) throw new SeedreamTransportError('SEEDREAM_OUTPUT_FAILED')
  const response = await fetchWithTimeout(fetchImpl, url.toString(), { method: 'GET', redirect: 'error' }, timeoutMs)
  if (!response.ok) throw new SeedreamTransportError('SEEDREAM_OUTPUT_FAILED')
  const declaredLength = Number(response.headers.get('content-length') ?? 0)
  if (declaredLength > 50_000_000) throw new Error('SEEDREAM_RESPONSE_IMAGE_INVALID')
  const bytes = new Uint8Array(await response.arrayBuffer())
  if (!bytes.length || bytes.byteLength > 50_000_000 || !imageMediaType(bytes)) throw new Error('SEEDREAM_RESPONSE_IMAGE_INVALID')
  return bytes
}

/** Real BYOK transport. The API key exists only in the Generate request call stack. */
export class FetchSeedreamProviderTransport implements PlaygroundProviderTransport {
  readonly provider = 'seedream' as const
  constructor(private readonly fetchImpl: typeof fetch = fetch) {}

  async send(call: PlaygroundProviderCall, ephemeralApiKey: string): Promise<PlaygroundTransportResult> {
    assertAllowListedCall(call)
    if (!ephemeralApiKey || ephemeralApiKey.length > 4096) throw new Error('SEEDREAM_EPHEMERAL_KEY_INVALID')
    const images = call.references.map((reference) => {
      if (!(reference.bytes instanceof Uint8Array) || !['image/png', 'image/jpeg'].includes(reference.mediaType)) throw new Error('SEEDREAM_REFERENCE_INVALID')
      if (`sha256:${createHash('sha256').update(reference.bytes).digest('hex')}` !== reference.contentHash) throw new Error('SEEDREAM_REFERENCE_BINDING_INVALID')
      return `data:${reference.mediaType};base64,${Buffer.from(reference.bytes).toString('base64')}`
    })
    const response = await fetchWithTimeout(this.fetchImpl, call.endpoint, {
      method: 'POST',
      headers: { authorization: `Bearer ${ephemeralApiKey}`, 'content-type': 'application/json' },
      body: JSON.stringify({
        model: call.model,
        prompt: call.prompt,
        image: images.length === 1 ? images[0] : images,
        n: 1,
        output_format: 'jpeg',
        size: '2K',
        watermark: false,
      }),
    }, call.timeoutMs)
    let envelope: SeedreamEnvelope
    try { envelope = await response.json() as SeedreamEnvelope } catch { throw new SeedreamTransportError(response.ok ? 'SEEDREAM_OUTPUT_FAILED' : response.status >= 500 ? 'SEEDREAM_SERVICE_UNAVAILABLE' : 'SEEDREAM_REQUEST_REJECTED') }
    if (!response.ok) {
      if (response.status === 401 || response.status === 403) throw new SeedreamTransportError('SEEDREAM_API_KEY_REJECTED')
      if (response.status === 429) throw new SeedreamTransportError('SEEDREAM_RATE_OR_QUOTA_LIMITED')
      if (response.status >= 500) throw new SeedreamTransportError('SEEDREAM_SERVICE_UNAVAILABLE')
      throw new SeedreamTransportError('SEEDREAM_REQUEST_REJECTED', safeProviderDetail(envelope.error?.code ?? envelope.error?.type), safeProviderDetail(envelope.error?.param))
    }
    const items = Array.isArray(envelope.data) ? envelope.data : Array.isArray(envelope.output) ? envelope.output : []
    if (items.length !== 1) throw new SeedreamTransportError('SEEDREAM_OUTPUT_FAILED')
    let bytes = await readOutput(items[0], this.fetchImpl, call.timeoutMs)
    const mediaType = imageMediaType(bytes)
    if (!mediaType) throw new Error('SEEDREAM_RESPONSE_IMAGE_INVALID')
    bytes = sanitizeImageMetadata(bytes, mediaType)
    const artifact = outputArtifact(bytes, mediaType)
    const requestId = response.headers.get('x-request-id') ?? response.headers.get('x-tt-logid') ?? undefined
    return {
      ...(requestId && /^[A-Za-z0-9._:-]{1,200}$/.test(requestId) ? { providerRequestId: requestId } : {}),
      outputArtifacts: [artifact],
      outputAssets: [{ artifact, bytes }],
    }
  }
}
