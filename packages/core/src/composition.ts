import type { ChangeIntent, JsonValue, OntologyPathDefinition, Provenance } from '@voce-engine/contracts'
import { canonicalize, sha256 } from './canonical.js'

export const VISUAL_COMPOSITION_SCHEMA_VERSION = 'voce.visual-composition/v1alpha1' as const
export const VISUAL_COMPOSITION_CATALOG_ID = 'visual-composition.v1'
export const VISUAL_COMPOSITION_FIXED_TIME = '2026-01-01T00:00:00.000Z'

export interface CompositionChangeTemplate {
  operation: ChangeIntent['operation']
  targetPath: string
  requestedValue?: JsonValue
  valueFrom?: 'direction'|'surface'|'silhouette'
}

export interface VisualCompositionPreset {
  id: string
  labelKey: string
  descriptionKey: string
  category: 'framing'|'view'|'layout'|'depth'|'lens'
  compatibilityHints?: string[]
  changes: CompositionChangeTemplate[]
  requiredInputs?: string[]
}

export interface VisualCompositionCatalog {
  schemaVersion: typeof VISUAL_COMPOSITION_SCHEMA_VERSION
  id: string
  paths: OntologyPathDefinition[]
  presets: VisualCompositionPreset[]
  catalogHash: string
}

const enumPath = (path: string, allowedValues: string[], defaultImportance: OntologyPathDefinition['defaultImportance'] = 'preferred'): OntologyPathDefinition => ({ path, valueKind: 'enum', cardinality: 'one', allowedValues, defaultImportance })
const boolPath = (path: string, defaultImportance: OntologyPathDefinition['defaultImportance'] = 'preferred'): OntologyPathDefinition => ({ path, valueKind: 'boolean', cardinality: 'one', defaultImportance })
const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T
function deepFreeze<T>(value: T): T {
  if (value !== null && typeof value === 'object' && !Object.isFrozen(value)) {
    for (const child of Object.values(value as Record<string, unknown>)) deepFreeze(child)
    Object.freeze(value)
  }
  return value
}

export const VISUAL_COMPOSITION_PATHS: OntologyPathDefinition[] = [
  enumPath('camera.framing.shotScale', ['extreme_close_up', 'close_up', 'head_and_shoulders', 'bust_shot', 'medium_close_up', 'medium_shot', 'knee_shot', 'full_shot', 'long_shot', 'extreme_long_shot']),
  boolPath('camera.framing.crop.keepHead'), boolPath('camera.framing.crop.keepHands'), boolPath('camera.framing.crop.keepBothFeet'), boolPath('camera.framing.crop.keepProduct'), boolPath('camera.framing.crop.keepSignatureProp'),
  enumPath('camera.view.elevation', ['eye_level', 'low_angle', 'high_angle', 'birds_eye']), enumPath('camera.view.relationship', ['front', 'three_quarter', 'profile', 'rear', 'over_the_shoulder']),
  enumPath('camera.roll.mode', ['level', 'dutch_left', 'dutch_right']), enumPath('camera.lens.focalLengthClass', ['ultra_wide', 'wide', 'normal', 'telephoto', 'super_telephoto']), enumPath('camera.lens.perspective', ['expanded', 'natural', 'compressed']),
  boolPath('camera.composition.patterns.centeredSymmetry'), boolPath('camera.composition.patterns.ruleOfThirds'), boolPath('camera.composition.patterns.leadingLines'), boolPath('camera.composition.patterns.diagonal'), boolPath('camera.composition.patterns.sCurve'), boolPath('camera.composition.patterns.triangle'),
  enumPath('camera.composition.placement', ['center', 'left_third', 'right_third', 'upper_third', 'lower_third']), enumPath('camera.composition.negativeSpace', ['none', 'left', 'right', 'above', 'below', 'surrounding']),
  boolPath('camera.composition.leadingRoom.enabled'), enumPath('camera.composition.leadingRoom.direction', ['left', 'right', 'forward', 'up', 'down']),
  enumPath('camera.composition.foregroundTreatment', ['clear', 'soft_obstruction', 'strong_obstruction']), boolPath('camera.composition.framingDevices.frameWithinFrame'), boolPath('camera.composition.framingDevices.environmentalPortrait'),
  boolPath('camera.composition.reflection.enabled'), enumPath('camera.composition.reflection.surface', ['mirror', 'glass', 'water', 'screen', 'polished_surface']), enumPath('camera.composition.reflection.role', ['supporting', 'co_primary', 'primary']), enumPath('camera.composition.environmentRelationship', ['isolated', 'contextual', 'environment_dominant']),
  enumPath('lighting.subjectRendering', ['natural', 'silhouette']),
]

