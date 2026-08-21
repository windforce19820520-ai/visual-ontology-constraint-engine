import type { JsonValue, ProviderCapabilityProfile, ProviderRenderRequest } from '@voce-engine/contracts'
import { computeProviderCapabilityProfileHash, sha256 } from '@voce-engine/core'

export type PlaygroundProviderProfileId = 'cloudflare-flux-2-klein-4b' | 'mock-image' | 'seedream-5.0-pro' | 'grok-imagine-image-quality'
export type CredentialMode = 'none' | 'operator_managed' | 'user_ephemeral'
export type PlaygroundCurrency = 'USD' | 'CNY'

export interface ProviderPriceModel { flatOutput?: number; inputPerReference?: number; output1k?: number; output2k?: number }

export interface ProviderSelectorMetadata {
  label: string
  description: string
  referenceLimit: string
  inputLimit: string
  quota: string
  qualityNote: string
  credential: string
}

export interface PlaygroundProviderProfile extends ProviderCapabilityProfile {
  provider: 'cloudflare' | 'mock' | 'seedream' | 'grok-imagine'
  model: string
  endpoint: string
  credentialMode: CredentialMode
  inputMaxBytesPerReference?: number
  inputMaxWidth?: number
  inputMaxHeight?: number
  inputAspectRatio?: { min: number; max: number }
  pricePerImage: number
  priceModel: ProviderPriceModel
  currency: PlaygroundCurrency
  rateLimit: { requestsPerSecond?: number; imagesPerMinute?: number }
  dailyBudgetDefault: number
  documentation: readonly { label: string; url: string }[]
  capabilityVerifiedAt: string
  playgroundProfileDigest: string
  selectorMetadata?: ProviderSelectorMetadata
  /** Cloudflare's strict bound is expressed separately from the generic <= limit. */
  inputDimensionsStrictlyBelow?: { width: number; height: number }
  /** The disclosed Host-side hard cap for an operator-managed free profile. */
  freeQuotaNeuronsPerDay?: number
  freeQuotaResetUtc?: string
  neuronPricing?: { inputReferenceTile: number; outputTile: number }
}

function deepFreeze<T>(value: T): T {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.freeze(value)
    for (const child of Object.values(value as Record<string, unknown>)) deepFreeze(child)
  }
  return value
}

function playgroundDigest(profile: Omit<PlaygroundProviderProfile, 'playgroundProfileDigest'>): string {
  const projection = { coreProfileHash: profile.profileHash, provider: profile.provider, model: profile.model, endpoint: profile.endpoint,
    credentialMode: profile.credentialMode, inputMaxBytesPerReference: profile.inputMaxBytesPerReference,
    inputMaxWidth: profile.inputMaxWidth, inputMaxHeight: profile.inputMaxHeight, inputAspectRatio: profile.inputAspectRatio,
    priceModel: profile.priceModel, currency: profile.currency, rateLimit: profile.rateLimit,
    dailyBudgetDefault: profile.dailyBudgetDefault, documentation: profile.documentation,
    capabilityVerifiedAt: profile.capabilityVerifiedAt, selectorMetadata: profile.selectorMetadata,
    inputDimensionsStrictlyBelow: profile.inputDimensionsStrictlyBelow,
    freeQuotaNeuronsPerDay: profile.freeQuotaNeuronsPerDay, freeQuotaResetUtc: profile.freeQuotaResetUtc,
    neuronPricing: profile.neuronPricing }
  return sha256(JSON.parse(JSON.stringify(projection)) as JsonValue)
}

function profile<T extends Omit<PlaygroundProviderProfile, 'profileHash' | 'playgroundProfileDigest'>>(base: T): PlaygroundProviderProfile {
  const withCoreHash = { ...base, profileHash: computeProviderCapabilityProfileHash(base) } as Omit<PlaygroundProviderProfile, 'playgroundProfileDigest'>
  return deepFreeze({ ...withCoreHash, playgroundProfileDigest: playgroundDigest(withCoreHash) })
}

const adapterDigest = (id: string, version: string): string => sha256({ adapter: id, version } as never)
const roles = ['person-identity', 'garment-full-body', 'garment-top', 'garment-bottom', 'fit-reference', 'footwear-detail', 'character-design', 'signature-prop-detail', 'critical-detail', 'accessory-detail', 'pose']
const roleOrder = ['person-identity', 'character-design', 'garment-full-body', 'garment-top', 'garment-bottom', 'fit-reference', 'footwear-detail', 'signature-prop-detail', 'critical-detail', 'accessory-detail', 'pose']

