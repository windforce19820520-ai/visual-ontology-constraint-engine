import type {
  JsonObject,
  JsonValue,
  OutputContract,
  PromptReferenceMapping,
  PromptSection,
  ProviderCapabilityProfile,
  ProviderRenderRequest,
} from '@voce-engine/contracts'
import { computeProviderRenderRequestHash, sha256 } from '@voce-engine/core'

/** Shared outbound prompt ceiling for every Playground provider. */
export const PLAYGROUND_PROMPT_CHARACTER_BUDGET = 4_000
export const PLAYGROUND_MATERIALIZER_VERSION = '1.1.0'

/**
 * The request handed to a provider adapter is deliberately a projection of an
 * accepted ProviderRenderRequest.  It is not a second prompt authoring API.
 * Every semantic field in this object comes from an accepted section,
 * parameter, or reference mapping.
 */
export interface NativeProviderRequest {
  schemaVersion: 'voce.playground-native-provider-request/v1alpha1'
  providerId: string
  profileId: string
  profileDigest: string
  prompt: string
  sections: ReadonlyArray<{
    id: string
    kind: string
    content: string
    importance: string
  }>
  parameters: Readonly<Record<string, JsonValue>>
  references: ReadonlyArray<{
    assetId: string
    contentHash: string
    role: string
    order: number
    required: boolean
    constraintIds: readonly string[]
    authorizedTargetPaths: readonly string[]
    typedMetadata?: JsonObject
    prohibitedTargetPaths: readonly string[]
    prohibitedTargetPathImportance: Readonly<Record<string, string>>
  }>
  forbidden: ReadonlyArray<{
    id: string
    text: string
    importance: string
    constraintIds: readonly string[]
  }>
  output: OutputContract
  /** Fixed protocol controls are not semantic instructions. */
  protocol: { count: 1; responseFormat: 'normalized' }
}

export interface MaterializationTrace {
  nativeInstructionId: string
  sourceKind: 'accepted_section' | 'accepted_parameter' | 'accepted_reference' | 'accepted_forbidden'
  sourceId: string
  constraintIds: readonly string[]
}

export interface MaterializationReceipt {
  schemaVersion: 'voce.playground-materialization-receipt/v1alpha1'
  requestHash: string
  materializerId: string
  materializerVersion: string
  materializerDigest: string
  nativeRequestHash: string
  acceptedSectionIds: readonly string[]
  acceptedParameterIds: readonly string[]
  acceptedReferenceMappingIds: readonly string[]
  acceptedConstraintIds: readonly string[]
  traces: readonly MaterializationTrace[]
  receiptHash: string
}

export interface MaterializationResult {
  request: NativeProviderRequest
  receipt: MaterializationReceipt
}

export interface ProviderRequestMaterializer {
  readonly id: string
  readonly version: string
  readonly digest: string
  materialize(request: ProviderRenderRequest): MaterializationResult
}

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T
}

function compare(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0
}

function sorted(values: readonly string[]): string[] {
  return [...new Set(values)].sort(compare)
}

function asJson(value: unknown): JsonValue {
  return JSON.parse(JSON.stringify(value)) as JsonValue
}

function materializerDigest(id: string, version: string, profile: ProviderCapabilityProfile & { playgroundProfileDigest?: string }): string {
  return sha256({ id, version, profileId: profile.id, profileDigest: profile.playgroundProfileDigest ?? profile.profileHash } as unknown as JsonValue)
}

function compactWhitespace(value: string): string {
  return value.trim().replace(/\s+/g, ' ')
}

function distinctText(values: readonly string[]): string[] {
  const seen = new Set<string>()
  const result: string[] = []
  for (const value of values) {
    const text = compactWhitespace(value)
    const key = text.toLocaleLowerCase('en-US')
    if (!text || seen.has(key)) continue
    seen.add(key)
    result.push(text)
  }
  return result
}

