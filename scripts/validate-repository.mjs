import { access, readFile, readdir } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const requiredFiles = [
  '.github/pull_request_template.md',
  'AGENTS.md',
  'README.md',
  'CHANGELOG.md',
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
  'docs/scenario-pack-contract.md',
  'docs/zh-CN/scenario-pack-contract.md',
  'docs/system-design.md',
  'docs/zh-CN/system-design.md',
  'docs/visual-composition.md',
  'docs/zh-CN/visual-composition.md',
  'docs/implementation-notes/m3-decisions.md',
  'docs/implementation-notes/m1-decisions.md',
  'docs/implementation-notes/m2-decisions.md',
  'docs/implementation-notes/m4-decisions.md',
  'docs/implementation-notes/m5-decisions.md',
  'docs/implementation-notes/m6-decisions.md',
  'docs/implementation-notes/m7-decisions.md',
  'docs/implementation-notes/m8-decisions.md',
  'docs/implementation-notes/v0.1-scope-cleanup.md',
  'docs/release-process.md',
  'docs/release-checklist.md',
  'docs/acceptance/v0.1.0-rc.4.md',
  'docs/acceptance/v0.1.0-rc.5.md',
  'docs/compatibility.md',
  'compatibility/v0.1.0-rc.1/manifest.json',
  'compatibility/v0.1.0-rc.1/consumer.ts',
  'compatibility/v0.1.0-rc.2/manifest.json',
  'compatibility/v0.1.0-rc.2/consumer.ts',
  'compatibility/v0.1.0-rc.3/manifest.json',
  'compatibility/v0.1.0-rc.3/consumer.ts',
  'compatibility/v0.1.0-rc.5/manifest.json',
  'compatibility/v0.1.0-rc.5/consumer.ts',
  'fixtures/security/m8/corpus.json',
  'fixtures/shared/visual-composition.v1.json',
]

const requiredContractSchemas = [
  'packages/contracts/schemas/ArtifactHandle.schema.json',
  'packages/contracts/schemas/BindingDecision.schema.json',
  'packages/contracts/schemas/CaseSpec.schema.json',
  'packages/contracts/schemas/ChangeIntent.schema.json',
  'packages/contracts/schemas/Conflict.schema.json',
  'packages/contracts/schemas/DecisionTrace.schema.json',
  'packages/contracts/schemas/EffectiveScenario.schema.json',
  'packages/contracts/schemas/EvidenceAndSourceResolverInput.schema.json',
  'packages/contracts/schemas/EvidenceAndSourceResolverResult.schema.json',
  'packages/contracts/schemas/EvidenceRegion.schema.json',
  'packages/contracts/schemas/ManualObservationDeclaration.schema.json',
  'packages/contracts/schemas/Observation.schema.json',
  'packages/contracts/schemas/ObservationDecision.schema.json',
  'packages/contracts/schemas/OntologyFact.schema.json',
  'packages/contracts/schemas/OntologyInstance.schema.json',
  'packages/contracts/schemas/PackResolutionReport.schema.json',
  'packages/contracts/schemas/Question.schema.json',
  'packages/contracts/schemas/ReferenceInterpreterInput.schema.json',
  'packages/contracts/schemas/ReferenceInterpreterResult.schema.json',
  'packages/contracts/schemas/RequestedScopePlan.schema.json',
  'packages/contracts/schemas/ScenarioCompositionLock.schema.json',
  'packages/contracts/schemas/ScenarioPackCatalogSnapshot.schema.json',
  'packages/contracts/schemas/ScenarioPackManifest.schema.json',
  'packages/contracts/schemas/ScenarioPackSelection.schema.json',
  'packages/contracts/schemas/SourceBinding.schema.json',
  'packages/contracts/schemas/TargetDirective.schema.json',
  'packages/contracts/schemas/UnresolvedItem.schema.json',
  'packages/contracts/schemas/Constraint.schema.json',
  'packages/contracts/schemas/Goal.schema.json',
  'packages/contracts/schemas/ConstraintDependency.schema.json',
  'packages/contracts/schemas/ResourceClaim.schema.json',
  'packages/contracts/schemas/ConstraintConflict.schema.json',
  'packages/contracts/schemas/Degradation.schema.json',
  'packages/contracts/schemas/ReviewRequirement.schema.json',
  'packages/contracts/schemas/RuleTrace.schema.json',
  'packages/contracts/schemas/ConstraintIR.schema.json',
  'packages/contracts/schemas/ConstraintWaiver.schema.json',
  'packages/contracts/schemas/ConstraintCompilationInput.schema.json',
  'packages/contracts/schemas/ReferenceCandidate.schema.json',
  'packages/contracts/schemas/ReferenceDependency.schema.json',
  'packages/contracts/schemas/PlannedReference.schema.json',
  'packages/contracts/schemas/ReferenceOmission.schema.json',
  'packages/contracts/schemas/ReferencePlan.schema.json',
  'packages/contracts/schemas/ProviderCapabilityProfile.schema.json',
  'packages/contracts/schemas/Budget.schema.json',
  'packages/contracts/schemas/DataTransfer.schema.json',
  'packages/contracts/schemas/PipelineStep.schema.json',
  'packages/contracts/schemas/StepDependency.schema.json',
  'packages/contracts/schemas/Cleanup.schema.json',
  'packages/contracts/schemas/Compensation.schema.json',
  'packages/contracts/schemas/PipelinePlan.schema.json',
  'packages/contracts/schemas/PipelinePlanningResult.schema.json',
  'packages/contracts/schemas/RemoteCallAuthorization.schema.json',
  'packages/contracts/schemas/ExecutionAuthorization.schema.json',
  'packages/contracts/schemas/ExplainResult.schema.json',
  'packages/contracts/schemas/SemanticDiff.schema.json',
  'packages/contracts/schemas/PromptSection.schema.json',
  'packages/contracts/schemas/DeclarativeInputPolicyContribution.schema.json',
  'packages/contracts/schemas/DeclarativeInterpretationScopeContribution.schema.json',
  'packages/contracts/schemas/OntologyPathDefinition.schema.json',
  'packages/contracts/schemas/OntologyVocabularyContribution.schema.json',
  'packages/contracts/schemas/ResolvedOntologyVocabularyContribution.schema.json',
  'packages/contracts/schemas/DeclarativeRuleCondition.schema.json',
  'packages/contracts/schemas/DeclarativeRuleOperand.schema.json',
  'packages/contracts/schemas/DeclarativeRuleResolution.schema.json',
  'packages/contracts/schemas/DeclarativeRule.schema.json',
  'packages/contracts/schemas/DeclarativeRulePackContribution.schema.json',
  'packages/contracts/schemas/ResolvedDeclarativeRulePackContribution.schema.json',
  'packages/contracts/schemas/PromptSectionDefinition.schema.json',
  'packages/contracts/schemas/PromptSectionContribution.schema.json',
  'packages/contracts/schemas/ResolvedPromptSectionContribution.schema.json',
  'packages/contracts/schemas/PromptConstraintExclusion.schema.json',
  'packages/contracts/schemas/VisualCompositionPreset.schema.json',
  'packages/contracts/schemas/VisualCompositionCatalog.schema.json',
  'packages/contracts/schemas/PromptParameter.schema.json',
  'packages/contracts/schemas/PromptReferenceMapping.schema.json',
  'packages/contracts/schemas/PromptConstraintCoverage.schema.json',
  'packages/contracts/schemas/PromptIR.schema.json',
  'packages/contracts/schemas/PromptIRV1Alpha2.schema.json',
  'packages/contracts/schemas/PromptCompilationInput.schema.json',
  'packages/contracts/schemas/PromptCompilationInputV1Alpha2.schema.json',
  'packages/contracts/schemas/PromptTransformation.schema.json',
  'packages/contracts/schemas/PromptCandidateIR.schema.json',
  'packages/contracts/schemas/PromptCandidateIRV1Alpha2.schema.json',
  'packages/contracts/schemas/PromptGuardFinding.schema.json',
  'packages/contracts/schemas/PromptGuardInput.schema.json',
  'packages/contracts/schemas/PromptGuardInputV1Alpha2.schema.json',
  'packages/contracts/schemas/PromptGuardResult.schema.json',
  'packages/contracts/schemas/PromptGuardResultV1Alpha2.schema.json',
  'packages/contracts/schemas/PromptOptimizationInput.schema.json',
  'packages/contracts/schemas/PromptOptimizationInputV1Alpha2.schema.json',
  'packages/contracts/schemas/ProviderRenderRequest.schema.json',
  'packages/contracts/schemas/ProviderRenderResult.schema.json',
  'packages/contracts/schemas/ExecutionRun.schema.json',
  'packages/contracts/schemas/StepEvent.schema.json',
  'packages/contracts/schemas/StepReceipt.schema.json',
  'packages/contracts/schemas/RemoteCallRun.schema.json',
  'packages/contracts/schemas/Evaluation.schema.json',
  'packages/contracts/schemas/HumanAcceptance.schema.json',
  'packages/contracts/schemas/CleanupReceipt.schema.json',
  'packages/contracts/schemas/CompensationReceipt.schema.json',
  'packages/contracts/schemas/ExecutionTrace.schema.json',
  'packages/contracts/schemas/ArtifactReplayResult.schema.json',
  'packages/contracts/schemas/OfflineExecutionInput.schema.json',
  'packages/contracts/schemas/BundleManifest.schema.json',
  'packages/contracts/schemas/ProviderTransport.schema.json',
  'packages/contracts/schemas/ProviderRequestEnvelope.schema.json',
  'packages/contracts/schemas/ProviderResponseEnvelope.schema.json',
  'packages/contracts/schemas/ProviderError.schema.json',
  'packages/contracts/schemas/ProviderSubmissionLookup.schema.json',
  'packages/contracts/schemas/StructuralValidationInput.schema.json',
  'packages/contracts/schemas/StructuralValidationFinding.schema.json',
  'packages/contracts/schemas/StructuralValidationReport.schema.json',
  'packages/contracts/schemas/SemanticReviewRequest.schema.json',
  'packages/contracts/schemas/SemanticReviewFinding.schema.json',
  'packages/contracts/schemas/SemanticReviewReport.schema.json',
  'packages/contracts/schemas/HumanAcceptanceAnnotation.schema.json',
  'packages/contracts/schemas/HumanAcceptanceDecision.schema.json',
  'packages/contracts/schemas/EvaluationReport.schema.json',
  'packages/contracts/schemas/ComparisonEntry.schema.json',
  'packages/contracts/schemas/ComparisonReport.schema.json',
  'packages/contracts/schemas/StaticTraceReportModel.schema.json',
  'packages/contracts/schemas/ReportArtifact.schema.json',
]

