import { createHash, randomUUID } from 'node:crypto'
import type { ArtifactHandle } from '@voce-engine/contracts'
import { sanitizeImageMetadata } from './image-safety.js'
import type { PlaygroundProviderCall, PlaygroundProviderTransport, PlaygroundTransportResult } from './provider-bridges.js'

interface GrokResponseItem { url?: string; b64_json?: string; base64?: string }
interface GrokEnvelope { data?: GrokResponseItem[]; error?: { code?: unknown; type?: unknown } }

export type GrokTransportErrorCode =
  | 'GROK_API_KEY_REJECTED'
  | 'GROK_REQUEST_REJECTED'
  | 'GROK_RATE_OR_QUOTA_LIMITED'
  | 'GROK_SERVICE_UNAVAILABLE'
  | 'GROK_OUTPUT_DIMENSIONS_UNSUPPORTED'
  | 'GROK_OUTPUT_FAILED'
  | 'GROK_TRANSPORT_FAILED'

class GrokTransportError extends Error {
  constructor(readonly safeCode: GrokTransportErrorCode) { super(safeCode) }
}

export function grokTransportErrorCode(error: unknown): GrokTransportErrorCode {
  return error instanceof GrokTransportError ? error.safeCode : 'GROK_TRANSPORT_FAILED'
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
  if (!encoded || encoded.length % 4 !== 0 || !/^[A-Za-z0-9+/]*={0,2}$/.test(encoded)) throw new GrokTransportError('GROK_OUTPUT_FAILED')
  const bytes = Uint8Array.from(Buffer.from(encoded, 'base64'))
  if (!bytes.length || bytes.byteLength > 50_000_000 || !imageMediaType(bytes)) throw new GrokTransportError('GROK_OUTPUT_FAILED')
  return bytes
}

async function fetchWithTimeout(fetchImpl: typeof fetch, url: string, init: RequestInit, timeoutMs: number): Promise<Response> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  try { return await fetchImpl(url, { ...init, signal: controller.signal }) }
  catch { throw new GrokTransportError('GROK_TRANSPORT_FAILED') }
  finally { clearTimeout(timer) }
}

function assertCall(call: PlaygroundProviderCall): void {
  if (call.provider !== 'grok-imagine' || call.wireFormat !== 'xai-image-edits-json') throw new Error('GROK_CALL_INVALID')
  if (call.endpoint !== 'https://api.x.ai/v1/images/edits') throw new Error('GROK_ENDPOINT_NOT_ALLOW_LISTED')
  if (call.model !== 'grok-imagine-image-quality') throw new Error('GROK_MODEL_NOT_ALLOW_LISTED')
  if (!call.references.length || call.references.length > 3) throw new Error('GROK_REFERENCE_COUNT_INVALID')
}

const GROK_ASPECT_RATIOS = new Set(['1:1', '16:9', '9:16', '4:3', '3:4', '3:2', '2:3', '2:1', '1:2', '19.5:9', '9:19.5', '20:9', '9:20'])

function gcd(left: number, right: number): number {
  while (right) { const remainder = left % right; left = right; right = remainder }
  return left
}

function grokOutputOptions(controls: PlaygroundProviderCall['controls']): { aspect_ratio: string; resolution: '1k' | '2k' } {
  const output = controls.output
  const dimensions = output && typeof output === 'object' && !Array.isArray(output) ? output.dimensions : undefined
  const width = dimensions && typeof dimensions === 'object' && !Array.isArray(dimensions) ? dimensions.width : 1024
  const height = dimensions && typeof dimensions === 'object' && !Array.isArray(dimensions) ? dimensions.height : 1024
  if (!Number.isInteger(width) || !Number.isInteger(height) || Number(width) <= 0 || Number(height) <= 0) throw new GrokTransportError('GROK_OUTPUT_DIMENSIONS_UNSUPPORTED')
  const widthNumber = Number(width); const heightNumber = Number(height)
  const maxDimension = Math.max(widthNumber, heightNumber)
  if (maxDimension !== 1024 && maxDimension !== 2048) throw new GrokTransportError('GROK_OUTPUT_DIMENSIONS_UNSUPPORTED')
  const divisor = gcd(widthNumber, heightNumber)
  const aspectRatio = `${widthNumber / divisor}:${heightNumber / divisor}`
  if (!GROK_ASPECT_RATIOS.has(aspectRatio)) throw new GrokTransportError('GROK_OUTPUT_DIMENSIONS_UNSUPPORTED')
  return { aspect_ratio: aspectRatio, resolution: maxDimension === 2048 ? '2k' : '1k' }
}

