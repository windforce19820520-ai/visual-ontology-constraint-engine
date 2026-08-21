import type {
  DeclarativeTypedMetadataPolicy,
  DeclarativeRulePackContribution,
  EffectiveScenario,
  Importance,
  JsonValue,
  LocalScenarioPackSource,
  OntologyPathDefinition,
  PromptSectionContribution,
  ResolvedContribution,
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
export type RolePresence = 'present' | 'absent'

export interface ScenarioRoleCondition {
  role: string
  presence: RolePresence
}

export type RoleGroupOperator = 'atLeastOne' | 'mutuallyExclusive'

export interface ScenarioRoleGroupPolicy {
  id: string
  operator: RoleGroupOperator
  roles: readonly string[]
  minCount?: number
  maxCount?: number
}

export interface ScenarioRoleBinding {
  assetRole: string
  targetPath: string
  relation: PlaygroundRoleRelation
  priority: Importance
  activeWhen?: readonly ScenarioRoleCondition[]
}

export interface ScenarioRolePolicy {
  schemaVersion: 'voce.playground-role-policy/v1alpha1'
  id: string
  scenarioId: PlaygroundScenarioId
  role: string
  referenceOrder: number
  minCount: number
  maxCount: number
  bindings: readonly ScenarioRoleBinding[]
  targets: readonly { targetPath: string; operation: 'preserve' | 'replace' | 'adjust'; importance: Importance; activeWhen?: readonly ScenarioRoleCondition[] }[]
  authorizedTargetPaths: readonly string[]
  prohibitedTargetPaths: readonly string[]
  prohibitedTargetPathImportance: Readonly<Record<string, Importance>>
  displayOnlyNonContributions: readonly string[]
  typedMetadata?: DeclarativeTypedMetadataPolicy
  policyDigest: string
}

export interface ScenarioDistribution {
  scenarioId: PlaygroundScenarioId
  packId: string
  version: string
  effectiveScenario: EffectiveScenario
  distributionHash: string
  roles: readonly ScenarioRolePolicy[]
  roleGroups: readonly ScenarioRoleGroupPolicy[]
  capabilities: Readonly<{ composition: boolean }>
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

const compositionPaths: OntologyPathDefinition[] = VISUAL_COMPOSITION_PATHS.map((path) => ({ ...path }))
const tryOnCameraPaths = compositionPaths.filter((path) => path.path.startsWith('camera.'))

const TOP_CATEGORIES = ['t_shirt', 'shirt', 'blouse', 'knitwear', 'jacket', 'coat', 'vest', 'other_upper'] as const
const BOTTOM_CATEGORIES = ['trousers', 'jeans', 'skirt', 'shorts', 'leggings', 'other_lower'] as const
const FULL_BODY_CATEGORIES = ['dress', 'jumpsuit', 'robe', 'complete_outfit', 'other_full_body'] as const
const FULL_BODY_STRUCTURES = ['one_piece', 'complete_outfit'] as const
const ACCESSORY_COMBINATIONS = [
  { accessoryType: 'bracelet', placement: 'wrist', sides: ['left', 'right', 'both'] },
  { accessoryType: 'ring', placement: 'hand_finger_region', sides: ['left', 'right'] },
  { accessoryType: 'brooch', placement: 'chest', sides: ['left', 'right', 'center'] },
  { accessoryType: 'necklace', placement: 'neck', sides: ['center'] },
  { accessoryType: 'earring', placement: 'ear', sides: ['left', 'right', 'both'] },
  { accessoryType: 'hair_accessory', placement: 'hair_head', sides: ['left', 'right', 'center'] },
] as const

// Garment slots already declare the replacement region. Category and structure
// remain available to API clients that know them, but the public Playground does
// not force people to classify an image before the model can inspect it.
const topMetadata: DeclarativeTypedMetadataPolicy = { fields: { category: { required: false, values: [...TOP_CATEGORIES] } } }
const bottomMetadata: DeclarativeTypedMetadataPolicy = { fields: { category: { required: false, values: [...BOTTOM_CATEGORIES] } } }
const fullBodyMetadata: DeclarativeTypedMetadataPolicy = {
  fields: {
    category: { required: false, values: [...FULL_BODY_CATEGORIES] },
    structure: { required: false, values: [...FULL_BODY_STRUCTURES] },
  },
  combinations: FULL_BODY_CATEGORIES.map((category) => ({ values: { category, structure: category === 'complete_outfit' ? 'complete_outfit' : 'one_piece' } })),
}
const accessoryMetadata: DeclarativeTypedMetadataPolicy = {
  fields: {
    accessoryType: { required: true, values: ACCESSORY_COMBINATIONS.map((item) => item.accessoryType) },
    placement: { required: true, values: [...new Set(ACCESSORY_COMBINATIONS.map((item) => item.placement))] },
    side: { required: true, values: ['left', 'right', 'both', 'center'] },
    appearance: { required: false, values: ['reference_image'], defaultValue: 'reference_image' },
  },
  combinations: ACCESSORY_COMBINATIONS.flatMap((item) => item.sides.map((side) => ({ values: { accessoryType: item.accessoryType, placement: item.placement, side } }))),
}

const wardrobePaths: OntologyPathDefinition[] = [
  { path: 'person.identity', valueKind: 'string', cardinality: 'one', defaultImportance: 'hard' },
  { path: 'wardrobe.replacement.scope', valueKind: 'enum', cardinality: 'one', allowedValues: ['upper', 'lower', 'upper_and_lower'], defaultImportance: 'required' },
  { path: 'wardrobe.garment.structure', valueKind: 'enum', cardinality: 'one', allowedValues: ['one_piece', 'complete_outfit'], defaultImportance: 'required' },
  { path: 'wardrobe.garment.sourceLayout', valueKind: 'enum', cardinality: 'one', allowedValues: ['single_reference', 'separate_references'], defaultImportance: 'required' },
  { path: 'wardrobe.upper.category', valueKind: 'enum', cardinality: 'one', allowedValues: [...TOP_CATEGORIES], defaultImportance: 'required' },
  { path: 'wardrobe.upper', valueKind: 'string', cardinality: 'one', defaultImportance: 'required' },
  { path: 'wardrobe.lower.category', valueKind: 'enum', cardinality: 'one', allowedValues: [...BOTTOM_CATEGORIES], defaultImportance: 'required' },
  { path: 'wardrobe.lower', valueKind: 'string', cardinality: 'one', defaultImportance: 'required' },
  { path: 'wardrobe.fullBody.category', valueKind: 'enum', cardinality: 'one', allowedValues: [...FULL_BODY_CATEGORIES], defaultImportance: 'required' },
  { path: 'wardrobe.fullBody', valueKind: 'string', cardinality: 'one', defaultImportance: 'required' },
  { path: 'wardrobe.footwear', valueKind: 'string', cardinality: 'one', defaultImportance: 'required' },
  { path: 'wardrobe.accessories.items', valueKind: 'string', cardinality: 'many', defaultImportance: 'required' },
  { path: 'wardrobe.fit.upper', valueKind: 'string', cardinality: 'one', defaultImportance: 'preferred' },
  { path: 'wardrobe.fit.lower', valueKind: 'string', cardinality: 'one', defaultImportance: 'preferred' },
  { path: 'wardrobe.fit.fullBody', valueKind: 'string', cardinality: 'one', defaultImportance: 'preferred' },
  { path: 'pose', valueKind: 'string', cardinality: 'one', defaultImportance: 'preferred' },
]

const cosplayPaths: OntologyPathDefinition[] = [
  { path: 'person.identity', valueKind: 'string', cardinality: 'one', defaultImportance: 'hard' },
  { path: 'character.hair', valueKind: 'string', cardinality: 'one', defaultImportance: 'required' },
  { path: 'character.costume', valueKind: 'string', cardinality: 'one', defaultImportance: 'required' },
  { path: 'character.accessories', valueKind: 'string', cardinality: 'one', defaultImportance: 'required' },
  { path: 'character.criticalDetails', valueKind: 'string', cardinality: 'many', defaultImportance: 'required' },
  { path: 'character.signatureProps.primary', valueKind: 'string', cardinality: 'one', defaultImportance: 'required' },
  { path: 'character.signatureProps.primary.signatureDetails', valueKind: 'string', cardinality: 'many', defaultImportance: 'required' },
  { path: 'pose', valueKind: 'string', cardinality: 'one', defaultImportance: 'preferred' },
  { path: 'style.rendering.medium', valueKind: 'string', cardinality: 'one', defaultImportance: 'hard' },
]

const forbid = (assetRole: string, paths: readonly string[]): ScenarioRoleBinding[] => paths.map((targetPath) => ({ assetRole, targetPath, relation: 'exclude', priority: 'hard' as const }))
const tryOnForbidden = ['person.identity', 'wardrobe.upper', 'wardrobe.lower', 'wardrobe.fullBody', 'wardrobe.footwear', 'pose', 'environment.background', 'style']

const commonPromptSections: PromptSectionContribution['sections'] = [
  { id: 'subject-and-reference-fidelity', group: 'subject-and-reference-fidelity', order: 1, pathPrefixes: ['person', 'wardrobe', 'character', 'pose', 'style'], templateKey: 'composition.subject-and-reference-fidelity' },
  { id: 'composition-shot-and-crop', group: 'composition-shot-and-crop', order: 2, pathPrefixes: ['camera.framing'], templateKey: 'composition.composition-shot-and-crop' },
  { id: 'composition-view-and-roll', group: 'composition-view-and-roll', order: 3, pathPrefixes: ['camera.view', 'camera.roll'], templateKey: 'composition.composition-view-and-roll' },
  { id: 'composition-layout-and-space', group: 'composition-layout-and-space', order: 4, pathPrefixes: ['camera.composition'], templateKey: 'composition.composition-layout-and-space' },
  { id: 'composition-lens-and-environment', group: 'composition-lens-and-environment', order: 5, pathPrefixes: ['camera.lens', 'lighting', 'environment'], templateKey: 'composition.composition-lens-and-environment' },
  { id: 'forbidden-and-output', group: 'forbidden-and-output', order: 6, pathPrefixes: ['output'], templateKey: 'composition.forbidden-and-output' },
]

const scenarioDefinitions: Record<PlaygroundScenarioId, {
  roles: readonly { role: string; minCount: number; maxCount: number; bindings: readonly ScenarioRoleBinding[]; typedMetadata?: DeclarativeTypedMetadataPolicy }[]
  groups: readonly ScenarioRoleGroupPolicy[]
  paths: readonly OntologyPathDefinition[]
  composition: boolean
}> = {
  'virtual-tryon': {
    composition: false,
    groups: [
      { id: 'garment-required', operator: 'atLeastOne', roles: ['garment-full-body', 'garment-top', 'garment-bottom'], minCount: 1 },
      { id: 'full-body-top-exclusive', operator: 'mutuallyExclusive', roles: ['garment-full-body', 'garment-top'], maxCount: 1 },
      { id: 'full-body-bottom-exclusive', operator: 'mutuallyExclusive', roles: ['garment-full-body', 'garment-bottom'], maxCount: 1 },
    ],
    roles: [
      { role: 'person-identity', minCount: 1, maxCount: 1, bindings: [
        { assetRole: 'person-identity', targetPath: 'person.identity', relation: 'preserve', priority: 'hard' },
        { assetRole: 'person-identity', targetPath: 'wardrobe.upper', relation: 'preserve', priority: 'required', activeWhen: [{ role: 'garment-top', presence: 'absent' }, { role: 'garment-full-body', presence: 'absent' }] },
        { assetRole: 'person-identity', targetPath: 'wardrobe.lower', relation: 'preserve', priority: 'required', activeWhen: [{ role: 'garment-bottom', presence: 'absent' }, { role: 'garment-full-body', presence: 'absent' }] },
        { assetRole: 'person-identity', targetPath: 'wardrobe.footwear', relation: 'preserve', priority: 'required', activeWhen: [{ role: 'footwear-detail', presence: 'absent' }] },
        { assetRole: 'person-identity', targetPath: 'wardrobe.accessories.items', relation: 'preserve', priority: 'required', activeWhen: [{ role: 'accessory-detail', presence: 'absent' }] },
        { assetRole: 'person-identity', targetPath: 'pose', relation: 'preserve', priority: 'preferred', activeWhen: [{ role: 'pose', presence: 'absent' }] },
        ...tryOnCameraPaths.map((path) => ({ assetRole: 'person-identity', targetPath: path.path, relation: 'preserve' as const, priority: 'preferred' as const })),
        { assetRole: 'person-identity', targetPath: 'pose', relation: 'exclude', priority: 'hard', activeWhen: [{ role: 'pose', presence: 'present' }] },
        { assetRole: 'person-identity', targetPath: 'wardrobe.accessories.items', relation: 'exclude', priority: 'hard', activeWhen: [{ role: 'accessory-detail', presence: 'present' }] },
        ...forbid('person-identity', ['character.costume', 'character.accessories', 'environment.background', 'style']),
      ] },
      { role: 'garment-top', minCount: 0, maxCount: 1, typedMetadata: topMetadata, bindings: [
        { assetRole: 'garment-top', targetPath: 'wardrobe.replacement.scope', relation: 'reproduce', priority: 'required' }, { assetRole: 'garment-top', targetPath: 'wardrobe.upper.category', relation: 'reproduce', priority: 'required' }, { assetRole: 'garment-top', targetPath: 'wardrobe.upper', relation: 'reproduce', priority: 'required' },
        ...forbid('garment-top', tryOnForbidden.filter((path) => !['wardrobe.upper', 'wardrobe.replacement.scope'].includes(path))),
      ] },
      { role: 'garment-bottom', minCount: 0, maxCount: 1, typedMetadata: bottomMetadata, bindings: [
        { assetRole: 'garment-bottom', targetPath: 'wardrobe.replacement.scope', relation: 'reproduce', priority: 'required' }, { assetRole: 'garment-bottom', targetPath: 'wardrobe.lower.category', relation: 'reproduce', priority: 'required' }, { assetRole: 'garment-bottom', targetPath: 'wardrobe.lower', relation: 'reproduce', priority: 'required' },
        ...forbid('garment-bottom', tryOnForbidden.filter((path) => !['wardrobe.lower', 'wardrobe.replacement.scope'].includes(path))),
      ] },
      { role: 'garment-full-body', minCount: 0, maxCount: 1, typedMetadata: fullBodyMetadata, bindings: [
        { assetRole: 'garment-full-body', targetPath: 'wardrobe.replacement.scope', relation: 'reproduce', priority: 'required' }, { assetRole: 'garment-full-body', targetPath: 'wardrobe.garment.structure', relation: 'reproduce', priority: 'required' }, { assetRole: 'garment-full-body', targetPath: 'wardrobe.garment.sourceLayout', relation: 'reproduce', priority: 'required' }, { assetRole: 'garment-full-body', targetPath: 'wardrobe.fullBody.category', relation: 'reproduce', priority: 'required' }, { assetRole: 'garment-full-body', targetPath: 'wardrobe.fullBody', relation: 'reproduce', priority: 'required' }, { assetRole: 'garment-full-body', targetPath: 'wardrobe.upper', relation: 'reproduce', priority: 'required' }, { assetRole: 'garment-full-body', targetPath: 'wardrobe.lower', relation: 'reproduce', priority: 'required' },
        ...forbid('garment-full-body', tryOnForbidden.filter((path) => !['wardrobe.replacement.scope', 'wardrobe.garment.structure', 'wardrobe.garment.sourceLayout', 'wardrobe.fullBody.category', 'wardrobe.fullBody', 'wardrobe.upper', 'wardrobe.lower'].includes(path))),
      ] },
      { role: 'fit-reference', minCount: 0, maxCount: 1, bindings: [
        { assetRole: 'fit-reference', targetPath: 'wardrobe.fit.upper', relation: 'inspire', priority: 'preferred', activeWhen: [{ role: 'garment-top', presence: 'present' }, { role: 'garment-full-body', presence: 'absent' }] }, { assetRole: 'fit-reference', targetPath: 'wardrobe.fit.lower', relation: 'inspire', priority: 'preferred', activeWhen: [{ role: 'garment-bottom', presence: 'present' }, { role: 'garment-full-body', presence: 'absent' }] }, { assetRole: 'fit-reference', targetPath: 'wardrobe.fit.fullBody', relation: 'inspire', priority: 'preferred', activeWhen: [{ role: 'garment-full-body', presence: 'present' }] },
        ...forbid('fit-reference', ['person.identity', 'wardrobe.upper', 'wardrobe.lower', 'wardrobe.fullBody', 'wardrobe.footwear', 'pose', 'environment.background', 'style']),
      ] },
      { role: 'footwear-detail', minCount: 0, maxCount: 1, bindings: [{ assetRole: 'footwear-detail', targetPath: 'wardrobe.footwear', relation: 'reproduce', priority: 'required' }, ...forbid('footwear-detail', ['person.identity', 'wardrobe.upper', 'wardrobe.lower', 'wardrobe.fullBody', 'pose', 'environment.background', 'style'])] },
      { role: 'accessory-detail', minCount: 0, maxCount: 4, typedMetadata: accessoryMetadata, bindings: [
        { assetRole: 'accessory-detail', targetPath: 'wardrobe.accessories.items', relation: 'reproduce', priority: 'required' },
        ...forbid('accessory-detail', ['person.identity', 'wardrobe.upper', 'wardrobe.lower', 'wardrobe.fullBody', 'wardrobe.footwear', 'wardrobe.fit.upper', 'wardrobe.fit.lower', 'wardrobe.fit.fullBody', 'pose', ...tryOnCameraPaths.map((path) => path.path), 'character.costume', 'character.hair', 'character.makeup', 'character.signatureProps.primary', 'environment.background', 'style']),
      ] },
      { role: 'pose', minCount: 0, maxCount: 1, bindings: [{ assetRole: 'pose', targetPath: 'pose', relation: 'inspire', priority: 'preferred' }, ...forbid('pose', ['person.identity', 'wardrobe.upper', 'wardrobe.lower', 'wardrobe.fullBody', 'wardrobe.footwear', 'environment.background', 'style'])] },
    ],
    paths: [...wardrobePaths, ...tryOnCameraPaths],
  },
  cosplay: {
    composition: true,
    groups: [],
    roles: [
      { role: 'person-identity', minCount: 1, maxCount: 1, bindings: [
        { assetRole: 'person-identity', targetPath: 'person.identity', relation: 'preserve', priority: 'hard' },
        { assetRole: 'person-identity', targetPath: 'style.rendering.medium', relation: 'preserve', priority: 'hard' },
        ...forbid('person-identity', ['character.costume', 'character.accessories', 'character.signatureProps.primary', 'pose', 'environment.background']),
      ] },
      { role: 'character-design', minCount: 1, maxCount: 1, bindings: [{ assetRole: 'character-design', targetPath: 'person.identity', relation: 'exclude', priority: 'hard' }, { assetRole: 'character-design', targetPath: 'character.hair', relation: 'reproduce', priority: 'required' }, { assetRole: 'character-design', targetPath: 'character.costume', relation: 'reproduce', priority: 'required' }, { assetRole: 'character-design', targetPath: 'character.accessories', relation: 'reproduce', priority: 'required' }, { assetRole: 'character-design', targetPath: 'character.signatureProps.primary', relation: 'reproduce', priority: 'required' }, { assetRole: 'character-design', targetPath: 'style', relation: 'exclude', priority: 'hard' }] },
      { role: 'signature-prop-detail', minCount: 0, maxCount: 4, bindings: [{ assetRole: 'signature-prop-detail', targetPath: 'person.identity', relation: 'exclude', priority: 'hard' }, { assetRole: 'signature-prop-detail', targetPath: 'character.signatureProps.primary.signatureDetails', relation: 'reproduce', priority: 'required' }, { assetRole: 'signature-prop-detail', targetPath: 'character.costume', relation: 'exclude', priority: 'hard' }, { assetRole: 'signature-prop-detail', targetPath: 'pose', relation: 'exclude', priority: 'hard' }, { assetRole: 'signature-prop-detail', targetPath: 'environment.background', relation: 'exclude', priority: 'hard' }, { assetRole: 'signature-prop-detail', targetPath: 'style', relation: 'exclude', priority: 'hard' }] },
      { role: 'pose', minCount: 0, maxCount: 4, bindings: [{ assetRole: 'pose', targetPath: 'person.identity', relation: 'exclude', priority: 'hard' }, { assetRole: 'pose', targetPath: 'pose', relation: 'inspire', priority: 'preferred' }, { assetRole: 'pose', targetPath: 'character.costume', relation: 'exclude', priority: 'hard' }, { assetRole: 'pose', targetPath: 'character.signatureProps.primary', relation: 'exclude', priority: 'hard' }, { assetRole: 'pose', targetPath: 'environment.background', relation: 'exclude', priority: 'hard' }, { assetRole: 'pose', targetPath: 'style', relation: 'exclude', priority: 'hard' }] },
      { role: 'critical-detail', minCount: 0, maxCount: 4, bindings: [{ assetRole: 'critical-detail', targetPath: 'person.identity', relation: 'exclude', priority: 'hard' }, { assetRole: 'critical-detail', targetPath: 'character.criticalDetails', relation: 'reproduce', priority: 'required' }, { assetRole: 'critical-detail', targetPath: 'character.costume', relation: 'exclude', priority: 'hard' }, { assetRole: 'critical-detail', targetPath: 'pose', relation: 'exclude', priority: 'hard' }, { assetRole: 'critical-detail', targetPath: 'environment.background', relation: 'exclude', priority: 'hard' }, { assetRole: 'critical-detail', targetPath: 'style', relation: 'exclude', priority: 'hard' }] },
    ],
    paths: [...cosplayPaths, ...compositionPaths],
  },
}

function contribution<T extends Record<string, unknown>>(id: string, schemaVersion: string, value: T): T & ScenarioPackContribution {
  const base = { id, schemaVersion, ...value } as T & ScenarioPackContribution
  return { ...base, contentDigest: sha256(JSON.parse(JSON.stringify(base)) as JsonValue) } as unknown as T & ScenarioPackContribution
}

function roleContribution(id: string, definition: typeof scenarioDefinitions[PlaygroundScenarioId]['roles'][number], referenceOrder: number): ScenarioPackContribution {
  return contribution(id, 'voce.interpretation-scope/v1alpha1', { assetRole: definition.role, referenceOrder, minCount: definition.minCount, maxCount: definition.maxCount, bindings: definition.bindings.map((binding) => ({ ...binding })), ...(definition.typedMetadata ? { typedMetadata: definition.typedMetadata } : {}) })
}

function rolePolicy(scenarioId: PlaygroundScenarioId, scope: ResolvedContribution): ScenarioRolePolicy {
  const role = typeof scope.assetRole === 'string' ? scope.assetRole : ''
  const referenceOrder = scope.referenceOrder
  const minCount = scope.minCount
  const maxCount = scope.maxCount
  const rawBindings = scope.bindings
  if (!role || !Number.isInteger(referenceOrder) || Number(referenceOrder) < 0 || !Number.isInteger(minCount) || !Number.isInteger(maxCount) || Number(minCount) < 0 || Number(maxCount) < Number(minCount) || !Array.isArray(rawBindings)) throw new Error(`PLAYGROUND_ROLE_POLICY_INVALID:${scope.contributionId}`)
  const bindings: ScenarioRoleBinding[] = rawBindings.map((raw) => {
    const binding = raw as unknown as Partial<ScenarioRoleBinding>
    if (binding.assetRole !== role || typeof binding.targetPath !== 'string' || !['preserve', 'reproduce', 'inspire', 'exclude'].includes(binding.relation ?? '') || !['hard', 'required', 'preferred'].includes(binding.priority ?? '')) throw new Error(`PLAYGROUND_ROLE_BINDING_INVALID:${scope.contributionId}`)
    const activeWhen = Array.isArray(binding.activeWhen) ? binding.activeWhen.map((condition) => ({ role: String(condition?.role ?? ''), presence: condition?.presence as RolePresence })).filter((condition) => condition.role && (condition.presence === 'present' || condition.presence === 'absent')) : undefined
    return { assetRole: binding.assetRole, targetPath: binding.targetPath, relation: binding.relation, priority: binding.priority, ...(activeWhen?.length ? { activeWhen } : {}) } as ScenarioRoleBinding
  })
  const targets = bindings.filter((binding) => binding.relation !== 'exclude').map((binding) => ({ targetPath: binding.targetPath, operation: binding.relation === 'preserve' ? 'preserve' as const : binding.relation === 'reproduce' ? 'replace' as const : 'adjust' as const, importance: binding.priority, ...(binding.activeWhen ? { activeWhen: binding.activeWhen } : {}) })).sort((left, right) => compareCodeUnits(left.targetPath, right.targetPath) || compareCodeUnits(left.operation, right.operation) || compareCodeUnits(left.importance, right.importance))
  const authorizedTargetPaths = sortedStrings(bindings.filter((binding) => binding.relation !== 'exclude').map((binding) => binding.targetPath))
  const prohibitedTargetPaths = sortedStrings(bindings.filter((binding) => binding.relation === 'exclude').map((binding) => binding.targetPath))
  const prohibitedTargetPathImportance = Object.fromEntries(prohibitedTargetPaths.map((path) => [path, bindings.filter((binding) => binding.relation === 'exclude' && binding.targetPath === path).reduce<Importance>((current, binding) => binding.priority === 'hard' || current === 'hard' ? 'hard' : binding.priority === 'required' || current === 'required' ? 'required' : 'preferred', 'preferred')]))
  const displayOnlyNonContributions = prohibitedTargetPaths.map((path) => `This reference does not control ${path.replaceAll('.', ' ')}.`)
  const typedMetadata = scope.typedMetadata && typeof scope.typedMetadata === 'object' && !Array.isArray(scope.typedMetadata) ? scope.typedMetadata as unknown as DeclarativeTypedMetadataPolicy : undefined
  const base = { schemaVersion: 'voce.playground-role-policy/v1alpha1' as const, id: `${scope.packId}:${scope.contributionId}`, scenarioId, role, referenceOrder: Number(referenceOrder), minCount: Number(minCount), maxCount: Number(maxCount), bindings, targets, authorizedTargetPaths, prohibitedTargetPaths, prohibitedTargetPathImportance, displayOnlyNonContributions, ...(typedMetadata ? { typedMetadata } : {}), sourceContributionDigest: scope.contentDigest }
  return deepFreeze({ ...base, policyDigest: sha256(JSON.parse(JSON.stringify(base)) as JsonValue) })
}

function manifest(packId: string, version: string, contributionIndex: ScenarioPackManifest['contributions']): ScenarioPackManifest {
  return {
    schemaVersion: 'voce.scenario-pack/v1alpha1',
    packId,
    version,
    kind: 'root',
    supportedInteractionModes: ['reference_guided'],
    inputExpectations: [],
    outputExpectations: [{ id: 'image', artifactKind: 'image', dataType: 'image', producedIn: ['reference_guided'], cardinality: { min: 1, max: 1 }, mediaTypes: ['image/png', 'image/jpeg'] }],
    license: 'Apache-2.0',
    provenance: { publisher: 'VOCE Playground', sourceRepository: 'https://github.com/windforce19820520-ai/visual-ontology-constraint-engine', sourceRevision: 'playground-pr0' },
    coreRange: '>=0.1.0-rc.5 <0.2.0',
    contractRanges: { '@voce-engine/contracts': '0.1.0-rc.5' },
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

function createPack(scenarioId: PlaygroundScenarioId): ScenarioPack {
  const packId = `voce.playground.${scenarioId}`
  const version = '1.0.0'
  const definition = scenarioDefinitions[scenarioId]
  const ontology = contribution(`${scenarioId}.ontology`, 'voce.ontology-vocabulary/v1alpha1', { paths: [...definition.paths] })
  const rules = contribution(`${scenarioId}.rules`, 'voce.declarative-rule-pack/v1alpha1', { namespace: `voce.playground.${scenarioId}`, rules: [] }) as DeclarativeRulePackContribution
  const scopes = definition.roles.map((item, index) => roleContribution(`${scenarioId}.scope.${item.role}`, item, index))
  const inputPolicy = contribution(`${scenarioId}.input-policy`, 'voce.input-policy/v1alpha1', { inputPolicy: { roleGroups: definition.groups.map((group) => ({ ...group, roles: [...group.roles] })), capabilities: { composition: definition.composition } } })
  const prompt = contribution(`${scenarioId}.prompt-sections`, 'voce.prompt-section-contribution/v1alpha1', { sections: commonPromptSections }) as PromptSectionContribution
  const contributions = { ontologyVocabulary: [ontology], rulePacks: [rules], interpretationScopes: [...scopes, inputPolicy], promptSections: [prompt], reviewTemplates: [], defaults: [], overridePoints: [] }
  const index = Object.fromEntries(Object.entries(contributions).map(([category, values]) => [category, values.map((item) => ({ id: item.id, schemaVersion: item.schemaVersion, contentDigest: item.contentDigest }))])) as unknown as ScenarioPackManifest['contributions']
  return { manifest: manifest(packId, version, index), contributions: { ...contributions, fixtureSuites: [] }, migrations: [] } as unknown as ScenarioPack
}

function loadDistribution(scenarioId: PlaygroundScenarioId): ScenarioDistribution {
  const pack = createPack(scenarioId)
  const registry: ScenarioPackRegistry = createScenarioPackRegistry()
  const source: LocalScenarioPackSource = { kind: 'memory', definition: pack, logicalFiles: [] }
  registry.register(source)
  const result = registry.resolve({ root: { packId: pack.manifest.packId, versionRange: pack.manifest.version }, extensions: [] })
  if (result.status !== 'resolved') throw new Error(`PLAYGROUND_SCENARIO_BLOCKED:${scenarioId}`)
  const roles = result.effectiveScenario.interpretationScopes.filter((scope) => typeof scope.assetRole === 'string').map((scope) => rolePolicy(scenarioId, scope)).sort((left, right) => left.referenceOrder - right.referenceOrder || compareCodeUnits(left.role, right.role))
  if (new Set(roles.map((role) => role.role)).size !== roles.length) throw new Error(`PLAYGROUND_ROLE_POLICY_DUPLICATE:${scenarioId}`)
  const policies = result.effectiveScenario.interpretationScopes.filter((scope) => scope.inputPolicy && typeof scope.inputPolicy === 'object')
  if (policies.length !== 1) throw new Error(`PLAYGROUND_INPUT_POLICY_INVALID:${scenarioId}`)
  const resolvedInputPolicy = policies[0].inputPolicy as { roleGroups?: ScenarioRoleGroupPolicy[]; capabilities?: Record<string, boolean> }
  const roleGroups = (resolvedInputPolicy.roleGroups ?? []).filter((group): group is ScenarioRoleGroupPolicy => Boolean(group && typeof group.id === 'string' && (group.operator === 'atLeastOne' || group.operator === 'mutuallyExclusive') && Array.isArray(group.roles))).map((group) => deepFreeze({ ...group, roles: sortedStrings(group.roles) }))
  if (new Set(roleGroups.map((group) => group.id)).size !== roleGroups.length) throw new Error(`PLAYGROUND_ROLE_GROUP_DUPLICATE:${scenarioId}`)
  if (typeof resolvedInputPolicy.capabilities?.composition !== 'boolean') throw new Error(`PLAYGROUND_CAPABILITY_POLICY_INVALID:${scenarioId}`)
  return deepFreeze({ scenarioId, packId: pack.manifest.packId, version: pack.manifest.version, effectiveScenario: result.effectiveScenario, distributionHash: result.effectiveScenario.effectiveScenarioHash, roles, roleGroups, capabilities: { composition: resolvedInputPolicy.capabilities.composition } })
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