const repositoryRoot = new URL('../', import.meta.url)
const requiredFileContents = {}
const markdownFileContents = {}
const fatalUtf8Decoder = new TextDecoder('utf-8', { fatal: true })

async function enumerateMarkdownFiles(directoryUrl, relativeDirectory = '') {
  const markdownFiles = []
  const entries = await readdir(directoryUrl, { withFileTypes: true })

  for (const entry of entries.sort((left, right) => left.name.localeCompare(right.name))) {
    if (entry.name === '.git' || entry.name === 'node_modules') continue

    const relativePath = relativeDirectory ? `${relativeDirectory}/${entry.name}` : entry.name
    const entryUrl = new URL(encodeURIComponent(entry.name) + (entry.isDirectory() ? '/' : ''), directoryUrl)

    if (entry.isDirectory()) {
      markdownFiles.push(...(await enumerateMarkdownFiles(entryUrl, relativePath)))
    } else if ((entry.isFile() || entry.isSymbolicLink()) && /\.md$/i.test(entry.name)) {
      markdownFiles.push(relativePath)
    }
  }

  return markdownFiles
}

const markdownFiles = await enumerateMarkdownFiles(repositoryRoot)

for (const file of markdownFiles) {
  const url = new URL(file.split('/').map(encodeURIComponent).join('/'), repositoryRoot)
  let content
  try {
    content = fatalUtf8Decoder.decode(await readFile(url))
  } catch {
    throw new Error(`INVALID_UTF8:${file}`)
  }

  if (content.includes('\0')) throw new Error(`NUL_CHARACTER_FOUND:${file}`)
  if (content.includes('\uFFFD')) throw new Error(`UTF8_REPLACEMENT_CHARACTER_FOUND:${file}`)
  markdownFileContents[file] = content
}

for (const file of requiredFiles) {
  const url = new URL(file.split('/').map(encodeURIComponent).join('/'), repositoryRoot)
  await access(url)
  requiredFileContents[file] = markdownFileContents[file] ?? fatalUtf8Decoder.decode(await readFile(url))
}

