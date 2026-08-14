import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { spawnSync } from 'node:child_process'

const root = process.cwd()
const cli = path.join(root, 'packages', 'cli', 'dist', 'cli.js')
const fixture = (relative: string) => path.join(root, 'fixtures', ...relative.split('/'))
function invoke(args: string[]) {
  const result = spawnSync(process.execPath, [cli, ...args, '--json'], { cwd: root, encoding: 'utf8' })
  const lines = result.stdout.trim().split(/\r?\n/).filter(Boolean)
  return { ...result, json: lines.length ? JSON.parse(lines.at(-1)!) as Record<string, unknown> : undefined, stdoutLines: lines }
}

test('CLI help and version have stable machine output', () => {
  const help = invoke(['--help']); assert.equal(help.status, 0); assert.equal(help.stdoutLines.length, 1); assert.equal(help.json?.status, 'ok')
  const version = invoke(['--version']); assert.equal(version.status, 0); assert.deepEqual(version.json, { status: 'ok', version: '0.1.0-rc.1' })
})

test('CLI rejects unknown commands and missing arguments with stable codes', () => {
  const unknown = invoke(['unknown']); assert.equal(unknown.status, 2); assert.deepEqual(unknown.json, { status: 'error', code: 'UNKNOWN_COMMAND' })
  const missing = invoke(['pack', 'inspect']); assert.equal(missing.status, 2); assert.deepEqual(missing.json, { status: 'error', code: 'ARGUMENT_MISSING' })
})

test('pack inspect, validate, and test share the explicit registry path', () => {
  const source = fixture('packs/third-party-minimal')
  const inspect = invoke(['pack', 'inspect', '--source', source]); const validate = invoke(['pack', 'validate', '--source', source]); const fixtureTest = invoke(['pack', 'test', '--source', source])
  assert.equal(inspect.status, 0); assert.equal(validate.status, 0); assert.equal(fixtureTest.status, 0); assert.equal(inspect.json?.packId, 'example.test/third-party-minimal'); assert.equal(validate.json?.valid, true); assert.equal(fixtureTest.json?.status, 'passed')
})

test('three vertical fixtures compile, run with Mock, and render a static trace', async () => {
  const directory = await mkdtemp(path.join(tmpdir(), 'voce-cli-'))
  try {
    const cases = [
      ['virtual-tryon', 'mock-jpeg-plus-removal'],
      ['cosplay', 'mock-native-transparent'],
      ['product-shot', 'mock-native-transparent'],
    ] as const
    for (const [name, profile] of cases) {
      const compiled = path.join(directory, name, 'compiled'); const run = path.join(directory, name, 'run'); const html = path.join(directory, name, 'trace.html')
      const compile = invoke(['case', 'compile', '--case', fixture(`cases/${name}.json`), '--scenario', fixture(`packs/${name}`), '--profile', fixture(`profiles/${profile}.json`), '--out', compiled]); assert.equal(compile.status, 0)
      const executed = invoke(['case', 'run', '--bundle', compiled, '--provider', 'mock', '--out', run]); assert.equal(executed.status, 0); assert.ok(executed.json?.semanticHash)
      const trace = invoke(['trace', 'render', '--bundle', run, '--out', html]); assert.equal(trace.status, 0); const htmlContent = await readFile(html, 'utf8'); assert.doesNotMatch(htmlContent, /data:|base64|https?:\/\/|[A-Za-z]:\\/i)
    }
  } finally { await rm(directory, { recursive: true, force: true }) }
})

test('bundle reader blocks tampered inventory before execution', async () => {
  const directory = await mkdtemp(path.join(tmpdir(), 'voce-bundle-')); const compiled = path.join(directory, 'compiled')
  try {
    const compile = invoke(['case', 'compile', '--case', fixture('cases/product-shot.json'), '--scenario', fixture('packs/product-shot'), '--profile', fixture('profiles/mock-native-transparent.json'), '--out', compiled]); assert.equal(compile.status, 0)
    await writeFile(path.join(compiled, 'case.json'), '{}', 'utf8')
    const run = invoke(['case', 'run', '--bundle', compiled, '--provider', 'mock', '--out', path.join(directory, 'run')]); assert.equal(run.status, 4); assert.equal(run.json?.code, 'BUNDLE_FILE_HASH_MISMATCH')
  } finally { await rm(directory, { recursive: true, force: true }) }
})
