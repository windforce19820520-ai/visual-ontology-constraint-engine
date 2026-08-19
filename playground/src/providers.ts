import type { ProviderCapabilityProfile, ProviderRenderRequest } from '@voce-engine/contracts'
import { computeProviderCapabilityProfileHash, sha256 } from '@voce-engine/core'

export type PlaygroundProviderProfileId = 'mock-image' | 'seedream-4.0' | 'grok-imagine-image-quality'
export type CredentialMode = 'none' | 'user_ephemeral'

export interface PlaygroundProviderProfile extends ProviderCapabilityProfile {
  provider: 'mock' | 'seedream' | 'grok-imagine'
  model: string
  endpoint: string
  credentialMode: 'none' | 'user_ephemeral'
  inputMaxBytesPerReference?: number
  inputMaxWidth?: number
  inputMaxHeight?: number
  inputAspectRatio?: { min: number; max: number }
  pricePerImage: number
  currency: 'USD' | 'CNY'
  rateLimit: { requestsPerSecond?: number; imagesPerMinute?: number }
  dailyBudgetDefault: number
  documentation: readonly { label: string; url: string }[]
  capabilityVerifiedAt: string
}

function profile<T extends Omit<PlaygroundProviderProfile, 'profileHash'>>(base: T): PlaygroundProviderProfile {
  return { ...base, profileHash: computeProviderCapabilityProfileHash(base) }
}

const adapterDigest = (id: string, version: string): string => sha256({ adapter: id, version } as never)

export const MOCK_PLAYGROUND_PROFILE = profile({
  schemaVersion: 'voce.provider-capability-profile/v1alpha1',
  id: 'mock-image',
  version: '1.0.0',
  versionSummary: 'Deterministic in-memory mock. It never contacts a Provider.',
  adapterId: 'mock.image-generator',
  adapterDigest: sha256({ fixture: 'playground-mock', version: '1.0.0' } as never),
  verificationStatus: 'verified',
  maximumReferenceCount: 8,
  maximumTotalReferenceBytes: 32_000_000,
  maximumBytesPerReference: 15_000_000,
  allowedReferenceMediaTypes: ['image/jpeg', 'image/png', 'image/webp'],
  allowedReferenceRoles: ['person-identity', 'garment-detail', 'wearing-effect', 'footwear-detail', 'character-design', 'signature-prop-detail', 'critical-detail', 'pose'],
  referenceOrdering: 'stable',
  referenceRoleOrder: ['person-identity', 'character-design', 'garment-detail', 'wearing-effect', 'footwear-detail', 'signature-prop-detail', 'critical-detail', 'pose'],
  supportsMultipleReferences: true,
  supportsEditing: true,
  supportsBatchOutput: false,
  outputMediaTypes: ['image/png'],
  supportsTransparentOutput: false,
  supportsAlpha: false,
  knownIncompatibilities: [],
  timeoutMs: 30_000,
  streaming: false,
  destination: 'mock://playground',
  dataCategories: ['reference_image', 'prompt', 'generated_image'],
  provider: 'mock',
  model: 'mock-image',
  endpoint: 'mock://playground',
  credentialMode: 'none',
  pricePerImage: 0,
  currency: 'USD',
  rateLimit: { requestsPerSecond: 10, imagesPerMinute: 120 },
  dailyBudgetDefault: 0,
  documentation: [],
  capabilityVerifiedAt: '2026-08-19',
})

/** Official Volcengine model/API profile, transport intentionally disabled. */
export const SEEDREAM_4_PROFILE = profile({
  schemaVersion: 'voce.provider-capability-profile/v1alpha1',
  id: 'seedream-4.0',
  version: '250828',
  versionSummary: 'Seedream 4.0 image generation/editing profile; official limits checked 2026-08-19.',
  adapterId: 'seedream.image-generator',
  adapterDigest: adapterDigest('seedream.image-generator', '1.0.0'),
  verificationStatus: 'verified',
  maximumReferenceCount: 10,
  maximumTotalReferenceBytes: 150_000_000,
  maximumBytesPerReference: 15_000_000,
  allowedReferenceMediaTypes: ['image/jpeg', 'image/png'],
  allowedReferenceRoles: ['person-identity', 'garment-detail', 'wearing-effect', 'footwear-detail', 'character-design', 'signature-prop-detail', 'critical-detail', 'pose'],
  referenceOrdering: 'stable',
  referenceRoleOrder: ['person-identity', 'character-design', 'garment-detail', 'wearing-effect', 'footwear-detail', 'signature-prop-detail', 'critical-detail', 'pose'],
  supportsMultipleReferences: true,
  supportsEditing: true,
  supportsBatchOutput: true,
  outputMediaTypes: ['image/png', 'image/jpeg'],
  supportsTransparentOutput: false,
  supportsAlpha: false,
  knownIncompatibilities: ['The Playground forces one output and does not enable sequential image generation.'],
  timeoutMs: 120_000,
  streaming: false,
  destination: 'https://ark.cn-beijing.volces.com/api/v3/images/generations',
  dataCategories: ['reference_image', 'prompt', 'generated_image'],
  provider: 'seedream',
  model: 'doubao-seedream-4-0-250828',
  endpoint: 'https://ark.cn-beijing.volces.com/api/v3/images/generations',
  credentialMode: 'user_ephemeral',
  inputMaxBytesPerReference: 15_000_000,
  inputMaxWidth: 4096,
  inputMaxHeight: 4096,
  inputAspectRatio: { min: 1 / 3, max: 3 },
  pricePerImage: 0.2,
  currency: 'CNY',
  rateLimit: { imagesPerMinute: 500 },
  dailyBudgetDefault: 2,
  documentation: [
    { label: 'Image generation API limits', url: 'https://www.volcengine.com/docs/85621/1863351' },
    { label: 'Ark image generation API', url: 'https://api.volcengine.com/api-explorer/?action=ImageGenerations&groupName=%E5%9B%BE%E7%89%87%E7%94%9A%E6%88%90API&serviceCode=ark&version=2024-01-01' },
    { label: 'Official Ark pricing', url: 'https://www.volcengine.com/product/ark' },
    { label: 'Seedream model page', url: 'https://seed.bytedance.com/en/seedream4_0' },
  ],
  capabilityVerifiedAt: '2026-08-19',
})

