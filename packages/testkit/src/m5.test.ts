import test from 'node:test'
import assert from 'node:assert/strict'
import type { PromptIR, PromptTransformation, PromptSection } from '@voce/contracts'
import {
  DeterministicPromptGuard,
  DeterministicPromptOptimizer,
  MockProviderAdapter,
  MOCK_JPEG_PLUS_REMOVAL_PROFILE,
  MOCK_NATIVE_TRANSPARENT_PROFILE,
  OfflineExecutionRuntime,
  computePromptCandidateHash,
  computePromptIRHash,
  createProviderRenderRequest,
  compilePromptIR,
  createPromptCandidateIR,
  executeOffline,
  guardPromptCandidate,
  optimizePromptIRWithFallback,
  replayArtifact,
} from '@voce/core'
import {
  fixtureM5Candidate,
  fixtureM5CompilationInput,
  fixtureM5ExecutionInput,
  fixtureM5GuardInput,
  fixtureM5PromptIR,
} from './index.js'

function copy<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T
}

test('M5 PromptIR is structured, signature-stable, and defensive under insertion-order changes', () => {
  const leftInput = fixtureM5CompilationInput()
  const rightInput = copy(leftInput)
  rightInput.constraintIR.constraints.reverse()
  rightInput.referencePlan.ordered.reverse()
  rightInput.referencePlan.selected.reverse()
  rightInput.pipelinePlan.steps.reverse()
  rightInput.pipelinePlan.adapterDigests.reverse()
  const left = compilePromptIR(leftInput)
  const right = compilePromptIR(rightInput)
  assert.equal(left.deterministicSignature, right.deterministicSignature)
  assert.ok(left.sections.some((section) => section.kind === 'hard_constraint' || section.kind === 'required_constraint'))
  assert.ok(left.referenceMappings.length > 0)
  assert.ok(left.parameters.length > 0)
  const hash = left.deterministicSignature
  left.sections[0].content = 'mutated'
  assert.equal(compilePromptIR(leftInput).deterministicSignature, hash)
})

test('forged PromptIR signatures and M4 bindings fail closed before Guard comparisons', () => {
  const prompt = fixtureM5PromptIR()
  const candidate = fixtureM5Candidate(prompt)
  const forged = copy(prompt)
  forged.objective = 'unapproved objective'
  const result = guardPromptCandidate({ ...fixtureM5GuardInput(prompt, candidate), promptIR: forged })
  assert.equal(result.status, 'rejected')
  assert.ok(result.findings.some((finding) => finding.code === 'PROMPT_IR_SIGNATURE_MISMATCH'))
})

test('Guard rejects locked, reference, and typed output mutations with stable findings', () => {
  const prompt = fixtureM5PromptIR()
  const locked = prompt.sections.find((section) => section.mutability === 'locked')!
  const changedLocked = createPromptCandidateIR(prompt, [{ kind: 'rephrase', sectionId: locked.id, content: 'changed locked content' }])
  const lockedResult = guardPromptCandidate(fixtureM5GuardInput(prompt, changedLocked))
  assert.equal(lockedResult.status, 'rejected')
  assert.ok(lockedResult.findings.some((finding) => finding.code === 'LOCKED_SECTION_CHANGED'))

  const mappingCandidate = fixtureM5Candidate(prompt)
  mappingCandidate.referenceMappings[0].assetId = 'unauthorized-asset'
  mappingCandidate.candidateSections = mappingCandidate.sections
  mappingCandidate.candidateHash = computePromptCandidateHash(mappingCandidate)
  const mappingResult = guardPromptCandidate(fixtureM5GuardInput(prompt, mappingCandidate))
  assert.equal(mappingResult.status, 'rejected')
  assert.ok(mappingResult.findings.some((finding) => finding.code === 'CONFIRMED_REFERENCE_MAPPING_CHANGED'))

  const outputParameter = prompt.parameters.find((parameter) => parameter.name === 'width')!
  const parameterCandidate = fixtureM5Candidate(prompt)
  parameterCandidate.parameters.find((parameter) => parameter.id === outputParameter.id)!.value = Number(outputParameter.value) + 1
  parameterCandidate.requestParameters = Object.fromEntries(parameterCandidate.parameters.map((parameter) => [parameter.name, parameter.value]))
  parameterCandidate.candidateHash = computePromptCandidateHash(parameterCandidate)
  const parameterResult = guardPromptCandidate(fixtureM5GuardInput(prompt, parameterCandidate))
  assert.equal(parameterResult.status, 'rejected')
  assert.ok(parameterResult.findings.some((finding) => finding.code === 'PARAMETER_OUT_OF_BOUNDS' || finding.code === 'LOCKED_PARAMETER_CHANGED'))
})