const schemaIds = new Set()
for (const file of requiredContractSchemas) {
  const url = new URL(file.split('/').map(encodeURIComponent).join('/'), repositoryRoot)
  let schema
  try {
    schema = JSON.parse(await readFile(url, 'utf8'))
  } catch {
    throw new Error(`CONTRACT_SCHEMA_INVALID_JSON:${file}`)
  }
  if (!schema || schema.$schema !== 'https://json-schema.org/draft/2020-12/schema' || typeof schema.$id !== 'string' || schemaIds.has(schema.$id)) {
    throw new Error(`CONTRACT_SCHEMA_METADATA_INVALID:${file}`)
  }
  schemaIds.add(schema.$id)
  if (!schema.type && !schema.oneOf) throw new Error(`CONTRACT_SCHEMA_ROOT_INVALID:${file}`)
}

const workspaceManifestFiles = [
  'package.json',
  'packages/contracts/package.json',
  'packages/core/package.json',
  'packages/testkit/package.json',
  'packages/cli/package.json',
  'playground/package.json',
]
const workspaceManifests = Object.fromEntries(await Promise.all(workspaceManifestFiles.map(async (file) => [
  file,
  JSON.parse(await readFile(new URL(file.split('/').map(encodeURIComponent).join('/'), repositoryRoot), 'utf8')),
])))
const releaseVersion = workspaceManifests['package.json'].version
for (const file of workspaceManifestFiles.slice(1)) {
  if (workspaceManifests[file].version !== releaseVersion) throw new Error(`WORKSPACE_VERSION_MISMATCH:${file}`)
}
for (const [file, dependencies] of [
  ['packages/core/package.json', ['@voce-engine/contracts']],
  ['packages/testkit/package.json', ['@voce-engine/contracts', '@voce-engine/core']],
  ['packages/cli/package.json', ['@voce-engine/contracts', '@voce-engine/core', '@voce-engine/testkit']],
  ['playground/package.json', ['@voce-engine/contracts', '@voce-engine/core']],
]) {
  for (const dependency of dependencies) {
    if (workspaceManifests[file].dependencies?.[dependency] !== releaseVersion) throw new Error(`WORKSPACE_DEPENDENCY_VERSION_MISMATCH:${file}:${dependency}`)
  }
}

for (const [file, expectedVersion] of [['fixtures/observation-unconfirmed.json', 'voce.observation/v1alpha1'], ['fixtures/product-shot-case.json', 'voce.case-spec/v1alpha1']]) {
  const url = new URL(file.split('/').map(encodeURIComponent).join('/'), repositoryRoot)
  const value = JSON.parse(await readFile(url, 'utf8'))
  if (value.schemaVersion !== expectedVersion) throw new Error(`M3_FIXTURE_SCHEMA_VERSION_MISSING:${file}`)
}

for (const file of ['fixtures/m4-provider-image.json', 'fixtures/m4-provider-jpeg.json', 'fixtures/m4-provider-limited-reference.json']) {
  const url = new URL(file.split('/').map(encodeURIComponent).join('/'), repositoryRoot)
  const value = JSON.parse(await readFile(url, 'utf8'))
  if (value.schemaVersion !== 'voce.provider-capability-profile/v1alpha1') throw new Error(`M4_FIXTURE_SCHEMA_VERSION_MISSING:${file}`)
  if (!/^sha256:[0-9a-f]{64}$/.test(value.profileHash ?? '') || !/^sha256:[0-9a-f]{64}$/.test(value.adapterDigest ?? '')) throw new Error(`M4_FIXTURE_PROFILE_HASH_MISSING:${file}`)
}

for (const [file, expectedVersion] of [['fixtures/m5-prompt-ir-minimal.json', 'voce.prompt-ir/v1alpha2'], ['fixtures/m5-execution-trace-minimal.json', 'voce.execution-trace/v1alpha1']]) {
  const url = new URL(file.split('/').map(encodeURIComponent).join('/'), repositoryRoot)
  const value = JSON.parse(await readFile(url, 'utf8'))
  if (value.schemaVersion !== expectedVersion) throw new Error(`M5_FIXTURE_SCHEMA_VERSION_MISSING:${file}`)
  for (const field of ['contextHash', 'pipelinePlanHash', 'traceHash', 'deterministicSignature']) {
    if (value[field] !== undefined && !/^sha256:[0-9a-f]{64}$/.test(value[field])) throw new Error(`M5_FIXTURE_HASH_MISSING:${file}:${field}`)
  }
}

const visualComposition = JSON.parse(await readFile(new URL('../fixtures/shared/visual-composition.v1.json', import.meta.url), 'utf8'))
if (visualComposition.schemaVersion !== 'voce.visual-composition/v1alpha1' || visualComposition.paths?.length !== 37 || visualComposition.presets?.length !== 30 || !/^sha256:[0-9a-f]{64}$/.test(visualComposition.catalogHash ?? '')) throw new Error('VISUAL_COMPOSITION_CATALOG_SHAPE_INVALID')
const compositionArtworkDirectory = new URL('../docs/assets/visual-composition/', import.meta.url)
const compositionArtwork = (await readdir(compositionArtworkDirectory, { withFileTypes: true }))
  .filter((entry) => entry.isFile() && entry.name.endsWith('.jpg'))
  .map((entry) => entry.name)
  .sort()
