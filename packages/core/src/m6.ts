import { createHash } from 'node:crypto'
import { mkdir, writeFile } from 'node:fs/promises'
import { dirname } from 'node:path'
import type {
  ArtifactHandle,
  AssetSink,
  AssetSinkPutInput,
  AssetSinkRemoteInput,
  Budget,
  CleanupReceipt,
  ComparisonCategory,
  ComparisonEntry,
  ComparisonReport,
  ComparisonSnapshot,
  Evaluation,
  EvaluationCleanupStatus,
  EvaluationReplayStatus,
  EvaluationReport,
  ExecutionRun,
  HumanAcceptance,
  HumanAcceptanceAnnotation,
  HumanAcceptanceDecision,
  JsonObject,
  JsonValue,
  ProviderError,
  ProviderRequestEnvelope,
  ProviderResponseEnvelope,
  ProviderSubmissionLookup,
  ProviderTransport,
  ProviderTransportContext,
  RemoteCallAuthorization,
  RemoteCallRun,
  ReportArtifact,
  SemanticReviewCriterion,
  SemanticReviewFinding,
  SemanticReviewReport,
  SemanticReviewRequest,
  SemanticReviewer,
  StaticTraceReportModel,
  StaticTraceStep,
  StepReceipt,
  StructuralFindingSeverity,
  StructuralValidationArtifactInput,
  StructuralValidationFinding,
  StructuralValidationInput,
  StructuralValidationReport,
  OutputContract,
  VersionPin,
} from '@voce-engine/contracts'
import {
  ARTIFACT_REPLAY_RESULT_SCHEMA_VERSION,
  COMPARISON_ENTRY_SCHEMA_VERSION,
  COMPARISON_REPORT_SCHEMA_VERSION,
  EVALUATION_REPORT_SCHEMA_VERSION,
  HUMAN_ACCEPTANCE_ANNOTATION_SCHEMA_VERSION,
  HUMAN_ACCEPTANCE_DECISION_SCHEMA_VERSION,
  PROVIDER_ERROR_SCHEMA_VERSION,
  PROVIDER_REQUEST_ENVELOPE_SCHEMA_VERSION,
  PROVIDER_RESPONSE_ENVELOPE_SCHEMA_VERSION,
  PROVIDER_SUBMISSION_LOOKUP_SCHEMA_VERSION,
  REPORT_ARTIFACT_SCHEMA_VERSION,
  SEMANTIC_REVIEW_FINDING_SCHEMA_VERSION,
  SEMANTIC_REVIEW_REPORT_SCHEMA_VERSION,
  SEMANTIC_REVIEW_REQUEST_SCHEMA_VERSION,
  STATIC_TRACE_REPORT_MODEL_SCHEMA_VERSION,
  STRUCTURAL_VALIDATION_FINDING_SCHEMA_VERSION,
  STRUCTURAL_VALIDATION_INPUT_SCHEMA_VERSION,
  STRUCTURAL_VALIDATION_REPORT_SCHEMA_VERSION,
} from '@voce-engine/contracts'
import { canonicalize, sha256 } from './canonical.js'
import { computeRemoteCallAuthorizationHash, dispatchPreflight } from './m4.js'

export const M6_RUNTIME_VERSION = 'voce.adapters-evaluation-runtime/v1alpha1'
export const STATIC_REPORT_VERSION = 'voce.static-trace-report/v1alpha1'
export const FIXED_M6_TIME = '2026-01-01T00:00:00.000Z'

const HASH_PATTERN = /^sha256:[0-9a-f]{64}$/
const SAFE_URL_PATTERN = /^https?:\/\//i
const SECRET_PATTERN = /(authorization\s*:\s*bearer\s+|bearer\s+|api[-_ ]?key\s*[:=]\s*|secret\s*[:=]\s*|sk-[A-Za-z0-9_-]+|x-[A-Za-z0-9-]+-key\s*[:=]\s*)[^\s<>&"']+/gi
const DATA_URI_PATTERN = /data:[^,;\s]+(?:;[^,\s]+)*,[^\s<>&"']+/gi
const SIGNED_URL_PATTERN = /https?:\/\/[^\s<>&"']+[?&](?:signature|sig|token|expires|credential|security[-_]?token|x[-_]tos[-_](?:signature|credential|security[-_]?token)|x[-_]amz-[^=]+)=[^\s<>&"']+/gi
const DATA_URI_DETECTION_PATTERN = /^data:[^,;\s]+(?:;[^,\s]+)*,/i
const BASE64_LIKE_PATTERN = /^[A-Za-z0-9+/]{80,}={0,2}$/
const ABSOLUTE_PATH_PATTERN = /(?:[A-Za-z]:\\|\\\\|\/Users\/|\/home\/|\/tmp\/)[^\s<>&"']+/g

export interface ProviderCallRecord {
  requestId: string
  requestHash: string
  adapterId: string
  profileDigest: string
  destination: string
  region?: string
  inputHash: string
  idempotencyKey: string
}

export interface RecordingMockResponse {
  requestHash?: string
  response: ProviderResponseEnvelope
}

export interface RecordingMockTransportOptions {
  responses?: ProviderResponseEnvelope[]
  lookups?: ProviderResponseEnvelope[]
}

export class ProviderTransportError extends Error {
  readonly code: string
  readonly safeDetails?: JsonObject

  constructor(code: string, message: string, safeDetails?: JsonObject) {
    super(`${code}: ${message}`)
    this.name = 'ProviderTransportError'
    this.code = code
    this.safeDetails = safeDetails
  }
}

function compareCodeUnits(left: string, right: string): number {
  const length = Math.min(left.length, right.length)
  for (let index = 0; index < length; index += 1) {
    const difference = left.charCodeAt(index) - right.charCodeAt(index)
    if (difference !== 0) return difference
  }
  return left.length - right.length
}

function jsonReady(value: unknown): JsonValue {
  if (value === null || typeof value === 'boolean' || typeof value === 'string') return value
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) throw new ProviderTransportError('INPUT_INVALID', 'Numeric input is not finite.')
    return value
  }
  if (Array.isArray(value)) return value.map((item) => jsonReady(item === undefined ? null : item))
  if (value && typeof value === 'object') {
    if (value instanceof Uint8Array) return Array.from(value)
    const object: JsonObject = {}
    for (const [key, item] of Object.entries(value as Record<string, unknown>)) {
      if (item !== undefined) object[key] = jsonReady(item)
    }
    return object
  }
  throw new ProviderTransportError('INPUT_INVALID', 'Input is not JSON-compatible.')
}

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(jsonReady(value))) as T
}

function sortedStrings(values: string[] | undefined): string[] {
  return [...new Set(values ?? [])].sort(compareCodeUnits)
}

function sortedBy<T>(values: T[], key: (value: T) => string): T[] {
  return values.map((value) => clone(value)).sort((left, right) => compareCodeUnits(key(left), key(right)) || compareCodeUnits(canonicalize(jsonReady(left)), canonicalize(jsonReady(right))))
}

function isHash(value: unknown): value is string {
  return typeof value === 'string' && HASH_PATTERN.test(value)
}

function hashId(prefix: string, value: unknown): string {
  return `${prefix}-${sha256(jsonReady(value)).slice('sha256:'.length, 'sha256:'.length + 24)}`
}

function without(value: unknown, field: string): JsonObject {
  const result = jsonReady(value)
  if (result === null || typeof result !== 'object' || Array.isArray(result)) return {}
  delete (result as JsonObject)[field]
  return result as JsonObject
}

function binarySha256(bytes: Uint8Array): string {
  return `sha256:${createHash('sha256').update(bytes).digest('hex')}`
}

export function computeArtifactBytesHash(bytes: Uint8Array): string { return binarySha256(bytes) }

function safeMessage(message: string): string {
  return message.replace(SECRET_PATTERN, '[REDACTED]').replace(DATA_URI_PATTERN, '[REDACTED_DATA]').replace(SIGNED_URL_PATTERN, '[REDACTED_URL]').replace(ABSOLUTE_PATH_PATTERN, '[REDACTED_PATH]')
}

function safeJson(value: unknown): JsonValue {
  if (typeof value === 'string') {
    if (BASE64_LIKE_PATTERN.test(value)) return '[REDACTED_BASE64]'
    return safeMessage(value)
  }
  if (Array.isArray(value)) return value.map((item) => safeJson(item))
  if (value && typeof value === 'object') {
    const object: JsonObject = {}
    for (const [key, item] of Object.entries(value as Record<string, unknown>)) {
      if (/authorization|credential|secret|api.?key|base64|b64_json|signed.?url|local.?path|security.?token|x[-_]?tos|x[-_]?amz|signature/i.test(key)) object[key] = '[REDACTED]'
      else object[key] = safeJson(item)
    }
    return object
  }
  return (value ?? null) as JsonValue
}

function sensitiveHashProjection(value: string, kind: string): JsonObject {
  return { kind, valueHash: sha256(value), length: value.length }
}

function hashJson(value: unknown, key?: string): JsonValue {
  if (typeof value === 'string') {
    if (key && /authorization|credential|secret|api.?key|base64|b64_json|signed.?url|security.?token|x[-_]?tos|x[-_]?amz|signature/i.test(key)) return sensitiveHashProjection(value, 'sensitive-string')
    if (DATA_URI_DETECTION_PATTERN.test(value)) return sensitiveHashProjection(value, 'data-uri')
    SIGNED_URL_PATTERN.lastIndex = 0
    if (SIGNED_URL_PATTERN.test(value)) return sensitiveHashProjection(value, 'signed-url')
    if (BASE64_LIKE_PATTERN.test(value)) return sensitiveHashProjection(value, 'base64-like')
    return value
  }
  if (value === null || typeof value === 'boolean' || typeof value === 'number') return value
  if (Array.isArray(value)) return value.map((item) => hashJson(item, key))
  if (value && typeof value === 'object') {
    if (value instanceof Uint8Array) return sensitiveHashProjection(Buffer.from(value).toString('base64'), 'bytes')
    const object: JsonObject = {}
    for (const [childKey, item] of Object.entries(value as Record<string, unknown>)) object[childKey] = hashJson(item, childKey)
    return object
  }
  return null
}

function assertHash(value: unknown, code = 'HASH_INVALID'): asserts value is string {
  if (!isHash(value)) throw new ProviderTransportError(code, 'A supplied content hash is invalid.')
}

function normalizeProviderRequestProjection(request: ProviderRequestEnvelope): JsonObject {
  return jsonReady({
    schemaVersion: PROVIDER_REQUEST_ENVELOPE_SCHEMA_VERSION,
    id: request.id,
    adapterId: request.adapterId,
    adapterDigest: request.adapterDigest,
    profileId: request.profileId,
    profileDigest: request.profileDigest,
    ...(request.modelId === undefined ? {} : { modelId: request.modelId }),
    ...(request.modelVersion === undefined ? {} : { modelVersion: request.modelVersion }),
    stepId: request.stepId,
    destination: request.destination,
    ...(request.region === undefined ? {} : { region: request.region }),
    purpose: request.purpose,
    inputHash: request.inputHash,
    inputArtifactHashes: sortedStrings(request.inputArtifactHashes),
    dataCategories: sortedStrings(request.dataCategories),
    maximumCalls: request.maximumCalls,
    maximumRetries: request.maximumRetries,
    timeoutMs: request.timeoutMs,
    ...(request.maximumBytes === undefined ? {} : { maximumBytes: request.maximumBytes }),
    ...(request.maximumCost === undefined ? {} : { maximumCost: request.maximumCost }),
    idempotencyKey: request.idempotencyKey,
    payload: hashJson(request.payload),
  }) as JsonObject
}

export function computeProviderRequestEnvelopeHash(request: ProviderRequestEnvelope): string {
  return sha256(normalizeProviderRequestProjection(request))
}

function normalizeProviderResponseProjection(response: ProviderResponseEnvelope): JsonObject {
  return jsonReady({
    schemaVersion: PROVIDER_RESPONSE_ENVELOPE_SCHEMA_VERSION,
    requestHash: response.requestHash,
    status: response.status,
    ...(response.providerRequestId === undefined ? {} : { providerRequestId: response.providerRequestId }),
    ...(response.body === undefined ? {} : { body: hashJson(response.body) }),
    outputArtifactIds: sortedStrings(response.outputArtifactIds),
    ...(response.error === undefined ? {} : { error: normalizeProviderErrorProjection(response.error) }),
  }) as JsonObject
}

export function computeProviderResponseEnvelopeHash(response: ProviderResponseEnvelope): string {
  return sha256(normalizeProviderResponseProjection(response))
}

