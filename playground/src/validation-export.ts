import type { JsonObject, JsonValue, ProviderRenderRequest } from '@voce-engine/contracts'
import { sha256 } from '@voce-engine/core'
import type { MaterializationResult } from './provider-materializer.js'
import type { PlaygroundCompositionSelection, PlaygroundEvaluationPlan } from './semantic-closure.js'

export interface ValidationExportAsset {
  id: string
  contentHash: string
  mediaType: string
  bytes: Uint8Array
}

export interface ValidationExportInput {
  scenarioId: string
  request: ProviderRenderRequest
  materialization: MaterializationResult
  assets: readonly ValidationExportAsset[]
  compositionSelections: readonly PlaygroundCompositionSelection[]
  evaluationPlan: PlaygroundEvaluationPlan
}

export interface ValidationExportPackage {
  bytes: Uint8Array
  manifest: JsonObject
  fileNames: readonly string[]
}

function safeRole(role: string): string {
  const value = role.toLowerCase().replace(/[^a-z0-9-]+/g, '-').replace(/^-+|-+$/g, '')
  if (!value) throw new Error('VALIDATION_EXPORT_ROLE_INVALID')
  return value
}

function extensionFor(mediaType: string): string {
  if (mediaType === 'image/png') return 'png'
  if (mediaType === 'image/jpeg') return 'jpg'
  if (mediaType === 'image/webp') return 'webp'
  throw new Error('VALIDATION_EXPORT_MEDIA_TYPE_INVALID')
}

function assertSafeText(value: string): void {
  const forbidden = [
    /https?:\/\//i,
    /(?:^|[\s"'])[A-Za-z]:[\\/]/,
    /\\\\[^\\\s]+\\/,
    /\bBearer\s+[A-Za-z0-9._-]+/i,
    /\b(?:api[-_ ]?key|authorization|session[-_ ]?cookie|signed[-_ ]?url)\b\s*[:=]/i,
    /\b(?:sk|xai)-[A-Za-z0-9_-]{8,}\b/,
  ]
  if (forbidden.some((pattern) => pattern.test(value))) throw new Error('VALIDATION_EXPORT_SENSITIVE_TEXT_BLOCKED')
}

function assertSafeBytes(bytes: Uint8Array): void {
  for (const text of Buffer.from(bytes).toString('latin1').match(/[\x20-\x7e]{8,}/g) ?? []) assertSafeText(text)
}

function crc32(bytes: Uint8Array): number {
  let crc = 0xffffffff
  for (const byte of bytes) {
    crc ^= byte
    for (let bit = 0; bit < 8; bit += 1) crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1))
  }
  return (crc ^ 0xffffffff) >>> 0
}

function zipStored(files: readonly { name: string; bytes: Uint8Array }[]): Uint8Array {
  const localParts: Buffer[] = []
  const centralParts: Buffer[] = []
  let offset = 0
  for (const file of files) {
    const name = Buffer.from(file.name, 'utf8')
    const content = Buffer.from(file.bytes)
    const checksum = crc32(content)
    const local = Buffer.alloc(30)
    local.writeUInt32LE(0x04034b50, 0)
    local.writeUInt16LE(20, 4)
    local.writeUInt16LE(0x0800, 6)
    local.writeUInt16LE(0, 8)
    local.writeUInt32LE(checksum, 14)
    local.writeUInt32LE(content.byteLength, 18)
    local.writeUInt32LE(content.byteLength, 22)
    local.writeUInt16LE(name.byteLength, 26)
    localParts.push(local, name, content)

    const central = Buffer.alloc(46)
    central.writeUInt32LE(0x02014b50, 0)
    central.writeUInt16LE(20, 4)
    central.writeUInt16LE(20, 6)
    central.writeUInt16LE(0x0800, 8)
    central.writeUInt16LE(0, 10)
    central.writeUInt32LE(checksum, 16)
    central.writeUInt32LE(content.byteLength, 20)
    central.writeUInt32LE(content.byteLength, 24)
    central.writeUInt16LE(name.byteLength, 28)
    central.writeUInt32LE(offset, 42)
    centralParts.push(central, name)
    offset += local.byteLength + name.byteLength + content.byteLength
  }
  const centralDirectory = Buffer.concat(centralParts)
  const end = Buffer.alloc(22)
  end.writeUInt32LE(0x06054b50, 0)
  end.writeUInt16LE(files.length, 8)
  end.writeUInt16LE(files.length, 10)
  end.writeUInt32LE(centralDirectory.byteLength, 12)
  end.writeUInt32LE(offset, 16)
  return Buffer.concat([...localParts, centralDirectory, end])
}

