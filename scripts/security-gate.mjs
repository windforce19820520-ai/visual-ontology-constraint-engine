import { cp, link, lstat, mkdir, readFile, rename, rm, symlink, writeFile } from 'node:fs/promises'
import { spawnSync } from 'node:child_process'
import path from 'node:path'
import { RELEASE_CANDIDATE, RELEASE_ROOT, ROOT, cliPath, fail, filesUnder, parseJsonLine, run, writeJson } from './m8-common.mjs'

const corpus = JSON.parse(await readFile(path.join(ROOT, 'fixtures', 'security', 'm8', 'corpus.json'), 'utf8'))
if (corpus.schemaVersion !== 'voce.security-corpus/v1alpha1') fail('M8_SECURITY_CORPUS_INVALID')
const temp = path.join(RELEASE_ROOT, 'security-temp')
await rm(temp, { recursive: true, force: true }); await mkdir(temp, { recursive: true })
const cli = cliPath()
function invokeAllowFailure(args, cwd = ROOT) {
  const result = spawn(process.execPath, [cli, ...args, '--json'], cwd)
  const json = result.stdout ? parseJsonLine(result.stdout) : undefined
  return { status: result.status, json }
}

// This local wrapper keeps expected failures observable without ever allowing them to stop the gate.
function spawn(command, args, cwd) {
  const result = spawnSync(command, args, { cwd, encoding: 'utf8', shell: command.endsWith('.cmd'), env: { ...process.env, CI: '1', npm_config_ignore_scripts: 'true' } })
  return { status: result.status, stdout: result.stdout ?? '', stderr: result.stderr ?? '' }
}

async function pathExists(target) {
  try { await lstat(target); return true } catch (error) { if (error?.code === 'ENOENT') return false; throw error }
}

