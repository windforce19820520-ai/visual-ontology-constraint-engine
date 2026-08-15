import { createHash, randomUUID } from 'node:crypto'
import { lstat, mkdir, readdir, readFile, realpath, rename, writeFile } from 'node:fs/promises'
import * as path from 'node:path'
import * as process from 'node:process'
import type {
  ArtifactHandle, BundleFileEntry, BundleKind, BundleManifest, CaseSpec, FixtureSuite,
  ChangeIntent, ConstraintCompilationInput, JsonObject, JsonValue, LocalScenarioPackSource, OutputContract, ScenarioPack,
  ScenarioPackManifest, VersionPin,
} from '@voce-engine/contracts'
import {
  MOCK_IMAGE_PROFILE, MOCK_JPEG_PROFILE, MOCK_LIMITED_REFERENCE_PROFILE,
  compileEvaluationReport, computeExecutionRunHash,
  computeCompilationContextHash, computeOntologyInstanceHash, computeSemanticReviewRequestHash, computeStaticTraceReportModelHash, createConstraintWaiver, createHumanAcceptanceDecision,
  compileConstraints,
  createScenarioPackRegistry, executeOffline, executeSemanticReview,
  FixtureReferenceInterpreter, FixtureSemanticReviewer, guardPromptCandidate, renderStaticTraceReport, sha256,
  traceModelFromExecution, validateStructuralImage, canonicalize,
} from '@voce-engine/core'
import type { OfflineExecutionResult } from '@voce-engine/core'
import type {
  ComparisonSnapshot, EvaluationReport, OfflineExecutionInput,
  PromptCandidateIR, SemanticReviewRequest, StaticTraceReportModel,
} from '@voce-engine/contracts'
import {
  FIXTURE_M6_OPAQUE_PNG, fixtureChangeIntent, fixtureM4ConstraintInput, fixtureM5Candidate, fixtureM5ExecutionInput, fixtureM5GuardInput, fixtureM5PromptIR, fixtureM6Artifact, fixtureM6Authorization, fixtureScopePlan,
} from '@voce-engine/testkit'
import { BUNDLE_MANIFEST_SCHEMA_VERSION } from '@voce-engine/contracts'

export const CLI_VERSION = '0.1.0-rc.2'
const TOOL_ID = '@voce-engine/cli'
const CONTRACTS_VERSION = '0.1.0-rc.2'
const CORE_VERSION = '0.1.0-rc.2'
const SOURCE_SCHEMA = 'voce.scenario-pack-source/v1alpha1'
const PACK_SCHEMA = 'voce.scenario-pack/v1alpha1'
const HASH = /^sha256:[0-9a-f]{64}$/
const EXIT = { ok: 0, usage: 2, input: 3, contract: 4, offline: 5, output: 6, internal: 7 } as const

class CliError extends Error {
  constructor(readonly code: string, message: string, readonly exitCode: number = EXIT.input) { super(message) }
}

function compare(a: string, b: string): number { return a < b ? -1 : a > b ? 1 : 0 }
function json(value: unknown): string { return canonicalize(value as JsonValue) }
function bytesHash(bytes: Uint8Array): string { return `sha256:${createHash('sha256').update(bytes).digest('hex')}` }
function textBytes(value: unknown): Uint8Array { return new TextEncoder().encode(json(value)) }
function clone<T>(value: T): T { return JSON.parse(JSON.stringify(value)) as T }
function isObject(value: unknown): value is Record<string, unknown> { return !!value && typeof value === 'object' && !Array.isArray(value) }
function record(value: unknown, code: string): Record<string, unknown> {
  if (!isObject(value)) throw new CliError(code, 'Expected a JSON object.')
  return value
}
function assertKnown(object: Record<string, unknown>, fields: string[], code: string): void { const allowed = new Set(fields); for (const key of Object.keys(object)) if (!allowed.has(key)) throw new CliError(code, `Unknown field ${key}.`, EXIT.contract) }
function stringField(object: Record<string, unknown>, field: string, code = 'INPUT_FIELD_INVALID'): string {
  if (typeof object[field] !== 'string' || object[field].length === 0) throw new CliError(code, `Field ${field} is required.`)
  return object[field] as string
}
function safeRelative(value: string): boolean {
  return value.length > 0 && !value.includes('\\') && !value.startsWith('/') && !/^[A-Za-z]:/.test(value) && !value.split('/').some((part) => part === '' || part === '.' || part === '..')
}
function safeDisplayPath(value: string): string { return path.basename(value).replaceAll('\\', '/') }
function assertHash(value: unknown, code = 'HASH_INVALID'): asserts value is string { if (typeof value !== 'string' || !HASH.test(value)) throw new CliError(code, 'A content hash is invalid.', EXIT.contract) }
function assertNoUnsafe(value: unknown, location = 'document'): void {
  if (typeof value === 'string') {
    if (/^(?:https?:|data:|file:|\\\\|[A-Za-z]:[\\/])/.test(value)) throw new CliError('PUBLIC_PATH_OR_URL_FORBIDDEN', `Unsafe path or URL in ${location}.`, EXIT.contract)
    if (value.length > 128 && /^[A-Za-z0-9+/=_-]+$/.test(value)) throw new CliError('PUBLIC_BASE64_FORBIDDEN', `Encoded payload in ${location}.`, EXIT.contract)
    return
  }
  if (Array.isArray(value)) { value.forEach((item, index) => assertNoUnsafe(item, `${location}[${index}]`)); return }
  if (isObject(value)) {
    for (const [key, item] of Object.entries(value)) {
      if (/(?:password|secret|token|api[_-]?key|credential|signed[_-]?url|base64)/i.test(key) && key !== 'leftTokens' && key !== 'rightTokens') throw new CliError('PUBLIC_SECRET_FIELD_FORBIDDEN', `Sensitive field ${key} is not allowed.`, EXIT.contract)
      assertNoUnsafe(item, `${location}.${key}`)
    }
  }
}
function omit<T extends Record<string, unknown>>(value: T, field: string): JsonObject { const copy = clone(value) as Record<string, unknown>; delete copy[field]; return copy as JsonObject }

interface SourceContribution { id: string; schemaVersion?: string; namespace?: string; rules?: JsonValue[]; value?: JsonValue; [key: string]: unknown }
interface SourceDeclarations { mayHandlePersonImages: boolean; rightsDisclosureRequired: boolean }
type ProbeImportance = 'hard'|'required'|'preferred'
interface FixtureProbeIntent { id: string; operation: ChangeIntent['operation']; targetPath: string; requestedValue?: JsonValue; importance?: ProbeImportance }
interface FixtureCoreProbe { id: string; intents?: FixtureProbeIntent[]; unknownPaths?: string[]; waiverTarget?: string }
interface FixtureAssertion { id: string; phase: 'compile'|'run'; target: string; operator: 'equals'|'includes'|'gte'|'exists'|'sha256'; expected?: JsonValue }
interface SourceFixtureCase { id: string; profileId?: string; expectedStatus?: string; semanticReview?: boolean; humanPending?: boolean; scopePaths?: string[]; coreProbes?: FixtureCoreProbe[]; expectedAssertions?: FixtureAssertion[]; [key: string]: unknown }
interface SourceDocument {
  schemaVersion: typeof SOURCE_SCHEMA
  packId: string
  version: string
  kind?: 'root'|'extension'
  scenarioLabel?: string
  declarations: SourceDeclarations
  contribution?: SourceContribution
  contributions?: Partial<Record<'ontologyVocabulary'|'rulePacks'|'interpretationScopes'|'promptSections'|'reviewTemplates'|'defaults'|'overridePoints', SourceContribution[]>>
  fixtures?: Array<{ id: string; cases: SourceFixtureCase[] }>
}
interface LoadedPack { source: LocalScenarioPackSource; definition: ScenarioPack; descriptor: ReturnType<ReturnType<typeof createScenarioPackRegistry>['register']>; fixtures: SourceFixtureCase[] }

