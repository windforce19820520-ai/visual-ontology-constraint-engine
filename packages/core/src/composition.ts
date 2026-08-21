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
  optionalInputs?: string[]
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
const stringPath = (path: string, defaultImportance: OntologyPathDefinition['defaultImportance'] = 'preferred'): OntologyPathDefinition => ({ path, valueKind: 'string', cardinality: 'one', defaultImportance })
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
  enumPath('camera.framing.focusTarget', ['eye', 'face_detail', 'costume_detail', 'prop_detail']),
  boolPath('camera.framing.crop.keepHead'), boolPath('camera.framing.crop.keepHands'), boolPath('camera.framing.crop.keepBothFeet'), boolPath('camera.framing.crop.keepProduct'), boolPath('camera.framing.crop.keepSignatureProp'),
  enumPath('camera.view.elevation', ['eye_level', 'low_angle', 'high_angle', 'birds_eye']), enumPath('camera.view.relationship', ['front', 'three_quarter', 'profile', 'rear', 'over_the_shoulder']),
  enumPath('camera.composition.overShoulder.targetRole', ['declared_subject', 'secondary_subject', 'environment_or_object']),
  enumPath('camera.roll.mode', ['level', 'dutch_left', 'dutch_right']), enumPath('camera.lens.focalLengthClass', ['ultra_wide', 'wide', 'normal', 'telephoto', 'super_telephoto']), enumPath('camera.lens.perspective', ['expanded', 'natural', 'compressed']),
  boolPath('camera.composition.patterns.centeredSymmetry'), boolPath('camera.composition.patterns.ruleOfThirds'), boolPath('camera.composition.patterns.leadingLines'), boolPath('camera.composition.patterns.diagonal'), boolPath('camera.composition.patterns.sCurve'), boolPath('camera.composition.patterns.triangle'),
  enumPath('camera.composition.patterns.triangleSource', ['subject_pose', 'subject_and_prop', 'environment']),
  enumPath('camera.composition.placement', ['center', 'left_third', 'right_third', 'upper_third', 'lower_third']), enumPath('camera.composition.negativeSpace', ['none', 'left', 'right', 'above', 'below', 'surrounding']),
  boolPath('camera.composition.leadingRoom.enabled'), enumPath('camera.composition.leadingRoom.direction', ['left', 'right', 'forward', 'up', 'down']),
  enumPath('camera.composition.foregroundTreatment', ['clear', 'soft_obstruction', 'strong_obstruction']), boolPath('camera.composition.framingDevices.frameWithinFrame'), boolPath('camera.composition.framingDevices.environmentalPortrait'),
  boolPath('camera.composition.reflection.enabled'), enumPath('camera.composition.reflection.surface', ['mirror', 'glass', 'water', 'screen', 'polished_surface']), enumPath('camera.composition.reflection.role', ['supporting', 'co_primary', 'primary']), boolPath('camera.composition.reflection.physicalConsistency'), enumPath('camera.composition.reflection.presentation', ['surface_reflection', 'face_visible_in_mirror']), enumPath('camera.composition.reflection.subjectSurfaceRelationship', ['on_dry_shore_beside_water', 'in_water', 'above_water', 'on_reflective_surface']), enumPath('camera.composition.environmentRelationship', ['isolated', 'contextual', 'environment_dominant']), stringPath('camera.composition.subjectEnvironmentPlacement'),
  enumPath('lighting.subjectRendering', ['natural', 'silhouette']),
  stringPath('environment.background'),
]

const preset = (id: string, category: VisualCompositionPreset['category'], changes: CompositionChangeTemplate[], requiredInputs: string[] = [], compatibilityHints: string[] = [], optionalInputs: string[] = []): VisualCompositionPreset => ({ id, labelKey: `visualComposition.${id}.label`, descriptionKey: `visualComposition.${id}.description`, category, ...(compatibilityHints.length ? { compatibilityHints } : {}), changes, ...(requiredInputs.length ? { requiredInputs } : {}), ...(optionalInputs.length ? { optionalInputs } : {}) })
const defaultBackground = (description: string): CompositionChangeTemplate => ({ operation: 'create', targetPath: 'environment.background', requestedValue: description })
const subjectEnvironmentPlacement = (description: string): CompositionChangeTemplate => ({ operation: 'adjust', targetPath: 'camera.composition.subjectEnvironmentPlacement', requestedValue: description })
const defaultScene = (background: string, placement: string): CompositionChangeTemplate[] => [subjectEnvironmentPlacement(placement), defaultBackground(background)]