/** Official xAI Imagine image-edit profile, transport intentionally disabled. */
export const GROK_IMAGINE_PROFILE = profile({
  schemaVersion: 'voce.provider-capability-profile/v1alpha1',
  id: 'grok-imagine-image-quality',
  version: 'stable',
  versionSummary: 'Grok Imagine image profile; official limits checked 2026-08-19.',
  adapterId: 'grok-imagine.image-generator',
  adapterDigest: adapterDigest('grok-imagine.image-generator', '1.0.0'),
  verificationStatus: 'verified',
  // xAI documents up to three source images for Imagine editing. This means
  // the four/five-reference Playground flows must fail capability preflight.
  maximumReferenceCount: 3,
  maximumTotalReferenceBytes: 60 * 1024 * 1024,
  maximumBytesPerReference: 20 * 1024 * 1024,
  allowedReferenceMediaTypes: ['image/jpeg', 'image/png'],
  allowedReferenceRoles: ['person-identity', 'garment-detail', 'wearing-effect', 'footwear-detail', 'character-design', 'signature-prop-detail', 'critical-detail', 'pose'],
  referenceOrdering: 'provider_defined',
  supportsMultipleReferences: true,
  supportsEditing: true,
  supportsBatchOutput: true,
  outputMediaTypes: ['image/png', 'image/jpeg'],
  supportsTransparentOutput: false,
  supportsAlpha: false,
  knownIncompatibilities: ['Imagine image editing supports up to three reference images; Try-On four/five-reference flows are not supported by this profile.'],
  timeoutMs: 120_000,
  streaming: false,
  destination: 'https://api.x.ai/v1/images/edits',
  dataCategories: ['reference_image', 'prompt', 'generated_image'],
  provider: 'grok-imagine',
  model: 'grok-imagine-image-quality',
  endpoint: 'https://api.x.ai/v1/images/edits',
  credentialMode: 'user_ephemeral',
  inputMaxBytesPerReference: 20 * 1024 * 1024,
  pricePerImage: 0.05,
  currency: 'USD',
  rateLimit: { requestsPerSecond: 5 },
  dailyBudgetDefault: 1,
  documentation: [
    { label: 'Imagine overview and multi-image limit', url: 'https://docs.x.ai/developers/model-capabilities/imagine' },
    { label: 'Grok Imagine image model', url: 'https://docs.x.ai/developers/models/grok-imagine-image' },
    { label: 'xAI pricing', url: 'https://docs.x.ai/developers/pricing' },
    { label: 'Imagine private Files inputs', url: 'https://docs.x.ai/developers/model-capabilities/imagine/files/inputs' },
  ],
  capabilityVerifiedAt: '2026-08-19',
})

export const PLAYGROUND_PROVIDER_PROFILES: Readonly<Record<PlaygroundProviderProfileId, PlaygroundProviderProfile>> = Object.freeze({
  'mock-image': MOCK_PLAYGROUND_PROFILE,
  'seedream-4.0': SEEDREAM_4_PROFILE,
  'grok-imagine-image-quality': GROK_IMAGINE_PROFILE,
})

export function providerProfileFor(id: string): PlaygroundProviderProfile {
  const profile = PLAYGROUND_PROVIDER_PROFILES[id as PlaygroundProviderProfileId]
  if (!profile) throw new Error(`PLAYGROUND_PROVIDER_PROFILE_NOT_ALLOW_LISTED:${id}`)
  return profile
}

export interface UploadedAssetSummary {
  id: string
  byteLength: number
  mediaType: string
  role?: string
}

export interface ProviderCapabilityPreflight {
  status: 'ok' | 'blocked'
  reasons: readonly string[]
  estimatedCost: number
  currency: string
  profileId: string
}