function contributionBody(category: string, raw: SourceContribution, packId: string): Record<string, unknown> {
  const body: Record<string, unknown> = { ...raw }
  delete body.contentDigest
  body.id = typeof body.id === 'string' ? body.id : `${packId}.${category}.default`
  body.schemaVersion = typeof body.schemaVersion === 'string' ? body.schemaVersion : `voce.${category}/v1alpha1`
  if (category === 'rulePacks') { body.namespace = typeof body.namespace === 'string' ? body.namespace : `${packId}.rules`; body.rules = Array.isArray(body.rules) ? body.rules : [] }
  const digest = sha256(body as JsonObject)
  return { ...body, contentDigest: digest }
}
function fixtureSuite(raw: { id: string; cases: SourceFixtureCase[] }): FixtureSuite {
  const base = { id: raw.id, schemaVersion: 'voce.fixture-suite/v1alpha1', cases: raw.cases }
  return { ...base, cases: raw.cases as unknown as JsonValue[], contentDigest: sha256(base as unknown as JsonObject) }
}
function distributionFiles(bodies: Array<{ path: string; content: unknown; role: 'contribution'|'fixture'}>): Array<{ path: string; bytes: Uint8Array }> {
  return bodies.map((item) => ({ path: item.path, bytes: textBytes(item.content) }))
}
function makeManifest(doc: SourceDocument, contributions: ScenarioPack['contributions'], files: Array<{ path: string; bytes: Uint8Array }>, suiteList: FixtureSuite[]): ScenarioPackManifest {
  const indexes = (Object.keys(contributions) as Array<keyof ScenarioPack['contributions']>).reduce((result, category) => {
    if (category === 'fixtureSuites') return result
    const values = contributions[category] as Array<Record<string, unknown>>
    result[category] = values.map((body) => ({ id: String(body.id), schemaVersion: String(body.schemaVersion), contentDigest: String(body.contentDigest) }))
    return result
  }, {} as Record<string, Array<{ id: string; schemaVersion: string; contentDigest: string }>>)
  return {
    schemaVersion: PACK_SCHEMA, packId: doc.packId, version: doc.version, kind: doc.kind ?? 'root',
    supportedInteractionModes: ['text_only', 'reference_guided', 'edit_existing'],
    inputExpectations: [{ id: 'intent', inputKind: 'text_intent', dataType: 'text', requiredIn: ['text_only', 'reference_guided', 'edit_existing'], cardinality: { min: 1, max: 1 }, sensitivity: 'none' }],
    outputExpectations: [{ id: 'image', artifactKind: 'image', dataType: 'image', producedIn: ['text_only', 'reference_guided', 'edit_existing'], cardinality: { min: 1, max: 1 }, mediaTypes: ['image/png', 'image/jpeg'] }],
    license: 'Apache-2.0', provenance: { publisher: 'VOCE fixture authors', sourceRepository: 'https://github.com/windforce19820520-ai/visual-ontology-constraint-engine' },
    coreRange: '>=0.1.0', contractRanges: { 'voce.scenario-pack': '>=0.1.0' }, ui: { defaultLocale: 'en', locales: { en: { displayName: doc.packId, description: 'Redistributable offline VOCE fixture pack.', messages: {} } }, disclosures: [], accessibility: { textAlternativesRequired: true, keyboardOperableReferenceUI: true, doesNotRelyOnColorAlone: true } },
    dependencies: [], conflicts: [], composition: { before: [], after: [] }, contributions: indexes as unknown as ScenarioPackManifest['contributions'], fixtures: suiteList.map((suite) => ({ id: suite.id, schemaVersion: suite.schemaVersion, contentDigest: suite.contentDigest })), migrations: [], capabilityRequirements: [],
    declarations: { containsExecutableScenarioCode: false, distributionLifecycleScripts: false, containsExecutableFiles: false, fixturesRequireNetwork: false, fixturesRequireRealProvider: false, collectsTelemetry: false, ...doc.declarations },
    permissions: { network: false, remoteCalls: false, secrets: false, filesystemWrite: false, mutateConfirmedFacts: false, authorizeCalls: false, overrideHostPolicy: false, selectProvider: false, changeBudgets: false },
    distributionInventory: files.map((file) => ({ path: file.path, role: file.path.includes('/fixtures/') ? 'fixture' as const : 'contribution' as const, contentDigest: bytesHash(file.bytes) })),
  }
}
function sourceDocument(raw: unknown): SourceDocument {
  const value = record(raw, 'PACK_SOURCE_INVALID')
  if (value.schemaVersion !== SOURCE_SCHEMA) throw new CliError('PACK_SCHEMA_UNSUPPORTED', 'ScenarioPack source schema is unsupported.', EXIT.contract)
  const packId = stringField(value, 'packId', 'PACK_SOURCE_INVALID'); const version = stringField(value, 'version', 'PACK_SOURCE_INVALID')
  if (value.kind !== undefined && value.kind !== 'root' && value.kind !== 'extension') throw new CliError('PACK_SOURCE_INVALID', 'Pack kind is invalid.')
  const declarations = value.declarations === undefined ? { mayHandlePersonImages: false, rightsDisclosureRequired: false } : record(value.declarations, 'PACK_DECLARATIONS_INVALID')
  assertKnown(declarations, ['mayHandlePersonImages', 'rightsDisclosureRequired'], 'PACK_DECLARATIONS_UNKNOWN_FIELD')
  if (typeof declarations.mayHandlePersonImages !== 'boolean' || typeof declarations.rightsDisclosureRequired !== 'boolean') throw new CliError('PACK_DECLARATIONS_INVALID', 'ScenarioPack declarations must be booleans.', EXIT.contract)
  if (value.contribution !== undefined && !isObject(value.contribution)) throw new CliError('PACK_SOURCE_INVALID', 'Contribution must be an object.')
  if (value.contributions !== undefined && !isObject(value.contributions)) throw new CliError('PACK_SOURCE_INVALID', 'Contributions must be an object.')
  if (value.fixtures !== undefined && (!Array.isArray(value.fixtures) || value.fixtures.some((item) => !isObject(item) || typeof item.id !== 'string' || !Array.isArray(item.cases)))) throw new CliError('PACK_SOURCE_INVALID', 'Fixture suites are invalid.')
  const known = new Set(['schemaVersion', 'packId', 'version', 'kind', 'scenarioLabel', 'declarations', 'contribution', 'contributions', 'fixtures'])
  for (const key of Object.keys(value)) if (!known.has(key)) throw new CliError('PACK_UNKNOWN_FIELD', `Unknown ScenarioPack source field ${key}.`, EXIT.contract)
  return { ...value, declarations } as unknown as SourceDocument
}
async function noSymlinkAncestors(filePath: string, code: string): Promise<void> {
  const absolute = path.resolve(filePath); const parsed = path.parse(absolute); let current = parsed.root
  for (const part of path.relative(parsed.root, absolute).split(path.sep).filter(Boolean)) {
    current = path.join(current, part)
    const info = await lstat(current).catch(() => undefined)
    if (info?.isSymbolicLink()) throw new CliError(code, 'Input path contains a symbolic link.', EXIT.contract)
    if (!info) break
  }
}
async function regularFile(filePath: string, unsafeCode: string): Promise<void> {
  const absolute = path.resolve(filePath); await noSymlinkAncestors(absolute, unsafeCode)
  const info = await lstat(absolute).catch(() => undefined)
  if (!info) throw new CliError('INPUT_READ_FAILED', 'Input file cannot be read.')
  if (info.isSymbolicLink() || info.nlink > 1 || !info.isFile()) throw new CliError(unsafeCode, 'Input must be a regular, single-link file.', EXIT.contract)
}
async function existingBoundary(inputPath: string, unsafeCode: string): Promise<string> {
  const absolute = path.resolve(inputPath); await noSymlinkAncestors(absolute, unsafeCode)
  const info = await lstat(absolute).catch(() => undefined)
  if (!info) throw new CliError('INPUT_READ_FAILED', 'Input path cannot be read.')
  if (info.isSymbolicLink() || (!info.isDirectory() && !info.isFile()) || info.isFile() && info.nlink > 1) throw new CliError(unsafeCode, 'Input path is not a safe explicit file or directory.', EXIT.contract)
  return realpath(absolute)
}
async function outputBoundary(outputPath: string): Promise<string> {
  const absolute = path.resolve(outputPath); await noSymlinkAncestors(absolute, 'OUTPUT_PATH_UNSAFE')
  const info = await lstat(absolute).catch(() => undefined)
  if (info?.isSymbolicLink() || info && !info.isDirectory() && !info.isFile()) throw new CliError('OUTPUT_PATH_UNSAFE', 'Output path is not a regular file or directory.', EXIT.output)
  if (info) return realpath(absolute)
  const missing: string[] = []; let cursor = absolute
  while (!(await lstat(cursor).catch(() => undefined))) {
    const parent = path.dirname(cursor); if (parent === cursor) return absolute
    missing.unshift(path.basename(cursor)); cursor = parent
  }
  return path.join(await realpath(cursor), ...missing)
}
function boundaryOverlaps(left: string, right: string): boolean {
  const normalize = (value: string) => process.platform === 'win32' ? value.toLowerCase() : value
  const a = normalize(path.resolve(left)); const b = normalize(path.resolve(right)); const same = (x: string, y: string) => x === y || x.startsWith(`${y}${path.sep}`)
  return same(a, b) || same(b, a)
}
async function assertOutputSeparated(outputPath: string, inputPaths: string[]): Promise<void> {
  const output = await outputBoundary(outputPath)
  for (const inputPath of inputPaths) {
    const input = await existingBoundary(inputPath, 'INPUT_PATH_UNSAFE')
    if (boundaryOverlaps(output, input)) throw new CliError('OUTPUT_INPUT_OVERLAP', 'Output must be independent from every input path.', EXIT.output)
  }
}
async function readJson(filePath: string, unsafeCode = 'INPUT_FILE_UNSAFE'): Promise<unknown> {
  await regularFile(filePath, unsafeCode)
  let raw: string
  try { raw = await readFile(filePath, 'utf8') } catch { throw new CliError('INPUT_READ_FAILED', 'Input file cannot be read.') }
  try { return JSON.parse(raw) as unknown } catch { throw new CliError('INPUT_JSON_INVALID', 'Input is not valid JSON.') }
}
async function loadPack(sourcePath: string): Promise<LoadedPack> {
  const explicit = path.resolve(sourcePath)
  let inputPath = explicit
  const info = await lstat(explicit).catch(() => undefined)
  if (!info) throw new CliError('PACK_SOURCE_NOT_FOUND', 'Explicit ScenarioPack source was not found.')
  if (info.isSymbolicLink() || (!info.isDirectory() && !info.isFile()) || info.isFile() && info.nlink > 1) throw new CliError('PACK_SOURCE_UNSAFE', 'ScenarioPack source must be a regular file or directory.', EXIT.contract)
  if (info.isDirectory()) {
    const simple = path.join(explicit, 'pack.json'); const standard = path.join(explicit, 'scenario-pack', 'manifest.json')
    if (await lstat(simple).catch(() => undefined)) inputPath = simple
    else if (await lstat(standard).catch(() => undefined)) return loadStandardDirectory(explicit, standard)
    else throw new CliError('PACK_SOURCE_INVALID', 'Explicit directory has no pack.json or scenario-pack/manifest.json.')
  }
  const doc = sourceDocument(await readJson(inputPath, 'PACK_SOURCE_UNSAFE'))
  const categories: Array<keyof NonNullable<SourceDocument['contributions']>> = ['ontologyVocabulary', 'rulePacks', 'interpretationScopes', 'promptSections', 'reviewTemplates', 'defaults', 'overridePoints']
  const bodies = {} as ScenarioPack['contributions']
  const files: Array<{ path: string; content: unknown; role: 'contribution'|'fixture' }> = []
  for (const category of categories) {
    const rawValues = doc.contributions?.[category] ?? (category === 'rulePacks' && doc.contribution ? [doc.contribution] : [])
    const values = (rawValues as SourceContribution[]).map((raw) => contributionBody(category, raw, doc.packId))
    ;(bodies as unknown as Record<string, unknown>)[category] = values
    values.forEach((body) => files.push({ path: `scenario-pack/contributions/${category}/${String(body.id)}.json`, content: body, role: 'contribution' }))
  }
  const suites = (doc.fixtures ?? [{ id: `${doc.packId}.offline`, cases: [] }]).map(fixtureSuite)
  bodies.fixtureSuites = suites
  for (const suite of suites) files.push({ path: `scenario-pack/fixtures/${suite.id}.json`, content: suite, role: 'fixture' })
  const logicalFiles = distributionFiles(files)
  const manifest = makeManifest(doc, bodies, logicalFiles, suites)
  const definition: ScenarioPack = { manifest, contributions: bodies, migrations: [] }
  const registry = createScenarioPackRegistry(); const source: LocalScenarioPackSource = { kind: 'memory', definition, logicalFiles }
  let descriptor: ReturnType<typeof registry.register>
  try { descriptor = registry.register(source) } catch (error) { throw new CliError(error instanceof Error ? error.message : 'PACK_REGISTER_FAILED', 'ScenarioPack validation failed.', EXIT.contract) }
  return { source, definition, descriptor, fixtures: suites.flatMap((suite) => suite.cases as SourceFixtureCase[]) }
}
async function loadStandardDirectory(root: string, manifestPath: string): Promise<LoadedPack> {
  await existingBoundary(root, 'PACK_SOURCE_UNSAFE'); await regularFile(manifestPath, 'PACK_MANIFEST_UNSAFE')
  const manifest = await readJson(manifestPath, 'PACK_MANIFEST_UNSAFE') as ScenarioPackManifest
  if (!isObject(manifest) || manifest.schemaVersion !== PACK_SCHEMA || !Array.isArray(manifest.distributionInventory)) throw new CliError('PACK_MANIFEST_INVALID', 'ScenarioPack manifest is invalid.', EXIT.contract)
  assertKnown(manifest as unknown as Record<string, unknown>, ['schemaVersion', 'packId', 'version', 'kind', 'supportedInteractionModes', 'inputExpectations', 'outputExpectations', 'extensionOf', 'license', 'provenance', 'coreRange', 'contractRanges', 'configurationSchema', 'ui', 'dependencies', 'conflicts', 'composition', 'contributions', 'fixtures', 'migrations', 'capabilityRequirements', 'declarations', 'permissions', 'distributionInventory'], 'PACK_UNKNOWN_FIELD')
  if (manifest.distributionInventory.some((item) => !isObject(item) || typeof item.path !== 'string' || !safeRelative(item.path) || typeof item.contentDigest !== 'string' || !HASH.test(item.contentDigest))) throw new CliError('PACK_MANIFEST_INVALID', 'ScenarioPack inventory is invalid.', EXIT.contract)
  const inventoryPaths = new Set(manifest.distributionInventory.map((item) => item.path))
  async function enumerate(directory: string, relative = ''): Promise<string[]> {
    const names = await readdir(path.join(directory, relative), { withFileTypes: true }); const result: string[] = []
    for (const entry of names) {
      const child = relative ? `${relative}/${entry.name}` : entry.name; const metadata = await lstat(path.join(directory, ...child.split('/')))
      if (metadata.isSymbolicLink() || metadata.nlink > 1) throw new CliError('PACK_ENTRY_UNSAFE', 'ScenarioPack contains a symlink or hardlink.', EXIT.contract)
      if (metadata.isDirectory()) result.push(...await enumerate(directory, child))
      else if (metadata.isFile()) result.push(child.replaceAll('\\', '/'))
      else throw new CliError('PACK_ENTRY_UNSAFE', 'ScenarioPack contains a device or non-file entry.', EXIT.contract)
    }
    return result
  }
  const actualPaths = await enumerate(root); const expectedPaths = new Set(['scenario-pack/manifest.json', ...inventoryPaths]); if (actualPaths.some((item) => !expectedPaths.has(item)) || expectedPaths.size !== actualPaths.length) throw new CliError('PACK_INVENTORY_INCOMPLETE', 'ScenarioPack files do not match the explicit inventory.', EXIT.contract)
  const logicalFiles: Array<{ path: string; bytes: Uint8Array }> = []
  const contributions: ScenarioPack['contributions'] = { ontologyVocabulary: [], rulePacks: [], interpretationScopes: [], promptSections: [], reviewTemplates: [], defaults: [], overridePoints: [], fixtureSuites: [] }
  for (const item of manifest.distributionInventory) {
    if (!isObject(item) || typeof item.path !== 'string' || !safeRelative(item.path)) throw new CliError('PACK_PATH_UNSAFE', 'ScenarioPack inventory path is unsafe.', EXIT.contract)
    const filePath = path.join(root, ...item.path.split('/')); await regularFile(filePath, 'PACK_ENTRY_UNSAFE'); const bytes = await readFile(filePath).catch(() => { throw new CliError('PACK_FILE_MISSING', 'ScenarioPack inventory file is missing.', EXIT.contract) })
    if (bytesHash(bytes) !== item.contentDigest) throw new CliError('PACK_DIGEST_MISMATCH', 'ScenarioPack inventory digest does not match.', EXIT.contract)
    logicalFiles.push({ path: item.path, bytes })
    if (item.path.includes('/contributions/')) {
      const parts = item.path.split('/'); const category = parts[2] as keyof ScenarioPack['contributions']; const body = await parseBytes(bytes)
      if (category in contributions && category !== 'fixtureSuites') (contributions[category] as unknown[]).push(body as never)
    } else if (item.path.includes('/fixtures/')) contributions.fixtureSuites.push(await parseBytes(bytes) as FixtureSuite)
  }
  const definition: ScenarioPack = { manifest, contributions, migrations: [] }; const source: LocalScenarioPackSource = { kind: 'memory', definition, logicalFiles }
  const registry = createScenarioPackRegistry(); let descriptor: ReturnType<typeof registry.register>
  try { descriptor = registry.register(source) } catch (error) { throw new CliError(error instanceof Error ? error.message : 'PACK_REGISTER_FAILED', 'ScenarioPack validation failed.', EXIT.contract) }
  return { source, definition, descriptor, fixtures: contributions.fixtureSuites.flatMap((suite) => suite.cases as SourceFixtureCase[]) }
}
async function parseBytes(bytes: Uint8Array): Promise<unknown> { try { return JSON.parse(new TextDecoder().decode(bytes)) as unknown } catch { throw new CliError('PACK_JSON_INVALID', 'ScenarioPack data file is not valid JSON.', EXIT.contract) } }