const preset = (id: string, category: VisualCompositionPreset['category'], changes: CompositionChangeTemplate[], requiredInputs: string[] = [], compatibilityHints: string[] = []): VisualCompositionPreset => ({ id, labelKey: `visualComposition.${id}.label`, descriptionKey: `visualComposition.${id}.description`, category, ...(compatibilityHints.length ? { compatibilityHints } : {}), changes, ...(requiredInputs.length ? { requiredInputs } : {}) })

export const VISUAL_COMPOSITION_PRESETS: VisualCompositionPreset[] = [
  preset('extreme-close-up', 'framing', [{ operation: 'replace', targetPath: 'camera.framing.shotScale', requestedValue: 'extreme_close_up' }]),
  preset('close-up', 'framing', [{ operation: 'replace', targetPath: 'camera.framing.shotScale', requestedValue: 'close_up' }]),
  preset('head-and-shoulders', 'framing', [{ operation: 'replace', targetPath: 'camera.framing.shotScale', requestedValue: 'head_and_shoulders' }, { operation: 'adjust', targetPath: 'camera.framing.crop.keepHead', requestedValue: true }]),
  preset('bust-shot', 'framing', [{ operation: 'replace', targetPath: 'camera.framing.shotScale', requestedValue: 'bust_shot' }, { operation: 'adjust', targetPath: 'camera.framing.crop.keepHead', requestedValue: true }]),
  preset('medium-close-up', 'framing', [{ operation: 'replace', targetPath: 'camera.framing.shotScale', requestedValue: 'medium_close_up' }]),
  preset('medium-shot', 'framing', [{ operation: 'replace', targetPath: 'camera.framing.shotScale', requestedValue: 'medium_shot' }]),
  preset('knee-shot', 'framing', [{ operation: 'replace', targetPath: 'camera.framing.shotScale', requestedValue: 'knee_shot' }]),
  preset('full-shot', 'framing', [{ operation: 'replace', targetPath: 'camera.framing.shotScale', requestedValue: 'full_shot' }, { operation: 'adjust', targetPath: 'camera.framing.crop.keepBothFeet', requestedValue: true }]),
  preset('long-shot', 'framing', [{ operation: 'replace', targetPath: 'camera.framing.shotScale', requestedValue: 'long_shot' }, { operation: 'adjust', targetPath: 'camera.composition.environmentRelationship', requestedValue: 'contextual' }]),
  preset('extreme-long-shot', 'framing', [{ operation: 'replace', targetPath: 'camera.framing.shotScale', requestedValue: 'extreme_long_shot' }, { operation: 'adjust', targetPath: 'camera.composition.environmentRelationship', requestedValue: 'environment_dominant' }]),
  preset('low-angle', 'view', [{ operation: 'adjust', targetPath: 'camera.view.elevation', requestedValue: 'low_angle' }]),
  preset('high-angle', 'view', [{ operation: 'adjust', targetPath: 'camera.view.elevation', requestedValue: 'high_angle' }]),
  preset('birds-eye-view', 'view', [{ operation: 'adjust', targetPath: 'camera.view.elevation', requestedValue: 'birds_eye' }]),
  preset('over-the-shoulder', 'view', [{ operation: 'adjust', targetPath: 'camera.view.relationship', requestedValue: 'over_the_shoulder' }], [], ['foreground-shoulder-subject-or-declared-equivalent']),
  preset('dutch-angle', 'view', [{ operation: 'adjust', targetPath: 'camera.roll.mode', valueFrom: 'direction' }], ['direction']),
  preset('centered-symmetry', 'layout', [{ operation: 'adjust', targetPath: 'camera.composition.patterns.centeredSymmetry', requestedValue: true }, { operation: 'adjust', targetPath: 'camera.composition.placement', requestedValue: 'center' }]),
  preset('rule-of-thirds', 'layout', [{ operation: 'adjust', targetPath: 'camera.composition.patterns.ruleOfThirds', requestedValue: true }]),
  preset('leading-lines', 'layout', [{ operation: 'adjust', targetPath: 'camera.composition.patterns.leadingLines', requestedValue: true }], [], ['suitable-scene-geometry-or-review']),
  preset('leading-room', 'layout', [{ operation: 'adjust', targetPath: 'camera.composition.leadingRoom.enabled', requestedValue: true }, { operation: 'adjust', targetPath: 'camera.composition.leadingRoom.direction', valueFrom: 'direction' }], ['direction']),
  preset('diagonal-composition', 'layout', [{ operation: 'adjust', targetPath: 'camera.composition.patterns.diagonal', requestedValue: true }]),
  preset('s-curve-composition', 'layout', [{ operation: 'adjust', targetPath: 'camera.composition.patterns.sCurve', requestedValue: true }]),
  preset('triangle-composition', 'layout', [{ operation: 'adjust', targetPath: 'camera.composition.patterns.triangle', requestedValue: true }]),
  preset('negative-space', 'layout', [{ operation: 'adjust', targetPath: 'camera.composition.negativeSpace', valueFrom: 'direction' }], ['direction']),
  preset('frame-within-frame', 'depth', [{ operation: 'adjust', targetPath: 'camera.composition.framingDevices.frameWithinFrame', requestedValue: true }]),
  preset('foreground-obstruction', 'depth', [{ operation: 'adjust', targetPath: 'camera.composition.foregroundTreatment', requestedValue: 'soft_obstruction' }]),
  preset('profile-silhouette', 'view', [{ operation: 'adjust', targetPath: 'camera.view.relationship', requestedValue: 'profile' }]),
  preset('reflection-composition', 'depth', [{ operation: 'adjust', targetPath: 'camera.composition.reflection.enabled', requestedValue: true }, { operation: 'adjust', targetPath: 'camera.composition.reflection.surface', valueFrom: 'surface' }], ['surface']),
  preset('mirror-composition', 'depth', [{ operation: 'adjust', targetPath: 'camera.composition.reflection.enabled', requestedValue: true }, { operation: 'adjust', targetPath: 'camera.composition.reflection.surface', requestedValue: 'mirror' }]),
  preset('telephoto-compression', 'lens', [{ operation: 'adjust', targetPath: 'camera.lens.focalLengthClass', requestedValue: 'telephoto' }, { operation: 'adjust', targetPath: 'camera.lens.perspective', requestedValue: 'compressed' }]),
  preset('environmental-portrait', 'depth', [{ operation: 'adjust', targetPath: 'camera.composition.framingDevices.environmentalPortrait', requestedValue: true }, { operation: 'adjust', targetPath: 'camera.composition.environmentRelationship', requestedValue: 'contextual' }]),
]

