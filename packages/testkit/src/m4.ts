import type {
  ArtifactHandle,
  CompilationContext,
  ConstraintCompilationInput,
  ConstraintIR,
  JsonValue,
  OntologyFact,
  OntologyInstance,
  OutputContract,
  ProviderCapabilityProfile,
  ReferenceCandidate,
  ReferenceDependency,
  ReferencePlanningInput,
} from '@voce/contracts'
import {
  computeCompilationContextHash,
  computeOntologyInstanceHash,
  computeReferenceCandidateHash,
  compileConstraints,
  createReferenceDependency,
  MOCK_NATIVE_TRANSPARENT_PROFILE,
  planReferences,
  sha256,
} from '@voce/core'

export const M4_FIXTURE_CASE_ID = 'case-m4-fixture'
export const M4_FIXTURE_CASE_REVISION = 1
export const M4_FIXTURE_PLAN_HASH = sha256({ fixture: 'm4-scope-plan' })
export const M4_FIXTURE_CREATED_AT = '2026-01-01T00:00:00.000Z'

export function fixtureM4Artifact(id = 'ref-01', byteLength?: number, mediaType = 'image/png'): ArtifactHandle {
  return {
    id,
    storeId: 'm4-fixture-store',
    contentHash: sha256({ fixtureAsset: id }),
    mediaType,
    ...(byteLength === undefined ? {} : { byteLength }),
    role: 'reference',
    resolverId: 'm4-fixture-resolver',
    availability: 'available',
    retentionClass: 'fixture',
    redactionPolicy: 'safe-hash-only',
  }
}

export function fixtureM4Context(overrides: Partial<Omit<CompilationContext, 'contextHash'>> = {}): CompilationContext {
  const base: Omit<CompilationContext, 'contextHash'> = {
    caseSpecId: M4_FIXTURE_CASE_ID,
    caseSpecRevision: M4_FIXTURE_CASE_REVISION,
    caseSpecHash: sha256({ fixture: 'm4-case-spec' }),
    artifactHashes: [],
    decisionHashes: [],
    scenarioCompositionLockHash: sha256({ fixture: 'm4-lock' }),
    effectiveScenarioHash: sha256({ fixture: 'm4-scenario' }),
    rulePackPlugins: [],
    optimizer: { id: 'voce.deterministic', version: '1.0.0', digest: sha256({ fixture: 'm4-optimizer' }) },
    ...overrides,
  }
  return { ...base, contextHash: computeCompilationContextHash(base as CompilationContext) }
}

export function fixtureM4Ontology(facts: OntologyFact[] = [], contextHash = fixtureM4Context().contextHash, requestedScopePlanHash = M4_FIXTURE_PLAN_HASH, status: 'ok'|'blocked' = 'ok'): OntologyInstance {
  const base = {
    schemaVersion: 'voce.ontology-instance/v1alpha1' as const,
    id: 'ontology-m4-fixture',
    caseId: M4_FIXTURE_CASE_ID,
    caseRevision: M4_FIXTURE_CASE_REVISION,
    contextHash,
    requestedScopePlanHash,
    facts,
    unknownPaths: [],
    unspecifiedPaths: [],
    unresolvedItems: [],
    conflicts: [],
    decisionTrace: [],
  }
  return { ...base, instanceHash: computeOntologyInstanceHash({ ...base, instanceHash: '' }), status } as OntologyInstance
}

export function fixtureM4Output(background: OutputContract['background'] = 'transparent'): OutputContract {
  return { artifactKind: 'image', dataType: 'image', mediaTypes: ['image/png'], cardinality: { min: 1, max: 1 }, dimensions: { width: 1024, height: 1024 }, background }
}

export function fixtureM4ConstraintInput(overrides: Partial<ConstraintCompilationInput> = {}): ConstraintCompilationInput {
  const context = overrides.context ?? fixtureM4Context()
  const contextHash = overrides.contextHash ?? context.contextHash
  const requestedScopePlanHash = overrides.requestedScopePlanHash ?? M4_FIXTURE_PLAN_HASH
  const ontologyInstance = overrides.ontologyInstance ?? fixtureM4Ontology([], contextHash, requestedScopePlanHash)
  return {
    schemaVersion: 'voce.constraint-compilation-input/v1alpha1',
    caseId: M4_FIXTURE_CASE_ID,
    caseRevision: M4_FIXTURE_CASE_REVISION,
    context,
    contextHash,
    requestedScopePlanHash,
    ontologyInstance,
    changeIntents: [],
    sourceBindings: [],
    bindingDecisions: [],
    outputContract: fixtureM4Output(),
    ...overrides,
  }
}

export function fixtureM4ConstraintIR(overrides: Partial<ConstraintCompilationInput> = {}): ConstraintIR {
  return compileConstraints(fixtureM4ConstraintInput(overrides))
}

export function fixtureM4Candidate(id: string, importance: ReferenceCandidate['importance'] = 'preferred', byteLength?: number, profile: ProviderCapabilityProfile = MOCK_NATIVE_TRANSPARENT_PROFILE): ReferenceCandidate {
  const artifact = fixtureM4Artifact(id, byteLength, profile.allowedReferenceMediaTypes?.[0] ?? 'image/png')
  const candidate: ReferenceCandidate = { schemaVersion: 'voce.reference-candidate/v1alpha1', id, assetId: id, artifact, contentHash: artifact.contentHash, mediaType: artifact.mediaType, ...(byteLength === undefined ? {} : { byteLength }), role: 'detail', ontologyScopes: [`scope.${id}`], importance, constraintIds: [], sourceBindingIds: [], goalIds: [] }
  return { ...candidate, candidateHash: computeReferenceCandidateHash(candidate) }
}

export function fixtureM4ReferenceInput(profile: ProviderCapabilityProfile = MOCK_NATIVE_TRANSPARENT_PROFILE, candidates: ReferenceCandidate[] = [fixtureM4Candidate('ref-01', 'required', 100_000, profile)]): ReferencePlanningInput {
  const constraintIR = fixtureM4ConstraintIR()
  return { schemaVersion: 'voce.reference-planning-input/v1alpha1', caseId: M4_FIXTURE_CASE_ID, caseRevision: M4_FIXTURE_CASE_REVISION, contextHash: constraintIR.contextHash, constraintIR, candidates, dependencies: [], profile }
}

export function fixtureM4ReferencePlan(profile: ProviderCapabilityProfile = MOCK_NATIVE_TRANSPARENT_PROFILE, candidates?: ReferenceCandidate[]) {
  return planReferences(fixtureM4ReferenceInput(profile, candidates))
}

export function fixtureM4ReferenceDependency(parentCandidateId: string, childCandidateId: string, importance: ReferenceDependency['importance'] = 'required'): ReferenceDependency {
  return createReferenceDependency({ schemaVersion: 'voce.reference-dependency/v1alpha1', id: `dependency-${parentCandidateId}-${childCandidateId}`, parentCandidateId, childCandidateId, kind: 'parent_detail', importance, reasonCode: 'FIXTURE_PARENT_DETAIL', explanation: 'Fixture parent/detail dependency.' })
}