function normalizeProviderErrorProjection(error: ProviderError): JsonObject {
  return jsonReady({
    schemaVersion: PROVIDER_ERROR_SCHEMA_VERSION,
    code: error.code,
    message: safeMessage(error.message),
    retryable: error.retryable,
    submissionUnknown: error.submissionUnknown,
    ...(error.safeDetails === undefined ? {} : { safeDetails: hashJson(error.safeDetails) }),
  }) as JsonObject
}

export function computeProviderErrorHash(error: ProviderError): string {
  return sha256(normalizeProviderErrorProjection(error))
}

function normalizeLookupProjection(request: ProviderSubmissionLookup): JsonObject {
  return jsonReady({
    schemaVersion: PROVIDER_SUBMISSION_LOOKUP_SCHEMA_VERSION,
    requestId: request.requestId,
    adapterId: request.adapterId,
    adapterDigest: request.adapterDigest,
    profileId: request.profileId,
    profileDigest: request.profileDigest,
    ...(request.modelId === undefined ? {} : { modelId: request.modelId }),
    ...(request.modelVersion === undefined ? {} : { modelVersion: request.modelVersion }),
    destination: request.destination,
    ...(request.region === undefined ? {} : { region: request.region }),
    stepId: request.stepId,
    purpose: request.purpose,
    ...(request.providerRequestId === undefined ? {} : { providerRequestId: request.providerRequestId }),
    requestHash: request.requestHash,
    idempotencyKey: request.idempotencyKey,
    inputHash: request.inputHash,
    inputArtifactHashes: sortedStrings(request.inputArtifactHashes),
    dataCategories: sortedStrings(request.dataCategories),
    maximumCalls: request.maximumCalls,
    maximumRetries: request.maximumRetries,
    timeoutMs: request.timeoutMs,
    ...(request.maximumBytes === undefined ? {} : { maximumBytes: request.maximumBytes }),
    ...(request.maximumCost === undefined ? {} : { maximumCost: request.maximumCost }),
  }) as JsonObject
}

export function computeProviderSubmissionLookupHash(request: ProviderSubmissionLookup): string {
  return sha256(normalizeLookupProjection(request))
}

function errorResponse(requestHash: string, code: string, message: string, retryable = false, submissionUnknown = false): ProviderResponseEnvelope {
  const errorBase: Omit<ProviderError, 'errorHash'> = {
    schemaVersion: PROVIDER_ERROR_SCHEMA_VERSION,
    code,
    message: safeMessage(message),
    retryable,
    submissionUnknown,
  }
  const error = { ...errorBase, errorHash: computeProviderErrorHash(errorBase as ProviderError) }
  const base: Omit<ProviderResponseEnvelope, 'responseHash'> = { schemaVersion: PROVIDER_RESPONSE_ENVELOPE_SCHEMA_VERSION, requestHash, status: submissionUnknown ? 'submission_unknown' : 'failed', outputArtifactIds: [], error }
  return { ...base, responseHash: computeProviderResponseEnvelopeHash(base as ProviderResponseEnvelope) }
}

export class DisabledProviderTransport implements ProviderTransport {
  readonly id = 'voce.disabled-transport'
  readonly mode = 'offline' as const

  async send(request: ProviderRequestEnvelope, context: ProviderTransportContext): Promise<ProviderResponseEnvelope> {
    assertRemoteCallAuthorization(request, context)
    return errorResponse(request.requestHash, 'PROVIDER_TRANSPORT_DISABLED', 'Provider transport is disabled in offline mode.')
  }

  async lookup(request: ProviderSubmissionLookup, context: ProviderTransportContext): Promise<ProviderResponseEnvelope> {
    assertRemoteCallAuthorization(request, context)
    return errorResponse(request.requestHash, 'PROVIDER_TRANSPORT_DISABLED', 'Provider transport is disabled in offline mode.')
  }
}

function assertRemoteCallAuthorization(request: ProviderRequestEnvelope | ProviderSubmissionLookup, context: ProviderTransportContext): void {
  const authorization = context.authorization
  if (!context.credential || !context.credential.ref || !context.credential.value) throw new ProviderTransportError('ADAPTER_CREDENTIAL_MISSING', 'Host credential injection is missing.')
  if (!authorization || computeRemoteCallAuthorizationHash(authorization) !== authorization.authorizationHash) throw new ProviderTransportError('REMOTE_CALL_AUTHORIZATION_INVALID', 'Remote call authorization is invalid.')
  const isRequest = 'payload' in request
  if (isRequest && computeProviderRequestEnvelopeHash(request as ProviderRequestEnvelope) !== request.requestHash) throw new ProviderTransportError('PROVIDER_REQUEST_HASH_MISMATCH', 'Provider request hash is invalid.')
  if (!isRequest && computeProviderSubmissionLookupHash(request as ProviderSubmissionLookup) !== request.lookupHash) throw new ProviderTransportError('PROVIDER_LOOKUP_HASH_MISMATCH', 'Submission lookup hash is invalid.')
  const reasons: string[] = []
  if (authorization.stepId !== request.stepId) reasons.push('stepId')
  if (authorization.purpose !== request.purpose) reasons.push('purpose')
  if (authorization.adapterId !== request.adapterId) reasons.push('adapterId')
  if (authorization.adapterDigest !== request.adapterDigest) reasons.push('adapterDigest')
  if (authorization.profileDigest !== request.profileDigest) reasons.push('profileDigest')
  if (authorization.modelId !== request.modelId) reasons.push('modelId')
  if (authorization.modelVersion !== request.modelVersion) reasons.push('modelVersion')
  if (authorization.destination !== request.destination || authorization.region !== request.region) reasons.push('destination')
  if (authorization.inputHash !== request.inputHash) reasons.push('inputHash')
  if (authorization.idempotencyKey !== request.idempotencyKey) reasons.push('idempotencyKey')
  if (authorization.maximumCalls !== request.maximumCalls || authorization.maximumRetries !== request.maximumRetries || authorization.timeoutMs !== request.timeoutMs) reasons.push('budget')
  if (authorization.maximumBytes !== request.maximumBytes || authorization.maximumCost !== request.maximumCost) reasons.push('limits')
  if (canonicalize(jsonReady(sortedStrings(authorization.permittedArtifactHashes))) !== canonicalize(jsonReady(sortedStrings(request.inputArtifactHashes)))) reasons.push('artifactHashes')
  if ('dataCategories' in request && canonicalize(jsonReady(sortedStrings(authorization.dataCategories))) !== canonicalize(jsonReady(sortedStrings(request.dataCategories)))) reasons.push('dataCategories')
  if (!isRequest && request.requestId.length === 0) reasons.push('requestId')
  if (reasons.length) throw new ProviderTransportError('REMOTE_CALL_AUTHORIZATION_SCOPE_MISMATCH', 'Remote call authorization scope does not match the provider envelope.', { fields: reasons } as JsonObject)
  const preflight = dispatchPreflight(authorization, {
    kind: 'remote_call',
    caseId: authorization.caseId,
    caseRevision: authorization.caseRevision,
    contextHash: authorization.contextHash,
    stepId: authorization.stepId,
    purpose: authorization.purpose,
    inputHash: authorization.inputHash,
    inputManifestHash: authorization.inputManifestHash,
    modelId: authorization.modelId,
    modelVersion: authorization.modelVersion,
    permittedArtifactHashes: authorization.permittedArtifactHashes,
    permittedScopeIds: authorization.permittedScopeIds,
    constraintIds: authorization.constraintIds,
    adapterId: authorization.adapterId,
    adapterDigest: authorization.adapterDigest,
    profileDigest: authorization.profileDigest,
    destination: authorization.destination,
    region: authorization.region,
    dataCategories: authorization.dataCategories,
    maximumCalls: authorization.maximumCalls,
    maximumRetries: authorization.maximumRetries,
    maximumBytes: authorization.maximumBytes,
    timeoutMs: authorization.timeoutMs,
    maximumCost: authorization.maximumCost,
    currency: authorization.currency,
    idempotencyKey: authorization.idempotencyKey,
  })
  if (preflight.status !== 'authorized') throw new ProviderTransportError('REMOTE_CALL_NOT_AUTHORIZED', 'Remote call preflight was blocked.')
}

function providerBindingMatches(request: ProviderRequestEnvelope, lookup: ProviderSubmissionLookup): boolean {
  return request.id === lookup.requestId
    && request.adapterId === lookup.adapterId
    && request.adapterDigest === lookup.adapterDigest
    && request.profileId === lookup.profileId
    && request.profileDigest === lookup.profileDigest
    && request.modelId === lookup.modelId
    && request.modelVersion === lookup.modelVersion
    && request.destination === lookup.destination
    && request.region === lookup.region
    && request.stepId === lookup.stepId
    && request.purpose === lookup.purpose
    && request.requestHash === lookup.requestHash
    && request.idempotencyKey === lookup.idempotencyKey
    && request.inputHash === lookup.inputHash
    && canonicalize(jsonReady(sortedStrings(request.inputArtifactHashes))) === canonicalize(jsonReady(sortedStrings(lookup.inputArtifactHashes)))
    && canonicalize(jsonReady(sortedStrings(request.dataCategories))) === canonicalize(jsonReady(sortedStrings(lookup.dataCategories)))
    && request.maximumCalls === lookup.maximumCalls
    && request.maximumRetries === lookup.maximumRetries
    && request.timeoutMs === lookup.timeoutMs
    && request.maximumBytes === lookup.maximumBytes
    && request.maximumCost === lookup.maximumCost
}

export function createProviderSubmissionLookup(request: ProviderRequestEnvelope, providerRequestId?: string): ProviderSubmissionLookup {
  const base: Omit<ProviderSubmissionLookup, 'lookupHash'> = {
    schemaVersion: PROVIDER_SUBMISSION_LOOKUP_SCHEMA_VERSION,
    requestId: request.id,
    adapterId: request.adapterId,
    adapterDigest: request.adapterDigest,
    profileId: request.profileId,
    profileDigest: request.profileDigest,
    ...(request.modelId === undefined ? {} : { modelId: request.modelId }),
    ...(request.modelVersion === undefined ? {} : { modelVersion: request.modelVersion }),
    destination: request.destination,
    ...(request.region === undefined ? {} : { region: request.region }),
    stepId: request.stepId,
    purpose: request.purpose,
    ...(providerRequestId === undefined ? {} : { providerRequestId }),
    requestHash: request.requestHash,
    idempotencyKey: request.idempotencyKey,
    inputHash: request.inputHash,
    inputArtifactHashes: sortedStrings(request.inputArtifactHashes),
    dataCategories: sortedStrings(request.dataCategories),
    maximumCalls: request.maximumCalls,
    maximumRetries: request.maximumRetries,
    timeoutMs: request.timeoutMs,
    ...(request.maximumBytes === undefined ? {} : { maximumBytes: request.maximumBytes }),
    ...(request.maximumCost === undefined ? {} : { maximumCost: request.maximumCost }),
  }
  return clone({ ...base, lookupHash: computeProviderSubmissionLookupHash(base as ProviderSubmissionLookup) })
}

function safeResponse(response: ProviderResponseEnvelope): ProviderResponseEnvelope {
  if (computeProviderResponseEnvelopeHash(response) !== response.responseHash) throw new ProviderTransportError('PROVIDER_RESPONSE_HASH_MISMATCH', 'Provider response hash is invalid.')
  if (!isHash(response.requestHash)) throw new ProviderTransportError('PROVIDER_RESPONSE_INVALID', 'Provider response request hash is invalid.')
  if (response.error && computeProviderErrorHash(response.error) !== response.error.errorHash) throw new ProviderTransportError('PROVIDER_ERROR_HASH_MISMATCH', 'Provider error hash is invalid.')
  return clone(response)
}

function publicResponseReceipt(response: ProviderResponseEnvelope): ProviderResponseEnvelope {
  const safeError = response.error === undefined ? undefined : (() => {
    const errorBase: Omit<ProviderError, 'errorHash'> = {
      schemaVersion: PROVIDER_ERROR_SCHEMA_VERSION,
      code: response.error.code,
      message: safeMessage(response.error.message),
      retryable: response.error.retryable,
      submissionUnknown: response.error.submissionUnknown,
      ...(response.error.safeDetails === undefined ? {} : { safeDetails: safeJson(response.error.safeDetails) as JsonObject }),
    }
    return { ...errorBase, errorHash: computeProviderErrorHash(errorBase as ProviderError) }
  })()
  const base: Omit<ProviderResponseEnvelope, 'responseHash'> = {
    schemaVersion: PROVIDER_RESPONSE_ENVELOPE_SCHEMA_VERSION,
    requestHash: response.requestHash,
    status: response.status,
    ...(response.providerRequestId === undefined ? {} : { providerRequestId: response.providerRequestId }),
    outputArtifactIds: sortedStrings(response.outputArtifactIds),
    ...(safeError === undefined ? {} : { error: safeError }),
  }
  return clone({ ...base, responseHash: computeProviderResponseEnvelopeHash(base as ProviderResponseEnvelope) })
}

