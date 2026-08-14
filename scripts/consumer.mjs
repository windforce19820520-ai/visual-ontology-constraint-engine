import { cp, lstat, mkdir, readFile, realpath, rename, rm, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { RELEASE_CANDIDATE, RELEASE_ROOT, ROOT, PNPM, cliPath, fail, packPublicPackages, parseJsonLine, run, writeJson } from './m8-common.mjs'

export async function runConsumer(room = path.join(ROOT, 'clean-room', `m8-${RELEASE_CANDIDATE}`)) {
  await rm(room, { recursive: true, force: true })
  const tarballs = path.join(room, 'tarballs'); const app = path.join(room, 'app'); const packs = path.join(room, 'packs'); const cases = path.join(room, 'cases'); const profiles = path.join(room, 'profiles'); const output = path.join(room, 'output')
  await mkdir(tarballs, { recursive: true }); await mkdir(app, { recursive: true }); await mkdir(packs, { recursive: true }); await mkdir(cases, { recursive: true }); await mkdir(profiles, { recursive: true }); await mkdir(output, { recursive: true })
  const packageAudit = await packPublicPackages(tarballs)
  const semverDirectory = path.join(ROOT, 'node_modules', '.pnpm', 'semver@7.7.2', 'node_modules', 'semver')
  const before = new Set(await (await import('node:fs/promises')).readdir(tarballs)); run(PNPM, ['pack', '--pack-destination', tarballs], semverDirectory)
  const semverTarball = (await (await import('node:fs/promises')).readdir(tarballs)).find((file) => !before.has(file) && file.startsWith('semver-') && file.endsWith('.tgz'))
  if (!semverTarball) fail('M8_CONSUMER_SEMVER_TARBALL_MISSING')
  const tarballName = (name) => path.basename(packageAudit.find((item) => item.name === name)?.tarball ?? fail(`M8_CONSUMER_TARBALL_MISSING:${name}`))
  const localDependencies = {
    '@voce/contracts': `file:../tarballs/${tarballName('@voce/contracts')}`,
    '@voce/core': `file:../tarballs/${tarballName('@voce/core')}`,
    '@voce/testkit': `file:../tarballs/${tarballName('@voce/testkit')}`,
    '@voce/cli': `file:../tarballs/${tarballName('@voce/cli')}`,
    semver: `file:../tarballs/${semverTarball}`,
  }
  await writeFile(path.join(app, 'package.json'), JSON.stringify({ name: 'voce-m8-consumer', private: true, type: 'module', dependencies: localDependencies }, null, 2) + '\n', 'utf8')
  await writeFile(path.join(app, 'pnpm-workspace.yaml'), `overrides:\n${Object.entries(localDependencies).map(([name, value]) => `  '${name}': '${value}'`).join('\n')}\n`, 'utf8')
  let installMode = 'local-tarballs-offline'
  try { run(PNPM, ['install', '--ignore-scripts', '--package-import-method', 'copy', '--offline'], app) } catch { installMode = 'local-tarballs-plus-open-source-dependencies'; run(PNPM, ['install', '--ignore-scripts', '--package-import-method', 'copy'], app) }

  const dependencyPaths = {}
  for (const name of ['contracts', 'core', 'testkit', 'cli']) {
    const dependencyPath = path.join(app, 'node_modules', '@voce', name); const metadata = await lstat(dependencyPath); const resolved = await realpath(dependencyPath)
    if (!resolved.startsWith(room + path.sep) || resolved.includes(`${path.sep}packages${path.sep}`)) fail(`M8_CONSUMER_WORKSPACE_FALLBACK:${name}`)
    dependencyPaths[`@voce/${name}`] = { insideRoom: true, symlinkToWorkspace: false }
    if (metadata.isSymbolicLink() && resolved.includes(`${path.sep}packages${path.sep}`)) fail(`M8_CONSUMER_WORKSPACE_LINK:${name}`)
  }

  await cp(path.join(ROOT, 'fixtures', 'packs'), packs, { recursive: true }); await cp(path.join(ROOT, 'fixtures', 'cases'), cases, { recursive: true }); await cp(path.join(ROOT, 'fixtures', 'profiles'), profiles, { recursive: true })
  const renamed = path.join(packs, 'renamed-third-party'); await cp(path.join(packs, 'third-party-minimal'), renamed, { recursive: true }); const renamedPack = JSON.parse(await readFile(path.join(renamed, 'pack.json'), 'utf8')); renamedPack.packId = 'renamed.example/third-party-minimal'; await writeFile(path.join(renamed, 'pack.json'), JSON.stringify(renamedPack, null, 2) + '\n', 'utf8')
  const checkScript = path.join(app, 'consumer-check.mjs')
  await writeFile(checkScript, `import { createRequire } from 'node:module'\nimport { readFileSync } from 'node:fs'\nimport * as contracts from '@voce/contracts'\nimport * as core from '@voce/core'\nimport * as testkit from '@voce/testkit'\nimport { CLI_VERSION, runCli } from '@voce/cli'\nconst require = createRequire(import.meta.url)\nconst schemaPath = require.resolve('@voce/contracts/schemas/BundleManifest.schema.json')\nconst schema = JSON.parse(readFileSync(schemaPath, 'utf8'))\nconst adapter = new core.MockProviderAdapter()\nif (CLI_VERSION !== '${RELEASE_CANDIDATE}' || contracts.BUNDLE_MANIFEST_SCHEMA_VERSION !== 'voce.bundle-manifest/v1alpha1' || schema.$id !== 'voce.bundle-manifest/v1alpha1' || adapter.offline !== true) process.exit(2)\nif (typeof core.createScenarioPackRegistry !== 'function' || typeof testkit.fixtureM5ExecutionInput !== 'function' || typeof runCli !== 'function') process.exit(3)\nconsole.log(JSON.stringify({ status: 'passed', cliVersion: CLI_VERSION, schemaId: schema.$id, schemaReadableFromInstalledPackage: true, mockAdapterOffline: true }))\n`, 'utf8')
  const consumerCheck = parseJsonLine(run(process.execPath, [checkScript], app))
  const typeFixture = path.join(app, 'consumer.ts'); await cp(path.join(ROOT, 'compatibility', `v${RELEASE_CANDIDATE}`, 'consumer.ts'), typeFixture)
  const tsc = path.join(ROOT, 'node_modules', 'typescript', 'bin', 'tsc'); run(process.execPath, [tsc, '--noEmit', '--strict', '--target', 'ES2022', '--module', 'NodeNext', '--moduleResolution', 'NodeNext', '--skipLibCheck', 'consumer.ts'], app)

  const bin = path.join(app, 'node_modules', '.bin', process.platform === 'win32' ? 'voce.cmd' : 'voce')
  const voce = (args) => parseJsonLine(run(bin, [...args, '--json'], room))
  const version = voce(['--version']); const doctor = voce(['doctor'])
  if (version.version !== RELEASE_CANDIDATE || doctor.status !== 'ok' || doctor.providers?.networkProbe !== false) fail('M8_CONSUMER_DOCTOR_OR_VERSION_FAILED')
  const packResults = []
  for (const name of ['virtual-tryon', 'cosplay', 'product-shot', 'third-party-minimal', 'renamed-third-party']) {
    const inspected = voce(['pack', 'inspect', '--source', path.join(packs, name)]); const validated = voce(['pack', 'validate', '--source', path.join(packs, name)]); const tested = voce(['pack', 'test', '--source', path.join(packs, name)])
    if (inspected.status !== 'ok' || validated.valid !== true || tested.status !== 'passed') fail(`M8_CONSUMER_PACK_FAILED:${name}`)
    packResults.push({ name, packId: inspected.packId, status: tested.status, lockHash: tested.lockHash, effectiveScenarioHash: tested.effectiveScenarioHash, assertionIds: tested.results.flatMap((result) => result.assertionIds), assertionStatuses: tested.results.flatMap((result) => result.assertions.map((assertion) => assertion.status)), assertionHash: tested.results.map((result) => result.assertionHash) })
  }
  const verticals = []
  for (const [name, profile] of [['virtual-tryon', 'mock-jpeg'], ['cosplay', 'mock-image'], ['product-shot', 'mock-image']]) {
    const compiled = path.join(output, name, 'compiled'); const runDirectory = path.join(output, name, 'run'); const trace = path.join(output, name, 'trace.html')
    const compiledResult = voce(['case', 'compile', '--case', path.join(cases, `${name}.json`), '--scenario', path.join(packs, name), '--profile', path.join(profiles, `${profile}.json`), '--out', compiled]); const executed = voce(['case', 'run', '--bundle', compiled, '--provider', 'mock', '--out', runDirectory]); const traceResult = voce(['trace', 'render', '--bundle', runDirectory, '--out', trace])
    const html = await readFile(trace, 'utf8'); if (/data:|base64|https?:\/\/|[A-Za-z]:\\/i.test(html)) fail(`M8_CONSUMER_TRACE_UNSAFE:${name}`)
    verticals.push({ name, compileSemanticHash: compiledResult.semanticHash, runSemanticHash: executed.semanticHash, traceModelHash: traceResult.modelHash, traceContentHash: traceResult.contentHash, traceOfflineSafe: true })
  }
  const comparison = voce(['compare', '--before', path.join(output, 'virtual-tryon', 'run'), '--after', path.join(output, 'product-shot', 'run'), '--out', path.join(output, 'comparison.json')])
  if (comparison.status !== 'ok' || !comparison.reportHash) fail('M8_CONSUMER_COMPARE_FAILED')

  const removable = path.join(app, 'node_modules', '@voce', 'contracts'); const removed = path.join(app, 'node_modules', '@voce', 'contracts.removed'); await rename(removable, removed); const removalProbe = run(process.execPath, ['-e', "import('@voce/contracts').then(() => process.exit(2)).catch((error) => process.exit(error?.code === 'ERR_MODULE_NOT_FOUND' ? 0 : 3))"], app, { allowFailure: true }); await rename(removed, removable); if (removalProbe === undefined) fail('M8_CONSUMER_REMOVAL_PROBE_FAILED')
  const summary = { status: 'passed', releaseCandidate: RELEASE_CANDIDATE, install: installMode, packageSources: 'local-tarballs', workspaceSymlinks: false, ignoreScripts: true, packageAudit, dependencyPaths, publicImport: consumerCheck, typeScriptConsumer: { status: 'passed', declarations: 'resolved-from-installed-packages' }, cli: { version: version.version, doctor: doctor.status, networkProbe: doctor.providers.networkProbe }, packs: packResults, verticals, comparison: { status: comparison.status, reportHash: comparison.reportHash }, removalProbe: 'ERR_MODULE_NOT_FOUND_after_package_removal' }
  await writeJson(path.join(room, 'consumer-summary.json'), summary)
  if (room.startsWith(RELEASE_ROOT)) await writeJson(path.join(RELEASE_ROOT, 'consumer-summary.json'), summary)
  return summary
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url))) {
  const summary = await runConsumer(process.argv[2] ? path.resolve(process.argv[2]) : undefined)
  console.log(JSON.stringify({ status: summary.status, install: summary.install, packages: summary.packageAudit.length, packs: summary.packs.length, verticals: summary.verticals.length, workspaceSymlinks: summary.workspaceSymlinks }))
}