export const CLOUDFLARE_FLUX_2_KLEIN_4B_MODEL = '@cf/black-forest-labs/flux-2-klein-4b'
export const CLOUDFLARE_FREE_NEURON_LIMIT = 10_000
export const CLOUDFLARE_FREE_QUOTA_RESET_UTC = '00:00 UTC'

export const CLOUDFLARE_FLUX_2_KLEIN_4B_PROFILE = profile({
  schemaVersion: 'voce.provider-capability-profile/v1alpha1', id: 'cloudflare-flux-2-klein-4b', version: '1.0.0',
  versionSummary: 'Cloudflare Workers AI FLUX.2 [klein] 4B; fixed four-step distilled model with a Host-enforced free quota.',
  adapterId: 'cloudflare.workers-ai.image-generator', adapterDigest: adapterDigest('cloudflare.workers-ai.image-generator', '1.0.0'), verificationStatus: 'verified',
  maximumReferenceCount: 4, maximumTotalReferenceBytes: 60_000_000, maximumBytesPerReference: 15_000_000,
  allowedReferenceMediaTypes: ['image/jpeg', 'image/png', 'image/webp'], allowedReferenceRoles: roles, referenceOrdering: 'stable', referenceRoleOrder: roleOrder,
  supportsMultipleReferences: true, supportsEditing: true, supportsBatchOutput: false, outputMediaTypes: ['image/png'], supportsTransparentOutput: false, supportsAlpha: false,
  outputCapabilities: { mediaTypes: ['image/png'], minimumWidth: 256, minimumHeight: 256, maximumWidth: 1920, maximumHeight: 1920 },
  knownIncompatibilities: ['Every reference dimension must be strictly smaller than 512x512.', 'Fixed four-step inference; identity, clothing, prop-detail, and complex-composition fidelity may be weaker than larger BYOK models.', 'The Playground requests one output and never continues on paid overage.'],
  timeoutMs: 120_000, streaming: false, destination: 'https://api.cloudflare.com/client/v4/accounts/{ACCOUNT_ID}/ai/run/@cf/black-forest-labs/flux-2-klein-4b',
  dataCategories: ['reference_image', 'prompt', 'generated_image'], provider: 'cloudflare', model: CLOUDFLARE_FLUX_2_KLEIN_4B_MODEL,
  endpoint: 'https://api.cloudflare.com/client/v4/accounts/{ACCOUNT_ID}/ai/run/@cf/black-forest-labs/flux-2-klein-4b', credentialMode: 'operator_managed',
  inputMaxBytesPerReference: 15_000_000, inputMaxWidth: 512, inputMaxHeight: 512, inputDimensionsStrictlyBelow: { width: 512, height: 512 },
  pricePerImage: 0, priceModel: { flatOutput: 0 }, currency: 'USD', rateLimit: { imagesPerMinute: 720 }, dailyBudgetDefault: 0,
  freeQuotaNeuronsPerDay: CLOUDFLARE_FREE_NEURON_LIMIT, freeQuotaResetUtc: CLOUDFLARE_FREE_QUOTA_RESET_UTC,
  neuronPricing: { inputReferenceTile: 5.37, outputTile: 26.05 },
  selectorMetadata: {
    label: 'Cloudflare Workers AI — Free experimental preview',
    description: 'Free experimental preview only; it is not the default quality representative. No Cloudflare key is entered in the browser.',
    referenceLimit: 'Up to 4 ordered references; a fifth reference is blocked before transport.',
    inputLimit: 'Every reference must already be strictly smaller than 512×512; uploads are not resized.',
    quota: 'Shared free allocation: at most 10,000 Neurons/day, reset at 00:00 UTC. Exhaustion fails closed with no paid fallback.',
    qualityNote: 'Best for quick previews. Exact face identity, small accessory details, complete feet/framing, and complex spatial composition may be less reliable than Seedream/Grok.',
    credential: 'Operator-managed server credential; the browser never receives or requests a Cloudflare key.',
  },
  documentation: [
    { label: 'FLUX.2 klein 4B Workers AI launch and limits', url: 'https://developers.cloudflare.com/changelog/post/2026-01-15-flux-2-klein-4b-workers-ai/' },
    { label: 'Workers AI pricing and free allocation', url: 'https://developers.cloudflare.com/workers-ai/platform/pricing/' },
    { label: 'Workers AI errors', url: 'https://developers.cloudflare.com/workers-ai/platform/errors/' },
    { label: 'Workers AI data usage', url: 'https://developers.cloudflare.com/workers-ai/platform/data-usage/' },
  ], capabilityVerifiedAt: '2026-08-19',
})