const expectedCompositionArtwork = visualComposition.presets.map((preset) => `${preset.id}.jpg`).sort()
if (JSON.stringify(compositionArtwork) !== JSON.stringify(expectedCompositionArtwork)) throw new Error('VISUAL_COMPOSITION_ARTWORK_COVERAGE_INVALID')
if (new Set(visualComposition.paths.map((item) => item.path)).size !== visualComposition.paths.length || new Set(visualComposition.presets.map((item) => item.id)).size !== visualComposition.presets.length) throw new Error('VISUAL_COMPOSITION_CATALOG_IDS_INVALID')
const shotScale = visualComposition.paths.find((item) => item.path === 'camera.framing.shotScale')
if (shotScale?.valueKind !== 'enum' || shotScale.cardinality !== 'one') throw new Error('VISUAL_COMPOSITION_SHOT_SCALE_INVALID')
const fullShot = visualComposition.presets.find((item) => item.id === 'full-shot')
if (!fullShot?.changes?.some((item) => item.targetPath === 'camera.framing.shotScale' && item.requestedValue === 'full_shot') || !fullShot?.changes?.some((item) => item.targetPath === 'camera.framing.crop.keepBothFeet' && item.requestedValue === true)) throw new Error('VISUAL_COMPOSITION_FULL_SHOT_INVALID')
if (JSON.stringify(visualComposition).match(/https?:\/\//i)) throw new Error('VISUAL_COMPOSITION_EXTERNAL_URL')

for (const file of ['fixtures/packs/virtual-tryon/pack.json', 'fixtures/packs/cosplay/pack.json', 'fixtures/packs/product-shot/pack.json']) {
  const pack = JSON.parse(await readFile(new URL(`../${file}`, import.meta.url), 'utf8'))
  if (!Array.isArray(pack.contributions?.ontologyVocabulary) || !Array.isArray(pack.contributions?.rulePacks) || !Array.isArray(pack.contributions?.promptSections)) throw new Error(`VISUAL_COMPOSITION_TYPED_CONTRIBUTIONS_MISSING:${file}`)
  const compositionVocabulary = pack.contributions.ontologyVocabulary.find((contribution) => contribution.id === 'visual-composition.ontology')
  if (!compositionVocabulary || JSON.stringify(compositionVocabulary.paths) !== JSON.stringify(visualComposition.paths)) throw new Error(`VISUAL_COMPOSITION_VOCABULARY_DRIFT:${file}`)
  for (const contribution of pack.contributions.ontologyVocabulary) if (!Array.isArray(contribution.paths)) throw new Error(`VISUAL_COMPOSITION_VOCABULARY_INVALID:${file}`)
  for (const contribution of pack.contributions.rulePacks) if (!Array.isArray(contribution.rules) || contribution.rules.some((rule) => !Array.isArray(rule.operands) || !rule.resolution)) throw new Error(`VISUAL_COMPOSITION_RULES_INVALID:${file}`)
  for (const contribution of pack.contributions.promptSections) if (!Array.isArray(contribution.sections)) throw new Error(`VISUAL_COMPOSITION_PROMPT_POLICY_INVALID:${file}`)
}

const coreSourceForScenarioCheck = await readFile(new URL('../packages/core/src/index.ts', import.meta.url), 'utf8')
if (/virtual[-_ ]try[-_ ]on|cosplay|product[-_ ]shot/i.test(coreSourceForScenarioCheck)) throw new Error('CORE_SCENARIO_NAME_BRANCH')

for (const [file, expectedVersion] of [['fixtures/m6-provider-request-minimal.json', 'voce.provider-request-envelope/v1alpha1'], ['fixtures/m6-structural-input-minimal.json', 'voce.structural-validation-input/v1alpha1'], ['fixtures/m6-evaluation-report-minimal.json', 'voce.evaluation-report/v1alpha1']]) {
  const url = new URL(file.split('/').map(encodeURIComponent).join('/'), repositoryRoot)
  const value = JSON.parse(await readFile(url, 'utf8'))
  if (value.schemaVersion !== expectedVersion) throw new Error(`M6_FIXTURE_SCHEMA_VERSION_MISSING:${file}`)
}

for (const file of ['fixtures/cases/virtual-tryon.json', 'fixtures/cases/cosplay.json', 'fixtures/cases/product-shot.json', 'fixtures/cases/third-party-minimal.json']) {
  const value = JSON.parse(await readFile(new URL(file.split('/').map(encodeURIComponent).join('/'), repositoryRoot), 'utf8'))
  if (value.requestedOutput?.background !== 'opaque' || value.requestedOutput?.allowAlpha !== false) throw new Error(`V01_SCENARIO_OUTPUT_SCOPE_INVALID:${file}`)
}

for (const file of ['packages/contracts/src/index.ts', 'packages/core/src/m4.ts', 'packages/core/src/m5.ts', 'packages/core/src/m6.ts', 'packages/cli/src/index.ts', 'fixtures/packs/virtual-tryon/pack.json', 'fixtures/packs/cosplay/pack.json', 'fixtures/packs/product-shot/pack.json']) {
  const source = await readFile(new URL(file.split('/').map(encodeURIComponent).join('/'), repositoryRoot), 'utf8')
  if (/veimagex|background_removal|voce\.background-removal|MockBackgroundRemoval/i.test(source)) throw new Error(`V01_BACKGROUND_REMOVAL_SCOPE_LEAK:${file}`)
}

const readme = await readFile(new URL('../README.md', import.meta.url), 'utf8')
const agents = await readFile(new URL('../AGENTS.md', import.meta.url), 'utf8')
const contributing = await readFile(new URL('../CONTRIBUTING.md', import.meta.url), 'utf8')
const pullRequestTemplate = await readFile(new URL('../.github/pull_request_template.md', import.meta.url), 'utf8')
const architecture = await readFile(new URL('../docs/architecture.md', import.meta.url), 'utf8')
const roadmap = await readFile(new URL('../docs/roadmap.md', import.meta.url), 'utf8')
const docsIndex = await readFile(new URL('../docs/README.md', import.meta.url), 'utf8')
const chineseDocsIndex = await readFile(new URL('../docs/zh-CN/README.md', import.meta.url), 'utf8')
const glossary = await readFile(new URL('../docs/glossary.md', import.meta.url), 'utf8')
const chineseGlossary = await readFile(new URL('../docs/zh-CN/glossary.md', import.meta.url), 'utf8')
const scenarios = await readFile(new URL('../docs/scenario-design.md', import.meta.url), 'utf8')
const chineseScenarios = await readFile(new URL('../docs/zh-CN/scenario-design.md', import.meta.url), 'utf8')
const scenarioPackContract = await readFile(new URL('../docs/scenario-pack-contract.md', import.meta.url), 'utf8')
const chineseScenarioPackContract = await readFile(new URL('../docs/zh-CN/scenario-pack-contract.md', import.meta.url), 'utf8')
const systemDesign = await readFile(new URL('../docs/system-design.md', import.meta.url), 'utf8')
const chineseSystemDesign = await readFile(new URL('../docs/zh-CN/system-design.md', import.meta.url), 'utf8')

const requiredReadmePhrases = [
  'Incubation status',
  'Sparse ontology',
  'Reference Interpreter',
  'Prompt Optimizer',
  'ScenarioPack',
  'What works today',
  'Runtime workflow',
  'currently includes data-only ScenarioPack fixtures and vertical cases',
  'public CLI remains offline-first and Mock-first',
  'Seedream adapter has been exercised',
  'candidate public compatibility surface',
]

for (const phrase of requiredReadmePhrases) {
  if (!readme.includes(phrase)) throw new Error(`README_REQUIRED_CONTENT_MISSING:${phrase}`)
}

const requiredArchitecturePhrases = [
  'Observation',
  'SourceBinding',
  'OntologyInstance',
  'Prompt Guard',
  'ScenarioPackRegistry',
  'DeclarativeRulePackContribution',
  'lifecycle scripts',
]

for (const phrase of requiredArchitecturePhrases) {
  if (!architecture.includes(phrase)) throw new Error(`ARCHITECTURE_REQUIRED_CONTENT_MISSING:${phrase}`)
}

const pairedLinks = [
  [docsIndex, 'zh-CN/scenario-design.md', 'DOCS_INDEX_SCENARIO_TRANSLATION_LINK_MISSING'],
  [docsIndex, 'zh-CN/system-design.md', 'DOCS_INDEX_SYSTEM_TRANSLATION_LINK_MISSING'],
  [docsIndex, 'zh-CN/glossary.md', 'DOCS_INDEX_GLOSSARY_TRANSLATION_LINK_MISSING'],
  [docsIndex, 'zh-CN/scenario-pack-contract.md', 'DOCS_INDEX_SCENARIO_PACK_TRANSLATION_LINK_MISSING'],
  [chineseDocsIndex, '../scenario-design.md', 'CHINESE_INDEX_SCENARIO_SOURCE_LINK_MISSING'],
  [chineseDocsIndex, '../system-design.md', 'CHINESE_INDEX_SYSTEM_SOURCE_LINK_MISSING'],
  [chineseDocsIndex, '../glossary.md', 'CHINESE_INDEX_GLOSSARY_SOURCE_LINK_MISSING'],
  [chineseDocsIndex, '../scenario-pack-contract.md', 'CHINESE_INDEX_SCENARIO_PACK_SOURCE_LINK_MISSING'],
  [scenarios, 'zh-CN/scenario-design.md', 'SCENARIO_TRANSLATION_LINK_MISSING'],
  [chineseScenarios, '../scenario-design.md', 'SCENARIO_SOURCE_LINK_MISSING'],
  [systemDesign, 'zh-CN/system-design.md', 'SYSTEM_TRANSLATION_LINK_MISSING'],
  [chineseSystemDesign, '../system-design.md', 'SYSTEM_SOURCE_LINK_MISSING'],
  [glossary, 'zh-CN/glossary.md', 'GLOSSARY_TRANSLATION_LINK_MISSING'],
  [chineseGlossary, '../glossary.md', 'GLOSSARY_SOURCE_LINK_MISSING'],
  [scenarioPackContract, 'zh-CN/scenario-pack-contract.md', 'SCENARIO_PACK_TRANSLATION_LINK_MISSING'],
  [chineseScenarioPackContract, '../scenario-pack-contract.md', 'SCENARIO_PACK_SOURCE_LINK_MISSING'],
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

assertSameIds('SCENARIO', scenarios, chineseScenarios, /\b(?:SCN|VT|CP|PS|REV|DEV|RPK|SPK)-\d{3}\b/g)
assertSameIds('SYSTEM_REQUIREMENT', systemDesign, chineseSystemDesign, /\bSYS-\d{3}\b/g)
assertSameIds('SCENARIO_PACK_ACCEPTANCE', scenarioPackContract, chineseScenarioPackContract, /\bSPK-AC-\d{3}\b/g)
assertSameIds('SCENARIO_PACK_ERROR_CODE', scenarioPackContract, chineseScenarioPackContract, /\bPACK_[A-Z0-9_]+\b/g)
assertSameIds('SYSTEM_ERROR_CODE', systemDesign, chineseSystemDesign, /\b[A-Z][A-Z0-9]+(?:_[A-Z0-9]+)+\b/g)

function inlineCodeIdentifierAndEnumTokens(content) {
  const withoutFencedBlocks = content.replace(/^(`{3,}|~{3,})[^\r\n]*\r?\n[\s\S]*?^\1\s*$/gm, '')
  const tokens = []

  for (const match of withoutFencedBlocks.matchAll(/(?<!`)`([^`\r\n]+)`(?!`)/g)) {
    const token = match[1].trim()
    if (!token || /\s/u.test(token) || /\p{Script=Han}/u.test(token)) continue

    const isIdentifierOrEnum =
      /^(?:[A-Za-z_$][A-Za-z0-9_$]*)(?:[._-][A-Za-z0-9_$]+)*$/.test(token) ||
      /^(?:[A-Za-z_$][A-Za-z0-9_$]*)\(\)$/.test(token) ||
      /^@[a-z0-9][a-z0-9._-]*\/[a-z0-9][a-z0-9._-]*$/i.test(token) ||
      /^[a-z][a-z0-9.-]*\/v\d+(?:alpha|beta|rc)?\d*$/i.test(token)

    if (isIdentifierOrEnum) tokens.push(token)
  }

  return [...new Set(tokens)].sort()
}

