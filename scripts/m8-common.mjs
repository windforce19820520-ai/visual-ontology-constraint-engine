import { createHash } from 'node:crypto'
import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { spawnSync } from 'node:child_process'
import process from 'node:process'
import { fileURLToPath } from 'node:url'
import { gunzipSync } from 'node:zlib'

export const ROOT = fileURLToPath(new URL('..', import.meta.url))
export const RELEASE_CANDIDATE = '0.1.0-rc.3'
export const RELEASE_ROOT = path.join(ROOT, 'release-candidate', `v${RELEASE_CANDIDATE}`)
export const PACKAGE_NAMES = ['@voce-engine/contracts', '@voce-engine/core', '@voce-engine/testkit', '@voce-engine/cli']
export const PACKAGE_DIRS = Object.fromEntries(PACKAGE_NAMES.map((name) => [name, path.join(ROOT, 'packages', name.split('/').at(-1))]))
export const PNPM = process.platform === 'win32' ? 'pnpm.cmd' : 'pnpm'

export function fail(message) { throw new Error(message) }

export function run(command, args, cwd = ROOT, options = {}) {
  const result = spawnSync(command, args, {
    cwd,
    encoding: 'utf8',
    stdio: options.stdio ?? 'pipe',
    shell: command.endsWith('.cmd'),
    env: { ...process.env, CI: '1', npm_config_ignore_scripts: 'true', ...(options.env ?? {}) },
  })
  if (result.error) throw result.error
  if (result.status !== 0) fail(`${command} ${args.join(' ')} failed with ${result.status}: ${((result.stderr ?? '') + (result.stdout ?? '')).trim()}`)
  return result.stdout ?? ''
}

export function runAllowFailure(command, args, cwd = ROOT, options = {}) {
  const result = spawnSync(command, args, {
    cwd,
    encoding: 'utf8',
    stdio: options.stdio ?? 'pipe',
    shell: command.endsWith('.cmd'),
    env: { ...process.env, CI: '1', npm_config_ignore_scripts: 'true', ...(options.env ?? {}) },
  })
  if (result.error) throw result.error
  return { status: result.status, stdout: result.stdout ?? '', stderr: result.stderr ?? '' }
}

export function writeJson(file, value) {
  return writeFile(file, JSON.stringify(value, null, 2) + '\n', 'utf8')
}

export async function filesUnder(directory, relative = '') {
  const entries = await readdir(path.join(directory, relative), { withFileTypes: true })
  const result = []
  for (const entry of entries.sort((a, b) => a.name.localeCompare(b.name))) {
    const child = path.join(relative, entry.name)
    if (entry.isDirectory()) result.push(...await filesUnder(directory, child))
    else if (entry.isFile()) result.push(child.replaceAll('\\', '/'))
    else fail(`M8_RELEASE_TREE_LINK_OR_SPECIAL:${child.replaceAll('\\', '/')}`)
  }
  return result
}

export async function sha256File(file) {
  return `sha256:${createHash('sha256').update(await readFile(file)).digest('hex')}`
}

export async function contentInventory(directory, excluded = new Set()) {
  const files = await filesUnder(directory)
  const rows = []
  for (const relative of files.sort()) {
    if (excluded.has(relative)) continue
    rows.push({ path: relative, sha256: await sha256File(path.join(directory, ...relative.split('/'))) })
  }
  return rows
}

export function inventoryHash(inventory) {
  return `sha256:${createHash('sha256').update(JSON.stringify(inventory)).digest('hex')}`
}

export function parseJsonLine(stdout) {
  const lines = stdout.trim().split(/\r?\n/).filter(Boolean)
  return JSON.parse(lines.at(-1))
}

export function tarballRecords(bytes) {
  const tar = gunzipSync(bytes)
  const records = []
  for (let offset = 0; offset + 512 <= tar.length;) {
    const header = tar.subarray(offset, offset + 512)
    const name = header.subarray(0, 100).toString('utf8').replace(/\0.*$/, '')
    const prefix = header.subarray(345, 500).toString('utf8').replace(/\0.*$/, '')
    if (!name) break
    const size = Number.parseInt(header.subarray(124, 136).toString('ascii').replace(/\0.*$/, '').trim() || '0', 8)
    const type = header[156]
    records.push({ path: (prefix ? `${prefix}/${name}` : name).replaceAll('\\', '/'), type, size })
    offset += 512 + Math.ceil(size / 512) * 512
  }
  return records
}

