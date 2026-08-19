import type {
  DeclarativeRulePackContribution,
  EffectiveScenario,
  Importance,
  JsonObject,
  JsonValue,
  LocalScenarioPackSource,
  OntologyPathDefinition,
  PromptSectionContribution,
  ScenarioInputExpectation,
  ScenarioPack,
  ScenarioPackContribution,
  ScenarioPackManifest,
  ScenarioPackRegistry,
} from '@voce-engine/contracts'
import {
  VISUAL_COMPOSITION_PATHS,
  createScenarioPackRegistry,
  sha256,
} from '@voce-engine/core'

export type PlaygroundScenarioId = 'virtual-tryon' | 'cosplay'
export type PlaygroundRoleRelation = 'preserve' | 'reproduce' | 'inspire' | 'exclude'

export interface ScenarioRoleBinding {
  assetRole: string
  targetPath: string
  relation: PlaygroundRoleRelation
  priority: Importance
}

export interface ScenarioRolePolicy {
  schemaVersion: 'voce.playground-role-policy/v1alpha1'
  id: string
  scenarioId: PlaygroundScenarioId
  role: string
  minCount: number
  maxCount: number
  bindings: readonly ScenarioRoleBinding[]
  targets: readonly { targetPath: string; operation: 'preserve' | 'replace' | 'adjust'; importance: Importance }[]
  authorizedTargetPaths: readonly string[]
  prohibitedTargetPaths: readonly string[]
  displayOnlyNonContributions: readonly string[]
  policyDigest: string
}

export interface ScenarioDistribution {
  scenarioId: PlaygroundScenarioId
  packId: string
  version: string
  effectiveScenario: EffectiveScenario
  distributionHash: string
  roles: readonly ScenarioRolePolicy[]
}

function deepFreeze<T>(value: T): T {
  if (value === null || typeof value !== 'object' || Object.isFrozen(value)) return value
  Object.freeze(value)
  for (const nested of Object.values(value as Record<string, unknown>)) deepFreeze(nested)
  return value
}

function compareCodeUnits(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0
}

function sortedStrings(values: readonly string[]): string[] {
  return [...new Set(values)].sort(compareCodeUnits)
}

const FIXED_TIME = '2026-01-01T00:00:00.000Z'
const compositionPaths: OntologyPathDefinition[] = VISUAL_COMPOSITION_PATHS.map((path) => ({ ...path }))

const commonPromptSections: PromptSectionContribution['sections'] = [
  { id: 'subject-and-reference-fidelity', group: 'subject-and-reference-fidelity', order: 1, pathPrefixes: ['person', 'wardrobe', 'character', 'pose'], templateKey: 'composition.subject-and-reference-fidelity' },
  { id: 'composition-shot-and-crop', group: 'composition-shot-and-crop', order: 2, pathPrefixes: ['camera.framing'], templateKey: 'composition.composition-shot-and-crop' },
  { id: 'composition-view-and-roll', group: 'composition-view-and-roll', order: 3, pathPrefixes: ['camera.view', 'camera.roll'], templateKey: 'composition.composition-view-and-roll' },
  { id: 'composition-layout-and-space', group: 'composition-layout-and-space', order: 4, pathPrefixes: ['camera.composition'], templateKey: 'composition.composition-layout-and-space' },
  { id: 'composition-lens-and-environment', group: 'composition-lens-and-environment', order: 5, pathPrefixes: ['camera.lens', 'lighting', 'environment'], templateKey: 'composition.composition-lens-and-environment' },
  { id: 'forbidden-and-output', group: 'forbidden-and-output', order: 6, pathPrefixes: ['output'], templateKey: 'composition.forbidden-and-output' },
]