function isGeneratedReplacementSentence(text: string): boolean {
  return /^(?:Replace|Preserve) (?:wardrobe|character signature props)\b.*\bConstraint derived from\b/i.test(text)
}

function sectionPromptText(section: PromptSection): string | undefined {
  if (section.kind === 'reference' || section.kind === 'output' || section.kind === 'suggestion' || section.kind === 'forbidden') return undefined
  const original = section.content.trim()
  if (!original || /^Output_contract\b/.test(original) || isGeneratedReplacementSentence(original)) return undefined

  // A composition preset is explicit only when it was contributed by the
  // selected preset. Generic reference preservation produces one preferred
  // constraint for every camera path; those constraints are represented once
  // by referencePromptText() instead of accidentally activating every preset.
  if (section.kind === 'preferred' && !section.sourceIds.some((sourceId) => sourceId.startsWith('playground-composition:'))) return undefined
  if (/\b(?:declared|a|the)\s{2,}/i.test(original)) return undefined
  return compactWhitespace(original)
}

function metadataString(mapping: PromptReferenceMapping, key: string): string | undefined {
  const value = mapping.typedMetadata?.[key]
  return typeof value === 'string' && value ? value.replaceAll('_', ' ') : undefined
}

function mappingLabel(mapping: PromptReferenceMapping): string {
  return `ref-${String(mapping.order + 1).padStart(2, '0')}`
}

function collectiveLabel(mappings: readonly PromptReferenceMapping[]): string {
  if (mappings.length === 1) return mappingLabel(mappings[0])
  return `${mappingLabel(mappings[0])} through ${mappingLabel(mappings[mappings.length - 1])}`
}

function referencePromptText(mapping: PromptReferenceMapping, label = mappingLabel(mapping), plural = false): string {
  const verb = plural ? 'are' : 'is'
  const each = plural ? 'For each, ' : ''
  const category = metadataString(mapping, 'category')
  const structure = metadataString(mapping, 'structure')
  const accessoryType = metadataString(mapping, 'accessoryType')
  const placement = metadataString(mapping, 'placement')
  const side = metadataString(mapping, 'side')
  switch (mapping.role) {
    case 'person-identity':
      return `${label} ${verb} the person reference${plural ? 's' : ''}. Preserve ${plural ? 'these people\'s' : "this person's"} face, identity, body, original pose, and original framing unless an approved instruction explicitly replaces one of them.`
    case 'garment-top':
      return `${label} ${verb} ${category ?? 'upper garment'} reference${plural ? 's' : ''}. ${each}replace only the upper garment and preserve the original lower garment and unrelated regions.`
    case 'garment-bottom':
      return `${label} ${verb} ${category ?? 'lower garment'} reference${plural ? 's' : ''}. ${each}replace only the lower garment and preserve the original upper garment and unrelated regions.`
    case 'garment-full-body':
      return `${label} ${verb} ${category ?? 'full-body garment'} reference${plural ? 's' : ''}${structure ? ` (${structure})` : ''}. ${each}replace the upper and lower clothing together as one coherent garment or outfit.`
    case 'footwear-detail':
      return `${label} ${verb} footwear reference${plural ? 's' : ''}. ${each}replace only the footwear and preserve all unrelated regions.`
    case 'accessory-detail':
      return `${label} ${verb} ${accessoryType ?? 'accessory'} reference${plural ? 's' : ''}. ${each}add only its accessory at the ${placement ?? 'declared placement'} on the ${side ?? 'declared'} side without changing unrelated regions.`
    case 'fit-reference':
      return `${label} ${verb} fit reference${plural ? 's' : ''}. ${each}apply only its fit, silhouette, drape, length, and waist-position cues to clothing that is being replaced.`
    case 'pose':
      return `${label} ${verb} pose reference${plural ? 's' : ''}. ${each}use only its body pose, orientation, hand positions, and action.`
    case 'character-design':
      return `${label} ${verb} character-design reference${plural ? 's' : ''}. ${each}reproduce its hairstyle, costume, visible accessories, and signature props as a real photograph, but never take the person's face or identity from it.`
    case 'signature-prop-detail':
      return `${label} ${verb} signature-prop detail reference${plural ? 's' : ''}. ${each}reproduce only its prop's defining shape, proportions, colors, material, and details.`
    case 'critical-detail':
      return `${label} ${verb} critical-detail reference${plural ? 's' : ''}. ${each}reproduce only its declared costume, pattern, or accessory detail where it belongs.`
    default:
      return `${label} ${verb} approved ${mapping.role.replaceAll('-', ' ')} reference${plural ? 's' : ''}. ${each}use it only for its authorized contribution.`
  }
}

