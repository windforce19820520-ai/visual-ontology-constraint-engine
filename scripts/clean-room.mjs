import { cp, lstat, mkdir, readFile, realpath, rm, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { spawnSync } from 'node:child_process'
import process from 'node:process'
import { fileURLToPath } from 'node:url'

const root = fileURLToPath(new URL('..', import.meta.url))
const room = path.join(root, 'clean-room', 'v0.1.0-rc.1')
const packs = path.join(room, 'packs')
const app = path.join(room, 'app')
const tarballs = path.join(room, 'tarballs')
const pnpm = process.platform === 'win32' ? 'pnpm.cmd' : 'pnpm'
const node = process.execPath
function fail(message) { throw new Error(message) }
function run(command, args, cwd, options = {}) {
  const result = spawnSync(command, args, { cwd, encoding: 'utf8', stdio: options.stdio ?? 'pipe', shell: command.endsWith('.cmd'), env: { ...process.env, CI: '1', npm_config_ignore_scripts: 'true' } })
  if (result.error) throw result.error
  if (result.status !== 0) fail(`${command} ${args.join(' ')} failed: ${((result.stderr ?? '') + (result.stdout ?? '')).trim()}`)
  return result.stdout ?? ''
}
function parseJson(stdout) { return JSON.parse(stdout.trim().split(/\r?\n/).at(-1)) }
await rm(room, { recursive: true, force: true })
await mkdir(tarballs, { recursive: true }); await mkdir(app, { recursive: true }); await mkdir(packs, { recursive: true })
const packageNames = ['contracts', 'core', 'testkit', 'cli']
for (const packageName of packageNames) run(pnpm, ['pack', '--pack-destination', tarballs], path.join(root, 'packages', packageName))
const semverPackage = path.join(root, 'node_modules', '.pnpm', 'semver@7.7.2', 'node_modules', 'semver')
if (!(await lstat(path.join(semverPackage, 'package.json')).catch(() => undefined))) fail('The locked semver dependency is not available in the workspace install.')
run(pnpm, ['pack', '--pack-destination', tarballs], semverPackage)
const tarballEntries = []
for (const file of await (await import('node:fs/promises')).readdir(tarballs)) if (file.endsWith('.tgz')) tarballEntries.push(file)
if (tarballEntries.length !== packageNames.length + 1) fail('Expected one local tarball per public package plus semver.')
const tarballFor = (name) => path.join('..', 'tarballs', tarballEntries.find((file) => file.includes(`voce-${name}-`)) ?? fail(`Missing tarball for ${name}`)).replaceAll('\\', '/')
const semverTarball = tarballEntries.find((file) => file.startsWith('semver-')) ?? fail('Missing local semver tarball.')
const localDependencies = { '@voce/contracts': `file:${tarballFor('contracts')}`, '@voce/core': `file:${tarballFor('core')}`, '@voce/testkit': `file:${tarballFor('testkit')}`, '@voce/cli': `file:${tarballFor('cli')}`, semver: `file:${path.join('..', 'tarballs', semverTarball).replaceAll('\\', '/')}` }
await writeFile(path.join(app, 'package.json'), JSON.stringify({ name: 'voce-clean-room', private: true, type: 'module', dependencies: localDependencies }, null, 2) + '\n')
await writeFile(path.join(app, 'pnpm-workspace.yaml'), `overrides:\n${Object.entries(localDependencies).map(([name, value]) => `  '${name}': '${value}'`).join('\n')}\n`)
let installMode = 'local-tarballs-offline'
try { run(pnpm, ['install', '--ignore-scripts', '--offline'], app) } catch { installMode = 'local-tarballs-plus-open-source-dependencies'; run(pnpm, ['install', '--ignore-scripts'], app) }
for (const name of ['contracts', 'core', 'testkit', 'cli']) {
  const dependencyPath = path.join(app, 'node_modules', '@voce', name); const metadata = await lstat(dependencyPath); const resolved = await realpath(dependencyPath)
  if (!resolved.startsWith(room + path.sep) || (metadata.isSymbolicLink() && resolved.includes(`${path.sep}packages${path.sep}`))) fail(`Clean-room dependency ${name} is outside the controlled tarball install or points to the workspace.`)
}
await cp(path.join(root, 'fixtures', 'packs'), packs, { recursive: true }); await cp(path.join(root, 'fixtures', 'cases'), path.join(room, 'cases'), { recursive: true }); await cp(path.join(root, 'fixtures', 'profiles'), path.join(room, 'profiles'), { recursive: true })
const bin = path.join(app, 'node_modules', '.bin', process.platform === 'win32' ? 'voce.cmd' : 'voce')
const voce = (args) => run(bin, [...args, '--json'], room, { shell: process.platform === 'win32' })
const version = parseJson(voce(['--version'])).version
if (version !== '0.1.0-rc.1') fail('Clean-room CLI version mismatch.')
for (const name of ['virtual-tryon', 'cosplay', 'product-shot', 'third-party-minimal']) parseJson(voce(['pack', 'inspect', '--source', path.join(packs, name)]))
for (const name of ['virtual-tryon', 'cosplay', 'product-shot', 'third-party-minimal']) parseJson(voce(['pack', 'validate', '--source', path.join(packs, name)]))
for (const name of ['virtual-tryon', 'cosplay', 'product-shot', 'third-party-minimal']) parseJson(voce(['pack', 'test', '--source', path.join(packs, name)]))
const output = path.join(room, 'output'); await mkdir(output, { recursive: true })
for (const [name, profile] of [['virtual-tryon', 'mock-jpeg-plus-removal'], ['cosplay', 'mock-native-transparent'], ['product-shot', 'mock-native-transparent']]) {
  const compiled = path.join(output, name, 'compiled'); const runDir = path.join(output, name, 'run'); await mkdir(path.dirname(compiled), { recursive: true })
  parseJson(voce(['case', 'compile', '--case', path.join(room, 'cases', `${name}.json`), '--scenario', path.join(packs, name), '--profile', path.join(room, 'profiles', `${profile}.json`), '--out', compiled]))
  parseJson(voce(['case', 'run', '--bundle', compiled, '--provider', 'mock', '--out', runDir]))
  parseJson(voce(['trace', 'render', '--bundle', runDir, '--out', path.join(output, name, 'trace.html')]))
}
await writeFile(path.join(room, 'clean-room-result.json'), JSON.stringify({ status: 'passed', install: installMode, packageSources: 'local-tarballs', ignoreScripts: true, workspaceSymlinks: false, commands: ['version', 'pack inspect', 'pack validate', 'pack test', 'three compile/run/trace verticals'] }, null, 2) + '\n')
console.log(JSON.stringify({ status: 'passed', output: 'clean-room/v0.1.0-rc.1', install: installMode, packageSources: 'local-tarballs', workspaceSymlinks: false }))