type ResolvedPackResolution = Extract<ReturnType<ReturnType<typeof createScenarioPackRegistry>['resolve']>, { status: 'resolved' }>
function probeInput(probe: FixtureCoreProbe, resolution: ResolvedPackResolution, caseSpec: CaseSpec): ConstraintCompilationInput {
  const base = fixtureM4ConstraintInput()
  const contextBase = { ...base.context, caseSpecId: caseSpec.id, caseSpecRevision: caseSpec.revision, caseSpecHash: sha256({ fixtureCase: caseSpec.id, revision: caseSpec.revision }), effectiveScenarioHash: resolution.effectiveScenario.effectiveScenarioHash }
  const context = { ...contextBase, contextHash: computeCompilationContextHash(contextBase) } as ConstraintCompilationInput['context']
  const requestedScopePlan = fixtureScopePlan(['person.identity'], 'ref-01', caseSpec.id, caseSpec.revision)
  const ontologyBase = { ...base.ontologyInstance, id: `ontology-${probe.id}`, caseId: caseSpec.id, caseRevision: caseSpec.revision, contextHash: context.contextHash, requestedScopePlanHash: requestedScopePlan.planHash, unknownPaths: probe.unknownPaths ?? [], unspecifiedPaths: [], facts: [], conflicts: [], unresolvedItems: [], decisionTrace: [] }
  const ontologyInstance = { ...ontologyBase, instanceHash: computeOntologyInstanceHash({ ...ontologyBase, instanceHash: '' }) } as ConstraintCompilationInput['ontologyInstance']
  const intents = (probe.intents ?? []).map((intent) => ({ ...fixtureChangeIntent(intent.id, intent.operation, intent.targetPath, intent.requestedValue), importance: intent.importance ?? 'required' }))
  const waivers = probe.waiverTarget ? [createConstraintWaiver({ schemaVersion: 'voce.constraint-waiver/v1alpha1', id: `waiver-${probe.id}`, caseId: caseSpec.id, caseRevision: caseSpec.revision, contextHash: context.contextHash, targetId: probe.waiverTarget, authority: 'user', decidedBy: 'fixture-reviewer', reasonCode: 'FIXTURE_EXPLICIT_WAIVER', decidedAt: '2026-01-01T00:00:00.000Z' })] : []
  return fixtureM4ConstraintInput({ caseId: caseSpec.id, caseRevision: caseSpec.revision, context, contextHash: context.contextHash, requestedScopePlanHash: requestedScopePlan.planHash, ontologyInstance, changeIntents: intents, effectiveScenario: resolution.effectiveScenario, waivers })
}
function coreProbeEvidence(probe: FixtureCoreProbe, resolution: ResolvedPackResolution, caseSpec: CaseSpec): JsonObject {
  const ir = compileConstraints(probeInput(probe, resolution, caseSpec))
  return {
    status: ir.status, constraintHash: ir.deterministicSignature, blockingConflictCount: ir.conflicts.filter((item) => item.blocking).length,
    conflictCodes: ir.conflicts.map((item) => item.code).sort(compare), reviewRequirementCount: ir.reviewRequirements.length,
    reviewReasons: ir.reviewRequirements.map((item) => item.reasonCode).sort(compare), waivedWarnings: ir.warnings.filter((item) => item === 'REQUIRED_CONFLICT_WAIVED' || item === 'HARD_CONFLICT_CANNOT_WAIVE').sort(compare),
    degradationCount: ir.degradedPreferences.length, personIntentCount: (probe.intents ?? []).filter((item) => item.targetPath.startsWith('person.')).length,
  }
}
function referenceEvidence(fixture: SourceFixtureCase, resolution: ResolvedPackResolution, caseSpec: CaseSpec): JsonObject {
  const paths = fixture.scopePaths ?? []
  const plan = fixtureScopePlan(paths, 'ref-01', caseSpec.id, caseSpec.revision)
  const result = new FixtureReferenceInterpreter().interpret({ schemaVersion: 'voce.reference-interpreter-input/v1alpha1', caseId: caseSpec.id, caseRevision: caseSpec.revision, contextHash: sha256({ fixture: fixture.id, caseId: caseSpec.id }), assets: caseSpec.assets, requestedScopePlan: plan, effectiveScenario: resolution.effectiveScenario, fixtureId: fixture.id })
  return { status: result.status, observationCount: result.observations.length, personObservationCount: result.observations.filter((item) => item.ontologyPath.startsWith('person.')).length, observationPaths: result.observations.map((item) => item.ontologyPath).sort(compare), observationAssetIds: result.observations.map((item) => item.assetId).sort(compare), unresolvedCodes: result.unresolvedItems.map((item) => item.code).sort(compare), resultHash: result.resultHash }
}
function pathValue(value: unknown, target: string): unknown {
  let current: unknown = value
  for (const part of target.split('.')) { if (!isObject(current) && !Array.isArray(current)) return undefined; current = (current as Record<string, unknown>)[part] }
  return current
}
function assertionMatches(actual: unknown, assertion: FixtureAssertion): boolean {
  if (assertion.operator === 'exists') return actual !== undefined
  if (assertion.operator === 'sha256') return typeof actual === 'string' && HASH.test(actual)
  if (assertion.operator === 'gte') return typeof actual === 'number' && typeof assertion.expected === 'number' && actual >= assertion.expected
  if (assertion.operator === 'includes') return Array.isArray(actual) ? actual.some((item) => canonicalize(item as JsonValue) === canonicalize(assertion.expected as JsonValue)) : typeof actual === 'string' && typeof assertion.expected === 'string' && actual.includes(assertion.expected)
  return canonicalize(actual as JsonValue) === canonicalize(assertion.expected as JsonValue)
}
function assertFixtureAssertions(fixture: SourceFixtureCase, context: JsonObject, phase: 'compile'|'run'|'all'): JsonObject[] {
  const assertions = fixture.expectedAssertions ?? []
  const selected = assertions.filter((assertion) => phase === 'all' || assertion.phase === phase)
  const seen = new Set<string>(); const results: JsonObject[] = []
  for (const assertion of selected) {
    if (seen.has(assertion.id) || !assertion.id || !assertion.target || !['equals', 'includes', 'gte', 'exists', 'sha256'].includes(assertion.operator)) throw new CliError('FIXTURE_ASSERTION_INVALID', 'Fixture assertion contract is invalid.', EXIT.contract)
    seen.add(assertion.id); const actual = pathValue(context, assertion.target)
    if (!assertionMatches(actual, assertion)) throw new CliError('FIXTURE_ASSERTION_FAILED', `Fixture assertion ${assertion.id} did not match.`, EXIT.contract)
    results.push({ id: assertion.id, status: 'passed', target: assertion.target, operator: assertion.operator, observedHash: sha256(actual === undefined ? null : actual as JsonValue) })
  }
  if (phase === 'all' && results.length !== assertions.length) throw new CliError('FIXTURE_ASSERTION_NOT_EXECUTED', 'A declared fixture assertion was not executed.', EXIT.contract)
  return results.sort((left, right) => compare(String(left.id), String(right.id)))
}

