import type {
  JsonObject,
  JsonValue,
  OutputContract,
  ProviderCapabilityProfile,
  ProviderRenderRequest,
} from '@voce-engine/contracts'
import { computeProviderRenderRequestHash, sha256 } from '@voce-engine/core'

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

function materializerDigest(id: string, version: string, profile: ProviderCapabilityProfile): string {
  return sha256({ id, version, profileId: profile.id, profileDigest: profile.profileHash } as unknown as JsonValue)
}

class AcceptedRequestMaterializer implements ProviderRequestMaterializer {
  readonly digest: string

  constructor(readonly id: string, readonly version: string, private readonly profile: ProviderCapabilityProfile) {
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
    // The prompt is only the ordered, accepted section projection.  No
    // scenario name, raw browser text, or provider gloss is introduced here.
    const native = { ...nativeBase, prompt: sections.map((section) => section.content).join('\n') }
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

export function createProviderRequestMaterializer(id: string, version: string, profile: ProviderCapabilityProfile): ProviderRequestMaterializer {
  if (!id || !version) throw new Error('MATERIALIZER_ID_INVALID')
  return new AcceptedRequestMaterializer(id, version, profile)
}

export function materializationContainsOnlyAcceptedSources(result: MaterializationResult): boolean {
  return result.receipt.traces.every((trace) => trace.sourceKind.startsWith('accepted_'))
}