export class RecordingMockTransport implements ProviderTransport {
  readonly id = 'voce.recording-mock-transport'
  readonly mode = 'offline' as const
  readonly calls: ProviderCallRecord[] = []
  readonly lookupCalls: ProviderCallRecord[] = []
  private readonly responses: ProviderResponseEnvelope[]
  private readonly lookups: ProviderResponseEnvelope[]
  private readonly sentRequests = new Map<string, ProviderRequestEnvelope>()
  private readonly sendCounts = new Map<string, number>()
  private readonly lookupCounts = new Map<string, number>()

  constructor(options: RecordingMockTransportOptions | ProviderResponseEnvelope[] = {}) {
    if (Array.isArray(options)) { this.responses = options.map((item) => clone(item)); this.lookups = [] }
    else { this.responses = (options.responses ?? []).map((item) => clone(item)); this.lookups = (options.lookups ?? []).map((item) => clone(item)) }
  }

  enqueue(response: ProviderResponseEnvelope): void { this.responses.push(clone(response)) }
  enqueueLookup(response: ProviderResponseEnvelope): void { this.lookups.push(clone(response)) }

  private consume(kind: 'send'|'lookup', authorization: RemoteCallAuthorization): void {
    const key = `${authorization.id}:${authorization.idempotencyKey}`
    const counts = kind === 'send' ? this.sendCounts : this.lookupCounts
    const count = counts.get(key) ?? 0
    if (count >= authorization.maximumCalls) throw new ProviderTransportError('REMOTE_CALL_BUDGET_EXHAUSTED', `Remote ${kind} budget has been exhausted.`)
    counts.set(key, count + 1)
  }

  private consumeResponse(queued: ProviderResponseEnvelope[], requestHash: string, missingCode: string, missingMessage: string): ProviderResponseEnvelope {
    const exactIndex = queued.findIndex((item) => item.requestHash === requestHash)
    if (exactIndex >= 0) return queued.splice(exactIndex, 1)[0]
    const wildcardIndex = queued.findIndex((item) => item.requestHash === '')
    if (wildcardIndex >= 0) return queued.splice(wildcardIndex, 1)[0]
    return errorResponse(requestHash, missingCode, missingMessage)
  }

  async send(request: ProviderRequestEnvelope, context: ProviderTransportContext): Promise<ProviderResponseEnvelope> {
    assertRemoteCallAuthorization(request, context)
    this.consume('send', context.authorization)
    const identity = `${context.authorization.id}:${context.authorization.idempotencyKey}`
    const prior = this.sentRequests.get(identity)
    if (prior && !providerBindingMatches(prior, createProviderSubmissionLookup(request))) throw new ProviderTransportError('REMOTE_CALL_IDENTITY_REUSED', 'Idempotency identity cannot be reused for a different provider request.')
    this.sentRequests.set(identity, clone(request))
    this.calls.push({ requestId: request.id, requestHash: request.requestHash, adapterId: request.adapterId, profileDigest: request.profileDigest, destination: request.destination, ...(request.region === undefined ? {} : { region: request.region }), inputHash: request.inputHash, idempotencyKey: request.idempotencyKey })
    const response = this.consumeResponse(this.responses, request.requestHash, 'MOCK_RESPONSE_MISSING', 'Recording mock response was not registered.')
    const normalized = response.requestHash === request.requestHash ? response : { ...response, requestHash: request.requestHash, responseHash: '' }
    if (!normalized.responseHash) normalized.responseHash = computeProviderResponseEnvelopeHash(normalized)
    return safeResponse(normalized)
  }

  async lookup(request: ProviderSubmissionLookup, context: ProviderTransportContext): Promise<ProviderResponseEnvelope> {
    assertRemoteCallAuthorization(request, context)
    this.consume('lookup', context.authorization)
    const identity = `${context.authorization.id}:${context.authorization.idempotencyKey}`
    const original = this.sentRequests.get(identity)
    if (!original || !providerBindingMatches(original, request)) throw new ProviderTransportError('PROVIDER_LOOKUP_BINDING_MISMATCH', 'Submission lookup is not bound to a prior provider request.')
    this.lookupCalls.push({ requestId: request.providerRequestId ?? request.lookupHash, requestHash: request.requestHash, adapterId: request.adapterId, profileDigest: request.profileDigest, destination: request.destination, ...(request.region === undefined ? {} : { region: request.region }), inputHash: request.inputHash, idempotencyKey: request.idempotencyKey })
    const response = this.consumeResponse(this.lookups, request.requestHash, 'MOCK_LOOKUP_RESPONSE_MISSING', 'Recording lookup response was not registered.')
    const normalized = response.requestHash === request.requestHash ? response : { ...response, requestHash: request.requestHash, responseHash: '' }
    if (!normalized.responseHash) normalized.responseHash = computeProviderResponseEnvelopeHash(normalized)
    return safeResponse(normalized)
  }
}

export interface SeedreamAdapterConfig {
  endpoint: string
  credentialRef: string
  model: string
  modelVersion: string
  adapter: VersionPin
  profile: VersionPin
  destination: string
  region?: string
  endpointProfile?: 'domestic'|'overseas'
  transport?: ProviderTransport
  assetSink: AssetSink
  resolver?: (artifact: ArtifactHandle) => Promise<Uint8Array|undefined>
}

export type SeedreamImageInput = string | ArtifactHandle | Uint8Array

export interface SeedreamGenerateInput {
  prompt: string
  image?: SeedreamImageInput | SeedreamImageInput[]
  n?: number
  sequential_image_generation?: unknown
  output_format?: 'png'|'jpeg'
  size?: string
  watermark?: boolean
  referenceArtifacts?: StructuralValidationArtifactInput[]
  [key: string]: unknown
}

export interface SeedreamGenerationResult {
  status: 'succeeded'|'failed'|'submission_unknown'
  artifacts: ArtifactHandle[]
  response: ProviderResponseEnvelope
  lookup?: ProviderSubmissionLookup
  failureCode?: string
}

function validateEndpointProfile(endpoint: string, endpointProfile: 'domestic'|'overseas'|undefined): void {
  if (!endpointProfile) return
  let hostname: string
  try { hostname = new URL(endpoint).hostname.toLowerCase() } catch { throw new ProviderTransportError('ADAPTER_ENDPOINT_INVALID', 'Provider endpoint is not a valid URL.') }
  const expected = endpointProfile === 'domestic' ? 'volces.com' : 'bytepluses.com'
  if (!(hostname === expected || hostname.endsWith(`.${expected}`))) throw new ProviderTransportError('ADAPTER_ENDPOINT_PROFILE_MISMATCH', 'Provider endpoint host does not match the configured endpoint profile.')
}

function validateAdapterConfig(config: Pick<SeedreamAdapterConfig, 'endpoint'|'credentialRef'|'model'|'modelVersion'|'adapter'|'profile'|'destination'|'endpointProfile'>): void {
  if (!config.endpoint || !SAFE_URL_PATTERN.test(config.endpoint)) throw new ProviderTransportError('ADAPTER_ENDPOINT_MISSING', 'Provider endpoint is missing or invalid.')
  validateEndpointProfile(config.endpoint, config.endpointProfile)
  if (!config.credentialRef) throw new ProviderTransportError('ADAPTER_CREDENTIAL_MISSING', 'Provider credential reference is missing.')
  if (!config.model) throw new ProviderTransportError('ADAPTER_MODEL_MISSING', 'Provider model is missing.')
  if (!config.modelVersion) throw new ProviderTransportError('ADAPTER_MODEL_VERSION_MISSING', 'Provider model version is missing.')
  if (!config.adapter?.id || !isHash(config.adapter.digest)) throw new ProviderTransportError('ADAPTER_VERSION_INVALID', 'Adapter version or digest is invalid.')
  if (!config.profile?.id || !isHash(config.profile.digest)) throw new ProviderTransportError('ADAPTER_PROFILE_INVALID', 'Provider profile or digest is invalid.')
  if (!config.destination) throw new ProviderTransportError('ADAPTER_DESTINATION_MISSING', 'Provider destination is missing.')
  if (config.destination !== config.endpoint) throw new ProviderTransportError('ADAPTER_DESTINATION_ENDPOINT_MISMATCH', 'Provider destination must be the exact configured endpoint used by the transport.')
}

function imageInputs(value: SeedreamImageInput | SeedreamImageInput[] | undefined): SeedreamImageInput[] {
  if (value === undefined) return []
  return Array.isArray(value) ? value : [value]
}

function imageBytes(value: SeedreamImageInput, references: StructuralValidationArtifactInput[]): Uint8Array | undefined {
  if (value instanceof Uint8Array) return value
  if (typeof value === 'string') {
    const match = value.match(/^data:([^;,]+);base64,(.+)$/i)
    if (!match) return undefined
    try { return Uint8Array.from(Buffer.from(match[2], 'base64')) } catch { return undefined }
  }
  const reference = references.find((item) => item.artifact.id === value.id)
  return reference?.bytes
}

function mediaTypeOf(value: SeedreamImageInput, references: StructuralValidationArtifactInput[]): string | undefined {
  if (value instanceof Uint8Array) {
    const header = parseImageHeader(value)
    return header.format === 'png' ? 'image/png' : header.format === 'jpeg' ? 'image/jpeg' : header.format === 'webp' ? 'image/webp' : undefined
  }
  if (typeof value === 'object' && !(value instanceof Uint8Array)) return value.mediaType
  if (typeof value === 'string') return value.match(/^data:([^;,]+)/i)?.[1]
  return references.find((item) => item.bytes === value)?.artifact.mediaType
}

function toProviderImage(value: SeedreamImageInput, references: StructuralValidationArtifactInput[] = []): string {
  if (typeof value === 'string') {
    if (SAFE_URL_PATTERN.test(value)) return value
    if (DATA_URI_DETECTION_PATTERN.test(value)) return value
    throw new ProviderTransportError('SEEDREAM_IMAGE_REFERENCE_INVALID', 'Seedream image string must be an http(s) URL or image data URI.')
  }
  if (value instanceof Uint8Array) {
    const mediaType = mediaTypeOf(value, [])
    if (!mediaType || !['image/png', 'image/jpeg'].includes(mediaType)) throw new ProviderTransportError('SEEDREAM_IMAGE_MEDIA_TYPE_UNKNOWN', 'Seedream image bytes do not have a supported PNG or JPEG signature.')
    return `data:${mediaType};base64,${Buffer.from(value).toString('base64')}`
  }
  const bytes = imageBytes(value, references)
  if (!bytes) throw new ProviderTransportError('SEEDREAM_ARTIFACT_UNRESOLVED', 'Seedream ArtifactHandle must be resolved before request construction.')
  assertHash(value.contentHash, 'SEEDREAM_ARTIFACT_HASH_INVALID')
  if (binarySha256(bytes) !== value.contentHash) throw new ProviderTransportError('ARTIFACT_HASH_MISMATCH', 'Seedream reference bytes do not match the ArtifactHandle content hash.')
  const mediaType = mediaTypeOf(bytes, [])
  if (!mediaType || mediaType !== value.mediaType || !['image/png', 'image/jpeg'].includes(mediaType)) throw new ProviderTransportError('SEEDREAM_ARTIFACT_MEDIA_TYPE_MISMATCH', 'Seedream ArtifactHandle bytes do not have a supported matching media type.')
  return `data:${mediaType};base64,${Buffer.from(bytes).toString('base64')}`
}

function pngHeader(bytes: Uint8Array): { width: number; height: number; alpha: boolean } | undefined {
  if (bytes.length < 33 || ![137, 80, 78, 71, 13, 10, 26, 10].every((value, index) => bytes[index] === value)) return undefined
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  if (view.getUint32(12) !== 0x49484452) return undefined
  const colorType = bytes[25]
  let alpha = colorType === 4 || colorType === 6
  let offset = 8
  while (offset + 12 <= bytes.length) {
    const length = view.getUint32(offset)
    if (offset + length + 12 > bytes.length) break
    const type = String.fromCharCode(bytes[offset + 4], bytes[offset + 5], bytes[offset + 6], bytes[offset + 7])
    if (type === 'tRNS') alpha = true
    offset += length + 12
    if (type === 'IEND') break
  }
  return { width: view.getUint32(16), height: view.getUint32(20), alpha }
}

