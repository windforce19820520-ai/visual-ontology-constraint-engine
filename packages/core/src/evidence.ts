import type {
  AnalyzerMetadata,
  BindingDecision,
  ChangeIntent,
  Conflict,
  DecisionTrace,
  EvidenceAndSourceResolver as EvidenceAndSourceResolverContract,
  EvidenceAndSourceResolverInput,
  EvidenceAndSourceResolverResult,
  EvidenceRegion,
  EffectiveScenario,
  JsonObject,
  JsonValue,
  ManualObservationDeclaration,
  Observation,
  ObservationDecision,
  OntologyFact,
  OntologyInstance,
  Question,
  ReferenceInterpreter as ReferenceInterpreterContract,
  ReferenceInterpreterInput,
  ReferenceInterpreterResult,
  RequestedScope,
  RequestedScopePlan,
  SourceBinding,
  TrustedMetadata,
  UnresolvedItem,
} from '@voce/contracts'
import {
  BINDING_DECISION_SCHEMA_VERSION,
  CONFLICT_SCHEMA_VERSION,
  DECISION_TRACE_SCHEMA_VERSION,
  OBSERVATION_DECISION_SCHEMA_VERSION,
  OBSERVATION_SCHEMA_VERSION,
  ONTOLOGY_FACT_SCHEMA_VERSION,
  ONTOLOGY_INSTANCE_SCHEMA_VERSION,
  QUESTION_SCHEMA_VERSION,
  REFERENCE_INTERPRETER_INPUT_SCHEMA_VERSION,
  REFERENCE_INTERPRETER_RESULT_SCHEMA_VERSION,
  RESOLVER_RESULT_SCHEMA_VERSION,
  SOURCE_BINDING_SCHEMA_VERSION,
  UNRESOLVED_ITEM_SCHEMA_VERSION,
} from '@voce/contracts'
import { canonicalize, sha256 } from './canonical.js'

export const EVIDENCE_RESOLVER_VERSION = 'voce.evidence-source-resolver/v1alpha1'
export const MANUAL_REFERENCE_INTERPRETER_VERSION = 'voce.manual-reference-interpreter/v1alpha1'
export const FIXTURE_REFERENCE_INTERPRETER_VERSION = 'voce.fixture-reference-interpreter/v1alpha1'
export const FIXED_DECISION_TIME = '1970-01-01T00:00:00.000Z'

function jsonReady(value: unknown): JsonValue | undefined {
  if (value === undefined) return undefined
  if (value === null || typeof value === 'boolean' || typeof value === 'string') return value
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) throw new Error('JSON_VALUE_INVALID')
    return value
  }
  if (Array.isArray(value)) return value.map((item) => jsonReady(item) ?? null)
  if (typeof value === 'object') {
    const object: JsonObject = {}
    for (const [key, item] of Object.entries(value as Record<string, unknown>)) {
      const ready = jsonReady(item)
      if (ready !== undefined) object[key] = ready
    }
    return object
  }
  throw new Error('JSON_VALUE_INVALID')
}

function clone<T>(value: T): T {
  const ready = jsonReady(value)
  return (ready === undefined ? undefined : ready) as T
}

function compareCodeUnits(left: string, right: string): number {
  const length = Math.min(left.length, right.length)
  for (let index = 0; index < length; index += 1) {
    const difference = left.charCodeAt(index) - right.charCodeAt(index)
    if (difference !== 0) return difference
  }
  return left.length - right.length
}

function canonicalValue(value: unknown): string {
  return canonicalize(jsonReady(value) ?? null)
}

function stableUnique(values: string[]): string[] {
  return [...new Set(values)].sort(compareCodeUnits)
}

function sortedBy<T>(values: T[], key: (value: T) => string): T[] {
  return values.map((value) => clone(value)).sort((left, right) => compareCodeUnits(key(left), key(right)) || compareCodeUnits(canonicalValue(left), canonicalValue(right)))
}

function sortedStrings(values: string[] | undefined): string[] {
  return [...(values ?? [])].sort(compareCodeUnits)
}

function provenanceProjection(provenance: Observation['provenance']): JsonObject {
  return {
    source: provenance.source,
    sourceIds: sortedStrings(provenance.sourceIds),
    createdBy: provenance.createdBy,
    createdAt: provenance.createdAt,
  }
}

function regionProjection(region: EvidenceRegion): JsonObject {
  if (region.kind === 'rectangle') return { kind: region.kind, x: region.x, y: region.y, width: region.width, height: region.height }
  if (region.kind === 'polygon') return { kind: region.kind, points: region.points.map((point) => ({ x: point.x, y: point.y })) }
  return { kind: region.kind, maskArtifactId: region.maskArtifactId }
}

function analyzerProjection(analyzer: AnalyzerMetadata): JsonObject {
  const result: JsonObject = { schemaVersion: analyzer.schemaVersion, adapterId: analyzer.adapterId, model: analyzer.model, promptVersion: analyzer.promptVersion }
  if (analyzer.fixtureId !== undefined) result.fixtureId = analyzer.fixtureId
  return result
}

function observationProjection(observation: Observation): JsonObject {
  const result: JsonObject = {
    schemaVersion: observation.schemaVersion,
    id: observation.id,
    assetId: observation.assetId,
    ontologyPath: observation.ontologyPath,
    value: clone(observation.value),
    provenance: provenanceProjection(observation.provenance),
    warnings: sortedStrings(observation.warnings),
  }
  if (observation.confidence !== undefined) result.confidence = observation.confidence
  if (observation.evidenceRegion !== undefined) result.evidenceRegion = regionProjection(observation.evidenceRegion)
  if (observation.analyzer !== undefined) result.analyzer = analyzerProjection(observation.analyzer)
  return result
}

export function computeObservationContentHash(observation: Observation): string {
  return sha256(observationProjection(observation))
}

export function createObservation(input: Omit<Observation, 'contentHash'>): Observation {
  const observation = clone({ ...input, contentHash: '' }) as Observation
  observation.contentHash = computeObservationContentHash(observation)
  return clone(observation)
}

function bindingProjection(binding: SourceBinding): JsonObject {
  return {
    schemaVersion: binding.schemaVersion,
    id: binding.id,
    targetPath: binding.targetPath,
    observationIds: sortedStrings(binding.observationIds),
    relation: binding.relation,
    priority: binding.priority,
  }
}

export function computeSourceBindingContentHash(binding: SourceBinding): string {
  return sha256(bindingProjection(binding))
}

export const computeBindingHash = computeSourceBindingContentHash
export const computeSourceBindingHash = computeSourceBindingContentHash
export const computeObservationHash = computeObservationContentHash

export function createSourceBinding(input: Omit<SourceBinding, 'contentHash'>): SourceBinding {
  const binding = clone({ ...input, contentHash: '' }) as SourceBinding
  binding.observationIds = sortedStrings(binding.observationIds)
  binding.contentHash = computeSourceBindingContentHash(binding)
  return clone(binding)
}

function observationDecisionProjection(decision: ObservationDecision): JsonObject {
  const result: JsonObject = {
    schemaVersion: decision.schemaVersion,
    decisionId: decision.decisionId,
    observationId: decision.observationId,
    observationHash: decision.observationHash,
    contextHash: decision.contextHash,
    status: decision.status,
    authority: decision.authority,
    decidedBy: decision.decidedBy,
    decidedAt: decision.decidedAt,
    reasonCode: decision.reasonCode,
  }
  if (decision.policyVersion !== undefined) result.policyVersion = decision.policyVersion
  return result
}

export function computeObservationDecisionHash(decision: ObservationDecision): string {
  return sha256(observationDecisionProjection(decision))
}

export function createObservationDecision(input: Omit<ObservationDecision, 'decisionHash'>): ObservationDecision {
  const decision = clone({ ...input, decisionHash: '' }) as ObservationDecision
  decision.decisionHash = computeObservationDecisionHash(decision)
  return clone(decision)
}

function bindingDecisionProjection(decision: BindingDecision): JsonObject {
  const result: JsonObject = {
    schemaVersion: decision.schemaVersion,
    decisionId: decision.decisionId,
    bindingId: decision.bindingId,
    bindingHash: decision.bindingHash,
    contextHash: decision.contextHash,
    status: decision.status,
    authority: decision.authority,
    decidedBy: decision.decidedBy,
    reasonCode: decision.reasonCode,
  }
  if (decision.policyVersion !== undefined) result.policyVersion = decision.policyVersion
  if (decision.decidedAt !== undefined) result.decidedAt = decision.decidedAt
  return result
}

export function computeBindingDecisionHash(decision: BindingDecision): string {
  return sha256(bindingDecisionProjection(decision))
}

export function createBindingDecision(input: Omit<BindingDecision, 'decisionHash'>): BindingDecision {
  const decision = clone({ ...input, decisionHash: '' }) as BindingDecision
  if (decision.decidedAt === undefined) decision.decidedAt = FIXED_DECISION_TIME
  decision.decisionHash = computeBindingDecisionHash(decision)
  return clone(decision)
}

function hashId(prefix: string, value: unknown): string {
  return `${prefix}-${sha256(jsonReady(value) ?? null).slice('sha256:'.length, 'sha256:'.length + 24)}`
}