export const MOCK_PLAYGROUND_PROFILE = profile({
  schemaVersion: 'voce.provider-capability-profile/v1alpha1', id: 'mock-image', version: '1.0.0', versionSummary: 'Deterministic in-memory mock. It never contacts a Provider.',
  adapterId: 'mock.image-generator', adapterDigest: sha256({ fixture: 'playground-mock', version: '1.0.0' } as never), verificationStatus: 'verified',
  maximumReferenceCount: 8, maximumTotalReferenceBytes: 32_000_000, maximumBytesPerReference: 15_000_000,
  allowedReferenceMediaTypes: ['image/jpeg', 'image/png', 'image/webp'], allowedReferenceRoles: roles, referenceOrdering: 'stable', referenceRoleOrder: roleOrder,
  supportsMultipleReferences: true, supportsEditing: true, supportsBatchOutput: false, outputMediaTypes: ['image/png'], supportsTransparentOutput: false, supportsAlpha: false,
  knownIncompatibilities: [], timeoutMs: 30_000, streaming: false, destination: 'mock://playground', dataCategories: ['reference_image', 'prompt', 'generated_image'],
  provider: 'mock', model: 'mock-image', endpoint: 'mock://playground', credentialMode: 'none', pricePerImage: 0, priceModel: { flatOutput: 0 }, currency: 'USD',
  rateLimit: { requestsPerSecond: 10, imagesPerMinute: 120 }, dailyBudgetDefault: 0, documentation: [], capabilityVerifiedAt: '2026-08-19',
})

/**
 * Compile-only profile. It deliberately fits the complete declared scenario
 * so Compile can remain inspectable before a selected Provider preflight.
 * It is not allow-listed for generation and is never exposed in /api/meta.
 */
export const PLAYGROUND_INSPECTION_PROFILE = profile({
  schemaVersion: 'voce.provider-capability-profile/v1alpha1', id: 'playground-inspection', version: '1.0.0', versionSummary: 'Compile-only profile for provider-neutral plan inspection.',
  adapterId: 'mock.image-generator', adapterDigest: sha256({ fixture: 'playground-inspection', version: '1.0.0' } as never), verificationStatus: 'verified',
  maximumReferenceCount: 14, maximumTotalReferenceBytes: 210_000_000, maximumBytesPerReference: 15_000_000,
  allowedReferenceMediaTypes: ['image/jpeg', 'image/png', 'image/webp'], allowedReferenceRoles: roles, referenceOrdering: 'stable', referenceRoleOrder: roleOrder,
  supportsMultipleReferences: true, supportsEditing: true, supportsBatchOutput: false, outputMediaTypes: ['image/png'], supportsTransparentOutput: false, supportsAlpha: false,
  knownIncompatibilities: ['Compile-only; generation is forbidden.'], timeoutMs: 30_000, streaming: false, destination: 'mock://playground-inspection', dataCategories: ['reference_image', 'prompt'],
  provider: 'mock', model: 'playground-inspection', endpoint: 'mock://playground-inspection', credentialMode: 'none', pricePerImage: 0, priceModel: { flatOutput: 0 }, currency: 'USD',
  rateLimit: { requestsPerSecond: 10, imagesPerMinute: 120 }, dailyBudgetDefault: 0, documentation: [], capabilityVerifiedAt: '2026-08-19',
})