test('declared rephrase and reorder transformations pass without weakening coverage', () => {
  const prompt = fixtureM5PromptIR()
  const objective = prompt.sections.find((section) => section.kind === 'objective')!
  const rephrase: PromptTransformation = { schemaVersion: 'voce.prompt-transformation/v1alpha1', kind: 'rephrase', sectionId: objective.id, content: objective.content.trim(), proof: { kind: 'whitespace_normalization', preservedConstraintIds: [], explanation: 'Fixture whitespace normalization.' } }
  const rephrased = createPromptCandidateIR(prompt, [rephrase])
  const rephraseResult = guardPromptCandidate(fixtureM5GuardInput(prompt, rephrased))
  assert.equal(rephraseResult.status, 'accepted')

  const sectionIds = prompt.sections.map((section) => section.id).reverse()
  const reordered = createPromptCandidateIR(prompt, [{ schemaVersion: 'voce.prompt-transformation/v1alpha1', kind: 'reorder', sectionIds }])
  const reorderResult = guardPromptCandidate(fixtureM5GuardInput(prompt, reordered))
  assert.equal(reorderResult.status, 'accepted')
})

test('free-text changes are unverifiable and fallback remains deterministic', () => {
  const prompt = fixtureM5PromptIR()
  const candidate = createPromptCandidateIR(prompt, [{ kind: 'free_text', content: 'add an unauthorized object' }])
  const result = guardPromptCandidate({ ...fixtureM5GuardInput(prompt, candidate), policy: 'fallback' })
  assert.equal(result.status, 'fallback')
  assert.equal(result.accepted, false)
  assert.ok(result.findings.some((finding) => finding.code === 'PROMPT_CANDIDATE_UNVERIFIABLE'))
  assert.equal(result.deterministicFallback.deterministicSignature, prompt.deterministicSignature)

  const safe = optimizePromptIRWithFallback({ schemaVersion: 'voce.prompt-optimization-input/v1alpha1', promptIR: prompt, mode: 'invalid' as never })
  assert.ok(safe.warnings.includes('OPTIMIZER_FALLBACK_DETERMINISTIC_PROMPT_IR'))
  assert.equal(computePromptCandidateHash(safe), safe.candidateHash)
  const optimizer = new DeterministicPromptOptimizer()
  assert.throws(() => optimizer.optimize({ schemaVersion: 'wrong' as never, promptIR: prompt }))
})

test('provider-neutral render request is guard-bound and mock rendering stays virtual', () => {
  const prompt = fixtureM5PromptIR()
  const candidate = fixtureM5Candidate(prompt)
  const guard = guardPromptCandidate(fixtureM5GuardInput(prompt, candidate))
  assert.equal(guard.status, 'accepted')
  const request = createProviderRenderRequest({ promptIR: prompt, candidate, guardResult: guard })
  const adapter = new MockProviderAdapter()
  const rendered = adapter.render(request)
  assert.equal(rendered.status, 'ok')
  assert.equal(rendered.outputArtifacts.length, 0)
  assert.equal(rendered.metadata.virtual, true)
  const tampered = copy(request)
  tampered.sections[0].content = 'tampered'
  assert.equal(adapter.render(tampered).status, 'failed')
})

test('execution preflight rejects plan, destination, budget, and prompt binding changes', () => {
  const base = fixtureM5ExecutionInput()
  const cases = [
    (input: typeof base) => { input.pipelinePlan.steps[0].destination = 'mock://changed' },
    (input: typeof base) => { input.pipelinePlan.budgets[0].maximumCalls += 1 },
    (input: typeof base) => { (input.promptArtifact as PromptIR).objective = 'tampered' },
  ]
  for (const mutate of cases) {
    const input = copy(base)
    mutate(input)
    const result = executeOffline(input)
    assert.equal(result.status, 'blocked')
    assert.ok(result.reasons.some((reason) => reason.includes('MISMATCH') || reason.includes('INVALID') || reason.includes('STALE')))
  }
})

test('native-transparent and JPEG-plus-removal mock plans complete with per-step receipts', () => {
  for (const profile of [MOCK_NATIVE_TRANSPARENT_PROFILE, MOCK_JPEG_PLUS_REMOVAL_PROFILE]) {
    const result = executeOffline(fixtureM5ExecutionInput(profile))
    assert.equal(result.status, 'completed')
    assert.equal(result.code, 'EXECUTION_COMPLETED')
    assert.equal(result.receipts.length, result.executionRun!.stepIds.length)
    assert.ok(result.events.length >= result.receipts.length * 2)
    assert.ok(result.receipts.every((receipt) => receipt.destination && receipt.maximumCalls >= 1 && receipt.timeoutMs > 0))
    assert.ok(result.trace?.traceHash)
    if (profile === MOCK_JPEG_PLUS_REMOVAL_PROFILE) assert.ok(result.executionRun!.outputArtifacts.some((artifact) => artifact.mediaType === 'image/png'))
  }
})