function seedreamAllowedKeys(): Set<string> {
  return new Set(['prompt', 'image', 'n', 'output_format', 'size', 'watermark', 'referenceArtifacts'])
}

function validateSeedreamInput(input: SeedreamGenerateInput): SeedreamImageInput[] {
  if (!input || typeof input.prompt !== 'string' || !input.prompt.trim()) throw new ProviderTransportError('SEEDREAM_PROMPT_MISSING', 'Seedream prompt is missing.')
  for (const key of Object.keys(input)) if (!seedreamAllowedKeys().has(key)) throw new ProviderTransportError('SEEDREAM_FIELD_UNSUPPORTED', 'Seedream request contains an unsupported field.')
  if ('sequential_image_generation' in input) throw new ProviderTransportError('SEEDREAM_SEQUENTIAL_IMAGE_GENERATION_FORBIDDEN', 'Sequential image generation is not allowed.')
  if (input.n !== undefined && input.n !== 1) throw new ProviderTransportError('SEEDREAM_CARDINALITY_INVALID', 'Seedream requires n=1.')
  if (input.output_format !== undefined && input.output_format !== 'png' && input.output_format !== 'jpeg') throw new ProviderTransportError('SEEDREAM_OUTPUT_FORMAT_UNSUPPORTED', 'Seedream output_format must be png or jpeg.')
  if (input.watermark !== undefined && typeof input.watermark !== 'boolean') throw new ProviderTransportError('SEEDREAM_WATERMARK_INVALID', 'Seedream watermark must be a boolean.')
  const images = imageInputs(input.image)
  if (images.length > 10) throw new ProviderTransportError('SEEDREAM_REFERENCE_LIMIT_EXCEEDED', 'Seedream accepts at most ten reference images.')
  for (const image of images) {
    if (typeof image === 'string' && !SAFE_URL_PATTERN.test(image) && !DATA_URI_DETECTION_PATTERN.test(image)) throw new ProviderTransportError('SEEDREAM_IMAGE_REFERENCE_INVALID', 'Seedream image string must be an http(s) URL or image data URI.')
    if (image instanceof Uint8Array && !mediaTypeOf(image, [])) throw new ProviderTransportError('SEEDREAM_IMAGE_MEDIA_TYPE_UNKNOWN', 'Seedream image bytes do not have a recognized media signature.')
  }
  return images
}

export function validateSeedreamConfig(config: SeedreamAdapterConfig): void { validateAdapterConfig(config) }

async function resolveSeedreamInput(input: SeedreamGenerateInput, config: SeedreamAdapterConfig): Promise<SeedreamGenerateInput> {
  const references = (input.referenceArtifacts ?? []).map((item) => ({ artifact: clone(item.artifact), ...(item.bytes === undefined ? {} : { bytes: new Uint8Array(item.bytes) }) }))
  const images = imageInputs(input.image)
  const resolved = await Promise.all(images.map(async (image): Promise<SeedreamImageInput> => {
    if (!(image && typeof image === 'object' && !(image instanceof Uint8Array) && 'contentHash' in image)) return image
    const reference = references.find((item) => item.artifact.id === image.id)
    const bytes = reference?.bytes ?? (config.resolver ? await config.resolver(image) : config.assetSink.resolve ? await config.assetSink.resolve(image) : undefined)
    if (!bytes) throw new ProviderTransportError('ARTIFACT_UNAVAILABLE', 'Seedream reference artifact could not be resolved.')
    assertHash(image.contentHash, 'SEEDREAM_ARTIFACT_HASH_INVALID')
    if (binarySha256(bytes) !== image.contentHash) throw new ProviderTransportError('ARTIFACT_HASH_MISMATCH', 'Seedream reference bytes do not match the ArtifactHandle content hash.')
    const actualMediaType = mediaTypeOf(bytes, [])
    if (!actualMediaType || actualMediaType !== image.mediaType) throw new ProviderTransportError('SEEDREAM_ARTIFACT_MEDIA_TYPE_MISMATCH', 'Seedream reference bytes do not match the ArtifactHandle media type.')
    const existing = references.find((item) => item.artifact.id === image.id)
    if (existing) existing.bytes = new Uint8Array(bytes)
    else references.push({ artifact: clone(image), bytes: new Uint8Array(bytes) })
    return clone(image)
  }))
  return { ...input, ...(input.image === undefined ? {} : { image: Array.isArray(input.image) ? resolved : resolved[0] }), referenceArtifacts: references }
}

export function buildSeedreamRequest(input: SeedreamGenerateInput, config: SeedreamAdapterConfig, authorization?: RemoteCallAuthorization): ProviderRequestEnvelope {
  validateAdapterConfig(config)
  const images = validateSeedreamInput(input)
  const payload: JsonObject = { model: config.model, prompt: input.prompt, n: 1 }
  if (images.length === 1) payload.image = toProviderImage(images[0], input.referenceArtifacts ?? [])
  if (images.length > 1) payload.image = images.map((image) => toProviderImage(image, input.referenceArtifacts ?? []))
  if (input.output_format !== undefined) payload.output_format = input.output_format
  if (input.size !== undefined) payload.size = input.size
  if (input.watermark !== undefined) payload.watermark = input.watermark
  const artifactHashes = sortedStrings([
    ...images.filter((value): value is ArtifactHandle => Boolean(value && typeof value === 'object' && !(value instanceof Uint8Array) && 'contentHash' in value)).map((value) => value.contentHash),
    ...(input.referenceArtifacts ?? []).filter((item) => images.some((value) => typeof value === 'object' && !(value instanceof Uint8Array) && value.id === item.artifact.id)).map((item) => item.artifact.contentHash),
  ])
  artifactHashes.forEach((hash) => assertHash(hash, 'SEEDREAM_ARTIFACT_HASH_INVALID'))
  const inputHash = authorization?.inputHash ?? sha256(jsonReady({ adapter: config.adapter, profile: config.profile, model: config.model, input: jsonReady({ ...input, referenceArtifacts: (input.referenceArtifacts ?? []).map((item) => item.artifact) }) }))
  const base: Omit<ProviderRequestEnvelope, 'requestHash'> = {
    schemaVersion: PROVIDER_REQUEST_ENVELOPE_SCHEMA_VERSION,
    id: hashId('seedream-request', { inputHash, idempotencyKey: authorization?.idempotencyKey ?? 'unbound' }),
    adapterId: config.adapter.id,
    adapterDigest: config.adapter.digest,
    profileId: config.profile.id,
    profileDigest: config.profile.digest,
    modelId: config.model,
    modelVersion: config.modelVersion,
    stepId: authorization?.stepId ?? 'unbound-seedream-step',
    destination: config.destination,
    ...(config.region === undefined ? {} : { region: config.region }),
    purpose: 'generation',
    inputHash,
    inputArtifactHashes: sortedStrings(artifactHashes),
    dataCategories: ['prompt', ...(artifactHashes.length ? ['reference_image'] : [])],
    maximumCalls: authorization?.maximumCalls ?? 1,
    maximumRetries: authorization?.maximumRetries ?? 0,
    timeoutMs: authorization?.timeoutMs ?? 60_000,
    ...(authorization?.maximumBytes === undefined ? {} : { maximumBytes: authorization.maximumBytes }),
    ...(authorization?.maximumCost === undefined ? {} : { maximumCost: authorization.maximumCost }),
    idempotencyKey: authorization?.idempotencyKey ?? hashId('seedream-idempotency', { inputHash }),
    payload,
  }
  return clone({ ...base, requestHash: computeProviderRequestEnvelopeHash(base as ProviderRequestEnvelope) })
}

function responseItems(body: JsonValue | undefined): Array<{ url?: string; b64_json?: string; base64?: string; mediaType?: string }> {
  if (!body || typeof body !== 'object' || Array.isArray(body)) return []
  const object = body as JsonObject
  const candidate = Array.isArray(object.data) ? object.data : Array.isArray(object.output) ? object.output : [object]
  return candidate.filter((item): item is JsonObject => Boolean(item && typeof item === 'object' && !Array.isArray(item))).map((item) => ({
    ...(typeof item.url === 'string' ? { url: item.url } : {}),
    ...(typeof item.b64_json === 'string' ? { b64_json: item.b64_json } : {}),
    ...(typeof item.base64 === 'string' ? { base64: item.base64 } : {}),
    ...(typeof item.mediaType === 'string' ? { mediaType: item.mediaType } : {}),
  }))
}

async function persistProviderItem(item: { url?: string; b64_json?: string; base64?: string; mediaType?: string }, sink: AssetSink, role: string): Promise<ArtifactHandle> {
  if (item.url) {
    if (!sink.putRemote) throw new ProviderTransportError('ARTIFACT_PERSISTENCE_FAILURE', 'Provider output URL was not saved by the host asset sink.')
    const artifact = await sink.putRemote({ url: item.url, mediaType: item.mediaType ?? 'image/png', role })
    if (!artifact) throw new ProviderTransportError('ARTIFACT_PERSISTENCE_FAILURE', 'Provider output URL could not be saved by the host asset sink.')
    assertHash(artifact.contentHash, 'ARTIFACT_HANDLE_HASH_INVALID')
    return clone(artifact)
  }
  const encoded = item.b64_json ?? item.base64
  if (!encoded) throw new ProviderTransportError('PROVIDER_OUTPUT_MISSING', 'Provider response did not contain a persistable image.')
  let bytes: Uint8Array
  try { bytes = Uint8Array.from(Buffer.from(encoded, 'base64')) } catch { throw new ProviderTransportError('PROVIDER_OUTPUT_INVALID', 'Provider image payload could not be decoded.') }
  if (!bytes.length) throw new ProviderTransportError('PROVIDER_OUTPUT_INVALID', 'Provider image payload is empty.')
  const detected = mediaTypeOf(bytes, [])
  if (!detected) throw new ProviderTransportError('PROVIDER_OUTPUT_INVALID', 'Provider image payload has an unsupported media signature.')
  if (item.mediaType !== undefined && item.mediaType !== detected) throw new ProviderTransportError('PROVIDER_OUTPUT_MEDIA_TYPE_MISMATCH', 'Provider image media type does not match its bytes.')
  const mediaType = item.mediaType ?? detected
  const artifact = await sink.put({ bytes, mediaType, role, sourceHash: binarySha256(bytes) })
  assertHash(artifact.contentHash, 'ARTIFACT_HANDLE_HASH_INVALID')
  return clone(artifact)
}

export class SeedreamAdapter {
  readonly id: string
  readonly version: VersionPin
  readonly digest: string
  readonly profileDigest: string
  readonly offline: boolean
  private readonly transport: ProviderTransport

  constructor(readonly config: SeedreamAdapterConfig) {
    validateAdapterConfig(config)
    this.id = config.adapter.id
    this.version = clone(config.adapter)
    this.digest = config.adapter.digest
    this.profileDigest = config.profile.digest
    this.offline = (config.transport ?? new DisabledProviderTransport()).mode === 'offline'
    this.transport = config.transport ?? new DisabledProviderTransport()
  }

  buildRequest(input: SeedreamGenerateInput, authorization?: RemoteCallAuthorization): ProviderRequestEnvelope { return buildSeedreamRequest(input, this.config, authorization) }

  async generate(input: SeedreamGenerateInput, authorization: RemoteCallAuthorization, context: Omit<ProviderTransportContext, 'authorization'> = {}): Promise<SeedreamGenerationResult> {
    let requestHash = authorization.inputHash
    try {
      const preparedInput = await resolveSeedreamInput(input, this.config)
      const request = this.buildRequest(preparedInput, authorization)
      requestHash = request.requestHash
      if (!context.credential || context.credential.ref !== this.config.credentialRef || !context.credential.value) throw new ProviderTransportError('ADAPTER_CREDENTIAL_MISSING', 'Host credential injection is missing or does not match the configured reference.')
      const transportContext: ProviderTransportContext = { ...context, authorization }
      const response = safeResponse(await this.transport.send(request, transportContext))
      if (response.requestHash !== request.requestHash) throw new ProviderTransportError('PROVIDER_RESPONSE_REQUEST_MISMATCH', 'Provider response did not match the request.')
      if (response.status === 'submission_unknown' || response.status === 'processing') return { status: 'submission_unknown', artifacts: [], response: publicResponseReceipt(response), lookup: createProviderSubmissionLookup(request, response.providerRequestId), failureCode: 'REMOTE_SUBMISSION_UNKNOWN' }
      if (response.status === 'failed') return { status: 'failed', artifacts: [], response: publicResponseReceipt(response), failureCode: response.error?.code ?? 'PROVIDER_FAILED' }
      const artifacts: ArtifactHandle[] = []
      for (const item of responseItems(response.body)) artifacts.push(await persistProviderItem(item, this.config.assetSink, 'generated-image'))
      if (artifacts.length !== 1) return { status: 'failed', artifacts: [], response: publicResponseReceipt(response), failureCode: 'PROVIDER_OUTPUT_CARDINALITY_INVALID' }
      return { status: 'succeeded', artifacts, response: publicResponseReceipt(response) }
    } catch (error) {
      if (error instanceof ProviderTransportError) return { status: 'failed', artifacts: [], response: publicResponseReceipt(errorResponse(requestHash, error.code, error.message)), failureCode: error.code }
      return { status: 'failed', artifacts: [], response: publicResponseReceipt(errorResponse(requestHash, 'PROVIDER_FAILED', 'Provider adapter failed safely.')), failureCode: 'PROVIDER_FAILED' }
    }
  }

