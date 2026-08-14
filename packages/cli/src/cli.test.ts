import { test } from 'node:test'
import assert from 'node:assert/strict'
import { link, lstat, mkdir, mkdtemp, readFile, readdir, rename, rm, symlink, writeFile } from 'node:fs/promises'
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
async function runtimeSourceFiles(directory: string): Promise<string[]> {
  const result: string[] = []
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const filePath = path.join(directory, entry.name)
    if (entry.isDirectory()) result.push(...await runtimeSourceFiles(filePath))
    else if (entry.isFile() && filePath.endsWith('.ts') && !filePath.endsWith('.test.ts')) result.push(filePath)
  }
  return result.sort()
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
  assert.equal(inspect.status, 0); assert.equal(validate.status, 0); assert.equal(fixtureTest.status, 0); assert.equal(inspect.json?.packId, 'example.test/third-party-minimal'); assert.equal(validate.json?.valid, true); assert.equal(fixtureTest.json?.status, 'passed'); const results = fixtureTest.json?.results as Array<Record<string, unknown>>; assert.deepEqual(results[0].assertions && (results[0].assertions as Array<Record<string, unknown>>).map((item) => item.status), ['passed', 'passed', 'passed']); assert.match(String(results[0].assertionHash), /^sha256:[0-9a-f]{64}$/)
})

test('runtime CLI and Core source contains no first-party scenario-name branches', async () => {
  const scenarioName = /virtual-tryon|cosplay|product-shot/i
  for (const packageName of ['cli', 'core']) {
    for (const filePath of await runtimeSourceFiles(path.join(root, 'packages', packageName, 'src'))) {
      assert.doesNotMatch(await readFile(filePath, 'utf8'), scenarioName, filePath)
    }
  }
})

test('third-party declarations drive person-image disclosure independently of packId', async () => {
  const directory = await mkdtemp(path.join(tmpdir(), 'voce-pack-declarations-')); const source = JSON.parse(await readFile(fixture('packs/third-party-minimal/pack.json'), 'utf8')) as Record<string, unknown>; const inspected: Array<Record<string, unknown>> = []
  try {
    for (const packId of ['example.test/third-party-minimal', 'renamed.example/arbitrary-pack']) {
      const packDirectory = path.join(directory, packId.includes('/') ? packId.split('/').at(-1)! : packId); await mkdir(packDirectory, { recursive: true }); await writeFile(path.join(packDirectory, 'pack.json'), JSON.stringify({ ...source, packId }, null, 2), 'utf8')
      const result = invoke(['pack', 'inspect', '--source', packDirectory]); assert.equal(result.status, 0); inspected.push(result.json!)
    }
    const stableSemanticView = (value: Record<string, unknown>) => ({ version: value.version, kind: value.kind, declarations: value.declarations, fixtureSuites: value.fixtureSuites })
    assert.deepEqual(stableSemanticView(inspected[0]), stableSemanticView(inspected[1])); assert.deepEqual(inspected[0].declarations, { mayHandlePersonImages: true, rightsDisclosureRequired: true }); const invalidDirectory = path.join(directory, 'invalid-declarations'); await mkdir(invalidDirectory); await writeFile(path.join(invalidDirectory, 'pack.json'), JSON.stringify({ ...source, declarations: { mayHandlePersonImages: true, rightsDisclosureRequired: true, unexpected: false } }), 'utf8'); const invalid = invoke(['pack', 'inspect', '--source', invalidDirectory]); assert.equal(invalid.status, 4); assert.deepEqual(invalid.json, { status: 'error', code: 'PACK_DECLARATIONS_UNKNOWN_FIELD' })
  } finally { await rm(directory, { recursive: true, force: true }) }
})