const base = path.join(temp, 'base')
const compile = parseJsonLine(run(process.execPath, [cli, 'case', 'compile', '--case', path.join(ROOT, 'fixtures', 'cases', 'product-shot.json'), '--scenario', path.join(ROOT, 'fixtures', 'packs', 'product-shot'), '--profile', path.join(ROOT, 'fixtures', 'profiles', 'mock-native-transparent.json'), '--out', base, '--json']))
if (compile.status !== 'ok') fail('M8_SECURITY_BASE_COMPILE_FAILED')
const results = []
for (const item of corpus.cases) {
  if (item.requires === 'symlink' && process.platform === 'win32') { results.push({ id: item.id, status: 'skipped', reason: 'OS_PERMISSION_SYMLINK_UNAVAILABLE' }); continue }
  const directory = path.join(temp, item.id); await cp(base, directory, { recursive: true })
  const manifest = path.join(directory, 'manifest.json')
  const payload = path.join(directory, 'case.json')
  const runOutput = path.join(temp, `${item.id}-out`)
  let observed
  if (item.mutation === 'manifest-symlink') {
    const target = path.join(directory, 'manifest.real.json'); await rename(manifest, target); await symlink(target, manifest); observed = invokeAllowFailure(['case', 'run', '--bundle', directory, '--provider', 'mock', '--out', runOutput]).json?.code
  } else if (item.mutation === 'manifest-hardlink') {
    const target = path.join(directory, 'manifest.real.json'); await rename(manifest, target); await link(target, manifest); observed = invokeAllowFailure(['case', 'run', '--bundle', directory, '--provider', 'mock', '--out', runOutput]).json?.code
  } else if (item.mutation === 'payload-symlink') {
    const target = path.join(directory, 'case.real.json'); await rename(payload, target); await symlink(target, payload); observed = invokeAllowFailure(['case', 'run', '--bundle', directory, '--provider', 'mock', '--out', runOutput]).json?.code
  } else if (item.mutation === 'payload-hardlink') {
    const target = path.join(directory, 'case.real.json'); await rename(payload, target); await link(target, payload); observed = invokeAllowFailure(['case', 'run', '--bundle', directory, '--provider', 'mock', '--out', runOutput]).json?.code
  } else if (item.mutation === 'path-traversal' || item.mutation === 'case-collision' || item.mutation === 'unknown-schema' || item.mutation === 'unknown-field') {
    const value = JSON.parse(await readFile(manifest, 'utf8'))
    if (item.mutation === 'path-traversal') value.files[0].path = '../escape.json'
    if (item.mutation === 'case-collision') value.files.push({ ...value.files[0], path: value.files[0].path.toUpperCase() })
    if (item.mutation === 'unknown-schema') value.schemaVersion = 'voce.unknown/v9'
    if (item.mutation === 'unknown-field') value.unexpected = true
    await writeFile(manifest, JSON.stringify(value, null, 2), 'utf8')
    observed = invokeAllowFailure(['case', 'run', '--bundle', directory, '--provider', 'mock', '--out', runOutput]).json?.code
  } else if (item.mutation === 'missing-file') {
    await rm(payload); observed = invokeAllowFailure(['case', 'run', '--bundle', directory, '--provider', 'mock', '--out', runOutput]).json?.code
  } else if (item.mutation === 'extra-file') {
    await writeFile(path.join(directory, 'extra.json'), '{}', 'utf8'); observed = invokeAllowFailure(['case', 'run', '--bundle', directory, '--provider', 'mock', '--out', runOutput]).json?.code
  } else if (item.mutation === 'hash-tamper') {
    await writeFile(payload, '{}', 'utf8'); observed = invokeAllowFailure(['case', 'run', '--bundle', directory, '--provider', 'mock', '--out', runOutput]).json?.code
  } else if (item.mutation === 'output-input-overlap') {
    observed = invokeAllowFailure(['case', 'compile', '--case', path.join(ROOT, 'fixtures', 'cases', 'product-shot.json'), '--scenario', path.join(ROOT, 'fixtures', 'packs', 'product-shot'), '--profile', path.join(ROOT, 'fixtures', 'profiles', 'mock-native-transparent.json'), '--out', path.join(ROOT, 'fixtures', 'cases', 'product-shot.json')]).json?.code
  } else if (item.mutation === 'scenario-pack-executable') {
    const source = path.join(directory, 'pack.json'); const original = JSON.parse(await readFile(path.join(ROOT, 'fixtures', 'packs', 'third-party-minimal', 'pack.json'), 'utf8')); original.packId = `security.example/${item.id}`; original.declarations = { ...(original.declarations ?? {}), containsExecutableFiles: true }; await writeFile(source, JSON.stringify(original, null, 2), 'utf8')
    observed = invokeAllowFailure(['pack', 'inspect', '--source', directory]).json?.code
  }
  const passed = observed === item.expectedCode
  if (!passed) fail(`M8_SECURITY_CASE_FAILED:${item.id}:expected=${item.expectedCode}:observed=${observed}`)
  const mustNotWriteOutput = !['output-input-overlap', 'scenario-pack-executable'].includes(item.mutation)
  if (mustNotWriteOutput && await pathExists(runOutput)) fail(`M8_SECURITY_FAILURE_WROTE_OUTPUT:${item.id}`)
  results.push({ id: item.id, status: 'passed', code: observed, ...(mustNotWriteOutput ? { outputAbsent: true } : {}) })
  await rm(directory, { recursive: true, force: true })
}

const runtimeSources = []
for (const packageName of ['cli', 'core']) {
  const directory = path.join(ROOT, 'packages', packageName, 'src')
  for (const relative of await filesUnder(directory)) if (relative.endsWith('.ts') && !relative.endsWith('.test.ts')) runtimeSources.push(path.join(directory, ...relative.split('/')))
}
for (const file of runtimeSources) {
  const source = await readFile(file, 'utf8')
  if (/\b(fetch|axios|node:https?|http\.request|https\.request)\b/.test(source)) fail(`M8_NETWORK_GATE_SOURCE_MATCH:${path.basename(file)}`)
}

const summary = { status: 'passed', releaseCandidate: RELEASE_CANDIDATE, corpus: corpus.cases.length, results, networkGate: { runtimeSourceScan: 'passed', providerCalls: 'not invoked', authMaterial: 'not inspected' } }
await writeJson(path.join(RELEASE_ROOT, 'security-summary.json'), summary)
await rm(temp, { recursive: true, force: true })
console.log(JSON.stringify({ status: 'passed', cases: results.filter((item) => item.status === 'passed').length, skipped: results.filter((item) => item.status === 'skipped').length, networkGate: 'passed' }))
