import { spawnSync } from "node:child_process"
import { readdirSync } from "node:fs"
import { join, resolve } from "node:path"

const packagesDirectory = resolve("packages")

function findTests(directory) {
  const tests = []
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name)
    if (entry.isDirectory()) tests.push(...findTests(path))
    else if (entry.isFile() && entry.name.endsWith(".test.js")) tests.push(path)
  }
  return tests
}

const tests = findTests(packagesDirectory).sort((left, right) => {
  const normalizedLeft = left.replaceAll("\\", "/")
  const normalizedRight = right.replaceAll("\\", "/")
  return normalizedLeft < normalizedRight ? -1 : normalizedLeft > normalizedRight ? 1 : 0
})

if (tests.length === 0) {
  console.error("No compiled test files were found under packages/.")
  process.exit(1)
}

const result = spawnSync(process.execPath, ["--test", ...tests], { stdio: "inherit" })
if (result.error) throw result.error
process.exit(result.status ?? 1)