function profileFor(id: string): typeof MOCK_IMAGE_PROFILE {
  if (id === MOCK_IMAGE_PROFILE.id) return MOCK_IMAGE_PROFILE
  if (id === MOCK_JPEG_PROFILE.id) return MOCK_JPEG_PROFILE
  if (id === MOCK_LIMITED_REFERENCE_PROFILE.id) return MOCK_LIMITED_REFERENCE_PROFILE
  throw new CliError('PROFILE_UNSUPPORTED', 'Only a declared offline Mock capability profile is accepted.', EXIT.contract)
}
async function loadProfile(filePath: string): Promise<typeof MOCK_IMAGE_PROFILE> { const object = record(await readJson(path.resolve(filePath), 'PROFILE_FILE_UNSAFE'), 'PROFILE_JSON_INVALID'); return profileFor(stringField(object, 'id', 'PROFILE_INVALID')) }
function profilePin(profile: typeof MOCK_IMAGE_PROFILE): VersionPin { return { id: profile.id, version: profile.version, digest: profile.profileHash! } }
function toolPin(id: string, version: string): VersionPin { return { id, version, digest: sha256({ id, version }) } }
function defaultCase(doc: Record<string, unknown>, packId: string): CaseSpec {
  assertKnown(doc, ['schemaVersion', 'id', 'revision', 'fixtureId', 'mode', 'scenario', 'userIntent', 'assets', 'trustedMetadata', 'policies', 'requestedOutput'], 'CASE_UNKNOWN_FIELD')
  const id = typeof doc.id === 'string' ? doc.id : `${packId}-case`
  const revision = typeof doc.revision === 'number' ? doc.revision : 1
  const output: OutputContract = isObject(doc.requestedOutput) ? doc.requestedOutput as unknown as OutputContract : { artifactKind: 'image', dataType: 'image', mediaTypes: ['image/png'], cardinality: { min: 1, max: 1 }, background: 'opaque', allowAlpha: false }
  const asset: ArtifactHandle = { id: 'ref-01', storeId: 'fixture-store', contentHash: sha256({ fixture: `${id}:ref-01` }), mediaType: 'image/png', byteLength: 64, role: 'reference', resolverId: 'fixture-resolver', availability: 'available', retentionClass: 'fixture', redactionPolicy: 'hash-only' }
  return { schemaVersion: 'voce.case-spec/v1alpha1', id, revision, mode: 'manual', scenario: { root: { packId, versionRange: '0.1.0' }, extensions: [] }, userIntent: typeof doc.userIntent === 'string' ? doc.userIntent : 'Offline fixture case.', assets: [asset], trustedMetadata: [], policies: { schemaVersion: 'voce.case-policies/v1alpha1', observationConfirmation: 'explicit', bindingConfirmation: 'explicit', allowDeclaredDefaults: true }, requestedOutput: output }
}
interface CompileResult { loaded: LoadedPack; resolution: ResolvedPackResolution; caseSpec: CaseSpec; profile: typeof MOCK_IMAGE_PROFILE; fixture: SourceFixtureCase; input: OfflineExecutionInput; prompt: PromptCandidateIR; acceptance: JsonObject }
async function compileInputs(casePath: string, scenarioPath: string, profilePath: string): Promise<CompileResult> {
  const caseDoc = record(await readJson(path.resolve(casePath), 'CASE_FILE_UNSAFE'), 'CASE_JSON_INVALID'); const loaded = await loadPack(scenarioPath); const registry = createScenarioPackRegistry(); registry.register(loaded.source)
  const resolution = registry.resolve({ root: { packId: loaded.descriptor.manifest.packId, versionRange: loaded.descriptor.manifest.version }, extensions: [] })
  if (resolution.status !== 'resolved') throw new CliError('PACK_RESOLUTION_BLOCKED', 'ScenarioPack resolution is blocked.', EXIT.contract)
  const caseSpec = defaultCase(caseDoc, loaded.descriptor.manifest.packId); const fixtureId = typeof caseDoc.fixtureId === 'string' ? caseDoc.fixtureId : caseSpec.id
  const fixture = loaded.fixtures.find((candidate) => candidate.id === fixtureId) ?? loaded.fixtures[0] ?? { id: fixtureId, profileId: MOCK_IMAGE_PROFILE.id }
  const profile = await loadProfile(profilePath)
  const prompt = fixtureM5Candidate(fixtureM5PromptIR(profile))
  const input = fixtureM5ExecutionInput(profile)
  const coreProbes = Object.fromEntries((fixture.coreProbes ?? []).sort((left, right) => compare(left.id, right.id)).map((probe) => [probe.id, coreProbeEvidence(probe, resolution, caseSpec)]))
  const acceptance: JsonObject = { resolution: { status: resolution.status, selectedCount: resolution.report.selected.length, effectiveScenarioHash: resolution.effectiveScenario.effectiveScenarioHash }, reference: referenceEvidence(fixture, resolution, caseSpec), coreProbes, compile: { constraintHash: input.constraintIR.deterministicSignature, referencePlanHash: input.referencePlan.planHash, pipelinePlanHash: input.pipelinePlan.planHash } }
  return { loaded, resolution, caseSpec, profile, fixture, input, prompt, acceptance }
}