deepFreeze(VISUAL_COMPOSITION_PATHS)
deepFreeze(VISUAL_COMPOSITION_PRESETS)

const VISUAL_COMPOSITION_CATALOG_BODY = { schemaVersion: VISUAL_COMPOSITION_SCHEMA_VERSION, id: VISUAL_COMPOSITION_CATALOG_ID, paths: VISUAL_COMPOSITION_PATHS, presets: VISUAL_COMPOSITION_PRESETS }

export const VISUAL_COMPOSITION_CATALOG: VisualCompositionCatalog = deepFreeze({ ...VISUAL_COMPOSITION_CATALOG_BODY, catalogHash: sha256(VISUAL_COMPOSITION_CATALOG_BODY as unknown as JsonValue) })

export function computeVisualCompositionCatalogHash(catalog: VisualCompositionCatalog = VISUAL_COMPOSITION_CATALOG): string {
  return sha256({ schemaVersion: catalog.schemaVersion, id: catalog.id, paths: catalog.paths, presets: catalog.presets } as unknown as JsonValue)
}

function valueForTemplate(template: CompositionChangeTemplate, options: Record<string, JsonValue>): JsonValue | undefined {
  let value = template.valueFrom === undefined ? template.requestedValue : options[template.valueFrom]
  if (template.valueFrom !== undefined && value === undefined) throw new Error('COMPOSITION_PRESET_INPUT_REQUIRED')
  if (template.targetPath === 'camera.roll.mode') {
    if (value !== 'left' && value !== 'right') throw new Error('COMPOSITION_DIRECTION_INVALID')
    value = value === 'left' ? 'dutch_left' : 'dutch_right'
  }
  if (value === undefined) return undefined
  const definition = VISUAL_COMPOSITION_PATHS.find((item) => item.path === template.targetPath)
  const valid = definition?.valueKind === 'boolean' ? typeof value === 'boolean'
    : definition?.valueKind === 'string' ? typeof value === 'string'
      : definition?.valueKind === 'number' ? typeof value === 'number' && Number.isFinite(value)
        : definition?.valueKind === 'enum' && definition.allowedValues?.some((allowed) => canonicalize(allowed) === canonicalize(value))
  if (!definition || !valid) throw new Error('COMPOSITION_PRESET_INPUT_INVALID')
  return clone(value)
}