test('three vertical fixtures compile, run with Mock, and render a static trace', async () => {
  const directory = await mkdtemp(path.join(tmpdir(), 'voce-cli-'))
  try {
    const cases = [
      ['virtual-tryon', 'mock-jpeg'],
      ['cosplay', 'mock-image'],
      ['product-shot', 'mock-image'],
    ] as const
    for (const [name, profile] of cases) {
      const compiled = path.join(directory, name, 'compiled'); const run = path.join(directory, name, 'run'); const html = path.join(directory, name, 'trace.html')
      const compile = invoke(['case', 'compile', '--case', fixture(`cases/${name}.json`), '--scenario', fixture(`packs/${name}`), '--profile', fixture(`profiles/${profile}.json`), '--out', compiled]); assert.equal(compile.status, 0); const compileAcceptance = JSON.parse(await readFile(path.join(compiled, 'acceptance.json'), 'utf8')) as Record<string, unknown>; const compileAssertions = compileAcceptance.assertions as Array<Record<string, unknown>>; assert.ok(compileAssertions.length > 0); assert.ok(compileAssertions.every((item) => item.status === 'passed')); assert.ok(compileAssertions.every((item) => /^sha256:[0-9a-f]{64}$/.test(String(item.observedHash))))
      const executed = invoke(['case', 'run', '--bundle', compiled, '--provider', 'mock', '--out', run]); assert.equal(executed.status, 0); assert.ok(executed.json?.semanticHash); const runAcceptance = JSON.parse(await readFile(path.join(run, 'acceptance.json'), 'utf8')) as Record<string, unknown>; const runAssertions = runAcceptance.assertions as Array<Record<string, unknown>>; assert.equal(runAssertions.length, compileAssertions.length + (name === 'virtual-tryon' ? 6 : name === 'cosplay' ? 2 : 2)); assert.ok(runAssertions.every((item) => item.status === 'passed')); assert.match(String(runAcceptance.assertionHash), /^sha256:[0-9a-f]{64}$/)
      const trace = invoke(['trace', 'render', '--bundle', run, '--out', html]); assert.equal(trace.status, 0); const htmlContent = await readFile(html, 'utf8'); assert.doesNotMatch(htmlContent, /data:|base64|https?:\/\/|[A-Za-z]:\\/i)
    }
  } finally { await rm(directory, { recursive: true, force: true }) }
})

test('bundle manifest symlink and hardlink are rejected before execution', async (t) => {
  const directory = await mkdtemp(path.join(tmpdir(), 'voce-bundle-links-')); const compiled = path.join(directory, 'compiled'); const output = path.join(directory, 'run')
  try {
    assert.equal(invoke(['case', 'compile', '--case', fixture('cases/product-shot.json'), '--scenario', fixture('packs/product-shot'), '--profile', fixture('profiles/mock-image.json'), '--out', compiled]).status, 0)
    const manifest = path.join(compiled, 'manifest.json'); const backup = path.join(compiled, 'manifest.real.json'); const original = await readFile(manifest)
    await rename(manifest, backup)
    try { await symlink(backup, manifest) } catch (error) { await rename(backup, manifest); t.skip(`symlink unavailable: ${String(error)}`); return }
    const symlinked = invoke(['case', 'run', '--bundle', compiled, '--provider', 'mock', '--out', output]); assert.equal(symlinked.status, 4); assert.deepEqual(symlinked.json, { status: 'error', code: 'BUNDLE_MANIFEST_UNSAFE' }); assert.equal(await readFile(backup, 'utf8'), new TextDecoder().decode(original)); await assert.rejects(lstat(output), (error: unknown) => (error as NodeJS.ErrnoException).code === 'ENOENT')
  } finally { await rm(directory, { recursive: true, force: true }) }
})

test('bundle manifest hardlink is rejected before execution', async (t) => {
  const directory = await mkdtemp(path.join(tmpdir(), 'voce-bundle-hardlink-')); const compiled = path.join(directory, 'compiled'); const output = path.join(directory, 'run')
  try {
    assert.equal(invoke(['case', 'compile', '--case', fixture('cases/product-shot.json'), '--scenario', fixture('packs/product-shot'), '--profile', fixture('profiles/mock-image.json'), '--out', compiled]).status, 0)
    const manifest = path.join(compiled, 'manifest.json'); const target = path.join(compiled, 'manifest.real.json'); await rename(manifest, target)
    try { await link(target, manifest) } catch (error) { await rename(target, manifest); t.skip(`hardlink unavailable: ${String(error)}`); return }
    const linked = invoke(['case', 'run', '--bundle', compiled, '--provider', 'mock', '--out', output]); assert.equal(linked.status, 4); assert.deepEqual(linked.json, { status: 'error', code: 'BUNDLE_MANIFEST_UNSAFE' }); await assert.rejects(lstat(output), (error: unknown) => (error as NodeJS.ErrnoException).code === 'ENOENT')
  } finally { await rm(directory, { recursive: true, force: true }) }
})