export const SEEDREAM_5_PRO_PROFILE = profile({
  schemaVersion: 'voce.provider-capability-profile/v1alpha1', id: 'seedream-5.0-pro', version: '1.0.0-260628', versionSummary: 'Seedream 5.0 Pro image generation/editing profile; real-provider acceptance passed 2026-08-18.',
  adapterId: 'seedream.image-generator', adapterDigest: adapterDigest('seedream.image-generator', '1.0.0'), verificationStatus: 'verified',
  maximumReferenceCount: 10, maximumTotalReferenceBytes: 150_000_000, maximumBytesPerReference: 15_000_000,
  allowedReferenceMediaTypes: ['image/jpeg', 'image/png'], allowedReferenceRoles: roles, referenceOrdering: 'stable', referenceRoleOrder: roleOrder,
  supportsMultipleReferences: true, supportsEditing: true, supportsBatchOutput: true, outputMediaTypes: ['image/png', 'image/jpeg'], supportsTransparentOutput: false, supportsAlpha: false,
  knownIncompatibilities: ['The Playground forces one output and does not request sequential image generation.'], timeoutMs: 120_000, streaming: false,
  destination: 'https://ark.cn-beijing.volces.com/api/v3/images/generations', dataCategories: ['reference_image', 'prompt', 'generated_image'],
  provider: 'seedream', model: 'doubao-seedream-5-0-pro-260628', endpoint: 'https://ark.cn-beijing.volces.com/api/v3/images/generations', credentialMode: 'user_ephemeral',
  inputMaxBytesPerReference: 15_000_000, inputMaxWidth: 4096, inputMaxHeight: 4096, inputAspectRatio: { min: 1 / 3, max: 3 },
  pricePerImage: 0.2, priceModel: { flatOutput: 0.2 }, currency: 'CNY', rateLimit: { imagesPerMinute: 500 }, dailyBudgetDefault: 2,
  selectorMetadata: {
    label: 'Seedream 5.0 Pro — Recommended high quality (BYOK)',
    description: 'Recommended high-quality option. The user supplies an Ark API key for one request.',
    referenceLimit: 'Up to 10 ordered JPEG/PNG references; the Playground always requests one output.',
    inputLimit: 'Up to 15 MB per reference, 4096×4096, with a supported aspect ratio from 1:3 to 3:1.',
    quota: 'Paid BYOK call. Host session/client/global/daily gates apply; the Provider account remains the final billing authority.',
    qualityNote: 'Recommended quality path based on the recorded RC.4 Provider acceptance; individual outputs are not guaranteed.',
    credential: 'User-provided Volcengine Ark API key, held only for the single Generate request and never persisted.',
  },
  documentation: [
    { label: 'Image generation API limits', url: 'https://www.volcengine.com/docs/85621/1863351' },
    { label: 'Ark image generation API', url: 'https://api.volcengine.com/api-explorer/?action=ImageGenerations&groupName=%E5%9B%BE%E7%89%87%E7%94%9A%E6%88%90API&serviceCode=ark&version=2024-01-01' },
    { label: 'Official Ark pricing', url: 'https://www.volcengine.com/product/ark' },
    { label: 'VOCE RC.4 real-provider acceptance', url: 'https://github.com/bys830628/visual-ontology-constraint-engine/blob/main/docs/acceptance/v0.1.0-rc.4.md' },
  ], capabilityVerifiedAt: '2026-08-18',
})