  async lookup(lookup: ProviderSubmissionLookup, authorization: RemoteCallAuthorization, context: Omit<ProviderTransportContext, 'authorization'> = {}): Promise<SeedreamGenerationResult> {
    if (lookup.adapterId !== this.id || lookup.adapterDigest !== this.digest || lookup.profileId !== this.config.profile.id || lookup.profileDigest !== this.profileDigest || lookup.purpose !== 'generation' || lookup.modelId !== this.config.model || lookup.modelVersion !== this.config.modelVersion) throw new ProviderTransportError('PROVIDER_LOOKUP_SCOPE_MISMATCH', 'Submission lookup identity does not match the adapter.')
    if (!context.credential || context.credential.ref !== this.config.credentialRef || !context.credential.value) throw new ProviderTransportError('ADAPTER_CREDENTIAL_MISSING', 'Host credential injection is missing or does not match the configured reference.')
    try {
      const response = safeResponse(await this.transport.lookup(lookup, { ...context, authorization }))
      if (response.requestHash !== lookup.requestHash) throw new ProviderTransportError('PROVIDER_LOOKUP_REQUEST_MISMATCH', 'Submission lookup response did not match the original request.')
      if (response.status === 'submission_unknown' || response.status === 'processing') return { status: 'submission_unknown', artifacts: [], response: publicResponseReceipt(response), lookup: clone(lookup), failureCode: 'REMOTE_SUBMISSION_UNKNOWN' }
      if (response.status === 'failed') return { status: 'failed', artifacts: [], response: publicResponseReceipt(response), lookup: clone(lookup), failureCode: response.error?.code ?? 'PROVIDER_FAILED' }
      const artifacts = []
      for (const item of responseItems(response.body)) artifacts.push(await persistProviderItem(item, this.config.assetSink, 'generated-image'))
      if (artifacts.length !== 1) return { status: 'failed', artifacts: [], response: publicResponseReceipt(response), lookup: clone(lookup), failureCode: 'PROVIDER_OUTPUT_CARDINALITY_INVALID' }
      return { status: 'succeeded', artifacts, response: publicResponseReceipt(response), lookup: clone(lookup) }
    } catch (error) {
      if (error instanceof ProviderTransportError) return { status: 'failed', artifacts: [], response: publicResponseReceipt(errorResponse(lookup.requestHash, error.code, error.message)), lookup: clone(lookup), failureCode: error.code }
      return { status: 'failed', artifacts: [], response: publicResponseReceipt(errorResponse(lookup.requestHash, 'PROVIDER_FAILED', 'Provider lookup failed safely.')), lookup: clone(lookup), failureCode: 'PROVIDER_FAILED' }
    }
  }
}

export function createSeedreamAdapter(config: SeedreamAdapterConfig): SeedreamAdapter { return new SeedreamAdapter(config) }

interface ParsedImageHeader { format: 'png'|'jpeg'|'webp'|'unknown'; width?: number; height?: number; alpha?: boolean }

function parseJpeg(bytes: Uint8Array): ParsedImageHeader {
  if (bytes.length < 4 || bytes[0] !== 0xff || bytes[1] !== 0xd8) return { format: 'unknown' }
  let offset = 2
  while (offset + 9 < bytes.length) {
    if (bytes[offset] !== 0xff) { offset += 1; continue }
    const marker = bytes[offset + 1]
    offset += 2
    if (marker === 0xd8 || marker === 0xd9) continue
    if (offset + 2 > bytes.length) break
    const length = (bytes[offset] << 8) | bytes[offset + 1]
    if (length < 2 || offset + length > bytes.length) break
    if ((marker >= 0xc0 && marker <= 0xc3) || (marker >= 0xc5 && marker <= 0xc7) || (marker >= 0xc9 && marker <= 0xcb) || (marker >= 0xcd && marker <= 0xcf)) {
      return { format: 'jpeg', height: (bytes[offset + 3] << 8) | bytes[offset + 4], width: (bytes[offset + 5] << 8) | bytes[offset + 6], alpha: false }
    }
    offset += length
  }
  return { format: 'jpeg', alpha: false }
}

function parseWebp(bytes: Uint8Array): ParsedImageHeader {
  if (bytes.length < 16 || String.fromCharCode(...bytes.slice(0, 4)) !== 'RIFF' || String.fromCharCode(...bytes.slice(8, 12)) !== 'WEBP') return { format: 'unknown' }
  const kind = String.fromCharCode(...bytes.slice(12, 16))
  if (kind === 'VP8X' && bytes.length >= 30) return { format: 'webp', width: 1 + bytes[24] + (bytes[25] << 8) + (bytes[26] << 16), height: 1 + bytes[27] + (bytes[28] << 8) + (bytes[29] << 16), alpha: (bytes[20] & 0x10) !== 0 }
  if (kind === 'VP8L' && bytes.length >= 25) {
    const bits = bytes[21] | (bytes[22] << 8) | (bytes[23] << 16) | (bytes[24] << 24)
    return { format: 'webp', width: 1 + (bits & 0x3fff), height: 1 + ((bits >>> 14) & 0x3fff), alpha: (bits & 0x10000000) !== 0 }
  }
  return { format: 'webp', alpha: false }
}

function parseImageHeader(bytes: Uint8Array): ParsedImageHeader {
  const png = pngHeader(bytes)
  if (png) return { format: 'png', ...png }
  const jpeg = parseJpeg(bytes)
  if (jpeg.format !== 'unknown') return jpeg
  return parseWebp(bytes)
}

function finding(inputHash: string, code: string, status: StructuralValidationFinding['status'], severity: StructuralFindingSeverity, artifactId: string | undefined, expected: JsonValue | undefined, actual: JsonValue | undefined, evidenceSummary: string): StructuralValidationFinding {
  const base: Omit<StructuralValidationFinding, 'id'|'evidenceHash'> = {
    schemaVersion: STRUCTURAL_VALIDATION_FINDING_SCHEMA_VERSION,
    code,
    status,
    severity,
    ...(artifactId === undefined ? {} : { artifactId }),
    ...(expected === undefined ? {} : { expected }),
    ...(actual === undefined ? {} : { actual }),
    evidenceSummary: safeMessage(evidenceSummary),
  }
  const withId = { ...base, id: hashId('structural-finding', { inputHash, code, artifactId }) }
  const evidenceHash = sha256(withId)
  return clone({ ...withId, evidenceHash })
}

function structuralInputProjection(input: StructuralValidationInput): JsonObject {
  return jsonReady({ schemaVersion: STRUCTURAL_VALIDATION_INPUT_SCHEMA_VERSION, id: input.id, artifacts: input.artifacts.map((item) => ({ artifact: item.artifact, ...(item.bytes === undefined ? {} : { bytesHash: binarySha256(item.bytes) }) })).sort((left, right) => compareCodeUnits(String(left.artifact.id), String(right.artifact.id))), outputContract: input.outputContract, ...(input.expectedCardinality === undefined ? {} : { expectedCardinality: input.expectedCardinality }), ...(input.maxBytes === undefined ? {} : { maxBytes: input.maxBytes }) }) as JsonObject
}

export function computeStructuralValidationInputHash(input: StructuralValidationInput): string { return sha256(structuralInputProjection(input)) }
export function computeStructuralValidationFindingHash(findingValue: StructuralValidationFinding): string { return sha256(without(findingValue, 'evidenceHash')) }
export function computeStructuralValidationReportHash(report: StructuralValidationReport): string { return sha256(without(report, 'reportHash')) }

function expectedMediaTypes(contract: OutputContract): string[] { return sortedStrings(contract.mediaTypes) }

export function validateStructuralImage(input: StructuralValidationInput): StructuralValidationReport {
  const inputHash = computeStructuralValidationInputHash(input)
  const findings: StructuralValidationFinding[] = []
  const artifacts = input.artifacts.map((item) => ({ artifact: clone(item.artifact), ...(item.bytes === undefined ? {} : { bytes: new Uint8Array(item.bytes) }) }))
  const cardinality = input.expectedCardinality ?? input.outputContract.cardinality
  if (artifacts.length < cardinality.min || artifacts.length > cardinality.max) findings.push(finding(inputHash, 'CARDINALITY_INVALID', 'fail', 'critical', undefined, { min: cardinality.min, max: cardinality.max }, artifacts.length, 'Artifact count does not satisfy the output cardinality contract.'))
  for (const item of artifacts) {
    const artifact = item.artifact
    if (!isHash(artifact.contentHash)) findings.push(finding(inputHash, 'ARTIFACT_HASH_INVALID', 'fail', 'critical', artifact.id, 'sha256:<64 hex>', artifact.contentHash, 'Artifact content hash is invalid.'))
    if (artifact.availability !== 'available') findings.push(finding(inputHash, 'ARTIFACT_UNAVAILABLE', 'fail', 'critical', artifact.id, 'available', artifact.availability, 'Artifact is not available for structural validation.'))
    if (item.bytes === undefined) {
      findings.push(finding(inputHash, 'ARTIFACT_BYTES_UNAVAILABLE', 'unknown', 'warning', artifact.id, 'bytes', 'unavailable', 'Artifact bytes were not supplied; format and dimensions cannot be determined.'))
      continue
    }
    if (binarySha256(item.bytes) !== artifact.contentHash) findings.push(finding(inputHash, 'ARTIFACT_HASH_MISMATCH', 'fail', 'critical', artifact.id, artifact.contentHash, binarySha256(item.bytes), 'Supplied bytes do not match the accepted artifact hash.'))
    if (artifact.byteLength !== undefined && artifact.byteLength !== item.bytes.byteLength) findings.push(finding(inputHash, 'BYTE_LENGTH_MISMATCH', 'fail', 'error', artifact.id, artifact.byteLength, item.bytes.byteLength, 'Artifact byte length does not match the supplied bytes.'))
    if (input.maxBytes !== undefined && item.bytes.byteLength > input.maxBytes) findings.push(finding(inputHash, 'MAX_BYTES_EXCEEDED', 'fail', 'error', artifact.id, input.maxBytes, item.bytes.byteLength, 'Artifact exceeds the validation byte limit.'))
    if (input.outputContract.maxBytes !== undefined && item.bytes.byteLength > input.outputContract.maxBytes) findings.push(finding(inputHash, 'OUTPUT_MAX_BYTES_EXCEEDED', 'fail', 'error', artifact.id, input.outputContract.maxBytes, item.bytes.byteLength, 'Artifact exceeds the output contract byte limit.'))
    const header = parseImageHeader(item.bytes)
    const actualMediaType = header.format === 'png' ? 'image/png' : header.format === 'jpeg' ? 'image/jpeg' : header.format === 'webp' ? 'image/webp' : 'unknown'
    if (header.format === 'unknown') findings.push(finding(inputHash, 'MEDIA_SIGNATURE_INVALID', 'fail', 'critical', artifact.id, expectedMediaTypes(input.outputContract), 'unknown', 'Image magic signature is not a supported PNG, JPEG, or WebP header.'))
    if (header.format !== 'unknown' && artifact.mediaType !== actualMediaType) findings.push(finding(inputHash, 'DECLARED_MEDIA_TYPE_SIGNATURE_MISMATCH', 'fail', 'critical', artifact.id, artifact.mediaType, actualMediaType, 'Declared artifact media type does not match the detected magic signature.'))
    if (expectedMediaTypes(input.outputContract).length && !expectedMediaTypes(input.outputContract).includes(actualMediaType)) findings.push(finding(inputHash, 'MEDIA_TYPE_NOT_ALLOWED', 'fail', 'error', artifact.id, expectedMediaTypes(input.outputContract), actualMediaType, 'Detected image media type is outside the output contract allowlist.'))
    if (header.width === undefined || header.height === undefined || header.width <= 0 || header.height <= 0) findings.push(finding(inputHash, 'DIMENSIONS_UNKNOWN', 'unknown', 'warning', artifact.id, 'positive width and height', { width: header.width ?? null, height: header.height ?? null }, 'Image dimensions could not be reliably decoded from the basic header.'))
    if (input.outputContract.dimensions && header.width !== undefined && header.height !== undefined && (header.width !== input.outputContract.dimensions.width || header.height !== input.outputContract.dimensions.height)) findings.push(finding(inputHash, 'DIMENSIONS_MISMATCH', 'fail', 'error', artifact.id, input.outputContract.dimensions as unknown as JsonValue, { width: header.width, height: header.height }, 'Image dimensions do not match the output contract.'))
    if (input.outputContract.background === 'transparent' && !header.alpha) findings.push(finding(inputHash, 'ALPHA_REQUIRED', 'fail', 'critical', artifact.id, true, header.alpha ?? false, 'Transparent output requires an Alpha channel.'))
    if (input.outputContract.background === 'transparent' && header.alpha) findings.push(finding(inputHash, 'BACKGROUND_VISUAL_TRANSPARENCY_UNKNOWN', 'unknown', 'warning', artifact.id, 'at least one transparent pixel', 'Alpha channel present; pixel transparency not decoded', 'A basic image header proves only that an Alpha channel exists; visual transparency requires review.'))
    if (input.outputContract.allowAlpha === false && header.alpha) findings.push(finding(inputHash, 'ALPHA_FORBIDDEN', 'fail', 'error', artifact.id, false, true, 'The output contract forbids Alpha.'))
    if (input.outputContract.background === 'transparent' && header.format !== 'png') findings.push(finding(inputHash, 'TRANSPARENT_FORMAT_INVALID', 'fail', 'critical', artifact.id, 'image/png', actualMediaType, 'Transparent output must be PNG.'))
    if (input.outputContract.background === 'any' && header.alpha === undefined) findings.push(finding(inputHash, 'BACKGROUND_VISUAL_TRANSPARENCY_UNKNOWN', 'unknown', 'warning', artifact.id, 'known', 'unknown', 'Structural bytes cannot determine whether the visual background is semantically transparent.'))
  }
  const hasFailure = findings.some((item) => item.status === 'fail')
  const hasUnknown = findings.some((item) => item.status === 'unknown')
  const base: Omit<StructuralValidationReport, 'reportHash'> = {
    schemaVersion: STRUCTURAL_VALIDATION_REPORT_SCHEMA_VERSION,
    id: hashId('structural-report', inputHash),
    inputHash,
    status: hasFailure ? 'failed' : hasUnknown ? 'needs_review' : 'passed',
    findings: sortedBy(findings, (item) => item.id),
    artifactIds: sortedStrings(artifacts.map((item) => item.artifact.id)),
  }
  return clone({ ...base, reportHash: computeStructuralValidationReportHash(base as StructuralValidationReport) })
}