test('bounded failure stays inside the run budget and terminal rerun requires a new run', () => {
  const first = fixtureM5ExecutionInput(MOCK_NATIVE_TRANSPARENT_PROFILE)
  const generator = first.pipelinePlan.steps.find((step) => step.type === 'generate')!
  first.options = { retryableFailureStepIds: [generator.id], failStepIds: [generator.id] }
  const result = executeOffline(first)
  assert.equal(result.status, 'failed')
  const generatorEvents = result.events.filter((event) => event.stepId === generator.id)
  assert.equal(generatorEvents.filter((event) => event.state === 'submitted').length, 1)
  assert.equal(generatorEvents.filter((event) => event.state === 'failed').length, 1)
  const second = executeOffline(fixtureM5ExecutionInput(MOCK_NATIVE_TRANSPARENT_PROFILE))
  assert.notEqual(result.executionRun!.id, second.executionRun!.id)
})

test('submission_unknown does not resubmit and explicit reconcile changes only state', () => {
  const input = fixtureM5ExecutionInput()
  const remoteStep = input.pipelinePlan.steps.find((step) => step.mayCreateChargedSubmission)!
  input.options = { unknownStepIds: [remoteStep.id] }
  const runtime = new OfflineExecutionRuntime()
  const unknown = runtime.execute(input)
  assert.equal(unknown.status, 'submission_unknown')
  assert.equal(unknown.events.filter((event) => event.stepId === remoteStep.id && event.state === 'submitted').length, 1)
  const reconciled = runtime.reconcile(unknown.executionRun!.id, 'completed')
  assert.equal(reconciled.status, 'completed')
  assert.equal(reconciled.events.filter((event) => event.stepId === remoteStep.id && event.state === 'submitted').length, 1)
  assert.ok(reconciled.events.some((event) => event.state === 'reconciling'))
})

test('cleanup remains visible on failure, cancellation, restart, and cleanup failure', () => {
  const failedInput = fixtureM5ExecutionInput()
  const failing = failedInput.pipelinePlan.steps.find((step) => step.type === 'generate')!
  failedInput.options = { failStepIds: [failing.id] }
  const failed = executeOffline(failedInput)
  assert.equal(failed.status, 'failed')
  assert.ok(failed.cleanupReceipts.length > 0)

  const cancelledInput = fixtureM5ExecutionInput()
  cancelledInput.options = { cancelBeforeStepId: cancelledInput.pipelinePlan.steps[0].id }
  const cancelled = executeOffline(cancelledInput)
  assert.equal(cancelled.status, 'cancelled')
  assert.ok(cancelled.cleanupReceipts.length > 0)

  const restartInput = fixtureM5ExecutionInput()
  restartInput.options = { workerRestartAfterStepId: restartInput.pipelinePlan.steps[0].id }
  const restarted = executeOffline(restartInput)
  assert.ok(restarted.cleanupReceipts.length > 0)

  const cleanupFailureInput = fixtureM5ExecutionInput()
  cleanupFailureInput.options = { cleanupFailureIds: [cleanupFailureInput.pipelinePlan.cleanup[0].id], maximumCleanupRetries: 1 }
  const cleanupFailure = executeOffline(cleanupFailureInput)
  assert.equal(cleanupFailure.code, 'CLEANUP_FAILED')
  assert.ok(cleanupFailure.cleanupReceipts.some((receipt) => receipt.status === 'cleanup_failed'))
})

test('replay returns ARTIFACT_UNAVAILABLE without regeneration and runtime results are defensive copies', () => {
  const artifact = { id: 'deleted', storeId: 'fixture', contentHash: 'sha256:' + '1'.repeat(64), mediaType: 'image/png', role: 'generated', resolverId: 'fixture', availability: 'deleted' as const, retentionClass: 'fixture', redactionPolicy: 'hash-only' }
  const replay = replayArtifact(artifact)
  assert.equal(replay.code, 'ARTIFACT_UNAVAILABLE')
  const runtime = new OfflineExecutionRuntime()
  const result = runtime.execute(fixtureM5ExecutionInput())
  result.events[0].state = 'failed'
  const fetched = runtime.get(result.executionRun!.id)!
  assert.notEqual(fetched.events[0].state, 'failed')
})
