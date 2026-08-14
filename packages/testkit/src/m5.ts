import type {
  CompilationContext,
  ExecutionAuthorization,
  OfflineExecutionInput,
  OutputContract,
  PipelinePlan,
  PromptCandidateIR,
  PromptCompilationInput,
  PromptGuardInput,
  PromptIR,
  PromptTransformation,
  ProviderCapabilityProfile,
  RemoteCallAuthorization,
} from '@voce/contracts'
import {
  computeExecutionBudgetDigest,
  computeExecutionDataTransferDigest,
  computeExecutionStepInputHash,
  computeOutputContractHash,
  computePromptCandidateHash,
  computePromptIRHash,
  createExecutionAuthorization,
  createPromptCandidateIR,
  createRemoteCallAuthorization,
  compilePromptIR,
  MOCK_IMAGE_PROFILE,
  MOCK_JPEG_PROFILE,
  planPipeline,
  sha256,
} from '@voce/core'
import {
  fixtureM4ConstraintIR,
  fixtureM4Context,
  fixtureM4Output,
  fixtureM4ReferencePlan,
  M4_FIXTURE_CASE_ID,
  M4_FIXTURE_CASE_REVISION,
} from './m4.js'

const FIXED_M5_TIME = '2026-01-01T00:00:00.000Z'

function sorted(values: string[]): string[] {
  return [...new Set(values)].sort()
}

function profileForPrompt(prompt: PromptIR): ProviderCapabilityProfile {
  return prompt.targetCapabilityProfile.id === MOCK_JPEG_PROFILE.id ? MOCK_JPEG_PROFILE : MOCK_IMAGE_PROFILE
}

export function fixtureM5Output(): OutputContract {
  return fixtureM4Output('opaque')
}

export function fixtureM5Context(overrides: Partial<Omit<CompilationContext, 'contextHash'>> = {}): CompilationContext {
  return fixtureM4Context(overrides)
}

export function fixtureM5CompilationInput(profile: ProviderCapabilityProfile = MOCK_IMAGE_PROFILE, overrides: Partial<PromptCompilationInput> = {}): PromptCompilationInput {
  const context = overrides.context ?? fixtureM5Context()
  const constraintIR = overrides.constraintIR ?? fixtureM4ConstraintIR({ context })
  const referencePlan = overrides.referencePlan ?? fixtureM4ReferencePlan(profile)
  const outputContract = overrides.outputContract ?? fixtureM5Output()
  const pipelineResult = overrides.pipelinePlan ? { status: 'ok' as const, pipelinePlan: overrides.pipelinePlan } : planPipeline({ schemaVersion: 'voce.pipeline-planning-input/v1alpha1', caseId: M4_FIXTURE_CASE_ID, caseRevision: M4_FIXTURE_CASE_REVISION, contextHash: context.contextHash, outputContract, constraintIR, referencePlan, profile })
  if (!pipelineResult.pipelinePlan) throw new Error('M5_FIXTURE_PIPELINE_BLOCKED')
  return {
    schemaVersion: 'voce.prompt-compilation-input/v1alpha1',
    caseId: M4_FIXTURE_CASE_ID,
    caseRevision: M4_FIXTURE_CASE_REVISION,
    context,
    contextHash: context.contextHash,
    constraintIR,
    referencePlan,
    pipelinePlan: pipelineResult.pipelinePlan,
    outputContract,
    targetAdapter: { id: profile.adapterId, version: profile.version, digest: profile.adapterDigest! },
    targetCapabilityProfile: { id: profile.id, version: profile.version, digest: profile.profileHash! },
    ...overrides,
  }
}

export function fixtureM5PromptIR(profile: ProviderCapabilityProfile = MOCK_IMAGE_PROFILE, overrides: Partial<PromptCompilationInput> = {}): PromptIR {
  return compilePromptIR(fixtureM5CompilationInput(profile, overrides))
}

export function fixtureM5Candidate(prompt: PromptIR = fixtureM5PromptIR(), transformations: PromptTransformation[] = []): PromptCandidateIR {
  return createPromptCandidateIR(prompt, transformations)
}

export function fixtureM5GuardInput(prompt: PromptIR = fixtureM5PromptIR(), candidate: PromptCandidateIR = fixtureM5Candidate(prompt), policy: PromptGuardInput['policy'] = 'reject'): PromptGuardInput {
  const profile = profileForPrompt(prompt)
  const constraintIR = fixtureM4ConstraintIR()
  const referencePlan = fixtureM4ReferencePlan(profile)
  const pipelineResult = planPipeline({ schemaVersion: 'voce.pipeline-planning-input/v1alpha1', caseId: prompt.caseId, caseRevision: prompt.caseRevision, contextHash: prompt.contextHash, outputContract: prompt.output, constraintIR, referencePlan, profile })
  if (!pipelineResult.pipelinePlan) throw new Error('M5_FIXTURE_PIPELINE_BLOCKED')
  return {
    schemaVersion: 'voce.prompt-guard-input/v1alpha1',
    promptIR: prompt,
    candidate,
    constraintIR,
    referencePlan,
    pipelinePlan: pipelineResult.pipelinePlan,
    outputContract: prompt.output,
    context: fixtureM5Context(),
    policy,
  }
}