export const VISUAL_COMPOSITION_PRESETS: VisualCompositionPreset[] = [
  preset('extreme-close-up', 'framing', [{ operation: 'replace', targetPath: 'camera.framing.shotScale', requestedValue: 'extreme_close_up' }, { operation: 'adjust', targetPath: 'camera.framing.focusTarget', requestedValue: 'eye' }]),
  preset('close-up', 'framing', [{ operation: 'replace', targetPath: 'camera.framing.shotScale', requestedValue: 'close_up' }]),
  preset('head-and-shoulders', 'framing', [{ operation: 'replace', targetPath: 'camera.framing.shotScale', requestedValue: 'head_and_shoulders' }, { operation: 'adjust', targetPath: 'camera.framing.crop.keepHead', requestedValue: true }]),
  preset('bust-shot', 'framing', [{ operation: 'replace', targetPath: 'camera.framing.shotScale', requestedValue: 'bust_shot' }, { operation: 'adjust', targetPath: 'camera.framing.crop.keepHead', requestedValue: true }]),
  preset('medium-close-up', 'framing', [{ operation: 'replace', targetPath: 'camera.framing.shotScale', requestedValue: 'medium_close_up' }]),
  preset('medium-shot', 'framing', [{ operation: 'replace', targetPath: 'camera.framing.shotScale', requestedValue: 'medium_shot' }]),
  preset('knee-shot', 'framing', [{ operation: 'replace', targetPath: 'camera.framing.shotScale', requestedValue: 'knee_shot' }]),
  preset('full-shot', 'framing', [{ operation: 'replace', targetPath: 'camera.framing.shotScale', requestedValue: 'full_shot' }, { operation: 'adjust', targetPath: 'camera.framing.crop.keepBothFeet', requestedValue: true }]),
  preset('long-shot', 'framing', [{ operation: 'replace', targetPath: 'camera.framing.shotScale', requestedValue: 'long_shot' }, { operation: 'adjust', targetPath: 'camera.composition.environmentRelationship', requestedValue: 'contextual' }, ...defaultScene('a spacious lakeside promenade with trees, a visible shoreline, and enough depth for the complete person to remain readable', 'Keep the complete person supported on one visible promenade ground plane, separated from the water by the shoreline, with enough space around the body to read the location.')]),
  preset('extreme-long-shot', 'framing', [{ operation: 'replace', targetPath: 'camera.framing.shotScale', requestedValue: 'extreme_long_shot' }, { operation: 'adjust', targetPath: 'camera.composition.environmentRelationship', requestedValue: 'environment_dominant' }, ...defaultScene('an expansive lakeside park with broad water, distant shoreline, open sky, and a clearly readable sense of scale', 'Use the complete person as a small scale anchor on a clearly visible path or shore ground plane; never place the person in open water, sky, or unsupported space.')]),
  preset('low-angle', 'view', [{ operation: 'adjust', targetPath: 'camera.view.elevation', requestedValue: 'low_angle' }]),
  preset('high-angle', 'view', [{ operation: 'adjust', targetPath: 'camera.view.elevation', requestedValue: 'high_angle' }]),
  preset('birds-eye-view', 'view', [{ operation: 'adjust', targetPath: 'camera.view.elevation', requestedValue: 'birds_eye' }, ...defaultScene('a paved lakeside plaza with paths, shoreline edges, and ground geometry that remain legible from directly above', 'Place the person on the visible paved ground plane below the top-down camera, with paths and shoreline edges surrounding rather than cutting through the body.')]),
  preset('over-the-shoulder', 'view', [{ operation: 'adjust', targetPath: 'camera.view.relationship', requestedValue: 'over_the_shoulder' }, { operation: 'adjust', targetPath: 'camera.composition.overShoulder.targetRole', requestedValue: 'declared_subject' }, ...defaultScene('a lakeside overlook with clear depth beyond the anonymous foreground shoulder and an unobstructed view toward the declared person', 'Put one anonymous shoulder close to the camera and the declared person farther away on a visibly supported overlook or path, with open depth between them and no duplicated declared person.')], [], ['foreground-shoulder-subject-or-declared-equivalent']),
  preset('dutch-angle', 'view', [{ operation: 'adjust', targetPath: 'camera.roll.mode', valueFrom: 'direction' }], ['direction']),
  preset('centered-symmetry', 'layout', [{ operation: 'adjust', targetPath: 'camera.composition.patterns.centeredSymmetry', requestedValue: true }, { operation: 'adjust', targetPath: 'camera.composition.placement', requestedValue: 'center' }, ...defaultScene('a symmetrical lakeside pavilion walkway with matching columns, railings, and balanced left-right scenery', 'Place the person on the walkway centerline with both feet supported on the floor; keep matching architecture around and behind the body without merging the person into columns or rails.')]),
  preset('rule-of-thirds', 'layout', [{ operation: 'adjust', targetPath: 'camera.composition.patterns.ruleOfThirds', requestedValue: true }, { operation: 'adjust', targetPath: 'camera.composition.placement', requestedValue: 'right_third' }]),
  preset('leading-lines', 'layout', [{ operation: 'adjust', targetPath: 'camera.composition.patterns.leadingLines', requestedValue: true }, ...defaultScene('a lakeside boardwalk whose railings, paving seams, and shoreline edges visibly converge toward the person', 'Stand the person securely on the boardwalk at the visual convergence point; let rails and paving seams lead toward the person without passing through or replacing body parts.')], [], ['suitable-scene-geometry-or-review']),
  preset('leading-room', 'layout', [{ operation: 'adjust', targetPath: 'camera.composition.leadingRoom.enabled', requestedValue: true }, { operation: 'adjust', targetPath: 'camera.composition.leadingRoom.direction', valueFrom: 'direction' }], ['direction']),
  preset('diagonal-composition', 'layout', [{ operation: 'adjust', targetPath: 'camera.composition.patterns.diagonal', requestedValue: true }, ...defaultScene('outdoor stone steps and diagonal railings beside a landscaped lake, arranged as one controlled dominant diagonal', 'Support the person on one step or landing while stairs or railings create the dominant diagonal around the figure; do not tilt, stretch, or embed the body into the architecture.')]),
  preset('s-curve-composition', 'layout', [{ operation: 'adjust', targetPath: 'camera.composition.patterns.sCurve', requestedValue: true }, ...defaultScene('a landscaped lakeside garden with one clearly visible S-shaped path leading through the scene toward the person', 'Place the person on solid ground beside or at the visual end of the S-shaped path so the path leads toward the figure without running through the body.')]),
  preset('triangle-composition', 'layout', [{ operation: 'adjust', targetPath: 'camera.composition.patterns.triangle', requestedValue: true }, { operation: 'adjust', targetPath: 'camera.composition.patterns.triangleSource', requestedValue: 'subject_pose' }]),
  preset('negative-space', 'layout', [{ operation: 'adjust', targetPath: 'camera.composition.negativeSpace', valueFrom: 'direction' }, ...defaultScene('an uncluttered lakeside scene with broad open water and sky that can provide the selected area of clean negative space', 'Keep the person physically supported on solid shore at the edge opposite the selected negative-space region; use water or sky as empty space without making the person float in it.')], ['direction']),
  preset('frame-within-frame', 'depth', [{ operation: 'adjust', targetPath: 'camera.composition.framingDevices.frameWithinFrame', requestedValue: true }, ...defaultScene('a lakeside pavilion with one clear archway, doorway, or window opening that physically surrounds the person as an inner frame', 'Place the person beyond and fully inside one architectural opening as seen by the camera; keep the opening edges in front of and separate from the body without clipping or fusing with it.')]),
  preset('foreground-obstruction', 'depth', [{ operation: 'adjust', targetPath: 'camera.composition.foregroundTreatment', requestedValue: 'soft_obstruction' }, ...defaultScene('a lakeside garden with nearby leaves or flowers available as a soft out-of-focus foreground layer while the person stays unobstructed', 'Place soft foliage close to the camera, the person farther away on a visible garden path, and clear depth between them; foreground elements may touch frame edges but not cover critical person details.')]),
  preset('profile-silhouette', 'view', [{ operation: 'adjust', targetPath: 'camera.view.relationship', requestedValue: 'profile' }, ...defaultScene('a lakeside horizon with a bright, uncluttered sunset sky that clearly separates the person’s side profile', 'Support the person on a visible shore or ridge, with the bright sky behind the side profile and a clean horizon that does not cut through the face.')], [], [], ['silhouette']),
  preset('reflection-composition', 'depth', [{ operation: 'adjust', targetPath: 'camera.composition.reflection.enabled', requestedValue: true }, { operation: 'adjust', targetPath: 'camera.composition.reflection.surface', requestedValue: 'water' }, { operation: 'adjust', targetPath: 'camera.composition.reflection.role', requestedValue: 'co_primary' }, { operation: 'adjust', targetPath: 'camera.composition.reflection.physicalConsistency', requestedValue: true }, { operation: 'adjust', targetPath: 'camera.composition.reflection.presentation', requestedValue: 'surface_reflection' }, { operation: 'adjust', targetPath: 'camera.composition.reflection.subjectSurfaceRelationship', requestedValue: 'on_dry_shore_beside_water' }, ...defaultScene('calm foreground lake water facing a dry far shoreline where the person can stand, with enough visible water below the person to carry a reflection', 'Aim the camera across foreground water toward the person standing on the dry far bank. Show the shoreline directly below both feet and align the water reflection directly below the person on the same vertical image axis.')]),
  preset('mirror-composition', 'depth', [{ operation: 'adjust', targetPath: 'camera.composition.reflection.enabled', requestedValue: true }, { operation: 'adjust', targetPath: 'camera.composition.reflection.surface', requestedValue: 'mirror' }, { operation: 'adjust', targetPath: 'camera.composition.reflection.role', requestedValue: 'primary' }, { operation: 'adjust', targetPath: 'camera.composition.reflection.physicalConsistency', requestedValue: true }, { operation: 'adjust', targetPath: 'camera.composition.reflection.presentation', requestedValue: 'face_visible_in_mirror' }, ...defaultScene('an elegant theatrical dressing room with one large ornate gold-framed full-length mirror, deep navy curtains, dark refined furnishings, and warm golden practical lighting', 'Place the camera just behind and slightly over the person’s shoulder. Show only a softly out-of-focus partial back, shoulder, and back of the hairstyle at one foreground edge; make the sharp front-facing reflection inside the ornate mirror the dominant subject. Keep both views connected by one physically plausible mirror angle and the same pose, action, costume, hair, accessories, and held props.')]),
  preset('telephoto-compression', 'lens', [{ operation: 'adjust', targetPath: 'camera.lens.focalLengthClass', requestedValue: 'telephoto' }, { operation: 'adjust', targetPath: 'camera.lens.perspective', requestedValue: 'compressed' }, ...defaultScene('a long tree-lined lakeside promenade with repeating railings and layered distant scenery that visibly compress under a telephoto lens', 'Place the person on the receding promenade ground plane along the lens axis, with repeated rails and trees layered in front of and behind the person without intersecting the body.')]),
  preset('environmental-portrait', 'depth', [{ operation: 'adjust', targetPath: 'camera.composition.framingDevices.environmentalPortrait', requestedValue: true }, { operation: 'adjust', targetPath: 'camera.composition.environmentRelationship', requestedValue: 'contextual' }, ...defaultScene('a spacious lakeside promenade with trees, a visible shoreline, and enough depth for the complete person to remain readable', 'Keep the complete person supported on one visible promenade ground plane, separated from the water by the shoreline, with enough space around the body to read the location.')]),
]