function bundlePins(profile: typeof MOCK_IMAGE_PROFILE, scenario: LoadedPack): BundleManifest['pins'] { return { tool: toolPin(TOOL_ID, CLI_VERSION), core: toolPin('@voce-engine/core', CORE_VERSION), contracts: toolPin('@voce-engine/contracts', CONTRACTS_VERSION), scenario: { id: scenario.descriptor.manifest.packId, version: scenario.descriptor.manifest.version, digest: scenario.descriptor.packageDigest }, profile: profilePin(profile) } }
function payloadBytes(payload: Record<string, unknown>): Array<{ path: string; bytes: Uint8Array }> { return Object.entries(payload).sort((a, b) => compare(a[0], b[0])).map(([name, value]) => ({ path: `${name}.json`, bytes: textBytes(value) })) }
function semanticManifestBase(kind: BundleKind, caseInfo: { id: string; revision: number }, pins: BundleManifest['pins'], files: BundleFileEntry[]): JsonObject { return { schemaVersion: BUNDLE_MANIFEST_SCHEMA_VERSION, kind, case: caseInfo, pins, files, createdBy: 'voce-cli' } as unknown as JsonObject }
async function prepareOutput(directory: string, allowed: Set<string>): Promise<void> {
  const absolute = path.resolve(directory); await mkdir(absolute, { recursive: true }); const entries = await readdir(absolute, { withFileTypes: true })
  for (const entry of entries) if (!allowed.has(entry.name)) throw new CliError('OUTPUT_DIRECTORY_NOT_EXCLUSIVE', 'Output directory contains an unrelated entry.', EXIT.output)
}
async function atomicWrite(filePath: string, bytes: Uint8Array | string): Promise<void> { await mkdir(path.dirname(filePath), { recursive: true }); const temporary = path.join(path.dirname(filePath), `.voce-tmp-${randomUUID()}`); await writeFile(temporary, bytes); await rename(temporary, filePath) }
async function writeBundle(directory: string, kind: BundleKind, caseInfo: { id: string; revision: number }, pins: BundleManifest['pins'], payload: Record<string, unknown>): Promise<{ manifest: BundleManifest; semanticHash: string }> {
  const files = payloadBytes(payload); const fileEntries = files.map((file) => ({ path: file.path, sha256: bytesHash(file.bytes), byteLength: file.bytes.byteLength })).sort((a, b) => compare(a.path, b.path)); const base = semanticManifestBase(kind, caseInfo, pins, fileEntries); const semanticHash = sha256(base); const manifest: BundleManifest = { ...base, semanticHash } as unknown as BundleManifest
  const allowed = new Set(['manifest.json', ...files.map((file) => file.path)]); await prepareOutput(directory, allowed)
  for (const file of files) await atomicWrite(path.join(path.resolve(directory), ...file.path.split('/')), file.bytes)
  await atomicWrite(path.join(path.resolve(directory), 'manifest.json'), textBytes(manifest)); return { manifest, semanticHash }
}
async function validateBundlePath(bundlePath: string): Promise<{ manifest: BundleManifest; payload: Record<string, unknown> }> {
  const directory = path.resolve(bundlePath); const info = await lstat(directory).catch(() => undefined); if (!info?.isDirectory() || info.isSymbolicLink()) throw new CliError('BUNDLE_NOT_FOUND', 'Bundle directory was not found.', EXIT.contract)
  await existingBoundary(directory, 'BUNDLE_SOURCE_UNSAFE'); const manifestPath = path.join(directory, 'manifest.json'); await regularFile(manifestPath, 'BUNDLE_MANIFEST_UNSAFE')
  const manifest = record(await readJson(manifestPath, 'BUNDLE_MANIFEST_UNSAFE'), 'BUNDLE_MANIFEST_INVALID') as unknown as BundleManifest
  assertKnown(manifest as unknown as Record<string, unknown>, ['schemaVersion', 'kind', 'case', 'pins', 'files', 'semanticHash', 'createdBy'], 'BUNDLE_UNKNOWN_FIELD')
  if (manifest.schemaVersion !== BUNDLE_MANIFEST_SCHEMA_VERSION || !['compiled', 'run', 'evaluation', 'trace', 'release-candidate'].includes(manifest.kind)) throw new CliError('BUNDLE_SCHEMA_UNSUPPORTED', 'Bundle manifest schema or kind is unsupported.', EXIT.contract)
  assertHash(manifest.semanticHash, 'BUNDLE_SEMANTIC_HASH_INVALID'); if (!isObject(manifest.case) || typeof manifest.case.id !== 'string' || typeof manifest.case.revision !== 'number') throw new CliError('BUNDLE_CASE_INVALID', 'Bundle case pin is invalid.', EXIT.contract); assertKnown(manifest.case as unknown as Record<string, unknown>, ['id', 'revision'], 'BUNDLE_CASE_UNKNOWN_FIELD'); if (!isObject(manifest.pins)) throw new CliError('BUNDLE_PINS_INVALID', 'Bundle pins are invalid.', EXIT.contract); assertKnown(manifest.pins as unknown as Record<string, unknown>, ['tool', 'core', 'contracts', 'scenario', 'profile'], 'BUNDLE_PINS_UNKNOWN_FIELD'); for (const pin of Object.values(manifest.pins)) { if (pin === undefined) continue; if (!isObject(pin)) throw new CliError('BUNDLE_PIN_INVALID', 'Bundle version pin is invalid.', EXIT.contract); assertKnown(pin, ['id', 'version', 'digest'], 'BUNDLE_PIN_UNKNOWN_FIELD'); assertHash(pin.digest, 'BUNDLE_PIN_DIGEST_INVALID') }
  const seen = new Set<string>(); const files = Array.isArray(manifest.files) ? manifest.files : []; for (const entry of files) { if (!isObject(entry)) throw new CliError('BUNDLE_INVENTORY_INVALID', 'Bundle inventory entry is invalid.', EXIT.contract); assertKnown(entry, ['path', 'sha256', 'byteLength'], 'BUNDLE_FILE_UNKNOWN_FIELD'); if (typeof entry.path !== 'string' || !safeRelative(entry.path) || typeof entry.byteLength !== 'number' || !Number.isInteger(entry.byteLength) || entry.byteLength < 0 || seen.has(entry.path) || [...seen].some((item) => item.toLowerCase() === entry.path.toLowerCase())) throw new CliError('BUNDLE_INVENTORY_INVALID', 'Bundle inventory contains an unsafe or duplicate path.', EXIT.contract); seen.add(entry.path); assertHash(entry.sha256, 'BUNDLE_FILE_HASH_INVALID') }
  const actual = await readdir(directory, { withFileTypes: true }); for (const entry of actual) { if (entry.name === 'manifest.json') continue; if (!seen.has(entry.name)) throw new CliError('BUNDLE_EXTRA_FILE', 'Bundle has a file outside its manifest.', EXIT.contract); const info = await lstat(path.join(directory, entry.name)); if (info.isSymbolicLink() || info.nlink > 1 || !info.isFile()) throw new CliError('BUNDLE_ENTRY_UNSAFE', 'Bundle contains a symlink, hardlink, device, or non-file entry.', EXIT.contract) }
  for (const entry of files) { const filePath = path.join(directory, ...entry.path.split('/')); const present = await lstat(filePath).catch(() => undefined); if (!present) throw new CliError('BUNDLE_FILE_MISSING', 'Bundle inventory file is missing.', EXIT.contract); await regularFile(filePath, 'BUNDLE_ENTRY_UNSAFE'); const bytes = await readFile(filePath).catch(() => { throw new CliError('BUNDLE_FILE_MISSING', 'Bundle inventory file is missing.', EXIT.contract) }); if (bytes.byteLength !== entry.byteLength || bytesHash(bytes) !== entry.sha256) throw new CliError('BUNDLE_FILE_HASH_MISMATCH', 'Bundle file hash or length does not match its manifest.', EXIT.contract) }
  const semantic = sha256(semanticManifestBase(manifest.kind, manifest.case, manifest.pins, files as BundleFileEntry[])); if (semantic !== manifest.semanticHash) throw new CliError('BUNDLE_SEMANTIC_HASH_MISMATCH', 'Bundle semantic hash does not match its manifest.', EXIT.contract)
  const payload: Record<string, unknown> = {}; for (const entry of files) { if (!entry.path.endsWith('.json')) continue; payload[entry.path.slice(0, -5)] = await readJson(path.join(directory, ...entry.path.split('/')), 'BUNDLE_ENTRY_UNSAFE') } assertNoUnsafe(payload, 'bundle'); return { manifest, payload }
}
function outputSummary(manifest: BundleManifest, extra: JsonObject = {}): JsonObject { return { status: 'ok', kind: manifest.kind, caseId: manifest.case.id, revision: manifest.case.revision, semanticHash: manifest.semanticHash, ...extra } }

