import { mkdir, readFile, rm } from 'node:fs/promises'
import path from 'node:path'
import { createHash } from 'node:crypto'
import { PACKAGE_NAMES, RELEASE_CANDIDATE, RELEASE_ROOT, ROOT, assertCleanTrackedWorktree, packPublicPackages, sourceRevision, tarballFileContents, writeJson, fail, run } from './m8-common.mjs'

assertCleanTrackedWorktree()
const revision = sourceRevision()
const temp = path.join(RELEASE_ROOT, 'reproducibility-temp')
const first = path.join(temp, 'first'); const second = path.join(temp, 'second')
await rm(temp, { recursive: true, force: true }); await mkdir(first, { recursive: true }); await mkdir(second, { recursive: true })
run(process.execPath, [path.join(ROOT, 'node_modules', 'typescript', 'bin', 'tsc'), '-b', '--pretty', 'false'])
const firstAudit = await packPublicPackages(first)
run(process.execPath, [path.join(ROOT, 'node_modules', 'typescript', 'bin', 'tsc'), '-b', '--pretty', 'false'])
const secondAudit = await packPublicPackages(second)
const packages = []
for (const name of PACKAGE_NAMES) {
  const firstName = path.basename(firstAudit.find((item) => item.name === name).tarball); const secondName = path.basename(secondAudit.find((item) => item.name === name).tarball)
  const normalize = async (directory, file) => (await Promise.all(tarballFileContents(await readFile(path.join(directory, file))).map(async (entry) => ({ path: entry.path, sha256: `sha256:${createHash('sha256').update(entry.bytes).digest('hex')}`, byteLength: entry.bytes.byteLength })))).sort((a, b) => a.path.localeCompare(b.path))
  const firstContent = await normalize(first, firstName); const secondContent = await normalize(second, secondName)
  if (JSON.stringify(firstContent) !== JSON.stringify(secondContent)) fail(`M8_REPRODUCIBILITY_MISMATCH:${name}`)
  packages.push({ name, contentFiles: firstContent.length, contentHash: `sha256:${createHash('sha256').update(JSON.stringify(firstContent)).digest('hex')}` })
}
const summary = { status: 'passed', releaseCandidate: RELEASE_CANDIDATE, sourceRevision: revision, comparison: 'decompressed tarball content path/hash inventory', containerBytes: 'not compared; gzip/tar tool metadata may differ', packages }
await writeJson(path.join(RELEASE_ROOT, 'reproducibility-summary.json'), summary)
await rm(temp, { recursive: true, force: true })
console.log(JSON.stringify({ status: 'passed', sourceRevision: revision, packages: packages.length, comparison: 'decompressed-content' }))