function question(value: Omit<Question, 'schemaVersion' | 'id'>): Question {
  const base = { schemaVersion: QUESTION_SCHEMA_VERSION, ...value, assetIds: sortedStrings(value.assetIds), relatedIds: sortedStrings(value.relatedIds) }
  return { ...clone(base), id: hashId('question', base) }
}

function conflict(value: Omit<Conflict, 'schemaVersion' | 'id'>): Conflict {
  const base = { schemaVersion: CONFLICT_SCHEMA_VERSION, ...value, candidateIds: sortedStrings(value.candidateIds), relatedIds: sortedStrings(value.relatedIds) }
  return { ...clone(base), id: hashId('conflict', base) }
}

function unresolved(value: Omit<UnresolvedItem, 'schemaVersion' | 'id'>): UnresolvedItem {
  const base = { schemaVersion: UNRESOLVED_ITEM_SCHEMA_VERSION, ...value, relatedIds: sortedStrings(value.relatedIds) }
  return { ...clone(base), id: hashId('unresolved', base) }
}

function trace(value: Omit<DecisionTrace, 'schemaVersion' | 'id'>): DecisionTrace {
  const base = { schemaVersion: DECISION_TRACE_SCHEMA_VERSION, ...value, subjectIds: sortedStrings(value.subjectIds) }
  return { ...clone(base), id: hashId('trace', base) }
}

/** A declared scope authorizes itself and descendants, never its ancestors. */
function scopeContainsPath(authorizedScopePath: string, candidatePath: string): boolean {
  return authorizedScopePath === candidatePath || candidatePath.startsWith(`${authorizedScopePath}.`)
}

/** Path comparison for explicit M3 relationships; no implicit field projection. */
function exactPathMatch(leftPath: string, rightPath: string): boolean {
  return leftPath === rightPath
}

function excludedBy(plan: RequestedScopePlan, path: string): boolean {
  return plan.excludedScopes.some((excluded) => scopeContainsPath(excluded, path))
}

function scenarioPathAllowed(scenario: EffectiveScenario | undefined, path: string): boolean {
  if (!scenario || scenario.interpretationScopes.length === 0) return true
  return scenario.interpretationScopes.some((raw) => {
    const value = raw as Record<string, JsonValue>
    const candidate = typeof value.ontologyPath === 'string' ? value.ontologyPath : typeof value.scopePath === 'string' ? value.scopePath : undefined
    return candidate ? scopeContainsPath(candidate, path) : false
  })
}

function planPathAllowed(plan: RequestedScopePlan, path: string, assetId?: string, scenario?: EffectiveScenario): boolean {
  if (excludedBy(plan, path) || !scenarioPathAllowed(scenario, path)) return false
  return plan.scopes.some((scope) => {
    if (!scopeContainsPath(scope.ontologyPath, path)) return false
    if (assetId === undefined) return true
    return scope.assetIds.includes('*') || scope.assetIds.includes(assetId)
  })
}

function normalizeScope(scope: RequestedScope): RequestedScope {
  return clone({ ...scope, assetIds: sortedStrings(scope.assetIds) })
}

type RequestedScopePlanHashInput = Omit<RequestedScopePlan, 'planHash'>

function requestedScopePlanProjection(plan: RequestedScopePlanHashInput): JsonObject {
  return {
    schemaVersion: plan.schemaVersion,
    id: plan.id,
    caseId: plan.caseId,
    caseRevision: plan.caseRevision,
    scopes: sortedBy(plan.scopes.map(normalizeScope), (item) => `${item.id}|${item.ontologyPath}`) as unknown as JsonValue[],
    excludedScopes: sortedStrings(plan.excludedScopes),
    questions: sortedBy(plan.questions, (item) => item.id) as unknown as JsonValue[],
  }
}

export function computeRequestedScopePlanHash(plan: RequestedScopePlanHashInput): string {
  return sha256(requestedScopePlanProjection(plan))
}

interface RequestedScopePlanValidationError { code: string; message: string }

function validateRequestedScopePlan(plan: RequestedScopePlan, caseId: string, caseRevision: number): RequestedScopePlanValidationError | undefined {
  const candidate = plan as unknown as Record<string, unknown>
  if (!candidate || typeof candidate !== 'object' || Array.isArray(candidate) || candidate.schemaVersion !== 'voce.requested-scope-plan/v1alpha1') {
    return { code: 'REQUESTED_SCOPE_PLAN_SCHEMA_INVALID', message: 'RequestedScopePlan schemaVersion or object shape is not supported.' }
  }
  if (candidate.caseId !== caseId) return { code: 'REQUESTED_SCOPE_PLAN_CASE_MISMATCH', message: 'RequestedScopePlan caseId does not match the current case input.' }
  if (candidate.caseRevision !== caseRevision) return { code: 'REQUESTED_SCOPE_PLAN_REVISION_MISMATCH', message: 'RequestedScopePlan caseRevision does not match the current case input.' }
  if (!Array.isArray(candidate.scopes) || !Array.isArray(candidate.excludedScopes) || !Array.isArray(candidate.questions) || typeof candidate.planHash !== 'string') {
    return { code: 'REQUESTED_SCOPE_PLAN_SCHEMA_INVALID', message: 'RequestedScopePlan required collections or planHash are missing or malformed.' }
  }
  if (candidate.scopes.some((scope) => !scope || typeof scope !== 'object' || Array.isArray(scope) || (scope as Record<string, unknown>).schemaVersion !== 'voce.requested-scope/v1alpha1')) {
    return { code: 'REQUESTED_SCOPE_PLAN_SCHEMA_INVALID', message: 'RequestedScopePlan contains a scope with an unsupported schemaVersion or shape.' }
  }
  if (candidate.questions.some((item) => !item || typeof item !== 'object' || Array.isArray(item) || (item as Record<string, unknown>).schemaVersion !== QUESTION_SCHEMA_VERSION)) {
    return { code: 'REQUESTED_SCOPE_PLAN_SCHEMA_INVALID', message: 'RequestedScopePlan contains a question with an unsupported schemaVersion or shape.' }
  }
  if (candidate.planHash !== computeRequestedScopePlanHash(plan)) {
    return { code: 'REQUESTED_SCOPE_PLAN_HASH_MISMATCH', message: 'RequestedScopePlan planHash does not match its canonical semantic projection.' }
  }
  return undefined
}

function orderedPlanView(plan: RequestedScopePlan): RequestedScopePlan {
  const raw = plan && typeof plan === 'object' ? plan : {} as RequestedScopePlan
  return clone({
    ...raw,
    scopes: sortedBy(Array.isArray(raw.scopes) ? raw.scopes.map(normalizeScope) : [], (item) => `${item.id}|${item.ontologyPath}`),
    excludedScopes: sortedStrings(Array.isArray(raw.excludedScopes) ? raw.excludedScopes : []),
    questions: sortedBy(Array.isArray(raw.questions) ? raw.questions : [], (item) => item.id),
  })
}

function normalizePlan(plan: RequestedScopePlan): RequestedScopePlan {
  return orderedPlanView(plan)
}

function normalizeObservation(observation: Observation): Observation {
  const result = clone(observation)
  result.warnings = sortedStrings(result.warnings)
  result.provenance.sourceIds = sortedStrings(result.provenance.sourceIds)
  return result
}

function normalizeBinding(binding: SourceBinding): SourceBinding {
  const result = clone(binding)
  result.observationIds = sortedStrings(result.observationIds)
  return result
}

function referenceInputProjection(input: ReferenceInterpreterInput): JsonObject {
  const result: JsonObject = {
    schemaVersion: input.schemaVersion,
    caseId: input.caseId,
    caseRevision: input.caseRevision,
    contextHash: input.contextHash,
    assets: sortedBy(input.assets, (item) => item.id).map((item) => clone(item)) as unknown as JsonValue[],
    requestedScopePlan: orderedPlanView(input.requestedScopePlan) as unknown as JsonValue,
  }
  if (input.effectiveScenario !== undefined) result.effectiveScenario = clone(input.effectiveScenario) as unknown as JsonValue
  if (input.manualDeclarations !== undefined) result.manualDeclarations = sortedBy(input.manualDeclarations, (item) => item.id).map((item) => clone(item)) as unknown as JsonValue[]
  if (input.fixtureId !== undefined) result.fixtureId = input.fixtureId
  return result
}

function resolverInputProjection(input: EvidenceAndSourceResolverInput): JsonObject {
  const result: JsonObject = {
    schemaVersion: input.schemaVersion,
    caseId: input.caseId,
    caseRevision: input.caseRevision,
    contextHash: input.contextHash,
    requestedScopePlan: orderedPlanView(input.requestedScopePlan) as unknown as JsonValue,
    changeIntents: sortedBy(input.changeIntents ?? [], (item) => item.id).map((item) => clone({ ...item, sourceHintIds: sortedStrings(item.sourceHintIds), provenance: provenanceProjection(item.provenance) })) as unknown as JsonValue[],
    observations: sortedBy((input.observations ?? []).map(normalizeObservation), (item) => item.id).map((item) => clone(item)) as unknown as JsonValue[],
    observationDecisions: sortedBy(input.observationDecisions ?? [], (item) => item.decisionId).map((item) => clone(item)) as unknown as JsonValue[],
    sourceBindings: sortedBy((input.sourceBindings ?? []).map(normalizeBinding), (item) => item.id).map((item) => clone(item)) as unknown as JsonValue[],
    bindingDecisions: sortedBy(input.bindingDecisions ?? [], (item) => item.decisionId).map((item) => clone(item)) as unknown as JsonValue[],
    trustedMetadata: sortedBy(input.trustedMetadata ?? [], (item) => item.id).map((item) => clone({ ...item, provenance: provenanceProjection(item.provenance) })) as unknown as JsonValue[],
  }
  if (input.effectiveScenario !== undefined) result.effectiveScenario = clone(input.effectiveScenario) as unknown as JsonValue
  return result
}

