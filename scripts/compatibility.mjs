import { cp, mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { RELEASE_CANDIDATE, ROOT, RELEASE_ROOT, cliPath, fail, parseJsonLine, run, writeJson } from './m8-common.mjs'

const suiteRoot = path.join(ROOT, 'compatibility', `v${RELEASE_CANDIDATE}`)
const suite = JSON.parse(await readFile(path.join(suiteRoot, 'manifest.json'), 'utf8'))
if (suite.schemaVersion !== 'voce.compatibility-suite/v1alpha1' || suite.releaseCandidate !== RELEASE_CANDIDATE) fail('M8_COMPATIBILITY_MANIFEST_INVALID')

const packageSources = {
  '@voce-engine/contracts': path.join(ROOT, 'packages', 'contracts'),
  '@voce-engine/core': path.join(ROOT, 'packages', 'core'),
  '@voce-engine/testkit': path.join(ROOT, 'packages', 'testkit'),
  '@voce-engine/cli': path.join(ROOT, 'packages', 'cli'),
  '@voce-engine/playground': path.join(ROOT, 'playground'),
}
const typeChecks = {}
for (const [name, exports] of Object.entries(suite.candidatePublicSurface)) {
  const sourceFiles = []
  async function collectSource(directory) {
    for (const entry of await import('node:fs/promises').then(({ readdir }) => readdir(directory, { withFileTypes: true }))) {
      const file = path.join(directory, entry.name)
      if (entry.isDirectory()) await collectSource(file)
      else if (entry.isFile() && file.endsWith('.ts')) sourceFiles.push(file)
    }
  }
  await collectSource(path.join(packageSources[name], 'src'))
  const source = (await Promise.all(sourceFiles.map((file) => readFile(file, 'utf8')))).join('\n')
  const declarationFiles = []
  const distRoot = path.join(packageSources[name], 'dist')
  async function collect(directory) {
    for (const entry of await import('node:fs/promises').then(({ readdir }) => readdir(directory, { withFileTypes: true }))) {
      const file = path.join(directory, entry.name)
      if (entry.isDirectory()) await collect(file)
      else if (entry.isFile() && file.endsWith('.d.ts')) declarationFiles.push(file)
    }
  }
  await collect(distRoot)
  const declarations = (await Promise.all(declarationFiles.map((file) => readFile(file, 'utf8')))).join('\n')
  typeChecks[name] = exports.map((exportName) => ({ name: exportName, source: new RegExp(`\\b${exportName}\\b`).test(source), declaration: new RegExp(`\\b${exportName}\\b`).test(declarations) }))
  if (typeChecks[name].some((item) => !item.source || !item.declaration)) fail(`M8_COMPATIBILITY_EXPORT_MISSING:${name}`)
}

const schemaChecks = []
for (const item of suite.schemaIds) {
  const file = path.join(ROOT, 'packages', 'contracts', 'schemas', item.file)
  const schema = JSON.parse(await readFile(file, 'utf8'))
  if (schema.$id !== item.id) fail(`M8_SCHEMA_ID_MISMATCH:${item.file}`)
  schemaChecks.push({ file: item.file, id: schema.$id })
}

const cli = cliPath()
function cliRun(args) { return parseJsonLine(run(process.execPath, [cli, ...args, '--json'])) }
const temp = path.join(RELEASE_ROOT, 'compatibility-temp')
await rm(temp, { recursive: true, force: true }); await mkdir(temp, { recursive: true })
const original = path.join(ROOT, 'fixtures', 'packs', 'third-party-minimal')
const renamed = path.join(temp, 'renamed-third-party')
await cp(original, renamed, { recursive: true })
const renamedManifestPath = path.join(renamed, 'pack.json')
const renamedManifest = JSON.parse(await readFile(renamedManifestPath, 'utf8'))
renamedManifest.packId = 'renamed.example/third-party-minimal'
await writeFile(renamedManifestPath, JSON.stringify(renamedManifest, null, 2) + '\n', 'utf8')
function stablePack(value) {
  return {
    status: value.status,
    packId: value.packId,
    resolutionHash: value.resolutionHash,
    lockHash: value.lockHash,
    effectiveScenarioHash: value.effectiveScenarioHash,
    fixtureCount: value.fixtureCount,
    results: (value.results ?? []).map((result) => ({ id: result.id, status: result.status, assertionIds: result.assertionIds, assertionHash: result.assertionHash, observedHashes: result.observedHashes })),
  }
}
const packRuns = []
for (const [label, source] of [['first-party-third-party-fixture', original], ['renamed-third-party', renamed]]) {
  const first = cliRun(['pack', 'test', '--source', source])
  const second = cliRun(['pack', 'test', '--source', source])
  const stableFirst = stablePack(first); const stableSecond = stablePack(second)
  if (JSON.stringify(stableFirst) !== JSON.stringify(stableSecond)) fail(`M8_COMPATIBILITY_NONDETERMINISTIC:${label}`)
  packRuns.push({ label, ...stableFirst })
}

const core = await import(pathToFileURL(path.join(ROOT, 'packages', 'core', 'dist', 'index.js')).href)
const contracts = await import(pathToFileURL(path.join(ROOT, 'packages', 'contracts', 'dist', 'index.js')).href)
const mock = new core.MockProviderAdapter()
if (mock.offline !== true || !/^sha256:[0-9a-f]{64}$/.test(core.MOCK_IMAGE_PROFILE.profileHash)) fail('M8_MOCK_PROFILE_UNSAFE')
if (contracts.BUNDLE_MANIFEST_SCHEMA_VERSION !== 'voce.bundle-manifest/v1alpha1') fail('M8_BUNDLE_SCHEMA_UNEXPECTED')

const summary = { status: 'passed', suite: suite.schemaVersion, releaseCandidate: RELEASE_CANDIDATE, packages: suite.publicPackages, exports: typeChecks, schemas: schemaChecks, packRuns, providerProfile: { id: core.MOCK_IMAGE_PROFILE.id, profileHash: core.MOCK_IMAGE_PROFILE.profileHash, mockAdapterOffline: mock.offline === true }, bundleManifest: { schemaVersion: contracts.BUNDLE_MANIFEST_SCHEMA_VERSION, unsafeInputBehavior: 'hash-and-path validation before Mock execution' } }
await writeJson(path.join(RELEASE_ROOT, 'compatibility-summary.json'), summary)
await rm(temp, { recursive: true, force: true })
console.log(JSON.stringify({ status: 'passed', packages: suite.publicPackages.length, schemas: schemaChecks.length, packVariants: packRuns.length }))