export const structuralValidate = validateStructuralImage
export class StructuralImageValidator { validate(input: StructuralValidationInput): StructuralValidationReport { return validateStructuralImage(input) } }

function semanticRequestProjection(request: SemanticReviewRequest): JsonObject {
  return jsonReady({
    schemaVersion: SEMANTIC_REVIEW_REQUEST_SCHEMA_VERSION,
    id: request.id,
    caseId: request.caseId,
    caseRevision: request.caseRevision,
    contextHash: request.contextHash,
    inputHash: request.inputHash,
    outputArtifacts: sortedBy(request.outputArtifacts, (item) => item.id),
    criteria: sortedBy(request.criteria, (item) => item.id),
    model: request.model,
    adapter: request.adapter,
    profile: request.profile,
    authorizationId: request.authorizationId,
    destination: request.destination,
    ...(request.region === undefined ? {} : { region: request.region }),
    ...(request.allowedEvidenceRegionIds === undefined ? {} : { allowedEvidenceRegionIds: sortedStrings(request.allowedEvidenceRegionIds) }),
    dataCategories: sortedStrings(request.dataCategories),
    budget: request.budget,
  }) as JsonObject
}

export function computeSemanticReviewRequestHash(request: SemanticReviewRequest): string { return sha256(semanticRequestProjection(request)) }
export function computeSemanticReviewFindingHash(findingValue: SemanticReviewFinding): string { return sha256(without(findingValue, 'findingHash')) }
export function computeSemanticReviewReportHash(report: SemanticReviewReport): string { return sha256(without(report, 'reportHash')) }

function assertSemanticRequest(request: SemanticReviewRequest, authorization: RemoteCallAuthorization): void {
  if (request.schemaVersion !== SEMANTIC_REVIEW_REQUEST_SCHEMA_VERSION || computeSemanticReviewRequestHash(request) !== request.requestHash) throw new ProviderTransportError('SEMANTIC_REVIEW_REQUEST_HASH_MISMATCH', 'Semantic review request hash is invalid.')
  if (authorization.id !== request.authorizationId || authorization.purpose !== 'semantic_review' || authorization.inputHash !== request.inputHash || authorization.modelId !== request.model.id || authorization.modelVersion !== request.model.version || authorization.adapterId !== request.adapter.id || authorization.adapterDigest !== request.adapter.digest || authorization.profileDigest !== request.profile.digest || authorization.destination !== request.destination || authorization.region !== request.region || authorization.maximumCalls !== request.budget.maximumCalls || authorization.maximumRetries !== request.budget.maximumRetries || authorization.timeoutMs !== request.budget.timeoutMs || authorization.maximumBytes !== request.budget.maximumBytes || authorization.maximumCost !== request.budget.maximumCost || canonicalize(jsonReady(sortedStrings(authorization.permittedArtifactHashes))) !== canonicalize(jsonReady(sortedStrings(request.outputArtifacts.map((item) => item.contentHash)))) || canonicalize(jsonReady(sortedStrings(authorization.dataCategories))) !== canonicalize(jsonReady(sortedStrings(request.dataCategories)))) throw new ProviderTransportError('SEMANTIC_REVIEW_AUTHORIZATION_SCOPE_MISMATCH', 'Semantic review authorization does not match the request.')
  assertHash(authorization.authorizationHash, 'REMOTE_CALL_AUTHORIZATION_INVALID')
  if (computeRemoteCallAuthorizationHash(authorization) !== authorization.authorizationHash) throw new ProviderTransportError('REMOTE_CALL_AUTHORIZATION_INVALID', 'Semantic review authorization hash is invalid.')
}

function assertSemanticReviewReport(request: SemanticReviewRequest, report: SemanticReviewReport): void {
  if (!report || typeof report !== 'object' || report.schemaVersion !== SEMANTIC_REVIEW_REPORT_SCHEMA_VERSION || !Array.isArray(report.findings) || !report.model || !report.adapter || !report.profile || report.requestHash !== request.requestHash || computeSemanticReviewReportHash(report) !== report.reportHash) throw new ProviderTransportError('SEMANTIC_REVIEW_REPORT_INVALID', 'Semantic reviewer returned a report with an invalid request or report hash.')
  if (report.model.id !== request.model.id || report.model.version !== request.model.version || report.model.digest !== request.model.digest || report.adapter.id !== request.adapter.id || report.adapter.version !== request.adapter.version || report.adapter.digest !== request.adapter.digest || report.profile.id !== request.profile.id || report.profile.version !== request.profile.version || report.profile.digest !== request.profile.digest) throw new ProviderTransportError('SEMANTIC_REVIEW_REPORT_BINDING_MISMATCH', 'Semantic reviewer report version binding does not match the request.')
  const criteria = new Set(request.criteria.map((criterion) => criterion.id))
  const artifacts = new Set(request.outputArtifacts.map((artifact) => artifact.id))
  const regions = new Set(request.allowedEvidenceRegionIds ?? [])
  for (const finding of report.findings) {
    if (finding.schemaVersion !== SEMANTIC_REVIEW_FINDING_SCHEMA_VERSION || !finding.proposal || !criteria.has(finding.criterionId) || computeSemanticReviewFindingHash(finding) !== finding.findingHash) throw new ProviderTransportError('SEMANTIC_REVIEW_FINDING_INVALID', 'Semantic reviewer returned an invalid finding proposal.')
    if (finding.confidence !== undefined && (!Number.isFinite(finding.confidence) || finding.confidence < 0 || finding.confidence > 1)) throw new ProviderTransportError('SEMANTIC_REVIEW_CONFIDENCE_INVALID', 'Semantic reviewer confidence is outside the closed interval [0,1].')
    if (finding.evidenceArtifactIds.some((id) => !artifacts.has(id)) || finding.evidenceRegionIds.some((id) => !regions.has(id))) throw new ProviderTransportError('SEMANTIC_REVIEW_EVIDENCE_UNKNOWN', 'Semantic reviewer evidence references an unknown artifact or region.')
  }
}

export interface FixtureSemanticReviewerOptions {
  findings?: SemanticReviewFinding[]
  warnings?: string[]
}

export class FixtureSemanticReviewer implements SemanticReviewer {
  readonly id = 'voce.fixture-semantic-reviewer'
  readonly version: VersionPin = { id: this.id, version: '1.0.0', digest: sha256({ id: this.id, version: '1.0.0' }) }

  constructor(private readonly options: FixtureSemanticReviewerOptions = {}) {}

  async review(request: SemanticReviewRequest, authorization: RemoteCallAuthorization): Promise<SemanticReviewReport> {
    assertSemanticRequest(request, authorization)
    const findings = (this.options.findings ?? request.criteria.map((criterion) => {
      const base: Omit<SemanticReviewFinding, 'id'|'findingHash'> = { schemaVersion: SEMANTIC_REVIEW_FINDING_SCHEMA_VERSION, criterionId: criterion.id, code: 'FIXTURE_UNCERTAIN', status: 'uncertain', confidence: 0.5, explanation: 'Offline fixture semantic review is a proposal requiring human acceptance.', evidenceArtifactIds: request.outputArtifacts.map((item) => item.id), evidenceRegionIds: [], warnings: [], proposal: true }
      const withId = { ...base, id: hashId('semantic-finding', base) }
      return { ...withId, findingHash: computeSemanticReviewFindingHash(withId as SemanticReviewFinding) }
    })).map((item) => clone(item))
    for (const item of findings) {
      if (!item.proposal || computeSemanticReviewFindingHash(item) !== item.findingHash) throw new ProviderTransportError('SEMANTIC_REVIEW_FINDING_INVALID', 'Semantic finding is not a valid proposal.')
    }
    const base: Omit<SemanticReviewReport, 'reportHash'> = { schemaVersion: SEMANTIC_REVIEW_REPORT_SCHEMA_VERSION, id: hashId('semantic-report', request.requestHash), requestHash: request.requestHash, status: 'proposal', model: clone(request.model), adapter: clone(request.adapter), profile: clone(request.profile), findings: sortedBy(findings, (item) => item.id), warnings: sortedStrings(this.options.warnings), receiptIds: [hashId('semantic-receipt', { requestHash: request.requestHash, authorizationId: authorization.id })] }
    return clone({ ...base, reportHash: computeSemanticReviewReportHash(base as SemanticReviewReport) })
  }
}

export interface SemanticReviewExecution {
  report: SemanticReviewReport
  remoteCallRun: RemoteCallRun
  receipt: StepReceipt
}