function assertSameInlineCodeTokens(label, englishContent, translatedContent) {
  const englishTokens = inlineCodeIdentifierAndEnumTokens(englishContent)
  const translatedTokens = inlineCodeIdentifierAndEnumTokens(translatedContent)
  const onlyEnglish = englishTokens.filter((token) => !translatedTokens.includes(token))
  const onlyTranslated = translatedTokens.filter((token) => !englishTokens.includes(token))

  if (onlyEnglish.length || onlyTranslated.length) {
    throw new Error(
      `${label}_INLINE_CODE_TOKEN_MISMATCH:en-only=${onlyEnglish.join(',')}:zh-CN-only=${onlyTranslated.join(',')}`,
    )
  }
}

assertSameInlineCodeTokens('GLOSSARY', glossary, chineseGlossary)
assertSameInlineCodeTokens('SCENARIO', scenarios, chineseScenarios)
assertSameInlineCodeTokens('SCENARIO_PACK', scenarioPackContract, chineseScenarioPackContract)
assertSameInlineCodeTokens('SYSTEM', systemDesign, chineseSystemDesign)

const requiredScenarioIds = ['CP-001', 'DEV-001', 'PS-001', 'REV-001', 'RPK-001', 'SCN-001', 'SPK-001', 'VT-001']
const requiredSystemIds = Array.from({ length: 23 }, (_, index) => `SYS-${String(index + 1).padStart(3, '0')}`)
const requiredScenarioPackAcceptanceIds = Array.from(
  { length: 16 },
  (_, index) => `SPK-AC-${String(index + 1).padStart(3, '0')}`,
)
const requiredSystemErrorCodes = [
  'ARTIFACT_UNAVAILABLE',
  'CLEANUP_FAILED',
  'CONFIRMATION_REQUIRED',
  'CONSTRAINT_CONFLICT',
  'EXECUTION_AUTHORIZATION_INVALID',
  'EXECUTION_NOT_AUTHORIZED',
  'INPUT_INVALID',
  'INTERPRETATION_UNAVAILABLE',
  'POSTPROCESSING_FAILED',
  'PROMPT_CANDIDATE_UNVERIFIABLE',
  'PROVIDER_CAPABILITY_UNSATISFIABLE',
  'PROVIDER_FAILED',
  'REFERENCE_BUDGET_UNSATISFIABLE',
  'REMOTE_CALL_NOT_AUTHORIZED',
  'REMOTE_SUBMISSION_UNKNOWN',
  'SEMANTIC_REVIEW_REQUIRED',
  'STRUCTURAL_VALIDATION_FAILED',
]