export function createValidationExportPackage(input: ValidationExportInput): ValidationExportPackage {
  if (input.request.requestHash !== input.materialization.receipt.requestHash) throw new Error('VALIDATION_EXPORT_REQUEST_BINDING_MISMATCH')
  if (sha256(JSON.parse(JSON.stringify(input.materialization.request)) as JsonValue) !== input.materialization.receipt.nativeRequestHash) throw new Error('VALIDATION_EXPORT_MATERIALIZATION_HASH_MISMATCH')
  const byId = new Map(input.assets.map((asset) => [asset.id, asset]))
  const mappings = [...input.request.referenceMappings].sort((left, right) => left.order - right.order || (left.id < right.id ? -1 : left.id > right.id ? 1 : 0))
  const referenceFiles = mappings.map((mapping, index) => {
    const asset = byId.get(mapping.assetId)
    if (!asset || asset.contentHash !== mapping.contentHash) throw new Error(`VALIDATION_EXPORT_ASSET_BINDING_MISMATCH:${mapping.assetId}`)
    assertSafeBytes(asset.bytes)
    const fileName = `references/${String(index + 1).padStart(2, '0')}-${safeRole(mapping.role)}.${extensionFor(asset.mediaType)}`
    return { mapping, asset, fileName }
  })
  const manifest: JsonObject = {
    schemaVersion: 'voce.playground-validation-manifest/v1alpha1',
    scenarioId: input.scenarioId,
    requestHash: input.request.requestHash,
    promptHash: input.request.promptIRHash,
    finalPromptHash: sha256(input.materialization.request.prompt),
    referenceMappings: referenceFiles.map(({ mapping, asset, fileName }) => ({
      order: mapping.order,
      fileName,
      assetId: mapping.assetId,
      contentHash: asset.contentHash,
      role: mapping.role,
      typedMetadata: (mapping.typedMetadata ?? {}) as JsonObject,
      authorizedTargetPaths: mapping.authorizedTargetPaths ?? [],
      prohibitedTargetPaths: mapping.prohibitedTargetPaths ?? [],
    })),
    compositionSelections: JSON.parse(JSON.stringify(input.compositionSelections)) as JsonValue,
    evaluation: JSON.parse(JSON.stringify(input.evaluationPlan)) as JsonValue,
  }
  const finalPrompt = input.materialization.request.prompt
  const checklist = [
    '# Validation acceptance checklist',
    '',
    `- Request hash: \`${input.request.requestHash}\``,
    `- Prompt hash: \`${input.request.promptIRHash}\``,
    '- This package does not authorize a model call. No automatic retry is authorized.',
    '',
    ...input.evaluationPlan.criteria.map((criterion) => `- [ ] ${criterion.label}: ${criterion.expectation}`),
    '',
  ].join('\n')
  const manifestText = `${JSON.stringify(manifest, null, 2)}\n`
  assertSafeText(manifestText)
  assertSafeText(finalPrompt)
  assertSafeText(checklist)
  const files = [
    { name: 'validation-manifest.json', bytes: Buffer.from(manifestText, 'utf8') },
    { name: 'final-prompt.txt', bytes: Buffer.from(finalPrompt, 'utf8') },
    ...referenceFiles.map(({ asset, fileName }) => ({ name: fileName, bytes: asset.bytes })),
    { name: 'acceptance-checklist.md', bytes: Buffer.from(checklist, 'utf8') },
  ]
  return { bytes: zipStored(files), manifest, fileNames: files.map((file) => file.name) }
}