export const GROK_IMAGINE_PROFILE = profile({
  schemaVersion: 'voce.provider-capability-profile/v1alpha1', id: 'grok-imagine-image-quality', version: '1.0.0-stable', versionSummary: 'Grok Imagine image profile; official limits checked 2026-08-19.',
  adapterId: 'grok-imagine.image-generator', adapterDigest: adapterDigest('grok-imagine.image-generator', '1.0.0'), verificationStatus: 'declared',
  maximumReferenceCount: 3, maximumTotalReferenceBytes: 60 * 1024 * 1024, maximumBytesPerReference: 20 * 1024 * 1024,
  allowedReferenceMediaTypes: ['image/jpeg', 'image/png'], allowedReferenceRoles: roles, referenceOrdering: 'provider_defined',
  supportsMultipleReferences: true, supportsEditing: true, supportsBatchOutput: true, outputMediaTypes: ['image/png', 'image/jpeg'], supportsTransparentOutput: false, supportsAlpha: false,
  outputCapabilities: { mediaTypes: ['image/png', 'image/jpeg'], maximumWidth: 2048, maximumHeight: 2048 },
  knownIncompatibilities: ['Imagine image editing supports up to three reference images; Try-On four/five-reference flows are not supported by this profile.', 'The xAI transport accepts only official aspect ratios at an exact 1K or 2K maximum dimension.'],
  timeoutMs: 120_000, streaming: false, destination: 'https://api.x.ai/v1/images/edits', dataCategories: ['reference_image', 'prompt', 'generated_image'],
  provider: 'grok-imagine', model: 'grok-imagine-image-quality', endpoint: 'https://api.x.ai/v1/images/edits', credentialMode: 'user_ephemeral',
  inputMaxBytesPerReference: 20 * 1024 * 1024, pricePerImage: 0.05,
  priceModel: { inputPerReference: 0.01, output1k: 0.05, output2k: 0.07 }, currency: 'USD', rateLimit: { requestsPerSecond: 5 }, dailyBudgetDefault: 1,
  selectorMetadata: {
    label: 'Grok Imagine — Optional high quality (BYOK)',
    description: 'Optional high-quality image editing path. Availability requires the explicitly enabled xAI transport.',
    referenceLimit: 'Up to 3 ordered JPEG/PNG references; four- and five-reference plans remain inspectable but cannot Generate.',
    inputLimit: 'Up to 20 MiB per reference; no public input URL is required because request-scoped Base64 data URIs are used.',
    quota: 'Paid BYOK call. Host session/client/global/daily gates apply; the xAI account remains the final billing authority.',
    qualityNote: 'The HTTP adapter is Mock-HTTP verified in this repository; real account availability and output quality are not claimed by PR A.',
    credential: 'User-provided xAI API key, held only for the single Generate request and never persisted.',
  },
  documentation: [
    { label: 'Imagine overview and multi-image limit', url: 'https://docs.x.ai/developers/model-capabilities/imagine' },
    { label: 'Grok Imagine image model', url: 'https://docs.x.ai/developers/models/grok-imagine-image' },
    { label: 'xAI pricing', url: 'https://docs.x.ai/developers/pricing' },
    { label: 'Imagine private Files inputs', url: 'https://docs.x.ai/developers/model-capabilities/imagine/files/inputs' },
  ], capabilityVerifiedAt: '2026-08-19',
})

export const PLAYGROUND_PROVIDER_PROFILES: Readonly<Record<PlaygroundProviderProfileId, PlaygroundProviderProfile>> = deepFreeze({
  'cloudflare-flux-2-klein-4b': CLOUDFLARE_FLUX_2_KLEIN_4B_PROFILE,
  'mock-image': MOCK_PLAYGROUND_PROFILE, 'seedream-5.0-pro': SEEDREAM_5_PRO_PROFILE, 'grok-imagine-image-quality': GROK_IMAGINE_PROFILE,
})

export function providerProfileFor(id: string): PlaygroundProviderProfile {
  const selected = PLAYGROUND_PROVIDER_PROFILES[id as PlaygroundProviderProfileId]
  if (!selected) throw new Error(`PLAYGROUND_PROVIDER_PROFILE_NOT_ALLOW_LISTED:${id}`)
  return selected
}

export interface UploadedAssetSummary { id: string; byteLength: number; mediaType: string; role?: string; width?: number; height?: number }
export interface ProviderCapabilityPreflight { status: 'ok' | 'blocked'; reasons: readonly string[]; estimatedCost: number; currency: PlaygroundCurrency; profileId: string }

export function estimateProviderCost(request: Pick<ProviderRenderRequest, 'referenceMappings' | 'output'>, profile: PlaygroundProviderProfile): number {
  const model = profile.priceModel
  const maxDimension = Math.max(request.output.dimensions?.width ?? 1024, request.output.dimensions?.height ?? 1024)
  const output = model.flatOutput ?? (maxDimension > 1024 ? model.output2k : model.output1k) ?? profile.pricePerImage
  return Number(((model.inputPerReference ?? 0) * request.referenceMappings.length + output).toFixed(6))
}

