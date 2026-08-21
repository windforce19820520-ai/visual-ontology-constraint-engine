#!/usr/bin/env node
import { startPlaygroundServer } from './server.js'
import { cloudflareCredentialFromEnv, FetchCloudflareProviderTransport } from './cloudflare-provider.js'
import { FetchSeedreamProviderTransport } from './seedream-provider.js'

const port = Number(process.env.PLAYGROUND_PORT ?? 4173)
const cloudflareCredential = cloudflareCredentialFromEnv()
const cloudflareEnabled = process.env.PLAYGROUND_ENABLE_CLOUDFLARE_TRANSPORT === '1' && cloudflareCredential !== undefined
const seedreamEnabled = process.env.PLAYGROUND_ENABLE_SEEDREAM_TRANSPORT === '1'
const renderEnabled = process.env.PLAYGROUND_ENABLE_MOCK_RENDER === '1' || cloudflareEnabled || seedreamEnabled
const transports = {
  ...(cloudflareEnabled ? { cloudflare: new FetchCloudflareProviderTransport() } : {}),
  ...(seedreamEnabled ? { seedream: new FetchSeedreamProviderTransport() } : {}),
}
await startPlaygroundServer(port, {
  renderEnabled,
  cloudflareCredential,
  transports,
  developmentMode: process.env.PLAYGROUND_DEVELOPMENT_MODE === '1',
  validationExportEnabled: process.env.PLAYGROUND_VALIDATION_EXPORT === '1',
})
console.log(`VOCE Playground listening on http://127.0.0.1:${port}/playground (${[cloudflareEnabled ? 'Cloudflare' : '', seedreamEnabled ? 'Seedream BYOK' : ''].filter(Boolean).join(' + ') || (renderEnabled ? 'mock render enabled' : 'render disabled')})`)
