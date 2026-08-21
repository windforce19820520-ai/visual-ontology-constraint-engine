import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'
import { playgroundRuntimeConfigFromEnv } from './runtime-config.js'

async function deploymentFile(name: string): Promise<string> {
  return readFile(new URL(`../../deploy/public-playground/${name}`, import.meta.url), 'utf8')
}

test('deployment environment is public, loopback-only, single-instance, and compile-only', async () => {
  const env = await deploymentFile('voce-playground.env.example')
  assert.match(env, /^PLAYGROUND_PUBLIC_MODE=1$/m)
  assert.match(env, /^PLAYGROUND_HOST=127\.0\.0\.1$/m)
  assert.match(env, /^PLAYGROUND_BEHIND_REVERSE_PROXY=1$/m)
  assert.match(env, /^PLAYGROUND_TRUSTED_PROXY_CIDRS=127\.0\.0\.1\/32$/m)
  assert.match(env, /^PLAYGROUND_SINGLE_INSTANCE=1$/m)
  assert.match(env, /^PLAYGROUND_MAX_CONCURRENT_GENERATIONS=1$/m)
  for (const provider of ['SEEDREAM', 'GROK', 'CLOUDFLARE']) assert.match(env, new RegExp(`^PLAYGROUND_ENABLE_${provider}_TRANSPORT=0$`, 'm'))
  assert.match(env, /^PLAYGROUND_ENABLE_MOCK_RENDER=0$/m)
  assert.match(env, /^PLAYGROUND_VALIDATION_EXPORT=0$/m)
  const parsed = Object.fromEntries(env.split(/\r?\n/).filter((line) => line && !line.startsWith('#')).map((line) => {
    const separator = line.indexOf('=')
    return [line.slice(0, separator), line.slice(separator + 1)]
  }))
  const config = playgroundRuntimeConfigFromEnv(parsed)
  assert.equal(config.publicMode, true)
  assert.equal(config.secureCookies, true)
  assert.deepEqual(config.trustedProxyCidrs, ['127.0.0.1/32'])
})

test('systemd unit runs unprivileged with bounded resources and a graceful stop', async () => {
  const unit = await deploymentFile('voce-playground.service')
  assert.match(unit, /^User=voce$/m)
  assert.match(unit, /^Group=voce$/m)
  assert.match(unit, /^EnvironmentFile=\/etc\/voce-playground\/voce-playground\.env$/m)
  assert.match(unit, /^EnvironmentFile=-\/etc\/voce-playground\/cloudflare\.env$/m)
  assert.match(unit, /^ExecStart=\/usr\/bin\/node playground\/dist\/server-entry\.js$/m)
  assert.match(unit, /^KillSignal=SIGTERM$/m)
  assert.match(unit, /^NoNewPrivileges=true$/m)
  assert.match(unit, /^ProtectSystem=strict$/m)
  assert.match(unit, /^IPAddressDeny=any$/m)
  assert.match(unit, /^IPAddressAllow=localhost$/m)
  assert.match(unit, /^MemoryMax=1536M$/m)
})

test('Provider egress requires an explicit systemd drop-in and credentials stay outside the main environment', async () => {
  const dropIn = await deploymentFile('voce-playground-provider-egress.conf')
  assert.match(dropIn, /^\[Service\]$/m)
  assert.match(dropIn, /^IPAddressDeny=$/m)
  assert.match(dropIn, /^IPAddressAllow=$/m)
  const secretShape = await deploymentFile('cloudflare.env.example')
  assert.match(secretShape, /^CLOUDFLARE_ACCOUNT_ID=$/m)
  assert.match(secretShape, /^CLOUDFLARE_API_TOKEN=$/m)
  assert.doesNotMatch(secretShape, /Bearer\s+|[A-Za-z0-9_-]{40,}/)
})

test('Nginx terminates TLS, bounds bodies, trusts only its socket peer, and sanitizes logs', async () => {
  const config = await deploymentFile('nginx-https.conf.template')
  assert.match(config, /listen 443 ssl http2;/)
  assert.match(config, /client_max_body_size 20100000;/)
  assert.match(config, /proxy_pass http:\/\/127\.0\.0\.1:4173;/)
  assert.match(config, /proxy_set_header X-Forwarded-For \$remote_addr;/)
  assert.match(config, /~\^\/api\/generated\/ \/api\/generated\/:id;/)
  assert.match(config, /proxy_request_buffering off;/)
  assert.match(config, /return 308 https:\/\/__VOCE_HOSTNAME__\$request_uri;/)
  assert.doesNotMatch(config, /proxy_set_header Host \$host;/)
  const logFormat = config.match(/log_format voce_public ([\s\S]*?);/)?.[0] ?? ''
  assert.doesNotMatch(logFormat, /\$remote_addr|\$binary_remote_addr|\$request_uri|\$http_cookie|\$http_authorization|\$http_user_agent|\$http_referer/)
  assert.match(config, /error_log \/dev\/null crit;/)
  const bootstrap = await deploymentFile('nginx-http.conf.template')
  assert.match(bootstrap, /access_log \/var\/log\/nginx\/voce-playground\.access\.log voce_public;/)
  assert.match(bootstrap, /error_log \/dev\/null crit;/)
  assert.match(bootstrap, /return 308 https:\/\/__VOCE_HOSTNAME__\$request_uri;/)
  const bootstrapLogFormat = bootstrap.match(/log_format voce_public ([\s\S]*?);/)?.[0] ?? ''
  assert.doesNotMatch(bootstrapLogFormat, /\$remote_addr|\$binary_remote_addr|\$request_uri/)
})