async function compileCommand(args: Record<string, string>): Promise<JsonObject> {
  const casePath = required(args, 'case'); const scenarioPath = required(args, 'scenario'); const profilePath = required(args, 'profile'); const outputPath = required(args, 'out'); await assertOutputSeparated(outputPath, [casePath, scenarioPath, profilePath]); const result = await compileInputs(casePath, scenarioPath, profilePath); const guardInput = fixtureM5GuardInput(fixtureM5PromptIR(result.profile), result.prompt); const guard = guardPromptCandidate(guardInput)
  const acceptance = clone(result.acceptance) as JsonObject; acceptance.compile = { ...(acceptance.compile as JsonObject), promptGuard: guard.status }; const assertionResults = assertFixtureAssertions(result.fixture, acceptance, 'compile'); acceptance.assertions = assertionResults; acceptance.assertionHash = sha256(assertionResults)
  const payload = { 'case': result.caseSpec, 'scenario': result.resolution, 'profile': { id: result.profile.id, version: result.profile.version, digest: result.profile.profileHash }, 'fixture': result.fixture, 'constraint-ir': result.input.constraintIR, 'reference-plan': result.input.referencePlan, 'pipeline-plan': result.input.pipelinePlan, 'prompt-ir': result.input.promptArtifact, 'prompt-guard': guard, 'execution-input': result.input, acceptance, 'replay-contract': { planReplay: 'available', artifactReplay: 'deferred-until-run', liveRerun: 'requires-new-authorization' } }
  const written = await writeBundle(outputPath, 'compiled', { id: result.caseSpec.id, revision: result.caseSpec.revision }, bundlePins(result.profile, result.loaded), payload)
  return outputSummary(written.manifest, { promptGuard: guard.status, scenario: result.loaded.descriptor.manifest.packId })
}
async function semanticForRun(run: NonNullable<OfflineExecutionResult['run']>, artifacts: ArtifactHandle[], profile: typeof MOCK_IMAGE_PROFILE): Promise<{ report: import('@voce-engine/contracts').SemanticReviewReport; receipt: import('@voce-engine/contracts').StepReceipt; remote: import('@voce-engine/contracts').RemoteCallRun }> {
  const reviewer = new FixtureSemanticReviewer(); const inputHash = sha256({ runId: run.id, artifacts: artifacts.map((item) => item.contentHash).sort() }); const model: VersionPin = reviewer.version; const adapter: VersionPin = { id: 'voce.fixture-semantic-reviewer-adapter', version: '1.0.0', digest: sha256({ id: 'voce.fixture-semantic-reviewer-adapter', version: '1.0.0' }) }; const requestBase: Omit<SemanticReviewRequest, 'requestHash'> = { schemaVersion: 'voce.semantic-review-request/v1alpha1', id: `semantic-${run.id}`, caseId: run.caseId, caseRevision: run.caseRevision, contextHash: run.contextHash, inputHash, outputArtifacts: artifacts, criteria: [{ id: 'fixture.semantic', kind: 'semantic_fidelity', importance: 'required', prompt: 'Offline fixture semantic proposal.' }], model, adapter, profile: { id: profile.id, version: profile.version, digest: profile.profileHash! }, authorizationId: `semantic-auth-${run.id}`, destination: 'local', allowedEvidenceRegionIds: [], dataCategories: ['image'], budget: { schemaVersion: 'voce.budget/v1alpha1', id: `semantic-budget-${run.id}`, maximumCalls: 1, maximumRetries: 0, timeoutMs: 60_000 } }
  const request = { ...requestBase, requestHash: computeSemanticReviewRequestHash(requestBase as SemanticReviewRequest) } as SemanticReviewRequest; const authorization = fixtureM6Authorization({ id: request.authorizationId, caseId: request.caseId, caseRevision: request.caseRevision, contextHash: request.contextHash, stepId: request.id, purpose: 'semantic_review', inputHash, artifactHashes: artifacts.map((item) => item.contentHash), adapter, profileDigest: request.profile.digest, destination: 'local', dataCategories: ['image'], budget: request.budget, modelId: model.id, modelVersion: model.version }); const execution = await executeSemanticReview(reviewer, request, authorization); return { report: execution.report, receipt: execution.receipt, remote: execution.remoteCallRun }
}
async function runCommand(args: Record<string, string>): Promise<JsonObject> {
  if (args.provider !== 'mock') throw new CliError('PROVIDER_DISABLED', 'The default provider is disabled; pass --provider mock for offline execution.', EXIT.offline)
  const bundlePath = required(args, 'bundle'); const outputPath = required(args, 'out'); await assertOutputSeparated(outputPath, [bundlePath]); const bundle = await validateBundlePath(bundlePath); if (bundle.manifest.kind !== 'compiled') throw new CliError('BUNDLE_KIND_INVALID', 'case run requires a compiled bundle.', EXIT.contract)
  const input = bundle.payload['execution-input'] as unknown as OfflineExecutionInput; if (!input || input.schemaVersion !== 'voce.offline-execution-input/v1alpha1') throw new CliError('EXECUTION_INPUT_INVALID', 'Compiled bundle has no valid offline execution input.', EXIT.contract)
  const result = executeOffline(input); const run = result.run ?? result.executionRun; if (!run) throw new CliError(result.code || 'EXECUTION_BLOCKED', 'Offline execution did not produce a run.', EXIT.offline)
  const artifacts = run.outputArtifacts ?? []; const structuralArtifact = fixtureM6Artifact(`structural-${run.id}`, FIXTURE_M6_OPAQUE_PNG, 'image/png', 'generated-image'); const outputContract: OutputContract = { artifactKind: 'image', dataType: 'image', mediaTypes: ['image/png'], cardinality: { min: 1, max: 1 }, background: 'opaque', allowAlpha: false }; const structural = validateStructuralImage({ schemaVersion: 'voce.structural-validation-input/v1alpha1', id: `structural-${run.id}`, artifacts: [{ artifact: structuralArtifact, bytes: FIXTURE_M6_OPAQUE_PNG }], outputContract, expectedCardinality: { min: 1, max: 1 } });
  const fixture = bundle.payload.fixture as SourceFixtureCase | undefined; let semanticProposal: import('@voce-engine/contracts').SemanticReviewReport | undefined; const semanticReceipts: import('@voce-engine/contracts').StepReceipt[] = []; const reconciliation: import('@voce-engine/contracts').RemoteCallRun[] = []; if (fixture?.semanticReview) { const semantic = await semanticForRun(run, [structuralArtifact, ...artifacts], profileFor(String((bundle.payload.profile as Record<string, unknown>)?.id ?? MOCK_IMAGE_PROFILE.id))); semanticProposal = semantic.report; semanticReceipts.push(semantic.receipt); reconciliation.push(semantic.remote) }
  const human = fixture?.humanPending ? createHumanAcceptanceDecision({ schemaVersion: 'voce.human-acceptance-decision/v1alpha1', id: `human-${run.id}`, runId: run.id, status: 'pending', annotations: [], artifactIds: [structuralArtifact.id, ...artifacts.map((item) => item.id)] }) : undefined
  const evaluation = compileEvaluationReport({ run: { id: run.id, technicalOutcome: run.technicalOutcome, state: run.state, contextHash: run.contextHash, pipelinePlanHash: run.pipelinePlanHash, promptArtifactHash: run.promptArtifactHash }, structural, semanticProposal, humanAcceptance: human, cleanup: result.cleanupReceipts, replay: { mode: 'artifact', status: 'available', code: 'REPLAY_AVAILABLE', artifactIds: artifacts.map((item) => item.id) }, artifacts: [structuralArtifact, ...artifacts], sourceHashes: { compiledBundle: bundle.manifest.semanticHash, executionRun: computeExecutionRunHash(run) } })
  const traceModel = traceModelFromExecution({ run, receipts: [...result.receipts, ...semanticReceipts], cleanup: result.cleanupReceipts, reconciliation: [...result.remoteCallRuns, ...reconciliation], artifacts: [structuralArtifact, ...artifacts], structural, semanticProposal, humanAcceptance: human, budgets: input.pipelinePlan.steps.map((step) => step.budget), destinations: input.pipelinePlan.dataTransfers.map((item) => item.destination), constraintHash: input.constraintIR.deterministicSignature, referencePlanHash: input.referencePlan.planHash, promptHash: input.executionAuthorization.promptArtifactHash, warnings: result.reasons })
  const acceptance = isObject(bundle.payload.acceptance) ? clone(bundle.payload.acceptance) as JsonObject : {}
  const runEvidence: JsonObject = { executionStatus: result.status, executionCode: result.code, receiptCount: result.receipts.length + semanticReceipts.length, receiptAdapters: [...result.receipts, ...semanticReceipts].map((item) => item.adapterId).sort(compare), artifactMediaTypes: artifacts.map((item) => item.mediaType).sort(compare), artifactRoles: artifacts.map((item) => item.role).sort(compare), structuralStatus: structural.status, semanticStatus: semanticProposal?.status ?? 'absent', humanStatus: human?.status ?? 'absent', evaluationStatus: evaluation.status, traceModelPresent: true, traceModelHash: traceModel.modelHash }
  acceptance.run = runEvidence; const runAssertions = fixture ? assertFixtureAssertions(fixture, acceptance, 'run') : []; acceptance.assertions = [...(Array.isArray(acceptance.assertions) ? acceptance.assertions : []), ...runAssertions].sort((left, right) => compare(String((left as Record<string, unknown>).id), String((right as Record<string, unknown>).id))); acceptance.assertionHash = sha256(acceptance.assertions as JsonValue)
  const payload = { 'compiled-ref': { semanticHash: bundle.manifest.semanticHash }, 'run': run, 'events': result.events, 'receipts': [...result.receipts, ...semanticReceipts], 'remote-call-runs': [...result.remoteCallRuns, ...reconciliation], 'cleanup': result.cleanupReceipts, 'compensation': result.compensationReceipts, 'evaluation': evaluation, 'trace-model': traceModel, acceptance, 'comparison-snapshot': { constraintIR: input.constraintIR, referencePlan: input.referencePlan, promptIR: input.promptArtifact, pipelinePlan: input.pipelinePlan, receipts: [...result.receipts, ...semanticReceipts], evaluation } }
  const written = await writeBundle(outputPath, 'run', bundle.manifest.case, bundle.manifest.pins, payload); return outputSummary(written.manifest, { execution: result.status, executionCode: result.code, evaluation: evaluation.status, traceModel: traceModel.modelHash })
}
async function traceCommand(args: Record<string, string>): Promise<JsonObject> { const bundlePath = required(args, 'bundle'); const outputPath = required(args, 'out'); await assertOutputSeparated(outputPath, [bundlePath]); const bundle = await validateBundlePath(bundlePath); const model = bundle.payload['trace-model'] as unknown as StaticTraceReportModel; if (!model || model.schemaVersion !== 'voce.static-trace-report-model/v1alpha1') throw new CliError('TRACE_MODEL_INVALID', 'Bundle has no valid static trace model.', EXIT.contract); const report = renderStaticTraceReport(model); await atomicWrite(path.resolve(outputPath), report.content); return { status: 'ok', mediaType: report.mediaType, contentHash: report.contentHash, modelHash: report.modelHash } }
function comparisonSnapshot(payload: Record<string, unknown>): ComparisonSnapshot { return { constraintIR: payload['constraint-ir'] as JsonValue, referencePlan: payload['reference-plan'] as JsonValue, promptIR: payload['prompt-ir'] as JsonValue, pipelinePlan: payload['pipeline-plan'] as JsonValue, receipts: payload.receipts as JsonValue, evaluation: payload.evaluation as JsonValue } }
async function compareCommand(args: Record<string, string>): Promise<JsonObject> { const beforePath = required(args, 'before'); const afterPath = required(args, 'after'); const out = args.out ? path.resolve(args.out) : undefined; if (out) await assertOutputSeparated(out, [beforePath, afterPath]); const before = await validateBundlePath(beforePath); const after = await validateBundlePath(afterPath); const beforeSnapshot = before.payload['comparison-snapshot'] as ComparisonSnapshot ?? comparisonSnapshot(before.payload); const afterSnapshot = after.payload['comparison-snapshot'] as ComparisonSnapshot ?? comparisonSnapshot(after.payload); const { compareSnapshots } = await import('@voce-engine/core'); const report = compareSnapshots({ caseId: after.manifest.case.id, beforeRevision: before.manifest.case.revision, afterRevision: after.manifest.case.revision, before: beforeSnapshot, after: afterSnapshot }); if (out) await atomicWrite(out, textBytes(report)); return out ? { status: 'ok', reportHash: report.reportHash, output: safeDisplayPath(out) } : report as unknown as JsonObject }
async function packInspectCommand(source: string): Promise<JsonObject> { const loaded = await loadPack(source); return { status: 'ok', packId: loaded.descriptor.manifest.packId, version: loaded.descriptor.manifest.version, kind: loaded.descriptor.manifest.kind, declarations: { mayHandlePersonImages: loaded.descriptor.manifest.declarations.mayHandlePersonImages, rightsDisclosureRequired: loaded.descriptor.manifest.declarations.rightsDisclosureRequired }, manifestHash: loaded.descriptor.manifestHash, packageDigest: loaded.descriptor.packageDigest, distributionDigest: loaded.descriptor.distributionDigest, fixtureSuites: loaded.definition.contributions.fixtureSuites.map((suite) => ({ id: suite.id, caseIds: suite.cases.map((item) => isObject(item) && typeof item.id === 'string' ? item.id : 'invalid') })) } }
async function packValidateCommand(source: string): Promise<JsonObject> { const loaded = await loadPack(source); return { status: 'ok', valid: true, packId: loaded.descriptor.manifest.packId, version: loaded.descriptor.manifest.version, manifestHash: loaded.descriptor.manifestHash, packageDigest: loaded.descriptor.packageDigest, distributionDigest: loaded.descriptor.distributionDigest, lifecycleScriptsExecuted: false } }
async function packTestCommand(source: string): Promise<JsonObject> {
  const loaded = await loadPack(source); const registry = createScenarioPackRegistry(); registry.register(loaded.source); const resolution = registry.resolve({ root: { packId: loaded.descriptor.manifest.packId, versionRange: loaded.descriptor.manifest.version }, extensions: [] }); if (resolution.status !== 'resolved') throw new CliError('PACK_RESOLUTION_BLOCKED', 'ScenarioPack resolution is blocked.', EXIT.contract)
  const results: JsonObject[] = []
  for (const fixture of loaded.fixtures) {
    const profile = profileFor(fixture.profileId ?? MOCK_IMAGE_PROFILE.id); const caseSpec = defaultCase({ id: fixture.id }, loaded.descriptor.manifest.packId); const input = fixtureM5ExecutionInput(profile); const prompt = fixtureM5Candidate(fixtureM5PromptIR(profile)); const guard = guardPromptCandidate(fixtureM5GuardInput(fixtureM5PromptIR(profile), prompt)); const coreProbes = Object.fromEntries((fixture.coreProbes ?? []).sort((left, right) => compare(left.id, right.id)).map((probe) => [probe.id, coreProbeEvidence(probe, resolution, caseSpec)])); const acceptance: JsonObject = { resolution: { status: resolution.status, selectedCount: resolution.report.selected.length, effectiveScenarioHash: resolution.effectiveScenario.effectiveScenarioHash }, reference: referenceEvidence(fixture, resolution, caseSpec), coreProbes, compile: { constraintHash: input.constraintIR.deterministicSignature, referencePlanHash: input.referencePlan.planHash, pipelinePlanHash: input.pipelinePlan.planHash, promptGuard: guard.status } }
    const result = executeOffline(input); const run = result.run ?? result.executionRun; if (!run) throw new CliError(result.code || 'EXECUTION_BLOCKED', 'Offline fixture execution did not produce a run.', EXIT.offline)
    const artifacts = run.outputArtifacts ?? []; const structuralArtifact = fixtureM6Artifact(`structural-${run.id}`, FIXTURE_M6_OPAQUE_PNG, 'image/png', 'generated-image'); const outputContract: OutputContract = { artifactKind: 'image', dataType: 'image', mediaTypes: ['image/png'], cardinality: { min: 1, max: 1 }, background: 'opaque', allowAlpha: false }; const structural = validateStructuralImage({ schemaVersion: 'voce.structural-validation-input/v1alpha1', id: `structural-${run.id}`, artifacts: [{ artifact: structuralArtifact, bytes: FIXTURE_M6_OPAQUE_PNG }], outputContract, expectedCardinality: { min: 1, max: 1 } }); let semanticProposal: import('@voce-engine/contracts').SemanticReviewReport | undefined; const semanticReceipts: import('@voce-engine/contracts').StepReceipt[] = []; const reconciliation: import('@voce-engine/contracts').RemoteCallRun[] = []; if (fixture.semanticReview) { const semantic = await semanticForRun(run, [structuralArtifact, ...artifacts], profile); semanticProposal = semantic.report; semanticReceipts.push(semantic.receipt); reconciliation.push(semantic.remote) }
    const human = fixture.humanPending ? createHumanAcceptanceDecision({ schemaVersion: 'voce.human-acceptance-decision/v1alpha1', id: `human-${run.id}`, runId: run.id, status: 'pending', annotations: [], artifactIds: [structuralArtifact.id, ...artifacts.map((item) => item.id)] }) : undefined; const compiledHash = sha256({ packId: loaded.descriptor.manifest.packId, fixtureId: fixture.id }); const evaluation = compileEvaluationReport({ run: { id: run.id, technicalOutcome: run.technicalOutcome, state: run.state, contextHash: run.contextHash, pipelinePlanHash: run.pipelinePlanHash, promptArtifactHash: run.promptArtifactHash }, structural, semanticProposal, humanAcceptance: human, cleanup: result.cleanupReceipts, replay: { mode: 'artifact', status: 'available', code: 'REPLAY_AVAILABLE', artifactIds: artifacts.map((item) => item.id) }, artifacts: [structuralArtifact, ...artifacts], sourceHashes: { compiledBundle: compiledHash, executionRun: computeExecutionRunHash(run) } }); const traceModel = traceModelFromExecution({ run, receipts: [...result.receipts, ...semanticReceipts], cleanup: result.cleanupReceipts, reconciliation: [...result.remoteCallRuns, ...reconciliation], artifacts: [structuralArtifact, ...artifacts], structural, semanticProposal, humanAcceptance: human, budgets: input.pipelinePlan.steps.map((step) => step.budget), destinations: input.pipelinePlan.dataTransfers.map((item) => item.destination), constraintHash: input.constraintIR.deterministicSignature, referencePlanHash: input.referencePlan.planHash, promptHash: input.executionAuthorization.promptArtifactHash, warnings: result.reasons })
    acceptance.run = { executionStatus: result.status, executionCode: result.code, receiptCount: result.receipts.length + semanticReceipts.length, receiptAdapters: [...result.receipts, ...semanticReceipts].map((item) => item.adapterId).sort(compare), artifactMediaTypes: artifacts.map((item) => item.mediaType).sort(compare), artifactRoles: artifacts.map((item) => item.role).sort(compare), structuralStatus: structural.status, semanticStatus: semanticProposal?.status ?? 'absent', humanStatus: human?.status ?? 'absent', evaluationStatus: evaluation.status, traceModelPresent: true, traceModelHash: traceModel.modelHash }
    const assertions = assertFixtureAssertions(fixture, acceptance, 'all'); const expected = fixture.expectedStatus ?? 'completed'; const accepted = result.status === expected || (expected === 'needs_review' && result.status === 'completed'); results.push({ id: fixture.id, status: accepted ? 'passed' : 'failed', expectedStatus: expected, observedStatus: result.status, executionCode: result.code, reasons: result.reasons, assertionIds: assertions.map((item) => item.id), assertions, assertionHash: sha256(assertions), observedHashes: { constraint: input.constraintIR.deterministicSignature, trace: traceModel.modelHash, evaluation: evaluation.reportHash } })
  }
  const failed = results.some((item) => item.status === 'failed'); return { status: failed ? 'failed' : 'passed', packId: loaded.descriptor.manifest.packId, resolutionHash: resolution.report.reportHash, lockHash: resolution.lock.lockHash, effectiveScenarioHash: resolution.effectiveScenario.effectiveScenarioHash, fixtureCount: results.length, results }
}
async function doctorCommand(): Promise<JsonObject> { const major = Number(process.versions.node.split('.')[0]); return { status: major >= 20 ? 'ok' : 'blocked', node: { version: process.versions.node, supported: major >= 20 }, contracts: { schemaVersion: BUNDLE_MANIFEST_SCHEMA_VERSION, packageVersion: CONTRACTS_VERSION }, paths: { explicitOnly: true }, providers: { default: 'disabled', mock: 'offline', networkProbe: false }, authProbe: { inspected: false } } }
function required(args: Record<string, string>, key: string): string { if (!args[key]) throw new CliError('ARGUMENT_MISSING', `Missing --${key}.`, EXIT.usage); return args[key] }