if (JSON.stringify(uniqueMatches(scenarios, /\b(?:SCN|VT|CP|PS|REV|DEV|RPK|SPK)-\d{3}\b/g)) !== JSON.stringify(requiredScenarioIds)) {
  throw new Error('SCENARIO_REQUIRED_IDS_MISMATCH')
}

if (JSON.stringify(uniqueMatches(systemDesign, /\bSYS-\d{3}\b/g)) !== JSON.stringify(requiredSystemIds)) {
  throw new Error('SYSTEM_REQUIRED_IDS_MISMATCH')
}

if (JSON.stringify(uniqueMatches(scenarioPackContract, /\bSPK-AC-\d{3}\b/g)) !== JSON.stringify(requiredScenarioPackAcceptanceIds)) {
  throw new Error('SCENARIO_PACK_REQUIRED_ACCEPTANCE_IDS_MISMATCH')
}

if (
  JSON.stringify(uniqueMatches(systemDesign, /\b[A-Z][A-Z0-9]+(?:_[A-Z0-9]+)+\b/g)) !==
  JSON.stringify(requiredSystemErrorCodes)
) {
  throw new Error('SYSTEM_REQUIRED_ERROR_CODES_MISMATCH')
}

const sharedScenarioPackIdentifiers = [
  'ScenarioPack',
  'ScenarioPackManifest',
  'DeclarativeInputPolicyContribution',
  'DeclarativeInterpretationScopeContribution',
  'DistributionInventoryEntry',
  'ScenarioPackRequest',
  'ScenarioPackDependency',
  'ScenarioPackConflict',
  'ScenarioPackRegistry',
  'ScenarioPackSelection',
  'ScenarioPackCatalogSnapshot',
  'ScenarioPackResolution',
  'ScenarioCompositionLock',
  'EffectiveScenario',
  'RulePack',
  'DeclarativeRulePackContribution',
  'RulePackPlugin',
  'ScenarioPackDeclarations',
  'ScenarioCapabilityRequirement',
  'HostOverride',
  'HostPolicyOverlay',
  'OverridePoint',
  'PackResolutionReport',
  'FixtureSuite',
  'UIMetadata',
  'PackActivation',
  'PackDeactivation',
  'PackUninstallCheck',
  'PackUninstallReceipt',
  'ScenarioMigrationDeclaration',
  'MigrationPlan',
  'MigrationReceipt',
  'ScenarioPackPublishAudit',
  'ScenarioPackTemplate',
  'ScenarioPackScaffoldInput',
  'PackageProvenance',
  'PackageAcquisition',
  'ProviderAdapter',
  'ProviderCapabilityProfile',
]

const requiredScenarioPackTypeDeclarations = [
  'AppliedOverrideRef',
  'DeclarativeInputPolicyContribution',
  'DeclarativeInterpretationScopeContribution',
  'DistributionInventoryEntry',
  'EffectiveScenario',
  'FixtureSuite',
  'HostOverride',
  'HostOverrideOperation',
  'HostPolicyOverlay',
  'JsonObject',
  'JsonPrimitive',
  'JsonSchemaRef',
  'JsonValue',
  'LocalScenarioPackSource',
  'MigrationPlan',
  'MigrationReceipt',
  'OverridePoint',
  'PackActivation',
  'PackDeactivation',
  'PackResolutionReport',
  'PackUninstallCheck',
  'PackUninstallReceipt',
  'PackageAcquisition',
  'PackageProvenance',
  'ScenarioCapabilityRequirement',
  'ScenarioCardinality',
  'ScenarioCompositionLock',
  'ScenarioCompositionLockEntry',
  'ScenarioContributionDescriptor',
  'ScenarioContributionIndex',
  'ScenarioContributionKind',
  'ScenarioInputExpectation',
  'ScenarioInteractionMode',
  'ScenarioMigrationDeclaration',
  'ScenarioMigrationOperation',
  'ScenarioOutputExpectation',
  'ScenarioPack',
  'ScenarioPackCatalogSnapshot',
  'ScenarioPackConflict',
  'ScenarioPackDeclarations',
  'ScenarioPackDependency',
  'ScenarioPackDescriptor',
  'ScenarioPackManifest',
  'ScenarioPackPermissions',
  'ScenarioPackPublishAudit',
  'ScenarioPackRegistry',
  'ScenarioPackRequest',
  'ScenarioPackResolution',
  'ScenarioPackScaffoldInput',
  'ScenarioPackSelection',
  'ScenarioPackTemplate',
  'UIMetadata',
  'VersionedCoreContractRef',
]

function typeDeclarations(content) {
  return [...new Set([...content.matchAll(/\b(?:interface|type)\s+([A-Z][A-Za-z0-9_]*)/g)].map((match) => match[1]))].sort()
}

if (JSON.stringify(typeDeclarations(scenarioPackContract)) !== JSON.stringify(requiredScenarioPackTypeDeclarations)) {
  throw new Error(`SCENARIO_PACK_TYPE_DECLARATIONS_MISMATCH:${typeDeclarations(scenarioPackContract).join(',')}`)
}