export function preflightProviderCapability(input: {
  request: ProviderRenderRequest
  profile: PlaygroundProviderProfile
  assets?: readonly UploadedAssetSummary[]
  renderEnabled: boolean
  confirmSingleCall: boolean
}): ProviderCapabilityPreflight {
  const reasons: string[] = []
  const mappings = input.request.referenceMappings
  if (!input.renderEnabled) reasons.push('RENDER_DISABLED')
  if (!input.confirmSingleCall) reasons.push('SINGLE_CALL_CONFIRMATION_REQUIRED')
  if (input.request.targetCapabilityProfile.id !== input.profile.id || input.request.targetCapabilityProfile.digest !== input.profile.profileHash) reasons.push('PROFILE_BINDING_MISMATCH')
  if (mappings.length > (input.profile.maximumReferenceCount ?? Number.MAX_SAFE_INTEGER)) reasons.push('REFERENCE_COUNT_EXCEEDED')
  if (mappings.some((mapping) => input.profile.allowedReferenceRoles && !input.profile.allowedReferenceRoles.includes(mapping.role))) reasons.push('REFERENCE_ROLE_NOT_ALLOWED')
  if (mappings.some((mapping) => !input.profile.supportsMultipleReferences && mappings.length > 1)) reasons.push('MULTI_REFERENCE_UNSUPPORTED')
  if (input.request.output.cardinality.max !== 1 || input.request.output.cardinality.min !== 1) reasons.push('ONE_OUTPUT_REQUIRED')
  const assetById = new Map((input.assets ?? []).map((asset) => [asset.id, asset]))
  let bytes = 0
  for (const mapping of mappings) {
    const asset = assetById.get(mapping.assetId)
    if (asset) {
      bytes += asset.byteLength
      if (input.profile.maximumBytesPerReference !== undefined && asset.byteLength > input.profile.maximumBytesPerReference) reasons.push(`REFERENCE_BYTES_EXCEEDED:${mapping.assetId}`)
      if (input.profile.allowedReferenceMediaTypes && !input.profile.allowedReferenceMediaTypes.includes(asset.mediaType)) reasons.push(`REFERENCE_MEDIA_TYPE_UNSUPPORTED:${mapping.assetId}`)
    }
  }
  if (input.profile.maximumTotalReferenceBytes !== undefined && bytes > input.profile.maximumTotalReferenceBytes) reasons.push('REFERENCE_TOTAL_BYTES_EXCEEDED')
  const estimatedCost = input.profile.pricePerImage
  return { status: reasons.length ? 'blocked' : 'ok', reasons: [...new Set(reasons)].sort(), estimatedCost, currency: input.profile.currency, profileId: input.profile.id }
}

export interface BudgetReservation {
  id: string
  clientId: string
  profileId: string
  cost: number
  currency: string
}

export interface BudgetGateSnapshot {
  dailyCost: number
  dailyCalls: number
  activeCalls: number
  perClient: Readonly<Record<string, { cost: number; calls: number }>>
}

export class InMemoryBudgetGate {
  private readonly daily = new Map<string, { cost: number; calls: number }>()
  private readonly client = new Map<string, { cost: number; calls: number }>()
  private activeCalls = 0
  private sequence = 0

  constructor(private readonly limits: { dailyCost: number; perClientCost: number; maxConcurrent: number; currency: string }) {}

  reserve(clientId: string, profile: PlaygroundProviderProfile): BudgetReservation {
    const daily = this.daily.get(profile.id) ?? { cost: 0, calls: 0 }
    const clientKey = `${profile.id}:${clientId}`
    const client = this.client.get(clientKey) ?? { cost: 0, calls: 0 }
    if (this.activeCalls >= this.limits.maxConcurrent) throw new Error('RATE_LIMIT_CONCURRENCY_EXCEEDED')
    if (daily.cost + profile.pricePerImage > this.limits.dailyCost) throw new Error('DAILY_BUDGET_EXCEEDED')
    if (client.cost + profile.pricePerImage > this.limits.perClientCost) throw new Error('CLIENT_BUDGET_EXCEEDED')
    this.activeCalls += 1
    this.daily.set(profile.id, { cost: daily.cost + profile.pricePerImage, calls: daily.calls + 1 })
    this.client.set(clientKey, { cost: client.cost + profile.pricePerImage, calls: client.calls + 1 })
    return { id: `budget-reservation-${++this.sequence}`, clientId, profileId: profile.id, cost: profile.pricePerImage, currency: profile.currency }
  }

  release(_reservation: BudgetReservation): void {
    this.activeCalls = Math.max(0, this.activeCalls - 1)
  }

  snapshot(): BudgetGateSnapshot {
    const daily = [...this.daily.values()].reduce((sum, value) => ({ cost: sum.cost + value.cost, calls: sum.calls + value.calls }), { cost: 0, calls: 0 })
    return { dailyCost: daily.cost, dailyCalls: daily.calls, activeCalls: this.activeCalls, perClient: Object.fromEntries([...this.client.entries()].sort(([left], [right]) => left.localeCompare(right)).map(([key, value]) => [key, { ...value }])) }
  }
}
