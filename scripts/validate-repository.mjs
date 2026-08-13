import { access, readFile } from 'node:fs/promises'

const requiredFiles = [
  'README.md',
  'LICENSE',
  'NOTICE',
  'CONTRIBUTING.md',
  'SECURITY.md',
  'CODE_OF_CONDUCT.md',
  'docs/architecture.md',
  'docs/roadmap.md',
]

for (const file of requiredFiles) {
  await access(new URL(`../${file}`, import.meta.url))
}

const readme = await readFile(new URL('../README.md', import.meta.url), 'utf8')
const architecture = await readFile(new URL('../docs/architecture.md', import.meta.url), 'utf8')

const requiredReadmePhrases = [
  'Incubation status',
  'Sparse ontology',
  'Reference Interpreter',
  'Prompt Optimizer',
]

for (const phrase of requiredReadmePhrases) {
  if (!readme.includes(phrase)) throw new Error(`README_REQUIRED_CONTENT_MISSING:${phrase}`)
}

const requiredArchitecturePhrases = [
  'Observation',
  'SourceBinding',
  'OntologyInstance',
  'Prompt Guard',
]

for (const phrase of requiredArchitecturePhrases) {
  if (!architecture.includes(phrase)) throw new Error(`ARCHITECTURE_REQUIRED_CONTENT_MISSING:${phrase}`)
}

console.log(`Repository validation passed (${requiredFiles.length} required files).`)
