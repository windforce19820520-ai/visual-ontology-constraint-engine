import { access, readFile } from 'node:fs/promises'

const requiredFiles = [
  '.github/pull_request_template.md',
  'README.md',
  'LICENSE',
  'NOTICE',
  'CONTRIBUTING.md',
  'SECURITY.md',
  'CODE_OF_CONDUCT.md',
  'docs/README.md',
  'docs/zh-CN/README.md',
  'docs/architecture.md',
  'docs/glossary.md',
  'docs/zh-CN/glossary.md',
  'docs/roadmap.md',
  'docs/scenario-design.md',
  'docs/zh-CN/scenario-design.md',
  'docs/system-design.md',
  'docs/zh-CN/system-design.md',
]

for (const file of requiredFiles) {
  await access(new URL(`../${file}`, import.meta.url))
}

const readme = await readFile(new URL('../README.md', import.meta.url), 'utf8')
const architecture = await readFile(new URL('../docs/architecture.md', import.meta.url), 'utf8')
const docsIndex = await readFile(new URL('../docs/README.md', import.meta.url), 'utf8')
const chineseDocsIndex = await readFile(new URL('../docs/zh-CN/README.md', import.meta.url), 'utf8')
const glossary = await readFile(new URL('../docs/glossary.md', import.meta.url), 'utf8')
const chineseGlossary = await readFile(new URL('../docs/zh-CN/glossary.md', import.meta.url), 'utf8')
const scenarios = await readFile(new URL('../docs/scenario-design.md', import.meta.url), 'utf8')
const chineseScenarios = await readFile(new URL('../docs/zh-CN/scenario-design.md', import.meta.url), 'utf8')
const systemDesign = await readFile(new URL('../docs/system-design.md', import.meta.url), 'utf8')
const chineseSystemDesign = await readFile(new URL('../docs/zh-CN/system-design.md', import.meta.url), 'utf8')

const utf8Documents = {
  'docs/README.md': docsIndex,
  'docs/zh-CN/README.md': chineseDocsIndex,
  'docs/glossary.md': glossary,
  'docs/zh-CN/glossary.md': chineseGlossary,
  'docs/scenario-design.md': scenarios,
  'docs/zh-CN/scenario-design.md': chineseScenarios,
  'docs/system-design.md': systemDesign,
  'docs/zh-CN/system-design.md': chineseSystemDesign,
}

for (const [file, content] of Object.entries(utf8Documents)) {
  if (content.includes('\uFFFD')) throw new Error(`UTF8_REPLACEMENT_CHARACTER_FOUND:${file}`)
}

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

const pairedLinks = [
  [docsIndex, 'zh-CN/scenario-design.md', 'DOCS_INDEX_SCENARIO_TRANSLATION_LINK_MISSING'],
  [docsIndex, 'zh-CN/system-design.md', 'DOCS_INDEX_SYSTEM_TRANSLATION_LINK_MISSING'],
  [docsIndex, 'zh-CN/glossary.md', 'DOCS_INDEX_GLOSSARY_TRANSLATION_LINK_MISSING'],
  [chineseDocsIndex, '../scenario-design.md', 'CHINESE_INDEX_SCENARIO_SOURCE_LINK_MISSING'],
  [chineseDocsIndex, '../system-design.md', 'CHINESE_INDEX_SYSTEM_SOURCE_LINK_MISSING'],
  [chineseDocsIndex, '../glossary.md', 'CHINESE_INDEX_GLOSSARY_SOURCE_LINK_MISSING'],
  [scenarios, 'zh-CN/scenario-design.md', 'SCENARIO_TRANSLATION_LINK_MISSING'],
  [chineseScenarios, '../scenario-design.md', 'SCENARIO_SOURCE_LINK_MISSING'],
  [systemDesign, 'zh-CN/system-design.md', 'SYSTEM_TRANSLATION_LINK_MISSING'],
  [chineseSystemDesign, '../system-design.md', 'SYSTEM_SOURCE_LINK_MISSING'],
  [glossary, 'zh-CN/glossary.md', 'GLOSSARY_TRANSLATION_LINK_MISSING'],
  [chineseGlossary, '../glossary.md', 'GLOSSARY_SOURCE_LINK_MISSING'],
]

for (const [content, link, errorCode] of pairedLinks) {
  if (!content.includes(link)) throw new Error(errorCode)
}

function uniqueMatches(content, pattern) {
  return [...new Set(content.match(pattern) ?? [])].sort()
}

function assertSameIds(label, englishContent, translatedContent, pattern) {
  const englishIds = uniqueMatches(englishContent, pattern)
  const translatedIds = uniqueMatches(translatedContent, pattern)

  if (JSON.stringify(englishIds) !== JSON.stringify(translatedIds)) {
    throw new Error(`${label}_ID_MISMATCH:en=${englishIds.join(',')}:zh-CN=${translatedIds.join(',')}`)
  }
}

assertSameIds('SCENARIO', scenarios, chineseScenarios, /\b(?:SCN|VT|CP|PS|REV|DEV|RPK)-\d{3}\b/g)
assertSameIds('SYSTEM_REQUIREMENT', systemDesign, chineseSystemDesign, /\bSYS-\d{3}\b/g)

const requiredScenarioIds = ['CP-001', 'DEV-001', 'PS-001', 'REV-001', 'RPK-001', 'SCN-001', 'VT-001']
const requiredSystemIds = Array.from({ length: 15 }, (_, index) => `SYS-${String(index + 1).padStart(3, '0')}`)

if (JSON.stringify(uniqueMatches(scenarios, /\b(?:SCN|VT|CP|PS|REV|DEV|RPK)-\d{3}\b/g)) !== JSON.stringify(requiredScenarioIds)) {
  throw new Error('SCENARIO_REQUIRED_IDS_MISMATCH')
}