const scenarioDefinitions: Record<PlaygroundScenarioId, {
  roles: readonly { role: string; minCount: number; maxCount: number; bindings: readonly ScenarioRoleBinding[] }[]
  paths: readonly OntologyPathDefinition[]
}> = {
  'virtual-tryon': {
    roles: [
      { role: 'person-identity', minCount: 1, maxCount: 1, bindings: [{ assetRole: 'person-identity', targetPath: 'person.identity', relation: 'preserve', priority: 'hard' }, { assetRole: 'person-identity', targetPath: 'wardrobe.garment', relation: 'exclude', priority: 'hard' }, { assetRole: 'person-identity', targetPath: 'wardrobe.wearingEffect', relation: 'exclude', priority: 'hard' }, { assetRole: 'person-identity', targetPath: 'wardrobe.footwear', relation: 'exclude', priority: 'hard' }] },
      { role: 'garment-detail', minCount: 1, maxCount: 1, bindings: [{ assetRole: 'garment-detail', targetPath: 'wardrobe.garment', relation: 'reproduce', priority: 'required' }, { assetRole: 'garment-detail', targetPath: 'person.identity', relation: 'exclude', priority: 'hard' }, { assetRole: 'garment-detail', targetPath: 'wardrobe.wearingEffect', relation: 'exclude', priority: 'hard' }, { assetRole: 'garment-detail', targetPath: 'wardrobe.footwear', relation: 'exclude', priority: 'hard' }, { assetRole: 'garment-detail', targetPath: 'pose', relation: 'exclude', priority: 'hard' }] },
      { role: 'wearing-effect', minCount: 1, maxCount: 1, bindings: [{ assetRole: 'wearing-effect', targetPath: 'wardrobe.wearingEffect', relation: 'inspire', priority: 'required' }, { assetRole: 'wearing-effect', targetPath: 'person.identity', relation: 'exclude', priority: 'hard' }, { assetRole: 'wearing-effect', targetPath: 'wardrobe.garment', relation: 'exclude', priority: 'hard' }, { assetRole: 'wearing-effect', targetPath: 'wardrobe.footwear', relation: 'exclude', priority: 'hard' }, { assetRole: 'wearing-effect', targetPath: 'pose', relation: 'exclude', priority: 'hard' }] },
      { role: 'footwear-detail', minCount: 1, maxCount: 1, bindings: [{ assetRole: 'footwear-detail', targetPath: 'wardrobe.footwear', relation: 'reproduce', priority: 'required' }, { assetRole: 'footwear-detail', targetPath: 'person.identity', relation: 'exclude', priority: 'hard' }, { assetRole: 'footwear-detail', targetPath: 'wardrobe.garment', relation: 'exclude', priority: 'hard' }, { assetRole: 'footwear-detail', targetPath: 'wardrobe.wearingEffect', relation: 'exclude', priority: 'hard' }, { assetRole: 'footwear-detail', targetPath: 'pose', relation: 'exclude', priority: 'hard' }] },
      { role: 'pose', minCount: 0, maxCount: 1, bindings: [{ assetRole: 'pose', targetPath: 'pose', relation: 'inspire', priority: 'preferred' }, { assetRole: 'pose', targetPath: 'person.identity', relation: 'exclude', priority: 'hard' }, { assetRole: 'pose', targetPath: 'wardrobe.garment', relation: 'exclude', priority: 'hard' }, { assetRole: 'pose', targetPath: 'wardrobe.wearingEffect', relation: 'exclude', priority: 'hard' }, { assetRole: 'pose', targetPath: 'wardrobe.footwear', relation: 'exclude', priority: 'hard' }, { assetRole: 'pose', targetPath: 'environment.background', relation: 'exclude', priority: 'hard' }, { assetRole: 'pose', targetPath: 'style', relation: 'exclude', priority: 'hard' }] },
    ],
    paths: [
      { path: 'person.identity', valueKind: 'string', cardinality: 'one', defaultImportance: 'hard' },
      { path: 'wardrobe.garment', valueKind: 'string', cardinality: 'one', defaultImportance: 'required' },
      { path: 'wardrobe.wearingEffect', valueKind: 'string', cardinality: 'one', defaultImportance: 'required' },
      { path: 'wardrobe.footwear', valueKind: 'string', cardinality: 'one', defaultImportance: 'required' },
      { path: 'pose', valueKind: 'string', cardinality: 'one', defaultImportance: 'preferred' },
    ],
  },
  cosplay: {
    roles: [
      { role: 'person-identity', minCount: 1, maxCount: 1, bindings: [{ assetRole: 'person-identity', targetPath: 'person.identity', relation: 'preserve', priority: 'hard' }, { assetRole: 'person-identity', targetPath: 'character.costume', relation: 'exclude', priority: 'hard' }, { assetRole: 'person-identity', targetPath: 'character.signatureProps.primary', relation: 'exclude', priority: 'hard' }] },
      { role: 'character-design', minCount: 1, maxCount: 1, bindings: [{ assetRole: 'character-design', targetPath: 'person.identity', relation: 'exclude', priority: 'hard' }, { assetRole: 'character-design', targetPath: 'character.hair', relation: 'reproduce', priority: 'required' }, { assetRole: 'character-design', targetPath: 'character.makeup', relation: 'reproduce', priority: 'required' }, { assetRole: 'character-design', targetPath: 'character.costume', relation: 'reproduce', priority: 'required' }, { assetRole: 'character-design', targetPath: 'character.accessories', relation: 'reproduce', priority: 'required' }, { assetRole: 'character-design', targetPath: 'character.signatureProps.primary', relation: 'reproduce', priority: 'required' }] },
      { role: 'signature-prop-detail', minCount: 0, maxCount: 4, bindings: [{ assetRole: 'signature-prop-detail', targetPath: 'person.identity', relation: 'exclude', priority: 'hard' }, { assetRole: 'signature-prop-detail', targetPath: 'character.signatureProps.primary', relation: 'reproduce', priority: 'required' }, { assetRole: 'signature-prop-detail', targetPath: 'character.costume', relation: 'exclude', priority: 'hard' }, { assetRole: 'signature-prop-detail', targetPath: 'pose', relation: 'exclude', priority: 'hard' }, { assetRole: 'signature-prop-detail', targetPath: 'environment.background', relation: 'exclude', priority: 'hard' }, { assetRole: 'signature-prop-detail', targetPath: 'style', relation: 'exclude', priority: 'hard' }] },
      { role: 'pose', minCount: 0, maxCount: 4, bindings: [{ assetRole: 'pose', targetPath: 'person.identity', relation: 'exclude', priority: 'hard' }, { assetRole: 'pose', targetPath: 'pose', relation: 'inspire', priority: 'preferred' }, { assetRole: 'pose', targetPath: 'character.costume', relation: 'exclude', priority: 'hard' }, { assetRole: 'pose', targetPath: 'character.signatureProps.primary', relation: 'exclude', priority: 'hard' }, { assetRole: 'pose', targetPath: 'environment.background', relation: 'exclude', priority: 'hard' }, { assetRole: 'pose', targetPath: 'style', relation: 'exclude', priority: 'hard' }] },
      { role: 'critical-detail', minCount: 0, maxCount: 4, bindings: [{ assetRole: 'critical-detail', targetPath: 'person.identity', relation: 'exclude', priority: 'hard' }, { assetRole: 'critical-detail', targetPath: 'character.hair', relation: 'reproduce', priority: 'required' }, { assetRole: 'critical-detail', targetPath: 'character.makeup', relation: 'reproduce', priority: 'required' }, { assetRole: 'critical-detail', targetPath: 'character.accessories', relation: 'reproduce', priority: 'required' }, { assetRole: 'critical-detail', targetPath: 'character.signatureProps.primary.signatureDetails', relation: 'reproduce', priority: 'required' }, { assetRole: 'critical-detail', targetPath: 'character.costume', relation: 'exclude', priority: 'hard' }, { assetRole: 'critical-detail', targetPath: 'pose', relation: 'exclude', priority: 'hard' }, { assetRole: 'critical-detail', targetPath: 'environment.background', relation: 'exclude', priority: 'hard' }, { assetRole: 'critical-detail', targetPath: 'style', relation: 'exclude', priority: 'hard' }] },
    ],
    paths: [
      { path: 'person.identity', valueKind: 'string', cardinality: 'one', defaultImportance: 'hard' },
      { path: 'character.hair', valueKind: 'string', cardinality: 'one', defaultImportance: 'required' },
      { path: 'character.makeup', valueKind: 'string', cardinality: 'one', defaultImportance: 'required' },
      { path: 'character.costume', valueKind: 'string', cardinality: 'one', defaultImportance: 'required' },
      { path: 'character.accessories', valueKind: 'string', cardinality: 'one', defaultImportance: 'required' },
      { path: 'character.signatureProps.primary.type', valueKind: 'string', cardinality: 'one', defaultImportance: 'required' },
      { path: 'character.signatureProps.primary.silhouette', valueKind: 'string', cardinality: 'one', defaultImportance: 'required' },
      { path: 'character.signatureProps.primary.proportion', valueKind: 'string', cardinality: 'one', defaultImportance: 'required' },
      { path: 'character.signatureProps.primary.colorScheme', valueKind: 'string', cardinality: 'one', defaultImportance: 'required' },
      { path: 'character.signatureProps.primary.signatureDetails', valueKind: 'string', cardinality: 'one', defaultImportance: 'required' },
      { path: 'character.signatureProps.primary.handAssignment', valueKind: 'string', cardinality: 'one', defaultImportance: 'required' },
      { path: 'character.signatureProps.primary.visibility', valueKind: 'string', cardinality: 'one', defaultImportance: 'hard' },
      { path: 'pose', valueKind: 'string', cardinality: 'one', defaultImportance: 'preferred' },
    ],
  },
}

