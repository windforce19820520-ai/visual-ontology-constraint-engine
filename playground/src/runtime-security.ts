import { createHash, createHmac, randomBytes, randomUUID, timingSafeEqual } from 'node:crypto'
import type { IncomingMessage, ServerResponse } from 'node:http'

export const PLAYGROUND_SESSION_COOKIE = 'voce_playground_session'

export interface RuntimeLogFields {
  requestId?: string
  route?: string
  method?: string
  status?: number
  code?: string
  provider?: string
  profileId?: string
  clientHash?: string
  sessionHash?: string
  durationMs?: number
}

export interface PlaygroundRuntimeLogger {
  info(event: string, fields: RuntimeLogFields): void
  error(event: string, fields: RuntimeLogFields): void
}

function safeLogFields(fields: RuntimeLogFields): RuntimeLogFields {
  const output: RuntimeLogFields = {}
  for (const [key, value] of Object.entries(fields)) {
    if (!['requestId', 'route', 'method', 'status', 'code', 'provider', 'profileId', 'clientHash', 'sessionHash', 'durationMs'].includes(key)) continue
    if (typeof value === 'string' && !/^[A-Za-z0-9_./:@-]{1,240}$/.test(value)) continue
    if (typeof value !== 'string' && typeof value !== 'number') continue
    ;(output as Record<string, unknown>)[key] = value
  }
  return output
}

export class JsonConsoleLogger implements PlaygroundRuntimeLogger {
  info(event: string, fields: RuntimeLogFields): void { console.log(JSON.stringify({ level: 'info', event, ...safeLogFields(fields) })) }
  error(event: string, fields: RuntimeLogFields): void { console.error(JSON.stringify({ level: 'error', event, ...safeLogFields(fields) })) }
}

function cookies(request: IncomingMessage): Map<string, string> {
  const result = new Map<string, string>()
  for (const part of (request.headers.cookie ?? '').split(';')) {
    const index = part.indexOf('=')
    if (index <= 0) continue
    result.set(part.slice(0, index).trim(), part.slice(index + 1).trim())
  }
  return result
}

export class SessionCookieManager {
  private readonly secret = randomBytes(32)
  constructor(private readonly secure: boolean) {}
  private signature(id: string): string { return createHmac('sha256', this.secret).update(id).digest('hex') }
  private valid(value: string | undefined): string | undefined {
    const match = /^([0-9a-f]{32})\.([0-9a-f]{64})$/.exec(value ?? '')
    if (!match) return undefined
    const expected = Buffer.from(this.signature(match[1]), 'hex')
    const supplied = Buffer.from(match[2], 'hex')
    return expected.length === supplied.length && timingSafeEqual(expected, supplied) ? match[1] : undefined
  }
  resolve(request: IncomingMessage, response: ServerResponse): string {
    const supplied = this.valid(cookies(request).get(PLAYGROUND_SESSION_COOKIE))
    if (supplied) return supplied
    const sessionId = randomUUID().replaceAll('-', '')
    const attributes = [`${PLAYGROUND_SESSION_COOKIE}=${sessionId}.${this.signature(sessionId)}`, 'Path=/', 'HttpOnly', 'SameSite=Strict', 'Max-Age=1800']
    if (this.secure) attributes.push('Secure')
    response.setHeader('set-cookie', attributes.join('; '))
    return sessionId
  }
  clear(response: ServerResponse): void {
    const attributes = [`${PLAYGROUND_SESSION_COOKIE}=`, 'Path=/', 'HttpOnly', 'SameSite=Strict', 'Max-Age=0']
    if (this.secure) attributes.push('Secure')
    response.setHeader('set-cookie', attributes.join('; '))
  }
}

function normalizeIp(value: string): string {
  const trimmed = value.trim()
  return trimmed.startsWith('::ffff:') ? trimmed.slice(7) : trimmed
}

function ipv4Number(value: string): number | undefined {
  const parts = value.split('.')
  if (parts.length !== 4) return undefined
  const numbers = parts.map(Number)
  if (numbers.some((part) => !Number.isInteger(part) || part < 0 || part > 255)) return undefined
  return (((numbers[0] << 24) >>> 0) + (numbers[1] << 16) + (numbers[2] << 8) + numbers[3]) >>> 0
}

function matchesTrustedProxy(address: string, rule: string): boolean {
  const normalized = normalizeIp(address)
  const [network, bitsText] = rule.split('/')
  if (bitsText === undefined) return normalized === normalizeIp(network)
  const addressNumber = ipv4Number(normalized)
  const networkNumber = ipv4Number(network)
  const bits = Number(bitsText)
  if (addressNumber === undefined || networkNumber === undefined || !Number.isInteger(bits) || bits < 0 || bits > 32) return false
  const mask = bits === 0 ? 0 : (0xffffffff << (32 - bits)) >>> 0
  return (addressNumber & mask) === (networkNumber & mask)
}

function validClientIp(value: string): boolean {
  return ipv4Number(normalizeIp(value)) !== undefined || /^[0-9a-f:]{2,45}$/i.test(value)
}

export function trustedClientIdentity(request: IncomingMessage, trustedProxyCidrs: readonly string[]): { clientId: string; clientHash: string } {
  const peer = normalizeIp(request.socket.remoteAddress ?? 'unknown')
  let clientIp = peer
  if (trustedProxyCidrs.some((rule) => matchesTrustedProxy(peer, rule))) {
    const forwarded = request.headers['x-forwarded-for']
    const first = typeof forwarded === 'string' ? forwarded.split(',')[0]?.trim() : undefined
    if (first && validClientIp(first)) clientIp = normalizeIp(first)
  }
  const clientHash = createHash('sha256').update(`voce-client:${clientIp}`).digest('hex')
  return { clientId: `ip-${clientHash}`, clientHash }
}

export function opaqueHash(kind: 'session' | 'client', value: string): string {
  return createHash('sha256').update(`voce-${kind}:${value}`).digest('hex')
}
