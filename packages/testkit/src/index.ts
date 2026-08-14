import type {
  ArtifactHandle,
  CaseSpec,
  ChangeIntent,
  EvidenceAndSourceResolverInput,
  Observation,
  ObservationDecision,
  Provenance,
  RequestedScope,
  RequestedScopePlan,
} from '@voce/contracts'
import {
  createBindingDecision,
  createObservationDecision,
  createSourceBinding,
  computeRequestedScopePlanHash,
  sha256,
} from '@voce/core'
import type { JsonValue } from '@voce/contracts'

export function assert(condition: boolean, message: string): void {
  if (!condition) throw new Error(message)
}

export const FIXTURE_CONTEXT_HASH = sha256({ fixture: 'm3-context', revision: 1 })
export const FIXTURE_CASE_ID = 'case-m3-fixture'
export const FIXTURE_CASE_REVISION = 1
export const FIXTURE_CREATED_AT = '2026-01-01T00:00:00.000Z'

export function fixtureCaseSpec(assets: ArtifactHandle[] = [fixtureArtifact()]): CaseSpec {
  return {
    schemaVersion: 'voce.case-spec/v1alpha1',
    id: FIXTURE_CASE_ID,
    revision: FIXTURE_CASE_REVISION,
    mode: 'manual',
    scenario: { root: { packId: 'fixture.root', versionRange: '1.0.0' }, extensions: [] },
    userIntent: 'Preserve the selected reference properties and create only explicitly requested target values.',
    assets,
    trustedMetadata: [],
    policies: { schemaVersion: 'voce.case-policies/v1alpha1', observationConfirmation: 'explicit', bindingConfirmation: 'explicit', allowDeclaredDefaults: false },
    requestedOutput: { artifactKind: 'image', dataType: 'image', mediaTypes: ['image/png'], cardinality: { min: 1, max: 1 } },
  }
}

export function fixtureProvenance(source: Provenance['source'] = 'reference_observed', sourceIds: string[] = ['ref-01']): Provenance {
  return { source, sourceIds: [...sourceIds].sort(), createdBy: 'voce-testkit', createdAt: FIXTURE_CREATED_AT }
}

export function fixtureArtifact(id = 'ref-01', contentHash = sha256({ fixtureAsset: id })): ArtifactHandle {
  return {
    id,
    storeId: 'fixture-store',
    contentHash,
    mediaType: 'image/png',
    role: 'reference',
    resolverId: 'fixture-resolver',
    availability: 'available',
    retentionClass: 'fixture',
    redactionPolicy: 'safe-hash-only',
  }
}

export function fixtureScope(id: string, ontologyPath: string, assetId = 'ref-01', required = true): RequestedScope {
  return { schemaVersion: 'voce.requested-scope/v1alpha1', id, ontologyPath, assetIds: [assetId], purpose: 'find_source', required }
}

export function fixtureScopePlan(paths: string[], assetId = 'ref-01', caseId = FIXTURE_CASE_ID, caseRevision = FIXTURE_CASE_REVISION): RequestedScopePlan {
  const scopes = paths.map((path, index) => fixtureScope(`scope-${index + 1}`, path, assetId))
  const base = { schemaVersion: 'voce.requested-scope-plan/v1alpha1' as const, id: 'scope-plan-m3-fixture', caseId, caseRevision, scopes, excludedScopes: [], questions: [] }
  return { ...base, planHash: computeRequestedScopePlanHash(base) }
}

export function fixtureObservationDecision(observation: Observation, contextHash = FIXTURE_CONTEXT_HASH, status: ObservationDecision['status'] = 'confirmed'): ObservationDecision {
  return createObservationDecision({
    schemaVersion: 'voce.observation-decision/v1alpha1',
    decisionId: `decision-${observation.id}`,
    observationId: observation.id,
    observationHash: observation.contentHash,
    contextHash,
    status,
    authority: 'user',
    decidedBy: 'fixture-reviewer',
    decidedAt: FIXTURE_CREATED_AT,
    reasonCode: status === 'confirmed' ? 'FIXTURE_CONFIRMED' : 'FIXTURE_NOT_CONFIRMED',
  })
}

export function fixtureChangeIntent(id: string, operation: ChangeIntent['operation'], targetPath: string, requestedValue?: JsonValue): ChangeIntent {
  return {
    schemaVersion: 'voce.change-intent/v1alpha1',
    id,
    operation,
    targetPath,
    ...(requestedValue === undefined ? {} : { requestedValue }),
    importance: 'required',
    provenance: fixtureProvenance('user_explicit', [id]),
  }
}

export function fixtureResolverInput(overrides: Partial<EvidenceAndSourceResolverInput> = {}): EvidenceAndSourceResolverInput {
  const requestedScopePlan = fixtureScopePlan(['person.identity', 'person.hair', 'expression', 'pose', 'wardrobe.top', 'environment.background', 'camera.framing'])
  return {
    schemaVersion: 'voce.evidence-source-resolver-input/v1alpha1',
    caseId: FIXTURE_CASE_ID,
    caseRevision: FIXTURE_CASE_REVISION,
    contextHash: FIXTURE_CONTEXT_HASH,
    requestedScopePlan,
    changeIntents: [],
    observations: [],
    observationDecisions: [],
    sourceBindings: [],
    bindingDecisions: [],
    trustedMetadata: [],
    ...overrides,
  }
}

export function confirmBinding(binding: Parameters<typeof createSourceBinding>[0], contextHash = FIXTURE_CONTEXT_HASH) {
  const normalized = createSourceBinding(binding)
  return {
    binding: normalized,
    decision: createBindingDecision({
      schemaVersion: 'voce.binding-decision/v1alpha1' as const,
      decisionId: `decision-${normalized.id}`,
      bindingId: normalized.id,
      bindingHash: normalized.contentHash,
      contextHash,
      status: 'confirmed' as const,
      authority: 'user' as const,
      decidedBy: 'fixture-reviewer',
      decidedAt: FIXTURE_CREATED_AT,
      reasonCode: 'FIXTURE_CONFIRMED',
    }),
  }
}

export * from './m4.js'