function groupedReferencePromptTexts(mappings: readonly PromptReferenceMapping[]): string[] {
  const groups = new Map<string, PromptReferenceMapping[]>()
  for (const mapping of mappings) {
    const key = `${mapping.role}\u0000${JSON.stringify(mapping.typedMetadata ?? {})}`
    const group = groups.get(key)
    if (group) group.push(mapping)
    else groups.set(key, [mapping])
  }
  return [...groups.values()].map((group) => referencePromptText(group[0], collectiveLabel(group), group.length > 1))
}

function prohibitedDomain(path: string): string {
  if (path === 'person.identity' || path.startsWith('person.identity.')) return 'the person\'s face or identity'
  if (path === 'pose' || path.startsWith('pose.')) return 'pose or action'
  if (path === 'environment.background' || path.startsWith('environment.')) return 'background or environment'
  if (path === 'style' || path.startsWith('style.')) return 'visual style'
  if (path.startsWith('camera.') || path.startsWith('lighting.')) return 'camera, composition, or lighting'
  if (path === 'wardrobe.upper' || path.startsWith('wardrobe.upper.')) return 'upper clothing'
  if (path === 'wardrobe.lower' || path.startsWith('wardrobe.lower.')) return 'lower clothing'
  if (path === 'wardrobe.fullBody' || path.startsWith('wardrobe.fullBody.')) return 'full-body clothing'
  if (path === 'wardrobe.footwear' || path.startsWith('wardrobe.footwear.')) return 'footwear'
  if (path.startsWith('wardrobe.fit.')) return 'clothing fit'
  if (path.startsWith('wardrobe.accessories')) return 'other accessories'
  if (path.startsWith('character.hair')) return 'character hair'
  if (path.startsWith('character.costume')) return 'character costume'
  if (path.startsWith('character.accessories')) return 'character accessories'
  if (path.startsWith('character.signatureProps')) return 'signature props'
  if (path.startsWith('character.criticalDetails')) return 'other character details'
  return path.replaceAll('.', ' ')
}

function groupedProhibitionPromptTexts(mappings: readonly PromptReferenceMapping[]): string[] {
  const groups = new Map<string, { mappings: PromptReferenceMapping[]; domains: string[] }>()
  const hasDeclaredAccessory = mappings.some((mapping) => mapping.role === 'accessory-detail')
  for (const mapping of mappings) {
    const domains = distinctText((mapping.prohibitedTargetPaths ?? []).map(prohibitedDomain))
    if (!domains.length) continue
    const key = domains.join('\u0000')
    const group = groups.get(key)
    if (group) group.mappings.push(mapping)
    else groups.set(key, { mappings: [mapping], domains })
  }
  return [...groups.values()].flatMap(({ mappings: group, domains }) => {
    const removesOriginalAccessories = hasDeclaredAccessory
      && group.some((mapping) => mapping.role === 'person-identity' && mapping.prohibitedTargetPaths?.some((path) => path.startsWith('wardrobe.accessories')))
    const remainingDomains = removesOriginalAccessories ? domains.filter((domain) => domain !== 'other accessories') : domains
    return [
      ...(removesOriginalAccessories ? ['Remove all original accessories from the person reference, including the original handbag, shoulder bag, and jewelry. Add only the declared accessory references.'] : []),
      ...(remainingDomains.length ? [`Do not let ${collectiveLabel(group)} supply or change ${remainingDomains.join(', ')}.`] : []),
    ]
  })
}

