#!/usr/bin/env node
import { startPlaygroundServer } from './server.js'
import { cloudflareCredentialFromEnv, FetchCloudflareProviderTransport } from './cloudflare-provider.js'
import { FetchSeedreamProviderTransport } from './seedream-provider.js'
import { FetchGrokProviderTransport } from './grok-provider.js'
import { InMemoryRequestQuotaStore, RequestQuotaGate } from './quota-store.js'
import { playgroundRuntimeConfigFromEnv } from './runtime-config.js'
import { JsonConsoleLogger } from './runtime-security.js'

function enabled(name: string): boolean {
  const value = process.env[name]
  if (value === undefined || value === '0') return false
  if (value === '1') return true
  throw new Error(`PLAYGROUND_CONFIG_FLAG_INVALID:${name}`)
}

const config = playgroundRuntimeConfigFromEnv()
const cloudflareCredential = cloudflareCredentialFromEnv()
const cloudflareRequested = enabled('PLAYGROUND_ENABLE_CLOUDFLARE_TRANSPORT')
if (cloudflareRequested && cloudflareCredential === undefined) throw new Error('PLAYGROUND_CLOUDFLARE_CREDENTIAL_REQUIRED')
const cloudflareEnabled = cloudflareRequested && cloudflareCredential !== undefined
const seedreamEnabled = enabled('PLAYGROUND_ENABLE_SEEDREAM_TRANSPORT')
const grokEnabled = enabled('PLAYGROUND_ENABLE_GROK_TRANSPORT')
const mockEnabled = enabled('PLAYGROUND_ENABLE_MOCK_RENDER')
const renderEnabled = mockEnabled || cloudflareEnabled || seedreamEnabled || grokEnabled
const transports = {
  ...(cloudflareEnabled ? { cloudflare: new FetchCloudflareProviderTransport() } : {}),
  ...(seedreamEnabled ? { seedream: new FetchSeedreamProviderTransport() } : {}),
  ...(grokEnabled ? { 'grok-imagine': new FetchGrokProviderTransport() } : {}),
}
const logger = new JsonConsoleLogger()
const requestQuotaStore = new InMemoryRequestQuotaStore()
const requestQuotaGate = new RequestQuotaGate(requestQuotaStore, {
  perSessionCalls: config.perSessionCallsPerDay,
  perClientCalls: config.perClientCallsPerDay,
  dailyCalls: config.globalCallsPerDay,
  maxConcurrent: config.maxConcurrentGenerations,
  providerCallsPerMinute: config.providerCallsPerMinute,
})
const server = await startPlaygroundServer(config.port, {
  renderEnabled,
  cloudflareCredential,
  transports,
  developmentMode: config.developmentMode,
  validationExportEnabled: config.validationExportEnabled,
  secureCookies: config.secureCookies,
  trustedProxyCidrs: config.trustedProxyCidrs,
  requestBodyLimitBytes: config.requestBodyLimitBytes,
  requestQuotaStore,
  requestQuotaGate,
  logger,
}, config.host)
logger.info('server.started', { route: '/playground', status: 200 })

let closing = false
async function shutdown(signal: string): Promise<void> {
  if (closing) return
  closing = true
  logger.info('server.shutdown', { code: signal })
  server.closeIdleConnections()
  const force = setTimeout(() => server.closeAllConnections(), 10_000)
  force.unref()
  await new Promise<void>((resolve) => server.close(() => resolve()))
  clearTimeout(force)
}
process.once('SIGINT', () => { void shutdown('SIGINT') })
process.once('SIGTERM', () => { void shutdown('SIGTERM') })