function inputHash(input: JsonObject): string {
  return sha256(input)
}

function finalReferenceResult(value: Omit<ReferenceInterpreterResult, 'resultHash'>): ReferenceInterpreterResult {
  const withoutHash = clone({
    ...value,
    observations: sortedBy(value.observations, (item) => item.id),
    unresolvedItems: sortedBy(value.unresolvedItems, (item) => item.id),
    warnings: sortedStrings(value.warnings),
  }) as unknown as Record<string, unknown>
  delete withoutHash.resultHash
  return clone({ ...withoutHash, resultHash: sha256(jsonReady(withoutHash) ?? null) }) as ReferenceInterpreterResult
}

function makeManualObservation(declaration: ManualObservationDeclaration): Observation {
  const analyzer: AnalyzerMetadata = { schemaVersion: 'voce.analyzer-metadata/v1alpha1', adapterId: MANUAL_REFERENCE_INTERPRETER_VERSION, model: 'manual', promptVersion: 'v1' }
  return createObservation({
    schemaVersion: OBSERVATION_SCHEMA_VERSION,
    id: declaration.id,
    assetId: declaration.assetId,
    ontologyPath: declaration.ontologyPath,
    value: clone(declaration.value),
    ...(declaration.confidence === undefined ? {} : { confidence: declaration.confidence }),
    ...(declaration.evidenceRegion === undefined ? {} : { evidenceRegion: clone(declaration.evidenceRegion) }),
    provenance: clone(declaration.provenance),
    analyzer,
    warnings: sortedStrings(declaration.warnings),
  })
}

function interpreterUnresolved(code: string, message: string, path?: string, assetId?: string, relatedIds: string[] = []): UnresolvedItem {
  return unresolved({ code, message, status: 'unresolved', ...(path ? { targetPath: path } : {}), ...(assetId ? { assetId } : {}), relatedIds })
}

function blockedReferenceResult(input: ReferenceInterpreterInput, interpreterId: string, analyzer: AnalyzerMetadata, error: RequestedScopePlanValidationError): ReferenceInterpreterResult {
  const plan = input.requestedScopePlan as unknown as Record<string, unknown>
  const planId = typeof plan?.id === 'string' ? plan.id : 'requested-scope-plan'
  const item = interpreterUnresolved(error.code, error.message, undefined, undefined, [planId])
  return finalReferenceResult({
    schemaVersion: REFERENCE_INTERPRETER_RESULT_SCHEMA_VERSION,
    status: 'blocked',
    interpreterId,
    inputHash: inputHash(referenceInputProjection(input)),
    observations: [],
    unresolvedItems: [item],
    warnings: [error.code],
    analyzer,
  })
}

export class ManualReferenceInterpreter implements ReferenceInterpreterContract {
  interpret(input: ReferenceInterpreterInput): ReferenceInterpreterResult {
    const safeInput = clone(input)
    const analyzer: AnalyzerMetadata = { schemaVersion: 'voce.analyzer-metadata/v1alpha1', adapterId: MANUAL_REFERENCE_INTERPRETER_VERSION, model: 'manual', promptVersion: 'v1' }
    const planError = validateRequestedScopePlan(safeInput.requestedScopePlan, safeInput.caseId, safeInput.caseRevision)
    if (planError) return blockedReferenceResult(safeInput, MANUAL_REFERENCE_INTERPRETER_VERSION, analyzer, planError)
    safeInput.requestedScopePlan = normalizePlan(safeInput.requestedScopePlan)
    const resultUnresolved: UnresolvedItem[] = []
    const resultWarnings: string[] = []
    const observations: Observation[] = []
    const declarations = [...(safeInput.manualDeclarations ?? [])].sort((left, right) => compareCodeUnits(left.id, right.id))
    const assets = new Map(safeInput.assets.map((asset) => [asset.id, asset]))
    const seenIds = new Set<string>()
    for (const declaration of declarations) {
      const asset = assets.get(declaration.assetId)
      if (!asset) {
        resultUnresolved.push(interpreterUnresolved('ASSET_NOT_DECLARED', 'Manual observation refers to an asset outside the interpreter input.', declaration.ontologyPath, declaration.assetId, [declaration.id]))
        continue
      }
      if (!planPathAllowed(safeInput.requestedScopePlan, declaration.ontologyPath, declaration.assetId, safeInput.effectiveScenario)) {
        resultUnresolved.push(interpreterUnresolved('SCOPE_NOT_PERMITTED', 'Manual observation is outside the current RequestedScopePlan.', declaration.ontologyPath, declaration.assetId, [declaration.id]))
        continue
      }
      if (seenIds.has(declaration.id)) {
        resultUnresolved.push(interpreterUnresolved('OBSERVATION_ID_DUPLICATE', 'Manual observations must use stable unique IDs.', declaration.ontologyPath, declaration.assetId, [declaration.id]))
        continue
      }
      seenIds.add(declaration.id)
      observations.push(makeManualObservation(declaration))
    }
    const projection = referenceInputProjection(safeInput)
    return finalReferenceResult({
      schemaVersion: REFERENCE_INTERPRETER_RESULT_SCHEMA_VERSION,
      status: 'ok',
      interpreterId: MANUAL_REFERENCE_INTERPRETER_VERSION,
      inputHash: inputHash(projection),
      observations,
      unresolvedItems: resultUnresolved,
      warnings: resultWarnings,
      analyzer,
    })
  }
}

interface FixtureSpec { ontologyPath: string; value: JsonValue }

const FIXTURE_SPECS: FixtureSpec[] = [
  { ontologyPath: 'person.identity', value: { kind: 'subject', label: 'fixture-subject' } },
  { ontologyPath: 'person.hair', value: { style: 'shoulder-length', color: 'dark-brown' } },
  { ontologyPath: 'expression', value: { emotion: 'neutral', intensity: 0.25 } },
  { ontologyPath: 'pose', value: { orientation: 'frontal', stance: 'relaxed' } },
  { ontologyPath: 'wardrobe.top', value: { category: 'jacket', color: 'black' } },
  { ontologyPath: 'environment.background', value: { kind: 'city-street', depth: 'midground' } },
  { ontologyPath: 'camera.framing', value: { framing: 'portrait', angle: 'eye-level' } },
]

function fixtureValue(spec: FixtureSpec, assetContentHash: string): JsonValue {
  if (spec.ontologyPath !== 'person.identity') return clone(spec.value)
  return { ...(spec.value as JsonObject), assetContentHash }
}

export class FixtureReferenceInterpreter implements ReferenceInterpreterContract {
  interpret(input: ReferenceInterpreterInput): ReferenceInterpreterResult {
    const safeInput = clone(input)
    const fixtureId = safeInput.fixtureId ?? (safeInput.assets.length === 1 && safeInput.assets[0].id === 'ref-01' ? 'ref-01' : undefined)
    const analyzer: AnalyzerMetadata = { schemaVersion: 'voce.analyzer-metadata/v1alpha1', adapterId: FIXTURE_REFERENCE_INTERPRETER_VERSION, model: 'fixture', promptVersion: 'v1', ...(fixtureId ? { fixtureId } : {}) }
    const planError = validateRequestedScopePlan(safeInput.requestedScopePlan, safeInput.caseId, safeInput.caseRevision)
    if (planError) return blockedReferenceResult(safeInput, FIXTURE_REFERENCE_INTERPRETER_VERSION, analyzer, planError)
    safeInput.requestedScopePlan = normalizePlan(safeInput.requestedScopePlan)
    const resultUnresolved: UnresolvedItem[] = []
    const observations: Observation[] = []
    if (!fixtureId) {
      for (const asset of safeInput.assets) resultUnresolved.push(interpreterUnresolved('FIXTURE_ID_REQUIRED', 'FixtureReferenceInterpreter requires a fixtureId or the explicit ref-01 fixture asset.', undefined, asset.id))
    } else {
      const specs = [...FIXTURE_SPECS].sort((left, right) => compareCodeUnits(left.ontologyPath, right.ontologyPath))
      for (const asset of [...safeInput.assets].sort((left, right) => compareCodeUnits(left.id, right.id))) {
        if (asset.availability !== 'available') {
          resultUnresolved.push(interpreterUnresolved('ASSET_UNAVAILABLE', 'Fixture asset is not available for offline interpretation.', undefined, asset.id))
          continue
        }
        let emitted = 0
        for (const spec of specs) {
          if (!planPathAllowed(safeInput.requestedScopePlan, spec.ontologyPath, asset.id, safeInput.effectiveScenario)) continue
          const observation = createObservation({
            schemaVersion: OBSERVATION_SCHEMA_VERSION,
            id: `observation-${asset.id}-${spec.ontologyPath.replaceAll('.', '-')}`,
            assetId: asset.id,
            ontologyPath: spec.ontologyPath,
            value: fixtureValue(spec, asset.contentHash),
            confidence: 0.75,
            provenance: { source: 'reference_observed', sourceIds: [asset.id, asset.contentHash].sort(compareCodeUnits), createdBy: FIXTURE_REFERENCE_INTERPRETER_VERSION, createdAt: FIXED_DECISION_TIME },
            analyzer,
            warnings: [],
          })
          observations.push(observation)
          emitted += 1
        }
        if (emitted === 0) resultUnresolved.push(interpreterUnresolved('SCOPE_NOT_PERMITTED', 'No fixture observation scope is permitted for this asset.', undefined, asset.id))
      }
    }
    const projection = referenceInputProjection(safeInput)
    return finalReferenceResult({
      schemaVersion: REFERENCE_INTERPRETER_RESULT_SCHEMA_VERSION,
      status: 'ok',
      interpreterId: FIXTURE_REFERENCE_INTERPRETER_VERSION,
      inputHash: inputHash(projection),
      observations,
      unresolvedItems: resultUnresolved,
      warnings: fixtureId ? [] : ['FIXTURE_SCOPE_OUTPUT_EMPTY'],
      analyzer,
    })
  }
}