function stepPurpose(type: PipelinePlan['steps'][number]['type']): RemoteCallAuthorization['purpose'] {
  if (type === 'generate') return 'generation'
  if (type === 'semantic_review') return 'semantic_review'
  if (type === 'publish_asset') return 'asset_publication'
  if (type === 'resolve_asset') return 'reference_interpretation'
  return 'postprocessing'
}

export function fixtureM5RemoteAuthorizations(input: Omit<OfflineExecutionInput, 'executionAuthorization'|'remoteCallAuthorizations'>, promptArtifactHash = 'sha256:' + '0'.repeat(64)): RemoteCallAuthorization[] {
  const artifactHashes = sorted(input.referencePlan.ordered.map((reference) => reference.contentHash))
  const scopeIds = sorted(input.referencePlan.ordered.flatMap((reference) => reference.ontologyScopes))
  const constraintIds = sorted(input.constraintIR.constraints.map((constraint) => constraint.id))
  return input.pipelinePlan.steps.filter((step) => step.mayCreateChargedSubmission || step.destination !== 'local').sort((left, right) => left.id.localeCompare(right.id)).map((step) => createRemoteCallAuthorization({
    schemaVersion: 'voce.remote-call-authorization/v1alpha1',
    id: `m5-remote-${step.id}`,
    caseId: input.pipelinePlan.caseId,
    caseRevision: input.pipelinePlan.caseRevision,
    contextHash: input.contextHash,
    stepId: step.id,
    purpose: stepPurpose(step.type),
    inputHash: computeExecutionStepInputHash(step, input.contextHash, input.pipelinePlan.planHash, input.referencePlan.planHash, promptArtifactHash, artifactHashes),
    permittedArtifactHashes: artifactHashes,
    permittedScopeIds: scopeIds,
    constraintIds,
    adapterId: step.adapterId,
    adapterDigest: step.adapterVersion.digest,
    profileDigest: step.profileVersion.digest,
    destination: step.destination,
    dataCategories: sorted(step.dataTransfer.dataCategories),
    maximumCalls: step.budget.maximumCalls,
    maximumRetries: step.budget.maximumRetries,
    ...(step.budget.maximumBytes === undefined && step.dataTransfer.maximumBytes === undefined ? {} : { maximumBytes: step.budget.maximumBytes ?? step.dataTransfer.maximumBytes }),
    timeoutMs: step.budget.timeoutMs,
    ...(step.budget.maximumCost === undefined ? {} : { maximumCost: step.budget.maximumCost }),
    ...(step.budget.currency === undefined ? {} : { currency: step.budget.currency }),
    idempotencyKey: `m5-idempotency-${step.id}`,
    authority: 'fixture-authority',
    authorizedBy: 'fixture-reviewer',
    authorizedAt: FIXED_M5_TIME,
  }))
}

export function fixtureM5ExecutionInput(profile: ProviderCapabilityProfile = MOCK_IMAGE_PROFILE, promptArtifact: PromptIR|PromptCandidateIR = fixtureM5PromptIR(profile), options: OfflineExecutionInput['options'] = {}): OfflineExecutionInput {
  const promptHash = 'candidateHash' in promptArtifact ? promptArtifact.candidateHash : computePromptIRHash(promptArtifact)
  const compilation = fixtureM5CompilationInput(profile)
  const base = {
    schemaVersion: 'voce.offline-execution-input/v1alpha1' as const,
    context: compilation.context,
    contextHash: compilation.contextHash,
    constraintIR: compilation.constraintIR,
    referencePlan: compilation.referencePlan,
    pipelinePlan: compilation.pipelinePlan,
    outputContract: compilation.outputContract,
    promptArtifact,
    options,
  }
  const remoteCallAuthorizations = fixtureM5RemoteAuthorizations(base, promptHash)
  const executionAuthorization = createExecutionAuthorization({
    schemaVersion: 'voce.execution-authorization/v1alpha1',
    id: 'm5-execution-authorization',
    caseId: compilation.pipelinePlan.caseId,
    caseRevision: compilation.pipelinePlan.caseRevision,
    contextHash: compilation.contextHash,
    constraintIRHash: compilation.constraintIR.deterministicSignature,
    compilationSignature: compilation.constraintIR.deterministicSignature,
    referencePlanHash: compilation.referencePlan.planHash,
    pipelinePlanHash: compilation.pipelinePlan.planHash,
    outputContractHash: computeOutputContractHash(compilation.outputContract),
    promptArtifactHash: promptHash,
    adapterProfileDigests: sorted([compilation.pipelinePlan.profileDigest, ...compilation.pipelinePlan.adapterDigests, ...compilation.pipelinePlan.steps.map((step) => step.profileVersion.digest)]),
    destinations: sorted(compilation.pipelinePlan.dataTransfers.map((transfer) => transfer.destination)),
    dataTransferDigest: computeExecutionDataTransferDigest(compilation.pipelinePlan),
    budgetDigest: computeExecutionBudgetDigest(compilation.pipelinePlan),
    remoteCallAuthorizationIds: remoteCallAuthorizations.map((authorization) => authorization.id),
    authority: 'fixture-authority',
    authorizedBy: 'fixture-reviewer',
    authorizedAt: FIXED_M5_TIME,
  })
  return { ...base, remoteCallAuthorizations, executionAuthorization }
}