export function parseTarball(bytes) {
  // Kept as an async-free parser for scripts that inspect tarballs after spawn.
  // The lazy bootstrap is replaced once per module evaluation below.
  return tarballRecords(bytes)
}

export function tarballFileContents(bytes) {
  const tar = gunzipSync(bytes)
  const files = []
  for (let offset = 0; offset + 512 <= tar.length;) {
    const header = tar.subarray(offset, offset + 512)
    const name = header.subarray(0, 100).toString('utf8').replace(/\0.*$/, '')
    const prefix = header.subarray(345, 500).toString('utf8').replace(/\0.*$/, '')
    if (!name) break
    const size = Number.parseInt(header.subarray(124, 136).toString('ascii').replace(/\0.*$/, '').trim() || '0', 8)
    const type = header[156]
    if (type === 0 || type === 48) files.push({ path: (prefix ? `${prefix}/${name}` : name).replaceAll('\\', '/'), bytes: tar.subarray(offset + 512, offset + 512 + size) })
    offset += 512 + Math.ceil(size / 512) * 512
  }
  return files
}

export async function packPublicPackages(targetDirectory) {
  await mkdir(targetDirectory, { recursive: true })
  const audits = []
  for (const name of PACKAGE_NAMES) {
    const directory = PACKAGE_DIRS[name]
    const manifest = JSON.parse(await readFile(path.join(directory, 'package.json'), 'utf8'))
    validatePackageManifest(name, manifest)
    const before = new Set(await readdir(targetDirectory))
    run(PNPM, ['pack', '--pack-destination', targetDirectory], directory)
    const created = (await readdir(targetDirectory)).find((file) => !before.has(file) && file.endsWith('.tgz'))
    if (!created) fail(`M8_PACKAGE_TARBALL_MISSING:${name}`)
    const records = parseTarball(await readFile(path.join(targetDirectory, created)))
    validateTarball(name, manifest, records)
    audits.push({ name, version: manifest.version, tarball: `tarballs/${created}`, files: manifest.files, tarballContents: records.filter((record) => record.type === 0 || record.type === 48).map((record) => record.path).sort(), lifecycleScripts: false })
  }
  return audits
}

export function validatePackageManifest(name, manifest) {
  if (manifest.name !== name) fail(`M8_PACKAGE_NAME_MISMATCH:${name}`)
  if (manifest.version !== RELEASE_CANDIDATE) fail(`M8_PACKAGE_VERSION_NOT_RC:${name}`)
  if (manifest.license !== 'Apache-2.0' || manifest.type !== 'module') fail(`M8_PACKAGE_METADATA_INVALID:${name}`)
  if (manifest.types !== './dist/index.d.ts' || !manifest.exports?.['.'] || manifest.exports['.'] !== './dist/index.js') fail(`M8_PACKAGE_ENTRYPOINT_INVALID:${name}`)
  if (!Array.isArray(manifest.files) || !manifest.files.some((file) => file.startsWith('dist/')) || !manifest.files.includes('README.md') || !manifest.files.includes('LICENSE')) fail(`M8_PACKAGE_FILES_INVALID:${name}`)
  if (manifest.engines?.node !== '>=20') fail(`M8_PACKAGE_ENGINE_INVALID:${name}`)
  if (manifest.repository?.type !== 'git' || !String(manifest.repository?.url ?? '').endsWith('.git') || manifest.repository?.directory !== `packages/${name.split('/').at(-1)}`) fail(`M8_PACKAGE_REPOSITORY_INVALID:${name}`)
  if (name === '@voce-engine/contracts' && !manifest.files.includes('schemas')) fail('M8_CONTRACT_SCHEMAS_NOT_DECLARED')
  if (name === '@voce-engine/cli' && manifest.bin?.voce !== 'dist/cli.js') fail('M8_CLI_BIN_INVALID')
  const dependencySets = [manifest.dependencies, manifest.devDependencies, manifest.peerDependencies]
  for (const dependencies of dependencySets) for (const value of Object.values(dependencies ?? {})) if (String(value).startsWith('workspace:')) fail(`M8_WORKSPACE_DEPENDENCY_IN_PUBLIC_MANIFEST:${name}`)
  for (const key of ['preinstall', 'install', 'postinstall', 'prepare']) if (manifest.scripts?.[key] !== undefined) fail(`M8_LIFECYCLE_SCRIPT:${name}:${key}`)
}

