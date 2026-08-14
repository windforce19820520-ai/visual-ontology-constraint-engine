import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { RELEASE_ROOT, filesUnder, sha256File, fail } from './m8-common.mjs'

const root = process.argv[2] ? path.resolve(process.argv[2]) : RELEASE_ROOT
const checksumFile = path.join(root, 'checksums.sha256')
const lines = (await readFile(checksumFile, 'utf8')).split(/\r?\n/).map((line) => line.trim()).filter(Boolean)
const expected = new Map()
for (const line of lines) {
  const match = /^(sha256:[0-9a-f]{64})  (.+)$/.exec(line)
  if (!match) fail('M8_CHECKSUM_FORMAT_INVALID')
  const relative = match[2].replaceAll('\\', '/')
  if (!relative || relative.startsWith('/') || relative.split('/').includes('..') || path.isAbsolute(relative)) fail(`M8_CHECKSUM_PATH_UNSAFE:${relative}`)
  if (expected.has(relative.toLowerCase())) fail(`M8_CHECKSUM_DUPLICATE:${relative}`)
  expected.set(relative.toLowerCase(), { relative, sha256: match[1] })
}
const actual = await filesUnder(root)
const allowedUnhashed = new Set(['checksums.sha256'])
for (const relative of actual) {
  if (allowedUnhashed.has(relative)) continue
  const found = expected.get(relative.toLowerCase())
  if (!found) fail(`M8_CHECKSUM_UNLISTED_FILE:${relative}`)
}
for (const item of expected.values()) {
  const file = path.join(root, ...item.relative.split('/'))
  const digest = await sha256File(file).catch(() => undefined)
  if (digest !== item.sha256) fail(`M8_CHECKSUM_MISMATCH:${item.relative}`)
}
console.log(JSON.stringify({ status: 'passed', files: expected.size, root: path.basename(root) }))