function readableInput(value: JsonValue | undefined, fallback: string): string {
  return typeof value === 'string' ? value.replaceAll('_', ' ') : fallback
}

/** Observable, provider-neutral acceptance language for every public composition preset. */
export function visualCompositionEvaluationExpectation(presetId: string, inputs: Record<string, JsonValue> = {}): string {
  const direction = readableInput(inputs.direction, 'selected direction')
  switch (presetId) {
    case 'extreme-close-up': return 'One eye fills most of the frame, with the iris, lashes, and surrounding facial detail clearly visible.'
    case 'close-up': return 'The complete face is the dominant subject, with expression and facial detail clearly readable.'
    case 'head-and-shoulders': return 'The complete head, neck, and both shoulders remain visible in a close portrait crop.'
    case 'bust-shot': return 'The person is framed from the head to around the chest, leaving enough room for visible hand gestures.'
    case 'medium-close-up': return 'The person is framed from the head to the upper torso, with only a modest amount of environment.'
    case 'medium-shot': return 'The person is framed from the head to around the waist, balancing expression, gesture, and environment.'
    case 'knee-shot': return 'The person is framed from the head to around the knees without accidentally cutting through the knees.'
    case 'full-shot': return 'The entire person is visible from head to both feet, with neither foot cropped.'
    case 'long-shot': return 'The complete person remains recognizable and supported on one visible ground plane while the surrounding environment occupies most of the frame.'
    case 'extreme-long-shot': return 'The environment and spatial scale dominate; the complete person appears small as an intentional scale anchor on visible ground, never floating in water or sky.'
    case 'low-angle': return 'The camera looks upward from below the person, producing a clear low-angle perspective.'
    case 'high-angle': return 'The camera looks downward from an elevated diagonal position while the person remains readable.'
    case 'birds-eye-view': return 'The camera uses a near-vertical top-down view; the person is supported on the visible ground plane and surrounding paths or shore edges do not cut through the body.'
    case 'over-the-shoulder': return 'A partial anonymous shoulder is close to the camera while the declared person stands farther away on supported ground, with clear depth between them and no duplicated declared person.'
    case 'dutch-angle': return `The entire frame is intentionally tilted toward the ${direction}, while the person and scene remain coherent.`
    case 'centered-symmetry': return 'The person stands on the central floor or walkway axis and the architecture remains separate from the body while the left and right sides are visibly balanced.'
    case 'rule-of-thirds': return 'The person is placed on the right third line or intersection, with deliberate open context on the left.'
    case 'leading-lines': return 'The person is supported at the visual convergence point while visible roads, rails, or edges guide attention toward the figure without passing through body parts.'
    case 'leading-room': return `Open space is preserved in the ${direction} direction of the person's gaze or movement.`
    case 'diagonal-composition': return 'The person is supported on one step or landing while stairs, rails, or scene geometry form a dominant diagonal without tilting or embedding the body.'
    case 's-curve-composition': return 'The person stands on solid ground beside or at the visual end of an S-shaped path that leads the eye toward the figure without running through it.'
    case 'triangle-composition': return 'The single person’s head, shoulders, and body or limbs form a stable triangular arrangement without adding extra people.'
    case 'negative-space': return `The person is supported on solid ground opposite a large uncluttered region ${direction} the person; water or sky may provide empty space but must not make the person float.`
    case 'frame-within-frame': return 'The person is fully visible beyond and inside one environmental opening; its foreground edges surround the person without clipping or merging into the body.'
    case 'foreground-obstruction': return 'Soft foreground elements remain close to the camera while the person stands farther away on visible ground, with clear depth and no hidden critical details.'
    case 'profile-silhouette': return inputs.silhouette === true
      ? 'A clean side-profile silhouette is supported on visible ground and clearly separated from the bright sky by an unobstructed horizon.'
      : 'A clear side profile is supported on visible ground, with the horizon kept away from the face while facial contour, hair silhouette, costume, and identity remain recognizable.'
    case 'reflection-composition': return 'The camera looks across calm foreground water toward the person standing on a dry far bank. A visible shoreline sits directly below both feet, and the water reflection aligns directly below the person on the same vertical image axis. The reflection shows the same person at the same instant and may be partially cropped, but the person, costume, props, water, and reflection must remain physically separate.'
    case 'mirror-composition': return 'A softly out-of-focus partial back and shoulder occupy one foreground edge while the sharp front-facing reflection is the dominant subject inside one ornate full-length mirror. Both views show the same person, pose, action, costume, hair, accessories, and held props at the same instant and differ only by physical reversal; no duplicate person or alternative action.'
    case 'telephoto-compression': return 'The person stands on a receding ground corridor along the lens axis while a telephoto view stacks foreground and background layers without intersecting the body.'
    case 'environmental-portrait': return 'The person remains identifiable and physically supported in a usable part of the location while surrounding architecture, landscape, or objects explain the setting without swallowing the subject.'
    default: throw new Error('COMPOSITION_PRESET_NOT_FOUND')
  }
}

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