export function validateTarball(name, manifest, records) {
  const seen = new Set()
  const normalized = new Set()
  for (const record of records) {
    const entry = record.path
    if (!entry.startsWith('package/') || entry.includes('\\') || entry.split('/').some((part) => part === '..' || part === '.') || /^package\/(?:[A-Za-z]:|\/)/.test(entry)) fail(`M8_TARBALL_UNSAFE_PATH:${name}:${entry}`)
    if (seen.has(entry) || normalized.has(entry.toLowerCase())) fail(`M8_TARBALL_CASE_COLLISION:${name}:${entry}`)
    seen.add(entry); normalized.add(entry.toLowerCase())
    if (record.type !== 0 && record.type !== 48 && record.type !== 5) fail(`M8_TARBALL_LINK_OR_SPECIAL:${name}:${entry}`)
    if (entry.endsWith('.map')) fail(`M8_TARBALL_SOURCE_MAP_FORBIDDEN:${name}:${entry}`)
    if (/(^|\/)[^/]*\.test\.(?:js|d\.ts)$/.test(entry)) fail(`M8_TARBALL_TEST_FILE_FORBIDDEN:${name}:${entry}`)
    const relative = entry.slice('package/'.length)
    const declared = relative === 'package.json' || manifest.files.some((file) => relative === file || relative.startsWith(`${file}/`))
    if (!declared) fail(`M8_TARBALL_UNDECLARED_FILE:${name}:${relative}`)
  }
  for (const required of ['package/package.json', 'package/LICENSE', 'package/README.md']) if (!seen.has(required)) fail(`M8_TARBALL_REQUIRED_FILE_MISSING:${name}:${required}`)
}

export async function readLockPackageMetadata() {
  const lock = await readFile(path.join(ROOT, 'pnpm-lock.yaml'), 'utf8')
  const keys = [...lock.matchAll(/^  (?:'([^']+)'|([^:]+)):\s*$/gm)].map((match) => match[1] ?? match[2]).filter((key) => /@\d+\.\d+\.\d+(?:[-+].*)?$/.test(key))
  const entries = []
  for (const key of keys) {
    const at = key.lastIndexOf('@')
    const name = key.slice(0, at)
    const version = key.slice(at + 1)
    const encoded = `${name.startsWith('@') ? name.replace('/', '+') : name}@${version}`
    const metadataPath = path.join(ROOT, 'node_modules', '.pnpm', encoded, 'node_modules', ...name.split('/'), 'package.json')
    let metadata
    try { metadata = JSON.parse(await readFile(metadataPath, 'utf8')) } catch { metadata = undefined }
    entries.push({ name, version, license: metadata?.license ?? 'unknown', source: 'pnpm-lock.yaml + installed package metadata', metadata: metadata ? { license: metadata.license ?? 'unknown', engines: metadata.engines ?? null } : 'unknown' })
  }
  return entries.sort((a, b) => a.name.localeCompare(b.name) || a.version.localeCompare(b.version))
}

export function trackedWorktreeStatus() {
  return run('git', ['status', '--porcelain', '--untracked-files=no']).trim()
}

export function sourceRevision() {
  return run('git', ['rev-parse', 'HEAD']).trim()
}

export function assertCleanTrackedWorktree() {
  const dirty = trackedWorktreeStatus()
  if (dirty) fail(`M8_TRACKED_WORKTREE_DIRTY:${dirty.replaceAll('\n', '|')}`)
}

export function cliPath(base = ROOT) {
  return path.join(base, 'packages', 'cli', 'dist', 'cli.js')
}