for (const identifier of sharedScenarioPackIdentifiers) {
  if (!scenarioPackContract.includes(identifier)) throw new Error(`SCENARIO_PACK_IDENTIFIER_MISSING:${identifier}`)
  if (!chineseScenarioPackContract.includes(identifier)) throw new Error(`CHINESE_SCENARIO_PACK_IDENTIFIER_MISSING:${identifier}`)
}

const requiredScenarioPackErrorCodes = [
  'PACK_ACTIVATION_INVALID',
  'PACK_CAPABILITY_UNSATISFIABLE',
  'PACK_COMPATIBILITY_MISMATCH',
  'PACK_CONFIGURATION_INVALID',
  'PACK_CONFLICT',
  'PACK_CONTRACT_INCOMPATIBLE',
  'PACK_CONTRIBUTION_INVALID',
  'PACK_CORE_INCOMPATIBLE',
  'PACK_DECLARATION_INVALID',
  'PACK_DEPENDENCY_MISSING',
  'PACK_DEPENDENCY_UNSATISFIABLE',
  'PACK_DIGEST_MISMATCH',
  'PACK_DISCLOSURE_REQUIRED',
  'PACK_DUPLICATE_ID_VERSION',
  'PACK_FIXTURE_FAILED',
  'PACK_FIXTURE_INVALID',
  'PACK_IMPLEMENTATION_UNAVAILABLE',
  'PACK_KIND_INVALID',
  'PACK_MANIFEST_INVALID',
  'PACK_MIGRATION_CONFIRMATION_REQUIRED',
  'PACK_MIGRATION_FAILED',
  'PACK_MIGRATION_INVALID',
  'PACK_MIGRATION_REQUIRED',
  'PACK_MULTIPLE_ROOTS',
  'PACK_NOT_FOUND',
  'PACK_ORDER_CYCLE',
  'PACK_OVERRIDE_FORBIDDEN',
  'PACK_OVERRIDE_INVALID',
  'PACK_OVERRIDE_POINT_NOT_FOUND',
  'PACK_PERMISSION_FORBIDDEN',
  'PACK_PROVENANCE_INVALID',
  'PACK_PUBLISH_AUDIT_FAILED',
  'PACK_REPLAY_LOCK_MISMATCH',
  'PACK_ROOT_REQUIRED',
  'PACK_RULE_CONFLICT',
  'PACK_SCHEMA_UNSUPPORTED',
  'PACK_SOURCE_UNSUPPORTED',
  'PACK_TEMPLATE_INVALID',
  'PACK_UNINSTALL_BLOCKED',
  'PACK_VERSION_UNSATISFIABLE',
]

for (const errorCode of requiredScenarioPackErrorCodes) {
  if (!scenarioPackContract.includes(errorCode)) throw new Error(`SCENARIO_PACK_ERROR_CODE_MISSING:${errorCode}`)
  if (!chineseScenarioPackContract.includes(errorCode)) throw new Error(`CHINESE_SCENARIO_PACK_ERROR_CODE_MISSING:${errorCode}`)
}

if (
  JSON.stringify(uniqueMatches(scenarioPackContract, /\bPACK_[A-Z0-9_]+\b/g)) !==
  JSON.stringify(requiredScenarioPackErrorCodes)
) {
  throw new Error('SCENARIO_PACK_REQUIRED_ERROR_CODES_MISMATCH')
}

const requiredScenarioPackSafetyPhrases = [
  "containsExecutableScenarioCode: false",
  "distributionLifecycleScripts: false",
  "containsExecutableFiles: false",
  "network: false",
  "remoteCalls: false",
  "secrets: false",
  "filesystemWrite: false",
  "mutateConfirmedFacts: false",
  "authorizeCalls: false",
  "overrideHostPolicy: false",
  "selectProvider: false",
  "changeBudgets: false",
  "lifecycleScriptsExecuted: false",
  "status: 'blocked'",
]

for (const phrase of requiredScenarioPackSafetyPhrases) {
  if (!scenarioPackContract.includes(phrase)) throw new Error(`SCENARIO_PACK_SAFETY_CONTRACT_MISSING:${phrase}`)
  if (!chineseScenarioPackContract.includes(phrase)) throw new Error(`CHINESE_SCENARIO_PACK_SAFETY_CONTRACT_MISSING:${phrase}`)
}

if (!scenarioPackContract.includes('Core must not import first-party scenario packages')) {
  throw new Error('SCENARIO_PACK_CORE_BRANCH_PROHIBITION_MISSING')
}

if (!chineseScenarioPackContract.includes('Core 不得导入第一方场景包')) {
  throw new Error('CHINESE_SCENARIO_PACK_CORE_BRANCH_PROHIBITION_MISSING')
}

if (contributing.includes('explicitly import and register')) {
  throw new Error('CONTRIBUTING_EXECUTABLE_SCENARIOPACK_WORDING_FORBIDDEN')
}

const requiredScenarioPackContractShapes = [
  [
    'ScenarioPackManifest',
    [
      'license: string',
      'provenance: PackageProvenance',
      'fixtures: ScenarioContributionDescriptor[]',
      'migrations: ScenarioContributionDescriptor[]',
      'capabilityRequirements: ScenarioCapabilityRequirement[]',
      'declarations: ScenarioPackDeclarations',
      'permissions: ScenarioPackPermissions',
      'distributionInventory: DistributionInventoryEntry[]',
    ],
  ],
  [
    'ScenarioCompositionLock',
    [
      'contractVersion:',
      'resolverVersion: string',
      'catalogHash: string',
      'hostPolicyOverlayHash?: string',
      'compositionHash: string',
      'lockHash: string',
    ],
  ],
  [
    'PackActivation',
    [
      'selectionHash: string',
      'catalogHash: string',
      'registryRevision: number',
      'lockHash: string',
      'effectiveScenarioHash: string',
      'resolutionReportHash: string',
      'activationHash: string',
    ],
  ],
  [
    'MigrationPlan',
    [
      'fromLockHash: string',
      'targetCatalogHash: string',
      'targetLockHash: string',
      'targetEffectiveScenarioHash: string',
      'targetResolutionReportHash: string',
      'sourceCaseRevision: number',
      'sourceEditableStateHash: string',
      'targetCaseRevision: number',
      'confirmationHash?: string',
      'planHash: string',
    ],
  ],
  [
    'ScenarioPackCatalogSnapshot',
    [
      'registryRevision: number',
      'entries: ScenarioPackDescriptor[]',
      'availabilityPolicies: PackDeactivation[]',
      'catalogHash: string',
    ],
  ],
  [
    'PackUninstallCheck',
    [
      'registryRevision: number',
      "status: 'allowed' | 'blocked'",
      'blockingReasonCodes: string[]',
      'activeActivationHashes: string[]',
      'availabilityPolicyHashes: string[]',
      'activeSelectionHashes: string[]',
      'pendingMigrationPlanHashes: string[]',
      'checkHash: string',
    ],
  ],
  [
    'PackUninstallReceipt',
    [
      'removedFromRegistry: true',
      'registryRevisionBefore: number',
      'registryRevisionAfter: number',
      'tombstoneDescriptorHash: string',
      'tombstoneProvenanceHash: string',
      'preservedHistory: true',
      'unavailableReplayLockHashes: string[]',
      'receiptHash: string',
    ],
  ],
]

