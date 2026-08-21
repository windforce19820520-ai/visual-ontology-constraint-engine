import { cp, mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { PACKAGE_NAMES, RELEASE_CANDIDATE, RELEASE_ROOT, ROOT, assertCleanTrackedWorktree, contentInventory, fail, run, runAllowFailure, sourceRevision, writeJson } from './m8-common.mjs'

assertCleanTrackedWorktree()
const revision = sourceRevision()
await rm(RELEASE_ROOT, { recursive: true, force: true }); await mkdir(RELEASE_ROOT, { recursive: true })
const node = process.execPath
const validation = run(node, [path.join(ROOT, 'scripts', 'validate-repository.mjs')])
const typecheck = run(node, [path.join(ROOT, 'node_modules', 'typescript', 'bin', 'tsc'), '-b', '--pretty', 'false'])
const testOutput = run(node, [path.join(ROOT, 'scripts', 'run-tests.mjs')])
const testCount = Number(testOutput.match(/tests\s+(\d+)/)?.[1] ?? 0)
const passCount = Number(testOutput.match(/pass\s+(\d+)/)?.[1] ?? 0)
const failCount = Number(testOutput.match(/fail\s+(\d+)/)?.[1] ?? 0)
const skippedCount = Number(testOutput.match(/skipped\s+(\d+)/)?.[1] ?? 0)
if (testCount < 103 || failCount !== 0) fail(`M8_STANDARD_TEST_GATE_FAILED:${testCount}/${passCount}/${failCount}/${skippedCount}`)

run(node, [path.join(ROOT, 'scripts', 'compatibility.mjs')])
run(node, [path.join(ROOT, 'scripts', 'security-gate.mjs')])
const consumerRoom = path.join(ROOT, 'clean-room', `m8-${RELEASE_CANDIDATE}`)
run(node, [path.join(ROOT, 'scripts', 'consumer.mjs'), consumerRoom])
const consumerSummary = JSON.parse(await readFile(path.join(consumerRoom, 'consumer-summary.json'), 'utf8'))
if (consumerSummary.status !== 'passed' || consumerSummary.workspaceSymlinks !== false) fail('M8_CONSUMER_GATE_FAILED')
await cp(path.join(consumerRoom, 'tarballs'), path.join(RELEASE_ROOT, 'tarballs'), { recursive: true })
await cp(path.join(consumerRoom, 'output'), path.join(RELEASE_ROOT, 'verticals'), { recursive: true })
await writeJson(path.join(RELEASE_ROOT, 'consumer-summary.json'), consumerSummary)
run(node, [path.join(ROOT, 'scripts', 'reproducibility.mjs')])

const licenses = await import('./m8-common.mjs').then(({ readLockPackageMetadata }) => readLockPackageMetadata())
await writeJson(path.join(RELEASE_ROOT, 'package-audit.json'), consumerSummary.packageAudit)
await writeJson(path.join(RELEASE_ROOT, 'version-matrix.json'), { releaseCandidate: RELEASE_CANDIDATE, sourceRevision: revision, nodeBaseline: '>=20', ci: { ubuntu: 'Node 20', windows: 'Node 20', publicConsumer: 'Node 22' }, packages: consumerSummary.packageAudit.map((item) => ({ name: item.name, version: item.version })) })
await writeJson(path.join(RELEASE_ROOT, 'licenses.json'), { schemaVersion: 'voce.local-sbom/v1alpha1', source: ['pnpm-lock.yaml', 'installed public package metadata'], status: 'metadata-only', entries: licenses, unknownPolicy: 'Missing license or engine metadata is recorded as unknown; no provenance or license assertion is inferred.' })

await writeJson(path.join(RELEASE_ROOT, 'summary.json'), {
  status: 'passed', releaseCandidate: RELEASE_CANDIDATE, sourceRevision: revision,
  standardTests: { total: testCount, passed: passCount, failed: failCount, skipped: skippedCount, skipCondition: 'Windows symlink permission may skip exactly two tests; Linux CI must execute them.' },
  gates: { repositoryValidation: 'passed', typecheck: 'passed', compatibility: 'passed', cleanConsumer: 'passed', security: 'passed', reproducibility: 'passed', checksums: 'passed' },
  consumer: { packageSources: 'local-tarballs', ignoreScripts: true, workspaceSymlinks: false, packages: consumerSummary.packageAudit.length, packs: consumerSummary.packs.length, verticals: consumerSummary.verticals.length, compareReportHash: consumerSummary.comparison.reportHash },
  supplyChain: { sbom: 'local-sbom', checksums: 'checksums.sha256', officialAttestation: false },
  deferred: ['npm publish', 'GitHub Release/tag', 'merge', 'real Seedream/LLM/provider smoke', 'production readiness'],
})
const manifestFiles = await contentInventory(RELEASE_ROOT, new Set(['checksums.sha256', 'build-manifest.json']))
await writeJson(path.join(RELEASE_ROOT, 'build-manifest.json'), { schemaVersion: 'voce.local-build-manifest/v1alpha1', kind: 'local-build-manifest', officialAttestation: false, releaseCandidate: RELEASE_CANDIDATE, sourceRevision: revision, inventoryCoverage: { excludes: ['checksums.sha256', 'build-manifest.json'], reason: 'The embedded inventory excludes itself and the checksum file.' }, checksumCoverage: { excludes: ['checksums.sha256'], reason: 'The checksum file excludes only itself and protects this build manifest.' }, files: manifestFiles })
const checksummed = await contentInventory(RELEASE_ROOT, new Set(['checksums.sha256']))
await writeFile(path.join(RELEASE_ROOT, 'checksums.sha256'), checksummed.map((item) => `${item.sha256}  ${item.path}`).join('\n') + '\n', 'utf8')
const verify = run(node, [path.join(ROOT, 'scripts', 'verify-checksums.mjs'), RELEASE_ROOT])
const tamperRoot = path.join(ROOT, 'release-candidate', `.checksum-tamper-${RELEASE_CANDIDATE}`)
await cp(RELEASE_ROOT, tamperRoot, { recursive: true }); await writeFile(path.join(tamperRoot, 'summary.json'), 'tampered\n', 'utf8')
const tamper = runAllowFailure(node, [path.join(ROOT, 'scripts', 'verify-checksums.mjs'), tamperRoot]); await rm(tamperRoot, { recursive: true, force: true })
if (tamper.status === 0) fail('M8_CHECKSUM_TAMPER_NOT_DETECTED')
await cp(RELEASE_ROOT, tamperRoot, { recursive: true }); await writeFile(path.join(tamperRoot, 'build-manifest.json'), 'tampered\n', 'utf8')
const manifestTamper = runAllowFailure(node, [path.join(ROOT, 'scripts', 'verify-checksums.mjs'), tamperRoot]); await rm(tamperRoot, { recursive: true, force: true })
if (manifestTamper.status === 0) fail('M8_BUILD_MANIFEST_TAMPER_NOT_DETECTED')

console.log(JSON.stringify({ status: 'passed', output: 'release-candidate/v0.1.0-rc.5', sourceRevision: revision, tests: { total: testCount, passed: passCount, skipped: skippedCount }, packages: PACKAGE_NAMES.length, consumer: 'passed', reproducibility: 'passed', checksumTamper: 'artifact-and-build-manifest-rejected', provenance: 'local-build-manifest-only' }))