if (JSON.stringify(uniqueMatches(systemDesign, /\bSYS-\d{3}\b/g)) !== JSON.stringify(requiredSystemIds)) {
  throw new Error('SYSTEM_REQUIRED_IDS_MISMATCH')
}

const sharedSystemIdentifiers = [
  'Observation',
  'ObservationDecision',
  'SourceBinding',
  'OntologyInstance',
  'ChangeIntent',
  'RequestedScopePlan',
  'CompilationContext',
  'BindingDecision',
  'EvidenceRegion',
  'ConstraintIR',
  'ReferencePlan',
  'PipelinePlan',
  'PromptIR',
  'PromptCandidateIR',
  'RemoteCallAuthorization',
  'ExecutionAuthorization',
  'RemoteCallRun',
  'CompilationSession',
  'ExecutionRun',
  'StepEvent',
  'StepReceipt',
  'ArtifactHandle',
  'submission_unknown',
  'reconciling',
]

for (const identifier of sharedSystemIdentifiers) {
  if (!systemDesign.includes(identifier)) throw new Error(`SYSTEM_IDENTIFIER_MISSING:${identifier}`)
  if (!chineseSystemDesign.includes(identifier)) throw new Error(`CHINESE_SYSTEM_IDENTIFIER_MISSING:${identifier}`)
}

const sharedGlossaryIdentifiers = [
  'ReferenceObservation',
  'CompilationContext',
  'ObservationDecision',
  'Intent Interpreter',
  'Reference Interpreter',
  'Evidence and Source Resolver',
  'Constraint Graph Compiler',
  'Reference Budget Optimizer',
  'Prompt Optimizer',
  'Prompt Guard',
  'Capability-aware Pipeline Planner',
  'Provider Adapter',
  'RemoteCallAuthorization',
  'ExecutionAuthorization',
  'OutputContract',
  'Provenance',
  'EvidenceRegion',
  'Structural Validation',
  'Semantic Review',
  'PromptCandidateIR',
  'ArtifactHandle',
  'StepEvent',
  'confidence',
  'importance',
  'decisionStatus',
]

for (const identifier of sharedGlossaryIdentifiers) {
  if (!glossary.includes(identifier)) throw new Error(`GLOSSARY_IDENTIFIER_MISSING:${identifier}`)
  if (!chineseGlossary.includes(identifier)) throw new Error(`CHINESE_GLOSSARY_IDENTIFIER_MISSING:${identifier}`)
}

function extractMermaidTopology(content) {
  const blocks = [...content.matchAll(/```mermaid\s*\n([\s\S]*?)```/g)].map((match) => match[1])

  return blocks.map((block) => {
    const edges = []
    for (const rawLine of block.split(/\r?\n/)) {
      const line = rawLine
        .replace(/\["[^"]*"\]/g, '')
        .replace(/\{"[^"]*"\}/g, '')
        .trim()
      const edge = line.match(/^(\S+)\s+--[^>]*>\s+(\S+)/)
      if (edge) edges.push(`${edge[1]}->${edge[2]}`)
    }
    return edges.sort()
  })
}

function assertSameMermaidTopology(label, englishContent, translatedContent) {
  const englishTopology = extractMermaidTopology(englishContent)
  const translatedTopology = extractMermaidTopology(translatedContent)
  if (JSON.stringify(englishTopology) !== JSON.stringify(translatedTopology)) {
    throw new Error(`${label}_MERMAID_TOPOLOGY_MISMATCH`)
  }
}

assertSameMermaidTopology('SCENARIO', scenarios, chineseScenarios)
assertSameMermaidTopology('SYSTEM', systemDesign, chineseSystemDesign)

function fencedBlockLanguages(content) {
  return [...content.matchAll(/^```([^\s`]*)\s*$/gm)].map((match) => match[1] || '<close>')
}

function assertSameFenceSequence(label, englishContent, translatedContent) {
  const englishFences = fencedBlockLanguages(englishContent)
  const translatedFences = fencedBlockLanguages(translatedContent)
  if (JSON.stringify(englishFences) !== JSON.stringify(translatedFences)) {
    throw new Error(`${label}_CODE_FENCE_SEQUENCE_MISMATCH`)
  }
}

function typedBlocks(content, language) {
  const pattern = new RegExp('```' + language + '\\s*\\n([\\s\\S]*?)```', 'g')
  return [...content.matchAll(pattern)].map((match) => match[1].replace(/\r\n/g, '\n').trim())
}

assertSameFenceSequence('SCENARIO', scenarios, chineseScenarios)
assertSameFenceSequence('SYSTEM', systemDesign, chineseSystemDesign)

if (JSON.stringify(typedBlocks(systemDesign, 'ts')) !== JSON.stringify(typedBlocks(chineseSystemDesign, 'ts'))) {
  throw new Error('SYSTEM_TYPESCRIPT_CONTRACT_MISMATCH')
}

for (const [file, content] of Object.entries(utf8Documents)) {
  const sourceUrl = new URL(`../${file}`, import.meta.url)
  for (const match of content.matchAll(/\[[^\]]*\]\(([^)]+)\)/g)) {
    const target = match[1].trim()
    if (/^(?:https?:|mailto:|#)/.test(target)) continue

    const pathOnly = target.split('#', 1)[0].split('?', 1)[0]
    if (!pathOnly) continue

    try {
      await access(new URL(pathOnly, sourceUrl))
    } catch {
      throw new Error(`LOCAL_LINK_TARGET_MISSING:${file}:${target}`)
    }
  }
}

console.log(`Repository validation passed (${requiredFiles.length} required files).`)