function help(): string { return `voce ${CLI_VERSION}\n\nOffline-first explicit-path CLI.\n\nCommands:\n  voce pack inspect --source <path> [--json]\n  voce pack validate --source <path> [--json]\n  voce pack test --source <path> [--json]\n  voce case compile --case <file> --scenario <path> --profile <file> --out <dir> [--json]\n  voce case run --bundle <dir> --provider mock --out <dir> [--json]\n  voce trace render --bundle <dir> --out <html> [--json]\n  voce compare --before <dir> --after <dir> [--out <file>] [--json]\n  voce doctor [--json]\n\nExit codes: 0 success, 2 usage, 3 input, 4 contract/hash, 5 offline/provider, 6 output, 7 internal.` }
function parse(argv: string[]): { command: string[]; args: Record<string, string>; machine: boolean } { const command: string[] = []; const args: Record<string, string> = {}; let machine = false; for (let i = 0; i < argv.length; i += 1) { const token = argv[i]; if (token === '--json') { machine = true; continue } if (token === '--help' || token === '-h') { command.push('--help'); continue } if (token === '--version' || token === '-v') { command.push('--version'); continue } if (token.startsWith('--')) { const key = token.slice(2); const value = argv[i + 1]; if (!value || value.startsWith('--')) throw new CliError('ARGUMENT_MISSING', `Missing --${key}.`, EXIT.usage); args[key] = value; i += 1 } else command.push(token) } return { command, args, machine } }
export async function runCli(argv: string[] = process.argv.slice(2)): Promise<number> { let machine = argv.includes('--json'); try { const parsed = parse(argv); machine = parsed.machine; if (parsed.command.includes('--help') || parsed.command.length === 0) { process.stdout.write(machine ? json({ status: 'ok', version: CLI_VERSION, help: help() }) + '\n' : help() + '\n'); return EXIT.ok } if (parsed.command.includes('--version')) { process.stdout.write(machine ? json({ status: 'ok', version: CLI_VERSION }) + '\n' : CLI_VERSION + '\n'); return EXIT.ok } let result: JsonObject
    const [first, second, third] = parsed.command
    if (first === 'doctor') result = await doctorCommand()
    else if (first === 'pack' && second === 'inspect') result = await packInspectCommand(required(parsed.args, 'source'))
    else if (first === 'pack' && second === 'validate') result = await packValidateCommand(required(parsed.args, 'source'))
    else if (first === 'pack' && second === 'test') result = await packTestCommand(required(parsed.args, 'source'))
    else if (first === 'case' && second === 'compile') result = await compileCommand(parsed.args)
    else if (first === 'case' && second === 'run') result = await runCommand(parsed.args)
    else if (first === 'trace' && second === 'render') result = await traceCommand(parsed.args)
    else if (first === 'compare') result = await compareCommand(parsed.args)
    else throw new CliError('UNKNOWN_COMMAND', 'Unknown command.', EXIT.usage)
    assertNoUnsafe(result, 'stdout'); process.stdout.write(machine ? json(result) + '\n' : `${String(result.status)}${result.semanticHash ? ` ${result.semanticHash}` : ''}\n`); return result.status === 'failed' ? EXIT.offline : EXIT.ok
  } catch (error) { const cliError = error instanceof CliError ? error : new CliError('INTERNAL_ERROR', 'The command failed without a public diagnostic.', EXIT.internal); process.stderr.write(`${cliError.code}: ${cliError.message}\n`); if (machine) process.stdout.write(json({ status: 'error', code: cliError.code }) + '\n'); return cliError.exitCode }
}
