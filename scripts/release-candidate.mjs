import { createHash } from 'node:crypto'
import { cp, mkdir, readFile, readdir, rm, stat, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { spawnSync } from 'node:child_process'
import process from 'node:process'
import { fileURLToPath } from 'node:url'

const root = fileURLToPath(new URL('..', import.meta.url))
const output = path.join(root, 'release-candidate', 'v0.1.0-rc.1')
const node = process.execPath
const pnpm = process.platform === 'win32' ? 'pnpm.cmd' : 'pnpm'
const cli = path.join(root, 'packages', 'cli', 'dist', 'cli.js')

function fail(message) { throw new Error(message) }
function run(command, args, cwd = root, options = {}) {
  const result = spawnSync(command, args, { cwd, encoding: 'utf8', stdio: options.stdio ?? 'pipe', shell: command.endsWith('.cmd'), env: { ...process.env, CI: '1' } })
  if (result.error) throw result.error
  if (result.status !== 0) fail(`${command} ${args.join(' ')} failed with ${result.status}: ${(result.stderr ?? '').trim()}`)
  return result.stdout ?? ''
}
function writeJson(file, value) { return writeFile(file, JSON.stringify(value, null, 2) + '\n', 'utf8') }
async function filesUnder(directory, relative = '') {
  const entries = await readdir(path.join(directory, relative), { withFileTypes: true })
  const result = []
  for (const entry of entries.sort((a, b) => a.name.localeCompare(b.name))) {
    const child = path.join(relative, entry.name)
    if (entry.isDirectory()) result.push(...await filesUnder(directory, child))
    else if (entry.isFile()) result.push(child.replaceAll('\\', '/'))
  }
  return result
}
async function sha256File(file) { return `sha256:${createHash('sha256').update(await readFile(file)).digest('hex')}` }
function cliRun(args) { return run(node, [cli, ...args, '--json']) }
function parseOutput(stdout) { const lines = stdout.trim().split(/\r?\n/); return JSON.parse(lines.at(-1)) }

await rm(output, { recursive: true, force: true })
await mkdir(output, { recursive: true })
run(node, ['scripts/validate-repository.mjs'])
run(node, [path.join(root, 'node_modules', 'typescript', 'bin', 'tsc'), '-b', '--pretty', 'false'])
run(node, ['scripts/run-tests.mjs'])

const packs = [
  ['virtual-tryon', 'fixtures/cases/virtual-tryon.json', 'fixtures/profiles/mock-jpeg-plus-removal.json'],
  ['cosplay', 'fixtures/cases/cosplay.json', 'fixtures/profiles/mock-native-transparent.json'],
  ['product-shot', 'fixtures/cases/product-shot.json', 'fixtures/profiles/mock-native-transparent.json'],
]
const packAudits = []
for (const [name, caseFile, profileFile] of packs) {
  const pack = `fixtures/packs/${name}`
  const inspect = parseOutput(cliRun(['pack', 'inspect', '--source', pack]))
  const validate = parseOutput(cliRun(['pack', 'validate', '--source', pack]))
  const fixtureTest = parseOutput(cliRun(['pack', 'test', '--source', pack]))
  const compiledDir = path.join(output, name, 'compiled')
  const runDir = path.join(output, name, 'run')
  const traceFile = path.join(output, name, 'trace.html')
  const compiled = parseOutput(cliRun(['case', 'compile', '--case', caseFile, '--scenario', pack, '--profile', profileFile, '--out', compiledDir]))
  const executed = parseOutput(cliRun(['case', 'run', '--bundle', compiledDir, '--provider', 'mock', '--out', runDir]))
  const trace = parseOutput(cliRun(['trace', 'render', '--bundle', runDir, '--out', traceFile]))
  packAudits.push({ name, inspect, validate, fixtureTest, compiled, executed, trace })
}

const packageNames = ['@voce/contracts', '@voce/core', '@voce/testkit', '@voce/cli']
const packageAudit = []
for (const name of packageNames) {
  const packageDirectory = path.join(root, 'packages', name.split('/').at(-1))
  const manifest = JSON.parse(await readFile(path.join(packageDirectory, 'package.json'), 'utf8'))
  if (Object.keys(manifest.scripts ?? {}).some((key) => ['preinstall', 'install', 'postinstall', 'prepare'].includes(key))) fail(`${name} contains an install lifecycle script`)
  const dryRun = run(pnpm, ['pack', '--dry-run'], packageDirectory)
  if (/(node_modules|\.pnpm-store|\.env|release-candidate|clean-room)/i.test(dryRun)) fail(`${name} pack dry-run contains a forbidden path`)
  packageAudit.push({ name, version: manifest.version, files: manifest.files ?? [], lifecycleScripts: false, dryRun: dryRun.replaceAll(root, '<repository>') })
}

await writeJson(path.join(output, 'package-audit.json'), packageAudit)
await writeJson(path.join(output, 'version-matrix.json'), { releaseCandidate: '0.1.0-rc.1', node: '>=20', packages: packageAudit.map((item) => ({ name: item.name, version: item.version })) })
await writeJson(path.join(output, 'licenses.json'), { source: 'workspace manifests and pnpm-lock.yaml', status: 'declared', entries: packageNames.map((name) => ({ name, license: 'Apache-2.0' })), missingThirdPartyMetadata: ['semver license metadata is not duplicated into the repository; inspect the lock/install metadata during distribution review.'] })
await writeJson(path.join(output, 'summary.json'), { status: 'passed', releaseCandidate: '0.1.0-rc.1', packages: packageNames.length, verticalCases: packAudits, checksums: 'checksums.sha256', provenance: 'local-build-manifest-only' })
const allFiles = await filesUnder(output)
const checksums = []
for (const relative of allFiles.sort()) if (!['checksums.sha256', 'build-manifest.json'].includes(relative)) checksums.push(`${await sha256File(path.join(output, ...relative.split('/')))}  ${relative}`)
await writeFile(path.join(output, 'checksums.sha256'), checksums.join('\n') + '\n', 'utf8')
await writeJson(path.join(output, 'build-manifest.json'), { schemaVersion: 'voce.local-build-manifest/v1alpha1', kind: 'local-build-manifest', officialAttestation: false, note: 'This local manifest is not a GitHub artifact attestation or npm provenance statement.', releaseCandidate: '0.1.0-rc.1', sourceRevision: run('git', ['rev-parse', 'HEAD']).trim(), checksumCoverage: { excludes: ['checksums.sha256', 'build-manifest.json'], reason: 'Avoids self-referential provenance and checksum cycles.' }, files: checksums.map((line) => { const [sha, relative] = line.split('  '); return { path: relative, sha256: sha } }) })
console.log(JSON.stringify({ status: 'passed', output: 'release-candidate/v0.1.0-rc.1', verticalCases: packAudits.length, packages: packageNames.length, provenance: 'local-build-manifest-only' }))