export function expandVisualCompositionPreset(presetId: string, options: { inputs?: Record<string, JsonValue>; provenance?: Provenance; sourceHintIds?: string[] } = {}): ChangeIntent[] {
  const selected = VISUAL_COMPOSITION_PRESETS.find((item) => item.id === presetId)
  if (!selected) throw new Error('COMPOSITION_PRESET_NOT_FOUND')
  const inputs = options.inputs ?? {}
  for (const key of selected.requiredInputs ?? []) if (inputs[key] === undefined) throw new Error('COMPOSITION_PRESET_INPUT_REQUIRED')
  const provenance: Provenance = options.provenance ?? { source: 'user_explicit', sourceIds: [presetId], createdBy: 'visual-composition-preset', createdAt: VISUAL_COMPOSITION_FIXED_TIME }
  const sourceHintIds = [...new Set([presetId, ...(options.sourceHintIds ?? [])])].sort()
  const changes = selected.changes.map((template, index) => {
    const requestedValue = valueForTemplate(template, inputs)
    return { schemaVersion: 'voce.change-intent/v1alpha1' as const, id: `composition.${presetId}.${index + 1}`, operation: template.operation, targetPath: template.targetPath, ...(requestedValue === undefined ? {} : { requestedValue }), sourceHintIds: [...sourceHintIds], importance: 'preferred' as const, provenance: clone(provenance) }
  })
  if (presetId === 'profile-silhouette' && inputs.silhouette === true) changes.push({ schemaVersion: 'voce.change-intent/v1alpha1' as const, id: `composition.${presetId}.silhouette`, operation: 'adjust', targetPath: 'lighting.subjectRendering', requestedValue: 'silhouette', sourceHintIds: [...sourceHintIds], importance: 'preferred' as const, provenance: clone(provenance) })
  return changes
}

export function compositionCatalogCanonicalJson(catalog: VisualCompositionCatalog = VISUAL_COMPOSITION_CATALOG): string {
  return canonicalize({ schemaVersion: catalog.schemaVersion, id: catalog.id, paths: catalog.paths, presets: catalog.presets } as unknown as JsonValue)
}