function contribution<T extends Record<string, unknown>>(id: string, schemaVersion: string, value: T): T & ScenarioPackContribution {
  const base = { id, schemaVersion, ...value } as T & ScenarioPackContribution
  return { ...base, contentDigest: sha256(JSON.parse(JSON.stringify(base)) as JsonValue) } as unknown as T & ScenarioPackContribution
}

function roleContribution(id: string, role: string, bindings: readonly ScenarioRoleBinding[]): ScenarioPackContribution {
  return contribution(id, 'voce.interpretation-scope/v1alpha1', { assetRole: role, bindings: bindings.map((binding) => ({ ...binding })) })
}

function rolePolicy(scenarioId: PlaygroundScenarioId, packId: string, definition: typeof scenarioDefinitions[PlaygroundScenarioId]['roles'][number], scope: ScenarioPackContribution): ScenarioRolePolicy {
  const bindings = (scope.bindings as unknown as ScenarioRoleBinding[]).map((binding) => ({ ...binding }))
  const targets = bindings.filter((binding) => binding.relation !== 'exclude').map((binding) => ({ targetPath: binding.targetPath, operation: binding.relation === 'preserve' ? 'preserve' as const : binding.relation === 'reproduce' ? 'replace' as const : 'adjust' as const, importance: binding.priority })).sort((left, right) => compareCodeUnits(left.targetPath, right.targetPath) || compareCodeUnits(left.operation, right.operation) || compareCodeUnits(left.importance, right.importance))
  const authorizedTargetPaths = sortedStrings(bindings.filter((binding) => binding.relation !== 'exclude').map((binding) => binding.targetPath))
  const prohibitedTargetPaths = sortedStrings(bindings.filter((binding) => binding.relation === 'exclude').map((binding) => binding.targetPath))
  const displayOnlyNonContributions = prohibitedTargetPaths.map((path) => `This reference does not control ${path.replaceAll('.', ' ')}.`)
  const base = { schemaVersion: 'voce.playground-role-policy/v1alpha1' as const, id: `${packId}:${definition.role}`, scenarioId, role: definition.role, minCount: definition.minCount, maxCount: definition.maxCount, bindings, targets, authorizedTargetPaths, prohibitedTargetPaths, displayOnlyNonContributions }
  return deepFreeze({ ...base, policyDigest: sha256(JSON.parse(JSON.stringify(base)) as JsonValue) })
}