async function outputBytes(item: GrokResponseItem, fetchImpl: typeof fetch, timeoutMs: number): Promise<Uint8Array> {
  if (typeof item.b64_json === 'string' || typeof item.base64 === 'string') return decodeBase64(item.b64_json ?? item.base64 ?? '')
  if (typeof item.url !== 'string') throw new GrokTransportError('GROK_OUTPUT_FAILED')
  let url: URL
  try { url = new URL(item.url) } catch { throw new GrokTransportError('GROK_OUTPUT_FAILED') }
  if (url.protocol !== 'https:' || !(url.hostname === 'x.ai' || url.hostname.endsWith('.x.ai'))) throw new GrokTransportError('GROK_OUTPUT_FAILED')
  const response = await fetchWithTimeout(fetchImpl, url.toString(), { method: 'GET', redirect: 'error' }, timeoutMs)
  if (!response.ok) throw new GrokTransportError('GROK_OUTPUT_FAILED')
  const declaredLength = Number(response.headers.get('content-length') ?? 0)
  if (declaredLength > 50_000_000) throw new GrokTransportError('GROK_OUTPUT_FAILED')
  const bytes = new Uint8Array(await response.arrayBuffer())
  if (!bytes.length || bytes.byteLength > 50_000_000 || !imageMediaType(bytes)) throw new GrokTransportError('GROK_OUTPUT_FAILED')
  return bytes
}

function artifact(bytes: Uint8Array, mediaType: string): ArtifactHandle {
  return {
    id: `grok-${randomUUID()}`,
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

/** Allow-listed BYOK transport. Tests inject Mock HTTP; no test calls xAI. */
export class FetchGrokProviderTransport implements PlaygroundProviderTransport {
  readonly provider = 'grok-imagine' as const
  constructor(private readonly fetchImpl: typeof fetch = fetch) {}

  async send(call: PlaygroundProviderCall, ephemeralApiKey: string): Promise<PlaygroundTransportResult> {
    assertCall(call)
    if (!ephemeralApiKey || ephemeralApiKey.length > 4096) throw new Error('GROK_EPHEMERAL_KEY_INVALID')
    const images = call.references.map((reference) => {
      if (!(reference.bytes instanceof Uint8Array) || !['image/png', 'image/jpeg'].includes(reference.mediaType)) throw new Error('GROK_REFERENCE_INVALID')
      if (`sha256:${createHash('sha256').update(reference.bytes).digest('hex')}` !== reference.contentHash) throw new Error('GROK_REFERENCE_BINDING_INVALID')
      return { type: 'image_url', url: `data:${reference.mediaType};base64,${Buffer.from(reference.bytes).toString('base64')}` }
    })
    const outputOptions = grokOutputOptions(call.controls)
    const body = {
      model: call.model,
      prompt: call.prompt,
      ...(images.length === 1 ? { image: images[0] } : { images }),
      ...outputOptions,
      n: 1,
      response_format: 'url',
    }
    const response = await fetchWithTimeout(this.fetchImpl, call.endpoint, {
      method: 'POST',
      headers: { authorization: `Bearer ${ephemeralApiKey}`, 'content-type': 'application/json' },
      body: JSON.stringify(body),
    }, call.timeoutMs)
    let envelope: GrokEnvelope
    try { envelope = await response.json() as GrokEnvelope } catch { throw new GrokTransportError(response.ok ? 'GROK_OUTPUT_FAILED' : response.status >= 500 ? 'GROK_SERVICE_UNAVAILABLE' : 'GROK_REQUEST_REJECTED') }
    if (!response.ok) {
      if (response.status === 401 || response.status === 403) throw new GrokTransportError('GROK_API_KEY_REJECTED')
      if (response.status === 429) throw new GrokTransportError('GROK_RATE_OR_QUOTA_LIMITED')
      if (response.status >= 500) throw new GrokTransportError('GROK_SERVICE_UNAVAILABLE')
      throw new GrokTransportError('GROK_REQUEST_REJECTED')
    }
    if (!Array.isArray(envelope.data) || envelope.data.length !== 1) throw new GrokTransportError('GROK_OUTPUT_FAILED')
    let bytes = await outputBytes(envelope.data[0], this.fetchImpl, call.timeoutMs)
    const mediaType = imageMediaType(bytes)
    if (!mediaType) throw new GrokTransportError('GROK_OUTPUT_FAILED')
    bytes = sanitizeImageMetadata(bytes, mediaType)
    const outputArtifact = artifact(bytes, mediaType)
    const requestId = response.headers.get('x-request-id') ?? undefined
    return {
      ...(requestId && /^[A-Za-z0-9._:-]{1,200}$/.test(requestId) ? { providerRequestId: requestId } : {}),
      outputArtifacts: [outputArtifact],
      outputAssets: [{ artifact: outputArtifact, bytes }],
    }
  }
}