function outputPromptText(output: OutputContract): string {
  const count = output.cardinality?.max ?? 1
  const background = output.background === 'transparent' ? 'transparent' : 'opaque'
  return `Return exactly ${count} ${background} image${count === 1 ? '' : 's'}.`
}

function compactProviderPrompt(request: ProviderRenderRequest): string {
  const orderedSections = [...request.sections].sort((left, right) => left.order - right.order || compare(left.id, right.id))
  const orderedMappings = [...request.referenceMappings].sort((left, right) => left.order - right.order || compare(left.id, right.id))
  const mappedPrefixes = orderedMappings.map((mapping) => `Reference ${mapping.label} `)
  const nonReferenceProhibitions = (request.forbidden ?? [])
    .filter((item) => !mappedPrefixes.some((prefix) => item.text.startsWith(prefix)))
    .map((item) => item.text)
  const prompt = distinctText([
    ...orderedSections.map(sectionPromptText).filter((text): text is string => text !== undefined),
    ...groupedReferencePromptTexts(orderedMappings),
    ...groupedProhibitionPromptTexts(orderedMappings),
    ...nonReferenceProhibitions,
    outputPromptText(request.output),
  ]).join('\n')
  if (prompt.length > PLAYGROUND_PROMPT_CHARACTER_BUDGET) throw new Error(`MATERIALIZER_PROMPT_BUDGET_EXCEEDED:${prompt.length}`)
  return prompt
}

class AcceptedRequestMaterializer implements ProviderRequestMaterializer {
  readonly digest: string

  constructor(readonly id: string, readonly version: string, private readonly profile: ProviderCapabilityProfile & { playgroundProfileDigest?: string }) {
    this.digest = materializerDigest(id, version, profile)
  }