export async function executeSemanticReview(reviewer: SemanticReviewer, request: SemanticReviewRequest, authorization: RemoteCallAuthorization): Promise<SemanticReviewExecution> {
  assertSemanticRequest(request, authorization)
  const report = await reviewer.review(request, authorization)
  assertSemanticReviewReport(request, report)
  const receiptId = report.receiptIds[0] ?? hashId('semantic-receipt', request.requestHash)
  const state: StepReceipt['state'] = report.status === 'proposal' ? 'succeeded' : report.status
  const receiptBase: Omit<StepReceipt, 'receiptHash'> = { schemaVersion: 'voce.step-receipt/v1alpha1', id: receiptId, runId: hashId('semantic-run', request.requestHash), stepId: request.id, state, eventIds: [hashId('semantic-event', { requestHash: request.requestHash, status: report.status })], firstSequence: 1, lastSequence: 1, authorizationId: authorization.id, inputHash: request.inputHash, outputHashes: [report.reportHash], adapterId: request.adapter.id, adapterVersion: clone(request.adapter), profileDigest: request.profile.digest, destination: request.destination, dataCategories: sortedStrings(request.dataCategories), budgetId: request.budget.id, maximumCalls: request.budget.maximumCalls, maximumRetries: request.budget.maximumRetries, timeoutMs: request.budget.timeoutMs, attempts: 1, retriesUsed: 0, ...(report.status === 'proposal' ? {} : { failureCode: report.status === 'submission_unknown' ? 'SEMANTIC_REVIEW_SUBMISSION_UNKNOWN' : 'SEMANTIC_REVIEW_FAILED' }), cleanupStatus: 'not_required' }
  const receipt = clone({ ...receiptBase, receiptHash: sha256(receiptBase as unknown as JsonObject) })
  const remoteBase: Omit<RemoteCallRun, 'runHash'> = { schemaVersion: 'voce.remote-call-run/v1alpha1', id: hashId('semantic-remote-run', request.requestHash), runId: receipt.runId, stepId: request.id, authorizationId: authorization.id, inputHash: request.inputHash, state: state, provider: reviewer.id, adapterId: request.adapter.id, profileDigest: request.profile.digest, destination: request.destination, budgetId: request.budget.id, maximumCalls: request.budget.maximumCalls, maximumRetries: request.budget.maximumRetries, timeoutMs: request.budget.timeoutMs, receiptId }
  return { report, remoteCallRun: clone({ ...remoteBase, runHash: sha256(remoteBase as unknown as JsonObject) }), receipt }
}

function humanAnnotationHash(annotation: HumanAcceptanceAnnotation): string { return sha256(without(annotation, 'annotationHash')) }
export function computeHumanAcceptanceAnnotationHash(annotation: HumanAcceptanceAnnotation): string { return humanAnnotationHash(annotation) }
export function computeHumanAcceptanceDecisionHash(decision: HumanAcceptanceDecision): string { return sha256(without(decision, 'decisionHash')) }

export function createHumanAcceptanceDecision(input: Omit<HumanAcceptanceDecision, 'decisionHash'>): HumanAcceptanceDecision {
  const annotations = sortedBy(input.annotations.map((annotation) => ({ ...annotation, schemaVersion: HUMAN_ACCEPTANCE_ANNOTATION_SCHEMA_VERSION, annotationHash: annotation.annotationHash || humanAnnotationHash(annotation) })), (item) => item.id)
  for (const annotation of annotations) if (humanAnnotationHash(annotation) !== annotation.annotationHash) throw new ProviderTransportError('HUMAN_ANNOTATION_HASH_MISMATCH', 'Human annotation hash is invalid.')
  const base = { ...clone(input), schemaVersion: HUMAN_ACCEPTANCE_DECISION_SCHEMA_VERSION, annotations } as Omit<HumanAcceptanceDecision, 'decisionHash'>
  return clone({ ...base, decisionHash: computeHumanAcceptanceDecisionHash(base as HumanAcceptanceDecision) })
}

function normalizeHumanAcceptance(value: HumanAcceptance | HumanAcceptanceDecision, runId: string): HumanAcceptanceDecision {
  if ('decisionHash' in value) return clone(value)
  const base: Omit<HumanAcceptanceDecision, 'decisionHash'> = { schemaVersion: HUMAN_ACCEPTANCE_DECISION_SCHEMA_VERSION, id: value.id, runId, status: value.status, ...(value.reviewerId === undefined ? {} : { reviewerId: value.reviewerId }), ...(value.decidedAt === undefined ? {} : { decidedAt: value.decidedAt }), ...(value.reasonCode === undefined ? {} : { reasonCode: value.reasonCode }), annotations: [], artifactIds: value.artifactIds }
  return createHumanAcceptanceDecision(base)
}

export interface EvaluationCompilerInput {
  run: Pick<ExecutionRun, 'id'|'technicalOutcome'|'state'|'contextHash'|'pipelinePlanHash'|'promptArtifactHash'>
  structural?: StructuralValidationReport
  semanticProposal?: SemanticReviewReport
  humanAcceptance?: HumanAcceptance | HumanAcceptanceDecision
  cleanup?: CleanupReceipt[]
  replay?: EvaluationReplayStatus
  artifacts?: ArtifactHandle[]
  sourceHashes?: Record<string, string>
}

function cleanupStatus(receipts: CleanupReceipt[]): EvaluationCleanupStatus {
  if (!receipts.length) return { status: 'not_required', receiptIds: [], failureCodes: [] }
  const failed = receipts.some((item) => item.status === 'cleanup_failed')
  const pending = receipts.some((item) => item.status === 'pending')
  return { status: failed ? 'failed' : pending ? 'pending' : 'completed', receiptIds: sortedStrings(receipts.map((item) => item.id)), failureCodes: sortedStrings(receipts.flatMap((item) => item.failureCode ? [item.failureCode] : [])) }
}

export function computeEvaluationReportHash(report: EvaluationReport): string { return sha256(without(report, 'reportHash')) }

export function compileEvaluationReport(input: EvaluationCompilerInput): EvaluationReport {
  for (const hash of Object.values(input.sourceHashes ?? {})) if (!isHash(hash)) throw new ProviderTransportError('EVALUATION_SOURCE_HASH_INVALID', 'Evaluation source hash is invalid.')
  for (const artifact of input.artifacts ?? []) if (!isHash(artifact.contentHash)) throw new ProviderTransportError('ARTIFACT_HANDLE_HASH_INVALID', 'Evaluation artifact hash is invalid.')
  if (input.structural && computeStructuralValidationReportHash(input.structural) !== input.structural.reportHash) throw new ProviderTransportError('STRUCTURAL_REPORT_HASH_MISMATCH', 'Structural validation report hash is invalid.')
  if (input.semanticProposal && computeSemanticReviewReportHash(input.semanticProposal) !== input.semanticProposal.reportHash) throw new ProviderTransportError('SEMANTIC_REPORT_HASH_MISMATCH', 'Semantic review report hash is invalid.')
  const human = input.humanAcceptance ? normalizeHumanAcceptance(input.humanAcceptance, input.run.id) : undefined
  if (human && (human.annotations.some((annotation) => humanAnnotationHash(annotation) !== annotation.annotationHash) || computeHumanAcceptanceDecisionHash(human) !== human.decisionHash)) throw new ProviderTransportError('HUMAN_DECISION_HASH_MISMATCH', 'Human acceptance decision hash is invalid.')
  if (human && human.runId !== input.run.id) throw new ProviderTransportError('HUMAN_DECISION_RUN_MISMATCH', 'Human acceptance decision belongs to a different execution run.')
  const cleanup = cleanupStatus(input.cleanup ?? [])
  const replay = input.replay ?? { mode: 'none', status: 'not_requested', artifactIds: [] }
  const technicalStatus: EvaluationReport['technicalStatus'] = input.run.technicalOutcome === 'succeeded' ? 'passed' : input.run.technicalOutcome === 'failed' ? 'failed' : input.run.technicalOutcome === 'pending' ? 'pending' : 'needs_review'
  const semanticNeedsReview = Boolean(input.semanticProposal?.findings.some((finding) => finding.status === 'fail' || finding.status === 'uncertain')) && human?.status !== 'accepted' && human?.status !== 'waived'
  const status: EvaluationReport['status'] = input.run.technicalOutcome === 'failed' || input.structural?.status === 'failed' ? 'failed' : input.semanticProposal?.status === 'submission_unknown' || semanticNeedsReview || human?.status === 'pending' || human?.status === 'declined' || cleanup.status === 'failed' ? 'needs_review' : input.structural?.status === 'needs_review' ? 'partial' : 'complete'
  const base: Omit<EvaluationReport, 'reportHash'> = { schemaVersion: EVALUATION_REPORT_SCHEMA_VERSION, id: hashId('evaluation-report', { runId: input.run.id, structural: input.structural?.reportHash, semantic: input.semanticProposal?.reportHash, human: human?.decisionHash }), runId: input.run.id, technicalOutcome: input.run.technicalOutcome, technicalStatus, ...(input.structural === undefined ? {} : { structural: clone(input.structural) }), ...(input.semanticProposal === undefined ? {} : { semanticProposal: clone(input.semanticProposal) }), ...(human === undefined ? {} : { humanAcceptance: human }), cleanup, replay: clone(replay), artifactIds: sortedStrings((input.artifacts ?? []).map((item) => item.id)), sourceHashes: Object.fromEntries(Object.entries(input.sourceHashes ?? {}).sort((left, right) => compareCodeUnits(left[0], right[0]))), status, warnings: sortedStrings([...(input.run.state === 'needs_review' ? ['HUMAN_ACCEPTANCE_REQUIRED'] : []), ...(semanticNeedsReview ? ['SEMANTIC_FINDING_REQUIRES_REVIEW'] : []), ...(cleanup.failureCodes)]) }
  return clone({ ...base, reportHash: computeEvaluationReportHash(base as EvaluationReport) })
}

export const compileEvaluation = compileEvaluationReport

const VOLATILE_FIELDS = new Set(['at', 'createdAt', 'updatedAt', 'decidedAt', 'authorizedAt', 'expiresAt', 'runId', 'parentRunId', 'liveRerunOf', 'eventIds', 'eventCount'])
const UNORDERED_COMPARISON_ARRAY_KEYS = new Set(['inputArtifactHashes', 'dataCategories', 'permittedArtifactHashes', 'permittedScopeIds', 'constraintIds', 'artifactIds', 'outputArtifactIds', 'receiptIds', 'warnings', 'destinations', 'eventIds', 'findings', 'annotations', 'receipts', 'cleanup', 'reconciliation'])

function stableComparisonValue(value: unknown, key?: string): JsonValue {
  if (Array.isArray(value)) {
    const normalized = value.map((item) => stableComparisonValue(item, key))
    return UNORDERED_COMPARISON_ARRAY_KEYS.has(key ?? '') ? normalized.sort((left, right) => compareCodeUnits(canonicalize(left), canonicalize(right))) : normalized
  }
  if (value && typeof value === 'object') {
    const object: JsonObject = {}
    for (const [childKey, item] of Object.entries(value as Record<string, unknown>)) if (!VOLATILE_FIELDS.has(childKey)) object[childKey] = stableComparisonValue(item, childKey)
    return object
  }
  return safeJson(value)
}

function hashComparisonValue(value: JsonValue | undefined): string | undefined { return value === undefined ? undefined : sha256(value) }
function changedFields(before: JsonValue | undefined, after: JsonValue | undefined): string[] {
  if (!before || !after || typeof before !== 'object' || typeof after !== 'object' || Array.isArray(before) || Array.isArray(after)) return before === after ? [] : ['value']
  const keys = new Set([...Object.keys(before), ...Object.keys(after)])
  return [...keys].filter((key) => canonicalize((before as JsonObject)[key] ?? null) !== canonicalize((after as JsonObject)[key] ?? null)).sort(compareCodeUnits)
}

function recordsForSnapshot(snapshot: JsonValue | undefined): Array<{ key: string; value: JsonValue }> {
  if (snapshot === undefined) return []
  if (Array.isArray(snapshot)) return snapshot.map((item, index) => ({ key: typeof item === 'object' && item && 'id' in item ? String((item as JsonObject).id) : String(index), value: stableComparisonValue(item) }))
  if (snapshot && typeof snapshot === 'object') {
    const object = snapshot as JsonObject
    const arrayKey = Object.keys(object).some((key) => key.endsWith('s')) && Array.isArray(object.items) ? object.items : undefined
    if (arrayKey && Array.isArray(arrayKey)) return recordsForSnapshot(arrayKey)
    return [{ key: typeof object.id === 'string' ? object.id : 'root', value: stableComparisonValue(object) }]
  }
  return [{ key: 'root', value: stableComparisonValue(snapshot) }]
}