export function preflightProviderCapability(input: {
  request: ProviderRenderRequest; profile: PlaygroundProviderProfile; assets?: readonly UploadedAssetSummary[]
  renderEnabled?: boolean; confirmSingleCall?: boolean; requireProfileBinding?: boolean; requireAuthorization?: boolean
}): ProviderCapabilityPreflight {
  const reasons: string[] = []
  const mappings = input.request.referenceMappings
  if (input.requireAuthorization !== false) {
    if (input.renderEnabled !== true) reasons.push('RENDER_DISABLED')
    if (input.confirmSingleCall !== true) reasons.push('SINGLE_CALL_CONFIRMATION_REQUIRED')
  }
  if (input.requireProfileBinding !== false && (input.request.targetCapabilityProfile.id !== input.profile.id || input.request.targetCapabilityProfile.digest !== input.profile.profileHash)) reasons.push('PROFILE_BINDING_MISMATCH')
  if (mappings.length > (input.profile.maximumReferenceCount ?? Number.MAX_SAFE_INTEGER)) reasons.push('REFERENCE_COUNT_EXCEEDED')
  if (mappings.some((mapping) => input.profile.allowedReferenceRoles && !input.profile.allowedReferenceRoles.includes(mapping.role))) reasons.push('REFERENCE_ROLE_NOT_ALLOWED')
  if (mappings.length > 1 && input.profile.supportsMultipleReferences === false) reasons.push('MULTI_REFERENCE_UNSUPPORTED')
  if (input.request.output.cardinality.max !== 1 || input.request.output.cardinality.min !== 1) reasons.push('ONE_OUTPUT_REQUIRED')
  const assetById = new Map((input.assets ?? []).map((asset) => [asset.id, asset]))
  let bytes = 0
  for (const mapping of mappings) {
    const asset = assetById.get(mapping.assetId)
    if (!asset) continue
    if (input.profile.inputDimensionsStrictlyBelow && (asset.width === undefined || asset.height === undefined)) reasons.push(`REFERENCE_DIMENSIONS_REQUIRED:${mapping.assetId}`)
    bytes += asset.byteLength
    if (input.profile.maximumBytesPerReference !== undefined && asset.byteLength > input.profile.maximumBytesPerReference) reasons.push(`REFERENCE_BYTES_EXCEEDED:${mapping.assetId}`)
    if (input.profile.allowedReferenceMediaTypes && !input.profile.allowedReferenceMediaTypes.includes(asset.mediaType)) reasons.push(`REFERENCE_MEDIA_TYPE_UNSUPPORTED:${mapping.assetId}`)
    if (asset.width && input.profile.inputMaxWidth && asset.width > input.profile.inputMaxWidth) reasons.push(`REFERENCE_WIDTH_EXCEEDED:${mapping.assetId}`)
    if (asset.height && input.profile.inputMaxHeight && asset.height > input.profile.inputMaxHeight) reasons.push(`REFERENCE_HEIGHT_EXCEEDED:${mapping.assetId}`)
    if (asset.width && input.profile.inputDimensionsStrictlyBelow && asset.width >= input.profile.inputDimensionsStrictlyBelow.width) reasons.push(`REFERENCE_WIDTH_MUST_BE_BELOW:${mapping.assetId}`)
    if (asset.height && input.profile.inputDimensionsStrictlyBelow && asset.height >= input.profile.inputDimensionsStrictlyBelow.height) reasons.push(`REFERENCE_HEIGHT_MUST_BE_BELOW:${mapping.assetId}`)
    if (asset.width && asset.height && input.profile.inputAspectRatio) {
      const ratio = asset.width / asset.height
      if (ratio < input.profile.inputAspectRatio.min || ratio > input.profile.inputAspectRatio.max) reasons.push(`REFERENCE_ASPECT_RATIO_UNSUPPORTED:${mapping.assetId}`)
    }
  }
  if (input.profile.maximumTotalReferenceBytes !== undefined && bytes > input.profile.maximumTotalReferenceBytes) reasons.push('REFERENCE_TOTAL_BYTES_EXCEEDED')
  const outputDimensions = input.request.output.dimensions
  const outputCaps = input.profile.outputCapabilities
  if (outputCaps?.mediaTypes && !input.request.output.mediaTypes.some((mediaType) => outputCaps.mediaTypes!.includes(mediaType))) reasons.push('OUTPUT_MEDIA_TYPE_UNSUPPORTED')
  if (outputDimensions && outputCaps) {
    if (outputCaps.minimumWidth !== undefined && outputDimensions.width < outputCaps.minimumWidth) reasons.push('OUTPUT_WIDTH_BELOW_MINIMUM')
    if (outputCaps.minimumHeight !== undefined && outputDimensions.height < outputCaps.minimumHeight) reasons.push('OUTPUT_HEIGHT_BELOW_MINIMUM')
    if (outputCaps.maximumWidth !== undefined && outputDimensions.width > outputCaps.maximumWidth) reasons.push('OUTPUT_WIDTH_EXCEEDED')
    if (outputCaps.maximumHeight !== undefined && outputDimensions.height > outputCaps.maximumHeight) reasons.push('OUTPUT_HEIGHT_EXCEEDED')
  }
  return { status: reasons.length ? 'blocked' : 'ok', reasons: [...new Set(reasons)].sort(), estimatedCost: estimateProviderCost(input.request, input.profile), currency: input.profile.currency, profileId: input.profile.id }
}

