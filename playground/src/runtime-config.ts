export type PlaygroundExternalScheme = 'http' | 'https'

export interface PlaygroundRuntimeConfig {
  host: string
  port: number
  publicMode: boolean
  externalScheme: PlaygroundExternalScheme
  secureCookies: boolean
  developmentMode: boolean
  validationExportEnabled: boolean
  trustedProxyCidrs: readonly string[]
  singleInstance: boolean
  providerHardLimitsConfirmed: boolean
  requestBodyLimitBytes: number
  perSessionCallsPerDay: number
  perClientCallsPerDay: number
  globalCallsPerDay: number
  maxConcurrentGenerations: number
  providerCallsPerMinute: Readonly<Record<string, number>>
}

function flag(env: NodeJS.ProcessEnv, name: string): boolean {
  const value = env[name]
  if (value === undefined || value === '0') return false
  if (value === '1') return true
  throw new Error(`PLAYGROUND_CONFIG_FLAG_INVALID:${name}`)
}

function integer(env: NodeJS.ProcessEnv, name: string, fallback: number, minimum: number, maximum: number): number {
  const value = env[name] === undefined ? fallback : Number(env[name])
  if (!Number.isInteger(value) || value < minimum || value > maximum) throw new Error(`PLAYGROUND_CONFIG_INTEGER_INVALID:${name}`)
  return value
}

function isLoopback(host: string): boolean {
  return host === 'localhost' || host === '127.0.0.1' || host === '::1'
}

function validTrustedProxyRule(rule: string): boolean {
  const [address, bitsText, extra] = rule.split('/')
  if (extra !== undefined) return false
  const ipv4 = address.split('.').map(Number)
  const validIpv4 = ipv4.length === 4 && ipv4.every((part) => Number.isInteger(part) && part >= 0 && part <= 255)
  if (bitsText === undefined) return validIpv4 || /^[0-9a-f:]{2,45}$/i.test(address)
  const bits = Number(bitsText)
  return validIpv4 && Number.isInteger(bits) && bits >= 8 && bits <= 32 && address !== '0.0.0.0'
}

export function playgroundRuntimeConfigFromEnv(env: NodeJS.ProcessEnv = process.env): PlaygroundRuntimeConfig {
  const publicMode = flag(env, 'PLAYGROUND_PUBLIC_MODE')
  const host = env.PLAYGROUND_HOST?.trim() || '127.0.0.1'
  const port = integer(env, 'PLAYGROUND_PORT', 4173, 1, 65_535)
  const externalScheme = (env.PLAYGROUND_EXTERNAL_SCHEME?.trim() || (publicMode ? 'https' : 'http')) as PlaygroundExternalScheme
  if (externalScheme !== 'http' && externalScheme !== 'https') throw new Error('PLAYGROUND_CONFIG_EXTERNAL_SCHEME_INVALID')
  const developmentMode = flag(env, 'PLAYGROUND_DEVELOPMENT_MODE')
  const validationExportEnabled = flag(env, 'PLAYGROUND_VALIDATION_EXPORT')
  const trustedProxyCidrs = flag(env, 'PLAYGROUND_TRUST_PROXY')
    ? (env.PLAYGROUND_TRUSTED_PROXY_CIDRS ?? '').split(',').map((value) => value.trim()).filter(Boolean)
    : []
  if (trustedProxyCidrs.some((rule) => !validTrustedProxyRule(rule))) throw new Error('PLAYGROUND_TRUSTED_PROXY_RULE_INVALID')
  const singleInstance = flag(env, 'PLAYGROUND_SINGLE_INSTANCE')
  const providerHardLimitsConfirmed = flag(env, 'PLAYGROUND_PROVIDER_HARD_LIMITS_CONFIRMED')
  const requestBodyLimitBytes = integer(env, 'PLAYGROUND_REQUEST_BODY_LIMIT_BYTES', 20_100_000, 1_000_000, 25_000_000)
  const perSessionCallsPerDay = integer(env, 'PLAYGROUND_SESSION_CALLS_PER_DAY', 8, 1, 10_000)
  const perClientCallsPerDay = integer(env, 'PLAYGROUND_CLIENT_CALLS_PER_DAY', 24, 1, 100_000)
  const globalCallsPerDay = integer(env, 'PLAYGROUND_GLOBAL_CALLS_PER_DAY', 100, 1, 1_000_000)
  const maxConcurrentGenerations = integer(env, 'PLAYGROUND_MAX_CONCURRENT_GENERATIONS', 2, 1, 1_000)
  const providerCallsPerMinute = {
    seedream: integer(env, 'PLAYGROUND_SEEDREAM_CALLS_PER_MINUTE', 10, 1, 10_000),
    'grok-imagine': integer(env, 'PLAYGROUND_GROK_CALLS_PER_MINUTE', 10, 1, 10_000),
    cloudflare: integer(env, 'PLAYGROUND_CLOUDFLARE_CALLS_PER_MINUTE', 30, 1, 10_000),
    mock: 60,
  }

  if (host.includes('/') || host.includes('\\') || /\s/.test(host)) throw new Error('PLAYGROUND_CONFIG_HOST_INVALID')
  if (publicMode) {
    if (isLoopback(host)) throw new Error('PLAYGROUND_PUBLIC_HOST_REQUIRED')
    if (externalScheme !== 'https') throw new Error('PLAYGROUND_PUBLIC_HTTPS_REQUIRED')
    if (developmentMode || validationExportEnabled || flag(env, 'PLAYGROUND_ENABLE_MOCK_RENDER')) throw new Error('PLAYGROUND_PUBLIC_DEVELOPMENT_FEATURE_FORBIDDEN')
    if (!singleInstance || !providerHardLimitsConfirmed) throw new Error('PLAYGROUND_PUBLIC_QUOTA_DURABILITY_UNCONFIRMED')
    if (flag(env, 'PLAYGROUND_TRUST_PROXY') && trustedProxyCidrs.length === 0) throw new Error('PLAYGROUND_TRUSTED_PROXY_LIST_REQUIRED')
    for (const name of ['PLAYGROUND_SESSION_CALLS_PER_DAY', 'PLAYGROUND_CLIENT_CALLS_PER_DAY', 'PLAYGROUND_GLOBAL_CALLS_PER_DAY', 'PLAYGROUND_MAX_CONCURRENT_GENERATIONS', 'PLAYGROUND_SEEDREAM_CALLS_PER_MINUTE', 'PLAYGROUND_GROK_CALLS_PER_MINUTE', 'PLAYGROUND_CLOUDFLARE_CALLS_PER_MINUTE']) if (env[name] === undefined) throw new Error(`PLAYGROUND_PUBLIC_LIMIT_REQUIRED:${name}`)
  }

  return {
    host,
    port,
    publicMode,
    externalScheme,
    secureCookies: publicMode,
    developmentMode,
    validationExportEnabled,
    trustedProxyCidrs,
    singleInstance,
    providerHardLimitsConfirmed,
    requestBodyLimitBytes,
    perSessionCallsPerDay,
    perClientCallsPerDay,
    globalCallsPerDay,
    maxConcurrentGenerations,
    providerCallsPerMinute,
  }
}