function interfaceBody(content, name) {
  const match = content.match(new RegExp(`interface ${name} \\{([\\s\\S]*?)^\\}`, 'm'))
  if (!match) throw new Error(`SCENARIO_PACK_INTERFACE_MISSING:${name}`)
  return match[1]
}

for (const [name, fields] of requiredScenarioPackContractShapes) {
  const body = interfaceBody(scenarioPackContract, name)
  for (const field of fields) {
    if (!body.includes(field)) throw new Error(`SCENARIO_PACK_INTERFACE_FIELD_MISSING:${name}:${field}`)
  }
}

const permissionBody = interfaceBody(scenarioPackContract, 'ScenarioPackPermissions')
for (const field of requiredScenarioPackSafetyPhrases.slice(3, 12)) {
  if (!permissionBody.includes(field)) throw new Error(`SCENARIO_PACK_PERMISSION_FIELD_MISSING:${field}`)
}

const declarationBody = interfaceBody(scenarioPackContract, 'ScenarioPackDeclarations')
for (const field of requiredScenarioPackSafetyPhrases.slice(0, 3)) {
  if (!declarationBody.includes(field)) throw new Error(`SCENARIO_PACK_DECLARATION_FIELD_MISSING:${field}`)
}

if (!interfaceBody(scenarioPackContract, 'PackageAcquisition').includes('lifecycleScriptsExecuted: false')) {
  throw new Error('SCENARIO_PACK_ACQUISITION_SCRIPT_GUARD_MISSING')
}

if (interfaceBody(scenarioPackContract, 'DistributionInventoryEntry').includes("'manifest'")) {
  throw new Error('SCENARIO_PACK_SELF_REFERENTIAL_MANIFEST_INVENTORY_FORBIDDEN')
}

const requiredSystemContractShapes = [
  [
    'CompilationContext',
    [
      'caseSpecId: string',
      'caseSpecRevision: number',
      'caseSpecHash: string',
      'artifactHashes: string[]',
      'decisionHashes: string[]',
      'scenarioCompositionLockHash: string',
      'effectiveScenarioHash: string',
      'rulePackPlugins: VersionPin[]',
      'optimizer: VersionPin',
      'contextHash: string',
    ],
  ],
  [
    'ArtifactHandle',
    [
      'contentHash: string',
      'role: string',
      'resolverId: string',
      "availability: 'available' | 'deleted' | 'expired' | 'unknown'",
      'retentionClass: string',
      'redactionPolicy: string',
    ],
  ],
  [
    'ObservationDecision',
    [
      'decisionId: string',
      'decisionHash: string',
      'observationHash: string',
      'contextHash: string',
      "status: 'proposed' | 'confirmed' | 'rejected'",
    ],
  ],
  ['SourceBinding', ['contentHash: string']],
  [
    'BindingDecision',
    ['decisionId: string', 'decisionHash: string', 'bindingHash: string', 'contextHash: string'],
  ],
  [
    'RemoteCallAuthorization',
    [
      'inputHash: string',
      'permittedArtifactHashes: string[]',
      'permittedScopeIds: string[]',
      'modelId?: string',
      'modelVersion?: string',
    ],
  ],
  [
    'PromptCandidateIR',
    [
      'candidateHash: string',
      'targetAdapter: VersionPin',
      'targetCapabilityProfile: VersionPin',
      "candidateSections: PromptIR['sections']",
      'requestParameters: Record<string, unknown>',
      'referenceMappings: PlannedReference[]',
      'coverageClaims:',
    ],
  ],
]

for (const [name, fields] of requiredSystemContractShapes) {
  const body = interfaceBody(systemDesign, name)
  for (const field of fields) {
    if (!body.includes(field)) throw new Error(`SYSTEM_INTERFACE_FIELD_MISSING:${name}:${field}`)
  }
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
  'ScenarioPack',
  'ScenarioPackRegistry',
  'ScenarioPackSelection',
  'ScenarioPackCatalogSnapshot',
  'ScenarioCompositionLock',
  'EffectiveScenario',
  'PackResolutionReport',
  'DeclarativeRulePackContribution',
  'RulePackPlugin',
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
  'ScenarioPack',
  'ScenarioPackManifest',
  'ScenarioPackCatalogSnapshot',
  'ScenarioCompositionLock',
  'EffectiveScenario',
  'DeclarativeRulePackContribution',
  'RulePackPlugin',
  'PackResolutionReport',
  'PackUninstallCheck',
  'PackUninstallReceipt',
  'PackageAcquisition',
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
assertSameMermaidTopology('SCENARIO_PACK', scenarioPackContract, chineseScenarioPackContract)

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
assertSameFenceSequence('SCENARIO_PACK', scenarioPackContract, chineseScenarioPackContract)

if (JSON.stringify(typedBlocks(systemDesign, 'ts')) !== JSON.stringify(typedBlocks(chineseSystemDesign, 'ts'))) {
  throw new Error('SYSTEM_TYPESCRIPT_CONTRACT_MISMATCH')
}

if (JSON.stringify(typedBlocks(scenarioPackContract, 'ts')) !== JSON.stringify(typedBlocks(chineseScenarioPackContract, 'ts'))) {
  throw new Error('SCENARIO_PACK_TYPESCRIPT_CONTRACT_MISMATCH')
}

for (const [file, content] of Object.entries(requiredFileContents)) {
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
