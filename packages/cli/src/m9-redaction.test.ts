import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

const redactionModule = new URL('../../../scripts/m9-redaction.mjs', import.meta.url)
const smokeModule = new URL('../../../scripts/m9-seedream-smoke.mjs', import.meta.url)
const smokeSource = await readFile(smokeModule, 'utf8')

const INJECTED_KEY = '11111111-2222-3333-4444-555555555555'
const UNRELATED_REQUEST_ID = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee'

interface RedactionModule {
  CREDENTIAL_PLACEHOLDER: string
  redactCredentialText: (text: unknown, credentialValue: unknown) => string
  redactCredentialDeep: (value: unknown, credentialValue: unknown) => unknown
}

async function loadRedaction(): Promise<RedactionModule> {
  return (await import(redactionModule.href)) as RedactionModule
}

test('M9 redaction removes every occurrence of the injected credential from a complete report', async () => {
  const { redactCredentialDeep } = await loadRedaction()
  const report = {
    schemaVersion: 'voce.m9-seedream-smoke/v1alpha1',
    failureReason: `Authorization failed for key ${INJECTED_KEY} at endpoint.`,
    preflight: { passed: true, networkCalls: 0, cases: [{ id: 'p1', note: INJECTED_KEY }] },
    cases: [
      {
        title: 'case-one',
        status: 'failed',
        elapsedMs: 1200,
        failureCode: 'PROVIDER_FAILED',
        outputArtifacts: [{ path: 'results/case-one.jpg', mediaType: 'image/jpeg' }],
        receipts: [
          { providerRequestId: UNRELATED_REQUEST_ID, message: `Bearer ${INJECTED_KEY}` },
          { providerRequestId: INJECTED_KEY, message: 'rejected' },
        ],
      },
    ],
  }
  const redacted = redactCredentialDeep(structuredClone(report), INJECTED_KEY) as typeof report
  const serialized = JSON.stringify(redacted)
  assert.ok(!serialized.includes(INJECTED_KEY), 'serialized report must not contain the injected credential')
  assert.equal((redacted.failureReason as string).includes('[REDACTED]'), true)
  assert.equal((redacted.cases[0].receipts[0].message as string), 'Bearer [REDACTED]')
  assert.equal(redacted.cases[0].receipts[1].providerRequestId, '[REDACTED]')
})

test('M9 redaction keeps unrelated UUID request identifiers visible', async () => {
  const { redactCredentialDeep } = await loadRedaction()
  const report = {
    cases: [{ status: 'succeeded', receipts: [{ providerRequestId: UNRELATED_REQUEST_ID }] }],
  }
  const redacted = redactCredentialDeep(report, INJECTED_KEY) as typeof report
  assert.equal(JSON.stringify(redacted).includes(UNRELATED_REQUEST_ID), true)
  assert.equal((redacted.cases[0].receipts[0].providerRequestId), UNRELATED_REQUEST_ID)
})

test('M9 redaction preserves non-string values and is inert without a credential', async () => {
  const { redactCredentialDeep, CREDENTIAL_PLACEHOLDER } = await loadRedaction()
  assert.equal(CREDENTIAL_PLACEHOLDER, '[REDACTED]')
  const value = { count: 3, ok: true, empty: null, list: [1, false, 'x'], nested: { name: 'keep' } }
  assert.deepEqual(redactCredentialDeep(value, ''), value)
  assert.deepEqual(redactCredentialDeep(undefined, INJECTED_KEY), undefined)
  const result = redactCredentialDeep({ name: `${INJECTED_KEY}-suffix`, ...structuredClone(value) }, INJECTED_KEY) as { name: string; count: number; nested: { name: string } }
  assert.equal(result.name, `[REDACTED]-suffix`)
  assert.equal(result.count, 3)
  assert.equal(result.nested.name, 'keep')
})

test('M9 smoke runner uses exact request-scoped redaction and no generic UUID masking', () => {
  assert.match(smokeSource, /redactCredentialDeep/)
  assert.doesNotMatch(smokeSource, /\[0-9a-f\]\{8\}-\[0-9a-f\]\{4\}/)
})