export function compareSnapshots(input: { caseId: string; beforeRevision: number; afterRevision: number; before: ComparisonSnapshot; after: ComparisonSnapshot }): ComparisonReport {
  const entries: ComparisonEntry[] = []
  const categories: ComparisonCategory[] = ['ontology', 'bindings', 'constraintIR', 'referencePlan', 'promptIR', 'promptCandidate', 'pipelinePlan', 'receipts', 'evaluation']
  for (const category of categories) {
    const beforeRecords = new Map<string, JsonValue>(recordsForSnapshot(input.before[category]).map((item) => [item.key, item.value] as const))
    const afterRecords = new Map<string, JsonValue>(recordsForSnapshot(input.after[category]).map((item) => [item.key, item.value] as const))
    const keys = [...new Set([...beforeRecords.keys(), ...afterRecords.keys()])].sort(compareCodeUnits)
    for (const key of keys) {
      const before = beforeRecords.get(key)
      const after = afterRecords.get(key)
      const kind: ComparisonEntry['kind'] = before === undefined ? 'added' : after === undefined ? 'removed' : canonicalize(before) === canonicalize(after) ? 'unchanged' : 'changed'
      const base: Omit<ComparisonEntry, 'id'> = { schemaVersion: COMPARISON_ENTRY_SCHEMA_VERSION, category, key, kind, ...(hashComparisonValue(before) === undefined ? {} : { beforeHash: hashComparisonValue(before) }), ...(hashComparisonValue(after) === undefined ? {} : { afterHash: hashComparisonValue(after) }), ...(before === undefined ? {} : { before }), ...(after === undefined ? {} : { after }), changedFields: changedFields(before, after), reasonCode: kind === 'unchanged' ? 'UNCHANGED_AFTER_VOLATILE_FIELDS_IGNORED' : 'SEMANTIC_FIELD_CHANGED' }
      entries.push({ ...base, id: hashId('comparison-entry', base) })
    }
  }
  const summary = { added: entries.filter((item) => item.kind === 'added').length, removed: entries.filter((item) => item.kind === 'removed').length, changed: entries.filter((item) => item.kind === 'changed').length, unchanged: entries.filter((item) => item.kind === 'unchanged').length }
  const base: Omit<ComparisonReport, 'reportHash'> = { schemaVersion: COMPARISON_REPORT_SCHEMA_VERSION, id: hashId('comparison-report', { caseId: input.caseId, beforeRevision: input.beforeRevision, afterRevision: input.afterRevision }), caseId: input.caseId, beforeRevision: input.beforeRevision, afterRevision: input.afterRevision, ignoredFields: [...VOLATILE_FIELDS].sort(compareCodeUnits), entries: sortedBy(entries, (item) => `${item.category}:${item.key}`), summary }
  return clone({ ...base, reportHash: sha256(base as unknown as JsonObject) })
}

export const compare = compareSnapshots

export function computeComparisonReportHash(report: ComparisonReport): string { return sha256(without(report, 'reportHash')) }

export function computeStaticTraceReportModelHash(model: StaticTraceReportModel): string { return sha256(without(model, 'modelHash')) }

function assertTraceNestedHashes(input: { structural?: StructuralValidationReport; semanticProposal?: SemanticReviewReport; humanAcceptance?: HumanAcceptanceDecision; comparison?: ComparisonReport; artifacts?: ArtifactHandle[] }): void {
  if (input.structural && computeStructuralValidationReportHash(input.structural) !== input.structural.reportHash) throw new ProviderTransportError('TRACE_STRUCTURAL_HASH_MISMATCH', 'Trace structural report hash is invalid.')
  if (input.semanticProposal && computeSemanticReviewReportHash(input.semanticProposal) !== input.semanticProposal.reportHash) throw new ProviderTransportError('TRACE_SEMANTIC_HASH_MISMATCH', 'Trace semantic report hash is invalid.')
  if (input.humanAcceptance && computeHumanAcceptanceDecisionHash(input.humanAcceptance) !== input.humanAcceptance.decisionHash) throw new ProviderTransportError('TRACE_HUMAN_HASH_MISMATCH', 'Trace human acceptance hash is invalid.')
  if (input.comparison && computeComparisonReportHash(input.comparison) !== input.comparison.reportHash) throw new ProviderTransportError('TRACE_COMPARISON_HASH_MISMATCH', 'Trace comparison report hash is invalid.')
  for (const artifact of input.artifacts ?? []) if (!isHash(artifact.contentHash)) throw new ProviderTransportError('ARTIFACT_HANDLE_HASH_INVALID', 'Trace artifact content hash is invalid.')
  for (const [name, value] of [['structural', input.structural], ['semantic', input.semanticProposal], ['human', input.humanAcceptance], ['comparison', input.comparison]] as const) {
    if (value !== undefined && canonicalize(jsonReady(value)) !== canonicalize(jsonReady(safeJson(value)))) throw new ProviderTransportError('TRACE_NESTED_SECRET_UNSAFE', `Trace ${name} contains a secret or unsafe reference.`)
  }
}

function escapeHtml(value: string): string {
  return value.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;').replaceAll("'", '&#39;')
}

function display(value: unknown): string { return escapeHtml(safeMessage(typeof value === 'string' ? value : canonicalize(safeJson(value)))) }
function traceStepRows(steps: StaticTraceStep[]): string { return sortedBy(steps, (item) => item.id).map((step) => `<tr><td>${display(step.id)}</td><td>${display(step.type)}</td><td>${display(step.state)}</td><td>${display(step.at ?? '')}</td><td>${display(step.adapterId ?? '')}</td><td>${display(step.destination ?? '')}</td><td>${display(step.receiptId ?? '')}</td><td>${display(step.failureCode ?? '')}</td></tr>`).join('') }

export function renderStaticTraceReport(model: StaticTraceReportModel): ReportArtifact {
  assertTraceNestedHashes(model)
  if (model.schemaVersion !== STATIC_TRACE_REPORT_MODEL_SCHEMA_VERSION || !isHash(model.modelHash) || computeStaticTraceReportModelHash(model) !== model.modelHash) throw new ProviderTransportError('STATIC_TRACE_MODEL_HASH_MISMATCH', 'Static trace report model hash is invalid.')
  for (const hash of [model.contextHash, model.constraintHash, model.referencePlanHash, model.pipelinePlanHash, model.promptHash].filter((value): value is string => value !== undefined)) if (!isHash(hash)) throw new ProviderTransportError('STATIC_TRACE_HASH_INVALID', 'Static trace report contains an invalid bound hash.')
  for (const artifact of model.artifacts) if (!isHash(artifact.contentHash)) throw new ProviderTransportError('ARTIFACT_HANDLE_HASH_INVALID', 'Static trace report contains an invalid artifact hash.')
  const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>VOCE Trace Report</title><style>body{font-family:system-ui,sans-serif;color:#1f2937;background:#f8fafc;margin:0;padding:2rem}main{max-width:1200px;margin:auto;background:#fff;padding:2rem;border:1px solid #e5e7eb;border-radius:12px}h1,h2{color:#111827}table{border-collapse:collapse;width:100%;margin:1rem 0}th,td{border:1px solid #d1d5db;padding:.45rem;text-align:left;vertical-align:top;font-size:.9rem}th{background:#f3f4f6}.meta{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:.5rem 2rem}.safe{font-family:ui-monospace,monospace;overflow-wrap:anywhere}.warning{color:#92400e}</style></head><body><main><h1>VOCE Static Trace Report</h1><section class="meta"><div><strong>Case</strong><br>${display(model.caseId)}</div><div><strong>Revision</strong><br>${display(model.revision)}</div><div><strong>Context hash</strong><br><span class="safe">${display(model.contextHash)}</span></div><div><strong>Constraint hash</strong><br><span class="safe">${display(model.constraintHash ?? '')}</span></div><div><strong>Reference plan hash</strong><br><span class="safe">${display(model.referencePlanHash ?? '')}</span></div><div><strong>Pipeline plan hash</strong><br><span class="safe">${display(model.pipelinePlanHash ?? '')}</span></div><div><strong>Prompt hash</strong><br><span class="safe">${display(model.promptHash ?? '')}</span></div><div><strong>Model hash</strong><br><span class="safe">${display(model.modelHash)}</span></div></section><h2>Timeline</h2><table><thead><tr><th>Step</th><th>Type</th><th>State</th><th>Time</th><th>Adapter</th><th>Destination</th><th>Receipt</th><th>Failure</th></tr></thead><tbody>${traceStepRows(model.steps)}</tbody></table><h2>Budgets and destinations</h2><pre>${display({ budgets: model.budgets, destinations: model.destinations })}</pre><h2>Receipts and cleanup</h2><pre>${display({ receipts: model.receipts, cleanup: model.cleanup, reconciliation: model.reconciliation })}</pre><h2>Evaluation</h2><pre>${display({ structural: model.structural, semanticProposal: model.semanticProposal, humanAcceptance: model.humanAcceptance, artifacts: model.artifacts, comparison: model.comparison })}</pre><h2>Warnings</h2><p class="warning">${display(model.warnings.join('\n'))}</p></main></body></html>`
  const base: Omit<ReportArtifact, 'contentHash'> = { schemaVersion: REPORT_ARTIFACT_SCHEMA_VERSION, id: hashId('report-artifact', { modelHash: model.modelHash, version: STATIC_REPORT_VERSION }), mediaType: 'text/html', content: html, modelHash: model.modelHash }
  return clone({ ...base, contentHash: sha256({ content: html }) })
}

export const createStaticTraceReport = renderStaticTraceReport

export async function writeStaticTraceReport(model: StaticTraceReportModel, outputPath: string): Promise<ReportArtifact> {
  const artifact = renderStaticTraceReport(model)
  await mkdir(dirname(outputPath), { recursive: true })
  await writeFile(outputPath, artifact.content, 'utf8')
  return artifact
}

export function traceModelFromExecution(input: { run: ExecutionRun; receipts: StepReceipt[]; cleanup: CleanupReceipt[]; reconciliation: RemoteCallRun[]; steps?: StaticTraceStep[]; artifacts?: ArtifactHandle[]; structural?: StructuralValidationReport; semanticProposal?: SemanticReviewReport; humanAcceptance?: HumanAcceptanceDecision; budgets?: Budget[]; destinations?: string[]; comparison?: ComparisonReport; warnings?: string[]; constraintHash?: string; referencePlanHash?: string; promptHash?: string }): StaticTraceReportModel {
  for (const hash of [input.run.contextHash, input.run.pipelinePlanHash, input.constraintHash, input.referencePlanHash, input.promptHash].filter((value): value is string => value !== undefined)) if (!isHash(hash)) throw new ProviderTransportError('TRACE_HASH_INVALID', 'Trace execution contains an invalid bound hash.')
  assertTraceNestedHashes(input)
  const steps = input.steps ?? input.receipts.map((receipt) => ({ id: receipt.stepId, type: receipt.stepId, state: receipt.state, adapterId: receipt.adapterId, adapterVersion: receipt.adapterVersion, profileDigest: receipt.profileDigest, destination: receipt.destination, budgetId: receipt.budgetId, inputHash: receipt.inputHash, outputHashes: receipt.outputHashes, receiptId: receipt.id, ...(receipt.failureCode === undefined ? {} : { failureCode: receipt.failureCode }) }))
  const safeSteps = safeJson(steps) as unknown as StaticTraceStep[]
  const safeReceipts = safeJson(input.receipts) as unknown as StepReceipt[]
  const safeCleanup = safeJson(input.cleanup) as unknown as CleanupReceipt[]
  const safeReconciliation = safeJson(input.reconciliation) as unknown as RemoteCallRun[]
  const safeBudgets = safeJson(input.budgets ?? []) as unknown as Budget[]
  const safeDestinations = safeJson(input.destinations ?? []) as unknown as string[]
  const safeWarnings = safeJson(input.warnings ?? []) as unknown as string[]
  const safeArtifacts = safeJson(input.artifacts ?? []) as unknown as ArtifactHandle[]
  const base: Omit<StaticTraceReportModel, 'modelHash'> = { schemaVersion: STATIC_TRACE_REPORT_MODEL_SCHEMA_VERSION, caseId: safeJson(input.run.caseId) as string, revision: input.run.caseRevision, contextHash: input.run.contextHash, ...(input.constraintHash === undefined ? {} : { constraintHash: input.constraintHash }), ...(input.referencePlanHash === undefined ? {} : { referencePlanHash: input.referencePlanHash }), ...(input.run.pipelinePlanHash === undefined ? {} : { pipelinePlanHash: input.run.pipelinePlanHash }), ...(input.promptHash === undefined ? {} : { promptHash: input.promptHash }), steps: sortedBy(safeSteps, (item) => item.id), budgets: sortedBy(safeBudgets, (item) => item.id), destinations: sortedStrings(safeDestinations), receipts: sortedBy(safeReceipts, (item) => item.id), cleanup: sortedBy(safeCleanup, (item) => item.id), reconciliation: sortedBy(safeReconciliation, (item) => item.id), ...(input.structural === undefined ? {} : { structural: input.structural }), ...(input.semanticProposal === undefined ? {} : { semanticProposal: input.semanticProposal }), ...(input.humanAcceptance === undefined ? {} : { humanAcceptance: input.humanAcceptance }), artifacts: sortedBy(safeArtifacts, (item) => item.id), ...(input.comparison === undefined ? {} : { comparison: input.comparison }), warnings: sortedStrings(safeWarnings) }
  return clone({ ...base, modelHash: sha256(base as unknown as JsonObject) })
}

export { ARTIFACT_REPLAY_RESULT_SCHEMA_VERSION }