function manifest(packId: string, version: string, contributionIndex: ScenarioPackManifest['contributions']): ScenarioPackManifest {
  const inputExpectations: ScenarioInputExpectation[] = []
  return {
    schemaVersion: 'voce.scenario-pack/v1alpha1',
    packId,
    version,
    kind: 'root',
    supportedInteractionModes: ['reference_guided'],
    inputExpectations,
    outputExpectations: [{ id: 'image', artifactKind: 'image', dataType: 'image', producedIn: ['reference_guided'], cardinality: { min: 1, max: 1 }, mediaTypes: ['image/png', 'image/jpeg'] }],
    license: 'Apache-2.0',
    provenance: { publisher: 'VOCE Playground', sourceRepository: 'https://github.com/windforce19820520-ai/visual-ontology-constraint-engine', sourceRevision: 'playground-pr0' },
    coreRange: '>=0.1.0-rc.4',
    contractRanges: { '@voce-engine/contracts': '0.1.0-rc.4' },
    ui: { defaultLocale: 'en', locales: { en: { displayName: packId, description: 'Immutable offline Playground semantic distribution.', messages: {} } }, disclosures: [], accessibility: { textAlternativesRequired: true, keyboardOperableReferenceUI: true, doesNotRelyOnColorAlone: true } },
    dependencies: [],
    conflicts: [],
    composition: { before: [], after: [] },
    contributions: contributionIndex,
    fixtures: [],
    migrations: [],
    capabilityRequirements: [],
    declarations: { containsExecutableScenarioCode: false, distributionLifecycleScripts: false, containsExecutableFiles: false, fixturesRequireNetwork: false, fixturesRequireRealProvider: false, collectsTelemetry: false, mayHandlePersonImages: true, rightsDisclosureRequired: true },
    permissions: { network: false, remoteCalls: false, secrets: false, filesystemWrite: false, mutateConfirmedFacts: false, authorizeCalls: false, overrideHostPolicy: false, selectProvider: false, changeBudgets: false },
    distributionInventory: [],
  }
}