export interface CloudflareQuotaReservation { id: string; day: string; neurons: number }
export interface CloudflareQuotaSnapshot { day: string; limitNeurons: number; usedNeurons: number; remainingNeurons: number; calls: number }

/** Shared operator quota; reservations are intentionally not refunded after a transport attempt. */
export class CloudflareQuotaGate {
  private day = ''
  private usedNeurons = 0
  private callCount = 0
  private sequence = 0

  constructor(private readonly limitNeurons = CLOUDFLARE_FREE_NEURON_LIMIT, private readonly now: () => number = Date.now) {
    if (!Number.isInteger(limitNeurons) || limitNeurons <= 0) throw new Error('CLOUDFLARE_QUOTA_LIMIT_INVALID')
    if (limitNeurons > CLOUDFLARE_FREE_NEURON_LIMIT) throw new Error('CLOUDFLARE_QUOTA_LIMIT_EXCEEDS_FREE_ALLOCATION')
  }

  private currentDay(): string { return new Date(this.now()).toISOString().slice(0, 10) }
  private resetIfNeeded(): void { const day = this.currentDay(); if (this.day !== day) { this.day = day; this.usedNeurons = 0; this.callCount = 0 } }
  reserve(neurons: number): CloudflareQuotaReservation {
    this.resetIfNeeded()
    if (!Number.isFinite(neurons) || neurons <= 0) throw new Error('CLOUDFLARE_QUOTA_ESTIMATE_INVALID')
    const charge = Math.ceil(neurons)
    if (this.usedNeurons + charge > this.limitNeurons) throw new Error('CLOUDFLARE_QUOTA_EXHAUSTED')
    this.usedNeurons += charge; this.callCount += 1
    return { id: `cloudflare-quota-${++this.sequence}`, day: this.day, neurons: charge }
  }
  snapshot(): CloudflareQuotaSnapshot { this.resetIfNeeded(); return { day: this.day, limitNeurons: this.limitNeurons, usedNeurons: this.usedNeurons, remainingNeurons: Math.max(0, this.limitNeurons - this.usedNeurons), calls: this.callCount } }
}

export function estimateCloudflareNeurons(request: Pick<ProviderRenderRequest, 'referenceMappings' | 'output'>, profile: PlaygroundProviderProfile = CLOUDFLARE_FLUX_2_KLEIN_4B_PROFILE): number {
  if (profile.provider !== 'cloudflare' || !profile.neuronPricing) throw new Error('CLOUDFLARE_PROFILE_REQUIRED')
  const dimensions = request.output.dimensions ?? { width: 1024, height: 1024 }
  const outputTiles = Math.ceil(dimensions.width / 512) * Math.ceil(dimensions.height / 512)
  return request.referenceMappings.length * profile.neuronPricing.inputReferenceTile + outputTiles * profile.neuronPricing.outputTile
}

export interface BudgetReservation { id: string; clientId: string; profileId: string; cost: number; currency: PlaygroundCurrency }
export interface BudgetGateSnapshot { day: string; dailyCost: Readonly<Record<string, number>>; dailyCalls: number; activeCalls: number; perClient: Readonly<Record<string, { cost: number; calls: number; currency: PlaygroundCurrency }>> }
export interface BudgetGateLimits {
  dailyCost?: number; perClientCost?: number; currency?: PlaygroundCurrency
  dailyCostByCurrency?: Partial<Record<PlaygroundCurrency, number>>; perClientCostByCurrency?: Partial<Record<PlaygroundCurrency, number>>
  maxConcurrent: number; now?: () => number
}