  materialize(request: ProviderRenderRequest): MaterializationResult {
    if (computeProviderRenderRequestHash(request) !== request.requestHash) throw new Error('MATERIALIZER_REQUEST_HASH_INVALID')
    if (request.targetCapabilityProfile.id !== this.profile.id || request.targetCapabilityProfile.digest !== this.profile.profileHash) throw new Error('MATERIALIZER_PROFILE_BINDING_MISMATCH')
    if (request.targetAdapter.id !== this.profile.adapterId || request.targetAdapter.digest !== this.profile.adapterDigest) throw new Error('MATERIALIZER_ADAPTER_BINDING_MISMATCH')

    const sections = [...request.sections].sort((left, right) => left.order - right.order || compare(left.id, right.id)).map((section) => ({
      id: section.id,
      kind: section.kind,
      content: section.content,
      importance: section.importance,
    }))
    const parameters = Object.fromEntries([...request.parameters].sort((left, right) => compare(left.id, right.id)).map((parameter) => [parameter.name, clone(parameter.value)]))
    const references = [...request.referenceMappings].sort((left, right) => left.order - right.order || compare(left.id, right.id)).map((mapping) => ({
      assetId: mapping.assetId,
      contentHash: mapping.contentHash,
      role: mapping.role,
      order: mapping.order,
      required: mapping.required,
      constraintIds: sorted(mapping.constraintIds),
      authorizedTargetPaths: sorted(mapping.authorizedTargetPaths ?? []),
      ...(mapping.typedMetadata === undefined ? {} : { typedMetadata: clone(mapping.typedMetadata) }),
      prohibitedTargetPaths: sorted(mapping.prohibitedTargetPaths ?? []),
      prohibitedTargetPathImportance: Object.fromEntries(Object.entries(mapping.prohibitedTargetPathImportance ?? {}).sort(([left], [right]) => compare(left, right))),
    }))
    const forbidden = [...(request.forbidden ?? [])].sort((left, right) => compare(left.id, right.id)).map((item) => ({ id: item.id, text: item.text, importance: item.importance, constraintIds: sorted(item.constraintIds) }))
    const nativeBase: Omit<NativeProviderRequest, 'prompt'> = {
      schemaVersion: 'voce.playground-native-provider-request/v1alpha1',
      providerId: this.id,
      profileId: this.profile.id,
      profileDigest: this.profile.profileHash,
      sections,
      parameters,
      references,
      forbidden,
      output: clone(request.output),
      protocol: { count: 1, responseFormat: 'normalized' },
    }
    // Keep the complete accepted structures above for audit. The outbound
    // provider text is a deterministic, provider-neutral semantic projection:
    // duplicate path-level instructions are merged without inventing intent.
    const native = { ...nativeBase, prompt: compactProviderPrompt(request) }
    const nativeRequest = clone(native)
    const traces: MaterializationTrace[] = []
    for (const section of sections) traces.push({ nativeInstructionId: `section:${section.id}`, sourceKind: 'accepted_section', sourceId: section.id, constraintIds: sorted(request.sections.find((item) => item.id === section.id)?.constraintIds ?? []) })
    for (const parameter of [...request.parameters].sort((left, right) => compare(left.id, right.id))) traces.push({ nativeInstructionId: `parameter:${parameter.id}`, sourceKind: 'accepted_parameter', sourceId: parameter.id, constraintIds: sorted(parameter.constraintIds) })
    for (const mapping of [...request.referenceMappings].sort((left, right) => left.order - right.order || compare(left.id, right.id))) traces.push({ nativeInstructionId: `reference:${mapping.id}`, sourceKind: 'accepted_reference', sourceId: mapping.id, constraintIds: sorted(mapping.constraintIds) })
    for (const item of forbidden) traces.push({ nativeInstructionId: `forbidden:${item.id}`, sourceKind: 'accepted_forbidden', sourceId: item.id, constraintIds: sorted(item.constraintIds) })
    const receiptBase: Omit<MaterializationReceipt, 'receiptHash'> = {
      schemaVersion: 'voce.playground-materialization-receipt/v1alpha1',
      requestHash: request.requestHash,
      materializerId: this.id,
      materializerVersion: this.version,
      materializerDigest: this.digest,
      nativeRequestHash: sha256(asJson(nativeRequest)),
      acceptedSectionIds: sections.map((section) => section.id),
      acceptedParameterIds: [...request.parameters].sort((left, right) => compare(left.id, right.id)).map((parameter) => parameter.id),
      acceptedReferenceMappingIds: [...request.referenceMappings].sort((left, right) => left.order - right.order || compare(left.id, right.id)).map((mapping) => mapping.id),
      acceptedConstraintIds: sorted([...request.sections.flatMap((section) => section.constraintIds), ...request.parameters.flatMap((parameter) => parameter.constraintIds), ...request.referenceMappings.flatMap((mapping) => mapping.constraintIds), ...forbidden.flatMap((item) => item.constraintIds)]),
      traces,
    }
    return { request: nativeRequest, receipt: { ...receiptBase, receiptHash: sha256(asJson(receiptBase)) } }
  }
}

export function createProviderRequestMaterializer(id: string, version: string, profile: ProviderCapabilityProfile & { playgroundProfileDigest?: string }): ProviderRequestMaterializer {
  if (!id || !version) throw new Error('MATERIALIZER_ID_INVALID')
  return new AcceptedRequestMaterializer(id, version, profile)
}

export function materializationContainsOnlyAcceptedSources(result: MaterializationResult): boolean {
  return result.receipt.traces.every((trace) => trace.sourceKind.startsWith('accepted_'))
}