interface FactCandidate { id: string; path: string; value: JsonValue; provenance: Observation['provenance']; acceptedByIds: string[]; acceptedByDecisionIds: string[]; sourceBindingIds: string[] }

function candidateFromObservation(observation: Observation, binding: SourceBinding, decisionIds: string[]): FactCandidate {
  const acceptedByDecisionIds = stableUnique(decisionIds)
  return { id: binding.id, path: binding.targetPath, value: clone(observation.value), provenance: clone(observation.provenance), acceptedByIds: acceptedByDecisionIds, acceptedByDecisionIds, sourceBindingIds: [binding.id] }
}

function candidateFromIntent(intent: ChangeIntent): FactCandidate | undefined {
  if (intent.requestedValue === undefined || intent.operation === 'remove') return undefined
  return { id: intent.id, path: intent.targetPath, value: clone(intent.requestedValue), provenance: clone(intent.provenance), acceptedByIds: [intent.id], acceptedByDecisionIds: [], sourceBindingIds: [] }
}

function candidateFromMetadata(metadata: TrustedMetadata): FactCandidate {
  return { id: metadata.id, path: metadata.targetPath, value: clone(metadata.value), provenance: clone(metadata.provenance), acceptedByIds: [metadata.id], acceptedByDecisionIds: [], sourceBindingIds: [] }
}

function validDecisionAuthority(value: string): boolean {
  return value === 'user' || value === 'host_policy' || value === 'trusted_metadata' || value === 'auto_policy'
}

function normalizedDecisionHash(decision: ObservationDecision | BindingDecision): string {
  return decision instanceof Object && 'observationId' in decision
    ? sha256(observationDecisionProjection(decision as ObservationDecision))
    : sha256(bindingDecisionProjection(decision as BindingDecision))
}

function makeBindingFor(intent: ChangeIntent, observation: Observation): SourceBinding {
  const relation = intent.operation === 'preserve' ? 'preserve' : intent.operation === 'replace' ? 'reproduce' : 'inspire'
  const body: Omit<SourceBinding, 'contentHash'> = {
    schemaVersion: SOURCE_BINDING_SCHEMA_VERSION,
    id: hashId('binding', { targetPath: intent.targetPath, observationId: observation.id, relation, priority: intent.importance }),
    targetPath: intent.targetPath,
    observationIds: [observation.id],
    relation,
    priority: intent.importance,
  }
  return createSourceBinding(body)
}

function candidateKey(binding: SourceBinding): string {
  return `${binding.targetPath}|${binding.relation}|${binding.priority}|${sortedStrings(binding.observationIds).join(',')}`
}

function decisionKey(value: BindingDecision): string {
  return `${value.bindingId}|${value.bindingHash}|${value.contextHash}`
}

function factForCandidates(path: string, candidates: FactCandidate[]): { fact?: OntologyFact; conflict?: Conflict } {
  const byValue = new Map<string, FactCandidate[]>()
  for (const candidate of candidates) {
    const key = canonicalValue(candidate.value)
    const existing = byValue.get(key) ?? []
    existing.push(candidate)
    byValue.set(key, existing)
  }
  if (byValue.size > 1) {
    const allCandidates = candidates.flatMap((candidate) => [candidate.id]).sort(compareCodeUnits)
    return { conflict: conflict({ code: 'SOURCE_CONFLICT_UNRESOLVED', message: 'Confirmed sources disagree for one target path and no explicit adjudication selected a winner.', targetPath: path, candidateIds: allCandidates, relatedIds: allCandidates, blocking: true }) }
  }
  const sameValue = [...byValue.values()][0]
  if (!sameValue || sameValue.length === 0) return {}
  const sourceBindingIds = stableUnique(sameValue.flatMap((candidate) => candidate.sourceBindingIds))
  const sourceIds = stableUnique(sameValue.flatMap((candidate) => candidate.provenance.sourceIds))
  const acceptedByIds = stableUnique(sameValue.flatMap((candidate) => candidate.acceptedByIds))
  const acceptedByDecisionIds = stableUnique(sameValue.flatMap((candidate) => candidate.acceptedByDecisionIds))
  const first = sameValue[0]
  const factBase: Omit<OntologyFact, 'id'> = {
    schemaVersion: ONTOLOGY_FACT_SCHEMA_VERSION,
    path,
    value: clone(first.value),
    provenance: { ...clone(first.provenance), sourceIds },
    acceptedByIds,
    acceptedByDecisionIds,
    sourceBindingIds,
  }
  return { fact: { ...clone(factBase), id: hashId('fact', factBase) } }
}

function finalOntology(value: Omit<OntologyInstance, 'instanceHash'>): OntologyInstance {
  const base = clone({
    ...value,
    facts: sortedBy(value.facts, (item) => item.path),
    unknownPaths: stableUnique(value.unknownPaths),
    unspecifiedPaths: stableUnique(value.unspecifiedPaths),
    unresolvedItems: sortedBy(value.unresolvedItems, (item) => item.id),
    conflicts: sortedBy(value.conflicts, (item) => item.id),
    decisionTrace: sortedBy(value.decisionTrace, (item) => item.id),
  }) as OntologyInstance
  const withoutHash = clone({ ...base, instanceHash: undefined }) as unknown as Record<string, unknown>
  delete withoutHash.instanceHash
  return clone({ ...withoutHash, instanceHash: sha256(jsonReady(withoutHash) ?? null) }) as OntologyInstance
}

function finalResolverResult(value: Omit<EvidenceAndSourceResolverResult, 'resultHash'>): EvidenceAndSourceResolverResult {
  const withoutHash = clone({
    ...value,
    proposedBindings: sortedBy(value.proposedBindings, (item) => item.id),
    proposedBindingDecisions: sortedBy(value.proposedBindingDecisions, (item) => item.decisionId),
    confirmedBindings: sortedBy(value.confirmedBindings, (item) => item.id),
    confirmedBindingDecisions: sortedBy(value.confirmedBindingDecisions, (item) => item.decisionId),
    questions: sortedBy(value.questions, (item) => item.id),
    conflicts: sortedBy(value.conflicts, (item) => item.id),
    unresolvedItems: sortedBy(value.unresolvedItems, (item) => item.id),
    decisionTrace: sortedBy(value.decisionTrace, (item) => item.id),
    warnings: sortedStrings(value.warnings),
  }) as unknown as Record<string, unknown>
  delete withoutHash.resultHash
  return clone({ ...withoutHash, resultHash: sha256(jsonReady(withoutHash) ?? null) }) as EvidenceAndSourceResolverResult
}

function blockedPlanHash(input: EvidenceAndSourceResolverInput): string {
  const candidate = input.requestedScopePlan as unknown as Record<string, unknown>
  return typeof candidate?.planHash === 'string' && /^sha256:[0-9a-f]{64}$/.test(candidate.planHash)
    ? candidate.planHash
    : sha256({ invalidRequestedScopePlan: jsonReady(input.requestedScopePlan) ?? null })
}

function blockedResolverResult(input: EvidenceAndSourceResolverInput, resolverInputHash: string, error: RequestedScopePlanValidationError): EvidenceAndSourceResolverResult {
  const plan = input.requestedScopePlan as unknown as Record<string, unknown>
  const planId = typeof plan?.id === 'string' ? plan.id : 'requested-scope-plan'
  const relatedIds = [planId]
  const unresolvedItem = unresolved({ code: error.code, message: error.message, status: 'unresolved', relatedIds })
  const conflictItem = conflict({ code: error.code, message: error.message, candidateIds: relatedIds, relatedIds, blocking: true })
  const traceItem = trace({ kind: 'scope', outcome: 'conflict', code: error.code, message: error.message, subjectIds: relatedIds })
  const ontology = finalOntology({
    schemaVersion: ONTOLOGY_INSTANCE_SCHEMA_VERSION,
    id: hashId('ontology', { caseId: input.caseId, caseRevision: input.caseRevision, contextHash: input.contextHash, requestedScopePlanHash: blockedPlanHash(input) }),
    caseId: input.caseId,
    caseRevision: input.caseRevision,
    contextHash: input.contextHash,
    requestedScopePlanHash: blockedPlanHash(input),
    facts: [],
    unknownPaths: [],
    unspecifiedPaths: [],
    unresolvedItems: [unresolvedItem],
    conflicts: [conflictItem],
    decisionTrace: [traceItem],
  })
  return finalResolverResult({
    schemaVersion: RESOLVER_RESULT_SCHEMA_VERSION,
    status: 'blocked',
    resolverId: EVIDENCE_RESOLVER_VERSION,
    inputHash: resolverInputHash,
    proposedBindings: [],
    proposedBindingDecisions: [],
    confirmedBindings: [],
    confirmedBindingDecisions: [],
    ontologyInstance: ontology,
    questions: [],
    conflicts: [conflictItem],
    unresolvedItems: [unresolvedItem],
    decisionTrace: [traceItem],
    warnings: [error.code],
  })
}