export class InMemoryBudgetGate {
  private readonly daily = new Map<string, { cost: number; calls: number; currency: PlaygroundCurrency }>()
  private readonly client = new Map<string, { cost: number; calls: number; currency: PlaygroundCurrency }>()
  private readonly recentRequests = new Map<string, number[]>()
  private readonly recentImages = new Map<string, number[]>()
  private activeCalls = 0
  private sequence = 0
  private day = ''
  constructor(private readonly limits: BudgetGateLimits) {}
  private now(): number { return (this.limits.now ?? Date.now)() }
  private currentDay(now: number): string { return new Date(now).toISOString().slice(0, 10) }
  private resetIfNeeded(now: number): void {
    const day = this.currentDay(now)
    if (this.day && this.day !== day) { this.daily.clear(); this.client.clear(); this.recentRequests.clear(); this.recentImages.clear() }
    this.day = day
  }
  private limit(kind: 'daily' | 'client', profile: PlaygroundProviderProfile): number {
    const map = kind === 'daily' ? this.limits.dailyCostByCurrency : this.limits.perClientCostByCurrency
    const legacy = kind === 'daily' ? this.limits.dailyCost : this.limits.perClientCost
    if (map?.[profile.currency] !== undefined) return map[profile.currency]!
    if (legacy !== undefined && (!this.limits.currency || this.limits.currency === profile.currency)) return legacy
    return profile.dailyBudgetDefault
  }
  reserve(clientId: string, profile: PlaygroundProviderProfile, cost = profile.pricePerImage): BudgetReservation {
    const now = this.now(); this.resetIfNeeded(now)
    const dailyKey = `${profile.currency}:${profile.id}`, clientKey = `${profile.currency}:${profile.id}:${clientId}`
    const daily = this.daily.get(dailyKey) ?? { cost: 0, calls: 0, currency: profile.currency }
    const client = this.client.get(clientKey) ?? { cost: 0, calls: 0, currency: profile.currency }
    if (this.activeCalls >= this.limits.maxConcurrent) throw new Error('RATE_LIMIT_CONCURRENCY_EXCEEDED')
    const requests = (this.recentRequests.get(clientKey) ?? []).filter((at) => now - at < 1000)
    const images = (this.recentImages.get(clientKey) ?? []).filter((at) => now - at < 60_000)
    if (profile.rateLimit.requestsPerSecond !== undefined && requests.length >= profile.rateLimit.requestsPerSecond) throw new Error('RATE_LIMIT_REQUESTS_PER_SECOND_EXCEEDED')
    if (profile.rateLimit.imagesPerMinute !== undefined && images.length >= profile.rateLimit.imagesPerMinute) throw new Error('RATE_LIMIT_IMAGES_PER_MINUTE_EXCEEDED')
    if (daily.cost + cost > this.limit('daily', profile)) throw new Error('DAILY_BUDGET_EXCEEDED')
    if (client.cost + cost > this.limit('client', profile)) throw new Error('CLIENT_BUDGET_EXCEEDED')
    this.activeCalls += 1
    this.daily.set(dailyKey, { cost: daily.cost + cost, calls: daily.calls + 1, currency: profile.currency })
    this.client.set(clientKey, { cost: client.cost + cost, calls: client.calls + 1, currency: profile.currency })
    this.recentRequests.set(clientKey, [...requests, now]); this.recentImages.set(clientKey, [...images, now])
    return { id: `budget-reservation-${++this.sequence}`, clientId, profileId: profile.id, cost, currency: profile.currency }
  }
  release(_reservation: BudgetReservation): void { this.activeCalls = Math.max(0, this.activeCalls - 1) }
  snapshot(): BudgetGateSnapshot {
    const now = this.now(); this.resetIfNeeded(now)
    const dailyCost: Record<string, number> = {}; let dailyCalls = 0
    for (const value of this.daily.values()) { dailyCost[value.currency] = (dailyCost[value.currency] ?? 0) + value.cost; dailyCalls += value.calls }
    return { day: this.day, dailyCost, dailyCalls, activeCalls: this.activeCalls, perClient: Object.fromEntries([...this.client.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([key, value]) => [key, { ...value }])) }
  }
}