test('standard ScenarioPack manifest symlink is rejected before JSON parsing', async (t) => {
  const directory = await mkdtemp(path.join(tmpdir(), 'voce-pack-link-')); const rootPack = path.join(directory, 'pack'); const standard = path.join(rootPack, 'scenario-pack');
  try {
    await mkdir(standard, { recursive: true }); const target = path.join(directory, 'manifest-target.json'); await writeFile(target, '{}', 'utf8')
    try { await symlink(target, path.join(standard, 'manifest.json')) } catch (error) { t.skip(`symlink unavailable: ${String(error)}`); return }
    const result = invoke(['pack', 'inspect', '--source', rootPack]); assert.equal(result.status, 4); assert.deepEqual(result.json, { status: 'error', code: 'PACK_MANIFEST_UNSAFE' })
  } finally { await rm(directory, { recursive: true, force: true }) }
})

test('compile, run, trace, and compare reject output paths that overlap inputs', async () => {
  const directory = await mkdtemp(path.join(tmpdir(), 'voce-output-overlap-')); const compiled = path.join(directory, 'compiled'); const run = path.join(directory, 'run'); const casePath = fixture('cases/product-shot.json'); const scenarioPath = fixture('packs/product-shot'); const profilePath = fixture('profiles/mock-image.json')
  try {
    const caseBefore = await readFile(casePath); assert.equal(invoke(['case', 'compile', '--case', casePath, '--scenario', scenarioPath, '--profile', profilePath, '--out', casePath]).status, 6); assert.deepEqual(await readFile(casePath), caseBefore)
    assert.equal(invoke(['case', 'compile', '--case', casePath, '--scenario', scenarioPath, '--profile', profilePath, '--out', compiled]).status, 0); const compiledBefore = await readFile(path.join(compiled, 'manifest.json')); assert.equal(invoke(['case', 'run', '--bundle', compiled, '--provider', 'mock', '--out', compiled]).status, 6); assert.deepEqual(await readFile(path.join(compiled, 'manifest.json')), compiledBefore)
    assert.equal(invoke(['case', 'run', '--bundle', compiled, '--provider', 'mock', '--out', run]).status, 0); const runBefore = await readFile(path.join(run, 'manifest.json')); const trace = invoke(['trace', 'render', '--bundle', run, '--out', path.join(run, 'manifest.json')]); assert.equal(trace.status, 6); assert.deepEqual(await readFile(path.join(run, 'manifest.json')), runBefore)
    const compare = invoke(['compare', '--before', run, '--after', run, '--out', path.join(run, 'trace-model.json')]); assert.equal(compare.status, 6); assert.deepEqual(await readFile(path.join(run, 'manifest.json')), runBefore)
  } finally { await rm(directory, { recursive: true, force: true }) }
})

test('bundle reader blocks tampered inventory before execution', async () => {
  const directory = await mkdtemp(path.join(tmpdir(), 'voce-bundle-')); const compiled = path.join(directory, 'compiled')
  try {
    const compile = invoke(['case', 'compile', '--case', fixture('cases/product-shot.json'), '--scenario', fixture('packs/product-shot'), '--profile', fixture('profiles/mock-image.json'), '--out', compiled]); assert.equal(compile.status, 0)
    await writeFile(path.join(compiled, 'case.json'), '{}', 'utf8')
    const run = invoke(['case', 'run', '--bundle', compiled, '--provider', 'mock', '--out', path.join(directory, 'run')]); assert.equal(run.status, 4); assert.equal(run.json?.code, 'BUNDLE_FILE_HASH_MISMATCH')
  } finally { await rm(directory, { recursive: true, force: true }) }
})