export class EvidenceAndSourceResolver implements EvidenceAndSourceResolverContract {
  resolve(input: EvidenceAndSourceResolverInput): EvidenceAndSourceResolverResult {
    const safeInput = clone(input)
    const resolverProjection = resolverInputProjection(safeInput)
    const resolverInputHash = inputHash(resolverProjection)
    const planError = validateRequestedScopePlan(safeInput.requestedScopePlan, safeInput.caseId, safeInput.caseRevision)
    if (planError) return blockedResolverResult(safeInput, resolverInputHash, planError)
    safeInput.requestedScopePlan = normalizePlan(safeInput.requestedScopePlan)
    const unresolvedItems: UnresolvedItem[] = []
    const conflicts: Conflict[] = []
    const questions: Question[] = []
    const decisionTrace: DecisionTrace[] = []
    const warnings: string[] = []
    const addUnresolved = (item: UnresolvedItem) => { if (!unresolvedItems.some((existing) => existing.id === item.id)) unresolvedItems.push(item) }
    const addConflict = (item: Conflict) => { if (!conflicts.some((existing) => existing.id === item.id)) conflicts.push(item) }
    const addTrace = (item: DecisionTrace) => { if (!decisionTrace.some((existing) => existing.id === item.id)) decisionTrace.push(item) }

    const observations = sortedBy((safeInput.observations ?? []).map(normalizeObservation), (item) => item.id)
    const validObservations = new Map<string, Observation>()
    const observationIdCollisions = new Set<string>()
    const observationsById = new Map<string, Observation[]>()
    for (const observation of observations) observationsById.set(observation.id, [...(observationsById.get(observation.id) ?? []), observation])
    for (const [observationId, group] of [...observationsById.entries()].sort((left, right) => compareCodeUnits(left[0], right[0]))) {
      const semanticVariants = stableUnique(group.map((item) => canonicalValue(observationProjection(item))))
      if (semanticVariants.length > 1) {
        observationIdCollisions.add(observationId)
        const targetPath = group[0].ontologyPath
        const message = 'The same Observation ID was supplied with different semantic content; no variant is selected by insertion order.'
        const relatedIds = stableUnique(group.map((item) => item.id))
        addConflict(conflict({ code: 'OBSERVATION_ID_COLLISION', message, targetPath, candidateIds: relatedIds, relatedIds, blocking: true }))
        addUnresolved(unresolved({ code: 'OBSERVATION_ID_COLLISION', message, status: 'unresolved', targetPath, assetId: group[0].assetId, relatedIds }))
        addTrace(trace({ kind: 'conflict', outcome: 'conflict', code: 'OBSERVATION_ID_COLLISION', message, targetPath, subjectIds: relatedIds }))
        continue
      }
      const valid = group.find((item) => item.schemaVersion === OBSERVATION_SCHEMA_VERSION && computeObservationContentHash(item) === item.contentHash)
      const selected = valid ?? group[0]
      if (!valid) {
        const item = unresolved({ code: 'OBSERVATION_HASH_MISMATCH', message: 'Observation contentHash does not match its canonical semantic projection.', status: 'unresolved', targetPath: selected.ontologyPath, assetId: selected.assetId, relatedIds: [selected.id] })
        addUnresolved(item)
        addTrace(trace({ kind: 'observation', outcome: 'rejected', code: 'OBSERVATION_HASH_MISMATCH', message: 'Candidate observation was rejected because its content hash is stale or malformed.', targetPath: selected.ontologyPath, subjectIds: [selected.id] }))
        continue
      }
      validObservations.set(observationId, selected)
    }

    const confirmedObservationIds = new Set<string>()
    const conflictedObservationIds = new Set<string>(observationIdCollisions)
    const observationDecisionsById = new Map<string, ObservationDecision[]>()
    for (const decision of sortedBy(safeInput.observationDecisions ?? [], (item) => item.decisionId)) observationDecisionsById.set(decision.decisionId, [...(observationDecisionsById.get(decision.decisionId) ?? []), decision])
    const eligibleObservationDecisions = new Map<string, ObservationDecision[]>()
    for (const [decisionId, group] of [...observationDecisionsById.entries()].sort((left, right) => compareCodeUnits(left[0], right[0]))) {
      const semanticVariants = stableUnique(group.map((item) => canonicalValue(observationDecisionProjection(item))))
      if (semanticVariants.length > 1) {
        const relatedIds = stableUnique(group.flatMap((item) => [item.decisionId, item.observationId]))
        const message = 'The same ObservationDecision decisionId was supplied with conflicting semantic content; no variant is selected by insertion order.'
        addConflict(conflict({ code: 'OBSERVATION_DECISION_ID_COLLISION', message, candidateIds: [decisionId], relatedIds, blocking: true }))
        addUnresolved(unresolved({ code: 'OBSERVATION_DECISION_ID_COLLISION', message, status: 'unresolved', relatedIds }))
        addTrace(trace({ kind: 'conflict', outcome: 'conflict', code: 'OBSERVATION_DECISION_ID_COLLISION', message, subjectIds: relatedIds }))
        for (const item of group) {
          conflictedObservationIds.add(item.observationId)
          const observation = validObservations.get(item.observationId)
          if (observation && item.observationHash !== observation.contentHash) {
            addUnresolved(unresolved({ code: 'OBSERVATION_HASH_MISMATCH', message: 'ObservationDecision is bound to a different observation content hash.', status: 'unresolved', targetPath: observation.ontologyPath, assetId: observation.assetId, relatedIds: [item.decisionId, observation.id] }))
          }
          if (item.contextHash !== safeInput.contextHash) {
            addUnresolved(unresolved({ code: 'OBSERVATION_CONTEXT_MISMATCH', message: 'ObservationDecision belongs to a different compilation context.', status: 'unresolved', targetPath: observation?.ontologyPath, assetId: observation?.assetId, relatedIds: [item.decisionId, item.observationId] }))
          }
        }
        continue
      }
      const selected = group.find((item) => item.schemaVersion === OBSERVATION_DECISION_SCHEMA_VERSION && normalizedDecisionHash(item) === item.decisionHash) ?? group[0]
      const observation = validObservations.get(selected.observationId)
      const validHash = selected.schemaVersion === OBSERVATION_DECISION_SCHEMA_VERSION && normalizedDecisionHash(selected) === selected.decisionHash
      if (!validHash) {
        addUnresolved(unresolved({ code: 'OBSERVATION_DECISION_HASH_MISMATCH', message: 'ObservationDecision decisionHash is stale or malformed.', status: 'unresolved', relatedIds: [selected.decisionId, selected.observationId] }))
        addTrace(trace({ kind: 'observation', outcome: 'rejected', code: 'OBSERVATION_DECISION_HASH_MISMATCH', message: 'Observation decision was not accepted because its decision hash is invalid.', subjectIds: [selected.decisionId, selected.observationId] }))
        continue
      }
      if (!observation || !validObservations.has(observation.id)) {
        addUnresolved(unresolved({ code: 'OBSERVATION_NOT_FOUND', message: 'ObservationDecision does not refer to a valid current Observation.', status: 'unresolved', relatedIds: [selected.decisionId, selected.observationId] }))
        continue
      }
      if (selected.observationHash !== observation.contentHash) {
        addUnresolved(unresolved({ code: 'OBSERVATION_HASH_MISMATCH', message: 'ObservationDecision is bound to a different observation content hash.', status: 'unresolved', targetPath: observation.ontologyPath, assetId: observation.assetId, relatedIds: [selected.decisionId, observation.id] }))
        addTrace(trace({ kind: 'observation', outcome: 'rejected', code: 'OBSERVATION_HASH_MISMATCH', message: 'Observation decision is stale because the candidate observation changed.', targetPath: observation.ontologyPath, subjectIds: [selected.decisionId, observation.id] }))
        continue
      }
      if (selected.contextHash !== safeInput.contextHash) {
        addUnresolved(unresolved({ code: 'OBSERVATION_CONTEXT_MISMATCH', message: 'ObservationDecision belongs to a different compilation context.', status: 'unresolved', targetPath: observation.ontologyPath, assetId: observation.assetId, relatedIds: [selected.decisionId, observation.id] }))
        addTrace(trace({ kind: 'observation', outcome: 'rejected', code: 'OBSERVATION_CONTEXT_MISMATCH', message: 'Observation decision is stale because its contextHash differs from the current context.', targetPath: observation.ontologyPath, subjectIds: [selected.decisionId, observation.id] }))
        continue
      }
      if (!validDecisionAuthority(selected.authority)) {
        addUnresolved(unresolved({ code: 'OBSERVATION_AUTHORITY_INVALID', message: 'ObservationDecision authority is not permitted by the public contract.', status: 'unresolved', relatedIds: [selected.decisionId] }))
        continue
      }
      const subjectKey = canonicalValue({ observationId: selected.observationId, observationHash: selected.observationHash, contextHash: selected.contextHash })
      eligibleObservationDecisions.set(subjectKey, [...(eligibleObservationDecisions.get(subjectKey) ?? []), selected])
    }
    for (const decisions of [...eligibleObservationDecisions.values()].sort((left, right) => compareCodeUnits(left[0].observationId, right[0].observationId) || compareCodeUnits(left[0].decisionId, right[0].decisionId))) {
      const observation = validObservations.get(decisions[0].observationId)
      if (!observation) continue
      const statuses = new Set(decisions.map((item) => item.status))
      const decisionIds = stableUnique(decisions.map((item) => item.decisionId))
      if (statuses.has('confirmed') && statuses.has('rejected')) {
        const message = 'Confirmed and rejected authoritative ObservationDecisions disagree for the same observation, content, and context.'
        conflictedObservationIds.add(observation.id)
        addConflict(conflict({ code: 'OBSERVATION_DECISION_CONFLICT', message, targetPath: observation.ontologyPath, candidateIds: decisionIds, relatedIds: [observation.id, ...decisionIds], blocking: true }))
        addUnresolved(unresolved({ code: 'OBSERVATION_DECISION_CONFLICT', message, status: 'unresolved', targetPath: observation.ontologyPath, assetId: observation.assetId, relatedIds: [observation.id, ...decisionIds] }))
        addTrace(trace({ kind: 'conflict', outcome: 'conflict', code: 'OBSERVATION_DECISION_CONFLICT', message, targetPath: observation.ontologyPath, subjectIds: [observation.id, ...decisionIds] }))
        continue
      }
      for (const decision of decisions) {
        if (decision.status === 'confirmed') {
          confirmedObservationIds.add(observation.id)
          addTrace(trace({ kind: 'observation', outcome: 'accepted', code: 'OBSERVATION_CONFIRMED', message: 'Candidate observation is eligible for source resolution under the current context.', targetPath: observation.ontologyPath, subjectIds: [decision.decisionId, observation.id] }))
        } else {
          addTrace(trace({ kind: 'observation', outcome: decision.status === 'proposed' ? 'proposed' : 'rejected', code: `OBSERVATION_${decision.status.toUpperCase()}`, message: `Observation decision status is ${decision.status}; it cannot admit evidence into the ontology.`, targetPath: observation.ontologyPath, subjectIds: [decision.decisionId, observation.id] }))
        }
      }
    }
    for (const observation of validObservations.values()) {
      if (!confirmedObservationIds.has(observation.id) || conflictedObservationIds.has(observation.id)) addUnresolved(unresolved({ code: 'OBSERVATION_NOT_CONFIRMED', message: 'Candidate observation has no unconflicted current confirmed ObservationDecision.', status: 'unknown', targetPath: observation.ontologyPath, assetId: observation.assetId, relatedIds: [observation.id] }))
    }

    const sourceBindings = sortedBy((safeInput.sourceBindings ?? []).map(normalizeBinding), (item) => item.id)
    const bindingIdCollisions = new Set<string>()
    const sourceBindingsById = new Map<string, SourceBinding[]>()
    for (const binding of sourceBindings) sourceBindingsById.set(binding.id, [...(sourceBindingsById.get(binding.id) ?? []), binding])
    const validSourceBindings = new Map<string, SourceBinding>()
    for (const [bindingId, group] of [...sourceBindingsById.entries()].sort((left, right) => compareCodeUnits(left[0], right[0]))) {
      const semanticVariants = stableUnique(group.map((item) => canonicalValue(bindingProjection(item))))
      if (semanticVariants.length > 1) {
        bindingIdCollisions.add(bindingId)
        const targetPath = group[0].targetPath
        const message = 'The same SourceBinding ID was supplied with different semantic content; no variant is selected by insertion order.'
        const relatedIds = stableUnique(group.map((item) => item.id))
        addConflict(conflict({ code: 'SOURCE_BINDING_ID_COLLISION', message, targetPath, candidateIds: relatedIds, relatedIds, blocking: true }))
        addUnresolved(unresolved({ code: 'SOURCE_BINDING_ID_COLLISION', message, status: 'unresolved', targetPath, relatedIds }))
        addTrace(trace({ kind: 'conflict', outcome: 'conflict', code: 'SOURCE_BINDING_ID_COLLISION', message, targetPath, subjectIds: relatedIds }))
        continue
      }
      const valid = group.find((item) => item.schemaVersion === SOURCE_BINDING_SCHEMA_VERSION && computeSourceBindingContentHash(item) === item.contentHash)
      if (valid) validSourceBindings.set(bindingId, valid)
      else {
        const selected = group[0]
        addUnresolved(unresolved({ code: 'BINDING_HASH_MISMATCH', message: 'SourceBinding contentHash does not match its canonical semantic projection.', status: 'unresolved', targetPath: selected.targetPath, relatedIds: [selected.id] }))
        addTrace(trace({ kind: 'binding', outcome: 'rejected', code: 'BINDING_HASH_MISMATCH', message: 'Source binding was rejected because its content hash is stale or malformed.', targetPath: selected.targetPath, subjectIds: [selected.id] }))
      }
    }
    const confirmedBindings: SourceBinding[] = []
    const confirmedBindingDecisions: BindingDecision[] = []
    const confirmedBindingIds = new Set<string>()
    const confirmedDecisionIdsByBinding = new Map<string, string[]>()
    const bindingDecisionsById = new Map<string, BindingDecision[]>()
    for (const decision of sortedBy(safeInput.bindingDecisions ?? [], (item) => item.decisionId)) bindingDecisionsById.set(decision.decisionId, [...(bindingDecisionsById.get(decision.decisionId) ?? []), decision])
    const eligibleBindingDecisions = new Map<string, BindingDecision[]>()
    const conflictedBindingIds = new Set<string>(bindingIdCollisions)
    for (const [decisionId, group] of [...bindingDecisionsById.entries()].sort((left, right) => compareCodeUnits(left[0], right[0]))) {
      const semanticVariants = stableUnique(group.map((item) => canonicalValue(bindingDecisionProjection(item))))
      if (semanticVariants.length > 1) {
        const relatedIds = stableUnique(group.flatMap((item) => [item.decisionId, item.bindingId]))
        const message = 'The same BindingDecision decisionId was supplied with conflicting semantic content; no variant is selected by insertion order.'
        addConflict(conflict({ code: 'BINDING_DECISION_ID_COLLISION', message, candidateIds: [decisionId], relatedIds, blocking: true }))
        addUnresolved(unresolved({ code: 'BINDING_DECISION_ID_COLLISION', message, status: 'unresolved', relatedIds }))
        addTrace(trace({ kind: 'conflict', outcome: 'conflict', code: 'BINDING_DECISION_ID_COLLISION', message, subjectIds: relatedIds }))
        for (const item of group) conflictedBindingIds.add(item.bindingId)
        continue
      }
      const selected = group.find((item) => item.schemaVersion === BINDING_DECISION_SCHEMA_VERSION && normalizedDecisionHash(item) === item.decisionHash) ?? group[0]
      const binding = validSourceBindings.get(selected.bindingId)
      const validHash = selected.schemaVersion === BINDING_DECISION_SCHEMA_VERSION && normalizedDecisionHash(selected) === selected.decisionHash
      if (!validHash) {
        addUnresolved(unresolved({ code: 'BINDING_DECISION_HASH_MISMATCH', message: 'BindingDecision decisionHash is stale or malformed.', status: 'unresolved', relatedIds: [selected.decisionId, selected.bindingId] }))
        addTrace(trace({ kind: 'binding', outcome: 'rejected', code: 'BINDING_DECISION_HASH_MISMATCH', message: 'Binding decision was not accepted because its decision hash is invalid.', subjectIds: [selected.decisionId, selected.bindingId] }))
        continue
      }
      if (!binding) {
        addUnresolved(unresolved({ code: 'BINDING_NOT_FOUND', message: 'BindingDecision does not refer to a current SourceBinding.', status: 'unresolved', relatedIds: [selected.decisionId, selected.bindingId] }))
        continue
      }
      if (binding.schemaVersion !== SOURCE_BINDING_SCHEMA_VERSION || computeSourceBindingContentHash(binding) !== binding.contentHash || selected.bindingHash !== binding.contentHash) {
        addUnresolved(unresolved({ code: 'BINDING_HASH_MISMATCH', message: 'BindingDecision is bound to a different SourceBinding content hash.', status: 'unresolved', targetPath: binding.targetPath, relatedIds: [selected.decisionId, binding.id] }))
        addTrace(trace({ kind: 'binding', outcome: 'rejected', code: 'BINDING_HASH_MISMATCH', message: 'Binding decision is stale because the source binding changed.', targetPath: binding.targetPath, subjectIds: [selected.decisionId, binding.id] }))
        continue
      }
      if (selected.contextHash !== safeInput.contextHash) {
        addUnresolved(unresolved({ code: 'BINDING_CONTEXT_MISMATCH', message: 'BindingDecision belongs to a different compilation context.', status: 'unresolved', targetPath: binding.targetPath, relatedIds: [selected.decisionId, binding.id] }))
        addTrace(trace({ kind: 'binding', outcome: 'rejected', code: 'BINDING_CONTEXT_MISMATCH', message: 'Binding decision is stale because its contextHash differs from the current context.', targetPath: binding.targetPath, subjectIds: [selected.decisionId, binding.id] }))
        continue
      }
      if (!validDecisionAuthority(selected.authority)) {
        addUnresolved(unresolved({ code: 'BINDING_AUTHORITY_INVALID', message: 'BindingDecision authority is not permitted by the public contract.', status: 'unresolved', relatedIds: [selected.decisionId] }))
        continue
      }
      const subjectKey = canonicalValue({ bindingId: selected.bindingId, bindingHash: selected.bindingHash, contextHash: selected.contextHash })
      eligibleBindingDecisions.set(subjectKey, [...(eligibleBindingDecisions.get(subjectKey) ?? []), selected])
    }
    for (const decisions of [...eligibleBindingDecisions.values()].sort((left, right) => compareCodeUnits(left[0].bindingId, right[0].bindingId) || compareCodeUnits(left[0].decisionId, right[0].decisionId))) {
      const binding = validSourceBindings.get(decisions[0].bindingId)
      if (!binding) continue
      const statuses = new Set(decisions.map((item) => item.status))
      const decisionIds = stableUnique(decisions.map((item) => item.decisionId))
      if (statuses.has('confirmed') && statuses.has('rejected')) {
        const message = 'Confirmed and rejected authoritative BindingDecisions disagree for the same binding, content, and context.'
        conflictedBindingIds.add(binding.id)
        addConflict(conflict({ code: 'BINDING_DECISION_CONFLICT', message, targetPath: binding.targetPath, candidateIds: decisionIds, relatedIds: [binding.id, ...decisionIds], blocking: true }))
        addUnresolved(unresolved({ code: 'BINDING_DECISION_CONFLICT', message, status: 'unresolved', targetPath: binding.targetPath, relatedIds: [binding.id, ...decisionIds] }))
        addTrace(trace({ kind: 'conflict', outcome: 'conflict', code: 'BINDING_DECISION_CONFLICT', message, targetPath: binding.targetPath, subjectIds: [binding.id, ...decisionIds] }))
        continue
      }
      for (const decision of decisions) {
        if (decision.status === 'confirmed') {
          confirmedBindingIds.add(binding.id)
          if (!confirmedBindings.some((item) => item.id === binding.id)) confirmedBindings.push(binding)
          confirmedBindingDecisions.push(decision)
          confirmedDecisionIdsByBinding.set(binding.id, stableUnique([...(confirmedDecisionIdsByBinding.get(binding.id) ?? []), decision.decisionId]))
          addTrace(trace({ kind: 'binding', outcome: 'accepted', code: 'BINDING_CONFIRMED', message: 'Source binding is eligible for fact construction under the current context.', targetPath: binding.targetPath, subjectIds: [decision.decisionId, binding.id] }))
        } else {
          addTrace(trace({ kind: 'binding', outcome: decision.status === 'proposed' ? 'proposed' : 'rejected', code: `BINDING_${decision.status.toUpperCase()}`, message: `Binding decision status is ${decision.status}; it cannot contribute an OntologyFact.`, targetPath: binding.targetPath, subjectIds: [decision.decisionId, binding.id] }))
        }
      }
    }

    const changeIntents = sortedBy(safeInput.changeIntents ?? [], (item) => item.id)
    const removePaths = changeIntents.filter((intent) => intent.operation === 'remove').map((intent) => intent.targetPath)
    const candidatesByPath = new Map<string, FactCandidate[]>()
    const addCandidate = (candidate: FactCandidate) => {
      const existing = candidatesByPath.get(candidate.path) ?? []
      existing.push(candidate)
      candidatesByPath.set(candidate.path, existing)
    }
    for (const intent of changeIntents) {
      if (!planPathAllowed(safeInput.requestedScopePlan, intent.targetPath, undefined, safeInput.effectiveScenario)) {
        addUnresolved(unresolved({ code: 'SCOPE_NOT_PERMITTED', message: 'ChangeIntent target is outside the current RequestedScopePlan.', status: 'unresolved', targetPath: intent.targetPath, relatedIds: [intent.id] }))
        addTrace(trace({ kind: 'scope', outcome: 'unresolved', code: 'SCOPE_NOT_PERMITTED', message: 'Target directive cannot be resolved because its ontology path is not allowed for this case.', targetPath: intent.targetPath, subjectIds: [intent.id] }))
        continue
      }
      if (intent.operation === 'remove') {
        addTrace(trace({ kind: 'intent', outcome: 'accepted', code: 'TARGET_REMOVE', message: 'ChangeIntent remove excludes the target from the result; it does not exclude a source observation.', targetPath: intent.targetPath, subjectIds: [intent.id] }))
        continue
      }
      const explicitCandidate = candidateFromIntent(intent)
      if (explicitCandidate) addCandidate(explicitCandidate)
      else if (intent.operation === 'create') {
        addUnresolved(unresolved({ code: 'TARGET_VALUE_UNSPECIFIED', message: 'Create intent has no requested value; the path remains unspecified rather than being filled by a default.', status: 'unknown', targetPath: intent.targetPath, relatedIds: [intent.id] }))
        addTrace(trace({ kind: 'intent', outcome: 'unresolved', code: 'TARGET_VALUE_UNSPECIFIED', message: 'Create intent did not specify a value and no default was inferred.', targetPath: intent.targetPath, subjectIds: [intent.id] }))
      }
      addTrace(trace({ kind: 'intent', outcome: 'accepted', code: 'TARGET_DIRECTIVE_RECEIVED', message: 'Target directive was considered without changing its separate source-binding semantics.', targetPath: intent.targetPath, subjectIds: [intent.id] }))
    }

    for (const metadata of sortedBy(safeInput.trustedMetadata ?? [], (item) => item.id)) {
      if (!planPathAllowed(safeInput.requestedScopePlan, metadata.targetPath, metadata.assetId, safeInput.effectiveScenario)) {
        addUnresolved(unresolved({ code: 'SCOPE_NOT_PERMITTED', message: 'Trusted metadata target is outside the current RequestedScopePlan.', status: 'unresolved', targetPath: metadata.targetPath, assetId: metadata.assetId, relatedIds: [metadata.id] }))
        continue
      }
      addCandidate(candidateFromMetadata(metadata))
      addTrace(trace({ kind: 'fact', outcome: 'accepted', code: 'TRUSTED_METADATA_ACCEPTED', message: 'Trusted metadata may support a sparse fact under the current scope plan.', targetPath: metadata.targetPath, subjectIds: [metadata.id] }))
    }

    const proposedBindings = new Map<string, SourceBinding>()
    const proposedBindingDecisions = new Map<string, BindingDecision>()
    const existingByKey = new Map([...validSourceBindings.values()].map((binding) => [candidateKey(binding), binding]))
    for (const intent of changeIntents) {
      if (intent.operation === 'create' || intent.operation === 'remove') continue
      if (!planPathAllowed(safeInput.requestedScopePlan, intent.targetPath, undefined, safeInput.effectiveScenario)) continue
      const candidates = [...validObservations.values()].filter((observation) => {
        if (!confirmedObservationIds.has(observation.id)) return false
        if (!exactPathMatch(intent.targetPath, observation.ontologyPath)) return false
        if (!planPathAllowed(safeInput.requestedScopePlan, observation.ontologyPath, observation.assetId, safeInput.effectiveScenario)) return false
        if (!intent.sourceHintIds || intent.sourceHintIds.length === 0) return true
        return intent.sourceHintIds.includes(observation.id) || intent.sourceHintIds.includes(observation.assetId)
      }).sort((left, right) => compareCodeUnits(left.id, right.id))
      if (candidates.length === 0) {
        const rawCandidates = [...validObservations.values()].filter((observation) => exactPathMatch(intent.targetPath, observation.ontologyPath) && (!intent.sourceHintIds || intent.sourceHintIds.length === 0 || intent.sourceHintIds.includes(observation.id) || intent.sourceHintIds.includes(observation.assetId)))
        if (rawCandidates.length > 0) addUnresolved(unresolved({ code: 'SOURCE_CANDIDATE_NOT_CONFIRMED', message: 'Matching candidate observations exist, but none has a current confirmed ObservationDecision.', status: 'unknown', targetPath: intent.targetPath, relatedIds: rawCandidates.map((item) => item.id) }))
        else addUnresolved(unresolved({ code: 'SOURCE_CANDIDATE_NOT_FOUND', message: 'No confirmed observation matches the target path and source hints.', status: 'unknown', targetPath: intent.targetPath, relatedIds: [intent.id] }))
        continue
      }
      for (const observation of candidates) {
        const generated = makeBindingFor(intent, observation)
        const binding = existingByKey.get(candidateKey(generated)) ?? generated
        if (confirmedBindingIds.has(binding.id)) continue
        proposedBindings.set(binding.id, binding)
        const proposedDecision = createBindingDecision({ schemaVersion: BINDING_DECISION_SCHEMA_VERSION, decisionId: hashId('binding-decision', { bindingId: binding.id, bindingHash: binding.contentHash, contextHash: safeInput.contextHash }), bindingId: binding.id, bindingHash: binding.contentHash, contextHash: safeInput.contextHash, status: 'proposed', authority: 'auto_policy', decidedBy: EVIDENCE_RESOLVER_VERSION, decidedAt: FIXED_DECISION_TIME, reasonCode: 'BINDING_PROPOSED' })
        proposedBindingDecisions.set(decisionKey(proposedDecision), proposedDecision)
        addTrace(trace({ kind: 'binding', outcome: 'proposed', code: 'BINDING_PROPOSED', message: 'Resolver proposed a source relationship; proposal remains unusable until a separate confirmed BindingDecision matches it exactly.', targetPath: binding.targetPath, subjectIds: [binding.id, observation.id] }))
      }
    }

    for (const binding of confirmedBindings) {
      if (!planPathAllowed(safeInput.requestedScopePlan, binding.targetPath, undefined, safeInput.effectiveScenario)) {
        addUnresolved(unresolved({ code: 'SCOPE_NOT_PERMITTED', message: 'Confirmed SourceBinding target is outside the current RequestedScopePlan.', status: 'unresolved', targetPath: binding.targetPath, relatedIds: [binding.id] }))
        continue
      }
      const observationsForBinding = binding.observationIds.map((id) => validObservations.get(id)).filter((item): item is Observation => item !== undefined)
      if (observationsForBinding.length !== binding.observationIds.length || observationsForBinding.some((observation) => !confirmedObservationIds.has(observation.id))) {
        addUnresolved(unresolved({ code: 'BINDING_OBSERVATION_NOT_CONFIRMED', message: 'Confirmed SourceBinding cannot contribute because every referenced Observation is not currently confirmed.', status: 'unknown', targetPath: binding.targetPath, relatedIds: [binding.id, ...binding.observationIds] }))
        continue
      }
      if (observationsForBinding.some((observation) => !exactPathMatch(binding.targetPath, observation.ontologyPath))) {
        addUnresolved(unresolved({ code: 'BINDING_PATH_MISMATCH', message: 'SourceBinding targetPath must exactly match every referenced Observation ontologyPath until an explicit field projection contract exists.', status: 'unresolved', targetPath: binding.targetPath, relatedIds: [binding.id, ...binding.observationIds] }))
        addTrace(trace({ kind: 'binding', outcome: 'rejected', code: 'BINDING_PATH_MISMATCH', message: 'Source binding was rejected because M3 does not infer parent/child ontology field projections.', targetPath: binding.targetPath, subjectIds: [binding.id, ...binding.observationIds] }))
        continue
      }
      if (binding.relation === 'exclude') {
        addTrace(trace({ kind: 'binding', outcome: 'excluded', code: 'SOURCE_EXCLUDED', message: 'SourceBinding exclude prevents this evidence from supplying a fact; it does not remove a target property.', targetPath: binding.targetPath, subjectIds: [binding.id, ...binding.observationIds] }))
        continue
      }
      if (conflictedBindingIds.has(binding.id)) continue
      if (removePaths.some((path) => scopeContainsPath(path, binding.targetPath))) {
        const item = conflict({ code: 'REMOVE_SOURCE_CONFLICT', message: 'A target remove intent conflicts with a confirmed source binding for the same ontology path.', targetPath: binding.targetPath, candidateIds: [binding.id], relatedIds: [binding.id], blocking: true })
        addConflict(item)
        addUnresolved(unresolved({ code: 'REMOVE_SOURCE_CONFLICT', message: 'The target remove intent prevents this source binding from contributing a fact.', status: 'unresolved', targetPath: binding.targetPath, relatedIds: [binding.id] }))
        addTrace(trace({ kind: 'conflict', outcome: 'conflict', code: 'REMOVE_SOURCE_CONFLICT', message: 'Target remove and source inheritance are separate decisions and cannot both supply this path.', targetPath: binding.targetPath, subjectIds: [binding.id] }))
        continue
      }
      const bindingDecisionIds = confirmedDecisionIdsByBinding.get(binding.id) ?? []
      if (observationsForBinding.length === 1) addCandidate(candidateFromObservation(observationsForBinding[0], binding, bindingDecisionIds))
      else {
        const values = observationsForBinding.map((observation) => canonicalValue(observation.value))
        if (new Set(values).size !== 1) {
          addConflict(conflict({ code: 'BINDING_INTERNAL_CONFLICT', message: 'One confirmed source binding references incompatible observations for the same target path.', targetPath: binding.targetPath, candidateIds: binding.observationIds, relatedIds: [binding.id, ...binding.observationIds], blocking: true }))
          continue
        }
        addCandidate({ ...candidateFromObservation(observationsForBinding[0], binding, bindingDecisionIds), id: binding.id, sourceBindingIds: [binding.id] })
      }
      addTrace(trace({ kind: 'fact', outcome: 'accepted', code: 'SOURCE_BINDING_ELIGIBLE', message: 'Confirmed observation and confirmed source binding jointly support a candidate ontology fact.', targetPath: binding.targetPath, subjectIds: [binding.id, ...binding.observationIds] }))
    }

    const facts: OntologyFact[] = []
    for (const [path, candidates] of [...candidatesByPath.entries()].sort((left, right) => compareCodeUnits(left[0], right[0]))) {
      if (removePaths.some((removePath) => scopeContainsPath(removePath, path))) continue
      const resolved = factForCandidates(path, candidates)
      if (resolved.conflict) {
        addConflict(resolved.conflict)
        addUnresolved(unresolved({ code: resolved.conflict.code, message: resolved.conflict.message, status: 'unresolved', targetPath: path, relatedIds: resolved.conflict.candidateIds }))
        addTrace(trace({ kind: 'conflict', outcome: 'conflict', code: resolved.conflict.code, message: resolved.conflict.message, targetPath: path, subjectIds: resolved.conflict.candidateIds }))
        questions.push(question({ code: 'SOURCE_CONFLICT_REQUIRES_ADJUDICATION', prompt: 'Which confirmed source should supply this target path?', targetPath: path, assetIds: [], relatedIds: resolved.conflict.candidateIds, blocking: true, status: 'open' }))
      } else if (resolved.fact) {
        facts.push(resolved.fact)
        addTrace(trace({ kind: 'fact', outcome: 'accepted', code: 'ONTOLOGY_FACT_ACCEPTED', message: 'Sparse fact admitted from explicit intent, trusted metadata, or jointly confirmed evidence and binding decisions.', targetPath: path, subjectIds: [resolved.fact.id, ...resolved.fact.sourceBindingIds, ...resolved.fact.acceptedByDecisionIds] }))
      }
    }

    const factPaths = new Set(facts.map((fact) => fact.path))
    const unknownPaths: string[] = []
    const unspecifiedPaths: string[] = []
    for (const excluded of safeInput.requestedScopePlan.excludedScopes) unspecifiedPaths.push(excluded)
    for (const intent of changeIntents) if (intent.operation === 'create' && intent.requestedValue === undefined) unspecifiedPaths.push(intent.targetPath)
    for (const scope of safeInput.requestedScopePlan.scopes) {
      if (excludedBy(safeInput.requestedScopePlan, scope.ontologyPath)) {
        unspecifiedPaths.push(scope.ontologyPath)
        continue
      }
      if (!factPaths.has(scope.ontologyPath) && !facts.some((fact) => scopeContainsPath(scope.ontologyPath, fact.path)) && !unresolvedItems.some((item) => item.targetPath && scopeContainsPath(scope.ontologyPath, item.targetPath))) unknownPaths.push(scope.ontologyPath)
    }
    if (proposedBindings.size > 0) warnings.push('PROPOSALS_REQUIRE_BINDING_CONFIRMATION')
    if (conflicts.length > 0) warnings.push('CONFLICTS_REQUIRE_EXPLICIT_ADJUDICATION')
    const ontology = finalOntology({
      schemaVersion: ONTOLOGY_INSTANCE_SCHEMA_VERSION,
      id: hashId('ontology', { caseId: safeInput.caseId, caseRevision: safeInput.caseRevision, contextHash: safeInput.contextHash, requestedScopePlanHash: safeInput.requestedScopePlan.planHash }),
      caseId: safeInput.caseId,
      caseRevision: safeInput.caseRevision,
      contextHash: safeInput.contextHash,
      requestedScopePlanHash: safeInput.requestedScopePlan.planHash,
      facts,
      unknownPaths,
      unspecifiedPaths,
      unresolvedItems,
      conflicts,
      decisionTrace,
    })
    return finalResolverResult({
      schemaVersion: RESOLVER_RESULT_SCHEMA_VERSION,
      status: 'ok',
      resolverId: EVIDENCE_RESOLVER_VERSION,
      inputHash: resolverInputHash,
      proposedBindings: [...proposedBindings.values()],
      proposedBindingDecisions: [...proposedBindingDecisions.values()],
      confirmedBindings,
      confirmedBindingDecisions,
      ontologyInstance: ontology,
      questions,
      conflicts,
      unresolvedItems,
      decisionTrace,
      warnings,
    })
  }
}

export const DeterministicEvidenceAndSourceResolver = EvidenceAndSourceResolver

export function resolveEvidenceAndSource(input: EvidenceAndSourceResolverInput): EvidenceAndSourceResolverResult {
  return new EvidenceAndSourceResolver().resolve(input)
}

export function createEvidenceAndSourceResolver(): EvidenceAndSourceResolver {
  return new EvidenceAndSourceResolver()
}