function createPack(scenarioId: PlaygroundScenarioId): { pack: ScenarioPack; roles: readonly ScenarioRolePolicy[] } {
  const packId = `voce.playground.${scenarioId}`
  const version = '1.0.0'
  const definition = scenarioDefinitions[scenarioId]
  const ontology = contribution(`${scenarioId}.ontology`, 'voce.ontology-vocabulary/v1alpha1', { paths: [...definition.paths, ...compositionPaths] })
  const rules = contribution(`${scenarioId}.rules`, 'voce.declarative-rule-pack/v1alpha1', { namespace: `voce.playground.${scenarioId}`, rules: [] }) as DeclarativeRulePackContribution
  const scopes = definition.roles.map((item) => roleContribution(`${scenarioId}.scope.${item.role}`, item.role, item.bindings))
  const prompt = contribution(`${scenarioId}.prompt-sections`, 'voce.prompt-section-contribution/v1alpha1', { sections: commonPromptSections }) as PromptSectionContribution
  const contributions = { ontologyVocabulary: [ontology], rulePacks: [rules], interpretationScopes: scopes, promptSections: [prompt], reviewTemplates: [], defaults: [], overridePoints: [] }
  const index = Object.fromEntries(Object.entries(contributions).map(([category, values]) => [category, values.map((item) => ({ id: item.id, schemaVersion: item.schemaVersion, contentDigest: item.contentDigest }))])) as unknown as ScenarioPackManifest['contributions']
  const pack = { manifest: manifest(packId, version, index), contributions: { ...contributions, fixtureSuites: [] }, migrations: [] } as unknown as ScenarioPack
  const roles = scopes.map((scope, indexValue) => rolePolicy(scenarioId, packId, definition.roles[indexValue], scope))
  return { pack, roles }
}

function loadDistribution(scenarioId: PlaygroundScenarioId): ScenarioDistribution {
  const { pack, roles } = createPack(scenarioId)
  const registry: ScenarioPackRegistry = createScenarioPackRegistry()
  const source: LocalScenarioPackSource = { kind: 'memory', definition: pack, logicalFiles: [] }
  registry.register(source)
  const result = registry.resolve({ root: { packId: pack.manifest.packId, versionRange: pack.manifest.version }, extensions: [] })
  if (result.status !== 'resolved') throw new Error(`PLAYGROUND_SCENARIO_BLOCKED:${scenarioId}`)
  return deepFreeze({ scenarioId, packId: pack.manifest.packId, version: pack.manifest.version, effectiveScenario: result.effectiveScenario, distributionHash: result.effectiveScenario.effectiveScenarioHash, roles })
}

export const PLAYGROUND_SCENARIO_DISTRIBUTIONS: Readonly<Record<PlaygroundScenarioId, ScenarioDistribution>> = deepFreeze({
  'virtual-tryon': loadDistribution('virtual-tryon'),
  cosplay: loadDistribution('cosplay'),
})

export function scenarioDistribution(scenarioId: PlaygroundScenarioId): ScenarioDistribution {
  const distribution = PLAYGROUND_SCENARIO_DISTRIBUTIONS[scenarioId]
  if (!distribution) throw new Error(`PLAYGROUND_SCENARIO_UNKNOWN:${scenarioId}`)
  return distribution
}

export function rolePolicyFor(distribution: ScenarioDistribution, role: string): ScenarioRolePolicy | undefined {
  return distribution.roles.find((item) => item.role === role)
}
